import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { HarnessId } from "../types.js";
import { packageRoot, userStateRoot } from "./paths.js";
import type { TaskCapabilityObligation } from "./task-capability-obligations.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";
import type { TaskPrecondition } from "./task-verdict.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";
import { syncDirectory } from "./writer-lock.js";

export type TaskCapabilityOutcome = "ok" | "failed" | "denied" | "tool-error" | "transport-error";

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
  readonly attempted?: boolean;
  readonly outcome: TaskCapabilityOutcome;
  readonly invokedAt: string;
  readonly skillActivatedAt?: string | null;
  readonly mcpObservedAt?: string | null;
  readonly toolName: string;
  readonly harness: HarnessId | string;
  readonly harnessVersion: string | null;
  readonly harnessExecutable: string | null;
  readonly sessionId: string | null;
  readonly skillActivationReceiptId?: string | null;
  readonly mcpObservationId?: string | null;
  readonly source: string;
  readonly sourceVersion: string;
  readonly observationId: string | null;
  readonly rawResultSha256: string;
  readonly resultDigest?: string;
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

let cachedCapabilityReceiptSchema: Record<string, unknown> | null = null;

export async function getCapabilityReceiptSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedCapabilityReceiptSchema !== null && !pkgRoot) {
    return cachedCapabilityReceiptSchema;
  }
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "task-capability-receipt.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!pkgRoot) {
    cachedCapabilityReceiptSchema = parsed;
  }
  return parsed;
}

export function createCapabilityReceipt(
  params: Omit<
    TaskCapabilityReceipt,
    | "schemaVersion"
    | "kind"
    | "receiptId"
    | "receiptDigest"
    | "attempted"
    | "resultDigest"
    | "skillActivationReceiptId"
    | "mcpObservationId"
    | "outcome"
    | "invokedAt"
    | "observationId"
  > & {
    receiptId?: string;
    attempted?: boolean;
    outcome?: TaskCapabilityOutcome;
    resultDigest?: string;
    skillActivationReceiptId?: string | null;
    mcpObservationId?: string | null;
    skillActivatedAt?: string | null;
    mcpObservedAt?: string | null;
    observationId?: string | null;
    rawResultSha256?: string;
    invokedAt?: string;
    invoked?: boolean;
    selected?: boolean;
  },
): TaskCapabilityReceipt {
  const receiptId = params.receiptId ?? `rec-cap-${randomUUID()}`;
  const sessionId = params.sessionId ?? null;
  const mcpObservationId = params.mcpObservationId !== undefined
    ? params.mcpObservationId
    : (params.observationId ?? null);
  const observationId = params.observationId !== undefined
    ? params.observationId
    : mcpObservationId;
  const skillActivationReceiptId = params.skillActivationReceiptId !== undefined
    ? params.skillActivationReceiptId
    : (sessionId ? `act-${params.capabilityId}-${sessionId}` : null);
  const resultDigest = params.resultDigest !== undefined
    ? params.resultDigest
    : (params.rawResultSha256 ?? "");
  const rawResultSha256 = params.rawResultSha256 !== undefined
    ? params.rawResultSha256
    : resultDigest;
  const attempted = params.attempted !== undefined
    ? params.attempted
    : (params.invoked ?? true);
  const invoked = params.invoked !== undefined
    ? params.invoked
    : attempted;
  const outcome: TaskCapabilityOutcome = params.outcome ?? "ok";
  const invokedAt = params.invokedAt ?? new Date().toISOString();
  const skillActivatedAt = params.skillActivatedAt !== undefined
    ? params.skillActivatedAt
    : (sessionId ? invokedAt : null);
  const mcpObservedAt = params.mcpObservedAt !== undefined
    ? params.mcpObservedAt
    : (mcpObservationId ? invokedAt : null);

  const unhashed: Omit<TaskCapabilityReceipt, "receiptDigest"> = {
    schemaVersion: 1,
    kind: "task-capability-receipt",
    receiptId,
    runId: params.runId,
    step: params.step,
    capabilityId: params.capabilityId,
    obligationId: params.obligationId,
    question: params.question,
    selected: params.selected ?? true,
    invoked,
    attempted,
    outcome,
    invokedAt,
    skillActivatedAt,
    mcpObservedAt,
    toolName: params.toolName,
    harness: params.harness,
    harnessVersion: params.harnessVersion ?? null,
    harnessExecutable: params.harnessExecutable ?? null,
    sessionId,
    skillActivationReceiptId,
    mcpObservationId,
    source: params.source,
    sourceVersion: params.sourceVersion,
    observationId,
    rawResultSha256,
    resultDigest,
    isReused: params.isReused ?? false,
    originalReceiptId: params.originalReceiptId ?? null,
    isError: params.isError ?? false,
    errorMessage: params.errorMessage ?? null,
  };

  const receiptDigest = computeCapabilityReceiptDigest(unhashed);
  return {
    ...unhashed,
    receiptDigest,
  };
}

export interface CreateLinkedCapabilityReceiptOptions {
  readonly obligation: TaskCapabilityObligation;
  readonly runId: string;
  readonly step: GsdStepKind;
  readonly sessionId: string;
  readonly skillActivation: {
    readonly receiptId: string;
    readonly activatedAt?: string;
  };
  readonly mcpObservation: {
    readonly observationId: string;
    readonly outcome: TaskCapabilityOutcome;
    readonly rawResultSha256: string;
    readonly isError?: boolean;
    readonly errorMessage?: string | null;
    readonly observedAt?: string;
  };
  readonly harness: HarnessId | string;
  readonly harnessVersion?: string | null;
  readonly harnessExecutable?: string | null;
  readonly toolName?: string;
}

