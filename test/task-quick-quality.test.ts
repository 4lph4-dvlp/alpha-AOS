import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  approveTaskContract,
  assertTaskStartable,
  changedContractFields,
  digestableTaskContract,
  loadTaskContract,
  previewTaskContract,
  resolveTaskQuickQuality,
  TaskContractError,
  taskContractDigest,
  type DigestableTaskContract,
  type TaskContract,
} from "../src/core/task-contract.js";
import { buildGsdControllerPrompt } from "../src/core/task-gsd.js";
import { formatTaskContractPreview } from "../src/format.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  writeTaskContract,
} from "./helpers/task-fixture.js";

function buildContract(overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    id: "sample-contract-01",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Implement sample feature",
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Sample task summary",
      ...overrides.scope,
    },
    allowedRoots: ["src", "test"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "check-exit",
        title: "Exit code is 0",
        description: "Verify exit code is 0",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "node test.js",
          inputText: "",
          expect: { exitCode: 0 },
        },
      },
    ],
    agentPolicy: {
      controller: "codex",
      executor: "antigravity",
      reviewer: "antigravity",
      controllerModel: "gpt-6.1-sol",
      controllerEffort: "high",
      executorModel: "gemini-3.8-flash",
      executorEffort: "high",
      reviewerModel: "gemini-3.8-flash",
      reviewerEffort: "high",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
    resourcePolicy: {
      maxCostUsd: 10,
      maxCycles: 5,
      maxTokens: 50000,
      maxWallTimeMinutes: 60,
    },
    ...overrides,
  };
}

test("resolveTaskQuickQuality: effective quality resolution across workflows", () => {
  // 1. development with omitted workflow defaults to gsd-quick
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { summary: "test" },
    }),
    "standard",
  );

  // 2. development gsd-quick with standard or undefined is standard
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { workflow: "gsd-quick", summary: "test" },
    }),
    "standard",
  );
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { workflow: "gsd-quick", quickQuality: "standard", summary: "test" },
    }),
    "standard",
  );

  // 3. development gsd-quick with full is full
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { workflow: "gsd-quick", quickQuality: "full", summary: "test" },
    }),
    "full",
  );

  // 4. Non-quick workflows return undefined
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { workflow: "gsd", summary: "test" },
    }),
    undefined,
  );
  assert.equal(
    resolveTaskQuickQuality({
      category: "development",
      scope: { workflow: "gsd-multi-phase", summary: "test" },
    }),
    undefined,
  );
  assert.equal(
    resolveTaskQuickQuality({
      category: "general",
      scope: { workflow: "generic-connector", summary: "test" },
    }),
    undefined,
  );
});

test("canonical view and digest vectors: standard equals absent, full differs, non-quick bytes preserved", () => {
  const baseAbsent = buildContract();
  const baseStandard = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Sample task summary",
      quickQuality: "standard",
    },
  });
  const baseFull = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Sample task summary",
      quickQuality: "full",
    },
  });

  const viewAbsent = digestableTaskContract(baseAbsent);
  const viewStandard = digestableTaskContract(baseStandard);
  const viewFull = digestableTaskContract(baseFull);

  // 1. Absent and explicit standard produce byte-for-byte IDENTICAL canonical views and digests
  assert.deepEqual(viewAbsent, viewStandard);
  assert.equal(JSON.stringify(viewAbsent), JSON.stringify(viewStandard));
  assert.equal(taskContractDigest(baseAbsent), taskContractDigest(baseStandard));

  // 2. Full differs and has quickQuality: "full" inside scope
  assert.notEqual(JSON.stringify(viewAbsent), JSON.stringify(viewFull));
  assert.equal(viewFull.scope.quickQuality, "full");
  assert.equal(viewAbsent.scope.quickQuality, undefined);
  assert.notEqual(taskContractDigest(baseAbsent), taskContractDigest(baseFull));

  // 3. Omitted workflow development contract canonicalizes to workflow: "gsd-quick"
  const omittedWorkflow = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      summary: "Sample task summary",
    },
  });
  const viewOmitted = digestableTaskContract(omittedWorkflow);
  assert.equal(viewOmitted.scope.workflow, "gsd-quick");
  assert.equal(viewOmitted.scope.quickQuality, undefined);

  // 4. Non-quick contracts have no quickQuality in scope
  const gsdContract = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd",
      summary: "Sample task summary",
    },
  });
  assert.equal(digestableTaskContract(gsdContract).scope.quickQuality, undefined);

  const multiPhaseContract = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-multi-phase",
      summary: "Sample task summary",
    },
  });
  assert.equal(digestableTaskContract(multiPhaseContract).scope.quickQuality, undefined);

  const generalContract = buildContract({
    category: "general",
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "generic-connector",
      summary: "Sample task summary",
    },
  });
  assert.equal(digestableTaskContract(generalContract).scope.quickQuality, undefined);
});

