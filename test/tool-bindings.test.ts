import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";

test("harness bindings identify shared exact package targets without exposing configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-bindings-"));
  try {
    const home = join(root, "home"), pkg = join(root, "package");
    await mkdir(home, { recursive: true }); await mkdir(pkg, { recursive: true });
    await writeFile(join(pkg, "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "1.0.0", bin: { exa: "cli.js" } }));
    await writeFile(join(pkg, "cli.js"), "fixture");
    await writeFile(join(home, ".claude.json"), JSON.stringify({ mcpServers: { exa: { command: join(pkg, "cli.js"), env: { TOKEN: "SECRET_CANARY" } } } }));
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const observation = result.observations.find((item) => item.toolId === "mcp:exa") as unknown as { bindings?: Array<{ harness: string; status: string }> };
    assert.equal(observation.bindings?.find((item) => item.harness === "claude")?.status, "active");
    assert.doesNotMatch(JSON.stringify(result), /SECRET_CANARY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
