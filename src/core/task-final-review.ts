import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";
import type { TaskContract } from "./task-contract.js";
import type { TaskReviewRuleConfirmation } from "./task-review-evidence.js";
import type { FailureReproduction } from "./task-strategy.js";
import type { GapRoutingDecision } from "./task-gap-router.js";
import { routeVerificationGap } from "./task-gap-router.js";
import {
  attachFindingGsdRouting,
  recordOrReconcileFindings,
  type ReconcileCandidateFinding,
} from "./task-review-findings.js";

export type FinalReviewVerdict = "accepted" | "rejected" | "unknown";

export type FinalRequirementStatus = "verified" | "missing" | "unverified";

export interface FinalRequirementEvaluation {
  readonly requirementId: string;
  readonly description: string;
  readonly status: FinalRequirementStatus;
  readonly implementationLocation: {
    readonly path: string;
    readonly lineRange?: string;
    readonly digest: string;
  };
  readonly checkReceiptRef: {
    readonly receiptId: string;
    readonly digest: string;
    readonly status: "pass" | "fail" | "unknown";
  };
  readonly reviewEvidenceRef: {
    readonly reportDigest: string;
    readonly criterionId?: string;
  };
  readonly notes?: string;
}

export interface FinalCrossPhaseItem {
  readonly status: "pass" | "fail" | "unknown";
  readonly summary: string;
}

export interface FinalCrossPhaseAssessment {
  readonly userFlow: FinalCrossPhaseItem;
  readonly approvalBoundaries: FinalCrossPhaseItem;
  readonly gsdStateOwnership: FinalCrossPhaseItem;
  readonly reviewerIndependence: FinalCrossPhaseItem;
}

export type FinalFindingCategory =
  | "missing-requirement"
  | "integration-failure"
  | "architecture-violation"
  | "test-evidence-deficit"
  | "style-preference"
  | "unrelated-proposal";

export interface FinalReviewFinding {
  readonly findingId: string;
  readonly category: FinalFindingCategory;
  readonly impact: "blocking" | "advisory";
  readonly scope: "in-scope" | "out-of-scope";
  readonly summary: string;
  readonly location?: {
    readonly path: string;
    readonly lineRange?: string;
  };
  readonly ruleConfirmation?: TaskReviewRuleConfirmation;
  readonly reproduction?: FailureReproduction;
}

export interface TaskFinalReviewReport {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly contractId: string;
  readonly contractDigest: string;
  readonly targetRevisionSha: string;
  readonly artifactDigest: string;
  readonly sessionId: string;
  readonly reviewerHarness: string;
  readonly reviewerVersion: string;
  readonly evaluatedAt: string;
  readonly overallVerdict: FinalReviewVerdict;
  readonly requirements: readonly FinalRequirementEvaluation[];
  readonly crossPhaseAssessment: FinalCrossPhaseAssessment;
  readonly findings: readonly FinalReviewFinding[];
  readonly summary: string;
}

export interface FinalReviewWitnessReceipt {
  readonly schemaVersion: 1;
  readonly kind: "final-review-witness-receipt";
  readonly requestId: string;
  readonly contractId: string;
  readonly contractDigest: string;
  readonly targetRevisionSha: string;
  readonly artifactDigest: string;
  readonly sessionId: string;
  readonly reviewerHarness: string;
  readonly reviewerVersion: string;
  readonly overallVerdict: FinalReviewVerdict;
  readonly reportDigest: string;
  readonly examinedAt: string;
  readonly receiptDigest: string;
}

export interface FinalReviewPort {
  evaluateMilestoneFinal(options: {
    contract: TaskContract;
    targetRevisionSha: string;
    artifactDigest: string;
    requirements: readonly { id: string; description: string }[];
  }): Promise<TaskFinalReviewReport>;
}

