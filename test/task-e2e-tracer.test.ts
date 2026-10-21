import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { applyOwnedSkillSync, destinationFor, planOwnedSkillOperation, renderOwnedSkill } from "../src/core/owned-skills.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
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

test("E2E Tracer: 5-Harness Synchronized Integrity Check", async (context) => {
  const catalog = await loadCatalog(repositoryRoot);
  const lock = await loadLock(repositoryRoot);
  const fixtureRoot = await mkdtemp(join(tmpdir(), "alpha-aos-e2e-tracer-"));
  assert.equal(dirname(fixtureRoot), resolve(tmpdir()));
  context.after(async () => rm(fixtureRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  for (const id of ["alpha-aos-task", "computer-use"]) {
    const skill = catalog.components.ownedSkills.find((entry) => entry.id === id);
    const locked = lock.components.ownedSkills?.[id];
    assert.ok(skill);
    assert.ok(locked);
    const sourceContent = await readFile(join(repositoryRoot, skill.source), "utf8");
    assert.equal(createHash("sha256").update(sourceContent).digest("hex"), locked.sourceSha256);
    for (const harness of harnesses) {
      const rendered = renderOwnedSkill(sourceContent, harness, skill.invocation, skill.argumentHint);
      const expectedHash = createHash("sha256").update(rendered).digest("hex");
      assert.equal(locked.targetSha256[harness], expectedHash);
      const targetHome = join(fixtureRoot, harness);
      const stateRoot = join(fixtureRoot, "state");
      const plan = await planOwnedSkillOperation(repositoryRoot, catalog, lock, id, harness, { targetHome, stateRoot });
      const applied = await applyOwnedSkillSync(repositoryRoot, catalog, lock, id, harness, { plan, targetHome, stateRoot });
      assert.ok(applied.operationId);
      const dest = destinationFor(harness, id, targetHome);
      assert.equal(applied.plan.destination, dest);
      const destContent = await readFile(dest);
      const destHash = createHash("sha256").update(destContent).digest("hex");
      assert.equal(destHash, expectedHash, `Harness '${harness}' installed ${id} must match its locked hash`);
      assert.equal(destContent.toString("utf8"), rendered);
      if (id === "alpha-aos-task") {
        assert.ok(rendered.includes("## Active Capability Orchestration Rules (D-02)"));
        assert.ok(rendered.includes("GUI verification orchestration"));
      }
    }
  }
});
