import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
import {
  approveTaskContract,
  assertTaskStartable,
  loadTaskContract,
  previewTaskContract,
  taskContractDigest,
  TaskContractError,
  type TaskContract,
} from "../src/core/task-contract.js";
import {
  resolveTaskExecutionRoute,
  TASK_EXECUTION_STYLES,
  type TaskExecutionStyle,
} from "../src/core/task-style.js";
import { createTaskFixture, inventorySummaryContract, writeTaskContract } from "./helpers/task-fixture.js";
import type { HarnessId } from "../src/types.js";

const TARGETS: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

test("alpha-aos-task rendered guidance has locked integrity across all five harnesses and contains exact six-route procedure (D-01–D-04, D-21, D-23)", async (context) => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);

  const baseTemp = await mkdtemp(join(tmpdir(), "alpha-aos-task-style-routing-"));
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
    assert.ok(result.operationId !== null);

    const destination = destinationFor(target, "alpha-aos-task", targetHome);
    assert.ok(existsSync(destination));

    const content = await readFile(destination, "utf8");

    // All six Korean canonical labels present in exact rendered skill
    assert.match(content, /대화형-quick/u);
    assert.match(content, /대화형-quick-full/u);
    assert.match(content, /대화형-phase/u);
    assert.match(content, /오토파일럿-quick/u);
    assert.match(content, /오토파일럿-quick-full/u);
    assert.match(content, /오토파일럿-phase/u);

    // Exact route commands and boundaries in rendered guidance
    assert.match(content, /\$gsd-quick "<task description>"/u);
    assert.match(content, /\$gsd-quick "<task description>" --full/u);
    assert.match(content, /alpha-aos task preview/u);
    assert.match(content, /alpha-aos task approve/u);
    assert.match(content, /alpha-aos task start/u);

    // Prohibition against treating selection/bootstrap as approval/start
    assert.match(content, /executionAuthorized: false/u);
    assert.match(content, /Zero inline implementation/u);
  }
});

test("executionRoute maps every canonical style to exact surface and command without authority expansion (STYLE-01–STYLE-07)", () => {
  const styles: TaskExecutionStyle[] = [
    "conversational-quick",
    "conversational-quick-full",
    "conversational-phase",
    "autopilot-quick",
    "autopilot-quick-full",
    "autopilot-phase",
  ];

  for (const style of styles) {
    const route = resolveTaskExecutionRoute({ selectedStyle: style });
    assert.ok(route, `route must resolve for ${style}`);
    assert.equal(route.style, style);

    // Surface verification
    if (style.startsWith("conversational-")) {
      assert.equal(route.surface, "conversation");
      assert.equal(route.authorityRequirements.requiresExactApproval, false);
      assert.equal(route.authorityRequirements.requiresSeparateStart, false);
    } else {
      assert.equal(route.surface, "isolated-runner");
      assert.equal(route.authorityRequirements.requiresExactApproval, true);
      assert.equal(route.authorityRequirements.requiresSeparateStart, true);
    }

    // Never grants execution authority from route alone
    assert.equal(route.authorityRequirements.executionAuthorized, false);

    // Quality mapping
    if (style === "conversational-quick-full" || style === "autopilot-quick-full") {
      assert.equal(route.quickQuality, "full");
      assert.equal(route.authorityRequirements.requiresEvidenceValidation, true);
    } else if (style === "conversational-quick" || style === "autopilot-quick") {
      assert.equal(route.quickQuality, "standard");
    }
  }
});

test("approval-failed and approval-only prevent task start (D-14, D-15)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  await writeTaskContract(fixture.contractPath, contract);
  const { digest } = await loadTaskContract(fixture.contractPath);

  // 1. Unapproved contract: assertTaskStartable rejects with "not-approved"
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "not-approved");
      return true;
    },
  );

  // 2. Mismatched digest approval attempt fails and does not create valid approval
  const wrongDigest = "0".repeat(64);
  await assert.rejects(
    approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: wrongDigest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "contract-drift");
      return true;
    },
  );

  // Still not startable
  await assert.rejects(
    assertTaskStartable({ contractPath: fixture.contractPath, expectedDigest: digest, stateRoot: fixture.stateRoot }),
    (err: unknown) => {
      assert.ok(err instanceof TaskContractError);
      assert.equal(err.code, "not-approved");
      return true;
    },
  );

  // 3. Approval succeeds with matching digest
  const approved = await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(approved.status, "approved");

  // Startable now succeeds
  const startable = await assertTaskStartable({
    contractPath: fixture.contractPath,
    expectedDigest: digest,
    stateRoot: fixture.stateRoot,
  });
  assert.equal(startable.loaded.digest, digest);
});
