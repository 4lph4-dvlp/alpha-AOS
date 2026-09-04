import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  candidateLockPath,
  hasVersionChanges,
  planCandidateStage,
  renderCandidate,
  writeCandidate,
} from "../src/core/update.js";
import { ComponentPlanError } from "../src/core/component-session.js";
import { listManagedTransactions } from "../src/core/transaction.js";
import { acquireMutationSession, inspectWriterState, writerLockPath } from "../src/core/writer-lock.js";
import type { StackLock } from "../src/types.js";

function lock(gsdVersion: string, contextVersion: string): StackLock {
  return {
    schemaVersion: 1,
    channel: "stable",
    generatedAt: null,
    components: {
      gsd: { package: "@opengsd/gsd-core", version: gsdVersion, integrity: "sha512-gsd", profile: "standard" },
      ecc: { package: "ecc-universal", version: "2.2.0", integrity: "sha512-ecc", skills: [], sourceSha256: {}, targetSha256: {} },
      mcp: { context7: { package: "context7", version: contextVersion, integrity: "sha512-context" } },
      mcpBridges: { pi: { package: "bridge", version: "1.0.0", integrity: "sha512-bridge" } },
    },
  };
}

test("candidate staging ignores timestamps and detects component version changes", () => {
  const current = lock("1.12.0", "4.0.4");
  const same = { ...lock("1.12.0", "4.0.4"), channel: "candidate" as const, generatedAt: new Date().toISOString() };
  assert.equal(hasVersionChanges(current, same), false);
  assert.equal(hasVersionChanges(current, lock("1.13.0", "4.0.4")), true);
  assert.equal(hasVersionChanges(current, lock("1.12.0", "4.1.0")), true);
});

async function stageFixture(context: test.TestContext): Promise<{ root: string; stateRoot: string; target: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-candidate-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "catalog"), { recursive: true });
  return { root, stateRoot: join(root, "state"), target: candidateLockPath(root) };
}

test("the reviewed candidate stage names its path roles and writes nothing", async (context) => {
  const fixture = await stageFixture(context);
  const candidate = { ...lock("1.13.0", "4.0.4"), channel: "candidate" as const };

  const plan = await planCandidateStage(fixture.root, candidate, { stateRoot: fixture.stateRoot });
  assert.equal(plan.proofs.proven, true);
  for (const role of ["target", "state", "journal", "snapshot", "package-root"] as const) {
    assert.ok(plan.proofs.get(role), `plan must declare the ${role} role`);
  }
  assert.equal(plan.action, "create");
  assert.equal(plan.currentHash, null);
  assert.equal(plan.renderedHash.length, 64);
  assert.equal(existsSync(fixture.target), false, "planning writes nothing");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "planning takes no writer");
});

test("candidate staging journals the write, is idempotent, and releases its writer", async (context) => {
  const fixture = await stageFixture(context);
  const candidate = { ...lock("1.13.0", "4.0.4"), channel: "candidate" as const };

  const first = await writeCandidate(fixture.root, candidate, { stateRoot: fixture.stateRoot });
  assert.ok(first);
  assert.equal(await readFile(fixture.target, "utf8"), renderCandidate(candidate));
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false, "a standalone stage releases the writer it took");

  const second = await writeCandidate(fixture.root, candidate, { stateRoot: fixture.stateRoot });
  assert.equal(second, null, "an unchanged candidate is not rewritten");

  // Replacing a staged candidate snapshots the previous one rather than
  // renaming over it.
  const next = { ...lock("1.14.0", "4.0.4"), channel: "candidate" as const };
  const third = await writeCandidate(fixture.root, next, { stateRoot: fixture.stateRoot });
  assert.ok(third);
  const journals = await listManagedTransactions(fixture.stateRoot);
  const replacement = journals.find((journal) => journal.id === third);
  assert.ok(replacement);
  assert.equal(replacement.files[0]?.snapshot !== null, true, "the previous candidate is snapshotted");
  assert.equal(await readFile(fixture.target, "utf8"), renderCandidate(next));
});

test("a nested candidate stage consumes the caller session and takes no second writer lock", async (context) => {
  const fixture = await stageFixture(context);
  const candidate = { ...lock("1.13.0", "4.0.4"), channel: "candidate" as const };
  const plan = await planCandidateStage(fixture.root, candidate, { stateRoot: fixture.stateRoot });

  const session = await acquireMutationSession({
    stateRoot: fixture.stateRoot,
    proofs: plan.proofs,
    planDigest: plan.digest,
  });
  let closed = false;
  context.after(async () => {
    if (!closed) await session.close();
  });

  // The writer lock is exclusive-create, so a second acquisition would fail here.
  const operationId = await writeCandidate(fixture.root, candidate, { plan, session, stateRoot: fixture.stateRoot });
  assert.equal(operationId, session.operationId);
  assert.equal(await readFile(fixture.target, "utf8"), renderCandidate(candidate));
  assert.equal((await inspectWriterState(fixture.stateRoot)).status, "active");
  await session.close();
  closed = true;
});

test("a candidate plan reviewed before the staged file changed refuses and writes nothing", async (context) => {
  const fixture = await stageFixture(context);
  const candidate = { ...lock("1.13.0", "4.0.4"), channel: "candidate" as const };
  const plan = await planCandidateStage(fixture.root, candidate, { stateRoot: fixture.stateRoot });

  const interfering = "{\n  \"staged\": \"by something else\"\n}\n";
  await writeFile(fixture.target, interfering, "utf8");

  await assert.rejects(
    () => writeCandidate(fixture.root, candidate, { plan, stateRoot: fixture.stateRoot }),
    (error: unknown) => {
      assert.ok(error instanceof ComponentPlanError);
      assert.equal(error.code, "plan-drift");
      return true;
    },
  );
  assert.equal(await readFile(fixture.target, "utf8"), interfering, "a refused stage leaves the file alone");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});
