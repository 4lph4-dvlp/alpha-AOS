import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { HarnessId, Inventory, StackCatalog, StackLock } from "../types.js";
import {
  applyEccSkillSync,
  globalEccSkillRoot,
  planEccSkillOperation,
  planEccSkillSync,
  type EccSkillOperationPlan,
} from "./ecc-skills.js";
import { createEccFixtureOperationPlan, runEccFixture, type EccFixtureOperationPlan } from "./ecc-fixture.js";
import {
  applyCodexGsdHookCompatibility,
  codexConfigRoot,
  planCodexGsdHookCompatibilityOperation,
  type GsdCompatibilityOperationPlan,
} from "./gsd-compat.js";
import {
  createGsdFixtureOperationPlan,
  runGsdFixture,
  type GsdFixtureHarness,
  type GsdFixtureOperationPlan,
} from "./gsd-fixture.js";
import { applyMcpSync, mcpServerIds, planMcpOperation, planMcpSync, type McpOperationPlan } from "./mcp.js";
import { createMcpFixtureOperationPlan, runMcpFixture, type McpFixtureOperationPlan } from "./mcp-fixture.js";
import {
  applyOwnedSkillSync,
  planOwnedSkillOperation,
  planOwnedSkillSync,
  type OwnedSkillOperationPlan,
} from "./owned-skills.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  declaredEnvironmentNames,
  declaredProcessSpec,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";
import {
  PLATFORM_FLOOR_ENVIRONMENT,
  resolveCommand,
  resolveNodePackageCli,
  runProcess,
  type EnvironmentPolicy,
  type ProcessResult,
  type ProcessSpec,
} from "./process.js";
import {
  applyClaudeSkillPolicy,
  globalClaudeSettingsPath,
  planClaudeSkillPolicy,
  planClaudeSkillPolicyOperation,
  type ClaudeSkillPolicyOperationPlan,
} from "./skill-policy.js";
import { rollbackFileTransaction } from "./transaction.js";

const allHarnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
const gsdHarnesses: GsdFixtureHarness[] = ["claude", "codex", "antigravity", "pi"];

export interface ManagedInstallStep {
  id: string;
  component: string;
  target: string;
  action: "current" | "install" | "create" | "update";
  external: boolean;
  note: string;
}

export interface ManagedInstallPlan {
  schemaVersion: 1;
  targets: HarnessId[];
  selection: "detected" | "explicit";
  steps: ManagedInstallStep[];
  warnings: string[];
}

export interface ManagedInstallResult {
  plan: ManagedInstallPlan;
  applied: string[];
  current: string[];
  operationIds: string[];
  externalChanges: string[];
}

interface RollbackEntry {
  id: string;
  allowedRoot: string;
}

function environmentOrFallback(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name];
  return resolve(value && value.trim() ? value : fallback);
}

export function globalGsdConfigRoot(harness: GsdFixtureHarness, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  switch (harness) {
    case "claude": return environmentOrFallback(env, "CLAUDE_CONFIG_DIR", join(home, ".claude"));
    case "codex": return environmentOrFallback(env, "CODEX_HOME", join(home, ".codex"));
    case "antigravity": return environmentOrFallback(env, "ANTIGRAVITY_CONFIG_DIR", join(home, ".gemini", "antigravity"));
    case "pi": return environmentOrFallback(env, "PI_CODING_AGENT_DIR", join(home, ".pi", "agent"));
  }
}

async function textIfPresent(path: string): Promise<string | null> {
  return existsSync(path) ? (await readFile(path, "utf8")).trim() : null;
}

export async function inspectGsdInstall(harness: GsdFixtureHarness, lock: StackLock, options: {
  env?: NodeJS.ProcessEnv;
  home?: string;
} = {}): Promise<{ current: boolean; root: string; version: string | null; profile: string | null; runtime: string | null }> {
  const gsd = lock.components.gsd;
  if (!gsd) throw new Error("Stable lock has no GSD component");
  const root = globalGsdConfigRoot(harness, options.env, options.home);
  const [version, profile, runtime] = await Promise.all([
    textIfPresent(join(root, "gsd-core", "VERSION")),
    textIfPresent(join(root, ".gsd-profile")),
    textIfPresent(join(root, "gsd-core", ".gsd-runtime")),
  ]);
  return { current: version === gsd.version && profile === gsd.profile && runtime === harness, root, version, profile, runtime };
}

