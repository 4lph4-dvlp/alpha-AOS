import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  buildGsdControllerPrompt,
  GSD_CONTROLLER_PROMPT_MAX_BYTES,
  GSD_TASK_WORKFLOW,
  probeGsdQuickReadiness,
  readGsdQuickOutline,
  resolveInstalledGsdTools,
  runGitRead,
  snapshotPlanningState,
  verifyGsdEvidence,
} from "../src/core/task-gsd.js";
import {
  createTaskFixture,
  inventorySummaryContract,
  simulateGsdQuick,
  writeInventorySummaryImplementation,
  type TaskFixture,
} from "./helpers/task-fixture.js";

const RUN_ID = "0000abcd-0123abcd";
const DIGEST = "c0ffee".repeat(10) + "abcd";
const DECISION_LOG = `.alpha-aos/task-runs/${RUN_ID}/decisions.jsonl`;
const QUICK_ID = "260930-abc";

async function scratchDirectory(context: TestContext): Promise<string> {
  const scratch = await mkdtemp(join(tmpdir(), "alpha-aos-task-gsd-"));
  context.after(async () => {
    await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return scratch;
}

/** A tiny gsd-tools stand-in written by the test itself. */
async function stubTools(scratch: string, name: string, body: string): Promise<string> {
  const path = join(scratch, `${name}.cjs`);
  await writeFile(path, `"use strict";\n${body}\n`, "utf8");
  return path;
}

async function promptFor(fixture: TaskFixture, overrides: Parameters<typeof inventorySummaryContract>[1] = {}): Promise<string> {
  return buildGsdControllerPrompt({
    contract: inventorySummaryContract(fixture.projectRoot, overrides),
    contractDigest: DIGEST,
    runId: RUN_ID,
    decisionLogPath: DECISION_LOG,
    outline: await readGsdQuickOutline(fixture.gsdConfigRoot),
  });
}

async function headOf(projectRoot: string): Promise<string> {
  return (await runGitRead(projectRoot, ["rev-parse", "--verify", "HEAD"])).trim();
}

async function implementedWithGsd(fixture: TaskFixture, options: { commit?: boolean } = {}): Promise<string> {
  const base = await headOf(fixture.projectRoot);
  await writeInventorySummaryImplementation(fixture.projectRoot, "correct");
  await simulateGsdQuick(fixture.projectRoot, {
    quickId: QUICK_ID,
    slug: "inventory-summary",
    description: "Add the inventory-summary CLI",
    ...options,
  });
  return base;
}

// ---------------------------------------------------------------------------
// Controller prompt
// ---------------------------------------------------------------------------

test("the controller prompt binds the run to installed GSD quick and the approved authority", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const outline = await readGsdQuickOutline(fixture.gsdConfigRoot);
  const prompt = await promptFor(fixture);

  assert.equal(GSD_TASK_WORKFLOW, "quick");
  for (const expected of [
    "$gsd-quick",
    RUN_ID,
    DIGEST,
    outline.sourceSha256,
    DECISION_LOG,
    "needs-authority",
    "project approve",
    "project sync",
    ...contract.allowedRoots,
    ...contract.allowedEffects,
  ]) {
    assert.ok(prompt.includes(expected), `the prompt names ${expected}`);
  }
  for (const criterion of contract.criterion) {
    assert.ok(prompt.includes(criterion.id), `the prompt names criterion ${criterion.id}`);
    assert.ok(prompt.includes(criterion.title), `the prompt names the title of ${criterion.id}`);
    assert.ok(prompt.includes(criterion.description), `the prompt describes ${criterion.id}`);
  }
  assert.equal(prompt, prompt.normalize("NFC"));
});

test("the controller prompt holds out every measured input and expected output", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const prompt = await promptFor(fixture);

  for (const criterion of contract.criterion) {
    if (criterion.measurement.kind === "cli-json") {
      assert.equal(prompt.includes(criterion.measurement.inputText), false, `${criterion.id} input is held out`);
      const expect = criterion.measurement.expect;
      for (const expected of [expect.stdoutJson, expect.stderrJson]) {
        if (expected === undefined) continue;
        assert.equal(prompt.includes(JSON.stringify(expected)), false, `${criterion.id} expected output is held out`);
      }
    }
  }
  assert.ok(Buffer.byteLength(prompt, "utf8") <= GSD_CONTROLLER_PROMPT_MAX_BYTES);
});

