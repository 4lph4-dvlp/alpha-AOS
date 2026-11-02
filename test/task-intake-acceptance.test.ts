import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";
import { createOrdinaryRepository } from "./helpers/git-fixture.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("Journey A: release task with autopilot-phase completes, followed by independent bug receiving fresh chooser (ENTRY-01, ENTRY-03, D-05, D-09, D-10, D-11, D-20)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "journey-a-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Initial strict intake for a major release milestone
  const releaseReqPath = join(sandbox.home, "req-release.json");
  await writeFile(
    releaseReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Release milestone v1.0.0 including end-to-end verification and changelog",
        shortGoal: "Release v1.0.0",
        shortScope: "Milestone completion",
      },
    }),
    "utf8",
  );

  const releaseRun1 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", releaseReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(releaseRun1.status, 0);
  const releaseDecision1 = JSON.parse(releaseRun1.stdout);
  assert.equal(releaseDecision1.kind, "substantial-work");
  assert.equal(releaseDecision1.nextAction, "choose-style");
  assert.ok(releaseDecision1.chooser);
  assert.equal(releaseDecision1.chooser.options.length, 6);

  // 2. Select option 6 (autopilot-phase)
  const releaseAnswerPath = join(sandbox.home, "req-release-answered.json");
  await writeFile(
    releaseAnswerPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Release milestone v1.0.0 including end-to-end verification and changelog",
        shortGoal: "Release v1.0.0",
      },
      answer: { canonicalStyle: "autopilot-phase" },
    }),
    "utf8",
  );
  const releaseRun2 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", releaseAnswerPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(releaseRun2.status, 0);
  const releaseDecision2 = JSON.parse(releaseRun2.stdout);
  assert.equal(releaseDecision2.selectedStyle, "autopilot-phase");
  assert.equal(releaseDecision2.executionAuthorized, false);

  // 3. Related test repair during release retains style without re-choosing
  const releaseRepairPath = join(sandbox.home, "req-release-repair.json");
  const quickDir = join(projectDir, ".planning", "quick");
  await mkdir(quickDir, { recursive: true });
  const activeArtifact = join(quickDir, "261102-release.md");
  await writeFile(activeArtifact, "---\nstatus: in-progress\nstyle: autopilot-phase\n---\n", "utf8");

  await writeFile(
    releaseRepairPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Fix failing integration test in release wave" },
      currentTask: {
        artifactPath: ".planning/quick/261102-release.md",
        relationship: "test-repair",
        selectedStyle: "autopilot-phase",
      },
    }),
    "utf8",
  );
  const repairRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", releaseRepairPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(repairRun.status, 0);
  const repairDecision = JSON.parse(repairRun.stdout);
  assert.equal(repairDecision.kind, "continuation");
  assert.equal(repairDecision.nextAction, "continue-task");
  assert.equal(repairDecision.selectedStyle, "autopilot-phase");

  // 4. Mark release task authoritatively completed in GSD summary artifact
  const completedArtifact = join(projectDir, ".planning", "phases", "28", "28-06-SUMMARY.md");
  await mkdir(join(projectDir, ".planning", "phases", "28"), { recursive: true });
  await writeFile(completedArtifact, "---\nstatus: completed\n---\n", "utf8");

  // 5. Subsequent independent bug fix receives fresh chooser and selects autopilot-quick-full
  const bugReqPath = join(sandbox.home, "req-bug.json");
  await writeFile(
    bugReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Fix memory leak in websocket reconnection handler",
        shortGoal: "Fix leak",
      },
      currentTask: {
        artifactPath: ".planning/phases/28/28-06-SUMMARY.md",
        relationship: "independent",
      },
    }),
    "utf8",
  );
  const bugRun1 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", bugReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(bugRun1.status, 0);
  const bugDecision1 = JSON.parse(bugRun1.stdout);
  // Fresh chooser! Does NOT inherit autopilot-phase
  assert.equal(bugDecision1.kind, "substantial-work");
  assert.equal(bugDecision1.nextAction, "choose-style");
  assert.ok(bugDecision1.chooser);
  assert.equal(bugDecision1.chooser.options.length, 6);

  // 6. User chooses option 5 (autopilot-quick-full) for the bug
  const bugAnswerPath = join(sandbox.home, "req-bug-answered.json");
  await writeFile(
    bugAnswerPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Fix memory leak in websocket reconnection handler",
        shortGoal: "Fix leak",
      },
      answer: { canonicalStyle: "autopilot-quick-full" },
    }),
    "utf8",
  );
  const bugRun2 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", bugAnswerPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(bugRun2.status, 0);
  const bugDecision2 = JSON.parse(bugRun2.stdout);
  assert.equal(bugDecision2.selectedStyle, "autopilot-quick-full");
  assert.equal(bugDecision2.executionAuthorized, false);

  // Invariant verification: behavior.json has no style stored
  const policyFile = join(projectDir, ".alpha-aos", "behavior.json");
  if (existsSync(policyFile)) {
    const policy = JSON.parse(await readFile(policyFile, "utf8"));
    assert.equal(policy.style, undefined);
  }
});

