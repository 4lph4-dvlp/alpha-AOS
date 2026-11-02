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
import {
  resolveApprovedPhaseSelection,
  verifyPhaseScopeBoundary,
} from "../src/core/task-phase-scope.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";

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

test("resolveApprovedPhaseSelection: resolves explicit contract selection and bounds requested subsets", async () => {
  const contract = createPhaseContract("D:/dev/sample-proj", {
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Multi-phase test",
      phaseSelection: {
        phaseIds: ["01", "02", "03"],
        roadmapSha256: VALID_ROADMAP_SHA,
      },
    },
  });

  // 1. Default candidates match approved phaseIds
  const resolved = await resolveApprovedPhaseSelection({
    contract,
    projectRoot: "D:/dev/sample-proj",
  });
  assert.equal(resolved.status, "ok");
  if (resolved.status === "ok") {
    assert.equal(resolved.source, "contract");
    assert.deepEqual(resolved.candidatePhases, ["01", "02", "03"]);
    assert.deepEqual(resolved.phaseSelection.phaseIds, ["01", "02", "03"]);
  }

  // 2. Valid subset preserving relative order
  const subset = await resolveApprovedPhaseSelection({
    contract,
    projectRoot: "D:/dev/sample-proj",
    requestedPhases: ["01", "03"],
  });
  assert.equal(subset.status, "ok");
  if (subset.status === "ok") {
    assert.deepEqual(subset.candidatePhases, ["01", "03"]);
  }

  // 3. Unauthorized phase in requested subset
  const unauth = await resolveApprovedPhaseSelection({
    contract,
    projectRoot: "D:/dev/sample-proj",
    requestedPhases: ["01", "99"],
  });
  assert.equal(unauth.status, "blocked");
  if (unauth.status === "blocked") {
    assert.equal(unauth.code, "scope-unauthorized-phase");
  }

  // 4. Reordered requested subset violating approved order
  const reordered = await resolveApprovedPhaseSelection({
    contract,
    projectRoot: "D:/dev/sample-proj",
    requestedPhases: ["02", "01"],
  });
  assert.equal(reordered.status, "blocked");
  if (reordered.status === "blocked") {
    assert.equal(reordered.code, "scope-reorder-rejected");
  }
});

test("resolveApprovedPhaseSelection: legacy contract derives selection from git baseline or blocks", async (context) => {
  const fixture = await createTaskFixture(context);
  const legacyContract = createPhaseContract(fixture.projectRoot);
  delete (legacyContract.scope as unknown as Record<string, unknown>).phaseSelection;

  // 1. Missing baseCommit: fails closed with scope-binding-required
  const missingBase = await resolveApprovedPhaseSelection({
    contract: legacyContract,
    projectRoot: fixture.projectRoot,
    baseCommit: null,
  });
  assert.equal(missingBase.status, "blocked");
  if (missingBase.status === "blocked") {
    assert.equal(missingBase.code, "scope-binding-required");
  }

  // 2. Set up git baseline with .planning/ROADMAP.md
  const planningDir = join(fixture.projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  const roadmapContent = [
    "# Roadmap",
    "",
    "- [ ] **Phase 01: Core Architecture**",
    "- [ ] **Phase 02: Verification Engine**",
    "",
  ].join("\n");
  await writeFile(join(planningDir, "ROADMAP.md"), roadmapContent, "utf8");
  await gitCommand(fixture.projectRoot, ["add", ".planning/ROADMAP.md"]);
  await gitCommand(fixture.projectRoot, ["commit", "-m", "docs: initialize roadmap"]);
  const headSha = (await gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"])).stdout.trim();

  // 3. With valid git baseline: derives exact ordered selection
  const derived = await resolveApprovedPhaseSelection({
    contract: legacyContract,
    projectRoot: fixture.projectRoot,
    baseCommit: headSha,
  });
  assert.equal(derived.status, "ok");
  if (derived.status === "ok") {
    assert.equal(derived.source, "derived-baseline");
    assert.deepEqual(derived.candidatePhases, ["01", "02"]);
    assert.deepEqual(derived.phaseSelection.phaseIds, ["01", "02"]);
    assert.match(derived.phaseSelection.roadmapSha256, /^[0-9a-f]{64}$/u);
  }
});

test("verifyPhaseScopeBoundary: allows progress edits but blocks live additions and unapproved phases", async (context) => {
  const fixture = await createTaskFixture(context);
  const approvedSelection: TaskPhaseSelection = {
    phaseIds: ["01", "02"],
    roadmapSha256: VALID_ROADMAP_SHA,
  };

  const planningDir = join(fixture.projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(
    join(planningDir, "ROADMAP.md"),
    ["# Roadmap", "", "- [ ] **Phase 01: Core**", "- [ ] **Phase 02: Verification**", ""].join("\n"),
    "utf8",
  );

  // 1. Phase in approved selection: allowed
  const check1 = await verifyPhaseScopeBoundary({
    phaseId: "01",
    approvedSelection,
    projectRoot: fixture.projectRoot,
  });
  assert.equal(check1.allowed, true);

  // 2. Phase NOT in approved selection: rejected
  const checkUnknown = await verifyPhaseScopeBoundary({
    phaseId: "03",
    approvedSelection,
    projectRoot: fixture.projectRoot,
  });
  assert.equal(checkUnknown.allowed, false);
  assert.ok(checkUnknown.reason?.includes("not in approved phase selection"));

  // 3. Native GSD progress edit (marking Phase 01 complete): allowed
  await writeFile(
    join(planningDir, "ROADMAP.md"),
    ["# Roadmap", "", "- [x] **Phase 01: Core**", "- [ ] **Phase 02: Verification**", ""].join("\n"),
    "utf8",
  );
  const checkProgress = await verifyPhaseScopeBoundary({
    phaseId: "02",
    approvedSelection,
    projectRoot: fixture.projectRoot,
  });
  assert.equal(checkProgress.allowed, true);

  // 4. Live addition of an unapproved phase in ROADMAP.md: rejected
  await writeFile(
    join(planningDir, "ROADMAP.md"),
    [
      "# Roadmap",
      "",
      "- [x] **Phase 01: Core**",
      "- [ ] **Phase 02: Verification**",
      "- [ ] **Phase 03: Rogue Phase**",
      "",
    ].join("\n"),
    "utf8",
  );
  const checkAdded = await verifyPhaseScopeBoundary({
    phaseId: "02",
    approvedSelection,
    projectRoot: fixture.projectRoot,
  });
  assert.equal(checkAdded.allowed, false);
  assert.ok(checkAdded.reason?.includes("contains unauthorized phase \"03\""));
});

