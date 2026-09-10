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
import {
  applyProjectPackSync,
  describeProjectProvenance,
  PACK_SIDECAR_FILE,
  planPackSidecar,
  planProjectPackSync,
  PROVENANCE_FINDING_CODES,
  SIDECAR_SURFACES,
} from "../src/core/project-pack-sync.js";
import { formatProjectPackSync, formatProjectStatus, MAX_STATUS_DETAIL_CHARS } from "../src/format.js";
import {
  applyPackRemoval,
  approveProjectPlan,
  classifyPlanDrift,
  planPackRemoval,
  planProjectCapabilities,
  PROJECT_RECEIPT_DIRECTORY,
  PROJECT_SKILL_ROOTS,
  reconcileProjectState,
  removalAllowedRoots,
  resolvePackSource,
} from "../src/core/project-plan.js";
import { listManagedTransactions, rollbackManagedTransaction } from "../src/core/transaction.js";
import type { PackProvenance } from "../src/core/project-pack-sync.js";
import type { ProjectReconciliation } from "../src/core/project-plan.js";
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
    targets: Array<{ harness: HarnessId; path: string; targetHash: string; kind: string }>;
  };
  assert.equal(receipt.packId, PACK_ID);
  assert.equal(receipt.producer.name, "alpha-aos");
  // Filtered by kind rather than counted whole: since plan 03-11 a receipt also
  // claims the provenance sidecars written beside the skills (D-07), and those
  // are alpha-AOS's own bytes rather than locked source bytes.
  const skillRows = receipt.targets.filter((target) => target.kind === "skill");
  assert.equal(skillRows.length, result.written.length);
  for (const target of receipt.targets) {
    assert.ok(
      target.kind === "skill" || target.kind === "sidecar",
      `${target.path} carries no D-05 kind discriminator`,
    );
  }
  for (const target of skillRows) {
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

// ---------------------------------------------------------------------------
// Plan 03-11 Task 1: the provenance sidecar (CONTEXT.md D-07)
// ---------------------------------------------------------------------------
//
// The sidecar is written BESIDE a materialized SKILL.md so a user looking at the
// harness's own skill directory can see alpha-AOS put it there — but only on a
// surface where 03-RESEARCH.md placed a real sidecar in a live skill directory
// and watched the harness list the skill unchanged. pi was never probed with a
// non-Markdown sidecar, so pi is receipts-only and says why.
//
// The skill BYTES are never touched, and that is the reason the sidecar exists
// at all: the identity renderer makes a provenance header unavailable.

/** The provenance sidecar `PACK_SKILL`'s materialization would place for one harness. */
function sidecarPathFor(harness: "claude" | "codex" | "pi"): string {
  return `${PROJECT_SKILL_ROOTS[harness] ?? ""}/${PACK_SKILL}/${PACK_SIDECAR_FILE}`;
}

/** Every provenance sidecar actually on disk under the project, sorted. */
async function sidecarFiles(root: string): Promise<string[]> {
  return (await snapshotProject(root))
    .map(([path]) => path)
    .filter((path) => path.endsWith(`/${PACK_SIDECAR_FILE}`))
    .sort();
}

/** A receipt as written, read back raw. */
async function readReceipt(root: string): Promise<{
  targets: Array<{ harness: string; path: string; targetHash: string; kind: string }>;
}> {
  return JSON.parse(await readFile(join(root, ...RECEIPT_PATH.split("/")), "utf8")) as {
    targets: Array<{ harness: string; path: string; targetHash: string; kind: string }>;
  };
}

test("every harness with a project-local skill root has a recorded sidecar decision carrying its evidence", () => {
  for (const harness of Object.keys(PROJECT_SKILL_ROOTS) as Array<"claude" | "codex" | "pi">) {
    const decision = SIDECAR_SURFACES.get(harness);
    assert.ok(decision !== undefined, `${harness} has a project-local skill root and no sidecar decision`);
    assert.equal(typeof decision.enabled, "boolean", `${harness}'s sidecar decision is not a decision`);
    assert.ok(decision.reason.length > 0, `${harness}'s sidecar decision carries no reason`);
    assert.ok(decision.evidence.length > 0, `${harness}'s sidecar decision cites nothing`);
    // The rendered reason CARRIES its citation, so a reader of a receipts-only
    // line can check the claim without holding this table — the same discipline
    // SURFACE_CEILING already enforces.
    assert.ok(
      decision.reason.includes(decision.evidence),
      `${harness}'s reason does not repeat its own citation: ${decision.reason}`,
    );
  }

  // The split is the RESEARCH finding, not a convenience: two surfaces were
  // probed with a real sidecar, the third was not.
  assert.equal(SIDECAR_SURFACES.get("claude")?.enabled, true);
  assert.equal(SIDECAR_SURFACES.get("codex")?.enabled, true);
  assert.equal(SIDECAR_SURFACES.get("pi")?.enabled, false);
});

test("applying a pack writes a provenance sidecar on every tolerance-proven surface, in the same transaction", async (context) => {
  const fixture = await syncFixture(context, "sidecar-write");
  await approve(fixture);

  const result = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  assert.equal(result.status, "written");
  assert.deepEqual(
    [...result.sidecars].sort(),
    [sidecarPathFor("claude"), sidecarPathFor("codex")].sort(),
    "the tolerance-proven surfaces did not each get exactly one sidecar",
  );

  for (const harness of ["claude", "codex"] as const) {
    const relative = sidecarPathFor(harness);
    const absolute = join(fixture.root, ...relative.split("/"));
    const document = JSON.parse(await readFile(absolute, "utf8")) as Record<string, unknown>;
    assert.equal(document.owner, "alpha-aos", `${relative} does not name alpha-AOS as the owner`);
    assert.equal(document.packId, PACK_ID);
    assert.equal(document.harness, harness);
    assert.equal(document.skill, PACK_SKILL);
    assert.equal(document.receipt, RECEIPT_PATH, `${relative} does not name the authoritative receipt`);
    assert.deepEqual(document.source, {
      package: "ecc-universal",
      version: (await loadLock(fixture.packageRoot)).components.ecc?.version,
      sha256: fixture.sourceHash,
    });
    assert.equal(typeof document.createdAt, "string");
    // The sidecar says outright that it is a view of the receipt, so nobody
    // reads it as a second source of truth.
    assert.match(String(document.note), /receipt/u);
  }

  // ONE transaction carried the skill bytes, the sidecars and the receipts. The
  // journal is where that is observable rather than inferable.
  const journals = await listManagedTransactions(fixture.stateRoot);
  const journal = journals.find((entry) => entry.id === result.operationId);
  assert.ok(journal, "the sync recorded no journal");
  const posix = (value: string): string => value.replaceAll("\\", "/");
  const touched = journal.files.map((file) => posix(file.target));
  for (const relative of result.sidecars) {
    assert.ok(
      touched.some((target) => target.endsWith(relative)),
      `${relative} was not written by the same transaction as the skill bytes: ${touched.join(", ")}`,
    );
  }

  // A path a user cannot see is a byte that entered their project unannounced.
  const rendered = formatProjectPackSync(result);
  for (const relative of result.sidecars) {
    assert.ok(rendered.includes(relative), `the apply rendering did not name the sidecar ${relative}`);
  }
});

test("the surface whose sidecar tolerance is unproven gets no sidecar, and the plan says so with the reason", async (context) => {
  const fixture = await syncFixture(context, "sidecar-receipts-only");
  await approve(fixture);

  const plan = await planProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  // pi has a target in this plan, so its absence from the sidecar list is a
  // DECISION about a surface being written to, not an artefact of pi not
  // appearing at all.
  assert.ok(
    plan.targets.some((target) => target.harness === "pi"),
    "the fixture plans no pi target, so pi's receipts-only decision would prove nothing",
  );
  assert.deepEqual(
    plan.sidecars.filter((sidecar) => sidecar.harness === "pi"),
    [],
    "a sidecar was planned for the surface whose tolerance is unproven",
  );

  const pi = plan.sidecarSurfaces.find((entry) => entry.harness === "pi");
  assert.ok(pi !== undefined, "the plan records no sidecar decision for pi at all");
  assert.equal(pi.enabled, false);
  // A blank reads as a missing file. The reason has to say the surface is
  // receipts-only ON PURPOSE, and cite what that rests on.
  assert.match(pi.reason, /UNPROVEN/u);
  assert.ok(pi.reason.includes("receipts-only"), `pi's reason does not say receipts-only: ${pi.reason}`);
  assert.ok(pi.reason.includes("[cited:"), `pi's reason cites nothing: ${pi.reason}`);

  // The same fact, at the function the decision is made in.
  assert.equal(
    planPackSidecar(PACK_ID, "pi", `${PROJECT_SKILL_ROOTS.pi ?? ""}/${PACK_SKILL}`, {
      skill: PACK_SKILL,
      path: RECEIPT_PATH,
      sourcePackage: "ecc-universal",
      sourceVersion: "2.2.0",
      sourceSha256: fixture.sourceHash,
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
    null,
  );

  await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.equal(
    existsSync(join(fixture.root, ...sidecarPathFor("pi").split("/"))),
    false,
    "a sidecar landed on the surface whose tolerance is unproven",
  );

  // The receipt is the WHOLE provenance record for that surface, so it must
  // still claim pi's skill target.
  const receipt = await readReceipt(fixture.root);
  assert.ok(
    receipt.targets.some((target) => target.harness === "pi" && target.kind === "skill"),
    "pi is receipts-only and its receipt does not claim its skill target",
  );
  assert.deepEqual(
    receipt.targets.filter((target) => target.harness === "pi" && target.kind === "sidecar"),
    [],
  );
});

test("a materialized skill file hashes to its locked source hash with a sidecar beside it", async (context) => {
  const fixture = await syncFixture(context, "sidecar-bytes");
  await approve(fixture);

  const result = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  const lock = await loadLock(fixture.packageRoot);
  const locked = resolvePackSource(lock, PACK_ID, PACK_SKILL).sourceSha256;

  // The sidecar has to be THERE for this assertion to mean anything: the claim
  // is that provenance beside the file changes nothing about the file.
  assert.ok(result.sidecars.length > 0, "no sidecar was written, so this proves nothing about writing one");

  for (const relative of result.written) {
    const written = join(fixture.root, ...relative.split("/"));
    assert.equal(
      sha256(await readFile(written)),
      locked,
      `${relative} does not hash to the locked source hash, so a byte was modified`,
    );
  }
  for (const relative of result.sidecars) {
    const directory = dirname(join(fixture.root, ...relative.split("/")));
    assert.equal(
      sha256(await readFile(join(directory, "SKILL.md"))),
      locked,
      `the skill beside ${relative} does not hash to the locked source hash`,
    );
  }
  // And the receipt records that same hash for every skill row, so the claim is
  // on the record and not only on disk.
  const receipt = await readReceipt(fixture.root);
  for (const target of receipt.targets.filter((entry) => entry.kind === "skill")) {
    assert.equal(target.targetHash, locked, `${target.path} recorded a hash other than the locked source hash`);
  }
});

test("an interrupted sync leaves no sidecar behind, and the rollback restores the skill directory", async (context) => {
  const fixture = await syncFixture(context, "sidecar-crash");
  await approve(fixture);
  const driver = await writeCrashDriver(dirname(fixture.sourceRoot));
  const before = await snapshotProject(fixture.root);

  const crashed = spawnSync(
    process.execPath,
    [driver, fixture.root, fixture.packageRoot, fixture.stateRoot, fixture.sourceRoot],
    { encoding: "utf8", windowsHide: true, env: { ...process.env, ALPHA_AOS_FAILPOINT: "after-target-rename" } },
  );
  assert.equal(crashed.status, 70, `the failpoint did not trip: ${crashed.stderr}`);

  // T-03-102: a sidecar surviving a rolled-back apply would be unowned bytes
  // claimed by no receipt. The sidecar writes join the SAME operations list, so
  // there is no second transaction to survive in.
  assert.deepEqual(await sidecarFiles(fixture.root), [], "an interrupted sync left a provenance sidecar behind");
  assert.deepEqual(await receiptFiles(fixture.root), [], "an interrupted sync left a receipt behind");

  const journals = await listManagedTransactions(fixture.stateRoot);
  const journal = journals[0];
  assert.ok(journal, "the interrupted transaction wrote no journal");
  await rollbackManagedTransaction(fixture.stateRoot, journal.id);

  assert.deepEqual(await snapshotProject(fixture.root), before, "the rollback did not restore the project tree");
  assert.deepEqual(await sidecarFiles(fixture.root), [], "the rollback left a provenance sidecar behind");
});

test("removing a pack removes its sidecar too, inside the removal's allowed roots", async (context) => {
  const fixture = await syncFixture(context, "sidecar-removal");
  await approve(fixture);
  const applied = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.ok(applied.sidecars.length > 0, "nothing wrote a sidecar, so removing one proves nothing");
  assert.deepEqual(await sidecarFiles(fixture.root), [...applied.sidecars].sort());

  // The evidence that selected the pack goes away, which is the one ground a
  // removal is offered on. Nothing is deleted by this.
  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify({ name: "pack-sync-fixture", private: true }, null, 2)}\n`,
    "utf8",
  );

  const reconciliation = await reconcileProjectState({ path: fixture.root, packageRoot: fixture.packageRoot });
  const removal = planPackRemoval(reconciliation).find((entry) => entry.packId === PACK_ID);
  assert.ok(removal, "a pack whose evidence disappeared is offered no removal");
  assert.ok(
    removal.targets.some((target) => target.path.endsWith(`/${PACK_SIDECAR_FILE}`)),
    `the removal plan names no sidecar: ${removal.targets.map((target) => target.path).join(", ")}`,
  );

  // Every removed path — sidecars included — stays inside the roots derived from
  // PROJECT_SKILL_ROOTS. Passing the canonical root would make this vacuous.
  const present = removal.targets.filter((target) => target.exists);
  const roots = removalAllowedRoots(reconciliation.plan.scope.canonicalRoot, present, removal.receiptPath);
  for (const target of present) {
    const absolute = join(reconciliation.plan.scope.canonicalRoot, ...target.path.split("/"));
    assert.ok(
      roots.some((root) => absolute.startsWith(root)),
      `${target.path} is not confined by the removal's allowed roots: ${roots.join(", ")}`,
    );
  }

  const removed = await applyPackRemoval({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    removalDigest: removal.removalDigest,
  });
  assert.ok(
    removed.removed.some((path) => path.endsWith(`/${PACK_SIDECAR_FILE}`)),
    `the removal did not remove a sidecar: ${removed.removed.join(", ")}`,
  );
  assert.deepEqual(await sidecarFiles(fixture.root), [], "a removed pack left its provenance sidecar behind");
});

