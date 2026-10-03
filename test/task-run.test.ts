import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  approveTaskContract,
  loadTaskContract,
  previewTaskContract,
  readTaskApprovals,
  TaskContractError,
  taskContractDigest,
} from "../src/core/task-contract.js";
import { listTaskRuns, TaskRunError, type ReviewRequest } from "../src/core/task-run.js";
import {
  createCapabilityReceipt,
  type TaskCapabilityPort,
} from "../src/core/task-capability-receipts.js";
import type { CapabilityAlternateCandidate } from "../src/core/task-capability-drift.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

async function listing(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true });
    return entries.map((entry) => entry.replaceAll("\\", "/")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function approvedFixture(fixture: TaskFixture): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  const approval = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approval.status, "approved");
  return preview.digest;
}

function isCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => {
    assert.ok(error instanceof TaskContractError || error instanceof TaskRunError, `unexpected error: ${String(error)}`);
    assert.equal(error.code, code);
    return true;
  };
}

test("an approved contract with a correct implementation and a passing review is accepted", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  const { run, recordPath } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
  });

  assert.equal(run.status, "accepted");
  assert.equal(run.contractDigest, digest);
  assert.ok(run.artifact !== null);
  assert.match(run.artifact.digest, /^[0-9a-f]{64}$/u);
  assert.ok(run.verdict !== null);
  assert.equal(run.verdict.overall, "accepted");
  assert.equal(run.verdict.refusal, null);
  assert.deepEqual(
    run.verdict.rows.map((row) => [row.criterionId, row.verdict, row.measured.outcome]),
    // Rows follow the contract's canonical criterion order: ids sorted by code unit.
    [
      ["invalid-quantity", "pass", "pass"],
      ["valid-summary", "pass", "pass"],
    ],
  );
  for (const row of run.verdict.rows) assert.equal(row.artifactDigest, run.artifact.digest);
  assert.equal(run.reviewer?.report?.artifactDigest, run.artifact.digest);

  const persisted = JSON.parse(await readFile(recordPath, "utf8")) as typeof run;
  assert.deepEqual(persisted, run);
  const runs = await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" });
  assert.deepEqual(runs, [run]);
});

test("an executor that claims success with wrong output is rejected by measurement", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("off-by-one"), reviewer: staticReviewerPort(passingReview) }),
    expectedDigest: digest,
  });

  assert.equal(run.executor?.claim?.status, "completed");
  assert.equal(run.executor?.exitCode, 0);
  assert.equal(run.verdict?.overall, "rejected");
  assert.equal(run.status, "rejected");
  const valid = run.verdict?.rows.find((row) => row.criterionId === "valid-summary");
  assert.ok(valid !== undefined);
  assert.equal(valid.verdict, "fail");
  assert.equal(valid.measured.outcome, "fail");
  assert.match(valid.reason, /stdout/u);
  assert.doesNotMatch(valid.reason, /claim/iu);
  const invalid = run.verdict?.rows.find((row) => row.criterionId === "invalid-quantity");
  assert.equal(invalid?.verdict, "pass");
});

test("a review bound to another artifact digest is refused as stale", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const staleReview = (request: ReviewRequest) => ({ ...passingReview(request), artifactDigest: "0".repeat(64) });

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(staleReview) }),
    expectedDigest: digest,
  });

  assert.equal(run.verdict?.refusal, "stale-review");
  assert.notEqual(run.status, "accepted");
  assert.notEqual(run.verdict?.overall, "accepted");
  assert.ok(["unknown", "rejected"].includes(run.verdict?.overall ?? ""));
  for (const row of run.verdict?.rows ?? []) assert.notEqual(row.verdict, "pass");
});

