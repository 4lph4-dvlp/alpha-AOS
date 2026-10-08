import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  recordReviewSuggestions,
  readTaskReviewSuggestions,
  promoteTaskReviewSuggestion,
  discardTaskReviewSuggestion,
} from "../src/core/task-review-suggestions.js";
import { diagnoseGsdLifecycleStatus, formatGsdDoctorReport } from "../src/core/task-doctor.js";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";
import type { ReviewRequest, ReviewerPort } from "../src/core/task-run.js";

async function approvedFixture(fixture: TaskFixture): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  return preview.digest;
}

test("recordReviewSuggestions atomically persists suggestions and preserves pending status (D-08)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "test-contract";

  const result1 = await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-1",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [
      { criterionId: "c1", summary: "Use faster hash algorithm", reason: "Performance recommendation" },
      { criterionId: "c2", summary: "Add type annotations to internal helpers", reason: "Maintainability" },
    ],
  });

  assert.equal(result1.recordedCount, 2);
  assert.equal(result1.totalPendingCount, 2);
  assert.equal(result1.suggestions.length, 2);
  for (const s of result1.suggestions) {
    assert.equal(s.status, "pending");
  }

  // Reading back yields identical persistent suggestions
  const readBack = await readTaskReviewSuggestions({ stateRoot, contractId });
  assert.equal(readBack.status, "ok");
  assert.equal(readBack.count, 2);
  assert.equal(readBack.pendingCount, 2);
});

test("duplicate recordings of identical suggestions do not duplicate files or entries (idempotent)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "test-contract";

  await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-1",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [
      { summary: "Use faster hash algorithm" },
    ],
  });

  // Re-run with the same suggestion
  const result2 = await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-2",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [
      { summary: "Use faster hash algorithm" },
      { summary: "New second recommendation" },
    ],
  });

  assert.equal(result2.recordedCount, 1); // Only the second one was newly added
  assert.equal(result2.totalPendingCount, 2);
  assert.equal(result2.suggestions.length, 2);
});

test("promoteTaskReviewSuggestion updates status to promoted with audit note without touching contract (D-08, T-19-04)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "test-contract";

  const recorded = await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-1",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [{ summary: "Refactor database query" }],
  });

  const sugId = recorded.suggestions[0]!.id;

  // Contract before promotion
  const contractBefore = await readFile(fixture.contractPath, "utf8").catch(() => null);

  const promoted = await promoteTaskReviewSuggestion({
    stateRoot,
    contractId,
    suggestionId: sugId,
    note: "Promoted to Phase 20 follow-up plan",
  });

  assert.equal(promoted.status, "ok");
  if (promoted.status === "ok") {
    assert.equal(promoted.suggestion.status, "promoted");
    assert.equal(promoted.suggestion.dispositionNote, "Promoted to Phase 20 follow-up plan");
  }

  // Verify contract file was NOT touched
  const contractAfter = await readFile(fixture.contractPath, "utf8").catch(() => null);
  assert.equal(contractBefore, contractAfter);

  // Read back reflects 0 pending, 1 total
  const readBack = await readTaskReviewSuggestions({ stateRoot, contractId });
  assert.equal(readBack.status, "ok");
  assert.equal(readBack.pendingCount, 0);
  assert.equal(readBack.count, 1);
});

test("discardTaskReviewSuggestion updates status to discarded with note (D-08)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "test-contract";

  const recorded = await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-1",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [{ summary: "Unneeded optimization" }],
  });

  const sugId = recorded.suggestions[0]!.id;

  const discarded = await discardTaskReviewSuggestion({
    stateRoot,
    contractId,
    suggestionId: sugId,
    note: "Discarded: premature optimization out of scope",
  });

  assert.equal(discarded.status, "ok");
  if (discarded.status === "ok") {
    assert.equal(discarded.suggestion.status, "discarded");
    assert.equal(discarded.suggestion.dispositionNote, "Discarded: premature optimization out of scope");
  }

  const readBack = await readTaskReviewSuggestions({ stateRoot, contractId });
  assert.equal(readBack.status, "ok");
  assert.equal(readBack.pendingCount, 0);
});

test("corrupted suggestions file reports error and does not disguise as empty (D-08)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "corrupt-contract";

  const targetDir = join(stateRoot, "tasks", contractId);
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "suggestions.json"), "{ invalid json syntax !!", "utf8");

  const result = await readTaskReviewSuggestions({ stateRoot, contractId });
  assert.equal(result.status, "error");
  assert.equal(result.count, null);
  assert.equal(result.pendingCount, null);
  assert.match(result.error, /Failed to parse suggestions document/i);
});

test("doctor reports pending suggestions count and existence in diagnostics and format report (D-08)", async (context) => {
  const fixture = await createTaskFixture(context);
  const stateRoot = fixture.stateRoot;
  const contractId = "inventory-summary";

  // Record 2 pending suggestions
  await recordReviewSuggestions({
    stateRoot,
    contractId,
    requestId: "req-1",
    targetRevisionSha: "0".repeat(40),
    artifactDigest: "a".repeat(64),
    suggestions: [
      { summary: "Consider caching parsed CSV rows" },
      { summary: "Add verbose debug flag" },
    ],
  });

  const diagnostics = await diagnoseGsdLifecycleStatus({
    projectRoot: fixture.projectRoot,
    stateRoot,
    contractId,
  });

  assert.ok(diagnostics.pendingSuggestions !== undefined);
  assert.equal(diagnostics.pendingSuggestions?.count, 2);
  assert.equal(diagnostics.pendingSuggestions?.status, "ok");

  const formatted = formatGsdDoctorReport(diagnostics);
  assert.match(formatted, /Pending Suggestions:\s*2 pending review/i);
});

test("end-to-end startFixtureTask automatically persists advisory suggestions into external state (D-08, REV-05)", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  // Reviewer passes criteria but includes top-level out-of-scope suggestions
  const reviewer: ReviewerPort = {
    async review(request: ReviewRequest) {
      const base = passingReview(request);
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: {
          ...base,
          suggestions: [
            "Add stream-based CSV parsing for large files",
            "Consider supporting TSV delimiter option",
          ],
        },
        issues: [],
      };
    },
  };

  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer,
    }),
    expectedDigest: digest,
  });

  assert.equal(record.status, "accepted");

  // Verify external state has the deferred suggestions
  const saved = await readTaskReviewSuggestions({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
  });

  assert.equal(saved.status, "ok");
  assert.equal(saved.count, 2);
  assert.equal(saved.pendingCount, 2);
  assert.ok(saved.suggestions.some((s) => s.summary.includes("stream-based CSV parsing")));
  assert.ok(saved.suggestions.some((s) => s.summary.includes("TSV delimiter option")));
});
