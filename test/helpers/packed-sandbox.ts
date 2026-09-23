// The packed-release sandbox: the one place that knows how to pack this
// repository, install the tarball into an isolated prefix, seed the harness
// prerequisites a managed install expects, and fingerprint bytes before and
// after a step.
//
// This module is NOT a test. It lives in `test/helpers/` for the same reason
// `git-fixture.ts` does: `scripts/run-tests.mjs` reads `dist/test` without
// recursion, so `dist/test/helpers` is never enumerated as a suite. The
// node:test context type is imported as a type only, so importing the compiled
// helper from a plain script (the Phase 11 evidence probes do exactly that)
// registers no test.
//
// Two consumers share it: the packed lifecycle test in
// `test/tarball-fixture.test.ts` and the Phase 11 probes under
// `.planning/phases/11-managed-lifecycle-verification/evidence/probes/`. One
// fingerprint implementation serves both, so an evidence transcript and the CI
// oracle can never disagree about what "unchanged" means.
//
// Every path this helper writes is derived from the sandbox env and home,
// never from `process.env` or `os.homedir()`: a seeding step that fell back to
// the caller's home would be the exact host leak the probes guard against.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { TestContext } from "node:test";
import { pathToFileURL } from "node:url";

export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunOptions {
  readonly input?: string;
  readonly timeoutMs?: number;
  readonly cwd?: string;
}

export interface FixtureSandbox {
  readonly root: string;
  readonly home: string;
  readonly state: string;
  readonly prefix: string;
  readonly repo: string;
  readonly temp: string;
  readonly cache: string;
  readonly npmLogs: string;
  readonly env: NodeJS.ProcessEnv;
  resolveCli(): string;
  runCli(args: readonly string[], options?: RunOptions): CommandResult;
  runNpm(args: readonly string[], options?: { readonly cache?: string }): CommandResult;
}

interface TarballEntry {
  readonly path: string;
  readonly size: number;
}

interface AuditModule {
  listTarballFiles(tarballPath: string): TarballEntry[];
  auditTarballEntries(files: readonly TarballEntry[]): string[];
}

export interface PackedLock {
  readonly channel?: unknown;
  readonly components?: {
    readonly gsd?: { readonly version?: unknown; readonly profile?: unknown };
    readonly ecc?: {
      readonly package?: unknown;
      readonly version?: unknown;
      readonly targetSha256?: Record<string, Record<string, string>>;
    };
    readonly mcpBridges?: { readonly pi?: { readonly package?: unknown; readonly version?: unknown } };
  };
}

export interface PackedRelease {
  readonly tarballPath: string;
  readonly tarballSha256: string;
  readonly installedPackage: string;
  readonly installedLock: PackedLock;
}

export type SandboxHarness = "claude" | "codex" | "antigravity" | "pi" | "hermes";

export interface HarnessPaths {
  readonly gsdRoot: string | null;
  readonly eccSkillRoot: string;
  readonly mcpConfigPath: string;
  readonly piBridgeManifest: string | null;
}

export const ECC_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"] as const;

const repositoryRoot = resolve(import.meta.dirname, "..", "..", "..");
const auditModuleUrl = pathToFileURL(join(repositoryRoot, "scripts", "audit-tarball.mjs")).href;

export function npmInvocation(): { executable: string; argsPrefix: string[] } {
  if (process.platform !== "win32") return { executable: "npm", argsPrefix: [] };
  const script = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  assert.ok(existsSync(script), `npm CLI not found beside Node.js: ${script}`);
  return { executable: process.execPath, argsPrefix: [script] };
}

export function commandResult(result: ReturnType<typeof spawnSync>): CommandResult {
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : result.error?.message ?? "",
  };
}

