import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { planProjectCapabilities } from "../src/core/project-plan.js";
import { approveTaskContract, previewTaskContract, type TaskContract } from "../src/core/task-contract.js";
import {
  auditTaskEffects,
  DEPENDENCY_FIELDS,
  DEPENDENCY_LOCKFILES,
  readTaskBaseline,
  readTaskChanges,
} from "../src/core/task-effects.js";
import { snapshotPlanningState } from "../src/core/task-gsd.js";
import {
  listTaskRuns,
  TaskRunError,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type ControllerPort,
  type ExecutorClaim,
  type ReviewerPort,
  type TaskRunRecord,
} from "../src/core/task-run.js";
import { gitCommand } from "./helpers/git-fixture.js";
import {
  createTaskFixture,
  fixturePorts,
  fixtureQuickId,
  inventorySummaryContract,
  passingReview,
  simulateGsdQuick,
  startFixtureTask,
  staticReviewerPort,
  writeInventorySummaryImplementation,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const DEPENDENCY_EFFECTS: TaskContract["allowedEffects"] = ["workspace-write", "local-commit", "dependency-change"];

function git(cwd: string, args: readonly string[]): string {
  const result = gitCommand(cwd, args);
  if (!result.ok) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

async function approvedFixture(fixture: TaskFixture, overrides: Partial<TaskContract> = {}): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot, overrides));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  return preview.digest;
}

interface CountedController extends ControllerPort {
  calls: number;
}

interface CountedReviewer extends ReviewerPort {
  calls: number;
}

/** A controller double that runs `act`, optionally leaves GSD quick evidence, and returns `claim`. */
function controllerDouble(
  act: (request: ControllerDispatchRequest) => Promise<void>,
  options: { gsd?: boolean; claim?: (request: ControllerDispatchRequest, quickId: string | null) => ExecutorClaim } = {},
): CountedController {
  const port: CountedController = {
    calls: 0,
    async dispatch(request: ControllerDispatchRequest): Promise<ControllerDispatchResult> {
      port.calls += 1;
      await act(request);
      let quickId: string | null = null;
      if (options.gsd !== false) {
        quickId = fixtureQuickId(request.runId);
        await simulateGsdQuick(request.projectRoot, { quickId, slug: "inventory-summary", description: "Add the inventory-summary CLI" });
      }
      return {
        harness: "codex",
        version: "fixture",
        executable: null,
        sessionId: `fixture-controller-${request.runId}`,
        exitCode: 0,
        processCode: "ok",
        terminal: "completed",
        claim: options.claim?.(request, quickId) ?? {
          status: "completed",
          summary: "Done.",
          authorityRequest: null,
          gsdQuickId: quickId,
        },
        detail: null,
      };
    },
  };
  return port;
}

function countedReviewer(): CountedReviewer {
  const inner = staticReviewerPort(passingReview);
  const port: CountedReviewer = {
    calls: 0,
    async review(request) {
      port.calls += 1;
      return inner.review(request);
    },
  };
  return port;
}

async function run(
  fixture: TaskFixture,
  digest: string,
  controller: ControllerPort,
  reviewer: ReviewerPort = countedReviewer(),
  now?: () => Date,
): Promise<TaskRunRecord> {
  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({ controller, reviewer }),
    expectedDigest: digest,
    ...(now === undefined ? {} : { now }),
  });
  return record;
}

async function writePackageJson(projectRoot: string, extra: Record<string, unknown>): Promise<void> {
  const path = join(projectRoot, "package.json");
  const current = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  await writeFile(path, `${JSON.stringify({ ...current, ...extra }, null, 2)}\n`, "utf8");
}

function commitAll(projectRoot: string, message: string): void {
  git(projectRoot, ["add", "--all"]);
  git(projectRoot, ["commit", "-m", message]);
}

function precondition(record: TaskRunRecord, id: string) {
  return record.verdict?.preconditions.find((entry) => entry.id === id);
}

// ---------------------------------------------------------------------------
// Baseline and changes
// ---------------------------------------------------------------------------

test("the seeded fixture is a clean baseline at its HEAD commit", async (context) => {
  const fixture = await createTaskFixture(context);
  const baseline = await readTaskBaseline({ projectRoot: fixture.projectRoot });
  assert.deepEqual(baseline, { status: "clean", baseCommit: git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim() });
});

test("an untracked or modified file makes the baseline dirty and lists the paths", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeFile(join(fixture.projectRoot, "README.md"), "# changed\n", "utf8");
  await mkdir(join(fixture.projectRoot, "notes"), { recursive: true });
  await writeFile(join(fixture.projectRoot, "notes", "scratch.txt"), "x\n", "utf8");
  const baseline = await readTaskBaseline({ projectRoot: fixture.projectRoot });
  assert.equal(baseline.status, "dirty");
  assert.ok(baseline.status === "dirty");
  assert.deepEqual(baseline.paths, ["README.md", "notes/scratch.txt"]);
});

