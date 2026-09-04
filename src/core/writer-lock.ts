import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, rm, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import type { OperationPathProofSet } from "./path-boundary.js";

/**
 * Flushes a directory entry so a rename or create survives a crash. Not every
 * platform or filesystem supports it; where it fails the operation continues
 * and the limitation is reported as a capability rather than assumed away.
 */
export async function syncDirectory(path: string): Promise<boolean> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
      return true;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

export interface WriterLockRecord {
  schemaVersion: 1;
  operationId: string;
  /** Random per-session secret proving ownership of this lock. */
  token: string;
  pid: number;
  host: string;
  startedAt: string;
  journalPath: string;
  planDigest: string;
}

export type WriterStatus = "free" | "active" | "needs-repair";

export interface WriterState {
  status: WriterStatus;
  lockPath: string;
  /** Metadata only. The ownership token is never returned to a non-owner. */
  record: Omit<WriterLockRecord, "token"> | null;
  detail: string | null;
}

export class WriterConflictError extends Error {
  readonly code = "ACTIVE_WRITER";
  readonly state: WriterState;
  constructor(state: WriterState) {
    const record = state.record;
    super(
      record === null
        ? `Another writer holds this state root; status ${state.status}. Retry after it finishes, or run repair --apply.`
        : `Another writer holds this state root: operationId=${record.operationId} pid=${record.pid} ` +
          `startedAt=${record.startedAt} status=${state.status}. Retry after it finishes, or run repair --apply.`,
    );
    this.name = "WriterConflictError";
    this.state = state;
  }
}

export interface MutationSession {
  readonly operationId: string;
  readonly token: string;
  readonly stateRoot: string;
  readonly journalPath: string;
  readonly proofs: OperationPathProofSet;
  readonly planDigest: string;
  /** Throws once the session has been closed, so a stale handle cannot write. */
  assertOwned(): void;
  /**
   * Names the next transaction in this operation. The first is the operation
   * id itself; later ones carry a sequence suffix, so an operation that writes
   * several times leaves several journals rather than overwriting one.
   */
  allocateTransactionId(): string;
  close(): Promise<void>;
}

/** True for a journal that belongs to this operation, first or subsequent. */
export function isOperationJournalName(operationId: string, name: string): boolean {
  return name === `${operationId}.json` || name.startsWith(`${operationId}--`);
}

export function writerLockPath(stateRoot: string): string {
  return join(stateRoot, "writer.lock");
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to another user.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function parseRecord(text: string): WriterLockRecord | null {
  try {
    const value = JSON.parse(text) as Partial<WriterLockRecord>;
    if (value.schemaVersion !== 1) return null;
    if (typeof value.operationId !== "string" || typeof value.token !== "string") return null;
    if (typeof value.pid !== "number" || typeof value.host !== "string") return null;
    if (typeof value.startedAt !== "string" || typeof value.journalPath !== "string") return null;
    if (typeof value.planDigest !== "string") return null;
    return value as WriterLockRecord;
  } catch {
    return null;
  }
}

function withoutToken(record: WriterLockRecord): Omit<WriterLockRecord, "token"> {
  const { token: _token, ...rest } = record;
  return rest;
}

/**
 * Reads writer status without acquiring anything. Readers stay available while
 * another process holds the lock, and this function never mutates lock state.
 *
 * An absent process or an old timestamp yields `needs-repair`, never `free`:
 * elapsed time and a missing pid are not proof that a write finished.
 */
export async function inspectWriterState(stateRoot: string): Promise<WriterState> {
  const lockPath = writerLockPath(stateRoot);
  if (!existsSync(lockPath)) return { status: "free", lockPath, record: null, detail: null };

  const text = await readFile(lockPath, "utf8").catch(() => null);
  if (text === null) {
    return { status: "needs-repair", lockPath, record: null, detail: "the writer lock could not be read" };
  }
  const record = parseRecord(text);
  if (record === null) {
    return { status: "needs-repair", lockPath, record: null, detail: "the writer lock is malformed or from an unknown version" };
  }
  if (record.host !== hostname()) {
    return {
      status: "needs-repair",
      lockPath,
      record: withoutToken(record),
      detail: "the lock was taken on a different host, so this host cannot judge whether that writer is alive",
    };
  }
  if (isProcessAlive(record.pid)) {
    return { status: "active", lockPath, record: withoutToken(record), detail: null };
  }
  return {
    status: "needs-repair",
    lockPath,
    record: withoutToken(record),
    detail: "the owning process is gone; the operation state must be proven before the lock is released",
  };
}

/**
 * Takes exclusive ownership of a state root. The lock is created with `wx`, so
 * two processes racing here cannot both succeed. A competitor fails
 * immediately with the active operation's metadata; it never waits, signals
 * the owning process, or removes the lock.
 */
export async function acquireMutationSession(options: {
  stateRoot: string;
  proofs: OperationPathProofSet;
  planDigest: string;
  operationId?: string;
}): Promise<MutationSession> {
  if (!options.proofs.proven) {
    throw new Error(`Cannot acquire a mutation session without a complete path proof: ${options.proofs.code}`);
  }

  const stateRoot = options.stateRoot;
  const lockPath = writerLockPath(stateRoot);
  const operationId = options.operationId ?? `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}-${randomUUID()}`;
  const journalPath = join(stateRoot, "journal", `${operationId}.json`);
  const record: WriterLockRecord = {
    schemaVersion: 1,
    operationId,
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    journalPath,
    planDigest: options.planDigest,
  };

  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });

  let handle;
  try {
    // `wx` is the exclusive-create flag: this is the atomic step that decides
    // which of two racing writers owns the root.
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new WriterConflictError(await inspectWriterState(stateRoot));
  }

  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    // The lock must survive a crash that happens immediately after this point,
    // otherwise a competitor could see a free root while a write is in flight.
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(lockPath));

  let open_ = true;
  let transactions = 0;
  return {
    operationId,
    token: record.token,
    stateRoot,
    journalPath,
    proofs: options.proofs,
    planDigest: options.planDigest,
    assertOwned(): void {
      if (!open_) throw new Error(`Mutation session ${operationId} is already closed`);
    },
    allocateTransactionId(): string {
      if (!open_) throw new Error(`Mutation session ${operationId} is already closed`);
      transactions += 1;
      return transactions === 1 ? operationId : `${operationId}--${transactions}`;
    },
    async close(): Promise<void> {
      if (!open_) return;
      open_ = false;
      const current = await readFile(lockPath, "utf8").catch(() => null);
      const parsed = current === null ? null : parseRecord(current);
      // Only the owner releases the lock, and only when the record still
      // carries this session's token.
      if (parsed?.token === record.token) await rm(lockPath, { force: true });
      await syncDirectory(dirname(lockPath));
    },
  };
}

