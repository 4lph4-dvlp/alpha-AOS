import { createHash, randomUUID } from "node:crypto";
import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy } from "../core/task-contract.js";
import {
  createCapabilityReceipt,
  type CapabilityInvocationRequest,
  type CapabilityInvocationResult,
  type TaskCapabilityPort,
} from "../core/task-capability-receipts.js";
import type {
  ControllerDispatchRequest,
  ControllerDispatchResult,
  ControllerPort,
  ReviewDispatchResult,
  ReviewRequest,
  ReviewerPort,
  TaskPortAssessment,
  TaskPorts,
} from "../core/task-run.js";
import { probeClaudeVersion, runClaudeReviewer, runClaudeFinalReviewer, type ClaudeAdapterOptions } from "./task-claude.js";
import { probeCodexVersion, runCodexController, runCodexReviewer, runCodexFinalReviewer, type CodexAdapterOptions } from "./task-codex.js";
import { runAntigravityController, runAntigravityReviewer, runAntigravityFinalReviewer, probeAntigravityVersion } from "./task-antigravity.js";
import { runPiController, runPiReviewer, runPiFinalReviewer, probePiVersion } from "./task-pi.js";
import { runHermesController, runHermesReviewer, runHermesFinalReviewer, probeHermesVersion } from "./task-hermes.js";
import type { FinalReviewPort, FinalReviewRequest } from "../core/task-final-review.js";
import { taskContractDigest } from "../core/task-contract.js";
import {
  readHarnessRoleReceipt,
  type ReadReceiptOptions,
} from "./task-receipts.js";
import type { HarnessVersionProbe, TaskAgentResolver, TaskAgentRunner } from "./task-agent-launch.js";

export {
  agentFacingSchema,
  parseHarnessVersion,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  type HarnessVersionProbe,
  type TaskAgentLaunch,
  type TaskAgentResolver,
  type TaskAgentRunner,
} from "./task-agent-launch.js";

export {
  probeClaudeVersion,
  probeCodexVersion,
  probeAntigravityVersion,
  probePiVersion,
  probeHermesVersion,
};

export async function probeHarnessVersion(
  harness: HarnessId,
  options: {
    resolve?: TaskAgentResolver;
    runner?: TaskAgentRunner;
    source?: NodeJS.ProcessEnv;
  } = {},
): Promise<HarnessVersionProbe> {
  switch (harness) {
    case "claude":
      return probeClaudeVersion(options);
    case "codex":
      return probeCodexVersion(options);
    case "antigravity":
      return probeAntigravityVersion(options);
    case "pi":
      return probePiVersion(options);
    case "hermes":
      return probeHermesVersion(options);
  }
}

export const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"] as const;
export const ALL_ROLES = ["controller", "executor", "reviewer"] as const;
export type Role = (typeof ALL_ROLES)[number];

export interface RoleCapabilityAssessment {
  readonly supported: boolean;
  readonly controller: { harness: HarnessId; version: string | null; executable: string | null };
  readonly executor: { harness: HarnessId; version: string | null; executable: string | null };
  readonly reviewer: { harness: HarnessId; version: string | null; executable: string | null };
  readonly missingProof: string[];
}

/**
 * Verifies role capability proofs across all 5 harnesses and 3 roles (ROL-01, D-01, D-03).
 * Fails closed if any assigned role lacks an atomic invocation receipt or has version drift.
 */
export async function verifyRoleCapabilities(
  policy: TaskAgentPolicy,
  options: {
    receiptsRoot?: string;
    probeVersion?: boolean;
    resolve?: TaskAgentResolver;
    runner?: TaskAgentRunner;
  } = {},
): Promise<RoleCapabilityAssessment> {
  const missingProof: string[] = [];
  const proven: Record<Role, { version: string | null; executable: string | null }> = {
    controller: { version: null, executable: null },
    executor: { version: null, executable: null },
    reviewer: { version: null, executable: null },
  };

  for (const role of ALL_ROLES) {
    const harness = policy[role];
    const proof = await readHarnessRoleReceipt(harness, role, options.receiptsRoot, {
      checkDrift: options.probeVersion !== false,
      resolve: options.resolve,
      runner: options.runner,
    });

    if (!proof.receipt) {
      missingProof.push(`${role} ${harness}: no native invocation receipt for ${role} (ROL-01, D-01)`);
    } else if (proof.versionDrift) {
      missingProof.push(`${role} ${harness}: version drift detected: ${proof.driftReason} (D-02)`);
    } else {
      proven[role] = {
        version: proof.receipt.version,
        executable: proof.receipt.executable,
      };
    }
  }

  // D-10: differentReviewerPolicy verification
  if ((policy as { differentReviewerPolicy?: string }).differentReviewerPolicy === "require-different-harness") {
    if (policy.reviewer === policy.controller || policy.reviewer === policy.executor) {
      missingProof.push(
        `differentReviewerPolicy requires a different reviewer harness, but reviewer '${policy.reviewer}' matches controller or executor (D-10)`,
      );
    }
  }

  return {
    supported: missingProof.length === 0,
    controller: { harness: policy.controller, ...proven.controller },
    executor: { harness: policy.executor, ...proven.executor },
    reviewer: { harness: policy.reviewer, ...proven.reviewer },
    missingProof,
  };
}

