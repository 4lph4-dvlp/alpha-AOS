#!/usr/bin/env node
import { applyCodexPolicy, planCodexPolicy } from "./core/codex-policy.js";
import { readGsdContext } from "./core/gsd-context.js";
import { loadCatalog, loadLock } from "./core/catalog.js";
import { runDoctor } from "./core/doctor.js";
import { collectInventory } from "./core/inventory.js";
import { packageRoot } from "./core/paths.js";
import { createInstallPlan } from "./core/plan.js";
import { applyOwnedSkillSync, planOwnedSkillSync } from "./core/owned-skills.js";
import {
  applyPackRemoval,
  approvalCommand,
  approveProjectPlan,
  classifyAdapterSupport,
  ledgerHostEvidence,
  planOneShotOffer,
  planPackRemoval,
  planProjectCapabilities,
  reconcileProjectState,
  revalidateProjectPlan,
  type RemovalPlan,
} from "./core/project-plan.js";
import { applyProjectPackSync, describeProjectProvenance } from "./core/project-pack-sync.js";
import {
  applyIsolationManifest,
  cleanIsolationRuntime,
  createIsolationPlan,
  doctorIsolation,
  isolationProjectId,
  renderIsolationManifest,
  selectIsolationLaunch,
  syncIsolationRuntime,
} from "./core/isolation.js";
import { materializeEnvironment, probeCommand, runCommandInteractive } from "./core/process.js";
import { createGsdFixtureSpec, runGsdFixture, type GsdFixtureHarness } from "./core/gsd-fixture.js";
import { applyCodexGsdHookCompatibility, planCodexGsdHookCompatibility, smokeTestCodexGsdStopHook } from "./core/gsd-compat.js";
import { runEccFixture } from "./core/ecc-fixture.js";
import { applyEccSkillSync, planEccSkillSync } from "./core/ecc-skills.js";
import { runMcpFixture } from "./core/mcp-fixture.js";
import { applyMcpSync, mcpServerIds, planMcpSync } from "./core/mcp.js";
import { applyClaudeSkillPolicy, planClaudeSkillPolicy } from "./core/skill-policy.js";
import { createFileObservationSink, MCP_SERVER_IDS, runMcpFilterProxy, runMcpProxy } from "./core/mcp-proxy.js";
import { hasVersionChanges, resolveCandidate, writeCandidate } from "./core/update.js";
import { applyManagedInstall, createManagedInstallPlan, nodeRuntimeEnvironment } from "./core/install.js";
import { listManagedTransactions, planManagedRollback, rollbackManagedTransaction } from "./core/transaction.js";
import { userStateRoot } from "./core/paths.js";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  canaryProof,
  canaryRow,
  createCanaryObservationSink,
  createCanaryRuntime,
  disposeCanaryRuntime,
  discoveryRow,
  EMPTY_BOUND_INPUTS,
  handoffRow,
  HARNESS_COMMANDS,
  loadCanaryCatalog,
  resolveCapabilityFilter,
  runCanary,
  runCanarySweep,
  runDiscoverySweep,
  runHandoffCanary,
  skippedCanaryRow,
  SWEEP_HARNESSES,
  type CapabilityReportRow,
  type DiscoverySweep,
  type HandoffPair,
} from "./core/canary.js";
import {
  CAPABILITY_LEDGER_SCHEMA_VERSION,
  capabilityLedgerPath,
  harnessMinorKey,
  readCapabilityLedger,
  upsertProof,
  writeCapabilityLedger,
  type CapabilityProof,
  type HarnessVersion,
  type LedgerHarness,
} from "./core/capability-ledger.js";
import { formatCapabilityReport, formatDoctor, formatHandoffEvidence, formatInventory, formatIsolationLaunch, formatIsolationPlan, formatPlan, formatProjectApproval, formatProjectApprovalPreview, formatProjectPackSync, formatProjectPlan, formatProjectStatus, formatUpdate } from "./format.js";
import {
  createRedactionContext,
  describeOverBudgetEnvelope,
  redactDocument,
  redactString,
  serializeObservable,
} from "./core/redaction.js";
import { createPathAliases } from "./core/paths.js";
import { applyWriterRepair, inspectWriterState, planWriterRepair } from "./core/writer-lock.js";
import { applySupportBundle, collectSupportSources, planSupportBundleOperation } from "./core/support-bundle.js";
import { applyBootstrapOperation, createBootstrapOperationPlan, type BootstrapKind } from "./core/bootstrap.js";
import type { HarnessId, IsolationMode, McpServerId, PackSource, RedactionContext } from "./types.js";

