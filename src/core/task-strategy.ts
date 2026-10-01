import { createHash } from "node:crypto";

export type RepairStage =
  | "stage-0-default"
  | "stage-1-reproduction-injection"
  | "stage-2-single-criterion-focus"
  | "stage-3-blocked";

export interface FailureReproduction {
  inputText?: string;
  observedExitCode?: number;
  observedStdout?: string;
  summary: string;
}

export interface FailureHistoryEntry {
  attemptIndex: number;
  criterionId: string;
  cause: string;
  fingerprint: string;
  rawError: string;
  reproduction?: FailureReproduction;
}

export interface BlockedReport {
  status: "blocked";
  failureFingerprint: string;
  consecutiveFailures: number;
  attemptedStrategies: string[];
  reproductionEvidence: {
    criterionId: string;
    inputText?: string;
    observedExitCode?: number;
    observedStdout?: string;
    summary: string;
  };
  nextAction: string;
}

export interface StrategySelectionResult {
  stage: RepairStage;
  activeCriterionId: string | null;
  promptInjection: string | null;
  blockedReport: BlockedReport | null;
}

/**
 * Normalizes an error message by stripping transient noise such as ANSI escapes,
 * absolute paths, line/column coordinates, timestamps, memory addresses, and excessive whitespace.
 */
