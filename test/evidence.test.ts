// Wave 3 executor for DETC-01 (D-01, D-02, D-03, D-04).
//
// The canonical root is already proven (02-01). This suite judges the SCAN:
// whether the traversal that starts at that root stops at every kind of nested
// project boundary, refuses every escape, terminates on structure rather than
// on trust, and discovers sub-projects through the ecosystem's own declaration
// before falling back to a scan.
//
// Every git boundary case is built by git itself through
// `test/helpers/git-fixture.ts` rather than hand-assembled, because the rule
// under test is precisely whether the boundary check matches what git actually
// produces (see `.planning/research/PITFALLS.md` §Pitfall 4).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { IGNORE_PATTERN_COUNT_CAP } from "../src/core/ignore-list.js";
import type { EvidenceEnvelope, FactDeclaration, FactVocabulary } from "../src/types.js";
import type {
  CanonicalRoot,
  DetectionContext,
  ExcludedBoundary,
  FactDetection,
  ProjectTreeScan,
  SubProjectDiscovery,
} from "../src/core/evidence.js";
import {
  collectProjectEvidence,
  detectFact,
  detectProjectFacts,
  discoverSubProjects,
  matchDeclaredContent,
  MAX_EVIDENCE_FILE_BYTES,
  MAX_SCAN_DEPTH,
  openDetectionContext,
  ProjectReadCache,
  readWorkspaceDeclaration,
  resolveCanonicalRoot,
  scanProjectTree,
} from "../src/core/evidence.js";
import { loadFactVocabularyStrict } from "../src/core/pack-catalog.js";
import { validateManagedDocument } from "../src/core/validation.js";
import {
  createLinkedWorktree,
  createNestedRepository,
  createOrdinaryRepository,
  createSubmodule,
  gitAvailability,
} from "./helpers/git-fixture.js";

/** The alpha-AOS package root that owns `catalog/facts.yaml` and `schemas/`. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface NotRunRecord {
  readonly fixture: string;
  readonly reason: string;
}

const notRun: NotRunRecord[] = [];

/**
 * A git object store is read-only on Windows and a fixture directory may still
 * be held briefly after the last git process exits. A failed cleanup of a temp
 * directory must never turn a passing containment assertion red.
 */
async function removeTree(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  } catch {
    // Intentionally ignored — see above.
  }
}

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
  skip: (message?: string) => void;
}

async function scratch(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => removeTree(root));
  return root;
}

/** Reports git's absence as a named skip rather than as an absent case. */
function skipWithoutGit(context: TestContext, fixture: string): boolean {
  const probe = gitAvailability();
  if (probe.available) return false;
  notRun.push({ fixture, reason: probe.reason ?? "git unavailable" });
  context.skip(`${fixture} fixture not run: ${probe.reason ?? "git unavailable"}`);
  return true;
}

// ---------------------------------------------------------------------------
// Task 1 — the four real git shapes, and what `.git` actually is in each
// ---------------------------------------------------------------------------

test("an ordinary repository fixture produces a .git directory", async (context) => {
  if (skipWithoutGit(context, "ordinary-repository")) return;
  const root = await scratch(context, "git-ordinary");

  const built = await createOrdinaryRepository(root, "repo");
  assert.equal(built.ok, true, built.ok ? "" : `fixture failed: ${built.reason}`);
  if (!built.ok) return;

  assert.equal(built.fixture.gitEntry.kind, "directory");
  assert.equal(built.fixture.gitEntry.pointer, null);
  assert.equal((await stat(built.fixture.gitEntry.path)).isDirectory(), true);
  assert.equal(built.fixture.commands.some((command) => command.startsWith("git init")), true);
});

test("a nested git init inside a working tree produces a .git directory the parent reports as untracked", async (context) => {
  if (skipWithoutGit(context, "nested-repository")) return;
  const root = await scratch(context, "git-nested");

  const outer = await createOrdinaryRepository(root, "outer");
  assert.equal(outer.ok, true, outer.ok ? "" : `fixture failed: ${outer.reason}`);
  if (!outer.ok) return;

  const nested = await createNestedRepository(outer.fixture.path, "nested");
  assert.equal(nested.ok, true, nested.ok ? "" : `fixture failed: ${nested.reason}`);
  if (!nested.ok) return;

  assert.equal(nested.fixture.gitEntry.kind, "directory");
  assert.equal((await stat(nested.fixture.gitEntry.path)).isDirectory(), true);
  // git itself does not descend: the nested repository is one opaque entry.
  assert.match(nested.fixture.parentStatus ?? "", /\?\?\s+nested\//u);
});

test("a linked worktree produces a .git file carrying a gitdir pointer", async (context) => {
  if (skipWithoutGit(context, "linked-worktree")) return;
  const root = await scratch(context, "git-worktree");

  const repository = await createOrdinaryRepository(root, "repo");
  assert.equal(repository.ok, true, repository.ok ? "" : `fixture failed: ${repository.reason}`);
  if (!repository.ok) return;

  const worktree = await createLinkedWorktree(repository.fixture.path, "wt");
  assert.equal(worktree.ok, true, worktree.ok ? "" : `fixture failed: ${worktree.reason}`);
  if (!worktree.ok) return;

  assert.equal(worktree.fixture.gitEntry.kind, "file");
  assert.equal((await stat(worktree.fixture.gitEntry.path)).isDirectory(), false);
  assert.equal((worktree.fixture.gitEntry.pointer ?? "").startsWith("gitdir:"), true);
});

test("a submodule produces a .git file and a .gitmodules entry at the superproject root", async (context) => {
  if (skipWithoutGit(context, "submodule")) return;
  const root = await scratch(context, "git-submodule");

  const child = await createOrdinaryRepository(root, "child");
  assert.equal(child.ok, true, child.ok ? "" : `fixture failed: ${child.reason}`);
  if (!child.ok) return;
  const superproject = await createOrdinaryRepository(root, "super");
  assert.equal(superproject.ok, true, superproject.ok ? "" : `fixture failed: ${superproject.reason}`);
  if (!superproject.ok) return;

  const submodule = await createSubmodule(superproject.fixture.path, child.fixture.path, "sub");
  assert.equal(submodule.ok, true, submodule.ok ? "" : `fixture failed: ${submodule.reason}`);
  if (!submodule.ok) return;

  assert.equal(submodule.fixture.gitEntry.kind, "file");
  assert.equal((await stat(submodule.fixture.gitEntry.path)).isDirectory(), false);
  assert.equal((submodule.fixture.gitEntry.pointer ?? "").startsWith("gitdir:"), true);

  const gitmodulesPath = submodule.fixture.gitmodulesPath;
  assert.notEqual(gitmodulesPath, null);
  assert.equal(existsSync(gitmodulesPath as string), true);
  const declaration = await readFile(gitmodulesPath as string, "utf8");
  assert.match(declaration, /path\s*=\s*sub/u);
});

// ---------------------------------------------------------------------------
// Task 2 — the bounded, boundary-proven walk and its four boundary stops
// ---------------------------------------------------------------------------

const SENTINEL_BYTES = "outside sentinel — the scan must never read this\n";

/** Directory link creation differs by platform and may need privileges. */
async function tryDirectoryLink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return existsSync(linkPath);
  } catch {
    return false;
  }
}

