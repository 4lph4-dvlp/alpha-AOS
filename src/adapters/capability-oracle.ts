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

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, posix, resolve, sep, win32 } from "node:path";
import type {
  AncestorFreedom,
  BoundInputs,
  CapabilityProof,
  EvidencePolarity,
  EvidenceUnit,
  HarnessVersion,
  LedgerHarness,
  NativeUseState,
  OracleRecord,
} from "../core/capability-ledger.js";
import { pairEvidence } from "../core/capability-ledger.js";
import { aliasPath, createPathAliases } from "../core/paths.js";
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

/** An executable that can be launched with no interpreter, plus its prefix args. */
export interface DirectLaunch {
  readonly executable: string;
  readonly argsPrefix: readonly string[];
}

/** The one shim shape with a proven direct equivalent: npm's generated `.cmd`. */
const NPM_SHIM_ENTRY = /"%dp0%\\(node_modules\\[^"]+\.(?:js|mjs|cjs))"/iu;

/**
 * Turns a resolved command into something `runProcess` may launch, or null.
 *
 * Directly executable paths pass through untouched. The one exception is npm's
 * generated Windows `.cmd` shim, which is a batch file whose entire job is to
 * run `node <script>` — the script sits beside the shim under its own
 * `node_modules`, and launching it with the running Node binary is a PROVEN
 * direct equivalent rather than a guess. This is the same reasoning
 * `resolveNodePackageCli` applies to the npm and npx shims; codex and pi are
 * both distributed this way, so without it every discovery oracle on Windows
 * reports `unsupported` and the paired run has nothing to pair.
 *
 * The extracted path is verified before it is used: it must be under the shim's
 * own directory and it must exist. Anything else returns null, and the caller
 * reports `unsupported` — a shim this function does not understand is never
 * handed to a shell.
 */
export function resolveDirectLaunch(resolvedCommand: string): DirectLaunch | null {
  if (isDirectlyExecutable(resolvedCommand)) return { executable: resolvedCommand, argsPrefix: [] };
  if (extname(resolvedCommand).toLowerCase() !== ".cmd") return null;

  let text: string;
  try {
    text = readFileSync(resolvedCommand, "utf8");
  } catch {
    return null;
  }
  const match = NPM_SHIM_ENTRY.exec(text);
  const relative = match?.[1];
  if (relative === undefined) return null;

  const directory = dirname(resolvedCommand);
  const script = resolve(directory, relative.replace(/\\/gu, sep));
  if (!isUnder(directory, script) || !existsSync(script)) return null;
  return { executable: process.execPath, argsPrefix: [script] };
}

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

  const resolved = definition.command.map(resolveCommand).find((candidate) => candidate !== null) ?? null;
  if (resolved === null) {
    return unsupported(
      harness,
      cwd,
      `none of the candidate commands for ${harness} (${definition.command.join(", ")}) resolved on PATH`,
      definition.costsModelTurn,
    );
  }
  const launch = resolveDirectLaunch(resolved);
  if (launch === null) {
    return unsupported(
      harness,
      cwd,
      `${harness} resolved to ${aliasPath(resolved, createPathAliases())}, which would need an interpreter and has no ` +
        "proven direct equivalent; alpha-AOS does not shell out",
      definition.costsModelTurn,
    );
  }

  const declared = options.trustWithheld === true && definition.trustWithheldArgs !== null
    ? definition.trustWithheldArgs
    : definition.args;
  const args = [...launch.argsPrefix, ...declared];

  const result = await runProcess({
    executable: launch.executable,
    args,
    cwd,
    timeoutMs: options.timeoutMs ?? ORACLE_TIMEOUT_MS,
    excerptBytes: ORACLE_EXCERPT_BYTES,
    environment: commandProbeEnvironment(),
    ...(definition.stdin === null ? {} : { stdin: definition.stdin }),
  });

  const record: OracleRecord = {
    // Aliased before it is recorded: this string is persisted into the ledger,
    // and the resolved executable path routinely sits under the user's home.
    command: [aliasPath(launch.executable, createPathAliases()), ...args].join(" "),
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

  // The same reader the recorded-fixture suite exercises, so a live run and a
  // replayed one cannot disagree about what is readable.
  const reading = readWithDefinition(definition, harness, result.stdout.excerpt, { cwd });
  const parsed = reading.parse;
  if (parsed === null) {
    return unreadable(`${reading.unparsedReason ?? "unstated"}; stderr fingerprint ${result.stderr.sha256}`);
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

/** A parse, or the reason there is not one. Never both, and never neither. */
export interface OracleReading {
  readonly parse: OracleParse | null;
  readonly unparsedReason: string | null;
}

/**
 * Reads one harness's oracle output, turning a refusal into a REASON.
 *
 * The single place a parser failure becomes `unparsedReason`, shared by the
 * live driver and by the recorded-fixture suite so the two cannot drift. A
 * failed read yields a null parse — never an empty skill list, which would be
 * the same shape as an answer.
 */
export function readOracleOutput(harness: HarnessId, stdout: string, context: OracleParseContext): OracleReading {
  const definition = ORACLE_DEFINITIONS[harness];
  if (definition === null) {
    return {
      parse: null,
      unparsedReason:
        NO_ORACLE_REASON[harness] ?? `no discovery oracle is defined for ${harness}, so its output cannot be read`,
    };
  }
  return readWithDefinition(definition, harness, stdout, context);
}

/** The one try/catch that turns a thrown parser refusal into a recorded reason. */
function readWithDefinition(
  definition: OracleDefinition,
  harness: HarnessId,
  stdout: string,
  context: OracleParseContext,
): OracleReading {
  try {
    return { parse: definition.parse(stdout, context), unparsedReason: null };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { parse: null, unparsedReason: `the ${harness} oracle output could not be read: ${detail}` };
  }
}

/**
 * Splits a stream into records on U+000A and nothing else.
 *
 * Deliberately a string split with no import behind it. Node's line-reader
 * module is NOT protocol-compliant for pi's RPC framing, because it also splits
 * on U+2028 and U+2029, which are perfectly valid inside a JSON string — pi's
 * own documentation says so, and a description or a skill path containing one
 * would otherwise be torn into records that individually fail to parse. A torn
 * record is not a loud failure either: two of the three fragments would be
 * unparseable and the third a truncated skill list, which reads exactly like a
 * harness that loaded nothing.
 *
 * A trailing carriage return is dropped so a stream written with CRLF endings
 * yields the same records as one written with LF.
 */
export function splitJsonLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line))
    .filter((line) => line.trim().length > 0);
}

