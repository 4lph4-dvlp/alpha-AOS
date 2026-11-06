import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, lstat, mkdir, open, readFile, readdir, rename, rm, rmdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { DriftDiagnostic } from "../types.js";
import {
  proveOperationPaths,
  recheckPathProof,
  type OperationPathInput,
  type OperationPathProofSet,
} from "./path-boundary.js";
import { validateManagedDocument } from "./validation.js";
import {
  acquireMutationSession,
  acquirePolicyTargetSession,
  syncDirectory,
  type MutationSession,
  type PolicyTargetSession,
} from "./writer-lock.js";

export class RollbackDriftError extends Error {
  readonly diagnostics: readonly DriftDiagnostic[];

  constructor(message: string, diagnostics: readonly DriftDiagnostic[]) {
    super(message);
    this.name = "RollbackDriftError";
    this.diagnostics = diagnostics;
  }
}

export function generateUnifiedDiff(
  target: string,
  expectedText: string,
  actualText: string,
  expectedHash: string,
  actualHash: string,
): string {
  const expectedLines = expectedText.length > 0 ? expectedText.split(/\r?\n/u) : [];
  const actualLines = actualText.length > 0 ? actualText.split(/\r?\n/u) : [];
  const lines: string[] = [
    `--- a/${target}\t(expected sha256: ${expectedHash.slice(0, 12)})`,
    `+++ b/${target}\t(actual sha256: ${actualHash.slice(0, 12)})`,
    `@@ -1,${Math.max(1, expectedLines.length)} +1,${Math.max(1, actualLines.length)} @@`,
  ];
  for (const line of expectedLines) {
    if (!actualLines.includes(line)) lines.push(`-${line}`);
  }
  for (const line of actualLines) {
    if (!expectedLines.includes(line)) lines.push(`+${line}`);
  }
  return lines.join("\n");
}

export async function sweepReverseDirectories(
  filePath: string,
  allowedRoots: readonly string[],
): Promise<string[]> {
  const removedDirs: string[] = [];
  let currentDir = dirname(resolve(filePath));
  const resolvedRoots = allowedRoots.map((r) => resolve(r));

  while (!resolvedRoots.some((r) => currentDir === r || resolve(currentDir) === r)) {
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    try {
      await rmdir(currentDir);
      removedDirs.push(currentDir);
      currentDir = parent;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOTEMPTY" || code === "EEXIST" || code === "EBUSY" || code === "EPERM") {
        break;
      }
      throw error;
    }
  }
  return removedDirs;
}


export interface PolicyOperationMetadata {
  readonly kind: "project-mode";
  readonly canonicalRoot: string;
  readonly rootIdentity: {
    readonly deviceExact: string;
    readonly inodeExact: string;
  };
  readonly policyRelativePath: ".alpha-aos/behavior.json";
}

export interface PolicyMutationContext {
  readonly targetSession: PolicyTargetSession;
  readonly stateSession: MutationSession;
}

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
  status: "applying" | "applied" | "rolled-back" | "failed" | "repaired";
  allowedRoots: string[];
  files: JournalFile[];
  /** Whether directory entries could be flushed on this filesystem. */
  directorySyncSupported?: boolean;
  repairedAt?: string;
  policyOperation?: PolicyOperationMetadata;
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

function configuredFailpoint(explicit?: TransactionFailpoint | null): TransactionFailpoint | null {
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
  session?: MutationSession | undefined;
  /** Test-only deterministic interruption point. */
  failpoint?: TransactionFailpoint | null | undefined;
  policyOperation?: PolicyOperationMetadata | undefined;
  policyContext?: PolicyMutationContext | undefined;
}