export function normalizeErrorMessage(raw: string): string {
  let normalized = raw;

  // 1. Strip ANSI escape sequences
  normalized = normalized.replace(/\u001b\[[0-9;]*[a-zA-Z]/gu, "");

  // 2. Replace ISO timestamps (e.g. 2026-10-01T18:49:13.123Z)
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/gu, "[TIME]");

  // 3. Replace hex memory addresses (e.g. 0x7ffd5e2b4c10)
  normalized = normalized.replace(/0x[0-9a-fA-F]+/gu, "[ADDR]");

  // 4. Replace file paths with line/column numbers: e.g. path/to/file.ts:123:45 or file.ts:123
  // First Windows absolute paths (C:\... or D:\...)
  normalized = normalized.replace(/[a-zA-Z]:\\[^:\s"'`)]+/gu, "[PATH]");
  normalized = normalized.replace(/[a-zA-Z]:\/[^:\s"'`)]+/gu, "[PATH]");
  // POSIX absolute paths (/usr/... or /home/... or /var/...)
  normalized = normalized.replace(/(?:\/[a-zA-Z0-9_.-]+){2,}/gu, "[PATH]");

  // 5. Replace line and column number coordinates
  normalized = normalized.replace(/:\d+:\d+/gu, ":[LINE]:[COL]");
  normalized = normalized.replace(/:\d+/gu, ":[LINE]");

  // 6. Collapse whitespace, trim, and convert to lowercase
  normalized = normalized.replace(/\s+/gu, " ").trim().toLowerCase();

  return normalized;
}

/**
 * Deterministically computes a failure fingerprint:
 * `${criterionId}:${cause}:${sha256(normalizedError)}`
 */
export function computeFailureFingerprint(criterionId: string, cause: string, rawError: string): string {
  const normalized = normalizeErrorMessage(rawError);
  const hash = createHash("sha256").update(normalized, "utf8").digest("hex");
  return `${criterionId}:${cause}:${hash}`;
}

/**
 * Tracks failure attempts and detects repeated failures (no-progress).
 */
export class NoProgressDetector {
  private readonly _history: FailureHistoryEntry[] = [];
  private _consecutiveCount = 0;
  private _currentFingerprint: string | null = null;

  get history(): FailureHistoryEntry[] {
    return [...this._history];
  }

  recordAttempt(entry: FailureHistoryEntry): {
    repeated: boolean;
    consecutiveCount: number;
    currentFingerprint: string | null;
  } {
    this._history.push(entry);

    if (this._currentFingerprint === entry.fingerprint) {
      this._consecutiveCount += 1;
    } else {
      this._currentFingerprint = entry.fingerprint;
      this._consecutiveCount = 1;
    }

    return {
      repeated: this._consecutiveCount >= 2,
      consecutiveCount: this._consecutiveCount,
      currentFingerprint: this._currentFingerprint,
    };
  }

  recordSuccess(): void {
    this._consecutiveCount = 0;
    this._currentFingerprint = null;
  }
}

/**
 * Selects an adaptive repair strategy based on consecutive identical failure count.
 * Stage 0: default prompt (0-1 failure)
 * Stage 1: reproduction injection (2 consecutive failures)
 * Stage 2: single criterion focus (3 consecutive failures)
 * Stage 3: blocked report (4+ consecutive failures)
 */
export function selectRepairStrategy(history: FailureHistoryEntry[]): StrategySelectionResult {
  if (history.length === 0) {
    return {
      stage: "stage-0-default",
      activeCriterionId: null,
      promptInjection: null,
      blockedReport: null,
    };
  }

  const latest = history[history.length - 1]!;
  let count = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.fingerprint === latest.fingerprint) {
      count++;
    } else {
      break;
    }
  }

  if (count < 2) {
    return {
      stage: "stage-0-default",
      activeCriterionId: null,
      promptInjection: null,
      blockedReport: null,
    };
  }

  if (count === 2) {
    const repro = latest.reproduction;
    const promptInjection = [
      `CRITICAL REPAIR INSTRUCTION: Criterion "${latest.criterionId}" failed repeatedly with error: ${latest.rawError}.`,
      `Reproduction input: ${repro?.inputText ?? "none"}.`,
      "Focus implementation strictly on resolving this failure.",
    ].join(" ");

    return {
      stage: "stage-1-reproduction-injection",
      activeCriterionId: latest.criterionId,
      promptInjection,
      blockedReport: null,
    };
  }

  if (count === 3) {
    const promptInjection = [
      `CRITICAL SCOPE RESTRICTION: Focus implementation exclusively on criterion "${latest.criterionId}".`,
      `Do not modify unrelated files or perform broad refactoring.`,
      `Resolve: ${latest.rawError}.`,
    ].join(" ");

    return {
      stage: "stage-2-single-criterion-focus",
      activeCriterionId: latest.criterionId,
      promptInjection,
      blockedReport: null,
    };
  }

  // count >= 4: Stage 3 Blocked
  const repro = latest.reproduction;
  const blockedReport: BlockedReport = {
    status: "blocked",
    failureFingerprint: latest.fingerprint,
    consecutiveFailures: count,
    attemptedStrategies: ["stage-1-reproduction-injection", "stage-2-single-criterion-focus"],
    reproductionEvidence: {
      criterionId: latest.criterionId,
      ...(repro?.inputText !== undefined ? { inputText: repro.inputText } : {}),
      ...(repro?.observedExitCode !== undefined ? { observedExitCode: repro.observedExitCode } : {}),
      ...(repro?.observedStdout !== undefined ? { observedStdout: repro.observedStdout } : {}),
      summary: repro?.summary ?? latest.rawError,
    },
    nextAction: `Inspect test inputs or implementation manually for criterion "${latest.criterionId}". Repeated failure fingerprint: ${latest.fingerprint}.`,
  };

  return {
    stage: "stage-3-blocked",
    activeCriterionId: latest.criterionId,
    promptInjection: null,
    blockedReport,
  };
}

/**
 * Formats a BlockedReport into human-readable terminal output.
 */
export function formatBlockedReport(report: BlockedReport): string {
  const lines: string[] = [
    "============================================================",
    " TASK EXECUTION BLOCKED: REPEATED FAILURE UNRESOLVED",
    "============================================================",
    `Failure Fingerprint:  ${report.failureFingerprint}`,
    `Consecutive Failures: ${report.consecutiveFailures}`,
    `Attempted Strategies: ${report.attemptedStrategies.join(" -> ")}`,
    "------------------------------------------------------------",
    "Reproduction Evidence:",
    `  Criterion ID: ${report.reproductionEvidence.criterionId}`,
    `  Summary:      ${report.reproductionEvidence.summary}`,
  ];

  if (report.reproductionEvidence.inputText !== undefined) {
    lines.push(`  Input Text:   ${report.reproductionEvidence.inputText}`);
  }
  if (report.reproductionEvidence.observedExitCode !== undefined) {
    lines.push(`  Exit Code:    ${report.reproductionEvidence.observedExitCode}`);
  }
  if (report.reproductionEvidence.observedStdout !== undefined) {
    lines.push(`  Stdout:       ${report.reproductionEvidence.observedStdout}`);
  }

  lines.push(
    "------------------------------------------------------------",
    `Next Action: ${report.nextAction}`,
    "============================================================",
  );

  return lines.join("\n");
}
