import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { readTaskApprovals, reservedRunIdForApproval, readReservedTaskRun, type DigestableTaskContract } from "./task-contract.js";
import { listTaskRuns, type TaskRunRecord } from "./task-run.js";
import { readCheckpoint, readJournalEvents, type TaskCheckpoint, type TaskCheckpointState } from "./task-journal.js";
import { type TaskEffectLedger } from "./task-effects.js";
import { readEffectLedger } from "./task-supervisor.js";
import { readTaskStopState, type TaskStopState } from "./task-control.js";
import {
  buildTaskCapabilityReport,
  type TaskCapabilityReport,
  type TaskCapabilitySummary,
} from "./task-capability-inventory.js";
import { diagnoseGsdLifecycleStatus, type GsdLifecycleDiagnostics } from "./task-doctor.js";
import { loadTaskReviewSuggestions, suggestionsFilePath } from "./task-review-suggestions.js";

export type TaskReadVerdict =
  | "accepted"
  | "blocked"
  | "stopped"
  | "failed"
  | "running"
  | "reserved"
  | "unknown";

export interface TaskSelectedExecution {
  readonly contractId: string;
  readonly runId: string;
  readonly contractDigest: string;
  readonly revision: number;
  readonly startedAt: string | null;
  readonly isReserved: boolean;
  readonly selectionRule: "latest-by-started-at-and-run-id" | "exact-run-id" | "reserved-approval";
  readonly runRecord: TaskRunRecord | null;
}

export interface TaskReadModel {
  readonly contractId: string;
  readonly selectedRunId: string;
  readonly selectedStartedAt: string | null;
  readonly selectionRule: "latest-by-started-at-and-run-id" | "exact-run-id" | "reserved-approval";
  readonly contractDigest: string;
  readonly revision: number;
  readonly verdict: TaskReadVerdict;
  readonly status: string;
  readonly reasonCode: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly run: TaskRunRecord | null;
  readonly checkpoint: TaskCheckpoint;
  readonly ledger: TaskEffectLedger | null;
  readonly eventsCount: number;
  readonly stopState: TaskStopState;
  readonly gsdDiagnostics?: GsdLifecycleDiagnostics | null | undefined;
  readonly capabilities?: TaskCapabilitySummary | undefined;
  readonly capabilityReport?: TaskCapabilityReport | undefined;
  readonly pendingSuggestionsCount?: number | undefined;
  readonly suggestionsPath?: string | undefined;
}

/**
 * Deterministically selects the target execution for a task (D-11).
 * When runId is omitted: sorts all runs for contractId descending by startedAt
 * with runId descending tie-breaker.
 * When runId is specified: finds matching run record, or validates reserved runId
 * from approved receipts without fabricating fake execution records.
 */
