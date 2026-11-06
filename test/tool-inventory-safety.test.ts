import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

test("inventory rejects over-budget JSON instead of writing partial output", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-budget-"));
  try {
    const preload = join(root, "budget.mjs");
    await writeFile(preload, `import { registerHooks } from "node:module";
registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (!url.endsWith("/core/tool-inventory.js")) return loaded;
  const original = String(loaded.source);
  const marker = "export async function collectToolInventory(";
  if (!original.includes(marker)) throw new Error("collector instrumentation failed");
  return { ...loaded, source: original.replace(marker, "async function collectToolInventoryOriginal(") + '\\nexport async function collectToolInventory(...args) { const value = await collectToolInventoryOriginal(...args); value.auditBudget = Array.from({length: 199}, (_, i) => String(i).padStart(4, "0") + "x".repeat(2000)); return value; }' };
} });`);
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("dist/src/cli.js"), "inventory", "--json"], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root, LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "" }, timeout: 30000 });
    assert.notEqual(child.status, 0);
    assert.equal(child.stdout, "");
    assert.match(child.stderr, /Refusing to print a JSON envelope over the observable byte budget/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inventory reports unknown when native configuration is inaccessible", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-eacces-"));
  try {
    const config = join(root, ".claude.json"), marker = join(root, "denied"), preload = join(root, "deny.mjs");
    await writeFile(config, "{}");
    await writeFile(preload, `import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const open = fs.promises.open;
fs.promises.open = async function(path, ...args) { if (String(path) === process.env.DENY_PATH) { fs.writeFileSync(process.env.DENIED_MARKER, "denied"); throw Object.assign(new Error("permission denied"), {code:"EACCES"}); } return open.call(this, path, ...args); };
syncBuiltinESMExports();`);
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("dist/src/cli.js"), "inventory", "--json"], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root, LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "", DENY_PATH: config, DENIED_MARKER: marker }, timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    const { readFile } = await import("node:fs/promises");
    assert.equal(await readFile(marker, "utf8"), "denied");
    const output = JSON.parse(child.stdout) as { observations: Array<{ toolId: string; installation: string }> };
    assert.equal(output.observations.find((item) => item.toolId === "mcp:exa")?.installation, "unknown");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inventory avoids common network and subprocess APIs", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-io-sentinel-"));
  try {
    const preload = join(root, "sentinel.mjs"), marker = join(root, "calls");
    await writeFile(preload, `import fs from "node:fs"; import cp from "node:child_process"; import http from "node:http"; import https from "node:https"; import net from "node:net"; import tls from "node:tls"; import { syncBuiltinESMExports } from "node:module";
function fail(name) { return function() { fs.appendFileSync(process.env.CALL_MARKER, name + "\\n"); throw new Error("unexpected call " + name); }; }
for (const [obj, names, label] of [[cp,["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"],"child_process"],[http,["request","get"],"http"],[https,["request","get"],"https"],[net,["connect","createConnection"],"net"],[tls,["connect"],"tls"]]) for (const name of names) obj[name] = fail(label + "." + name);
globalThis.fetch = fail("fetch"); syncBuiltinESMExports();`);
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("dist/src/cli.js"), "inventory", "--json"], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root, LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "", CALL_MARKER: marker }, timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(JSON.parse(child.stdout).observations.length >= 7);
    const { access } = await import("node:fs/promises");
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inventory never enters installer, resolver, writer, or transaction entrypoints", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-entry-sentinel-"));
  try {
    const preload = join(root, "entries.mjs"), marker = join(root, "calls");
    await writeFile(preload, `import { registerHooks } from "node:module";
const names = ["createManagedInstallPlan", "applyManagedInstall", "installCua", "resolveCandidate", "withToolRecordSession", "runToolRecordOperation", "applyFileTransaction"];
registerHooks({ load(url, context, next) {
  const loaded = next(url, context);
  if (!url.includes("/core/") || !url.endsWith(".js")) return loaded;
  let source = String(loaded.source);
  for (const name of names) {
    const pattern = new RegExp("(export (?:async )?function " + name + "\\\\([^)]*\\\\) \\\\{)");
    if (pattern.test(source)) process.getBuiltinModule("node:fs").appendFileSync(process.env.INSTRUMENTED_MARKER, name + "\\n");
    source = source.replace(pattern, '$1 process.getBuiltinModule("node:fs").appendFileSync(process.env.CALL_MARKER, "' + name + '"); throw new Error("forbidden entry ' + name + '");');
  }
  return { ...loaded, source };
} });`);
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("dist/src/cli.js"), "inventory", "--json"], { encoding: "utf8", env: { ...process.env, HOME: root, USERPROFILE: root, LOCALAPPDATA: join(root, "local"), ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "", CALL_MARKER: marker, INSTRUMENTED_MARKER: join(root, "instrumented") }, timeout: 30000 });
    assert.equal(child.status, 0, child.stderr);
    assert.ok(JSON.parse(child.stdout).observations.length >= 7);
    const { access, readFile } = await import("node:fs/promises");
    const instrumented = await readFile(join(root, "instrumented"), "utf8");
    assert.match(instrumented, /createManagedInstallPlan/);
    assert.match(instrumented, /applyFileTransaction/);
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});
