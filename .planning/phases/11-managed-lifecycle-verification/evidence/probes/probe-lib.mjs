// Phase 11 evidence probe library (plain ESM, not compiled).
//
// Every Phase 11 probe imports this file. It owns the transcript vocabulary
// documented in ../README.md, the path aliasing that keeps host paths out of
// committed evidence, the sandbox containment assertion that runs before any
// packed-CLI spawn, and the host guard that fingerprints the real managed host
// paths before and after a probe and exits 3 on drift.
//
// The packed-release mechanics (pack, install, seed, fingerprint) live in
// test/helpers/packed-sandbox.ts and are imported from its compiled form, so
// the CI lifecycle test and these probes share one implementation.
//
// Evidence rule: transcripts carry commands, exit codes, durations, CLI output
// and metadata (path, kind, size, hash prefix). Never file contents, never
// environment variable values.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
export const evidenceRoot = join(repositoryRoot, ".planning", "phases", "11-managed-lifecycle-verification", "evidence");

const helperPath = join(repositoryRoot, "dist", "test", "helpers", "packed-sandbox.js");
if (!existsSync(helperPath)) {
  throw new Error("dist/test/helpers/packed-sandbox.js is missing: run npm run build first");
}
/** The compiled test/helpers/packed-sandbox.ts module. */
export const helper = await import(pathToFileURL(helperPath).href);
export const {
  openSandbox,
  installPackedRelease,
  seedHarnessPrerequisites,
  harnessPaths,
  hostNpmCache,
  fingerprintManifest,
  snapshotTargets,
  describeHostDrift,
  vanishedEntryCount,
  parseJsonResult,
  runInstalledCli,
  npmInvocation,
  commandResult,
  createIsolatedSandbox,
} = helper;

export const OUTCOMES = Object.freeze(["HOLDS", "VIOLATED", "NOT-OBSERVED", "OBSERVED"]);
export const OUTPUT_LIMIT = 65536;

/** Twelve location names every packed-CLI step must resolve inside its sandbox. */
export const CONTAINED_LOCATION_NAMES = Object.freeze([
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CONFIG_HOME",
  "ALPHA_AOS_STATE_DIR",
  "CODEX_HOME",
  "CLAUDE_CONFIG_DIR",
  "ANTIGRAVITY_CONFIG_DIR",
  "PI_CODING_AGENT_DIR",
  "HERMES_HOME",
  "npm_config_prefix",
]);

// ---------------------------------------------------------------- arguments

function parseProbeArgs(argv) {
  const result = { keep: false, out: null, outDir: null, rest: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--keep") result.keep = true;
    else if (value === "--out") {
      const next = argv[index + 1];
      if (!next) throw new Error("--out needs a path");
      result.out = resolve(next);
      index += 1;
    } else if (value === "--out-dir") {
      const next = argv[index + 1];
      if (!next) throw new Error("--out-dir needs a directory");
      result.outDir = resolve(next);
      index += 1;
    } else result.rest.push(value);
  }
  return result;
}

export const probeArgs = parseProbeArgs(process.argv.slice(2));

export function evidencePath(name) {
  return join(evidenceRoot, name);
}

// ---------------------------------------------------------------- aliasing

const aliases = [];
const caseInsensitive = process.platform === "win32";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function pathForms(path) {
  const forms = new Set([path]);
  forms.add(JSON.stringify(path).slice(1, -1));
  forms.add(path.replaceAll("\\", "/"));
  const drive = /^([A-Za-z]):[\\/]/u.exec(path);
  if (drive) forms.add(`/${drive[1].toLowerCase()}/${path.slice(3).replaceAll("\\", "/")}`);
  return [...forms].filter((form) => form.length > 0);
}

export function registerAlias(path, token) {
  if (!path) return;
  const absolute = resolve(path);
  if (aliases.some((entry) => entry.path === absolute)) return;
  aliases.push({ path: absolute, token, forms: pathForms(absolute) });
  aliases.sort((left, right) => right.path.length - left.path.length);
}

