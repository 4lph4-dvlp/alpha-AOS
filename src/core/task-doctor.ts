import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { ALL_HARNESSES } from "../adapters/task-agents.js";
import { readHarnessRoleReceipt } from "../adapters/task-receipts.js";
import { HARNESS_TELEMETRY_CAPABILITIES } from "./task-telemetry.js";
import { userStateRoot } from "./paths.js";
import { discoverPhaseProgression } from "./task-gsd-discovery.js";
import { runGitRead } from "./task-gsd.js";
import { readTaskReviewSuggestions } from "./task-review-suggestions.js";
import { isTaskContractId, loadTaskContract, readTaskApprovals, readReservedTaskRun } from "./task-contract.js";
import { readTaskStatusModel } from "./task-read.js";

export interface HarnessDoctorEntry {
  harness: string;
  roles: {
    controller: "PROVEN" | "UNVERIFIED" | "MISSING";
    executor: "PROVEN" | "UNVERIFIED" | "MISSING";
    reviewer: "PROVEN" | "UNVERIFIED" | "MISSING";
  };
  toolsAndMcp: string;
  telemetry: "measured (tokens)" | "measured (tokens+cost)" | "unmetered";
}

export async function buildTaskDoctorReport(
  receiptsRoot?: string,
  options?: { checkDrift?: boolean },
): Promise<HarnessDoctorEntry[]> {
  const report: HarnessDoctorEntry[] = [];
  const checkDrift = options?.checkDrift ?? true;

  for (const harness of ALL_HARNESSES) {
    const roles: HarnessDoctorEntry["roles"] = {
      controller: "MISSING",
      executor: "MISSING",
      reviewer: "MISSING",
    };

    for (const role of ["controller", "executor", "reviewer"] as const) {
      const res = await readHarnessRoleReceipt(harness, role, receiptsRoot, { checkDrift });
      if (res.receipt && !res.versionDrift) {
        roles[role] = "PROVEN";
      } else if (res.versionDrift) {
        roles[role] = "UNVERIFIED";
      } else {
        roles[role] = "MISSING";
      }
    }

    const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];
    const telemetry: HarnessDoctorEntry["telemetry"] = caps?.metersCost
      ? "measured (tokens+cost)"
      : caps?.metersTokens
        ? "measured (tokens)"
        : "unmetered";

    const toolsDescription =
      harness === "claude"
        ? "Native tools + Claude stdio MCP (JSON)"
        : harness === "codex"
          ? "Native tools + Codex MCP bridge (TOML)"
          : harness === "antigravity"
            ? "Native tools + Antigravity MCP config"
            : harness === "pi"
              ? "Native tools + pi-mcp-adapter"
              : "Native tools + Hermes YAML config";

    report.push({
      harness,
      roles,
      toolsAndMcp: toolsDescription,
      telemetry,
    });
  }

  return report;
}

export function formatDoctorTable(entries: HarnessDoctorEntry[]): string {
  const headers = ["Harness", "Roles (Ctrl/Exec/Rev)", "Tools & MCP", "Telemetry"];
  const rows = entries.map((entry) => [
    entry.harness,
    `${entry.roles.controller}/${entry.roles.executor}/${entry.roles.reviewer}`,
    entry.toolsAndMcp,
    entry.telemetry,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0))
  );
  const render = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join("  ").trimEnd();

  return [render(headers), render(widths.map((width) => "-".repeat(width))), ...rows.map(render)].join("\n");
}

