import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import { planOwnedSkillSync } from "../src/core/owned-skills.js";
import {
  approveTaskContract,
  previewTaskContract,
} from "../src/core/task-contract.js";
import { inspectGsdProjectReadiness } from "../src/core/task-gsd-readiness.js";
import type { GsdQuickStage } from "../src/core/task-gsd-stages.js";
import {
  startTask,
  type ControllerPort,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type TaskPorts,
} from "../src/core/task-run.js";
import type { HarnessId } from "../src/types.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";
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

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

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

test("1. Shared Mode Transition Chain vs Corrupt Policy and Wrong-Root Refusal (D-02, D-03, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "chain-project");
  await mkdir(projectDir, { recursive: true });

  const targets: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  const envs: Record<HarnessId, NodeJS.ProcessEnv> = {
    claude: {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, "state-claude"),
      CLAUDE_CONFIG_DIR: join(sandbox.home, ".claude"),
    },
    codex: {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, "state-codex"),
      CODEX_HOME: join(sandbox.home, ".codex"),
    },
    antigravity: {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, "state-antigravity"),
      ANTIGRAVITY_CONFIG_DIR: join(sandbox.home, ".antigravity"),
    },
    pi: {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, "state-pi"),
      PI_CODING_AGENT_DIR: join(sandbox.home, ".pi", "agent"),
    },
    hermes: {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, "state-hermes"),
      HERMES_HOME: join(sandbox.home, ".hermes"),
    },
  };

  for (const target of targets) {
    await mkdir(envs[target].ALPHA_AOS_STATE_DIR as string, { recursive: true });
  }

  // 1. Unconfigured project mode query across all 5 harness environments
  for (const target of targets) {
    const q = spawnSync(
      process.execPath,
      [cliPath, "project", "mode", projectDir, "--json"],
      { env: envs[target], encoding: "utf8" },
    );
    assert.equal(q.status, 0, `unconfigured query failed for ${target}: ${q.stderr}`);
    const view = JSON.parse(q.stdout);
    assert.equal(view.effectiveMode, "strict");
    assert.equal(view.source, "builtin-default");
    assert.equal(view.revision, "missing");
  }
  // Zero .alpha-aos writes occurred
  assert.equal(existsSync(join(projectDir, ".alpha-aos")), false, ".alpha-aos must not exist after unconfigured read");

  // 2. Multi-harness sequence via compiled dist/src/cli.js:
  // Step A: Codex previews and applies project mode set flexible
  const codexPreview = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.equal(codexPreview.status, 0, `codex preview failed: ${codexPreview.stderr}`);
  const codexPlan = JSON.parse(codexPreview.stdout);
  assert.ok(codexPlan.planDigest, "codex plan must produce planDigest");

  const codexApply = spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "mode",
      "set",
      "flexible",
      projectDir,
      "--plan-digest",
      codexPlan.planDigest,
      "--apply",
      "--json",
    ],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.equal(codexApply.status, 0, `codex apply failed: ${codexApply.stderr}`);
  const codexApplied = JSON.parse(codexApply.stdout);
  assert.equal(codexApplied.mode, "flexible");

  // Step B: Antigravity runs task intake on a substantial request and consumes flexible
  const substantialReqPath = join(projectDir, "substantial-req.json");
  await writeFile(
    substantialReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Refactor core database access layer and distributed transaction routing",
        shortGoal: "Refactor database layer",
        shortScope: "Database routing",
      },
    }, null, 2),
    "utf8",
  );

  const agIntake = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", substantialReqPath, "--json"],
    { env: envs.antigravity, encoding: "utf8" },
  );
  assert.equal(agIntake.status, 0, `antigravity intake failed: ${agIntake.stderr}`);
  const agData = JSON.parse(agIntake.stdout);
  assert.equal(agData.policy.effectiveMode, "flexible");
  assert.equal(agData.policy.source, "project-policy");
  assert.equal(agData.nextAction, "adaptive-intake");
  assert.equal(agData.executionAuthorized, false);

  // Step C: Pi previews and applies project mode set strict
  const piPreview = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "strict", projectDir, "--json"],
    { env: envs.pi, encoding: "utf8" },
  );
  assert.equal(piPreview.status, 0, `pi preview failed: ${piPreview.stderr}`);
  const piPlan = JSON.parse(piPreview.stdout);
  assert.ok(piPlan.planDigest, "pi plan must produce planDigest");

  const piApply = spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "mode",
      "set",
      "strict",
      projectDir,
      "--plan-digest",
      piPlan.planDigest,
      "--apply",
      "--json",
    ],
    { env: envs.pi, encoding: "utf8" },
  );
  assert.equal(piApply.status, 0, `pi apply failed: ${piApply.stderr}`);
  const piApplied = JSON.parse(piApply.stdout);
  assert.equal(piApplied.mode, "strict");

  // Step D: Pre-existing Codex session (reusing exact same CODEX_HOME and stateRoot)
  // runs next intake and observes fresh strict with choose-style and exact 6 Korean labels
  const codexNextIntake = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", substantialReqPath, "--json"],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.equal(codexNextIntake.status, 0, `codex next intake failed: ${codexNextIntake.stderr}`);
  const codexNext = JSON.parse(codexNextIntake.stdout);
  assert.equal(codexNext.policy.effectiveMode, "strict");
  assert.equal(codexNext.policy.source, "project-policy");
  assert.equal(codexNext.nextAction, "choose-style");
  assert.equal(codexNext.executionAuthorized, false);

  assert.ok(codexNext.chooser, "chooser must be present in strict mode");
  assert.equal(codexNext.chooser.options.length, 6);
  assert.equal(codexNext.chooser.options[0].label, "대화형-quick");
  assert.equal(codexNext.chooser.options[1].label, "대화형-quick-full");
  assert.equal(codexNext.chooser.options[2].label, "대화형-phase");
  assert.equal(codexNext.chooser.options[3].label, "오토파일럿-quick");
  assert.equal(codexNext.chooser.options[4].label, "오토파일럿-quick-full");
  assert.equal(codexNext.chooser.options[5].label, "오토파일럿-phase");

  // Claude and Hermes read the exact same strict revision
  const claudeQuery = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    { env: envs.claude, encoding: "utf8" },
  );
  const hermesQuery = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    { env: envs.hermes, encoding: "utf8" },
  );
  assert.equal(claudeQuery.status, 0);
  assert.equal(hermesQuery.status, 0);
  const claudeView = JSON.parse(claudeQuery.stdout);
  const hermesView = JSON.parse(hermesQuery.stdout);
  assert.equal(claudeView.effectiveMode, "strict");
  assert.equal(claudeView.revision, codexNext.policy.revision);
  assert.equal(hermesView.effectiveMode, "strict");
  assert.equal(hermesView.revision, codexNext.policy.revision);

  // 3. Negative cases: malformed behavior.json, stale plan digest, out-of-root paths
  const behaviorJsonPath = join(projectDir, ".alpha-aos", "behavior.json");
  const validBehaviorBytes = await readFile(behaviorJsonPath, "utf8");

  // Malformed behavior.json fails closed with zero fallback to flexible
  await writeFile(behaviorJsonPath, "{ malformed behavior json content ", "utf8");
  const corruptQuery = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.notEqual(corruptQuery.status, 0, "malformed behavior.json must fail closed");

  // Restore valid behavior
  await writeFile(behaviorJsonPath, validBehaviorBytes, "utf8");

  // Stale --plan-digest fails closed
  const staleApply = spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "mode",
      "set",
      "flexible",
      projectDir,
      "--plan-digest",
      "0000000000000000000000000000000000000000000000000000000000000000",
      "--apply",
      "--json",
    ],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.notEqual(staleApply.status, 0, "stale plan digest must fail closed");

  // Out-of-root or non-existent escape fails closed
  const outOfRootTarget = join(sandbox.root, "non-existent-outside-dir");
  const outOfRootApply = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", outOfRootTarget, "--json"],
    { env: envs.codex, encoding: "utf8" },
  );
  assert.notEqual(outOfRootApply.status, 0, "out-of-root target must fail closed");
});