test("changes after the base commit include committed and uncommitted paths and the commits", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim();
  await writeInventorySummaryImplementation(fixture.projectRoot, "correct");
  await writeFile(join(fixture.projectRoot, "README.md"), "# changed\n", "utf8");
  const changes = await readTaskChanges({ projectRoot: fixture.projectRoot, baseCommit: base });
  assert.deepEqual(changes.paths, ["README.md", "bin/inventory-summary.mjs"]);
  assert.equal(changes.commits.length, 1);
  assert.match(changes.commits[0]?.subject ?? "", /^feat: inventory-summary CLI/u);
});

test("a dirty project is refused before the approval is consumed, and the same approval starts once it is committed", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  await writeFile(join(fixture.projectRoot, "README.md"), "# uncommitted edit\n", "utf8");

  await assert.rejects(
    run(fixture, digest, controllerDouble((request) => writeInventorySummaryImplementation(request.projectRoot, "correct"))),
    (error: unknown) => error instanceof TaskRunError && error.code === "dirty-baseline" && error.message.includes("README.md"),
  );
  assert.deepEqual(await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" }), []);

  commitAll(fixture.projectRoot, "docs: readme");
  const record = await run(fixture, digest, controllerDouble((request) => writeInventorySummaryImplementation(request.projectRoot, "correct")));
  assert.equal(record.status, "accepted");
});

test("a project GSD reports without a roadmap is refused as gsd-not-ready and writes no run record", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  await rm(join(fixture.projectRoot, ".planning", "ROADMAP.md"));
  commitAll(fixture.projectRoot, "chore: drop roadmap");

  const controller = controllerDouble((request) => writeInventorySummaryImplementation(request.projectRoot, "correct"));
  await assert.rejects(
    run(fixture, digest, controller),
    (error: unknown) => error instanceof TaskRunError && error.code === "gsd-not-ready" && error.message.includes("ROADMAP.md"),
  );
  assert.equal(controller.calls, 0);
  assert.deepEqual(await listTaskRuns({ stateRoot: fixture.stateRoot, contractId: "inventory-summary" }), []);
});

// ---------------------------------------------------------------------------
// GSD evidence
// ---------------------------------------------------------------------------

test("the reference run is accepted with verified GSD evidence and every changed path recorded", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const before = await snapshotPlanningState(fixture.projectRoot);
  let afterController: Awaited<ReturnType<typeof snapshotPlanningState>> = [];
  const controller = controllerDouble(
    async (request) => writeInventorySummaryImplementation(request.projectRoot, "correct"),
  );
  const observed: ControllerPort = {
    async dispatch(request) {
      const result = await controller.dispatch(request);
      afterController = await snapshotPlanningState(request.projectRoot);
      return result;
    },
  };
  const record = await run(fixture, digest, observed);

  assert.equal(record.status, "accepted");
  assert.match(record.baseCommit ?? "", /^[0-9a-f]{40}$/u);
  assert.equal(record.gsd?.status, "verified");
  const quickId = record.executor?.claim?.gsdQuickId;
  assert.ok(typeof quickId === "string");
  assert.equal(record.gsd?.quickId, quickId);
  assert.match(record.gsd?.workflowSha256 ?? "", /^[0-9a-f]{64}$/u);
  assert.ok(record.effects?.implementationPaths.includes("bin/inventory-summary.mjs"));
  const quickDirectory = `.planning/quick/${quickId}-inventory-summary`;
  for (const path of [`${quickDirectory}/${quickId}-PLAN.md`, `${quickDirectory}/${quickId}-SUMMARY.md`, ".planning/STATE.md"]) {
    assert.ok(record.effects?.planningPaths.includes(path), `planningPaths records ${path}`);
  }
  assert.deepEqual(record.effects?.violations, []);
  assert.deepEqual(
    record.verdict?.preconditions.map((entry) => [entry.id, entry.satisfied]),
    [["gsd-evidence", true], ["effect-audit", true]],
  );
  // `.planning/` changed, and only through the controller double.
  assert.notDeepEqual(afterController, before);
  assert.deepEqual(await snapshotPlanningState(fixture.projectRoot), afterController);
});

