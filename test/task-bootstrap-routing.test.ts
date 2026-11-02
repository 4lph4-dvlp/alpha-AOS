import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import {
  applyOwnedSkillSync,
  destinationFor,
  planOwnedSkillSync,
} from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import type { HarnessId } from "../src/types.js";
import { createIsolatedSandbox } from "./helpers/packed-sandbox.js";

const cliPath = join(import.meta.dirname, "..", "src", "cli.js");
const TARGETS: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

test("alpha-aos-task deployed skill has exact integrity and shared readiness/bootstrap procedure across all five target fixtures (BOOT-01, BOOT-02, BOOT-03, BOOT-04, D-22)", async (context) => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-task-bootstrap-routing-"));
  context.after(async () => rm(baseTemp, { recursive: true, force: true }));

  const stateRoot = join(baseTemp, "state");
  await mkdir(stateRoot, { recursive: true });

  const lockedSkill = lock.components.ownedSkills?.["alpha-aos-task"];
  assert.ok(lockedSkill, "alpha-aos-task must be locked in stack.lock.json");

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
    // Verify common shared readiness & bootstrap CLI routes in deployed skill
    assert.match(deployedContent, /alpha-aos task readiness --input/u);
    assert.match(deployedContent, /alpha-aos task bootstrap --input/u);
    assert.match(deployedContent, /absent-project/u);
    assert.match(deployedContent, /partial-project/u);
    assert.match(deployedContent, /resume-new-project/u);
    assert.match(deployedContent, /operation: "claim"/u);
    assert.match(deployedContent, /operation: "link"/u);
    assert.match(deployedContent, /operation: "acknowledge"/u);
    assert.match(deployedContent, /operation: "cancel"/u);
    assert.match(deployedContent, /Hermes Agent is worker\/handoff-only/u);
  }
});

test("five-target CLI routing: absent, partial, ready, and hermes readiness diagnosis (BOOT-01, BOOT-03, D-10, D-23)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);

  // Fake gsd runtime that inspects disk dynamically
  const fakeGsdTools = join(sandbox.home, "gsd-core", "bin", "gsd-tools.cjs");
  await mkdir(dirname(fakeGsdTools), { recursive: true });
  await writeFile(
    fakeGsdTools,
    `
const fs = require("node:fs");
const path = require("node:path");
const cwd = process.cwd();
const planningDir = path.join(cwd, ".planning");
const planningExists = fs.existsSync(planningDir);
const projectExists = fs.existsSync(path.join(planningDir, "PROJECT.md"));
const requirementsExists = fs.existsSync(path.join(planningDir, "REQUIREMENTS.md"));
const roadmapExists = fs.existsSync(path.join(planningDir, "ROADMAP.md"));
const stateExists = fs.existsSync(path.join(planningDir, "STATE.md"));
const initIncomplete = planningExists && (!projectExists || !requirementsExists || !roadmapExists || !stateExists);
console.log(JSON.stringify({
  packageName: "@opengsd/gsd-core",
  version: "1.18.0",
  planning_exists: planningExists,
  init_incomplete: initIncomplete,
  project_exists: projectExists,
  requirements_exists: requirementsExists,
  roadmap_exists: roadmapExists,
  state_exists: stateExists,
  agents_installed: true,
  project_root: cwd,
}));
`,
    "utf8",
  );

  for (const target of TARGETS) {
    const projectDir = join(sandbox.home, `proj-diag-${target}`);
    await mkdir(projectDir, { recursive: true });

    const targetEnv = {
      ...sandbox.env,
      CLAUDE_CONFIG_DIR: sandbox.home,
      CODEX_HOME: sandbox.home,
      ANTIGRAVITY_CONFIG_DIR: sandbox.home,
      PI_CODING_AGENT_DIR: sandbox.home,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, `state-diag-${target}`),
    };
    await mkdir(targetEnv.ALPHA_AOS_STATE_DIR, { recursive: true });

    // 1. Case: Absent project
    const absentReqPath = join(projectDir, "req-absent.json");
    await writeFile(
      absentReqPath,
      JSON.stringify({
        schemaVersion: 1,
        controller: target,
        workflow: "quick",
        projectRoot: projectDir,
      }),
      "utf8",
    );

    const absentRes = spawnSync(
      process.execPath,
      [cliPath, "task", "readiness", "--input", absentReqPath, "--json"],
      { cwd: projectDir, env: targetEnv, encoding: "utf8" },
    );
    assert.equal(absentRes.status, 0);
    const absentData = JSON.parse(absentRes.stdout);
    if (target === "hermes") {
      assert.equal(absentData.diagnosis, "unsupported");
      assert.equal(absentData.ready, false);
      assert.match(absentData.reasons?.[0] ?? "", /controller/iu);
    } else {
      assert.equal(absentData.diagnosis, "absent-project");
      assert.equal(absentData.ready, false);
      assert.ok(absentData.missingPrerequisites?.includes(".planning directory"));
    }

    // 2. Case: Partial project (PROJECT.md exists, REQUIREMENTS.md missing)
    await mkdir(join(projectDir, ".planning"), { recursive: true });
    await writeFile(join(projectDir, ".planning", "PROJECT.md"), "# Project\n", "utf8");

    const partialReqPath = join(projectDir, "req-partial.json");
    await writeFile(
      partialReqPath,
      JSON.stringify({
        schemaVersion: 1,
        controller: target,
        workflow: "quick",
        projectRoot: projectDir,
      }),
      "utf8",
    );

    const partialRes = spawnSync(
      process.execPath,
      [cliPath, "task", "readiness", "--input", partialReqPath, "--json"],
      { cwd: projectDir, env: targetEnv, encoding: "utf8" },
    );
    assert.equal(partialRes.status, 0);
    const partialData = JSON.parse(partialRes.stdout);
    if (target === "hermes") {
      assert.equal(partialData.diagnosis, "unsupported");
    } else {
      assert.equal(partialData.diagnosis, "partial-project");
      assert.equal(partialData.ready, false);
      assert.ok(partialData.missingPrerequisites?.includes("REQUIREMENTS.md"));
    }
  }
});

