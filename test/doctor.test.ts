import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { runDoctor } from "../src/core/doctor.js";
import { packageRoot } from "../src/core/paths.js";
import type { Inventory, StackLock } from "../src/types.js";

function createInventory(): Inventory {
  return {
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
}

async function createDoctorPackageFixture(context: test.TestContext): Promise<{ root: string }> {
  const realRoot = packageRoot();
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-doctor-test-"));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  await cp(join(realRoot, "catalog"), join(root, "catalog"), { recursive: true });
  await cp(join(realRoot, "skills"), join(root, "skills"), { recursive: true });
  await cp(join(realRoot, "schemas"), join(root, "schemas"), { recursive: true });
  return { root };
}

test("doctor treats missing optional harness commands as warnings", async () => {
  const inventory = createInventory();
  const root = packageRoot();
  const findings = await runDoctor(await loadCatalog(root), await loadLock(root), inventory);
  assert.equal(findings.some((finding) => finding.level === "error"), false);
  assert.equal(findings.find((finding) => finding.code === "harness.codex")?.level, "warning");
});

test("doctor verifies packaged owned-skill hashes and frontmatter fail-closed", async (context) => {
  const { root } = await createDoctorPackageFixture(context);
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  const inventory = createInventory();

  // (a) Clean repository root yields level "ok" for lock.owned-skill.alpha-aos-task and zero errors
  const cleanFindings = await runDoctor(catalog, lock, inventory, root);
  const errors = cleanFindings.filter((finding) => finding.level === "error");
  assert.equal(errors.length, 0, `Expected 0 errors on clean root, got: ${JSON.stringify(errors)}`);
  const taskFinding = cleanFindings.find((finding) => finding.code === "lock.owned-skill.alpha-aos-task");
  assert.ok(taskFinding);
  assert.equal(taskFinding.level, "ok");
  assert.match(taskFinding.message, /source and 5 target hashes verified/);

  // (b) Mutating skills/alpha-aos-task/SKILL.md yields level "error" on lock.owned-skill.alpha-aos-task
  const skillPath = join(root, "skills", "alpha-aos-task", "SKILL.md");
  const originalSkillText = await readFile(skillPath, "utf8");
  await writeFile(skillPath, `${originalSkillText}\n<!-- tampered byte -->`);
  const mutatedSkillFindings = await runDoctor(catalog, lock, inventory, root);
  const mutatedSkillFinding = mutatedSkillFindings.find((finding) => finding.code === "lock.owned-skill.alpha-aos-task");
  assert.ok(mutatedSkillFinding);
  assert.equal(mutatedSkillFinding.level, "error");
  assert.match(mutatedSkillFinding.message, /source hash mismatch/i);

  // Restore original skill text for next assertions
  await writeFile(skillPath, originalSkillText);

  // (c) Mutating lock.components.ownedSkills["alpha-aos-task"].targetSha256.pi yields level "error" naming pi
  const mutatedLock: StackLock = JSON.parse(JSON.stringify(lock));
  if (mutatedLock.components.ownedSkills?.["alpha-aos-task"]) {
    mutatedLock.components.ownedSkills["alpha-aos-task"].targetSha256.pi = "a".repeat(64);
  }
  const mutatedLockFindings = await runDoctor(catalog, mutatedLock, inventory, root);
  const mutatedLockFinding = mutatedLockFindings.find((finding) => finding.code === "lock.owned-skill.alpha-aos-task");
  assert.ok(mutatedLockFinding);
  assert.equal(mutatedLockFinding.level, "error");
  assert.match(mutatedLockFinding.message, /rendered target hash mismatch for pi/i);

  // (d) Stripping YAML frontmatter from SKILL.md yields level "error"
  const strippedText = originalSkillText.replace(/^---[\s\S]*?---\r?\n/u, "");
  await writeFile(skillPath, strippedText);
  const strippedFindings = await runDoctor(catalog, lock, inventory, root);
  const strippedFinding = strippedFindings.find((finding) => finding.code === "lock.owned-skill.alpha-aos-task");
  assert.ok(strippedFinding);
  assert.equal(strippedFinding.level, "error");
  assert.match(strippedFinding.message, /frontmatter is invalid/i);
});
