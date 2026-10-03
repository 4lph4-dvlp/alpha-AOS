import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateStepObligations,
  selectStepObligations,
} from "../src/core/task-capability-obligations.js";
import type { TaskCapabilityReceipt } from "../src/core/task-capability-receipts.js";
import type { TaskContract } from "../src/core/task-contract.js";
import type { TaskCapabilityInventory } from "../src/types.js";
import { inventorySummaryContract } from "./helpers/task-fixture.js";

function mockContract(goal: string, descriptions: string[] = []): TaskContract {
  const base = inventorySummaryContract("/test/project", { goal });
  if (descriptions.length > 0) {
    return {
      ...base,
      criterion: descriptions.map((desc, idx) => ({
        ...base.criterion[0]!,
        id: `crit-${idx + 1}`,
        description: desc,
      })),
    };
  }
  return base;
}

function mockReceipt(overrides: Partial<TaskCapabilityReceipt> = {}): TaskCapabilityReceipt {
  return {
    schemaVersion: 1,
    kind: "task-capability-receipt",
    receiptId: "rec-test-123",
    receiptDigest: "digest-123",
    runId: "run-abc",
    step: "plan",
    capabilityId: "documentation-lookup",
    obligationId: "ob-1",
    question: "Consult documentation-lookup for version-specific library API documentation.",
    selected: true,
    invoked: true,
    attempted: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "claude",
    harnessVersion: "1.0.0",
    harnessExecutable: "claude",
    sessionId: "sess-1",
    skillActivationReceiptId: "act-1",
    mcpObservationId: "obs-1",
    source: "context7",
    sourceVersion: "stable",
    observationId: "obs-1",
    rawResultSha256: "raw-sha",
    resultDigest: "raw-sha",
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
    ...overrides,
  };
}

test("D-06: selects both documentation-lookup and deep-research when both evidence paths are needed", () => {
  const contract = mockContract(
    "Implement auth module using Context7 API documentation and deep-research for recent security case studies.",
  );

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
  });

  assert.equal(decision.status, "ready");
  assert.equal(decision.obligations.length, 2);

  const docObligation = decision.obligations.find((o) => o.capabilityId === "documentation-lookup");
  assert.ok(docObligation);
  assert.equal(docObligation.source, "context7");
  assert.equal(docObligation.required, true);

  const researchObligation = decision.obligations.find((o) => o.capabilityId === "deep-research");
  assert.ok(researchObligation);
  assert.equal(researchObligation.source, "exa");
  assert.equal(researchObligation.required, true);
});

test("D-07: approved project skill supersedes global skill on identical requirement", () => {
  const contract = mockContract("Consult documentation-lookup for API documentation on the project architecture.");

  const inventory: TaskCapabilityInventory = {
    schemaVersion: 1,
    projectRoot: "/test/project",
    items: [
      {
        id: "ecc:project:docs:doc-viewer",
        name: "doc-viewer",
        kind: "ecc-project-skill",
        scope: "project",
        version: "project",
        source: "project-pack",
        sourceHash: "hash-doc",
        targetHarnesses: ["claude"],
        applicable: true,
        selected: true,
        applicabilityReason: "Project documentation pack active",
        exclusionReason: null,
        unavailableReason: null,
        deployment: "CURRENT",
        nativeUse: "invoked",
        support: "supported",
        nativeUseReason: "invoked",
        supportReason: "supported",
      },
    ],
    generatedAt: new Date().toISOString(),
    inputFingerprint: "fingerprint-1",
  };

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    inventory,
  });

  assert.equal(decision.status, "ready");
  assert.equal(decision.obligations.length, 1);

  // Project skill is selected
  const selectedOb = decision.obligations[0];
  assert.ok(selectedOb);
  assert.equal(selectedOb.capabilityId, "ecc:project:docs:doc-viewer");

  // Global skill is recorded as omitted
  assert.equal(decision.omitted.length, 1);
  const omitted = decision.omitted[0];
  assert.ok(omitted);
  assert.equal(omitted.capabilityId, "documentation-lookup");
  assert.equal(omitted.supersededByCapabilityId, "ecc:project:docs:doc-viewer");
  assert.ok(omitted.reason.includes("supersedes"));
});

