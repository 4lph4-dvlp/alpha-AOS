import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRedactionContext } from "../src/core/redaction.js";
import {
  appendJournalEvent,
  readCheckpoint,
  readJournalEvents,
  runCheckpointPath,
  runDirectory,
  runJournalPath,
  writeCheckpoint,
  type TaskCheckpoint,
} from "../src/core/task-journal.js";

test("runDirectory, runJournalPath, and runCheckpointPath produce normalized paths", () => {
  const stateRoot = "D:/dev/state";
  const digest = "abc123def456";

  const dir = runDirectory(stateRoot, digest);
  assert.equal(dir, "D:/dev/state/runs/abc123def456");

  const journal = runJournalPath(stateRoot, digest);
  assert.equal(journal, "D:/dev/state/runs/abc123def456/journal.jsonl");

  const checkpoint = runCheckpointPath(stateRoot, digest);
  assert.equal(checkpoint, "D:/dev/state/runs/abc123def456/checkpoint.json");
});

test("readJournalEvents returns empty array when journal does not exist", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-journal-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const events = await readJournalEvents(root, "non-existent-digest");
  assert.deepEqual(events, []);
});

test("appendJournalEvent writes monotonically increasing sequence numbers with fsync", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-journal-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-1";

  const ev1 = await appendJournalEvent(root, digest, {
    kind: "run_started",
    contractDigest: digest,
    attemptIndex: 0,
    payload: { info: "first attempt" },
  });
  assert.equal(ev1.sequence, 1);
  assert.equal(ev1.kind, "run_started");
  assert.ok(ev1.timestamp);

  const ev2 = await appendJournalEvent(root, digest, {
    kind: "attempt_started",
    contractDigest: digest,
    attemptIndex: 0,
    payload: { info: "starting work" },
  });
  assert.equal(ev2.sequence, 2);

  const ev3 = await appendJournalEvent(root, digest, {
    kind: "attempt_finished",
    contractDigest: digest,
    attemptIndex: 0,
    payload: { status: "success" },
  });
  assert.equal(ev3.sequence, 3);

  const readBack = await readJournalEvents(root, digest);
  assert.equal(readBack.length, 3);
  assert.equal(readBack[0]!.sequence, 1);
  assert.equal(readBack[1]!.sequence, 2);
  assert.equal(readBack[2]!.sequence, 3);
});

test("appendJournalEvent redacts sensitive secrets in payload", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-journal-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-secrets";
  const customSecret = "super-secret-password-xyz";
  const redactionContext = createRedactionContext({ secrets: [customSecret] });

  await appendJournalEvent(
    root,
    digest,
    {
      kind: "attempt_started",
      contractDigest: digest,
      attemptIndex: 0,
      payload: {
        token: "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
        custom: customSecret,
        nested: {
          key: "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890",
        },
      },
    },
    redactionContext,
  );

  const events = await readJournalEvents(root, digest);
  assert.equal(events.length, 1);
  const payload = events[0]!.payload as Record<string, unknown>;
  const rawFile = await readFile(runJournalPath(root, digest), "utf8");

  assert.ok(!rawFile.includes(customSecret), "Raw file must not contain exact secret");
  assert.ok(!rawFile.includes("ghp_1234567890abcdefghijklmnopqrstuvwxyz"), "Raw file must not contain github token");
  assert.ok(!rawFile.includes("sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890"), "Raw file must not contain Anthropic key");
  assert.ok(rawFile.includes("[redacted:"), "Raw file must contain redaction placeholders");
});

test("appendJournalEvent caps stdout and stderr at 64KB with sha256 summary", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-journal-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-output-cap";

  // Generate 100KB stdout string
  const largeOutput = "A".repeat(100 * 1024);

  await appendJournalEvent(root, digest, {
    kind: "attempt_finished",
    contractDigest: digest,
    attemptIndex: 0,
    payload: {
      stdout: largeOutput,
      stderr: "small error message",
    },
  });

  const events = await readJournalEvents(root, digest);
  assert.equal(events.length, 1);
  const payload = events[0]!.payload as Record<string, any>;

  assert.ok(payload.stdout, "stdout must be present");
  assert.equal(payload.stdout.capped, true);
  assert.equal(payload.stdout.totalBytes, 100 * 1024);
  assert.equal(Buffer.byteLength(payload.stdout.excerpt, "utf8"), 65536);
  assert.ok(payload.stdout.sha256 && payload.stdout.sha256.length === 64);

  assert.ok(payload.stderr, "stderr must be present");
  assert.equal(payload.stderr.capped, false);
  assert.equal(payload.stderr.excerpt, "small error message");
});

test("readJournalEvents throws error on corrupted or torn lines", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-journal-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-corrupt";

  await appendJournalEvent(root, digest, {
    kind: "run_started",
    contractDigest: digest,
    attemptIndex: 0,
    payload: { info: "valid line" },
  });

  // Append a torn/corrupt line
  const journalPath = runJournalPath(root, digest);
  const currentContent = await readFile(journalPath, "utf8");
  await writeFile(journalPath, `${currentContent}{"sequence": 2, "timestamp": "2026-10-01", "kind": "attempt_started", "unclosed\n`);

  await assert.rejects(
    () => readJournalEvents(root, digest),
    /Corrupted journal entry/u,
  );
});

test("readCheckpoint returns null when checkpoint does not exist", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-checkpoint-"));
  context.after(async () => rm(root, { recursive: true, force: true }));

  const checkpoint = await readCheckpoint(root, "missing-contract-digest");
  assert.equal(checkpoint, null);
});

test("writeCheckpoint and readCheckpoint handle atomic round-trip and validation", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-checkpoint-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-cp";

  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "task-001",
    revision: 1,
    status: "running",
    attemptIndex: 0,
    lastSequence: 4,
    lastVerifiedHead: "abc1234",
    usage: {
      cycles: 1,
      wallTimeMs: 12000,
      tokens: 4500,
      costUsd: 0.05,
    },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };

  await writeCheckpoint(root, checkpoint);

  const loaded = await readCheckpoint(root, digest);
  assert.ok(loaded);
  assert.equal(loaded.schemaVersion, 1);
  assert.equal(loaded.contractDigest, digest);
  assert.equal(loaded.status, "running");
  assert.equal(loaded.lastSequence, 4);
  assert.equal(loaded.usage.cycles, 1);
  assert.equal(loaded.usage.costUsd, 0.05);

  // Update status and re-save
  const updated: TaskCheckpoint = {
    ...loaded,
    status: "accepted",
    revision: 2,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(root, updated);

  const loaded2 = await readCheckpoint(root, digest);
  assert.ok(loaded2);
  assert.equal(loaded2.revision, 2);
  assert.equal(loaded2.status, "accepted");
});

test("readCheckpoint rejects unsupported schemaVersion", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-checkpoint-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-digest-invalid-schema";

  const checkpoint: any = {
    schemaVersion: 99,
    contractDigest: digest,
    contractId: "task-001",
    revision: 1,
    status: "running",
    attemptIndex: 0,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 0, wallTimeMs: 0, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };

  await writeCheckpoint(root, checkpoint);

  await assert.rejects(
    () => readCheckpoint(root, digest),
    /Unsupported checkpoint schemaVersion: 99/u,
  );
});

test("verifies run state is strictly in stateRoot runs/ and does not write to project repository", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-boundary-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const digest = "contract-boundary-test";

  const dir = runDirectory(root, digest);
  assert.ok(dir.startsWith(root.replaceAll("\\", "/")), "Directory must be rooted under stateRoot");
  assert.ok(dir.includes("/runs/"), "Directory must be under runs subfolder");
});