/**
 * `scanProjectTree` under a wall-clock bound. Resolves null on expiry, so a
 * walk that fails to terminate is a red assertion rather than a stalled suite.
 * The walk itself is not cancellable, so the losing promise is left to settle
 * on its own — it touches nothing this test asserts on.
 */
async function boundedScan(root: CanonicalRoot, timeoutMs: number): Promise<ProjectTreeScan | null> {
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<null>((resolveExpiry) => {
    timer = setTimeout(() => resolveExpiry(null), timeoutMs);
  });
  try {
    return await Promise.race([scanProjectTree(root), expiry]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function excludedFor(scan: ProjectTreeScan, path: string): ExcludedBoundary | undefined {
  return scan.excludedBoundaries.find((entry) => entry.path === path);
}

function scannedUnder(scan: ProjectTreeScan, prefix: string): readonly string[] {
  return scan.paths.filter((path) => path === prefix || path.startsWith(`${prefix}/`));
}

test("the scan excludes every path under a nested ordinary repository", async (context) => {
  if (skipWithoutGit(context, "boundary-nested-repository")) return;
  const workspace = await scratch(context, "scan-nested");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");
  const nested = await createOrdinaryRepository(workspace, "nested");
  assert.equal(nested.ok, true, nested.ok ? "" : `fixture failed: ${nested.reason}`);
  if (!nested.ok) return;

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "a file beside the boundary is still scanned");
  assert.deepEqual(scannedUnder(scan, "nested"), [], "no path under the nested repository is scanned");
  assert.equal(excludedFor(scan, "nested")?.reason, "git-entry");
});

test("the scan excludes a linked worktree, whose .git is a file rather than a directory", async (context) => {
  if (skipWithoutGit(context, "boundary-linked-worktree")) return;
  const workspace = await scratch(context, "scan-worktree");
  const repository = await createOrdinaryRepository(workspace, "repo");
  assert.equal(repository.ok, true, repository.ok ? "" : `fixture failed: ${repository.reason}`);
  if (!repository.ok) return;
  const worktree = await createLinkedWorktree(repository.fixture.path, "wt");
  assert.equal(worktree.ok, true, worktree.ok ? "" : `fixture failed: ${worktree.reason}`);
  if (!worktree.ok) return;
  assert.equal(worktree.fixture.gitEntry.kind, "file", "the case only bites when .git is a FILE");

  const root = await resolveCanonicalRoot(repository.fixture.path);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("README.md"), true, "the repository's own file is scanned");
  assert.deepEqual(scannedUnder(scan, "wt"), [], "no path inside the linked worktree is scanned");
  assert.equal(excludedFor(scan, "wt")?.reason, "git-entry");
});

test("the scan excludes a submodule, whose .git is a file rather than a directory", async (context) => {
  if (skipWithoutGit(context, "boundary-submodule")) return;
  const workspace = await scratch(context, "scan-submodule");
  const child = await createOrdinaryRepository(workspace, "child");
  assert.equal(child.ok, true, child.ok ? "" : `fixture failed: ${child.reason}`);
  if (!child.ok) return;
  const superproject = await createOrdinaryRepository(workspace, "super");
  assert.equal(superproject.ok, true, superproject.ok ? "" : `fixture failed: ${superproject.reason}`);
  if (!superproject.ok) return;
  const submodule = await createSubmodule(superproject.fixture.path, child.fixture.path, "sub");
  assert.equal(submodule.ok, true, submodule.ok ? "" : `fixture failed: ${submodule.reason}`);
  if (!submodule.ok) return;
  assert.equal(submodule.fixture.gitEntry.kind, "file", "the case only bites when .git is a FILE");

  const root = await resolveCanonicalRoot(superproject.fixture.path);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("README.md"), true, "the superproject's own file is scanned");
  assert.deepEqual(scannedUnder(scan, "sub"), [], "no path inside the submodule is scanned");
  assert.equal(excludedFor(scan, "sub")?.reason, "git-entry");
});

test("the scan excludes a .gitmodules-declared path that has no .git entry yet", async (context) => {
  const workspace = await scratch(context, "scan-declared-submodule");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");
  await writeFile(
    join(workspace, ".gitmodules"),
    '[submodule "vendor-lib"]\n\tpath = vendor-lib\n\turl = ../vendor-lib\n',
    "utf8",
  );
  await mkdir(join(workspace, "vendor-lib"), { recursive: true });
  await writeFile(join(workspace, "vendor-lib", "index.js"), "module.exports = {};\n", "utf8");

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "a file beside the declaration is still scanned");
  assert.deepEqual(scannedUnder(scan, "vendor-lib"), [], "a declared-but-uninitialized submodule is not scanned");
  assert.equal(excludedFor(scan, "vendor-lib")?.reason, "declared-submodule");
});

test("an ignore-list matched path is not scanned in a directory that is not a git repository", async (context) => {
  const workspace = await scratch(context, "scan-ignored");
  assert.equal(existsSync(join(workspace, ".git")), false, "the fixture is deliberately not a repository");
  await writeFile(join(workspace, ".gitignore"), "build/\n*.log\n", "utf8");
  await mkdir(join(workspace, "build"), { recursive: true });
  await writeFile(join(workspace, "build", "out.js"), "// built\n", "utf8");
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "app.ts"), "export {};\n", "utf8");
  await writeFile(join(workspace, "debug.log"), "noise\n", "utf8");

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("src/app.ts"), true, "an unignored file is scanned");
  assert.deepEqual(scannedUnder(scan, "build"), [], "an ignored directory contributes no scanned path");
  assert.equal(scan.paths.includes("debug.log"), false, "an ignored file is not scanned");
  assert.equal(excludedFor(scan, "build")?.reason, "ignored");
  assert.equal(excludedFor(scan, "debug.log")?.reason, "ignored");
});

