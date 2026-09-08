import { createHash } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { existsSync } from "node:fs";
import { lstat, readdir, readFile, stat } from "node:fs/promises";
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
 * Which rung of the root ladder answered, highest priority first. Recording the
 * path alone loses the reason, and the reason is what a reviewer needs to judge
 * the scope.
 *
 * Every member here is a value `resolveCanonicalRoot` actually produces. The
 * union is DIGESTED — `scope.rootReason` folds into `planDigest`, and D-10 puts
 * an approved plan under `.alpha-aos/` for a team to commit — so a declared but
 * unreachable member is a promise in a contract that nothing keeps (02-REVIEW
 * WR-11). `worktree-root` and `submodule-root` were exactly that and are gone:
 * `isGitBoundary` tests for the EXISTENCE of a `.git` entry, which matches the
 * `.git` FILE a linked worktree and a submodule each carry, so both already
 * stop the climb and are already reported — as `git-root`, which is what they
 * behaviourally are.
 */
export type RootReason =
  /** The caller named this root. Never inferred. */
  | "explicit-override"
  /** A project-declaration file marks this directory (D-01). */
  | "project-declaration"
  /** A `.git` entry marks this directory, of either kind. */
  | "git-root"
  /** Neither a declaration nor a git entry anywhere above. */
  | "standalone-directory";

/**
 * How a pinned root was arrived at, when the caller pins one.
 *
 * `"caller"` is a root a human typed and reports `explicit-override`.
 * `"descent"` is a root the planner descended into and reports
 * `project-declaration` — a discovered sub-project is a project because it
 * carries a declaration file, and reporting it as `explicit-override` would
 * make a root the tool chose indistinguishable in the plan from a root the user
 * chose.
 */
export type RootPin = "caller" | "descent";

export interface CanonicalRoot {
  /** Canonical form, native separators. The one form every later step uses. */
  root: string;
  reason: RootReason;
  /** 16 hex, derived from `root` by `isolationProjectId`. */
  projectId: string;
}

/**
 * Every digest input in this module is text, and the encoding is stated rather
 * than defaulted: a relative path carrying non-ASCII characters must hash the
 * same bytes on every host, and `update(string)` inheriting whatever the
 * default happens to be is precisely how that stops being true.
 */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
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
 * A directory carrying one of the files that make a directory a project in its
 * own right. The list is `PROJECT_DECLARATION_FILES`, reused rather than
 * restated: two lists would be two answers to "is this a project?", and the
 * sub-project discovery below already owns one.
 */
function isProjectDeclarationBoundary(directory: string): boolean {
  return PROJECT_DECLARATION_FILES.some((name) => existsSync(join(directory, name)));
}

/**
 * Resolves the project root through one ordered ladder and records which rung
 * answered. `isolationProjectId` is fed the already-canonical value on
 * purpose: `resolve()` in its body does not follow links, so only a canonical
 * input makes it an identity function and gives one repository one id however
 * it was addressed. That function is reused unchanged — its output names
 * existing runtime roots under `~/.alpha-aos/`.
 *
 * The shipped ladder, highest priority first, is exactly the shipped
 * `RootReason` union:
 *
 *  1. `explicit-override` — a root the caller pinned with `pin: "caller"`.
 *  2. `project-declaration` — a pinned descent, or the first ancestor
 *     deepest-first carrying a project-declaration file. This is what makes
 *     D-01's "running inside a sub-project targets that sub-project" true.
 *  3. `git-root` — the first ancestor deepest-first carrying a `.git` entry of
 *     either kind. A linked worktree and a submodule both carry a `.git` FILE,
 *     so both answer here; that is why no separate rung exists for them.
 *  4. `standalone-directory` — neither, anywhere above.
 *
 * Rungs 2 and 3 are ONE walk, not two. Two walks would let a repository whose
 * root carries no declaration file climb PAST its own `.git` boundary and adopt
 * an unrelated `package.json` in a parent directory — the ladder must never be
 * able to leave the repository it started inside, so a git boundary stops the
 * climb even when it does not answer.
 */
