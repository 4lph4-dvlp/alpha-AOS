import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  resolveTaskExecutionRoute,
  TASK_EXECUTION_STYLES,
} from "../src/core/task-style.js";
import { inspectTaskIntake } from "../src/core/task-intake.js";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("resolveTaskExecutionRoute: pure resolution of the six canonical styles", () => {
  // 1. conversational-quick
  const cq = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick" });
  assert.ok(cq);
  assert.equal(cq.style, "conversational-quick");
  assert.equal(cq.label, "대화형-quick");
  assert.equal(cq.surface, "conversation");
  assert.equal(cq.workflow, "quick");
  assert.equal(cq.command, "gsd-quick");
  assert.deepEqual(cq.arguments, []);
  assert.equal(cq.quickQuality, "standard");
  assert.equal(cq.authorityRequirements.executionAuthorized, false);
  assert.equal(cq.authorityRequirements.requiresExactApproval, false);
  assert.equal(cq.authorityRequirements.requiresSeparateStart, false);
  assert.equal(cq.authorityRequirements.requiresEvidenceValidation, false);
  assert.equal(cq.authorityRequirements.surface, "conversation");

  // 2. conversational-quick-full
  const cqf = resolveTaskExecutionRoute({ selectedStyle: "conversational-quick-full" });
  assert.ok(cqf);
  assert.equal(cqf.style, "conversational-quick-full");
  assert.equal(cqf.label, "대화형-quick-full");
  assert.equal(cqf.surface, "conversation");
  assert.equal(cqf.workflow, "quick");
  assert.equal(cqf.command, "gsd-quick");
  assert.deepEqual(cqf.arguments, ["--full"]);
  assert.equal(cqf.quickQuality, "full");
  assert.equal(cqf.authorityRequirements.executionAuthorized, false);
  assert.equal(cqf.authorityRequirements.requiresExactApproval, false);
  assert.equal(cqf.authorityRequirements.requiresSeparateStart, false);
  assert.equal(cqf.authorityRequirements.requiresEvidenceValidation, true);

  // 3. conversational-phase
  const cp = resolveTaskExecutionRoute({ selectedStyle: "conversational-phase" });
  assert.ok(cp);
  assert.equal(cp.style, "conversational-phase");
  assert.equal(cp.label, "대화형-phase");
  assert.equal(cp.surface, "conversation");
  assert.equal(cp.workflow, "phase");
  assert.equal(cp.command, "gsd-next");
  assert.deepEqual(cp.arguments, []);
  assert.equal(cp.authorityRequirements.executionAuthorized, false);
  assert.equal(cp.authorityRequirements.requiresExactApproval, false);
  assert.equal(cp.authorityRequirements.requiresSeparateStart, false);

  // 4. autopilot-quick
  const aq = resolveTaskExecutionRoute({ selectedStyle: "autopilot-quick" });
  assert.ok(aq);
  assert.equal(aq.style, "autopilot-quick");
  assert.equal(aq.label, "오토파일럿-quick");
  assert.equal(aq.surface, "isolated-runner");
  assert.equal(aq.workflow, "quick");
  assert.equal(aq.command, "gsd-quick");
  assert.deepEqual(aq.arguments, []);
  assert.equal(aq.quickQuality, "standard");
  assert.equal(aq.authorityRequirements.executionAuthorized, false);
  assert.equal(aq.authorityRequirements.requiresExactApproval, true);
  assert.equal(aq.authorityRequirements.requiresSeparateStart, true);
  assert.equal(aq.authorityRequirements.requiresEvidenceValidation, true);

  // 5. autopilot-quick-full
  const aqf = resolveTaskExecutionRoute({ selectedStyle: "autopilot-quick-full" });
  assert.ok(aqf);
  assert.equal(aqf.style, "autopilot-quick-full");
  assert.equal(aqf.label, "오토파일럿-quick-full");
  assert.equal(aqf.surface, "isolated-runner");
  assert.equal(aqf.workflow, "quick");
  assert.equal(aqf.command, "gsd-quick");
  assert.deepEqual(aqf.arguments, ["--full"]);
  assert.equal(aqf.quickQuality, "full");
  assert.equal(aqf.authorityRequirements.executionAuthorized, false);
  assert.equal(aqf.authorityRequirements.requiresExactApproval, true);
  assert.equal(aqf.authorityRequirements.requiresSeparateStart, true);
  assert.equal(aqf.authorityRequirements.requiresEvidenceValidation, true);

  // 6. autopilot-phase
  const ap = resolveTaskExecutionRoute({ selectedStyle: "autopilot-phase" });
  assert.ok(ap);
  assert.equal(ap.style, "autopilot-phase");
  assert.equal(ap.label, "오토파일럿-phase");
  assert.equal(ap.surface, "isolated-runner");
  assert.equal(ap.workflow, "phase");
  assert.equal(ap.command, "gsd-phase");
  assert.deepEqual(ap.arguments, []);
  assert.equal(ap.authorityRequirements.executionAuthorized, false);
  assert.equal(ap.authorityRequirements.requiresExactApproval, true);
  assert.equal(aq.authorityRequirements.requiresSeparateStart, true);
});