test("the controller prompt describes the dependency checkpoint only when dependency-change is approved", async (context) => {
  const fixture = await createTaskFixture(context);
  const without = await promptFor(fixture);
  assert.equal(without.includes("alpha-aos project plan . --json"), false);
  assert.match(without, /never modify a dependency manifest or lockfile/u);

  const withDependencies = await promptFor(fixture, { allowedEffects: ["workspace-write", "local-commit", "dependency-change"] });
  assert.ok(withDependencies.includes("alpha-aos project plan . --json"));
  assert.ok(withDependencies.includes("alpha-aos project status . --json"));
  assert.doesNotMatch(withDependencies, /never modify a dependency manifest or lockfile/u);
});

test("a controller prompt over the byte bound is refused rather than truncated", async (context) => {
  const fixture = await createTaskFixture(context);
  await assert.rejects(
    promptFor(fixture, { goal: "x".repeat(GSD_CONTROLLER_PROMPT_MAX_BYTES) }),
    /exceeds/u,
  );
});

test("the quick outline carries the installed workflow's sha256 and step names", async (context) => {
  const fixture = await createTaskFixture(context);
  const outline = await readGsdQuickOutline(fixture.gsdConfigRoot);
  const bytes = await readFile(join(fixture.gsdConfigRoot, "gsd-core", "workflows", "quick.md"));
  assert.equal(outline.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(outline.stepNames, ["step-1", "step-2"]);
});

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

test("a gsd-tools reporting a roadmap and a planning directory is ready", async (context) => {
  const scratch = await scratchDirectory(context);
  const tools = await stubTools(
    scratch,
    "ready",
    'process.stdout.write(JSON.stringify({ quick_id: "260930-abc", roadmap_exists: true, planning_exists: true }) + "\\n");',
  );
  const readiness = await probeGsdQuickReadiness({ projectRoot: scratch, gsdToolsPath: tools });
  assert.equal(readiness.ready, true, readiness.reason);
  assert.equal(readiness.gsdToolsPath, tools);
});

test("a gsd-tools reporting no roadmap is not ready and names ROADMAP.md", async (context) => {
  const scratch = await scratchDirectory(context);
  const tools = await stubTools(
    scratch,
    "no-roadmap",
    'process.stdout.write(JSON.stringify({ roadmap_exists: false, planning_exists: true }) + "\\n");',
  );
  const readiness = await probeGsdQuickReadiness({ projectRoot: scratch, gsdToolsPath: tools });
  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /ROADMAP\.md/u);
});

test("a gsd-tools answering with @file: is followed to that file", async (context) => {
  const scratch = await scratchDirectory(context);
  const tools = await stubTools(
    scratch,
    "at-file",
    [
      'const { writeFileSync } = require("node:fs");',
      'const { join } = require("node:path");',
      'const target = join(__dirname, "init-quick.json");',
      'writeFileSync(target, JSON.stringify({ roadmap_exists: true, planning_exists: true }));',
      'process.stdout.write("@file:" + target + "\\n");',
    ].join("\n"),
  );
  const readiness = await probeGsdQuickReadiness({ projectRoot: scratch, gsdToolsPath: tools });
  assert.equal(readiness.ready, true, readiness.reason);
});

test("a gsd-tools that exits 1 is not ready and names the exit code", async (context) => {
  const scratch = await scratchDirectory(context);
  const tools = await stubTools(scratch, "exit-one", 'process.stderr.write("boom\\n");\nprocess.exit(1);');
  const readiness = await probeGsdQuickReadiness({ projectRoot: scratch, gsdToolsPath: tools });
  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /exit code 1/u);
});

test("no installed gsd-tools is not ready", async (context) => {
  const scratch = await scratchDirectory(context);
  assert.equal(resolveInstalledGsdTools(join(scratch, "no-such-codex")), null);
  const readiness = await probeGsdQuickReadiness({ projectRoot: scratch, gsdToolsPath: null });
  assert.equal(readiness.ready, false);
  assert.match(readiness.reason, /not installed/u);
});

test("the host's installed gsd-tools reports the seeded fixture ready and writes nothing", async (context) => {
  const gsdToolsPath = resolveInstalledGsdTools();
  if (gsdToolsPath === null) {
    context.skip("GSD Core is not installed for Codex on this host (no gsd-core/bin/gsd-tools.cjs under the Codex config root)");
    return;
  }
  const fixture = await createTaskFixture(context);
  const before = await snapshotPlanningState(fixture.projectRoot);
  const readiness = await probeGsdQuickReadiness({ projectRoot: fixture.projectRoot, gsdToolsPath });
  assert.equal(readiness.ready, true, readiness.reason);
  assert.deepEqual(await snapshotPlanningState(fixture.projectRoot), before);
  assert.equal(await runGitRead(fixture.projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
});

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

test("GSD quick's own artifacts after the base commit are verified evidence", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = await implementedWithGsd(fixture);
  const evidence = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: QUICK_ID });
  assert.equal(evidence.status, "verified", evidence.missing.join("; "));
  assert.equal(evidence.quickId, QUICK_ID);
  assert.equal(evidence.planPath, `.planning/quick/${QUICK_ID}-inventory-summary/${QUICK_ID}-PLAN.md`);
  assert.equal(evidence.summaryPath, `.planning/quick/${QUICK_ID}-inventory-summary/${QUICK_ID}-SUMMARY.md`);
  assert.equal(evidence.stateRow, true);
  assert.equal(evidence.commits.length, 1);
  assert.match(evidence.commits[0]?.subject ?? "", new RegExp(`^docs\\(quick-${QUICK_ID}\\)`, "u"));
  assert.match(evidence.commits[0]?.sha ?? "", /^[0-9a-f]{40}$/u);
  assert.deepEqual(evidence.missing, []);
});

