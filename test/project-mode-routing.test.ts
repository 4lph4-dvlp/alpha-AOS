import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import {
  applyOwnedSkillSync,
  destinationFor,
  planOwnedSkillSync,
  renderOwnedSkill,
} from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import type { HarnessId } from "../src/types.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");
const TARGETS: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

test("alpha-aos-task deploys cleanly with exact integrity across all five target fixtures (MODE-02, D-12)", async (context) => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-routing-skills-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const stateRoot = join(baseTemp, "state");
  await mkdir(stateRoot, { recursive: true });

  const lockedSkill = lock.components.ownedSkills?.["alpha-aos-task"];
  assert.ok(lockedSkill, "alpha-aos-task must be locked in stack.lock.json");

  // Verify all 5 targets deploy and verify integrity
  for (const target of TARGETS) {
    const targetHome = join(baseTemp, `home-${target}`);
    await mkdir(targetHome, { recursive: true });

    const plan = await planOwnedSkillSync(root, catalog, lock, "alpha-aos-task", target, {
      stateRoot,
      targetHome,
    });

    assert.equal(plan.action, "create");
    assert.equal(plan.expectedHash, lockedSkill.targetSha256[target]);

    const result = await applyOwnedSkillSync(root, catalog, lock, "alpha-aos-task", target, {
      stateRoot,
      targetHome,
    });

    assert.ok(result.operationId !== null, `expected operation ID for ${target}`);
    const destination = destinationFor(target, "alpha-aos-task", targetHome);
    assert.ok(existsSync(destination), `skill file was not written for ${target} at ${destination}`);

    const deployedContent = await readFile(destination, "utf8");
    assert.match(deployedContent, /Project Behavior Policy Request/u);
    assert.match(deployedContent, /alpha-aos project mode/u);
    assert.match(deployedContent, /Mode Preference Invariant/u);
  }
});

test("cross-target policy visibility: target A sets flexible, target B reads fresh revision on next intake (MODE-02, MODE-03, D-10, D-14)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "shared-project");
  await mkdir(projectDir, { recursive: true });

  const stateRootA = join(sandbox.root, "state-target-a");
  const stateRootB = join(sandbox.root, "state-target-b");
  await mkdir(stateRootA, { recursive: true });
  await mkdir(stateRootB, { recursive: true });

  // 1. Target A (e.g. claude environment) queries policy: sees default strict
  const queryA1 = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA, CLAUDE_CONFIG_DIR: join(sandbox.home, ".claude") },
      encoding: "utf8",
    },
  );
  assert.equal(queryA1.status, 0);
  const viewA1 = JSON.parse(queryA1.stdout);
  assert.equal(viewA1.effectiveMode, "strict");
  assert.equal(viewA1.source, "builtin-default");
  assert.equal(viewA1.revision, "missing");

  // 2. Target A previews and applies flexible mode
  const previewA = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA },
      encoding: "utf8",
    },
  );
  assert.equal(previewA.status, 0);
  const planA = JSON.parse(previewA.stdout);

  const applyA = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", planA.planDigest, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA },
      encoding: "utf8",
    },
  );
  assert.equal(applyA.status, 0);

  // 3. Target B (e.g. codex environment with separate state root) queries project on next intake
  const queryB = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootB, CODEX_HOME: join(sandbox.home, ".agents") },
      encoding: "utf8",
    },
  );
  assert.equal(queryB.status, 0);
  const viewB = JSON.parse(queryB.stdout);
  assert.equal(viewB.effectiveMode, "flexible");
  assert.equal(viewB.source, "project-policy");
  assert.equal(viewB.exists, true);
  assert.notEqual(viewB.revision, "missing");

  // 4. Target A also rereads and sees exact same revision
  const queryA2 = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    {
      env: { ...sandbox.env, ALPHA_AOS_STATE_DIR: stateRootA },
      encoding: "utf8",
    },
  );
  assert.equal(queryA2.status, 0);
  const viewA2 = JSON.parse(queryA2.stdout);
  assert.equal(viewA2.revision, viewB.revision);
});

test("skill structural boundaries: policy request precedes chooser and retains zero-authority expansion (MODE-02, D-04, D-11)", async () => {
  const root = packageRoot();
  const skillSource = await readFile(join(root, "skills", "alpha-aos-task", "SKILL.md"), "utf8");

  // 1. Policy-only request section precedes general task request
  const policyIdx = skillSource.indexOf("### 1. Project Behavior Policy Request");
  const generalIdx = skillSource.indexOf("### 2. General Task Request");
  assert.ok(policyIdx >= 0, "skill must contain Project Behavior Policy Request section");
  assert.ok(generalIdx >= 0, "skill must contain General Task Request section");
  assert.ok(policyIdx < generalIdx, "policy-only request must precede general task intake");

  // 2. Query precedence and fresh reads before intake
  assert.match(skillSource, /Never rely on session memory or stale cache as authority/u);
  assert.match(skillSource, /Before each new task intake, rerun `alpha-aos project mode/u);

  // 3. Authority limits: preference only, not execution consent
  assert.match(skillSource, /Mode Preference Invariant \(No Authority Expansion/u);
  assert.match(skillSource, /A mode change request MUST NOT be treated as task execution consent/u);
  assert.match(skillSource, /Flexible mode does NOT bypass exact-digest contract approval/u);

  // 4. Bound task canonical root mismatch guard
  assert.match(skillSource, /check that the requested target root matches the bound root; a mismatch blocks/u);
});