test("changedContractFields: names scope.quickQuality only on effective change", () => {
  const cAbsent = digestableTaskContract(buildContract());
  const cStandard = digestableTaskContract(
    buildContract({
      scope: {
        projectRoot: "D:/dev/sample-proj",
        workflow: "gsd-quick",
        summary: "Sample task summary",
        quickQuality: "standard",
      },
    }),
  );
  const cFull = digestableTaskContract(
    buildContract({
      scope: {
        projectRoot: "D:/dev/sample-proj",
        workflow: "gsd-quick",
        summary: "Sample task summary",
        quickQuality: "full",
      },
    }),
  );

  // Absent vs standard: no change
  assert.deepEqual(changedContractFields(cAbsent, cStandard), []);
  assert.deepEqual(changedContractFields(cStandard, cAbsent), []);

  // Standard vs full: names scope.quickQuality
  assert.deepEqual(changedContractFields(cStandard, cFull), ["scope.quickQuality"]);
  assert.deepEqual(changedContractFields(cAbsent, cFull), ["scope.quickQuality"]);
  assert.deepEqual(changedContractFields(cFull, cStandard), ["scope.quickQuality"]);
  assert.deepEqual(changedContractFields(cFull, cAbsent), ["scope.quickQuality"]);
});

test("validation: rejects unknown quality or quality on non-quick workflows", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Unknown quickQuality value
  await assert.rejects(
    async () => {
      const contract = inventorySummaryContract(fixture.projectRoot) as unknown as Record<string, unknown>;
      (contract.scope as Record<string, unknown>).quickQuality = "invalid-turbo";
      await writeTaskContract(fixture.contractPath, contract as unknown as TaskContract);
      await loadTaskContract(fixture.contractPath);
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      return true;
    },
  );

  // 2. quickQuality on non-quick workflow (e.g. gsd-multi-phase)
  await assert.rejects(
    async () => {
      const contract = inventorySummaryContract(fixture.projectRoot) as unknown as Record<string, unknown>;
      (contract.scope as Record<string, unknown>).workflow = "gsd-multi-phase";
      (contract.scope as Record<string, unknown>).quickQuality = "full";
      await writeTaskContract(fixture.contractPath, contract as unknown as TaskContract);
      await loadTaskContract(fixture.contractPath);
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.ok(err.message.includes("quickQuality is only allowed when effective workflow is gsd-quick"));
      return true;
    },
  );

  // 3. quickQuality on general category
  await assert.rejects(
    async () => {
      const contract = inventorySummaryContract(fixture.projectRoot) as unknown as Record<string, unknown>;
      contract.category = "general";
      (contract.scope as Record<string, unknown>).workflow = "generic-connector";
      (contract.scope as Record<string, unknown>).quickQuality = "standard";
      await writeTaskContract(fixture.contractPath, contract as unknown as TaskContract);
      await loadTaskContract(fixture.contractPath);
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-invalid");
      assert.ok(err.message.includes("quickQuality is only allowed when effective workflow is gsd-quick"));
      return true;
    },
  );
});

