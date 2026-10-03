import assert from "node:assert/strict";
import test from "node:test";

import {
  assessCapabilityDrift,
  evaluateCapabilityRecovery,
  type CapabilityFingerprint,
} from "../src/core/task-capability-drift.js";
import type { TaskCapabilityObligation } from "../src/core/task-capability-obligations.js";
import {
  createCapabilityReceipt,
  type TaskCapabilityReceipt,
} from "../src/core/task-capability-receipts.js";

function makeObligation(id = "ob-1", capabilityId = "documentation-lookup"): TaskCapabilityObligation {
  return {
    id,
    capabilityId,
    step: "execute",
    question: "Consult documentation-lookup for API v2",
    required: true,
    scope: "/project",
    source: "catalog",
    version: "1.0.0",
  };
}

function makeReceipt(obligation: TaskCapabilityObligation, overrides?: Partial<TaskCapabilityReceipt>): TaskCapabilityReceipt {
  return createCapabilityReceipt({
    runId: "run-test-1",
    step: obligation.step,
    capabilityId: obligation.capabilityId,
    obligationId: obligation.id,
    question: obligation.question,
    selected: true,
    invoked: true,
    outcome: "ok",
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "codex",
    sessionId: "session-1",
    skillActivationReceiptId: "act-1",
    mcpObservationId: "obs-1",
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: "a".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
    ...overrides,
  });
}

test("D-17: identical declaration and observation fingerprints detect no drift and allow reuse", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  const baseline: CapabilityFingerprint = {
    phase: "execute",
    scope: "/project",
    manifestDigest: "man-digest-1",
    dependencyDigest: "dep-digest-1",
    packState: "CURRENT",
    packSourceHash: "pack-src-1",
    skillSourceHash: "skill-src-1",
    harness: "codex",
    harnessExecutable: "codex",
    harnessVersion: "1.0.0",
    mcpServerVersion: "1.0.0",
    mcpToolAvailability: { context7: true },
  };

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline,
    current: baseline,
  });

  assert.equal(assessment.hasDrift, false);
  assert.equal(assessment.invalidatedReceiptIds.length, 0);
  assert.deepEqual(assessment.reusableReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.drifted, false);
  assert.equal(assessment.entries[0]?.nextActionKind, "none");
});

test("D-17 / D-09: phase change invalidates prior phase receipts and prescribes re-invocation", () => {
  const obligation = makeObligation("ob-plan", "documentation-lookup");
  const receipt = makeReceipt(obligation, { step: "plan" });

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { phase: "plan" },
    current: { phase: "execute" },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.changedFields.includes("phase"), true);
  assert.equal(assessment.entries[0]?.driftReasons.includes("phase-mismatch"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "re-invoke");
});

test("D-17: scope change invalidates receipts and prescribes re-invocation", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { scope: "/project/src" },
    current: { scope: "/project/tests" },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.changedFields.includes("scope"), true);
  assert.equal(assessment.entries[0]?.driftReasons.includes("scope-mismatch"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "re-invoke");
});

test("D-17 / D-04: manifest or dependency change invalidates receipts and prescribes re-plan", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { manifestDigest: "sha-old", dependencyDigest: "dep-old" },
    current: { manifestDigest: "sha-new", dependencyDigest: "dep-new" },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.driftReasons.includes("manifest-changed"), true);
  assert.equal(assessment.entries[0]?.driftReasons.includes("dependency-changed"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "re-plan");
});

test("D-17 / D-05: non-CURRENT pack state invalidates receipts and prescribes re-sync", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { packState: "CURRENT" },
    current: { packState: "STALE" },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.driftReasons.includes("pack-not-current"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "re-sync");
});

test("D-17: pack source or skill source change prescribes re-sync or re-discovery", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  // Pack source change
  const packAssessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { packSourceHash: "src-1" },
    current: { packSourceHash: "src-2" },
  });
  assert.equal(packAssessment.entries[0]?.driftReasons.includes("pack-source-changed"), true);
  assert.equal(packAssessment.entries[0]?.nextActionKind, "re-sync");

  // Skill source change
  const skillAssessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { skillSourceHash: "skill-1" },
    current: { skillSourceHash: "skill-2" },
  });
  assert.equal(skillAssessment.entries[0]?.driftReasons.includes("skill-source-changed"), true);
  assert.equal(skillAssessment.entries[0]?.nextActionKind, "re-discover");
});

