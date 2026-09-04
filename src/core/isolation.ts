import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rmdir } from "node:fs/promises";
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
import { packageRoot, userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type MigrationPlan,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

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

// ---------------------------------------------------------------------------
// Complete operation plans
// ---------------------------------------------------------------------------

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Every path role a state-root mutation must declare. */
function stateRoles(stateRoot: string): OperationPathInput[] {
  return [
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
  ];
}

export interface IsolationManifestOperationPlan {
  kind: "isolation-manifest";
  projectRoot: string;
  manifestPath: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  mode: IsolationMode;
  allowedHarnesses: readonly HarnessId[];
  trust: boolean;
  currentHash: string | null;
  /** Hash of the manifest that would be written; the text is not recorded. */
  renderedHash: string;
  action: "create" | "update" | "current";
  proofs: OperationPathProofSet;
  digest: string;
}

export interface IsolationManifestOptions {
  projectRoot: string;
  mode: IsolationMode;
  allowedHarnesses: HarnessId[];
  trust?: boolean;
  stateRoot?: string;
}

/**
 * Renders the manifest and enumerates the paths writing it would touch,
 * without writing anything. Invalid existing manifests refuse here.
 */
export async function planIsolationManifestOperation(options: IsolationManifestOptions): Promise<IsolationManifestOperationPlan> {
  const projectRoot = resolve(options.projectRoot);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const manifestPath = isolationManifestPath(projectRoot);
  const trust = options.trust ?? false;
  const rendered = await renderIsolationManifest(projectRoot, options.mode, options.allowedHarnesses, trust);
  const currentHash = existsSync(manifestPath) ? sha256(await readFile(manifestPath)) : null;
  const renderedHash = sha256(rendered);

  const allowedRoots = [projectRoot, stateRoot];
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: manifestPath },
      { role: "source", path: manifestPath },
      ...stateRoles(stateRoot),
    ],
    allowedRoots,
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });

  const action = currentHash === renderedHash ? "current" : currentHash === null ? "create" : "update";
  const digest = reviewedDigest("isolation-manifest", {
    projectRoot,
    manifestPath,
    stateRoot,
    allowedRoots,
    mode: options.mode,
    allowedHarnesses: options.allowedHarnesses,
    trust,
    currentHash,
    renderedHash,
    action,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "isolation-manifest",
    projectRoot,
    manifestPath,
    stateRoot,
    allowedRoots,
    mode: options.mode,
    allowedHarnesses: [...options.allowedHarnesses],
    trust,
    currentHash,
    renderedHash,
    action,
    proofs,
    digest,
  };
}

export interface SessionAwareOptions<Plan> {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: Plan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

export async function applyIsolationManifest(
  options: IsolationManifestOptions & SessionAwareOptions<IsolationManifestOperationPlan>,
): Promise<string> {
  const reviewed = options.plan ?? await planIsolationManifestOperation(options);
  const revalidated = await planIsolationManifestOperation({
    projectRoot: reviewed.projectRoot,
    mode: reviewed.mode,
    allowedHarnesses: [...reviewed.allowedHarnesses],
    trust: reviewed.trust,
    stateRoot: reviewed.stateRoot,
  });
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    const proof = plannedProof(reviewed, "target", reviewed.manifestPath);
    await assertUnchangedSincePlan(reviewed, proof);
    const rendered = await renderIsolationManifest(reviewed.projectRoot, reviewed.mode, [...reviewed.allowedHarnesses], reviewed.trust);
    if (sha256(rendered) !== reviewed.renderedHash) {
      throw new ComponentPlanError("plan-drift", `Isolation manifest changed between review and apply: ${reviewed.manifestPath}`);
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [reviewed.projectRoot],
      operations: [{ target: reviewed.manifestPath, content: rendered }],
      session,
    });
    return journal.id;
  });
}

export interface IsolationRuntimeOperationPlan {
  kind: "isolation-runtime-sync";
  projectRoot: string;
  runtimeRoot: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  manifestPath: string;
  files: ReadonlyArray<{ target: string; expectedHash: string; currentHash: string | null; action: "create" | "update" | "current" }>;
  proofs: OperationPathProofSet;
  digest: string;
  /** The plan the CLI and doctor already render. */
  isolation: IsolationPlan;
}