const HELP = `alpha-aos

Usage:
  alpha-aos inventory [--json]
  alpha-aos plan [--json]
  alpha-aos install [--target <claude,codex,antigravity,pi,hermes>] [--apply] [--json]
  alpha-aos owned-skills sync <id> --target <harness> [--apply] [--json]
  alpha-aos ecc-skills sync --target <harness> [--apply] [--json]
  alpha-aos skill-policy sync --target claude [--apply] [--json]
  alpha-aos codex-policy sync [--apply] [--json]
  alpha-aos gsd-context <execute-phase|execute-plan|quick> [--step <name> | --from <line> --lines <count>] [--json]
  alpha-aos mcp sync --target <harness> [--server context7|exa|firecrawl] [--apply] [--json]
  alpha-aos update --check [--json]
  alpha-aos update --stage [--apply]
  alpha-aos update --apply [--target <harness[,harness]>] [--json]
  alpha-aos project plan|sync [path] [--project <rel>] [--why] [--json]
  alpha-aos project approve [path] [--project <rel>] [--plan-digest <digest>] [--apply] [--json]
  alpha-aos project status [path] [--project <rel>] [--json]
  alpha-aos project isolate init [path] --mode project-only|sealed --harness <id[,id]> [--trust] [--apply]
  alpha-aos project isolate plan|doctor|sync|clean [path] [--apply] [--json]
  alpha-aos project run <harness> [path] [--apply] [-- <harness-args>]
  alpha-aos status [--json]
  alpha-aos doctor [--json]
  alpha-aos doctor --discovery [path] [--json]
  alpha-aos doctor --canary [path] [--harness <id>] [--capability <id>] [--no-spend] [--json]
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

"doctor --discovery" is the free evidence: it runs only the discovery oracles that
spend no model turn, needs no credential, runs on every platform, and records what
it found in the host capability ledger.

"doctor --canary" is NOT a preview. It launches a harness inside a canary runtime,
spends a model turn where the harness costs one, and persists a ledger record. It
prints which canaries would spend before it runs anything, and refuses with the
readiness report — naming the variable and the next action, never a value — when a
required credential is absent.

"doctor --canary --no-spend" attempts only the legs that cost nothing. Every leg
that would spend a model turn is recorded "unverified" — NOT ATTEMPTED, which is
not the same as blocked — with that as the reason. It exists because one canary
is mostly free: --capability handoff (CAPA-03) writes a real cross-harness
handoff through the memory vault, recalls it under the receiving harness's own
filter, and hashes the project's .planning tree before and after, all offline.
Only the receiving harness's run costs anything. The handoff canary leaves ONE
memory in the project's own vault, with a sentinel title the report names.

alpha-AOS proves the .planning tree unchanged across that round trip. It does NOT
police what the memory tool does elsewhere on the filesystem: that would require
being an invocation proxy for every tool call, which this tool deliberately is not.

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

/**
 * Bare arguments, with the VALUE of a value-taking flag skipped.
 *
 * Without `valueFlags`, `--project packages/web` would leave `packages/web`
 * looking like the target path, and the tool would silently plan the wrong
 * directory.
 */
function positional(args: string[], valueFlags: readonly string[] = []): string[] {
  const result: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === undefined) continue;
    if (valueFlags.includes(value)) {
      index += 1;
      continue;
    }
    if (!value.startsWith("--")) result.push(value);
  }
  return result;
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
    // The envelope reports its own byte budget so this seam can act on it. It
    // used to write `.text` and discard `.truncated`, which shipped a document
    // cut mid-token with exit 0 (02-REVIEW WR-06). A refusal that names the
    // budget and the digest is the honest answer; a truncated one is not an
    // answer at all.
    const envelope = serializeObservable(value, context);
    if (envelope.truncated) throw new Error(describeOverBudgetEnvelope(envelope));
    process.stdout.write(`${envelope.text}\n`);
    return;
  }
  // A whole rendering, not one field value: `redactDocument` applies the same
  // replacements over the same text and caps at the document bound rather than
  // the per-value one, so `project plan --why` is not silently truncated.
  process.stdout.write(`${redactDocument(formatted, context)}\n`);
}

let sharedContext: RedactionContext | null = null;

function observableContext(): RedactionContext {
  sharedContext ??= createRedactionContext({
    secrets: credentialValues(),
    aliases: createPathAliases({ projectRoot: process.cwd() }),
  });
  return sharedContext;
}

/**
 * The harness version each ledger row binds to, probed once per invocation.
 *
 * A line nothing could read stays `unverified` rather than becoming an invented
 * version: `harnessMinorKey` keeps the raw string so a human can see exactly
 * what could not be parsed.
 */
function probedHarnessVersions(): Record<LedgerHarness, HarnessVersion> {
  const versions = {} as Record<LedgerHarness, HarnessVersion>;
  for (const harness of SWEEP_HARNESSES) {
    versions[harness] = harnessMinorKey(probeCommand(HARNESS_COMMANDS[harness]).version ?? "");
  }
  return versions;
}

/**
 * The bound skill-source hash for one pack: every selected skill's own source
 * hash, in a stable order, folded into one.
 *
 * Folded rather than picked, so a pack whose SECOND skill moved demotes exactly
 * as a pack whose first one did.
 */
function packSkillSourceHash(sources: readonly PackSource[]): string {
  const digest = createHash("sha256");
  for (const entry of [...sources].sort((left, right) => left.skill.localeCompare(right.skill))) {
    digest.update(`${entry.skill}:${entry.sourceSha256}\n`);
  }
  return digest.digest("hex");
}

/** The narrowed harness set a ledger row may name, or null for "every one". */
function ledgerHarness(value: string | null): LedgerHarness | null {
  if (value === null) return null;
  const found = SWEEP_HARNESSES.find((harness) => harness === value);
  if (found === undefined) {
    throw new Error(`Invalid --harness value: ${value}. A canary can be declared for ${SWEEP_HARNESSES.join(", ")}.`);
  }
  return found;
}

/**
 * This tool's own version, read from its manifest rather than restated.
 *
 * A ledger row records WHICH producer wrote it, and a literal that drifts from
 * the manifest would make that record quietly wrong — the same reason the
 * catalog is the source for every other version this tool reports.
 */
async function alphaAosVersion(): Promise<string> {
  const manifest = JSON.parse(await readFile(join(packageRoot(), "package.json"), "utf8")) as { version?: unknown };
  return typeof manifest.version === "string" && manifest.version.length > 0 ? manifest.version : "0.0.0-unknown";
}

/**
 * Appends proofs to the host capability ledger, through its one write path.
 *
 * A ledger that exists and does not pass its closed schema is REFUSED here
 * rather than overwritten: overwriting would destroy a record a user may still
 * need, and treating `unreadable` as `absent` is precisely the confusion the
 * tri-state read exists to prevent.
 */
async function appendCapabilityProofs(
  stateRoot: string,
  proofs: readonly CapabilityProof[],
): Promise<{ status: string; recorded: number; replaced: number; path: string }> {
  const path = capabilityLedgerPath(stateRoot);
  if (proofs.length === 0) return { status: "nothing-to-record", recorded: 0, replaced: 0, path };

  const existing = await readCapabilityLedger(path);
  if (existing.state === "unreadable") {
    throw new Error(
      `The capability ledger at ${path} exists and did not pass its closed schema, so it is refused rather than ` +
        `overwritten: ${existing.issues.map((issue) => `${issue.code}@${issue.documentPath}`).join(", ") || "no issue code recorded"}`,
    );
  }
  // Replaced in place, never appended: one row per project/harness/capability/
  // polarity identity, so "what is proven here" stays a question with one
  // answer. The replaced row's exact harness version is carried into the audit
  // field D-04 requires.
  let merged: readonly CapabilityProof[] = existing.state === "present" ? existing.ledger.proofs : [];
  let replaced = 0;
  for (const proof of proofs) {
    const upsert = upsertProof(merged, proof);
    merged = upsert.proofs;
    if (upsert.replaced !== null) replaced += 1;
  }
  const write = await writeCapabilityLedger({
    stateRoot,
    ledger: {
      schemaVersion: CAPABILITY_LEDGER_SCHEMA_VERSION,
      producer: { name: "alpha-aos", version: await alphaAosVersion() },
      updatedAt: new Date().toISOString(),
      proofs: merged,
    },
  });
  return { status: write.status, recorded: proofs.length, replaced, path: write.path };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] ?? "help";
  const json = hasFlag(args, "--json");
  // `--help` anywhere is a request for help, not a flag on the command it sits
  // beside: `alpha-aos doctor --help` must print help rather than run a doctor
  // sweep against a machine, and one help text is the whole contract.
  if (["help", "--help", "-h"].includes(command) || hasFlag(args, "--help") || hasFlag(args, "-h")) {
    process.stdout.write(HELP);
    return;
  }

  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  if (command === "mcp-proxy") {
    // Every pinned server can be fronted, not only the one alpha-AOS filters:
    // a server with no tool allowlist is forwarded unfiltered, which is what
    // makes it observable at all (D-01).
    const requested = args[1] ?? "";
    const server = MCP_SERVER_IDS.find((id) => id === requested);
    if (server === undefined) {
      throw new Error(`Usage: alpha-aos mcp-proxy <${MCP_SERVER_IDS.join("|")}>`);
    }
    const locked = lock.components.mcp?.[server];
    if (!locked) throw new Error(`Stable lock has no MCP component: ${server}`);
    // Observe mode is the canary runtime's front (D-02). It is reachable only
    // from a configuration a canary runtime rendered, which names the record
    // file it appends to — a front asked to observe with nowhere to record
    // would front the server and prove nothing, so it refuses.
    if (hasFlag(args, "--observe")) {
      const observations = optionValue(args, "--observations");
      if (observations === null || observations.length === 0) {
        throw new Error("alpha-aos mcp-proxy <server> --observe requires --observations <path>");
      }
      await runMcpProxy(server, locked, { mode: "observe", sink: createFileObservationSink(observations) });
      return;
    }
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

  if (command === "gsd-context") {
    const step = optionValue(args, "--step");
    const from = optionValue(args, "--from");
    const lines = optionValue(args, "--lines");
    const result = await readGsdContext(args[1] ?? "", {
      ...(step === null ? {} : { step }),
      ...(from === null ? {} : { from: Number(from) }),
      ...(lines === null ? {} : { lines: Number(lines) }),
    });
    print(result, true, "");
    return;
  }

  if (command === "codex-policy") {
    if (args[1] !== "sync") throw new Error("Usage: alpha-aos codex-policy sync [--apply] [--json]");
    const plan = await planCodexPolicy();
    if (!hasFlag(args, "--apply")) {
      print(plan, json, [
        "Codex execution guidance (native AGENTS.md; no hard token enforcement)",
        `Target: ${plan.target}`, `Action: ${plan.action}`, `Reviewed digest: ${plan.digest}`,
        "Dry-run only. Pass --apply to journal the owned block merge.",
      ].join("\n"));
    } else {
      const result = await applyCodexPolicy({ plan });
      print(result, json, result.operationId
        ? `Codex execution guidance synchronized. Restart Codex. Transaction: ${result.operationId}`
        : "Codex execution guidance is already current.");
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
    const context = observableContext();

    // The free evidence. No credential, no model turn, every platform — which
    // is what lets the automated suite and hosted CI run it (RESEARCH Pitfall
    // 10). Its sibling below is the paid one, and choosing it is a separate act.
    if (hasFlag(args, "--discovery")) {
      const target = targetPath(args, 1, ["--harness", "--capability", "--project"]);
      const plan = await planProjectCapabilities({ path: target, packageRoot: root });
      const stateRoot = userStateRoot();
      // Constructed, never assumed: `runPairedDiscovery` walks this directory's
      // ancestry and refuses to take a negative from a contaminated control.
      const controlRoot = await mkdtemp(join(tmpdir(), "alpha-aos-control-"));
      try {
        const versions = probedHarnessVersions();
        const sweeps: DiscoverySweep[] = [];
        const rows: CapabilityReportRow[] = [];
        for (const packId of plan.applicable) {
          const sources = plan.source.filter((entry) => entry.packId === packId);
          const sweep = await runDiscoverySweep({
            projectRoot: plan.scope.canonicalRoot,
            controlRoot,
            capability: packId,
            skillDirectories: sources.map((entry) => entry.skill),
            projectId: plan.scope.projectId,
            boundInputs: {
              skillSourceHash: packSkillSourceHash(sources),
              mcpServerVersion: null,
              evidenceHash: plan.evidenceDigest,
            },
            harnessVersions: versions,
          });
          sweeps.push(sweep);
          for (const entry of sweep.entries) {
            rows.push(discoveryRow(entry, packId, plan.adapterSupport[entry.harness] ?? "unverified"));
          }
        }
        const ledger = await appendCapabilityProofs(stateRoot, sweeps.flatMap((sweep) => sweep.proofs));
        print(
          { command: "doctor --discovery", project: plan.scope.canonicalRoot, packs: plan.applicable, costsModelTurn: false, rows, sweeps, ledger },
          json,
          formatCapabilityReport(
            `Free discovery sweep: ${plan.applicable.length} applicable pack(s) in ${plan.scope.canonicalRoot}`,
            rows,
            [
              "This sweep spent nothing: every oracle that would cost a model turn was skipped rather than run.",
              `Ledger: ${ledger.status} (${ledger.recorded} proof(s) recorded at ${ledger.path}).`,
            ],
          ),
          context,
        );
      } finally {
        await rm(controlRoot, { recursive: true, force: true });
      }
      return;
    }

    // The paid evidence. It prints what it would spend BEFORE it spends it, and
    // it refuses with the readiness report rather than running and failing.
    if (hasFlag(args, "--canary")) {
      const target = targetPath(args, 1, ["--harness", "--capability", "--project"]);
      const harnessFilter = ledgerHarness(optionValue(args, "--harness"));
      // Through the DECLARED alias table, so `--capability handoff` resolves to
      // a capability a reader can look up rather than to a string matched here.
      const capabilityFilter = resolveCapabilityFilter(optionValue(args, "--capability"));
      const spend = !hasFlag(args, "--no-spend");
      const canaryCatalog = (await loadCanaryCatalog(root)).value;
      const stateRoot = userStateRoot();
      const retained: string[] = [];
      const proofs: CapabilityProof[] = [];
      const versions = probedHarnessVersions();

      const sweep = await runCanarySweep({
        catalog: canaryCatalog,
        harness: harnessFilter,
        capability: capabilityFilter,
        spend,
        // Written to stderr so a human watching sees the spend before it
        // happens in BOTH modes; the same lines ride in the --json envelope, so
        // a program reading stdout is not asked to parse a side channel.
        announce: (line) => { process.stderr.write(`${redactString(line, context)}\n`); },
        run: async (selection) => {
          const runtime = await createCanaryRuntime({
            projectRoot: target,
            harness: selection.harness,
            servers: mcpServerIds(),
            stateRoot,
            lock,
          });
          const result = await runCanary({
            declaration: selection.declaration,
            harness: selection.harness,
            projectRoot: target,
            runtime,
            sink: createCanaryObservationSink(runtime),
          });
          const proof = canaryProof(result, {
            projectId: null,
            // NOT an empty string: `skillSourceHash` is a sha256 by contract, so
            // `""` writes a row the ledger's own reader then refuses (the 03-08
            // defect, one field over). An invocation canary binds to no pack
            // skill, and the digest of the empty set is what says that.
            boundInputs: EMPTY_BOUND_INPUTS,
            harnessVersion: versions[selection.harness] ?? { exact: null, minorKey: null, raw: "" },
          });
          if (proof !== null) proofs.push(proof);
          // A run that launched and did not complete cleanly is the one case
          // worth keeping the runtime for; everything else is ephemeral by
          // construction and is removed.
          if (result.launched && result.outcome !== "ready") retained.push(runtime.root);
          else await disposeCanaryRuntime(runtime);
          return result;
        },
        // The handoff canary's free legs run in EITHER mode; only its receiving
        // leg is gated on `spend`, because that is the only part that costs.
        runHandoff: async (selection) => {
          const handoff = await runHandoffCanary({
            declaration: selection.declaration,
            projectRoot: target,
            projectId: isolationProjectId(target),
            harnessVersions: versions,
            ...(spend
              ? {
                  receive: async (pair: HandoffPair) => {
                    const runtime = await createCanaryRuntime({
                      projectRoot: target,
                      harness: pair.target,
                      servers: mcpServerIds(),
                      stateRoot,
                      lock,
                      capability: selection.declaration.capability,
                    });
                    const result = await runCanary({
                      declaration: selection.declaration,
                      harness: pair.target,
                      projectRoot: target,
                      runtime,
                      sink: createCanaryObservationSink(runtime),
                    });
                    if (result.launched && result.outcome !== "ready") retained.push(runtime.root);
                    else await disposeCanaryRuntime(runtime);
                    return result;
                  },
                }
              : {}),
          });
          // Both halves of the unit go to the ledger, exactly as the paired
          // discovery sweep does: a positive without its negative on disk is a
          // unit nobody could reassemble later.
          for (const proof of [handoff.positive, handoff.negative]) {
            if (proof !== null) proofs.push(proof);
          }
          return handoff;
        },
      });

      const rows = [
        ...sweep.results.map((result) =>
          canaryRow(result, classifyAdapterSupport([result.harness]).at(0)?.support ?? "unverified"),
        ),
        ...sweep.handoffResults.map((result) =>
          handoffRow(result, classifyAdapterSupport([result.pair?.target ?? "claude"]).at(0)?.support ?? "unverified"),
        ),
        ...sweep.skipped.map((entry) =>
          skippedCanaryRow(entry, classifyAdapterSupport([entry.selection.harness]).at(0)?.support ?? "unverified"),
        ),
      ];
      const ledger = await appendCapabilityProofs(stateRoot, proofs);
      const blocked = [
        ...sweep.results.filter((result) => result.outcome === "blocked"),
        ...sweep.handoffResults.filter((result) => result.outcome === "blocked"),
      ];
      const runCount = sweep.results.length + sweep.handoffResults.length;
      print(
        {
          command: "doctor --canary",
          project: target,
          spend,
          cost: sweep.costLines,
          rows,
          results: sweep.results,
          handoffResults: sweep.handoffResults,
          skipped: sweep.skipped,
          ledger,
          retainedRuntimes: retained,
        },
        json,
        formatCapabilityReport(`Invocation canaries: ${runCount} run(s) in ${target}`, rows, [
          ...sweep.costLines,
          ...sweep.handoffResults.flatMap((result) => formatHandoffEvidence(result)),
          `Ledger: ${ledger.status} (${ledger.recorded} proof(s) recorded at ${ledger.path}).`,
          retained.length > 0
            ? `Retained for diagnosis: ${retained.join(", ")}`
            : "Every canary runtime was removed; a runtime is single-use and ephemeral.",
        ]),
        context,
      );
      if (blocked.length > 0) process.exitCode = 2;
      return;
    }

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
    const subcommand = args[1] ?? "plan";
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
    // `detect` is gone: it is folded into `plan`, which already printed
    // everything `detect` printed and more. Keeping two entry points would
    // keep two answers to one question (plan 02-06).
    if (!["plan", "sync", "approve", "status"].includes(subcommand)) throw new Error(`Unknown project command: ${subcommand}`);
    // D-12: previewing and persisting are two different acts, so `--apply`
    // belongs to `approve` and to nothing else. Silently ignoring the flag here
    // would let a user believe `plan` had persisted something.
    if (subcommand === "plan" && hasFlag(args, "--apply")) {
      throw new Error("`project plan` has no --apply: it previews and persists nothing. Approve a reviewed plan with `alpha-aos project approve <path> --plan-digest <digest> --apply`.");
    }
    // D-14: `status` reports and offers; it is never the thing that deletes.
    // The removal travels the approve verb with the removal plan's digest, so
    // the phase has exactly one writer.
    if (subcommand === "status" && hasFlag(args, "--apply")) {
      throw new Error("`project status` has no --apply: it reads and deletes nothing. Approve a removal it printed with `alpha-aos project approve <path> --plan-digest <removal-digest> --apply`.");
    }
    const parts = positional(args.slice(2), ["--project", "--plan-digest"]);
    const target = parts[0] ?? process.cwd();
    // Dependency names and paths reach stdout, so every rendering below leaves
    // through the one redaction seam rather than a direct write.
    const context = observableContext();
    const subProject = optionValue(args, "--project");
    const planOptions = {
      path: target,
      packageRoot: root,
      ...(subProject === null ? {} : { subProject }),
    };

    // D-08: `sync --apply` materializes `.alpha-aos/plan.json` and nothing
    // else. The targets come out of the reviewed artifact, so a user who reads
    // the approve preview has already seen every path this writes.
    if (subcommand === "sync" && hasFlag(args, "--apply")) {
      const result = await applyProjectPackSync({ ...planOptions, stateRoot: userStateRoot() });
      print(result, json, formatProjectPackSync(result), context);
      return;
    }

    if (subcommand === "status") {
      // 03-CONTEXT.md D-11: the native-use and support axes are HOST facts, so
      // the ledger is read here — at the command boundary that already resolves
      // every other host path — and passed IN. `reconcileProjectState` resolves
      // no state root of its own, which is what keeps a host fact from reaching
      // the plan digest by accident (T-03-83).
      const statusLedgerRead = await readCapabilityLedger(capabilityLedgerPath(userStateRoot()));
      const reconciliation = await reconcileProjectState(planOptions, ledgerHostEvidence(statusLedgerRead));
      const removals = planPackRemoval(reconciliation);
      const oneShotOffers = planOneShotOffer(
        reconciliation,
        statusLedgerRead.state === "present" ? statusLedgerRead.ledger : null,
        { path: target, subProject },
      );
      // The human lines live in `src/format.ts` and the raw shape leaves
      // through `--json`, which is the split every other surface follows. The
      // per-target receipt claim and sidecar state ride in both.
      const provenance = describeProjectProvenance(reconciliation);
      print(
        { reconciliation, removals, provenance },
        json,
        formatProjectStatus(reconciliation, removals, { path: target, subProject }, oneShotOffers, provenance),
        context,
      );
      // A repository-supplied artifact that failed its closed schema is a
      // refusal, not a routine absence. The whole report is still printed —
      // the reconciliation itself is derived from freshly recomputed evidence
      // and stays true — and the exit status is what says the artifact was
      // REJECTED rather than merely missing (02-REVIEW CR-04).
      if (reconciliation.artifactState === "unreadable") process.exitCode = 2;
      return;
    }

    if (subcommand === "approve") {
      const stateRoot = userStateRoot();
      const apply = hasFlag(args, "--apply");
      const reviewed = optionValue(args, "--plan-digest");
      if (!apply || reviewed === null) {
        // The same revalidation the apply runs, so the digest a reviewer is
        // asked to pass back is the digest the apply will recompute.
        const revalidated = await revalidateProjectPlan({ ...planOptions, stateRoot });
        const command = approvalCommand({ path: target, subProject, planDigest: revalidated.plan.planDigest });
        if (!apply) {
          print(
            { applied: false, planDigest: revalidated.plan.planDigest, command, plan: revalidated.plan },
            json,
            formatProjectApprovalPreview(revalidated.plan, command, { why: hasFlag(args, "--why") }),
            context,
          );
          return;
        }
        throw new Error(`project approve --apply requires the digest that was reviewed. The current plan digest is ${revalidated.plan.planDigest}. Run: ${command}`);
      }
      // A removal is approved through this same verb and this same digest
      // contract, so the offered removals are consulted — but only when the
      // supplied digest is not the CURRENT plan digest.
      //
      // The removal set is computed through `readPackReceiptsStrict`, which
      // refuses any receipt that fails its schema. Consulting it unconditionally
      // made one corrupt receipt block plan approval outright, silently
      // overriding the approve flow's deliberate `RECEIPT_UNREADABLE` tolerance
      // (02-REVIEW WR-02). A digest that IS the current plan digest is
      // unambiguously a plan approval, so there is nothing to disambiguate and
      // no reason to read a receipt at all.
      const current = await revalidateProjectPlan({ ...planOptions, stateRoot });
      let removal: RemovalPlan | undefined;
      if (reviewed !== current.plan.planDigest) {
        try {
          // The ledger is read here too, and from the SAME state root
          // `applyPackRemoval` will read it from. A one-shot removal digest is
          // only on offer when the ledger records the invocation, so omitting
          // it here would refuse a digest the preview had just printed.
          const removalLedger = await readCapabilityLedger(capabilityLedgerPath(stateRoot));
          removal = planPackRemoval(
            await reconcileProjectState(planOptions, ledgerHostEvidence(removalLedger)),
          ).find((entry) => entry.removalDigest === reviewed);
        } catch (error) {
          // Both halves, because a user who supplied a stale digest AND has a
          // corrupt receipt needs both to know what to do next.
          throw new Error(
            `the supplied digest is not the current plan digest (${current.plan.planDigest}), and the removal set ` +
              `could not be computed, so it cannot be told from a removal digest either: ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (removal !== undefined) {
        const removed = await applyPackRemoval({ ...planOptions, stateRoot, removalDigest: reviewed });
        print(
          removed,
          json,
          [
            `Removed pack: ${removed.packId}`,
            ...removed.removed.map((path) => `  removed ${path}`),
            `Transaction: ${removed.operationId}`,
            "The transaction snapshotted every removed file before deleting it, so this removal is reversible with `alpha-aos rollback`.",
          ].join("\n"),
          context,
        );
        return;
      }
      const result = await approveProjectPlan({ ...planOptions, stateRoot, expectedDigest: reviewed });
      print(result, json, formatProjectApproval(result), context);
      return;
    }

    const plan = await planProjectCapabilities(planOptions);
    print(plan, json, formatProjectPlan(plan, { why: hasFlag(args, "--why") }), context);
    if (subcommand === "sync") process.stdout.write("\nDry-run only. Project files and harness configuration were not changed.\n");
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