test("start refuses an unapproved contract and a consumed approval", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await loadTaskContract(fixture.contractPath);
  const ports = fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) });

  await assert.rejects(startFixtureTask(fixture, { ports, expectedDigest: digest }), isCode("not-approved"));
  assert.deepEqual(await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" }), []);

  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  const first = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  assert.equal(first.run.status, "accepted");

  await assert.rejects(startFixtureTask(fixture, { ports, expectedDigest: digest }), isCode("approval-consumed"));
  assert.equal((await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" })).length, 1);
});

test("approve refuses a digest that is not the recomputed digest", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const { digest } = await loadTaskContract(fixture.contractPath);
  const wrong = digest.startsWith("f") ? "e".repeat(64) : "f".repeat(64);

  await assert.rejects(
    approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: wrong, stateRoot: fixture.stateRoot }),
    (error: unknown) => {
      assert.ok(error instanceof TaskContractError);
      assert.equal(error.code, "contract-drift");
      assert.ok(error.message.includes(digest), "the refusal names the current digest");
      assert.ok(error.message.includes(`--contract-digest ${digest} --apply`), "the refusal names the approve command");
      return true;
    },
  );
  assert.deepEqual(await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" }), []);

  const approved = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  assert.equal(approved.status, "approved");
  const again = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });
  assert.equal(again.status, "already-approved");
  assert.equal((await readTaskApprovals({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" })).length, 1);
});

test("preview writes nothing under the state root", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));

  const before = await listing(fixture.stateRoot);
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  assert.deepEqual(await listing(fixture.stateRoot), before);
  assert.equal(preview.approved, false);
  assert.deepEqual(preview.approvals, []);
  assert.equal(preview.digest, taskContractDigest(inventorySummaryContract(fixture.projectRoot)));

  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  const approvedListing = await listing(fixture.stateRoot);
  const again = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  assert.deepEqual(await listing(fixture.stateRoot), approvedListing);
  assert.equal(again.approved, true);
  assert.equal(again.digest, preview.digest);
});

test("contracts differing only in id never share an approval", async (context) => {
  const fixture = await createTaskFixture(context);
  const first = inventorySummaryContract(fixture.projectRoot);
  const second = inventorySummaryContract(fixture.projectRoot, { id: "inventory-summary-b" });
  assert.notEqual(taskContractDigest(first), taskContractDigest(second));

  const digest = await approvedFixture(fixture);
  const secondPath = join(fixture.scratch, "contract-b.json");
  await writeTaskContract(secondPath, second);
  const secondDigest = taskContractDigest(second);
  const ports = fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) });
  const secondFixture = { ...fixture, contractPath: secondPath };

  await assert.rejects(startFixtureTask(secondFixture, { ports, expectedDigest: secondDigest }), isCode("not-approved"));
  await assert.rejects(startFixtureTask(secondFixture, { ports, expectedDigest: digest }), isCode("contract-drift"));
  assert.deepEqual(await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary-b" }), []);
});

test("a missing, empty or criterion-less contract is refused", async (context) => {
  const fixture = await createTaskFixture(context);
  const missing = join(fixture.scratch, "missing.json");
  const empty = join(fixture.scratch, "empty.json");
  const criterionless = join(fixture.scratch, "criterionless.json");
  await writeFile(empty, "", "utf8");
  await writeTaskContract(criterionless, { ...inventorySummaryContract(fixture.projectRoot), criterion: [] });
  const ports = fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) });

  for (const path of [missing, empty, criterionless]) {
    await assert.rejects(loadTaskContract(path), isCode("contract-invalid"));
    await assert.rejects(
      approveTaskContract({ contractPath: path, expectedDigest: "a".repeat(64), stateRoot: fixture.stateRoot }),
      isCode("contract-invalid"),
    );
    await assert.rejects(
      startFixtureTask({ ...fixture, contractPath: path }, { ports, expectedDigest: "a".repeat(64) }),
      isCode("contract-invalid"),
    );
  }
  assert.deepEqual(await listing(fixture.stateRoot), []);
});

