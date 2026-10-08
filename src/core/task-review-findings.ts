import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials } from "./validation.js";
import type { TaskReviewLocator, TaskReviewRuleConfirmation, TaskReviewReport, TaskReviewReportV2 } from "./task-review-evidence.js";
import type { TaskReviewClassificationResult, TaskDefectClassification } from "./task-review-classification.js";
import type { FailureReproduction } from "./task-strategy.js";
import type { GapRoutingDecision, GapRoutingDestination } from "./task-gap-router.js";
import type { TaskContract } from "./task-contract.js";
import type { ReviewWitnessReceipt } from "./task-review-witness.js";
import { verifyReviewWitness } from "./task-review-witness.js";
import { requireFullContractReverification } from "./task-gap-router.js";

export type FindingStatus = "open" | "repaired" | "resolved" | "reopened";

export type FindingEventType = "detected" | "routed" | "repaired" | "resolved" | "reopened";

export interface FindingHistoryEvent {
  readonly event: FindingEventType;
  readonly timestamp: string;
  readonly revisionSha: string;
  readonly details: Record<string, unknown>;
}

export interface FindingGsdRouting {
  readonly destination: GapRoutingDestination;
  readonly gsdItemRef: string;
  readonly routedAt: string;
  readonly targetPhaseId?: string;
  readonly reason: string;
}

export interface FindingRecord {
  readonly findingId: string;
  readonly rootCauseKey: string;
  readonly criterionIds: readonly string[];
  readonly scope: "in-scope" | "out-of-scope";
  readonly impact: "blocking" | "advisory";
  readonly status: FindingStatus;
  readonly summary: string;
  readonly reproduction?: FailureReproduction;
  readonly ruleConfirmation?: TaskReviewRuleConfirmation;
  readonly originalEvidence: readonly TaskReviewLocator[];
  readonly gsdRouting?: FindingGsdRouting;
  readonly history: readonly FindingHistoryEvent[];
}

export interface TaskReviewFindingsDocument {
  readonly schemaVersion: 1;
  readonly contractId: string;
  readonly findings: readonly FindingRecord[];
  readonly updatedAt: string;
}

function assertNoRawCredentials(value: unknown, context: string): void {
  const issues = rejectRawCredentials(value);
  if (issues.length > 0) {
    throw new Error(
      `Raw credentials rejected in ${context}: ${issues.map((i) => `${i.code} at ${i.documentPath}`).join("; ")}`,
    );
  }
}

export function findingsFilePath(stateRoot: string, contractId: string): string {
  return join(stateRoot, "tasks", contractId, "findings.json");
}

/**
 * Computes an objective root-cause key for a finding.
 *
 * Rules (D-09, D-12, T-19-05):
 * - Architectural violation: exact approved ruleId + inspectedPath + normalized check pattern.
 * - Confirmed reproduction: normalized inputText + observedExitCode + normalized stdout.
 * - Missing requirement without command repro: bound to exact criterionId and cause.
 *
 * Crucial: Do NOT merge findings based solely on similar prose summaries or fingerprints
 * if their underlying objective root causes differ!
 */
export function computeRootCauseKey(finding: {
  readonly criterionId: string;
  readonly kind: string;
  readonly ruleConfirmation?: TaskReviewRuleConfirmation | undefined;
  readonly reproduction?: FailureReproduction | undefined;
  readonly summary?: string | undefined;
  readonly rawError?: string | undefined;
}): string {
  if (finding.ruleConfirmation) {
    const rc = finding.ruleConfirmation;
    const normPath = rc.inspectedPath.trim().replace(/[\\/]+/gu, "/");
    const pattern = rc.checkDescriptor?.pattern ?? rc.observedViolation ?? "";
    const normPattern = pattern.trim().toLowerCase().replace(/\s+/gu, " ");
    return `arch:${rc.ruleId.trim()}:${normPath}:${normPattern}`;
  }

  if (finding.reproduction) {
    const r = finding.reproduction;
    const normInput = (r.inputText ?? "").trim().replace(/\s+/gu, " ");
    const code = r.observedExitCode ?? 0;
    const normStdout = (r.observedStdout ?? "").trim().replace(/\s+/gu, " ").slice(0, 128);
    // If reproduction input or stdout exists, use that objective behavior
    if (normInput.length > 0 || normStdout.length > 0) {
      return `repro:${normInput}:${code}:${normStdout}`;
    }
  }

  // Fallback: Bind to exact criterionId to avoid false merges
  const normSummary = (finding.summary ?? finding.rawError ?? "").trim().toLowerCase().replace(/\s+/gu, " ").slice(0, 128);
  return `cause:${finding.criterionId}:${finding.kind}:${normSummary}`;
}

