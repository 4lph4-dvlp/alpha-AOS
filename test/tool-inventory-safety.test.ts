import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { readToolRecordStore } from "../src/core/tool-records.js";

test("oversized and deeply nested records are rejected without acceptance", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-record-limits-"));
  try {
    const packageRoot = join(root, "checkout"), stateRoot = join(root, "state");
    const dir = join(stateRoot, "tool-records", "v1", "operations", "op");
    await mkdir(packageRoot); await mkdir(dir, { recursive: true });
    const path = join(dir, "0-start.json");
    await writeFile(path, " ".repeat(256 * 1024 + 1));
    let read = await readToolRecordStore({ stateRoot, packageRoot });
    assert.notEqual(read.status, "current");
    assert.equal(read.accepted, null);
    assert.deepEqual(read.events, []);
    await writeFile(path, "[".repeat(33) + "0" + "]".repeat(33));
    read = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(read.status, "invalid");
    assert.ok(read.diagnostics.includes("event-too-deep"));
    assert.equal(read.accepted, null);
    assert.deepEqual(read.events, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("collector makes no fetch requests during local discovery", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-no-fetch-"));
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw new Error("unexpected network"); };
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home: root, env: { PATH: "", npm_config_prefix: join(root, "prefix") }, platform: process.platform === "darwin" ? "linux" : process.platform });
    assert.ok(result.observations.length >= 7);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; await rm(root, { recursive: true, force: true }); }
});

test("inventory hides native configuration secrets in human and JSON output", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-cli-canary-"));
  try {
    await writeFile(join(root, ".claude.json"), JSON.stringify({ mcpServers: { exa: { command: "SECRET_COMMAND_CANARY", env: { TOKEN: "SECRET_ENV_CANARY" } } } }));
    const nodeArgs = process.platform === "darwin" ? ["--import", `data:text/javascript,${encodeURIComponent('Object.defineProperty(process,"platform",{value:"linux"})')}`] : [];
    for (const flags of [[], ["--json"]]) {
      const result = spawnSync(process.execPath, [...nodeArgs, resolve("dist/src/cli.js"), "inventory", ...flags], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root, LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "" } });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /mcp:exa/);
      assert.doesNotMatch(result.stdout + result.stderr, /SECRET_(?:COMMAND|ENV)_CANARY/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