/** Every `- \`rN\` = \`<path>\`` line, in the order printed. */
const CODEX_ROOT_LINE = /^-\s+`(r\d+)`\s*=\s*`([^`]+)`\s*$/u;

/** A skill line: name, description, then the short path in a trailing `(file: …)`. */
const CODEX_SKILL_LINE = /^-\s+(.+?):\s(.*)\(file:\s*(r\d+)\/(.+?)\)\s*$/u;

/**
 * Reads the `<skills_instructions>` block out of a rendered codex prompt.
 *
 * The positional root labels are resolved to absolute paths here and never
 * escape as labels: measured in one session on one host, `r0` is the project's
 * own `.codex/skills` inside the project and the user's shared `.agents/skills`
 * outside it. A ledger keyed on the label would call those the same root, so
 * the resolved absolute path is the only thing this returns.
 *
 * A skill's advertised name is whatever codex printed — for the four ECC
 * scientific skills that is the FRONTMATTER name, which differs from the
 * directory. Both are recorded; neither is rewritten.
 */
export function parseCodexPromptInput(stdout: string, context: OracleParseContext): OracleParse {
  let messages: unknown;
  try {
    messages = JSON.parse(stdout);
  } catch (error) {
    throw new OracleParseError(
      `the rendered prompt is not JSON (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!Array.isArray(messages)) {
    throw new OracleParseError("the rendered prompt is not the expected array of messages");
  }

  const text = messages
    .flatMap((message) => {
      const content = (message as { content?: unknown }).content;
      return Array.isArray(content) ? content : [];
    })
    .map((item) => {
      const value = (item as { text?: unknown }).text;
      return typeof value === "string" ? value : "";
    })
    .join("\n");

  const open = text.indexOf("<skills_instructions>");
  const close = text.indexOf("</skills_instructions>");
  if (open < 0 || close < 0 || close < open) {
    throw new OracleParseError("the rendered prompt carries no skills-instructions block");
  }
  const block = text.slice(open, close);

  const roots = new Map<string, string>();
  const skills: DiscoveredSkill[] = [];
  const findings: OracleFinding[] = [];

  for (const line of block.split("\n")) {
    const rootMatch = CODEX_ROOT_LINE.exec(line.trim());
    if (rootMatch !== null) {
      const [, label, path] = rootMatch;
      if (label !== undefined && path !== undefined) roots.set(label, path);
      continue;
    }
    const skillMatch = CODEX_SKILL_LINE.exec(line.trim());
    if (skillMatch === null) continue;
    const [, advertisedName, , label, remainder] = skillMatch;
    if (advertisedName === undefined || label === undefined || remainder === undefined) continue;

    const root = roots.get(label) ?? null;
    if (root === null) {
      // A skill naming a root the table never declared is a shape change, not a
      // skill: recording it as discovered would attach it to no root at all.
      findings.push({
        code: "CODEX_SKILL_ROOT_LABEL_UNDECLARED",
        detail: `the skill ${advertisedName} names root label ${label}, which the roots table does not declare`,
      });
      continue;
    }
    const path = joinDiscovered(root, remainder);
    const directory = remainder.split(/[\\/]/u).filter((segment) => segment.length > 0);
    // The trailing segment is `SKILL.md`; the one before it is the directory.
    const directoryName = directory.length >= 2 ? (directory[directory.length - 2] ?? null) : null;
    const skillRoot = directoryName === null ? root : path.slice(0, path.length - `${directoryName}`.length - "SKILL.md".length - 2);

    skills.push({
      advertisedName,
      directoryName,
      path,
      root: skillRoot.length > 0 ? skillRoot : root,
      // codex publishes no scope of its own. Deriving one from a path
      // comparison would be alpha-AOS inferring what the harness did not say.
      scope: "unknown",
    });
  }

  if (roots.size === 0) {
    throw new OracleParseError("the skills-instructions block declares no skill roots");
  }

  // codex 0.152.0 discovers a SECOND project-local root beside the shared
  // `.agents/skills`, and `PROJECT_SKILL_ROOTS` knows only the shared one. This
  // is reported and NOT acted on: adding it as a write target would widen the
  // receipt schema's reach without adding a harness and complicate removal
  // confinement. But a user whose repository already has skills there would
  // otherwise see a shadow alpha-AOS never mentions, so it is named — only when
  // a skill actually resolved under it, because an empty directory casts none.
  for (const skill of skills) {
    if (skill.root === null || !endsWithSegments(skill.root, [".codex", "skills"])) continue;
    if (!isUnder(context.cwd, skill.root)) continue;
    findings.push({
      code: ORACLE_FINDING_CODES.codexSecondProjectRoot,
      detail:
        `codex loaded ${skill.advertisedName} from ${skill.root}, a project-local root alpha-AOS does not write to; ` +
        "it is reported so the shadow is visible, and left alone so removal stays confined to one root per harness",
    });
    break;
  }

  return { skills, roots: [...roots.values()], mcpServers: [], findings };
}

