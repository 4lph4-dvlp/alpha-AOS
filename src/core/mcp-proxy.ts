import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { MessageExtraInfo, JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, JSONRPCMessageSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  EnvironmentPolicy,
  KillDelivery,
  ProcessResult,
  ProtocolProcessSpec,
  ProtocolSession,
} from "./process.js";
import type { LockedPackage, McpServerId, RedactedExcerpt } from "../types.js";
import { userStateRoot } from "./paths.js";
import {
  DEFAULT_MAX_MESSAGE_BYTES,
  materializeEnvironment,
  openProtocolProcess,
  PLATFORM_FLOOR_ENVIRONMENT,
  resolveNodePackageCli,
} from "./process.js";

const firecrawlTools = new Set([
  "firecrawl_scrape",
  "firecrawl_map",
  "firecrawl_crawl",
  "firecrawl_check_crawl_status",
]);

export function allowedMcpTools(server: McpServerId): ReadonlySet<string> | null {
  return server === "firecrawl" ? firecrawlTools : null;
}

// ---------------------------------------------------------------------------
// The measured upstream tool surfaces, and the routing-contract finding
// ---------------------------------------------------------------------------

/**
 * What a pinned server was OBSERVED to publish, as opposed to what any document
 * says it publishes.
 *
 * This table exists because 03-RESEARCH.md Pitfall 1 found three separate
 * documents disagreeing about the research stack's tool identifiers, and the
 * only one of them produced by asking a server was a live `tools/list`. A
 * canary expectation checked against a document proves that two documents
 * agree; checked against this table it is checked against a measurement.
 */
export interface MeasuredToolSurface {
  readonly server: McpServerId;
  /** `name@version`, exactly the pinned entry in `catalog/stack.lock.json`. */
  readonly package: string;
  readonly tools: readonly string[];
  /**
   * Whether `tools` is the WHOLE published surface or only the part alpha-AOS
   * depends on. Declared rather than implied: a partial list read as a complete
   * one would turn "alpha-AOS does not use this tool" into "this tool does not
   * exist", which is the exact error Pitfall 1 records the shipped third-party
   * text making in the other direction.
   */
  readonly complete: boolean;
  /** ISO date of the live probe this row was transcribed from. */
  readonly measuredOn: string;
  readonly note?: string;
}

/**
 * Live `tools/list` results, transcribed from 03-RESEARCH.md's primary sources.
 *
 * A tool name that is not here has not been observed on the pinned server, and
 * a declaration naming one is a declaration about a tool nobody has seen.
 */
export const MEASURED_UPSTREAM_TOOLS: Readonly<Record<McpServerId, MeasuredToolSurface>> = Object.freeze({
  context7: {
    server: "context7",
    package: "@upstash/context7-mcp@4.0.4",
    tools: ["resolve-library-id", "query-docs"],
    complete: true,
    measuredOn: "2026-09-10",
    note: "resolve-library-id returns a Versions: list, which is what makes a version-scoped libraryId available to the second call at all",
  },
  exa: {
    server: "exa",
    package: "exa-mcp-server@3.4.1",
    tools: ["web_search_exa", "web_fetch_exa"],
    complete: true,
    measuredOn: "2026-09-10",
    note: "the discovery server ships its own fetch, so search-then-fetch entirely on this server is a correct single-server lookup",
  },
  firecrawl: {
    server: "firecrawl",
    package: "firecrawl-mcp@3.24.0",
    // Deliberately NOT the whole surface. The server published 25 tools
    // without a key and 27 with one; enumerating them here would be a list
    // that rots on every upstream release while proving nothing this repository
    // needs. What is needed is the four alpha-AOS admits, plus every further
    // name this repository states something about: `firecrawl_search`, which
    // the shipped third-party text directs a model at and policy denies, and
    // `firecrawl_extract`, which the proxy fixtures use as their denied example.
    tools: [...firecrawlTools, "firecrawl_search", "firecrawl_extract"],
    complete: false,
    measuredOn: "2026-09-10",
    note: "25 tools keyless / 27 with a key; only the four in allowedMcpTools cross the alpha-AOS proxy",
  },
} as const);