export interface GsdLifecycleDiagnostics {
  readonly currentPhase: string | null;
  readonly phaseStatus: string | null;
  readonly completedPlansCount: number;
  readonly pendingPlansCount: number;
  readonly isPhaseComplete: boolean;
  readonly hooks: {
    readonly executedCount: number;
    readonly passedCount: number;
    readonly failedCount: number;
    readonly details: readonly {
      readonly hookPoint: string;
      readonly status: "passed" | "failed";
      readonly durationMs: number;
      readonly executedAt: string;
    }[];
  };
  readonly reviewWitness: {
    readonly recorded: boolean;
    readonly headSha: string | null;
    readonly witnessRevisionSha: string | null;
    readonly matchesHead: boolean;
    readonly verdict: string | null;
  };
  readonly pendingSuggestions?: {
    readonly count: number;
    readonly status: "ok" | "error";
    readonly error?: string | undefined;
  } | undefined;
}

export async function diagnoseGsdLifecycleStatus(options: {
  projectRoot: string;
  phaseId?: string | undefined;
  receiptsRoot?: string | undefined;
  baseCommit?: string | undefined;
  stateRoot?: string | undefined;
  contractId?: string | undefined;
}): Promise<GsdLifecycleDiagnostics> {
  const { projectRoot } = options;
  let phaseId = options.phaseId ?? null;
  let phaseStatus: string | null = null;

  // 1. Read STATE.md if present
  const statePath = join(projectRoot, ".planning", "STATE.md");
  if (existsSync(statePath)) {
    try {
      const stateContent = await readFile(statePath, "utf8");
      if (!phaseId) {
        const phaseMatch =
          stateContent.match(/current_phase:\s*([^\r\n]+)/i) ||
          stateContent.match(/Phase:\s*([0-9]+[a-zA-Z0-9_-]*)/i);
        if (phaseMatch?.[1]) {
          phaseId = phaseMatch[1].trim();
        }
      }
      const statusMatch = stateContent.match(/status:\s*([^\r\n]+)/i);
      if (statusMatch?.[1]) {
        phaseStatus = statusMatch[1].trim();
      }
    } catch {}
  }

  // 2. Discover progression
  let completedPlansCount = 0;
  let pendingPlansCount = 0;
  let isPhaseComplete = false;
  if (phaseId) {
    try {
      const progression = await discoverPhaseProgression({
        projectRoot,
        phaseId,
        baseCommit: options.baseCommit,
      });
      completedPlansCount = progression.completedPlans.length;
      pendingPlansCount = progression.pendingPlans.length;
      isPhaseComplete = progression.isPhaseComplete;
    } catch {}
  }

  // 3. Inspect Hook Receipts
  const hooksRoot = options.receiptsRoot
    ? join(options.receiptsRoot, "hooks")
    : join(userStateRoot(), "receipts", "hooks");

  const hookDetails: {
    hookPoint: string;
    status: "passed" | "failed";
    durationMs: number;
    executedAt: string;
  }[] = [];

  if (existsSync(hooksRoot)) {
    try {
      const files = await readdir(hooksRoot);
      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const raw = await readFile(join(hooksRoot, file), "utf8");
            const parsed = JSON.parse(raw);
            if (parsed.kind === "hook-execution-receipt") {
              if (!phaseId || parsed.phaseId === phaseId || parsed.phaseId?.startsWith(phaseId)) {
                hookDetails.push({
                  hookPoint: parsed.hookPoint,
                  status: parsed.status,
                  durationMs: parsed.durationMs,
                  executedAt: parsed.executedAt,
                });
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  const passedHooks = hookDetails.filter((h) => h.status === "passed").length;
  const failedHooks = hookDetails.filter((h) => h.status === "failed").length;

  // 4. Inspect Review Witness
  let headSha: string | null = null;
  try {
    headSha = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
  } catch {}

  const witnessesRoot = options.receiptsRoot
    ? join(options.receiptsRoot, "witnesses")
    : join(userStateRoot(), "receipts", "witnesses");

  let recordedWitness = false;
  let witnessRevisionSha: string | null = null;
  let witnessVerdict: string | null = null;

  if (existsSync(witnessesRoot)) {
    try {
      const files = await readdir(witnessesRoot);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));
      if (jsonFiles.length > 0) {
        const latestFile = jsonFiles[jsonFiles.length - 1]!;
        const raw = await readFile(join(witnessesRoot, latestFile), "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.kind === "review-witness-receipt") {
          recordedWitness = true;
          witnessRevisionSha = parsed.targetRevisionSha ?? null;
          witnessVerdict = parsed.witnessVerdict ?? null;
        }
      }
    } catch {}
  }

  const matchesHead = recordedWitness && headSha !== null && witnessRevisionSha === headSha;

  // 5. Inspect Pending Suggestions (D-08, REV-05)
  let pendingSuggestions: GsdLifecycleDiagnostics["pendingSuggestions"] = undefined;
  const stateRoot = options.stateRoot ?? userStateRoot();
  if (options.contractId) {
    const sugResult = await readTaskReviewSuggestions({ stateRoot, contractId: options.contractId });
    if (sugResult.status === "ok") {
      pendingSuggestions = { count: sugResult.pendingCount, status: "ok" };
    } else {
      pendingSuggestions = { count: 0, status: "error", error: sugResult.error };
    }
  } else {
    const tasksDir = join(stateRoot, "tasks");
    if (existsSync(tasksDir)) {
      try {
        const contracts = await readdir(tasksDir);
        let totalPending = 0;
        let anyError: string | null = null;
        let foundAny = false;
        for (const cid of contracts) {
          const sugResult = await readTaskReviewSuggestions({ stateRoot, contractId: cid });
          if (sugResult.status === "ok") {
            foundAny = true;
            totalPending += sugResult.pendingCount;
          } else {
            anyError = sugResult.error;
          }
        }
        if (anyError !== null) {
          pendingSuggestions = { count: 0, status: "error", error: anyError };
        } else if (foundAny) {
          pendingSuggestions = { count: totalPending, status: "ok" };
        }
      } catch {}
    }
  }

  return {
    currentPhase: phaseId,
    phaseStatus,
    completedPlansCount,
    pendingPlansCount,
    isPhaseComplete,
    hooks: {
      executedCount: hookDetails.length,
      passedCount: passedHooks,
      failedCount: failedHooks,
      details: hookDetails,
    },
    reviewWitness: {
      recorded: recordedWitness,
      headSha,
      witnessRevisionSha,
      matchesHead,
      verdict: witnessVerdict,
    },
    pendingSuggestions,
  };
}

export function formatGsdDoctorReport(diagnostics: GsdLifecycleDiagnostics): string {
  const lines: string[] = [
    "GSD Lifecycle Status",
    "====================",
    `Current Phase:    ${diagnostics.currentPhase ?? "none"} (${diagnostics.phaseStatus ?? "unknown"})`,
    `Phase Progress:   ${diagnostics.completedPlansCount} completed, ${diagnostics.pendingPlansCount} pending (complete: ${diagnostics.isPhaseComplete ? "yes" : "no"})`,
    `Hook Receipts:    ${diagnostics.hooks.executedCount} executed (${diagnostics.hooks.passedCount} passed, ${diagnostics.hooks.failedCount} failed)`,
    `Review Witness:   ${diagnostics.reviewWitness.recorded ? (diagnostics.reviewWitness.matchesHead ? `valid (matches HEAD: ${diagnostics.reviewWitness.headSha?.slice(0, 12)})` : `stale (HEAD: ${diagnostics.reviewWitness.headSha?.slice(0, 12)}, witness: ${diagnostics.reviewWitness.witnessRevisionSha?.slice(0, 12)})`) : "none recorded"}`,
  ];
  if (diagnostics.pendingSuggestions) {
    if (diagnostics.pendingSuggestions.status === "error") {
      lines.push(`Pending Suggestions: unknown (read error: ${diagnostics.pendingSuggestions.error})`);
    } else if (diagnostics.pendingSuggestions.count > 0) {
      lines.push(`Pending Suggestions: ${diagnostics.pendingSuggestions.count} pending review (out-of-scope recommendations)`);
    } else {
      lines.push("Pending Suggestions: none");
    }
  }
  return lines.join("\n");
}

export interface TaskTargetedDoctorReport {
  readonly scope: "task";
  readonly targetType: "contract" | "run";
  readonly contractId: string;
  readonly runId?: string | undefined;
  readonly contractDigest: string;
  readonly status: string;
  readonly verdict: string;
  readonly blocked: boolean;
  readonly reasonCode: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly selectedStartedAt?: string | null | undefined;
  readonly blockingFindings: readonly string[];
  readonly harnessRoles?: {
    readonly controller: string;
    readonly executor: string;
    readonly reviewer: string;
  } | undefined;
  readonly stopState: string;
  readonly resumeBlocked: boolean;
  readonly gsdStatus?: string | undefined;
}

/**
 * Targeted doctor diagnosis for a specific contract ID or run ID (D-16).
 * Inspects role support, capability dependencies, GSD status, stop/lease fencing,
 * and resume blockers without mutating state or implicitly falling back to recent runs.
 */
export async function diagnoseTargetedTask(options: {
  stateRoot: string;
  targetId: string;
  runId?: string | undefined;
  projectRoot?: string | undefined;
  packageRoot?: string | undefined;
}): Promise<TaskTargetedDoctorReport> {
  const { stateRoot, targetId, projectRoot = process.cwd() } = options;

  let contractId: string | null = null;
  let targetRunId: string | null = options.runId ?? null;
  let targetType: "contract" | "run" = options.runId ? "run" : "contract";

  // 1. Check if targetId is a contract file
  if (targetId.endsWith(".json") && existsSync(targetId)) {
    try {
      const loaded = await loadTaskContract(targetId);
      contractId = loaded.contract.id;
    } catch {
      // not a contract file
    }
  }

  // 2. Check if targetId is a contract directory in stateRoot
  if (contractId === null && existsSync(join(stateRoot, "tasks", targetId))) {
    contractId = targetId;
  }

  // 3. Check if targetId is a runId across any task's runs directory or reserved runs
  if (contractId === null) {
    const tasksDir = join(stateRoot, "tasks");
    if (existsSync(tasksDir)) {
      try {
        const contracts = await readdir(tasksDir);
        for (const cid of contracts) {
          const runFile = join(tasksDir, cid, "runs", `${targetId}.json`);
          if (existsSync(runFile)) {
            contractId = cid;
            targetRunId = targetId;
            targetType = "run";
            break;
          }
          const reserved = await readReservedTaskRun({ stateRoot, contractId: cid, runId: targetId });
          if (reserved && reserved.status !== "refused") {
            contractId = cid;
            targetRunId = targetId;
            targetType = "run";
            break;
          }
        }
      } catch {}
    }
  }

  // 4. Check if targetId matches a valid contractId with approved receipts
  if (contractId === null && isTaskContractId(targetId)) {
    try {
      const approvals = await readTaskApprovals({ stateRoot, contractId: targetId });
      if (approvals.length > 0) {
        contractId = targetId;
      }
    } catch {}
  }

  if (contractId === null) {
    throw new Error(`no task or run found for identifier ${targetId}`);
  }

  // Use readTaskStatusModel to get the cohesive status and execution facts
  const statusModel = await readTaskStatusModel({
    stateRoot,
    contractId,
    runId: targetRunId ?? undefined,
    detail: true,
    projectRoot,
  });

  const blockingFindings: string[] = [];
  let isBlocked = false;

  if (statusModel.stopState.status === "pending") {
    isBlocked = true;
    blockingFindings.push("Stop request is pending: waiting for active controller process to confirm exit.");
  } else if (statusModel.stopState.status === "unknown") {
    isBlocked = true;
    blockingFindings.push("Process exited without confirmed stop record; reconciliation required before resume.");
  }

  if (statusModel.checkpoint.status === "blocked") {
    isBlocked = true;
    blockingFindings.push(statusModel.checkpoint.stopReason ?? "Task execution is blocked.");
  }

  if (statusModel.checkpoint.status === "stopped") {
    blockingFindings.push(`Task execution was stopped (${statusModel.checkpoint.stopReason ?? "operator halt"}).`);
  }

  if (statusModel.capabilities && statusModel.capabilities.blockedCount > 0) {
    isBlocked = true;
    for (const b of statusModel.capabilities.blocked) {
      blockingFindings.push(`Required capability ${b.capabilityId} is blocked: ${b.nextAction}`);
    }
  }

  if (statusModel.gsdDiagnostics && statusModel.gsdDiagnostics.phaseStatus === "blocked") {
    isBlocked = true;
    blockingFindings.push("GSD phase status is blocked.");
  }

  // Check harness role receipts
  const doctorReport = await buildTaskDoctorReport(join(stateRoot, "receipts"));
  const defaultHarness = doctorReport.find((h) => h.roles.controller === "PROVEN");
  const harnessRoles = defaultHarness
    ? {
        controller: defaultHarness.roles.controller,
        executor: defaultHarness.roles.executor,
        reviewer: defaultHarness.roles.reviewer,
      }
    : undefined;

  return {
    scope: "task",
    targetType,
    contractId,
    ...(targetRunId ? { runId: targetRunId } : statusModel.selectedRunId ? { runId: statusModel.selectedRunId } : {}),
    contractDigest: statusModel.contractDigest,
    status: statusModel.status,
    verdict: statusModel.verdict,
    blocked: isBlocked || statusModel.verdict === "blocked",
    reasonCode: isBlocked ? (statusModel.reasonCode !== "RUNNING" ? statusModel.reasonCode : "TASK_BLOCKED") : statusModel.reasonCode,
    reason: isBlocked && blockingFindings.length > 0 ? blockingFindings[0]! : statusModel.reason,
    nextAction: statusModel.nextAction,
    selectedStartedAt: statusModel.selectedStartedAt,
    blockingFindings,
    harnessRoles,
    stopState: statusModel.stopState.status,
    resumeBlocked: statusModel.stopState.status === "pending" || statusModel.stopState.status === "unknown",
    ...(statusModel.gsdDiagnostics ? { gsdStatus: statusModel.gsdDiagnostics.phaseStatus ?? "unknown" } : {}),
  };
}

export function formatTaskTargetedDoctorReport(report: TaskTargetedDoctorReport): string {
  const lines: string[] = [
    `Targeted Task Doctor: ${report.contractId}`,
    `Target type: ${report.targetType}${report.runId ? ` (${report.runId})` : ""}`,
    ...(report.selectedStartedAt ? [`Started at: ${report.selectedStartedAt}`] : []),
    `Contract digest: ${report.contractDigest}`,
    `Status: ${report.status}`,
    `Verdict: ${report.verdict.toUpperCase()}`,
    `Blocked: ${report.blocked ? "YES" : "NO"}`,
    `Reason code: ${report.reasonCode}`,
    `Reason: ${report.reason}`,
    `Next action: ${report.nextAction}`,
    "",
    "Blocking Findings:",
  ];

  if (report.blockingFindings.length === 0) {
    lines.push("  None: no blockers detected.");
  } else {
    for (const finding of report.blockingFindings) {
      lines.push(`  - ${finding}`);
    }
  }

  lines.push(
    "",
    "Stop & Recovery State:",
    `  Stop state: ${report.stopState}`,
    `  Resume blocked: ${report.resumeBlocked ? "YES" : "NO"}`,
  );

  if (report.harnessRoles) {
    lines.push(
      "",
      "Harness Role Proofs:",
      `  Controller: ${report.harnessRoles.controller}`,
      `  Executor:   ${report.harnessRoles.executor}`,
      `  Reviewer:   ${report.harnessRoles.reviewer}`,
    );
  }

  return lines.join("\n");
}

