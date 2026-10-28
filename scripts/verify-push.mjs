#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolveNodePackageCli } from "../dist/src/core/process.js";

// Keep the upstream integration mandatory locally, as in ci.yml.
const npm = resolveNodePackageCli("npm");
for (const args of [["run", "check"], ["test"], ["run", "build:check"], ["pack", "--dry-run" ]]) {
  const result = spawnSync(npm.executable, [...npm.argsPrefix, ...args], {
    stdio: "inherit", windowsHide: true,
    env: { ...process.env, ALPHA_AOS_REQUIRE_UPSTREAM_MCP: "1" },
  });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
