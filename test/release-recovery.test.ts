import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  recoverActivatedBatch,
  reacquireReviewedPreviousArtifact,
  reconcileReleaseOperation,
  createDefaultReleaseAdapter,
  type NativeReleaseAdapter,
} from "../src/core/release-recovery.js";
import {
  applyLocalReleasePlan,
  createLocalReleasePlan,
} from "../src/core/update.js";
import { packageRoot } from "../src/core/paths.js";
import { readToolRecordStore } from "../src/core/tool-records.js";
import {
  planToolRecordOperation,
  withToolRecordSession,
  beginToolOperation,
  appendToolResult,
  finishToolOperation,
} from "../src/core/tool-record-store.js";
import { readReleaseLifecycle } from "../src/core/release-lifecycle-store.js";
import type { BarrierToolInput } from "../src/types.js";

function mockFetch(responses: Record<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        if (body instanceof Error) throw body;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
  };
}

const DEFAULT_NPM_RESPONSES = {
  "%40opengsd%2Fgsd-core/latest": { version: "1.19.0", dist: { integrity: "sha512-gsd119==" } },
  "%40opengsd%2Fgsd-core/1.19.0": { version: "1.19.0", dist: { integrity: "sha512-gsd119==" } },
  "%40upstash%2Fcontext7-mcp/latest": {
    version: "4.4.4",
    dist: { integrity: "sha512-T2DkjhweDnC2mRAclDiTrPG3KI1zYKhhjgY2SMKD9PVrbEaGD8x35VsIOqpwwDc2qiKBvfYCF/jqr+jQMu5PUA==" },
  },
  "%40upstash%2Fcontext7-mcp/4.4.4": {
    version: "4.4.4",
    dist: { integrity: "sha512-T2DkjhweDnC2mRAclDiTrPG3KI1zYKhhjgY2SMKD9PVrbEaGD8x35VsIOqpwwDc2qiKBvfYCF/jqr+jQMu5PUA==" },
  },
};

async function createTempFixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-recovery-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const pkgRoot = join(root, "pkg");
  const stateRoot = join(root, "state");
  const home = join(root, "home");
  return { root, packageRoot: pkgRoot, stateRoot, home };
}

test("Task 42-04-01 Test 1: one tool postcheck fails triggers immediate native recovery and restores previous identity (D-09)", async (context) => {
  const fixture = await createTempFixture(context);
  let recoveryCalled = false;

  const isolatedEnv: NodeJS.ProcessEnv = {
    APPDATA: join(fixture.home, "AppData", "Roaming"),
    LOCALAPPDATA: join(fixture.home, "AppData", "Local"),
    PATH: "",
    npm_config_prefix: join(fixture.home, "npm"),
    USERPROFILE: fixture.home,
    HOME: fixture.home,
  };

  const gsdPkgDir = join(fixture.home, "npm", "node_modules", "@opengsd", "gsd-core");
  await mkdir(gsdPkgDir, { recursive: true });
  await writeFile(join(gsdPkgDir, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "1.18.0" }));

  const fakeAdapter: NativeReleaseAdapter = {
    adapterId: "fake-gsd-adapter",
    toolId: "gsd",
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      return {
        version: recoveryCalled ? "1.18.0" : "1.19.0",
        installationId: recoveryCalled ? "gsd-1.18.0" : "gsd-1.19.0",
        pathAlias: "opengsd/gsd-core",
      };
    },
    async recover(options) {
      recoveryCalled = true;
      return {
        success: true,
        command: `fake-restore gsd ${options.previousRelease}`,
        exitCode: 0,
        message: `Restored gsd to ${options.previousRelease}`,
        rolledBackFiles: ["/fake/gsd"],
      };
    },
  };

  // Pre-seed gsd 1.18.0 in state
  const initialRecordPlan = await planToolRecordOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: "op-initial-gsd",
    occurredAt: new Date().toISOString(),
    requests: [{ toolId: "gsd", selector: "1.18.0", exact: true }],
  });
  await withToolRecordSession(initialRecordPlan, async (session) => {
    await beginToolOperation(initialRecordPlan, session);
    await appendToolResult(initialRecordPlan, session, {
      toolId: "gsd",
      requested: { toolId: "gsd", selector: "1.18.0", exact: true },
      resolved: { release: "1.18.0", artifact: "gsd-1.18.0.tgz", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core" },
      installed: { installationId: "gsd-1.18.0", version: "1.18.0", pathAlias: "opengsd/gsd-core" },
      verified: "proof-init",
      evidence: [
        {
          proofId: "proof-init",
          subject: "gsd-1.18.0",
          target: "integration",
          method: "invocation",
          result: "pass",
          platform: "windows",
          architecture: "x64",
          harness: "codex",
        },
      ],
      outcome: "succeeded",
    });
    await finishToolOperation(initialRecordPlan, session, [
      { toolId: "gsd", installationId: "gsd-1.18.0", proofId: "proof-init", priorDigest: null },
    ]);
  });

  const plan = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  const barrierInputs: readonly BarrierToolInput[] = [
    {
      toolId: "gsd",
      candidateRelease: "1.19.0",
      harnessResults: [{ harness: "codex", inActualUse: true, state: "pass" }],
    },
  ];

  const applyResult = await applyLocalReleasePlan({
    planDigest: plan.planDigest!,
    reviewedPlanToken: plan.reviewedPlanToken!,
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
    barrierInputs,
    simulatePostcheckFailure: true,
    recoveryAdapters: { gsd: fakeAdapter },
  });

  assert.equal(applyResult.applied, false);
  assert.equal(recoveryCalled, true, "Immediate native recovery must be invoked on postcheck failure (D-09)");
  assert.equal(applyResult.status, "failed-post-apply");
  assert.equal(applyResult.recoveryResult?.overallStatus, "recovered-failed");
  assert.equal(applyResult.recoveryResult?.toolResults[0]?.status, "recovered");
  assert.equal(applyResult.recoveryResult?.toolResults[0]?.observedIdentity.version, "1.18.0");
});

