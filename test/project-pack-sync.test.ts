// Plan 03-01 tracer: one approved pack lands in one project, through one transaction.
//
// The seam under test is the WRITER half of the project-pack lifecycle: the
// approved `.alpha-aos/plan.json` artifact, the lock-pinned source bytes, the
// single `applyFileTransaction` that carries both the skill writes and the
// receipt writes, and the receipt Phase 2's reader has been waiting for.
//
// The suite is offline by construction. Every run supplies a `verifiedSourceRoot`
// and a package root the test owns, so no `npm pack` of `ecc-universal` is ever
// reached and a local ECC upgrade cannot change what these assertions mean.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadLock } from "../src/core/catalog.js";
import { applyProjectPackSync, planProjectPackSync } from "../src/core/project-pack-sync.js";
import { formatProjectPackSync } from "../src/format.js";
import {
  approveProjectPlan,
  classifyPlanDrift,
  planProjectCapabilities,
  PROJECT_RECEIPT_DIRECTORY,
  resolvePackSource,
} from "../src/core/project-plan.js";
import { listManagedTransactions, rollbackManagedTransaction } from "../src/core/transaction.js";
import type { HarnessId, ProjectCapabilityPlan } from "../src/types.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");
const packSyncModule = pathToFileURL(join(repositoryRoot, "dist", "src", "core", "project-pack-sync.js")).href;

/** The one pack a bare `react` dependency selects, and the one skill it declares. */
const PACK_ID = "WEB_REACT";
const PACK_SKILL = "frontend-a11y";
const CLAUDE_TARGET = `.claude/skills/${PACK_SKILL}/SKILL.md`;
const RECEIPT_PATH = `${PROJECT_RECEIPT_DIRECTORY}/${PACK_ID}.json`;

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

interface SyncFixture {
  /** The project directory a plan is computed for. */
  readonly root: string;
  /** Managed state: journal, snapshots and the writer lock. */
  readonly stateRoot: string;
  /** A package root the test owns, so its lock can pin the fixture's bytes. */
  readonly packageRoot: string;
  /** `<sourceRoot>/<skill>/SKILL.md`, the verified tree the writer reads. */
  readonly sourceRoot: string;
  readonly sourceBody: string;
  readonly sourceHash: string;
}

