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
import { findPackageRoot } from "./paths.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let manifestSchema: Record<string, unknown> | null = null;

async function loadManifestSchema(): Promise<Record<string, unknown>> {
  if (manifestSchema !== null) return manifestSchema;
  const packageDirectory = findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
  if (packageDirectory === null) throw new Error("Could not locate the alpha-AOS package root");
  manifestSchema = JSON.parse(
    await readFile(join(packageDirectory, "schemas", "project-stack.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  return manifestSchema;
}

function manifestInvariants(value: unknown): ValidationIssue[] {
  const manifest = value as ProjectStackManifest;
  const issues: ValidationIssue[] = [];
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
 */
export async function inspectProjectManifest(inputRoot: string): Promise<ProjectManifestInspection | null> {
  const manifestPath = join(resolve(inputRoot), ".alpha-aos", "stack.yaml");
  if (!existsSync(manifestPath)) return null;

  const result = validateManagedDocument<ProjectStackManifest>({
    text: await readFile(manifestPath, "utf8"),
    format: "yaml",
    kind: "project-manifest",
    schema: await loadManifestSchema(),
    domain: manifestInvariants,
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