test("a deleted quick SUMMARY is missing evidence", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = await implementedWithGsd(fixture);
  await rm(join(fixture.projectRoot, ".planning", "quick", `${QUICK_ID}-inventory-summary`, `${QUICK_ID}-SUMMARY.md`));
  const evidence = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: QUICK_ID });
  assert.equal(evidence.status, "missing");
  assert.equal(evidence.summaryPath, null);
  assert.ok(evidence.missing.some((item) => item.includes(`${QUICK_ID}-SUMMARY.md`)), evidence.missing.join("; "));
});

test("a STATE.md without the quick row is missing evidence", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = await implementedWithGsd(fixture);
  const statePath = join(fixture.projectRoot, ".planning", "STATE.md");
  const kept = (await readFile(statePath, "utf8")).split("\n").filter((line) => !line.startsWith(`| ${QUICK_ID} |`));
  await writeFile(statePath, kept.join("\n"), "utf8");
  const evidence = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: QUICK_ID });
  assert.equal(evidence.status, "missing");
  assert.equal(evidence.stateRow, false);
  assert.ok(evidence.missing.some((item) => item.includes("STATE.md")), evidence.missing.join("; "));
});

test("quick artifacts without the docs commit are missing evidence", async (context) => {
  const fixture = await createTaskFixture(context);
  const base = await implementedWithGsd(fixture, { commit: false });
  const evidence = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: QUICK_ID });
  assert.equal(evidence.status, "missing");
  assert.deepEqual(evidence.commits, []);
  assert.ok(evidence.missing.some((item) => item.includes(`docs(quick-${QUICK_ID})`)), evidence.missing.join("; "));
});

test("a quick directory already present at the base commit is not counted as new", async (context) => {
  const fixture = await createTaskFixture(context);
  await simulateGsdQuick(fixture.projectRoot, { quickId: "260929-old", slug: "earlier", description: "An earlier quick task" });
  const base = await headOf(fixture.projectRoot);

  const stale = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: "260929-old" });
  assert.equal(stale.status, "missing");
  assert.equal(stale.quickId, null);
  assert.ok(stale.missing.some((item) => item.includes("new .planning/quick")), stale.missing.join("; "));

  await simulateGsdQuick(fixture.projectRoot, { quickId: QUICK_ID, slug: "inventory-summary", description: "Add the CLI" });
  const fresh = await verifyGsdEvidence({ projectRoot: fixture.projectRoot, baseCommit: base, claimQuickId: null });
  assert.equal(fresh.status, "verified", fresh.missing.join("; "));
  assert.equal(fresh.quickId, QUICK_ID);
});

test("the planning snapshot is stable and changes when a .planning file changes", async (context) => {
  const fixture = await createTaskFixture(context);
  const first = await snapshotPlanningState(fixture.projectRoot);
  const second = await snapshotPlanningState(fixture.projectRoot);
  assert.deepEqual(first, second);
  assert.deepEqual(first.map(([path]) => path), [...first.map(([path]) => path)].sort());
  assert.ok(first.some(([path]) => path === ".planning/STATE.md"));
  await mkdir(join(fixture.projectRoot, ".planning", "notes"), { recursive: true });
  await writeFile(join(fixture.projectRoot, ".planning", "STATE.md"), "# State\n\nchanged\n", "utf8");
  assert.notDeepEqual(await snapshotPlanningState(fixture.projectRoot), first);
});

test("runGitRead refuses every git subcommand that could write", async (context) => {
  const fixture = await createTaskFixture(context);
  for (const args of [["commit", "-m", "x"], ["add", "--all"], ["push"], ["-c", "core.editor=x", "status"], []]) {
    await assert.rejects(runGitRead(fixture.projectRoot, args), /refused/u, `git ${args.join(" ")} is refused`);
  }
  assert.match(await headOf(fixture.projectRoot), /^[0-9a-f]{40}$/u);
});