test("Journey B: pending chooser, status detour, invalid answer, cancellation, and cross-task protection (ENTRY-01, ENTRY-05, D-07, D-08, D-11)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "journey-b-project");
  await mkdir(projectDir, { recursive: true });

  const pendingTaskId = "pending-corr-uuid-1234";

  // 1. Initial pending question with correlation ID
  const pendingReqPath = join(sandbox.home, "req-pending.json");
  await writeFile(
    pendingReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      answer: { pendingTaskId },
    }),
    "utf8",
  );
  const initialRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", pendingReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(initialRun.status, 0);
  const initialDecision = JSON.parse(initialRun.stdout);
  assert.equal(initialDecision.kind, "substantial-work");
  assert.equal(initialDecision.nextAction, "choose-style");

  // 2. Status detour ("status" / "진행 상황") preserves pending choice
  const statusDetourPath = join(sandbox.home, "req-status.json");
  await writeFile(
    statusDetourPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      answer: { raw: "status", pendingTaskId },
    }),
    "utf8",
  );
  const statusRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", statusDetourPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(statusRun.status, 0);
  const statusDecision = JSON.parse(statusRun.stdout);
  assert.equal(statusDecision.kind, "substantial-work");
  assert.equal(statusDecision.nextAction, "choose-style");
  assert.ok(statusDecision.reasons.includes("status-query-preserves-pending-choice"));

  // 3. Invalid answer ("foo" / invalid number 99) leaves selection pending
  const invalidAnswerPath = join(sandbox.home, "req-invalid.json");
  await writeFile(
    invalidAnswerPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      answer: { raw: "99", pendingTaskId },
    }),
    "utf8",
  );
  const invalidRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", invalidAnswerPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(invalidRun.status, 0);
  const invalidDecision = JSON.parse(invalidRun.stdout);
  assert.equal(invalidDecision.kind, "substantial-work");
  assert.equal(invalidDecision.nextAction, "choose-style");
  assert.ok(invalidDecision.reasons.includes("provided-answer-invalid-or-ambiguous"));

  // 4. Cross-task correlation mismatch rejects answer consumption
  const mismatchedAnswerPath = join(sandbox.home, "req-mismatched.json");
  await writeFile(
    mismatchedAnswerPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      currentTask: { taskId: pendingTaskId },
      answer: { raw: "1", pendingTaskId: "wrong-task-id-5678" },
    }),
    "utf8",
  );
  const mismatchRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", mismatchedAnswerPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(mismatchRun.status, 0);
  const mismatchDecision = JSON.parse(mismatchRun.stdout);
  assert.ok(mismatchDecision.reasons.includes("pending-task-correlation-id-mismatch"));

  // 5. User cancellation ("cancel" / "취소") discards selection
  const cancelPath = join(sandbox.home, "req-cancel.json");
  await writeFile(
    cancelPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      answer: { raw: "cancel", pendingTaskId },
    }),
    "utf8",
  );
  const cancelRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", cancelPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(cancelRun.status, 0);
  const cancelDecision = JSON.parse(cancelRun.stdout);
  assert.ok(cancelDecision.reasons.includes("task-selection-cancelled-by-user"));

  // 6. Valid answer ("1" or exact label "대화형-quick") succeeds
  const validAnswerPath = join(sandbox.home, "req-valid.json");
  await writeFile(
    validAnswerPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Add comprehensive dashboard metrics API" },
      answer: { raw: "1", pendingTaskId },
    }),
    "utf8",
  );
  const validRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", validAnswerPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(validRun.status, 0);
  const validDecision = JSON.parse(validRun.stdout);
  assert.equal(validDecision.selectedStyle, "conversational-quick");
  assert.equal(validDecision.executionAuthorized, false);
});

