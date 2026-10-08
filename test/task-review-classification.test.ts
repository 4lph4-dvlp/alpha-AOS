import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  classifyTaskDefect,
  classifyReviewReport,
  isStylePreference,
  isReliabilityThreat,
} from "../src/core/task-review-classification.js";
import { isApprovedArchitectureRule, confirmReviewerRuleConfirmation } from "../src/core/task-check.js";
import { approveTaskContract, previewTaskContract, type TaskContract } from "../src/core/task-contract.js";
import type { TaskReviewCriterion, TaskReviewReportV2 } from "../src/core/task-review-evidence.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  staticReviewerPort,
  startFixtureTask,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";
import type { ReviewRequest, ReviewerPort } from "../src/core/task-run.js";

async function approvedFixture(fixture: TaskFixture): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  return preview.digest;
}

function dummyContract(): TaskContract {
  return {
    schemaVersion: 1,
    id: "test-task",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Test task",
    scope: { projectRoot: "/fake", workflow: "gsd-quick", summary: "Test" },
    allowedRoots: ["src"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "crit-1",
        title: "Criterion 1",
        description: "Must implement feature 1",
        mandatory: true,
        measurement: { kind: "cli-json", entry: "src/main.js", inputText: "", expect: { exitCode: 0 } },
      },
      {
        id: "crit-2",
        title: "Criterion 2",
        description: "Must follow architecture rules",
        mandatory: true,
        measurement: { kind: "cli-json", entry: "src/main.js", inputText: "", expect: { exitCode: 0 } },
      },
    ],
    agentPolicy: { controller: "codex", executor: "codex", reviewer: "claude", reviewerSession: "fresh-read-only" },
    resourcePolicy: { maxWallTimeMinutes: 30 },
  };
}

test("isStylePreference accurately identifies style and formatting proposals", () => {
  assert.equal(isStylePreference("Inconsistent indentation and whitespace in main.js"), true);
  assert.equal(isStylePreference("Variable naming convention does not follow camelCase"), true);
  assert.equal(isStylePreference("Please format with prettier and add semicolons"), true);
  assert.equal(isStylePreference("Missing error handling causes crash on null input"), false);
  assert.equal(isStylePreference("Violates architectural isolation boundary SAFE-01"), false);
});

test("isReliabilityThreat detects issues undermining evidence or results (D-06)", () => {
  assert.equal(isReliabilityThreat("Flaky test race condition undermines evidence reliability"), true);
  assert.equal(isReliabilityThreat("Crash corrupts database during measurement"), true);
  assert.equal(isReliabilityThreat("Memory leak causes worker process hang"), true);
  assert.equal(isReliabilityThreat("Consider renaming helper function for clarity"), false);
});

test("isApprovedArchitectureRule enforces approved project rule prefixes (D-02, D-07)", () => {
  assert.equal(isApprovedArchitectureRule("SAFE-01"), true);
  assert.equal(isApprovedArchitectureRule("ROL-02"), true);
  assert.equal(isApprovedArchitectureRule("DETC-03"), true);
  assert.equal(isApprovedArchitectureRule("ARCH-04"), true);
  assert.equal(isApprovedArchitectureRule("D-07"), true);
  assert.equal(isApprovedArchitectureRule("RULE[AGENTS.md]"), true);
  assert.equal(isApprovedArchitectureRule("custom-team-rule", ["custom-team-rule"]), true);

  // Unapproved arbitrary rules are rejected
  assert.equal(isApprovedArchitectureRule("my-custom-formatting-rule"), false);
  assert.equal(isApprovedArchitectureRule("prefer-functional-programming"), false);
  assert.equal(isApprovedArchitectureRule(""), false);
});

test("missing requirement with confirmed reproduction is classified as blocking (D-05)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[0]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-1",
    verdict: "fail",
    severity: "blocking",
    evidence: "Fails on input 'x'",
    locator: { kind: "check-receipt", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Missing handling for edge case input",
      reproduction: { inputText: "x", observedExitCode: 1, observedStdout: "error" },
      ruleConfirmation: null,
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: true, detail: "Confirmed reproduction" },
  });

  assert.equal(classification.kind, "missing-requirement");
  assert.equal(classification.scope, "in-scope");
  assert.equal(classification.severity, "blocking");
  assert.equal(classification.isBlocking, true);
  assert.equal(classification.confirmed, true);
  assert.equal(classification.confirmationMethod, "reproduction");
});

