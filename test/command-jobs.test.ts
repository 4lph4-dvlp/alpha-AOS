import { realpathSync as canonicalFixturePath } from "node:fs";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { realOwnedCancellation, realEnvironmentIsolation } from "./helpers/command-job-runtime.js";
import {
  startCommandJob,
  getCommandJobStatus,
  waitCommandJob,
  cancelCommandJob,
  jobRecordPath,
  jobDirectory,
  launchSpecPath,
  cancelRequestPath,
  createJobRecord,
  writeJobRecord,
  updateJobRecord,
  readJobRecord,
  readBoundedFile,
  budgetJobOutput,
  truncateToUtf8Bytes,
  assertNoCredentialsInArgs,
  assertStateRootNotInsideProject,
  findEnclosingProjectRoots,
  validatePrivateLaunchSpec,
  validateCancelRequest,
  validateJobRecord,
  computeSpecDigest,
  buildOrdinaryCommandEnvironment,
  MAX_RECORD_BYTES,
  MAX_COMBINED_OUTPUT_BYTES,
  MAX_LAUNCH_SPEC_BYTES,
  MAX_CANCEL_REQUEST_BYTES,
  type CommandJobRecord,
  type PrivateLaunchSpec,
  type CancelRequestPayload,
} from "../src/core/command-jobs.js";

