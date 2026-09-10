// The discovery oracles: what a harness says it LOADED, before any model turn.
//
// Each supported harness will name the skills it loaded and the roots it loaded
// them from, without being asked a question. Two of the three cost nothing at
// all. That is what lets the DISCOVERY axis of the capability ledger be an
// automated-suite fact rather than a paid canary (03-RESEARCH.md Pattern 2 and
// Pitfall 10).
//
// This module is an ADAPTER in the sense `src/adapters/harnesses.ts` is one:
// every harness-specific command, argument and output shape lives in the
// definition table below, and one generic driver runs whichever definition it
// is handed. A core caller never branches on a harness id.
//
// What this module deliberately CANNOT do: it cannot report that a harness
// SELECTED a skill. Listing is loading, not selection. Treating a listing as
// use would reintroduce the "configuration-file presence is success" error one
// layer up, which is the single thing PROJECT.md's validation constraint
// forbids. `DiscoveryAxis` is therefore narrower than the ledger's native-use
// union, and nothing here can widen it.

import { isAbsolute, posix, win32 } from "node:path";
import type { NativeUseState, OracleRecord } from "../core/capability-ledger.js";
import { commandProbeEnvironment, isDirectlyExecutable, resolveCommand, runProcess } from "../core/process.js";
import type { HarnessId } from "../types.js";

// ---------------------------------------------------------------------------
// The axis this module may produce
// ---------------------------------------------------------------------------

/**
 * The ONLY two native-use values a discovery oracle can produce.
 *
 * Written as its own literal union rather than derived from `NativeUseState`,
 * so the third member is not merely excluded — it is absent from this file. A
 * compile-time assignment below proves the union is still a subset of the
 * ledger's, so a caller can hand a `DiscoveryAxis` straight to a proof row
 * without a cast, while no code here can produce the selection value.
 */
export type DiscoveryAxis = "discovered" | "unverified";

/**
 * Compile-time proof that every value this module can produce is still a ledger
 * axis, so a caller needs no cast — and that the set is exactly these two.
 */
export const DISCOVERY_AXES: readonly NativeUseState[] = ["discovered", "unverified"] satisfies readonly DiscoveryAxis[];

// ---------------------------------------------------------------------------
// What an oracle returns
// ---------------------------------------------------------------------------

/**
 * Which side of the CAPA-06 line a harness itself put a skill on.
 *
 * `project` and `user` are the harness's OWN classification where it publishes
 * one (pi does). `unknown` is recorded where the harness publishes only a path
 * and the classification would be alpha-AOS's inference rather than the
 * harness's statement.
 */
export type DiscoveredScope = "project" | "user" | "unknown";

/**
 * One skill a harness said it loaded.
 *
 * Both names are recorded because the three harnesses genuinely disagree about
 * which one they advertise (03-RESEARCH.md Pitfall 2): claude names the
 * DIRECTORY, codex and pi name the frontmatter `name`. There is deliberately no
 * canonicalizer — one would pick a winner and be wrong on two of three, and the
 * directory name is what the lock's `sourceSha256` keys on, so neither the
 * directory nor the frontmatter may be rewritten to make them agree (D-07).
 */
export interface DiscoveredSkill {
  /** Exactly what the harness printed, prefix and all. */
  readonly advertisedName: string;
  /** The containing directory, read off the harness's own path. Null when it published none. */
  readonly directoryName: string | null;
  /** The absolute path the harness resolved, or null when it published none. */
  readonly path: string | null;
  /** The absolute skill root the path sits under, or null when unresolvable. */
  readonly root: string | null;
  readonly scope: DiscoveredScope;
}

/**
 * An MCP server the harness said it had REGISTERED.
 *
 * Registration, never connection. 03-RESEARCH.md Pitfall 5 measured every
 * server `pending` at claude's init event, so the design document's rule that a
 * connected server with zero tools is a failure cannot be evaluated here at
 * all. A `pending` status is therefore recorded, never treated as a fault; the
 * connection oracle is a different command.
 */
export interface DiscoveredMcpServer {
  readonly name: string;
  /** The harness's own word: `pending`, `connected`, `needs-auth`, … */
  readonly status: string;
}