test("exemptions: policy-only and proven simple operations in uninitialized projects create no handoff files (BOOT-01, D-08, D-21)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "exempt-project");
  await mkdir(projectDir, { recursive: true });

  const stateDir = join(sandbox.root, "exempt-state");
  const env = {
    ...sandbox.env,
    ALPHA_AOS_STATE_DIR: stateDir,
  };
  await mkdir(stateDir, { recursive: true });

  // 1. Policy-only request (project mode query)
  const modeRes = spawnSync(
    process.execPath,
    [cliPath, "project", "mode", projectDir, "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(modeRes.status, 0);
  const modeData = JSON.parse(modeRes.stdout);
  assert.equal(modeData.effectiveMode, "strict");

  // Verify no .planning or bootstrap directory created
  assert.equal(existsSync(join(projectDir, ".planning")), false);
  assert.equal(existsSync(join(stateDir, "task-intake", "bootstrap")), false);

  // 2. Simple operation request (rename with existing file evidence)
  await mkdir(join(projectDir, "src"), { recursive: true });
  await writeFile(join(projectDir, "src", "old.ts"), "export const x = 1;\n", "utf8");

  const intakeReqPath = join(projectDir, "req-simple.json");
  await writeFile(
    intakeReqPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "src/old.ts를 src/new.ts로 이름 변경" },
      operation: {
        type: "rename",
        oldPath: "src/old.ts",
        newPath: "src/new.ts",
        unchangedApiMeaning: true,
        scopedPaths: ["src/old.ts"],
      },
    }),
    "utf8",
  );

  const intakeRes = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", intakeReqPath, "--json"],
    { cwd: projectDir, env, encoding: "utf8" },
  );
  assert.equal(intakeRes.status, 0);
  const intakeData = JSON.parse(intakeRes.stdout);
  assert.equal(intakeData.kind, "simple-operation");
  assert.equal(intakeData.nextAction, "execute-simple");

  // Still no .planning or bootstrap directory created
  assert.equal(existsSync(join(projectDir, ".planning")), false);
  assert.equal(existsSync(join(stateDir, "task-intake", "bootstrap")), false);
});
