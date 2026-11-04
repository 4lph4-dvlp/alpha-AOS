import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createNativeCuaServer, defaultCuaTools, verifyNativeCua } from "../src/core/computer-use-native.js";
import { loadLock } from "../src/core/catalog.js";
import { renderMcpConfig, validateNativeConfig } from "../src/core/mcp.js";
import { packageRoot } from "../src/core/paths.js";
import { runComputerCommand } from "../src/core/computer-use-command.js";

test("ordinary Cua MCP forwards GUI schemas and calls while refusing raw execution without reaching the driver", async () => {
  let calls = 0; let validations = 0;
  const upstream = {
    listTools: async () => ({ tools: ["get_window_state", "click", "run_script", "clipboard_read", "get_desktop_state"].map((name) => ({ name, inputSchema: { type: "object" as const } })) }),
    callTool: async () => { calls++; return { content: [{ type: "text" as const, text: "native-result" }] }; },
  };
  const server = createNativeCuaServer(upstream, async () => { validations++; });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ordinary-gui-test", version: "1" });
  try {
    await server.connect(serverTransport); await client.connect(clientTransport);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name), ["get_window_state", "click"]);
    await client.callTool({ name: "click", arguments: { pid: 12, window_id: 42, x: 3, y: 5 } });
    assert.equal(calls, 1);
    for (const name of ["run_script", "clipboard_read", "get_desktop_state", "unknown", "run_steps", "escalate_session"]) {
      await assert.rejects(client.callTool({ name, arguments: {} }), /outside the managed GUI surface/);
    }
    assert.equal(calls, 1); assert.equal(validations, 2);
    assert.ok(defaultCuaTools.has("end_session"));
  } finally { await client.close(); await server.close(); }
});

test("runtime drift blocks ordinary GUI dispatch before the native effect", async () => {
  let dispatched = false;
  const server = createNativeCuaServer({
    listTools: async () => ({ tools: [] }),
    callTool: async () => { dispatched = true; return { content: [] }; },
  }, async () => { throw new Error("runtime drift"); });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "drift-test", version: "1" });
  try {
    await server.connect(b); await client.connect(a);
    await assert.rejects(client.callTool({ name: "click", arguments: {} }), /runtime drift/);
    assert.equal(dispatched, false);
  } finally { await client.close(); await server.close(); }
});

test("native Cua checks companion bytes as well as its entrypoint", async () => {
  const root = await mkdtemp(join(tmpdir(), "cua-native-pin-"));
  try {
    await mkdir(join(root, "catalog"));
    const hash = (value: string) => createHash("sha256").update(value).digest("hex");
    const executable = process.platform === "win32" ? "cua-driver.exe" : "cua-driver";
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
    await writeFile(join(root, executable), "reviewed-main"); await writeFile(join(root, "helper"), "reviewed-helper");
    await writeFile(join(root, "catalog/computer-use-runtime.json"), JSON.stringify({ version: "0.38.0", assets: [{ os, arch: process.arch, entrypoint: executable, files: { [executable]: hash("reviewed-main"), helper: hash("reviewed-helper") } }] }));
    assert.equal((await verifyNativeCua(join(root, executable), root)).version, "0.38.0");
    await writeFile(join(root, "helper"), "changed");
    await assert.rejects(verifyNativeCua(join(root, executable), root), /runtime bytes differ/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("all harnesses register ordinary Cua by default and isolated observers omit it", async () => {
  const lock = await loadLock(packageRoot());
  for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"] as const) {
    const config = renderMcpConfig(harness, "", lock);
    assert.match(config, /native-mcp/);
    assert.deepEqual(validateNativeConfig(harness, config), []);
    assert.equal(renderMcpConfig(harness, config, lock), config);
    const isolated = renderMcpConfig(harness, config, lock, ["context7"], { front: "observe", observationsPath: join(tmpdir(), "cua-observe.jsonl") });
    assert.doesNotMatch(isolated, /native-mcp/);
  }
});

test("ordinary native MCP refuses permission overrides before starting a runtime", async () => {
  for (const args of [["--permission-mode", "unrestricted"], ["--runtime", "unreviewed"], ["--apply"]]) {
    await assert.rejects(runComputerCommand(["native-mcp", ...args]), /fixed standard permissions/);
  }
});
