import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot as defaultPackageRoot } from "../core/paths.js";
import type { TaskAgentPolicy } from "../core/task-contract.js";
import { ProcessPolicyError, runProcess, type EnvironmentPolicy, type ProcessResult } from "../core/process.js";
import type {
  ControllerDispatchRequest,
  ControllerDispatchResult,
  ExecutorClaim,
  ReviewDispatchResult,
  ReviewRequest,
  TaskReviewReport,
} from "../core/task-run.js";
import {
  buildFinalReviewPrompt,
  validateFinalReviewReport,
  type FinalReviewRequest,
  type TaskFinalReviewReport,
} from "../core/task-final-review.js";
import { parseFinalReviewJson } from "./task-claude.js";
import { rejectRawCredentials, validateManagedDocument } from "../core/validation.js";
import {
  agentFacingSchema,
  boundedSentence,
  loadAgentSchema,
  nameOnlyEnvironment,
  probeLaunchVersion,
  remainingMilliseconds,
  reportedExecutable,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  uniqueNames,
  type HarnessVersionProbe,
  type TaskAgentLaunch,
  type TaskAgentResolver,
  type TaskAgentRunner,
} from "./task-agent-launch.js";
import { buildReviewPrompt } from "./task-claude.js";

export const ANTIGRAVITY_TASK_TIMEOUT_MS = 30 * 60 * 1000;
export const ANTIGRAVITY_TASK_OUTPUT_BYTES = 4 * 1024 * 1024;
const DETAIL_LIMIT = 400;
const ISSUE_LIMIT = 400;
const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]+$/u;

export const ANTIGRAVITY_TASK_ENVIRONMENT_NAMES: readonly string[] = uniqueNames([
  ...TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  "AGY_HOME",
  "ANTIGRAVITY_CONFIG_DIR",
]);

export interface AntigravityAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
  model?: string | undefined;
}

export interface AntigravitySubagentValidation {
  readonly ok: boolean;
  readonly code: "OK" | "INCOMPATIBLE_SUBAGENT_MODEL";
  readonly reason: string | null;
}

/**
 * Guards against silent model downgrades on Antigravity `invoke_subagent` calls (BUG-05).
 * The Antigravity platform launcher forces `"inherit": true` for `typeName: "self"`,
 * ignoring any explicit `Model` override (such as `"pro"` or `"flash"`).
 */
export function validateAntigravitySubagentDispatch(options: {
  typeName: string;
  requestedModel?: string | null | undefined;
  parentModel?: string | null | undefined;
}): AntigravitySubagentValidation {
  const typeName = options.typeName.trim();
  const requested = options.requestedModel?.trim() ?? "";
  const parent = options.parentModel?.trim() ?? "";

  if (
    typeName === "self" &&
    requested.length > 0 &&
    requested.toLowerCase() !== "inherit" &&
    (parent.length === 0 || requested.toLowerCase() !== parent.toLowerCase())
  ) {
    return {
      ok: false,
      code: "INCOMPATIBLE_SUBAGENT_MODEL",
      reason:
        `INCOMPATIBLE_SUBAGENT_MODEL: Antigravity subagent typeName 'self' forces parent model inheritance and cannot honor explicit model override '${requested}'. ` +
        `Use a dedicated role subagent (e.g. 'gsd-planner', 'gsd-executor', 'gsd-verifier', 'research') or dispatch via CLI with '--model ${requested}'.`,
    };
  }

  return { ok: true, code: "OK", reason: null };
}

export function assertAntigravitySubagentDispatch(options: {
  typeName: string;
  requestedModel?: string | null | undefined;
  parentModel?: string | null | undefined;
}): void {
  const result = validateAntigravitySubagentDispatch(options);
  if (!result.ok) {
    throw new Error(result.reason ?? "INCOMPATIBLE_SUBAGENT_MODEL");
  }
}

/**
 * Resolves the explicit model identifier for an Antigravity role from adapter options,
 * contract `agentPolicy`, or `<projectRoot>/.planning/config.json` (BUG-01).
 */
