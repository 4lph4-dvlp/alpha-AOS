import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { ExplicitCommandRoute } from "./task-intake-explicit.js";
import type { TaskExecutionStyle } from "./task-intake.js";
import { applyFileTransaction } from "./transaction.js";
import { parseManagedDocument } from "./validation.js";
import {
  acquireMutationSession,
  type MutationSession,
} from "./writer-lock.js";

const MAX_RECORD_BYTES = 32 * 1024;
const MAX_TEXT_CHARS = 8192;
const MAX_TEXT_BYTES = 16 * 1024;
const MAX_SHORT_GOAL = 512;
const MAX_SHORT_SCOPE = 1024;
const MAX_FACTS = 32;
const MAX_FACT_TEXT = 512;
const MAX_ARGUMENTS = 16;
const MAX_ARG_TEXT = 512;
const MAX_SOURCE_REFS = 16;
const MAX_SOURCE_PATH = 1024;

const PENDING_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/u;

export interface TaskBootstrapStoreErrorOptions {
  readonly code: string;
  readonly path?: string | undefined;
  readonly cause: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;
}

export class TaskBootstrapStoreError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly causeDescription: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;

  constructor(options: TaskBootstrapStoreErrorOptions) {
    super(`${options.code}: ${options.cause}`);
    this.name = "TaskBootstrapStoreError";
    this.code = options.code;
    this.path = options.path;
    this.causeDescription = options.cause;
    this.causeCategory = options.causeCategory;
    this.remediation = options.remediation;
  }
}

