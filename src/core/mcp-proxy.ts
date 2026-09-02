import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { LockedPackage, McpServerId } from "../types.js";
import { resolveNodePackageCli } from "./process.js";

const firecrawlTools = new Set([
  "firecrawl_scrape",
  "firecrawl_map",
  "firecrawl_crawl",
  "firecrawl_check_crawl_status",
]);

export function allowedMcpTools(server: McpServerId): ReadonlySet<string> | null {
  return server === "firecrawl" ? firecrawlTools : null;
}

function upstreamEnvironment(server: McpServerId): Record<string, string> {
  const env = getDefaultEnvironment();
  const names = server === "firecrawl"
    ? ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"]
    : server === "exa"
      ? ["EXA_API_KEY", "ENABLED_TOOLS"]
      : ["CONTEXT7_API_KEY"];
  for (const name of names) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  if (server === "firecrawl") {
    env.FIRECRAWL_NO_SEARCH_FEEDBACK = "1";
    env.FIRECRAWL_NO_ENDPOINT_FEEDBACK = "1";
  }
  return env;
}

export async function runMcpFilterProxy(serverId: McpServerId, locked: LockedPackage): Promise<void> {
  const allow = allowedMcpTools(serverId);
  if (!allow) throw new Error(`${serverId} does not require an alpha-AOS MCP filter proxy`);
  const npx = resolveNodePackageCli("npx");
  const upstreamTransport = new StdioClientTransport({
    command: npx.executable,
    args: [...npx.argsPrefix, "--yes", `${locked.package}@${locked.version}`],
    env: upstreamEnvironment(serverId),
    stderr: "inherit",
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

  const downstream = new StdioServerTransport();
  const close = async (): Promise<void> => {
    await server.close().catch(() => undefined);
    await client.close().catch(() => undefined);
  };
  process.once("SIGINT", () => { void close(); });
  process.once("SIGTERM", () => { void close(); });
  await server.connect(downstream);
}