test("preview, approval and assertTaskStartable round-trip with legacy and full contracts", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Legacy contract (absent quickQuality)
  const legacyContract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, legacyContract);

  const previewLegacy = await previewTaskContract({
    contractPath: fixture.contractPath,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(previewLegacy.approved, false);

  const approveLegacy = await approveTaskContract({
    contractPath: fixture.contractPath,
    stateRoot: fixture.stateRoot,
    expectedDigest: previewLegacy.digest,
  });
  assert.equal(approveLegacy.status, "approved");

  const startableLegacy = await assertTaskStartable({
    contractPath: fixture.contractPath,
    expectedDigest: previewLegacy.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(startableLegacy.loaded.digest, previewLegacy.digest);

  // 2. Full contract in a new contract file
  const fullContractPath = join(fixture.scratch, "task-full.json");
  const fullContract = inventorySummaryContract(fixture.projectRoot);
  fullContract.id = "inventory-full-01";
  fullContract.scope.quickQuality = "full";
  await writeTaskContract(fullContractPath, fullContract);

  const previewFull = await previewTaskContract({
    contractPath: fullContractPath,
    stateRoot: fixture.stateRoot,
  });
  assert.notEqual(previewFull.digest, previewLegacy.digest);

  const approveFull = await approveTaskContract({
    contractPath: fullContractPath,
    stateRoot: fixture.stateRoot,
    expectedDigest: previewFull.digest,
  });
  assert.equal(approveFull.status, "approved");

  const startableFull = await assertTaskStartable({
    contractPath: fullContractPath,
    expectedDigest: previewFull.digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(startableFull.loaded.digest, previewFull.digest);

  // 3. Stale digest refusal when quality changes without new revision
  fullContract.scope.quickQuality = "standard";
  await writeTaskContract(fullContractPath, fullContract);

  await assert.rejects(
    async () => {
      await assertTaskStartable({
        contractPath: fullContractPath,
        expectedDigest: previewFull.digest,
        stateRoot: fixture.stateRoot,
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-drift");
      assert.ok(err.message.includes("scope.quickQuality"));
      return true;
    },
  );
});

test("previewTaskContract and formatTaskContractPreview expose concrete execution style and quality", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Standard quick contract preview
  const standardContractPath = join(fixture.scratch, "task-standard-preview.json");
  const standardContract = inventorySummaryContract(fixture.projectRoot);
  standardContract.id = "standard-preview-01";
  standardContract.scope.quickQuality = "standard";
  await writeTaskContract(standardContractPath, standardContract);

  const previewStandard = await previewTaskContract({
    contractPath: standardContractPath,
    stateRoot: fixture.stateRoot,
  });

  assert.deepEqual(previewStandard.executionStyle, {
    style: "autopilot-quick",
    label: "오토파일럿-quick",
    surface: "isolated-runner",
    quality: "standard",
  });

  const formattedStandard = formatTaskContractPreview(previewStandard, "alpha-aos task approve");
  assert.ok(formattedStandard.includes("Execution style: 오토파일럿-quick (autopilot-quick)"));
  assert.ok(formattedStandard.includes("Execution surface: isolated-runner"));
  assert.ok(formattedStandard.includes("Execution quality: standard ($gsd-quick)"));
  assert.ok(!formattedStandard.includes("Required stages:"));

  // 2. Full quick contract preview
  const fullContractPath = join(fixture.scratch, "task-full-preview.json");
  const fullContract = inventorySummaryContract(fixture.projectRoot);
  fullContract.id = "full-preview-01";
  fullContract.scope.quickQuality = "full";
  await writeTaskContract(fullContractPath, fullContract);

  const previewFull = await previewTaskContract({
    contractPath: fullContractPath,
    stateRoot: fixture.stateRoot,
  });

  assert.deepEqual(previewFull.executionStyle, {
    style: "autopilot-quick-full",
    label: "오토파일럿-quick-full",
    surface: "isolated-runner",
    quality: "full",
    requiredStages: [
      "discussion",
      "research",
      "planning",
      "plan-check",
      "implementation",
      "verification",
      "state-docs",
    ],
  });

  const formattedFull = formatTaskContractPreview(previewFull, "alpha-aos task approve");
  assert.ok(formattedFull.includes("Execution style: 오토파일럿-quick-full (autopilot-quick-full)"));
  assert.ok(formattedFull.includes("Execution surface: isolated-runner"));
  assert.ok(formattedFull.includes("Execution quality: full ($gsd-quick --full)"));
  assert.ok(
    formattedFull.includes(
      "Required stages: discussion, research, planning, plan-check, implementation, verification, state-docs",
    ),
  );

  // 3. Phase contract preview
  const phaseContractPath = join(fixture.scratch, "task-phase-preview.json");
  const phaseContract = inventorySummaryContract(fixture.projectRoot);
  phaseContract.id = "phase-preview-01";
  phaseContract.scope.workflow = "gsd";
  phaseContract.scope.quickQuality = undefined;
  await writeTaskContract(phaseContractPath, phaseContract);

  const previewPhase = await previewTaskContract({
    contractPath: phaseContractPath,
    stateRoot: fixture.stateRoot,
  });

  assert.deepEqual(previewPhase.executionStyle, {
    style: "autopilot-phase",
    label: "오토파일럿-phase",
    surface: "isolated-runner",
  });

  const formattedPhase = formatTaskContractPreview(previewPhase, "alpha-aos task approve");
  assert.ok(formattedPhase.includes("Execution style: 오토파일럿-phase (autopilot-phase)"));
  assert.ok(formattedPhase.includes("Execution surface: isolated-runner"));
  assert.ok(!formattedPhase.includes("Execution quality:"));

  // 4. Preview remains read-only: no approvals created
  const approvalsDir = join(fixture.stateRoot, "tasks", standardContract.id, "approvals");
  let approvalsExist = false;
  try {
    const files = await import("node:fs/promises").then((fs) => fs.readdir(approvalsDir));
    approvalsExist = files.length > 0;
  } catch {
    approvalsExist = false;
  }
  assert.equal(approvalsExist, false, "preview must be strictly read-only and create no approvals");
});

test("buildGsdControllerPrompt distinguishes standard vs full and preserves distinct roles", () => {
  const outline = {
    sourceSha256: "0".repeat(64),
    stepNames: ["step-1", "step-2"],
  };

  // 1. Standard quick prompt
  const standardContract = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Standard task",
      quickQuality: "standard",
    },
    agentPolicy: {
      controller: "codex",
      executor: "antigravity",
      reviewer: "antigravity",
      controllerModel: "gpt-6.1-sol",
      controllerEffort: "high",
      executorModel: "gemini-3.8-flash",
      executorEffort: "high",
      reviewerModel: "gemini-3.8-flash",
      reviewerEffort: "high",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
  });

  const standardPrompt = buildGsdControllerPrompt({
    contract: standardContract,
    contractDigest: "a".repeat(64),
    runId: "run-standard-01",
    decisionLogPath: "/logs/decisions.jsonl",
    outline,
  });

  assert.ok(standardPrompt.includes("`$gsd-quick`"));
  assert.ok(!standardPrompt.includes("`$gsd-quick --full`"));
  assert.ok(standardPrompt.includes("You are the approved controller (codex); executor is antigravity; reviewer is antigravity (fresh-read-only)."));
  assert.ok(standardPrompt.includes("Preserve approved role assignments, delegation, and fresh read-only review."));

  // 2. Full quick prompt
  const fullContract = buildContract({
    scope: {
      projectRoot: "D:/dev/sample-proj",
      workflow: "gsd-quick",
      summary: "Full quality task",
      quickQuality: "full",
    },
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "antigravity",
      controllerModel: "gpt-6.1-sol",
      controllerEffort: "high",
      executorModel: "gpt-6.1-sol",
      executorEffort: "high",
      reviewerModel: "gemini-3.8-flash",
      reviewerEffort: "high",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
  });

  const fullPrompt = buildGsdControllerPrompt({
    contract: fullContract,
    contractDigest: "b".repeat(64),
    runId: "run-full-01",
    decisionLogPath: "/logs/decisions.jsonl",
    outline,
  });

  assert.ok(fullPrompt.includes("`$gsd-quick --full`"));
  assert.ok(fullPrompt.includes("Full quality requires all native stages: discussion, research, planning, plan checking, implementation, verification, and state/docs commit."));
  assert.ok(fullPrompt.includes("Preserve native research-before-questions and active code-review gates."));
  assert.ok(fullPrompt.includes("You are the approved controller and executor (codex) for this project for this run."));
});
