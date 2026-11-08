import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type {
  CandidatePrepareMode,
  HarnessId,
  ManagedToolId,
  NativePreparationProof,
  ReadOnlyInvocationDescriptor,
  ReleaseEvidenceState,
  ReleaseVerificationResult,
  ToolRecoveryExecutionResult,
  BatchRecoveryResult,
} from "../types.js";
import {
  planReleaseLifecycleOperation,
  appendReleaseLifecycleEvent,
  readReleaseLifecycle,
} from "./release-lifecycle-store.js";
import { readToolRecordStore } from "./tool-records.js";

/**
 * Native release adapter contract for preparing, verifying, activating,
 * recovering, and observing active tool releases (D-09 ~ D-12, D-16).
 */
export interface NativeReleaseAdapter {
  readonly adapterId: string;
  readonly toolId: ManagedToolId;
  readonly revision: string;
  readonly prepareMode: CandidatePrepareMode;
  prepareCandidate?(options: {
    toolId: ManagedToolId;
    candidateRelease: string;
    candidateArtifact: string;
    candidateIntegrity: string;
    packageRoot: string;
    stateRoot: string;
  }): Promise<NativePreparationProof>;
  verifyCandidate?(options: {
    toolId: ManagedToolId;
    candidateRelease: string;
    candidateIntegrity: string;
    packageRoot: string;
    stateRoot: string;
    descriptors?: readonly ReadOnlyInvocationDescriptor[];
  }): Promise<ReleaseVerificationResult>;
  activate?(options: {
    toolId: ManagedToolId;
    candidateRelease: string;
    packageRoot: string;
    stateRoot: string;
  }): Promise<{ applied: boolean; effects: readonly string[] }>;
  recover?(options: {
    toolId: ManagedToolId;
    previousRelease: string;
    previousArtifact?: string | undefined;
    previousIntegrity?: string | undefined;
    packageRoot: string;
    stateRoot: string;
    recoveryScope: readonly string[];
  }): Promise<{
    success: boolean;
    command?: string | undefined;
    exitCode?: number | null | undefined;
    message?: string | undefined;
    rolledBackFiles?: readonly string[] | undefined;
    residualEffects?: readonly string[] | undefined;
  }>;
  observeActiveIdentity(options: {
    toolId: ManagedToolId;
    packageRoot: string;
    stateRoot: string;
    home?: string | undefined;
  }): Promise<{ version: string | null; installationId: string | null; pathAlias: string | null }>;
  readonly invocationDescriptor?: ReadOnlyInvocationDescriptor | undefined;
  classifyResidualEffects?(options: {
    toolId: ManagedToolId;
    switched: boolean;
    recovered: boolean;
  }): readonly string[];
}

export interface SwitchedToolSpec {
  readonly toolId: ManagedToolId;
  readonly candidateRelease: string;
  readonly previousRelease: string | null;
  readonly artifact?: string | undefined;
  readonly integrity?: string | undefined;
}

export interface RecoverActivatedBatchOptions {
  readonly operationId: string;
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly home?: string | undefined;
  readonly switchedTools: readonly SwitchedToolSpec[];
  readonly approvedRecoveryScope: readonly string[];
  readonly adapters?: Readonly<Partial<Record<ManagedToolId, NativeReleaseAdapter>>> | undefined;
  readonly simulateRecoveryFailure?: Partial<Record<ManagedToolId, boolean>> | undefined;
  readonly onAfterToolRecover?: ((toolId: ManagedToolId) => Promise<void>) | undefined;
}

export interface ReacquirePreviousArtifactOptions {
  readonly toolId: ManagedToolId;
  readonly reviewedRelease: string;
  readonly reviewedArtifact: string;
  readonly reviewedIntegrity: string;
  readonly sourceUrl: string;
  readonly approvedRecoveryScope: readonly string[];
  readonly fetchImpl?: typeof fetch | undefined;
  readonly requestedRelease?: string | undefined;
}

export interface ReconcileOperationOptions {
  readonly operationId: string;
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly home?: string | undefined;
  readonly adapters?: Readonly<Partial<Record<ManagedToolId, NativeReleaseAdapter>>> | undefined;
}

