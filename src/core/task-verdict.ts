import type { TaskReproductionConfirmation } from "./task-check.js";
import type { TaskContract } from "./task-contract.js";
import type {
  ReviewRequest,
  TaskMeasurement,
  TaskReviewReport,
  TaskReviewReproduction,
  TaskVerdictRow,
} from "./task-run.js";

/** A condition outside the criteria that acceptance also requires (14-05 supplies these). */
export interface TaskPrecondition {
  id: string;
  satisfied: boolean;
  reason: string;
  nextAction: string;
}

export interface TaskVerdict {
  overall: "accepted" | "rejected" | "unknown";
  refusal: "stale-review" | "stale-artifact" | null;
  rows: TaskVerdictRow[];
  preconditions: TaskPrecondition[];
}

export interface TaskReviewRowAssessment {
  verdict: "pass" | "fail" | "unknown";
  severity: "blocking" | "advisory";
  evidence: string;
  abstainReason: string | null;
  finding: { summary: string; reproduction: TaskReviewReproduction | null } | null;
}

export interface TaskReviewAssessment {
  status: "ok" | "missing" | "stale" | "malformed";
  issues: string[];
  rows: Map<string, TaskReviewRowAssessment>;
  suggestions: string[];
}

export type TaskNextActionCause =
  | "entry-missing"
  | "timeout"
  | "output-capped"
  | "spawn-failed"
  | "review-missing"
  | "review-malformed"
  | "stale"
  | "abstain"
  | "unconfirmed-fail"
  | "precondition";

export interface TaskNextActionContext {
  artifactDigest?: string;
  entry?: string;
  abstainReason?: string;
  precondition?: TaskPrecondition;
}

export function assessTaskReview(_input: {
  report: TaskReviewReport | null;
  request: Pick<ReviewRequest, "requestId" | "sessionId" | "contractDigest" | "artifactDigest">;
  portSessionId: string | null;
  contract: TaskContract;
  issues?: readonly string[];
  rejected?: string | null;
}): TaskReviewAssessment {
  throw new Error("assessTaskReview is not implemented");
}

export function reduceTaskVerdict(_input: {
  contract: TaskContract;
  artifactDigest: string;
  measurements: readonly TaskMeasurement[];
  review: TaskReviewAssessment;
  confirmations: ReadonlyMap<string, TaskReproductionConfirmation>;
  preconditions: readonly TaskPrecondition[];
  refusal: "stale-artifact" | null;
}): TaskVerdict {
  throw new Error("reduceTaskVerdict is not implemented");
}

export function taskNextAction(_cause: TaskNextActionCause, _context: TaskNextActionContext = {}): string {
  throw new Error("taskNextAction is not implemented");
}