/** Something worth telling the user that is not itself a skill or a failure. */
export interface OracleFinding {
  /** Stable UPPER_SNAKE code. Callers branch on this, never on the sentence. */
  readonly code: string;
  readonly detail: string;
}

/** What a parser produces from one oracle's output. */
export interface OracleParse {
  readonly skills: readonly DiscoveredSkill[];
  /** Every skill root the harness resolved, absolute, in the order printed. */
  readonly roots: readonly string[];
  readonly mcpServers: readonly DiscoveredMcpServer[];
  readonly findings: readonly OracleFinding[];
}

/** What a parser is told about the run that produced the output. */
export interface OracleParseContext {
  /** The working directory the oracle ran in — the D-14 positive/negative switch. */
  readonly cwd: string;
}

/**
 * Thrown by a parser that cannot make sense of its input.
 *
 * The driver turns this into `unparsedReason`, never into an empty skill list.
 * That distinction is the whole of 03-RESEARCH.md assumption A2: an empty list
 * has the same shape as "the harness genuinely loaded nothing", and the two
 * facts call for opposite next actions.
 */
export class OracleParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OracleParseError";
  }
}

/**
 * One harness's oracle: what to run, what to feed it, what it costs, and how to
 * read what comes back.
 *
 * Mirrors the shape of the probe table in `src/adapters/harnesses.ts`, for the
 * same reason: harness-specific knowledge belongs in a table an adapter owns.
 */
export interface OracleDefinition {
  /** Candidate command names in resolution order, as `src/adapters/isolation.ts` does it. */
  readonly command: readonly string[];
  readonly args: readonly string[];
  /** Written to the child's stdin and then closed. Null for an oracle that reads none. */
  readonly stdin: string | null;
  /**
   * Whether running this oracle spends a model turn.
   *
   * Recorded per definition rather than assumed, because it is the property
   * that decides whether the oracle may run on every CI leg. Two of three are
   * free; claude is not, and an empty prompt exits non-zero BEFORE the init
   * event is emitted, so the placeholder prompt is not optional.
   */
  readonly costsModelTurn: boolean;
  /**
   * A second argument vector that withholds project trust, where the harness
   * has one. Null where it has none.
   *
   * pi gates project resources behind a trust decision (03-RESEARCH.md Pitfall
   * 4), which makes "the same directory with trust withheld" a second, arguably
   * stronger negative control than a different directory. It is an ADDITIONAL
   * negative, never a replacement.
   */
  readonly trustWithheldArgs: readonly string[] | null;
  readonly parse: (stdout: string, context: OracleParseContext) => OracleParse;
}

/** What one oracle run reports. */
export interface DiscoveryResult {
  readonly harness: HarnessId;
  /** The directory the oracle ran in. The only positive/negative switch. */
  readonly cwd: string;
  readonly exitCode: number | null;
  /**
   * The skills the harness said it loaded, or NULL when nothing was parsed.
   *
   * Null and `[]` are different facts and are kept different on purpose: `[]`
   * means the harness answered and listed nothing, null means no answer was
   * read at all. See `unparsedReason`.
   */
  readonly skills: readonly DiscoveredSkill[] | null;
  readonly roots: readonly string[];
  readonly mcpServers: readonly DiscoveredMcpServer[];
  readonly findings: readonly OracleFinding[];
  readonly nativeUse: DiscoveryAxis;
  /** Why no oracle could run at all. Null when one did. */
  readonly unsupportedReason: string | null;
  /** Why the output could not be read. Null when it was read. */
  readonly unparsedReason: string | null;
  /** What ran and what came back, as fingerprints. Null when nothing ran. */
  readonly oracle: OracleRecord | null;
  readonly costsModelTurn: boolean;
}

// ---------------------------------------------------------------------------
// The per-harness definitions
// ---------------------------------------------------------------------------

/** The single line pi's RPC mode is fed to make it list its commands. */
export const PI_GET_COMMANDS_REQUEST = '{"id":"1","type":"get_commands"}\n';

/**
 * The prompt handed to an oracle that insists on one.
 *
 * codex renders it into the prompt it would have sent and never calls a model;
 * claude does call one, which is why `costsModelTurn` is true there and why an
 * empty prompt is not an option: claude exits non-zero before emitting the init
 * event this oracle reads.
 */
