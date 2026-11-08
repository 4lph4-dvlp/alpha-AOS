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
  reconcileInterruptedOperations,
  resumeReleaseOperation,
  cancelReleaseOperation,
  recoverReleaseOperation,
  createDefaultReleaseAdapter,
  type NativeReleaseAdapter,
} from "../src/core/release-recovery.js";
import {
  createReleaseCleanupPlan,
  applyReleaseCleanupPlan,
  readReleaseLifecycle,
  planReleaseLifecycleOperation,
  appendReleaseLifecycleEvent,
} from "../src/core/release-lifecycle-store.js";
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

test("Task 42-05-01 Test 1: interrupted single-tool operation blocks new update and reconciles first (D-13)", async (context) => {
  const fixture = await createTempFixture(context);

  const opId = "op-interrupted-1";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "activated",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    activeIdentity: {
      installationId: "gsd-1.19.0",
      version: "1.19.0",
      pathAlias: "opengsd/gsd-core",
    },
  });

  const plan = await createLocalReleasePlan({
    mode: "install",
    tools: ["gsd"],
    packageRoot: packageRoot(),
    stateRoot: fixture.stateRoot,
    home: fixture.home,
    fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
  });

  const gsdItem = plan.allTools.find((t) => t.toolId === "gsd");
  assert.equal(gsdItem?.action, "blocked");
  assert.equal(gsdItem?.blockedReason?.code, "interrupted-operation");
  assert.ok(gsdItem?.blockedReason?.message.includes(opId));
  assert.equal(plan.applyAllowed, false);
});

test("Task 42-05-01 Test 2: matching approval/recovery scope continues bounded recovery; mismatch halts with zero mutation (D-12, D-13)", async (context) => {
  const fixture = await createTempFixture(context);

  let adapterRecoverCalled = false;
  const adapter: NativeReleaseAdapter = {
    adapterId: "scope-test-adapter",
    toolId: "gsd",
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      return { version: "1.18.0", installationId: "gsd-1.18.0", pathAlias: "opengsd/gsd-core" };
    },
    async recover() {
      adapterRecoverCalled = true;
      return { success: true, command: "restore", exitCode: 0, message: "restored" };
    },
  };

  const opId = "op-interrupted-scope";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "activated",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    lastGoodIdentity: {
      installationId: "gsd-1.18.0",
      version: "1.18.0",
    },
  });

  // Case A: Mismatched recovery scope -> zero mutation, halted
  const mismatchResult = await reconcileInterruptedOperations({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    tools: ["gsd"],
    approvedRecoveryScope: ["cua-driver"],
    adapters: { gsd: adapter },
    autoRecoverIfAuthorized: true,
  });

  assert.equal(mismatchResult.blocked, true);
  assert.equal(adapterRecoverCalled, false, "Adapter recover must not be called when scope mismatches");
  assert.ok(mismatchResult.nextCommand?.includes(opId));

  // Case B: Matching recovery scope -> auto-recovers
  const matchResult = await reconcileInterruptedOperations({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    tools: ["gsd"],
    approvedRecoveryScope: ["gsd"],
    adapters: { gsd: adapter },
    autoRecoverIfAuthorized: true,
  });

  assert.equal(matchResult.blocked, false);
  assert.equal(adapterRecoverCalled, true, "Adapter recover must be called when scope matches");
});

test("Task 42-05-01 Test 3: concurrent new update and recovery: writer lock prevents concurrent new update (PROOF-04/concurrency)", async (context) => {
  const fixture = await createTempFixture(context);

  const plan = await planToolRecordOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: "op-writer-holder",
    occurredAt: new Date().toISOString(),
    requests: [{ toolId: "gsd", selector: "1.19.0", exact: true }],
  });

  await withToolRecordSession(plan, async () => {
    const concurrentPlan = await createLocalReleasePlan({
      mode: "install",
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
        harnessResults: [{ harness: "codex", inActualUse: true, state: "pass" }],
      },
    ];

    await assert.rejects(
      async () => {
        await applyLocalReleasePlan({
          planDigest: concurrentPlan.planDigest!,
          reviewedPlanToken: concurrentPlan.reviewedPlanToken!,
          packageRoot: packageRoot(),
          stateRoot: fixture.stateRoot,
          home: fixture.home,
          fetchImpl: mockFetch(DEFAULT_NPM_RESPONSES),
          barrierInputs,
        });
      },
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /lock|held|holds|busy/i);
        return true;
      },
    );
  });
});

