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

import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync, type Dirent } from "node:fs";
import { access, readdir, readFile, rm } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { createIsolationLaunchSpec } from "../adapters/isolation.js";
import {
  createMemoryRunner,
  MEMORY_COMMAND,
  memoryDoctor,
  memoryHandoff,
  memorySearch,
  type MemoryRefusal,
  type MemoryResult,
  type MemoryRunner,
  type MemorySearchFacts,
} from "../adapters/unified-memory.js";
import {
  ORACLE_DEFINITIONS,
  ORACLE_PLACEHOLDER_PROMPT,
  resolveDirectLaunch,
  runPairedDiscovery,
  type PairedDiscovery,
  type RunPairedDiscoveryOptions,
} from "../adapters/capability-oracle.js";
import type {
  HarnessId,
  IsolationLaunchSpec,
  McpServerId,
  RedactedExcerpt,
  StackLock,
  SurfaceSupport,
} from "../types.js";
import { pairEvidence } from "./capability-ledger.js";
import type {
  BlockedReason,
  BoundInputs,
  CapabilityProof,
  ClaimNote,
  EvidenceCompleteness,
  EvidenceUnit,
  HarnessVersion,
  ImmutabilityWitness,
  LedgerHarness,
  NativeUseState,
  OracleRecord,
} from "./capability-ledger.js";
// Type-only, and deliberately so: this module READS the deployment axis's type
// and never defines, widens or computes it — the same rule `capability-ledger`
// applies, and the same erasure, so a status path that needs one string does
// not drag the whole project-plan module in.
import type { PackState } from "./project-plan.js";
import { ManagedDocumentError, type StrictLoadResult } from "./catalog.js";
import { defaultIsolationPolicy, isolationProjectId } from "./isolation.js";
import { assertNoCredentialValue, nativeConfigFormat, renderMcpConfig } from "./mcp.js";
import {
  classifiedIdentifierArgument,
  readObservationRecords,
  RESEARCH_ROUTING_INSTRUCTION_ID,
  RESEARCH_ROUTING_INSTRUCTION_SOURCE,
  VERSION_SCOPED_IDENTIFIER_PATTERN,
  type IdentifierShape,
  type McpObservation,
} from "./mcp-proxy.js";
import {
  commandProbeEnvironment,
  materializeEnvironment,
  PLATFORM_FLOOR_ENVIRONMENT,
  resolveCommand,
  runProcess,
  type EnvironmentPolicy,
} from "./process.js";
import { canonicalizeWithMissingTail } from "./path-boundary.js";
import { aliasPath, createPathAliases, packageRoot, RootKeyedCache } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";
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
  /**
   * A run would produce no evidence, so it is refused before it spends
   * anything. A missing observation is indistinguishable from a capability that
   * was not selected, which makes a run with no sink strictly worse than no run
   * at all (T-03-54).
   */
  OBSERVATION_SINK_UNAVAILABLE: "the observation sink a canary records through is not available",
  /**
   * The harness cannot be pointed at the canary's own observation front, so a
   * run on it could not be told apart from one talking to the user's own
   * servers. Fail-closed rather than run-and-hope (T-03-50).
   */
  HARNESS_ISOLATION_UNPROVEN: "the harness cannot be isolated onto the canary runtime's MCP configuration",
  /** No proven non-interactive prompt vector exists for this harness. */
  HARNESS_PROMPT_VECTOR_UNKNOWN: "no observed non-interactive argument vector puts a prompt in front of this harness",
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
 * naive connected rule. `connection closed` is likewise tested first.
 *
 * TWO spellings of every glyph, because a harness prints a different one
 * depending on what it thinks its terminal can render. Measured on this host,
 * 2026-09-11: `claude mcp list` in a terminal prints `✔ Connected`, and the
 * SAME command launched by alpha-AOS through the bounded process adapter prints
 * `√ Connected` — U+221A, the Windows console fallback. Nothing about the
 * server changed between those two runs.
 *
 * That difference was not cosmetic. With only the terminal glyph declared,
 * every genuinely connected server on Windows parsed as `unknown`, so the
 * `connected` state could never be OBSERVED at all — and a rule that can only
 * ever see `failed` and `needs-auth` cannot enforce what the canary catalog's
 * `requiresMcpServers` says it enforces. The word is matched unanchored for the
 * same reason: a glyph nobody predicted should degrade to reading the sentence,
 * not to reading nothing.
 */