async function createJobTestState(): Promise<{ stateRoot: string; cleanup: () => Promise<void> }> {
  const dir = join(canonicalFixturePath(tmpdir()), `test-cmd-jobs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return {
    stateRoot: dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

// Synthetic facts for storage transition tests only; these do not prove process execution.
function storageClaim() {
  const now = new Date().toISOString();
  return { startedAt: now, acknowledgedAt: now, workerPid: process.pid, workerHost: hostname(), childPid: process.pid + 1 };
}

async function settleStorageCancellation(stateRoot: string, initial: CommandJobRecord, revision: number): Promise<void> {
  let request: CancelRequestPayload | null = null;
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline && request === null) {
    try {
      request = validateCancelRequest(JSON.parse(await readFile(cancelRequestPath(stateRoot, initial.jobId), "utf8")), {
        jobId: initial.jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT" && !(error as Error).message.includes("CANCEL_")) throw error;
      await delay(10);
    }
  }
  assert.ok(request, "A valid owned request must actually be observed.");
  const now = new Date().toISOString();
  await updateJobRecord(stateRoot, {
    jobId: initial.jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: revision,
  }, {
    status: "cancelled", finishedAt: now, cancelRequested: true, cancelRequestedAt: request.requestedAt,
    cancelDelivered: true, cancelConfirmedAt: now, exitCode: 1, signal: null, durationMs: 0,
  });
}

function makeInitialRecord(jobId: string, ownerToken = "test-owner-token", command = "node"): CommandJobRecord {
  return {
    schemaVersion: 1,
    kind: "command-job",
    jobId,
    ownerToken,
    specDigest: "0".repeat(64),
    status: "pending",
    createdAt: new Date().toISOString(),
    startedAt: null,
    acknowledgedAt: null,
    finishedAt: null,
    stateRevision: 0,
    cwd: process.cwd(),
    command,
    deadlineMs: 30000,
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
}

test("command-jobs storage: completed receipt wait and status", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000010";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    // Transition to running
    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    // Transition to completed
    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 1 },
      {
        status: "completed",
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        exitCode: 0,
        output: {
          stdout: "alpha-aos job test output\n",
          stderr: "",
          combined: "alpha-aos job test output\n",
          truncated: false,
          totalBytes: 26,
        },
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.exitCode, 0);
      assert.ok(waitResult.value.output?.stdout.includes("alpha-aos job test output"));
    }

    const finalStatus = await getCommandJobStatus(stateRoot, jobId);
    assert.equal(finalStatus.status, "completed");
    assert.equal(finalStatus.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: nonzero failed receipt wait", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000011";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 1 },
      {
        status: "failed",
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        exitCode: 42,
        error: { code: "NON_ZERO_EXIT", message: "process exited with code 42" },
        output: {
          stdout: "",
          stderr: "fatal error\n",
          combined: "fatal error\n",
          truncated: false,
          totalBytes: 12,
        },
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "failed");
      assert.equal(waitResult.value.exitCode, 42);
      assert.equal(waitResult.value.error?.code, "NON_ZERO_EXIT");
      assert.ok(waitResult.value.output?.stderr.includes("fatal error"));
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: timed-out receipt preserves its disposition", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000012";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 1 },
      {
        status: "timed_out",
        durationMs: 0,
        exitCode: 1,
        finishedAt: new Date().toISOString(),
        error: { code: "DEADLINE_EXCEEDED", message: "Process exceeded deadline" },
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "timed_out");
      assert.equal(waitResult.value.error?.code, "DEADLINE_EXCEEDED");
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: requested delivered and confirmed cancellation receipt settles", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000013";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    // Cancel request marker
    const cancelPromise = cancelCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    // Simulate worker receiving and confirming cancellation
    const simulatedWorker = settleStorageCancellation(stateRoot, initial, 1);
    const [cancelResult] = await Promise.all([cancelPromise, simulatedWorker]);
    assert.equal(cancelResult.cancelRequested, true);
    assert.equal(cancelResult.status, "cancelled");
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: bounded output survives completed receipt round trip", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000014";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    const hugeOutput = "x".repeat(100 * 1024);
    const budgeted = budgetJobOutput(hugeOutput, "", false, 100 * 1024);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        ...storageClaim(),
        status: "completed",
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        exitCode: 0,
        output: budgeted,
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.output?.truncated, true);
      assert.ok(Buffer.byteLength(waitResult.value.output?.combined ?? "", "utf8") <= 65536);
      assert.ok((waitResult.value.output?.totalBytes ?? 0) >= 100 * 1024);
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs unit: ordinary environment policy excludes credential and runtime options", () => {
  const secretValue = "sk-antigravity-secret-test-token-123456789";
  const nodeOptionsValue = "--max-old-space-size=4096";

  const policy = buildOrdinaryCommandEnvironment({
    OPENAI_API_KEY: secretValue,
    NODE_OPTIONS: nodeOptionsValue,
    PATH: "C:\\Windows\\system32",
  });

  assert.equal(policy.optional?.includes("OPENAI_API_KEY"), false);
  assert.equal(policy.optional?.includes("NODE_OPTIONS"), false);
  assert.equal(policy.optional?.includes("PATH"), true);
});

test("command-jobs: rejects arguments containing secret values or credential patterns", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  const secretValue = "opaque-env-secret-token-12345678";
  process.env.MY_SECRET_KEY = secretValue;
  try {
    await assert.rejects(
      async () => {
        await startCommandJob({
          stateRoot,
          cwd: process.cwd(),
          executable: process.execPath,
          args: ["-e", `console.log('${secretValue}')`],
        });
      },
      (err: Error) => {
        assert.match(err.message, /contains secret value from credential-named environment variable/);
        assert.ok(!err.message.includes(secretValue), "Error message must not reveal secret value");
        assert.ok(!err.message.includes(secretValue.slice(0, 16)), "Error message must not reveal secret prefix");
        return true;
      },
    );

    const patternToken = "--password=supersecretpassword123";
    await assert.rejects(
      async () => {
        await startCommandJob({
          stateRoot,
          cwd: process.cwd(),
          executable: process.execPath,
          args: [patternToken],
        });
      },
      (err: Error) => {
        assert.match(err.message, /contains sensitive credential flag/);
        assert.ok(!err.message.includes("supersecretpassword123"), "Error message must not reveal credential value");
        assert.ok(!err.message.includes("supersecret"), "Error message must not reveal credential prefix");
        return true;
      },
    );
  } finally {
    delete process.env.MY_SECRET_KEY;
    await cleanup();
  }
});

test("command-jobs storage: already-terminal claimed receipt attaches immediately", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000015";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "completed",
        durationMs: 0,
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
        exitCode: 0,
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.exitCode, 0);
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: escaped Unicode receipt remains readable under byte ceiling", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000016";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    const nulOutput = "\0".repeat(50000);
    const unicodeOutput = "🎉".repeat(5000);
    const combined = `${nulOutput}${unicodeOutput}`;
    const budgeted = budgetJobOutput(combined, "", false, Buffer.byteLength(combined, "utf8"));

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        ...storageClaim(),
        status: "completed",
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        exitCode: 0,
        output: budgeted,
      },
    );

    const finalRecord = await getCommandJobStatus(stateRoot, jobId);
    assert.equal(finalRecord.status, "completed");

    const target = jobRecordPath(stateRoot, jobId);
    const stats = await stat(target);
    assert.ok(stats.size <= MAX_RECORD_BYTES, `Record file size ${stats.size} exceeds ${MAX_RECORD_BYTES}`);

    const readBack = await readJobRecord(stateRoot, jobId);
    assert.equal(readBack.status, "completed");
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: forged marker leaves status unchanged and simulated owned cancellation settles", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000017";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    // Write forged cancel request
    const forgedCancelFile = cancelRequestPath(stateRoot, jobId);
    await writeFile(
      forgedCancelFile,
      JSON.stringify({
        schemaVersion: 1,
        kind: "command-job-cancel",
        jobId,
        ownerToken: "forged-token-00000000",
        specDigest: "0".repeat(64),
        requestedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    const status = await getCommandJobStatus(stateRoot, jobId);
    assert.notEqual(status.status, "cancelled");

    // Proper cancel
    const cancelPromise = cancelCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });

    const simulatedWorker = settleStorageCancellation(stateRoot, initial, 1);
    const [cancelResult] = await Promise.all([cancelPromise, simulatedWorker]);
    assert.equal(cancelResult.status, "cancelled");
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: orphan diagnosis is strictly read-only", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000001";
    const deadPid = 9999999;
    const testRecord: CommandJobRecord = {
      schemaVersion: 1,
      kind: "command-job",
      jobId,
      ownerToken: "test-owner-token",
      specDigest: "a".repeat(64),
      status: "pending",
      createdAt: new Date().toISOString(),
      startedAt: null,
      acknowledgedAt: null,
      finishedAt: null,
      stateRevision: 0,
      cwd: process.cwd(),
      command: "node",
      deadlineMs: 30000,
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

    await createJobRecord(stateRoot, testRecord);

    await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken: "test-owner-token",
        specDigest: "a".repeat(64),
        stateRevision: 0,
      },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: deadPid,
        workerHost: hostname(),
        childPid: 9999998,
      },
    );

    const diagnosed = await getCommandJobStatus(stateRoot, jobId);
    assert.equal(diagnosed.status, "orphaned");
    assert.equal(diagnosed.error?.code, "WORKER_ORPHANED");

    // Re-read from disk: disk record must still be 'running' without mutation
    const onDisk = await readJobRecord(stateRoot, jobId);
    assert.equal(onDisk.status, "running");
  } finally {
    await cleanup();
  }
});

test("command-jobs: symlink in state root or job path is refused", async (t) => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const symlinkDir = join(canonicalFixturePath(tmpdir()), `test-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      await symlink(stateRoot, symlinkDir, "junction");
    } catch {
      t.skip("platform does not permit symlink/junction creation");
      return;
    }

    try {
      await assert.rejects(
        async () => {
          await startCommandJob({
            stateRoot: symlinkDir,
            cwd: process.cwd(),
            executable: process.execPath,
            args: ["-e", "process.exit(0);"],
          });
        },
        /JOB_PATH_UNPROVEN|Symlink or reparse point detected/,
      );
    } finally {
      await rm(symlinkDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: observer timeout leaves synthetic running receipt unchanged", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000018";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
      },
    );

    const observerResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 150,
    });

    assert.equal(observerResult.status, "timeout");

    const status = await getCommandJobStatus(stateRoot, jobId);
    assert.equal(status.status, "running");
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: cancel of completed receipt preserves stored exit code", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000019";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "completed",
        durationMs: 0,
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
        exitCode: 0,
      },
    );

    const cancelResult = await cancelCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 3000,
    });
    assert.equal(cancelResult.status, "completed");
    assert.equal(cancelResult.exitCode, 0);

    const finalStatus = await getCommandJobStatus(stateRoot, jobId);
    assert.equal(finalStatus.status, "completed");
    assert.equal(finalStatus.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: terminal receipt cancellation is a safe no-op", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000020";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        status: "completed",
        durationMs: 0,
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        workerPid: process.pid,
        workerHost: hostname(),
        childPid: process.pid + 1,
        exitCode: 0,
      },
    );

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 5000,
    });
    assert.equal(waitResult.status, "completed");

    const cancelResult = await cancelCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 3000,
    });

    assert.equal(cancelResult.status, "completed");
    assert.equal(cancelResult.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("command-jobs: cancel request with invalid jobId is refused before disk operations", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    await assert.rejects(
      cancelCommandJob({
        stateRoot,
        jobId: "../evil-traversal",
        timeoutMs: 1000,
      }),
      /job id/iu,
    );

    await assert.rejects(
      cancelCommandJob({
        stateRoot,
        jobId: "not-a-job-id",
        timeoutMs: 1000,
      }),
      /job id/iu,
    );
  } finally {
    await cleanup();
  }
});

