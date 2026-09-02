import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

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
}

export interface TransactionJournal {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  status: "applying" | "applied" | "rolled-back" | "failed";
  allowedRoots: string[];
  files: JournalFile[];
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

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, path);
}

async function writeTargetAtomic(target: string, content: Uint8Array): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, target);
}

export async function applyFileTransaction(options: {
  stateRoot: string;
  allowedRoots: string[];
  operations: FileWriteOperation[];
}): Promise<TransactionJournal> {
  if (options.operations.length === 0) throw new Error("Transaction has no operations");
  const id = `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}-${randomUUID()}`;
  const snapshotRoot = join(options.stateRoot, "snapshots", id);
  const journalPath = join(options.stateRoot, "journal", `${id}.json`);
  const journal: TransactionJournal = {
    schemaVersion: 1,
    id,
    createdAt: new Date().toISOString(),
    status: "applying",
    allowedRoots: options.allowedRoots.map((root) => resolve(root)),
    files: [],
  };
  await mkdir(snapshotRoot, { recursive: true, mode: 0o700 });
  await chmod(snapshotRoot, 0o700).catch(() => undefined);
  await writeJsonAtomic(journalPath, journal);

  try {
    for (const [index, operation] of options.operations.entries()) {
      const target = resolve(operation.target);
      requireAllowed(target, options.allowedRoots);
      const existed = existsSync(target);
      const before = existed ? await readFile(target) : null;
      const snapshot = existed ? join(snapshotRoot, `${index}.bin`) : null;
      if (snapshot && before) {
        await writeFile(snapshot, before, { mode: 0o600 });
        await chmod(snapshot, 0o600).catch(() => undefined);
      }
      const content = operation.content === null
        ? null
        : typeof operation.content === "string" ? Buffer.from(operation.content, "utf8") : Buffer.from(operation.content);
      if (content === null) await rm(target, { force: true });
      else await writeTargetAtomic(target, content);
      journal.files.push({
        target,
        existed,
        snapshot,
        beforeHash: before ? sha256(before) : null,
        afterHash: content === null ? null : sha256(content),
      });
      await writeJsonAtomic(journalPath, journal);
    }
    journal.status = "applied";
    await writeJsonAtomic(journalPath, journal);
    return journal;
  } catch (error) {
    journal.status = "failed";
    await writeJsonAtomic(journalPath, journal);
    if (journal.files.length > 0) await rollbackFileTransaction(options.stateRoot, id, options.allowedRoots);
    throw error;
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
    } else {
      await rm(file.target, { force: true });
    }
    if (file.beforeHash) {
      const restored = await readFile(file.target);
      if (sha256(restored) !== file.beforeHash) throw new Error(`Rollback hash mismatch: ${file.target}`);
    }
  }
  journal.status = "rolled-back";
  await writeJsonAtomic(journalPath, journal);
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
