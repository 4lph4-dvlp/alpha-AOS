import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  assertTaskStartable,
  checkCostMeterReadiness,
  detectQuotaExhaustion,
  evaluateResourceLimits,
  loadTaskContract,
  type LoadedTaskContract,
  type StandardStopCode,
  type TaskContract,
  type TaskUsageBreakdown,
} from "./task-contract.js";
import {
  createEffectLedger,
  generateEffectKey,
  reconcileEffectEvidence,
  reconcileLedgerOnRecovery,
  recordEffectState,
  type EffectLedgerEntry,
  type TaskEffectLedger,
} from "./task-effects.js";
import { runGitRead } from "./task-gsd.js";
import {
  appendJournalEvent,
  readCheckpoint,
  readJournalEvents,
  runDirectory,
  writeCheckpoint,
  type TaskCheckpoint,
  type TaskCheckpointState,
  type TaskCheckpointUsage,
  type TaskJournalEvent,
} from "./task-journal.js";
import {
  startTask,
  type StartTaskOptions,
  type TaskPorts,
  type TaskRunRecord,
} from "./task-run.js";
import {
  computeFailureFingerprint,
  formatBlockedReport,
  NoProgressDetector,
  selectRepairStrategy,
  type BlockedReport,
  type FailureHistoryEntry,
  type FailureReproduction,
} from "./task-strategy.js";
import { routeVerificationGap } from "./task-gap-router.js";
import {
  recordOrReconcileFindings,
  attachFindingGsdRouting,
  extractCandidateFindings,
} from "./task-review-findings.js";

export interface SuperviseTaskOptions {
  contractPath: string;
  expectedDigest?: string;
  stateRoot: string;
  packageRoot: string;
  ports: TaskPorts;
  signal?: AbortSignal;
  now?: () => Date;
  gsd?: { configRoot?: string; phaseId?: string };
}

export interface SupervisorResult {
  status: TaskCheckpointState;
  contractDigest: string;
  checkpoint: TaskCheckpoint;
  stopCode: StandardStopCode | null;
  usage: TaskUsageBreakdown;
  ledger: TaskEffectLedger;
  blockedReport: BlockedReport | null;
}

export interface TaskResumeReadiness {
  ready: boolean;
  contractDigest: string;
  checkpoint: TaskCheckpoint | null;
  gsdConsistent: boolean;
  unappliedEffectsCount: number;
  reason?: string;
}

export function runLedgerPath(stateRoot: string, contractDigest: string): string {
  return join(runDirectory(stateRoot, contractDigest), "ledger.json").replaceAll("\\", "/");
}

export async function readEffectLedger(stateRoot: string, contractDigest: string): Promise<TaskEffectLedger | null> {
  const path = runLedgerPath(stateRoot, contractDigest);
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content) as TaskEffectLedger;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveEffectLedger(
  stateRoot: string,
  contractDigest: string,
  ledger: TaskEffectLedger,
): Promise<void> {
  const dir = runDirectory(stateRoot, contractDigest);
  await mkdir(dir, { recursive: true });
  const path = runLedgerPath(stateRoot, contractDigest);
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, JSON.stringify(ledger, null, 2), "utf8");
  await rename(tmpPath, path);
}

async function logEvent(
  stateRoot: string,
  digest: string,
  event: Omit<TaskJournalEvent, "sequence" | "timestamp" | "contractDigest">,
): Promise<void> {
  await appendJournalEvent(stateRoot, digest, {
    ...event,
    contractDigest: digest,
  });
}

/**
 * Checks whether current Git HEAD matches checkpoint.lastVerifiedHead.
 */
