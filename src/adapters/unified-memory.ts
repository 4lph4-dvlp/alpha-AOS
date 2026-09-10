// Plan 03-12 Task 1: a bounded adapter over the Memory Vault's own closed
// envelopes.
//
// This module reads and writes envelopes. It forms no judgement about what the
// memory CONTENT means — the handoff canary in `src/core/canary.ts` decides what
// a run proved. Keeping the two apart is what stops a parser from quietly
// becoming a verdict.
//
// Two rules are structural rather than advisory:
//
//   1. Every command travels the bounded, shell-free process adapter with a
//      DECLARED environment. There is no direct child-process call in this file
//      and a named test asserts that, because one exception is all it takes for
//      the process boundary Phase 1 built to stop being a boundary.
//   2. A handoff BODY is never a command argument. An argument list is the one
//      place a value reliably ends up in a process listing and in a shell
//      history, and a handoff body is user content (T-03-111). The vault CLI's
//      own `--stdin` input path is first-class, so there is no reason to reach
//      for the unsafe one.
//
// The schema identifier of every envelope is validated BEFORE any field is read.
// An upstream version bump then arrives as a loud refusal naming what was
// expected and what was observed, instead of silently yielding `undefined` where
// a memory count should be (T-03-113).

import { createRedactedExcerpt, createRedactionContext } from "../core/redaction.js";
import {
  commandProbeEnvironment,
  resolveCommand,
  runProcess,
} from "../core/process.js";
import { resolveDirectLaunch } from "./capability-oracle.js";

/** The Memory Vault runtime's own CLI. Named once. */
export const MEMORY_COMMAND = "ecc";

/**
 * The exact `schemaVersion` string each command is known to emit.
 *
 * Transcribed from live probes (03-RESEARCH.md Pattern 5, re-measured on this
 * host during plan 03-12). These are the identifiers this build knows how to
 * read — not a guess at a family, and not a prefix match: `ecc.memory.doctor.v2`
 * is a different contract and must be refused rather than read hopefully.
 */
export const MEMORY_ENVELOPES = Object.freeze({
  doctor: "ecc.memory.doctor.v1",
  write: "ecc.memory.write.v1",
  search: "ecc.memory.search.v1",
} as const);

export type MemoryEnvelopeKind = keyof typeof MEMORY_ENVELOPES;

/** Stable codes. A caller branches on these rather than on a sentence. */
export type MemoryUnsupportedCode = "COMMAND_ABSENT" | "COMMAND_UNINTERPRETABLE";
export type MemoryUnparsedCode =
  | "COMMAND_FAILED"
  | "ENVELOPE_NOT_JSON"
  | "ENVELOPE_SCHEMA_MISMATCH"
  | "ENVELOPE_FIELD_MISSING";

/**
 * What one command established.
 *
 * `unsupported` and `unparsed` are deliberately different states, and the
 * difference is the one the discovery oracles already keep: the absence of a
 * tool is not the absence of a capability. A host without the vault CLI has told
 * us nothing about handoffs; a host whose vault CLI answered in a shape this
 * build cannot read has told us something quite specific.
 */
export type MemoryRefusal =
  | { readonly state: "unsupported"; readonly code: MemoryUnsupportedCode; readonly reason: string }
  | {
      readonly state: "unparsed";
      readonly code: MemoryUnparsedCode;
      readonly reason: string;
      /** Fingerprints, never bytes: an envelope may quote user content back. */
      readonly stdoutFingerprint: string;
      readonly stderrFingerprint: string;
    };

export type MemoryResult<T> =
  | { readonly state: "ok"; readonly schemaVersion: string; readonly value: T }
  | MemoryRefusal;

/**
 * One memory, as the vault describes it, with the fields this repository reads
 * and NOTHING else.
 *
 * The search envelope also carries an `excerpt` of the body. It is dropped here
 * on purpose: a body is user content, and a field that never enters the record
 * cannot leak out of one (the shape-as-mitigation discipline plan 03-05
 * established for `BlockedReason`).
 */
