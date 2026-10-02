import {
  computeFailureFingerprint,
  selectRepairStrategy,
  type FailureHistoryEntry,
  type StrategySelectionResult,
  type RepairStage,
} from "./task-strategy.js";
import type { TaskContract } from "./task-contract.js";

export type GapRoutingDestination = "gap-plan" | "new-phase" | "blocked";

export interface GapRoutingDecision {
  readonly destination: GapRoutingDestination;
  readonly reason: string;
  readonly targetPhaseId?: string;
  readonly gapIds: readonly string[];
  readonly strategy?: StrategySelectionResult;
}

export interface RouteGapOptions {
  readonly contract: TaskContract;
  readonly currentPhaseId: string;
  readonly defectSummary: string;
  readonly isScopeExpansion: boolean;
  readonly history: FailureHistoryEntry[];
}

export interface GapProgressionResult {
  readonly shouldBlock: boolean;
  readonly stage: RepairStage;
  readonly failureCount: number;
}

export interface FullContractReverificationResult {
  readonly requiredCriteria: readonly string[];
  readonly regressionCheckMandatory: true;
}

/**
 * Routes a verification defect based on scope and failure history.
 *
 * Implements GSD-02, GSD-03, and decisions D-05, D-06, D-08:
 * - Anti-loop protection: if repeated identical failures reached blocked stage, returns "blocked".
 * - Out-of-phase scope expansions / architectural changes are routed to "new-phase" (ROADMAP.md).
 * - In-phase defect fixes are routed to "gap-plan" targeting the current phase.
 */
export function routeVerificationGap(options: RouteGapOptions): GapRoutingDecision {
  const { currentPhaseId, defectSummary, isScopeExpansion, history } = options;

  const progression = evaluateGapProgression(history);
  const normalizedHistory = history.map((entry, idx) => ({
    ...entry,
    attemptIndex: entry.attemptIndex ?? idx,
    fingerprint:
      entry.fingerprint ||
      computeFailureFingerprint(entry.criterionId, entry.cause, entry.rawError),
  }));
  const strategy = selectRepairStrategy(normalizedHistory);

  if (progression.shouldBlock || strategy.stage === "stage-3-blocked") {
    return {
      destination: "blocked",
      reason: "Anti-loop triggered: 2+ identical failures exhausted alternatives.",
      gapIds: [],
      strategy,
    };
  }

  if (isScopeExpansion) {
    return {
      destination: "new-phase",
      reason: "Defect represents new functionality or architectural changes exceeding current Phase boundary.",
      gapIds: [defectSummary],
      strategy,
    };
  }

  return {
    destination: "gap-plan",
    targetPhaseId: currentPhaseId,
    reason: "Defect is within current Phase boundary; routing to native GSD gap plan (*-GAP-*.md).",
    gapIds: [defectSummary],
    strategy,
  };
}

/**
 * Returns native GSD CLI arguments for invoking gap planning in an existing phase.
 * Convention: ["query", "plan-phase", phaseId, "--gaps", gapSummary]
 */
export function createGsdGapPlanArgs(phaseId: string, gapSummary: string): readonly string[] {
  return ["query", "plan-phase", phaseId, "--gaps", gapSummary];
}

/**
 * Returns native GSD CLI arguments for adding a new phase to the roadmap.
 * Convention: ["phase", "add", phaseName, "--description", reason]
 */
export function createNewPhaseRoadmapArgs(phaseName: string, reason: string): readonly string[] {
  return ["phase", "add", phaseName, "--description", reason];
}

/**
 * Evaluates failure history against the 3-stage anti-loop progression.
 * Implements GSD-02 and decision D-08.
 *
 * Normalizes and fingerprints failure history entries via computeFailureFingerprint.
 * Counts consecutive occurrences of the identical fingerprint.
 * When consecutive identical failures occur (>= 2), activates the 3-stage progression
 * (stage-1-reproduction-injection -> stage-2-single-criterion-focus -> stage-3-blocked).
 * When stage reaches stage-3-blocked, returns shouldBlock: true.
 */
export function evaluateGapProgression(
  history: FailureHistoryEntry[],
): GapProgressionResult {
  if (history.length === 0) {
    return {
      shouldBlock: false,
      stage: "stage-0-default",
      failureCount: 0,
    };
  }

  const normalizedHistory: FailureHistoryEntry[] = history.map((entry, idx) => ({
    ...entry,
    attemptIndex: entry.attemptIndex ?? idx,
    fingerprint:
      entry.fingerprint ||
      computeFailureFingerprint(entry.criterionId, entry.cause, entry.rawError),
  }));

  const latest = normalizedHistory[normalizedHistory.length - 1]!;
  let count = 0;
  for (let i = normalizedHistory.length - 1; i >= 0; i--) {
    if (normalizedHistory[i]?.fingerprint === latest.fingerprint) {
      count++;
    } else {
      break;
    }
  }

  const strategy = selectRepairStrategy(normalizedHistory);

  return {
    shouldBlock: strategy.stage === "stage-3-blocked",
    stage: strategy.stage,
    failureCount: count,
  };
}

/**
 * Enforces whole-contract re-verification after gap execution to prevent regressions (D-07).
 * Returns all contract criterion IDs (not just resolved gap criteria).
 */
export function requireFullContractReverification(
  contract: TaskContract,
  _resolvedGapIds: readonly string[],
): FullContractReverificationResult {
  const criteriaIds = contract.criterion.map((c) => c.id);
  return {
    requiredCriteria: criteriaIds,
    regressionCheckMandatory: true,
  };
}

