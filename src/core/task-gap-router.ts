import {
  selectRepairStrategy,
  type FailureHistoryEntry,
  type StrategySelectionResult,
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

  const strategy = selectRepairStrategy(history);
  if (strategy.stage === "stage-3-blocked") {
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