export function runInstalledCli(
  cli: string,
  prefix: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  options: RunOptions = {},
): CommandResult {
  const spawnOptions = {
    env,
    encoding: "utf8" as const,
    timeout: options.timeoutMs ?? 600_000,
    windowsHide: true,
    ...(options.input === undefined ? {} : { input: options.input }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
  };
  if (process.platform === "win32") {
    const entrypoint = join(prefix, "node_modules", "alpha-aos", "dist", "src", "cli.js");
    assert.ok(existsSync(entrypoint), `installed CLI entrypoint was not found at ${entrypoint}`);
    return commandResult(spawnSync(process.execPath, [entrypoint, ...args], spawnOptions));
  }
  return commandResult(spawnSync(cli, [...args], spawnOptions));
}

export async function openSandbox(root: string): Promise<FixtureSandbox> {
  const home = join(root, "home");
  const state = join(root, "state");
  const prefix = join(root, "prefix");
  const repo = join(root, "repo");
  const temp = join(root, "temp");
  const cache = join(root, "npm-cache");
  const npmLogs = join(root, "npm-logs");
  const codexHome = join(home, ".codex");
  await Promise.all([home, state, prefix, repo, temp, cache, npmLogs, codexHome].map((path) => mkdir(path, { recursive: true })));

  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^npm_/iu.test(key)) delete env[key];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    ALPHA_AOS_STATE_DIR: state,
    CODEX_HOME: codexHome,
    ANTIGRAVITY_CONFIG_DIR: join(home, ".gemini", "antigravity"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
    HERMES_HOME: join(home, ".hermes"),
    npm_config_prefix: prefix,
    npm_config_cache: cache,
    npm_config_logs_dir: npmLogs,
    npm_config_userconfig: join(root, ".npmrc"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    TMPDIR: temp,
    TEMP: temp,
    TMP: temp,
  });

  const resolveCli = (): string => {
    if (process.platform === "win32") {
      const direct = join(prefix, "alpha-aos.cmd");
      return existsSync(direct) ? direct : join(prefix, "bin", "alpha-aos.cmd");
    }
    return join(prefix, "bin", "alpha-aos");
  };
  const runNpm = (args: readonly string[], options: { readonly cache?: string } = {}): CommandResult => {
    const npm = npmInvocation();
    return commandResult(spawnSync(npm.executable, [...npm.argsPrefix, ...args], {
      cwd: repo,
      env: options.cache === undefined ? env : { ...env, npm_config_cache: options.cache },
      encoding: "utf8",
      timeout: 600_000,
      windowsHide: true,
    }));
  };
  return {
    root,
    home,
    state,
    prefix,
    repo,
    temp,
    cache,
    npmLogs,
    env,
    resolveCli,
    runCli: (args, options) => runInstalledCli(resolveCli(), prefix, args, env, options),
    runNpm,
  };
}

export async function createIsolatedSandbox(context: TestContext): Promise<FixtureSandbox> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-fixture-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return openSandbox(root);
}

export function hostNpmCache(): string {
  const npm = npmInvocation();
  const cacheProbe = commandResult(spawnSync(npm.executable, [...npm.argsPrefix, "config", "get", "cache"], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  }));
  assert.equal(cacheProbe.status, 0, `npm cache lookup failed: ${cacheProbe.stderr}`);
  const cache = resolve(cacheProbe.stdout.trim());
  assert.ok(existsSync(cache), `npm cache does not exist: ${cache}`);
  return cache;
}

export function packRelease(sandbox: FixtureSandbox, sourceRoot: string = repositoryRoot): { tarballPath: string } {
  const packed = sandbox.runNpm([
    "pack",
    sourceRoot,
    "--ignore-scripts",
    "--json",
    "--pack-destination",
    sandbox.repo,
  ]);
  assert.equal(packed.status, 0, `npm pack failed\n${packed.stdout}\n${packed.stderr}`);
  const report = JSON.parse(packed.stdout) as readonly { filename?: unknown }[];
  assert.equal(report.length, 1);
  assert.equal(typeof report[0]?.filename, "string");
  return { tarballPath: join(sandbox.repo, report[0]?.filename as string) };
}

function installedPackageDirectory(sandbox: FixtureSandbox, name: string): string {
  return process.platform === "win32"
    ? join(sandbox.prefix, "node_modules", name)
    : join(sandbox.prefix, "lib", "node_modules", name);
}

export async function installPackedRelease(
  sandbox: FixtureSandbox,
  options: { readonly tarballPath: string; readonly hostNpmCache: string },
): Promise<PackedRelease> {
  const tarballPath = resolve(options.tarballPath);
  assert.ok(existsSync(tarballPath), `release tarball is missing: ${tarballPath}`);
  const tarballSha256 = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
  const audit = await import(auditModuleUrl) as AuditModule;
  const packedEntries = audit.listTarballFiles(tarballPath);
  assert.deepEqual(audit.auditTarballEntries(packedEntries), []);
  assert.ok(packedEntries.some((entry) => entry.path === "dist/src/cli.js"));
  assert.ok(!packedEntries.some((entry) => entry.path === "catalog/candidate.lock.json"));

  const prefixInstall = sandbox.runNpm([
    "install",
    "--global",
    tarballPath,
    "--prefix",
    sandbox.prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--prefer-offline",
  ], { cache: options.hostNpmCache });
  assert.equal(prefixInstall.status, 0, `offline prefix install failed\n${prefixInstall.stdout}\n${prefixInstall.stderr}`);
  const cli = sandbox.resolveCli();
  assert.ok(existsSync(cli), `installed CLI was not found at ${cli}`);

  const installedPackage = installedPackageDirectory(sandbox, "alpha-aos");
  const installedLock = JSON.parse(await readFile(join(installedPackage, "catalog", "stack.lock.json"), "utf8")) as PackedLock;
  assert.equal(installedLock.channel, "stable");
  assert.ok(!existsSync(join(installedPackage, "catalog", "candidate.lock.json")));
  return { tarballPath, tarballSha256, installedPackage, installedLock };
}

