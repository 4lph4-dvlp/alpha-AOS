import assert from "node:assert/strict";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { runDoctor } from "../src/core/doctor.js";
import { packageRoot } from "../src/core/paths.js";
import type { Inventory } from "../src/types.js";

test("doctor treats missing optional harness commands as warnings", async () => {
  const inventory: Inventory = {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: "v24.0.0", command: "node" },
      npm: { version: "10.0.0", command: "npm" },
      git: { version: "2.0.0", command: "git" },
    },
    harnesses: [
      { id: "claude", displayName: "Claude Code", command: "claude", version: "1", configRoots: [], detected: true, notes: [] },
      { id: "codex", displayName: "Codex", command: null, version: null, configRoots: [], detected: false, notes: [] },
      { id: "antigravity", displayName: "Antigravity", command: null, version: null, configRoots: [], detected: false, notes: [] },
      { id: "pi", displayName: "Pi", command: null, version: null, configRoots: [], detected: false, notes: [] },
      { id: "hermes", displayName: "Hermes", command: null, version: null, configRoots: [], detected: false, notes: [] },
    ],
  };
  const root = packageRoot();
  const findings = runDoctor(await loadCatalog(root), await loadLock(root), inventory);
  assert.equal(findings.some((finding) => finding.level === "error"), false);
  assert.equal(findings.find((finding) => finding.code === "harness.codex")?.level, "warning");
});
