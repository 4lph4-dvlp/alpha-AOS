import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  destinationFor,
  renderOwnedSkill,
  planOwnedSkillSync,
  planOwnedSkillOperation,
  applyOwnedSkillSync,
} from "../src/core/owned-skills.js";
import { createInstallPlan } from "../src/core/plan.js";
import { createManagedInstallPlan, type ManagedInstallStep } from "../src/core/install.js";
import { rollbackManagedTransaction } from "../src/core/transaction.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { packageRoot } from "../src/core/paths.js";
import type { HarnessId, Inventory, StackCatalog, StackLock } from "../src/types.js";

const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function createMockInventory(detected: HarnessId[]): Inventory {
  const ids: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  return {
    schemaVersion: 1,
    generatedAt: new Date(0).toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: "v24.0.0", command: process.execPath },
      npm: { version: "10.0.0", command: "npm" },
      git: { version: "2.0.0", command: "git" },
    },
    harnesses: ids.map((id) => ({
      id,
      displayName: id,
      command: detected.includes(id) ? id : null,
      version: null,
      configRoots: [],
      detected: detected.includes(id),
      notes: [],
    })),
  };
}

test("destinationFor resolves destinations across all five harnesses", () => {
  const base = join(tmpdir(), "alpha-aos-destination-fixture");
  const custom = join(base, "custom-root");
  for (const harness of ALL_HARNESSES) {
    const dest = destinationFor(harness, "my-skill", custom);
    assert.equal(dest, join(custom, "skills", "my-skill", "SKILL.md"));
  }

  const fakeHome = join(base, "home");
  const claudeRoot = join(base, "env", "claude");
  const codexRoot = join(base, "env", "codex");
  const geminiRoot = join(base, "env", "gemini");
  const hermesRoot = join(base, "env", "hermes");
  const fakeEnv: NodeJS.ProcessEnv = {
    CLAUDE_CONFIG_DIR: claudeRoot,
    CODEX_HOME: codexRoot,
    ANTIGRAVITY_CONFIG_DIR: geminiRoot,
    HERMES_HOME: hermesRoot,
  };

  assert.equal(
    destinationFor("claude", "test-skill", undefined, fakeEnv, fakeHome),
    join(claudeRoot, "skills", "test-skill", "SKILL.md"),
  );
  assert.equal(
    destinationFor("codex", "test-skill", undefined, fakeEnv, fakeHome),
    join(fakeHome, ".agents", "skills", "test-skill", "SKILL.md"),
  );
  assert.equal(
    destinationFor("antigravity", "test-skill", undefined, fakeEnv, fakeHome),
    join(geminiRoot, "skills", "test-skill", "SKILL.md"),
  );
  assert.equal(
    destinationFor("pi", "test-skill", undefined, fakeEnv, fakeHome),
    join(fakeHome, ".agents", "skills", "test-skill", "SKILL.md"),
  );
  assert.equal(
    destinationFor("hermes", "test-skill", undefined, fakeEnv, fakeHome),
    join(hermesRoot, "skills", "test-skill", "SKILL.md"),
  );
});

test("renderOwnedSkill handles invocation modes and argument hints", () => {
  const source = "---\nname: my-skill\ndescription: Test skill\n---\n\nSkill body here.\n";

  assert.throws(() => renderOwnedSkill("no frontmatter", "claude", "automatic"), /frontmatter/u);
  assert.throws(() => renderOwnedSkill(source, "unknown" as HarnessId, "automatic"), /not implemented/u);

  for (const harness of ALL_HARNESSES) {
    const autoRendered = renderOwnedSkill(source, harness, "automatic");
    assert.equal(autoRendered, source);
    assert.doesNotMatch(autoRendered, /disable-model-invocation/u);

    const explicitRendered = renderOwnedSkill(source, harness, "explicit");
    assert.match(explicitRendered, /disable-model-invocation: true/u);
    assert.match(explicitRendered, /name: my-skill/u);

    const withHint = renderOwnedSkill(source, harness, "explicit", "<arg1> [--flag]");
    assert.match(withHint, /argument-hint: "<arg1> \[--flag\]"/u);
    assert.match(withHint, /disable-model-invocation: true/u);
  }
});

