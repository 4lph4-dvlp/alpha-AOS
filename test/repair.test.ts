import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyCrashRepair, planCrashRepair, quarantineJournal } from "../src/core/repair.js";
import type { TransactionJournal } from "../src/core/transaction.js";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("snapshot crash repair safely restores pre-crash baseline and marks repaired (LIFE-06, D-09, D-10)", async (context) => {
  const tempDir = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  context.after(async () => rm(tempDir, { recursive: true, force: true }));

  const stateRoot = join(tempDir, "state");
  const targetDir = join(tempDir, "target");
  const journalDir = join(stateRoot, "journal");
  const snapshotDir = join(stateRoot, "snapshots", "tx-crash-001");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(targetDir, { recursive: true });
  await mkdir(journalDir, { recursive: true });
  await mkdir(snapshotDir, { recursive: true });

  const targetFile = join(targetDir, "file.txt");
  const baselineContent = "original pre-crash content\n";
  const crashedContent = "partially written corrupted content\n";
  const baselineHash = sha256(baselineContent);

  // Write the crashed state to target file
  await writeFile(targetFile, crashedContent, "utf8");

  // Save the pre-state snapshot
  const snapshotPath = join(snapshotDir, "file.txt.snap");
  await writeFile(snapshotPath, baselineContent, "utf8");

  // Write applying journal
  const journal: TransactionJournal = {
    schemaVersion: 1,
    id: "tx-crash-001",
    createdAt: new Date().toISOString(),
    status: "applying",
    allowedRoots: [targetDir],
    files: [
      {
        target: targetFile,
        existed: true,
        snapshot: snapshotPath,
        beforeHash: baselineHash,
        afterHash: sha256(crashedContent),
        proofDigest: "proof-1",
      },
    ],
  };
  const journalPath = join(journalDir, "tx-crash-001.json");
  await writeFile(journalPath, JSON.stringify(journal, null, 2), "utf8");

  // Put a stale writer lock with dead PID
  const writerLockPath = join(stateRoot, "writer.lock");
  await writeFile(
    writerLockPath,
    JSON.stringify({ schemaVersion: 1, pid: 9999999, startedAt: new Date().toISOString(), owner: "interrupted" }),
    "utf8",
  );

  // Plan repair
  const plan = await planCrashRepair(stateRoot);
  assert.equal(plan.action, "snapshot-rollback");
  assert.equal(plan.operationId, "tx-crash-001");
  assert.equal(plan.snapshotsIntact, true);
  assert.deepEqual(plan.affectedFiles, [targetFile]);
  assert.equal(plan.blockedReasons.length, 0);

  // Apply repair
  const result = await applyCrashRepair(stateRoot, plan.planDigest);
  assert.equal(result.lockReleased, true);
  assert.deepEqual(result.restoredFiles, [targetFile]);

  // Target file is restored to baseline!
  const restoredContent = await readFile(targetFile, "utf8");
  assert.equal(restoredContent, baselineContent);

  // Journal is marked repaired
  const updatedJournal = JSON.parse(await readFile(journalPath, "utf8")) as TransactionJournal;
  assert.equal(updatedJournal.status, "repaired");
  assert.ok(updatedJournal.repairedAt);

  // Writer lock is released
  assert.equal(existsSync(writerLockPath), false);
});

test("repair refuses when writer process is still alive (LIFE-06, D-12)", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-active-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  // Put a writer lock with current process PID
  const writerLockPath = join(stateRoot, "writer.lock");
  await writeFile(
    writerLockPath,
    JSON.stringify({ schemaVersion: 1, pid: process.pid, startedAt: new Date().toISOString(), owner: "active-process" }),
    "utf8",
  );

  const plan = await planCrashRepair(stateRoot);
  assert.equal(plan.writerAlive, true);
  assert.ok(plan.blockedReasons.length > 0);
  assert.match(plan.blockedReasons[0]!, /is still active; repair refused/u);

  await assert.rejects(
    () => applyCrashRepair(stateRoot, plan.planDigest),
    /Crash repair refused/u,
  );
});

test("stale writer lock with dead process is released (LIFE-06, D-12)", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-stale-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  const writerLockPath = join(stateRoot, "writer.lock");
  await writeFile(
    writerLockPath,
    JSON.stringify({ schemaVersion: 1, pid: 9999999, startedAt: new Date().toISOString(), owner: "stale" }),
    "utf8",
  );

  const plan = await planCrashRepair(stateRoot);
  assert.equal(plan.action, "release-only");
  assert.equal(plan.writerAlive, false);
  assert.equal(plan.blockedReasons.length, 0);

  const result = await applyCrashRepair(stateRoot, plan.planDigest);
  assert.equal(result.lockReleased, true);
  assert.equal(existsSync(writerLockPath), false);
});

test("corrupt journal is quarantined to unblock operations (LIFE-06, D-11)", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-corrupt-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });

  const badJournalPath = join(journalDir, "tx-corrupt.json");
  await writeFile(badJournalPath, "{ truncated unparseable json...", "utf8");

  const plan = await planCrashRepair(stateRoot);
  assert.equal(plan.action, "quarantine");
  assert.equal(plan.journalPath, badJournalPath);

  const result = await applyCrashRepair(stateRoot, plan.planDigest);
  assert.ok(result.quarantinedJournal);
  assert.equal(existsSync(badJournalPath), false);
  assert.ok(existsSync(result.quarantinedJournal));
  assert.match(result.quarantinedJournal, /\.corrupt\.\d+$/u);
});

test("incomplete journal with missing snapshots is quarantined (LIFE-06, D-11)", async (context) => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-missing-snap-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));

  const journalDir = join(stateRoot, "journal");
  await mkdir(journalDir, { recursive: true });

  const journal: TransactionJournal = {
    schemaVersion: 1,
    id: "tx-missing-snap",
    createdAt: new Date().toISOString(),
    status: "applying",
    allowedRoots: ["/dummy"],
    files: [
      {
        target: "/dummy/file.txt",
        existed: true,
        snapshot: join(stateRoot, "snapshots", "non-existent.snap"),
        beforeHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        afterHash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
        proofDigest: "p1",
      },
    ],
  };

  const journalPath = join(journalDir, "tx-missing-snap.json");
  await writeFile(journalPath, JSON.stringify(journal, null, 2), "utf8");

  const plan = await planCrashRepair(stateRoot);
  assert.equal(plan.action, "quarantine");
  assert.equal(plan.snapshotsIntact, false);

  const result = await applyCrashRepair(stateRoot, plan.planDigest);
  assert.ok(result.quarantinedJournal);
  assert.equal(existsSync(journalPath), false);
  assert.ok(existsSync(result.quarantinedJournal));
});
