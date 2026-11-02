import assert from "node:assert/strict";
import fs from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
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

test("doctor preserves all findings when a deployed skill is a directory or unreadable", async (context) => {
  const { root } = await createDoctorPackageFixture(context);
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  const claudeRoot = join(root, "isolated-claude");
  const destination = join(claudeRoot, "skills/alpha-aos-task/SKILL.md");
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = claudeRoot;
  const originalRead = fs.readFileSync;
  try {
    await mkdir(destination, { recursive: true });
    const directory = await runDoctor(catalog, lock, createInventory(), root);
    const warning = directory.find((row) => row.code === "policy.owned-skill.alpha-aos-task.claude");
    assert.equal(warning?.level, "warning");
    assert.match(warning!.message, /NOT_REGULAR_FILE/u);
    assert.ok(directory.some((row) => row.code === "harness.claude"));
    assert.equal(directory.find((row) => row.code === "lock.owned-skill.alpha-aos-task")?.level, "ok");
    await rm(destination, { recursive: true });
    await writeFile(destination, "fixture");
    const deniedRead = ((path: Parameters<typeof fs.readFileSync>[0], ...args: unknown[]) => {
      if (path === destination) throw Object.assign(new Error("fixture permission denied"), { code: "EACCES" });
      return Reflect.apply(originalRead, fs, [path, ...args]);
    }) as typeof fs.readFileSync;
    context.mock.method(fs, "readFileSync", deniedRead);
    syncBuiltinESMExports();
    const unreadable = await runDoctor(catalog, lock, createInventory(), root);
    const denied = unreadable.find((row) => row.code === "policy.owned-skill.alpha-aos-task.claude");
    assert.equal(denied?.level, "warning");
    assert.match(denied!.message, /EACCES/u);
    assert.ok(unreadable.some((row) => row.code === "harness.claude"));
  } finally {
    context.mock.restoreAll();
    syncBuiltinESMExports();
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  }
});