test("a user-modified sidecar makes the removal refuse rather than delete it", async (context) => {
  const fixture = await syncFixture(context, "sidecar-drift");
  await approve(fixture);
  const applied = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  const sidecar = applied.sidecars[0];
  assert.ok(sidecar, "nothing wrote a sidecar, so drifting one proves nothing");

  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify({ name: "pack-sync-fixture", private: true }, null, 2)}\n`,
    "utf8",
  );

  // The digest a user would have been shown, taken BEFORE they edited anything.
  const offered = planPackRemoval(
    await reconcileProjectState({ path: fixture.root, packageRoot: fixture.packageRoot }),
  ).find((entry) => entry.packId === PACK_ID);
  assert.ok(offered, "a pack whose evidence disappeared is offered no removal");

  const absolute = join(fixture.root, ...sidecar.split("/"));
  await writeFile(absolute, `${await readFile(absolute, "utf8")}\n// a human wrote this line\n`, "utf8");
  const edited = sha256(await readFile(absolute, "utf8"));

  const error = await expectRefusal(
    () =>
      applyPackRemoval({
        path: fixture.root,
        packageRoot: fixture.packageRoot,
        stateRoot: fixture.stateRoot,
        removalDigest: offered.removalDigest,
      }),
    "a removal approved before the user edited the sidecar",
  );
  assert.match(error.message, /plan-drift/u);

  // Refused, not deleted, and the human's bytes are still exactly theirs. This
  // is the same guard the removal path already applies to drifted skill bytes:
  // the digest is computed over each target's CURRENT hash, so a sidecar
  // recorded as a receipt target sits inside it.
  assert.equal(existsSync(absolute), true, "a removal deleted a sidecar the user had modified");
  assert.equal(sha256(await readFile(absolute, "utf8")), edited, "a removal rewrote a sidecar the user had modified");
  assert.equal(
    existsSync(join(fixture.root, ...CLAUDE_TARGET.split("/"))),
    true,
    "a refused removal deleted the skill file anyway",
  );
});