export const ORACLE_PLACEHOLDER_PROMPT = "placeholder";

/**
 * The oracle for each harness, or an explicit null where there is none.
 *
 * A null is the RECORDED absence, not an oversight. antigravity has no
 * non-interactive entrypoint on any host probed (03-RESEARCH.md Open Question
 * 1), and hermes is a worker rather than a project-pack target in this phase's
 * scope. `runDiscoveryOracle` reports `unsupported` naming which of the two it
 * is, and never simulates a result for either.
 */
export const ORACLE_DEFINITIONS: Readonly<Record<HarnessId, OracleDefinition | null>> = {
  claude: {
    command: ["claude"],
    args: ["-p", ORACLE_PLACEHOLDER_PROMPT, "--output-format", "stream-json", "--verbose"],
    stdin: null,
    costsModelTurn: true,
    trustWithheldArgs: null,
    parse: (stdout, context) => parseClaudeInitEvent(stdout, context),
  },
  codex: {
    // `codex debug prompt-input` takes no directory flag and reads the process
    // working directory, so the cwd of the launch IS the whole experiment.
    command: ["codex"],
    args: ["debug", "prompt-input", ORACLE_PLACEHOLDER_PROMPT],
    stdin: null,
    costsModelTurn: false,
    trustWithheldArgs: null,
    parse: (stdout, context) => parseCodexPromptInput(stdout, context),
  },
  antigravity: null,
  pi: {
    command: ["pi"],
    args: ["--mode", "rpc", "--approve", "--no-session"],
    stdin: PI_GET_COMMANDS_REQUEST,
    costsModelTurn: false,
    trustWithheldArgs: ["--mode", "rpc", "--no-approve", "--no-session"],
    parse: (stdout, context) => parsePiCommands(stdout, context),
  },
  hermes: null,
};

/** Why a harness has no oracle, said in the words a user needs. */
const NO_ORACLE_REASON: Readonly<Partial<Record<HarnessId, string>>> = {
  antigravity:
    "antigravity has no non-interactive entrypoint on any host probed, so no discovery oracle exists to run; " +
    "this is a recorded absence, not a failed run",
  hermes:
    "hermes is a worker rather than a project-pack delivery target in this phase, so no discovery oracle is defined for it",
};

// ---------------------------------------------------------------------------
// The bounded driver
// ---------------------------------------------------------------------------

/** The oracle deadline. Generous: a cold harness start is slow, not stuck. */
export const ORACLE_TIMEOUT_MS = 120_000;

/**
 * How many bytes of oracle output the driver may READ.
 *
 * A discovery oracle's answer is large by nature — codex renders an entire
 * developer message and the skills block alone measured about 11 KiB on this
 * host — so the default excerpt budget, which is sized for a diagnostic a human
 * reads, would truncate every real answer into an unparsed one. This budget is
 * for the transient parse only: what reaches the ledger is `OracleRecord`,
 * which carries fingerprints and no output at all (T-03-32).
 */
export const ORACLE_EXCERPT_BYTES = 512 * 1024;

export interface RunDiscoveryOracleOptions {
  readonly harness: HarnessId;
  /** The directory to run in. This is the positive/negative switch, and nothing else is. */
  readonly cwd: string;
  readonly timeoutMs?: number;
  /** Use the trust-withheld argument vector instead of the ordinary one. */
  readonly trustWithheld?: boolean;
  /**
   * Runs this definition instead of the one in the table.
   *
   * The suite is the caller. No host can be relied upon to LACK a harness, so
   * proving that an unresolvable executable is REPORTED rather than thrown
   * needs a definition naming a command that cannot exist. Supplying one
   * changes nothing else about the run — the same resolution, the same bounded
   * launch, the same three outcomes.
   */
  readonly definition?: OracleDefinition;
}

function unsupported(harness: HarnessId, cwd: string, reason: string, costsModelTurn: boolean): DiscoveryResult {
  return {
    harness,
    cwd,
    exitCode: null,
    skills: null,
    roots: [],
    mcpServers: [],
    findings: [],
    nativeUse: "unverified",
    unsupportedReason: reason,
    unparsedReason: null,
    oracle: null,
    costsModelTurn,
  };
}

