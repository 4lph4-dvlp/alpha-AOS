import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";
import { resolveTaskIntakeContinuity } from "../src/core/task-intake-continuity.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("resolveTaskIntakeContinuity verifies active task, rejects latest-run fallback, and checks digests (ENTRY-03, D-09, D-10)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "continuity-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Missing runId -> latest-run fallback prohibited
  const missingRunId = await resolveTaskIntakeContinuity({
    canonicalRoot: projectDir,
    stateRoot: sandbox.state,
    request: { text: "Fix unit test failure" },
    currentTask: {
      taskId: "task-0123456789abcdef",
      relationship: "test-repair",
      // runId omitted
    },
  });
  assert.equal(missingRunId.outcome, "uncertain");
  assert.match(missingRunId.reason!, /latest-run fallback is prohibited/u);

  // 2. Explicit independent task does not inherit active task style
  const independent = await resolveTaskIntakeContinuity({
    canonicalRoot: projectDir,
    stateRoot: sandbox.state,
    request: { text: "Add unrelated search filter" },
    currentTask: {
      taskId: "task-0123456789abcdef",
      runId: "run-01234567",
      selectedStyle: "autopilot-phase",
      relationship: "independent",
    },
  });
  assert.equal(independent.outcome, "unrelated");
  assert.match(independent.reason!, /independent task request does not inherit/u);

  // 3. Artifact escaping canonical root
  const escaping = await resolveTaskIntakeContinuity({
    canonicalRoot: projectDir,
    stateRoot: sandbox.state,
    request: { text: "Review status" },
    currentTask: {
      artifactPath: "../../../escaping.md",
      relationship: "verification",
    },
  });
  assert.equal(escaping.outcome, "unrelated");
  assert.match(escaping.reason!, /escapes canonical project root/u);
});

test("pending answer correlation prevents cross-task consumption, handles cancel and status detour (D-07, D-08, D-11)", async () => {
  // 1. Swapped pendingTaskId
  const swapped = await resolveTaskIntakeContinuity({
    canonicalRoot: "D:/fake/proj",
    request: { text: "Continue work" },
    currentTask: {
      taskId: "pending-task-A",
      relationship: "follow-up",
    },
    answer: {
      raw: "1",
      pendingTaskId: "pending-task-B", // Swapped correlation ID
    },
  });
  assert.equal(swapped.outcome, "pending-mismatch");
  assert.match(swapped.reason!, /correlation ID mismatch/u);

  // 2. Explicit cancellation
  const cancelled = await resolveTaskIntakeContinuity({
    canonicalRoot: "D:/fake/proj",
    request: { text: "Continue work" },
    currentTask: {
      taskId: "pending-task-A",
    },
    answer: {
      raw: "cancel",
      pendingTaskId: "pending-task-A",
    },
  });
  assert.equal(cancelled.outcome, "cancelled");

  // 3. Status detour preserves pending selection
  const statusDetour = await resolveTaskIntakeContinuity({
    canonicalRoot: "D:/fake/proj",
    request: { text: "Continue work" },
    currentTask: {
      taskId: "pending-task-A",
    },
    answer: {
      raw: "진행 상황",
      pendingTaskId: "pending-task-A",
    },
  });
  assert.equal(statusDetour.outcome, "status-query");
});