test("command-jobs storage: serialized receipt byte budget prevents amplification", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000021";
    const initial = makeInitialRecord(jobId);
    await createJobRecord(stateRoot, initial);

    const amplified = '"\\"\\'.repeat(16384);
    const budgeted = budgetJobOutput(amplified, "", false, Buffer.byteLength(amplified, "utf8"));

    await updateJobRecord(
      stateRoot,
      { jobId, ownerToken: initial.ownerToken, specDigest: initial.specDigest, stateRevision: 0 },
      {
        ...storageClaim(),
        status: "completed",
        durationMs: 0,
        finishedAt: new Date().toISOString(),
        exitCode: 0,
        output: budgeted,
      },
    );

    const jobFile = join(stateRoot, "jobs", jobId, "job.json");
    const bytes = (await readFile(jobFile)).length;
    assert.ok(bytes < 512 * 1024, `job.json size ${bytes} must stay under 512 KiB ceiling`);

    const record = await readJobRecord(stateRoot, jobId);
    assert.equal(record.status, "completed");
  } finally {
    await cleanup();
  }
});

// ============================================================================
// CR-02 REGRESSIONS: Exclusive creation vs fenced CAS update
// ============================================================================

test("command-jobs CR-02: exclusive initial creation refuses overwriting existing record", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000002";
    const initialRecord = makeInitialRecord(jobId, "owner-token-initial");
    await createJobRecord(stateRoot, initialRecord);

    await assert.rejects(
      async () => {
        await createJobRecord(stateRoot, initialRecord);
      },
      /already exists/,
    );

    await assert.rejects(
      async () => {
        await writeJobRecord(stateRoot, initialRecord);
      },
      /UNCONDITIONAL_OVERWRITE_REFUSED/,
    );
  } finally {
    await cleanup();
  }
});