const CONNECTION_MARKERS: readonly { readonly test: RegExp; readonly state: McpConnectionState }[] = [
  { test: /^[✘✗×]|failed to connect|connection closed/iu, state: "failed" },
  { test: /^[!‼]|needs authentication|authentication required/iu, state: "needs-auth" },
  { test: /^[✔✓√]|\bconnected\b/iu, state: "connected" },
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

// ---------------------------------------------------------------------------
// The canary runtime — the same servers, fronted, and only here (D-02)
// ---------------------------------------------------------------------------

/**
 * Where canary runtimes live under the managed state root.
 *
 * Under `userStateRoot()` and never inside a project or a harness's own config
 * root, which is the whole content of 03-CONTEXT.md D-02: the observation front
 * exists for the duration of a run, in a directory alpha-AOS owns, and a user's
 * everyday configuration keeps talking to the upstream servers directly.
 */
export const CANARY_RUNTIME_DIRECTORY = "canary";

/** The observation record file inside a runtime. Newline-delimited JSON. */
export const CANARY_OBSERVATIONS_FILE = "observations.jsonl";

/** The runtime marker, in the shape the isolated-runtime marker already uses. */
export const CANARY_MARKER_FILE = "runtime.json";

/** Written when a runtime is spent. A runtime is single-use, by construction. */
export const CANARY_CONSUMED_FILE = "consumed.json";

// --- The D-02 boundary, as refusals ---------------------------------------

/** A launch would let a harness read or write its REAL configuration root. */
export const CANARY_LAUNCH_ISOLATION_VIOLATION = "CANARY_LAUNCH_ISOLATION_VIOLATION";
/** A launch environment carries a name nothing declared. */
export const CANARY_ENVIRONMENT_UNDECLARED_NAME = "CANARY_ENVIRONMENT_UNDECLARED_NAME";
/** A runtime would be created outside the managed state root it named. */
export const CANARY_RUNTIME_NOT_CONTAINED = "CANARY_RUNTIME_NOT_CONTAINED";
/** A second run was asked for on a runtime that has already been spent. */
export const CANARY_RUNTIME_ALREADY_CONSUMED = "CANARY_RUNTIME_ALREADY_CONSUMED";

/**
 * A D-02 boundary refusal.
 *
 * These are alpha-AOS's own invariants rather than states a user can act on, so
 * they throw with a stable code instead of becoming a `BlockedReason`: a
 * `blocked` a user cannot clear is a report that wastes their time, and a
 * boundary that reports rather than refuses is a boundary that has already been
 * crossed.
 */
export class CanaryBoundaryError extends Error {
  readonly code: string;
  /** The offending NAMES, never their values. */
  readonly names: readonly string[];

  constructor(code: string, message: string, names: readonly string[] = []) {
    super(message);
    this.name = "CanaryBoundaryError";
    this.code = code;
    this.names = names;
  }
}

/**
 * Environment names whose VALUE decides where a harness finds its own
 * configuration.
 *
 * Exactly the names alpha-AOS controls. `HOME` and the Windows floor's
 * `USERPROFILE`/`HOMEPATH` are deliberately absent: the operating system
 * delivers the floor whatever an allowlist says (Phase 1's floor table), so
 * asserting over them would be asserting over something this tool cannot
 * decide. What it CAN decide is that every config-root name it sets points
 * inside the canary runtime.
 */
export const HARNESS_CONFIG_ROOT_NAMES: readonly string[] = Object.freeze([
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "ANTIGRAVITY_CONFIG_DIR",
  "PI_CODING_AGENT_DIR",
  "HERMES_HOME",
]);

/**
 * Whether `candidate` is `root` or sits beneath it, lexically.
 *
 * A cheap pre-check, deliberately not a replacement for the canonicalizing
 * proof `applyFileTransaction` performs underneath: this one refuses an obvious
 * escape before any writer is acquired, and `proveOperationPaths` is still the
 * authority on symlinks, junctions and reparse points.
 */
function withinRoot(root: string, candidate: string): boolean {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/**
 * Refuses a runtime that would be created outside the state root it named, or
 * that would write a file outside itself.
 */
export function assertRuntimeContainment(runtime: {
  readonly root: string;
  readonly stateRoot: string;
  readonly declaredFiles: readonly string[];
}): void {
  if (!withinRoot(runtime.stateRoot, runtime.root)) {
    throw new CanaryBoundaryError(
      CANARY_RUNTIME_NOT_CONTAINED,
      "A canary runtime must sit under the managed state root it named. This one does not, so it was refused before " +
        "anything was written — a runtime outside the state root is a write the transaction boundary never agreed to.",
      [],
    );
  }
  const escaped = runtime.declaredFiles.filter((file) => !withinRoot(runtime.root, file));
  if (escaped.length > 0) {
    throw new CanaryBoundaryError(
      CANARY_RUNTIME_NOT_CONTAINED,
      `A canary runtime declared ${escaped.length} file(s) outside its own directory, so it was refused before ` +
        "anything was written.",
      [],
    );
  }
}

/**
 * Refuses a launch whose environment would point a harness at a configuration
 * root outside the canary runtime.
 */
export function assertCanaryLaunchIsolation(
  environment: Readonly<Record<string, string>>,
  runtime: { readonly root: string },
): void {
  const offending = HARNESS_CONFIG_ROOT_NAMES.filter((name) => {
    const value = environment[name];
    return value !== undefined && value.length > 0 && !withinRoot(runtime.root, value);
  });
  if (offending.length === 0) return;
  // The NAMES, never the values: a config root is a private path, and this
  // message reaches stderr.
  throw new CanaryBoundaryError(
    CANARY_LAUNCH_ISOLATION_VIOLATION,
    `A canary launch would point ${offending.join(", ")} outside the canary runtime, which is the everyday ` +
      "configuration D-02 says a canary must not touch. The launch was refused rather than run and reported.",
    offending,
  );
}

/**
 * Refuses a launch environment carrying a name outside the platform floor plus
 * what this canary declared.
 */
export function assertCanaryEnvironmentDeclared(
  environment: Readonly<Record<string, string>>,
  declared: readonly string[],
): void {
  // The floor is delivered by the operating system whatever an allowlist says,
  // so the rule is that nothing OUTSIDE floor-plus-declared appears. Phase 1's
  // table is the reference and is imported rather than restated here.
  const undeclared = Object.keys(environment).filter(
    (name) => !PLATFORM_FLOOR_ENVIRONMENT.includes(name) && !declared.includes(name),
  );
  if (undeclared.length === 0) return;
  throw new CanaryBoundaryError(
    CANARY_ENVIRONMENT_UNDECLARED_NAME,
    `A canary launch environment carries ${undeclared.length} name(s) outside the platform floor and this canary's ` +
      `own declaration: ${undeclared.join(", ")}. The launch was refused; an inherited name is how a child ends up ` +
      "reading state alpha-AOS never chose.",
    undeclared,
  );
}

/** Refuses a second run on a runtime that has already been spent. */
export async function assertRuntimeUnconsumed(runtime: CanaryRuntime): Promise<void> {
  if (!existsSync(runtime.consumedPath)) return;
  throw new CanaryBoundaryError(
    CANARY_RUNTIME_ALREADY_CONSUMED,
    `The canary runtime at ${runtime.runId} has already been spent. A runtime is single-use: a second run through ` +
      "one would compute its verdict partly from the first run's observation records, and those records look exactly " +
      "like records the second run produced. Create a fresh runtime instead.",
    [],
  );
}

/**
 * Records that a runtime has been spent, before anything is launched through it.
 *
 * Written BEFORE the launch rather than after, so a run that crashed mid-flight
 * still cannot be repeated through the same runtime — a crashed run is exactly
 * the case where stale records are most likely to be sitting there.
 */
export async function markRuntimeConsumed(runtime: CanaryRuntime, session?: MutationSession): Promise<void> {
  await applyFileTransaction({
    stateRoot: runtime.stateRoot,
    allowedRoots: [runtime.root],
    operations: [
      {
        target: runtime.consumedPath,
        content: `${JSON.stringify({ schemaVersion: 1, runId: runtime.runId, consumedAt: new Date().toISOString() }, null, 2)}\n`,
      },
    ],
    ...(session === undefined ? {} : { session }),
  });
}

/**
 * The file name a harness's own configuration syntax asks for.
 *
 * Derived from `nativeConfigFormat` rather than restated as a second per-harness
 * table, so a harness whose syntax changes cannot end up with two answers.
 */
export function canaryConfigFileName(harness: LedgerHarness): string {
  switch (nativeConfigFormat(harness)) {
    case "toml":
      return "config.toml";
    case "yaml":
      return "config.yaml";
    default:
      return "mcp.json";
  }
}

/**
 * One canary runtime: a configuration root that exists for one run.
 *
 * `declaredFiles` and `declaredRoots` are first-class fields rather than
 * knowledge a caller reconstructs, because the D-02 assertion is "the run
 * created exactly what it said it would and nothing else" — an assertion that
 * needs the run's own declaration to compare against.
 */
export interface CanaryRuntime {
  readonly runId: string;
  readonly harness: LedgerHarness;
  readonly projectId: string;
  readonly projectRoot: string;
  readonly stateRoot: string;
  readonly root: string;
  readonly mcpConfigPath: string;
  readonly observationsPath: string;
  readonly markerPath: string;
  /**
   * Written the moment a run commits to launching, and never removed.
   *
   * A runtime is single-use. Not in `declaredFiles`, because it does not exist
   * at creation — it sits under `root`, which every containment assertion
   * already covers.
   */
  readonly consumedPath: string;
  readonly servers: readonly McpServerId[];
  readonly ownedInstructionIds: readonly string[];
  /** Exactly the files this runtime's creation wrote. */
  readonly declaredFiles: readonly string[];
  /**
   * Every root under the managed state root this runtime's creation may write
   * beneath. The journal and snapshot roots are named because the write travels
   * the same journaled transaction every other owned write does, and a run that
   * declared only its own directory would be declaring less than it does.
   */
  readonly declaredRoots: readonly string[];
  readonly operationId: string | null;
}

/**
 * Where a canary runtime puts the alpha-AOS-owned steering instructions, per
 * harness, or null when this runtime cannot reach that harness's skill root.
 *
 * A canary launches with `project-only` isolation, which points claude at a
 * `CLAUDE_CONFIG_DIR` INSIDE the runtime. That is deliberate — a canary
 * inheriting the user's global configuration would be measuring the user's
 * machine — but it also means a user-scope owned skill is invisible to the very
 * run it was written to steer. Writing the instruction into the runtime's own
 * config root is what closes that gap; without it, plan 03-07's `narrow`
 * decision would ship a steering layer that provably steers nothing.
 *
 * Null for the other three because their canary launch is blocked before it
 * starts (only claude has the two MCP isolation flags), so a skill root guessed
 * for them would be a path nothing ever reads.
 */
const CANARY_INSTRUCTION_ROOT: Readonly<Record<LedgerHarness, ((harnessRoot: string) => string) | null>> = Object.freeze({
  claude: (harnessRoot: string) => join(harnessRoot, "skills"),
  codex: null,
  pi: null,
  hermes: null,
});

/** The identifier and source of the memory-handoff steering instruction (plan 03-12). */
export const MEMORY_HANDOFF_INSTRUCTION_ID = "alpha-aos-memory-handoff";
export const MEMORY_HANDOFF_INSTRUCTION_SOURCE = "skills/alpha-aos-memory-handoff/SKILL.md";

export interface CanaryOwnedInstruction {
  readonly id: string;
  readonly source: string;
  /**
   * The capabilities this instruction is materialized for, or null for every
   * canary.
   *
   * Scoped rather than global because a steering instruction is a change to the
   * conditions a run happens under. Handing the memory-handoff instruction to
   * the CAPA-01 documentation canary would quietly alter the run whose whole job
   * is to show what a harness does WITHOUT being pointed at anything.
   */
  readonly capabilities: readonly string[] | null;
}

/**
 * The alpha-AOS-owned instructions a canary runtime carries.
 *
 * Declared as a list rather than inlined so a second owned instruction is an
 * entry rather than a second copy of the write.
 */
export const CANARY_OWNED_INSTRUCTIONS: readonly CanaryOwnedInstruction[] = Object.freeze([
  { id: RESEARCH_ROUTING_INSTRUCTION_ID, source: RESEARCH_ROUTING_INSTRUCTION_SOURCE, capabilities: null },
  {
    id: MEMORY_HANDOFF_INSTRUCTION_ID,
    source: MEMORY_HANDOFF_INSTRUCTION_SOURCE,
    // CAPA-03's truth statement is that a user can EXPLICITLY hand work over.
    // Telling the receiving harness where handed-off context lives is therefore
    // in scope rather than a thumb on the scale — without it the receiving leg
    // cannot consult the handoff at all, because a canary runtime deliberately
    // hides the user's own skills (03-08 deviation 3), and a run that could not
    // possibly succeed proves nothing when it does not.
    capabilities: ["CAPA-03"],
  },
]);

/** The owned instructions that apply to a run for `capability`. */
export function ownedInstructionsFor(capability: string | null): readonly CanaryOwnedInstruction[] {
  return CANARY_OWNED_INSTRUCTIONS.filter(
    (instruction) => instruction.capabilities === null || (capability !== null && instruction.capabilities.includes(capability)),
  );
}

export interface CreateCanaryRuntimeOptions {
  readonly projectRoot: string;
  readonly harness: LedgerHarness;
  readonly servers: readonly McpServerId[];
  /** REQUIRED. There is no default, for the reason `writeCapabilityLedger` records. */
  readonly stateRoot: string;
  readonly lock: StackLock;
  /**
   * Where the alpha-AOS-owned instructions are read from. Defaults to this
   * installation's own package root; a test supplies its own so the assertion
   * is about the copy, not about the developer's checkout.
   */
  readonly packageRoot?: string;
  /** Supplied by a caller that wants a reproducible runtime path; otherwise fresh. */
  readonly runId?: string;
  /**
   * Which capability this runtime is being built for, so only the owned
   * instructions declared for it are materialized. Null (the default) carries
   * the unscoped instructions and nothing else.
   */
  readonly capability?: string | null;
  /** Read for the credential-value refusal only. Never rendered. */
  readonly environment?: NodeJS.ProcessEnv;
  readonly context?: ExecutionContext;
  readonly session?: MutationSession;
}

/**
 * Builds the isolated configuration root a canary run talks through.
 *
 * One MCP configuration file, rendered through the SAME per-harness renderer
 * everyday configuration goes through — so the server-map key name is the
 * harness's own rather than a second spelling — with every server entry
 * launching `alpha-aos mcp-proxy <id> --observe` instead of the upstream
 * package directly.
 *
 * Each runtime gets its own `runId` directory and its own empty observation
 * file. That is what stops a second run from silently inheriting the first
 * run's records: the two runs cannot name the same file, so there is no
 * carried-over record for a later verdict to be computed from.
 */
export async function createCanaryRuntime(options: CreateCanaryRuntimeOptions): Promise<CanaryRuntime> {
  assertCanaryContext(options.context ?? "canary", "createCanaryRuntime");

  const stateRoot = resolve(options.stateRoot);
  const projectRoot = resolve(options.projectRoot);
  const projectId = isolationProjectId(projectRoot);
  const runId = options.runId ?? randomUUID();
  const root = join(stateRoot, CANARY_RUNTIME_DIRECTORY, projectId, options.harness, runId);
  const observationsPath = join(root, CANARY_OBSERVATIONS_FILE);
  const mcpConfigPath = join(root, canaryConfigFileName(options.harness));
  const markerPath = join(root, CANARY_MARKER_FILE);
  const servers = [...options.servers];

  const rendered = renderMcpConfig(options.harness as HarnessId, "", options.lock, servers, {
    front: "observe",
    observationsPath,
    credentialNames: true,
  });
  // The same refusal `planMcpSync` applies, applied here rather than reasoned
  // about: this document is written to disk and read by a child process.
  assertNoCredentialValue(rendered, options.environment ?? process.env);

  const marker = {
    schemaVersion: 1,
    managedBy: "alpha-aos",
    kind: "canary-runtime",
    runId,
    projectId,
    harness: options.harness,
    servers,
    createdAt: new Date().toISOString(),
  };

  // The owned steering instructions, copied BYTE-FOR-BYTE into the runtime's
  // own harness config root. Copied rather than rendered: this is alpha-AOS's
  // own document, so the source hash and the target hash are the same fact, and
  // a renderer here would be a second place its text could differ from the one
  // a reviewer read in the repository.
  const instructionRoot = CANARY_INSTRUCTION_ROOT[options.harness];
  const instructionSourceRoot = resolve(options.packageRoot ?? packageRoot());
  const instructions: { readonly target: string; readonly content: string }[] = [];
  const ownedInstructionIds: string[] = [];
  if (instructionRoot !== null) {
    for (const instruction of ownedInstructionsFor(options.capability ?? null)) {
      const source = join(instructionSourceRoot, instruction.source);
      // A missing owned instruction is a REFUSAL, not a quietly skipped write.
      // A canary that ran without its steering layer and passed would be
      // reporting the third-party text's behaviour under alpha-AOS's name.
      if (!existsSync(source)) {
        throw new Error(
          `Canary runtime cannot be created: the alpha-AOS-owned instruction ${instruction.source} is missing from ${instructionSourceRoot}`,
        );
      }
      instructions.push({
        target: join(instructionRoot(join(root, options.harness)), instruction.id, "SKILL.md"),
        content: await readFile(source, "utf8"),
      });
      ownedInstructionIds.push(instruction.id);
    }
  }

  const declaredFiles = [markerPath, mcpConfigPath, observationsPath, ...instructions.map((entry) => entry.target)];
  // Asserted BEFORE anything is written: a runtime that would land outside the
  // managed state root is refused rather than created and then reported.
  assertRuntimeContainment({ root, stateRoot, declaredFiles });
  const journal = await applyFileTransaction({
    stateRoot,
    allowedRoots: [root],
    operations: [
      { target: markerPath, content: `${JSON.stringify(marker, null, 2)}\n` },
      { target: mcpConfigPath, content: rendered },
      // Created empty and owned by this run. An absent file would make
      // "nothing was observed" and "the sink was never there" the same shape.
      { target: observationsPath, content: "" },
      ...instructions,
    ],
    ...(options.session === undefined ? {} : { session: options.session }),
  });

  return {
    runId,
    harness: options.harness,
    projectId,
    projectRoot,
    stateRoot,
    root,
    mcpConfigPath,
    observationsPath,
    markerPath,
    consumedPath: join(root, CANARY_CONSUMED_FILE),
    servers,
    ownedInstructionIds,
    declaredFiles,
    // The canary tree itself, not only this run's leaf: creating the leaf
    // creates the `<state>/canary/<projectId>/<harness>` directories above it,
    // and a declaration that omitted them would be declaring less than the run
    // does. The journal and snapshot roots are named for the same reason — the
    // write travels the one journaled transaction every owned write travels.
    declaredRoots: [
      join(stateRoot, CANARY_RUNTIME_DIRECTORY),
      join(stateRoot, "journal"),
      join(stateRoot, "snapshots"),
    ],
    operationId: journal.id,
  };
}

/**
 * Removes a canary runtime.
 *
 * A runtime is ephemeral by construction — it is named after one run — so this
 * is a convenience rather than the thing that keeps two runs apart. A caller
 * that never calls it still cannot have one run read another's records.
 */
export async function disposeCanaryRuntime(runtime: CanaryRuntime): Promise<void> {
  await rm(runtime.root, { recursive: true, force: true });
}

// --- The observation sink --------------------------------------------------

/**
 * Where a canary reads what the proxies saw.
 *
 * `ready` is separate from `read` and is consulted BEFORE the harness launches.
 * A run that launches and then finds it cannot read any record has spent a
 * model turn to produce nothing, and "no observation" is exactly the shape of
 * "the capability was not selected" — so the two must never be confusable
 * (T-03-54).
 */
export interface CanaryObservationSink {
  /** Names the sink in a refusal, so a blocked reason can say WHICH one. */
  readonly name: string;
  ready(): Promise<boolean>;
  /** Every record so far, in the order they were appended. */
  read(): Promise<readonly McpObservation[]>;
}

/** The sink a runtime's own observation file provides. */
export function createCanaryObservationSink(runtime: CanaryRuntime): CanaryObservationSink {
  return createFileCanaryObservationSink(runtime.observationsPath);
}

/** The same sink over any observation file, for a caller holding only a path. */
export function createFileCanaryObservationSink(path: string): CanaryObservationSink {
  return {
    name: path,
    ready: async () => {
      try {
        await access(path, constants.R_OK | constants.W_OK);
        return true;
      } catch {
        return false;
      }
    },
    read: async () => {
      const text = await readFile(path, "utf8").catch(() => null);
      return text === null ? [] : readObservationRecords(text);
    },
  };
}

// --- The invocation verdict ------------------------------------------------

/**
 * Why a declared argument pattern was not checked.
 *
 * `McpObservation` has no argument field and deliberately cannot grow one:
 * arguments are where credentials live, and a record is an observable surface
 * that reaches a ledger and a CI log (T-03-52). A declared argument pattern is
 * therefore reported as UNCHECKED with this reason and is never reported as
 * satisfied — an unchecked expectation silently counted as met is the shape of
 * every proof that proves nothing.
 */
export const ARGUMENT_PATTERNS_NOT_OBSERVABLE =
  "the observation record carries a tool name, an outcome and at most one declared identifier SHAPE; it has no " +
  "argument field, so a declared argument pattern that no recorded shape decides cannot be checked from it and is " +
  "reported unchecked rather than satisfied";

/** What matching one declaration's expectations against one observation list produced. */
export interface ExpectationMatch {
  /** The expected tools that were observed, in the order they were observed. */
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly forbiddenSeen: readonly string[];
  /** Null when the declaration asked for no order. */
  readonly ordered: boolean | null;
  readonly distinctServers: number;
  readonly maxDistinctServers: number;
  readonly withinServerBudget: boolean;
  /** Declared patterns the observation's recorded shape SATISFIES. */
  readonly satisfiedArgumentPatterns: readonly string[];
  /** Declared patterns the recorded shape contradicts. */
  readonly unsatisfiedArgumentPatterns: readonly string[];
  /** Declared patterns no record carries a shape for, so neither verdict is available. */
  readonly uncheckedArgumentPatterns: readonly string[];
  readonly observationCount: number;
  readonly held: boolean;
  readonly reasons: readonly string[];
}

/**
 * Whether `needle` appears inside `haystack` in order, allowing gaps.
 *
 * A SUBSEQUENCE rather than a contiguous run: a correct route may make calls
 * the declaration says nothing about between its two legs — a documentation
 * lookup mid-research, a retry — and a contiguity requirement would report
 * those as an ordering failure.
 */
function isOrderedSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let cursor = 0;
  for (const item of haystack) {
    if (cursor < needle.length && needle[cursor] === item) cursor += 1;
  }
  return cursor === needle.length;
}

/**
 * The fan-out judgement: how many DISTINCT research servers one run touched.
 *
 * Keyed on server id alone, so repeated calls to one server collapse to a
 * single touch. That collapse is load-bearing, not a simplification:
 * 03-RESEARCH.md Pitfall 1's second-order note records that the discovery
 * server ships its own fetch tool, so a run that searches and then fetches
 * entirely on the discovery server makes two calls and is a correct
 * single-server lookup. A count that summed those two would report this
 * phase's own recommended routing as fan-out.
 *
 * It is a count and not a required tool sequence for the same reason: more
 * than one reasonable two-tool path exists, and pinning one would fail a
 * correct run.
 */
export function countDistinctServers(observations: readonly McpObservation[]): number {
  return new Set(observations.map((observation) => observation.server)).size;
}

/**
 * Whether a declared argument pattern is one a RECORDED SHAPE can decide.
 *
 * Two conditions, and both are required: the (tool, argument) pair must be the
 * one the observation front classifies, and the declared pattern must be the
 * version-scoped pattern that classification implements. A declaration naming
 * some other argument, or the same argument with a different regular
 * expression, is checking something the record does not carry — and is
 * reported unchecked rather than approximated.
 */
function shapeDecides(pattern: CanaryArgumentPattern): boolean {
  return (
    classifiedIdentifierArgument(pattern.tool) === pattern.argument &&
    pattern.pattern === VERSION_SCOPED_IDENTIFIER_PATTERN
  );
}

/**
 * Matches one declaration's expectations against one observation list.
 *
 * The ONE matcher: `decideInvocation` computes its verdict from this rather
 * than from a second copy of the rules, so a canary cannot hold one opinion
 * about an observation list while the ledger holds another.
 *
 * Ordering is a first-class verdict. CAPA-02's claim is that discovery happens
 * and THEN extraction — an ordering claim — and a set comparison cannot express
 * it: an extraction-first run would satisfy a set of the same two names
 * (T-03-72).
 */
export function matchExpectations(
  observations: readonly McpObservation[],
  declaration: CanaryDeclaration,
): ExpectationMatch {
  // A denied call counts as a reach for the tool. The proxy records a policy
  // refusal deliberately: that the model reached for a named tool is exactly
  // the evidence a capability canary is after.
  const called = observations.map((observation) => observation.tool);
  const expected = new Set(declaration.expectTools);

  // Reported in OBSERVED order, not in declared order: this list is what a
  // reader compares against `ordered` below, and a list silently re-sorted into
  // the order that was expected would make a failing order look like a passing
  // one.
  const seen = new Set<string>();
  const matched: string[] = [];
  for (const tool of called) {
    if (expected.has(tool) && !seen.has(tool)) {
      seen.add(tool);
      matched.push(tool);
    }
  }
  const missing = declaration.expectTools.filter((tool) => !seen.has(tool));
  const forbiddenSeen = declaration.forbidTools.filter((tool) => called.includes(tool));

  const distinctServers = countDistinctServers(observations);
  const withinServerBudget = distinctServers <= declaration.maxDistinctServers;

  // Null when the declaration asked for no order, and when one tool is expected
  // — a single call is in order by construction, and reporting `true` there
  // would be an ordering verdict nothing established.
  const ordered =
    declaration.expectOrdered === true && declaration.expectTools.length > 1
      ? isOrderedSubsequence(declaration.expectTools, called)
      : null;

  const satisfiedArgumentPatterns: string[] = [];
  const unsatisfiedArgumentPatterns: string[] = [];
  const uncheckedArgumentPatterns: string[] = [];
  for (const pattern of declaration.expectArgumentPatterns ?? []) {
    const key = `${pattern.tool}.${pattern.argument}`;
    if (!shapeDecides(pattern)) {
      uncheckedArgumentPatterns.push(key);
      continue;
    }
    const shapes = observations
      .filter((observation) => observation.tool === pattern.tool)
      .map((observation) => observation.identifierShape)
      .filter((shape): shape is IdentifierShape => shape !== undefined);
    if (shapes.length === 0) {
      // The call was not classified — no observation of it carries a shape —
      // so neither verdict is available. Unchecked, with the reason, exactly as
      // before this field existed.
      uncheckedArgumentPatterns.push(key);
    } else if (shapes.includes("version-scoped")) {
      satisfiedArgumentPatterns.push(key);
    } else {
      unsatisfiedArgumentPatterns.push(key);
    }
  }

  const reasons: string[] = [];
  if (missing.length > 0) reasons.push(`no observation records a call to ${missing.join(", ")}`);
  if (forbiddenSeen.length > 0) reasons.push(`a forbidden tool was called: ${forbiddenSeen.join(", ")}`);
  if (!withinServerBudget) {
    reasons.push(
      `the run touched ${distinctServers} distinct servers, past the declared maximum of ${declaration.maxDistinctServers}`,
    );
  }
  if (ordered === false) reasons.push("the expected tools were called, but not in the declared order");
  if (unsatisfiedArgumentPatterns.length > 0) {
    reasons.push(
      `${unsatisfiedArgumentPatterns.join(", ")}: the recorded identifier shape does not satisfy the declared pattern`,
    );
  }
  if (uncheckedArgumentPatterns.length > 0) {
    reasons.push(`${uncheckedArgumentPatterns.join(", ")}: ${ARGUMENT_PATTERNS_NOT_OBSERVABLE}`);
  }
  if (observations.length === 0) reasons.push("no tool call crossed the observation front at all");

  const held =
    missing.length === 0 &&
    forbiddenSeen.length === 0 &&
    withinServerBudget &&
    ordered !== false &&
    unsatisfiedArgumentPatterns.length === 0;

  return {
    matched,
    missing,
    forbiddenSeen,
    ordered,
    distinctServers,
    maxDistinctServers: declaration.maxDistinctServers,
    withinServerBudget,
    satisfiedArgumentPatterns,
    unsatisfiedArgumentPatterns,
    uncheckedArgumentPatterns,
    observationCount: observations.length,
    held,
    reasons,
  };
}

/** What the observation records — and only they — say about one canary. */
export interface InvocationVerdict {
  /** `invoked` only when records exist and every declared expectation held. */
  readonly nativeUse: NativeUseState;
  readonly matched: readonly string[];
  readonly missing: readonly string[];
  readonly forbiddenSeen: readonly string[];
  readonly distinctServers: number;
  readonly maxDistinctServers: number;
  readonly withinServerBudget: boolean;
  /** Null when the declaration asked for no order. */
  readonly ordered: boolean | null;
  /** Declared argument patterns the recorded identifier shape SATISFIES. */
  readonly satisfiedArgumentPatterns: readonly string[];
  /** Declared argument patterns the recorded shape contradicts. */
  readonly unsatisfiedArgumentPatterns: readonly string[];
  /** Declared argument patterns no recorded shape can decide, reported with the reason. */
  readonly uncheckedArgumentPatterns: readonly string[];
  /**
   * Whether every declared expectation held, INDEPENDENT of whether anything
   * was invoked. A fan-out control that observed nothing has held its
   * expectation and invoked nothing; those are two different facts and merging
   * them would let a control read as a proof.
   */
  readonly expectationsHeld: boolean;
  readonly observationCount: number;
  readonly reasons: readonly string[];
}

/**
 * Decides the invocation axis from the observation records ALONE.
 *
 * No harness output reaches this function, and that is the point rather than an
 * omission: 03-CONTEXT.md D-01 makes model output text inadmissible as proof, so
 * a transcript claiming a tool was used cannot move this axis. The excerpt a run
 * retains is evidence about the RUN — for diagnosis — and is never consulted
 * here (T-03-51).
 */
export function decideInvocation(
  canary: CanaryDeclaration,
  observations: readonly McpObservation[],
): InvocationVerdict {
  // Computed by the ONE matcher rather than by a second copy of the rules. Two
  // implementations of "did the expectations hold" is two verdicts nobody can
  // tell apart when they disagree.
  const match = matchExpectations(observations, canary);
  return {
    // `invoked` needs both halves: the expectations held AND something was
    // actually observed. A fan-out control that observed nothing has held its
    // expectation and invoked nothing, and merging those would let a control
    // read as a proof.
    nativeUse: match.held && observations.length > 0 ? "invoked" : "unverified",
    matched: match.matched,
    missing: match.missing,
    forbiddenSeen: match.forbiddenSeen,
    distinctServers: match.distinctServers,
    maxDistinctServers: match.maxDistinctServers,
    withinServerBudget: match.withinServerBudget,
    ordered: match.ordered,
    satisfiedArgumentPatterns: match.satisfiedArgumentPatterns,
    unsatisfiedArgumentPatterns: match.unsatisfiedArgumentPatterns,
    uncheckedArgumentPatterns: match.uncheckedArgumentPatterns,
    expectationsHeld: match.held,
    observationCount: match.observationCount,
    reasons: match.reasons,
  };
}

// --- The launch ------------------------------------------------------------

/** A canary run's deadline. A cold harness start plus a model turn is slow, not stuck. */
export const CANARY_TIMEOUT_MS = 300_000;

/**
 * How many bytes of harness output a canary may READ.
 *
 * The default excerpt budget is sized for a diagnostic a person reads, and a
 * streaming harness transcript is far past it — a run cut at that default comes
 * back looking unreadable. This budget is for the retained diagnostic excerpt
 * only: it is never consulted to decide the invocation axis.
 */
export const CANARY_EXCERPT_BYTES = 512 * 1024;

/**
 * Names a canary child may receive BEYOND the platform floor and the canary's
 * own declared requirements.
 *
 * Deliberately short, and deliberately without `HOME`: a canary must not reach
 * the user's real harness configuration, and a home directory is how most of it
 * is found. The platform floor is imported rather than restated — the operating
 * system delivers it whatever this list says, and naming it keeps the allowlist
 * honest instead of pretending the boundary is total.
 */
export const CANARY_ENVIRONMENT_NAMES: readonly string[] = Object.freeze([
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_EXTRA_CA_CERTS",
]);

/** Every name a canary launch declares, floor excluded. Ordered, de-duplicated. */
export function canaryEnvironmentNames(options: {
  readonly declaration: CanaryDeclaration;
  readonly spec: IsolationLaunchSpec;
  readonly runtime: CanaryRuntime;
}): readonly string[] {
  return [
    ...new Set([
      ...CANARY_ENVIRONMENT_NAMES,
      ...(options.declaration.requiresEnvironment ?? []),
      ...Object.keys(options.spec.env),
      ...Object.keys(canaryWriteRoots(options.runtime)),
    ]),
  ];
}

/**
 * The names that decide where a child WRITES, pinned under the runtime.
 *
 * Plan 01-21's rule applied to this seam: an inherited name must never choose
 * the directory a child bootstraps into, or a canary's incidental state lands
 * in the user's real roots and D-02 is violated by a cache rather than by a
 * configuration file.
 */
function canaryWriteRoots(runtime: CanaryRuntime): Record<string, string> {
  const writeRoot = join(runtime.root, "write");
  return {
    LOCALAPPDATA: join(writeRoot, "local"),
    APPDATA: join(writeRoot, "roaming"),
    XDG_CACHE_HOME: join(writeRoot, "cache"),
    XDG_CONFIG_HOME: join(writeRoot, "config"),
    XDG_DATA_HOME: join(writeRoot, "data"),
    XDG_STATE_HOME: join(writeRoot, "state"),
    npm_config_cache: join(writeRoot, "npm-cache"),
    npm_config_logs_max: "0",
  };
}

/** The environment policy one canary launch declares. */
export function canaryEnvironmentPolicy(options: {
  readonly declaration: CanaryDeclaration;
  readonly spec: IsolationLaunchSpec;
  readonly runtime: CanaryRuntime;
  readonly source?: NodeJS.ProcessEnv;
}): EnvironmentPolicy {
  return {
    optional: [
      ...PLATFORM_FLOOR_ENVIRONMENT,
      ...CANARY_ENVIRONMENT_NAMES,
      // Credential NAMES the declaration asked for. The value is passed to the
      // child because the fronted server needs it; it is never read, compared,
      // recorded or rendered by anything here.
      ...(options.declaration.requiresEnvironment ?? []),
    ],
    literal: { ...canaryWriteRoots(options.runtime), ...options.spec.env },
    source: options.source ?? process.env,
  };
}

/**
 * The argument vector that puts a declared prompt in front of a harness.
 *
 * Derived by substituting the declared prompt into the MEASURED oracle vector
 * rather than restating a second one, so a canary and a discovery run cannot
 * disagree about how a harness is driven. A harness whose measured vector
 * carries no prompt — pi is driven over stdin — returns null, which is a
 * recorded absence and never a guess.
 */
export function canaryPromptArgs(harness: LedgerHarness, prompt: string): readonly string[] | null {
  const definition = ORACLE_DEFINITIONS[harness];
  if (definition === null || definition === undefined) return null;
  if (!definition.args.includes(ORACLE_PLACEHOLDER_PROMPT)) return null;
  return definition.args.map((argument) => (argument === ORACLE_PLACEHOLDER_PROMPT ? prompt : argument));
}

/** Exactly what a canary launcher is handed. */
export interface CanaryLaunch {
  readonly spec: IsolationLaunchSpec;
  readonly args: readonly string[];
  readonly environment: Record<string, string>;
  readonly cwd: string;
  readonly prompt: string;
}

/** What a launch reported. Output is evidence about the run, never about the axis. */
export interface CanaryLaunchOutcome {
  readonly ran: boolean;
  /** Why it did not run cleanly. Null when it did. */
  readonly reason: string | null;
  readonly exitCode: number | null;
  /** The bounded, redacted stdout excerpt. */
  readonly excerpt: RedactedExcerpt | null;
  /** The bounded, redacted stderr excerpt, when the launcher captured one. */
  readonly stderr?: RedactedExcerpt | null;
}

export type CanaryLauncher = (launch: CanaryLaunch) => Promise<CanaryLaunchOutcome>;

/**
 * The real launcher: every launch goes through the bounded process adapter.
 *
 * `excerptBytes` is set DELIBERATELY. The adapter's default is sized for a
 * diagnostic a person reads, and leaving it at that default truncates every
 * real harness invocation into something that looks unreadable.
 */
export function createCanaryLauncher(timeoutMs: number = CANARY_TIMEOUT_MS): CanaryLauncher {
  return async (launch) => {
    const executable = launch.spec.executable;
    if (executable === null) {
      return { ran: false, reason: `${launch.spec.harness} has no resolved executable to launch`, exitCode: null, excerpt: null };
    }
    const direct = resolveDirectLaunch(executable);
    if (direct === null) {
      return {
        ran: false,
        reason:
          `${launch.spec.harness} resolved to an interpreted shim with no proven direct equivalent, and alpha-AOS ` +
          "does not shell out",
        exitCode: null,
        excerpt: null,
      };
    }
    const result = await runProcess({
      executable: direct.executable,
      args: [...direct.argsPrefix, ...launch.args],
      cwd: launch.cwd,
      timeoutMs,
      excerptBytes: CANARY_EXCERPT_BYTES,
      environment: { literal: launch.environment },
    });
    return {
      ran: result.code === "ok",
      reason:
        result.code === "ok"
          ? null
          : `the ${launch.spec.harness} canary did not complete cleanly (${result.code}, exit ${String(result.exitCode)})`,
      exitCode: result.exitCode,
      excerpt: result.stdout,
      stderr: result.stderr,
    };
  };
}

// --- The run ---------------------------------------------------------------

/** Builds the launch spec a canary run uses. Injectable so the suite stays offline. */
export type CanaryLaunchSpecBuilder = (options: {
  readonly harness: LedgerHarness;
  readonly runtime: CanaryRuntime;
  readonly projectRoot: string;
}) => IsolationLaunchSpec;

/**
 * The canary variant of the ONE launch spec builder.
 *
 * `project-only` rather than `managed`, because a canary that inherited the
 * user's global configuration would be measuring the user's machine rather than
 * the project's pack.
 */
export const createCanaryLaunchSpec: CanaryLaunchSpecBuilder = ({ harness, runtime, projectRoot }) =>
  createIsolationLaunchSpec({
    projectId: runtime.projectId,
    projectRoot,
    harness: harness as HarnessId,
    policy: defaultIsolationPolicy("project-only", [harness as HarnessId]),
    runtimeRoot: runtime.root,
    allowedSkillPaths: [],
    canary: { mcpConfigPath: runtime.mcpConfigPath },
  });

export interface RunCanaryOptions {
  readonly declaration: CanaryDeclaration;
  readonly harness: LedgerHarness;
  readonly projectRoot: string;
  readonly runtime: CanaryRuntime;
  readonly sink: CanaryObservationSink;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  /** A report the caller already took. Otherwise this run takes its own. */
  readonly readiness?: ReadinessReport;
  readonly runner?: ReadinessRunner;
  readonly launcher?: CanaryLauncher;
  readonly buildLaunchSpec?: CanaryLaunchSpecBuilder;
  readonly model?: string | null;
  readonly context?: ExecutionContext;
}

/** Everything one canary run established, and how. */
export interface CanaryRunResult {
  readonly canary: string;
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly outcome: CanaryOutcome;
  /** The native-use axis. `unverified` whenever the run did not prove use. */
  readonly nativeUse: NativeUseState;
  readonly verdict: InvocationVerdict;
  readonly observations: readonly McpObservation[];
  readonly readiness: ReadinessReport;
  readonly identity: HarnessIdentity;
  readonly blockedReasons: readonly BlockedReason[];
  readonly unverifiedReason: string | null;
  readonly launched: boolean;
  readonly exitCode: number | null;
  /**
   * Bounded, redacted evidence about the RUN, for diagnosis.
   *
   * Never consulted to decide the invocation axis. D-01 makes model output text
   * inadmissible as proof, and a field that is read for diagnosis and also for
   * the verdict is a field nobody can tell apart afterwards.
   */
  readonly excerpt: RedactedExcerpt | null;
  /**
   * What ran and what came back, as FINGERPRINTS.
   *
   * The shape the ledger takes, so a canary and a discovery run record through
   * one vocabulary. Null when nothing launched: a refused run has no oracle
   * record, and inventing one would put a proof in the ledger for a run that
   * never happened (T-03-20).
   */
  readonly oracle: OracleRecord | null;
  readonly runtimeRoot: string;
  readonly ownedInstructionIds: readonly string[];
  readonly costsModelTurn: boolean;
  readonly launchArgs: readonly string[];
}

function blockedResult(options: {
  readonly declaration: CanaryDeclaration;
  readonly harness: LedgerHarness;
  readonly runtime: CanaryRuntime;
  readonly readiness: ReadinessReport;
  readonly blockedReasons: readonly BlockedReason[];
  readonly observations: readonly McpObservation[];
}): CanaryRunResult {
  return {
    canary: options.declaration.id,
    capability: options.declaration.capability,
    harness: options.harness,
    outcome: "blocked",
    nativeUse: "unverified",
    verdict: decideInvocation(options.declaration, options.observations),
    observations: options.observations,
    readiness: options.readiness,
    identity: options.readiness.identity,
    blockedReasons: options.blockedReasons,
    unverifiedReason: null,
    launched: false,
    exitCode: null,
    excerpt: null,
    oracle: null,
    runtimeRoot: options.runtime.root,
    ownedInstructionIds: options.runtime.ownedInstructionIds,
    costsModelTurn: canaryCostsModelTurn(options.declaration),
    launchArgs: [],
  };
}

/**
 * Runs one declared canary through one canary runtime.
 *
 * The order is the whole design. Everything that can refuse for free refuses
 * first — the readiness pre-probe, then the observation sink, then the proof
 * that this harness can even be pointed at the observation front — and only
 * then does anything launch. A canary that runs and cannot say what it saw has
 * spent a model turn to produce a result nobody can interpret.
 */
export async function runCanary(options: RunCanaryOptions): Promise<CanaryRunResult> {
  const { declaration, harness, runtime, sink } = options;
  assertCanaryContext(options.context ?? "canary", "runCanary");
  // A runtime is single-use. A second run through one would compute its verdict
  // from the first run's records, which is the same defect as reading another
  // run's evidence — and it would be invisible, because the records look
  // exactly like records this run produced.
  await assertRuntimeUnconsumed(runtime);

  const readiness =
    options.readiness ??
    (await probeReadiness({
      harness,
      canary: declaration,
      environment: options.environment ?? process.env,
      ...(options.runner === undefined ? {} : { runner: options.runner }),
      ...(options.model === undefined ? {} : { model: options.model }),
      cwd: options.projectRoot,
    }));

  if (!readiness.ready) {
    return blockedResult({ declaration, harness, runtime, readiness, blockedReasons: readiness.blockedReasons, observations: [] });
  }

  if (!(await sink.ready())) {
    return blockedResult({
      declaration,
      harness,
      runtime,
      readiness,
      observations: [],
      blockedReasons: [
        {
          code: "OBSERVATION_SINK_UNAVAILABLE",
          variable: sink.name,
          nextAction:
            `The canary runtime's observation record could not be reached, so the run was refused before it launched ` +
            `${harness}. Re-create the runtime with \`alpha-aos doctor --canary\`; a run that produces no observation ` +
            "cannot be told apart from a capability that was never selected.",
        },
      ],
    });
  }

  const spec = (options.buildLaunchSpec ?? createCanaryLaunchSpec)({ harness, runtime, projectRoot: options.projectRoot });
  if (spec.blockedReasons.length > 0) {
    return blockedResult({
      declaration,
      harness,
      runtime,
      readiness,
      observations: [],
      blockedReasons: spec.blockedReasons.map((reason) => ({
        code: "HARNESS_ISOLATION_UNPROVEN",
        variable: harness,
        nextAction: `${reason}. A canary is refused rather than run unisolated, because a run that may have reached the user's own servers proves nothing about the project's pack.`,
      })),
    });
  }

  const promptArgs = canaryPromptArgs(harness, declaration.prompt);
  if (promptArgs === null) {
    return blockedResult({
      declaration,
      harness,
      runtime,
      readiness,
      observations: [],
      blockedReasons: [
        {
          code: "HARNESS_PROMPT_VECTOR_UNKNOWN",
          variable: harness,
          nextAction:
            `No measured non-interactive argument vector puts a prompt in front of ${harness}, so this canary cannot ` +
            "be run on it. Declare the canary for a harness that has one, or measure a vector before naming it here.",
        },
      ],
    });
  }

  const launch: CanaryLaunch = {
    spec,
    args: [...spec.args, ...promptArgs],
    environment: materializeEnvironment(
      canaryEnvironmentPolicy({
        declaration,
        spec,
        runtime,
        source: (options.environment as NodeJS.ProcessEnv | undefined) ?? process.env,
      }),
    ),
    cwd: options.projectRoot,
    prompt: declaration.prompt,
  };

  // The last two things checked before anything is spent, and both are about
  // the boundary rather than about the user: the harness must be pointed at
  // this runtime and nothing else, and the child must receive nothing the
  // platform floor and this canary's own declaration did not name.
  assertCanaryLaunchIsolation(launch.environment, runtime);
  assertCanaryEnvironmentDeclared(launch.environment, canaryEnvironmentNames({ declaration, spec, runtime }));
  await markRuntimeConsumed(runtime);

  const outcome = await (options.launcher ?? createCanaryLauncher())(launch);
  const observations = await sink.read();
  const verdict = decideInvocation(declaration, observations);
  const disposition = disposeCanary(readiness, outcome.ran ? null : outcome.reason);

  return {
    canary: declaration.id,
    capability: declaration.capability,
    harness,
    outcome: disposition.outcome,
    // A run that did not complete cleanly proves nothing about use, whatever
    // the records happen to contain.
    nativeUse: disposition.outcome === "ready" ? verdict.nativeUse : "unverified",
    verdict,
    observations,
    readiness,
    identity: readiness.identity,
    blockedReasons: disposition.blockedReasons,
    unverifiedReason: disposition.unverifiedReason,
    launched: true,
    exitCode: outcome.exitCode,
    excerpt: outcome.excerpt,
    oracle: {
      // Aliased before it is recorded: this string is persisted into the
      // ledger, and a resolved harness path routinely sits under the user's
      // home directory.
      command: [aliasPath(spec.executable ?? harness, createPathAliases()), ...launch.args].join(" "),
      exitCode: outcome.exitCode,
      stdoutFingerprint: outcome.excerpt?.sha256 ?? "",
      stderrFingerprint: outcome.stderr?.sha256 ?? "",
    },
    runtimeRoot: runtime.root,
    ownedInstructionIds: runtime.ownedInstructionIds,
    costsModelTurn: canaryCostsModelTurn(declaration),
    launchArgs: launch.args,
  };
}

// ---------------------------------------------------------------------------
// The planning-tree immutability check (plan 03-12 Task 2)
// ---------------------------------------------------------------------------
//
// 03-CONTEXT.md D-16: CAPA-03's boundary is proven by a handoff canary PLUS an
// immutability check — the positive (a handoff really happened) and the negative
// (memory did not become authoritative project policy) in one run. This is the
// negative half, and its scope limit is explicit: alpha-AOS proves the state of
// the planning tree. It does NOT police what the memory tool does elsewhere on
// the filesystem, because doing that would require being an invocation proxy for
// every tool call — the thing PROJECT.md's key decision rules out.
//
// The function reads only. A check that modified the thing it measures would be
// worse than no check, so a named test asserts the tree's bytes AND its
// modification times are identical after a call.

/** One file under the tree, as a relative POSIX path and the hash of its bytes. */
export interface PlanningTreeFile {
  readonly path: string;
  readonly sha256: string;
}

/** A path under the tree that could not be read, with the errno that says why. */
export interface PlanningTreeUnreadable {
  readonly path: string;
  /**
   * The host's errno, or `NOT_A_REGULAR_FILE` for an entry that is neither a
   * directory nor a regular file. A symbolic link is deliberately in the second
   * group: following one would hash bytes from outside the root the caller
   * named, which is the opposite of what a boundary check is for.
   */
  readonly errno: string;
}

/**
 * A digest over a whole tree, and everything that stops it being an answer.
 *
 * `digest` is null whenever `complete` is false. That is the load-bearing rule:
 * an aggregate computed over a partial set would let a change inside the skipped
 * file pass the immutability check, which is the ONE thing this function exists
 * to prevent. The same reasoning `scanProjectTree` already applies to an
 * unreadable evidence file, one layer down.
 */
export interface PlanningTreeDigest {
  /** The canonical root that was actually walked, aliased for reporting. */
  readonly root: string;
  readonly digest: string | null;
  readonly complete: boolean;
  /** Sorted by relative POSIX path in code-point order, so two hosts agree. */
  readonly files: readonly PlanningTreeFile[];
  readonly unreadable: readonly PlanningTreeUnreadable[];
  /** True when the root does not exist at all — a complete answer, not a failure. */
  readonly rootPresent: boolean;
  /** A bound that stopped the walk. EMPTY means the scan was COMPLETE. */
  readonly bounds: readonly string[];
}

/** What moved between two digests, named path by path. */
export interface PlanningTreeDifference {
  readonly equal: boolean;
  /** False when either side is incomplete: two partial sets cannot be compared. */
  readonly comparable: boolean;
  readonly modified: readonly string[];
  readonly added: readonly string[];
  readonly removed: readonly string[];
  /** Why the pair is not equal, or not comparable. Empty when it is both. */
  readonly reasons: readonly string[];
}

/** Mirrors MAX_SCAN_DEPTH's reasoning: a bound reached is RECORDED, never silent. */
export const PLANNING_TREE_MAX_DEPTH = 24;

/** A planning tree is documents. Fifty thousand entries is already pathological. */
export const PLANNING_TREE_MAX_ENTRIES = 50_000;

function planningErrno(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : "UNKNOWN";
}

/**
 * Hashes every regular file under `root`, reading and writing nothing else.
 *
 * Two decisions carry the whole design:
 *
 * - **Relative POSIX paths, sorted in code-point order.** The absolute root, the
 *   host's separator and the order a directory happens to enumerate in are all
 *   host facts, and folding any of them in would make two hosts disagree about
 *   identical content. This is the discipline that made the plan digest
 *   host-independent in Phase 2, applied to a tree.
 * - **An unreadable path withholds the aggregate.** `digest` is null the moment
 *   anything under the tree could not be read. A digest that silently skipped a
 *   file would let a change INSIDE that file pass the immutability check, and
 *   preventing exactly that is the only reason this function exists.
 *
 * A symbolic link is not followed. `readFile` through a link would hash bytes
 * from outside the root the caller named, which would turn a boundary check into
 * a boundary hole; a link is therefore recorded as unreadable with its errno (or
 * `NOT_A_REGULAR_FILE`) and the digest is incomplete, which is the fail-closed
 * direction.
 */
export async function hashPlanningTree(root: string): Promise<PlanningTreeDigest> {
  const resolution = await canonicalizeWithMissingTail(resolve(root));
  const canonical = resolution.reason === null ? resolution.canonical : resolve(root);
  const aliasedRoot = aliasPath(canonical, createPathAliases());

  const files: PlanningTreeFile[] = [];
  const unreadable: PlanningTreeUnreadable[] = [];
  const bounds: string[] = [];
  let entriesSeen = 0;
  let rootPresent = true;

  const relativePosix = (absolutePath: string): string => relative(canonical, absolutePath).split("\\").join("/");

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > PLANNING_TREE_MAX_DEPTH) {
      bounds.push(`PLANNING_TREE_MAX_DEPTH (${PLANNING_TREE_MAX_DEPTH}) reached at ${relativePosix(directory) || "."}`);
      return;
    }
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      const code = planningErrno(error);
      if (directory === canonical && code === "ENOENT") {
        rootPresent = false;
        return;
      }
      unreadable.push({ path: relativePosix(directory) || ".", errno: code });
      return;
    }

    // Sorted here as well as at the end: a stable walk order keeps the bound
    // messages deterministic, which is what makes a truncated scan reproducible.
    const sorted = [...entries].sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of sorted) {
      entriesSeen += 1;
      if (entriesSeen > PLANNING_TREE_MAX_ENTRIES) {
        if (bounds.length === 0) bounds.push(`PLANNING_TREE_MAX_ENTRIES (${PLANNING_TREE_MAX_ENTRIES}) reached`);
        return;
      }
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath, depth + 1);
        continue;
      }
      if (!entry.isFile()) {
        // A link, socket or device. Read it only to obtain the host's own errno
        // where there is one; a link that WOULD have resolved is still refused,
        // because following it leaves the root.
        let errno = "NOT_A_REGULAR_FILE";
        try {
          await readFile(absolutePath);
        } catch (error) {
          errno = planningErrno(error);
        }
        unreadable.push({ path: relativePosix(absolutePath), errno });
        continue;
      }
      try {
        const bytes = await readFile(absolutePath);
        files.push({ path: relativePosix(absolutePath), sha256: createHash("sha256").update(bytes).digest("hex") });
      } catch (error) {
        unreadable.push({ path: relativePosix(absolutePath), errno: planningErrno(error) });
      }
    }
  }

  if (resolution.reason !== null) {
    unreadable.push({ path: ".", errno: "UNRESOLVABLE_ROOT" });
  } else {
    await walk(canonical, 0);
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  unreadable.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  const complete = unreadable.length === 0 && bounds.length === 0;

  return {
    root: aliasedRoot,
    // Withheld, not approximated. See the doc comment above.
    digest: complete
      ? createHash("sha256")
          .update(files.map((entry) => `${entry.path}\u0000${entry.sha256}`).join("\n"))
          .digest("hex")
      : null,
    complete,
    files,
    unreadable,
    rootPresent,
    bounds,
  };
}