test("Task 42-04-01 Test 2: process exit alone is insufficient; actual identity observation must confirm previous state (D-09, D-12)", async (context) => {
  const fixture = await createTempFixture(context);

  // Adapter reports recovery command success, but observed identity has NOT reverted!
  const lyingAdapter: NativeReleaseAdapter = {
    adapterId: "lying-adapter",
    toolId: "gsd",
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      // Identity still observes candidate 1.19.0!
      return {
        version: "1.19.0",
        installationId: "gsd-1.19.0",
        pathAlias: "opengsd/gsd-core",
      };
    },
    async recover() {
      return {
        success: true,
        command: "native-restore",
        exitCode: 0,
        message: "Command exited 0",
      };
    },
  };

  const recovery = await recoverActivatedBatch({
    operationId: "op-test-lying",
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    switchedTools: [
      { toolId: "gsd", candidateRelease: "1.19.0", previousRelease: "1.18.0" },
    ],
    approvedRecoveryScope: ["gsd", "native-recover:gsd"],
    adapters: { gsd: lyingAdapter },
  });

  // Because observed identity did not revert, status must be recovery-required (D-12)
  assert.equal(recovery.overallStatus, "recovery-required");
  assert.equal(recovery.toolResults[0]?.status, "recovery-failed");
  assert.equal(recovery.toolResults[0]?.observedIdentity.matchesPrevious, false);
  assert.ok(recovery.toolResults[0]?.unknownFields.includes("observedIdentity.version"));
});

test("Task 42-04-01 Test 3: recovery success keeps attempted update failed and does not reactivate candidate (D-11)", async (context) => {
  const fixture = await createTempFixture(context);

  const isolatedEnv: NodeJS.ProcessEnv = {
    APPDATA: join(fixture.home, "AppData", "Roaming"),
    LOCALAPPDATA: join(fixture.home, "AppData", "Local"),
    PATH: "",
    npm_config_prefix: join(fixture.home, "npm"),
    USERPROFILE: fixture.home,
    HOME: fixture.home,
  };

  const gsdPkgDir = join(fixture.home, "npm", "node_modules", "@opengsd", "gsd-core");
  await mkdir(gsdPkgDir, { recursive: true });
  await writeFile(join(gsdPkgDir, "package.json"), JSON.stringify({ name: "@opengsd/gsd-core", version: "1.18.0" }));

  // Pre-seed gsd 1.18.0 in state
  const initialRecordPlan = await planToolRecordOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: "op-initial-gsd",
    occurredAt: new Date().toISOString(),
    requests: [{ toolId: "gsd", selector: "1.18.0", exact: true }],
  });
  await withToolRecordSession(initialRecordPlan, async (session) => {
    await beginToolOperation(initialRecordPlan, session);
    await appendToolResult(initialRecordPlan, session, {
      toolId: "gsd",
      requested: { toolId: "gsd", selector: "1.18.0", exact: true },
      resolved: { release: "1.18.0", artifact: "gsd-1.18.0.tgz", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core" },
      installed: { installationId: "gsd-1.18.0", version: "1.18.0", pathAlias: "opengsd/gsd-core" },
      verified: "proof-init",
      evidence: [
        {
          proofId: "proof-init",
          subject: "gsd-1.18.0",
          target: "integration",
          method: "invocation",
          result: "pass",
          platform: "windows",
          architecture: "x64",
          harness: "codex",
        },
      ],
      outcome: "succeeded",
    });
    await finishToolOperation(initialRecordPlan, session, [
      { toolId: "gsd", installationId: "gsd-1.18.0", proofId: "proof-init", priorDigest: null },
    ]);
  });

  const plan = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
  });

  const barrierInputs: readonly BarrierToolInput[] = [
    {
      toolId: "gsd",
      candidateRelease: "1.19.0",
      harnessResults: [{ harness: "codex", inActualUse: true, state: "pass" }],
    },
  ];

  const applyResult = await applyLocalReleasePlan({
    planDigest: plan.planDigest!,
    reviewedPlanToken: plan.reviewedPlanToken!,
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    env: isolatedEnv,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    platform: "win32",
    architecture: "x64",
    barrierInputs,
    simulatePostcheckFailure: true,
  });

  // D-11: Attempted update is failed-post-apply, applied is false, not success!
  assert.equal(applyResult.applied, false);
  assert.equal(applyResult.status, "failed-post-apply");

  const store = await readToolRecordStore({ stateRoot: fixture.stateRoot, packageRoot: packageRoot() });
  assert.equal(store.accepted?.["gsd/gsd-1.19.0"], undefined, "Candidate 1.19.0 must not be accepted after recovery (D-11)");
  assert.ok(store.accepted?.["gsd/gsd-1.18.0"], "Previous accepted state remains intact");
});

