import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  changedContractFields,
  digestableTaskContract,
  loadTaskContract,
  parseTaskContract,
  previewTaskContract,
  taskContractDigest,
  TaskContractError,
  type TaskContract,
  type TaskPhaseSelection,
} from "../src/core/task-contract.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";

const VALID_ROADMAP_SHA = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

function createPhaseContract(projectRoot: string, overrides: Partial<TaskContract> = {}): TaskContract {
  const base = inventorySummaryContract(projectRoot);
  return {
    ...base,
    id: "multi-phase-task",
    goal: "Run multi-phase roadmap",
    scope: {
      ...base.scope,
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      ...overrides.scope,
    },
    ...overrides,
  } as TaskContract;
}

test("legacy compatibility: contract without phaseSelection produces identical canonical digest and view", () => {
  const contract = createPhaseContract("D:/dev/sample-proj");
  delete (contract.scope as unknown as Record<string, unknown>).phaseSelection;

  const view = digestableTaskContract(contract);
  assert.equal(view.scope.phaseSelection, undefined);

  // Re-verify that canonical digest is stable
  const digest = taskContractDigest(contract);
  assert.match(digest, /^[0-9a-f]{64}$/u);

  // Calling digestableTaskContract again produces exact byte equality
  const viewAgain = digestableTaskContract(contract);
  assert.deepEqual(view, viewAgain);
  assert.equal(JSON.stringify(view), JSON.stringify(viewAgain));
});

test("explicit phaseSelection changes canonical view and digest", () => {
  const legacy = createPhaseContract("D:/dev/sample-proj");
  const withSelection = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  const legacyDigest = taskContractDigest(legacy);
  const selectionDigest = taskContractDigest(withSelection);
  assert.notEqual(legacyDigest, selectionDigest);

  const view = digestableTaskContract(withSelection);
  assert.deepEqual(view.scope.phaseSelection, {
    phaseIds: ["01", "02"],
    roadmapSha256: VALID_ROADMAP_SHA,
  });
});

test("phaseSelection: ordered phaseIds matter for canonical digest", () => {
  const orderA = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  const orderB = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["02", "01"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  assert.notEqual(taskContractDigest(orderA), taskContractDigest(orderB));
});

test("phaseSelection: adding or removing phaseIds or changing roadmapSha256 alters digest", () => {
  const base = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  const added = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02", "03"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  const diffRoadmap = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: "b".repeat(64),
      },
    },
  });

  assert.notEqual(taskContractDigest(base), taskContractDigest(added));
  assert.notEqual(taskContractDigest(base), taskContractDigest(diffRoadmap));
});

test("changedContractFields: reports scope.phaseSelection on drift", () => {
  const legacy = createPhaseContract("D:/dev/sample-proj");
  const withSelection = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });
  const withDifferentPhases = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "03"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  assert.deepEqual(changedContractFields(digestableTaskContract(legacy), digestableTaskContract(legacy)), []);
  assert.deepEqual(
    changedContractFields(digestableTaskContract(legacy), digestableTaskContract(withSelection)),
    ["scope.phaseSelection"],
  );
  assert.deepEqual(
    changedContractFields(digestableTaskContract(withSelection), digestableTaskContract(legacy)),
    ["scope.phaseSelection"],
  );
  assert.deepEqual(
    changedContractFields(digestableTaskContract(withSelection), digestableTaskContract(withDifferentPhases)),
    ["scope.phaseSelection"],
  );
});

