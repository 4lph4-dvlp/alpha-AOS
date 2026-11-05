import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { isProcessAlive } from "./writer-lock.js";
import { dispatchUsage, chainDispatchUsage, readTaskDispatches, readTaskChainDispatches, reconcileTaskRuntime, TaskResourceError } from "./task-runtime.js";
import { mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
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
import { readTaskStopState, recordTaskStopConfirmation } from "./task-control.js";
import {
  startTask,
  assertTaskCapabilityPorts,
  listTaskRuns,
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
  initialRunId?: string;
  contractPath: string;
  expectedDigest?: string;
  stateRoot: string;
  packageRoot: string;
  ports: TaskPorts;
  signal?: AbortSignal;
  now?: () => Date;
  gsd?: StartTaskOptions["gsd"] & { phaseId?: string };
  onRunReady?: StartTaskOptions["onRunReady"];
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

/** Preserve the start CLI's run record while using durable recovery attempts. */
export async function startTaskWithRecovery(options: StartTaskOptions): Promise<{ run: TaskRunRecord; supervision?: SupervisorResult; recovery?: { rootDigest: string; repairs: import("./task-autorepair.js").TaskRepairEvidence[] } }> {
  const initial = await loadTaskContract(options.contractPath);
  if (initial.contract.recoveryPolicy) return runGrantedRecoveryChain(options);
  return startLegacyTaskWithRecovery(options);
}

async function startLegacyTaskWithRecovery(options: StartTaskOptions): Promise<{ run: TaskRunRecord; supervision?: SupervisorResult }> {
  const loaded = await loadTaskContract(options.contractPath);
  if (!["gsd", "gsd-multi-phase"].includes(loaded.contract.scope.workflow ?? "")) return startTask(options);
  assertTaskCapabilityPorts(loaded.contract, options.ports);
  const prior = await listTaskRuns({ stateRoot: options.stateRoot, contractId: loaded.contract.id, packageRoot: options.packageRoot });
  if (prior.some((run) => run.contractDigest === loaded.digest && run.status === "accepted")) throw new Error("Task already accepted; recovery cannot create a second execution");
  let observedRunId: string | null = null;
  const result = await superviseTask({
    contractPath: options.contractPath, expectedDigest: options.expectedDigest,
    stateRoot: options.stateRoot, packageRoot: options.packageRoot, ports: options.ports,
    ...(options.runId && !prior.some((run) => run.runId === options.runId) ? { initialRunId: options.runId } : {}),
    ...(options.gsd ? { gsd: options.gsd } : {}),
    ...(options.now ? { now: options.now } : {}),
    onRunReady: async (run, path) => { observedRunId = run.runId; await options.onRunReady?.(run, path); },
  });
  const runs = await listTaskRuns({ stateRoot: options.stateRoot, contractId: loaded.contract.id, packageRoot: options.packageRoot });
  const run = runs.find((entry) => entry.runId === observedRunId);
  if (!run) throw new Error(result.checkpoint.stopReason ?? "Recovery stopped before any task dispatch");
  return { run, supervision: result };
}

async function runGrantedRecoveryChain(options: StartTaskOptions) {
  const { readTaskApprovals, contractFromView, parseTaskContract } = await import("./task-contract.js");
  const { readBoundedFile, writeAtomicPrivateFile, assertNoSymlinksInPathAndAncestors } = await import("./command-jobs.js");
  const { repairTaskFailure } = await import("./task-autorepair.js");
  const { recordRecoveryRevision } = await import("./task-recovery-grant.js");
  const { capabilityDiagnostic, inspectTaskCapabilities, TaskCapabilityPreflightError } = await import("./task-capability-health.js");
  const initial = (await assertTaskStartable(options)).loaded;
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: initial.contract.id });
  const approved = approvals.find((item) => item.contractDigest === initial.digest)!;
  const rootDigest = approved.recovery?.rootDigest ?? initial.digest;
  const rootApproval = approvals.find((item) => item.contractDigest === rootDigest && item.consent.grant === "explicit-cli-approval");
  if (!rootApproval) throw new Error("Recovery chain has no explicit root approval");
  const rootContract = await parseTaskContract(JSON.stringify(contractFromView(rootApproval.contract)), options.contractPath);
  const grant = rootContract.recoveryPolicy!;
  const root = join(options.stateRoot, "runs", rootDigest);
  const statePath = join(root, "recovery.json");
  await assertNoSymlinksInPathAndAncestors(root);
  await mkdir(root, { recursive: true });
  await assertNoSymlinksInPathAndAncestors(root);
  const lockPath = join(root, "recovery.lock");
  const lockText = JSON.stringify({ rootDigest, host: hostname(), pid: process.pid, claim: randomUUID() });
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const reclaimPath = join(root, "recovery-reclaim.lock");
    const reclaim = await open(reclaimPath, "wx", 0o600).catch(() => { throw new Error("Recovery claim reconciliation is already active"); });
    try {
      const priorLock = JSON.parse(await readBoundedFile(lockPath, options.stateRoot, 4096, undefined, true)) as { rootDigest?: string; host?: string; pid?: number };
      const active = await readTaskChainDispatches(options.stateRoot, initial.contract);
      if (priorLock.rootDigest !== rootDigest || priorLock.host !== hostname() || !Number.isInteger(priorLock.pid) || priorLock.pid! <= 0 || isProcessAlive(priorLock.pid!) ||
        active.some((entry) => entry.childPid !== null && isProcessAlive(entry.childPid))) throw new Error("Recovery chain still has an active or unprovable controller; duplicate execution refused");
      await assertNoSymlinksInPathAndAncestors(lockPath);
      await unlink(lockPath);
      lock = await open(lockPath, "wx", 0o600);
    } finally { await reclaim.close(); await unlink(reclaimPath); }
  }
  await lock.writeFile(lockText);
  await lock.sync();
  try {
    type State = { schemaVersion: 1; rootDigest: string; currentDigest: string; startedAt: string; attempts: string[]; repairs: import("./task-autorepair.js").TaskRepairEvidence[]; accepted: boolean };
    let state: State;
    try { state = JSON.parse(await readBoundedFile(statePath, options.stateRoot, 128 * 1024, undefined, true)) as State; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; state = { schemaVersion: 1, rootDigest, currentDigest: initial.digest, startedAt: new Date().toISOString(), attempts: [], repairs: [], accepted: false }; }
    if (state.schemaVersion !== 1 || state.rootDigest !== rootDigest || !Array.isArray(state.attempts) || !Array.isArray(state.repairs) || state.repairs.length > grant.maxRepairs || !Number.isFinite(Date.parse(state.startedAt))) throw new Error("Recovery chain state is inconsistent with the approved contract");
    if (state.currentDigest !== initial.digest) {
      if (approved.recovery?.parentDigest !== state.currentDigest || approved.recovery.rootDigest !== rootDigest || approved.recovery.repairIndex !== state.repairs.length) throw new Error("Recovery revision cannot be reconciled with durable ancestry");
      const parentCheckpoint = await readCheckpoint(options.stateRoot, state.currentDigest);
      if (state.attempts.length > 0 && (!parentCheckpoint || !(await verifyGsdStateConsistency(initial.contract.scope.projectRoot, parentCheckpoint)).consistent)) throw new Error("Recovery checkpoint ancestry cannot be verified");
      if (parentCheckpoint) await writeCheckpoint(options.stateRoot, { ...parentCheckpoint, contractDigest: initial.digest, revision: initial.contract.revision, status: "running", stopReason: null });
      state.currentDigest = initial.digest;
    }
    if (state.accepted) throw new Error("Recovery chain already accepted; duplicate execution refused");
    const persist = () => writeAtomicPrivateFile(statePath, JSON.stringify(state), 128 * 1024, options.stateRoot);
    const rootBudget = async () => {
      const native = chainDispatchUsage(await readTaskChainDispatches(options.stateRoot, initial.contract));
      return evaluateResourceLimits(rootContract.resourcePolicy, { cycles: state.attempts.length + state.repairs.length,
        wallTimeMs: Date.now() - Date.parse(state.startedAt), tokens: native.tokens, costUsd: native.costUsd });
    };
    await persist();
    let loaded = initial;
    let lastRun: TaskRunRecord | null = null;
    let supervision: SupervisorResult;
    execution: for (;;) {
      const prior = await listTaskRuns({ stateRoot: options.stateRoot, contractId: loaded.contract.id, packageRoot: options.packageRoot });
      if (prior.some((item) => [rootDigest, state.currentDigest].includes(item.contractDigest) && item.status === "accepted")) throw new Error("Task already accepted; recovery cannot execute it again");
      let capabilities = await inspectTaskCapabilities(loaded.contract, options.ports.capability, options.runId ?? `preflight-${rootDigest.slice(0, 16)}`);
      while (capabilities.some((item) => !item.ready)) {
        const reason = capabilities.filter((item) => !item.ready).map((item) => item.detail).join("; ");
        const limits = await rootBudget();
        if (limits.exceeded) throw new TaskCapabilityPreflightError("stopped", limits.stopCode ?? "Approved resource limit exceeded", loaded.digest);
        const stop = await readTaskStopState({ stateRoot: options.stateRoot, contractId: rootContract.id, contractDigest: rootDigest });
        if (stop.status === "pending") throw new TaskCapabilityPreflightError("stopped", stop.reason ?? "operator_halt", loaded.digest);
        if (state.repairs.length >= grant.maxRepairs) throw new TaskCapabilityPreflightError("blocked", `repair_budget_exhausted: ${reason}`, loaded.digest);
        const { readTaskBaseline } = await import("./task-effects.js");
        const baseline = await readTaskBaseline({ projectRoot: loaded.contract.scope.projectRoot });
        const checkpoint = await readCheckpoint(options.stateRoot, loaded.digest);
        const baseCommit = checkpoint?.baseCommit ?? (baseline.status === "clean" ? baseline.baseCommit : null);
        if (!baseCommit) throw new TaskCapabilityPreflightError("needs-input", "Capability repair requires a clean or verified existing project baseline", loaded.digest);
        const previousDigest = loaded.digest;
        let repaired: import("./task-autorepair.js").TaskRepairEvidence;
        try {
          repaired = await repairTaskFailure({ contract: loaded.contract, rootContract, stateRoot: options.stateRoot, ports: options.ports,
            failure: `capability-evidence: ${reason}`, runId: options.runId ?? `preflight-${rootDigest.slice(0, 16)}`, repairIndex: state.repairs.length + 1, baseCommit });
        } catch (error) {
          if (!(error instanceof TaskResourceError) && !detectQuotaExhaustion(String(error))) throw error;
          throw new TaskCapabilityPreflightError("stopped", error instanceof TaskResourceError ? error.stopCode : "quota_exhausted", loaded.digest);
        }
        state.repairs.push(repaired);
        await persist();
        if (repaired.status === "needs-input" || repaired.status === "stopped") throw new TaskCapabilityPreflightError(repaired.status, repaired.reason, loaded.digest);
        if (repaired.status === "repaired" && repaired.candidate) {
          await recordRecoveryRevision({ stateRoot: options.stateRoot, contractPath: options.contractPath, rootDigest, parentDigest: previousDigest, candidate: repaired.candidate, repairIndex: state.repairs.length });
          loaded = await loadTaskContract(options.contractPath);
          state.currentDigest = loaded.digest;
          if (checkpoint) await writeCheckpoint(options.stateRoot, { ...checkpoint, contractDigest: loaded.digest, revision: loaded.contract.revision });
          await persist();
        }
        capabilities = await inspectTaskCapabilities(loaded.contract, options.ports.capability, options.runId ?? `preflight-${rootDigest.slice(0, 16)}`);
      }
      let observedRunId: string | null = null;
      const existingCheckpoint = await readCheckpoint(options.stateRoot, loaded.digest);
      const continueTask = existingCheckpoint && state.attempts.length > 0 ? resumeTask : superviseTask;
      supervision = await continueTask({ contractPath: options.contractPath, expectedDigest: loaded.digest,
        stateRoot: options.stateRoot, packageRoot: options.packageRoot, ports: options.ports,
        ...(state.attempts.length === 0 && options.runId ? { initialRunId: options.runId } : {}),
        ...(options.gsd ? { gsd: options.gsd } : {}), ...(options.now ? { now: options.now } : {}),
        onRunReady: async (run, path) => { observedRunId = run.runId; if (!state.attempts.includes(run.runId)) state.attempts.push(run.runId); await persist(); await options.onRunReady?.(run, path); },
      });
      const runs = await listTaskRuns({ stateRoot: options.stateRoot, contractId: loaded.contract.id, packageRoot: options.packageRoot });
      lastRun = runs.find((item) => item.runId === observedRunId) ?? lastRun;
      if (supervision.status === "accepted") { state.accepted = true; await persist(); break; }
      if (supervision.status === "stopped" || supervision.status === "needs-input" || state.repairs.length >= grant.maxRepairs) break;
      if (!lastRun?.baseCommit) break;
      const chainUsage = chainDispatchUsage(await readTaskChainDispatches(options.stateRoot, loaded.contract));
      const budget = evaluateResourceLimits(rootContract.resourcePolicy, { cycles: state.attempts.length + state.repairs.length,
        wallTimeMs: Date.now() - Date.parse(state.startedAt), tokens: chainUsage.tokens, costUsd: chainUsage.costUsd });
      if (budget.exceeded) { supervision.status = "stopped"; supervision.stopCode = budget.stopCode; supervision.checkpoint.status = "stopped"; supervision.checkpoint.stopReason = budget.stopCode; await writeCheckpoint(options.stateRoot, supervision.checkpoint); break; }
      const stop = await readTaskStopState({ stateRoot: options.stateRoot, contractId: rootContract.id, contractDigest: rootDigest });
      if (stop.status === "pending") { supervision.status = "stopped"; supervision.checkpoint.status = "stopped"; supervision.checkpoint.stopReason = stop.reason ?? "operator_halt"; await writeCheckpoint(options.stateRoot, supervision.checkpoint); break; }
      let repair: import("./task-autorepair.js").TaskRepairEvidence;
      let repairFailure = supervision.checkpoint.stopReason ?? lastRun.stopReason ?? "Rejected";
      for (;;) {
        const limits = await rootBudget();
        const stop = await readTaskStopState({ stateRoot: options.stateRoot, contractId: rootContract.id, contractDigest: rootDigest });
        if (limits.exceeded || stop.status === "pending") {
          supervision.status = "stopped"; supervision.checkpoint.status = "stopped";
          supervision.checkpoint.stopReason = limits.stopCode ?? stop.reason ?? "operator_halt";
          await writeCheckpoint(options.stateRoot, supervision.checkpoint);
          break execution;
        }
        try {
          repair = await repairTaskFailure({ contract: loaded.contract, rootContract, stateRoot: options.stateRoot, ports: options.ports,
            failure: repairFailure, runId: lastRun.runId, repairIndex: state.repairs.length + 1, baseCommit: lastRun.baseCommit });
        } catch (error) {
          if (!(error instanceof TaskResourceError) && !detectQuotaExhaustion(String(error))) throw error;
          supervision.status = "stopped"; supervision.checkpoint.status = "stopped";
          supervision.checkpoint.stopReason = error instanceof TaskResourceError ? error.stopCode : "quota_exhausted";
          await writeCheckpoint(options.stateRoot, supervision.checkpoint);
          break execution;
        }
        state.repairs.push({ ...repair, reason: capabilityDiagnostic(repair.reason) });
        await persist();
        if (repair.status !== "retry-repair") break;
        if (state.repairs.length >= grant.maxRepairs) {
          supervision.status = "blocked";
          supervision.checkpoint.status = "blocked";
          supervision.checkpoint.stopReason = `repair_budget_exhausted: ${grant.maxRepairs} authorized correction attempts; ${repair.reason}`;
          await writeCheckpoint(options.stateRoot, supervision.checkpoint);
          break execution;
        }
        repairFailure = `${supervision.checkpoint.stopReason ?? lastRun.stopReason}\nThe previous correction failed independent verification: ${repair.reason}. Perform a different concrete correction; do not rerun the unchanged task.`;
      }
      if (repair.status !== "repaired" || repair.before === repair.after) {
        supervision.status = repair.status === "stopped" ? "stopped" : "needs-input";
        supervision.checkpoint.status = supervision.status;
        supervision.checkpoint.stopReason = repair.reason;
        await writeCheckpoint(options.stateRoot, supervision.checkpoint);
        break;
      }
      if (repair.candidate) {
        await recordRecoveryRevision({ stateRoot: options.stateRoot, contractPath: options.contractPath, rootDigest, parentDigest: loaded.digest,
          candidate: repair.candidate, repairIndex: state.repairs.length });
        loaded = await loadTaskContract(options.contractPath);
        state.currentDigest = loaded.digest;
      }
      // Preserve verified progress and cumulative cycles across the authorized revision.
      const checkpoint = { ...supervision.checkpoint, contractDigest: loaded.digest, revision: loaded.contract.revision, status: "running" as const,
        stopReason: null, usage: { ...supervision.checkpoint.usage, cycles: state.attempts.length + state.repairs.length,
          wallTimeMs: Date.now() - Date.parse(state.startedAt) } };
      await writeCheckpoint(options.stateRoot, checkpoint);
      await persist();
    }
    if (!lastRun) throw new Error(supervision!.checkpoint.stopReason ?? "Recovery stopped before a run was created");
    return { run: lastRun, supervision: supervision!, recovery: { rootDigest, repairs: state.repairs } };
  } finally {
    await lock.close();
    if (await readBoundedFile(lockPath, options.stateRoot, 4096, undefined, true) !== lockText) throw new Error("Recovery controller claim changed; refusing to remove another owner's lock");
    await unlink(lockPath);
  }
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
  if (checkpoint.lastVerifiedHead === null) {
    return { consistent: true };
  }
  try {
    const head = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
    if (head !== checkpoint.lastVerifiedHead) {
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

  const stopState = await readTaskStopState({
    stateRoot,
    contractId: contract.id,
    contractDigest: digest,
  });
  if (stopState.status === "pending") {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint,
      gsdConsistent: false,
      unappliedEffectsCount: 0,
      reason: "A stop request is pending and process termination has not been confirmed yet.",
    };
  }
  if (stopState.status === "unknown") {
    return {
      ready: false,
      contractDigest: digest,
      checkpoint,
      gsdConsistent: false,
      unappliedEffectsCount: 0,
      reason: "Process termination status is unknown after previous stop request. Re-inspect or reconcile before resume.",
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

  assertTaskCapabilityPorts(contract, options.ports);
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
      baseCommit: currentHead,
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
  await reconcileTaskRuntime(options.stateRoot, digest);

  const stopState = await readTaskStopState({
    stateRoot: options.stateRoot,
    contractId: contract.id,
    contractDigest: digest,
  });
  if (stopState.status === "pending") {
    throw new Error(`Cannot resume task: stop request is still pending for ${contract.id} (${digest.slice(0, 12)}).`);
  }
  if (stopState.status === "unknown") {
    throw new Error(`Cannot resume task: termination is unconfirmed after previous stop request for ${contract.id} (${digest.slice(0, 12)}).`);
  }

  const isGeneral = contract.category === "general";

  // Verify GSD / Git state consistency
  if (!isGeneral && checkpoint.lastVerifiedHead !== null) {
    const consistency = await verifyGsdStateConsistency(projectRoot, checkpoint);
    if (!consistency.consistent) {
      throw new Error(`Cannot resume task: GSD state is inconsistent: ${consistency.reason}`);
    }
  }

  if (contract.scope.workflow === "gsd-quick") {
    const quickRoot = join(projectRoot, ".planning", "quick");
    let quickDirs: string[] = [];
    try {
      const entries = await readdir(quickRoot, { withFileTypes: true });
      quickDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {}

    if (checkpoint.quickId) {
      const matching = quickDirs.filter((d) => d === checkpoint.quickId || d.startsWith(`${checkpoint.quickId}-`));
      if (matching.length > 1) {
        throw new Error(`Cannot resume task: ambiguous quick directories for ${checkpoint.quickId}: ${matching.join(", ")}`);
      }
    } else if (quickDirs.length > 1) {
      throw new Error(`Cannot resume task: multiple quick directories found under .planning/quick/: ${quickDirs.join(", ")}`);
    }

    if (checkpoint.workflowSha256) {
      const { readGsdQuickOutline } = await import("./task-gsd.js");
      const { codexConfigRoot } = await import("./gsd-compat.js");
      const configRoot = options.gsd?.configRoot ?? codexConfigRoot();
      try {
        const outline = await readGsdQuickOutline(configRoot);
        if (checkpoint.workflowSha256 !== outline.sourceSha256) {
          throw new Error(`Cannot resume task: incompatible workflow hash (checkpoint ${checkpoint.workflowSha256}, installed ${outline.sourceSha256})`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith("Cannot resume task")) throw err;
      }
    }
  }

  // Reconcile performing / uncertain effects on recovery
  let ledger = (await readEffectLedger(options.stateRoot, digest)) ?? createEffectLedger(digest);
  let baseCommit: string | null = null;
  if (!isGeneral) {
    const currentHead = (await runGitRead(projectRoot, ["rev-parse", "HEAD"])).trim();
    baseCommit = checkpoint.lastVerifiedHead ?? currentHead;
  }

  const reconciliation = await reconcileLedgerOnRecovery(projectRoot, baseCommit, ledger, {
    connectorPort: options.ports?.connector,
    reverifyAppliedFiles: isGeneral,
  });
  ledger = reconciliation.ledger;
  await saveEffectLedger(options.stateRoot, digest, ledger);

  if (reconciliation.demotedEffects && reconciliation.demotedEffects.length > 0) {
    await logEvent(options.stateRoot, digest, {
      kind: "effect_reconciled",
      attemptIndex: checkpoint.attemptIndex,
      payload: {
        action: "demoted_missing_applied_files",
        effects: reconciliation.demotedEffects.map((e) => ({
          effectKey: e.effectKey,
          destination: e.targetPayload["destination"] ?? e.targetPayload["relPath"],
        })),
      },
    });
  }

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
          error: e.error,
        })),
        nextAction: "reconcile_or_repair_source_evidence",
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
    // 0. Check durable stop request (D-12)
    const stopState = await readTaskStopState({
      stateRoot: options.stateRoot,
      contractId: contract.id,
      contractDigest: digest,
    });
    if (stopState.status === "pending") {
      await recordTaskStopConfirmation({
        stateRoot: options.stateRoot,
        contractId: contract.id,
        runId: checkpoint.contractDigest,
        contractDigest: digest,
        terminationEvidence: "supervisor-observed-loop-termination",
        stopReason: stopState.reason,
      });
      checkpoint.status = "stopped";
      checkpoint.stopReason = stopState.reason ?? "operator_halt";
      checkpoint.updatedAt = (options.now ?? (() => new Date()))().toISOString();
      await writeCheckpoint(options.stateRoot, checkpoint);
      await logEvent(options.stateRoot, digest, {
        kind: "process_cancelled",
        attemptIndex: checkpoint.attemptIndex,
        payload: { reason: checkpoint.stopReason },
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
    const dispatches = await readTaskChainDispatches(options.stateRoot, contract);
    const aggregate = chainDispatchUsage(dispatches);
    checkpoint.usage.tokens = aggregate.tokens;
    checkpoint.usage.costUsd = aggregate.costUsd;
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
      ...(attemptIndex === 1 && options.initialRunId ? { runId: options.initialRunId } : {}),
      contractPath: options.contractPath,
      expectedDigest: digest,
      stateRoot: options.stateRoot,
      packageRoot: options.packageRoot,
      ports: options.ports,
      allowPriorRun: true,
      ...(options.now ? { now: options.now } : {}),
      ...(options.gsd ? { gsd: options.gsd } : {}),
      ...(strategy.promptInjection ? { promptInjection: strategy.promptInjection } : {}),
      ...(options.onRunReady ? { onRunReady: options.onRunReady } : {}),
    };

    try {
      attemptResult = await startTask(startOptions);
    } catch (err) {
      attemptError = err;
    }

    const duration = Date.now() - attemptStart;
    checkpoint.usage.cycles += 1;
    checkpoint.usage.wallTimeMs += duration;
    const observedUsage = chainDispatchUsage(await readTaskChainDispatches(options.stateRoot, contract));
    checkpoint.usage.tokens = observedUsage.tokens;
    checkpoint.usage.costUsd = observedUsage.costUsd;
    if (contract.category !== "general") {
      checkpoint.lastVerifiedHead =
        (await runGitRead(projectRoot, ["rev-parse", "HEAD"]).catch(() => null))?.trim() ??
        checkpoint.lastVerifiedHead;
    }

    if (attemptResult?.run) {
      if (attemptResult.run.baseCommit) {
        checkpoint.baseCommit = attemptResult.run.baseCommit;
      }
      if (attemptResult.run.gsd?.quickId) {
        checkpoint.quickId = attemptResult.run.gsd.quickId;
      }
      if (attemptResult.run.gsd?.workflowSha256) {
        checkpoint.workflowSha256 = attemptResult.run.gsd.workflowSha256;
      }
      if (attemptResult.run.gsd?.fullEvidence?.stages) {
        checkpoint.stageReceiptIds = attemptResult.run.gsd.fullEvidence.stages.map((st) => st.receiptId);
        await logEvent(options.stateRoot, digest, {
          kind: "stage_receipt_recorded",
          attemptIndex,
          payload: {
            quickId: checkpoint.quickId,
            stageReceiptIds: checkpoint.stageReceiptIds,
            verifiedStages: attemptResult.run.gsd.fullEvidence.stages.map((st) => st.stage),
          },
        });
      }
      if (attemptResult.run.executor?.sessionId) {
        checkpoint.nativeSessionId = attemptResult.run.executor.sessionId;
      }
    }

    const errorMsg = attemptError instanceof Error ? attemptError.message : String(attemptError ?? "");

    // Check for quota exhaustion
    const quotaObserved = (await readTaskDispatches(options.stateRoot, digest)).some((entry) =>
      entry.runId === attemptResult?.run.runId && entry.reason === "quota_exhausted");
    if ((attemptError && detectQuotaExhaustion(errorMsg)) || quotaObserved) {
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
    const rawError = reviewerCriterion?.finding?.summary ?? failingRow?.reason ?? attemptResult?.run.stopReason ?? (errorMsg || "Rejected");
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
    if (contract.recoveryPolicy || /capability-|capability evidence/iu.test(rawError)) {
      checkpoint.status = "blocked";
      checkpoint.stopReason = rawError;
      await writeCheckpoint(options.stateRoot, checkpoint);
      return { status: "blocked", contractDigest: digest, checkpoint, stopCode: null,
        usage: evaluateResourceLimits(contract.resourcePolicy, checkpoint.usage).usageBreakdown, ledger, blockedReport: null };
    }
  }
}