test("a correct implementation without GSD quick evidence is not accepted and .planning stays byte-identical", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const snapshotBefore = await snapshotPlanningState(fixture.projectRoot);
  const controller = controllerDouble((request) => writeInventorySummaryImplementation(request.projectRoot, "correct"), { gsd: false });
  const record = await run(fixture, digest, controller);
  const snapshotAfter = await snapshotPlanningState(fixture.projectRoot);

  assert.deepEqual(snapshotBefore, snapshotAfter);
  assert.equal(record.gsd?.status, "missing");
  const gsdEvidence = precondition(record, "gsd-evidence");
  assert.equal(gsdEvidence?.satisfied, false);
  assert.match(gsdEvidence?.nextAction ?? "", /re-run the task through GSD/u);
  assert.ok(record.verdict?.overall !== "accepted");
  assert.equal(record.verdict?.overall, "unknown");
  assert.equal(record.status, "unknown");
  assert.deepEqual(record.verdict?.rows.map((row) => row.verdict), ["pass", "pass"]);
});

// ---------------------------------------------------------------------------
// New authority blocks the run
// ---------------------------------------------------------------------------

test("a needs-authority claim ends the run blocked without a review", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const reviewer = countedReviewer();
  const controller = controllerDouble(async () => undefined, {
    gsd: false,
    claim: () => ({
      status: "needs-authority",
      summary: "The CSV parser needs a dependency.",
      authorityRequest: { effect: "dependency-change", reason: "add a CSV parsing library" },
      gsdQuickId: null,
    }),
  });
  const record = await run(fixture, digest, controller, reviewer);

  assert.equal(record.status, "blocked");
  assert.equal(record.stopReason, "new-authority-required: dependency-change");
  assert.match(record.nextAction ?? "", /revision 2/u);
  assert.equal(record.verdict, null);
  assert.equal(record.executor?.claim?.status, "needs-authority");
  assert.equal(reviewer.calls, 0);
});

test("a write outside the approved roots ends the run blocked naming the path", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const reviewer = countedReviewer();
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "correct");
    await mkdir(join(request.projectRoot, "docs"), { recursive: true });
    await writeFile(join(request.projectRoot, "docs", "notes.md"), "# notes\n", "utf8");
  });
  const record = await run(fixture, digest, controller, reviewer);

  assert.equal(record.status, "blocked");
  assert.equal(record.stopReason, "new-authority-required: workspace-write");
  assert.deepEqual(record.effects?.violations, [
    { effect: "workspace-write", path: "docs/notes.md", detail: "outside the approved roots" },
  ]);
  assert.equal(record.gsd?.status, "not-run");
  assert.equal(reviewer.calls, 0);
});

test("a dependency change without dependency-change ends the run blocked", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const reviewer = countedReviewer();
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "correct");
    await writePackageJson(request.projectRoot, { dependencies: { "left-pad": "1.3.0" } });
    commitAll(request.projectRoot, "feat: add a dependency");
  });
  const record = await run(fixture, digest, controller, reviewer);

  assert.equal(record.status, "blocked");
  assert.equal(record.stopReason, "new-authority-required: dependency-change");
  assert.equal(record.effects?.dependencyChanged, true);
  assert.deepEqual(record.effects?.dependencyPaths, ["package.json"]);
  assert.ok(record.effects?.violations.some((entry) => entry.effect === "dependency-change" && entry.path === "package.json"));
  assert.equal(reviewer.calls, 0);
});

test("a package.json change to bin only is not a dependency change", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "correct");
    await writePackageJson(request.projectRoot, { bin: { "inventory-summary": "bin/inventory-summary.mjs" } });
    commitAll(request.projectRoot, "feat: expose the bin");
  });
  const record = await run(fixture, digest, controller);

  assert.equal(record.effects?.dependencyChanged, false);
  assert.deepEqual(record.effects?.violations, []);
  assert.ok(record.effects?.implementationPaths.includes("package.json"));
  assert.equal(record.status, "accepted");
});

test("an approved dependency change runs the read-only pack checkpoint and never approves a pack", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture, { allowedEffects: DEPENDENCY_EFFECTS });
  const controller = controllerDouble(async (request) => {
    await writeInventorySummaryImplementation(request.projectRoot, "correct");
    await writePackageJson(request.projectRoot, { dependencies: { "left-pad": "1.3.0" } });
    commitAll(request.projectRoot, "feat: add a dependency");
  });
  const record = await run(fixture, digest, controller);

  assert.notEqual(record.status, "blocked");
  assert.equal(record.effects?.dependencyChanged, true);
  const checkpoint = record.effects?.packCheckpoint;
  assert.ok(checkpoint !== null && checkpoint !== undefined);
  assert.match(checkpoint.planDigest, /^[0-9a-f]{64}$/u);
  const direct = await planProjectCapabilities({ path: fixture.projectRoot, packageRoot: packageRoot() });
  assert.equal(checkpoint.planDigest, direct.planDigest);
  assert.deepEqual(checkpoint.selected, direct.selected);
  assert.deepEqual(checkpoint.applicable, direct.applicable);
  assert.match(checkpoint.approveCommand, /^alpha-aos project approve /u);
  assert.ok(checkpoint.approveCommand.includes(`--plan-digest ${checkpoint.planDigest}`));
  assert.equal(existsSync(join(fixture.projectRoot, ".alpha-aos", "plan.json")), false);
});

