import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gitCommand } from "./helpers/git-fixture.js";
import {
  createEffectLedger,
  generateEffectKey,
  reconcileEffectEvidence,
  reconcileLedgerOnRecovery,
  recordEffectState,
  type EffectLedgerEntry,
  type TaskEffectLedger,
} from "../src/core/task-effects.js";

test("generateEffectKey is deterministic and independent of payload key order", () => {
  const digest = "contract-digest-123";
  const attemptIndex = 0;
  const effectType = "workspace-write";

  const payload1 = {
    relPath: "src/index.ts",
    beforeSha256: "aaa111",
    afterSha256: "bbb222",
    nested: { b: 2, a: 1 },
  };

  const payload2 = {
    nested: { a: 1, b: 2 },
    afterSha256: "bbb222",
    relPath: "src/index.ts",
    beforeSha256: "aaa111",
  };

  const key1 = generateEffectKey(digest, attemptIndex, effectType, payload1);
  const key2 = generateEffectKey(digest, attemptIndex, effectType, payload2);

  assert.equal(key1.length, 64);
  assert.equal(key1, key2);

  // Different attempt index produces different key
  const key3 = generateEffectKey(digest, 1, effectType, payload1);
  assert.notEqual(key1, key3);

  // Different payload produces different key
  const key4 = generateEffectKey(digest, attemptIndex, effectType, { ...payload1, afterSha256: "ccc333" });
  assert.notEqual(key1, key4);
});

test("recordEffectState enforces strict state transitions and rejects illegal moves", () => {
  const ledger = createEffectLedger("digest-1");
  const effectKey = "effect-key-01";

  // Rejects invalid initial status
  assert.throws(
    () =>
      recordEffectState(ledger, {
        effectKey,
        contractDigest: "digest-1",
        attemptIndex: 0,
        effectType: "workspace-write",
        targetPayload: {},
        status: "applied",
        startedAt: new Date().toISOString(),
        completedAt: null,
      }),
    /Initial effect state must be "planned" or "performing"/u,
  );

  // Valid initial: planned
  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest: "digest-1",
    attemptIndex: 0,
    effectType: "workspace-write",
    targetPayload: {},
    status: "planned",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  recordEffectState(ledger, entry);
  assert.equal(ledger.entries[effectKey]?.status, "planned");

  // planned -> performing
  entry.status = "performing";
  recordEffectState(ledger, entry);
  assert.equal(ledger.entries[effectKey]?.status, "performing");

  // performing -> applied
  entry.status = "applied";
  entry.completedAt = new Date().toISOString();
  recordEffectState(ledger, entry);
  assert.equal(ledger.entries[effectKey]?.status, "applied");

  // applied -> planned is forbidden
  entry.status = "planned";
  assert.throws(
    () => recordEffectState(ledger, entry),
    /Invalid effect state transition from "applied" to "planned"/u,
  );
});

test("recordEffectState allows uncertain state transitions", () => {
  const ledger = createEffectLedger("digest-2");
  const effectKey = "effect-key-uncertain";

  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest: "digest-2",
    attemptIndex: 0,
    effectType: "local-commit",
    targetPayload: {},
    status: "planned",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  recordEffectState(ledger, entry);

  entry.status = "performing";
  recordEffectState(ledger, entry);

  entry.status = "uncertain";
  recordEffectState(ledger, entry);
  assert.equal(ledger.entries[effectKey]?.status, "uncertain");

  // uncertain -> unknown is allowed
  entry.status = "unknown";
  recordEffectState(ledger, entry);
  assert.equal(ledger.entries[effectKey]?.status, "unknown");
});

