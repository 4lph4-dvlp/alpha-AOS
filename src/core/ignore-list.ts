// Wave 2 executor for DETC-01 (D-04).
//
// Ignore-list membership — not commit status, and not a hardcoded directory
// name — decides what is scannable. That rule has to hold in a directory that
// is not a git repository at all, where `git check-ignore` has no answer, so
// nothing here spawns a subprocess; D-08 keeps the preview path clean of them
// too. gitignore pattern semantics are delegated to the reviewed `ignore`
// matcher, which reads no files and walks no directories: alpha-AOS keeps the
// boundary-proven traversal and hands over only the matching.
//
// A `.gitignore` belongs to the repository being inspected, so it is untrusted
// input of arbitrary size and pattern complexity. Every read is capped, every
// pattern is length-capped before it reaches the matcher, and a set that hit a
// cap is reported `undecidable` rather than partially applied — a pattern set
// we could not fully take on must never be reported as "not ignored" (D-01).

import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import ignore from "ignore";

type IgnoreMatcher = ReturnType<typeof ignore>;

export type IgnoreDecision = "ignored" | "scannable" | "undecidable";

export interface IgnoreRuleSet {
  /** Absolute, resolved directory the patterns are measured from. */
  readonly directory: string;
  readonly patterns: readonly string[];
  /**
   * Shape-only descriptions of what could not be taken on — the construct and,
   * where one applies, the length. A raw pattern never appears here, because it
   * is untrusted text from the scanned repository.
   */
  readonly undecidable: readonly string[];
}

export interface IgnoreVerdict {
  readonly decision: IgnoreDecision;
  /** The pattern that decided, or the shape that could not be decided. */
  readonly pattern: string | null;
}

/** 256 KiB. A `.gitignore` past this is refused rather than partially read. */
export const IGNORE_FILE_BYTE_CAP = 262144;
/** Patterns past this count make the file undecidable rather than truncated. */
export const IGNORE_PATTERN_COUNT_CAP = 5000;
/** No single pattern longer than this is handed to the matcher. */
export const IGNORE_PATTERN_LENGTH_CAP = 1024;
/** A probe path longer than this is refused rather than matched. */
const IGNORE_PATH_LENGTH_CAP = 4096;

const GITIGNORE_FILE_NAME = ".gitignore";

const EMPTY_RULES: readonly string[] = Object.freeze([]);

type CappedRead =
  | { readonly kind: "missing" }
  | { readonly kind: "over-cap" }
  | { readonly kind: "unreadable"; readonly code: string }
  | { readonly kind: "text"; readonly text: string };

function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

/**
 * Reads at most `IGNORE_FILE_BYTE_CAP + 1` bytes, so an oversized or actively
 * growing `.gitignore` can be detected without ever holding it in memory. A
 * single `read` may return short even when more is available, hence the loop.
 */
async function readCapped(path: string): Promise<CappedRead> {
  let handle: FileHandle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    const code = errorCode(error);
    // No `.gitignore` here is the ordinary case, not a failure.
    if (code === "ENOENT" || code === "ENOTDIR") return { kind: "missing" };
    return { kind: "unreadable", code };
  }

  try {
    const buffer = Buffer.allocUnsafe(IGNORE_FILE_BYTE_CAP + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > IGNORE_FILE_BYTE_CAP) return { kind: "over-cap" };
    return { kind: "text", text: buffer.subarray(0, filled).toString("utf8") };
  } catch (error) {
    return { kind: "unreadable", code: errorCode(error) };
  } finally {
    await handle.close();
  }
}

interface ParsedPatterns {
  readonly patterns: readonly string[];
  readonly undecidable: readonly string[];
}

/**
 * Splits a `.gitignore` into patterns, dropping blank and comment lines the way
 * git does. Trailing whitespace is stripped unless it was escaped, matching
 * gitignore(5). Caps are enforced here so nothing oversized reaches the matcher.
 */
function parsePatterns(text: string): ParsedPatterns {
  const body = text.startsWith("﻿") ? text.slice(1) : text;
  const patterns: string[] = [];
  const undecidable: string[] = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/(?<!\\)\s+$/u, "");
    if (line.length === 0) continue;
    if (line.startsWith("#")) continue;

    if (line.length > IGNORE_PATTERN_LENGTH_CAP) {
      undecidable.push(
        `pattern-length-cap: construct=gitignore-pattern, length=${line.length}, cap=${IGNORE_PATTERN_LENGTH_CAP}`,
      );
      continue;
    }

    patterns.push(line);
    if (patterns.length > IGNORE_PATTERN_COUNT_CAP) {
      // Applying the prefix we managed to read would answer with a rule set
      // that is not the repository's own. Refuse the whole file instead.
      return {
        patterns: EMPTY_RULES,
        undecidable: [
          ...undecidable,
          `pattern-count-cap: construct=gitignore-file, cap=${IGNORE_PATTERN_COUNT_CAP}, exceeded=true`,
        ],
      };
    }
  }

  return { patterns, undecidable };
}

/**
 * Reads the `.gitignore` in exactly one directory. A missing file yields an
 * empty rule set rather than an error; anything that hit a cap or could not be
 * read yields a rule set whose `undecidable` list names what stopped it.
 */
