import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "../types.js";
import { userStateRoot } from "./paths.js";
import type { TaskCapabilityObligation } from "./task-capability-obligations.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";
import type { TaskPrecondition } from "./task-verdict.js";
import { rejectRawCredentials } from "./validation.js";
import { syncDirectory } from "./writer-lock.js";

export interface TaskCapabilityReceipt {
  readonly schemaVersion: 1;
  readonly kind: "task-capability-receipt";
  readonly receiptId: string;
  readonly receiptDigest: string;
  readonly runId: string;
  readonly step: GsdStepKind;
  readonly capabilityId: string;
  readonly obligationId: string;
  readonly question: string;
  readonly selected: boolean;
  readonly invoked: boolean;
  readonly outcome: "ok" | "failed" | "denied";
  readonly invokedAt: string;
  readonly toolName: string;
  readonly harness: HarnessId | string;
  readonly harnessVersion: string | null;
  readonly harnessExecutable: string | null;
  readonly sessionId: string | null;
  readonly source: string;
  readonly sourceVersion: string;
  readonly observationId: string;
  readonly rawResultSha256: string;
  readonly isReused: boolean;
  readonly originalReceiptId: string | null;
  readonly isError: boolean;
  readonly errorMessage: string | null;
}

export interface CapabilityInvocationRequest {
  readonly runId: string;
  readonly step: GsdStepKind;
  readonly obligation: TaskCapabilityObligation;
  readonly projectRoot: string;
  readonly sessionId?: string | null | undefined;
  readonly harness?: HarnessId | string | undefined;
  readonly harnessVersion?: string | null | undefined;
  readonly harnessExecutable?: string | null | undefined;
}

export interface CapabilityInvocationResult {
  readonly receipt: TaskCapabilityReceipt;
}

export interface TaskCapabilityPort {
  invoke(request: CapabilityInvocationRequest): Promise<CapabilityInvocationResult>;
}

export function computeCapabilityReceiptDigest(payload: Omit<TaskCapabilityReceipt, "receiptDigest"> | TaskCapabilityReceipt): string {
  const { receiptDigest: _ignored, ...rest } = payload as unknown as Record<string, unknown>;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function createCapabilityReceipt(
  params: Omit<TaskCapabilityReceipt, "schemaVersion" | "kind" | "receiptId" | "receiptDigest"> & {
    receiptId?: string;
  },
): TaskCapabilityReceipt {
  const receiptId = params.receiptId ?? `rec-cap-${randomUUID()}`;
  const unhashed: Omit<TaskCapabilityReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "task-capability-receipt",
    receiptId,
    runId: params.runId,
    step: params.step,
    capabilityId: params.capabilityId,
    obligationId: params.obligationId,
    question: params.question,
    selected: params.selected,
    invoked: params.invoked,
    outcome: params.outcome,
    invokedAt: params.invokedAt,
    toolName: params.toolName,
    harness: params.harness,
    harnessVersion: params.harnessVersion,
    harnessExecutable: params.harnessExecutable,
    sessionId: params.sessionId,
    source: params.source,
    sourceVersion: params.sourceVersion,
    observationId: params.observationId,
    rawResultSha256: params.rawResultSha256,
    isReused: params.isReused,
    originalReceiptId: params.originalReceiptId,
    isError: params.isError,
    errorMessage: params.errorMessage,
  };
  const receiptDigest = computeCapabilityReceiptDigest(unhashed);
  return {
    ...unhashed,
    receiptDigest,
  };
}

export function resolveCapabilityReceiptsDir(receiptsRoot?: string): string {
  if (!receiptsRoot) {
    return join(userStateRoot(), "receipts", "capabilities");
  }
  if (receiptsRoot.endsWith("capabilities")) {
    return receiptsRoot;
  }
  return join(receiptsRoot, "receipts", "capabilities");
}

export async function writeCapabilityReceipt(
  receipt: TaskCapabilityReceipt,
  receiptsRoot?: string,
): Promise<string> {
  const credentialIssues = rejectRawCredentials(receipt);
  if (credentialIssues.length > 0) {
    throw new Error(`Receipt contains raw credentials: ${credentialIssues.map((i) => i.actualShape).join(", ")}`);
  }

  const text = JSON.stringify(receipt, null, 2) + "\n";
  const targetDir = resolveCapabilityReceiptsDir(receiptsRoot);
  const fileName = `${receipt.runId}-${receipt.step}-${receipt.obligationId}.json`;
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

export async function readCapabilityReceipts(
  stateRoot?: string,
  runId?: string,
): Promise<TaskCapabilityReceipt[]> {
  const targetDir = resolveCapabilityReceiptsDir(stateRoot);
  if (!existsSync(targetDir)) return [];

  const entries = await readdir(targetDir);
  const receipts: TaskCapabilityReceipt[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.startsWith(".")) continue;
    if (runId && !entry.startsWith(`${runId}-`)) continue;

    try {
      const content = await readFile(join(targetDir, entry), "utf8");
      const parsed = JSON.parse(content) as TaskCapabilityReceipt;
      if (parsed.kind === "task-capability-receipt" && parsed.schemaVersion === 1) {
        receipts.push(parsed);
      }
    } catch {
      // Ignore unreadable or invalid receipt files
    }
  }

  return receipts;
}