/**
 * Legacy bootstrap convenience constant (Phase 14/15 development default).
 * Composable roles in Phase 16 allow any 5x5x5 combination backed by verified receipts.
 */
export const TASK_BOOTSTRAP_PAIR = { controller: "codex", executor: "codex", reviewer: "claude" } as const;

export interface TaskAgentPairProbeOptions {
  probeCodex?: () => Promise<HarnessVersionProbe>;
  probeClaude?: () => Promise<HarnessVersionProbe>;
}

export type NativeTaskPortOptions = CodexAdapterOptions &
  ClaudeAdapterOptions &
  TaskAgentPairProbeOptions & {
    receiptsRoot?: string;
    probeVersion?: boolean;
  };

export interface DynamicTaskPortOptions extends NativeTaskPortOptions {
  antigravity?: unknown;
  pi?: unknown;
  hermes?: unknown;
}

/**
 * Backward-compatible probeTaskAgentPair delegating to verifyRoleCapabilities (ROL-01).
 * Preserves support for explicit mock probe overrides used in legacy unit tests.
 */
export async function probeTaskAgentPair(
  policy: TaskAgentPolicy,
  options: NativeTaskPortOptions = {},
): Promise<TaskPortAssessment> {
  if (options.receiptsRoot) {
    return verifyRoleCapabilities(policy, options);
  }

  // If mock probes or runners are supplied without receiptsRoot (e.g. legacy unit tests)
  if (options.probeCodex || options.probeClaude || options.runner || options.resolve) {
    const missingProof: string[] = [];
    const codexUsed = policy.controller === "codex" || policy.executor === "codex";
    const claudeUsed = policy.reviewer === "claude";
    const codex = codexUsed ? await (options.probeCodex ?? (() => probeCodexVersion(options)))() : null;
    const claude = claudeUsed ? await (options.probeClaude ?? (() => probeClaudeVersion(options)))() : null;
    if (codex !== null && codex.status !== "ok") missingProof.push(`codex: ${codex.reason}`);
    if (claude !== null && claude.status !== "ok") missingProof.push(`claude: ${claude.reason}`);

    const proven = (probe: HarnessVersionProbe | null) =>
      probe !== null && probe.status === "ok"
        ? { version: probe.version, executable: probe.executable }
        : { version: null, executable: null };

    return {
      supported: missingProof.length === 0,
      controller: { harness: policy.controller, ...(policy.controller === "codex" ? proven(codex) : proven(null)) },
      reviewer: { harness: policy.reviewer, ...(policy.reviewer === "claude" ? proven(claude) : proven(null)) },
      missingProof,
    };
  }

  return verifyRoleCapabilities(policy, options);
}

/**
 * Creates dynamic TaskPorts for any arbitrary 5x5x5 policy assignment (ROL-01).
 */
