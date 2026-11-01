import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyFileTransaction,
  rollbackFileTransaction,
  rollbackManagedTransaction,
  type PolicyOperationMetadata,
} from "../src/core/transaction.js";

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
    // The path proof refuses before the writer lock is taken, so the refusal
    // names the boundary that failed rather than a generic message.
    /outside-configured-root|outside allowed roots/u,
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

test("policy transaction first-create rollback unlinks behavior.json and preserves .alpha-aos and siblings", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-policy-create-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const dotAlphaAos = join(projectRoot, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });
  const siblingFile = join(dotAlphaAos, "stack.yaml");
  await writeFile(siblingFile, "trusted: true\n");

  const lstats = await lstat(projectRoot, { bigint: true });
  const policyMeta: PolicyOperationMetadata = {
    kind: "project-mode",
    canonicalRoot: projectRoot,
    rootIdentity: {
      deviceExact: lstats.dev.toString(),
      inodeExact: lstats.ino.toString(),
    },
    policyRelativePath: ".alpha-aos/behavior.json",
  };

  const policyFile = join(projectRoot, ".alpha-aos", "behavior.json");
  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [dotAlphaAos],
    policyOperation: policyMeta,
    operations: [{ target: policyFile, content: '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n' }],
  });

  assert.equal(journal.status, "applied");
  assert.equal(existsSync(policyFile), true);
  assert.equal(existsSync(siblingFile), true);

  const rolledBack = await rollbackManagedTransaction(stateRoot, journal.id);
  assert.equal(rolledBack.status, "rolled-back");
  assert.equal(existsSync(policyFile), false, "behavior.json must be unlinked");
  assert.equal(existsSync(dotAlphaAos), true, ".alpha-aos directory must NOT be swept");
  assert.equal(existsSync(siblingFile), true, "sibling file must remain intact");
  assert.equal(await readFile(siblingFile, "utf8"), "trusted: true\n");
});

test("policy transaction replacement rollback restores exact CRLF and Unicode bytes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-policy-replace-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const dotAlphaAos = join(projectRoot, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });

  const exactOriginalBytes = Buffer.from('{\r\n  "schemaVersion": 1,\r\n  "mode": "strict",\r\n  "unicode": "프로젝트-한글"\r\n}\r\n', "utf8");
  const policyFile = join(dotAlphaAos, "behavior.json");
  await writeFile(policyFile, exactOriginalBytes);

  const lstats = await lstat(projectRoot, { bigint: true });
  const policyMeta: PolicyOperationMetadata = {
    kind: "project-mode",
    canonicalRoot: projectRoot,
    rootIdentity: {
      deviceExact: lstats.dev.toString(),
      inodeExact: lstats.ino.toString(),
    },
    policyRelativePath: ".alpha-aos/behavior.json",
  };

  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [dotAlphaAos],
    policyOperation: policyMeta,
    operations: [{ target: policyFile, content: '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n' }],
  });

  assert.equal(journal.status, "applied");
  assert.notDeepEqual(await readFile(policyFile), exactOriginalBytes);

  const rolledBack = await rollbackManagedTransaction(stateRoot, journal.id);
  assert.equal(rolledBack.status, "rolled-back");
  const restoredBytes = await readFile(policyFile);
  assert.deepEqual(restoredBytes, exactOriginalBytes, "restored bytes must match exact CRLF and Unicode byte-for-byte");
});

test("policy transaction rollback refuses when snapshot hash is corrupt", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-policy-corrupt-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const projectRoot = join(root, "project");
  const stateRoot = join(root, "state");
  const dotAlphaAos = join(projectRoot, ".alpha-aos");
  await mkdir(dotAlphaAos, { recursive: true });

  const policyFile = join(dotAlphaAos, "behavior.json");
  await writeFile(policyFile, '{\n  "schemaVersion": 1,\n  "mode": "strict"\n}\n');

  const lstats = await lstat(projectRoot, { bigint: true });
  const policyMeta: PolicyOperationMetadata = {
    kind: "project-mode",
    canonicalRoot: projectRoot,
    rootIdentity: {
      deviceExact: lstats.dev.toString(),
      inodeExact: lstats.ino.toString(),
    },
    policyRelativePath: ".alpha-aos/behavior.json",
  };

  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [dotAlphaAos],
    policyOperation: policyMeta,
    operations: [{ target: policyFile, content: '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n' }],
  });

  const snapshotFile = journal.files[0]!.snapshot!;
  await writeFile(snapshotFile, "corrupted snapshot bytes\n");

  await assert.rejects(
    () => rollbackManagedTransaction(stateRoot, journal.id),
    /snapshot hash mismatch/u,
  );
  assert.equal(await readFile(policyFile, "utf8"), '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n');
});

test("journal with malformed policyOperation metadata is rejected and refuses fallback", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-policy-malformed-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const journalRoot = join(stateRoot, "journal");
  await mkdir(journalRoot, { recursive: true });

  const badJournal = {
    schemaVersion: 1,
    id: "bad-policy-journal",
    createdAt: new Date().toISOString(),
    status: "applied",
    allowedRoots: [join(root, "project", ".alpha-aos")],
    files: [
      {
        target: join(root, "project", ".alpha-aos", "behavior.json"),
        existed: false,
        snapshot: null,
        beforeHash: null,
        afterHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        proofDigest: "abc",
      },
    ],
    policyOperation: {
      kind: "project-mode",
      canonicalRoot: join(root, "project"),
      // missing rootIdentity!
      policyRelativePath: ".alpha-aos/behavior.json",
    },
  };

  await writeFile(join(journalRoot, "bad-policy-journal.json"), JSON.stringify(badJournal, null, 2));

  await assert.rejects(
    () => rollbackManagedTransaction(stateRoot, "bad-policy-journal"),
    /Transaction journal is invalid: bad-policy-journal/u,
  );
});