test("command-jobs CR-02: updateJobRecord enforces CAS fencing and revision increment", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000003";
    const initialRecord = makeInitialRecord(jobId, "owner-token-cas");
    await createJobRecord(stateRoot, initialRecord);

    const updated = await updateJobRecord(
      stateRoot,
      {
        jobId,
        ownerToken: "owner-token-cas",
        specDigest: initialRecord.specDigest,
        stateRevision: 0,
      },
      {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: 1234,
        workerHost: hostname(),
        childPid: 1235,
      },
    );
    assert.equal(updated.stateRevision, 1);
    assert.equal(updated.status, "running");

    const targetFile = jobRecordPath(stateRoot, jobId);
    const bytesBefore = await readFile(targetFile);

    await assert.rejects(
      async () => {
        await updateJobRecord(
          stateRoot,
          {
            jobId,
            ownerToken: "owner-token-cas",
            specDigest: initialRecord.specDigest,
            stateRevision: 0, // STALE!
          },
          {
            status: "failed",
            finishedAt: new Date().toISOString(),
          },
        );
      },
      /STALE_REVISION/,
    );

    const bytesAfter = await readFile(targetFile);
    assert.deepEqual(bytesBefore, bytesAfter, "Stale update must leave disk bytes unchanged");
  } finally {
    await cleanup();
  }
});

test("command-jobs CR-02: competing writer barrier allows exactly one winner", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000004";
    const initialRecord = makeInitialRecord(jobId, "owner-token-compete");
    await createJobRecord(stateRoot, initialRecord);

    const fence = {
      jobId,
      ownerToken: "owner-token-compete",
      specDigest: initialRecord.specDigest,
      stateRevision: 0,
    };

    const results = await Promise.allSettled([
      updateJobRecord(stateRoot, fence, {
        status: "running",
        startedAt: new Date().toISOString(),
        acknowledgedAt: new Date().toISOString(),
        workerPid: 2001,
        workerHost: hostname(),
        childPid: 2002,
      }),
      updateJobRecord(stateRoot, fence, {
        status: "failed",
        durationMs: 0,
        error: { code: "SYNTHETIC_FAILURE", message: "Storage-only startup failure." },
        finishedAt: new Date().toISOString(),
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    assert.equal(fulfilled.length, 1, "Exactly one competing writer must succeed");
    assert.equal(rejected.length, 1, "Competing writer with stale revision must be rejected");

    const disk = await readJobRecord(stateRoot, jobId);
    assert.equal(disk.stateRevision, 1);
  } finally {
    await cleanup();
  }
});

test("command-jobs CR-02: updateJobRecord refuses mutation of immutable metadata", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000005";
    const initialRecord = makeInitialRecord(jobId, "owner-token-meta");
    await createJobRecord(stateRoot, initialRecord);

    const fence = {
      jobId,
      ownerToken: "owner-token-meta",
      specDigest: initialRecord.specDigest,
      stateRevision: 0,
    };

    await assert.rejects(
      async () => {
        await updateJobRecord(stateRoot, fence, {
          ownerToken: "evil-drifted-owner",
        });
      },
      /MUTATE_IMMUTABLE_METADATA/,
    );

    await assert.rejects(
      async () => {
        await updateJobRecord(stateRoot, fence, {
          deadlineMs: 999999,
        });
      },
      /MUTATE_IMMUTABLE_METADATA/,
    );

    await assert.rejects(
      async () => {
        await updateJobRecord(stateRoot, fence, {
          cwd: "/other/cwd",
        });
      },
      /MUTATE_IMMUTABLE_METADATA/,
    );

    const disk = await readJobRecord(stateRoot, jobId);
    assert.equal(disk.stateRevision, 0);
    assert.equal(disk.ownerToken, "owner-token-meta");
  } finally {
    await cleanup();
  }
});

