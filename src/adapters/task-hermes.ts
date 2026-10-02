import { mkdir, readFile, rm } from "node:fs/promises";
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
import { normalizeHarnessTelemetry, type NormalizedTelemetry } from "../core/task-telemetry.js";
import { rejectRawCredentials, validateManagedDocument } from "../core/validation.js";
import {
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

export const HERMES_TASK_TIMEOUT_MS = 45 * 60 * 1000;
export const HERMES_TASK_OUTPUT_BYTES = 4 * 1024 * 1024;
const DETAIL_LIMIT = 400;
const ISSUE_LIMIT = 400;

export const HERMES_TASK_ENVIRONMENT_NAMES: readonly string[] = uniqueNames([
  ...TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  "HERMES_HOME",
]);

export interface HermesAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
}

export function hermesEnvironment(source: NodeJS.ProcessEnv = process.env): EnvironmentPolicy {
  return nameOnlyEnvironment(HERMES_TASK_ENVIRONMENT_NAMES, source);
}

export function hermesControllerArgs(options: {
  prompt: string;
  usageFile: string;
  projectRoot: string;
}): string[] {
  return [
    "-z",
    options.prompt,
    "--usage-file",
    options.usageFile,
    "--toolsets",
    "file,git,terminal",
    "--ignore-rules",
    "--in",
    options.projectRoot,
  ];
}

export function hermesReviewerArgs(options: {
  prompt: string;
  usageFile: string;
  reviewRoot: string;
}): string[] {
  return [
    "-z",
    options.prompt,
    "--usage-file",
    options.usageFile,
    "--toolsets",
    "file",
    "--ignore-rules",
    "--in",
    options.reviewRoot,
  ];
}

export async function parseHermesUsageFile(usageFilePath: string): Promise<NormalizedTelemetry> {
  try {
    const text = await readFile(usageFilePath, "utf8");
    const raw = JSON.parse(text);
    return normalizeHarnessTelemetry("hermes", raw);
  } catch {
    return normalizeHarnessTelemetry("hermes", null);
  }
}

export async function probeHermesVersion(options: HermesAdapterOptions = {}): Promise<HarnessVersionProbe> {
  const launch = resolveTaskAgentLaunch("hermes", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") return launch;
  return probeLaunchVersion(
    "hermes",
    launch,
    hermesEnvironment(options.source ?? process.env),
    options.runner ?? runProcess,
  );
}

export async function runHermesController(
  request: ControllerDispatchRequest,
  options: HermesAdapterOptions = {},
): Promise<ControllerDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const source = options.source ?? process.env;
  const environment = hermesEnvironment(source);

  const launch = resolveTaskAgentLaunch("hermes", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "hermes",
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
      harness: "hermes",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before hermes was launched",
    };
  }

  const probe = await probeLaunchVersion("hermes", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "hermes",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "deadline",
      terminal: "missing",
      claim: null,
      detail: "the contract deadline passed before hermes was launched",
    };
  }

  const workDirectory = join(request.scratchRoot, "hermes");
  await mkdir(workDirectory, { recursive: true });
  const usageFilePath = join(workDirectory, "usage.json");
  await rm(usageFilePath, { force: true });

  const schema = await loadAgentSchema("task-executor-result.schema.json", options.packageRoot ?? defaultPackageRoot());
  const args = [
    ...launch.argsPrefix,
    ...hermesControllerArgs({
      prompt: request.prompt,
      usageFile: usageFilePath,
      projectRoot: request.projectRoot,
    }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.projectRoot,
      stdin: "",
      environment,
      timeoutMs: remaining === null ? HERMES_TASK_TIMEOUT_MS : Math.min(HERMES_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: HERMES_TASK_OUTPUT_BYTES,
      excerptBytes: HERMES_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "hermes",
      version,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: code,
      terminal: "missing",
      claim: null,
      detail: `hermes exec could not be launched (${code})`,
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
    // If output is not pure JSON, detail notes non-json output
    detail = result.stderr.excerpt.trim() || "hermes output did not contain valid executor claim JSON";
  }

  const clean = result.code === "ok" && result.exitCode === 0;
  return {
    harness: "hermes",
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

export async function runHermesReviewer(
  request: ReviewRequest,
  options: HermesAdapterOptions = {},
): Promise<ReviewDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const environment = hermesEnvironment(options.source ?? process.env);

  const launch = resolveTaskAgentLaunch("hermes", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") {
    return {
      harness: "hermes",
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
      harness: "hermes",
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
      harness: "hermes",
      version: null,
      executable,
      sessionId: null,
      exitCode: null,
      processCode: "prompt-too-large",
      report: null,
      issues: [boundedSentence(prompt.issue, ISSUE_LIMIT)],
    };
  }

  const probe = await probeLaunchVersion("hermes", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return {
      harness: "hermes",
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
  const usageFilePath = join(workDirectory, "usage.json");
  await rm(usageFilePath, { force: true });

  const schema = await loadAgentSchema("task-review.schema.json", options.packageRoot ?? defaultPackageRoot());
  const args = [
    ...launch.argsPrefix,
    ...hermesReviewerArgs({
      prompt: prompt.prompt,
      usageFile: usageFilePath,
      reviewRoot: request.reviewRoot,
    }),
  ];

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args,
      cwd: request.reviewRoot,
      stdin: "",
      environment,
      timeoutMs: remaining === null ? HERMES_TASK_TIMEOUT_MS : Math.min(HERMES_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: HERMES_TASK_OUTPUT_BYTES,
      excerptBytes: HERMES_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return {
      harness: "hermes",
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
    issues.push(`hermes ended with ${result.code} (exit ${String(result.exitCode)}), so no report is accepted`);
  }

  return {
    harness: "hermes",
    version,
    executable,
    sessionId: request.sessionId,
    exitCode: result.exitCode,
    processCode: result.code,
    report: result.code === "ok" && result.exitCode === 0 ? report : null,
    issues: issues.map((i) => boundedSentence(i, ISSUE_LIMIT)),
  };
}
