import type { TaskExecutionStyle } from "./task-intake.js";
import { TASK_EXECUTION_STYLES, resolveTaskStyleAnswer } from "./task-intake.js";

export const GSD_COMMAND_STEMS = [
  "discuss-phase",
  "plan-phase",
  "execute-phase",
  "quick",
  "debug",
  "verify-work",
  "new-project",
  "new-milestone",
  "audit-milestone",
  "complete-milestone",
  "ship",
  "undo",
  "health",
  "progress",
] as const;

export type GsdCommandStem = (typeof GSD_COMMAND_STEMS)[number];

export interface ExplicitCommandRoute {
  readonly command: string;
  readonly workflow: string;
  readonly phase?: string | undefined;
  readonly arguments: readonly string[];
  readonly stoppingPoint?: string | undefined;
}

export type ExplicitIntentKind =
  | "command"
  | "style"
  | "partial"
  | "conflict"
  | "none";

export interface ExplicitTaskIntentResult {
  readonly kind: ExplicitIntentKind;
  readonly commandRoute?: ExplicitCommandRoute | undefined;
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly partialAutopilot?: boolean | undefined;
  readonly conflictReason?: string | undefined;
  readonly clarificationQuestion?: string | undefined;
  readonly missingFacts?: readonly string[] | undefined;
  readonly candidateStyles?: readonly TaskExecutionStyle[] | undefined;
}

export interface ExplicitIntentInput {
  readonly request: {
    readonly text: string;
    readonly shortGoal?: string | undefined;
    readonly shortScope?: string | undefined;
  };
  readonly explicit?: {
    readonly command?: string | undefined;
    readonly style?: string | undefined;
    readonly phase?: string | undefined;
    readonly arguments?: readonly string[] | undefined;
  } | undefined;
}

function parseCommandLine(text: string): { name: string; args: string[] } | null {
  const trimmed = text.trim();
  // Check for quoted, fenced, or explanatory mentions
  if (
    trimmed.startsWith("`") ||
    trimmed.startsWith('"') ||
    trimmed.startsWith("'") ||
    trimmed.includes("```") ||
    /^(?:for example|run|how does|what is|you can use|such as|refer to)\b/iu.test(trimmed)
  ) {
    return null;
  }

  // Standalone command invocation pattern: e.g. $gsd-discuss-phase 28, /gsd:quick foo, gsd-plan-phase 28
  const match = trimmed.match(/^(?:\$|\/)?gsd(?:-|:)([a-z0-9-]+)(?:\s+([\s\S]*))?$/iu);
  if (!match) return null;

  const rawStem = match[1]!.toLowerCase();
  const stem = GSD_COMMAND_STEMS.find((s) => s.toLowerCase() === rawStem);
  if (!stem) return null;

  const remainder = match[2]?.trim() ?? "";
  const rawArgs = remainder.length > 0 ? remainder.split(/\s+/u) : [];
  // Bound to at most 16 arguments, each up to 512 chars
  const args = rawArgs.slice(0, 16).map((a) => a.slice(0, 512));

  return { name: stem, args };
}

function isQuotedOrExplanatory(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("`") ||
    trimmed.startsWith('"') ||
    trimmed.startsWith("'") ||
    trimmed.includes("```") ||
    /^(?:for example|how does|what is|why is|explain|tell me about)\b/iu.test(trimmed)
  );
}