async function scratch(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-packsync-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

/**
 * A project that selects exactly one pack, plus a package root whose lock pins
 * the bytes of a source tree this test wrote.
 *
 * Rewriting the copied lock is what keeps the suite offline AND honest: the
 * writer still refuses anything whose hash is not the pinned one, and the
 * pinned one is now a value the test can produce.
 */
async function syncFixture(context: TestContext, label: string): Promise<SyncFixture> {
  const root = await scratch(context, `${label}-project`);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "pack-sync-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const support = await scratch(context, `${label}-support`);
  const stateRoot = join(support, "state");
  const packageRoot = join(support, "package-root");
  await cp(join(repositoryRoot, "catalog"), join(packageRoot, "catalog"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(packageRoot, "schemas"), { recursive: true });

  const sourceRoot = join(support, "source");
  const sourceBody = `---\nname: ${PACK_SKILL}\n---\n\n# frontend accessibility, fixture bytes\n`;
  await mkdir(join(sourceRoot, PACK_SKILL), { recursive: true });
  await writeFile(join(sourceRoot, PACK_SKILL, "SKILL.md"), sourceBody, "utf8");
  const sourceHash = sha256(sourceBody);

  const lockPath = join(packageRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  assert.equal(
    typeof lock.components.ecc.sourceSha256[PACK_SKILL],
    "string",
    `catalog/stack.lock.json carries no sourceSha256 for ${PACK_SKILL}`,
  );
  lock.components.ecc.sourceSha256[PACK_SKILL] = sourceHash;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  return { root, stateRoot, packageRoot, sourceRoot, sourceBody, sourceHash };
}

/** Computes the plan and approves it. One reviewed decision, exactly as a user makes it. */
async function approve(fixture: SyncFixture): Promise<void> {
  const plan = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.deepEqual(plan.applicable, [PACK_ID], "the fixture no longer selects exactly one pack");
  const approved = await approveProjectPlan({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    expectedDigest: plan.planDigest,
  });
  assert.equal(approved.status, "written");
}

/** Every file under a project root, as sorted `[relative posix path, sha256]` pairs. */
async function snapshotProject(root: string): Promise<Array<[string, string]>> {
  const entries: Array<[string, string]> = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(absolute, relativePath);
      else if (entry.isFile()) entries.push([relativePath, sha256(await readFile(absolute))]);
    }
  }
  await walk(root, "");
  return entries.sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
}

export { approve, PACK_ID, PACK_SKILL, RECEIPT_PATH, sha256, snapshotProject, syncFixture, type SyncFixture };

test("one approved pack's SKILL.md and its receipt both land, written by one transaction", async (context) => {
  const fixture = await syncFixture(context, "tracer");
  await approve(fixture);

  const result = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(result.status, "written");
  assert.equal(typeof result.operationId, "string");
  assert.deepEqual(result.packs, [PACK_ID]);
  assert.deepEqual(result.receipts, [RECEIPT_PATH]);
  assert.ok(result.written.includes(CLAUDE_TARGET), `the claude target was not written: ${result.written.join(", ")}`);

  // The bytes are the LOCKED bytes, not merely some bytes: the hash asserted
  // here is the one `resolvePackSource` returns, which is what makes this an
  // exact-hash materialization rather than a copy.
  const lock = await loadLock(fixture.packageRoot);
  const expected = resolvePackSource(lock, PACK_ID, PACK_SKILL).sourceSha256;
  const written = join(fixture.root, ...CLAUDE_TARGET.split("/"));
  assert.equal(existsSync(written), true, `${CLAUDE_TARGET} was not written`);
  assert.equal(sha256(await readFile(written)), expected, `${CLAUDE_TARGET} does not hash to the locked source hash`);

  const receiptFile = join(fixture.root, ...RECEIPT_PATH.split("/"));
  assert.equal(existsSync(receiptFile), true, `${RECEIPT_PATH} was not written`);
  const receipt = JSON.parse(await readFile(receiptFile, "utf8")) as {
    packId: string;
    producer: { name: string; version: string };
    evidenceHash: string;
    targets: Array<{ harness: HarnessId; path: string; targetHash: string }>;
  };
  assert.equal(receipt.packId, PACK_ID);
  assert.equal(receipt.producer.name, "alpha-aos");
  assert.equal(receipt.targets.length, result.written.length);
  for (const target of receipt.targets) {
    assert.equal(target.targetHash, expected, `${target.path} recorded a hash other than the locked source hash`);
  }

  // A user must be able to see exactly which bytes entered their project and
  // how to take them back out, so the rendering names every path, the
  // transaction id, and the command that reverses it.
  const rendered = formatProjectPackSync(result);
  for (const path of [...result.written, ...result.receipts]) {
    assert.ok(rendered.includes(path), `the apply rendering did not name ${path}`);
  }
  assert.ok(rendered.includes(`Transaction: ${result.operationId ?? ""}`), "the apply rendering did not name the transaction id");
  assert.match(rendered, /alpha-aos rollback/u);
});

// ---------------------------------------------------------------------------
// Plan 03-01 Task 2: the failure paths
// ---------------------------------------------------------------------------
//
// D-06 is a claim about what a CRASH leaves behind, so the load-bearing test
// below asserts on ABSENCE — zero receipts, and a tree byte-identical to the
// one the apply started from — rather than merely on a non-zero exit status.
// Moving the receipt write out of the single transaction makes it red.

/** Files under `.alpha-aos/receipts/`, sorted. Empty when the directory is absent. */
async function receiptFiles(root: string): Promise<string[]> {
  const directory = join(root, ...PROJECT_RECEIPT_DIRECTORY.split("/"));
  if (!existsSync(directory)) return [];
  return (await readdir(directory)).sort();
}

/** Runs something expected to refuse, and hands back the Error it refused with. */
async function expectRefusal(run: () => Promise<unknown>, label: string): Promise<Error> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Error, `${label} threw a non-Error value`);
    return error;
  }
  assert.fail(`${label} did not refuse`);
}

/**
 * A child that performs exactly one `applyProjectPackSync` and honours
 * `ALPHA_AOS_FAILPOINT` by dying at that durable boundary.
 *
 * The interruption is driven by the transaction's own deterministic failpoint
 * rather than by a signal, so it lands at a boundary the product DECLARES
 * rather than at whichever instruction a killer happened to catch.
 */
