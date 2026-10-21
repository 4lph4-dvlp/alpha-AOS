import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { hostname } from "node:os";
import {
  assertJobIdentityMatch,
  assertNoSymlinksInAncestors,
  budgetJobOutput,
  buildOrdinaryCommandEnvironment,
  cancelRequestPath,
  jobDirectory,
  launchSpecPath,
  readBoundedFile,
  readJobRecord,
  updateJobRecord,
  writeAtomicPrivateFile,
  validateCancelRequest,
  validateJobId,
  validatePrivateLaunchSpec,
  type CommandJobRecord,
  type ExpectedJobIdentity,
  type PrivateLaunchSpec,
  MAX_COMBINED_OUTPUT_BYTES,
} from "./command-jobs.js";
import { runProcess } from "./process.js";

export interface JobWorkerTestSeams {
  readonly onBeforeAck?: (child: { pid: number }) => Promise<void> | void;
  readonly onAfterAck?: (record: CommandJobRecord) => Promise<void> | void;
  readonly onBeforeTerminalWrite?: (info: {
    finalStatus: CommandJobRecord["status"];
    runningRecord: CommandJobRecord | null;
  }) => Promise<void> | void;
  readonly onBeforeCancelDelivery?: () => Promise<void> | void;
  readonly onProcessSettled?: () => void;
}

export interface RunJobWorkerOptions {
  readonly stateRoot: string;
  readonly jobId: string;
  readonly ownerToken: string;
  readonly cleanupGraceMs?: number | undefined;
  readonly _testSeams?: JobWorkerTestSeams | undefined;
}

/**
 * Executes a single bounded command job in a detached worker process.
 * Not a service manager: executes one job to close settlement and exits.
 * Reuses canonical runProcess and enforces single-worker claim and CAS monotonicity.
 */