function extractStyleFromText(text: string): {
  exactStyle?: TaskExecutionStyle | undefined;
  partialAutopilot?: boolean | undefined;
  conflictingStyles?: TaskExecutionStyle[] | undefined;
} {
  if (isQuotedOrExplanatory(text)) {
    return {};
  }

  const lower = text.toLowerCase();

  // Check for negative style mentions like "오토파일럿은 쓰지 말고", "don't use autopilot"
  const isNegativeAutopilot =
    /오토파일럿(?:은|는|이)?\s*(?:쓰지|사용하지|말고|제외)/u.test(text) ||
    /don'?t\s+use\s+autopilot/iu.test(text) ||
    /without\s+autopilot/iu.test(text);

  // Check exact canonical IDs or Korean labels
  const detectedStyles: TaskExecutionStyle[] = [];
  for (const entry of TASK_EXECUTION_STYLES) {
    if (text.includes(entry.label) || lower.includes(entry.id)) {
      detectedStyles.push(entry.id);
    }
  }

  const filteredStyles = detectedStyles.filter((style) => {
    const hasLongerContainer = detectedStyles.some((other) => {
      if (other === style) return false;
      const otherEntry = TASK_EXECUTION_STYLES.find((e) => e.id === other)!;
      const thisEntry = TASK_EXECUTION_STYLES.find((e) => e.id === style)!;
      return otherEntry.label.includes(thisEntry.label) || otherEntry.id.includes(thisEntry.id);
    });
    return !hasLongerContainer;
  });

  if (filteredStyles.length > 1) {
    return { conflictingStyles: filteredStyles };
  }

  if (filteredStyles.length === 1) {
    return { exactStyle: filteredStyles[0] };
  }

  // Check partial autopilot intent
  if (
    !isNegativeAutopilot &&
    (text.includes("오토파일럿") || lower.includes("autopilot"))
  ) {
    return { partialAutopilot: true };
  }

  return {};
}