test("a directory link resolving outside the canonical root is refused and its sentinel is never read", async (context) => {
  const workspace = await scratch(context, "scan-escape");
  const allowed = join(workspace, "allowed");
  const outside = join(workspace, "outside");
  await mkdir(allowed, { recursive: true });
  await mkdir(outside, { recursive: true });
  const sentinel = join(outside, "SENTINEL");
  await writeFile(sentinel, SENTINEL_BYTES, "utf8");
  await writeFile(join(allowed, "keep.txt"), "kept\n", "utf8");

  const escape = join(allowed, "escape");
  if (!(await tryDirectoryLink(outside, escape))) {
    notRun.push({ fixture: "scan-escape", reason: "this host cannot create directory links without privileges" });
    context.skip("scan-escape fixture not run: directory links unavailable");
    return;
  }

  const before = await stat(sentinel);
  const root = await resolveCanonicalRoot(allowed);
  const scan = await scanProjectTree(root);
  const after = await stat(sentinel);

  assert.equal(scan.paths.includes("keep.txt"), true, "the in-root file is scanned");
  assert.equal(
    scan.paths.some((path) => path.includes("SENTINEL")),
    false,
    "the outside sentinel is absent from the scanned set",
  );
  assert.equal(after.mtimeMs, before.mtimeMs, "the outside sentinel was not touched");
  assert.equal(after.size, before.size, "the outside sentinel is byte-identical");
  assert.equal(excludedFor(scan, "escape")?.reason, "outside-canonical-root");
});

test("a self-referential directory link still terminates the walk", async (context) => {
  const workspace = await scratch(context, "scan-cycle");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");

  const loop = join(workspace, "loop");
  if (!(await tryDirectoryLink(workspace, loop))) {
    notRun.push({ fixture: "scan-cycle", reason: "this host cannot create directory links without privileges" });
    context.skip("scan-cycle fixture not run: directory links unavailable");
    return;
  }

  const root = await resolveCanonicalRoot(workspace);
  // Bounded, because the property under test is TERMINATION: a walk that never
  // returns must fail this assertion loudly rather than stall the suite.
  const scan = await boundedScan(root, 30000);

  assert.notEqual(scan, null, "the walk did not terminate within its budget");
  if (scan === null) return;
  assert.equal(scan.paths.includes("keep.txt"), true, "the walk still produced the real file");
  assert.equal(scan.paths.includes("loop/loop"), false, "the cycle did not recurse");
  // Plan 02-11 Task 3: a link is now refused as an alias BEFORE identity is
  // marked, so the cycle stops one rung earlier and with a more precise reason.
  // Termination is the property under test and it is unchanged.
  assert.equal(excludedFor(scan, "loop")?.reason, "alias-entry");
});

test("exceeding MAX_SCAN_DEPTH is reported as a named bound rather than a silent truncation", async (context) => {
  const workspace = await scratch(context, "scan-depth");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");
  const segments: string[] = [];
  for (let level = 1; level <= MAX_SCAN_DEPTH + 2; level += 1) segments.push(`d${level}`);
  await mkdir(join(workspace, ...segments), { recursive: true });
  await writeFile(join(workspace, ...segments, "deep.txt"), "deep\n", "utf8");

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "the shallow file is scanned");
  assert.equal(scan.paths.includes(`${segments.join("/")}/deep.txt`), false, "the over-deep file is not scanned");
  assert.equal(
    scan.bounds.some((record) => record.bound === "MAX_SCAN_DEPTH" && record.limit === MAX_SCAN_DEPTH),
    true,
    "the bound that was reached is named in the result",
  );
});

test("a path whose ignore decision is undecidable is excluded with its reason", async (context) => {
  const workspace = await scratch(context, "scan-undecidable");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");
  await mkdir(join(workspace, "sub"), { recursive: true });
  // A `.gitignore` past IGNORE_PATTERN_COUNT_CAP could not be taken on at all,
  // which makes the whole rule set unanswerable, and an unanswerable rule set
  // must never fall through to "not ignored" (Phase 1 D-01).
  //
  // The vehicle used to be a single pattern past IGNORE_PATTERN_LENGTH_CAP.
  // Plan 02-12 split that case out: one over-long LINE inside an otherwise
  // valid file is now a bounded note and the remaining patterns keep deciding,
  // so it no longer produces the `undecidable` state this test is about. The
  // assertion is unchanged; only the fixture that reaches it moved.
  const overCount: string[] = [];
  for (let index = 0; index <= IGNORE_PATTERN_COUNT_CAP; index += 1) overCount.push(`p${index}.tmp`);
  await writeFile(join(workspace, "sub", ".gitignore"), `${overCount.join("\n")}\n`, "utf8");
  await writeFile(join(workspace, "sub", "f.txt"), "content\n", "utf8");

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "an unaffected file is still scanned");
  assert.equal(scan.paths.includes("sub/f.txt"), false, "an undecidable path is not scanned");
  const excluded = excludedFor(scan, "sub/f.txt");
  assert.equal(excluded?.reason, "undecidable");
  assert.equal(typeof excluded?.detail, "string", "the reason that stopped the decision is carried");
});

// ---------------------------------------------------------------------------
// Plan 02-11 Task 3 (CR-02) — an alias can neither evict nor impersonate the
// directory it points at
// ---------------------------------------------------------------------------
//
// The walk used to mark a directory's identity by its CANONICAL target at the
// moment it was LISTED, in ascending name order. A junction `aaa -> src` is
// listed first, claims `src`'s identity, and the real `src` is then dropped as
// already-visited — so every `kind: directory` fact answers negatively and the
// emitted reason states that `src` does not exist while it demonstrably does.
// The truth being restored is that adding a link inside the canonical root
// changes NEITHER the collected fact set NOR the pack selection, in either sort
// position.

/**
 * A real project directory, optionally with a directory alias to `src` beside
 * it. `alias` is the alias's NAME, so a caller can put it either side of `src`
 * in ascending order and prove that name order decides nothing.
 */
