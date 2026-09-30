import { randomUUID } from "node:crypto";
import { lstat, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessId } from "../types.js";
import { packageRoot as defaultPackageRoot } from "./paths.js";
import {
  collectTaskArtifact,
  confirmReviewerReproduction,
  materializeTaskSnapshot,
  measureTaskCriterion,
  selectMeasurementSubstitutes,
  type TaskArtifactCause,
  type TaskDecision,
  type TaskDecisionCategory,
  type TaskReproductionConfirmation,
} from "./task-check.js";
import {
  assertTaskStartable,
  describeIssue,
  isTaskContractId,
  TaskContractError,
  taskSchema,
  type TaskAgentPolicy,
  type TaskContract,
} from "./task-contract.js";
import { codexConfigRoot } from "./gsd-compat.js";
import {
  auditTaskEffects,
  readTaskBaseline,
  readTaskChanges,
  runPackCheckpoint,
  type TaskCommit,
  type TaskEffectViolation,
  type TaskPackCheckpoint,
} from "./task-effects.js";
import {
  buildGsdControllerPrompt,
  probeGsdQuickReadiness,
  readGsdQuickOutline,
  resolveInstalledGsdTools,
  runGitRead,
  snapshotPlanningState,
  verifyGsdEvidence,
  type GsdEvidence,
  type GsdQuickOutline,
} from "./task-gsd.js";
import { grantedGitDirectory, resolveTaskGitDirectory, snapshotGitControl } from "./task-git.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";

import { assessTaskReview, reduceTaskVerdict, type TaskPrecondition, type TaskVerdict } from "./task-verdict.js";

export { TASK_ARTIFACT_DIGEST_KIND, type TaskDecision, type TaskDecisionCategory } from "./task-check.js";
export type { TaskPrecondition, TaskVerdict } from "./task-verdict.js";

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
  /** The one git directory the approved local-commit effect lets the controller write, or null. */
  gitDirectory: string | null;
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

export type TaskMeasurementCause = "none" | "entry-missing" | "timeout" | "output-capped" | "spawn-failed";

export interface TaskMeasurement {
  criterionId: string;
  outcome: "pass" | "fail" | "unavailable";
  exitCode: number | null;
  stdoutSha256: string | null;
  detail: string;
  /** Why an unavailable measurement could not run; `none` when it ran (D-15). */
  cause: TaskMeasurementCause;
  /** Whether the contract entry or a recorded substitute entry was run (D-08). */
  measuredBy: "contract" | "substitute";
  substituteDecisionId: string | null;
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
  review: {
    verdict: "pass" | "fail" | "unknown";
    severity: "blocking" | "advisory";
    evidence: string;
    /** Whether alpha-AOS reproduced the reviewer's finding itself; null when none was attempted (D-14). */
    confirmed: boolean | null;
    confirmationDetail: string | null;
  } | null;
  artifactDigest: string;
  reason: string;
  nextAction: string | null;
}

export type TaskRunStatus = "executing" | "accepted" | "rejected" | "unknown" | "blocked" | "stopped";

export interface TaskRunExecutor {
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

export interface TaskRunReviewer {
  harness: string;
  version: string | null;
  executable: string | null;
  sessionId: string | null;
  requestId: string;
  requestedSessionId: string;
  report: TaskReviewReport | null;
}

export type TaskRunVerdict = TaskVerdict;

export interface TaskDecisionLogStatus {
  status: "absent" | "valid" | "invalid";
  reason: string | null;
}

/** GSD quick's own evidence for the run, as read by alpha-AOS (RUN-01). */
export interface TaskRunGsd {
  status: "verified" | "missing" | "not-run";
  quickId: string | null;
  planPath: string | null;
  summaryPath: string | null;
  stateRow: boolean;
  commits: TaskCommit[];
  missing: string[];
  workflowSha256: string | null;
}

/** Every path changed after the base commit, split by authority (D-03, AUTO-02, D-07). */
export interface TaskRunEffects {
  implementationPaths: string[];
  planningPaths: string[];
  violations: TaskEffectViolation[];
  dependencyChanged: boolean;
  dependencyPaths: string[];
  packCheckpoint: TaskPackCheckpoint | null;
}

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
  executor: TaskRunExecutor | null;
  reviewer: TaskRunReviewer | null;
  verdict: TaskRunVerdict | null;
  stopReason: string | null;
  nextAction: string | null;
  /** The controller's recorded decisions, copied from its decision log (CON-02, D-06). */
  decisions: TaskDecision[];
  /** Null until the decision log has been read for this run. */
  decisionLog: TaskDecisionLogStatus | null;
  /** The clean commit every changed path is measured against. */
  baseCommit: string | null;
  /** When the approved maxWallTimeMinutes elapses, or null without a limit. */
  deadlineAt: string | null;
  gsd: TaskRunGsd | null;
  effects: TaskRunEffects | null;
  gitDirectory: string | null;
}