export interface TaskBootstrapHandoff {
  readonly schemaVersion: 1;
  readonly canonicalRoot: string;
  readonly projectId: string;
  readonly pendingId: string;
  readonly contentDigest: string;
  readonly originalRequest: {
    readonly text: string;
    readonly shortGoal?: string | undefined;
    readonly shortScope?: string | undefined;
  };
  readonly knownFacts: ReadonlyArray<{
    readonly fact: string;
    readonly source?: string | undefined;
    readonly detail?: string | undefined;
  }>;
  readonly canonicalSelectedStyle?: TaskExecutionStyle | undefined;
  readonly commandRoute?: ExplicitCommandRoute | undefined;
  readonly policyRevision: string;
  readonly nativeReference?: Record<string, unknown> | undefined;
  readonly status: "pending" | "claimed" | "linked" | "acknowledged" | "cancelled";
  readonly claim?: {
    readonly nonce?: string | undefined;
    readonly host: string;
    readonly session: string;
    readonly claimedAt: string;
  } | undefined;
  readonly link?: {
    readonly nativeRef: Record<string, unknown>;
    readonly linkedAt: string;
  } | undefined;
  readonly delivery?: {
    readonly deliveredAt: string;
    readonly receiptSha256?: string | undefined;
    readonly details?: string | undefined;
  } | undefined;
  readonly cancellation?: {
    readonly reason: string;
    readonly cancelledAt: string;
  } | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function computeHandoffContentDigest(handoff: Omit<TaskBootstrapHandoff, "contentDigest">): string {
  const content = JSON.stringify({
    schemaVersion: handoff.schemaVersion,
    canonicalRoot: handoff.canonicalRoot,
    projectId: handoff.projectId,
    pendingId: handoff.pendingId,
    originalRequest: handoff.originalRequest,
    knownFacts: handoff.knownFacts,
    canonicalSelectedStyle: handoff.canonicalSelectedStyle ?? null,
    commandRoute: handoff.commandRoute ?? null,
    policyRevision: handoff.policyRevision,
  });
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function resolveBootstrapStoragePath(
  stateRoot: string,
  projectId: string,
  pendingId: string,
): string {
  if (!PENDING_ID_REGEX.test(pendingId)) {
    throw new TaskBootstrapStoreError({
      code: "invalid-pending-id",
      cause: `Pending ID '${pendingId}' is invalid; must be 1-64 alphanumeric/dash/underscore characters.`,
      causeCategory: "invalid-id",
      remediation: "Provide a valid correlation pending ID.",
    });
  }
  return join(resolve(stateRoot), "task-intake", projectId, `${pendingId}.json`);
}

function detectSuspectedSecret(text: string): boolean {
  // Check for common tokens/secrets patterns
  const tokenRegex = /(?:ghp_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|sk-[a-zA-Z0-9]{32,}|AKIA[0-9A-Z]{16}|bearer\s+[a-zA-Z0-9_.-]{32,})/i;
  return tokenRegex.test(text);
}

export function validateTaskBootstrapHandoffLimits(handoff: TaskBootstrapHandoff): void {
  const text = handoff.originalRequest.text;
  if (text.length > MAX_TEXT_CHARS) {
    throw new TaskBootstrapStoreError({
      code: "input-too-large",
      cause: `Original request text exceeds ${MAX_TEXT_CHARS} characters limit (${text.length} chars).`,
      causeCategory: "character-budget",
      remediation: `Reduce request text below ${MAX_TEXT_CHARS} characters.`,
    });
  }

  const textBytes = Buffer.byteLength(text, "utf8");
  if (textBytes > MAX_TEXT_BYTES) {
    throw new TaskBootstrapStoreError({
      code: "input-too-large",
      cause: `Original request UTF-8 size exceeds ${MAX_TEXT_BYTES} bytes limit (${textBytes} bytes).`,
      causeCategory: "byte-budget",
      remediation: `Reduce request text size below ${MAX_TEXT_BYTES} bytes.`,
    });
  }

  if (detectSuspectedSecret(text)) {
    throw new TaskBootstrapStoreError({
      code: "credentials-detected",
      cause: "Request text contains suspected raw credential tokens or API keys.",
      causeCategory: "secret-detected",
      remediation: "Remove sensitive credentials from task requests before submission.",
    });
  }

  if (handoff.originalRequest.shortGoal && handoff.originalRequest.shortGoal.length > MAX_SHORT_GOAL) {
    throw new TaskBootstrapStoreError({
      code: "input-too-large",
      cause: `shortGoal exceeds ${MAX_SHORT_GOAL} characters limit.`,
      causeCategory: "character-budget",
      remediation: `Reduce shortGoal below ${MAX_SHORT_GOAL} characters.`,
    });
  }

  if (handoff.originalRequest.shortScope && handoff.originalRequest.shortScope.length > MAX_SHORT_SCOPE) {
    throw new TaskBootstrapStoreError({
      code: "input-too-large",
      cause: `shortScope exceeds ${MAX_SHORT_SCOPE} characters limit.`,
      causeCategory: "character-budget",
      remediation: `Reduce shortScope below ${MAX_SHORT_SCOPE} characters.`,
    });
  }

  if (handoff.knownFacts.length > MAX_FACTS) {
    throw new TaskBootstrapStoreError({
      code: "facts-count-exceeded",
      cause: `knownFacts count exceeds ${MAX_FACTS} limit (${handoff.knownFacts.length} facts).`,
      causeCategory: "count-budget",
      remediation: `Reduce number of facts to at most ${MAX_FACTS}.`,
    });
  }

  for (const item of handoff.knownFacts) {
    if (item.fact.length > MAX_FACT_TEXT) {
      throw new TaskBootstrapStoreError({
        code: "input-too-large",
        cause: `Fact text exceeds ${MAX_FACT_TEXT} characters limit.`,
        causeCategory: "character-budget",
        remediation: `Reduce fact text below ${MAX_FACT_TEXT} characters.`,
      });
    }
    if (item.detail && item.detail.length > MAX_FACT_TEXT) {
      throw new TaskBootstrapStoreError({
        code: "input-too-large",
        cause: `Fact detail exceeds ${MAX_FACT_TEXT} characters limit.`,
        causeCategory: "character-budget",
        remediation: `Reduce fact detail below ${MAX_FACT_TEXT} characters.`,
      });
    }
    if (detectSuspectedSecret(item.fact) || (item.detail && detectSuspectedSecret(item.detail))) {
      throw new TaskBootstrapStoreError({
        code: "credentials-detected",
        cause: "Fact item contains suspected raw credential tokens.",
        causeCategory: "secret-detected",
        remediation: "Remove credentials from known facts before persistence.",
      });
    }
  }

  if (handoff.commandRoute?.arguments && handoff.commandRoute.arguments.length > MAX_ARGUMENTS) {
    throw new TaskBootstrapStoreError({
      code: "arguments-count-exceeded",
      cause: `Arguments count exceeds ${MAX_ARGUMENTS} limit.`,
      causeCategory: "count-budget",
      remediation: `Provide at most ${MAX_ARGUMENTS} command arguments.`,
    });
  }

  if (handoff.commandRoute?.arguments) {
    for (const arg of handoff.commandRoute.arguments) {
      if (arg.length > MAX_ARG_TEXT) {
        throw new TaskBootstrapStoreError({
          code: "input-too-large",
          cause: `Argument exceeds ${MAX_ARG_TEXT} characters limit.`,
          causeCategory: "character-budget",
          remediation: `Shorten argument below ${MAX_ARG_TEXT} characters.`,
        });
      }
    }
  }
}

export interface PersistTaskBootstrapHandoffOptions {
  readonly stateRoot: string;
  readonly handoff: TaskBootstrapHandoff;
  readonly session?: MutationSession | undefined;
}

export async function persistTaskBootstrapHandoff(
  options: PersistTaskBootstrapHandoffOptions,
): Promise<{ readonly path: string; readonly handoff: TaskBootstrapHandoff }> {
  validateTaskBootstrapHandoffLimits(options.handoff);

  const storagePath = resolveBootstrapStoragePath(
    options.stateRoot,
    options.handoff.projectId,
    options.handoff.pendingId,
  );

  const serialized = JSON.stringify(options.handoff, null, 2);
  const totalBytes = Buffer.byteLength(serialized, "utf8");
  if (totalBytes > MAX_RECORD_BYTES) {
    throw new TaskBootstrapStoreError({
      code: "record-too-large",
      path: storagePath,
      cause: `Serialized handoff record exceeds ${MAX_RECORD_BYTES} bytes limit (${totalBytes} bytes).`,
      causeCategory: "byte-budget",
      remediation: `Reduce handoff record content below ${MAX_RECORD_BYTES} bytes.`,
    });
  }

  // Check if an existing record is already stored for this pendingId
  if (existsSync(storagePath)) {
    let existingHandoff: TaskBootstrapHandoff;
    try {
      existingHandoff = await readTaskBootstrapHandoff({
        stateRoot: options.stateRoot,
        projectId: options.handoff.projectId,
        pendingId: options.handoff.pendingId,
      });
    } catch (err) {
      throw new TaskBootstrapStoreError({
        code: "existing-record-unreadable",
        path: storagePath,
        cause: `Existing handoff record exists but could not be verified: ${err instanceof Error ? err.message : "unknown"}`,
        causeCategory: "read-failed",
        remediation: "Inspect the existing task-intake state record.",
      });
    }

    if (existingHandoff.contentDigest === options.handoff.contentDigest) {
      // Idempotent success
      return { path: storagePath, handoff: existingHandoff };
    }

    // Unequal content cannot overwrite a different request
    throw new TaskBootstrapStoreError({
      code: "pending-id-collision",
      path: storagePath,
      cause: `A handoff record already exists for pending ID '${options.handoff.pendingId}' with a different content digest.`,
      causeCategory: "duplicate-id-different-content",
      remediation: "Use a distinct correlation pending ID for different requests.",
    });
  }

  await applyFileTransaction({
    stateRoot: options.stateRoot,
    allowedRoots: [resolve(options.stateRoot)],
    operations: [
      {
        target: storagePath,
        content: serialized,
      },
    ],
    ...(options.session ? { session: options.session } : {}),
  });

  return { path: storagePath, handoff: options.handoff };
}

export interface ReadTaskBootstrapHandoffOptions {
  readonly stateRoot: string;
  readonly projectId: string;
  readonly pendingId: string;
  readonly expectedContentDigest?: string | undefined;
  readonly canonicalRoot?: string | undefined;
}

export async function readTaskBootstrapHandoff(
  options: ReadTaskBootstrapHandoffOptions,
): Promise<TaskBootstrapHandoff> {
  const storagePath = resolveBootstrapStoragePath(
    options.stateRoot,
    options.projectId,
    options.pendingId,
  );

  let fileLstat;
  try {
    fileLstat = await lstat(storagePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    throw new TaskBootstrapStoreError({
      code: "record-not-found",
      path: storagePath,
      cause: code === "ENOENT" ? `No handoff record found for pending ID '${options.pendingId}'` : "Failed to access record file",
      causeCategory: "file-access",
      remediation: "Verify the pending ID and ensure the handoff has been prepared.",
    });
  }

  if (!fileLstat.isFile()) {
    throw new TaskBootstrapStoreError({
      code: "not-a-file",
      path: storagePath,
      cause: "Handoff record path is not a regular file",
      causeCategory: "not-a-file",
      remediation: "Ensure the path points to a regular JSON file.",
    });
  }

  if (fileLstat.size > MAX_RECORD_BYTES) {
    throw new TaskBootstrapStoreError({
      code: "record-too-large",
      path: storagePath,
      cause: `Handoff record file exceeds ${MAX_RECORD_BYTES} bytes limit (${fileLstat.size} bytes).`,
      causeCategory: "byte-budget",
      remediation: "The stored record is oversized and cannot be safely loaded.",
    });
  }

  let rawBuffer: Buffer;
  try {
    rawBuffer = await readFile(storagePath);
  } catch {
    throw new TaskBootstrapStoreError({
      code: "read-failed",
      path: storagePath,
      cause: "Failed to read stored handoff record",
      causeCategory: "read-failed",
      remediation: "Ensure the file has read permissions.",
    });
  }

  let text: string;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    text = decoder.decode(rawBuffer);
  } catch {
    throw new TaskBootstrapStoreError({
      code: "invalid-utf8",
      path: storagePath,
      cause: "Stored record file contains invalid UTF-8 bytes",
      causeCategory: "utf8-decode-error",
      remediation: "Re-prepare the handoff with valid UTF-8 content.",
    });
  }

  const parseResult = parseManagedDocument({ text, format: "json" });
  if (!parseResult.ok) {
    throw new TaskBootstrapStoreError({
      code: "invalid-json",
      path: storagePath,
      cause: "Stored record file is not valid JSON",
      causeCategory: "invalid-json",
      remediation: "Re-prepare the handoff record.",
    });
  }

  const handoff = parseResult.value as TaskBootstrapHandoff;

  if (options.expectedContentDigest && handoff.contentDigest !== options.expectedContentDigest) {
    throw new TaskBootstrapStoreError({
      code: "content-digest-mismatch",
      path: storagePath,
      cause: `Stored handoff record content digest '${handoff.contentDigest}' does not match expected '${options.expectedContentDigest}'.`,
      causeCategory: "digest-mismatch",
      remediation: "Re-prepare or supply the matching content digest.",
    });
  }

  if (options.canonicalRoot && handoff.canonicalRoot !== options.canonicalRoot) {
    throw new TaskBootstrapStoreError({
      code: "root-mismatch",
      path: storagePath,
      cause: `Stored handoff canonicalRoot '${handoff.canonicalRoot}' does not match requested project root '${options.canonicalRoot}'.`,
      causeCategory: "root-mismatch",
      remediation: "Execute the task within the matching canonical project root.",
    });
  }

  return handoff;
}

export interface UpdateTaskBootstrapHandoffOptions {
  readonly stateRoot: string;
  readonly projectId: string;
  readonly pendingId: string;
  readonly expectedContentDigest?: string | undefined;
  readonly transition: (existing: TaskBootstrapHandoff) => TaskBootstrapHandoff;
  readonly session?: MutationSession | undefined;
}

export async function updateTaskBootstrapHandoff(
  options: UpdateTaskBootstrapHandoffOptions,
): Promise<{ path: string; handoff: TaskBootstrapHandoff }> {
  const storagePath = resolveBootstrapStoragePath(
    options.stateRoot,
    options.projectId,
    options.pendingId,
  );

  const existing = await readTaskBootstrapHandoff({
    stateRoot: options.stateRoot,
    projectId: options.projectId,
    pendingId: options.pendingId,
    expectedContentDigest: options.expectedContentDigest,
  });

  const updated = options.transition(existing);
  validateTaskBootstrapHandoffLimits(updated);

  const serialized = JSON.stringify(updated, null, 2);
  const totalBytes = Buffer.byteLength(serialized, "utf8");
  if (totalBytes > MAX_RECORD_BYTES) {
    throw new TaskBootstrapStoreError({
      code: "record-too-large",
      path: storagePath,
      cause: `Updated record exceeds ${MAX_RECORD_BYTES} bytes limit (${totalBytes} bytes).`,
      causeCategory: "byte-budget",
      remediation: "Reduce record contents.",
    });
  }

  await applyFileTransaction({
    stateRoot: options.stateRoot,
    allowedRoots: [resolve(options.stateRoot)],
    operations: [
      {
        target: storagePath,
        content: serialized,
      },
    ],
    ...(options.session ? { session: options.session } : {}),
  });

  return { path: storagePath, handoff: updated };
}