async function aliasFixture(context: TestContext, alias: string | null): Promise<string | null> {
  const workspace = await scratch(context, "scan-alias");
  await writeFile(
    join(workspace, "package.json"),
    JSON.stringify({ name: "aliased", private: true, dependencies: { react: "19.0.0" } }),
    "utf8",
  );
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "index.ts"), "export {};\n", "utf8");
  if (alias !== null && !(await tryDirectoryLink(join(workspace, "src"), join(workspace, alias)))) {
    notRun.push({ fixture: "scan-alias", reason: "this host cannot create directory links without privileges" });
    context.skip("scan-alias fixture not run: directory links unavailable");
    return null;
  }
  return workspace;
}

test("an alias beside its target is excluded and the real directory survives", async (context) => {
  const workspace = await aliasFixture(context, "aaa");
  if (workspace === null) return;

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.directories.includes("src"), true, "the alias evicted the real directory");
  assert.equal(scan.directories.includes("aaa"), false, "the alias was walked as if it were content");
  assert.equal(scan.paths.includes("src/index.ts"), true, "the real directory's file is scanned");
  assert.equal(scan.paths.includes("aaa/index.ts"), false, "the alias added a second path for one file");

  const excluded = excludedFor(scan, "aaa");
  assert.equal(excluded?.reason, "alias-entry");
  assert.ok(
    (excluded?.detail ?? "").includes("src"),
    `the exclusion record does not name what the alias pointed at: ${String(excluded?.detail)}`,
  );
});

test("an alias sorting after its target produces the identical scan as one sorting before it", async (context) => {
  const before = await aliasFixture(context, "aaa");
  if (before === null) return;
  const after = await aliasFixture(context, "zzz");
  if (after === null) return;
  const none = await aliasFixture(context, null);
  if (none === null) return;

  const scanBefore = await scanProjectTree(await resolveCanonicalRoot(before));
  const scanAfter = await scanProjectTree(await resolveCanonicalRoot(after));
  const scanNone = await scanProjectTree(await resolveCanonicalRoot(none));

  assert.deepEqual(scanBefore.directories, scanNone.directories, "an alias before its target changed the walk");
  assert.deepEqual(scanAfter.directories, scanNone.directories, "an alias after its target changed the walk");
  assert.deepEqual(scanBefore.paths, scanNone.paths);
  assert.deepEqual(scanAfter.paths, scanNone.paths);
});

test("an aliased FILE adds no second path for the file it points at", async (context) => {
  const workspace = await scratch(context, "scan-file-alias");
  await writeFile(join(workspace, "package.json"), JSON.stringify({ name: "f" }), "utf8");
  await writeFile(join(workspace, "real.ts"), "export {};\n", "utf8");
  let linked = false;
  try {
    await symlink(join(workspace, "real.ts"), join(workspace, "aaa.ts"), "file");
    linked = existsSync(join(workspace, "aaa.ts"));
  } catch {
    linked = false;
  }
  if (!linked) {
    notRun.push({ fixture: "scan-file-alias", reason: "this host cannot create file links without privileges" });
    context.skip("scan-file-alias fixture not run: file links unavailable");
    return;
  }

  const scan = await scanProjectTree(await resolveCanonicalRoot(workspace));

  assert.equal(scan.files.includes("real.ts"), true, "the real file was dropped");
  assert.equal(scan.files.includes("aaa.ts"), false, "a linked file added a second path for one file");
  assert.equal(excludedFor(scan, "aaa.ts")?.reason, "alias-entry");
});

test("two directories named in NFD and NFC form are two scan entries and two digest inputs", async (context) => {
  const workspace = await scratch(context, "scan-unicode");
  await writeFile(join(workspace, "package.json"), JSON.stringify({ name: "u" }), "utf8");
  // "é": composed (NFC, one code point) and decomposed (NFD, e + U+0301).
  const composed = "café";
  const decomposed = "café";
  await mkdir(join(workspace, composed), { recursive: true });
  await writeFile(join(workspace, composed, "index.ts"), "export {};\n", "utf8");
  await mkdir(join(workspace, decomposed), { recursive: true });
  await writeFile(join(workspace, decomposed, "index.ts"), "export {};\n", "utf8");

  const scan = await scanProjectTree(await resolveCanonicalRoot(workspace));
  const both = scan.directories.includes(composed) && scan.directories.includes(decomposed);
  if (!both) {
    // The contract asserted here is that alpha-AOS applies NO normalization of
    // its own. A host whose filesystem folds the two forms into one entry
    // cannot observe it; the cross-host case belongs to the Phase 7 three-OS
    // matrix, not to a silent pass here.
    notRun.push({
      fixture: "scan-unicode",
      reason: "this host folds Unicode names, so NFD and NFC resolve to one directory",
    });
    context.skip("scan-unicode fixture not run: this host folds Unicode path names");
    return;
  }

  assert.notEqual(composed, decomposed, "the two forms are distinct strings before any digest sees them");
  assert.equal(scan.paths.includes(`${composed}/index.ts`), true);
  assert.equal(scan.paths.includes(`${decomposed}/index.ts`), true);
  // No normalization of alpha-AOS's own: the two entries are distinct as
  // reported, and only a normalization the tool never applies would fold them.
  assert.equal(
    scan.paths.filter((path) => path.normalize("NFC") === `${composed}/index.ts`).length,
    2,
    "the two forms did not survive as two distinct entries",
  );

  // `scan.paths` is the input every path predicate and every path-bearing fact
  // is decided from, so two fixtures differing only in normalization form must
  // hash differently. Same-host only; the cross-host case is Phase 7's.
  const single = await scratch(context, "scan-unicode-one");
  await writeFile(join(single, "package.json"), JSON.stringify({ name: "u" }), "utf8");
  await mkdir(join(single, composed), { recursive: true });
  await writeFile(join(single, composed, "index.ts"), "export {};\n", "utf8");
  const singleScan = await scanProjectTree(await resolveCanonicalRoot(single));
  const digestOf = (paths: readonly string[]): string =>
    createHash("sha256").update(JSON.stringify(paths), "utf8").digest("hex");
  assert.notEqual(digestOf(scan.paths), digestOf(singleScan.paths), "the two forms produced one digest input");
});

// ---------------------------------------------------------------------------
// Task 3 — sub-project discovery: declaration first, scan as the safety net
// ---------------------------------------------------------------------------

async function writeProject(directory: string, fileName: string, content: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, fileName), content, "utf8");
}