export function computeFindingId(contractId: string, rootCauseKey: string): string {
  return createHash("sha256")
    .update(`${contractId}:${rootCauseKey}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Reads all findings from external stateRoot.
 * Returns empty array if file does not exist, but throws if file is corrupt or invalid (D-08, D-09).
 */
export async function readTaskReviewFindings(
  stateRoot: string,
  contractId: string,
): Promise<readonly FindingRecord[]> {
  const filePath = findingsFilePath(stateRoot, contractId);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }

  assertNoRawCredentials(raw, "readTaskReviewFindings raw JSON");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Corrupted findings file at ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { schemaVersion?: unknown }).schemaVersion !== 1 ||
    !Array.isArray((parsed as { findings?: unknown }).findings)
  ) {
    throw new Error(`Invalid findings document structure at ${filePath}`);
  }

  return (parsed as TaskReviewFindingsDocument).findings;
}

export interface ReconcileCandidateFinding {
  readonly criterionId: string;
  readonly kind: string;
  readonly scope: "in-scope" | "out-of-scope";
  readonly impact: "blocking" | "advisory";
  readonly isConfirmed: boolean;
  readonly summary: string;
  readonly locator?: TaskReviewLocator | null;
  readonly reproduction?: FailureReproduction | null;
  readonly ruleConfirmation?: TaskReviewRuleConfirmation | null;
}

export function extractCandidateFindings(
  report: TaskReviewReport,
  classification: TaskReviewClassificationResult,
): readonly ReconcileCandidateFinding[] {
  const result: ReconcileCandidateFinding[] = [];
  const classByCriterion = new Map<string, TaskDefectClassification>();
  for (const c of classification.classifications) {
    classByCriterion.set(c.criterionId, c);
  }

  for (const crit of report.criteria) {
    if (!crit.finding) continue;
    const cls = classByCriterion.get(crit.criterionId);
    const repro = crit.finding.reproduction;
    const failureRepro: FailureReproduction | null = repro
      ? {
          ...(repro.inputText !== undefined ? { inputText: repro.inputText } : {}),
          ...(repro.observedExitCode !== undefined ? { observedExitCode: repro.observedExitCode } : {}),
          ...(repro.observedStdout !== undefined ? { observedStdout: repro.observedStdout } : {}),
          summary: crit.finding.summary,
        }
      : null;

    const rawImpact = "impact" in crit.finding ? (crit.finding as { impact?: string }).impact : undefined;
    const effectiveImpact: "blocking" | "advisory" = cls
      ? (cls.isBlocking ? "blocking" : "advisory")
      : (rawImpact === "advisory" ? "advisory" : "blocking");

    result.push({
      criterionId: crit.criterionId,
      kind: cls?.kind ?? "unclassified",
      scope: cls?.scope ?? "in-scope",
      impact: effectiveImpact,
      isConfirmed: cls?.confirmed ?? true,
      summary: crit.finding.summary,
      locator: "locator" in crit ? crit.locator ?? null : null,
      reproduction: failureRepro,
      ruleConfirmation: "ruleConfirmation" in crit.finding ? crit.finding.ruleConfirmation ?? null : null,
    });
  }
  return result;
}

export interface ReconcileFindingsOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly targetRevisionSha: string;
  readonly classifiedFindings: readonly ReconcileCandidateFinding[];
  readonly nowIso?: string;
}

export interface ReconcileFindingsResult {
  readonly findings: readonly FindingRecord[];
  readonly newBlockingFindings: readonly FindingRecord[];
  readonly reopenedFindings: readonly FindingRecord[];
}

/**
 * Reconciles newly observed classified findings with existing findings history.
 *
 * Implements:
 * - D-09/D-12: Merge multiple criteria pointing to the same confirmed root-cause into one finding.
 * - D-11: If a resolved finding recurs with new verified evidence, transition to "reopened".
 * - T-19-05: Do not merge disparate causes.
 */
export async function recordOrReconcileFindings(
  options: ReconcileFindingsOptions,
): Promise<ReconcileFindingsResult> {
  const { stateRoot, contractId, targetRevisionSha, classifiedFindings } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const existingList = [...(await readTaskReviewFindings(stateRoot, contractId))];
  const byRootCauseKey = new Map<string, FindingRecord>();
  for (const f of existingList) {
    byRootCauseKey.set(f.rootCauseKey, f);
  }

  const newBlocking: FindingRecord[] = [];
  const reopened: FindingRecord[] = [];

  // Group incoming classified findings by root-cause key
  const incomingGroups = new Map<string, ReconcileCandidateFinding[]>();
  for (const cf of classifiedFindings) {
    // Only process confirmed findings
    if (!cf.isConfirmed) continue;
    const key = computeRootCauseKey({
      criterionId: cf.criterionId,
      kind: cf.kind,
      summary: cf.summary,
      ...(cf.ruleConfirmation ? { ruleConfirmation: cf.ruleConfirmation } : {}),
      ...(cf.reproduction ? { reproduction: cf.reproduction } : {}),
    });
    const group = incomingGroups.get(key) ?? [];
    group.push(cf);
    incomingGroups.set(key, group);
  }

  for (const [key, group] of incomingGroups.entries()) {
    const primary = group[0]!;
    const criterionIds = Array.from(new Set(group.map((g) => g.criterionId))).sort();
    const locators = group.flatMap((g) => (g.locator ? [g.locator] : []));
    const isBlocking = group.some((g) => g.impact === "blocking");
    const impact = isBlocking ? "blocking" : "advisory";
    const scope = group.some((g) => g.scope === "in-scope") ? "in-scope" : "out-of-scope";

    const existing = byRootCauseKey.get(key);

    if (!existing) {
      // New finding
      const findingId = computeFindingId(contractId, key);
      const newRecord: FindingRecord = {
        findingId,
        rootCauseKey: key,
        criterionIds,
        scope,
        impact,
        status: "open",
        summary: primary.summary,
        ...(primary.reproduction ? { reproduction: primary.reproduction } : {}),
        ...(primary.ruleConfirmation ? { ruleConfirmation: primary.ruleConfirmation } : {}),
        originalEvidence: locators,
        history: [
          {
            event: "detected",
            timestamp: nowIso,
            revisionSha: targetRevisionSha,
            details: {
              criteriaCount: criterionIds.length,
              criterionIds,
              kind: primary.kind,
              impact,
            },
          },
        ],
      };
      byRootCauseKey.set(key, newRecord);
      if (impact === "blocking") {
        newBlocking.push(newRecord);
      }
    } else {
      // Existing finding: merge new criterionIds
      const mergedCriteria = Array.from(new Set([...existing.criterionIds, ...criterionIds])).sort();
      let updatedStatus = existing.status;
      const history = [...existing.history];

      // D-11: Reopen if previously resolved/repaired and observed failing in a new/current revision
      if (existing.status === "resolved" || existing.status === "repaired") {
        updatedStatus = "reopened";
        history.push({
          event: "reopened",
          timestamp: nowIso,
          revisionSha: targetRevisionSha,
          details: {
            reason: "Defect recurred in revision with new verified evidence",
            observedCriteria: criterionIds,
          },
        });
        reopened.push(existing);
      }

      const updatedRecord: FindingRecord = {
        ...existing,
        criterionIds: mergedCriteria,
        status: updatedStatus,
        history,
      };
      byRootCauseKey.set(key, updatedRecord);
    }
  }

  const finalFindings = Array.from(byRootCauseKey.values());
  const document: TaskReviewFindingsDocument = {
    schemaVersion: 1,
    contractId,
    findings: finalFindings,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "recordOrReconcileFindings document");

  const filePath = findingsFilePath(stateRoot, contractId);
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  return {
    findings: finalFindings,
    newBlockingFindings: newBlocking,
    reopenedFindings: reopened,
  };
}

export interface RouteFindingGapOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly findingId: string;
  readonly routingDecision: GapRoutingDecision;
  readonly nowIso?: string;
}

/**
 * Attaches a GSD routing decision to an existing finding.
 * Ensures idempotent 1:1 binding between confirmed root cause and GSD gap item (D-09).
 */
export async function attachFindingGsdRouting(
  options: RouteFindingGapOptions,
): Promise<FindingRecord> {
  const { stateRoot, contractId, findingId, routingDecision } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const findings = [...(await readTaskReviewFindings(stateRoot, contractId))];
  const index = findings.findIndex((f) => f.findingId === findingId);
  if (index === -1) {
    throw new Error(`Finding ${findingId} not found for contract ${contractId}`);
  }

  const existing = findings[index]!;
  if (existing.gsdRouting) {
    // Idempotent: Already routed, preserve existing routing
    return existing;
  }

  const gsdItemRef = routingDecision.gapIds[0] ?? `gap-${findingId.slice(0, 8)}`;
  const gsdRouting: FindingGsdRouting = {
    destination: routingDecision.destination,
    gsdItemRef,
    routedAt: nowIso,
    ...(routingDecision.targetPhaseId ? { targetPhaseId: routingDecision.targetPhaseId } : {}),
    reason: routingDecision.reason,
  };

  const history = [
    ...existing.history,
    {
      event: "routed" as const,
      timestamp: nowIso,
      revisionSha: existing.history[0]?.revisionSha ?? "unknown",
      details: {
        destination: routingDecision.destination,
        gsdItemRef,
        targetPhaseId: routingDecision.targetPhaseId,
      },
    },
  ];

  const updated: FindingRecord = {
    ...existing,
    gsdRouting,
    history,
  };

  findings[index] = updated;

  const document: TaskReviewFindingsDocument = {
    schemaVersion: 1,
    contractId,
    findings,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "attachFindingGsdRouting document");

  const filePath = findingsFilePath(stateRoot, contractId);
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  return updated;
}

export interface MarkFindingRepairedOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly findingId: string;
  readonly repairRevisionSha: string;
  readonly repairNote?: string;
  readonly nowIso?: string;
}

/**
 * Records that a GSD repair was completed for a finding.
 * NOTE: This does NOT resolve the finding (D-10, T-19-06)!
 * Resolution requires full re-verification on a fresh revision and session.
 */
export async function markFindingRepaired(
  options: MarkFindingRepairedOptions,
): Promise<FindingRecord> {
  const { stateRoot, contractId, findingId, repairRevisionSha, repairNote } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const findings = [...(await readTaskReviewFindings(stateRoot, contractId))];
  const index = findings.findIndex((f) => f.findingId === findingId);
  if (index === -1) {
    throw new Error(`Finding ${findingId} not found for contract ${contractId}`);
  }

  const existing = findings[index]!;
  const history = [
    ...existing.history,
    {
      event: "repaired" as const,
      timestamp: nowIso,
      revisionSha: repairRevisionSha,
      details: { note: repairNote ?? "GSD repair plan executed" },
    },
  ];

  const updated: FindingRecord = {
    ...existing,
    status: "repaired",
    history,
  };

  findings[index] = updated;

  const document: TaskReviewFindingsDocument = {
    schemaVersion: 1,
    contractId,
    findings,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "markFindingRepaired document");

  const filePath = findingsFilePath(stateRoot, contractId);
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  return updated;
}

export interface ReverifyResolutionOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly findingId: string;
  readonly contract: TaskContract;
  readonly newHeadSha: string;
  readonly newArtifactDigest: string;
  readonly newReviewReceipt: ReviewWitnessReceipt | null;
  readonly originalReproductionFails: boolean; // True if original reproduction STILL fails (defect persists)
  readonly contractCriteriaPassed: readonly string[]; // All criterion IDs that passed in the new run
  readonly nowIso?: string;
}

export interface ReverifyResolutionResult {
  readonly resolved: boolean;
  readonly reason: string;
  readonly finding: FindingRecord;
}

/**
 * Re-verifies a repaired or open finding against fresh whole-contract evidence (D-10, REV-04).
 *
 * Requirements for resolution:
 * 1. Revision must be newer than the original detection revision.
 * 2. Original reproduction or rule violation must NO LONGER be present (originalReproductionFails === false).
 * 3. All required contract criteria (requireFullContractReverification) must be passed.
 * 4. A fresh ReviewWitnessReceipt must exist, match newHeadSha and newArtifactDigest, and have witnessVerdict === "accepted".
 *
 * If any requirement is missing, status remains open/repaired.
 */
export async function reverifyFindingResolution(
  options: ReverifyResolutionOptions,
): Promise<ReverifyResolutionResult> {
  const {
    stateRoot,
    contractId,
    findingId,
    contract,
    newHeadSha,
    newArtifactDigest,
    newReviewReceipt,
    originalReproductionFails,
    contractCriteriaPassed,
  } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  const findings = [...(await readTaskReviewFindings(stateRoot, contractId))];
  const index = findings.findIndex((f) => f.findingId === findingId);
  if (index === -1) {
    throw new Error(`Finding ${findingId} not found for contract ${contractId}`);
  }

  const existing = findings[index]!;
  const originalDetection = existing.history.find((h) => h.event === "detected");
  const originalSha = originalDetection?.revisionSha ?? "";

  // 1. Revision freshness check
  if (newHeadSha === originalSha) {
    return {
      resolved: false,
      reason: `Artifact was not modified: head ${newHeadSha.slice(0, 12)} matches original defect revision.`,
      finding: existing,
    };
  }

  // 2. Original reproduction check
  if (originalReproductionFails) {
    return {
      resolved: false,
      reason: "Original defect reproduction still fails on new revision.",
      finding: existing,
    };
  }

  // 3. Whole-contract reverification check (D-10, D-12)
  const fullCheck = requireFullContractReverification(contract, existing.criterionIds);
  const passedSet = new Set(contractCriteriaPassed);
  const unpassed = fullCheck.requiredCriteria.filter((cid) => !passedSet.has(cid));
  if (unpassed.length > 0) {
    return {
      resolved: false,
      reason: `Full contract reverification failed: missing passing results for [${unpassed.join(", ")}].`,
      finding: existing,
    };
  }

  // 4. Fresh review witness check
  const witnessCheck = verifyReviewWitness({
    receipt: newReviewReceipt,
    currentHeadSha: newHeadSha,
    currentArtifactDigest: newArtifactDigest,
  });
  if (!witnessCheck.valid) {
    return {
      resolved: false,
      reason: `Review witness rejected: ${witnessCheck.reason ?? "invalid witness receipt"}.`,
      finding: existing,
    };
  }

  // All conditions met: transition to resolved
  const history = [
    ...existing.history,
    {
      event: "resolved" as const,
      timestamp: nowIso,
      revisionSha: newHeadSha,
      details: {
        witnessSessionId: newReviewReceipt?.sessionId,
        verifiedCriteria: fullCheck.requiredCriteria,
      },
    },
  ];

  const resolvedRecord: FindingRecord = {
    ...existing,
    status: "resolved",
    history,
  };

  findings[index] = resolvedRecord;

  const document: TaskReviewFindingsDocument = {
    schemaVersion: 1,
    contractId,
    findings,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "reverifyFindingResolution document");

  const filePath = findingsFilePath(stateRoot, contractId);
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  return {
    resolved: true,
    reason: "Defect eliminated, all criteria verified, and fresh independent review accepted.",
    finding: resolvedRecord,
  };
}
