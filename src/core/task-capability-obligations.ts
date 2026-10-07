import { createHash } from "node:crypto";
import type { TaskContract } from "./task-contract.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";
import type { TaskCapabilityReceipt } from "./task-capability-receipts.js";
import type { TaskCapabilityInventory } from "../types.js";

/**
 * Where a capability obligation is selected, invoked and checked (CAP-03).
 * `review` is a separate dispatch boundary, not a GSD step, so `GsdStepKind`
 * stays exactly the four GSD lifecycle steps.
 */
export type CapabilityBoundary = GsdStepKind | "review";

export const CAPABILITY_BOUNDARIES: readonly CapabilityBoundary[] = ["discuss", "plan", "execute", "review", "verify"];

/**
 * Boundaries that exist to check work independently. A result proven at an
 * earlier boundary must never stand in for them (18-08 prohibition), so they
 * always require a fresh invocation instead of D-09 reuse.
 */
const INDEPENDENT_CHECK_BOUNDARIES: ReadonlySet<CapabilityBoundary> = new Set<CapabilityBoundary>(["review", "verify"]);

/**
 * A deterministic obligation to invoke and observe a capability at a specific GSD boundary (CAP-03).
 */
export interface TaskCapabilityObligation {
  readonly id: string;
  readonly capabilityId: string;
  readonly step: CapabilityBoundary;
  readonly question: string;
  readonly required: boolean;
  readonly scope: string;
  readonly source: string;
  readonly version: string;
  readonly originalReceiptId?: string | null | undefined;
  /** D-09: Linked original receipt if this obligation reuses verified prior results */
  readonly reusedFromReceiptId?: string | null | undefined;
  /** Explicit reason why this capability was selected or reused */
  readonly selectionReason?: string | undefined;
  /** Deterministic deduplication key across step, capability, source, version, question */
  readonly duplicateKey?: string | undefined;
}

/**
 * Record of an obligation omitted due to D-07 (project skill priority over global skill).
 */
export interface OmittedCapabilityObligation {
  readonly capabilityId: string;
  readonly supersededByCapabilityId: string;
  readonly reason: string;
  readonly question: string;
}

export interface SelectStepObligationsOptions {
  readonly contract?: TaskContract | undefined;
  readonly step: CapabilityBoundary;
  readonly projectRoot: string;
  readonly phaseId?: string | undefined;
  readonly planId?: string | undefined;
  readonly question?: string | undefined;
  readonly files?: readonly string[] | undefined;
  readonly repositoryFiles?: readonly string[] | undefined;
  readonly inventory?: TaskCapabilityInventory | undefined;
  readonly priorReceipts?: readonly TaskCapabilityReceipt[] | undefined;
  readonly ambiguityResolved?: boolean | undefined;
}

export interface StepObligationsDecision {
  readonly status: "ready" | "needs-input";
  readonly obligations: readonly TaskCapabilityObligation[];
  readonly omitted: readonly OmittedCapabilityObligation[];
  readonly needsInputReason?: string | undefined;
  readonly missingEvidence?: readonly string[] | undefined;
}

const DOC_LOOKUP_PATTERN = /\b(?:documentation-lookup|context7|api\s+docs?|documentation|library\s+version|version-specific)\b/iu;
const DEEP_RESEARCH_PATTERN = /\b(?:deep-research|exa|firecrawl|external\s+examples?|recent\s+cases?|web\s+research|industry\s+patterns?)\b/iu;
const AMBIGUOUS_PATTERN = /\b(?:if\s+needed|optional|consider\s+looking|unclear\s+whether\s+required)\b/iu;

function extractQuestionFromContract(contract: TaskContract, pattern: RegExp, step?: CapabilityBoundary): string | null {
  if (step === "review") {
    // For review boundary, question must be review-scoped (in goal with 'review' or in a review criterion)
    if (pattern.test(contract.goal) && /\breview\b/iu.test(contract.goal)) {
      return contract.goal;
    }
    for (const criterion of contract.criterion) {
      const isReviewCriterion =
        criterion.id.includes("review") ||
        /\breview\b/iu.test(criterion.title) ||
        /\breview\b/iu.test(criterion.description);
      if (isReviewCriterion && (pattern.test(criterion.id) || pattern.test(criterion.description) || pattern.test(criterion.title))) {
        return criterion.description;
      }
    }
    return null;
  }

  if (pattern.test(contract.goal)) {
    return contract.goal;
  }
  for (const criterion of contract.criterion) {
    if (pattern.test(criterion.id) || pattern.test(criterion.description) || pattern.test(criterion.title)) {
      return criterion.description;
    }
  }
  return null;
}