/**
 * Says WHICH paths differ between two digests, not merely that they differ.
 *
 * A report that the planning tree changed without naming the file is not
 * actionable, and naming it is what turns this check from an assertion into
 * evidence. Two incomplete digests are never reported equal: agreeing about the
 * files both of them managed to read says nothing about the file neither did.
 */
export function comparePlanningTrees(
  before: PlanningTreeDigest,
  after: PlanningTreeDifferenceInput,
): PlanningTreeDifference {
  const reasons: string[] = [];
  const comparable = before.complete && after.complete;
  if (!before.complete) {
    reasons.push(
      `the earlier digest is incomplete (${before.unreadable.length} unreadable path(s), ${before.bounds.length} bound(s) ` +
        "reached), so it cannot be compared",
    );
  }
  if (!after.complete) {
    reasons.push(
      `the later digest is incomplete (${after.unreadable.length} unreadable path(s), ${after.bounds.length} bound(s) ` +
        "reached), so it cannot be compared",
    );
  }

  const beforeByPath = new Map(before.files.map((entry) => [entry.path, entry.sha256]));
  const afterByPath = new Map(after.files.map((entry) => [entry.path, entry.sha256]));
  const modified: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  for (const [path, hash] of beforeByPath) {
    const now = afterByPath.get(path);
    if (now === undefined) removed.push(path);
    else if (now !== hash) modified.push(path);
  }
  for (const path of afterByPath.keys()) {
    if (!beforeByPath.has(path)) added.push(path);
  }
  modified.sort();
  added.sort();
  removed.sort();

  for (const path of modified) reasons.push(`modified: ${path}`);
  for (const path of added) reasons.push(`added: ${path}`);
  for (const path of removed) reasons.push(`removed: ${path}`);

  return {
    equal: comparable && modified.length === 0 && added.length === 0 && removed.length === 0,
    comparable,
    modified,
    added,
    removed,
    reasons,
  };
}