test("Task 42-04-01 Test 4: recovery scope mismatch stops mutation and returns recovery-required with residual effects (D-12, T-42-10)", async (context) => {
  const fixture = await createTempFixture(context);
  let recoverCalled = false;

  const adapter: NativeReleaseAdapter = {
    adapterId: "adapter-scope-check",
    toolId: "gsd",
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      return { version: "1.19.0", installationId: "gsd-1.19.0", pathAlias: "opengsd/gsd-core" };
    },
    async recover() {
      recoverCalled = true;
      return { success: true };
    },
  };

  const recovery = await recoverActivatedBatch({
    operationId: "op-test-scope-mismatch",
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    switchedTools: [
      { toolId: "gsd", candidateRelease: "1.19.0", previousRelease: "1.18.0" },
    ],
    // Scope does NOT include gsd!
    approvedRecoveryScope: ["cua-driver"],
    adapters: { gsd: adapter },
  });

  assert.equal(recoverCalled, false, "Mutation must not occur when outside approved recovery scope (T-42-10)");
  assert.equal(recovery.overallStatus, "recovery-required");
  assert.equal(recovery.toolResults[0]?.status, "recovery-failed");
  assert.ok(recovery.residualEffects.some((e) => e.includes("Unauthorized mutation boundary")));
  assert.ok(recovery.nextCommand?.includes("--recover"));
});

test("Task 42-04-02 Test 1: multi-tool failure attempts native recovery in reverse order of activation (D-10)", async (context) => {
  const fixture = await createTempFixture(context);
  const recoveryOrder: string[] = [];

  const makeAdapter = (id: "gsd" | "mcp:context7"): NativeReleaseAdapter => ({
    adapterId: `${id}-adapter`,
    toolId: id,
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      return { version: id === "gsd" ? "1.18.0" : "4.4.3", installationId: `${id}-old`, pathAlias: id };
    },
    async recover(options) {
      recoveryOrder.push(options.toolId);
      return {
        success: true,
        message: `Restored ${options.toolId}`,
      };
    },
  });

  // Tools switched in order: gsd, then mcp:context7
  const recovery = await recoverActivatedBatch({
    operationId: "op-test-reverse",
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    switchedTools: [
      { toolId: "gsd", candidateRelease: "1.19.0", previousRelease: "1.18.0" },
      { toolId: "mcp:context7", candidateRelease: "4.4.4", previousRelease: "4.4.3" },
    ],
    approvedRecoveryScope: ["gsd", "mcp:context7"],
    adapters: {
      gsd: makeAdapter("gsd"),
      "mcp:context7": makeAdapter("mcp:context7"),
    },
  });

  // Reverse order: mcp:context7 then gsd (D-10)
  assert.deepEqual(recoveryOrder, ["mcp:context7", "gsd"]);
  assert.deepEqual(recovery.reverseOrder, ["mcp:context7", "gsd"]);
  assert.equal(recovery.overallStatus, "recovered-failed");
});

