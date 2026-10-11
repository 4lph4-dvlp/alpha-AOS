import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();

test("AGENTS.md declares alpha-aos-task intake precedence over native shortcuts", async () => {
  const agentsPath = join(repositoryRoot, "AGENTS.md");
  const content = await readFile(agentsPath, "utf8");

  // Workflow markers must be preserved
  assert.ok(content.includes("<!-- GSD:workflow-start"), "Must preserve GSD workflow start marker");
  assert.ok(content.includes("<!-- GSD:workflow-end -->"), "Must preserve GSD workflow end marker");

  // Primary Intake Authority declaration
  assert.ok(
    content.includes("Primary Intake Authority (Top Priority)"),
    "AGENTS.md must declare alpha-aos-task as top priority primary intake authority",
  );
  assert.ok(
    content.includes("MUST NOT") && content.includes("unilaterally bypass the user"),
    "AGENTS.md must forbid unilateral bypass of user intake",
  );
  assert.ok(
    content.includes("alpha-aos-task"),
    "AGENTS.md must explicitly reference alpha-aos-task",
  );

  // Native shortcuts must remain preserved and operational under governance
  assert.ok(content.includes("$gsd-quick"), "Must preserve $gsd-quick shortcut");
  assert.ok(content.includes("$gsd-debug"), "Must preserve $gsd-debug shortcut");
  assert.ok(content.includes("$gsd-execute-phase"), "Must preserve $gsd-execute-phase shortcut");

  // Guard against bare quick bypass for non-trivial tasks
  assert.ok(
    content.includes("Non-trivial tasks") && content.includes("must not use bare quick without required research"),
    "Must forbid bare quick bypass for non-trivial tasks",
  );
});

test("skills/alpha-aos-task/SKILL.md enforces precedence invariant and anti-bypass guard", async () => {
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  assert.ok(
    content.includes("Precedence Invariant (No Ambient Shortcut Bypass)"),
    "SKILL.md must declare Precedence Invariant",
  );
  assert.ok(
    content.includes("MUST NOT") && content.includes("bypass path confirmation"),
    "SKILL.md must forbid bypassing path confirmation",
  );
  assert.ok(
    content.includes("downstream"),
    "SKILL.md must specify that shortcuts operate downstream of intake confirmation",
  );
});

test("catalog/stack.lock.json contains exact matching hash for alpha-aos-task", async () => {
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const skillContent = await readFile(skillPath);
  const expectedHash = createHash("sha256").update(skillContent).digest("hex");

  const lockPath = join(repositoryRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));

  const taskSkill = lock.components?.ownedSkills?.["alpha-aos-task"];
  assert.ok(taskSkill, "ownedSkills must contain alpha-aos-task");
  assert.equal(taskSkill.sourceSha256, expectedHash, "sourceSha256 must match current file hash");

  for (const [target, targetHash] of Object.entries(taskSkill.targetSha256 ?? {})) {
    assert.equal(targetHash, expectedHash, `targetSha256 for ${target} must match current file hash`);
  }
});
