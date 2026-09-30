import type { TaskAgentPolicy } from "../core/task-contract.js";
import type { TaskPortAssessment, TaskPorts } from "../core/task-run.js";
import type { ClaudeAdapterOptions } from "./task-claude.js";
import type { CodexAdapterOptions } from "./task-codex.js";
import type { HarnessVersionProbe } from "./task-agent-launch.js";

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

export const TASK_BOOTSTRAP_PAIR = { controller: "codex", executor: "codex", reviewer: "claude" } as const;

export interface TaskAgentPairProbeOptions {
  probeCodex?: () => Promise<HarnessVersionProbe>;
  probeClaude?: () => Promise<HarnessVersionProbe>;
}

export type NativeTaskPortOptions = CodexAdapterOptions & ClaudeAdapterOptions & TaskAgentPairProbeOptions;

export async function probeTaskAgentPair(_policy: TaskAgentPolicy, _options: NativeTaskPortOptions = {}): Promise<TaskPortAssessment> {
  throw new Error("not implemented");
}

export function nativeTaskPorts(_options: NativeTaskPortOptions = {}): TaskPorts {
  throw new Error("not implemented");
}
