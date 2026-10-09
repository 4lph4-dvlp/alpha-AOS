import type { TaskReproductionConfirmation } from "./task-check.js";
import type { TaskContract } from "./task-contract.js";
import type {
  ReviewRequest,
  TaskMeasurement,
  TaskReviewReport,
  TaskReviewReproduction,
  TaskVerdictRow,
} from "./task-run.js";
import type {
  TaskReviewEvidenceResult,
  TaskReviewLocator,
  TaskReviewRuleConfirmation,
} from "./task-review-evidence.js";

// Pure reduction from evidence to a verdict: no filesystem, no process. The
// executor's claim and exit code are deliberately not inputs (D-11).

/** A condition outside the criteria that acceptance also requires (14-05 supplies these). */
export interface TaskPrecondition {
  id: string;
  satisfied: boolean;
  reason: string;
  nextAction: string;
}

export interface TaskVerdict {
  overall: "accepted" | "rejected" | "unknown";
  refusal: "stale-review" | "stale-artifact" | null;
  rows: TaskVerdictRow[];
  preconditions: TaskPrecondition[];
}

export interface TaskReviewRowAssessment {
  verdict: "pass" | "fail" | "unknown";
  severity: "blocking" | "advisory";
  evidence: string;
  locator?: TaskReviewLocator | null | undefined;
  abstainReason: string | null;
  finding: {
    summary: string;
    reproduction: TaskReviewReproduction | null;
    ruleConfirmation?: TaskReviewRuleConfirmation | null | undefined;
  } | null;
}

export interface TaskReviewAssessment {
  status: "ok" | "missing" | "stale" | "malformed";
  issues: string[];
  rows: Map<string, TaskReviewRowAssessment>;
  /** Out-of-scope notes; they never affect a verdict. */
  suggestions: string[];
}

export type TaskNextActionCause =
  | "entry-missing"
  | "timeout"
  | "output-capped"
  | "spawn-failed"
  | "review-missing"
  | "review-malformed"
  | "stale"
  | "abstain"
  | "unconfirmed-fail"
  | "precondition";

export interface TaskNextActionContext {
  artifactDigest?: string;
  entry?: string;
  abstainReason?: string;
  precondition?: TaskPrecondition;
}

/** Bounds on reviewer text, in characters. */
const REVIEW_BOUNDS = {
  evidence: 2000,
  findingSummary: 1000,
  reproductionText: 4096,
  suggestions: 20,
  suggestion: 500,
} as const;

