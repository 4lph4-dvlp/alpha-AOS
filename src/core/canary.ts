// The canary catalog: every prompt a canary run may put in front of a model,
// declared once, in ordinary text, before anything spends anything.
//
// Two rules shape this module.
//
// 1. A prompt never names the skill, the server or the tool it is meant to
//    elicit. 03-CONTEXT.md's `<specifics>` and 03-RESEARCH.md's anti-pattern
//    list both name prompt-rewording as the single easiest way to turn CAPA-01
//    and CAPA-02 into theatre. Storing the prompts in a reviewed catalog is
//    what makes a reword a visible diff; `findPromptHints` below is the
//    mechanical half — it cannot judge intent, but it catches the specific
//    reword that names the thing, and `loadCanaryCatalog` refuses one.
//
// 2. Nothing here parses a failed run to decide WHY it failed. See
//    `probeReadiness`: the blocked-versus-unverified split of 03-CONTEXT.md
//    D-12 is derived from probes that run BEFORE the canary, which is both
//    more reliable than reading a failure's output and the only way `blocked`
//    can name a variable and a next action.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ManagedDocumentError, type StrictLoadResult } from "./catalog.js";
import { RootKeyedCache } from "./paths.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

/** Mirrors ISSUE_CAP in validation.ts: a refusal is bounded, never a flood. */
const ISSUE_CAP = 50;

/** The single declared canary file. Named, not globbed — a glob that expands to nothing exits 0. */
export const CANARY_CATALOG_FILE = "catalog/canaries.yaml";

// Keyed by the caller-supplied root, under the same rule every process-wide
// cache in this repository follows: a memo keyed on nothing lets the first
// caller decide the schema for every later caller with a different root.
const canaryCatalogSchemas = new RootKeyedCache<Record<string, unknown>>();

// ---------------------------------------------------------------------------
// The declared shape
// ---------------------------------------------------------------------------

/** The harnesses a canary can be declared for. Mirrors the ledger's narrowed set. */
export type CanaryHarness = "claude" | "codex" | "pi" | "hermes";

/** A structural fact an expected call's arguments must satisfy. */
export interface CanaryArgumentPattern {
  readonly tool: string;
  readonly argument: string;
  /** An ECMAScript regular expression source. */
  readonly pattern: string;
  readonly why: string;
}

/**
 * One declared canary.
 *
 * `expectTools` and `forbidTools` carry the tool names, so `prompt` does not
 * have to. That separation is the whole point of this shape.
 */
export interface CanaryDeclaration {
  readonly id: string;
  readonly capability: string;
  readonly prompt: string;
  readonly expectTools: readonly string[];
  readonly expectOrdered?: boolean;
  readonly expectArgumentPatterns?: readonly CanaryArgumentPattern[];
  readonly forbidTools: readonly string[];
  /** How many distinct research servers one run may touch. A control declares 1. */
  readonly maxDistinctServers: number;
  /** Environment variable NAMES, never values. */
  readonly requiresEnvironment?: readonly string[];
  readonly requiresMcpServers?: readonly string[];
  readonly harnesses: readonly CanaryHarness[];
  readonly readOnly: true;
  readonly why?: string;
}

export interface CanaryCatalog {
  readonly schemaVersion: number;
  readonly canaries: readonly CanaryDeclaration[];
}

// ---------------------------------------------------------------------------
// Prompt hygiene
// ---------------------------------------------------------------------------

/**
 * Lowercase alphanumeric runs. Comparing TOKEN SEQUENCES rather than substrings
 * is what stops `exact` from reading as the server id `exa` while still
 * catching `deep research` for the skill id `deep-research`.
 */
function tokenize(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Whether a prompt names a given term.
 *
 * A term matches when its token sequence appears contiguously in the prompt's
 * token sequence, so `web_search_exa`, `web-search-exa` and `web search exa`
 * are one term, and an ordinary English word that merely contains a server id
 * as a substring is not a false positive.
 */
export function promptNamesTerm(prompt: string, term: string): boolean {
  return containsSequence(tokenize(prompt), tokenize(term));
}

/**
 * Every forbidden term a prompt names, in the order the terms were supplied.
 *
 * This is a mechanical check, not a judgement of intent: it cannot tell a
 * hinting prompt from an honest one, but it can refuse the specific reword that
 * names the thing the canary is supposed to elicit on its own.
 */
export function findPromptHints(prompt: string, forbidden: readonly string[]): readonly string[] {
  return forbidden.filter((term) => promptNamesTerm(prompt, term));
}

/**
 * The terms a canary's own declaration forbids its prompt from naming.
 *
 * Self-contained on purpose: the loader can enforce this half without reading
 * the lock, so a hinting prompt is refused before anything else happens. The
 * wider vocabulary — pinned MCP server ids and locked ECC skill ids — is
 * asserted by the suite, which already has the lock in hand.
 */
export function selfNamedTerms(canary: CanaryDeclaration): readonly string[] {
  return [
    ...canary.expectTools,
    ...canary.forbidTools,
    ...(canary.expectArgumentPatterns ?? []).map((entry) => entry.tool),
  ];
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Schemas are read from disk so `schemas/*.json` is the single source of truth. */
async function loadSchema(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "schemas", name), "utf8")) as Record<string, unknown>;
}

