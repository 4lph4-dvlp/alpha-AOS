import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import {
  runBrownfieldLifecycle,
  setupBrownfieldFixture,
} from "./helpers/brownfield-fixture.js";
import { proveOperationPaths, requiredRolesForFileMutation } from "../src/core/path-boundary.js";
import {
  assertControllerRole,
  witnessWorkerDelegation,
  WorkerAuthorityError,
} from "../src/core/worker-authority.js";
import { acquireMutationSession, WriterConflictError } from "../src/core/writer-lock.js";

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

  assert.equal(report.headCommit, fixture.headCommit);
  assert.deepEqual(report.lifecycle, ["discuss", "plan", "execute", "verify", "ship"]);
  assert.equal(report.steps.length, 5);
  for (const step of report.steps) {
    assert.equal(step.status, "passed");
  }
  assert.ok(report.workerWitness !== undefined);
  assert.equal(report.workerWitness?.harnessId, "hermes");
  assert.equal(report.workerWitness?.role, "worker");
  assert.equal(report.workerWitness?.immutable, true);
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

test("Hermes cannot claim the brownfield GSD controller role", () => {
  assert.throws(
    () => assertControllerRole("hermes"),
    (error: unknown) => {
      assert.ok(error instanceof WorkerAuthorityError);
      assert.equal(error.code, "unauthorized-controller");
      assert.equal(error.harnessId, "hermes");
      return true;
    },
  );
});

test("a failing worker that tampers with planning state is rolled back and reported as a planning mutation", async (context) => {
  const root = await scratchRoot(context, "brownfield-worker-tamper");
  const fixture = await setupBrownfieldFixture(join(root, "repository"));
  const statePath = join(fixture.path, ".planning", "STATE.md");
  const roguePath = join(fixture.path, ".planning", "rogue.md");
  const originalState = await readFile(statePath);

  await assert.rejects(
    () =>
      witnessWorkerDelegation({
        projectRoot: fixture.path,
        harnessId: "hermes",
        role: "worker",
        action: async () => {
          await writeFile(statePath, "tampered: true\n", "utf8");
          await writeFile(roguePath, "rogue worker planning file\n", "utf8");
          throw new Error("worker failed after tampering");
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof WorkerAuthorityError);
      assert.equal(error.code, "planning-mutation-detected");
      assert.equal(error.harnessId, "hermes");
      assert.deepEqual(error.offendingPaths, ["STATE.md", "rogue.md"]);
      assert.match(error.message, /worker failed after tampering/u);
      return true;
    },
  );

  assert.deepEqual(await readFile(statePath), originalState);
  assert.equal(existsSync(roguePath), false);
});

test("a controller writer lock excludes a concurrent brownfield state writer", async (context) => {
  const root = await scratchRoot(context, "brownfield-writer-lock");
  const fixture = await setupBrownfieldFixture(join(root, "repository"));
  const planningRoot = join(fixture.path, ".planning");
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: join(planningRoot, "STATE.md") },
      { role: "state", path: fixture.stateRoot },
      { role: "journal", path: join(fixture.stateRoot, "journal") },
      { role: "snapshot", path: join(fixture.stateRoot, "snapshots") },
    ],
    allowedRoots: [planningRoot, fixture.stateRoot],
    requiredRoles: requiredRolesForFileMutation(),
  });
  const controller = await acquireMutationSession({
    stateRoot: fixture.stateRoot,
    proofs,
    planDigest: "brownfield-controller",
    operationId: "brownfield-controller",
  });

  try {
    await assert.rejects(
      () =>
        acquireMutationSession({
          stateRoot: fixture.stateRoot,
          proofs,
          planDigest: "competing-worker",
          operationId: "competing-worker",
        }),
      WriterConflictError,
    );
  } finally {
    await controller.close();
  }
});
