import type { EnvironmentPolicy } from "../core/process.js";
import type { ControllerDispatchRequest, ControllerDispatchResult, ExecutorClaim } from "../core/task-run.js";
import type { RedactedExcerpt } from "../types.js";
import type { HarnessVersionProbe, TaskAgentResolver, TaskAgentRunner } from "./task-agent-launch.js";

export const CODEX_TASK_TIMEOUT_MS = 60 * 60 * 1000;
export const CODEX_TASK_OUTPUT_BYTES = 8 * 1024 * 1024;
export const CODEX_TASK_ENVIRONMENT_NAMES: readonly string[] = [];

export type CodexTerminal = "completed" | "failed" | "not-retained" | "missing";

export interface CodexEvents {
  sessionId: string | null;
  terminal: CodexTerminal;
  usage: Record<string, number> | null;
  message: string | null;
  eventCount: number;
  unparsedLines: number;
}

export interface CodexClaimRead {
  claim: ExecutorClaim | null;
  issue: string | null;
}

export interface CodexAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export function codexTaskEnvironment(_source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  throw new Error("not implemented");
}

export function codexControllerArgs(_paths: { projectRoot: string; outputSchemaPath: string; lastMessagePath: string }): string[] {
  throw new Error("not implemented");
}

export async function probeCodexVersion(_options: CodexAdapterOptions = {}): Promise<HarnessVersionProbe> {
  throw new Error("not implemented");
}

export function parseCodexEvents(_stdout: RedactedExcerpt, _outputCapped: boolean): CodexEvents {
  throw new Error("not implemented");
}

export async function readCodexClaim(_path: string, _schema: Record<string, unknown>): Promise<CodexClaimRead> {
  throw new Error("not implemented");
}

export async function runCodexController(
  _request: ControllerDispatchRequest,
  _options: CodexAdapterOptions = {},
): Promise<ControllerDispatchResult> {
  throw new Error("not implemented");
}
