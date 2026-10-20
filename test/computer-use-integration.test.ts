import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ComputerSession } from "../src/core/computer-use.js";
import { createComputerMcpServer } from "../src/core/computer-use-mcp.js";
import { validateComputerAuthority } from "../src/core/computer-use-policy.js";
import { authorityFixture, pngFixture } from "./fixtures/computer-use.js";
import { packageRoot } from "../src/core/paths.js";
import { taskComputerUseRoute } from "../src/adapters/task-agent-launch.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { planOwnedSkillSync } from "../src/core/owned-skills.js";
import { loadPackCatalogStrict } from "../src/core/pack-catalog.js";
import { buildTaskCapabilityInventory } from "../src/core/task-capability-inventory.js";
import { evaluateRiskObligations } from "../src/core/gate.js";
import type { HarnessId } from "../src/types.js";

test("actual CLI reports unavailable native runtime without claiming installed proof", () => {
  const result = JSON.parse(execFileSync(process.execPath, [join(packageRoot(), "dist/src/cli.js"), "computer-use", "doctor", "--json"], { encoding: "utf8" }));
  assert.equal(result.nativeUse, "unverified"); assert.equal(result.enabled, false);
  assert.throws(() => execFileSync(process.execPath, [join(packageRoot(), "dist/src/cli.js"), "computer-use", "action", "--apply"], { stdio: "pipe" }));
});

test("real MCP server reaches shared broker and rejects raw native tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "computer-mcp-")); const a = validateComputerAuthority(authorityFixture()); let observed = 0; let value = "before"; let effects = 0;
  const session = await ComputerSession.open(a, { identity: a.runtime, observe: async () => ({ target: a.target, captureId: String(++observed), png: pngFixture, width: 1, height: 1, state: value, safe: true, foreground: false }), dispatch: async () => { effects++; value = "after"; }, close: async () => {} }, root);
  const server = createComputerMcpServer(session); const client = new Client({ name: "test", version: "1" }); const [downstream, upstream] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(upstream), client.connect(downstream)]);
    assert.deepEqual((await client.listTools()).tools.map((v) => v.name), ["computer_action", "computer_stop"]);
    await assert.rejects(client.callTool({ name: "shell_execute", arguments: {} })); assert.equal(effects, 0);
    const result = await client.callTool({ name: "computer_action", arguments: { action: { kind: "click", x: 0, y: 0 }, postcondition: { equals: "after" } } });
    assert.match(JSON.stringify(result), /verified/); assert.equal(effects, 1);
    await client.callTool({ name: "computer_stop", arguments: {} });
    await assert.rejects(client.callTool({ name: "computer_action", arguments: { action: { kind: "click", x: 0, y: 0 }, postcondition: { equals: "after" } } })); assert.equal(effects, 1);
  } finally { await client.close(); await server.close(); await session.close(); await rm(root, { recursive: true, force: true }); }
});

test("all five harnesses preview hash-pinned owned guide without GUI authority", async () => {
  const root = packageRoot(); const catalog = await loadCatalog(root); const lock = await loadLock(root); const scratch = await mkdtemp(join(tmpdir(), "computer-guide-"));
  try {
    for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"] as HarnessId[]) {
      assert.equal(taskComputerUseRoute(harness, {}).granted, false);
      assert.equal(taskComputerUseRoute(harness, { computerUse: { authorityHash: "a".repeat(64), deterministic: true, reversible: true } }).granted, true);
      const plan = await planOwnedSkillSync(root, catalog, lock, "computer-use", harness, { targetHome: join(scratch, harness) });
      assert.equal(plan.action, "create"); assert.ok(plan.destination.startsWith(scratch));
    }
    const packs = await loadPackCatalogStrict(root); assert.ok(packs.value.packs.some((p) => p.id === "COMPUTER_USE"));
    const inventory = await buildTaskCapabilityInventory({ packageRoot: root, projectRoot: scratch, catalog, lock });
    const item = inventory.items.find((v) => v.id === "control:computer-use"); assert.equal(item?.nativeUse, "unverified"); assert.equal(item?.selected, false);
    assert.equal(JSON.parse(await readFile(join(root, "catalog/computer-use-runtime.json"), "utf8")).stableLockPromotion, false);
  } finally { await rm(scratch, { recursive: true, force: true }); }
});

test("GUI policy and runtime changes deterministically require security review", () => {
  const result = evaluateRiskObligations({ baseCommit: "base", headCommit: "head", modifiedFiles: ["src/core/computer-use-policy.ts", "src/adapters/computer-use-cua.ts"], untrackedFiles: [], isWorkingTreeDirty: true });
  assert.ok(result.obligations.includes("security-review"));
});