export async function runJobWorker(options: RunJobWorkerOptions): Promise<void> {
  const { stateRoot, jobId, ownerToken, cleanupGraceMs, _testSeams } = options;
  validateJobId(jobId);

  let initialRecord: CommandJobRecord;
  try {
    initialRecord = await readJobRecord(stateRoot, jobId);
  } catch (err: unknown) {
    process.stderr.write(`Worker failed to read job record: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  // Pin immutable initial metadata and expected revision
  let pinnedIdentity: ExpectedJobIdentity = {
    jobId: initialRecord.jobId,
    ownerToken: initialRecord.ownerToken,
    specDigest: initialRecord.specDigest,
    createdAt: initialRecord.createdAt,
    cwd: initialRecord.cwd,
    command: initialRecord.command,
    deadlineMs: initialRecord.deadlineMs,
    minRevision: initialRecord.stateRevision,
  };

  // Verify owner fence
  if (initialRecord.ownerToken !== ownerToken) {
    process.stderr.write("Worker owner token mismatch, refusing launch.\n");
    process.exitCode = 1;
    return;
  }

  // Must be in pending status
  if (initialRecord.status !== "pending") {
    process.stderr.write(`Worker job is not in pending status (${initialRecord.status}), refusing launch.\n`);
    process.exitCode = 1;
    return;
  }

  // Publish the persistent single-worker claim with the same retained path proof as payloads.
  const claimPath = `${jobDirectory(stateRoot, jobId)}/worker.claim`;
  try {
    await writeAtomicPrivateFile(claimPath, JSON.stringify({
      pid: process.pid, host: hostname(), claimedAt: new Date().toISOString(),
    }), 4096, stateRoot, { exclusive: true });
  } catch {
    process.stderr.write(`Job ${jobId} claim is occupied or its path is unprovable, refusing execution.\n`);
    process.exitCode = 1;
    return;
  }

  // At this point, this worker exclusively owns execution for this job.
  // Private payload cleanup is scoped to failures on this owned path.
  const specPath = launchSpecPath(stateRoot, jobId);
  let specRaw: string;
  try {
    specRaw = await readBoundedFile(specPath, stateRoot, 64 * 1024);
  } catch (err: unknown) {
    await unlink(specPath).catch(() => undefined);
    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken,
        specDigest: initialRecord.specDigest,
        stateRevision: initialRecord.stateRevision,
      },
      {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          code: "LAUNCH_SPEC_MISSING",
          message: `Failed to read launch spec: ${(err as Error).message}`,
        },
      },
    ).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  let parsedSpec: unknown;
  try {
    parsedSpec = JSON.parse(specRaw);
  } catch (err: unknown) {
    await unlink(specPath).catch(() => undefined);
    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken,
        specDigest: initialRecord.specDigest,
        stateRevision: initialRecord.stateRevision,
      },
      {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          code: "LAUNCH_SPEC_INVALID",
          message: `Failed to parse launch spec JSON: ${(err as Error).message}`,
        },
      },
    ).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  // Validate closed launch spec contract: full actual canonical fields and metadata agreement
  let spec: PrivateLaunchSpec;
  try {
    spec = validatePrivateLaunchSpec(parsedSpec, {
      jobId: initialRecord.jobId,
      ownerToken: initialRecord.ownerToken,
      specDigest: initialRecord.specDigest,
      cwd: initialRecord.cwd,
      deadlineMs: initialRecord.deadlineMs,
      createdAt: initialRecord.createdAt,
      status: initialRecord.status,
    });
  } catch (err: unknown) {
    await unlink(specPath).catch(() => undefined);
    const errMsg = (err as Error).message;
    const isTampered =
      errMsg.includes("MISMATCH") ||
      errMsg.includes("TAMPERED") ||
      errMsg.includes("Launch spec digest");
    const errorCode = isTampered ? "LAUNCH_SPEC_TAMPERED" : "LAUNCH_SPEC_INVALID";
    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken,
        specDigest: initialRecord.specDigest,
        stateRevision: initialRecord.stateRevision,
      },
      {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          code: errorCode,
          message: errMsg,
        },
      },
    ).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  // Fail BEFORE starting child if private payload cannot be removed
  try {
    await assertNoSymlinksInAncestors(specPath, stateRoot);
    await unlink(specPath);
  } catch (unlinkErr) {
    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken,
        specDigest: initialRecord.specDigest,
        stateRevision: initialRecord.stateRevision,
      },
      {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          code: "LAUNCH_SPEC_CLEANUP_FAILED",
          message: `Failed to remove private launch spec before execution: ${(unlinkErr as Error).message}`,
        },
      },
    ).catch(() => undefined);
    process.exitCode = 1;
    return;
  }

  const cancelFile = cancelRequestPath(stateRoot, jobId);
  const abortController = new AbortController();
  let childActive = true;
  let activeGeneration = 0;
  let cancelRequested = false;
  let cancelRequestedAt: string | null = null;
  let cancelDelivered: boolean | null = null;
  let cancelConfirmed = false;
  let cancelFileOwned = false;
  let childPid: number | null = null;
  let acknowledgementFailed = false;
  let acknowledgementError: Error | null = null;
  let runningRecord: CommandJobRecord | null = null;
  let runningWritePromise: Promise<CommandJobRecord | null> = Promise.resolve(null);
  const cancelState: { inFlight: Promise<void> | null } = { inFlight: null };
  let cancelPollTimer: NodeJS.Timeout | null = null;

  const checkAndDeliverCancellation = async (generation: number): Promise<void> => {
    if (!childActive || generation !== activeGeneration) return;
    try {
      if (!existsSync(cancelFile)) return;
      const raw = await readBoundedFile(cancelFile, stateRoot, 4 * 1024);
      if (!childActive || generation !== activeGeneration) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }

      // Validate against CURRENT fenced record before delivery
      const currentRec = await readJobRecord(stateRoot, jobId);
      if (!childActive || generation !== activeGeneration) return;

      // Ownership and full identity check against pinned expectations
      assertJobIdentityMatch(currentRec, pinnedIdentity, "cancel");

      // Shared validator checks canonical schema and field equality
      const cancelPayload = validateCancelRequest(parsed, {
        jobId: currentRec.jobId,
        ownerToken: currentRec.ownerToken,
        specDigest: currentRec.specDigest,
      });

      cancelFileOwned = true;

      if (!childActive || generation !== activeGeneration) return;

      if (_testSeams?.onBeforeCancelDelivery) {
        await _testSeams.onBeforeCancelDelivery();
      }

      // Recheck immediately after test seam await: do not abort after process closure
      if (!childActive || generation !== activeGeneration) return;

      if (!cancelRequested) {
        cancelRequested = true;
        cancelRequestedAt = cancelPayload.requestedAt;
        cancelDelivered = true;
        abortController.abort();
      }
    } catch {
      // Ignore invalid, untrusted, or unparseable cancel markers during polling
    }
  };

  const schedulePoll = () => {
    if (!childActive) return;
    cancelPollTimer = setTimeout(() => {
      if (!childActive) return;
      const gen = activeGeneration;
      cancelState.inFlight = checkAndDeliverCancellation(gen).finally(() => {
        cancelState.inFlight = null;
        if (childActive && gen === activeGeneration) schedulePoll();
      });
    }, 50);
    cancelPollTimer.unref();
  };
  schedulePoll();

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
      ...(cleanupGraceMs !== undefined ? { cleanupGraceMs } : {}),
      onSpawn: (info) => {
        if (typeof info.pid !== "number" || info.pid <= 0) {
          return;
        }
        childPid = info.pid;
        runningWritePromise = (async () => {
          try {
            if (_testSeams?.onBeforeAck) {
              await _testSeams.onBeforeAck({ pid: info.pid });
            }
            const updated = await updateJobRecord(
              stateRoot,
              {
                jobId,
                ownerToken,
                specDigest: initialRecord.specDigest,
                stateRevision: initialRecord.stateRevision,
              },
              {
                status: "running",
                startedAt: new Date().toISOString(),
                acknowledgedAt: new Date().toISOString(),
                workerPid: process.pid,
                workerHost: hostname(),
                childPid: info.pid,
              },
            );
            runningRecord = updated;
            pinnedIdentity = {
              ...pinnedIdentity,
              minRevision: updated.stateRevision,
              workerPid: process.pid,
              workerHost: hostname(),
              childPid: info.pid,
            };
            if (_testSeams?.onAfterAck) {
              await _testSeams.onAfterAck(updated);
            }
            return updated;
          } catch (err: unknown) {
            acknowledgementFailed = true;
            acknowledgementError = err instanceof Error ? err : new Error(String(err));
            process.stderr.write(`Worker failed to publish running record: ${acknowledgementError.message}\n`);
            // Fatal acknowledgement failure: abort owned child immediately!
            abortController.abort();
            return null;
          }
        })();
      },
    });
  } finally {
    childActive = false;
    activeGeneration++;
    _testSeams?.onProcessSettled?.();
    if (cancelPollTimer !== null) {
      clearTimeout(cancelPollTimer);
      cancelPollTimer = null;
    }
    if (cancelState.inFlight !== null) {
      await cancelState.inFlight.catch(() => undefined);
      cancelState.inFlight = null;
    }
  }

  // Ensure running acknowledgement write finishes before terminal write
  const acknowledged = await runningWritePromise;

  // Check if cancel was requested before/during close, validating ownership before touching marker
  if (existsSync(cancelFile)) {
    try {
      const raw = await readBoundedFile(cancelFile, stateRoot, 4 * 1024);
      const parsed = JSON.parse(raw);
      const current = await readJobRecord(stateRoot, jobId);
      assertJobIdentityMatch(current, pinnedIdentity, "cancel");
      const cancelPayload = validateCancelRequest(parsed, {
        jobId: current.jobId,
        ownerToken: current.ownerToken,
        specDigest: current.specDigest,
      });
      cancelFileOwned = true;
      if (!cancelRequested) {
        cancelRequested = true;
        cancelRequestedAt = cancelPayload.requestedAt;
      }
    } catch {
      // Ignore invalid or foreign cancel request
    }
  }

  // Only remove cancel file if verified as owned by this job; never delete foreign cancel marker
  if (cancelFileOwned) {
    await assertNoSymlinksInAncestors(cancelFile, stateRoot).catch(() => undefined);
    await unlink(cancelFile).catch(() => undefined);
  }

  const durationMs = Date.now() - startedAt;
  const finishedAt = new Date().toISOString();

  // Budget and sanitize output (enforcing combined 64 KiB UTF-8 byte limit)
  const output = budgetJobOutput(
    childResult.stdout.excerpt,
    childResult.stderr.excerpt,
    childResult.outputCapped || childResult.stdout.capped || childResult.stderr.capped,
    childResult.stdout.totalBytes + childResult.stderr.totalBytes,
  );

  // Determine final status
  let finalStatus: CommandJobRecord["status"];
  let jobError: CommandJobRecord["error"] = null;

  if (acknowledgementFailed) {
    finalStatus = "orphaned";
    const ackError = acknowledgementError as Error | null;
    const ackMessage = ackError?.message ?? "unknown error";
    jobError = {
      code: "ACKNOWLEDGEMENT_FAILED",
      message: `Worker failed to publish running record: ${ackMessage}`,
    };
  } else if (childResult.code === "spawn-failed") {
    finalStatus = "failed";
    jobError = {
      code: "SPAWN_FAILED",
      message: "Child process failed to spawn",
    };
  } else if (childResult.code === "timeout") {
    if (childResult.closeConfirmed !== false) {
      finalStatus = "timed_out";
      jobError = {
        code: "DEADLINE_EXCEEDED",
        message: `Command exceeded deadline of ${spec.deadlineMs}ms`,
      };
    } else {
      finalStatus = "orphaned";
      jobError = {
        code: "DEADLINE_CLOSE_UNCONFIRMED",
        message: `Command exceeded deadline of ${spec.deadlineMs}ms but process tree closure could not be confirmed within cleanup grace`,
      };
    }
  } else if (childResult.code === "cancelled") {
    if (childResult.closeConfirmed !== false && (childResult.exitCode !== null || childResult.signal !== null)) {
      finalStatus = "cancelled";
      cancelConfirmed = true;
    } else {
      finalStatus = "orphaned";
      cancelConfirmed = false;
      jobError = {
        code: "CANCEL_UNRESOLVED",
        message: "Child did not confirm exit or signal within cancellation grace period",
      };
    }
  } else if (childResult.code === "ok") {
    finalStatus = "completed";
  } else {
    finalStatus = "failed";
    jobError = {
      code: "NON_ZERO_EXIT",
      message: `Command exited with non-zero status ${childResult.exitCode}${childResult.signal ? ` (signal: ${childResult.signal})` : ""}`,
    };
  }

  // Cancel delivery and confirmation only derived from actual cancellation
  const actualCancelDelivered = finalStatus === "cancelled" && cancelConfirmed ? true : null;
  const actualCancelConfirmedAt = finalStatus === "cancelled" && cancelConfirmed ? finishedAt : null;
  const finalCancelRequested = cancelRequested || (acknowledged ? acknowledged.cancelRequested : false);
  const finalCancelRequestedAt = cancelRequestedAt ?? (acknowledged ? acknowledged.cancelRequestedAt : null);

  if (_testSeams?.onBeforeTerminalWrite) {
    await _testSeams.onBeforeTerminalWrite({ finalStatus, runningRecord: acknowledged });
  }

  try {
    const currentOnDisk = await readJobRecord(stateRoot, jobId);
    const expectedRevision =
      acknowledged !== null ? acknowledged.stateRevision : initialRecord.stateRevision;

    // Strict identity match against pinned metadata and claims
    assertJobIdentityMatch(
      currentOnDisk,
      {
        ...pinnedIdentity,
        minRevision: expectedRevision,
        ...(acknowledged !== null
          ? {
              workerPid: process.pid,
              workerHost: hostname(),
              childPid: acknowledged.childPid,
            }
          : {}),
      },
      "wait",
    );

    // Refuse to touch drifted or foreign record
    if (currentOnDisk.stateRevision !== expectedRevision) {
      process.stderr.write(`Job ${jobId} record revision drifted before terminal write; worker refusing write\n`);
      process.exitCode = 1;
      return;
    }

    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken,
        specDigest: initialRecord.specDigest,
        stateRevision: expectedRevision,
      },
      {
        status: finalStatus,
        finishedAt,
        exitCode: childResult.exitCode,
        signal: childResult.signal,
        childPid: childPid ?? (acknowledged ? acknowledged.childPid : null),
        cancelRequested: finalCancelRequested,
        cancelRequestedAt: finalCancelRequestedAt,
        cancelDelivered: actualCancelDelivered,
        cancelConfirmedAt: actualCancelConfirmedAt,
        durationMs,
        output,
        error: jobError,
      },
    );
  } catch (err: unknown) {
    process.stderr.write(`Worker failed to write final record: ${(err as Error).message}\n`);
    process.exitCode = 1;
    return;
  }

  if (acknowledgementFailed) {
    process.exitCode = 1;
  }
}
