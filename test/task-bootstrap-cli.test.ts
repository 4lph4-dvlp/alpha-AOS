import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