test("2. Task Lifetime Boundary: Post-Release Fresh Chooser vs Active Task Continuity and Fallback (D-02, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "lifetime-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Autopilot-phase release task reaches terminal completed status
  const phaseDir = join(projectDir, ".planning", "phases", "01-release");
  await mkdir(phaseDir, { recursive: true });
  const releaseSummaryPath = join(phaseDir, "01-SUMMARY.md");
  await writeFile(releaseSummaryPath, "# Phase 01 Release Summary\nstatus: completed\n", "utf8");

  // A new independent substantial bug-fix request in strict mode
  const independentBugPath = join(projectDir, "req-independent-bug.json");
  await writeFile(
    independentBugPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Fix race condition in background heartbeat monitor worker",
        shortGoal: "Fix heartbeat race condition",
        shortScope: "Heartbeat worker",
      },
      currentTask: {
        artifactPath: ".planning/phases/01-release/01-SUMMARY.md",
        relationship: "independent",
      },
    }, null, 2),
    "utf8",
  );

  const freshChooserRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", independentBugPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(freshChooserRes.status, 0, `fresh chooser query failed: ${freshChooserRes.stderr}`);
  const freshChooserData = JSON.parse(freshChooserRes.stdout);

  assert.equal(freshChooserData.kind, "substantial-work");
  assert.equal(freshChooserData.nextAction, "choose-style");
  assert.equal(freshChooserData.executionAuthorized, false);
  assert.ok(freshChooserData.chooser, "must present chooser");
  assert.equal(freshChooserData.chooser.options.length, 6);
  // Must NOT inherit autopilot-phase as a default
  assert.equal(freshChooserData.selectedStyle ?? null, null);

  // When chosen, cleanly projects autopilot-quick-full
  const chosenPath = join(projectDir, "req-chosen.json");
  await writeFile(
    chosenPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Fix race condition in background heartbeat monitor worker",
      },
      answer: {
        canonicalStyle: "autopilot-quick-full",
      },
    }, null, 2),
    "utf8",
  );

  const chosenRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", chosenPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(chosenRes.status, 0, `chosen intake failed: ${chosenRes.stderr}`);
  const chosenData = JSON.parse(chosenRes.stdout);
  assert.equal(chosenData.selectedStyle, "autopilot-quick-full");
  assert.ok(chosenData.executionRoute);
  assert.equal(chosenData.executionRoute.style, "autopilot-quick-full");
  assert.equal(chosenData.executionRoute.surface, "isolated-runner");
  assert.equal(chosenData.executionRoute.quickQuality, "full");
  assert.equal(chosenData.executionRoute.authorityRequirements.executionAuthorized, false);
  assert.equal(chosenData.executionRoute.authorityRequirements.requiresExactApproval, true);
  assert.equal(chosenData.executionRoute.authorityRequirements.requiresSeparateStart, true);

  // 2. In-progress active task follow-up preserves continuity without re-prompting even across mode flip
  const quickDir = join(projectDir, ".planning", "quick", "002-active-bug");
  await mkdir(quickDir, { recursive: true });
  const activePlanPath = join(quickDir, "002-PLAN.md");
  await writeFile(activePlanPath, "# Quick 002 Plan\nstatus: in-progress\n", "utf8");

  const activeFollowUpPath = join(projectDir, "req-active-followup.json");
  await writeFile(
    activeFollowUpPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: {
        text: "Add unit test for the race condition fix",
      },
      currentTask: {
        taskId: "002-active-bug",
        artifactPath: ".planning/quick/002-active-bug/002-PLAN.md",
        relationship: "follow-up",
        selectedStyle: "conversational-quick",
      },
    }, null, 2),
    "utf8",
  );

  const activeIntake1 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", activeFollowUpPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(activeIntake1.status, 0);
  const activeData1 = JSON.parse(activeIntake1.stdout);
  assert.equal(activeData1.kind, "continuation");
  assert.equal(activeData1.nextAction, "continue-task");
  assert.equal(activeData1.selectedStyle, "conversational-quick");

  // Flip project mode to flexible
  const flexPreview = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  const flexPlan = JSON.parse(flexPreview.stdout);
  spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "mode",
      "set",
      "flexible",
      projectDir,
      "--plan-digest",
      flexPlan.planDigest,
      "--apply",
      "--json",
    ],
    { env: sandbox.env, encoding: "utf8" },
  );

  // Active follow-up re-evaluated under flexible mode preserves continuity without re-prompting
  const activeIntake2 = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", activeFollowUpPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(activeIntake2.status, 0);
  const activeData2 = JSON.parse(activeIntake2.stdout);
  assert.equal(activeData2.kind, "continuation");
  assert.equal(activeData2.nextAction, "continue-task");
  assert.equal(activeData2.selectedStyle, "conversational-quick");

  // 3. Negative cases: mismatched canonicalRoot, conflicting explicit command + style, and text numbered 1-6 fallback
  // Mismatched boundProjectRoot fails closed
  const mismatchReqPath = join(projectDir, "req-mismatch.json");
  await writeFile(
    mismatchReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      boundProjectRoot: join(sandbox.home, "some-other-root"),
      request: { text: "Mismatch test" },
    }),
    "utf8",
  );
  const mismatchRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", mismatchReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.notEqual(mismatchRes.status, 0, "mismatched canonicalRoot must fail closed");
  const mismatchJson = JSON.parse(mismatchRes.stdout);
  assert.equal(mismatchJson.code, "bound-root-mismatch");

  // Conflicting explicit GSD command + explicit style refuses fail-closed
  const conflictReqPath = join(projectDir, "req-conflict.json");
  await writeFile(
    conflictReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Implement task" },
      explicit: {
        command: "quick",
        style: "autopilot-phase",
      },
    }),
    "utf8",
  );
  const conflictRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", conflictReqPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(conflictRes.status, 0);
  const conflictData = JSON.parse(conflictRes.stdout);
  assert.equal(conflictData.kind, "clarification-needed");
  assert.equal(conflictData.nextAction, "ask-clarification");

  // Numbered 1-6 text fallback rendering vs structured chooser
  // Restore strict mode to see full numbered 1-6 chooser in text output
  const strictPreview = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "strict", projectDir, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  const strictPlan = JSON.parse(strictPreview.stdout);
  spawnSync(
    process.execPath,
    [
      cliPath,
      "project",
      "mode",
      "set",
      "strict",
      projectDir,
      "--plan-digest",
      strictPlan.planDigest,
      "--apply",
      "--json",
    ],
    { env: sandbox.env, encoding: "utf8" },
  );

  const textIntake = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", independentBugPath],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(textIntake.status, 0);
  assert.match(textIntake.stdout, /1\. 대화형-quick/u);
  assert.match(textIntake.stdout, /2\. 대화형-quick-full/u);
  assert.match(textIntake.stdout, /3\. 대화형-phase/u);
  assert.match(textIntake.stdout, /4\. 오토파일럿-quick/u);
  assert.match(textIntake.stdout, /5\. 오토파일럿-quick-full/u);
  assert.match(textIntake.stdout, /6\. 오토파일럿-phase/u);
});

