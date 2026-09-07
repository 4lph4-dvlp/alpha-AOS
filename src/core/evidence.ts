import { createHash } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DetectorKind,
  EvidenceEnvelope,
  EvidenceFact,
  FactDeclaration,
  FactVocabulary,
  ProjectStackManifest,
} from "../types.js";
import type { IgnoreRuleSet } from "./ignore-list.js";
import { isIgnored, loadIgnoreRules } from "./ignore-list.js";
import { isolationProjectId } from "./isolation.js";
import { loadFactVocabularyStrict } from "./pack-catalog.js";
import { canonicalizeWithMissingTail, provePathBoundary } from "./path-boundary.js";
import { findPackageRoot } from "./paths.js";
import { inspectProjectManifest } from "./project.js";
import { parseManagedDocument } from "./validation.js";

/**
 * Which rung of the root ladder answered. Recording the path alone loses the
 * reason, and the reason is what a reviewer needs to judge the scope.
 */
export type RootReason =
  | "explicit-override"
  | "git-root"
  | "worktree-root"
  | "submodule-root"
  | "project-declaration"
  | "standalone-directory";

export interface CanonicalRoot {
  /** Canonical form, native separators. The one form every later step uses. */
  root: string;
  reason: RootReason;
  /** 16 hex, derived from `root` by `isolationProjectId`. */
  projectId: string;
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Every ancestor of `target`, deepest first. */
function ancestorsDeepestFirst(target: string): string[] {
  const chain: string[] = [];
  let cursor = target;
  while (true) {
    chain.push(cursor);
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return chain;
}

/**
 * A directory containing a `.git` entry is the root of a different project,
 * whether that entry is a directory (ordinary repository) or a file (linked
 * worktree or submodule). Testing `isDirectory()` would walk straight into
 * both of the latter, borrowing their evidence.
 */
function isGitBoundary(directory: string): boolean {
  return existsSync(join(directory, ".git"));
}

async function canonicalize(pathValue: string): Promise<string> {
  const resolution = await canonicalizeWithMissingTail(resolve(pathValue));
  if (resolution.reason !== null) {
    throw new Error(`Project root could not be canonically resolved: ${resolution.reason}`);
  }
  return resolution.canonical;
}

/**
 * Resolves the project root through one ordered ladder and records which rung
 * answered. `isolationProjectId` is fed the already-canonical value on
 * purpose: `resolve()` in its body does not follow links, so only a canonical
 * input makes it an identity function and gives one repository one id however
 * it was addressed. That function is reused unchanged — its output names
 * existing runtime roots under `~/.alpha-aos/`.
 *
 * This tracer implements two rungs. The worktree, submodule and
 * project-declaration rungs are declared in `RootReason` and land with the
 * boundary walk in a later plan of this phase.
 */
export async function resolveCanonicalRoot(inputPath: string, explicit?: string): Promise<CanonicalRoot> {
  if (explicit !== undefined && explicit.trim().length > 0) {
    const root = await canonicalize(explicit);
    return { root, reason: "explicit-override", projectId: isolationProjectId(root) };
  }

  const start = await canonicalize(inputPath);
  for (const ancestor of ancestorsDeepestFirst(start)) {
    if (!isGitBoundary(ancestor)) continue;
    const root = await canonicalize(ancestor);
    return { root, reason: "git-root", projectId: isolationProjectId(root) };
  }
  return { root: start, reason: "standalone-directory", projectId: isolationProjectId(start) };
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let producerVersion: string | null = null;

/** The producer name and version belong to alpha-AOS, not to the repository. */
async function readProducer(): Promise<{ name: string; version: string }> {
  if (producerVersion === null) {
    const packageDirectory = findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
    let version = "0.0.0";
    if (packageDirectory !== null) {
      const parsed = parseManagedDocument({
        text: await readFile(join(packageDirectory, "package.json"), "utf8"),
        format: "json",
      });
      const record = parsed.value as { version?: unknown } | null;
      if (record !== null && typeof record.version === "string") version = record.version;
    }
    producerVersion = version;
  }
  return { name: "alpha-aos", version: producerVersion };
}

/** Records which files a detector actually read, for the aggregate input digest. */
export class ReadLedger {
  private readonly entries = new Map<string, string>();

  record(root: string, absolutePath: string, bytes: string): void {
    this.entries.set(relative(root, absolutePath).split(sep).join("/"), sha256(bytes));
  }

  /** Records an already-relative POSIX path, for readers that never joined one. */
  recordRelative(relativePosixPath: string, bytes: string): void {
    this.entries.set(relativePosixPath, sha256(bytes));
  }

  get size(): number {
    return this.entries.size;
  }

  /** Every file actually read, in one total order. Plan 02-08 digests this list. */
  inputs(): ReadInput[] {
    return [...this.entries.entries()]
      .map(([path, hash]) => ({ path, hash }))
      .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  }

  /**
   * sha256 over the sorted `(relative POSIX path, sha256 of bytes)` list. This
   * is an aggregate over the read set, not a per-fact hash: D-07 forbids the
   * latter precisely so an unrelated comment does not disturb a fact, while
   * this answers the different question of whether anything looked at moved.
   */
  digest(): string {
    return inputsDigest(this.inputs());
  }
}

/**
 * Reads declared package names without letting the parsed document decide the
 * shape of anything. `Object.keys` over a null-prototype copy is the whole
 * defence: the parsed value is never spread into a live object.
 */
function declaredPackages(section: unknown): Array<{ name: string; range: string | null }> {
  if (typeof section !== "object" || section === null || Array.isArray(section)) return [];
  const safe = Object.assign(Object.create(null) as Record<string, unknown>, section);
  return Object.keys(safe).map((name) => {
    const value = safe[name];
    return { name, range: typeof value === "string" && value.length > 0 ? value : null };
  });
}

const DEPENDENCY_SECTIONS = ["dependencies", "devDependencies", "peerDependencies"] as const;

/**
 * Collects repository evidence.
 *
 * This tracer runs exactly one detector — `dependency`, reading `package.json`
 * at the root through the duplicate-key-rejecting route, because a document
 * that declares one package twice is ambiguous rather than authoritative. The
 * remaining five detector kinds and the declared fact vocabulary land in later
 * plans of this phase.
 */
export async function collectProjectEvidence(root: CanonicalRoot): Promise<EvidenceEnvelope> {
  const ledger = new ReadLedger();
  const facts: EvidenceFact[] = [];

  const manifestPath = join(root.root, "package.json");
  let absent: string | null = null;
  if (!existsSync(manifestPath)) {
    absent = "package.json does not exist at the canonical root";
  } else {
    const text = await readFile(manifestPath, "utf8");
    ledger.record(root.root, manifestPath, text);
    const parsed = parseManagedDocument({ text, format: "json" });
    if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
      const first = parsed.issues[0];
      throw new Error(
        `package.json at ${manifestPath} is not an unambiguous JSON object: ${first?.code ?? "syntax.malformed"}`,
      );
    }
    const manifest = parsed.value as Record<string, unknown>;
    // First section wins, so one package cannot produce two contradictory facts.
    const seen = new Set<string>();
    for (const section of DEPENDENCY_SECTIONS) {
      for (const declared of declaredPackages(manifest[section])) {
        if (seen.has(declared.name)) continue;
        seen.add(declared.name);
        const fact: EvidenceFact = {
          id: `dependency:${declared.name}`,
          kind: "dependency",
          detected: true,
          path: "package.json",
        };
        if (declared.range !== null) fact.version = declared.range;
        facts.push(fact);
      }
    }
    if (seen.size === 0) absent = "package.json declares no dependencies";
  }

  if (absent !== null) {
    // Absence is recorded, never omitted: "not detected" and "not checked"
    // must not be the same output. A later plan replaces this single summary
    // record with one negative record per declared fact in catalog/facts.yaml.
    facts.push({ id: "dependency:none", kind: "dependency", detected: false, reason: absent });
  }

  facts.sort((left, right) => left.id.localeCompare(right.id));
  return {
    schemaVersion: 1,
    projectId: root.projectId,
    producer: await readProducer(),
    createdAt: new Date().toISOString(),
    sourceHash: ledger.digest(),
    facts,
  };
}

// ---------------------------------------------------------------------------
// Bounded, boundary-proven tree scan
// ---------------------------------------------------------------------------
//
// DETC-01 is a containment property, and its canonical failure is a root that
// is canonicalized correctly followed by a walk that is not. `readdir` returns
// entries; nothing about an entry says where it really lives, and an
// `existsSync(join(root, "src"))` is true for a symlink to anywhere. So every
// path this walk actually reads is proven with `provePathBoundary` against the
// canonical root, not merely joined under it.
//
// The boundary stop rule is the EXISTENCE of a `.git` entry, never
// `statSync(...).isDirectory()`: `.git` is a DIRECTORY for an ordinary
// repository and a nested `git init`, and a FILE for a linked worktree and a
// submodule, so an `isDirectory()` test silently walks into two of the four
// (02-RESEARCH.md §Pattern 2, verified on Git 2.55.0). `.gitmodules` at the
// canonical root is read as a SECOND, independent boundary source, because a
// submodule that is declared but not yet initialized has no `.git` entry at
// all. The `gitdir:` pointer inside a `.git` file may be absolute or relative;
// it is never parsed, because its existence is the whole signal.
//
// D-03's exclusion is silent by decision: `excludedBoundaries` is carried in
// the returned value for tests and for `--why`, but no "N separate
// repositories were excluded" notice is printed. That notice is an explicitly
// deferred idea.

/** Deepest directory level below the canonical root the walk will descend to. */
export const MAX_SCAN_DEPTH = 12;
/** Directory entries the walk will consider before reporting a bound. */
export const MAX_SCAN_ENTRIES = 50000;
/** Sub-projects reported before discovery reports a bound. */
export const MAX_SUB_PROJECTS = 64;

/** 64 KiB. A `.gitmodules` past this is refused rather than partially read. */
const GITMODULES_BYTE_CAP = 65536;

/**
 * Directory names that mark a vendored tree — a copy of another project living
 * inside this one. This is a BOUNDARY heuristic and NOT the ignore rule: D-04
 * is explicit that ignore-list membership, not a name list, decides what is
 * scanned. It is therefore deliberately narrow and strictly additive. It can
 * only ever stop the walk; it never grants scannability to anything the ignore
 * list excluded, and it is not a general prune list.
 */
export const VENDORED_BOUNDARY_DIRECTORIES: readonly string[] = [
  "node_modules",
  "bower_components",
  "vendor",
  "third_party",
];

export type ScanBoundName = "MAX_SCAN_DEPTH" | "MAX_SCAN_ENTRIES" | "MAX_SUB_PROJECTS";

export interface ScanBound {
  readonly bound: ScanBoundName;
  readonly limit: number;
  /** Relative POSIX path where the bound was first reached. */
  readonly at: string;
}

export type BoundaryReason =
  | "git-entry"
  | "declared-submodule"
  | "vendored-directory"
  | "ignored"
  | "undecidable"
  | "outside-canonical-root"
  | "visited-identity"
  | "depth-bound"
  | "unreadable";

export interface ExcludedBoundary {
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly reason: BoundaryReason;
  /** What decided, in shape-only terms. Null when the reason says it all. */
  readonly detail: string | null;
}

export interface ProjectTreeScan {
  /** The canonical root the relative paths below are measured from. */
  readonly root: string;
  /** Every scannable path, directories and files alike, sorted. */
  readonly paths: readonly string[];
  readonly directories: readonly string[];
  readonly files: readonly string[];
  readonly excludedBoundaries: readonly ExcludedBoundary[];
  /** Every bound reached. Empty means the scan was complete, not merely quiet. */
  readonly bounds: readonly ScanBound[];
  readonly entriesSeen: number;
}

export interface ScanProjectTreeOptions {
  readonly maxDepth?: number;
  readonly maxEntries?: number;
}

function errnoOf(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

function toPosixPath(value: string): string {
  return value.split(sep).join("/");
}

/**
 * A declaration entry re-expressed as a relative POSIX path, or null when it
 * cannot be one. Absolute entries and entries escaping through `..` are
 * refused here rather than resolved, so nothing outside is ever joined.
 */
function normalizeRelativePosix(value: string): string | null {
  let text = value.trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) text = text.slice(1, -1);
  text = text.split("\\").join("/").trim();
  while (text.startsWith("./")) text = text.slice(2);
  while (text.endsWith("/")) text = text.slice(0, -1);
  if (text.length === 0) return null;
  if (text.startsWith("/") || /^[A-Za-z]:/u.test(text)) return null;
  const segments = text.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  return segments.join("/");
}

/** Proves a path against the canonical root. Nothing is read before this. */
async function proveInsideRoot(root: string, absolutePath: string) {
  return provePathBoundary({ path: absolutePath, allowedRoots: [root], role: "target" });
}

/**
 * Submodule paths declared at the superproject root. This is the second,
 * independent boundary source: a declared-but-uninitialized submodule has no
 * `.git` entry, so the existence rule alone would walk into it.
 */
async function readDeclaredSubmodulePaths(root: string, excluded: ExcludedBoundary[]): Promise<ReadonlySet<string>> {
  const declared = new Set<string>();
  const filePath = join(root, ".gitmodules");

  const proof = await proveInsideRoot(root, filePath);
  if (!proof.proven) {
    if (proof.code !== "outside-configured-root") {
      excluded.push({ path: ".gitmodules", reason: "outside-canonical-root", detail: proof.code });
    }
    return declared;
  }

  let info: Stats;
  try {
    info = await stat(filePath);
  } catch (error) {
    const code = errnoOf(error);
    // No `.gitmodules` is the ordinary case, not a failure.
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      excluded.push({ path: ".gitmodules", reason: "unreadable", detail: `gitmodules-unreadable: code=${code}` });
    }
    return declared;
  }
  if (!info.isFile()) return declared;
  if (info.size > GITMODULES_BYTE_CAP) {
    excluded.push({
      path: ".gitmodules",
      reason: "unreadable",
      detail: `gitmodules-byte-cap: construct=gitmodules-file, cap=${GITMODULES_BYTE_CAP}, exceeded=true`,
    });
    return declared;
  }

  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    excluded.push({
      path: ".gitmodules",
      reason: "unreadable",
      detail: `gitmodules-unreadable: code=${errnoOf(error)}`,
    });
    return declared;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*path\s*=\s*(.+?)\s*$/u.exec(line);
    if (match === null) continue;
    const normalized = normalizeRelativePosix(match[1] as string);
    if (normalized !== null) declared.add(normalized);
  }
  return declared;
}