/** The digest fields a comparison reads. Named so a caller cannot pass half of one. */
type PlanningTreeDifferenceInput = PlanningTreeDigest;

// ---------------------------------------------------------------------------
// The handoff canary — one run, both halves (plan 03-12 Task 3)
// ---------------------------------------------------------------------------

/** The declared handoff canary's id, so the CLI and the catalog cannot drift. */
export const HANDOFF_CANARY_ID = "CROSS_HARNESS_HANDOFF";

/** The capability the handoff canary is evidence for. */
export const HANDOFF_CAPABILITY = "CAPA-03";

/** Where the planning tree lives, relative to a project root. */
export const PLANNING_DIRECTORY = ".planning";

/**
 * Short, DECLARED names for a capability route, so `--capability handoff`
 * resolves to something a reader can look up rather than to a magic string
 * matched inside a command branch.
 */
export const CANARY_CAPABILITY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  handoff: HANDOFF_CAPABILITY,
});

/** Resolves a `--capability` value through the declared aliases. Case-insensitive. */
export function resolveCapabilityFilter(filter: string | null): string | null {
  if (filter === null) return null;
  return CANARY_CAPABILITY_ALIASES[filter.toLowerCase()] ?? filter;
}

/**
 * What this canary proves and, just as importantly, what it does not.
 *
 * Recorded on the result and on the ledger row rather than left in a comment,
 * because a reader who is told only the positive will read the check as broader
 * than it is. 03-CONTEXT.md D-16 draws this line explicitly.
 */