export async function verifyGsdStateConsistency(
  projectRoot: string,
  checkpoint: TaskCheckpoint,
): Promise<{ consistent: boolean; reason?: string }> {
  try {
    const head = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
    if (checkpoint.lastVerifiedHead !== null && head !== checkpoint.lastVerifiedHead) {
      return {
        consistent: false,
        reason: `Git HEAD moved unexpectedly: expected ${checkpoint.lastVerifiedHead}, found ${head}.`,
      };
    }
    return { consistent: true };
  } catch (error) {
    return {
      consistent: false,
      reason: `Failed to verify Git state: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Inspects whether a task is ready to resume without mutating any state.
 */
export async function inspectTaskResumeReadiness(
  contractPath: string,
  expectedDigest: string | undefined,
  stateRoot: string,
): Promise<TaskResumeReadiness> {
  let loaded: LoadedTaskContract;
  try {
    loaded = await loadTaskContract(contractPath);
  } catch (err) {
    return {
      ready: false,
      contractDigest: expectedDigest ?? "",
      checkpoint: null,
      gsdConsistent: false,
      unappliedEffectsCount: 0,
      reason: `Failed to load task contract: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const { contract, digest } = loaded;
  if (expectedDigest !== undefined && digest !== expectedDigest) {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint: null,
      gsdConsistent: false,
      unappliedEffectsCount: 0,
      reason: `Contract digest mismatch: expected ${expectedDigest}, got ${digest}`,
    };
  }

  const checkpoint = await readCheckpoint(stateRoot, digest);
  if (checkpoint === null) {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint: null,
      gsdConsistent: false,
      unappliedEffectsCount: 0,
      reason: `No checkpoint found for contract digest ${digest}`,
    };
  }

  if (checkpoint.status === "accepted") {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint,
      gsdConsistent: true,
      unappliedEffectsCount: 0,
      reason: "Task has already completed successfully (status: accepted).",
    };
  }

  const projectRoot = resolve(contract.scope.projectRoot);
  const consistency = await verifyGsdStateConsistency(projectRoot, checkpoint);
  const ledger = (await readEffectLedger(stateRoot, digest)) ?? createEffectLedger(digest);
  const unappliedEffectsCount = Object.values(ledger.entries).filter((e) => e.status !== "applied").length;

  if (!consistency.consistent) {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint,
      gsdConsistent: false,
      unappliedEffectsCount,
      ...(consistency.reason ? { reason: consistency.reason } : {}),
    };
  }

  if (checkpoint.status === "blocked") {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint,
      gsdConsistent: true,
      unappliedEffectsCount,
      reason: `Task is blocked: ${checkpoint.stopReason ?? "blocked"}`,
    };
  }

  return {
    ready: true,
    contractDigest: digest,
    checkpoint,
    gsdConsistent: true,
    unappliedEffectsCount,
  };
}

/**
 * Supervise task execution loop across attempts with durable state, effect reconciliation,
 * resource limits, and adaptive repair.
 */
export async function superviseTask(options: SuperviseTaskOptions): Promise<SupervisorResult> {
  const expectedDigest = options.expectedDigest ?? (await loadTaskContract(options.contractPath)).digest;
  const { loaded } = await assertTaskStartable({
    contractPath: options.contractPath,
    expectedDigest,
    stateRoot: options.stateRoot,
  });
  const { contract, digest } = loaded;
  const projectRoot = resolve(contract.scope.projectRoot);

  // Fail-closed cost meter check (D-14, RUN-04)
  const meterReadiness = await checkCostMeterReadiness(contract.agentPolicy, options.ports);
  if (contract.resourcePolicy.maxCostUsd !== undefined && !meterReadiness.supported) {
    const reason = meterReadiness.reason ?? "Cost meter unavailable";
    throw new Error(`cost-meter-unavailable: ${reason}`);
  }

  // Load or initialize checkpoint
  let checkpoint = await readCheckpoint(options.stateRoot, digest);
  if (checkpoint === null) {
    const currentHead = (await runGitRead(projectRoot, ["rev-parse", "HEAD"]).catch(() => null))?.trim() ?? null;
    checkpoint = {
      schemaVersion: 1,
      contractDigest: digest,
      contractId: contract.id,
      revision: contract.revision,
      status: "running",
      attemptIndex: 0,
      lastSequence: 0,
      lastVerifiedHead: currentHead,
      usage: { cycles: 0, wallTimeMs: 0, tokens: null, costUsd: null },
      stopReason: null,
      updatedAt: (options.now ?? (() => new Date()))().toISOString(),
    };
    await writeCheckpoint(options.stateRoot, checkpoint);
    await logEvent(options.stateRoot, digest, {
      kind: "run_started",
      attemptIndex: 0,
      payload: { contractId: contract.id, revision: contract.revision, projectRoot },
    });
  }

  const ledger = (await readEffectLedger(options.stateRoot, digest)) ?? createEffectLedger(digest);
  return runSupervisorLoop(options, loaded, checkpoint, ledger);
}

