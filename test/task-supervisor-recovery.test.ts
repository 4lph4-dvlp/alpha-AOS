import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createEffectLedger,
  generateEffectKey,
  reconcileLedgerOnRecovery,
  recordEffectState,
  type EffectLedgerEntry,
} from "../src/core/task-effects.js";
import {
  inspectTaskResumeReadiness,
  readEffectLedger,
  resumeTask,
  saveEffectLedger,
  superviseTask,
  verifyGsdStateConsistency,
} from "../src/core/task-supervisor.js";
import {
  appendJournalEvent,
  readCheckpoint,
  writeCheckpoint,
  type TaskCheckpoint,
} from "../src/core/task-journal.js";
import {
  requestTaskStop,
  recordTaskStopConfirmation,
  readTaskStopState,
} from "../src/core/task-control.js";
import { approveTaskContract, loadTaskContract, taskContractDigest } from "../src/core/task-contract.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  staticReviewerPort,
  writeTaskContract,
} from "./helpers/task-fixture.js";
import { gitCommand } from "./helpers/git-fixture.js";

test("verifyGsdStateConsistency detects Git HEAD divergence", async (context) => {
  const fixture = await createTaskFixture(context);
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: "digest-1",
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: head,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };

  const consistent1 = await verifyGsdStateConsistency(fixture.projectRoot, checkpoint);
  assert.equal(consistent1.consistent, true);

  // Alter lastVerifiedHead to simulate unexpected divergence
  checkpoint.lastVerifiedHead = "0000000000000000000000000000000000000000";
  const consistent2 = await verifyGsdStateConsistency(fixture.projectRoot, checkpoint);
  assert.equal(consistent2.consistent, false);
  assert.ok(consistent2.reason?.includes("Git HEAD moved unexpectedly"));
});

test("fault injection: crash after effect write reconciles to applied via sha256 on recovery", async (context) => {
  const fixture = await createTaskFixture(context);
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  const ledger = createEffectLedger("digest-fault-1");
  const content = "export const answer = 42;\n";
  const fileHash = createHash("sha256").update(content, "utf8").digest("hex");

  const effectKey = generateEffectKey("digest-fault-1", 1, "workspace-write", {
    relPath: "src/answer.ts",
    afterSha256: fileHash,
  });

  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest: "digest-fault-1",
    attemptIndex: 1,
    effectType: "workspace-write",
    targetPayload: {
      relPath: "src/answer.ts",
      afterSha256: fileHash,
    },
    status: "performing", // Left in performing due to crash!
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  recordEffectState(ledger, entry);

  // Simulate file was already written to disk before crash
  await mkdir(join(fixture.projectRoot, "src"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "src", "answer.ts"), content, "utf8");

  // Reconcile on recovery
  const { ledger: reconciled, hasUnknown } = await reconcileLedgerOnRecovery(fixture.projectRoot, head, ledger);
  assert.equal(hasUnknown, false);
  assert.equal(reconciled.entries[effectKey]?.status, "applied");
  assert.equal(reconciled.entries[effectKey]?.evidence, "source-evidence-reconciled");
});

test("fault injection: crash before effect write leaves effect planned and not applied", async (context) => {
  const fixture = await createTaskFixture(context);
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  const ledger = createEffectLedger("digest-fault-2");
  const content = "export const count = 1;\n";
  const fileHash = createHash("sha256").update(content, "utf8").digest("hex");

  const effectKey = generateEffectKey("digest-fault-2", 1, "workspace-write", {
    relPath: "src/unwritten.ts",
    beforeSha256: null,
    afterSha256: fileHash,
  });

  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest: "digest-fault-2",
    attemptIndex: 1,
    effectType: "workspace-write",
    targetPayload: {
      relPath: "src/unwritten.ts",
      beforeSha256: null,
      afterSha256: fileHash,
    },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  recordEffectState(ledger, entry);

  // File was NOT written before crash
  const { ledger: reconciled, hasUnknown } = await reconcileLedgerOnRecovery(fixture.projectRoot, head, ledger);
  assert.equal(hasUnknown, false);
  assert.equal(reconciled.entries[effectKey]?.status, "planned");
});

test("inspectTaskResumeReadiness previews readiness without mutating state", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // 1. Before supervisor runs -> no checkpoint found
  const r1 = await inspectTaskResumeReadiness(fixture.contractPath, digest, fixture.stateRoot);
  assert.equal(r1.ready, false);
  assert.ok(r1.reason?.includes("No checkpoint found"));

  // 2. Setup running checkpoint
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: contract.id,
    revision: contract.revision,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: head,
    usage: { cycles: 1, wallTimeMs: 500, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const r2 = await inspectTaskResumeReadiness(fixture.contractPath, digest, fixture.stateRoot);
  assert.equal(r2.ready, true);
  assert.equal(r2.gsdConsistent, true);
  assert.equal(r2.unappliedEffectsCount, 0);

  // 3. Accepted checkpoint -> cannot resume
  cp.status = "accepted";
  await writeCheckpoint(fixture.stateRoot, cp);
  const r3 = await inspectTaskResumeReadiness(fixture.contractPath, digest, fixture.stateRoot);
  assert.equal(r3.ready, false);
  assert.ok(r3.reason?.includes("accepted"));
});

