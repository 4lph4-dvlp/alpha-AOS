import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, LockedPackage } from "../types.js";
import { resolveNodePackageCli, runProcess } from "./process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "./install.js";
import { applyCodexGsdHookCompatibility, smokeTestCodexGsdStopHook } from "./gsd-compat.js";

export type GsdFixtureHarness = Exclude<HarnessId, "hermes">;

export interface GsdFixtureSpec {
  harness: GsdFixtureHarness;
  fixtureRoot: string;
  syntheticHome: string;
  configRoot: string;
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  /** Names this fixture sets itself, kept separate from any inherited ones. */
  fixtureEnvironment: Record<string, string>;
}

export interface GsdFixtureResult {
  harness: GsdFixtureHarness;
  version: string;
  profile: string;
  runtime: string;
  fileCount: number;
  skillCount: number;
  globalSentinelsUnchanged: boolean;
  codexStopHookSmokePassed: boolean | null;
  retainedFixture: string | null;
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function hashTree(path: string): Promise<string> {
  if (!existsSync(path)) return "absent";
  const hash = createHash("sha256");
  async function visit(root: string): Promise<void> {
    const entries = await readdir(root, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = join(root, entry.name);
      hash.update(`${entry.isDirectory() ? "d" : "f"}:${relative(path, child).replaceAll("\\", "/")}\0`);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile()) hash.update(await readFile(child));
    }
  }
  await visit(path);
  return hash.digest("hex");
}

export function createGsdFixtureSpec(options: {
  harness: GsdFixtureHarness;
  fixtureRoot: string;
  gsd: LockedPackage & { profile: string };
  baseEnv?: NodeJS.ProcessEnv;
}): GsdFixtureSpec {
  const invocation = resolveNodePackageCli("npx");
  const fixtureRoot = resolve(options.fixtureRoot);
  const syntheticHome = join(fixtureRoot, "home");
  const configRoot = join(fixtureRoot, "config");
  // Names this fixture sets itself. The ambient environment is not spread in;
  // runtime names are added by the caller's environment policy.
  const fixtureEnvironment: Record<string, string> = {
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    XDG_CONFIG_HOME: join(syntheticHome, ".config"),
    CLAUDE_CONFIG_DIR: configRoot,
    CODEX_HOME: configRoot,
    ANTIGRAVITY_CONFIG_DIR: configRoot,
    PI_CODING_AGENT_DIR: configRoot,
    HERMES_HOME: configRoot,
  };
  const env: NodeJS.ProcessEnv = { ...(options.baseEnv ?? {}), ...fixtureEnvironment };
  return {
    harness: options.harness,
    fixtureRoot,
    syntheticHome,
    configRoot,
    executable: invocation.executable,
    fixtureEnvironment,
    args: [
      ...invocation.argsPrefix,
      "--yes",
      `${options.gsd.package}@${options.gsd.version}`,
      `--${options.harness}`,
      "--global",
      `--profile=${options.gsd.profile}`,
      "--config-dir",
      configRoot,
      "--no-legacy-cleanup",
    ],
    env,
  };
}

async function countFiles(root: string, predicate: (path: string) => boolean = () => true): Promise<number> {
  if (!existsSync(root)) return 0;
  let count = 0;
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile() && predicate(child)) count += 1;
    }
  }
  await visit(root);
  return count;
}

export async function runGsdFixture(options: {
  harness: GsdFixtureHarness;
  gsd: LockedPackage & { profile: string };
  keep?: boolean;
}): Promise<GsdFixtureResult> {
  const realHome = homedir();
  const sentinels = [join(realHome, ".agents"), join(realHome, ".gsd")];
  const before = await Promise.all(sentinels.map(hashTree));
  const fixtureRoot = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-${options.harness}-`));
  const spec = createGsdFixtureSpec({ harness: options.harness, fixtureRoot, gsd: options.gsd });
  await mkdir(spec.syntheticHome, { recursive: true });
  let retain = true;
  try {
    const command = await runProcess({
      executable: spec.executable,
      args: spec.args,
      cwd: fixtureRoot,
      timeoutMs: 180_000,
      maxOutputBytes: 256 * 1024,
      // The fixture redirects every harness root at its synthetic home, so
      // the child cannot reach the real one even by accident.
      environment: nodeRuntimeEnvironment({ literal: spec.fixtureEnvironment }),
    });
    if (command.code !== "ok") throw new Error(describeProcessFailure("GSD fixture install", command));
    let codexStopHookSmokePassed: boolean | null = null;
    if (options.harness === "codex") {
      await applyCodexGsdHookCompatibility({
        schemaVersion: 1,
        channel: "stable",
        generatedAt: null,
        components: { gsd: options.gsd },
      }, {
        configRoot: spec.configRoot,
        stateRoot: join(fixtureRoot, "state"),
      });
      codexStopHookSmokePassed = (await smokeTestCodexGsdStopHook(spec.configRoot)).ok;
      if (!codexStopHookSmokePassed) throw new Error("GSD fixture Codex Stop hook smoke test failed");
    }
    const after = await Promise.all(sentinels.map(hashTree));
    const unchanged = before.every((hash, index) => hash === after[index]);
    if (!unchanged) throw new Error(`GSD fixture escaped its synthetic home; retained for forensics at ${fixtureRoot}`);
    const version = (await readFile(join(spec.configRoot, "gsd-core", "VERSION"), "utf8")).trim();
    const runtime = (await readFile(join(spec.configRoot, "gsd-core", ".gsd-runtime"), "utf8")).trim();
    const profile = (await readFile(join(spec.configRoot, ".gsd-profile"), "utf8")).trim();
    const skillCount = await countFiles(fixtureRoot, (path) => path.endsWith("SKILL.md"));
    const fileCount = await countFiles(fixtureRoot);
    retain = options.keep ?? false;
    return {
      harness: options.harness,
      version,
      profile,
      runtime,
      fileCount,
      skillCount,
      globalSentinelsUnchanged: unchanged,
      codexStopHookSmokePassed,
      retainedFixture: retain ? fixtureRoot : null,
    };
  } finally {
    if (!retain) {
      const tempRoot = resolve(tmpdir());
      if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) throw new Error(`Unsafe fixture cleanup path: ${fixtureRoot}`);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
}