test("missing requirement with failed reproduction is advisory and not blocking", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[0]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-1",
    verdict: "fail",
    severity: "blocking",
    evidence: "Claimed failure",
    locator: { kind: "check-receipt", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Claimed edge case failure",
      reproduction: { inputText: "x", observedExitCode: 1, observedStdout: "error" },
      ruleConfirmation: null,
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: false, detail: "alpha-AOS observed exit 0" },
  });

  assert.equal(classification.kind, "missing-requirement");
  assert.equal(classification.isBlocking, false);
  assert.equal(classification.severity, "advisory");
  assert.equal(classification.confirmed, false);
});

test("architecture violation with approved rule, valid location, impact, and confirmation is blocking (D-07)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[1]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-2",
    verdict: "fail",
    severity: "blocking",
    evidence: "Architecture rule violation found",
    locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Violation of SAFE-01 path boundary",
      reproduction: null,
      ruleConfirmation: {
        ruleId: "SAFE-01",
        ruleSource: "PROJECT.md",
        inspectedPath: "src/main.js",
        observedViolation: "Escapes allowed root by writing outside workspace",
        impact: "Breaches filesystem boundary and corrupts host state",
      },
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: true, detail: "Corroborated rule violation" },
  });

  assert.equal(classification.kind, "architecture-rule-violation");
  assert.equal(classification.isBlocking, true);
  assert.equal(classification.severity, "blocking");
  assert.equal(classification.approvedRuleBinding?.approved, true);
  assert.equal(classification.approvedRuleBinding?.ruleId, "SAFE-01");
  assert.equal(classification.violationLocation?.exists, true);
});

test("architecture assertion with unapproved rule ID is advisory and does not block (D-07, T-19-03)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[1]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-2",
    verdict: "fail",
    severity: "blocking",
    evidence: "Arbitrary rule claim",
    locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Violates team-favorite-style rule",
      reproduction: null,
      ruleConfirmation: {
        ruleId: "unapproved-style-rule",
        ruleSource: "reviewer-preference",
        inspectedPath: "src/main.js",
        observedViolation: "Did not use tabs",
        impact: "Readability",
      },
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: true, detail: "File exists" },
  });

  assert.equal(classification.kind, "architecture-rule-violation");
  assert.equal(classification.isBlocking, false);
  assert.equal(classification.severity, "advisory");
  assert.equal(classification.approvedRuleBinding?.approved, false);
});

test("architecture assertion without impact is advisory and does not block (D-07)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[1]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-2",
    verdict: "fail",
    severity: "blocking",
    evidence: "Rule assertion without impact",
    locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Violates ARCH-01",
      reproduction: null,
      ruleConfirmation: {
        ruleId: "ARCH-01",
        ruleSource: "PROJECT.md",
        inspectedPath: "src/main.js",
        observedViolation: "Module layout could be restructured",
        impact: null,
      },
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: true, detail: "File exists" },
  });

  assert.equal(classification.kind, "architecture-rule-violation");
  assert.equal(classification.isBlocking, false);
  assert.equal(classification.severity, "advisory");
  assert.match(classification.reason, /does not specify an impact/i);
});

test("style preference is always advisory and never blocks (D-05, D-07)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[0]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-1",
    verdict: "fail",
    severity: "advisory",
    evidence: "Style review",
    locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Code formatting and indentation style could be improved with prettier",
      reproduction: null,
      ruleConfirmation: null,
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
  });

  assert.equal(classification.kind, "style-preference");
  assert.equal(classification.isBlocking, false);
  assert.equal(classification.severity, "advisory");
  assert.equal(classification.suggestionEligible, true);
});

