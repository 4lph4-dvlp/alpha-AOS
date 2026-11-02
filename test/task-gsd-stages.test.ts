import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { packageRoot } from "../src/core/paths.js";
import {
  computeStageReceiptDigest,
  getStageReceiptSchema,
  listStageReceipts,
  MANDATORY_GSD_FULL_STAGES,
  MAX_ARTIFACT_REFS_PER_RECEIPT,
  MAX_STAGE_RECEIPT_BYTES,
  MAX_STAGE_RECEIPTS_PER_RUN,
  readStageReceipt,
  requiredGsdQuickStages,
  verifyGsdFullEvidence,
  writeStageReceipt,
  type GsdQuickStage,
  type TaskGsdStageReceipt,
} from "../src/core/task-gsd-stages.js";
import { createTaskFixture } from "./helpers/task-fixture.js";

const TEST_WORKFLOW_SHA = "a".repeat(64);
const TEST_CONTRACT_DIGEST = "b".repeat(64);
const TEST_RUN_ID = "run-test-00000001";
const TEST_QUICK_ID = "01-quick-test";

function sampleReceipt(
  projectRoot: string,
  stage: GsdQuickStage,
  overrides: Partial<TaskGsdStageReceipt> = {},
): TaskGsdStageReceipt {
  const base: Omit<TaskGsdStageReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "task-gsd-stage-receipt",
    receiptId: `receipt-${stage}-01`,
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    canonicalProjectRoot: projectRoot,
    quickId: TEST_QUICK_ID,
    stage,
    quality: "full",
    harness: "codex",
    sessionId: "sess-001",
    runtimeVersion: "0.110.0",
    workflowSha256: TEST_WORKFLOW_SHA,
    invocationLocator: `call-${stage}-01`,
    invocationDigest: "c".repeat(64),
    resultLocator: `res-${stage}-01`,
    resultDigest: "d".repeat(64),
    outcome: "passed",
    evaluatedCommit: "e".repeat(40),
    inputArtifacts: [],
    outputArtifacts: [],
    observedAt: new Date().toISOString(),
    detail: `Completed stage ${stage}`,
    ...overrides,
  };
  const receiptDigest = computeStageReceiptDigest(base);
  return { ...base, receiptDigest };
}

test("schema: compiles and validates exact schema structure", async () => {
  const schema = await getStageReceiptSchema();
  assert.equal(schema.$id, "https://alpha-aos.local/schemas/task-gsd-stage-receipt.schema.json");
  assert.equal(schema.type, "object");
});

test("requiredGsdQuickStages: derives 7 mandatory stages and optional code-review gate", () => {
  const standard = requiredGsdQuickStages();
  assert.deepEqual(standard, MANDATORY_GSD_FULL_STAGES);
  assert.equal(standard.length, 7);

  const withReview = requiredGsdQuickStages({ codeReview: true });
  assert.equal(withReview.length, 8);
  assert.ok(withReview.includes("code-review"));
});

test("writeStageReceipt and readStageReceipt round-trip with digest enforcement", async (context) => {
  const fixture = await createTaskFixture(context);
  const receipt = sampleReceipt(fixture.projectRoot, "planning");

  const path = await writeStageReceipt({
    stateRoot: fixture.stateRoot,
    receipt,
  });

  const loaded = await readStageReceipt(path);
  assert.deepEqual(loaded, receipt);

  // Tampered digest fails on read
  const tampered = { ...receipt, receiptDigest: "f".repeat(64) };
  await writeFile(path, JSON.stringify(tampered, null, 2), "utf8");

  await assert.rejects(
    async () => readStageReceipt(path),
    /tampered digest/,
  );
});

test("STYLE-05 boundary: byte length bound 65535/65536 allowed, 65537 rejected", async (context) => {
  const fixture = await createTaskFixture(context);
  await mkdir(fixture.stateRoot, { recursive: true });

  const baseReceipt = sampleReceipt(fixture.projectRoot, "planning", { detail: "boundary test" });
  const baseJson = JSON.stringify(baseReceipt);
  const baseLen = Buffer.byteLength(baseJson, "utf8");

  // Helper to append trailing whitespace to hit exact byte size
  const makePaddedFile = (targetBytes: number) => {
    return baseJson + " ".repeat(targetBytes - baseLen);
  };

  // 1. 65535 bytes allowed
  const path65535 = join(fixture.stateRoot, "limit-65535.json");
  await writeFile(path65535, makePaddedFile(MAX_STAGE_RECEIPT_BYTES - 1), "utf8");
  const read65535 = await readStageReceipt(path65535);
  assert.equal(read65535.receiptId, baseReceipt.receiptId);

  // 2. 65536 bytes allowed
  const path65536 = join(fixture.stateRoot, "limit-65536.json");
  await writeFile(path65536, makePaddedFile(MAX_STAGE_RECEIPT_BYTES), "utf8");
  const read65536 = await readStageReceipt(path65536);
  assert.equal(read65536.receiptId, baseReceipt.receiptId);

  // 3. 65537 bytes rejected
  const path65537 = join(fixture.stateRoot, "limit-65537.json");
  await writeFile(path65537, makePaddedFile(MAX_STAGE_RECEIPT_BYTES + 1), "utf8");
  await assert.rejects(
    async () => readStageReceipt(path65537),
    /exceeding limit of 65536 bytes/,
  );
});

