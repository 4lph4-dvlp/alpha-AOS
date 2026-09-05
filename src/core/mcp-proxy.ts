import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { MessageExtraInfo, JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { CallToolRequestSchema, JSONRPCMessageSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { EnvironmentPolicy, ProtocolProcessSpec, ProtocolSession } from "./process.js";
import type { LockedPackage, McpServerId, RedactedExcerpt } from "../types.js";
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

/** Exactly the names each upstream server is approved to receive. */
const UPSTREAM_ENVIRONMENT_NAMES: Record<McpServerId, readonly string[]> = {
  firecrawl: ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"],
  exa: ["EXA_API_KEY", "ENABLED_TOOLS"],
  context7: ["CONTEXT7_API_KEY"],
};

/** Budget for the retained, redacted excerpt of upstream stderr. */
const UPSTREAM_STDERR_CAP = 64 * 1024;

/**
 * Declares — but does not yet materialize — the upstream child environment.
 *
 * The SDK's default-environment helper copies a broad slice of the ambient
 * environment into the child; alpha-AOS names what the server needs instead.
 * `PLATFORM_FLOOR_ENVIRONMENT` is included because the OS delivers it whether
 * or not it is listed — naming it keeps the allowlist honest rather than
 * pretending the boundary is total.
 *
 * The policy is returned unmaterialized because the process adapter takes an
 * `EnvironmentPolicy`, and it — not this module — decides how a declared name
 * becomes a value and which of those values seed the redaction context.
 */
export function upstreamEnvironmentPolicy(
  server: McpServerId,
  source: NodeJS.ProcessEnv = process.env,
): EnvironmentPolicy {
  return {
    optional: [...PLATFORM_FLOOR_ENVIRONMENT, ...UPSTREAM_ENVIRONMENT_NAMES[server]],
    literal: server === "firecrawl"
      ? { FIRECRAWL_NO_SEARCH_FEEDBACK: "1", FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1" }
      : {},
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
    const session = this.#session;
    if (session !== null) await session.close();
    this.#announceClose();
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

export async function runMcpFilterProxy(serverId: McpServerId, locked: LockedPackage): Promise<void> {
  const allow = allowedMcpTools(serverId);
  if (!allow) throw new Error(`${serverId} does not require an alpha-AOS MCP filter proxy`);
  const npx = resolveNodePackageCli("npx");
  const upstreamTransport = new BoundedStdioTransport({
    executable: npx.executable,
    args: [...npx.argsPrefix, "--yes", `${locked.package}@${locked.version}`],
    cwd: process.cwd(),
    environment: upstreamEnvironmentPolicy(serverId),
    // A filter proxy lives as long as the harness that launched it, so the
    // absolute session ceiling is the one bound that is deliberately off. The
    // per-frame cap, the environment allowlist and the forced termination in
    // close() are all unaffected by this.
    timeoutMs: 0,
    maxOutputBytes: UPSTREAM_STDERR_CAP,
    maxMessageBytes: DEFAULT_MAX_MESSAGE_BYTES,
  });
  const client = new Client({ name: "alpha-aos-mcp-filter", version: "0.1.0" });
  await client.connect(upstreamTransport);

  const server = new Server(
    { name: `alpha-aos-${serverId}-filter`, version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions: `${serverId} tool surface filtered by alpha-aos policy.`,
    },
  );
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const result = await client.listTools(request.params);
    return { ...result, tools: result.tools.filter((tool) => allow.has(tool.name)) };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!allow.has(request.params.name)) throw new Error(`MCP tool is not allowed by alpha-aos policy: ${request.params.name}`);
    return client.callTool(request.params);
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
