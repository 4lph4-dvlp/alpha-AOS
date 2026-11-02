import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  previewTaskContract,
  type TaskContract,
} from "../src/core/task-contract.js";
import {
  startTask,
  type ControllerPort,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type TaskPorts,
} from "../src/core/task-run.js";
import type { GsdQuickStage } from "../src/core/task-gsd-stages.js";
import { inspectTaskIntake } from "../src/core/task-intake.js";
import { resolveTaskExecutionRoute } from "../src/core/task-style.js";
import {
  createTaskFixture,
  fixturePorts,
  fixtureQuickId,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  simulateGsdQuick,
  staticReviewerPort,
  writeInventorySummaryImplementation,
  writeTaskContract,
} from "./helpers/task-fixture.js";

function fileSha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

interface StageDef {
  stage: GsdQuickStage;
  outcome?: "passed" | "failed" | "skipped" | "needs-input" | "unknown";
  detail?: string;
  evaluatedCommit?: string | null;
  inputArtifacts?: { path: string; sha256: string }[];
  outputArtifacts?: { path: string; sha256: string }[];
}

function fullFixturePorts(controller: ControllerPort, reviewer = staticReviewerPort(passingReview)): TaskPorts {
  return {
    ...fixturePorts({
      controller,
      reviewer,
    }),
    stageObservation: { supported: true, harness: "codex" },
  };
}

function fullControllerPort(options?: {
  omitStages?: GsdQuickStage[];
  stageOverrides?: Partial<Record<GsdQuickStage, Partial<StageDef>>>;
}): ControllerPort {
  return {
    async dispatch(request: ControllerDispatchRequest): Promise<ControllerDispatchResult> {
      await writeInventorySummaryImplementation(request.projectRoot, "correct");
      const quickId = fixtureQuickId(request.runId);
      await simulateGsdQuick(request.projectRoot, {
        quickId,
        slug: "inventory-summary",
        description: "Add the inventory-summary CLI",
      });

      const planPath = `.planning/quick/${quickId}-inventory-summary/${quickId}-PLAN.md`;
      const summaryPath = `.planning/quick/${quickId}-inventory-summary/${quickId}-SUMMARY.md`;
      const planBytes = await readFile(join(request.projectRoot, planPath));
      const summaryBytes = await readFile(join(request.projectRoot, summaryPath));
      const binBytes = await readFile(join(request.projectRoot, "bin/inventory-summary.mjs"));

      const planRef = { path: planPath, sha256: fileSha256(planBytes) };
      const summaryRef = { path: summaryPath, sha256: fileSha256(summaryBytes) };
      const binRef = { path: "bin/inventory-summary.mjs", sha256: fileSha256(binBytes) };

      const allStages: StageDef[] = [
        { stage: "discussion", outcome: "passed", inputArtifacts: [], outputArtifacts: [] },
        { stage: "research", outcome: "passed", inputArtifacts: [], outputArtifacts: [] },
        { stage: "planning", outcome: "passed", inputArtifacts: [], outputArtifacts: [planRef] },
        { stage: "plan-check", outcome: "passed", inputArtifacts: [planRef], outputArtifacts: [] },
        { stage: "implementation", outcome: "passed", inputArtifacts: [planRef], outputArtifacts: [binRef] },
        { stage: "verification", outcome: "passed", inputArtifacts: [binRef], outputArtifacts: [] },
        { stage: "state-docs", outcome: "passed", inputArtifacts: [binRef], outputArtifacts: [summaryRef] },
      ];

      const filtered = allStages
        .filter((st) => !options?.omitStages?.includes(st.stage))
        .map((st) => ({
          ...st,
          ...(options?.stageOverrides?.[st.stage] ?? {}),
        }));

      return {
        harness: "codex",
        version: "fixture",
        executable: null,
        sessionId: `fixture-controller-${request.runId}`,
        exitCode: 0,
        processCode: "ok",
        terminal: "completed",
        claim: {
          status: "completed",
          summary: "Implemented bin/inventory-summary.mjs via $gsd-quick --full and observed all stages.",
          authorityRequest: null,
          gsdQuickId: quickId,
        },
        detail: null,
        stageObservation: {
          status: "observed",
          sessionId: `fixture-controller-${request.runId}`,
          stages: filtered.map((st, idx) => ({
            stage: st.stage,
            outcome: st.outcome ?? "passed",
            invocationId: `inv-${st.stage}-${idx}`,
            invocationDigest: fileSha256(`inv-${st.stage}`),
            resultId: `res-${st.stage}-${idx}`,
            resultDigest: fileSha256(`res-${st.stage}`),
            evaluatedCommit: st.evaluatedCommit ?? null,
            inputArtifacts: st.inputArtifacts ?? [],
            outputArtifacts: st.outputArtifacts ?? [],
            observedAt: new Date().toISOString(),
            ...(st.detail ? { detail: st.detail } : {}),
          })),
        },
      };
    },
  };
}

