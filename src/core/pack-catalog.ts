import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectorKind, EvidenceNode, FactVocabulary, PackCatalog, PackDeclaration } from "../types.js";
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

// Keyed by the caller-supplied root, under the one keying rule this phase
// applies to every process-wide cache whose value depends on a package root:
// a memo keyed on nothing lets the first caller decide the schema for every
// later caller with a different root (WR-09).
const packCatalogSchemas = new RootKeyedCache<Record<string, unknown>>();
const factVocabularySchemas = new RootKeyedCache<Record<string, unknown>>();

/**
 * The six bounded detectors, mirroring the `kind` enum in
 * `schemas/fact-vocabulary.schema.json`. A seventh kind is an additive change
 * to both, never a silent extension of one.
 */
const DETECTOR_KINDS: readonly DetectorKind[] = [
  "dependency",
  "file",
  "directory",
  "manifestKey",
  "fileAbsent",
  "fileContent",
];
const detectorKinds = new Set<string>(DETECTOR_KINDS);

/** Schemas are read from disk so `schemas/*.json` is the single source of truth. */
async function loadSchema(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "schemas", name), "utf8")) as Record<string, unknown>;
}

/**
 * Every declared pack file, as an explicit sorted list rather than a glob. A
 * glob that expands to nothing exits successfully, which is the same hazard
 * `scripts/run-tests.mjs --files` exists to close: a catalog that silently
 * stopped being read would look like a repository that qualifies for nothing.
 */
const PACK_FILES: readonly string[] = [
  "catalog/packs/ai.yaml",
  "catalog/packs/backend.yaml",
  "catalog/packs/brownfield.yaml",
  "catalog/packs/infra.yaml",
  "catalog/packs/research.yaml",
  "catalog/packs/security.yaml",
  "catalog/packs/web.yaml",
];

/** Codepoint order, so the merged catalog is byte-stable on every host. */
function byPackId(left: PackDeclaration, right: PackDeclaration): number {
  if (left.id < right.id) return -1;
  return left.id > right.id ? 1 : 0;
}

/**
 * Loads declared packs through the one managed-document route.
 *
 * A bare YAML parse would skip duplicate-key rejection, closed-world checking,
 * version routing and stable error codes — a pack file that declares one id
 * twice would become a confident answer instead of a refusal.
 */
export async function loadPackCatalogStrict(
  root: string,
  files: readonly string[] = PACK_FILES,
): Promise<StrictLoadResult<PackCatalog>> {
  const schema = await packCatalogSchemas.load(root, async () => loadSchema(root, "pack-catalog.schema.json"));

  const packs: PackDeclaration[] = [];
  const extensions: Record<string, unknown> = {};
  let schemaVersion = 1;

  for (const file of files) {
    const text = await readFile(join(root, ...file.split("/")), "utf8");
    const result = validateManagedDocument<PackCatalog>({
      text,
      format: "yaml",
      kind: "pack-catalog",
      schema,
    });

    if (!result.ok || result.value === null) {
      // A migratable document is readable but is never authoritative as-is.
      throw new ManagedDocumentError(`Pack catalog (${file})`, result, createMigrationPlan(result));
    }
    schemaVersion = result.value.schemaVersion;
    packs.push(...result.value.packs);
    Object.assign(extensions, result.extensions);
  }

  packs.sort(byPackId);
  const merged: PackCatalog = { schemaVersion, packs };

  // The invariant pass runs over the MERGED value, so it cannot be handed to
  // validateManagedDocument as a per-file `domain` callback — a duplicate pack
  // id spanning two files is invisible to either file on its own.
  const vocabulary = await loadFactVocabularyStrict(root);
  const issues = packCatalogInvariants(merged, vocabulary.value);
  if (issues.length > 0) {
    const result = invariantResult(issues);
    throw new ManagedDocumentError("Pack catalog", result, createMigrationPlan(result));
  }

  return { value: merged, extensions };
}

/**
 * Domain invariants the vocabulary schema cannot express. The offending id
 * never enters an issue — a scanned document may carry a secret, so only its
 * shape is reported.
 */
function factVocabularyInvariants(value: unknown): ValidationIssue[] {
  const vocabulary = value as FactVocabulary;
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  for (const [index, fact] of vocabulary.facts.entries()) {
    if (seen.has(fact.id)) {
      issues.push({
        code: "domain.duplicate-fact-id",
        documentPath: `/facts/${index}`,
        expected: "each fact id to appear once in catalog/facts.yaml",
        actualShape: `string(length=${fact.id.length})`,
      });
    }
    seen.add(fact.id);

    // Reachable when a vocabulary arrives from somewhere other than the schema
    // route — the schema enum closes the same door from the other side.
    if (!detectorKinds.has(fact.kind)) {
      issues.push({
        code: "domain.unknown-detector-kind",
        documentPath: `/facts/${index}/kind`,
        expected: `one of the six detector kinds (${DETECTOR_KINDS.join(", ")})`,
        actualShape: `string(length=${String(fact.kind).length})`,
      });
    }
  }
  return issues;
}