function pathsOf(discovery: SubProjectDiscovery): readonly string[] {
  return discovery.subProjects.map((member) => member.path);
}

function declaredPathsOf(discovery: SubProjectDiscovery): readonly string[] {
  return discovery.subProjects.filter((member) => member.declaredBy !== null).map((member) => member.path);
}

test("package.json workspaces globs expand to the declared members", async (context) => {
  const workspace = await scratch(context, "ws-npm");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
  await writeProject(join(workspace, "packages", "a"), "package.json", JSON.stringify({ name: "a" }));
  await writeProject(join(workspace, "packages", "b"), "package.json", JSON.stringify({ name: "b" }));

  const root = await resolveCanonicalRoot(workspace);
  const declarations = await readWorkspaceDeclaration(root);
  assert.deepEqual(declarations.map((entry) => entry.ecosystem), ["npm"]);
  assert.deepEqual(declarations[0]?.source, "package.json");

  const discovery = await discoverSubProjects(root);
  assert.deepEqual(declaredPathsOf(discovery), ["packages/a", "packages/b"]);
  assert.equal(discovery.subProjects[0]?.declarationFile, "package.json");
});

test("pnpm-workspace.yaml packages expands and a negated entry removes a matched member", async (context) => {
  const workspace = await scratch(context, "ws-pnpm");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root" }));
  await writeProject(workspace, "pnpm-workspace.yaml", "packages:\n  - 'packages/*'\n  - '!**/test/**'\n");
  await writeProject(join(workspace, "packages", "app"), "package.json", JSON.stringify({ name: "app" }));
  await writeProject(join(workspace, "packages", "test"), "package.json", JSON.stringify({ name: "test" }));

  const root = await resolveCanonicalRoot(workspace);
  const declarations = await readWorkspaceDeclaration(root);
  assert.deepEqual(declarations.map((entry) => entry.ecosystem), ["pnpm"]);
  assert.deepEqual(declarations[0]?.exclude, ["**/test/**"]);

  const discovery = await discoverSubProjects(root);
  assert.deepEqual(pathsOf(discovery), ["packages/app"], "the negated entry removed a previously matched member");
});

test("Cargo.toml workspace members expand, exclude removes, and a virtual workspace is handled", async (context) => {
  const workspace = await scratch(context, "ws-cargo");
  await writeProject(
    workspace,
    "Cargo.toml",
    '[workspace]\nmembers = ["crates/*"]\nexclude = ["crates/scratch"]\n',
  );
  await writeProject(join(workspace, "crates", "core"), "Cargo.toml", '[package]\nname = "core"\n');
  await writeProject(join(workspace, "crates", "cli"), "Cargo.toml", '[package]\nname = "cli"\n');
  await writeProject(join(workspace, "crates", "scratch"), "Cargo.toml", '[package]\nname = "scratch"\n');

  const root = await resolveCanonicalRoot(workspace);
  const declarations = await readWorkspaceDeclaration(root);
  assert.deepEqual(declarations.map((entry) => entry.ecosystem), ["cargo"]);
  assert.deepEqual(declarations[0]?.exclude, ["crates/scratch"]);

  const discovery = await discoverSubProjects(root);
  assert.deepEqual(pathsOf(discovery), ["crates/cli", "crates/core"]);
});

test("go.work use entries are literal directories and a subdirectory of one is not a member", async (context) => {
  const workspace = await scratch(context, "ws-go");
  await writeProject(workspace, "go.work", "go 1.22\n\nuse (\n\t./svc\n)\n");
  await writeProject(join(workspace, "svc"), "go.mod", "module example.com/svc\n\ngo 1.22\n");
  await writeProject(join(workspace, "svc", "inner"), "go.mod", "module example.com/svc/inner\n\ngo 1.22\n");

  const root = await resolveCanonicalRoot(workspace);
  const declarations = await readWorkspaceDeclaration(root);
  assert.deepEqual(declarations.map((entry) => entry.ecosystem), ["go"]);
  assert.equal(declarations[0]?.literal, true, "use entries are literal directories, never globs");

  const discovery = await discoverSubProjects(root);
  assert.deepEqual(declaredPathsOf(discovery), ["svc"]);
  assert.equal(pathsOf(discovery).includes("svc/inner"), false, "a subdirectory of a use argument is not a member");
});

test("pyproject.toml uv workspace members expand and exclude removes", async (context) => {
  const workspace = await scratch(context, "ws-uv");
  await writeProject(
    workspace,
    "pyproject.toml",
    '[project]\nname = "root"\nversion = "0.1.0"\n\n[tool.uv.workspace]\nmembers = ["packages/*"]\nexclude = ["packages/seeds"]\n',
  );
  await writeProject(join(workspace, "packages", "lib"), "pyproject.toml", '[project]\nname = "lib"\n');
  await writeProject(join(workspace, "packages", "seeds"), "pyproject.toml", '[project]\nname = "seeds"\n');

  const root = await resolveCanonicalRoot(workspace);
  const declarations = await readWorkspaceDeclaration(root);
  assert.deepEqual(declarations.map((entry) => entry.ecosystem), ["uv"]);

  const discovery = await discoverSubProjects(root);
  assert.deepEqual(pathsOf(discovery), ["packages/lib"]);
});

test("a workspaces entry escaping the canonical root is reported and dropped, and nothing outside is read", async (context) => {
  const enclosing = await scratch(context, "ws-escape");
  const outside = join(enclosing, "outside");
  await mkdir(outside, { recursive: true });
  const sentinel = join(outside, "SENTINEL");
  await writeFile(sentinel, SENTINEL_BYTES, "utf8");

  const workspace = join(enclosing, "repo");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root", workspaces: ["../../.."] }));

  const before = await stat(sentinel);
  const root = await resolveCanonicalRoot(workspace);
  const discovery = await discoverSubProjects(root);
  const after = await stat(sentinel);

  assert.deepEqual(declaredPathsOf(discovery), [], "no declared member survived the boundary proof");
  assert.equal(discovery.dropped.length, 1, "the escaping entry is reported, not silently ignored");
  assert.equal(discovery.dropped[0]?.declared, "../../..");
  assert.match(discovery.dropped[0]?.reason ?? "", /outside/u);
  assert.equal(after.mtimeMs, before.mtimeMs, "nothing outside the canonical root was touched");
  assert.equal(after.size, before.size, "the outside sentinel is byte-identical");
});

