import { resolve } from "node:path";
import { assertTaskStartable, detectQuotaExhaustion, reservedRunIdForApproval, type TaskContract } from "./task-contract.js";
import { resolveTaskAgentLaunch, type TaskAgentResolver } from "../adapters/task-agent-launch.js";
import { codexEffortArgs, codexGitAuthorityOverrides, withCodexTaskEnvironment } from "../adapters/task-codex.js";
import { CodexUsageCollector } from "./task-native-usage.js";
import { meteredTaskDispatch, readTaskDispatches, TaskResourceError } from "./task-runtime.js";
import type { PrivateLaunchSpec, StartCommandJobResult } from "./command-jobs.js";
import { runProcess, type ProcessResult, type ProcessSpec } from "./process.js";

export { validateTaskJobBinding, type TaskJobBinding } from "./task-job-binding.js";
import { validateTaskJobBinding, type TaskJobBinding } from "./task-job-binding.js";

export function approvedCodexJobArgs(contract: TaskContract, binding: TaskJobBinding, gitDirectory: string | null = null): string[] {
  validateTaskJobBinding(binding);
  if (contract.agentPolicy[binding.role] !== "codex") throw new Error("codex-json-v1 supports only approved Codex roles");
  const model = contract.agentPolicy[`${binding.role}Model`];
  const effort = contract.agentPolicy[`${binding.role}Effort`];
  if (!model || !effort) throw new Error("Registered task jobs require an explicit approved role model and effort");
  return ["exec", "--json", "--ignore-rules", ...(binding.role === "reviewer" ? ["--sandbox", "read-only"]
    : gitDirectory === null ? ["--sandbox", "workspace-write"] : codexGitAuthorityOverrides(gitDirectory)),
    "-m", model, ...codexEffortArgs(effort), ...(binding.resumeSessionId ? ["resume", binding.resumeSessionId] : []), "--", binding.prompt];
}

async function approvedLaunch(binding: TaskJobBinding, stateRoot: string, resolver?: TaskAgentResolver) {
  validateTaskJobBinding(binding);
  const { loaded, approval } = await assertTaskStartable({ contractPath: binding.contractPath, expectedDigest: binding.contractDigest, stateRoot });
  if (binding.runId !== reservedRunIdForApproval({ contractDigest: loaded.digest })) throw new Error("Task job run does not match the approved reserved run");
  if (binding.resumeSessionId) {
    if (binding.role === "reviewer") throw new Error("Independent reviewers require a fresh session");
    const prior = await readTaskDispatches(stateRoot, loaded.digest);
    if (!prior.some((entry) => entry.sessionId === binding.resumeSessionId && entry.role === binding.role &&
      entry.model === loaded.contract.agentPolicy[`${binding.role}Model`] && entry.status !== "running" && entry.status !== "interrupted")) {
      throw new Error("Resume handle is not a settled native session of this approved role and run");
    }
  }
  const { readFinalReviewWitness } = await import("./task-final-review.js");
  const final = await readFinalReviewWitness(stateRoot, loaded.contract.id);
  if (final?.contractDigest === loaded.digest && final.overallVerdict === "accepted") throw new Error("This approved task run is already accepted");
  const launch = resolveTaskAgentLaunch("codex", resolver ? { resolve: resolver } : {});
  if (launch.status !== "ok") throw new Error(launch.reason);
  const gitDirectory = binding.role !== "reviewer" && loaded.contract.allowedEffects.includes("local-commit") ? approval.gitDirectory ?? null : null;
  return { contract: loaded.contract, executable: launch.executable, gitDirectory,
    args: [...launch.argsPrefix, ...approvedCodexJobArgs(loaded.contract, binding, gitDirectory)] };
}

export async function previewApprovedTaskJob(binding: TaskJobBinding, stateRoot: string) {
  const launch = await approvedLaunch(binding, stateRoot);
  return { route: binding.route, contractId: launch.contract.id, contractDigest: binding.contractDigest,
    runId: binding.runId, role: binding.role, model: launch.contract.agentPolicy[`${binding.role}Model`],
    effort: launch.contract.agentPolicy[`${binding.role}Effort`], projectRoot: launch.contract.scope.projectRoot,
    resumeSessionId: binding.resumeSessionId ?? null, promptBytes: Buffer.byteLength(binding.prompt),
    metering: "native-observations; boundary enforcement; no provider hard cap", finalAcceptance: "existing GSD gates required" };
}

