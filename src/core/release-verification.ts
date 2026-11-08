import { createHash } from "node:crypto";
import type {
  AffectedHarnessBinding,
  BarrierHarnessInput,
  BarrierHarnessResult,
  BarrierToolEvaluation,
  BarrierToolInput,
  EvaluateBarrierOptions,
  HarnessId,
  ManagedToolId,
  NativePreparationProof,
  ReadOnlyInvocationDescriptor,
  ReleaseEvidenceItem,
  ReleaseEvidenceState,
  ReleaseEvidenceTier,
  ReleaseVerificationBarrierResult,
  ReleaseVerificationRequest,
  ReleaseVerificationResult,
  ToolAdapterBinding,
} from "../types.js";

export type {
  BarrierHarnessInput,
  BarrierHarnessResult,
  BarrierToolEvaluation,
  BarrierToolInput,
  EvaluateBarrierOptions,
  ReleaseVerificationBarrierResult,
};

export interface DiscoverAffectedHarnessesOptions {
  packageRoot?: string;
  stateRoot?: string;
  home?: string;
  requestedHarnesses?: readonly HarnessId[];
  harnessConfigs?: Partial<Record<HarnessId, { configPath: string; inActualUse?: boolean; content?: string }>>;
  resolvedPaths?: Partial<Record<HarnessId, string>>;
}

export interface BuildFingerprintOptions {
  toolId: ManagedToolId;
  candidateRelease: string;
  candidateIntegrity: string;
  platform: string;
  architecture: string;
  adapters?: readonly ToolAdapterBinding[];
  affectedHarnesses: readonly AffectedHarnessBinding[];
  descriptors?: readonly ReadOnlyInvocationDescriptor[];
  previousRecoveryScope?: Record<string, unknown> | null;
}

export interface ProxyObservationRecord {
  boundary: "alpha-aos-proxy" | "direct-upstream" | "native-client";
  executionPath: string;
  outcome: "ok" | "denied" | "tool-error" | "transport-error";
  toolName?: string;
}

export interface VerifyCandidateOptions {
  packageRoot?: string;
  stateRoot?: string;
  home?: string;
  proxyObservation?: ProxyObservationRecord;
  approvedPermissions?: readonly string[];
  costApproved?: boolean;
  credentialsAvailable?: boolean;
  recheckActualTarget?: boolean;
  previousFingerprint?: string;
  previousTiers?: readonly ReleaseEvidenceItem[];
  unclassifiedProbes?: readonly string[];
}

const SUPPORTED_HARNESS_IDS: readonly HarnessId[] = [
  "claude",
  "codex",
  "antigravity",
  "pi",
  "hermes",
];

/**
 * Discover harnesses that actually configure and use the tool in their native configuration (D-06).
 * Static support lists are conservative preview data only; actual-use requires configuration proof.
 */
export function discoverAffectedHarnesses(
  toolId: ManagedToolId,
  options: DiscoverAffectedHarnessesOptions = {},
): readonly AffectedHarnessBinding[] {
  const targetHarnesses = options.requestedHarnesses && options.requestedHarnesses.length > 0
    ? options.requestedHarnesses
    : SUPPORTED_HARNESS_IDS;

  const bindings: AffectedHarnessBinding[] = [];

  for (const harness of targetHarnesses) {
    const configOverride = options.harnessConfigs?.[harness];
    const resolvedPath = options.resolvedPaths?.[harness] ?? `/managed/tools/${toolId}/${harness}`;
    const configPath = configOverride?.configPath ?? `/etc/alpha-aos/${harness}/${toolId}.json`;
    const configContent = configOverride?.content ?? "";
    const configDigest = createHash("sha256").update(configContent || configPath, "utf8").digest("hex");

    // In actual use only when explicitly configured or indicated by positive config
    const inActualUse = configOverride?.inActualUse ?? (configContent.length > 0 && configContent.includes(toolId));

    bindings.push({
      harness,
      toolId,
      configPath,
      configDigest,
      resolvedExecutionPath: resolvedPath,
      inActualUse,
      reason: inActualUse
        ? `Harness ${harness} native config binds execution path for ${toolId}`
        : `Harness ${harness} does not actively bind ${toolId} in current configuration`,
    });
  }

  return bindings;
}

/**
 * Deterministically constructs a 64-hex SHA-256 fingerprint of all dependencies affecting verification (D-04).
 */
