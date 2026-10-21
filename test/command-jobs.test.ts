import assert from "node:assert/strict";
import { mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  startCommandJob,
  getCommandJobStatus,
  waitCommandJob,
  cancelCommandJob,
  jobRecordPath,
  jobDirectory,
  cancelRequestPath,
  writeJobRecord,
  readJobRecord,
  MAX_RECORD_BYTES,
  type CommandJobRecord,
} from "../src/core/command-jobs.js";

async function createJobTestState(): Promise<{ stateRoot: string; cleanup: () => Promise<void> }> {
  const dir = join(tmpdir(), `test-cmd-jobs-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true });
  return {
    stateRoot: dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("command-jobs: start, wait, and status for successful command", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "console.log('alpha-aos job test output'); process.exit(0);"],
      deadlineMs: 30000,
    });

    assert.ok(startResult.jobId.startsWith("job-"));
    assert.ok(startResult.status === "running" || startResult.status === "completed");

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.exitCode, 0);
      assert.ok(waitResult.value.output?.stdout.includes("alpha-aos job test output"));
    }

    const finalStatus = await getCommandJobStatus(stateRoot, startResult.jobId);
    assert.equal(finalStatus.status, "completed");
    assert.equal(finalStatus.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("command-jobs: handles non-zero exit code as failed status", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "console.error('fatal error'); process.exit(42);"],
      deadlineMs: 30000,
    });

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
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

test("command-jobs: process deadline times out and aborts child", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60000);"],
      deadlineMs: 300, // Very short deadline
    });

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
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

test("command-jobs: cancellation stops child and confirms cancelled status", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60000);"],
      deadlineMs: 30000,
    });

    // Wait a tiny moment to ensure child process is alive
    await new Promise((r) => setTimeout(r, 100));

    const cancelResult = await cancelCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 5000,
    });

    assert.equal(cancelResult.cancelRequested, true);
    assert.equal(cancelResult.status, "cancelled");
  } finally {
    await cleanup();
  }
});

test("command-jobs: output truncation bounds retained output to 64 KiB", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    // Generate 100 KiB of output
    const script = "process.stdout.write('x'.repeat(100 * 1024)); process.exit(0);";
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", script],
      deadlineMs: 30000,
    });

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.output?.truncated, true);
      assert.ok((waitResult.value.output?.combined.length ?? 0) <= 65536);
      assert.ok((waitResult.value.output?.totalBytes ?? 0) >= 100 * 1024);
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs: injected opaque OPENAI_API_KEY + NODE_OPTIONS not inherited/not persisted", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  const secretValue = "sk-antigravity-secret-test-token-123456789";
  const nodeOptionsValue = "--max-old-space-size=4096";

  const prevSecret = process.env.OPENAI_API_KEY;
  const prevOptions = process.env.NODE_OPTIONS;

  process.env.OPENAI_API_KEY = secretValue;
  process.env.NODE_OPTIONS = nodeOptionsValue;

  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "console.log('ENV_CHECK:', process.env.OPENAI_API_KEY, process.env.NODE_OPTIONS); process.exit(0);"],
      deadlineMs: 30000,
    });

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.ok(waitResult.value.output?.stdout.includes("ENV_CHECK: undefined undefined"));
      assert.equal(waitResult.value.output?.stdout.includes(secretValue), false);
    }

    const recordFile = jobRecordPath(stateRoot, startResult.jobId);
    const content = await readFile(recordFile, "utf8");
    assert.equal(content.includes(secretValue), false);
  } finally {
    if (prevSecret !== undefined) process.env.OPENAI_API_KEY = prevSecret;
    else delete process.env.OPENAI_API_KEY;

    if (prevOptions !== undefined) process.env.NODE_OPTIONS = prevOptions;
    else delete process.env.NODE_OPTIONS;

    await cleanup();
  }
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
      /contains secret value from credential-named environment variable/
    );

    await assert.rejects(
      async () => {
        await startCommandJob({
          stateRoot,
          cwd: process.cwd(),
          executable: process.execPath,
          args: ["--password=supersecretpassword123"],
        });
      },
      /contains credential-shaped data/
    );
  } finally {
    delete process.env.MY_SECRET_KEY;
    await cleanup();
  }
});

test("command-jobs: fast zero exit handshake succeeds without timeout", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "process.exit(0);"],
      deadlineMs: 30000,
    });

    assert.ok(startResult.status === "running" || startResult.status === "completed");

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
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

test("command-jobs: huge NUL and unicode output remains readable and bounded under 512 KiB", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const script = "process.stdout.write(Buffer.alloc(100 * 1024, 0)); process.stdout.write('🎉'.repeat(5000)); process.exit(0);";
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", script],
      deadlineMs: 30000,
    });

    const waitResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 15000,
    });

    assert.equal(waitResult.status, "completed");
    if (waitResult.status === "completed") {
      assert.equal(waitResult.value.status, "completed");
      assert.equal(waitResult.value.output?.truncated, true);
    }

    const finalRecord = await getCommandJobStatus(stateRoot, startResult.jobId);
    assert.equal(finalRecord.status, "completed");

    const target = jobRecordPath(stateRoot, startResult.jobId);
    const stats = await stat(target);
    assert.ok(stats.size <= MAX_RECORD_BYTES, `Record file size ${stats.size} exceeds ${MAX_RECORD_BYTES}`);
  } finally {
    await cleanup();
  }
});

test("command-jobs: forged cancel request is ignored and ownership drift is refused", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => { process.exit(0); }, 1200);"],
      deadlineMs: 30000,
    });

    // Write forged cancel request with mismatched ownerToken
    const forgedCancelFile = cancelRequestPath(stateRoot, startResult.jobId);
    await writeFile(
      forgedCancelFile,
      JSON.stringify({
        schemaVersion: 1,
        kind: "command-job-cancel",
        jobId: startResult.jobId,
        ownerToken: "forged-token-00000000",
        specDigest: "0".repeat(64),
        requestedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // Give worker time to poll
    await new Promise((r) => setTimeout(r, 300));

    // The job should not be cancelled by forged request
    const status = await getCommandJobStatus(stateRoot, startResult.jobId);
    assert.notEqual(status.status, "cancelled");

    // Proper cancel with pinned identity
    const cancelResult = await cancelCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 5000,
    });
    assert.equal(cancelResult.status, "cancelled");
  } finally {
    await cleanup();
  }
});

test("command-jobs: getCommandJobStatus orphan diagnosis is strictly read-only", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const jobId = "job-orphancheck123";
    const dir = jobDirectory(stateRoot, jobId);
    await mkdir(dir, { recursive: true });

    const deadPid = 9999999;
    const testRecord: CommandJobRecord = {
      schemaVersion: 1,
      kind: "command-job",
      jobId,
      ownerToken: "test-owner-token",
      specDigest: "a".repeat(64),
      status: "running",
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cwd: process.cwd(),
      command: "node",
      deadlineMs: 30000,
      workerPid: deadPid,
      workerHost: hostname(),
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

    await writeJobRecord(stateRoot, testRecord);

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

test("command-jobs: duplicate worker execution is prevented by exclusive claim", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 2000);"],
      deadlineMs: 30000,
    });

    const record = await readJobRecord(stateRoot, startResult.jobId);
    const { runJobWorker } = await import("../src/core/command-job-worker.js");

    const prevExitCode = process.exitCode;
    try {
      await runJobWorker({
        stateRoot,
        jobId: startResult.jobId,
        ownerToken: record.ownerToken,
      });
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = prevExitCode;
    }

    await cancelCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 5000,
    });
  } finally {
    await cleanup();
  }
});

test("command-jobs: symlink in state root or job path is refused", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const symlinkDir = join(tmpdir(), `test-symlink-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    try {
      await symlink(stateRoot, symlinkDir, "junction");
    } catch {
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
        /Symlink or reparse point detected/
      );
    } finally {
      await rm(symlinkDir, { recursive: true, force: true }).catch(() => undefined);
    }
  } finally {
    await cleanup();
  }
});

