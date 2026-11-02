import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";
import { packageRoot } from "../src/core/paths.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");
const verifierScript = join(packageRoot(), "scripts", "verify-task-bootstrap-native.mjs");

test("composed acceptance: absent-project -> prepare -> native init -> fresh claim -> link -> ack -> once-only reentry (BOOT-01..04, D-15, D-18, D-23)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "composed-acceptance-project");
  await mkdir(projectDir, { recursive: true });

  // Dynamic GSD runtime that checks disk
  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(
    fakeGsdTools,
    `
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const planningDir = path.join(cwd, ".planning");
const planningExists = fs.existsSync(planningDir);
const projectExists = fs.existsSync(path.join(planningDir, "PROJECT.md"));
const requirementsExists = fs.existsSync(path.join(planningDir, "REQUIREMENTS.md"));
const roadmapExists = fs.existsSync(path.join(planningDir, "ROADMAP.md"));
const stateExists = fs.existsSync(path.join(planningDir, "STATE.md"));
const initIncomplete = planningExists && (!projectExists || !requirementsExists || !roadmapExists || !stateExists);
console.log(JSON.stringify({
  packageName: "@opengsd/gsd-core",
  version: "1.18.0",
  planning_exists: planningExists,
  init_incomplete: initIncomplete,
  project_exists: projectExists,
  requirements_exists: requirementsExists,
  roadmap_exists: roadmapExists,
  state_exists: stateExists,
  agents_installed: true,
  project_root: cwd,
}));
`,
    "utf8",
  );

  const env = {
    ...sandbox.env,
    CODEX_HOME: sandbox.home,
  };

  // 1. Task readiness on absent project
  const readyReqPath = join(projectDir, "req-readiness.json");
  await writeFile(
    readyReqPath,
    JSON.stringify({
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: projectDir,
    }),
    "utf8",
  );

  const readyRes = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", readyReqPath, "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(readyRes.status, 0);
  const readyData = JSON.parse(readyRes.stdout);
  assert.equal(readyData.diagnosis, "absent-project");
  assert.equal(readyData.ready, false);

  // 2. Prepare task bootstrap handoff
  const prepReqPath = join(projectDir, "req-prepare.json");
  await writeFile(
    prepReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "prepare",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-composed-001",
      projectRoot: projectDir,
      request: { text: "Add health check endpoint" },
    }),
    "utf8",
  );

  // Preview first (no writes)
  const prevRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", prepReqPath, "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(prevRes.status, 0);
  const prevData = JSON.parse(prevRes.stdout);
  assert.equal(prevData.applied, false);
  assert.ok(prevData.planDigest);

  // Apply prepare
  const applyPrepRes = spawnSync(
    process.execPath,
    [
      cliPath,
      "task",
      "bootstrap",
      "--input",
      prepReqPath,
      "--plan-digest",
      prevData.planDigest,
      "--apply",
      "--json",
    ],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(applyPrepRes.status, 0);
  const prepResult = JSON.parse(applyPrepRes.stdout);
  assert.equal(prepResult.applied, true);

  // 3. Simulate Native GSD Initialization (creating complete planning state)
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Composed Project\n", "utf8");
  await writeFile(join(projectDir, ".planning", "REQUIREMENTS.md"), "# Requirements\n", "utf8");
  await writeFile(join(projectDir, ".planning", "ROADMAP.md"), "# Roadmap\n", "utf8");
  await writeFile(join(projectDir, ".planning", "STATE.md"), "# State\n", "utf8");

  // 4. Fresh claim: validates fresh readiness and claims pending handoff
  const claimReqPath = join(projectDir, "req-claim.json");
  await writeFile(
    claimReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "claim",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-composed-001",
      projectRoot: projectDir,
      claimNonce: "claim-nonce-composed-123",
    }),
    "utf8",
  );

  const claimRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", claimReqPath, "--apply", "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(claimRes.status, 0);
  const claimData = JSON.parse(claimRes.stdout);
  assert.equal(claimData.operation, "claim");
  assert.equal(claimData.status, "claimed");
  assert.equal(claimData.dispatchAuthorized, true);

  // 5. Link native reference (simulate quick task creation)
  const quickDir = join(projectDir, ".planning", "quick", "001-health-check");
  await mkdir(quickDir, { recursive: true });
  const summaryPath = join(quickDir, "001-SUMMARY.md");
  await writeFile(summaryPath, "# Health Check Summary\nImplemented health check.", "utf8");

  const linkReqPath = join(projectDir, "req-link.json");
  await writeFile(
    linkReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "link",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-composed-001",
      projectRoot: projectDir,
      claimNonce: "claim-nonce-composed-123",
      nativeReference: {
        type: "quick",
        quickPath: summaryPath,
      },
    }),
    "utf8",
  );

  const linkRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", linkReqPath, "--apply", "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(linkRes.status, 0);
  const linkData = JSON.parse(linkRes.stdout);
  assert.equal(linkData.operation, "link");
  assert.equal(linkData.status, "linked");
  assert.ok(linkData.nativeReference?.quickPath?.includes("001-SUMMARY.md"));

  // 6. Acknowledge delivery
  const ackReqPath = join(projectDir, "req-ack.json");
  await writeFile(
    ackReqPath,
    JSON.stringify({
      schemaVersion: 1,
      operation: "acknowledge",
      controller: "codex",
      workflow: "quick",
      pendingId: "pending-composed-001",
      projectRoot: projectDir,
      claimNonce: "claim-nonce-composed-123",
      nativeReference: {
        type: "quick",
        quickPath: summaryPath,
      },
    }),
    "utf8",
  );

  const ackRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", ackReqPath, "--apply", "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(ackRes.status, 0);
  const ackData = JSON.parse(ackRes.stdout);
  assert.equal(ackData.operation, "acknowledge");
  assert.equal(ackData.status, "acknowledged");
  assert.equal(ackData.applied, true);

  // 7. Reentry with same pending reference -> redirect to continue-existing (NO second task)
  const reenterRes = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", linkReqPath, "--apply", "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(reenterRes.status, 0);
  const reenterData = JSON.parse(reenterRes.stdout);
  assert.equal(reenterData.operation, "link");
  assert.equal(reenterData.status, "linked");
  assert.ok(reenterData.nativeReference?.quickPath?.includes("001-SUMMARY.md"));
});