/**
 * Identity keys for a directory the walk is about to descend into.
 *
 * Two keys, because neither alone terminates every cycle. `lstat` of a link is
 * the LINK's own identity, so a chain through one link repeats it and stops;
 * but two distinct links onto the same real directory have distinct link
 * identities. The canonical path from the boundary proof closes that case, and
 * catches `loop -> .` on the first encounter. A host that reports inode `0`
 * (some Windows filesystems) still has the canonical key.
 */
async function identityKeys(absolutePath: string, canonicalPath: string): Promise<string[]> {
  const keys = [`path:${canonicalPath}`];
  try {
    const followed = await stat(absolutePath);
    if (followed.ino !== 0) keys.push(`identity:${followed.dev}:${followed.ino}`);
  } catch {
    // The boundary proof already classified this path; an identity we cannot
    // read simply contributes no extra key.
  }
  return keys;
}

/**
 * Walks the project tree from its canonical root, stopping at every kind of
 * nested project boundary, refusing every escape, and terminating on structure
 * rather than on trust.
 *
 * Reaching a bound is a reported condition carrying which bound was hit; it is
 * never a silently shortened result, because a truncated scan that looks
 * complete is a wrong answer that still looks like a decision.
 */
export async function scanProjectTree(
  root: CanonicalRoot,
  options: ScanProjectTreeOptions = {},
): Promise<ProjectTreeScan> {
  const maxDepth = options.maxDepth ?? MAX_SCAN_DEPTH;
  const maxEntries = options.maxEntries ?? MAX_SCAN_ENTRIES;

  const directories: string[] = [];
  const files: string[] = [];
  const excluded: ExcludedBoundary[] = [];
  const bounds: ScanBound[] = [];
  const visited = new Set<string>();
  let entriesSeen = 0;

  function noteBound(bound: ScanBoundName, limit: number, at: string): void {
    if (bounds.some((record) => record.bound === bound)) return;
    bounds.push({ bound, limit, at });
  }

  const declaredSubmodules = await readDeclaredSubmodulePaths(root.root, excluded);

  for (const key of await identityKeys(root.root, root.root)) visited.add(key);

  interface Frame {
    readonly absolute: string;
    /** Relative POSIX path; empty at the canonical root. */
    readonly relative: string;
    readonly depth: number;
    /** Ancestor chain of ignore rule sets, shallowest first. */
    readonly rules: readonly IgnoreRuleSet[];
  }

  const stack: Frame[] = [
    { absolute: root.root, relative: "", depth: 0, rules: [await loadIgnoreRules(root.root)] },
  ];

  while (stack.length > 0) {
    const frame = stack.pop() as Frame;

    let entries: Dirent[];
    try {
      entries = await readdir(frame.absolute, { withFileTypes: true });
    } catch (error) {
      excluded.push({ path: frame.relative, reason: "unreadable", detail: `readdir: code=${errnoOf(error)}` });
      continue;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));

    for (const entry of entries) {
      const relativePath = frame.relative.length === 0 ? entry.name : `${frame.relative}/${entry.name}`;

      if (entriesSeen >= maxEntries) {
        noteBound("MAX_SCAN_ENTRIES", maxEntries, relativePath);
        stack.length = 0;
        break;
      }
      entriesSeen += 1;

      // A `.git` entry is never scannable content, of either kind. Testing the
      // name here is what keeps the root's own `.git` out of the walk.
      if (entry.name === ".git") {
        excluded.push({ path: relativePath, reason: "git-entry", detail: "the entry is a git directory or pointer" });
        continue;
      }

      const absolute = join(frame.absolute, entry.name);

      // Proven BEFORE anything is stat-followed or read. A junction or symlink
      // resolving outside the canonical root is refused here, so the thing it
      // points at is never touched.
      const proof = await proveInsideRoot(root.root, absolute);
      if (!proof.proven) {
        excluded.push({ path: relativePath, reason: "outside-canonical-root", detail: proof.code });
        continue;
      }

      let isDirectory: boolean;
      if (entry.isDirectory()) {
        isDirectory = true;
      } else if (entry.isFile()) {
        isDirectory = false;
      } else {
        try {
          isDirectory = (await stat(absolute)).isDirectory();
        } catch (error) {
          excluded.push({ path: relativePath, reason: "unreadable", detail: `stat: code=${errnoOf(error)}` });
          continue;
        }
      }

      const verdict = isIgnored(relativePath, isDirectory, frame.rules);
      if (verdict.decision === "ignored") {
        excluded.push({ path: relativePath, reason: "ignored", detail: verdict.pattern });
        continue;
      }
      if (verdict.decision === "undecidable") {
        // Phase 1's D-01: a rule set we could not fully take on must never be
        // reported as "not ignored".
        excluded.push({ path: relativePath, reason: "undecidable", detail: verdict.pattern ?? "undecidable" });
        continue;
      }

      if (!isDirectory) {
        files.push(relativePath);
        continue;
      }

      // Existence of a `.git` entry is the primary, universal rule, so it is
      // asked first: an initialized submodule satisfies it AND the declaration
      // below, and `git-entry` is the more precise reason to report. The
      // declaration is the supplementary source that covers exactly what
      // existence misses — a submodule declared but not yet initialized.
      if (existsSync(join(absolute, ".git"))) {
        excluded.push({
          path: relativePath,
          reason: "git-entry",
          detail: "the directory holds a .git entry, so it is the root of another project",
        });
        continue;
      }
      if (declaredSubmodules.has(relativePath)) {
        excluded.push({
          path: relativePath,
          reason: "declared-submodule",
          detail: ".gitmodules at the canonical root declares this path",
        });
        continue;
      }
      if (VENDORED_BOUNDARY_DIRECTORIES.includes(entry.name)) {
        excluded.push({ path: relativePath, reason: "vendored-directory", detail: entry.name });
        continue;
      }

      const keys = await identityKeys(absolute, proof.canonical);
      if (keys.some((key) => visited.has(key))) {
        excluded.push({ path: relativePath, reason: "visited-identity", detail: "already visited in this walk" });
        continue;
      }
      for (const key of keys) visited.add(key);

      directories.push(relativePath);

      if (frame.depth + 1 > maxDepth) {
        noteBound("MAX_SCAN_DEPTH", maxDepth, relativePath);
        excluded.push({ path: relativePath, reason: "depth-bound", detail: `MAX_SCAN_DEPTH=${maxDepth}` });
        continue;
      }

      // A nested `.gitignore` wins for paths beneath it, so the rule set is
      // pushed onto the chain as the walk descends.
      stack.push({
        absolute,
        relative: relativePath,
        depth: frame.depth + 1,
        rules: [...frame.rules, await loadIgnoreRules(absolute)],
      });
    }
  }

  directories.sort();
  files.sort();
  excluded.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  return {
    root: root.root,
    paths: [...directories, ...files].sort(),
    directories,
    files,
    excludedBoundaries: excluded,
    bounds,
    entriesSeen,
  };
}

