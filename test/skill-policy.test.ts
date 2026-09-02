import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { applyClaudeSkillPolicy, planClaudeSkillPolicy, renderClaudeSkillPolicy } from "../src/core/skill-policy.js";

test("Claude skill policy preserves unrelated settings and overrides only three managed ECC skills", () => {
  const rendered = renderClaudeSkillPolicy(JSON.stringify({
    permissions: { allow: ["Bash(npm test)"] },
    skillOverrides: { "user-skill": "on", "unified-memory": "off" },
  }));
  const parsed = JSON.parse(rendered) as Record<string, any>;
  assert.deepEqual(parsed.permissions, { allow: ["Bash(npm test)"] });
  assert.equal(parsed.skillOverrides["user-skill"], "on");
  assert.equal(parsed.skillOverrides["unified-memory"], "user-invocable-only");
  assert.equal(parsed.skillOverrides["documentation-lookup"], "user-invocable-only");
  assert.equal(parsed.skillOverrides["deep-research"], "user-invocable-only");
});

test("Claude skill policy is transactional and semantically idempotent", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-skill-policy-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const settingsPath = join(root, "claude", "settings.json");
  const stateRoot = join(root, "state");
  await mkdir(join(root, "claude"), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify({ theme: "dark" }, null, 4)}\n`, "utf8");
  const before = await planClaudeSkillPolicy({ settingsPath });
  assert.equal(before.action, "update");
  const applied = await applyClaudeSkillPolicy({ settingsPath, stateRoot });
  assert.ok(applied.operationId);
  assert.equal(applied.plan.action, "current");
  const parsed = JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, any>;
  assert.equal(parsed.theme, "dark");
  assert.equal(Object.keys(parsed.skillOverrides).length, 3);
  const reapplied = await applyClaudeSkillPolicy({ settingsPath, stateRoot });
  assert.equal(reapplied.operationId, null);
});
