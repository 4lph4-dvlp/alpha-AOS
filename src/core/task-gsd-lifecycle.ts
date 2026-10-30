import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import {
  runProcess,
  resolveCommand,
  scrubEnvironmentForOffTree,
} from "./process.js";
import {
  executeHookWithReceipt,
  type GsdHookPoint,
  type HookExecutionReceipt,
} from "./task-hook-receipt.js";
import { evaluateGsdPromptQuestion } from "./task-gsd-prompt.js";
import {
  discoverPhaseProgression,
  resolvePhaseDirectory,
} from "./task-gsd-discovery.js";
import {
  hasExecutionSummaries,
  hasPassedVerification,
  hasNyquistValidation,
} from "./task-gsd-gates.js";
import { taskContractDigest, type TaskContract } from "./task-contract.js";
import { userStateRoot } from "./paths.js";
import type { HarnessId } from "../types.js";
import { resolveHarnessRoleModel, resolveTaskAgentLaunch } from "../adapters/task-agent-launch.js";
import { meteredTaskDispatch, TaskResourceError } from "./task-runtime.js";
import { CodexUsageCollector } from "./task-native-usage.js";
import { normalizeHarnessTelemetry } from "./task-telemetry.js";
import { codexEffortArgs, codexGitAuthorityOverrides, withCodexTaskEnvironment } from "../adapters/task-codex.js";
import { dispatchUsage, readTaskDispatches } from "./task-runtime.js";
import { runGitRead } from "./task-gsd.js";
import { collectTaskArtifact } from "./task-check.js";
import {
  gateMilestoneFinalReview,
  type FinalReviewPort,
  type GateMilestoneFinalReviewResult,
} from "./task-final-review.js";
import {
  selectStepObligations,
  type TaskCapabilityObligation,
} from "./task-capability-obligations.js";
import {
  createCapabilityReceipt,
  createReusedCapabilityReceipt,
  readCapabilityReceipts,
  verifyRequiredCapabilityReceipts,
  writeCapabilityReceipt,
  type TaskCapabilityPort,
  type TaskCapabilityReceipt,
} from "./task-capability-receipts.js";

const ONE_MIB = 1024 * 1024;

export type GsdStepKind = "discuss" | "plan" | "execute" | "verify";

export interface GsdStepResult {
  readonly step: GsdStepKind;
  readonly phaseId: string;
  readonly exitCode: number;
  readonly stdoutSha256: string;
  readonly stderrSha256: string;
  readonly durationMs: number;
  readonly artifactsProduced: readonly string[];
  readonly nextStep: GsdStepKind | "complete" | "needs-input" | "failed";
  readonly receipts: readonly HookExecutionReceipt[];
  readonly obligations?: readonly TaskCapabilityObligation[] | undefined;
  readonly capabilityReceipts?: readonly TaskCapabilityReceipt[] | undefined;
}

export interface ExecuteStepOptions {
  readonly gitDirectory?: string | null | undefined;
  readonly projectRoot: string;
  readonly phaseId: string;
  readonly step: GsdStepKind;
  readonly contract: TaskContract;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly timeoutMs?: number | undefined;
  readonly receiptsRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
  readonly hookCommand?: string | undefined;
  readonly hookArgs?: readonly string[] | undefined;
  readonly capabilityPort?: TaskCapabilityPort | undefined;
  readonly runId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly stepCommand?: {
    executable: string;
    args?: readonly string[] | undefined;
  } | undefined;
  readonly commandMap?: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> | undefined;
  readonly stdin?: string | undefined;
  readonly priorReceipts?: readonly TaskCapabilityReceipt[] | undefined;
}

export interface RunPhaseOptions {
  readonly gitDirectory?: string | null | undefined;
  readonly projectRoot: string;
  readonly phaseId: string;
  readonly contract: TaskContract;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly timeoutMs?: number | undefined;
  readonly receiptsRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
  readonly hookCommand?: string | undefined;
  readonly hookArgs?: readonly string[] | undefined;
  readonly commandMap?: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> | undefined;
  readonly capabilityPort?: TaskCapabilityPort | undefined;
  readonly runId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly priorReceipts?: readonly TaskCapabilityReceipt[] | undefined;
}