interface FixtureEnvironment {
  tempRoot: string;
  catalog: StackCatalog;
  lock: StackLock;
}

async function createSkillFixture(harnesses: HarnessId[] = [...ALL_HARNESSES]): Promise<FixtureEnvironment> {
  const tempRoot = await mkdtemp(join(tmpdir(), "alpha-aos-owned-skills-test-"));
  const skillSourceDir = join(tempRoot, "skills", "sample-skill");
  await mkdir(skillSourceDir, { recursive: true });

  const skillContent = "---\nname: sample-skill\ndescription: A multi-harness sample skill\n---\n\nSample body.\n";
  await writeFile(join(skillSourceDir, "SKILL.md"), skillContent, "utf8");

  const sourceSha = sha256(skillContent);
  const targetSha256: Partial<Record<HarnessId, string>> = {};
  for (const h of harnesses) {
    const rendered = renderOwnedSkill(skillContent, h, "automatic");
    targetSha256[h] = sha256(rendered);
  }

  const catalog: StackCatalog = {
    schemaVersion: 1,
    name: "alpha-aos",
    defaultChannel: "stable",
    channels: { stable: { description: "Stable" } },
    harnesses: {
      claude: { displayName: "Claude Code" },
      codex: { displayName: "Codex" },
      antigravity: { displayName: "Antigravity" },
      pi: { displayName: "Pi" },
      hermes: { displayName: "Hermes" },
    },
    components: {
      gsd: { package: "@opengsd/gsd-core", profile: "standard", targets: ["claude", "codex", "antigravity", "pi"] },
      ecc: { package: "ecc-universal", globalSkills: [], profileInstallAllowed: false },
      mcp: { rolloutOrder: [], targets: [] },
      ownedSkills: [
        {
          id: "sample-skill",
          source: "skills/sample-skill/SKILL.md",
          targets: harnesses,
          invocation: "automatic",
        },
      ],
    },
    policy: {
      mutationDefault: "dry-run",
      requireSnapshot: true,
      requireCanary: false,
      canaryHarness: "codex",
      forbidManagedFilePatches: true,
      autoApplyMarkdownOnly: true,
      requireApprovalFor: [],
    },
  };

  const lock: StackLock = {
    schemaVersion: 1,
    channel: "stable",
    generatedAt: null,
    components: {
      ownedSkills: {
        "sample-skill": {
          sourceSha256: sourceSha,
          targetSha256,
        },
      },
    },
  };

  return { tempRoot, catalog, lock };
}