export async function startApprovedTaskJob(options: { binding: TaskJobBinding; stateRoot: string; cliPath?: string | undefined }): Promise<StartCommandJobResult> {
  const launch = await approvedLaunch(options.binding, options.stateRoot);
  const { startCommandJob } = await import("./command-jobs.js");
  return startCommandJob({ stateRoot: options.stateRoot, cwd: launch.contract.scope.projectRoot,
    executable: launch.executable, args: launch.args, task: options.binding, cliPath: options.cliPath,
    deadlineMs: Math.min(24 * 60 * 60_000, (launch.contract.resourcePolicy.maxWallTimeMinutes ?? 60) * 60_000) });
}

export async function runApprovedTaskJobProcess(options: {
  stateRoot: string; launch: PrivateLaunchSpec; processSpec: ProcessSpec;
  runner?: ((spec: ProcessSpec) => Promise<ProcessResult>) | undefined;
  resolve?: TaskAgentResolver | undefined;
}): Promise<ProcessResult & { taskStopCode?: string }> {
  const binding = options.launch.task;
  if (!binding) return (options.runner ?? runProcess)(options.processSpec);
  try {
    const approved = await approvedLaunch(binding, options.stateRoot, options.resolve);
    if (resolve(options.launch.cwd) !== resolve(approved.contract.scope.projectRoot) ||
      options.launch.executable !== approved.executable || JSON.stringify(options.launch.args) !== JSON.stringify(approved.args)) {
      throw new Error("Registered task launch differs from approved typed argv");
    }
    const dispatched = await meteredTaskDispatch({ stateRoot: options.stateRoot, contract: approved.contract,
      digest: binding.contractDigest, runId: binding.runId, role: binding.role, jobId: options.launch.jobId, cycleBoundary: true,
      invoke: async ({ onSpawn, onTelemetry, deadlineAt }) => {
        const collector = new CodexUsageCollector(onTelemetry);
        const remaining = deadlineAt === null ? options.processSpec.timeoutMs : Date.parse(deadlineAt) - Date.now();
        if (remaining !== undefined && remaining <= 0) throw new TaskResourceError("wall_time_exceeded");
        const result = await withCodexTaskEnvironment({ projectRoot: approved.contract.scope.projectRoot, gitDirectory: approved.gitDirectory },
          (environment) => (options.runner ?? runProcess)({ ...options.processSpec,
          executable: options.launch.executable, args: options.launch.args, cwd: options.launch.cwd, environment,
          ...(remaining === undefined ? {} : { timeoutMs: Math.min(options.processSpec.timeoutMs ?? remaining, remaining) }),
          onSpawn: (child) => { options.processSpec.onSpawn?.(child); onSpawn(child); },
          onStdoutChunk: (chunk) => collector.push(chunk),
        }));
        const telemetry = collector.finish();
        const detail = `${collector.failureMessage ?? ""} ${result.stderr.excerpt}`;
        return { result, sessionId: collector.sessionId, telemetry, detail, processCode: result.code,
          exitCode: result.exitCode, closeConfirmed: result.closeConfirmed ?? result.exitCode !== null, terminal: collector.terminal };
      } });
    return { ...dispatched.result, ...(detectQuotaExhaustion(dispatched.detail) ? { taskStopCode: "quota_exhausted" }
      : dispatched.terminal !== "completed" ? { taskStopCode: `native_terminal_${dispatched.terminal}` } : {}) };
  } catch (error) {
    const { createHash } = await import("node:crypto");
    const empty = { excerpt: "", capped: false, totalBytes: 0, sha256: createHash("sha256").update("").digest("hex") };
    return { code: "spawn-failed", exitCode: null, signal: null, timedOut: false, outputCapped: false,
      durationMs: 0, stdout: empty, stderr: empty,
      taskStopCode: error instanceof TaskResourceError ? error.stopCode : "task_launch_not_authorized" };
  }
}
