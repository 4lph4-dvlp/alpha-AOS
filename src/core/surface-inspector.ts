import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getHarnessPreloadExclusion } from "../adapters/isolation.js";
import { verifyShimsPrecedence } from "../adapters/shims.js";
import type {
  EffectiveTreePolicy,
  HarnessId,
  LocalProjectResources,
  TreeSurfaceInspection,
} from "../types.js";
import { userStateRoot } from "./paths.js";
import { ProcessPolicyError, scrubEnvironmentForOffTree } from "./process.js";
import {
  canonicalizeTreePath,
  computeTreeId,
  loadTreeRegistry,
  resolveEffectivePolicy,
} from "./tree-policy.js";

/**
 * Discovers project-local user-owned AI agent resources with zero modification (D-13, OPTO-06).
 * Inspects .agents/skills, .mcp.json, .codex/config.toml, AGENTS.md/CLAUDE.md, and .hooks.
 */
export async function discoverLocalProjectResources(targetPath: string): Promise<LocalProjectResources> {
  const projectRoot = await canonicalizeTreePath(targetPath);
  const skills: string[] = [];
  let mcpConfig: string | null = null;
  let codexConfig: string | null = null;
  const instructions: string[] = [];
  const hooks: string[] = [];

  // 1. .agents/skills
  const agentsSkillsDir = join(projectRoot, ".agents", "skills");
  try {
    const entries = await readdir(agentsSkillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() || ent.isFile()) {
        skills.push(ent.name);
      }
    }
    skills.sort();
  } catch {
    // Directory does not exist
  }

  // 2. .mcp.json
  const mcpJsonPath = join(projectRoot, ".mcp.json");
  try {
    const mcpStat = await stat(mcpJsonPath);
    if (mcpStat.isFile()) {
      mcpConfig = ".mcp.json";
    }
  } catch {
    // File does not exist
  }

  // 3. .codex/config.toml
  const codexConfigPath = join(projectRoot, ".codex", "config.toml");
  try {
    const codexStat = await stat(codexConfigPath);
    if (codexStat.isFile()) {
      codexConfig = join(".codex", "config.toml");
    }
  } catch {
    // File does not exist
  }

  // 4. Instructions: AGENTS.md, CLAUDE.md
  for (const doc of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const docStat = await stat(join(projectRoot, doc));
      if (docStat.isFile()) {
        instructions.push(doc);
      }
    } catch {
      // File does not exist
    }
  }

  // 5. .hooks
  const hooksDir = join(projectRoot, ".hooks");
  try {
    const hookEntries = await readdir(hooksDir, { withFileTypes: true });
    for (const ent of hookEntries) {
      if (ent.isFile()) {
        hooks.push(ent.name);
      }
    }
    hooks.sort();
  } catch {
    // Directory does not exist
  }

  const isVanilla =
    skills.length === 0 &&
    mcpConfig === null &&
    codexConfig === null &&
    instructions.length === 0 &&
    hooks.length === 0;

  return {
    projectRoot,
    skills,
    mcpConfig,
    codexConfig,
    instructions,
    hooks,
    isVanilla,
  };
}

/**
 * Asserts refusal for unsupported sealed isolation mode (D-16, OPTO-09).
 * Fails closed with ProcessPolicyError (exit code 2) without silent fallback.
 */
export function assertSealedModeRefusal(mode: string): void {
  if (mode === "sealed") {
    throw new ProcessPolicyError(
      "unsupported-executable",
      "alpha-AOS: 'sealed' mode requires an OS/container sandbox boundary (SEAL-01 v2). Configuration isolation cannot substitute for container sandboxing. Refusing execution without silent fallback.",
    );
  }
}

/**
 * Inspects all 8 dimensions of the directory tree isolation surface (D-15, OPTO-08).
 */
export async function inspectTreeSurface(
  targetPath: string,
  options?: {
    stateRoot?: string | undefined;
    harness?: HarnessId | undefined;
    surface?: "cli" | "gui" | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  },
): Promise<TreeSurfaceInspection> {
  const canonicalPath = await canonicalizeTreePath(targetPath);
  const stateRoot = options?.stateRoot ?? userStateRoot();
  const registry = await loadTreeRegistry(stateRoot);
  const effectivePolicy = await resolveEffectivePolicy(canonicalPath, registry.trees);

  const treeId = effectivePolicy.entry?.id ?? computeTreeId(canonicalPath);
  const isOff = effectivePolicy.effectiveMode === "off";
  const isolatedConfigRoot = isOff ? join(stateRoot, "isolated", "trees", treeId) : null;

  const excludedGlobalResources = {
    skills: isOff,
    mcp: isOff,
    hooks: isOff,
    instructions: isOff,
    memory: isOff,
  };

  const localResources = await discoverLocalProjectResources(canonicalPath);
  const environmentStatus = scrubEnvironmentForOffTree(options?.env ?? process.env);

  const harness = options?.harness ?? "codex";
  const exclusion = getHarnessPreloadExclusion(
    harness,
    isolatedConfigRoot ?? join(stateRoot, "isolated", "trees", treeId),
    options?.surface !== undefined ? { surface: options.surface } : undefined,
  );

  const shimsDir = join(stateRoot, "shims");
  const shimsPrecedence = verifyShimsPrecedence(shimsDir);

  return {
    targetPath,
    canonicalPath,
    effectivePolicy,
    isolatedConfigRoot,
    excludedGlobalResources,
    localResources,
    environmentStatus,
    harnessSupport: {
      harness,
      provable: exclusion.provable,
      status: exclusion.provable ? "ok" : "unsupported",
      ...(exclusion.unsupportedReason ? { reason: exclusion.unsupportedReason } : {}),
    },
    preLaunchEnforcement: {
      method: "transparent-path-shim",
      shimPrecedenceOk: shimsPrecedence.isFirstOnPath,
    },
    boundaryNotice: {
      kind: "configuration-isolation",
      description:
        "Directory tree 'off' mode enforces Configuration Isolation (excluding global skills, instructions, hooks, and MCP servers) before harness runtime loads. It does NOT provide OS-level filesystem or network sandboxing.",
      sealedModeSupported: false,
    },
  };
}
