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
