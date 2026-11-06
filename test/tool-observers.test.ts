import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { collectToolInventory } from "../src/core/tool-inventory.js";
import { officialCuaPaths } from "../src/core/computer-use-install.js";

test("inventory seeds every managed tool even when candidates are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-"));
  try {
    const nodeArgs = process.platform === "darwin" ? ["--import", `data:text/javascript,${encodeURIComponent('Object.defineProperty(process,"platform",{value:"linux"})')}`] : [];
    const output = execFileSync(process.execPath, [...nodeArgs, resolve("dist/src/cli.js"), "inventory", "--tool", "cua-driver", "--json"], {
      env: { ...process.env, HOME: root, USERPROFILE: root, ALPHA_AOS_STATE_DIR: join(root, "state"), PATH: "" }, encoding: "utf8",
    });
    const result = JSON.parse(output) as { observations: Array<{ toolId: string }> };
    assert.deepEqual(result.observations.map((item) => item.toolId).sort(), ["cua-driver", "gsd", "ecc", "mcp:context7", "mcp:exa", "mcp:firecrawl", "bridge:pi"].sort());
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("collector reads bounded fixtures without commands or filesystem mutations", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-readonly-"));
  const catalog = await loadCatalog(resolve(".")), lock = await loadLock(resolve("."));
  const before = await readdir(root);
  const commands = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync"] as const;
  const methods = childProcess as unknown as Record<string, unknown>;
  const originals = commands.map((name) => methods[name]);
  try {
    for (const name of commands) methods[name] = () => { throw new Error("unexpected subprocess"); };
    syncBuiltinESMExports();
    await collectToolInventory({ catalog, lock, packageRoot: resolve("."), stateRoot: join(root, "state"), home: root, platform: process.platform === "darwin" ? "linux" : process.platform, env: { npm_config_prefix: join(root, "prefix"), PATH: "" } });
    assert.deepEqual(await readdir(root), before);
  } finally {
    commands.forEach((name, index) => { methods[name] = originals[index]; });
    syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
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
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home, platform: process.platform === "darwin" ? "linux" : process.platform, env: { npm_config_prefix: join(root, "global"), PATH: "" } });
    const exa = result.observations.find((item) => item.toolId === "mcp:exa")!;
    assert.deepEqual(exa.candidates?.map((item) => item.version).sort(), ["1.0.0", "2.0.0"]);
    assert.ok(exa.candidates?.every((item) => item.installationOwner === "external"));
    assert.equal(result.observations.find((item) => item.toolId === "mcp:firecrawl")?.installation, "unknown");
    assert.equal(result.observations.find((item) => item.toolId === "mcp:context7")?.candidates?.[0]?.version, "3.0.0");
    assert.doesNotMatch(JSON.stringify(result), /CANARY/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("PATH candidates follow bounded real targets to package manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-path-"));
  try {
    const bin = join(root, "custom-package", "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(root, "custom-package", "package.json"), JSON.stringify({ name: "exa-mcp-server", version: "8.0.0" }));
    await writeFile(join(bin, "exa-mcp-server"), "fixture");
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock: await loadLock(resolve(".")), packageRoot: resolve("."), stateRoot: join(root, "state"), home: join(root, "home"), platform: process.platform === "darwin" ? "linux" : process.platform, env: { npm_config_prefix: join(root, "prefix"), PATH: bin } });
    assert.ok(result.observations.find((item) => item.toolId === "mcp:exa")?.candidates?.some((candidate) => candidate.version === "8.0.0"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("native GSD, ECC, Cua, MCP and Pi bridge files remain separate observations", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-observer-universe-"));
  try {
    const home = join(root, "home"), local = join(root, "local"), lock = await loadLock(resolve("."));
    const env = { npm_config_prefix: join(root, "prefix"), PATH: "", LOCALAPPDATA: local };
    const gsd = join(home, ".claude", "gsd-core"), skill = join(home, ".claude", "skills", lock.components.ecc!.skills[0]!);
    await mkdir(gsd, { recursive: true }); await mkdir(skill, { recursive: true });
    await writeFile(join(gsd, "VERSION"), "1.2.3\n"); await writeFile(join(gsd, ".gsd-runtime"), "claude\n");
    await writeFile(join(home, ".claude", ".gsd-profile"), "full\n"); await writeFile(join(skill, "SKILL.md"), "fixture");
    for (const pkg of [lock.components.ecc!, ...Object.values(lock.components.mcp!), lock.components.mcpBridges!.pi!]) {
      const path = join(home, ".pi", "agent", "npm", "node_modules", pkg.package);
      await mkdir(path, { recursive: true }); await writeFile(join(path, "package.json"), JSON.stringify({ name: pkg.package, version: "1.2.3" }));
    }
    const platform = process.platform === "darwin" ? "linux" : process.platform;
    const executable = officialCuaPaths(platform, home, local).executable;
    await mkdir(resolve(executable, ".."), { recursive: true }); await writeFile(executable, "fixture");
    const result = await collectToolInventory({ catalog: await loadCatalog(resolve(".")), lock, packageRoot: resolve("."), stateRoot: join(root, "state"), home, env, platform });
    for (const id of ["gsd", "ecc", "mcp:context7", "mcp:exa", "mcp:firecrawl", "bridge:pi"]) assert.equal(result.observations.find((item) => item.toolId === id)?.installation, "installed", id);
    assert.equal(result.observations[0]?.installation, "installed");
    assert.equal(result.observations.find((item) => item.toolId === "gsd")?.bindings?.find((binding) => binding.harness === "claude")?.status, "active");
  } finally { await rm(root, { recursive: true, force: true }); }
});
