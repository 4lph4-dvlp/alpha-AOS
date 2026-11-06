import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { applyFileTransaction } from "../src/core/transaction.js";
import { createHash } from "node:crypto";
import { attributeToolInstallations } from "../src/core/tool-bindings.js";
import type { ToolObserverContext } from "../src/core/tool-observers.js";
import type { ToolRecordEvent, ToolRecordStore, ToolResult } from "../src/core/tool-records.js";
import type { ToolObservation } from "../src/core/tool-inventory.js";

test("harness bindings identify shared exact package targets without exposing configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-bindings-"));
  try {
    const home = join(root, "home"), pkg = join(root, "package");
    await mkdir(home, { recursive: true }); await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "1.0.0", bin: { exa: "cli.js" } }));
    await writeFile(join(pkg, "cli.js"), "fixture");
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { exa: { command: join(pkg, "cli.js"), env: { TOKEN: "SECRET_CANARY" } } } }));
    await mkdir(join(home, ".codex"), { recursive: true });
    await applyFileTransaction({ stateRoot: join(root, "state"), allowedRoots: [home], operations: [{ target: join(home, ".codex", "config.toml"), content: `# alpha-aos:start mcp\n[mcp_servers.exa]\ncommand = ${JSON.stringify(join(pkg, "cli.js"))}\n# alpha-aos:end mcp\n` }] });
    await mkdir(join(home, ".gemini", "config"), { recursive: true });
    await writeFile(join(home, ".gemini", "config", "mcp_config.json"), `{ // JSONC comments and trailing commas are permitted\n"mcpServers": { "exa": { "command": ${JSON.stringify(join(pkg, "cli.js"))}, }, }, }`);
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { exa: { command: join(pkg, "cli.js") }, context7: { command: "npx", args: ["@upstash/context7-mcp"] } } }));
    await mkdir(join(home, ".hermes"), { recursive: true });
    await writeFile(join(home, ".hermes", "config.yaml"), JSON.stringify({ mcp_servers: { exa: { command: join(pkg, "cli.js") } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, platform: process.platform === "darwin" ? "linux" : process.platform, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const observation = result.observations.find((item) => item.toolId === "mcp:exa") as unknown as { bindings?: Array<{ harness: string; status: string }> };
    for (const harness of ["claude", "codex", "antigravity", "pi", "hermes"]) assert.equal(observation.bindings?.find((item) => item.harness === harness)?.status, "active", harness);
    const exa = result.observations.find((item) => item.toolId === "mcp:exa")!;
    assert.equal(exa.bindings?.find((binding) => binding.harness === "codex")?.connectionOwner, "alpha-aos");
    assert.equal(exa.candidates?.[0]?.installationOwner, "external");
    assert.ok(exa.diagnostics?.some((diagnostic) => diagnostic.code === "shared-installation" && diagnostic.severity === "info"));
    assert.equal(result.observations.find((item) => item.toolId === "mcp:context7")?.bindings?.find((binding) => binding.harness === "pi")?.status, "unresolved");
    assert.doesNotMatch(JSON.stringify(result), /SECRET_CANARY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("only accepted event owns its exact hashed Windows path when later failure reuses its ID", async () => {
  const first = "C:\\Tools\\exa-old", other = "C:\\Tools\\exa-other";
  const alias = (path: string) => `path-${createHash("sha256").update(path).digest("hex")}`;
  const result: ToolResult = { toolId: "mcp:exa", requested: { toolId: "mcp:exa", selector: "1.2.3", exact: true }, resolved: null, installed: { installationId: "same-id", version: "1.2.3", pathAlias: alias(first) }, verified: null, evidence: [], outcome: "succeeded" };
  const accepted: ToolRecordEvent = { schemaVersion: 1, eventId: "accepted-finish", operationId: "accepted", sequence: 2, occurredAt: "2026-01-01T00:00:00Z", kind: "finished", results: [result], outcome: "succeeded" };
  const failure: ToolRecordEvent = { ...accepted, eventId: "failed-finish", operationId: "failed", occurredAt: "2026-01-02T00:00:00Z", outcome: "failed", results: [{ ...result, installed: { ...result.installed!, pathAlias: alias(other) }, outcome: "failed" }] };
  const digest = "a".repeat(64);
  const records: ToolRecordStore = { status: "current", incomplete: false, diagnostics: [], events: [failure, accepted], accepted: { "mcp:exa/same-id": digest }, operations: [], verifiedEventDigests: { "accepted:2:accepted-finish": digest, "failed:2:failed-finish": "b".repeat(64) } };
  const item: ToolObservation = { toolId: "mcp:exa", installation: "installed", installed: null, selected: null, integrity: "unverified", integration: "unverified", reason: "", nextAction: "", candidates: [first, other].map((path) => ({ path, version: "1.2.3", identity: "exa-mcp-server", evidence: "package-manifest", installationOwner: "unknown" })) };
  await attributeToolInstallations([item], [], records, {} as ToolObserverContext);
  assert.equal(item.candidates?.find((candidate) => candidate.path === first)?.installationOwner, "alpha-aos");
  assert.equal(item.candidates?.find((candidate) => candidate.path === other)?.installationOwner, "external");
  assert.ok(!item.diagnostics?.some((diagnostic) => diagnostic.code === "record-target-mismatch"));
});

test("version split is informational and wrappers remain unresolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-bindings-split-"));
  try {
    const home = join(root, "home"), first = join(root, "v1"), second = join(root, "v2");
    for (const path of [home, first, second, join(home, ".codex"), join(home, ".pi", "agent"), join(home, ".gemini", "config")]) await mkdir(path, { recursive: true });
    for (const [path, version] of [[first, "1.0.0"], [second, "2.0.0"]] as const) {
      await writeFile(join(path, "package.json"), JSON.stringify({ name: "exa-mcp-server", version, bin: "cli.js" }));
      await writeFile(join(path, "cli.js"), "fixture");
    }
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { exa: { command: join(first, "cli.js") } } }));
    await writeFile(join(home, ".codex", "config.toml"), `[mcp_servers.exa]\ncommand = ${JSON.stringify(join(second, "cli.js"))}\n`);
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { exa: { command: "sh", args: ["-c", "SECRET_WRAPPER"] } } }));
    await writeFile(join(home, ".gemini", "config", "mcp_config.json"), JSON.stringify({ mcpServers: { exa: { command: join(root, "unmatched") } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, platform: process.platform === "darwin" ? "linux" : process.platform, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const exa = result.observations.find((item) => item.toolId === "mcp:exa")!;
    assert.ok(exa.diagnostics?.some((diagnostic) => diagnostic.code === "version-split" && diagnostic.severity === "info"));
    assert.ok(exa.diagnostics?.some((diagnostic) => diagnostic.code === "target-conflict" && diagnostic.severity === "problem"));
    assert.equal(exa.bindings?.find((binding) => binding.harness === "pi")?.status, "unresolved");
    assert.doesNotMatch(JSON.stringify(result), /SECRET_WRAPPER/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