test("out-of-scope reliability threat is classified and blocks when confirmed (D-06)", () => {
  const contract = dummyContract();
  const criterion = contract.criterion[0]!;
  const criterionReview: TaskReviewCriterion = {
    criterionId: "crit-1",
    verdict: "fail",
    severity: "blocking",
    evidence: "External reliability defect",
    locator: { kind: "check-receipt", identifier: "src/main.js", inspectedRange: null, digest: null },
    abstainReason: null,
    finding: {
      summary: "Pre-existing concurrency race corrupts measurement evidence",
      scope: "out-of-scope",
      reproduction: { inputText: "race-trigger", observedExitCode: 139, observedStdout: "segfault" },
      ruleConfirmation: null,
    },
  };

  const classification = classifyTaskDefect({
    criterion,
    criterionReview,
    contract,
    confirmation: { confirmed: true, detail: "alpha-AOS reproduced crash" },
  });

  assert.equal(classification.kind, "reliability-threat");
  assert.equal(classification.scope, "out-of-scope");
  assert.equal(classification.isBlocking, true);
  assert.equal(classification.severity, "blocking");
  assert.equal(classification.confirmed, true);
});

test("classifyReviewReport aggregates classifications and identifies deferred suggestions (REV-05, D-08)", () => {
  const contract = dummyContract();
  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: "test-task",
    contractDigest: "c".repeat(64),
    artifactDigest: "a".repeat(64),
    targetRevisionSha: "0".repeat(40),
    criteria: [
      {
        criterionId: "crit-1",
        verdict: "fail",
        severity: "advisory",
        evidence: "Formatting note",
        locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: {
          summary: "Consider prettier formatting",
          reproduction: null,
          ruleConfirmation: null,
        },
      },
      {
        criterionId: "crit-2",
        verdict: "fail",
        severity: "blocking",
        evidence: "Rule violation",
        locator: { kind: "snapshot-file", identifier: "src/main.js", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: {
          summary: "SAFE-01 violation",
          reproduction: null,
          ruleConfirmation: {
            ruleId: "SAFE-01",
            ruleSource: "PROJECT.md",
            inspectedPath: "src/main.js",
            observedViolation: "Illegal write",
            impact: "Directory traversal risk",
          },
        },
      },
    ],
    suggestions: ["Refactor helper functions into separate utility module"],
  };

  const confirmations = new Map([
    ["crit-2", { confirmed: true, detail: "Violation confirmed" }],
  ]);

  const result = classifyReviewReport({
    report,
    contract,
    confirmations,
  });

  assert.equal(result.hasBlockingDefects, true);
  assert.equal(result.blockingCount, 1);
  assert.equal(result.advisoryCount, 1);
  assert.equal(result.suggestionsToDefer.length, 2);
  assert.ok(result.suggestionsToDefer.some((s: { summary: string }) => s.summary.includes("prettier formatting")));
  assert.ok(result.suggestionsToDefer.some((s: { summary: string }) => s.summary.includes("Refactor helper functions")));
});

test("confirmReviewerRuleConfirmation evaluates deterministic checkDescriptor patterns", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "pattern-test-snapshot");
  await mkdir(join(snapshotRoot, "src"), { recursive: true });
  await writeFile(join(snapshotRoot, "src", "sample.js"), "const forbiddenCall = dangerous();\n", "utf8");

  // Pattern present succeeds when pattern exists
  const presentResult = await confirmReviewerRuleConfirmation({
    criterion: contract.criterion[0]!,
    ruleConfirmation: {
      ruleId: "SAFE-01",
      inspectedPath: "src/sample.js",
      observedViolation: "Dangerous call used",
      impact: "Risk",
      checkDescriptor: { kind: "pattern-present", pattern: "forbiddenCall" },
    },
    root: snapshotRoot,
  });
  assert.equal(presentResult.confirmed, true);

  // Pattern present fails when pattern absent
  const presentFailResult = await confirmReviewerRuleConfirmation({
    criterion: contract.criterion[0]!,
    ruleConfirmation: {
      ruleId: "SAFE-01",
      inspectedPath: "src/sample.js",
      observedViolation: "Missing guard",
      impact: "Risk",
      checkDescriptor: { kind: "pattern-present", pattern: "nonExistentPattern" },
    },
    root: snapshotRoot,
  });
  assert.equal(presentFailResult.confirmed, false);

  // Pattern absent succeeds when pattern not found
  const absentResult = await confirmReviewerRuleConfirmation({
    criterion: contract.criterion[0]!,
    ruleConfirmation: {
      ruleId: "SAFE-01",
      inspectedPath: "src/sample.js",
      observedViolation: "Pattern absent",
      impact: "Risk",
      checkDescriptor: { kind: "pattern-absent", pattern: "nonExistentPattern" },
    },
    root: snapshotRoot,
  });
  assert.equal(absentResult.confirmed, true);

  // Pattern absent fails when pattern is found
  const absentFailResult = await confirmReviewerRuleConfirmation({
    criterion: contract.criterion[0]!,
    ruleConfirmation: {
      ruleId: "SAFE-01",
      inspectedPath: "src/sample.js",
      observedViolation: "Pattern absent",
      impact: "Risk",
      checkDescriptor: { kind: "pattern-absent", pattern: "forbiddenCall" },
    },
    root: snapshotRoot,
  });
  assert.equal(absentFailResult.confirmed, false);
});

