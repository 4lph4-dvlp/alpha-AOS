import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { approveTaskContract, previewTaskContract, type TaskContract } from "../src/core/task-contract.js";
import { packageRoot } from "../src/core/paths.js";
import {
  startTask,
  type ControllerPort,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
} from "../src/core/task-run.js";
import type { GsdQuickStage, TaskGsdStageReceipt } from "../src/core/task-gsd-stages.js";
import { formatTaskRunReport } from "../src/format.js";
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

function fullFixturePorts(controller: ControllerPort, reviewer = staticReviewerPort(passingReview)): import("../src/core/task-run.js").TaskPorts {
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
  fakeFullClaimOnly?: boolean;
  staleCheckerPlan?: boolean;
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

      if (options?.fakeFullClaimOnly) {
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
            summary: "Completed via $gsd-quick --full with exit 0",
            authorityRequest: null,
            gsdQuickId: quickId,
          },
          detail: null,
        };
      }

      const planPath = `.planning/quick/${quickId}-inventory-summary/${quickId}-PLAN.md`;
      const summaryPath = `.planning/quick/${quickId}-inventory-summary/${quickId}-SUMMARY.md`;
      const planBytes = await readFile(join(request.projectRoot, planPath));
      const summaryBytes = await readFile(join(request.projectRoot, summaryPath));
      const binBytes = await readFile(join(request.projectRoot, "bin/inventory-summary.mjs"));

      const planRef = { path: planPath, sha256: fileSha256(planBytes) };
      const summaryRef = { path: summaryPath, sha256: fileSha256(summaryBytes) };
      const binRef = { path: "bin/inventory-summary.mjs", sha256: fileSha256(binBytes) };
      const checkerPlanRef = options?.staleCheckerPlan
        ? { path: planPath, sha256: fileSha256("stale-outdated-plan-content") }
        : planRef;

      const allStages: StageDef[] = [
        { stage: "discussion", outcome: "passed", inputArtifacts: [], outputArtifacts: [] },
        { stage: "research", outcome: "passed", inputArtifacts: [], outputArtifacts: [] },
        { stage: "planning", outcome: "passed", inputArtifacts: [], outputArtifacts: [planRef] },
        { stage: "plan-check", outcome: "passed", inputArtifacts: [checkerPlanRef], outputArtifacts: [] },
        { stage: "implementation", outcome: "passed", inputArtifacts: [planRef], outputArtifacts: [binRef] },
        { stage: "verification", outcome: "passed", inputArtifacts: [binRef], outputArtifacts: [] },
        { stage: "state-docs", outcome: "passed", inputArtifacts: [binRef], outputArtifacts: [summaryRef] },
      ];

      const filtered = allStages
        .filter((st) => !options?.omitStages?.includes(st.stage))
        .map((st) => {
          const override = options?.stageOverrides?.[st.stage];
          return {
            ...st,
            ...override,
          };
        });

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

test("task-gsd-full-run: valid full run produces accepted verdict with fullEvidence verified", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort()),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "accepted");
  assert.equal(run.gsd?.status, "verified");
  assert.equal(run.gsd?.fullEvidence?.status, "verified");
  assert.equal(run.gsd?.fullEvidence?.missingStages.length, 0);
  assert.equal(run.gsd?.fullEvidence?.failedStages.length, 0);
  assert.equal(run.gsd?.fullEvidence?.invalidReceipts.length, 0);
  assert.equal(run.gsd?.fullEvidence?.stages.length, 7);

  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, true);

  const report = formatTaskRunReport(run);
  assert.match(report, /Status: ACCEPTED/u);
  assert.match(report, /Full quality stages: verified/u);
  assert.match(report, /plan-check: passed/u);
});

test("task-gsd-full-run: ordinary-only evidence is refused for full quality contract (not accepted)", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  // Use referenceControllerPort which only provides ordinary quick artifacts and exit 0
  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(referenceControllerPort("correct")),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.notEqual(run.status, "accepted");
  assert.equal(run.status, "unknown");
  assert.equal(run.gsd?.fullEvidence?.status, "missing");
  assert.ok((run.gsd?.fullEvidence?.missingStages.length ?? 0) > 0);

  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
  assert.match(fullPrecond.reason, /missing required full stages/u);

  const report = formatTaskRunReport(run);
  assert.match(report, /Status: UNKNOWN/u);
  assert.match(report, /Unsatisfied Preconditions:/u);
  assert.match(report, /full-quality-stages/u);
});