// ---------------------------------------------------------------------------
// Plan 03-11 Task 2: project-local provenance, visible in the report
// ---------------------------------------------------------------------------
//
// CAPA-05 asks a user to SEE a synced capability with project-local provenance.
// That means the report has to answer three questions per target: which harness
// holds this file, who claims it, and where the record of that claim lives.
//
// A receipts-only surface renders its REASON. A blank there reads as a missing
// file, and "not written here on purpose" versus "should be here and is not" is
// the whole distinction this line exists to carry.

/** A materialized fixture plus the reconciliation a report is rendered from. */
async function materialized(context: TestContext, label: string): Promise<{
  fixture: SyncFixture;
  reconcile: () => Promise<ProjectReconciliation>;
}> {
  const fixture = await syncFixture(context, label);
  await approve(fixture);
  await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  return {
    fixture,
    reconcile: async () => reconcileProjectState({ path: fixture.root, packageRoot: fixture.packageRoot }),
  };
}

/** Renders a status report for a fixture, with no host state consulted. */
function renderStatus(reconciliation: ProjectReconciliation, path: string): string {
  return formatProjectStatus(reconciliation, [], { path, subProject: null }, [], describeProjectProvenance(reconciliation));
}

test("the status report lists every target with its harness, its receipt claim and its sidecar state", async (context) => {
  const { fixture, reconcile } = await materialized(context, "provenance-rows");
  const reconciliation = await reconcile();
  const provenance = describeProjectProvenance(reconciliation);

  const pack: PackProvenance | undefined = provenance.find((entry) => entry.packId === PACK_ID);
  assert.ok(pack, "the materialized pack has no provenance entry");
  assert.equal(pack.receiptPath, RECEIPT_PATH);
  assert.deepEqual(
    pack.targets.map((target) => target.harness).sort(),
    ["claude", "codex", "pi"],
    "the provenance view does not cover every harness the pack was materialized to",
  );

  for (const target of pack.targets) {
    assert.equal(target.claimedBy, RECEIPT_PATH, `${target.path} is not reported as claimed by its receipt`);
  }
  for (const harness of ["claude", "codex"] as const) {
    const row: PackProvenance["targets"][number] | undefined = pack.targets.find(
      (entry) => entry.harness === harness,
    );
    assert.equal(row?.sidecar, "present", `${harness}'s sidecar is not reported present`);
    assert.equal(row?.sidecarPath, sidecarPathFor(harness));
  }

  const rendered = renderStatus(reconciliation, fixture.root);
  assert.ok(rendered.includes(`PROVENANCE ${PACK_ID} — receipt ${RECEIPT_PATH}`), rendered);
  for (const target of pack.targets) {
    const line = rendered.split("\n").find((entry) => entry.includes(target.path) && entry.includes("harness="));
    assert.ok(line !== undefined, `no rendered line names ${target.path}`);
    assert.ok(line.includes(`harness=${target.harness}`), line);
    assert.ok(line.includes("receipt=claimed"), line);
  }
});