export function normalizeExplicitTaskIntent(
  input: ExplicitIntentInput,
): ExplicitTaskIntentResult {
  let explicitCommandRoute: ExplicitCommandRoute | undefined;
  let explicitStyle: TaskExecutionStyle | undefined;
  let isPartialAutopilot = false;
  let conflictingStylesFound: TaskExecutionStyle[] | undefined;

  // 1. Process explicit metadata if supplied
  if (input.explicit?.command) {
    const rawCmd = input.explicit.command.trim().replace(/^(?:\$|\/)?gsd(?:-|:)/iu, "").toLowerCase();
    const stem = GSD_COMMAND_STEMS.find((s) => s.toLowerCase() === rawCmd);
    if (stem) {
      const args = (input.explicit.arguments ?? []).slice(0, 16).map((a) => a.slice(0, 512));
      let phase = input.explicit.phase;
      if (!phase) {
        const phaseCandidate = args.find((a) => /^[0-9]+[a-z]?(\.[0-9]+)*$/iu.test(a));
        if (phaseCandidate) phase = phaseCandidate;
      }
      let stoppingPoint: string | undefined;
      if (stem === "discuss-phase") stoppingPoint = "discuss:post";
      else if (stem === "plan-phase") stoppingPoint = "plan:post";
      else if (stem === "execute-phase") stoppingPoint = "execute:post";

      explicitCommandRoute = {
        command: `gsd-${stem}`,
        workflow: stem,
        phase,
        arguments: args,
        stoppingPoint,
      };
    }
  }

  if (input.explicit?.style) {
    const rawStyle = input.explicit.style.trim();
    if (rawStyle.toLowerCase() === "autopilot" || rawStyle === "오토파일럿") {
      isPartialAutopilot = true;
    } else {
      const resolved = resolveTaskStyleAnswer(rawStyle);
      if (resolved.resolved && resolved.style) {
        explicitStyle = resolved.style;
      } else {
        // Ambiguous or unresolved explicit style
        return {
          kind: "conflict",
          conflictReason: `Explicit style '${rawStyle}' is ambiguous or unrecognized`,
          clarificationQuestion: `명시한 작업 방식 '${rawStyle}'이 명확하지 않습니다. 정확한 방식을 선택해 주세요.`,
          missingFacts: ["explicit-style-unresolved"],
        };
      }
    }
  }

  // 2. Parse from request.text if not provided via explicit metadata
  if (!explicitCommandRoute) {
    const parsedCmd = parseCommandLine(input.request.text);
    if (parsedCmd) {
      let phase: string | undefined;
      const phaseCandidate = parsedCmd.args.find((a) => /^[0-9]+[a-z]?(\.[0-9]+)*$/iu.test(a));
      if (phaseCandidate) phase = phaseCandidate;

      let stoppingPoint: string | undefined;
      if (parsedCmd.name === "discuss-phase") stoppingPoint = "discuss:post";
      else if (parsedCmd.name === "plan-phase") stoppingPoint = "plan:post";
      else if (parsedCmd.name === "execute-phase") stoppingPoint = "execute:post";

      explicitCommandRoute = {
        command: `gsd-${parsedCmd.name}`,
        workflow: parsedCmd.name,
        phase,
        arguments: parsedCmd.args,
        stoppingPoint,
      };
    }
  }

  if (!explicitStyle && !isPartialAutopilot) {
    const extracted = extractStyleFromText(input.request.text);
    if (extracted.conflictingStyles && extracted.conflictingStyles.length > 1) {
      conflictingStylesFound = extracted.conflictingStyles;
    } else if (extracted.exactStyle) {
      explicitStyle = extracted.exactStyle;
    } else if (extracted.partialAutopilot) {
      isPartialAutopilot = true;
    }
  }

  // 3. Evaluate conflicts
  if (conflictingStylesFound && conflictingStylesFound.length > 1) {
    return {
      kind: "conflict",
      conflictReason: `Multiple conflicting task styles mentioned: ${conflictingStylesFound.join(", ")}`,
      clarificationQuestion: `여러 작업 방식(${conflictingStylesFound.join(", ")})이 함께 언급되었습니다. 어느 방식으로 진행할까요?`,
      missingFacts: ["conflicting-styles-resolution"],
      candidateStyles: conflictingStylesFound,
    };
  }

  // Conflict between explicit command and explicit style
  if (explicitCommandRoute && explicitStyle) {
    // Check compatibility:
    // e.g. gsd-quick is compatible with conversational-quick / conversational-quick-full
    // gsd-discuss-phase / gsd-plan-phase / gsd-execute-phase are conversational phase workflows
    const isAutopilotStyle = explicitStyle.startsWith("autopilot-");
    const isPhaseCommand = ["discuss-phase", "plan-phase", "execute-phase"].includes(explicitCommandRoute.workflow);
    const isQuickCommand = explicitCommandRoute.workflow === "quick";

    if (
      (isAutopilotStyle && isPhaseCommand) ||
      (isAutopilotStyle && isQuickCommand) ||
      (isQuickCommand && explicitStyle.includes("phase")) ||
      (isPhaseCommand && explicitStyle.includes("quick"))
    ) {
      return {
        kind: "conflict",
        conflictReason: `Direct command '${explicitCommandRoute.command}' conflicts with explicit style '${explicitStyle}'`,
        clarificationQuestion: `직접 호출한 명령(${explicitCommandRoute.command})과 명시한 방식(${explicitStyle})이 일치하지 않습니다. 어느 방식으로 진행할까요?`,
        missingFacts: ["command-style-conflict"],
      };
    }
  }

  if (explicitCommandRoute && isPartialAutopilot) {
    return {
      kind: "conflict",
      conflictReason: `Direct command '${explicitCommandRoute.command}' conflicts with autopilot mode request`,
      clarificationQuestion: `직접 호출한 명령(${explicitCommandRoute.command})과 오토파일럿 요청이 일치하지 않습니다. 어느 방식으로 진행할까요?`,
      missingFacts: ["command-autopilot-conflict"],
    };
  }

  // 4. Return canonical outcomes
  if (explicitCommandRoute) {
    return {
      kind: "command",
      commandRoute: explicitCommandRoute,
      selectedStyle: explicitStyle,
    };
  }

  if (explicitStyle) {
    return {
      kind: "style",
      selectedStyle: explicitStyle,
    };
  }

  if (isPartialAutopilot) {
    return {
      kind: "partial",
      partialAutopilot: true,
      candidateStyles: TASK_EXECUTION_STYLES.filter((s) => s.id.startsWith("autopilot-")).map((s) => s.id),
      clarificationQuestion: "오토파일럿으로 진행합니다. 작업 범위를 선택해 주세요 (4: quick, 5: quick-full, 6: phase):",
    };
  }

  return { kind: "none" };
}
