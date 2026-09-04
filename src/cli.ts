#!/usr/bin/env node
import { loadCatalog, loadLock } from "./core/catalog.js";
import { runDoctor } from "./core/doctor.js";
import { collectInventory } from "./core/inventory.js";
import { packageRoot } from "./core/paths.js";
import { createInstallPlan } from "./core/plan.js";
import { applyOwnedSkillSync, planOwnedSkillSync } from "./core/owned-skills.js";
import { detectProject } from "./core/project.js";
import {
  applyIsolationManifest,
  cleanIsolationRuntime,
  createIsolationPlan,
  doctorIsolation,
  renderIsolationManifest,
  selectIsolationLaunch,
  syncIsolationRuntime,
} from "./core/isolation.js";
import { materializeEnvironment, runCommandInteractive } from "./core/process.js";
import { createGsdFixtureSpec, runGsdFixture, type GsdFixtureHarness } from "./core/gsd-fixture.js";
import { applyCodexGsdHookCompatibility, planCodexGsdHookCompatibility, smokeTestCodexGsdStopHook } from "./core/gsd-compat.js";
import { runEccFixture } from "./core/ecc-fixture.js";
import { applyEccSkillSync, planEccSkillSync } from "./core/ecc-skills.js";
import { runMcpFixture } from "./core/mcp-fixture.js";
import { applyMcpSync, mcpServerIds, planMcpSync } from "./core/mcp.js";
import { applyClaudeSkillPolicy, planClaudeSkillPolicy } from "./core/skill-policy.js";
import { runMcpFilterProxy } from "./core/mcp-proxy.js";
import { hasVersionChanges, resolveCandidate, writeCandidate } from "./core/update.js";
import { applyManagedInstall, createManagedInstallPlan, nodeRuntimeEnvironment } from "./core/install.js";
import { listManagedTransactions, planManagedRollback, rollbackManagedTransaction } from "./core/transaction.js";
import { userStateRoot } from "./core/paths.js";
import { join } from "node:path";
import { formatDoctor, formatInventory, formatIsolationLaunch, formatIsolationPlan, formatPlan, formatProject, formatUpdate } from "./format.js";
import { createRedactionContext, redactString, serializeObservable } from "./core/redaction.js";
import { createPathAliases } from "./core/paths.js";
import { applyWriterRepair, inspectWriterState, planWriterRepair } from "./core/writer-lock.js";
import { applySupportBundle, collectSupportSources, planSupportBundleOperation } from "./core/support-bundle.js";
import { applyBootstrapOperation, createBootstrapOperationPlan, type BootstrapKind } from "./core/bootstrap.js";
import type { HarnessId, IsolationMode, McpServerId, RedactionContext } from "./types.js";

const HELP = `alpha-aos

Usage:
  alpha-aos inventory [--json]
  alpha-aos plan [--json]
  alpha-aos install [--target <claude,codex,antigravity,pi,hermes>] [--apply] [--json]
  alpha-aos owned-skills sync <id> --target <harness> [--apply] [--json]
  alpha-aos ecc-skills sync --target <harness> [--apply] [--json]
  alpha-aos skill-policy sync --target claude [--apply] [--json]
  alpha-aos mcp sync --target <harness> [--server context7|exa|firecrawl] [--apply] [--json]
  alpha-aos update --check [--json]
  alpha-aos update --stage [--apply]
  alpha-aos update --apply [--target <harness[,harness]>] [--json]
  alpha-aos project detect|plan|sync [path] [--json]
  alpha-aos project isolate init [path] --mode project-only|sealed --harness <id[,id]> [--trust] [--apply]
  alpha-aos project isolate plan|doctor|sync|clean [path] [--apply] [--json]
  alpha-aos project run <harness> [path] [--apply] [-- <harness-args>]
  alpha-aos status [--json]
  alpha-aos doctor [--json]
  alpha-aos fixture gsd <claude|codex|antigravity|pi> [--apply] [--keep] [--json]
  alpha-aos fixture ecc <claude|codex|antigravity|pi|hermes> [--apply] [--keep] [--json]
  alpha-aos fixture mcp <context7|exa|firecrawl> <claude|codex|antigravity|pi|hermes> [--apply] [--keep] [--json]
  alpha-aos gsd compat codex [--apply] [--json]
  alpha-aos rollback [operation-id] [--apply] [--json]
  alpha-aos repair [--apply] [--json]
  alpha-aos support-bundle [--out <path>] [--apply] [--json]
  alpha-aos bootstrap install|update [--skip-link] [--apply] [--json]

Mutation commands are dry-run by default. Live apply and rollback are enabled only
after the fixture transaction gate passes.

Every observable surface passes through one redaction seam. A value this tool
withheld is printed as [redacted:<kind>]; a private root is printed as an alias
such as ~ or <state>. A support bundle is written locally and is never uploaded.
`;