function parseSemverMajor(value: string | null): number | null {
  const match = value?.match(/(?:^|\s)v?(\d+)(?:\.|$)/u);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

function requirePreflight(inventory: Inventory): void {
  const node = inventory.tools.node;
  const npm = inventory.tools.npm;
  const git = inventory.tools.git;
  const nodeMajor = parseSemverMajor(node?.version ?? null);
  const npmMajor = parseSemverMajor(npm?.version ?? null);
  if (nodeMajor === null || nodeMajor < 24) throw new Error(`Node.js >=24 is required; found ${node?.version ?? "missing"}`);
  if (npmMajor === null || npmMajor < 10) throw new Error(`npm >=10 is required; found ${npm?.version ?? "missing"}`);
  if (!git?.command) throw new Error("git is required but was not found");
}

export function selectInstallTargets(inventory: Inventory, requested?: HarnessId[]): { targets: HarnessId[]; selection: "detected" | "explicit" } {
  if (requested) {
    const unique = [...new Set(requested)];
    if (unique.length === 0) throw new Error("At least one install target is required");
    for (const target of unique) {
      if (!allHarnesses.includes(target)) throw new Error(`Unknown install target: ${target}`);
      const detected = inventory.harnesses.find((entry) => entry.id === target)?.detected;
      if (!detected) throw new Error(`Requested harness is not installed or configured: ${target}`);
    }
    return { targets: allHarnesses.filter((target) => unique.includes(target)), selection: "explicit" };
  }
  const targets = allHarnesses.filter((target) => inventory.harnesses.some((entry) => entry.id === target && entry.detected));
  if (targets.length === 0) throw new Error("No supported harness was detected. Install at least one harness first, or pass --target after configuring it.");
  return { targets, selection: "detected" };
}

/**
 * The environment names a Node or npm child legitimately needs to locate the
 * system, its cache and its temp space. Everything else an operation requires
 * is named by that operation, so no child inherits the ambient environment.
 *
 * `PLATFORM_FLOOR_ENVIRONMENT` is included because the OS delivers those names
 * regardless; listing them keeps the allowlist honest rather than implying a
 * control the platform does not give.
 */
export const NODE_RUNTIME_ENVIRONMENT_NAMES: readonly string[] = [
  ...PLATFORM_FLOOR_ENVIRONMENT,
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TMPDIR",
  "TEMP",
  "TMP",
  "npm_config_cache",
  "npm_config_prefix",
  "npm_config_registry",
  "npm_config_userconfig",
  "NODE_EXTRA_CA_CERTS",
];

/** An environment policy for a Node/npm child plus operation-specific names. */
export function nodeRuntimeEnvironment(options: {
  extraNames?: readonly string[];
  literal?: Readonly<Record<string, string>>;
  source?: NodeJS.ProcessEnv;
} = {}): EnvironmentPolicy {
  return {
    optional: [...NODE_RUNTIME_ENVIRONMENT_NAMES, ...(options.extraNames ?? [])],
    literal: options.literal ?? {},
    source: options.source ?? process.env,
  };
}

/**
 * Formats a failed child into a message safe to surface. Only the coded
 * outcome, exit metadata and stream fingerprints appear — never raw output.
 */
export function describeProcessFailure(label: string, result: ProcessResult): string {
  return (
    `${label} failed (${result.code}, exit ${String(result.exitCode)}` +
    `${result.signal === null ? "" : `, signal ${result.signal}`}` +
    `${result.timedOut ? ", timed out" : ""}${result.outputCapped ? ", output capped" : ""}). ` +
    `stdout sha256 ${result.stdout.sha256.slice(0, 12)}, stderr sha256 ${result.stderr.sha256.slice(0, 12)}. ` +
    `stderr: ${result.stderr.excerpt.slice(0, 400)}`
  );
}

/**
 * Asks npm itself where the global root is. This launches a child, and npm
 * writes a debug log into its cache directory for every invocation including
 * a read-only query, so the name says so out loud: nothing that runs before
 * an apply is authorized may call it. Plan builders use
 * `readGlobalPackageVersion`, which reads the filesystem and launches nothing.
 */
async function probeGlobalNpmPackageVersion(packageName: string): Promise<string | null> {
  const npm = resolveNodePackageCli("npm");
  const result = await runProcess({
    executable: npm.executable,
    args: [...npm.argsPrefix, "root", "--global"],
    cwd: process.cwd(),
    timeoutMs: 30_000,
    maxOutputBytes: 64 * 1024,
    environment: nodeRuntimeEnvironment(),
  });
  if (result.code !== "ok") throw new Error(describeProcessFailure("npm root --global", result));
  const manifest = join(result.stdout.excerpt.trim(), ...packageName.split("/"), "package.json");
  if (!existsSync(manifest)) return null;
  try {
    const value = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
    return typeof value.version === "string" ? value.version : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the global `node_modules` root without launching a child.
 *
 * `npm_config_prefix` wins when present; otherwise the prefix is derived
 * from the running interpreter, which is where npm puts a global install:
 * `<prefix>/node_modules` on Windows, `<prefix>/lib/node_modules` elsewhere.
 *
 * Honest limit: a user .npmrc that sets `prefix` is not read here, because
 * knowing its effective value means running npm. The answer is then reported
 * as unresolvable rather than guessed, the caller records an unverified state,
 * and apply re-probes authoritatively. Users on nvm, volta, or with an .npmrc
 * prefix will therefore always see an unverified runtime in a preview; how
 * common that is on real hosts is what plan 01-23 records across this host and
 * the three CI legs, and no .npmrc parser is built here on a guess.
 */
export function resolveGlobalNodeModulesRoot(
  source: NodeJS.ProcessEnv = process.env,
): { root: string | null; reason: string | null } {
  const configured = source.npm_config_prefix;
  const prefix = configured && configured.trim()
    ? resolve(configured.trim())
    : process.platform === "win32"
      ? dirname(process.execPath)
      : dirname(dirname(process.execPath));
  const root = process.platform === "win32" ? join(prefix, "node_modules") : join(prefix, "lib", "node_modules");
  if (!existsSync(root)) {
    return { root: null, reason: `no global node_modules directory at ${root}` };
  }
  return { root, reason: null };
}

/**
 * Reads a globally installed package version from the filesystem, launching
 * nothing. A manifest that cannot be read or parsed is unverified, never
 * absent: not existing and not being readable are different facts, and only
 * the first of them justifies claiming the package is missing.
 */
export async function readGlobalPackageVersion(
  packageName: string,
  source: NodeJS.ProcessEnv = process.env,
): Promise<{ state: "installed" | "absent" | "unverified"; version: string | null; reason: string | null }> {
  const resolved = resolveGlobalNodeModulesRoot(source);
  if (resolved.root === null) return { state: "unverified", version: null, reason: resolved.reason };
  const manifest = join(resolved.root, ...packageName.split("/"), "package.json");
  if (!existsSync(manifest)) return { state: "absent", version: null, reason: null };
  try {
    const value = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
    if (typeof value.version !== "string") {
      return { state: "unverified", version: null, reason: `${manifest} declares no string version` };
    }
    return { state: "installed", version: value.version, reason: null };
  } catch (error) {
    return { state: "unverified", version: null, reason: `${manifest} is present but unreadable: ${(error as Error).message}` };
  }
}

export interface ManagedInstallOptions {
  root: string;
  catalog: StackCatalog;
  lock: StackLock;
  inventory: Inventory;
  requestedTargets?: HarnessId[];
  /** Defaults to the user state root; named explicitly by the bootstrap service. */
  stateRoot?: string;
  /**
   * Reuses reviewed fixture locations, keyed by fixture id, so re-reading the
   * plan produces the same digest instead of naming fresh temp directories.
   */
  fixtureRoots?: Readonly<Record<string, string>>;
}

/**
 * Shared by `alpha-aos install` and by `bootstrap install` through
 * `createManagedInstallOperationPlan`. Both entry points are under the
 * byte-identical preview contract, so nothing reached from here may write,
 * and nothing reached from here may launch a child that writes.
 */
export async function createManagedInstallPlan(options: ManagedInstallOptions): Promise<ManagedInstallPlan> {
  requirePreflight(options.inventory);
  const selection = selectInstallTargets(options.inventory, options.requestedTargets);
  const steps: ManagedInstallStep[] = [];
  const gsd = options.lock.components.gsd;
  const ecc = options.lock.components.ecc;
  if (!gsd || !ecc) throw new Error("Stable lock is missing GSD or ECC");

  for (const target of selection.targets.filter((value): value is GsdFixtureHarness => gsdHarnesses.includes(value as GsdFixtureHarness))) {
    const state = await inspectGsdInstall(target, options.lock);
    steps.push({
      id: `gsd:${target}`, component: "gsd", target,
      action: state.current ? "current" : "install", external: true,
      note: state.current ? `${state.version}/${state.profile}/${state.runtime}` : `fixture then ${gsd.package}@${gsd.version} (${gsd.profile})`,
    });
  }

  if (selection.targets.includes("claude")) {
    for (const skill of options.catalog.components.ownedSkills) {
      if (!skill.targets.includes("claude")) continue;
      const plan = await planOwnedSkillSync(options.root, options.catalog, options.lock, skill.id, "claude", installStateOptions(options));
      const action = plan.action === "replace" ? "update" : plan.action;
      steps.push({ id: `owned-skill:${skill.id}:claude`, component: "owned-skill", target: "claude", action, external: false, note: plan.destination });
    }
  }

  // Read the filesystem rather than asking npm. A preview that spawns
  // `npm root --global` gets a debug log written into the npm cache, and on
  // POSIX that cache is always home-derived. D-01 governs the answer: an
  // unverified state plans the install rather than claiming the runtime is
  // current, and installEccRuntime re-probes authoritatively at apply and
  // no-ops when the locked version is already installed.
  const runtime = await readGlobalPackageVersion(ecc.package);
  const runtimeCurrent = runtime.state === "installed" && runtime.version === ecc.version;
  steps.push({
    id: "ecc:runtime", component: "ecc-runtime", target: "machine",
    action: runtimeCurrent ? "current" : "install", external: true,
    note: runtimeCurrent
      ? `${runtime.version}`
      : runtime.state === "unverified"
        ? `unverified -> ${ecc.version}; the global npm root is not resolvable without running npm; verified at apply`
        : `${runtime.version ?? "missing"} -> ${ecc.version}; lifecycle scripts disabled`,
  });

  for (const target of selection.targets) {
    const plan = await planEccSkillSync(target, options.lock);
    steps.push({
      id: `ecc:${target}`, component: "ecc-skills", target,
      action: plan.entries.every((entry) => entry.action === "current") ? "current" : plan.entries.some((entry) => entry.action === "update") ? "update" : "create",
      external: false, note: `${ecc.skills.join(", ")} -> ${plan.targetRoot}`,
    });
  }

  const piPlan = selection.targets.includes("pi") ? await planMcpSync("pi", options.lock) : null;
  if (piPlan?.piBridge && !piPlan.piBridgeCurrent) {
    steps.push({ id: "mcp-bridge:pi", component: "mcp-bridge", target: "pi", action: "install", external: true, note: `${piPlan.piBridge.package}@${piPlan.piBridge.version}` });
  }

  for (const target of selection.targets) {
    const plan = await planMcpSync(target, options.lock);
    steps.push({ id: `mcp:${target}`, component: "mcp", target, action: plan.action, external: false, note: plan.configPath });
  }

  if (selection.targets.includes("claude")) {
    const plan = await planClaudeSkillPolicy();
    steps.push({ id: "policy:claude-ecc", component: "skill-policy", target: "claude", action: plan.action, external: false, note: plan.settingsPath });
  }

  return {
    schemaVersion: 1,
    targets: selection.targets,
    selection: selection.selection,
    steps,
    warnings: [
      "The harness applications themselves are prerequisites and are never installed by alpha-AOS.",
      "External package installers are fixture-gated but are not automatically rolled back; alpha-AOS-owned file transactions are rolled back on failure.",
      "Restart harness processes after MCP or environment-variable changes.",
    ],
  };
}

/** Runs a child exactly as the reviewed plan declared it. */
async function runDeclared(spec: ProcessSpec, label: string): Promise<void> {
  const result = await runProcess({ ...spec, environment: nodeRuntimeEnvironment() });
  if (result.code !== "ok") throw new Error(describeProcessFailure(label, result));
}

async function installGsd(
  target: GsdFixtureHarness,
  catalog: StackCatalog,
  lock: StackLock,
  fixture: GsdFixtureOperationPlan,
  spec: ProcessSpec,
  session: MutationSession,
): Promise<boolean> {
  const before = await inspectGsdInstall(target, lock);
  if (before.current) return false;
  const gsd = lock.components.gsd;
  const adapter = catalog.harnesses[target];
  if (!gsd || !adapter.gsdTarget) throw new Error(`GSD target metadata is missing for ${target}`);
  await runGsdFixture({ harness: target, gsd, plan: fixture, session });
  await runDeclared(spec, `GSD install for ${target}`);
  const after = await inspectGsdInstall(target, lock);
  if (!after.current) throw new Error(`GSD verification failed for ${target}: ${after.version ?? "missing"}/${after.profile ?? "missing"}/${after.runtime ?? "missing"}`);
  return true;
}

async function installEccRuntime(
  lock: StackLock,
  fixture: EccFixtureOperationPlan,
  spec: ProcessSpec,
  session: MutationSession,
): Promise<boolean> {
  const ecc = lock.components.ecc;
  if (!ecc) throw new Error("Stable lock has no ECC component");
  if (await probeGlobalNpmPackageVersion(ecc.package) === ecc.version) return false;
  // Exact skill extraction verifies the tarball before the global CLI runtime is needed.
  await runEccFixture({ harness: "claude", ecc, plan: fixture, session });
  await runDeclared(spec, "ECC Memory Vault runtime install");
  const actual = await probeGlobalNpmPackageVersion(ecc.package);
  if (actual !== ecc.version) throw new Error(`ECC runtime verification failed: expected ${ecc.version}, got ${actual ?? "missing"}`);
  return true;
}

async function installPiBridge(
  lock: StackLock,
  fixture: McpFixtureOperationPlan,
  spec: ProcessSpec,
  session: MutationSession,
): Promise<boolean> {
  const plan = await planMcpSync("pi", lock);
  if (!plan.piBridge || plan.piBridgeCurrent) return false;
  await runMcpFixture({ server: "context7", harness: "pi", lock, plan: fixture, session });
  await runDeclared(spec, "Pi MCP bridge install");
  const after = await planMcpSync("pi", lock);
  if (!after.piBridgeCurrent) throw new Error(`Pi MCP bridge verification failed for ${plan.piBridge.package}@${plan.piBridge.version}`);
  return true;
}

// ---------------------------------------------------------------------------
// Complete managed-install operation plan
// ---------------------------------------------------------------------------

export interface ExternalInstallStep {
  id: string;
  /** Declared before it runs, so review sees the exact child and its arguments. */
  spec: ProcessSpec;
}

export interface ManagedInstallOperationPlan {
  kind: "managed-install";
  root: string;
  stateRoot: string;
  targets: readonly HarnessId[];
  /** Every fixture this operation may run, each with its own reviewed plan. */
  fixtures: {
    gsd: readonly GsdFixtureOperationPlan[];
    eccRuntime: EccFixtureOperationPlan | null;
    eccSkills: readonly EccFixtureOperationPlan[];
    mcpBridge: McpFixtureOperationPlan | null;
    mcpCanary: readonly McpFixtureOperationPlan[];
  };
  /** Every managed component apply, each with its own complete plan. */
  components: {
    gsdCompatibility: GsdCompatibilityOperationPlan | null;
    ownedSkills: readonly OwnedSkillOperationPlan[];
    eccSkills: readonly EccSkillOperationPlan[];
    mcp: readonly McpOperationPlan[];
    policy: ClaudeSkillPolicyOperationPlan | null;
  };
  external: readonly ExternalInstallStep[];
  /** Every fixture location this plan named, so revalidation reproduces it. */
  fixtureRoots: Readonly<Record<string, string>>;
  environmentNames: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
  /** The narrow shape the CLI already renders. */
  install: ManagedInstallPlan;
}

function installStateOptions(options: ManagedInstallOptions): { stateRoot: string } {
  return { stateRoot: resolve(options.stateRoot ?? userStateRoot()) };
}

function externalSpec(executable: string, args: string[], timeoutMs = 300_000): ProcessSpec {
  return declaredProcessSpec({
    executable,
    args,
    cwd: process.cwd(),
    timeoutMs,
    maxOutputBytes: 256 * 1024,
    environment: nodeRuntimeEnvironment(),
  });
}

/**
 * Aggregates every fixture, component and external step this install may
 * perform into one reviewable plan. Nothing here mutates: the fixture roots
 * are named but not created, and the external children are declared but not
 * run.
 */
export async function createManagedInstallOperationPlan(options: ManagedInstallOptions): Promise<ManagedInstallOperationPlan> {
  const install = await createManagedInstallPlan(options);
  const stateRoot = installStateOptions(options).stateRoot;
  const gsd = options.lock.components.gsd;
  const ecc = options.lock.components.ecc;
  if (!gsd || !ecc) throw new Error("Stable lock is missing GSD or ECC");

  const named = options.fixtureRoots ?? {};
  const reuse = (id: string): { fixtureRoot?: string } => {
    const root = named[id];
    return root === undefined ? {} : { fixtureRoot: root };
  };
  const gsdTargets = install.targets.filter((value): value is GsdFixtureHarness => gsdHarnesses.includes(value as GsdFixtureHarness));
  const external: ExternalInstallStep[] = [];
  const gsdFixtures: GsdFixtureOperationPlan[] = [];
  for (const target of gsdTargets) {
    const adapter = options.catalog.harnesses[target];
    if (!adapter.gsdTarget) throw new Error(`GSD target metadata is missing for ${target}`);
    gsdFixtures.push(await createGsdFixtureOperationPlan({ harness: target, gsd, ...reuse(`gsd:${target}`) }));
    const npx = resolveNodePackageCli("npx");
    external.push({
      id: `gsd:${target}`,
      spec: externalSpec(npx.executable, [
        ...npx.argsPrefix,
        "--yes",
        `${gsd.package}@${gsd.version}`,
        `--${adapter.gsdTarget}`,
        "--global",
        `--profile=${gsd.profile}`,
        "--no-legacy-cleanup",
      ]),
    });
  }

  const eccRuntimeFixture = await createEccFixtureOperationPlan({ harness: "claude", ecc, ...reuse("ecc:runtime") });
  const npm = resolveNodePackageCli("npm");
  external.push({
    id: "ecc:runtime",
    spec: externalSpec(npm.executable, [
      ...npm.argsPrefix, "install", "--global", "--ignore-scripts", "--no-audit", "--no-fund", `${ecc.package}@${ecc.version}`,
    ]),
  });

  const piStep = install.steps.find((step) => step.id === "mcp-bridge:pi");
  const piBridge = options.lock.components.mcpBridges?.pi ?? null;
  let mcpBridgeFixture: McpFixtureOperationPlan | null = null;
  if (piStep && piBridge) {
    mcpBridgeFixture = await createMcpFixtureOperationPlan({ server: "context7", harness: "pi", lock: options.lock, ...reuse("mcp-bridge:pi") });
    const pi = resolveCommand("pi");
    if (!pi) throw new Error("Pi CLI is required to install its MCP bridge");
    external.push({
      id: "mcp-bridge:pi",
      spec: externalSpec(pi, ["install", `npm:${piBridge.package}@${piBridge.version}`]),
    });
  }

  const gsdCompatibility = install.targets.includes("codex")
    ? await planCodexGsdHookCompatibilityOperation(options.lock, { ...installStateOptions(options), ...reuse("gsd-compat:codex") })
    : null;

  const ownedSkills: OwnedSkillOperationPlan[] = [];
  if (install.targets.includes("claude")) {
    for (const skill of options.catalog.components.ownedSkills) {
      if (!skill.targets.includes("claude")) continue;
      ownedSkills.push(await planOwnedSkillOperation(options.root, options.catalog, options.lock, skill.id, "claude", installStateOptions(options)));
    }
  }

  const eccSkills: EccSkillOperationPlan[] = [];
  for (const target of install.targets) {
    eccSkills.push(await planEccSkillOperation(target, options.lock, { ...installStateOptions(options), ...reuse(`ecc-skills:${target}`) }));
  }

  const changedMcpTargets = new Set(install.steps.filter((step) => step.component === "mcp" && step.action !== "current").map((step) => step.target as HarnessId));
  const mcpCanary: McpFixtureOperationPlan[] = [];
  if (changedMcpTargets.size > 0) {
    const canary = install.targets.includes(options.catalog.policy.canaryHarness) ? options.catalog.policy.canaryHarness : install.targets[0];
    if (!canary) throw new Error("No MCP canary harness is available");
    for (const server of mcpServerIds()) {
      mcpCanary.push(await createMcpFixtureOperationPlan({ server, harness: canary, lock: options.lock, ...reuse(`mcp-canary:${server}`) }));
    }
  }

  const mcp: McpOperationPlan[] = [];
  for (const target of install.targets) {
    mcp.push(await planMcpOperation(target, options.lock, installStateOptions(options)));
  }

  const policy = install.targets.includes("claude")
    ? await planClaudeSkillPolicyOperation(installStateOptions(options))
    : null;

  const ownRoot = resolve(packageRoot());
  const inputs: OperationPathInput[] = [
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
    { role: "package-root", path: ownRoot },
  ];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: [stateRoot, ownRoot],
    requiredRoles: ["state", "journal", "snapshot", "package-root"],
  });

  const fixtureRoots: Record<string, string> = {};
  for (const fixture of gsdFixtures) fixtureRoots[`gsd:${fixture.harness}`] = fixture.fixtureRoot;
  fixtureRoots["ecc:runtime"] = eccRuntimeFixture.fixtureRoot;
  for (const plan of eccSkills) {
    if (plan.fixture !== null) fixtureRoots[`ecc-skills:${plan.harness}`] = plan.fixture.fixtureRoot;
  }
  if (mcpBridgeFixture !== null) fixtureRoots["mcp-bridge:pi"] = mcpBridgeFixture.fixtureRoot;
  if (gsdCompatibility?.fixtureRoot) fixtureRoots["gsd-compat:codex"] = gsdCompatibility.fixtureRoot;
  for (const fixture of mcpCanary) fixtureRoots[`mcp-canary:${fixture.server}`] = fixture.fixtureRoot;

  const environmentNames = declaredEnvironmentNames(nodeRuntimeEnvironment());
  const digest = reviewedDigest("managed-install", {
    root: resolve(options.root),
    stateRoot,
    targets: install.targets,
    selection: install.selection,
    steps: install.steps,
    fixtures: {
      gsd: gsdFixtures.map((fixture) => fixture.digest),
      eccRuntime: eccRuntimeFixture.digest,
      eccSkills: eccSkills.map((plan) => plan.fixture?.digest ?? null),
      mcpBridge: mcpBridgeFixture?.digest ?? null,
      mcpCanary: mcpCanary.map((fixture) => fixture.digest),
    },
    components: {
      gsdCompatibility: gsdCompatibility?.digest ?? null,
      ownedSkills: ownedSkills.map((plan) => plan.digest),
      eccSkills: eccSkills.map((plan) => plan.digest),
      mcp: mcp.map((plan) => plan.digest),
      policy: policy?.digest ?? null,
    },
    external,
    environmentNames,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "managed-install",
    root: resolve(options.root),
    stateRoot,
    targets: install.targets,
    fixtures: {
      gsd: gsdFixtures,
      eccRuntime: eccRuntimeFixture,
      eccSkills: eccSkills.map((plan) => plan.fixture).filter((plan): plan is EccFixtureOperationPlan => plan !== null),
      mcpBridge: mcpBridgeFixture,
      mcpCanary,
    },
    components: { gsdCompatibility, ownedSkills, eccSkills, mcp, policy },
    external,
    fixtureRoots,
    environmentNames,
    proofs,
    digest,
    install,
  };
}

export interface ManagedInstallApplyOptions extends ManagedInstallOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: ManagedInstallOperationPlan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

export async function applyManagedInstall(options: ManagedInstallApplyOptions): Promise<ManagedInstallResult> {
  const reviewed = options.plan ?? await createManagedInstallOperationPlan(options);
  const plan = reviewed.install;
  const applied: string[] = [];
  const current: string[] = [];
  const operationIds: string[] = [];
  const externalChanges: string[] = [];
  const rollback: RollbackEntry[] = [];
  const stateRoot = reviewed.stateRoot;

  const step = (id: string): ProcessSpec => {
    const found = reviewed.external.find((entry) => entry.id === id);
    if (!found) throw new Error(`Managed install did not plan the external step: ${id}`);
    return found.spec;
  };

  const remember = (id: string, operationId: string | null, allowedRoot: string): void => {
    if (!operationId) {
      current.push(id);
      return;
    }
    applied.push(id);
    operationIds.push(operationId);
    rollback.push({ id: operationId, allowedRoot });
  };

  // The whole aggregate is re-read before anything is acquired or run.
  assertPlanUnchanged(reviewed, await createManagedInstallOperationPlan({
    root: reviewed.root,
    catalog: options.catalog,
    lock: options.lock,
    inventory: options.inventory,
    stateRoot: reviewed.stateRoot,
    fixtureRoots: reviewed.fixtureRoots,
    ...(options.requestedTargets === undefined ? {} : { requestedTargets: options.requestedTargets }),
  }));

  return withComponentSession({ kind: "managed-install", stateRoot, proofs: reviewed.proofs, digest: reviewed.digest }, options.session, async (session) => {
  try {
    // External installers run first. If a later managed write fails, their exact
    // verified versions remain installed and are reported instead of guessed-at rollback.
    for (const [index, target] of plan.targets.filter((value): value is GsdFixtureHarness => gsdHarnesses.includes(value as GsdFixtureHarness)).entries()) {
      const fixture = reviewed.fixtures.gsd[index];
      if (!fixture || fixture.harness !== target) throw new Error(`Managed install did not plan the GSD fixture for ${target}`);
      if (await installGsd(target, options.catalog, options.lock, fixture, step(`gsd:${target}`), session)) {
        applied.push(`gsd:${target}`);
        externalChanges.push(`gsd:${target}`);
      } else current.push(`gsd:${target}`);
    }
    const eccRuntimeFixture = reviewed.fixtures.eccRuntime;
    if (!eccRuntimeFixture) throw new Error("Managed install did not plan the ECC runtime fixture");
    if (await installEccRuntime(options.lock, eccRuntimeFixture, step("ecc:runtime"), session)) {
      applied.push("ecc:runtime");
      externalChanges.push("ecc:runtime");
    } else current.push("ecc:runtime");
    if (plan.targets.includes("pi")) {
      const bridgeFixture = reviewed.fixtures.mcpBridge;
      if (bridgeFixture === null) current.push("mcp-bridge:pi");
      else if (await installPiBridge(options.lock, bridgeFixture, step("mcp-bridge:pi"), session)) {
        applied.push("mcp-bridge:pi");
        externalChanges.push("mcp-bridge:pi");
      } else current.push("mcp-bridge:pi");
    }

    if (reviewed.components.gsdCompatibility) {
      const result = await applyCodexGsdHookCompatibility(options.lock, { plan: reviewed.components.gsdCompatibility, session });
      remember("gsd:codex:hook-compat", result.operationId, join(codexConfigRoot(), "hooks", "lib"));
    }
    for (const component of reviewed.components.ownedSkills) {
      const result = await applyOwnedSkillSync(options.root, options.catalog, options.lock, component.id, "claude", { plan: component, session });
      remember(`owned-skill:${component.id}:claude`, result.operationId, dirname(result.plan.destination));
    }
    for (const component of reviewed.components.eccSkills) {
      const result = await applyEccSkillSync(component.harness, options.lock, { plan: component, session });
      remember(`ecc:${component.harness}`, result.operationId, globalEccSkillRoot(component.harness));
    }

    for (const fixture of reviewed.fixtures.mcpCanary) {
      await runMcpFixture({ server: fixture.server, harness: fixture.harness, lock: options.lock, plan: fixture, session });
    }
    for (const component of reviewed.components.mcp) {
      const result = await applyMcpSync(component.harness, options.lock, { plan: component, session });
      remember(`mcp:${component.harness}`, result.operationId, dirname(result.plan.configPath));
    }
    if (reviewed.components.policy) {
      const result = await applyClaudeSkillPolicy({ plan: reviewed.components.policy, session });
      remember("policy:claude-ecc", result.operationId, dirname(globalClaudeSettingsPath()));
    }

    return { plan: await createManagedInstallPlan(options), applied, current, operationIds, externalChanges };
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const entry of [...rollback].reverse()) {
      try {
        await rollbackFileTransaction(stateRoot, entry.id, [entry.allowedRoot]);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError instanceof Error ? rollbackError.message : String(rollbackError));
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    const external = externalChanges.length > 0 ? ` External verified changes retained: ${externalChanges.join(", ")}.` : "";
    const rollbackNote = rollbackErrors.length > 0 ? ` Rollback errors: ${rollbackErrors.join("; ")}.` : "";
    throw new Error(`${message}.${external}${rollbackNote}`);
  }
  });
}