/**
 * Deterministic order and a hard cap, mirroring `finalizeIssues` in
 * `validation.ts` — that one is module-private, and a hostile catalog must not
 * be able to flood output through this route either.
 */
function orderIssues(issues: readonly ValidationIssue[]): { issues: ValidationIssue[]; truncated: boolean } {
  const sorted = [...issues].sort(
    (left, right) =>
      left.documentPath.localeCompare(right.documentPath) ||
      left.code.localeCompare(right.code) ||
      left.expected.localeCompare(right.expected),
  );
  if (sorted.length <= ISSUE_CAP) return { issues: sorted, truncated: false };
  return { issues: sorted.slice(0, ISSUE_CAP), truncated: true };
}

/** The `ValidationResult` shape `ManagedDocumentError` reads, for a post-schema refusal. */
function invariantResult(issues: readonly ValidationIssue[]): ValidationResult<CanaryCatalog> {
  const finalized = orderIssues(issues);
  return {
    ok: false,
    kind: "canary-catalog",
    format: "yaml",
    schemaVersion: 1,
    status: "invalid",
    value: null,
    readOnlyValue: null,
    extensions: {},
    typedExtensions: {},
    issues: finalized.issues,
    issuesTruncated: finalized.truncated,
  };
}

/**
 * Domain invariants the schema cannot express.
 *
 * The offending PROMPT never enters an issue. A prompt is ordinary text rather
 * than a secret, but the rule that a scanned document's contents do not reach a
 * diagnostic is applied uniformly here rather than argued about per document.
 */
function canaryCatalogInvariants(catalog: CanaryCatalog): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  catalog.canaries.forEach((canary, index) => {
    if (seen.has(canary.id)) {
      issues.push({
        code: "canary.duplicate-id",
        documentPath: `/canaries/${index}/id`,
        expected: "a canary id declared exactly once",
        actualShape: `duplicate id (${canary.id.length} characters)`,
      });
    }
    seen.add(canary.id);

    const hints = findPromptHints(canary.prompt, selfNamedTerms(canary));
    if (hints.length > 0) {
      issues.push({
        code: "canary.prompt-names-expected-tool",
        documentPath: `/canaries/${index}/prompt`,
        expected:
          "a prompt naming none of the tools its own declaration lists; a prompt that has to hint is a finding about discovery, not a prompt to reword",
        actualShape: `names ${hints.length} declared tool name(s): ${hints.join(", ")}`,
      });
    }
  });

  return issues;
}

/**
 * Loads the declared canaries through the one managed-document route.
 *
 * A bare YAML parse would skip duplicate-key rejection, closed-world checking,
 * version routing and stable error codes — a catalog that declared one id twice,
 * or carried a field nobody reads, would become a confident answer instead of a
 * refusal. A malformed catalog must never silently yield zero canaries
 * (T-03-44), which is why every failure below throws rather than returning an
 * empty list.
 */
export async function loadCanaryCatalog(packageRoot: string): Promise<StrictLoadResult<CanaryCatalog>> {
  const schema = await canaryCatalogSchemas.load(packageRoot, async () =>
    loadSchema(packageRoot, "canary-catalog.schema.json"),
  );

  const text = await readFile(join(packageRoot, ...CANARY_CATALOG_FILE.split("/")), "utf8");
  const result = validateManagedDocument<CanaryCatalog>({
    text,
    format: "yaml",
    kind: "canary-catalog",
    schema,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Canary catalog", result, createMigrationPlan(result));
  }

  const issues = canaryCatalogInvariants(result.value);
  if (issues.length > 0) {
    const invalid = invariantResult(issues);
    throw new ManagedDocumentError("Canary catalog", invalid, createMigrationPlan(invalid));
  }

  return { value: result.value, extensions: result.extensions };
}

/** Parses a canary catalog from text a caller already holds. Used by the suite for negatives. */
export function parseCanaryCatalog(text: string, schema: Record<string, unknown>): CanaryCatalog {
  const result = validateManagedDocument<CanaryCatalog>({
    text,
    format: "yaml",
    kind: "canary-catalog",
    schema,
  });
  if (!result.ok || result.value === null) {
    throw new ManagedDocumentError("Canary catalog", result, createMigrationPlan(result));
  }
  const issues = canaryCatalogInvariants(result.value);
  if (issues.length > 0) {
    const invalid = invariantResult(issues);
    throw new ManagedDocumentError("Canary catalog", invalid, createMigrationPlan(invalid));
  }
  return result.value;
}
