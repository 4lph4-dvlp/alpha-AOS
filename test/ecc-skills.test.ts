import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadLock } from "../src/core/catalog.js";
import { globalEccSkillRoot, planEccSkillSync } from "../src/core/ecc-skills.js";
import { packageRoot } from "../src/core/paths.js";

test("ECC exact-file sync plans exactly three locked writes", async (context) => {
  const target = await mkdtemp(join(tmpdir(), "alpha-aos-ecc-target-"));
  context.after(async () => rm(target, { recursive: true, force: true }));
  const plan = await planEccSkillSync("codex", await loadLock(packageRoot()), target);
  assert.equal(plan.entries.length, 3);
  assert.deepEqual(plan.entries.map((entry) => entry.skill), ["unified-memory", "documentation-lookup", "deep-research"]);
  assert.equal(plan.entries.every((entry) => entry.action === "create"), true);
  assert.equal(plan.entries.every((entry) => entry.destination.startsWith(target)), true);
});

test("global ECC roots preserve native roots and share Agent Skills between Codex and Pi", () => {
  const home = "C:\\Users\\fixture";
  assert.equal(globalEccSkillRoot("claude", { CLAUDE_CONFIG_DIR: "C:\\profiles\\claude" }, home), join("C:\\profiles\\claude", "skills"));
  assert.equal(globalEccSkillRoot("codex", { CODEX_HOME: "C:\\profiles\\codex" }, home), join(home, ".agents", "skills"));
  assert.equal(globalEccSkillRoot("antigravity", {}, home), join(home, ".gemini", "config", "skills"));
  assert.equal(globalEccSkillRoot("antigravity", { ANTIGRAVITY_CONFIG_DIR: "C:\\profiles\\antigravity" }, home), join("C:\\profiles\\antigravity", "skills"));
  assert.equal(globalEccSkillRoot("pi", { PI_CODING_AGENT_DIR: "C:\\profiles\\pi" }, home), join(home, ".agents", "skills"));
  assert.equal(globalEccSkillRoot("pi", {}, home), globalEccSkillRoot("codex", {}, home));
});
