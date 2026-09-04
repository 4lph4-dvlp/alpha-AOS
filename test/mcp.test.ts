import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { loadLock } from "../src/core/catalog.js";
import { applyMcpSync, NativeConfigError, planMcpSync, renderMcpConfig, validateNativeConfig } from "../src/core/mcp.js";
import { allowedMcpTools } from "../src/core/mcp-proxy.js";
import { packageRoot } from "../src/core/paths.js";
import type { HarnessId } from "../src/types.js";

const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

function seed(harness: HarnessId): string {
  switch (harness) {
    case "claude":
    case "antigravity":
    case "pi":
      return `${JSON.stringify({ untouched: { value: "keep" }, mcpServers: { legacy: { command: "legacy", env: { TOKEN: "do-not-emit" } } } }, null, 2)}\n`;
    case "codex":
      return "model = \"fixture\"\n\n[mcp_servers.legacy]\ncommand = \"legacy\"\n\n[unrelated]\nvalue = \"keep\"\n";
    case "hermes":
      return "model:\n  provider: fixture\nmcp_servers:\n  legacy:\n    command: legacy\n    env:\n      TOKEN: do-not-emit\n";
  }
}

test("MCP renderers preserve unrelated config and use exact locked versions", async () => {
  const lock = await loadLock(packageRoot());
  for (const harness of harnesses) {
    const rendered = renderMcpConfig(harness, seed(harness), lock);
    for (const id of ["context7", "exa"] as const) {
      const locked = lock.components.mcp?.[id];
      assert.ok(locked);
      assert.match(rendered, new RegExp(`${locked.package.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}@${locked.version.replaceAll(".", "\\.")}`, "u"));
    }
    assert.match(rendered, /mcp-proxy/u);
    assert.match(rendered, /legacy/u);
    if (harness === "codex") {
      assert.match(rendered, /model = "fixture"/u);
      assert.match(rendered, /env_vars = \["EXA_API_KEY"\]/u);
      assert.doesNotMatch(rendered, /env_vars = \["CONTEXT7_API_KEY"\]/u);
      assert.doesNotMatch(rendered, /env_vars = \["FIRECRAWL_API_KEY"\]/u);
    } else if (harness === "hermes") {
      const parsed = parse(rendered) as Record<string, unknown>;
      assert.ok(parsed.model);
      assert.match(rendered, /\$\{EXA_API_KEY\}/u);
    } else {
      const parsed = JSON.parse(rendered) as Record<string, unknown>;
      assert.ok(parsed.untouched);
      if (harness === "pi") assert.match(rendered, /\$\{EXA_API_KEY\}/u);
    }
  }
});

test("Firecrawl is reduced to the four extraction and bounded crawl tools", () => {
  assert.deepEqual([...allowedMcpTools("firecrawl") ?? []], [
    "firecrawl_scrape",
    "firecrawl_map",
    "firecrawl_crawl",
    "firecrawl_check_crawl_status",
  ]);
  assert.equal(allowedMcpTools("context7"), null);
  assert.equal(allowedMcpTools("exa"), null);
});

test("MCP plans never serialize rendered user config or credential values", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-plan-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const path = join(root, ".claude.json");
  await writeFile(path, seed("claude"), "utf8");
  const secret = "fixture-secret-value";
  const plan = await planMcpSync("claude", await loadLock(packageRoot()), {
    configPath: path,
    env: { EXA_API_KEY: secret },
  });
  assert.doesNotMatch(plan.rendered, new RegExp(secret, "u"));
  const json = JSON.stringify(plan);
  assert.doesNotMatch(json, /do-not-emit/u);
  assert.doesNotMatch(json, new RegExp(secret, "u"));
  assert.equal(Object.keys(plan).includes("rendered"), false);
});

test("MCP config sync is transactional and idempotent", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-apply-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "home", ".claude.json");
  const stateRoot = join(root, "state");
  await mkdir(dirname(configPath), { recursive: true });
  const lock = await loadLock(packageRoot());
  const first = await applyMcpSync("claude", lock, { configPath, stateRoot, env: {} });
  assert.ok(first.operationId);
  const content = await readFile(configPath, "utf8");
  const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
  assert.deepEqual(Object.keys(parsed.mcpServers ?? {}), ["context7", "exa", "firecrawl"]);
  const second = await applyMcpSync("claude", lock, { configPath, stateRoot, env: {} });
  assert.equal(second.operationId, null);
  assert.equal(second.plan.action, "current");
});

test("JSON MCP sync ignores unrelated host state and formatting drift", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-host-drift-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "home", ".claude.json");
  const stateRoot = join(root, "state");
  await mkdir(dirname(configPath), { recursive: true });
  const lock = await loadLock(packageRoot());
  await applyMcpSync("claude", lock, { configPath, stateRoot, env: {}, selected: ["context7"] });
  const parsed = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  parsed.hostSessionState = { updatedAt: "fixture", counter: 2 };
  const hostBytes = JSON.stringify(parsed);
  await writeFile(configPath, hostBytes, "utf8");

  const plan = await planMcpSync("claude", lock, { configPath, env: {}, selected: ["context7"] });
  assert.equal(plan.action, "current");
  const result = await applyMcpSync("claude", lock, { configPath, stateRoot, env: {}, selected: ["context7"] });
  assert.equal(result.operationId, null);
  assert.equal(await readFile(configPath, "utf8"), hostBytes);
});

