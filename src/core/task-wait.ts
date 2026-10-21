import { createHash } from "node:crypto";
import { open, lstat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  runDirectory,
  runCheckpointPath,
  runJournalPath,
  type TaskCheckpoint,
  type TaskJournalEvent,
  type TaskJournalEventKind,
} from "./task-journal.js";
import { validateTaskRunText, taskRunPath, type TaskRunRecord } from "./task-run.js";
import { isTaskContractId } from "./task-contract.js";
import {
  waitForCompletion,
  validateNumericFlag,
  type CompletionCheckResult,
  MAX_OBSERVER_TIMEOUT_MS,
} from "./completion-wait.js";
import { isProcessAlive } from "./writer-lock.js";
import { packageRoot as defaultPackageRoot } from "./paths.js";
import type { ControllerLockRecord } from "./controller-lease.js";

export type TaskWaitScope = "attempt" | "supervisor";

export interface TaskWaitOptions {
  readonly stateRoot: string;
  readonly projectRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
  readonly contractId: string;
  readonly runId: string;
  readonly contractDigest: string;
  readonly revision: number;
  readonly scope?: TaskWaitScope | undefined;
  readonly timeoutMs?: number | undefined;
  readonly signal?: AbortSignal | undefined;
  readonly _onRunReadBarrier?: ((rawRunText: string) => Promise<void> | void) | undefined;
}

export interface TaskWaitResult {
  readonly ok: boolean;
  readonly status: "completed" | "timeout" | "aborted" | "refused" | "unresolved";
  readonly scope: TaskWaitScope;
  readonly contractId: string;
  readonly runId: string;
  readonly contractDigest: string;
  readonly revision: number;
  readonly taskStatus?: string;
  readonly attemptIndex?: number;
  readonly stopReason?: string | null;
  readonly reasonCode?: string;
  readonly reason?: string;
  readonly nextAction?: string;
}

const TERMINAL_RUN_STATUSES = new Set(["accepted", "rejected", "blocked", "stopped", "unknown"]);
const TERMINAL_CHECKPOINT_STATUSES = new Set(["accepted", "rejected", "blocked", "stopped"]);
const VALID_CHECKPOINT_STATUSES = new Set([
  "pending",
  "running",
  "accepted",
  "rejected",
  "blocked",
  "stopped",
  "needs-input",
]);
const KNOWN_JOURNAL_EVENT_KINDS = new Set<TaskJournalEventKind>([
  "run_started",
  "attempt_started",
  "attempt_finished",
  "effect_planned",
  "effect_performing",
  "effect_applied",
  "effect_failed",
  "effect_reconciled",
  "strategy_changed",
  "limit_exceeded",
  "blocked",
  "accepted",
  "rejected",
  "process_cancelled",
  "prompt_answered",
  "needs_input",
]);

const ZERO_INDEX_ALLOWED_EVENT_KINDS = new Set<TaskJournalEventKind>([
  "run_started",
  "process_cancelled",
  "limit_exceeded",
  "blocked",
]);

const RUN_LINK_EVENT_KINDS = new Set<TaskJournalEventKind>([
  "attempt_started", "attempt_finished", "accepted", "rejected", "blocked",
  "process_cancelled", "limit_exceeded",
]);

const CANONICAL_RUN_ID_REGEX = /^[0-9a-z]{8,}-[0-9a-f]{8}$/;
const EXACT_64_HEX_REGEX = /^[0-9a-f]{64}$/;
const VALID_HARNESSES = new Set(["claude", "codex", "antigravity", "pi", "hermes"]);

const CHECKPOINT_ALLOWED_KEYS = new Set([
  "schemaVersion",
  "contractDigest",
  "contractId",
  "revision",
  "status",
  "attemptIndex",
  "lastSequence",
  "lastVerifiedHead",
  "usage",
  "stopReason",
  "updatedAt",
]);

const CHECKPOINT_USAGE_ALLOWED_KEYS = new Set([
  "cycles",
  "wallTimeMs",
  "tokens",
  "costUsd",
]);

const CONTROLLER_LOCK_ALLOWED_KEYS = new Set([
  "schemaVersion",
  "harness",
  "token",
  "pid",
  "host",
  "startedAt",
  "contractDigest",
]);

const JOURNAL_EVENT_ALLOWED_KEYS = new Set([
  "sequence",
  "timestamp",
  "kind",
  "contractDigest",
  "attemptIndex",
  "payload",
]);

const UTF8_FATAL_DECODER = new TextDecoder("utf-8", { fatal: true });

interface PinnedOwner {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
  readonly contractDigest: string;
  readonly harness: string;
}

/**
 * Checks all directory ancestors for symlink/reparse points.
 * Fails closed if any component is a symbolic link.
 */
