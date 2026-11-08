import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  HarnessId,
  ManagedToolId,
  ReleaseEvidenceItem,
  ReleaseEvidenceState,
} from "../types.js";
import { packageRoot as getPackageRoot } from "./paths.js";
import { proveOperationPaths, provePathBoundary, type OperationPathProofSet, type PathProof } from "./path-boundary.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";
import { acquireMutationSession, type MutationSession } from "./writer-lock.js";

export type ReleaseLifecycleEventKind =
  | "started"
  | "evidence-recorded"
  | "verification-pending"
  | "activated"
  | "postcheck-passed"
  | "postcheck-failed"
  | "recovery-started"
  | "recovered"
  | "recovery-failed"
  | "cancelled";

export interface ReviewedReleaseRef {
  toolId: ManagedToolId;
  release: string;
  artifact: string;
  integrity: string;
  digest: string;
  planDigest?: string;
}

export interface ActiveIdentityRef {
  installationId: string;
  version: string;
  pathAlias: string;
}

export interface LastGoodIdentityRef {
  installationId: string;
  version: string;
}

export interface ReleaseLifecycleEvent {
  schemaVersion: 1;
  eventId: string;
  operationId: string;
  sequence: number;
  occurredAt: string;
  kind: ReleaseLifecycleEventKind;
  toolId: ManagedToolId;
  reviewedRelease: ReviewedReleaseRef;
  activeIdentity?: ActiveIdentityRef;
  lastGoodIdentity?: LastGoodIdentityRef | null;
  evidenceFingerprint?: string;
  tiers?: readonly ReleaseEvidenceItem[];
  overallState?: ReleaseEvidenceState;
  pendingReason?: string;
  failureReason?: string;
  nextAction?: string;
  artifactRefs?: readonly string[];
  recoveryScope?: readonly string[];
  unrecoveredEffects?: readonly string[];
}

export interface ReleaseLifecycleOperationPlan {
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly operationId: string;
  readonly toolId: ManagedToolId;
  readonly occurredAt: string;
  readonly reviewedRelease: ReviewedReleaseRef;
  readonly digest: string;
  readonly baseDir: string;
  readonly proofs: OperationPathProofSet;
  readonly checkoutProof: PathProof;
}

export interface ReconstructedReleaseLifecycle {
  readonly operationId: string;
  readonly toolId: ManagedToolId;
  readonly status: ReleaseLifecycleEventKind;
  readonly reviewedRelease: ReviewedReleaseRef;
  readonly activeIdentity?: ActiveIdentityRef;
  readonly lastGoodIdentity?: LastGoodIdentityRef | null;
  readonly evidenceFingerprint?: string;
  readonly nextAction?: string;
  readonly events: readonly ReleaseLifecycleEvent[];
  readonly resumeInputs?: {
    readonly toolId: ManagedToolId;
    readonly release: string;
    readonly artifact: string;
    readonly integrity: string;
    readonly fingerprint?: string;
  };
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function computeDigest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

let cachedSchema: Record<string, unknown> | null = null;

async function loadSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema) return cachedSchema;
  const schemaPath = join(getPackageRoot(), "schemas", "tool-release-lifecycle.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  cachedSchema = JSON.parse(raw) as Record<string, unknown>;
  return cachedSchema;
}

export async function validateLifecycleEvent(event: ReleaseLifecycleEvent): Promise<void> {
  const schema = await loadSchema();
  const checked = validateManagedDocument<ReleaseLifecycleEvent>({
    text: JSON.stringify(event),
    format: "json",
    kind: "tool-release-lifecycle",
    schema,
    domain: rejectRawCredentials,
  });

  if (!checked.ok || !Number.isFinite(Date.parse(event.occurredAt))) {
    const issueSummary = checked.issues.map((i) => `${i.documentPath}: ${i.code}`).join("; ");
    throw new Error(`Invalid lifecycle event: ${issueSummary || "schema validation failed"}`);
  }
}

