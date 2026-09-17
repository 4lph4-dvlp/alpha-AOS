import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { getHarnessPreloadExclusion } from "../adapters/isolation.js";
import type {
  ClassificationResult,
  EffectiveTreePolicy,
  FirstUseChoice,
  HarnessId,
  TreePolicyMode,
  TreePreviewReport,
  TreeRegistry,
  TreeRegistryEntry,
} from "../types.js";
import { canonicalizeWithMissingTail } from "./path-boundary.js";
import { packageRoot, userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { validateManagedDocument } from "./validation.js";

const caseInsensitiveHost = process.platform === "win32" || process.platform === "darwin";

/**
 * Normalizes case according to platform semantics: Windows and macOS are
 * case-insensitive; Linux preserves case.
 */
export function comparablePath(value: string): string {
  return caseInsensitiveHost ? value.toLowerCase() : value;
}

/**
 * Computes deterministic 16-hex tree ID from canonical path with host case folding.
 * Complies with ^[0-9a-f]{16}$ in schemas/tree-registry.schema.json.
 */
export function computeTreeId(canonicalPath: string): string {
  return createHash("sha256").update(comparablePath(canonicalPath), "utf8").digest("hex").slice(0, 16);
}

/**
 * Checks whether candidate path is within root directory, respecting whole path segment boundaries.
 */
export function withinTreeRoot(root: string, candidate: string): boolean {
  const cRoot = comparablePath(root);
  const cCand = comparablePath(candidate);
  if (cCand === cRoot) return true;
  const boundary = cRoot.endsWith(sep) ? cRoot : `${cRoot}${sep}`;
  return cCand.startsWith(boundary);
}

/**
 * Resolves a target path to its canonical filesystem path, resolving symlinks/junctions
 * and handling missing tails via canonicalizeWithMissingTail.
 */
export async function canonicalizeTreePath(targetPath: string): Promise<string> {
  const absolute = resolve(targetPath);
  const resolution = await canonicalizeWithMissingTail(absolute);
  if (resolution.reason !== null) {
    throw new Error(`Path could not be canonically resolved: ${targetPath} (${resolution.reason})`);
  }
  let canonical = resolution.canonical;
  if (canonical.length > 1 && canonical.endsWith(sep)) {
    const isWinRoot = process.platform === "win32" && /^[a-zA-Z]:\\$/.test(canonical);
    if (!isWinRoot) {
      canonical = canonical.slice(0, -1);
    }
  }
  return canonical;
}

/**
 * Resolves the effective policy for targetPath using Nearest Ancestor (Longest Prefix Match)
 * across registered trees. Supports nested overrides (e.g. managed child in off parent).
 */
export async function resolveEffectivePolicy(
  targetPath: string,
  registeredTrees: readonly TreeRegistryEntry[],
): Promise<EffectiveTreePolicy> {
  const canonical = await canonicalizeTreePath(targetPath);
  const matching = registeredTrees.filter((entry) => withinTreeRoot(entry.path, canonical));
  if (matching.length === 0) {
    return {
      entry: null,
      inherited: false,
      depth: 0,
      effectiveMode: "unclassified",
      targetPath,
      canonicalPath: canonical,
    };
  }

  // Sort descending by path length (deepest ancestor wins)
  const sorted = [...matching].sort((a, b) => comparablePath(b.path).length - comparablePath(a.path).length);
  const nearest = sorted[0]!;
  const isExact = comparablePath(nearest.path) === comparablePath(canonical);
  return {
    entry: nearest,
    inherited: !isExact,
    depth: matching.length,
    effectiveMode: nearest.mode,
    targetPath,
    canonicalPath: canonical,
  };
}

let cachedSchema: Record<string, unknown> | null = null;
async function getTreeRegistrySchema(): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const schemaPath = join(packageRoot(), "schemas", "tree-registry.schema.json");
  const text = await readFile(schemaPath, "utf8");
  cachedSchema = JSON.parse(text) as Record<string, unknown>;
  return cachedSchema;
}

/**
 * Returns the absolute path to trees.json in the user state root (normally ~/.alpha-aos/trees.json).
 */
