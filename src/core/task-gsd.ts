import type { ProcessResult, ProcessSpec } from "./process.js";
import type { TaskContract } from "./task-contract.js";

export const GSD_TASK_WORKFLOW = "quick";
export const GSD_CONTROLLER_PROMPT_MAX_BYTES = 24 * 1024;

export type GsdToolsRunner = (spec: ProcessSpec) => Promise<ProcessResult>;

export interface GsdQuickReadiness {
  ready: boolean;
  reason: string;
  gsdToolsPath: string | null;
}

export interface GsdQuickOutline {
  sourceSha256: string;
  stepNames: string[];
}

export type PlanningSnapshot = Array<[path: string, sha256: string]>;

export interface GsdEvidence {
  status: "verified" | "missing";
  quickId: string | null;
  planPath: string | null;
  summaryPath: string | null;
  stateRow: boolean;
  commits: Array<{ sha: string; subject: string }>;
  missing: string[];
}

const RED = "task-gsd: not implemented";

export function resolveInstalledGsdTools(_configRoot?: string): string | null {
  throw new Error(RED);
}

export async function runGitRead(_projectRoot: string, _args: readonly string[]): Promise<string> {
  throw new Error(RED);
}

export async function probeGsdQuickReadiness(_options: {
  projectRoot: string;
  gsdToolsPath: string | null;
  runner?: GsdToolsRunner;
}): Promise<GsdQuickReadiness> {
  throw new Error(RED);
}

export async function readGsdQuickOutline(_configRoot?: string): Promise<GsdQuickOutline> {
  throw new Error(RED);
}

export function buildGsdControllerPrompt(_options: {
  contract: TaskContract;
  contractDigest: string;
  runId: string;
  decisionLogPath: string;
  outline: GsdQuickOutline;
}): string {
  throw new Error(RED);
}

export async function snapshotPlanningState(_projectRoot: string): Promise<PlanningSnapshot> {
  throw new Error(RED);
}

export async function verifyGsdEvidence(_options: {
  projectRoot: string;
  baseCommit: string;
  claimQuickId: string | null;
}): Promise<GsdEvidence> {
  throw new Error(RED);
}
