#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMMAND_TIMEOUT_MS = 20 * 60 * 1000;
const PUBLIC_NPM_REGISTRY = "https://registry.npmjs.org";

export function parseReleaseArguments(args, env = process.env) {
  const allowed = new Set(["--dry-run", "--publish", "--allow-dirty-test-only"]);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown !== undefined) throw new Error(`Unknown release option ${unknown}. Usage: node scripts/release.mjs [--dry-run | --publish]`);
  const publish = args.includes("--publish");
  if (publish && args.includes("--dry-run")) throw new Error("--publish and --dry-run are mutually exclusive");
  const allowDirtyTestOnly = args.includes("--allow-dirty-test-only");
  if (allowDirtyTestOnly && env.ALPHA_AOS_RELEASE_TESTING !== "1") {
    throw new Error("--allow-dirty-test-only requires ALPHA_AOS_RELEASE_TESTING=1 in a non-production testing environment");
  }
  if (publish && allowDirtyTestOnly) throw new Error("Publishing with a dirty-tree bypass is forbidden");
  return { publish, dryRun: !publish, allowDirtyTestOnly };
}

function npmInvocation() {
  if (process.platform !== "win32") return { executable: "npm", argsPrefix: [] };
  const script = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(script)) throw new Error(`npm CLI not found beside Node.js: ${script}`);
  return { executable: process.execPath, argsPrefix: [script] };
}

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd ?? repositoryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    timeout: options.timeoutMs ?? COMMAND_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if ((result.status ?? 1) !== 0) {
    const output = `${typeof result.stdout === "string" ? result.stdout : ""}\n${typeof result.stderr === "string" ? result.stderr : ""}`;
    const failingTitles = output
      .split(/\r?\n/u)
      .filter((line) => /^✖\s+[^\r\n]{1,200}$/u.test(line))
      .slice(0, 10);
    const processDetail = result.error?.code ? `; process error ${result.error.code}` : result.signal ? `; signal ${result.signal}` : "";
    const detail = processDetail + (failingTitles.length > 0 ? `; failing checks: ${failingTitles.join(" | ")}` : "");
    throw new Error(`${options.label ?? executable} failed with exit ${result.status ?? 1}${detail}`);
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

function assertReleaseCheckout(options) {
  const branch = run("git", ["branch", "--show-current"], { label: "git branch check" }).trim();
  if (branch !== "main") throw new Error(`release must run from main, not ${branch || "detached HEAD"}`);
  const status = run("git", ["status", "--porcelain", "--untracked-files=all"], { label: "git clean-tree check" });
  if (status.trim().length > 0 && !options.allowDirtyTestOnly) {
    throw new Error("release requires a clean Git tree; no production dirty-tree bypass is available");
  }
  if (options.allowDirtyTestOnly) return;
  const head = run("git", ["rev-parse", "HEAD"], { label: "release commit check" }).trim();
  const repository = "4lph4-dvlp/alpha-AOS";
  const remoteMain = run("gh", ["api", `repos/${repository}/git/ref/heads/main`, "--jq", ".object.sha"], { label: "authoritative main check" }).trim();
  const runs = JSON.parse(run("gh", ["run", "list", "--repo", repository, "--workflow", "ci.yml", "--commit", head,
    "--limit", "50", "--json", "databaseId,headSha,status,conclusion"], { label: "release CI lookup" }));
  const candidate = runs.find((entry) => entry.headSha === head && entry.status === "completed" && entry.conclusion === "success");
  if (!candidate) throw new Error("release requires successful three-OS CI on this exact commit");
  const evidence = JSON.parse(run("gh", ["run", "view", String(candidate.databaseId), "--repo", repository,
    "--json", "headSha,status,conclusion,jobs"], { label: "release CI evidence" }));
  validateReleaseCiEvidence(head, remoteMain, evidence);
}

export function validateReleaseCiEvidence(head, remoteMain, evidence) {
  if (!/^[a-f0-9]{40}$/u.test(head) || remoteMain !== head) throw new Error("release commit must equal authoritative main");
  if (evidence?.headSha !== head || evidence.status !== "completed" || evidence.conclusion !== "success") {
    throw new Error("release requires successful three-OS CI on this exact commit");
  }
  const required = ["Authoritative Release Package (Linux)", "ubuntu-latest / Node 24", "macos-latest / Node 24", "windows-latest / Node 24"];
  if (!Array.isArray(evidence.jobs) || required.some((name) => !evidence.jobs.some((job) => job.name === name && job.status === "completed" && job.conclusion === "success"))) {
    throw new Error("release CI evidence is missing a successful package or native OS job");
  }
}

function cleanNpmEnvironment(root) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^npm_/iu.test(name)) delete env[name];
  }
  Object.assign(env, {
    npm_config_cache: join(root, "npm-cache"),
    npm_config_logs_dir: join(root, "npm-logs"),
    npm_config_userconfig: join(root, ".npmrc"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  });
  return env;
}