export const HANDOFF_SCOPE_LIMIT =
  "alpha-AOS proved the state of the project's planning tree across the round trip, byte for byte. It did NOT observe " +
  "or restrict what the memory tool did elsewhere on the filesystem: policing that would require being an invocation " +
  "proxy for every tool call, which PROJECT.md's control-plane decision and 03-CONTEXT.md D-02 rule out.";

/** A source harness that writes a handoff and a target harness that receives it. */
export interface HandoffPair {
  readonly source: LedgerHarness;
  readonly target: LedgerHarness;
  readonly why: string;
}

/**
 * The declared pairs, preferred first.
 *
 * The TARGET is claude in both, and that is not a preference: only claude has
 * the two strict MCP-isolation flags a canary runtime needs (plan 03-06), so
 * every other harness's canary launch is a recorded blocked reason. The SOURCE
 * is where 03-RESEARCH.md's Environment Availability table has a choice — it
 * names hermes as the CAPA-03 handoff peer and `claude<->codex` as the fallback.
 */
export const HANDOFF_HARNESS_PAIRS: readonly HandoffPair[] = Object.freeze([
  {
    source: "hermes",
    target: "claude",
    why: "03-RESEARCH.md Environment Availability names hermes as the CAPA-03 handoff peer",
  },
  {
    source: "codex",
    target: "claude",
    why: "the fallback the same table names when the handoff peer is unavailable: claude <-> codex",
  },
]);