export function treeRegistryPath(stateRoot?: string): string {
  return join(stateRoot ?? userStateRoot(), "trees.json");
}

/**
 * Loads and validates ~/.alpha-aos/trees.json. Returns a clean default registry if missing.
 */
export async function loadTreeRegistry(stateRoot?: string): Promise<TreeRegistry> {
  const filePath = treeRegistryPath(stateRoot);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        schemaVersion: 1,
        updatedAt: new Date().toISOString(),
        trees: [],
      };
    }
    throw error;
  }

  const schema = await getTreeRegistrySchema();
  const validation = validateManagedDocument<TreeRegistry>({
    text,
    format: "json",
    kind: "tree-registry",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    const issuesStr = validation.issues.map((i) => `${i.documentPath}: ${i.expected} (${i.code})`).join("; ");
    throw new Error(`Tree registry validation failed for ${filePath}: ${issuesStr}`);
  }

  return validation.value;
}

/**
 * Validates and atomically writes ~/.alpha-aos/trees.json via applyFileTransaction.
 * Enforces D-01: zero repository files created or modified.
 */
export async function saveTreeRegistry(
  registry: TreeRegistry,
  options?: { stateRoot?: string | undefined },
): Promise<void> {
  const text = `${JSON.stringify(registry, null, 2)}\n`;
  const schema = await getTreeRegistrySchema();
  const validation = validateManagedDocument<TreeRegistry>({
    text,
    format: "json",
    kind: "tree-registry",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    const issuesStr = validation.issues.map((i) => `${i.documentPath}: ${i.expected} (${i.code})`).join("; ");
    throw new Error(`Tree registry schema validation failed: ${issuesStr}`);
  }

  const root = resolve(options?.stateRoot ?? userStateRoot());
  const target = treeRegistryPath(root);
  await applyFileTransaction({
    stateRoot: root,
    allowedRoots: [root],
    operations: [{ target, content: Buffer.from(text, "utf8") }],
  });
}

/**
 * Registers or updates a tree policy in ~/.alpha-aos/trees.json.
 */
export async function setTreePolicy(
  pathInput: string,
  mode: TreePolicyMode,
  options?: { stateRoot?: string | undefined; notes?: string | undefined },
): Promise<TreeRegistryEntry> {
  const canonical = await canonicalizeTreePath(pathInput);
  const id = computeTreeId(canonical);
  const registry = await loadTreeRegistry(options?.stateRoot);
  const now = new Date().toISOString();

  const existingIndex = registry.trees.findIndex((t) => t.id === id);
  let entry: TreeRegistryEntry;

  let newTrees: TreeRegistryEntry[];
  if (existingIndex >= 0) {
    const existing = registry.trees[existingIndex]!;
    entry = {
      id,
      path: canonical,
      mode,
      createdAt: existing.createdAt,
      updatedAt: now,
      ...(options?.notes !== undefined ? { notes: options.notes } : existing.notes ? { notes: existing.notes } : {}),
    };
    newTrees = [...registry.trees];
    newTrees[existingIndex] = entry;
  } else {
    entry = {
      id,
      path: canonical,
      mode,
      createdAt: now,
      updatedAt: now,
      ...(options?.notes !== undefined ? { notes: options.notes } : {}),
    };
    newTrees = [...registry.trees, entry];
  }

  // Keep trees sorted deterministically by canonical path
  newTrees.sort((a, b) => comparablePath(a.path).localeCompare(comparablePath(b.path)));

  const updatedRegistry: TreeRegistry = {
    schemaVersion: 1,
    updatedAt: now,
    trees: newTrees,
  };

  await saveTreeRegistry(updatedRegistry, options?.stateRoot !== undefined ? { stateRoot: options.stateRoot } : undefined);
  return entry;
}

/**
 * Removes a tree policy from ~/.alpha-aos/trees.json by path.
 * Returns true if an entry was removed, false if no matching entry existed.
 */
export async function removeTreePolicy(
  pathInput: string,
  options?: { stateRoot?: string | undefined },
): Promise<boolean> {
  const canonical = await canonicalizeTreePath(pathInput);
  const id = computeTreeId(canonical);
  const registry = await loadTreeRegistry(options?.stateRoot);

  const filtered = registry.trees.filter((t) => t.id !== id);
  if (filtered.length === registry.trees.length) {
    return false;
  }

  const updatedRegistry: TreeRegistry = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    trees: filtered,
  };

  await saveTreeRegistry(updatedRegistry, options?.stateRoot !== undefined ? { stateRoot: options.stateRoot } : undefined);
  return true;
}

