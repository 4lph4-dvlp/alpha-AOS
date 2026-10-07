import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  selectStepObligations,
  type CapabilityBoundary,
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
import { approveTaskContract, previewTaskContract, TaskContractError } from "../src/core/task-contract.js";
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

  // D-13 (18-05): a failed required capability with no alternate and no user
  // action available halts as blocked before any verdict is issued, so the
  // run can never be judged accepted.
  assert.notEqual(run.status, "accepted");
  assert.equal(run.status, "blocked");
  assert.ok(run.stopReason?.includes("capability-failure"));
  assert.equal(run.verdict ?? null, null);
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

function fakeDualEvidenceCapabilityPort(options: {
  failSteps?: readonly string[];
} = {}): TaskCapabilityPort {
  return {
    async invoke(request) {
      const isFail = Boolean(options.failSteps?.includes(request.step));
      const sessionId = request.sessionId ?? `session-${request.runId}`;
      const now = new Date().toISOString();
      const receipt = createCapabilityReceipt({
        runId: request.runId,
        step: request.step,
        capabilityId: request.obligation.capabilityId,
        obligationId: request.obligation.id,
        question: request.obligation.question,
        selected: true,
        invoked: true,
        outcome: isFail ? "failed" : "ok",
        invokedAt: now,
        toolName: "context7",
        harness: request.harness ?? "codex",
        harnessVersion: "1.0.0",
        harnessExecutable: "codex.exe",
        sessionId,
        skillActivationReceiptId: `act-${sessionId}-${request.step}`,
        mcpObservationId: `mcp-${sessionId}-${request.step}`,
        skillActivatedAt: now,
        mcpObservedAt: now,
        source: request.obligation.source,
        sourceVersion: request.obligation.version,
        observationId: `obs-${request.runId}-${request.step}`,
        rawResultSha256: createHash("sha256").update("doc-content", "utf8").digest("hex"),
        isReused: false,
        originalReceiptId: null,
        isError: isFail,
        errorMessage: isFail ? "Simulated error" : null,
      });
      return { receipt };
    },
  };
}