// ---------------------------------------------------------------------------
// Sub-project discovery — declaration first, scan as the safety net
// ---------------------------------------------------------------------------
//
// D-02's precedence rule: consult the ecosystem's own workspace declaration
// first, and let the scan be the safety net. Three researched facts shape this
// and are not optional details (02-RESEARCH.md §F-4):
//
//  1. **Globs, not literal paths.** Every declaration except `go.work` uses
//     globs, and pnpm supports NEGATED globs. Entries are expanded and then
//     boundary-proven; they are never treated as literal directories.
//     `go.work`'s `use` directive IS literal and explicitly does not include
//     subdirectories of its argument.
//  2. **Exclusions are normal, not errors.** Cargo has `exclude`, uv has
//     `exclude`, pnpm has `!`. A declaration that lists a member and then
//     excludes it is a correct declaration, so an excluded path is skipped
//     silently — and the fallback scan honours the same exclusion, or the
//     exclusion would be undone by the safety net.
//  3. **`go.work` is usually absent by design** — it is generally not
//     committed. For Go the scan is the primary path, not the exception.
//
// A declaration is ADDITIVE evidence, never a replacement for reality. Each
// declared member is verified to exist, to be inside the canonical root, to be
// reachable rather than behind a Task-2 boundary, and to carry a
// project-declaration file. A member failing any check is reported as one line
// with its reason and dropped, and the fallback scan STILL runs. That is what
// keeps the declaration in charge of ordering and naming while refusing to let
// a stale `workspaces` entry make a real sub-project invisible — and it closes
// the malicious case, because `["../../.."]` is boundary-proven BEFORE
// anything under it is read.

