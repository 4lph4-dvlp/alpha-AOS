import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { probeHarnessAuthority } from "../src/adapters/harnesses.js";
import {
  assertControllerRole,
  resolveHarnessRole,
  restorePlanningTreeSnapshot,
  sanitizeWorkerLaunchSpec,
  snapshotPlanningTree,
  witnessWorkerDelegation,
  WorkerAuthorityError,
} from "../src/core/worker-authority.js";

async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return root;
}

test("Role resolution assigns controller to initiator and worker to external harnesses (GATE-05, D-10)", () => {
  // Same harness is controller
  assert.equal(resolveHarnessRole("codex", "codex"), "controller");
  assert.equal(resolveHarnessRole("antigravity", "antigravity"), "controller");

  // Delegated harnesses are workers
  assert.equal(resolveHarnessRole("codex", "pi"), "worker");
  assert.equal(resolveHarnessRole("antigravity", "hermes"), "worker");

  // Hermes is always worker regardless of initiator
  assert.equal(resolveHarnessRole("hermes", "hermes"), "worker");
});

test("assertControllerRole strictly prohibits Hermes from being a GSD state controller (GATE-05, D-10)", () => {
  assert.throws(
    () => assertControllerRole("hermes"),
    (err: unknown) => {
      assert.ok(err instanceof WorkerAuthorityError);
      assert.equal(err.code, "unauthorized-controller");
      assert.equal(err.harnessId, "hermes");
      assert.match(err.message, /Hermes is structurally prohibited/);
      return true;
    }
  );

  // Other harnesses pass
  assert.doesNotThrow(() => assertControllerRole("codex"));
  assert.doesNotThrow(() => assertControllerRole("antigravity"));
  assert.doesNotThrow(() => assertControllerRole("pi"));
});

test("sanitizeWorkerLaunchSpec strips controller instructions and injects worker role and notice (D-11)", () => {
  const controllerSpec = {
    instructions: [
      "Follow GSD execute-phase workflow",
      "Read CONVENTIONS.md",
      "Update .planning/STATE.md after tasks",
      "Write SUMMARY.md",
    ],
    env: { CODEX_HOME: "/home/user/.codex" },
    prompt: "Execute task 1 of wave 2",
  };

  // Controller role receives unmodified copy
  const sanitizedController = sanitizeWorkerLaunchSpec(controllerSpec, "controller");
  assert.deepEqual(sanitizedController.instructions, controllerSpec.instructions);
  assert.equal(sanitizedController.env.ALPHA_AOS_GSD_ROLE, undefined);

  // Worker role has controller guides stripped
  const sanitizedWorker = sanitizeWorkerLaunchSpec(controllerSpec, "worker");
  assert.deepEqual(sanitizedWorker.instructions, ["Read CONVENTIONS.md"]);
  assert.equal(sanitizedWorker.env.ALPHA_AOS_GSD_ROLE, "worker");
  assert.match(sanitizedWorker.prompt ?? "", /You are operating in WORKER role/);
  assert.match(sanitizedWorker.prompt ?? "", /MUST NOT modify any files in the \.planning\/ directory/);
});

test("witnessWorkerDelegation passes cleanly when worker modifies only workspace files outside .planning (D-11)", async (context) => {
  const projectRoot = await scratchRoot(context, "witness-pass");
  const planningDir = join(projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, "STATE.md"), "gsd_state_version: 1.0\n", "utf8");
  await writeFile(join(planningDir, "ROADMAP.md"), "# Roadmap\n", "utf8");

  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src", "index.ts"), "console.log('hello');\n", "utf8");

  const { result, witness } = await witnessWorkerDelegation({
    projectRoot,
    harnessId: "hermes",
    role: "worker",
    action: async () => {
      // Worker edits application code outside .planning/
      await writeFile(join(projectRoot, "src", "index.ts"), "console.log('updated by worker');\n", "utf8");
      return "task completed";
    },
  });

  assert.equal(result, "task completed");
  assert.equal(witness.immutable, true);
  assert.equal(witness.harnessId, "hermes");
  assert.equal(witness.role, "worker");
  assert.deepEqual(witness.modifiedPaths, []);

  // Application code update is preserved
  const updatedCode = await readFile(join(projectRoot, "src", "index.ts"), "utf8");
  assert.match(updatedCode, /updated by worker/);
});

test("witnessWorkerDelegation halts and rolls back unauthorized .planning/ modifications (GATE-05, D-11)", async (context) => {
  const projectRoot = await scratchRoot(context, "witness-rollback");
  const planningDir = join(projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, "STATE.md"), "original state\n", "utf8");
  await writeFile(join(planningDir, "ROADMAP.md"), "original roadmap\n", "utf8");

  await assert.rejects(
    async () => {
      await witnessWorkerDelegation({
        projectRoot,
        harnessId: "hermes",
        role: "worker",
        action: async () => {
          // Worker attempts unauthorized state write and rogue plan creation
          await writeFile(join(planningDir, "STATE.md"), "rogue worker state modification\n", "utf8");
          await writeFile(join(planningDir, "ROGUE.md"), "unauthorized plan\n", "utf8");
          return "rogue finished";
        },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof WorkerAuthorityError);
      assert.equal(err.code, "planning-mutation-detected");
      assert.equal(err.harnessId, "hermes");
      assert.ok(err.offendingPaths?.includes("STATE.md"));
      assert.ok(err.offendingPaths?.includes("ROGUE.md"));
      return true;
    }
  );

  // Verify byte-for-byte rollback
  const stateContent = await readFile(join(planningDir, "STATE.md"), "utf8");
  assert.equal(stateContent, "original state\n");

  // Verify rogue file was removed
  await assert.rejects(async () => readFile(join(planningDir, "ROGUE.md"), "utf8"), { code: "ENOENT" });
});

test("witnessWorkerDelegation rolls back .planning/ mutations even if worker action throws an error", async (context) => {
  const projectRoot = await scratchRoot(context, "witness-error-rollback");
  const planningDir = join(projectRoot, ".planning");
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, "STATE.md"), "untainted state\n", "utf8");

  await assert.rejects(
    async () => {
      await witnessWorkerDelegation({
        projectRoot,
        harnessId: "pi",
        role: "worker",
        action: async () => {
          await writeFile(join(planningDir, "STATE.md"), "corrupted before crash\n", "utf8");
          throw new Error("Worker subprocess crashed unexpectedly");
        },
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Worker subprocess crashed unexpectedly/);
      return true;
    }
  );

  // Verify rollback restored untainted state
  const stateContent = await readFile(join(planningDir, "STATE.md"), "utf8");
  assert.equal(stateContent, "untainted state\n");
});

test("probeHarnessAuthority confirms Hermes is worker-only while other harnesses permit controller role", () => {
  const hermesAuth = probeHarnessAuthority("hermes");
  assert.equal(hermesAuth.id, "hermes");
  assert.equal(hermesAuth.defaultRole, "worker");
  assert.equal(hermesAuth.isStateWriterAllowed, false);
  assert.match(hermesAuth.notes[0] ?? "", /worker-only/);

  const codexAuth = probeHarnessAuthority("codex");
  assert.equal(codexAuth.id, "codex");
  assert.equal(codexAuth.defaultRole, "controller");
  assert.equal(codexAuth.isStateWriterAllowed, true);

  const agyAuth = probeHarnessAuthority("antigravity");
  assert.equal(agyAuth.defaultRole, "controller");
  assert.equal(agyAuth.isStateWriterAllowed, true);
});
