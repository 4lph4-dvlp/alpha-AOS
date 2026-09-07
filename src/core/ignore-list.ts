// RED stub for DETC-01 / D-04. Signatures only, so the behaviour tests fail on
// their own assertions rather than on a module-load error.

export type IgnoreDecision = "ignored" | "scannable" | "undecidable";

export interface IgnoreRuleSet {
  readonly directory: string;
  readonly patterns: readonly string[];
  readonly undecidable: readonly string[];
}

export interface IgnoreVerdict {
  readonly decision: IgnoreDecision;
  readonly pattern: string | null;
}

export const IGNORE_FILE_BYTE_CAP = 262144;
export const IGNORE_PATTERN_COUNT_CAP = 5000;
export const IGNORE_PATTERN_LENGTH_CAP = 1024;

export async function loadIgnoreRules(directory: string): Promise<IgnoreRuleSet> {
  return { directory, patterns: [], undecidable: [] };
}

export function isIgnored(
  _relativePosixPath: string,
  _isDirectory: boolean,
  _stack: readonly IgnoreRuleSet[],
): IgnoreVerdict {
  return { decision: "scannable", pattern: null };
}
