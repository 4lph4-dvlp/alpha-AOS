import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, open, readFile, readdir, rename, rm } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  proveOperationPaths,
  recheckPathProof,
  type OperationPathInput,
  type OperationPathProofSet,
} from "./path-boundary.js";
import { acquireMutationSession, syncDirectory, type MutationSession } from "./writer-lock.js";

export interface FileWriteOperation {
  target: string;
  content: Uint8Array | string | null;
}

interface JournalFile {
  target: string;
  existed: boolean;
  snapshot: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  /** Binds this entry to the path proof that authorized it. */
  proofDigest: string;
}

export interface TransactionJournal {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "applying" | "applied" | "rolled-back" | "failed";
  allowedRoots: string[];
  files: JournalFile[];
  /** Whether directory entries could be flushed on this filesystem. */
  directorySyncSupported?: boolean;
  repairedAt?: string;
}

/**
 * Durable boundaries a managed write crosses. Each one is a place an
 * interruption can land, so each is independently reachable in tests.
 */
export type TransactionFailpoint =
  | "after-snapshot-sync"
  | "after-intent-journal-sync"
  | "after-target-rename"
  | "after-step-sync"
  | "after-final-sync";

const FAILPOINTS: readonly TransactionFailpoint[] = [
  "after-snapshot-sync",
  "after-intent-journal-sync",
  "after-target-rename",
  "after-step-sync",
  "after-final-sync",
];

function configuredFailpoint(explicit?: TransactionFailpoint): TransactionFailpoint | null {
  if (explicit !== undefined) return explicit;
  const fromEnvironment = process.env.ALPHA_AOS_FAILPOINT?.trim();
  if (fromEnvironment === undefined || fromEnvironment.length === 0) return null;
  return FAILPOINTS.includes(fromEnvironment as TransactionFailpoint)
    ? (fromEnvironment as TransactionFailpoint)
    : null;
}

/** Terminates hard, the way a real interruption would, leaving state on disk. */
function trip(failpoint: TransactionFailpoint, active: TransactionFailpoint | null): void {
  if (active !== failpoint) return;
  process.stderr.write(`alpha-aos: deterministic failpoint reached: ${failpoint}\n`);
  process.exit(70);
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function requireAllowed(target: string, allowedRoots: string[]): void {
  if (!allowedRoots.some((root) => inside(root, target))) {
    throw new Error(`Transaction target is outside allowed roots: ${target}`);
  }
}

/** Writes and flushes a file, then flushes the directory entry that names it. */
async function writeDurable(path: string, content: Uint8Array, mode: number): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "w", mode);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  return syncDirectory(dirname(path));
}

async function writeJsonDurable(path: string, value: unknown): Promise<boolean> {
  return writeDurable(path, Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"), 0o600);
}

/** Every path role a file transaction touches, declared before it starts. */
function operationPathInputs(stateRoot: string, operations: readonly FileWriteOperation[]): OperationPathInput[] {
  return [
    ...operations.map((operation): OperationPathInput => ({ role: "target", path: operation.target })),
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
  ];
}

export interface FileTransactionOptions {
  stateRoot: string;
  allowedRoots: string[];
  operations: FileWriteOperation[];
  /**
   * An already-held session. When omitted the transaction acquires one for the
   * duration of the call, so a single-shot caller stays serialized too.
   */
  session?: MutationSession;
  /** Test-only deterministic interruption point. */
  failpoint?: TransactionFailpoint;
}

export async function applyFileTransaction(options: FileTransactionOptions): Promise<TransactionJournal> {
  if (options.operations.length === 0) throw new Error("Transaction has no operations");
  const failpoint = configuredFailpoint(options.failpoint);

  // Containment is proven for every declared role before anything is taken.
  const proofs: OperationPathProofSet = await proveOperationPaths({
    inputs: operationPathInputs(options.stateRoot, options.operations),
    allowedRoots: [...options.allowedRoots, options.stateRoot],
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });
  if (!proofs.proven) {
    throw new Error(`Transaction path boundary refused: ${proofs.code} — ${proofs.detail ?? "no detail"}`);
  }
  // Targets must additionally stay inside the caller's own roots, not merely
  // inside the state root the session owns.
  for (const operation of options.operations) requireAllowed(resolve(operation.target), options.allowedRoots);

  const planDigest = createHash("sha256")
    .update(JSON.stringify(options.operations.map((operation) => resolve(operation.target))), "utf8")
    .digest("hex");

  const ownSession = options.session === undefined;
  const session =
    options.session ??
    (await acquireMutationSession({ stateRoot: options.stateRoot, proofs, planDigest }));
  session.assertOwned();

  const id = session.operationId;
  const snapshotRoot = join(options.stateRoot, "snapshots", id);
  const journalPath = join(options.stateRoot, "journal", `${id}.json`);
  const journal: TransactionJournal = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    status: "applying",
    allowedRoots: options.allowedRoots.map((root) => resolve(root)),
    files: [],
    directorySyncSupported: true,
  };
  await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
  await chmod(snapshotRoot, 0o700).catch(() => undefined);
  journal.directorySyncSupported = await writeJsonDurable(journalPath, journal);

  try {
    for (const [index, operation] of options.operations.entries()) {
      const target = resolve(operation.target);
      requireAllowed(target, options.allowedRoots);

      const proof = proofs.proofs.find((entry) => entry.role === "target" && entry.configured === target);
      if (proof === undefined) {
        throw new Error(`Transaction target was not proven before apply: ${target}`);
      }

      const existed = existsSync(target);
      const before = existed ? await readFile(target) : null;
      const snapshot = existed ? join(snapshotRoot, `${index}.bin`) : null;
      if (snapshot && before) {
        // Recovery bytes are durable before the target is touched.
        await writeDurable(snapshot, before, 0o600);
      }
      trip("after-snapshot-sync", failpoint);

      const content = operation.content === null
        ? null
        : typeof operation.content === "string" ? Buffer.from(operation.content, "utf8") : Buffer.from(operation.content);

      // Write-ahead intent: the journal records what is about to happen, with
      // both hashes, before any target byte changes.
      journal.files.push({
        target,
        existed,
        snapshot,
        beforeHash: before ? sha256(before) : null,
        afterHash: content === null ? null : sha256(content),
        proofDigest: createHash("sha256").update(JSON.stringify(proof.components), "utf8").digest("hex"),
      });
      await writeJsonDurable(journalPath, journal);
      trip("after-intent-journal-sync", failpoint);

      // The ancestor chain is re-read immediately before the mutation, so a
      // parent swapped since preflight refuses here rather than being followed.
      const recheck = await recheckPathProof(proof);
      if (!recheck.ok) {
        throw new Error(`Path boundary changed before mutation: ${recheck.code} — ${recheck.detail ?? "no detail"}`);
      }

      if (content === null) {
        await rm(target, { force: true });
        await syncDirectory(dirname(target));
      } else {
        await writeDurable(target, content, 0o600);
      }
      trip("after-target-rename", failpoint);

      await writeJsonDurable(journalPath, journal);
      trip("after-step-sync", failpoint);
    }

    journal.status = "applied";
    await writeJsonDurable(journalPath, journal);
    trip("after-final-sync", failpoint);
    return journal;
  } catch (error) {
    journal.status = "failed";
    await writeJsonDurable(journalPath, journal).catch(() => undefined);
    if (journal.files.length > 0) {
      await rollbackFileTransaction(options.stateRoot, id, options.allowedRoots).catch(() => undefined);
    }
    throw error;
  } finally {
    if (ownSession) await session.close();
  }
}

