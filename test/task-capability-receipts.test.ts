import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { packageRoot } from "../src/core/paths.js";
import {
  computeCapabilityReceiptDigest,
  createCapabilityReceipt,
  createLinkedCapabilityReceipt,
  getCapabilityReceiptSchema,
  readCapabilityReceipts,
  verifyRequiredCapabilityReceipts,
  writeCapabilityReceipt,
  type TaskCapabilityReceipt,
} from "../src/core/task-capability-receipts.js";
import type { TaskCapabilityObligation } from "../src/core/task-capability-obligations.js";
import { validateManagedDocument } from "../src/core/validation.js";

interface ReceiptTestFixture {
  readonly stateRoot: string;
}

async function createReceiptFixture(context: TestContext, label: string): Promise<ReceiptTestFixture> {
  const stateRoot = await mkdtemp(join(tmpdir(), `alpha-aos-cap-receipt-${label}-`));
  context.after(async () => {
    await rm(stateRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return { stateRoot };
}

function makeObligation(overrides?: Partial<TaskCapabilityObligation>): TaskCapabilityObligation {
  return {
    id: "ob-doc-1",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "How does the Context7 API work?",
    required: true,
    scope: "/project",
    source: "catalog",
    version: "1.0.0",
    ...overrides,
  };
}

test("D-14: valid linked capability receipt (skill activation + MCP observation) verifies successfully", async (context) => {
  const fixture = await createReceiptFixture(context, "valid-link");
  const obligation = makeObligation();
  const sessionId = "session-fresh-alpha";
  const runId = "run-valid-link-1";

  const receipt = createLinkedCapabilityReceipt({
    obligation,
    runId,
    step: "execute",
    sessionId,
    skillActivation: {
      receiptId: `act-${sessionId}-documentation-lookup`,
      activatedAt: "2026-10-03T12:00:00.000Z",
    },
    mcpObservation: {
      observationId: "obs-ctx7-call-001",
      outcome: "ok",
      rawResultSha256: createHash("sha256").update("Context7 documentation payload", "utf8").digest("hex"),
      isError: false,
      observedAt: "2026-10-03T12:00:02.000Z",
    },
    harness: "codex",
    harnessVersion: "1.0.0",
    toolName: "context7",
  });

  const receiptPath = await writeCapabilityReceipt(receipt, fixture.stateRoot);
  assert.ok(receiptPath.endsWith(".json"));

  const readBack = await readCapabilityReceipts(fixture.stateRoot, runId);
  assert.equal(readBack.length, 1);
  assert.equal(readBack[0]?.receiptId, receipt.receiptId);
  assert.equal(readBack[0]?.skillActivationReceiptId, `act-${sessionId}-documentation-lookup`);
  assert.equal(readBack[0]?.mcpObservationId, "obs-ctx7-call-001");
  assert.equal(readBack[0]?.outcome, "ok");

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: readBack,
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: sessionId,
  });

  assert.equal(verification.satisfied, true);
  assert.equal(verification.verifiedReceipts.length, 1);
  assert.equal(verification.failedReceipts.length, 0);
  assert.equal(verification.missingObligations.length, 0);
  assert.equal(verification.precondition.satisfied, true);
});

test("D-14: missing skill activation (한쪽 누락) is rejected from satisfying required obligation", async (context) => {
  const fixture = await createReceiptFixture(context, "missing-skill");
  const obligation = makeObligation();
  const sessionId = "session-fresh-beta";
  const runId = "run-missing-skill-1";

  // Receipt has MCP observation, but NO skill activation
  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId,
    skillActivationReceiptId: null, // MISSING
    mcpObservationId: "obs-mcp-only-1",
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: createHash("sha256").update("doc payload", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  await writeCapabilityReceipt(receipt, fixture.stateRoot);
  const receipts = await readCapabilityReceipts(fixture.stateRoot, runId);

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts,
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: sessionId,
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.verifiedReceipts.length, 0);
  assert.equal(verification.failedReceipts.length, 1);
  assert.equal(verification.precondition.satisfied, false);
});

test("D-14: missing MCP observation (한쪽 누락) is rejected from satisfying required obligation", async (context) => {
  const fixture = await createReceiptFixture(context, "missing-mcp");
  const obligation = makeObligation();
  const sessionId = "session-fresh-gamma";
  const runId = "run-missing-mcp-1";

  // Receipt has skill activation, but NO MCP observation
  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId,
    skillActivationReceiptId: `act-${sessionId}-documentation-lookup`,
    mcpObservationId: null, // MISSING
    observationId: null,
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: createHash("sha256").update("doc payload", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  await writeCapabilityReceipt(receipt, fixture.stateRoot);
  const receipts = await readCapabilityReceipts(fixture.stateRoot, runId);

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts,
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: sessionId,
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.verifiedReceipts.length, 0);
  assert.equal(verification.failedReceipts.length, 1);
});

test("D-14: crossed session IDs (ID 교차) fails verification", async (context) => {
  const fixture = await createReceiptFixture(context, "crossed-id");
  const obligation = makeObligation();
  const runId = "run-crossed-1";

  // Skill was activated in session-alpha, but receipt claims session-beta
  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId: "session-beta",
    skillActivationReceiptId: "act-session-alpha-documentation-lookup", // CROSS
    mcpObservationId: "obs-mcp-1",
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: createHash("sha256").update("doc payload", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: "session-beta",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.verifiedReceipts.length, 0);
  assert.equal(verification.failedReceipts.length, 1);
});

test("D-14: sequence inversion (순서 반전: skill activated after MCP tool call) is rejected", async () => {
  const obligation = makeObligation();
  const runId = "run-inversion-1";
  const sessionId = "session-inversion";

  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId,
    skillActivationReceiptId: `act-${sessionId}-documentation-lookup`,
    mcpObservationId: "obs-mcp-1",
    skillActivatedAt: "2026-10-03T12:00:10.000Z", // AFTER observation
    mcpObservedAt: "2026-10-03T12:00:05.000Z", // BEFORE skill activation
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: createHash("sha256").update("doc payload", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: sessionId,
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.failedReceipts.length, 1);
});

test("D-14: empty response digest (빈 응답) is rejected from satisfying required obligation", async () => {
  const obligation = makeObligation();
  const runId = "run-empty-res";
  const sessionId = "session-empty";

  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId,
    skillActivationReceiptId: `act-${sessionId}-documentation-lookup`,
    mcpObservationId: "obs-mcp-1",
    resultDigest: "", // EMPTY RESPONSE
    rawResultSha256: "",
    source: obligation.source,
    sourceVersion: obligation.version,
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: sessionId,
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.failedReceipts.length, 1);
});

