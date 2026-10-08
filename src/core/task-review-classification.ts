import { isApprovedArchitectureRule, type TaskReproductionConfirmation } from "./task-check.js";
import type { TaskContract, TaskCriterion } from "./task-contract.js";
import type {
  TaskReviewCriterion,
  TaskReviewFinding,
  TaskReviewReportV2,
  TaskReviewRuleConfirmation,
} from "./task-review-evidence.js";

/**
 * High-level defect kind distinguishing missing functionality, approved rule
 * violations, reliability threats, and stylistic or unrelated proposals (D-05, D-06, D-07).
 */
export type DefectClassificationKind =
  | "missing-requirement"
  | "architecture-rule-violation"
  | "reliability-threat"
  | "style-preference"
  | "unrelated-proposal"
  | "unclassified";

/** Scope relative to the approved task contract (D-06, D-08). */
export type DefectScope = "in-scope" | "out-of-scope";

/** Effective severity determining whether the defect blocks acceptance (D-05, D-07). */
export type DefectEffectiveSeverity = "blocking" | "advisory";

/** How the defect was independently corroborated by alpha-AOS (D-02, D-07). */
export type DefectConfirmationMethod =
  | "reproduction"
  | "direct-inspection"
  | "deterministic-check"
  | "none";

/** Structured classification for one reported finding (REV-02, REV-05). */
export interface TaskDefectClassification {
  readonly criterionId: string;
  readonly kind: DefectClassificationKind;
  readonly scope: DefectScope;
  readonly severity: DefectEffectiveSeverity;
  readonly isBlocking: boolean;
  readonly approvedRuleBinding: {
    readonly ruleId: string;
    readonly approved: boolean;
    readonly ruleSource: string | null;
  } | null;
  readonly violationLocation: {
    readonly path: string;
    readonly exists: boolean;
    readonly lineRange: string | null;
  } | null;
  readonly confirmationMethod: DefectConfirmationMethod;
  readonly confirmed: boolean;
  readonly reason: string;
  readonly suggestionEligible: boolean;
}

/** Aggregate classification result for an entire review report. */
export interface TaskReviewClassificationResult {
  readonly classifications: readonly TaskDefectClassification[];
  readonly hasBlockingDefects: boolean;
  readonly blockingCount: number;
  readonly advisoryCount: number;
  readonly suggestionsToDefer: readonly {
    readonly criterionId: string;
    readonly summary: string;
    readonly reason: string;
  }[];
}

/** Options for classifying a single reported defect. */
export interface ClassifyDefectOptions {
  readonly criterion: TaskCriterion;
  readonly criterionReview: TaskReviewCriterion;
  readonly contract: TaskContract;
  readonly confirmation?: TaskReproductionConfirmation | undefined;
  readonly knownApprovedRules?: readonly string[] | undefined;
}

/** Options for classifying an entire review report. */
export interface ClassifyReviewReportOptions {
  readonly report: TaskReviewReportV2;
  readonly contract: TaskContract;
  readonly confirmations: ReadonlyMap<string, TaskReproductionConfirmation>;
  readonly knownApprovedRules?: readonly string[];
}

const STYLE_KEYWORDS = [
  /\bstyle\b/i,
  /\bformatting\b/i,
  /\bindent(ation)?\b/i,
  /\bwhitespace\b/i,
  /\bnaming convention\b/i,
  /\bnaming style\b/i,
  /\bprettier\b/i,
  /\beslint\b/i,
  /\bprefer const\b/i,
  /\bsemicolon\b/i,
  /\bline length\b/i,
  /\bquote style\b/i,
  /\bcasing\b/i,
];

const RELIABILITY_KEYWORDS = [
  /\bundermines?\b/i,
  /\bcorrupts?\b/i,
  /\binvalidates? evidence\b/i,
  /\bflaky\b/i,
  /\bdata loss\b/i,
  /\bcrash\b/i,
  /\bhang\b/i,
  /\bmemory leak\b/i,
  /\bbroken test\b/i,
  /\breliability threat\b/i,
  /\bunreliable results?\b/i,
];

/**
 * Checks whether text reflects purely stylistic preferences rather than
 * correctness or approved architectural constraints (D-05, D-07).
 */
export function isStylePreference(text: string): boolean {
  if (typeof text !== "string" || text.trim().length === 0) return false;
  return STYLE_KEYWORDS.some((re) => re.test(text));
}

/**
 * Checks whether text describes a reliability threat that undermines current
 * results or evidence, even if pre-existing or out-of-scope (D-06).
 */
export function isReliabilityThreat(text: string): boolean {
  if (typeof text !== "string" || text.trim().length === 0) return false;
  return RELIABILITY_KEYWORDS.some((re) => re.test(text));
}