/**
 * Reads pi's `get_commands` response.
 *
 * The scope discriminator comes from the nested source-info object. pi's
 * shipped `docs/rpc.md` describes a FLAT `location` field instead, and reading
 * the documented one yields undefined on every entry — an undefined that would
 * look exactly like "no project-scope skill", which is the CAPA-06 answer. The
 * nested field is read and the documented one deliberately is not.
 */
export function parsePiCommands(stdout: string, context: OracleParseContext): OracleParse {
  const lines = splitJsonLines(stdout);
  if (lines.length === 0) throw new OracleParseError("the RPC stream carried no records");

  let response: { data?: { commands?: unknown } } | null = null;
  let parsedAny = false;
  for (const line of lines) {
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      // pi interleaves extension UI requests with responses; a record this
      // parser cannot read is skipped, but a stream with no readable record at
      // all is a refusal rather than an empty answer.
      continue;
    }
    parsedAny = true;
    const typed = record as { type?: unknown; command?: unknown; data?: { commands?: unknown } };
    if (typed.type === "response" && typed.command === "get_commands") {
      response = typed;
      break;
    }
  }
  if (!parsedAny) throw new OracleParseError("no record in the RPC stream was readable JSON");
  if (response === null) throw new OracleParseError("the RPC stream carried no get_commands response");

  const commands = response.data?.commands;
  if (!Array.isArray(commands)) throw new OracleParseError("the get_commands response carried no commands array");

  const skills: DiscoveredSkill[] = [];
  for (const entry of commands) {
    const command = entry as {
      name?: unknown;
      source?: unknown;
      sourceInfo?: { path?: unknown; scope?: unknown };
    };
    if (command.source !== "skill") continue;
    const advertisedName = typeof command.name === "string" ? command.name : null;
    if (advertisedName === null) continue;

    const path = typeof command.sourceInfo?.path === "string" ? command.sourceInfo.path : null;
    const scopeValue = command.sourceInfo?.scope;
    const scope: DiscoveredScope = scopeValue === "project" || scopeValue === "user" ? scopeValue : "unknown";

    const segments = path === null ? [] : path.split(/[\\/]/u).filter((segment) => segment.length > 0);
    const directoryName = segments.length >= 2 ? (segments[segments.length - 2] ?? null) : null;
    const root =
      path !== null && directoryName !== null
        ? path.slice(0, path.length - directoryName.length - "SKILL.md".length - 2)
        : null;

    skills.push({ advertisedName, directoryName, path, root, scope });
  }

  void context;
  return {
    skills,
    roots: [...new Set(skills.map((skill) => skill.root).filter((root): root is string => root !== null))],
    mcpServers: [],
    findings: [],
  };
}

