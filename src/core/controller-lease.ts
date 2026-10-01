import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rm } from "node:fs/promises";
import { hostname } from "node:os";
import { join } from "node:path";
import type { HarnessId } from "../types.js";
import { isProcessAlive, syncDirectory } from "./writer-lock.js";

export interface ControllerLockRecord {
  readonly schemaVersion: 1;
  readonly harness: HarnessId;
  readonly token: string;
  readonly pid: number;
  readonly host: string;
  readonly startedAt: string;
  readonly contractDigest: string;
}

export class ControllerLockConflictError extends Error {
  readonly code = "LOCKED_PROJECT_CONTROLLER";
  readonly activeController: Omit<ControllerLockRecord, "token">;

  constructor(active: ControllerLockRecord) {
    super(
      `LOCKED_PROJECT_CONTROLLER: Another controller holds this project: ` +
        `harness=${active.harness}, pid=${active.pid}, host=${active.host}, startedAt=${active.startedAt}, ` +
        `contractDigest=${active.contractDigest.slice(0, 12)}. Cannot run two controllers simultaneously on the same project (D-05, ROL-03).`,
    );
    this.name = "ControllerLockConflictError";
    const { token: _, ...safe } = active;
    this.activeController = safe;
  }
}

export interface ControllerLease {
  readonly token: string;
  readonly record: ControllerLockRecord;
  release: () => Promise<void>;
}

/**
 * Acquires an exclusive fenced controller lease on a project (<projectRoot>/.alpha-aos/controller.lock) (ROL-03, D-05, D-08).
 * If another live controller holds the lock, immediately fails fast with LOCKED_PROJECT_CONTROLLER.
 * Stale locks from dead processes are safely auto-reclaimed after recording an audit entry to controller-lease-audit.jsonl (D-06).
 */
export async function acquireControllerLease(options: {
  projectRoot: string;
  harness: HarnessId;
  contractDigest: string;
}): Promise<ControllerLease> {
  const lockDir = join(options.projectRoot, ".alpha-aos");
  await mkdir(lockDir, { recursive: true, mode: 0o700 });
  const lockPath = join(lockDir, "controller.lock");
  const auditPath = join(lockDir, "controller-lease-audit.jsonl");

  const record: ControllerLockRecord = {
    schemaVersion: 1,
    harness: options.harness,
    token: randomUUID(),
    pid: process.pid,
    host: hostname(),
    startedAt: new Date().toISOString(),
    contractDigest: options.contractDigest,
  };

  let handle;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      handle = await open(lockPath, "wx", 0o600);
      break;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      const existingText = await readFile(lockPath, "utf8").catch(() => null);
      if (!existingText) {
        // Corrupt or empty lock file -> auto-reclaim
        const auditLog = {
          reclaimedAt: new Date().toISOString(),
          reason: "empty-or-unreadable-lock",
          previous: null,
          reclaimedBy: { harness: options.harness, pid: process.pid, token: record.token },
        };
        await appendFile(auditPath, `${JSON.stringify(auditLog)}\n`, "utf8");
        await rm(lockPath, { force: true });
        continue;
      }

      let existing: ControllerLockRecord | null = null;
      try {
        existing = JSON.parse(existingText) as ControllerLockRecord;
      } catch {
        existing = null;
      }

      if (!existing || typeof existing.pid !== "number") {
        const auditLog = {
          reclaimedAt: new Date().toISOString(),
          reason: "malformed-lock",
          previous: existingText,
          reclaimedBy: { harness: options.harness, pid: process.pid, token: record.token },
        };
        await appendFile(auditPath, `${JSON.stringify(auditLog)}\n`, "utf8");
        await rm(lockPath, { force: true });
        continue;
      }

      const isSameHost = existing.host === hostname();
      const isAlive = isSameHost && isProcessAlive(existing.pid);

      if (isAlive) {
        // D-05: Live controller active -> Fail-Fast
        throw new ControllerLockConflictError(existing);
      }

      // D-06: Dead process detected -> Zombie auto-reclaim
      const auditLog = {
        reclaimedAt: new Date().toISOString(),
        reason: isSameHost ? "stale-process-dead" : "cross-host-stale",
        previous: existing,
        reclaimedBy: { harness: options.harness, pid: process.pid, token: record.token },
      };
      await appendFile(auditPath, `${JSON.stringify(auditLog)}\n`, "utf8");
      await rm(lockPath, { force: true });
      // Retry acquisition in next loop iteration
    }
  }

  if (!handle) {
    throw new Error("Failed to acquire controller lease after multiple attempts");
  }

  try {
    await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(lockDir);

  return {
    token: record.token,
    record,
    release: async () => {
      try {
        const currentText = await readFile(lockPath, "utf8").catch(() => null);
        if (currentText) {
          const current = JSON.parse(currentText) as ControllerLockRecord;
          if (current.token === record.token) {
            await rm(lockPath, { force: true });
            await syncDirectory(lockDir);
          }
        }
      } catch {
        // Ignored during release
      }
    },
  };
}