export async function resolveCanonicalRoot(
  inputPath: string,
  explicit?: string,
  pin: RootPin = "caller",
): Promise<CanonicalRoot> {
  if (explicit !== undefined && explicit.trim().length > 0) {
    const root = await canonicalize(explicit);
    const reason: RootReason = pin === "descent" ? "project-declaration" : "explicit-override";
    return { root, reason, projectId: isolationProjectId(root) };
  }

  const start = await canonicalize(inputPath);
  for (const ancestor of ancestorsDeepestFirst(start)) {
    const declares = isProjectDeclarationBoundary(ancestor);
    const gitBoundary = isGitBoundary(ancestor);
    if (!declares && !gitBoundary) continue;
    const root = await canonicalize(ancestor);
    // A declaration outranks a git entry AT THE SAME DIRECTORY, and a git entry
    // ends the walk whether or not it answered.
    const reason: RootReason = declares ? "project-declaration" : "git-root";
    return { root, reason, projectId: isolationProjectId(root) };
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
  /**
   * The entry resolves to a path other than the one the walk joined — a
   * symlink, a junction or any other reparse point. An alias is refused
   * whatever it points at, including a target inside the canonical root, so
   * that adding a link inside a repository can change neither the collected
   * fact set nor the pack selection (T-02-41).
   */
  | "alias-entry"
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
export function normalizeRelativePosix(value: string): string | null {
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
 * Two keys, because neither alone terminates every cycle. The entry's OWN
 * identity is read with `lstat`, so a link contributes the LINK's identity and
 * a chain through one link repeats it and stops; but two distinct links onto
 * the same real directory have distinct link identities. The canonical path
 * from the boundary proof closes that case, and catches `loop -> .` on the
 * first encounter. A host that reports inode `0` (some Windows filesystems)
 * still has the canonical key.
 *
 * `isAlias` is what stops an alias impersonating its target. An alias
 * contributes ONLY its own `link:` key and never the canonical `path:` key,
 * because contributing the canonical key is exactly how a junction listed
 * before its target claimed that target's identity and evicted the real
 * directory from the walk (CR-02). Cycle termination is unaffected: a walk that
 * goes through the same link twice still meets the same `link:` key.
 */
async function identityKeys(absolutePath: string, canonicalPath: string, isAlias: boolean): Promise<string[]> {
  const keys = isAlias ? [] : [`path:${canonicalPath}`];
  try {
    const own = await lstat(absolutePath);
    if (own.ino !== 0) keys.push(`${isAlias ? "link" : "identity"}:${own.dev}:${own.ino}`);
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

  // The root is addressed by its canonical form, so it is never an alias.
  for (const key of await identityKeys(root.root, root.root, false)) visited.add(key);

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

      // An entry whose canonical form is not the path the walk joined is an
      // ALIAS — a symlink, a junction, or any other reparse point — and it is
      // refused here, before any identity is marked and for files as well as
      // directories.
      //
      // Refused unconditionally, including when the target is inside the
      // canonical root, because the stated truth is that adding a link changes
      // neither the fact set nor the pack selection. The rejected alternative
      // was to admit an alias whose target the walk did not otherwise reach;
      // that preserves more behaviour for a repository whose real source
      // directory IS a link, but it makes the outcome depend on traversal
      // order and it leaves a repository able to add evidence to itself by
      // adding a link. Only unconditional exclusion delivers the truth without
      // a tie-break rule.
      //
      // Before identity marking, and never contributing the canonical key: an
      // alias listed before its target used to claim that target's identity, so
      // the real directory was then dropped as already-visited and every
      // `kind: directory` fact answered negatively with a reason stating that a
      // demonstrably present directory did not exist (CR-02).
      if (proof.canonical !== absolute) {
        excluded.push({
          path: relativePath,
          reason: "alias-entry",
          detail: `the entry resolves to ${toPosixPath(relative(root.root, proof.canonical))}, so it is an alias rather than content`,
        });
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

      const keys = await identityKeys(absolute, proof.canonical, false);
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
  /** The inline-literal resolution surface for `anyDependencies` predicates. */
  readonly dependencies: DeclaredDependencies;
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

// --- bounded, boundary-proven reads ---------------------------------------

type EvidenceRead =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "missing" }
  | { readonly kind: "over-cap"; readonly cap: number }
  | { readonly kind: "unreadable"; readonly errno: string };

/**
 * Reads one declared evidence path. Nothing is read before the boundary proof,
 * and nothing over `cap` is read at all.
 *
 * ENOENT is `missing` and every other errno is `unreadable` — the distinction
 * plan 01-19 drew one layer down, reused rather than reinvented. A directory
 * bearing a file's name is `EISDIR`: it exists, and it is not readable as the
 * document the declaration named, which is a different fact from absence.
 */
async function readEvidenceFile(root: string, relativePosixPath: string, cap: number): Promise<EvidenceRead> {
  const absolute = join(root, ...relativePosixPath.split("/"));
  const proof = await proveInsideRoot(root, absolute);
  if (!proof.proven) return { kind: "unreadable", errno: proof.code };

  let info: Stats;
  try {
    info = await stat(absolute);
  } catch (error) {
    const errno = errnoOf(error);
    return errno === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", errno };
  }
  if (info.isDirectory()) return { kind: "unreadable", errno: "EISDIR" };
  if (!info.isFile()) return { kind: "unreadable", errno: "ENOTFILE" };
  if (info.size > cap) return { kind: "over-cap", cap };

  try {
    return { kind: "text", text: await readFile(absolute, "utf8") };
  } catch (error) {
    const errno = errnoOf(error);
    return errno === "ENOENT" ? { kind: "missing" } : { kind: "unreadable", errno };
  }
}

/** Lines of a manifest, bounded. The file is byte-capped; this bounds the count. */
const MAX_MANIFEST_LINES = 20000;

function boundedLines(text: string): string[] {
  return text.split(/\r?\n/u).slice(0, MAX_MANIFEST_LINES);
}

// --- the five dependency manifest readers ---------------------------------

/**
 * Read in one fixed order, so a package declared twice always resolves to the
 * same manifest. First declaration wins.
 */
const DEPENDENCY_MANIFESTS = ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml"] as const;

/** A package name longer than this is not a name; it is an attempt at something. */
const MAX_DEPENDENCY_NAME_LENGTH = 256;

/** PEP 503 normalization. Applied to Python names only — npm and Go are literal. */
function pep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/gu, "-");
}

function addDependency(
  index: Map<string, DeclaredDependency>,
  entry: DeclaredDependency,
  aliasNormalized: boolean,
): void {
  if (entry.name.length === 0 || entry.name.length > MAX_DEPENDENCY_NAME_LENGTH) return;
  if (!index.has(entry.name)) index.set(entry.name, entry);
  if (!aliasNormalized) return;
  const normalized = pep503(entry.name);
  if (normalized !== entry.name && !index.has(normalized)) index.set(normalized, entry);
}

/**
 * A PEP 508 requirement reduced to the two things a fact records: the name and
 * the declared range. A direct reference (`pkg @ https://...`) declares no
 * range, so it records none rather than recording a URL that may carry
 * credentials.
 */
const PEP508 = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/u;

function parseRequirement(entry: string): { name: string; version: string | null } | null {
  const withoutMarker = entry.split(";")[0] ?? "";
  const withoutComment = withoutMarker.split(" #")[0] ?? withoutMarker;
  const text = withoutComment.trim();
  if (text.length === 0) return null;
  const match = PEP508.exec(text);
  if (match === null) return null;
  const rest = (match[2] ?? "").trim();
  return { name: match[1] as string, version: rest.length === 0 || rest.startsWith("@") ? null : rest };
}

function readPackageJson(manifest: unknown, path: string, index: Map<string, DeclaredDependency>): void {
  const record = manifest as Record<string, unknown>;
  for (const section of DEPENDENCY_SECTIONS) {
    for (const declared of declaredPackages(record[section])) {
      addDependency(index, { name: declared.name, path, version: declared.range }, false);
    }
  }
}

/** A TOML dependency table entry: `name = "1.0"` or `name = { version = "1.0" }`. */
function tableDependencies(section: unknown): Array<{ name: string; range: string | null }> {
  if (typeof section !== "object" || section === null || Array.isArray(section)) return [];
  const safe = Object.assign(Object.create(null) as Record<string, unknown>, section);
  return Object.keys(safe).map((name) => {
    const value = safe[name];
    if (typeof value === "string") return { name, range: value.length > 0 ? value : null };
    const nested = branch(value, "version");
    return { name, range: typeof nested === "string" && nested.length > 0 ? nested : null };
  });
}

function readPyproject(manifest: unknown, path: string, index: Map<string, DeclaredDependency>): void {
  for (const entry of stringEntries(branch(branch(manifest, "project"), "dependencies"))) {
    const parsed = parseRequirement(entry);
    if (parsed !== null) addDependency(index, { name: parsed.name, path, version: parsed.version }, true);
  }
  for (const declared of tableDependencies(branch(branch(branch(manifest, "tool"), "poetry"), "dependencies"))) {
    addDependency(index, { name: declared.name, path, version: declared.range }, true);
  }
  const groups = branch(manifest, "dependency-groups");
  if (typeof groups === "object" && groups !== null && !Array.isArray(groups)) {
    const safe = Object.assign(Object.create(null) as Record<string, unknown>, groups);
    for (const group of Object.keys(safe).sort()) {
      for (const entry of stringEntries(safe[group])) {
        const parsed = parseRequirement(entry);
        if (parsed !== null) addDependency(index, { name: parsed.name, path, version: parsed.version }, true);
      }
    }
  }
}

const CARGO_SECTIONS = ["dependencies", "dev-dependencies", "build-dependencies"] as const;

function readCargoToml(manifest: unknown, path: string, index: Map<string, DeclaredDependency>): void {
  for (const section of CARGO_SECTIONS) {
    for (const declared of tableDependencies(branch(manifest, section))) {
      addDependency(index, { name: declared.name, path, version: declared.range }, false);
    }
  }
}

function addGoRequire(line: string, path: string, index: Map<string, DeclaredDependency>): void {
  const parts = line.split(/\s+/u).filter((part) => part.length > 0);
  const name = parts[0];
  if (name === undefined || name === "(" || name === ")") return;
  addDependency(index, { name, path, version: parts[1] ?? null }, false);
}

/**
 * `go.mod` is the one manifest with no parser in the dependency set, so it gets
 * a small bounded line reader rather than a new dependency. Both require forms
 * are read: the parenthesized block and the single-line `require path version`.
 */
function readGoMod(text: string, path: string, index: Map<string, DeclaredDependency>): void {
  let inRequireBlock = false;
  for (const rawLine of boundedLines(text)) {
    const line = (rawLine.split("//")[0] ?? "").trim();
    if (line.length === 0) continue;
    if (inRequireBlock) {
      if (line === ")") inRequireBlock = false;
      else addGoRequire(line, path, index);
      continue;
    }
    if (/^require\s*\($/u.test(line)) {
      inRequireBlock = true;
      continue;
    }
    if (/^require\s+\S/u.test(line)) addGoRequire(line.replace(/^require\s+/u, ""), path, index);
  }
}

function readRequirementsTxt(text: string, path: string, index: Map<string, DeclaredDependency>): void {
  for (const rawLine of boundedLines(text)) {
    const line = rawLine.trim();
    // `-r`, `-e`, `--index-url` are options, not requirements, and a referenced
    // file is NOT followed: only paths this walk proved are ever read.
    if (line.length === 0 || line.startsWith("#") || line.startsWith("-")) continue;
    const parsed = parseRequirement(line);
    if (parsed !== null) addDependency(index, { name: parsed.name, path, version: parsed.version }, true);
  }
}

/** Returns a stable code when the manifest exists but is not unambiguously parseable. */
function ingestManifest(manifest: string, text: string, index: Map<string, DeclaredDependency>): string | null {
  if (manifest === "requirements.txt") {
    readRequirementsTxt(text, manifest, index);
    return null;
  }
  if (manifest === "go.mod") {
    readGoMod(text, manifest, index);
    return null;
  }

  // The strict route, so a document declaring one package twice is refused
  // rather than silently resolved to whichever value happened to come last.
  const parsed = parseManagedDocument({ text, format: manifest === "package.json" ? "json" : "toml" });
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
    return parsed.issues[0]?.code ?? "syntax.malformed";
  }
  if (manifest === "package.json") readPackageJson(parsed.value, manifest, index);
  else if (manifest === "pyproject.toml") readPyproject(parsed.value, manifest, index);
  else readCargoToml(parsed.value, manifest, index);
  return null;
}

// --- the project manifest, read once --------------------------------------

export const PROJECT_MANIFEST_PATH = ".alpha-aos/stack.yaml";

/**
 * The one prefix that marks a negative record as "could not be decided" rather
 * than "is absent". A reader that wants the distinction matches on this and on
 * `parseUndecidableReason` below, so the sentence has exactly one producer and
 * exactly one parser and the two cannot drift apart.
 */
export const UNDECIDABLE_REASON_PREFIX = "UNDECIDABLE: ";

/** Matches whatever `undecidableReason` writes, and nothing else. */
const UNDECIDABLE_REASON_PATTERN = /^UNDECIDABLE: (.+?) exists but could not be read as declared \(errno=([^)]*)\)/u;

function undecidableReason(evidence: UndecidableEvidence): string {
  return `${UNDECIDABLE_REASON_PREFIX}${evidence.path} exists but could not be read as declared (errno=${evidence.errno})`;
}

/**
 * Reads back the path and errno an undecidable record carries.
 *
 * The envelope's `EvidenceFact` is a closed schema shape with no structured
 * `undecidable` field — only `reason` survives into it — so a consumer one
 * layer up recovers the two values from the sentence. Recovering them HERE,
 * beside the producer, is what keeps "unreadable" from being re-derived by a
 * regex written somewhere else against a sentence this module owns.
 *
 * Returns null for an absent, empty or differently-shaped reason: a caller that
 * cannot parse one must treat the record as an ordinary absence, never guess.
 */
export function parseUndecidableReason(reason: string | null | undefined): UndecidableEvidence | null {
  if (typeof reason !== "string") return null;
  const match = UNDECIDABLE_REASON_PATTERN.exec(reason);
  if (match === null) return null;
  const [, path, errno] = match;
  if (path === undefined || errno === undefined || path.length === 0) return null;
  return { path, errno };
}

/**
 * The project manifest is the user's own opt-in, not scanned repository
 * evidence, so it is read directly rather than through the scan's ignore
 * decision — `.alpha-aos/` is routinely gitignored and an opt-in a user wrote
 * on purpose must not vanish because of that.
 */
async function readManifestEvidence(root: CanonicalRoot, ledger: ReadLedger): Promise<ManifestEvidence> {
  const read = await readEvidenceFile(root.root, PROJECT_MANIFEST_PATH, MAX_EVIDENCE_FILE_BYTES);
  const empty = { present: false, current: false, value: null, schemaVersion: null } as const;

  if (read.kind === "missing") {
    return { ...empty, reason: `${PROJECT_MANIFEST_PATH} does not exist at the canonical root`, undecidable: null };
  }
  if (read.kind === "over-cap") {
    return {
      ...empty,
      present: true,
      reason: `BOUNDED: ${PROJECT_MANIFEST_PATH} exceeds MAX_EVIDENCE_FILE_BYTES=${read.cap}`,
      undecidable: null,
    };
  }
  if (read.kind === "unreadable") {
    const undecidable = { path: PROJECT_MANIFEST_PATH, errno: read.errno };
    return { ...empty, present: true, reason: undecidableReason(undecidable), undecidable };
  }

  ledger.recordRelative(PROJECT_MANIFEST_PATH, read.text);
  const inspection = await inspectProjectManifest(root.root);

  // The gating rule survives verbatim from the retired detector: a migratable
  // manifest is readable but is not consumed as current, and an invalid one
  // adds nothing rather than partially applying whatever happened to parse.
  if (inspection === null || inspection.status !== "current" || inspection.value === null) {
    return {
      ...empty,
      present: true,
      reason: `${PROJECT_MANIFEST_PATH} is ${inspection?.status ?? "unreadable"}, so it is not consumed as current`,
      undecidable: null,
    };
  }
  return {
    present: true,
    current: true,
    value: inspection.value,
    schemaVersion: String(inspection.value.schemaVersion),
    reason: null,
    undecidable: null,
  };
}

// --- the public detection surface -----------------------------------------

export function matchDeclaredContent(path: string, text: string, patterns: readonly RegExp[]): ContentMatch {
  const bounded = text.length > MAX_CONTENT_MATCH_BYTES ? text.slice(0, MAX_CONTENT_MATCH_BYTES) : text;
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    if (pattern.test(bounded)) return { matched: true, path };
  }
  return { matched: false, path };
}

export function inputsDigest(inputs: readonly ReadInput[]): string {
  const lines = inputs.map((input) => `${input.path}\u0000${input.hash}`).sort();
  return sha256(lines.join("\n"));
}

export function lookupDependency(dependencies: DeclaredDependencies, name: string): DeclaredDependency | null {
  return dependencies.byName.get(name) ?? dependencies.byName.get(pep503(name)) ?? null;
}

export async function readDeclaredDependencies(
  root: CanonicalRoot,
  scan: ProjectTreeScan,
  ledger: ReadLedger,
): Promise<DeclaredDependencies> {
  const scannable = new Set<string>(scan.paths);
  const index = new Map<string, DeclaredDependency>();
  const undecidable: UndecidableEvidence[] = [];
  const bounded: string[] = [];

  for (const manifest of DEPENDENCY_MANIFESTS) {
    // Scan membership is what makes D-04 true here: a gitignored manifest, or
    // one behind a nested-repository boundary, is not this project's evidence.
    if (!scannable.has(manifest)) continue;

    const read = await readEvidenceFile(root.root, manifest, MAX_EVIDENCE_FILE_BYTES);
    if (read.kind === "missing") continue;
    if (read.kind === "over-cap") {
      bounded.push(`${manifest} exceeds MAX_EVIDENCE_FILE_BYTES=${read.cap}`);
      continue;
    }
    if (read.kind === "unreadable") {
      undecidable.push({ path: manifest, errno: read.errno });
      continue;
    }
    ledger.recordRelative(manifest, read.text);
    const failure = ingestManifest(manifest, read.text, index);
    if (failure !== null) undecidable.push({ path: manifest, errno: failure });
  }

  return { byName: index, undecidable, bounded };
}

export async function openDetectionContext(root: CanonicalRoot, scan: ProjectTreeScan): Promise<DetectionContext> {
  const ledger = new ReadLedger();
  const dependencies = await readDeclaredDependencies(root, scan, ledger);
  const manifest = await readManifestEvidence(root, ledger);
  return {
    root,
    paths: new Set(scan.paths),
    files: new Set(scan.files),
    directories: new Set(scan.directories),
    sortedFiles: scan.files,
    dependencies,
    manifest,
    ledger,
  };
}

function positive(declaration: FactDeclaration, path: string | null, version: string | null): FactDetection {
  return { id: declaration.id, kind: declaration.kind, detected: true, path, version, reason: null, undecidable: null };
}

function negative(
  declaration: FactDeclaration,
  reason: string,
  extra: { path?: string; undecidable?: UndecidableEvidence | null } = {},
): FactDetection {
  return {
    id: declaration.id,
    kind: declaration.kind,
    detected: false,
    path: extra.path ?? null,
    version: null,
    reason,
    undecidable: extra.undecidable ?? null,
  };
}

/** Repository-owned names, bounded so one fact cannot flood an explanation. */
function nameList(values: readonly string[], cap = 6): string {
  const shown = values.slice(0, cap).join(", ");
  return values.length > cap ? `${shown} (+${values.length - cap} more)` : shown;
}

function firstObstacle(dependencies: DeclaredDependencies): string | null {
  const unreadable = dependencies.undecidable[0];
  if (unreadable !== undefined) return undecidableReason(unreadable);
  const bound = dependencies.bounded[0];
  return bound === undefined ? null : `BOUNDED: ${bound}`;
}

function detectDependency(context: DetectionContext, declaration: FactDeclaration): FactDetection {
  const packages = declaration.packages ?? [];
  if (packages.length === 0) return negative(declaration, "the declaration names no packages to look for");

  for (const name of packages) {
    const declared = lookupDependency(context.dependencies, name);
    if (declared !== null) return positive(declaration, declared.path, declared.version);
  }

  const absence = `no dependency manifest at the canonical root declares any of: ${nameList(packages)}`;
  const obstacle = firstObstacle(context.dependencies);
  return negative(declaration, obstacle === null ? absence : `${obstacle}; ${absence}`, {
    undecidable: context.dependencies.undecidable[0] ?? null,
  });
}

function detectFile(context: DetectionContext, declaration: FactDeclaration): FactDetection {
  const declared = declaration.files ?? [];
  if (declared.length === 0) return negative(declaration, "the declaration names no files to look for");
  for (const candidate of declared) {
    const normalized = normalizeRelativePosix(candidate);
    if (normalized !== null && context.paths.has(normalized)) return positive(declaration, normalized, null);
  }
  return negative(declaration, `none of the declared paths exists under the canonical root: ${nameList(declared)}`);
}

function detectDirectory(context: DetectionContext, declaration: FactDeclaration): FactDetection {
  const declared = declaration.directories ?? [];
  if (declared.length === 0) return negative(declaration, "the declaration names no directories to look for");
  for (const candidate of declared) {
    const normalized = normalizeRelativePosix(candidate);
    // Directory membership only. A file bearing the directory's name is a
    // different thing on disk and must not answer for it.
    if (normalized !== null && context.directories.has(normalized)) return positive(declaration, normalized, null);
  }
  return negative(declaration, `none of the declared directories exists under the canonical root: ${nameList(declared)}`);
}

/** A declared key counts as opted in when it carries something, not merely a slot. */
export function isOptedIn(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function detectManifestKey(context: DetectionContext, declaration: FactDeclaration): FactDetection {
  const key = declaration.manifestKey;
  if (key === undefined) return negative(declaration, "the declaration names no manifest key");

  const manifest = context.manifest;
  if (!manifest.current || manifest.value === null) {
    return negative(declaration, manifest.reason ?? `${PROJECT_MANIFEST_PATH} is not a current, valid manifest`, {
      undecidable: manifest.undecidable,
    });
  }

  const safe = Object.assign(Object.create(null) as Record<string, unknown>, manifest.value);
  if (!isOptedIn(safe[key])) return negative(declaration, `${PROJECT_MANIFEST_PATH} does not opt in to ${key}`);
  return positive(declaration, PROJECT_MANIFEST_PATH, manifest.schemaVersion);
}

function detectFileAbsent(context: DetectionContext, declaration: FactDeclaration): FactDetection {
  const declared = declaration.files ?? [];
  if (declared.length === 0) return negative(declaration, "the declaration names no files whose absence to check");
  for (const candidate of declared) {
    const normalized = normalizeRelativePosix(candidate);
    if (normalized !== null && context.paths.has(normalized)) {
      return negative(declaration, `${normalized} exists, so the declared document is not absent`, { path: normalized });
    }
  }
  // Absence IS the detection. Expressing the negation as its own kind is what
  // removes the need for a `not` operator in the predicate grammar.
  return positive(declaration, null, null);
}

/** Declared files first, then the sorted files under any declared directory. */
function expandContentFiles(context: DetectionContext, declared: readonly string[]): string[] {
  const chosen: string[] = [];
  const seen = new Set<string>();

  for (const entry of declared) {
    const normalized = normalizeRelativePosix(entry);
    if (normalized === null) continue;
    if (context.files.has(normalized)) {
      if (!seen.has(normalized)) {
        seen.add(normalized);
        chosen.push(normalized);
      }
      continue;
    }
    if (!context.directories.has(normalized)) continue;
    const prefix = `${normalized}/`;
    for (const file of context.sortedFiles) {
      if (!file.startsWith(prefix) || seen.has(file)) continue;
      seen.add(file);
      chosen.push(file);
      if (chosen.length >= MAX_CONTENT_FILES) return chosen;
    }
  }
  return chosen;
}

async function detectFileContent(context: DetectionContext, declaration: FactDeclaration): Promise<FactDetection> {
  const declared = declaration.files ?? [];
  const patterns = declaration.patterns ?? [];
  if (declared.length === 0 || patterns.length === 0) {
    return negative(declaration, "the declaration names no files or no patterns to match");
  }

  let compiled: RegExp[];
  try {
    // Every pattern comes from the repository-owned catalog, never from the
    // scanned project. A pattern that does not compile is a catalog defect and
    // is reported as one rather than silently making the fact undetectable.
    compiled = patterns.map((pattern) => new RegExp(pattern, "mu"));
  } catch {
    const undecidable = { path: "catalog/facts.yaml", errno: "pattern.invalid" };
    return negative(declaration, undecidableReason(undecidable), { undecidable });
  }

  let bound: string | null = null;
  let unreadable: UndecidableEvidence | null = null;

  for (const candidate of expandContentFiles(context, declared)) {
    const read = await readEvidenceFile(context.root.root, candidate, MAX_EVIDENCE_FILE_BYTES);
    if (read.kind === "missing") continue;
    if (read.kind === "over-cap") {
      bound ??= `BOUNDED: ${candidate} exceeds MAX_EVIDENCE_FILE_BYTES=${read.cap}`;
      continue;
    }
    if (read.kind === "unreadable") {
      unreadable ??= { path: candidate, errno: read.errno };
      continue;
    }
    context.ledger.recordRelative(candidate, read.text);
    // The match carries a boolean and a path. There is no third thing it
    // could carry, which is why a credential-bearing DSN cannot leak here.
    const match = matchDeclaredContent(candidate, read.text, compiled);
    if (match.matched) return positive(declaration, match.path, null);
  }

  const absence = `no declared pattern matched any of: ${nameList(declared)}`;
  if (unreadable !== null) return negative(declaration, `${undecidableReason(unreadable)}; ${absence}`, { undecidable: unreadable });
  if (bound !== null) return negative(declaration, `${bound}; ${absence}`);
  return negative(declaration, absence);
}

export async function detectFact(context: DetectionContext, declaration: FactDeclaration): Promise<FactDetection> {
  if (declaration.deferredTo !== undefined) {
    return negative(declaration, `deferred to ${declaration.deferredTo}: no detector for this fact runs in this phase`);
  }
  switch (declaration.kind) {
    case "dependency":
      return detectDependency(context, declaration);
    case "file":
      return detectFile(context, declaration);
    case "directory":
      return detectDirectory(context, declaration);
    case "manifestKey":
      return detectManifestKey(context, declaration);
    case "fileAbsent":
      return detectFileAbsent(context, declaration);
    case "fileContent":
      return detectFileContent(context, declaration);
  }
  // Unreachable through the schema-validated vocabulary, and fail-closed for a
  // value that reached this function any other way.
  return negative(declaration, "no detector implements this fact's declared kind");
}

/** Ascending declaration id, by code point, so no locale can reorder the walk. */
function byDeclarationId(left: FactDeclaration, right: FactDeclaration): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export async function detectProjectFacts(
  root: CanonicalRoot,
  scan: ProjectTreeScan,
  vocabulary: FactVocabulary,
): Promise<EvidenceDetection> {
  const context = await openDetectionContext(root, scan);
  const detections: FactDetection[] = [];
  for (const declaration of [...vocabulary.facts].sort(byDeclarationId)) {
    detections.push(await detectFact(context, declaration));
  }
  // Read AFTER every detector ran: `fileContent` opens files during detection.
  return { detections, readInputs: context.ledger.inputs(), dependencies: context.dependencies };
}

/**
 * The digestable view of an envelope: the selection-relevant observations and
 * nothing else.
 *
 * Built as ONE literal in ONE place. `JSON.stringify` preserves insertion
 * order, so two code paths building the same logical object with keys in a
 * different order produce different digests. `createdAt` is absent BY
 * CONSTRUCTION here — never by deleting a field from the envelope, which is
 * how a clock leaks back into a digest the next time the envelope grows.
 */
export function digestableEvidence(
  envelope: EvidenceEnvelope,
): ReadonlyArray<readonly [string, boolean, string | null, string | null]> {
  return envelope.facts
    .map((fact) => [fact.id, fact.detected, fact.path ?? null, fact.version ?? null] as const)
    .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
}

/** Ascending fact id, then ascending path. By code point, so no locale reorders it. */
function byEmittedFact(left: EvidenceFact, right: EvidenceFact): number {
  if (left.id !== right.id) return left.id < right.id ? -1 : 1;
  const leftPath = left.path ?? "";
  const rightPath = right.path ?? "";
  return leftPath < rightPath ? -1 : leftPath > rightPath ? 1 : 0;
}

/**
 * Projects one detection onto the sealed record shape. `hash` is never set:
 * D-07 keeps a fact to path, name and version so an unrelated comment change
 * does not disturb it. Whether anything looked at moved is the DIFFERENT
 * question the envelope's aggregate `sourceHash` answers.
 */
function emitFact(detection: FactDetection): EvidenceFact {
  const fact: EvidenceFact = { id: detection.id, kind: detection.kind, detected: detection.detected };
  if (detection.path !== null && detection.path.length > 0) fact.path = detection.path;
  if (detection.version !== null && detection.version.length > 0) fact.version = detection.version;
  if (detection.reason !== null && detection.reason.length > 0) fact.reason = detection.reason;
  // A negative record ALWAYS says why. Absence must stop being
  // indistinguishable from not-checked — DETC-03's explanation is built on it.
  else if (!detection.detected) fact.reason = "not detected, and the detector gave no further reason";
  return fact;
}

export async function buildEvidenceEnvelope(
  root: CanonicalRoot,
  vocabulary: FactVocabulary,
  detected: EvidenceDetection,
): Promise<EvidenceEnvelope> {
  const byId = new Map(detected.detections.map((detection) => [detection.id, detection]));

  // One record per DECLARED fact — the vocabulary decides the fact set, not
  // whatever happened to be observed. A vocabulary carrying one id twice is
  // already refused at load by `factVocabularyInvariants`.
  const facts = vocabulary.facts.map((declaration) => {
    const detection = byId.get(declaration.id);
    if (detection !== undefined) return emitFact(detection);
    return {
      id: declaration.id,
      kind: declaration.kind,
      detected: false,
      reason: "no detector reported on this declared fact in this run",
    } satisfies EvidenceFact;
  });

  facts.sort(byEmittedFact);

  return {
    schemaVersion: 1,
    projectId: root.projectId,
    producer: await readProducer(),
    // Wall-clock context, and the one field allowed to differ between two runs
    // over an unchanged repository. It reaches no digest.
    createdAt: new Date().toISOString(),
    sourceHash: inputsDigest(detected.readInputs),
    facts,
  };
}

/**
 * Collects repository evidence: the whole declared vocabulary, positive and
 * negative, over a bounded and boundary-proven scan.
 *
 * The detail form carries what the pack evaluator needs alongside the
 * envelope. `anyFiles` / `anyDependencies` predicates name inline literals
 * rather than declared fact ids, so they resolve against the scan and the
 * dependency index and synthesize their explaining fact id — they are not, and
 * must not become, entries in the declared vocabulary.
 */
export async function collectProjectEvidenceDetail(
  root: CanonicalRoot,
  options: CollectEvidenceOptions = {},
): Promise<ProjectEvidence> {
  const packageRoot = options.packageRoot ?? findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
  if (packageRoot === null) {
    throw new Error("Could not locate the alpha-AOS package root that owns catalog/facts.yaml");
  }

  const vocabulary = (await loadFactVocabularyStrict(packageRoot)).value;
  const scan = await scanProjectTree(root);
  const detected = await detectProjectFacts(root, scan, vocabulary);
  const envelope = await buildEvidenceEnvelope(root, vocabulary, detected);

  return {
    envelope,
    scan,
    detections: detected.detections,
    dependencies: detected.dependencies,
    readInputs: detected.readInputs,
  };
}

export async function collectProjectEvidence(
  root: CanonicalRoot,
  options: CollectEvidenceOptions = {},
): Promise<EvidenceEnvelope> {
  return (await collectProjectEvidenceDetail(root, options)).envelope;
}
