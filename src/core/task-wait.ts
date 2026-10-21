import { open, lstat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { selectTaskExecution } from "./task-read.js";
import {
  runDirectory,
  runCheckpointPath,
  runJournalPath,
  type TaskCheckpoint,
  type TaskJournalEvent,
  type TaskJournalEventKind,
} from "./task-journal.js";
import { listTaskRuns, type TaskRunRecord } from "./task-run.js";
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

const CANONICAL_RUN_ID_REGEX = /^[0-9a-z]{8,}-[0-9a-f]{8}$/;
const EXACT_64_HEX_REGEX = /^[0-9a-f]{64}$/;

interface PinnedOwner {
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
}

/**
 * Checks all directory ancestors and the target path itself for symlink/reparse points.
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

  try {
    const fileStat = await lstat(resolved);
    if (fileStat.isSymbolicLink()) {
      throw new Error(`Path is a symlink or reparse point: ${resolved}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

/**
 * Reads a regular file using bounded file handles with pre- and post-read ancestor checks.
 * Enforces a strict byte ceiling and rejects symlinks.
 */
async function safeReadBoundedFile(
  filePath: string,
  maxBytes: number,
): Promise<string | null> {
  await verifyPathAncestorsNotSymlinks(filePath);

  let handle;
  try {
    handle = await open(filePath, "r");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  try {
    const stat = await handle.stat();
    if (!stat.isFile()) {
      throw new Error(`Path is not a regular file: ${filePath}`);
    }
    if (stat.size > maxBytes) {
      throw new Error(`File size ${stat.size} exceeds ceiling ${maxBytes}: ${filePath}`);
    }
    const buf = Buffer.alloc(maxBytes + 1);
    const { bytesRead } = await handle.read(buf, 0, maxBytes + 1, 0);
    if (bytesRead > maxBytes) {
      throw new Error(`Bytes read ${bytesRead} exceeds ceiling ${maxBytes}: ${filePath}`);
    }

    // Recheck ancestors after read to detect symlink swap / reparse race
    await verifyPathAncestorsNotSymlinks(filePath);

    return buf.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
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

  // 1. Initial resolution & pinning: must match exact identity
  // selectTaskExecution's checkpoint fallback is NOT proof even when selectionRule exact-run-id.
  // Reserved / checkpoint-only execution is refused.
  let initialExecution;
  try {
    initialExecution = await selectTaskExecution({
      stateRoot,
      contractId,
      runId,
      packageRoot: pkgRoot,
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
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (
    !initialExecution ||
    initialExecution.runRecord === null ||
    initialExecution.isReserved ||
    initialExecution.selectionRule !== "exact-run-id" ||
    initialExecution.contractId !== contractId ||
    initialExecution.runId !== runId ||
    initialExecution.contractDigest !== contractDigest ||
    initialExecution.revision !== revision
  ) {
    return {
      ok: false,
      status: "refused",
      scope,
      contractId,
      runId,
      contractDigest,
      revision,
      reasonCode: initialExecution?.runRecord === null ? "EXECUTION_NOT_FOUND" : "IDENTITY_MISMATCH",
      reason: initialExecution?.runRecord === null
        ? `Target execution has no canonical run record (checkpoint or reserved-only fallback is refused).`
        : `Target execution does not match pinned identity (run=${initialExecution?.runId}, digest=${initialExecution?.contractDigest}, revision=${initialExecution?.revision}).`,
    };
  }

  // Pin initial owner lease fence if active
  const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");
  let pinnedOwner: PinnedOwner | null = null;
  try {
    const rawLock = await safeReadBoundedFile(lockPath, 64 * 1024);
    if (rawLock !== null) {
      const parsedLock = JSON.parse(rawLock) as ControllerLockRecord;
      if (parsedLock.contractDigest === contractDigest) {
        pinnedOwner = {
          token: parsedLock.token,
          pid: parsedLock.pid,
          host: parsedLock.host,
          startedAt: parsedLock.startedAt,
        };
      }
    }
  } catch {
    // Controller lock will be validated during periodic checks
  }

  // Pinned attempt index: derive from initial run record or default to 1
  const pinnedAttemptIndex = 1;

  // Separate sequence watermarks: checkpoint lastSequence and journal tail MUST NOT be compared
  let lastKnownCheckpointSequence = -1;
  let lastKnownJournalSequences: number[] = [];
  let lastKnownJournalEventCount = 0;

  const check = async (): Promise<CompletionCheckResult<{ taskStatus: string; attemptIndex: number; stopReason: string | null }>> => {
    // A. Read checkpoint with bounded handle, ancestor checks, and closed schema validation
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
      let parsedCp: unknown;
      try {
        parsedCp = JSON.parse(rawCheckpoint);
      } catch (err: unknown) {
        return {
          state: "refused",
          code: "FORGED_CHECKPOINT",
          reason: `Checkpoint parse error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }

      if (
        typeof parsedCp !== "object" ||
        parsedCp === null ||
        (parsedCp as TaskCheckpoint).schemaVersion !== 1 ||
        (parsedCp as TaskCheckpoint).contractDigest !== contractDigest ||
        (parsedCp as TaskCheckpoint).contractId !== contractId ||
        (parsedCp as TaskCheckpoint).revision !== revision ||
        typeof (parsedCp as TaskCheckpoint).status !== "string" ||
        !["pending", "running", "accepted", "rejected", "blocked", "stopped", "needs-input"].includes((parsedCp as TaskCheckpoint).status) ||
        typeof (parsedCp as TaskCheckpoint).attemptIndex !== "number" ||
        !Number.isInteger((parsedCp as TaskCheckpoint).attemptIndex) ||
        (parsedCp as TaskCheckpoint).attemptIndex < 0 ||
        typeof (parsedCp as TaskCheckpoint).lastSequence !== "number" ||
        !Number.isInteger((parsedCp as TaskCheckpoint).lastSequence) ||
        (parsedCp as TaskCheckpoint).lastSequence < 0 ||
        typeof (parsedCp as TaskCheckpoint).updatedAt !== "string" ||
        (parsedCp as TaskCheckpoint).updatedAt.length === 0 ||
        typeof (parsedCp as TaskCheckpoint).usage !== "object" ||
        (parsedCp as TaskCheckpoint).usage === null ||
        typeof (parsedCp as TaskCheckpoint).usage.cycles !== "number" ||
        !Number.isInteger((parsedCp as TaskCheckpoint).usage.cycles) ||
        (parsedCp as TaskCheckpoint).usage.cycles < 0 ||
        typeof (parsedCp as TaskCheckpoint).usage.wallTimeMs !== "number" ||
        !Number.isFinite((parsedCp as TaskCheckpoint).usage.wallTimeMs) ||
        (parsedCp as TaskCheckpoint).usage.wallTimeMs < 0
      ) {
        return {
          state: "refused",
          code: "FORGED_CHECKPOINT",
          reason: `Checkpoint record fields drifted or failed closed schema validation.`,
        };
      }

      const validatedCp = parsedCp as TaskCheckpoint;
      if (validatedCp.lastSequence < lastKnownCheckpointSequence) {
        return {
          state: "refused",
          code: "REGRESSING_SEQUENCE",
          reason: `Checkpoint sequence regressed from ${lastKnownCheckpointSequence} to ${validatedCp.lastSequence}.`,
        };
      }
      lastKnownCheckpointSequence = validatedCp.lastSequence;
      checkpoint = validatedCp;
    }

    // B. Read journal events with bounded handle, ancestor checks, and sequence continuity
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
    if (rawJournal !== null) {
      const lines = rawJournal.split(/\r?\n/u);
      let prevSeq = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (line.length === 0) continue;
        let parsedEvent: unknown;
        try {
          parsedEvent = JSON.parse(line);
        } catch (err: unknown) {
          return {
            state: "refused",
            code: "CORRUPTED_JOURNAL",
            reason: `Journal line ${i + 1} corrupt: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        const ev = parsedEvent as TaskJournalEvent;
        if (
          typeof ev !== "object" ||
          ev === null ||
          typeof ev.sequence !== "number" ||
          !Number.isInteger(ev.sequence) ||
          ev.sequence <= prevSeq ||
          typeof ev.timestamp !== "string" ||
          ev.timestamp.length === 0 ||
          typeof ev.kind !== "string" ||
          !KNOWN_JOURNAL_EVENT_KINDS.has(ev.kind) ||
          ev.contractDigest !== contractDigest ||
          typeof ev.attemptIndex !== "number" ||
          !Number.isInteger(ev.attemptIndex) ||
          ev.attemptIndex < 0 ||
          typeof ev.payload !== "object" ||
          ev.payload === null
        ) {
          return {
            state: "refused",
            code: ev && typeof ev.sequence === "number" && ev.sequence <= prevSeq
              ? "REGRESSING_SEQUENCE"
              : "CORRUPTED_JOURNAL",
            reason: `Journal event at line ${i + 1} failed monotonic sequence or schema validation.`,
          };
        }
        prevSeq = ev.sequence;
        events.push(ev);
      }

      // Rollback / truncation validation on journal stream
      if (events.length < lastKnownJournalEventCount) {
        return {
          state: "refused",
          code: "REGRESSING_SEQUENCE",
          reason: `Journal stream truncated: previously ${lastKnownJournalEventCount} events, now ${events.length}.`,
        };
      }
      for (let i = 0; i < lastKnownJournalSequences.length; i++) {
        if (events[i]!.sequence !== lastKnownJournalSequences[i]) {
          return {
            state: "refused",
            code: "REGRESSING_SEQUENCE",
            reason: `Journal sequence history modified at index ${i}.`,
          };
        }
      }
      lastKnownJournalSequences = events.map((e) => e.sequence);
      lastKnownJournalEventCount = events.length;
    }

    // C. Read canonical task run record using canonical API (listTaskRuns) with safe path precheck
    const runRecordPath = join(stateRoot, "tasks", contractId, "runs", `${runId}.json`);
    let runRecord: TaskRunRecord | null = null;
    let rawRunText: string | null = null;
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
      let runs: TaskRunRecord[];
      try {
        runs = await listTaskRuns({
          stateRoot,
          contractId,
          packageRoot: pkgRoot,
        });
      } catch (err: unknown) {
        return {
          state: "refused",
          code: "RUN_RECORD_INVALID",
          reason: err instanceof Error ? err.message : String(err),
        };
      }

      const match = runs.find((r) => r.runId === runId);
      if (!match) {
        return {
          state: "refused",
          code: "RUN_RECORD_INVALID",
          reason: `Run record ${runId} was not found among validated runs.`,
        };
      }
      if (
        match.kind !== "task-run" ||
        match.contractId !== contractId ||
        match.runId !== runId ||
        match.contractDigest !== contractDigest ||
        match.revision !== revision
      ) {
        return {
          state: "refused",
          code: "RUN_RECORD_INVALID",
          reason: `Run record failed identity validation.`,
        };
      }
      runRecord = match;
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
      try {
        const parsed = JSON.parse(rawLockText);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          parsed.schemaVersion === 1 &&
          typeof parsed.contractDigest === "string" &&
          typeof parsed.contractId === "string" &&
          typeof parsed.pid === "number" &&
          Number.isInteger(parsed.pid) &&
          parsed.pid > 0 &&
          typeof parsed.host === "string" &&
          typeof parsed.token === "string" &&
          typeof parsed.startedAt === "string"
        ) {
          controllerLock = parsed as ControllerLockRecord;
        } else {
          return {
            state: "unresolved",
            code: "LEASE_CORRUPTED",
            reason: `Controller lease record is malformed.`,
          };
        }
      } catch (err: unknown) {
        return {
          state: "unresolved",
          code: "LEASE_CORRUPTED",
          reason: `Controller lease JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // E. Evaluation by scope

    // Scope: "attempt"
    // Pinned to exact canonical run ID. Exact run record terminal disposition is authority.
    // Never switch to checkpoint's later attemptIndex and never default event status to completed.
    if (scope === "attempt") {
      // 1. If runRecord is terminal, it is the authority
      if (runRecord !== null && TERMINAL_RUN_STATUSES.has(runRecord.status)) {
        const linkingEvent = events.find((e) => e.payload && e.payload.runId === runId);
        const resolvedAttemptIndex = linkingEvent ? linkingEvent.attemptIndex : pinnedAttemptIndex;
        return {
          state: "terminal",
          value: {
            taskStatus: runRecord.status,
            attemptIndex: resolvedAttemptIndex,
            stopReason: runRecord.stopReason ?? null,
          },
        };
      }

      // 2. Check if journal has an attempt_finished event specifically linking this run
      const attemptFinished = events.find(
        (e) => e.kind === "attempt_finished" && (e.payload.runId === runId || e.attemptIndex === pinnedAttemptIndex),
      );
      if (attemptFinished && attemptFinished.payload.runId === runId) {
        const verdict = (attemptFinished.payload.verdict as string) ?? (attemptFinished.payload.status as string);
        if (verdict === "accepted" || verdict === "rejected" || verdict === "blocked") {
          return {
            state: "terminal",
            value: {
              taskStatus: verdict,
              attemptIndex: attemptFinished.attemptIndex,
              stopReason: (attemptFinished.payload.stopReason as string) ?? null,
            },
          };
        }
      }

      // 3. Nonterminal attempt: verify owner lock fence
      if (pinnedOwner !== null) {
        if (controllerLock === null) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "Controller lease disappeared while attempt was nonterminal.",
          };
        }
        if (
          controllerLock.token !== pinnedOwner.token ||
          controllerLock.pid !== pinnedOwner.pid ||
          controllerLock.host !== pinnedOwner.host
        ) {
          return {
            state: "refused",
            code: "OWNER_MISMATCH",
            reason: `Owner identity changed during execution (expected token=${pinnedOwner.token}, got ${controllerLock.token}).`,
          };
        }
        if (pinnedOwner.host === hostname() && !isProcessAlive(pinnedOwner.pid)) {
          return {
            state: "unresolved",
            code: "OWNER_DEAD",
            reason: `Owner process (pid=${pinnedOwner.pid}) is dead before attempt finished.`,
          };
        }
      } else {
        if (controllerLock === null) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "No active controller lock found for nonterminal execution.",
          };
        }
        if (controllerLock.contractDigest !== contractDigest) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "Active controller lock is for a different contract.",
          };
        }
        if (controllerLock.host === hostname() && !isProcessAlive(controllerLock.pid)) {
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
        };
      }

      return { state: "pending" };
    }

    // Scope: "supervisor"
    // Requires validated linked supervisor checkpoint/journal and requested canonical run,
    // not a terminal checkpoint alone. Lone accepted checkpoint is refused.
    if (scope === "supervisor") {
      if (checkpoint !== null && TERMINAL_CHECKPOINT_STATUSES.has(checkpoint.status)) {
        if (events.length === 0) {
          return {
            state: "refused",
            code: "LONE_CHECKPOINT_REFUSED",
            reason: "Terminal checkpoint without journal events is refused.",
          };
        }
        const terminalEvent = events.find((e) =>
          ["accepted", "rejected", "blocked", "process_cancelled", "limit_exceeded"].includes(e.kind),
        );
        if (!terminalEvent) {
          return {
            state: "refused",
            code: "LONE_CHECKPOINT_REFUSED",
            reason: "Terminal checkpoint without corresponding terminal journal event is refused.",
          };
        }
        if (runRecord === null) {
          return {
            state: "refused",
            code: "UNLINKED_CHECKPOINT",
            reason: "Missing canonical run record for terminal supervisor state.",
          };
        }
        if (checkpoint.status === "accepted" && terminalEvent.kind === "accepted") {
          if (terminalEvent.payload.runId && terminalEvent.payload.runId !== runId) {
            return {
              state: "refused",
              code: "UNLINKED_CHECKPOINT",
              reason: `Terminal event runId ${terminalEvent.payload.runId} does not match requested run ${runId}.`,
            };
          }
        }
        return {
          state: "terminal",
          value: {
            taskStatus: checkpoint.status,
            attemptIndex: checkpoint.attemptIndex,
            stopReason: checkpoint.stopReason,
          },
        };
      }

      // Check owner fence while nonterminal
      if (pinnedOwner !== null) {
        if (controllerLock === null) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "Supervisor controller lease disappeared before final disposition.",
          };
        }
        if (
          controllerLock.token !== pinnedOwner.token ||
          controllerLock.pid !== pinnedOwner.pid ||
          controllerLock.host !== pinnedOwner.host
        ) {
          return {
            state: "refused",
            code: "OWNER_MISMATCH",
            reason: "Supervisor owner identity changed during execution.",
          };
        }
        if (pinnedOwner.host === hostname() && !isProcessAlive(pinnedOwner.pid)) {
          return {
            state: "unresolved",
            code: "OWNER_DEAD",
            reason: `Supervisor controller process (pid=${pinnedOwner.pid}) died before final disposition.`,
          };
        }
      } else {
        if (controllerLock === null) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "No active controller lock found for nonterminal supervisor.",
          };
        }
        if (controllerLock.contractDigest !== contractDigest) {
          return {
            state: "unresolved",
            code: "OWNER_ABSENT",
            reason: "Active controller lock is for a different contract.",
          };
        }
        if (controllerLock.host === hostname() && !isProcessAlive(controllerLock.pid)) {
          return {
            state: "unresolved",
            code: "OWNER_DEAD",
            reason: `Supervisor controller process (pid=${controllerLock.pid}) died before final disposition.`,
          };
        }
        pinnedOwner = {
          token: controllerLock.token,
          pid: controllerLock.pid,
          host: controllerLock.host,
          startedAt: controllerLock.startedAt,
        };
      }

      // Check retry linkage: if supervisor retried, producer must prove run-to-attempt linkage
      if (checkpoint !== null && checkpoint.attemptIndex > pinnedAttemptIndex) {
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
      attemptIndex: settlement.value.attemptIndex,
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