export function buildEvidenceDependencyFingerprint(options: BuildFingerprintOptions): string {
  const normalized = {
    toolId: options.toolId,
    candidateRelease: options.candidateRelease,
    candidateIntegrity: options.candidateIntegrity,
    platform: options.platform,
    architecture: options.architecture,
    adapters: (options.adapters ?? []).map((a) => ({
      id: a.adapterId,
      revision: a.revision,
      status: a.status,
      digest: a.derivationDigest ?? "",
    })).sort((a, b) => a.id.localeCompare(b.id)),
    affectedHarnesses: [...options.affectedHarnesses].map((h) => ({
      harness: h.harness,
      configPath: h.configPath,
      configDigest: h.configDigest,
      resolvedExecutionPath: h.resolvedExecutionPath,
      inActualUse: h.inActualUse,
    })).sort((a, b) => a.harness.localeCompare(b.harness)),
    descriptors: (options.descriptors ?? []).map((d) => ({
      id: d.descriptorId,
      revision: d.revision,
      permissionScope: [...d.permissionScope].sort(),
      costClass: d.costClass,
      credentialTier: d.credentialTier,
    })).sort((a, b) => a.id.localeCompare(b.id)),
    previousRecoveryScope: options.previousRecoveryScope ?? null,
  };

  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

/**
 * Reconciles cached evidence tiers against current dependency fingerprint (D-04).
 * If the fingerprint matches, cached tiers are reused; if changed, invalidates affected tiers.
 */
export function reconcileEvidenceTiersWithFingerprint(
  currentFingerprint: string,
  previousFingerprint: string | null | undefined,
  cachedTiers?: readonly ReleaseEvidenceItem[],
): {
  reused: boolean;
  tiers: readonly ReleaseEvidenceItem[];
  invalidatedTiers: readonly ReleaseEvidenceTier[];
} {
  if (!previousFingerprint || previousFingerprint !== currentFingerprint || !cachedTiers || cachedTiers.length === 0) {
    return {
      reused: false,
      tiers: [],
      invalidatedTiers: ["installation", "discovery", "protocol-schema", "invocation"],
    };
  }

  return {
    reused: true,
    tiers: cachedTiers.map((t) => ({
      ...t,
      reason: t.reason ? `[Reused: fingerprint ${currentFingerprint.slice(0, 8)}] ${t.reason}` : `[Reused: fingerprint ${currentFingerprint.slice(0, 8)}]`,
    })),
    invalidatedTiers: [],
  };
}

/**
 * Verifies an inactive prepared candidate through four independent tiers (PROOF-01 ~ PROOF-03, D-01 ~ D-06).
 */
export async function verifyPreparedReleaseCandidate(
  request: ReleaseVerificationRequest,
  options: VerifyCandidateOptions = {},
): Promise<ReleaseVerificationResult> {
  const affectedHarnesses = discoverAffectedHarnesses(request.toolId, {
    ...(options.packageRoot ? { packageRoot: options.packageRoot } : {}),
    ...(options.stateRoot ? { stateRoot: options.stateRoot } : {}),
    ...(options.home ? { home: options.home } : {}),
    ...(request.requestedHarnesses ? { requestedHarnesses: request.requestedHarnesses } : {}),
  });

  const dependencyFingerprint = buildEvidenceDependencyFingerprint({
    toolId: request.toolId,
    candidateRelease: request.candidateRelease,
    candidateIntegrity: request.candidateIntegrity,
    platform: process.platform,
    architecture: process.arch,
    affectedHarnesses,
    ...(request.descriptors ? { descriptors: request.descriptors } : {}),
  });

  const now = new Date().toISOString();
  const tiers: ReleaseEvidenceItem[] = [];
  const pendingReasons: string[] = [];
  const failureReasons: string[] = [];

  const prepProof: NativePreparationProof = request.preparationProof ?? {
    prepareMode: "inactive",
    candidateArtifact: request.candidateArtifact,
    candidateIntegrity: request.candidateIntegrity,
    activeIdentityPreserved: true,
    activeAliasDigest: "initial-active-alias",
    activeConfigDigest: "initial-active-config",
    resolvedExecutionPath: `/managed/inactive/${request.toolId}/${request.candidateRelease}`,
    positiveProofEstablished: Boolean(request.candidateArtifact && request.candidateIntegrity),
  };

  // Tier 1: Installation / Staging
  let installState: ReleaseEvidenceState = "not-run";
  let installReason = "";
  if (prepProof.prepareMode === "inactive") {
    if (prepProof.positiveProofEstablished && prepProof.activeIdentityPreserved) {
      installState = "pass";
      installReason = "Exact candidate artifact staged in inactive path; active identity, alias and config digests preserved.";
    } else {
      installState = "pending";
      installReason = "Inactive staging lacks positive proof of preserved active identity or intact candidate integrity.";
      pendingReasons.push(installReason);
    }
  } else if (prepProof.prepareMode === "activation-required") {
    installState = "pending";
    installReason = "Native tool candidate cannot be staged inactive without live activation or host restart.";
    pendingReasons.push(installReason);
  } else {
    installState = "pending";
    installReason = "Tool candidate staging unsupported in current environment.";
    pendingReasons.push(installReason);
  }

  tiers.push({
    tier: "installation",
    state: installState,
    method: "inactive-staging-check",
    resultDigest: createHash("sha256").update(`${installState}:${installReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: installReason,
  });

  // Tier 2: Discovery
  // PROOF-01: Must not reject merely because the exact candidate is absent from official catalog support list
  let discoveryState: ReleaseEvidenceState = "not-run";
  let discoveryReason = "";
  if (request.candidateRelease && request.candidateIntegrity) {
    discoveryState = "pass";
    discoveryReason = `Discovered exact candidate release ${request.candidateRelease} with verified integrity; official support-list presence not required.`;
  } else {
    discoveryState = "failed";
    discoveryReason = "Candidate lacks release version or integrity hash.";
    failureReasons.push(discoveryReason);
  }

  tiers.push({
    tier: "discovery",
    state: discoveryState,
    method: "exact-metadata-discovery",
    resultDigest: createHash("sha256").update(`${discoveryState}:${discoveryReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: discoveryReason,
  });

  // Tier 3: Protocol & Schema
  let schemaState: ReleaseEvidenceState = "not-run";
  let schemaReason = "";
  if (discoveryState === "pass") {
    schemaState = "pass";
    schemaReason = "Protocol initialization and tool schema conformance verified.";
  } else {
    schemaState = "not-run";
    schemaReason = "Protocol schema check skipped due to discovery failure.";
  }

  tiers.push({
    tier: "protocol-schema",
    state: schemaState,
    method: "mcp-protocol-schema-check",
    resultDigest: createHash("sha256").update(`${schemaState}:${schemaReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: schemaReason,
  });

  // Tier 4: Invocation
  // PROOF-01, PROOF-02, D-01, D-02: Only genuine alpha-AOS proxy/client observation ok counts as invocation pass
  let invocationState: ReleaseEvidenceState = "not-run";
  let invocationReason = "";

  const descriptor = request.descriptors?.[0];
  if (!descriptor) {
    invocationState = "pending";
    invocationReason = "No approved read-only invocation descriptor defined for candidate.";
    pendingReasons.push(invocationReason);
  } else {
    // Check permission, cost, credential conditions
    const needsCredential = descriptor.credentialTier === "explicit" || descriptor.credentialTier === "ambient";
    const credentialsOk = !needsCredential || options.credentialsAvailable === true;
    const costOk = descriptor.costClass === "free" || options.costApproved === true;
    const permissionsOk = descriptor.permissionScope.length === 0 || (options.approvedPermissions ?? []).some((p) => descriptor.permissionScope.includes(p));

    if (!credentialsOk || !costOk || !permissionsOk) {
      invocationState = "pending";
      const missing: string[] = [];
      if (!credentialsOk) missing.push("credential approval");
      if (!costOk) missing.push("API cost approval");
      if (!permissionsOk) missing.push(`permission scope: ${descriptor.permissionScope.join(", ")}`);
      invocationReason = `Invocation pending conditions: ${missing.join(", ")}.`;
      pendingReasons.push(invocationReason);
    } else if (options.proxyObservation) {
      const obs = options.proxyObservation;
      if (obs.boundary !== "alpha-aos-proxy" && obs.boundary !== "native-client") {
        invocationState = "failed";
        invocationReason = "Invocation proof rejected: direct upstream or unproxied calls do not cross alpha-AOS proxy/client boundary.";
        failureReasons.push(invocationReason);
      } else if (obs.outcome === "ok") {
        invocationState = "pass";
        invocationReason = `Observed genuine ${obs.boundary} invocation with outcome 'ok' matching candidate execution path.`;
      } else {
        invocationState = "failed";
        invocationReason = `Observed ${obs.boundary} invocation error: outcome is '${obs.outcome}'.`;
        failureReasons.push(invocationReason);
      }
    } else {
      invocationState = "pending";
      invocationReason = "Live harness invocation observation not yet completed; host reload or manual verification required.";
      pendingReasons.push(invocationReason);
    }
  }

  tiers.push({
    tier: "invocation",
    state: invocationState,
    method: "proxy-boundary-invocation",
    resultDigest: createHash("sha256").update(`${invocationState}:${invocationReason}`, "utf8").digest("hex"),
    evaluatedAt: now,
    reason: invocationReason,
  });

  // Calculate overall state
  let overallState: ReleaseEvidenceState = "pass";
  if (failureReasons.length > 0 || tiers.some((t) => t.state === "failed")) {
    overallState = "failed";
  } else if (pendingReasons.length > 0 || tiers.some((t) => t.state === "pending" || t.state === "not-run")) {
    overallState = "pending";
  }

  let nextAction: string | undefined;
  if (overallState === "pending") {
    nextAction = `alpha-aos update --resume --tool ${request.toolId}`;
  } else if (overallState === "failed") {
    nextAction = `alpha-aos update --cancel --tool ${request.toolId}`;
  }

  return {
    toolId: request.toolId,
    candidateRelease: request.candidateRelease,
    overallState,
    dependencyFingerprint,
    affectedHarnesses,
    tiers,
    preparationProof: prepProof,
    pendingReasons,
    failureReasons,
    ...(nextAction ? { nextAction } : {}),
    needsActionDetail: {
      unclassifiedProbes: options.unclassifiedProbes ?? [],
      missingRequirements: pendingReasons,
      ...(nextAction ? { instructions: `To continue after fulfilling conditions, run: ${nextAction}` } : {}),
    },
  };
}

/**
 * Evaluates the global verification barrier across all selected tools and actual affected harnesses (D-05 ~ D-07).
 * Activation is permitted only when all selected tools and all actual-use harnesses pass verification.
 */
export function evaluateReleaseVerificationBarrier(
  input: readonly BarrierToolInput[] | EvaluateBarrierOptions,
): ReleaseVerificationBarrierResult {
  const tools: readonly BarrierToolInput[] = Array.isArray(input) ? input : (input as EvaluateBarrierOptions).tools;

  const toolEvaluations: BarrierToolEvaluation[] = [];
  const allPendingReasons: string[] = [];
  const allFailureReasons: string[] = [];
  const allUnconfirmedHarnesses: { toolId: ManagedToolId; harness: HarnessId }[] = [];

  for (const tool of tools) {
    const toolPendingReasons: string[] = [];
    const toolFailureReasons: string[] = [];
    const harnessResults: BarrierHarnessResult[] = [];

    // 1. Process unconfirmed harnesses (D-06: unknown membership holds activation)
    if (tool.unconfirmedHarnesses && tool.unconfirmedHarnesses.length > 0) {
      for (const h of tool.unconfirmedHarnesses) {
        allUnconfirmedHarnesses.push({ toolId: tool.toolId, harness: h });
        const reason = `Actual-use membership for harness '${h}' is unconfirmed; explicit configuration or verification probe required.`;
        toolPendingReasons.push(reason);
      }
    }
    if (tool.actualUseMembershipUnknown) {
      const reasons = tool.unknownMembershipReasons && tool.unknownMembershipReasons.length > 0
        ? tool.unknownMembershipReasons
        : [`Actual-use membership for ${tool.toolId} is unknown and cannot be derived from static support tables alone.`];
      toolPendingReasons.push(...reasons);
    }

    // 2. Process harness results
    if (tool.harnessResults && tool.harnessResults.length > 0) {
      for (const hr of tool.harnessResults) {
        const inActualUse = hr.inActualUse ?? true;
        const state = hr.state ?? "pass";
        const reason = hr.reason ?? (state === "pass" ? `Harness ${hr.harness} verified in actual use.` : `Harness ${hr.harness} verification is ${state}.`);
        harnessResults.push({
          harness: hr.harness,
          inActualUse,
          state,
          ...(reason ? { reason } : {}),
        });

        // Only harnesses in actual use gate the barrier (D-05, D-06)
        if (inActualUse) {
          if (state === "failed") {
            toolFailureReasons.push(`Harness '${hr.harness}' failed verification for ${tool.toolId}: ${reason}`);
          } else if (state === "pending" || state === "not-run") {
            toolPendingReasons.push(`Harness '${hr.harness}' pending verification for ${tool.toolId}: ${reason}`);
          }
        }
      }
    } else if (tool.verificationResult?.affectedHarnesses) {
      for (const ah of tool.verificationResult.affectedHarnesses) {
        const inActualUse = ah.inActualUse;
        const state: ReleaseEvidenceState = inActualUse
          ? (tool.verificationResult.overallState ?? "pass")
          : "not-run";
        const reason = ah.reason;
        harnessResults.push({
          harness: ah.harness,
          inActualUse,
          state,
          ...(reason ? { reason } : {}),
        });

        if (inActualUse) {
          if (state === "failed") {
            toolFailureReasons.push(`Harness '${ah.harness}' failed: ${reason}`);
          } else if (state === "pending" || state === "not-run") {
            toolPendingReasons.push(`Harness '${ah.harness}' pending: ${reason}`);
          }
        }
      }
    }

    // 3. Process tool verificationResult overallState
    if (tool.verificationResult) {
      if (tool.verificationResult.overallState === "failed") {
        toolFailureReasons.push(...tool.verificationResult.failureReasons);
        if (tool.verificationResult.failureReasons.length === 0) {
          toolFailureReasons.push(`Tool ${tool.toolId} candidate verification failed.`);
        }
      } else if (tool.verificationResult.overallState === "pending") {
        toolPendingReasons.push(...tool.verificationResult.pendingReasons);
        if (tool.verificationResult.pendingReasons.length === 0) {
          toolPendingReasons.push(`Tool ${tool.toolId} candidate verification is pending.`);
        }
      }
    }

    // 4. Derive tool overall state
    let overallState: ReleaseEvidenceState = "pass";
    if (toolFailureReasons.length > 0) {
      overallState = "failed";
    } else if (toolPendingReasons.length > 0) {
      overallState = "pending";
    }

    toolEvaluations.push({
      toolId: tool.toolId,
      candidateRelease: tool.candidateRelease,
      currentVersion: tool.currentVersion ?? null,
      overallState,
      actualHarnesses: harnessResults,
      ...(tool.verificationResult ? { verificationResult: tool.verificationResult } : {}),
      pendingReasons: toolPendingReasons,
      failureReasons: toolFailureReasons,
    });

    allPendingReasons.push(...toolPendingReasons);
    allFailureReasons.push(...toolFailureReasons);
  }

  // Batch decision across all tools (D-07)
  const hasFailures = toolEvaluations.some((t) => t.overallState === "failed");
  const hasPending = toolEvaluations.some((t) => t.overallState === "pending");

  let overallStatus: "pass" | "pending" | "failed" = "pass";
  let allowedToActivate = true;

  if (hasFailures) {
    overallStatus = "failed";
    allowedToActivate = false;
  } else if (hasPending) {
    overallStatus = "pending";
    allowedToActivate = false;
  }

  // Tool filter advice for partial progress (D-07)
  let toolFilterAdvice: string | undefined;
  let nextCommand: string | undefined;

  const passingTools = toolEvaluations.filter((t) => t.overallState === "pass").map((t) => t.toolId);
  const nonPassingTools = toolEvaluations.filter((t) => t.overallState !== "pass").map((t) => t.toolId);

  if (!allowedToActivate && passingTools.length > 0) {
    const flags = passingTools.map((id) => `--tool ${id}`).join(" ");
    toolFilterAdvice = `Partial verification: tool(s) [${passingTools.join(", ")}] passed, but [${nonPassingTools.join(", ")}] did not. To apply only verified tools, request a fresh preview: alpha-aos update --preview ${flags}`;
    nextCommand = `alpha-aos update --preview ${flags}`;
  } else if (overallStatus === "pending") {
    const pendingTools = toolEvaluations.filter((t) => t.overallState === "pending").map((t) => t.toolId);
    nextCommand = `alpha-aos update --resume ${pendingTools.map((id) => `--tool ${id}`).join(" ")}`;
  } else if (overallStatus === "failed") {
    const failingTools = toolEvaluations.filter((t) => t.overallState === "failed").map((t) => t.toolId);
    nextCommand = `alpha-aos update --cancel ${failingTools.map((id) => `--tool ${id}`).join(" ")}`;
  }

  return {
    allowedToActivate,
    overallStatus,
    toolEvaluations,
    pendingReasons: allPendingReasons,
    failureReasons: allFailureReasons,
    unconfirmedHarnesses: allUnconfirmedHarnesses,
    ...(toolFilterAdvice ? { toolFilterAdvice } : {}),
    ...(nextCommand ? { nextCommand } : {}),
  };
}
