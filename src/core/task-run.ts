import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { HarnessId } from "../types.js";
import { packageRoot as defaultPackageRoot } from "./paths.js";
import {
  collectTaskArtifact,
  materializeTaskSnapshot,
  measureTaskCriterion,
  type TaskArtifactCause,
  type TaskMeasurementSubstitute,
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
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";

export { TASK_ARTIFACT_DIGEST_KIND, type TaskDecision, type TaskDecisionCategory } from "./task-check.js";

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
  refusal: "stale-review" | "stale-artifact" | null;
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
      cause: "spawn-failed" as const,
      measuredBy: "contract" as const,
      substituteDecisionId: null,
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

    const collected = await collectTaskArtifact({ projectRoot, allowedRoots: contract.allowedRoots });
    if (collected.status === "unavailable") {
      record = {
        ...record,
        status: "unknown",
        finishedAt: clock().toISOString(),
        stopReason: `${collected.cause}: ${collected.detail}`,
        nextAction: artifactNextAction(collected.cause),
      };
      await writeRunRecord(options.stateRoot, options.packageRoot, record);
      return { run: record, recordPath };
    }
    const artifact = { digest: collected.digest, fileCount: collected.fileCount, totalBytes: collected.totalBytes };
    record = { ...record, artifact };

    // Measurement and review both run against this copy, never the live tree.
    const snapshot = await materializeTaskSnapshot({
      manifest: collected,
      projectRoot,
      destination: join(scratchRoot, "snapshot"),
    });
    const substitutes: TaskMeasurementSubstitute[] = [];
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

    // Re-hash before judging: a verdict is only about the bytes that were
    // measured and reviewed, never about whatever is on disk afterwards.
    const after = await collectTaskArtifact({ projectRoot, allowedRoots: contract.allowedRoots });
    const afterSnapshot = await collectTaskArtifact({ projectRoot: snapshot, allowedRoots: contract.allowedRoots });
    const { verdict, nextAction } = reduceVerdict({
      contract,
      contractDigest: digest,
      artifactDigest: artifact.digest,
      request,
      measurements,
      report: checked.report,
      reportIssue: checked.issue,
      artifactChanged:
        after.status !== "ok" ||
        after.digest !== artifact.digest ||
        afterSnapshot.status !== "ok" ||
        afterSnapshot.digest !== artifact.digest,
    });
    record = { ...record, status: verdict.overall, finishedAt: clock().toISOString(), verdict, nextAction };
    await writeRunRecord(options.stateRoot, options.packageRoot, record);
    return { run: record, recordPath };
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
