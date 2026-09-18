import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";
import { parseDocument } from "yaml";
import type {
  HarnessId,
  RecoveryReceiptEntry,
  SemanticPrunePlan,
  UninstallPlan,
  UninstallResult,
  UninstallScope,
} from "../types.js";
import { globalEccSkillRoot } from "./ecc-skills.js";
import { globalMcpConfigPath, stripManagedToml } from "./mcp.js";
import { userStateRoot } from "./paths.js";
import { createRecoveryReceipt, writeRecoveryReceipt } from "./recovery-receipt.js";
import { globalClaudeSettingsPath } from "./skill-policy.js";
import { applyFileTransaction, sweepReverseDirectories, type FileWriteOperation } from "./transaction.js";

export class SemanticPruneDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SemanticPruneDriftError";
  }
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

const CODEX_START_MARKER = "<!-- alpha-AOS:codex-execution:start -->";
const CODEX_END_MARKER = "<!-- alpha-AOS:codex-execution:end -->";
const CODEX_MARKER_PREFIX = "<!-- alpha-AOS:codex-execution:";

export function pruneCodexConfig(content: string): string {
  if (content.includes("# alpha-aos:start mcp")) {
    if (!content.includes("# alpha-aos:end mcp")) {
      throw new SemanticPruneDriftError(
        "Malformed or tampered alpha-AOS Codex MCP block in config.toml: missing closing marker '# alpha-aos:end mcp'",
      );
    }
  }
  const stripped = stripManagedToml(content);
  if (stripped.trim()) {
    try {
      parseToml(stripped);
    } catch (err) {
      throw new SemanticPruneDriftError(
        `Cannot prune Codex config; invalid TOML remainder: ${(err as Error).message}`,
      );
    }
    return `${stripped}\n`;
  }
  return "";
}

export function pruneCodexAgentsMarkdown(content: string): string {
  if (!content.includes(CODEX_MARKER_PREFIX)) return content;
  const occurrences = content.split(CODEX_MARKER_PREFIX).length - 1;
  const start = content.indexOf(CODEX_START_MARKER);
  const end = content.indexOf(CODEX_END_MARKER);
  if (occurrences !== 2 || start < 0 || end <= start) {
    throw new SemanticPruneDriftError(
      "Malformed or tampered alpha-AOS Codex execution markers in AGENTS.md",
    );
  }
  const remainder = `${content.slice(0, start)}${content.slice(end + CODEX_END_MARKER.length)}`.trim();
  return remainder ? `${remainder}\n` : "";
}

