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
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadLock } from "../src/core/catalog.js";
import { applyProjectPackSync } from "../src/core/project-pack-sync.js";
import { formatProjectPackSync } from "../src/format.js";
import {
  approveProjectPlan,
  planProjectCapabilities,
  PROJECT_RECEIPT_DIRECTORY,
  resolvePackSource,
} from "../src/core/project-plan.js";
import type { HarnessId } from "../src/types.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");

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
