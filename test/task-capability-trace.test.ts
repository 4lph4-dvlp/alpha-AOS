import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  selectStepObligations,
  type TaskCapabilityObligation,
} from "../src/core/task-capability-obligations.js";
import {
  createCapabilityReceipt,
  readCapabilityReceipts,
  verifyRequiredCapabilityReceipts,
  writeCapabilityReceipt,
  type TaskCapabilityPort,
  type TaskCapabilityReceipt,
} from "../src/core/task-capability-receipts.js";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import { executeGsdStep } from "../src/core/task-gsd-lifecycle.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

async function approveDocLookupContract(fixture: TaskFixture): Promise<{ digest: string; question: string }> {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const contract = inventorySummaryContract(fixture.projectRoot, {
    goal: `${question} Implement inventory summary CLI.`,
  });
  await writeTaskContract(fixture.contractPath, contract);
  const preview = await previewTaskContract({
    contractPath: fixture.contractPath,
    stateRoot: fixture.stateRoot,
  });
  const approval = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approval.status, "approved");
  return { digest: preview.digest, question };
}

function fakeSuccessCapabilityPort(question: string): TaskCapabilityPort {
  return {
    async invoke(request) {
      const receipt = createCapabilityReceipt({
        runId: request.runId,
        step: request.step,
        capabilityId: request.obligation.capabilityId,
        obligationId: request.obligation.id,
        question: request.obligation.question,
        selected: true,
        invoked: true,
        outcome: "ok",
        invokedAt: new Date().toISOString(),
        toolName: "context7",
        harness: request.harness ?? "codex",
        harnessVersion: "1.0.0",
        harnessExecutable: "codex.exe",
        sessionId: request.sessionId ?? `session-${request.runId}`,
        source: request.obligation.source,
        sourceVersion: request.obligation.version,
        observationId: `obs-${request.runId}-1`,
        rawResultSha256: createHash("sha256").update("doc-content", "utf8").digest("hex"),
        isReused: false,
        originalReceiptId: null,
        isError: false,
        errorMessage: null,
      });
      return { receipt };
    },
  };
}

function fakeFailingCapabilityPort(question: string): TaskCapabilityPort {
  return {
    async invoke(request) {
      const receipt = createCapabilityReceipt({
        runId: request.runId,
        step: request.step,
        capabilityId: request.obligation.capabilityId,
        obligationId: request.obligation.id,
        question: request.obligation.question,
        selected: true,
        invoked: true,
        outcome: "failed",
        invokedAt: new Date().toISOString(),
        toolName: "context7",
        harness: request.harness ?? "codex",
        harnessVersion: "1.0.0",
        harnessExecutable: "codex.exe",
        sessionId: request.sessionId ?? `session-${request.runId}`,
        source: request.obligation.source,
        sourceVersion: request.obligation.version,
        observationId: `obs-${request.runId}-err`,
        rawResultSha256: createHash("sha256").update("error", "utf8").digest("hex"),
        isReused: false,
        originalReceiptId: null,
        isError: true,
        errorMessage: "Context7 rate limit exceeded or connection refused",
      });
      return { receipt };
    },
  };
}

// ---------------------------------------------------------------------------
// Task 1: End-to-end trace from GSD execute boundary to verdict
// ---------------------------------------------------------------------------

test("CAP-03 tracer: an approved task with required capability invocation succeeds with verified receipt", async (context) => {
  const fixture = await createTaskFixture(context);
  const { digest, question } = await approveDocLookupContract(fixture);

  const capability = fakeSuccessCapabilityPort(question);
  const ports = {
    ...fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    capability,
  };

  const { run } = await startFixtureTask(fixture, {
    ports,
    expectedDigest: digest,
  });

  assert.equal(run.status, "accepted");
  assert.equal(run.verdict?.overall, "accepted");

  const capPrecondition = run.verdict?.preconditions.find((p) => p.id === "capability-obligations");
  assert.ok(capPrecondition !== undefined, "capability-obligations precondition must be present");
  assert.equal(capPrecondition.satisfied, true);

  const receipts = await readCapabilityReceipts(fixture.stateRoot, run.runId);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0]?.capabilityId, "documentation-lookup");
  assert.equal(receipts[0]?.outcome, "ok");
  assert.equal(receipts[0]?.isError, false);
});

test("CAP-03 tracer: missing capability port or receipt fails verdict even with exitCode 0 and passing reviewer", async (context) => {
  const fixture = await createTaskFixture(context);
  const { digest } = await approveDocLookupContract(fixture);

  // No capability port provided
  const ports = fixturePorts({
    controller: referenceControllerPort("correct"),
    reviewer: staticReviewerPort(passingReview),
  });

  const { run } = await startFixtureTask(fixture, {
    ports,
    expectedDigest: digest,
  });

  assert.notEqual(run.status, "accepted");
  assert.equal(run.status, "unknown");
  assert.equal(run.verdict?.overall, "unknown");

  const capPrecondition = run.verdict?.preconditions.find((p) => p.id === "capability-obligations");
  assert.ok(capPrecondition !== undefined);
  assert.equal(capPrecondition.satisfied, false);
});

