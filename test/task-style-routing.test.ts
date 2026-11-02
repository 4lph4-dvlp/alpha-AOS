import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import {
  applyOwnedSkillSync,
  destinationFor,
  planOwnedSkillSync,
} from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  previewTaskContract,
  resolveTaskQuickQuality,
  taskContractDigest,
  TaskContractError,
  type TaskContract,
} from "../src/core/task-contract.js";
import {
  MANDATORY_GSD_FULL_STAGES,
  verifyGsdFullEvidence,
  type TaskGsdStageReceipt,
} from "../src/core/task-gsd-stages.js";
import { inspectTaskIntake } from "../src/core/task-intake.js";
import {
  resolveTaskExecutionRoute,
  TASK_EXECUTION_STYLES,
  type TaskExecutionStyle,
} from "../src/core/task-style.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";
import type { HarnessId } from "../src/types.js";

const TARGETS: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

test("alpha-aos-task rendered guidance has locked integrity across all five harnesses and contains exact six-route procedure (D-01–D-04, D-21, D-23)", async (context) => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-task-style-routing-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const stateRoot = join(baseTemp, "state");
  await mkdir(stateRoot, { recursive: true });

  const lockedSkill = lock.components.ownedSkills?.["alpha-aos-task"];
  assert.ok(lockedSkill, "alpha-aos-task must be locked in stack.lock.json");

  for (const target of TARGETS) {
    const targetHome = join(baseTemp, `home-${target}`);
    await mkdir(targetHome, { recursive: true });

    const plan = await planOwnedSkillSync(root, catalog, lock, "alpha-aos-task", target, {
      stateRoot,
      targetHome,
    });
    assert.equal(plan.action, "create");
    assert.equal(plan.expectedHash, lockedSkill.targetSha256[target]);

    const result = await applyOwnedSkillSync(root, catalog, lock, "alpha-aos-task", target, {
      stateRoot,
      targetHome,
    });
    assert.ok(result.operationId !== null);

    const destination = destinationFor(target, "alpha-aos-task", targetHome);
    assert.ok(existsSync(destination));

    const content = await readFile(destination, "utf8");

    // All six Korean canonical labels present in exact rendered skill
    assert.match(content, /대화형-quick/u);
    assert.match(content, /대화형-quick-full/u);
    assert.match(content, /대화형-phase/u);
    assert.match(content, /오토파일럿-quick/u);
    assert.match(content, /오토파일럿-quick-full/u);
    assert.match(content, /오토파일럿-phase/u);

    // Exact route commands and boundaries in rendered guidance
    assert.match(content, /\$gsd-quick "<task description>"/u);
    assert.match(content, /\$gsd-quick "<task description>" --full/u);
    assert.match(content, /alpha-aos task preview/u);
    assert.match(content, /alpha-aos task approve/u);
    assert.match(content, /alpha-aos task start/u);

    // Prohibition against treating selection/bootstrap as approval/start
    assert.match(content, /executionAuthorized: false/u);
    assert.match(content, /Zero inline implementation/u);
  }
});

test("executionRoute maps every canonical style to exact surface and command without authority expansion (STYLE-01–STYLE-07)", () => {
  const styles: TaskExecutionStyle[] = [
    "conversational-quick",
    "conversational-quick-full",
    "conversational-phase",
    "autopilot-quick",
    "autopilot-quick-full",
    "autopilot-phase",
  ];

  for (const style of styles) {
    const route = resolveTaskExecutionRoute({ selectedStyle: style });
    assert.ok(route, `route must resolve for ${style}`);
    assert.equal(route.style, style);

    // Surface verification
    if (style.startsWith("conversational-")) {
      assert.equal(route.surface, "conversation");
      assert.equal(route.authorityRequirements.requiresExactApproval, false);
      assert.equal(route.authorityRequirements.requiresSeparateStart, false);
    } else {
      assert.equal(route.surface, "isolated-runner");
      assert.equal(route.authorityRequirements.requiresExactApproval, true);
      assert.equal(route.authorityRequirements.requiresSeparateStart, true);
    }

    // Never grants execution authority from route alone
    assert.equal(route.authorityRequirements.executionAuthorized, false);

    // Quality mapping
    if (style === "conversational-quick-full" || style === "autopilot-quick-full") {
      assert.equal(route.quickQuality, "full");
      assert.equal(route.authorityRequirements.requiresEvidenceValidation, true);
    } else if (style === "conversational-quick" || style === "autopilot-quick") {
      assert.equal(route.quickQuality, "standard");
    }
  }
});

