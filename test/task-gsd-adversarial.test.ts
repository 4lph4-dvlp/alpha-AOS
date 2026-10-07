import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  executeGsdStep,
  runPhaseLifecycle,
} from "../src/core/task-gsd-lifecycle.js";
import {
  createCapabilityReceipt,
  verifyRequiredCapabilityReceipts,
  writeCapabilityReceipt,
} from "../src/core/task-capability-receipts.js";
import {
  readHookReceipt,
} from "../src/core/task-hook-receipt.js";
import {
  verifyReviewWitness,
  writeReviewWitnessReceipt,
  type ReviewWitnessReceipt,
} from "../src/core/task-review-witness.js";
import {
  discoverPhaseProgression,
  readImmutablePlanDecisions,
  selectNextPendingPlan,
  verifyPlanTripleCorrelation,
} from "../src/core/task-gsd-discovery.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";
import type { TaskContract } from "../src/core/task-contract.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-adversarial-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function createMockContract(projectRoot: string, overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    id: "test-contract-adversarial",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Adversarial fault injection tests",
    scope: {
      projectRoot,
      workflow: "gsd-quick",
      summary: "Adversarial test suite",
    },
    allowedRoots: [projectRoot],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        title: "Test criterion",
        description: "Must pass tests",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "node test.js",
          inputText: "",
          expect: { exitCode: 0, stdoutJson: null, stderrJson: null },
        },
      },
    ],
    agentPolicy: {
      controller: "antigravity",
      executor: "claude",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {
      maxCycles: 10,
    },
    ...overrides,
  } as TaskContract;
}

// -----------------------------------------------------------------------------
// Scenario 1 (FIX-01: Hook failure blocks execution)
// -----------------------------------------------------------------------------
test("FIX-01: Mandatory lifecycle hook failure halts execution fail-closed with receipt (D-13, D-15)", async (context) => {
  const parent = await scratch(context, "fix01-hook-fail");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;
  const receiptsRoot = join(projectRoot, "receipts");
  const contract = createMockContract(projectRoot);

  const headSha = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  // Create a mock step script that should never run if hook fails
  const stepScriptPath = join(projectRoot, "mock-step.cjs");
  const canaryFile = join(projectRoot, "canary.txt");
  await writeFile(stepScriptPath, `
    const fs = require('fs');
    fs.writeFileSync(${JSON.stringify(canaryFile)}, 'SHOULD_NOT_EXIST');
    process.exit(0);
  `, "utf8");

  // Create a failing hook script
  const failingHookPath = join(projectRoot, "failing-hook.cjs");
  await writeFile(failingHookPath, `
    console.error("Hook rejected: policy violation detected in pre-step hook");
    process.exit(1);
  `, "utf8");

  // Attempt to execute step with failing hook
  await assert.rejects(
    async () => {
      await executeGsdStep({
        projectRoot,
        phaseId: "17-gsd-lifecycle-bridge",
        step: "discuss",
        contract,
        targetRevisionSha: headSha,
        workingTreeDigest: "0".repeat(64),
        receiptsRoot,
        hookCommand: process.execPath,
        hookArgs: [failingHookPath],
        stepCommand: {
          executable: process.execPath,
          args: [stepScriptPath],
        },
      });
    },
    /HOOK_EXECUTION_FAILED/,
    "Failing hook must immediately throw HOOK_EXECUTION_FAILED",
  );

  // Assert step process never executed (canary file not created)
  const { existsSync } = await import("node:fs");
  assert.equal(existsSync(canaryFile), false, "Step must not run when pre-hook fails");

  // Assert failed hook receipt was recorded
  const receipt = await readHookReceipt({
    phaseId: "17-gsd-lifecycle-bridge",
    hookPoint: "discuss:pre",
    receiptsRoot,
  });
  assert.ok(receipt);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.exitCode, 1);
});