test("planOwnedSkillSync and applyOwnedSkillSync work across all 5 harnesses", async (t) => {
  const { tempRoot, catalog, lock } = await createSkillFixture();
  t.after(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  const stateRoot = join(tempRoot, "state");
  const fakeHarnessRoots = join(tempRoot, "harnesses");

  for (const target of ALL_HARNESSES) {
    const targetHome = join(fakeHarnessRoots, target);
    const plan = await planOwnedSkillSync(tempRoot, catalog, lock, "sample-skill", target, { targetHome, stateRoot });

    assert.equal(plan.id, "sample-skill");
    assert.equal(plan.target, target);
    assert.equal(plan.action, "create");
    assert.equal(plan.workflow, null);
    assert.equal(plan.workflowFound, true);

    const opPlan = await planOwnedSkillOperation(tempRoot, catalog, lock, "sample-skill", target, { targetHome, stateRoot });
    assert.equal(opPlan.sync.action, "create");
    assert.ok(opPlan.digest.length === 64);

    const applied = await applyOwnedSkillSync(tempRoot, catalog, lock, "sample-skill", target, {
      plan: opPlan,
      targetHome,
      stateRoot,
    });
    assert.ok(applied.operationId !== null);
    assert.ok(existsSync(applied.plan.destination));

    const writtenContent = await readFile(applied.plan.destination, "utf8");
    assert.match(writtenContent, /name: sample-skill/u);

    // Re-plan returns current (idempotency)
    const rePlan = await planOwnedSkillSync(tempRoot, catalog, lock, "sample-skill", target, { targetHome, stateRoot });
    assert.equal(rePlan.action, "current");

    // Rollback removes the written file
    const rolledBack = await rollbackManagedTransaction(stateRoot, applied.operationId);
    assert.equal(rolledBack.status, "rolled-back");
    assert.equal(existsSync(applied.plan.destination), false);
  }
});

test("createInstallPlan emits owned skill actions for all supported targets", async () => {
  const root = packageRoot();
  const baseCatalog = await loadCatalog(root);
  const baseLock = await loadLock(root);

  const catalog: StackCatalog = {
    ...baseCatalog,
    components: {
      ...baseCatalog.components,
      ownedSkills: [
        ...baseCatalog.components.ownedSkills,
        {
          id: "multi-target-skill",
          source: "skills/alpha-aos-ship/SKILL.md",
          targets: ["claude", "codex", "antigravity", "pi", "hermes"],
          invocation: "automatic",
        },
      ],
    },
  };

  const lock: StackLock = {
    ...baseLock,
    components: {
      ...baseLock.components,
      ownedSkills: {
        ...baseLock.components.ownedSkills,
        "multi-target-skill": {
          sourceSha256: "0b9d85550717d43ac07d36ba0a6400e49d2e035eb1600f6a73d922345b91947a",
          targetSha256: {},
        },
      },
    },
  };

  const plan = createInstallPlan(catalog, lock);
  for (const target of ALL_HARNESSES) {
    const action = plan.find((a) => a.id === `owned-skill:multi-target-skill:${target}`);
    assert.ok(action, `Expected action for owned-skill:multi-target-skill:${target}`);
    assert.equal(action.target, target);
    assert.equal(action.component, "owned-skill:multi-target-skill");
    assert.match(action.command ?? "", new RegExp(`owned-skills sync multi-target-skill --target ${target} --apply`, "u"));
  }
});

test("createManagedInstallPlan emits owned skill steps for all detected targets", async () => {
  const root = packageRoot();
  const baseCatalog = await loadCatalog(root);
  const baseLock = await loadLock(root);

  const tempRoot = await mkdtemp(join(tmpdir(), "alpha-aos-managed-install-test-"));
  const stateRoot = join(tempRoot, "state");

  const catalog: StackCatalog = {
    ...baseCatalog,
    components: {
      ...baseCatalog.components,
      ownedSkills: [
        ...baseCatalog.components.ownedSkills,
        {
          id: "multi-target-skill",
          source: "skills/alpha-aos-ship/SKILL.md",
          targets: ["claude", "codex", "antigravity", "pi", "hermes"],
          invocation: "automatic",
        },
      ],
    },
  };

  const shipLock = baseLock.components.ownedSkills!["alpha-aos-ship"]!;
  const lock: StackLock = {
    ...baseLock,
    components: {
      ...baseLock.components,
      ownedSkills: {
        ...baseLock.components.ownedSkills,
        "multi-target-skill": {
          sourceSha256: shipLock.sourceSha256,
          targetSha256: {
            claude: shipLock.sourceSha256,
            codex: shipLock.sourceSha256,
            antigravity: shipLock.sourceSha256,
            pi: shipLock.sourceSha256,
            hermes: shipLock.sourceSha256,
          },
        },
      },
    },
  };

  const inventory = createMockInventory([...ALL_HARNESSES]);
  const installPlan = await createManagedInstallPlan({
    root,
    catalog,
    lock,
    inventory,
    stateRoot,
  });

  for (const target of ALL_HARNESSES) {
    const step = installPlan.steps.find((s: ManagedInstallStep) => s.id === `owned-skill:multi-target-skill:${target}`);
    assert.ok(step, `Expected step for owned-skill:multi-target-skill:${target}`);
    assert.equal(step.target, target);
    assert.equal(step.component, "owned-skill");
    assert.equal(step.external, false);
  }

  await rm(tempRoot, { recursive: true, force: true });
});