/**
 * Environment names whose value is a credential. Their values are registered
 * with the redactor so that if any surface ever echoes one back, it is
 * replaced by a typed placeholder rather than printed.
 */
const CREDENTIAL_NAME_PATTERN = /(?:secret|token|password|passwd|api[-_]?key|credential|auth|jwt|session)/iu;

function credentialValues(env: NodeJS.ProcessEnv = process.env): string[] {
  const values: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string" || value.trim().length < 8) continue;
    if (CREDENTIAL_NAME_PATTERN.test(name)) values.push(value);
  }
  return values;
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function positional(args: string[]): string[] {
  return args.filter((arg) => !arg.startsWith("--"));
}

function optionValue(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? null) : null;
}

function targetPath(args: string[], start: number, valueFlags: string[]): string {
  for (let index = start; index < args.length; index += 1) {
    const value = args[index];
    if (!value || value === "--") break;
    if (valueFlags.includes(value)) {
      index += 1;
      continue;
    }
    if (!value.startsWith("--")) return value;
  }
  return process.cwd();
}

function harnessList(value: string | null): HarnessId[] {
  if (!value) throw new Error("--harness is required");
  const valid: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  const result = [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))];
  if (result.length === 0 || result.some((entry) => !valid.includes(entry as HarnessId))) throw new Error(`Invalid --harness value: ${value}`);
  return result as HarnessId[];
}

function optionalHarnessList(value: string | null): HarnessId[] | undefined {
  if (value === null) return undefined;
  return harnessList(value);
}

/**
 * The one seam every observable byte leaves through. JSON output is the
 * redacted envelope; human output is the formatted text with the same
 * replacements applied, so a value suppressed in one is suppressed in both.
 */
function print(value: unknown, json: boolean, formatted: string, context: RedactionContext = observableContext()): void {
  if (json) {
    process.stdout.write(`${serializeObservable(value, context).text}\n`);
    return;
  }
  process.stdout.write(`${redactString(formatted, context)}\n`);
}

let sharedContext: RedactionContext | null = null;

