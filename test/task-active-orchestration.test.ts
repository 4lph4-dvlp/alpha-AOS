import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repositoryRoot = process.cwd();

test("skills/alpha-aos-task/SKILL.md mandates Exa, Firecrawl, Context7, and Unified Memory", async () => {
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const content = await readFile(skillPath, "utf8");

  // Section header
  assert.ok(
    content.includes("## Active Capability Orchestration Rules (D-02)"),
    "SKILL.md must define Active Capability Orchestration Rules section",
  );

  // ORCH-01: Exa & Firecrawl
  assert.ok(content.includes("ORCH-01"), "Must reference ORCH-01");
  assert.ok(
    content.includes("web_search_exa") && content.includes("firecrawl_scrape"),
    "SKILL.md must mandate web_search_exa and firecrawl_scrape for external investigation",
  );

  // ORCH-02: Context7
  assert.ok(content.includes("ORCH-02"), "Must reference ORCH-02");
  assert.ok(
    content.includes("Context7") && content.includes("resolve-library-id") && content.includes("query-docs"),
    "SKILL.md must mandate Context7 (resolve-library-id, query-docs) for dependency/API changes",
  );

  // ORCH-03: ECC Unified Memory
  assert.ok(content.includes("ORCH-03"), "Must reference ORCH-03");
  assert.ok(
    content.includes("Unified Memory") && (content.includes("unified-memory") || content.includes("ecc memory")),
    "SKILL.md must mandate ECC Unified Memory handoff on session/phase boundaries",
  );
});

test("AGENTS.md mandates active capability orchestration across GSD lifecycle", async () => {
  const agentsPath = join(repositoryRoot, "AGENTS.md");
  const content = await readFile(agentsPath, "utf8");

  assert.ok(
    content.includes("### 3. Active Capability Orchestration (D-02)"),
    "AGENTS.md must declare Active Capability Orchestration subsection",
  );
  assert.ok(
    content.includes("web_search_exa") && content.includes("firecrawl_scrape"),
    "AGENTS.md must declare Exa and Firecrawl requirements",
  );
  assert.ok(
    content.includes("Context7") && content.includes("query-docs"),
    "AGENTS.md must declare Context7 requirements",
  );
  assert.ok(
    content.includes("Unified Memory") || content.includes("ecc memory"),
    "AGENTS.md must declare Unified Memory requirements",
  );
});

test("catalog/stack.lock.json has valid pinned hashes for orchestrated owned-skills", async () => {
  const skillPath = join(repositoryRoot, "skills", "alpha-aos-task", "SKILL.md");
  const skillContent = await readFile(skillPath);
  const expectedHash = createHash("sha256").update(skillContent).digest("hex");

  const lockPath = join(repositoryRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));

  const taskSkill = lock.components?.ownedSkills?.["alpha-aos-task"];
  assert.ok(taskSkill, "ownedSkills must contain alpha-aos-task");
  assert.equal(taskSkill.sourceSha256, expectedHash, "sourceSha256 must match current file hash");

  const requiredTargets = ["claude", "codex", "antigravity", "pi", "hermes"];
  for (const target of requiredTargets) {
    assert.equal(
      taskSkill.targetSha256?.[target],
      expectedHash,
      `targetSha256 for ${target} must match current file hash`,
    );
  }
});