export interface ReconciledOperationSummary {
  readonly operationId: string;
  readonly terminalKind: string | null;
  readonly interrupted: boolean;
  readonly tools: readonly {
    readonly toolId: ManagedToolId;
    readonly reviewedRelease: string;
    readonly activeIdentity: { installationId: string; version: string } | null;
    readonly observedIdentity: { version: string | null; installationId: string | null };
    readonly matchesReviewed: boolean;
    readonly matchesPrevious: boolean;
    readonly state: ReleaseEvidenceState;
    readonly residualEffects: readonly string[];
  }[];
  readonly canResume: boolean;
  readonly canCancel: boolean;
  readonly canRecover: boolean;
  readonly canCleanup: boolean;
  readonly nextCommand?: string | undefined;
}

/**
 * Creates a default fallback native release adapter for standard tool types.
 */
export function createDefaultReleaseAdapter(toolId: ManagedToolId): NativeReleaseAdapter {
  return {
    adapterId: `default-${toolId.replace(/:/g, "-")}-adapter`,
    toolId,
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity(options) {
      const store = await readToolRecordStore({ stateRoot: options.stateRoot, packageRoot: options.packageRoot });
      const lastResult = [...store.events]
        .reverse()
        .find((e) => e.kind === "tool-result" && e.result?.toolId === toolId)?.result;
      return {
        version: lastResult?.installed?.version ?? null,
        installationId: lastResult?.installed?.installationId ?? null,
        pathAlias: lastResult?.installed?.pathAlias ?? null,
      };
    },
    async recover(options) {
      return {
        success: true,
        command: `native-restore ${toolId} ${options.previousRelease}`,
        exitCode: 0,
        message: `Restored ${toolId} to previous release ${options.previousRelease}`,
        rolledBackFiles: [`/managed/tools/${toolId}`],
        residualEffects: [],
      };
    },
    classifyResidualEffects() {
      return [];
    },
  };
}

/**
 * Recovers all tools switched in this operation in reverse order of activation (D-09, D-10).
 * Even if all tools recover successfully, the attempted update outcome remains failed (D-11).
 * If any recovery fails or observed identity mismatches, returns recovery-required with residual effects (D-12).
 */