test("D-15: MCP tool-error, transport-error, and denied are preserved in audit trail but cannot satisfy obligation", async (context) => {
  const fixture = await createReceiptFixture(context, "error-outcomes");
  const obligation = makeObligation();
  const sessionId = "session-err";
  const runId = "run-err-outcomes";

  const outcomes: Array<{ outcome: "tool-error" | "transport-error" | "denied"; errorMsg: string }> = [
    { outcome: "tool-error", errorMsg: "API rate limit reached (HTTP 429)" },
    { outcome: "transport-error", errorMsg: "ECONNREFUSED on upstream socket" },
    { outcome: "denied", errorMsg: "Policy denied tool invocation" },
  ];

  for (const { outcome, errorMsg } of outcomes) {
    const receipt = createLinkedCapabilityReceipt({
      obligation,
      runId: `${runId}-${outcome}`,
      step: "execute",
      sessionId,
      skillActivation: {
        receiptId: `act-${sessionId}-documentation-lookup`,
        activatedAt: "2026-10-03T12:00:00.000Z",
      },
      mcpObservation: {
        observationId: `obs-${outcome}-001`,
        outcome,
        rawResultSha256: createHash("sha256").update(errorMsg, "utf8").digest("hex"),
        isError: true,
        errorMessage: errorMsg,
        observedAt: "2026-10-03T12:00:02.000Z",
      },
      harness: "codex",
      harnessVersion: "1.0.0",
      toolName: "context7",
    });

    // Successfully writes to external stateRoot (audit trail preserved!)
    const writtenPath = await writeCapabilityReceipt(receipt, fixture.stateRoot);
    assert.ok(writtenPath.endsWith(".json"));

    // Successfully reads back from stateRoot
    const readReceipts = await readCapabilityReceipts(fixture.stateRoot, `${runId}-${outcome}`);
    assert.equal(readReceipts.length, 1);
    const read = readReceipts[0]!;
    assert.equal(read.outcome, outcome);
    assert.equal(read.isError, true);
    assert.equal(read.errorMessage, errorMsg);

    // Verification MUST reject it from satisfying the obligation
    const verification = verifyRequiredCapabilityReceipts({
      obligations: [obligation],
      receipts: readReceipts,
      currentRunId: `${runId}-${outcome}`,
      currentStep: "execute",
      currentSessionId: sessionId,
    });

    assert.equal(verification.satisfied, false);
    assert.equal(verification.verifiedReceipts.length, 0);
    assert.equal(verification.failedReceipts.length, 1);
    assert.equal(verification.failedReceipts[0]?.receiptId, receipt.receiptId);
  }
});

