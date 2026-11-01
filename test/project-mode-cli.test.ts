import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  createIsolatedSandbox,
  fingerprintManifest,
} from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");

test("query on uninitialized standalone directory returns strict with missing revision and leaves project/home/state untouched (MODE-01, MODE-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const standaloneDir = join(sandbox.home, "my-standalone-project");
  await mkdir(standaloneDir, { recursive: true });

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(standaloneDir);

  // 1. Text mode query running inside standalone directory
  const textQuery = spawnSync(process.execPath, [cliPath, "project", "mode"], {
    cwd: standaloneDir,
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(textQuery.status, 0, `text query failed: ${textQuery.stderr}`);
  assert.match(textQuery.stdout, /Effective mode: strict/u);
  assert.match(textQuery.stdout, /Source: builtin-default/u);
  assert.match(textQuery.stdout, /Revision: missing/u);
  assert.match(textQuery.stdout, /Policy exists: false/u);
  assert.match(textQuery.stdout, /Root reason: standalone-directory/u);

  // 2. JSON mode query with explicit path argument
  const jsonQuery = spawnSync(process.execPath, [cliPath, "project", "mode", standaloneDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(jsonQuery.status, 0, `json query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);
  assert.equal(parsed.effectiveMode, "strict");
  assert.equal(parsed.source, "builtin-default");
  assert.equal(parsed.revision, "missing");
  assert.equal(parsed.exists, false);
  assert.equal(parsed.rootReason, "explicit-override");
  assert.equal(typeof parsed.canonicalRoot, "string");
  assert.equal(typeof parsed.projectId, "string");
  assert.equal(typeof parsed.policyPath, "string");

  // Zero-write verification across all three roots
  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(standaloneDir);

  assert.equal(homeBefore.digest, homeAfter.digest, "sandbox home must be untouched");
  assert.equal(stateBefore.digest, stateAfter.digest, "sandbox state must be untouched");
  assert.equal(projectBefore.digest, projectAfter.digest, "project directory must be untouched");
});

test("query on valid flexible policy reports exact bytes SHA-256 and leaves all trees untouched (MODE-01, MODE-03)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "flexible-project");
  const alphaAosDir = join(projectDir, ".alpha-aos");
  await mkdir(alphaAosDir, { recursive: true });

  const rawBytes = '{\n  "schemaVersion": 1,\n  "mode": "flexible"\n}\n';
  const expectedHash = createHash("sha256").update(rawBytes, "utf8").digest("hex");
  await writeFile(join(alphaAosDir, "behavior.json"), rawBytes, "utf8");

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  const jsonQuery = spawnSync(process.execPath, [cliPath, "project", "mode", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(jsonQuery.status, 0, `query failed: ${jsonQuery.stderr}`);
  const parsed = JSON.parse(jsonQuery.stdout);
  assert.equal(parsed.effectiveMode, "flexible");
  assert.equal(parsed.source, "project-policy");
  assert.equal(parsed.revision, expectedHash);
  assert.equal(parsed.exists, true);

  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);

  assert.equal(homeBefore.digest, homeAfter.digest);
  assert.equal(stateBefore.digest, stateAfter.digest);
  assert.equal(projectBefore.digest, projectAfter.digest);
});

test("CLI query rejects mutation flags and surplus operands (MODE-01, MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);

  const applyRes = spawnSync(process.execPath, [cliPath, "project", "mode", "--apply"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(applyRes.status, 0);
  assert.match(applyRes.stderr, /--apply/u);

  const digestRes = spawnSync(process.execPath, [cliPath, "project", "mode", "--plan-digest", "abc123"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(digestRes.status, 0);

  const surplusRes = spawnSync(process.execPath, [cliPath, "project", "mode", "path1", "path2"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(surplusRes.status, 0);
});

test("CLI project mode set previews exact plan with zero writes and rejects invalid syntax (MODE-03, MODE-04, MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "preview-project");
  await mkdir(projectDir, { recursive: true });

  const homeBefore = await fingerprintManifest(sandbox.home);
  const stateBefore = await fingerprintManifest(sandbox.state);
  const projectBefore = await fingerprintManifest(projectDir);

  // 1. Preview set strict on missing -> create plan
  const textPlan = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "strict", projectDir], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(textPlan.status, 0, `preview text failed: ${textPlan.stderr}`);
  assert.match(textPlan.stdout, /Planned change: create/u);
  assert.match(textPlan.stdout, /Plan digest: [0-9a-f]{64}/u);
  assert.match(textPlan.stdout, /Coordinator path:/u);
  assert.match(textPlan.stdout, /Preview only\. Nothing was written/u);

  // 2. JSON preview set flexible on missing -> create plan
  const jsonPlan = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(jsonPlan.status, 0, `preview json failed: ${jsonPlan.stderr}`);
  const parsed = JSON.parse(jsonPlan.stdout);
  assert.equal(parsed.change, "create");
  assert.equal(parsed.requestedMode, "flexible");
  assert.equal(parsed.currentRevision, "missing");
  assert.equal(parsed.currentExists, false);
  assert.equal(typeof parsed.planDigest, "string");
  assert.equal(typeof parsed.rootIdentity.deviceExact, "string");
  assert.equal(typeof parsed.rootIdentity.inodeExact, "string");

  // Zero-write verification: preview modified absolutely nothing
  const homeAfter = await fingerprintManifest(sandbox.home);
  const stateAfter = await fingerprintManifest(sandbox.state);
  const projectAfter = await fingerprintManifest(projectDir);
  assert.equal(homeBefore.digest, homeAfter.digest);
  assert.equal(stateBefore.digest, stateAfter.digest);
  assert.equal(projectBefore.digest, projectAfter.digest);

  // 3. Syntax rejections:
  // Missing mode
  const noModeRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(noModeRes.status, 0);

  // Invalid mode
  const badModeRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "invalid", projectDir], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(badModeRes.status, 0);

  // Unknown flag
  const badFlagRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "strict", projectDir, "--unknown-flag"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(badFlagRes.status, 0);

  // Duplicate --plan-digest
  const dupDigestRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "strict", projectDir, "--plan-digest", "abc", "--plan-digest", "def"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(dupDigestRes.status, 0);

  // --apply without --plan-digest is refused
  const applyNoDigestRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "strict", projectDir, "--apply"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(applyNoDigestRes.status, 0);
  assert.match(applyNoDigestRes.stderr, /requires the digest that was reviewed/u);
});

test("CLI project mode set --apply executes real change with exact digest and common rollback restores state (MODE-04, MODE-05)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "apply-project");
  await mkdir(projectDir, { recursive: true });

  // 1. Preview to get plan digest for missing -> flexible
  const preview = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(preview.status, 0, `preview failed: ${preview.stderr}`);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.change, "create");
  const digest = plan.planDigest;

  // 2. Stale digest refusal
  const badApply = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", "0000000000000000000000000000000000000000000000000000000000000000"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.notEqual(badApply.status, 0);
  assert.match(badApply.stderr, /stale-plan|plan digest does not match/u);

  // 3. Successful apply with reviewed digest
  const applyRes = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", digest, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(applyRes.status, 0, `apply failed: ${applyRes.stderr}`);
  const result = JSON.parse(applyRes.stdout);
  assert.equal(result.change, "created");
  assert.equal(result.mode, "flexible");
  assert.equal(typeof result.operationId, "string");
  assert.ok(result.operationId.length > 0);

  const policyFile = join(projectDir, ".alpha-aos", "behavior.json");
  assert.equal(existsSync(policyFile), true);

  // 4. Same-mode apply is a strict no-op with null operationId and zero byte modifications
  const noOpPreview = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(noOpPreview.status, 0);
  const noOpPlan = JSON.parse(noOpPreview.stdout);
  assert.equal(noOpPlan.change, "current");

  const homeBeforeNoOp = await fingerprintManifest(sandbox.home);
  const stateBeforeNoOp = await fingerprintManifest(sandbox.state);

  const noOpApply = spawnSync(process.execPath, [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", noOpPlan.planDigest, "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(noOpApply.status, 0);
  const noOpResult = JSON.parse(noOpApply.stdout);
  assert.equal(noOpResult.change, "current");
  assert.equal(noOpResult.operationId, null);

  const homeAfterNoOp = await fingerprintManifest(sandbox.home);
  const stateAfterNoOp = await fingerprintManifest(sandbox.state);
  assert.equal(homeBeforeNoOp.digest, homeAfterNoOp.digest, "no-op must write zero bytes in home");
  assert.equal(stateBeforeNoOp.digest, stateAfterNoOp.digest, "no-op must write zero journals or locks in state");

  // 5. Common CLI rollback restores initial missing state
  const rollbackRes = spawnSync(process.execPath, [cliPath, "rollback", result.operationId, "--apply", "--json"], {
    env: sandbox.env,
    encoding: "utf8",
  });
  assert.equal(rollbackRes.status, 0, `rollback failed: ${rollbackRes.stderr}`);
  assert.equal(existsSync(policyFile), false, "policy file must be removed after rollback");
});