/** One pair that was considered, and whether each end of it resolved. */
export interface HandoffPairCandidate {
  readonly pair: HandoffPair;
  readonly sourceResolved: boolean;
  readonly targetResolved: boolean;
}

export interface HandoffPairResolution {
  readonly pair: HandoffPair | null;
  /** Every pair considered, in declaration order. A choice nobody can audit is a guess. */
  readonly considered: readonly HandoffPairCandidate[];
  readonly blockedReasons: readonly BlockedReason[];
}

/**
 * Picks the first declared pair whose BOTH ends resolve on PATH.
 *
 * A host that cannot run two harnesses records `blocked` naming the requirement
 * and the run is not attempted — a handoff canary with one harness would be
 * measuring a harness talking to itself.
 */
export function resolveHandoffPair(
  options: {
    readonly resolveHarness?: (harness: LedgerHarness) => string | null;
    readonly source?: LedgerHarness | null;
    readonly target?: LedgerHarness | null;
  } = {},
): HandoffPairResolution {
  const resolveHarness = options.resolveHarness ?? ((harness: LedgerHarness) => resolveCommand(HARNESS_COMMANDS[harness]));
  const declared =
    options.source != null && options.target != null
      ? [{ source: options.source, target: options.target, why: "the pair the caller named explicitly" }]
      : HANDOFF_HARNESS_PAIRS;

  const considered: HandoffPairCandidate[] = [];
  for (const pair of declared) {
    if (pair.source === pair.target) {
      considered.push({ pair, sourceResolved: false, targetResolved: false });
      continue;
    }
    const candidate: HandoffPairCandidate = {
      pair,
      sourceResolved: resolveHarness(pair.source) !== null,
      targetResolved: resolveHarness(pair.target) !== null,
    };
    considered.push(candidate);
    if (candidate.sourceResolved && candidate.targetResolved) {
      return { pair, considered, blockedReasons: [] };
    }
  }

  return {
    pair: null,
    considered,
    blockedReasons: [
      {
        code: "HANDOFF_PAIR_UNAVAILABLE",
        variable: considered.map((entry) => `${entry.pair.source}->${entry.pair.target}`).join(", "),
        nextAction:
          "A cross-harness handoff needs TWO harnesses with non-interactive entrypoints on PATH, and the receiving one " +
          "must be a harness a canary runtime can isolate. Install one of the declared pairs above, or name a pair " +
          "explicitly with --harness, and re-run. The run was not attempted: a handoff measured with one harness would " +
          "be a harness talking to itself.",
      },
    ],
  };
}

/** The body alpha-AOS hands over. Ordinary working context, and nothing sensitive. */
export const HANDOFF_BODY_TEMPLATE = [
  "Handed over mid-task by the source harness named on this memory.",
  "",
  "What was already decided: the next step is to re-read the project's own planning documents",
  "before proposing anything new, because the decision that matters was recorded there and not",
  "in this note. Do not write to the planning tree; it belongs to the project's lifecycle tool.",
  "",
  "This memory was written by alpha-AOS as a cross-harness handoff canary. It is unreviewed",
  "context, never policy.",
].join("\n");

/** Everything one handoff canary established, and how. */
export interface HandoffCanaryResult {
  readonly canary: string;
  readonly capability: string;
  readonly pair: HandoffPair | null;
  readonly pairResolution: HandoffPairResolution;
  readonly harnessVersions: { readonly source: string | null; readonly target: string | null };
  /** The vault's memory count before and after the write. Null when it could not be read. */
  readonly vaultBefore: number | null;
  readonly vaultAfter: number | null;
  readonly sentinelTitle: string | null;
  readonly writtenMemoryId: string | null;
  readonly writtenPath: string | null;
  /** Whether the target-filtered recall returned the sentinel title. Null when not reached. */
  readonly recalled: boolean | null;
  readonly recallCount: number | null;
  /** The first vault refusal, if any. Recorded rather than collapsed into "it failed". */
  readonly vaultRefusal: MemoryRefusal | null;
  readonly planningBefore: PlanningTreeDigest | null;
  readonly planningAfter: PlanningTreeDigest | null;
  readonly planningDifference: PlanningTreeDifference | null;
  /** The receiving harness's run, or null when the paid leg was not attempted. */
  readonly receiving: CanaryRunResult | null;
  readonly receivingSkippedReason: string | null;
  readonly positive: CapabilityProof | null;
  readonly negative: CapabilityProof | null;
  readonly unit: EvidenceUnit | null;
  readonly outcome: CanaryOutcome;
  readonly blockedReasons: readonly BlockedReason[];
  readonly scopeLimit: string;
}

export interface RunHandoffCanaryOptions {
  readonly declaration: CanaryDeclaration;
  readonly projectRoot: string;
  /** Defaults to `<projectRoot>/.planning`. */
  readonly planningRoot?: string;
  readonly source?: LedgerHarness | null;
  readonly target?: LedgerHarness | null;
  readonly projectId?: string | null;
  readonly boundInputs?: BoundInputs;
  readonly harnessVersions?: Readonly<Partial<Record<LedgerHarness, HarnessVersion>>>;
  readonly memoryRunner?: MemoryRunner;
  readonly resolveHarness?: (harness: LedgerHarness) => string | null;
  /**
   * Runs the receiving harness against the declared prompt.
   *
   * OMITTED BY DEFAULT, and that is the cost decision made explicit: this is the
   * only leg of the canary that spends a model turn. Every other step — the
   * baseline, the write, the filtered recall and both planning-tree digests — is
   * deterministic and offline, so the free half of D-16 runs anywhere.
   */
  readonly receive?: ((pair: HandoffPair) => Promise<CanaryRunResult>) | null;
  /** Supplied by a caller that wants a reproducible sentinel; otherwise fresh. */
  readonly sentinel?: string;
  readonly now?: () => Date;
  readonly context?: ExecutionContext;
}

/**
 * The digest over an EMPTY set of pack skills.
 *
 * `boundInputs.skillSourceHash` is a sha256 by contract, and an empty string is
 * not one: a proof carrying `""` is writable and then UNREADABLE, so the command
 * that wrote it bricks its own ledger on the next run. That is the defect plan
 * 03-08 found in `harnessVersion.raw` and fixed there; this is the same shape one
 * field over, and it had never surfaced only because no canary proof had ever
 * been written.
 *
 * The honest value is the digest of the empty set, which is what
 * `packSkillSourceHash([])` computes. A capability that binds to no pack skill —
 * CAPA-03 binds to the memory vault, not to a skill — keeps that value across
 * runs, so `resolveNativeUse` never demotes it for a change that did not happen.
 */
export const NO_PACK_SKILL_SOURCE_HASH = createHash("sha256").update("").digest("hex");

export const EMPTY_BOUND_INPUTS: BoundInputs = Object.freeze({
  skillSourceHash: NO_PACK_SKILL_SOURCE_HASH,
  mcpServerVersion: null,
  evidenceHash: null,
});

const NO_HARNESS_VERSION: HarnessVersion = Object.freeze({ exact: null, minorKey: null, raw: "" });

function handoffRefusalReason(refusal: MemoryRefusal): BlockedReason {
  return refusal.state === "unsupported"
    ? {
        code: "MEMORY_VAULT_UNAVAILABLE",
        variable: MEMORY_COMMAND,
        nextAction:
          `${refusal.reason}. CAPA-03 is a claim about the Memory Vault, so there is no fallback: install the vault ` +
          "runtime and re-run. Nothing was written and nothing was proven.",
      }
    : {
        code: "MEMORY_VAULT_UNREADABLE",
        variable: refusal.code,
        nextAction:
          `${refusal.reason}. A vault whose answer this build cannot read is a different fact from a vault that is ` +
          "absent, and it is reported rather than treated as an empty one.",
      };
}

/**
 * Runs the cross-harness handoff canary: the positive and the negative in ONE
 * run.
 *
 * The sequence is 03-RESEARCH.md Pattern 5's, in its order, and the order is the
 * design. Both planning-tree digests bracket everything the vault does, so the
 * immutability claim covers the whole round trip rather than a moment inside it.
 *
 * The write is made BY alpha-AOS on the source harness's behalf, through the
 * vault's own `--from` attribution, rather than by driving the source harness
 * through a model turn. That is deliberate: driving it would spend a second turn
 * and would prove nothing extra about the boundary D-16 is asking about, and
 * RESEARCH.md records every step except "the receiving harness is asked" as
 * deterministic and offline for exactly that reason. The summary says so rather
 * than letting a reader assume two model turns happened.
 */