test("task-gsd-full-run: fake --full claim with exit 0 is not accepted without stage receipts", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ fakeFullClaimOnly: true })),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.notEqual(run.status, "accepted");
  assert.equal(run.status, "unknown");
  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
});

test("task-gsd-full-run: missing verification stage fails acceptance", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ omitStages: ["verification"] })),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "unknown");
  assert.equal(run.gsd?.fullEvidence?.status, "missing");
  assert.deepEqual(run.gsd?.fullEvidence?.missingStages, ["verification"]);

  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
  assert.match(fullPrecond.reason, /missing required full stages: verification/u);
});

test("task-gsd-full-run: failed plan-check stage fails acceptance", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(
      fullControllerPort({
        stageOverrides: {
          "plan-check": { outcome: "failed", detail: "Plan quality check found missing test criteria" },
        },
      }),
    ),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "unknown");
  assert.equal(run.gsd?.fullEvidence?.status, "failed");
  assert.equal(run.gsd?.fullEvidence?.failedStages.length, 1);
  assert.equal(run.gsd?.fullEvidence?.failedStages[0]?.stage, "plan-check");

  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
  assert.match(fullPrecond.reason, /full stages failed: plan-check/u);
});

test("task-gsd-full-run: unknown stage outcome fails acceptance", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(
      fullControllerPort({
        stageOverrides: {
          verification: { outcome: "unknown", detail: "Verification could not be conclusively determined" },
        },
      }),
    ),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "unknown");
  assert.equal(run.gsd?.fullEvidence?.status, "failed");
  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
});

test("task-gsd-full-run: stale checker plan with altered hash fails acceptance", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ staleCheckerPlan: true })),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "unknown");
  assert.equal(run.gsd?.fullEvidence?.status, "invalid");
  assert.ok((run.gsd?.fullEvidence?.invalidReceipts.length ?? 0) > 0);

  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.ok(fullPrecond);
  assert.equal(fullPrecond.satisfied, false);
  assert.match(fullPrecond.reason, /invalid or tampered stage receipts/u);
});

test("task-gsd-full-run: standard quality contract still accepts ordinary quick evidence", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "standard",
      summary: "Add inventory-summary CLI with standard quality",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { run } = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });

  assert.equal(run.status, "accepted");
  assert.equal(run.gsd?.status, "verified");
  // No full evidence required or generated for standard
  assert.equal(run.gsd?.fullEvidence, undefined);
  const fullPrecond = run.verdict?.preconditions.find((p) => p.id === "full-quality-stages");
  assert.equal(fullPrecond, undefined);
});

