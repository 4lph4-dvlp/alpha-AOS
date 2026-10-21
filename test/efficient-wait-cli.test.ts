import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cancelCommandJob, cancelRequestPath } from "../src/core/command-jobs.js";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { writeCheckpoint, type TaskCheckpoint } from "../src/core/task-journal.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });
const OUTPUT_BYTES = 256 * 1024;

function testEnv(stateRoot: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot } };
}

async function runCli(args: readonly string[], stateRoot: string, cwd = process.cwd()): Promise<ProcessResult> {
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, ...args],
    cwd,
    environment: testEnv(stateRoot),
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

async function createCliTestFixture(): Promise<{
  stateRoot: string;
  projectRoot: string;
  recordJob: (jobId: string) => void;
  cleanup: () => Promise<void>;
}> {
  const base = join(tmpdir(), `test-eff-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stateRoot = join(base, "state");
  const projectRoot = join(base, "project");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  const trackedJobs = new Set<string>();

  return {
    stateRoot,
    projectRoot,
    recordJob: (jobId: string) => trackedJobs.add(jobId),
    cleanup: async () => {
      for (const jobId of trackedJobs) {
        await cancelCommandJob({ stateRoot, jobId, timeoutMs: 1000 }).catch(() => undefined);
      }
      await rm(base, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

test("efficient-wait-cli: detached job start returns real handle before completion, separate wait process reconnects", async () => {
  const { stateRoot, projectRoot, recordJob, cleanup } = await createCliTestFixture();
  try {
    const markerFile = join(projectRoot, "child_started.marker");
    const barrierFile = join(projectRoot, "barrier_release.txt");

    // Deterministic child: creates marker on start, then waits for barrier file before exiting
    const script = `
      const fs = require("node:fs");
      const marker = process.argv[1];
      const barrier = process.argv[2];
      fs.writeFileSync(marker, "started", "utf8");
      const start = Date.now();
      while (!fs.existsSync(barrier) && Date.now() - start < 15000) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
      }
      console.log("CHILD_FINISHED_SIGNAL");
    `;

    // 1. Start detached job via CLI with explicit --apply
    const startRes = await runCli(
      [
        "job",
        "start",
        "--cwd",
        projectRoot,
        "--deadline-ms",
        "30000",
        "--apply",
        "--json",
        "--",
        process.execPath,
        "-e",
        script,
        markerFile,
        barrierFile,
      ],
      stateRoot,
      projectRoot,
    );

    assert.equal(startRes.code, "ok");
    assert.equal(startRes.exitCode, 0);
    const startPayload = JSON.parse(startRes.stdout.excerpt);
    assert.ok(startPayload.jobId.startsWith("job-"));
    assert.equal(startPayload.status, "running");

    const jobId = startPayload.jobId;
    recordJob(jobId);

    // Verify launcher returned BEFORE child finished
    // Wait for child to at least create its start marker
    const waitStart = Date.now();
    while (!existsSync(markerFile) && Date.now() - waitStart < 5000) {
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(existsSync(markerFile), "Child marker must exist while launcher has already exited");

    // 2. Separate CLI process waits for job completion
    const waitPromise = runCli(["job", "wait", jobId, "--timeout-ms", "15000", "--json"], stateRoot, projectRoot);

    // Release the barrier after a short delay so the child completes while waiter is active
    await new Promise((r) => setTimeout(r, 200));
    await writeFile(barrierFile, "release", "utf8");

    const waitRes = await waitPromise;
    assert.equal(waitRes.code, "ok");
    assert.equal(waitRes.exitCode, 0);
    const waitPayload = JSON.parse(waitRes.stdout.excerpt);
    assert.equal(waitPayload.jobId, jobId);
    assert.equal(waitPayload.status, "completed");
    assert.equal(waitPayload.exitCode, 0);
    assert.ok(waitPayload.output.stdout.includes("CHILD_FINISHED_SIGNAL"));

    // 3. Separate CLI process reads final status
    const statusRes = await runCli(["job", "status", jobId, "--json"], stateRoot, projectRoot);
    assert.equal(statusRes.code, "ok");
    assert.equal(statusRes.exitCode, 0);
    const statusPayload = JSON.parse(statusRes.stdout.excerpt);
    assert.equal(statusPayload.status, "completed");
    assert.equal(statusPayload.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: dry-run start and cancel create no side effects", async () => {
  const { stateRoot, projectRoot, recordJob, cleanup } = await createCliTestFixture();
  try {
    // 1. Dry-run start without --apply creates no files and spawns no process
    const startPreviewRes = await runCli(
      [
        "job",
        "start",
        "--cwd",
        projectRoot,
        "--deadline-ms",
        "20000",
        "--json",
        "--",
        process.execPath,
        "-e",
        "console.log('SHOULD_NOT_EXECUTE');",
      ],
      stateRoot,
      projectRoot,
    );
    assert.equal(startPreviewRes.exitCode, 0);
    const startPreview = JSON.parse(startPreviewRes.stdout.excerpt);
    assert.equal(startPreview.applied, false);
    assert.ok(startPreview.cwd === projectRoot || startPreview.cwd === "<project>");

    // Verify nothing written to stateRoot
    const jobsDir = join(stateRoot, "jobs");
    if (existsSync(jobsDir)) {
      const entries = await readdir(jobsDir);
      assert.equal(entries.length, 0, "No job records should exist after dry-run start");
    }

    // 2. Start a real job with --apply
    const startRes = await runCli(
      [
        "job",
        "start",
        "--cwd",
        projectRoot,
        "--deadline-ms",
        "60000",
        "--apply",
        "--json",
        "--",
        process.execPath,
        "-e",
        "setTimeout(() => {}, 60000);",
      ],
      stateRoot,
      projectRoot,
    );
    assert.equal(startRes.exitCode, 0);
    const startPayload = JSON.parse(startRes.stdout.excerpt);
    const jobId = startPayload.jobId;
    recordJob(jobId);

    // 3. Cancel preview without --apply creates no cancel.request and mutates nothing
    const cancelPreviewRes = await runCli(["job", "cancel", jobId, "--json"], stateRoot, projectRoot);
    assert.equal(cancelPreviewRes.exitCode, 0);
    const cancelPreview = JSON.parse(cancelPreviewRes.stdout.excerpt);
    assert.equal(cancelPreview.applied, false);
    assert.equal(cancelPreview.jobId, jobId);
    assert.equal(cancelPreview.requestIntent, "cancel");

    const cancelFile = cancelRequestPath(stateRoot, jobId);
    assert.equal(existsSync(cancelFile), false, "cancel.request must not exist after preview");

    // Status is still running
    const statusRes = await runCli(["job", "status", jobId, "--json"], stateRoot, projectRoot);
    const statusPayload = JSON.parse(statusRes.stdout.excerpt);
    assert.equal(statusPayload.status, "running");

    // 4. Cancel with explicit --apply and forwarded timeout
    const cancelRes = await runCli(
      ["job", "cancel", jobId, "--timeout-ms", "5000", "--apply", "--json"],
      stateRoot,
      projectRoot,
    );
    assert.equal(cancelRes.exitCode, 0);
    const cancelPayload = JSON.parse(cancelRes.stdout.excerpt);
    assert.equal(cancelPayload.status, "cancelled");
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: job start preserves argument array, child --help and --json without shell concatenation", async () => {
  const { stateRoot, projectRoot, recordJob, cleanup } = await createCliTestFixture();
  try {
    const script = "console.log(JSON.stringify(process.argv.slice(1)));";
    const argHelp = "--help";
    const argJson = "--json";
    const argWithSpaces = "hello world with spaces";
    const argWithQuotes = 'quoted "value" & metacharacter; < > $ |';

    const startRes = await runCli(
      [
        "job",
        "start",
        "--cwd",
        projectRoot,
        "--apply",
        "--json",
        "--",
        process.execPath,
        "-e",
        script,
        "--",
        argHelp,
        argJson,
        argWithSpaces,
        argWithQuotes,
      ],
      stateRoot,
      projectRoot,
    );

    assert.equal(startRes.exitCode, 0);
    const startPayload = JSON.parse(startRes.stdout.excerpt);
    const jobId = startPayload.jobId;
    recordJob(jobId);

    const waitRes = await runCli(["job", "wait", jobId, "--timeout-ms", "15000", "--json"], stateRoot, projectRoot);
    assert.equal(waitRes.exitCode, 0);
    const waitPayload = JSON.parse(waitRes.stdout.excerpt);
    assert.equal(waitPayload.status, "completed");

    const lines = waitPayload.output.stdout.trim().split("\n");
    const parsedArgs = JSON.parse(lines[lines.length - 1]);
    assert.equal(parsedArgs[0], argHelp);
    assert.equal(parsedArgs[1], argJson);
    assert.equal(parsedArgs[2], argWithSpaces);
    assert.equal(parsedArgs[3], argWithQuotes);
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: closed parser rejects unknown, duplicate, missing, numeric, and surplus flags", async () => {
  const { stateRoot, projectRoot, cleanup } = await createCliTestFixture();
  try {
    const dummyId = "job-1234567890abcdef";

    // 1. Unknown flag
    const resUnknown = await runCli(
      ["job", "start", "--foo", "--cwd", projectRoot, "--apply", "--", process.execPath, "-e", ""],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resUnknown.exitCode, 0);

    // 2. Duplicate flag
    const resDuplicate = await runCli(
      ["job", "wait", dummyId, "--timeout-ms", "5000", "--timeout-ms", "6000", "--json"],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resDuplicate.exitCode, 0);

    // 3. Missing value for flag (no silent defaults)
    const resMissingVal = await runCli(["job", "wait", dummyId, "--timeout-ms"], stateRoot, projectRoot);
    assert.notEqual(resMissingVal.exitCode, 0);

    const resMissingTaskRun = await runCli(
      ["task", "wait", "my-task", "--run", "--contract-digest", "a".repeat(64), "--revision", "1"],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resMissingTaskRun.exitCode, 0);

    // 4. Invalid decimal integer (negative / float / string)
    const resNegativeTimeout = await runCli(
      ["job", "wait", dummyId, "--timeout-ms", "-500", "--json"],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resNegativeTimeout.exitCode, 0);

    const resFloatTimeout = await runCli(
      ["job", "wait", dummyId, "--timeout-ms", "1.5", "--json"],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resFloatTimeout.exitCode, 0);

    const resNegativeRev = await runCli(
      [
        "task",
        "wait",
        "my-task",
        "--run",
        "sampletask0001-00000001",
        "--contract-digest",
        "a".repeat(64),
        "--revision",
        "-5",
        "--json",
      ],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resNegativeRev.exitCode, 0);

    // 5. Surplus operands
    const resSurplusJob = await runCli(["job", "status", dummyId, "extra-operand", "--json"], stateRoot, projectRoot);
    assert.notEqual(resSurplusJob.exitCode, 0);

    const resSurplusTask = await runCli(
      [
        "task",
        "wait",
        "my-task",
        "extra-operand",
        "--run",
        "sampletask0001-00000001",
        "--contract-digest",
        "a".repeat(64),
        "--revision",
        "1",
      ],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resSurplusTask.exitCode, 0);

    // 6. Forbid --apply on read-only wait/status
    const resWaitApply = await runCli(["job", "wait", dummyId, "--apply", "--json"], stateRoot, projectRoot);
    assert.notEqual(resWaitApply.exitCode, 0);

    const resStatusApply = await runCli(["job", "status", dummyId, "--apply", "--json"], stateRoot, projectRoot);
    assert.notEqual(resStatusApply.exitCode, 0);

    const resTaskWaitApply = await runCli(
      [
        "task",
        "wait",
        "my-task",
        "--run",
        "sampletask0001-00000001",
        "--contract-digest",
        "a".repeat(64),
        "--revision",
        "1",
        "--apply",
        "--json",
      ],
      stateRoot,
      projectRoot,
    );
    assert.notEqual(resTaskWaitApply.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: terminal failure preserves exit code and readable stderr", async () => {
  const { stateRoot, projectRoot, recordJob, cleanup } = await createCliTestFixture();
  try {
    const script = "process.stderr.write('CRITICAL_FAILURE_LOG'); process.exit(42);";
    const startRes = await runCli(
      [
        "job",
        "start",
        "--cwd",
        projectRoot,
        "--deadline-ms",
        "30000",
        "--apply",
        "--json",
        "--",
        process.execPath,
        "-e",
        script,
      ],
      stateRoot,
      projectRoot,
    );
    assert.equal(startRes.exitCode, 0);
    const jobId = JSON.parse(startRes.stdout.excerpt).jobId;
    recordJob(jobId);

    // Wait should exit non-zero because child failed with exit code 42
    const waitRes = await runCli(["job", "wait", jobId, "--timeout-ms", "15000", "--json"], stateRoot, projectRoot);
    assert.notEqual(waitRes.exitCode, 0);
    const waitPayload = JSON.parse(waitRes.stdout.excerpt);
    assert.equal(waitPayload.status, "failed");
    assert.equal(waitPayload.exitCode, 42);
    assert.ok(waitPayload.output.stderr.includes("CRITICAL_FAILURE_LOG"));
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: task wait resolves canonical terminal accepted run, and checkpoint-only forged task cannot succeed", async () => {
  const { stateRoot, cleanup } = await createCliTestFixture();
  try {
    const contractId = "sample-task";
    const runId = "sampletask0001-00000001";
    const digest = "d".repeat(64);
    const revision = 1;

    // 1. Create canonical run record
    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = {
      schemaVersion: 1,
      kind: "task-run",
      runId,
      contractId,
      revision,
      contractDigest: digest,
      status: "accepted",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      artifact: null,
      executor: null,
      reviewer: null,
      verdict: {
        overall: "accepted",
        refusal: null,
        rows: [],
        preconditions: [],
      },
      stopReason: null,
      nextAction: null,
      decisions: [],
      decisionLog: null,
      baseCommit: null,
      deadlineAt: null,
      gsd: null,
      effects: null,
    };
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Write checkpoint
    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "accepted",
      attemptIndex: 1,
      lastSequence: 1,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    // Valid canonical task wait succeeds with exit 0
    const waitRes = await runCli(
      [
        "task",
        "wait",
        contractId,
        "--run",
        runId,
        "--contract-digest",
        digest,
        "--revision",
        String(revision),
        "--timeout-ms",
        "5000",
        "--json",
      ],
      stateRoot,
    );

    assert.equal(waitRes.exitCode, 0);
    const waitPayload = JSON.parse(waitRes.stdout.excerpt);
    assert.equal(waitPayload.ok, true);
    assert.equal(waitPayload.taskStatus, "accepted");
    assert.equal(waitPayload.contractId, contractId);
    assert.equal(waitPayload.runId, runId);

    // 2. Forged checkpoint-only task (no run record on disk) cannot succeed
    const forgedContractId = "forged-task";
    const forgedRunId = "forgedrun0001-00000001";
    const forgedDigest = "e".repeat(64);
    const forgedCheckpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: forgedDigest,
      contractId: forgedContractId,
      revision: 1,
      status: "accepted",
      attemptIndex: 1,
      lastSequence: 1,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, forgedCheckpoint);

    const forgedRes = await runCli(
      [
        "task",
        "wait",
        forgedContractId,
        "--run",
        forgedRunId,
        "--contract-digest",
        forgedDigest,
        "--revision",
        "1",
        "--timeout-ms",
        "2000",
        "--json",
      ],
      stateRoot,
    );

    assert.notEqual(forgedRes.exitCode, 0, "Checkpoint-only forged task must not exit 0");
    const forgedPayload = JSON.parse(forgedRes.stdout.excerpt);
    assert.equal(forgedPayload.ok, false);
    assert.equal(forgedPayload.status, "refused");
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: job cancel dry-run preview does not mutate job state", async () => {
  const { stateRoot, cleanup, recordJob } = await createCliTestFixture();
  try {
    // Start real job with --apply
    const startRes = await runCli(
      [
        "job",
        "start",
        "--apply",
        "--json",
        "--cwd",
        process.cwd(),
        "--",
        process.execPath,
        "-e",
        "setTimeout(() => {}, 15000);",
      ],
      stateRoot,
    );
    assert.equal(startRes.exitCode, 0);
    const startPayload = JSON.parse(startRes.stdout.excerpt);
    const jobId = startPayload.jobId as string;
    assert.ok(jobId);
    recordJob(jobId);

    // Cancel WITHOUT --apply (dry-run preview)
    const dryCancelRes = await runCli(
      [
        "job",
        "cancel",
        jobId,
        "--json",
      ],
      stateRoot,
    );
    assert.equal(dryCancelRes.exitCode, 0);
    const dryPayload = JSON.parse(dryCancelRes.stdout.excerpt);
    assert.equal(dryPayload.applied, false);

    // Verify cancel.request does NOT exist
    const cancelRequestFile = join(stateRoot, "jobs", jobId, "cancel.request");
    assert.equal(existsSync(cancelRequestFile), false, "Dry run cancel must not write cancel.request");

    // Clean up: actually cancel with --apply
    const realCancelRes = await runCli(
      [
        "job",
        "cancel",
        jobId,
        "--apply",
        "--json",
      ],
      stateRoot,
    );
    assert.equal(realCancelRes.exitCode, 0);
  } finally {
    await cleanup();
  }
});

test("efficient-wait-cli: job wait on nonexistent job ID exits non-zero with diagnostic", async () => {
  const { stateRoot, cleanup } = await createCliTestFixture();
  try {
    const res = await runCli(
      [
        "job",
        "wait",
        "job-ffffffffffffffff",
        "--timeout-ms",
        "200",
        "--json",
      ],
      stateRoot,
    );
    assert.notEqual(res.exitCode, 0, "Wait on nonexistent job must exit non-zero");
    const payload = JSON.parse(res.stdout.excerpt);
    assert.equal(payload.jobId, "job-ffffffffffffffff");
    assert.ok(payload.status === "timeout" || payload.status === "unresolved" || payload.status === "refused");
    assert.ok(typeof payload.reason === "string" && payload.reason.length > 0);
  } finally {
    await cleanup();
  }
});

