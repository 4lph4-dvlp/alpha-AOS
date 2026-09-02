import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { HarnessId, Inventory, McpServerId, StackCatalog, StackLock } from "../types.js";
import { globalEccSkillRoot, applyEccSkillSync, planEccSkillSync } from "./ecc-skills.js";
import { runEccFixture } from "./ecc-fixture.js";
import { applyCodexGsdHookCompatibility, codexConfigRoot } from "./gsd-compat.js";
import { runGsdFixture, type GsdFixtureHarness } from "./gsd-fixture.js";
import { applyMcpSync, mcpServerIds, planMcpSync } from "./mcp.js";
import { runMcpFixture } from "./mcp-fixture.js";
import { applyOwnedSkillSync, planOwnedSkillSync } from "./owned-skills.js";
import { userStateRoot } from "./paths.js";
import { resolveCommand, resolveNodePackageCli, runCommandCapture } from "./process.js";
import { applyClaudeSkillPolicy, globalClaudeSettingsPath, planClaudeSkillPolicy } from "./skill-policy.js";
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

async function globalNpmPackageVersion(packageName: string): Promise<string | null> {
  const npm = resolveNodePackageCli("npm");
  const result = runCommandCapture(npm.executable, [...npm.argsPrefix, "root", "--global"], {
    cwd: process.cwd(), env: process.env, timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(`npm root --global failed (${result.status}): ${result.stderr || result.stdout}`);
  const manifest = join(result.stdout.trim(), ...packageName.split("/"), "package.json");
  if (!existsSync(manifest)) return null;
  try {
    const value = JSON.parse(await readFile(manifest, "utf8")) as Record<string, unknown>;
    return typeof value.version === "string" ? value.version : null;
  } catch {
    return null;
  }
}

export async function createManagedInstallPlan(options: {
  root: string;
  catalog: StackCatalog;
  lock: StackLock;
  inventory: Inventory;
  requestedTargets?: HarnessId[];
}): Promise<ManagedInstallPlan> {
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
      const plan = await planOwnedSkillSync(options.root, options.catalog, options.lock, skill.id, "claude");
      const action = plan.action === "replace" ? "update" : plan.action;
      steps.push({ id: `owned-skill:${skill.id}:claude`, component: "owned-skill", target: "claude", action, external: false, note: plan.destination });
    }
  }

  const runtimeVersion = await globalNpmPackageVersion(ecc.package);
  steps.push({
    id: "ecc:runtime", component: "ecc-runtime", target: "machine",
    action: runtimeVersion === ecc.version ? "current" : "install", external: true,
    note: runtimeVersion === ecc.version ? runtimeVersion : `${runtimeVersion ?? "missing"} -> ${ecc.version}; lifecycle scripts disabled`,
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

function runChecked(executable: string, args: string[], label: string, timeout = 300_000): void {
  const result = runCommandCapture(executable, args, { cwd: process.cwd(), env: process.env, timeout });
  if (result.status !== 0) throw new Error(`${label} failed (${result.status}): ${result.stderr || result.stdout}`);
}

async function installGsd(target: GsdFixtureHarness, catalog: StackCatalog, lock: StackLock): Promise<boolean> {
  const before = await inspectGsdInstall(target, lock);
  if (before.current) return false;
  const gsd = lock.components.gsd;
  const adapter = catalog.harnesses[target];
  if (!gsd || !adapter.gsdTarget) throw new Error(`GSD target metadata is missing for ${target}`);
  await runGsdFixture({ harness: target, gsd });
  const npx = resolveNodePackageCli("npx");
  runChecked(npx.executable, [
    ...npx.argsPrefix,
    "--yes",
    `${gsd.package}@${gsd.version}`,
    `--${adapter.gsdTarget}`,
    "--global",
    `--profile=${gsd.profile}`,
    "--no-legacy-cleanup",
  ], `GSD install for ${target}`);
  const after = await inspectGsdInstall(target, lock);
  if (!after.current) throw new Error(`GSD verification failed for ${target}: ${after.version ?? "missing"}/${after.profile ?? "missing"}/${after.runtime ?? "missing"}`);
  return true;
}

async function installEccRuntime(lock: StackLock): Promise<boolean> {
  const ecc = lock.components.ecc;
  if (!ecc) throw new Error("Stable lock has no ECC component");
  if (await globalNpmPackageVersion(ecc.package) === ecc.version) return false;
  // Exact skill extraction verifies the tarball before the global CLI runtime is needed.
  await runEccFixture({ harness: "claude", ecc });
  const npm = resolveNodePackageCli("npm");
  runChecked(npm.executable, [
    ...npm.argsPrefix, "install", "--global", "--ignore-scripts", "--no-audit", "--no-fund", `${ecc.package}@${ecc.version}`,
  ], "ECC Memory Vault runtime install");
  const actual = await globalNpmPackageVersion(ecc.package);
  if (actual !== ecc.version) throw new Error(`ECC runtime verification failed: expected ${ecc.version}, got ${actual ?? "missing"}`);
  return true;
}

async function installPiBridge(lock: StackLock): Promise<boolean> {
  const plan = await planMcpSync("pi", lock);
  if (!plan.piBridge || plan.piBridgeCurrent) return false;
  await runMcpFixture({ server: "context7", harness: "pi", lock });
  const pi = resolveCommand("pi");
  if (!pi) throw new Error("Pi CLI is required to install its MCP bridge");
  runChecked(pi, ["install", `npm:${plan.piBridge.package}@${plan.piBridge.version}`], "Pi MCP bridge install");
  const after = await planMcpSync("pi", lock);
  if (!after.piBridgeCurrent) throw new Error(`Pi MCP bridge verification failed for ${plan.piBridge.package}@${plan.piBridge.version}`);
  return true;
}

export async function applyManagedInstall(options: {
  root: string;
  catalog: StackCatalog;
  lock: StackLock;
  inventory: Inventory;
  requestedTargets?: HarnessId[];
}): Promise<ManagedInstallResult> {
  const plan = await createManagedInstallPlan(options);
  const applied: string[] = [];
  const current: string[] = [];
  const operationIds: string[] = [];
  const externalChanges: string[] = [];
  const rollback: RollbackEntry[] = [];
  const stateRoot = userStateRoot();

  const remember = (id: string, operationId: string | null, allowedRoot: string): void => {
    if (!operationId) {
      current.push(id);
      return;
    }
    applied.push(id);
    operationIds.push(operationId);
    rollback.push({ id: operationId, allowedRoot });
  };

  try {
    // External installers run first. If a later managed write fails, their exact
    // verified versions remain installed and are reported instead of guessed-at rollback.
    for (const target of plan.targets.filter((value): value is GsdFixtureHarness => gsdHarnesses.includes(value as GsdFixtureHarness))) {
      if (await installGsd(target, options.catalog, options.lock)) {
        applied.push(`gsd:${target}`);
        externalChanges.push(`gsd:${target}`);
      } else current.push(`gsd:${target}`);
    }
    if (await installEccRuntime(options.lock)) {
      applied.push("ecc:runtime");
      externalChanges.push("ecc:runtime");
    } else current.push("ecc:runtime");
    if (plan.targets.includes("pi")) {
      if (await installPiBridge(options.lock)) {
        applied.push("mcp-bridge:pi");
        externalChanges.push("mcp-bridge:pi");
      } else current.push("mcp-bridge:pi");
    }

    if (plan.targets.includes("codex")) {
      const result = await applyCodexGsdHookCompatibility(options.lock);
      remember("gsd:codex:hook-compat", result.operationId, join(codexConfigRoot(), "hooks", "lib"));
    }
    if (plan.targets.includes("claude")) {
      for (const skill of options.catalog.components.ownedSkills) {
        if (!skill.targets.includes("claude")) continue;
        const result = await applyOwnedSkillSync(options.root, options.catalog, options.lock, skill.id, "claude");
        remember(`owned-skill:${skill.id}:claude`, result.operationId, dirname(result.plan.destination));
      }
    }
    for (const target of plan.targets) {
      const result = await applyEccSkillSync(target, options.lock);
      remember(`ecc:${target}`, result.operationId, globalEccSkillRoot(target));
    }

    const changedMcpTargets = new Set(plan.steps.filter((step) => step.component === "mcp" && step.action !== "current").map((step) => step.target as HarnessId));
    if (changedMcpTargets.size > 0) {
      const canary = plan.targets.includes(options.catalog.policy.canaryHarness) ? options.catalog.policy.canaryHarness : plan.targets[0];
      if (!canary) throw new Error("No MCP canary harness is available");
      for (const server of mcpServerIds()) await runMcpFixture({ server: server as McpServerId, harness: canary, lock: options.lock });
    }
    for (const target of plan.targets) {
      const result = await applyMcpSync(target, options.lock);
      remember(`mcp:${target}`, result.operationId, dirname(result.plan.configPath));
    }
    if (plan.targets.includes("claude")) {
      const result = await applyClaudeSkillPolicy();
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
}