test("task-gsd-full-run: same-run full resume reuses valid stages, preserves dirty WIP, and maintains 1 quick directory", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI with full quality and resume",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  let attemptCount = 0;
  let sharedQuickId = "";

  const resumingController: ControllerPort = {
    async dispatch(request) {
      attemptCount++;
      if (attemptCount === 1) {
        await writeInventorySummaryImplementation(request.projectRoot, "correct");
      }
      if (!sharedQuickId) {
        sharedQuickId = fixtureQuickId(request.runId);
        await simulateGsdQuick(request.projectRoot, {
          quickId: sharedQuickId,
          slug: "inventory-summary",
          description: "Add the inventory-summary CLI",
        });
      }

      const planPath = `.planning/quick/${sharedQuickId}-inventory-summary/${sharedQuickId}-PLAN.md`;
      const summaryPath = `.planning/quick/${sharedQuickId}-inventory-summary/${sharedQuickId}-SUMMARY.md`;
      const planBytes = await readFile(join(request.projectRoot, planPath));
      const summaryBytes = await readFile(join(request.projectRoot, summaryPath));
      const binBytes = await readFile(join(request.projectRoot, "bin/inventory-summary.mjs"));

      const planRef = { path: planPath, sha256: fileSha256(planBytes) };
      const summaryRef = { path: summaryPath, sha256: fileSha256(summaryBytes) };
      const binRef = { path: "bin/inventory-summary.mjs", sha256: fileSha256(binBytes) };

      if (attemptCount === 1) {
        // Attempt 1: only completes planning & plan-check, leaves uncommitted WIP in bin/
        return {
          harness: "codex",
          version: "fixture",
          executable: null,
          sessionId: `fixture-controller-${request.runId}-att1`,
          exitCode: 0,
          processCode: "ok",
          terminal: "interrupted",
          claim: {
            status: "completed",
            summary: "Interrupted after plan-check",
            authorityRequest: null,
            gsdQuickId: sharedQuickId,
          },
          detail: null,
          stageObservation: {
            status: "observed",
            sessionId: `fixture-controller-${request.runId}-att1`,
            stages: [
              { stage: "discussion", outcome: "passed", invocationId: "inv-1", invocationDigest: fileSha256("inv-1"), resultId: "res-1", resultDigest: fileSha256("res-1"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [], observedAt: new Date().toISOString() },
              { stage: "research", outcome: "passed", invocationId: "inv-2", invocationDigest: fileSha256("inv-2"), resultId: "res-2", resultDigest: fileSha256("res-2"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [], observedAt: new Date().toISOString() },
              { stage: "planning", outcome: "passed", invocationId: "inv-3", invocationDigest: fileSha256("inv-3"), resultId: "res-3", resultDigest: fileSha256("res-3"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [planRef], observedAt: new Date().toISOString() },
              { stage: "plan-check", outcome: "passed", invocationId: "inv-4", invocationDigest: fileSha256("inv-4"), resultId: "res-4", resultDigest: fileSha256("res-4"), evaluatedCommit: null, inputArtifacts: [planRef], outputArtifacts: [], observedAt: new Date().toISOString() },
            ],
          },
        };
      }

      // Attempt 2: completes all 7 stages reusing existing quick
      return {
        harness: "codex",
        version: "fixture",
        executable: null,
        sessionId: `fixture-controller-${request.runId}-att2`,
        exitCode: 0,
        processCode: "ok",
        terminal: "completed",
        claim: {
          status: "completed",
          summary: "Resumed and completed all remaining stages.",
          authorityRequest: null,
          gsdQuickId: sharedQuickId,
        },
        detail: null,
        stageObservation: {
          status: "observed",
          sessionId: `fixture-controller-${request.runId}-att2`,
          stages: [
            { stage: "discussion", outcome: "passed", invocationId: "inv-1", invocationDigest: fileSha256("inv-1"), resultId: "res-1", resultDigest: fileSha256("res-1"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [], observedAt: new Date().toISOString() },
            { stage: "research", outcome: "passed", invocationId: "inv-2", invocationDigest: fileSha256("inv-2"), resultId: "res-2", resultDigest: fileSha256("res-2"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [], observedAt: new Date().toISOString() },
            { stage: "planning", outcome: "passed", invocationId: "inv-3", invocationDigest: fileSha256("inv-3"), resultId: "res-3", resultDigest: fileSha256("res-3"), evaluatedCommit: null, inputArtifacts: [], outputArtifacts: [planRef], observedAt: new Date().toISOString() },
            { stage: "plan-check", outcome: "passed", invocationId: "inv-4", invocationDigest: fileSha256("inv-4"), resultId: "res-4", resultDigest: fileSha256("res-4"), evaluatedCommit: null, inputArtifacts: [planRef], outputArtifacts: [], observedAt: new Date().toISOString() },
            { stage: "implementation", outcome: "passed", invocationId: "inv-5", invocationDigest: fileSha256("inv-5"), resultId: "res-5", resultDigest: fileSha256("res-5"), evaluatedCommit: null, inputArtifacts: [planRef], outputArtifacts: [binRef], observedAt: new Date().toISOString() },
            { stage: "verification", outcome: "passed", invocationId: "inv-6", invocationDigest: fileSha256("inv-6"), resultId: "res-6", resultDigest: fileSha256("res-6"), evaluatedCommit: null, inputArtifacts: [binRef], outputArtifacts: [], observedAt: new Date().toISOString() },
            { stage: "state-docs", outcome: "passed", invocationId: "inv-7", invocationDigest: fileSha256("inv-7"), resultId: "res-7", resultDigest: fileSha256("res-7"), evaluatedCommit: null, inputArtifacts: [binRef], outputArtifacts: [summaryRef], observedAt: new Date().toISOString() },
          ],
        },
      };
    },
  };

  // Run attempt 1
  const run1 = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(resumingController),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.equal(run1.run.status, "unknown"); // Missing stages 5-7

  // Record checkpoint for supervisor recovery
  const { writeCheckpoint } = await import("../src/core/task-journal.js");
  const { runGitRead } = await import("../src/core/task-gsd.js");
  const currentHead = (await runGitRead(fixture.projectRoot, ["rev-parse", "HEAD"])).trim();
  await writeCheckpoint(fixture.stateRoot, {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: baseContract.id,
    revision: 1,
    status: "stopped",
    attemptIndex: 1,
    lastSequence: 1,
    baseCommit: run1.run.baseCommit,
    lastVerifiedHead: currentHead,
    quickId: sharedQuickId,
    usage: { cycles: 1, wallTimeMs: 100, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  });

  // Run attempt 2 (resume with allowPriorRun: true)
  const run2 = await startTask({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(resumingController),
    gsd: { configRoot: fixture.gsdConfigRoot },
    allowPriorRun: true,
  });

  assert.equal(run2.run.status, "accepted");
  assert.equal(run2.run.gsd?.fullEvidence?.status, "verified");

  // Verify that only 1 quick directory was created
  const { readdir } = await import("node:fs/promises");
  const quickDirs = await readdir(join(fixture.projectRoot, ".planning", "quick"));
  assert.equal(quickDirs.length, 1);
  assert.equal(attemptCount, 2);
});

test("task-gsd-full-run: resumeTask refuses ambiguous quick directories", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { writeCheckpoint } = await import("../src/core/task-journal.js");
  const { resumeTask } = await import("../src/core/task-supervisor.js");
  const { mkdir } = await import("node:fs/promises");

  // Create two conflicting quick directories
  await mkdir(join(fixture.projectRoot, ".planning", "quick", "quick-1-first"), { recursive: true });
  await mkdir(join(fixture.projectRoot, ".planning", "quick", "quick-2-second"), { recursive: true });

  await writeCheckpoint(fixture.stateRoot, {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: baseContract.id,
    revision: 1,
    status: "stopped",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 100, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  });

  await assert.rejects(
    resumeTask({
      contractPath: fixture.contractPath,
      expectedDigest: digest,
      stateRoot: fixture.stateRoot,
      packageRoot: packageRoot(),
      ports: fullFixturePorts(fullControllerPort()),
    }),
    /Cannot resume task: multiple quick directories found under \.planning\/quick\//u,
  );
});

test("task-gsd-full-run: resumeTask refuses incompatible workflow hash", async (t) => {
  const fixture = await createTaskFixture(t);
  const baseContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI",
    },
  });
  await writeTaskContract(fixture.contractPath, baseContract);
  const { digest } = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot });

  const { writeCheckpoint } = await import("../src/core/task-journal.js");
  const { resumeTask } = await import("../src/core/task-supervisor.js");

  await writeCheckpoint(fixture.stateRoot, {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: baseContract.id,
    revision: 1,
    status: "stopped",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    workflowSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    usage: { cycles: 1, wallTimeMs: 100, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  });

  await assert.rejects(
    resumeTask({
      contractPath: fixture.contractPath,
      expectedDigest: digest,
      stateRoot: fixture.stateRoot,
      packageRoot: packageRoot(),
      ports: fullFixturePorts(fullControllerPort()),
      gsd: { configRoot: fixture.gsdConfigRoot },
    }),
    /Cannot resume task: incompatible workflow hash/u,
  );
});

