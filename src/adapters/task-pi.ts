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
  type TaskAgentResolver,
  type TaskAgentRunner,
} from "./task-agent-launch.js";
import { buildReviewPrompt } from "./task-claude.js";

export const PI_TASK_TIMEOUT_MS = 30 * 60 * 1000;
export const PI_TASK_OUTPUT_BYTES = 4 * 1024 * 1024;
const DETAIL_LIMIT = 400;
const ISSUE_LIMIT = 400;

export const PI_TASK_ENVIRONMENT_NAMES: readonly string[] = uniqueNames([
  ...TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  "PI_CODING_AGENT_DIR",
]);

export interface PiAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export function piEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  return nameOnlyEnvironment(PI_TASK_ENVIRONMENT_NAMES, source);
}

export function piReviewerArgs(options: { schemaPath: string; prompt?: string }): string[] {
  const args = [
    "-p",
    "--mode",
    "rpc",
    "--tools",
    "read,grep,find,ls",
    "--no-approve",
    "--no-session",
    "--json-schema",
    options.schemaPath,
  ];
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
}

export function piControllerArgs(options: { schemaPath: string; prompt?: string }): string[] {
  const args = [
    "-p",
    "--mode",
    "rpc",
    "--no-approve",
    "--no-session",
    "--json-schema",
    options.schemaPath,
  ];
  if (options.prompt !== undefined) {
    args.push(options.prompt);
  }
  return args;
}

/**
 * Interprets Pi exit status, defending against Windows libuv stdin teardown crash (0xC0000409 / 3221226505).
 * If stdout contains a complete, valid JSON output, the teardown crash is treated as successful completion (D-12, Pitfall 4).
 */
export function interpretPiExitResult(
  result: ProcessResult,
  parsedOutput: unknown | null,
): { status: "ok" | "failed"; detail: string | null } {
  if (result.code === "ok" && result.exitCode === 0) {
    return { status: "ok", detail: null };
  }
  const isWindowsTeardownCrash =
    process.platform === "win32" && (result.exitCode === 3221226505 || result.exitCode === 1);
  if (isWindowsTeardownCrash && parsedOutput !== null) {
    return {
      status: "ok",
      detail: "pi process teardown exited with libuv assertion after successfully producing valid output",
    };
  }
  return {
    status: "failed",
    detail: `pi execution failed with ${result.code} (exit ${String(result.exitCode)}): ${result.stderr.excerpt.trim()}`,
  };
}

export async function probePiVersion(options: PiAdapterOptions = {}): Promise<HarnessVersionProbe> {
  const launch = resolveTaskAgentLaunch("pi", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") return launch;
  return probeLaunchVersion(
    "pi",
    launch,
    piEnvironment(options.source ?? process.env),
    options.runner ?? runProcess,
  );
}

export async function runPiController(
  request: ControllerDispatchRequest,
  options: PiAdapterOptions = {},
): Promise<ControllerDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const source = options.source ?? process.env;
  const environment = piEnvironment(source);

  const launch = resolveTaskAgentLaunch("pi", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "pi",
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
      harness: "pi",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before pi was launched",
    };
  }

  const probe = await probeLaunchVersion("pi", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "pi",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before pi was launched",
    };
  }

  const workDirectory = join(request.scratchRoot, "pi");
  await mkdir(workDirectory, { recursive: true });
  const schemaPath = join(workDirectory, "executor-result.schema.json");
  const schema = await loadAgentSchema("task-executor-result.schema.json", options.packageRoot ?? defaultPackageRoot());
  await writeFile(schemaPath, `${JSON.stringify(agentFacingSchema(schema), null, 2)}\n`, "utf8");

  const args = [
    ...launch.argsPrefix,
    ...piControllerArgs({ schemaPath }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.projectRoot,
      stdin: request.prompt,
      environment,
      timeoutMs: remaining === null ? PI_TASK_TIMEOUT_MS : Math.min(PI_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: PI_TASK_OUTPUT_BYTES,
      excerptBytes: PI_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "pi",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: code,
      terminal: "missing",
      claim: null,
      detail: `pi exec could not be launched (${code})`,
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
    detail = "failed to parse pi JSON stdout";
  }

  const exitInterpretation = interpretPiExitResult(result, claim);
  const clean = exitInterpretation.status === "ok";
  return {
    harness: "pi",
    version,
    executable,
    sessionId: null,
    exitCode: result.exitCode,
    processCode: result.code,
    terminal: clean && claim !== null ? "completed" : "failed",
    claim,
    detail: exitInterpretation.detail ? boundedSentence(exitInterpretation.detail, DETAIL_LIMIT) : detail ? boundedSentence(detail, DETAIL_LIMIT) : null,
  };
}

export async function runPiReviewer(
  request: ReviewRequest,
  options: PiAdapterOptions = {},
): Promise<ReviewDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const environment = piEnvironment(options.source ?? process.env);

  const launch = resolveTaskAgentLaunch("pi", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "pi",
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
      harness: "pi",
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
      harness: "pi",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "prompt-too-large",
      report: null,
      issues: [boundedSentence(prompt.issue, ISSUE_LIMIT)],
    };
  }

  const probe = await probeLaunchVersion("pi", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "pi",
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
    ...piReviewerArgs({ schemaPath }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.reviewRoot,
      stdin: prompt.prompt,
      environment,
      timeoutMs: remaining === null ? PI_TASK_TIMEOUT_MS : Math.min(PI_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: PI_TASK_OUTPUT_BYTES,
      excerptBytes: PI_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "pi",
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

  const exitInterpretation = interpretPiExitResult(result, report);
  if (exitInterpretation.status !== "ok") {
    issues.push(exitInterpretation.detail ?? `pi execution failed with ${result.code}`);
  }

  return {
    harness: "pi",
    version,
    executable,
    sessionId: request.sessionId,
    exitCode: result.exitCode,
    processCode: result.code,
    report: exitInterpretation.status === "ok" ? report : null,
    issues: issues.map((i) => boundedSentence(i, ISSUE_LIMIT)),
  };
}