test("a receipts-only surface renders its reason rather than a blank sidecar state", async (context) => {
  const { fixture, reconcile } = await materialized(context, "provenance-receipts-only");
  const reconciliation = await reconcile();
  const pi = describeProjectProvenance(reconciliation)
    .find((entry) => entry.packId === PACK_ID)
    ?.targets.find((target) => target.harness === "pi");

  assert.ok(pi, "pi has a materialized target and no provenance row");
  assert.equal(pi.sidecar, "receipts-only");
  assert.equal(pi.sidecarPath, null, "a receipts-only surface named a sidecar path that will never exist");
  assert.equal(pi.sidecarReason, SIDECAR_SURFACES.get("pi")?.reason, "the row does not carry the recorded reason verbatim");

  const rendered = renderStatus(reconciliation, fixture.root);
  const line = rendered.split("\n").find((entry) => entry.includes(pi.path) && entry.includes("harness=pi"));
  assert.ok(line !== undefined, "pi has no rendered provenance line");
  assert.ok(line.includes("sidecar=receipts-only"), line);
  // The load-bearing words survive the status width bound. Plan 03-09 lost half
  // a sentence to exactly this cap, so the decision leads the reason and the
  // justification follows it.
  assert.ok(line.includes("receipts-only on purpose"), `the reason was cut before it said this was deliberate: ${line}`);
  assert.ok(line.includes("UNPROVEN"), `the reason was cut before it said why: ${line}`);
  assert.ok(
    (SIDECAR_SURFACES.get("pi")?.reason.indexOf("UNPROVEN") ?? Infinity) < MAX_STATUS_DETAIL_CHARS,
    "pi's reason buries UNPROVEN past the status width bound, where a render would cut it",
  );
});

