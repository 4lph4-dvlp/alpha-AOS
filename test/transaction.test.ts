import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyFileTransaction, rollbackFileTransaction, rollbackManagedTransaction } from "../src/core/transaction.js";

test("transaction restores existing bytes and removes files it created", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-transaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);
  const existing = join(targetRoot, "settings.json");
  const created = join(targetRoot, "skills", "alpha-aos", "SKILL.md");
  const original = Buffer.from([0, 1, 2, 3, 255]);
  await writeFile(existing, original);

  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [
      { target: existing, content: "changed\n" },
      { target: created, content: "new\n" },
    ],
  });
  assert.equal(journal.status, "applied");
  assert.equal(await readFile(existing, "utf8"), "changed\n");
  assert.equal(await readFile(created, "utf8"), "new\n");

  const rolledBack = await rollbackFileTransaction(stateRoot, journal.id, [targetRoot]);
  assert.equal(rolledBack.status, "rolled-back");
  assert.deepEqual(await readFile(existing), original);
  await assert.rejects(() => readFile(created), { code: "ENOENT" });
});

test("transaction rejects paths outside its ownership roots", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-transaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const allowed = join(root, "allowed");
  await mkdir(allowed);
  await assert.rejects(
    () => applyFileTransaction({
      stateRoot: join(root, "state"),
      allowedRoots: [allowed],
      operations: [{ target: join(root, "outside.txt"), content: "blocked" }],
    }),
    /outside allowed roots/u,
  );
});

test("managed rollback refuses to overwrite post-transaction edits", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-transaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  await mkdir(targetRoot);
  const target = join(targetRoot, "settings.json");
  await writeFile(target, "original\n");
  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [targetRoot],
    operations: [{ target, content: "managed\n" }],
  });
  await writeFile(target, "user edit\n");

  await assert.rejects(() => rollbackManagedTransaction(stateRoot, journal.id), /post-transaction drift/u);
  assert.equal(await readFile(target, "utf8"), "user edit\n");
});

test("transactional removal can be restored byte-for-byte", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-transaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetRoot = join(root, "target");
  const stateRoot = join(root, "state");
  const target = join(targetRoot, "legacy.txt");
  await mkdir(targetRoot);
  await writeFile(target, "legacy bytes\n");
  const journal = await applyFileTransaction({ stateRoot, allowedRoots: [targetRoot], operations: [{ target, content: null }] });
  await assert.rejects(() => readFile(target), { code: "ENOENT" });
  await rollbackManagedTransaction(stateRoot, journal.id);
  assert.equal(await readFile(target, "utf8"), "legacy bytes\n");
});