export async function resolveAntigravityRoleModel(options: {
  role: "controller" | "executor" | "reviewer";
  adapterModel?: string | undefined;
  agentPolicy?: TaskAgentPolicy | undefined;
  projectRoot?: string | undefined;
}): Promise<string | undefined> {
  const sanitize = (candidate: unknown): string | undefined => {
    if (typeof candidate !== "string") return undefined;
    const trimmed = candidate.trim();
    return trimmed.length > 0 && SAFE_MODEL_ID.test(trimmed) ? trimmed : undefined;
  };

  const direct = sanitize(options.adapterModel);
  if (direct !== undefined) return direct;

  const policy = options.agentPolicy;
  if (policy !== undefined) {
    if (options.role === "controller") {
      const ctrl = sanitize(policy.controllerModel) ?? (policy.controller === policy.executor ? sanitize(policy.executorModel) : undefined);
      if (ctrl !== undefined) return ctrl;
    } else if (options.role === "executor") {
      const exec = sanitize(policy.executorModel) ?? (policy.executor === policy.controller ? sanitize(policy.controllerModel) : undefined);
      if (exec !== undefined) return exec;
    } else if (options.role === "reviewer") {
      const rev = sanitize(policy.reviewerModel);
      if (rev !== undefined) return rev;
    }
  }

  if (options.projectRoot) {
    try {
      const configPath = join(options.projectRoot, ".planning", "config.json");
      const raw = await readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const overrides = parsed.model_profile_overrides;
      if (typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)) {
        const record = overrides as Record<string, unknown>;
        const agyNested = record.antigravity;
        if (typeof agyNested === "object" && agyNested !== null && !Array.isArray(agyNested)) {
          const nestedRole =
            sanitize((agyNested as Record<string, unknown>)[options.role]) ??
            (options.role === "reviewer" ? sanitize((agyNested as Record<string, unknown>).verifier) : undefined);
          if (nestedRole !== undefined) return nestedRole;
        }
        const roleOverride =
          sanitize(record[options.role]) ??
          (options.role === "reviewer" ? sanitize(record.verifier) : undefined);
        if (roleOverride !== undefined) return roleOverride;
        if (options.role === "controller") {
          const execFallback = sanitize(record.executor);
          if (execFallback !== undefined) return execFallback;
        }
        const defaultOverride = sanitize(record.default);
        if (defaultOverride !== undefined) return defaultOverride;
      }
      const crossAiCmd =
        typeof parsed.cross_ai_command === "string"
          ? parsed.cross_ai_command
          : typeof parsed.review === "object" && parsed.review !== null && typeof (parsed.review as Record<string, unknown>).cross_ai_command === "string"
            ? ((parsed.review as Record<string, unknown>).cross_ai_command as string)
            : undefined;
      if (crossAiCmd) {
        const match = crossAiCmd.match(/--model(?:\s+|=)([A-Za-z0-9._:/-]+)/u);
        const extracted = sanitize(match?.[1]);
        if (extracted !== undefined) return extracted;
      }
    } catch {
      // Optional .planning/config.json not present or unreadable
    }
  }

  return undefined;
}

export function antigravityEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  return nameOnlyEnvironment(ANTIGRAVITY_TASK_ENVIRONMENT_NAMES, source);
}

export function resolveAntigravityLaunch(options: { resolve?: TaskAgentResolver } = {}): TaskAgentLaunch {
  const primary = resolveTaskAgentLaunch("antigravity", options);
  if (primary.status === "ok") return primary;
  return resolveTaskAgentLaunch("agy", options);
}

export function antigravityReviewerArgs(options: {
  schemaPath: string;
  prompt?: string;
  model?: string | undefined;
}): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    options.schemaPath,
    "--mode",
    "plan",
    "--sandbox",
  ];
  if (options.model !== undefined && options.model.trim().length > 0) {
    args.push("--model", options.model.trim());
  }
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
}

export function antigravityControllerArgs(options: {
  schemaPath: string;
  prompt?: string;
  model?: string | undefined;
}): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    options.schemaPath,
    "--mode",
    "accept-edits",
  ];
  if (options.model !== undefined && options.model.trim().length > 0) {
    args.push("--model", options.model.trim());
  }
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
}

export function antigravityExecutorArgs(options: {
  schemaPath: string;
  prompt?: string;
  model?: string | undefined;
}): string[] {
  return antigravityControllerArgs(options);
}