export function createLinkedCapabilityReceipt(
  options: CreateLinkedCapabilityReceiptOptions,
): TaskCapabilityReceipt {
  const toolName = options.toolName ?? options.obligation.capabilityId.split(":").pop() ?? options.obligation.capabilityId;
  const isError = options.mcpObservation.isError ?? (options.mcpObservation.outcome !== "ok");
  return createCapabilityReceipt({
    runId: options.runId,
    step: options.step,
    capabilityId: options.obligation.capabilityId,
    obligationId: options.obligation.id,
    question: options.obligation.question,
    selected: true,
    attempted: true,
    invoked: true,
    outcome: options.mcpObservation.outcome,
    invokedAt: options.mcpObservation.observedAt ?? new Date().toISOString(),
    skillActivatedAt: options.skillActivation.activatedAt ?? new Date().toISOString(),
    mcpObservedAt: options.mcpObservation.observedAt ?? new Date().toISOString(),
    toolName,
    harness: options.harness,
    harnessVersion: options.harnessVersion ?? null,
    harnessExecutable: options.harnessExecutable ?? null,
    sessionId: options.sessionId,
    skillActivationReceiptId: options.skillActivation.receiptId,
    mcpObservationId: options.mcpObservation.observationId,
    source: options.obligation.source,
    sourceVersion: options.obligation.version,
    observationId: options.mcpObservation.observationId,
    rawResultSha256: options.mcpObservation.rawResultSha256,
    resultDigest: options.mcpObservation.rawResultSha256,
    isReused: false,
    originalReceiptId: null,
    isError,
    errorMessage: options.mcpObservation.errorMessage ?? null,
  });
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
  pkgRoot?: string,
): Promise<string> {
  const credentialIssues = rejectRawCredentials(receipt);
  if (credentialIssues.length > 0) {
    throw new Error(`Receipt contains raw credentials: ${credentialIssues.map((i) => i.actualShape).join(", ")}`);
  }

  const expectedDigest = computeCapabilityReceiptDigest(receipt);
  if (receipt.receiptDigest !== expectedDigest) {
    throw new Error(`Receipt digest mismatch: expected ${expectedDigest}, got ${receipt.receiptDigest}`);
  }

  const schema = await getCapabilityReceiptSchema(pkgRoot);
  const text = JSON.stringify(receipt, null, 2) + "\n";
  const validation = validateManagedDocument<TaskCapabilityReceipt>({
    text,
    format: "json",
    kind: "task-receipt",
    schema,
  });

  if (!validation.ok || validation.value === null) {
    throw new Error(`Capability receipt validation failed: ${JSON.stringify(validation.issues)}`);
  }

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
  pkgRoot?: string,
): Promise<TaskCapabilityReceipt[]> {
  const targetDir = resolveCapabilityReceiptsDir(stateRoot);
  if (!existsSync(targetDir)) return [];

  const schema = await getCapabilityReceiptSchema(pkgRoot);
  const entries = await readdir(targetDir);
  const receipts: TaskCapabilityReceipt[] = [];

  for (const entry of entries) {
    if (!entry.endsWith(".json") || entry.startsWith(".")) continue;
    if (runId && !entry.startsWith(`${runId}-`)) continue;

    try {
      const content = await readFile(join(targetDir, entry), "utf8");
      const validation = validateManagedDocument<TaskCapabilityReceipt>({
        text: content,
        format: "json",
        kind: "task-receipt",
        schema,
      });
      if (validation.ok && validation.value !== null) {
        receipts.push(validation.value);
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
 * matching the current runId, GSD step, and session, with dual linked evidence (CAP-03, CAP-05, D-14, D-15).
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

      // Session ID checks
      if (!receipt.sessionId || receipt.sessionId.trim().length === 0) {
        failedReceipts.push(receipt);
        continue;
      }
      if (options.currentSessionId && receipt.sessionId !== options.currentSessionId) {
        failedReceipts.push(receipt);
        continue;
      }

      // D-14: Dual linked evidence required (Skill activation + MCP observation)
      // 한쪽 누락 (missing either side) is rejected
      if (!receipt.skillActivationReceiptId || receipt.skillActivationReceiptId.trim().length === 0) {
        failedReceipts.push(receipt);
        continue;
      }
      if (!receipt.mcpObservationId || receipt.mcpObservationId.trim().length === 0) {
        failedReceipts.push(receipt);
        continue;
      }

      // ID 교차 check (Crossed IDs / mismatched session in activation/observation references)
      if (receipt.skillActivationReceiptId.includes("session-") && !receipt.skillActivationReceiptId.includes(receipt.sessionId)) {
        failedReceipts.push(receipt);
        continue;
      }

      // Sequence check (순서 반전: skill activation must precede or coincide with MCP observation)
      if (receipt.skillActivatedAt && receipt.mcpObservedAt) {
        const skillTime = new Date(receipt.skillActivatedAt).getTime();
        const mcpTime = new Date(receipt.mcpObservedAt).getTime();
        if (!isNaN(skillTime) && !isNaN(mcpTime) && skillTime > mcpTime) {
          failedReceipts.push(receipt);
          continue;
        }
      }

      // Empty response check (빈 응답: resultDigest or rawResultSha256 cannot be empty)
      const resDigest = receipt.resultDigest || receipt.rawResultSha256;
      if (!resDigest || resDigest.trim().length === 0) {
        failedReceipts.push(receipt);
        continue;
      }

      // D-15: Attempted, Outcome and Error check
      const attempted = receipt.attempted ?? receipt.invoked;
      if (!attempted || receipt.outcome !== "ok" || receipt.isError) {
        failedReceipts.push(receipt);
        continue;
      }

      // If reused, originalReceiptId must be non-empty
      if (receipt.isReused && (!receipt.originalReceiptId || receipt.originalReceiptId.trim().length === 0)) {
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
