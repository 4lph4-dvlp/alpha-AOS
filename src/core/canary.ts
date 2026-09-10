// The canary catalog: every prompt a canary run may put in front of a model,
// declared once, in ordinary text, before anything spends anything.
//
// Two rules shape this module.
//
// 1. A prompt never names the skill, the server or the tool it is meant to
//    elicit. 03-CONTEXT.md's `<specifics>` and 03-RESEARCH.md's anti-pattern
//    list both name prompt-rewording as the single easiest way to turn CAPA-01
//    and CAPA-02 into theatre. Storing the prompts in a reviewed catalog is
//    what makes a reword a visible diff; `findPromptHints` below is the
//    mechanical half — it cannot judge intent, but it catches the specific
//    reword that names the thing, and `loadCanaryCatalog` refuses one.
//
// 2. Nothing here parses a failed run to decide WHY it failed. See
//    `probeReadiness`: the blocked-versus-unverified split of 03-CONTEXT.md
//    D-12 is derived from probes that run BEFORE the canary, which is both
//    more reliable than reading a failure's output and the only way `blocked`
//    can name a variable and a next action.

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ORACLE_DEFINITIONS, resolveDirectLaunch } from "../adapters/capability-oracle.js";
import type { BlockedReason, LedgerHarness, NativeUseState } from "./capability-ledger.js";
import { ManagedDocumentError, type StrictLoadResult } from "./catalog.js";
import { commandProbeEnvironment, resolveCommand, runProcess } from "./process.js";
import { RootKeyedCache } from "./paths.js";
import {
  createMigrationPlan,
  validateManagedDocument,
  type ValidationIssue,
  type ValidationResult,
} from "./validation.js";

/** Mirrors ISSUE_CAP in validation.ts: a refusal is bounded, never a flood. */
const ISSUE_CAP = 50;

/** The single declared canary file. Named, not globbed — a glob that expands to nothing exits 0. */
export const CANARY_CATALOG_FILE = "catalog/canaries.yaml";

// Keyed by the caller-supplied root, under the same rule every process-wide
// cache in this repository follows: a memo keyed on nothing lets the first
// caller decide the schema for every later caller with a different root.
const canaryCatalogSchemas = new RootKeyedCache<Record<string, unknown>>();

// ---------------------------------------------------------------------------
// The declared shape
// ---------------------------------------------------------------------------

/** The harnesses a canary can be declared for. Mirrors the ledger's narrowed set. */
export type CanaryHarness = "claude" | "codex" | "pi" | "hermes";

/** A structural fact an expected call's arguments must satisfy. */
export interface CanaryArgumentPattern {
  readonly tool: string;
  readonly argument: string;
  /** An ECMAScript regular expression source. */
  readonly pattern: string;
  readonly why: string;
}

/**
 * One declared canary.
 *
 * `expectTools` and `forbidTools` carry the tool names, so `prompt` does not
 * have to. That separation is the whole point of this shape.
 */
export interface CanaryDeclaration {
  readonly id: string;
  readonly capability: string;
  readonly prompt: string;
  readonly expectTools: readonly string[];
  readonly expectOrdered?: boolean;
  readonly expectArgumentPatterns?: readonly CanaryArgumentPattern[];
  readonly forbidTools: readonly string[];
  /** How many distinct research servers one run may touch. A control declares 1. */
  readonly maxDistinctServers: number;
  /** Environment variable NAMES, never values. */
  readonly requiresEnvironment?: readonly string[];
  readonly requiresMcpServers?: readonly string[];
  readonly harnesses: readonly CanaryHarness[];
  readonly readOnly: true;
  readonly why?: string;
}

export interface CanaryCatalog {
  readonly schemaVersion: number;
  readonly canaries: readonly CanaryDeclaration[];
}

// ---------------------------------------------------------------------------
// Prompt hygiene
// ---------------------------------------------------------------------------

/**
 * Lowercase alphanumeric runs. Comparing TOKEN SEQUENCES rather than substrings
 * is what stops `exact` from reading as the server id `exa` while still
 * catching `deep research` for the skill id `deep-research`.
 */