/**
 * Classifies a single reported defect according to approved rules, location,
 * independent confirmation, and severity/scope constraints (D-02, D-05..D-07).
 */
export function classifyTaskDefect(options: ClassifyDefectOptions): TaskDefectClassification {
  const { criterion, criterionReview, contract, confirmation, knownApprovedRules } = options;
  const finding = criterionReview.finding;

  // If there is no finding or the verdict passed, no defect exists
  if (finding === null || criterionReview.verdict === "pass") {
    return {
      criterionId: criterion.id,
      kind: "unclassified",
      scope: "in-scope",
      severity: "advisory",
      isBlocking: false,
      approvedRuleBinding: null,
      violationLocation: null,
      confirmationMethod: "none",
      confirmed: false,
      reason: "No failure finding reported for this criterion.",
      suggestionEligible: false,
    };
  }

  const findingSummary = finding.summary || "";
  const findingScope: DefectScope = finding.scope === "out-of-scope" ? "out-of-scope" : "in-scope";
  const ruleConf = finding.ruleConfirmation ?? null;
  const repro = finding.reproduction ?? null;

  // 1. Style preferences are ALWAYS advisory and NEVER block (D-05, D-07)
  const isStyle = isStylePreference(findingSummary) || (ruleConf !== null && isStylePreference(ruleConf.observedViolation));
  if (isStyle && ruleConf === null && repro === null) {
    return {
      criterionId: criterion.id,
      kind: "style-preference",
      scope: findingScope,
      severity: "advisory",
      isBlocking: false,
      approvedRuleBinding: null,
      violationLocation: null,
      confirmationMethod: "none",
      confirmed: false,
      reason: "Style preferences and cosmetic suggestions are classified as advisory and do not block acceptance.",
      suggestionEligible: true,
    };
  }

  // 2. Architectural rule violation (D-02, D-07)
  if (ruleConf !== null) {
    const isApproved = isApprovedArchitectureRule(ruleConf.ruleId, knownApprovedRules);
    const confirmed = confirmation?.confirmed === true;
    const hasImpact =
      ruleConf.impact !== undefined
        ? Boolean(ruleConf.impact?.trim() || finding.impact?.trim())
        : Boolean(findingSummary.trim() || ruleConf.observedViolation.trim());
    const method: DefectConfirmationMethod = ruleConf.checkDescriptor ? "deterministic-check" : "direct-inspection";

    // To be blocking, architectural defects REQUIRE:
    // (1) An approved rule ID (D-07)
    // (2) An inspected path within the snapshot (D-02)
    // (3) Clear impact (D-07)
    // (4) Independent controller/alpha-AOS confirmation (D-02)
    if (!isApproved) {
      return {
        criterionId: criterion.id,
        kind: "architecture-rule-violation",
        scope: findingScope,
        severity: "advisory",
        isBlocking: false,
        approvedRuleBinding: { ruleId: ruleConf.ruleId, approved: false, ruleSource: ruleConf.ruleSource ?? null },
        violationLocation: { path: ruleConf.inspectedPath, exists: confirmed, lineRange: null },
        confirmationMethod: method,
        confirmed: false,
        reason: `The rule '${ruleConf.ruleId}' is not an approved architectural or safety rule; unapproved rule claims cannot block acceptance.`,
        suggestionEligible: true,
      };
    }

    if (!hasImpact) {
      return {
        criterionId: criterion.id,
        kind: "architecture-rule-violation",
        scope: findingScope,
        severity: "advisory",
        isBlocking: false,
        approvedRuleBinding: { ruleId: ruleConf.ruleId, approved: true, ruleSource: ruleConf.ruleSource ?? null },
        violationLocation: { path: ruleConf.inspectedPath, exists: confirmed, lineRange: null },
        confirmationMethod: method,
        confirmed: false,
        reason: "The reported architectural rule violation does not specify an impact; uncorroborated claims cannot block.",
        suggestionEligible: true,
      };
    }

    if (!confirmed) {
      return {
        criterionId: criterion.id,
        kind: "architecture-rule-violation",
        scope: findingScope,
        severity: "advisory",
        isBlocking: false,
        approvedRuleBinding: { ruleId: ruleConf.ruleId, approved: true, ruleSource: ruleConf.ruleSource ?? null },
        violationLocation: { path: ruleConf.inspectedPath, exists: false, lineRange: null },
        confirmationMethod: method,
        confirmed: false,
        reason: `alpha-AOS could not independently corroborate the architectural rule violation (${confirmation?.detail ?? "unconfirmed"}).`,
        suggestionEligible: false,
      };
    }

    // All four requirements satisfied -> blocking architectural defect
    return {
      criterionId: criterion.id,
      kind: "architecture-rule-violation",
      scope: "in-scope",
      severity: "blocking",
      isBlocking: true,
      approvedRuleBinding: { ruleId: ruleConf.ruleId, approved: true, ruleSource: ruleConf.ruleSource ?? null },
      violationLocation: { path: ruleConf.inspectedPath, exists: true, lineRange: null },
      confirmationMethod: method,
      confirmed: true,
      reason: `Confirmed architectural rule violation for rule ${ruleConf.ruleId} at ${ruleConf.inspectedPath}.`,
      suggestionEligible: false,
    };
  }

  // 3. Runnable reproduction finding (missing requirement or defect)
  if (repro !== null) {
    const confirmed = confirmation?.confirmed === true;
    const isThreat = isReliabilityThreat(findingSummary) || isReliabilityThreat(finding.impact ?? "");

    if (isThreat) {
      // D-06: Out-of-scope or pre-existing defect that undermines current evidence/results
      return {
        criterionId: criterion.id,
        kind: "reliability-threat",
        scope: findingScope,
        severity: confirmed ? "blocking" : "advisory",
        isBlocking: confirmed,
        approvedRuleBinding: null,
        violationLocation: null,
        confirmationMethod: "reproduction",
        confirmed,
        reason: confirmed
          ? "Confirmed defect undermines current result or evidence reliability (D-06)."
          : `Unconfirmed reliability threat (${confirmation?.detail ?? "reproduction failed"}).`,
        suggestionEligible: !confirmed,
      };
    }

    // Standard missing requirement or test failure
    return {
      criterionId: criterion.id,
      kind: "missing-requirement",
      scope: "in-scope",
      severity: confirmed ? "blocking" : "advisory",
      isBlocking: confirmed && criterion.mandatory,
      approvedRuleBinding: null,
      violationLocation: null,
      confirmationMethod: "reproduction",
      confirmed,
      reason: confirmed
        ? `alpha-AOS confirmed reviewer reproduction: exit ${repro.observedExitCode}.`
        : `alpha-AOS could not reproduce the reviewer's finding (${confirmation?.detail ?? "mismatched output"}).`,
      suggestionEligible: !confirmed,
    };
  }

  // 4. Free-form prose finding without reproduction or rule confirmation (D-02)
  const isThreat = isReliabilityThreat(findingSummary);
  if (isThreat) {
    return {
      criterionId: criterion.id,
      kind: "reliability-threat",
      scope: findingScope,
      severity: "advisory",
      isBlocking: false,
      approvedRuleBinding: null,
      violationLocation: null,
      confirmationMethod: "none",
      confirmed: false,
      reason: "Reliability concern reported without objective reproduction or rule confirmation; retained as advisory.",
      suggestionEligible: true,
    };
  }

  return {
    criterionId: criterion.id,
    kind: isStyle ? "style-preference" : "unrelated-proposal",
    scope: findingScope,
    severity: "advisory",
    isBlocking: false,
    approvedRuleBinding: null,
    violationLocation: null,
    confirmationMethod: "none",
    confirmed: false,
    reason: "Unconfirmed proposal or recommendation outside mandatory criteria; retained as advisory.",
    suggestionEligible: true,
  };
}