export async function runHandoffCanary(options: RunHandoffCanaryOptions): Promise<HandoffCanaryResult> {
  assertCanaryContext(options.context ?? "canary", "runHandoffCanary");

  const declaration = options.declaration;
  const projectRoot = resolve(options.projectRoot);
  const planningRoot = options.planningRoot ?? join(projectRoot, PLANNING_DIRECTORY);
  const runner = options.memoryRunner ?? createMemoryRunner();
  const versions = options.harnessVersions ?? {};
  const now = options.now ?? (() => new Date());

  const pairResolution = resolveHandoffPair({
    ...(options.resolveHarness === undefined ? {} : { resolveHarness: options.resolveHarness }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.target === undefined ? {} : { target: options.target }),
  });

  const base = {
    canary: declaration.id,
    capability: declaration.capability,
    pair: pairResolution.pair,
    pairResolution,
    harnessVersions: {
      source: pairResolution.pair === null ? null : versions[pairResolution.pair.source]?.exact ?? null,
      target: pairResolution.pair === null ? null : versions[pairResolution.pair.target]?.exact ?? null,
    },
    scopeLimit: HANDOFF_SCOPE_LIMIT,
  } as const;

  const refused = (blockedReasons: readonly BlockedReason[], extra: Partial<HandoffCanaryResult> = {}): HandoffCanaryResult => ({
    ...base,
    vaultBefore: null,
    vaultAfter: null,
    sentinelTitle: null,
    writtenMemoryId: null,
    writtenPath: null,
    recalled: null,
    recallCount: null,
    vaultRefusal: null,
    planningBefore: null,
    planningAfter: null,
    planningDifference: null,
    receiving: null,
    receivingSkippedReason: null,
    positive: null,
    negative: null,
    unit: null,
    outcome: "blocked",
    blockedReasons,
    ...extra,
  });

  if (pairResolution.pair === null) {
    return refused(pairResolution.blockedReasons);
  }
  const pair = pairResolution.pair;

  // 1. The vault baseline, taken in THIS run. Never an absolute count: a
  //    developer host with existing memories changes the arithmetic, so the
  //    claim is always "increased by exactly one" against a baseline just taken.
  const before = await memoryDoctor({ cwd: projectRoot, runner });
  if (before.state !== "ok") {
    return refused([handoffRefusalReason(before)], { vaultRefusal: before });
  }

  // 2. The planning tree BEFORE anything the vault does.
  const planningBefore = await hashPlanningTree(planningRoot);

  // 3. The handoff, with a sentinel title unique to this run.
  const sentinelTitle = options.sentinel ?? `ALPHA-AOS-HANDOFF-CANARY-${randomUUID()}`;
  const written = await memoryHandoff({
    cwd: projectRoot,
    runner,
    source: pair.source,
    target: pair.target,
    title: sentinelTitle,
    body: HANDOFF_BODY_TEMPLATE,
  });

  // 4. The count after, and the target-filtered recall. Both are read even when
  //    the write refused, because the planning tree must still be re-hashed: a
  //    failed write that moved `.planning/` is precisely the event D-16 is about.
  const after = written.state === "ok" ? await memoryDoctor({ cwd: projectRoot, runner }) : before;
  const recall =
    written.state === "ok" ? await memorySearch({ cwd: projectRoot, runner, targetHarness: pair.target }) : null;
  const recalledTitles = recall?.state === "ok" ? recall.value.results.map((entry) => entry.title) : [];
  const recalled = recall === null ? null : recall.state === "ok" && recalledTitles.includes(sentinelTitle);

  // 5. The receiving harness. The one leg that spends.
  let receiving: CanaryRunResult | null = null;
  let receivingSkippedReason: string | null = null;
  if (options.receive == null) {
    receivingSkippedReason =
      `the receiving leg drives ${pair.target} with the declared prompt and spends a model turn, and it was not ` +
      "requested; every other leg of this canary is deterministic and offline";
  } else {
    receiving = await options.receive(pair);
  }

  // 6. The planning tree AFTER. Bracketing everything above is what makes the
  //    immutability claim about the round trip rather than about a moment.
  const planningAfter = await hashPlanningTree(planningRoot);
  const planningDifference = comparePlanningTrees(planningBefore, planningAfter);

  const vaultBefore = before.value.memoryCount;
  const vaultAfter = after.state === "ok" ? after.value.memoryCount : null;
  const grewByExactlyOne = vaultAfter !== null && vaultAfter - vaultBefore === 1;
  const vaultRefusal: MemoryRefusal | null =
    written.state !== "ok" ? written : after.state !== "ok" ? after : recall !== null && recall.state !== "ok" ? recall : null;

  const observedAt = now().toISOString();
  const witness: ImmutabilityWitness = {
    asserted: planningDifference.equal && planningBefore.complete && planningAfter.complete,
    root: planningBefore.root,
    beforeDigest: planningBefore.digest,
    afterDigest: planningAfter.digest,
    complete: planningBefore.complete && planningAfter.complete,
    changedPaths: [...planningDifference.modified, ...planningDifference.added, ...planningDifference.removed],
    scopeLimit: HANDOFF_SCOPE_LIMIT,
  };

  const negative: CapabilityProof = {
    projectId: options.projectId ?? null,
    harness: pair.target,
    capability: declaration.capability,
    polarity: "negative",
    // The negative half's own axis says nothing about use: it is a claim that
    // the planning tree did not move, and `unverified` is the honest value for
    // an axis this half did not measure.
    nativeUse: "unverified",
    blockedReason: null,
    boundInputs: options.boundInputs ?? EMPTY_BOUND_INPUTS,
    harnessVersion: versions[pair.target] ?? NO_HARNESS_VERSION,
    ancestorFreedom: null,
    immutabilityWitness: witness,
    observedAt,
    oracle: {
      command: `${MEMORY_COMMAND} memory handoff --from ${pair.source} --target ${pair.target} (planning-tree digest, before and after)`,
      exitCode: 0,
      stdoutFingerprint: createHash("sha256").update(planningBefore.digest ?? "incomplete").digest("hex"),
      stderrFingerprint: createHash("sha256").update(planningAfter.digest ?? "incomplete").digest("hex"),
    },
  };

  // The positive exists only when the handoff really happened: written, counted,
  // and returned by the RECEIVING harness's own filter. Anything short of that
  // is the absence of a positive, and inventing one would put a proof in the
  // ledger for something no run established (T-03-20).
  const positive: CapabilityProof | null =
    written.state === "ok" && grewByExactlyOne && recalled === true
      ? {
          projectId: options.projectId ?? null,
          harness: pair.target,
          capability: declaration.capability,
          polarity: "positive",
          // `discovered`, never `invoked`. The handed-off context is provably
          // there and provably reachable through the target's own filter; that
          // the receiving MODEL worked from it is a judgement no record makes,
          // and D-01 keeps model output out of the verdict entirely.
          nativeUse: "discovered",
          blockedReason: null,
          boundInputs: options.boundInputs ?? EMPTY_BOUND_INPUTS,
          harnessVersion: versions[pair.target] ?? NO_HARNESS_VERSION,
          ancestorFreedom: null,
          observedAt,
          oracle: {
            command: `${MEMORY_COMMAND} memory search --json --target-harness ${pair.target}`,
            exitCode: 0,
            stdoutFingerprint: createHash("sha256").update(sentinelTitle).digest("hex"),
            stderrFingerprint: createHash("sha256").update(String(recallCountOf(recall))).digest("hex"),
          },
        }
      : null;

  const blockedReasons: BlockedReason[] = [];
  if (vaultRefusal !== null) blockedReasons.push(handoffRefusalReason(vaultRefusal));

  return {
    ...base,
    vaultBefore,
    vaultAfter,
    sentinelTitle,
    writtenMemoryId: written.state === "ok" ? written.value.memory.id : null,
    writtenPath: written.state === "ok" ? written.value.path : null,
    recalled,
    recallCount: recallCountOf(recall),
    vaultRefusal,
    planningBefore,
    planningAfter,
    planningDifference,
    receiving,
    receivingSkippedReason,
    positive,
    negative,
    unit: pairEvidence(positive, negative),
    outcome: blockedReasons.length > 0 ? "blocked" : positive === null ? "unverified" : "ready",
    blockedReasons,
    scopeLimit: HANDOFF_SCOPE_LIMIT,
  };
}

function recallCountOf(recall: MemoryResult<MemorySearchFacts> | null): number | null {
  return recall === null ? null : recall.state === "ok" ? recall.value.results.length : null;
}

// ---------------------------------------------------------------------------
// Two sweeps — the free evidence and the paid evidence, kept apart
// ---------------------------------------------------------------------------
//
// 03-RESEARCH.md Pitfall 10 is why these are two functions rather than two
// outcomes of one: the free sweep belongs in the automated suite on every
// platform, and the paid one is an explicit opt-in that hosted CI cannot run at
// all. A single entry point that decided between them would put a spend behind
// a flag nobody reads.

/** The harnesses a sweep considers. The ledger's narrowed set, in a stable order. */
export const SWEEP_HARNESSES: readonly LedgerHarness[] = Object.freeze(["claude", "codex", "pi", "hermes"]);

/** One harness's leg of a free discovery sweep. */
export interface DiscoverySweepEntry {
  readonly harness: LedgerHarness;
  readonly ran: boolean;
  /** Why this leg was not run. Null when it was. */
  readonly skippedReason: string | null;
  /** Null when the harness has no oracle definition and the cost is underivable. */
  readonly costsModelTurn: boolean | null;
  readonly discovery: PairedDiscovery | null;
  readonly unit: EvidenceUnit | null;
}

export interface DiscoverySweep {
  readonly capability: string;
  readonly entries: readonly DiscoverySweepEntry[];
  readonly units: readonly EvidenceUnit[];
  readonly proofs: readonly CapabilityProof[];
  /** False by construction: a leg that would spend a turn is skipped, not run. */
  readonly costsModelTurn: false;
}

export interface RunDiscoverySweepOptions {
  readonly projectRoot: string;
  readonly controlRoot: string;
  readonly capability: string;
  readonly skillDirectories: readonly string[];
  readonly projectId: string | null;
  readonly boundInputs: BoundInputs;
  readonly harnessVersions: Readonly<Partial<Record<LedgerHarness, HarnessVersion>>>;
  readonly harnesses?: readonly LedgerHarness[];
  /** Injectable so the suite can assert the sweep OFFLINE, on a host with no harness. */
  readonly run?: (options: RunPairedDiscoveryOptions) => Promise<PairedDiscovery>;
  readonly timeoutMs?: number;
}

/** A version line nothing could read is `unverified`, never an invented version. */
const UNKNOWN_HARNESS_VERSION: HarnessVersion = { exact: null, minorKey: null, raw: "" };

/**
 * Runs the FREE paired discovery sweep across every harness with an oracle
 * that spends nothing.
 *
 * A harness whose oracle costs a model turn is SKIPPED with that as the reason,
 * not run: this is the command the automated suite and hosted CI exercise, and
 * it must be true on every platform that it needs no credential and spends
 * nothing. The paid evidence has its own command, and choosing it is the user's
 * act rather than a consequence of running this one.
 */
export async function runDiscoverySweep(options: RunDiscoverySweepOptions): Promise<DiscoverySweep> {
  const drive = options.run ?? runPairedDiscovery;
  const entries: DiscoverySweepEntry[] = [];

  for (const harness of options.harnesses ?? SWEEP_HARNESSES) {
    const definition = ORACLE_DEFINITIONS[harness];
    if (definition === null || definition === undefined) {
      entries.push({
        harness,
        ran: false,
        skippedReason: `no discovery oracle is defined for ${harness}, so there is nothing free to run`,
        costsModelTurn: null,
        discovery: null,
        unit: null,
      });
      continue;
    }
    if (definition.costsModelTurn) {
      entries.push({
        harness,
        ran: false,
        skippedReason:
          `driving ${harness} spends a model turn, and this sweep spends nothing; run \`alpha-aos doctor --canary\` ` +
          "to spend deliberately",
        costsModelTurn: true,
        discovery: null,
        unit: null,
      });
      continue;
    }

    const discovery = await drive({
      harness,
      projectRoot: options.projectRoot,
      controlRoot: options.controlRoot,
      capability: options.capability,
      skillDirectories: options.skillDirectories,
      projectId: options.projectId,
      boundInputs: options.boundInputs,
      harnessVersion: options.harnessVersions[harness] ?? UNKNOWN_HARNESS_VERSION,
      ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    });
    entries.push({
      harness,
      ran: true,
      skippedReason: null,
      costsModelTurn: false,
      discovery,
      unit: discovery.unit,
    });
  }

  const units = entries.map((entry) => entry.unit).filter((unit): unit is EvidenceUnit => unit !== null);
  const proofs = units.flatMap((unit) =>
    [unit.positive, unit.negative].filter((proof): proof is CapabilityProof => proof !== null),
  );
  return { capability: options.capability, entries, units, proofs, costsModelTurn: false };
}

// --- The paid sweep --------------------------------------------------------

/** One canary on one harness, and what running it would spend. */
export interface CanarySelection {
  readonly declaration: CanaryDeclaration;
  readonly harness: LedgerHarness;
  /** Null when the harness has no oracle definition and the cost is underivable. */
  readonly costsModelTurn: boolean | null;
}

/** Every declared canary/harness pair the filters select, in catalog order. */
export function selectCanaries(
  catalog: CanaryCatalog,
  filters: { readonly harness?: LedgerHarness | null; readonly capability?: string | null } = {},
): readonly CanarySelection[] {
  const selections: CanarySelection[] = [];
  for (const declaration of catalog.canaries) {
    if (filters.capability != null && declaration.capability !== filters.capability && declaration.id !== filters.capability) {
      continue;
    }
    for (const cost of canaryCosts(declaration)) {
      if (filters.harness != null && cost.harness !== filters.harness) continue;
      selections.push({ declaration, harness: cost.harness as LedgerHarness, costsModelTurn: cost.costsModelTurn });
    }
  }
  return selections;
}

/**
 * What a sweep would spend, as lines a person reads BEFORE it spends anything.
 *
 * An underivable cost is stated as such and counted as spending, which is the
 * same fail-closed roll-up `canaryCostsModelTurn` applies: the failure mode of
 * the other default is a surprise charge.
 */
export function canaryCostLines(selections: readonly CanarySelection[]): readonly string[] {
  const spending = selections.filter((selection) => selection.costsModelTurn !== false);
  const free = selections.filter((selection) => selection.costsModelTurn === false);
  const lines = [
    `This run would drive ${selections.length} canary/harness pair(s): ${spending.length} spend a model turn, ` +
      `${free.length} do not.`,
  ];
  for (const selection of selections) {
    lines.push(
      `  ${selection.costsModelTurn === false ? "free  " : selection.costsModelTurn === null ? "unknown" : "SPENDS"} ` +
        `${selection.declaration.id} on ${selection.harness}` +
        (selection.costsModelTurn === null ? " (cost not derivable; counted as spending)" : ""),
    );
  }
  return lines;
}

