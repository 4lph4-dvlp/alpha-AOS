import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PackCatalog, PackDeclaration } from "../types.js";
import { ManagedDocumentError, type StrictLoadResult } from "./catalog.js";
import { createMigrationPlan, validateManagedDocument } from "./validation.js";

let packCatalogSchema: Record<string, unknown> | null = null;

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
