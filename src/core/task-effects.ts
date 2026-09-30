import type { TaskContract, TaskEffect } from "./task-contract.js";

export const DEPENDENCY_LOCKFILES: readonly string[] = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
];

export const DEPENDENCY_FIELDS: readonly string[] = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundleDependencies",
  "bundledDependencies",
];

export type TaskBaseline =
  | { status: "clean"; baseCommit: string }
  | { status: "dirty"; paths: string[] }
  | { status: "not-git"; reason: string };

export interface TaskCommit {
  sha: string;
  subject: string;
}

export interface TaskChanges {
  paths: string[];
  commits: TaskCommit[];
}

export interface TaskEffectViolation {
  effect: TaskEffect;
  path: string;
  detail: string;
}

export interface TaskEffectAudit {
  implementationPaths: string[];
  planningPaths: string[];
  violations: TaskEffectViolation[];
  dependencyChanged: boolean;
  dependencyPaths: string[];
}

export interface TaskPackCheckpoint {
  planDigest: string;
  selected: string[];
  applicable: string[];
  approveCommand: string;
}

const RED = "task-effects: not implemented";

export async function readTaskBaseline(_options: { projectRoot: string }): Promise<TaskBaseline> {
  throw new Error(RED);
}

export async function readTaskChanges(_options: { projectRoot: string; baseCommit: string }): Promise<TaskChanges> {
  throw new Error(RED);
}

export async function auditTaskEffects(_options: {
  contract: TaskContract;
  runId: string;
  changes: TaskChanges;
  projectRoot: string;
  baseCommit: string;
}): Promise<TaskEffectAudit> {
  throw new Error(RED);
}

export async function runPackCheckpoint(_options: {
  projectRoot: string;
  packageRoot: string;
  stateRoot: string;
}): Promise<TaskPackCheckpoint> {
  throw new Error(RED);
}
