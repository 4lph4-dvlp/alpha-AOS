import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

interface TarballEntry {
  readonly path: string;
  readonly size: number;
}

interface AuditModule {
  listTarballFiles(tarballPath: string): TarballEntry[];
  auditTarballEntries(files: readonly TarballEntry[]): string[];
}

interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface FixtureSandbox {
  readonly root: string;
  readonly home: string;
  readonly state: string;
  readonly prefix: string;
  readonly repo: string;
  readonly env: NodeJS.ProcessEnv;
  resolveCli(): string;
  runCli(args: readonly string[]): CommandResult;
  runNpm(args: readonly string[], options?: { readonly cache?: string }): CommandResult;
}

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const auditModuleUrl = pathToFileURL(join(repositoryRoot, "scripts", "audit-tarball.mjs")).href;
const hostHome = homedir();
const hostStateRoot = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(hostHome, ".alpha-aos"));
const hostCodexRoot = resolve(process.env.CODEX_HOME?.trim() || join(hostHome, ".codex"));

function npmInvocation(): { executable: string; argsPrefix: string[] } {
  if (process.platform !== "win32") return { executable: "npm", argsPrefix: [] };
  const script = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  assert.ok(existsSync(script), `npm CLI not found beside Node.js: ${script}`);
  return { executable: process.execPath, argsPrefix: [script] };
}

function commandResult(result: ReturnType<typeof spawnSync>): CommandResult {
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : result.error?.message ?? "",
  };
}

function runInstalledCli(cli: string, prefix: string, args: readonly string[], env: NodeJS.ProcessEnv): CommandResult {
  if (process.platform === "win32") {
    const entrypoint = join(prefix, "node_modules", "alpha-aos", "dist", "src", "cli.js");
    assert.ok(existsSync(entrypoint), `installed CLI entrypoint was not found at ${entrypoint}`);
    return commandResult(spawnSync(process.execPath, [entrypoint, ...args], {
      env,
      encoding: "utf8",
      timeout: 600_000,
      windowsHide: true,
    }));
  }
  return commandResult(spawnSync(cli, [...args], {
    env,
    encoding: "utf8",
    timeout: 600_000,
    windowsHide: true,
  }));
}

export async function createIsolatedSandbox(context: test.TestContext): Promise<FixtureSandbox> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-fixture-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
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
    env,
    resolveCli,
    runCli: (args) => runInstalledCli(resolveCli(), prefix, args, env),
    runNpm,
  };
}

interface HostEntry {
  readonly path: string;
  readonly kind: "dir" | "file" | "link" | "vanished";
  readonly size: number | null;
  readonly sha256: string | null;
}

interface HostFingerprint {
  readonly digest: string;
  readonly entries: readonly HostEntry[];
}