function makeValidStepReceipt(options: {
  runId: string;
  step: CapabilityBoundary;
  question: string;
  obligationId: string;
  sessionId?: string;
}): TaskCapabilityReceipt {
  const sessionId = options.sessionId ?? `sess-${options.runId}`;
  const now = new Date().toISOString();
  return createCapabilityReceipt({
    runId: options.runId,
    step: options.step,
    capabilityId: "documentation-lookup",
    obligationId: options.obligationId,
    question: options.question,
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: now,
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "codex.exe",
    sessionId,
    skillActivationReceiptId: `act-${sessionId}-${options.step}`,
    mcpObservationId: `mcp-${sessionId}-${options.step}`,
    skillActivatedAt: now,
    mcpObservedAt: now,
    source: "context7",
    sourceVersion: "stable",
    observationId: `obs-${options.runId}-${options.step}`,
    rawResultSha256: createHash("sha256").update("doc-content", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });
}

test("CAP-03: review boundary selects and verifies capability obligation connected to sessionId and artifactDigest", async (context) => {
  const fixture = await createTaskFixture(context);
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  function makeContract(projectRoot: string) {
    return inventorySummaryContract(projectRoot, {
      goal: "Implement inventory summary CLI.",
      criterion: [
        ...inventorySummaryContract(projectRoot).criterion,
        {
          id: "review-api",
          title: "Review API documentation",
          description: `${question} for review audit.`,
          mandatory: true,
          measurement: {
            kind: "cli-json",
            entry: "bin/inventory-summary.mjs",
            inputText: "sku,qty\nA-100,1\n",
            expect: {
              exitCode: 0,
              stdoutJson: { rows: 1, totalQuantity: 1, skus: { "A-100": 1 } },
            },
          },
        },
      ],
    });
  }
  const contract = makeContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  const approval = await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  assert.equal(approval.status, "approved");

  // A. Review succeeds and connects to sessionId and artifactDigest
  let recordedReviewStepRequest: any = null;
  const capability: TaskCapabilityPort = {
    async invoke(request) {
      if (request.step === "review") {
        recordedReviewStepRequest = request;
      }
      return fakeDualEvidenceCapabilityPort().invoke(request);
    },
  };
  const { run } = await startFixtureTask(fixture, {
    ports: {
      ...fixturePorts({
        controller: referenceControllerPort("correct"),
        reviewer: staticReviewerPort(passingReview),
      }),
      capability,
    },
    expectedDigest: preview.digest,
  });

  assert.equal(run.status, "accepted");
  assert.ok(recordedReviewStepRequest !== null, "Review boundary must invoke capability");
  assert.equal(recordedReviewStepRequest.step, "review");
  assert.equal(recordedReviewStepRequest.harness, contract.agentPolicy.reviewer);
  assert.equal(recordedReviewStepRequest.artifactDigest, run.artifact?.digest);
  assert.ok(recordedReviewStepRequest.sessionId);

  const reviewPrecondition = run.verdict?.preconditions.find((p) => p.id === "capability-obligations:review");
  assert.ok(reviewPrecondition);
  assert.equal(reviewPrecondition.satisfied, true);

  // B. Review capability fails => verdict not accepted
  const failingReviewCapability = fakeDualEvidenceCapabilityPort({ failSteps: ["review"] });
  const fixtureFail = await createTaskFixture(context);
  const failContract = makeContract(fixtureFail.projectRoot);
  await writeTaskContract(fixtureFail.contractPath, failContract);
  const previewFail = await previewTaskContract({ contractPath: fixtureFail.contractPath, stateRoot: fixtureFail.stateRoot });
  await approveTaskContract({ contractPath: fixtureFail.contractPath, expectedDigest: previewFail.digest, stateRoot: fixtureFail.stateRoot });

  const { run: runFail } = await startFixtureTask(fixtureFail, {
    ports: {
      ...fixturePorts({
        controller: referenceControllerPort("correct"),
        reviewer: staticReviewerPort(passingReview),
      }),
      capability: failingReviewCapability,
    },
    expectedDigest: previewFail.digest,
  });

  assert.notEqual(runFail.status, "accepted");
  assert.equal(runFail.verdict?.overall, "unknown");
  const failedReviewPre = runFail.verdict?.preconditions.find((p) => p.id === "capability-obligations:review");
  assert.ok(failedReviewPre);
  assert.equal(failedReviewPre.satisfied, false);
});

test("CAP-05: five boundaries require verified receipts; removing any one receipt prevents accepted verdict", async (context) => {
  const question = "Consult documentation-lookup for version-specific library API documentation.";
  const runId = "00000001-00000001";

  // Helper to create and approve contract with obligations in all 5 boundaries
  async function setupFiveBoundaryTask(f: TaskFixture) {
    const contract = inventorySummaryContract(f.projectRoot, {
      goal: `${question} Implement inventory summary CLI.`,
      criterion: [
        ...inventorySummaryContract(f.projectRoot).criterion,
        {
          id: "review-api",
          title: "Review API documentation",
          description: `${question} for review audit.`,
          mandatory: true,
          measurement: {
            kind: "cli-json",
            entry: "bin/inventory-summary.mjs",
            inputText: "sku,qty\nA-100,1\n",
            expect: {
              exitCode: 0,
              stdoutJson: { rows: 1, totalQuantity: 1, skus: { "A-100": 1 } },
            },
          },
        },
      ],
    });
    await writeTaskContract(f.contractPath, contract);
    const preview = await previewTaskContract({ contractPath: f.contractPath, stateRoot: f.stateRoot });
    await approveTaskContract({ contractPath: f.contractPath, expectedDigest: preview.digest, stateRoot: f.stateRoot });

    const discussObs = selectStepObligations({ contract, step: "discuss", projectRoot: f.projectRoot });
    const planObs = selectStepObligations({ contract, step: "plan", projectRoot: f.projectRoot });
    const verifyObs = selectStepObligations({ contract, step: "verify", projectRoot: f.projectRoot });

    return {
      digest: preview.digest,
      contract,
      discussOb: discussObs[0]!,
      planOb: planObs[0]!,
      verifyOb: verifyObs[0]!,
    };
  }

  const allBoundaries = ["discuss", "plan", "execute", "review", "verify"] as const;

  // 1. Baseline: all 5 boundaries present and verified -> accepted
  {
    const fixture = await createTaskFixture(context);
    const { digest, discussOb, planOb, verifyOb } = await setupFiveBoundaryTask(fixture);

    // Pre-seed receipts for discuss, plan, and verify
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "discuss", question: discussOb.question, obligationId: discussOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "plan", question: planOb.question, obligationId: planOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "verify", question: verifyOb.question, obligationId: verifyOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort(),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.equal(run.status, "accepted");
    const preconditions = run.verdict?.preconditions ?? [];
    for (const b of allBoundaries) {
      const boundaryPre = preconditions.find((item) => item.id === `capability-obligations:${b}`);
      assert.ok(boundaryPre, `Precondition capability-obligations:${b} must exist`);
      assert.equal(boundaryPre.satisfied, true, `Boundary ${b} must be satisfied in baseline`);
    }
  }

  // 2. Negative Case 1: Omit discuss receipt
  {
    const fixture = await createTaskFixture(context);
    const { digest, planOb, verifyOb } = await setupFiveBoundaryTask(fixture);

    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "plan", question: planOb.question, obligationId: planOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "verify", question: verifyOb.question, obligationId: verifyOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort(),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.notEqual(run.status, "accepted");
    assert.equal(run.verdict?.overall, "unknown");
    const pre = run.verdict?.preconditions.find((p) => p.id === "capability-obligations:discuss");
    assert.ok(pre);
    assert.equal(pre.satisfied, false);
  }

  // 3. Negative Case 2: Omit plan receipt
  {
    const fixture = await createTaskFixture(context);
    const { digest, discussOb, verifyOb } = await setupFiveBoundaryTask(fixture);

    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "discuss", question: discussOb.question, obligationId: discussOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "verify", question: verifyOb.question, obligationId: verifyOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort(),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.notEqual(run.status, "accepted");
    assert.equal(run.verdict?.overall, "unknown");
    const pre = run.verdict?.preconditions.find((p) => p.id === "capability-obligations:plan");
    assert.ok(pre);
    assert.equal(pre.satisfied, false);
  }

  // 4. Negative Case 3: Omit execute receipt (capability fails on execute)
  {
    const fixture = await createTaskFixture(context);
    const { digest, discussOb, planOb, verifyOb } = await setupFiveBoundaryTask(fixture);

    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "discuss", question: discussOb.question, obligationId: discussOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "plan", question: planOb.question, obligationId: planOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "verify", question: verifyOb.question, obligationId: verifyOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort({ failSteps: ["execute"] }),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.notEqual(run.status, "accepted");
    assert.equal(run.status, "blocked");
    assert.ok(run.stopReason?.includes("capability-failure"));
  }

  // 5. Negative Case 4: Omit review receipt (capability fails on review)
  {
    const fixture = await createTaskFixture(context);
    const { digest, discussOb, planOb, verifyOb } = await setupFiveBoundaryTask(fixture);

    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "discuss", question: discussOb.question, obligationId: discussOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "plan", question: planOb.question, obligationId: planOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "verify", question: verifyOb.question, obligationId: verifyOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort({ failSteps: ["review"] }),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.notEqual(run.status, "accepted");
    assert.equal(run.verdict?.overall, "unknown");
    const pre = run.verdict?.preconditions.find((p) => p.id === "capability-obligations:review");
    assert.ok(pre);
    assert.equal(pre.satisfied, false);
  }

  // 6. Negative Case 5: Omit verify receipt
  {
    const fixture = await createTaskFixture(context);
    const { digest, discussOb, planOb } = await setupFiveBoundaryTask(fixture);

    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "discuss", question: discussOb.question, obligationId: discussOb.id }), fixture.stateRoot);
    await writeCapabilityReceipt(makeValidStepReceipt({ runId, step: "plan", question: planOb.question, obligationId: planOb.id }), fixture.stateRoot);

    const { run } = await startFixtureTask(fixture, {
      ports: {
        ...fixturePorts({
          controller: referenceControllerPort("correct"),
          reviewer: staticReviewerPort(passingReview),
        }),
        capability: fakeDualEvidenceCapabilityPort(),
      },
      expectedDigest: digest,
      requiredBoundaries: allBoundaries,
      runId,
    });

    assert.notEqual(run.status, "accepted");
    assert.equal(run.verdict?.overall, "unknown");
    const pre = run.verdict?.preconditions.find((p) => p.id === "capability-obligations:verify");
    assert.ok(pre);
    assert.equal(pre.satisfied, false);
  }
});

test("CAP-03: ordinary interactive GSD contract does not start autopilot execution", async (context) => {
  const fixture = await createTaskFixture(context);
  const rawContract = {
    ...inventorySummaryContract(fixture.projectRoot),
    mode: "interactive" as any, // ordinary interactive GSD, not autopilot
  };
  await writeTaskContract(fixture.contractPath, rawContract);

  await assert.rejects(
    () => previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot }),
    (err: any) => err instanceof TaskContractError && err.code === "contract-invalid",
  );
});