test("closed schema: task-capability-receipt.schema.json rejects unknown properties and requires required fields", async () => {
  const schema = await getCapabilityReceiptSchema();
  assert.equal(schema["additionalProperties"], false);

  const validReceipt: TaskCapabilityReceipt = createCapabilityReceipt({
    runId: "run-schema-1",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-1",
    question: "Query Context7 docs",
    selected: true,
    invoked: true,
    outcome: "ok",
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "codex",
    sessionId: "session-1",
    skillActivationReceiptId: "act-session-1-documentation-lookup",
    mcpObservationId: "obs-1",
    source: "catalog",
    sourceVersion: "1.0.0",
    rawResultSha256: createHash("sha256").update("content", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const validDoc = validateManagedDocument({
    text: JSON.stringify(validReceipt),
    format: "json",
    kind: "task-receipt",
    schema,
  });
  assert.equal(validDoc.ok, true);

  // Unknown property fails closed schema
  const withUnknown = { ...validReceipt, unvettedField: "malicious" };
  const unknownDoc = validateManagedDocument({
    text: JSON.stringify(withUnknown),
    format: "json",
    kind: "task-receipt",
    schema,
  });
  assert.equal(unknownDoc.ok, false);
});

test("tampered digest or raw credentials in capability receipt are rejected", async (context) => {
  const fixture = await createReceiptFixture(context, "tamper-cred");
  const obligation = makeObligation();
  const sessionId = "session-cred";
  const runId = "run-cred";

  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
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
    sessionId,
    skillActivationReceiptId: `act-${sessionId}-documentation-lookup`,
    mcpObservationId: "obs-1",
    source: obligation.source,
    sourceVersion: obligation.version,
    rawResultSha256: createHash("sha256").update("content", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  // Tampering with resultDigest without recomputing receiptDigest
  const tampered: TaskCapabilityReceipt = {
    ...receipt,
    resultDigest: "1".repeat(64),
  };

  await assert.rejects(
    writeCapabilityReceipt(tampered, fixture.stateRoot),
    /Receipt digest mismatch/,
  );

  // Receipt with credentials
  const withSecret: TaskCapabilityReceipt = {
    ...receipt,
    errorMessage: "Bearer sk-ant-api03-1234567890123456789012345678901234567890",
    receiptDigest: "",
  };
  const recomputedSecret: TaskCapabilityReceipt = {
    ...withSecret,
    receiptDigest: computeCapabilityReceiptDigest(withSecret),
  };

  await assert.rejects(
    writeCapabilityReceipt(recomputedSecret, fixture.stateRoot),
    /Receipt contains raw credentials/,
  );
});