/**
 * Reads the `system`/`init` event out of a claude stream.
 *
 * The init event is not the first line: on a host with session hooks
 * configured, four hook events preceded it in the recording this parser is
 * tested against, so the line is found by its type and subtype and never by
 * position.
 *
 * claude publishes skill DIRECTORY names and no paths, which is the opposite of
 * what codex and pi publish for the same files. Both name fields are still
 * filled, because the pair itself is the finding: for a skill whose frontmatter
 * name matches its directory the two agree everywhere, and for one that does
 * not they agree only here.
 *
 * Each MCP server's status is recorded as a REGISTRATION fact. Every server is
 * legitimately `pending` at init with no tools yet present, so the rule that a
 * connected server with zero tools is a failure cannot be evaluated here at
 * all; treating `pending` as a fault would report a healthy host as broken.
 */
export function parseClaudeInitEvent(stdout: string, context: OracleParseContext): OracleParse {
  const lines = splitJsonLines(stdout);
  let init: { skills?: unknown; mcp_servers?: unknown } | null = null;
  for (const line of lines) {
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const typed = event as { type?: unknown; subtype?: unknown; skills?: unknown; mcp_servers?: unknown };
    if (typed.type === "system" && typed.subtype === "init") {
      init = typed;
      break;
    }
  }
  if (init === null) throw new OracleParseError("the stream carried no system init event");

  const advertised = Array.isArray(init.skills) ? init.skills : null;
  if (advertised === null) throw new OracleParseError("the system init event carried no skills array");

  const skills: DiscoveredSkill[] = [];
  for (const name of advertised) {
    if (typeof name !== "string") continue;
    skills.push({
      advertisedName: name,
      // What claude advertises IS the directory name; it publishes no path, so
      // this is claude's own statement rather than an alpha-AOS inference.
      directoryName: name,
      path: null,
      root: null,
      scope: "unknown",
    });
  }

  const mcpServers: DiscoveredMcpServer[] = [];
  const declared = Array.isArray(init.mcp_servers) ? init.mcp_servers : [];
  for (const entry of declared) {
    const server = entry as { name?: unknown; status?: unknown };
    if (typeof server.name !== "string") continue;
    mcpServers.push({ name: server.name, status: typeof server.status === "string" ? server.status : "unknown" });
  }

  void context;
  return { skills, roots: [], mcpServers, findings: [] };
}

// ---------------------------------------------------------------------------
// The paired run and its constructed negative control
// ---------------------------------------------------------------------------

/**
 * The project-local skill roots each harness DISCOVERS, as relative POSIX paths.
 *
 * Deliberately not `PROJECT_SKILL_ROOTS`, which is the table of roots alpha-AOS
 * WRITES to. A harness reads more than alpha-AOS writes — codex discovers
 * `.codex/skills` beside the shared `.agents/skills`, and pi and hermes both
 * read the shared root as well as their own — and the ancestor-freedom check
 * has to cover everything the harness would LOAD from, not everything
 * alpha-AOS would put there. Checking only the write targets would clear a
 * control directory whose ancestor holds a root the harness reads anyway,
 * which is the exact false negative this check exists to prevent.
 */