export interface VerifyCapabilityReceiptsOptions {
  readonly obligations: readonly TaskCapabilityObligation[];
  readonly receipts: readonly TaskCapabilityReceipt[];
  readonly currentRunId: string;
  readonly currentStep: GsdStepKind;
  readonly currentSessionId?: string | null | undefined;
}

export interface VerifyCapabilityReceiptsResult {
  readonly satisfied: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly verifiedReceipts: readonly TaskCapabilityReceipt[];
  readonly failedReceipts: readonly TaskCapabilityReceipt[];
  readonly missingObligations: readonly TaskCapabilityObligation[];
  readonly precondition: TaskPrecondition;
}

/**
 * Validates that all required capability obligations have verified, successful receipts
 * matching the current runId, GSD step, and session (CAP-03, CAP-05).
 */
export function verifyRequiredCapabilityReceipts(
  options: VerifyCapabilityReceiptsOptions,
): VerifyCapabilityReceiptsResult {
  const verifiedReceipts: TaskCapabilityReceipt[] = [];
  const failedReceipts: TaskCapabilityReceipt[] = [];
  const missingObligations: TaskCapabilityObligation[] = [];

  const requiredObligations = options.obligations.filter((ob) => ob.required);
  if (requiredObligations.length === 0) {
    return {
      satisfied: true,
      reason: "No required capability obligations for this step.",
      nextAction: "none",
      verifiedReceipts: [],
      failedReceipts: [],
      missingObligations: [],
      precondition: {
        id: "capability-obligations",
        satisfied: true,
        reason: "No required capability obligations for this step.",
        nextAction: "none",
      },
    };
  }

  for (const obligation of requiredObligations) {
    // 1. Validate obligation question itself (empty question cannot be satisfied)
    if (!obligation.question || obligation.question.trim().length === 0) {
      missingObligations.push(obligation);
      continue;
    }

    // 2. Find matching receipt(s)
    const matching = options.receipts.filter(
      (r) =>
        r.obligationId === obligation.id ||
        (r.capabilityId === obligation.capabilityId && r.step === obligation.step),
    );

    if (matching.length === 0) {
      missingObligations.push(obligation);
      continue;
    }

    let foundValid = false;
    for (const receipt of matching) {
      // Must match current runId (cannot use old/stale runId)
      if (receipt.runId !== options.currentRunId) {
        failedReceipts.push(receipt);
        continue;
      }

      // Must match current step (cannot reuse post-step as pre-step or mismatch step)
      if (receipt.step !== options.currentStep || receipt.step !== obligation.step) {
        failedReceipts.push(receipt);
        continue;
      }

      // Must match question and question cannot be empty
      if (!receipt.question || receipt.question.trim().length === 0 || receipt.question !== obligation.question) {
        failedReceipts.push(receipt);
        continue;
      }

      // Must have valid integrity digest
      const expectedDigest = computeCapabilityReceiptDigest(receipt);
      if (receipt.receiptDigest !== expectedDigest) {
        failedReceipts.push(receipt);
        continue;
      }

      // Must be invoked and successful
      if (!receipt.invoked || receipt.outcome !== "ok" || receipt.isError) {
        failedReceipts.push(receipt);
        continue;
      }

      // If reused, originalReceiptId must be non-empty
      if (receipt.isReused && (!receipt.originalReceiptId || receipt.originalReceiptId.trim().length === 0)) {
        failedReceipts.push(receipt);
        continue;
      }

      // If session specified and receipt has session, must match
      if (
        options.currentSessionId &&
        receipt.sessionId &&
        receipt.sessionId !== options.currentSessionId
      ) {
        failedReceipts.push(receipt);
        continue;
      }

      verifiedReceipts.push(receipt);
      foundValid = true;
      break;
    }

    if (!foundValid && !missingObligations.includes(obligation)) {
      missingObligations.push(obligation);
    }
  }

  const satisfied = missingObligations.length === 0 && failedReceipts.length === 0;
  const reason = satisfied
    ? "All required capability obligations have verified receipts from actual invocation."
    : missingObligations.length > 0
      ? `Missing verified receipts for required obligations: ${missingObligations.map((o) => o.capabilityId).join(", ")}`
      : `Capability invocations failed: ${failedReceipts.map((r) => r.errorMessage ?? r.outcome).join(", ")}`;

  const nextAction = satisfied
    ? "none"
    : "re-run the step with a working capability port and ensure actual invocation succeeds";

  return {
    satisfied,
    reason,
    nextAction,
    verifiedReceipts,
    failedReceipts,
    missingObligations,
    precondition: {
      id: "capability-obligations",
      satisfied,
      reason,
      nextAction,
    },
  };
}