export async function loadIgnoreRules(directory: string): Promise<IgnoreRuleSet> {
  const resolved = resolve(directory);
  const read = await readCapped(join(resolved, GITIGNORE_FILE_NAME));

  switch (read.kind) {
    case "missing":
      return { directory: resolved, patterns: EMPTY_RULES, undecidable: EMPTY_RULES };
    case "over-cap":
      return {
        directory: resolved,
        patterns: EMPTY_RULES,
        undecidable: [`gitignore-byte-cap: construct=gitignore-file, cap=${IGNORE_FILE_BYTE_CAP}, exceeded=true`],
      };
    case "unreadable":
      return {
        directory: resolved,
        patterns: EMPTY_RULES,
        undecidable: [`gitignore-unreadable: construct=gitignore-file, code=${read.code}`],
      };
    case "text": {
      const parsed = parsePatterns(read.text);
      return { directory: resolved, patterns: parsed.patterns, undecidable: parsed.undecidable };
    }
  }
}

// Matchers are derived state, so they are memoized against the rule-set value
// rather than stored in it — an IgnoreRuleSet stays plain, comparable data.
const matchers = new WeakMap<IgnoreRuleSet, IgnoreMatcher>();

function matcherFor(ruleSet: IgnoreRuleSet): IgnoreMatcher {
  const cached = matchers.get(ruleSet);
  if (cached) return cached;
  const created = ignore().add([...ruleSet.patterns]);
  matchers.set(ruleSet, created);
  return created;
}

function toPosix(value: string): string {
  return sep === "/" ? value : value.split(sep).join("/");
}

/**
 * Re-expresses a path given relative to `rootDirectory` as one relative to
 * `ruleDirectory`. Returns null when the path is not beneath that rule set,
 * in which case the rule set simply does not apply.
 */
function scopePath(rootDirectory: string, ruleDirectory: string, relativePosixPath: string): string | null {
  const nested = relative(rootDirectory, ruleDirectory);
  if (nested.startsWith("..") || isAbsolute(nested)) return null;
  if (nested.length === 0) return relativePosixPath;

  const prefix = toPosix(nested);
  if (!relativePosixPath.startsWith(`${prefix}/`)) return null;
  return relativePosixPath.slice(prefix.length + 1);
}

/** The shallowest rule set — the root the caller's relative paths are measured from. */
function rootOf(stack: readonly IgnoreRuleSet[]): IgnoreRuleSet | null {
  let shallowest: IgnoreRuleSet | null = null;
  for (const ruleSet of stack) {
    if (shallowest === null || ruleSet.directory.length < shallowest.directory.length) shallowest = ruleSet;
  }
  return shallowest;
}

/** Decides a single path against the stack, without the ancestor rule. */
function decideOne(
  posixPath: string,
  isDirectory: boolean,
  rootDirectory: string,
  deepestFirst: readonly IgnoreRuleSet[],
): IgnoreVerdict {
  for (const ruleSet of deepestFirst) {
    const scoped = scopePath(rootDirectory, ruleSet.directory, posixPath);
    if (scoped === null || scoped.length === 0) continue;

    // Fail-closed before matching: a set that hit a cap cannot answer, and an
    // unanswerable set must not fall through to a shallower one that would
    // report "not ignored" on the strength of rules this file never saw.
    if (ruleSet.undecidable.length > 0) {
      return { decision: "undecidable", pattern: ruleSet.undecidable[0] ?? "undecidable" };
    }
    if (ruleSet.patterns.length === 0) continue;

    // The matcher distinguishes a directory by its trailing slash, which is
    // what makes a `build/` pattern apply to the directory and not a `build`
    // file beside it.
    const probe = isDirectory ? `${scoped}/` : scoped;
    let result: { ignored: boolean; unignored: boolean; rule?: { pattern: string } };
    try {
      result = matcherFor(ruleSet).test(probe);
    } catch {
      // The matcher rejects paths it cannot reason about (absolute, escaping).
      // Shape only — the path is repository content.
      return { decision: "undecidable", pattern: `path-shape: construct=matcher-rejected-path, length=${probe.length}` };
    }

    // A deeper `.gitignore` wins outright for paths beneath it, so the first
    // set that actually matches ends the search. A set that matched nothing
    // falls through to the next one out.
    if (result.ignored) return { decision: "ignored", pattern: result.rule?.pattern ?? null };
    if (result.unignored) return { decision: "scannable", pattern: result.rule?.pattern ?? null };
  }

  return { decision: "scannable", pattern: null };
}

/**
 * Decides whether one path is ignored. `relativePosixPath` is measured from the
 * shallowest rule set in `stack`, which must be an ancestor chain of directories.
 * Rule sets are evaluated deepest-first so a nested `.gitignore` wins.
 *
 * Ancestors are decided before the path itself, because gitignore(5) states
 * that "It is not possible to re-include a file if a parent directory of that
 * file is excluded" — verified against `git check-ignore`, which reports
 * `build/keep.txt` as ignored under `build/` even with a later `!build/keep.txt`.
 * Delegating the path straight to the matcher would answer "scannable" there.
 */
export function isIgnored(
  relativePosixPath: string,
  isDirectory: boolean,
  stack: readonly IgnoreRuleSet[],
): IgnoreVerdict {
  const root = rootOf(stack);
  if (root === null) return { decision: "scannable", pattern: null };

  if (relativePosixPath.length === 0 || relativePosixPath.length > IGNORE_PATH_LENGTH_CAP) {
    return { decision: "undecidable", pattern: `path-shape: construct=relative-path, length=${relativePosixPath.length}` };
  }

  const deepestFirst = [...stack].sort((left, right) => right.directory.length - left.directory.length);

  const segments = relativePosixPath.split("/").filter((segment) => segment.length > 0);
  for (let depth = 1; depth < segments.length; depth += 1) {
    const ancestor = segments.slice(0, depth).join("/");
    const verdict = decideOne(ancestor, true, root.directory, deepestFirst);
    if (verdict.decision === "ignored" || verdict.decision === "undecidable") return verdict;
  }

  return decideOne(relativePosixPath, isDirectory, root.directory, deepestFirst);
}
