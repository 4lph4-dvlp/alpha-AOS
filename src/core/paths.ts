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

/**
 * The bound every root-keyed process cache shares.
 *
 * One process asking about many package roots is a test harness or a
 * long-lived server, never a user: eight is generous for both and small
 * enough that a caller iterating roots cannot grow the map without limit
 * (T-02-67).
 */
export const ROOT_CACHE_LIMIT = 8;

/**
 * A process-wide cache whose value is DERIVED FROM a package root.
 *
 * Keyed by the resolved root, never by nothing. A memo keyed on nothing lets
 * the first caller in a process decide the answer for every later caller with
 * a different root — which is how a `packOverrides` key could be validated
 * against a different catalog than the one that evaluated the packs (WR-09).
 *
 * Behaviour at the bound is stated rather than implied: the OLDEST INSERTED
 * entry is evicted, and eviction is deliberately not a correctness hazard,
 * because the value is re-derived from that same root on the next request. An
 * eviction costs one re-read and can never change WHICH root's answer a caller
 * receives. That is the whole point of keying by root: the identity of the
 * answer is the key, not the cache's occupancy.
 */
export class RootKeyedCache<T> {
  private readonly entries = new Map<string, T>();
  private readonly limit: number;

  constructor(limit: number = ROOT_CACHE_LIMIT) {
    this.limit = limit;
  }

  /** How many roots are currently held. Bounded by `limit`, observable so the bound is proven rather than asserted in prose. */
  get size(): number {
    return this.entries.size;
  }

  async load(root: string, read: () => Promise<T>): Promise<T> {
    const key = resolve(root);
    const cached = this.entries.get(key);
    if (cached !== undefined) return cached;

    const value = await read();

    // Two callers may await the same root concurrently. The first to land
    // wins, so every caller in the process sees ONE value for one root rather
    // than two structurally-equal ones.
    const raced = this.entries.get(key);
    if (raced !== undefined) return raced;

    this.entries.set(key, value);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
    return value;
  }
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
