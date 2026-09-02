import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import type { StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
import { resolveNodePackageCli, runCommandCapture } from "./process.js";
import { applyFileTransaction, rollbackFileTransaction } from "./transaction.js";

const CODEX_HOOK_HELPERS = ["hook-exit.js", "cli-exit.js", "exit-code-registry.js"] as const;

export interface CodexGsdHookCompatibilityPlan {
  configRoot: string;
  monitor: string;
  required: boolean;
  entries: Array<{
    file: typeof CODEX_HOOK_HELPERS[number];
    destination: string;
    action: "create" | "verify";
  }>;
}

interface PackResult {
  filename: string;
  integrity: string;
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function packageInstallPath(root: string, packageName: string): string {
  return join(root, "node_modules", ...packageName.split("/"));
}

function parsePackResult(stdout: string): PackResult {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`npm pack did not return JSON: ${stdout}`);
  const values = JSON.parse(stdout.slice(start)) as unknown;
  if (!Array.isArray(values) || values.length !== 1 || typeof values[0] !== "object" || values[0] === null) {
    throw new Error("npm pack returned an unexpected result");
  }
  const value = values[0] as Record<string, unknown>;
  if (typeof value.filename !== "string" || typeof value.integrity !== "string") {
    throw new Error("npm pack result lacks filename or integrity");
  }
  return { filename: value.filename, integrity: value.integrity };
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function codexConfigRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return resolve(env.CODEX_HOME?.trim() || join(home, ".codex"));
}

export async function planCodexGsdHookCompatibility(configRoot = codexConfigRoot()): Promise<CodexGsdHookCompatibilityPlan> {
  const root = resolve(configRoot);
  const monitor = join(root, "hooks", "gsd-context-monitor.js");
  const required = existsSync(monitor)
    && (await readFile(monitor, "utf8")).includes("require('./lib/hook-exit.js')");
  return {
    configRoot: root,
    monitor,
    required,
    entries: CODEX_HOOK_HELPERS.map((file) => {
      const destination = join(root, "hooks", "lib", file);
      return { file, destination, action: existsSync(destination) ? "verify" : "create" };
    }),
  };
}

export function smokeTestCodexGsdStopHook(configRoot = codexConfigRoot()): { ok: boolean; status: number; stdout: string; stderr: string } {
  const monitor = join(resolve(configRoot), "hooks", "gsd-context-monitor.js");
  if (!existsSync(monitor)) return { ok: true, status: 0, stdout: "", stderr: "" };
  const input = JSON.stringify({
    session_id: `alpha-aos-smoke-${process.pid}`,
    cwd: tmpdir(),
    hook_event_name: "Stop",
  });
  const result = spawnSync(process.execPath, [monitor], {
    input,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const status = result.status ?? 1;
  return { ok: status === 0 && stdout.length === 0 && stderr.length === 0, status, stdout, stderr };
}

export async function applyCodexGsdHookCompatibility(lock: StackLock, options: {
  configRoot?: string;
  stateRoot?: string;
  verifiedSourceRoot?: string;
} = {}): Promise<{ operationId: string | null; plan: CodexGsdHookCompatibilityPlan }> {
  const gsd = lock.components.gsd;
  if (!gsd) throw new Error("Stable lock has no GSD component");
  const configRoot = options.configRoot ?? codexConfigRoot();
  const plan = await planCodexGsdHookCompatibility(configRoot);
  if (!plan.required) return { operationId: null, plan };

  const fixtureRoot = options.verifiedSourceRoot ? null : await mkdtemp(join(tmpdir(), "alpha-aos-gsd-compat-"));
  let sourceRoot = options.verifiedSourceRoot ? resolve(options.verifiedSourceRoot) : "";
  try {
    if (!sourceRoot) {
      if (!fixtureRoot) throw new Error("GSD compatibility fixture root is missing");
      const packRoot = join(fixtureRoot, "pack");
      const extractionRoot = join(fixtureRoot, "extract");
      await mkdir(packRoot, { recursive: true });
      const npm = resolveNodePackageCli("npm");
      const packed = runCommandCapture(npm.executable, [
        ...npm.argsPrefix,
        "pack",
        `${gsd.package}@${gsd.version}`,
        "--json",
        "--pack-destination",
        packRoot,
      ], { cwd: fixtureRoot, env: process.env, timeout: 180_000 });
      if (packed.status !== 0) throw new Error(`npm pack failed (${packed.status}): ${packed.stderr || packed.stdout}`);
      const pack = parsePackResult(packed.stdout);
      if (pack.integrity !== gsd.integrity) {
        throw new Error(`GSD tarball integrity mismatch: expected ${gsd.integrity}, got ${pack.integrity}`);
      }
      const archive = join(packRoot, basename(pack.filename));
      if (!existsSync(archive)) throw new Error(`npm pack archive is missing: ${archive}`);
      const installed = runCommandCapture(npm.executable, [
        ...npm.argsPrefix,
        "install",
        "--prefix",
        extractionRoot,
        archive,
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ], { cwd: fixtureRoot, env: process.env, timeout: 180_000 });
      if (installed.status !== 0) throw new Error(`GSD tarball extraction failed (${installed.status}): ${installed.stderr || installed.stdout}`);
      sourceRoot = join(packageInstallPath(extractionRoot, gsd.package), "hooks", "lib");
    }

    const operations = [];
    for (const entry of plan.entries) {
      const source = join(sourceRoot, entry.file);
      if (!inside(sourceRoot, source) || !existsSync(source)) throw new Error(`GSD hook helper is missing from the verified package: ${entry.file}`);
      const content = await readFile(source);
      const current = existsSync(entry.destination) ? await readFile(entry.destination) : null;
      if (!current || sha256(current) !== sha256(content)) operations.push({ target: entry.destination, content });
    }

    if (operations.length === 0) {
      const smoke = smokeTestCodexGsdStopHook(configRoot);
      if (!smoke.ok) throw new Error(`Codex GSD Stop hook smoke test failed (${smoke.status}): ${smoke.stderr || smoke.stdout}`);
      return { operationId: null, plan: await planCodexGsdHookCompatibility(configRoot) };
    }

    const journal = await applyFileTransaction({
      stateRoot: options.stateRoot ?? userStateRoot(),
      allowedRoots: [join(resolve(configRoot), "hooks", "lib")],
      operations,
    });
    const smoke = smokeTestCodexGsdStopHook(configRoot);
    if (!smoke.ok) {
      await rollbackFileTransaction(options.stateRoot ?? userStateRoot(), journal.id, [join(resolve(configRoot), "hooks", "lib")]);
      throw new Error(`Codex GSD Stop hook smoke test failed after compatibility sync (${smoke.status}): ${smoke.stderr || smoke.stdout}`);
    }
    return { operationId: journal.id, plan: await planCodexGsdHookCompatibility(configRoot) };
  } finally {
    if (fixtureRoot) {
      const tempRoot = resolve(tmpdir());
      if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) throw new Error(`Unsafe GSD compatibility fixture cleanup path: ${fixtureRoot}`);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
}