export type TaskRunErrorCode =
  | "approval-consumed"
  | "unsupported-agent-pair"
  | "run-record-invalid"
  | "dirty-baseline"
  | "gsd-not-ready";

export class TaskRunError extends Error {
  readonly code: TaskRunErrorCode;
  constructor(code: TaskRunErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TaskRunError";
    this.code = code;
  }
}

/**
 * What `task start` without --apply reports (D-02, AUTO-02): the roles with the
 * exact versions the native probe found or the proof they lack, GSD quick
 * readiness, the baseline and the approval state. Built without writing.
 */
export interface TaskStartReadiness {
  contractId: string;
  revision: number;
  contractDigest: string;
  projectRoot: string;
  approval: { approved: boolean; consumedBy: string | null };
  controller: { harness: HarnessId; version: string | null; executable: string | null };
  executor: { harness: HarnessId; version: string | null; executable: string | null };
  reviewer: { harness: HarnessId; version: string | null; executable: string | null };
  missingProof: string[];
  gsd: { ready: boolean; reason: string; gsdToolsPath: string | null };
  baseline:
    | { status: "clean"; baseCommit: string }
    | { status: "dirty"; paths: string[] }
    | { status: "not-git"; reason: string }
    | { status: "unavailable"; reason: string };
  /** True only when nothing below would refuse the start. */
  ready: boolean;
}

export interface StartTaskOptions {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
  packageRoot: string;
  ports: TaskPorts;
  now?: () => Date;
  /** Where the controller harness's GSD Core is installed; defaults to the Codex config root. */
  gsd?: { configRoot?: string };
}

const REPORT_TEXT_LIMIT = 4096;
const REPORT_LIST_LIMIT = 64;