test("Codex incremental MCP sync retains previously installed servers", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-codex-incremental-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, ".codex", "config.toml");
  const stateRoot = join(root, "state");
  await mkdir(dirname(configPath), { recursive: true });
  const lock = await loadLock(packageRoot());

  await applyMcpSync("codex", lock, { configPath, stateRoot, env: {}, selected: ["context7"] });
  await applyMcpSync("codex", lock, { configPath, stateRoot, env: {}, selected: ["exa"] });

  const content = await readFile(configPath, "utf8");
  assert.match(content, /\[mcp_servers\.context7\]/u);
  assert.match(content, /\[mcp_servers\.exa\]/u);
  assert.doesNotMatch(content, /\[mcp_servers\.firecrawl\]/u);
  const third = await applyMcpSync("codex", lock, { configPath, stateRoot, env: {}, selected: ["exa"] });
  assert.equal(third.operationId, null);
  assert.equal(third.plan.action, "current");
});

test("Pi MCP config apply fails closed until the pinned bridge is installed", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-pi-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "agent", "mcp.json");
  await assert.rejects(
    applyMcpSync("pi", await loadLock(packageRoot()), { configPath, stateRoot: join(root, "state"), env: {} }),
    /Pi MCP bridge .* must be installed/u,
  );
});

// ---------------------------------------------------------------------------
// Plan 01-10: strict native configuration handling
// ---------------------------------------------------------------------------

test("ambiguous native configuration is rejected before anything is rendered", () => {
  const cases: ReadonlyArray<{ harness: HarnessId; name: string; text: string; code: string }> = [
    {
      harness: "claude",
      name: "duplicate JSON key",
      text: '{"mcpServers":{},"mcpServers":{"exa":{}}}',
      code: "syntax.duplicate-key",
    },
    {
      harness: "claude",
      name: "malformed JSON",
      text: '{"mcpServers":{',
      code: "syntax.malformed",
    },
    {
      harness: "hermes",
      name: "multi-document YAML stream",
      text: "mcpServers: {}\n---\nmcpServers: {exa: {}}\n",
      code: "syntax.multiple-documents",
    },
    {
      harness: "hermes",
      name: "duplicate YAML key",
      text: "mcpServers: {}\nmcpServers: {exa: {}}\n",
      code: "syntax.duplicate-key",
    },
    {
      harness: "codex",
      name: "TOML dotted/quoted key collision",
      text: 'mcp_servers.exa.command = "a"\n[mcp_servers.exa]\n"command" = "b"\n',
      code: "syntax.malformed",
    },
  ];

  for (const entry of cases) {
    const issues = validateNativeConfig(entry.harness, entry.text);
    assert.ok(issues.length > 0, `${entry.name} should have been rejected`);
    assert.equal(issues[0]?.code, entry.code, `${entry.name} produced ${issues[0]?.code}`);
  }
});

test("a malformed alpha-AOS-owned entry is refused with a stable redacted issue", () => {
  const issues = validateNativeConfig(
    "claude",
    JSON.stringify({ mcpServers: { exa: { command: "", args: "not-an-array" } } }),
  );

  assert.ok(issues.length > 0);
  assert.ok(issues[0]?.documentPath.startsWith("/mcpServers/exa"), `got ${issues[0]?.documentPath}`);
  // Two runs of the same input produce the same issues.
  assert.deepEqual(
    validateNativeConfig("claude", JSON.stringify({ mcpServers: { exa: { command: "", args: "not-an-array" } } })),
    issues,
  );
});

test("validation claims only the fields alpha-AOS writes, not the whole entry", () => {
  // Codex sets startup_timeout_sec on its own server entries. Claiming the
  // whole object would mean rejecting a field that is not this tool's to own.
  const codex = validateNativeConfig(
    "codex",
    [
      "[mcp_servers.context7]",
      'command = "node"',
      'args = ["cli.js"]',
      "startup_timeout_sec = 30",
      "",
    ].join("\n"),
  );
  assert.deepEqual(codex, [], `a harness-owned field must not be refused: ${JSON.stringify(codex)}`);

  // The same holds for unrelated top-level sections and for servers this tool
  // does not manage.
  const mixed = validateNativeConfig(
    "claude",
    JSON.stringify({
      mcpServers: {
        exa: { type: "stdio", command: "node", args: ["cli.js"] },
        "user-owned-server": { anything: "at all" },
      },
      unrelatedUserSection: { keep: true },
    }),
  );
  assert.deepEqual(mixed, []);
});

test("a native config with no managed servers is accepted untouched", () => {
  assert.deepEqual(validateNativeConfig("claude", ""), []);
  assert.deepEqual(validateNativeConfig("claude", JSON.stringify({ unrelatedUserSection: { keep: true } })), []);
  assert.deepEqual(validateNativeConfig("hermes", "unrelated: true\n"), []);
});

test("planMcpSync refuses ambiguous native input before it can mutate", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-strict-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configPath = join(root, "settings.json");
  const ambiguous = '{"mcpServers":{},"mcpServers":{"exa":{"command":"x","args":[]}}}';
  await writeFile(configPath, ambiguous, "utf8");

  const lock = await loadLock(packageRoot());
  await assert.rejects(
    () => planMcpSync("claude", lock, { configPath, env: {} }),
    (error: unknown) => {
      assert.ok(error instanceof NativeConfigError, `expected NativeConfigError, got ${String(error)}`);
      assert.equal(error.issues[0]?.code, "syntax.duplicate-key");
      return true;
    },
  );

  assert.equal(await readFile(configPath, "utf8"), ambiguous, "a refused plan must leave the file untouched");
});
