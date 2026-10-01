import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import {
  captureTreeSnapshot,
  evaluateTreeMutations,
  IGNORED_OS_FILES,
  type TreeMutationResult,
} from "../src/core/tree-mutation-guard.js";
import {
  approveTaskContract,
  previewTaskContract,
} from "../src/core/task-contract.js";
import {
  createTaskFixture,
  fixturePorts,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  startFixtureTask,
  staticReviewerPort,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-tree-guard-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("evaluateTreeMutations reports ok when tree is identical (ROL-04, D-11)", async (context) => {
  const root = await scratch(context, "identical");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "console.log('hello');\n", "utf8");

  const before = await captureTreeSnapshot(root, ["src"]);
  const after = await captureTreeSnapshot(root, ["src"]);

  const result = evaluateTreeMutations(before, after);
  assert.equal(result.mutated, false);
  assert.equal(result.code, "ok");
  assert.deepEqual(result.violations, []);
});

test("evaluateTreeMutations detects modified file as INVALID_MUTATING_REVIEW (ROL-04, D-11)", async (context) => {
  const root = await scratch(context, "modify");
  await mkdir(join(root, "src"), { recursive: true });
  const file = join(root, "src", "index.ts");
  await writeFile(file, "console.log('before');\n", "utf8");

  const before = await captureTreeSnapshot(root, ["src"]);
  await writeFile(file, "console.log('after modified by reviewer');\n", "utf8");
  const after = await captureTreeSnapshot(root, ["src"]);

  const result = evaluateTreeMutations(before, after);
  assert.equal(result.mutated, true);
  assert.equal(result.code, "INVALID_MUTATING_REVIEW");
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0] ?? "", /^modified: src\/index\.ts$/u);
});

test("evaluateTreeMutations detects created file as INVALID_MUTATING_REVIEW (ROL-04, D-11)", async (context) => {
  const root = await scratch(context, "create");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "initial\n", "utf8");

  const before = await captureTreeSnapshot(root, ["src"]);
  await writeFile(join(root, "src", "rogue.ts"), "injected by rogue reviewer\n", "utf8");
  const after = await captureTreeSnapshot(root, ["src"]);

  const result = evaluateTreeMutations(before, after);
  assert.equal(result.mutated, true);
  assert.equal(result.code, "INVALID_MUTATING_REVIEW");
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0] ?? "", /^created: src\/rogue\.ts$/u);
});

test("evaluateTreeMutations detects deleted file as INVALID_MUTATING_REVIEW (ROL-04, D-11)", async (context) => {
  const root = await scratch(context, "delete");
  await mkdir(join(root, "src"), { recursive: true });
  const file1 = join(root, "src", "index.ts");
  const file2 = join(root, "src", "deleted.ts");
  await writeFile(file1, "keep\n", "utf8");
  await writeFile(file2, "to-be-deleted\n", "utf8");

  const before = await captureTreeSnapshot(root, ["src"]);
  await unlink(file2);
  const after = await captureTreeSnapshot(root, ["src"]);

  const result = evaluateTreeMutations(before, after);
  assert.equal(result.mutated, true);
  assert.equal(result.code, "INVALID_MUTATING_REVIEW");
  assert.equal(result.violations.length, 1);
  assert.match(result.violations[0] ?? "", /^deleted: src\/deleted\.ts$/u);
});

test("evaluateTreeMutations ignores harmless OS metadata files (.DS_Store, Thumbs.db, desktop.ini)", async (context) => {
  const root = await scratch(context, "os-ignore");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "hello\n", "utf8");

  const before = await captureTreeSnapshot(root, ["src"]);

  // Reviewer host created OS files
  for (const osFile of IGNORED_OS_FILES) {
    await writeFile(join(root, "src", osFile), "os metadata", "utf8");
  }

  const after = await captureTreeSnapshot(root, ["src"]);
  const result = evaluateTreeMutations(before, after);

  assert.equal(result.mutated, false);
  assert.equal(result.code, "ok");
  assert.deepEqual(result.violations, []);
});

test("startTask rejects review when rogue reviewer modifies project tree (ROL-04, D-11)", async (context) => {
  const fixture = await createTaskFixture(context);
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({
    contractPath: fixture.contractPath,
    expectedDigest: preview.digest,
    stateRoot: fixture.stateRoot,
  });

  // Reviewer port double that writes into projectRoot before returning a passing report
  const rogueReviewerPort = {
    async review(request: any) {
      // Infiltrate projectRoot and mutate application code
      await writeFile(
        join(fixture.projectRoot, "README.md"),
        "# Mutated by rogue reviewer during review session\n",
        "utf8"
      );
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: passingReview(request),
        issues: [],
      };
    },
  };

  const { run } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: rogueReviewerPort,
    }),
    expectedDigest: preview.digest,
  });

  // Must not be accepted!
  assert.notEqual(run.status, "accepted");
  assert.ok(
    run.verdict?.preconditions.some(
      (p) => p.id === "reviewer-tree-integrity" && p.satisfied === false && p.reason.includes("INVALID_MUTATING_REVIEW")
    ),
    "should contain failing reviewer-tree-integrity precondition"
  );
});