test("an absent sidecar and a modified one are different reported states, never both absent", async (context) => {
  const { fixture, reconcile } = await materialized(context, "provenance-absent-vs-modified");
  const claude = join(fixture.root, ...sidecarPathFor("claude").split("/"));
  const codex = join(fixture.root, ...sidecarPathFor("codex").split("/"));

  // One deleted, one edited. A report that called both "absent" would be the
  // absent-versus-unreadable collapse this repository has already fixed twice.
  await rm(claude);
  await writeFile(codex, `${await readFile(codex, "utf8")}\n// a human wrote this line\n`, "utf8");

  const reconciliation = await reconcile();
  const targets = describeProjectProvenance(reconciliation).find((entry) => entry.packId === PACK_ID)?.targets ?? [];
  assert.equal(targets.find((target) => target.harness === "claude")?.sidecar, "missing");
  assert.equal(targets.find((target) => target.harness === "codex")?.sidecar, "modified");

  const rendered = renderStatus(reconciliation, fixture.root);
  assert.ok(rendered.includes("sidecar=MISSING"), rendered);
  assert.ok(rendered.includes("sidecar=MODIFIED"), rendered);
  assert.ok(
    rendered.includes("holds bytes alpha-AOS did not write"),
    "a modified sidecar does not say what makes it different from an absent one",
  );
});

