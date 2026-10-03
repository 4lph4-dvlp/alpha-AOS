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
import type { TaskContract } from "./task-contract.js";
import {
  selectStepObligations,
  type TaskCapabilityObligation,
} from "./task-capability-obligations.js";
import {
  createCapabilityReceipt,
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
}

export interface RunPhaseOptions {
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
}

export interface MultiPhaseOptions {
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
        matched = files.filter((f) => f.endsWith("-SUMMARY.md"));
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

  // Select step obligations (CAP-03)
  const obligations = selectStepObligations({
    contract: options.contract,
    step: options.step,
    projectRoot: options.projectRoot,
    phaseId: options.phaseId,
  });
  const capabilityReceipts: TaskCapabilityReceipt[] = [];

  if (options.capabilityPort && obligations.length > 0) {
    for (const obligation of obligations) {
      try {
        const invocation = await options.capabilityPort.invoke({
          runId: options.runId ?? `step-${options.phaseId}-${options.step}`,
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
          runId: options.runId ?? `step-${options.phaseId}-${options.step}`,
          step: options.step,
          capabilityId: obligation.capabilityId,
          obligationId: obligation.id,
          question: obligation.question,
          selected: true,
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
      if (options.stepCommand.args.some((a) => a === options.phaseId || a.includes(options.phaseId))) {
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
      if (mapped.args.some((a) => a === options.phaseId || a.includes(options.phaseId))) {
        args = [...mapped.args];
      } else {
        args = [
          ...mapped.args,
          options.phaseId,
          ...(options.step === "verify" ? [] : ["--auto"]),
        ];
      }
    }
  }

  // Resolve executable if not absolute
  const resolvedExec = isAbsolute(executable)
    ? executable
    : (resolveCommand(executable) ?? executable);

  // 3. Isolated bounded child process execution via runProcess
  const startTime = Date.now();
  const processResult = await runProcess({
    executable: resolvedExec,
    args,
    cwd: options.projectRoot,
    timeoutMs: options.timeoutMs ?? 60_000,
    ...(options.stdin !== undefined ? { stdin: options.stdin } : {}),
    environment: { literal: scrubEnvironmentForOffTree(process.env).env },
  });
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
  const steps: readonly GsdStepKind[] = ["discuss", "plan", "execute", "verify"];
  const receipts: string[] = [];

  for (const step of steps) {
    const result = await executeGsdStep({
      ...options,
      step,
    });

    for (const r of result.receipts) {
      receipts.push(r.receiptDigest);
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
    });

    if (!lifecycleResult.success) {
      return {
        completedPhases,
        finalStatus: lifecycleResult.finalStep === "needs-input" ? "needs-input" : "failed",
      };
    }

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

  return {
    completedPhases,
    finalStatus: "completed",
  };
}