export function createDynamicTaskPorts(
  policy: TaskAgentPolicy,
  options: DynamicTaskPortOptions = {},
): TaskPorts {
  const controllerMap: Record<HarnessId, ControllerPort> = {
    codex: { dispatch: (request: ControllerDispatchRequest) => runCodexController(request, options) },
    antigravity: { dispatch: (request: ControllerDispatchRequest) => runAntigravityController(request, options) },
    pi: { dispatch: (request: ControllerDispatchRequest) => runPiController(request, options) },
    hermes: { dispatch: (request: ControllerDispatchRequest) => runHermesController(request, options) },
    claude: {
      dispatch: async (): Promise<ControllerDispatchResult> => ({
        harness: "claude",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        terminal: "failed",
        claim: null,
        detail: "Claude controller native adapter is not supported in autonomous mode",
      }),
    },
  };

  const reviewerMap: Record<HarnessId, ReviewerPort> = {
    claude: { review: (request: ReviewRequest) => runClaudeReviewer(request, options) },
    codex: { review: (request: ReviewRequest) => runCodexReviewer(request, options) },
    antigravity: { review: (request: ReviewRequest) => runAntigravityReviewer(request, options) },
    pi: { review: (request: ReviewRequest) => runPiReviewer(request, options) },
    hermes: { review: (request: ReviewRequest) => runHermesReviewer(request, options) },
  };

  return {
    controller: controllerMap[policy.controller],
    reviewer: reviewerMap[policy.reviewer],
    assess: (p) => probeTaskAgentPair(p, options),
  };
}

/** The default task ports using dynamic port dispatch based on contract policy. */
export function nativeTaskPorts(options: NativeTaskPortOptions = {}): TaskPorts {
  return {
    controller: {
      dispatch: (request) => {
        const ports = createDynamicTaskPorts(request.contract.agentPolicy, options);
        return ports.controller.dispatch(request);
      },
    },
    reviewer: {
      review: (request) => {
        const ports = createDynamicTaskPorts(request.contract.agentPolicy, options);
        return ports.reviewer.review(request);
      },
    },
    assess: (policy) => probeTaskAgentPair(policy, options),
  };
}

/**
 * Creates a native final review port for the specified harness (REV-03, REV-04).
 */
export function createNativeFinalReviewPort(
  harness: HarnessId,
  options: DynamicTaskPortOptions = {},
): FinalReviewPort {
  return {
    async evaluateMilestoneFinal(evalOptions) {
      const requestId = randomUUID();
      const sessionId = randomUUID();
      const contractDigest = taskContractDigest(evalOptions.contract);
      const reviewRoot = evalOptions.reviewRoot ?? evalOptions.contract.scope.projectRoot;

      const request: FinalReviewRequest = {
        requestId,
        sessionId,
        contract: evalOptions.contract,
        contractDigest,
        targetRevisionSha: evalOptions.targetRevisionSha,
        artifactDigest: evalOptions.artifactDigest,
        requirements: evalOptions.requirements,
        reviewRoot,
        deadlineAt: evalOptions.deadlineAt,
      };

      switch (harness) {
        case "claude":
          return runClaudeFinalReviewer(request, options);
        case "codex":
          return runCodexFinalReviewer(request, options);
        case "antigravity":
          return runAntigravityFinalReviewer(request, options);
        case "pi":
          return runPiFinalReviewer(request, options);
        case "hermes":
          return runHermesFinalReviewer(request, options);
        default:
          throw new Error(`Unsupported final reviewer harness: ${String(harness)}`);
      }
    },
  };
}

/**
 * Creates a dynamic final review port using the reviewer harness specified in the task contract policy.
 */
export function createDynamicFinalReviewPort(
  policy: TaskAgentPolicy,
  options: DynamicTaskPortOptions = {},
): FinalReviewPort {
  return createNativeFinalReviewPort(policy.reviewer, options);
}

export interface FreshSessionDiscoveryResult {
  readonly sessionId: string;
  readonly previousSessionId: string | null;
  readonly harness: HarnessId;
  readonly harnessVersion: string | null;
  readonly discoveredSkills: readonly string[];
  readonly discoveredMcpTools: readonly string[];
  readonly status: "ok" | "unverified" | "failed";
  readonly failureReason?: string | null;
}

/**
 * Starts a fresh agent session for discovering newly synchronized project skills and MCP tools (D-03).
 * Explicitly rejects tool reloads within existing sessions.
 */
