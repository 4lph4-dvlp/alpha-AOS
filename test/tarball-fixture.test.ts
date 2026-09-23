import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import {
  createIsolatedSandbox,
  describeHostDrift,
  fingerprintManifest,
  HOST_DRIFT_LISTING_LIMIT,
  hostNpmCache,
  installPackedRelease,
  packRelease,
  parseJsonResult,
  seedHarnessPrerequisites,
  snapshotTargets,
  vanishedEntryCount,
  type HostFingerprint,
} from "./helpers/packed-sandbox.js";

interface TarballEntry {
  readonly path: string;
  readonly size: number;
}

interface AuditModule {
  listTarballFiles(tarballPath: string): TarballEntry[];
  auditTarballEntries(files: readonly TarballEntry[]): string[];
}

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const auditModuleUrl = pathToFileURL(join(repositoryRoot, "scripts", "audit-tarball.mjs")).href;
const hostHome = homedir();
const hostStateRoot = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(hostHome, ".alpha-aos"));
const hostCodexRoot = resolve(process.env.CODEX_HOME?.trim() || join(hostHome, ".codex"));

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

async function hostSnapshot(manifests?: Map<string, HostFingerprint>): Promise<Map<string, string>> {
  return snapshotTargets(hostMutationTargets, manifests);
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
  const npmCache = hostNpmCache();

  let tarballPath: string;
  const authoritativeTarball = process.env.ALPHA_AOS_RELEASE_TARBALL?.trim();
  if (authoritativeTarball) {
    tarballPath = resolve(authoritativeTarball);
    assert.ok(existsSync(tarballPath), `authoritative CI tarball is missing: ${tarballPath}`);
  } else {
    tarballPath = packRelease(sandbox, repositoryRoot).tarballPath;
  }

  // installPackedRelease audits the tarball (allowlist, dist/src/cli.js present, no
  // catalog/candidate.lock.json), installs it into the sandbox prefix with the host npm
  // cache, and asserts the installed lock channel is `stable` with no candidate lock.
  // seedHarnessPrerequisites seeds GSD at the locked values, installs the locked ECC
  // runtime with the sandbox cache, renders the three ECC skills against the lock target
  // hashes, and renders the Codex MCP config with the packed renderMcpConfig.
  const release = await installPackedRelease(sandbox, { tarballPath, hostNpmCache: npmCache });
  const tarballBefore = release.tarballSha256;
  await seedHarnessPrerequisites(sandbox, release, "codex");

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

  const sandboxRoots = [sandbox.home, sandbox.state, sandbox.prefix];
  const beforePreviewManifests = new Map<string, HostFingerprint>();
  const beforePreview = await snapshotTargets(sandboxRoots, beforePreviewManifests);
  const preview = sandbox.runCli(["install", "--target", "codex"]);
  assert.equal(preview.status, 0, `dry-run install failed\nstdout:\n${preview.stdout}\nstderr:\n${preview.stderr}`);
  const previewSteps = preview.stdout
    .split(/\r?\n/u)
    .filter((line) => /^[A-Z]+\s+\S+ - /u.test(line) && !line.startsWith("WARNING "));
  assert.ok(previewSteps.length > 0, preview.stdout);
  assert.ok(previewSteps.every((line) => line.startsWith("CURRENT ")), preview.stdout);
  const afterPreviewManifests = new Map<string, HostFingerprint>();
  const afterPreview = await snapshotTargets(sandboxRoots, afterPreviewManifests);
  assert.deepEqual(
    afterPreview,
    beforePreview,
    describeHostDrift(beforePreviewManifests, afterPreviewManifests, undefined, "a dry-run install must not change any sandbox byte"),
  );

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
  const afterReconcileManifests = new Map<string, HostFingerprint>();
  const afterReconcile = await snapshotTargets(sandboxRoots, afterReconcileManifests);
  assert.deepEqual(
    afterReconcile,
    afterPreview,
    describeHostDrift(afterPreviewManifests, afterReconcileManifests, undefined, "an idempotent reconcile must not change any sandbox byte"),
  );

  // LIFE-08: `update --apply` reconciles the packaged stable lock only. An
  // unreviewed candidate lock dropped into the installed package is ignored.
  const candidateLockPath = join(release.installedPackage, "catalog", "candidate.lock.json");
  const installedEcc = release.installedLock.components?.ecc;
  const bogusCandidate = {
    ...release.installedLock,
    channel: "candidate",
    components: { ...release.installedLock.components, ecc: { ...installedEcc, version: "9.9.9" } },
  };
  await writeFile(candidateLockPath, `${JSON.stringify(bogusCandidate, null, 2)}\n`, "utf8");
  const beforeCandidateManifests = new Map<string, HostFingerprint>();
  const beforeCandidate = await snapshotTargets(sandboxRoots, beforeCandidateManifests);
  const candidateRun = sandbox.runCli(["update", "--apply", "--target", "codex", "--json"]);
  const candidateUpdate = parseJsonResult<InstallResult>(candidateRun, "update --apply with an unreviewed candidate lock");
  assert.deepEqual(candidateUpdate.applied, []);
  assert.deepEqual(candidateUpdate.operationIds, []);
  assert.ok(!`${candidateRun.stdout}\n${candidateRun.stderr}`.includes("9.9.9"), "the candidate ECC version must not reach update --apply output");
  assert.deepEqual(
    (await readdir(journalDir)).filter((name) => name.endsWith(".json")).sort(),
    journalsBeforeReconcile,
    "update --apply with an unreviewed candidate lock must not add a journal",
  );
  const afterCandidateManifests = new Map<string, HostFingerprint>();
  const afterCandidate = await snapshotTargets(sandboxRoots, afterCandidateManifests);
  assert.deepEqual(
    afterCandidate,
    beforeCandidate,
    describeHostDrift(beforeCandidateManifests, afterCandidateManifests, undefined, "update --apply must ignore an unreviewed candidate lock"),
  );
  await rm(candidateLockPath);

  const status =parseJsonResult<{ needsRepair?: unknown; managedStatePresent?: unknown }>(
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