test("approval-failed and approval-only prevent task start (D-14, D-15)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);

  // 1. Unapproved contract: assertTaskStartable rejects with "not-approved"
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "not-approved");
      return true;
    },
  );

  // 2. Mismatched digest approval attempt fails and does not create valid approval
  const wrongDigest = "0".repeat(64);
  await assert.rejects(
    approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: wrongDigest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-drift");
      return true;
    },
  );

  // Still not startable
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "not-approved");
      return true;
    },
  );

  // 3. Approval succeeds with matching digest
  const approved = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approved.status, "approved");

  // Startable now succeeds
  const startable = await assertTaskStartable({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(startable.loaded.digest, digest);
});

test("direct discuss-only command preserves exact workflow arguments and stopping point without unrelated chooser (D-02, D-03)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-direct-cmd-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const projectRoot = join(baseTemp, "project");
  await mkdir(join(projectRoot, ".planning"), { recursive: true });

  // 1. Direct phase command
  const direct = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "$gsd-discuss-phase 30" },
    },
  });

  assert.equal(direct.kind, "explicit-command");
  assert.equal(direct.nextAction, "execute-explicit");
  assert.equal(direct.commandRoute?.workflow, "discuss-phase");
  assert.equal(direct.commandRoute?.phase, "30");
  assert.equal(direct.commandRoute?.stoppingPoint, "discuss:post");
  assert.equal(direct.executionAuthorized, false);

  // 2. Conflict between direct command and explicit autopilot request
  const conflict = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "$gsd-discuss-phase 30" },
      explicit: { style: "autopilot-quick" },
    },
  });

  assert.equal(conflict.kind, "clarification-needed");
  assert.equal(conflict.nextAction, "ask-clarification");
  assert.ok(conflict.reasons.includes("conflicting-explicit-intent"));
  assert.ok(conflict.clarification?.question.includes("어느 방식으로 진행할까요?"));
});

test("ordinary vs full route and quality binding rejects down-conversion and standard fallback (D-01, D-16)", () => {
  // 1. Quality resolution
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
      scope: { workflow: "gsd-quick", quickQuality: "full", summary: "test" },
    }),
    "full",
  );

  // 2. Execution route resolution
  const ordinaryQuick = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick" });
  assert.ok(ordinaryQuick);
  assert.equal(ordinaryQuick.quickQuality, "standard");
  assert.equal(ordinaryQuick.surface, "conversation");
  assert.equal(ordinaryQuick.authorityRequirements.requiresEvidenceValidation, false);

  const fullQuick = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick-full" });
  assert.ok(fullQuick);
  assert.equal(fullQuick.quickQuality, "full");
  assert.equal(fullQuick.surface, "conversation");
  assert.equal(fullQuick.authorityRequirements.requiresEvidenceValidation, true);

  const autoQuick = resolveTaskExecutionRoute({ selectedStyle: "autopilot-quick" });
  assert.ok(autoQuick);
  assert.equal(autoQuick.quickQuality, "standard");
  assert.equal(autoQuick.surface, "isolated-runner");
  assert.equal(autoQuick.authorityRequirements.requiresExactApproval, true);
  assert.equal(autoQuick.authorityRequirements.requiresSeparateStart, true);

  const autoFull = resolveTaskExecutionRoute({ selectedStyle: "autopilot-quick-full" });
  assert.ok(autoFull);
  assert.equal(autoFull.quickQuality, "full");
  assert.equal(autoFull.surface, "isolated-runner");
  assert.equal(autoFull.authorityRequirements.requiresEvidenceValidation, true);
  assert.equal(autoFull.authorityRequirements.requiresExactApproval, true);
  assert.equal(autoFull.authorityRequirements.requiresSeparateStart, true);
});