test("3. Bootstrap and Non-Destructive Recovery Continuity vs Duplicate or Unapproved Start (D-02, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);

  // Setup fake GSD tools in CODEX_HOME so task readiness and bootstrap evaluate disk state
  const codexHome = join(sandbox.home, ".codex");
  const fakeGsdTools = join(codexHome, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(
    fakeGsdTools,
    `
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const planningDir = path.join(cwd, ".planning");
const planningExists = fs.existsSync(planningDir);
const projectExists = fs.existsSync(path.join(planningDir, "PROJECT.md"));
const requirementsExists = fs.existsSync(path.join(planningDir, "REQUIREMENTS.md"));
const roadmapExists = fs.existsSync(path.join(planningDir, "ROADMAP.md"));
const stateExists = fs.existsSync(path.join(planningDir, "STATE.md"));
const initIncomplete = planningExists && (!projectExists || !requirementsExists || !roadmapExists || !stateExists);
console.log(JSON.stringify({
  packageName: "@opengsd/gsd-core",
  version: "1.18.0",
  planning_exists: planningExists,
  init_incomplete: initIncomplete,
  project_exists: projectExists,
  requirements_exists: requirementsExists,
  roadmap_exists: roadmapExists,
  state_exists: stateExists,
  agents_installed: true,
  project_root: cwd,
}));
`,
    "utf8",
  );

  const env = {
    ...sandbox.env,
    CODEX_HOME: codexHome,
  };

  // 1. Absent-project flow
  const absentDir = join(sandbox.home, "absent-project");
  await mkdir(absentDir, { recursive: true });

  const absentReadyReq = join(absentDir, "req-readiness.json");
  await writeFile(
    absentReadyReq,
    JSON.stringify({
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: absentDir,
    }),
    "utf8",
  );

  const absentReadyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", absentReadyReq, "--json"],
    { cwd: absentDir, env, encoding: "utf8" },
  );
  assert.equal(absentReadyRes.status, 0);
  const absentReadyData = JSON.parse(absentReadyRes.stdout);
  assert.equal(absentReadyData.diagnosis, "absent-project");
  assert.equal(absentReadyData.ready, false);

  // 2. Partial-project with pre-existing .planning/PROJECT.md custom bytes
  const partialDir = join(sandbox.home, "partial-project");
  const partialPlanningDir = join(partialDir, ".planning");
  await mkdir(partialPlanningDir, { recursive: true });
  const customProjectBytes = "# Custom Enterprise Project\nUnique architectural constraints.\n";
  await writeFile(join(partialPlanningDir, "PROJECT.md"), customProjectBytes, "utf8");

  const partialReadyReq = join(partialDir, "req-readiness.json");
  await writeFile(
    partialReadyReq,
    JSON.stringify({
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: partialDir,
    }),
    "utf8",
  );

  const partialReadyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", partialReadyReq, "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(partialReadyRes.status, 0);
  const partialReadyData = JSON.parse(partialReadyRes.stdout);
  assert.equal(partialReadyData.diagnosis, "partial-project");
  assert.equal(partialReadyData.ready, false);

  // Prepare task bootstrap for partial-project requesting autopilot-quick-full
  const prepareReqPath = join(partialDir, "req-prepare.json");
  await writeFile(
    prepareReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "prepare",
      controller: "codex",
      workflow: "quick",
      selectedStyle: "autopilot-quick-full",
      pendingId: "pending-partial-001",
      projectRoot: partialDir,
      request: { text: "Implement custom payment processing" },
    }),
    "utf8",
  );

  const prepPrevRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", prepareReqPath, "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(prepPrevRes.status, 0);
  const prepPrevData = JSON.parse(prepPrevRes.stdout);
  assert.equal(prepPrevData.applied, false);
  assert.ok(prepPrevData.planDigest);

  const prepApplyRes = spawnSync(
    process.execPath,
    [
      cliPath,
      "task",
      "bootstrap",
      "--input",
      prepareReqPath,
      "--plan-digest",
      prepPrevData.planDigest,
      "--apply",
      "--json",
    ],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(prepApplyRes.status, 0);
  const prepApplyData = JSON.parse(prepApplyRes.stdout);
  assert.equal(prepApplyData.applied, true);

  // Assert .planning/PROJECT.md custom bytes are preserved byte-for-byte without placeholder synthesis
  const readProjectBytes = await readFile(join(partialPlanningDir, "PROJECT.md"), "utf8");
  assert.equal(readProjectBytes, customProjectBytes, "custom PROJECT.md bytes must be preserved byte-for-byte");

  // Complete remaining planning files to satisfy readiness before claiming
  await writeFile(join(partialPlanningDir, "REQUIREMENTS.md"), "# Requirements\n", "utf8");
  await writeFile(join(partialPlanningDir, "ROADMAP.md"), "# Roadmap\n", "utf8");
  await writeFile(join(partialPlanningDir, "STATE.md"), "# State\n", "utf8");

  // Claim handoff: route is "new-task", dispatchAuthorized remains false for autopilot
  const claimReqPath = join(partialDir, "req-claim.json");
  await writeFile(
    claimReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "claim",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-partial-001",
      projectRoot: partialDir,
      claimNonce: "claim-nonce-partial-001",
    }),
    "utf8",
  );

  const claimRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", claimReqPath, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(claimRes.status, 0, `claim failed: ${claimRes.stderr}`);
  const claimData = JSON.parse(claimRes.stdout);
  assert.equal(claimData.operation, "claim");
  assert.equal(claimData.status, "claimed");
  assert.equal(claimData.selectedStyle, "autopilot-quick-full");
  assert.equal(claimData.dispatchAuthorized, false, "autopilot claim MUST keep dispatchAuthorized: false");

  // Link native reference
  const summaryDir = join(partialPlanningDir, "quick", "001-payment");
  await mkdir(summaryDir, { recursive: true });
  const summaryPath = join(summaryDir, "001-SUMMARY.md");
  await writeFile(summaryPath, "# Payment Summary\n", "utf8");

  const linkReqPath = join(partialDir, "req-link.json");
  await writeFile(
    linkReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "link",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-partial-001",
      projectRoot: partialDir,
      claimNonce: "claim-nonce-partial-001",
      nativeReference: {
        id: "001-payment",
        type: "quick",
        quickPath: summaryPath,
      },
    }),
    "utf8",
  );

  const linkRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", linkReqPath, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(linkRes.status, 0);
  const linkData = JSON.parse(linkRes.stdout);
  assert.equal(linkData.operation, "link");
  assert.equal(linkData.status, "linked");

  // Reentry with same pending reference -> route to continue-existing (resumes once, no duplicate task)
  const reenterRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", claimReqPath, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(reenterRes.status, 0);
  const reenterData = JSON.parse(reenterRes.stdout);
  assert.equal(reenterData.operation, "claim");
  assert.equal(reenterData.status, "linked");
  assert.equal(reenterData.nextAction, "continue-existing");
  assert.equal(reenterData.dispatchAuthorized, false);

  // 3. Autopilot Contract Approval & Start negative cases
  const contract = inventorySummaryContract(partialDir, {
    scope: {
      projectRoot: partialDir,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI",
    },
  });
  contract.id = "auto-bootstrap-contract";
  const contractPath = join(partialDir, "task-contract.json");
  await writeTaskContract(contractPath, contract);

  const contractPreview = await previewTaskContract({ contractPath, stateRoot: sandbox.state });
  assert.equal(contractPreview.approved, false);

  // Negative case: startTask before approval throws fail-closed
  await assert.rejects(
    async () => startTask({
      contractPath,
      expectedDigest: contractPreview.digest,
      stateRoot: sandbox.state,
      packageRoot: packageRoot(),
      ports: fullFixturePorts(fullControllerPort()),
    }),
    /not-approved|has no approval/iu,
  );

  // Approve with exact 64-hex digest
  await approveTaskContract({
    contractPath,
    expectedDigest: contractPreview.digest,
    stateRoot: sandbox.state,
  });

  // Negative case: startTask with drifted digest throws fail-closed
  await assert.rejects(
    async () => startTask({
      contractPath,
      expectedDigest: "0000000000000000000000000000000000000000000000000000000000000000",
      stateRoot: sandbox.state,
      packageRoot: packageRoot(),
      ports: fullFixturePorts(fullControllerPort()),
    }),
    /contract-drift|never approved|does not match/iu,
  );

  // Negative case: cancelled bootstrap refuses claim
  const cancelPrepReq = join(partialDir, "req-cancel-prep.json");
  await writeFile(
    cancelPrepReq,
    JSON.stringify({
      schemaVersion: 1,
      operation: "prepare",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-to-cancel",
      projectRoot: partialDir,
      request: { text: "Cancelled task" },
    }),
    "utf8",
  );
  const cancelPrepRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", cancelPrepReq, "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  const cancelPrepData = JSON.parse(cancelPrepRes.stdout);
  spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", cancelPrepReq, "--plan-digest", cancelPrepData.planDigest, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );

  const cancelReq = join(partialDir, "req-cancel.json");
  await writeFile(
    cancelReq,
    JSON.stringify({
      schemaVersion: 1,
      operation: "cancel",
      pendingId: "pending-to-cancel",
      projectRoot: partialDir,
    }),
    "utf8",
  );
  const cancelRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", cancelReq, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.equal(cancelRes.status, 0);

  // Attempting to claim cancelled bootstrap throws already-cancelled
  const claimCancelledReq = join(partialDir, "req-claim-cancelled.json");
  await writeFile(
    claimCancelledReq,
    JSON.stringify({
      schemaVersion: 1,
      operation: "claim",
      pendingId: "pending-to-cancel",
      projectRoot: partialDir,
    }),
    "utf8",
  );
  const claimCancelledRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", claimCancelledReq, "--apply", "--json"],
    { cwd: partialDir, env, encoding: "utf8" },
  );
  assert.notEqual(claimCancelledRes.status, 0, "claiming cancelled bootstrap must fail closed");
});