// -----------------------------------------------------------------------------
// Scenario 2 (FIX-02: Missing required artifact rejects acceptance)
// -----------------------------------------------------------------------------
test("FIX-02: Missing required summary artifact prevents triple correlation and task acceptance (D-10, D-15, SC 4)", async (context) => {
  const parent = await scratch(context, "fix02-missing-artifact");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  // 1. Leg 1: PLAN exists, but SUMMARY.md is intentionally absent!
  await writeFile(join(phaseDir, "17-01-PLAN.md"), "# Plan 17-01\n", "utf8");

  // 2. Leg 2: STATE.md falsely claims complete
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n\n| Phase | Plan | Status |\n| 17 | 17-01 | complete |\n",
    "utf8",
  );

  // 3. Leg 3: Git commit falsely claims docs(17-01):
  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-01): falsely claims complete"]);

  // Verify triple correlation fails closed
  const proof = await verifyPlanTripleCorrelation({
    projectRoot,
    phaseId: "17",
    planId: "01",
  });

  assert.equal(proof.completed, false, "Triple correlation must reject when summary artifact is missing");
  assert.equal(proof.hasSummary, false);
  assert.equal(proof.hasStateRow, true);
  assert.equal(proof.hasGitCommit, true);

  // Discover progression must report phase incomplete and plan pending
  const progression = await discoverPhaseProgression({
    projectRoot,
    phaseId: "17",
  });
  assert.equal(progression.isPhaseComplete, false);
  assert.deepEqual(progression.pendingPlans, ["01"]);
});

// -----------------------------------------------------------------------------
// Scenario 3 (FIX-03: Interrupted resume preserves completed plans and frozen scope)
// -----------------------------------------------------------------------------
test("FIX-03: Interrupted resume skips completed plans and preserves immutable scope decisions (D-10, D-11, D-15, SC 4)", async (context) => {
  const parent = await scratch(context, "fix03-interrupted-resume");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  // CONTEXT.md with approved scope decisions
  const contextContent = [
    "# Phase 17 Context",
    "",
    "## Implementation Decisions",
    "- D-01: Freeze sqlite storage; do not adopt external mongo.",
    "- D-02: Retain synchronous hash calculation.",
    "",
  ].join("\n");
  await writeFile(join(phaseDir, "17-CONTEXT.md"), contextContent, "utf8");

  // Plan 01 is fully completed (Triple Correlation: Summary, State, Commit)
  await writeFile(join(phaseDir, "17-01-PLAN.md"), "# Plan 01\n", "utf8");
  await writeFile(join(phaseDir, "17-01-SUMMARY.md"), "# Summary 01\n", "utf8");

  // Plan 02 is pending (Plan exists, no summary)
  await writeFile(join(phaseDir, "17-02-PLAN.md"), "# Plan 02\n", "utf8");

  // STATE.md has Plan 01 complete, Plan 02 pending
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n\n| Phase | Plan | Status |\n| 17 | 17-01 | complete |\n| 17 | 17-02 | pending |\n",
    "utf8",
  );

  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-01): complete plan summary"]);

  // 1. Discover progression
  const progression = await discoverPhaseProgression({
    projectRoot,
    phaseId: "17",
  });

  assert.equal(progression.completedPlans.length, 1);
  assert.equal(progression.completedPlans[0]?.planId, "01");
  assert.deepEqual(progression.pendingPlans, ["02"]);

  // 2. selectNextPendingPlan skips completed 01 and resumes at 02
  const nextPlan = selectNextPendingPlan(progression);
  assert.equal(nextPlan, "02", "Resume must skip Plan 01 and select Plan 02");

  // 3. readImmutablePlanDecisions locks scope without defaulting new decisions
  const decisions = await readImmutablePlanDecisions({
    projectRoot,
    phaseId: "17",
    planId: "02",
  });

  assert.equal(decisions.contextLocked, true);
  assert.equal(decisions.planLocked, true);
  assert.ok(decisions.lockedDecisions.length >= 2);
  assert.ok(decisions.lockedDecisions.some((d) => d.includes("Freeze sqlite storage")));
});

