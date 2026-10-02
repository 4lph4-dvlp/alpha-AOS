import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  discoverPhaseProgression,
  readImmutablePlanDecisions,
  selectNextPendingPlan,
  verifyPlanTripleCorrelation,
} from "../src/core/task-gsd-discovery.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-gsd-discovery-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("verifyPlanTripleCorrelation returns completed: true when Summary, State row, and Git commit exist (D-10, SC 4)", async (context) => {
  const parent = await scratch(context, "triple-pass");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  // 1. Leg 1: SUMMARY.md
  await writeFile(join(phaseDir, "17-01-SUMMARY.md"), "# Summary 17-01\n", "utf8");

  // 2. Leg 2: STATE.md with completed row
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n\n| Phase | Plan | Status |\n| 17 | 17-01 | complete |\n",
    "utf8",
  );

  // 3. Leg 3: Git commit with docs(17-01):
  gitCommand(projectRoot, ["add", "-A"]);
  const commitRes = gitCommand(projectRoot, ["commit", "-m", "docs(17-01): complete test summary"]);
  assert.equal(commitRes.ok, true);

  const proof = await verifyPlanTripleCorrelation({
    projectRoot,
    phaseId: "17",
    planId: "01",
  });

  assert.equal(proof.completed, true);
  assert.equal(proof.hasSummary, true);
  assert.equal(proof.hasStateRow, true);
  assert.equal(proof.hasGitCommit, true);
  assert.ok(proof.commitSha);
  assert.ok(proof.summaryPath?.endsWith("17-01-SUMMARY.md"));
});

test("verifyPlanTripleCorrelation returns completed: false when SUMMARY.md is missing (FIX-02, SC 4)", async (context) => {
  const parent = await scratch(context, "missing-summary");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  // STATE.md has row
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n\n| 17 | 17-02 | complete |\n",
    "utf8",
  );

  // Commit exists
  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-02): premature commit without summary"]);

  const proof = await verifyPlanTripleCorrelation({
    projectRoot,
    phaseId: "17",
    planId: "02",
  });

  assert.equal(proof.completed, false);
  assert.equal(proof.hasSummary, false);
  assert.equal(proof.hasStateRow, true);
  assert.equal(proof.hasGitCommit, true);
});

test("verifyPlanTripleCorrelation returns completed: false when STATE.md row is absent", async (context) => {
  const parent = await scratch(context, "missing-state-row");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  await writeFile(join(phaseDir, "17-03-SUMMARY.md"), "# Summary\n", "utf8");
  await writeFile(join(projectRoot, ".planning", "STATE.md"), "# State\nNo rows\n", "utf8");

  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-03): summary commit"]);

  const proof = await verifyPlanTripleCorrelation({
    projectRoot,
    phaseId: "17",
    planId: "03",
  });

  assert.equal(proof.completed, false);
  assert.equal(proof.hasSummary, true);
  assert.equal(proof.hasStateRow, false);
  assert.equal(proof.hasGitCommit, true);
});

test("verifyPlanTripleCorrelation returns completed: false when Git commit is missing", async (context) => {
  const parent = await scratch(context, "missing-commit");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  await writeFile(join(phaseDir, "17-04-SUMMARY.md"), "# Summary\n", "utf8");
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\n| 17 | 17-04 | complete |\n",
    "utf8",
  );

  // We do not make a commit matching docs(17-04):

  const proof = await verifyPlanTripleCorrelation({
    projectRoot,
    phaseId: "17",
    planId: "04",
  });

  assert.equal(proof.completed, false);
  assert.equal(proof.hasSummary, true);
  assert.equal(proof.hasStateRow, true);
  assert.equal(proof.hasGitCommit, false);
});