test("resolveTaskExecutionRoute: explicit command routes override style defaults", () => {
  // discuss-phase with --auto and phase 30
  const discussRoute = resolveTaskExecutionRoute({
    commandRoute: {
      command: "gsd-discuss-phase",
      workflow: "discuss-phase",
      phase: "30",
      arguments: ["30", "--auto"],
      stoppingPoint: "discuss:post",
    },
  });
  assert.ok(discussRoute);
  assert.equal(discussRoute.style, "conversational-phase");
  assert.equal(discussRoute.surface, "conversation");
  assert.equal(discussRoute.command, "gsd-discuss-phase");
  assert.equal(discussRoute.workflow, "discuss-phase");
  assert.equal(discussRoute.phase, "30");
  assert.deepEqual(discussRoute.arguments, ["30", "--auto"]);
  assert.equal(discussRoute.stoppingPoint, "discuss:post");
  assert.equal(discussRoute.authorityRequirements.executionAuthorized, false);

  // direct quick command with arbitrary quoted args
  const quickRoute = resolveTaskExecutionRoute({
    commandRoute: {
      command: "gsd-quick",
      workflow: "quick",
      arguments: ["--text", "quoted requirement text", "target-component"],
    },
  });
  assert.ok(quickRoute);
  assert.equal(quickRoute.style, "conversational-quick");
  assert.equal(quickRoute.surface, "conversation");
  assert.equal(quickRoute.command, "gsd-quick");
  assert.deepEqual(quickRoute.arguments, [
    "--text",
    "quoted requirement text",
    "target-component",
  ]);
  assert.equal(quickRoute.quickQuality, "standard");

  // direct quick with --full
  const quickFullRoute = resolveTaskExecutionRoute({
    commandRoute: {
      command: "gsd-quick",
      workflow: "quick",
      arguments: ["--full", "auth-task"],
    },
  });
  assert.ok(quickFullRoute);
  assert.equal(quickFullRoute.style, "conversational-quick-full");
  assert.equal(quickFullRoute.quickQuality, "full");
  assert.ok(quickFullRoute.arguments.includes("--full"));

  // absent style and absent commandRoute returns undefined
  assert.equal(resolveTaskExecutionRoute({}), undefined);
});