export function publicationEnvironment(isolated, source = process.env) {
  const env = { ...isolated };
  for (const name of Object.keys(env)) {
    if (/^npm_config_(userconfig|globalconfig)$/iu.test(name)) delete env[name];
  }
  // Let npm read the operator's login configuration only at publication.
  // Keep credentials out of staging files and command arguments.
  for (const [name, value] of Object.entries(source)) {
    if (/^npm_config_(userconfig|globalconfig)$/iu.test(name) && value !== undefined) env[name] = value;
  }
  env.npm_config_registry = PUBLIC_NPM_REGISTRY;
  return env;
}

function trackedFiles() {
  return run("git", ["ls-files", "-z"], { label: "git tracked-file enumeration" })
    .split("\0")
    .filter((path) => path.length > 0);
}

function createReleaseStagingRoot() {
  const root = mkdtempSync(join(tmpdir(), "alpha-aos-release-preview-"));
  try {
    const checkout = join(root, "checkout");
    const artifacts = join(root, "artifacts");
    mkdirSync(checkout, { recursive: true });
    mkdirSync(artifacts, { recursive: true });
    for (const relativePath of trackedFiles()) {
      if (relativePath.startsWith("/") || /^[A-Za-z]:/u.test(relativePath) || relativePath.split(/[\\/]/u).includes("..")) {
        throw new Error(`git reported an unsafe tracked path: ${relativePath}`);
      }
      const source = join(repositoryRoot, relativePath);
      const destination = join(checkout, relativePath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
      chmodSync(destination, statSync(source).mode);
    }
    const sourceModules = join(repositoryRoot, "node_modules");
    if (!existsSync(sourceModules)) throw new Error("node_modules is missing; run npm ci before release verification");
    symlinkSync(sourceModules, join(checkout, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    run("git", ["init", "--initial-branch=main"], { cwd: checkout, label: "release staging git init" });
    run("git", ["config", "user.name", "alpha-AOS Release Fixture"], { cwd: checkout, label: "release staging git identity" });
    run("git", ["config", "user.email", "release-fixture@invalid.local"], { cwd: checkout, label: "release staging git identity" });
    run("git", ["add", "--all"], { cwd: checkout, label: "release staging git add" });
    run("git", ["commit", "-m", "release staging snapshot"], { cwd: checkout, label: "release staging git commit" });
    return { root, checkout, artifacts };
  } catch (error) {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    throw error;
  }
}

function packedTarball(report, artifacts) {
  let parsed;
  try {
    parsed = JSON.parse(report);
  } catch {
    throw new Error("npm pack did not return JSON");
  }
  const filename = Array.isArray(parsed) && parsed.length === 1 ? parsed[0]?.filename : null;
  if (!filename || !filename.startsWith("alpha-aos-") || !filename.endsWith(".tgz")) {
    throw new Error(`npm pack did not report a valid alpha-aos package tarball: ${filename}`);
  }
  const tarballPath = join(artifacts, filename);
  if (!existsSync(tarballPath)) throw new Error("npm pack did not create its declared tarball");
  return tarballPath;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function runReleaseTests(checkout, env) {
  const files = readdirSync(join(checkout, "dist", "test"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.js"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const packed = files.filter((name) => name === "tarball-fixture.test.js");
  const ordinary = files.filter((name) => name !== "tarball-fixture.test.js");
  if (ordinary.length === 0 || packed.length !== 1) {
    throw new Error("Release requires nonempty ordinary and packed lifecycle compiled test groups");
  }
  run(process.execPath, [join(checkout, "scripts", "run-tests.mjs")], {
    cwd: checkout, env, label: "release test groups", timeoutMs: 45 * 60 * 1000,
  });
}

export function runRelease(options) {
  assertReleaseCheckout(options);
  const staging = createReleaseStagingRoot();
  try {
    const npm = npmInvocation();
    const env = cleanNpmEnvironment(staging.root);
    const publishEnv = publicationEnvironment(env);
    if (options.publish) {
      run(npm.executable, [...npm.argsPrefix, "whoami", "--registry", PUBLIC_NPM_REGISTRY], {
        cwd: staging.checkout, env: publishEnv, label: "npm publication authentication",
      });
    }
    const npmRun = (script) => run(npm.executable, [...npm.argsPrefix, "run", script], {
      cwd: staging.checkout,
      env,
      label: `npm run ${script}`,
    });

    npmRun("check");
    npmRun("build");
    runReleaseTests(staging.checkout, env);
    run(process.execPath, [join(staging.checkout, "scripts", "audit-tarball.mjs"), "--prepack"], {
      cwd: staging.checkout,
      env,
      label: "tarball prepack audit",
    });
    const packReport = run(npm.executable, [
      ...npm.argsPrefix,
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      staging.artifacts,
    ], { cwd: staging.checkout, env, label: "npm pack" });
    const tarballPath = packedTarball(packReport, staging.artifacts);
    const provenanceScript = join(staging.checkout, "scripts", "verify-provenance.mjs");
    run(process.execPath, [provenanceScript, "--write", tarballPath], {
      cwd: staging.checkout,
      env,
      label: "provenance bundle generation",
    });
    run(process.execPath, [provenanceScript, tarballPath], {
      cwd: staging.checkout,
      env,
      label: "provenance verification",
    });
    run(process.execPath, [join(staging.checkout, "scripts", "smoke-test.mjs"), "--tarball", tarballPath], {
      cwd: staging.checkout,
      env,
      label: "Stage 1 local tarball smoke test",
    });

    if (!options.publish) {
      process.stdout.write(`Release preview PASSED without publishing.\nArtifact SHA-256: ${sha256(tarballPath)}\n`);
      return 0;
    }
    run(npm.executable, [...npm.argsPrefix, "publish", tarballPath, "--access", "public", "--registry", PUBLIC_NPM_REGISTRY], {
      cwd: staging.checkout,
      env: publishEnv,
      label: "npm public publish",
    });
    const packageJson = JSON.parse(readFileSync(join(staging.checkout, "package.json"), "utf8"));
    const version = packageJson.version;
    run(process.execPath, [join(staging.checkout, "scripts", "smoke-test.mjs"), "--registry", `alpha-aos@${version}`], {
      cwd: staging.checkout,
      env,
      label: "Stage 2 public-registry smoke test",
    });
    process.stdout.write(`Release v${version} published and Stage 2 smoke verification passed.\nArtifact SHA-256: ${sha256(tarballPath)}\n`);
    return 0;
  } finally {
    rmSync(staging.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

function runCli(args) {
  try {
    return runRelease(parseReleaseArguments(args));
  } catch (error) {
    process.stderr.write(`Release refused: ${error instanceof Error ? error.message : String(error)}\n`);
    return args.includes("--allow-dirty-test-only") && args.includes("--publish") ? 2 : 1;
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) process.exitCode = runCli(process.argv.slice(2));
