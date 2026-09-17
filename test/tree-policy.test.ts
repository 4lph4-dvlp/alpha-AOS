import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  canonicalizeTreePath,
  comparablePath,
  computeTreeId,
  listTreePolicies,
  loadTreeRegistry,
  removeTreePolicy,
  resolveEffectivePolicy,
  saveTreeRegistry,
  setTreePolicy,
  treeRegistryPath,
  withinTreeRoot,
} from "../src/core/tree-policy.js";
import type { TreeRegistry } from "../src/types.js";

test("empty registry initializes with schemaVersion 1 and empty trees list", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");

  const registry = await loadTreeRegistry(stateRoot);
  assert.equal(registry.schemaVersion, 1);
  assert.equal(Array.isArray(registry.trees), true);
  assert.equal(registry.trees.length, 0);
  assert.ok(typeof registry.updatedAt === "string");
});

test("schema validation rejects invalid documents", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  await mkdir(stateRoot, { recursive: true });

  // 1. Unknown property at top-level
  const badTop = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trees: [],
    unknownField: "malformed",
  };
  await writeFile(treeRegistryPath(stateRoot), JSON.stringify(badTop), "utf8");
  await assert.rejects(() => loadTreeRegistry(stateRoot), /schema\.unknown-core-field/u);

  // 2. Malformed 16-hex tree ID (not 16 chars or non-hex)
  const badId = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trees: [
      {
        id: "not-a-valid-16-hex-id",
        path: "/valid/path",
        mode: "off",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  await writeFile(treeRegistryPath(stateRoot), JSON.stringify(badId), "utf8");
  await assert.rejects(() => loadTreeRegistry(stateRoot), /pattern/u);

  // 3. Invalid mode
  const badMode = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trees: [
      {
        id: "0123456789abcdef",
        path: "/valid/path",
        mode: "invalid-mode",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  };
  await writeFile(treeRegistryPath(stateRoot), JSON.stringify(badMode), "utf8");
  await assert.rejects(() => loadTreeRegistry(stateRoot), /enum/u);
});

test("setting a tree policy creates entry in trees.json without modifying target repo files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repoDir = join(root, "my-repo");
  await mkdir(repoDir, { recursive: true });
  await writeFile(join(repoDir, "README.md"), "# Test Repo\n", "utf8");

  const entry = await setTreePolicy(repoDir, "off", { stateRoot, notes: "Private repo" });
  assert.equal(entry.mode, "off");
  assert.equal(entry.notes, "Private repo");
  assert.ok(/^[0-9a-f]{16}$/.test(entry.id));

  // Verify trees.json persisted
  const registry = await loadTreeRegistry(stateRoot);
  assert.equal(registry.trees.length, 1);
  assert.equal(registry.trees[0]?.id, entry.id);
  assert.equal(registry.trees[0]?.mode, "off");

  // Verify target repo directory was NOT modified at all (D-01)
  const repoFiles = await readdir(repoDir);
  assert.deepEqual(repoFiles, ["README.md"]);
});

test("symlinks and relative paths resolve to identical canonical path and tree ID", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const targetDir = join(root, "real-target");
  await mkdir(targetDir, { recursive: true });

  const linkDir = join(root, "symlink-target");
  try {
    await symlink(targetDir, linkDir, "dir");
  } catch (err) {
    // On Windows without Developer Mode, symlink may fail; if so, skip symlink assertion
    if ((err as NodeJS.ErrnoException).code === "EPERM") {
      return;
    }
    throw err;
  }

  const canonicalTarget = await canonicalizeTreePath(targetDir);
  const canonicalLink = await canonicalizeTreePath(linkDir);
  assert.equal(comparablePath(canonicalLink), comparablePath(canonicalTarget));
  assert.equal(computeTreeId(canonicalLink), computeTreeId(canonicalTarget));
});

test("case normalization matches on case-insensitive platforms", async (context) => {
  const isCaseInsensitive = process.platform === "win32" || process.platform === "darwin";
  if (!isCaseInsensitive) return;

  const pathA = "C:\\Projects\\MyApp";
  const pathB = "c:\\projects\\myapp";
  assert.equal(comparablePath(pathA), comparablePath(pathB));
  assert.equal(computeTreeId(pathA), computeTreeId(pathB));
  assert.equal(withinTreeRoot(pathA, "c:\\projects\\myapp\\src\\index.ts"), true);
});

test("nearest ancestor (LPM) inheritance and nested overrides", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");

  const repo = join(root, "monorepo");
  const pkgManaged = join(repo, "packages", "managed-pkg");
  const pkgOther = join(repo, "packages", "other-pkg");
  await mkdir(join(pkgManaged, "src"), { recursive: true });
  await mkdir(join(pkgOther, "src"), { recursive: true });

  // 1. Register /monorepo as 'off'
  await setTreePolicy(repo, "off", { stateRoot });

  // 2. Query unnested path in monorepo
  const list1 = await listTreePolicies(stateRoot);
  const policyOther = await resolveEffectivePolicy(join(pkgOther, "src"), list1);
  assert.equal(policyOther.effectiveMode, "off");
  assert.equal(policyOther.inherited, true);
  assert.equal(policyOther.depth, 1);

  // 3. Register nested override: /monorepo/packages/managed-pkg as 'managed'
  await setTreePolicy(pkgManaged, "managed", { stateRoot });
  const list2 = await listTreePolicies(stateRoot);
  assert.equal(list2.length, 2);

  // 4. Query under nested override -> must resolve to 'managed'
  const policyManaged = await resolveEffectivePolicy(join(pkgManaged, "src"), list2);
  assert.equal(policyManaged.effectiveMode, "managed");
  assert.equal(policyManaged.inherited, true);
  assert.equal(policyManaged.depth, 2);
  assert.equal(policyManaged.entry?.id, computeTreeId(await canonicalizeTreePath(pkgManaged)));

  // 5. Query sibling -> must still inherit parent 'off'
  const policyOther2 = await resolveEffectivePolicy(join(pkgOther, "src"), list2);
  assert.equal(policyOther2.effectiveMode, "off");
  assert.equal(policyOther2.inherited, true);
  assert.equal(policyOther2.depth, 1);

  // 6. Query outside monorepo -> unclassified
  const outsideDir = join(root, "other-dir");
  await mkdir(outsideDir, { recursive: true });
  const policyOutside = await resolveEffectivePolicy(outsideDir, list2);
  assert.equal(policyOutside.effectiveMode, "unclassified");
  assert.equal(policyOutside.entry, null);
  assert.equal(policyOutside.depth, 0);
});

test("removeTreePolicy removes policy and restores parent or unclassified status", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tree-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const repo = join(root, "test-repo");
  await mkdir(repo, { recursive: true });

  await setTreePolicy(repo, "off", { stateRoot });
  let list = await listTreePolicies(stateRoot);
  assert.equal(list.length, 1);

  const removed = await removeTreePolicy(repo, { stateRoot });
  assert.equal(removed, true);

  list = await listTreePolicies(stateRoot);
  assert.equal(list.length, 0);

  const removedAgain = await removeTreePolicy(repo, { stateRoot });
  assert.equal(removedAgain, false);

  const policy = await resolveEffectivePolicy(repo, list);
  assert.equal(policy.effectiveMode, "unclassified");
});