export function pruneClaudeConfig(
  content: string,
  managedServers: readonly string[] = ["context7", "exa", "firecrawl"],
): string {
  if (!content.trim()) return content;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new SemanticPruneDriftError(`Cannot prune Claude config; invalid JSON: ${(err as Error).message}`);
  }
  if (typeof doc === "object" && doc !== null && typeof doc.mcpServers === "object" && doc.mcpServers !== null && !Array.isArray(doc.mcpServers)) {
    const servers = { ...(doc.mcpServers as Record<string, unknown>) };
    for (const server of managedServers) {
      delete servers[server];
    }
    if (Object.keys(servers).length === 0) {
      delete doc.mcpServers;
    } else {
      doc.mcpServers = servers;
    }
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function pruneClaudeSettings(content: string): string {
  if (!content.trim()) return content;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new SemanticPruneDriftError(`Cannot prune Claude settings; invalid JSON: ${(err as Error).message}`);
  }
  if (typeof doc === "object" && doc !== null && typeof doc.skillOverrides === "object" && doc.skillOverrides !== null && !Array.isArray(doc.skillOverrides)) {
    const overrides = { ...(doc.skillOverrides as Record<string, unknown>) };
    delete overrides["unified-memory"];
    delete overrides["documentation-lookup"];
    delete overrides["deep-research"];
    if (Object.keys(overrides).length === 0) {
      delete doc.skillOverrides;
    } else {
      doc.skillOverrides = overrides;
    }
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function pruneAntigravityConfig(
  content: string,
  managedServers: readonly string[] = ["context7", "exa", "firecrawl"],
): string {
  if (!content.trim()) return content;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new SemanticPruneDriftError(`Cannot prune Antigravity config; invalid JSON: ${(err as Error).message}`);
  }
  if (typeof doc === "object" && doc !== null && typeof doc.mcpServers === "object" && doc.mcpServers !== null && !Array.isArray(doc.mcpServers)) {
    const servers = { ...(doc.mcpServers as Record<string, unknown>) };
    for (const server of managedServers) {
      delete servers[server];
    }
    if (Object.keys(servers).length === 0) {
      delete doc.mcpServers;
    } else {
      doc.mcpServers = servers;
    }
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function prunePiConfig(
  content: string,
  managedServers: readonly string[] = ["context7", "exa", "firecrawl"],
): string {
  if (!content.trim()) return content;
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(content) as Record<string, unknown>;
  } catch (err) {
    throw new SemanticPruneDriftError(`Cannot prune Pi config; invalid JSON: ${(err as Error).message}`);
  }
  if (typeof doc === "object" && doc !== null) {
    if (typeof doc.mcpServers === "object" && doc.mcpServers !== null && !Array.isArray(doc.mcpServers)) {
      const servers = { ...(doc.mcpServers as Record<string, unknown>) };
      for (const server of managedServers) {
        delete servers[server];
      }
      if (Object.keys(servers).length === 0) {
        delete doc.mcpServers;
      } else {
        doc.mcpServers = servers;
      }
    }
    if (typeof doc.settings === "object" && doc.settings !== null && !Array.isArray(doc.settings)) {
      const settings = { ...(doc.settings as Record<string, unknown>) };
      delete settings.hostConfigDiscovery;
      delete settings.directTools;
      delete settings.toolPrefix;
      delete settings.notifyOnStartupConnect;
      delete settings.outputGuard;
      if (Object.keys(settings).length === 0) {
        delete doc.settings;
      } else {
        doc.settings = settings;
      }
    }
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function pruneHermesConfig(
  content: string,
  managedServers: readonly string[] = ["context7", "exa", "firecrawl"],
): string {
  if (!content.trim()) return content;
  const doc = parseDocument(content);
  if (doc.errors.length > 0) {
    throw new SemanticPruneDriftError(`Cannot prune Hermes config; invalid YAML: ${doc.errors[0]?.message ?? "unknown error"}`);
  }
  const mcpServersNode = doc.get("mcp_servers");
  if (mcpServersNode && typeof mcpServersNode === "object" && "items" in mcpServersNode) {
    for (const server of managedServers) {
      doc.deleteIn(["mcp_servers", server]);
    }
    const afterNode = doc.get("mcp_servers");
    if (
      afterNode &&
      typeof afterNode === "object" &&
      "items" in afterNode &&
      Array.isArray((afterNode as { items: unknown[] }).items) &&
      (afterNode as { items: unknown[] }).items.length === 0
    ) {
      doc.delete("mcp_servers");
    }
  }
  return doc.toString({ lineWidth: 0 });
}

export interface UninstallPlanOptions {
  scope: UninstallScope;
  targetHarness?: HarnessId | undefined;
  projectPath?: string | undefined;
  purge?: boolean | undefined;
  stateRoot?: string | undefined;
  root?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  home?: string | undefined;
}

const MANAGED_SERVERS = ["context7", "exa", "firecrawl"] as const;
const MANAGED_SKILLS = ["unified-memory", "documentation-lookup", "deep-research"] as const;

export async function planUninstall(options: UninstallPlanOptions): Promise<UninstallPlan> {
  const env = options.env ?? process.env;
  const home = options.home ?? homedir();
  const stateRoot = resolve(options.stateRoot ?? env.ALPHA_AOS_STATE_DIR?.trim() ?? join(home, ".alpha-aos"));
  const prunePlans: SemanticPrunePlan[] = [];
  const filesToRemove: string[] = [];
  const directoriesToSweep: string[] = [];
  const externalCompensation: RecoveryReceiptEntry[] = [];

  const targets: HarnessId[] = options.scope === "target"
    ? (options.targetHarness ? [options.targetHarness] : [])
    : options.scope === "all"
    ? ["claude", "codex", "antigravity", "pi", "hermes"]
    : [];

  if (options.scope === "target" && targets.length === 0) {
    throw new Error("Target harness must be specified for target uninstall (--target <harness>)");
  }

  for (const harness of targets) {
    // 1. MCP config pruning
    const mcpPath = globalMcpConfigPath(harness, env, home);
    if (existsSync(mcpPath)) {
      const content = await readFile(mcpPath, "utf8");
      let pruned = content;
      let format: SemanticPrunePlan["format"] = "json";
      const injectedRemoved: string[] = [];
      const userPreserved: string[] = [];

      switch (harness) {
        case "codex": {
          format = "toml";
          pruned = pruneCodexConfig(content);
          if (content.includes("# alpha-aos:start mcp") || content.includes("[mcp_servers.")) {
            injectedRemoved.push(...MANAGED_SERVERS.filter((s) => content.includes(s)));
          }
          if (pruned.trim()) userPreserved.push("user-tables");
          break;
        }
        case "claude": {
          format = "json";
          pruned = pruneClaudeConfig(content, MANAGED_SERVERS);
          injectedRemoved.push(...MANAGED_SERVERS.filter((s) => content.includes(`"${s}"`)));
          try {
            const parsed = JSON.parse(pruned) as Record<string, unknown>;
            userPreserved.push(...Object.keys(parsed));
          } catch {
            // ignore
          }
          break;
        }
        case "antigravity": {
          format = "json";
          pruned = pruneAntigravityConfig(content, MANAGED_SERVERS);
          injectedRemoved.push(...MANAGED_SERVERS.filter((s) => content.includes(`"${s}"`)));
          try {
            const parsed = JSON.parse(pruned) as Record<string, unknown>;
            userPreserved.push(...Object.keys(parsed));
          } catch {
            // ignore
          }
          break;
        }
        case "pi": {
          format = "json";
          pruned = prunePiConfig(content, MANAGED_SERVERS);
          injectedRemoved.push(...MANAGED_SERVERS.filter((s) => content.includes(`"${s}"`)));
          try {
            const parsed = JSON.parse(pruned) as Record<string, unknown>;
            userPreserved.push(...Object.keys(parsed));
          } catch {
            // ignore
          }
          break;
        }
        case "hermes": {
          format = "yaml";
          pruned = pruneHermesConfig(content, MANAGED_SERVERS);
          injectedRemoved.push(...MANAGED_SERVERS.filter((s) => content.includes(s)));
          userPreserved.push("user-yaml-keys");
          break;
        }
      }

      if (pruned !== content) {
        prunePlans.push({
          path: mcpPath,
          format,
          existedBefore: true,
          userKeysPreserved: userPreserved,
          injectedKeysRemoved: injectedRemoved,
          action: pruned.trim() ? "prune" : "delete",
          currentHash: sha256(content),
          expectedAfterHash: pruned.trim() ? sha256(pruned) : null,
        });
      }
    }

    // 2. Extra harness configs
    if (harness === "claude") {
      const settingsPath = globalClaudeSettingsPath(env, home);
      if (existsSync(settingsPath)) {
        const content = await readFile(settingsPath, "utf8");
        const pruned = pruneClaudeSettings(content);
        if (pruned !== content) {
          prunePlans.push({
            path: settingsPath,
            format: "json",
            existedBefore: true,
            userKeysPreserved: ["settings"],
            injectedKeysRemoved: [...MANAGED_SKILLS.filter((s) => content.includes(s))],
            action: "prune",
            currentHash: sha256(content),
            expectedAfterHash: sha256(pruned),
          });
        }
      }
      const ownedSkill = join(home, ".claude", "skills", "gsd-code-review", "SKILL.md");
      if (existsSync(ownedSkill)) {
        filesToRemove.push(ownedSkill);
        directoriesToSweep.push(dirname(ownedSkill));
      }
    }

    if (harness === "codex") {
      const codexHome = env.CODEX_HOME?.trim() || join(home, ".codex");
      const agentsPath = join(codexHome, "AGENTS.md");
      if (existsSync(agentsPath)) {
        const content = await readFile(agentsPath, "utf8");
        const pruned = pruneCodexAgentsMarkdown(content);
        if (pruned !== content) {
          prunePlans.push({
            path: agentsPath,
            format: "markdown",
            existedBefore: true,
            userKeysPreserved: pruned.trim() ? ["user-agents-instructions"] : [],
            injectedKeysRemoved: ["alpha-AOS:codex-execution"],
            action: pruned.trim() ? "prune" : "delete",
            currentHash: sha256(content),
            expectedAfterHash: pruned.trim() ? sha256(pruned) : null,
          });
        }
      }
    }

    // 3. ECC skills removal
    const skillRoot = globalEccSkillRoot(harness, env, home);
    for (const skill of MANAGED_SKILLS) {
      const file = join(skillRoot, skill, "SKILL.md");
      if (existsSync(file)) {
        filesToRemove.push(file);
        directoriesToSweep.push(dirname(file));
      }
    }
  }

  // Project scope
  if (options.scope === "project") {
    const projectRoot = resolve(options.projectPath ?? process.cwd());
    const dotAlphaAos = join(projectRoot, ".alpha-aos");
    if (existsSync(dotAlphaAos)) {
      const scan = async (dir: string): Promise<void> => {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await scan(full);
            directoriesToSweep.push(full);
          } else {
            filesToRemove.push(full);
          }
        }
      };
      await scan(dotAlphaAos);
      directoriesToSweep.push(dotAlphaAos);
    }
  }

  // All scope external package compensation
  if (options.scope === "all") {
    externalCompensation.push(
      {
        component: "gsd",
        action: "install",
        target: "global",
        previousState: null,
        appliedState: "uninstalled",
        compensation: {
          instructions: "GSD Core files in harness config directories can be removed manually if no longer required.",
          commands: ["rm -rf ~/.claude/get-shit-done ~/.codex/get-shit-done"],
        },
      },
      {
        component: "ecc-runtime",
        action: "install",
        target: "global npm",
        previousState: null,
        appliedState: "uninstalled",
        compensation: {
          instructions: "Uninstall global ECC companion runtime via npm.",
          commands: ["npm uninstall -g @enterprise-coding-companion/companion"],
        },
      },
      {
        component: "npm-link",
        action: "link",
        target: "global alpha-aos",
        previousState: null,
        appliedState: "unlinked",
        compensation: {
          instructions: "Unlink global alpha-aos binary.",
          commands: ["npm unlink -g alpha-aos"],
        },
      },
    );
  }

  const planDigest = createHash("sha256")
    .update(
      JSON.stringify({
        scope: options.scope,
        targetHarness: options.targetHarness,
        projectPath: options.projectPath,
        purgeRequested: Boolean(options.purge),
        prunePlans: prunePlans.map((p) => ({ path: p.path, expectedAfterHash: p.expectedAfterHash })),
        filesToRemove,
      }),
    )
    .digest("hex");

  return {
    schemaVersion: 1,
    scope: options.scope,
    ...(options.targetHarness ? { targetHarness: options.targetHarness } : {}),
    ...(options.projectPath ? { projectPath: options.projectPath } : {}),
    purgeRequested: Boolean(options.purge),
    stateRoot,
    prunePlans,
    filesToRemove,
    directoriesToSweep,
    externalCompensation,
    planDigest,
  };
}

export async function applyUninstall(options: {
  plan: UninstallPlan;
  stateRoot?: string;
}): Promise<UninstallResult> {
  const plan = options.plan;
  const stateRoot = options.stateRoot ?? plan.stateRoot;
  const prunedFiles: string[] = [];
  const removedFiles: string[] = [];
  const sweptDirectories: string[] = [];

  const allowedRoots = new Set<string>([stateRoot]);

  // Execute pruning
  for (const prunePlan of plan.prunePlans) {
    allowedRoots.add(dirname(prunePlan.path));
    if (existsSync(prunePlan.path)) {
      const content = await readFile(prunePlan.path, "utf8");
      let pruned = content;
      if (prunePlan.format === "toml") pruned = pruneCodexConfig(content);
      else if (prunePlan.format === "markdown") pruned = pruneCodexAgentsMarkdown(content);
      else if (prunePlan.format === "yaml") pruned = pruneHermesConfig(content);
      else if (prunePlan.format === "json") {
        if (prunePlan.path.endsWith("settings.json")) pruned = pruneClaudeSettings(content);
        else if (prunePlan.path.endsWith("mcp.json")) pruned = prunePiConfig(content);
        else if (prunePlan.path.endsWith("mcp_config.json")) pruned = pruneAntigravityConfig(content);
        else pruned = pruneClaudeConfig(content);
      }

      const operations: FileWriteOperation[] = [
        {
          target: prunePlan.path,
          content: pruned.trim() ? pruned : null,
        },
      ];

      await applyFileTransaction({
        stateRoot,
        allowedRoots: [dirname(prunePlan.path), stateRoot],
        operations,
      });

      if (pruned.trim()) {
        prunedFiles.push(prunePlan.path);
      } else {
        removedFiles.push(prunePlan.path);
      }
    }
  }

  // Execute file removals
  for (const file of plan.filesToRemove) {
    allowedRoots.add(dirname(file));
    if (existsSync(file)) {
      await applyFileTransaction({
        stateRoot,
        allowedRoots: [dirname(file), stateRoot],
        operations: [{ target: file, content: null }],
      });
      removedFiles.push(file);
    }
  }

  // Sweep directories
  for (const dir of plan.directoriesToSweep) {
    if (existsSync(dir)) {
      const swept = await sweepReverseDirectories(join(dir, "sentinel.tmp"), [...allowedRoots]);
      sweptDirectories.push(...swept);
    }
  }

  // Write recovery receipt if external compensation is needed
  let receipt;
  if (plan.externalCompensation.length > 0) {
    receipt = createRecoveryReceipt({
      operationId: `uninstall-${randomUUID().slice(0, 8)}`,
      entries: plan.externalCompensation,
    });
    await writeRecoveryReceipt(stateRoot, receipt);
  }

  // Historical journal preservation vs purge (LIFE-04, D-04)
  const preservedJournals: string[] = [];
  const journalDir = join(stateRoot, "journal");
  if (existsSync(journalDir)) {
    const entries = await readdir(journalDir).catch(() => []);
    preservedJournals.push(...entries.filter((e) => e.endsWith(".json")));
  }

  if (plan.scope === "all") {
    if (plan.purgeRequested) {
      await rm(stateRoot, { recursive: true, force: true });
    } else {
      // Remove other managed directories but PRESERVE journal
      const toClean = ["snapshots", "runtimes", "shims"];
      for (const item of toClean) {
        await rm(join(stateRoot, item), { recursive: true, force: true });
      }
      await rm(join(stateRoot, "writer.lock"), { force: true });
    }
  }

  return {
    plan,
    prunedFiles,
    removedFiles,
    sweptDirectories,
    preservedJournals: plan.purgeRequested ? [] : preservedJournals,
    ...(receipt ? { recoveryReceipt: receipt } : {}),
  };
}
