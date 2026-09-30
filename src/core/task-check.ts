import type { TaskContract, TaskCriterion } from "./task-contract.js";
import type { TaskMeasurement, TaskReviewReproduction } from "./task-run.js";

/** The domain separator every task artifact digest is bound under. */
export const TASK_ARTIFACT_DIGEST_KIND = "task-artifact";

export const TASK_ARTIFACT_LIMITS = {
  maxFiles: 2000,
  maxTotalBytes: 16 * 1024 * 1024,
  measurementTimeoutMs: 30_000,
  measurementOutputBytes: 65_536,
} as const;

export type TaskDecisionCategory =
  | "implementation"
  | "file-layout"
  | "verification"
  | "dependency"
  | "measurement-substitute"
  | "gsd-default";

export interface TaskDecision {
  id: string;
  at: string;
  category: TaskDecisionCategory;
  choice: string;
  rationale: string;
  criterionIds: string[];
  substitute: { criterionId: string; entry: string } | null;
}

export interface TaskMeasurementSubstitute {
  decisionId: string;
  criterionId: string;
  entry: string;
}

export interface TaskArtifactFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface TaskArtifactManifest {
  status: "ok";
  allowedRoots: string[];
  files: TaskArtifactFile[];
  digest: string;
  fileCount: number;
  totalBytes: number;
}

export type TaskArtifactCause = "artifact-link" | "artifact-too-large" | "artifact-unreadable";

export interface TaskArtifactUnavailable {
  status: "unavailable";
  cause: TaskArtifactCause;
  detail: string;
}

export type TaskArtifactCollection = TaskArtifactManifest | TaskArtifactUnavailable;

export interface TaskReproductionConfirmation {
  confirmed: boolean;
  detail: string;
}

export async function collectTaskArtifact(_options: {
  projectRoot: string;
  allowedRoots: readonly string[];
}): Promise<TaskArtifactCollection> {
  throw new Error("collectTaskArtifact is not implemented");
}

export async function materializeTaskSnapshot(_options: {
  manifest: TaskArtifactManifest;
  projectRoot: string;
  destination: string;
}): Promise<string> {
  throw new Error("materializeTaskSnapshot is not implemented");
}

export async function measureTaskCriterion(_options: {
  criterion: TaskCriterion;
  root: string;
  scratchRoot: string;
  allowedRoots: readonly string[];
  substitute: TaskMeasurementSubstitute | null;
  timeoutMs?: number;
}): Promise<TaskMeasurement> {
  throw new Error("measureTaskCriterion is not implemented");
}

export function selectMeasurementSubstitutes(
  _decisions: readonly TaskDecision[],
  _contract: TaskContract,
): TaskMeasurementSubstitute[] {
  throw new Error("selectMeasurementSubstitutes is not implemented");
}

export async function confirmReviewerReproduction(_options: {
  criterion: TaskCriterion;
  reproduction: TaskReviewReproduction;
  root: string;
  scratchRoot: string;
  timeoutMs?: number;
}): Promise<TaskReproductionConfirmation> {
  throw new Error("confirmReviewerReproduction is not implemented");
}