test("a target claimed by no receipt renders a finding with a stable code", async (context) => {
  const { fixture, reconcile } = await materialized(context, "provenance-unclaimed");

  // The receipt stops claiming one target it wrote. The bytes stay exactly
  // where they were: this is a gap in the RECORD, not a change to the tree.
  const receiptFile = join(fixture.root, ...RECEIPT_PATH.split("/"));
  const receipt = JSON.parse(await readFile(receiptFile, "utf8")) as {
    targets: Array<{ harness: string; path: string; kind: string }>;
  };
  const dropped = receipt.targets.find((target) => target.harness === "pi" && target.kind === "skill");
  assert.ok(dropped, "the fixture receipt claims no pi skill target to drop");
  receipt.targets = receipt.targets.filter((target) => target !== dropped);
  await writeFile(receiptFile, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  const reconciliation = await reconcile();
  const pack = describeProjectProvenance(reconciliation).find((entry) => entry.packId === PACK_ID);
  assert.ok(pack, "the pack lost its provenance entry entirely");

  const finding = pack.findings.find((entry) => entry.path === dropped.path);
  assert.ok(finding, `no finding names the unclaimed target: ${JSON.stringify(pack.findings)}`);
  assert.equal(finding.code, PROVENANCE_FINDING_CODES.unclaimedTarget);
  assert.equal(finding.code, "PROVENANCE_TARGET_UNCLAIMED");

  const row = pack.targets.find((target) => target.path === dropped.path);
  assert.ok(row, "an unclaimed target vanished from the rows instead of being reported");
  assert.equal(row.claimedBy, null);

  const rendered = renderStatus(reconciliation, fixture.root);
  assert.ok(rendered.includes("PROVENANCE_TARGET_UNCLAIMED"), rendered);
  assert.ok(
    rendered.split("\n").some((line) => line.includes(dropped.path) && line.includes("receipt=UNCLAIMED")),
    "the unclaimed target's row does not say it is unclaimed",
  );
  assert.equal(existsSync(join(fixture.root, ...dropped.path.split("/"))), true, "reporting removed a file");
});

test("two renders of the same reconciliation are byte-identical, with every list stably sorted", async (context) => {
  const { fixture, reconcile } = await materialized(context, "provenance-stable");
  const reconciliation = await reconcile();

  assert.equal(
    renderStatus(reconciliation, fixture.root),
    renderStatus(reconciliation, fixture.root),
    "two renders of one reconciliation differ",
  );
  assert.equal(
    JSON.stringify(describeProjectProvenance(reconciliation)),
    JSON.stringify(describeProjectProvenance(reconciliation)),
    "two computations of one provenance view differ",
  );

  for (const pack of describeProjectProvenance(reconciliation)) {
    const keys = pack.targets.map((target) => `${target.path} ${target.harness}`);
    assert.deepEqual(keys, [...keys].sort(), `${pack.packId}'s targets are not sorted by path then harness`);
    const paths = pack.findings.map((finding) => finding.path);
    assert.deepEqual(paths, [...paths].sort(), `${pack.packId}'s findings are not sorted by path`);
  }
});

test("the JSON surface carries the per-target receipt claim and sidecar state", async (context) => {
  const { fixture } = await materialized(context, "provenance-json");

  const result = spawnSync(process.execPath, [cliEntry, "project", "status", fixture.root, "--json"], {
    encoding: "utf8",
    windowsHide: true,
    // Pinned, or this reads whatever the developer's real host ledger says.
    env: { ...process.env, ALPHA_AOS_STATE_DIR: fixture.stateRoot },
  });
  assert.equal(result.status, 0, `project status --json failed: ${result.stderr}`);

  const payload = JSON.parse(result.stdout) as {
    provenance: Array<{
      packId: string;
      receiptPath: string;
      targets: Array<{ path: string; harness: string; claimedBy: string | null; sidecar: string }>;
    }>;
  };
  const pack = payload.provenance.find((entry) => entry.packId === PACK_ID);
  assert.ok(pack, `the JSON surface carries no provenance for ${PACK_ID}: ${result.stdout.slice(0, 400)}`);
  assert.equal(pack.targets.length, 3);
  for (const target of pack.targets) {
    assert.equal(typeof target.claimedBy, "string", `${target.path} has no per-target receipt-claim field`);
    assert.ok(
      ["present", "modified", "missing", "receipts-only", "unrecorded"].includes(target.sidecar),
      `${target.path} carries no sidecar state: ${target.sidecar}`,
    );
  }
  assert.equal(pack.targets.find((target) => target.harness === "pi")?.sidecar, "receipts-only");
  assert.equal(pack.targets.find((target) => target.harness === "claude")?.sidecar, "present");
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
