import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import type { ProjectDetection } from "../types.js";

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

  const manifestPath = join(root, ".alpha-aos", "stack.yaml");
  if (existsSync(manifestPath)) {
    const manifest = parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
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
