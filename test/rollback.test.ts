import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyFileTransaction,
  generateUnifiedDiff,
  planManagedRollback,
  rollbackFileTransaction,
  rollbackManagedTransaction,
  sweepReverseDirectories,
  RollbackDriftError,
} from "../src/core/transaction.js";
import { formatDriftDiagnostics } from "../src/format.js";

test("all-or-nothing preflight refusal on drift performs zero writes (LIFE-05, D-05)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-rollback-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);

  const file1 = join(targetRoot, "file1.txt");
  const file2 = join(targetRoot, "file2.txt");
  const file3 = join(targetRoot, "file3.txt");

  await writeFile(file1, "file1 original\n");
  await writeFile(file2, "file2 original\n");
  await writeFile(file3, "file3 original\n");

  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [
      { target: file1, content: "file1 managed\n" },
      { target: file2, content: "file2 managed\n" },
      { target: file3, content: "file3 managed\n" },
    ],
  });
  assert.equal(journal.status, "applied");

  // Tamper with only file2 (external modification/drift)
  await writeFile(file2, "file2 user edit\n");

  // Attempt rollback; must throw RollbackDriftError before ANY file is modified
  let caughtError: unknown;
  try {
    await rollbackFileTransaction(stateRoot, journal.id, [targetRoot]);
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError instanceof RollbackDriftError, "Must throw RollbackDriftError");
  assert.equal(caughtError.diagnostics.length, 1);
  assert.equal(caughtError.diagnostics[0]?.target, file2);

  // All-or-nothing invariant: files 1 and 3 must NOT have been rolled back!
  // They must still contain the managed content from the transaction.
  assert.equal(await readFile(file1, "utf8"), "file1 managed\n");
  assert.equal(await readFile(file2, "utf8"), "file2 user edit\n");
  assert.equal(await readFile(file3, "utf8"), "file3 managed\n");
});

test("drift diagnostics emit exact paths, hashes, unified diffs, and manual guidance (LIFE-05, D-06)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-rollback-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);

  const target = join(targetRoot, "config.toml");
  await writeFile(target, "mode = \"default\"\n");

  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target, content: "mode = \"managed\"\n" }],
  });

  // User alters content
  await writeFile(target, "mode = \"custom-edit\"\n");

  let caughtError: unknown;
  try {
    await rollbackFileTransaction(stateRoot, journal.id, [targetRoot]);
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError instanceof RollbackDriftError);
  const diag = caughtError.diagnostics[0];
  assert.ok(diag);
  assert.equal(diag.target, target);
  assert.ok(diag.expectedHash);
  assert.ok(diag.actualHash);
  assert.notEqual(diag.expectedHash, diag.actualHash);
  assert.ok(diag.remediation.includes("Reconcile file manually or restore from snapshot"));

  // Check unified diff structure
  assert.ok(diag.unifiedDiff);
  assert.ok(diag.unifiedDiff.includes("--- a/config.toml"));
  assert.ok(diag.unifiedDiff.includes("+++ b/config.toml"));
  assert.ok(diag.unifiedDiff.includes("@@"));

  // Check formatDriftDiagnostics text
  const formatted = formatDriftDiagnostics(caughtError.diagnostics);
  assert.ok(formatted.includes("Rollback Drift Error"));
  assert.ok(formatted.includes("Zero file writes performed"));
  assert.ok(formatted.includes(target));
  assert.ok(formatted.includes("Unified Diff snippet:"));
});

test("strict LIFO ordering enforcement prevents non-head rollback (LIFE-05, D-07)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-rollback-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);

  const fileA = join(targetRoot, "fileA.txt");
  const fileB = join(targetRoot, "fileB.txt");

  // Transaction A
  const journalA = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target: fileA, content: "content A\n" }],
  });

  // Wait a moment so createdAt timestamp advances
  await new Promise((resolve) => setTimeout(resolve, 10));

  // Transaction B
  const journalB = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target: fileB, content: "content B\n" }],
  });

  assert.equal(journalA.status, "applied");
  assert.equal(journalB.status, "applied");

  // Attempt to roll back transaction A while transaction B is head
  await assert.rejects(
    () => planManagedRollback(stateRoot, journalA.id),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("LIFO violation"));
      assert.ok(err.message.includes(journalB.id));
      return true;
    },
  );

  // Rolling back head (transaction B) succeeds
  const rolledBackB = await rollbackManagedTransaction(stateRoot, journalB.id);
  assert.equal(rolledBackB.status, "rolled-back");
  assert.equal(existsSync(fileB), false);

  // Now transaction A is head, and rolling it back succeeds
  const rolledBackA = await rollbackManagedTransaction(stateRoot, journalA.id);
  assert.equal(rolledBackA.status, "rolled-back");
  assert.equal(existsSync(fileA), false);
});

test("clean reverse directory sweep removes only empty parent directories (LIFE-05, D-08)", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-rollback-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);

  // Case 1: All parent dirs created solely for this file are empty after rollback
  const fileInDeepDir = join(targetRoot, "sub1", "sub2", "sub3", "created.txt");
  const journal1 = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target: fileInDeepDir, content: "deep file\n" }],
  });
  assert.equal(journal1.status, "applied");
  assert.ok(existsSync(fileInDeepDir));
  assert.ok(existsSync(join(targetRoot, "sub1", "sub2", "sub3")));

  await rollbackFileTransaction(stateRoot, journal1.id, [targetRoot]);
  assert.ok(!existsSync(fileInDeepDir));
  // Empty parent directories sub3, sub2, sub1 should have been swept
  assert.ok(!existsSync(join(targetRoot, "sub1", "sub2", "sub3")));
  assert.ok(!existsSync(join(targetRoot, "sub1", "sub2")));
  assert.ok(!existsSync(join(targetRoot, "sub1")));
  // The allowed targetRoot itself must NOT be removed
  assert.ok(existsSync(targetRoot));

  // Case 2: Parent directory contains a user file; sweep must halt at non-empty directory
  const userFile = join(targetRoot, "subA", "user-file.txt");
  await mkdir(join(targetRoot, "subA"), { recursive: true });
  await writeFile(userFile, "user content\n");

  const managedDeepFile = join(targetRoot, "subA", "subB", "managed.txt");
  const journal2 = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target: managedDeepFile, content: "managed content\n" }],
  });
  assert.equal(journal2.status, "applied");
  assert.ok(existsSync(managedDeepFile));

  await rollbackFileTransaction(stateRoot, journal2.id, [targetRoot]);
  assert.ok(!existsSync(managedDeepFile));
  // subB was empty after managed.txt removal, so it should be swept
  assert.ok(!existsSync(join(targetRoot, "subA", "subB")));
  // subA contains user-file.txt, so subA and user-file.txt must be preserved!
  assert.ok(existsSync(join(targetRoot, "subA")));
  assert.ok(existsSync(userFile));
});