/**
 * Runs one harness's discovery oracle in one directory and reports what it said.
 *
 * Every launch goes through `runProcess`: shell-free, deadline-bound,
 * output-capped, with a declared environment, and with the descendant
 * termination Phase 1 proved on three platforms. No child-process API is called
 * from this module, which is what stops an oracle from becoming the one probe
 * that escapes the process boundary (T-03-33).
 *
 * `commandProbeEnvironment` pins the names that decide where a tool writes to a
 * managed probe root, so a harness that insists on bootstrapping state during a
 * read-only listing does it somewhere alpha-AOS chose rather than in the user's
 * home (T-03-34, the repair plan 01-21 established).
 *
 * Three outcomes, and they are three, not two:
 *
 * - `unsupported` — no oracle exists, or its executable could not be resolved.
 * - `unparsed` — an oracle ran and its output could not be read. The skill list
 *   is NULL and the stderr fingerprint is recorded. This is 03-RESEARCH.md
 *   assumption A2's rule: the codex subcommand lives under a debug namespace
 *   and may be renamed, and a rename must read as "this tool no longer
 *   understands the answer", never as "the skill is not there".
 * - a parsed answer, which may legitimately list nothing.
 */
export async function runDiscoveryOracle(options: RunDiscoveryOracleOptions): Promise<DiscoveryResult> {
  const { harness, cwd } = options;
  const definition = options.definition ?? ORACLE_DEFINITIONS[harness];

  if (definition === null || definition === undefined) {
    const reason = NO_ORACLE_REASON[harness] ?? `no discovery oracle is defined for ${harness}`;
    return unsupported(harness, cwd, reason, false);
  }

  if (options.trustWithheld === true && definition.trustWithheldArgs === null) {
    return unsupported(
      harness,
      cwd,
      `${harness} has no trust-withheld argument vector, so a trust-withheld control cannot be taken on it`,
      definition.costsModelTurn,
    );
  }

  const executable = definition.command.map(resolveCommand).find((candidate) => candidate !== null) ?? null;
  if (executable === null) {
    return unsupported(
      harness,
      cwd,
      `none of the candidate commands for ${harness} (${definition.command.join(", ")}) resolved on PATH`,
      definition.costsModelTurn,
    );
  }
  if (!isDirectlyExecutable(executable)) {
    return unsupported(
      harness,
      cwd,
      `${harness} resolved to ${executable}, which would need an interpreter; alpha-AOS does not shell out`,
      definition.costsModelTurn,
    );
  }

  const args = options.trustWithheld === true && definition.trustWithheldArgs !== null
    ? definition.trustWithheldArgs
    : definition.args;

  const result = await runProcess({
    executable,
    args,
    cwd,
    timeoutMs: options.timeoutMs ?? ORACLE_TIMEOUT_MS,
    excerptBytes: ORACLE_EXCERPT_BYTES,
    environment: commandProbeEnvironment(),
    ...(definition.stdin === null ? {} : { stdin: definition.stdin }),
  });

  const record: OracleRecord = {
    command: [executable, ...args].join(" "),
    exitCode: result.exitCode,
    stdoutFingerprint: result.stdout.sha256,
    stderrFingerprint: result.stderr.sha256,
  };

  const base = {
    harness,
    cwd,
    exitCode: result.exitCode,
    unsupportedReason: null,
    oracle: record,
    costsModelTurn: definition.costsModelTurn,
  } as const;

  const unreadable = (reason: string): DiscoveryResult => ({
    ...base,
    skills: null,
    roots: [],
    mcpServers: [],
    findings: [],
    nativeUse: "unverified",
    unparsedReason: reason,
  });

  if (result.code !== "ok") {
    return unreadable(
      `the ${harness} oracle did not complete cleanly (${result.code}, exit ${String(result.exitCode)}); ` +
        `stderr fingerprint ${result.stderr.sha256}`,
    );
  }
  if (result.stdout.capped) {
    return unreadable(
      `the ${harness} oracle produced ${result.stdout.totalBytes} bytes, past the ${ORACLE_EXCERPT_BYTES}-byte read budget, ` +
        `so the answer was cut mid-token; stdout fingerprint ${result.stdout.sha256}`,
    );
  }

  let parsed: OracleParse;
  try {
    parsed = definition.parse(result.stdout.excerpt, { cwd });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return unreadable(
      `the ${harness} oracle output could not be read (${detail}); stderr fingerprint ${result.stderr.sha256}`,
    );
  }

  return {
    ...base,
    skills: parsed.skills,
    roots: parsed.roots,
    mcpServers: parsed.mcpServers,
    findings: parsed.findings,
    nativeUse: "discovered",
    unparsedReason: null,
  };
}

