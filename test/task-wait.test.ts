import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir, hostname } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { waitTask } from "../src/core/task-wait.js";
import { selectTaskExecution } from "../src/core/task-read.js";
import { writeCheckpoint, appendJournalEvent, type TaskCheckpoint } from "../src/core/task-journal.js";

async function createTestState(): Promise<{ stateRoot: string; projectRoot: string; cleanup: () => Promise<void> }> {
  const base = join(tmpdir(), `test-task-wait-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
      contractId,
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

    // Live controller lock for supervisor
    const dotAlphaAos = join(projectRoot, ".alpha-aos");
    await mkdir(dotAlphaAos, { recursive: true });
    const lockRecord = {
      schemaVersion: 1,
      harness: "codex" as const,
      contractDigest: digest,
      contractId,
      pid: process.pid,
      host: hostname(),
      token: "valid-supervisor-token",
      startedAt: new Date().toISOString(),
    };
    await writeFile(join(dotAlphaAos, "controller.lock"), JSON.stringify(lockRecord), "utf8");

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