test("D-08: ambiguous requirement without repository evidence yields needs-input", () => {
  const contract = mockContract("Update dependencies; if needed, consider looking up documentation.");

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    repositoryFiles: [], // No repository evidence
    ambiguityResolved: false,
  });

  assert.equal(decision.status, "needs-input");
  assert.equal(decision.obligations.length, 0);
  assert.ok(decision.needsInputReason?.includes("ambiguous"));
  assert.ok(decision.missingEvidence && decision.missingEvidence.length > 0);
});

test("D-08: ambiguous requirement resolved by repository evidence proceeds to ready", () => {
  const contract = mockContract("Update dependencies; if needed, consider looking up documentation.");

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    repositoryFiles: ["docs/API.md", "src/auth.ts"], // Clear evidence present
    ambiguityResolved: false,
  });

  assert.equal(decision.status, "ready");
  assert.ok(decision.obligations.length > 0);
});

test("D-09: reuses prior successful receipt when source, version, scope, and question match", () => {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const contract = mockContract(question);

  const priorReceipt = mockReceipt({
    capabilityId: "documentation-lookup",
    source: "context7",
    sourceVersion: "stable",
    question,
    outcome: "ok",
    receiptId: "rec-prior-456",
  });

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    priorReceipts: [priorReceipt],
  });

  assert.equal(decision.status, "ready");
  assert.equal(decision.obligations.length, 1);

  const ob = decision.obligations[0];
  assert.ok(ob);
  assert.equal(ob.reusedFromReceiptId, "rec-prior-456");
  assert.equal(ob.originalReceiptId, "rec-prior-456");
  assert.ok(ob.selectionReason?.includes("Reusing verified successful receipt rec-prior-456"));
});

test("D-09: changed question triggers fresh invocation instead of reuse", () => {
  const contract = mockContract("Consult documentation-lookup for different question regarding Node 24 process.");

  const priorReceipt = mockReceipt({
    capabilityId: "documentation-lookup",
    source: "context7",
    sourceVersion: "stable",
    question: "Old question about previous version.",
    outcome: "ok",
    receiptId: "rec-old-789",
  });

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    priorReceipts: [priorReceipt],
  });

  assert.equal(decision.status, "ready");
  const ob = decision.obligations[0];
  assert.ok(ob);
  assert.equal(ob.reusedFromReceiptId, null);
  assert.equal(ob.originalReceiptId, null);
});

test("D-09: changed sourceVersion triggers fresh invocation instead of reuse", () => {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const contract = mockContract(question);

  const priorReceipt = mockReceipt({
    capabilityId: "documentation-lookup",
    source: "context7",
    sourceVersion: "candidate-v2", // Version changed
    question,
    outcome: "ok",
    receiptId: "rec-v1-old",
  });

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    priorReceipts: [priorReceipt],
  });

  assert.equal(decision.status, "ready");
  const ob = decision.obligations[0];
  assert.ok(ob);
  assert.equal(ob.reusedFromReceiptId, null);
  assert.equal(ob.originalReceiptId, null);
});

test("D-09: prior failed receipt (outcome !== 'ok') is rejected for reuse", () => {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const contract = mockContract(question);

  const priorFailedReceipt = mockReceipt({
    capabilityId: "documentation-lookup",
    source: "context7",
    sourceVersion: "stable",
    question,
    outcome: "failed", // Prior call failed
    receiptId: "rec-failed-999",
  });

  const decision = evaluateStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
    priorReceipts: [priorFailedReceipt],
  });

  assert.equal(decision.status, "ready");
  const ob = decision.obligations[0];
  assert.ok(ob);
  assert.equal(ob.reusedFromReceiptId, null);
  assert.equal(ob.originalReceiptId, null);
});

test("deduplication prevents repeated obligations for identical capability and question", () => {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const contract = mockContract(question, [question, question]);

  const obligations = selectStepObligations({
    contract,
    step: "execute",
    projectRoot: "/test/project",
  });

  assert.equal(obligations.length, 1);
});