function observableContext(): RedactionContext {
  sharedContext ??= createRedactionContext({
    secrets: credentialValues(),
    aliases: createPathAliases({ projectRoot: process.cwd() }),
  });
  return sharedContext;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const json = hasFlag(args, "--json");
  if (["help", "--help", "-h"].includes(command)) {
    process.stdout.write(HELP);
    return;
  }

  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  if (command === "mcp-proxy") {
    const server = args[1] as McpServerId | undefined;
    if (server !== "firecrawl") throw new Error("Usage: alpha-aos mcp-proxy firecrawl");
    const locked = lock.components.mcp?.[server];
    if (!locked) throw new Error(`Stable lock has no MCP component: ${server}`);
    await runMcpFilterProxy(server, locked);
    return;
  }

  if (command === "gsd") {
    const action = args[1] ?? "";
    const target = args[2] ?? "";
    if (action !== "compat" || target !== "codex") {
      throw new Error("Usage: alpha-aos gsd compat codex [--apply] [--json]");
    }
    if (!hasFlag(args, "--apply")) {
      const plan = await planCodexGsdHookCompatibility();
      const smoke = await smokeTestCodexGsdStopHook();
      print({ plan, smoke }, json, [
        `Codex GSD hook compatibility: ${plan.required ? "required" : "not required"}`,
        ...plan.entries.map((entry) => `${entry.action.toUpperCase()} ${entry.destination}`),
        `Stop hook smoke test: ${smoke.ok ? "pass" : "fail"}`,
        "Dry-run only. Pass --apply to copy byte-identical helpers from the integrity-verified GSD package.",
      ].join("\n"));
    } else {
      const result = await applyCodexGsdHookCompatibility(lock);
      print(result, json, result.operationId
        ? `Codex GSD hook compatibility synchronized. Transaction: ${result.operationId}`
        : "Codex GSD hook compatibility is already current.");
    }
    return;
  }

  if (command === "inventory") {
    const inventory = collectInventory(catalog);
    print(inventory, json, formatInventory(inventory));
    return;
  }

  if (command === "plan") {
    const plan = createInstallPlan(catalog, lock);
    print(plan, json, formatPlan(plan));
    return;
  }

  if (command === "install") {
    const inventory = collectInventory(catalog);
    const requestedTargets = optionalHarnessList(optionValue(args, "--target"));
    const installOptions = { root, catalog, lock, inventory, ...(requestedTargets ? { requestedTargets } : {}) };
    if (!hasFlag(args, "--apply")) {
      const plan = await createManagedInstallPlan(installOptions);
      print(plan, json, [
        `alpha-AOS managed install (${plan.selection})`,
        `Targets: ${plan.targets.join(", ")}`,
        ...plan.steps.map((step) => `${step.action.toUpperCase().padEnd(7)} ${step.id} - ${step.note}`),
        ...plan.warnings.map((warning) => `WARNING ${warning}`),
        "Dry-run only. Pass --apply to fixture, apply, and verify the selected stack.",
      ].join("\n"));
    } else {
      const result = await applyManagedInstall(installOptions);
      print(result, json, [
        `alpha-AOS install complete: ${result.plan.targets.join(", ")}`,
        `Applied: ${result.applied.length > 0 ? result.applied.join(", ") : "none"}`,
        `Already current: ${result.current.length > 0 ? result.current.join(", ") : "none"}`,
        `Journaled operations: ${result.operationIds.length}`,
        `External verified changes retained outside journal rollback: ${result.externalChanges.length > 0 ? result.externalChanges.join(", ") : "none"}`,
      ].join("\n"));
    }
    return;
  }

  if (command === "status") {
    const inventory = collectInventory(catalog);
    const state = { channel: lock.channel, generatedAt: lock.generatedAt, inventory };
    print(state, json, `${formatInventory(inventory)}\n\nActive catalog channel: ${lock.channel}`);
    return;
  }

  if (command === "fixture") {
    const component = args[1] ?? "";
    const target = args[2] ?? "";
    const allTargets: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
    if (component === "mcp") {
      const server = target;
      const harness = args[3] ?? "";
      if (!mcpServerIds().includes(server as McpServerId) || !allTargets.includes(harness as HarnessId)) {
        throw new Error("Usage: alpha-aos fixture mcp <context7|exa|firecrawl> <claude|codex|antigravity|pi|hermes> [--apply] [--keep] [--json]");
      }
      const locked = lock.components.mcp?.[server];
      if (!locked) throw new Error(`Stable lock has no MCP component: ${server}`);
      if (!hasFlag(args, "--apply")) {
        const preview = {
          server,
          harness,
          package: `${locked.package}@${locked.version}`,
          integrity: locked.integrity,
          checks: ["npm tarball integrity", "credential-free config rendering", "MCP initialize", "tools/list", ...(harness === "pi" ? ["Pi bridge install in synthetic PI_CODING_AGENT_DIR"] : [])],
        };
        print(preview, json, [
          `MCP fixture: ${server} -> ${harness}`,
          `Package: ${locked.package}@${locked.version}`,
          "No real credential is read or stored; only initialize and tools/list are called.",
          "Dry-run only. Pass --apply to execute in an OS temporary directory.",
        ].join("\n"));
      } else {
        const result = await runMcpFixture({ server: server as McpServerId, harness: harness as HarnessId, lock, keep: hasFlag(args, "--keep") });
        print(result, json, [
          `MCP fixture passed: ${result.server} -> ${result.harness}`,
          `Version/integrity: ${result.version} / ${result.integrity}`,
          `Tools (${result.toolNames.length}): ${result.toolNames.join(", ")}`,
          `Credential stored: ${result.credentialStored ? "yes" : "no"}`,
          `Pi bridge: ${result.piBridgeVersion ?? "not required"}`,
          `Retained fixture: ${result.retainedFixture ?? "no"}`,
        ].join("\n"));
      }
      return;
    }
    if (component === "ecc") {
      if (!allTargets.includes(target as HarnessId)) throw new Error("Usage: alpha-aos fixture ecc <claude|codex|antigravity|pi|hermes> [--apply] [--keep] [--json]");
      const ecc = lock.components.ecc;
      if (!ecc) throw new Error("Stable lock has no ECC component");
      if (!hasFlag(args, "--apply")) {
        const preview = {
          harness: target,
          package: `${ecc.package}@${ecc.version}`,
          integrity: ecc.integrity,
          selectedSources: ecc.skills.map((skill) => `skills/${skill}/SKILL.md`),
          directUpstreamInstallBlocked: true,
        };
        print(preview, json, [
          `ECC exact-file fixture target: ${target}`,
          `Package: ${ecc.package}@${ecc.version}`,
          `Selected sources: ${ecc.skills.join(", ")}`,
          "The tarball integrity is verified before exactly three source files are rendered.",
          "Dry-run only. Pass --apply to execute in an OS temporary directory.",
        ].join("\n"));
      } else {
        const result = await runEccFixture({ harness: target as HarnessId, ecc, keep: hasFlag(args, "--keep") });
        print(result, json, [
          `ECC exact-file fixture passed: ${result.harness}`,
          `Version: ${result.version}`,
          `Integrity: ${result.integrity}`,
          `Operations: ${result.operationCount}`,
          `Source hashes: ${JSON.stringify(result.sourceHashes)}`,
          `Target hashes: ${JSON.stringify(result.targetHashes)}`,
          `Retained fixture: ${result.retainedFixture ?? "no"}`,
        ].join("\n"));
      }
      return;
    }
    const validTargets: GsdFixtureHarness[] = ["claude", "codex", "antigravity", "pi"];
    if (component !== "gsd" || !validTargets.includes(target as GsdFixtureHarness)) {
      throw new Error("Usage: alpha-aos fixture gsd <claude|codex|antigravity|pi> [--apply] [--keep] [--json]");
    }
    const gsd = lock.components.gsd;
    if (!gsd) throw new Error("Stable lock has no GSD component");
    if (!hasFlag(args, "--apply")) {
      const fixtureRoot = `${process.env.TEMP ?? process.env.TMPDIR ?? "<os-temp>"}/alpha-aos-gsd-${target}-<random>`;
      const spec = createGsdFixtureSpec({ harness: target as GsdFixtureHarness, fixtureRoot, gsd });
      const preview = {
        harness: target,
        executable: spec.executable,
        args: spec.args,
        fixtureRoot: spec.fixtureRoot,
        isolatedEnvironment: ["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "ANTIGRAVITY_CONFIG_DIR", "PI_CODING_AGENT_DIR", "HERMES_HOME"],
      };
      print(preview, json, [
        `GSD fixture target: ${target}`,
        `Fixture root: ${spec.fixtureRoot}`,
        `Command: ${spec.executable} ${spec.args.join(" ")}`,
        `Synthetic HOME and all known runtime config roots are scoped below the fixture.`,
        "Dry-run only. Pass --apply to install, audit global sentinels, and remove the fixture.",
      ].join("\n"));
    } else {
      const result = await runGsdFixture({ harness: target as GsdFixtureHarness, gsd, keep: hasFlag(args, "--keep") });
      print(result, json, [
        `GSD fixture passed: ${result.harness}`,
        `Version/profile/runtime: ${result.version} / ${result.profile} / ${result.runtime}`,
        `Files/skills: ${result.fileCount} / ${result.skillCount}`,
        `Global ~/.agents and ~/.gsd unchanged: ${result.globalSentinelsUnchanged ? "yes" : "no"}`,
        `Codex Stop hook smoke: ${result.codexStopHookSmokePassed === null ? "not applicable" : result.codexStopHookSmokePassed ? "pass" : "fail"}`,
        `Retained fixture: ${result.retainedFixture ?? "no"}`,
      ].join("\n"));
    }
    return;
  }

  if (command === "owned-skills") {
    const subcommand = args[1] ?? "";
    const id = args[2] ?? "";
    const target = optionValue(args, "--target");
    if (subcommand !== "sync" || !id || !target) {
      throw new Error("Usage: alpha-aos owned-skills sync <id> --target <harness> [--apply] [--json]");
    }
    if (!Object.hasOwn(catalog.harnesses, target)) throw new Error(`Unknown harness target: ${target}`);
    const harness = target as keyof typeof catalog.harnesses;
    if (hasFlag(args, "--apply")) {
      const result = await applyOwnedSkillSync(root, catalog, lock, id, harness);
      print(result, json, result.operationId
        ? `Installed ${id} for ${target}. Transaction: ${result.operationId}`
        : `${id} for ${target} is already current.`);
      return;
    }
    const plan = await planOwnedSkillSync(root, catalog, lock, id, harness);
    print(plan, json, [
      `Owned skill: ${plan.id}`,
      `Target: ${plan.target}`,
      `Action: ${plan.action}`,
      `Destination: ${plan.destination}`,
      `Required workflow: ${plan.workflowFound ? "found" : "missing"}`,
      "Dry-run only. Pass --apply to perform the journaled write.",
    ].join("\n"));
    return;
  }

  if (command === "ecc-skills") {
    const subcommand = args[1] ?? "";
    const target = optionValue(args, "--target");
    const validTargets: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
    if (subcommand !== "sync" || !target || !validTargets.includes(target as HarnessId)) {
      throw new Error("Usage: alpha-aos ecc-skills sync --target <claude|codex|antigravity|pi|hermes> [--apply] [--json]");
    }
    if (!hasFlag(args, "--apply")) {
      const plan = await planEccSkillSync(target as HarnessId, lock);
      const formatted = [
        `ECC exact-file target: ${target}`,
        `Root: ${plan.targetRoot}`,
        ...plan.entries.map((entry) => `${entry.action.toUpperCase()} ${entry.skill} -> ${entry.destination} (${entry.expectedHash})`),
        "Dry-run only. Pass --apply to verify the tarball and journal the writes.",
      ].join("\n");
      print(plan, json, formatted);
    } else {
      const result = await applyEccSkillSync(target as HarnessId, lock);
      print(result, json, result.operationId
        ? `ECC exact-file skills synchronized for ${target}. Transaction: ${result.operationId}`
        : `ECC exact-file skills for ${target} are already current.`);
    }
    return;
  }

  if (command === "skill-policy") {
    const subcommand = args[1] ?? "";
    const target = optionValue(args, "--target");
    if (subcommand !== "sync" || target !== "claude") {
      throw new Error("Usage: alpha-aos skill-policy sync --target claude [--apply] [--json]");
    }
    if (!hasFlag(args, "--apply")) {
      const plan = await planClaudeSkillPolicy();
      print(plan, json, [
        "Claude ECC skill invocation policy",
        `Settings: ${plan.settingsPath}`,
        `Action: ${plan.action}`,
        ...plan.entries.map((entry) => `${entry.skill}: ${entry.current ?? "unset"} -> ${entry.desired}`),
        "Dry-run only. Pass --apply to journal the settings merge.",
      ].join("\n"));
    } else {
      const result = await applyClaudeSkillPolicy();
      print(result, json, result.operationId
        ? `Claude ECC skill invocation policy synchronized. Transaction: ${result.operationId}`
        : "Claude ECC skill invocation policy is already current.");
    }
    return;
  }

  if (command === "mcp") {
    const subcommand = args[1] ?? "";
    const target = optionValue(args, "--target");
    const server = optionValue(args, "--server");
    const validTargets: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
    if (subcommand !== "sync" || !target || !validTargets.includes(target as HarnessId)) {
      throw new Error("Usage: alpha-aos mcp sync --target <claude|codex|antigravity|pi|hermes> [--server context7|exa|firecrawl] [--apply] [--json]");
    }
    if (server && !mcpServerIds().includes(server as McpServerId)) throw new Error(`Unknown MCP server: ${server}`);
    const options = server ? { selected: [server as McpServerId] } : {};
    if (!hasFlag(args, "--apply")) {
      const plan = await planMcpSync(target as HarnessId, lock, options);
      const formatted = [
        `MCP target: ${target}`,
        `Config: ${plan.configPath}`,
        `Action: ${plan.action}`,
        ...plan.entries.map((entry) => `${entry.server}: ${entry.package}@${entry.version}; ${entry.credentialEnv}=${entry.credentialPresent ? "present" : "missing"}${entry.credentialRequiredForCalls ? " (required for calls)" : " (optional)"}`),
        ...(plan.piBridgeRequired ? [`Pi bridge: ${plan.piBridge?.package}@${plan.piBridge?.version} (${plan.piBridgeCurrent ? "current" : "missing"})`] : []),
        ...plan.notes,
        "Dry-run only. Pass --apply after the matching fixture passes.",
      ].join("\n");
      print(plan, json, formatted);
    } else {
      const result = await applyMcpSync(target as HarnessId, lock, options);
      print(result, json, result.operationId
        ? `MCP config synchronized for ${target}. Transaction: ${result.operationId}`
        : `MCP config for ${target} is already current.`);
    }
    return;
  }

  if (command === "doctor") {
    const inventory = collectInventory(catalog);
    const findings = await runDoctor(catalog, lock, inventory);
    print(findings, json, formatDoctor(findings));
    if (findings.some((finding) => finding.level === "error")) process.exitCode = 2;
    return;
  }

  if (command === "update") {
    const mode = args[1] ?? "--check";
    if (!["--check", "--stage", "--apply"].includes(mode)) throw new Error(`Unknown update mode: ${mode}`);
    if (mode === "--apply") {
      // The stable lock ships with alpha-AOS and is promoted only after CI
      // fixtures. Candidate dependency versions are never applied directly on
      // an end-user machine.
      const inventory = collectInventory(catalog);
      const requestedTargets = optionalHarnessList(optionValue(args, "--target"));
      const updateOptions = { root, catalog, lock, inventory, ...(requestedTargets ? { requestedTargets } : {}) };
      const result = await applyManagedInstall(updateOptions);
      print(result, json, [
        `alpha-AOS stable update reconciled: ${result.plan.targets.join(", ")}`,
        `Applied: ${result.applied.length > 0 ? result.applied.join(", ") : "none"}`,
        `Already current: ${result.current.length > 0 ? result.current.join(", ") : "none"}`,
        "Unverified candidate.lock.json was not applied.",
      ].join("\n"));
      return;
    }
    const candidate = await resolveCandidate(lock);
    if (mode === "--stage" && hasFlag(args.slice(2), "--apply")) {
      if (hasVersionChanges(lock, candidate)) {
        await writeCandidate(root, candidate);
        process.stdout.write(`Candidate lock staged at catalog/candidate.lock.json\n`);
      } else {
        process.stdout.write("No upstream version changes; candidate lock was not rewritten.\n");
      }
    }
    print(candidate, json, formatUpdate(lock, candidate));
    return;
  }

  if (command === "project") {
    const subcommand = args[1] ?? "detect";
    if (subcommand === "isolate") {
      const action = args[2] ?? "plan";
      if (!["init", "plan", "doctor", "sync", "clean"].includes(action)) throw new Error(`Unknown project isolate command: ${action}`);
      const target = targetPath(args, 3, ["--mode", "--harness"]);
      if (action === "init") {
        const modeValue = optionValue(args, "--mode") ?? "project-only";
        if (!["managed", "project-only", "sealed"].includes(modeValue)) throw new Error(`Invalid isolation mode: ${modeValue}`);
        const allowedHarnesses = harnessList(optionValue(args, "--harness"));
        if (hasFlag(args, "--apply")) {
          const operationId = await applyIsolationManifest({ projectRoot: target, mode: modeValue as IsolationMode, allowedHarnesses, trust: hasFlag(args, "--trust") });
          print({ operationId, manifest: `${target}/.alpha-aos/stack.yaml` }, json, `Isolation manifest written. Transaction: ${operationId}`);
        } else {
          const content = await renderIsolationManifest(target, modeValue as IsolationMode, allowedHarnesses, hasFlag(args, "--trust"));
          print({ target, content }, json, `Would write ${target}/.alpha-aos/stack.yaml:\n\n${content}\nDry-run only. Pass --apply to write it.`);
        }
        return;
      }
      if (action === "plan") {
        const plan = await createIsolationPlan(target);
        print(plan, json, formatIsolationPlan(plan));
        return;
      }
      if (action === "doctor") {
        const findings = await doctorIsolation(target);
        print(findings, json, formatDoctor(findings));
        if (findings.some((finding) => finding.level === "error")) process.exitCode = 2;
        return;
      }
      if (action === "sync") {
        const plan = await createIsolationPlan(target);
        if (!hasFlag(args, "--apply")) {
          print(plan, json, `${formatIsolationPlan(plan)}\n\nDry-run only. Pass --apply to create the isolated runtime.`);
        } else {
          const operationId = await syncIsolationRuntime(target);
          print({ operationId, runtimeRoot: plan.runtimeRoot }, json, operationId ? `Isolated runtime synchronized. Transaction: ${operationId}` : "Isolated runtime is already current.");
        }
        return;
      }
      if (!hasFlag(args, "--apply")) {
        const plan = await createIsolationPlan(target);
        print({ target: plan.runtimeRoot }, json, `Would remove generated runtime ${plan.runtimeRoot}. Dry-run only. Pass --apply to remove it.`);
      } else {
        const removed = await cleanIsolationRuntime(target);
        print({ removed }, json, `Isolation clean: ${removed}`);
      }
      return;
    }
    if (subcommand === "run") {
      const harness = args[2] as HarnessId | undefined;
      if (!harness || !(["claude", "codex", "antigravity", "pi", "hermes"] as string[]).includes(harness)) throw new Error("Usage: project run <claude|codex|antigravity|pi|hermes> [path] [--apply] [-- <args>]");
      const separator = args.indexOf("--");
      const target = targetPath(args, 3, []);
      const plan = await createIsolationPlan(target);
      const launch = selectIsolationLaunch(plan, harness);
      const passthrough = separator >= 0 ? args.slice(separator + 1) : [];
      launch.args.push(...passthrough);
      if (!hasFlag(args, "--apply")) {
        print(launch, json, `${formatIsolationLaunch(launch)}\n\nDry-run only. Pass --apply to launch.`);
      } else {
        // An isolated launch declares the names it needs rather than
        // inheriting the ambient environment. On Windows the OS still
        // delivers PLATFORM_FLOOR_ENVIRONMENT whatever this list says;
        // narrowing that floor is phase 5's isolation work.
        const status = runCommandInteractive(launch.executable as string, launch.args, {
          cwd: launch.projectRoot,
          env: materializeEnvironment(nodeRuntimeEnvironment({ literal: launch.env })),
        });
        process.exitCode = status;
      }
      return;
    }
    if (!["detect", "plan", "sync"].includes(subcommand)) throw new Error(`Unknown project command: ${subcommand}`);
    if (subcommand === "sync" && hasFlag(args, "--apply")) {
      throw new Error("Project apply is not enabled until trust and transaction support are implemented");
    }
    const parts = positional(args.slice(2));
    const target = parts[0] ?? process.cwd();
    const detection = await detectProject(target);
    print(detection, json, formatProject(detection));
    if (subcommand !== "detect") process.stdout.write("\nDry-run only. Project files and harness configuration were not changed.\n");
    return;
  }

  if (command === "repair") {
    const stateRoot = userStateRoot();
    const plan = await planWriterRepair(stateRoot);
    if (!hasFlag(args, "--apply")) {
      const state = await inspectWriterState(stateRoot);
      print({ plan, state }, json, [
        `Writer state: ${plan.status}`,
        `Operation: ${plan.operationId ?? "none"}`,
        ...plan.targets.map((target) => `${target.classification.toUpperCase()} ${target.target}`),
        `Permitted transition: ${plan.transition}`,
        ...plan.blockedReasons.map((reason) => `BLOCKED ${reason}`),
        `Plan digest: ${plan.planDigest}`,
        "Diagnosis only. Pass --apply to perform the one transition this evidence proves.",
      ].join("\n"));
    } else {
      const result = await applyWriterRepair(stateRoot, plan.planDigest);
      print(result, json, `Repaired ${result.operationId ?? "state"} by ${result.transition}.`);
    }
    return;
  }

  if (command === "support-bundle") {
    const context = observableContext();
    const destination = optionValue(args, "--out") ?? join(process.cwd(), "alpha-aos-support.json");
    const sources = await collectSupportSources(userStateRoot(), root);
    const plan = await planSupportBundleOperation({ sources, destination, context, stateRoot: userStateRoot() });
    if (!hasFlag(args, "--apply")) {
      print(plan.bundle, json, [
        `Support bundle destination: ${plan.bundle.destination}`,
        `Network: ${plan.bundle.network}`,
        ...plan.bundle.sources.map((source) => `${source.missing ? "MISSING" : source.opaque ? "OPAQUE " : "INCLUDE"} ${source.aliasPath} (${source.byteLength}B)`),
        `Plan digest: ${plan.digest}`,
        "Preview only. Pass --apply to write this local file. Nothing is uploaded.",
      ].join("\n"), context);
    } else {
      const result = await applySupportBundle({ plan, sources, destination, context, stateRoot: userStateRoot() });
      print(result, json, `Support bundle written locally: ${result.destination}. Transaction: ${result.operationId}.`, context);
    }
    return;
  }

  if (command === "bootstrap") {
    const operation = args[1] ?? "";
    if (operation !== "install" && operation !== "update") {
      throw new Error("Usage: alpha-aos bootstrap install|update [--skip-link] [--apply] [--json]");
    }
    const inventory = collectInventory(catalog);
    const requestedTargets = optionalHarnessList(optionValue(args, "--target"));
    const managed = { catalog, lock, inventory, ...(requestedTargets === undefined ? {} : { requestedTargets }) };
    const plan = await createBootstrapOperationPlan({
      operation: operation as BootstrapKind,
      root,
      skipLink: hasFlag(args, "--skip-link"),
      managed,
    });
    if (!hasFlag(args, "--apply")) {
      print(plan, json, [
        `Bootstrap ${plan.operation} for ${plan.root}`,
        `Build artifact: ${plan.artifact.verified ? "verified" : "not verified"}`,
        ...(plan.checkout ? [`Checkout: ${plan.checkout.head ?? "unknown"} -> ${plan.checkout.targetOid ?? "unresolved"}`] : []),
        ...plan.external.map((step) => `RUN ${step.id} (${step.effect})`),
        ...plan.blockedReasons.map((reason) => `BLOCKED ${reason}`),
        `Plan digest: ${plan.digest}`,
        plan.blockedReasons.length > 0
          ? "Refused. Nothing was changed."
          : "Preview only. Pass --apply to run these steps under one operation session.",
      ].join("\n"));
    } else {
      const result = await applyBootstrapOperation(plan, { managed });
      print(result.evidence, json, [
        `Bootstrap ${plan.operation} complete. Operation: ${result.operationId}.`,
        ...result.evidence.steps.map((step) => `${step.id}: ${step.status} (${step.effect} ${step.observation})`),
      ].join("\n"));
    }
    return;
  }

  if (command === "rollback") {
    const id = positional(args.slice(1))[0];
    if (!id) {
      const journals = await listManagedTransactions(userStateRoot());
      print(journals, json, journals.length > 0
        ? journals.map((journal) => `${journal.id}  ${journal.status}  ${journal.files.length} file(s)  ${journal.createdAt}`).join("\n")
        : "No managed transactions found.");
      return;
    }
    const plan = await planManagedRollback(userStateRoot(), id);
    if (!hasFlag(args, "--apply")) {
      print(plan, json, [
        `Rollback transaction: ${plan.id}`,
        `Status: ${plan.status}`,
        ...plan.files.map((file) => `${file.existed ? "RESTORE" : "REMOVE ".trim()} ${file.target}`),
        "Dry-run only. Pass --apply to restore only if every target still matches its post-transaction hash.",
      ].join("\n"));
    } else {
      const result = await rollbackManagedTransaction(userStateRoot(), id);
      print(result, json, `Rolled back ${result.id}: ${result.files.length} file(s).`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  // The error channel is an observable surface too: it leaves through the same
  // seam as everything else.
  process.stderr.write(`alpha-aos: ${redactString(message, observableContext())}\n`);
  process.exitCode = 2;
});
