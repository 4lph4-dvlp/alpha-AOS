import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readdir, readFile, rename, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, relative, resolve } from "node:path";
import { packageRoot } from "./paths.js";
import { canonicalJsonValue } from "./task-contract.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";
import { syncDirectory } from "./writer-lock.js";

export const MAX_STAGE_RECEIPT_BYTES = 65536; // 64 KiB
export const MAX_STAGE_RECEIPTS_PER_RUN = 64;
export const MAX_ARTIFACT_REFS_PER_RECEIPT = 32;
export const MAX_RELATIVE_PATH_LENGTH = 512;
export const MAX_STAGE_DETAIL_LENGTH = 1000;

export type GsdQuickStage =
  | "discussion"
  | "research"
  | "planning"
  | "plan-check"
  | "implementation"
  | "verification"
  | "state-docs"
  | "code-review";

export type GsdStageOutcome = "passed" | "failed" | "skipped" | "needs-input" | "unknown";

export interface GsdArtifactReference {
  readonly path: string;
  readonly sha256: string;
}

export interface TaskGsdStageReceipt {
  readonly schemaVersion: 1;
  readonly kind: "task-gsd-stage-receipt";
  readonly receiptId: string;
  readonly contractDigest: string;
  readonly revision: number;
  readonly runId: string;
  readonly canonicalProjectRoot: string;
  readonly quickId: string;
  readonly stage: GsdQuickStage;
  readonly quality: "full";
  readonly harness: string;
  readonly sessionId: string;
  readonly runtimeVersion: string | null;
  readonly workflowSha256: string;
  readonly invocationLocator: string;
  readonly invocationDigest: string;
  readonly resultLocator: string;
  readonly resultDigest: string;
  readonly outcome: GsdStageOutcome;
  readonly evaluatedCommit: string | null;
  readonly inputArtifacts: readonly GsdArtifactReference[];
  readonly outputArtifacts: readonly GsdArtifactReference[];
  readonly observedAt: string;
  readonly detail?: string | null | undefined;
  readonly receiptDigest: string;
}

export const MANDATORY_GSD_FULL_STAGES: readonly GsdQuickStage[] = [
  "discussion",
  "research",
  "planning",
  "plan-check",
  "implementation",
  "verification",
  "state-docs",
] as const;

export function requiredGsdQuickStages(options?: { codeReview?: boolean }): readonly GsdQuickStage[] {
  if (options?.codeReview) {
    return [...MANDATORY_GSD_FULL_STAGES, "code-review"];
  }
  return [...MANDATORY_GSD_FULL_STAGES];
}

export function computeStageReceiptDigest(payload: Omit<TaskGsdStageReceipt, "receiptDigest"> | TaskGsdStageReceipt): string {
  const { receiptDigest: _ignored, ...rest } = payload as unknown as Record<string, unknown>;
  const canonical = canonicalJsonValue(rest);
  return createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
}

let cachedStageReceiptSchema: Record<string, unknown> | null = null;

export async function getStageReceiptSchema(pkgRoot: string = packageRoot()): Promise<Record<string, unknown>> {
  if (cachedStageReceiptSchema !== null) return cachedStageReceiptSchema;
  const path = join(pkgRoot, "schemas", "task-gsd-stage-receipt.schema.json");
  const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  cachedStageReceiptSchema = parsed;
  return parsed;
}

export function stageReceiptsDir(stateRoot: string, runId: string): string {
  return join(stateRoot, "receipts", "stages", runId);
}

export function stageReceiptPath(stateRoot: string, runId: string, receiptId: string): string {
  return join(stageReceiptsDir(stateRoot, runId), `${receiptId}.json`);
}

function describeValidationIssue(issue: ValidationIssue | undefined, fallback: string): string {
  return issue === undefined ? fallback : `${issue.code} at ${issue.documentPath} (${issue.expected})`;
}

