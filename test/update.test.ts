import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import {
  applyBootstrapOperation,
  BootstrapRefusal,
  BUILD_ARTIFACT_MANIFEST,
  createBootstrapOperationPlan,
} from "../src/core/bootstrap.js";
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

/** A checkout with a local bare origin, so remote resolution needs no network. */
async function checkoutFixture(context: test.TestContext): Promise<{ root: string; origin: string; stateRoot: string }> {
  const base = await mkdtemp(join(tmpdir(), "alpha-aos-checkout-"));
  context.after(async () => rm(base, { recursive: true, force: true }));
  const origin = join(base, "origin.git");
  const root = join(base, "work");
  await mkdir(root, { recursive: true });

  const run = async (cwd: string, args: string[]): Promise<void> => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  };
  await run(base, ["init", "--bare", "--initial-branch=main", origin]);
  await run(root, ["init", "--initial-branch=main"]);
  await run(root, ["config", "user.email", "fixture@example.invalid"]);
  await run(root, ["config", "user.name", "fixture"]);
  await writeFile(join(root, "README.md"), "fixture\n", "utf8");
  await run(root, ["add", "."]);
  await run(root, ["commit", "-m", "initial"]);
  await run(root, ["remote", "add", "origin", origin]);
  await run(root, ["push", "-u", "origin", "main"]);

  // The artifact and lock a bootstrap preflight binds.
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", private: true }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "package-lock.json"), `${JSON.stringify({ name: "fixture", version: "1.0.0", lockfileVersion: 3 }, null, 2)}\n`, "utf8");
  await mkdir(join(root, "dist"), { recursive: true });
  await writeFile(join(root, "dist", "cli.js"), "// built\n", "utf8");
  const hash = async (relative: string): Promise<string> =>
    createHash("sha256").update(await readFile(join(root, relative))).digest("hex");
  await writeFile(join(root, BUILD_ARTIFACT_MANIFEST), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    inputs: { "package.json": await hash("package.json") },
    outputs: { "dist/cli.js": await hash(join("dist", "cli.js")) },
  }, null, 2)}\n`, "utf8");
  await run(root, ["add", "."]);
  await run(root, ["commit", "-m", "artifact"]);
  await run(root, ["push"]);
  return { root, origin, stateRoot: join(base, "state") };
}

test("an update preflight binds the exact resolved remote commit without touching the checkout", async (context) => {
  const fixture = await checkoutFixture(context);
  const options = { operation: "update" as const, root: fixture.root, stateRoot: fixture.stateRoot, skipLink: true, ref: "refs/heads/main" };

  const plan = await createBootstrapOperationPlan(options);
  assert.ok(plan.checkout);
  assert.match(plan.checkout.head ?? "", /^[0-9a-f]{40}$/u);
  assert.equal(plan.checkout.dirty, false);
  assert.equal(plan.checkout.targetOid, plan.checkout.head, "HEAD is already the pushed commit");
  assert.equal(plan.checkout.targetObjectPresent, true);
  assert.equal(plan.checkout.fastForward, true);
  assert.deepEqual(plan.blockedReasons, []);

  // The reviewed step names the object id, not a ref that could move.
  const merge = plan.external.find((step) => step.id === "git-merge-ff-only");
  assert.ok(merge);
  assert.equal(merge.spec.args.includes(plan.checkout.targetOid as string), true);
  assert.equal((await createBootstrapOperationPlan(options)).digest, plan.digest, "preflight is digest-stable");
});

test("a dirty checkout blocks an update before any external step is declared runnable", async (context) => {
  const fixture = await checkoutFixture(context);
  await writeFile(join(fixture.root, "README.md"), "edited\n", "utf8");
  const plan = await createBootstrapOperationPlan({
    operation: "update",
    root: fixture.root,
    stateRoot: fixture.stateRoot,
    skipLink: true,
    ref: "refs/heads/main",
  });
  assert.equal(plan.checkout?.dirty, true);
  assert.equal(plan.blockedReasons.some((reason) => reason.includes("uncommitted changes")), true);
  await assert.rejects(() => applyBootstrapOperation(plan), BootstrapRefusal);
  assert.equal(await readFile(join(fixture.root, "README.md"), "utf8"), "edited\n");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});

test("an update refuses a target source object it cannot inspect locally", async (context) => {
  const fixture = await checkoutFixture(context);
  const second = join(fixture.root, "..", "second");
  const run = (cwd: string, args: string[]): void => {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
    if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  };
  run(join(fixture.root, ".."), ["clone", fixture.origin, second]);
  run(second, ["config", "user.email", "fixture@example.invalid"]);
  run(second, ["config", "user.name", "fixture"]);
  await writeFile(join(second, "NEW.md"), "advanced\n", "utf8");
  run(second, ["add", "."]);
  run(second, ["commit", "-m", "advance"]);
  run(second, ["push"]);

  // The original checkout can resolve the new commit but has never fetched it.
  const plan = await createBootstrapOperationPlan({
    operation: "update",
    root: fixture.root,
    stateRoot: fixture.stateRoot,
    skipLink: true,
    ref: "refs/heads/main",
  });
  assert.ok(plan.checkout?.targetOid);
  assert.equal(plan.checkout.targetObjectPresent, false);
  assert.equal(plan.blockedReasons.some((reason) => reason.includes("not present locally")), true);
  assert.equal(plan.blockedReasons.some((reason) => reason.includes("git fetch")), true, "the refusal says what a human must do");

  await assert.rejects(() => applyBootstrapOperation(plan), BootstrapRefusal);
  assert.equal(existsSync(join(fixture.root, "NEW.md")), false, "a refused update does not advance the checkout");
  assert.equal(existsSync(writerLockPath(fixture.stateRoot)), false);
});
