import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { destinationFor } from "../src/core/owned-skills.js";
import type { HarnessId } from "../src/types.js";

const repositoryRoot = process.cwd();

test("E2E Tracer: Task Intake Precedence & Anti-Bypass Invariant", async () => {
  const agentsPath = join(repositoryRoot, "AGENTS.md");
  const agentsContent = await readFile(agentsPath, "utf8");

  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const skillContent = await readFile(skillPath, "utf8");

  // Invariant 1: alpha-aos-task has primary intake authority
  assert.ok(
    agentsContent.includes("Primary Intake Authority (Top Priority)") &&
    agentsContent.includes("alpha-aos-task"),
    "AGENTS.md must designate alpha-aos-task as top-priority intake authority",
  );
  assert.ok(
    skillContent.includes("Precedence Invariant (No Ambient Shortcut Bypass)"),
    "SKILL.md must define Precedence Invariant",
  );

  // Invariant 2: Direct unilateral bypass into $gsd-quick is forbidden
  assert.ok(
    agentsContent.includes("MUST NOT") &&
    agentsContent.includes("silently self-assign") &&
    agentsContent.includes("$gsd-quick"),
    "AGENTS.md must prohibit silent self-assignment of bare $gsd-quick",
  );
  assert.ok(
    skillContent.includes("MUST NOT") && skillContent.includes("bypass path confirmation"),
    "SKILL.md must prohibit bypassing path confirmation",
  );

  // Invariant 3: Native shortcuts remain valid downstream
  assert.ok(agentsContent.includes("$gsd-quick"));
  assert.ok(agentsContent.includes("$gsd-debug"));
  assert.ok(agentsContent.includes("$gsd-execute-phase"));
  assert.ok(skillContent.includes("downstream"));
});

test("E2E Tracer: Active Tool Orchestration Rules in GSD Lifecycle", async () => {
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const skillContent = await readFile(skillPath, "utf8");

  // Rule 1: External repos / web docs require Exa & Firecrawl
  assert.ok(
    skillContent.includes("External Repository & Open Web Investigation (ORCH-01)"),
    "Must enforce ORCH-01 rule section",
  );
  assert.ok(
    skillContent.includes("web_search_exa") && skillContent.includes("firecrawl_scrape"),
    "Must mandate web_search_exa for discovery and firecrawl_scrape for extraction",
  );

  // Rule 2: Package dependencies & library APIs require Context7
  assert.ok(
    skillContent.includes("Official Documentation Grounding (ORCH-02)"),
    "Must enforce ORCH-02 rule section",
  );
  assert.ok(
    skillContent.includes("Context7") &&
    skillContent.includes("resolve-library-id") &&
    skillContent.includes("query-docs"),
    "Must mandate Context7 resolve-library-id and query-docs",
  );

  // Rule 3: Session boundaries and handoffs require ECC Unified Memory
  assert.ok(
    skillContent.includes("Cross-Agent & Session Boundary Continuity (ORCH-03)"),
    "Must enforce ORCH-03 rule section",
  );
  assert.ok(
    skillContent.includes("ECC Unified Memory vault") &&
    skillContent.includes("unified-memory") &&
    skillContent.includes("ecc memory"),
    "Must mandate ECC Unified Memory vault for durable handoffs",
  );
});

test("E2E Tracer: 5-Harness Synchronized Integrity Check", async () => {
  const lockPath = join(repositoryRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const taskSkillLock = lock.components?.ownedSkills?.["alpha-aos-task"];

  assert.ok(taskSkillLock, "alpha-aos-task must be locked in stack.lock.json");
  const expectedHash = taskSkillLock.sourceSha256;

  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const sourceContent = await readFile(skillPath, "utf8");

  const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

  for (const harness of harnesses) {
    // 1. Verify locked hash matches source hash
    assert.equal(
      taskSkillLock.targetSha256?.[harness],
      expectedHash,
      `Harness '${harness}' targetSha256 in lock must match sourceSha256`,
    );

    // 2. If the harness skill file is physically installed on the current host, verify its integrity
    const dest = destinationFor(harness, "alpha-aos-task");
    if (existsSync(dest)) {
      const destContent = await readFile(dest);
      const destHash = createHash("sha256").update(destContent).digest("hex");

      assert.equal(
        destHash,
        expectedHash,
        `Harness '${harness}' installed skill hash must match stack.lock.json expected hash`,
      );

      const destText = destContent.toString("utf8");
      assert.ok(
        destText.includes("## Active Capability Orchestration Rules (D-02)"),
        `Harness '${harness}' installed skill must contain active capability orchestration rules`,
      );
    }
  }
});