export async function probeAntigravityVersion(
  options: AntigravityAdapterOptions = {},
): Promise<HarnessVersionProbe> {
  const launch = resolveAntigravityLaunch(options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") return launch;
  return probeLaunchVersion(
    "antigravity",
    launch,
    antigravityEnvironment(options.source ?? process.env),
    options.runner ?? runProcess,
  );
}

export async function runAntigravityController(
  request: ControllerDispatchRequest,
  options: AntigravityAdapterOptions = {},
): Promise<ControllerDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const source = options.source ?? process.env;
  const environment = antigravityEnvironment(source);

  const launch = resolveAntigravityLaunch(options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "antigravity",
      version: null,
      executable: null,
      sessionId: null,
      exitCode: null,
      processCode: "unsupported-executable",
      terminal: "missing",
      claim: null,
      detail: boundedSentence(launch.reason, DETAIL_LIMIT),
    };
  }

  const executable = reportedExecutable(launch);
  const before = remainingMilliseconds(request.deadlineAt, clock());
  if (before !== null && before <= 0) {
    return {
      harness: "antigravity",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before antigravity was launched",
    };
  }

  const probe = await probeLaunchVersion("antigravity", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "antigravity",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before antigravity was launched",
    };
  }

  const workDirectory = join(request.scratchRoot, "antigravity");
  await mkdir(workDirectory, { recursive: true });
  const schemaPath = join(workDirectory, "executor-result.schema.json");
  const schema = await loadAgentSchema("task-executor-result.schema.json", options.packageRoot ?? defaultPackageRoot());
  await writeFile(schemaPath, `${JSON.stringify(agentFacingSchema(schema), null, 2)}\n`, "utf8");

  const resolvedModel = await resolveAntigravityRoleModel({
    role: "controller",
    adapterModel: options.model,
    agentPolicy: request.contract.agentPolicy,
    projectRoot: request.projectRoot,
  });

  const args = [
    ...launch.argsPrefix,
    ...antigravityControllerArgs({ schemaPath, ...(resolvedModel ? { model: resolvedModel } : {}) }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.projectRoot,
      stdin: request.prompt,
      environment,
      timeoutMs: remaining === null ? ANTIGRAVITY_TASK_TIMEOUT_MS : Math.min(ANTIGRAVITY_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
      excerptBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "antigravity",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: code,
      terminal: "missing",
      claim: null,
      detail: `antigravity exec could not be launched (${code})`,
    };
  }

  let claim: ExecutorClaim | null = null;
  let detail: string | null = null;
  try {
    const text = result.stdout.excerpt.trim();
    if (text.length > 0) {
      const parsed = JSON.parse(text);
      const validation = validateManagedDocument<ExecutorClaim>({
        text: JSON.stringify(parsed),
        format: "json",
        kind: "task-agent-output",
        schema,
        domain: rejectRawCredentials,
      });
      if (validation.ok && validation.value !== null) {
        claim = validation.value;
      } else {
        detail = "invalid executor result output format";
      }
    }
  } catch {
    detail = "failed to parse antigravity JSON stdout";
  }

  const clean = result.code === "ok" && result.exitCode === 0;
  return {
    harness: "antigravity",
    version,
    executable,
    sessionId: null,
    exitCode: result.exitCode,
    processCode: result.code,
    terminal: clean && claim !== null ? "completed" : "failed",
    claim,
    detail: detail ? boundedSentence(detail, DETAIL_LIMIT) : null,
  };
}

export async function runAntigravityReviewer(
  request: ReviewRequest,
  options: AntigravityAdapterOptions = {},
): Promise<ReviewDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const environment = antigravityEnvironment(options.source ?? process.env);

  const launch = resolveAntigravityLaunch(options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "antigravity",
      version: null,
      executable: null,
      sessionId: null,
      exitCode: null,
      processCode: "unsupported-executable",
      report: null,
      issues: [boundedSentence(launch.reason, ISSUE_LIMIT)],
    };
  }

  const executable = reportedExecutable(launch);
  const before = remainingMilliseconds(request.deadlineAt, clock());
  if (before !== null && before <= 0) {
    return {
      harness: "antigravity",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      report: null,
      issues: ["the contract deadline passed before the reviewer was launched"],
    };
  }

  const prompt = buildReviewPrompt(request);
  if (prompt.status !== "ok") {
    return {
      harness: "antigravity",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "prompt-too-large",
      report: null,
      issues: [boundedSentence(prompt.issue, ISSUE_LIMIT)],
    };
  }

  const probe = await probeLaunchVersion("antigravity", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "antigravity",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      report: null,
      issues: ["the contract deadline passed before the reviewer was launched"],
    };
  }

  const workDirectory = join(request.reviewRoot, ".alpha-aos-review");
  await mkdir(workDirectory, { recursive: true });
  const schemaPath = join(workDirectory, "review.schema.json");
  const schema = await loadAgentSchema("task-review.schema.json", options.packageRoot ?? defaultPackageRoot());
  await writeFile(schemaPath, `${JSON.stringify(agentFacingSchema(schema), null, 2)}\n`, "utf8");

  const resolvedModel = await resolveAntigravityRoleModel({
    role: "reviewer",
    adapterModel: options.model,
    agentPolicy: request.contract.agentPolicy,
    projectRoot: request.contract.scope.projectRoot,
  });

  const args = [
    ...launch.argsPrefix,
    ...antigravityReviewerArgs({ schemaPath, ...(resolvedModel ? { model: resolvedModel } : {}) }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.reviewRoot,
      stdin: prompt.prompt,
      environment,
      timeoutMs: remaining === null ? ANTIGRAVITY_TASK_TIMEOUT_MS : Math.min(ANTIGRAVITY_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
      excerptBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "antigravity",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: code,
      report: null,
      issues: [`the reviewer could not be launched (${code})`],
    };
  }

  let report: TaskReviewReport | null = null;
  const issues: string[] = [];
  try {
    const text = result.stdout.excerpt.trim();
    if (text.length > 0) {
      const parsed = JSON.parse(text);
      const validation = validateManagedDocument<TaskReviewReport>({
        text: JSON.stringify(parsed),
        format: "json",
        kind: "task-agent-output",
        schema,
        domain: rejectRawCredentials,
      });
      if (validation.ok && validation.value !== null) {
        report = validation.value;
      } else {
        issues.push("the review report is invalid or does not match schema");
      }
    } else {
      issues.push("reviewer output was empty");
    }
  } catch {
    issues.push("reviewer stdout is not valid JSON");
  }

  if (result.code !== "ok" || result.exitCode !== 0) {
    issues.push(`antigravity ended with ${result.code} (exit ${String(result.exitCode)}), so no report is accepted`);
  }

  return {
    harness: "antigravity",
    version,
    executable,
    sessionId: request.sessionId,
    exitCode: result.exitCode,
    processCode: result.code,
    report: result.code === "ok" && result.exitCode === 0 ? report : null,
    issues: issues.map((i) => boundedSentence(i, ISSUE_LIMIT)),
  };
}