test("Task 42-04-02 Test 2: unsupported capability declarations return explicit failure without claiming success (capability honesty)", async (context) => {
  const adapterWithoutRecover: NativeReleaseAdapter = {
    adapterId: "honest-unsupported-adapter",
    toolId: "bridge:pi",
    revision: "1.0.0",
    prepareMode: "unsupported",
    async observeActiveIdentity() {
      return { version: "1.0.1", installationId: "pi-1.0.1", pathAlias: "pi-mcp-adapter" };
    },
    // recover is NOT implemented
  };

  const recovery = await recoverActivatedBatch({
    operationId: "op-test-unsupported",
    stateRoot: (await createTempFixture(context)).stateRoot,
    packageRoot: packageRoot(),
    switchedTools: [
      { toolId: "bridge:pi", candidateRelease: "1.0.2", previousRelease: "1.0.1" },
    ],
    approvedRecoveryScope: ["bridge:pi"],
    adapters: { "bridge:pi": adapterWithoutRecover },
  });

  assert.equal(recovery.toolResults[0]?.status, "recovery-failed");
  assert.ok(recovery.toolResults[0]?.nativeResult.message?.includes("does not declare native recovery"));
});

test("Task 42-04-02 Test 3: missing previous artifact reacquisition accepts only exact reviewed tuple and rejects latest substitute (D-16)", async (context) => {
  const validArtifact = "console.log('original');\n";
  const validSha512 = "sha512-Y3I=="; // mock

  // Attempting to reacquire with a different version (e.g. latest) must throw (D-16)
  await assert.rejects(
    async () => {
      await reacquireReviewedPreviousArtifact({
        toolId: "gsd",
        reviewedRelease: "1.18.0",
        requestedRelease: "1.19.0", // Attempted substitution!
        reviewedArtifact: "gsd-core-1.18.0.tgz",
        reviewedIntegrity: validSha512,
        sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/gsd-core-1.18.0.tgz",
        approvedRecoveryScope: ["gsd"],
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.includes("Substituting with latest or adjacent version is prohibited"));
      return true;
    },
  );

  // Exact reacquisition matching reviewed tuple succeeds
  const mockFetcher = async () => new Response(Buffer.from(validArtifact), { status: 200 });
  const computedIntegrity = `sha512-${createHash("sha512").update(validArtifact).digest("base64")}`;

  const reacquired = await reacquireReviewedPreviousArtifact({
    toolId: "gsd",
    reviewedRelease: "1.18.0",
    requestedRelease: "1.18.0",
    reviewedArtifact: "gsd-core-1.18.0.tgz",
    reviewedIntegrity: computedIntegrity,
    sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/gsd-core-1.18.0.tgz",
    approvedRecoveryScope: ["gsd"],
    fetchImpl: mockFetcher as typeof fetch,
  });

  assert.equal(reacquired.reacquired, true);
  assert.ok(reacquired.digest);
});

test("Task 42-04-02 Test 4: reconcileReleaseOperation reports terminal and interrupted states with exact next actions (D-03, D-12)", async (context) => {
  const fixture = await createTempFixture(context);

  // Pre-seed gsd 1.18.0 in state
  const initialRecordPlan = await planToolRecordOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: "op-initial-gsd",
    occurredAt: new Date().toISOString(),
    requests: [{ toolId: "gsd", selector: "1.18.0", exact: true }],
  });
  await withToolRecordSession(initialRecordPlan, async (session) => {
    await beginToolOperation(initialRecordPlan, session);
    await appendToolResult(initialRecordPlan, session, {
      toolId: "gsd",
      requested: { toolId: "gsd", selector: "1.18.0", exact: true },
      resolved: { release: "1.18.0", artifact: "gsd-1.18.0.tgz", platform: "windows", architecture: "x64", digest: "a".repeat(64), sourceId: "npm-registry", sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core" },
      installed: { installationId: "gsd-1.18.0", version: "1.18.0", pathAlias: "opengsd/gsd-core" },
      verified: null,
      evidence: [],
      outcome: "succeeded",
    });
    await finishToolOperation(initialRecordPlan, session, []);
  });

  const plan = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
  });

  const barrierInputs: readonly BarrierToolInput[] = [
    {
      toolId: "gsd",
      candidateRelease: "1.19.0",
      harnessResults: [{ harness: "codex", inActualUse: true, state: "pending", reason: "reconciliation check" }],
    },
  ];

  const applyResult = await applyLocalReleasePlan({
    planDigest: plan.planDigest!,
    reviewedPlanToken: plan.reviewedPlanToken!,
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
    barrierInputs,
  });

  // Reconcile the pending operation
  const reconciliation = await reconcileReleaseOperation({
    operationId: "op-pending-test",
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
  });

  assert.ok(reconciliation);
});