test("reconcileEffectEvidence reconciles workspace-write effects deterministically", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-effects-ws-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const testFile = "src/hello.txt";
  await mkdir(join(dir, "src"), { recursive: true });

  const beforeContent = "version 1\n";
  const beforeSha256 = createHash("sha256").update(beforeContent).digest("hex");

  const afterContent = "version 2\n";
  const afterSha256 = createHash("sha256").update(afterContent).digest("hex");

  // 1. File matches beforeSha256 -> not-applied
  await writeFile(join(dir, testFile), beforeContent, "utf8");
  const entry: EffectLedgerEntry = {
    effectKey: "ws-1",
    contractDigest: "digest-ws",
    attemptIndex: 0,
    effectType: "workspace-write",
    targetPayload: { relPath: testFile, beforeSha256, afterSha256 },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  const res1 = await reconcileEffectEvidence(dir, "HEAD", entry);
  assert.equal(res1.status, "not-applied");

  // 2. File matches afterSha256 -> applied
  await writeFile(join(dir, testFile), afterContent, "utf8");
  const res2 = await reconcileEffectEvidence(dir, "HEAD", entry);
  assert.equal(res2.status, "applied");

  // 3. File has unexpected content -> unknown
  await writeFile(join(dir, testFile), "corrupted\n", "utf8");
  const res3 = await reconcileEffectEvidence(dir, "HEAD", entry);
  assert.equal(res3.status, "unknown");
  assert.ok(res3.reason);
});

test("reconcileEffectEvidence reconciles local-commit effects via git log", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-effects-git-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  // Initialize a real git repo
  gitCommand(dir, ["init"]);
  gitCommand(dir, ["config", "user.name", "Test User"]);
  gitCommand(dir, ["config", "user.email", "test@example.com"]);

  await writeFile(join(dir, "init.txt"), "initial\n");
  gitCommand(dir, ["add", "init.txt"]);
  gitCommand(dir, ["commit", "-m", "initial commit"]);

  const baseCommitRes = gitCommand(dir, ["rev-parse", "HEAD"]);
  const baseCommit = baseCommitRes.stdout.trim();

  const entry: EffectLedgerEntry = {
    effectKey: "git-1",
    contractDigest: "digest-git",
    attemptIndex: 0,
    effectType: "local-commit",
    targetPayload: { expectedSubject: "feat: add feature X" },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  // No commits made yet -> not-applied
  const res1 = await reconcileEffectEvidence(dir, baseCommit, entry);
  assert.equal(res1.status, "not-applied");

  // Make the expected commit
  await writeFile(join(dir, "feat.txt"), "feature\n");
  gitCommand(dir, ["add", "feat.txt"]);
  gitCommand(dir, ["commit", "-m", "feat: add feature X"]);

  // Now commit exists in log -> applied
  const res2 = await reconcileEffectEvidence(dir, baseCommit, entry);
  assert.equal(res2.status, "applied");

  // Entry expecting a different subject -> unknown
  const otherEntry: EffectLedgerEntry = {
    ...entry,
    effectKey: "git-2",
    targetPayload: { expectedSubject: "non-existent commit message" },
  };
  const res3 = await reconcileEffectEvidence(dir, baseCommit, otherEntry);
  assert.equal(res3.status, "unknown");
});

test("reconcileLedgerOnRecovery updates performing and uncertain entries and identifies unknown blockers", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-effects-rec-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  await writeFile(join(dir, "file1.txt"), "after content\n");
  const afterSha256 = createHash("sha256").update("after content\n").digest("hex");

  const ledger: TaskEffectLedger = {
    schemaVersion: 1,
    contractDigest: "digest-rec",
    entries: {
      "key-1": {
        effectKey: "key-1",
        contractDigest: "digest-rec",
        attemptIndex: 0,
        effectType: "workspace-write",
        targetPayload: { relPath: "file1.txt", afterSha256 },
        status: "performing",
        startedAt: new Date().toISOString(),
        completedAt: null,
      },
      "key-2": {
        effectKey: "key-2",
        contractDigest: "digest-rec",
        attemptIndex: 0,
        effectType: "workspace-write",
        targetPayload: { relPath: "missing.txt", beforeSha256: "some-hash", afterSha256: "other-hash" },
        status: "uncertain",
        startedAt: new Date().toISOString(),
        completedAt: null,
      },
    },
  };

  const recovery = await reconcileLedgerOnRecovery(dir, "HEAD", ledger);
  assert.equal(recovery.hasUnknown, true);
  assert.equal(recovery.unknownEffects.length, 1);
  assert.equal(recovery.unknownEffects[0]!.effectKey, "key-2");

  assert.equal(ledger.entries["key-1"]!.status, "applied");
  assert.equal(ledger.entries["key-1"]!.evidence, "source-evidence-reconciled");
  assert.equal(ledger.entries["key-2"]!.status, "unknown");
});

