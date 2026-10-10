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
  referenceControllerPort,
  staticReviewerPort,
  passingReview,
  fixturePorts,
  startFixtureTask,
} from "./helpers/task-fixture.js";
import { gitCommand } from "./helpers/git-fixture.js";
import type { TaskRunRecord } from "../src/core/task-run.js";
import type { GeneralTaskReportData } from "../src/core/task-connector.js";

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

// ---------------------------------------------------------------------------
// Plan 21-06: Unresolved criteria first, stale artifact & provenance verification (D-11, D-15, UX-03)
// ---------------------------------------------------------------------------

test("task report prioritizes unresolved mandatory criteria and next actions before passed criteria (D-15)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  await approveTaskContract({ contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  // Use off-by-one controller so valid-summary fails, while invalid-quantity passes
  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("off-by-one"),
      reviewer: staticReviewerPort(passingReview),
    }),
    expectedDigest: digest,
  });

  const human = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const out = human.stdout.excerpt;

  // Header has Run and Started at (D-11)
  assert.ok(out.includes(`Run: ${run.runId}`));
  assert.ok(out.includes(`Started at: ${run.startedAt}`));

  // Unresolved section is printed before passed section (D-15)
  const unresolvedIndex = out.indexOf("Unresolved Mandatory Criteria:");
  const unresolvedActionIndex = out.indexOf("Unresolved Criteria Next Actions:");
  const passedIndex = out.indexOf("Passed Mandatory Criteria (Verified):");

  assert.ok(unresolvedIndex !== -1, "must have unresolved criteria header");
  assert.ok(unresolvedActionIndex !== -1, "must have unresolved criteria next actions header");
  assert.ok(passedIndex !== -1, "must have passed criteria header");

  assert.ok(unresolvedIndex < passedIndex, "unresolved criteria must precede passed criteria");
  assert.ok(unresolvedActionIndex < passedIndex, "unresolved next actions must precede passed criteria");

  // Both criteria are present and accounted for
  assert.ok(out.includes("valid-summary"));
  assert.ok(out.includes("invalid-quantity"));
});

test("task report judges criterion as unknown when reviewer artifact digest is stale (D-15, T-21-12)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  await approveTaskContract({ contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  // Reviewer responds with stale artifact digest
  const staleArtifactReview = (request: any) => {
    const report = passingReview(request);
    return {
      ...report,
      artifactDigest: "deadbeef0000111122223333444455556666777788889999aaaabbbbccccdddd",
    };
  };

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(staleArtifactReview),
    }),
    expectedDigest: digest,
  });

  const human = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const out = human.stdout.excerpt;

  // Stale artifact review causes criterion to be judged unknown
  assert.ok(out.includes("Unresolved Mandatory Criteria:"));
  assert.ok(out.includes("the report is bound to a different artifact digest"));
  assert.ok(!out.includes("Status: ACCEPTED"));

  // JSON mode verification
  const machine = await cli(fixture, ["report", "inventory-summary", "--json"]);
  assert.equal(machine.exitCode, 0, machine.stderr.excerpt);
  const payload = JSON.parse(machine.stdout.excerpt) as TaskRunRecord;
  assert.notEqual(payload.status, "accepted");
  const validSummaryRow = payload.verdict?.rows.find((r) => r.criterionId === "valid-summary");
  assert.equal(validSummaryRow?.verdict, "unknown");
});

test("task report judges criterion as unknown when mandatory review is missing (D-15, UX-03)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  await approveTaskContract({ contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  // Reviewer returns empty criteria array (missing review for all criteria)
  const emptyReview = (request: any) => {
    const report = passingReview(request);
    return {
      ...report,
      criteria: [],
    };
  };

  await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(emptyReview),
    }),
    expectedDigest: digest,
  });

  const human = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const out = human.stdout.excerpt;

  assert.ok(out.includes("Unresolved Mandatory Criteria:"));
  assert.ok(
    out.includes("the review has no verdict for this criterion") ||
    out.includes("the report is missing a verdict for contract criterion") ||
    out.includes("the review is malformed") ||
    out.includes("Mandatory review evidence is missing"),
  );
  assert.ok(!out.includes("Status: ACCEPTED"));
});