registerAlias(os.tmpdir(), "<tmp>");
registerAlias(os.homedir(), "<home>");
registerAlias(repositoryRoot, "<repo>");

export function alias(text) {
  let result = String(text);
  for (const entry of aliases) {
    for (const form of entry.forms) {
      const pattern = new RegExp(escapeRegExp(form), caseInsensitive ? "giu" : "gu");
      result = result.replace(pattern, entry.token);
    }
  }
  return result;
}

export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/gu, "");
}

// ---------------------------------------------------------------- transcript

function gitQuery(args) {
  const result = spawnSync("git", ["-c", `safe.directory=${repositoryRoot}`, "-C", repositoryRoot, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function npmVersion() {
  const npm = npmInvocation();
  const result = spawnSync(npm.executable, [...npm.argsPrefix, "--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 60_000,
  });
  return result.status === 0 ? result.stdout.trim() : "unavailable";
}

function short(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function oneLine(value) {
  return String(value).replace(/\r?\n/gu, " | ").trim();
}

let activeTranscript = null;

export function createTranscript(probeId, outPath) {
  const target = probeArgs.out ?? (probeArgs.outDir ? join(probeArgs.outDir, basename(outPath)) : outPath);
  const head = (gitQuery(["rev-parse", "HEAD"]) ?? "unknown").trim();
  const porcelain = gitQuery(["status", "--porcelain", "--untracked-files=no"]) ?? "";
  const dirty = porcelain.split("\n").filter((line) => line.trim().length > 0).length;
  const header = {
    probe: probeId,
    head,
    "dirty-tracked": String(dirty),
    node: process.version,
    npm: npmVersion(),
    platform: `${process.platform} ${process.arch}`,
    "tarball-sha256": "n/a",
    started: new Date().toISOString(),
  };
  const body = [];
  const checkIds = new Set();
  const counts = { HOLDS: 0, VIOLATED: 0, "NOT-OBSERVED": 0, OBSERVED: 0 };
  let steps = 0;
  let hostDrift = false;
  let finalized = false;

  const transcript = {
    probeId,
    outPath: target,
    get hostDrift() {
      return hostDrift;
    },
    markHostDrift() {
      hostDrift = true;
    },
    get checkCount() {
      return checkIds.size;
    },
    setTarballSha256(sha) {
      header["tarball-sha256"] = sha;
    },
    line(text) {
      for (const part of String(text).split(/\r?\n/u)) body.push(part);
    },
    note(text) {
      body.push(`note: ${oneLine(text)}`);
    },
    step(label, record) {
      steps += 1;
      body.push("", `## step ${steps}: ${oneLine(label)}`);
      body.push(`$ ${oneLine(record.command)}`);
      const overrides = record.envOverrides ?? [];
      body.push(`env-overrides: ${overrides.length > 0 ? overrides.join(", ") : "none"}`);
      body.push(`exit: ${record.status}`);
      body.push(`duration-ms: ${record.durationMs}`);
      for (const [name, raw] of [["stdout", record.stdout ?? ""], ["stderr", record.stderr ?? ""]]) {
        const bytes = Buffer.byteLength(raw, "utf8");
        body.push(`--- ${name} (${bytes}B sha256=${short(raw)}) ---`);
        const aliased = alias(stripAnsi(raw));
        const buffer = Buffer.from(aliased, "utf8");
        const shown = buffer.length > OUTPUT_LIMIT ? buffer.subarray(0, OUTPUT_LIMIT).toString("utf8") : aliased;
        const trimmed = shown.replace(/\r?\n$/u, "");
        if (trimmed.length > 0) body.push(...trimmed.split(/\r?\n/u));
        if (buffer.length > OUTPUT_LIMIT) body.push(`[truncated: ${bytes} bytes total]`);
      }
      return steps;
    },
    check(id, outcome, detail) {
      if (!OUTCOMES.includes(outcome)) throw new Error(`check ${id}: outcome ${outcome} is not one of ${OUTCOMES.join(", ")}`);
      if (!/^[a-z0-9][a-z0-9.-]*$/u.test(id)) throw new Error(`check id ${id} is not a lower-case dotted identifier`);
      if (checkIds.has(id)) throw new Error(`check ${id} was recorded twice`);
      checkIds.add(id);
      counts[outcome] += 1;
      body.push(`CHECK ${id} ${outcome} ${oneLine(detail)}`);
    },
    finalize() {
      if (finalized) return { ...counts };
      finalized = true;
      const lines = Object.entries(header).map(([key, value]) => `${key}: ${value}`);
      lines.push(...body);
      lines.push("", `RESULT: holds=${counts.HOLDS} violated=${counts.VIOLATED} not-observed=${counts["NOT-OBSERVED"]} observed=${counts.OBSERVED}`);
      const text = `${lines.map((line) => alias(line)).join("\n")}\n`;
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text, "utf8");
      return { ...counts };
    },
  };
  activeTranscript = transcript;
  transcript.note(
    "<home>/.claude.json is not a host guard target: the executing Claude Code session rewrites it continuously, so its digest drifts independently of any probe.",
  );
  return transcript;
}

// ---------------------------------------------------------------- sandboxes

const scratchRoots = [];
let sandboxCount = 0;

function inside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export async function newSandbox(label) {
  const root = await mkdtemp(join(os.tmpdir(), `alpha-aos-p11-${label}-`));
  scratchRoots.push(root);
  sandboxCount += 1;
  registerAlias(root, sandboxCount === 1 ? "<sandbox>" : `<sandbox-${sandboxCount}>`);
  return openSandbox(root);
}

/** A scratch directory that is removed with the sandboxes and aliased to the given token. */
export async function newScratch(label, token) {
  const root = await mkdtemp(join(os.tmpdir(), `alpha-aos-p11-${label}-`));
  scratchRoots.push(root);
  registerAlias(root, token);
  return root;
}

export async function cleanupScratch() {
  if (probeArgs.keep) return;
  while (scratchRoots.length > 0) {
    const root = scratchRoots.pop();
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => undefined);
  }
}

export function assertSandboxEnv(env, root) {
  for (const name of CONTAINED_LOCATION_NAMES) {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`sandbox containment: ${name} is not set; refusing to spawn`);
    }
    if (!inside(root, value)) {
      throw new Error(`sandbox containment: ${name} resolves outside the sandbox root; refusing to spawn`);
    }
  }
}

