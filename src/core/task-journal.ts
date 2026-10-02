import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import {
  createRedactedExcerpt,
  createRedactionContext,
  redactCore,
  type RedactionContext,
} from "./redaction.js";
import { syncDirectory } from "./writer-lock.js";

export type TaskJournalEventKind =
  | "run_started"
  | "attempt_started"
  | "attempt_finished"
  | "effect_planned"
  | "effect_performing"
  | "effect_applied"
  | "effect_failed"
  | "effect_reconciled"
  | "strategy_changed"
  | "limit_exceeded"
  | "blocked"
  | "accepted"
  | "rejected"
  | "process_cancelled"
  | "prompt_answered"
  | "needs_input";

export type TaskJournalEventPayload = Record<string, unknown>;

export interface TaskJournalEvent {
  sequence: number;
  timestamp: string;
  kind: TaskJournalEventKind;
  contractDigest: string;
  attemptIndex: number;
  payload: TaskJournalEventPayload;
}

export type TaskCheckpointState =
  | "pending"
  | "running"
  | "accepted"
  | "rejected"
  | "blocked"
  | "stopped"
  | "needs-input";

export interface TaskCheckpointUsage {
  cycles: number;
  wallTimeMs: number;
  tokens: number | null;
  costUsd: number | null;
}

export interface TaskCheckpoint {
  schemaVersion: 1;
  contractDigest: string;
  contractId: string;
  revision: number;
  status: TaskCheckpointState;
  attemptIndex: number;
  lastSequence: number;
  lastVerifiedHead: string | null;
  usage: TaskCheckpointUsage;
  stopReason: string | null;
  updatedAt: string;
}

export function runDirectory(stateRoot: string, contractDigest: string): string {
  return join(stateRoot, "runs", contractDigest).replaceAll("\\", "/");
}

export function runJournalPath(stateRoot: string, contractDigest: string): string {
  return join(runDirectory(stateRoot, contractDigest), "journal.jsonl").replaceAll("\\", "/");
}

export function runCheckpointPath(stateRoot: string, contractDigest: string): string {
  return join(runDirectory(stateRoot, contractDigest), "checkpoint.json").replaceAll("\\", "/");
}

function redactJournalPayload(
  payload: TaskJournalEventPayload,
  context: RedactionContext,
): TaskJournalEventPayload {
  function walk(value: unknown, keyName?: string): unknown {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") {
      if (keyName === "stdout" || keyName === "stderr") {
        return createRedactedExcerpt(value, context, 65536);
      }
      return redactCore(value, context);
    }
    if (Array.isArray(value)) {
      return value.map((item) => walk(item, keyName));
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = walk(v, k);
      }
      return result;
    }
    return value;
  }
  return walk(payload) as TaskJournalEventPayload;
}

export async function appendJournalEvent(
  stateRoot: string,
  contractDigest: string,
  event: Omit<TaskJournalEvent, "sequence" | "timestamp">,
  redactionContext?: RedactionContext,
): Promise<TaskJournalEvent> {
  const dir = runDirectory(stateRoot, contractDigest);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const journalPath = runJournalPath(stateRoot, contractDigest);
  const context = redactionContext ?? createRedactionContext();

  const redactedPayload = redactJournalPayload(event.payload, context);

  const existingEvents = await readJournalEvents(stateRoot, contractDigest);
  const sequence = existingEvents.length > 0
    ? existingEvents[existingEvents.length - 1]!.sequence + 1
    : 1;
  const timestamp = new Date().toISOString();

  const fullEvent: TaskJournalEvent = {
    sequence,
    timestamp,
    kind: event.kind,
    contractDigest: event.contractDigest,
    attemptIndex: event.attemptIndex,
    payload: redactedPayload,
  };

  const line = `${JSON.stringify(fullEvent)}\n`;
  const handle = await open(journalPath, "a", 0o600);
  try {
    await handle.writeFile(line, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  return fullEvent;
}

export async function readJournalEvents(
  stateRoot: string,
  contractDigest: string,
): Promise<TaskJournalEvent[]> {
  const journalPath = runJournalPath(stateRoot, contractDigest);
  let content: string;
  try {
    content = await readFile(journalPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const lines = content.split(/\r?\n/u);
  const events: TaskJournalEvent[] = [];
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index]!.trim();
    if (rawLine.length === 0) continue;
    try {
      const parsed = JSON.parse(rawLine) as TaskJournalEvent;
      if (
        typeof parsed.sequence !== "number" ||
        typeof parsed.timestamp !== "string" ||
        typeof parsed.kind !== "string" ||
        typeof parsed.contractDigest !== "string" ||
        typeof parsed.attemptIndex !== "number" ||
        typeof parsed.payload !== "object" ||
        parsed.payload === null
      ) {
        throw new Error("Invalid event shape");
      }
      events.push(parsed);
    } catch (parseError) {
      throw new Error(
        `Corrupted journal entry in ${journalPath} at line ${index + 1}: ${(parseError as Error).message}`,
      );
    }
  }
  return events;
}

export async function writeCheckpoint(
  stateRoot: string,
  checkpoint: TaskCheckpoint,
): Promise<void> {
  const dir = runDirectory(stateRoot, checkpoint.contractDigest);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const target = runCheckpointPath(stateRoot, checkpoint.contractDigest);
  const temporary = join(dir, `.checkpoint.json.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(checkpoint, null, 2)}\n`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, target);
  await syncDirectory(dir);
}

export async function readCheckpoint(
  stateRoot: string,
  contractDigest: string,
): Promise<TaskCheckpoint | null> {
  const checkpointPath = runCheckpointPath(stateRoot, contractDigest);
  let content: string;
  try {
    content = await readFile(checkpointPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }

  const parsed = JSON.parse(content) as TaskCheckpoint;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported checkpoint schemaVersion: ${parsed.schemaVersion} in ${checkpointPath}`);
  }
  if (!parsed.contractDigest || typeof parsed.contractDigest !== "string") {
    throw new Error(`Invalid checkpoint contractDigest in ${checkpointPath}`);
  }
  if (!parsed.status || typeof parsed.status !== "string") {
    throw new Error(`Invalid checkpoint status in ${checkpointPath}`);
  }

  return parsed;
}