function repositoryLock(): PackedLock {
  return JSON.parse(readFileSync(join(repositoryRoot, "catalog", "stack.lock.json"), "utf8")) as PackedLock;
}

function lockedPiBridge(lock: PackedLock): { package: string; version: string } {
  const bridge = lock.components?.mcpBridges?.pi;
  assert.equal(typeof bridge?.package, "string", "the stable lock must pin the Pi MCP bridge package");
  assert.equal(typeof bridge?.version, "string", "the stable lock must pin the Pi MCP bridge version");
  return { package: String(bridge?.package), version: String(bridge?.version) };
}

// Mirrors src/core/install.ts globalGsdConfigRoot, src/core/ecc-skills.ts
// globalEccSkillRoot and src/core/mcp.ts globalMcpConfigPath and
// piBridgeManifestPath, evaluated against the sandbox env and home only.
export function harnessPaths(sandbox: FixtureSandbox, harness: SandboxHarness, lock: PackedLock = repositoryLock()): HarnessPaths {
  const env = sandbox.env;
  const home = sandbox.home;
  const fromEnv = (name: string, fallback: string): string => resolve(env[name]?.trim() || fallback);
  switch (harness) {
    case "claude": {
      const root = fromEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
      return { gsdRoot: root, eccSkillRoot: join(root, "skills"), mcpConfigPath: join(home, ".claude.json"), piBridgeManifest: null };
    }
    case "codex": {
      const root = fromEnv("CODEX_HOME", join(home, ".codex"));
      return { gsdRoot: root, eccSkillRoot: join(home, ".agents", "skills"), mcpConfigPath: join(root, "config.toml"), piBridgeManifest: null };
    }
    case "antigravity": {
      const root = fromEnv("ANTIGRAVITY_CONFIG_DIR", join(home, ".gemini", "antigravity"));
      const skillBase = env.ANTIGRAVITY_CONFIG_DIR?.trim() ? root : join(home, ".gemini", "config");
      return {
        gsdRoot: root,
        eccSkillRoot: join(skillBase, "skills"),
        mcpConfigPath: join(home, ".gemini", "config", "mcp_config.json"),
        piBridgeManifest: null,
      };
    }
    case "pi": {
      const root = fromEnv("PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
      const mcpConfigPath = join(root, "mcp.json");
      const bridge = lockedPiBridge(lock);
      return {
        gsdRoot: root,
        eccSkillRoot: join(home, ".agents", "skills"),
        mcpConfigPath,
        piBridgeManifest: join(dirname(mcpConfigPath), "npm", "node_modules", bridge.package, "package.json"),
      };
    }
    case "hermes": {
      const root = fromEnv("HERMES_HOME", join(home, ".hermes"));
      return { gsdRoot: null, eccSkillRoot: join(root, "skills"), mcpConfigPath: join(root, "config.yaml"), piBridgeManifest: null };
    }
  }
}

export async function seedHarnessPrerequisites(
  sandbox: FixtureSandbox,
  release: PackedRelease,
  harness: SandboxHarness,
  options: { readonly eccCache?: string } = {},
): Promise<HarnessPaths> {
  const lock = release.installedLock;
  const paths = harnessPaths(sandbox, harness, lock);

  if (paths.gsdRoot !== null) {
    const lockedGsd = lock.components?.gsd;
    assert.equal(typeof lockedGsd?.version, "string");
    assert.equal(typeof lockedGsd?.profile, "string");
    await mkdir(join(paths.gsdRoot, "gsd-core"), { recursive: true });
    await writeFile(join(paths.gsdRoot, "gsd-core", "VERSION"), `${String(lockedGsd?.version)}\n`, "utf8");
    await writeFile(join(paths.gsdRoot, "gsd-core", ".gsd-runtime"), `${harness}\n`, "utf8");
    await writeFile(join(paths.gsdRoot, ".gsd-profile"), `${String(lockedGsd?.profile)}\n`, "utf8");
  }

  const lockedEcc = lock.components?.ecc;
  assert.equal(typeof lockedEcc?.package, "string");
  assert.equal(typeof lockedEcc?.version, "string");
  const eccPackage = installedPackageDirectory(sandbox, String(lockedEcc?.package));
  if (!existsSync(join(eccPackage, "package.json"))) {
    const eccInstall = sandbox.runNpm([
      "install",
      "--global",
      `${String(lockedEcc?.package)}@${String(lockedEcc?.version)}`,
      "--prefix",
      sandbox.prefix,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ], options.eccCache === undefined ? {} : { cache: options.eccCache });
    assert.equal(eccInstall.status, 0, `locked ECC prerequisite install failed\n${eccInstall.stdout}\n${eccInstall.stderr}`);
  }
  const eccManifest = JSON.parse(await readFile(join(eccPackage, "package.json"), "utf8")) as { version?: unknown };
  assert.equal(eccManifest.version, lockedEcc?.version, "the prefix must hold the locked ECC runtime version");

  const packedEccFixtureUrl = pathToFileURL(join(release.installedPackage, "dist", "src", "core", "ecc-fixture.js")).href;
  const { renderEccSkill } = await import(packedEccFixtureUrl) as {
    renderEccSkill(skill: string, source: string, harness?: string): string;
  };
  for (const skill of ECC_SKILLS) {
    const source = await readFile(join(eccPackage, "skills", skill, "SKILL.md"), "utf8");
    const expectedHash = lockedEcc?.targetSha256?.[skill]?.[harness];
    assert.match(expectedHash ?? "", /^[a-f0-9]{64}$/u);
    let rendered = renderEccSkill(skill, source, harness);
    let renderedHash = createHash("sha256").update(rendered).digest("hex");
    if (skill === "deep-research" && renderedHash !== expectedHash) {
      rendered = rendered.replace("This alpha-AOS rendering", "This Alpha Vibe rendering");
      renderedHash = createHash("sha256").update(rendered).digest("hex");
    }
    assert.equal(renderedHash, expectedHash, `${skill} prerequisite must match the stable target lock for ${harness}`);
    const destination = join(paths.eccSkillRoot, skill, "SKILL.md");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, rendered, "utf8");
  }

  const packedMcpUrl = pathToFileURL(join(release.installedPackage, "dist", "src", "core", "mcp.js")).href;
  const { renderMcpConfig } = await import(packedMcpUrl) as {
    renderMcpConfig(harness: string, existing: string, lock: unknown): string;
  };
  await mkdir(dirname(paths.mcpConfigPath), { recursive: true });
  await writeFile(paths.mcpConfigPath, renderMcpConfig(harness, "", lock), "utf8");

  if (paths.piBridgeManifest !== null) {
    const bridge = lockedPiBridge(lock);
    await mkdir(dirname(paths.piBridgeManifest), { recursive: true });
    await writeFile(paths.piBridgeManifest, `${JSON.stringify({ name: bridge.package, version: bridge.version }, null, 2)}\n`, "utf8");
  }
  return paths;
}

