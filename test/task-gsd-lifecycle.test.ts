import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  executeGsdStep,
  runPhaseLifecycle,
  type GsdStepKind,
} from "../src/core/task-gsd-lifecycle.js";
import { readHookReceipt } from "../src/core/task-hook-receipt.js";
import type { TaskContract } from "../src/core/task-contract.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-lifecycle-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function createMockContract(projectRoot: string, overrides: Partial<TaskContract> = {}): TaskContract {
  return {
    schemaVersion: 1,
    id: "test-contract-1",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Implement lifecycle bridge",
    scope: {
      projectRoot,
      workflow: "gsd-quick",
      summary: "Lifecycle testing",
    },
    allowedRoots: [projectRoot],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        title: "Test criterion",
        description: "Must pass tests",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "node test.js",
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

test("executeGsdStep runs discuss, plan, execute with --auto and verify without --auto (D-04)", async (context) => {
  const projectRoot = await scratch(context, "step-auto-flags");
  const receiptsRoot = join(projectRoot, "receipts");
  const contract = createMockContract(projectRoot);
  const logFile = join(projectRoot, "step-log.jsonl");

  // Script that records process PID, argv, and generates expected artifacts
  const mockScriptPath = join(projectRoot, "mock-step.cjs");
  const scriptContent = `
    const fs = require('fs');
    const path = require('path');
    const stepArg = process.argv.find(a => a.startsWith('--step='));
    const step = stepArg ? stepArg.split('=')[1] : 'unknown';
    const cleanArgv = process.argv.slice(2).filter(a => !a.startsWith('--step='));
    const logEntry = {
      pid: process.pid,
      step: step,
      argv: cleanArgv,
    };
    fs.appendFileSync(${JSON.stringify(logFile)}, JSON.stringify(logEntry) + '\\n');

    // Create step artifact
    const phaseDir = path.join(${JSON.stringify(projectRoot)}, '.planning', 'phases', '17-gsd-lifecycle-bridge');
    fs.mkdirSync(phaseDir, { recursive: true });
    if (step === 'discuss') fs.writeFileSync(path.join(phaseDir, '17-CONTEXT.md'), '# Context');
    if (step === 'plan') fs.writeFileSync(path.join(phaseDir, '17-01-PLAN.md'), '# Plan');
    if (step === 'execute') fs.writeFileSync(path.join(phaseDir, '17-01-SUMMARY.md'), '# Summary');
    if (step === 'verify') fs.writeFileSync(path.join(phaseDir, '17-VERIFICATION.md'), '# Verification');
  `;
  await writeFile(mockScriptPath, scriptContent, "utf8");

  const commandMap: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> = {
    discuss: { executable: process.execPath, args: [mockScriptPath, "17-gsd-lifecycle-bridge", "--auto", "--step=discuss"] },
    plan: { executable: process.execPath, args: [mockScriptPath, "17-gsd-lifecycle-bridge", "--auto", "--step=plan"] },
    execute: { executable: process.execPath, args: [mockScriptPath, "17-gsd-lifecycle-bridge", "--auto", "--step=execute"] },
    verify: { executable: process.execPath, args: [mockScriptPath, "17-gsd-lifecycle-bridge", "--step=verify"] },
  };

  const steps: GsdStepKind[] = ["discuss", "plan", "execute", "verify"];
  const expectedNextSteps: string[] = ["plan", "execute", "verify", "complete"];
  const pids: number[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const res = await executeGsdStep({
      projectRoot,
      phaseId: "17-gsd-lifecycle-bridge",
      step,
      contract,
      targetRevisionSha: "a".repeat(40),
      workingTreeDigest: "b".repeat(64),
      receiptsRoot,
      commandMap,
    });

    assert.equal(res.exitCode, 0);
    assert.equal(res.nextStep, expectedNextSteps[i]);
    assert.equal(res.artifactsProduced.length, 1);
    assert.equal(res.receipts.length, 2); // pre and post hooks
  }

  // Inspect the logged invocations
  const loggedLines = (await readFile(logFile, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(loggedLines.length, 4);

  // Verify --auto was injected in discuss, plan, and execute
  assert.deepEqual(loggedLines[0].argv, ["17-gsd-lifecycle-bridge", "--auto"]);
  assert.deepEqual(loggedLines[1].argv, ["17-gsd-lifecycle-bridge", "--auto"]);
  assert.deepEqual(loggedLines[2].argv, ["17-gsd-lifecycle-bridge", "--auto"]);
  // Verify verify step does NOT have --auto
  assert.deepEqual(loggedLines[3].argv, ["17-gsd-lifecycle-bridge"]);

  // Verify distinct child process PIDs (independent processes)
  const distinctPids = new Set(loggedLines.map((l: { pid: number }) => l.pid));
  assert.equal(distinctPids.size, 4);

  // Verify hooks were recorded
  const discussPreReceipt = await readHookReceipt({
    phaseId: "17-gsd-lifecycle-bridge",
    hookPoint: "discuss:pre",
    receiptsRoot,
  });
  assert.ok(discussPreReceipt);
  assert.equal(discussPreReceipt.status, "passed");

  const verifyPostReceipt = await readHookReceipt({
    phaseId: "17-gsd-lifecycle-bridge",
    hookPoint: "verify:post",
    receiptsRoot,
  });
  assert.ok(verifyPostReceipt);
  assert.equal(verifyPostReceipt.status, "passed");
});

test("runPhaseLifecycle executes full 4-step sequence and halts on failure (D-04, D-13)", async (context) => {
  const projectRoot = await scratch(context, "lifecycle-fail-halt");
  const receiptsRoot = join(projectRoot, "receipts");
  const contract = createMockContract(projectRoot);

  // Script that fails on 'execute' step
  const mockScriptPath = join(projectRoot, "mock-step-fail.cjs");
  const scriptContent = `
    const step = process.argv[2];
    if (step === 'execute') {
      process.exit(1);
    }
    process.exit(0);
  `;
  await writeFile(mockScriptPath, scriptContent, "utf8");

  const commandMap: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> = {
    discuss: { executable: process.execPath, args: [mockScriptPath, "discuss"] },
    plan: { executable: process.execPath, args: [mockScriptPath, "plan"] },
    execute: { executable: process.execPath, args: [mockScriptPath, "execute"] },
    verify: { executable: process.execPath, args: [mockScriptPath, "verify"] },
  };

  const outcome = await runPhaseLifecycle({
    projectRoot,
    phaseId: "17-gsd-lifecycle-bridge",
    contract,
    targetRevisionSha: "a".repeat(40),
    workingTreeDigest: "b".repeat(64),
    receiptsRoot,
    commandMap,
  });

  assert.equal(outcome.success, false);
  assert.equal(outcome.finalStep, "execute");
  // Pre-hooks and post-hooks up to execute:pre ran
  assert.ok(outcome.receipts.length >= 4);
});

test("executeGsdStep pauses with needs-input when child output contains unauthorized prompt (D-02)", async (context) => {
  const projectRoot = await scratch(context, "prompt-needs-input");
  const receiptsRoot = join(projectRoot, "receipts");
  // Contract does not allow dependency changes
  const contract = createMockContract(projectRoot, { allowedEffects: ["workspace-write"] });

  const mockScriptPath = join(projectRoot, "mock-prompt.cjs");
  const scriptContent = `
    console.log("Question: Do you want to install package axios via npm install axios?");
    console.log("Default: npm install axios");
    process.exit(0);
  `;
  await writeFile(mockScriptPath, scriptContent, "utf8");

  const commandMap: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> = {
    discuss: { executable: process.execPath, args: [mockScriptPath] },
  };

  const res = await executeGsdStep({
    projectRoot,
    phaseId: "17-gsd-lifecycle-bridge",
    step: "discuss",
    contract,
    targetRevisionSha: "a".repeat(40),
    workingTreeDigest: "b".repeat(64),
    receiptsRoot,
    commandMap,
  });

  assert.equal(res.nextStep, "needs-input");
});
