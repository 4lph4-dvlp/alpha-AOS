import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { open, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import {
  budgetJobOutput,
  buildOrdinaryCommandEnvironment,
  cancelRequestPath,
  jobDirectory,
  launchSpecPath,
  readBoundedFile,
  readJobRecord,
  validateJobId,
  writeJobRecord,
  type CancelRequestPayload,
  type CommandJobRecord,
  type PrivateLaunchSpec,
  MAX_COMBINED_OUTPUT_BYTES,
} from "./command-jobs.js";
import { runProcess } from "./process.js";

async function workerWriteRecord(
  stateRoot: string,
  jobId: string,
  ownerToken: string,
  specDigest: string,
  updateFn: (current: CommandJobRecord) => CommandJobRecord,
): Promise<CommandJobRecord> {
  const current = await readJobRecord(stateRoot, jobId);
  if (current.jobId !== jobId || current.ownerToken !== ownerToken || current.specDigest !== specDigest) {
    throw new Error(`Job ${jobId} ownership or spec drifted; worker refusing write`);
  }
  // Terminal monotonicity: never rewrite terminal to running
  if (
    current.status === "completed" ||
    current.status === "failed" ||
    current.status === "cancelled" ||
    current.status === "timed_out" ||
    current.status === "orphaned"
  ) {
    throw new Error(`Job ${jobId} is already in terminal state (${current.status}); refusing write`);
  }

  const updated = updateFn(current);
  await writeJobRecord(stateRoot, updated);
  return updated;
}

/**
 * Executes a single bounded command job in a detached worker process.
 * Not a service manager: executes one job to close settlement and exits.
 * Reuses canonical runProcess and enforces single-worker claim and CAS monotonicity.
 */
export async function runJobWorker(options: {
  readonly stateRoot: string;
  readonly jobId: string;
  readonly ownerToken: string;
}): Promise<void> {
  const { stateRoot, jobId, ownerToken } = options;
  validateJobId(jobId);

  let initialRecord: CommandJobRecord;
  try {
    initialRecord = await readJobRecord(stateRoot, jobId);
  } catch (err: unknown) {
    process.stderr.write(`Worker failed to read job record: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  // Verify owner fence
  if (initialRecord.ownerToken !== ownerToken) {
    process.stderr.write("Worker owner token mismatch, refusing launch.\n");
    process.exitCode = 1;
    return;
  }

  // Exclusive worker claim prevents double execution
  const claimPath = `${jobDirectory(stateRoot, jobId)}/worker.claim`;
  let claimHandle;
  try {
    claimHandle = await open(claimPath, "wx", 0o600);
    await claimHandle.writeFile(
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        claimedAt: new Date().toISOString(),
      }),
      "utf8",
    );
    await claimHandle.sync();
  } catch {
    process.stderr.write(`Job ${jobId} is already claimed by another worker, refusing execution.\n`);
    process.exitCode = 1;
    return;
  } finally {
    if (claimHandle) await claimHandle.close();
  }

  // Read transient launch spec via bounded reader
  const specPath = launchSpecPath(stateRoot, jobId);
  let spec: PrivateLaunchSpec;
  try {
    const specRaw = await readBoundedFile(specPath, stateRoot, 64 * 1024);
    spec = JSON.parse(specRaw) as PrivateLaunchSpec;
  } catch (err: unknown) {
    const failedRecord: CommandJobRecord = {
      ...initialRecord,
      status: "failed",
      finishedAt: new Date().toISOString(),
      stateRevision: (initialRecord.stateRevision ?? 0) + 1,
      error: {
        code: "LAUNCH_SPEC_MISSING",
        message: `Failed to read launch spec: ${(err as Error).message}`,
      },
    };
    await writeJobRecord(stateRoot, failedRecord).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  // Validate closed launch spec contract
  if (
    typeof spec !== "object" ||
    spec === null ||
    spec.schemaVersion !== 1 ||
    spec.kind !== "command-job-launch" ||
    spec.jobId !== jobId ||
    spec.ownerToken !== ownerToken ||
    typeof spec.executable !== "string" ||
    !Array.isArray(spec.args) ||
    typeof spec.cwd !== "string" ||
    typeof spec.deadlineMs !== "number"
  ) {
    const failedRecord: CommandJobRecord = {
      ...initialRecord,
      status: "failed",
      finishedAt: new Date().toISOString(),
      stateRevision: (initialRecord.stateRevision ?? 0) + 1,
      error: {
        code: "LAUNCH_SPEC_INVALID",
        message: "Launch spec failed closed schema or identity validation",
      },
    };
    await writeJobRecord(stateRoot, failedRecord).catch(() => undefined);
    await unlink(specPath).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  // Verify spec digest and ownership
  const calculatedDigest = createHash("sha256")
    .update(JSON.stringify({ executable: spec.executable, args: spec.args, cwd: spec.cwd, deadlineMs: spec.deadlineMs }))
    .digest("hex");

  if (calculatedDigest !== initialRecord.specDigest) {
    const failedRecord: CommandJobRecord = {
      ...initialRecord,
      status: "failed",
      finishedAt: new Date().toISOString(),
      stateRevision: (initialRecord.stateRevision ?? 0) + 1,
      error: {
        code: "LAUNCH_SPEC_TAMPERED",
        message: "Launch spec digest or ownership mismatch",
      },
    };
    await writeJobRecord(stateRoot, failedRecord).catch(() => undefined);
    await unlink(specPath).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  // Fail BEFORE starting child if private payload cannot be removed
  try {
    await unlink(specPath);
  } catch (unlinkErr) {
    const failedRecord: CommandJobRecord = {
      ...initialRecord,
      status: "failed",
      finishedAt: new Date().toISOString(),
      stateRevision: (initialRecord.stateRevision ?? 0) + 1,
      error: {
        code: "LAUNCH_SPEC_CLEANUP_FAILED",
        message: `Failed to remove private launch spec before execution: ${(unlinkErr as Error).message}`,
      },
    };
    await writeJobRecord(stateRoot, failedRecord).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  const cancelFile = cancelRequestPath(stateRoot, jobId);
  const abortController = new AbortController();
  let cancelled = false;
  let cancelConfirmed = false;
  let childPid: number | null = null;
  let runningWritePromise: Promise<CommandJobRecord | null> = Promise.resolve(null);

  const checkCancellation = async (): Promise<boolean> => {
    try {
      if (!existsSync(cancelFile)) return false;
      const raw = await readBoundedFile(cancelFile, stateRoot, 4 * 1024);
      const parsed = JSON.parse(raw) as CancelRequestPayload;
      if (
        parsed.schemaVersion === 1 &&
        parsed.kind === "command-job-cancel" &&
        parsed.jobId === jobId &&
        parsed.ownerToken === ownerToken &&
        parsed.specDigest === initialRecord.specDigest
      ) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  // Poll for valid atomic cancel request with exact identity
  const cancelPoll = setInterval(async () => {
    if (!cancelled && (await checkCancellation())) {
      cancelled = true;
      cancelConfirmed = true;
      abortController.abort();
    }
  }, 50);
  cancelPoll.unref();

  // Execute child via runProcess
  const startedAt = Date.now();
  let childResult;
  try {
    childResult = await runProcess({
      executable: spec.executable,
      args: spec.args,
      cwd: spec.cwd,
      timeoutMs: spec.deadlineMs,
      maxOutputBytes: MAX_COMBINED_OUTPUT_BYTES,
      overflowPolicy: "drain",
      environment: buildOrdinaryCommandEnvironment(process.env),
      signal: abortController.signal,
      onSpawn: (info) => {
        childPid = info.pid ?? null;
        // Queue running acknowledgment write in order
        runningWritePromise = workerWriteRecord(stateRoot, jobId, ownerToken, initialRecord.specDigest, (curr) => ({
          ...curr,
          status: "running",
          startedAt: curr.startedAt ?? new Date().toISOString(),
          acknowledgedAt: new Date().toISOString(),
          stateRevision: (curr.stateRevision ?? 0) + 1,
          workerPid: process.pid,
          workerHost: hostname(),
          childPid: childPid ?? curr.childPid,
        })).catch((err) => {
          process.stderr.write(`Worker failed to publish running record: ${(err as Error).message}\n`);
          return null;
        });
      },
    });
  } finally {
    clearInterval(cancelPoll);
  }

  // Ensure running acknowledgement write finishes before terminal write
  await runningWritePromise;

  // Check if cancel was requested during close
  if (!cancelled && (await checkCancellation())) {
    cancelled = true;
  }

  // Cleanup cancel request file
  await unlink(cancelFile).catch(() => undefined);

  const durationMs = Date.now() - startedAt;
  const finishedAt = new Date().toISOString();

  // Budget and sanitize output (enforcing record limit <= 512 KiB)
  const output = budgetJobOutput(
    childResult.stdout.excerpt,
    childResult.stderr.excerpt,
    childResult.outputCapped || childResult.stdout.capped || childResult.stderr.capped,
    childResult.stdout.totalBytes + childResult.stderr.totalBytes,
  );

  // Determine final status
  let finalStatus: CommandJobRecord["status"];
  let jobError: CommandJobRecord["error"] = null;

  if (childResult.code === "spawn-failed") {
    finalStatus = "failed";
    jobError = {
      code: "SPAWN_FAILED",
      message: "Child process failed to spawn",
    };
  } else if (childResult.code === "timeout") {
    finalStatus = "timed_out";
    jobError = {
      code: "DEADLINE_EXCEEDED",
      message: `Command exceeded deadline of ${spec.deadlineMs}ms`,
    };
  } else if (childResult.code === "cancelled") {
    if (childResult.exitCode !== null || childResult.signal !== null) {
      finalStatus = "cancelled";
    } else {
      // Fallback cancelled result without actual exit/signal must not become confirmed closed job; diagnose unresolved
      finalStatus = "orphaned";
      cancelConfirmed = false;
      jobError = {
        code: "CANCEL_UNRESOLVED",
        message: "Child did not confirm exit or signal within cancellation grace period",
      };
    }
  } else if (cancelConfirmed) {
    finalStatus = "cancelled";
  } else if (childResult.code === "ok") {
    finalStatus = "completed";
  } else {
    finalStatus = "failed";
    jobError = {
      code: "NON_ZERO_EXIT",
      message: `Command exited with non-zero status ${childResult.exitCode}${childResult.signal ? ` (signal: ${childResult.signal})` : ""}`,
    };
  }

  try {
    await workerWriteRecord(stateRoot, jobId, ownerToken, initialRecord.specDigest, (curr) => ({
      ...curr,
      status: finalStatus,
      finishedAt,
      exitCode: childResult.exitCode,
      signal: childResult.signal,
      childPid: childPid ?? curr.childPid,
      cancelRequested: cancelled || curr.cancelRequested,
      cancelRequestedAt: curr.cancelRequestedAt ?? (cancelled ? finishedAt : null),
      cancelDelivered: cancelled ? true : null,
      cancelConfirmedAt: cancelConfirmed ? finishedAt : null,
      durationMs,
      output,
      error: jobError,
      stateRevision: (curr.stateRevision ?? 0) + 1,
    }));
  } catch (err: unknown) {
    process.stderr.write(`Worker failed to write final record: ${(err as Error).message}\n`);
    process.exitCode = 1;
  }
}
