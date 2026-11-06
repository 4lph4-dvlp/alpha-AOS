import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";

test("inventory seeds every managed tool even when candidates are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-"));
  try {
    const output = execFileSync(process.execPath, [resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: root, USERPROFILE: root, ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "" }, encoding: "utf8",
    });
    const result = JSON.parse(output) as { observations: Array<{ toolId: string }> };
    assert.deepEqual(result.observations.map((item) => item.toolId), ["cua-driver", "gsd", "ecc", "mcp:context7", "mcp:exa", "mcp:firecrawl", "bridge:pi"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("inventory preserves multiple manually installed package candidates and malformed manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-candidates-"));
  try {
    const home = join(root, "home"), first = join(root, "global", ...(process.platform === "win32" ? [] : ["lib"]), "node_modules", "exa-mcp-server");
    const second = join(home, ".codex", "npm", "node_modules", "exa-mcp-server");
    const broken = join(home, ".claude", "npm", "node_modules", "firecrawl-mcp");
    const configured = join(root, "custom", "context7");
    for (const path of [first, second, broken, configured]) await mkdir(path, { recursive: true });
    await writeFile(join(first, "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "1.0.0", secret: "CANARY" }));
    await writeFile(join(second, "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "2.0.0" }));
    await writeFile(join(broken, "package.json"), "{");
    await writeFile(join(configured, "package.json"), JSON.stringify({ name: "@upstash/context7-mcp", version: "3.0.0" }));
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { context7: { command: join(configured, "cli.js"), env: { TOKEN: "CANARY" } } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const exa = result.observations.find((item) => item.toolId === "mcp:exa")!;
    assert.deepEqual(exa.candidates?.map((item) => item.version).sort(), ["1.0.0", "2.0.0"]);
    assert.ok(exa.candidates?.every((item) => item.installationOwner === "unknown"));
    assert.equal(result.observations.find((item) => item.toolId === "mcp:firecrawl")?.installation, "unknown");
    assert.equal(result.observations.find((item) => item.toolId === "mcp:context7")?.candidates?.[0]?.version, "3.0.0");
    assert.doesNotMatch(JSON.stringify(result), /CANARY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
