import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { applyFileTransaction } from "../src/core/transaction.js";

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
    await writeFile(join(home, ".gemini", "config", "mcp_config.json"), JSON.stringify({ mcpServers: { exa: { command: join(pkg, "cli.js") } } }));
    await mkdir(join(home, ".pi", "agent"), { recursive: true });
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { exa: { command: join(pkg, "cli.js") }, context7: { command: "npx", args: ["@upstash/context7-mcp"] } } }));
    await mkdir(join(home, ".hermes"), { recursive: true });
    await writeFile(join(home, ".hermes", "config.yaml"), JSON.stringify({ mcp_servers: { exa: { command: join(pkg, "cli.js") } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
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

test("version split is informational and wrappers remain unresolved", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-bindings-split-"));
  try {
    const home = join(root, "home"), first = join(root, "v1"), second = join(root, "v2");
    for (const path of [home, first, second, join(home, ".codex"), join(home, ".pi", "agent")]) await mkdir(path, { recursive: true });
    for (const [path, version] of [[first, "1.0.0"], [second, "2.0.0"]] as const) {
      await writeFile(join(path, "package.json"), JSON.stringify({ name: "exa-mcp-server", version, bin: "cli.js" }));
      await writeFile(join(path, "cli.js"), "fixture");
    }
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { exa: { command: join(first, "cli.js") } } }));
    await writeFile(join(home, ".codex", "config.toml"), `[mcp_servers.exa]\ncommand = ${JSON.stringify(join(second, "cli.js"))}\n`);
    await writeFile(join(home, ".pi", "agent", "mcp.json"), JSON.stringify({ mcpServers: { exa: { command: "sh", args: ["-c", "SECRET_WRAPPER"] } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const exa = result.observations.find((item) => item.toolId === "mcp:exa")!;
    assert.ok(exa.diagnostics?.some((diagnostic) => diagnostic.code === "version-split" && diagnostic.severity === "info"));
    assert.equal(exa.bindings?.find((binding) => binding.harness === "pi")?.status, "unresolved");
    assert.doesNotMatch(JSON.stringify(result), /SECRET_WRAPPER/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