export const DISCOVERED_PROJECT_SKILL_ROOTS: Readonly<Record<LedgerHarness, readonly string[]>> = {
  claude: [".claude/skills"],
  codex: [".agents/skills", ".codex/skills"],
  pi: [".pi/skills", ".agents/skills"],
  hermes: [".hermes/skills", ".agents/skills"],
};

/** Stable codes for the things a paired run reports without acting on them. */
export const ORACLE_FINDING_CODES = {
  /**
   * codex discovers a SECOND project-local root beside the shared one, and
   * `PROJECT_SKILL_ROOTS` knows only the shared one. This plan deliberately
   * does not add it as a write target — one root per harness keeps removal
   * confinement simple and `.agents/skills` is the cross-harness standard — but
   * a repository that already has skills there would otherwise cast a shadow
   * alpha-AOS never mentions. Reported, never acted on.
   */
  codexSecondProjectRoot: "CODEX_SECOND_PROJECT_ROOT_SHADOW",
  /** An ancestor of the control directory holds a root the harness would load from. */
  controlAncestorHoldsSkillRoot: "CONTROL_ANCESTOR_HOLDS_PROJECT_SKILL_ROOT",
  /** The control directory saw the capability, so it is not a control for it. */
  controlDiscoveredCapability: "CONTROL_DISCOVERED_THE_CAPABILITY",
} as const;

/** Whether `candidate` is `root` or sits beneath it, in either separator form. */
function isUnder(root: string, candidate: string): boolean {
  const normalize = (value: string): string => {
    const slashed = value.replace(/[\\/]+/gu, "/").replace(/\/+$/u, "");
    return process.platform === "win32" ? slashed.toLowerCase() : slashed;
  };
  const base = normalize(root);
  const target = normalize(candidate);
  return target === base || target.startsWith(`${base}/`);
}

/** The outcome of walking a control directory's ancestry. */
export interface ControlAssertion {
  readonly freedom: AncestorFreedom;
  /** Every ancestor found holding a root the harness would load from. */
  readonly offendingAncestors: readonly string[];
}

/**
 * Walks a control directory and every ancestor up to the filesystem root, and
 * reports whether any of them holds a project skill root the harness reads.
 *
 * pi loads `.agents/skills` from the working directory AND its ancestors, and
 * stops at a git repository root — OR at the filesystem root when there is no
 * repository. D-14's control is "a temporary directory that is not a
 * repository", which is precisely the case where the walk does not stop early.
 * A `.agents/skills` anywhere on that path therefore makes the negative
 * silently false, and a negative that merely happened to pass on one host's
 * temp path is not evidence.
 *
 * The home directory is the one EXEMPT ancestor, and the exemption is recorded
 * on the entry rather than applied silently. `~/.agents/skills`,
 * `~/.claude/skills` and `~/.codex/skills` all exist on an ordinary developer
 * host, and every system temporary directory on Windows sits beneath them — so
 * a rule without this exemption reports every control directory on such a host
 * as contaminated and no CAPA-06 negative could ever be taken. Those roots are
 * the harness's OWN user roots: measured, pi classifies what it loads from them
 * as `scope: "user"`, which is the side of the line a negative control is
 * supposed to be on. A project skill root in any OTHER ancestor is still
 * disqualifying.
 *
 * The checked list is returned so the assertion is auditable rather than a bare
 * boolean, and it names the exemption where one applied. Paths are aliased
 * before they are recorded, because this list is persisted into the ledger.
 */
