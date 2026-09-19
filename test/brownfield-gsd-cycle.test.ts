import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  runBrownfieldLifecycle,
  setupBrownfieldFixture,
} from "./helpers/brownfield-fixture.js";

async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return root;
}

test("brownfield fixture has deterministic Git history, application code, dependencies, and planning state", async (context) => {
  const root = await scratchRoot(context, "brownfield-fixture");
  const first = await setupBrownfieldFixture(join(root, "first"));
  const second = await setupBrownfieldFixture(join(root, "second"));

  assert.equal(first.headCommit, second.headCommit, "identical fixture bytes must produce one deterministic commit");
  assert.equal(first.baselinePlanningDigest, second.baselinePlanningDigest);
  assert.match(first.headCommit, /^[0-9a-f]{40}$/u);
  assert.match(first.baselinePlanningDigest, /^[0-9a-f]{64}$/u);

  const packageDocument = JSON.parse(await readFile(join(first.path, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.equal(packageDocument.dependencies?.express, "^4.21.0");
  assert.equal(packageDocument.dependencies?.react, "^19.0.0");
  for (const relative of [
    "tsconfig.json",
    "src/index.ts",
    "src/auth/jwt.ts",
    ".planning/PROJECT.md",
    ".planning/STATE.md",
    ".planning/ROADMAP.md",
    ".planning/phases/01-auth/01-CONTEXT.md",
  ]) {
    assert.equal(existsSync(join(first.path, ...relative.split("/"))), true, `${relative} is missing`);
  }
});

test("brownfield discuss-plan-execute-verify-ship cycle proves all five benchmark elements offline", async (context) => {
  const root = await scratchRoot(context, "brownfield-cycle");
  const fixture = await setupBrownfieldFixture(join(root, "repository"));
  const packageBefore = await readFile(join(fixture.path, "package.json"));
  const tsconfigBefore = await readFile(join(fixture.path, "tsconfig.json"));
  const indexBefore = await readFile(join(fixture.path, "src", "index.ts"));

  const report = await runBrownfieldLifecycle(fixture);

  assert.deepEqual(report.lifecycle, ["discuss", "plan", "execute", "verify", "ship"]);
  assert.deepEqual(report.context7.tools, ["resolve-library-id", "query-docs"]);
  assert.equal(report.context7.libraryId, "/expressjs/express/v4.21.0");
  assert.equal(report.context7.mode, "offline-fixture");

  assert.ok(report.projectPack.selected.includes("API"));
  assert.ok(report.projectPack.selected.includes("WEB_REACT"));
  assert.ok(report.projectPack.projections.length > 0, "the selected project pack produced no projection");
  assert.ok(report.projectPack.projections.every((path) => !existsSync(join(fixture.path, ...path.split("/")))));

  assert.equal(report.securityGate.initialStatus, "blocked");
  assert.equal(report.securityGate.finalStatus, "passed");
  assert.equal(report.securityGate.obligation, "security-review");

  assert.equal(report.handoff.source, "codex");
  assert.equal(report.handoff.target, "antigravity");
  assert.equal(report.handoff.memoryCount, 1);
  assert.equal(report.handoff.beforePlanningDigest, report.handoff.afterPlanningDigest);

  assert.equal(report.cleanup.planningDigest, fixture.baselinePlanningDigest);
  assert.deepEqual(await readFile(join(fixture.path, "package.json")), packageBefore);
  assert.deepEqual(await readFile(join(fixture.path, "tsconfig.json")), tsconfigBefore);
  assert.deepEqual(await readFile(join(fixture.path, "src", "index.ts")), indexBefore);
  assert.equal(existsSync(join(fixture.path, ".alpha-aos")), false);
});