function tokenize(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length > 0);
}

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[start + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/**
 * Whether a prompt names a given term.
 *
 * A term matches when its token sequence appears contiguously in the prompt's
 * token sequence, so `web_search_exa`, `web-search-exa` and `web search exa`
 * are one term, and an ordinary English word that merely contains a server id
 * as a substring is not a false positive.
 */
export function promptNamesTerm(prompt: string, term: string): boolean {
  return containsSequence(tokenize(prompt), tokenize(term));
}

/**
 * Every forbidden term a prompt names, in the order the terms were supplied.
 *
 * This is a mechanical check, not a judgement of intent: it cannot tell a
 * hinting prompt from an honest one, but it can refuse the specific reword that
 * names the thing the canary is supposed to elicit on its own.
 */
export function findPromptHints(prompt: string, forbidden: readonly string[]): readonly string[] {
  return forbidden.filter((term) => promptNamesTerm(prompt, term));
}

/**
 * The terms a canary's own declaration forbids its prompt from naming.
 *
 * Self-contained on purpose: the loader can enforce this half without reading
 * the lock, so a hinting prompt is refused before anything else happens. The
 * wider vocabulary — pinned MCP server ids and locked ECC skill ids — is
 * asserted by the suite, which already has the lock in hand.
 */
export function selfNamedTerms(canary: CanaryDeclaration): readonly string[] {
  return [
    ...canary.expectTools,
    ...canary.forbidTools,
    ...(canary.expectArgumentPatterns ?? []).map((entry) => entry.tool),
  ];
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/** Schemas are read from disk so `schemas/*.json` is the single source of truth. */
async function loadSchema(root: string, name: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(root, "schemas", name), "utf8")) as Record<string, unknown>;
}

/**
 * Deterministic order and a hard cap, mirroring `finalizeIssues` in
 * `validation.ts` — that one is module-private, and a hostile catalog must not
 * be able to flood output through this route either.
 */
function orderIssues(issues: readonly ValidationIssue[]): { issues: ValidationIssue[]; truncated: boolean } {
  const sorted = [...issues].sort(
    (left, right) =>
      left.documentPath.localeCompare(right.documentPath) ||
      left.code.localeCompare(right.code) ||
      left.expected.localeCompare(right.expected),
  );
  if (sorted.length <= ISSUE_CAP) return { issues: sorted, truncated: false };
  return { issues: sorted.slice(0, ISSUE_CAP), truncated: true };
}

/** The `ValidationResult` shape `ManagedDocumentError` reads, for a post-schema refusal. */
function invariantResult(issues: readonly ValidationIssue[]): ValidationResult<CanaryCatalog> {
  const finalized = orderIssues(issues);
  return {
    ok: false,
    kind: "canary-catalog",
    format: "yaml",
    schemaVersion: 1,
    status: "invalid",
    value: null,
    readOnlyValue: null,
    extensions: {},
    typedExtensions: {},
    issues: finalized.issues,
    issuesTruncated: finalized.truncated,
  };
}

/**
 * Domain invariants the schema cannot express.
 *
 * The offending PROMPT never enters an issue. A prompt is ordinary text rather
 * than a secret, but the rule that a scanned document's contents do not reach a
 * diagnostic is applied uniformly here rather than argued about per document.
 */
function canaryCatalogInvariants(catalog: CanaryCatalog): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  catalog.canaries.forEach((canary, index) => {
    if (seen.has(canary.id)) {
      issues.push({
        code: "canary.duplicate-id",
        documentPath: `/canaries/${index}/id`,
        expected: "a canary id declared exactly once",
        actualShape: `duplicate id (${canary.id.length} characters)`,
      });
    }
    seen.add(canary.id);

    const hints = findPromptHints(canary.prompt, selfNamedTerms(canary));
    if (hints.length > 0) {
      issues.push({
        code: "canary.prompt-names-expected-tool",
        documentPath: `/canaries/${index}/prompt`,
        expected:
          "a prompt naming none of the tools its own declaration lists; a prompt that has to hint is a finding about discovery, not a prompt to reword",
        actualShape: `names ${hints.length} declared tool name(s): ${hints.join(", ")}`,
      });
    }
  });

  return issues;
}

/**
 * Loads the declared canaries through the one managed-document route.
 *
 * A bare YAML parse would skip duplicate-key rejection, closed-world checking,
 * version routing and stable error codes — a catalog that declared one id twice,
 * or carried a field nobody reads, would become a confident answer instead of a
 * refusal. A malformed catalog must never silently yield zero canaries
 * (T-03-44), which is why every failure below throws rather than returning an
 * empty list.
 */
export async function loadCanaryCatalog(packageRoot: string): Promise<StrictLoadResult<CanaryCatalog>> {
  const schema = await canaryCatalogSchemas.load(packageRoot, async () =>
    loadSchema(packageRoot, "canary-catalog.schema.json"),
  );

  const text = await readFile(join(packageRoot, ...CANARY_CATALOG_FILE.split("/")), "utf8");
  const result = validateManagedDocument<CanaryCatalog>({
    text,
    format: "yaml",
    kind: "canary-catalog",
    schema,
  });

  if (!result.ok || result.value === null) {
    // A migratable document is readable but is never authoritative as-is.
    throw new ManagedDocumentError("Canary catalog", result, createMigrationPlan(result));
  }

  const issues = canaryCatalogInvariants(result.value);
  if (issues.length > 0) {
    const invalid = invariantResult(issues);
    throw new ManagedDocumentError("Canary catalog", invalid, createMigrationPlan(invalid));
  }

  return { value: result.value, extensions: result.extensions };
}

