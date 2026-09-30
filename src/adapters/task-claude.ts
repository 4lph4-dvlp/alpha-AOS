import type { EnvironmentPolicy } from "../core/process.js";
import type { ReviewDispatchResult, ReviewRequest, TaskReviewReport } from "../core/task-run.js";
import type { RedactedExcerpt } from "../types.js";
import type { HarnessVersionProbe, TaskAgentResolver, TaskAgentRunner } from "./task-agent-launch.js";

export const CLAUDE_REVIEW_TIMEOUT_MS = 15 * 60 * 1000;
export const CLAUDE_REVIEW_OUTPUT_BYTES = 1024 * 1024;
export const CLAUDE_REVIEW_ENVIRONMENT_NAMES: readonly string[] = [];

export interface ClaudeAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export type ReviewPrompt =
  | { status: "ok"; prompt: string; bytes: number }
  | { status: "too-large"; issue: string; bytes: number };

export interface ClaudeReviewParse {
  report: TaskReviewReport | null;
  sessionId: string | null;
  issues: string[];
}

export function claudeReviewEnvironment(_source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  throw new Error("not implemented");
}

export function claudeReviewerArgs(_options: { sessionId: string; reviewSchemaJson: string }): string[] {
  throw new Error("not implemented");
}

export function buildReviewPrompt(_request: ReviewRequest): ReviewPrompt {
  throw new Error("not implemented");
}

export function parseClaudeReviewResult(
  _stdout: RedactedExcerpt,
  _outputCapped: boolean,
  _requestedSessionId: string,
  _schema: Record<string, unknown>,
): ClaudeReviewParse {
  throw new Error("not implemented");
}

export async function probeClaudeVersion(_options: ClaudeAdapterOptions = {}): Promise<HarnessVersionProbe> {
  throw new Error("not implemented");
}

export async function runClaudeReviewer(_request: ReviewRequest, _options: ClaudeAdapterOptions = {}): Promise<ReviewDispatchResult> {
  throw new Error("not implemented");
}
