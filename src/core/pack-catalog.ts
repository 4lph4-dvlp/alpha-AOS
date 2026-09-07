import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DetectorKind, FactVocabulary, PackCatalog, PackDeclaration } from "../types.js";
import { ManagedDocumentError, type StrictLoadResult } from "./catalog.js";
import { createMigrationPlan, validateManagedDocument, type ValidationIssue } from "./validation.js";

let packCatalogSchema: Record<string, unknown> | null = null;
let factVocabularySchema: Record<string, unknown> | null = null;

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
  packCatalogSchema ??= await loadSchema(root, "pack-catalog.schema.json");

  const packs: PackDeclaration[] = [];
  const extensions: Record<string, unknown> = {};
  let schemaVersion = 1;

  for (const file of files) {
    const text = await readFile(join(root, ...file.split("/")), "utf8");
    const result = validateManagedDocument<PackCatalog>({
      text,
      format: "yaml",
      kind: "pack-catalog",
      schema: packCatalogSchema,
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
  return { value: { schemaVersion, packs }, extensions };
}

/**
 * RED scaffold. GREEN runs the post-merge domain pass: duplicate pack ids,
 * duplicate fact ids, and predicate leaves naming a fact the vocabulary does
 * not declare.
 */
export function packCatalogInvariants(merged: PackCatalog, vocabulary: FactVocabulary): ValidationIssue[] {
  void merged;
  void vocabulary;
  return [];
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
  factVocabularySchema ??= await loadSchema(root, "fact-vocabulary.schema.json");
  const text = await readFile(join(root, "catalog", "facts.yaml"), "utf8");
  const result = validateManagedDocument<FactVocabulary>({
    text,
    format: "yaml",
    kind: "fact-vocabulary",
    schema: factVocabularySchema,
    domain: factVocabularyInvariants,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Fact vocabulary", result, createMigrationPlan(result));
  }
  return { value: result.value, extensions: result.extensions };
}