/** The files whose presence makes a directory a project in its own right. */
export const PROJECT_DECLARATION_FILES: readonly string[] = [
  "package.json",
  "pyproject.toml",
  "go.mod",
  "Cargo.toml",
];

/** 1 MiB. A declaration past this is refused rather than partially read. */
const DECLARATION_BYTE_CAP = 1048576;
/** `go.work` is a short file; its byte length is capped before reading. */
const GO_WORK_BYTE_CAP = 65536;
/** A declaration pattern longer than this is dropped rather than compiled. */
const MAX_GLOB_PATTERN_LENGTH = 512;

export type WorkspaceEcosystem = "npm" | "pnpm" | "cargo" | "go" | "uv";

export interface WorkspaceDeclaration {
  readonly ecosystem: WorkspaceEcosystem;
  /** Relative POSIX path of the file the declaration came from. */
  readonly source: string;
  /** Include entries in declaration order. Globs unless `literal`. */
  readonly members: readonly string[];
  /** Exclusion patterns: Cargo `exclude`, uv `exclude`, pnpm `!`. */
  readonly exclude: readonly string[];
  /**
   * Cargo `default-members`. Carried for reporting only: it narrows what Cargo
   * builds by default, not what the workspace contains, so membership stays
   * `members` minus `exclude`.
   */
  readonly defaultMembers: readonly string[];
  /** True only for `go.work`, whose `use` entries are literal directories. */
  readonly literal: boolean;
}

export interface DroppedMember {
  /** The declaration entry verbatim, as the user wrote it. */
  readonly declared: string;
  readonly ecosystem: WorkspaceEcosystem;
  readonly reason: string;
}

export interface SubProject {
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  /** Canonical absolute path. */
  readonly absolute: string;
  readonly name: string;
  /** Which declaration named it, or null when the fallback scan found it. */
  readonly declaredBy: WorkspaceEcosystem | null;
  /** The project-declaration file that proves it is a project. */
  readonly declarationFile: string;
}