export async function rollbackFileTransaction(stateRoot: string, id: string, allowedRoots: string[]): Promise<TransactionJournal> {
  const journalPath = join(stateRoot, "journal", `${id}.json`);
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as TransactionJournal;
  if (journal.status === "rolled-back") throw new Error(`Transaction is already rolled back: ${id}`);
  // Verify every post-transaction byte before changing any file. A rollback
  // must never overwrite edits made by a user or another tool after apply.
  for (const file of journal.files) {
    requireAllowed(file.target, allowedRoots);
    if (file.afterHash === null) {
      if (existsSync(file.target)) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
    } else {
      if (!existsSync(file.target)) throw new Error(`Rollback blocked because target is missing: ${file.target}`);
      const current = await readFile(file.target);
      if (sha256(current) !== file.afterHash) throw new Error(`Rollback blocked by post-transaction drift: ${file.target}`);
    }
  }
  for (const file of [...journal.files].reverse()) {
    requireAllowed(file.target, allowedRoots);
    if (file.existed && file.snapshot) {
      await mkdir(dirname(file.target), { recursive: true });
      await copyFile(file.snapshot, file.target);
      await syncDirectory(dirname(file.target));
    } else {
      await rm(file.target, { force: true });
      await syncDirectory(dirname(file.target));
    }
    if (file.beforeHash) {
      const restored = await readFile(file.target);
      if (sha256(restored) !== file.beforeHash) throw new Error(`Rollback hash mismatch: ${file.target}`);
    }
  }
  journal.status = "rolled-back";
  await writeJsonDurable(journalPath, journal);
  return journal;
}

export async function planManagedRollback(stateRoot: string, id: string): Promise<TransactionJournal> {
  const journalPath = join(stateRoot, "journal", `${id}.json`);
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as TransactionJournal;
  if (!Array.isArray(journal.allowedRoots) || journal.allowedRoots.length === 0) {
    throw new Error(`Transaction predates managed rollback roots and cannot be rolled back automatically: ${id}`);
  }
  for (const file of journal.files) requireAllowed(file.target, journal.allowedRoots);
  return journal;
}

export async function rollbackManagedTransaction(stateRoot: string, id: string): Promise<TransactionJournal> {
  const journal = await planManagedRollback(stateRoot, id);
  return rollbackFileTransaction(stateRoot, id, journal.allowedRoots);
}

export async function listManagedTransactions(stateRoot: string): Promise<TransactionJournal[]> {
  const journalRoot = join(stateRoot, "journal");
  if (!existsSync(journalRoot)) return [];
  const names = (await readdir(journalRoot)).filter((name) => name.endsWith(".json")).sort().reverse();
  const journals: TransactionJournal[] = [];
  for (const name of names) {
    try {
      const journal = JSON.parse(await readFile(join(journalRoot, name), "utf8")) as TransactionJournal;
      if (Array.isArray(journal.allowedRoots) && journal.allowedRoots.length > 0) journals.push(journal);
    } catch {
      // A corrupt journal is excluded from automatic operations and remains on disk for diagnosis.
    }
  }
  return journals;
}