async function approveCapabilityContract(fixture: TaskFixture, goal: string): Promise<string> {
  const contract = inventorySummaryContract(fixture.projectRoot, { goal });
  await writeTaskContract(fixture.contractPath, contract);
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  const approval = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approval.status, "approved");
  return preview.digest;
}

function failingCapabilityPort(errorMessage = "503 service unavailable"): TaskCapabilityPort {
  return {
    async invoke(request) {
      const receipt = createCapabilityReceipt({
        runId: request.runId,
        step: request.step,
        capabilityId: request.obligation.capabilityId,
        obligationId: request.obligation.id,
        question: request.obligation.question,
        selected: true,
        invoked: true,
        outcome: "tool-error",
        toolName: "context7",
        harness: "codex",
        harnessVersion: "1.0.0",
        harnessExecutable: "codex",
        sessionId: request.sessionId ?? `session-${request.runId}`,
        source: request.obligation.source,
        sourceVersion: request.obligation.version,
        rawResultSha256: "b".repeat(64),
        isReused: false,
        originalReceiptId: null,
        isError: true,
        errorMessage,
      });
      return { receipt };
    },
  };
}

test("D-10..D-13: task execution with failed capability halts with blocked when no alternate exists", async (context) => {
  const fixture = await createTaskFixture(context);
  const goal = "Consult documentation-lookup for API v2. Summarize inventory CSV as JSON.";
  const digest = await approveCapabilityContract(fixture, goal);

  const ports = {
    ...fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    capability: failingCapabilityPort(),
  };

  const { run } = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  assert.equal(run.status, "blocked");
  assert.ok(run.stopReason?.includes("capability-failure"));
});

test("D-10..D-13: task execution with failed capability halts with needs-input when user action is available", async (context) => {
  const fixture = await createTaskFixture(context);
  const goal = "Consult documentation-lookup for API v2. Summarize inventory CSV as JSON.";
  const digest = await approveCapabilityContract(fixture, goal);

  const ports = {
    ...fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    capability: failingCapabilityPort(),
    userActionAvailable: true,
    userActionDescription: "Configure CONTEXT7_API_KEY environment variable",
  };

  const { run } = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  assert.equal(run.status, "unknown");
  assert.ok(run.stopReason?.includes("capability-failure"));
  assert.ok(run.nextAction?.includes("Configure CONTEXT7_API_KEY"));
});

test("D-11: task execution with alternate requiring harness change pauses for new contract approval", async (context) => {
  const fixture = await createTaskFixture(context);
  const goal = "Consult documentation-lookup for API v2. Summarize inventory CSV as JSON.";
  const digest = await approveCapabilityContract(fixture, goal);

  const alternate: CapabilityAlternateCandidate = {
    capabilityId: "claude-docs",
    harness: "claude",
    roleChange: false,
    harnessChange: true,
    answersSameQuestion: true,
    provenResult: true,
  };

  const ports = {
    ...fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    capability: failingCapabilityPort(),
    capabilityAlternates: [alternate],
  };

  const { run } = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  assert.equal(run.status, "unknown");
  assert.ok(run.nextAction?.includes("approve contract with digest"));
});

test("D-10, D-12: task execution with verified equivalent alternate on current harness recovers and succeeds", async (context) => {
  const fixture = await createTaskFixture(context);
  const goal = "Consult documentation-lookup for API v2. Summarize inventory CSV as JSON.";
  const digest = await approveCapabilityContract(fixture, goal);

  const alternate: CapabilityAlternateCandidate = {
    capabilityId: "local-docs",
    harness: "codex",
    roleChange: false,
    harnessChange: false,
    answersSameQuestion: true,
    provenResult: true,
  };

  const ports = {
    ...fixturePorts({ controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview) }),
    capability: failingCapabilityPort(),
    capabilityAlternates: [alternate],
  };

  const { run } = await startFixtureTask(fixture, { ports, expectedDigest: digest });
  assert.equal(run.status, "accepted");
});
