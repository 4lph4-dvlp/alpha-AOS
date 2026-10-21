import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  cancelRequestPath,
  computeSpecDigest,
  createJobRecord,
  jobRecordPath,
  launchSpecPath,
  readJobRecord,
  writeAtomicPrivateFile,
  MAX_CANCEL_REQUEST_BYTES,
  MAX_LAUNCH_SPEC_BYTES,
  MAX_RECORD_BYTES,
  type CommandJobRecord,
  type PrivateLaunchSpec,
  type CancelRequestPayload,
} from "../src/core/command-jobs.js";
import {
  runJobWorker,
  type JobWorkerTestSeams,
} from "../src/core/command-job-worker.js";

async function createWorkerTestState(): Promise<{ stateRoot: string; cleanup: () => Promise<void> }> {
  const dir = join(tmpdir(), `test-job-worker-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return {
    stateRoot: dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    },
  };
}

async function setupJobFixture(params: {
  stateRoot: string;
  jobId: string;
  ownerToken?: string;
  args?: readonly string[];
  executable?: string;
  cwd?: string;
  deadlineMs?: number;
  launchSpecModifier?: (spec: PrivateLaunchSpec) => Record<string, unknown>;
}): Promise<{
  ownerToken: string;
  specDigest: string;
  initialRecord: CommandJobRecord;
  launchSpec: PrivateLaunchSpec;
}> {
  const {
    stateRoot,
    jobId,
    ownerToken = "test-owner-token",
    executable = resolve(process.execPath),
    args = ["-e", "process.exit(0)"],
    cwd = resolve(process.cwd()),
    deadlineMs = 30000,
  } = params;

  const specDigest = computeSpecDigest({
    executable,
    args,
    cwd,
    deadlineMs,
  });

  const createdAt = new Date().toISOString();

  const initialRecord: CommandJobRecord = {
    schemaVersion: 1,
    kind: "command-job",
    jobId,
    ownerToken,
    specDigest,
    status: "pending",
    createdAt,
    startedAt: null,
    acknowledgedAt: null,
    finishedAt: null,
    stateRevision: 0,
    cwd,
    command: basename(executable),
    deadlineMs,
    workerPid: null,
    workerHost: null,
    childPid: null,
    exitCode: null,
    signal: null,
    cancelRequested: false,
    cancelRequestedAt: null,
    cancelDelivered: null,
    cancelConfirmedAt: null,
    durationMs: null,
    output: null,
    error: null,
  };

  await createJobRecord(stateRoot, initialRecord);

  const launchSpec: PrivateLaunchSpec = {
    schemaVersion: 1,
    kind: "command-job-launch",
    jobId,
    ownerToken,
    executable,
    args,
    cwd,
    deadlineMs,
    createdAt,
  };

  const finalLaunchPayload = params.launchSpecModifier
    ? params.launchSpecModifier(launchSpec)
    : launchSpec;

  await writeAtomicPrivateFile(
    launchSpecPath(stateRoot, jobId),
    JSON.stringify(finalLaunchPayload, null, 2),
    MAX_LAUNCH_SPEC_BYTES,
    stateRoot,
  );

  return { ownerToken, specDigest, initialRecord, launchSpec };
}

test("worker fixture 1: ack write failure after child spawn -> owned child reaped, no running/completed success claim and foreign record bytes untouched", async () => {
  const savedExitCode = process.exitCode;
  const { stateRoot, cleanup } = await createWorkerTestState();
  try {
    const jobId = "job-0000000000000001";
    const { ownerToken, initialRecord } = await setupJobFixture({
      stateRoot,
      jobId,
      args: ["-e", "setInterval(() => {}, 1000)"],
    });

    let spawnedPid: number | null = null;
    let foreignBytes: string | null = null;

    const _testSeams: JobWorkerTestSeams = {
      onBeforeAck: async (child) => {
        spawnedPid = child.pid;
        // Rogue entity overwrites the record with foreign bytes before ack write
        const foreignRecord = {
          ...initialRecord,
          ownerToken: "foreign-rogue-owner",
          stateRevision: 1,
        };
        foreignBytes = `${JSON.stringify(foreignRecord, null, 2)}\n`;
        await writeAtomicPrivateFile(
          jobRecordPath(stateRoot, jobId),
          foreignBytes,
          MAX_RECORD_BYTES,
          stateRoot,
        );
      },
    };

    await runJobWorker({
      stateRoot,
      jobId,
      ownerToken,
      _testSeams,
    });

    assert.equal(process.exitCode, 1);
    assert.ok(typeof spawnedPid === "number" && (spawnedPid as number) > 0);
    assert.throws(() => process.kill(spawnedPid as number, 0), (err: unknown) => (err as NodeJS.ErrnoException).code === "ESRCH", "acknowledgement failure must reap the actual owned child");

    // Foreign record bytes on disk must be completely untouched
    const currentBytes = await readFile(jobRecordPath(stateRoot, jobId), "utf8");
    assert.equal(currentBytes, foreignBytes);

    // Record on disk must have never claimed running or completed status
    const currentOnDisk = JSON.parse(currentBytes) as CommandJobRecord;
    assert.notEqual(currentOnDisk.status, "running");
    assert.notEqual(currentOnDisk.status, "completed");
  } finally {
    process.exitCode = savedExitCode;
    await cleanup();
  }
});

test("worker fixture 2: cancellation read/barrier released after real child naturally closed -> completed actual exit, no delivered/confirmed cancel", async () => {
  const savedExitCode = process.exitCode;
  const { stateRoot, cleanup } = await createWorkerTestState();
  try {
    const jobId = "job-0000000000000002";
    const releaseFile = join(stateRoot, "child-release");
    const { ownerToken, specDigest } = await setupJobFixture({
      stateRoot,
      jobId,
      args: ["-e", "const fs=require('node:fs');const start=Date.now();const timer=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(timer);process.exit(0)}if(Date.now()-start>5000)process.exit(91)},10)", releaseFile],
    });

    // Write valid cancel request
    const cancelPayload: CancelRequestPayload = {
      schemaVersion: 1,
      kind: "command-job-cancel",
      jobId,
      ownerToken,
      specDigest,
      requestedAt: new Date().toISOString(),
    };
    await writeAtomicPrivateFile(
      cancelRequestPath(stateRoot, jobId),
      JSON.stringify(cancelPayload, null, 2),
      MAX_CANCEL_REQUEST_BYTES,
      stateRoot,
    );

    let enterBarrier!: () => void;
    const entered = new Promise<void>((resolveBarrier) => { enterBarrier = resolveBarrier; });
    let signalSettled!: () => void;
    const settled = new Promise<void>((resolveSettled) => { signalSettled = resolveSettled; });
    const deadline = AbortSignal.timeout(8000);
    const bounded = async (promise: Promise<void>): Promise<void> => {
      await new Promise<void>((resolveBounded, rejectBounded) => {
        const abort = () => rejectBounded(new Error("worker barrier deadline exceeded"));
        deadline.addEventListener("abort", abort, { once: true });
        promise.then(resolveBounded, rejectBounded).finally(() => deadline.removeEventListener("abort", abort));
      });
    };
    let seamTriggered = false;
    const _testSeams: JobWorkerTestSeams = {
      onBeforeCancelDelivery: async () => {
        seamTriggered = true;
        enterBarrier();
        await bounded(settled);
      },
      onProcessSettled: () => signalSettled(),
    };
    const worker = runJobWorker({ stateRoot, jobId, ownerToken, _testSeams });
    await bounded(entered);
    await writeFile(releaseFile, "release", "utf8");
    await worker;

    assert.ok(seamTriggered);

    const record = await readJobRecord(stateRoot, jobId);
    assert.equal(record.status, "completed");
    assert.equal(record.exitCode, 0);
    assert.equal(record.signal, null);
    assert.equal(record.cancelRequested, true);
    assert.equal(record.cancelDelivered, null);
    assert.equal(record.cancelConfirmedAt, null);
  } finally {
    process.exitCode = savedExitCode;
    await cleanup();
  }
});

test("worker fixture 3: tampered closed launch + cancel unknown field cannot launch or deliver", async () => {
  const savedExitCode = process.exitCode;
  const { stateRoot, cleanup } = await createWorkerTestState();
  try {
    // Part A: Tampered launch spec cannot launch
    const jobIdA = "job-0000000000000003";
    const { ownerToken: ownerA } = await setupJobFixture({
      stateRoot,
      jobId: jobIdA,
      launchSpecModifier: (spec) => ({
        ...spec,
        unknownField: "tampered-payload",
      }),
    });

    await runJobWorker({
      stateRoot,
      jobId: jobIdA,
      ownerToken: ownerA,
    });

    assert.equal(process.exitCode, 1);
    process.exitCode = savedExitCode;

    const recordA = await readJobRecord(stateRoot, jobIdA);
    assert.equal(recordA.status, "failed");
    assert.equal(recordA.startedAt, null);
    assert.equal(recordA.childPid, null);
    assert.equal(recordA.error?.code, "LAUNCH_SPEC_INVALID");

    // Part B: Cancel request with unknown field cannot deliver
    const jobIdB = "job-0000000000000004";
    const { ownerToken: ownerB, specDigest: specB } = await setupJobFixture({
      stateRoot,
      jobId: jobIdB,
      args: ["-e", "process.exit(0)"],
    });

    const rogueCancel = {
      schemaVersion: 1,
      kind: "command-job-cancel",
      jobId: jobIdB,
      ownerToken: ownerB,
      specDigest: specB,
      requestedAt: new Date().toISOString(),
      rogueUnknownField: "malicious-cancel",
    };
    await writeAtomicPrivateFile(
      cancelRequestPath(stateRoot, jobIdB),
      JSON.stringify(rogueCancel, null, 2),
      MAX_CANCEL_REQUEST_BYTES,
      stateRoot,
    );

    await runJobWorker({
      stateRoot,
      jobId: jobIdB,
      ownerToken: ownerB,
    });

    const recordB = await readJobRecord(stateRoot, jobIdB);
    assert.equal(recordB.status, "completed");
    assert.equal(recordB.exitCode, 0);
    assert.equal(recordB.cancelDelivered, null);
    assert.equal(recordB.cancelConfirmedAt, null);

    // Foreign/invalid cancel marker must remain untouched on disk
    assert.equal(existsSync(cancelRequestPath(stateRoot, jobIdB)), true);
  } finally {
    process.exitCode = savedExitCode;
    await cleanup();
  }
});

test("worker fixture 4: CAS owner drift before terminal write prevents overwrite", async () => {
  const savedExitCode = process.exitCode;
  const { stateRoot, cleanup } = await createWorkerTestState();
  try {
    const jobId = "job-0000000000000005";
    const { ownerToken, initialRecord } = await setupJobFixture({
      stateRoot,
      jobId,
      args: ["-e", "process.exit(0)"],
    });

    let driftedContent: string | null = null;

    const _testSeams: JobWorkerTestSeams = {
      onBeforeTerminalWrite: async ({ runningRecord }) => {
        assert.ok(runningRecord !== null);
        // Another actor drifts the ownerToken on disk before worker's terminal write
        const driftedRecord: CommandJobRecord = {
          ...runningRecord,
          ownerToken: "drifted-rogue-owner",
          stateRevision: runningRecord.stateRevision + 1,
        };
        driftedContent = `${JSON.stringify(driftedRecord, null, 2)}\n`;
        await writeAtomicPrivateFile(
          jobRecordPath(stateRoot, jobId),
          driftedContent,
          MAX_RECORD_BYTES,
          stateRoot,
        );
      },
    };

    await runJobWorker({
      stateRoot,
      jobId,
      ownerToken,
      _testSeams,
    });

    assert.equal(process.exitCode, 1);

    // Verify record on disk was NOT overwritten by the worker
    const onDiskRaw = await readFile(jobRecordPath(stateRoot, jobId), "utf8");
    assert.equal(onDiskRaw, driftedContent);

    const onDiskRecord = JSON.parse(onDiskRaw) as CommandJobRecord;
    assert.equal(onDiskRecord.ownerToken, "drifted-rogue-owner");
  } finally {
    process.exitCode = savedExitCode;
    await cleanup();
  }
});