export interface MultiPhaseOptions {
  readonly gitDirectory?: string | null | undefined;
  readonly projectRoot: string;
  readonly contract: TaskContract;
  readonly baseCommit: string;
  readonly targetRevisionSha?: string | undefined;
  readonly workingTreeDigest?: string | undefined;
  readonly timeoutMs?: number | undefined;
  readonly receiptsRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
  readonly hookCommand?: string | undefined;
  readonly hookArgs?: readonly string[] | undefined;
  readonly commandMap?: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> | undefined;
  readonly phases?: readonly string[] | undefined;
  readonly capabilityPort?: TaskCapabilityPort | undefined;
  readonly runId?: string | undefined;
  readonly sessionId?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly finalReviewPort?: FinalReviewPort | undefined;
}

function detectHarnessFromExecutable(name: string): HarnessId | null {
  const base = name.toLowerCase().replace(/\.exe$/u, "").split(/[/\\]/u).pop() ?? "";
  if (base === "agy" || base === "antigravity") return "antigravity";
  if (base === "claude") return "claude";
  if (base === "codex") return "codex";
  if (base === "pi") return "pi";
  if (base === "hermes") return "hermes";
  return null;
}

export function buildGsdStepWorkflowPrompt(step: GsdStepKind, phaseId: string): string {
  switch (step) {
    case "discuss":
      return `Execute the GSD discuss-phase workflow (@~/.gemini/antigravity/gsd-core/workflows/discuss-phase.md) for Phase ${phaseId} with arguments "${phaseId} --auto". Act as an autonomous engineering user proxy: analyze all gray areas for Phase ${phaseId}, select optimal recommended choices, log decisions into CONTEXT.md, and commit docs. Stop immediately after CONTEXT.md is written and committed.`;
    case "plan":
      return `Execute the GSD plan-phase workflow (@~/.gemini/antigravity/gsd-core/workflows/plan-phase.md) for Phase ${phaseId} with arguments "${phaseId} --no-reversibility-gates --text". Run phase research, pattern mapping, detailed plan synthesis, and plan-checker verification loop until plans pass. Commit planning docs and stop before execute-phase.`;
    case "execute":
      return `Execute the GSD execute-phase workflow (@~/.gemini/antigravity/gsd-core/workflows/execute-phase.md) for Phase ${phaseId} with arguments "${phaseId} --no-transition". Implement every task in all wave plans cleanly with full unit tests and atomic git commits.`;
    case "verify":
      return `Execute goal-backward verification and independent code review for Phase ${phaseId}. Read current SHA, changed diff, requirements and prior findings; verify changes and related regressions first. Reuse still-valid evidence. Run verify-work and required Nyquist validate-phase gates. Record actual results in VERIFICATION.md and VALIDATION.md, including gaps or human_needed. Never force a passing status. Preserve mandatory final independent review.`;
  }
}

export function resolveDefaultGsdHarnessCommand(
  harness: HarnessId,
  step: GsdStepKind,
  phaseId: string,
): { executable: string; args: string[] } {
  const prompt = buildGsdStepWorkflowPrompt(step, phaseId);
  switch (harness) {
    case "antigravity":
      return {
        executable: "agy",
        args: ["--mode", "accept-edits", "--dangerously-skip-permissions", "-p", prompt],
      };
    case "claude":
      return {
        executable: "claude",
        args: ["--dangerously-skip-permissions", "-p", prompt],
      };
    case "codex":
      return {
        executable: "codex",
        args: ["exec", prompt],
      };
    case "pi":
      return {
        executable: "pi",
        args: ["-p", prompt],
      };
    case "hermes":
      return {
        executable: "hermes",
        args: ["exec", prompt],
      };
  }
}

/**
 * Detects whether stdout contains an interactive GSD prompt question.
 */
function detectPromptInOutput(text: string): { questionText: string; recommendedDefault: string | null } | null {
  const qMatch = text.match(/Question:\s*([^\r\n]+)/i);
  if (qMatch) {
    const dMatch = text.match(/Default:\s*([^\r\n]+)/i);
    return {
      questionText: qMatch[1]!.trim(),
      recommendedDefault: dMatch ? dMatch[1]!.trim() : null,
    };
  }

  const pMatch = text.match(/\?\s*([^\r\n(]+)\s*\((?:default:?\s*)?([^)]+)\)/i);
  if (pMatch) {
    return {
      questionText: pMatch[1]!.trim(),
      recommendedDefault: pMatch[2]!.trim(),
    };
  }

  const bareQMatch = text.match(/(?:^|\n)\s*([A-Z][^\n\r?]+\?)\s*(?:\r?\n|$)/);
  if (bareQMatch) {
    return {
      questionText: bareQMatch[1]!.trim(),
      recommendedDefault: null,
    };
  }

  return null;
}

/**
 * Enumerates artifacts produced under `.planning/phases/` for a given step.
 */