/**
 * The stable code for the disagreement between the pinned third-party research
 * instructions and the tool surfaces the pinned servers actually publish.
 *
 * UPPER_SNAKE and stable on purpose: a later ECC bump that changes the shipped
 * text should change what this finding SAYS, never what a consumer matches on.
 */
export const ROUTING_CONTRACT_MISMATCH_CODE = "ECC_RESEARCH_ROUTING_CONTRACT_MISMATCH";

/**
 * One recorded documentation disagreement, carrying the runtime version it was
 * measured against.
 *
 * The version is the point of the record. A finding that says "the shipped
 * skill names tools that do not exist" without saying WHICH shipped skill, at
 * which version, cannot tell a future reader whether the bump they are looking
 * at fixed it.
 */
export interface RoutingContractFinding {
  readonly code: typeof ROUTING_CONTRACT_MISMATCH_CODE;
  /** `name@version` of the pinned runtime whose text disagrees. */
  readonly runtime: string;
  /** The third-party document, relative to that runtime's package root. */
  readonly document: string;
  /** Names that document directs a model at which no pinned server publishes. */
  readonly namesNotPublished: readonly string[];
  /** Names that exist upstream but which the alpha-AOS proxy refuses. */
  readonly namesDeniedByPolicy: readonly string[];
  /** The alpha-AOS-owned instruction that states the contract instead. */
  readonly reconciledBy: string;
  readonly why: string;
}

/** Where the alpha-AOS-owned statement of the routing contract lives. */
export const RESEARCH_ROUTING_INSTRUCTION_ID = "alpha-aos-research-routing";

/** Its path inside this package, used to materialize it into a canary runtime. */
export const RESEARCH_ROUTING_INSTRUCTION_SOURCE = "skills/alpha-aos-research-routing/SKILL.md";

/**
 * The recorded mismatch.
 *
 * Recorded rather than repaired, which is the whole of the `narrow` decision
 * taken in plan 03-07: the four-name allowlist below does not move, the
 * bounded-extraction claim in PROJECT.md stays true as written, the pinned
 * third-party bytes are not touched (03-CONTEXT.md D-07 forbids it, and the
 * identity renderer means an edited skill would fail its own exact-hash
 * contract), and the reconciliation lands in an alpha-AOS-owned instruction.
 * What is left over is this disagreement, and a disagreement nobody wrote down
 * is one a future runtime bump silently resolves in either direction.
 */
export const ROUTING_CONTRACT_MISMATCH: RoutingContractFinding = Object.freeze({
  code: ROUTING_CONTRACT_MISMATCH_CODE,
  runtime: "ecc-universal@2.2.1",
  document: "skills/deep-research/SKILL.md",
  namesNotPublished: Object.freeze(["web_search_advanced_exa", "crawling_exa"]),
  namesDeniedByPolicy: Object.freeze(["firecrawl_search"]),
  reconciledBy: RESEARCH_ROUTING_INSTRUCTION_SOURCE,
  why:
    "the pinned research instructions direct discovery at a tool the extraction server publishes but alpha-AOS policy " +
    "denies, and extraction at two tools the discovery server does not publish at all; the allowlist is unchanged and " +
    "the contract is restated in an alpha-AOS-owned instruction instead",
} as const);


/** Exactly the names each upstream server is approved to receive. */
const UPSTREAM_ENVIRONMENT_NAMES: Record<McpServerId, readonly string[]> = {
  firecrawl: ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"],
  exa: ["EXA_API_KEY", "ENABLED_TOOLS"],
  context7: ["CONTEXT7_API_KEY"],
};

/**
 * The closed set of servers alpha-AOS can front. Derived from the environment
 * table rather than restated, so a server that gains an environment
 * declaration cannot be forgotten here.
 */
export const MCP_SERVER_IDS: readonly McpServerId[] = Object.keys(UPSTREAM_ENVIRONMENT_NAMES) as McpServerId[];

/** Budget for the retained, redacted excerpt of upstream stderr. */
const UPSTREAM_STDERR_CAP = 64 * 1024;

/**
 * Where an upstream MCP child is allowed to write.
 *
 * The servers are launched with `npx`, which resolves and caches a package
 * before the server it contains ever speaks. That resolution needs somewhere
 * to write, and the name that decides where is not the server's business to
 * inherit.
 */
export function proxyCacheRoot(stateRoot: string = userStateRoot()): string {
  return join(stateRoot, "mcp-cache");
}

