import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("alpha-aos-task deployed skill has exact integrity and shared intake procedure across all five target fixtures (ENTRY-01, ENTRY-05, D-12, D-20)", async (context) => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-task-intake-routing-"));
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
    // Verify common shared intake CLI route in deployed skill
    assert.match(deployedContent, /alpha-aos task intake --input/u);
    assert.match(deployedContent, /TaskIntakePublicDecision/u);
    assert.match(deployedContent, /대화형-quick/u);
    assert.match(deployedContent, /오토파일럿-phase/u);
    assert.match(deployedContent, /Mode Preference Invariant/u);
  }
});

test("five-target CLI routing: strict mode shows exact 6 choices, flexible returns adaptive intake (ENTRY-01, ENTRY-06, D-05, D-17)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "strict-vs-flex-project");
  await mkdir(projectDir, { recursive: true });

  for (const target of TARGETS) {
    const targetEnv = {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, `state-${target}`),
    };
    await mkdir(targetEnv.ALPHA_AOS_STATE_DIR, { recursive: true });

    // 1. Strict mode (default) substantial task
    const strictReqPath = join(sandbox.home, `req-strict-${target}.json`);
    await writeFile(
      strictReqPath,
      JSON.stringify({
        schemaVersion: 1,
        projectRoot: projectDir,
        request: {
          text: "Implement OAuth2 social login with Google and GitHub",
          shortGoal: "OAuth2 login",
        },
      }),
      "utf8",
    );

    const strictRun = spawnSync(
      process.execPath,
      [cliPath, "task", "intake", "--input", strictReqPath, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(strictRun.status, 0, `strict run failed for target ${target}: ${strictRun.stderr}`);
    const strictDecision = JSON.parse(strictRun.stdout);
    assert.equal(strictDecision.kind, "substantial-work");
    assert.equal(strictDecision.nextAction, "choose-style");
    assert.equal(strictDecision.executionAuthorized, false);
    assert.ok(strictDecision.chooser);
    assert.equal(strictDecision.chooser.options.length, 6);
    assert.equal(strictDecision.chooser.options[0].label, "대화형-quick");
    assert.equal(strictDecision.chooser.options[5].label, "오토파일럿-phase");

    // 2. Set mode to flexible
    const setFlex = spawnSync(
      process.execPath,
      [cliPath, "project", "mode", "set", "flexible", projectDir, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(setFlex.status, 0);
    const setPlan = JSON.parse(setFlex.stdout);
    const applyFlex = spawnSync(
      process.execPath,
      [cliPath, "project", "mode", "set", "flexible", projectDir, "--apply", "--plan-digest", setPlan.planDigest, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(applyFlex.status, 0);

    // 3. Flexible mode substantial task: returns adaptive-intake without mandatory 6-item chooser
    const flexReqPath = join(sandbox.home, `req-flex-${target}.json`);
    await writeFile(
      flexReqPath,
      JSON.stringify({
        schemaVersion: 1,
        projectRoot: projectDir,
        request: {
          text: "Implement payment checkout integration with Stripe",
          shortGoal: "Stripe checkout",
        },
      }),
      "utf8",
    );

    const flexRun = spawnSync(
      process.execPath,
      [cliPath, "task", "intake", "--input", flexReqPath, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(flexRun.status, 0, `flex run failed for target ${target}`);
    const flexDecision = JSON.parse(flexRun.stdout);
    assert.equal(flexDecision.kind, "substantial-work");
    assert.equal(flexDecision.nextAction, "adaptive-intake");
    assert.equal(flexDecision.executionAuthorized, false);
    assert.ok(!flexDecision.chooser);

    // Reset project mode to strict for next iteration
    const setStrict = spawnSync(
      process.execPath,
      [cliPath, "project", "mode", "set", "strict", projectDir, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    const strictPlan = JSON.parse(setStrict.stdout);
    spawnSync(
      process.execPath,
      [cliPath, "project", "mode", "set", "strict", projectDir, "--apply", "--plan-digest", strictPlan.planDigest, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
  }
});

test("five-target CLI routing: direct GSD command, explicit style, and simple operation bypass chooser (ENTRY-02, ENTRY-04, ENTRY-07, D-02, D-03, D-13)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "bypass-project");
  await mkdir(join(projectDir, "src"), { recursive: true });
  await writeFile(join(projectDir, "src", "old.ts"), "export const a = 1;\n", "utf8");

  for (const target of TARGETS) {
    const targetEnv = {
      ...sandbox.env,
      ALPHA_AOS_STATE_DIR: join(sandbox.root, `state-bypass-${target}`),
    };
    await mkdir(targetEnv.ALPHA_AOS_STATE_DIR, { recursive: true });

    // 1. Direct GSD command invocation
    const gsdCmdPath = join(sandbox.home, `req-gsd-${target}.json`);
    await writeFile(
      gsdCmdPath,
      JSON.stringify({
        schemaVersion: 1,
        projectRoot: projectDir,
        request: { text: "gsd-discuss-phase 28 --auto" },
      }),
      "utf8",
    );
    const gsdRun = spawnSync(
      process.execPath,
      [cliPath, "task", "intake", "--input", gsdCmdPath, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(gsdRun.status, 0);
    const gsdDecision = JSON.parse(gsdRun.stdout);
    assert.equal(gsdDecision.kind, "explicit-command");
    assert.equal(gsdDecision.nextAction, "execute-explicit");
    assert.ok(!gsdDecision.chooser);
    assert.equal(gsdDecision.commandRoute.command, "gsd-discuss-phase");
    assert.equal(gsdDecision.commandRoute.phase, "28");

    // 2. Explicit style selection
    const explicitStylePath = join(sandbox.home, `req-style-${target}.json`);
    await writeFile(
      explicitStylePath,
      JSON.stringify({
        schemaVersion: 1,
        projectRoot: projectDir,
        request: { text: "대화형-quick-full로 작업 진행" },
      }),
      "utf8",
    );
    const styleRun = spawnSync(
      process.execPath,
      [cliPath, "task", "intake", "--input", explicitStylePath, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(styleRun.status, 0);
    const styleDecision = JSON.parse(styleRun.stdout);
    assert.equal(styleDecision.kind, "explicit-style");
    assert.equal(styleDecision.selectedStyle, "conversational-quick-full");
    assert.ok(!styleDecision.chooser);

    // 3. Simple operation: local file rename with unchanged API meaning
    const renamePath = join(sandbox.home, `req-rename-${target}.json`);
    await writeFile(
      renamePath,
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
    const renameRun = spawnSync(
      process.execPath,
      [cliPath, "task", "intake", "--input", renamePath, "--json"],
      { env: targetEnv, encoding: "utf8" },
    );
    assert.equal(renameRun.status, 0);
    const renameDecision = JSON.parse(renameRun.stdout);
    assert.equal(renameDecision.kind, "simple-operation");
    assert.equal(renameDecision.nextAction, "execute-simple");
    assert.ok(!renameDecision.chooser);
  }
});

test("authority boundaries: style selection grants zero execution effects or contract approval (D-04, D-18, D-19)", async (context) => {
  const sandbox = await createIsolatedSandbox(context);
  const projectDir = join(sandbox.home, "authority-guard-project");
  await mkdir(projectDir, { recursive: true });

  const inputPath = join(sandbox.home, "style-req.json");
  await writeFile(
    inputPath,
    JSON.stringify({
      schemaVersion: 1,
      projectRoot: projectDir,
      request: { text: "Implement critical security fixes" },
      answer: { canonicalStyle: "autopilot-phase" },
    }),
    "utf8",
  );

  const intakeRun = spawnSync(
    process.execPath,
    [cliPath, "task", "intake", "--input", inputPath, "--json"],
    { env: sandbox.env, encoding: "utf8" },
  );
  assert.equal(intakeRun.status, 0);
  const decision = JSON.parse(intakeRun.stdout);

  assert.equal(decision.kind, "substantial-work");
  assert.equal(decision.selectedStyle, "autopilot-phase");
  // CRITICAL: executionAuthorized is false
  assert.equal(decision.executionAuthorized, false);

  // Verify behavior policy file was NOT modified to store style
  const policyFile = join(projectDir, ".alpha-aos", "behavior.json");
  if (existsSync(policyFile)) {
    const policyContent = JSON.parse(await readFile(policyFile, "utf8"));
    assert.equal(policyContent.style, undefined, "behavior policy must never store execution style");
  }
});