// -----------------------------------------------------------------------------
// Scenario 4 (FIX-04: Stale or tampered review witness rejected)
// -----------------------------------------------------------------------------
test("FIX-04: Stale revision or 1-byte artifact divergence triggers STALE_REVIEW_REFUSED (D-14, D-15, SC 3)", async (context) => {
  const parent = await scratch(context, "fix04-stale-witness");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const commitC1 = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  const artifactA1 = "a".repeat(64);

  // 1. Valid review witness for Commit C1 and Artifact A1
  const validWitness: ReviewWitnessReceipt = {
    schemaVersion: 1,
    kind: "review-witness-receipt",
    requestId: "req-1",
    sessionId: "sess-1",
    reviewerHarness: "codex",
    reviewerVersion: "1.0.0",
    targetRevisionSha: commitC1,
    artifactDigest: artifactA1,
    witnessVerdict: "accepted",
    examinedAt: "2026-10-03T00:00:00.000Z",
    criteriaWitnessed: [{ criterionId: "crit-1", verdict: "pass" }],
    reportDigest: "b".repeat(64),
    receiptDigest: "c".repeat(64),
  };

  // Check 1: Baseline match passes
  const baselineCheck = verifyReviewWitness({
    receipt: validWitness,
    currentHeadSha: commitC1,
    currentArtifactDigest: artifactA1,
  });
  assert.equal(baselineCheck.valid, true);
  assert.equal(baselineCheck.refusalCode, null);

  // Check 2: Git HEAD advances to commit C2 -> triggers STALE_REVIEW_REFUSED
  await writeFile(join(projectRoot, "change.txt"), "post review edit\n", "utf8");
  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "feat: post-review commit C2"]);
  const commitC2 = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
  assert.notEqual(commitC1, commitC2);

  const staleCommitCheck = verifyReviewWitness({
    receipt: validWitness,
    currentHeadSha: commitC2,
    currentArtifactDigest: artifactA1,
  });
  assert.equal(staleCommitCheck.valid, false);
  assert.equal(staleCommitCheck.refusalCode, "STALE_REVIEW_REFUSED");
  assert.match(staleCommitCheck.reason!, /evaluated git revision/);

  // Check 3: 1-byte artifact modification -> triggers STALE_REVIEW_REFUSED
  const mutatedArtifactA2 = "f" + artifactA1.slice(1);
  const tamperedArtifactCheck = verifyReviewWitness({
    receipt: validWitness,
    currentHeadSha: commitC1,
    currentArtifactDigest: mutatedArtifactA2,
  });
  assert.equal(tamperedArtifactCheck.valid, false);
  assert.equal(tamperedArtifactCheck.refusalCode, "STALE_REVIEW_REFUSED");
  assert.match(tamperedArtifactCheck.reason!, /evaluated artifact/);

  // Check 4: Missing review witness -> triggers MISSING_REVIEW_WITNESS
  const missingCheck = verifyReviewWitness({
    receipt: null,
    currentHeadSha: commitC1,
    currentArtifactDigest: artifactA1,
  });
  assert.equal(missingCheck.valid, false);
  assert.equal(missingCheck.refusalCode, "MISSING_REVIEW_WITNESS");
});

