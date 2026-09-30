import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy } from "../core/task-contract.js";
import type { TaskPortAssessment, TaskPorts } from "../core/task-run.js";
import { probeClaudeVersion, runClaudeReviewer, type ClaudeAdapterOptions } from "./task-claude.js";
import { probeCodexVersion, runCodexController, type CodexAdapterOptions } from "./task-codex.js";
import type { HarnessVersionProbe } from "./task-agent-launch.js";

// The shared launch helpers live in task-agent-launch.ts so that task-codex.ts
// and task-claude.ts never import this registry, which imports them: the
// registry stays the one entry point without a circular module graph.
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

/**
 * The one role assignment proven by native probe in this build: Codex as the
 * single GSD controller and executor, Claude Code as the fresh read-only
 * reviewer. An implementation bootstrap, not a product restriction — every
 * other assignment is reported unsupported with the proof it lacks.
 */
export const TASK_BOOTSTRAP_PAIR = { controller: "codex", executor: "codex", reviewer: "claude" } as const;

export interface TaskAgentPairProbeOptions {
  probeCodex?: () => Promise<HarnessVersionProbe>;
  probeClaude?: () => Promise<HarnessVersionProbe>;
}

export type NativeTaskPortOptions = CodexAdapterOptions & ClaudeAdapterOptions & TaskAgentPairProbeOptions;

type Role = keyof typeof TASK_BOOTSTRAP_PAIR;
const ROLES: readonly Role[] = ["controller", "executor", "reviewer"];

/**
 * Reports whether a role assignment has proven native adapters on this host.
 * Nothing is launched beyond the two version probes, and a probe is skipped
 * for a harness no supported role uses.
 */
export async function probeTaskAgentPair(policy: TaskAgentPolicy, options: NativeTaskPortOptions = {}): Promise<TaskPortAssessment> {
  const missingProof: string[] = [];
  for (const role of ROLES) {
    const harness: HarnessId = policy[role];
    if (harness !== TASK_BOOTSTRAP_PAIR[role]) {
      missingProof.push(
        `${role} ${harness}: no native task adapter is proven for this role in this build (role composition is Phase 16, ROL-01)`,
      );
    }
  }

  const codexUsed = policy.controller === "codex" || policy.executor === "codex";
  const claudeUsed = policy.reviewer === "claude";
  const codex = codexUsed ? await (options.probeCodex ?? (() => probeCodexVersion(options)))() : null;
  const claude = claudeUsed ? await (options.probeClaude ?? (() => probeClaudeVersion(options)))() : null;
  if (codex !== null && codex.status !== "ok") missingProof.push(`codex: ${codex.reason}`);
  if (claude !== null && claude.status !== "ok") missingProof.push(`claude: ${claude.reason}`);

  const proven = (probe: HarnessVersionProbe | null) =>
    probe !== null && probe.status === "ok" ? { version: probe.version, executable: probe.executable } : { version: null, executable: null };
  return {
    supported: missingProof.length === 0,
    controller: { harness: policy.controller, ...(policy.controller === "codex" ? proven(codex) : proven(null)) },
    reviewer: { harness: policy.reviewer, ...(policy.reviewer === "claude" ? proven(claude) : proven(null)) },
    missingProof,
  };
}

/** The 14-01 task ports filled with the proven native bootstrap pair. */
export function nativeTaskPorts(options: NativeTaskPortOptions = {}): TaskPorts {
  return {
    controller: { dispatch: (request) => runCodexController(request, options) },
    reviewer: { review: (request) => runClaudeReviewer(request, options) },
    assess: (policy) => probeTaskAgentPair(policy, options),
  };
}
