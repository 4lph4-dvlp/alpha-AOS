import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy } from "../core/task-contract.js";
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
import { probeClaudeVersion, runClaudeReviewer, type ClaudeAdapterOptions } from "./task-claude.js";
import { probeCodexVersion, runCodexController, type CodexAdapterOptions } from "./task-codex.js";
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
        detail: "Claude controller adapter will be implemented in Wave 5 (Plan 16-06)",
      }),
    },
    antigravity: {
      dispatch: async (): Promise<ControllerDispatchResult> => ({
        harness: "antigravity",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        terminal: "failed",
        claim: null,
        detail: "Antigravity controller adapter will be implemented in Wave 5 (Plan 16-06)",
      }),
    },
    pi: {
      dispatch: async (): Promise<ControllerDispatchResult> => ({
        harness: "pi",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        terminal: "failed",
        claim: null,
        detail: "Pi controller adapter will be implemented in Wave 5 (Plan 16-06)",
      }),
    },
    hermes: {
      dispatch: async (): Promise<ControllerDispatchResult> => ({
        harness: "hermes",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        terminal: "failed",
        claim: null,
        detail: "Hermes controller adapter will be implemented in Wave 5 (Plan 16-06)",
      }),
    },
  };

  const reviewerMap: Record<HarnessId, ReviewerPort> = {
    claude: { review: (request: ReviewRequest) => runClaudeReviewer(request, options) },
    codex: {
      review: async (): Promise<ReviewDispatchResult> => ({
        harness: "codex",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        report: null,
        issues: ["Codex reviewer adapter will be implemented in Wave 5 (Plan 16-06)"],
      }),
    },
    antigravity: {
      review: async (): Promise<ReviewDispatchResult> => ({
        harness: "antigravity",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        report: null,
        issues: ["Antigravity reviewer adapter will be implemented in Wave 5 (Plan 16-06)"],
      }),
    },
    pi: {
      review: async (): Promise<ReviewDispatchResult> => ({
        harness: "pi",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        report: null,
        issues: ["Pi reviewer adapter will be implemented in Wave 5 (Plan 16-06)"],
      }),
    },
    hermes: {
      review: async (): Promise<ReviewDispatchResult> => ({
        harness: "hermes",
        version: null,
        executable: null,
        sessionId: null,
        exitCode: null,
        processCode: "spawn-failed",
        report: null,
        issues: ["Hermes reviewer adapter will be implemented in Wave 5 (Plan 16-06)"],
      }),
    },
  };

  return {
    controller: controllerMap[policy.controller],
    reviewer: reviewerMap[policy.reviewer],
    assess: (p) => verifyRoleCapabilities(p, options),
  };
}

/** The default task ports using dynamic port dispatch. */
export function nativeTaskPorts(options: NativeTaskPortOptions = {}): TaskPorts {
  return {
    controller: { dispatch: (request) => runCodexController(request, options) },
    reviewer: { review: (request) => runClaudeReviewer(request, options) },
    assess: (policy) => probeTaskAgentPair(policy, options),
  };
}