test("CAP-05 tracer: capability invocation failure blocks acceptance despite normal completion", async (context) => {
  const fixture = await createTaskFixture(context);
  const { digest, question } = await approveDocLookupContract(fixture);

  const capability = fakeFailingCapabilityPort(question);
  const ports = {
    ...fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    capability,
  };

  const { run } = await startFixtureTask(fixture, {
    ports,
    expectedDigest: digest,
  });

  assert.notEqual(run.status, "accepted");
  assert.equal(run.status, "unknown");
  assert.equal(run.verdict?.overall, "unknown");

  const capPrecondition = run.verdict?.preconditions.find((p) => p.id === "capability-obligations");
  assert.ok(capPrecondition !== undefined);
  assert.equal(capPrecondition.satisfied, false);
});

test("executeGsdStep attaches selected obligations and invokes capability port at boundary", async (context) => {
  const fixture = await createTaskFixture(context);
  const question = "Perform documentation-lookup for api.";
  const contract = inventorySummaryContract(fixture.projectRoot, { goal: question });

  const capability = fakeSuccessCapabilityPort(question);

  const result = await executeGsdStep({
    projectRoot: fixture.projectRoot,
    phaseId: "18",
    step: "execute",
    contract,
    targetRevisionSha: "0".repeat(40),
    workingTreeDigest: "0".repeat(64),
    capabilityPort: capability,
    stateRoot: fixture.stateRoot,
    runId: "run-step-trace-1",
    stepCommand: {
      executable: process.execPath,
      args: ["-e", "process.exit(0)"],
    },
  });

  assert.ok(result.obligations !== undefined);
  assert.equal(result.obligations.length, 1);
  assert.equal(result.obligations[0]?.capabilityId, "documentation-lookup");
  assert.ok(result.capabilityReceipts !== undefined);
  assert.equal(result.capabilityReceipts.length, 1);
  assert.equal(result.capabilityReceipts[0]?.outcome, "ok");
});

// ---------------------------------------------------------------------------
// Task 2: Edge probe tests (Adjacency, Empty values, Ordering, Reused receipts)
// ---------------------------------------------------------------------------

test("Task 2 edge probe: wrong step (adjacency) cannot satisfy obligation", () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-1",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "How does API v2 work?",
    required: true,
    scope: "/project",
    source: "context7",
    version: "1.0",
  };

  const receipt = createCapabilityReceipt({
    runId: "run-100",
    step: "verify", // wrong step: verify instead of execute
    capabilityId: "documentation-lookup",
    obligationId: "ob-1",
    question: "How does API v2 work?",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: "run-100",
    currentStep: "execute",
    currentSessionId: "sess-1",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.precondition.satisfied, false);
});

test("Task 2 edge probe: stale runId (ordering) is rejected as prior evidence", () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-1",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "How does API v2 work?",
    required: true,
    scope: "/project",
    source: "context7",
    version: "1.0",
  };

  const receipt = createCapabilityReceipt({
    runId: "run-OLD", // stale runId
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-1",
    question: "How does API v2 work?",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: "run-NEW",
    currentStep: "execute",
    currentSessionId: "sess-1",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.precondition.satisfied, false);
});

test("Task 2 edge probe: empty question cannot satisfy obligation", () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-empty",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "   ", // whitespace only
    required: true,
    scope: "/project",
    source: "context7",
    version: "1.0",
  };

  const receipt = createCapabilityReceipt({
    runId: "run-101",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-empty",
    question: "   ",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: "run-101",
    currentStep: "execute",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.precondition.satisfied, false);
});

test("Task 2 edge probe: corrupted receipt digest fails validation", () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-digest",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "Valid question",
    required: true,
    scope: "/project",
    source: "context7",
    version: "1.0",
  };

  const validReceipt = createCapabilityReceipt({
    runId: "run-102",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-digest",
    question: "Valid question",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  // Corrupt the digest
  const corruptedReceipt: TaskCapabilityReceipt = {
    ...validReceipt,
    receiptDigest: "corrupted_digest_1234567890",
  };

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [corruptedReceipt],
    currentRunId: "run-102",
    currentStep: "execute",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.precondition.satisfied, false);
});

test("Task 2 edge probe: reused receipt without originalReceiptId is rejected", () => {
  const obligation: TaskCapabilityObligation = {
    id: "ob-reuse",
    capabilityId: "documentation-lookup",
    step: "execute",
    question: "Reused question",
    required: true,
    scope: "/project",
    source: "context7",
    version: "1.0",
  };

  const receipt = createCapabilityReceipt({
    runId: "run-103",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-reuse",
    question: "Reused question",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: true,
    originalReceiptId: null, // missing original receipt id on reuse!
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [receipt],
    currentRunId: "run-103",
    currentStep: "execute",
  });

  assert.equal(verification.satisfied, false);
  assert.equal(verification.precondition.satisfied, false);
});

test("Task 2 edge probe: raw credentials in receipt are rejected before writing", async (context) => {
  const fixture = await createTaskFixture(context);
  const receipt = createCapabilityReceipt({
    runId: "run-cred",
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: "ob-cred",
    question: "sk-proj-1234567890123456789012345678901234567890", // raw secret in question
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0",
    harnessExecutable: "codex",
    sessionId: "sess-1",
    source: "context7",
    sourceVersion: "1.0",
    observationId: "obs-1",
    rawResultSha256: "0".repeat(64),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  await assert.rejects(
    () => writeCapabilityReceipt(receipt, fixture.stateRoot),
    /Receipt contains raw credentials/u,
  );
});
