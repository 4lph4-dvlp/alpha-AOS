import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials } from "./validation.js";

/** Status of a deferred suggestion outside the contract (D-08). */
export type TaskSuggestionStatus = "pending" | "promoted" | "discarded";

/** A single review suggestion stored in external state (D-08, REV-05). */
export interface TaskReviewDeferredSuggestion {
  readonly id: string;
  readonly contractId: string;
  readonly requestId: string;
  readonly targetRevisionSha: string;
  readonly artifactDigest: string;
  readonly criterionId: string | null;
  readonly summary: string;
  readonly reason: string;
  readonly status: TaskSuggestionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dispositionNote?: string | null | undefined;
}

/** Structured document holding all deferred suggestions for a task contract. */
export interface TaskReviewSuggestionsDocument {
  readonly schemaVersion: 1;
  readonly contractId: string;
  readonly suggestions: readonly TaskReviewDeferredSuggestion[];
  readonly updatedAt: string;
}

export interface RecordSuggestionsOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly requestId: string;
  readonly targetRevisionSha: string;
  readonly artifactDigest: string;
  readonly suggestions: readonly {
    readonly criterionId?: string | null | undefined;
    readonly summary: string;
    readonly reason?: string | null | undefined;
  }[];
  readonly now?: (() => Date) | undefined;
}

export interface RecordSuggestionsResult {
  readonly recordedCount: number;
  readonly totalPendingCount: number;
  readonly suggestions: readonly TaskReviewDeferredSuggestion[];
  readonly filePath: string;
}

export interface ListSuggestionsOptions {
  readonly stateRoot: string;
  readonly contractId: string;
}

export type ListSuggestionsResult =
  | {
      readonly status: "ok";
      readonly count: number;
      readonly pendingCount: number;
      readonly suggestions: readonly TaskReviewDeferredSuggestion[];
      readonly filePath: string;
    }
  | {
      readonly status: "error";
      readonly count: null;
      readonly pendingCount: null;
      readonly suggestions: readonly [];
      readonly filePath: string;
      readonly error: string;
    };

export interface UpdateSuggestionOptions {
  readonly stateRoot: string;
  readonly contractId: string;
  readonly suggestionId: string;
  readonly note: string;
  readonly now?: (() => Date) | undefined;
}

export type UpdateSuggestionResult =
  | {
      readonly status: "ok";
      readonly suggestion: TaskReviewDeferredSuggestion;
      readonly filePath: string;
    }
  | {
      readonly status: "not-found" | "error";
      readonly error: string;
      readonly filePath: string;
    };

const SUGGESTION_TEXT_LIMIT = 2048;

function assertNoRawCredentials(value: unknown, context: string): void {
  const issues = rejectRawCredentials(value);
  if (issues.length > 0) {
    throw new Error(
      `Raw credentials rejected in ${context}: ${issues.map((i) => `${i.code} at ${i.documentPath}`).join("; ")}`,
    );
  }
}

function suggestionsFilePath(stateRoot: string, contractId: string): string {
  return join(stateRoot, "tasks", contractId, "suggestions.json");
}

function computeSuggestionId(contractId: string, targetRevisionSha: string, summary: string): string {
  const normalized = summary.trim().replace(/\s+/gu, " ");
  const hash = createHash("sha256")
    .update(`${contractId}:${targetRevisionSha}:${normalized}`)
    .digest("hex");
  return `sug-${hash.slice(0, 12)}`;
}

/**
 * Loads the suggestions document from the external state root.
 * Returns an error status if the file exists but fails to parse (D-08).
 */
export async function readTaskReviewSuggestions(options: ListSuggestionsOptions): Promise<ListSuggestionsResult> {
  const filePath = suggestionsFilePath(options.stateRoot, options.contractId);
  if (!existsSync(filePath)) {
    return {
      status: "ok",
      count: 0,
      pendingCount: 0,
      suggestions: [],
      filePath,
    };
  }

  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    return {
      status: "error",
      count: null,
      pendingCount: null,
      suggestions: [],
      filePath,
      error: `Could not read suggestions file: ${String(error)}`,
    };
  }

  try {
    assertNoRawCredentials(text, "readTaskReviewSuggestions");
    const parsed = JSON.parse(text) as TaskReviewSuggestionsDocument;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.suggestions)) {
      return {
        status: "error",
        count: null,
        pendingCount: null,
        suggestions: [],
        filePath,
        error: "Malformed suggestions document schema",
      };
    }
    const pendingCount = parsed.suggestions.filter((s) => s.status === "pending").length;
    return {
      status: "ok",
      count: parsed.suggestions.length,
      pendingCount,
      suggestions: parsed.suggestions,
      filePath,
    };
  } catch (error) {
    return {
      status: "error",
      count: null,
      pendingCount: null,
      suggestions: [],
      filePath,
      error: `Failed to parse suggestions document: ${String(error)}`,
    };
  }
}

