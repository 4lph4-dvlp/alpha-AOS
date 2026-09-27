import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type { TestContext } from "node:test";
import { renderEccSkill } from "../../src/core/ecc-fixture.js";
import { nodeRuntimeEnvironment } from "../../src/core/install.js";
import { resolveNodePackageCli, runProcess } from "../../src/core/process.js";
import type { HarnessId, StackLock } from "../../src/types.js";

const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
const sources = {
  "unified-memory": "---\nname: unified-memory\n---\n# Synthetic memory skill\n",
  "documentation-lookup": "---\nname: documentation-lookup\ndescription: Synthetic documentation skill\n---\n# Documentation Lookup (Context7)\n\nFixture.\n",
  "deep-research": "---\nname: deep-research\n---\n## MCP Requirements\nFixture.\n## Workflow\n### Step 3: Execute Multi-Source Search\nFixture.\n### Step 4: Deep-Read Key Sources\nFixture.\n### Step 5: Synthesize and Write Report\nFixture.\n## Parallel Research with Subagents\nFixture.\n## Quality Rules\nFixture.\n",
};

/** Real npm and production integrity/render/sync paths, with local package and MCP fixtures. */
export async function createInstallRegistry(context: TestContext, root: string, base: StackLock, includeMcp = false): Promise<StackLock> {
  const ecc = base.components.ecc;
  assert.ok(ecc);
  const saved = new Map<string, string | undefined>();
  const set = (key: string, value: string): void => {
    saved.set(key, process.env[key]);
    process.env[key] = value;
  };
  context.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  set("npm_config_cache", join(root, "npm-cache"));
  set("npm_config_userconfig", join(root, "empty.npmrc"));
  await writeFile(join(root, "empty.npmrc"), "audit=false\nfund=false\nupdate-notifier=false\n");
  // Local npm pack seeds its cache with the archive; keep that out of the
  // install cache so the loopback download assertions measure real fetches.
  const packEnvironment = nodeRuntimeEnvironment({ literal: { npm_config_cache: join(root, "npm-pack-cache") } });
  const sourceRoot = join(root, "ecc-package");
  const packRoot = join(root, "ecc-archive");
  await mkdir(packRoot, { recursive: true });
  for (const [skill, source] of Object.entries(sources)) {
    const folder = join(sourceRoot, "skills", skill);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "SKILL.md"), source);
  }
  const manifest = { name: ecc.package, version: ecc.version };
  await writeFile(join(sourceRoot, "package.json"), JSON.stringify(manifest));
  const npm = resolveNodePackageCli("npm");
  const packed = await runProcess({
    executable: npm.executable,
    args: [...npm.argsPrefix, "pack", sourceRoot, "--ignore-scripts", "--pack-destination", packRoot],
    cwd: root,
    environment: packEnvironment,
    timeoutMs: 30_000,
  });
  assert.equal(packed.code, "ok", packed.stderr.excerpt);
  const archives = await readdir(packRoot);
  assert.equal(archives.length, 1);
  const archive = await readFile(join(packRoot, archives[0]!));
  const integrity = `sha512-${createHash("sha512").update(archive).digest("base64")}`;
  const packages = new Map([[ecc.package, { manifest, archive, integrity }]]);
  const mcp = { ...base.components.mcp };
  if (includeMcp) {
    const launchRoutes: Record<string, string> = {};
    for (const id of ["context7", "exa", "firecrawl"] as const) {
      const locked = mcp[id];
      assert.ok(locked);
      const folder = join(root, `${id}-package`);
      const destination = join(root, `${id}-archive`);
      await mkdir(folder);
      await mkdir(destination);
      const tools = id === "context7" ? ["resolve-library-id", "query-docs"] : id === "exa" ? ["web_search_exa"]
        : ["firecrawl_scrape", "firecrawl_map", "firecrawl_crawl", "firecrawl_check_crawl_status"];
      const serverScript = `#!/usr/bin/env node
const readline = require("node:readline");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const result = message.method === "initialize"
    ? { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
    : { tools: ${JSON.stringify(tools)}.map(name => ({ name, inputSchema: { type: "object" } })) };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }) + "\\n");
});
`;
      const serverManifest = { name: locked.package, version: locked.version, bin: { fixture: "server.cjs" } };
      await writeFile(join(folder, "package.json"), JSON.stringify(serverManifest));
      await writeFile(join(folder, "server.cjs"), serverScript);
      launchRoutes[`${locked.package}@${locked.version}`] = join(folder, "server.cjs");
      const result = await runProcess({ executable: npm.executable,
        args: [...npm.argsPrefix, "pack", folder, "--ignore-scripts", "--pack-destination", destination],
        cwd: root, environment: packEnvironment, timeoutMs: 30_000 });
      assert.equal(result.code, "ok", result.stderr.excerpt);
      const files = await readdir(destination);
      assert.equal(files.length, 1);
      const bytes = await readFile(join(destination, files[0]!));
      const hash = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
      packages.set(locked.package, { manifest: serverManifest, archive: bytes, integrity: hash });
      mcp[id] = { ...locked, integrity: hash };
    }
    // The proxy intentionally strips registry/userconfig overrides from its
    // upstream environment. An exact-package npx fixture prevents that nested
    // child from reaching the public registry; the public MCP gate stays real.
    const bin = join(root, "mcp-bin");
    const scripts = join(bin, "node_modules", "npm", "bin");
    await mkdir(scripts, { recursive: true });
    const launcher = `const routes = ${JSON.stringify(launchRoutes)};
const args = process.argv.slice(2).filter(arg => arg !== "--yes");
if (args.length !== 1 || !Object.hasOwn(routes, args[0])) throw new Error("Unplanned fixture package");
require(routes[args[0]]);
`;
    await writeFile(join(scripts, "npx-cli.js"), launcher);
    const command = join(bin, process.platform === "win32" ? "npx.cmd" : "npx");
    await writeFile(command, process.platform === "win32"
      ? `@echo off\r\nSET "dp0=%~dp0"\r\n"${process.execPath}" "%dp0%\\node_modules\\npm\\bin\\npx-cli.js" %*\r\n`
      : `#!${process.execPath}\n${launcher}`);
    await chmod(command, 0o755);
    set("PATH", `${bin}${delimiter}${process.env.PATH ?? ""}`);
  }
  const unexpected: string[] = [];
  const fetched = new Set<string>();
  let registry = "";
  const server = createServer((request, response) => {
    const path = decodeURIComponent(request.url ?? "").slice(1);
    const isArchive = path.endsWith("/-/fixture.tgz");
    const name = isArchive ? path.slice(0, -"/-/fixture.tgz".length) : path;
    const pkg = packages.get(name);
    if (request.method === "GET" && pkg && isArchive) {
      fetched.add(name);
      response.setHeader("content-type", "application/octet-stream");
      response.end(pkg.archive);
    } else if (request.method === "GET" && pkg) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        name: pkg.manifest.name,
        "dist-tags": { latest: pkg.manifest.version },
        versions: { [pkg.manifest.version]: { ...pkg.manifest, dist: { integrity: pkg.integrity, tarball: `${registry}${name}/-/fixture.tgz` } } },
      }));
    } else {
      unexpected.push(`${request.method} ${request.url}`);
      response.writeHead(404).end();
    }
  });
  context.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
      server.closeAllConnections();
    });
    assert.deepEqual(unexpected, [], "fixture must not resolve unrelated packages or call audit");
    assert.deepEqual([...fetched].sort(), [...packages.keys()].sort(), "every fixture package must come from the loopback registry");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  registry = `http://127.0.0.1:${address.port}/`;
  set("npm_config_registry", registry);
  const sourceSha256 = Object.fromEntries(Object.entries(sources).map(([skill, body]) => [skill, createHash("sha256").update(body).digest("hex")]));
  const targetSha256 = Object.fromEntries(Object.entries(sources).map(([skill, body]) => [skill,
    Object.fromEntries(harnesses.map((harness) => [harness, createHash("sha256").update(renderEccSkill(skill, body, harness)).digest("hex")])),
  ]));
  return { ...base, components: { ...base.components, ...(includeMcp ? { mcp } : {}), ecc: { ...ecc, skills: Object.keys(sources), integrity, sourceSha256, targetSha256 } } };
}
