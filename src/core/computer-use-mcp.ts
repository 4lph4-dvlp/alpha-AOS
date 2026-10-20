import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { ComputerSession, ComputerPostcondition } from "./computer-use.js";
import type { ComputerAction } from "./computer-use-policy.js";

export function createComputerMcpServer(session: ComputerSession): Server {
  const server = new Server({ name: "alpha-aos-computer-use", version: "0.4.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    { name: "computer_action", description: "One approved exact-target action and observed deterministic postcondition", inputSchema: { type: "object", additionalProperties: false, required: ["action", "postcondition"], properties: { action: { type: "object" }, postcondition: { type: "object" } } } },
    { name: "computer_stop", description: "Persistently revoke this task's desktop session", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  ] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = request.params.arguments ?? {};
    if (request.params.name === "computer_stop" && Object.keys(args).length === 0) { await session.stop(); return { content: [{ type: "text", text: JSON.stringify({ stopped: true }) }] }; }
    if (request.params.name !== "computer_action" || Object.keys(args).sort().join(",") !== "action,postcondition") throw new Error("Computer MCP raw/unknown operation refused");
    const result = await session.action(args.action as ComputerAction, args.postcondition as ComputerPostcondition);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  });
  return server;
}
export async function serveComputerMcp(session: ComputerSession, transport: Transport = new StdioServerTransport()): Promise<void> {
  const server = createComputerMcpServer(session);
  await server.connect(transport);
  await new Promise<void>((resolve) => { const previous = transport.onclose; transport.onclose = () => { previous?.(); resolve(); }; });
  await server.close();
}