/** Enumerates the runtime files a sync would write, and reads nothing else. */
export async function planIsolationRuntimeOperation(projectRoot: string, stateRootInput = userStateRoot()): Promise<IsolationRuntimeOperationPlan> {
  const stateRoot = resolve(stateRootInput);
  const isolation = await createIsolationPlan(projectRoot, stateRoot);
  const rendered = runtimeFiles(isolation.runtimeRoot, isolation.policy);
  const files = await Promise.all(rendered.map(async (file) => {
    const currentHash = existsSync(file.target) ? sha256(await readFile(file.target)) : null;
    const expectedHash = sha256(file.content);
    return {
      target: file.target,
      expectedHash,
      currentHash,
      action: currentHash === expectedHash ? "current" as const : currentHash === null ? "create" as const : "update" as const,
    };
  }));

  const allowedRoots = [isolation.runtimeRoot, stateRoot];
  const proofs = await proveOperationPaths({
    inputs: [
      ...files.map((file): OperationPathInput => ({ role: "target", path: file.target })),
      ...stateRoles(stateRoot),
      { role: "source", path: isolation.manifestPath },
    ],
    allowedRoots: [...allowedRoots, resolve(isolation.projectRoot)],
    requiredRoles: ["target", "state", "journal", "snapshot", "source"],
  });

  const digest = reviewedDigest("isolation-runtime-sync", {
    projectRoot: isolation.projectRoot,
    projectId: isolation.projectId,
    runtimeRoot: isolation.runtimeRoot,
    stateRoot,
    allowedRoots,
    manifestPath: isolation.manifestPath,
    policy: isolation.policy,
    files,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "isolation-runtime-sync",
    projectRoot: isolation.projectRoot,
    runtimeRoot: isolation.runtimeRoot,
    stateRoot,
    allowedRoots,
    manifestPath: isolation.manifestPath,
    files,
    proofs,
    digest,
    isolation,
  };
}

export async function syncIsolationRuntime(
  projectRoot: string,
  stateRoot = userStateRoot(),
  options: SessionAwareOptions<IsolationRuntimeOperationPlan> = {},
): Promise<string | null> {
  const reviewed = options.plan ?? await planIsolationRuntimeOperation(projectRoot, stateRoot);
  if (reviewed.files.every((file) => file.action === "current")) return null;

  const revalidated = await planIsolationRuntimeOperation(reviewed.projectRoot, reviewed.stateRoot);
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    const contents = runtimeFiles(reviewed.runtimeRoot, revalidated.isolation.policy);
    const operations: Array<{ target: string; content: string }> = [];
    for (const file of reviewed.files) {
      const content = contents.find((candidate) => candidate.target === file.target);
      if (content === undefined || sha256(content.content) !== file.expectedHash) {
        throw new ComponentPlanError("plan-drift", `Isolated runtime content changed since it was reviewed: ${file.target}`);
      }
      const proof = plannedProof(reviewed, "target", file.target);
      await assertUnchangedSincePlan(reviewed, proof);
      operations.push({ target: file.target, content: content.content });
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [reviewed.runtimeRoot],
      operations,
      session,
    });
    return journal.id;
  });
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

export interface IsolationCleanOperationPlan {
  kind: "isolation-clean";
  projectRoot: string;
  projectId: string;
  runtimeRoot: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  status: "already-absent" | "removable";
  markerPath: string;
  markerHash: string | null;
  /** Every regular file to remove, deepest first. */
  files: ReadonlyArray<{ target: string; hash: string }>;
  /** Every directory to remove once its files are gone, deepest first. */
  directories: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
}

/**
 * Walks a generated runtime, deepest entry first. Anything that is neither a
 * plain file nor a directory — a symlink or a device node — refuses: this
 * tool only removes what it generated, and it generated neither.
 */
async function walkRuntime(root: string): Promise<{ files: string[]; directories: string[] }> {
  const files: string[] = [];
  const directories: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        directories.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        throw new Error(`Refusing to clean a runtime containing an entry this tool did not generate: ${path}`);
      }
    }
  }
  await visit(root);
  directories.push(root);
  return { files, directories };
}

/**
 * Proves a generated runtime is alpha-AOS's to remove and enumerates every
 * entry the removal would touch. Reads only; every refusal happens here,
 * before a writer exists.
 */