/**
 * Loads the declared fact vocabulary through the one managed-document route.
 *
 * The vocabulary is what makes "adding a pack is a YAML edit" true for the
 * facts a pack names as well: without it a pack could be declared and would
 * silently never match, which is indistinguishable from a repository whose
 * evidence is genuinely absent.
 */
export async function loadFactVocabularyStrict(root: string): Promise<StrictLoadResult<FactVocabulary>> {
  const schema = await factVocabularySchemas.load(root, async () => loadSchema(root, "fact-vocabulary.schema.json"));
  const text = await readFile(join(root, "catalog", "facts.yaml"), "utf8");
  const result = validateManagedDocument<FactVocabulary>({
    text,
    format: "yaml",
    kind: "fact-vocabulary",
    schema,
    domain: factVocabularyInvariants,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Fact vocabulary", result, createMigrationPlan(result));
  }
  return { value: result.value, extensions: result.extensions };
}

/**
 * Every fact id a predicate names, each with the pointer that names it.
 *
 * `anyFiles` and `anyDependencies` carry inline literals and `manifestOptIn`
 * names a manifest key: none of the three is a fact id, so none is subject to
 * the undeclared-fact refusal.
 */
function collectFactLeaves(
  node: EvidenceNode,
  pointer: string,
  into: Array<{ id: string; pointer: string }>,
): void {
  for (const operator of ["all", "any"] as const) {
    const items = node[operator];
    if (items === undefined) continue;
    for (const [index, item] of items.entries()) {
      const at = `${pointer}/${operator}/${index}`;
      if (typeof item === "string") into.push({ id: item, pointer: at });
      else collectFactLeaves(item, at, into);
    }
  }
}

/**
 * Deterministic order and a hard cap, mirroring `finalizeIssues` in
 * `validation.ts` — that one is module-private, and a hostile catalog must not
 * be able to flood output through this route either.
 */
function orderIssues(issues: ValidationIssue[]): { issues: ValidationIssue[]; truncated: boolean } {
  const sorted = [...issues].sort(
    (left, right) =>
      left.documentPath.localeCompare(right.documentPath) ||
      left.code.localeCompare(right.code) ||
      left.expected.localeCompare(right.expected),
  );
  if (sorted.length <= ISSUE_CAP) return { issues: sorted, truncated: false };
  return { issues: sorted.slice(0, ISSUE_CAP), truncated: true };
}

/** The `ValidationResult` shape `ManagedDocumentError` reads, for a post-merge refusal. */
function invariantResult(issues: ValidationIssue[]): ValidationResult<PackCatalog> {
  const finalized = orderIssues(issues);
  return {
    ok: false,
    kind: "pack-catalog",
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
 * Domain invariants over the merged catalog and the vocabulary it is read
 * against. Three refusals a schema cannot express:
 *
 * - `domain.duplicate-pack-id` — one id declared by two files. Last-wins would
 *   turn an ambiguous catalog into a confident answer.
 * - `domain.duplicate-fact-id` — one fact declared twice, via the same
 *   invariant `loadFactVocabularyStrict` applies, so a vocabulary reaching
 *   this pass from anywhere else is held to the same rule.
 * - `domain.undeclared-fact` — a leaf naming a fact `catalog/facts.yaml` does
 *   not declare. Treating it as a false leaf is the obvious implementation and
 *   is wrong: a pack that can never select is indistinguishable from a pack
 *   whose evidence is genuinely absent, which is the exact failure DETC-03
 *   exists to prevent. The refusal is at LOAD.
 *
 * No issue carries the offending value — a scanned document may hold a secret,
 * so only `string(length=N)` is reported.
 */
export function packCatalogInvariants(merged: PackCatalog, vocabulary: FactVocabulary): ValidationIssue[] {
  const issues: ValidationIssue[] = [...factVocabularyInvariants(vocabulary)];
  const declared = new Set(vocabulary.facts.map((fact) => fact.id));
  const seen = new Set<string>();

  for (const [index, pack] of merged.packs.entries()) {
    if (seen.has(pack.id)) {
      issues.push({
        code: "domain.duplicate-pack-id",
        documentPath: `/packs/${index}`,
        expected: "each pack id to appear once across catalog/packs/*.yaml",
        actualShape: `string(length=${pack.id.length})`,
      });
    }
    seen.add(pack.id);

    const leaves: Array<{ id: string; pointer: string }> = [];
    collectFactLeaves(pack.evidence, `/packs/${index}/evidence`, leaves);
    for (const leaf of leaves) {
      if (declared.has(leaf.id)) continue;
      issues.push({
        code: "domain.undeclared-fact",
        documentPath: leaf.pointer,
        expected: "every referenced fact to be declared in catalog/facts.yaml",
        actualShape: `string(length=${leaf.id.length})`,
      });
    }
  }
  return issues;
}