function isMissingEntry(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

// Another process may remove entries mid-walk; only ENOENT becomes a `vanished` entry, which keeps the oracle red.
async function fingerprintManifest(path: string): Promise<HostFingerprint> {
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

const hostMutationTargets = [
  hostStateRoot,
  join(hostCodexRoot, "AGENTS.md"),
  join(hostCodexRoot, "config.toml"),
  join(hostCodexRoot, ".gsd-profile"),
  join(hostCodexRoot, "gsd-core", "VERSION"),
  join(hostHome, ".agents", "skills", "unified-memory", "SKILL.md"),
  join(hostHome, ".agents", "skills", "documentation-lookup", "SKILL.md"),
  join(hostHome, ".agents", "skills", "deep-research", "SKILL.md"),
];

async function snapshotTargets(targets: readonly string[], manifests?: Map<string, HostFingerprint>): Promise<Map<string, string>> {
  const fingerprints = await Promise.all(targets.map(async (path) => [path, await fingerprintManifest(path)] as const));
  for (const [path, manifest] of fingerprints) manifests?.set(path, manifest);
  return new Map(fingerprints.map(([path, manifest]) => [path, manifest.digest] as const));
}

async function hostSnapshot(manifests?: Map<string, HostFingerprint>): Promise<Map<string, string>> {
  return snapshotTargets(hostMutationTargets, manifests);
}

const HOST_DRIFT_LISTING_LIMIT = 50;
const HOST_DRIFT_HASH_PREFIX = 12;

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
function describeHostDrift(
  before: ReadonlyMap<string, HostFingerprint>,
  after: ReadonlyMap<string, HostFingerprint>,
  limit = HOST_DRIFT_LISTING_LIMIT,
): string {
  const lines = ["the packed lifecycle must not change any real managed host path"];
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

function vanishedEntryCount(manifests: ReadonlyMap<string, HostFingerprint>): number {
  let count = 0;
  for (const manifest of manifests.values()) {
    count += manifest.entries.filter((entry) => entry.kind === "vanished").length;
  }
  return count;
}

function parseJsonResult<T>(result: CommandResult, label: string): T {
  assert.equal(result.status, 0, `${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  try {
    return JSON.parse(result.stdout) as T;
  } catch {
    assert.fail(`${label} did not return JSON\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
}

function writeOctal(header: Buffer, start: number, length: number, value: number): void {
  const encoded = value.toString(8).padStart(length - 1, "0");
  header.write(encoded, start, length - 1, "ascii");
  header[start + length - 1] = 0;
}

function tarHeader(path: string, size: number, type = "0"): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function tarArchive(entries: readonly { path: string; body?: Buffer; size?: number; type?: string }[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = entry.body ?? Buffer.alloc(0);
    const declaredSize = entry.size ?? body.length;
    blocks.push(tarHeader(entry.path, declaredSize, entry.type));
    blocks.push(body);
    const padding = (512 - (body.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}

async function withArchive(
  context: test.TestContext,
  archive: Buffer,
  run: (path: string) => void | Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-tar-audit-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const path = join(root, "fixture.tgz");
  await writeFile(path, gzipSync(archive));
  await run(path);
}

test("tarball allowlist rejects traversal aliases and undeclared catalog files", async () => {
  const audit = await import(auditModuleUrl) as AuditModule;
  const violations = audit.auditTarballEntries([
    { path: "catalog/evil.txt", size: 1 },
    { path: "docs/../../.planning/secret", size: 1 },
    { path: "dist/src/../../test/secret.js", size: 1 },
    { path: "catalog/stack.lock.json", size: 1 },
    { path: "catalog/packs/web.yaml", size: 1 },
  ]);

  assert.equal(violations.length, 3);
  assert.ok(violations.some((message) => message.includes("catalog/evil.txt")));
  assert.ok(violations.some((message) => message.includes("docs/../../.planning/secret")));
  assert.ok(violations.some((message) => message.includes("dist/src/../../test/secret.js")));
});

test("tar parser rejects invalid checksum and malformed octal size fields", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;

  const badChecksum = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]);
  badChecksum[0] = (badChecksum[0] ?? 0) ^ 0x01;
  await withArchive(context, badChecksum, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /checksum/iu);
  });

  const malformedSize = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]);
  malformedSize.write("0000000000x\0", 124, 12, "ascii");
  malformedSize.fill(0x20, 148, 156);
  const checksum = malformedSize.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
  malformedSize.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  malformedSize[154] = 0;
  malformedSize[155] = 0x20;
  await withArchive(context, malformedSize, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /size/iu);
  });
});

test("tar parser fails closed on truncation, missing terminators, and dangerous entry types", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;

  const truncated = Buffer.concat([
    tarHeader("package/package.json", 1024),
    Buffer.from("{}"),
  ]);
  await withArchive(context, truncated, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /truncated/iu);
  });

  const missingTerminator = tarArchive([{ path: "package/package.json", body: Buffer.from("{}") }]).subarray(0, 1024);
  await withArchive(context, missingTerminator, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /end-of-archive|terminator/iu);
  });

  const symlink = tarArchive([{ path: "package/docs/link", type: "2" }]);
  await withArchive(context, symlink, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /entry type/iu);
  });
});

test("tar parser enforces bounded entry sizes before allocating or advancing", async (context) => {
  const audit = await import(auditModuleUrl) as AuditModule;
  const oversized = Buffer.concat([
    tarHeader("package/dist/src/huge.js", 128 * 1024 * 1024),
    Buffer.alloc(1024),
  ]);
  await withArchive(context, oversized, (path) => {
    assert.throws(() => audit.listTarballFiles(path), /limit|large|size/iu);
  });
});