test("Composed Journey 1 & 2: conversational-quick and conversational-quick-full (STYLE-01, STYLE-02, D-01, D-02)", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Conversational-quick intake
  const intakeOrdinary = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot: fixture.projectRoot,
      request: { text: "Add simple logging helper" },
      answer: { canonicalStyle: "conversational-quick" },
    },
  });
  assert.equal(intakeOrdinary.selectedStyle, "conversational-quick");
  assert.equal(intakeOrdinary.executionAuthorized, false);
  const routeOrdinary = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick" });
  assert.ok(routeOrdinary);
  assert.equal(routeOrdinary.surface, "conversation");
  assert.equal(routeOrdinary.quickQuality, "standard");
  assert.equal(routeOrdinary.authorityRequirements.requiresExactApproval, false);

  // 2. Conversational-quick-full intake
  const intakeFull = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot: fixture.projectRoot,
      request: { text: "Refactor core authentication with full quality" },
      answer: { canonicalStyle: "conversational-quick-full" },
    },
  });
  assert.equal(intakeFull.selectedStyle, "conversational-quick-full");
  assert.equal(intakeFull.executionAuthorized, false);
  const routeFull = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick-full" });
  assert.ok(routeFull);
  assert.equal(routeFull.surface, "conversation");
  assert.equal(routeFull.quickQuality, "full");
  assert.equal(routeFull.authorityRequirements.requiresEvidenceValidation, true);
});

test("Composed Journey 3: conversational-phase direct workflow stop timing (STYLE-03, D-02, D-03)", async (context) => {
  const fixture = await createTaskFixture(context);

  // Direct discuss-phase command preserves discuss:post stopping point
  const intakeDiscuss = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot: fixture.projectRoot,
      request: { text: "$gsd-discuss-phase 30" },
    },
  });
  assert.equal(intakeDiscuss.kind, "explicit-command");
  assert.equal(intakeDiscuss.nextAction, "execute-explicit");
  assert.equal(intakeDiscuss.commandRoute?.workflow, "discuss-phase");
  assert.equal(intakeDiscuss.commandRoute?.phase, "30");
  assert.equal(intakeDiscuss.commandRoute?.stoppingPoint, "discuss:post");
});

