import { realpathSync as canonicalFixturePath } from "node:fs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join, dirname } from "node:path";
import test from "node:test";
import { waitTask } from "../src/core/task-wait.js";
import { selectTaskExecution } from "../src/core/task-read.js";
import { writeCheckpoint, appendJournalEvent, runJournalPath, type TaskCheckpoint } from "../src/core/task-journal.js";
import { acquireControllerLease } from "../src/core/controller-lease.js";
import { approveTaskContract, loadTaskContract } from "../src/core/task-contract.js";
import { superviseTask } from "../src/core/task-supervisor.js";
import { packageRoot } from "../src/core/paths.js";
import { readJournalEvents, type TaskJournalEventKind } from "../src/core/task-journal.js";
import {
  createTaskFixture, fixturePorts, inventorySummaryContract, passingReview,
  referenceControllerPort, staticReviewerPort, writeTaskContract,
} from "./helpers/task-fixture.js";

async function createTestState(): Promise<{ stateRoot: string; projectRoot: string; cleanup: () => Promise<void> }> {
  const base = join(canonicalFixturePath(tmpdir()), `test-task-wait-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const stateRoot = join(base, "state");
  const projectRoot = join(base, "project");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(projectRoot, { recursive: true });
  return {
    stateRoot,
    projectRoot,
    cleanup: async () => {
      await rm(base, { recursive: true, force: true });
    },
  };
}

async function createOwnedTestState(digest: string) {
  const fixture = await createTestState();
  try {
    const lease = await acquireControllerLease({
      projectRoot: fixture.projectRoot, harness: "codex", contractDigest: digest,
    });
    return {
      ...fixture,
      cleanup: async () => {
        try { await lease.release(); } finally { await fixture.cleanup(); }
      },
    };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}

function createRunRecord(options: {
  contractId: string;
  runId: string;
  contractDigest: string;
  revision: number;
  status: "executing" | "accepted" | "rejected" | "unknown" | "blocked" | "stopped";
  stopReason?: string | null;
}) {
  return {
    schemaVersion: 1,
    kind: "task-run",
    runId: options.runId,
    contractId: options.contractId,
    revision: options.revision,
    contractDigest: options.contractDigest,
    status: options.status,
    startedAt: new Date().toISOString(),
    finishedAt: options.status === "executing" ? null : new Date().toISOString(),
    artifact: null,
    executor: null,
    reviewer: null,
    verdict: options.status === "accepted" ? {
      overall: "accepted",
      refusal: null,
      rows: [],
      preconditions: [],
    } : options.status === "rejected" ? {
      overall: "rejected",
      refusal: null,
      rows: [],
      preconditions: [],
    } : null,
    stopReason: options.stopReason ?? null,
    nextAction: null,
    decisions: [],
    decisionLog: null,
    baseCommit: null,
    deadlineAt: null,
    gsd: null,
    effects: null,
  };
}

test("task-wait: argument validation rejects non-canonical IDs, digests, and revisions", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const validDigest = "a".repeat(64);

    // Invalid contract ID
    const res1 = await waitTask({
      stateRoot,
      contractId: "INVALID_CONTRACT!",
      runId: "validrun0001-00000001",
      contractDigest: validDigest,
      revision: 1,
      timeoutMs: 1000,
    });
    assert.equal(res1.ok, false);
    assert.equal(res1.reasonCode, "INVALID_CONTRACT_ID");

    // Invalid runId (non-canonical: multiple dashes or bad pattern)
    const res2 = await waitTask({
      stateRoot,
      contractId: "test-task",
      runId: "invalid-run-id-format",
      contractDigest: validDigest,
      revision: 1,
      timeoutMs: 1000,
    });
    assert.equal(res2.ok, false);
    assert.equal(res2.reasonCode, "INVALID_RUN_ID");

    // Invalid contract digest
    const res3 = await waitTask({
      stateRoot,
      contractId: "test-task",
      runId: "validrun0001-00000001",
      contractDigest: "short-digest",
      revision: 1,
      timeoutMs: 1000,
    });
    assert.equal(res3.ok, false);
    assert.equal(res3.reasonCode, "INVALID_CONTRACT_DIGEST");

    // Invalid revision
    const res4 = await waitTask({
      stateRoot,
      contractId: "test-task",
      runId: "validrun0001-00000001",
      contractDigest: validDigest,
      revision: -1,
      timeoutMs: 1000,
    });
    assert.equal(res4.ok, false);
    assert.equal(res4.reasonCode, "INVALID_REVISION");

    // Invalid scope
    const res5 = await waitTask({
      stateRoot,
      contractId: "test-task",
      runId: "validrun0001-00000001",
      contractDigest: validDigest,
      revision: 1,
      scope: "unknown-scope" as any,
      timeoutMs: 1000,
    });
    assert.equal(res5.ok, false);
    assert.equal(res5.reasonCode, "INVALID_SCOPE");
  } finally {
    await cleanup();
  }
});

test("task-wait: valid canonical run receipts FIRST and assert selection succeeds", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "a".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

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

    // Assert canonical fixture selection succeeds before proceeding
    const selected = await selectTaskExecution({
      stateRoot,
      contractId,
      runId,
    });
    assert.ok(selected.runRecord !== null, "Canonical fixture selection must succeed");
    assert.equal(selected.runId, runId);
    assert.equal(selected.selectionRule, "exact-run-id");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
    assert.equal(result.contractId, contractId);
    assert.equal(result.runId, runId);
  } finally {
    await cleanup();
  }
});

test("task-wait: checkpoint-only accepted + runId=digest is never accepted", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const digest = "b".repeat(64);
    const runId = "b".repeat(64); // checkpoint fallback style runId
    const revision = 1;

    // Write checkpoint only (no run record on disk)
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

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
  } finally {
    await cleanup();
  }
});

test("task-wait: exact terminal accepted, rejected, and blocked observable", async () => {
  for (const terminalStatus of ["accepted", "rejected", "blocked"] as const) {
    const { stateRoot, cleanup } = await createTestState();
    try {
      const contractId = "test-task";
      const runId = "testrun0001-00000001";
      const digest = "c".repeat(64);
      const revision = 1;

      const runsDir = join(stateRoot, "tasks", contractId, "runs");
      await mkdir(runsDir, { recursive: true });
      const runRecord = createRunRecord({
        contractId,
        runId,
        contractDigest: digest,
        revision,
        status: terminalStatus,
        stopReason: terminalStatus === "blocked" ? "prerequisite_missing" : null,
      });
      await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

      const checkpoint: TaskCheckpoint = {
        schemaVersion: 1,
        contractDigest: digest,
        contractId,
        revision,
        status: terminalStatus,
        attemptIndex: 1,
        lastSequence: 1,
        lastVerifiedHead: null,
        usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
        stopReason: null,
        updatedAt: new Date().toISOString(),
      };
      await writeCheckpoint(stateRoot, checkpoint);

      const result = await waitTask({
        stateRoot,
        contractId,
        runId,
        contractDigest: digest,
        revision,
        scope: "attempt",
        timeoutMs: 2000,
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, "completed");
      assert.equal(result.taskStatus, terminalStatus);
      if (terminalStatus === "blocked") {
        assert.equal(result.stopReason, "prerequisite_missing");
      }
    } finally {
      await cleanup();
    }
  }
});

test("task-wait: real rejected event in journal never invented as completed", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "d".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    // Run record currently in executing state
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 2,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    // Write journal with attempt_finished verdict: rejected linking this run
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: {},
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_finished",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId, verdict: "rejected" },
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "rejected"); // NOT "completed"
  } finally {
    await cleanup();
  }
});

test("task-wait: moving checkpoint retry does not switch pinned run", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId1 = "testrun0001-00000001";
    const digest = "e".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord1 = createRunRecord({
      contractId,
      runId: runId1,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId1}.json`), JSON.stringify(runRecord1), "utf8");

    // Checkpoint has advanced to attempt 2 and is running another retry
    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 2,
      lastSequence: 3,
      lastVerifiedHead: null,
      usage: { cycles: 2, wallTimeMs: 20, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: {},
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId: runId1 },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 2,
      payload: {},
    });

    // Observer pinned to runId1 (attempt 1)
    const result = await waitTask({
      stateRoot,
      contractId,
      runId: runId1,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
    assert.equal(result.attemptIndex, 1); // Stayed with pinned attempt 1
  } finally {
    await cleanup();
  }
});

