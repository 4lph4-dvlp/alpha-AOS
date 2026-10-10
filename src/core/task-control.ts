import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import type { ControllerLockRecord } from "./controller-lease.js";
import { terminateProcessTree } from "./process.js";
import { isProcessAlive } from "./writer-lock.js";
import { readCheckpoint, writeCheckpoint, appendJournalEvent, type TaskCheckpoint } from "./task-journal.js";

export type TaskStopStatus = "none" | "pending" | "confirmed" | "unknown";

export interface TaskStopRecord {
  readonly schemaVersion: 1;
  readonly contractId: string;
  readonly contractDigest: string;
  readonly runId: string;
  readonly requestedAt: string;
  readonly reason: string;
  readonly caller: string;
  readonly confirmedAt: string | null;
  readonly terminationEvidence: string | null;
  readonly controllerPid: number | null;
  readonly leaseToken: string | null;
  readonly status: "pending" | "confirmed" | "unknown";
}

export interface TaskStopState {
  readonly status: TaskStopStatus;
  readonly contractId: string;
  readonly contractDigest?: string | undefined;
  readonly runId?: string | undefined;
  readonly requestedAt?: string | undefined;
  readonly confirmedAt?: string | undefined;
  readonly reason?: string | undefined;
  readonly leaseToken?: string | undefined;
  readonly controllerPid?: number | undefined;
  readonly terminationEvidence?: string | undefined;
  readonly nextAction: string;
}

export interface TaskStopRequestResult {
  readonly contractId: string;
  readonly contractDigest: string;
  readonly runId: string;
  readonly status: "pending" | "confirmed";
  readonly requestedAt: string;
  readonly confirmedAt: string | null;
  readonly reason: string;
  readonly controllerPid: number | null;
  readonly nextAction: string;
  readonly resumeCommand?: string | undefined;
}

/** Directory holding durable stop records for a contract and run. */
export function taskStopRecordDir(stateRoot: string, contractId: string): string {
  return join(stateRoot, "tasks", contractId, "control");
}

/** Path for a durable stop record bound to runId (or fallback digest). */
export function taskStopRecordPath(stateRoot: string, contractId: string, runOrDigest: string): string {
  return join(taskStopRecordDir(stateRoot, contractId), `${runOrDigest}.stop.json`);
}

/**
 * Reads the durable controller lock from <projectRoot>/.alpha-aos/controller.lock if it exists.
 */
async function readActiveControllerLock(projectRoot: string): Promise<ControllerLockRecord | null> {
  const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");
  if (!existsSync(lockPath)) return null;
  try {
    const text = await readFile(lockPath, "utf8");
    const record = JSON.parse(text) as ControllerLockRecord;
    return record && typeof record.pid === "number" ? record : null;
  } catch {
    return null;
  }
}

/**
 * Reads the durable stop state for a contract, run, or digest.
 * Distinguishes request acceptance (pending) from observed termination (confirmed) (D-12).
 */