function findReusableReceipt(
  obligation: { capabilityId: string; source: string; version: string; scope: string; question: string },
  priorReceipts: readonly TaskCapabilityReceipt[] | undefined,
): TaskCapabilityReceipt | null {
  if (!priorReceipts || priorReceipts.length === 0) return null;
  for (const r of priorReceipts) {
    if (
      r.capabilityId === obligation.capabilityId &&
      r.source === obligation.source &&
      r.sourceVersion === obligation.version &&
      r.question === obligation.question &&
      r.outcome === "ok" &&
      typeof r.receiptDigest === "string" &&
      r.receiptDigest.length > 0
    ) {
      return r;
    }
  }
  return null;
}

/**
 * Evaluates capability obligations for a specific GSD step with D-06..D-09 decision rules.
 */
export function evaluateStepObligations(
  options: SelectStepObligationsOptions,
): StepObligationsDecision {
  const obligations: TaskCapabilityObligation[] = [];
  const omitted: OmittedCapabilityObligation[] = [];

  // D-08: Check for ambiguity in task description
  const contractGoal = options.contract?.goal ?? "";
  if (AMBIGUOUS_PATTERN.test(contractGoal) && !options.ambiguityResolved) {
    const hasRepoEvidence = options.repositoryFiles && options.repositoryFiles.length > 0;
    if (!hasRepoEvidence) {
      return {
        status: "needs-input",
        obligations: [],
        omitted: [],
        needsInputReason:
          "Mandatory capability requirement is ambiguous from contract description and repository evidence; awaiting user input.",
        missingEvidence: [
          `Explicit confirmation of whether capability invocation is mandatory for step ${options.step}`,
        ],
      };
    }
  }

  // Extract questions
  let docQuestion: string | null = null;
  let researchQuestion: string | null = null;

  if (options.question !== undefined) {
    if (DOC_LOOKUP_PATTERN.test(options.question)) {
      docQuestion = options.question;
    }
    if (DEEP_RESEARCH_PATTERN.test(options.question)) {
      researchQuestion = options.question;
    }
    if (!docQuestion && !researchQuestion) {
      docQuestion = options.question;
    }
  } else if (options.contract) {
    docQuestion = extractQuestionFromContract(options.contract, DOC_LOOKUP_PATTERN, options.step);
    researchQuestion = extractQuestionFromContract(options.contract, DEEP_RESEARCH_PATTERN, options.step);
  }

  // Check inventory for approved project skills that might supersede global skills (D-07)
  const approvedProjectSkills = (options.inventory?.items ?? []).filter(
    (item) => item.kind === "ecc-project-skill" && item.selected,
  );

  // Check if any project skill covers the documentation question
  let projectSkillCoveringDoc: string | null = null;
  for (const projSkill of approvedProjectSkills) {
    const skillName = projSkill.name.toLowerCase();
    const skillShort = projSkill.id.split(":").pop()?.toLowerCase() ?? "";
    if (
      DOC_LOOKUP_PATTERN.test(projSkill.name) ||
      projSkill.id.includes("doc") ||
      (docQuestion !== null &&
        (docQuestion.toLowerCase().includes(skillName) ||
          (skillShort.length > 0 && docQuestion.toLowerCase().includes(skillShort))))
    ) {
      projectSkillCoveringDoc = projSkill.id;
      break;
    }
  }

  // CAP-03: every boundary evaluates the task's questions, not only execute.
  // Independent check boundaries never reuse an earlier result (D-09 limit).
  const reusableFrom = INDEPENDENT_CHECK_BOUNDARIES.has(options.step) ? undefined : options.priorReceipts;

  if (docQuestion !== null || researchQuestion !== null) {
    // Documentation-lookup evaluation
    if (docQuestion !== null) {
      if (projectSkillCoveringDoc !== null) {
        // D-07: Project skill takes precedence on the same question
        omitted.push({
          capabilityId: "documentation-lookup",
          supersededByCapabilityId: projectSkillCoveringDoc,
          reason: `Approved project skill ${projectSkillCoveringDoc} supersedes global documentation-lookup for the same requirement.`,
          question: docQuestion,
        });

        const questionDigest = createHash("sha256").update(docQuestion, "utf8").digest("hex").slice(0, 12);
        const candidate = {
          capabilityId: projectSkillCoveringDoc,
          source: "project-pack",
          version: "project",
          scope: options.projectRoot,
          question: docQuestion,
        };
        const reusable = findReusableReceipt(candidate, reusableFrom);
        const duplicateKey = `${options.step}:${candidate.capabilityId}:${candidate.source}:${candidate.version}:${questionDigest.slice(0, 8)}`;

        obligations.push({
          id: `ob-${options.step}-${projectSkillCoveringDoc.replace(/[:/]/g, "-")}-${questionDigest}`,
          capabilityId: projectSkillCoveringDoc,
          step: options.step,
          question: docQuestion,
          required: true,
          scope: options.projectRoot,
          source: candidate.source,
          version: candidate.version,
          originalReceiptId: reusable?.receiptId ?? null,
          reusedFromReceiptId: reusable?.receiptId ?? null,
          selectionReason: reusable
            ? `Reusing verified successful receipt ${reusable.receiptId} from step ${reusable.step} (D-09).`
            : "Approved project-scoped skill selected in preference to global skill (D-07).",
          duplicateKey,
        });
      } else {
        // Standard global documentation-lookup
        const questionDigest = createHash("sha256").update(docQuestion, "utf8").digest("hex").slice(0, 12);
        const candidate = {
          capabilityId: "documentation-lookup",
          source: "context7",
          version: "stable",
          scope: options.projectRoot,
          question: docQuestion,
        };
        const reusable = findReusableReceipt(candidate, reusableFrom);
        const duplicateKey = `${options.step}:${candidate.capabilityId}:${candidate.source}:${candidate.version}:${questionDigest.slice(0, 8)}`;

        obligations.push({
          id: `ob-${options.step}-documentation-lookup-${questionDigest}`,
          capabilityId: "documentation-lookup",
          step: options.step,
          question: docQuestion,
          required: true,
          scope: options.projectRoot,
          source: candidate.source,
          version: candidate.version,
          originalReceiptId: reusable?.receiptId ?? null,
          reusedFromReceiptId: reusable?.receiptId ?? null,
          selectionReason: reusable
            ? `Reusing verified successful receipt ${reusable.receiptId} from step ${reusable.step} (D-09).`
            : "Required version-specific API documentation lookup via Context7.",
          duplicateKey,
        });
      }
    }

    // D-06: Deep research evaluation (distinct research path)
    if (researchQuestion !== null) {
      const questionDigest = createHash("sha256").update(researchQuestion, "utf8").digest("hex").slice(0, 12);
      const candidate = {
        capabilityId: "deep-research",
        source: "exa",
        version: "stable",
        scope: options.projectRoot,
        question: researchQuestion,
      };
      const reusable = findReusableReceipt(candidate, reusableFrom);
      const duplicateKey = `${options.step}:${candidate.capabilityId}:${candidate.source}:${candidate.version}:${questionDigest.slice(0, 8)}`;

      obligations.push({
        id: `ob-${options.step}-deep-research-${questionDigest}`,
        capabilityId: "deep-research",
        step: options.step,
        question: researchQuestion,
        required: true,
        scope: options.projectRoot,
        source: candidate.source,
        version: candidate.version,
        originalReceiptId: reusable?.receiptId ?? null,
        reusedFromReceiptId: reusable?.receiptId ?? null,
        selectionReason: reusable
          ? `Reusing verified successful receipt ${reusable.receiptId} from step ${reusable.step} (D-09).`
          : "Required external research and case study discovery via Exa (D-06).",
        duplicateKey,
      });
    }
  }

  // Deduplicate obligations by duplicateKey
  const uniqueObligations: TaskCapabilityObligation[] = [];
  const seenKeys = new Set<string>();
  for (const ob of obligations) {
    const key = ob.duplicateKey ?? ob.id;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    uniqueObligations.push(ob);
  }

  return {
    status: "ready",
    obligations: uniqueObligations,
    omitted,
  };
}

/**
 * Deterministically selects capability obligations for a specific GSD step (CAP-03).
 */
export function selectStepObligations(
  options: SelectStepObligationsOptions,
): readonly TaskCapabilityObligation[] {
  const decision = evaluateStepObligations(options);
  return decision.obligations;
}