test("task-wait: valid checkpoint0 + journaltail > 0 does not falsely regress", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "f".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Canonical supervisor initializes checkpoint.lastSequence=0 while journal tail is 2
    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 0,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: {},
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});

test("task-wait: forged checkpoint fields fail closed with refused status", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "1".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Forged checkpoint with different contractId
    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId: "forged-task-id",
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 1,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "FORGED_CHECKPOINT");
  } finally {
    await cleanup();
  }
});

test("task-wait: regressing sequence numbers fail closed with refused status", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "2".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 5,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    // Write journal events with regressing sequence: 2 after 3
    const journalDir = join(stateRoot, "runs", digest);
    await mkdir(journalDir, { recursive: true });
    const line1 = JSON.stringify({ sequence: 3, timestamp: new Date().toISOString(), kind: "attempt_started", contractDigest: digest, attemptIndex: 1, payload: {} });
    const line2 = JSON.stringify({ sequence: 2, timestamp: new Date().toISOString(), kind: "effect_planned", contractDigest: digest, attemptIndex: 1, payload: {} });
    await writeFile(join(journalDir, "journal.jsonl"), `${line1}\n${line2}\n`, "utf8");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "REGRESSING_SEQUENCE");
  } finally {
    await cleanup();
  }
});

test("task-wait: oversized run record fails closed with refused status", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "3".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const baseRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    // Create record exceeding 1MB ceiling
    const largeRecord = {
      ...baseRecord,
      decisions: new Array(15000).fill({ id: "x", text: "padding-large-content-to-exceed-ceiling" }),
    };
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(largeRecord), "utf8");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
  } finally {
    await cleanup();
  }
});