test("STYLE-05 boundary: artifact reference count 31/32 allowed, 33 rejected by schema", async (context) => {
  const fixture = await createTaskFixture(context);

  const makeArtifactRefs = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      path: `src/file_${i}.ts`,
      sha256: "0".repeat(64),
    }));

  // 32 items allowed
  const receipt32 = sampleReceipt(fixture.projectRoot, "implementation", {
    outputArtifacts: makeArtifactRefs(32),
  });
  const path32 = await writeStageReceipt({
    stateRoot: fixture.stateRoot,
    receipt: receipt32,
  });
  const read32 = await readStageReceipt(path32);
  assert.equal(read32.outputArtifacts.length, 32);

  // 33 items rejected by writeStageReceipt
  const receipt33 = sampleReceipt(fixture.projectRoot, "implementation", {
    outputArtifacts: makeArtifactRefs(33),
  });
  await assert.rejects(
    async () => writeStageReceipt({ stateRoot: fixture.stateRoot, receipt: receipt33 }),
    /validation failed/,
  );
});

test("STYLE-05 boundary: per-run receipt count 63/64 accepted, 65 rejected", async (context) => {
  const fixture = await createTaskFixture(context);
  const receiptsDir = join(fixture.stateRoot, "receipts", "stages", TEST_RUN_ID);
  await mkdir(receiptsDir, { recursive: true });

  for (let i = 0; i < 64; i++) {
    const receipt = sampleReceipt(fixture.projectRoot, "discussion", {
      receiptId: `receipt-bulk-${String(i).padStart(3, "0")}`,
    });
    await writeFile(join(receiptsDir, `${receipt.receiptId}.json`), JSON.stringify(receipt));
  }

  const listed = await listStageReceipts({ stateRoot: fixture.stateRoot, runId: TEST_RUN_ID });
  assert.equal(listed.length, 64);

  // 65th receipt causes listStageReceipts to reject
  const receipt65 = sampleReceipt(fixture.projectRoot, "discussion", {
    receiptId: `receipt-bulk-064`,
  });
  await writeFile(join(receiptsDir, `${receipt65.receiptId}.json`), JSON.stringify(receipt65));

  await assert.rejects(
    async () => listStageReceipts({ stateRoot: fixture.stateRoot, runId: TEST_RUN_ID }),
    /exceeds maximum allowed of 64/,
  );
});

test("verifyGsdFullEvidence: verifies a complete 7-stage chain with real artifacts", async (context) => {
  const fixture = await createTaskFixture(context);
  const projectRoot = fixture.projectRoot;

  // Create real artifact files on disk for each stage
  const planDir = join(projectRoot, ".planning", "quick", "01-quick-test");
  await mkdir(planDir, { recursive: true });

  const planPath = join(planDir, "01-quick-test-PLAN.md");
  const planContent = "# Plan for 01-quick-test\n";
  await writeFile(planPath, planContent, "utf8");
  const planHash = createHash("sha256").update(planContent).digest("hex");

  const summaryPath = join(planDir, "01-quick-test-SUMMARY.md");
  const summaryContent = "# Summary for 01-quick-test\n";
  await writeFile(summaryPath, summaryContent, "utf8");
  const summaryHash = createHash("sha256").update(summaryContent).digest("hex");

  const statePath = join(projectRoot, ".planning", "STATE.md");
  const stateContent = "| 01-quick-test | completed |\n";
  await writeFile(statePath, stateContent, "utf8");
  const stateHash = createHash("sha256").update(stateContent).digest("hex");

  const implPath = join(projectRoot, "src", "index.ts");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  const implContent = "export const ok = true;\n";
  await writeFile(implPath, implContent, "utf8");
  const implHash = createHash("sha256").update(implContent).digest("hex");

  const planRel = ".planning/quick/01-quick-test/01-quick-test-PLAN.md";
  const summaryRel = ".planning/quick/01-quick-test/01-quick-test-SUMMARY.md";
  const stateRel = ".planning/STATE.md";
  const implRel = "src/index.ts";

  // Build 7 stage receipts
  const receipts: TaskGsdStageReceipt[] = [
    sampleReceipt(projectRoot, "discussion"),
    sampleReceipt(projectRoot, "research"),
    sampleReceipt(projectRoot, "planning", {
      outputArtifacts: [{ path: planRel, sha256: planHash }],
    }),
    sampleReceipt(projectRoot, "plan-check", {
      // D-09, D-10: plan-check checks plan without requiring a fictional PLAN-CHECK.md
      inputArtifacts: [{ path: planRel, sha256: planHash }],
    }),
    sampleReceipt(projectRoot, "implementation", {
      inputArtifacts: [{ path: planRel, sha256: planHash }],
      outputArtifacts: [{ path: implRel, sha256: implHash }],
    }),
    sampleReceipt(projectRoot, "verification", {
      inputArtifacts: [
        { path: planRel, sha256: planHash },
        { path: implRel, sha256: implHash },
      ],
      outputArtifacts: [{ path: summaryRel, sha256: summaryHash }],
    }),
    sampleReceipt(projectRoot, "state-docs", {
      outputArtifacts: [{ path: stateRel, sha256: stateHash }],
    }),
  ];

  const evidence = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts,
  });

  assert.equal(evidence.status, "verified");
  assert.equal(evidence.stages.length, 7);
  assert.equal(evidence.missingStages.length, 0);
  assert.equal(evidence.failedStages.length, 0);
  assert.equal(evidence.invalidReceipts.length, 0);
});

