import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("task readiness CLI tracer: rejects --apply, rejects operands, distinguishes diagnostic classes, zero writes (BOOT-01, D-01, D-02)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "tracer-project");
  await mkdir(projectDir, { recursive: true });

  const inputPayload = {
    schemaVersion: 1,
    controller: "hermes",
    workflow: "quick",
    projectRoot: projectDir,
  };
  const inputPath = join(projectDir, "readiness-request.json");
  await writeFile(inputPath, JSON.stringify(inputPayload, null, 2), "utf8");

  // 1. Verify --apply rejection
  const applyAttempt = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", inputPath, "--apply"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(applyAttempt.status, 0);
  assert.match(applyAttempt.stderr, /`task readiness` has no --apply/u);

  // 2. Verify positional operands rejection
  const operandAttempt = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "unexpected-arg", "--input", inputPath],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(operandAttempt.status, 0);
  assert.match(operandAttempt.stderr, /does not accept positional operands/u);

  // 3. Verify missing --input rejection
  const missingInputAttempt = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(missingInputAttempt.status, 0);
  assert.match(missingInputAttempt.stderr, /requires --input/u);

  // Take baseline AFTER creating input files to verify zero writes from readiness inspection
  const claudePayload = {
    schemaVersion: 1,
    controller: "claude",
    workflow: "quick",
    projectRoot: projectDir,
  };
  const claudeInputPath = join(projectDir, "claude-request.json");
  await writeFile(claudeInputPath, JSON.stringify(claudePayload, null, 2), "utf8");

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  // 4. Text mode query running in project directory
  const textQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", inputPath],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(textQuery.status, 0, `text readiness query failed: ${textQuery.stderr}`);
  assert.match(textQuery.stdout, /Controller: hermes/u);
  assert.match(textQuery.stdout, /Diagnosis: unsupported/u);
  assert.match(textQuery.stdout, /Ready: false/u);
  assert.match(textQuery.stdout, /Execution authorized: false/u);
  assert.match(textQuery.stdout, /Hermes controller is unsupported/u);

  // 5. JSON mode query
  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", inputPath, "--json"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(jsonQuery.status, 0, `json readiness query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.controller, "hermes");
  assert.equal(parsed.workflow, "quick");
  assert.equal(parsed.diagnosis, "unsupported");
  assert.equal(parsed.ready, false);
  assert.equal(parsed.executionAuthorized, false);

  // 6. Missing runtime diagnosis via CLI (e.g. controller without gsd-tools)
  const claudeEnv = {
    ...sandbox.env,
    CLAUDE_CONFIG_DIR: join(sandbox.home, "empty-claude-dir"),
  };
  const claudeQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "readiness", "--input", claudeInputPath, "--json"],
    {
      cwd: projectDir,
      env: claudeEnv,
      encoding: "utf8",
    },
  );
  assert.equal(claudeQuery.status, 0, `claude readiness query failed: ${claudeQuery.stderr}`);
  const parsedClaude = JSON.parse(claudeQuery.stdout);
  assert.equal(parsedClaude.diagnosis, "missing-runtime");
  assert.equal(parsedClaude.ready, false);

  // 7. Verify zero writes across home, state, and project (D-01, D-02)
  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);

  assert.equal(homeBefore.digest, homeAfter.digest, "sandbox home must have zero writes from readiness inspection");
  assert.equal(stateBefore.digest, stateAfter.digest, "sandbox state must have zero writes from readiness inspection");
  assert.equal(projectBefore.digest, projectAfter.digest, "sandbox project must have zero writes from readiness inspection");
});

