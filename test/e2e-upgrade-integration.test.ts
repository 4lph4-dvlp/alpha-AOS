import assert from "node:assert/strict";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { applyLocalReleasePlan, createLocalReleasePlan } from "../src/core/update.js";
import { resolveAcceptedToolRecord } from "../src/core/tool-bindings.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import { resumeReleaseOperation } from "../src/core/release-recovery.js";
import { planReleaseLifecycleOperation, appendReleaseLifecycleEvent } from "../src/core/release-lifecycle-store.js";

async function createTempFixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-e2e-upgrade-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  await mkdir(stateRoot, { recursive: true });
  await mkdir(home, { recursive: true });
  return { root, stateRoot, home, packageRoot: packageRoot() };
}

test("E2E Integration Flow 1: applyLocalReleasePlan with postcheckObservations advances tool acceptance in SSOT", async (context) => {
  const fixture = await createTempFixture(context);
  const repoRoot = fixture.packageRoot;

  const preview = await createLocalReleasePlan({
    mode: "install",
    tools: ["gsd"],
    packageRoot: repoRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
  });

  assert.ok(preview.planDigest);
  assert.ok(preview.reviewedPlanToken);

  // Apply update with postcheck observations as CLI does
  const applyResult = await applyLocalReleasePlan({
    planDigest: preview.planDigest,
    reviewedPlanToken: preview.reviewedPlanToken,
    packageRoot: repoRoot,
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    postcheckObservations: [
      {
        toolId: "gsd",
        boundary: "native-client",
        outcome: "ok",
      },
    ],
  });

  assert.equal(applyResult.applied, true);
  assert.equal(applyResult.status, "accepted");

  // Verify that tool-records/v1 store contains accepted state
  const store = await readToolRecordStore({ stateRoot: fixture.stateRoot, packageRoot: repoRoot });
  assert.equal(store.status, "current");
  assert.ok(store.accepted);
  assert.ok(Object.keys(store.accepted).some((k) => k.startsWith("gsd/")));

  // Verify that resolveAcceptedToolRecord (SSOT reader) resolves the accepted record
  const accepted = await resolveAcceptedToolRecord("gsd", {
    stateRoot: fixture.stateRoot,
    packageRoot: repoRoot,
  });
  assert.equal(accepted.toolId, "gsd");
  assert.ok(accepted.version);
});

test("E2E Integration Flow 3: resumeReleaseOperation commits accepted record to tool-records/v1 store", async (context) => {
  const fixture = await createTempFixture(context);
  const repoRoot = fixture.packageRoot;
  const opId = "op-resume-e2e-1";
  const toolId = "gsd";
  const candidateRelease = "1.20.0";

  // Pre-seed a lifecycle operation in pending state
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: repoRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: candidateRelease,
      artifact: "opengsd-gsd-core-1.20.0.tgz",
      integrity: "sha512-test==",
      digest: "c".repeat(64),
      planDigest: "d".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId,
    reviewedRelease: lcPlan.reviewedRelease,
    overallState: "pending",
  });

  // Resume the operation
  const resumeResult = await resumeReleaseOperation({
    operationId: opId,
    stateRoot: fixture.stateRoot,
    packageRoot: repoRoot,
    home: fixture.home,
    barrierInputs: [
      {
        toolId,
        candidateRelease,
        harnessResults: [{ harness: "codex", inActualUse: true, state: "pass" }],
      },
    ],
  });

  assert.equal(resumeResult.resumed, true);
  assert.equal(resumeResult.status, "accepted");

  // Verify that tool-records/v1 store now has this accepted tool record
  const accepted = await resolveAcceptedToolRecord(toolId, {
    stateRoot: fixture.stateRoot,
    packageRoot: repoRoot,
  });
  assert.equal(accepted.toolId, toolId);
  assert.equal(accepted.version, candidateRelease);
});
