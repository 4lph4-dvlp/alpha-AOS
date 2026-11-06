import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectInventory } from "../src/core/inventory.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { selectInstallTargets } from "../src/core/install.js";
import type { Inventory } from "../src/types.js";

const synchronousContract: (catalog: Parameters<typeof collectInventory>[0]) => Inventory = collectInventory;
void synchronousContract;

test("legacy selection accepts synchronous inventory and new observation leaves state untouched", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-compat-"));
  try {
    const catalog = await loadCatalog(resolve(".")), lock = await loadLock(resolve("."));
    const inventory: Inventory = { schemaVersion: 1, generatedAt: new Date(0).toISOString(), platform: process.platform, architecture: process.arch, tools: { node: { version: null, command: null }, npm: { version: null, command: null }, git: { version: null, command: null } }, harnesses: [{ id: "codex", displayName: "Codex", command: "codex", version: null, configRoots: [], detected: true, notes: [] }] };
    assert.deepEqual(selectInstallTargets(inventory), { targets: ["codex"], selection: "detected" });
    const before = await readdir(root);
    const observed = await collectToolInventory({ catalog, lock, packageRoot: resolve("."), stateRoot: join(root, "state"), home: root, env: { PATH: "", npm_config_prefix: join(root, "prefix") }, platform: process.platform === "darwin" ? "linux" : process.platform });
    assert.ok(observed.observations.length >= 7);
    assert.deepEqual(await readdir(root), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});