test("Composed Journey 4 & 5: autopilot-quick and autopilot-quick-full with stage omission and failure (STYLE-04, STYLE-05, D-04, D-14, D-16, D-22)", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Standard autopilot quick contract
  const stdContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "standard",
      summary: "Add inventory-summary CLI standard",
    },
  });
  stdContract.id = "auto-quick-01";
  const stdPath = join(fixture.scratch, "task-std.json");
  await writeTaskContract(stdPath, stdContract);

  const previewStd = await previewTaskContract({ contractPath: stdPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: stdPath, expectedDigest: previewStd.digest, stateRoot: fixture.stateRoot });

  const stdRun = await startTask({
    contractPath: stdPath,
    expectedDigest: previewStd.digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.equal(stdRun.run.status, "accepted");

  // 2. Full autopilot quick contract: positive case
  const fixtureFull = await createTaskFixture(context);
  const fullContract = inventorySummaryContract(fixtureFull.projectRoot, {
    scope: {
      projectRoot: fixtureFull.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI full",
    },
  });
  fullContract.id = "auto-full-01";
  const fullPath = join(fixtureFull.scratch, "task-full.json");
  await writeTaskContract(fullPath, fullContract);

  const previewFull = await previewTaskContract({ contractPath: fullPath, stateRoot: fixtureFull.stateRoot });
  await approveTaskContract({ contractPath: fullPath, expectedDigest: previewFull.digest, stateRoot: fixtureFull.stateRoot });

  const fullRunSuccess = await startTask({
    contractPath: fullPath,
    expectedDigest: previewFull.digest,
    stateRoot: fixtureFull.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort()),
    gsd: { configRoot: fixtureFull.gsdConfigRoot },
  });
  assert.equal(fullRunSuccess.run.status, "accepted");
  assert.equal(fullRunSuccess.run.gsd?.status, "verified");
  assert.equal(fullRunSuccess.run.gsd?.fullEvidence?.status, "verified");

  // 3. Full autopilot quick contract: negative case - omission of mandatory stage 'plan-check'
  const fixtureMissing = await createTaskFixture(context);
  const missingContract = inventorySummaryContract(fixtureMissing.projectRoot, {
    scope: {
      projectRoot: fixtureMissing.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI missing plan-check",
    },
  });
  missingContract.id = "auto-full-missing-stage";
  const missingPath = join(fixtureMissing.scratch, "task-full-missing.json");
  await writeTaskContract(missingPath, missingContract);

  const previewMissing = await previewTaskContract({ contractPath: missingPath, stateRoot: fixtureMissing.stateRoot });
  await approveTaskContract({ contractPath: missingPath, expectedDigest: previewMissing.digest, stateRoot: fixtureMissing.stateRoot });

  const fullRunMissing = await startTask({
    contractPath: missingPath,
    expectedDigest: previewMissing.digest,
    stateRoot: fixtureMissing.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ omitStages: ["plan-check"] })),
    gsd: { configRoot: fixtureMissing.gsdConfigRoot },
  });
  assert.notEqual(fullRunMissing.run.status, "accepted");
  assert.equal(fullRunMissing.run.gsd?.fullEvidence?.status, "missing");
  assert.deepEqual(fullRunMissing.run.gsd?.fullEvidence?.missingStages, ["plan-check"]);

  // 4. Full autopilot quick contract: negative case - failed verification stage
  const fixtureFailed = await createTaskFixture(context);
  const failedContract = inventorySummaryContract(fixtureFailed.projectRoot, {
    scope: {
      projectRoot: fixtureFailed.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI failed verification",
    },
  });
  failedContract.id = "auto-full-failed-stage";
  const failedPath = join(fixtureFailed.scratch, "task-full-failed.json");
  await writeTaskContract(failedPath, failedContract);

  const previewFailed = await previewTaskContract({ contractPath: failedPath, stateRoot: fixtureFailed.stateRoot });
  await approveTaskContract({ contractPath: failedPath, expectedDigest: previewFailed.digest, stateRoot: fixtureFailed.stateRoot });

  const fullRunFailed = await startTask({
    contractPath: failedPath,
    expectedDigest: previewFailed.digest,
    stateRoot: fixtureFailed.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(
      fullControllerPort({
        stageOverrides: {
          verification: { outcome: "failed", detail: "Unit test suite exited with code 1" },
        },
      }),
    ),
    gsd: { configRoot: fixtureFailed.gsdConfigRoot },
  });
  assert.notEqual(fullRunFailed.run.status, "accepted");
  assert.equal(fullRunFailed.run.gsd?.fullEvidence?.status, "failed");
  assert.equal(fullRunFailed.run.gsd?.fullEvidence?.failedStages.length, 1);
  assert.equal(fullRunFailed.run.gsd?.fullEvidence?.failedStages[0]?.stage, "verification");
});

test("Composed Journey 6: approval-only no-launch and unapproved start prevention (STYLE-06, STYLE-07, D-14, D-15)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.id = "approval-only-01";
  await writeTaskContract(fixture.contractPath, contract);

  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });

  // 1. Approval alone does NOT start or launch tasks
  const approved = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approved.status, "approved");

  // Check runs directory: exactly 0 runs created
  const runsDir = join(fixture.stateRoot, "runs", preview.digest);
  let runFiles: string[] = [];
  try {
    const { readdir } = await import("node:fs/promises");
    runFiles = await readdir(runsDir);
  } catch {
    runFiles = [];
  }
  assert.equal(runFiles.length, 0, "Approval alone must create zero task runs");

  // 2. Start without approval fails
  const contract2 = inventorySummaryContract(fixture.projectRoot);
  contract2.id = "unapproved-task-02";
  const path2 = join(fixture.scratch, "unapproved.json");
  await writeTaskContract(path2, contract2);
  const preview2 = await previewTaskContract({ contractPath: path2, stateRoot: fixture.stateRoot });

  await assert.rejects(
    async () => {
      await startTask({
        contractPath: path2,
        expectedDigest: preview2.digest,
        stateRoot: fixture.stateRoot,
        packageRoot: packageRoot(),
        ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
        gsd: { configRoot: fixture.gsdConfigRoot },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /not-approved|not approved/u);
      return true;
    },
  );
});
