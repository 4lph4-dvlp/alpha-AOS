import { createHash } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { normalizeContractPath, type TaskContract } from "./task-contract.js";

export type TaskReviewLocatorKind = "snapshot-file" | "check-receipt" | "connector-item" | "connector-file";

export interface TaskReviewLocator {
  kind: TaskReviewLocatorKind;
  identifier: string;
  inspectedRange?: string | null | undefined;
  digest?: string | null | undefined;
  itemId?: string | null | undefined;
  sourceIdentity?: string | null | undefined;
  fileReceiptId?: string | null | undefined;
}

export interface TaskReviewReproduction {
  inputText: string;
  observedExitCode: number;
  observedStdout: string;
}

export interface TaskRuleCheckDescriptor {
  readonly kind: "pattern-present" | "pattern-absent" | "custom-inspection";
  readonly pattern?: string | null | undefined;
}

export interface TaskReviewRuleConfirmation {
  ruleId: string;
  ruleSource?: string | null | undefined;
  inspectedPath: string;
  observedViolation: string;
  impact?: string | null | undefined;
  checkDescriptor?: TaskRuleCheckDescriptor | null | undefined;
}

export interface TaskReviewFinding {
  summary: string;
  reproduction: TaskReviewReproduction | null;
  ruleConfirmation?: TaskReviewRuleConfirmation | null | undefined;
  impact?: string | null | undefined;
  scope?: "in-scope" | "out-of-scope" | null | undefined;
}

export interface TaskReviewCriterion {
  criterionId: string;
  verdict: "pass" | "fail" | "unknown";
  severity: "blocking" | "advisory";
  evidence: string;
  locator?: TaskReviewLocator | null | undefined;
  abstainReason: string | null;
  finding: TaskReviewFinding | null;
}

export interface TaskReviewReportV1 {
  schemaVersion: 1;
  requestId: string;
  contractId: string;
  contractDigest: string;
  artifactDigest: string;
  targetRevisionSha?: string | undefined;
  criteria: Array<{
    criterionId: string;
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
  }>;
  suggestions: string[];
}

export interface TaskReviewReportV2 {
  schemaVersion: 2;
  requestId: string;
  contractId: string;
  contractDigest: string;
  artifactDigest: string;
  targetRevisionSha: string;
  criteria: TaskReviewCriterion[];
  suggestions: string[];
}

export type TaskReviewReport = TaskReviewReportV1 | TaskReviewReportV2;

export interface ReviewMeasurementRef {
  criterionId: string;
  outcome: "pass" | "fail" | "unavailable";
  stdoutSha256?: string | null | undefined;
  detail: string;
}

export interface ValidateTaskReviewEvidenceOptions {
  report: TaskReviewReport;
  request: {
    requestId: string;
    contractDigest: string;
    artifactDigest: string;
    targetRevisionSha?: string | undefined;
    measurements: readonly ReviewMeasurementRef[];
  };
  contract: TaskContract;
  snapshotRoot: string;
  receiptsRoot?: string | undefined;
  currentHeadSha?: string | undefined;
}

export interface TaskReviewEvidenceIssue {
  criterionId?: string | undefined;
  code: string;
  message: string;
}

export interface ResolvedEvidenceLocation {
  criterionId: string;
  kind: TaskReviewLocatorKind;
  resolvedPathOrId: string;
  digest?: string | null | undefined;
  inspectedRange?: string | null | undefined;
}

export interface TaskReviewEvidenceResult {
  valid: boolean;
  issues: TaskReviewEvidenceIssue[];
  resolvedLocations: Map<string, ResolvedEvidenceLocation>;
}

