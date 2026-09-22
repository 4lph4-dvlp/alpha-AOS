import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

interface ProvenanceModule {
  computeFileSha256(filePath: string): string;
  verifyProvenance(tarballPath: string, sha256Path?: string): number;
}

interface SmokeModule {
  runSmokeTest(target: string, isRegistry?: boolean): Promise<number>;
}

interface ReleaseArguments {
  readonly publish: boolean;
  readonly dryRun: boolean;
  readonly allowDirtyTestOnly: boolean;
}

interface ReleaseModule {
  parseReleaseArguments(args: readonly string[], env?: NodeJS.ProcessEnv): ReleaseArguments;
}

interface ArchiveEntry {
  readonly path: string;
  readonly body: Buffer;
}

interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const verifierPath = join(repositoryRoot, "scripts", "verify-provenance.mjs");
const verifierUrl = pathToFileURL(verifierPath).href;
const smokePath = join(repositoryRoot, "scripts", "smoke-test.mjs");
const smokeUrl = pathToFileURL(smokePath).href;
const releasePath = join(repositoryRoot, "scripts", "release.mjs");
const releaseUrl = pathToFileURL(releasePath).href;
const buildManifestPath = "dist/build-artifact.json";
const stackLockPath = "catalog/stack.lock.json";

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function writeOctal(header: Buffer, start: number, length: number, value: number): void {
  header.write(value.toString(8).padStart(length - 1, "0"), start, length - 1, "ascii");
  header[start + length - 1] = 0;
}

function tarHeader(path: string, size: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(path, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function tarball(entries: readonly ArchiveEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    blocks.push(tarHeader(`package/${entry.path}`, entry.body.length), entry.body);
    const padding = (512 - (entry.body.length % 512)) % 512;
    if (padding > 0) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

function buildManifest(outputPath: string, output: Buffer): Buffer {
  return Buffer.from(`${JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-09-20T00:00:00.000Z",
    inputs: {},
    outputs: { [outputPath]: sha256(output) },
  }, null, 2)}\n`);
}

async function fixtureEntries(): Promise<ArchiveEntry[]> {
  const cli = Buffer.from("#!/usr/bin/env node\nconsole.log('fixture');\n");
  const stackLock = await readFile(join(repositoryRoot, stackLockPath));
  return [
    { path: "dist/src/cli.js", body: cli },
    { path: buildManifestPath, body: buildManifest("dist/src/cli.js", cli) },
    { path: stackLockPath, body: stackLock },
  ];
}

async function createFixture(
  context: test.TestContext,
  entries: readonly ArchiveEntry[],
  expectedEntries: readonly ArchiveEntry[] = entries,
): Promise<{ tarballPath: string; checksumPath: string }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-provenance-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const tarballPath = join(root, "alpha-aos-0.1.0.tgz");
  const checksumPath = `${tarballPath}.sha256`;
  const archive = tarball(entries);
  const expected = new Map(expectedEntries.map((entry) => [entry.path, entry.body]));
  await writeFile(tarballPath, archive);
  await writeFile(checksumPath, [
    `${sha256(archive)}  ${basename(tarballPath)}`,
    `${sha256(expected.get(buildManifestPath) ?? Buffer.alloc(0))}  ${buildManifestPath}`,
    `${sha256(expected.get(stackLockPath) ?? Buffer.alloc(0))}  ${stackLockPath}`,
    "",
  ].join("\n"));
  return { tarballPath, checksumPath };
}

function runVerifier(tarballPath: string, checksumPath: string): CommandResult {
  const result = spawnSync(process.execPath, [verifierPath, tarballPath, checksumPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : result.error?.message ?? "",
  };
}

test("valid provenance verifies the archive, build outputs, and frozen stable lock", async (context) => {
  const entries = await fixtureEntries();
  const fixture = await createFixture(context, entries);
  const provenance = await import(verifierUrl) as ProvenanceModule;

  assert.equal(provenance.computeFileSha256(fixture.tarballPath), sha256(await readFile(fixture.tarballPath)));
  assert.equal(provenance.verifyProvenance(fixture.tarballPath, fixture.checksumPath), 0);
  const result = runVerifier(fixture.tarballPath, fixture.checksumPath);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /provenance verified/iu);
});

test("a one-byte archive mutation is rejected before archive contents are trusted", async (context) => {
  const entries = await fixtureEntries();
  const fixture = await createFixture(context, entries);
  const archive = await readFile(fixture.tarballPath);
  archive[Math.floor(archive.length / 2)] = (archive[Math.floor(archive.length / 2)] ?? 0) ^ 0x01;
  await writeFile(fixture.tarballPath, archive);

  const result = runVerifier(fixture.tarballPath, fixture.checksumPath);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /sha-256.*mismatch/iu);
});

test("an archive without the canonical build artifact manifest fails closed", async (context) => {
  const expected = await fixtureEntries();
  const entries = expected.filter((entry) => entry.path !== buildManifestPath);
  const fixture = await createFixture(context, entries, expected);

  const result = runVerifier(fixture.tarballPath, fixture.checksumPath);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /missing.*dist\/build-artifact\.json/iu);
});