export async function readTaskStopState(options: {
  stateRoot: string;
  contractId: string;
  contractDigest?: string | undefined;
  runId?: string | undefined;
  projectRoot?: string | undefined;
}): Promise<TaskStopState> {
  const { stateRoot, contractId } = options;
  const controlDir = taskStopRecordDir(stateRoot, contractId);

  let targetFile: string | null = null;
  if (options.runId) {
    const p = taskStopRecordPath(stateRoot, contractId, options.runId);
    if (existsSync(p)) targetFile = p;
  }
  if (!targetFile && options.contractDigest) {
    const p = taskStopRecordPath(stateRoot, contractId, options.contractDigest);
    if (existsSync(p)) targetFile = p;
  }

  // If neither was specified, find latest in control directory
  if (!targetFile && existsSync(controlDir)) {
    try {
      const files = await readdir(controlDir);
      const stopFiles = files.filter((f) => f.endsWith(".stop.json")).sort().reverse();
      if (stopFiles[0]) {
        targetFile = join(controlDir, stopFiles[0]);
      }
    } catch {
      // directory unreadable
    }
  }

  if (!targetFile || !existsSync(targetFile)) {
    return {
      status: "none",
      contractId,
      contractDigest: options.contractDigest,
      runId: options.runId,
      nextAction: "Task has no pending stop requests.",
    };
  }

  let record: TaskStopRecord;
  try {
    const text = await readFile(targetFile, "utf8");
    record = JSON.parse(text) as TaskStopRecord;
  } catch {
    return {
      status: "unknown",
      contractId,
      contractDigest: options.contractDigest,
      runId: options.runId,
      nextAction: "Stop record is malformed or unreadable. Inspect stateRoot.",
    };
  }

  // If confirmed on record:
  if (record.status === "confirmed" || record.confirmedAt !== null) {
    return {
      status: "confirmed",
      contractId: record.contractId,
      contractDigest: record.contractDigest,
      runId: record.runId,
      requestedAt: record.requestedAt,
      confirmedAt: record.confirmedAt ?? undefined,
      reason: record.reason,
      leaseToken: record.leaseToken ?? undefined,
      controllerPid: record.controllerPid ?? undefined,
      terminationEvidence: record.terminationEvidence ?? undefined,
      nextAction: "Execution halted and verified. Inspect resume readiness with 'alpha-aos task resume'.",
    };
  }

  // If pending, check if controller process is still running
  if (record.status === "pending") {
    let pidAlive = false;
    if (record.controllerPid !== null) {
      pidAlive = isProcessAlive(record.controllerPid);
    } else if (options.projectRoot) {
      const lock = await readActiveControllerLock(options.projectRoot);
      if (lock && isProcessAlive(lock.pid)) {
        pidAlive = true;
      }
    }

    if (pidAlive) {
      return {
        status: "pending",
        contractId: record.contractId,
        contractDigest: record.contractDigest,
        runId: record.runId,
        requestedAt: record.requestedAt,
        reason: record.reason,
        leaseToken: record.leaseToken ?? undefined,
        controllerPid: record.controllerPid ?? undefined,
        nextAction: "Stop requested. Waiting for child process and descendants to terminate.",
      };
    }

    // PID is no longer alive, but termination was not cleanly confirmed by controller (e.g. crash or unobserved exit)
    return {
      status: "unknown",
      contractId: record.contractId,
      contractDigest: record.contractDigest,
      runId: record.runId,
      requestedAt: record.requestedAt,
      reason: record.reason,
      leaseToken: record.leaseToken ?? undefined,
      controllerPid: record.controllerPid ?? undefined,
      nextAction: "Process exited or crashed before confirming stop. Reconcile effects and inspect state before resuming.",
    };
  }

  return {
    status: record.status,
    contractId: record.contractId,
    contractDigest: record.contractDigest,
    runId: record.runId,
    requestedAt: record.requestedAt,
    reason: record.reason,
    nextAction: "Inspect task state.",
  };
}

/**
 * Records observed termination confirmation for a stop request (D-12).
 */
