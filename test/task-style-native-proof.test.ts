import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import { gitCommand } from "./helpers/git-fixture.js";

const verifierScript = join(packageRoot(), "scripts", "verify-task-style-native.mjs");

function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

test("verify-task-style-native: missing observation bindings cannot manufacture native verification", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-native-binding-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = JSON.stringify({ invocation: "native" });
  const result = JSON.stringify({ outcome: "passed" });
  await writeFile(join(root, "source.json"), source);
  await writeFile(join(root, "result.json"), result);
  const complete: Record<string, unknown> = {
    route: "conversational-quick", evidenceTier: "native", provenance: "native", harness: "codex", projectRoot: root,
    sourceLocator: "source.json", sourceSha256: sha256(source), resultLocator: "result.json", resultSha256: sha256(result),
  };
  for (const field of ["sourceLocator", "sourceSha256", "resultLocator", "resultSha256", "harness", "provenance"]) {
    const row = { ...complete };
    delete row[field];
    const path = join(root, "index.json");
    await writeFile(path, JSON.stringify({ schemaVersion: 1, routes: [row] }));
    const run = spawnSync(process.execPath, [verifierScript, "--index", path, "--json"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
    assert.equal(run.status, 0, run.stderr);
    const proof = JSON.parse(run.stdout);
    assert.equal(proof.routes["conversational-quick"].status, "blocked", field);
    assert.equal(proof.valid, false, field);
  }
});

test("verify-task-style-native: boundary validations on index file (D-21, D-24)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-native-proof-test-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  // 1. Missing index file
  const missingRun = spawnSync(process.execPath, [verifierScript, "--index", join(baseTemp, "missing.json"), "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(missingRun.status, 0);
  const missingOut = JSON.parse(missingRun.stdout);
  assert.equal(missingOut.valid, false);
  assert.equal(missingOut.code, "INDEX_NOT_FOUND");

  // 2. Index file exceeding 64 KiB
  const oversizedPath = join(baseTemp, "oversized.json");
  await writeFile(oversizedPath, "x".repeat(65537), "utf8");
  const overRun = spawnSync(process.execPath, [verifierScript, "--index", oversizedPath, "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(overRun.status, 0);
  const overOut = JSON.parse(overRun.stdout);
  assert.equal(overOut.valid, false);
  assert.equal(overOut.code, "INDEX_TOO_LARGE");

  // 3. Invalid schema version
  const badSchemaPath = join(baseTemp, "bad-schema.json");
  await writeFile(badSchemaPath, JSON.stringify({ schemaVersion: 2, routes: [] }), "utf8");
  const badSchemaRun = spawnSync(process.execPath, [verifierScript, "--index", badSchemaPath, "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(badSchemaRun.status, 0);
  const badSchemaOut = JSON.parse(badSchemaRun.stdout);
  assert.equal(badSchemaOut.code, "INVALID_SCHEMA_VERSION");

  // 4. Exceeding 64 entries
  const tooManyPath = join(baseTemp, "too-many.json");
  const excessiveRoutes = Array.from({ length: 65 }, (_, idx) => ({
    route: "conversational-quick",
    evidenceTier: "native",
  }));
  await writeFile(tooManyPath, JSON.stringify({ schemaVersion: 1, routes: excessiveRoutes }), "utf8");
  const tooManyRun = spawnSync(process.execPath, [verifierScript, "--index", tooManyPath, "--json"], {
    encoding: "utf8",
  });
  assert.notEqual(tooManyRun.status, 0);
  const tooManyOut = JSON.parse(tooManyRun.stdout);
  assert.equal(tooManyOut.code, "TOO_MANY_ENTRIES");
});

test("verify-task-style-native: rejects fixture tier and native-label spoofing (D-21, D-22)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-tier-test-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  // 1. Explicit fixture tier rejected for native verification
  const fixtureTierPath = join(baseTemp, "fixture-tier.json");
  await writeFile(
    fixtureTierPath,
    JSON.stringify({
      schemaVersion: 1,
      routes: [
        {
          route: "conversational-quick",
          evidenceTier: "fixture",
          projectRoot: baseTemp,
        },
      ],
    }),
    "utf8",
  );
  const fixtureRun = spawnSync(process.execPath, [verifierScript, "--index", fixtureTierPath, "--json"], {
    encoding: "utf8",
  });
  assert.equal(fixtureRun.status, 0); // Exits 0 but reports invalid/blocked route
  const fixtureOut = JSON.parse(fixtureRun.stdout);
  assert.equal(fixtureOut.valid, false);
  assert.equal(fixtureOut.routes["conversational-quick"].status, "blocked");
  assert.ok(fixtureOut.routes["conversational-quick"].reason.includes("Fixture-tier evidence cannot satisfy native proof"));

  // 2. Native-label spoofing: evidenceTier claimed as "native" but provenance indicates fixture
  const spoofedPath = join(baseTemp, "spoofed.json");
  await writeFile(
    spoofedPath,
    JSON.stringify({
      schemaVersion: 1,
      routes: [
        {
          route: "autopilot-quick",
          evidenceTier: "native",
          provenance: "fixture",
          projectRoot: baseTemp,
        },
      ],
    }),
    "utf8",
  );
  const spoofRun = spawnSync(process.execPath, [verifierScript, "--index", spoofedPath, "--json"], {
    encoding: "utf8",
  });
  assert.equal(spoofRun.status, 0);
  const spoofOut = JSON.parse(spoofRun.stdout);
  assert.equal(spoofOut.valid, false);
  assert.equal(spoofOut.routes["autopilot-quick"].status, "blocked");
  assert.ok(spoofOut.routes["autopilot-quick"].reason.includes("Native-label spoofing detected"));
});

test("verify-task-style-native: validates actual files, git commits, and stage completeness (D-21, D-22, D-24)", async (context) => {
  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-full-verify-test-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  // Initialize git repo in projectRoot
  const projectRoot = join(baseTemp, "project");
  await mkdir(projectRoot, { recursive: true });
  await gitCommand(projectRoot, ["init"]);
  await gitCommand(projectRoot, ["config", "user.name", "alpha-AOS Test"]);
  await gitCommand(projectRoot, ["config", "user.email", "test@alpha-aos.dev"]);

  // Create tracked files
  const testFile = join(projectRoot, "test.txt");
  await writeFile(testFile, "hello world\n", "utf8");
  await gitCommand(projectRoot, ["add", "test.txt"]);
  await gitCommand(projectRoot, ["commit", "-m", "initial commit"]);
  const commitSha = (await gitCommand(projectRoot, ["rev-parse", "HEAD"])).stdout.trim();

  // Create source and result observations
  const obsDir = join(projectRoot, ".planning", "observations");
  await mkdir(obsDir, { recursive: true });
  const srcFile = join(obsDir, "source.json");
  const resFile = join(obsDir, "result.json");
  await writeFile(srcFile, JSON.stringify({ invocation: "native" }), "utf8");
  await writeFile(resFile, JSON.stringify({ outcome: "passed" }), "utf8");

  const srcSha = sha256(await import("node:fs").then((fs) => fs.readFileSync(srcFile)));
  const resSha = sha256(await import("node:fs").then((fs) => fs.readFileSync(resFile)));

  // 1. Full quality route with missing mandatory stage
  const incompleteFullPath = join(baseTemp, "incomplete-full.json");
  await writeFile(
    incompleteFullPath,
    JSON.stringify({
      schemaVersion: 1,
      routes: [
        {
          route: "conversational-quick-full",
          evidenceTier: "native",
          provenance: "native",
          harness: "codex",
          projectRoot,
          sourceLocator: ".planning/observations/source.json",
          sourceSha256: srcSha,
          resultLocator: ".planning/observations/result.json",
          resultSha256: resSha,
          stageReceipts: [
            { stage: "discussion", outcome: "passed" },
            { stage: "research", outcome: "passed" },
            // Missing planning, plan-check, implementation, verification, state-docs
          ],
        },
      ],
    }),
    "utf8",
  );
  const incRun = spawnSync(process.execPath, [verifierScript, "--index", incompleteFullPath, "--json"], {
    encoding: "utf8",
  });
  const incOut = JSON.parse(incRun.stdout);
  assert.equal(incOut.valid, false);
  assert.equal(incOut.routes["conversational-quick-full"].status, "blocked");
  assert.ok(incOut.routes["conversational-quick-full"].issues.some((i: string) => i.includes("Missing mandatory full stage receipt")));

  // 2. Hash mismatch on source observation
  const hashMismatchPath = join(baseTemp, "hash-mismatch.json");
  await writeFile(
    hashMismatchPath,
    JSON.stringify({
      schemaVersion: 1,
      routes: [
        {
          route: "conversational-quick",
          evidenceTier: "native",
          provenance: "native",
          harness: "codex",
          projectRoot,
          sourceLocator: ".planning/observations/source.json",
          sourceSha256: "0".repeat(64), // Wrong hash!
        },
      ],
    }),
    "utf8",
  );
  const mismatchRun = spawnSync(process.execPath, [verifierScript, "--index", hashMismatchPath, "--json"], {
    encoding: "utf8",
  });
  const mismatchOut = JSON.parse(mismatchRun.stdout);
  assert.equal(mismatchOut.valid, false);
  assert.equal(mismatchOut.routes["conversational-quick"].status, "blocked");
  assert.ok(mismatchOut.routes["conversational-quick"].reason.includes("Source SHA-256 mismatch"));

  // 3. Valid native evidence across routes
  const validIndexPath = join(baseTemp, "valid-index.json");
  const allStages = [
    "discussion",
    "research",
    "planning",
    "plan-check",
    "implementation",
    "verification",
    "state-docs",
  ].map((s) => ({ stage: s, outcome: "passed" }));

  await writeFile(
    validIndexPath,
    JSON.stringify({
      schemaVersion: 1,
      routes: [
        {
          route: "conversational-quick",
          evidenceTier: "native",
          provenance: "native",
          harness: "codex",
          projectRoot,
          sourceLocator: ".planning/observations/source.json",
          sourceSha256: srcSha,
          resultLocator: ".planning/observations/result.json",
          resultSha256: resSha,
          gitEvidence: { commitSha },
        },
        {
          route: "conversational-quick-full",
          evidenceTier: "native",
          provenance: "native",
          harness: "codex",
          projectRoot,
          sourceLocator: ".planning/observations/source.json",
          sourceSha256: srcSha,
          resultLocator: ".planning/observations/result.json",
          resultSha256: resSha,
          gitEvidence: { commitSha },
          stageReceipts: allStages,
        },
        {
          route: "conversational-phase",
          status: "unverified",
          reason: "Awaiting plan 08 native execution",
        },
        {
          route: "autopilot-quick",
          status: "unverified",
          reason: "Awaiting plan 08 native execution",
        },
        {
          route: "autopilot-quick-full",
          status: "unverified",
          reason: "Awaiting plan 08 native execution",
        },
        {
          route: "autopilot-phase",
          status: "unverified",
          reason: "Awaiting plan 08 native execution",
        },
      ],
    }),
    "utf8",
  );

  const validRun = spawnSync(process.execPath, [verifierScript, "--index", validIndexPath, "--json"], {
    encoding: "utf8",
  });
  assert.equal(validRun.status, 0);
  const validOut = JSON.parse(validRun.stdout);
  assert.equal(validOut.valid, true);
  assert.equal(validOut.allVerified, false); // Not all verified because 4 are unverified
  assert.equal(validOut.routes["conversational-quick"].status, "verified");
  assert.equal(validOut.routes["conversational-quick-full"].status, "verified");
  assert.equal(validOut.routes["conversational-phase"].status, "unverified");
});