test("task-wait: owner process death while nonterminal resolves as OWNER_DEAD", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "4".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Write controller lock with dead PID
    const dotAlphaAos = join(projectRoot, ".alpha-aos");
    await mkdir(dotAlphaAos, { recursive: true });
    const deadPid = 99999999;
    const lockRecord = {
      schemaVersion: 1,
      harness: "codex" as const,
      contractDigest: digest,
      pid: deadPid,
      host: hostname(),
      token: "owner-token-dead",
      startedAt: new Date().toISOString(),
    };
    await writeFile(join(dotAlphaAos, "controller.lock"), JSON.stringify(lockRecord), "utf8");

    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "OWNER_DEAD");
  } finally {
    await cleanup();
  }
});

test("task-wait: owner absence after validated terminal completion succeeds cleanly", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "5".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

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

    // No controller lock exists at all (cleanly terminated)
    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});

test("task-wait: supervisor scope refuses lone terminal checkpoint without linked journal", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "6".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Lone terminal checkpoint
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

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "LONE_CHECKPOINT_REFUSED");
  } finally {
    await cleanup();
  }
});

test("task-wait: supervisor scope reports honest UNSUPPORTED_SUPERVISOR_EVIDENCE when retry linkage unproven", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "7".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord), "utf8");

    // Live controller lock for supervisor using canonical producer
    const lease = await acquireControllerLease({
      projectRoot,
      harness: "codex",
      contractDigest: digest,
    });

    // Checkpoint has advanced to attempt 2
    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 2,
      lastSequence: 1,
      lastVerifiedHead: null,
      usage: { cycles: 2, wallTimeMs: 20, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    // Journal has no linkage to runId
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 2,
      payload: { stage: "retry" },
    });

    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "UNSUPPORTED_SUPERVISOR_EVIDENCE");
    await lease.release().catch(() => undefined);
  } finally {
    await cleanup();
  }
});

test("task-wait: observation does not mutate any bytes on disk", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0001-00000001";
    const digest = "8".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    const runFilePath = join(runsDir, `${runId}.json`);
    await writeFile(runFilePath, JSON.stringify(runRecord), "utf8");

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

    // Hash all files before waitTask
    async function getTreeHashes(dir: string): Promise<Map<string, string>> {
      const hashes = new Map<string, string>();
      async function walk(current: string) {
        const entries = await readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.isFile()) {
            const buf = await readFile(full);
            hashes.set(full, createHash("sha256").update(buf).digest("hex"));
          }
        }
      }
      await walk(dir);
      return hashes;
    }

    const beforeHashes = await getTreeHashes(stateRoot);

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");

    const afterHashes = await getTreeHashes(stateRoot);
    assert.equal(afterHashes.size, beforeHashes.size, "No files should be added or removed");
    for (const [filePath, hash] of beforeHashes.entries()) {
      assert.equal(afterHashes.get(filePath), hash, `File ${filePath} must not be mutated`);
    }
  } finally {
    await cleanup();
  }
});

test("task-wait: malformed or corrupted lease file returns LEASE_CORRUPTED", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000001";
    const digest = "c".repeat(64);
    const revision = 1;

    const runDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runDir, `${runId}.json`), JSON.stringify(runRecord, null, 2), "utf8");

    // Write malformed controller lease file in projectRoot/.alpha-aos/controller.lock
    const dotAlphaAos = join(projectRoot, ".alpha-aos");
    await mkdir(dotAlphaAos, { recursive: true });
    await writeFile(join(dotAlphaAos, "controller.lock"), "{ malformed json: ", "utf8");

    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "LEASE_CORRUPTED");
  } finally {
    await cleanup();
  }
});

test("task-wait: corrupted run record JSON on attach fails closed as EXECUTION_NOT_FOUND", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000002";
    const digest = "d".repeat(64);
    const revision = 1;

    const runDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runDir, { recursive: true });

    // Write malformed JSON into run record file
    await writeFile(join(runDir, `${runId}.json`), "{ truncated json: ", "utf8");

    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "EXECUTION_NOT_FOUND");
  } finally {
    await cleanup();
  }
});

test("task-wait: supervisor scope refuses lone terminal checkpoint without terminal journal event", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000003";
    const digest = "e".repeat(64);
    const revision = 1;

    const runDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runDir, `${runId}.json`), JSON.stringify(runRecord, null, 2), "utf8");

    // Write terminal checkpoint
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

    // Journal has an event, but NOT terminal (run_started only)
    await appendJournalEvent(stateRoot, digest, {
      kind: "run_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "LONE_CHECKPOINT_REFUSED");
  } finally {
    await cleanup();
  }
});

test("task-wait: actual acquireControllerLease positive pending->terminal transition", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000010";
    const digest = "a".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const initialRunRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(initialRunRecord, null, 2), "utf8");

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 1,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const lease = await acquireControllerLease({
      projectRoot,
      harness: "codex",
      contractDigest: digest,
    });

    const waitPromise = waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 4000,
    });

    await new Promise((r) => setTimeout(r, 60));
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_finished",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId, verdict: "accepted" },
    });
    const terminalRunRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(terminalRunRecord, null, 2), "utf8");
    await lease.release().catch(() => undefined);

    const result = await waitPromise;
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});