export interface SubProjectDiscovery {
  readonly root: string;
  readonly declarations: readonly WorkspaceDeclaration[];
  readonly subProjects: readonly SubProject[];
  readonly dropped: readonly DroppedMember[];
  readonly bounds: readonly ScanBound[];
  readonly excludedBoundaries: readonly ExcludedBoundary[];
  /** The target the caller named, or null. This function never picks one. */
  readonly selected: SubProject | null;
}

/**
 * One read cache keyed by CANONICAL path, shared across sub-projects, so a
 * root `package.json` reached by three members is read once. Keying on the
 * canonical form is what makes two aliases of one file a single entry.
 */
export class ProjectReadCache {
  private readonly entries = new Map<string, string | null>();
  /** Reads served from memory. */
  hits = 0;
  /** Reads that went to disk. */
  reads = 0;

  async read(absolutePath: string): Promise<string | null> {
    const resolution = await canonicalizeWithMissingTail(resolve(absolutePath));
    const key = resolution.reason === null ? resolution.canonical : resolve(absolutePath);
    if (this.entries.has(key)) {
      this.hits += 1;
      return this.entries.get(key) ?? null;
    }
    this.reads += 1;
    let text: string | null = null;
    try {
      const info = await stat(absolutePath);
      if (info.isFile() && info.size <= DECLARATION_BYTE_CAP) text = await readFile(absolutePath, "utf8");
    } catch {
      text = null;
    }
    this.entries.set(key, text);
    return text;
  }

  get size(): number {
    return this.entries.size;
  }
}

export interface DiscoverSubProjectsOptions {
  /** A sub-project path relative to the canonical root. Never guessed. */
  readonly target?: string;
  /** A scan to reuse, so discovery and evidence collection walk once. */
  readonly scan?: ProjectTreeScan;
  readonly cache?: ProjectReadCache;
}

const GLOB_METACHARACTERS = /[*?[\]{}]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// Single-character sentinels for the three `**` positions, chosen so they
// cannot occur in a path segment.
const LEADING_GLOBSTAR = "\u0001";
const TRAILING_GLOBSTAR = "\u0002";
const INNER_GLOBSTAR = "\u0003";

/**
 * Compiles the bounded glob subset the five declarations actually use — `*`,
 * `?` and `**` — into a RegExp over relative POSIX paths. Character classes
 * and brace alternation are deliberately NOT supported and are matched
 * literally: no documented example in any of the five ecosystems uses them,
 * and quietly accepting a construct we match wrongly is worse than refusing.
 */
function globToRegExp(pattern: string): RegExp {
  let text = pattern.trim();
  while (text.startsWith("./")) text = text.slice(2);
  while (text.endsWith("/")) text = text.slice(0, -1);
  if (text.length === 0 || text === "**") return /^.*$/u;

  let marked = text;
  if (marked.startsWith("**/")) marked = LEADING_GLOBSTAR + marked.slice(3);
  if (marked.endsWith("/**")) marked = `${marked.slice(0, -3)}${TRAILING_GLOBSTAR}`;
  marked = marked.split("/**/").join(INNER_GLOBSTAR);

  let source = "";
  for (const character of marked) {
    switch (character) {
      case LEADING_GLOBSTAR:
        source += "(?:.*/)?";
        break;
      case TRAILING_GLOBSTAR:
        source += "(?:/.*)?";
        break;
      case INNER_GLOBSTAR:
        source += "/(?:.*/)?";
        break;
      case "*":
        source += "[^/]*";
        break;
      case "?":
        source += "[^/]";
        break;
      default:
        source += escapeRegExp(character);
    }
  }
  return new RegExp(`^${source}$`, "u");
}

function stringEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function branch(record: unknown, key: string): unknown {
  if (typeof record !== "object" || record === null || Array.isArray(record)) return undefined;
  return (record as Record<string, unknown>)[key];
}

function stripQuotes(value: string): string {
  const text = value.trim();
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1);
  }
  return text;
}

/**
 * `go.work`'s `use` block, read as bounded lines rather than parsed as a
 * grammar. Both the single-entry (`use ./svc`) and block forms are accepted;
 * a `//` comment is stripped.
 */
function parseGoWorkUse(text: string): string[] {
  const entries: string[] = [];
  let inBlock = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\/\/.*$/u, "").trim();
    if (line.length === 0) continue;
    if (inBlock) {
      if (line === ")") {
        inBlock = false;
        continue;
      }
      entries.push(stripQuotes(line));
      continue;
    }
    const single = /^use\b\s*(.*)$/u.exec(line);
    if (single === null) continue;
    const value = (single[1] ?? "").trim();
    if (value === "(" || value.length === 0) {
      inBlock = true;
      continue;
    }
    entries.push(stripQuotes(value));
  }
  return entries;
}

interface DeclarationRead {
  readonly declarations: readonly WorkspaceDeclaration[];
  readonly problems: readonly DroppedMember[];
}

interface DeclarationSource {
  readonly ecosystem: WorkspaceEcosystem;
  readonly file: string;
  readonly format: "json" | "yaml" | "toml" | "go-work";
}

// Deterministic order, so two runs against one repository report the same
// declarations in the same sequence.
const DECLARATION_SOURCES: readonly DeclarationSource[] = [
  { ecosystem: "npm", file: "package.json", format: "json" },
  { ecosystem: "pnpm", file: "pnpm-workspace.yaml", format: "yaml" },
  { ecosystem: "cargo", file: "Cargo.toml", format: "toml" },
  { ecosystem: "go", file: "go.work", format: "go-work" },
  { ecosystem: "uv", file: "pyproject.toml", format: "toml" },
];

function declarationFrom(
  source: DeclarationSource,
  document: unknown,
): { members: string[]; exclude: string[]; defaultMembers: string[] } | null {
  switch (source.ecosystem) {
    case "npm": {
      const workspaces = branch(document, "workspaces");
      // npm and bun accept an array; yarn also accepts { packages: [...] }.
      const entries = Array.isArray(workspaces) ? stringEntries(workspaces) : stringEntries(branch(workspaces, "packages"));
      if (entries.length === 0) return null;
      return splitNegated(entries);
    }
    case "pnpm": {
      const entries = stringEntries(branch(document, "packages"));
      if (entries.length === 0) return null;
      return splitNegated(entries);
    }
    case "cargo": {
      const workspace = branch(document, "workspace");
      if (workspace === undefined) return null;
      const members = stringEntries(branch(workspace, "members"));
      const exclude = stringEntries(branch(workspace, "exclude"));
      const defaultMembers = stringEntries(branch(workspace, "default-members"));
      if (members.length === 0 && exclude.length === 0) return null;
      return { members, exclude, defaultMembers };
    }
    case "uv": {
      const workspace = branch(branch(branch(document, "tool"), "uv"), "workspace");
      if (workspace === undefined) return null;
      const members = stringEntries(branch(workspace, "members"));
      const exclude = stringEntries(branch(workspace, "exclude"));
      if (members.length === 0 && exclude.length === 0) return null;
      return { members, exclude, defaultMembers: [] };
    }
    case "go":
      return null;
  }
}