// ---------------------------------------------------------------------------
// The parsers
// ---------------------------------------------------------------------------

/**
 * Splits a stream into records on U+000A and nothing else.
 *
 * Deliberately a string split with no import behind it. Node's line-reader
 * module is NOT protocol-compliant for pi's RPC framing, because it also splits
 * on U+2028 and U+2029, which are perfectly valid inside a JSON string — pi's
 * own documentation says so, and a description or a skill path containing one
 * would otherwise be torn into records that individually fail to parse.
 */
export function splitJsonLines(raw: string): string[] {
  throw new OracleParseError(`splitJsonLines is not implemented yet: ${raw.length} bytes offered`);
}

/**
 * Reads the `<skills_instructions>` block out of a rendered codex prompt.
 *
 * The positional root labels are resolved to absolute paths here and never
 * escape as labels: `r0` is the project's own `.codex/skills` inside the
 * project and the user's `~/.agents/skills` outside it, measured on one host in
 * one session, so anything keyed on a label is keyed on the wrong thing.
 */
export function parseCodexPromptInput(stdout: string, context: OracleParseContext): OracleParse {
  throw new OracleParseError(
    `parseCodexPromptInput is not implemented yet: ${stdout.length} bytes from ${context.cwd}`,
  );
}

/**
 * Reads pi's `get_commands` response.
 *
 * The scope discriminator comes from the nested source-info object. pi's
 * shipped documentation describes a FLAT field instead, and reading the
 * documented one yields undefined on every entry — an undefined that would look
 * exactly like "no project-scope skill", which is the CAPA-06 answer.
 */
export function parsePiCommands(stdout: string, context: OracleParseContext): OracleParse {
  throw new OracleParseError(`parsePiCommands is not implemented yet: ${stdout.length} bytes from ${context.cwd}`);
}

/**
 * Reads the `system`/`init` event out of a claude stream.
 *
 * The init event is not the first line: hook events precede it on a host with
 * session hooks configured, so the line is found by its type and subtype rather
 * than by position.
 */
export function parseClaudeInitEvent(stdout: string, context: OracleParseContext): OracleParse {
  throw new OracleParseError(
    `parseClaudeInitEvent is not implemented yet: ${stdout.length} bytes from ${context.cwd}`,
  );
}

// ---------------------------------------------------------------------------
// Shared path helpers
// ---------------------------------------------------------------------------

/**
 * The last path segment of a harness-printed path, whichever separator it used.
 *
 * A harness prints paths in its host's own form and alpha-AOS reads them on
 * that same host, but a RECORDED output is replayed on all three platforms, so
 * both separators are always accepted.
 */
export function lastPathSegment(value: string): string | null {
  const segments = value.split(/[\\/]/u).filter((segment) => segment.length > 0);
  return segments.length === 0 ? null : (segments[segments.length - 1] ?? null);
}

/** Joins a resolved root to a relative remainder without normalizing away its form. */
export function joinDiscovered(root: string, remainder: string): string {
  const cleaned = remainder.replace(/^[\\/]+/u, "");
  if (cleaned.length === 0) return root;
  const separator = root.includes("\\") && !root.includes("/") ? win32.sep : posix.sep;
  const trimmed = root.replace(/[\\/]+$/u, "");
  return `${trimmed}${separator}${cleaned}`;
}

/** Whether a path is absolute in either platform's terms, not only this host's. */
export function isAbsoluteEitherPlatform(value: string): boolean {
  return isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value);
}