export async function applyFileTransaction(options: FileTransactionOptions): Promise<TransactionJournal> {
  if (options.operations.length === 0) throw new Error("Transaction has no operations");
  const failpoint = configuredFailpoint(options.failpoint);

  if (options.policyOperation !== undefined) {
    if (options.policyOperation.kind !== "project-mode") {
      throw new Error(`Invalid policy operation kind: ${String(options.policyOperation.kind)}`);
    }
    if (options.policyOperation.policyRelativePath !== ".alpha-aos/behavior.json") {
      throw new Error(`Invalid policy relative path: ${options.policyOperation.policyRelativePath}`);
    }
    if (!isAbsolute(options.policyOperation.canonicalRoot) || !options.policyOperation.canonicalRoot) {
      throw new Error(`Policy canonicalRoot must be an absolute path: ${options.policyOperation.canonicalRoot}`);
    }
    if (
      !options.policyOperation.rootIdentity?.deviceExact ||
      !options.policyOperation.rootIdentity?.inodeExact
    ) {
      throw new Error("Policy rootIdentity must have deviceExact and inodeExact");
    }

    if (options.operations.length !== 1) {
      throw new Error("Policy transaction must contain exactly one operation");
    }
    const expectedTarget = resolve(join(options.policyOperation.canonicalRoot, options.policyOperation.policyRelativePath));
    const opTarget = resolve(options.operations[0]!.target);
    if (opTarget !== expectedTarget) {
      throw new Error(`Policy transaction target must equal ${expectedTarget}, got ${opTarget}`);
    }

    const policyParent = dirname(expectedTarget);
    if (!inside(options.policyOperation.canonicalRoot, policyParent)) {
      throw new Error(`Policy parent directory is outside canonical root: ${policyParent}`);
    }
    if (!options.allowedRoots.some((r) => resolve(r) === policyParent)) {
      throw new Error(`Policy transaction allowedRoots must include .alpha-aos parent: ${policyParent}`);
    }
  }

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

  let targetSession: PolicyTargetSession | undefined;
  let ownTargetSession = false;
  let session: MutationSession;
  let ownSession = false;

  if (options.policyOperation !== undefined) {
    if (options.policyContext !== undefined) {
      if (resolve(options.policyContext.targetSession.canonicalRoot) !== resolve(options.policyOperation.canonicalRoot)) {
        throw new Error("Held policy context canonicalRoot does not match transaction policyOperation");
      }
      if (resolve(options.policyContext.stateSession.stateRoot) !== resolve(options.stateRoot)) {
        throw new Error("Held policy context stateRoot does not match transaction stateRoot");
      }
      targetSession = options.policyContext.targetSession;
      session = options.policyContext.stateSession;
      ownTargetSession = false;
      ownSession = false;
    } else if (options.session !== undefined) {
      throw new Error("Cannot acquire policy target while holding an unrelated state session without policyContext");
    } else {
      const operationId = `${new Date().toISOString().replaceAll(/[:.]/gu, "-")}-${randomUUID()}`;
      targetSession = await acquirePolicyTargetSession({
        canonicalRoot: options.policyOperation.canonicalRoot,
        rootIdentity: options.policyOperation.rootIdentity,
        operationId,
        planDigest,
      });
      ownTargetSession = true;
      try {
        session = await acquireMutationSession({
          stateRoot: options.stateRoot,
          proofs,
          planDigest,
          operationId,
        });
        ownSession = true;
      } catch (err) {
        await targetSession.close();
        throw err;
      }
    }
  } else {
    ownSession = options.session === undefined;
    session =
      options.session ??
      (await acquireMutationSession({ stateRoot: options.stateRoot, proofs, planDigest }));
  }
  session.assertOwned();
  if (targetSession) targetSession.assertOwned();

  // One session may run several transactions; each gets its own journal so a
  // later component cannot overwrite an earlier one's recorded intent.
  const id = session.allocateTransactionId();
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
    ...(options.policyOperation !== undefined ? { policyOperation: options.policyOperation } : {}),
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
        journal.directorySyncSupported = (await writeDurable(snapshot, before, 0o600)) && journal.directorySyncSupported;
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
      journal.directorySyncSupported = (await writeJsonDurable(journalPath, journal)) && journal.directorySyncSupported;
      trip("after-intent-journal-sync", failpoint);

      // The ancestor chain is re-read immediately before the mutation, so a
      // parent swapped since preflight refuses here rather than being followed.
      const recheck = await recheckPathProof(proof);
      if (!recheck.ok) {
        throw new Error(`Path boundary changed before mutation: ${recheck.code} — ${recheck.detail ?? "no detail"}`);
      }

      if (content === null) {
        await rm(target, { force: true });
        journal.directorySyncSupported = (await syncDirectory(dirname(target))) && journal.directorySyncSupported;
      } else {
        journal.directorySyncSupported = (await writeDurable(target, content, 0o600)) && journal.directorySyncSupported;
      }
      trip("after-target-rename", failpoint);

      journal.directorySyncSupported = (await writeJsonDurable(journalPath, journal)) && journal.directorySyncSupported;
      trip("after-step-sync", failpoint);
    }

    journal.status = "applied";
    if (!(await writeJsonDurable(journalPath, journal))) {
      journal.directorySyncSupported = false;
      await writeJsonDurable(journalPath, journal);
    }
    trip("after-final-sync", failpoint);
    return journal;
  } catch (error) {
    journal.status = "failed";
    await writeJsonDurable(journalPath, journal).catch(() => undefined);
    if (journal.files.length > 0) {
      const activePolicyContext =
        targetSession && session ? { targetSession, stateSession: session } : undefined;
      await rollbackFileTransaction(
        options.stateRoot,
        id,
        options.allowedRoots,
        activePolicyContext !== undefined ? { policyContext: activePolicyContext } : undefined,
      ).catch(() => undefined);
    }
    throw error;
  } finally {
    if (ownSession) await session.close();
    if (ownTargetSession && targetSession) await targetSession.close();
  }
}