export async function writeStageReceipt(options: {
  stateRoot: string;
  receipt: TaskGsdStageReceipt;
  pkgRoot?: string;
}): Promise<string> {
  const { stateRoot, receipt, pkgRoot } = options;
  const expectedDigest = computeStageReceiptDigest(receipt);
  if (receipt.receiptDigest !== expectedDigest) {
    throw new Error(`Stage receipt digest mismatch: declared ${receipt.receiptDigest}, computed ${expectedDigest}`);
  }

  const serialized = JSON.stringify(receipt, null, 2);
  const byteLength = Buffer.byteLength(serialized, "utf8");
  if (byteLength > MAX_STAGE_RECEIPT_BYTES) {
    throw new Error(`Stage receipt size ${byteLength} bytes exceeds limit of ${MAX_STAGE_RECEIPT_BYTES} bytes`);
  }

  const schema = await getStageReceiptSchema(pkgRoot);
  const validation = validateManagedDocument<TaskGsdStageReceipt>({
    text: serialized,
    format: "json",
    kind: "task-receipt",
    schema,
    domain: rejectRawCredentials,
  });

  if (!validation.ok) {
    throw new Error(`Stage receipt validation failed: ${describeValidationIssue(validation.issues[0], validation.status)}`);
  }

  const targetDir = stageReceiptsDir(stateRoot, receipt.runId);
  await mkdir(targetDir, { recursive: true });

  const targetPath = stageReceiptPath(stateRoot, receipt.runId, receipt.receiptId);
  const tempPath = join(targetDir, `.${receipt.receiptId}.${randomUUID()}.tmp`);

  await readFile(tempPath, "utf8").catch(() => undefined); // sanity
  const handle = await open(tempPath, "w");
  try {
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tempPath, targetPath);
  await syncDirectory(targetDir).catch(() => undefined);
  return targetPath;
}