/**
 * Classifies all criteria findings in a review report and aggregates blocking
 * vs advisory outcomes (REV-02, REV-05).
 */
export function classifyReviewReport(options: ClassifyReviewReportOptions): TaskReviewClassificationResult {
  const { report, contract, confirmations, knownApprovedRules } = options;
  const classifications: TaskDefectClassification[] = [];
  const suggestionsToDefer: { criterionId: string; summary: string; reason: string }[] = [];

  for (const criterionReview of report.criteria) {
    const criterion = contract.criterion.find((c) => c.id === criterionReview.criterionId);
    if (!criterion) continue;

    const confirmation = confirmations.get(criterion.id);
    const classification = classifyTaskDefect({
      criterion,
      criterionReview,
      contract,
      confirmation,
      knownApprovedRules,
    });

    classifications.push(classification);

    if (classification.suggestionEligible && criterionReview.finding) {
      suggestionsToDefer.push({
        criterionId: criterion.id,
        summary: criterionReview.finding.summary,
        reason: classification.reason,
      });
    }
  }

  // Also include general report suggestions into deferred suggestions list (D-08)
  for (let index = 0; index < report.suggestions.length; index += 1) {
    const sug = report.suggestions[index];
    if (sug && sug.trim().length > 0) {
      suggestionsToDefer.push({
        criterionId: "general",
        summary: sug,
        reason: "Reviewer top-level recommendation outside approved task contract.",
      });
    }
  }

  const blockingCount = classifications.filter((c) => c.isBlocking).length;
  const advisoryCount = classifications.filter((c) => !c.isBlocking && c.kind !== "unclassified").length;

  return {
    classifications,
    hasBlockingDefects: blockingCount > 0,
    blockingCount,
    advisoryCount,
    suggestionsToDefer,
  };
}