// ---------------------------------------------------------------------------
// Wall time
// ---------------------------------------------------------------------------

test("a run whose approved wall time elapses before review is stopped without a review", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture, { resourcePolicy: { maxWallTimeMinutes: 1 } });
  const reviewer = countedReviewer();
  const start = Date.parse("2026-09-30T00:00:00.000Z");
  let calls = 0;
  const clock = () => new Date(start + (calls++ === 0 ? 0 : 120_000));
  const controller = controllerDouble((request) => writeInventorySummaryImplementation(request.projectRoot, "correct"));
  const record = await run(fixture, digest, controller, reviewer, clock);

  assert.equal(record.status, "stopped");
  assert.equal(record.stopReason, "wall-time-limit");
  assert.equal(record.deadlineAt, "2026-09-30T00:01:00.000Z");
  assert.match(record.nextAction ?? "", /1 minutes/u);
  assert.equal(reviewer.calls, 0);
});

// ---------------------------------------------------------------------------
// The audit itself
// ---------------------------------------------------------------------------

// Observed on the first live tracer run (munx7h9w-b9ec114f): installed GSD
// quick's `query dispatch-isolation` unconditionally records its decision in
// `<project>/.gsd/dispatch-isolation-sentinel.json`. That file is GSD quick's
// own run state, like `.planning/`; any other `.gsd/` path still fails closed.
test("GSD quick's dispatch-isolation sentinel is GSD state, and any other .gsd path is a violation", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim();
  const contract = inventorySummaryContract(fixture.projectRoot);
  const audit = await auditTaskEffects({
    contract,
    runId: "0000abcd-0123abcd",
    projectRoot: fixture.projectRoot,
    baseCommit: base,
    changes: {
      paths: [".gsd/dispatch-isolation-sentinel.json", ".gsd/other-state.json", ".planning/STATE.md", "bin/inventory-summary.mjs"],
      commits: [],
    },
  });
  assert.deepEqual(audit.planningPaths, [".gsd/dispatch-isolation-sentinel.json", ".planning/STATE.md"]);
  assert.deepEqual(audit.implementationPaths, ["bin/inventory-summary.mjs"]);
  assert.deepEqual(
    audit.violations.map((entry) => [entry.effect, entry.path]),
    [["workspace-write", ".gsd/other-state.json"]],
  );
});

test("the audit allows only this run's decision log, flags commits without local-commit and any lockfile", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = git(fixture.projectRoot, ["rev-parse", "HEAD"]).trim();
  const contract = inventorySummaryContract(fixture.projectRoot, { allowedEffects: ["workspace-write"] });
  const runId = "0000abcd-0123abcd";
  await writeFile(join(fixture.projectRoot, "package-lock.json"), "{}\n", "utf8");
  const audit = await auditTaskEffects({
    contract,
    runId,
    projectRoot: fixture.projectRoot,
    baseCommit: base,
    changes: {
      paths: [
        `.alpha-aos/task-runs/${runId}/decisions.jsonl`,
        ".alpha-aos/task-runs/0000abcd-99999999/decisions.jsonl",
        ".planning/STATE.md",
        "bin/inventory-summary.mjs",
        "package-lock.json",
      ],
      commits: [{ sha: "a".repeat(40), subject: "feat: something" }],
    },
  });
  assert.deepEqual(audit.implementationPaths, ["bin/inventory-summary.mjs"]);
  assert.deepEqual(audit.planningPaths, [".planning/STATE.md"]);
  assert.equal(audit.dependencyChanged, true);
  assert.deepEqual(audit.dependencyPaths, ["package-lock.json"]);
  assert.deepEqual(
    audit.violations.map((entry) => [entry.effect, entry.path]),
    [
      ["workspace-write", ".alpha-aos/task-runs/0000abcd-99999999/decisions.jsonl"],
      ["workspace-write", "package-lock.json"],
      ["local-commit", ""],
      ["dependency-change", "package-lock.json"],
    ],
  );
  assert.ok(DEPENDENCY_LOCKFILES.includes("package-lock.json"));
  assert.ok(DEPENDENCY_FIELDS.includes("devDependencies"));
});
