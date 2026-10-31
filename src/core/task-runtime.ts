import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import { evaluateResourceLimits, detectQuotaExhaustion, type TaskContract } from "./task-contract.js";
import { aggregateTaskUsage, checkCostMeterReadiness, normalizeHarnessTelemetry, type NormalizedTelemetry, type TaskUsageObservation } from "./task-telemetry.js";
import { isProcessAlive } from "./writer-lock.js";
import { assertNoSymlinksInPathAndAncestors, readBoundedFile, writeAtomicPrivateFile } from "./command-jobs.js";
import type { HarnessId } from "../types.js";
import { collectCodexSessionFamily } from "./task-native-sessions.js";

/** Runtime observations only. No phase or acceptance state is owned here. */
export interface TaskProcessEvidence {
  cwd?: string;
  nativeSessionId: string | null;
  processCode: string;
  exitCode: number | null;
  terminal: string;
  closeConfirmed: boolean;
}

export interface TaskDispatchObservation {
  schemaVersion: 1;
  dispatchId: string;
  contractDigest: string;
  runId: string;
  role: "controller" | "executor" | "reviewer";
  harness: HarnessId;
  model: string | null;
  startedAt: string;
  finishedAt: string | null;
  host: string;
  ownerPid: number;
  childPid: number | null;
  sessionId: string | null;
  status: "running" | "completed" | "failed" | "interrupted";
  reason: string | null;
  telemetry: NormalizedTelemetry;
  jobId?: string;
  ordinal?: number;
  effort?: string | null;
  nativeObservations?: TaskUsageObservation[];
  nativeCoverage?: "family" | "dispatch-only" | "unknown";
  cycleBoundary?: boolean;
  projectRoot?: string;
  nativeCwd?: string;
  nativeSessionRoot?: string;
  processCode?: string | null;
  exitCode?: number | null;
  terminal?: string | null;
  closeConfirmed?: boolean | null;
  protocolSessionId?: string | null;
  launchState?: "not-spawned" | "process-only" | "native-session";
}

async function recoverNativeUsage(record: TaskDispatchObservation, now = new Date()): Promise<void> {
  record.sessionId ??= record.telemetry.nativeSessionId ?? null;
  if (record.harness !== "codex" || record.sessionId === null || !record.projectRoot) return;
  try {
    const family = await collectCodexSessionFamily({ sessionId: record.sessionId, projectRoot: record.nativeCwd ?? record.projectRoot,
      contractDigest: record.contractDigest, runId: record.runId, attemptId: record.dispatchId, role: record.role,
      sessionRoot: record.nativeSessionRoot, now });
    record.nativeCoverage = family === null ? (/^[a-f0-9-]{36}$/u.test(record.sessionId) ? "unknown" : "dispatch-only") : "family";
    if (family !== null) record.nativeObservations = family;
  } catch {
    record.nativeCoverage = "unknown";
  }
}

function runtimeRoot(stateRoot: string, digest: string): string {
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new Error("Invalid runtime contract digest");
  return join(stateRoot, "runs", digest, "dispatches");
}