test("a declaration listing a non-existent member reports the drop and the fallback still finds the undeclared one", async (context) => {
  const workspace = await scratch(context, "ws-stale");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root", workspaces: ["packages/gone"] }));
  await writeProject(join(workspace, "packages", "real"), "package.json", JSON.stringify({ name: "real" }));

  const root = await resolveCanonicalRoot(workspace);
  const discovery = await discoverSubProjects(root);

  assert.equal(
    discovery.dropped.some((entry) => entry.declared === "packages/gone"),
    true,
    "the stale entry is reported with a reason",
  );
  assert.deepEqual(pathsOf(discovery), ["packages/real"], "a stale declaration cannot make a real sub-project invisible");
  assert.equal(discovery.subProjects[0]?.declaredBy, null, "the fallback scan found it, not the declaration");
});

test("an explicit target that is not among the discovered sub-projects is refused with the options named", async (context) => {
  const workspace = await scratch(context, "ws-target");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
  await writeProject(join(workspace, "packages", "real"), "package.json", JSON.stringify({ name: "real" }));

  const root = await resolveCanonicalRoot(workspace);
  await assert.rejects(
    () => discoverSubProjects(root, { target: "packages/nope" }),
    (error: unknown) => {
      assert.equal(error instanceof Error, true);
      assert.match((error as Error).message, /packages\/real/u, "the refusal names the discovered options");
      return true;
    },
    "an unrecognised target is a refusal, never a guess",
  );

  const selected = await discoverSubProjects(root, { target: "packages/real" });
  assert.equal(selected.selected?.path, "packages/real");
});

test("no target from a repository root returns the sub-project list with none selected", async (context) => {
  const workspace = await scratch(context, "ws-list");
  await writeProject(workspace, "package.json", JSON.stringify({ name: "root", workspaces: ["packages/*"] }));
  await writeProject(join(workspace, "packages", "a"), "package.json", JSON.stringify({ name: "a" }));
  await writeProject(join(workspace, "packages", "b"), "package.json", JSON.stringify({ name: "b" }));

  const root = await resolveCanonicalRoot(workspace);
  const cache = new ProjectReadCache();
  const first = await discoverSubProjects(root, { cache });

  assert.equal(first.selected, null, "nothing is selected until the user names it");
  assert.deepEqual(pathsOf(first), ["packages/a", "packages/b"]);

  // One read cache keyed by canonical path is shared across sub-projects, so a
  // file read once is not read again.
  const hitsBefore = cache.hits;
  await discoverSubProjects(root, { cache });
  assert.equal(cache.hits > hitsBefore, true, "the shared read cache served the second discovery");
});

test.after(() => {
  if (notRun.length === 0) return;
  // A skipped fixture must be visible in output; an absent one is not, and a
  // containment case that silently stops running is how a guarantee lapses.
  for (const record of notRun) {
    process.stderr.write(`fixture not run: ${record.fixture} — ${record.reason}\n`);
  }
});

// ---------------------------------------------------------------------------
// Plan 02-06 Task 1 — the six detector kinds and five manifest readers
// ---------------------------------------------------------------------------
//
// The fixtures below are real temporary files, because the question under test
// is what a detector observes on a filesystem, not what a mock agreed to say.
// Every expectation is stated against `catalog/facts.yaml` as the repository
// declares it: the detector KINDS are the code under test, and the detector
// INSTANCES arrive as data.

/** Writes a nested `{ "a/b.txt": "..." }` tree, creating parent directories. */
async function writeTree(root: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const relativePath of Object.keys(files).sort()) {
    const absolute = join(root, ...relativePath.split("/"));
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, files[relativePath] as string, "utf8");
  }
}

async function vocabulary(): Promise<FactVocabulary> {
  return (await loadFactVocabularyStrict(repositoryRoot)).value;
}

/** A scratch repository, scanned, with every declared fact detected once. */
async function factsIn(
  context: TestContext,
  files: Readonly<Record<string, string>>,
): Promise<Map<string, FactDetection>> {
  const root = await scratch(context, "facts");
  await writeTree(root, files);
  const canonical = await resolveCanonicalRoot(root);
  const scan = await scanProjectTree(canonical);
  const detected = await detectProjectFacts(canonical, scan, await vocabulary());
  return new Map(detected.detections.map((detection) => [detection.id, detection]));
}

/** A scratch repository with a detection context open over it. */
async function contextIn(
  context: TestContext,
  files: Readonly<Record<string, string>>,
): Promise<DetectionContext> {
  const root = await scratch(context, "facts");
  await writeTree(root, files);
  const canonical = await resolveCanonicalRoot(root);
  return openDetectionContext(canonical, await scanProjectTree(canonical));
}

test("a dependency fact resolves from package.json and records the declared range", async (context) => {
  const facts = await factsIn(context, {
    "package.json": `${JSON.stringify({ name: "f", dependencies: { pg: "^8.11.0" }, devDependencies: { next: "15.0.0" } })}\n`,
  });

  const postgres = facts.get("postgres-driver");
  assert.equal(postgres?.detected, true);
  assert.equal(postgres?.path, "package.json");
  assert.equal(postgres?.version, "^8.11.0", "the record carries the declared range verbatim");

  // devDependencies is a declared section, not a second-class one.
  assert.equal(facts.get("web-framework")?.detected, true);
  assert.equal(facts.get("web-framework")?.version, "15.0.0");
});

test("the same dependency fact id resolves from pyproject.toml and from requirements.txt", async (context) => {
  const fromProject = await factsIn(context, {
    "pyproject.toml": [
      "[project]",
      'name = "svc"',
      'version = "0.1.0"',
      'dependencies = ["psycopg2-binary>=2.9", "flask==3.0.0"]',
      "",
    ].join("\n"),
  });
  assert.equal(fromProject.get("postgres-driver")?.detected, true);
  assert.equal(fromProject.get("postgres-driver")?.path, "pyproject.toml");
  assert.equal(fromProject.get("postgres-driver")?.version, ">=2.9");
  assert.equal(fromProject.get("server-framework")?.detected, true, "flask is a declared server framework");

  const fromPoetry = await factsIn(context, {
    "pyproject.toml": ['[tool.poetry.dependencies]', 'asyncpg = "^0.29.0"', ""].join("\n"),
  });
  assert.equal(fromPoetry.get("postgres-driver")?.detected, true);
  assert.equal(fromPoetry.get("postgres-driver")?.version, "^0.29.0");

  const fromRequirements = await factsIn(context, {
    "requirements.txt": ["# runtime", "-r other.txt", "asyncpg==0.29.0", "django>=5.0 ; python_version >= '3.11'", ""].join("\n"),
  });
  assert.equal(fromRequirements.get("postgres-driver")?.detected, true);
  assert.equal(fromRequirements.get("postgres-driver")?.path, "requirements.txt");
  assert.equal(fromRequirements.get("postgres-driver")?.version, "==0.29.0");
  assert.equal(fromRequirements.get("server-framework")?.detected, true);
});