export async function recordTaskStopConfirmation(options: {
  stateRoot: string;
  contractId: string;
  runId: string;
  contractDigest?: string | undefined;
  terminationEvidence?: string | undefined;
  stopReason?: string | undefined;
}): Promise<void> {
  const { stateRoot, contractId, runId } = options;
  const controlDir = taskStopRecordDir(stateRoot, contractId);
  await mkdir(controlDir, { recursive: true, mode: 0o700 });

  const recordPath = taskStopRecordPath(stateRoot, contractId, runId);
  let existing: Partial<TaskStopRecord> = {};
  if (existsSync(recordPath)) {
    try {
      existing = JSON.parse(await readFile(recordPath, "utf8")) as TaskStopRecord;
    } catch {}
  }

  const now = new Date().toISOString();
  const confirmed: TaskStopRecord = {
    schemaVersion: 1,
    contractId,
    contractDigest: options.contractDigest ?? existing.contractDigest ?? "",
    runId,
    requestedAt: existing.requestedAt ?? now,
    reason: options.stopReason ?? existing.reason ?? "operator_halt",
    caller: existing.caller ?? "operator",
    confirmedAt: now,
    terminationEvidence: options.terminationEvidence ?? "observed-process-exit",
    controllerPid: existing.controllerPid ?? null,
    leaseToken: existing.leaseToken ?? null,
    status: "confirmed",
  };

  const handle = await open(recordPath, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(confirmed, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Submits a durable stop request for an active or running task (D-12, UX-02).
 * Fences to the target run/digest and controller lease to prevent touching concurrent controllers.
 */
export async function requestTaskStop(options: {
  stateRoot: string;
  contractId: string;
  runId?: string | undefined;
  contractDigest?: string | undefined;
  projectRoot?: string | undefined;
  reason?: string | undefined;
  caller?: string | undefined;
  waitTimeoutMs?: number | undefined;
}): Promise<TaskStopRequestResult> {
  const { stateRoot, contractId } = options;
  const reason = options.reason ?? "operator_halt";
  const caller = options.caller ?? "cli";
  const now = new Date().toISOString();

  // 1. Resolve contractDigest and runId from checkpoint / approvals / runs if missing
  let contractDigest = options.contractDigest;
  let runId = options.runId;

  if (!contractDigest || !runId) {
    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    if (runId && existsSync(runsDir)) {
      const runPath = join(runsDir, `${runId}.json`);
      if (existsSync(runPath)) {
        try {
          const runRecord = JSON.parse(await readFile(runPath, "utf8")) as { contractDigest: string };
          contractDigest = runRecord.contractDigest;
        } catch {}
      }
    }
    if (!contractDigest) {
      // Check latest checkpoint in stateRoot/runs
      const cpDir = join(stateRoot, "runs");
      if (existsSync(cpDir)) {
        const files = await readdir(cpDir);
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          try {
            const cp = JSON.parse(await readFile(join(cpDir, f), "utf8")) as TaskCheckpoint;
            if (cp.contractId === contractId) {
              contractDigest = cp.contractDigest;
              if (!runId) runId = cp.contractDigest; // fallback
              break;
            }
          } catch {}
        }
      }
    }
  }

  if (!contractDigest) {
    contractDigest = "unknown-digest";
  }
  if (!runId) {
    runId = contractDigest;
  }

  // 2. Read active controller lock to inspect running process
  let activePid: number | null = null;
  let activeToken: string | null = null;
  if (options.projectRoot) {
    const lock = await readActiveControllerLock(options.projectRoot);
    if (lock) {
      // Fence check: only target if lock matches this contract digest (UX-02, T-21-07)
      if (lock.contractDigest === contractDigest) {
        activePid = lock.pid;
        activeToken = lock.token;
      }
    }
  }

  // 3. Write durable 0600 stop request
  const controlDir = taskStopRecordDir(stateRoot, contractId);
  await mkdir(controlDir, { recursive: true, mode: 0o700 });
  const recordPath = taskStopRecordPath(stateRoot, contractId, runId);

  const requestRecord: TaskStopRecord = {
    schemaVersion: 1,
    contractId,
    contractDigest,
    runId,
    requestedAt: now,
    reason,
    caller,
    confirmedAt: null,
    terminationEvidence: null,
    controllerPid: activePid,
    leaseToken: activeToken,
    status: "pending",
  };

  const handle = await open(recordPath, "w", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(requestRecord, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  // Also write by digest if runId differs
  if (runId !== contractDigest) {
    const digestPath = taskStopRecordPath(stateRoot, contractId, contractDigest);
    const dHandle = await open(digestPath, "w", 0o600);
    try {
      await dHandle.writeFile(`${JSON.stringify(requestRecord, null, 2)}\n`, "utf8");
      await dHandle.sync();
    } finally {
      await dHandle.close();
    }
  }

  // 4. If live controller process is detected, deliver cancellation signal
  let isAlive = activePid !== null && isProcessAlive(activePid);
  if (isAlive && activePid !== null && activePid !== process.pid) {
    try {
      terminateProcessTree(activePid, "SIGTERM");
    } catch {}

    // Bounded wait for process exit if requested
    const timeout = options.waitTimeoutMs ?? 0;
    if (timeout > 0) {
      const startWait = Date.now();
      while (Date.now() - startWait < timeout) {
        if (!isProcessAlive(activePid)) {
          isAlive = false;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  // 5. If process is already terminated or no live controller exists:
  if (!isAlive) {
    const confirmedAt = new Date().toISOString();
    await recordTaskStopConfirmation({
      stateRoot,
      contractId,
      runId,
      contractDigest,
      terminationEvidence: activePid ? "process-terminated-after-signal" : "no-live-controller-process",
      stopReason: reason,
    });

    // Update checkpoint if present
    const cp = await readCheckpoint(stateRoot, contractDigest);
    if (cp && cp.status !== "stopped") {
      const updatedCp: TaskCheckpoint = {
        ...cp,
        status: "stopped",
        stopReason: reason,
        updatedAt: confirmedAt,
      };
      await writeCheckpoint(stateRoot, updatedCp);
      await appendJournalEvent(stateRoot, contractDigest, {
        kind: "limit_exceeded",
        contractDigest,
        attemptIndex: cp.attemptIndex,
        payload: { stopCode: "operator_halt", reason },
      });
    }

    return {
      contractId,
      contractDigest,
      runId,
      status: "confirmed",
      requestedAt: now,
      confirmedAt,
      reason,
      controllerPid: activePid,
      nextAction: "Execution halted and verified. Inspect resume readiness with 'alpha-aos task resume'.",
    };
  }

  // Live child still running -> return pending per D-12
  return {
    contractId,
    contractDigest,
    runId,
    status: "pending",
    requestedAt: now,
    confirmedAt: null,
    reason,
    controllerPid: activePid,
    nextAction: "Stop requested. Waiting for child process and descendants to terminate. Query 'alpha-aos task status' to monitor.",
  };
}
