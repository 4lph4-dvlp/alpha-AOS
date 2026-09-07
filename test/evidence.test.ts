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
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExcludedBoundary, ProjectTreeScan } from "../src/core/evidence.js";
import { MAX_SCAN_DEPTH, resolveCanonicalRoot, scanProjectTree } from "../src/core/evidence.js";
import {
  createLinkedWorktree,
  createNestedRepository,
  createOrdinaryRepository,
  createSubmodule,
  gitAvailability,
} from "./helpers/git-fixture.js";

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

test("a self-referential directory link terminates the walk on visited identity", async (context) => {
  const workspace = await scratch(context, "scan-cycle");
  await writeFile(join(workspace, "keep.txt"), "kept\n", "utf8");

  const loop = join(workspace, "loop");
  if (!(await tryDirectoryLink(workspace, loop))) {
    notRun.push({ fixture: "scan-cycle", reason: "this host cannot create directory links without privileges" });
    context.skip("scan-cycle fixture not run: directory links unavailable");
    return;
  }

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "the walk still produced the real file");
  assert.equal(scan.paths.includes("loop/loop"), false, "the cycle did not recurse");
  assert.equal(excludedFor(scan, "loop")?.reason, "visited-identity");
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
  // A pattern past IGNORE_PATTERN_LENGTH_CAP makes the whole rule set
  // unanswerable, and an unanswerable rule set must never fall through to
  // "not ignored" (Phase 1 D-01).
  await writeFile(join(workspace, "sub", ".gitignore"), `${"a".repeat(2048)}\n`, "utf8");
  await writeFile(join(workspace, "sub", "f.txt"), "content\n", "utf8");

  const root = await resolveCanonicalRoot(workspace);
  const scan = await scanProjectTree(root);

  assert.equal(scan.paths.includes("keep.txt"), true, "an unaffected file is still scanned");
  assert.equal(scan.paths.includes("sub/f.txt"), false, "an undecidable path is not scanned");
  const excluded = excludedFor(scan, "sub/f.txt");
  assert.equal(excluded?.reason, "undecidable");
  assert.equal(typeof excluded?.detail, "string", "the reason that stopped the decision is carried");
});

test.after(() => {
  if (notRun.length === 0) return;
  // A skipped fixture must be visible in output; an absent one is not, and a
  // containment case that silently stops running is how a guarantee lapses.
  for (const record of notRun) {
    process.stderr.write(`fixture not run: ${record.fixture} — ${record.reason}\n`);
  }
});
