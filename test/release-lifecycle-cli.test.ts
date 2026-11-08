import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  planReleaseLifecycleOperation,
  appendReleaseLifecycleEvent,
} from "../src/core/release-lifecycle-store.js";
import {
  planToolRecordOperation,
  withToolRecordSession,
  beginToolOperation,
  appendToolResult,
  finishToolOperation,
} from "../src/core/tool-record-store.js";
import type { ToolResult } from "../src/core/tool-records.js";
import type { ManagedToolId } from "../src/types.js";
import { packageRoot } from "../src/core/paths.js";

const CLI_BIN = resolve("dist/src/cli.js");

async function createCliFixture(context: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-lifecycle-cli-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const local = join(root, "local");
  const stateRoot = join(root, "state");
  const pkgRoot = packageRoot();
  await mkdir(home, { recursive: true });
  await mkdir(local, { recursive: true });
  await mkdir(stateRoot, { recursive: true });

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    LOCALAPPDATA: local,
    ALPHA_AOS_STATE_DIR: stateRoot,
  };

  const runCli = (args: string[]) => {
    return spawnSync(process.execPath, [CLI_BIN, ...args], {
      encoding: "utf8",
      env,
      cwd: pkgRoot,
    });
  };

  return { root, home, local, stateRoot, pkgRoot, env, runCli };
}

async function seedToolResult(stateRoot: string, pkgRoot: string, options: {
  operationId: string;
  toolId: ManagedToolId;
  version: string;
  installationId: string;
}) {
  const proofId = `proof-${options.operationId}`;
  const plan = await planToolRecordOperation({
    stateRoot,
    packageRoot: pkgRoot,
    operationId: options.operationId,
    occurredAt: "2026-11-08T00:00:00.000Z",
    requests: [{ toolId: options.toolId, selector: options.version, exact: true }],
  });
  await withToolRecordSession(plan, async (session) => {
    await beginToolOperation(plan, session);
    const result: ToolResult = {
      toolId: options.toolId,
      requested: { toolId: options.toolId, selector: options.version, exact: true },
      resolved: {
        release: options.version,
        artifact: `${options.toolId.replace(/:/g, "-")}-${options.version}.tgz`,
        platform: "windows",
        architecture: "x64",
        digest: "a".repeat(64),
        sourceId: "npm-registry",
        sourceUrl: `https://registry.npmjs.org/${options.toolId === "gsd" ? "@opengsd/gsd-core" : "@upstash/context7-mcp"}`,
      },
      installed: {
        installationId: options.installationId,
        version: options.version,
        pathAlias: `/tools/${options.toolId.replace(/:/g, "-")}`,
      },
      verified: proofId,
      evidence: [
        {
          proofId,
          target: "integration",
          subject: options.installationId,
          method: "invocation",
          result: "pass",
          harness: "codex",
          platform: "windows",
          architecture: "x64",
        },
      ],
      outcome: "succeeded",
    };
    await appendToolResult(plan, session, result);
    await finishToolOperation(plan, session, [
      {
        toolId: options.toolId,
        installationId: options.installationId,
        proofId,
        priorDigest: null,
      },
    ]);
  });
}

// ===========================================================================
// Task 42-06-01: exact resume preview/apply end-to-end
// ===========================================================================

test("Task 42-06-01 Test 1: update --resume <opId> is read-only preview and emits exact apply command", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-resume-preview-1";
  const toolId = "gsd";

  // Pre-seed a lifecycle operation with pending verification
  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-test==",
      digest: "d".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    pendingReason: "Verification pending adapter confirmation",
  });

  // Run preview
  const res = fixture.runCli(["update", "--resume", opId]);
  assert.equal(res.status, 0, `Preview should exit 0, got: ${res.status}, stderr: ${res.stderr}`);
  assert.match(res.stdout, /alpha-AOS release lifecycle resume preview/);
  assert.match(res.stdout, new RegExp(`Operation ID: ${opId}`));
  assert.match(res.stdout, /Candidate release: 1\.19\.0/);
  assert.match(res.stdout, /Apply command:/);
  assert.match(res.stdout, new RegExp(`alpha-aos update --resume ${opId} --apply --plan-digest`));
  assert.match(res.stdout, /--reviewed-plan/);
});