test("limit stoppage: cycle limit stops with cycle_limit_exceeded", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.resourcePolicy = { maxCycles: 2 };
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // Use off-by-one controller so attempts are rejected
  const ports = fixturePorts({
    controller: referenceControllerPort("off-by-one"),
    reviewer: staticReviewerPort(passingReview),
  });

  const result = await superviseTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.scratch,
    ports,
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(result.status, "stopped");
  assert.equal(result.stopCode, "cycle_limit_exceeded");
  assert.equal(result.usage.cycles, 2);
  assert.equal(result.checkpoint.status, "stopped");
});

test("limit stoppage: wall time limit stops with wall_time_exceeded", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.resourcePolicy = { maxWallTimeMinutes: 1 }; // 60,000 ms
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // Seed checkpoint with 60,000 ms usage
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: contract.id,
    revision: contract.revision,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: head,
    usage: { cycles: 1, wallTimeMs: 60_000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  const ports = fixturePorts({
    controller: referenceControllerPort("correct"),
    reviewer: staticReviewerPort(passingReview),
  });

  const result = await superviseTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.scratch,
    ports,
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(result.status, "stopped");
  assert.equal(result.stopCode, "wall_time_exceeded");
});

test("adaptive repair escalation halts in stage-3-blocked with BlockedReport", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.resourcePolicy = { maxCycles: 10 };
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // Off-by-one controller causes identical repeated failures
  const ports = fixturePorts({
    controller: referenceControllerPort("off-by-one"),
    reviewer: staticReviewerPort(passingReview),
  });

  const result = await superviseTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.scratch,
    ports,
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.stopCode, "no_progress_exhausted");
  assert.ok(result.blockedReport !== null);
  assert.equal(result.blockedReport.status, "blocked");
  assert.equal(result.blockedReport.consecutiveFailures >= 4, true);
  assert.deepEqual(result.blockedReport.attemptedStrategies, [
    "stage-1-reproduction-injection",
    "stage-2-single-criterion-focus",
  ]);
});

test("inspectTaskResumeReadiness and resumeTask block when stop request is pending or unknown (D-12, D-13)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });

  // Set up running checkpoint
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const cp: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "inventory-summary",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: head,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(fixture.stateRoot, cp);

  // 1. Submit stop request (pending)
  await requestTaskStop({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
    contractDigest: digest,
    reason: "operator_halt",
  });

  // Forcibly rewrite stop record to pending with mock alive PID to test pending gating
  const stopFile = join(fixture.stateRoot, "tasks", "inventory-summary", "control", `${digest}.stop.json`);
  await writeFile(
    stopFile,
    JSON.stringify({
      schemaVersion: 1,
      contractId: "inventory-summary",
      contractDigest: digest,
      runId: digest,
      requestedAt: new Date().toISOString(),
      reason: "operator_halt",
      caller: "test",
      confirmedAt: null,
      terminationEvidence: null,
      controllerPid: process.pid, // alive
      leaseToken: "mock-token",
      status: "pending",
    }),
    "utf8",
  );

  // 2. inspectTaskResumeReadiness reports ready: false due to pending stop
  const pendingReadiness = await inspectTaskResumeReadiness(fixture.contractPath, digest, fixture.stateRoot);
  assert.equal(pendingReadiness.ready, false);
  assert.match(pendingReadiness.reason ?? "", /A stop request is pending and process termination has not been confirmed/u);

  // 3. resumeTask throws error on pending stop
  const ports = fixturePorts({
    controller: referenceControllerPort("correct"),
    reviewer: staticReviewerPort(passingReview),
  });
  await assert.rejects(
    () =>
      resumeTask({
        contractPath: fixture.contractPath,
        expectedDigest: digest,
        stateRoot: fixture.stateRoot,
        packageRoot: fixture.scratch,
        ports,
      }),
    /stop request is still pending/u,
  );

  // 4. Confirm stop
  await recordTaskStopConfirmation({
    stateRoot: fixture.stateRoot,
    contractId: "inventory-summary",
    runId: digest,
    contractDigest: digest,
    terminationEvidence: "verified-in-test",
    stopReason: "operator_halt",
  });

  // 5. Readiness now succeeds once stop is confirmed and state is consistent
  const confirmedReadiness = await inspectTaskResumeReadiness(fixture.contractPath, digest, fixture.stateRoot);
  assert.equal(confirmedReadiness.ready, true);
});