// ============================================================================
// CR-03 & WR-01: True ownership drift & identity pinning
// ============================================================================

test("command-jobs CR-03 & WR-01: true ownership and spec drift is refused with unchanged disk bytes", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000006";
    const initialRecord = makeInitialRecord(jobId, "owner-true-drift");
    await createJobRecord(stateRoot, initialRecord);

    await assert.rejects(
      async () => {
        await updateJobRecord(
          stateRoot,
          {
            jobId,
            ownerToken: "wrong-owner-token",
            specDigest: initialRecord.specDigest,
            stateRevision: 0,
          },
          { status: "failed", finishedAt: new Date().toISOString() },
        );
      },
      /STALE_OWNER/,
    );

    const observation = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 500,
      expectedIdentity: {
        jobId,
        ownerToken: "other-owner-token",
        specDigest: initialRecord.specDigest,
      },
    });

    assert.equal(observation.status, "unresolved");
    if (observation.status === "unresolved") {
      assert.equal(observation.code, "OWNERSHIP_DRIFT");
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs CR-03: waitCommandJob detects revision rollback as unresolved", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000007";
    const initialRecord: CommandJobRecord = {
      schemaVersion: 1,
      kind: "command-job",
      jobId,
      ownerToken: "owner-rollback",
      specDigest: "0".repeat(64),
      status: "running",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      acknowledgedAt: new Date().toISOString(),
      finishedAt: null,
      stateRevision: 1,
      cwd: process.cwd(),
      command: "node",
      deadlineMs: 10000,
      workerPid: 3001,
      workerHost: hostname(),
      childPid: 3002,
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

    const target = jobRecordPath(stateRoot, jobId);
    const dir = jobDirectory(stateRoot, jobId);
    await mkdir(dir, { recursive: true });
    await writeFile(target, `${JSON.stringify(initialRecord, null, 2)}\n`, "utf8");

    const res = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 500,
      expectedIdentity: {
        jobId,
        ownerToken: "owner-rollback",
        specDigest: "0".repeat(64),
        minRevision: 2,
      },
    });

    assert.equal(res.status, "unresolved");
    if (res.status === "unresolved") {
      assert.equal(res.code, "REVISION_ROLLBACK");
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs CR-03: remote worker is reported as unresolved rather than PID liveness check", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-0000000000000008";
    const record: CommandJobRecord = {
      schemaVersion: 1,
      kind: "command-job",
      jobId,
      ownerToken: "owner-remote",
      specDigest: "1".repeat(64),
      status: "running",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      acknowledgedAt: new Date().toISOString(),
      finishedAt: null,
      stateRevision: 1,
      cwd: process.cwd(),
      command: "node",
      deadlineMs: 10000,
      workerPid: 4001,
      workerHost: "other-remote-host-42",
      childPid: 4002,
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

    const target = jobRecordPath(stateRoot, jobId);
    const dir = jobDirectory(stateRoot, jobId);
    await mkdir(dir, { recursive: true });
    await writeFile(target, `${JSON.stringify(record, null, 2)}\n`, "utf8");

    const res = await waitCommandJob({
      stateRoot,
      jobId,
      timeoutMs: 500,
    });

    assert.equal(res.status, "unresolved");
    if (res.status === "unresolved") {
      assert.equal(res.code, "REMOTE_WORKER_UNRESOLVABLE");
    }
  } finally {
    await cleanup();
  }
});

// ============================================================================
// CR-04: Path proofs & canonical real project root
// ============================================================================

