// The strict project-manifest route.
//
// The hardcoded rule engine that used to live in this file — six package-name
// arrays, a package.json-only dependency reader, and a sixty-line function
// emitting bare evidence strings — was retired by plan 02-06. It disagreed
// with `catalog/packs/*.yaml` in six distinct ways, four of its declared
// alternatives were never checked at all, and its hardcoded Python package
// names could never appear in the only manifest it read. Judgement now comes
// from `catalog/facts.yaml` through `src/core/evidence.ts`, so ONE engine
// answers "which packs does this repository qualify for" rather than two that
// could disagree.
//
// What survives here is the part that was never a rule: reading the user's own
// `.alpha-aos/stack.yaml` strictly and reporting what it is without acting on
// it. The `manifestKey` detector consumes this route, and plan 02-07 extends
// it for D-06 overrides.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectStackManifest } from "../types.js";
import { loadPackCatalogStrict } from "./pack-catalog.js";
import { findPackageRoot, RootKeyedCache } from "./paths.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

// Both caches are keyed by the RESOLVED package root, not by nothing. Keyed by
// nothing, the first caller in a process decided the manifest schema and the
// declared pack id set for every later caller with a different root, so an
// override could be refused by a catalog that never evaluated the packs
// (WR-09). See `RootKeyedCache` for what happens at the bound.
const manifestSchemas = new RootKeyedCache<Record<string, unknown>>();
const declaredPackIdSets = new RootKeyedCache<ReadonlySet<string>>();

/**
 * The discovery fallback, for a caller that genuinely has no root to supply.
 *
 * Exported shape: callers state `null` at the call site to ask for this, so
 * the fallback is a choice someone wrote down rather than the silent default
 * an omitted argument used to be.
 */
function packageDirectoryOrThrow(): string {
  const packageDirectory = findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
  if (packageDirectory === null) throw new Error("Could not locate the alpha-AOS package root");
  return packageDirectory;
}

async function loadManifestSchema(packageRoot: string): Promise<Record<string, unknown>> {
  return manifestSchemas.load(
    packageRoot,
    async () =>
      JSON.parse(await readFile(join(packageRoot, "schemas", "project-stack.schema.json"), "utf8")) as Record<
        string,
        unknown
      >,
  );
}

/**
 * The declared pack id set a `packOverrides` key is checked against, for ONE
 * package root.
 *
 * Memoized per root: a catalog is repository-owned and does not change within
 * a process, and the invariant must be unconditional. Making the check
 * optional would let an unknown override key through on whichever route forgot
 * to pass the set, which is exactly the silent acceptance D-06 must not have —
 * but memoizing it globally was the mirror-image failure, letting a KNOWN key
 * through, or refusing one, on the strength of a catalog the caller never named.
 */
async function loadDeclaredPackIds(packageRoot: string): Promise<ReadonlySet<string>> {
  return declaredPackIdSets.load(packageRoot, async () => {
    const catalog = await loadPackCatalogStrict(packageRoot);
    return new Set(catalog.value.packs.map((pack) => pack.id));
  });
}

/**
 * How many roots each manifest cache currently holds.
 *
 * Exported so the declared bound is PROVEN by loading more roots than it
 * admits and observing the size, rather than asserted in a comment.
 */
export function manifestCacheSizes(): { readonly schemas: number; readonly packIds: number } {
  return { schemas: manifestSchemas.size, packIds: declaredPackIdSets.size };
}

function manifestInvariants(value: unknown, packIds: ReadonlySet<string>): ValidationIssue[] {
  const manifest = value as ProjectStackManifest;
  const issues: ValidationIssue[] = [];

  // D-06: an override naming a pack the catalog does not declare is a refusal,
  // in exactly the shape `domain.sealed-unsupported` uses. Silently ignoring it
  // would let a user believe a capability was forced on when nothing was.
  // The offending key never enters the issue: only its shape is reported.
  const overrides = manifest.packOverrides;
  if (overrides !== undefined) {
    const safe = Object.assign(Object.create(null) as Record<string, unknown>, overrides);
    for (const key of Object.keys(safe).sort()) {
      if (packIds.has(key)) continue;
      issues.push({
        code: "domain.unknown-pack-override",
        documentPath: `/packOverrides/${key}`,
        expected: "every override to name a declared pack in catalog/packs/*.yaml",
        actualShape: `string(length=${key.length})`,
      });
    }
  }

  const isolation = manifest.isolation;
  if (isolation === undefined) return issues;

  if (isolation.mode === "sealed") {
    // `sealed` has no OS/container adapter yet and must fail closed rather
    // than be silently treated as `project-only`.
    issues.push({
      code: "domain.sealed-unsupported",
      documentPath: "/isolation/mode",
      expected: "a mode with an available adapter (managed or project-only)",
      actualShape: "string(length=6)",
    });
  }
  if (isolation.execution.isolation === "container") {
    issues.push({
      code: "domain.container-unsupported",
      documentPath: "/isolation/execution/isolation",
      expected: "process isolation until a container adapter exists",
      actualShape: "string(length=9)",
    });
  }
  return issues;
}

export interface ProjectManifestInspection {
  status: ValidationResult["status"];
  /** Populated only for a current, valid manifest. */
  value: ProjectStackManifest | null;
  /** Populated only for a supported older version. */
  readOnlyValue: unknown;
  migration: MigrationPlan | null;
  extensions: Record<string, unknown>;
  issues: readonly ValidationIssue[];
}

/**
 * Reads a project manifest through the strict route and reports what it is,
 * without acting on it. Returns null when no manifest exists.
 *
 * `packageRoot` names the alpha-AOS package root whose catalog and schema
 * decide this manifest — the SAME root the caller hands `loadPackCatalogStrict`
 * to evaluate packs, so an override and the packs are judged by one catalog.
 * It is required rather than optional: `null` is the explicit request for the
 * discovery fallback, which follows `readPackReceiptsStrict`'s convention of
 * taking the root it needs rather than rediscovering one.
 */
export async function inspectProjectManifest(
  inputRoot: string,
  packageRoot: string | null,
): Promise<ProjectManifestInspection | null> {
  const manifestPath = join(resolve(inputRoot), ".alpha-aos", "stack.yaml");
  if (!existsSync(manifestPath)) return null;

  const resolvedPackageRoot = packageRoot ?? packageDirectoryOrThrow();
  const packIds = await loadDeclaredPackIds(resolvedPackageRoot);
  const result = validateManagedDocument<ProjectStackManifest>({
    text: await readFile(manifestPath, "utf8"),
    format: "yaml",
    kind: "project-manifest",
    schema: await loadManifestSchema(resolvedPackageRoot),
    domain: (value) => manifestInvariants(value, packIds),
  });

  return {
    status: result.status,
    value: result.status === "current" ? result.value : null,
    readOnlyValue: result.readOnlyValue,
    migration: createMigrationPlan(result),
    extensions: result.extensions,
    issues: result.issues,
  };
}