export async function readStageReceipt(path: string, pkgRoot?: string): Promise<TaskGsdStageReceipt> {
  let fileStat: Awaited<ReturnType<typeof lstat>>;
  try {
    fileStat = await lstat(path);
  } catch (error) {
    throw new Error(`Stage receipt file unreadable at ${path}: ${(error as Error).message}`);
  }

  if (fileStat.isSymbolicLink()) {
    throw new Error(`Stage receipt at ${path} is a symbolic link; symbolic links are forbidden`);
  }
  if (!fileStat.isFile()) {
    throw new Error(`Stage receipt at ${path} is not a regular file`);
  }
  if (fileStat.size > MAX_STAGE_RECEIPT_BYTES) {
    throw new Error(`Stage receipt at ${path} is ${fileStat.size} bytes, exceeding limit of ${MAX_STAGE_RECEIPT_BYTES} bytes`);
  }

  const content = await readFile(path, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_STAGE_RECEIPT_BYTES) {
    throw new Error(`Stage receipt content at ${path} exceeds limit of ${MAX_STAGE_RECEIPT_BYTES} bytes`);
  }

  const schema = await getStageReceiptSchema(pkgRoot);
  const validation = validateManagedDocument<TaskGsdStageReceipt>({
    text: content,
    format: "json",
    kind: "task-receipt",
    schema,
    domain: rejectRawCredentials,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(`Stage receipt at ${path} is invalid: ${describeValidationIssue(validation.issues[0], validation.status)}`);
  }

  const receipt = validation.value;
  const expectedDigest = computeStageReceiptDigest(receipt);
  if (receipt.receiptDigest !== expectedDigest) {
    throw new Error(`Stage receipt at ${path} has tampered digest: declared ${receipt.receiptDigest}, computed ${expectedDigest}`);
  }

  return receipt;
}

export async function listStageReceipts(options: {
  stateRoot: string;
  runId: string;
  pkgRoot?: string;
}): Promise<TaskGsdStageReceipt[]> {
  const dir = stageReceiptsDir(options.stateRoot, options.runId);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const jsonFiles = entries.filter((e) => e.endsWith(".json") && !e.startsWith(".")).sort();
  if (jsonFiles.length > MAX_STAGE_RECEIPTS_PER_RUN) {
    throw new Error(
      `Per-run stage receipt count ${jsonFiles.length} exceeds maximum allowed of ${MAX_STAGE_RECEIPTS_PER_RUN}`,
    );
  }

  const receipts: TaskGsdStageReceipt[] = [];
  for (const file of jsonFiles) {
    receipts.push(await readStageReceipt(join(dir, file), options.pkgRoot));
  }
  return receipts;
}

export interface TaskGsdFullEvidence {
  readonly status: "verified" | "missing" | "failed" | "invalid";
  readonly quickId: string;
  readonly stages: readonly TaskGsdStageReceipt[];
  readonly missingStages: readonly GsdQuickStage[];
  readonly failedStages: readonly { stage: GsdQuickStage; outcome: GsdStageOutcome; reason?: string }[];
  readonly invalidReceipts: readonly string[];
  readonly issues: readonly string[];
}

function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

async function verifyArtifactReference(
  canonicalProjectRoot: string,
  ref: GsdArtifactReference,
): Promise<{ ok: boolean; reason?: string }> {
  if (ref.path.length > MAX_RELATIVE_PATH_LENGTH) {
    return { ok: false, reason: `Artifact path exceeds maximum length of ${MAX_RELATIVE_PATH_LENGTH}: ${ref.path}` };
  }
  if (isAbsolute(ref.path)) {
    return { ok: false, reason: `Artifact path must be relative to project root: ${ref.path}` };
  }

  const targetPath = resolve(canonicalProjectRoot, normalize(ref.path));
  if (!inside(canonicalProjectRoot, targetPath)) {
    return { ok: false, reason: `Artifact path escapes project root: ${ref.path}` };
  }

  let fileStat: Awaited<ReturnType<typeof lstat>>;
  try {
    fileStat = await lstat(targetPath);
  } catch (error) {
    return { ok: false, reason: `Artifact not found or unreadable at ${ref.path}: ${(error as Error).message}` };
  }

  if (fileStat.isSymbolicLink()) {
    return { ok: false, reason: `Artifact at ${ref.path} is a symbolic link; symbolic links are forbidden` };
  }
  if (!fileStat.isFile()) {
    return { ok: false, reason: `Artifact at ${ref.path} is not a regular file` };
  }

  const content = await readFile(targetPath);
  const actualHash = createHash("sha256").update(content).digest("hex");
  if (actualHash !== ref.sha256) {
    return {
      ok: false,
      reason: `Artifact hash mismatch for ${ref.path}: expected ${ref.sha256}, actual ${actualHash}`,
    };
  }

  return { ok: true };
}

export async function verifyGsdFullEvidence(options: {
  projectRoot: string;
  baseCommit: string;
  contractDigest: string;
  revision: number;
  runId: string;
  quickId: string;
  workflowSha256: string;
  receipts: readonly TaskGsdStageReceipt[];
  requiredStages?: readonly GsdQuickStage[];
}): Promise<TaskGsdFullEvidence> {
  const canonicalProjectRoot = resolve(options.projectRoot);
  const required = options.requiredStages ?? MANDATORY_GSD_FULL_STAGES;
  const issues: string[] = [];
  const invalidReceipts: string[] = [];
  const failedStages: { stage: GsdQuickStage; outcome: GsdStageOutcome; reason?: string }[] = [];

  if (options.receipts.length > MAX_STAGE_RECEIPTS_PER_RUN) {
    issues.push(`Receipt count ${options.receipts.length} exceeds limit of ${MAX_STAGE_RECEIPTS_PER_RUN}`);
    return {
      status: "invalid",
      quickId: options.quickId,
      stages: options.receipts,
      missingStages: required,
      failedStages: [],
      invalidReceipts: ["exceeded-max-receipt-count"],
      issues,
    };
  }

  // 1. Validate receipt bindings
  const validReceipts: TaskGsdStageReceipt[] = [];
  for (const receipt of options.receipts) {
    let receiptValid = true;

    if (receipt.contractDigest !== options.contractDigest) {
      issues.push(`Receipt ${receipt.receiptId} contractDigest ${receipt.contractDigest} does not match expected ${options.contractDigest}`);
      receiptValid = false;
    }
    if (receipt.revision !== options.revision) {
      issues.push(`Receipt ${receipt.receiptId} revision ${receipt.revision} does not match expected ${options.revision}`);
      receiptValid = false;
    }
    if (receipt.runId !== options.runId) {
      issues.push(`Receipt ${receipt.receiptId} runId ${receipt.runId} does not match expected ${options.runId}`);
      receiptValid = false;
    }
    if (resolve(receipt.canonicalProjectRoot) !== canonicalProjectRoot) {
      issues.push(`Receipt ${receipt.receiptId} project root ${receipt.canonicalProjectRoot} does not match expected ${canonicalProjectRoot}`);
      receiptValid = false;
    }
    if (receipt.quickId !== options.quickId) {
      issues.push(`Receipt ${receipt.receiptId} quickId ${receipt.quickId} does not match expected ${options.quickId}`);
      receiptValid = false;
    }
    if (receipt.workflowSha256 !== options.workflowSha256) {
      issues.push(`Receipt ${receipt.receiptId} workflowSha256 ${receipt.workflowSha256} does not match expected ${options.workflowSha256}`);
      receiptValid = false;
    }
    if (receipt.quality !== "full") {
      issues.push(`Receipt ${receipt.receiptId} quality ${receipt.quality} is not 'full'`);
      receiptValid = false;
    }
    if (receipt.inputArtifacts.length > MAX_ARTIFACT_REFS_PER_RECEIPT) {
      issues.push(`Receipt ${receipt.receiptId} inputArtifacts count ${receipt.inputArtifacts.length} exceeds ${MAX_ARTIFACT_REFS_PER_RECEIPT}`);
      receiptValid = false;
    }
    if (receipt.outputArtifacts.length > MAX_ARTIFACT_REFS_PER_RECEIPT) {
      issues.push(`Receipt ${receipt.receiptId} outputArtifacts count ${receipt.outputArtifacts.length} exceeds ${MAX_ARTIFACT_REFS_PER_RECEIPT}`);
      receiptValid = false;
    }

    if (!receiptValid) {
      invalidReceipts.push(receipt.receiptId);
      continue;
    }

    // Check artifact hashes on disk
    for (const ref of [...receipt.inputArtifacts, ...receipt.outputArtifacts]) {
      const artCheck = await verifyArtifactReference(canonicalProjectRoot, ref);
      if (!artCheck.ok) {
        issues.push(`Receipt ${receipt.receiptId} artifact error: ${artCheck.reason}`);
        receiptValid = false;
      }
    }

    if (!receiptValid) {
      invalidReceipts.push(receipt.receiptId);
    } else {
      validReceipts.push(receipt);
    }
  }

  // 2. Map receipts by stage
  const stageMap = new Map<GsdQuickStage, TaskGsdStageReceipt>();
  for (const receipt of validReceipts) {
    if (stageMap.has(receipt.stage)) {
      issues.push(`Duplicate receipt for stage ${receipt.stage}`);
      invalidReceipts.push(receipt.receiptId);
    } else {
      stageMap.set(receipt.stage, receipt);
    }
  }

  // 3. Check for missing and failed stages
  const missingStages: GsdQuickStage[] = [];
  for (const stage of required) {
    const receipt = stageMap.get(stage);
    if (!receipt) {
      missingStages.push(stage);
      continue;
    }

    if (receipt.outcome !== "passed") {
      failedStages.push({
        stage,
        outcome: receipt.outcome,
        reason: receipt.detail ?? `Stage ${stage} outcome was ${receipt.outcome}`,
      });
    }
  }

  if (missingStages.length > 0) {
    issues.push(`Missing required full stage receipts: ${missingStages.join(", ")}`);
  }
  if (failedStages.length > 0) {
    issues.push(`Required stages failed: ${failedStages.map((f) => `${f.stage} (${f.outcome})`).join(", ")}`);
  }

  let status: TaskGsdFullEvidence["status"] = "verified";
  if (invalidReceipts.length > 0) {
    status = "invalid";
  } else if (failedStages.length > 0) {
    status = "failed";
  } else if (missingStages.length > 0) {
    status = "missing";
  }

  return {
    status,
    quickId: options.quickId,
    stages: validReceipts,
    missingStages,
    failedStages,
    invalidReceipts,
    issues,
  };
}