test("command-jobs: a physical home alias is not mistaken for an enclosing project", async (context) => {
  const { stateRoot: base, cleanup } = await createJobTestState();
  const home = join(base, "physical-home");
  const alias = join(base, "home-alias");
  const cwd = join(home, "temp", "project");
  await mkdir(join(home, ".alpha-aos"), { recursive: true });
  await mkdir(cwd, { recursive: true });
  try {
    try { await symlink(home, alias, process.platform === "win32" ? "junction" : "dir"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EPERM") throw error;
      context.skip("Home alias creation requires filesystem support");
      return;
    }
    const oldProfile = process.env.USERPROFILE;
    const oldHome = process.env.HOME;
    try {
      process.env.USERPROFILE = alias;
      process.env.HOME = alias;
      assert.equal(findEnclosingProjectRoots(cwd).includes(home), false);
      await mkdir(join(cwd, ".alpha-aos"));
      assert.ok(findEnclosingProjectRoots(cwd).includes(cwd), "Real project markers remain authoritative");
    } finally {
      if (oldProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = oldProfile;
      if (oldHome === undefined) delete process.env.HOME; else process.env.HOME = oldHome;
    }
  } finally { await cleanup(); }
});

test("command-jobs CR-04: assertStateRootNotInsideProject rejects nested cwd with project-local state", async () => {
  assert.throws(
    () => {
      assertStateRootNotInsideProject(join(canonicalFixturePath(tmpdir()), "review-project", ".alpha-aos"), join(canonicalFixturePath(tmpdir()), "review-project", "packages", "one"));
    },
    /External state root must not be inside/,
  );

  if (process.platform === "win32") assert.throws(
    () => {
      assertStateRootNotInsideProject("c:/review-project/.alpha-aos", "C:/REVIEW-PROJECT/packages/one");
    },
    /External state root must not be inside/,
  );

  assert.doesNotThrow(() => {
    assertStateRootNotInsideProject(join(canonicalFixturePath(tmpdir()), "external-state"), join(canonicalFixturePath(tmpdir()), "review-project", "packages", "one"));
  });
});

test("command-jobs CR-04: readBoundedFile enforces strict EOF ceiling and fatal UTF-8", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const testFile = join(stateRoot, "test.txt");

    await writeFile(testFile, Buffer.from([0xff, 0xff]));
    await assert.rejects(
      async () => {
        await readBoundedFile(testFile, stateRoot, 1024);
      },
      (err: Error) => {
        return err instanceof TypeError || err.message.includes("utf-8") || err.message.includes("invalid");
      },
    );

    await writeFile(testFile, Buffer.alloc(100, 0x41));
    await assert.rejects(
      async () => {
        await readBoundedFile(testFile, stateRoot, 50);
      },
      /exceeds byte limit/,
    );
  } finally {
    await cleanup();
  }
});

// ============================================================================
// CR-05: Credential array validation (split flags, equals, URLs)
// ============================================================================

