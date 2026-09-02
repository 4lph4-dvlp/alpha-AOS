import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { createIsolationLaunchSpec } from "../adapters/isolation.js";
import type {
  DoctorFinding,
  HarnessId,
  IsolationLaunchSpec,
  IsolationMode,
  IsolationPlan,
  ProjectIsolationPolicy,
  ProjectStackManifest,
} from "../types.js";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";

const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function uniqueStrings(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  return [...new Set(value as string[])];
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be boolean`);
  return value;
}

export function defaultIsolationPolicy(mode: IsolationMode, allowedHarnesses: HarnessId[]): ProjectIsolationPolicy {
  if (allowedHarnesses.length === 0) throw new Error("At least one allowed harness is required");
  if (mode === "sealed" && allowedHarnesses.length !== 1) throw new Error("sealed mode requires exactly one allowed harness");
  const inherit = mode === "managed";
  return {
    mode,
    allowedHarnesses: [...new Set(allowedHarnesses)],
    exclusive: mode !== "managed",
    inherit: {
      globalConfig: inherit,
      globalSkills: inherit,
      globalMcp: inherit,
      globalMemory: inherit,
      globalHooks: inherit,
    },
    allowedSkills: [],
    allowedMcp: [],
    execution: {
      isolation: mode === "sealed" ? "container" : "process",
      network: mode === "sealed" ? "allowlist" : "inherited",
      environment: mode === "sealed" ? "allowlist" : "inherited",
    },
  };
}

function validateIsolation(raw: unknown): ProjectIsolationPolicy {
  if (typeof raw !== "object" || raw === null) throw new Error("isolation must be an object");
  const value = raw as Record<string, unknown>;
  if (!(["managed", "project-only", "sealed"] as unknown[]).includes(value.mode)) throw new Error("isolation.mode is invalid");
  const mode = value.mode as IsolationMode;
  const allowed = uniqueStrings(value.allowedHarnesses, "isolation.allowedHarnesses");
  if (allowed.some((entry) => !harnesses.includes(entry as HarnessId))) throw new Error("isolation.allowedHarnesses contains an unknown harness");
  if (allowed.length === 0) throw new Error("isolation.allowedHarnesses must not be empty");
  if (mode === "sealed" && allowed.length !== 1) throw new Error("sealed mode requires exactly one allowed harness");
  const inheritRaw = value.inherit;
  if (typeof inheritRaw !== "object" || inheritRaw === null) throw new Error("isolation.inherit must be an object");
  const inheritValue = inheritRaw as Record<string, unknown>;
  const executionRaw = value.execution;
  if (typeof executionRaw !== "object" || executionRaw === null) throw new Error("isolation.execution must be an object");
  const executionValue = executionRaw as Record<string, unknown>;
  if (!(["process", "container"] as unknown[]).includes(executionValue.isolation)) throw new Error("isolation.execution.isolation is invalid");
  if (!(["inherited", "disabled", "allowlist"] as unknown[]).includes(executionValue.network)) throw new Error("isolation.execution.network is invalid");
  if (!(["inherited", "allowlist"] as unknown[]).includes(executionValue.environment)) throw new Error("isolation.execution.environment is invalid");

  const policy: ProjectIsolationPolicy = {
    mode,
    allowedHarnesses: allowed as HarnessId[],
    exclusive: booleanValue(value.exclusive, "isolation.exclusive"),
    inherit: {
      globalConfig: booleanValue(inheritValue.globalConfig, "isolation.inherit.globalConfig"),
      globalSkills: booleanValue(inheritValue.globalSkills, "isolation.inherit.globalSkills"),
      globalMcp: booleanValue(inheritValue.globalMcp, "isolation.inherit.globalMcp"),
      globalMemory: booleanValue(inheritValue.globalMemory, "isolation.inherit.globalMemory"),
      globalHooks: booleanValue(inheritValue.globalHooks, "isolation.inherit.globalHooks"),
    },
    allowedSkills: uniqueStrings(value.allowedSkills, "isolation.allowedSkills"),
    allowedMcp: uniqueStrings(value.allowedMcp, "isolation.allowedMcp"),
    execution: {
      isolation: executionValue.isolation as "process" | "container",
      network: executionValue.network as "inherited" | "disabled" | "allowlist",
      environment: executionValue.environment as "inherited" | "allowlist",
    },
  };
  if (mode !== "managed" && Object.values(policy.inherit).some(Boolean)) {
    throw new Error(`${mode} mode cannot inherit global config, skills, MCP, memory, or hooks`);
  }
  if (mode === "sealed" && (policy.execution.isolation !== "container" || !policy.exclusive)) {
    throw new Error("sealed mode requires exclusive=true and execution.isolation=container");
  }
  return policy;
}

export function isolationManifestPath(projectRoot: string): string {
  return join(resolve(projectRoot), ".alpha-aos", "stack.yaml");
}

export function isolationProjectId(projectRoot: string): string {
  const canonical = resolve(projectRoot).replaceAll("\\", "/").toLowerCase();
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export async function readProjectManifest(projectRoot: string): Promise<ProjectStackManifest> {
  const path = isolationManifestPath(projectRoot);
  if (!existsSync(path)) throw new Error(`Project manifest not found: ${path}`);
  const raw = parse(await readFile(path, "utf8")) as unknown;
  if (typeof raw !== "object" || raw === null) throw new Error("Project manifest must be an object");
  const record = raw as Record<string, unknown>;
  if (record.schemaVersion !== 1) throw new Error("Project manifest schemaVersion must be 1");
  const result = raw as ProjectStackManifest;
  if (result.isolation) result.isolation = validateIsolation(result.isolation);
  return result;
}

export async function renderIsolationManifest(projectRoot: string, mode: IsolationMode, allowedHarnesses: HarnessId[], trust = false): Promise<string> {
  const path = isolationManifestPath(projectRoot);
  let manifest: ProjectStackManifest = { schemaVersion: 1, trusted: false };
  if (existsSync(path)) {
    const parsed = parse(await readFile(path, "utf8")) as ProjectStackManifest;
    if (parsed.schemaVersion !== 1) throw new Error("Existing project manifest schemaVersion must be 1");
    manifest = parsed;
  }
  if (trust) manifest.trusted = true;
  manifest.isolation = defaultIsolationPolicy(mode, allowedHarnesses);
  return stringify(manifest, { lineWidth: 120 });
}

async function discoverSkillPaths(projectRoot: string): Promise<Map<string, string>> {
  const roots = [join(projectRoot, ".agents", "skills"), join(projectRoot, ".claude", "skills"), join(projectRoot, ".pi", "skills")];
  const skills = new Map<string, string>();
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md")) && !skills.has(entry.name)) {
        skills.set(entry.name, join(root, entry.name, "SKILL.md"));
      }
    }
  }
  return skills;
}

function runtimeFiles(runtimeRoot: string, policy: ProjectIsolationPolicy): Array<{ target: string; content: string }> {
  const marker = {
    schemaVersion: 1,
    managedBy: "alpha-aos",
    projectId: basename(runtimeRoot),
    mode: policy.mode,
    policyHash: createHash("sha256").update(JSON.stringify(policy)).digest("hex"),
  };
  const files = [{ target: join(runtimeRoot, "runtime.json"), content: `${JSON.stringify(marker, null, 2)}\n` }];
  for (const harness of policy.allowedHarnesses) {
    if (harness === "claude") files.push({ target: join(runtimeRoot, harness, "settings.json"), content: "{}\n" });
    if (harness === "codex") files.push({ target: join(runtimeRoot, harness, "config.toml"), content: "# Managed isolated Codex profile.\n" });
    if (harness === "antigravity") files.push({ target: join(runtimeRoot, harness, "home", ".gemini", "antigravity-cli", "settings.json"), content: "{}\n" });
    if (harness === "pi") files.push({ target: join(runtimeRoot, harness, "settings.json"), content: "{}\n" });
    if (harness === "hermes") files.push({ target: join(runtimeRoot, harness, "config.yaml"), content: "{}\n" });
  }
  return files;
}

async function discoverProjectMcpNames(projectRoot: string): Promise<Set<string>> {
  const names = new Set<string>();
  for (const path of [join(projectRoot, ".mcp.json"), join(projectRoot, ".agents", "mcp_config.json"), join(projectRoot, ".pi", "settings.json")]) {
    if (!existsSync(path)) continue;
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      const servers = value.mcpServers;
      if (typeof servers === "object" && servers !== null) Object.keys(servers).forEach((name) => names.add(name));
    } catch {
      throw new Error(`Could not parse project MCP JSON: ${path}`);
    }
  }
  const codexConfig = join(projectRoot, ".codex", "config.toml");
  if (existsSync(codexConfig)) {
    const text = await readFile(codexConfig, "utf8");
    for (const match of text.matchAll(/^\[mcp_servers\.([A-Za-z0-9_-]+)(?:\.[^\]]+)?\]/gmu)) {
      if (match[1]) names.add(match[1]);
    }
  }
  const hermesConfig = join(projectRoot, ".hermes", "config.yaml");
  if (existsSync(hermesConfig)) {
    const value = parse(await readFile(hermesConfig, "utf8")) as Record<string, unknown>;
    const servers = value.mcp_servers ?? value.mcpServers;
    if (typeof servers === "object" && servers !== null) Object.keys(servers).forEach((name) => names.add(name));
  }
  return names;
}

export async function createIsolationPlan(projectRootInput: string, stateRoot = userStateRoot()): Promise<IsolationPlan> {
  const projectRoot = resolve(projectRootInput);
  const manifest = await readProjectManifest(projectRoot);
  if (!manifest.isolation) throw new Error("Project manifest has no isolation policy; run project isolate init first");
  const projectId = isolationProjectId(projectRoot);
  const runtimeRoot = join(stateRoot, "isolated", projectId);
  const discovered = await discoverSkillPaths(projectRoot);
  const allowedSkillPaths = manifest.isolation.allowedSkills.map((name) => discovered.get(name)).filter((value): value is string => Boolean(value));
  const launches = harnesses.map((harness) => createIsolationLaunchSpec({
    projectId,
    projectRoot,
    harness,
    policy: manifest.isolation as ProjectIsolationPolicy,
    runtimeRoot,
    allowedSkillPaths,
  }));
  if (manifest.trusted !== true) {
    for (const launch of launches) launch.blockedReasons.push("project manifest is not trusted; re-run isolate init with --trust after reviewing the repository");
  }
  return {
    schemaVersion: 1,
    projectId,
    projectRoot,
    manifestPath: isolationManifestPath(projectRoot),
    runtimeRoot,
    policy: manifest.isolation,
    launches,
    generatedFiles: runtimeFiles(runtimeRoot, manifest.isolation).map((file) => file.target),
  };
}

export async function applyIsolationManifest(options: {
  projectRoot: string;
  mode: IsolationMode;
  allowedHarnesses: HarnessId[];
  trust?: boolean;
  stateRoot?: string;
}): Promise<string> {
  const projectRoot = resolve(options.projectRoot);
  const stateRoot = options.stateRoot ?? userStateRoot();
  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [projectRoot],
    operations: [{ target: isolationManifestPath(projectRoot), content: await renderIsolationManifest(projectRoot, options.mode, options.allowedHarnesses, options.trust ?? false) }],
  });
  return journal.id;
}

export async function syncIsolationRuntime(projectRoot: string, stateRoot = userStateRoot()): Promise<string | null> {
  const plan = await createIsolationPlan(projectRoot, stateRoot);
  const files = runtimeFiles(plan.runtimeRoot, plan.policy);
  const current = await Promise.all(files.map(async (file) => existsSync(file.target) && await readFile(file.target, "utf8") === file.content));
  if (current.every(Boolean)) return null;
  const journal = await applyFileTransaction({ stateRoot, allowedRoots: [plan.runtimeRoot], operations: files });
  return journal.id;
}

export async function doctorIsolation(projectRoot: string, stateRoot = userStateRoot()): Promise<DoctorFinding[]> {
  const plan = await createIsolationPlan(projectRoot, stateRoot);
  const findings: DoctorFinding[] = [];
  findings.push({ level: "ok", code: "ISOLATION_POLICY", message: `${plan.policy.mode} policy is valid for ${plan.policy.allowedHarnesses.join(", ")}` });
  if (!existsSync(join(plan.runtimeRoot, "runtime.json"))) {
    findings.push({ level: "error", code: "ISOLATION_NOT_SYNCED", message: "Isolated runtime is missing; run project isolate sync --apply" });
  } else {
    findings.push({ level: "ok", code: "ISOLATION_RUNTIME", message: "Isolated runtime marker exists" });
  }
  const discovered = await discoverSkillPaths(plan.projectRoot);
  const unexpected = [...discovered.keys()].filter((name) => !plan.policy.allowedSkills.includes(name));
  const missing = plan.policy.allowedSkills.filter((name) => !discovered.has(name));
  if (unexpected.length > 0) findings.push({ level: "error", code: "PROJECT_SKILL_NOT_ALLOWED", message: `Project skill directories are not allowlisted: ${unexpected.join(", ")}` });
  if (missing.length > 0) findings.push({ level: "error", code: "PROJECT_SKILL_MISSING", message: `Allowlisted project skills are missing: ${missing.join(", ")}` });
  if (unexpected.length === 0 && missing.length === 0) findings.push({ level: "ok", code: "PROJECT_SKILL_ALLOWLIST", message: "Project skill directories match the allowlist" });
  const discoveredMcp = await discoverProjectMcpNames(plan.projectRoot);
  const unexpectedMcp = [...discoveredMcp].filter((name) => !plan.policy.allowedMcp.includes(name));
  const missingMcp = plan.policy.allowedMcp.filter((name) => !discoveredMcp.has(name));
  if (unexpectedMcp.length > 0) findings.push({ level: "error", code: "PROJECT_MCP_NOT_ALLOWED", message: `Project MCP servers are not allowlisted: ${unexpectedMcp.join(", ")}` });
  if (missingMcp.length > 0) findings.push({ level: "error", code: "PROJECT_MCP_MISSING", message: `Allowlisted project MCP servers are missing: ${missingMcp.join(", ")}` });
  if (unexpectedMcp.length === 0 && missingMcp.length === 0) findings.push({ level: "ok", code: "PROJECT_MCP_ALLOWLIST", message: "Project MCP servers match the allowlist" });
  for (const launch of plan.launches.filter((entry) => plan.policy.allowedHarnesses.includes(entry.harness))) {
    for (const reason of launch.blockedReasons) findings.push({ level: "error", code: `LAUNCH_${launch.harness.toUpperCase()}_BLOCKED`, message: reason });
  }
  return findings;
}

export function selectIsolationLaunch(plan: IsolationPlan, harness: HarnessId): IsolationLaunchSpec {
  const launch = plan.launches.find((entry) => entry.harness === harness);
  if (!launch) throw new Error(`No launch adapter for ${harness}`);
  if (launch.blockedReasons.length > 0) throw new Error(`Isolated ${harness} launch blocked: ${launch.blockedReasons.join("; ")}`);
  if (!existsSync(join(plan.runtimeRoot, "runtime.json"))) throw new Error("Isolated runtime is not synced; run project isolate sync --apply");
  return launch;
}

export async function cleanIsolationRuntime(projectRoot: string, stateRoot = userStateRoot()): Promise<string> {
  const projectId = isolationProjectId(projectRoot);
  const isolatedRoot = resolve(stateRoot, "isolated");
  const target = resolve(isolatedRoot, projectId);
  if (!inside(isolatedRoot, target) || target === isolatedRoot) throw new Error("Refusing to clean an unsafe isolation path");
  const marker = join(target, "runtime.json");
  if (!existsSync(target)) return "already absent";
  if (!existsSync(marker)) throw new Error(`Refusing to clean an unmarked directory: ${target}`);
  const parsed = JSON.parse(await readFile(marker, "utf8")) as Record<string, unknown>;
  if (parsed.managedBy !== "alpha-aos") {
    throw new Error(`Refusing to clean a runtime without an alpha-AOS marker: ${target}`);
  }
  if (parsed.projectId !== projectId) throw new Error(`Refusing to clean a runtime with a mismatched project marker: ${target}`);
  await rm(target, { recursive: true, force: false });
  return target.replace(resolve(homedir()), "~");
}
