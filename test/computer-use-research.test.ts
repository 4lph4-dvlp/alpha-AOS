import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { packageRoot } from "../src/core/paths.js";

test("research verifier validates six candidates and real provider receipts", () => {
  const result = spawnSync(process.execPath, [join(packageRoot(), "scripts/verify-computer-use.mjs"), JSON.stringify({ check: "research" })], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { ok: true, check: "research" });
});
