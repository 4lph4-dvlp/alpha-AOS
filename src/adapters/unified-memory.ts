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
export type MemoryResult<T> =
  | { readonly state: "ok"; readonly schemaVersion: string; readonly value: T }
  | { readonly state: "unsupported"; readonly code: MemoryUnsupportedCode; readonly reason: string }
  | {
      readonly state: "unparsed";
      readonly code: MemoryUnparsedCode;
      readonly reason: string;
      /** Fingerprints, never bytes: an envelope may quote user content back. */
      readonly stdoutFingerprint: string;
      readonly stderrFingerprint: string;
    };

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

export async function memoryDoctor(_options: MemoryCallOptions): Promise<MemoryResult<MemoryDoctorFacts>> {
  return { state: "unsupported", code: "COMMAND_ABSENT", reason: "not implemented" };
}

export async function memoryHandoff(_options: MemoryHandoffOptions): Promise<MemoryResult<MemoryWriteFacts>> {
  return { state: "unsupported", code: "COMMAND_ABSENT", reason: "not implemented" };
}

export async function memorySearch(_options: MemorySearchOptions): Promise<MemoryResult<MemorySearchFacts>> {
  return { state: "unsupported", code: "COMMAND_ABSENT", reason: "not implemented" };
}

// Referenced so the stub compiles under `noUnusedLocals` until the GREEN step
// wires it in.
void fingerprint;
