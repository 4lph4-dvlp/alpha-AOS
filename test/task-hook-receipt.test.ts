import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { packageRoot } from "../src/core/paths.js";
import {
  computeReceiptPayloadDigest,
  executeHookWithReceipt,
  readHookReceipt,
  writeHookReceipt,
  type HookExecutionReceipt,
} from "../src/core/task-hook-receipt.js";

const repositoryRoot = packageRoot();

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-hook-receipts-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const DUMMY_TARGET_SHA = "a".repeat(40);
const DUMMY_WORKING_TREE_DIGEST = "b".repeat(64);
const DUMMY_STDOUT_SHA = "c".repeat(64);
const DUMMY_STDERR_SHA = "d".repeat(64);

test("computeReceiptPayloadDigest calculates deterministic SHA-256 over canonical keys", () => {
  const payload: Omit<HookExecutionReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId: "test-receipt-1",
    hookPoint: "execute:pre",
    phaseId: "17",
    planId: "01",
    targetRevisionSha: DUMMY_TARGET_SHA,
    workingTreeDigest: DUMMY_WORKING_TREE_DIGEST,
    command: "node",
    args: ["--version"],
    exitCode: 0,
    stdoutSha256: DUMMY_STDOUT_SHA,
    stderrSha256: DUMMY_STDERR_SHA,
    durationMs: 42,
    executedAt: new Date().toISOString(),
    status: "passed",
  };

  const digest1 = computeReceiptPayloadDigest(payload);
  const digest2 = computeReceiptPayloadDigest(payload);
  assert.equal(digest1, digest2);
  assert.match(digest1, /^[0-9a-f]{64}$/);
});

test("writeHookReceipt and readHookReceipt round-trip with schema enforcement", async (context) => {
  const receiptsRoot = await scratch(context, "round-trip");
  const payload: Omit<HookExecutionReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId: "receipt-round-trip-01",
    hookPoint: "plan:pre",
    phaseId: "17",
    planId: "01",
    targetRevisionSha: DUMMY_TARGET_SHA,
    workingTreeDigest: DUMMY_WORKING_TREE_DIGEST,
    command: "node",
    args: ["-v"],
    exitCode: 0,
    stdoutSha256: DUMMY_STDOUT_SHA,
    stderrSha256: DUMMY_STDERR_SHA,
    durationMs: 12,
    executedAt: new Date().toISOString(),
    status: "passed",
  };
  const receiptDigest = computeReceiptPayloadDigest(payload);
  const receipt: HookExecutionReceipt = { ...payload, receiptDigest };

  const writtenPath = await writeHookReceipt(receipt, receiptsRoot, repositoryRoot);
  assert.ok(writtenPath.endsWith("17-01-plan-pre.json"));

  const readBack = await readHookReceipt({
    phaseId: "17",
    planId: "01",
    hookPoint: "plan:pre",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.notEqual(readBack, null);
  assert.deepEqual(readBack, receipt);
});

test("writeHookReceipt rejects invalid receipt missing required fields", async (context) => {
  const receiptsRoot = await scratch(context, "schema-invalid");
  const invalidReceipt = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId: "invalid-01",
    // missing hookPoint, phaseId, etc.
  } as unknown as HookExecutionReceipt;

  await assert.rejects(
    async () => {
      await writeHookReceipt(invalidReceipt, receiptsRoot, repositoryRoot);
    },
    /Hook receipt validation failed/,
  );
});

test("readHookReceipt returns null on tampered receipt digest", async (context) => {
  const receiptsRoot = await scratch(context, "tamper");
  const payload: Omit<HookExecutionReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "hook-execution-receipt",
    receiptId: "tamper-01",
    hookPoint: "verify:post",
    phaseId: "17",
    planId: null,
    targetRevisionSha: DUMMY_TARGET_SHA,
    workingTreeDigest: DUMMY_WORKING_TREE_DIGEST,
    command: "node",
    args: [],
    exitCode: 0,
    stdoutSha256: DUMMY_STDOUT_SHA,
    stderrSha256: DUMMY_STDERR_SHA,
    durationMs: 5,
    executedAt: new Date().toISOString(),
    status: "passed",
  };
  const receiptDigest = "0".repeat(64); // Tampered digest
  const receipt: HookExecutionReceipt = { ...payload, receiptDigest };

  const writtenPath = await writeHookReceipt(receipt, receiptsRoot, repositoryRoot);
  // Modify payload inside the file to cause digest mismatch
  const content = JSON.parse(await readFile(writtenPath, "utf8")) as HookExecutionReceipt;
  await writeFile(
    writtenPath,
    JSON.stringify({ ...content, durationMs: 99999 }, null, 2) + "\n",
    "utf8",
  );

  const readBack = await readHookReceipt({
    phaseId: "17",
    planId: null,
    hookPoint: "verify:post",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.equal(readBack, null);
});

test("executeHookWithReceipt writes passing receipt and returns receipt on success", async (context) => {
  const receiptsRoot = await scratch(context, "exec-pass");
  const receipt = await executeHookWithReceipt({
    hookPoint: "execute:pre",
    phaseId: "17",
    planId: "01",
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwd: repositoryRoot,
    targetRevisionSha: DUMMY_TARGET_SHA,
    workingTreeDigest: DUMMY_WORKING_TREE_DIGEST,
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.equal(receipt.status, "passed");
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.hookPoint, "execute:pre");
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);

  const readBack = await readHookReceipt({
    phaseId: "17",
    planId: "01",
    hookPoint: "execute:pre",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });
  assert.notEqual(readBack, null);
  assert.equal(readBack?.status, "passed");
});

test("executeHookWithReceipt writes failed receipt and throws HOOK_EXECUTION_FAILED on non-zero exit (D-13)", async (context) => {
  const receiptsRoot = await scratch(context, "exec-fail");

  await assert.rejects(
    async () => {
      await executeHookWithReceipt({
        hookPoint: "execute:post",
        phaseId: "17",
        planId: "01",
        command: process.execPath,
        args: ["-e", "process.exit(42)"],
        cwd: repositoryRoot,
        targetRevisionSha: DUMMY_TARGET_SHA,
        workingTreeDigest: DUMMY_WORKING_TREE_DIGEST,
        receiptsRoot,
        packageRoot: repositoryRoot,
      });
    },
    /HOOK_EXECUTION_FAILED.*42/,
  );

  const readBack = await readHookReceipt({
    phaseId: "17",
    planId: "01",
    hookPoint: "execute:post",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.notEqual(readBack, null);
  assert.equal(readBack?.status, "failed");
  assert.equal(readBack?.exitCode, 42);
});