test("Task 42-06-01 Test 2 & 3: bound apply resumes persisted exact candidate; exit code routing and stale token rejection (D-03, D-08)", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-resume-apply-1";
  const toolId = "gsd";

  await seedToolResult(fixture.stateRoot, fixture.pkgRoot, {
    operationId: "op-prior-seed",
    toolId,
    version: "1.18.0",
    installationId: "inst-118",
  });

  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-test==",
      digest: "d".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    pendingReason: "Prior verification pending",
  });

  // 1. Get preview JSON
  const prevRes = fixture.runCli(["update", "--resume", opId, "--json"]);
  assert.equal(prevRes.status, 0);
  const preview = JSON.parse(prevRes.stdout);
  assert.equal(preview.operation, "resume");
  assert.ok(preview.planDigest);
  assert.ok(preview.reviewedPlan);

  // 2. Stale / mismatched token rejects with exit 2 before mutation (D-08, T-42-20)
  const staleRes = fixture.runCli([
    "update",
    "--resume",
    opId,
    "--apply",
    "--plan-digest",
    "deadbeef".repeat(8),
    "--reviewed-plan",
    preview.reviewedPlan,
  ]);
  assert.equal(staleRes.status, 2);
  assert.match(staleRes.stderr, /Plan digest mismatch/);

  // Missing tokens reject with exit 2
  const missingRes = fixture.runCli(["update", "--resume", opId, "--apply"]);
  assert.equal(missingRes.status, 2);
  assert.match(missingRes.stderr, /Applying resume requires both --plan-digest and --reviewed-plan/);

  // 3. Bound apply succeeds (or returns structured status)
  const applyRes = fixture.runCli([
    "update",
    "--resume",
    opId,
    "--apply",
    "--plan-digest",
    preview.planDigest,
    "--reviewed-plan",
    preview.reviewedPlan,
  ]);
  // In this fixture, resume performs verification and barrier check
  // It either exits 0 (accepted), 3 (verification-pending), or 4 (failed)
  assert.ok([0, 3, 4].includes(applyRes.status ?? -1));
  assert.match(applyRes.stdout, /alpha-AOS release lifecycle resume result/);
  assert.match(applyRes.stdout, new RegExp(`Operation ID: ${opId}`));
});

test("Task 42-06-01 Test 4: default text and --json parity without secret exposure (D-02, T-42-19)", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-resume-parity-1";
  const toolId = "gsd";

  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-test==",
      digest: "e".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    pendingReason: "Verification awaiting check",
  });

  const textRes = fixture.runCli(["update", "--resume", opId]);
  const jsonRes = fixture.runCli(["update", "--resume", opId, "--json"]);

  assert.equal(textRes.status, 0);
  assert.equal(jsonRes.status, 0);

  const json = JSON.parse(jsonRes.stdout);
  assert.equal(json.operation, "resume");
  assert.equal(json.operationId, opId);
  assert.equal(json.candidateRelease, "1.19.0");
  assert.ok(Array.isArray(json.verificationChecks));
  assert.ok(Array.isArray(json.affectedHarnesses));
  assert.ok(json.costAndPermissions);

  // Parity in text
  assert.match(textRes.stdout, /Operation ID: op-resume-parity-1/);
  assert.match(textRes.stdout, /Candidate release: 1\.19\.0/);
  assert.match(textRes.stdout, /Verification checks:/);
  assert.match(textRes.stdout, /Affected harnesses:/);
  assert.match(textRes.stdout, /Cost and permissions:/);

  // Secret redaction check
  const secretSentinels = ["SECRET", "BEARER", "PRIVATE_KEY", "api_key"];
  for (const s of secretSentinels) {
    assert.doesNotMatch(textRes.stdout, new RegExp(s, "i"));
    assert.doesNotMatch(jsonRes.stdout, new RegExp(s, "i"));
  }
});

// ===========================================================================
// Task 42-06-02: cancel/recover/cleanup mutual exclusion, exit codes & outcomes
// ===========================================================================

test("Task 42-06-02 Test 1: --cancel, --recover, --cleanup mutual exclusion and operand rejection", async (context) => {
  const fixture = await createCliFixture(context);

  // Conflicting lifecycle flags: exit 2
  const conflict1 = fixture.runCli(["update", "--cancel", "op1", "--recover", "op2"]);
  assert.equal(conflict1.status, 2);
  assert.match(conflict1.stderr, /Conflicting lifecycle flags/);

  const conflict2 = fixture.runCli(["update", "--resume", "op1", "--cleanup", "op2"]);
  assert.equal(conflict2.status, 2);
  assert.match(conflict2.stderr, /Conflicting lifecycle flags/);

  // Combining lifecycle flag with --tool or --target: exit 2
  const conflict3 = fixture.runCli(["update", "--cancel", "op1", "--tool", "gsd"]);
  assert.equal(conflict3.status, 2);
  assert.match(conflict3.stderr, /Cannot specify --tool or --target/);

  // Unknown update argument: exit 2
  const unknownArg = fixture.runCli(["update", "unknown-operand"]);
  assert.equal(unknownArg.status, 2);
  assert.match(unknownArg.stderr, /Unexpected update argument/);
});

