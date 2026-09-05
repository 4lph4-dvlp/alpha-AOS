// Contract for the bounded upstream transport of the MCP filter proxy
// (SAFE-04, SAFE-06, D-12).
//
// The proxy launches a third-party MCP server from npm and speaks JSON-RPC to
// it over stdio. Every byte and every environment name that crosses that edge
// is untrusted in one direction and confidential in the other, so the
// transport underneath the SDK client has to be alpha-AOS's own bounded
// protocol session rather than the SDK's stdio transport: the operative
// stdout bound must be the one this project chose, the child environment must
// come from a declared allowlist, and upstream stderr must become redacted,
// fingerprinted evidence instead of terminal output.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { allowedMcpTools, BoundedStdioTransport } from "../src/core/mcp-proxy.js";

/** A name the upstream server advertises that alpha-AOS policy does not allow. */
const DISALLOWED_TOOL = "firecrawl_extract";

interface ProxyFixture {
  readonly root: string;
  /** Answers initialize and tools/list, advertising one allowed and one disallowed tool. */
  readonly upstreamServerScript: string;
  /** Where a fixture server records the pid it is running as. */
  pidPath(name: string): string;
  /**
   * Registers a transport for teardown. Windows will not remove a directory a
   * live child still holds as its cwd, so every transport must be closed
   * before the fixture root is deleted — which a second `context.after` could
   * not guarantee, because hooks run in registration order.
   */
  track(transport: BoundedStdioTransport): BoundedStdioTransport;
}

async function createProxyFixture(
  context: { after: (fn: () => Promise<unknown> | unknown) => void },
): Promise<ProxyFixture> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-mcp-proxy-"));
  const opened: BoundedStdioTransport[] = [];
  context.after(async () => {
    for (const transport of opened) {
      await transport.close().catch(() => undefined);
    }
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });

  const upstreamServerScript = join(root, "upstream-server.mjs");

  // Speaks just enough MCP to complete a handshake and a tool listing. It
  // advertises a tool alpha-AOS policy does not allow, so filtering has
  // something real to drop rather than an empty set to trivially pass.
  //
  // console.log supplies the frame terminator, so no escaped newline has to
  // survive being authored through two levels of source.
  await writeFile(
    upstreamServerScript,
    [
      "import { createInterface } from 'node:readline';",
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync(process.argv[2], String(process.pid), 'utf8');",
      "const lines = createInterface({ input: process.stdin });",
      "lines.on('line', (line) => {",
      "  if (!line.trim().startsWith('{')) return;",
      "  let message;",
      "  try { message = JSON.parse(line); } catch { return; }",
      "  if (typeof message.id !== 'number') return;",
      "  if (message.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fixture-upstream', version: '0.0.0' } } }));",
      "    return;",
      "  }",
      "  if (message.method === 'tools/list') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: [",
      "      { name: 'firecrawl_scrape', description: 'allowed by policy', inputSchema: { type: 'object' } },",
      `      { name: '${DISALLOWED_TOOL}', description: 'not allowed by policy', inputSchema: { type: 'object' } },`,
      "    ] } }));",
      "    return;",
      "  }",
      "  console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } }));",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    root,
    upstreamServerScript,
    pidPath(name: string): string {
      return join(root, `${name}.pid`);
    },
    track(transport: BoundedStdioTransport): BoundedStdioTransport {
      opened.push(transport);
      return transport;
    },
  };
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("the filter proxy reaches a fake upstream server through the bounded transport and returns only allowlisted tools", async (context) => {
  const fixture = await createProxyFixture(context);
  const pidPath = fixture.pidPath("round-trip");

  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [fixture.upstreamServerScript, pidPath],
      cwd: fixture.root,
      // Nothing ambient may reach the upstream child, not even in a fixture.
      environment: { source: {} },
      timeoutMs: 30_000,
      maxOutputBytes: 64 * 1024,
    }),
  );

  const client = new Client({ name: "alpha-aos-mcp-filter-test", version: "0.1.0" });
  // connect() drives start() and the full initialize handshake through the
  // bounded session — the transport is exercised as the SDK actually uses it,
  // not through a hand-rolled call sequence.
  await client.connect(transport);

  const listed = await client.listTools();
  const advertised = listed.tools.map((tool) => tool.name);
  assert.ok(
    advertised.includes(DISALLOWED_TOOL),
    `the fake upstream must advertise a disallowed tool for filtering to be observable: ${advertised.join(", ")}`,
  );

  const allow = allowedMcpTools("firecrawl");
  assert.notEqual(allow, null, "firecrawl must have an alpha-AOS tool allowlist");
  const filtered = listed.tools.filter((tool) => allow?.has(tool.name)).map((tool) => tool.name);
  assert.deepEqual(filtered, ["firecrawl_scrape"], "only allowlisted upstream tools may survive the filter");

  const childPid = Number.parseInt(await readFile(pidPath, "utf8"), 10);
  assert.equal(Number.isInteger(childPid), true, "the fake upstream must record the pid it runs as");

  await transport.close();

  const alive = isAlive(childPid);
  if (alive) process.kill(childPid, "SIGKILL");
  assert.equal(alive, false, "closing the bounded transport left the upstream child running");
});