// ---------------------------------------------------------------------------
// Repair
// ---------------------------------------------------------------------------

export type TargetClassification = "before" | "after" | "neither" | "missing";

export interface RepairTarget {
  target: string;
  classification: TargetClassification;
  beforeHash: string | null;
  afterHash: string | null;
  currentHash: string | null;
}

export type RepairTransition = "finalize-applied" | "restore-before" | "release-only" | "none";

export interface WriterRepairPlan {
  stateRoot: string;
  status: WriterStatus;
  operationId: string | null;
  journalPath: string | null;
  targets: RepairTarget[];
  /** What an explicit apply would be permitted to do. `none` means refuse. */
  transition: RepairTransition;
  blockedReasons: string[];
  planDigest: string;
}

async function hashFile(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

/** Every journal an operation wrote, in the order its transactions ran. */
async function operationJournalPaths(stateRoot: string, operationId: string): Promise<string[]> {
  const journalRoot = join(stateRoot, "journal");
  if (!existsSync(journalRoot)) return [];
  const names = (await readdir(journalRoot).catch(() => [] as string[]))
    .filter((name) => name.endsWith(".json") && isOperationJournalName(operationId, name))
    .sort();
  // The unsuffixed journal is the first transaction, so it leads regardless of
  // where a plain lexical sort would place it.
  const first = `${operationId}.json`;
  return [
    ...(names.includes(first) ? [join(journalRoot, first)] : []),
    ...names.filter((name) => name !== first).map((name) => join(journalRoot, name)),
  ];
}

interface JournalShape {
  id?: string;
  status?: string;
  files?: Array<{ target?: string; beforeHash?: string | null; afterHash?: string | null }>;
}

/**
 * Read-only diagnosis. Classifies every recorded target against its journal
 * hashes and reports which transition, if any, an explicit repair may perform.
 * Nothing here mutates the lock, the journal, or a target.
 */
export async function planWriterRepair(stateRoot: string): Promise<WriterRepairPlan> {
  const state = await inspectWriterState(stateRoot);
  const blockedReasons: string[] = [];
  const targets: RepairTarget[] = [];

  if (state.status === "free") {
    return finish(stateRoot, state, null, targets, "none", ["no writer lock is present"]);
  }
  if (state.status === "active") {
    return finish(stateRoot, state, state.record?.journalPath ?? null, targets, "none", [
      "the owning writer is still running; repair is only for an interrupted operation",
    ]);
  }

  const journalPath = state.record?.journalPath ?? null;
  // One operation may write several transactions under its session, each with
  // its own journal. Every one of them is evidence, so repair reads them all.
  const operationId = state.record?.operationId ?? null;
  const journalPaths = operationId === null
    ? []
    : await operationJournalPaths(stateRoot, operationId);
  if (journalPath === null || journalPaths.length === 0) {
    // The lock is durable but the intent is not: nothing can be proven, so the
    // only honest answer is that a human must look.
    blockedReasons.push("no journal evidence exists for the interrupted operation");
    return finish(stateRoot, state, journalPath, targets, "none", blockedReasons);
  }

  for (const path of journalPaths) {
    let journal: JournalShape;
    try {
      journal = JSON.parse(await readFile(path, "utf8")) as JournalShape;
    } catch {
      blockedReasons.push("the journal is unreadable or malformed");
      return finish(stateRoot, state, journalPath, targets, "none", blockedReasons);
    }

    for (const file of journal.files ?? []) {
      if (typeof file.target !== "string") {
        blockedReasons.push("a journal entry does not name its target");
        continue;
      }
      const currentHash = await hashFile(file.target);
      const beforeHash = file.beforeHash ?? null;
      const afterHash = file.afterHash ?? null;
      const classification: TargetClassification =
        currentHash === null && afterHash === null ? "after"
          : currentHash === null ? "missing"
            : currentHash === afterHash ? "after"
              : currentHash === beforeHash ? "before"
                : "neither";
      targets.push({ target: file.target, classification, beforeHash, afterHash, currentHash });
    }
  }

  const classifications = new Set(targets.map((entry) => entry.classification));
  if (classifications.has("neither")) {
    blockedReasons.push("a target holds bytes that are neither the recorded before nor after value");
  }
  if (classifications.has("missing")) {
    blockedReasons.push("a target that should exist is absent");
  }

  let transition: RepairTransition = "none";
  if (blockedReasons.length === 0) {
    if (targets.length === 0) transition = "release-only";
    else if (classifications.size === 1 && classifications.has("after")) transition = "finalize-applied";
    else if (classifications.size === 1 && classifications.has("before")) transition = "restore-before";
    else blockedReasons.push("targets are in mixed states, so no single transition is proven");
  }

  return finish(stateRoot, state, journalPath, targets, transition, blockedReasons);
}

function finish(
  stateRoot: string,
  state: WriterState,
  journalPath: string | null,
  targets: RepairTarget[],
  transition: RepairTransition,
  blockedReasons: string[],
): WriterRepairPlan {
  const plan: WriterRepairPlan = {
    stateRoot,
    status: state.status,
    operationId: state.record?.operationId ?? null,
    journalPath,
    targets,
    transition: blockedReasons.length > 0 ? "none" : transition,
    blockedReasons,
    planDigest: "",
  };
  // The digest binds the operation, the journal and every observed hash, so an
  // apply cannot act on a plan the user did not review.
  plan.planDigest = createHash("sha256")
    .update(
      JSON.stringify({
        operationId: plan.operationId,
        journalPath: plan.journalPath,
        transition: plan.transition,
        targets: plan.targets.map((entry) => [entry.target, entry.classification, entry.currentHash]),
      }),
      "utf8",
    )
    .digest("hex");
  return plan;
}

/**
 * Performs the one transition a reviewed plan proved safe. The plan is
 * recomputed and its digest compared first, so anything that changed since the
 * review refuses instead of acting on stale evidence.
 */
export async function applyWriterRepair(stateRoot: string, reviewedPlanDigest: string): Promise<WriterRepairPlan> {
  const current = await planWriterRepair(stateRoot);
  if (current.planDigest !== reviewedPlanDigest) {
    throw new Error("The state changed after this repair plan was reviewed; re-run the diagnosis before applying.");
  }
  if (current.transition === "none") {
    throw new Error(
      `This state cannot be repaired automatically: ${current.blockedReasons.join("; ") || "no proven transition"}`,
    );
  }

  if (current.journalPath !== null && existsSync(current.journalPath)) {
    const journal = JSON.parse(await readFile(current.journalPath, "utf8")) as Record<string, unknown>;
    journal.status = current.transition === "finalize-applied" ? "applied" : "failed";
    journal.repairedAt = new Date().toISOString();
    const handle = await open(current.journalPath, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(journal, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncDirectory(dirname(current.journalPath));
  }

  await rm(writerLockPath(stateRoot), { force: true });
  await syncDirectory(stateRoot);
  return current;
}

/** Lists journals present in a state root, for diagnostics that must not parse. */
export async function listJournalPaths(stateRoot: string): Promise<string[]> {
  const journalRoot = join(stateRoot, "journal");
  if (!existsSync(journalRoot)) return [];
  const names = (await readdir(journalRoot)).filter((name) => name.endsWith(".json")).sort();
  const paths: string[] = [];
  for (const name of names) {
    const path = join(journalRoot, name);
    if ((await stat(path)).isFile()) paths.push(path);
  }
  return paths;
}