export function assertControlAncestorFreedom(harness: LedgerHarness, controlRoot: string): ControlAssertion {
  const relativeRoots = DISCOVERED_PROJECT_SKILL_ROOTS[harness];
  const aliases = createPathAliases();
  const home = resolve(homedir());
  const checked: string[] = [];
  const offending: string[] = [];

  let current = resolve(controlRoot);
  for (;;) {
    const alias = aliasPath(current, aliases);
    const held = relativeRoots.filter((relative) => existsSync(join(current, ...relative.split("/"))));
    if (held.length === 0) {
      checked.push(alias);
    } else if (current === home) {
      checked.push(`${alias} holds ${held.join(", ")} as the harness user root, loaded as user scope — exempt`);
    } else {
      checked.push(`${alias} holds ${held.join(", ")}`);
      for (const relative of held) offending.push(`${alias} holds ${relative}`);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return {
    freedom: { asserted: offending.length === 0, checkedAncestors: checked },
    offendingAncestors: offending,
  };
}

/** One negative half, and which kind of control produced it. */
export interface PairedNegative {
  /**
   * `different-directory` is D-14's control: the same command, one directory
   * over. `trust-withheld` is pi's second one: the SAME directory with project
   * trust refused, which is arguably the stronger negative because it changes
   * nothing except the permission the harness needs to read the pack.
   */
  readonly kind: "different-directory" | "trust-withheld";
  readonly result: DiscoveryResult;
  readonly proof: CapabilityProof | null;
}

export interface RunPairedDiscoveryOptions {
  readonly harness: LedgerHarness;
  readonly projectRoot: string;
  readonly controlRoot: string;
  readonly capability: string;
  /**
   * The skill DIRECTORY names this capability materializes.
   *
   * Directory names rather than advertised names, because the advertised name
   * differs per harness for any skill whose frontmatter disagrees with its
   * directory, and the directory is the one thing all three agree on.
   */
  readonly skillDirectories: readonly string[];
  readonly projectId: string | null;
  readonly boundInputs: BoundInputs;
  readonly harnessVersion: HarnessVersion;
  readonly timeoutMs?: number;
}

export interface PairedDiscovery {
  readonly harness: LedgerHarness;
  readonly capability: string;
  /** The evidence unit, or null when no oracle ran at all. */
  readonly unit: EvidenceUnit | null;
  /** Why no oracle ran. Null when one did. */
  readonly unsupportedReason: string | null;
  readonly positive: DiscoveryResult | null;
  readonly negatives: readonly PairedNegative[];
  readonly ancestorFreedom: AncestorFreedom;
  /** The unit's own reasons plus anything that made the control unusable. */
  readonly incompleteReasons: readonly string[];
  readonly findings: readonly OracleFinding[];
}

/** Whether a result lists every skill directory the capability materializes. */
function sawCapability(result: DiscoveryResult, skillDirectories: readonly string[]): boolean {
  if (result.skills === null || skillDirectories.length === 0) return false;
  const seen = new Set(result.skills.map((skill) => skill.directoryName));
  return skillDirectories.every((directory) => seen.has(directory));
}

function proofFor(options: {
  readonly base: RunPairedDiscoveryOptions;
  readonly result: DiscoveryResult;
  readonly polarity: EvidencePolarity;
  readonly ancestorFreedom: AncestorFreedom | null;
  readonly observedAt: string;
}): CapabilityProof | null {
  const { base, result, polarity } = options;
  if (result.oracle === null) return null;
  return {
    projectId: base.projectId,
    harness: base.harness,
    capability: base.capability,
    polarity,
    // A positive that listed the skills is `discovered`; anything else is
    // `unverified`. There is no third value this module can produce.
    nativeUse: sawCapability(result, base.skillDirectories) ? "discovered" : "unverified",
    blockedReason: null,
    boundInputs: base.boundInputs,
    harnessVersion: base.harnessVersion,
    ancestorFreedom: options.ancestorFreedom,
    observedAt: options.observedAt,
    oracle: result.oracle,
  };
}

/**
 * Runs ONE oracle definition from TWO directories and pairs the results.
 *
 * That is D-14 made literal: same command, two working directories, one
 * evidence unit. Nothing else differs between the halves — not the arguments,
 * not the environment, not the parser — so a difference in what came back is a
 * difference the directory made.
 *
 * The negative control is CONSTRUCTED before it is used. Its ancestry is walked
 * and asserted free of any root the harness would load from, and the checked
 * list rides on the negative half. If an ancestor holds one, the control is
 * unusable and the negative is NOT taken: the unit comes back INCOMPLETE naming
 * the offending ancestor, because a negative from a contaminated control is
 * worse than no negative at all — it reads as proof.
 *
 * For pi the trust-withheld run is added as a SECOND negative rather than as a
 * replacement, so a pi unit carries both the different-directory control and
 * the same-directory-without-trust one.
 */
export async function runPairedDiscovery(options: RunPairedDiscoveryOptions): Promise<PairedDiscovery> {
  const { harness, capability } = options;
  const control = assertControlAncestorFreedom(harness, options.controlRoot);
  const findings: OracleFinding[] = [];
  const extraReasons: string[] = [];

  const timeout = options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
  const positive = await runDiscoveryOracle({ harness, cwd: options.projectRoot, ...timeout });
  findings.push(...positive.findings);

  const observedAt = new Date().toISOString();
  const positiveProof = proofFor({
    base: options,
    result: positive,
    polarity: "positive",
    ancestorFreedom: null,
    observedAt,
  });

  if (positiveProof === null) {
    // No oracle ran, so there is nothing to pair. Recorded as unsupported with
    // its reason rather than reported as a capability that is not there.
    return {
      harness,
      capability,
      unit: null,
      unsupportedReason: positive.unsupportedReason ?? positive.unparsedReason,
      positive,
      negatives: [],
      ancestorFreedom: control.freedom,
      incompleteReasons: [],
      findings,
    };
  }

  if (!control.freedom.asserted) {
    for (const ancestor of control.offendingAncestors) {
      findings.push({
        code: ORACLE_FINDING_CODES.controlAncestorHoldsSkillRoot,
        detail: `${ancestor}, which ${harness} would load from, so a negative taken in the control would be false`,
      });
      extraReasons.push(
        `the control directory is unusable: ${ancestor}, so the negative was NOT taken rather than taken and believed`,
      );
    }
    const unit = pairEvidence(positiveProof, null);
    return {
      harness,
      capability,
      unit,
      unsupportedReason: null,
      positive,
      negatives: [],
      ancestorFreedom: control.freedom,
      incompleteReasons: [...unit.incompleteReasons, ...extraReasons],
      findings,
    };
  }

  const negatives: PairedNegative[] = [];

  const differentDirectory = await runDiscoveryOracle({ harness, cwd: options.controlRoot, ...timeout });
  findings.push(...differentDirectory.findings);
  negatives.push({
    kind: "different-directory",
    result: differentDirectory,
    proof: proofFor({
      base: options,
      result: differentDirectory,
      polarity: "negative",
      ancestorFreedom: control.freedom,
      observedAt,
    }),
  });

  // pi gates project resources behind a trust decision that defaults to asking,
  // so withholding trust in the SAME directory is a second, independent
  // negative: it changes only the permission, not the location.
  if (ORACLE_DEFINITIONS[harness]?.trustWithheldArgs != null) {
    const withheld = await runDiscoveryOracle({
      harness,
      cwd: options.projectRoot,
      trustWithheld: true,
      ...timeout,
    });
    findings.push(...withheld.findings);
    negatives.push({
      kind: "trust-withheld",
      result: withheld,
      proof: proofFor({
        base: options,
        result: withheld,
        polarity: "negative",
        // The trust-withheld control runs INSIDE the project, so the ancestor
        // question does not apply to it: the pack is deliberately reachable and
        // trust is what is withheld. The assertion is recorded as not applicable
        // rather than asserted true, so it cannot be mistaken for one that ran.
        ancestorFreedom: { asserted: false, checkedAncestors: [] },
        observedAt,
      }),
    });
  }

  const primary = negatives.find((negative) => negative.kind === "different-directory") ?? null;
  let primaryProof = primary?.proof ?? null;

  if (primary !== null && sawCapability(primary.result, options.skillDirectories)) {
    // The control saw the capability. That is not a negative — it is evidence
    // the capability is reachable outside the project, which falsifies the
    // claim the pair exists to make. Reporting it as a negative would let the
    // unit read COMPLETE off a control that agreed with the positive.
    findings.push({
      code: ORACLE_FINDING_CODES.controlDiscoveredCapability,
      detail: `the ${harness} control at ${aliasPath(resolve(options.controlRoot), createPathAliases())} listed ${capability}`,
    });
    extraReasons.push(
      `the control discovered ${capability} as well, so it is not a control for it and the negative was discarded`,
    );
    primaryProof = null;
  }

  const unit = pairEvidence(positiveProof, primaryProof);
  return {
    harness,
    capability,
    unit,
    unsupportedReason: null,
    positive,
    negatives,
    ancestorFreedom: control.freedom,
    incompleteReasons: [...unit.incompleteReasons, ...extraReasons],
    findings,
  };
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

/**
 * Whether a path ends with these segments, whichever separator wrote it.
 *
 * A live run reads paths in the host's own form and a recorded one is replayed
 * on all three platforms, so a trailing-substring comparison against one
 * separator would answer differently depending on where the suite runs.
 */
export function endsWithSegments(value: string, segments: readonly string[]): boolean {
  const parts = value.split(/[\\/]/u).filter((segment) => segment.length > 0);
  if (parts.length < segments.length) return false;
  const tail = parts.slice(parts.length - segments.length);
  return segments.every((segment, index) => tail[index] === segment);
}