test("a Go module in go.mod and a crate in Cargo.toml both resolve", async (context) => {
  const fromGo = await factsIn(context, {
    "go.mod": [
      "module example.com/app",
      "",
      "go 1.23",
      "",
      "require (",
      "\tgithub.com/redis/go-redis/v9 v9.5.1 // indirect",
      ")",
      "",
      "require github.com/gin-gonic/gin v1.10.0",
      "",
    ].join("\n"),
  });
  assert.equal(fromGo.get("redis-client")?.detected, true);
  assert.equal(fromGo.get("redis-client")?.path, "go.mod");
  assert.equal(fromGo.get("redis-client")?.version, "v9.5.1");
  assert.equal(fromGo.get("server-framework")?.detected, true, "a single-line require is a require too");

  const fromCargo = await factsIn(context, {
    "Cargo.toml": [
      "[package]",
      'name = "app"',
      'version = "0.1.0"',
      "",
      "[dependencies]",
      'actix-web = "4.5"',
      "",
      "[dev-dependencies]",
      'axum = { version = "0.7.5", features = ["macros"] }',
      "",
    ].join("\n"),
  });
  assert.equal(fromCargo.get("server-framework")?.detected, true);
  assert.equal(fromCargo.get("server-framework")?.path, "Cargo.toml");
  assert.equal(fromCargo.get("server-framework")?.version, "4.5");
});

test("a file fact records which of its declared alternatives matched", async (context) => {
  const facts = await factsIn(context, { "docs/openapi.yaml": "openapi: 3.1.0\n" });
  assert.equal(facts.get("openapi")?.detected, true);
  assert.equal(facts.get("openapi")?.path, "docs/openapi.yaml", "the matched alternative is named, not the fact id");
});

test("a directory fact matches a directory and never a file bearing its name", async (context) => {
  const asFile = await factsIn(context, { evals: "this is a file, not a directory\n" });
  assert.equal(asFile.get("eval-assets")?.detected, false);
  assert.ok((asFile.get("eval-assets")?.reason ?? "").length > 0);

  const asDirectory = await factsIn(context, { "evals/case-01.json": "{}\n" });
  assert.equal(asDirectory.get("eval-assets")?.detected, true);
  assert.equal(asDirectory.get("eval-assets")?.path, "evals");
});

test("a manifestKey fact contributes only from a current, valid project manifest", async (context) => {
  const declaration: FactDeclaration = {
    id: "manifest:scientificResearch",
    kind: "manifestKey",
    manifestKey: "scientificResearch",
  };

  const current = await contextIn(context, {
    ".alpha-aos/stack.yaml": "schemaVersion: 1\nscientificResearch: true\n",
  });
  const detected = await detectFact(current, declaration);
  assert.equal(detected.detected, true);
  assert.equal(detected.path, ".alpha-aos/stack.yaml");
  assert.equal(detected.version, "1", "the record's version is the manifest schemaVersion");

  const invalid = await contextIn(context, {
    ".alpha-aos/stack.yaml": "schemaVersion: 1\nscientificResearch: true\nscientificResearch: false\n",
  });
  const refused = await detectFact(invalid, declaration);
  assert.equal(refused.detected, false, "an invalid manifest contributes nothing rather than what parsed");
  assert.ok((refused.reason ?? "").length > 0);

  const absent = await contextIn(context, { "README.md": "# no manifest\n" });
  assert.equal((await detectFact(absent, declaration)).detected, false);
});

test("a fileAbsent fact detects the absence of every declared alternative", async (context) => {
  const bare = await factsIn(context, { "README.md": "# service\n" });
  assert.equal(bare.get("missing-conventions-document")?.detected, true, "absence is the detection");

  const documented = await factsIn(context, { "CONVENTIONS.md": "# conventions\n" });
  const fact = documented.get("missing-conventions-document");
  assert.equal(fact?.detected, false);
  assert.equal(fact?.path, "CONVENTIONS.md");
  assert.ok((fact?.reason ?? "").length > 0);
});