test("Task 42-06-02 Test 2 & 4: cancel preview/apply retains active/evidence/artifacts and exits 0 (D-08, D-15)", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-cancel-1";
  const toolId = "gsd";

  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-test==",
      digest: "f".repeat(64),
    },
  });

  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "verification-pending",
    toolId,
    reviewedRelease: plan.reviewedRelease,
  });

  // Cancel preview
  const prevRes = fixture.runCli(["update", "--cancel", opId]);
  assert.equal(prevRes.status, 0);
  assert.match(prevRes.stdout, /alpha-AOS release lifecycle cancel preview/);
  assert.match(prevRes.stdout, /Apply command:/);
  assert.match(prevRes.stdout, new RegExp(`alpha-aos update --cancel ${opId} --apply --plan-digest`));

  const jsonPrev = JSON.parse(fixture.runCli(["update", "--cancel", opId, "--json"]).stdout);
  assert.equal(jsonPrev.operation, "cancel");
  assert.ok(jsonPrev.planDigest);
  assert.ok(jsonPrev.reviewedPlan);

  // Apply cancel
  const applyRes = fixture.runCli([
    "update",
    "--cancel",
    opId,
    "--apply",
    "--plan-digest",
    jsonPrev.planDigest,
    "--reviewed-plan",
    jsonPrev.reviewedPlan,
  ]);
  assert.equal(applyRes.status, 0, `Cancel apply should exit 0, got ${applyRes.status}`);
  assert.match(applyRes.stdout, /Cancelled: true/);
  assert.match(applyRes.stdout, /Active installation: retained/);
  assert.match(applyRes.stdout, /Evidence records: retained/);
  assert.match(applyRes.stdout, /Downloaded artifacts: retained/);
});

test("Task 42-06-02 Test 3: recover preview/apply reports recovered-failed exit 4 or recovery-required exit 5 (D-08, D-12)", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-recover-1";
  const toolId = "gsd";

  await seedToolResult(fixture.stateRoot, fixture.pkgRoot, {
    operationId: "op-prior-seed-rec",
    toolId,
    version: "1.18.0",
    installationId: "inst-118-rec",
  });

  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: "gsd-1.19.0.tgz",
      integrity: "sha512-test==",
      digest: "1".repeat(64),
    },
  });

  // Seed activated and postcheck-failed with lastGoodIdentity
  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "activated",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    lastGoodIdentity: { version: "1.18.0", installationId: "inst-118-rec" },
  });
  await appendReleaseLifecycleEvent(plan, {
    sequence: 2,
    occurredAt: new Date().toISOString(),
    kind: "postcheck-failed",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    lastGoodIdentity: { version: "1.18.0", installationId: "inst-118-rec" },
    failureReason: "Postcheck failed on harness invocation",
  });

  // Recover preview
  const prevRes = fixture.runCli(["update", "--recover", opId, "--json"]);
  assert.equal(prevRes.status, 0);
  const prev = JSON.parse(prevRes.stdout);
  assert.equal(prev.operation, "recover");
  assert.ok(prev.planDigest);
  assert.ok(prev.reviewedPlan);

  // Apply recover
  const applyRes = fixture.runCli([
    "update",
    "--recover",
    opId,
    "--apply",
    "--plan-digest",
    prev.planDigest,
    "--reviewed-plan",
    prev.reviewedPlan,
  ]);

  // D-11: Attempted update remains failed even if recovered successfully -> exit 4
  assert.equal(applyRes.status, 4, `Recovered-failed should exit 4, got: ${applyRes.status}`);
  assert.match(applyRes.stdout, /alpha-AOS release lifecycle recover result/);
  assert.match(applyRes.stdout, /Recovered: true/);
  assert.match(applyRes.stdout, /Batch recovery outcome: recovered-failed/);

  // Also verify recovery-required returns exit 5 when recovery cannot confirm prior state (D-12)
  const reqOpId = "op-recover-req-1";
  await seedToolResult(fixture.stateRoot, fixture.pkgRoot, {
    operationId: "op-active-candidate-req",
    toolId: "mcp:context7",
    version: "4.4.4",
    installationId: "inst-444-req",
  });
  const reqPlan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: reqOpId,
    occurredAt: new Date().toISOString(),
    toolId: "mcp:context7",
    reviewedRelease: {
      toolId: "mcp:context7",
      release: "4.4.4",
      artifact: "context7-4.4.4.tgz",
      integrity: "sha512-test==",
      digest: "3".repeat(64),
    },
  });
  await appendReleaseLifecycleEvent(reqPlan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "activated",
    toolId: "mcp:context7",
    reviewedRelease: reqPlan.reviewedRelease,
    // No lastGoodIdentity -> unrecorded prior version triggers recovery-required
  });
  await appendReleaseLifecycleEvent(reqPlan, {
    sequence: 2,
    occurredAt: new Date().toISOString(),
    kind: "postcheck-failed",
    toolId: "mcp:context7",
    reviewedRelease: reqPlan.reviewedRelease,
    failureReason: "Postcheck failed without prior backup",
  });

  const reqPrev = JSON.parse(fixture.runCli(["update", "--recover", reqOpId, "--json"]).stdout);
  const reqApplyRes = fixture.runCli([
    "update",
    "--recover",
    reqOpId,
    "--apply",
    "--plan-digest",
    reqPrev.planDigest,
    "--reviewed-plan",
    reqPrev.reviewedPlan,
  ]);
  assert.equal(reqApplyRes.status, 5, `Recovery-required should exit 5, got: ${reqApplyRes.status}`);
  assert.match(reqApplyRes.stdout, /Batch recovery outcome: recovery-required/);
  assert.match(reqApplyRes.stdout, /Residual effects:/);
});