test("task-wait: owner replacement during terminal transition fails closed as OWNER_MISMATCH", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000011";
    const digest = "b".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const initialRunRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(initialRunRecord, null, 2), "utf8");

    const lease = await acquireControllerLease({
      projectRoot,
      harness: "codex",
      contractDigest: digest,
    });

    const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");
    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 3000,
      _onRunReadBarrier: async () => {
        const replacedLock = {
          schemaVersion: 1,
          harness: "codex",
          token: "different-hijacked-token-456",
          pid: process.pid,
          host: hostname(),
          startedAt: new Date().toISOString(),
          contractDigest: digest,
        };
        await writeFile(lockPath, JSON.stringify(replacedLock), "utf8");
        const terminalRunRecord = createRunRecord({
          contractId,
          runId,
          contractDigest: digest,
          revision,
          status: "accepted",
        });
        await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(terminalRunRecord, null, 2), "utf8");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "OWNER_MISMATCH");
    await lease.release().catch(() => undefined);
  } finally {
    await cleanup();
  }
});

test("task-wait: owner death during terminal transition resolves as OWNER_DEAD", async () => {
  const { stateRoot, projectRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000012";
    const digest = "c".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const initialRunRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(initialRunRecord, null, 2), "utf8");

    const lease = await acquireControllerLease({
      projectRoot,
      harness: "codex",
      contractDigest: digest,
    });

    const lockPath = join(projectRoot, ".alpha-aos", "controller.lock");
    const result = await waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 3000,
      _onRunReadBarrier: async () => {
        const deadLock = {
          schemaVersion: 1,
          harness: "codex",
          token: "initial-owner-token",
          pid: 99999999,
          host: hostname(),
          startedAt: new Date().toISOString(),
          contractDigest: digest,
        };
        await writeFile(lockPath, JSON.stringify(deadLock), "utf8");
        const terminalRunRecord = createRunRecord({
          contractId,
          runId,
          contractDigest: digest,
          revision,
          status: "accepted",
        });
        await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(terminalRunRecord, null, 2), "utf8");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "OWNER_DEAD");
    await lease.release().catch(() => undefined);
  } finally {
    await cleanup();
  }
});

test("task-wait: unrelated oversized run record in directory is not read and does not cause refusal", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000013";
    const digest = "d".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });

    const targetRun = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(targetRun, null, 2), "utf8");

    const padding = "x".repeat(2 * 1024 * 1024);
    await writeFile(join(runsDir, "otherrun0-00000099.json"), `{ "huge": "${padding}" }`, "utf8");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});

test("task-wait: directory junction alias in path is refused before reading run record", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000014";
    const digest = "e".repeat(64);
    const revision = 1;

    const realDir = join(stateRoot, "real-runs-store");
    await mkdir(realDir, { recursive: true });
    const targetRun = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(realDir, `${runId}.json`), JSON.stringify(targetRun, null, 2), "utf8");

    const taskDir = join(stateRoot, "tasks", contractId);
    await mkdir(taskDir, { recursive: true });
    const runsJunction = join(taskDir, "runs");
    await symlink(realDir, runsJunction, "junction");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "RUN_RECORD_INVALID");
  } finally {
    await cleanup();
  }
});

test("task-wait: swap barrier validates retained safe bytes even if file on disk mutated post-read", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000015";
    const digest = "f".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const validRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    const runFilePath = join(runsDir, `${runId}.json`);
    await writeFile(runFilePath, JSON.stringify(validRecord, null, 2), "utf8");

    let barrierFired = false;
    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
      _onRunReadBarrier: async (rawRunText) => {
        barrierFired = true;
        assert.ok(rawRunText.includes("testrun0-00000015"));
        await writeFile(runFilePath, "CORRUPTED_DISK_DATA_NOT_RE_READ", "utf8");
      },
    });

    assert.equal(barrierFired, true);
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});

test("task-wait: replacement run record exceeding byte ceiling is refused during observation", async () => {
  const { stateRoot, projectRoot, cleanup } = await createOwnedTestState("0".repeat(64));
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000016";
    const digest = "0".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const initialRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    const runFilePath = join(runsDir, `${runId}.json`);
    await writeFile(runFilePath, JSON.stringify(initialRecord, null, 2), "utf8");

    const waitPromise = waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 3000,
    });

    await new Promise((r) => setTimeout(r, 60));
    const largeRecord = {
      ...initialRecord,
      status: "accepted",
      decisions: new Array(15000).fill({ id: "y", text: "oversized-replacement-padding" }),
    };
    await writeFile(runFilePath, JSON.stringify(largeRecord), "utf8");

    const result = await waitPromise;
    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "RUN_RECORD_INVALID");
  } finally {
    await cleanup();
  }
});

test("task-wait: contradictory supervisor state (checkpoint accepted, run record rejected) fails closed", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000017";
    const digest = "1".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "rejected",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord, null, 2), "utf8");

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "accepted",
      attemptIndex: 1,
      lastSequence: 2,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "CONTRADICTORY_TERMINAL_STATE");
  } finally {
    await cleanup();
  }
});

test("task-wait: missing runId linkage in supervisor terminal event fails closed", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000018";
    const digest = "2".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const runRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(runRecord, null, 2), "utf8");

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

    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 1,
      payload: {},
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "UNSUPPORTED_SUPERVISOR_EVIDENCE");
  } finally {
    await cleanup();
  }
});