test("inspectTaskIntake returns executionRoute for conversational routes and explicit commands with zero writes", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "intake-route-project");
  await mkdir(projectDir, { recursive: true });

  const homeBefore = await fingerprintManifest(sandbox.home);
  const projectBefore = await fingerprintManifest(projectDir);

  // 1. Explicit style conversational-quick
  const decisionCq = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      request: { text: "Add simple logger function" },
      explicit: { style: "conversational-quick" },
    },
    invocationPath: projectDir,
  });
  assert.equal(decisionCq.kind, "explicit-style");
  assert.ok(decisionCq.executionRoute);
  assert.equal(decisionCq.executionRoute.style, "conversational-quick");
  assert.equal(decisionCq.executionRoute.surface, "conversation");
  assert.equal(decisionCq.executionRoute.workflow, "quick");
  assert.deepEqual(decisionCq.executionRoute.arguments, []);
  assert.equal(decisionCq.executionRoute.quickQuality, "standard");
  assert.ok(decisionCq.handoff?.executionRoute);
  assert.equal(decisionCq.handoff.executionRoute.style, "conversational-quick");

  // 2. Explicit style conversational-quick-full
  const decisionCqf = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      request: { text: "Add comprehensive auth module" },
      explicit: { style: "conversational-quick-full" },
    },
    invocationPath: projectDir,
  });
  assert.equal(decisionCqf.kind, "explicit-style");
  assert.ok(decisionCqf.executionRoute);
  assert.equal(decisionCqf.executionRoute.style, "conversational-quick-full");
  assert.equal(decisionCqf.executionRoute.surface, "conversation");
  assert.equal(decisionCqf.executionRoute.quickQuality, "full");
  assert.deepEqual(decisionCqf.executionRoute.arguments, ["--full"]);

  // 3. Explicit command gsd-discuss-phase 30 --auto
  const decisionDiscuss = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      request: { text: "Discuss phase 30" },
      explicit: { command: "discuss-phase", phase: "30", arguments: ["30", "--auto"] },
    },
    invocationPath: projectDir,
  });
  assert.equal(decisionDiscuss.kind, "explicit-command");
  assert.ok(decisionDiscuss.executionRoute);
  assert.equal(decisionDiscuss.executionRoute.command, "gsd-discuss-phase");
  assert.equal(decisionDiscuss.executionRoute.workflow, "discuss-phase");
  assert.equal(decisionDiscuss.executionRoute.phase, "30");
  assert.deepEqual(decisionDiscuss.executionRoute.arguments, ["30", "--auto"]);
  assert.equal(decisionDiscuss.executionRoute.stoppingPoint, "discuss:post");

  // 4. Conflicting intent returns clarification-needed with NO executionRoute
  const decisionConflict = await inspectTaskIntake({
    input: {
      schemaVersion: 1,
      request: { text: "Run quick phase" },
      explicit: { command: "quick", style: "conversational-phase" },
    },
    invocationPath: projectDir,
  });
  assert.equal(decisionConflict.kind, "clarification-needed");
  assert.equal(decisionConflict.executionRoute, undefined);
  assert.equal(decisionConflict.handoff?.executionRoute, undefined);

  // 5. Zero project writes verified
  const homeAfter = await fingerprintManifest(sandbox.home);
  const projectAfter = await fingerprintManifest(projectDir);
  assert.deepEqual(homeBefore, homeAfter);
  assert.deepEqual(projectBefore, projectAfter);
});

test("CLI JSON task intake returns executionRoute and round-trips arguments", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "cli-route-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    request: {
      text: "Discuss phase 30 with auto flag",
    },
    explicit: {
      command: "discuss-phase",
      phase: "30",
      arguments: ["30", "--auto"],
    },
  };
  const inputPath = join(projectDir, "task-request.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  const projectBefore = await fingerprintManifest(projectDir);

  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(jsonQuery.status, 0, `CLI intake failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, "explicit-command");
  assert.equal(parsed.executionAuthorized, false);
  assert.ok(parsed.executionRoute);
  assert.equal(parsed.executionRoute.command, "gsd-discuss-phase");
  assert.equal(parsed.executionRoute.workflow, "discuss-phase");
  assert.equal(parsed.executionRoute.phase, "30");
  assert.deepEqual(parsed.executionRoute.arguments, ["30", "--auto"]);
  assert.equal(parsed.executionRoute.stoppingPoint, "discuss:post");
  assert.equal(parsed.executionRoute.authorityRequirements.executionAuthorized, false);

  // Zero project writes (except the input file created before baseline)
  const projectAfter = await fingerprintManifest(projectDir);
  assert.deepEqual(projectBefore, projectAfter);
});
