import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type {
  EffectiveTreePolicy,
  TreePolicyMode,
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