test("validateTaskContract: rejects phaseSelection on quick or general contracts", async () => {
  const quickWithPhase = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Quick test",
      phaseSelection: {
        phaseIds: ["01"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  await assert.rejects(
    parseTaskContract(JSON.stringify(quickWithPhase), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.match(err.message, /phaseSelection is only allowed when effective workflow is gsd or gsd-multi-phase/u);
      return true;
    },
  );

  const generalWithPhase = createPhaseContract("D:/dev/sample-proj", {
    category: "general",
    connectorId: "jira",
    protocolVersion: 1,
    manifestDigest: "0".repeat(64),
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "generic-connector",
      summary: "General test",
      phaseSelection: {
        phaseIds: ["01"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  await assert.rejects(
    parseTaskContract(JSON.stringify(generalWithPhase), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      return true;
    },
  );
});

test("validateTaskContract: rejects empty, duplicate, over-limit or malformed phaseSelection", async () => {
  const base = (phaseSelection: TaskPhaseSelection | Record<string, unknown>) =>
    createPhaseContract("D:/dev/sample-proj", {
      scope: {
        projectRoot: "D:/dev/sample-proj",
        workflow: "gsd-multi-phase",
        summary: "Multi-phase execution test",
        phaseSelection: phaseSelection as TaskPhaseSelection,
      },
    });

  // Empty phaseIds
  await assert.rejects(
    parseTaskContract(JSON.stringify(base({ phaseIds: [], roadmapSha256: VALID_ROADMAP_SHA })), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.match(err.message, /phaseIds/u);
      return true;
    },
  );

  // Duplicate phaseIds
  await assert.rejects(
    parseTaskContract(JSON.stringify(base({ phaseIds: ["01", "01"], roadmapSha256: VALID_ROADMAP_SHA })), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.match(err.message, /duplicate|uniqueItems/u);
      return true;
    },
  );

  // Over 64 phaseIds
  const tooMany = Array.from({ length: 65 }, (_, i) => String(i + 1).padStart(2, "0"));
  await assert.rejects(
    parseTaskContract(JSON.stringify(base({ phaseIds: tooMany, roadmapSha256: VALID_ROADMAP_SHA })), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      return true;
    },
  );

  // Malformed phaseId syntax (e.g. invalid chars, path separators)
  await assert.rejects(
    parseTaskContract(JSON.stringify(base({ phaseIds: ["../bad"], roadmapSha256: VALID_ROADMAP_SHA })), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      return true;
    },
  );

  // Malformed roadmapSha256
  await assert.rejects(
    parseTaskContract(JSON.stringify(base({ phaseIds: ["01"], roadmapSha256: "not-a-sha" })), "test.json"),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.match(err.message, /roadmapSha256/u);
      return true;
    },
  );

  // Decimal phaseId: "02.1" is valid native phase syntax
  const decimalContract = base({ phaseIds: ["01", "02.1", "03-final"], roadmapSha256: VALID_ROADMAP_SHA });
  const parsed = await parseTaskContract(JSON.stringify(decimalContract), "test.json");
  assert.deepEqual(parsed.scope.phaseSelection?.phaseIds, ["01", "02.1", "03-final"]);
});

test("previewTaskContract: reports executionStyle and scope boundary reasons", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = createPhaseContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-multi-phase",
      summary: "Multi-phase execution test",
      phaseSelection: {
        phaseIds: ["01", "02"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  await writeTaskContract(fixture.contractPath, contract);
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });

  assert.equal(preview.executionStyle?.style, "autopilot-phase");
  assert.equal(preview.executionStyle?.label, "오토파일럿-phase");
  assert.deepEqual(preview.executionStyle?.phaseSelection, {
    phaseIds: ["01", "02"],
    roadmapSha256: VALID_ROADMAP_SHA,
  });
  assert.ok(preview.executionStyle?.scopeBoundaryReason?.includes("Bound to 2 approved phase(s)"));

  // Legacy without phaseSelection
  const legacyContract = createPhaseContract(fixture.projectRoot);
  delete (legacyContract.scope as unknown as Record<string, unknown>).phaseSelection;
  await writeTaskContract(fixture.contractPath, legacyContract);
  const legacyPreview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });

  assert.equal(legacyPreview.executionStyle?.style, "autopilot-phase");
  assert.equal(legacyPreview.executionStyle?.phaseSelection, undefined);
  assert.ok(legacyPreview.executionStyle?.scopeBoundaryReason?.includes("Legacy phase approval"));
});