/**
 * Resumes an interrupted task from its last checkpoint.
 */
export async function resumeTask(options: SuperviseTaskOptions): Promise<SupervisorResult> {
  const expectedDigest = options.expectedDigest ?? (await loadTaskContract(options.contractPath)).digest;
  const { loaded } = await assertTaskStartable({
    contractPath: options.contractPath,
    expectedDigest,
    stateRoot: options.stateRoot,
  });
  const { contract, digest } = loaded;
  const projectRoot = resolve(contract.scope.projectRoot);

  const checkpoint = await readCheckpoint(options.stateRoot, digest);
  if (checkpoint === null) {
    throw new Error(`Cannot resume task: no checkpoint found for contract ${digest}`);
  }
  if (checkpoint.status === "accepted") {
    throw new Error(`Cannot resume task: task r${contract.revision} is already accepted.`);
  }

  // Verify GSD / Git state consistency
  const consistency = await verifyGsdStateConsistency(projectRoot, checkpoint);
  if (!consistency.consistent) {
    throw new Error(`Cannot resume task: GSD state is inconsistent: ${consistency.reason}`);
  }

  // Reconcile performing / uncertain effects on recovery
  let ledger = (await readEffectLedger(options.stateRoot, digest)) ?? createEffectLedger(digest);
  const currentHead = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
  const baseCommit = checkpoint.lastVerifiedHead ?? currentHead;

  const reconciliation = await reconcileLedgerOnRecovery(projectRoot, baseCommit, ledger);
  ledger = reconciliation.ledger;
  await saveEffectLedger(options.stateRoot, digest, ledger);

  if (reconciliation.hasUnknown) {
    checkpoint.status = "blocked";
    checkpoint.stopReason = `ambiguous_effect_recovery: ${reconciliation.unknownEffects.map((e) => e.effectKey).join(", ")}`;
    checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
    await writeCheckpoint(options.stateRoot, checkpoint);
    await logEvent(options.stateRoot, digest, {
      kind: "blocked",
      attemptIndex: checkpoint.attemptIndex,
      payload: {
        reason: checkpoint.stopReason,
        unknownEffects: reconciliation.unknownEffects.map((e) => ({
          effectKey: e.effectKey,
          effectType: e.effectType,
        })),
      },
    });

    const usageBreakdown = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown;
    return {
      status: "blocked",
      contractDigest: digest,
      checkpoint,
      stopCode: null,
      usage: usageBreakdown,
      ledger,
      blockedReport: null,
    };
  }

  // Reset stopped / blocked status back to running for resume
  checkpoint.status = "running";
  checkpoint.stopReason = null;
  checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
  await writeCheckpoint(options.stateRoot, checkpoint);

  return runSupervisorLoop(options, loaded, checkpoint, ledger);
}