test("command-jobs CR-05: assertNoCredentialsInArgs rejects split flags, equals flags, and credential URLs", () => {
  assert.throws(
    () => {
      assertNoCredentialsInArgs("node", ["--password", "supersecret123"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=sensitive_flag_split/);
      assert.ok(!err.message.includes("supersecret123"));
      return true;
    },
  );

  assert.throws(
    () => {
      assertNoCredentialsInArgs("node", ["--token", "mytoken456"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=sensitive_flag_split/);
      assert.ok(!err.message.includes("mytoken456"));
      return true;
    },
  );

  assert.throws(
    () => {
      assertNoCredentialsInArgs("node", ["--api-key", "mykey789"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=sensitive_flag_split/);
      assert.ok(!err.message.includes("mykey789"));
      return true;
    },
  );

  assert.throws(
    () => {
      assertNoCredentialsInArgs("node", ["--api_key=mykey789"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=sensitive_flag_equals/);
      assert.ok(!err.message.includes("mykey789"));
      return true;
    },
  );

  assert.throws(
    () => {
      assertNoCredentialsInArgs("curl", ["https://review-user:review-password@example.test"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=url_userinfo/);
      assert.ok(!err.message.includes("review-password"));
      return true;
    },
  );

  assert.throws(
    () => {
      assertNoCredentialsInArgs("curl", ["https://example.test/api?token=secret12345"]);
    },
    (err: Error) => {
      assert.match(err.message, /reason=url_credential_query/);
      assert.ok(!err.message.includes("secret12345"));
      return true;
    },
  );

  assert.doesNotThrow(() => {
    assertNoCredentialsInArgs("node", [
      "-e",
      "console.log('hello world');",
      "--url",
      "https://example.com/api/v1",
      "--timeout",
      "5000",
    ]);
  });
});

// ============================================================================
// CR-06: Combined output budgeting
// ============================================================================

test("command-jobs CR-06: budgetJobOutput enforces combined 64 KiB UTF-8 byte bound on adversarial multibyte streams", () => {
  const threeByteChar = "한";
  const str = threeByteChar.repeat(30000);

  const budgeted = budgetJobOutput(str, str, false, 180000);

  const outBytes = Buffer.byteLength(budgeted.stdout, "utf8");
  const errBytes = Buffer.byteLength(budgeted.stderr, "utf8");
  const combBytes = Buffer.byteLength(budgeted.combined, "utf8");

  assert.ok(outBytes + errBytes <= MAX_COMBINED_OUTPUT_BYTES, `Total ${outBytes + errBytes} must be <= 65536`);
  assert.ok(combBytes <= MAX_COMBINED_OUTPUT_BYTES, `Combined ${combBytes} must be <= 65536`);
  assert.equal(budgeted.truncated, true);

  assert.ok(!budgeted.stdout.includes("\ufffd"), "No broken multibyte sequences in stdout");
  assert.ok(!budgeted.stderr.includes("\ufffd"), "No broken multibyte sequences in stderr");
});

test("command-jobs CR-06: truncateToUtf8Bytes safely respects surrogate pairs", () => {
  const emoji = "🎉";
  const repeated = emoji.repeat(10);

  const res = truncateToUtf8Bytes(repeated, 7);
  assert.ok(Buffer.byteLength(res.text, "utf8") <= 7);
  assert.equal(res.truncated, true);
  for (let i = 0; i < res.text.length; i++) {
    const code = res.text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      assert.ok(i + 1 < res.text.length, "High surrogate must be followed by low surrogate");
    }
  }
});

// ============================================================================
// CR-07: Shared closed launch and cancel validators
// ============================================================================

test("command-jobs CR-07: validatePrivateLaunchSpec enforces closed schema and exact bounds", () => {
  const validSpec: PrivateLaunchSpec = {
    schemaVersion: 1,
    kind: "command-job-launch",
    jobId: "job-0123456789abcdef",
    ownerToken: "token-12345",
    executable: resolve(process.execPath),
    args: ["-e", "process.exit(0);"],
    cwd: resolve(process.cwd()),
    deadlineMs: 60000,
    createdAt: new Date().toISOString(),
  };

  const validated = validatePrivateLaunchSpec(validSpec);
  assert.equal(validated.jobId, validSpec.jobId);

  assert.throws(
    () => {
      validatePrivateLaunchSpec({ ...validSpec, extraField: "forbidden" });
    },
    /LAUNCH_SPEC_UNKNOWN_FIELD/,
  );

  assert.throws(
    () => {
      validatePrivateLaunchSpec({ ...validSpec, args: ["hello\0world"] });
    },
    /FORBIDDEN_NUL_CHAR/,
  );

  assert.throws(
    () => {
      validatePrivateLaunchSpec({ ...validSpec, executable: "./relative/node" });
    },
    /NON_NORMALIZED_EXECUTABLE/,
  );

  assert.throws(
    () => {
      validatePrivateLaunchSpec({ ...validSpec, deadlineMs: 0 });
    },
    /INVALID_DEADLINE/,
  );
  assert.throws(
    () => {
      validatePrivateLaunchSpec({ ...validSpec, deadlineMs: 25 * 3600 * 1000 });
    },
    /INVALID_DEADLINE/,
  );

  const digest = computeSpecDigest({
    executable: validSpec.executable,
    args: validSpec.args,
    cwd: validSpec.cwd,
    deadlineMs: validSpec.deadlineMs,
  });

  const matchingRecord = {
    jobId: validSpec.jobId,
    ownerToken: validSpec.ownerToken,
    specDigest: digest,
    cwd: validSpec.cwd,
    deadlineMs: validSpec.deadlineMs,
    createdAt: validSpec.createdAt,
    status: "pending",
  };

  assert.doesNotThrow(() => {
    validatePrivateLaunchSpec(validSpec, matchingRecord);
  });

  assert.throws(
    () => {
      validatePrivateLaunchSpec(validSpec, { ...matchingRecord, specDigest: "0".repeat(64) });
    },
    /SPEC_DIGEST_MISMATCH/,
  );
});

test("command-jobs CR-07: validateCancelRequest enforces closed schema and bounds", () => {
  const validCancel: CancelRequestPayload = {
    schemaVersion: 1,
    kind: "command-job-cancel",
    jobId: "job-0123456789abcdef",
    ownerToken: "token-12345",
    specDigest: "a".repeat(64),
    requestedAt: new Date().toISOString(),
  };

  const validated = validateCancelRequest(validCancel);
  assert.equal(validated.jobId, validCancel.jobId);

  assert.throws(
    () => {
      validateCancelRequest({ ...validCancel, rogueField: true });
    },
    /CANCEL_REQUEST_UNKNOWN_FIELD/,
  );

  assert.doesNotThrow(() => {
    validateCancelRequest(validCancel, {
      jobId: validCancel.jobId,
      ownerToken: validCancel.ownerToken,
      specDigest: validCancel.specDigest,
    });
  });

  assert.throws(
    () => {
      validateCancelRequest(validCancel, {
        jobId: validCancel.jobId,
        ownerToken: "different-owner",
        specDigest: validCancel.specDigest,
      });
    },
    /CANCEL_OWNER_TOKEN_MISMATCH/,
  );
});

// Required safety names intentionally retain real execution bodies.
test("command-jobs: cancellation stops child and confirms cancelled status", async (context) => {
  await realOwnedCancellation(context);
});
test("command-jobs: injected opaque OPENAI_API_KEY + NODE_OPTIONS not inherited/not persisted", async (context) => {
  await realEnvironmentIsolation(context);
});

test("command-jobs domain: successful terminal receipts require every concrete claim and duration fact", () => {
  for (const status of ["running", "completed", "cancelled", "timed_out"] as const) {
    const now = new Date().toISOString();
    const valid = {
      ...makeInitialRecord("job-00000000000000d1"), ...storageClaim(), status, stateRevision: 1,
      createdAt: now, startedAt: now, acknowledgedAt: now,
      finishedAt: status === "running" ? null : now, durationMs: status === "running" ? null : 0,
      exitCode: status === "completed" ? 0 : status === "cancelled" ? 1 : null,
      cancelRequested: status === "cancelled", cancelRequestedAt: status === "cancelled" ? now : null,
      cancelDelivered: status === "cancelled" ? true : null, cancelConfirmedAt: status === "cancelled" ? now : null,
    };
    assert.doesNotThrow(() => validateJobRecord(valid));
    for (const key of ["startedAt", "acknowledgedAt", "workerPid", "workerHost", "childPid"] as const) {
      assert.throws(() => validateJobRecord({ ...valid, [key]: null }), /INVALID_CLAIM|INCOHERENT_TIMESTAMPS/, status + ":" + key);
    }
    if (status !== "running") assert.throws(() => validateJobRecord({ ...valid, durationMs: null }), /INVALID_DURATION/);
  }
});

test("command-jobs domain: malformed dates PIDs duration and completed exit facts are refused", () => {
  const now = new Date().toISOString();
  const valid = {
    ...makeInitialRecord("job-00000000000000d2"), ...storageClaim(), status: "completed", stateRevision: 1,
    createdAt: now, startedAt: now, acknowledgedAt: now,
    finishedAt: now, durationMs: 0, exitCode: 0,
  };
  for (const patch of [
    { startedAt: "not-a-date" }, { acknowledgedAt: "2026-10-22" }, { workerPid: Number.MAX_SAFE_INTEGER + 1 },
    { childPid: 0 }, { workerHost: " " }, { durationMs: -1 }, { durationMs: NaN },
    { durationMs: Infinity }, { exitCode: 1 }, { signal: "SIGTERM" },
    { error: { code: "CONTRADICTION", message: "A successful receipt cannot contain an error." } },
  ]) assert.throws(() => validateJobRecord({ ...valid, ...patch }));
});

test("command-jobs domain: cancellation milestones are coherent and early failures need no fabricated claim", () => {
  const now = new Date().toISOString();
  const cancelled = {
    ...makeInitialRecord("job-00000000000000d3"), ...storageClaim(), status: "cancelled", stateRevision: 1,
    createdAt: now, startedAt: now, acknowledgedAt: now,
    finishedAt: now, durationMs: 0, exitCode: 1, cancelRequested: true, cancelRequestedAt: now,
    cancelDelivered: true, cancelConfirmedAt: now,
  };
  assert.doesNotThrow(() => validateJobRecord(cancelled));
  for (const patch of [
    { cancelRequested: false }, { cancelRequestedAt: null }, { cancelDelivered: null },
    { cancelConfirmedAt: null }, { exitCode: null }, { cancelConfirmedAt: "2000-01-01T00:00:00.000Z" },
  ]) assert.throws(() => validateJobRecord({ ...cancelled, ...patch }), /CANCEL/);
  for (const status of ["failed", "orphaned"] as const) {
    assert.doesNotThrow(() => validateJobRecord({
      ...makeInitialRecord("job-00000000000000d4"), status, stateRevision: 1, createdAt: now, finishedAt: now,
      childPid: status === "orphaned" ? process.pid : null,
      error: { code: "EARLY_FAILURE", message: "No acknowledgement was published." },
    }));
  }
  assert.doesNotThrow(() => validateJobRecord({
    ...cancelled, status: "completed", exitCode: 0, cancelDelivered: null, cancelConfirmedAt: null,
  }));
});