test("D-17: harness version or executable change prescribes re-probe", () => {
  const obligation = makeObligation();
  const receipt = makeReceipt(obligation);

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { harnessVersion: "1.0.0", harnessExecutable: "/usr/bin/codex" },
    current: { harnessVersion: "1.1.0", harnessExecutable: "/usr/local/bin/codex" },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.driftReasons.includes("harness-version-changed"), true);
  assert.equal(assessment.entries[0]?.driftReasons.includes("harness-executable-changed"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "re-probe");
});

test("D-17: MCP tool availability loss prescribes tool restoration", () => {
  const obligation = makeObligation("ob-1", "documentation-lookup");
  const receipt = makeReceipt(obligation);

  const assessment = assessCapabilityDrift({
    obligations: [obligation],
    receipts: [receipt],
    baseline: { mcpToolAvailability: { context7: true } },
    current: { mcpToolAvailability: { context7: false } },
  });

  assert.equal(assessment.hasDrift, true);
  assert.deepEqual(assessment.invalidatedReceiptIds, [receipt.receiptId]);
  assert.equal(assessment.entries[0]?.driftReasons.includes("mcp-tool-unavailable"), true);
  assert.equal(assessment.entries[0]?.nextActionKind, "restore-tool");
});

test("D-10..D-13: evaluateCapabilityRecovery handles retry, alternates, re-approval, and blocked", () => {
  const obligation = makeObligation();
  const failedReceipt = makeReceipt(obligation, { outcome: "tool-error", isError: true, errorMessage: "503 service unavailable" });

  // 1. D-10: Current path retry successful -> recovered
  const retryResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    retrySuccessful: true,
  });
  assert.equal(retryResult.status, "recovered");
  assert.equal(retryResult.precondition.satisfied, true);

  // 2. D-10, D-12: Unproven alternate cannot be accepted
  const unprovenResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    availableAlternates: [
      {
        capabilityId: "unproven-docs",
        harness: "codex",
        roleChange: false,
        harnessChange: false,
        answersSameQuestion: true,
        provenResult: false, // NOT PROVEN
      },
    ],
    userActionAvailable: false,
  });
  assert.equal(unprovenResult.status, "blocked");

  // 3. D-10, D-12: Verified equivalent alternate on same harness -> alternate-ready
  const equivalentResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    availableAlternates: [
      {
        capabilityId: "verified-docs",
        harness: "codex",
        roleChange: false,
        harnessChange: false,
        answersSameQuestion: true,
        provenResult: true,
      },
    ],
  });
  assert.equal(equivalentResult.status, "alternate-ready");
  assert.equal(equivalentResult.selectedAlternate?.capabilityId, "verified-docs");
  assert.equal(equivalentResult.precondition.satisfied, true);

  // 4. D-11: Alternate requiring harness change needs new contract approval -> needs-input
  const harnessChangeResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    availableAlternates: [
      {
        capabilityId: "claude-docs",
        harness: "claude",
        roleChange: false,
        harnessChange: true,
        answersSameQuestion: true,
        provenResult: true,
      },
    ],
  });
  assert.equal(harnessChangeResult.status, "needs-input");
  assert.equal(harnessChangeResult.requiresNewContractApproval, true);
  assert.ok(harnessChangeResult.proposedContractDigest);
  assert.equal(harnessChangeResult.precondition.satisfied, false);

  // 5. D-11: When exact proposedContractDigest is approved -> alternate-ready
  const approvedHarnessResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    availableAlternates: [
      {
        capabilityId: "claude-docs",
        harness: "claude",
        roleChange: false,
        harnessChange: true,
        answersSameQuestion: true,
        provenResult: true,
      },
    ],
    approvedContractDigest: harnessChangeResult.proposedContractDigest!,
  });
  assert.equal(approvedHarnessResult.status, "alternate-ready");
  assert.equal(approvedHarnessResult.precondition.satisfied, true);

  // 6. D-13: User action available -> needs-input
  const userActionResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    userActionAvailable: true,
    userActionDescription: "Provide EXA_API_KEY environment variable",
  });
  assert.equal(userActionResult.status, "needs-input");
  assert.equal(userActionResult.nextAction, "Provide EXA_API_KEY environment variable");
  assert.equal(userActionResult.precondition.satisfied, false);

  // 7. D-13: No recovery and no user action -> blocked
  const blockedResult = evaluateCapabilityRecovery({
    failedObligation: obligation,
    failedReceipt,
    userActionAvailable: false,
    blockingReason: "External API permanently deprecated",
  });
  assert.equal(blockedResult.status, "blocked");
  assert.equal(blockedResult.precondition.satisfied, false);
});
