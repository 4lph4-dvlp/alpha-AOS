import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { packageRoot } from "../src/core/paths.js";
import {
  computeReviewWitnessPayloadDigest,
  readReviewWitnessReceipt,
  verifyReviewWitness,
  writeReviewWitnessReceipt,
  type ReviewWitnessReceipt,
} from "../src/core/task-review-witness.js";

const repositoryRoot = packageRoot();

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-witness-receipts-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const SAMPLE_HEAD_SHA = "1234567890abcdef1234567890abcdef12345678";
const SAMPLE_ARTIFACT_DIGEST = "a".repeat(64);
const SAMPLE_REPORT_DIGEST = "b".repeat(64);

function createSampleWitnessPayload(): Omit<ReviewWitnessReceipt, "receiptDigest"> {
  return {
    schemaVersion: 1,
    kind: "review-witness-receipt",
    requestId: "req-001",
    sessionId: "sess-001",
    reviewerHarness: "codex",
    reviewerVersion: "1.0.0",
    targetRevisionSha: SAMPLE_HEAD_SHA,
    artifactDigest: SAMPLE_ARTIFACT_DIGEST,
    witnessVerdict: "accepted",
    examinedAt: new Date().toISOString(),
    criteriaWitnessed: [
      { criterionId: "crit-1", verdict: "pass", findingSummary: "All criteria satisfied" },
    ],
    reportDigest: SAMPLE_REPORT_DIGEST,
  };
}

test("verifyReviewWitness succeeds when git HEAD and artifact digest match 100%", () => {
  const payload = createSampleWitnessPayload();
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  const result = verifyReviewWitness({
    receipt,
    currentHeadSha: SAMPLE_HEAD_SHA,
    currentArtifactDigest: SAMPLE_ARTIFACT_DIGEST,
  });

  assert.equal(result.valid, true);
  assert.equal(result.refusalCode, null);
  assert.equal(result.reason, null);
});

test("verifyReviewWitness rejects with STALE_REVIEW_REFUSED on 1-char revision mismatch (D-14, SC 3)", () => {
  const payload = createSampleWitnessPayload();
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  // Diverge the last char of currentHeadSha
  const divergedSha = SAMPLE_HEAD_SHA.slice(0, -1) + "9";

  const result = verifyReviewWitness({
    receipt,
    currentHeadSha: divergedSha,
    currentArtifactDigest: SAMPLE_ARTIFACT_DIGEST,
  });

  assert.equal(result.valid, false);
  assert.equal(result.refusalCode, "STALE_REVIEW_REFUSED");
  assert.match(result.reason ?? "", /Review witness evaluated git revision/);
});

test("verifyReviewWitness rejects with STALE_REVIEW_REFUSED on 1-byte artifact digest mismatch (D-14, SC 3)", () => {
  const payload = createSampleWitnessPayload();
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  // Diverge the last char of currentArtifactDigest
  const divergedDigest = SAMPLE_ARTIFACT_DIGEST.slice(0, -1) + "b";

  const result = verifyReviewWitness({
    receipt,
    currentHeadSha: SAMPLE_HEAD_SHA,
    currentArtifactDigest: divergedDigest,
  });

  assert.equal(result.valid, false);
  assert.equal(result.refusalCode, "STALE_REVIEW_REFUSED");
  assert.match(result.reason ?? "", /Review witness evaluated artifact/);
});

test("verifyReviewWitness rejects with MISSING_REVIEW_WITNESS when receipt is null (D-14)", () => {
  const result = verifyReviewWitness({
    receipt: null,
    currentHeadSha: SAMPLE_HEAD_SHA,
    currentArtifactDigest: SAMPLE_ARTIFACT_DIGEST,
  });

  assert.equal(result.valid, false);
  assert.equal(result.refusalCode, "MISSING_REVIEW_WITNESS");
  assert.match(result.reason ?? "", /No independent review witness receipt/);
});

test("verifyReviewWitness rejects with REVIEW_VERDICT_NOT_ACCEPTED when verdict is rejected", () => {
  const payload = {
    ...createSampleWitnessPayload(),
    witnessVerdict: "rejected" as const,
  };
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  const result = verifyReviewWitness({
    receipt,
    currentHeadSha: SAMPLE_HEAD_SHA,
    currentArtifactDigest: SAMPLE_ARTIFACT_DIGEST,
  });

  assert.equal(result.valid, false);
  assert.equal(result.refusalCode, "REVIEW_VERDICT_NOT_ACCEPTED");
});

test("writeReviewWitnessReceipt and readReviewWitnessReceipt round-trip with schema enforcement", async (context) => {
  const receiptsRoot = await scratch(context, "witness-round-trip");
  const payload = createSampleWitnessPayload();
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  const writtenPath = await writeReviewWitnessReceipt(receipt, receiptsRoot, repositoryRoot);
  assert.ok(writtenPath.endsWith("req-001-witness.json"));

  const readBack = await readReviewWitnessReceipt({
    requestId: "req-001",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.notEqual(readBack, null);
  assert.deepEqual(readBack, receipt);
});

test("readReviewWitnessReceipt returns null on digest mismatch", async (context) => {
  const receiptsRoot = await scratch(context, "witness-tamper");
  const payload = createSampleWitnessPayload();
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  const receipt: ReviewWitnessReceipt = { ...payload, receiptDigest };

  const writtenPath = await writeReviewWitnessReceipt(receipt, receiptsRoot, repositoryRoot);
  const content = JSON.parse(await readFile(writtenPath, "utf8")) as ReviewWitnessReceipt;
  await writeFile(
    writtenPath,
    JSON.stringify({ ...content, reviewerVersion: "9.9.9" }, null, 2) + "\n",
    "utf8",
  );

  const readBack = await readReviewWitnessReceipt({
    requestId: "req-001",
    receiptsRoot,
    packageRoot: repositoryRoot,
  });

  assert.equal(readBack, null);
});
