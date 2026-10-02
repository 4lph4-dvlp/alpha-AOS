import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  diagnoseGsdLifecycleStatus,
  formatGsdDoctorReport,
} from "../src/core/task-doctor.js";
import { formatTaskStatus } from "../src/format.js";
import { writeHookReceipt, type HookExecutionReceipt } from "../src/core/task-hook-receipt.js";
import { writeReviewWitnessReceipt, type ReviewWitnessReceipt } from "../src/core/task-review-witness.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";
import type { TaskCheckpoint } from "../src/core/task-journal.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-doctor-gsd-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("diagnoseGsdLifecycleStatus inspects phase progression, hook receipts, and review witness (D-16)", async (context) => {
  const parent = await scratch(context, "diagnose");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;
  const receiptsRoot = join(projectRoot, "receipts");

  const headSha = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  // 1. Create STATE.md
  const planningDir = join(projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(
    join(planningDir, "STATE.md"),
    "# State\ncurrent_phase: 17-gsd-lifecycle-bridge\nstatus: executing\n",
    "utf8",
  );

  // 2. Write a hook receipt
  const hookReceipt: HookExecutionReceipt = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId: "hook-123",
    hookPoint: "discuss:pre",
    phaseId: "17-gsd-lifecycle-bridge",
    planId: null,
    targetRevisionSha: headSha,
    workingTreeDigest: "0".repeat(64),
    command: "node",
    args: ["-v"],
    exitCode: 0,
    stdoutSha256: "0".repeat(64),
    stderrSha256: "0".repeat(64),
    durationMs: 42,
    executedAt: "2026-10-03T00:00:00.000Z",
    status: "passed",
    receiptDigest: "0".repeat(64),
  };
  await writeHookReceipt(hookReceipt, join(receiptsRoot, "hooks"));

  // 3. Write a review witness receipt matching headSha
  const witnessReceipt: ReviewWitnessReceipt = {
    schemaVersion: 1,
    kind: "review-witness-receipt",
    requestId: "req-456",
    sessionId: "sess-789",
    reviewerHarness: "codex",
    reviewerVersion: "1.0.0",
    targetRevisionSha: headSha,
    artifactDigest: "0".repeat(64),
    witnessVerdict: "accepted",
    examinedAt: "2026-10-03T00:00:00.000Z",
    criteriaWitnessed: [{ criterionId: "crit-1", verdict: "pass" }],
    reportDigest: "0".repeat(64),
    receiptDigest: "0".repeat(64),
  };
  await writeReviewWitnessReceipt(witnessReceipt, join(receiptsRoot, "witnesses"));

  // 4. Diagnose
  const diagnostics = await diagnoseGsdLifecycleStatus({
    projectRoot,
    receiptsRoot,
  });

  assert.equal(diagnostics.currentPhase, "17-gsd-lifecycle-bridge");
  assert.equal(diagnostics.phaseStatus, "executing");
  assert.equal(diagnostics.hooks.executedCount, 1);
  assert.equal(diagnostics.hooks.passedCount, 1);
  assert.equal(diagnostics.hooks.failedCount, 0);
  assert.equal(diagnostics.reviewWitness.recorded, true);
  assert.equal(diagnostics.reviewWitness.matchesHead, true);

  // 5. Test formatGsdDoctorReport
  const formatted = formatGsdDoctorReport(diagnostics);
  assert.match(formatted, /17-gsd-lifecycle-bridge/);
  assert.match(formatted, /1 executed \(1 passed, 0 failed\)/);
  assert.match(formatted, /valid \(matches HEAD/);
});

test("formatTaskStatus displays GSD lifecycle diagnostics and receipt summaries when present (D-16)", () => {
  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractId: "test-task",
    revision: 1,
    contractDigest: "a".repeat(64),
    status: "running",
    attemptIndex: 1,
    usage: { cycles: 2, wallTimeMs: 45000, costUsd: 0.1, tokens: 1200 },
    lastSequence: 1,
    lastVerifiedHead: "b".repeat(40),
    stopReason: null,
    updatedAt: "2026-10-03T00:00:00.000Z",
  };

  const statusText = formatTaskStatus({
    checkpoint,
    ledger: null,
    eventsCount: 3,
    gsdDiagnostics: {
      currentPhase: "17-gsd-lifecycle-bridge",
      phaseStatus: "executing",
      completedPlansCount: 2,
      pendingPlansCount: 1,
      isPhaseComplete: false,
      hooks: {
        executedCount: 4,
        passedCount: 4,
        failedCount: 0,
        details: [],
      },
      reviewWitness: {
        recorded: true,
        headSha: "c".repeat(40),
        witnessRevisionSha: "c".repeat(40),
        matchesHead: true,
        verdict: "accepted",
      },
    },
  });

  assert.match(statusText, /GSD Phase: 17-gsd-lifecycle-bridge \(executing\)/);
  assert.match(statusText, /GSD Plans: 2 completed, 1 pending/);
  assert.match(statusText, /Hook Receipts: 4 passed, 0 failed/);
  assert.match(statusText, /Review Witness: valid \(matches HEAD\)/);
});