export async function rollbackFileTransaction(
  stateRoot: string,
  id: string,
  allowedRoots: string[],
  options?: {
    policyContext?: PolicyMutationContext | undefined;
    invocationPath?: string | undefined;
  } | undefined,
): Promise<TransactionJournal> {
  const journalPath = join(stateRoot, "journal", `${id}.json`);
  let text: string;
  try {
    text = await readFile(journalPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Transaction not found: ${id}`);
    }
    throw err;
  }
  const validation = validateManagedDocument<TransactionJournal>({
    text,
    format: "json",
    kind: "journal",
  });
  if (!validation.ok || !validation.value) {
    const detail = validation.issues.map((i) => `${i.documentPath}: ${i.code}`).join(", ");
    throw new Error(`Transaction journal is invalid: ${id} (${detail})`);
  }
  const journal = validation.value;
  if (journal.status === "rolled-back") throw new Error(`Transaction is already rolled back: ${id}`);

  const isPolicy = journal.policyOperation !== undefined;
  let targetSession: PolicyTargetSession | undefined;
  let stateSession: MutationSession | undefined;
  let ownTarget = false;
  let ownState = false;

  if (isPolicy && journal.policyOperation) {
    // Check tree-off
    const invocationPath = options?.invocationPath ?? process.cwd();
    const { loadTreeRegistry, resolveEffectivePolicy } = await import("./tree-policy.js");
    const registry = await loadTreeRegistry(stateRoot);
    const invocationTree = await resolveEffectivePolicy(invocationPath, registry.trees);
    if (invocationTree.effectiveMode === "off") {
      throw new Error("Rollback blocked: invocation directory is isolated by tree policy (off)");
    }
    const rootTree = await resolveEffectivePolicy(journal.policyOperation.canonicalRoot, registry.trees);
    if (rootTree.effectiveMode === "off") {
      throw new Error("Rollback blocked: project root is isolated by tree policy (off)");
    }

    // Check root existence and exact identity
    let rootStats;
    try {
      rootStats = await lstat(journal.policyOperation.canonicalRoot, { bigint: true });
    } catch {
      throw new Error(`Rollback blocked: project root does not exist or is inaccessible: ${journal.policyOperation.canonicalRoot}`);
    }
    if (!rootStats.isDirectory()) {
      throw new Error(`Rollback blocked: project root is not a directory: ${journal.policyOperation.canonicalRoot}`);
    }
    if (
      rootStats.dev.toString() !== journal.policyOperation.rootIdentity.deviceExact ||
      rootStats.ino.toString() !== journal.policyOperation.rootIdentity.inodeExact
    ) {
      throw new Error("Rollback blocked: project root identity changed since transaction");
    }

    const expectedPolicyTarget = resolve(join(journal.policyOperation.canonicalRoot, journal.policyOperation.policyRelativePath));
    if (journal.files.length !== 1 || resolve(journal.files[0]!.target) !== expectedPolicyTarget) {
      throw new Error("Rollback blocked: policy transaction files do not match policy target");
    }

    // Session acquisition
    if (options?.policyContext) {
      if (resolve(options.policyContext.targetSession.canonicalRoot) !== resolve(journal.policyOperation.canonicalRoot)) {
        throw new Error("Held policy context canonicalRoot does not match journal");
      }
      if (resolve(options.policyContext.stateSession.stateRoot) !== resolve(stateRoot)) {
        throw new Error("Held policy context stateRoot does not match transaction stateRoot");
      }
      targetSession = options.policyContext.targetSession;
      stateSession = options.policyContext.stateSession;
      ownTarget = false;
      ownState = false;
    } else {
      const rollbackPlanDigest = createHash("sha256")
        .update(`rollback:${journal.id}:${journal.policyOperation.canonicalRoot}`, "utf8")
        .digest("hex");
      targetSession = await acquirePolicyTargetSession({
        canonicalRoot: journal.policyOperation.canonicalRoot,
        rootIdentity: journal.policyOperation.rootIdentity,
        operationId: `rollback-${journal.id}`,
        planDigest: rollbackPlanDigest,
      });
      ownTarget = true;
      try {
        const proofs = await proveOperationPaths({
          inputs: operationPathInputs(stateRoot, journal.files.map((f) => ({ target: f.target, content: null }))),
          allowedRoots: [...journal.allowedRoots, stateRoot],
          requiredRoles: ["target", "state", "journal", "snapshot"],
        });
        if (!proofs.proven) {
          throw new Error(`Path boundary refused for rollback: ${proofs.code}`);
        }
        stateSession = await acquireMutationSession({
          stateRoot,
          proofs,
          planDigest: rollbackPlanDigest,
          operationId: `rollback-${journal.id}`,
        });
        ownState = true;
      } catch (err) {
        await targetSession.close();
        throw err;
      }
    }
  }

  try {
    // Verify every post-transaction byte before changing any file (LIFE-05, D-05).
    const diagnostics: DriftDiagnostic[] = [];
    for (const file of journal.files) {
      requireAllowed(file.target, allowedRoots);
      let drifted = false;
      let actualHash: string | null = null;

      if (file.afterHash === null) {
        if (existsSync(file.target)) {
          drifted = true;
          const current = await readFile(file.target);
          actualHash = sha256(current);
        }
      } else {
        if (!existsSync(file.target)) {
          drifted = true;
          actualHash = null;
        } else {
          const current = await readFile(file.target);
          actualHash = sha256(current);
          if (actualHash !== file.afterHash) {
            drifted = true;
          }
        }
      }

      if (drifted) {
        let diff: string | null = null;
        let remediation: string;
        if (isPolicy) {
          diff = null;
          remediation = file.snapshot
            ? "Reconcile project behavior policy manually or inspect snapshot."
            : "Remove untracked or drifted policy file.";
        } else {
          let expectedText = "";
          if (file.snapshot && existsSync(file.snapshot)) {
            expectedText = await readFile(file.snapshot, "utf8").catch(() => "");
          }
          const actualText = existsSync(file.target) ? await readFile(file.target, "utf8").catch(() => "") : "";
          const expHash = file.afterHash ?? "none";
          const actHash = actualHash ?? "missing";
          diff = (actualHash !== null && (expectedText !== "" || actualText !== ""))
            ? generateUnifiedDiff(basename(file.target), expectedText, actualText, expHash, actHash)
            : null;
          remediation = file.snapshot
            ? `Reconcile file manually or restore from snapshot: ${file.snapshot}`
            : `Remove untracked or drifted file: ${file.target}`;
        }

        diagnostics.push({
          target: file.target,
          expectedHash: file.afterHash,
          actualHash,
          unifiedDiff: diff,
          remediation,
        });
      }
    }

    if (diagnostics.length > 0) {
      const targets = diagnostics.map((d) => d.target).join(", ");
      throw new RollbackDriftError(
        `Rollback blocked by post-transaction drift on ${diagnostics.length} file(s): ${targets}`,
        diagnostics,
      );
    }

    // Preflight passed cleanly. Execute file restorations and reverse directory sweeps.
    for (const file of [...journal.files].reverse()) {
      requireAllowed(file.target, allowedRoots);
      if (isPolicy) {
        if (file.existed && file.snapshot) {
          if (!existsSync(file.snapshot)) {
            throw new Error(`Rollback blocked: snapshot file is missing: ${file.snapshot}`);
          }
          const snapshotBytes = await readFile(file.snapshot);
          if (file.beforeHash && sha256(snapshotBytes) !== file.beforeHash) {
            throw new Error(`Rollback blocked: snapshot hash mismatch: ${file.snapshot}`);
          }
          await writeDurable(file.target, snapshotBytes, 0o600);
        } else {
          await rm(file.target, { force: true });
          await syncDirectory(dirname(file.target));
        }
      } else {
        if (file.existed && file.snapshot) {
          await mkdir(dirname(file.target), { recursive: true });
          await copyFile(file.snapshot, file.target);
          await syncDirectory(dirname(file.target));
        } else {
          await rm(file.target, { force: true });
          await syncDirectory(dirname(file.target));
          await sweepReverseDirectories(file.target, allowedRoots);
        }
      }
      if (file.beforeHash) {
        const restored = await readFile(file.target);
        if (sha256(restored) !== file.beforeHash) throw new Error(`Rollback hash mismatch: ${file.target}`);
      }
    }
    journal.status = "rolled-back";
    await writeJsonDurable(journalPath, journal);
    return journal;
  } finally {
    if (ownState && stateSession) await stateSession.close();
    if (ownTarget && targetSession) await targetSession.close();
  }
}

export async function planManagedRollback(
  stateRoot: string,
  id: string,
  options?: { invocationPath?: string | undefined } | undefined,
): Promise<TransactionJournal> {
  const journalPath = join(stateRoot, "journal", `${id}.json`);
  let text: string;
  try {
    text = await readFile(journalPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Transaction not found: ${id}`);
    }
    throw err;
  }
  const validation = validateManagedDocument<TransactionJournal>({
    text,
    format: "json",
    kind: "journal",
  });
  if (!validation.ok || !validation.value) {
    const detail = validation.issues.map((i) => `${i.documentPath}: ${i.code}`).join(", ");
    throw new Error(`Transaction journal is invalid: ${id} (${detail})`);
  }
  const journal = validation.value;
  if (journal.status === "rolled-back") throw new Error(`Transaction is already rolled back: ${id}`);
  if (!Array.isArray(journal.allowedRoots) || journal.allowedRoots.length === 0) {
    throw new Error(`Transaction predates managed rollback roots and cannot be rolled back automatically: ${id}`);
  }
  for (const file of journal.files) requireAllowed(file.target, journal.allowedRoots);

  if (journal.policyOperation !== undefined) {
    const invocationPath = options?.invocationPath ?? process.cwd();
    const { loadTreeRegistry, resolveEffectivePolicy } = await import("./tree-policy.js");
    const registry = await loadTreeRegistry(stateRoot);
    const invocationTree = await resolveEffectivePolicy(invocationPath, registry.trees);
    if (invocationTree.effectiveMode === "off") {
      throw new Error("Rollback blocked: invocation directory is isolated by tree policy (off)");
    }
    const rootTree = await resolveEffectivePolicy(journal.policyOperation.canonicalRoot, registry.trees);
    if (rootTree.effectiveMode === "off") {
      throw new Error("Rollback blocked: project root is isolated by tree policy (off)");
    }

    let rootStats;
    try {
      rootStats = await lstat(journal.policyOperation.canonicalRoot, { bigint: true });
    } catch {
      throw new Error(`Rollback blocked: project root does not exist or is inaccessible: ${journal.policyOperation.canonicalRoot}`);
    }
    if (!rootStats.isDirectory()) {
      throw new Error(`Rollback blocked: project root is not a directory: ${journal.policyOperation.canonicalRoot}`);
    }
    if (
      rootStats.dev.toString() !== journal.policyOperation.rootIdentity.deviceExact ||
      rootStats.ino.toString() !== journal.policyOperation.rootIdentity.inodeExact
    ) {
      throw new Error("Rollback blocked: project root identity changed since transaction");
    }

    const expectedPolicyTarget = resolve(join(journal.policyOperation.canonicalRoot, journal.policyOperation.policyRelativePath));
    if (journal.files.length !== 1 || resolve(journal.files[0]!.target) !== expectedPolicyTarget) {
      throw new Error("Rollback blocked: policy transaction files do not match policy target");
    }
  }

  // Enforce LIFO head-of-chain ordering (LIFE-05, D-07):
  // Any transaction that has not been rolled-back or repaired is active.
  const allJournals = await listManagedTransactions(stateRoot);
  const activeJournals = allJournals.filter((j) => j.status !== "rolled-back" && j.status !== "repaired");
  activeJournals.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const head = activeJournals[0];
  if (head !== undefined && head.id !== id) {
    throw new Error(`LIFO violation: transaction ${id} is not the most recent active transaction (head: ${head.id}). Roll back ${head.id} first.`);
  }

  return journal;
}

