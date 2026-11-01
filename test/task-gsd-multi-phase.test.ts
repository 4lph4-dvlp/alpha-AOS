import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  orchestrateMultiPhaseProgression,
  type GsdStepKind,
} from "../src/core/task-gsd-lifecycle.js";
import { discoverPhaseProgression } from "../src/core/task-gsd-discovery.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";
import { approveTaskContract, loadTaskContract, taskContractDigest, type TaskContract } from "../src/core/task-contract.js";
import type { FinalReviewPort } from "../src/core/task-final-review.js";
import { resumeTask } from "../src/core/task-supervisor.js";
import { readJournalEvents, writeCheckpoint } from "../src/core/task-journal.js";
import { packageRoot } from "../src/core/paths.js";
import type { TaskPorts } from "../src/core/task-run.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), `alpha-aos-gsd-multiphase-${name}-`)));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function createMockContract(projectRoot: string): TaskContract {
  return {
    schemaVersion: 1,
    id: "test-contract-multi",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Multi-phase autonomous progression",
    scope: {
      projectRoot,
      workflow: "gsd-multi-phase",
      summary: "Multi-phase test",
    },
    allowedRoots: ["preserved-wip.txt", "README.md", "package.json", "test.mjs"],
    allowedEffects: ["workspace-write", "local-commit"],
    criterion: [
      {
        id: "crit-1",
        title: "Test criterion",
        description: "Must pass tests",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "test.mjs",
          inputText: "",
          expect: { exitCode: 0, stdoutEmpty: true },
        },
      },
    ],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "codex",
      controllerModel: "gpt-6.1-sol", executorModel: "gpt-6.1-terra", reviewerModel: "gpt-6.1-sol",
      controllerEffort: "high", executorEffort: "high", reviewerEffort: "high",
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {
      maxCycles: 20,
    },
  } as TaskContract;
}