test("internal build output drift is rejected even when the outer archive checksum is current", async (context) => {
  const expected = await fixtureEntries();
  const entries = expected.map((entry) => entry.path === "dist/src/cli.js"
    ? { ...entry, body: Buffer.from(`${entry.body.toString("utf8")}tampered\n`) }
    : entry);
  const fixture = await createFixture(context, entries, entries);

  const result = runVerifier(fixture.tarballPath, fixture.checksumPath);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /build artifact.*mismatch|changed build output/iu);
});

test("the archived stable lock must match the provenance record byte-for-byte", async (context) => {
  const expected = await fixtureEntries();
  const entries = expected.map((entry) => entry.path === stackLockPath
    ? { ...entry, body: Buffer.from(`${entry.body.toString("utf8")} `) }
    : entry);
  const fixture = await createFixture(context, entries, expected);

  const result = runVerifier(fixture.tarballPath, fixture.checksumPath);
  assert.equal(result.status, 3);
  assert.match(result.stderr, /catalog\/stack\.lock\.json.*mismatch/iu);
});

test("release documentation separates target scope from receipt-backed proof status", async () => {
  const releaseNotesPath = join(repositoryRoot, "docs", "RELEASE_NOTES_v0.1.0.md");
  const changelogPath = join(repositoryRoot, "CHANGELOG.md");
  assert.equal(existsSync(releaseNotesPath), true, "release notes must exist");
  assert.equal(existsSync(changelogPath), true, "changelog must exist");
  const releaseNotes = await readFile(releaseNotesPath, "utf8");
  const changelog = await readFile(changelogPath, "utf8");

  for (const document of [releaseNotes, changelog]) {
    assert.match(document, /^## Active Harnesses$/mu);
    assert.match(document, /^## Claude Code Status$/mu);
    assert.match(document, /^## Known Platform Limitations$/mu);
    assert.match(document, /Claude Code.*Codex.*Antigravity.*Pi.*Hermes/isu);
    assert.match(document, /USERPROFILE.*APPDATA/isu);
    assert.match(document, /sealed.*SEAL-01.*v2/isu);
    assert.match(document, /docs\/SUPPORT_MATRIX\.md|SUPPORT_MATRIX\.md/iu);
    assert.match(document, /UNVERIFIED/iu);

    // This test guards the separation of scope from proof, so it must not
    // enshrine one era's answer as the separation itself. It previously required
    // the phrase `Claude Code … RESIDUE`, which D-18 made false and which would
    // have kept both documents stale to stay green.
    //
    // The PRESENT-tense claim is what regressed; both documents still recount the
    // superseded exclusion in past tense, and a guard that could not tell those
    // apart would forbid recording why the exclusion once existed.
    assert.doesNotMatch(
      document,
      /Claude Code[^.]*remains[^.]*RESIDUE/isu,
      "release documentation still claims Claude Code is compatibility residue, which D-18 superseded",
    );
  }
});

test("a failed smoke install leaves no temporary smoke root behind", async () => {
  const before = new Set<string>();
  for (const name of await readdir(tmpdir())) {
    if (name.startsWith("alpha-aos-smoke-")) before.add(name);
  }
  const smoke = await import(smokeUrl) as SmokeModule;
  const result = await smoke.runSmokeTest(join(tmpdir(), "alpha-aos-definitely-missing.tgz"));
  assert.equal(result, 1);
  const after = (await readdir(tmpdir()))
    .filter((name) => name.startsWith("alpha-aos-smoke-") && !before.has(name));
  assert.deepEqual(after, []);
});

test("release mode is preview-first and its dirty-tree bypass is testing-only", async () => {
  const release = await import(releaseUrl) as ReleaseModule;
  assert.deepEqual(release.parseReleaseArguments([], {}), {
    publish: false,
    dryRun: true,
    allowDirtyTestOnly: false,
  });
  assert.deepEqual(release.parseReleaseArguments(["--publish"], {}), {
    publish: true,
    dryRun: false,
    allowDirtyTestOnly: false,
  });
  assert.throws(
    () => release.parseReleaseArguments(["--allow-dirty-test-only"], {}),
    /testing.*environment|ALPHA_AOS_RELEASE_TESTING/iu,
  );
  assert.throws(
    () => release.parseReleaseArguments(["--publish", "--allow-dirty-test-only"], { ALPHA_AOS_RELEASE_TESTING: "1" }),
    /publish.*dirty|dirty.*publish/iu,
  );
  assert.throws(() => release.parseReleaseArguments(["--unknown"], {}), /usage|unknown/iu);
});

test("the release CLI refuses a dirty-tree publish bypass before running any gate", () => {
  const result = spawnSync(process.execPath, [releasePath, "--publish", "--allow-dirty-test-only"], {
    cwd: repositoryRoot,
    env: { ...process.env, ALPHA_AOS_RELEASE_TESTING: "1" },
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.status, 2);
  assert.match(typeof result.stderr === "string" ? result.stderr : "", /publish.*dirty|dirty.*publish/iu);
});

test("the installed CLI reports the canonical package version", async () => {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, "package.json"), "utf8")) as { version?: unknown };
  const result = spawnSync(process.execPath, [join(repositoryRoot, "dist", "src", "cli.js"), "--version"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, typeof result.stderr === "string" ? result.stderr : "");
  assert.equal(typeof result.stdout === "string" ? result.stdout.trim() : "", manifest.version);
});
