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
    { name: "computer_observe", description: "Safe target-only PNG and untrusted accessibility state for authorized perception", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  ] }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const args = request.params.arguments ?? {};
    if (request.params.name === "computer_observe" && Object.keys(args).length === 0) {
      const result = await session.observe();
      return { content: [{ type: "image", mimeType: "image/png", data: result.png.toString("base64") }, { type: "text", text: JSON.stringify({ untrustedState: result.untrustedState, capture: result.capture, anchor: result.anchor }) }] };
    }
    if (request.params.name === "computer_stop" && Object.keys(args).length === 0) { await session.stop(); return { content: [{ type: "text", text: JSON.stringify({ stopped: true }) }] }; }
    if (request.params.name !== "computer_action" || Object.keys(args).sort().join(",") !== "action,postcondition") throw new Error("Computer MCP raw/unknown operation refused");
    const cancel = () => { void session.stop(); };
    extra.signal.addEventListener("abort", cancel, { once: true });
    try {
      if (extra.signal.aborted) { await session.stop(); throw new Error("Computer MCP request cancelled"); }
      const result = await session.action(args.action as ComputerAction, args.postcondition as ComputerPostcondition);
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } finally { extra.signal.removeEventListener("abort", cancel); }
  });
  return server;
}
export async function serveComputerMcp(session: ComputerSession, transport: Transport = new StdioServerTransport()): Promise<void> {
  const server = createComputerMcpServer(session);
  let ended!: () => void;
  const closed = new Promise<void>((resolve) => { ended = resolve; });
  const stdio = transport instanceof StdioServerTransport;
  if (stdio) { process.stdin.once("end", ended); process.stdin.once("close", ended); }
  try {
    await server.connect(transport);
    const previous = transport.onclose; transport.onclose = () => { previous?.(); ended(); };
    await closed;
  } finally {
    if (stdio) { process.stdin.off("end", ended); process.stdin.off("close", ended); }
    await session.quiesce();
    await server.close();
  }
}