export async function planReleaseLifecycleOperation(options: {
  stateRoot: string;
  packageRoot: string;
  operationId: string;
  occurredAt: string;
  toolId: ManagedToolId;
  reviewedRelease: ReviewedReleaseRef;
}): Promise<ReleaseLifecycleOperationPlan> {
  const stateRoot = resolve(options.stateRoot);
  const packageRoot = resolve(options.packageRoot);

  if (!idPattern.test(options.operationId)) {
    throw new Error(`Invalid operation ID: ${options.operationId}`);
  }

  const baseDir = join(stateRoot, "tool-release-lifecycle", "v1", "operations", options.operationId);
  const eventsDir = join(baseDir, "events");

  const inputs = [
    { role: "target" as const, path: eventsDir },
    { role: "state" as const, path: stateRoot },
    { role: "journal" as const, path: join(stateRoot, "journal") },
    { role: "snapshot" as const, path: join(stateRoot, "snapshots") },
  ];

  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: [stateRoot],
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });

  if (!proofs.proven) {
    throw new Error("Lifecycle operation path proof failed");
  }

  const checkoutProof = await provePathBoundary({
    path: packageRoot,
    allowedRoots: [packageRoot],
    role: "source",
  });

  if (!checkoutProof.proven) {
    throw new Error("Checkout path proof failed");
  }

  const planDigest = computeDigest(canonical({
    stateRoot,
    packageRoot,
    operationId: options.operationId,
    occurredAt: options.occurredAt,
    toolId: options.toolId,
    reviewedRelease: options.reviewedRelease,
  }));

  return {
    stateRoot,
    packageRoot,
    operationId: options.operationId,
    toolId: options.toolId,
    occurredAt: options.occurredAt,
    reviewedRelease: options.reviewedRelease,
    digest: planDigest,
    baseDir,
    proofs,
    checkoutProof,
  };
}