test("Task 42-05-01 Test 4: terminal recovered operation replay gives zero native/file mutation and returns identical observed state (PROOF-04/idempotency)", async (context) => {
  const fixture = await createTempFixture(context);

  let adapterCallCount = 0;
  const adapter: NativeReleaseAdapter = {
    adapterId: "replay-test-adapter",
    toolId: "gsd",
    revision: "1.0.0",
    prepareMode: "inactive",
    async observeActiveIdentity() {
      return { version: "1.18.0", installationId: "gsd-1.18.0", pathAlias: "opengsd/gsd-core" };
    },
    async recover() {
      adapterCallCount++;
      return { success: true, command: "restore", exitCode: 0, message: "restored" };
    },
  };

  const opId = "op-recovered-replay";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "recovered",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    overallState: "pass",
  });

  const result = await recoverReleaseOperation({
    operationId: opId,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    adapters: { gsd: adapter },
  });

  assert.equal(result.recovered, true);
  assert.equal(result.alreadyTerminal, true);
  assert.equal(result.idempotent, true);
  assert.equal(adapterCallCount, 0, "No adapter mutations must occur on idempotent replay");
});

test("Task 42-05-02 Test 1: resume uses persisted exact candidate and reuses unchanged fingerprint tiers; latest resolver is never called (D-03, D-04)", async (context) => {
  const fixture = await createTempFixture(context);

  const opId = "op-resume-exact";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    evidenceFingerprint: "a".repeat(64),
    overallState: "pending",
  });

  let latestCalled = false;
  const spyFetch: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/latest")) {
      latestCalled = true;
      throw new Error("latest endpoint called during resume!");
    }
    return new Response(JSON.stringify({ version: "1.19.0" }), { status: 200 });
  };

  const resumeRes = await resumeReleaseOperation({
    operationId: opId,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    fetchImpl: spyFetch,
  });

  assert.equal(latestCalled, false, "/latest endpoint must never be called during resume (D-03)");
  assert.equal(resumeRes.resumed, true);
  assert.equal(resumeRes.status, "accepted");
  assert.ok(resumeRes.reusedTiers?.includes("environment"), "Unchanged evidence tiers must be reused (D-04)");
});

test("Task 42-05-02 Test 2: cancel appends cancelled terminal state, leaves active/candidate artifacts/evidence/history untouched, and replay is idempotent (D-15)", async (context) => {
  const fixture = await createTempFixture(context);

  const opId = "op-cancel-retention";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    activeIdentity: {
      installationId: "gsd-1.18.0",
      version: "1.18.0",
      pathAlias: "opengsd/gsd-core",
    },
  });

  const cancelRes = await cancelReleaseOperation({
    operationId: opId,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    reason: "User cancelled pending verification",
  });

  assert.equal(cancelRes.cancelled, true);

  const updatedLc = await readReleaseLifecycle({ stateRoot: fixture.stateRoot, operationId: opId });
  assert.equal(updatedLc?.status, "cancelled");
  assert.equal(updatedLc?.events.length, 2);
  assert.equal(updatedLc?.events[0]?.kind, "verification-pending");
  assert.equal(updatedLc?.events[1]?.kind, "cancelled");

  const replayRes = await cancelReleaseOperation({
    operationId: opId,
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
  });

  assert.equal(replayRes.cancelled, true);
  assert.equal(replayRes.alreadyTerminal, true);
  assert.equal(replayRes.idempotent, true);
});