export async function selectTaskExecution(options: {
  stateRoot: string;
  contractId: string;
  runId?: string | undefined;
  packageRoot?: string | undefined;
}): Promise<TaskSelectedExecution> {
  const { stateRoot, contractId, runId, packageRoot } = options;
  const runs = await listTaskRuns({
    stateRoot,
    contractId,
    ...(packageRoot ? { packageRoot } : {}),
  });

  // Sort descending: newest first by startedAt, then runId descending tie-breaker
  const sortedDesc = [...runs].sort((a, b) => {
    if (a.startedAt !== b.startedAt) {
      return a.startedAt < b.startedAt ? 1 : -1;
    }
    return a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0;
  });

  if (runId !== undefined && runId !== "") {
    const matched = runs.find((r) => r.runId === runId);
    if (matched) {
      return {
        contractId,
        runId: matched.runId,
        contractDigest: matched.contractDigest,
        revision: matched.revision,
        startedAt: matched.startedAt,
        isReserved: false,
        selectionRule: "exact-run-id",
        runRecord: matched,
      };
    }

    // Check reserved runId from approvals
    const reserved = await readReservedTaskRun({ stateRoot, contractId, runId });
    if (reserved.status === "reserved") {
      return {
        contractId,
        runId,
        contractDigest: reserved.contractDigest ?? "",
        revision: reserved.revision ?? 1,
        startedAt: null,
        isReserved: true,
        selectionRule: "reserved-approval",
        runRecord: null,
      };
    }

    // Check if checkpoint matches runId
    const cpDir = join(stateRoot, "runs");
    if (existsSync(cpDir)) {
      try {
        const cp = await readCheckpoint(stateRoot, runId);
        if (cp && (cp.contractId === contractId || cp.contractDigest === runId)) {
          return {
            contractId,
            runId: cp.contractDigest,
            contractDigest: cp.contractDigest,
            revision: cp.revision,
            startedAt: cp.updatedAt,
            isReserved: false,
            selectionRule: "exact-run-id",
            runRecord: null,
          };
        }
      } catch {}
    }

    throw new Error(
      `no run recorded for task ${contractId} with run id ${runId}${
        reserved.status === "refused" ? ` (${reserved.reason})` : ""
      }`,
    );
  }

  // No runId specified: choose latest by deterministic sort
  if (sortedDesc[0]) {
    const latest = sortedDesc[0];
    return {
      contractId,
      runId: latest.runId,
      contractDigest: latest.contractDigest,
      revision: latest.revision,
      startedAt: latest.startedAt,
      isReserved: false,
      selectionRule: "latest-by-started-at-and-run-id",
      runRecord: latest,
    };
  }

  // Check if checkpoints exist under stateRoot/runs
  const cpDir = join(stateRoot, "runs");
  if (existsSync(cpDir)) {
    try {
      const entries = await readdir(cpDir);
      const candidates: TaskCheckpoint[] = [];
      for (const entry of entries) {
        const cp = await readCheckpoint(stateRoot, entry);
        if (cp && (cp.contractId === contractId || entry === contractId || cp.contractDigest === contractId)) {
          candidates.push(cp);
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const latestCp = candidates[0]!;
        return {
          contractId,
          runId: latestCp.contractDigest,
          contractDigest: latestCp.contractDigest,
          revision: latestCp.revision,
          startedAt: latestCp.updatedAt,
          isReserved: false,
          selectionRule: "latest-by-started-at-and-run-id",
          runRecord: null,
        };
      }
    } catch {}
  }

  // Check if an approval exists
  const approvals = await readTaskApprovals({ stateRoot, contractId });
  if (approvals.length > 0) {
    const latestApproval = approvals.at(-1)!;
    const reservedRunId = reservedRunIdForApproval(latestApproval);
    return {
      contractId,
      runId: reservedRunId,
      contractDigest: latestApproval.contractDigest,
      revision: latestApproval.revision,
      startedAt: null,
      isReserved: true,
      selectionRule: "reserved-approval",
      runRecord: null,
    };
  }

  throw new Error(`no run recorded for task ${contractId}`);
}

/**
 * Builds the unified read model for a task's status (D-11, D-14, UX-03).
 * Prioritizes verdict, specific reason code and next action, keeping unmeasured
 * values as unmetered/null rather than fabricated numbers.
 */
export async function readTaskStatusModel(options: {
  stateRoot: string;
  contractId: string;
  runId?: string | undefined;
  detail?: boolean | undefined;
  projectRoot?: string | undefined;
  packageRoot?: string | undefined;
}): Promise<TaskReadModel> {
  const { stateRoot, contractId, runId, detail, projectRoot, packageRoot } = options;
  const selected = await selectTaskExecution({ stateRoot, contractId, runId, packageRoot });

  const stopState = await readTaskStopState({
    stateRoot,
    contractId,
    contractDigest: selected.contractDigest,
    runId: selected.runId,
    projectRoot,
  });

  // Load checkpoint for the selected digest
  let checkpoint = await readCheckpoint(stateRoot, selected.contractDigest);
  if (checkpoint === null) {
    const mappedCheckpointStatus: TaskCheckpointState = selected.isReserved
      ? "pending"
      : selected.runRecord?.status === "executing"
        ? "running"
        : selected.runRecord?.status === "accepted"
          ? "accepted"
          : selected.runRecord?.status === "rejected"
            ? "rejected"
            : selected.runRecord?.status === "blocked"
              ? "blocked"
              : selected.runRecord?.status === "stopped"
                ? "stopped"
                : "pending";

    checkpoint = {
      schemaVersion: 1,
      contractDigest: selected.contractDigest,
      contractId,
      revision: selected.revision,
      status: mappedCheckpointStatus,
      attemptIndex: 1,
      lastSequence: 0,
      lastVerifiedHead: selected.runRecord?.baseCommit ?? null,
      usage: {
        cycles: selected.runRecord ? 1 : 0,
        wallTimeMs: 0,
        tokens: null,
        costUsd: null,
      },
      stopReason: selected.runRecord?.stopReason ?? null,
      updatedAt: selected.startedAt ?? new Date().toISOString(),
    };
  }

  const ledger = await readEffectLedger(stateRoot, selected.contractDigest);
  const events = await readJournalEvents(stateRoot, selected.contractDigest);

  let gsdDiagnostics: GsdLifecycleDiagnostics | null = null;
  try {
    const cwd = projectRoot ?? process.cwd();
    gsdDiagnostics = await diagnoseGsdLifecycleStatus({
      projectRoot: cwd,
      receiptsRoot: join(stateRoot, "receipts"),
    });
  } catch {}

  let contractSnapshot: DigestableTaskContract | undefined;
  try {
    const approvals = await readTaskApprovals({ stateRoot, contractId });
    const matched = approvals.find((a) => a.contractDigest === selected.contractDigest);
    if (matched) {
      contractSnapshot = matched.contract;
    }
  } catch {}

  const capabilityReport = await buildTaskCapabilityReport({
    contract: contractSnapshot,
    contractId,
    contractRevision: selected.revision,
    contractDigest: selected.contractDigest,
    projectRoot: contractSnapshot?.scope.projectRoot ? resolve(contractSnapshot.scope.projectRoot) : (projectRoot ?? process.cwd()),
    stateRoot,
    stopReason: checkpoint.stopReason,
    checkpointStatus: checkpoint.status,
  });

  let pendingSuggestionsCount = 0;
  let suggestionsPath: string | undefined = undefined;
  try {
    const suggestionsDoc = await loadTaskReviewSuggestions(stateRoot, contractId);
    if (suggestionsDoc) {
      pendingSuggestionsCount = suggestionsDoc.suggestions.filter((s) => s.status === "pending").length;
      suggestionsPath = suggestionsFilePath(stateRoot, contractId);
    }
  } catch {}

  // Determine verdict, reasonCode, reason, and nextAction (D-14, UX-03)
  let verdict: TaskReadVerdict = "unknown";
  let status: string = checkpoint.status;
  let reasonCode = "UNKNOWN";
  let reason = "No evaluation recorded";
  let nextAction = "Inspect task state";

  if (selected.isReserved) {
    verdict = "reserved";
    status = "reserved";
    reasonCode = "APPROVAL_RECORDED";
    reason = "Contract revision approved for a single run — execution has not started yet.";
    nextAction = `Start approved execution: alpha-aos task start <contract.json> --contract-digest ${selected.contractDigest} --apply`;
  } else if (stopState.status === "pending") {
    verdict = "stopped";
    status = "stop-requested";
    reasonCode = "STOP_REQUEST_PENDING";
    reason = stopState.reason ?? "Stop requested by operator; waiting for process exit.";
    nextAction = stopState.nextAction;
  } else if (stopState.status === "confirmed") {
    verdict = "stopped";
    status = "stopped";
    reasonCode = "OPERATOR_STOP_CONFIRMED";
    reason = stopState.reason ?? "Execution stopped by operator.";
    nextAction = "Inspect resume readiness with 'alpha-aos task resume'.";
  } else if (stopState.status === "unknown") {
    verdict = "unknown";
    status = "unknown";
    reasonCode = "TERMINATION_UNCONFIRMED";
    reason = "Process exited or crashed before confirming stop.";
    nextAction = "Reconcile effects and inspect state before resuming.";
  } else if (selected.runRecord) {
    const run = selected.runRecord;
    if (run.status === "accepted") {
      verdict = "accepted";
      status = "accepted";
      reasonCode = "CRITERIA_VERIFIED";
      reason = "All mandatory criteria verified and independent review accepted.";
      nextAction = "Task complete.";
    } else if (run.status === "rejected") {
      verdict = "failed";
      status = "failed";
      reasonCode = "CRITERIA_FAILED";
      reason = run.stopReason ?? run.verdict?.refusal ?? "One or more criteria failed evaluation.";
      nextAction = run.nextAction ?? "Review report and fix defects.";
    } else if (run.status === "stopped") {
      verdict = "stopped";
      status = "stopped";
      reasonCode = "RUN_STOPPED";
      reason = run.stopReason ?? "Execution stopped.";
      nextAction = run.nextAction ?? "Inspect resume readiness.";
    } else if (run.status === "blocked") {
      verdict = "blocked";
      status = "blocked";
      reasonCode = "PREREQUISITE_BLOCKED";
      reason = run.stopReason ?? "Task prerequisites blocked execution.";
      nextAction = run.nextAction ?? "Resolve blocking prerequisites.";
    } else if (run.status === "executing") {
      verdict = "running";
      status = "running";
      reasonCode = "EXECUTING";
      reason = "Task is currently executing.";
      nextAction = "Monitor execution status.";
    }
  } else {
    // Checkpoint based status
    if (checkpoint.status === "running") {
      verdict = "running";
      status = "running";
      reasonCode = "RUNNING";
      reason = "Task is running.";
      nextAction = "Monitor execution status.";
    } else if (checkpoint.status === "stopped") {
      verdict = "stopped";
      status = "stopped";
      reasonCode = "STOPPED";
      reason = checkpoint.stopReason ?? "Execution stopped.";
      nextAction = "Inspect resume readiness.";
    } else if (checkpoint.status === "blocked") {
      verdict = "blocked";
      status = "blocked";
      reasonCode = "BLOCKED";
      reason = checkpoint.stopReason ?? "Task blocked.";
      nextAction = "Resolve blocking dependencies.";
    }
  }

  return {
    contractId,
    selectedRunId: selected.runId,
    selectedStartedAt: selected.startedAt,
    selectionRule: selected.selectionRule,
    contractDigest: selected.contractDigest,
    revision: selected.revision,
    verdict,
    status,
    reasonCode,
    reason,
    nextAction,
    run: selected.runRecord,
    checkpoint,
    ledger,
    eventsCount: events.length,
    stopState,
    ...(gsdDiagnostics ? { gsdDiagnostics } : {}),
    capabilities: capabilityReport.summary,
    capabilityReport,
    pendingSuggestionsCount,
    ...(pendingSuggestionsCount > 0 && suggestionsPath ? { suggestionsPath } : {}),
  };
}

/**
 * Normalizes a TaskRunRecord for reporting (D-15, T-21-12, UX-03).
 * Ensures that if review evidence is bound to a stale artifact digest,
 * or if mandatory review evidence is missing, the affected criteria are
 * judged as unknown and cannot falsely sustain an accepted run status.
 */
export function normalizeTaskRunForReport(run: TaskRunRecord): TaskRunRecord {
  if (!run.verdict) return run;

  const currentArtifactDigest = run.artifact?.digest;
  let modified = false;

  const rows = run.verdict.rows.map((row) => {
    if (row.verdict === "pass") {
      // 1. Check artifact digest match
      if (currentArtifactDigest && row.artifactDigest !== currentArtifactDigest) {
        modified = true;
        return {
          ...row,
          verdict: "unknown" as const,
          reason: `Artifact digest mismatch: review evaluated ${row.artifactDigest.slice(0, 12)}, but current artifact digest is ${currentArtifactDigest.slice(0, 12)}.`,
          nextAction: "re-run review against the current artifact",
        };
      }
      // 2. Check review presence
      if (row.review === null) {
        modified = true;
        return {
          ...row,
          verdict: "unknown" as const,
          reason: "Mandatory review evidence is missing.",
          nextAction: "execute independent review for this criterion",
        };
      }
      // 3. Check review locator digest if present
      if (row.review.locator?.digest && currentArtifactDigest && row.review.locator.digest !== currentArtifactDigest) {
        modified = true;
        return {
          ...row,
          verdict: "unknown" as const,
          reason: `Review locator digest mismatch: locator has ${row.review.locator.digest.slice(0, 12)}, but current artifact digest is ${currentArtifactDigest.slice(0, 12)}.`,
          nextAction: "re-run review against the current artifact",
        };
      }
    }
    return row;
  });

  if (!modified) return run;

  const hasUnresolved = rows.some((r) => r.verdict !== "pass");
  const newStatus = hasUnresolved && run.status === "accepted" ? "unknown" : run.status;

  return {
    ...run,
    status: newStatus,
    verdict: {
      ...run.verdict,
      overall: hasUnresolved && run.verdict.overall === "accepted" ? "unknown" : run.verdict.overall,
      rows,
    },
  };
}