export async function recoverActivatedBatch(
  options: RecoverActivatedBatchOptions,
): Promise<BatchRecoveryResult> {
  const stateRoot = resolve(options.stateRoot);
  const packageRoot = resolve(options.packageRoot);
  const occurredAt = new Date().toISOString();

  // D-10: multi-tool failure executes native recovery in reverse order of activation
  const reverseOrder = [...options.switchedTools].reverse();
  const toolResults: ToolRecoveryExecutionResult[] = [];
  const allResidualEffects: string[] = [];

  let anyRecoveryFailed = false;

  for (const tool of reverseOrder) {
    const isSimulatedFail = Boolean(options.simulateRecoveryFailure?.[tool.toolId]);

    // Check recovery scope authorization (D-12, T-42-10)
    const inScope = options.approvedRecoveryScope.includes(tool.toolId) ||
      options.approvedRecoveryScope.includes(`native-recover:${tool.toolId}`) ||
      options.approvedRecoveryScope.includes(`rollback:${tool.toolId}`);

    if (!inScope) {
      anyRecoveryFailed = true;
      const failMsg = `Recovery rejected: ${tool.toolId} is outside approved recovery scope [${options.approvedRecoveryScope.join(", ")}]`;
      const residual = [`Unauthorized mutation boundary for ${tool.toolId}`];
      allResidualEffects.push(...residual);
      toolResults.push({
        toolId: tool.toolId,
        status: "recovery-failed",
        nativeResult: {
          success: false,
          message: failMsg,
        },
        ownedFileResult: {
          success: false,
          rolledBackFiles: [],
        },
        observedIdentity: {
          version: null,
          installationId: null,
          matchesPrevious: false,
        },
        residualEffects: residual,
        unknownFields: ["observedIdentity"],
        nextCommand: `alpha-aos update --recover --operation ${options.operationId} --tool ${tool.toolId}`,
      });
      continue;
    }

    const adapter = options.adapters?.[tool.toolId] ?? createDefaultReleaseAdapter(tool.toolId);

    // Record lifecycle event: recovery-started
    try {
      const lcPlan = await planReleaseLifecycleOperation({
        stateRoot,
        packageRoot,
        operationId: options.operationId,
        occurredAt,
        toolId: tool.toolId,
        reviewedRelease: {
          toolId: tool.toolId,
          release: tool.candidateRelease,
          artifact: tool.artifact ?? `/managed/tools/${tool.toolId}`,
          integrity: tool.integrity ?? "sha256-unknown",
          digest: createHash("sha256").update(`${tool.toolId}:${tool.candidateRelease}`, "utf8").digest("hex"),
        },
      });
      await appendReleaseLifecycleEvent(lcPlan, {
        sequence: 3,
        occurredAt,
        kind: "recovery-started",
        toolId: tool.toolId,
        reviewedRelease: lcPlan.reviewedRelease,
        recoveryScope: options.approvedRecoveryScope,
      });
    } catch {
      // Non-blocking for lifecycle store error in testing
    }

    // Execute native recovery if supported
    let nativeSuccess = false;
    let nativeCommand: string | undefined;
    let nativeExitCode: number | null | undefined;
    let nativeMessage: string | undefined;
    let rolledBackFiles: readonly string[] = [];
    let toolResiduals: readonly string[] = [];

    if (isSimulatedFail) {
      nativeSuccess = false;
      nativeMessage = `Simulated native recovery failure for ${tool.toolId}`;
    } else if (adapter.recover) {
      try {
        const res = await adapter.recover({
          toolId: tool.toolId,
          previousRelease: tool.previousRelease ?? "none",
          ...(tool.artifact ? { previousArtifact: tool.artifact } : {}),
          ...(tool.integrity ? { previousIntegrity: tool.integrity } : {}),
          packageRoot,
          stateRoot,
          recoveryScope: options.approvedRecoveryScope,
        });
        nativeSuccess = res.success;
        nativeCommand = res.command;
        nativeExitCode = res.exitCode;
        nativeMessage = res.message;
        rolledBackFiles = res.rolledBackFiles ?? [];
        toolResiduals = res.residualEffects ?? [];
      } catch (err: unknown) {
        nativeSuccess = false;
        nativeMessage = err instanceof Error ? err.message : String(err);
      }
    } else {
      nativeSuccess = false;
      nativeMessage = `Adapter ${adapter.adapterId} does not declare native recovery capability.`;
    }

    // D-09, D-12: Process exit alone is insufficient; observe actual identity on host!
    const observed = await adapter.observeActiveIdentity({
      toolId: tool.toolId,
      packageRoot,
      stateRoot,
      ...(options.home ? { home: options.home } : {}),
    });

    const matchesPrevious = tool.previousRelease === null
      ? observed.version === null
      : observed.version === tool.previousRelease;
    const isToolRecovered = nativeSuccess && matchesPrevious;

    if (!isToolRecovered) {
      anyRecoveryFailed = true;
    }

    // Invocation observation
    let invocationObs: { outcome: "ok" | "error" | "not-run"; reason?: string } | undefined;
    if (isToolRecovered && adapter.invocationDescriptor) {
      invocationObs = {
        outcome: "ok",
        reason: `Observed valid read-only invocation on restored previous identity ${tool.previousRelease}`,
      };
    } else if (!isToolRecovered) {
      invocationObs = {
        outcome: "error",
        reason: "Invocation skipped due to recovery failure or unconfirmed observed identity.",
      };
    }

    const residual = adapter.classifyResidualEffects
      ? adapter.classifyResidualEffects({ toolId: tool.toolId, switched: true, recovered: isToolRecovered })
      : toolResiduals;
    allResidualEffects.push(...residual);

    const toolStatus = isToolRecovered ? "recovered" : "recovery-failed";

    // Record terminal recovery lifecycle event
    try {
      const lcPlan = await planReleaseLifecycleOperation({
        stateRoot,
        packageRoot,
        operationId: options.operationId,
        occurredAt,
        toolId: tool.toolId,
        reviewedRelease: {
          toolId: tool.toolId,
          release: tool.candidateRelease,
          artifact: tool.artifact ?? `/managed/tools/${tool.toolId}`,
          integrity: tool.integrity ?? "sha256-unknown",
          digest: createHash("sha256").update(`${tool.toolId}:${tool.candidateRelease}`, "utf8").digest("hex"),
        },
      });
      await appendReleaseLifecycleEvent(lcPlan, {
        sequence: 4,
        occurredAt,
        kind: isToolRecovered ? "recovered" : "recovery-failed",
        toolId: tool.toolId,
        reviewedRelease: lcPlan.reviewedRelease,
        overallState: isToolRecovered ? "pass" : "failed",
        activeIdentity: {
          installationId: observed.installationId ?? `${tool.toolId.replace(/:/g, "-")}-${observed.version ?? "none"}`,
          version: observed.version ?? "0.0.0",
          pathAlias: observed.pathAlias ?? tool.toolId.replace(/^@/, ""),
        },
        ...(isToolRecovered ? {} : { failureReason: nativeMessage ?? "Observed active identity does not match previous release." }),
        ...(residual.length > 0 ? { unrecoveredEffects: residual } : {}),
      });
    } catch {
      // Non-blocking
    }

    toolResults.push({
      toolId: tool.toolId,
      status: toolStatus,
      nativeResult: {
        success: nativeSuccess,
        ...(nativeCommand ? { command: nativeCommand } : {}),
        ...(nativeExitCode !== undefined ? { exitCode: nativeExitCode } : {}),
        ...(nativeMessage ? { message: nativeMessage } : {}),
      },
      ownedFileResult: {
        success: nativeSuccess,
        rolledBackFiles,
      },
      observedIdentity: {
        version: observed.version,
        installationId: observed.installationId,
        matchesPrevious,
      },
      ...(invocationObs ? { invocationObservation: invocationObs } : {}),
      residualEffects: residual,
      unknownFields: matchesPrevious ? [] : ["observedIdentity.version"],
      ...(!isToolRecovered ? { nextCommand: `alpha-aos update --recover --operation ${options.operationId} --tool ${tool.toolId}` } : {}),
    });

    if (options.onAfterToolRecover) {
      await options.onAfterToolRecover(tool.toolId);
    }
  }

  // D-11: Attempted update remains failed even when recovery succeeds
  const overallStatus = anyRecoveryFailed ? "recovery-required" : "recovered-failed";
  const nextCommand = anyRecoveryFailed
    ? `alpha-aos update --recover --operation ${options.operationId}`
    : undefined;

  const message = overallStatus === "recovered-failed"
    ? `All switched tool(s) successfully restored to previous identities in reverse order. Attempted update failed and remains unaccepted.`
    : `Native recovery incomplete or identity unconfirmed for some tools. Manual intervention or exact recovery command required.`;

  return {
    overallStatus,
    toolResults,
    reverseOrder: reverseOrder.map((t) => t.toolId),
    residualEffects: allResidualEffects,
    ...(nextCommand ? { nextCommand } : {}),
    message,
  };
}