/**
 * Lists all registered tree policies from ~/.alpha-aos/trees.json.
 */
export async function listTreePolicies(stateRoot?: string): Promise<readonly TreeRegistryEntry[]> {
  const registry = await loadTreeRegistry(stateRoot);
  return registry.trees;
}

/**
 * Traverses up from targetPath to locate the enclosing Git repository root or worktree root.
 * Returns canonical directory path containing .git (dir or file), or null if not in git.
 */
export async function findEnclosingGitRoot(targetPath: string): Promise<string | null> {
  let current = await canonicalizeTreePath(targetPath);
  while (true) {
    const gitPath = join(current, ".git");
    try {
      const gitStat = await stat(gitPath);
      if (gitStat.isDirectory() || gitStat.isFile()) {
        return current;
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        // Continue walking up if error is non-fatal
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/**
 * Prompts user interactively on first encounter of an unclassified Git root.
 * Presents 3 explicit choices: [1] Managed, [2] Off, [3] 나중에 결정 (D-10).
 */
export async function promptFirstUseClassification(
  gitRoot: string,
  options?: { stdin?: NodeJS.ReadableStream | undefined; stderr?: NodeJS.WritableStream | undefined },
): Promise<FirstUseChoice> {
  const input = options?.stdin ?? process.stdin;
  const output = options?.stderr ?? process.stderr;

  const promptText =
    `\nalpha-AOS: Newly encountered Git repository root:\n` +
    `  ${gitRoot}\n` +
    `Select policy for this repository:\n` +
    `  [1] Managed (적용)       - Enable alpha-AOS project management and capabilities\n` +
    `  [2] Off (격리)          - Isolate from global customizations, vanilla harness with local resources\n` +
    `  [3] 나중에 결정 (Skip)   - Ask next time, pass through this invocation only\n` +
    `Choice [1/2/3] (default 3): `;

  output.write(promptText);

  const rl = createInterface({
    input,
    output,
    terminal: false,
  });

  try {
    for await (const rawLine of rl) {
      const answer = rawLine.trim().toLowerCase();
      if (answer === "1" || answer === "managed") return "managed";
      if (answer === "2" || answer === "off") return "off";
      if (answer === "3" || answer === "" || answer === "skip" || answer === "나중에 결정") return "ask-next-time";

      output.write(`Invalid choice '${answer}'. Please enter 1, 2, or 3.\n`);
      output.write(promptText);
    }
  } finally {
    rl.close();
  }

  return "ask-next-time";
}

/**
 * Coordinates first-use classification: prompts interactively when TTY is available,
 * or safely falls back to Fail-Safe Off in headless / CI environments (D-11).
 */
export async function classifyGitRootOrFallback(
  gitRoot: string,
  options?: {
    isTTY?: boolean | undefined;
    defaultModeEnv?: string | undefined;
    stdin?: NodeJS.ReadableStream | undefined;
    stderr?: NodeJS.WritableStream | undefined;
    stateRoot?: string | undefined;
  },
): Promise<ClassificationResult> {
  const canonicalRoot = await canonicalizeTreePath(gitRoot);
  const registry = await loadTreeRegistry(options?.stateRoot);
  const id = computeTreeId(canonicalRoot);

  const existing = registry.trees.find((t) => t.id === id);
  if (existing) {
    return {
      mode: existing.mode,
      persisted: true,
      gitRoot: canonicalRoot,
      reason: "already-classified",
    };
  }

  const isTTY = options?.isTTY ?? (Boolean(process.stdin.isTTY) && !process.env.CI);

  if (!isTTY) {
    const override = options?.defaultModeEnv ?? process.env.ALPHA_AOS_DEFAULT_MODE;
    if (override === "managed") {
      return {
        mode: "managed",
        persisted: false,
        gitRoot: canonicalRoot,
        reason: "default-mode-override",
      };
    }
    return {
      mode: "off",
      persisted: false,
      gitRoot: canonicalRoot,
      reason: "ci-fallback",
    };
  }

  const choice = await promptFirstUseClassification(canonicalRoot, {
    stdin: options?.stdin,
    stderr: options?.stderr,
  });

  if (choice === "managed") {
    await setTreePolicy(canonicalRoot, "managed", options?.stateRoot !== undefined ? { stateRoot: options.stateRoot } : undefined);
    return {
      mode: "managed",
      persisted: true,
      gitRoot: canonicalRoot,
      reason: "interactive",
    };
  }

  if (choice === "off") {
    await setTreePolicy(canonicalRoot, "off", options?.stateRoot !== undefined ? { stateRoot: options.stateRoot } : undefined);
    return {
      mode: "off",
      persisted: true,
      gitRoot: canonicalRoot,
      reason: "interactive",
    };
  }

  return {
    mode: "passthrough",
    persisted: false,
    gitRoot: canonicalRoot,
    reason: "interactive",
  };
}

/**
 * Previews effective policy, inheritance depth, and isolated launch parameters for targetPath.
 */
export async function previewTreePolicy(
  targetPath: string,
  options?: { stateRoot?: string | undefined; harness?: HarnessId | undefined },
): Promise<TreePreviewReport> {
  const canonicalPath = await canonicalizeTreePath(targetPath);
  const gitRoot = await findEnclosingGitRoot(targetPath);
  const registry = await loadTreeRegistry(options?.stateRoot);
  const effective = await resolveEffectivePolicy(canonicalPath, registry.trees);
  const harness = options?.harness ?? "codex";

  if (effective.effectiveMode === "off") {
    const treeId = effective.entry?.id ?? computeTreeId(canonicalPath);
    const isolatedConfigRoot = join(options?.stateRoot ?? userStateRoot(), "isolated", "trees", treeId);
    const exclusion = getHarnessPreloadExclusion(harness, isolatedConfigRoot, { surface: "cli" });
    return {
      targetPath,
      canonicalPath,
      gitRoot,
      effectiveMode: "off",
      inherited: effective.inherited,
      depth: effective.depth,
      matchedAncestor: effective.entry?.path ?? null,
      launchFlags: exclusion.args,
      isolatedConfigRoot,
    };
  }

  return {
    targetPath,
    canonicalPath,
    gitRoot,
    effectiveMode: effective.effectiveMode,
    inherited: effective.inherited,
    depth: effective.depth,
    matchedAncestor: effective.entry?.path ?? null,
    launchFlags: [],
    isolatedConfigRoot: null,
  };
}

/**
 * Options for late discovery restart planning (OPTO-04).
 */
export interface LateDiscoveryRestartOptions {
  readonly harness: HarnessId;
  readonly targetPath: string;
  readonly upstreamBinary: string;
  readonly args: readonly string[];
  readonly stateRoot?: string | undefined;
}

/**
 * Plan describing a clean subprocess restart to guarantee no contaminated in-memory isolation state.
 */
export interface LateDiscoveryRestartPlan {
  readonly required: boolean;
  readonly command: string;
  readonly args: readonly string[];
  readonly isolatedConfigRoot: string;
}

/**
 * Persists an off policy and generates a clean restart execution plan when late discovery
 * finds an off policy after dirty customizations were loaded (OPTO-04).
 */
export async function planLateDiscoveryRestart(
  options: LateDiscoveryRestartOptions,
): Promise<LateDiscoveryRestartPlan> {
  const canonical = await canonicalizeTreePath(options.targetPath);
  await setTreePolicy(canonical, "off", options.stateRoot !== undefined ? { stateRoot: options.stateRoot } : undefined);
  const treeId = computeTreeId(canonical);
  const isolatedConfigRoot = join(options.stateRoot ?? userStateRoot(), "isolated", "trees", treeId);
  const exclusion = getHarnessPreloadExclusion(options.harness, isolatedConfigRoot, { surface: "cli" });

  return {
    required: true,
    command: options.upstreamBinary,
    args: [...exclusion.args, ...options.args],
    isolatedConfigRoot,
  };
}