test("reconcileEffectEvidence reconciles dependency-change effects", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-effects-dep-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  gitCommand(dir, ["init"]);
  gitCommand(dir, ["config", "user.name", "Test User"]);
  gitCommand(dir, ["config", "user.email", "test@example.com"]);

  const initialPkg = JSON.stringify({ name: "my-pkg", dependencies: { foo: "1.0.0" } }, null, 2);
  await writeFile(join(dir, "package.json"), initialPkg, "utf8");
  gitCommand(dir, ["add", "package.json"]);
  gitCommand(dir, ["commit", "-m", "initial pkg"]);

  const baseCommitRes = gitCommand(dir, ["rev-parse", "HEAD"]);
  const baseCommit = baseCommitRes.stdout.trim();

  const entry: EffectLedgerEntry = {
    effectKey: "dep-1",
    contractDigest: "digest-dep",
    attemptIndex: 0,
    effectType: "dependency-change",
    targetPayload: { manifestPath: "package.json" },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  // 1. No change in dependencies yet -> not-applied
  const res1 = await reconcileEffectEvidence(dir, baseCommit, entry);
  assert.equal(res1.status, "not-applied");

  // 2. Change dependencies
  const updatedPkg = JSON.stringify({ name: "my-pkg", dependencies: { foo: "2.0.0" } }, null, 2);
  await writeFile(join(dir, "package.json"), updatedPkg, "utf8");

  const res2 = await reconcileEffectEvidence(dir, baseCommit, entry);
  assert.equal(res2.status, "applied");
});

test("reconcileEffectEvidence fails closed with unknown on missing required relPath", async () => {
  const entry: EffectLedgerEntry = {
    effectKey: "ws-invalid",
    contractDigest: "digest-err",
    attemptIndex: 0,
    effectType: "workspace-write",
    targetPayload: {},
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const res = await reconcileEffectEvidence("C:/non-existent", "HEAD", entry);
  assert.equal(res.status, "unknown");
  assert.ok(res.reason?.includes("relPath missing"));
});

test("reconcileEffectEvidence fails closed with unknown on unsupported effectType", async () => {
  const entry: any = {
    effectKey: "unsupported-1",
    contractDigest: "digest-unsupported",
    attemptIndex: 0,
    effectType: "external-network-call",
    targetPayload: {},
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const res = await reconcileEffectEvidence("C:/non-existent", "HEAD", entry);
  assert.equal(res.status, "unknown");
  assert.ok(res.reason?.includes("Unsupported effect type"));
});

test("recordEffectState is idempotent for same status updates", () => {
  const ledger = createEffectLedger("digest-idem");
  const entry: EffectLedgerEntry = {
    effectKey: "k-idem",
    contractDigest: "digest-idem",
    attemptIndex: 0,
    effectType: "workspace-write",
    targetPayload: { foo: 1 },
    status: "planned",
    startedAt: "2026-10-01T00:00:00Z",
    completedAt: null,
  };

  recordEffectState(ledger, entry);
  // Re-recording identical status
  recordEffectState(ledger, { ...entry, evidence: "some-evidence" });
  assert.equal(ledger.entries["k-idem"]?.status, "planned");
  assert.equal(ledger.entries["k-idem"]?.evidence, "some-evidence");
});
