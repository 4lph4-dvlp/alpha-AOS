import type { HarnessId } from "../types.js";

/** The domain separator every task contract digest is bound under. */
export const TASK_CONTRACT_DIGEST_KIND = "task-contract";

/** A contract larger than this is refused before it is parsed. */
export const TASK_CONTRACT_MAX_BYTES = 256 * 1024;

export type TaskEffect = "workspace-write" | "local-commit" | "dependency-change";

export interface TaskCliJsonMeasurement {
  kind: "cli-json";
  entry: string;
  inputText: string;
  expect: {
    exitCode: number;
    stdoutJson?: unknown;
    stdoutEmpty?: true;
    stderrJson?: unknown;
  };
}

export interface TaskCriterion {
  id: string;
  title: string;
  description: string;
  mandatory: true;
  measurement: TaskCliJsonMeasurement;
}

export interface TaskScope {
  projectRoot: string;
  workflow: "gsd-quick";
  summary: string;
}

export interface TaskAgentPolicy {
  controller: HarnessId;
  executor: HarnessId;
  reviewer: HarnessId;
  reviewerSession: "fresh-read-only";
}

export interface TaskResourcePolicy {
  maxWallTimeMinutes?: number;
}

export interface TaskContract {
  schemaVersion: 1;
  id: string;
  revision: number;
  mode: "autopilot";
  category: "development";
  goal: string;
  scope: TaskScope;
  allowedRoots: string[];
  allowedEffects: TaskEffect[];
  criterion: TaskCriterion[];
  agentPolicy: TaskAgentPolicy;
  resourcePolicy: TaskResourcePolicy;
}

export interface DigestableTaskCriterion {
  id: string;
  title: string;
  description: string;
  mandatory: true;
  measurement: {
    kind: "cli-json";
    entry: string;
    inputText: string;
    expect: { exitCode: number; stdoutJson: unknown; stdoutEmpty: boolean; stderrJson: unknown };
  };
}

/** Everything a reviewer approves, in one fixed key order. */
export interface DigestableTaskContract {
  schemaVersion: 1;
  id: string;
  revision: number;
  mode: "autopilot";
  category: "development";
  goal: string;
  scope: TaskScope;
  allowedRoots: string[];
  allowedEffects: TaskEffect[];
  criterion: DigestableTaskCriterion[];
  agentPolicy: TaskAgentPolicy;
  resourcePolicy: { maxWallTimeMinutes: number | null };
}

export interface LoadedTaskContract {
  contract: TaskContract;
  digest: string;
  sourcePath: string;
}

export interface TaskApprovalRecord {
  schemaVersion: 1;
  kind: "task-approval";
  contractId: string;
  revision: number;
  contractDigest: string;
  approvedAt: string;
  canonicalProjectRoot: string;
  consent: { mode: "autopilot"; grant: "explicit-cli-approval"; scope: "single-run" };
  contract: DigestableTaskContract;
}

export type TaskContractErrorCode =
  | "contract-invalid"
  | "contract-drift"
  | "not-approved"
  | "revision-reused"
  | "root-changed"
  | "secret-in-contract"
  | "unsupported-controller";

export class TaskContractError extends Error {
  readonly code: TaskContractErrorCode;
  constructor(code: TaskContractErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TaskContractError";
    this.code = code;
  }
}

export interface TaskContractPreview {
  contract: DigestableTaskContract;
  digest: string;
  sourcePath: string;
  approvals: TaskApprovalRecord[];
  approved: boolean;
}

export type TaskApprovalResult =
  | { status: "approved"; recordPath: string; contractDigest: string; transactionId: string }
  | { status: "already-approved"; recordPath: string; contractDigest: string; transactionId: null };

export async function loadTaskContract(_path: string): Promise<LoadedTaskContract> {
  throw new Error("not implemented");
}

export function normalizeContractPath(_value: string): string {
  throw new Error("not implemented");
}

export function digestableTaskContract(_contract: TaskContract): DigestableTaskContract {
  throw new Error("not implemented");
}

export function taskContractDigest(_contract: TaskContract): string {
  throw new Error("not implemented");
}

export function taskApprovalPath(_stateRoot: string, _contractId: string, _revision: number, _digest: string): string {
  throw new Error("not implemented");
}

export async function readTaskApprovals(_options: { stateRoot: string; contractId: string }): Promise<TaskApprovalRecord[]> {
  throw new Error("not implemented");
}

export async function previewTaskContract(_options: { contractPath: string; stateRoot: string }): Promise<TaskContractPreview> {
  throw new Error("not implemented");
}

export async function approveTaskContract(_options: {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
  now?: () => Date;
}): Promise<TaskApprovalResult> {
  throw new Error("not implemented");
}

export async function assertTaskStartable(_options: {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
}): Promise<{ loaded: LoadedTaskContract; approval: TaskApprovalRecord }> {
  throw new Error("not implemented");
}

export function taskApproveCommand(_options: { contractPath: string; digest: string }): string {
  throw new Error("not implemented");
}
