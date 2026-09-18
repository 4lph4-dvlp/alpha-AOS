import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CrashRepairAction, CrashRepairPlan, CrashRepairResult } from "../types.js";
import type { TransactionJournal } from "./transaction.js";
import { isProcessAlive, writerLockPath } from "./writer-lock.js";

export type { CrashRepairAction, CrashRepairPlan, CrashRepairResult };

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function quarantineJournal(journalPath: string): Promise<string> {
  const timestamp = Date.now();
  const targetPath = `${journalPath}.corrupt.${timestamp}`;
  await rename(journalPath, targetPath);
  return targetPath;
}

export async function planCrashRepair(stateRoot: string): Promise<CrashRepairPlan> {
  const lockPath = writerLockPath(stateRoot);
  let writerPid: number | null = null;
  let writerAlive = false;
  const blockedReasons: string[] = [];

  if (existsSync(lockPath)) {
    try {
      const lockContent = await readFile(lockPath, "utf8");
      const record = JSON.parse(lockContent) as { pid?: number };
      if (typeof record.pid === "number") {
        writerPid = record.pid;
        writerAlive = isProcessAlive(record.pid);
        if (writerAlive) {
          blockedReasons.push(`writer process ${record.pid} is still active; repair refused`);
        }
      }
    } catch {
      // Unparseable writer lock is considered stale/needs-repair
    }
  }

  const journalDir = join(stateRoot, "journal");
  let action: CrashRepairAction = "none";
  let operationId: string | null = null;
  let journalPath: string | null = null;
  let snapshotsIntact = false;
  const affectedFiles: string[] = [];

  if (existsSync(journalDir)) {
    try {
      const entries = await readdir(journalDir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && e.name.endsWith(".json"))
        .map((e) => e.name)
        .sort()
        .reverse();

      for (const file of files) {
        const fullPath = join(journalDir, file);
        let parsed: TransactionJournal | null = null;
        try {
          const content = await readFile(fullPath, "utf8");
          parsed = JSON.parse(content) as TransactionJournal;
        } catch {
          action = "quarantine";
          journalPath = fullPath;
          operationId = file.replace(/\.json$/u, "");
          break;
        }

        if (parsed.status === "applying") {
          journalPath = fullPath;
          operationId = parsed.id;
          let allIntact = true;
          for (const entry of parsed.files) {
            affectedFiles.push(entry.target);
            if (entry.snapshot !== null) {
              if (!existsSync(entry.snapshot)) {
                allIntact = false;
              } else if (entry.beforeHash !== null) {
                const snapBytes = await readFile(entry.snapshot);
                if (sha256(snapBytes) !== entry.beforeHash) {
                  allIntact = false;
                }
              }
            }
          }
          snapshotsIntact = allIntact;
          action = allIntact ? "snapshot-rollback" : "quarantine";
          break;
        }
      }
    } catch {
      // Non-fatal if journal directory cannot be read
    }
  }

  if (action === "none" && existsSync(lockPath)) {
    if (!writerAlive) {
      action = "release-only";
    }
  }

  const planDigest = sha256(
    JSON.stringify({
      stateRoot,
      operationId,
      journalPath,
      action,
      writerPid,
      writerAlive,
      snapshotsIntact,
      affectedFiles,
      blockedReasons,
    }),
  );

  return {
    stateRoot,
    operationId,
    journalPath,
    action,
    writerPid,
    writerAlive,
    snapshotsIntact,
    affectedFiles,
    blockedReasons,
    planDigest,
  };
}

export async function applyCrashRepair(
  stateRoot: string,
  reviewedPlanDigest?: string,
): Promise<CrashRepairResult> {
  const plan = await planCrashRepair(stateRoot);
  if (reviewedPlanDigest && plan.planDigest !== reviewedPlanDigest) {
    throw new Error("Repair plan changed between review and apply");
  }
  if (plan.blockedReasons.length > 0) {
    throw new Error(`Crash repair refused: ${plan.blockedReasons.join("; ")}`);
  }

  const restoredFiles: string[] = [];
  let quarantinedJournal: string | undefined;
  const lockPath = writerLockPath(stateRoot);

  if (plan.action === "snapshot-rollback" && plan.journalPath) {
    const journalContent = await readFile(plan.journalPath, "utf8");
    const journal = JSON.parse(journalContent) as TransactionJournal;

    // Restore snapshots in reverse order
    for (const file of [...journal.files].reverse()) {
      if (!file.existed) {
        if (existsSync(file.target)) {
          await rm(file.target, { force: true });
        }
      } else if (file.snapshot && existsSync(file.snapshot)) {
        await mkdir(dirname(file.target), { recursive: true });
        await copyFile(file.snapshot, file.target);
      }
      restoredFiles.push(file.target);
    }

    journal.status = "repaired";
    journal.repairedAt = new Date().toISOString();
    await writeFile(plan.journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
    return { plan, restoredFiles, lockReleased: true };
  }

  if (plan.action === "quarantine" && plan.journalPath) {
    quarantinedJournal = await quarantineJournal(plan.journalPath);
    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
    return { plan, restoredFiles: [], quarantinedJournal, lockReleased: true };
  }

  if (plan.action === "release-only") {
    if (existsSync(lockPath)) {
      await rm(lockPath, { force: true });
    }
    return { plan, restoredFiles: [], lockReleased: true };
  }

  return { plan, restoredFiles: [], lockReleased: false };
}