test("task-wait: earlier attempt rejection followed by properly linked acceptance in retry attempt succeeds", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId1 = "testrun0-00000019";
    const runId2 = "testrun0-00000020";
    const digest = "3".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });

    const rec1 = createRunRecord({ contractId, runId: runId1, contractDigest: digest, revision, status: "rejected" });
    await writeFile(join(runsDir, `${runId1}.json`), JSON.stringify(rec1, null, 2), "utf8");

    const rec2 = createRunRecord({ contractId, runId: runId2, contractDigest: digest, revision, status: "accepted" });
    await writeFile(join(runsDir, `${runId2}.json`), JSON.stringify(rec2, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId: runId1 },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_finished",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId: runId1, verdict: "rejected" },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 2,
      payload: { runId: runId2 },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 2,
      payload: { runId: runId2 },
    });

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "accepted",
      attemptIndex: 2,
      lastSequence: 4,
      lastVerifiedHead: null,
      usage: { cycles: 2, wallTimeMs: 25, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    const result = await waitTask({
      stateRoot,
      contractId,
      runId: runId2,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
    assert.equal(result.attemptIndex, 2);
  } finally {
    await cleanup();
  }
});

test("task-wait: genuine supported positive supervisor scope settlement", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000021";
    const digest = "4".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "accepted" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "accepted",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "accepted",
      attemptIndex: 1,
      lastSequence: 2,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 15, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "supervisor",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
    assert.equal(result.attemptIndex, 1);
  } finally {
    await cleanup();
  }
});

test("task-wait: conflicting attempt linkage in journal fails closed as CONFLICTING_ATTEMPT_LINK", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000022";
    const digest = "5".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "accepted" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 2,
      payload: { runId },
    });

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "CONFLICTING_ATTEMPT_LINK");
  } finally {
    await cleanup();
  }
});

test("task-wait: genuine later attempt association derives and returns correct attemptIndex", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000023";
    const digest = "6".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "accepted" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 3,
      payload: { runId },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_finished",
      contractDigest: digest,
      attemptIndex: 3,
      payload: { runId, verdict: "accepted" },
    });

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 3,
      lastSequence: 2,
      lastVerifiedHead: null,
      usage: { cycles: 3, wallTimeMs: 40, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 2000,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.attemptIndex, 3);
  } finally {
    await cleanup();
  }
});

test("task-wait: journal prefix rewrite detected and refused as REGRESSING_SEQUENCE", async () => {
  const { stateRoot, projectRoot, cleanup } = await createOwnedTestState("7".repeat(64));
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000024";
    const digest = "7".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "executing" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "run_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const jPath = runJournalPath(stateRoot, digest);

    let observed = false;
    const result = await waitTask({
      stateRoot, projectRoot, contractId, runId, contractDigest: digest, revision,
      scope: "attempt", timeoutMs: 8000,
      _onJournalReadBarrier: async () => {
        if (observed) return;
        observed = true;
        const rewrittenEvent = {
          sequence: 1, timestamp: new Date().toISOString(), kind: "run_started",
          contractDigest: digest, attemptIndex: 1, payload: { runId, tampered: true },
        };
        await writeFile(jPath, `${JSON.stringify(rewrittenEvent)}\n`, "utf8");
      },
    });
    assert.equal(observed, true, "Mutation requires a retained validated journal prefix");
    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "REGRESSING_SEQUENCE");
  } finally {
    await cleanup();
  }
});

test("task-wait: journal file deletion after observation refused as REGRESSING_SEQUENCE", async () => {
  const { stateRoot, projectRoot, cleanup } = await createOwnedTestState("8".repeat(64));
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000025";
    const digest = "8".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "executing" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    await appendJournalEvent(stateRoot, digest, {
      kind: "run_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const jPath = runJournalPath(stateRoot, digest);

    let observed = false;
    const result = await waitTask({
      stateRoot, projectRoot, contractId, runId, contractDigest: digest, revision,
      scope: "attempt", timeoutMs: 8000,
      _onJournalReadBarrier: async () => {
        if (observed) return;
        observed = true;
        await rm(jPath, { force: true });
      },
    });
    assert.equal(observed, true, "Mutation requires a retained validated journal prefix");
    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "REGRESSING_SEQUENCE");
  } finally {
    await cleanup();
  }
});

test("task-wait: journal sequence gap fails closed as REGRESSING_SEQUENCE", async () => {
  const { stateRoot, cleanup } = await createTestState();
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000026";
    const digest = "9".repeat(64);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const rec = createRunRecord({ contractId, runId, contractDigest: digest, revision, status: "accepted" });
    await writeFile(join(runsDir, `${runId}.json`), JSON.stringify(rec, null, 2), "utf8");

    const jPath = runJournalPath(stateRoot, digest);
    await mkdir(dirname(jPath), { recursive: true });
    const ev1 = { sequence: 1, timestamp: new Date().toISOString(), kind: "attempt_started", contractDigest: digest, attemptIndex: 1, payload: { runId } };
    const evGap = { sequence: 3, timestamp: new Date().toISOString(), kind: "accepted", contractDigest: digest, attemptIndex: 1, payload: { runId } };
    await writeFile(jPath, `${JSON.stringify(ev1)}\n${JSON.stringify(evGap)}\n`, "utf8");

    const result = await waitTask({
      stateRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "REGRESSING_SEQUENCE");
  } finally {
    await cleanup();
  }
});