test("4. Full-Quality 7-Stage Gate, Guidance Tamper, and Harness Ceiling (D-02, D-03, D-13)", async (context) => {
  const fixture = await createTaskFixture(context);

  // 1. Positive case: Autopilot-quick-full succeeds when all 7 MANDATORY_FULL_STAGES pass
  const fullContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI full",
    },
  });
  fullContract.id = "auto-full-all-stages";
  const fullPath = join(fixture.scratch, "task-full-all.json");
  await writeTaskContract(fullPath, fullContract);

  const fullPreview = await previewTaskContract({ contractPath: fullPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fullPath, expectedDigest: fullPreview.digest, stateRoot: fixture.stateRoot });

  const fullRunSuccess = await startTask({
    contractPath: fullPath,
    expectedDigest: fullPreview.digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort()),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.equal(fullRunSuccess.run.status, "accepted");
  assert.equal(fullRunSuccess.run.gsd?.status, "verified");
  assert.equal(fullRunSuccess.run.gsd?.fullEvidence?.status, "verified");
  assert.equal(fullRunSuccess.run.gsd?.fullEvidence?.missingStages.length, 0);

  // 2. Negative cases: Omission of research or plan-check stage
  const omitResearchContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI omit research",
    },
  });
  omitResearchContract.id = "auto-full-omit-research";
  const omitResearchPath = join(fixture.scratch, "task-omit-research.json");
  await writeTaskContract(omitResearchPath, omitResearchContract);

  const previewOmitRes = await previewTaskContract({ contractPath: omitResearchPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: omitResearchPath, expectedDigest: previewOmitRes.digest, stateRoot: fixture.stateRoot });

  const runOmitResearch = await startTask({
    contractPath: omitResearchPath,
    expectedDigest: previewOmitRes.digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ omitStages: ["research"] })),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.notEqual(runOmitResearch.run.status, "accepted", "omitting research stage must fail acceptance");

  const omitPlanCheckContract = inventorySummaryContract(fixture.projectRoot, {
    scope: {
      projectRoot: fixture.projectRoot,
      workflow: "gsd-quick",
      quickQuality: "full",
      summary: "Add inventory-summary CLI omit plan-check",
    },
  });
  omitPlanCheckContract.id = "auto-full-omit-plan-check";
  const omitPlanCheckPath = join(fixture.scratch, "task-omit-plan-check.json");
  await writeTaskContract(omitPlanCheckPath, omitPlanCheckContract);

  const previewOmitPlan = await previewTaskContract({ contractPath: omitPlanCheckPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: omitPlanCheckPath, expectedDigest: previewOmitPlan.digest, stateRoot: fixture.stateRoot });

  const runOmitPlanCheck = await startTask({
    contractPath: omitPlanCheckPath,
    expectedDigest: previewOmitPlan.digest,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    ports: fullFixturePorts(fullControllerPort({ omitStages: ["plan-check"] })),
    gsd: { configRoot: fixture.gsdConfigRoot },
  });
  assert.notEqual(runOmitPlanCheck.run.status, "accepted", "omitting plan-check stage must fail acceptance");

  // 3. Guidance tamper: Fails planOwnedSkillSync when alpha-aos-task bytes or lock hashes are mutated
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const tamperedLock = structuredClone(lock);
  assert.ok(tamperedLock.components.ownedSkills?.["alpha-aos-task"]);
  tamperedLock.components.ownedSkills["alpha-aos-task"].sourceSha256 = "0000000000000000000000000000000000000000000000000000000000000000";

  await assert.rejects(
    async () => planOwnedSkillSync(root, catalog, tamperedLock, "alpha-aos-task", "codex", {
      stateRoot: fixture.stateRoot,
      targetHome: join(fixture.scratch, "home-codex"),
    }),
    /source hash mismatch|Owned skill source hash mismatch/iu,
    "mutated lock hash must fail planOwnedSkillSync fail-closed",
  );

  // 4. Harness ceiling: Explicitly reports unsupported when controller "hermes" requests GSD readiness
  const hermesReadiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "hermes",
      workflow: "quick",
      projectRoot: fixture.projectRoot,
    },
    invocationPath: fixture.projectRoot,
    stateRoot: fixture.stateRoot,
  });

  assert.equal(hermesReadiness.controller, "hermes");
  assert.equal(hermesReadiness.diagnosis, "unsupported");
  assert.equal(hermesReadiness.ready, false);
  assert.equal(hermesReadiness.executionAuthorized, false);
  assert.match(hermesReadiness.reasons[0] ?? "", /Hermes controller is unsupported/iu);
  assert.match(hermesReadiness.nextAction, /Switch controller to a supported GSD harness/iu);

  // CLI also outputs unsupported for Hermes controller
  const hermesReqPath = join(fixture.scratch, "hermes-readiness.json");
  await writeFile(
    hermesReqPath,
    JSON.stringify({
      schemaVersion: 1,
      controller: "hermes",
      workflow: "quick",
      projectRoot: fixture.projectRoot,
    }),
    "utf8",
  );

  const hermesCliRes = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", hermesReqPath, "--json"],
    {
      env: {
        ...process.env,
        ALPHA_AOS_STATE_DIR: fixture.stateRoot,
        CODEX_HOME: fixture.gsdConfigRoot,
      },
      encoding: "utf8",
    },
  );
  assert.equal(hermesCliRes.status, 0);
  const hermesCliData = JSON.parse(hermesCliRes.stdout);
  assert.equal(hermesCliData.diagnosis, "unsupported");
  assert.equal(hermesCliData.ready, false);
});