export async function readTaskDispatches(stateRoot: string, digest: string): Promise<TaskDispatchObservation[]> {
  const root = runtimeRoot(stateRoot, digest);
  await assertNoSymlinksInPathAndAncestors(root);
  let names: string[];
  try { names = await readdir(root); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: TaskDispatchObservation[] = [];
  for (const name of names.filter((value) => /^[a-f0-9]{64}\.json$/u.test(value)).sort()) {
    const text = await readBoundedFile(join(root, name), stateRoot, 64 * 1024, undefined, true);
    const record = JSON.parse(text) as TaskDispatchObservation;
    if (record.schemaVersion !== 1 || record.contractDigest !== digest ||
      name !== `${record.dispatchId}.json` || !Number.isInteger(record.ownerPid) ||
      record.ownerPid <= 0 || !Number.isFinite(Date.parse(record.startedAt)) ||
      (record.finishedAt !== null && !Number.isFinite(Date.parse(record.finishedAt))) ||
      !["running", "completed", "failed", "interrupted"].includes(record.status)) throw new Error("Invalid runtime dispatch observation");
    if (record.sessionId === null && record.telemetry.nativeSessionId) record.sessionId = record.telemetry.nativeSessionId;
    if (record.jobId && (record.status === "running" || record.status === "completed")) {
      const { getCommandJobStatus } = await import("./command-jobs.js");
      const job = await getCommandJobStatus(stateRoot, record.jobId);
      if (!["running", "pending", "completed"].includes(job.status)) {
        record.status = job.status === "orphaned" ? "interrupted" : "failed";
        record.reason = job.error?.code === "QUOTA_EXHAUSTED" ? "quota_exhausted" : `native_job_${job.status}`;
      }
    }
    if (record.closeConfirmed === false) { record.status = "interrupted"; record.reason ??= "process_close_unconfirmed"; }
    if (record.status === "running" && record.host === hostname() && !isProcessAlive(record.ownerPid)) {
      record.status = "interrupted";
      record.reason = record.childPid !== null && isProcessAlive(record.childPid)
        ? "parent_exited_child_may_be_alive: inspect native handle before resume" : "parent_exited: completion unobserved";
    }
    if (record.status === "interrupted" || record.nativeCoverage === "unknown") await recoverNativeUsage(record);
    records.push(record);
  }
  return records;
}

/** Explicit resume reconciliation. Missing PIDs are never used to kill a new
 * process, and a possibly live descendant blocks relaunch. */
export async function reconcileTaskRuntime(stateRoot: string, digest: string): Promise<void> {
  const root = runtimeRoot(stateRoot, digest);
  const records = await readTaskDispatches(stateRoot, digest);
  const interrupted = records.filter((record) => record.status === "interrupted");
  if (records.some((record) => record.status === "running") || interrupted.some((record) =>
    record.closeConfirmed !== true || record.host !== hostname())) throw new TaskResourceError("runtime_dispatch_unresolved");
  const lockPath = join(root, "dispatch.lock");
  let lockText: string | null = null;
  try { await lstat(lockPath); lockText = await readBoundedFile(lockPath, stateRoot, 4096); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (lockText !== null) {
    const lock = JSON.parse(lockText) as { host: string; pid: number; digest: string; token: string; ownerSettled?: boolean };
    if (lock.host !== hostname() || lock.digest !== digest || !Number.isInteger(lock.pid) ||
      (isProcessAlive(lock.pid) && lock.ownerSettled !== true) || !lock.token) {
      throw new TaskResourceError("runtime_dispatch_unresolved");
    }
  }
  for (const record of interrupted) {
    await recoverNativeUsage(record);
    record.status = "failed";
    record.finishedAt ??= new Date().toISOString();
    await writeAtomicPrivateFile(join(root, `${record.dispatchId}.json`), `${JSON.stringify(record)}\n`, 64 * 1024, stateRoot);
  }
  if (lockText !== null) {
    if (await readBoundedFile(lockPath, stateRoot, 4096) !== lockText) throw new TaskResourceError("runtime_lock_changed");
    await unlink(lockPath);
  }
}

export function dispatchUsage(records: readonly TaskDispatchObservation[]) {
  const canonical = records.flatMap((record) => record.nativeObservations ?? []);
  const canonicalSessions = new Set(canonical.map((entry) => entry.sessionId));
  const fallback = records.filter((record) => !canonicalSessions.has(record.sessionId ?? record.telemetry.nativeSessionId ?? ""));
  const totals = aggregateTaskUsage([...canonical, ...fallback.map((record): TaskUsageObservation => ({
    contractDigest: record.contractDigest, runId: record.runId, attemptId: record.dispatchId,
    // A native process result is a dispatch-local total, not a session watermark.
    sessionId: record.telemetry.aggregation === "session-cumulative" ? record.telemetry.nativeSessionId ?? record.sessionId ?? record.dispatchId : record.dispatchId,
    parentSessionId: null, role: record.role, model: record.model,
    effort: record.effort ?? null, tier: null, source: "native-dispatch-result",
    mode: record.telemetry.aggregation === "session-cumulative" ? "cumulative" : "response", scope: "self",
    observationId: record.dispatchId, sequence: record.ordinal ?? 0,
    observedModelCalls: record.telemetry.observedModelCalls ?? null, granularity: "turn",
    telemetry: record.telemetry,
  }))]);
  if (records.some((record) => record.nativeCoverage === "unknown")) totals.tokens = null;
  return totals;
}

async function publishObservation(stateRoot: string, record: TaskDispatchObservation, contract: TaskContract): Promise<void> {
  try { const { publishTaskSessionDispatch } = await import("./task-session.js"); await publishTaskSessionDispatch(stateRoot, record, contract); }
  catch { process.emitWarning("Task progress delivery failed; dispatch remains authoritative", { code: "AOS_PROGRESS_DELIVERY" }); }
}
export class TaskResourceError extends Error {
  constructor(readonly stopCode: string) { super(`Task resource guard: ${stopCode}`); }
}

export async function meteredTaskDispatch<T extends { sessionId: string | null; nativeSessionId?: string | null; telemetry?: NormalizedTelemetry;
  detail?: string | null; issues?: string[]; processCode?: string; exitCode?: number | null; terminal?: string; closeConfirmed?: boolean }>(options: {
  stateRoot: string; contract: TaskContract; digest: string; runId: string;
  role: TaskDispatchObservation["role"];
  jobId?: string | undefined;
  nativeSessionRoot?: string | undefined;
  cycleBoundary?: boolean | undefined;
  invoke: (observer: { onSpawn: (child: { pid: number }) => void; onTelemetry: (meter: NormalizedTelemetry) => void;
    onProcess: (evidence: TaskProcessEvidence) => void; deadlineAt: string | null }) => Promise<T>;
  now?: (() => Date) | undefined;
}): Promise<T> {
  const clock = options.now ?? (() => new Date());
  const readiness = checkCostMeterReadiness(options.contract.agentPolicy, options.contract.resourcePolicy);
  if (!readiness.ready) throw new TaskResourceError("telemetry_unavailable");
  const root = runtimeRoot(options.stateRoot, options.digest);
  await assertNoSymlinksInPathAndAncestors(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const lockPath = join(root, "dispatch.lock");
  // A crash leaves a lock for explicit recovery. Never dispatch concurrently or
  // steal a lock based only on PID existence; no reservation/hard-cap claim.
  const lock = await open(lockPath, "wx", 0o600).catch(() => { throw new TaskResourceError("runtime_dispatch_unresolved"); });
  const lockPayload = { host: hostname(), pid: process.pid, digest: options.digest, token: randomUUID(), ownerSettled: false };
  const lockText = JSON.stringify(lockPayload);
  await lock.writeFile(lockText);
  await lock.sync();
  let record: TaskDispatchObservation | null = null;
  let spawnWrite = Promise.resolve();
  const persist = async () => {
    if (record === null) return;
    await writeAtomicPrivateFile(join(root, `${record.dispatchId}.json`), `${JSON.stringify(record)}\n`, 64 * 1024, options.stateRoot);
  };
  try {
    const prior = await readTaskDispatches(options.stateRoot, options.digest);
    if (prior.some((entry) => entry.status === "running" || entry.status === "interrupted")) throw new TaskResourceError("runtime_dispatch_unresolved");
    const usage = dispatchUsage(prior);
    const started = clock();
    const first = prior.reduce((value, entry) => Math.min(value, Date.parse(entry.startedAt)), started.getTime());
    const check = evaluateResourceLimits(options.contract.resourcePolicy, { cycles: options.cycleBoundary ? prior.filter((entry) => entry.cycleBoundary).length : 0,
      wallTimeMs: Math.max(0, started.getTime() - first), tokens: options.contract.resourcePolicy.maxTokens !== undefined && usage.knownTokens >= options.contract.resourcePolicy.maxTokens ? usage.knownTokens : usage.tokens, costUsd: usage.costUsd });
    if (check.exceeded) throw new TaskResourceError(check.stopCode!);
    const minutes = options.contract.resourcePolicy.maxWallTimeMinutes;
    const deadlineAt = minutes === undefined ? null : new Date(first + minutes * 60_000).toISOString();
    const dispatchId = createHash("sha256").update(`${options.digest}:${options.runId}:${options.role}:${randomUUID()}`).digest("hex");
    const harness = options.contract.agentPolicy[options.role];
    record = { schemaVersion: 1, dispatchId, contractDigest: options.digest, runId: options.runId, role: options.role,
      harness, model: options.contract.agentPolicy[`${options.role}Model`] ?? null,
      startedAt: started.toISOString(), finishedAt: null, host: hostname(), ownerPid: process.pid,
      childPid: null, sessionId: null, status: "running", reason: null, telemetry: normalizeHarnessTelemetry(harness, null) };
    record.projectRoot = options.contract.scope.projectRoot;
    if (options.nativeSessionRoot) record.nativeSessionRoot = options.nativeSessionRoot;
    if (options.jobId) record.jobId = options.jobId;
    record.ordinal = prior.length;
    record.effort = options.contract.agentPolicy[`${options.role}Effort`] ?? null;
    if (options.cycleBoundary) record.cycleBoundary = true;
    await persist();
    await publishObservation(options.stateRoot, record, options.contract);
    let writeError: unknown = null;
    const queuePersist = () => { spawnWrite = spawnWrite.then(persist).catch((error: unknown) => { writeError = error; }); };
    const result = await options.invoke({ deadlineAt, onTelemetry: (telemetry) => {
      record = { ...record!, telemetry };
      queuePersist();
    }, onSpawn: ({ pid }) => {
      record = { ...record!, childPid: pid };
      queuePersist();
    }, onProcess: (evidence) => {
      record = { ...record!, processCode: evidence.processCode, exitCode: evidence.exitCode, terminal: evidence.terminal,
        closeConfirmed: evidence.closeConfirmed, sessionId: evidence.nativeSessionId,
        ...(evidence.cwd ? { nativeCwd: evidence.cwd } : {}) };
      queuePersist();
    } });
    await spawnWrite;
    if (writeError !== null) throw writeError;
    const detail = result.detail ?? result.issues?.join("; ") ?? "";
    const nativeSessionId = result.nativeSessionId ?? result.telemetry?.nativeSessionId ?? record.telemetry.nativeSessionId
      ?? record.sessionId ?? null;
    const processCode = result.processCode ?? record.processCode ?? null;
    const exitCode = result.exitCode ?? record.exitCode ?? null;
    const terminal = result.terminal ?? record.terminal ?? null;
    const processFailed = (processCode !== null && processCode !== "ok") ||
      (exitCode !== null && exitCode !== 0) || (terminal !== null && terminal !== "completed");
    // A protocol/report session ID alone is not native process evidence. A
    // streamed/explicit native handle is, even when no PID could be retained.
    const processObserved = record.childPid !== null || (processCode !== null && ![
      "spawn-failed", "unsupported-executable", "environment-conflict", "missing-required-environment",
    ].includes(processCode));
    const nativeObserved = processObserved || nativeSessionId !== null;
    const confirmed = result.closeConfirmed ?? record.closeConfirmed ??
      (exitCode !== null ? true : nativeObserved ? false : null);
    const unresolved = confirmed === false;
    record = { ...record, sessionId: nativeSessionId, protocolSessionId: result.sessionId,
      processCode, exitCode, terminal,
      closeConfirmed: confirmed,
      launchState: nativeSessionId !== null ? "native-session" : processObserved ? "process-only" : "not-spawned",
      finishedAt: clock().toISOString(), status: unresolved ? "interrupted" : processFailed ? "failed" : "completed",
      reason: detectQuotaExhaustion(detail) ? "quota_exhausted" : unresolved ? "process_close_unconfirmed"
        : processFailed ? (processCode !== null && processCode !== "ok" ? `process_${processCode}`
          : terminal !== null && terminal !== "completed" ? `native_${terminal}` : "non_zero_exit") : null,
      telemetry: result.telemetry ?? record.telemetry };
    if (record.reason === "quota_exhausted" && !unresolved) record.status = "failed";
    await recoverNativeUsage(record, clock());
    await persist();
    await publishObservation(options.stateRoot, record, options.contract);
    const observed = dispatchUsage([...prior, record]);
    if (record.status === "completed" && ((options.contract.resourcePolicy.maxTokens !== undefined && observed.tokens === null) ||
      (options.contract.resourcePolicy.maxCostUsd !== undefined && observed.costUsd === null))) {
      throw new TaskResourceError("telemetry_unavailable");
    }
    return result;
  } catch (error) {
    await spawnWrite;
    if (record !== null) {
      const unresolved = record.closeConfirmed !== true && (record.childPid !== null || record.closeConfirmed === false ||
        record.sessionId !== null || record.telemetry.nativeSessionId != null);
      record = { ...record, status: unresolved ? "interrupted" : "failed", finishedAt: clock().toISOString(), reason: error instanceof TaskResourceError
        ? error.stopCode : detectQuotaExhaustion(String(error)) ? "quota_exhausted" : "dispatch_failed" };
      if (unresolved) record.closeConfirmed = false;
      await recoverNativeUsage(record, clock());
      await persist();
      await publishObservation(options.stateRoot, record, options.contract);
    }
    throw error;
  } finally {
    if (await readBoundedFile(lockPath, options.stateRoot, 4096) !== lockText) throw new TaskResourceError("runtime_lock_changed");
    if (record?.status === "interrupted") {
      const payload = Buffer.from(JSON.stringify({ ...lockPayload, ownerSettled: true }));
      await lock.write(payload, 0, payload.length, 0);
      await lock.truncate(payload.length);
      await lock.sync();
      await lock.close();
    } else {
      await lock.close();
      await unlink(lockPath);
    }
  }
}