/** pnpm expresses an exclusion as a leading `!` on the same list. */
function splitNegated(entries: readonly string[]): { members: string[]; exclude: string[]; defaultMembers: string[] } {
  const members: string[] = [];
  const exclude: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith("!")) exclude.push(entry.slice(1));
    else members.push(entry);
  }
  return { members, exclude, defaultMembers: [] };
}

async function readDeclarations(root: CanonicalRoot, cache: ProjectReadCache): Promise<DeclarationRead> {
  const declarations: WorkspaceDeclaration[] = [];
  const problems: DroppedMember[] = [];

  for (const source of DECLARATION_SOURCES) {
    const absolute = join(root.root, source.file);
    // Proven before read: a declaration file that is a link to somewhere else
    // is not this project's declaration.
    const proof = await proveInsideRoot(root.root, absolute);
    if (!proof.proven) {
      problems.push({
        declared: source.file,
        ecosystem: source.ecosystem,
        reason: `the declaration file resolves outside the canonical root (${proof.code})`,
      });
      continue;
    }

    if (source.format === "go-work") {
      let info: Stats;
      try {
        info = await stat(absolute);
      } catch {
        continue;
      }
      if (!info.isFile()) continue;
      if (info.size > GO_WORK_BYTE_CAP) {
        problems.push({
          declared: source.file,
          ecosystem: source.ecosystem,
          reason: `go.work exceeds the byte cap (cap=${GO_WORK_BYTE_CAP})`,
        });
        continue;
      }
      const text = await cache.read(absolute);
      if (text === null) continue;
      const members = parseGoWorkUse(text);
      if (members.length === 0) continue;
      declarations.push({
        ecosystem: source.ecosystem,
        source: source.file,
        members,
        exclude: [],
        defaultMembers: [],
        literal: true,
      });
      continue;
    }

    const text = await cache.read(absolute);
    if (text === null) continue;
    const parsed = parseManagedDocument({ text, format: source.format });
    if (!parsed.ok) {
      // Shape only — the document is repository content.
      problems.push({
        declared: source.file,
        ecosystem: source.ecosystem,
        reason: `the declaration file is not an unambiguous document (${parsed.issues[0]?.code ?? "syntax.malformed"})`,
      });
      continue;
    }
    const extracted = declarationFrom(source, parsed.value);
    if (extracted === null) continue;
    declarations.push({
      ecosystem: source.ecosystem,
      source: source.file,
      members: extracted.members,
      exclude: extracted.exclude,
      defaultMembers: extracted.defaultMembers,
      literal: false,
    });
  }

  return { declarations, problems };
}

/**
 * Every workspace declaration present at the canonical root, in a fixed
 * ecosystem order. Several may coexist — a pnpm monorepo carries both a
 * `package.json` and a `pnpm-workspace.yaml` — and all of them are reported.
 */
export async function readWorkspaceDeclaration(
  root: CanonicalRoot,
  options: { readonly cache?: ProjectReadCache } = {},
): Promise<readonly WorkspaceDeclaration[]> {
  const cache = options.cache ?? new ProjectReadCache();
  return (await readDeclarations(root, cache)).declarations;
}

/** The project-declaration file inside a directory, read through the cache. */
async function declarationFileIn(directory: string, cache: ProjectReadCache): Promise<string | null> {
  for (const candidate of PROJECT_DECLARATION_FILES) {
    if (!existsSync(join(directory, candidate))) continue;
    const text = await cache.read(join(directory, candidate));
    if (text !== null) return candidate;
  }
  return null;
}

/**
 * Discovers the sub-projects beneath a canonical root. It returns the list; it
 * never picks one. D-01: the user names the target, the tool does not guess.
 */