test("proof verifier tool enforces native tier, disk artifacts, and single execution (D-23, D-24)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "proof-test-project");
  await mkdir(join(projectDir, ".planning", "quick"), { recursive: true });

  const summaryPath = join(projectDir, ".planning", "quick", "001-SUMMARY.md");
  const summaryContent = "# Native Proof Summary\n";
  await writeFile(summaryPath, summaryContent, "utf8");
  const summarySha256 = createHash("sha256").update(summaryContent).digest("hex");

  // Initialize git repo in projectDir
  spawnSync("git", ["init"], { cwd: projectDir, env: sandbox.env });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: projectDir, env: sandbox.env });
  spawnSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir, env: sandbox.env });
  spawnSync("git", ["add", "."], { cwd: projectDir, env: sandbox.env });
  spawnSync("git", ["commit", "-m", "feat: initial proof commit"], { cwd: projectDir, env: sandbox.env });

  const gitHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectDir, encoding: "utf8" }).stdout.trim();

  // 1. Fixture tier rejection
  const fixtureReceiptPath = join(projectDir, "receipt-fixture.json");
  await writeFile(
    fixtureReceiptPath,
    JSON.stringify({
      schemaVersion: 1,
      evidenceTier: "fixture",
      projectRoot: projectDir,
      controller: "codex",
      pendingId: "p-01",
      claimNonce: "nonce-01",
      taskInvocationCount: 1,
      duplicateTaskCount: 0,
      nativeReference: {
        artifactPath: summaryPath,
        artifactSha256: summarySha256,
      },
    }),
    "utf8",
  );

  const fixtureRun = spawnSync(
    process.execPath,
    [verifierScript, "--receipt", fixtureReceiptPath, "--json"],
    { encoding: "utf8" },
  );
  assert.notEqual(fixtureRun.status, 0);
  const fixtureRes = JSON.parse(fixtureRun.stdout);
  assert.equal(fixtureRes.valid, false);
  assert.equal(fixtureRes.code, "REJECTED_FIXTURE_TIER");

  // 2. Duplicate execution rejection
  const dupReceiptPath = join(projectDir, "receipt-duplicate.json");
  await writeFile(
    dupReceiptPath,
    JSON.stringify({
      schemaVersion: 1,
      evidenceTier: "native",
      projectRoot: projectDir,
      controller: "codex",
      pendingId: "p-01",
      claimNonce: "nonce-01",
      taskInvocationCount: 2,
      duplicateTaskCount: 1,
      nativeReference: {
        artifactPath: summaryPath,
        artifactSha256: summarySha256,
      },
    }),
    "utf8",
  );

  const dupRun = spawnSync(
    process.execPath,
    [verifierScript, "--receipt", dupReceiptPath, "--json"],
    { encoding: "utf8" },
  );
  assert.notEqual(dupRun.status, 0);
  const dupRes = JSON.parse(dupRun.stdout);
  assert.equal(dupRes.valid, false);
  assert.equal(dupRes.code, "DUPLICATE_EXECUTION_DETECTED");

  // 3. Artifact hash mismatch rejection
  const mismatchReceiptPath = join(projectDir, "receipt-mismatch.json");
  await writeFile(
    mismatchReceiptPath,
    JSON.stringify({
      schemaVersion: 1,
      evidenceTier: "native",
      projectRoot: projectDir,
      controller: "codex",
      pendingId: "p-01",
      claimNonce: "nonce-01",
      taskInvocationCount: 1,
      duplicateTaskCount: 0,
      nativeReference: {
        artifactPath: summaryPath,
        artifactSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      },
    }),
    "utf8",
  );

  const mismatchRun = spawnSync(
    process.execPath,
    [verifierScript, "--receipt", mismatchReceiptPath, "--json"],
    { encoding: "utf8" },
  );
  assert.notEqual(mismatchRun.status, 0);
  const mismatchRes = JSON.parse(mismatchRun.stdout);
  assert.equal(mismatchRes.valid, false);
  assert.equal(mismatchRes.code, "ARTIFACT_HASH_MISMATCH");

  // 4. Valid native receipt passes
  const validReceiptPath = join(projectDir, "receipt-valid.json");
  await writeFile(
    validReceiptPath,
    JSON.stringify({
      schemaVersion: 1,
      evidenceTier: "native",
      projectRoot: projectDir,
      controller: "codex",
      pendingId: "p-01",
      claimNonce: "nonce-01",
      taskInvocationCount: 1,
      duplicateTaskCount: 0,
      nativeReference: {
        artifactPath: summaryPath,
        artifactSha256: summarySha256,
      },
      gitEvidence: {
        commitSha: gitHead,
      },
    }),
    "utf8",
  );

  const validRun = spawnSync(
    process.execPath,
    [verifierScript, "--receipt", validReceiptPath, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(validRun.status, 0);
  const validRes = JSON.parse(validRun.stdout);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.evidenceTier, "native");
  assert.equal(validRes.gitCommitVerified, true);
  assert.equal(validRes.singleTaskExecutionVerified, true);
});
