import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { approveTaskContract, loadTaskContract } from "../src/core/task-contract.js";
import {
  readCheckpoint,
  readJournalEvents,
  writeCheckpoint,
  type TaskCheckpoint,
} from "../src/core/task-journal.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const probeEnv = commandProbeEnvironment({ source: process.env });
const OUTPUT_BYTES = 256 * 1024;

function taskEnvironment(stateRoot: string): EnvironmentPolicy {
  return { ...probeEnv, literal: { ...probeEnv.literal, ALPHA_AOS_STATE_DIR: stateRoot } };
}

async function cli(fixture: TaskFixture, args: readonly string[]): Promise<ProcessResult> {
  return runProcess({
    executable: process.execPath,
    args: [cliEntry, "task", ...args],
    cwd: fixture.scratch,
    environment: taskEnvironment(fixture.stateRoot),
    maxOutputBytes: OUTPUT_BYTES,
    excerptBytes: OUTPUT_BYTES,
  });
}

async function contractFixture(context: Parameters<typeof createTaskFixture>[0]): Promise<{
  fixture: TaskFixture;
  digest: string;
  contractPath: string;
}> {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const loaded = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: loaded.digest,
    stateRoot: fixture.stateRoot,
  });
  return { fixture, digest: loaded.digest, contractPath: fixture.contractPath };
}

test("task answer updates checkpoint from needs-input to running and appends journal event (D-03)", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const initialCheckpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "needs-input",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: {
      cycles: 1,
      wallTimeMs: 100,
      tokens: null,
      costUsd: null,
    },
    stopReason: "Waiting for user confirmation on port",
    updatedAt: new Date().toISOString(),
  };

  await writeCheckpoint(fixture.stateRoot, initialCheckpoint);

  // Invoke `alpha-aos task answer "Use port 8080"`
  const result = await cli(fixture, ["answer", "Use port 8080"]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.excerpt.includes("Answer recorded for task"));

  // Check updated checkpoint
  const updatedCheckpoint = await readCheckpoint(fixture.stateRoot, digest);
  assert.notEqual(updatedCheckpoint, null);
  assert.equal(updatedCheckpoint?.status, "running");

  // Check journal event
  const events = await readJournalEvents(fixture.stateRoot, digest);
  const answerEvent = events.find((e) => e.kind === "prompt_answered");
  assert.notEqual(answerEvent, undefined);
  assert.equal((answerEvent?.payload as any)?.answer, "Use port 8080");
});

test("task answer on run with non-needs-input status is rejected with clear error (D-03)", async (context) => {
  const { fixture, digest } = await contractFixture(context);

  const stoppedCheckpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "stopped",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: {
      cycles: 1,
      wallTimeMs: 100,
      tokens: null,
      costUsd: null,
    },
    stopReason: "user_requested_stop",
    updatedAt: new Date().toISOString(),
  };

  await writeCheckpoint(fixture.stateRoot, stoppedCheckpoint);

  const result = await cli(fixture, ["answer", "test answer"]);
  assert.notEqual(result.exitCode, 0);
  const combined = result.stdout.excerpt + "\n" + result.stderr.excerpt;
  assert.ok(combined.includes("is not waiting for input (status: stopped)"));
});

test("task resume readiness inspection succeeds for existing contract (D-03)", async (context) => {
  const { fixture, digest, contractPath } = await contractFixture(context);

  const runningCheckpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: {
      cycles: 1,
      wallTimeMs: 100,
      tokens: null,
      costUsd: null,
    },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };

  await writeCheckpoint(fixture.stateRoot, runningCheckpoint);

  const result = await cli(fixture, ["resume", contractPath]);
  assert.equal(result.exitCode, 0);
  assert.ok(result.stdout.excerpt.includes("task resume"));
});