test("Task 42-06-02 Test 4 & 5: cleanup preview/apply shows removable vs protected artifacts and exits 0 (D-14)", async (context) => {
  const fixture = await createCliFixture(context);
  const opId = "op-cleanup-1";
  const toolId = "gsd";

  const fakeArtifact = join(fixture.stateRoot, "downloads", "protected-candidate.tgz");
  const unreferencedArtifact = join(fixture.stateRoot, "downloads", "unreferenced-candidate.tgz");
  await mkdir(join(fixture.stateRoot, "downloads"), { recursive: true });
  await writeFile(fakeArtifact, "fake protected artifact binary");
  await writeFile(unreferencedArtifact, "unreferenced candidate binary");

  const plan = await planReleaseLifecycleOperation({
    stateRoot: fixture.stateRoot,
    packageRoot: fixture.pkgRoot,
    operationId: opId,
    occurredAt: new Date().toISOString(),
    toolId,
    reviewedRelease: {
      toolId,
      release: "1.19.0",
      artifact: fakeArtifact,
      integrity: "sha512-test==",
      digest: "2".repeat(64),
    },
  });

  // Terminal state so it's eligible for cleanup
  await appendReleaseLifecycleEvent(plan, {
    sequence: 1,
    occurredAt: new Date().toISOString(),
    kind: "cancelled",
    toolId,
    reviewedRelease: plan.reviewedRelease,
    artifactRefs: [fakeArtifact],
  });

  // Cleanup preview
  const prevRes = fixture.runCli(["update", "--cleanup", opId, "--json"]);
  assert.equal(prevRes.status, 0);
  const prev = JSON.parse(prevRes.stdout);
  assert.ok(prev.removableArtifacts.some((a: any) => a.path.includes("unreferenced-candidate.tgz")));

  // Text preview parity
  const textPrev = fixture.runCli(["update", "--cleanup", opId]);
  assert.equal(textPrev.status, 0);
  assert.match(textPrev.stdout, /alpha-AOS release lifecycle cleanup preview/);
  assert.match(textPrev.stdout, /Removable artifacts/);
  assert.match(textPrev.stdout, /Protected artifacts/);

  // Apply cleanup
  const applyRes = fixture.runCli([
    "update",
    "--cleanup",
    opId,
    "--apply",
    "--plan-digest",
    prev.planDigest,
    "--reviewed-plan",
    prev.reviewedPlan,
  ]);
  assert.equal(applyRes.status, 0);
  assert.match(applyRes.stdout, /alpha-AOS release lifecycle cleanup result/);
  assert.match(applyRes.stdout, /Deleted artifacts: 1/);
});