function looksLikePath(value) {
  return typeof value === "string" && (isAbsolute(value) || /^[A-Za-z]:[\\/]/u.test(value));
}

function quoteArg(value) {
  return /[\s"]/u.test(value) ? JSON.stringify(value) : value;
}

/** Records any command as a step. Containment is the caller's job; packed-CLI steps go through runCli. */
export function runCommand(transcript, options) {
  const { label, executable, args = [], env = process.env, cwd, input, timeoutMs = 600_000, display, envOverrides = [] } = options;
  const started = process.hrtime.bigint();
  const result = commandResult(spawnSync(executable, [...args], {
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    ...(cwd === undefined ? {} : { cwd }),
    ...(input === undefined ? {} : { input }),
  }));
  const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  transcript.step(label, {
    command: display ?? [executable, ...args].map(quoteArg).join(" "),
    envOverrides,
    status: result.status,
    durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return { ...result, durationMs };
}

export function runCli(transcript, sandbox, args, options = {}) {
  const { label = `alpha-aos ${args.join(" ")}`, envOverrides = {}, input, cwd, timeoutMs } = options;
  const env = { ...sandbox.env, ...envOverrides };
  assertSandboxEnv(env, sandbox.root);
  for (const [name, value] of Object.entries(envOverrides)) {
    if (looksLikePath(value) && !inside(sandbox.root, value)) {
      throw new Error(`sandbox containment: override ${name} resolves outside the sandbox root; refusing to spawn`);
    }
  }
  const workingDirectory = cwd ?? sandbox.repo;
  if (!inside(sandbox.root, workingDirectory)) {
    throw new Error("sandbox containment: the working directory resolves outside the sandbox root; refusing to spawn");
  }
  const entrypoint = process.platform === "win32"
    ? join(sandbox.prefix, "node_modules", "alpha-aos", "dist", "src", "cli.js")
    : sandbox.resolveCli();
  const display = process.platform === "win32"
    ? ["node", entrypoint, ...args].map(quoteArg).join(" ")
    : [entrypoint, ...args].map(quoteArg).join(" ");
  const started = process.hrtime.bigint();
  const result = runInstalledCli(sandbox.resolveCli(), sandbox.prefix, args, env, {
    cwd: workingDirectory,
    ...(input === undefined ? {} : { input }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
  const durationMs = Number((process.hrtime.bigint() - started) / 1_000_000n);
  transcript.step(label, {
    command: display,
    envOverrides: Object.keys(envOverrides),
    status: result.status,
    durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  return { ...result, durationMs };
}

// ---------------------------------------------------------------- fingerprints

export async function fingerprintRoots(roots) {
  const manifests = new Map();
  const digests = await snapshotTargets(roots, manifests);
  const combined = createHash("sha256").update([...digests.values()].join("\n")).digest("hex");
  return { roots: [...roots], digests, manifests, combined };
}

/** Writes the fingerprint comparison line (and drift lines when they differ); returns true when equal. */
export function compareFingerprints(transcript, label, before, after) {
  const equal = before.roots.length === after.roots.length
    && before.roots.every((root) => before.digests.get(root) === after.digests.get(root))
    && vanishedEntryCount(before.manifests) + vanishedEntryCount(after.manifests) === 0;
  transcript.line(`fingerprint ${label}: ${before.combined.slice(0, 12)} -> ${after.combined.slice(0, 12)}`);
  if (!equal) {
    transcript.line(describeHostDrift(before.manifests, after.manifests, undefined, `drift in ${label}`));
  }
  return equal;
}

// ---------------------------------------------------------------- host guard

export function hostGuardTargets() {
  const home = os.homedir();
  const stateRoot = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(home, ".alpha-aos"));
  const codexRoot = resolve(process.env.CODEX_HOME?.trim() || join(home, ".codex"));
  const claudeRoot = resolve(process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude"));
  const piRoot = resolve(process.env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent"));
  const hermesRoot = resolve(process.env.HERMES_HOME?.trim() || join(home, ".hermes"));
  const targets = [
    stateRoot,
    join(codexRoot, "AGENTS.md"),
    join(codexRoot, "config.toml"),
    join(codexRoot, ".gsd-profile"),
    join(codexRoot, "gsd-core", "VERSION"),
    join(home, ".agents", "skills", "unified-memory", "SKILL.md"),
    join(home, ".agents", "skills", "documentation-lookup", "SKILL.md"),
    join(home, ".agents", "skills", "deep-research", "SKILL.md"),
    join(home, ".agents", "skills", "alpha-aos-control", "SKILL.md"),
    ...["unified-memory", "documentation-lookup", "deep-research", "alpha-aos-control", "alpha-aos-ship"]
      .map((skill) => join(claudeRoot, "skills", skill, "SKILL.md")),
    join(piRoot, "mcp.json"),
    join(hermesRoot, "config.yaml"),
    join(home, ".gemini", "config", "mcp_config.json"),
  ];
  return [...new Set(targets)];
}

export async function withHostGuard(transcript, fn) {
  const targets = hostGuardTargets();
  const before = await fingerprintRoots(targets);
  let failure = null;
  let value;
  try {
    value = await fn();
  } catch (error) {
    failure = error;
  }
  const after = await fingerprintRoots(targets);
  const equal = targets.every((target) => before.digests.get(target) === after.digests.get(target))
    && vanishedEntryCount(before.manifests) + vanishedEntryCount(after.manifests) === 0;
  transcript.line("");
  if (equal) {
    transcript.line(`host-guard: unchanged (${targets.length} targets)`);
  } else {
    transcript.markHostDrift();
    process.exitCode = 3;
    transcript.line("HOST-DRIFT");
    transcript.line(describeHostDrift(before.manifests, after.manifests, undefined, "a Phase 11 probe must not change any real managed host path"));
  }
  if (failure) throw failure;
  return value;
}

// ---------------------------------------------------------------- packing

export async function packOnce(transcript) {
  const provided = process.env.ALPHA_AOS_P11_TARBALL?.trim();
  let tarballPath;
  if (provided) {
    tarballPath = resolve(provided);
    if (!existsSync(tarballPath)) throw new Error("ALPHA_AOS_P11_TARBALL names a tarball that does not exist");
    registerAlias(dirname(tarballPath), "<pack>");
    transcript.note("tarball reused from ALPHA_AOS_P11_TARBALL (value not recorded)");
  } else {
    const root = await newScratch("pack", "<pack>");
    const packSandbox = await openSandbox(root);
    const npm = npmInvocation();
    const args = ["pack", repositoryRoot, "--ignore-scripts", "--json", "--pack-destination", packSandbox.repo];
    const result = runCommand(transcript, {
      label: "npm pack the repository",
      executable: npm.executable,
      args: [...npm.argsPrefix, ...args],
      env: packSandbox.env,
      cwd: packSandbox.repo,
      display: ["npm", ...args].map(quoteArg).join(" "),
    });
    if (result.status !== 0) throw new Error("npm pack failed");
    const report = JSON.parse(result.stdout);
    if (!Array.isArray(report) || report.length !== 1 || typeof report[0]?.filename !== "string") {
      throw new Error("npm pack did not report exactly one tarball");
    }
    tarballPath = join(packSandbox.repo, report[0].filename);
  }
  const { readFile } = await import("node:fs/promises");
  const sha = createHash("sha256").update(await readFile(tarballPath)).digest("hex");
  transcript.setTarballSha256(sha);
  return { tarballPath, tarballSha256: sha };
}

// ---------------------------------------------------------------- probe runner

/**
 * Runs a probe body inside the host guard and settles the exit code:
 * 0 completed, 1 probe error or zero CHECK lines, 3 host drift.
 */
export async function runProbe(probeId, defaultOutPath, body) {
  const transcript = createTranscript(probeId, defaultOutPath);
  let failure = null;
  try {
    await withHostGuard(transcript, () => body(transcript));
  } catch (error) {
    failure = error;
    transcript.line("");
    transcript.line(`PROBE-ERROR: ${oneLine(error instanceof Error ? error.message : String(error))}`);
  } finally {
    await cleanupScratch();
  }
  if (transcript.checkCount === 0) transcript.line("PROBE-ERROR: zero CHECK lines were recorded");
  const counts = transcript.finalize();
  process.stdout.write(`${alias(transcript.outPath)}: holds=${counts.HOLDS} violated=${counts.VIOLATED} not-observed=${counts["NOT-OBSERVED"]} observed=${counts.OBSERVED}\n`);
  if (transcript.hostDrift) {
    process.stderr.write("HOST-DRIFT: a real managed host path changed during the probe\n");
    process.exitCode = 3;
  } else if (failure || transcript.checkCount === 0) {
    if (failure) process.stderr.write(`${alias(failure instanceof Error ? failure.stack ?? failure.message : String(failure))}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = 0;
  }
  return transcript;
}

export function currentTranscript() {
  return activeTranscript;
}
