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
 * The pack files this tracer reads. The remaining six and the cross-file
 * duplicate-id refusal that a merge needs are the next plan's work; this one
 * proves the seam, not the breadth.
 */
const TRACER_PACK_FILES: readonly string[] = ["catalog/packs/web.yaml"];

/**
 * Loads declared packs through the one managed-document route.
 *
 * A bare YAML parse would skip duplicate-key rejection, closed-world checking,
 * version routing and stable error codes — a pack file that declares one id
 * twice would become a confident answer instead of a refusal.
 */
export async function loadPackCatalogStrict(
  root: string,
  files: readonly string[] = TRACER_PACK_FILES,
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

  return { value: { schemaVersion, packs }, extensions };
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
