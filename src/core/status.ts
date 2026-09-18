import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { OfflineStatus, StackCatalog, StackLock } from "../types.js";
import { inspectWriterState } from "./writer-lock.js";

export type { OfflineStatus };

/**
 * Fast zero-subprocess offline status inspector (<50ms).
 * Evaluates local state, lock metadata, journal health, and tree policies
 * without spawning any child processes or opening network sockets.
 */
export async function getOfflineStatus(
  stateRoot: string,
  catalog: StackCatalog,
  lock: StackLock,
): Promise<OfflineStatus> {
  const writerState = await inspectWriterState(stateRoot);
  const journalDir = join(stateRoot, "journal");
  const incompleteTransactions: string[] = [];
  const corruptJournals: string[] = [];

  if (existsSync(journalDir)) {
    try {
      const entries = await readdir(journalDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
        const filePath = join(journalDir, entry.name);
        try {
          const content = await readFile(filePath, "utf8");
          const parsed = JSON.parse(content) as { id?: string; status?: string };
          if (parsed.status === "applying") {
            incompleteTransactions.push(parsed.id || entry.name.replace(/\.json$/u, ""));
          }
        } catch {
          corruptJournals.push(entry.name);
        }
      }
    } catch {
      // Non-fatal if journal directory cannot be enumerated
    }
  }

  let treePoliciesCount = 0;
  const treeRegistryPath = join(stateRoot, "trees.json");
  if (existsSync(treeRegistryPath)) {
    try {
      const content = await readFile(treeRegistryPath, "utf8");
      const data = JSON.parse(content) as { trees?: unknown[] } | unknown[];
      if (Array.isArray(data)) {
        treePoliciesCount = data.length;
      } else if (typeof data === "object" && data !== null && Array.isArray(data.trees)) {
        treePoliciesCount = data.trees.length;
      }
    } catch {
      // Non-fatal if unparseable
    }
  }

  const needsRepair = writerState.status === "needs-repair"
    || incompleteTransactions.length > 0
    || corruptJournals.length > 0;

  return {
    channel: lock.channel,
    generatedAt: lock.generatedAt,
    writerStatus: writerState.status,
    needsRepair,
    incompleteTransactions,
    corruptJournals,
    treePoliciesCount,
    managedStatePresent: existsSync(stateRoot),
  };
}
