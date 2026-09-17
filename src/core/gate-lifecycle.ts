import type {
  GateObligationType,
  GateReceipt,
} from "../types.js";
import {
  evaluateRiskObligations,
  resolvePhaseGitDiff,
  RISK_SURFACE_DEFINITIONS,
} from "./gate.js";
import {
  computeRiskSurfaceDigest,
  readGateReceiptStrict,
} from "./gate-receipt.js";

// ---------------------------------------------------------------------------
// Lifecycle Verdict and Result Types (GATE-03, D-07)
// ---------------------------------------------------------------------------

export interface GateLifecycleVerdict {
  readonly obligation: GateObligationType;
  readonly status: "passed" | "missing" | "failed" | "stale" | "unsupported";
  readonly receipt: GateReceipt | null;
  readonly stalenessReason?: string | undefined;
  readonly offendingFiles: readonly string[];
}

export interface GateLifecycleResult {
  readonly passed: boolean;
  readonly silentPass: boolean;
  readonly verdicts: readonly GateLifecycleVerdict[];
  readonly blockingFeedback?: string | undefined;
}

// ---------------------------------------------------------------------------
// Revision-Bound Staleness Checker (D-09)
// ---------------------------------------------------------------------------

export function checkReceiptStaleness(
  receipt: GateReceipt,
  currentHeadSha: string,
  currentWorktreeDigest: string
): { isStale: boolean; reason?: string | undefined } {
  if (receipt.targetCommitSha !== currentHeadSha) {
    return {
      isStale: true,
      reason: `Git HEAD moved from ${receipt.targetCommitSha.slice(0, 8)} to ${currentHeadSha.slice(0, 8)}`,
    };
  }

  if (receipt.workingTreeDigest !== currentWorktreeDigest) {
    return {
      isStale: true,
      reason: "Working tree files in risk surface modified since gate check was run",
    };
  }

  return { isStale: false };
}

// ---------------------------------------------------------------------------
// Actionable Blocking Feedback Formatter (D-08)
// ---------------------------------------------------------------------------

export function formatGateBlockingFeedback(params: {
  obligation: string;
  reason: string;
  offendingFiles: readonly string[];
  engineOutput?: string | undefined;
  recheckCommand: string;
}): string {
  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push(`🚨 MANDATORY GSD GATE BLOCKED: ${params.obligation.toUpperCase()}`);
  lines.push("================================================================================");
  lines.push(`Status: ${params.reason.toUpperCase()}`);
  lines.push("");
  lines.push("Risk Evidence Detected:");
  if (params.offendingFiles.length > 0) {
    for (const file of params.offendingFiles) {
      lines.push(`  - ${file}`);
    }
  } else {
    lines.push("  - (cumulative phase changes detected)");
  }
  lines.push("");

  if (params.engineOutput) {
    lines.push("Engine Verification Output:");
    lines.push(params.engineOutput.trim());
    lines.push("");
  }

  lines.push("Action Required:");
  lines.push("To run or re-verify this mandatory gate, execute:");
  lines.push(`  $ ${params.recheckCommand}`);
  lines.push("");
  lines.push("GSD cannot advance to UAT/verification until this gate passes.");
  lines.push("================================================================================");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Lifecycle Predicate Gate Evaluator (GATE-03, D-07)
// ---------------------------------------------------------------------------

export async function evaluateLifecycleGates(
  projectRoot: string,
  options?: { explicitBase?: string | undefined }
): Promise<GateLifecycleResult> {
  const diffRange = await resolvePhaseGitDiff(projectRoot, options);
  const obligationResult = evaluateRiskObligations(diffRange);

  if (obligationResult.silentPass) {
    return {
      passed: true,
      silentPass: true,
      verdicts: [],
    };
  }

  const currentWorktreeDigest = await computeRiskSurfaceDigest(
    projectRoot,
    obligationResult.riskFiles
  );

  const factToObligationMap = new Map<string, GateObligationType>();
  for (const def of RISK_SURFACE_DEFINITIONS) {
    factToObligationMap.set(def.factId, def.obligation);
  }

  const verdicts: GateLifecycleVerdict[] = [];

  for (const obligation of obligationResult.obligations) {
    // Collect offending files specific to this obligation
    const matchedFilesForObligation: string[] = [];
    for (const match of obligationResult.matchedFacts) {
      if (factToObligationMap.get(match.factId) === obligation) {
        matchedFilesForObligation.push(...match.matchedFiles);
      }
    }
    const offendingFiles =
      matchedFilesForObligation.length > 0
        ? Array.from(new Set(matchedFilesForObligation)).sort()
        : obligationResult.riskFiles;

    let receipt: GateReceipt | null = null;
    try {
      receipt = await readGateReceiptStrict(projectRoot, obligation);
    } catch {
      receipt = null;
    }

    if (receipt === null) {
      verdicts.push({
        obligation,
        status: "missing",
        receipt: null,
        offendingFiles,
      });
      continue;
    }

    if (receipt.status === "failed") {
      verdicts.push({
        obligation,
        status: "failed",
        receipt,
        offendingFiles,
      });
      continue;
    }

    const staleness = checkReceiptStaleness(receipt, diffRange.headCommit, currentWorktreeDigest);
    if (staleness.isStale) {
      verdicts.push({
        obligation,
        status: "stale",
        receipt,
        stalenessReason: staleness.reason,
        offendingFiles,
      });
      continue;
    }

    verdicts.push({
      obligation,
      status: "passed",
      receipt,
      offendingFiles,
    });
  }

  const blockedVerdicts = verdicts.filter((v) => v.status !== "passed");
  if (blockedVerdicts.length > 0) {
    const feedbackBlocks = blockedVerdicts.map((v) => {
      const reasonText =
        v.status === "missing"
          ? "No gate receipt found (gate check has not been executed yet)"
          : v.status === "stale"
            ? (v.stalenessReason ?? "Gate receipt is stale")
            : (v.receipt?.diagnostics ?? "Gate check execution failed with non-zero exit code");

      return formatGateBlockingFeedback({
        obligation: v.obligation,
        reason: reasonText,
        offendingFiles: v.offendingFiles,
        engineOutput: v.receipt?.diagnostics,
        recheckCommand: `alpha-aos gate check --obligation ${v.obligation}`,
      });
    });

    return {
      passed: false,
      silentPass: false,
      verdicts,
      blockingFeedback: feedbackBlocks.join("\n\n"),
    };
  }

  return {
    passed: true,
    silentPass: false,
    verdicts,
  };
}
