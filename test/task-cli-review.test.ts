import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readdir, writeFile, mkdir } from "node:fs/promises";
import { commandProbeEnvironment, runProcess, type EnvironmentPolicy, type ProcessResult } from "../src/core/process.js";
import { approveTaskContract, loadTaskContract } from "../src/core/task-contract.js";
import { recordReviewSuggestions } from "../src/core/task-review-suggestions.js";
import { writeCheckpoint, type TaskCheckpoint } from "../src/core/task-journal.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";
import { gitCommand } from "./helpers/git-fixture.js";

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

async function listing(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.map((entry) => entry.replaceAll("\\", "/")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function setupContractFixture(context: Parameters<typeof createTaskFixture>[0]): Promise<{
  fixture: TaskFixture;
  digest: string;
  contractPath: string;
}> {
  const fixture = await createTaskFixture(context);
  // Ensure .planning/REQUIREMENTS.md exists in project root for final review
  const planningDir = join(fixture.projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(
    join(planningDir, "REQUIREMENTS.md"),
    "# Requirements\n\n- [ ] **REQ-01**: Inventory summary program must execute correctly\n- [ ] **REQ-02**: Output format matches JSON schema\n",
    "utf8",
  );
  gitCommand(fixture.projectRoot, ["add", "--all"]);
  gitCommand(fixture.projectRoot, ["commit", "-m", "docs: add requirements"]);

  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const loaded = await loadTaskContract(fixture.contractPath);
  return { fixture, digest: loaded.digest, contractPath: fixture.contractPath };
}

test("task final-review preview reports blocked status and writes nothing when unapproved (T-19-09)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  const before = await listing(fixture.stateRoot);

  const result = await cli(fixture, ["final-review", contractPath]);
  assert.equal(result.exitCode, 2, result.stderr.excerpt);
  const output = result.stdout.excerpt;
  assert.ok(output.includes("Final Review Readiness: NOT READY"));
  assert.ok(output.includes("Contract is not approved yet"));
  assert.ok(output.includes(`Contract digest: ${digest}`));

  // State root remains pristine (dry-run guarantee)
  assert.deepEqual(await listing(fixture.stateRoot), before);
});

test("task final-review preview shows readiness and final-review command after approval (D-16, T-19-09)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);

  await approveTaskContract({
    contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  const human = await cli(fixture, ["final-review", contractPath]);
  assert.equal(human.exitCode, 0, `${human.stderr.excerpt}\nSTDOUT:\n${human.stdout.excerpt}`);
  assert.ok(human.stdout.excerpt.includes("Final Review Readiness: READY"));
  assert.ok(human.stdout.excerpt.includes(`Contract digest: ${digest}`));
  assert.ok(human.stdout.excerpt.includes("Reviewer: claude"));
  assert.ok(human.stdout.excerpt.includes("Mandatory requirements: 2"));
  assert.ok(human.stdout.excerpt.includes(`--contract-digest ${digest} --apply`));

  // JSON mode parity
  const machine = await cli(fixture, ["final-review", contractPath, "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const envelope = JSON.parse(machine.stdout.excerpt) as {
    applied: boolean;
    readiness: {
      ready: boolean;
      contractDigest: string;
      requirementsCount: number;
      reviewerHarness: string;
    };
    command: string;
  };
  assert.equal(envelope.applied, false);
  assert.equal(envelope.readiness.ready, true);
  assert.equal(envelope.readiness.contractDigest, digest);
  assert.equal(envelope.readiness.requirementsCount, 2);
  assert.equal(envelope.readiness.reviewerHarness, "claude");
  assert.ok(envelope.command.includes(`--contract-digest ${digest} --apply`));
});

test("task status displays deferred suggestions notification without promoting to active work (D-08)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);

  await approveTaskContract({
    contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // Record a checkpoint so task status can inspect it
  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractId: "inventory-summary",
    revision: 1,
    contractDigest: digest,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: "abc1234567890",
    stopReason: null,
    usage: { cycles: 1, wallTimeMs: 1200, tokens: 0, costUsd: 0 },
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, checkpoint);

  // Record 2 deferred suggestions in external state
  const sugResult = await recordReviewSuggestions({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
    requestId: "req-01",
    targetRevisionSha: "abc1234567890",
    artifactDigest: "art-digest-1",
    suggestions: [
      { summary: "Consider renaming variable for clarity", reason: "Readability preference" },
      { summary: "Optional JSDoc annotations", reason: "Documentation recommendation" },
    ],
  });
  assert.equal(sugResult.recordedCount, 2);
  assert.equal(sugResult.totalPendingCount, 2);

  // Run task status (text output)
  const human = await cli(fixture, ["status", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  assert.ok(human.stdout.excerpt.includes("Pending deferred proposals: 2 held in external state file:"));
  assert.ok(human.stdout.excerpt.includes("suggestions.json"));

  // Run task status (--json output)
  const machine = await cli(fixture, ["status", "inventory-summary", "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const data = JSON.parse(machine.stdout.excerpt) as {
    pendingSuggestionsCount: number;
    suggestionsPath: string;
    checkpoint: { status: string };
  };
  assert.equal(data.pendingSuggestionsCount, 2);
  assert.ok(data.suggestionsPath.endsWith("suggestions.json"));
  assert.equal(data.checkpoint.status, "running");
});

test("task final-review --apply refuses missing or mismatched contract digest", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);

  await approveTaskContract({
    contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // 1. Missing --contract-digest
  const missingDigest = await cli(fixture, ["final-review", contractPath, "--apply"]);
  assert.notEqual(missingDigest.exitCode, 0);
  assert.ok(missingDigest.stderr.excerpt.includes("task final-review --apply requires the contract digest"));

  // 2. Mismatched --contract-digest
  const mismatchedDigest = await cli(fixture, [
    "final-review",
    contractPath,
    "--contract-digest",
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    "--apply",
  ]);
  assert.notEqual(mismatchedDigest.exitCode, 0);
  assert.ok(mismatchedDigest.stderr.excerpt.includes("Contract digest mismatch"));
});