async function writeCrashDriver(support: string): Promise<string> {
  const script = join(support, "pack-sync-child.mjs");
  await writeFile(
    script,
    [
      `import { applyProjectPackSync } from ${JSON.stringify(packSyncModule)};`,
      "const [path, packageRoot, stateRoot, verifiedSourceRoot] = process.argv.slice(2);",
      "try {",
      "  await applyProjectPackSync({ path, packageRoot, stateRoot, verifiedSourceRoot });",
      "  process.exit(0);",
      "} catch (error) {",
      "  process.stderr.write(String(error && error.message ? error.message : error));",
      "  process.exit(3);",
      "}",
      "",
    ].join("\n"),
    "utf8",
  );
  return script;
}

test("a sync interrupted mid-transaction leaves zero receipts, and the rollback restores the tree", async (context) => {
  const fixture = await syncFixture(context, "crash");
  await approve(fixture);
  const support = dirname(fixture.sourceRoot);
  const driver = await writeCrashDriver(support);

  const before = await snapshotProject(fixture.root);

  const crashed = spawnSync(
    process.execPath,
    [driver, fixture.root, fixture.packageRoot, fixture.stateRoot, fixture.sourceRoot],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, ALPHA_AOS_FAILPOINT: "after-target-rename" } },
  );
  assert.equal(crashed.status, 70, `the failpoint did not trip: ${crashed.stderr}`);

  // The whole point of D-06: the interruption landed after a skill file was
  // renamed into place and before the receipts, and there is still no receipt
  // at all. Moving the receipt write to a second transaction makes this red.
  assert.deepEqual(await receiptFiles(fixture.root), [], "an interrupted sync left a receipt behind");

  // The journal reports the operation state, so the interruption is diagnosable
  // rather than merely observable as a half-written tree.
  const journals = await listManagedTransactions(fixture.stateRoot);
  const journal = journals[0];
  assert.ok(journal, "the interrupted transaction wrote no journal");
  assert.equal(journal.status, "applying", `the journal recorded ${journal.status} for an interrupted transaction`);

  await rollbackManagedTransaction(fixture.stateRoot, journal.id);
  assert.deepEqual(await snapshotProject(fixture.root), before, "the rollback did not restore the project tree");
  assert.deepEqual(await receiptFiles(fixture.root), [], "the rollback left a receipt behind");
});

test("no interruption can commit skill bytes without the receipt that claims them", async (context) => {
  const fixture = await syncFixture(context, "commit-atomicity");
  await approve(fixture);
  const driver = await writeCrashDriver(dirname(fixture.sourceRoot));

  // `after-final-sync` trips once a transaction has applied every operation it
  // was given AND durably marked its journal `applied`. With ONE transaction
  // that instant is after the receipts too. With the receipts moved into a
  // second transaction it is a COMMITTED state holding skill bytes no receipt
  // claims — the untracked-bytes-on-a-crash state D-06 exists to forbid, and
  // the state Phase 2's reader would go on to report as a TARGET_CONFLICT.
  const crashed = spawnSync(
    process.execPath,
    [driver, fixture.root, fixture.packageRoot, fixture.stateRoot, fixture.sourceRoot],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, ALPHA_AOS_FAILPOINT: "after-final-sync" } },
  );
  assert.equal(crashed.status, 70, `the failpoint did not trip: ${crashed.stderr}`);

  const posix = (value: string): string => value.replaceAll("\\", "/");
  for (const journal of await listManagedTransactions(fixture.stateRoot)) {
    if (journal.status !== "applied") continue;
    const targets = journal.files.map((file) => posix(file.target));
    const touchesSkill = targets.some((target) => target.endsWith(`/${PACK_SKILL}/SKILL.md`));
    if (!touchesSkill) continue;
    assert.equal(
      targets.some((target) => target.includes(`/${PROJECT_RECEIPT_DIRECTORY}/`)),
      true,
      `transaction ${journal.id} committed skill bytes without the receipt that claims them`,
    );
  }

  if (existsSync(join(fixture.root, ...CLAUDE_TARGET.split("/")))) {
    assert.deepEqual(
      await receiptFiles(fixture.root),
      [`${PACK_ID}.json`],
      "skill bytes are on disk that no receipt claims",
    );
  }
});

