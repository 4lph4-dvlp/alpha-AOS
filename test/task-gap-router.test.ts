import assert from "node:assert/strict";
import test from "node:test";
import {
  routeVerificationGap,
  createGsdGapPlanArgs,
  createNewPhaseRoadmapArgs,
} from "../src/core/task-gap-router.js";
import type { TaskContract } from "../src/core/task-contract.js";
import type { FailureHistoryEntry } from "../src/core/task-strategy.js";

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