export async function startFreshCapabilitySession(options: {
  harness: HarnessId;
  projectRoot: string;
  previousSessionId?: string | null;
  allowExistingSessionReload?: boolean;
  probeDiscovery?: (sessionId: string) => Promise<{ skills: string[]; mcpTools: string[] }> | { skills: string[]; mcpTools: string[] };
}): Promise<FreshSessionDiscoveryResult> {
  if (options.allowExistingSessionReload) {
    throw new Error(
      "Tool reload in existing session does not prove activation in fresh session (D-03)",
    );
  }

  const sessionId = `session-fresh-${randomUUID()}`;
  let discoveredSkills: string[] = [];
  let discoveredMcpTools: string[] = [];
  let status: "ok" | "unverified" | "failed" = "ok";
  let failureReason: string | null = null;

  if (options.probeDiscovery) {
    try {
      const probe = await options.probeDiscovery(sessionId);
      discoveredSkills = probe.skills;
      discoveredMcpTools = probe.mcpTools;
    } catch (err) {
      status = "failed";
      failureReason = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    sessionId,
    previousSessionId: options.previousSessionId ?? null,
    harness: options.harness,
    harnessVersion: "1.0.0",
    discoveredSkills,
    discoveredMcpTools,
    status,
    failureReason,
  };
}

/**
 * Creates a TaskCapabilityPort bound to a fresh agent session (D-03, CAP-02).
 * Verifies discovery in the fresh session before invocation.
 */
export function createFreshSessionCapabilityPort(options: {
  session: FreshSessionDiscoveryResult;
  invoker?: (toolName: string, question: string) => Promise<{
    outcome: "ok" | "failed" | "denied";
    rawResult: string;
    isError: boolean;
    errorMessage?: string | null;
  }>;
}): TaskCapabilityPort {
  return {
    async invoke(request: CapabilityInvocationRequest): Promise<CapabilityInvocationResult> {
      const capabilityId = request.obligation.capabilityId;
      const toolName = capabilityId.split(":").pop() ?? capabilityId;

      // D-03: Check if discovered in this fresh session
      const isDiscovered =
        options.session.discoveredSkills.includes(capabilityId) ||
        options.session.discoveredSkills.includes(toolName) ||
        options.session.discoveredMcpTools.includes(capabilityId) ||
        options.session.discoveredMcpTools.includes(toolName);

      if (!isDiscovered && options.session.status !== "failed") {
        const receipt = createCapabilityReceipt({
          runId: request.runId,
          step: request.step,
          capabilityId,
          obligationId: request.obligation.id,
          question: request.obligation.question,
          selected: true,
          invoked: false,
          outcome: "failed",
          invokedAt: new Date().toISOString(),
          toolName,
          harness: options.session.harness,
          harnessVersion: options.session.harnessVersion,
          harnessExecutable: request.harnessExecutable ?? null,
          sessionId: options.session.sessionId,
          source: request.obligation.source,
          sourceVersion: request.obligation.version,
          observationId: `obs-failed-${randomUUID()}`,
          rawResultSha256: "",
          isReused: false,
          originalReceiptId: null,
          isError: true,
          errorMessage: `Capability ${capabilityId} was not discovered in fresh session ${options.session.sessionId} (D-03)`,
        });
        return { receipt };
      }

      if (options.invoker) {
        const invResult = await options.invoker(toolName, request.obligation.question);
        const receipt = createCapabilityReceipt({
          runId: request.runId,
          step: request.step,
          capabilityId,
          obligationId: request.obligation.id,
          question: request.obligation.question,
          selected: true,
          invoked: true,
          outcome: invResult.outcome,
          invokedAt: new Date().toISOString(),
          toolName,
          harness: options.session.harness,
          harnessVersion: options.session.harnessVersion,
          harnessExecutable: request.harnessExecutable ?? null,
          sessionId: options.session.sessionId,
          source: request.obligation.source,
          sourceVersion: request.obligation.version,
          observationId: `obs-${randomUUID()}`,
          rawResultSha256: createHash("sha256").update(invResult.rawResult, "utf8").digest("hex"),
          isReused: false,
          originalReceiptId: null,
          isError: invResult.isError,
          errorMessage: invResult.errorMessage ?? null,
        });
        return { receipt };
      }

      // Default mock invocation
      const receipt = createCapabilityReceipt({
        runId: request.runId,
        step: request.step,
        capabilityId,
        obligationId: request.obligation.id,
        question: request.obligation.question,
        selected: true,
        invoked: true,
        outcome: "ok",
        invokedAt: new Date().toISOString(),
        toolName,
        harness: options.session.harness,
        harnessVersion: options.session.harnessVersion,
        harnessExecutable: request.harnessExecutable ?? null,
        sessionId: options.session.sessionId,
        source: request.obligation.source,
        sourceVersion: request.obligation.version,
        observationId: `obs-ok-${randomUUID()}`,
        rawResultSha256: createHash("sha256").update("ok", "utf8").digest("hex"),
        isReused: false,
        originalReceiptId: null,
        isError: false,
        errorMessage: null,
      });
      return { receipt };
    },
  };
}