/**
 * Declares — but does not yet materialize — the upstream child environment.
 *
 * The SDK's default-environment helper copies a broad slice of the ambient
 * environment into the child; alpha-AOS names what the server needs instead.
 * `PLATFORM_FLOOR_ENVIRONMENT` is included because the OS delivers it whether
 * or not it is listed — naming it keeps the allowlist honest rather than
 * pretending the boundary is total.
 *
 * The names that decide where the child WRITES are pinned as literals under
 * `proxyCacheRoot()` rather than passed through, which is plan 01-21's
 * recorded decision applied to this seam: a child launched by alpha-AOS gets a
 * declared environment, and an inherited name must never choose the directory
 * it bootstraps into. Omitting them was not a tighter boundary but a broken
 * one — with no cache name declared, npm fell back to a home-derived cache
 * that held no `_npx` entry and the child died before the JSON-RPC handshake.
 * `PATHEXT` and `COMSPEC` are passthrough rather than pinned: on win32 they
 * are needed to launch a `.cmd` shim at all and carry no user data.
 *
 * The policy is returned unmaterialized because the process adapter takes an
 * `EnvironmentPolicy`, and it — not this module — decides how a declared name
 * becomes a value and which of those values seed the redaction context.
 */
export function upstreamEnvironmentPolicy(
  server: McpServerId,
  source: NodeJS.ProcessEnv = process.env,
): EnvironmentPolicy {
  const writeRoot = proxyCacheRoot();
  return {
    optional: [
      ...PLATFORM_FLOOR_ENVIRONMENT,
      "PATH",
      "PATHEXT",
      "COMSPEC",
      ...UPSTREAM_ENVIRONMENT_NAMES[server],
    ],
    literal: {
      LOCALAPPDATA: join(writeRoot, "local"),
      APPDATA: join(writeRoot, "roaming"),
      XDG_CACHE_HOME: join(writeRoot, "cache"),
      XDG_CONFIG_HOME: join(writeRoot, "config"),
      XDG_DATA_HOME: join(writeRoot, "data"),
      XDG_STATE_HOME: join(writeRoot, "state"),
      npm_config_cache: join(writeRoot, "npm-cache"),
      npm_config_logs_max: "0",
      ...(server === "firecrawl"
        ? { FIRECRAWL_NO_SEARCH_FEEDBACK: "1", FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1" }
        : {}),
    },
    source,
  };
}

/** The same allowlist, resolved to the concrete block a child would receive. */
export function upstreamEnvironment(server: McpServerId, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return materializeEnvironment(upstreamEnvironmentPolicy(server, source));
}

/**
 * An MCP SDK `Transport` whose child runs inside the alpha-AOS process
 * boundary instead of the SDK's own.
 *
 * The SDK's stdio transport is a competent piece of software, but its bounds
 * are its own: a 10 MiB default read buffer, an environment assembled by a
 * helper that copies ambient names, and a stderr handle the caller has to
 * remember to drain. This project already owns a reviewed boundary for child
 * processes — absolute executable, no shell, a declared environment
 * allowlist, a per-frame byte cap that terminates rather than buffers, and
 * redacted fingerprinted evidence — so the upstream server runs inside that
 * one and the SDK keeps only what it is authoritative about: JSON-RPC message
 * semantics, validated here by its own `JSONRPCMessageSchema`.
 *
 * There is deliberately no fallback to an unbounded transport. A session that
 * cannot start is a refusal, not a reason to lower the boundary.
 */
export class BoundedStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  sessionId?: string;

  readonly #spec: ProtocolProcessSpec;
  #session: ProtocolSession | null = null;
  #closeAnnounced = false;

  constructor(spec: ProtocolProcessSpec) {
    this.#spec = spec;
  }

  async start(): Promise<void> {
    if (this.#session !== null) {
      throw new Error("BoundedStdioTransport is already started");
    }
    const session = await openProtocolProcess(this.#spec);
    this.#session = session;

    session.onMessage((message) => {
      // Byte bounds and the process boundary are alpha-AOS's; what counts as a
      // well-formed JSON-RPC message is the SDK's, so its own schema decides.
      const parsed = JSONRPCMessageSchema.safeParse(message);
      if (!parsed.success) {
        // Coded reason only. The rejected frame's bytes stay inside the
        // session's redacted, fingerprinted evidence and are never re-emitted.
        this.onerror?.(new Error("Upstream sent a frame that is not a valid JSON-RPC message; it was dropped"));
        return;
      }
      this.onmessage?.(parsed.data);
    });

    // A session that ends on its own terms — frame cap, deadline, or the child
    // exiting — must reach the SDK as a closed connection.
    void session.closed.then(
      () => this.#announceClose(),
      () => this.#announceClose(),
    );
  }

  async send(message: JSONRPCMessage): Promise<void> {
    const session = this.#session;
    if (session === null) {
      throw new Error("BoundedStdioTransport has no open session; there is no unbounded transport to fall back to");
    }
    // The session frames as newline-delimited JSON, which is byte-identical to
    // what the SDK's own `serializeMessage` produces.
    session.send(message);
  }

  async close(): Promise<void> {
    await this.closeSession();
  }

  /**
   * The same close, with what the session reported about it.
   *
   * Descendant termination is the process adapter's contract, hardened across
   * three operating systems in Phase 1, and it is the only close this
   * transport performs — the SDK transport's own close is never reached. The
   * settled result carries the delivery path that actually terminated the
   * tree, and a caller that discards it cannot say afterwards which mechanism
   * ran. An observation proxy closes once per canary run rather than once per
   * harness session, so that answer is worth keeping.
   */
  async closeSession(): Promise<ProcessResult | null> {
    const session = this.#session;
    if (session === null) {
      this.#announceClose();
      return null;
    }
    const result = await session.close();
    this.#announceClose();
    return result;
  }

  /**
   * Bounded, redacted, fingerprinted upstream stderr.
   *
   * An inherited stderr handle would let upstream bytes reach the terminal
   * without passing the redaction and byte-cap policy. The session pipes and
   * bounds the stream instead, and this is the only way to read it.
   */
  stderrEvidence(): RedactedExcerpt {
    const session = this.#session;
    if (session === null) {
      throw new Error("BoundedStdioTransport has no open session and therefore no upstream evidence");
    }
    return session.evidence().stderr;
  }

  #announceClose(): void {
    if (this.#closeAnnounced) return;
    this.#closeAnnounced = true;
    this.onclose?.();
  }
}

/**
 * The exact child one pinned MCP server is launched as.
 *
 * Declared once so the proxy and the startup regression describe the same
 * launch: a test that assembled its own equivalent spec could stay green
 * against a spec the product no longer uses.
 */
export function upstreamProcessSpec(serverId: McpServerId, locked: LockedPackage): ProtocolProcessSpec {
  const npx = resolveNodePackageCli("npx");
  return {
    executable: npx.executable,
    args: [...npx.argsPrefix, "--yes", `${locked.package}@${locked.version}`],
    cwd: process.cwd(),
    environment: upstreamEnvironmentPolicy(serverId),
    // A proxy lives as long as the harness that launched it, so the absolute
    // session ceiling is the one bound that is deliberately off. The per-frame
    // cap, the environment allowlist and the forced termination in close() are
    // all unaffected by this.
    timeoutMs: 0,
    maxOutputBytes: UPSTREAM_STDERR_CAP,
    maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES,
  };
}

/**
 * What a proxy session is FOR, which is not the same question as what it
 * allows. Filtering is governed by `allowedMcpTools` in both modes; the mode
 * decides only whether the calls that cross are recorded.
 *
 * `filter` is the everyday configuration a harness talks to. `observe` is the
 * canary configuration (D-02): additive, in the path only while a capability
 * is being proven, and never a widening of what may be called.
 */
export type McpProxyMode = "filter" | "observe";

/**
 * One recorded tool call. Deliberately closed: there is no argument field and
 * no response field, because arguments are where credentials live and a
 * record is an observable surface — it reaches a ledger and a CI log. The
 * evidence CAPA-01 and CAPA-02 need is that a named tool was called and how
 * it ended, not what was passed to it.
 */
export interface McpObservation {
  readonly server: McpServerId;
  readonly tool: string;
  /** ISO-8601, when the outcome was known. */
  readonly at: string;
  /** The locked upstream version this call was answered by. */
  readonly upstreamVersion: string;
  readonly outcome: "ok" | "denied";
  /**
   * The SHAPE of the declared identifier this call carried, or absent when the
   * call carried none that alpha-AOS classifies.
   *
   * The one exception to the no-arguments rule above, and deliberately shaped
   * so it is not a hole in it. CAPA-01's claim is "version-SENSITIVE
   * documentation", and the structural form of that claim is that the
   * documentation query carried a version-scoped library identifier. There is
   * no way to prove it from a record holding only a tool name. So the record
   * gains exactly one field, it holds a two-value classification rather than
   * any part of the identifier, and the classifier is a declared table of one
   * (tool, argument) pair — not a general reader of whatever was passed.
   *
   * The T-03-52 reasoning is unchanged by this and is why the field is shaped
   * this way: arguments are where credentials live and a record is an
   * observable surface that reaches a ledger and a CI log. A classification
   * carries no credential, because "version-scoped" is the same two words
   * whatever the identifier was.
   */
  readonly identifierShape?: IdentifierShape;
}

/**
 * What a declared identifier argument looked like. A classification, never a
 * value, and closed at two members so a third could not smuggle one in.
 */
export type IdentifierShape = "version-scoped" | "unscoped";

const IDENTIFIER_SHAPES: readonly IdentifierShape[] = ["version-scoped", "unscoped"];

/**
 * The declared table of identifier arguments alpha-AOS classifies.
 *
 * ONE entry, and it stays a table rather than a branch so a second entry is a
 * row a reviewer sees rather than a condition buried in the proxy. A tool that
 * is not here is classified as nothing at all — which is what keeps this a
 * declared field rather than a general argument reader.
 */
const CLASSIFIED_IDENTIFIER_ARGUMENTS: Readonly<Record<string, string>> = Object.freeze({
  "query-docs": "libraryId",
});

/**
 * `/org/project/version` is version-scoped; `/org/project` is not.
 *
 * The same structural fact `catalog/canaries.yaml` declares for CAPA-01, and
 * the same one 03-RESEARCH.md measured live: `resolve-library-id` returns a
 * `Versions:` list, so a three-segment id in the following call is the model
 * having used it.
 */
export const VERSION_SCOPED_IDENTIFIER_PATTERN = "^/[^/]+/[^/]+/[^/]+$";

const VERSION_SCOPED_IDENTIFIER = new RegExp(VERSION_SCOPED_IDENTIFIER_PATTERN, "u");

/**
 * The argument name alpha-AOS classifies on this tool, or null when it
 * classifies none.
 *
 * Exported so a consumer can ask whether a DECLARED expectation is one a
 * recorded shape is able to decide, rather than assuming it is. An expectation
 * over an argument nothing classifies must stay unchecked with its reason.
 */
export function classifiedIdentifierArgument(tool: string): string | null {
  return CLASSIFIED_IDENTIFIER_ARGUMENTS[tool] ?? null;
}

/**
 * Classifies one call's declared identifier argument, WITHOUT retaining it.
 *
 * Returns null for a tool with no declared identifier argument, for a call
 * carrying no arguments at all, and for an argument that is not a string. Null
 * means "not classified", which is a different fact from "unscoped" and is
 * reported as unchecked rather than as a failure downstream.
 */
export function identifierShapeOf(tool: string, args: unknown): IdentifierShape | null {
  const argument = CLASSIFIED_IDENTIFIER_ARGUMENTS[tool];
  if (argument === undefined) return null;
  if (args === null || typeof args !== "object" || Array.isArray(args)) return null;
  const value = (args as Record<string, unknown>)[argument];
  if (typeof value !== "string") return null;
  return VERSION_SCOPED_IDENTIFIER.test(value) ? "version-scoped" : "unscoped";
}

/**
 * Where observations go. One method, so a canary can supply a file-backed or
 * ledger-backed sink without this module knowing either exists.
 */
export interface McpObservationSink {
  record(observation: McpObservation): void;
}

/**
 * One observation as a single line of newline-delimited JSON.
 *
 * The record is written by a proxy child and read by the canary that launched
 * the harness that launched it, so the two halves of that seam are declared
 * here together — a writer and a reader that live in different modules are two
 * places one format can drift.
 */
export function observationLine(observation: McpObservation): string {
  return `${JSON.stringify({
    server: observation.server,
    tool: observation.tool,
    at: observation.at,
    upstreamVersion: observation.upstreamVersion,
    outcome: observation.outcome,
    // Omitted entirely when the call carried no classified identifier, so a
    // record for a tool alpha-AOS classifies nothing on stays byte-identical
    // to what it was before this field existed.
    ...(observation.identifierShape === undefined ? {} : { identifierShape: observation.identifierShape }),
  })}\n`;
}

/**
 * Reads observation records out of an append-only observation file.
 *
 * FIELD-SELECTIVE, for the same reason `parsePiAuthCheck` is: five named
 * fields are read and the parsed object is never kept, so a line that grew an
 * `arguments` field — the place a credential would live — cannot ride along
 * into anything a ledger or a CI log renders (T-03-52).
 *
 * A line this reader cannot make sense of is SKIPPED rather than guessed at. A
 * partially written final line is the ordinary shape of a file an appending
 * child was still writing to.
 */
export function readObservationRecords(text: string): readonly McpObservation[] {
  const records: McpObservation[] = [];
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    const server = record.server;
    const tool = record.tool;
    const at = record.at;
    const upstreamVersion = record.upstreamVersion;
    const outcome = record.outcome;
    if (typeof server !== "string" || !MCP_SERVER_IDS.includes(server as McpServerId)) continue;
    if (typeof tool !== "string" || typeof at !== "string" || typeof upstreamVersion !== "string") continue;
    if (outcome !== "ok" && outcome !== "denied") continue;
    // Field-selective for the sixth field exactly as for the first five, and
    // closed against its two declared members: a line that grew an
    // `identifierShape` holding anything else — an identifier VALUE, say — is
    // skipped rather than guessed at, so a forged record cannot smuggle a value
    // through the one field that was opened.
    const identifierShape = record.identifierShape;
    if (identifierShape !== undefined && !IDENTIFIER_SHAPES.includes(identifierShape as IdentifierShape)) continue;
    records.push({
      server: server as McpServerId,
      tool,
      at,
      upstreamVersion,
      outcome,
      ...(identifierShape === undefined ? {} : { identifierShape: identifierShape as IdentifierShape }),
    });
  }
  return records;
}