function bounded(text: string, limit: number): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 3)}...`;
}

function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function emptyAssessment(status: TaskReviewAssessment["status"], issues: readonly string[]): TaskReviewAssessment {
  return { status, issues: [...issues], rows: new Map(), suggestions: [] };
}

/**
 * Decides whether a schema-valid review report may be used at all. Binding is
 * checked first: a report answering another request, contract, artifact or
 * reviewer session is stale however well-formed it is (T-14-16).
 */
export function assessTaskReview(input: {
  report: TaskReviewReport | null;
  request: Pick<ReviewRequest, "requestId" | "sessionId" | "contractDigest" | "artifactDigest"> & {
    targetRevisionSha?: string | undefined;
  };
  portSessionId: string | null;
  contract: TaskContract;
  /** Issues the reviewer port reported. */
  issues?: readonly string[];
  /** Why a received report failed schema validation, when it did. */
  rejected?: string | null;
  /** Evidence resolution result, if run. */
  evidenceResult?: TaskReviewEvidenceResult | undefined;
}): TaskReviewAssessment {
  const portIssues = input.issues ?? [];
  if (input.rejected !== undefined && input.rejected !== null) {
    return emptyAssessment("malformed", [...portIssues, input.rejected]);
  }
  const report = input.report;
  if (report === null) {
    return emptyAssessment("missing", portIssues.length === 0 ? ["the reviewer returned no report"] : portIssues);
  }

  const stale: string[] = [];
  if (report.schemaVersion === 1) stale.push("the report uses legacy schemaVersion 1; v2 with verifiable evidence locators is required");
  if (report.requestId !== input.request.requestId) stale.push("the report answers a different review request");
  if (report.contractId !== input.contract.id) stale.push("the report names a different contract");
  if (report.contractDigest !== input.request.contractDigest) stale.push("the report is bound to a different contract digest");
  if (report.artifactDigest !== input.request.artifactDigest) stale.push("the report is bound to a different artifact digest");
  if (
    report.schemaVersion === 2 &&
    input.request.targetRevisionSha !== undefined &&
    report.targetRevisionSha !== input.request.targetRevisionSha
  ) {
    stale.push("the report is bound to a different target revision SHA");
  }
  if (input.portSessionId !== input.request.sessionId) stale.push("the report came from a reviewer session other than the requested one");
  if (stale.length > 0) return emptyAssessment("stale", stale);

  if (input.evidenceResult !== undefined && !input.evidenceResult.valid) {
    return emptyAssessment("malformed", input.evidenceResult.issues.map((issue) => issue.message));
  }

  const known = new Set(input.contract.criterion.map((criterion) => criterion.id));
  const malformed: string[] = [];
  const rows = new Map<string, TaskReviewRowAssessment>();
  for (const [index, row] of report.criteria.entries()) {
    const at = `criteria/${index}`;
    if (!known.has(row.criterionId)) malformed.push(`${at} names no contract criterion`);
    else if (rows.has(row.criterionId)) malformed.push(`${at} repeats criterion ${row.criterionId}`);
    if (row.evidence.length > REVIEW_BOUNDS.evidence) malformed.push(`${at} evidence exceeds ${REVIEW_BOUNDS.evidence} characters`);
    const finding = row.finding;
    if (finding !== null) {
      if (finding.summary.length > REVIEW_BOUNDS.findingSummary) {
        malformed.push(`${at} finding summary exceeds ${REVIEW_BOUNDS.findingSummary} characters`);
      }
      const reproduction = finding.reproduction;
      if (
        reproduction !== null &&
        (reproduction.inputText.length > REVIEW_BOUNDS.reproductionText ||
          reproduction.observedStdout.length > REVIEW_BOUNDS.reproductionText)
      ) {
        malformed.push(`${at} reproduction text exceeds ${REVIEW_BOUNDS.reproductionText} characters`);
      }
    }
    if (known.has(row.criterionId) && !rows.has(row.criterionId)) {
      rows.set(row.criterionId, {
        verdict: row.verdict,
        severity: row.severity,
        evidence: row.evidence,
        locator: row.locator ?? null,
        abstainReason: row.abstainReason,
        finding:
          finding === null
            ? null
            : {
                summary: finding.summary,
                reproduction:
                  finding.reproduction === null
                    ? null
                    : {
                        inputText: finding.reproduction.inputText,
                        observedExitCode: finding.reproduction.observedExitCode,
                        observedStdout: finding.reproduction.observedStdout,
                      },
                ruleConfirmation:
                  finding.ruleConfirmation === null || finding.ruleConfirmation === undefined
                    ? null
                    : {
                        ruleId: finding.ruleConfirmation.ruleId,
                        ruleSource: finding.ruleConfirmation.ruleSource ?? null,
                        inspectedPath: finding.ruleConfirmation.inspectedPath,
                        observedViolation: finding.ruleConfirmation.observedViolation,
                      },
              },
      });
    }
  }
  for (const criterion of input.contract.criterion) {
    if (!rows.has(criterion.id)) {
      malformed.push(`the report is missing a verdict for contract criterion ${criterion.id}`);
    }
  }
  if (report.suggestions.length > REVIEW_BOUNDS.suggestions) {
    malformed.push(`the report carries more than ${REVIEW_BOUNDS.suggestions} suggestions`);
  }
  if (report.suggestions.some((suggestion) => suggestion.length > REVIEW_BOUNDS.suggestion)) {
    malformed.push(`a suggestion exceeds ${REVIEW_BOUNDS.suggestion} characters`);
  }
  if (malformed.length > 0) return emptyAssessment("malformed", malformed);
  return { status: "ok", issues: [...portIssues], rows, suggestions: [...report.suggestions] };
}

/** The fixed next-action sentence for each reason a criterion stays unknown (D-15). */
export function taskNextAction(cause: TaskNextActionCause, context: TaskNextActionContext = {}): string {
  const artifact = (context.artifactDigest ?? "").slice(0, 12) || "unknown";
  switch (cause) {
    case "entry-missing":
      return `The controller did not produce the measurement entry${context.entry === undefined ? "" : ` ${context.entry}`}; re-run the task or record a measurement-substitute decision naming an entry inside the allowed roots.`;
    case "timeout":
      return "The program exceeded the measurement bound; re-run after fixing the hang.";
    case "output-capped":
      return "The output exceeded 64 KiB; fix the output or clarify the criterion.";
    case "spawn-failed":
      return "Repair the Node environment and re-run.";
    case "review-missing":
    case "review-malformed":
      return `Re-run the review on artifact ${artifact}.`;
    case "stale":
      return `Re-run the review on the current artifact ${artifact}.`;
    case "abstain":
      return `Clarify the criterion or re-run the review; the reviewer abstained: "${bounded(context.abstainReason ?? "no reason given", 300)}".`;
    case "unconfirmed-fail":
      return `Inspect the finding and re-run the review on artifact ${artifact}; alpha-AOS could not reproduce it.`;
    case "precondition":
      return context.precondition?.nextAction ?? "Satisfy the unmet precondition and re-run.";
  }
}

/**
 * Measurement decides failure; review can only confirm a measured pass, and a
 * reviewer failure overturns it only when alpha-AOS reproduced the finding
 * itself (D-14). Everything unresolved is `unknown` with a next action (D-15).
 */
export function reduceTaskVerdict(input: {
  contract: TaskContract;
  artifactDigest: string;
  measurements: readonly TaskMeasurement[];
  review: TaskReviewAssessment;
  confirmations: ReadonlyMap<string, TaskReproductionConfirmation>;
  preconditions: readonly TaskPrecondition[];
  refusal: "stale-artifact" | null;
}): TaskVerdict {
  const { artifactDigest, review } = input;
  const refusal: TaskVerdict["refusal"] = input.refusal ?? (review.status === "stale" ? "stale-review" : null);
  const usable = review.status === "ok";
  const reviewCause: TaskNextActionCause =
    review.status === "stale" ? "stale" : review.status === "malformed" ? "review-malformed" : "review-missing";
  const ids = input.contract.criterion.map((criterion) => criterion.id).sort(byCodeUnit);

  const rows = ids.map((criterionId): TaskVerdictRow => {
    const criterion = input.contract.criterion.find((entry) => entry.id === criterionId);
    const measured = input.measurements.find((entry) => entry.criterionId === criterionId);
    if (criterion === undefined || measured === undefined) {
      throw new Error(`Verdict refused: criterion ${criterionId} has no measurement.`);
    }
    const reviewed = usable ? (review.rows.get(criterionId) ?? null) : null;
    const confirmation = reviewed === null ? undefined : input.confirmations.get(criterionId);
    const reviewRecord =
      reviewed === null
        ? null
        : {
            verdict: reviewed.verdict,
            severity: reviewed.severity,
            evidence: reviewed.evidence,
            locator: reviewed.locator ?? null,
            confirmed: confirmation === undefined ? null : confirmation.confirmed,
            confirmationDetail: confirmation === undefined ? null : confirmation.detail,
          };
    const row = (verdict: TaskVerdictRow["verdict"], reason: string, nextAction: string | null): TaskVerdictRow => ({
      criterionId,
      verdict,
      measured,
      review: reviewRecord,
      artifactDigest,
      reason: bounded(reason, 1000),
      nextAction,
    });
    const entry = criterion.measurement.kind === "cli-json" ? criterion.measurement.entry : criterion.measurement.itemId;
    const context = { artifactDigest, entry };

    if (measured.outcome === "fail") {
      return row("fail", `Measured fail: ${measured.detail}${reviewRecord === null ? "" : ` Review: ${reviewRecord.verdict}.`}`, null);
    }
    if (measured.outcome === "unavailable") {
      const cause: TaskNextActionCause = measured.cause === "none" ? "spawn-failed" : measured.cause;
      return row("unknown", `Measurement unavailable (${measured.cause}): ${measured.detail}`, taskNextAction(cause, context));
    }
    if (input.refusal === "stale-artifact") {
      return row("unknown", "Measured pass, but the artifact changed after it was measured.", taskNextAction("stale", context));
    }
    if (!usable) {
      const why = review.issues[0] ?? `the review is ${review.status}`;
      return row("unknown", `Measured pass; the review is ${review.status}: ${why}.`, taskNextAction(reviewCause, context));
    }
    if (reviewed === null) {
      return row("unknown", "Measured pass; the review has no verdict for this criterion.", taskNextAction("review-missing", context));
    }
    if (reviewed.verdict === "pass") return row("pass", "Measured pass; review pass.", null);
    if (reviewed.verdict === "unknown") {
      const abstainReason = reviewed.abstainReason ?? reviewed.evidence;
      return row(
        "unknown",
        `Measured pass; the reviewer abstained: ${abstainReason}`,
        taskNextAction("abstain", { ...context, abstainReason }),
      );
    }
    const reproducible =
      reviewed.severity === "blocking" &&
      reviewed.finding !== null &&
      (reviewed.finding.reproduction !== null ||
        (reviewed.finding.ruleConfirmation !== null && reviewed.finding.ruleConfirmation !== undefined));
    if (reproducible && confirmation?.confirmed === true) {
      return row(
        "fail",
        `Measured pass, but the reviewer's blocking finding was reproduced by alpha-AOS: ${reviewed.finding?.summary ?? reviewed.evidence}`,
        null,
      );
    }
    const unconfirmed =
      reviewed.severity === "advisory"
        ? "the failure is advisory"
        : reviewed.finding === null ||
            (reviewed.finding.reproduction === null &&
              (reviewed.finding.ruleConfirmation === null || reviewed.finding.ruleConfirmation === undefined))
          ? "the failure carries no reproduction or rule confirmation"
          : `alpha-AOS could not reproduce it (${confirmation?.detail ?? "not attempted"})`;
    return row("unknown", `Measured pass; review fail, but ${unconfirmed}.`, taskNextAction("unconfirmed-fail", context));
  });

  const preconditions = input.preconditions.map((entry) => ({ ...entry }));
  const overall: TaskVerdict["overall"] = rows.some((row) => row.verdict === "fail")
    ? "rejected"
    : rows.some((row) => row.verdict === "unknown") || preconditions.some((entry) => !entry.satisfied) || refusal !== null
      ? "unknown"
      : "accepted";
  return { overall, refusal, rows, preconditions };
}
