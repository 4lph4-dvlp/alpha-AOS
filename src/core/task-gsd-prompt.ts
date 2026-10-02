import type { TaskContract } from "./task-contract.js";
import type { TaskDecision } from "./task-check.js";

export interface GsdPromptEvaluation {
  readonly action: "auto-answer" | "needs-input";
  readonly answer?: string | undefined;
  readonly reason: string;
  readonly decision?: Omit<TaskDecision, "id" | "at"> | undefined;
}

export interface TaskAnswerPayload {
  readonly contractDigest: string;
  readonly questionText: string;
  readonly answerText: string;
  readonly answeredAt: string;
}

const DEPENDENCY_CHANGE_PATTERNS = [
  /\binstall\s+(?:package|dependency|module|library)\b/iu,
  /\badd\s+(?:package|dependency|module|library)\b/iu,
  /\bnpm\s+(?:install|i|add)\b/iu,
  /\byarn\s+add\b/iu,
  /\bpnpm\s+add\b/iu,
];

export function evaluateGsdPromptQuestion(
  questionText: string,
  recommendedDefault: string | null,
  contract: TaskContract,
): GsdPromptEvaluation {
  const trimmedQuestion = questionText.trim();
  const trimmedDefault = recommendedDefault?.trim() ?? "";

  // 1. Missing recommended default check (D-02, Fail-Safe)
  if (trimmedDefault === "") {
    return {
      action: "needs-input",
      reason: "No recommended default provided for ambiguous interactive question.",
    };
  }

  // 2. Dependency change check (D-02)
  const asksDependency =
    DEPENDENCY_CHANGE_PATTERNS.some((pattern) => pattern.test(trimmedQuestion)) ||
    DEPENDENCY_CHANGE_PATTERNS.some((pattern) => pattern.test(trimmedDefault));

  if (asksDependency && !contract.allowedEffects.includes("dependency-change")) {
    return {
      action: "needs-input",
      reason:
        "Interactive question requests dependency changes which are not permitted by task contract allowedEffects.",
    };
  }

  // 3. External path / root check
  if (contract.allowedRoots.length > 0) {
    // If the question explicitly refers to absolute or external drive/root path
    const pathMatch = trimmedQuestion.match(/(?:[A-Za-z]:[\\/]|^\/)(?:[^\s,;"'<>]+)/u);
    if (pathMatch) {
      const referencedPath = pathMatch[0];
      const isAllowed = contract.allowedRoots.some(
        (root) => referencedPath.startsWith(root) || referencedPath === root,
      );
      if (!isAllowed) {
        return {
          action: "needs-input",
          reason: `Interactive question requests access to path outside contract allowedRoots: ${referencedPath}`,
        };
      }
    }
  }

  // 4. In-scope routine decision: apply recommended default (D-01)
  return {
    action: "auto-answer",
    answer: trimmedDefault,
    reason: "GSD prompt auto-answered using approved recommended default within contract scope.",
    decision: {
      category: "gsd-default",
      choice: trimmedDefault,
      rationale: `GSD prompt auto-answered under approved contract: ${trimmedQuestion}`,
      criterionIds: contract.criterion.map((c) => c.id),
      substitute: null,
    },
  };
}

export function formatNeedsInputMessage(options: {
  questionText: string;
  reason: string;
  contractId: string;
  attemptIndex: number;
  runDigest?: string | undefined;
}): string {
  const digestHint = options.runDigest ? ` --run ${options.runDigest}` : "";
  return [
    `=== PAUSED: Input Needed (needs-input) ===`,
    `Task Contract: ${options.contractId} (attempt ${options.attemptIndex})`,
    `Reason: ${options.reason}`,
    `Question:`,
    `  ${options.questionText.trim()}`,
    ``,
    `To provide an answer and resume execution, run:`,
    `  alpha-aos task answer "<your answer>"${digestHint}`,
    `Or to resume without input:`,
    `  alpha-aos task resume${digestHint}`,
    `==========================================`,
  ].join("\n");
}