function bounded(text: string, limit: number): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 3)}...`;
}

function runsDirectory(stateRoot: string, contractId: string): string {
  return join(stateRoot, "tasks", contractId, "runs");
}

function requireContractId(contractId: string): void {
  if (!isTaskContractId(contractId)) {
    throw new TaskContractError(
      "contract-invalid",
      "The task contract id must be a lowercase letter or digit followed by up to 63 lowercase letters, digits or hyphens.",
    );
  }
}

// ---------------------------------------------------------------------------
// Run records (D-16)
// ---------------------------------------------------------------------------

async function validateReport(
  value: unknown,
  root: string,
): Promise<{ report: TaskReviewReport | null; issue: string | null }> {
  if (value === null || value === undefined) return { report: null, issue: "the reviewer returned no report" };
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return { report: null, issue: "the review report is not serializable JSON" };
  }
  const validation = validateManagedDocument<TaskReviewReport>({
    text,
    format: "json",
    kind: "task-agent-output",
    schema: await taskSchema("task-review", root),
    domain: rejectRawCredentials,
  });
  if (!validation.ok || validation.value === null) {
    return { report: null, issue: `the review report is invalid: ${describeIssue(validation.issues[0], validation.status)}` };
  }
  const report = validation.value;
  const texts = [
    report.requestId,
    report.contractId,
    report.contractDigest,
    report.artifactDigest,
    ...report.suggestions,
    ...report.criteria.flatMap((criterion) => [
      criterion.criterionId,
      criterion.evidence,
      criterion.abstainReason ?? "",
      criterion.finding?.summary ?? "",
      criterion.finding?.reproduction?.inputText ?? "",
      criterion.finding?.reproduction?.observedStdout ?? "",
    ]),
  ];
  if (
    report.criteria.length > REPORT_LIST_LIMIT ||
    report.suggestions.length > REPORT_LIST_LIMIT ||
    texts.some((entry) => entry.length > REPORT_TEXT_LIMIT)
  ) {
    return { report: null, issue: "the review report exceeds its length bounds" };
  }
  return { report, issue: null };
}

async function writeRunRecord(stateRoot: string, root: string, record: TaskRunRecord): Promise<string> {
  const target = join(runsDirectory(stateRoot, record.contractId), `${record.runId}.json`);
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const validation = validateManagedDocument<TaskRunRecord>({
    text,
    format: "json",
    kind: "task-receipt",
    schema: await taskSchema("task-receipt", root),
    domain: rejectRawCredentials,
  });
  if (!validation.ok) {
    throw new TaskRunError(
      "run-record-invalid",
      `Task run record ${record.runId} failed schema validation: ${describeIssue(validation.issues[0], validation.status)}.`,
    );
  }
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target, content: Buffer.from(text, "utf8") }],
  });
  return target;
}

async function readRunRecord(path: string, contractId: string, root: string): Promise<TaskRunRecord> {
  const tampered = (detail: string) =>
    new TaskRunError("run-record-invalid", `Task run record ${path} is invalid or tampered: ${detail}.`);
  const validation = validateManagedDocument<TaskRunRecord>({
    text: await readFile(path, "utf8"),
    format: "json",
    kind: "task-receipt",
    schema: await taskSchema("task-receipt", root),
    domain: rejectRawCredentials,
  });
  if (!validation.ok || validation.value === null) throw tampered(describeIssue(validation.issues[0], validation.status));
  const record = validation.value;
  if (record.kind !== "task-run") throw tampered("the record is not a task run");
  if (record.contractId !== contractId) throw tampered("the record names a different contract id");
  if (!path.endsWith(`${record.runId}.json`)) throw tampered("the file name does not match the run id");
  if (record.reviewer?.report !== null && record.reviewer?.report !== undefined) {
    const checked = await validateReport(record.reviewer.report, root);
    if (checked.report === null) throw tampered(checked.issue ?? "the embedded review report is invalid");
  }
  return record;
}

/** Every run recorded for one contract id, strictly read, oldest first. */
export async function listTaskRuns(options: { stateRoot: string; contractId: string; packageRoot?: string }): Promise<TaskRunRecord[]> {
  requireContractId(options.contractId);
  const root = options.packageRoot ?? defaultPackageRoot();
  const directory = runsDirectory(options.stateRoot, options.contractId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: TaskRunRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json"))) {
    records.push(await readRunRecord(join(directory, name), options.contractId, root));
  }
  return records.sort((left, right) =>
    left.startedAt === right.startedAt
      ? left.runId < right.runId ? -1 : left.runId > right.runId ? 1 : 0
      : left.startedAt < right.startedAt ? -1 : 1,
  );
}

/** The named run, or the latest one, or null when none is recorded. */
export async function readTaskReport(options: {
  stateRoot: string;
  contractId: string;
  runId?: string;
}): Promise<TaskRunRecord | null> {
  const runs = await listTaskRuns({ stateRoot: options.stateRoot, contractId: options.contractId });
  if (options.runId !== undefined) return runs.find((run) => run.runId === options.runId) ?? null;
  return runs.at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// Decision log (CON-02, D-06)
// ---------------------------------------------------------------------------

const DECISION_LOG_MAX_BYTES = 256 * 1024;
const DECISION_LOG_MAX_LINES = 200;
const RUN_ID_PATTERN = /^[0-9a-z]{8,}-[0-9a-f]{8}$/u;
const DECISION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/u;
const CRITERION_ID_PATTERN = /^[a-z][a-z0-9-]{0,47}$/u;
const DECISION_KEYS = ["at", "category", "choice", "criterionIds", "id", "rationale", "substitute"];
const DECISION_CATEGORIES: readonly TaskDecisionCategory[] = [
  "implementation",
  "file-layout",
  "verification",
  "dependency",
  "measurement-substitute",
  "gsd-default",
];

export interface TaskDecisionLog extends TaskDecisionLogStatus {
  entries: TaskDecision[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closedKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value).sort();
  return own.length === keys.length && own.every((key, index) => key === keys[index]);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

/** The closed decision shape, or the name of the first field that breaks it. Never echoes a value. */
function parseDecision(value: unknown): { decision: TaskDecision } | { problem: string } {
  if (!isRecord(value)) return { problem: "the line is not a JSON object" };
  if (!closedKeys(value, DECISION_KEYS)) return { problem: `the decision must carry exactly ${DECISION_KEYS.join(", ")}` };
  if (typeof value.id !== "string" || !DECISION_ID_PATTERN.test(value.id)) return { problem: "id must be 1 to 64 letters, digits or ._:-" };
  if (!boundedText(value.at, 64)) return { problem: "at must be a string of 1 to 64 characters" };
  if (typeof value.category !== "string" || !DECISION_CATEGORIES.includes(value.category as TaskDecisionCategory)) {
    return { problem: "category is not a recorded decision category" };
  }
  if (!boundedText(value.choice, 500)) return { problem: "choice must be a string of 1 to 500 characters" };
  if (!boundedText(value.rationale, 1000)) return { problem: "rationale must be a string of 1 to 1000 characters" };
  const ids = value.criterionIds;
  if (!Array.isArray(ids) || ids.length > 32 || !ids.every((id) => typeof id === "string" && CRITERION_ID_PATTERN.test(id))) {
    return { problem: "criterionIds must be up to 32 criterion ids" };
  }
  let substitute: TaskDecision["substitute"] = null;
  if (value.substitute !== null) {
    const candidate = value.substitute;
    // Only an entry path may be substituted; an input or expectation field is refused (D-08).
    if (!isRecord(candidate) || !closedKeys(candidate, ["criterionId", "entry"])) {
      return { problem: "substitute must be null or carry exactly criterionId and entry" };
    }
    if (typeof candidate.criterionId !== "string" || !CRITERION_ID_PATTERN.test(candidate.criterionId)) {
      return { problem: "substitute.criterionId is not a criterion id" };
    }
    if (!boundedText(candidate.entry, 500)) return { problem: "substitute.entry must be a string of 1 to 500 characters" };
    substitute = { criterionId: candidate.criterionId, entry: candidate.entry };
  }
  return {
    decision: {
      id: value.id,
      at: value.at as string,
      category: value.category as TaskDecisionCategory,
      choice: value.choice as string,
      rationale: value.rationale as string,
      criterionIds: [...(ids as string[])],
      substitute,
    },
  };
}

/**
 * Reads the controller's decision log for one run. The log is untrusted data:
 * it is bounded, strictly shaped and credential-checked, and any bad line makes
 * the whole log invalid so no decision from it is used (fail closed).
 */
export async function readTaskDecisionLog(options: { projectRoot: string; runId: string }): Promise<TaskDecisionLog> {
  if (!RUN_ID_PATTERN.test(options.runId)) {
    throw new Error(`Decision log refused: ${JSON.stringify(options.runId.slice(0, 40))} is not a task run id.`);
  }
  const invalid = (reason: string): TaskDecisionLog => ({ status: "invalid", entries: [], reason: bounded(reason, 300) });
  const segments = [".alpha-aos", "task-runs", options.runId, "decisions.jsonl"];
  let path = resolve(options.projectRoot);
  for (const [index, segment] of segments.entries()) {
    path = join(path, segment);
    const shown = segments.slice(0, index + 1).join("/");
    let stat;
    try {
      stat = await lstat(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { status: "absent", entries: [], reason: null };
      return invalid(`${shown} could not be read (${typeof code === "string" ? code : "unknown error"})`);
    }
    if (stat.isSymbolicLink()) return invalid(`${shown} is a symbolic link`);
    const last = index === segments.length - 1;
    if (last ? !stat.isFile() : !stat.isDirectory()) return invalid(`${shown} is not a ${last ? "regular file" : "directory"}`);
    if (last && stat.size > DECISION_LOG_MAX_BYTES) return invalid(`the decision log exceeds ${DECISION_LOG_MAX_BYTES} bytes`);
  }

  const bytes = await readFile(path);
  if (bytes.byteLength > DECISION_LOG_MAX_BYTES) return invalid(`the decision log exceeds ${DECISION_LOG_MAX_BYTES} bytes`);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("the decision log is not UTF-8 text");
  }
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length > DECISION_LOG_MAX_LINES) {
    return invalid(`line ${DECISION_LOG_MAX_LINES + 1}: the decision log exceeds ${DECISION_LOG_MAX_LINES} lines`);
  }
  const entries: TaskDecision[] = [];
  const seen = new Set<string>();
  for (const [index, line] of lines.entries()) {
    const number = index + 1;
    if (line.trim() === "") continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return invalid(`line ${number}: the line is not JSON`);
    }
    const parsed = parseDecision(value);
    if ("problem" in parsed) return invalid(`line ${number}: ${parsed.problem}`);
    if (rejectRawCredentials(parsed.decision).length > 0) {
      return invalid(`line ${number}: the decision carries a credential-shaped value`);
    }
    if (seen.has(parsed.decision.id)) return invalid(`line ${number}: decision id ${parsed.decision.id} is repeated`);
    seen.add(parsed.decision.id);
    entries.push(parsed.decision);
  }
  return { status: "valid", entries, reason: null };
}

// ---------------------------------------------------------------------------
// startTask
// ---------------------------------------------------------------------------

function artifactNextAction(cause: TaskArtifactCause): string {
  switch (cause) {
    case "artifact-link":
      return "replace the symbolic link under the allowed roots with a regular file and approve a new contract revision";
    case "artifact-too-large":
      return "reduce the files under the allowed roots below the artifact bound or narrow the allowed roots in a new contract revision";
    case "artifact-unreadable":
      return "restore read access to the named path and approve a new contract revision";
  }
}

function runNextAction(verdict: TaskVerdict): string | null {
  if (verdict.overall === "accepted") return null;
  if (verdict.overall === "rejected") {
    const failing = verdict.rows.filter((row) => row.verdict === "fail").map((row) => row.criterionId);
    return `fix the failing criteria (${failing.join(", ")}) and approve a new contract revision; this approval is consumed`;
  }
  if (verdict.refusal === "stale-artifact") {
    return "the artifact changed while it was being judged; keep the project unchanged during a run and approve a new contract revision to run again";
  }
  const unmet = verdict.preconditions.find((entry) => !entry.satisfied);
  const unknown = verdict.rows.find((row) => row.verdict === "unknown");
  return unknown?.nextAction ?? unmet?.nextAction ?? "re-run the review";
}

function executorBlock(result: ControllerDispatchResult): TaskRunExecutor {
  return {
    harness: result.harness,
    version: result.version,
    executable: result.executable,
    sessionId: result.sessionId,
    exitCode: result.exitCode,
    processCode: result.processCode,
    terminal: result.terminal,
    claim:
      result.claim === null
        ? null
        : {
            status: result.claim.status,
            summary: result.claim.summary,
            authorityRequest:
              result.claim.authorityRequest === null
                ? null
                : { effect: result.claim.authorityRequest.effect, reason: result.claim.authorityRequest.reason },
            gsdQuickId: result.claim.gsdQuickId,
          },
    detail: result.detail,
  };
}

function gsdBlock(evidence: GsdEvidence | null, workflowSha256: string): TaskRunGsd {
  if (evidence === null) {
    return {
      status: "not-run",
      quickId: null,
      planPath: null,
      summaryPath: null,
      stateRow: false,
      commits: [],
      missing: [],
      workflowSha256,
    };
  }
  return {
    status: evidence.status,
    quickId: evidence.quickId,
    planPath: evidence.planPath,
    summaryPath: evidence.summaryPath,
    stateRow: evidence.stateRow,
    commits: evidence.commits.map((commit) => ({ sha: commit.sha, subject: commit.subject })),
    missing: [...evidence.missing],
    workflowSha256,
  };
}

function gsdPrecondition(evidence: GsdEvidence, planningChanged: boolean): TaskPrecondition {
  if (evidence.status === "verified") {
    return {
      id: "gsd-evidence",
      satisfied: true,
      reason: bounded(`GSD quick ${evidence.quickId ?? ""} left its PLAN, SUMMARY, STATE.md row and docs(quick) commit`, 1000),
      nextAction: "none",
    };
  }
  const items = evidence.missing.join("; ");
  const unchanged = planningChanged ? "" : " (the controller changed nothing under .planning)";
  return {
    id: "gsd-evidence",
    satisfied: false,
    reason: bounded(`GSD quick evidence is missing: ${items}${unchanged}`, 1000),
    nextAction: bounded(`The controller did not complete GSD quick (missing: ${items}); re-run the task through GSD.`, 1000),
  };
}

function diffGitControl(before: Array<[string, string]>, after: Array<[string, string]>): string[] {
  const beforeMap = new Map(before);
  const afterMap = new Map(after);
  const changed = new Set<string>();
  for (const [label, digest] of beforeMap) {
    if (afterMap.get(label) !== digest) changed.add(label);
  }
  for (const [label, digest] of afterMap) {
    if (beforeMap.get(label) !== digest) changed.add(label);
  }
  return [...changed].sort();
}

/**
 * Starts one run of an approved contract. The first record written consumes
 * the approval, so one approval authorizes exactly one run (D-02, AUTO-03).
 * A dirty or non-git project and a project GSD quick cannot run in are refused
 * before that record exists, so the approval stays usable once fixed (RUN-01).
 */
export async function startTask(options: StartTaskOptions): Promise<{ run: TaskRunRecord; recordPath: string }> {
  const clock = options.now ?? (() => new Date());
  const { loaded, approval } = await assertTaskStartable(options);
  const { contract, digest } = loaded;

  const prior = await listTaskRuns({ stateRoot: options.stateRoot, contractId: contract.id, packageRoot: options.packageRoot });
  const consumed = prior.find((run) => run.contractDigest === digest);
  if (consumed !== undefined) {
    throw new TaskRunError(
      "approval-consumed",
      `The approval for task ${contract.id} r${contract.revision} digest ${digest} was consumed by run ${consumed.runId}; approve a new contract revision to run again.`,
    );
  }
  const assessment = await options.ports.assess(contract.agentPolicy);
  if (!assessment.supported) {
    throw new TaskRunError(
      "unsupported-agent-pair",
      `No proven adapter pair for controller ${contract.agentPolicy.controller}, executor ${contract.agentPolicy.executor} and reviewer ${contract.agentPolicy.reviewer}: ${assessment.missingProof.join("; ") || "no proof recorded"}.`,
    );
  }

  // Every changed path is judged against one recorded clean commit (T-14-37).
  const projectRoot = resolve(contract.scope.projectRoot);
  const baseline = await readTaskBaseline({ projectRoot });
  if (baseline.status !== "clean") {
    const detail =
      baseline.status === "dirty"
        ? `the working tree has uncommitted or untracked paths: ${baseline.paths.slice(0, 20).join(", ")}${baseline.paths.length > 20 ? `, and ${baseline.paths.length - 20} more` : ""}`
        : baseline.reason;
    throw new TaskRunError(
      "dirty-baseline",
      `Task ${contract.id} cannot start in ${projectRoot}: ${detail}. Commit or remove them and start again; the approval is still usable.`,
    );
  }

  // The controller must be able to run the installed GSD quick workflow here.
  const configRoot = options.gsd?.configRoot ?? codexConfigRoot();
  const readiness = await probeGsdQuickReadiness({ projectRoot, gsdToolsPath: resolveInstalledGsdTools(configRoot) });
  if (!readiness.ready) {
    throw new TaskRunError(
      "gsd-not-ready",
      `Task ${contract.id} cannot start: ${readiness.reason}. The approval is still usable once GSD is ready.`,
    );
  }
  let outline: GsdQuickOutline;
  try {
    outline = await readGsdQuickOutline(configRoot);
  } catch (error) {
    throw new TaskRunError(
      "gsd-not-ready",
      `Task ${contract.id} cannot start: the installed GSD quick workflow could not be read (${bounded(error instanceof Error ? error.message : String(error), 200)}).`,
    );
  }

  // The one git directory the approved local-commit effect lets the controller write (AUTO-02).
  const gitDirectory = contract.allowedEffects.includes("local-commit") ? approval.gitDirectory ?? null : null;
  const resolvedGit = await resolveTaskGitDirectory(projectRoot);
  const gitDirectoryForSnapshot = resolvedGit.status === "grantable" ? resolvedGit.gitDirectory : null;

  const started = clock();
  const runId = `${started.getTime().toString(36).padStart(8, "0")}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const minutes = contract.resourcePolicy.maxWallTimeMinutes;
  const deadlineAt = minutes === undefined ? null : new Date(started.getTime() + minutes * 60_000).toISOString();
  const executing: TaskRunRecord = {
    schemaVersion: 1,
    kind: "task-run",
    runId,
    contractId: contract.id,
    revision: contract.revision,
    contractDigest: digest,
    status: "executing",
    startedAt: started.toISOString(),
    finishedAt: null,
    artifact: null,
    executor: null,
    reviewer: null,
    verdict: null,
    stopReason: null,
    nextAction: null,
    decisions: [],
    decisionLog: null,
    baseCommit: baseline.baseCommit,
    deadlineAt,
    gsd: null,
    effects: null,
    gitDirectory,
  };
  const recordPath = await writeRunRecord(options.stateRoot, options.packageRoot, executing);

  let record = executing;
  let scratchRoot: string | null = null;
  const finish = async (next: TaskRunRecord): Promise<{ run: TaskRunRecord; recordPath: string }> => {
    record = next;
    await writeRunRecord(options.stateRoot, options.packageRoot, record);
    return { run: record, recordPath };
  };
  const wallTimeElapsed = (): boolean => deadlineAt !== null && clock().getTime() >= Date.parse(deadlineAt);
  const stopForWallTime = () =>
    finish({
      ...record,
      status: "stopped",
      finishedAt: clock().toISOString(),
      stopReason: "wall-time-limit",
      nextAction: `The approved limit of ${minutes ?? 0} minutes elapsed before independent review; approve a new revision with a larger maxWallTimeMinutes to run again.`,
    });

  try {
    scratchRoot = await mkdtemp(join(tmpdir(), "alpha-aos-task-run-"));
    const decisionLogPath = `.alpha-aos/task-runs/${runId}/decisions.jsonl`;
    // alpha-AOS only ever reads `.planning/`; this proves whether the controller touched it.
    const planningBefore = await snapshotPlanningState(projectRoot);
    const gitControlBefore = await snapshotGitControl({ projectRoot, gitDirectory: gitDirectoryForSnapshot });

    const dispatched = await options.ports.controller.dispatch({
      runId,
      contract,
      contractDigest: digest,
      projectRoot,
      scratchRoot,
      decisionLogPath,
      prompt: buildGsdControllerPrompt({ contract, contractDigest: digest, runId, decisionLogPath, outline }),
      deadlineAt,
      gitDirectory,
    });
    record = { ...record, executor: executorBlock(dispatched) };

    const gitControlAfter = await snapshotGitControl({ projectRoot, gitDirectory: gitDirectoryForSnapshot });
    const changedControlLabels = diffGitControl(gitControlBefore, gitControlAfter);
    if (changedControlLabels.length > 0) {
      const decisionLog = await readTaskDecisionLog({ projectRoot, runId });
      const effects: TaskRunEffects = {
        implementationPaths: [],
        planningPaths: [],
        violations: changedControlLabels.map((label) => ({
          effect: "local-commit",
          path: label,
          detail: "git control file changed during the run; alpha-AOS ran no git command in this repository afterwards",
        })),
        dependencyChanged: false,
        dependencyPaths: [],
        packCheckpoint: null,
      };
      return await finish({
        ...record,
        status: "blocked",
        finishedAt: clock().toISOString(),
        effects,
        decisions: decisionLog.entries,
        decisionLog: { status: decisionLog.status, reason: decisionLog.reason },
        gsd: gsdBlock(null, outline.sourceSha256),
        stopReason: "new-authority-required: local-commit",
        nextAction: `The controller changed git control files (${changedControlLabels.join(", ")}); inspect ${gitDirectoryForSnapshot ?? "the git directory"} before running any git command there; this run is not accepted.`,
      });
    }

    // Every effect is audited against the approved authority (AUTO-02, D-03).
    const changes = await readTaskChanges({ projectRoot, baseCommit: baseline.baseCommit });
    const audit = await auditTaskEffects({ contract, runId, changes, projectRoot, baseCommit: baseline.baseCommit });

    const revListCount = (await runGitRead(projectRoot, ["rev-list", "--count", baseline.baseCommit, "--not", "HEAD"])).trim();
    if (revListCount !== "0") {
      audit.violations.push({
        effect: "local-commit",
        path: "",
        detail: `the base commit ${baseline.baseCommit.slice(0, 12)} is no longer reachable from HEAD (history rewritten)`,
      });
    }

    let effects: TaskRunEffects = { ...audit, packCheckpoint: null };
    record = { ...record, effects };

    // The controller's own record of what it chose and why (CON-02, D-06).
    const decisionLog = await readTaskDecisionLog({ projectRoot, runId });
    record = {
      ...record,
      decisions: decisionLog.entries,
      decisionLog: { status: decisionLog.status, reason: decisionLog.reason },
    };

    // New authority is never assumed: the run stops before it is judged.
    const claim = dispatched.claim;
    const requested =
      claim?.status === "needs-authority" ? bounded(claim.authorityRequest?.effect ?? "unspecified", 100) : null;
    const blockedBy = requested ?? audit.violations[0]?.effect ?? null;
    if (blockedBy !== null) {
      return await finish({
        ...record,
        status: "blocked",
        finishedAt: clock().toISOString(),
        gsd: gsdBlock(null, outline.sourceSha256),
        stopReason: `new-authority-required: ${blockedBy}`,
        nextAction: `Revise the contract as revision ${contract.revision + 1} with the needed authority, preview it, and approve it; this run is not accepted.`,
      });
    }

    if (audit.dependencyChanged) {
      effects = {
        ...effects,
        packCheckpoint: await runPackCheckpoint({ projectRoot, packageRoot: options.packageRoot, stateRoot: options.stateRoot }),
      };
      record = { ...record, effects };
    }

    // GSD's own evidence, read and never written (RUN-01).
    const evidence = await verifyGsdEvidence({ projectRoot, baseCommit: baseline.baseCommit, claimQuickId: claim?.gsdQuickId ?? null });
    record = { ...record, gsd: gsdBlock(evidence, outline.sourceSha256) };
    const planningAfter = await snapshotPlanningState(projectRoot);
    const preconditions: TaskPrecondition[] = [
      gsdPrecondition(evidence, JSON.stringify(planningBefore) !== JSON.stringify(planningAfter)),
      { id: "effect-audit", satisfied: true, reason: "all changed paths within the approved authority", nextAction: "none" },
    ];

    if (wallTimeElapsed()) return await stopForWallTime();

    const substitutes = selectMeasurementSubstitutes(decisionLog.entries, contract);

    const collected = await collectTaskArtifact({ projectRoot, allowedRoots: contract.allowedRoots });
    if (collected.status === "unavailable") {
      return await finish({
        ...record,
        status: "unknown",
        finishedAt: clock().toISOString(),
        stopReason: `${collected.cause}: ${collected.detail}`,
        nextAction: artifactNextAction(collected.cause),
      });
    }
    const artifact = { digest: collected.digest, fileCount: collected.fileCount, totalBytes: collected.totalBytes };
    record = { ...record, artifact };

    // Measurement and review both run against this copy, never the live tree.
    const snapshot = await materializeTaskSnapshot({
      manifest: collected,
      projectRoot,
      destination: join(scratchRoot, "snapshot"),
    });
    const measurements: TaskMeasurement[] = [];
    for (const criterion of contract.criterion) {
      measurements.push(
        await measureTaskCriterion({
          criterion,
          root: snapshot,
          scratchRoot,
          allowedRoots: contract.allowedRoots,
          substitute: substitutes.find((entry) => entry.criterionId === criterion.id) ?? null,
        }),
      );
    }

    if (wallTimeElapsed()) return await stopForWallTime();

    const request: ReviewRequest = {
      runId,
      requestId: randomUUID(),
      sessionId: randomUUID(),
      contract,
      contractDigest: digest,
      artifactDigest: artifact.digest,
      reviewRoot: snapshot,
      measurements,
      deadlineAt,
    };
    const reviewed = await options.ports.reviewer.review(request);
    const checked = await validateReport(reviewed.report, options.packageRoot);
    record = {
      ...record,
      reviewer: {
        harness: reviewed.harness,
        version: reviewed.version,
        executable: reviewed.executable,
        sessionId: reviewed.sessionId,
        requestId: request.requestId,
        requestedSessionId: request.sessionId,
        report: checked.report,
      },
    };

    const received = reviewed.report !== null && reviewed.report !== undefined;
    const review = assessTaskReview({
      report: checked.report,
      request,
      portSessionId: reviewed.sessionId,
      contract,
      issues: reviewed.issues.map((issue) => bounded(issue, 300)),
      rejected: received ? checked.issue : null,
    });

    // A reviewer failure against a measured pass counts only when alpha-AOS
    // reproduces it by running the contract entry on the reviewer's input (D-14).
    const confirmations = new Map<string, TaskReproductionConfirmation>();
    if (review.status === "ok") {
      for (const criterion of contract.criterion) {
        const measured = measurements.find((entry) => entry.criterionId === criterion.id);
        const row = review.rows.get(criterion.id);
        const reproduction = row?.finding?.reproduction ?? null;
        if (measured?.outcome !== "pass" || row?.verdict !== "fail" || row.severity !== "blocking" || reproduction === null) continue;
        confirmations.set(
          criterion.id,
          await confirmReviewerReproduction({ criterion, reproduction, root: snapshot, scratchRoot }),
        );
      }
    }

    // Re-hash before judging: a verdict is only about the bytes that were
    // measured and reviewed, never about whatever is on disk afterwards.
    const after = await collectTaskArtifact({ projectRoot, allowedRoots: contract.allowedRoots });
    const afterSnapshot = await collectTaskArtifact({ projectRoot: snapshot, allowedRoots: contract.allowedRoots });
    const artifactChanged =
      after.status !== "ok" ||
      after.digest !== artifact.digest ||
      afterSnapshot.status !== "ok" ||
      afterSnapshot.digest !== artifact.digest;
    const verdict = reduceTaskVerdict({
      contract,
      artifactDigest: artifact.digest,
      measurements,
      review,
      confirmations,
      preconditions,
      refusal: artifactChanged ? "stale-artifact" : null,
    });
    return await finish({
      ...record,
      status: verdict.overall,
      finishedAt: clock().toISOString(),
      verdict,
      nextAction: runNextAction(verdict),
    });
  } catch (error) {
    const message = bounded(error instanceof Error ? error.message : String(error), 300);
    const terminal = (base: TaskRunRecord): TaskRunRecord => ({
      ...base,
      status: "unknown",
      finishedAt: clock().toISOString(),
      verdict: null,
      stopReason: `internal-error: ${message}`,
      nextAction: "inspect the stop reason, repair the cause and approve a new contract revision",
    });
    let failed = terminal(record);
    try {
      await writeRunRecord(options.stateRoot, options.packageRoot, failed);
    } catch {
      // The richer record could not be persisted (for example it carried a
      // value the credential check refuses); fall back to what was proven
      // writable so the run never stays `executing`.
      failed = terminal(executing);
      await writeRunRecord(options.stateRoot, options.packageRoot, failed);
    }
    return { run: failed, recordPath };
  } finally {
    if (scratchRoot !== null) await rm(scratchRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
