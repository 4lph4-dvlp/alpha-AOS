import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { syncDirectory } from "./writer-lock.js";
import { validateManagedDocument } from "./validation.js";

export interface CriterionWitness {
  readonly criterionId: string;
  readonly verdict: "pass" | "fail" | "unknown";
  readonly findingSummary?: string | undefined;
}

export interface ReviewWitnessReceipt {
  readonly schemaVersion: 1;
  readonly kind: "review-witness-receipt";
  readonly requestId: string;
  readonly sessionId: string;
  readonly reviewerHarness: string;
  readonly reviewerVersion: string;
  readonly targetRevisionSha: string;
  readonly artifactDigest: string;
  readonly witnessVerdict: "accepted" | "rejected" | "unknown";
  readonly examinedAt: string;
  readonly criteriaWitnessed: readonly CriterionWitness[];
  readonly reportDigest: string;
  readonly receiptDigest: string;
}

export type ReviewWitnessRefusalCode =
  | "MISSING_REVIEW_WITNESS"
  | "STALE_REVIEW_REFUSED"
  | "REVIEW_VERDICT_NOT_ACCEPTED";

export interface ReadReviewWitnessOptions {
  readonly requestId: string;
  readonly receiptsRoot?: string | undefined;
  readonly packageRoot?: string | undefined;
}

export function computeReviewWitnessPayloadDigest(
  payload: Omit<ReviewWitnessReceipt, "receiptDigest">,
): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

let cachedWitnessSchema: Record<string, unknown> | null = null;

async function getWitnessSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedWitnessSchema !== null && !pkgRoot) {
    return cachedWitnessSchema;
  }
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "review-witness-receipt.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!pkgRoot) {
    cachedWitnessSchema = parsed;
  }
  return parsed;
}

export async function writeReviewWitnessReceipt(
  receipt: ReviewWitnessReceipt,
  receiptsRoot?: string,
  pkgRoot?: string,
): Promise<string> {
  const text = JSON.stringify(receipt, null, 2) + "\n";

  const schema = await getWitnessSchema(pkgRoot);
  const validation = validateManagedDocument<ReviewWitnessReceipt>({
    text,
    format: "json",
    kind: "task-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(`Review witness receipt validation failed: ${JSON.stringify(validation.issues)}`);
  }

  const validReceipt = validation.value;
  const targetDir = receiptsRoot ?? join(userStateRoot(), "receipts", "witnesses");
  const fileName = `${validReceipt.requestId}-witness.json`;
  const targetPath = join(targetDir, fileName);

  await mkdir(targetDir, { recursive: true, mode: 0o700 });
  const tempPath = join(targetDir, `.${fileName}.${randomUUID()}.tmp`);
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(text, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, targetPath);
  await syncDirectory(targetDir);
  return targetPath;
}

export async function readReviewWitnessReceipt(
  options: ReadReviewWitnessOptions,
): Promise<ReviewWitnessReceipt | null> {
  const targetDir = options.receiptsRoot ?? join(userStateRoot(), "receipts", "witnesses");
  const fileName = `${options.requestId}-witness.json`;
  const targetPath = join(targetDir, fileName);

  if (!existsSync(targetPath)) {
    return null;
  }

  let text: string;
  try {
    text = await readFile(targetPath, "utf8");
  } catch {
    return null;
  }

  try {
    const schema = await getWitnessSchema(options.packageRoot);
    const validation = validateManagedDocument<ReviewWitnessReceipt>({
      text,
      format: "json",
      kind: "task-receipt",
      schema,
    });
    if (!validation.ok || validation.value === null) {
      return null;
    }
    const receipt = validation.value;
    const { receiptDigest, ...payload } = receipt;
    const computed = computeReviewWitnessPayloadDigest(payload);
    if (computed !== receiptDigest) {
      return null;
    }
    return receipt;
  } catch {
    return null;
  }
}

export function verifyReviewWitness(options: {
  receipt: ReviewWitnessReceipt | null;
  currentHeadSha: string;
  currentArtifactDigest: string;
}): {
  valid: boolean;
  refusalCode: ReviewWitnessRefusalCode | null;
  reason: string | null;
} {
  const { receipt, currentHeadSha, currentArtifactDigest } = options;

  if (!receipt) {
    return {
      valid: false,
      refusalCode: "MISSING_REVIEW_WITNESS",
      reason: "No independent review witness receipt recorded for this run.",
    };
  }

  if (receipt.targetRevisionSha !== currentHeadSha) {
    return {
      valid: false,
      refusalCode: "STALE_REVIEW_REFUSED",
      reason: `Review witness evaluated git revision ${receipt.targetRevisionSha.slice(0, 12)}, but current HEAD is ${currentHeadSha.slice(0, 12)}.`,
    };
  }

  if (receipt.artifactDigest !== currentArtifactDigest) {
    return {
      valid: false,
      refusalCode: "STALE_REVIEW_REFUSED",
      reason: `Review witness evaluated artifact ${receipt.artifactDigest.slice(0, 12)}, but current artifact digest is ${currentArtifactDigest.slice(0, 12)}.`,
    };
  }

  if (receipt.witnessVerdict !== "accepted") {
    return {
      valid: false,
      refusalCode: "REVIEW_VERDICT_NOT_ACCEPTED",
      reason: `Review witness recorded verdict "${receipt.witnessVerdict}", expected "accepted".`,
    };
  }

  return { valid: true, refusalCode: null, reason: null };
}
