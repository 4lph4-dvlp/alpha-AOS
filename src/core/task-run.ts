import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { HarnessId } from "../types.js";
import { reviewedDigest } from "./component-session.js";
import { nodeRuntimeEnvironment } from "./install.js";
import { packageRoot as defaultPackageRoot } from "./paths.js";
import { runProcess, type ProcessResult } from "./process.js";
import {
  assertTaskStartable,
  describeIssue,
  isTaskContractId,
  normalizeContractPath,
  TaskContractError,
  taskSchema,
  type TaskAgentPolicy,
  type TaskContract,
  type TaskCriterion,
} from "./task-contract.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";

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

export interface TaskRunExecutor {
  harness: string;
  version: string | null;
  executable: string | null;
  sessionId: string | null;
  exitCode: number | null;
  processCode: string;
  terminal: string;
  claim: ExecutorClaim | null;
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

export interface TaskRunVerdict {
  overall: "accepted" | "rejected" | "unknown";
  refusal: "stale-review" | null;
  rows: TaskVerdictRow[];
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

/** Path segments that are never part of a task artifact. */
const ARTIFACT_SKIPPED_SEGMENTS = new Set([".git", ".planning", ".alpha-aos", "node_modules"]);
const MEASUREMENT_TIMEOUT_MS = 30_000;
const MEASUREMENT_OUTPUT_BYTES = 64 * 1024;
const REPORT_TEXT_LIMIT = 4000;
const REPORT_LIST_LIMIT = 64;

function bounded(text: string, limit: number): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 3)}...`;
}

function digest12(digest: string): string {
  return digest.slice(0, 12);
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
// Artifact (the one thing measurement and review are both bound to)
// ---------------------------------------------------------------------------

class ArtifactRefusal extends Error {}

interface CollectedArtifact {
  digest: string;
  fileCount: number;
  totalBytes: number;
}

function outsideRoot(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

async function collectArtifact(projectRoot: string, allowedRoots: readonly string[]): Promise<CollectedArtifact> {
  const files = new Map<string, { sha256: string; size: number }>();

  async function walk(absolute: string, rel: string): Promise<void> {
    if (rel !== "" && rel.split("/").some((segment) => ARTIFACT_SKIPPED_SEGMENTS.has(segment))) return;
    let stat;
    try {
      stat = await lstat(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new ArtifactRefusal(`${rel === "" ? "." : rel} is a symbolic link`);
    if (stat.isDirectory()) {
      for (const name of (await readdir(absolute)).sort()) {
        await walk(join(absolute, name), rel === "" ? name : `${rel}/${name}`);
      }
      return;
    }
    if (!stat.isFile()) throw new ArtifactRefusal(`${rel} is not a regular file`);
    if (files.has(rel)) return;
    const content = await readFile(absolute);
    files.set(rel, { sha256: createHash("sha256").update(content).digest("hex"), size: content.byteLength });
  }

  for (const allowed of allowedRoots) {
    const entry = normalizeContractPath(allowed);
    const absolute = resolve(projectRoot, entry);
    const rel = relative(projectRoot, absolute);
    if (outsideRoot(rel)) throw new ArtifactRefusal(`allowed root ${entry} resolves outside the project root`);
    await walk(absolute, rel.split(sep).join("/"));
  }

  const paths = [...files.keys()].sort();
  const pairs = paths.map((path) => [path, (files.get(path) as { sha256: string }).sha256]);
  let totalBytes = 0;
  for (const file of files.values()) totalBytes += file.size;
  return { digest: reviewedDigest(TASK_ARTIFACT_DIGEST_KIND, pairs), fileCount: paths.length, totalBytes };
}

// ---------------------------------------------------------------------------
// Measurement (D-11: the executor's claim never enters here)
// ---------------------------------------------------------------------------

function pointerSegment(key: string): string {
  return /^[A-Za-z0-9_.-]{1,64}$/u.test(key) ? key.replaceAll("~", "~0").replaceAll("/", "~1") : "<key>";
}

/** The JSON pointer of the first place `actual` departs from `expected`. */
function firstDifference(expected: unknown, actual: unknown, path: string): string {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return path === "" ? "/" : path;
    for (let index = 0; index < expected.length; index += 1) {
      if (!isDeepStrictEqual(expected[index], actual[index])) {
        return firstDifference(expected[index], actual[index], `${path}/${index}`);
      }
    }
    return path === "" ? "/" : path;
  }
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (isObject(expected) && isObject(actual)) {
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    for (const key of keys) {
      if (!(key in expected) || !(key in actual)) return `${path}/${pointerSegment(key)}`;
      if (!isDeepStrictEqual(expected[key], actual[key])) {
        return firstDifference(expected[key], actual[key], `${path}/${pointerSegment(key)}`);
      }
    }
  }
  return path === "" ? "/" : path;
}

function compareJson(stream: "stdout" | "stderr", expected: unknown, text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.trim());
  } catch {
    return `${stream} is not a single JSON value`;
  }
  if (isDeepStrictEqual(parsed, expected)) return null;
  return `${stream} JSON differs from the expected value at ${firstDifference(expected, parsed, "")}`;
}

async function measureCriterion(
  criterion: TaskCriterion,
  index: number,
  projectRoot: string,
  scratchRoot: string,
): Promise<TaskMeasurement> {
  const unavailable = (detail: string, result?: ProcessResult): TaskMeasurement => ({
    criterionId: criterion.id,
    outcome: "unavailable",
    exitCode: result?.exitCode ?? null,
    stdoutSha256: result?.stdout.sha256 ?? null,
    detail: bounded(detail, 500),
  });
  const measurement = criterion.measurement;
  const entry = normalizeContractPath(measurement.entry);
  const entryPath = resolve(projectRoot, entry);
  const entryRel = relative(projectRoot, entryPath);
  if (entryRel === "" || outsideRoot(entryRel)) return unavailable("the measurement entry resolves outside the project root");
  try {
    const stat = await lstat(entryPath);
    if (!stat.isFile()) return unavailable(`the measurement entry ${entry} is not a regular file`);
  } catch {
    return unavailable(`the measurement entry ${entry} does not exist`);
  }

  const inputPath = join(scratchRoot, `${String(index).padStart(2, "0")}-${criterion.id}.input`);
  await writeFile(inputPath, measurement.inputText, "utf8");
  let result: ProcessResult;
  try {
    result = await runProcess({
      executable: process.execPath,
      args: [entryPath, inputPath],
      cwd: projectRoot,
      environment: nodeRuntimeEnvironment({ source: process.env }),
      timeoutMs: MEASUREMENT_TIMEOUT_MS,
      maxOutputBytes: MEASUREMENT_OUTPUT_BYTES,
      excerptBytes: MEASUREMENT_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return unavailable(`the measurement could not start (${typeof code === "string" ? code : "spawn-refused"})`);
  }
  if (result.code !== "ok" && result.code !== "non-zero-exit") {
    return unavailable(`the measurement ended with ${result.code}`, result);
  }
  if (result.stdout.capped || result.stderr.capped || result.outputCapped) {
    return unavailable("the measurement output exceeded its bound", result);
  }

  const expect = measurement.expect;
  const mismatches: string[] = [];
  if (result.exitCode !== expect.exitCode) mismatches.push(`exit code ${String(result.exitCode)}, expected ${expect.exitCode}`);
  if (expect.stdoutEmpty === true && result.stdout.totalBytes > 0) {
    mismatches.push(`stdout carried ${result.stdout.totalBytes} bytes, expected none`);
  }
  if (expect.stdoutJson !== undefined) {
    const mismatch = compareJson("stdout", expect.stdoutJson, result.stdout.excerpt);
    if (mismatch !== null) mismatches.push(mismatch);
  }
  if (expect.stderrJson !== undefined) {
    const mismatch = compareJson("stderr", expect.stderrJson, result.stderr.excerpt);
    if (mismatch !== null) mismatches.push(mismatch);
  }
  return {
    criterionId: criterion.id,
    outcome: mismatches.length === 0 ? "pass" : "fail",
    exitCode: result.exitCode,
    stdoutSha256: result.stdout.sha256,
    detail:
      mismatches.length === 0
        ? `exit code ${String(result.exitCode)} and output matched the contract`
        : bounded(mismatches[0] as string, 500),
  };
}

// ---------------------------------------------------------------------------
// Verdict reduction
// ---------------------------------------------------------------------------

interface ReductionInput {
  contract: TaskContract;
  contractDigest: string;
  artifactDigest: string;
  request: ReviewRequest;
  measurements: readonly TaskMeasurement[];
  report: TaskReviewReport | null;
  reportIssue: string | null;
  artifactChanged: boolean;
}

function staleness(input: ReductionInput): string | null {
  if (input.artifactChanged) return "the artifact changed after it was measured and handed to review";
  const report = input.report;
  if (report === null) return null;
  if (report.requestId !== input.request.requestId) return "the review report answers a different review request";
  if (report.contractId !== input.contract.id) return "the review report names a different contract";
  if (report.contractDigest !== input.contractDigest) return "the review report is bound to a different contract digest";
  if (report.artifactDigest !== input.artifactDigest) return "the review report is bound to a different artifact digest";
  return null;
}

/**
 * Measurement decides failure; review can only confirm a measured pass. The
 * executor claim and exit code are deliberately not inputs (D-11).
 */
function reduceVerdict(input: ReductionInput): { verdict: TaskRunVerdict; nextAction: string | null } {
  const artifact = digest12(input.artifactDigest);
  const stale = staleness(input);
  const usable = stale === null ? input.report : null;
  const rerunReview = `re-run the review on artifact ${artifact}`;

  const rows = input.contract.criterion.map((criterion): TaskVerdictRow => {
    const measured = input.measurements.find((entry) => entry.criterionId === criterion.id) ?? {
      criterionId: criterion.id,
      outcome: "unavailable" as const,
      exitCode: null,
      stdoutSha256: null,
      detail: "the criterion was not measured",
    };
    const matches = usable?.criteria.filter((entry) => entry.criterionId === criterion.id) ?? [];
    const reviewed = matches.length === 1 ? (matches[0] as TaskReviewCriterion) : null;
    const review = reviewed === null ? null : { verdict: reviewed.verdict, severity: reviewed.severity, evidence: reviewed.evidence };
    const row = (verdict: TaskVerdictRow["verdict"], reason: string, nextAction: string | null): TaskVerdictRow => ({
      criterionId: criterion.id,
      verdict,
      measured,
      review,
      artifactDigest: input.artifactDigest,
      reason: bounded(reason, 1000),
      nextAction,
    });

    if (measured.outcome === "fail") {
      return row("fail", `measured fail: ${measured.detail}${review === null ? "" : `; review ${review.verdict}`}`, null);
    }
    if (measured.outcome === "unavailable") {
      return row(
        "unknown",
        `measurement unavailable: ${measured.detail}`,
        `restore the measurement environment and re-measure ${criterion.id} on artifact ${artifact}`,
      );
    }
    if (stale !== null) return row("unknown", `measured pass; review refused as stale: ${stale}`, rerunReview);
    if (input.reportIssue !== null) return row("unknown", `measured pass; ${input.reportIssue}`, rerunReview);
    if (reviewed === null) {
      const missing = matches.length === 0 ? "no verdict" : "more than one verdict";
      return row("unknown", `measured pass; the review has ${missing} for this criterion`, rerunReview);
    }
    if (reviewed.verdict === "pass") return row("pass", "measured pass; review pass", null);
    const because = reviewed.abstainReason ?? reviewed.finding?.summary ?? reviewed.evidence;
    return row("unknown", `measured pass; review ${reviewed.verdict}: ${because}`, rerunReview);
  });

  const failing = rows.filter((row) => row.verdict === "fail").map((row) => row.criterionId);
  const unknown = rows.find((row) => row.verdict === "unknown");
  const overall: TaskRunVerdict["overall"] =
    failing.length > 0 ? "rejected" : unknown !== undefined || stale !== null ? "unknown" : "accepted";
  const nextAction =
    overall === "accepted"
      ? null
      : overall === "rejected"
        ? `fix the failing criteria (${failing.join(", ")}) and approve a new contract revision; this approval is consumed`
        : (unknown?.nextAction ?? rerunReview);
  return { verdict: { overall, refusal: stale === null ? null : "stale-review", rows }, nextAction };
}

// ---------------------------------------------------------------------------
// startTask
// ---------------------------------------------------------------------------

function controllerPrompt(contract: TaskContract, contractDigest: string): string {
  return [
    `Task contract ${contract.id} revision ${contract.revision} (digest ${contractDigest}).`,
    `Goal: ${contract.goal}`,
    `Scope: ${contract.scope.summary}`,
    `Workflow: ${contract.scope.workflow}`,
    `Allowed roots: ${contract.allowedRoots.join(", ")}`,
    `Allowed effects: ${contract.allowedEffects.join(", ")}`,
    "Mandatory criteria:",
    ...contract.criterion.map((criterion) => `- ${criterion.id}: ${criterion.title} — ${criterion.description}`),
  ].join("\n");
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
  };
}

/**
 * Starts one run of an approved contract. The first record written consumes
 * the approval, so one approval authorizes exactly one run (D-02, AUTO-03).
 */
export async function startTask(options: StartTaskOptions): Promise<{ run: TaskRunRecord; recordPath: string }> {
  const clock = options.now ?? (() => new Date());
  const { loaded } = await assertTaskStartable(options);
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

  const started = clock();
  const runId = `${started.getTime().toString(36).padStart(8, "0")}-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
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
  };
  const recordPath = await writeRunRecord(options.stateRoot, options.packageRoot, executing);

  let record = executing;
  let scratchRoot: string | null = null;
  try {
    scratchRoot = await mkdtemp(join(tmpdir(), "alpha-aos-task-run-"));
    const projectRoot = resolve(contract.scope.projectRoot);
    const minutes = contract.resourcePolicy.maxWallTimeMinutes;
    const deadlineAt = minutes === undefined ? null : new Date(started.getTime() + minutes * 60_000).toISOString();

    const dispatched = await options.ports.controller.dispatch({
      runId,
      contract,
      contractDigest: digest,
      projectRoot,
      scratchRoot,
      decisionLogPath: `.alpha-aos/task-runs/${runId}/decisions.jsonl`,
      prompt: controllerPrompt(contract, digest),
      deadlineAt,
    });
    record = { ...record, executor: executorBlock(dispatched) };

    const artifact = await collectArtifact(projectRoot, contract.allowedRoots);
    record = { ...record, artifact };

    const measurements: TaskMeasurement[] = [];
    for (const [index, criterion] of contract.criterion.entries()) {
      measurements.push(await measureCriterion(criterion, index, projectRoot, scratchRoot));
    }

    const request: ReviewRequest = {
      runId,
      requestId: randomUUID(),
      sessionId: randomUUID(),
      contract,
      contractDigest: digest,
      artifactDigest: artifact.digest,
      reviewRoot: projectRoot,
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

    // Re-hash before judging: a verdict is only about the bytes that were
    // measured and reviewed, never about whatever is on disk afterwards.
    const after = await collectArtifact(projectRoot, contract.allowedRoots);
    const { verdict, nextAction } = reduceVerdict({
      contract,
      contractDigest: digest,
      artifactDigest: artifact.digest,
      request,
      measurements,
      report: checked.report,
      reportIssue: checked.issue,
      artifactChanged: after.digest !== artifact.digest,
    });
    record = { ...record, status: verdict.overall, finishedAt: clock().toISOString(), verdict, nextAction };
    await writeRunRecord(options.stateRoot, options.packageRoot, record);
    return { run: record, recordPath };
  } catch (error) {
    const refused = error instanceof ArtifactRefusal;
    const message = bounded(error instanceof Error ? error.message : String(error), 300);
    const terminal = (base: TaskRunRecord): TaskRunRecord => ({
      ...base,
      status: "unknown",
      finishedAt: clock().toISOString(),
      verdict: null,
      stopReason: refused ? `artifact-refused: ${message}` : `internal-error: ${message}`,
      nextAction: refused
        ? "remove the refused entry from the allowed roots and approve a new contract revision"
        : "inspect the stop reason, repair the cause and approve a new contract revision",
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
