import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy, TaskContract } from "./task-contract.js";

/** The domain separator every task artifact digest is bound under. */
export const TASK_ARTIFACT_DIGEST_KIND = "task-artifact";

export interface ExecutorClaim {
  status: "completed" | "needs-authority" | "failed";
  summary: string;
  authorityRequest: { effect: string; reason: string } | null;
  gsdQuickId: string | null;
}

export interface ControllerDispatchRequest {
  runId: string;
  contract: TaskContract;
  contractDigest: string;
  projectRoot: string;
  scratchRoot: string;
  decisionLogPath: string;
  prompt: string;
  deadlineAt: string | null;
}

export interface ControllerDispatchResult {
  harness: string;
  version: string | null;
  executable: string | null;
  sessionId: string | null;
  exitCode: number | null;
  processCode: string;
  terminal: string;
  claim: ExecutorClaim | null;
  detail: string | null;
}

export interface TaskMeasurement {
  criterionId: string;
  outcome: "pass" | "fail" | "unavailable";
  exitCode: number | null;
  stdoutSha256: string | null;
  detail: string;
}

export interface TaskReviewReproduction {
  inputText: string;
  observedExitCode: number;
  observedStdout: string;
}

export interface TaskReviewCriterion {
  criterionId: string;
  verdict: "pass" | "fail" | "unknown";
  severity: "blocking" | "advisory";
  evidence: string;
  abstainReason: string | null;
  finding: { summary: string; reproduction: TaskReviewReproduction | null } | null;
}

export interface TaskReviewReport {
  schemaVersion: 1;
  requestId: string;
  contractId: string;
  contractDigest: string;
  artifactDigest: string;
  criteria: TaskReviewCriterion[];
  suggestions: string[];
}

export interface ReviewRequest {
  runId: string;
  requestId: string;
  sessionId: string;
  contract: TaskContract;
  contractDigest: string;
  artifactDigest: string;
  reviewRoot: string;
  measurements: TaskMeasurement[];
  deadlineAt: string | null;
}

export interface ReviewDispatchResult {
  harness: string;
  version: string | null;
  executable: string | null;
  sessionId: string | null;
  exitCode: number | null;
  processCode: string;
  report: TaskReviewReport | null;
  issues: string[];
}

export interface ControllerPort {
  dispatch(request: ControllerDispatchRequest): Promise<ControllerDispatchResult>;
}

export interface ReviewerPort {
  review(request: ReviewRequest): Promise<ReviewDispatchResult>;
}

export interface TaskPortAssessment {
  supported: boolean;
  controller: { harness: HarnessId; version: string | null; executable: string | null };
  reviewer: { harness: HarnessId; version: string | null; executable: string | null };
  missingProof: string[];
}

export interface TaskPorts {
  controller: ControllerPort;
  reviewer: ReviewerPort;
  assess(policy: TaskAgentPolicy): Promise<TaskPortAssessment>;
}

export interface TaskVerdictRow {
  criterionId: string;
  verdict: "pass" | "fail" | "unknown";
  measured: TaskMeasurement;
  review: { verdict: "pass" | "fail" | "unknown"; severity: "blocking" | "advisory"; evidence: string } | null;
  artifactDigest: string;
  reason: string;
  nextAction: string | null;
}

export type TaskRunStatus = "executing" | "accepted" | "rejected" | "unknown" | "blocked" | "stopped";

export interface TaskRunRecord {
  schemaVersion: 1;
  kind: "task-run";
  runId: string;
  contractId: string;
  revision: number;
  contractDigest: string;
  status: TaskRunStatus;
  startedAt: string;
  finishedAt: string | null;
  artifact: { digest: string; fileCount: number; totalBytes: number } | null;
  executor: (Omit<ControllerDispatchResult, "detail">) | null;
  reviewer: {
    harness: string;
    version: string | null;
    executable: string | null;
    sessionId: string | null;
    requestId: string;
    requestedSessionId: string;
    report: TaskReviewReport | null;
  } | null;
  verdict: {
    overall: "accepted" | "rejected" | "unknown";
    refusal: "stale-review" | null;
    rows: TaskVerdictRow[];
  } | null;
  stopReason: string | null;
  nextAction: string | null;
}

export type TaskRunErrorCode = "approval-consumed" | "unsupported-agent-pair" | "run-record-invalid";

export class TaskRunError extends Error {
  readonly code: TaskRunErrorCode;
  constructor(code: TaskRunErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TaskRunError";
    this.code = code;
  }
}

export interface StartTaskOptions {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
  packageRoot: string;
  ports: TaskPorts;
  now?: () => Date;
}

export async function listTaskRuns(_options: { stateRoot: string; contractId: string }): Promise<TaskRunRecord[]> {
  throw new Error("not implemented");
}

export async function startTask(_options: StartTaskOptions): Promise<{ run: TaskRunRecord; recordPath: string }> {
  throw new Error("not implemented");
}

export async function readTaskReport(_options: {
  stateRoot: string;
  contractId: string;
  runId?: string;
}): Promise<TaskRunRecord | null> {
  throw new Error("not implemented");
}