export const TASK_REVIEW_V1_SCHEMA: Record<string, unknown> = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://alpha-aos.local/schemas/task-review-v1.schema.json",
  type: "object",
  required: ["schemaVersion", "requestId", "contractId", "contractDigest", "artifactDigest", "criteria", "suggestions"],
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    requestId: { type: "string" },
    contractId: { type: "string" },
    contractDigest: { type: "string" },
    artifactDigest: { type: "string" },
    criteria: {
      type: "array",
      items: {
        type: "object",
        required: ["criterionId", "verdict", "severity", "evidence", "abstainReason", "finding"],
        additionalProperties: false,
        properties: {
          criterionId: { type: "string" },
          verdict: { type: "string", enum: ["pass", "fail", "unknown"] },
          severity: { type: "string", enum: ["blocking", "advisory"] },
          evidence: { type: "string" },
          abstainReason: { anyOf: [{ type: "string" }, { type: "null" }] },
          finding: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                required: ["summary", "reproduction"],
                additionalProperties: false,
                properties: {
                  summary: { type: "string" },
                  reproduction: {
                    anyOf: [
                      { type: "null" },
                      {
                        type: "object",
                        required: ["inputText", "observedExitCode", "observedStdout"],
                        additionalProperties: false,
                        properties: {
                          inputText: { type: "string" },
                          observedExitCode: { type: "integer" },
                          observedStdout: { type: "string" },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      },
    },
    suggestions: { type: "array", items: { type: "string" } },
  },
};

/**
 * Validates whole review report identity, completeness, verdict rules, and evidence
 * resolution inside the reviewed snapshot or check receipts (D-01..D-04, REV-02).
 * Fails closed: if any criterion lacks required verifiable evidence or fails resolution,
 * the entire report is invalid.
 */
export async function validateTaskReviewEvidence(
  options: ValidateTaskReviewEvidenceOptions,
): Promise<TaskReviewEvidenceResult> {
  const { report, request, contract, snapshotRoot, currentHeadSha } = options;
  const issues: TaskReviewEvidenceIssue[] = [];
  const resolvedLocations = new Map<string, ResolvedEvidenceLocation>();

  // 1. Schema version check (v1 is audit-only; v2 is mandatory for acceptance)
  if (report.schemaVersion === 1) {
    issues.push({
      code: "legacy-schema-v1",
      message: "the report uses legacy schemaVersion 1; v2 with verifiable evidence locators is required",
    });
    return { valid: false, issues, resolvedLocations };
  }

  // 2. Request, Contract, Artifact, Revision binding
  if (report.requestId !== request.requestId) {
    issues.push({ code: "request-id-mismatch", message: "the report answers a different review request" });
  }
  if (report.contractId !== contract.id) {
    issues.push({ code: "contract-id-mismatch", message: "the report names a different contract" });
  }
  if (report.contractDigest !== request.contractDigest) {
    issues.push({ code: "contract-digest-mismatch", message: "the report is bound to a different contract digest" });
  }
  if (report.artifactDigest !== request.artifactDigest) {
    issues.push({ code: "artifact-digest-mismatch", message: "the report is bound to a different artifact digest" });
  }
  if (contract.category === "development") {
    if (!report.targetRevisionSha) {
      issues.push({ code: "missing-target-revision-sha", message: "development review requires targetRevisionSha" });
    }
    if (request.targetRevisionSha !== undefined && report.targetRevisionSha !== request.targetRevisionSha) {
      issues.push({ code: "revision-sha-mismatch", message: "the report is bound to a different target revision SHA" });
    }
    if (currentHeadSha !== undefined && report.targetRevisionSha !== currentHeadSha) {
      issues.push({ code: "revision-drift", message: "the report targetRevisionSha does not match current git HEAD" });
    }
  } else if (contract.category === "general") {
    if (request.targetRevisionSha !== undefined && report.targetRevisionSha !== undefined && report.targetRevisionSha !== request.targetRevisionSha) {
      issues.push({ code: "revision-sha-mismatch", message: "the report is bound to a different target revision SHA" });
    }
  }

  // 3. Complete and exact criteria set check (D-03)
  const expectedCriterionIds = new Set(contract.criterion.map((c) => c.id));
  const seenCriterionIds = new Set<string>();

  for (const [index, row] of report.criteria.entries()) {
    const at = `criteria/${index}`;
    if (!expectedCriterionIds.has(row.criterionId)) {
      issues.push({ criterionId: row.criterionId, code: "unknown-criterion", message: `${at} names no contract criterion: ${row.criterionId}` });
      continue;
    }
    if (seenCriterionIds.has(row.criterionId)) {
      issues.push({ criterionId: row.criterionId, code: "duplicate-criterion", message: `${at} repeats criterion: ${row.criterionId}` });
      continue;
    }
    seenCriterionIds.add(row.criterionId);

    // Evidence non-empty check
    if (!row.evidence || row.evidence.trim().length === 0) {
      issues.push({ criterionId: row.criterionId, code: "empty-evidence", message: `${at} evidence cannot be empty` });
    }

    // Verdict-specific checks (REV-02, D-01, D-02)
    if (row.verdict === "pass") {
      if (row.finding !== null) {
        issues.push({ criterionId: row.criterionId, code: "pass-with-finding", message: `${at} pass verdict must not carry a finding` });
      }
      if (row.abstainReason !== null) {
        issues.push({ criterionId: row.criterionId, code: "pass-with-abstain", message: `${at} pass verdict must not carry an abstainReason` });
      }
      if (!row.locator) {
        issues.push({ criterionId: row.criterionId, code: "missing-pass-locator", message: `${at} pass verdict requires a verifiable evidence locator` });
      }
    } else if (row.verdict === "fail") {
      if (!row.finding || !row.finding.summary || row.finding.summary.trim().length === 0) {
        issues.push({ criterionId: row.criterionId, code: "fail-missing-finding", message: `${at} fail verdict requires a finding with a non-empty summary` });
      }
      if (row.abstainReason !== null) {
        issues.push({ criterionId: row.criterionId, code: "fail-with-abstain", message: `${at} fail verdict must not carry an abstainReason` });
      }
      if (row.severity === "blocking") {
        if (!row.locator) {
          issues.push({ criterionId: row.criterionId, code: "missing-blocking-locator", message: `${at} blocking failure requires an evidence locator to the affected file or check receipt` });
        }
        const hasRepro = row.finding !== null && row.finding.reproduction !== null;
        const hasRule = row.finding !== null && row.finding.ruleConfirmation !== null && row.finding.ruleConfirmation !== undefined;
        if (!hasRepro && !hasRule) {
          issues.push({ criterionId: row.criterionId, code: "missing-blocking-verification", message: `${at} blocking failure requires explicit reproduction steps or rule confirmation` });
        }
      }
    } else if (row.verdict === "unknown") {
      if (!row.abstainReason || row.abstainReason.trim().length === 0) {
        issues.push({ criterionId: row.criterionId, code: "missing-abstain-reason", message: `${at} unknown verdict requires an abstainReason` });
      }
    }

    // 4. Evidence Location Resolution (D-04)
    if (row.locator) {
      if (row.locator.kind === "snapshot-file") {
        const normalized = normalizeContractPath(row.locator.identifier);
        if (normalized === "" || isAbsolute(normalized) || /^[A-Za-z]:/u.test(normalized) || normalized.includes("..")) {
          issues.push({ criterionId: row.criterionId, code: "unconfined-locator-path", message: `${at} evidence locator path ${row.locator.identifier} escapes snapshot root` });
          continue;
        }
        const fullPath = resolve(snapshotRoot, ...normalized.split("/"));
        const rel = relative(snapshotRoot, fullPath);
        if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
          issues.push({ criterionId: row.criterionId, code: "unconfined-locator-path", message: `${at} evidence locator path ${row.locator.identifier} escapes snapshot root` });
          continue;
        }

        let fileStat: Stats;
        try {
          fileStat = await lstat(fullPath);
        } catch {
          issues.push({ criterionId: row.criterionId, code: "unresolvable-file", message: `${at} evidence locator file ${row.locator.identifier} does not exist in the reviewed snapshot` });
          continue;
        }
        if (!fileStat.isFile()) {
          issues.push({ criterionId: row.criterionId, code: "not-regular-file", message: `${at} evidence locator path ${row.locator.identifier} is not a regular file` });
          continue;
        }

        let bytes: Buffer;
        try {
          bytes = await readFile(fullPath);
        } catch (error) {
          issues.push({ criterionId: row.criterionId, code: "unreadable-file", message: `${at} evidence locator file ${row.locator.identifier} could not be read: ${String(error)}` });
          continue;
        }
        const actualDigest = createHash("sha256").update(bytes).digest("hex");
        if (row.locator.digest && row.locator.digest !== actualDigest) {
          issues.push({ criterionId: row.criterionId, code: "digest-mismatch", message: `${at} evidence locator file ${row.locator.identifier} digest mismatch: expected ${row.locator.digest}, got ${actualDigest}` });
          continue;
        }

        if (row.locator.inspectedRange) {
          const match = /^lines:?(\d+)-(\d+)$/iu.exec(row.locator.inspectedRange.trim());
          if (match) {
            const start = Number(match[1]);
            const end = Number(match[2]);
            const text = bytes.toString("utf8");
            const lineCount = text.split(/\r?\n/u).length;
            if (start < 1 || start > end || end > lineCount) {
              issues.push({ criterionId: row.criterionId, code: "invalid-inspected-range", message: `${at} inspectedRange ${row.locator.inspectedRange} is out of bounds for ${row.locator.identifier} (${lineCount} lines)` });
              continue;
            }
          }
        }

        resolvedLocations.set(row.criterionId, {
          criterionId: row.criterionId,
          kind: "snapshot-file",
          resolvedPathOrId: fullPath,
          digest: actualDigest,
          inspectedRange: row.locator.inspectedRange ?? null,
        });
      } else if (row.locator.kind === "check-receipt") {
        const criterion = contract.criterion.find((c) => c.id === row.criterionId);
        const measurement = request.measurements.find(
          (m) => m.criterionId === row.criterionId || (criterion && m.criterionId === criterion.id),
        );
        const matchesEntry = criterion && criterion.measurement.kind === "cli-json" && normalizeContractPath(criterion.measurement.entry) === normalizeContractPath(row.locator.identifier);
        const matchesCriterionId = criterion && criterion.id === row.locator.identifier;
        if (!matchesEntry && !matchesCriterionId) {
          issues.push({ criterionId: row.criterionId, code: "unresolvable-check-receipt", message: `${at} evidence locator check receipt ${row.locator.identifier} cannot be resolved` });
          continue;
        }
        if (row.locator.digest && measurement?.stdoutSha256 && row.locator.digest !== measurement.stdoutSha256) {
          issues.push({ criterionId: row.criterionId, code: "check-receipt-digest-mismatch", message: `${at} evidence locator check receipt ${row.locator.identifier} digest mismatch: expected ${row.locator.digest}, got ${measurement.stdoutSha256}` });
          continue;
        }

        resolvedLocations.set(row.criterionId, {
          criterionId: row.criterionId,
          kind: "check-receipt",
          resolvedPathOrId: row.locator.identifier,
          digest: row.locator.digest ?? measurement?.stdoutSha256 ?? null,
          inspectedRange: row.locator.inspectedRange ?? null,
        });
      } else if (row.locator.kind === "connector-item") {
        const criterion = contract.criterion.find((c) => c.id === row.criterionId);
        const itemId = row.locator.itemId ?? row.locator.identifier;
        const matchesItem = criterion && criterion.measurement.kind === "outcome" && criterion.measurement.itemId === itemId;
        const matchesCriterionId = criterion && criterion.id === row.locator.identifier;
        if (!matchesItem && !matchesCriterionId) {
          issues.push({ criterionId: row.criterionId, code: "unresolvable-connector-item", message: `${at} evidence locator connector item ${row.locator.identifier} cannot be resolved` });
          continue;
        }
        if (row.locator.digest && row.locator.digest !== request.artifactDigest) {
          issues.push({ criterionId: row.criterionId, code: "connector-item-digest-mismatch", message: `${at} evidence locator connector item ${row.locator.identifier} digest mismatch: expected ${row.locator.digest}, got ${request.artifactDigest}` });
          continue;
        }

        resolvedLocations.set(row.criterionId, {
          criterionId: row.criterionId,
          kind: "connector-item",
          resolvedPathOrId: itemId,
          digest: row.locator.digest ?? request.artifactDigest,
          inspectedRange: row.locator.inspectedRange ?? null,
        });
      } else if (row.locator.kind === "connector-file") {
        if (!row.locator.identifier || row.locator.identifier.trim().length === 0) {
          issues.push({ criterionId: row.criterionId, code: "unresolvable-connector-file", message: `${at} evidence locator connector file identifier is empty` });
          continue;
        }
        resolvedLocations.set(row.criterionId, {
          criterionId: row.criterionId,
          kind: "connector-file",
          resolvedPathOrId: row.locator.identifier,
          digest: row.locator.digest ?? null,
          inspectedRange: row.locator.inspectedRange ?? null,
        });
      }
    }
  }

  // Check for any missing criteria from the contract (D-03)
  for (const criterionId of expectedCriterionIds) {
    if (!seenCriterionIds.has(criterionId)) {
      issues.push({ criterionId, code: "missing-criterion", message: `the report is missing a verdict for contract criterion ${criterionId}` });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    resolvedLocations,
  };
}