function assertNoRawCredentials(value: unknown, context: string): void {
  const issues = rejectRawCredentials(value);
  if (issues.length > 0) {
    throw new Error(
      `Raw credentials rejected in ${context}: ${issues.map((i) => `${i.code} at ${i.documentPath}`).join("; ")}`,
    );
  }
}

export function computeFinalReviewWitnessDigest(
  payload: Omit<FinalReviewWitnessReceipt, "receiptDigest">,
): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

let cachedFinalSchema: Record<string, unknown> | null = null;

async function getFinalReviewSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedFinalSchema !== null && !pkgRoot) {
    return cachedFinalSchema;
  }
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "task-final-review.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!pkgRoot) {
    cachedFinalSchema = parsed;
  }
  return parsed;
}

/**
 * Validates a final review report against schemas/task-final-review.schema.json and checks
 * strict identity bindings against target revision and artifact digest (D-13, REV-03).
 */
export async function validateFinalReviewReport(
  report: unknown,
  options: {
    contractId: string;
    contractDigest: string;
    targetRevisionSha: string;
    artifactDigest: string;
    pkgRoot?: string;
  },
): Promise<{
  readonly valid: boolean;
  readonly report: TaskFinalReviewReport | null;
  readonly issues: readonly string[];
}> {
  const issues: string[] = [];
  const schema = await getFinalReviewSchema(options.pkgRoot);

  const text = JSON.stringify(report, null, 2);
  const validated = validateManagedDocument({
    text,
    format: "json",
    kind: "task-agent-output",
    schema,
  });

  if (!validated.ok || !validated.value) {
    return {
      valid: false,
      report: null,
      issues: validated.issues.map((i) => `${i.code} at ${i.documentPath}: ${i.expected}`),
    };
  }

  const typedReport = validated.value as TaskFinalReviewReport;

  if (typedReport.contractId !== options.contractId) {
    issues.push(`Contract ID mismatch: expected ${options.contractId}, got ${typedReport.contractId}`);
  }

  if (typedReport.contractDigest !== options.contractDigest) {
    issues.push(`Contract digest mismatch: expected ${options.contractDigest}, got ${typedReport.contractDigest}`);
  }

  if (typedReport.targetRevisionSha !== options.targetRevisionSha) {
    issues.push(`Target revision mismatch: expected ${options.targetRevisionSha}, got ${typedReport.targetRevisionSha}`);
  }

  if (typedReport.artifactDigest !== options.artifactDigest) {
    issues.push(`Artifact digest mismatch: expected ${options.artifactDigest}, got ${typedReport.artifactDigest}`);
  }

  return {
    valid: issues.length === 0,
    report: issues.length === 0 ? typedReport : null,
    issues,
  };
}

/**
 * Parses requirements from .planning/REQUIREMENTS.md.
 */
export async function parseRequirementsFromMarkdown(
  projectRoot: string,
): Promise<readonly { id: string; description: string }[]> {
  const reqPath = join(projectRoot, ".planning", "REQUIREMENTS.md");
  if (!existsSync(reqPath)) {
    return [];
  }
  const text = await readFile(reqPath, "utf8");
  const list: { id: string; description: string }[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    // Matches bullet item like: - **REV-01**: Description text...
    const match = line.match(/^[-*]\s+\*\*([A-Z0-9]+-[0-9]+)\*\*:\s*(.+)$/);
    if (match?.[1] && match[2]) {
      list.push({
        id: match[1].trim(),
        description: match[2].trim(),
      });
    }
  }

  return list;
}

export function finalReviewWitnessFilePath(stateRoot: string, contractId: string): string {
  return join(stateRoot, "tasks", contractId, "final-review-witness.json");
}