test("Journey C: direct command vs quote, explicit style, simple/complex twins, and WIP preservation (ENTRY-02, ENTRY-04, ENTRY-07, D-02, D-03, D-13, D-14, D-16)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "journey-c-project");
  await mkdir(join(projectDir, "src"), { recursive: true });
  await writeFile(join(projectDir, "src", "old.ts"), "export const a = 1;\n", "utf8");
  await writeFile(join(projectDir, "README.md"), "# Title\n", "utf8");

  // 1. Direct GSD command invocation
  const directCmdPath = join(sandbox.home, "req-direct-cmd.json");
  await writeFile(
    directCmdPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "gsd-discuss-phase 28 --auto" },
    }),
    "utf8",
  );
  const directRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", directCmdPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(directRun.status, 0);
  const directDecision = JSON.parse(directRun.stdout);
  assert.equal(directDecision.kind, "explicit-command");
  assert.equal(directDecision.commandRoute.command, "gsd-discuss-phase");

  // 2. Quoted command in prose is NOT direct invocation
  const quotedCmdPath = join(sandbox.home, "req-quoted-cmd.json");
  await writeFile(
    quotedCmdPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "문서에 `gsd-discuss-phase 28` 사용법을 설명하고 예시 작성" },
    }),
    "utf8",
  );
  const quotedRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", quotedCmdPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(quotedRun.status, 0);
  const quotedDecision = JSON.parse(quotedRun.stdout);
  assert.equal(quotedDecision.kind, "substantial-work");
  assert.ok(quotedDecision.chooser);

  // 3. Explicit style outranks simple exemption
  const explicitOutranksPath = join(sandbox.home, "req-explicit-outranks.json");
  await writeFile(
    explicitOutranksPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "대화형-quick-full로 README.md 번역" },
      operation: {
        type: "readme-translation",
        sourcePath: "README.md",
        target: "README.ko.md",
        faithful: true,
      },
    }),
    "utf8",
  );
  const outranksRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", explicitOutranksPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(outranksRun.status, 0);
  const outranksDecision = JSON.parse(outranksRun.stdout);
  assert.equal(outranksDecision.kind, "explicit-style");
  assert.equal(outranksDecision.selectedStyle, "conversational-quick-full");

  // 4. Simple local rename vs complex public API twin
  const simpleRenamePath = join(sandbox.home, "req-simple-rename.json");
  await writeFile(
    simpleRenamePath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "src/old.ts를 src/new.ts로 국소 변경" },
      operation: {
        type: "rename",
        oldPath: "src/old.ts",
        newPath: "src/new.ts",
        unchangedApiMeaning: true,
        scopedPaths: ["src/old.ts"],
      },
    }),
    "utf8",
  );
  const simpleRenameRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", simpleRenamePath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(simpleRenameRun.status, 0);
  const simpleRenameDecision = JSON.parse(simpleRenameRun.stdout);
  assert.equal(simpleRenameDecision.kind, "simple-operation");

  // Complex API rename twin
  const complexRenamePath = join(sandbox.home, "req-complex-rename.json");
  await writeFile(
    complexRenamePath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "src/old.ts를 src/new.ts로 변경하고 public API 변경" },
      operation: {
        type: "rename",
        oldPath: "src/old.ts",
        newPath: "src/new.ts",
        unchangedApiMeaning: false,
      },
    }),
    "utf8",
  );
  const complexRenameRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", complexRenamePath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(complexRenameRun.status, 0);
  const complexRenameDecision = JSON.parse(complexRenameRun.stdout);
  assert.equal(complexRenameDecision.kind, "substantial-work");
  assert.ok(complexRenameDecision.chooser);

  // 5. Scope expansion preserves dirty WIP and reclassifies
  const scopeExpansionPath = join(sandbox.home, "req-scope-expansion.json");
  await writeFile(
    scopeExpansionPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "예상치 못한 다단계 리팩터링으로 확장된 작업" },
      scopeChange: {
        previousOperationId: "op-rename",
        expandedScope: true,
        requiresInvestigation: true,
        wipBytesPreserved: true,
        isTaskRepair: false,
      },
    }),
    "utf8",
  );
  const expansionRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", scopeExpansionPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(expansionRun.status, 0);
  const expansionDecision = JSON.parse(expansionRun.stdout);
  assert.equal(expansionDecision.kind, "substantial-work");
  assert.equal(expansionDecision.nextAction, "choose-style");
  assert.ok(expansionDecision.reasons.includes("scope-expansion-reclassified"));
  assert.ok(expansionDecision.reasons.includes("wip-bytes-preserved"));
});

test("Journey D: numbered text fallback for limited question UI and fail-closed error boundaries (ENTRY-01, ENTRY-05, D-05, D-06, D-18, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "journey-d-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Numbered text fallback when supportsSixOptions is false or host tool has 2-choice limit
  const fallbackReqPath = join(sandbox.home, "req-fallback.json");
  await writeFile(
    fallbackReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Build new billing subscription webhook microservice" },
      questionCapability: {
        supportsSixOptions: false,
        style: "numbered-text",
      },
    }),
    "utf8",
  );
  const fallbackRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", fallbackReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(fallbackRun.status, 0);
  const fallbackDecision = JSON.parse(fallbackRun.stdout);
  assert.ok(fallbackDecision.chooser);
  assert.equal(fallbackDecision.chooser.rendering, "numbered-text");
  assert.equal(fallbackDecision.chooser.options.length, 6);

  // 2. Reject inputs that claim authority: executionAuthorized cannot be overridden by caller
  const spoofReqPath = join(sandbox.home, "req-spoof.json");
  await writeFile(
    spoofReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Build microservice" },
      executionAuthorized: true, // Caller tries to claim authority
    }),
    "utf8",
  );
  const spoofRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", spoofReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(spoofRun.status, 0, "CLI must reject input with forbidden authority fields");
  assert.match(spoofRun.stderr, /task intake schema/u);
});
