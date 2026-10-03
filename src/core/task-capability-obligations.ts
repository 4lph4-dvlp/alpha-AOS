import { createHash } from "node:crypto";
import type { TaskContract } from "./task-contract.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";

/**
 * A deterministic obligation to invoke and observe a capability at a specific GSD boundary (CAP-03).
 */
export interface TaskCapabilityObligation {
  readonly id: string;
  readonly capabilityId: string;
  readonly step: GsdStepKind;
  readonly question: string;
  readonly required: boolean;
  readonly scope: string;
  readonly source: string;
  readonly version: string;
  readonly originalReceiptId?: string | null | undefined;
}

export interface SelectStepObligationsOptions {
  readonly contract?: TaskContract | undefined;
  readonly step: GsdStepKind;
  readonly projectRoot: string;
  readonly phaseId?: string | undefined;
  readonly question?: string | undefined;
  readonly files?: readonly string[] | undefined;
}

const DOC_LOOKUP_PATTERN = /(?:documentation-lookup|context7|api\s+docs?|documentation|library\s+version|version-specific)/iu;

function extractQuestionFromContract(contract: TaskContract): string | null {
  if (DOC_LOOKUP_PATTERN.test(contract.goal)) {
    return contract.goal;
  }
  for (const criterion of contract.criterion) {
    if (DOC_LOOKUP_PATTERN.test(criterion.id) || DOC_LOOKUP_PATTERN.test(criterion.description) || DOC_LOOKUP_PATTERN.test(criterion.title)) {
      return criterion.description;
    }
  }
  return null;
}

/**
 * Deterministically selects capability obligations for a specific GSD step (CAP-03).
 *
 * For the execute step, if a version-specific library/API documentation question is identified
 * from the contract or options, a mandatory documentation-lookup obligation is selected.
 */
export function selectStepObligations(
  options: SelectStepObligationsOptions,
): readonly TaskCapabilityObligation[] {
  const obligations: TaskCapabilityObligation[] = [];

  // When step is execute (or question is explicitly provided), evaluate documentation-lookup
  let question: string | null = null;
  if (options.question !== undefined) {
    question = options.question;
  } else if (options.contract) {
    question = extractQuestionFromContract(options.contract);
  }

  if (question !== null && options.step === "execute") {
    const questionDigest = createHash("sha256").update(question, "utf8").digest("hex").slice(0, 12);
    const obligationId = `ob-${options.step}-documentation-lookup-${questionDigest}`;

    obligations.push({
      id: obligationId,
      capabilityId: "documentation-lookup",
      step: options.step,
      question,
      required: true,
      scope: options.projectRoot,
      source: "context7",
      version: "stable",
    });
  }

  return obligations;
}