export async function readFinalReviewWitness(
  stateRoot: string,
  contractId: string,
): Promise<FinalReviewWitnessReceipt | null> {
  const filePath = finalReviewWitnessFilePath(stateRoot, contractId);
  try {
    const raw = await readFile(filePath, "utf8");
    assertNoRawCredentials(raw, "readFinalReviewWitness");
    const parsed = JSON.parse(raw) as FinalReviewWitnessReceipt;
    const { receiptDigest, ...payload } = parsed;
    const expected = computeFinalReviewWitnessDigest(payload);
    if (expected !== receiptDigest) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export interface GateMilestoneFinalReviewOptions {
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly contract: TaskContract;
  readonly contractDigest: string;
  readonly targetRevisionSha: string;
  readonly workingTreeDigest: string;
  readonly finalReviewPort?: FinalReviewPort | undefined;
  readonly packageRoot?: string | undefined;
  readonly nowIso?: string;
}

export interface GateMilestoneFinalReviewResult {
  readonly status: "accepted" | "rejected" | "blocked" | "unknown";
  readonly reason: string;
  readonly report?: TaskFinalReviewReport | undefined;
  readonly witnessReceipt?: FinalReviewWitnessReceipt | undefined;
  readonly routedGaps?: readonly GapRoutingDecision[] | undefined;
}

/**
 * Executes the Milestone Final Review Gate (REV-03, REV-04, REV-05, D-13, D-14, D-15).
 *
 * Gating rules:
 * 1. If finalReviewPort is absent -> returns "unknown" (port required).
 * 2. Invokes final review in independent read-only session for the exact artifact revision.
 * 3. Enforces full schema and identity validation.
 * 4. Missing required features, integration failures, or confirmed architecture rule violations
 *    block acceptance ("blocked") and route through GSD repair.
 * 5. Unrelated advisory suggestions are deferred to pending state without blocking.
 * 6. Only when all mandatory requirements are verified, cross-phase checks pass, and no blocking
 *    findings exist, generates an immutable FinalReviewWitnessReceipt and returns "accepted".
 */
export async function gateMilestoneFinalReview(
  options: GateMilestoneFinalReviewOptions,
): Promise<GateMilestoneFinalReviewResult> {
  const {
    projectRoot,
    stateRoot,
    contract,
    contractDigest,
    targetRevisionSha,
    workingTreeDigest,
    finalReviewPort,
    packageRoot: pkgRoot,
  } = options;
  const nowIso = options.nowIso ?? new Date().toISOString();

  // 1. Port presence check
  if (!finalReviewPort) {
    return {
      status: "unknown",
      reason: "Milestone final review port is absent; cannot declare milestone completed without independent review (D-13).",
    };
  }

  // 2. Discover milestone requirements
  const requirements = await parseRequirementsFromMarkdown(projectRoot);

  // 3. Invoke independent final review port
  let rawReport: TaskFinalReviewReport;
  try {
    rawReport = await finalReviewPort.evaluateMilestoneFinal({
      contract,
      targetRevisionSha,
      artifactDigest: workingTreeDigest,
      requirements,
    });
  } catch (err) {
    return {
      status: "unknown",
      reason: `Final review port execution failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Validate report schema and revision bindings
  const validation = await validateFinalReviewReport(rawReport, {
    contractId: contract.id,
    contractDigest,
    targetRevisionSha,
    artifactDigest: workingTreeDigest,
    ...(pkgRoot ? { pkgRoot } : {}),
  });

  if (!validation.valid || !validation.report) {
    return {
      status: "rejected",
      reason: `Final review report validation failed: ${validation.issues.join("; ")}`,
    };
  }

  const report = validation.report;

  // 5. Check for blocking findings (missing requirements, architecture violations, integration failures)
  const blockingFindings = report.findings.filter((f) => f.impact === "blocking");
  if (blockingFindings.length > 0 || report.overallVerdict === "rejected") {
    // Route confirmed blocking findings to GSD repair (REV-03, REV-04)
    const routedGaps: GapRoutingDecision[] = [];

    // Map into candidate findings for reconciliation
    const candidates: ReconcileCandidateFinding[] = report.findings.map((f) => ({
      criterionId: f.findingId,
      kind: f.category,
      scope: f.scope,
      impact: f.impact,
      isConfirmed: true,
      summary: f.summary,
      reproduction: f.reproduction ?? null,
      ruleConfirmation: f.ruleConfirmation ?? null,
    }));

    try {
      const reconcileRes = await recordOrReconcileFindings({
        stateRoot,
        contractId: contract.id,
        targetRevisionSha,
        classifiedFindings: candidates,
        nowIso,
      });

      for (const finding of reconcileRes.findings) {
        if (finding.impact === "blocking" && !finding.gsdRouting) {
          const decision = routeVerificationGap({
            contract,
            currentPhaseId: "milestone-final",
            defectSummary: finding.summary,
            isScopeExpansion: finding.scope === "out-of-scope",
            history: [],
          });
          await attachFindingGsdRouting({
            stateRoot,
            contractId: contract.id,
            findingId: finding.findingId,
            routingDecision: decision,
            nowIso,
          });
          routedGaps.push(decision);
        }
      }
    } catch {
      // Non-fatal if recording findings fails; gating still blocks
    }

    return {
      status: "blocked",
      reason: `Milestone final review detected ${blockingFindings.length} blocking defect(s); routed to GSD repair.`,
      report,
      routedGaps,
    };
  }

  // 6. Check that all evaluated requirements are verified (D-14)
  const unverifiedReqs = report.requirements.filter((r) => r.status !== "verified");
  if (unverifiedReqs.length > 0) {
    return {
      status: "unknown",
      reason: `Milestone contains unverified requirements: [${unverifiedReqs.map((r) => r.requirementId).join(", ")}]. Completion records alone cannot pass (D-14).`,
      report,
    };
  }

  // 7. Check cross-phase assessment (D-15)
  const cross = report.crossPhaseAssessment;
  if (
    cross.userFlow.status !== "pass" ||
    cross.approvalBoundaries.status !== "pass" ||
    cross.gsdStateOwnership.status !== "pass" ||
    cross.reviewerIndependence.status !== "pass"
  ) {
    return {
      status: "rejected",
      reason: "Cross-phase assessment failed for one or more core constraints (userFlow, approvalBoundaries, gsdStateOwnership, reviewerIndependence).",
      report,
    };
  }

  if (report.overallVerdict !== "accepted") {
    return {
      status: report.overallVerdict,
      reason: `Final review overall verdict was ${report.overallVerdict}.`,
      report,
    };
  }

  // 8. Generate and persist FinalReviewWitnessReceipt
  const reportText = JSON.stringify(report);
  const reportDigest = createHash("sha256").update(reportText, "utf8").digest("hex");

  const receiptPayload = {
    schemaVersion: 1 as const,
    kind: "final-review-witness-receipt" as const,
    requestId: report.requestId,
    contractId: contract.id,
    contractDigest,
    targetRevisionSha,
    artifactDigest: workingTreeDigest,
    sessionId: report.sessionId,
    reviewerHarness: report.reviewerHarness,
    reviewerVersion: report.reviewerVersion,
    overallVerdict: "accepted" as const,
    reportDigest,
    examinedAt: report.evaluatedAt,
  };

  const receiptDigest = computeFinalReviewWitnessDigest(receiptPayload);
  const witnessReceipt: FinalReviewWitnessReceipt = {
    ...receiptPayload,
    receiptDigest,
  };

  const witnessText = `${JSON.stringify(witnessReceipt, null, 2)}\n`;
  assertNoRawCredentials(witnessText, "FinalReviewWitnessReceipt");

  const targetPath = finalReviewWitnessFilePath(stateRoot, contract.id);
  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: targetPath, content: Buffer.from(witnessText, "utf8") }],
  });

  return {
    status: "accepted",
    reason: "Milestone final review successfully verified all requirements, cross-phase constraints, and absence of defects.",
    report,
    witnessReceipt,
  };
}