// -----------------------------------------------------------------------------
// Scenario 5 (ADV-05: Step order tampering and cross-step receipt injection)
// -----------------------------------------------------------------------------
test("ADV-05: Cross-step receipt injection or tampered step identity fails verification closed (CAP-03, CAP-05, D-09)", async () => {
  const runId = "00000001-00000001";
  const question = "Consult documentation-lookup for API v2.";

  const obligation = {
    id: "ob-execute-1",
    capabilityId: "documentation-lookup",
    step: "execute" as const,
    question,
    required: true,
    scope: "/project",
    source: "context7",
    version: "stable",
  };

  // Tampered receipt: marked with step "verify" instead of "execute"
  const tamperedReceipt = createCapabilityReceipt({
    runId,
    step: "verify", // wrong step
    capabilityId: "documentation-lookup",
    obligationId: obligation.id,
    question,
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "codex.exe",
    sessionId: "sess-1",
    skillActivationReceiptId: "act-1",
    mcpObservationId: "mcp-1",
    source: "context7",
    sourceVersion: "stable",
    observationId: "obs-1",
    rawResultSha256: createHash("sha256").update("doc", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [obligation],
    receipts: [tamperedReceipt],
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: "sess-1",
  });

  assert.equal(verification.satisfied, false, "Cross-step receipt must fail verification");
  assert.equal(verification.failedReceipts.length, 1);
  assert.equal(verification.missingObligations.length, 1);
  assert.equal(verification.precondition.satisfied, false);
});

// -----------------------------------------------------------------------------
// Scenario 6 (ADV-06: Empty obligation question fails verification closed)
// -----------------------------------------------------------------------------
test("ADV-06: Empty obligation question or blank capability fails verification closed (CAP-03, CAP-05)", async () => {
  const runId = "00000001-00000001";

  // Injected obligation with empty question
  const blankQuestionObligation = {
    id: "ob-blank-q",
    capabilityId: "documentation-lookup",
    step: "execute" as const,
    question: "   ", // blank/whitespace
    required: true,
    scope: "/project",
    source: "context7",
    version: "stable",
  };

  const receipt = createCapabilityReceipt({
    runId,
    step: "execute",
    capabilityId: "documentation-lookup",
    obligationId: blankQuestionObligation.id,
    question: "   ",
    selected: true,
    invoked: true,
    outcome: "ok",
    invokedAt: new Date().toISOString(),
    toolName: "context7",
    harness: "codex",
    harnessVersion: "1.0.0",
    harnessExecutable: "codex.exe",
    sessionId: "sess-1",
    skillActivationReceiptId: "act-1",
    mcpObservationId: "mcp-1",
    source: "context7",
    sourceVersion: "stable",
    observationId: "obs-1",
    rawResultSha256: createHash("sha256").update("doc", "utf8").digest("hex"),
    isReused: false,
    originalReceiptId: null,
    isError: false,
    errorMessage: null,
  });

  const verification = verifyRequiredCapabilityReceipts({
    obligations: [blankQuestionObligation],
    receipts: [receipt],
    currentRunId: runId,
    currentStep: "execute",
    currentSessionId: "sess-1",
  });

  assert.equal(verification.satisfied, false, "Blank obligation question must never be satisfied");
  assert.equal(verification.missingObligations.length, 1);
  assert.equal(verification.precondition.satisfied, false);
});

// -----------------------------------------------------------------------------
// Scenario 7 (ADV-07: Process exit 0 without capability call fails closed)
// -----------------------------------------------------------------------------
test("ADV-07: Process exit code 0 without required capability invocation cannot forge accepted verdict (CAP-03, CAP-05)", async (context) => {
  const parent = await scratch(context, "adv07-fake-success");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;
  const receiptsRoot = join(projectRoot, "receipts");
  const headSha = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  const contract = createMockContract(projectRoot, {
    goal: "Consult documentation-lookup for API v2.",
  });

  // Step script exits 0 claiming complete success, but capabilityPort is omitted
  const stepScriptPath = join(projectRoot, "step-exit-0.cjs");
  await writeFile(stepScriptPath, "process.exit(0);\n", "utf8");

  const result = await executeGsdStep({
    projectRoot,
    phaseId: "18-capability-fabric-and-automatic-invocation",
    step: "execute",
    contract,
    targetRevisionSha: headSha,
    workingTreeDigest: "0".repeat(64),
    receiptsRoot,
    stepCommand: {
      executable: process.execPath,
      args: [stepScriptPath],
    },
    // No capabilityPort provided!
  });

  assert.equal(result.nextStep, "failed", "Execution must fail closed when required capability is missing");
  assert.ok(result.obligations?.some((o) => o.required));
});