async function verifyPathAncestorsNotSymlinks(filePath: string): Promise<void> {
  const resolved = resolve(filePath);
  let curr = resolved;
  while (true) {
    const parent = dirname(curr);
    if (parent === curr) break;
    let st;
    try {
      st = await lstat(parent);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    if (st.isSymbolicLink()) {
      throw new Error(`Ancestor directory is a symlink or reparse point: ${parent}`);
    }
    curr = parent;
  }
}

/**
 * Reads a regular file using bounded file handles with pre- and post-read ancestor and lstat checks.
 * Enforces a strict byte ceiling, ties identities, uses fatal UTF-8 decoding, and rejects symlinks.
 */
async function safeReadBoundedFile(
  filePath: string,
  maxBytes: number,
): Promise<string | null> {
  const resolved = resolve(filePath);
  await verifyPathAncestorsNotSymlinks(resolved);

  let preStat;
  try {
    preStat = await lstat(resolved);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
  if (preStat.isSymbolicLink()) {
    throw new Error(`Path is a symlink or reparse point: ${resolved}`);
  }
  if (!preStat.isFile()) {
    throw new Error(`Path is not a regular file: ${resolved}`);
  }
  if (preStat.size > maxBytes) {
    throw new Error(`File size ${preStat.size} exceeds ceiling ${maxBytes}: ${resolved}`);
  }

  let handle;
  try {
    handle = await open(resolved, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  try {
    const fstat = await handle.stat();
    if (!fstat.isFile()) {
      throw new Error(`Path is not a regular file: ${resolved}`);
    }
    if (fstat.size > maxBytes) {
      throw new Error(`File size ${fstat.size} exceeds ceiling ${maxBytes}: ${resolved}`);
    }
    if (preStat.ino !== 0 && fstat.ino !== 0) {
      if (preStat.ino !== fstat.ino || preStat.dev !== fstat.dev) {
        throw new Error(`File identity mismatch between lstat and fstat: ${resolved}`);
      }
    }

    const buf = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buf, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) {
      throw new Error(`Bytes read ${bytesRead} exceeds ceiling ${maxBytes}: ${resolved}`);
    }

    const extra = Buffer.alloc(1);
    const { bytesRead: extraRead } = await handle.read(extra, 0, 1, bytesRead);
    if (extraRead > 0) {
      throw new Error(`File grew beyond bytes read or ceiling: ${resolved}`);
    }

    const postStat = await lstat(resolved);
    if (postStat.isSymbolicLink()) {
      throw new Error(`Path is a symlink or reparse point: ${resolved}`);
    }
    if (!postStat.isFile()) {
      throw new Error(`Path is not a regular file: ${resolved}`);
    }
    if (fstat.ino !== 0 && postStat.ino !== 0) {
      if (fstat.ino !== postStat.ino || fstat.dev !== postStat.dev) {
        throw new Error(`File identity changed during read: ${resolved}`);
      }
    }
    await verifyPathAncestorsNotSymlinks(resolved);

    try {
      return UTF8_FATAL_DECODER.decode(buf.subarray(0, bytesRead));
    } catch (err) {
      throw new Error(`Fatal UTF-8 decoding error: ${err instanceof Error ? err.message : String(err)}`);
    }
  } finally {
    await handle.close();
  }
}

function validateCheckpointRecord(
  raw: string,
  expected: { contractDigest: string; contractId: string; revision: number },
): { ok: true; value: TaskCheckpoint } | { ok: false; code: string; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      code: "FORGED_CHECKPOINT",
      reason: `Checkpoint parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint is not a JSON object" };
  }

  for (const key of Object.keys(parsed)) {
    if (!CHECKPOINT_ALLOWED_KEYS.has(key)) {
      return { ok: false, code: "FORGED_CHECKPOINT", reason: `Checkpoint has unknown property: ${key}` };
    }
  }

  const cp = parsed as Record<string, unknown>;
  if (cp.schemaVersion !== 1) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint schemaVersion must be 1" };
  }
  if (cp.contractDigest !== expected.contractDigest) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint contractDigest mismatch" };
  }
  if (cp.contractId !== expected.contractId) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint contractId mismatch" };
  }
  if (cp.revision !== expected.revision) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint revision mismatch" };
  }
  if (typeof cp.status !== "string" || !VALID_CHECKPOINT_STATUSES.has(cp.status as TaskCheckpoint["status"])) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: `Checkpoint status invalid: ${String(cp.status)}` };
  }
  if (typeof cp.attemptIndex !== "number" || !Number.isInteger(cp.attemptIndex) || cp.attemptIndex < 0) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint attemptIndex must be non-negative integer" };
  }
  if (cp.attemptIndex === 0 && (cp.status === "accepted" || cp.status === "rejected")) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: `Checkpoint ${cp.status} status requires positive attemptIndex` };
  }
  if (typeof cp.lastSequence !== "number" || !Number.isInteger(cp.lastSequence) || cp.lastSequence < 0) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint lastSequence must be non-negative integer" };
  }
  if (cp.lastVerifiedHead !== null && (typeof cp.lastVerifiedHead !== "string" || cp.lastVerifiedHead.length === 0)) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint lastVerifiedHead must be non-empty string or null" };
  }
  if (cp.stopReason !== null && typeof cp.stopReason !== "string") {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint stopReason must be string or null" };
  }
  if (typeof cp.updatedAt !== "string" || cp.updatedAt.length === 0) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint updatedAt must be non-empty string" };
  }

  if (typeof cp.usage !== "object" || cp.usage === null || Array.isArray(cp.usage)) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint usage must be a JSON object" };
  }
  for (const key of Object.keys(cp.usage)) {
    if (!CHECKPOINT_USAGE_ALLOWED_KEYS.has(key)) {
      return { ok: false, code: "FORGED_CHECKPOINT", reason: `Checkpoint usage has unknown property: ${key}` };
    }
  }
  const usage = cp.usage as Record<string, unknown>;
  if (typeof usage.cycles !== "number" || !Number.isInteger(usage.cycles) || usage.cycles < 0) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint usage cycles must be non-negative integer" };
  }
  if (typeof usage.wallTimeMs !== "number" || !Number.isFinite(usage.wallTimeMs) || usage.wallTimeMs < 0) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint usage wallTimeMs must be non-negative number" };
  }
  if (usage.tokens !== null && (typeof usage.tokens !== "number" || !Number.isInteger(usage.tokens) || usage.tokens < 0)) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint usage tokens must be null or non-negative integer" };
  }
  if (usage.costUsd !== null && (typeof usage.costUsd !== "number" || !Number.isFinite(usage.costUsd) || usage.costUsd < 0)) {
    return { ok: false, code: "FORGED_CHECKPOINT", reason: "Checkpoint usage costUsd must be null or non-negative number" };
  }

  return { ok: true, value: parsed as TaskCheckpoint };
}

function validateControllerLeaseRecord(
  raw: string,
  expectedDigest: string,
): { ok: true; value: ControllerLockRecord } | { ok: false; code: string; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      code: "LEASE_CORRUPTED",
      reason: `Controller lease JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease is not a JSON object" };
  }

  for (const key of Object.keys(parsed)) {
    if (!CONTROLLER_LOCK_ALLOWED_KEYS.has(key)) {
      return { ok: false, code: "LEASE_CORRUPTED", reason: `Controller lease has unexpected property: ${key}` };
    }
  }

  const rec = parsed as Record<string, unknown>;
  if (rec.schemaVersion !== 1) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease schemaVersion must be 1" };
  }
  if (typeof rec.harness !== "string" || !VALID_HARNESSES.has(rec.harness)) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: `Controller lease harness is invalid: ${String(rec.harness)}` };
  }
  if (typeof rec.token !== "string" || rec.token.length === 0) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease token must be non-empty string" };
  }
  if (typeof rec.pid !== "number" || !Number.isInteger(rec.pid) || rec.pid <= 0) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease pid must be positive safe integer" };
  }
  if (typeof rec.host !== "string" || rec.host.length === 0) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease host must be non-empty string" };
  }
  if (typeof rec.startedAt !== "string" || rec.startedAt.length === 0) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease startedAt must be non-empty string" };
  }
  if (typeof rec.contractDigest !== "string" || rec.contractDigest !== expectedDigest) {
    return { ok: false, code: "LEASE_CORRUPTED", reason: "Controller lease contractDigest mismatch" };
  }

  return { ok: true, value: parsed as ControllerLockRecord };
}