test("command-jobs: observer timeout does not terminate the underlying running job", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 5000);"],
      deadlineMs: 30000,
    });

    const observerResult = await waitCommandJob({
      stateRoot,
      jobId: startResult.jobId,
      timeoutMs: 150,
    });

    assert.equal(observerResult.status, "timeout");

    // The job should still be alive / running!
    const status = await getCommandJobStatus(stateRoot, startResult.jobId);
    assert.equal(status.status, "running");

    await cancelCommandJob({ stateRoot, jobId: startResult.jobId, timeoutMs: 5000 });
  } finally {
    await cleanup();
  }
});

test("command-jobs: natural-close/cancel race preserves natural exit code", async () => {
  const { stateRoot, cleanup } = await createJobTestState();
  try {
    const startResult = await startCommandJob({
      stateRoot,
      cwd: process.cwd(),
      executable: process.execPath,
      args: ["-e", "setTimeout(() => { process.exit(0); }, 300);"],
      deadlineMs: 30000,
    });

    await new Promise((r) => setTimeout(r, 260));
    await cancelCommandJob({ stateRoot, jobId: startResult.jobId, timeoutMs: 3000 }).catch(() => undefined);

    const finalStatus = await getCommandJobStatus(stateRoot, startResult.jobId);
    assert.ok(finalStatus.status === "completed" || finalStatus.status === "cancelled");
    if (finalStatus.status === "completed") {
      assert.equal(finalStatus.exitCode, 0);
    }
  } finally {
    await cleanup();
  }
});