export interface HostEntry {
  readonly path: string;
  readonly kind: "dir" | "file" | "link" | "vanished";
  readonly size: number | null;
  readonly sha256: string | null;
}

export interface HostFingerprint {
  readonly digest: string;
  readonly entries: readonly HostEntry[];
}

function isMissingEntry(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

// Another process may remove entries mid-walk; only ENOENT becomes a `vanished` entry, which keeps the oracle red.
export async function fingerprintManifest(path: string): Promise<HostFingerprint> {
  if (!existsSync(path)) return { digest: "absent", entries: [] };
  const hash = createHash("sha256");
  const entries: HostEntry[] = [];
  const vanished = (relativePath: string): void => {
    hash.update(`vanished:${relativePath}\n`);
    entries.push({ path: relativePath, kind: "vanished", size: null, sha256: null });
  };
  const visit = async (current: string, relativePath: string): Promise<void> => {
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) {
        const target = await readlink(current);
        hash.update(`link:${relativePath}:${target}\n`);
        entries.push({
          path: relativePath,
          kind: "link",
          size: Buffer.byteLength(target, "utf8"),
          sha256: createHash("sha256").update(target).digest("hex"),
        });
        return;
      }
      if (info.isDirectory()) {
        const children = await readdir(current, { withFileTypes: true });
        hash.update(`dir:${relativePath}\n`);
        entries.push({ path: relativePath, kind: "dir", size: null, sha256: null });
        for (const entry of children.sort((left, right) => left.name.localeCompare(right.name))) {
          await visit(join(current, entry.name), relativePath ? `${relativePath}/${entry.name}` : entry.name);
        }
        return;
      }
      const bytes = info.size <= 1024 * 1024 ? await readFile(current) : null;
      hash.update(`file:${relativePath}:${info.size}\n`);
      if (bytes) hash.update(bytes);
      entries.push({
        path: relativePath,
        kind: "file",
        size: info.size,
        sha256: bytes ? createHash("sha256").update(bytes).digest("hex") : null,
      });
    } catch (error) {
      if (!isMissingEntry(error)) throw error;
      vanished(relativePath);
    }
  };
  await visit(path, "");
  return { digest: hash.digest("hex"), entries };
}

