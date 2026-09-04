import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, LockedPackage } from "../types.js";
import { resolveNodePackageCli, runProcess, type ProcessSpec } from "./process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "./install.js";
import { applyCodexGsdHookCompatibility, smokeTestCodexGsdStopHook } from "./gsd-compat.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  beginFixture,
  declaredEnvironmentNames,
  declaredProcessSpec,
  plannedFixtureRoot,
  plannedProof,
  reviewedDigest,
} from "./component-session.js";

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

// ---------------------------------------------------------------------------
// Complete fixture operation plan
// ---------------------------------------------------------------------------

export interface GsdFixtureOperationPlan {
  kind: "gsd-fixture";
  harness: GsdFixtureHarness;
  /** Named before it exists, so the location is reviewed rather than discovered. */
  fixtureRoot: string;
  syntheticHome: string;
  configRoot: string;
  /** The throwaway state root the fixture's own Codex hook sync writes under. */
  fixtureStateRoot: string;
  package: { name: string; version: string; integrity: string; profile: string };
  /** The one child this fixture runs, declared before it runs. */
  spec: ProcessSpec;
  environmentNames: readonly string[];
  /** Real-home paths that must be byte-identical after the fixture runs. */
  sentinels: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
}

/**
 * Enumerates every path and child this fixture may use, before it creates
 * anything. The fixture root is named here rather than by `mkdtemp` during
 * apply, so a caller can review the exact location it will write to.
 */
export async function createGsdFixtureOperationPlan(options: {
  harness: GsdFixtureHarness;
  gsd: LockedPackage & { profile: string };
  fixtureRoot?: string;
}): Promise<GsdFixtureOperationPlan> {
  const fixtureRoot = resolve(options.fixtureRoot ?? plannedFixtureRoot(`alpha-aos-gsd-${options.harness}`));
  const spec = createGsdFixtureSpec({ harness: options.harness, fixtureRoot, gsd: options.gsd });
  const fixtureStateRoot = join(fixtureRoot, "state");
  const realHome = homedir();
  const sentinels = [join(realHome, ".agents"), join(realHome, ".gsd")];
  const environment = nodeRuntimeEnvironment({ literal: spec.fixtureEnvironment });

  const declared = declaredProcessSpec({
    executable: spec.executable,
    args: spec.args,
    cwd: fixtureRoot,
    timeoutMs: 180_000,
    maxOutputBytes: 256 * 1024,
    environment,
  });

  const inputs: OperationPathInput[] = [
    { role: "temp", path: fixtureRoot },
    { role: "temp", path: spec.syntheticHome },
    { role: "temp", path: spec.configRoot },
    { role: "temp", path: fixtureStateRoot },
  ];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: [fixtureRoot],
    requiredRoles: ["temp"],
  });

  const digest = reviewedDigest("gsd-fixture", {
    harness: options.harness,
    fixtureRoot,
    syntheticHome: spec.syntheticHome,
    configRoot: spec.configRoot,
    fixtureStateRoot,
    package: { name: options.gsd.package, version: options.gsd.version, integrity: options.gsd.integrity, profile: options.gsd.profile },
    spec: declared,
    environmentNames: declaredEnvironmentNames(environment),
    sentinels,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "gsd-fixture",
    harness: options.harness,
    fixtureRoot,
    syntheticHome: spec.syntheticHome,
    configRoot: spec.configRoot,
    fixtureStateRoot,
    package: { name: options.gsd.package, version: options.gsd.version, integrity: options.gsd.integrity, profile: options.gsd.profile },
    spec: declared,
    environmentNames: declaredEnvironmentNames(environment),
    sentinels,
    proofs,
    digest,
  };
}

export async function runGsdFixture(options: {
  harness: GsdFixtureHarness;
  gsd: LockedPackage & { profile: string };
  keep?: boolean;
  /** A fixture plan reviewed by the operation that authorized this run. */
  plan?: GsdFixtureOperationPlan;
  /**
   * The operation's writer. A fixture writes only inside its own throwaway
   * root, so it never consumes this session — but it refuses to touch the disk
   * before the session that authorized it exists.
   */
  session?: MutationSession;
}): Promise<GsdFixtureResult> {
  const reviewed = options.plan ?? await createGsdFixtureOperationPlan(options);
  assertPlanUnchanged(reviewed, await createGsdFixtureOperationPlan({
    harness: reviewed.harness,
    gsd: options.gsd,
    fixtureRoot: reviewed.fixtureRoot,
  }));

  const sentinels = [...reviewed.sentinels];
  const before = await Promise.all(sentinels.map(hashTree));
  const fixtureRoot = reviewed.fixtureRoot;
  const spec = createGsdFixtureSpec({ harness: reviewed.harness, fixtureRoot, gsd: options.gsd });
  await beginFixture(reviewed, options.session);
  await mkdir(spec.syntheticHome, { recursive: true });
  let retain = true;
  try {
    await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "temp", spec.configRoot));
    const command = await runProcess({
      ...reviewed.spec,
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
        // A throwaway state root of its own: one session owns one state root,
        // and this is not the user's.
        configRoot: spec.configRoot,
        stateRoot: reviewed.fixtureStateRoot,
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
      harness: reviewed.harness,
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
