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
function run(executable, args, environment = {}) {
  const result = spawnSync(executable, args, {
    stdio: "inherit", windowsHide: true,
    env: {
      ...process.env, ...environment,
      ALPHA_AOS_STATE_DIR: join(scratch, "state"),
      ALPHA_AOS_REQUIRE_UPSTREAM_MCP: "1",
    },
  });
  if (result.error || result.status !== 0) throw new Error(`Push verification failed (exit ${result.status}): ${args.join(" ")}`);
}
try {
  run(npm.executable, [...npm.argsPrefix, "run", "check"]);
  run(npm.executable, [...npm.argsPrefix, "pack", "--pack-destination", scratch]);
  run(process.execPath, ["scripts/audit-tarball.mjs", tarball]);
  run(npm.executable, [...npm.argsPrefix, "test"], { ALPHA_AOS_RELEASE_TARBALL: tarball });
  run(process.execPath, ["scripts/run-tests.mjs", "--files", "dist/test/ecc-upstream.integration.js"]);
  for (const check of ["policy", "audit", "integration", "research"]) {
    run(process.execPath, ["scripts/verify-computer-use.mjs", JSON.stringify({ check })]);
  }
  run(npm.executable, [...npm.argsPrefix, "run", "build:check"]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