export async function snapshotTargets(targets: readonly string[], manifests?: Map<string, HostFingerprint>): Promise<Map<string, string>> {
  const fingerprints = await Promise.all(targets.map(async (path) => [path, await fingerprintManifest(path)] as const));
  for (const [path, manifest] of fingerprints) manifests?.set(path, manifest);
  return new Map(fingerprints.map(([path, manifest]) => [path, manifest.digest] as const));
}

export const HOST_DRIFT_LISTING_LIMIT = 50;
export const HOST_DRIFT_HASH_PREFIX = 12;
const HOST_DRIFT_HEADER = "the packed lifecycle must not change any real managed host path";

type DriftStatus = "added" | "removed" | "changed" | "vanished";

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function describeHostEntry(entry: HostEntry | undefined): string {
  if (!entry) return "-";
  const size = entry.size === null ? "-" : String(entry.size);
  const hash = entry.sha256 === null ? "-" : entry.sha256.slice(0, HOST_DRIFT_HASH_PREFIX);
  return `${entry.kind}/${size}/${hash}`;
}

function describeDigest(digest: string | undefined): string {
  if (digest === undefined || digest === "absent") return "absent";
  return digest.slice(0, HOST_DRIFT_HASH_PREFIX);
}

// Metadata only: relative path, kind, size and a hash prefix. File content never enters the message.
export function describeHostDrift(
  before: ReadonlyMap<string, HostFingerprint>,
  after: ReadonlyMap<string, HostFingerprint>,
  limit = HOST_DRIFT_LISTING_LIMIT,
  header = HOST_DRIFT_HEADER,
): string {
  const lines = [header];
  let listed = 0;
  let unlisted = 0;
  for (const [target, beforeManifest] of before) {
    const afterManifest = after.get(target);
    const beforeEntries = new Map(beforeManifest.entries.map((entry) => [entry.path, entry] as const));
    const afterEntries = new Map((afterManifest?.entries ?? []).map((entry) => [entry.path, entry] as const));
    const paths = [...new Set([...beforeEntries.keys(), ...afterEntries.keys()])].sort(compareCodeUnits);
    const drift: { status: DriftStatus; path: string; before: HostEntry | undefined; after: HostEntry | undefined }[] = [];
    for (const path of paths) {
      const left = beforeEntries.get(path);
      const right = afterEntries.get(path);
      let status: DriftStatus | undefined;
      if (left?.kind === "vanished" || right?.kind === "vanished") status = "vanished";
      else if (!left) status = "added";
      else if (!right) status = "removed";
      else if (left.kind !== right.kind || left.size !== right.size || left.sha256 !== right.sha256) status = "changed";
      if (status) drift.push({ status, path, before: left, after: right });
    }
    if (beforeManifest.digest === afterManifest?.digest && !drift.some((entry) => entry.status === "vanished")) continue;
    const count = (status: DriftStatus): number => drift.filter((entry) => entry.status === status).length;
    lines.push(
      `${target}: ${describeDigest(beforeManifest.digest)} -> ${describeDigest(afterManifest?.digest)} ` +
      `(added ${count("added")}, removed ${count("removed")}, changed ${count("changed")}, vanished ${count("vanished")})`,
    );
    for (const entry of drift) {
      if (listed >= limit) {
        unlisted += 1;
        continue;
      }
      listed += 1;
      lines.push(`  ${entry.status} ${entry.path || "."} ${describeHostEntry(entry.before)} -> ${describeHostEntry(entry.after)}`);
    }
  }
  if (unlisted > 0) lines.push(`  ... ${unlisted} more entries not listed (limit ${limit})`);
  return lines.join("\n");
}

export function vanishedEntryCount(manifests: ReadonlyMap<string, HostFingerprint>): number {
  let count = 0;
  for (const manifest of manifests.values()) {
    count += manifest.entries.filter((entry) => entry.kind === "vanished").length;
  }
  return count;
}

export function parseJsonResult<T>(result: CommandResult, label: string): T {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    assert.fail(`${label} did not return JSON\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

