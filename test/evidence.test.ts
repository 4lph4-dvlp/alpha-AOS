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
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
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

test.after(() => {
  if (notRun.length === 0) return;
  // A skipped fixture must be visible in output; an absent one is not, and a
  // containment case that silently stops running is how a guarantee lapses.
  for (const record of notRun) {
    process.stderr.write(`fixture not run: ${record.fixture} — ${record.reason}\n`);
  }
});
