import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import type * as Lifecycle from "../../src/core/task-gsd-lifecycle.js";
import { createTaskFixture, inventorySummaryContract } from "../helpers/task-fixture.js";
import { gitCommand } from "../helpers/git-fixture.js";

const subject: typeof Lifecycle = await import(process.env.GSD_PROHIB_SUBJECT
  ? pathToFileURL(resolve(process.env.GSD_PROHIB_SUBJECT)).href
  : "../../src/core/task-gsd-lifecycle.js");

async function phaseFixture(context: TestContext) {
  const fixture = await createTaskFixture(context);
  const roadmap = "# Roadmap\n\n- [ ] **Phase 01: First**\n- [ ] **Phase 02: Second**\n";
  await writeFile(join(fixture.projectRoot, ".planning", "ROADMAP.md"), roadmap);
  for (const id of ["01", "02", "03"]) {
    const dir = join(fixture.projectRoot, ".planning", "phases", `${id}-phase`);
    await mkdir(dir, { recursive: true });
    // Start at planning so the predecessor fails at an observed real command.
    await writeFile(join(dir, `${id}-CONTEXT.md`), "# Context\n");
  }
  const staged = gitCommand(fixture.projectRoot, ["add", ".planning"]);
  assert.equal(staged.ok, true, staged.stderr);
  const committed = gitCommand(fixture.projectRoot, ["commit", "-m", "fixture: approved phase baseline"]);
  assert.equal(committed.ok, true, committed.stderr);
  const head = gitCommand(fixture.projectRoot, ["rev-parse", "HEAD"]);
  assert.equal(head.ok, true, head.stderr);
  const dispatchLog = join(fixture.scratch, "dispatches.jsonl");
  await writeFile(dispatchLog, "");
  const runner = join(fixture.scratch, "blocked-runner.cjs");
  await writeFile(runner, [
    "const fs = require('node:fs');",
    `fs.appendFileSync(${JSON.stringify(dispatchLog)}, JSON.stringify({ step: process.argv[2], phase: process.argv[3] }) + '\\n');`,
    "process.exit(1);",
  ].join("\n"));
  const contract = inventorySummaryContract(fixture.projectRoot);
  contract.scope = { ...contract.scope, workflow: "gsd-multi-phase", phaseSelection: {
    phaseIds: ["01", "02"], roadmapSha256: createHash("sha256").update(roadmap).digest("hex"),
  } };
  const commandMap = Object.fromEntries((["discuss", "plan", "execute", "verify"] as const)
    .map((step) => [step, { executable: process.execPath, args: [runner, step] }]));
  return { ...fixture, contract, baseCommit: head.stdout.trim(), commandMap, dispatchLog };
}

test("T30-PHASE unapproved phase request stops before any command dispatch", async (context) => {
  const fixture = await phaseFixture(context);
  const result = await subject.orchestrateMultiPhaseProgression({ ...fixture, phases: ["03"], timeoutMs: 5_000 });
  assert.equal(result.finalStatus, "failed");
  assert.match(result.stopReason ?? "", /not in the approved phase selection/u);
  assert.deepEqual(result.completedPhases, []);
  assert.equal(await readFile(fixture.dispatchLog, "utf8"), "", "unapproved phases must never dispatch");
});

test("T30-PHASE blocked predecessor prevents every successor dispatch", async (context) => {
  const fixture = await phaseFixture(context);
  const result = await subject.orchestrateMultiPhaseProgression({ ...fixture, timeoutMs: 5_000 });
  const dispatches = (await readFile(fixture.dispatchLog, "utf8")).trim().split("\n")
    .filter(Boolean).map((line) => JSON.parse(line) as { step: string; phase: string });
  assert.ok(dispatches.some((entry) => entry.phase === "01" && entry.step === "plan"),
    "approved predecessor must actually reach its failing plan command");
  assert.equal(dispatches.filter((entry) => entry.phase !== "01").length, 0,
    "no successor may dispatch after the blocked predecessor");
  assert.equal(result.finalStatus, "failed");
  assert.match(result.stopReason ?? "", /Phase 01 stopped at step plan/u);
  assert.deepEqual(result.completedPhases, []);
});