export async function runAntigravityFinalReviewer(
  request: FinalReviewRequest,
  options: AntigravityAdapterOptions = {},
): Promise<TaskFinalReviewReport> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const source = options.source ?? process.env;
  const environment = antigravityEnvironment(source);

  const launch = resolveTaskAgentLaunch("antigravity", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    throw new Error(`antigravity launch failed: ${launch.reason}`);
  }

  const prompt = buildFinalReviewPrompt(request);
  if (prompt.status !== "ok") {
    throw new Error(prompt.issue);
  }

  const remaining = remainingMilliseconds(request.deadlineAt ? request.deadlineAt.toISOString() : null, clock());
  if (remaining !== null && remaining <= 0) {
    throw new Error("the contract deadline passed before antigravity reviewer was launched");
  }

  const workDirectory = join(request.reviewRoot, ".alpha-aos-review");
  await mkdir(workDirectory, { recursive: true });
  const schemaPath = join(workDirectory, "final-review.schema.json");
  const schema = await loadAgentSchema("task-final-review.schema.json", options.packageRoot ?? defaultPackageRoot());
  await writeFile(schemaPath, `${JSON.stringify(agentFacingSchema(schema), null, 2)}\n`, "utf8");

  const resolvedModel = await resolveAntigravityRoleModel({
    role: "reviewer",
    adapterModel: options.model,
    agentPolicy: request.contract.agentPolicy,
    projectRoot: request.contract.scope.projectRoot,
  });

  const args = [
    ...launch.argsPrefix,
    ...antigravityReviewerArgs({ schemaPath, ...(resolvedModel ? { model: resolvedModel } : {}) }),
  ];

  const result = await runner({
    executable: launch.executable,
    args,
    cwd: request.reviewRoot,
    stdin: prompt.prompt,
    environment,
    timeoutMs: remaining === null ? ANTIGRAVITY_TASK_TIMEOUT_MS : Math.min(ANTIGRAVITY_TASK_TIMEOUT_MS, remaining),
    maxOutputBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
    excerptBytes: ANTIGRAVITY_TASK_OUTPUT_BYTES,
  });

  if (result.code !== "ok" || result.exitCode !== 0) {
    throw new Error(`antigravity final review process failed with ${result.code} (exit ${String(result.exitCode)})`);
  }

  const parsed = parseFinalReviewJson(result.stdout.excerpt, request.sessionId);
  const validated = await validateFinalReviewReport(parsed, {
    contractId: request.contract.id,
    contractDigest: request.contractDigest,
    targetRevisionSha: request.targetRevisionSha,
    artifactDigest: request.artifactDigest,
    sessionId: request.sessionId,
    pkgRoot: options.packageRoot ?? defaultPackageRoot(),
  });

  if (!validated.valid || !validated.report) {
    throw new Error(`antigravity final review report validation failed: ${validated.issues.join("; ")}`);
  }

  return validated.report;
}