test("discoverPhaseProgression and selectNextPendingPlan skips completed plans on resume (FIX-03, D-10, SC 4)", async (context) => {
  const parent = await scratch(context, "progression-resume");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  // Plan 01 declared and completed
  await writeFile(join(phaseDir, "17-01-PLAN.md"), "# Plan 01\n", "utf8");
  await writeFile(join(phaseDir, "17-01-SUMMARY.md"), "# Summary 01\n", "utf8");

  // Plan 02 declared but pending
  await writeFile(join(phaseDir, "17-02-PLAN.md"), "# Plan 02\n", "utf8");

  // STATE.md shows 17-01 completed
  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\nPhase: 17 (GSD Lifecycle Bridge) — EXECUTING\n| 17 | 17-01 | complete |\n",
    "utf8",
  );

  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-01): complete plan 01"]);

  const progression = await discoverPhaseProgression({
    projectRoot,
    phaseId: "17",
  });

  assert.equal(progression.completedPlans.length, 1);
  assert.equal(progression.completedPlans[0]?.planId, "01");
  assert.deepEqual(progression.pendingPlans, ["02"]);
  assert.equal(progression.isPhaseComplete, false);

  // Resume selection: selects "02" directly, skipping "01" without re-execution (D-10, SC 4)
  const nextPlan = selectNextPendingPlan(progression);
  assert.equal(nextPlan, "02");
});

test("discoverPhaseProgression returns isPhaseComplete: true and next plan null when all plans complete", async (context) => {
  const parent = await scratch(context, "all-complete");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  await writeFile(join(phaseDir, "17-01-PLAN.md"), "# Plan 01\n", "utf8");
  await writeFile(join(phaseDir, "17-01-SUMMARY.md"), "# Summary 01\n", "utf8");

  await writeFile(
    join(projectRoot, ".planning", "STATE.md"),
    "# State\nPhase: 17 (GSD Lifecycle Bridge) — COMPLETE\n| 17 | 17-01 | complete |\n",
    "utf8",
  );

  gitCommand(projectRoot, ["add", "-A"]);
  gitCommand(projectRoot, ["commit", "-m", "docs(17-01): complete plan 01"]);

  const progression = await discoverPhaseProgression({
    projectRoot,
    phaseId: "17",
  });

  assert.equal(progression.isPhaseComplete, true);
  assert.equal(progression.pendingPlans.length, 0);
  assert.equal(selectNextPendingPlan(progression), null);
});

test("readImmutablePlanDecisions locks existing CONTEXT and PLAN decisions (D-11, SC 4)", async (context) => {
  const parent = await scratch(context, "immutable-decisions");
  const repoRes = await createOrdinaryRepository(parent, "repo");
  assert.equal(repoRes.ok, true);
  if (!repoRes.ok) return;
  const projectRoot = repoRes.fixture.path;

  const phaseDir = join(projectRoot, ".planning", "phases", "17-gsd-lifecycle-bridge");
  await mkdir(phaseDir, { recursive: true });

  const contextContent = `# Phase 17 Context

<decisions>
- **D-01:** Automatic default answering policy.
- **D-02:** Strict safety pause on boundary expansion.
</decisions>
`;
  await writeFile(join(phaseDir, "17-CONTEXT.md"), contextContent, "utf8");

  const planContent = `# Plan 17-01

<must_haves>
truths:
  - "Mandatory GSD lifecycle hooks are executed."
prohibitions:
  - "Do not accept process exit code 0 without receipt."
</must_haves>
`;
  await writeFile(join(phaseDir, "17-01-PLAN.md"), planContent, "utf8");

  const result = await readImmutablePlanDecisions({
    projectRoot,
    phaseId: "17",
    planId: "01",
  });

  assert.equal(result.contextLocked, true);
  assert.equal(result.planLocked, true);
  assert.ok(result.lockedDecisions.some((d) => d.includes("D-01")));
  assert.ok(result.lockedDecisions.some((d) => d.includes("D-02")));
  assert.ok(result.lockedDecisions.some((d) => d.includes("Mandatory GSD lifecycle hooks")));
});