/**
 * A sink that appends each observation to a file, synchronously.
 *
 * Synchronous on purpose: `record` is called from the proxy's request handler
 * and the proxy child can be terminated the moment the harness that launched it
 * exits. A queued asynchronous append is a record that may never reach the
 * file, and a missing observation is indistinguishable from a capability that
 * was not selected (T-03-54).
 */
export function createFileObservationSink(path: string): McpObservationSink {
  return {
    record(observation: McpObservation): void {
      appendFileSync(path, observationLine(observation), "utf8");
    },
  };
}

export interface McpProxyOptions {
  /** Defaults to `filter`, the everyday configuration. */
  mode?: McpProxyMode;
  /** Consulted only in `observe` mode. */
  sink?: McpObservationSink;
  /**
   * The upstream child to front. Defaults to the pinned package launched
   * through npx; a canary runtime supplies its own so a session can be driven
   * against a tree that was already verified rather than resolved again.
   */
  upstream?: ProtocolProcessSpec;
}

/**
 * The refusal a denied tool produces.
 *
 * Phase 1 D-11 made this string a contract rather than a diagnostic: callers
 * match on it. It is declared once so a reworded copy cannot drift away from
 * the one the tests pin.
 */
export function mcpPolicyRefusal(tool: string): string {
  return `MCP tool is not allowed by alpha-aos policy: ${tool}`;
}