test("7-stage full evidence precondition gate reports missing/failed/unknown/needs-input diagnostics (D-15, D-16)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-stage-diag-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const projectRoot = join(baseTemp, "project");
  await mkdir(projectRoot, { recursive: true });

  // 1. Missing receipts for all 7 stages
  const missingResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: "a".repeat(64),
    revision: 1,
    runId: "run-01",
    quickId: "261102-test",
    workflowSha256: "b".repeat(64),
    receipts: [],
  });
  assert.equal(missingResult.status, "missing");
  assert.deepEqual(missingResult.missingStages, MANDATORY_GSD_FULL_STAGES);
  assert.ok(missingResult.issues.some((i: string) => i.includes("Missing required full stage receipts")));

  // 2. Failed stage with needs-input outcome
  const stageReceipts: TaskGsdStageReceipt[] = MANDATORY_GSD_FULL_STAGES.map((stage, idx) => ({
    schemaVersion: 1,
    kind: "task-gsd-stage-receipt",
    receiptId: `receipt-${stage}`,
    contractDigest: "a".repeat(64),
    revision: 1,
    runId: "run-01",
    canonicalProjectRoot: projectRoot,
    quickId: "261102-test",
    stage,
    quality: "full",
    harness: "codex",
    sessionId: "sess-01",
    runtimeVersion: "1.0.0",
    workflowSha256: "b".repeat(64),
    invocationLocator: `run/inv-${idx}`,
    invocationDigest: "c".repeat(64),
    resultLocator: `run/res-${idx}`,
    resultDigest: "d".repeat(64),
    outcome: stage === "discussion" ? ("needs-input" as const) : ("passed" as const),
    evaluatedCommit: "e".repeat(40),
    inputArtifacts: [],
    outputArtifacts: [],
    observedAt: new Date().toISOString(),
    detail: stage === "discussion" ? "Gray area requires user input" : null,
    receiptDigest: "f".repeat(64),
  }));

  const failedResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: "a".repeat(64),
    revision: 1,
    runId: "run-01",
    quickId: "261102-test",
    workflowSha256: "b".repeat(64),
    receipts: stageReceipts,
  });
  assert.equal(failedResult.status, "failed");
  assert.equal(failedResult.failedStages.length, 1);
  assert.equal(failedResult.failedStages[0]?.stage, "discussion");
  assert.equal(failedResult.failedStages[0]?.outcome, "needs-input");
});

test("active-task mode switch and scope change preserve contract binding and WIP bytes (D-13, D-15, D-16)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-mode-switch-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const projectRoot = join(baseTemp, "project");
  const aosDir = join(projectRoot, ".alpha-aos");
  const quickDir = join(projectRoot, ".planning", "quick");
  await mkdir(aosDir, { recursive: true });
  await mkdir(quickDir, { recursive: true });

  const activeArtifact = join(quickDir, "261102-active.md");
  await writeFile(activeArtifact, "---\nstatus: in-progress\nstyle: autopilot-quick-full\n---\n", "utf8");

  // Project starts in strict mode
  await writeFile(
    join(aosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "strict" }),
    "utf8",
  );

  // 1. In-flight active task continuation preserves bound style
  const contStrict = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "Fix unit test in progress" },
      currentTask: {
        artifactPath: ".planning/quick/261102-active.md",
        relationship: "test-repair",
        selectedStyle: "autopilot-quick-full",
      },
    },
  });
  assert.equal(contStrict.kind, "continuation");
  assert.equal(contStrict.selectedStyle, "autopilot-quick-full");

  // 2. External actor switches project to flexible mode while task is running
  await writeFile(
    join(aosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }),
    "utf8",
  );

  // Continuation of active task is unaffected by the mode switch
  const contFlexible = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "Fix another test in active task" },
      currentTask: {
        artifactPath: ".planning/quick/261102-active.md",
        relationship: "test-repair",
        selectedStyle: "autopilot-quick-full",
      },
    },
  });
  assert.equal(contFlexible.kind, "continuation");
  assert.equal(contFlexible.selectedStyle, "autopilot-quick-full");

  // 3. Fresh task intake without currentTask observes the updated flexible mode
  const freshIntake = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "Brand new feature exploration" },
    },
  });
  assert.equal(freshIntake.kind, "substantial-work");
  // In flexible mode, nextAction is adaptive intake rather than strict 6-choice chooser
  assert.equal(freshIntake.nextAction, "adaptive-intake");

  // 4. Scope expansion reclassifies and preserves WIP bytes
  const scopeExpansion = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      projectRoot,
      request: { text: "Extending refactoring scope across submodules" },
      scopeChange: {
        previousOperationId: "op-rename",
        expandedScope: true,
        requiresInvestigation: true,
        wipBytesPreserved: true,
        isTaskRepair: false,
      },
    },
  });
  assert.equal(scopeExpansion.kind, "substantial-work");
  assert.ok(scopeExpansion.reasons.includes("scope-expansion-reclassified"));
  assert.ok(scopeExpansion.reasons.includes("wip-bytes-preserved"));
});