test("task-wait: TRUE second pending reread with lagging checkpoint completes successfully", async () => {
  const { stateRoot, projectRoot, cleanup } = await createOwnedTestState("a1".repeat(32));
  try {
    const contractId = "test-task";
    const runId = "testrun0-00000027";
    const digest = "a1".repeat(32);
    const revision = 1;

    const runsDir = join(stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    const initialRunRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "executing",
    });
    const runFilePath = join(runsDir, `${runId}.json`);
    await writeFile(runFilePath, JSON.stringify(initialRunRecord, null, 2), "utf8");

    const checkpoint: TaskCheckpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId,
      revision,
      status: "running",
      attemptIndex: 1,
      lastSequence: 0,
      lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 10, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: new Date().toISOString(),
    };
    await writeCheckpoint(stateRoot, checkpoint);

    await appendJournalEvent(stateRoot, digest, {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });
    await appendJournalEvent(stateRoot, digest, {
      kind: "run_started",
      contractDigest: digest,
      attemptIndex: 1,
      payload: { runId },
    });

    const waitPromise = waitTask({
      stateRoot,
      projectRoot,
      contractId,
      runId,
      contractDigest: digest,
      revision,
      scope: "attempt",
      timeoutMs: 4000,
    });

    await new Promise((r) => setTimeout(r, 80));
    const terminalRecord = createRunRecord({
      contractId,
      runId,
      contractDigest: digest,
      revision,
      status: "accepted",
    });
    await writeFile(runFilePath, JSON.stringify(terminalRecord, null, 2), "utf8");

    const result = await waitPromise;
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
  } finally {
    await cleanup();
  }
});


test("task-wait: real superviseTask journal including index zero settles exact accepted run", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);
  await approveTaskContract({
    contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot,
  });
  const result = await superviseTask({
    contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fixturePorts({
      controller: referenceControllerPort("correct"), reviewer: staticReviewerPort(passingReview),
    }),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.equal(result.status, "accepted", JSON.stringify(result.checkpoint));
  const events = await readJournalEvents(fixture.stateRoot, digest);
  assert.equal(events[0]?.kind, "run_started");
  assert.equal(events[0]?.attemptIndex, 0);
  const runId = events.find((event) => event.kind === "accepted")?.payload.runId;
  assert.ok(typeof runId === "string");
  const observed = await waitTask({
    stateRoot: fixture.stateRoot, projectRoot: fixture.projectRoot,
    contractId: contract.id, runId, contractDigest: digest, revision: contract.revision,
    scope: "supervisor", timeoutMs: 2000,
  });
  assert.equal(observed.ok, true);
  assert.equal(observed.status, "completed");
  assert.equal(observed.taskStatus, "accepted");
  assert.equal(observed.attemptIndex, 1);
});

async function terminalWaitFixture(options: {
  status: "accepted" | "rejected" | "blocked" | "stopped";
  kind: TaskJournalEventKind;
  payload: Record<string, unknown>;
  attemptIndex?: number;
  runStatus?: "accepted" | "rejected" | "blocked" | "stopped";
  priorStart?: boolean;
}) {
  const fixture = await createTestState();
  const contractId = "test-task", runId = "testrun0-00000031", digest = "b1".repeat(32);
  const attemptIndex = options.attemptIndex ?? 1;
  try {
    const runsDir = join(fixture.stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, runId + ".json"), JSON.stringify(createRunRecord({
      contractId, runId, contractDigest: digest, revision: 1,
      status: options.runStatus ?? options.status,
    })), "utf8");
    if (options.priorStart) {
      await appendJournalEvent(fixture.stateRoot, digest, {
        kind: "attempt_started", contractDigest: digest, attemptIndex, payload: { runId },
      });
    }
    await appendJournalEvent(fixture.stateRoot, digest, {
      kind: options.kind, contractDigest: digest, attemptIndex, payload: options.payload,
    });
    await writeCheckpoint(fixture.stateRoot, {
      schemaVersion: 1, contractId, contractDigest: digest, revision: 1,
      status: options.status, attemptIndex, lastSequence: options.priorStart ? 2 : 1,
      lastVerifiedHead: null, usage: { cycles: attemptIndex, wallTimeMs: 1, tokens: null, costUsd: null },
      stopReason: null, updatedAt: new Date().toISOString(),
    });
    return await waitTask({
      stateRoot: fixture.stateRoot, projectRoot: fixture.projectRoot, contractId, runId,
      contractDigest: digest, revision: 1, scope: "supervisor", timeoutMs: 1000,
    });
  } finally {
    await fixture.cleanup();
  }
}

test("task-wait: every supervisor terminal disposition refuses a different run and identifies missing legacy proof", async () => {
  for (const status of ["rejected", "blocked", "stopped"] as const) {
    const kind = status === "stopped" ? "process_cancelled" : status;
    const wrong = await terminalWaitFixture({
      status, kind, payload: { runId: "testrun0-00000032" },
    });
    assert.equal(wrong.ok, false, status);
    assert.equal(wrong.status, "refused", status);
    assert.equal(wrong.reasonCode, "UNLINKED_CHECKPOINT", status);
    const missing = await terminalWaitFixture({ status, kind, payload: {} });
    assert.equal(missing.ok, false, status);
    assert.equal(missing.status, "unresolved", status);
    assert.equal(missing.reasonCode, "UNSUPPORTED_SUPERVISOR_EVIDENCE", status);
  }
});

