import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectDetection, ProjectStackManifest } from "../types.js";
import { findPackageRoot } from "./paths.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

const webFrameworks = ["react", "next", "vue", "nuxt", "svelte", "@sveltejs/kit"];
const postgresPackages = ["pg", "postgres", "psycopg", "psycopg2", "asyncpg"];
const redisPackages = ["redis", "ioredis", "aioredis"];
const modelPackages = ["openai", "@anthropic-ai/sdk", "anthropic", "google-generativeai", "@google/generative-ai"];
const agentPackages = ["langchain", "@langchain/core", "crewai", "autogen", "pydantic-ai"];
const mcpPackages = ["@modelcontextprotocol/sdk", "mcp"];

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some((candidate) => values.has(candidate));
}

async function packageDependencies(root: string): Promise<Set<string>> {
  const packageFile = join(root, "package.json");
  if (!existsSync(packageFile)) return new Set();
  const pkg = JSON.parse(await readFile(packageFile, "utf8")) as Record<string, unknown>;
  const values = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .flatMap((entry) => Object.keys(entry));
  return new Set(values);
}

export async function detectProject(inputRoot: string): Promise<ProjectDetection> {
  const root = resolve(inputRoot);
  const dependencies = await packageDependencies(root);
  const evidence = new Set<string>();
  const packs = new Set<string>();

  const hasWeb = hasAny(dependencies, webFrameworks);
  const hasBrowserEntrypoint = ["app", "pages", "src", "public"].some((path) => existsSync(join(root, path)));
  if (hasWeb) evidence.add("web-framework");
  if (hasBrowserEntrypoint) evidence.add("browser-entrypoint");
  if (hasWeb && hasBrowserEntrypoint) packs.add("WEB_BASE");
  if (hasAny(dependencies, ["react", "next"])) packs.add("WEB_REACT");

  if (["Dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].some((path) => existsSync(join(root, path)))) {
    evidence.add("container-file");
    packs.add("CONTAINER");
  }
  if (["migrations", "prisma/migrations", "alembic"].some((path) => existsSync(join(root, path)))) {
    evidence.add("migration-directory");
    packs.add("DB_MIGRATION");
  }
  if (hasAny(dependencies, postgresPackages)) {
    evidence.add("postgres-driver");
    packs.add("DB_POSTGRES");
  }
  if (hasAny(dependencies, redisPackages)) {
    evidence.add("redis-client");
    packs.add("CACHE_REDIS");
  }
  if (hasAny(dependencies, mcpPackages)) {
    evidence.add("mcp-sdk-dependency");
    packs.add("MCP_SERVER");
  }
  if (hasAny(dependencies, agentPackages)) {
    evidence.add("agent-sdk-dependency");
    packs.add("AGENT_RUNTIME");
  }
  if (hasAny(dependencies, modelPackages) && ["evals", "eval", "benchmarks"].some((path) => existsSync(join(root, path)))) {
    evidence.add("model-sdk");
    evidence.add("eval-assets");
    packs.add("AI_EVAL");
  }

  const inspection = await inspectProjectManifest(root);
  // Only a current, valid manifest contributes detection evidence. A migratable
  // one is readable but is not consumed as current, and an invalid one adds
  // nothing rather than partially applying whatever happened to parse.
  const manifest = inspection?.status === "current" ? inspection.value : null;
  if (manifest !== null) {
    if (manifest.scientificResearch === true) {
      evidence.add("manifest:scientificResearch");
      packs.add("RESEARCH_SCIENTIFIC");
    }
    if (Array.isArray(manifest.criticalUserFlows) && manifest.criticalUserFlows.length > 0) {
      evidence.add("manifest:criticalUserFlows");
      packs.add("WEB_FLOW_AUDIT");
    }
  }

  return { root, evidence: [...evidence].sort(), packs: [...packs].sort() };
}

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
