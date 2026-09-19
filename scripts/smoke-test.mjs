#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;

function npmInvocation() {
  if (process.platform !== "win32") return { executable: "npm", argsPrefix: [] };
  const script = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (!existsSync(script)) throw new Error(`npm CLI not found beside Node.js: ${script}`);
  return { executable: process.execPath, argsPrefix: [script] };
}

function run(executable, args, options) {
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: COMMAND_TIMEOUT_MS,
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { status: result.status ?? 1, error: result.error ?? null };
}

function isolatedEnvironment(root, home, prefix, state) {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^npm_/iu.test(name)) delete env[name];
  }
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, ".config"),
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    ALPHA_AOS_STATE_DIR: state,
    CODEX_HOME: join(home, ".codex"),
    ANTIGRAVITY_CONFIG_DIR: join(home, ".gemini", "antigravity"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    PI_CODING_AGENT_DIR: join(home, ".pi", "agent"),
    HERMES_HOME: join(home, ".hermes"),
    npm_config_prefix: prefix,
    npm_config_cache: join(root, "npm-cache"),
    npm_config_logs_dir: join(root, "npm-logs"),
    npm_config_userconfig: join(root, ".npmrc"),
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    TMPDIR: join(root, "temp"),
    TEMP: join(root, "temp"),
    TMP: join(root, "temp"),
  });
  return env;
}

function installedEntrypoint(prefix) {
  const moduleRoot = process.platform === "win32"
    ? join(prefix, "node_modules", "alpha-aos")
    : join(prefix, "lib", "node_modules", "alpha-aos");
  return join(moduleRoot, "dist", "src", "cli.js");
}

export async function runSmokeTest(target, isRegistry = false) {
  const sandbox = await mkdtemp(join(tmpdir(), "alpha-aos-smoke-"));
  const home = join(sandbox, "home");
  const prefix = join(sandbox, "prefix");
  const state = join(sandbox, "state");
  const directories = [
    home,
    prefix,
    state,
    join(sandbox, "npm-cache"),
    join(sandbox, "npm-logs"),
    join(sandbox, "temp"),
  ];
  try {
    await Promise.all(directories.map((path) => mkdir(path, { recursive: true })));
    const env = isolatedEnvironment(sandbox, home, prefix, state);
    const npm = npmInvocation();
    const install = run(npm.executable, [
      ...npm.argsPrefix,
      "install",
      "--global",
      target,
      "--prefix",
      prefix,
      "--no-audit",
      "--no-fund",
    ], { cwd: sandbox, env });
    if (install.status !== 0) {
      process.stderr.write(`Smoke install failed for ${isRegistry ? "registry package" : "local tarball"} (exit ${install.status}).\n`);
      return 1;
    }

    const entrypoint = installedEntrypoint(prefix);
    if (!existsSync(entrypoint)) {
      process.stderr.write("Smoke install did not create the alpha-aos CLI entrypoint.\n");
      return 1;
    }
    for (const args of [["--version"], ["status"], ["doctor"]]) {
      const result = run(process.execPath, [entrypoint, ...args], { cwd: sandbox, env });
      if (result.status !== 0) {
        process.stderr.write(`Smoke check alpha-aos ${args.join(" ")} failed (exit ${result.status}).\n`);
        return 1;
      }
    }
    process.stdout.write(`Smoke test PASSED for ${isRegistry ? "registry package" : "local tarball"}.\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

async function packLocalTarball() {
  const packRoot = await mkdtemp(join(tmpdir(), "alpha-aos-smoke-pack-"));
  try {
    const npm = npmInvocation();
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (/^npm_/iu.test(name)) delete env[name];
    }
    const build = run(npm.executable, [...npm.argsPrefix, "run", "build"], { cwd: packageRoot, env });
    if (build.status !== 0) throw new Error(`local build failed with exit ${build.status}`);
    const packed = spawnSync(npm.executable, [
      ...npm.argsPrefix,
      "pack",
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      packRoot,
    ], {
      cwd: packageRoot,
      env,
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    if ((packed.status ?? 1) !== 0) throw new Error(`local pack failed with exit ${packed.status ?? 1}`);
    const report = JSON.parse(typeof packed.stdout === "string" ? packed.stdout : "");
    const filename = Array.isArray(report) && report.length === 1 ? report[0]?.filename : null;
    if (typeof filename !== "string" || filename !== "alpha-aos-0.1.0.tgz") {
      throw new Error("npm pack did not report the authoritative alpha-aos-0.1.0.tgz artifact");
    }
    const tarballPath = join(packRoot, filename);
    if (!existsSync(tarballPath)) throw new Error("npm pack did not create its declared tarball");
    return { packRoot, tarballPath };
  } catch (error) {
    await rm(packRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    throw error;
  }
}

function parseCliArguments(args) {
  if (args.length === 1 && args[0] === "--local") return { mode: "local", target: null };
  if (args.length === 2 && args[0] === "--tarball") return { mode: "local", target: resolve(args[1]) };
  if (args.length === 1 && args[0] === "--registry") return { mode: "registry", target: "alpha-aos@0.1.0" };
  if (args.length === 2 && args[0] === "--registry") return { mode: "registry", target: args[1] };
  throw new Error("Usage: node scripts/smoke-test.mjs --local | --tarball <path> | --registry [package@version]");
}

async function runCli(args) {
  let temporaryPack = null;
  try {
    const parsed = parseCliArguments(args);
    if (parsed.mode === "registry") return runSmokeTest(parsed.target, true);
    if (parsed.target !== null) return runSmokeTest(parsed.target, false);
    temporaryPack = await packLocalTarball();
    return runSmokeTest(temporaryPack.tarballPath, false);
  } catch (error) {
    process.stderr.write(`Smoke test failed: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    if (temporaryPack !== null) {
      await rm(temporaryPack.packRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  }
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) process.exitCode = await runCli(process.argv.slice(2));