test("integration: advisory style recommendation does not reject accepted run in startFixtureTask", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  // Reviewer reports passing verdict on one and advisory style preference on another
  const reviewer: ReviewerPort = {
    async review(request: ReviewRequest) {
      const base = passingReview(request);
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: {
          ...base,
          criteria: base.criteria.map((row) =>
            row.criterionId === "invalid-quantity"
              ? {
                  ...row,
                  verdict: "fail" as const,
                  severity: "advisory" as const,
                  evidence: "Formatting note on invalid-quantity handler.",
                  locator: {
                    kind: "snapshot-file" as const,
                    identifier: "bin/inventory-summary.mjs",
                    inspectedRange: null,
                    digest: null,
                  },
                  finding: {
                    summary: "Consider prettier formatting and camelCase variable names",
                    reproduction: null,
                    ruleConfirmation: null,
                  },
                }
              : row,
          ),
          suggestions: ["Top-level suggestion to add ESLint configuration."],
        },
        issues: [],
      };
    },
  };

  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer,
    }),
    expectedDigest: digest,
  });

  // Since the failure was only advisory style preference, the task does NOT get rejected
  // (In task-verdict, an advisory failure results in unknown with unconfirmed-fail, avoiding reject)
  assert.notEqual(record.status, "rejected");
  assert.notEqual(record.verdict?.overall, "rejected");
  assert.ok(record.reviewClassification !== undefined && record.reviewClassification !== null);
  assert.equal(record.reviewClassification.hasBlockingDefects, false);
  assert.equal(record.reviewClassification.advisoryCount >= 1, true);
});

test("integration: unapproved architectural rule does not reject accepted run in startFixtureTask", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  // Reviewer reports a blocking failure citing an unapproved arbitrary rule
  const reviewer: ReviewerPort = {
    async review(request: ReviewRequest) {
      const base = passingReview(request);
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: {
          ...base,
          criteria: base.criteria.map((row) =>
            row.criterionId === "valid-summary"
              ? {
                  ...row,
                  verdict: "fail" as const,
                  severity: "blocking" as const,
                  evidence: "Unapproved rule violation.",
                  locator: {
                    kind: "snapshot-file" as const,
                    identifier: "bin/inventory-summary.mjs",
                    inspectedRange: null,
                    digest: null,
                  },
                  finding: {
                    summary: "Violation of unapproved custom rule",
                    reproduction: null,
                    ruleConfirmation: {
                      ruleId: "MY-CUSTOM-RULE",
                      ruleSource: "external",
                      inspectedPath: "bin/inventory-summary.mjs",
                      observedViolation: "Does not match custom standard",
                      impact: "Unapproved impact",
                    },
                  },
                }
              : row,
          ),
        },
        issues: [],
      };
    },
  };

  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer,
    }),
    expectedDigest: digest,
  });

  // Because MY-CUSTOM-RULE is not approved, it does NOT confirm as a blocking failure!
  assert.notEqual(record.status, "rejected");
  assert.notEqual(record.verdict?.overall, "rejected");
  const row = record.verdict?.rows.find((r) => r.criterionId === "valid-summary");
  assert.notEqual(row?.verdict, "fail");
});
