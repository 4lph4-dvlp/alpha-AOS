import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessId } from "../types.js";
import {
  BehaviorPolicyError,
  resolveProjectBehavior,
  type ProjectBehaviorInput,
} from "./behavior-policy.js";
import { findPackageRoot } from "./paths.js";
import { nodeRuntimeEnvironment } from "./install.js";
import {
  runProcess,
  type ProcessResult,
  type ProcessSpec,
} from "./process.js";
import { parseManagedDocument, validateAgainstSchema } from "./validation.js";

const ONE_MIB = 1024 * 1024;
const MAX_INPUT_BYTES = 16 * 1024;

export type GsdToolsRunner = (spec: ProcessSpec) => Promise<ProcessResult>;

export type GsdProjectReadinessDiagnosis =
  | "missing-runtime"
  | "absent-project"
  | "partial-project"
  | "ready"
  | "probe-error"
  | "unsupported";

export interface GsdProjectReadinessRuntimeInfo {
  readonly packageName: string | null;
  readonly version: string | null;
  readonly workflowHash: string | null;
  readonly configRoot: string | null;
  readonly gsdToolsPath: string | null;
}

export interface GsdNativeQueryEvidence {
  readonly query: string;
  readonly exitCode: number | null;
  readonly output: Record<string, unknown> | null;
}

export interface GsdProjectReadinessCapabilities {
  readonly agentsInstalled: boolean;
  readonly missingAgents: readonly string[];
  readonly agentsDir: string | null;
  readonly agentRuntime: string | null;
}

export interface GsdProjectReadiness {
  readonly schemaVersion: 1;
  readonly canonicalRoot: string;
  readonly projectId: string;
  readonly controller: HarnessId;
  readonly runtime: GsdProjectReadinessRuntimeInfo;
  readonly workflow: string;
  readonly phase: string | null;
  readonly diagnosis: GsdProjectReadinessDiagnosis;
  readonly ready: boolean;
  readonly executionAuthorized: false;
  readonly satisfiedPrerequisites: readonly string[];
  readonly missingPrerequisites: readonly string[];
  readonly nextAction: string;
  readonly reasons: readonly string[];
  readonly nativeEvidence?: Record<string, unknown> | undefined;
  readonly nativeQueryEvidence?: GsdNativeQueryEvidence | undefined;
  readonly capabilities?: GsdProjectReadinessCapabilities | undefined;
}

export interface GsdProjectReadinessInput {
  readonly schemaVersion: 1;
  readonly controller: HarnessId;
  readonly workflow: string;
  readonly phase?: string | undefined;
  readonly arguments?: readonly string[] | undefined;
  readonly projectRoot?: string | undefined;
  readonly boundProjectRoot?: string | undefined;
}

export interface InspectGsdProjectReadinessOptions {
  readonly inputPath?: string | undefined;
  readonly input?: unknown | undefined;
  readonly invocationPath?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly runner?: GsdToolsRunner | undefined;
}

export interface TaskReadinessErrorOptions {
  readonly code: string;
  readonly path?: string | undefined;
  readonly cause: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;
}

export class TaskReadinessError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly causeDescription: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;

  constructor(options: TaskReadinessErrorOptions) {
    super(`${options.code}: ${options.cause}`);
    this.name = "TaskReadinessError";
    this.code = options.code;
    this.path = options.path;
    this.causeDescription = options.cause;
    this.causeCategory = options.causeCategory;
    this.remediation = options.remediation;
  }
}

let cachedBootstrapSchema: Record<string, unknown> | null = null;

