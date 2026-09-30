import type { ProcessResult, ProcessSpec } from "../core/process.js";

/** The names every task agent child may receive, before its harness-specific names. */
export const TASK_AGENT_BASE_ENVIRONMENT_NAMES: readonly string[] = [];

export type TaskAgentRunner = (spec: ProcessSpec) => Promise<ProcessResult>;
export type TaskAgentResolver = (command: string) => string | null;

export type TaskAgentLaunch =
  | { status: "ok"; executable: string; argsPrefix: string[]; resolved: string }
  | { status: "unsupported"; reason: string };

export type HarnessVersionProbe =
  | { status: "ok"; executable: string; version: string; raw: string }
  | { status: "unsupported"; reason: string };

export function agentFacingSchema(_schema: Record<string, unknown>): Record<string, unknown> {
  throw new Error("not implemented");
}

export function resolveTaskAgentLaunch(_command: string, _options: { resolve?: TaskAgentResolver } = {}): TaskAgentLaunch {
  throw new Error("not implemented");
}

export function parseHarnessVersion(_text: string): string | null {
  throw new Error("not implemented");
}