test("a fileContent fact reports where it matched and cannot represent what it matched", async (context) => {
  const facts = await factsIn(context, {
    ".env.example": "DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app\n",
  });

  const dsn = facts.get("postgres-dsn");
  assert.equal(dsn?.detected, true);
  assert.equal(dsn?.path, ".env.example");
  assert.equal(
    JSON.stringify(dsn).includes("hunter2"),
    false,
    "a fileContent detection must not carry the matched text anywhere",
  );

  // The return type itself is the first net: there is no field to leak from.
  const match = matchDeclaredContent(".env.example", "postgres://admin:hunter2@db/app", [/postgres:\/\//u]);
  assert.equal(match.matched, true);
  assert.deepEqual(Object.keys(match).sort(), ["matched", "path"]);
});

test("an evidence file over MAX_EVIDENCE_FILE_BYTES is not matched and the cap is the reason", async (context) => {
  const facts = await factsIn(context, {
    ".env.example": `${"#".repeat(MAX_EVIDENCE_FILE_BYTES)}\nDATABASE_URL=postgres://db/app\n`,
  });

  const dsn = facts.get("postgres-dsn");
  assert.equal(dsn?.detected, false);
  assert.match(dsn?.reason ?? "", /MAX_EVIDENCE_FILE_BYTES/u);
});

test("an evidence file that exists but cannot be read is UNDECIDABLE, never a confident absence", async (context) => {
  // A directory bearing a manifest's name exists and is not readable AS a file
  // on every supported host, so this case needs no privileged fixture.
  const facts = await factsIn(context, { "package.json/placeholder.txt": "not a manifest\n" });

  const postgres = facts.get("postgres-driver");
  assert.equal(postgres?.detected, false);
  assert.notEqual(postgres?.undecidable, null, "an unreadable manifest is undecidable, not absent");
  assert.notEqual(postgres?.undecidable?.errno, "ENOENT");
  assert.equal(postgres?.undecidable?.path, "package.json");
  assert.match(postgres?.reason ?? "", /UNDECIDABLE/u);
  assert.match(postgres?.reason ?? "", new RegExp(postgres?.undecidable?.errno ?? "IMPOSSIBLE", "u"));
  assert.match(postgres?.reason ?? "", /package\.json/u);
});

// ---------------------------------------------------------------------------
// Plan 02-06 Task 2 — the complete envelope: positive, negative, ordered, digested
// ---------------------------------------------------------------------------

/** A rich fixture: several kinds detected, several deliberately not. */
const RICH_FIXTURE: Readonly<Record<string, string>> = {
  "package.json": `${JSON.stringify({ name: "rich", dependencies: { next: "^15.0.0", pg: "^8.11.0" } })}\n`,
  "src/index.ts": "export const ok = true;\n",
  "docs/openapi.yaml": "openapi: 3.1.0\n",
  "prisma/migrations/0001_init/migration.sql": "-- init\n",
  ".env.example": "DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app\n",
  "AGENTS.md": "# instructions\n",
};

async function envelopeIn(
  context: TestContext,
  files: Readonly<Record<string, string>>,
): Promise<EvidenceEnvelope> {
  const root = await scratch(context, "envelope");
  await writeTree(root, files);
  return collectProjectEvidence(await resolveCanonicalRoot(root));
}

/**
 * Every invariant below is a claim about the COMPLETE envelope. Asserting it
 * over a partial one would let a shrinking fact set pass every net it has.
 */
async function assertCoversVocabulary(envelope: EvidenceEnvelope): Promise<void> {
  assert.equal(
    envelope.facts.length,
    (await vocabulary()).facts.length,
    "the envelope must answer for every declared fact before any other claim about it holds",
  );
}

test("the evidence envelope validates against schemas/evidence.schema.json as a current document", async (context) => {
  const envelope = await envelopeIn(context, RICH_FIXTURE);
  const schema = JSON.parse(
    await readFile(join(repositoryRoot, "schemas", "evidence.schema.json"), "utf8"),
  ) as Record<string, unknown>;

  const result = validateManagedDocument({
    text: JSON.stringify(envelope),
    format: "json",
    kind: "evidence",
    schema,
  });

  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.status, "current");
  await assertCoversVocabulary(envelope);
  assert.ok(envelope.facts.some((fact) => fact.detected), "a positive record must validate");
  assert.ok(envelope.facts.some((fact) => !fact.detected), "a negative record must validate too");
});

test("every fact declared in catalog/facts.yaml appears in the envelope exactly once", async (context) => {
  const declared = (await vocabulary()).facts.map((fact) => fact.id).sort();

  for (const fixture of [RICH_FIXTURE, {}]) {
    const envelope = await envelopeIn(context, fixture);
    assert.equal(envelope.facts.length, declared.length, "one record per declared fact, positive or negative");
    assert.deepEqual(envelope.facts.map((fact) => fact.id).sort(), declared);
  }
});

test("every negative record carries a reason", async (context) => {
  const envelope = await envelopeIn(context, RICH_FIXTURE);
  const negatives = envelope.facts.filter((fact) => !fact.detected);

  assert.ok(negatives.length > 0, "the fixture must exercise the negative path");
  for (const fact of negatives) {
    assert.ok((fact.reason ?? "").length >= 1, `${fact.id} was not detected and said nothing about why`);
  }
});

test("no record carries a per-fact hash", async (context) => {
  const envelope = await envelopeIn(context, RICH_FIXTURE);
  await assertCoversVocabulary(envelope);
  for (const fact of envelope.facts) {
    assert.equal(Object.hasOwn(fact, "hash"), false, `${fact.id} carries a hash (D-07)`);
  }
});

test("a repository containing nothing still answers for every declared fact", async (context) => {
  const envelope = await envelopeIn(context, {});
  assert.equal(envelope.facts.length, (await vocabulary()).facts.length);

  for (const fact of envelope.facts) {
    if (fact.kind === "fileAbsent") {
      // Absence IS this kind's detection, so an empty directory detects it.
      assert.equal(fact.detected, true, `${fact.id} should detect the absence it names`);
      continue;
    }
    assert.equal(fact.detected, false, `${fact.id} was detected in an empty directory`);
    assert.ok((fact.reason ?? "").length >= 1);
  }
});

test("two runs over an unchanged repository agree on facts and sourceHash while createdAt differs", async (context) => {
  const root = await scratch(context, "stable");
  await writeTree(root, RICH_FIXTURE);
  const canonical = await resolveCanonicalRoot(root);

  const first = await collectProjectEvidence(canonical);
  // The clock is the only thing allowed to move between the two runs.
  await sleep(2);
  const second = await collectProjectEvidence(canonical);

  await assertCoversVocabulary(first);

  assert.deepEqual(second.facts, first.facts, "the same repository must answer the same way");
  assert.equal(second.sourceHash, first.sourceHash);
  assert.notEqual(second.createdAt, first.createdAt, "createdAt is wall-clock context, not content");
});

test("a gitignored evidence file contributes no fact and an unignored one does", async (context) => {
  const ignored = await envelopeIn(context, {
    ".gitignore": "openapi.yaml\n",
    "openapi.yaml": "openapi: 3.1.0\n",
  });
  const ignoredFact = ignored.facts.find((fact) => fact.id === "openapi");
  assert.equal(ignoredFact?.detected, false, "an ignored file is not this project's evidence");

  const tracked = await envelopeIn(context, { "openapi.yaml": "openapi: 3.1.0\n" });
  const trackedFact = tracked.facts.find((fact) => fact.id === "openapi");
  assert.equal(trackedFact?.detected, true, "the same file, uncommitted but unignored, is evidence");
  assert.equal(trackedFact?.path, "openapi.yaml");
});

test("facts are emitted in one total order — ascending id, then ascending path", async (context) => {
  const envelope = await envelopeIn(context, RICH_FIXTURE);
  await assertCoversVocabulary(envelope);
  const keys = envelope.facts.map((fact) => [fact.id, fact.path ?? ""] as const);
  const sorted = [...keys].sort((left, right) => {
    if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
    return left[1] < right[1] ? -1 : left[1] > right[1] ? 1 : 0;
  });

  assert.deepEqual(keys, sorted, "no Set, Map or readdir order may reach the emitted array");
});