test("a second sync against an unchanged approved artifact is already-current, with one receipt per pack", async (context) => {
  const fixture = await syncFixture(context, "idempotent");
  await approve(fixture);
  const options = {
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  };

  const first = await applyProjectPackSync(options);
  assert.equal(first.status, "written");
  const afterFirst = await snapshotProject(fixture.root);

  const second = await applyProjectPackSync(options);
  assert.equal(second.status, "already-current", "a second sync rewrote an unchanged materialization");
  assert.equal(second.operationId, null, "an already-current sync opened a transaction");
  assert.deepEqual(second.written, [], "an already-current sync reported writes");

  assert.deepEqual(await snapshotProject(fixture.root), afterFirst, "a second sync changed bytes on disk");
  assert.deepEqual(
    await receiptFiles(fixture.root),
    [`${PACK_ID}.json`],
    "a second sync did not leave exactly one receipt per pack",
  );
});

test("a sync with no approved artifact refuses with a paste-ready approve command", async (context) => {
  const fixture = await syncFixture(context, "no-artifact");

  const result = spawnSync(process.execPath, [cliEntry, "project", "sync", fixture.root, "--apply"], {
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot },
  });

  assert.notEqual(result.status, 0, "a sync with no approved artifact was accepted");
  assert.match(result.stderr, /plan-incomplete/u);
  assert.ok(result.stderr.includes("project approve"), `the refusal carried no approve command: ${result.stderr}`);
  assert.ok(result.stderr.includes("--plan-digest"), `the refusal carried no --plan-digest: ${result.stderr}`);
  assert.ok(result.stderr.includes("--apply"), `the refusal carried no --apply: ${result.stderr}`);
  assert.deepEqual(await receiptFiles(fixture.root), [], "a refused sync wrote a receipt");
});

test("a sync whose bound inputs moved refuses, naming the drift kind and both digests", async (context) => {
  const fixture = await syncFixture(context, "drift");
  const approved = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  await approve(fixture);

  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify(
      {
        name: "pack-sync-fixture",
        private: true,
        dependencies: { react: "^19.0.0", "@modelcontextprotocol/sdk": "^1.0.0" },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const moved = await planProjectCapabilities({ path: fixture.root, packageRoot: fixture.packageRoot });
  assert.notEqual(approved.planDigest, moved.planDigest, "the fixture dependency change moved no digest");
  const drift = classifyPlanDrift(approved as ProjectCapabilityPlan, moved);
  // Taken AFTER the input moved, so this asserts the refusal wrote nothing —
  // not that the dependency edit never happened.
  const before = await snapshotProject(fixture.root);

  const error = await expectRefusal(
    () =>
      applyProjectPackSync({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        verifiedSourceRoot: fixture.sourceRoot,
      }),
    "a sync whose bound inputs moved",
  );

  assert.match(error.message, /plan-drift/u);
  assert.ok(error.message.includes(drift.kind), `the refusal did not name the drift kind ${drift.kind}: ${error.message}`);
  assert.ok(
    error.message.includes(approved.planDigest.slice(0, 12)),
    `the refusal did not name the reviewed digest: ${error.message}`,
  );
  assert.ok(
    error.message.includes(moved.planDigest.slice(0, 12)),
    `the refusal did not name the observed digest: ${error.message}`,
  );
  assert.deepEqual(await snapshotProject(fixture.root), before, "a refused sync changed the project tree");
});

test("an approved plan naming a harness with no project-local skill root refuses before any write", async (context) => {
  const fixture = await syncFixture(context, "harness");
  await approve(fixture);

  const artifactPath = join(fixture.root, ".alpha-aos", "plan.json");
  const artifact = JSON.parse(await readFile(artifactPath, "utf8")) as {
    plan: { targetPreState: Array<{ harness: string; path: string }> };
  };
  const first = artifact.plan.targetPreState[0];
  assert.ok(first, "the approved artifact carries no target");
  first.harness = "hermes";
  first.path = `.hermes/skills/${PACK_SKILL}/SKILL.md`;
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

  const before = await snapshotProject(fixture.root);
  const error = await expectRefusal(
    () =>
      planProjectPackSync({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        verifiedSourceRoot: fixture.sourceRoot,
      }),
    "an approved plan naming an unsupported harness",
  );

  assert.match(error.message, /plan-incomplete/u);
  assert.ok(error.message.includes("hermes"), `the refusal did not name the harness: ${error.message}`);
  assert.deepEqual(await snapshotProject(fixture.root), before, "a refused sync changed the project tree");
  assert.deepEqual(await receiptFiles(fixture.root), [], "a refused sync wrote a receipt");
});