/** A selection the sweep deliberately did not run, and why. */
export interface SkippedCanary {
  readonly selection: CanarySelection;
  readonly reason: string;
}

export interface CanarySweep {
  readonly selections: readonly CanarySelection[];
  readonly costLines: readonly string[];
  readonly results: readonly CanaryRunResult[];
  /** CAPA-03 selections, which are a different shape of run. */
  readonly handoffResults: readonly HandoffCanaryResult[];
  readonly skipped: readonly SkippedCanary[];
}

/**
 * What `--no-spend` records for a leg it did not attempt.
 *
 * `unverified`, never `blocked`: 03-CONTEXT.md D-12 reserves `blocked` for a
 * KNOWN, actionable cause, and "nobody asked to spend" is not something the user
 * has to fix. Reporting it as blocked would send someone hunting for a
 * prerequisite that is not missing.
 */
export const CANARY_NOT_ATTEMPTED_REASON =
  "not attempted: this leg spends a model turn and the run was asked not to spend. Re-run without --no-spend to " +
  "spend deliberately; nothing here is missing or misconfigured.";

/** Printed with the cost lines, so a no-spend run announces itself before it starts. */
export const CANARY_NO_SPEND_NOTICE =
  "  --no-spend: every leg above that spends a model turn will be recorded `unverified` (not attempted) instead of run.";

export interface RunCanarySweepOptions {
  readonly catalog: CanaryCatalog;
  readonly harness?: LedgerHarness | null;
  readonly capability?: string | null;
  /** Where the cost summary goes. Called for every line BEFORE the first run. */
  readonly announce: (line: string) => void;
  /** How one selection is run. Supplied by the caller that holds the lock and the state root. */
  readonly run: (selection: CanarySelection) => Promise<CanaryRunResult>;
  /**
   * How a CAPA-03 selection is run. A handoff canary is not a plain canary run:
   * most of it is deterministic and offline, and only the receiving leg spends.
   * Omitted, a handoff selection is SKIPPED with that as the reason rather than
   * forced through a shape that does not fit it.
   */
  readonly runHandoff?: (selection: CanarySelection) => Promise<HandoffCanaryResult>;
  /**
   * Whether a leg that costs a model turn may run. Default true.
   *
   * False attempts only what is free — which for the handoff canary is the vault
   * round trip and both planning-tree digests, i.e. the whole of D-16's
   * immutability half. That is what makes the free half of CAPA-03 runnable on a
   * host, and in CI, without a credential.
   */
  readonly spend?: boolean;
  readonly context?: ExecutionContext;
}

/**
 * Runs the declared invocation canaries, announcing what they would cost first.
 *
 * The ordering is the contract, not a courtesy: every cost line is announced
 * before the first run is started, so a user reading the output has seen the
 * spend before it happens rather than beside it.
 */
export async function runCanarySweep(options: RunCanarySweepOptions): Promise<CanarySweep> {
  assertCanaryContext(options.context ?? "canary", "runCanarySweep");
  const selections = selectCanaries(options.catalog, {
    ...(options.harness === undefined ? {} : { harness: options.harness }),
    ...(options.capability === undefined ? {} : { capability: options.capability }),
  });
  const costLines = canaryCostLines(selections);
  const spend = options.spend !== false;
  const announced = spend ? costLines : [...costLines, CANARY_NO_SPEND_NOTICE];
  for (const line of announced) options.announce(line);

  const results: CanaryRunResult[] = [];
  const handoffResults: HandoffCanaryResult[] = [];
  const skipped: SkippedCanary[] = [];

  for (const selection of selections) {
    if (selection.declaration.capability === HANDOFF_CAPABILITY) {
      // The handoff canary decides for itself which of its legs are free; the
      // sweep only tells it whether spending is permitted.
      if (options.runHandoff === undefined) {
        skipped.push({
          selection,
          reason:
            "this is a cross-harness handoff canary and no handoff runner was supplied, so it was not run. It is a " +
            "different shape of run, not a plain canary, and forcing it through one would report something else.",
        });
        continue;
      }
      handoffResults.push(await options.runHandoff(selection));
      continue;
    }
    if (!spend && selection.costsModelTurn !== false) {
      skipped.push({ selection, reason: CANARY_NOT_ATTEMPTED_REASON });
      continue;
    }
    results.push(await options.run(selection));
  }

  return { selections, costLines: announced, results, handoffResults, skipped };
}

// ---------------------------------------------------------------------------
// One reported capability, on three axes
// ---------------------------------------------------------------------------

/**
 * One capability's row, on the three orthogonal axes of 03-CONTEXT.md D-11.
 *
 * `deployment` is nullable and carries its own note. That is deliberate and it
 * is not a defaulted axis: `resolveCapabilityStatus` REFUSES a caller that
 * omits an axis rather than inventing one, and the doctor verbs measure the
 * native-use axis only — the deployment axis is a fact about receipts that
 * `alpha-aos project status` reads. A recorded absence with its reason is the
 * honest answer; picking `UNDECIDABLE` would claim a read failure that never
 * happened.
 *
 * `nativeUse` is null on an INCOMPLETE unit, always. D-14: a positive without
 * its negative control is not the claim the unit exists to make, and rendering
 * the positive's axis there is exactly the unpaired-positive-as-pass failure.
 */
export interface CapabilityReportRow {
  readonly capability: string;
  readonly harness: LedgerHarness;
  readonly completeness: EvidenceCompleteness | null;
  readonly axes: {
    readonly deployment: PackState | null;
    readonly support: SurfaceSupport;
    readonly nativeUse: NativeUseState | null;
  };
  readonly axisNotes: {
    readonly deployment: string;
    readonly nativeUse: string | null;
  };
  readonly blockedReason: BlockedReason | null;
  /** Why nothing ran at all. Null when something did. This is not the support axis; the row may be supported. */
  readonly notRunReason: string | null;
  readonly incompleteReasons: readonly string[];
  readonly claimNotes: readonly ClaimNote[];
}

/** The one sentence every doctor row carries about the axis it did not measure. */
export const DEPLOYMENT_AXIS_NOT_MEASURED_HERE =
  "not measured by this command; the deployment axis is read from receipts by `alpha-aos project status`";

/** A row from one leg of a free discovery sweep. */
export function discoveryRow(entry: DiscoverySweepEntry, capability: string, support: SurfaceSupport): CapabilityReportRow {
  const unit = entry.unit;
  return {
    capability,
    harness: entry.harness,
    completeness: unit?.completeness ?? null,
    axes: {
      deployment: null,
      support,
      // `EvidenceUnit.nativeUse` is already null on INCOMPLETE. Read rather
      // than recomputed, so there is one rule and not two.
      nativeUse: unit?.nativeUse ?? null,
    },
    axisNotes: {
      deployment: DEPLOYMENT_AXIS_NOT_MEASURED_HERE,
      nativeUse: unit === null ? (entry.skippedReason ?? entry.discovery?.unsupportedReason ?? null) : null,
    },
    blockedReason: null,
    notRunReason: entry.skippedReason ?? entry.discovery?.unsupportedReason ?? null,
    // The paired run's reasons where there was one, and otherwise the unit's
    // own: an INCOMPLETE unit always carries why it is incomplete, and falling
    // back to an empty list would render "incomplete" with no reason beside it.
    incompleteReasons: entry.discovery?.incompleteReasons ?? unit?.incompleteReasons ?? [],
    claimNotes: [...(unit?.positive?.claimNotes ?? []), ...(unit?.negative?.claimNotes ?? [])],
  };
}

export const CANARY_RUNTIME_SCOPE_LIMIT =
  "This canary proof qualifies routing observed inside an alpha-AOS canary runtime; it does not establish the same routing inside the user's everyday configuration.";

export function canaryClaimNotes(result: CanaryRunResult): readonly ClaimNote[] {
  if (!result.launched || result.oracle === null) return [];
  return [{
    kind: "scope-limit",
    statement: CANARY_RUNTIME_SCOPE_LIMIT,
    basis: `The runtime supplied its own harness configuration root rather than the user's and materialized these alpha-AOS-owned instruction ids: ${result.ownedInstructionIds.length === 0 ? "none" : result.ownedInstructionIds.join(", ")}.`,
  }];
}

/**
 * The ledger row a canary run produces, or null when it produced none.
 *
 * A run that never launched has no `OracleRecord`, and the proof shape requires
 * one — so a refused canary is REPORTED with its blocked code and is not
 * recorded as a proof. The ledger records what was proven; a run that was
 * refused proved nothing, and a row claiming otherwise is the class of defect
 * the closed ledger schema exists to make unrepresentable (T-03-20).
 *
 * The polarity is `positive`, always: a canary is the positive half, and its
 * negative control is the paired discovery sweep's business (D-14). Hence a
 * null `ancestorFreedom` — that assertion belongs to a negative half.
 */
export function canaryProof(
  result: CanaryRunResult,
  options: {
    readonly projectId: string | null;
    readonly boundInputs: BoundInputs;
    readonly harnessVersion: HarnessVersion;
  },
): CapabilityProof | null {
  if (result.oracle === null) return null;
  return {
    projectId: options.projectId,
    harness: result.harness,
    capability: result.capability,
    polarity: "positive",
    nativeUse: result.nativeUse,
    blockedReason: result.blockedReasons[0] ?? null,
    boundInputs: options.boundInputs,
    harnessVersion: options.harnessVersion,
    ancestorFreedom: null,
    observedAt: new Date().toISOString(),
    oracle: result.oracle,
    claimNotes: canaryClaimNotes(result),
  };
}

/** A row from one paid canary run. */
export function canaryRow(result: CanaryRunResult, support: SurfaceSupport): CapabilityReportRow {
  return {
    capability: `${result.capability} (${result.canary})`,
    harness: result.harness,
    // An invocation canary is a positive on its own; its paired negative is the
    // discovery sweep's business, so this row reports no completeness rather
    // than claiming one it did not compute.
    completeness: null,
    axes: {
      deployment: null,
      support,
      nativeUse: result.nativeUse,
    },
    axisNotes: {
      deployment: DEPLOYMENT_AXIS_NOT_MEASURED_HERE,
      nativeUse: result.verdict.reasons[0] ?? result.unverifiedReason,
    },
    blockedReason: result.blockedReasons[0] ?? null,
    notRunReason: null,
    incompleteReasons: [],
    claimNotes: canaryClaimNotes(result),
  };
}

/**
 * A row from one handoff canary.
 *
 * Unlike `canaryRow` this one DOES report a completeness, because a handoff
 * canary really is one evidence unit: its negative control is the planning-tree
 * digest it took itself, not another command's business.
 */
export function handoffRow(result: HandoffCanaryResult, support: SurfaceSupport): CapabilityReportRow {
  const unit = result.unit;
  return {
    capability: `${result.capability} (${result.canary})`,
    harness: result.pair?.target ?? "claude",
    completeness: unit?.completeness ?? null,
    axes: {
      deployment: null,
      support,
      nativeUse: unit?.nativeUse ?? null,
    },
    axisNotes: {
      deployment: DEPLOYMENT_AXIS_NOT_MEASURED_HERE,
      // The receiving leg's absence is the FIRST thing a reader needs, because
      // it is the half a human still has to close.
      nativeUse: result.receivingSkippedReason ?? unit?.incompleteReasons[0] ?? null,
    },
    blockedReason: result.blockedReasons[0] ?? null,
    notRunReason: result.pair === null ? result.pairResolution.blockedReasons[0]?.nextAction ?? null : null,
    incompleteReasons: unit?.incompleteReasons ?? [],
    claimNotes: [...(unit?.positive?.claimNotes ?? []), ...(unit?.negative?.claimNotes ?? [])],
  };
}

/** A row for a selection a sweep deliberately did not attempt. */
export function skippedCanaryRow(entry: SkippedCanary, support: SurfaceSupport): CapabilityReportRow {
  return {
    capability: `${entry.selection.declaration.capability} (${entry.selection.declaration.id})`,
    harness: entry.selection.harness,
    completeness: null,
    axes: { deployment: null, support, nativeUse: "unverified" },
    axisNotes: { deployment: DEPLOYMENT_AXIS_NOT_MEASURED_HERE, nativeUse: entry.reason },
    // Deliberately NOT a blocked reason. D-12: `blocked` is a known, actionable
    // cause the user can clear, and "nobody asked to spend" is neither.
    blockedReason: null,
    notRunReason: null,
    incompleteReasons: [],
    claimNotes: [],
  };
}