async function runSupervisorLoop(
  options: SuperviseTaskOptions,
  loaded: LoadedTaskContract,
  checkpoint: TaskCheckpoint,
  ledger: TaskEffectLedger,
): Promise<SupervisorResult> {
  const { contract, digest } = loaded;
  const projectRoot = resolve(contract.scope.projectRoot);

  // Reconstruct failure history from journal
  const failureHistory: FailureHistoryEntry[] = [];
  const events = await readJournalEvents(options.stateRoot, digest);
  for (const ev of events) {
    if (ev.kind === "rejected" && ev.payload.fingerprint) {
      failureHistory.push({
        attemptIndex: ev.attemptIndex,
        criterionId: String(ev.payload.criterionId ?? ""),
        cause: String(ev.payload.cause ?? "fail"),
        fingerprint: String(ev.payload.fingerprint),
        rawError: String(ev.payload.rawError ?? ""),
        ...(ev.payload.reproduction
          ? { reproduction: ev.payload.reproduction as FailureReproduction }
          : {}),
      });
    }
  }

  while (true) {
    // 1. Check signal
    if (options.signal?.aborted) {
      checkpoint.status = "stopped";
      checkpoint.stopReason = "cancelled";
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "process_cancelled",
        attemptIndex: checkpoint.attemptIndex,
        payload: { reason: "AbortSignal triggered" },
      });
      const usage = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown;
      return {
        status: "stopped",
        contractDigest: digest,
        checkpoint,
        stopCode: null,
        usage,
        ledger,
        blockedReport: null,
      };
    }

    // 2. Evaluate resource limits
    const limitCheck = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage);
    if (limitCheck.exceeded) {
      checkpoint.status = "stopped";
      checkpoint.stopReason = limitCheck.stopCode;
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "limit_exceeded",
        attemptIndex: checkpoint.attemptIndex,
        payload: { stopCode: limitCheck.stopCode, usage: limitCheck.usageBreakdown },
      });
      return {
        status: "stopped",
        contractDigest: digest,
        checkpoint,
        stopCode: limitCheck.stopCode,
        usage: limitCheck.usageBreakdown,
        ledger,
        blockedReport: null,
      };
    }

    // 3. Select repair strategy
    const strategy = selectRepairStrategy(failureHistory);
    if (strategy.stage === "stage-3-blocked") {
      checkpoint.status = "blocked";
      checkpoint.stopReason = "no_progress_exhausted";
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "blocked",
        attemptIndex: checkpoint.attemptIndex,
        payload: { report: strategy.blockedReport },
      });
      const usage = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown;
      return {
        status: "blocked",
        contractDigest: digest,
        checkpoint,
        stopCode: "no_progress_exhausted",
        usage,
        ledger,
        blockedReport: strategy.blockedReport,
      };
    }

    if (strategy.stage !== "stage-0-default") {
      await logEvent(options.stateRoot, digest, {
        kind: "strategy_changed",
        attemptIndex: checkpoint.attemptIndex + 1,
        payload: {
          stage: strategy.stage,
          promptInjection: strategy.promptInjection,
          activeCriterionId: strategy.activeCriterionId,
        },
      });
    }

    // 4. Start next attempt
    const attemptIndex = checkpoint.attemptIndex + 1;
    checkpoint.attemptIndex = attemptIndex;
    checkpoint.status = "running";
    checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
    await writeCheckpoint(options.stateRoot, checkpoint);
    await logEvent(options.stateRoot, digest, {
      kind: "attempt_started",
      attemptIndex,
      payload: { stage: strategy.stage },
    });

    const attemptStart = Date.now();
    let attemptResult: { run: TaskRunRecord; recordPath: string } | null = null;
    let attemptError: unknown = null;

    const startOptions: StartTaskOptions = {
      contractPath: options.contractPath,
      expectedDigest: digest,
      stateRoot: options.stateRoot,
      packageRoot: options.packageRoot,
      ports: options.ports,
      allowPriorRun: true,
      ...(options.now ? { now: options.now } : {}),
      ...(options.gsd ? { gsd: options.gsd } : {}),
      ...(strategy.promptInjection ? { promptInjection: strategy.promptInjection } : {}),
    };

    try {
      attemptResult = await startTask(startOptions);
    } catch (err) {
      attemptError = err;
    }

    const duration = Date.now() - attemptStart;
    checkpoint.usage.cycles += 1;
    checkpoint.usage.wallTimeMs += duration;
    checkpoint.lastVerifiedHead =
      (await runGitRead(projectRoot, ["rev-parse", "HEAD"]).catch(() => null))?.trim() ??
      checkpoint.lastVerifiedHead;

    const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError ?? "");

    // Check for quota exhaustion
    if (attemptError && detectQuotaExhaustion(errorMsg)) {
      checkpoint.status = "stopped";
      checkpoint.stopReason = "quota_exhausted";
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "limit_exceeded",
        attemptIndex,
        payload: { stopCode: "quota_exhausted", error: errorMsg },
      });
      const usage = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown;
      return {
        status: "stopped",
        contractDigest: digest,
        checkpoint,
        stopCode: "quota_exhausted",
        usage,
        ledger,
        blockedReport: null,
      };
    }

    // Check verdict
    if (attemptResult?.run.verdict?.overall === "accepted") {
      checkpoint.status = "accepted";
      checkpoint.stopReason = null;
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "accepted",
        attemptIndex,
        payload: { runId: attemptResult.run.runId },
      });
      const usage = evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown;
      return {
        status: "accepted",
        contractDigest: digest,
        checkpoint,
        stopCode: null,
        usage,
        ledger,
        blockedReport: null,
      };
    }

    // Attempt was rejected or threw non-quota error
    const failingRow = attemptResult?.run.verdict?.rows.find((r) => r.verdict === "fail");
    const criterionId = failingRow?.criterionId ?? contract.criterion[0]?.id ?? "unknown";
    const reviewerCriterion = attemptResult?.run.reviewer?.report?.criteria.find((c) => c.criterionId === criterionId);
    const repro = reviewerCriterion?.finding?.reproduction;
    const rawError = reviewerCriterion?.finding?.summary ?? failingRow?.reason ?? errorMsg ?? "Rejected";
    const cause = failingRow?.review?.severity ?? failingRow?.measured.cause ?? "fail";
    const fingerprint = computeFailureFingerprint(criterionId, cause, rawError);

    const historyEntry: FailureHistoryEntry = {
      attemptIndex,
      criterionId,
      cause,
      fingerprint,
      rawError,
      ...(repro
        ? {
            reproduction: {
              ...(repro.inputText !== undefined ? { inputText: repro.inputText } : {}),
              ...(repro.observedExitCode !== undefined ? { observedExitCode: repro.observedExitCode } : {}),
              ...(repro.observedStdout !== undefined ? { observedStdout: repro.observedStdout } : {}),
              summary: reviewerCriterion?.finding?.summary ?? rawError,
            },
          }
        : {}),
    };
    failureHistory.push(historyEntry);

    await logEvent(options.stateRoot, digest, {
      kind: "rejected",
      attemptIndex,
      payload: {
        criterionId,
        cause,
        fingerprint,
        rawError,
        reproduction: historyEntry.reproduction,
      },
    });

    // Reconcile findings and route verification gaps for confirmed defects (D-09, D-12)
    if (attemptResult?.run.reviewClassification && attemptResult.run.reviewer?.report) {
      try {
        const candidateFindings = extractCandidateFindings(
          attemptResult.run.reviewer.report,
          attemptResult.run.reviewClassification,
        );
        const reconcileRes = await recordOrReconcileFindings({
          stateRoot: options.stateRoot,
          contractId: contract.id,
          targetRevisionSha: checkpoint.lastVerifiedHead ?? "unknown",
          classifiedFindings: candidateFindings,
          ...(options.now ? { nowIso: options.now().toISOString() } : {}),
        });

        // Route gap for any new or reopened blocking finding that doesn't yet have GSD routing
        for (const finding of reconcileRes.findings) {
          if ((finding.status === "open" || finding.status === "reopened") && !finding.gsdRouting) {
            const decision = routeVerificationGap({
              contract,
              currentPhaseId: options.gsd?.phaseId ?? "current",
              defectSummary: finding.summary,
              isScopeExpansion: finding.scope === "out-of-scope",
              history: failureHistory,
            });
            await attachFindingGsdRouting({
              stateRoot: options.stateRoot,
              contractId: contract.id,
              findingId: finding.findingId,
              routingDecision: decision,
              ...(options.now ? { nowIso: options.now().toISOString() } : {}),
            });
          }
        }
      } catch {
        // Non-fatal if findings recording encounters transient issue; supervisor loop continues
      }
    }

    await logEvent(options.stateRoot, digest, {
      kind: "attempt_finished",
      attemptIndex,
      payload: { verdict: "rejected" },
    });

    checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
    await writeCheckpoint(options.stateRoot, checkpoint);
  }
}
