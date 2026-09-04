import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Channel, StackCatalog, StackLock } from "../types.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

/** Raised when a managed policy document is not safe to read as authoritative. */
export class ManagedDocumentError extends Error {
  readonly issues: readonly ValidationIssue[];
  readonly status: ValidationResult["status"];
  readonly migration: MigrationPlan | null;

  constructor(label: string, result: ValidationResult, migration: MigrationPlan | null = null) {
    const first = result.issues[0];
    const detail = first === undefined ? result.status : `${first.code} at ${first.documentPath} (${first.expected})`;
    super(`${label} was rejected: ${detail}`);
    this.name = "ManagedDocumentError";
    this.issues = result.issues;
    this.status = result.status;
    this.migration = migration;
  }
}

let stackSchema: Record<string, unknown> | null = null;
let lockSchema: Record<string, unknown> | null = null;

/** Schemas are read from disk so `schemas/*.json` is the single source of truth. */
async function loadSchema(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "schemas", name), "utf8")) as Record<string, unknown>;
}

/** Domain invariants a schema cannot express. */
function catalogInvariants(value: unknown): ValidationIssue[] {
  const catalog = value as StackCatalog;
  const issues: ValidationIssue[] = [];

  if (!Object.hasOwn(catalog.channels, catalog.defaultChannel)) {
    issues.push({
      code: "domain.unknown-default-channel",
      documentPath: "/defaultChannel",
      expected: "a channel declared in /channels",
      actualShape: `string(length=${String(catalog.defaultChannel).length})`,
    });
  }
  if (!Object.hasOwn(catalog.harnesses, catalog.policy.canaryHarness)) {
    issues.push({
      code: "domain.unknown-canary-harness",
      documentPath: "/policy/canaryHarness",
      expected: "a harness declared in /harnesses",
      actualShape: `string(length=${String(catalog.policy.canaryHarness).length})`,
    });
  }
  for (const [index, skill] of catalog.components.ownedSkills.entries()) {
    for (const target of skill.targets) {
      if (Object.hasOwn(catalog.harnesses, target)) continue;
      issues.push({
        code: "domain.unknown-skill-target",
        documentPath: `/components/ownedSkills/${index}/targets`,
        expected: "every target to be a declared harness",
        actualShape: `string(length=${target.length})`,
      });
    }
  }
  const duplicateSkills = catalog.components.ownedSkills
    .map((skill) => skill.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of new Set(duplicateSkills)) {
    issues.push({
      code: "domain.duplicate-owned-skill",
      documentPath: "/components/ownedSkills",
      expected: "each owned skill id to appear once",
      actualShape: `string(length=${id.length})`,
    });
  }
  return issues;
}

function lockInvariants(expectedChannel: Channel): (value: unknown) => ValidationIssue[] {
  return (value) => {
    const lock = value as StackLock;
    const issues: ValidationIssue[] = [];

    // A lock read for one channel must not silently answer for another. This
    // is what stops a candidate lock becoming stable authority just because
    // its JSON happens to be well-formed.
    if (lock.channel !== expectedChannel) {
      issues.push({
        code: "domain.channel-mismatch",
        documentPath: "/channel",
        expected: `channel "${expectedChannel}"`,
        actualShape: `string(length=${String(lock.channel).length})`,
      });
    }

    const packages: Array<[string, { package?: string; version?: string; integrity?: string }]> = [];
    if (lock.components.gsd !== undefined) packages.push(["/components/gsd", lock.components.gsd]);
    if (lock.components.ecc !== undefined) packages.push(["/components/ecc", lock.components.ecc]);
    for (const [id, entry] of Object.entries(lock.components.mcp ?? {})) packages.push([`/components/mcp/${id}`, entry]);
    for (const [id, entry] of Object.entries(lock.components.mcpBridges ?? {})) {
      packages.push([`/components/mcpBridges/${id}`, entry]);
    }

    const seen = new Map<string, string>();
    for (const [path, entry] of packages) {
      if (entry.integrity === undefined || entry.integrity.length === 0) {
        issues.push({
          code: "domain.missing-integrity",
          documentPath: `${path}/integrity`,
          expected: "an integrity hash for every locked package",
          actualShape: "undefined",
        });
      }
      const name = entry.package;
      if (name === undefined) continue;
      const previous = seen.get(name);
      if (previous !== undefined) {
        issues.push({
          code: "domain.duplicate-package",
          documentPath: path,
          expected: `each package to be locked once (already at ${previous})`,
          actualShape: `string(length=${name.length})`,
        });
      }
      seen.set(name, path);
    }
    return issues;
  };
}

export interface StrictLoadResult<T> {
  value: T;
  /** Namespaced extensions preserved for display; inert for planning. */
  extensions: Record<string, unknown>;
}

export async function loadCatalogStrict(root: string): Promise<StrictLoadResult<StackCatalog>> {
  stackSchema ??= await loadSchema(root, "stack.schema.json");
  const text = await readFile(join(root, "catalog", "stack.yaml"), "utf8");
  const result = validateManagedDocument<StackCatalog>({
    text,
    format: "yaml",
    kind: "catalog",
    schema: stackSchema,
    domain: catalogInvariants,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Stack catalog", result, createMigrationPlan(result));
  }
  return { value: result.value, extensions: result.extensions };
}

export async function loadCatalog(root: string): Promise<StackCatalog> {
  return (await loadCatalogStrict(root)).value;
}

export async function loadLockStrict(root: string, channel: Channel = "stable"): Promise<StrictLoadResult<StackLock>> {
  lockSchema ??= await loadSchema(root, "lock.schema.json");
  const filename = channel === "candidate" ? "candidate.lock.json" : "stack.lock.json";
  const text = await readFile(join(root, "catalog", filename), "utf8");
  const result = validateManagedDocument<StackLock>({
    text,
    format: "json",
    kind: "lock",
    schema: lockSchema,
    // The requested channel is authority input, not something the file decides.
    domain: lockInvariants(channel),
  });

  if (!result.ok || result.value === null) {
    throw new ManagedDocumentError(`Stack lock (${channel})`, result, createMigrationPlan(result));
  }
  return { value: result.value, extensions: result.extensions };
}

export async function loadLock(root: string, channel: Channel = "stable"): Promise<StackLock> {
  return (await loadLockStrict(root, channel)).value;
}

/**
 * Inspects a managed document without granting it authority. Used by
 * diagnostics that must report on a document they will not act on.
 */
export async function inspectLock(root: string, channel: Channel): Promise<ValidationResult<StackLock>> {
  lockSchema ??= await loadSchema(root, "lock.schema.json");
  const filename = channel === "candidate" ? "candidate.lock.json" : "stack.lock.json";
  const text = await readFile(join(root, "catalog", filename), "utf8");
  return validateManagedDocument<StackLock>({
    text,
    format: "json",
    kind: "lock",
    schema: lockSchema,
    domain: lockInvariants(channel),
  });
}