/**
 * Atomically records new out-of-scope suggestions without duplicates (D-08).
 * Existing suggestions preserve their current status (pending, promoted, discarded).
 */
export async function recordReviewSuggestions(options: RecordSuggestionsOptions): Promise<RecordSuggestionsResult> {
  const { stateRoot, contractId, requestId, targetRevisionSha, artifactDigest, suggestions } = options;
  const clock = options.now ?? (() => new Date());
  const nowIso = clock().toISOString();
  const filePath = suggestionsFilePath(stateRoot, contractId);

  // Read existing suggestions if available
  const existingResult = await readTaskReviewSuggestions({ stateRoot, contractId });
  const existingMap = new Map<string, TaskReviewDeferredSuggestion>();
  if (existingResult.status === "ok") {
    for (const sug of existingResult.suggestions) {
      existingMap.set(sug.id, sug);
    }
  }

  let addedCount = 0;
  for (const item of suggestions) {
    const summary = item.summary.trim().slice(0, SUGGESTION_TEXT_LIMIT);
    if (summary.length === 0) continue;
    assertNoRawCredentials(summary, "recordReviewSuggestions summary");

    const id = computeSuggestionId(contractId, targetRevisionSha, summary);
    if (!existingMap.has(id)) {
      const newSug: TaskReviewDeferredSuggestion = {
        id,
        contractId,
        requestId,
        targetRevisionSha,
        artifactDigest,
        criterionId: item.criterionId ?? null,
        summary,
        reason: item.reason ?? "Out-of-scope recommendation outside approved task contract.",
        status: "pending",
        createdAt: nowIso,
        updatedAt: nowIso,
        dispositionNote: null,
      };
      existingMap.set(id, newSug);
      addedCount += 1;
    }
  }

  const allSuggestions = Array.from(existingMap.values());
  const document: TaskReviewSuggestionsDocument = {
    schemaVersion: 1,
    contractId,
    suggestions: allSuggestions,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "recordReviewSuggestions document");

  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  const pendingCount = allSuggestions.filter((s) => s.status === "pending").length;
  return {
    recordedCount: addedCount,
    totalPendingCount: pendingCount,
    suggestions: allSuggestions,
    filePath,
  };
}

/**
 * Explicitly marks a pending suggestion as promoted to follow-up work (D-08, T-19-04).
 * Does NOT modify current contracts or GSD planning files.
 */
export async function promoteTaskReviewSuggestion(options: UpdateSuggestionOptions): Promise<UpdateSuggestionResult> {
  return updateSuggestionStatus(options, "promoted");
}

/**
 * Explicitly marks a pending suggestion as discarded (D-08, T-19-04).
 */
export async function discardTaskReviewSuggestion(options: UpdateSuggestionOptions): Promise<UpdateSuggestionResult> {
  return updateSuggestionStatus(options, "discarded");
}

async function updateSuggestionStatus(
  options: UpdateSuggestionOptions,
  nextStatus: TaskSuggestionStatus,
): Promise<UpdateSuggestionResult> {
  const { stateRoot, contractId, suggestionId, note } = options;
  const clock = options.now ?? (() => new Date());
  const nowIso = clock().toISOString();
  const filePath = suggestionsFilePath(stateRoot, contractId);

  const existingResult = await readTaskReviewSuggestions({ stateRoot, contractId });
  if (existingResult.status === "error") {
    return {
      status: "error",
      error: existingResult.error,
      filePath,
    };
  }

  const index = existingResult.suggestions.findIndex((s) => s.id === suggestionId);
  if (index === -1) {
    return {
      status: "not-found",
      error: `Suggestion '${suggestionId}' not found in contract '${contractId}'.`,
      filePath,
    };
  }

  const current = existingResult.suggestions[index]!;
  const updated: TaskReviewDeferredSuggestion = {
    ...current,
    status: nextStatus,
    updatedAt: nowIso,
    dispositionNote: note.trim().slice(0, SUGGESTION_TEXT_LIMIT),
  };

  const nextList = [...existingResult.suggestions];
  nextList[index] = updated;

  const document: TaskReviewSuggestionsDocument = {
    schemaVersion: 1,
    contractId,
    suggestions: nextList,
    updatedAt: nowIso,
  };

  const text = `${JSON.stringify(document, null, 2)}\n`;
  assertNoRawCredentials(text, "updateSuggestionStatus document");

  await applyFileTransaction({
    stateRoot,
    allowedRoots: [join(stateRoot, "tasks")],
    operations: [{ target: filePath, content: Buffer.from(text, "utf8") }],
  });

  return {
    status: "ok",
    suggestion: updated,
    filePath,
  };
}