function validateJournalEvent(
  raw: string,
  expectedSeq: number,
  expectedDigest: string,
): { ok: true; value: TaskJournalEvent } | { ok: false; code: string; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      code: "CORRUPTED_JOURNAL",
      reason: `Journal parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal event is not a JSON object" };
  }

  for (const key of Object.keys(parsed)) {
    if (!JOURNAL_EVENT_ALLOWED_KEYS.has(key)) {
      return { ok: false, code: "CORRUPTED_JOURNAL", reason: `Journal event has unknown property: ${key}` };
    }
  }

  const ev = parsed as Record<string, unknown>;
  if (typeof ev.sequence !== "number" || !Number.isInteger(ev.sequence)) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal sequence must be integer" };
  }
  if (ev.sequence !== expectedSeq) {
    return {
      ok: false,
      code: "REGRESSING_SEQUENCE",
      reason: `Journal sequence gap or regression: expected ${expectedSeq}, got ${ev.sequence}`,
    };
  }
  if (typeof ev.timestamp !== "string" || ev.timestamp.length === 0) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal timestamp must be non-empty string" };
  }
  if (typeof ev.kind !== "string" || !KNOWN_JOURNAL_EVENT_KINDS.has(ev.kind as TaskJournalEventKind)) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: `Journal kind unknown: ${String(ev.kind)}` };
  }
  if (ev.contractDigest !== expectedDigest) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: `Journal contractDigest mismatch: expected ${expectedDigest}, got ${String(ev.contractDigest)}` };
  }
  if (typeof ev.attemptIndex !== "number" || !Number.isInteger(ev.attemptIndex) || ev.attemptIndex < 0) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal attemptIndex must be non-negative integer" };
  }
  if (ev.attemptIndex === 0 && !ZERO_INDEX_ALLOWED_EVENT_KINDS.has(ev.kind as TaskJournalEventKind)) {
    return {
      ok: false,
      code: "CORRUPTED_JOURNAL",
      reason: `Journal attemptIndex must be positive integer for attempt-bound event: ${String(ev.kind)}`,
    };
  }
  if (typeof ev.payload !== "object" || ev.payload === null || Array.isArray(ev.payload)) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal payload must be a JSON object" };
  }

  const payload = ev.payload as Record<string, unknown>;
  if (payload.runId !== undefined && (typeof payload.runId !== "string" || !CANONICAL_RUN_ID_REGEX.test(payload.runId))) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal payload runId must be canonical run ID" };
  }
  if (
    (ev.kind === "attempt_finished" || payload.verdict !== undefined) &&
    (typeof payload.verdict !== "string" || !["accepted", "rejected", "blocked"].includes(payload.verdict))
  ) {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal verdict must be accepted, rejected, or blocked" };
  }
  if (payload.stopReason !== undefined && payload.stopReason !== null && typeof payload.stopReason !== "string") {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal payload stopReason must be string or null" };
  }
  if (payload.reason !== undefined && payload.reason !== null && typeof payload.reason !== "string") {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal payload reason must be string or null" };
  }
  if (payload.stopCode !== undefined && payload.stopCode !== null && typeof payload.stopCode !== "string") {
    return { ok: false, code: "CORRUPTED_JOURNAL", reason: "Journal payload stopCode must be string or null" };
  }

  return { ok: true, value: parsed as TaskJournalEvent };
}

/**
 * Validates and waits for an exact task execution attempt or explicit supervisor lifecycle.
 * Read-only: never modifies task state, manifests, locks, or GSD lifecycle.
 * Resolves once through exact selection, pins identity, and re-validates evidence on every reread.
 */
export async function waitTask(options: TaskWaitOptions): Promise<TaskWaitResult> {
  const {
    stateRoot,
    contractId,
    runId,
    contractDigest,
    revision,
    scope = "attempt",
  } = options;

  if (!isTaskContractId(contractId)) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "INVALID_CONTRACT_ID",
      reason: `Task contract ID ${contractId} is invalid.`,
    };
  }

  if (!CANONICAL_RUN_ID_REGEX.test(runId)) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "INVALID_RUN_ID",
      reason: `Run ID ${runId} is not a canonical run ID matching ^[0-9a-z]{8,}-[0-9a-f]{8}$.`,
    };
  }

  if (!EXACT_64_HEX_REGEX.test(contractDigest)) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "INVALID_CONTRACT_DIGEST",
      reason: `Contract digest ${contractDigest} is not an exact 64-character hex string.`,
    };
  }

  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 1) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "INVALID_REVISION",
      reason: `Revision must be a positive integer, got ${String(revision)}.`,
    };
  }

  if (scope !== "attempt" && scope !== "supervisor") {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "INVALID_SCOPE",
      reason: `Scope must be 'attempt' or 'supervisor', got ${String(scope)}.`,
    };
  }

  validateNumericFlag(revision, "revision", 1, 100_000);
  if (options.timeoutMs !== undefined) {
    validateNumericFlag(options.timeoutMs, "timeoutMs", 1, MAX_OBSERVER_TIMEOUT_MS);
  }

  const projectRoot = options.projectRoot ?? process.cwd();
  const pkgRoot = options.packageRoot ?? defaultPackageRoot();
  const runRecordPath = taskRunPath(stateRoot, contractId, runId);
  const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");

  // 1. Initial resolution & pinning: safe bounded read of exact run record
  let initialRawRunText: string | null = null;
  try {
    initialRawRunText = await safeReadBoundedFile(runRecordPath, 1024 * 1024);
  } catch (err: unknown) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "RUN_RECORD_INVALID",
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (initialRawRunText === null) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "EXECUTION_NOT_FOUND",
      reason: `Target execution has no canonical run record (checkpoint or reserved-only fallback is refused).`,
    };
  }

  if (options._onRunReadBarrier) {
    await options._onRunReadBarrier(initialRawRunText);
  }

  let initialRunRecord: TaskRunRecord;
  try {
    initialRunRecord = await validateTaskRunText({
      text: initialRawRunText,
      path: runRecordPath,
      contractId,
      root: pkgRoot,
    });
  } catch (err: unknown) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "EXECUTION_NOT_FOUND",
      reason: `Target execution has no canonical run record (checkpoint or reserved-only fallback is refused): ${err instanceof Error ? err.message : String(err)}.`,
    };
  }

  if (
    initialRunRecord.kind !== "task-run" ||
    initialRunRecord.contractId !== contractId ||
    initialRunRecord.runId !== runId ||
    initialRunRecord.contractDigest !== contractDigest ||
    initialRunRecord.revision !== revision
  ) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: "IDENTITY_MISMATCH",
      reason: `Target execution does not match pinned identity (run=${initialRunRecord.runId}, digest=${initialRunRecord.contractDigest}, revision=${initialRunRecord.revision}).`,
    };
  }

  // Pin initial owner lease fence if non-terminal
  let pinnedOwner: PinnedOwner | null = null;
  if (!TERMINAL_RUN_STATUSES.has(initialRunRecord.status)) {
    let rawLock: string | null = null;
    try {
      rawLock = await safeReadBoundedFile(lockPath, 64 * 1024);
    } catch (err: unknown) {
      return {
        ok: false,
        status: "unresolved",
        scope,
        contractId,
        runId,
        contractDigest,
        revision,
        reasonCode: "LEASE_CORRUPTED",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (rawLock !== null) {
      const lockValidation = validateControllerLeaseRecord(rawLock, contractDigest);
      if (!lockValidation.ok) {
        return {
          ok: false,
          status: "unresolved",
          scope,
          contractId,
          runId,
          contractDigest,
          revision,
          reasonCode: lockValidation.code,
          reason: lockValidation.reason,
        };
      }

      if (lockValidation.value.host !== hostname()) {
        return {
          ok: false,
          status: "unresolved",
          scope,
          contractId,
          runId,
          contractDigest,
          revision,
          reasonCode: "FOREIGN_OWNER",
          reason: `Owner host ${lockValidation.value.host} differs from local host ${hostname()}; process liveness cannot be verified.`,
        };
      }

      if (!isProcessAlive(lockValidation.value.pid)) {
        return {
          ok: false,
          status: "unresolved",
          scope,
          contractId,
          runId,
          contractDigest,
          revision,
          reasonCode: "OWNER_DEAD",
          reason: `Owner process (pid=${lockValidation.value.pid}) is dead before attempt finished.`,
        };
      }

      pinnedOwner = {
        token: lockValidation.value.token,
        pid: lockValidation.value.pid,
        host: lockValidation.value.host,
        startedAt: lockValidation.value.startedAt,
        contractDigest: lockValidation.value.contractDigest,
        harness: lockValidation.value.harness,
      };
    }
  }

  // Watermarks
  let lastKnownCheckpointSequence = -1;
  let lastKnownJournalPrefixHashes: string[] = [];
  let pinnedAttemptIndex: number | null = null;
  let isFirstCheck = true;

  const check = async (): Promise<CompletionCheckResult<{ taskStatus: string; attemptIndex?: number; stopReason: string | null }>> => {
    // A. Read and validate Checkpoint
    const checkpointPath = runCheckpointPath(stateRoot, contractDigest);
    let checkpoint: TaskCheckpoint | null = null;
    let rawCheckpoint: string | null = null;
    try {
      rawCheckpoint = await safeReadBoundedFile(checkpointPath, 256 * 1024);
    } catch (err: unknown) {
      return {
        state: "refused",
        code: "FORGED_CHECKPOINT",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    if (rawCheckpoint !== null) {
      const cpRes = validateCheckpointRecord(rawCheckpoint, { contractDigest, contractId, revision });
      if (!cpRes.ok) {
        return {
          state: "refused",
          code: cpRes.code,
          reason: cpRes.reason,
        };
      }
      if (cpRes.value.lastSequence < lastKnownCheckpointSequence) {
        return {
          state: "refused",
          code: "REGRESSING_SEQUENCE",
          reason: `Checkpoint sequence regressed from ${lastKnownCheckpointSequence} to ${cpRes.value.lastSequence}.`,
        };
      }
      lastKnownCheckpointSequence = cpRes.value.lastSequence;
      checkpoint = cpRes.value;
    }

    // B. Read and validate Journal
    const journalPath = runJournalPath(stateRoot, contractDigest);
    let rawJournal: string | null = null;
    try {
      rawJournal = await safeReadBoundedFile(journalPath, 16 * 1024 * 1024);
    } catch (err: unknown) {
      return {
        state: "refused",
        code: "CORRUPTED_JOURNAL",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    const events: TaskJournalEvent[] = [];
    if (rawJournal === null) {
      if (lastKnownJournalPrefixHashes.length > 0) {
        return {
          state: "refused",
          code: "REGRESSING_SEQUENCE",
          reason: "Journal file disappeared after events were observed.",
        };
      }
    } else {
      const lines = rawJournal.split(/\r?\n/u);
      const currentHashes: string[] = [];
      let seq = 1;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (line.length === 0) continue;
        const evRes = validateJournalEvent(line, seq, contractDigest);
        if (!evRes.ok) {
          return {
            state: "refused",
            code: evRes.code,
            reason: evRes.reason,
          };
        }
        seq++;
        events.push(evRes.value);
        currentHashes.push(createHash("sha256").update(line).digest("hex"));
      }

      if (events.length < lastKnownJournalPrefixHashes.length) {
        return {
          state: "refused",
          code: "REGRESSING_SEQUENCE",
          reason: `Journal stream truncated: previously ${lastKnownJournalPrefixHashes.length} events, now ${events.length}.`,
        };
      }

      for (let i = 0; i < lastKnownJournalPrefixHashes.length; i++) {
        if (currentHashes[i] !== lastKnownJournalPrefixHashes[i]) {
          return {
            state: "refused",
            code: "REGRESSING_SEQUENCE",
            reason: `Journal sequence history modified at index ${i}.`,
          };
        }
      }
      lastKnownJournalPrefixHashes = currentHashes;
    }

    // C. Read canonical task run record using bounded file reader and validate retained bytes
    let runRecord: TaskRunRecord | null = null;
    let rawRunText: string | null = null;
    if (isFirstCheck) {
      isFirstCheck = false;
      runRecord = initialRunRecord;
    } else {
      try {
        rawRunText = await safeReadBoundedFile(runRecordPath, 1024 * 1024);
      } catch (err: unknown) {
        return {
          state: "refused",
          code: "RUN_RECORD_INVALID",
          reason: err instanceof Error ? err.message : String(err),
        };
      }

      if (rawRunText !== null) {
        if (options._onRunReadBarrier) {
          await options._onRunReadBarrier(rawRunText);
        }
        try {
          runRecord = await validateTaskRunText({
            text: rawRunText,
            path: runRecordPath,
            contractId,
            root: pkgRoot,
          });
        } catch (err: unknown) {
          return {
            state: "refused",
            code: "RUN_RECORD_INVALID",
            reason: err instanceof Error ? err.message : String(err),
          };
        }

        if (
          runRecord.kind !== "task-run" ||
          runRecord.contractId !== contractId ||
          runRecord.runId !== runId ||
          runRecord.contractDigest !== contractDigest ||
          runRecord.revision !== revision
        ) {
          return {
            state: "refused",
            code: "RUN_RECORD_INVALID",
            reason: "Run record failed identity validation.",
          };
        }
      }
    }

    // D. Controller lease check
    let rawLockText: string | null = null;
    try {
      rawLockText = await safeReadBoundedFile(lockPath, 64 * 1024);
    } catch (err: unknown) {
      return {
        state: "unresolved",
        code: "LEASE_CORRUPTED",
        reason: err instanceof Error ? err.message : String(err),
      };
    }

    let controllerLock: ControllerLockRecord | null = null;
    if (rawLockText !== null) {
      const lockRes = validateControllerLeaseRecord(rawLockText, contractDigest);
      if (!lockRes.ok) {
        return {
          state: "unresolved",
          code: lockRes.code,
          reason: lockRes.reason,
        };
      }
      controllerLock = lockRes.value;
    }

    // E. Attempt derivation
    const linkingEvents = events.filter(
      (e) => e.attemptIndex > 0 && RUN_LINK_EVENT_KINDS.has(e.kind) && e.payload.runId === runId,
    );
    let linkedAttemptIndex: number | null = null;
    if (linkingEvents.length > 0) {
      const firstAttempt = linkingEvents[0]!.attemptIndex;
      for (const ev of linkingEvents) {
        if (ev.attemptIndex !== firstAttempt) {
          return {
            state: "refused",
            code: "CONFLICTING_ATTEMPT_LINK",
            reason: `Conflicting attempt linkage for run ${runId}: attempt ${firstAttempt} vs ${ev.attemptIndex}`,
          };
        }
      }
      linkedAttemptIndex = firstAttempt;
      if (pinnedAttemptIndex === null) {
        pinnedAttemptIndex = linkedAttemptIndex;
      } else if (pinnedAttemptIndex !== linkedAttemptIndex) {
        return {
          state: "refused",
          code: "CONFLICTING_ATTEMPT_LINK",
          reason: `Pinned attempt ${pinnedAttemptIndex} changed to ${linkedAttemptIndex}`,
        };
      }
    }

    // F. Owner fence check
    const isAttemptTerminal =
      (runRecord !== null && TERMINAL_RUN_STATUSES.has(runRecord.status)) ||
      events.some(
        (e) =>
          e.kind === "attempt_finished" &&
          e.payload?.runId === runId &&
          (e.payload.verdict === "accepted" || e.payload.verdict === "rejected" || e.payload.verdict === "blocked"),
      );
    const isSupervisorTerminal = checkpoint !== null && TERMINAL_CHECKPOINT_STATUSES.has(checkpoint.status);
    const isExecutionTerminal = scope === "supervisor" ? isSupervisorTerminal : isAttemptTerminal;

    if (pinnedOwner !== null) {
      if (controllerLock !== null) {
        if (
          controllerLock.token !== pinnedOwner.token ||
          controllerLock.pid !== pinnedOwner.pid ||
          controllerLock.host !== pinnedOwner.host ||
          controllerLock.startedAt !== pinnedOwner.startedAt ||
          controllerLock.contractDigest !== pinnedOwner.contractDigest ||
          controllerLock.harness !== pinnedOwner.harness
        ) {
          return {
            state: "refused",
            code: "OWNER_MISMATCH",
            reason: `Owner identity changed during execution (expected token=${pinnedOwner.token}, got ${controllerLock.token}).`,
          };
        }
        if (controllerLock.host !== hostname()) {
          return {
            state: "unresolved",
            code: "FOREIGN_OWNER",
            reason: "Foreign host owner cannot be verified.",
          };
        }
        if (!isProcessAlive(controllerLock.pid)) {
          return {
            state: "unresolved",
            code: "OWNER_DEAD",
            reason: `Owner process (pid=${pinnedOwner.pid}) is dead before attempt finished.`,
          };
        }
      } else {
        if (!isExecutionTerminal) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "Controller lease disappeared while execution was nonterminal.",
          };
        }
      }
    } else {
      if (controllerLock !== null) {
        if (controllerLock.host !== hostname()) {
          return {
            state: "unresolved",
            code: "FOREIGN_OWNER",
            reason: "Foreign host owner cannot be verified.",
          };
        }
        if (!isProcessAlive(controllerLock.pid)) {
          return {
            state: "unresolved",
            code: "OWNER_DEAD",
            reason: `Controller process (pid=${controllerLock.pid}) is dead before attempt finished.`,
          };
        }
        pinnedOwner = {
          token: controllerLock.token,
          pid: controllerLock.pid,
          host: controllerLock.host,
          startedAt: controllerLock.startedAt,
          contractDigest: controllerLock.contractDigest,
          harness: controllerLock.harness,
        };
      } else if (!isExecutionTerminal) {
        return {
          state: "unresolved",
          code: "OWNER_ABSENT",
          reason: "Nonterminal execution has no controller lease.",
        };
      }
    }

    // G. Scope Evaluation
    if (scope === "attempt") {
      if (runRecord !== null && TERMINAL_RUN_STATUSES.has(runRecord.status)) {
        const attemptIdx = linkedAttemptIndex ?? undefined;
        return {
          state: "terminal",
          value: {
            taskStatus: runRecord.status,
            ...(attemptIdx !== undefined ? { attemptIndex: attemptIdx } : {}),
            stopReason: runRecord.stopReason ?? null,
          },
        };
      }

      const attemptFinished = events.find(
        (e) => e.kind === "attempt_finished" && e.payload?.runId === runId,
      );
      if (attemptFinished) {
        const verdict = attemptFinished.payload.verdict;
        if (verdict === "accepted" || verdict === "rejected" || verdict === "blocked") {
          return {
            state: "terminal",
            value: {
              taskStatus: verdict,
              attemptIndex: attemptFinished.attemptIndex,
              stopReason: typeof attemptFinished.payload.stopReason === "string" ? attemptFinished.payload.stopReason : null,
            },
          };
        }
      }

      return { state: "pending" };
    }

    if (scope === "supervisor") {
      if (checkpoint !== null && TERMINAL_CHECKPOINT_STATUSES.has(checkpoint.status)) {
        if (events.length === 0) {
          return {
            state: "refused",
            code: "LONE_CHECKPOINT_REFUSED",
            reason: "Terminal checkpoint without journal events is refused.",
          };
        }

        const attemptEvents = events.filter((e) => e.attemptIndex === checkpoint.attemptIndex);
        const anyTerminalEvent = attemptEvents.find((e) =>
          ["accepted", "rejected", "blocked", "process_cancelled", "limit_exceeded"].includes(e.kind) ||
          (e.kind === "attempt_finished" && (e.payload.verdict === "rejected" || e.payload.verdict === "accepted")),
        );
        if (!anyTerminalEvent) {
          return {
            state: "refused",
            code: "LONE_CHECKPOINT_REFUSED",
            reason: "Terminal checkpoint without corresponding terminal journal event is refused.",
          };
        }

        // Prove the exact run-to-terminal-attempt association before every disposition.
        const dispositionEvent = attemptEvents.findLast((e) => {
          if (checkpoint.status === "stopped") return e.kind === "limit_exceeded" || e.kind === "process_cancelled";
          return e.kind === checkpoint.status ||
            (e.kind === "attempt_finished" && e.payload.verdict === checkpoint.status);
        });
        if (!dispositionEvent) {
          return { state: "refused", code: "CONTRADICTORY_TERMINAL_STATE", reason: "Terminal checkpoint has no matching disposition event." };
        }
        const attemptLinks = attemptEvents.filter(
          (e) => RUN_LINK_EVENT_KINDS.has(e.kind) && e.payload.runId !== undefined,
        );
        if (attemptLinks.some((e) => e.payload.runId !== runId)) {
          return { state: "refused", code: "UNLINKED_CHECKPOINT", reason: "Terminal attempt explicitly names a different run." };
        }
        const hasPriorRunStart = attemptEvents.some(
          (e) => e.kind === "attempt_started" && e.payload.runId === runId && e.sequence < dispositionEvent.sequence,
        );
        if (
          checkpoint.attemptIndex === 0 ||
          linkedAttemptIndex !== checkpoint.attemptIndex ||
          (dispositionEvent.payload.runId === undefined &&
            (checkpoint.status === "accepted" || checkpoint.status === "rejected" || !hasPriorRunStart))
        ) {
          return {
            state: "unresolved",
            code: "UNSUPPORTED_SUPERVISOR_EVIDENCE",
            reason: "Legacy supervisor evidence does not prove the exact run-to-terminal-attempt association.",
          };
        }
        if (runRecord === null) {
          return { state: "refused", code: "UNLINKED_CHECKPOINT", reason: "Terminal supervisor evidence requires the exact canonical run." };
        }
        if (
          ((checkpoint.status === "accepted" || checkpoint.status === "rejected") && runRecord.status !== checkpoint.status) ||
          ((checkpoint.status === "blocked" || checkpoint.status === "stopped") && runRecord.status === "accepted")
        ) {
          return { state: "refused", code: "CONTRADICTORY_TERMINAL_STATE", reason: "Canonical run contradicts the terminal supervisor disposition." };
        }
        for (let a = 1; a < checkpoint.attemptIndex; a++) {
          const prior = events.filter((e) => e.attemptIndex === a);
          const started = prior.find((e) => e.kind === "attempt_started");
          const finished = prior.findLast(
            (e) => e.kind === "attempt_finished" || e.kind === "rejected" || e.kind === "blocked",
          );
          if (!started || !finished || started.sequence >= finished.sequence || finished.sequence >= dispositionEvent.sequence) {
            return { state: "unresolved", code: "UNSUPPORTED_SUPERVISOR_EVIDENCE", reason: "Incomplete retry chain at attempt " + a };
          }
        }

        if (checkpoint.status === "accepted") {
          const terminalEvent = attemptEvents.find((e) => e.kind === "accepted");
          if (!terminalEvent) {
            return {
              state: "refused",
              code: "CONTRADICTORY_TERMINAL_STATE",
              reason: "Checkpoint is accepted but no accepted event found for checkpoint attempt.",
            };
          }
          if (terminalEvent.payload.runId !== runId) {
            return {
              state: "refused",
              code: "UNLINKED_CHECKPOINT",
              reason: `Terminal accepted event runId ${terminalEvent.payload.runId} does not match requested run ${runId}.`,
            };
          }
          if (runRecord === null) {
            return {
              state: "refused",
              code: "UNLINKED_CHECKPOINT",
              reason: "Missing canonical run record for terminal supervisor state.",
            };
          }
          if (runRecord.status !== "accepted") {
            return {
              state: "refused",
              code: "CONTRADICTORY_TERMINAL_STATE",
              reason: `Checkpoint is accepted but run record status is ${runRecord.status}.`,
            };
          }

          return {
            state: "terminal",
            value: {
              taskStatus: "accepted",
              attemptIndex: checkpoint.attemptIndex,
              stopReason: checkpoint.stopReason,
            },
          };
        }

        if (checkpoint.status === "rejected") {
          const terminalEvent = attemptEvents.find(
            (e) => e.kind === "rejected" || (e.kind === "attempt_finished" && e.payload.verdict === "rejected"),
          );
          if (!terminalEvent) {
            return {
              state: "refused",
              code: "CONTRADICTORY_TERMINAL_STATE",
              reason: "Checkpoint is rejected but no rejected event found for checkpoint attempt.",
            };
          }
          if (terminalEvent.payload.runId && terminalEvent.payload.runId !== runId) {
            return {
              state: "refused",
              code: "UNLINKED_CHECKPOINT",
              reason: `Terminal rejected event runId ${terminalEvent.payload.runId} does not match requested run ${runId}.`,
            };
          }
          if (linkedAttemptIndex !== null && linkedAttemptIndex !== checkpoint.attemptIndex) {
            return {
              state: "unresolved",
              code: "UNSUPPORTED_SUPERVISOR_EVIDENCE",
              reason: "Current supervisor events cannot prove run-to-attempt linkage for retried attempt.",
            };
          }
          return {
            state: "terminal",
            value: {
              taskStatus: "rejected",
              attemptIndex: checkpoint.attemptIndex,
              stopReason: checkpoint.stopReason,
            },
          };
        }

        if (checkpoint.status === "blocked") {
          const terminalEvent = attemptEvents.find((e) => e.kind === "blocked");
          if (!terminalEvent) {
            return {
              state: "refused",
              code: "CONTRADICTORY_TERMINAL_STATE",
              reason: "Checkpoint is blocked but no blocked event found for checkpoint attempt.",
            };
          }
          return {
            state: "terminal",
            value: {
              taskStatus: "blocked",
              attemptIndex: checkpoint.attemptIndex,
              stopReason: checkpoint.stopReason,
            },
          };
        }

        if (checkpoint.status === "stopped") {
          const terminalEvent = attemptEvents.find((e) => e.kind === "limit_exceeded" || e.kind === "process_cancelled");
          if (!terminalEvent) {
            return {
              state: "refused",
              code: "CONTRADICTORY_TERMINAL_STATE",
              reason: "Checkpoint is stopped but no stopped event found for checkpoint attempt.",
            };
          }
          return {
            state: "terminal",
            value: {
              taskStatus: "stopped",
              attemptIndex: checkpoint.attemptIndex,
              stopReason: checkpoint.stopReason,
            },
          };
        }
      }

      // Non-terminal supervisor: check retry linkage
      if (checkpoint !== null && checkpoint.attemptIndex > 1) {
        if (linkedAttemptIndex === null || checkpoint.attemptIndex > linkedAttemptIndex) {
          const hasProvenLinkage = events.some(
            (e) => e.attemptIndex === checkpoint.attemptIndex && e.payload && e.payload.runId === runId,
          );
          if (!hasProvenLinkage) {
            return {
              state: "unresolved",
              code: "UNSUPPORTED_SUPERVISOR_EVIDENCE",
              reason: "Current supervisor events cannot prove run-to-attempt linkage for retried attempt.",
            };
          }
        }
      }

      return { state: "pending" };
    }

    return {
      state: "refused",
      code: "INVALID_SCOPE",
      reason: `Unsupported scope: ${String(scope)}`,
    };
  };

  const watchDir = runDirectory(stateRoot, contractDigest);
  const taskRunsDir = join(stateRoot, "tasks", contractId, "runs");
  const settlement = await waitForCompletion({
    targetPath: join(watchDir, "checkpoint.json"),
    watchDirs: [watchDir, taskRunsDir],
    check,
    ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
  });

  if (settlement.status === "completed") {
    return {
      ok: true,
      status: "completed",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      taskStatus: settlement.value.taskStatus,
      ...(settlement.value.attemptIndex !== undefined ? { attemptIndex: settlement.value.attemptIndex } : {}),
      stopReason: settlement.value.stopReason,
    };
  }

  if (settlement.status === "refused" || settlement.status === "unresolved") {
    return {
      ok: false,
      status: settlement.status,
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: settlement.code,
      reason: settlement.reason,
    };
  }

  return {
    ok: false,
    status: settlement.status,
    scope,
    contractId,
    runId,
    contractDigest,
    revision,
    reason: settlement.status === "timeout" ? `Observer timed out after ${settlement.elapsedMs}ms` : "Observation aborted",
  };
}