async function enumerateProducedArtifacts(
  projectRoot: string,
  phaseId: string,
  step: GsdStepKind,
): Promise<string[]> {
  const phaseDir = await resolvePhaseDirectory(projectRoot, phaseId);
  if (!phaseDir || !existsSync(phaseDir)) {
    return [];
  }
  try {
    const files = await readdir(phaseDir);
    let matched: string[] = [];
    switch (step) {
      case "discuss":
        matched = files.filter((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
        break;
      case "plan":
        matched = files.filter((f) => f.endsWith("-PLAN.md"));
        break;
      case "execute":
        matched = files.filter(
          (f) =>
            f.endsWith("-SUMMARY.md") &&
            !f.endsWith("-PLANNING-SUMMARY.md") &&
            !f.startsWith("PLANNING-") &&
            f !== "PLANNING-SUMMARY.md",
        );
        break;
      case "verify":
        matched = files.filter(
          (f) =>
            f.endsWith("-VERIFICATION.md") ||
            f.endsWith("-UAT.md") ||
            f === "VERIFICATION.md",
        );
        break;
    }
    return matched.map((f) => relative(projectRoot, join(phaseDir, f)).replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

/**
 * Safely reads a UTF-8 text file up to 1 MiB bounded length.
 */
async function readBounded(filePath: string): Promise<string> {
  const bytes = await readFile(filePath);
  if (bytes.byteLength > ONE_MIB) {
    throw new Error(`${filePath} exceeds the 1 MiB limit.`);
  }
  return bytes.toString("utf8");
}

/**
 * Executes a single GSD lifecycle step as an isolated bounded child process,
 * injecting the `--auto` flag, validating pre/post mandatory hooks, and evaluating prompts.
 *
 * Implements GSD-01, GSD-04, and decisions D-04, D-13.
 */
export async function executeGsdStep(options: ExecuteStepOptions): Promise<GsdStepResult> {
  const receipts: HookExecutionReceipt[] = [];

  const runId = options.runId ?? `step-${options.phaseId}-${options.step}`;
  let priorReceipts: readonly TaskCapabilityReceipt[] = options.priorReceipts ?? [];
  if (priorReceipts.length === 0 && options.stateRoot && options.runId) {
    try {
      priorReceipts = await readCapabilityReceipts(options.stateRoot, options.runId);
    } catch {
      priorReceipts = [];
    }
  }

  // Select step obligations (CAP-03)
  const obligations = selectStepObligations({
    contract: options.contract,
    step: options.step,
    projectRoot: options.projectRoot,
    phaseId: options.phaseId,
    priorReceipts,
  });
  const capabilityReceipts: TaskCapabilityReceipt[] = [];

  for (const obligation of obligations) {
    // If obligation is marked for reuse (D-09):
    if (obligation.reusedFromReceiptId) {
      const prior = priorReceipts.find((r) => r.receiptId === obligation.reusedFromReceiptId);
      if (prior) {
        try {
          const reused = createReusedCapabilityReceipt({
            runId,
            obligation,
            original: prior,
            sessionId: options.sessionId,
          });
          capabilityReceipts.push(reused);
          if (options.stateRoot) {
            await writeCapabilityReceipt(reused, options.stateRoot);
          }
          continue;
        } catch (err) {
          const failedReceipt = createCapabilityReceipt({
            runId,
            step: options.step,
            capabilityId: obligation.capabilityId,
            obligationId: obligation.id,
            question: obligation.question,
            selected: true,
            attempted: true,
            invoked: false,
            outcome: "failed",
            invokedAt: new Date().toISOString(),
            toolName: obligation.capabilityId,
            harness: "gsd",
            harnessVersion: null,
            harnessExecutable: null,
            sessionId: options.sessionId ?? null,
            source: obligation.source,
            sourceVersion: obligation.version,
            observationId: `err-${Date.now()}`,
            rawResultSha256: "0".repeat(64),
            isReused: true,
            originalReceiptId: obligation.reusedFromReceiptId,
            isError: true,
            errorMessage: err instanceof Error ? err.message : String(err),
          });
          capabilityReceipts.push(failedReceipt);
          if (options.stateRoot) {
            await writeCapabilityReceipt(failedReceipt, options.stateRoot);
          }
          continue;
        }
      }
    }

    if (options.capabilityPort) {
      try {
        const invocation = await options.capabilityPort.invoke({
          runId,
          step: options.step,
          obligation,
          projectRoot: options.projectRoot,
          sessionId: options.sessionId,
        });
        capabilityReceipts.push(invocation.receipt);
        if (options.stateRoot) {
          await writeCapabilityReceipt(invocation.receipt, options.stateRoot);
        }
      } catch (error) {
        const failedReceipt = createCapabilityReceipt({
          runId,
          step: options.step,
          capabilityId: obligation.capabilityId,
          obligationId: obligation.id,
          question: obligation.question,
          selected: true,
          attempted: true,
          invoked: true,
          outcome: "failed",
          invokedAt: new Date().toISOString(),
          toolName: obligation.capabilityId,
          harness: "gsd",
          harnessVersion: null,
          harnessExecutable: null,
          sessionId: options.sessionId ?? null,
          source: obligation.source,
          sourceVersion: obligation.version,
          observationId: `err-${Date.now()}`,
          rawResultSha256: "0".repeat(64),
          isReused: false,
          originalReceiptId: null,
          isError: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        capabilityReceipts.push(failedReceipt);
        if (options.stateRoot) {
          await writeCapabilityReceipt(failedReceipt, options.stateRoot);
        }
      }
    }
  }

  // Fail-closed verification check (CAP-03, D-04, D-13):
  // If obligations contain any required obligation, verify them against receipts
  if (obligations.some((ob) => ob.required)) {
    const capabilityVerification = verifyRequiredCapabilityReceipts({
      obligations,
      receipts: capabilityReceipts,
      currentRunId: runId,
      currentStep: options.step,
      currentSessionId: options.sessionId,
    });
    if (!capabilityVerification.satisfied) {
      return {
        step: options.step,
        phaseId: options.phaseId,
        exitCode: 1,
        stdoutSha256: "0".repeat(64),
        stderrSha256: "0".repeat(64),
        durationMs: 0,
        artifactsProduced: [],
        nextStep: "failed",
        receipts,
        obligations,
        capabilityReceipts,
      };
    }
  }

  // 1. Mandatory Pre-step hook execution (D-13)
  const preHookPoint: GsdHookPoint = `${options.step}:pre`;
  const preReceipt = await executeHookWithReceipt({
    hookPoint: preHookPoint,
    phaseId: options.phaseId,
    command: options.hookCommand ?? process.execPath,
    args: options.hookArgs ?? ["-e", "process.exit(0)"],
    cwd: options.projectRoot,
    targetRevisionSha: options.targetRevisionSha,
    workingTreeDigest: options.workingTreeDigest,
    receiptsRoot: options.receiptsRoot,
    packageRoot: options.packageRoot,
    timeoutMs: options.timeoutMs,
  });
  receipts.push(preReceipt);

  // 2. Determine GSD step command and inject --auto (D-04)
  let executable = "gsd-" + (options.step === "verify" ? "verify-work" : `${options.step}-phase`);
  let args: string[] = options.step === "verify"
    ? [options.phaseId]
    : [options.phaseId, "--auto"];

  if (options.stepCommand) {
    executable = options.stepCommand.executable;
    if (options.stepCommand.args && options.stepCommand.args.length > 0) {
      if (options.stepCommand.args.some((a) => a === options.phaseId)) {
        args = [...options.stepCommand.args];
      } else {
        args = [
          ...options.stepCommand.args,
          options.phaseId,
          ...(options.step === "verify" ? [] : ["--auto"]),
        ];
      }
    }
  } else if (options.commandMap?.[options.step]) {
    const mapped = options.commandMap[options.step]!;
    executable = mapped.executable;
    if (mapped.args && mapped.args.length > 0) {
      if (mapped.args.some((a) => a === options.phaseId)) {
        args = [...mapped.args];
      } else {
        args = [
          ...mapped.args,
          options.phaseId,
          ...(options.step === "verify" ? [] : ["--auto"]),
        ];
      }
    }
  } else if (options.contract?.agentPolicy?.controller) {
    const defaultCmd = resolveDefaultGsdHarnessCommand(
      options.contract.agentPolicy[options.step === "execute" ? "executor" : options.step === "verify" ? "reviewer" : "controller"],
      options.step,
      options.phaseId,
    );
    executable = defaultCmd.executable;
    args = [...defaultCmd.args];
    const records = options.stateRoot ? await readTaskDispatches(options.stateRoot, taskContractDigest(options.contract)) : [];
    const progress = await discoverPhaseProgression({ projectRoot: options.projectRoot, phaseId: options.phaseId });
    const packet = JSON.stringify({ contractDigest: taskContractDigest(options.contract), runId: options.runId ?? null,
      phaseId: options.phaseId, step: options.step, currentSha: options.targetRevisionSha, artifactDigest: options.workingTreeDigest,
      allowedRoots: options.contract.allowedRoots, allowedEffects: options.contract.allowedEffects,
      agentPolicy: options.contract.agentPolicy, resourcePolicy: options.contract.resourcePolicy,
      usage: dispatchUsage(records), pendingPlans: progress.pendingPlans, completedPlans: progress.completedPlans.map((plan) => plan.planId),
      previousFailure: records.findLast((record) => record.status === "failed" || record.status === "interrupted")?.reason ?? null });
    if (Buffer.byteLength(packet) > 8192) throw new Error("Native GSD task packet exceeds its 8 KiB bound");
    args[args.length - 1] += `\nApproved bounded runtime packet: ${packet}\nPreserve partial summaries and dirty WIP; execute only remaining GSD slices. Do not plan a later phase while this phase is blocked. Required GSD reads/gates still apply.`;
  }

  // Resolve executable if not absolute
  let resolvedExec = isAbsolute(executable)
    ? executable
    : (resolveCommand(executable) ?? executable);

  const detectedHarness = detectHarnessFromExecutable(executable);
  if (detectedHarness) {
    const role: "controller" | "executor" | "reviewer" =
      options.step === "execute"
        ? "executor"
        : options.step === "verify"
          ? "reviewer"
          : "controller";
    const resolvedModel = await resolveHarnessRoleModel({
      harness: detectedHarness,
      role,
      agentPolicy: options.contract?.agentPolicy,
      projectRoot: options.projectRoot,
    });
    if (resolvedModel) {
      const modelFlag = args.findIndex((value) => value === "-m" || value === "--model");
      if (modelFlag !== -1 && args[modelFlag + 1] !== resolvedModel) throw new Error("GSD argv model differs from the approved role model");
      if (detectedHarness === "codex") {
        if (!args.includes("-m") && !args.includes("--model")) {
          const execIdx = args.findIndex((a) => a === "exec");
          if (execIdx !== -1) {
            args.splice(execIdx + 1, 0, "-m", resolvedModel);
          } else {
            args.push("-m", resolvedModel);
          }
        }
      } else {
        if (!args.includes("--model")) {
          const pIndex = args.findIndex((a) => a === "-p" || a === "--print");
          if (pIndex !== -1) {
            args.splice(pIndex, 0, "--model", resolvedModel);
          } else {
            args.push("--model", resolvedModel);
          }
        }
      }
    }
  }

  if (detectedHarness === "codex") {
    const role = options.step === "execute" ? "executor" : options.step === "verify" ? "reviewer" : "controller";
    args.splice(1, 0, "--json", ...(options.gitDirectory ? codexGitAuthorityOverrides(options.gitDirectory) : ["--sandbox", "workspace-write"]),
      ...codexEffortArgs(options.contract.agentPolicy[`${role}Effort`]));
  }
  if (detectedHarness !== null && (!options.stateRoot || !options.runId)) throw new Error("Native GSD steps require an exact run and external state root");
  if (detectedHarness !== null) {
    const launch = resolveTaskAgentLaunch(executable);
    if (launch.status !== "ok") throw new Error(launch.reason);
    resolvedExec = launch.executable;
    args = [...launch.argsPrefix, ...args];
  }
  // 3. Isolated bounded child process execution via runProcess
  const startTime = Date.now();
  const processSpec = {
    executable: resolvedExec,
    args,
    cwd: options.projectRoot,
    timeoutMs: options.timeoutMs ?? 60_000,
    ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
    environment: { literal: scrubEnvironmentForOffTree(process.env).env },
  };
  const role = options.step === "execute" ? "executor" : options.step === "verify" ? "reviewer" : "controller";
  const processResult = detectedHarness === null ? await runProcess(processSpec) : (await meteredTaskDispatch({
    stateRoot: options.stateRoot ?? userStateRoot(), contract: options.contract,
    digest: taskContractDigest(options.contract), runId: options.runId ?? "unbound-gsd-step", role,
    invoke: async ({ onSpawn, onTelemetry, deadlineAt }) => {
      if (!options.runId || !options.stateRoot) throw new Error("Native GSD steps require an exact run and external state root");
      const collector = detectedHarness === "codex" ? new CodexUsageCollector(onTelemetry) : null;
      const remaining = deadlineAt === null ? processSpec.timeoutMs : Date.parse(deadlineAt) - Date.now();
      if (remaining <= 0) throw new TaskResourceError("wall_time_exceeded");
      const invoke = (environment: import("./process.js").EnvironmentPolicy) => runProcess({ ...processSpec, environment,
        timeoutMs: Math.min(processSpec.timeoutMs, remaining), onSpawn,
        ...(collector ? { onStdoutChunk: (chunk: Buffer) => collector.push(chunk) } : {}) });
      const result = detectedHarness === "codex" ? await withCodexTaskEnvironment({ projectRoot: options.projectRoot,
        gitDirectory: options.gitDirectory ?? null }, invoke) : await invoke(processSpec.environment);
      return { sessionId: collector?.sessionId ?? null, result,
        processCode: result.code, exitCode: result.exitCode, closeConfirmed: result.closeConfirmed ?? result.exitCode !== null,
        terminal: collector?.terminal ?? (result.code === "ok" ? "completed" : "failed"),
        telemetry: collector?.finish() ?? normalizeHarnessTelemetry(detectedHarness, null),
        detail: `${collector?.failureMessage ?? ""} ${result.stderr.excerpt}` };
    },
  })).result;
  const durationMs = Math.max(0, Date.now() - startTime);

  // 4. Interactive prompt detection and classifier evaluation (D-01, D-02)
  const promptMatch = detectPromptInOutput(processResult.stdout.excerpt);
  if (promptMatch) {
    const evaluation = evaluateGsdPromptQuestion(
      promptMatch.questionText,
      promptMatch.recommendedDefault,
      options.contract,
    );
    if (evaluation.action === "needs-input") {
      return {
        step: options.step,
        phaseId: options.phaseId,
        exitCode: processResult.exitCode ?? 1,
        stdoutSha256: processResult.stdout.sha256,
        stderrSha256: processResult.stderr.sha256,
        durationMs,
        artifactsProduced: [],
        nextStep: "needs-input",
        receipts,
        obligations,
        capabilityReceipts,
      };
    }
  }

  // 5. Fail-closed on non-zero exit or abnormal process termination
  const isOk = processResult.code === "ok" && (processResult.exitCode === 0 || processResult.exitCode === null);
  if (!isOk) {
    return {
      step: options.step,
      phaseId: options.phaseId,
      exitCode: processResult.exitCode ?? 1,
      stdoutSha256: processResult.stdout.sha256,
      stderrSha256: processResult.stderr.sha256,
      durationMs,
      artifactsProduced: [],
      nextStep: "failed",
      receipts,
      obligations,
      capabilityReceipts,
    };
  }

  // 6. Mandatory Post-step hook execution (D-13)
  const postHookPoint: GsdHookPoint = `${options.step}:post`;
  const postReceipt = await executeHookWithReceipt({
    hookPoint: postHookPoint,
    phaseId: options.phaseId,
    command: options.hookCommand ?? process.execPath,
    args: options.hookArgs ?? ["-e", "process.exit(0)"],
    cwd: options.projectRoot,
    targetRevisionSha: options.targetRevisionSha,
    workingTreeDigest: options.workingTreeDigest,
    receiptsRoot: options.receiptsRoot,
    packageRoot: options.packageRoot,
    timeoutMs: options.timeoutMs,
  });
  receipts.push(postReceipt);

  // 7. Enumerate artifacts produced and determine next sequential step
  const artifactsProduced = await enumerateProducedArtifacts(
    options.projectRoot,
    options.phaseId,
    options.step,
  );

  // 8. Stage Gate Enforcement: Fail-closed on missing execution summaries or verification gaps
  const phaseDir = await resolvePhaseDirectory(options.projectRoot, options.phaseId);
  if (phaseDir && options.step === "execute") {
    if (!hasExecutionSummaries(phaseDir, options.phaseId)) {
      return {
        step: options.step,
        phaseId: options.phaseId,
        exitCode: 1,
        stdoutSha256: processResult.stdout.sha256,
        stderrSha256: processResult.stderr.sha256,
        durationMs,
        artifactsProduced,
        nextStep: "failed",
        receipts,
        obligations,
        capabilityReceipts,
      };
    }
  } else if (phaseDir && options.step === "verify") {
    let nyquistRequired = false;
    try { nyquistRequired = JSON.parse(await readFile(join(options.projectRoot, ".planning", "config.json"), "utf8")).workflow?.nyquist_validation === true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (!await hasPassedVerification(phaseDir, options.phaseId, { projectRoot: options.projectRoot }) ||
      (nyquistRequired && !hasNyquistValidation(phaseDir, options.phaseId))) {
      return {
        step: options.step,
        phaseId: options.phaseId,
        exitCode: 1,
        stdoutSha256: processResult.stdout.sha256,
        stderrSha256: processResult.stderr.sha256,
        durationMs,
        artifactsProduced,
        nextStep: "failed",
        receipts,
        obligations,
        capabilityReceipts,
      };
    }
  }

  const stepSequence: Record<GsdStepKind, GsdStepKind | "complete"> = {
    discuss: "plan",
    plan: "execute",
    execute: "verify",
    verify: "complete",
  };

  return {
    step: options.step,
    phaseId: options.phaseId,
    exitCode: 0,
    stdoutSha256: processResult.stdout.sha256,
    stderrSha256: processResult.stderr.sha256,
    durationMs,
    artifactsProduced,
    nextStep: stepSequence[options.step],
    receipts,
    obligations,
    capabilityReceipts,
  };
}

/**
 * Sequentially executes the full lifecycle (discuss -> plan -> execute -> verify) for a single phase.
 */
export async function runPhaseLifecycle(options: RunPhaseOptions): Promise<{
  success: boolean;
  finalStep: string;
  receipts: readonly string[];
}> {
  const phaseDir = await resolvePhaseDirectory(options.projectRoot, options.phaseId);
  const files = phaseDir ? await readdir(phaseDir) : [];
  const steps: GsdStepKind[] = [];
  if (!files.some((name) => name.endsWith("CONTEXT.md"))) steps.push("discuss");
  if (!files.some((name) => name.endsWith("-PLAN.md"))) steps.push("plan");
  if (!hasExecutionSummaries(phaseDir, options.phaseId)) steps.push("execute");
  // Verification observes current source and Nyquist; never skip it merely
  // because a SUMMARY exists or a prior phase was marked ready.
  steps.push("verify");
  const receipts: string[] = [];
  const accumulatedCapabilityReceipts: TaskCapabilityReceipt[] = [
    ...(options.priorReceipts ?? []),
  ];
  if (accumulatedCapabilityReceipts.length === 0 && options.stateRoot && options.runId) {
    try {
      const fromDisk = await readCapabilityReceipts(options.stateRoot, options.runId);
      accumulatedCapabilityReceipts.push(...fromDisk);
    } catch {
      // ignore
    }
  }

  for (const step of steps) {
    const currentHead = (await runGitRead(options.projectRoot, ["rev-parse", "HEAD"]).catch(() => options.targetRevisionSha)).trim();
    const currentArtifact = await collectTaskArtifact({ projectRoot: options.projectRoot, allowedRoots: options.contract.allowedRoots });
    if (currentArtifact.status !== "ok") return { success: false, finalStep: "artifact-unavailable", receipts };
    const result = await executeGsdStep({
      ...options,
      targetRevisionSha: currentHead,
      workingTreeDigest: currentArtifact.digest,
      step,
      priorReceipts: accumulatedCapabilityReceipts,
    });

    for (const r of result.receipts) {
      receipts.push(r.receiptDigest);
    }
    if (result.capabilityReceipts) {
      accumulatedCapabilityReceipts.push(...result.capabilityReceipts);
    }

    if (result.nextStep === "needs-input") {
      return {
        success: false,
        finalStep: "needs-input",
        receipts,
      };
    }

    if (result.nextStep === "failed" || result.exitCode !== 0) {
      return {
        success: false,
        finalStep: step,
        receipts,
      };
    }
  }

  return {
    success: true,
    finalStep: "complete",
    receipts,
  };
}

/**
 * Extracts phase IDs from a ROADMAP.md file.
 */
function parsePhasesFromRoadmap(roadmapContent: string): string[] {
  const phases: string[] = [];
  const lines = roadmapContent.split(/\r?\n/);

  for (const line of lines) {
    // Matches: - [ ] **Phase 01: ...** or - [x] **Phase 01: ...** or - [ ] Phase 01: ...
    const match = line.match(/^-\s*\[[ xX]\]\s*(?:\*\*)?Phase\s+([0-9]+[a-zA-Z0-9_-]*)/i);
    if (match?.[1]) {
      const pid = match[1];
      if (!phases.includes(pid)) {
        phases.push(pid);
      }
      continue;
    }
    // Matches: ### Phase 01: ...
    const headerMatch = line.match(/^###?\s+(?:\*\*)?Phase\s+([0-9]+[a-zA-Z0-9_-]*)/i);
    if (headerMatch?.[1]) {
      const pid = headerMatch[1];
      if (!phases.includes(pid)) {
        phases.push(pid);
      }
    }
  }

  return phases;
}

/**
 * Orchestrates multi-phase progression across roadmap phases purely driven by read-only
 * observation of GSD STATE.md and ROADMAP.md without supervisor substitute state machines.
 *
 * Implements GSD-01, GSD-03, and decisions D-09, D-12, SC 1.
 */
export async function orchestrateMultiPhaseProgression(options: MultiPhaseOptions): Promise<{
  completedPhases: readonly string[];
  finalStatus: "completed" | "needs-input" | "failed";
  finalReviewGate?: GateMilestoneFinalReviewResult | undefined;
}> {
  const completedPhases: string[] = [];
  let candidatePhases: string[] = [];

  if (options.phases && options.phases.length > 0) {
    candidatePhases = [...options.phases];
  } else {
    const roadmapPath = join(options.projectRoot, ".planning", "ROADMAP.md");
    if (existsSync(roadmapPath)) {
      const roadmapText = await readBounded(roadmapPath);
      candidatePhases = parsePhasesFromRoadmap(roadmapText);
    }
  }

  const targetSha = options.targetRevisionSha ?? options.baseCommit;
  const treeDigest = options.workingTreeDigest ?? "0".repeat(64);

  for (const phaseId of candidatePhases) {
    // 1. Pure read observation of GSD state: check if phase already complete
    const progression = await discoverPhaseProgression({
      projectRoot: options.projectRoot,
      phaseId,
      baseCommit: options.baseCommit,
    });

    if (progression.isPhaseComplete) {
      completedPhases.push(phaseId);
      continue;
    }

    // 2. Invoke GSD phase lifecycle for the pending phase
    const lifecycleResult = await runPhaseLifecycle({
      gitDirectory: options.gitDirectory,
      projectRoot: options.projectRoot,
      phaseId,
      contract: options.contract,
      targetRevisionSha: targetSha,
      workingTreeDigest: treeDigest,
      timeoutMs: options.timeoutMs,
      receiptsRoot: options.receiptsRoot,
      packageRoot: options.packageRoot,
      hookCommand: options.hookCommand,
      hookArgs: options.hookArgs,
      commandMap: options.commandMap,
      capabilityPort: options.capabilityPort,
      runId: options.runId,
      sessionId: options.sessionId,
      stateRoot: options.stateRoot,
    });

    if (!lifecycleResult.success) {
      return {
        completedPhases,
        finalStatus: lifecycleResult.finalStep === "needs-input" ? "needs-input" : "failed",
      };
    }

    const completed = await discoverPhaseProgression({ projectRoot: options.projectRoot, phaseId, baseCommit: options.baseCommit });
    if (!completed.isPhaseComplete) return { completedPhases, finalStatus: "failed" };

    completedPhases.push(phaseId);

    // 3. Observe updated STATE.md and ROADMAP.md natively without writing any supervisor shadow state (D-09, D-12)
    const statePath = join(options.projectRoot, ".planning", "STATE.md");
    if (existsSync(statePath)) {
      await readBounded(statePath);
    }
    const roadmapPath = join(options.projectRoot, ".planning", "ROADMAP.md");
    if (existsSync(roadmapPath)) {
      await readBounded(roadmapPath);
    }
    // Loop advances to next phase without user prompt or manual commands (SC 1)
  }

  // 4. Milestone Final Review Gate (REV-03, D-13, D-14, D-15)
  // Milestone acceptance requires an independent review of all mandatory requirements and core constraints.
  const stateRoot = options.stateRoot ?? userStateRoot();
  const cDigest = taskContractDigest(options.contract);

  const finalHead = (await runGitRead(options.projectRoot, ["rev-parse", "HEAD"])).trim();
  const finalArtifact = await collectTaskArtifact({ projectRoot: options.projectRoot, allowedRoots: options.contract.allowedRoots });
  if (finalArtifact.status !== "ok") return { completedPhases, finalStatus: "failed" };
  const finalReviewGate = await gateMilestoneFinalReview({
    runId: options.runId,
    projectRoot: options.projectRoot,
    stateRoot,
    contract: options.contract,
    contractDigest: cDigest,
    targetRevisionSha: finalHead,
    workingTreeDigest: finalArtifact.digest,
    finalReviewPort: options.finalReviewPort,
    packageRoot: options.packageRoot,
  });

  if (finalReviewGate.status !== "accepted") {
    return {
      completedPhases,
      finalStatus: finalReviewGate.status === "blocked" ? "failed" : "needs-input",
      finalReviewGate,
    };
  }

  return {
    completedPhases,
    finalStatus: "completed",
    finalReviewGate,
  };
}
