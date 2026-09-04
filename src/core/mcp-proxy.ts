import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { LockedPackage, McpServerId, RedactedExcerpt } from "../types.js";
import { createRedactedExcerpt, createRedactionContext } from "./redaction.js";
import { materializeEnvironment, PLATFORM_FLOOR_ENVIRONMENT, resolveNodePackageCli } from "./process.js";

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

/**
 * Builds the upstream child environment from an explicit allowlist.
 *
 * The SDK's default-environment helper copies a broad slice of the ambient
 * environment into the child; alpha-AOS names what the server needs instead.
 * `PLATFORM_FLOOR_ENVIRONMENT` is included because the OS delivers it whether
 * or not it is listed — naming it keeps the allowlist honest rather than
 * pretending the boundary is total.
 */
export function upstreamEnvironment(server: McpServerId, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return materializeEnvironment({
    optional: [...PLATFORM_FLOOR_ENVIRONMENT, ...UPSTREAM_ENVIRONMENT_NAMES[server]],
    literal: server === "firecrawl"
      ? { FIRECRAWL_NO_SEARCH_FEEDBACK: "1", FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1" }
      : {},
    source,
  });
}

export async function runMcpFilterProxy(serverId: McpServerId, locked: LockedPackage): Promise<void> {
  const allow = allowedMcpTools(serverId);
  if (!allow) throw new Error(`${serverId} does not require an alpha-AOS MCP filter proxy`);
  const npx = resolveNodePackageCli("npx");
  const upstreamTransport = new StdioClientTransport({
    command: npx.executable,
    args: [...npx.argsPrefix, "--yes", `${locked.package}@${locked.version}`],
    env: upstreamEnvironment(serverId),
    // An inherited stderr handle would let upstream bytes reach the terminal
    // without passing the redaction and byte-cap policy. The pipe is drained
    // into bounded, redacted evidence instead.
    stderr: "pipe",
  });
  const client = new Client({ name: "alpha-aos-mcp-filter", version: "0.1.0" });
  await client.connect(upstreamTransport);

  // Drain upstream stderr into a bounded, redacted collector. Nothing here is
  // written to the terminal; the evidence is available for diagnostics.
  const stderrEvidence = collectUpstreamStderr(upstreamTransport);

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

  const downstream = new StdioServerTransport();
  const close = async (): Promise<void> => {
    stderrEvidence.stop();
    await server.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  await server.connect(downstream);
}

export interface UpstreamStderrEvidence {
  /** Bounded, redacted excerpt plus a fingerprint of the complete stream. */
  read(): RedactedExcerpt;
  stop(): void;
}

const UPSTREAM_STDERR_CAP = 64 * 1024;

/**
 * Consumes the upstream server's stderr without ever letting raw bytes escape.
 * The whole stream is hashed so evidence stays complete even though only a
 * bounded, redacted head is retained.
 */
function collectUpstreamStderr(transport: StdioClientTransport): UpstreamStderrEvidence {
  const hash = createHash("sha256");
  const held: Buffer[] = [];
  let heldBytes = 0;
  let totalBytes = 0;
  let capped = false;

  const onData = (chunk: Buffer): void => {
    hash.update(chunk);
    totalBytes += chunk.byteLength;
    if (heldBytes >= UPSTREAM_STDERR_CAP) {
      capped = true;
      return;
    }
    const room = UPSTREAM_STDERR_CAP - heldBytes;
    const slice = chunk.byteLength <= room ? chunk : chunk.subarray(0, room);
    held.push(slice);
    heldBytes += slice.byteLength;
    if (slice.byteLength < chunk.byteLength) capped = true;
  };

  const stream = transport.stderr;
  stream?.on("data", onData);

  return {
    read(): RedactedExcerpt {
      const excerpt = createRedactedExcerpt(Buffer.concat(held).toString("utf8"), createRedactionContext());
      return { excerpt: excerpt.excerpt, capped: capped || excerpt.capped, totalBytes, sha256: hash.copy().digest("hex") };
    },
    stop(): void {
      stream?.off("data", onData);
    },
  };
}