export async function discoverSubProjects(
  root: CanonicalRoot,
  options: DiscoverSubProjectsOptions = {},
): Promise<SubProjectDiscovery> {
  const cache = options.cache ?? new ProjectReadCache();
  const scan = options.scan ?? (await scanProjectTree(root));
  const { declarations, problems } = await readDeclarations(root, cache);

  const dropped: DroppedMember[] = [...problems];
  const bounds: ScanBound[] = [...scan.bounds];
  const accepted: SubProject[] = [];
  const acceptedPaths = new Set<string>();

  const scannable = new Set(scan.directories);
  const excludeMatchers = declarations.flatMap((declaration) =>
    declaration.exclude
      .filter((pattern) => pattern.length <= MAX_GLOB_PATTERN_LENGTH)
      .map((pattern) => globToRegExp(pattern)),
  );

  function boundedOut(): boolean {
    if (accepted.length < MAX_SUB_PROJECTS) return false;
    if (!bounds.some((record) => record.bound === "MAX_SUB_PROJECTS")) {
      bounds.push({ bound: "MAX_SUB_PROJECTS", limit: MAX_SUB_PROJECTS, at: accepted[accepted.length - 1]?.path ?? "" });
    }
    return true;
  }

  function underAccepted(candidate: string): boolean {
    return accepted.some((member) => candidate === member.path || candidate.startsWith(`${member.path}/`));
  }

  /** Why a scannable path is not scannable, in the walk's own words. */
  function boundaryReasonFor(candidate: string): string | null {
    for (const boundary of scan.excludedBoundaries) {
      if (candidate === boundary.path || candidate.startsWith(`${boundary.path}/`)) {
        return `${boundary.reason}${boundary.detail === null ? "" : ` (${boundary.detail})`}`;
      }
    }
    return null;
  }

  async function acceptCandidate(
    candidate: string,
    ecosystem: WorkspaceEcosystem | null,
  ): Promise<{ accepted: boolean; reason: string | null }> {
    if (acceptedPaths.has(candidate) || underAccepted(candidate)) return { accepted: false, reason: null };
    if (excludeMatchers.some((matcher) => matcher.test(candidate))) return { accepted: false, reason: null };
    const absolute = join(root.root, ...candidate.split("/"));
    const declarationFile = await declarationFileIn(absolute, cache);
    if (declarationFile === null) {
      return { accepted: false, reason: "the directory contains no project-declaration file" };
    }
    if (boundedOut()) return { accepted: false, reason: `MAX_SUB_PROJECTS=${MAX_SUB_PROJECTS} was reached` };
    accepted.push({
      path: candidate,
      absolute,
      // The path is the name a user typed and the name `--project` accepts.
      name: candidate.split("/").pop() ?? candidate,
      declaredBy: ecosystem,
      declarationFile,
    });
    acceptedPaths.add(candidate);
    return { accepted: true, reason: null };
  }

  // ---- Declaration first: it decides ordering and naming ------------------
  for (const declaration of declarations) {
    for (const entry of declaration.members) {
      if (entry.length > MAX_GLOB_PATTERN_LENGTH) {
        dropped.push({
          declared: `${entry.slice(0, 32)}…`,
          ecosystem: declaration.ecosystem,
          reason: `the entry exceeds the pattern length cap (length=${entry.length}, cap=${MAX_GLOB_PATTERN_LENGTH})`,
        });
        continue;
      }

      const isGlob = !declaration.literal && GLOB_METACHARACTERS.test(entry);
      if (isGlob) {
        const matcher = globToRegExp(entry);
        const matches = scan.directories.filter((directory) => matcher.test(directory));
        if (matches.length === 0) {
          dropped.push({
            declared: entry,
            ecosystem: declaration.ecosystem,
            reason: "the pattern matched no scannable directory inside the canonical root",
          });
          continue;
        }
        for (const match of matches) {
          const outcome = await acceptCandidate(match, declaration.ecosystem);
          if (!outcome.accepted && outcome.reason !== null) {
            dropped.push({ declared: match, ecosystem: declaration.ecosystem, reason: outcome.reason });
          }
        }
        continue;
      }

      // Literal entry. `resolve` is what makes `../../..` an absolute path
      // that the boundary proof can refuse BEFORE anything under it is read.
      const literal = stripQuotes(entry).split("\\").join("/");
      const absolute = resolve(root.root, literal);
      const proof = await proveInsideRoot(root.root, absolute);
      if (!proof.proven) {
        dropped.push({
          declared: entry,
          ecosystem: declaration.ecosystem,
          reason: `the entry resolves outside the canonical root (${proof.code})`,
        });
        continue;
      }
      const candidate = toPosixPath(relative(root.root, absolute));
      if (candidate.length === 0) {
        dropped.push({
          declared: entry,
          ecosystem: declaration.ecosystem,
          reason: "the entry names the canonical root itself, which is not a sub-project",
        });
        continue;
      }
      if (!scannable.has(candidate)) {
        const boundary = boundaryReasonFor(candidate);
        dropped.push({
          declared: entry,
          ecosystem: declaration.ecosystem,
          reason:
            boundary !== null
              ? `the entry sits behind a boundary: ${boundary}`
              : "the entry does not exist as a scannable directory inside the canonical root",
        });
        continue;
      }
      const outcome = await acceptCandidate(candidate, declaration.ecosystem);
      if (!outcome.accepted && outcome.reason !== null) {
        dropped.push({ declared: entry, ecosystem: declaration.ecosystem, reason: outcome.reason });
      }
    }
  }

  // ---- Fallback scan: a stale declaration cannot hide a real sub-project ---
  //
  // It runs even when a declaration exists. What it must NOT do is undo an
  // explicit exclusion, which is why `acceptCandidate` applies the same
  // exclusion matchers; and it does not descend into an accepted sub-project,
  // so a nested project belongs to its parent rather than to the root.
  for (const directory of scan.directories) {
    await acceptCandidate(directory, null);
  }

  // ---- Targeting: named, never guessed (D-01) -----------------------------
  let selected: SubProject | null = null;
  if (options.target !== undefined && options.target.trim().length > 0) {
    const requested = options.target.trim();
    const absolute = resolve(root.root, requested);
    const proof = await proveInsideRoot(root.root, absolute);
    if (!proof.proven) {
      throw new Error(
        `project target "${requested}" resolves outside the canonical root (${proof.code}). ` +
          `Discovered sub-projects: ${accepted.map((member) => member.path).join(", ") || "none"}`,
      );
    }
    const wanted = toPosixPath(relative(root.root, absolute));
    const match = accepted.find((member) => member.path === wanted);
    if (match === undefined) {
      throw new Error(
        `project target "${requested}" is not one of the discovered sub-projects. ` +
          `Discovered sub-projects: ${accepted.map((member) => member.path).join(", ") || "none"}`,
      );
    }
    selected = match;
  }

  return {
    root: root.root,
    declarations,
    subProjects: accepted,
    dropped,
    bounds,
    excludedBoundaries: scan.excludedBoundaries,
    selected,
  };
}

// ---------------------------------------------------------------------------
// Fact detection — six kinds, five manifest readers
// ---------------------------------------------------------------------------
//
// Detector KINDS are code; detector INSTANCES are data. That split is what
// makes D-05 ("adding a pack is a YAML edit") true for the facts a pack names
// as well as for the pack itself: every parameter below arrives from
// `catalog/facts.yaml` through `loadFactVocabularyStrict`, never from a
// TypeScript literal.
//
// Three rules hold across every detector here:
//   1. Every read is boundary-proven against the canonical root and byte-capped
//      by a NAMED constant, so a reported refusal always names what refused.
//   2. Absence and unreadability are different facts. ENOENT is an absence; any
//      other errno is UNDECIDABLE and carries the errno and the path. This is
//      the precedent plan 01-19 set one layer down, reused rather than
//      reinvented, so the codebase tells one story about unreadable paths.
//   3. The `fileContent` detector cannot represent what it matched. The value
//      is unrepresentable, not merely redacted — `redactString` is the SECOND
//      net — because a DSN carrying credentials must not be capturable at all
//      when the artifact lands under `.alpha-aos/` for a team to commit.

/** 1 MiB. An evidence file past this is refused rather than partially read. */
export const MAX_EVIDENCE_FILE_BYTES = 1048576;

