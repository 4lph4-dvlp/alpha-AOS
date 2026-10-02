import assert from "node:assert/strict";
import test from "node:test";
import {
  routeVerificationGap,
  createGsdGapPlanArgs,
  createNewPhaseRoadmapArgs,
  evaluateGapProgression,
  requireFullContractReverification,
} from "../src/core/task-gap-router.js";
import type { TaskContract } from "../src/core/task-contract.js";
import {
  computeFailureFingerprint,
  type FailureHistoryEntry,
} from "../src/core/task-strategy.js";

function createMockContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    id: "task-contract-1",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Implement Phase 17 GSD Lifecycle Bridge",
    scope: {
      projectRoot: "D:/dev/alpha-AOS",
      workflow: "gsd-quick",
      summary: "Phase 17 implementation",
    },
    allowedRoots: ["D:/dev/alpha-AOS"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        title: "Criterion 1",
        description: "Must pass tests",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "node test.js",
          inputText: "",
          expect: { exitCode: 0, stdoutJson: null, stdoutEmpty: false, stderrJson: null },
        },
      },
      {
        id: "crit-2",
        title: "Criterion 2",
        description: "Must have clean lint",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "npm run check",
          inputText: "",
          expect: { exitCode: 0, stdoutJson: null, stdoutEmpty: false, stderrJson: null },
        },
      },
    ],
    agentPolicy: {
      controller: "antigravity",
      executor: "claude-code",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {
      maxCycles: 10,
    },
    ...overrides,
  } as TaskContract;
}

test("in-scope criterion failure routes to gap-plan targeting current phase ID (D-05, SC 2)", () => {
  const contract = createMockContract();
  const history: FailureHistoryEntry[] = [];

  const decision = routeVerificationGap({
    contract,
    currentPhaseId: "17-gsd-lifecycle-bridge",
    defectSummary: "Receipt timestamp validation missing timezone offset",
    isScopeExpansion: false,
    history,
  });

  assert.equal(decision.destination, "gap-plan");
  assert.equal(decision.targetPhaseId, "17-gsd-lifecycle-bridge");
  assert.deepEqual(decision.gapIds, ["Receipt timestamp validation missing timezone offset"]);
  assert.match(decision.reason, /within current Phase boundary/);
});

test("architectural and scope expansion defect routes to new-phase in ROADMAP.md (D-05, SC 2)", () => {
  const contract = createMockContract();
  const history: FailureHistoryEntry[] = [];

  const decision = routeVerificationGap({
    contract,
    currentPhaseId: "17-gsd-lifecycle-bridge",
    defectSummary: "Add distributed multi-node consensus across cloud agents",
    isScopeExpansion: true,
    history,
  });

  assert.equal(decision.destination, "new-phase");
  assert.equal(decision.targetPhaseId, undefined);
  assert.deepEqual(decision.gapIds, ["Add distributed multi-node consensus across cloud agents"]);
  assert.match(decision.reason, /new functionality or architectural changes/);
});

test("createGsdGapPlanArgs produces valid CLI arguments for native GSD gap planning (D-06)", () => {
  const args = createGsdGapPlanArgs("17-gsd-lifecycle-bridge", "Fix receipt schema validation");

  assert.deepEqual(args, [
    "query",
    "plan-phase",
    "17-gsd-lifecycle-bridge",
    "--gaps",
    "Fix receipt schema validation",
  ]);
});

test("createNewPhaseRoadmapArgs produces valid CLI arguments for GSD phase addition (D-06)", () => {
  const args = createNewPhaseRoadmapArgs(
    "18-capability-fabric",
    "Multi-agent distributed consensus",
  );

  assert.deepEqual(args, [
    "phase",
    "add",
    "18-capability-fabric",
    "--description",
    "Multi-agent distributed consensus",
  ]);
});

test("evaluateGapProgression advances through 3-stage progression on repeated identical failures (D-08)", () => {
  const emptyProgression = evaluateGapProgression([]);
  assert.equal(emptyProgression.shouldBlock, false);
  assert.equal(emptyProgression.stage, "stage-0-default");
  assert.equal(emptyProgression.failureCount, 0);

  const fp = computeFailureFingerprint("crit-1", "test-failure", "Error: exit code 1");
  const createEntry = (attemptIndex: number): FailureHistoryEntry => ({
    attemptIndex,
    criterionId: "crit-1",
    cause: "test-failure",
    fingerprint: fp,
    rawError: "Error: exit code 1",
  });

  // 1 failure: stage-0-default
  const p1 = evaluateGapProgression([createEntry(1)]);
  assert.equal(p1.shouldBlock, false);
  assert.equal(p1.stage, "stage-0-default");
  assert.equal(p1.failureCount, 1);

  // 2 consecutive failures: activates stage-1-reproduction-injection
  const p2 = evaluateGapProgression([createEntry(1), createEntry(2)]);
  assert.equal(p2.shouldBlock, false);
  assert.equal(p2.stage, "stage-1-reproduction-injection");
  assert.equal(p2.failureCount, 2);

  // 3 consecutive failures: advances to stage-2-single-criterion-focus
  const p3 = evaluateGapProgression([createEntry(1), createEntry(2), createEntry(3)]);
  assert.equal(p3.shouldBlock, false);
  assert.equal(p3.stage, "stage-2-single-criterion-focus");
  assert.equal(p3.failureCount, 3);

  // 4 consecutive failures: exhausts alternatives and reaches stage-3-blocked
  const p4 = evaluateGapProgression([
    createEntry(1),
    createEntry(2),
    createEntry(3),
    createEntry(4),
  ]);
  assert.equal(p4.shouldBlock, true);
  assert.equal(p4.stage, "stage-3-blocked");
  assert.equal(p4.failureCount, 4);
});

test("routeVerificationGap returns destination blocked when stage-3-blocked is reached (D-08)", () => {
  const contract = createMockContract();
  const fp = computeFailureFingerprint("crit-1", "test-failure", "SyntaxError: Unexpected token");
  const history: FailureHistoryEntry[] = [1, 2, 3, 4].map((i) => ({
    attemptIndex: i,
    criterionId: "crit-1",
    cause: "test-failure",
    fingerprint: fp,
    rawError: "SyntaxError: Unexpected token",
  }));

  const decision = routeVerificationGap({
    contract,
    currentPhaseId: "17-gsd-lifecycle-bridge",
    defectSummary: "Syntax error persists",
    isScopeExpansion: false,
    history,
  });

  assert.equal(decision.destination, "blocked");
  assert.match(decision.reason, /Anti-loop triggered: 2\+ identical failures exhausted alternatives/);
  assert.deepEqual(decision.gapIds, []);
  assert.equal(decision.strategy?.stage, "stage-3-blocked");
  assert.equal(decision.strategy?.blockedReport?.status, "blocked");
});

test("requireFullContractReverification requires all contract criteria for anti-regression (D-07)", () => {
  const contract = createMockContract();
  assert.equal(contract.criterion.length, 2);

  // Only crit-1 had a gap, but full verification requires crit-1 AND crit-2
  const reverification = requireFullContractReverification(contract, ["crit-1"]);

  assert.equal(reverification.regressionCheckMandatory, true);
  assert.deepEqual(reverification.requiredCriteria, ["crit-1", "crit-2"]);
});