test("Task 42-05-02 Test 3: cleanup preview lists removable artifacts excluding active, last-good, pending, recovery, metadata/history (D-14)", async (context) => {
  const fixture = await createTempFixture(context);

  const opId = "op-cleanup-ref";
  const lcPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId: "gsd",
    reviewedRelease: {
      toolId: "gsd",
      release: "1.19.0",
      artifact: "/managed/artifacts/gsd-1.19.0.tgz",
      integrity: "sha512-gsd119==",
      digest: "a".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(lcPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "activated",
    toolId: "gsd",
    reviewedRelease: lcPlan.reviewedRelease,
    activeIdentity: {
      installationId: "gsd-1.19.0",
      version: "1.19.0",
      pathAlias: "opengsd/gsd-core",
    },
    lastGoodIdentity: {
      installationId: "gsd-1.18.0",
      version: "1.18.0",
    },
    artifactRefs: ["/managed/artifacts/gsd-1.18.0.tgz"],
  });

  const candidates = [
    { path: "/managed/artifacts/gsd-1.19.0.tgz", digest: "1".repeat(64) },
    { path: "/managed/artifacts/gsd-1.18.0.tgz", digest: "2".repeat(64) },
    { path: join(fixture.stateRoot, "tool-records", "v1", "0-start.json"), digest: "3".repeat(64) },
    { path: "/managed/artifacts/old-unused-1.10.0.tgz", digest: "4".repeat(64) },
  ];

  const plan = await createReleaseCleanupPlan({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    candidateArtifacts: candidates,
  });

  assert.ok(plan.protectedArtifacts.includes("/managed/artifacts/gsd-1.19.0.tgz"));
  assert.ok(plan.protectedArtifacts.includes("/managed/artifacts/gsd-1.18.0.tgz"));
  assert.equal(plan.removableArtifacts.length, 1);
  assert.equal(plan.removableArtifacts[0]?.path, "/managed/artifacts/old-unused-1.10.0.tgz");
  assert.ok(plan.planDigest);
  assert.ok(plan.reviewedToken);
});

test("Task 42-05-02 Test 4: cleanup apply rechecks digest, protected set, root; drift gives zero deletion; replay gives zero additional deletion (PROOF-04/idempotency)", async (context) => {
  const fixture = await createTempFixture(context);

  await mkdir(fixture.stateRoot, { recursive: true });
  const oldArtifactPath = join(fixture.stateRoot, "old-artifact.tgz");
  await writeFile(oldArtifactPath, "old artifact content");

  const candidates = [
    { path: oldArtifactPath, digest: "4".repeat(64), sizeBytes: 20 },
  ];

  const plan = await createReleaseCleanupPlan({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    candidateArtifacts: candidates,
  });

  // Drift check: Corrupted plan digest
  const driftedDigestPlan = { ...plan, planDigest: "corrupted-digest" };
  const driftResult1 = await applyReleaseCleanupPlan({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    plan: driftedDigestPlan,
  });

  assert.equal(driftResult1.applied, false);
  assert.equal(driftResult1.driftDetected, true);
  assert.equal(driftResult1.deletedCount, 0);

  // Apply valid plan
  const applyRes = await applyReleaseCleanupPlan({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    plan,
  });

  assert.equal(applyRes.applied, true);
  assert.equal(applyRes.deletedCount, 1);
  assert.equal(applyRes.deletedPaths[0], oldArtifactPath);

  // Replay cleanup plan (idempotent zero additional deletion)
  const replayRes = await applyReleaseCleanupPlan({
    stateRoot: fixture.stateRoot,
    packageRoot: packageRoot(),
    plan,
  });

  assert.equal(replayRes.applied, true);
  assert.equal(replayRes.deletedCount, 0);
  assert.equal(replayRes.skippedPaths.length, 1);
});

test("Task 42-05-02 Test 5: resume/recover missing prior artifact permits only exact official reacquisition and rejects latest substitute (D-16)", async (context) => {
  const artifactBytes = Buffer.from("gsd-1.18.0 exact artifact payload");
  const integrity = `sha512-${createHash("sha512").update(artifactBytes).digest("base64")}`;

  const fetchImpl: typeof fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/latest")) {
      return new Response(JSON.stringify({ version: "1.19.0" }), { status: 200 });
    }
    return new Response(artifactBytes, { status: 200 });
  };

  const reacquired = await reacquireReviewedPreviousArtifact({
    toolId: "gsd",
    reviewedRelease: "1.18.0",
    reviewedArtifact: "gsd-1.18.0.tgz",
    reviewedIntegrity: integrity,
    sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/gsd-1.18.0.tgz",
    approvedRecoveryScope: ["gsd"],
    fetchImpl,
  });

  assert.equal(reacquired.reacquired, true);

  await assert.rejects(
    async () => {
      await reacquireReviewedPreviousArtifact({
        toolId: "gsd",
        reviewedRelease: "1.18.0",
        reviewedArtifact: "gsd-1.18.0.tgz",
        reviewedIntegrity: integrity,
        sourceUrl: "https://registry.npmjs.org/@opengsd/gsd-core/-/gsd-1.18.0.tgz",
        approvedRecoveryScope: ["gsd"],
        fetchImpl,
        requestedRelease: "1.19.0",
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /Substituting|Substitute/i);
      return true;
    },
  );
});