export interface MemoryEntry {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly scope: string;
  readonly sourceHarness: string | null;
  readonly targetHarnesses: readonly string[];
}

export interface MemoryDoctorFacts {
  readonly ok: boolean;
  readonly memoryCount: number;
  readonly invalidFileCount: number;
}

export interface MemoryWriteFacts {
  readonly memory: MemoryEntry;
  /** The vault's own scope-qualified path, e.g. `project:handoffs/<id>.md`. */
  readonly path: string;
}

export interface MemorySearchFacts {
  readonly results: readonly MemoryEntry[];
}

/** One command, as it will be launched. `stdin` is the non-argument input path. */
export interface MemoryCommand {
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly cwd: string;
}

export interface MemoryCommandResult {
  readonly ran: boolean;
  /** Why it did not run, or did not run cleanly. Null when it did. */
  readonly reason: string | null;
  /** True only when the CLI itself could not be resolved or launched. */
  readonly unsupported: MemoryUnsupportedCode | null;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type MemoryRunner = (command: MemoryCommand) => Promise<MemoryCommandResult>;

export interface MemoryCallOptions {
  readonly cwd: string;
  readonly runner?: MemoryRunner;
}

export interface MemoryHandoffOptions extends MemoryCallOptions {
  readonly source: string;
  readonly target: string;
  readonly title: string;
  /** Passed through `--stdin`. Never an argument. */
  readonly body: string;
  readonly kind?: string;
}

export interface MemorySearchOptions extends MemoryCallOptions {
  readonly targetHarness?: string | null;
  readonly limit?: number;
}

/** How long one vault command may take. It is a local file scan, not a network call. */
export const MEMORY_TIMEOUT_MS = 60_000;

/**
 * How many bytes of an answer may be READ.
 *
 * Larger than the diagnostic default for the reason `READINESS_EXCERPT_BYTES`
 * records: a search envelope grows with the vault, and a truncated envelope
 * parses as a failure rather than as an answer (03-RESEARCH.md, and the
 * `ProcessSpec.excerptBytes` note that a 4 KiB default silently turns a real
 * invocation into `unparsed`).
 */
export const MEMORY_EXCERPT_BYTES = 512 * 1024;

function fingerprint(raw: string): string {
  return createRedactedExcerpt(raw, createRedactionContext(), 0).sha256;
}

/**
 * The real runner: the launch goes through the bounded process adapter, so the
 * vault is not the one command in this repository that escapes it.
 */
export function createMemoryRunner(): MemoryRunner {
  return async (command: MemoryCommand): Promise<MemoryCommandResult> => {
    const resolved = resolveCommand(MEMORY_COMMAND);
    if (resolved === null) {
      return {
        ran: false,
        reason: `${MEMORY_COMMAND} did not resolve on PATH, so no memory-vault fact could be established here`,
        unsupported: "COMMAND_ABSENT",
        exitCode: null,
        stdout: "",
        stderr: "",
      };
    }
    const launch = resolveDirectLaunch(resolved);
    if (launch === null) {
      return {
        ran: false,
        reason:
          `${MEMORY_COMMAND} resolved to an interpreted shim with no proven direct equivalent, and alpha-AOS does not ` +
          "shell out",
        unsupported: "COMMAND_UNINTERPRETABLE",
        exitCode: null,
        stdout: "",
        stderr: "",
      };
    }

    const result = await runProcess({
      executable: launch.executable,
      args: [...launch.argsPrefix, ...command.args],
      cwd: command.cwd,
      timeoutMs: MEMORY_TIMEOUT_MS,
      excerptBytes: MEMORY_EXCERPT_BYTES,
      environment: commandProbeEnvironment(),
      ...(command.stdin === null ? {} : { stdin: command.stdin }),
    });

    if (result.code !== "ok") {
      return {
        ran: false,
        reason: `the vault command did not complete cleanly (${result.code}, exit ${String(result.exitCode)})`,
        unsupported: null,
        exitCode: result.exitCode,
        stdout: result.stdout.excerpt,
        stderr: result.stderr.excerpt,
      };
    }
    if (result.stdout.capped) {
      return {
        ran: false,
        reason: `the vault answer exceeded the ${MEMORY_EXCERPT_BYTES}-byte read budget and was cut mid-token`,
        unsupported: null,
        exitCode: result.exitCode,
        stdout: "",
        stderr: result.stderr.excerpt,
      };
    }
    return {
      ran: true,
      reason: null,
      unsupported: null,
      exitCode: result.exitCode,
      stdout: result.stdout.excerpt,
      stderr: result.stderr.excerpt,
    };
  };
}

function unparsed(code: MemoryUnparsedCode, reason: string, stdout: string, stderr: string): MemoryRefusal {
  return {
    state: "unparsed",
    code,
    reason,
    stdoutFingerprint: fingerprint(stdout),
    stderrFingerprint: fingerprint(stderr),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runs one command and hands back a validated envelope, or the reason there is
 * none.
 *
 * The schema identifier is checked BEFORE any other field is touched. That
 * ordering is the whole mitigation for T-03-113: read a field first and an
 * upstream rename yields `undefined`, which arithmetic happily turns into a
 * confident wrong answer.
 */
async function envelope(
  kind: MemoryEnvelopeKind,
  command: MemoryCommand,
  runner: MemoryRunner,
): Promise<{ readonly state: "ok"; readonly document: Record<string, unknown> } | MemoryRefusal> {
  const result = await runner(command);

  if (result.unsupported !== null) {
    return {
      state: "unsupported",
      code: result.unsupported,
      reason: result.reason ?? `the ${MEMORY_COMMAND} command could not be launched`,
    };
  }
  if (!result.ran) {
    return unparsed(
      "COMMAND_FAILED",
      `\`${MEMORY_COMMAND} ${command.args.slice(0, 2).join(" ")}\` did not produce a readable answer: ` +
        `${result.reason ?? "no reason was recorded"}`,
      result.stdout,
      result.stderr,
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(result.stdout);
  } catch (error) {
    return unparsed(
      "ENVELOPE_NOT_JSON",
      `\`${MEMORY_COMMAND} ${command.args.slice(0, 2).join(" ")} --json\` did not answer with JSON ` +
        `(${error instanceof Error ? error.name : "parse failure"})`,
      result.stdout,
      result.stderr,
    );
  }
  if (!isRecord(document)) {
    return unparsed(
      "ENVELOPE_NOT_JSON",
      `the ${kind} envelope was valid JSON but not an object, so it carries no schema identifier to check`,
      result.stdout,
      result.stderr,
    );
  }

  const expected = MEMORY_ENVELOPES[kind];
  const observed = document["schemaVersion"];
  if (observed !== expected) {
    return unparsed(
      "ENVELOPE_SCHEMA_MISMATCH",
      `the ${kind} envelope declares a contract this build does not know: expected ${expected}, observed ` +
        `${typeof observed === "string" ? observed : `no schemaVersion (${typeof observed})`}. ` +
        "Reading its fields anyway would turn an upstream version change into a confident wrong answer.",
      result.stdout,
      result.stderr,
    );
  }

  return { state: "ok", document };
}

function readEntry(value: unknown): MemoryEntry | null {
  if (!isRecord(value)) return null;
  const id = value["id"];
  const title = value["title"];
  const kind = value["kind"];
  const scope = value["scope"];
  const source = value["sourceHarness"];
  const targets = value["targetHarnesses"];
  if (typeof id !== "string" || typeof title !== "string" || typeof kind !== "string" || typeof scope !== "string") {
    return null;
  }
  // Field-selective by construction: the four names above plus these two are
  // read, and the parsed object is never retained. A future envelope field
  // carrying a body — or a credential — therefore cannot ride along.
  return {
    id,
    title,
    kind,
    scope,
    sourceHarness: typeof source === "string" ? source : null,
    targetHarnesses: Array.isArray(targets) ? targets.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

/** The vault's own health answer: is it readable, and how many memories are in it. */
export async function memoryDoctor(options: MemoryCallOptions): Promise<MemoryResult<MemoryDoctorFacts>> {
  const command: MemoryCommand = { args: ["memory", "doctor", "--json"], stdin: null, cwd: options.cwd };
  const read = await envelope("doctor", command, options.runner ?? createMemoryRunner());
  if (read.state !== "ok") return read;

  const ok = read.document["ok"];
  const memoryCount = read.document["memoryCount"];
  const invalidFileCount = read.document["invalidFileCount"];
  if (typeof ok !== "boolean" || typeof memoryCount !== "number") {
    return unparsed(
      "ENVELOPE_FIELD_MISSING",
      `the ${MEMORY_ENVELOPES.doctor} envelope was missing its ok flag or its memoryCount, so no baseline could be taken`,
      "",
      "",
    );
  }
  return {
    state: "ok",
    schemaVersion: MEMORY_ENVELOPES.doctor,
    value: {
      ok,
      memoryCount,
      invalidFileCount: typeof invalidFileCount === "number" ? invalidFileCount : 0,
    },
  };
}

/**
 * Writes one handoff, attributed to a source harness and addressed to a target.
 *
 * The BODY goes through `--stdin`. It is never an argument, and a named test
 * asserts a sentinel placed in it does not appear in the recorded argument
 * vector — because that is the one place a value reliably survives into a
 * process listing and a shell history (T-03-111).
 */
export async function memoryHandoff(options: MemoryHandoffOptions): Promise<MemoryResult<MemoryWriteFacts>> {
  const command: MemoryCommand = {
    args: [
      "memory",
      "handoff",
      "--from",
      options.source,
      "--target",
      options.target,
      "--title",
      options.title,
      "--kind",
      options.kind ?? "handoff",
      "--stdin",
      "--json",
    ],
    stdin: options.body,
    cwd: options.cwd,
  };
  const read = await envelope("write", command, options.runner ?? createMemoryRunner());
  if (read.state !== "ok") return read;

  const memory = readEntry(read.document["memory"]);
  const path = read.document["path"];
  if (memory === null || typeof path !== "string") {
    return unparsed(
      "ENVELOPE_FIELD_MISSING",
      `the ${MEMORY_ENVELOPES.write} envelope did not carry a readable memory record and path, so nothing proves a ` +
        "handoff was actually written",
      "",
      "",
    );
  }
  return { state: "ok", schemaVersion: MEMORY_ENVELOPES.write, value: { memory, path } };
}

/** Recall, optionally filtered to the entries addressed to one target harness. */
export async function memorySearch(options: MemorySearchOptions): Promise<MemoryResult<MemorySearchFacts>> {
  const args = ["memory", "search", "--json"];
  if (options.targetHarness != null && options.targetHarness !== "") {
    args.push("--target-harness", options.targetHarness);
  }
  if (options.limit !== undefined) args.push("--limit", String(options.limit));

  const read = await envelope("search", { args, stdin: null, cwd: options.cwd }, options.runner ?? createMemoryRunner());
  if (read.state !== "ok") return read;

  const rows = read.document["results"];
  if (!Array.isArray(rows)) {
    return unparsed(
      "ENVELOPE_FIELD_MISSING",
      `the ${MEMORY_ENVELOPES.search} envelope carried no results array, which is a different fact from an empty vault`,
      "",
      "",
    );
  }
  const results: MemoryEntry[] = [];
  for (const row of rows) {
    // Each row wraps its memory beside a score and a body EXCERPT. Only the
    // memory is read; the excerpt is user content and has no field to land in.
    const entry = readEntry(isRecord(row) ? row["memory"] : null);
    if (entry !== null) results.push(entry);
  }
  return { state: "ok", schemaVersion: MEMORY_ENVELOPES.search, value: { results } };
}