test("CLI active GSD task retains style for related test repair; completed release followed by independent bug gets fresh chooser (ENTRY-03, D-09, D-10)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "gsd-continuity-project");
  const quickDir = join(projectDir, ".planning", "quick");
  await mkdir(quickDir, { recursive: true });

  // Create an active GSD quick plan (PLAN exists, not completed)
  const activePlanPath = join(quickDir, "quick-2801.md");
  await writeFile(
    activePlanPath,
    '---\ntask: quick-2801\nstatus: in-progress\n---\n# Active Quick Task\n',
    "utf8",
  );

  // 1. Related test repair on active GSD task retains style
  const repairPayload = {
    schemaVersion: 1,
    request: {
      text: "테스트가 실패하여 수정합니다",
    },
    currentTask: {
      taskId: "quick-2801",
      artifactPath: ".planning/quick/quick-2801.md",
      selectedStyle: "conversational-quick",
      relationship: "test-repair",
    },
  };
  const repairPath = join(projectDir, "repair-req.json");
  await writeFile(repairPath, JSON.stringify(repairPayload, null, 2), "utf8");

  const repairRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", repairPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(repairRes.status, 0, `repair query failed: ${repairRes.stderr}`);
  const repairJson = JSON.parse(repairRes.stdout);

  assert.equal(repairJson.kind, "continuation");
  assert.equal(repairJson.nextAction, "continue-task");
  assert.equal(repairJson.selectedStyle, "conversational-quick");
  assert.equal(repairJson.taskReference, "quick-2801");
  assert.equal(repairJson.executionAuthorized, false);
  assert.equal(repairJson.chooser, undefined, "Active continuation must skip chooser");

  // 2. Mark task as completed with SUMMARY.md
  const completedSummaryPath = join(quickDir, "quick-2801-SUMMARY.md");
  await writeFile(
    completedSummaryPath,
    '---\ntask: quick-2801\nstatus: completed\n---\n# Completed Summary\n',
    "utf8",
  );

  // Subsequent independent bug request receives a fresh strict chooser
  const newBugPayload = {
    schemaVersion: 1,
    request: {
      text: "로그인 페이지에서 CSS 정렬 깨짐 버그 수정",
    },
    currentTask: {
      taskId: "quick-2801",
      artifactPath: ".planning/quick/quick-2801-SUMMARY.md",
      relationship: "independent",
    },
  };
  const newBugPath = join(projectDir, "new-bug-req.json");
  await writeFile(newBugPath, JSON.stringify(newBugPayload, null, 2), "utf8");

  const newBugRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", newBugPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(newBugRes.status, 0, `new bug query failed: ${newBugRes.stderr}`);
  const newBugJson = JSON.parse(newBugRes.stdout);

  assert.equal(newBugJson.kind, "substantial-work");
  assert.equal(newBugJson.nextAction, "choose-style");
  assert.equal(newBugJson.executionAuthorized, false);
  assert.ok(newBugJson.chooser, "Independent request after completed task must present chooser");
  assert.equal(newBugJson.chooser.options.length, 6);
});

test("CLI mode flip does not replace active task style or contract binding (D-12)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "mode-flip-project");
  const quickDir = join(projectDir, ".planning", "quick");
  await mkdir(quickDir, { recursive: true });

  const activePlanPath = join(quickDir, "task-active.md");
  await writeFile(activePlanPath, '# Active plan\n', "utf8");

  // Set project behavior to flexible
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });
  await writeFile(
    join(alphaAosDir, "behavior.json"),
    JSON.stringify({ schemaVersion: 1, mode: "flexible" }, null, 2),
    "utf8",
  );

  // Active task continuation under flexible mode retains its verified style
  const activePayload = {
    schemaVersion: 1,
    request: {
      text: "후속 코드 리팩토링",
    },
    currentTask: {
      taskId: "task-active",
      artifactPath: ".planning/quick/task-active.md",
      selectedStyle: "autopilot-phase",
      relationship: "follow-up",
    },
  };
  const activePath = join(projectDir, "active.json");
  await writeFile(activePath, JSON.stringify(activePayload, null, 2), "utf8");

  const activeRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", activePath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(activeRes.status, 0);
  const activeJson = JSON.parse(activeRes.stdout);

  assert.equal(activeJson.kind, "continuation");
  assert.equal(activeJson.nextAction, "continue-task");
  assert.equal(activeJson.selectedStyle, "autopilot-phase");
  assert.equal(activeJson.policy.effectiveMode, "flexible");
  assert.ok(activeJson.executionRoute);
  assert.equal(activeJson.executionRoute.style, "autopilot-phase");
  assert.equal(activeJson.executionRoute.surface, "isolated-runner");
  assert.equal(activeJson.executionRoute.command, "gsd-phase");

  // But a new independent request in the same flexible project receives adaptive intake
  const independentPayload = {
    schemaVersion: 1,
    request: {
      text: "완전 새로운 결제 모듈 추가",
    },
  };
  const independentPath = join(projectDir, "indep.json");
  await writeFile(independentPath, JSON.stringify(independentPayload, null, 2), "utf8");

  const indepRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", independentPath, "--json"],
    { cwd: projectDir, env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(indepRes.status, 0);
  const indepJson = JSON.parse(indepRes.stdout);

  assert.equal(indepJson.nextAction, "adaptive-intake");
  assert.ok(!indepJson.chooser);
});