/** Parses a canary catalog from text a caller already holds. Used by the suite for negatives. */
export function parseCanaryCatalog(text: string, schema: Record<string, unknown>): CanaryCatalog {
  const result = validateManagedDocument<CanaryCatalog>({
    text,
    format: "yaml",
    kind: "canary-catalog",
    schema,
  });
  if (!result.ok || result.value === null) {
    throw new ManagedDocumentError("Canary catalog", result, createMigrationPlan(result));
  }
  const issues = canaryCatalogInvariants(result.value);
  if (issues.length > 0) {
    const invalid = invariantResult(issues);
    throw new ManagedDocumentError("Canary catalog", invalid, createMigrationPlan(invalid));
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// Readiness — the pre-probe that makes `blocked` actionable (03-CONTEXT.md D-12)
// ---------------------------------------------------------------------------

/**
 * Why a canary could not run, when the cause is KNOWN and actionable.
 *
 * Stable UPPER_SNAKE codes with the human wording beside them, in the shape
 * this repository already uses for typed findings. Callers branch on the key,
 * never on the sentence.
 *
 * The four causes are the four things that can be true before a model turn is
 * ever spent: a name is missing, the harness has no usable credential, a server
 * a canary needs is not answering, or the harness is not there at all.
 */
export const BLOCKED_CODES = Object.freeze({
  MISSING_CREDENTIAL: "a required environment variable is not set",
  PROVIDER_NOT_CONFIGURED: "the harness has no usable credential for the provider it would run on",
  MCP_SERVER_NOT_CONNECTED: "a required MCP server did not pass its connection check",
  MCP_SERVER_NOT_REGISTERED: "a required MCP server is not registered with the harness at all",
  HARNESS_NOT_INSTALLED: "the harness executable could not be resolved on PATH",
} as const);

export type BlockedCode = keyof typeof BLOCKED_CODES;

/** The harness's own word for a server's connection state. */
export type McpConnectionState = "connected" | "failed" | "needs-auth" | "pending" | "unknown";

/**
 * One MCP server and its state.
 *
 * The NAME and the state, and nothing else. A harness's connection listing
 * prints the full launch command line beside each server — absolute paths,
 * package specifiers, sometimes an argument carrying a credential — and none of
 * that is retained here (T-03-40).
 */
export interface McpConnection {
  readonly server: string;
  readonly state: McpConnectionState;
}

/**
 * Which provider and model a harness would ACTUALLY run on.
 *
 * 03-RESEARCH.md assumption A7 observed one harness silently falling back to a
 * free model when its configured providers were unavailable. A canary result
 * from an unnamed model is uninterpretable, and a weak model failing to select
 * a skill is a finding about the model rather than about discovery. `source`
 * records where the answer came from, so a null is interpretable too.
 */
export interface HarnessIdentity {
  readonly provider: string | null;
  readonly model: string | null;
  readonly source: string;
}

/** A probe that could not run. Never a blocked reason: absence of a probe is not a cause. */
export interface NotProbed {
  readonly probe: string;
  readonly reason: string;
}

/** What the pre-probe established, before anything was run against a model. */
export interface ReadinessReport {
  readonly harness: LedgerHarness;
  /** The canary id this report is about. */
  readonly canary: string;
  readonly ready: boolean;
  /** Ordered, and empty exactly when `ready` is true. */
  readonly blockedReasons: readonly BlockedReason[];
  readonly identity: HarnessIdentity;
  /**
   * The environment variable NAMES this probe looked up, in declared order.
   *
   * Names only, and recorded whether or not they were present. It is what makes
   * "the value is absent from this report" a claim with teeth rather than a
   * vacuous one: the name is here, and the value is not, in the same document.
   */
  readonly checkedEnvironment: readonly string[];
  readonly connections: readonly McpConnection[];
  readonly notProbed: readonly NotProbed[];
}

/** What a harness's own readiness command said, reduced to the fields alpha-AOS reads. */
export interface ProviderReadiness {
  readonly status: "ready" | "not-ready" | "unknown";
  readonly provider: string | null;
  /** The harness's own machine-readable reason, when it published one. */
  readonly reason: string | null;
}

/** One readiness command's outcome. */
export interface ReadinessCommandResult {
  readonly ran: boolean;
  /** Why it did not run. Null when it did. */
  readonly reason: string | null;
  readonly exitCode: number | null;
  readonly stdout: string;
}

/** What a probe target is: the harness's default provider, or one named model. */
export interface ReadinessTarget {
  readonly kind: "provider" | "model";
  readonly value: string;
}

/**
 * The three read-only operations `probeReadiness` needs.
 *
 * Injectable so the suite can assert every branch OFFLINE: no host can be
 * relied upon to lack a harness, to have an unconfigured provider, or to have a
 * disconnected server, and none of those may be proven by spending a turn.
 */
export interface ReadinessRunner {
  resolveHarness: (harness: LedgerHarness) => string | null;
  providerReadiness: (harness: LedgerHarness, target: ReadinessTarget) => Promise<ReadinessCommandResult>;
  connectionListing: (harness: LedgerHarness) => Promise<ReadinessCommandResult>;
}

export interface ProbeReadinessOptions {
  readonly harness: LedgerHarness;
  readonly canary: CanaryDeclaration;
  /**
   * Where variable NAMES are looked up.
   *
   * Presence only. A value is never compared, recorded, hashed or rendered —
   * `BlockedReason` has no field able to hold one.
   */
  readonly environment: Readonly<Record<string, string | undefined>>;
  /** The model the run would use, when the caller knows it. Null asks about the default provider. */
  readonly model?: string | null;
  readonly runner?: ReadinessRunner;
  /** Where the readiness commands run. A harness reads project configuration from it. */
  readonly cwd?: string;
  /**
   * Which act this is. Defaults to `canary`; passing `preview` is refused,
   * because this probe launches subprocesses and a preview may not.
   */
  readonly context?: ExecutionContext;
  /**
   * Servers a prior observation recorded as REGISTERED, with the harness's own
   * word for their state.
   *
   * 03-RESEARCH.md Pitfall 5 measured every server `pending` with zero tools at
   * one harness's init event, so a `pending` entry is a registration fact and
   * never a fault. The connection listing is the oracle, and it overrides.
   */
  readonly registeredServers?: readonly McpConnection[];
}

/** Whether a canary run may proceed, and if not, why — decided BEFORE any model turn. */
export type CanaryOutcome = "ready" | "blocked" | "unverified";

/**
 * The one place `blocked` and `unverified` are told apart.
 *
 * Exactly one branch of `disposeCanary` produces each, so a single cause can
 * never yield both. That is 03-CONTEXT.md D-12 stated as control flow rather
 * than as intent.
 */
export interface CanaryDisposition {
  readonly outcome: CanaryOutcome;
  /** Non-empty exactly when the outcome is `blocked`. */
  readonly blockedReasons: readonly BlockedReason[];
  /** Non-null exactly when the outcome is `unverified`. */
  readonly unverifiedReason: string | null;
}

// --- Parsers -------------------------------------------------------------

/**
 * Reads a harness's provider readiness answer.
 *
 * FIELD-SELECTIVE on purpose. `pi auth check` has a `--credentials` flag that
 * puts the credential itself into this JSON. alpha-AOS never passes it — see
 * `READINESS_DEFINITIONS` — but reading three named fields rather than keeping
 * the parsed object means a future field carrying a value cannot ride along
 * either. The shape is the mitigation, not a redaction pass (T-03-40).
 */
export function parsePiAuthCheck(stdout: string): ProviderReadiness | null {
  for (const line of stdout.split(/\r?\n/u)) {
    const text = line.trim();
    if (!text.startsWith("{")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    const status = record.status;
    if (typeof status !== "string") continue;
    return {
      status: status === "ready" ? "ready" : status === "not_ready" ? "not-ready" : "unknown",
      provider: typeof record.provider === "string" ? record.provider : null,
      reason: typeof record.reason === "string" ? record.reason : null,
    };
  }
  return null;
}

/**
 * The markers a connection listing uses, in the order they must be tested.
 *
 * `failed` is tested before `connected` because the failure sentence contains
 * the word the success state is named after — "Failed to connect" would match a
 * naive connected rule.
 */
const CONNECTION_MARKERS: readonly { readonly test: RegExp; readonly state: McpConnectionState }[] = [
  { test: /^[✘✗]|failed to connect|connection closed/iu, state: "failed" },
  { test: /^!|needs authentication|authentication required/iu, state: "needs-auth" },
  { test: /^[✔✓]|^connected\b/iu, state: "connected" },
];

/**
 * Reads a harness's MCP connection listing into server names and states.
 *
 * The listing prints the full launch command line beside each server —
 * absolute paths, package specifiers, and in the general case an argument
 * carrying a credential. That segment is READ to locate the state marker and
 * then dropped: nothing but the name and the state leaves this function
 * (T-03-40).
 *
 * A line this parser cannot make sense of is skipped rather than guessed at,
 * and a server it never saw is reported by the caller as unregistered — which
 * is a different, separately-actionable cause from a server that answered badly.
 */
export function parseClaudeMcpList(stdout: string): readonly McpConnection[] {
  const connections: McpConnection[] = [];
  const seen = new Set<string>();

  for (const raw of stdout.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    const cut = line.lastIndexOf(" - ");
    if (cut === -1) continue;
    const head = line.slice(0, cut);
    const tail = line.slice(cut + 3).trim();
    const colon = head.indexOf(": ");
    if (colon === -1) continue;
    const server = head.slice(0, colon).trim();
    if (server.length === 0 || seen.has(server)) continue;
    seen.add(server);
    connections.push({
      server,
      state: CONNECTION_MARKERS.find((marker) => marker.test.test(tail))?.state ?? "unknown",
    });
  }

  return connections;
}

// --- The per-harness readiness table --------------------------------------

/** The executable each harness is looked for under. */
export const HARNESS_COMMANDS: Readonly<Record<LedgerHarness, string>> = {
  claude: "claude",
  codex: "codex",
  pi: "pi",
  hermes: "hermes",
};

interface ProviderProbe {
  /** What ran, for the identity's `source`. Never an interpolated path. */
  readonly label: string;
  readonly defaultProvider: string;
  readonly args: (target: ReadinessTarget) => readonly string[];
  readonly parse: (stdout: string) => ProviderReadiness | null;
}

interface ConnectionProbe {
  readonly label: string;
  readonly args: readonly string[];
  readonly parse: (stdout: string) => readonly McpConnection[];
}

interface ReadinessDefinition {
  readonly provider: ProviderProbe | null;
  /** Why there is no provider probe. Recorded, never silent. */
  readonly providerAbsence: string | null;
  readonly connection: ConnectionProbe | null;
  readonly connectionAbsence: string | null;
}

/**
 * What each harness can be asked, for free, BEFORE a model turn.
 *
 * A null is a recorded absence, not an oversight: inventing a command that has
 * not been observed to exist would present a guess as an oracle, and the
 * failure mode of a guessed probe is a confident wrong answer rather than a
 * visible gap.
 *
 * No argument vector here carries `--credentials`, `--print-api-key` or any
 * other flag whose documented effect is to emit a secret. A source-level test
 * asserts that, because the flag exists on a command this table drives.
 */
export const READINESS_DEFINITIONS: Readonly<Record<LedgerHarness, ReadinessDefinition>> = {
  claude: {
    provider: null,
    providerAbsence:
      "claude publishes no free provider readiness command; the model a run would use is stated only in that run's own " +
      "init event, which costs a model turn",
    connection: {
      label: "claude mcp list",
      args: ["mcp", "list"],
      parse: parseClaudeMcpList,
    },
    connectionAbsence: null,
  },
  codex: {
    provider: null,
    providerAbsence: "no codex provider readiness command has been observed on any host probed",
    connection: null,
    connectionAbsence:
      "no codex connection listing has been observed on any host probed; naming one unverified would present a guess as an oracle",
  },
  pi: {
    provider: {
      label: "pi auth check --json",
      // pi's own documented default. Asking about a model instead is what makes
      // a silent free-model fallback nameable rather than anonymous (A7).
      defaultProvider: "google",
      args: (target) =>
        target.kind === "model"
          ? ["auth", "check", "--model", target.value, "--json"]
          : ["auth", "check", "--provider", target.value, "--json"],
      parse: parsePiAuthCheck,
    },
    providerAbsence: null,
    connection: null,
    connectionAbsence: "pi's MCP bridge publishes no connection listing alpha-AOS has observed",
  },
  hermes: {
    provider: null,
    providerAbsence: "hermes is a worker rather than a canary target in this phase, so no readiness command is defined for it",
    connection: null,
    connectionAbsence: "hermes is a worker rather than a canary target in this phase, so no connection listing is defined for it",
  },
};

// --- The default runner ----------------------------------------------------

/** Generous: a cold harness start plus a synchronous health check is slow, not stuck. */
export const READINESS_TIMEOUT_MS = 120_000;

/**
 * How many bytes of a readiness answer may be READ.
 *
 * Larger than the diagnostic default, which is sized for something a person
 * reads: a connection listing grows with the number of registered servers, and
 * a truncated listing would report a registered server as absent.
 */
export const READINESS_EXCERPT_BYTES = 128 * 1024;

async function runReadinessCommand(
  resolved: string,
  args: readonly string[],
  label: string,
  cwd: string,
): Promise<ReadinessCommandResult> {
  const launch = resolveDirectLaunch(resolved);
  if (launch === null) {
    return {
      ran: false,
      reason: `${label} could not be launched: the resolved executable is an interpreted shim with no proven direct equivalent, and alpha-AOS does not shell out`,
      exitCode: null,
      stdout: "",
    };
  }

  const result = await runProcess({
    executable: launch.executable,
    args: [...launch.argsPrefix, ...args],
    cwd,
    timeoutMs: READINESS_TIMEOUT_MS,
    excerptBytes: READINESS_EXCERPT_BYTES,
    environment: commandProbeEnvironment(),
  });

  if (result.code !== "ok") {
    return {
      ran: false,
      reason: `${label} did not complete cleanly (${result.code}, exit ${String(result.exitCode)})`,
      exitCode: result.exitCode,
      stdout: "",
    };
  }
  if (result.stdout.capped) {
    return {
      ran: false,
      reason: `${label} produced more than the ${READINESS_EXCERPT_BYTES}-byte read budget, so its answer was cut mid-token`,
      exitCode: result.exitCode,
      stdout: "",
    };
  }
  return { ran: true, reason: null, exitCode: result.exitCode, stdout: result.stdout.excerpt };
}

/**
 * The real runner: every launch goes through the bounded process adapter, so a
 * readiness probe is not the one call that escapes the process boundary.
 */
export function createReadinessRunner(cwd: string = process.cwd()): ReadinessRunner {
  return {
    resolveHarness: (harness) => resolveCommand(HARNESS_COMMANDS[harness]),
    providerReadiness: async (harness, target) => {
      const probe = READINESS_DEFINITIONS[harness].provider;
      const resolved = resolveCommand(HARNESS_COMMANDS[harness]);
      if (probe === null) {
        return { ran: false, reason: READINESS_DEFINITIONS[harness].providerAbsence, exitCode: null, stdout: "" };
      }
      if (resolved === null) {
        return { ran: false, reason: `${HARNESS_COMMANDS[harness]} did not resolve on PATH`, exitCode: null, stdout: "" };
      }
      return runReadinessCommand(resolved, probe.args(target), probe.label, cwd);
    },
    connectionListing: async (harness) => {
      const probe = READINESS_DEFINITIONS[harness].connection;
      const resolved = resolveCommand(HARNESS_COMMANDS[harness]);
      if (probe === null) {
        return { ran: false, reason: READINESS_DEFINITIONS[harness].connectionAbsence, exitCode: null, stdout: "" };
      }
      if (resolved === null) {
        return { ran: false, reason: `${HARNESS_COMMANDS[harness]} did not resolve on PATH`, exitCode: null, stdout: "" };
      }
      return runReadinessCommand(resolved, probe.args, probe.label, cwd);
    },
  };
}

// --- The probe -------------------------------------------------------------

/**
 * Decides whether a canary may run, and if not, WHY — entirely before any model
 * turn is spent.
 *
 * The order is the point. A canary that fails because a name is unset produces
 * the same exit code and, often, the same unhelpful output as one that failed
 * for a reason nothing can name. Parsing that output to tell the two apart is
 * guesswork; asking three free questions first is not (03-RESEARCH.md Pattern
 * 4). Every answer this returns is therefore derived from a PRE-probe:
 *
 *   1. are the declared environment NAMES present,
 *   2. is the harness there at all,
 *   3. does the harness say it has a usable credential, and which provider and
 *      model that answer is about,
 *   4. does every server the canary needs pass the harness's own connection
 *      check.
 *
 * A probe that could not run is recorded in `notProbed` and is NEVER a blocked
 * reason: the absence of a probe is not a cause, and treating it as one would
 * make `blocked` mean "something is missing somewhere", which is exactly the
 * uselessness D-12 exists to prevent.
 */
export async function probeReadiness(options: ProbeReadinessOptions): Promise<ReadinessReport> {
  const { harness, canary, environment } = options;
  // A preview launches nothing. This probe launches up to two subprocesses, so
  // the boundary is asserted before any of them, not after.
  assertCanaryContext(options.context ?? "canary", "probeReadiness");
  const cwd = options.cwd ?? process.cwd();
  const run = options.runner ?? createReadinessRunner(cwd);
  const definition = READINESS_DEFINITIONS[harness];

  const blockedReasons: BlockedReason[] = [];
  const notProbed: NotProbed[] = [];
  let identity: HarnessIdentity = {
    provider: null,
    model: null,
    source: definition.providerAbsence ?? `no readiness answer was read from ${harness}`,
  };

  // 1. Environment NAMES. Presence only: the value is never compared, recorded
  //    or rendered, and `BlockedReason` has no field able to hold one.
  for (const name of canary.requiresEnvironment ?? []) {
    const value = environment[name];
    if (value !== undefined && value.length > 0) continue;
    blockedReasons.push({
      code: "MISSING_CREDENTIAL",
      variable: name,
      nextAction:
        `Set ${name} in the environment alpha-AOS launches ${harness} with, then re-run the ${canary.id} canary. ` +
        "This probe reads only whether the name is present; it never reads, stores or compares the value.",
    });
  }

  // 2. Is the harness there at all.
  const resolved = run.resolveHarness(harness);
  if (resolved === null) {
    blockedReasons.push({
      code: "HARNESS_NOT_INSTALLED",
      variable: HARNESS_COMMANDS[harness],
      nextAction:
        `Install ${harness} so that \`${HARNESS_COMMANDS[harness]}\` resolves on PATH, then re-run the ${canary.id} canary.`,
    });
  }

  // 3. Provider readiness, and the identity the answer is about.
  if (resolved === null) {
    notProbed.push({ probe: "provider readiness", reason: `${harness} did not resolve on PATH, so it could not be asked` });
  } else if (definition.provider === null) {
    notProbed.push({ probe: "provider readiness", reason: definition.providerAbsence ?? "no provider readiness command is defined" });
  } else {
    const target: ReadinessTarget =
      options.model === undefined || options.model === null
        ? { kind: "provider", value: definition.provider.defaultProvider }
        : { kind: "model", value: options.model };
    const result = await run.providerReadiness(harness, target);
    const parsed = result.ran ? definition.provider.parse(result.stdout) : null;
    if (parsed === null) {
      notProbed.push({
        probe: "provider readiness",
        reason: result.reason ?? `${definition.provider.label} ran but its answer could not be read`,
      });
    } else {
      identity = {
        provider: parsed.provider,
        // The model the answer is ABOUT. Null when the question was about a
        // provider instead, which is itself interpretable.
        model: target.kind === "model" ? target.value : null,
        source: definition.provider.label,
      };
      if (parsed.status !== "ready") {
        const named = parsed.provider ?? target.value;
        blockedReasons.push({
          code: "PROVIDER_NOT_CONFIGURED",
          variable: named,
          nextAction:
            `Configure a credential for the ${named} provider — ${definition.provider.label} reports ` +
            `${parsed.reason ?? "it is not ready"} — then re-run the ${canary.id} canary. ` +
            "A run on an unconfigured provider is a finding about the model, not about discovery.",
        });
      }
    }
  }

  // 4. Connections. A registered-but-pending server is a registration fact and
  //    never a fault: at one harness's init event every server is legitimately
  //    pending with zero tools, so a rule evaluated there reports a false
  //    failure (03-RESEARCH.md Pitfall 5). The listing is the oracle, and where
  //    it answers it overrides the registration observation.
  const observed = new Map<string, McpConnectionState>();
  for (const entry of options.registeredServers ?? []) observed.set(entry.server, entry.state);

  if (resolved === null) {
    notProbed.push({ probe: "MCP connection listing", reason: `${harness} did not resolve on PATH, so it could not be asked` });
  } else if (definition.connection === null) {
    notProbed.push({
      probe: "MCP connection listing",
      reason: definition.connectionAbsence ?? "no connection listing command is defined",
    });
  } else {
    const result = await run.connectionListing(harness);
    if (!result.ran) {
      notProbed.push({
        probe: "MCP connection listing",
        reason: result.reason ?? `${definition.connection.label} did not run`,
      });
    } else {
      for (const entry of definition.connection.parse(result.stdout)) observed.set(entry.server, entry.state);
    }
  }

  for (const server of canary.requiresMcpServers ?? []) {
    const state = observed.get(server);
    if (state === undefined) {
      blockedReasons.push({
        code: "MCP_SERVER_NOT_REGISTERED",
        variable: server,
        nextAction:
          `Register the ${server} MCP server with ${harness} — \`alpha-aos mcp sync\` renders it — then re-run the ${canary.id} canary.`,
      });
      continue;
    }
    if (state === "failed" || state === "needs-auth") {
      blockedReasons.push({
        code: "MCP_SERVER_NOT_CONNECTED",
        variable: server,
        nextAction:
          `The ${server} MCP server is registered with ${harness} but its connection check reports ${state}. ` +
          `Resolve that — \`alpha-aos doctor\` reports what it found — then re-run the ${canary.id} canary.`,
      });
    }
  }

  return {
    harness,
    canary: canary.id,
    ready: blockedReasons.length === 0,
    blockedReasons,
    identity,
    checkedEnvironment: [...(canary.requiresEnvironment ?? [])],
    connections: [...observed].map(([server, state]) => ({ server, state })),
    notProbed,
  };
}

/**
 * The ONE place `blocked` and `unverified` are told apart.
 *
 * Three branches, mutually exclusive by construction, so one cause can never
 * produce both. A known cause wins over a trailing failure: once a probe has
 * named why a run could not work, the run's own failure adds nothing, and
 * downgrading a named cause to `unverified` would throw away the only
 * actionable thing anyone learned (03-CONTEXT.md D-12).
 */
export function disposeCanary(readiness: ReadinessReport, failure: string | null): CanaryDisposition {
  if (readiness.blockedReasons.length > 0) {
    return { outcome: "blocked", blockedReasons: readiness.blockedReasons, unverifiedReason: null };
  }
  if (failure !== null) {
    return { outcome: "unverified", blockedReasons: [], unverifiedReason: failure };
  }
  return { outcome: "ready", blockedReasons: [], unverifiedReason: null };
}

/**
 * The ledger fields a disposition maps to.
 *
 * `ready` and `unverified` both map to the `unverified` native-use axis, and
 * that is not a bug: readiness is not evidence of use, and a probe that found
 * nothing wrong has proven nothing about what the harness did. The axis moves
 * only when a run produces evidence.
 */
export function ledgerFieldsFor(disposition: CanaryDisposition): {
  readonly nativeUse: NativeUseState;
  readonly blockedReason: BlockedReason | null;
} {
  return {
    nativeUse: "unverified",
    blockedReason: disposition.outcome === "blocked" ? disposition.blockedReasons[0] ?? null : null,
  };
}

// ---------------------------------------------------------------------------
// The preview boundary — a canary is not a preview, and says so here
// ---------------------------------------------------------------------------

/**
 * Which act is under way.
 *
 * A preview launches nothing, spends nothing and persists nothing (SAFE-01,
 * and the plan 01-21 decision that a preview must not spawn a package manager).
 * A canary launches a harness, may spend a model turn, and writes a ledger
 * record. They are opposite in every one of those respects, which is why the
 * boundary is a refusal in code rather than a convention nobody wires wrong.
 */
export type ExecutionContext = "preview" | "canary";

/** Stable refusal code. Callers branch on this, never on the sentence. */
export const CANARY_IN_PREVIEW_CONTEXT = "CANARY_IN_PREVIEW_CONTEXT";

/** A canary entry point reached from a preview. Never recoverable in place. */
export class CanaryContextError extends Error {
  readonly code = CANARY_IN_PREVIEW_CONTEXT;
  readonly operation: string;

  constructor(operation: string) {
    super(
      `\`${operation}\` is a canary operation: it launches a harness, may spend a model turn, and writes a ledger ` +
        "record. A preview does none of those and persists nothing, so it is refused here rather than allowed to " +
        "spend from a dry run. Run it with `alpha-aos doctor --canary` instead.",
    );
    this.name = "CanaryContextError";
    this.operation = operation;
  }
}

/**
 * Refuses a canary operation reached from a preview context.
 *
 * The register is the one the existing verb refusals use: name what was asked
 * for, say why it is not that verb's job, and name the command that IS. The
 * source-level assertion in the suite — that the preview module does not import
 * this one — is the other half; a refusal alone can be bypassed by a caller
 * that never calls it, and an import assertion alone cannot stop a caller that
 * reaches this module by some other route.
 */
export function assertCanaryContext(context: ExecutionContext, operation: string): void {
  if (context !== "preview") return;
  throw new CanaryContextError(operation);
}

// ---------------------------------------------------------------------------
// What a run would spend
// ---------------------------------------------------------------------------

/** What one canary would cost on one harness. */
export interface CanaryCost {
  readonly harness: CanaryHarness;
  /**
   * Whether driving this harness spends a model turn, or null when the harness
   * has no oracle definition and the cost is therefore not derivable.
   *
   * READ from `ORACLE_DEFINITIONS` rather than restated in the catalog: a
   * second table recording the same fact is a second table that can drift, and
   * the cost of driving a harness is a property of the harness, not of the
   * prompt. A bare model turn in an empty fixture measured about thirteen cents
   * on this host and a full sweep about seventy, with no credential available
   * on hosted CI at all (03-RESEARCH.md Pitfall 10) — which is why a caller
   * must be able to list what a run would spend BEFORE running it.
   */
  readonly costsModelTurn: boolean | null;
}

/** What one declared canary would cost, per harness it is declared for. */
export function canaryCosts(canary: CanaryDeclaration): readonly CanaryCost[] {
  return canary.harnesses.map((harness) => ({
    harness,
    costsModelTurn: ORACLE_DEFINITIONS[harness]?.costsModelTurn ?? null,
  }));
}

/**
 * Whether running this canary anywhere it is declared for spends a model turn.
 *
 * Fail-closed on an underivable cost: a harness whose cost is unknown is
 * treated as spending, because the failure mode of the other default is a
 * surprise charge.
 */
export function canaryCostsModelTurn(canary: CanaryDeclaration): boolean {
  return canaryCosts(canary).some((cost) => cost.costsModelTurn !== false);
}

/** What a whole sweep would spend, for a caller listing it before running it. */
export function catalogCosts(
  catalog: CanaryCatalog,
): readonly { readonly id: string; readonly costsModelTurn: boolean; readonly perHarness: readonly CanaryCost[] }[] {
  return catalog.canaries.map((canary) => ({
    id: canary.id,
    costsModelTurn: canaryCostsModelTurn(canary),
    perHarness: canaryCosts(canary),
  }));
}