export async function rollbackManagedTransaction(
  stateRoot: string,
  id: string,
  options?: {
    policyContext?: PolicyMutationContext | undefined;
    invocationPath?: string | undefined;
  } | undefined,
): Promise<TransactionJournal> {
  const journal = await planManagedRollback(stateRoot, id, options);
  return rollbackFileTransaction(stateRoot, id, journal.allowedRoots, options);
}

export async function listManagedTransactions(stateRoot: string): Promise<TransactionJournal[]> {
  const journalRoot = join(stateRoot, "journal");
  if (!existsSync(journalRoot)) return [];
  const names = (await readdir(journalRoot)).filter((name) => name.endsWith(".json")).sort().reverse();
  const journals: TransactionJournal[] = [];
  for (const name of names) {
    try {
      const text = await readFile(join(journalRoot, name), "utf8");
      const validation = validateManagedDocument<TransactionJournal>({
        text,
        format: "json",
        kind: "journal",
      });
      if (validation.ok && validation.value) {
        const journal = validation.value;
        if (Array.isArray(journal.allowedRoots) && journal.allowedRoots.length > 0) {
          journals.push(journal);
        }
      }
    } catch {
      // A corrupt journal is excluded from automatic operations and remains on disk for diagnosis.
    }
  }
  return journals;
}
