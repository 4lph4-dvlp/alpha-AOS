import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot as defaultPackageRoot } from "../core/paths.js";
import { ProcessPolicyError, runProcess, type EnvironmentPolicy, type ProcessResult } from "../core/process.js";
import type {
  ControllerDispatchRequest,
  ControllerDispatchResult,
  ExecutorClaim,
  ReviewDispatchResult,
  ReviewRequest,
  TaskReviewReport,
} from "../core/task-run.js";
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
}

export function antigravityEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  return nameOnlyEnvironment(ANTIGRAVITY_TASK_ENVIRONMENT_NAMES, source);
}

export function resolveAntigravityLaunch(options: { resolve?: TaskAgentResolver } = {}): TaskAgentLaunch {
  const primary = resolveTaskAgentLaunch("antigravity", options);
  if (primary.status === "ok") return primary;
  return resolveTaskAgentLaunch("agy", options);
}

export function antigravityReviewerArgs(options: { schemaPath: string; prompt?: string }): string[] {
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
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
}

export function antigravityControllerArgs(options: { schemaPath: string; prompt?: string }): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    options.schemaPath,
    "--mode",
    "accept-edits",
  ];
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
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

  const args = [
    ...launch.argsPrefix,
    ...antigravityControllerArgs({ schemaPath }),
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

  const args = [
    ...launch.argsPrefix,
    ...antigravityReviewerArgs({ schemaPath }),
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
