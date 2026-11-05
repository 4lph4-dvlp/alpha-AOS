#!/usr/bin/env node
// Optional local readiness check. Git pushes do not invoke this script.
import { spawnSync } from "node:child_process";
import { resolveNodePackageCli } from "../dist/src/core/process.js";
const npm = resolveNodePackageCli("npm");
for (const [executable, args] of [
  [npm.executable, [...npm.argsPrefix, "run", "build"]],
  [process.execPath, ["dist/src/cli.js", "--help"]],
]) {
  const result = spawnSync(executable, args, { stdio: "inherit", windowsHide: true });
  if (result.error || result.status !== 0) {
    console.error(result.error?.message ?? "Local readiness check failed.");
    process.exit(result.status ?? 1);
  }
}