test("verifyGsdFullEvidence: negative cases (missing, failed, tampered, symlink, path escape)", async (context) => {
  const fixture = await createTaskFixture(context);
  const projectRoot = fixture.projectRoot;

  // 1. Missing stage
  const incompleteReceipts = [
    sampleReceipt(projectRoot, "discussion"),
    sampleReceipt(projectRoot, "research"),
    sampleReceipt(projectRoot, "planning"),
  ];
  const missingResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts: incompleteReceipts,
  });
  assert.equal(missingResult.status, "missing");
  assert.ok(missingResult.missingStages.includes("plan-check"));
  assert.ok(missingResult.missingStages.includes("verification"));

  // 2. Failed stage outcome (needs-input or failed)
  const failedStageReceipts = [
    ...MANDATORY_GSD_FULL_STAGES.map((st) =>
      sampleReceipt(projectRoot, st, {
        outcome: st === "verification" ? "failed" : "passed",
        detail: st === "verification" ? "Tests broke" : undefined,
      }),
    ),
  ];
  const failedResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts: failedStageReceipts,
  });
  assert.equal(failedResult.status, "failed");
  assert.equal(failedResult.failedStages.length, 1);
  assert.equal(failedResult.failedStages[0]?.stage, "verification");

  // 3. Foreign / tampered contractDigest
  const tamperedReceipts = [
    sampleReceipt(projectRoot, "discussion", {
      contractDigest: "f".repeat(64),
    }),
  ];
  const tamperedResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts: tamperedReceipts,
  });
  assert.equal(tamperedResult.status, "invalid");
  assert.ok(tamperedResult.invalidReceipts.length > 0);

  // 4. Artifact hash mismatch on disk
  const testFilePath = join(projectRoot, "test.txt");
  await writeFile(testFilePath, "real content", "utf8");
  const badHashReceipts = [
    ...MANDATORY_GSD_FULL_STAGES.map((st) =>
      sampleReceipt(projectRoot, st, {
        inputArtifacts: st === "plan-check" ? [{ path: "test.txt", sha256: "0".repeat(64) }] : [],
      }),
    ),
  ];
  const hashMismatchResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts: badHashReceipts,
  });
  assert.equal(hashMismatchResult.status, "invalid");
  assert.ok(hashMismatchResult.issues.some((i) => i.includes("Artifact hash mismatch")));

  // 5. Path escape rejected
  const escapeReceipts = [
    ...MANDATORY_GSD_FULL_STAGES.map((st) =>
      sampleReceipt(projectRoot, st, {
        inputArtifacts: st === "plan-check" ? [{ path: "../secret.txt", sha256: "0".repeat(64) }] : [],
      }),
    ),
  ];
  const escapeResult = await verifyGsdFullEvidence({
    projectRoot,
    baseCommit: "0".repeat(40),
    contractDigest: TEST_CONTRACT_DIGEST,
    revision: 1,
    runId: TEST_RUN_ID,
    quickId: TEST_QUICK_ID,
    workflowSha256: TEST_WORKFLOW_SHA,
    receipts: escapeReceipts,
  });
  assert.equal(escapeResult.status, "invalid");
  assert.ok(escapeResult.issues.some((i) => i.includes("escapes project root")));
});