test("task-wait: supervisor stop uses proved preceding run association without inventing a stopped run", async () => {
  const result = await terminalWaitFixture({
    status: "stopped", runStatus: "rejected", kind: "limit_exceeded",
    payload: { stopCode: "cycle_limit_exceeded" }, priorStart: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.taskStatus, "stopped");
  assert.equal(result.attemptIndex, 1);
});

test("task-wait: nonaccepted supervisor dispositions cannot contradict a canonical accepted run", async () => {
  for (const status of ["rejected", "blocked", "stopped"] as const) {
    const result = await terminalWaitFixture({
      status, runStatus: "accepted", kind: status === "stopped" ? "process_cancelled" : status,
      payload: { runId: "testrun0-00000031" },
    });
    assert.equal(result.ok, false, status);
    assert.equal(result.status, "refused", status);
    assert.equal(result.reasonCode, "CONTRADICTORY_TERMINAL_STATE", status);
  }
});

test("task-wait: zero indices distinguish supervisor lifecycle events from attempt evidence", async () => {
  const invalid = await terminalWaitFixture({
    status: "stopped", kind: "attempt_started", attemptIndex: 0,
    payload: { runId: "testrun0-00000031" },
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.status, "refused");
  assert.equal(invalid.reasonCode, "CORRUPTED_JOURNAL");
  for (const kind of ["process_cancelled", "limit_exceeded"] as const) {
    const lifecycle = await terminalWaitFixture({ status: "stopped", kind, attemptIndex: 0, payload: {} });
    assert.equal(lifecycle.ok, false);
    assert.equal(lifecycle.status, "unresolved");
    assert.equal(lifecycle.reasonCode, "UNSUPPORTED_SUPERVISOR_EVIDENCE");
    assert.equal(lifecycle.attemptIndex, undefined);
  }
});

test("task-wait: terminal evidence payloads reject malformed verdict and stop reason", async () => {
  for (const payload of [
    { runId: "testrun0-00000031", verdict: "invented" },
    { runId: "testrun0-00000031", verdict: "accepted", stopReason: { invalid: true } },
  ]) {
    const result = await terminalWaitFixture({ status: "accepted", kind: "attempt_finished", payload });
    assert.equal(result.ok, false);
    assert.equal(result.status, "refused");
    assert.equal(result.reasonCode, "CORRUPTED_JOURNAL");
  }
});

test("task-wait: canonical terminal receipt without journal omits unproved attempt index", async () => {
  const fixture = await createTestState();
  try {
    const contractId = "test-task", runId = "testrun0-00000033", digest = "b2".repeat(32);
    const runsDir = join(fixture.stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, runId + ".json"), JSON.stringify(createRunRecord({
      contractId, runId, contractDigest: digest, revision: 1, status: "accepted",
    })), "utf8");
    await writeCheckpoint(fixture.stateRoot, {
      schemaVersion: 1, contractId, contractDigest: digest, revision: 1,
      status: "accepted", attemptIndex: 1, lastSequence: 0, lastVerifiedHead: null,
      usage: { cycles: 1, wallTimeMs: 1, tokens: null, costUsd: null },
      stopReason: null, updatedAt: new Date().toISOString(),
    });
    const result = await waitTask({
      stateRoot: fixture.stateRoot, projectRoot: fixture.projectRoot, contractId, runId,
      contractDigest: digest, revision: 1, scope: "attempt", timeoutMs: 1000,
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.taskStatus, "accepted");
    assert.equal(Object.hasOwn(result, "attemptIndex"), false);
  } finally {
    await fixture.cleanup();
  }
});

test("task-wait: ownerless nonterminal execution resolves OWNER_ABSENT before deadline", async () => {
  const fixture = await createTestState();
  try {
    const contractId = "test-task", runId = "testrun0-00000034", digest = "b3".repeat(32);
    const runsDir = join(fixture.stateRoot, "tasks", contractId, "runs");
    await mkdir(runsDir, { recursive: true });
    await writeFile(join(runsDir, runId + ".json"), JSON.stringify(createRunRecord({
      contractId, runId, contractDigest: digest, revision: 1, status: "executing",
    })), "utf8");
    await appendJournalEvent(fixture.stateRoot, digest, {
      kind: "attempt_started", contractDigest: digest, attemptIndex: 1, payload: { runId },
    });
    const result = await waitTask({
      stateRoot: fixture.stateRoot, projectRoot: fixture.projectRoot, contractId, runId,
      contractDigest: digest, revision: 1, scope: "attempt",
      timeoutMs: 10000, signal: AbortSignal.timeout(1000),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "unresolved");
    assert.equal(result.reasonCode, "OWNER_ABSENT");
  } finally {
    await fixture.cleanup();
  }
});


async function provenOriginRetryFixture(options: {
  scope?: "attempt" | "supervisor";
  mutation?: "missing-chain" | "wrong-run" | "missing-run-id" | "foreign-owner" | "rotated-owner" | "accepted-origin";
  running?: boolean;
} = {}) {
  const fixture = await createTestState();
  const contractId = "test-linked-origin-retry";
  const digest = "c2".repeat(32);
  const origin = "testrun0-00000041";
  const final = "testrun0-00000042";
  let lease = await acquireControllerLease({ projectRoot: fixture.projectRoot, harness: "codex", contractDigest: digest });
  try {
    const runs = join(fixture.stateRoot, "tasks", contractId, "runs");
    await mkdir(runs, { recursive: true });
    const originStatus = options.mutation === "accepted-origin" ? "accepted" :
      options.mutation === "rotated-owner" ? "executing" : "rejected";
    await writeFile(join(runs, origin + ".json"), JSON.stringify(createRunRecord({
      contractId, runId: origin, contractDigest: digest, revision: 1, status: originStatus,
    })));
    await writeFile(join(runs, final + ".json"), JSON.stringify(createRunRecord({
      contractId, runId: final, contractDigest: digest, revision: 1, status: options.running ? "executing" : "accepted",
    })));
    const journal: { kind: TaskJournalEventKind; attemptIndex: number; payload: Record<string, unknown> }[] = [
      { kind: "attempt_started", attemptIndex: 1, payload: { runId: origin } },
      ...options.mutation === "missing-chain" ? [] : [
        { kind: "attempt_finished" as const, attemptIndex: 1, payload: { runId: origin, verdict: "rejected" } },
      ],
      { kind: "attempt_started", attemptIndex: 2, payload: options.mutation === "missing-run-id" ? { stage: "retry" } :
        { runId: options.mutation === "wrong-run" ? "testrun0-00000043" : final } },
      ...options.running ? [] : [
        { kind: "accepted" as const, attemptIndex: 2, payload: { runId: final } },
      ],
    ];
    for (const event of journal) {
      await appendJournalEvent(fixture.stateRoot, digest, { ...event, contractDigest: digest });
    }
    await writeCheckpoint(fixture.stateRoot, {
      schemaVersion: 1, contractDigest: digest, contractId, revision: 1,
      status: options.running ? "running" : "accepted", attemptIndex: 2, lastSequence: journal.length,
      lastVerifiedHead: null, usage: { cycles: 2, wallTimeMs: 25, tokens: null, costUsd: null },
      stopReason: null, updatedAt: new Date().toISOString(),
    });
    if (options.mutation === "foreign-owner") {
      const path = join(fixture.projectRoot, ".alpha-aos", "controller.lock");
      const record = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      await writeFile(path, JSON.stringify({ ...record, host: "another-review-host" }));
    }
    let rotated = false;
    return await waitTask({
      stateRoot: fixture.stateRoot, projectRoot: fixture.projectRoot,
      contractId, runId: origin, contractDigest: digest, revision: 1,
      scope: options.scope ?? "supervisor", timeoutMs: options.running ? 100 : 1000,
      ...(options.mutation === "rotated-owner" ? {
        _onJournalReadBarrier: async () => {
          if (rotated) return;
          rotated = true;
          await lease.release();
          lease = await acquireControllerLease({ projectRoot: fixture.projectRoot, harness: "codex", contractDigest: digest });
        },
      } : {}),
    });
  } finally {
    try { await lease.release(); } finally { await fixture.cleanup(); }
  }
}

test("task-wait: supervisor follows only a fully proven same-controller retry from origin run", async () => {
  const result = await provenOriginRetryFixture();
  assert.equal(result.status, "completed");
  assert.equal(result.taskStatus, "accepted");
  assert.equal(result.runId, "testrun0-00000041");
  assert.equal(result.observedRunId, "testrun0-00000042");
  assert.equal(result.attemptIndex, 2);
});

test("task-wait: attempt scope remains the exact origin despite a proven accepted retry", async () => {
  const result = await provenOriginRetryFixture({ scope: "attempt" });
  assert.equal(result.status, "completed");
  assert.equal(result.taskStatus, "rejected");
  assert.equal(result.runId, "testrun0-00000041");
  assert.equal(result.observedRunId, undefined);
  assert.equal(result.attemptIndex, 1);
});

test("task-wait: fully proven running retry remains pending instead of unsupported", async () => {
  const result = await provenOriginRetryFixture({ running: true });
  assert.equal(result.status, "timeout");
  assert.equal(result.reasonCode, undefined);
});

for (const [mutation, code] of [
  ["missing-chain", "UNSUPPORTED_SUPERVISOR_EVIDENCE"],
  ["missing-run-id", "UNSUPPORTED_SUPERVISOR_EVIDENCE"],
  ["wrong-run", "UNLINKED_CHECKPOINT"],
  ["foreign-owner", "FOREIGN_OWNER"],
  ["rotated-owner", "OWNER_MISMATCH"],
  ["accepted-origin", "CONTRADICTORY_TERMINAL_STATE"],
] as const) {
  test("task-wait: origin retry refuses " + mutation, async () => {
    const result = await provenOriginRetryFixture({ mutation });
    assert.equal(result.ok, false);
    assert.equal(result.reasonCode, code);
  });
}
