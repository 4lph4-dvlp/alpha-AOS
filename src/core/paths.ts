import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { PathAliases } from "../types.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export function findPackageRoot(start: string): string | null {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, "catalog", "stack.yaml"))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function packageRoot(): string {
  const fromModule = findPackageRoot(moduleDirectory);
  if (fromModule) return fromModule;

  const fromWorkingDirectory = findPackageRoot(process.cwd());
  if (fromWorkingDirectory) return fromWorkingDirectory;

  throw new Error("Could not locate catalog/stack.yaml");
}

export function userStateRoot(): string {
  const override = process.env.ALPHA_AOS_STATE_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".alpha-aos");
}

/**
 * Windows and macOS compare paths case-insensitively; Linux does not. Aliasing
 * has to match the host's own notion of "the same directory", or a descendant
 * is either missed or wrongly claimed.
 */
const caseInsensitiveHost = process.platform === "win32" || process.platform === "darwin";

function comparablePath(value: string): string {
  return caseInsensitiveHost ? value.toLowerCase() : value;
}

/**
 * True only when `candidate` is `root` itself or a descendant of it, compared
 * on whole path segments. A string prefix test would alias `/home/al-backup`
 * under `/home/al`, which is a different directory.
 */
function withinRoot(root: string, candidate: string): boolean {
  const comparableRoot = comparablePath(root);
  const comparableCandidate = comparablePath(candidate);
  if (comparableCandidate === comparableRoot) return true;
  const boundary = comparableRoot.endsWith(sep) ? comparableRoot : `${comparableRoot}${sep}`;
  return comparableCandidate.startsWith(boundary);
}

/**
 * Builds the alias table applied after secret replacement. Roots are ordered
 * most-specific first so a project inside the home directory aliases as
 * `<project>` rather than `~`.
 */
export function createPathAliases(options: { projectRoot?: string | undefined } = {}): PathAliases {
  const roots: PathAliases["roots"] = [];
  const projectRoot = options.projectRoot?.trim();
  if (projectRoot) roots.push({ alias: "<project>", root: resolve(projectRoot) });

  const stateRoot = process.env.ALPHA_AOS_STATE_DIR?.trim();
  if (stateRoot) roots.push({ alias: "<state>", root: resolve(stateRoot) });

  roots.push({ alias: "<temp>", root: resolve(tmpdir()) });
  roots.push({ alias: "~", root: resolve(homedir()) });

  // Longest root first: a nested root must win over the ancestor containing it.
  roots.sort((left, right) => right.root.length - left.root.length);
  return { roots };
}

/**
 * Replaces a private root with its alias while keeping the relative suffix,
 * which is the part that carries diagnostic value. A path under no known root
 * is returned unchanged — inventing an alias would hide real information.
 */
export function aliasPath(value: string, aliases: PathAliases): string {
  if (value.length === 0) return value;
  let normalized: string;
  try {
    normalized = resolve(value);
  } catch {
    return value;
  }

  for (const entry of aliases.roots) {
    if (!withinRoot(entry.root, normalized)) continue;
    const suffix = normalized.slice(entry.root.length);
    if (suffix.length === 0) return entry.alias;
    // `suffix` still carries its leading separator, so the alias joins cleanly.
    return `${entry.alias}${suffix}`;
  }
  return value;
}

/**
 * Compatibility wrapper over the home alias. Retained because existing output
 * surfaces and tests call it directly; new code should use `aliasPath`.
 */
export function redactHome(value: string): string {
  return aliasPath(value, createPathAliases());
}