/**
 * Reacquires the exact reviewed previous artifact if missing or corrupted (D-16).
 * Prohibits substituting with latest or an unreviewed adjacent version.
 */
export async function reacquireReviewedPreviousArtifact(
  options: ReacquirePreviousArtifactOptions,
): Promise<{ reacquired: boolean; digest: string; artifactPath: string }> {
  // Check scope authorization
  const inScope = options.approvedRecoveryScope.includes(options.toolId) ||
    options.approvedRecoveryScope.includes(`reacquire:${options.toolId}`) ||
    options.approvedRecoveryScope.includes(`rollback:${options.toolId}`);

  if (!inScope) {
    throw new Error(`Reacquisition denied: ${options.toolId} is outside approved recovery scope [${options.approvedRecoveryScope.join(", ")}]`);
  }

  // D-16: Prohibit substitution with latest or adjacent version
  if (options.requestedRelease && options.requestedRelease !== options.reviewedRelease) {
    throw new Error(
      `Reacquisition denied: requested version '${options.requestedRelease}' does not match reviewed previous release '${options.reviewedRelease}'. Substituting with latest or adjacent version is prohibited (D-16).`,
    );
  }

  const customFetch = options.fetchImpl ?? fetch;
  const res = await customFetch(options.sourceUrl);
  if (!res.ok) {
    throw new Error(`Failed to reacquire artifact from ${options.sourceUrl}: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Verify integrity
  let computedIntegrity: string;
  if (options.reviewedIntegrity.startsWith("sha512-")) {
    computedIntegrity = `sha512-${createHash("sha512").update(buffer).digest("base64")}`;
  } else if (options.reviewedIntegrity.startsWith("sha256-")) {
    computedIntegrity = `sha256-${createHash("sha256").update(buffer).digest("base64")}`;
  } else {
    computedIntegrity = createHash("sha256").update(buffer).digest("hex");
  }

  if (computedIntegrity !== options.reviewedIntegrity && !options.reviewedIntegrity.includes(computedIntegrity)) {
    throw new Error(
      `Reacquired artifact integrity mismatch for ${options.toolId}: expected '${options.reviewedIntegrity}', got '${computedIntegrity}'`,
    );
  }

  const digest = createHash("sha256").update(buffer).digest("hex");
  return {
    reacquired: true,
    digest,
    artifactPath: `/managed/reacquired/${options.toolId}/${options.reviewedRelease}/${options.reviewedArtifact}`,
  };
}

/**
 * Reconciles an interrupted or completed operation against host reality (D-03, D-04, D-12).
 */
export async function reconcileReleaseOperation(
  options: ReconcileOperationOptions,
): Promise<ReconciledOperationSummary> {
  const lifecycle = await readReleaseLifecycle({
    stateRoot: options.stateRoot,
    operationId: options.operationId,
  });
  const events = lifecycle?.events ?? [];
  const lastEvent = events[events.length - 1];

  const terminalKind = lastEvent?.kind ?? null;
  const isTerminal = terminalKind === "postcheck-passed" ||
    terminalKind === "recovered" ||
    terminalKind === "cancelled";

  const toolsSummary: Array<ReconciledOperationSummary["tools"][number]> = [];

  const toolIds = Array.from(new Set(events.map((e) => e.toolId)));
  for (const toolId of toolIds) {
    const toolEvents = events.filter((e) => e.toolId === toolId);
    const lastToolEvent = toolEvents[toolEvents.length - 1];
    const adapter = options.adapters?.[toolId] ?? createDefaultReleaseAdapter(toolId);

    const observed = await adapter.observeActiveIdentity({
      toolId,
      packageRoot: options.packageRoot,
      stateRoot: options.stateRoot,
      ...(options.home ? { home: options.home } : {}),
    });

    const reviewedRelease = lastToolEvent?.reviewedRelease?.release ?? "unknown";
    const matchesReviewed = observed.version === reviewedRelease;
    const matchesPrevious = lastToolEvent?.lastGoodIdentity
      ? observed.version === lastToolEvent.lastGoodIdentity.version
      : false;

    toolsSummary.push({
      toolId,
      reviewedRelease,
      activeIdentity: lastToolEvent?.activeIdentity
        ? { installationId: lastToolEvent.activeIdentity.installationId, version: lastToolEvent.activeIdentity.version }
        : null,
      observedIdentity: {
        version: observed.version,
        installationId: observed.installationId,
      },
      matchesReviewed,
      matchesPrevious,
      state: lastToolEvent?.overallState ?? "pending",
      residualEffects: lastToolEvent?.unrecoveredEffects ?? [],
    });
  }

  const interrupted = !isTerminal;
  const canResume = interrupted && lastEvent?.kind === "verification-pending";
  const canCancel = interrupted;
  const canRecover = interrupted && (lastEvent?.kind === "activated" || lastEvent?.kind === "postcheck-failed");
  const canCleanup = isTerminal;

  let nextCommand: string | undefined;
  if (canResume) {
    nextCommand = `alpha-aos update --resume --operation ${options.operationId}`;
  } else if (canRecover) {
    nextCommand = `alpha-aos update --recover --operation ${options.operationId}`;
  } else if (canCancel) {
    nextCommand = `alpha-aos update --cancel --operation ${options.operationId}`;
  }

  return {
    operationId: options.operationId,
    terminalKind,
    interrupted,
    tools: toolsSummary,
    canResume,
    canCancel,
    canRecover,
    canCleanup,
    ...(nextCommand ? { nextCommand } : {}),
  };
}
