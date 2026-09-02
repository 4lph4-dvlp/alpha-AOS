import assert from "node:assert/strict";
import test from "node:test";
import { hasVersionChanges } from "../src/core/update.js";
import type { StackLock } from "../src/types.js";

function lock(gsdVersion: string, contextVersion: string): StackLock {
  return {
    schemaVersion: 1,
    channel: "stable",
    generatedAt: null,
    components: {
      gsd: { package: "@opengsd/gsd-core", version: gsdVersion, integrity: "sha512-gsd", profile: "standard" },
      ecc: { package: "ecc-universal", version: "2.2.0", integrity: "sha512-ecc", skills: [], sourceSha256: {}, targetSha256: {} },
      mcp: { context7: { package: "context7", version: contextVersion, integrity: "sha512-context" } },
      mcpBridges: { pi: { package: "bridge", version: "1.0.0", integrity: "sha512-bridge" } },
    },
  };
}

test("candidate staging ignores timestamps and detects component version changes", () => {
  const current = lock("1.12.0", "4.0.4");
  const same = { ...lock("1.12.0", "4.0.4"), channel: "candidate" as const, generatedAt: new Date().toISOString() };
  assert.equal(hasVersionChanges(current, same), false);
  assert.equal(hasVersionChanges(current, lock("1.13.0", "4.0.4")), true);
  assert.equal(hasVersionChanges(current, lock("1.12.0", "4.1.0")), true);
});