async function getTaskBootstrapSchema(): Promise<Record<string, unknown>> {
  if (cachedBootstrapSchema) return cachedBootstrapSchema;
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = findPackageRoot(currentDir) ?? resolve(currentDir, "..", "..");
  const schemaPath = join(pkgRoot, "schemas", "task-bootstrap.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  cachedBootstrapSchema = JSON.parse(raw) as Record<string, unknown>;
  return cachedBootstrapSchema;
}

export function resolveControllerConfigRoot(
  controller: HarnessId,
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
): string | null {
  switch (controller) {
    case "claude": {
      const dir = env.CLAUDE_CONFIG_DIR?.trim();
      return resolve(dir && dir.length > 0 ? dir : join(home, ".claude"));
    }
    case "codex": {
      const dir = env.CODEX_HOME?.trim();
      return resolve(dir && dir.length > 0 ? dir : join(home, ".codex"));
    }
    case "antigravity": {
      const dir = env.ANTIGRAVITY_CONFIG_DIR?.trim();
      if (dir && dir.length > 0) return resolve(dir);
      const candidates = [
        join(home, ".gemini", "antigravity"),
        join(home, ".gemini", "antigravity-cli"),
        join(home, ".antigravity"),
      ];
      for (const cand of candidates) {
        if (existsSync(join(cand, "gsd-core", "bin", "gsd-tools.cjs"))) {
          return resolve(cand);
        }
      }
      return resolve(join(home, ".gemini", "antigravity"));
    }
    case "pi": {
      const dir = env.PI_CODING_AGENT_DIR?.trim();
      return resolve(dir && dir.length > 0 ? dir : join(home, ".pi", "agent"));
    }
    case "hermes":
      return null;
    default:
      return null;
  }
}

export function resolveGsdToolsForController(
  controller: HarnessId,
  configRoot: string | null,
): string | null {
  if (!configRoot) return null;
  const tools = join(configRoot, "gsd-core", "bin", "gsd-tools.cjs");
  try {
    return existsSync(tools) && statSyncOrNull(tools) ? tools : null;
  } catch {
    return null;
  }
}

function statSyncOrNull(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

async function readBoundedTextFile(path: string): Promise<string> {
  const info = await stat(path);
  if (!info.isFile()) throw new Error("not a regular file");
  if (info.size > ONE_MIB) throw new Error(`file exceeds ${ONE_MIB} bytes limit`);
  const buf = await readFile(path);
  return new TextDecoder("utf-8", { fatal: true }).decode(buf);
}

interface ParsedGsdQueryResult {
  readonly ok: boolean;
  readonly code: string;
  readonly exitCode: number | null;
  readonly json: Record<string, unknown> | null;
  readonly rawText: string;
  readonly errorReason?: string | undefined;
}

async function executeGsdQuery(
  runner: GsdToolsRunner,
  gsdToolsPath: string,
  queryArgs: readonly string[],
  projectRoot: string,
): Promise<ParsedGsdQueryResult> {
  const result = await runner({
    executable: process.execPath,
    args: [gsdToolsPath, "query", ...queryArgs],
    cwd: projectRoot,
    environment: nodeRuntimeEnvironment({ source: process.env }),
    timeoutMs: 30_000,
    maxOutputBytes: ONE_MIB,
    excerptBytes: ONE_MIB,
  });

  if (result.code !== "ok" || (result.exitCode !== null && result.exitCode !== 0)) {
    return {
      ok: false,
      code: result.code,
      exitCode: result.exitCode,
      json: null,
      rawText: result.stdout.excerpt,
      errorReason: `gsd-tools query ${queryArgs.join(" ")} failed (${result.code}, exit code ${result.exitCode ?? "none"})`,
    };
  }

  if (result.outputCapped || result.stdout.capped) {
    return {
      ok: false,
      code: "capped",
      exitCode: result.exitCode,
      json: null,
      rawText: result.stdout.excerpt,
      errorReason: `gsd-tools query ${queryArgs.join(" ")} printed more than 1 MiB`,
    };
  }

  let text = result.stdout.excerpt.trim();
  if (text.startsWith("@file:")) {
    const target = text.slice("@file:".length).trim();
    if (!isAbsolute(target)) {
      return {
        ok: false,
        code: "invalid-target",
        exitCode: result.exitCode,
        json: null,
        rawText: text,
        errorReason: "gsd-tools answered with an @file: path that is not absolute",
      };
    }
    try {
      text = await readBoundedTextFile(target);
    } catch (err) {
      return {
        ok: false,
        code: "read-failed",
        exitCode: result.exitCode,
        json: null,
        rawText: text,
        errorReason: `gsd-tools answered with an @file: path that could not be read (${err instanceof Error ? err.message : "unknown"})`,
      };
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      code: "parse-error",
      exitCode: result.exitCode,
      json: null,
      rawText: text,
      errorReason: `gsd-tools query ${queryArgs.join(" ")} did not print valid JSON`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      code: "invalid-shape",
      exitCode: result.exitCode,
      json: null,
      rawText: text,
      errorReason: `gsd-tools query ${queryArgs.join(" ")} did not print a JSON object`,
    };
  }

  return {
    ok: true,
    code: "ok",
    exitCode: result.exitCode,
    json: parsed as Record<string, unknown>,
    rawText: text,
  };
}

function normalizeWorkflowName(workflow: string): string {
  switch (workflow) {
    case "conversational-quick":
    case "autopilot-quick":
      return "quick";
    case "conversational-quick-full":
    case "autopilot-quick-full":
      return "quick-full";
    case "conversational-phase":
    case "autopilot-phase":
      return "discuss-phase";
    default:
      return workflow;
  }
}

export async function inspectGsdProjectReadiness(
  options: InspectGsdProjectReadinessOptions,
): Promise<GsdProjectReadiness> {
  let rawText: string;
  let filePathForDiagnostics: string | undefined;

  if (options.inputPath !== undefined) {
    const normPath = resolve(options.inputPath);
    filePathForDiagnostics = normPath;

    let fileLstat;
    try {
      fileLstat = await lstat(normPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new TaskReadinessError({
        code: "unreadable-input",
        path: normPath,
        cause: code === "ENOENT" ? "Input file does not exist" : "Input file could not be accessed",
        causeCategory: "file-access",
        remediation: "Provide a valid, accessible file path to --input.",
      });
    }

    if (fileLstat.isSymbolicLink()) {
      throw new TaskReadinessError({
        code: "not-a-file",
        path: normPath,
        cause: "Input file is a symbolic link",
        causeCategory: "symlink-rejected",
        remediation: "Provide a regular file instead of a symbolic link.",
      });
    }

    if (!fileLstat.isFile()) {
      throw new TaskReadinessError({
        code: "not-a-file",
        path: normPath,
        cause: "Input path is not a regular file",
        causeCategory: "not-a-file",
        remediation: "Provide a path to a regular JSON file.",
      });
    }

    if (fileLstat.size > MAX_INPUT_BYTES) {
      throw new TaskReadinessError({
        code: "input-too-large",
        path: normPath,
        cause: `Input file exceeds maximum size limit of 16 KiB (${fileLstat.size} bytes > ${MAX_INPUT_BYTES} bytes)`,
        causeCategory: "byte-budget",
        remediation: "Reduce input size below 16 KiB.",
      });
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(normPath);
    } catch {
      throw new TaskReadinessError({
        code: "unreadable-input",
        path: normPath,
        cause: "Failed to read input file",
        causeCategory: "read-failed",
        remediation: "Ensure the file has read permissions.",
      });
    }

    if (buffer.length > MAX_INPUT_BYTES) {
      throw new TaskReadinessError({
        code: "input-too-large",
        path: normPath,
        cause: `Input file exceeds maximum size limit of 16 KiB (${buffer.length} bytes > ${MAX_INPUT_BYTES} bytes)`,
        causeCategory: "byte-budget",
        remediation: "Reduce input size below 16 KiB.",
      });
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      rawText = decoder.decode(buffer);
    } catch {
      throw new TaskReadinessError({
        code: "invalid-input",
        path: normPath,
        cause: "Input file contains invalid UTF-8 byte sequences",
        causeCategory: "utf8-decode-error",
        remediation: "Encode the request file in valid UTF-8 without malformed multibyte sequences.",
      });
    }
  } else if (typeof options.input === "string") {
    const buf = Buffer.from(options.input, "utf8");
    if (buf.length > MAX_INPUT_BYTES) {
      throw new TaskReadinessError({
        code: "input-too-large",
        cause: `Input exceeds 16 KiB limit (${buf.length} bytes > ${MAX_INPUT_BYTES} bytes)`,
        remediation: "Reduce input size below 16 KiB.",
      });
    }
    rawText = options.input;
  } else if (typeof options.input === "object" && options.input !== null) {
    rawText = JSON.stringify(options.input);
    const buf = Buffer.from(rawText, "utf8");
    if (buf.length > MAX_INPUT_BYTES) {
      throw new TaskReadinessError({
        code: "input-too-large",
        cause: `Input exceeds 16 KiB limit (${buf.length} bytes > ${MAX_INPUT_BYTES} bytes)`,
        remediation: "Reduce input size below 16 KiB.",
      });
    }
  } else {
    throw new TaskReadinessError({
      code: "empty-input",
      cause: "No input provided for task readiness",
      remediation: "Provide a JSON input file via --input.",
    });
  }

  if (rawText.trim().length === 0) {
    throw new TaskReadinessError({
      code: "empty-input",
      path: filePathForDiagnostics,
      cause: "Input file is empty",
      causeCategory: "empty-file",
      remediation: "Provide a valid, non-empty JSON readiness request object.",
    });
  }

  const parseResult = parseManagedDocument({ text: rawText, format: "json" });
  if (!parseResult.ok) {
    const isDuplicate = parseResult.issues.some((i) => i.code === "syntax.duplicate-key");
    throw new TaskReadinessError({
      code: isDuplicate ? "duplicate-key" : "invalid-json",
      path: filePathForDiagnostics,
      cause: isDuplicate
        ? "Input file contains duplicate JSON key"
        : "Input file is not valid JSON",
      causeCategory: isDuplicate ? "duplicate-key" : "invalid-json",
      remediation: isDuplicate
        ? "Ensure each key appears exactly once in the JSON document."
        : "Ensure the file contains valid JSON syntax without trailing commas or comments.",
    });
  }

  const value = parseResult.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TaskReadinessError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input document must be a top-level JSON object",
      causeCategory: "invalid-shape",
      remediation: "Wrap input fields in a top-level JSON object.",
    });
  }

  const schema = await getTaskBootstrapSchema();
  const schemaIssues = validateAgainstSchema(value, schema);
  if (schemaIssues.length > 0) {
    throw new TaskReadinessError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input file does not adhere to task readiness schema",
      causeCategory: "schema-validation",
      remediation: `Fix schema issues: ${schemaIssues.map((i) => `${i.documentPath}: expected ${i.expected}`).join("; ")}`,
    });
  }

  const typedInput = value as unknown as GsdProjectReadinessInput;
  const invocationPath = options.invocationPath ?? process.cwd();

  // 1. Resolve canonical root and project behavior policy
  const behaviorInput: ProjectBehaviorInput = {
    invocationPath,
    projectRoot: typedInput.projectRoot,
    boundProjectRoot: typedInput.boundProjectRoot,
    stateRoot: options.stateRoot,
  };

  const policyView = await resolveProjectBehavior(behaviorInput);
  const canonicalRoot = policyView.canonicalRoot;
  const projectId = policyView.projectId;

  const controller = typedInput.controller;
  const workflow = typedInput.workflow;
  const phase = typedInput.phase ?? null;
  const normalizedWorkflow = normalizeWorkflowName(workflow);

  // 2. Controller check
  if (controller === "hermes") {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: {
        packageName: null,
        version: null,
        workflowHash: null,
        configRoot: null,
        gsdToolsPath: null,
      },
      workflow,
      phase,
      diagnosis: "unsupported",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [],
      missingPrerequisites: ["supported controller harness"],
      nextAction: "Switch controller to a supported GSD harness (claude, codex, antigravity, or pi).",
      reasons: ["Hermes controller is unsupported for GSD lifecycle/state writing."],
    };
  }

  const configRoot = resolveControllerConfigRoot(controller);
  const gsdToolsPath = resolveGsdToolsForController(controller, configRoot);

  if (!gsdToolsPath) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: {
        packageName: null,
        version: null,
        workflowHash: null,
        configRoot,
        gsdToolsPath: null,
      },
      workflow,
      phase,
      diagnosis: "missing-runtime",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [],
      missingPrerequisites: [`GSD Core runtime installed for ${controller}`],
      nextAction: `Install GSD Core for ${controller} harness before continuing.`,
      reasons: [`GSD Core runtime executable (gsd-tools.cjs) was not found in ${configRoot ?? "default config root"}.`],
    };
  }

  const runner = options.runner ?? runProcess;

  // 3. Query runtime-identity
  const runtimeIdentityResult = await executeGsdQuery(
    runner,
    gsdToolsPath,
    ["runtime-identity"],
    canonicalRoot,
  );

  if (!runtimeIdentityResult.ok || !runtimeIdentityResult.json) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: {
        packageName: null,
        version: null,
        workflowHash: null,
        configRoot,
        gsdToolsPath,
      },
      workflow,
      phase,
      diagnosis: "probe-error",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [],
      missingPrerequisites: ["valid runtime-identity query"],
      nextAction: "Inspect GSD installation and runtime integrity.",
      reasons: [runtimeIdentityResult.errorReason ?? "runtime-identity query failed"],
      nativeQueryEvidence: {
        query: "runtime-identity",
        exitCode: runtimeIdentityResult.exitCode,
        output: runtimeIdentityResult.json,
      },
    };
  }

  const packageName = typeof runtimeIdentityResult.json.packageName === "string"
    ? runtimeIdentityResult.json.packageName
    : null;
  const version = typeof runtimeIdentityResult.json.version === "string"
    ? runtimeIdentityResult.json.version
    : null;

  // Compute workflow hash if installed workflow markdown file exists
  let workflowHash: string | null = null;
  if (configRoot) {
    const candidateWorkflowPath = join(configRoot, "gsd-core", "workflows", `${normalizedWorkflow}.md`);
    try {
      if (existsSync(candidateWorkflowPath)) {
        const wfContent = await readFile(candidateWorkflowPath);
        workflowHash = createHash("sha256").update(wfContent).digest("hex");
      }
    } catch {
      workflowHash = null;
    }
  }

  const runtimeInfo: GsdProjectReadinessRuntimeInfo = {
    packageName,
    version,
    workflowHash,
    configRoot,
    gsdToolsPath,
  };

  // 4. Query init.resume
  const resumeResult = await executeGsdQuery(
    runner,
    gsdToolsPath,
    ["init.resume"],
    canonicalRoot,
  );

  if (!resumeResult.ok || !resumeResult.json) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "probe-error",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [],
      missingPrerequisites: ["valid init.resume query"],
      nextAction: "Check repository and filesystem permissions or repair GSD runtime.",
      reasons: [resumeResult.errorReason ?? "init.resume query failed"],
      nativeQueryEvidence: {
        query: "init.resume",
        exitCode: resumeResult.exitCode,
        output: resumeResult.json,
      },
    };
  }

  const resume = resumeResult.json;

  // Validate native project_root matches canonicalRoot
  if (typeof resume.project_root === "string") {
    const reportedRoot = resolve(resume.project_root);
    const expectedRoot = resolve(canonicalRoot);
    const isWindows = process.platform === "win32";
    const rootsMatch = isWindows
      ? reportedRoot.toLowerCase() === expectedRoot.toLowerCase()
      : reportedRoot === expectedRoot;

    if (!rootsMatch) {
      return {
        schemaVersion: 1,
        canonicalRoot,
        projectId,
        controller,
        runtime: runtimeInfo,
        workflow,
        phase,
        diagnosis: "probe-error",
        ready: false,
        executionAuthorized: false,
        satisfiedPrerequisites: [],
        missingPrerequisites: ["matching native project root"],
        nextAction: "Re-run in the native project root directory or resolve path discrepancies.",
        reasons: [`Native project root mismatch: GSD reports '${reportedRoot}', expected '${expectedRoot}'.`],
        nativeQueryEvidence: {
          query: "init.resume",
          exitCode: resumeResult.exitCode,
          output: resume,
        },
      };
    }
  }

  // Check absent project
  if (resume.planning_exists !== true) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "absent-project",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [],
      missingPrerequisites: [".planning directory"],
      nextAction: "Initialize the project with GSD (e.g. gsd-new-project or /gsd:new-project).",
      reasons: ["GSD reports no .planning directory in the project."],
      nativeEvidence: resume,
      nativeQueryEvidence: {
        query: "init.resume",
        exitCode: resumeResult.exitCode,
        output: resume,
      },
    };
  }

  // Check partial project / interrupted bootstrap
  if (resume.init_incomplete === true) {
    const missing: string[] = [];
    if (resume.project_exists !== true) missing.push("PROJECT.md");
    if (resume.requirements_exists !== true) missing.push("REQUIREMENTS.md");
    if (resume.roadmap_exists !== true) missing.push("ROADMAP.md");
    if (resume.state_exists !== true) missing.push("STATE.md");

    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "partial-project",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [".planning directory"],
      missingPrerequisites: missing.length > 0 ? missing : ["complete initial project artifacts"],
      nextAction: "Resume native project initialization (e.g. gsd-new-project or resume-project).",
      reasons: ["GSD reports init_incomplete: true; initial project setup was interrupted."],
      nativeEvidence: resume,
      nativeQueryEvidence: {
        query: "init.resume",
        exitCode: resumeResult.exitCode,
        output: resume,
      },
    };
  }

  // Check between-milestones state: milestones_exists is true, but roadmap/state are missing and init_incomplete is false
  if (resume.milestones_exists === true && (resume.roadmap_exists !== true || resume.state_exists !== true)) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "partial-project",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [".planning directory", "MILESTONES.md"],
      missingPrerequisites: [
        ...(resume.roadmap_exists !== true ? ["ROADMAP.md"] : []),
        ...(resume.state_exists !== true ? ["STATE.md"] : []),
      ],
      nextAction: "Start a new milestone or check progress natively (e.g. gsd-new-milestone or gsd-progress).",
      reasons: ["Milestones archive exists but active roadmap/state are missing (between-milestones state)."],
      nativeEvidence: resume,
      nativeQueryEvidence: {
        query: "init.resume",
        exitCode: resumeResult.exitCode,
        output: resume,
      },
    };
  }

  // 5. Query workflow-specific init
  let targetQueryArgs: string[];
  if (normalizedWorkflow === "quick" || normalizedWorkflow === "quick-full") {
    targetQueryArgs = ["init.quick", "alpha-aos readiness probe"];
  } else if (normalizedWorkflow === "discuss-phase") {
    if (!phase) {
      return {
        schemaVersion: 1,
        canonicalRoot,
        projectId,
        controller,
        runtime: runtimeInfo,
        workflow,
        phase: null,
        diagnosis: "unsupported",
        ready: false,
        executionAuthorized: false,
        satisfiedPrerequisites: [".planning directory"],
        missingPrerequisites: ["phase argument for discuss-phase"],
        nextAction: "Provide a valid phase parameter (e.g. --phase <phaseId>).",
        reasons: ["Workflow discuss-phase requires a phase parameter."],
      };
    }
    targetQueryArgs = ["init.phase-op", phase];
  } else if (normalizedWorkflow === "plan-phase") {
    if (!phase) {
      return {
        schemaVersion: 1,
        canonicalRoot,
        projectId,
        controller,
        runtime: runtimeInfo,
        workflow,
        phase: null,
        diagnosis: "unsupported",
        ready: false,
        executionAuthorized: false,
        satisfiedPrerequisites: [".planning directory"],
        missingPrerequisites: ["phase argument for plan-phase"],
        nextAction: "Provide a valid phase parameter (e.g. --phase <phaseId>).",
        reasons: ["Workflow plan-phase requires a phase parameter."],
      };
    }
    targetQueryArgs = ["init.plan-phase", phase];
  } else if (normalizedWorkflow === "execute-phase") {
    if (!phase) {
      return {
        schemaVersion: 1,
        canonicalRoot,
        projectId,
        controller,
        runtime: runtimeInfo,
        workflow,
        phase: null,
        diagnosis: "unsupported",
        ready: false,
        executionAuthorized: false,
        satisfiedPrerequisites: [".planning directory"],
        missingPrerequisites: ["phase argument for execute-phase"],
        nextAction: "Provide a valid phase parameter (e.g. --phase <phaseId>).",
        reasons: ["Workflow execute-phase requires a phase parameter."],
      };
    }
    targetQueryArgs = ["init.execute-phase", phase];
  } else {
    // Unsupported workflow probe mapping
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "unsupported",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [".planning directory"],
      missingPrerequisites: [`supported native probe for ${workflow}`],
      nextAction: "Verify workflow prerequisites natively without synthetic probe.",
      reasons: [`Workflow '${workflow}' has no supported native probe mapping; needs-native-check.`],
    };
  }

  const workflowResult = await executeGsdQuery(
    runner,
    gsdToolsPath,
    targetQueryArgs,
    canonicalRoot,
  );

  if (!workflowResult.ok || !workflowResult.json) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "probe-error",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: [".planning directory"],
      missingPrerequisites: [`successful ${targetQueryArgs[0]} query`],
      nextAction: "Inspect native workflow prerequisite requirements.",
      reasons: [workflowResult.errorReason ?? `${targetQueryArgs[0]} query failed`],
      nativeQueryEvidence: {
        query: targetQueryArgs[0]!,
        exitCode: workflowResult.exitCode,
        output: workflowResult.json,
      },
    };
  }

  const wfData = workflowResult.json;
  const satisfied: string[] = [".planning directory"];
  const missing: string[] = [];

  // Check roadmap for quick workflows
  if (normalizedWorkflow === "quick" || normalizedWorkflow === "quick-full") {
    if (wfData.roadmap_exists !== true && resume.roadmap_exists !== true) {
      missing.push("ROADMAP.md");
      return {
        schemaVersion: 1,
        canonicalRoot,
        projectId,
        controller,
        runtime: runtimeInfo,
        workflow,
        phase,
        diagnosis: "partial-project",
        ready: false,
        executionAuthorized: false,
        satisfiedPrerequisites: satisfied,
        missingPrerequisites: missing,
        nextAction: "Create the roadmap with GSD before starting a quick task.",
        reasons: ["GSD quick reports no .planning/ROADMAP.md in the project."],
        nativeEvidence: wfData,
        nativeQueryEvidence: {
          query: targetQueryArgs[0]!,
          exitCode: workflowResult.exitCode,
          output: wfData,
        },
      };
    }
    satisfied.push("ROADMAP.md");
  }

  if (resume.project_exists === true) satisfied.push("PROJECT.md");
  if (resume.state_exists === true) satisfied.push("STATE.md");

  // Check agents/capabilities
  const agentsInstalled = wfData.agents_installed ?? resume.agents_installed;
  const missingAgentsRaw = wfData.missing_agents ?? resume.missing_agents;
  const missingAgents: string[] = Array.isArray(missingAgentsRaw)
    ? (missingAgentsRaw as string[])
    : [];
  const agentsDir = (typeof wfData.agents_dir === "string" ? wfData.agents_dir : (typeof resume.agents_dir === "string" ? resume.agents_dir : null));
  const agentRuntime = (typeof wfData.agent_runtime === "string" ? wfData.agent_runtime : (typeof resume.agent_runtime === "string" ? resume.agent_runtime : null));

  const capabilities: GsdProjectReadinessCapabilities = {
    agentsInstalled: agentsInstalled === true,
    missingAgents,
    agentsDir,
    agentRuntime,
  };

  if (agentsInstalled === false) {
    return {
      schemaVersion: 1,
      canonicalRoot,
      projectId,
      controller,
      runtime: runtimeInfo,
      workflow,
      phase,
      diagnosis: "partial-project",
      ready: false,
      executionAuthorized: false,
      satisfiedPrerequisites: satisfied,
      missingPrerequisites: [`agents (${missingAgents.length} missing)`],
      nextAction: `Install required GSD agent skills for ${controller} in ${agentsDir ?? "agents directory"}.`,
      reasons: [
        `execution-blocked: GSD agents are not installed (agents_installed: false); missing: ${missingAgents.slice(0, 5).join(", ")}${missingAgents.length > 5 ? ` (+${missingAgents.length - 5} more)` : ""}`,
      ],
      capabilities,
      nativeEvidence: wfData,
      nativeQueryEvidence: {
        query: targetQueryArgs[0]!,
        exitCode: workflowResult.exitCode,
        output: wfData,
      },
    };
  }

  // All satisfied!
  satisfied.push("GSD agents installed");

  return {
    schemaVersion: 1,
    canonicalRoot,
    projectId,
    controller,
    runtime: runtimeInfo,
    workflow,
    phase,
    diagnosis: "ready",
    ready: true,
    executionAuthorized: false,
    satisfiedPrerequisites: satisfied,
    missingPrerequisites: [],
    nextAction: `Proceed with native GSD ${workflow} workflow.`,
    reasons: [`Project is initialized and ready for GSD ${workflow}.`],
    capabilities,
    nativeEvidence: wfData,
    nativeQueryEvidence: {
      query: targetQueryArgs[0]!,
      exitCode: workflowResult.exitCode,
      output: wfData,
    },
  };
}