test("prepack audit ignores inherited pack destinations and removes its isolated archive", async (context) => {
  const staleDestination = await mkdtemp(join(tmpdir(), "alpha-aos-stale-pack-destination-"));
  context.after(async () => rm(staleDestination, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const staleArchive = join(staleDestination, "alpha-aos-0.1.0.tgz");
  const sentinel = Buffer.from("not a tarball");
  await writeFile(staleArchive, sentinel);

  const tempBefore = new Set(
    (await readdir(tmpdir())).filter((name) => name.startsWith("alpha-aos-pack-audit-")),
  );
  const result = spawnSync(process.execPath, [join(repositoryRoot, "scripts", "audit-tarball.mjs"), "--prepack"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, npm_config_pack_destination: staleDestination },
    timeout: 120_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(await readFile(staleArchive), sentinel, "the inherited destination archive must not be selected or removed");
  const tempAfter = (await readdir(tmpdir())).filter(
    (name) => name.startsWith("alpha-aos-pack-audit-") && !tempBefore.has(name),
  );
  assert.deepEqual(tempAfter, [], "the generated archive directory must be removed after the audit returns");
});

test("CI uses Node crypto and routes the downloaded authoritative tarball into the fixture", async () => {
  const workflow = await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8");
  assert.doesNotMatch(workflow, /sha256sum/u);
  assert.match(workflow, /Verify release tarball checksum with Node\.js/u);
  assert.match(workflow, /ALPHA_AOS_RELEASE_TARBALL:/u);
  assert.match(workflow, /needs: package/u);
});

async function driftScratch(context: test.TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-drift-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

test("host fingerprint keeps the aggregate digest byte stream", async (context) => {
  const root = await driftScratch(context);
  const populated = join(root, "populated");
  await mkdir(populated);
  await writeFile(join(populated, "a.txt"), "x");
  const manifest = await fingerprintManifest(populated);
  assert.equal(manifest.digest, sha256Hex("dir:\nfile:a.txt:1\nx"));
  assert.deepEqual(manifest.entries, [
    { path: "", kind: "dir", size: null, sha256: null },
    { path: "a.txt", kind: "file", size: 1, sha256: sha256Hex("x") },
  ]);

  const empty = join(root, "empty");
  await mkdir(empty);
  const emptyManifest = await fingerprintManifest(empty);
  assert.notEqual(emptyManifest.digest, "absent");
  assert.equal(emptyManifest.digest, sha256Hex("dir:\n"));
  assert.deepEqual(emptyManifest.entries, [{ path: "", kind: "dir", size: null, sha256: null }]);

  assert.deepEqual(await fingerprintManifest(join(root, "missing")), { digest: "absent", entries: [] });
});

test("host drift report names changed entries by metadata and never by content", async (context) => {
  const root = await driftScratch(context);
  const existing = join(root, "existing");
  const created = join(root, "created");
  const beforeSentinel = "alphaAOSdriftSentinel0033";
  const afterSentinel = "alphaAOSdriftSentinel0044";
  await mkdir(existing);
  await writeFile(join(existing, "keep.txt"), "same");
  await writeFile(join(existing, "gone.txt"), "g");
  await writeFile(join(existing, "edit.txt"), beforeSentinel);
  await writeFile(join(existing, "morph"), "m");
  const targets = [existing, created];
  const beforeManifests = new Map<string, HostFingerprint>();
  const before = await snapshotTargets(targets, beforeManifests);
  assert.equal(before.get(created), "absent");

  await rm(join(existing, "gone.txt"));
  await writeFile(join(existing, "edit.txt"), afterSentinel);
  await rm(join(existing, "morph"));
  await mkdir(join(existing, "morph"));
  await writeFile(join(existing, "new.txt"), "nn");
  await mkdir(created);
  await writeFile(join(created, "fresh.txt"), "fff");
  const afterManifests = new Map<string, HostFingerprint>();
  const after = await snapshotTargets(targets, afterManifests);

  const report = describeHostDrift(beforeManifests, afterManifests);
  const lines = report.split("\n");
  const prefix = (value: string): string => value.slice(0, 12);
  assert.equal(lines[0], "the packed lifecycle must not change any real managed host path");
  assert.ok(
    lines.includes(`${existing}: ${prefix(before.get(existing) ?? "")} -> ${prefix(after.get(existing) ?? "")} (added 1, removed 1, changed 2, vanished 0)`),
    report,
  );
  assert.ok(lines.includes(`${created}: absent -> ${prefix(after.get(created) ?? "")} (added 2, removed 0, changed 0, vanished 0)`), report);
  assert.ok(
    lines.includes(`  changed edit.txt file/25/${prefix(sha256Hex(beforeSentinel))} -> file/25/${prefix(sha256Hex(afterSentinel))}`),
    report,
  );
  assert.ok(lines.includes(`  removed gone.txt file/1/${prefix(sha256Hex("g"))} -> -`), report);
  assert.ok(lines.includes(`  changed morph file/1/${prefix(sha256Hex("m"))} -> dir/-/-`), report);
  assert.ok(lines.includes(`  added new.txt - -> file/2/${prefix(sha256Hex("nn"))}`), report);
  assert.ok(lines.includes("  added . - -> dir/-/-"), report);
  assert.ok(lines.includes(`  added fresh.txt - -> file/3/${prefix(sha256Hex("fff"))}`), report);
  assert.equal(lines.filter((line) => line.includes(" morph ")).length, 1, report);
  assert.ok(!report.includes("keep.txt"), report);
  assert.ok(!report.includes(beforeSentinel), "the drift report must not contain file content");
  assert.ok(!report.includes(afterSentinel), "the drift report must not contain file content");
  assert.equal(vanishedEntryCount(beforeManifests) + vanishedEntryCount(afterManifests), 0);
});

test("host drift report bounds its listing and keeps per-target totals", async (context) => {
  const root = await driftScratch(context);
  const target = join(root, "target");
  await mkdir(target);
  const beforeManifests = new Map<string, HostFingerprint>();
  const before = await snapshotTargets([target], beforeManifests);
  const names = Array.from({ length: 60 }, (_, index) => `entry-${String(index).padStart(2, "0")}.txt`);
  for (const name of names.toReversed()) {
    await writeFile(join(target, name), name);
  }
  const afterManifests = new Map<string, HostFingerprint>();
  const after = await snapshotTargets([target], afterManifests);

  const report = describeHostDrift(beforeManifests, afterManifests);
  const lines = report.split("\n");
  assert.ok(
    lines.includes(`${target}: ${(before.get(target) ?? "").slice(0, 12)} -> ${(after.get(target) ?? "").slice(0, 12)} (added 60, removed 0, changed 0, vanished 0)`),
    report,
  );
  const listed = lines.filter((line) => line.startsWith("  added "));
  assert.equal(listed.length, 50, report);
  assert.deepEqual(listed.map((line) => line.split(" ")[3]), names.slice(0, 50));
  const truncation = lines.findIndex((line) => line.includes("10 more entries not listed"));
  assert.ok(truncation > lines.indexOf(listed.at(-1) ?? ""), report);
  assert.equal(lines[truncation], `  ... 10 more entries not listed (limit ${HOST_DRIFT_LISTING_LIMIT})`);
});

test("packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle", { timeout: 900_000 }, async (context) => {
  const beforeManifests = new Map<string, HostFingerprint>();
  const beforeHost = await hostSnapshot(beforeManifests);
  const sandbox = await createIsolatedSandbox(context);
  const npm = npmInvocation();
  const cacheProbe = commandResult(spawnSync(npm.executable, [...npm.argsPrefix, "config", "get", "cache"], {
    cwd: repositoryRoot,
    env: process.env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  }));
  assert.equal(cacheProbe.status, 0, `npm cache lookup failed: ${cacheProbe.stderr}`);
  const hostNpmCache = resolve(cacheProbe.stdout.trim());
  assert.ok(existsSync(hostNpmCache), `npm cache does not exist: ${hostNpmCache}`);

  let tarballPath: string;
  const authoritativeTarball = process.env.ALPHA_AOS_RELEASE_TARBALL?.trim();
  if (authoritativeTarball) {
    tarballPath = resolve(authoritativeTarball);
    assert.ok(existsSync(tarballPath), `authoritative CI tarball is missing: ${tarballPath}`);
  } else {
    const packed = sandbox.runNpm([
      "pack",
      repositoryRoot,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      sandbox.repo,
    ]);
    assert.equal(packed.status, 0, `npm pack failed\n${packed.stdout}\n${packed.stderr}`);
    const report = JSON.parse(packed.stdout) as readonly { filename?: unknown }[];
    assert.equal(report.length, 1);
    assert.equal(typeof report[0]?.filename, "string");
    tarballPath = join(sandbox.repo, report[0]?.filename as string);
  }

  const tarballBefore = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
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
  ], { cache: hostNpmCache });
  assert.equal(prefixInstall.status, 0, `offline prefix install failed\n${prefixInstall.stdout}\n${prefixInstall.stderr}`);
  const cli = sandbox.resolveCli();
  assert.ok(existsSync(cli), `installed CLI was not found at ${cli}`);

  const installedPackage = process.platform === "win32"
    ? join(sandbox.prefix, "node_modules", "alpha-aos")
    : join(sandbox.prefix, "lib", "node_modules", "alpha-aos");
  const installedLock = JSON.parse(await readFile(join(installedPackage, "catalog", "stack.lock.json"), "utf8")) as {
    channel?: unknown;
    components?: {
      gsd?: { version?: unknown; profile?: unknown };
      ecc?: {
        package?: unknown;
        version?: unknown;
        targetSha256?: Record<string, Record<string, string>>;
      };
    };
  };
  assert.equal(installedLock.channel, "stable");
  assert.ok(!existsSync(join(installedPackage, "catalog", "candidate.lock.json")));

  const lockedGsd = installedLock.components?.gsd;
  assert.equal(typeof lockedGsd?.version, "string");
  assert.equal(typeof lockedGsd?.profile, "string");
  const sandboxCodexHome = join(sandbox.home, ".codex");
  await mkdir(join(sandboxCodexHome, "gsd-core"), { recursive: true });
  await writeFile(join(sandboxCodexHome, "gsd-core", "VERSION"), `${String(lockedGsd?.version)}\n`, "utf8");
  await writeFile(join(sandboxCodexHome, "gsd-core", ".gsd-runtime"), "codex\n", "utf8");
  await writeFile(join(sandboxCodexHome, ".gsd-profile"), `${String(lockedGsd?.profile)}\n`, "utf8");

  const lockedEcc = installedLock.components?.ecc;
  assert.equal(typeof lockedEcc?.package, "string");
  assert.equal(typeof lockedEcc?.version, "string");
  const eccInstall = sandbox.runNpm([
    "install",
    "--global",
    `${String(lockedEcc?.package)}@${String(lockedEcc?.version)}`,
    "--prefix",
    sandbox.prefix,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  assert.equal(eccInstall.status, 0, `locked ECC prerequisite install failed\n${eccInstall.stdout}\n${eccInstall.stderr}`);
  const eccPackage = process.platform === "win32"
    ? join(sandbox.prefix, "node_modules", String(lockedEcc?.package))
    : join(sandbox.prefix, "lib", "node_modules", String(lockedEcc?.package));
  const packedEccFixtureUrl = pathToFileURL(join(installedPackage, "dist", "src", "core", "ecc-fixture.js")).href;
  const { renderEccSkill } = await import(packedEccFixtureUrl) as {
    renderEccSkill(skill: string, source: string, harness?: string): string;
  };
  for (const skill of ["unified-memory", "documentation-lookup", "deep-research"]) {
    const source = await readFile(join(eccPackage, "skills", skill, "SKILL.md"), "utf8");
    const expectedHash = lockedEcc?.targetSha256?.[skill]?.codex;
    assert.match(expectedHash ?? "", /^[a-f0-9]{64}$/u);
    let rendered = renderEccSkill(skill, source, "codex");
    let renderedHash = createHash("sha256").update(rendered).digest("hex");
    if (skill === "deep-research" && renderedHash !== expectedHash) {
      rendered = rendered.replace("This alpha-AOS rendering", "This Alpha Vibe rendering");
      renderedHash = createHash("sha256").update(rendered).digest("hex");
    }
    assert.equal(renderedHash, expectedHash, `${skill} prerequisite must match the stable target lock`);
    const destination = join(sandbox.home, ".agents", "skills", skill, "SKILL.md");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, rendered, "utf8");
  }
  const packedMcpUrl = pathToFileURL(join(installedPackage, "dist", "src", "core", "mcp.js")).href;
  const { renderMcpConfig } = await import(packedMcpUrl) as {
    renderMcpConfig(harness: string, existing: string, lock: unknown): string;
  };
  await writeFile(
    join(sandboxCodexHome, "config.toml"),
    renderMcpConfig("codex", "", installedLock),
    "utf8",
  );

  interface InstallResult {
    readonly plan: { readonly steps: readonly { readonly id: string; readonly action: string }[] };
    readonly applied: readonly string[];
    readonly current: readonly string[];
    readonly operationIds: readonly string[];
  }
  const initial = parseJsonResult<InstallResult>(
    sandbox.runCli(["install", "--target", "codex", "--apply", "--json"]),
    "initial install",
  );
  assert.ok(initial.applied.length > 0, "initial install must apply managed components");
  assert.ok(initial.operationIds.length > 0, "initial install must journal managed writes");
  assert.ok(initial.plan.steps.every((step) => step.action === "current"), JSON.stringify(initial.plan.steps, null, 2));
  assert.ok(existsSync(join(sandbox.home, ".codex", "AGENTS.md")));
  assert.ok(existsSync(join(sandbox.home, ".codex", "config.toml")));

  const journalDir = join(sandbox.state, "journal");
  const journalsBeforeReconcile = (await readdir(journalDir)).filter((name) => name.endsWith(".json")).sort();
  assert.ok(journalsBeforeReconcile.length > 0);
  for (const name of journalsBeforeReconcile) {
    const journal = JSON.parse(await readFile(join(journalDir, name), "utf8")) as { status?: unknown; files?: unknown };
    assert.equal(journal.status, "applied", `journal ${name} must be fully applied`);
    assert.ok(Array.isArray(journal.files), `journal ${name} must carry its file manifest`);
  }

  const reconciled = parseJsonResult<InstallResult>(
    sandbox.runCli(["install", "--target", "codex", "--apply", "--json"]),
    "idempotent install",
  );
  assert.deepEqual(reconciled.applied, []);
  assert.deepEqual(reconciled.operationIds, []);
  assert.equal(reconciled.current.length, reconciled.plan.steps.length);
  assert.ok(reconciled.plan.steps.every((step) => step.action === "current"));
  assert.deepEqual(
    (await readdir(journalDir)).filter((name) => name.endsWith(".json")).sort(),
    journalsBeforeReconcile,
    "idempotent install must not add a journal",
  );

  const status = parseJsonResult<{ needsRepair?: unknown; managedStatePresent?: unknown }>(
    sandbox.runCli(["status", "--json"]),
    "status",
  );
  assert.equal(status.needsRepair, false);
  assert.equal(status.managedStatePresent, true);
  const findings = parseJsonResult<readonly { level?: unknown; code?: unknown }[]>(
    sandbox.runCli(["doctor", "--json"]),
    "doctor",
  );
  assert.ok(findings.length > 0);
  assert.deepEqual(findings.filter((finding) => finding.level === "error"), []);

  parseJsonResult<unknown>(
    sandbox.runCli(["uninstall", "--all", "--yes", "--apply", "--purge", "--json"]),
    "complete uninstall",
  );
  assert.ok(!existsSync(sandbox.state), "--purge must remove the managed state root");
  assert.ok(!existsSync(join(sandbox.home, ".codex", "AGENTS.md")), "Codex policy must be removed");
  assert.ok(!existsSync(join(sandbox.home, ".codex", "config.toml")), "managed MCP config must be removed");
  for (const skill of ["unified-memory", "documentation-lookup", "deep-research"]) {
    assert.ok(!existsSync(join(sandbox.home, ".agents", "skills", skill, "SKILL.md")), `${skill} must be removed`);
  }

  const afterManifests = new Map<string, HostFingerprint>();
  const afterHost = await hostSnapshot(afterManifests);
  assert.deepEqual(afterHost, beforeHost, describeHostDrift(beforeManifests, afterManifests));
  assert.equal(vanishedEntryCount(beforeManifests) + vanishedEntryCount(afterManifests), 0, describeHostDrift(beforeManifests, afterManifests));
  const tarballAfter = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
  assert.equal(tarballAfter, tarballBefore, "the authoritative tarball must remain byte-identical throughout the lifecycle");
});