test("orchestrateMultiPhaseProgression advances across 2+ phases without manual commands (SC 1, D-09, D-12)", async (context) => {
  const parent = await scratch(context, "two-phases");
  const stateRoot = join(parent, "state");
  await mkdir(stateRoot, { recursive: true });
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;
  const receiptsRoot = join(stateRoot, "receipts");

  // 1. Set up GSD structure with 2 phases in ROADMAP.md
  const planningDir = join(projectRoot, ".planning");
  const phasesDir = join(planningDir, "phases");
  const phase1Dir = join(phasesDir, "01-core-architecture");
  const phase2Dir = join(phasesDir, "02-verification-engine");
  await mkdir(phase1Dir, { recursive: true });
  await mkdir(phase2Dir, { recursive: true });

  const initialRoadmap = [
    "# Roadmap: Multi-Phase Project",
    "",
    "## Phases",
    "",
    "- [ ] **Phase 01: Core Architecture**",
    "- [ ] **Phase 02: Verification Engine**",
    "",
  ].join("\n");
  await writeFile(join(planningDir, "ROADMAP.md"), initialRoadmap, "utf8");

  const initialState = [
    "# Current State",
    "",
    "current_phase: 01",
    "status: ready",
    "",
    "| Phase | Plan | Status |",
    "|---|---|---|",
    "",
  ].join("\n");
  await writeFile(join(planningDir, "STATE.md"), initialState, "utf8");

  await writeFile(join(planningDir, "config.json"), JSON.stringify({ workflow: { nyquist_validation: true } }));

  await writeFile(join(planningDir, "REQUIREMENTS.md"), "- **REQ-01**: Default requirement\n");

  await writeFile(join(projectRoot, "test.mjs"), "process.exit(0);\n");

  // Initial git commit
  gitCommand(projectRoot, ["add", "-A"]);
  const commitRes = gitCommand(projectRoot, ["commit", "-m", "chore: initialize planning state"]);
  assert.equal(commitRes.ok, true);
  const baseCommit = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();

  // Safe-resume fixture: partial production commit, incomplete summary and dirty WIP.
  await writeFile(join(phase1Dir, "01-CONTEXT.md"), "# Locked original decisions\n");
  await writeFile(join(phase1Dir, "01-01-PLAN.md"), "# Remaining execution slice\n");
  await writeFile(join(phase1Dir, "01-01-SUMMARY.md"), "---\nstatus: partial\n---\nIncomplete execution.\n");
  gitCommand(projectRoot, ["add", ".planning"]);
  assert.equal(gitCommand(projectRoot, ["commit", "-m", "feat(01-01): partial fixture work"]).ok, true);
  const wipPath = join(projectRoot, "preserved-wip.txt");
  await writeFile(wipPath, "USER_WIP_MUST_REMAIN_DIRTY\n");

  // 2. Create mock GSD runner script that simulates native GSD workflow executions
  const mockScriptPath = join(parent, "mock-gsd-tool.cjs");
  const scriptContent = `
    const fs = require('fs');
    const path = require('path');
    const { execFileSync } = require('child_process');

    const phaseArg = process.argv[2] || '01';
    const isPhase1 = phaseArg === '01' || phaseArg.includes('01');
    const phaseId = isPhase1 ? '01' : '02';
    const phaseDir = path.join(${JSON.stringify(projectRoot)}, '.planning', 'phases', isPhase1 ? '01-core-architecture' : '02-verification-engine');
    const statePath = path.join(${JSON.stringify(projectRoot)}, '.planning', 'STATE.md');

    // Determine current step based on artifacts in phaseDir
    const hasContext = fs.existsSync(path.join(phaseDir, phaseId + '-CONTEXT.md'));
    const hasPlan = fs.existsSync(path.join(phaseDir, phaseId + '-01-PLAN.md'));
    const summaryPath = path.join(phaseDir, phaseId + '-01-SUMMARY.md');
    const hasSummary = fs.existsSync(summaryPath) && !fs.readFileSync(summaryPath, 'utf8').includes('status: partial');
    const hasVerification = fs.existsSync(path.join(phaseDir, phaseId + '-VERIFICATION.md'));

    if (!hasContext) {
      // Step: discuss
      fs.writeFileSync(path.join(phaseDir, phaseId + '-CONTEXT.md'), '# Phase ' + phaseId + ' Context\\n');
    } else if (!hasPlan) {
      // Step: plan
      fs.writeFileSync(path.join(phaseDir, phaseId + '-01-PLAN.md'), '# Phase ' + phaseId + ' Plan\\n');
    } else if (!hasSummary) {
      // Step: execute
      fs.writeFileSync(path.join(phaseDir, phaseId + '-01-SUMMARY.md'), '# Phase ' + phaseId + ' Summary\\n');
      // Update STATE.md
      let state = fs.readFileSync(statePath, 'utf8');
      state += '| ' + phaseId + ' | ' + phaseId + '-01 | complete |\\n';
      state += '\\nPhase ' + phaseId + ': complete\\n';
      fs.writeFileSync(statePath, state, 'utf8');

      // Commit as docs(<phase>-01):
      execFileSync('git', ['add', phaseDir, statePath], { cwd: ${JSON.stringify(projectRoot)} });
      execFileSync('git', ['commit', '-m', 'docs(' + phaseId + '-01): complete plan summary'], { cwd: ${JSON.stringify(projectRoot)} });
    } else if (!hasVerification) {
      // Step: verify
      fs.writeFileSync(path.join(phaseDir, phaseId + '-VERIFICATION.md'), '---\\nstatus: passed\\n---\\n# Phase ' + phaseId + ' Verification\\n');
    }
    if (fs.existsSync(path.join(phaseDir, phaseId + '-VERIFICATION.md'))) {
      fs.writeFileSync(path.join(phaseDir, phaseId + '-VALIDATION.md'), '---\\nstatus: validated\\nnyquist_compliant: true\\nwave_0_complete: true\\n---\\nObserved fixture validation.\\n');
    }
    process.exit(0);
  `;
  await writeFile(mockScriptPath, scriptContent, "utf8");

  const commandMap: Partial<Record<GsdStepKind, { executable: string; args?: readonly string[] }>> = {
    discuss: { executable: process.execPath, args: [mockScriptPath] },
    plan: { executable: process.execPath, args: [mockScriptPath] },
    execute: { executable: process.execPath, args: [mockScriptPath] },
    verify: { executable: process.execPath, args: [mockScriptPath] },
  };

  const contract = createMockContract(projectRoot);

  let finalReviews = 0;
  const mockFinalReviewPort: FinalReviewPort = {
    evaluateMilestoneFinal: async (req) => {
      finalReviews++;
      const cDigest = taskContractDigest(req.contract);
      const items = req.requirements.length > 0
        ? req.requirements
        : [{ id: "REQ-01", description: "Default requirement" }];
      return {
        schemaVersion: 1,
        requestId: "req-final-01",
        contractId: req.contract.id,
        contractDigest: cDigest,
        targetRevisionSha: req.targetRevisionSha,
        artifactDigest: req.artifactDigest,
        sessionId: "sess-final-01",
        reviewerHarness: req.contract.agentPolicy.reviewer,
        reviewerVersion: "1.0.0",
        evaluatedAt: new Date().toISOString(),
        overallVerdict: "accepted",
        requirements: items.map((r) => ({
          requirementId: r.id,
          description: r.description,
          status: "verified" as const,
          implementationLocation: {
            path: "package.json",
            digest: "a".repeat(64),
          },
          checkReceiptRef: {
            receiptId: "chk-01",
            digest: "b".repeat(64),
            status: "pass" as const,
          },
          reviewEvidenceRef: {
            reportDigest: "c".repeat(64),
          },
        })),
        crossPhaseAssessment: {
          userFlow: { status: "pass" as const, summary: "Flows valid." },
          approvalBoundaries: { status: "pass" as const, summary: "Approvals respected." },
          gsdStateOwnership: { status: "pass" as const, summary: "GSD authority respected." },
          reviewerIndependence: { status: "pass" as const, summary: "Independent session." },
        },
        findings: [],
        summary: "Multi-phase final review passed.",
      };
    },
  };

  // Enter through the public approved resume boundary, not only the lifecycle helper.
  const contractPath = join(parent, "resume.contract.json");
  await writeFile(contractPath, JSON.stringify(contract));
  const loaded = await loadTaskContract(contractPath);
  await approveTaskContract({ contractPath, expectedDigest: loaded.digest, stateRoot });
  await writeCheckpoint(stateRoot, { schemaVersion: 1, contractDigest: loaded.digest, contractId: contract.id,
    revision: contract.revision, status: "stopped", attemptIndex: 0, lastSequence: 0,
    lastVerifiedHead: gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim(), baseCommit,
    usage: { cycles: 0, wallTimeMs: 0, tokens: null, costUsd: null }, stopReason: "fixture_interruption",
    updatedAt: new Date().toISOString() });
  const ports: TaskPorts = {
    controller: { dispatch: async () => { throw new Error("Quick controller must not run during multi-phase recovery"); } },
    reviewer: { review: async () => { throw new Error("Criterion-only review cannot replace the milestone final gate"); } },
    finalReview: mockFinalReviewPort,
    assess: async () => ({ supported: true,
      controller: { harness: "codex", version: "fixture", executable: process.execPath },
      reviewer: { harness: "codex", version: "fixture", executable: process.execPath }, missingProof: [] }),
  };
  const resumed = await resumeTask({ contractPath, expectedDigest: loaded.digest, stateRoot, packageRoot: packageRoot(), ports,
    gsd: { lifecycle: { commandMap, hookCommand: process.execPath, hookArgs: ["-e", "process.exit(0)"] } } });
  assert.equal(resumed.status, "accepted", JSON.stringify({ checkpoint: resumed.checkpoint,
    rejected: (await readJournalEvents(stateRoot, loaded.digest)).filter((entry) => entry.kind === "rejected").map((entry) => entry.payload).slice(-4) }));
  assert.equal(finalReviews, 1);

  // 3. Execute multi-phase progression orchestrator
  const result = await orchestrateMultiPhaseProgression({
    projectRoot,
    stateRoot,
    contract,
    baseCommit,
    receiptsRoot,
    commandMap,
    finalReviewPort: mockFinalReviewPort,
  });

  // Assertion 1: Both phases were completed hands-free without manual commands
  assert.equal(
    result.finalStatus,
    "completed",
    `Final review gate status: ${result.finalReviewGate?.status}, reason: ${result.finalReviewGate?.reason}`,
  );
  assert.deepEqual(result.completedPhases, ["01", "02"]);

  // Assertion 2: Phase 01 triple correlation verified complete
  const p1Proof = await discoverPhaseProgression({
    projectRoot,
    phaseId: "01",
    baseCommit,
  });
  assert.equal(p1Proof.isPhaseComplete, true);
  assert.equal(p1Proof.completedPlans.length, 1);

  // Assertion 3: Phase 02 triple correlation verified complete
  const p2Proof = await discoverPhaseProgression({
    projectRoot,
    phaseId: "02",
    baseCommit,
  });
  assert.equal(p2Proof.isPhaseComplete, true);
  assert.equal(p2Proof.completedPlans.length, 1);

  // Assertion 4: Verify no supervisor-owned shadow state was written to .planning/
  const planningEntries = await readdir(planningDir);
  assert.deepEqual(planningEntries.sort(), ["ROADMAP.md", "STATE.md", "REQUIREMENTS.md", "config.json", "phases"].sort());

  assert.equal(await readFile(wipPath, "utf8"), "USER_WIP_MUST_REMAIN_DIRTY\n");
  assert.match(gitCommand(projectRoot, ["status", "--porcelain"]).stdout, /preserved-wip.txt/);
  assert.equal(await readFile(join(phase1Dir, "01-CONTEXT.md"), "utf8"), "# Locked original decisions\n");
  assert.match(await readFile(join(phase1Dir, "01-VALIDATION.md"), "utf8"), /nyquist_compliant: true/);

  // Assertion 5: Re-running on already-completed repo finishes without re-executing
  const rerunResult = await orchestrateMultiPhaseProgression({
    projectRoot,
    stateRoot,
    contract,
    baseCommit,
    receiptsRoot,
    commandMap,
    finalReviewPort: mockFinalReviewPort,
  });
  assert.equal(rerunResult.finalStatus, "completed");
  assert.equal(finalReviews, 1, "The same final evidence must not launch another independent review");
  assert.deepEqual(rerunResult.completedPhases, ["01", "02"]);
});