test("task report human and JSON reflect identical criteria sets and verdicts (D-11, D-15, UX-03)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  await approveTaskContract({ contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    expectedDigest: digest,
  });

  const human = await cli(fixture, ["report", "inventory-summary"]);
  const machine = await cli(fixture, ["report", "inventory-summary", "--json"]);

  assert.equal(human.exitCode, 0);
  assert.equal(machine.exitCode, 0);

  const payload = JSON.parse(machine.stdout.excerpt) as TaskRunRecord;
  assert.equal(payload.runId, run.runId);
  assert.equal(payload.startedAt, run.startedAt);

  assert.ok(human.stdout.excerpt.includes(`Run: ${run.runId}`));
  assert.ok(human.stdout.excerpt.includes(`Started at: ${run.startedAt}`));

  for (const row of payload.verdict?.rows ?? []) {
    assert.ok(human.stdout.excerpt.includes(row.criterionId));
    assert.ok(human.stdout.excerpt.includes(row.verdict));
  }
});

test("general task report formats aggregate summary, details, next actions and unmetered provenance (D-15, UX-03)", async (context) => {
  const { fixture, contractPath, digest } = await setupContractFixture(context);
  await approveTaskContract({ contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    expectedDigest: digest,
  });

  // Attach generalReport to run record and save
  const generalReport: GeneralTaskReportData = {
    kind: "general-task-report",
    contractId: "inventory-summary",
    runId: run.runId,
    overallStatus: "partial",
    summary: {
      physicalFiles: {
        totalDistinctSaved: 3,
        newlyDownloaded: 2,
        previouslyConfirmed: 1,
      },
      materials: {
        approvedTotal: 4,
        verifiedComplete: 3,
        partialComplete: 1,
        failedOrUnsaved: 0,
        viewedOnly: 0,
        pendingUnapproved: 1,
      },
    },
    details: [
      {
        itemId: "item-01",
        courseId: "CS101",
        weekNumber: 1,
        title: "Lecture 1 slides",
        status: "verified",
        verifiedFilesCount: 1,
        totalRequiredFilesCount: 1,
        files: [{ fileId: "f-1", filename: "slides.pdf", status: "verified", bytes: 1024, sha256: "aabbccdd" }],
      },
      {
        itemId: "item-02",
        courseId: "CS101",
        weekNumber: 2,
        title: "Lab assignment",
        status: "partial",
        verifiedFilesCount: 0,
        totalRequiredFilesCount: 1,
        files: [{ fileId: "f-2", filename: "lab.zip", status: "failed", error: "Download timeout" }],
      },
    ],
    nextActions: [
      {
        itemId: "item-02",
        title: "Lab assignment",
        actionType: "auto_retry",
        reason: "download_error",
        description: "Retry download with backoff",
      },
    ],
  };

  const runsDir = join(fixture.stateRoot, "tasks", "inventory-summary", "runs");
  const runFile = join(runsDir, `${run.runId}.json`);
  const recordWithGeneral = {
    ...run,
    generalReport,
  };
  await writeFile(runFile, JSON.stringify(recordWithGeneral, null, 2), "utf8");

  const human = await cli(fixture, ["report", "inventory-summary"]);
  assert.equal(human.exitCode, 0, human.stderr.excerpt);
  const out = human.stdout.excerpt;

  assert.ok(out.includes("General Task Report: inventory-summary"));
  assert.ok(out.includes(`Run: ${run.runId}`));
  assert.ok(out.includes(`Started at: ${run.startedAt}`));
  assert.ok(out.includes("Overall Status: PARTIAL"));
  assert.ok(out.includes("Approved Target Total:  4"));
  assert.ok(out.includes("Verified Complete:      3"));
  assert.ok(out.includes("Partial Complete:       1"));
  assert.ok(out.includes("Pending Unapproved:     1 (not counted in denominator)"));
  assert.ok(out.includes("=== 3. Next Actions for Unresolved Materials ==="));
  assert.ok(out.includes("Retry download with backoff"));
  assert.ok(out.includes("=== 4. Execution & Resource Provenance ==="));
  assert.ok(out.includes("Executor: codex fixture"));
  assert.ok(out.includes("Reviewer: claude fixture"));
  assert.ok(out.includes("Tokens: (unmetered)"));
  assert.ok(out.includes("Cost (USD): (unmetered)"));
});
