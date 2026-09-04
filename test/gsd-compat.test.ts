import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyCodexGsdHookCompatibility, planCodexGsdHookCompatibility, smokeTestCodexGsdStopHook } from "../src/core/gsd-compat.js";
import type { StackLock } from "../src/types.js";

test("Codex GSD compatibility installs missing helper closure and smoke-tests Stop", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-gsd-compat-test-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const configRoot = join(root, "config");
  const sourceRoot = join(root, "source");
  const stateRoot = join(root, "state");
  await mkdir(join(configRoot, "hooks"), { recursive: true });
  await mkdir(sourceRoot, { recursive: true });
  await writeFile(join(configRoot, "hooks", "gsd-context-monitor.js"), [
    "const { allow } = require('./lib/hook-exit.js');",
    "process.stdin.resume();",
    "process.stdin.on('end', () => allow(undefined));",
    "",
  ].join("\n"));
  await writeFile(join(sourceRoot, "hook-exit.js"), "const { terminateNow } = require('./cli-exit.js');\nmodule.exports = { allow: (value) => terminateNow(value) };\n");
  await writeFile(join(sourceRoot, "cli-exit.js"), "require('./exit-code-registry.js');\nmodule.exports = { terminateNow: () => process.exit(0) };\n");
  await writeFile(join(sourceRoot, "exit-code-registry.js"), "module.exports = {};\n");
  const lock: StackLock = {
    schemaVersion: 1,
    channel: "stable",
    generatedAt: null,
    components: { gsd: { package: "@opengsd/gsd-core", version: "1.12.0", integrity: "sha512-fixture", profile: "standard" } },
  };

  const before = await planCodexGsdHookCompatibility(configRoot);
  assert.equal(before.required, true);
  assert.equal(before.entries.every((entry) => entry.action === "create"), true);
  const result = await applyCodexGsdHookCompatibility(lock, { configRoot, stateRoot, verifiedSourceRoot: sourceRoot });
  assert.ok(result.operationId);
  assert.equal((await smokeTestCodexGsdStopHook(configRoot)).ok, true);
  const after = await planCodexGsdHookCompatibility(configRoot);
  assert.equal(after.entries.every((entry) => entry.action === "verify"), true);
});