/**
 * 256 KiB of a file is offered to a declared pattern. Applied as a code-unit
 * cap, which for UTF-8 text is never more than the byte length. Every pattern
 * comes from the repository-owned `catalog/facts.yaml`, but the INPUT is
 * attacker-controlled, so match cost is bounded on the input side.
 */
export const MAX_CONTENT_MATCH_BYTES = 262144;

/** Files one `fileContent` fact will open before it reports a bound. */
export const MAX_CONTENT_FILES = 128;

/** One file a detector actually read. Plan 02-08 digests this list. */
export interface ReadInput {
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  /** sha256 of the bytes read. */
  readonly hash: string;
}

/**
 * An evidence path that could be neither confirmed nor denied. `errno` carries
 * the filesystem errno for a read failure, or a stable validation code for a
 * document that exists and is readable but is not unambiguously parseable.
 */
export interface UndecidableEvidence {
  readonly path: string;
  readonly errno: string;
}

/** What one detector concluded about one declared fact. */
export interface FactDetection {
  readonly id: string;
  readonly kind: DetectorKind;
  readonly detected: boolean;
  /** Which declared alternative answered, or the manifest that declared it. */
  readonly path: string | null;
  readonly version: string | null;
  /** Always populated on a negative detection. */
  readonly reason: string | null;
  readonly undecidable: UndecidableEvidence | null;
}

/**
 * The `fileContent` detector's ENTIRE vocabulary. There is deliberately no
 * text field: making the matched value unrepresentable is the first net
 * against 02-RESEARCH.md Pitfall 7.
 */
export interface ContentMatch {
  readonly matched: boolean;
  readonly path: string;
}

/** One package name as some manifest declared it. */
export interface DeclaredDependency {
  readonly name: string;
  /** Relative POSIX path of the manifest that declared it. */
  readonly path: string;
  /** The declared range, verbatim. Null when the manifest declared none. */
  readonly version: string | null;
}

export interface DeclaredDependencies {
  /** Keyed by declared name and, for Python, by its PEP 503 normalized form. */
  readonly byName: ReadonlyMap<string, DeclaredDependency>;
  /** Manifests that exist but could not be read or unambiguously parsed. */
  readonly undecidable: readonly UndecidableEvidence[];
  /** Manifests refused by a named byte cap, each carrying the cap. */
  readonly bounded: readonly string[];
}

/** What `manifestKey` detectors read, once, for the whole vocabulary. */
export interface ManifestEvidence {
  readonly present: boolean;
  readonly current: boolean;
  readonly value: ProjectStackManifest | null;
  readonly schemaVersion: string | null;
  readonly reason: string | null;
  readonly undecidable: UndecidableEvidence | null;
}

/** Everything the six detectors share, read once per project. */
export interface DetectionContext {
  readonly root: CanonicalRoot;
  /** Every scannable path — the ignore list and boundary walk already applied. */
  readonly paths: ReadonlySet<string>;
  readonly files: ReadonlySet<string>;
  readonly directories: ReadonlySet<string>;
  /** `scan.files` in its sorted order, so content expansion is total-ordered. */
  readonly sortedFiles: readonly string[];
  readonly dependencies: DeclaredDependencies;
  readonly manifest: ManifestEvidence;
  readonly ledger: ReadLedger;
}

export interface EvidenceDetection {
  readonly detections: readonly FactDetection[];
  readonly readInputs: readonly ReadInput[];
}

/** The envelope plus everything the pack evaluator needs alongside it. */
export interface ProjectEvidence {
  readonly envelope: EvidenceEnvelope;
  readonly scan: ProjectTreeScan;
  readonly detections: readonly FactDetection[];
  readonly dependencies: DeclaredDependencies;
  readonly readInputs: readonly ReadInput[];
}

export interface CollectEvidenceOptions {
  /** The alpha-AOS package root that owns `catalog/facts.yaml`. */
  readonly packageRoot?: string;
}

export function matchDeclaredContent(path: string, text: string, patterns: readonly RegExp[]): ContentMatch {
  throw new Error(`matchDeclaredContent is not implemented (${path}, ${text.length}, ${patterns.length})`);
}

export function inputsDigest(inputs: readonly ReadInput[]): string {
  throw new Error(`inputsDigest is not implemented (${inputs.length})`);
}

export function lookupDependency(dependencies: DeclaredDependencies, name: string): DeclaredDependency | null {
  throw new Error(`lookupDependency is not implemented (${dependencies.byName.size}, ${name})`);
}

export async function readDeclaredDependencies(
  root: CanonicalRoot,
  scan: ProjectTreeScan,
  ledger: ReadLedger,
): Promise<DeclaredDependencies> {
  throw new Error(`readDeclaredDependencies is not implemented (${root.root}, ${scan.files.length}, ${ledger.size})`);
}

export async function openDetectionContext(root: CanonicalRoot, scan: ProjectTreeScan): Promise<DetectionContext> {
  throw new Error(`openDetectionContext is not implemented (${root.root}, ${scan.paths.length})`);
}

export async function detectFact(context: DetectionContext, declaration: FactDeclaration): Promise<FactDetection> {
  throw new Error(`detectFact is not implemented (${context.root.root}, ${declaration.id})`);
}

export async function detectProjectFacts(
  root: CanonicalRoot,
  scan: ProjectTreeScan,
  vocabulary: FactVocabulary,
): Promise<EvidenceDetection> {
  throw new Error(
    `detectProjectFacts is not implemented (${root.root}, ${scan.paths.length}, ${vocabulary.facts.length})`,
  );
}

export function digestableEvidence(envelope: EvidenceEnvelope): unknown {
  throw new Error(`digestableEvidence is not implemented (${envelope.facts.length})`);
}

export async function buildEvidenceEnvelope(
  root: CanonicalRoot,
  vocabulary: FactVocabulary,
  detected: EvidenceDetection,
): Promise<EvidenceEnvelope> {
  throw new Error(
    `buildEvidenceEnvelope is not implemented (${root.root}, ${vocabulary.facts.length}, ${detected.detections.length})`,
  );
}

export async function collectProjectEvidenceDetail(
  root: CanonicalRoot,
  options: CollectEvidenceOptions = {},
): Promise<ProjectEvidence> {
  throw new Error(`collectProjectEvidenceDetail is not implemented (${root.root}, ${options.packageRoot ?? "-"})`);
}