export async function planIsolationClean(projectRoot: string, stateRootInput = userStateRoot()): Promise<IsolationCleanOperationPlan> {
  const projectId = isolationProjectId(projectRoot);
  const stateRoot = resolve(stateRootInput);
  const isolatedRoot = resolve(stateRoot, "isolated");
  const target = resolve(isolatedRoot, projectId);
  if (!inside(isolatedRoot, target) || target === isolatedRoot) throw new Error("Refusing to clean an unsafe isolation path");
  const marker = join(target, "runtime.json");

  const base = {
    kind: "isolation-clean" as const,
    projectRoot: resolve(projectRoot),
    projectId,
    runtimeRoot: target,
    stateRoot,
  };

  if (!existsSync(target)) {
    const proofs = await proveOperationPaths({
      inputs: stateRoles(stateRoot),
      allowedRoots: [stateRoot],
      requiredRoles: ["state", "journal", "snapshot"],
    });
    return {
      ...base,
      allowedRoots: [stateRoot],
      status: "already-absent",
      markerPath: marker,
      markerHash: null,
      files: [],
      directories: [],
      proofs,
      digest: reviewedDigest("isolation-clean", { ...base, status: "already-absent" }),
    };
  }
  if (!existsSync(marker)) throw new Error(`Refusing to clean an unmarked directory: ${target}`);

  // The marker is the only evidence that this directory is alpha-AOS's to
  // remove, so it is read strictly. A malformed, extended or unknown-version
  // marker leaves the directory alone rather than being partially trusted.
  const inspection = await inspectRuntimeMarker(marker);
  if (inspection.status !== "current" || inspection.value === null) {
    const detail = inspection.issues[0];
    throw new Error(
      `Refusing to clean a runtime whose marker is not a valid current record (${inspection.status}` +
        `${detail ? `: ${detail.code} at ${detail.documentPath}` : ""}): ${target}`,
    );
  }
  if (inspection.value.projectId !== projectId) {
    throw new Error(`Refusing to clean a runtime with a mismatched project marker: ${target}`);
  }

  const walked = await walkRuntime(target);
  const files = await Promise.all(walked.files.map(async (path) => ({ target: path, hash: sha256(await readFile(path)) })));
  const allowedRoots = [target, stateRoot];
  const proofs = await proveOperationPaths({
    inputs: [
      ...files.map((file): OperationPathInput => ({ role: "target", path: file.target })),
      ...stateRoles(stateRoot),
      { role: "source", path: marker },
    ],
    allowedRoots,
    requiredRoles: ["target", "state", "journal", "snapshot", "source"],
  });

  const digest = reviewedDigest("isolation-clean", {
    ...base,
    allowedRoots,
    status: "removable",
    markerPath: marker,
    marker: inspection.value,
    files,
    directories: walked.directories,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    ...base,
    allowedRoots,
    status: "removable",
    markerPath: marker,
    markerHash: files.find((file) => file.target === marker)?.hash ?? null,
    files,
    directories: walked.directories,
    proofs,
    digest,
  };
}

export async function cleanIsolationRuntime(
  projectRoot: string,
  stateRoot = userStateRoot(),
  options: SessionAwareOptions<IsolationCleanOperationPlan> = {},
): Promise<string> {
  const reviewed = options.plan ?? await planIsolationClean(projectRoot, stateRoot);
  if (reviewed.status === "already-absent") return "already absent";

  const revalidated = await planIsolationClean(reviewed.projectRoot, reviewed.stateRoot);
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    for (const file of reviewed.files) {
      const proof = plannedProof(reviewed, "target", file.target);
      await assertUnchangedSincePlan(reviewed, proof);
    }
    // Each removal is snapshotted and journaled, so an interrupted clean is
    // recoverable rather than a half-deleted directory.
    await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [reviewed.runtimeRoot],
      operations: reviewed.files.map((file) => ({ target: file.target, content: null })),
      session,
    });
    // Only the now-empty directories the plan enumerated are removed, deepest
    // first, so an entry that appeared meanwhile blocks with ENOTEMPTY.
    for (const directory of reviewed.directories) await rmdir(directory);
    return reviewed.runtimeRoot.replace(resolve(homedir()), "~");
  });
}

export interface RuntimeMarker {
  schemaVersion: number;
  managedBy: "alpha-aos";
  projectId: string;
  mode: IsolationMode;
  policyHash: string;
}

export interface RuntimeMarkerInspection {
  status: ValidationResult["status"];
  /** Populated only for a current, valid marker. */
  value: RuntimeMarker | null;
  /** Populated only for a supported older version. */
  readOnlyValue: unknown;
  migration: MigrationPlan | null;
  extensions: Record<string, unknown>;
  issues: readonly ValidationIssue[];
}

let installStateSchema: Record<string, unknown> | null = null;

async function loadInstallStateSchema(): Promise<Record<string, unknown>> {
  if (installStateSchema !== null) return installStateSchema;
  const packageDirectory = packageRoot();
  installStateSchema = JSON.parse(
    await readFile(join(packageDirectory, "schemas", "install-state.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  return installStateSchema;
}

/**
 * Reads a runtime marker through the strict route without acting on it. An
 * older supported version is readable and yields a migration plan; an unknown
 * newer one refuses, because a marker this tool does not understand is not
 * evidence that the directory is safe to remove.
 */
export async function inspectRuntimeMarker(markerPath: string): Promise<RuntimeMarkerInspection> {
  const result = validateManagedDocument<RuntimeMarker>({
    text: await readFile(markerPath, "utf8"),
    format: "json",
    kind: "install-state",
    schema: await loadInstallStateSchema(),
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