export async function appendReleaseLifecycleEvent(
  plan: ReleaseLifecycleOperationPlan,
  eventInput: Omit<ReleaseLifecycleEvent, "schemaVersion" | "operationId" | "eventId">,
  session?: MutationSession,
): Promise<{ idempotent: boolean; event: ReleaseLifecycleEvent }> {
  const eventId = `${plan.operationId}-seq-${eventInput.sequence}`;
  const event: ReleaseLifecycleEvent = {
    schemaVersion: 1,
    eventId,
    operationId: plan.operationId,
    ...eventInput,
  };

  await validateLifecycleEvent(event);

  const eventsDir = join(plan.baseDir, "events");
  await mkdir(eventsDir, { recursive: true });

  const targetPath = join(eventsDir, `${event.sequence}.json`);
  const content = `${JSON.stringify(event, null, 2)}\n`;

  // Check if file already exists
  let existingContent: string | null = null;
  try {
    existingContent = await readFile(targetPath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  if (existingContent !== null) {
    // Idempotent retry check: canonical comparison
    const parsedExisting = JSON.parse(existingContent) as ReleaseLifecycleEvent;
    if (canonical(parsedExisting) === canonical(event)) {
      return { idempotent: true, event: parsedExisting };
    }
    throw new Error(`Lifecycle event drift: event sequence ${event.sequence} already exists with different content`);
  }

  // Monotonic sequence and terminal state enforcement
  const existingFiles = (await readdir(eventsDir).catch(() => []))
    .filter((f) => f.endsWith(".json"))
    .map((f) => parseInt(f.replace(".json", ""), 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const expectedSeq = existingFiles.length === 0 ? 1 : existingFiles[existingFiles.length - 1]! + 1;
  if (event.sequence !== expectedSeq) {
    throw new Error(`Lifecycle event sequence out of order: expected ${expectedSeq}, got ${event.sequence}`);
  }

  // Check if operation already reached terminal state
  if (existingFiles.length > 0) {
    const lastSeq = existingFiles[existingFiles.length - 1]!;
    const lastFile = join(eventsDir, `${lastSeq}.json`);
    const lastEvent = JSON.parse(await readFile(lastFile, "utf8")) as ReleaseLifecycleEvent;
    const isTerminal = ["postcheck-passed", "cancelled", "recovered", "recovery-failed"].includes(lastEvent.kind);

    if (isTerminal) {
      if (lastEvent.kind === "cancelled" && event.kind === "cancelled") {
        return { idempotent: true, event: lastEvent };
      }
      throw new Error(`Illegal lifecycle transition: operation ${plan.operationId} is already in terminal state '${lastEvent.kind}'`);
    }
  }

  // Write event atomically using applyFileTransaction
  const ownedSession = session ?? await acquireMutationSession({
    stateRoot: plan.stateRoot,
    proofs: plan.proofs,
    planDigest: plan.digest,
    operationId: plan.operationId,
  });

  try {
    await applyFileTransaction({
      stateRoot: plan.stateRoot,
      allowedRoots: [plan.stateRoot],
      session: ownedSession,
      operations: [{
        target: targetPath,
        content,
      }],
    });
  } finally {
    if (!session) {
      await ownedSession.close();
    }
  }

  return { idempotent: false, event };
}

export async function readReleaseLifecycle(options: {
  stateRoot: string;
  operationId: string;
}): Promise<ReconstructedReleaseLifecycle | null> {
  const stateRoot = resolve(options.stateRoot);
  const eventsDir = join(stateRoot, "tool-release-lifecycle", "v1", "operations", options.operationId, "events");

  let files: string[];
  try {
    files = await readdir(eventsDir);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }

  const jsonFiles = files
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ filename: f, seq: parseInt(f.replace(".json", ""), 10) }))
    .filter((f) => Number.isFinite(f.seq))
    .sort((a, b) => a.seq - b.seq);

  if (jsonFiles.length === 0) return null;

  const events: ReleaseLifecycleEvent[] = [];
  for (const item of jsonFiles) {
    const raw = await readFile(join(eventsDir, item.filename), "utf8");
    const parsed = JSON.parse(raw) as ReleaseLifecycleEvent;
    await validateLifecycleEvent(parsed);
    events.push(parsed);
  }

  const latestEvent = events[events.length - 1]!;
  const firstEvent = events[0]!;

  return {
    operationId: options.operationId,
    toolId: latestEvent.toolId,
    status: latestEvent.kind,
    reviewedRelease: firstEvent.reviewedRelease,
    ...(latestEvent.activeIdentity ? { activeIdentity: latestEvent.activeIdentity } : {}),
    ...(latestEvent.lastGoodIdentity !== undefined ? { lastGoodIdentity: latestEvent.lastGoodIdentity } : {}),
    ...(latestEvent.evidenceFingerprint ? { evidenceFingerprint: latestEvent.evidenceFingerprint } : {}),
    ...(latestEvent.nextAction ? { nextAction: latestEvent.nextAction } : {}),
    events,
    resumeInputs: {
      toolId: latestEvent.toolId,
      release: latestEvent.reviewedRelease.release,
      artifact: latestEvent.reviewedRelease.artifact,
      integrity: latestEvent.reviewedRelease.integrity,
      ...(latestEvent.evidenceFingerprint ? { fingerprint: latestEvent.evidenceFingerprint } : {}),
    },
  };
}

/**
 * Derives all artifacts that must be protected from automatic cleanup (D-14).
 * Returns paths/references for active, last-good, pending, and in-recovery files.
 */
export async function deriveProtectedReleaseArtifacts(options: {
  stateRoot: string;
}): Promise<readonly string[]> {
  const stateRoot = resolve(options.stateRoot);
  const operationsBase = join(stateRoot, "tool-release-lifecycle", "v1", "operations");

  const protectedSet = new Set<string>();

  let opDirs: string[] = [];
  try {
    opDirs = await readdir(operationsBase);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  for (const opId of opDirs) {
    const lifecycle = await readReleaseLifecycle({ stateRoot, operationId: opId });
    if (!lifecycle) continue;

    // Protect reviewed artifact
    if (lifecycle.reviewedRelease?.artifact) {
      protectedSet.add(lifecycle.reviewedRelease.artifact);
    }

    for (const evt of lifecycle.events) {
      // Protect any explicit artifact references
      for (const ref of evt.artifactRefs ?? []) {
        protectedSet.add(ref);
      }
      // Protect active identity
      if (evt.activeIdentity?.version) {
        protectedSet.add(`${evt.toolId}@${evt.activeIdentity.version}`);
      }
      // Protect last good identity
      if (evt.lastGoodIdentity?.version) {
        protectedSet.add(`${evt.toolId}@${evt.lastGoodIdentity.version}`);
      }
    }
  }

  return [...protectedSet].sort();
}