test("task bootstrap CLI tracer: prepare preview, positional operand rejection, missing input rejection (BOOT-02)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "bootstrap-cli-project");
  await mkdir(projectDir, { recursive: true });

  const packet = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "hermes",
    workflow: "quick",
    projectRoot: projectDir,
    request: {
      text: "Implement OAuth2 login provider",
      shortGoal: "OAuth login",
    },
  };
  const packetPath = join(projectDir, "bootstrap-packet.json");
  await writeFile(packetPath, JSON.stringify(packet, null, 2), "utf8");

  // 1. Positional operands rejection
  const operandAttempt = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "spurious-arg", "--input", packetPath],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(operandAttempt.status, 0);
  assert.match(operandAttempt.stderr, /does not accept positional operands/u);

  // 2. Missing --input rejection
  const missingAttempt = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.notEqual(missingAttempt.status, 0);
  assert.match(missingAttempt.stderr, /requires --input/u);

  // 3. Prepare preview in text mode
  const textQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", packetPath],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(textQuery.status, 0, `text bootstrap query failed: ${textQuery.stderr}`);
  assert.match(textQuery.stdout, /Operation: prepare/u);
  assert.match(textQuery.stdout, /Applied: false/u);

  // 4. Prepare preview in JSON mode
  const jsonQuery = spawnSync(
    process.execPath,
    [cliPath, "task", "bootstrap", "--input", packetPath, "--json"],
    {
      cwd: projectDir,
      env: sandbox.env,
      encoding: "utf8",
    },
  );
  assert.equal(jsonQuery.status, 0, `json bootstrap query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.operation, "prepare");
  assert.equal(parsed.applied, false);
});

test("task bootstrap CLI: supports claim, link, and acknowledge operations through --input (BOOT-04)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "bootstrap-ops-project");
  await mkdir(join(projectDir, ".planning"), { recursive: true });
  await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Ops Project\n", "utf8");

  // Mock gsd runtime
  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(fakeGsdTools, "console.log(JSON.stringify({ packageName: '@opengsd/gsd-core', version: '1.18.0', planning_exists: true, init_incomplete: false, project_exists: true, requirements_exists: true, roadmap_exists: true, state_exists: true, agents_installed: true, project_root: process.cwd() }));", "utf8");

  const env = {
    ...sandbox.env,
    CODEX_HOME: sandbox.home,
  };

  // 1. Prepare apply
  const prepPacket = {
    schemaVersion: 1,
    operation: "prepare",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-cli-ops",
    projectRoot: projectDir,
    request: { text: "Add webhook route" },
  };
  const prepPath = join(projectDir, "prep.json");
  await writeFile(prepPath, JSON.stringify(prepPacket, null, 2), "utf8");

  const previewRes = spawnSync(process.execPath, [cliPath, "task", "bootstrap", "--input", prepPath, "--json"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(previewRes.status, 0);
  const previewJson = JSON.parse(previewRes.stdout);
  assert.ok(previewJson.planDigest);

  const applyRes = spawnSync(process.execPath, [cliPath, "task", "bootstrap", "--input", prepPath, "--plan-digest", previewJson.planDigest, "--apply", "--json"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(applyRes.status, 0);

  // 2. Claim
  const claimPacket = {
    schemaVersion: 1,
    operation: "claim",
    controller: "codex",
    workflow: "quick",
    pendingId: "pending-cli-ops",
    projectRoot: projectDir,
    claimNonce: "cli-claim-nonce",
  };
  const claimPath = join(projectDir, "claim.json");
  await writeFile(claimPath, JSON.stringify(claimPacket, null, 2), "utf8");

  const claimRes = spawnSync(process.execPath, [cliPath, "task", "bootstrap", "--input", claimPath, "--json"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(claimRes.status, 0, claimRes.stderr);
  const claimJson = JSON.parse(claimRes.stdout);
  assert.equal(claimJson.operation, "claim");
  assert.equal(claimJson.status, "claimed");
  assert.equal(claimJson.dispatchAuthorized, true);

  // 3. Link
  const linkPacket = {
    schemaVersion: 1,
    operation: "link",
    pendingId: "pending-cli-ops",
    projectRoot: projectDir,
    nativeReference: { kind: "quick", id: "task-01" },
  };
  const linkPath = join(projectDir, "link.json");
  await writeFile(linkPath, JSON.stringify(linkPacket, null, 2), "utf8");

  const linkRes = spawnSync(process.execPath, [cliPath, "task", "bootstrap", "--input", linkPath, "--json"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(linkRes.status, 0, linkRes.stderr);
  const linkJson = JSON.parse(linkRes.stdout);
  assert.equal(linkJson.operation, "link");
  assert.equal(linkJson.status, "linked");

  // 4. Acknowledge
  const ackPacket = {
    schemaVersion: 1,
    operation: "acknowledge",
    pendingId: "pending-cli-ops",
    projectRoot: projectDir,
    deliveryReceipt: { receiptSha256: "a".repeat(64) },
  };
  const ackPath = join(projectDir, "ack.json");
  await writeFile(ackPath, JSON.stringify(ackPacket, null, 2), "utf8");

  const ackRes = spawnSync(process.execPath, [cliPath, "task", "bootstrap", "--input", ackPath, "--json"], { cwd: projectDir, env, encoding: "utf8" });
  assert.equal(ackRes.status, 0, ackRes.stderr);
  const ackJson = JSON.parse(ackRes.stdout);
  assert.equal(ackJson.operation, "acknowledge");
  assert.equal(ackJson.status, "acknowledged");
});