function observe(
  options: McpProxyOptions,
  serverId: McpServerId,
  locked: LockedPackage,
  tool: string,
  outcome: McpObservation["outcome"],
  args?: unknown,
): void {
  if (options.mode !== "observe") return;
  // Classified HERE and discarded immediately. The arguments object exists in
  // this frame and in no other, so there is no point at which a caller could
  // reach a value through the record. That is the whole of how the one new
  // field stays a classification rather than a channel.
  const identifierShape = identifierShapeOf(tool, args);
  options.sink?.record({
    server: serverId,
    tool,
    at: new Date().toISOString(),
    upstreamVersion: locked.version,
    outcome,
    ...(identifierShape === null ? {} : { identifierShape }),
  });
}

/**
 * Fronts one pinned MCP server for a harness.
 *
 * A server with no allowlist is forwarded unfiltered rather than refused: a
 * null `allowedMcpTools` means alpha-AOS has no tool policy for that server,
 * which is a reason to pass its surface through, not a reason to refuse to
 * stand up the proxy at all. That refusal is what kept the observation seam
 * off context7 and exa, the two servers a capability canary reaches first.
 */
export async function runMcpProxy(
  serverId: McpServerId,
  locked: LockedPackage,
  options: McpProxyOptions = {},
): Promise<void> {
  const allow = allowedMcpTools(serverId);
  const upstreamTransport = new BoundedStdioTransport(options.upstream ?? upstreamProcessSpec(serverId, locked));
  const client = new Client({ name: `alpha-aos-mcp-${options.mode ?? "filter"}`, version: "0.1.0" });
  await client.connect(upstreamTransport);

  const server = new Server(
    { name: `alpha-aos-${serverId}-${options.mode ?? "filter"}`, version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: allow
        ? `${serverId} tool surface filtered by alpha-aos policy.`
        : `${serverId} tool surface fronted by alpha-aos.`,
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const result = await client.listTools(request.params);
    if (!allow) return result;
    return { ...result, tools: result.tools.filter((tool) => allow.has(tool.name)) };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = request.params.name;
    if (allow && !allow.has(tool)) {
      // Recorded BEFORE the throw: a policy refusal is evidence that the model
      // reached for a tool, which is exactly what a capability canary needs.
      observe(options, serverId, locked, tool, "denied", request.params.arguments);
      throw new Error(mcpPolicyRefusal(tool));
    }
    const result = await client.callTool(request.params);
    observe(options, serverId, locked, tool, "ok", request.params.arguments);
    return result;
  });

  // Downstream is the harness alpha-AOS itself is inside — the trusted side of
  // the boundary — so it keeps the SDK's own stdio server transport.
  const downstream = new StdioServerTransport();
  const close = async (): Promise<void> => {
    await server.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  await server.connect(downstream);
}

/**
 * @deprecated Use `runMcpProxy`. Kept so the CLI's call site keeps working
 * while filtering stops being the module's only mode.
 */
export async function runMcpFilterProxy(serverId: McpServerId, locked: LockedPackage): Promise<void> {
  return runMcpProxy(serverId, locked, { mode: "filter" });
}

/**
 * A teardown fault that arrived AFTER the proof was already complete.
 *
 * A stable upper-snake code rather than a message, because the distinction is
 * something a caller acts on: a crash at close after a complete observation
 * record is survivable and must not be reported as a failed canary, but it
 * still happened and must not vanish either. RESEARCH.md Pitfall 9 recorded a
 * Windows libuv assertion firing on a clean stdio MCP client close, after the
 * useful output had already been produced.
 */
export const OBSERVED_UPSTREAM_LATE_EXIT = "OBSERVED_UPSTREAM_LATE_EXIT";

export interface ObservedUpstreamFinding {
  readonly code: typeof OBSERVED_UPSTREAM_LATE_EXIT;
  /** Coded, never a value: which half of teardown faulted. */
  readonly reason: "close-failed" | "non-zero-exit";
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  /**
   * The observations that were already complete when this fired. This is what
   * makes the finding a footnote on a proof rather than the loss of one.
   */
  readonly completed: readonly McpObservation[];
  readonly message: string;
}

/** What a bounded close of an observed session reports. */
export interface ObservedUpstreamClose {
  /**
   * Which delivery path terminated the child tree, as the session reported
   * it, or null when close itself faulted before reporting one. Reported
   * rather than assumed: a POSIX group signal that was refused and fell back
   * to the direct child terminated strictly less than was asked for.
   */
  readonly treeTermination: KillDelivery | null;
  readonly exitCode: number | null;
  readonly observations: readonly McpObservation[];
  /** Non-null only when teardown faulted after a complete record. */
  readonly finding: ObservedUpstreamFinding | null;
}

/** What `openObservedUpstream` hands back. */
export interface ObservedUpstream {
  /**
   * The connected upstream client. Calls made directly through it bypass the
   * recording seam; `callTool` below is the observed path.
   */
  readonly client: Client;
  readonly transport: BoundedStdioTransport;
  /** Every observation this session has recorded, oldest first. */
  observations(): readonly McpObservation[];
  listTools(): Promise<Awaited<ReturnType<Client["listTools"]>>>;
  /** Applies the same tool policy the proxy applies, and records the outcome. */
  callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<
    Awaited<ReturnType<Client["callTool"]>>
  >;
  close(): Promise<ObservedUpstreamClose>;
}

/**
 * Opens an observed upstream WITHOUT standing up a downstream server.
 *
 * `runMcpProxy` is what a harness talks to; this is what a canary runtime
 * drives directly. Both apply the same tool policy and produce the same
 * closed observation record — the difference is only whether there is a
 * downstream side at all.
 */
export async function openObservedUpstream(
  serverId: McpServerId,
  locked: LockedPackage,
  sink: McpObservationSink,
  upstream?: ProtocolProcessSpec,
): Promise<ObservedUpstream> {
  const allow = allowedMcpTools(serverId);
  const recorded: McpObservation[] = [];
  const options: McpProxyOptions = {
    mode: "observe",
    sink: {
      record(observation: McpObservation): void {
        recorded.push(observation);
        sink.record(observation);
      },
    },
  };

  const transport = new BoundedStdioTransport(upstream ?? upstreamProcessSpec(serverId, locked));
  const client = new Client({ name: "alpha-aos-mcp-observe", version: "0.1.0" });
  await client.connect(transport);

  return {
    client,
    transport,
    observations: () => recorded,
    listTools: async () => {
      const result = await client.listTools();
      if (!allow) return result;
      return { ...result, tools: result.tools.filter((tool) => allow.has(tool.name)) };
    },
    callTool: async (params) => {
      if (allow && !allow.has(params.name)) {
        observe(options, serverId, locked, params.name, "denied", params.arguments);
        throw new Error(mcpPolicyRefusal(params.name));
      }
      const result = await client.callTool(params);
      observe(options, serverId, locked, params.name, "ok", params.arguments);
      return result;
    },
    /**
     * Ends the session through the Phase 1 bounded close and reports what it
     * cost.
     *
     * The asymmetry is deliberate. Before any record is complete there is no
     * proof to protect, so a teardown fault is simply a failed run and
     * propagates. After one, the proof exists and discarding it because the
     * child crashed on the way out would be the repudiation this finding
     * exists to prevent — so the fault is named, carries the records that
     * were already complete, and the run stands.
     */
    close: async (): Promise<ObservedUpstreamClose> => {
      const completed = [...recorded];
      let result: ProcessResult | null;
      try {
        result = await transport.closeSession();
      } catch (error) {
        if (completed.length === 0) throw error;
        const message = error instanceof Error ? error.message : String(error);
        return {
          treeTermination: null,
          exitCode: null,
          observations: completed,
          finding: {
            code: OBSERVED_UPSTREAM_LATE_EXIT,
            reason: "close-failed",
            exitCode: null,
            signal: null,
            completed,
            message: `closing the observed ${serverId} upstream faulted after ${completed.length} complete observation(s): ${message}`,
          },
        };
      }

      const treeTermination = result?.treeTermination ?? null;
      const exitCode = result?.exitCode ?? null;
      // A forced termination's exit code is alpha-AOS's, not the child's:
      // taskkill /T /F leaves a non-zero code on win32 for a child that was
      // behaving perfectly. Only a child that left on its OWN terms can be
      // said to have exited badly.
      const leftVoluntarily = treeTermination === "not-required";
      const exitedBadly = leftVoluntarily && exitCode !== null && exitCode !== 0;
      if (exitedBadly && completed.length === 0) {
        throw new Error(
          `the observed ${serverId} upstream exited ${exitCode} with no complete observation record`,
        );
      }
      return {
        treeTermination,
        exitCode,
        observations: completed,
        finding: exitedBadly
          ? {
            code: OBSERVED_UPSTREAM_LATE_EXIT,
            reason: "non-zero-exit",
            exitCode,
            signal: result?.signal ?? null,
            completed,
            message: `the observed ${serverId} upstream exited ${exitCode} after ${completed.length} complete observation(s)`,
          }
          : null,
      };
    },
  };
}
