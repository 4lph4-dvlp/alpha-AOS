#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveNodePackageCli } from "../dist/src/core/process.js";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Keep the upstream integration mandatory locally, as in ci.yml.
const npm = resolveNodePackageCli("npm");
const scratch = mkdtempSync(join(tmpdir(), "alpha-aos-push-"));
const version = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
const tarball = join(scratch, `alpha-aos-${version}.tgz`);
function run(name, executable, args, environment = {}) {
  const startedAt = Date.now();
  const result = spawnSync(executable, args, {
    stdio: "inherit", windowsHide: true,
    env: {
      ...process.env, ...environment,
      ALPHA_AOS_STATE_DIR: join(scratch, "state"),
      ALPHA_AOS_REQUIRE_UPSTREAM_MCP: "1",
    },
  });
  console.log(`PUSH_GATE_RECEIPT ${JSON.stringify({ name, command: [executable, ...args].join(" "), exitCode: result.status, durationMs: Date.now() - startedAt })}`);
  if (result.error || result.status !== 0) throw new Error(`Push verification failed (exit ${result.status}): ${args.join(" ")}`);
}
try {
  console.log(`PUSH_GATE_STARTED ${JSON.stringify({ platform: `${process.platform}/${process.arch}`, node: process.version, startedAt: new Date().toISOString() })}`);
  run("check", npm.executable, [...npm.argsPrefix, "run", "check"]);
  run("build", npm.executable, [...npm.argsPrefix, "run", "build"]);
  run("targeted", process.execPath, ["scripts/run-tests.mjs", "--files", "dist/test/task-entry-cross-harness.test.js", "dist/test/task-entry-proof.test.js", "dist/test/task-entry-docs.test.js"]);
  run("pack", npm.executable, [...npm.argsPrefix, "pack", "--pack-destination", scratch]);
  run("audit", process.execPath, ["scripts/audit-tarball.mjs", tarball]);
  run("full", npm.executable, [...npm.argsPrefix, "test"], { ALPHA_AOS_RELEASE_TARBALL: tarball });
  run("build-check", npm.executable, [...npm.argsPrefix, "run", "build:check"]);
  run("style-proof", process.execPath, ["scripts/verify-task-style-native.mjs", "--index", "docs/task-style-proof-index.json", "--json"]);
  run("entry-proof", process.execPath, ["scripts/verify-task-entry-proof.mjs", "--index", "docs/task-entry-proof-index.json", "--json"]);
  run("upstream-ecc", process.execPath, ["scripts/run-tests.mjs", "--files", "dist/test/ecc-upstream.integration.js"]);
  for (const check of ["policy", "audit", "integration", "research"]) {
    run(`computer-use-${check}`, process.execPath, ["scripts/verify-computer-use.mjs", JSON.stringify({ check })]);
  }
  run("final-build-check", npm.executable, [...npm.argsPrefix, "run", "build:check"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
