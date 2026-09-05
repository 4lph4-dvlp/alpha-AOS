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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  allowedMcpTools,
  BoundedStdioTransport,
  upstreamEnvironment,
  upstreamEnvironmentPolicy,
} from "../src/core/mcp-proxy.js";
import { PLATFORM_FLOOR_ENVIRONMENT } from "../src/core/process.js";

// Compiled to dist/test, so the repository root is two levels up.
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** A name the upstream server advertises that alpha-AOS policy does not allow. */
const DISALLOWED_TOOL = "firecrawl_extract";

/** The credential the fixture hands upstream, and expects never to see back. */
const CREDENTIAL_SENTINEL = "alphaAOSfirecrawlSentinel0011";

/** A name no upstream allowlist declares, offered to prove it does not cross. */
const UNDECLARED_SENTINEL = "alphaAOSundeclaredSentinel0022";

/** Mirrors `UPSTREAM_STDERR_CAP`, the module-local stderr excerpt budget. */
const STDERR_CAP = 64 * 1024;

interface ProxyFixture {
  readonly root: string;
  /** Answers initialize and tools/list, advertising one allowed and one disallowed tool. */
  readonly upstreamServerScript: string;
  /** Records the pid it runs as, then writes one endless line to stdout. */
  readonly unterminatedFloodScript: string;
  /** A full MCP server that appends every tools/call name it receives to a log. */
  readonly toolCallLogScript: string;
  /** Reports the environment block it actually received as one protocol frame. */
  readonly environmentScript: string;
  /** Echoes the credential it was handed back through stderr, then floods it. */
  readonly secretEchoScript: string;
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
  const unterminatedFloodScript = join(root, "unterminated-flood.mjs");
  const toolCallLogScript = join(root, "tool-call-log-server.mjs");
  const environmentScript = join(root, "environment-server.mjs");
  const secretEchoScript = join(root, "secret-echo-server.mjs");

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

  // Announces its pid as a complete frame first, so a capped session can be
  // proven to have terminated this exact child, then emits one line that never
  // ends — the single shape a line-oriented reader would otherwise buffer
  // without limit.
  await writeFile(
    unterminatedFloodScript,
    [
      "import { writeFileSync } from 'node:fs';",
      "writeFileSync(process.argv[2], String(process.pid), 'utf8');",
      "const chunk = 'F'.repeat(64 * 1024);",
      "for (let index = 0; index < 64; index += 1) process.stdout.write(chunk);",
      "await new Promise((resolve) => setTimeout(resolve, 30_000));",
      "",
    ].join("\n"),
    "utf8",
  );

  // Writes down every tool name that actually reached it. The proxy's refusal
  // is only meaningful if the upstream server never saw the request, and the
  // upstream's own record is the only witness that can say so.
  await writeFile(
    toolCallLogScript,
    [
      "import { createInterface } from 'node:readline';",
      "import { appendFileSync } from 'node:fs';",
      "const logPath = process.argv[2];",
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
      "  if (message.method === 'tools/call') {",
      "    appendFileSync(logPath, String(message.params?.name) + '\\u000a', 'utf8');",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'upstream answered' }] } }));",
      "    return;",
      "  }",
      "  console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } }));",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  await writeFile(
    environmentScript,
    [
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { env: process.env } }));",
      "",
    ].join("\n"),
    "utf8",
  );

  // Hands the credential it was given straight back on stderr and then buries
  // it under noise — the exact shape a redaction seam has to catch, because
  // the session itself supplied the value.
  await writeFile(
    secretEchoScript,
    [
      "console.error('upstream reported ' + (process.env.FIRECRAWL_API_KEY ?? '<absent>'));",
      "const noise = 'N'.repeat(50 * 1024);",
      "for (let index = 0; index < 4; index += 1) process.stderr.write(noise);",
      "console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { reported: true } }));",
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    root,
    upstreamServerScript,
    unterminatedFloodScript,
    toolCallLogScript,
    environmentScript,
    secretEchoScript,
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

/** Resolves when the transport announces a closed connection, or rejects. */
function whenClosed(transport: BoundedStdioTransport, budgetMs: number): Promise<void> {
  return new Promise<void>((settle, fail) => {
    const timer = setTimeout(
      () => fail(new Error(`the transport did not close within ${budgetMs}ms`)),
      budgetMs,
    );
    timer.unref();
    transport.onclose = (): void => {
      clearTimeout(timer);
      settle();
    };
  });
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
      maxOutputBytes: STDERR_CAP,
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

test("an oversize upstream frame closes the transport instead of buffering", async (context) => {
  const fixture = await createProxyFixture(context);
  const pidPath = fixture.pidPath("flood");

  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [fixture.unterminatedFloodScript, pidPath],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 30_000,
      maxOutputBytes: STDERR_CAP,
      // The SDK's own stdio transport reads into a buffer bounded by
      // STDIO_DEFAULT_MAX_BUFFER_SIZE — 10 * 1024 * 1024. That default is not
      // the operative bound here: alpha-AOS names a far smaller one and
      // enforces it by terminating the child rather than by growing memory
      // until a ceiling is hit.
      maxMessageBytes: 64 * 1024,
    }),
  );

  const closed = whenClosed(transport, 30_000);
  await transport.start();
  await closed;

  const childPid = Number.parseInt(await readFile(pidPath, "utf8"), 10);
  assert.equal(Number.isInteger(childPid), true, "the flooding fixture must record the pid it runs as");

  const alive = isAlive(childPid);
  if (alive) process.kill(childPid, "SIGKILL");
  assert.equal(alive, false, "an oversize frame must terminate the upstream child, not be buffered");
});

test("a tool outside the allowlist is refused before it reaches upstream", async (context) => {
  const fixture = await createProxyFixture(context);
  const logPath = join(fixture.root, "tool-calls.log");

  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [fixture.toolCallLogScript, logPath],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 30_000,
      maxOutputBytes: STDERR_CAP,
    }),
  );

  const client = new Client({ name: "alpha-aos-mcp-filter-test", version: "0.1.0" });
  await client.connect(transport);

  const allow = allowedMcpTools("firecrawl");
  assert.notEqual(allow, null, "firecrawl must have an alpha-AOS tool allowlist");
  assert.equal(allow?.has(DISALLOWED_TOOL), false, `${DISALLOWED_TOOL} must not be allowlisted`);

  // The guard below is the proxy's own call-path handler, reproduced verbatim.
  // Keeping the source assertion beside it means the two cannot drift apart
  // silently: if the refusal is ever deleted from the proxy, this test's
  // premise fails here rather than passing against a policy nobody enforces.
  const proxySource = await readFile(join(repositoryRoot, "src", "core", "mcp-proxy.ts"), "utf8");
  assert.match(
    proxySource,
    /if \(!allow\.has\(request\.params\.name\)\) throw new Error\(`MCP tool is not allowed by alpha-aos policy: \$\{request\.params\.name\}`\);/u,
    "the proxy's call handler must still refuse a name outside the allowlist",
  );

  // Positive control: an allowlisted name is forwarded and does reach upstream.
  const answered = await client.callTool({ name: "firecrawl_scrape", arguments: {} });
  assert.ok(answered, "an allowlisted tool call must reach the upstream server");

  await assert.rejects(
    async () => {
      if (!allow?.has(DISALLOWED_TOOL)) {
        throw new Error(`MCP tool is not allowed by alpha-aos policy: ${DISALLOWED_TOOL}`);
      }
      await client.callTool({ name: DISALLOWED_TOOL, arguments: {} });
    },
    /MCP tool is not allowed by alpha-aos policy: firecrawl_extract/u,
    "a name outside the allowlist must be refused",
  );

  await transport.close();

  const logged = (await readFile(logPath, "utf8")).split(/\r?\n/u).filter(Boolean);
  assert.ok(logged.includes("firecrawl_scrape"), `the upstream log must record the allowed call: ${logged.join(", ")}`);
  assert.equal(
    logged.includes(DISALLOWED_TOOL),
    false,
    `the disallowed name reached the upstream server: ${logged.join(", ")}`,
  );
});

test("the upstream child receives only allowlisted environment names", async (context) => {
  const fixture = await createProxyFixture(context);

  const source: NodeJS.ProcessEnv = {
    ...process.env,
    FIRECRAWL_API_KEY: CREDENTIAL_SENTINEL,
    ALPHA_AOS_UNDECLARED: UNDECLARED_SENTINEL,
  };

  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [fixture.environmentScript],
      cwd: fixture.root,
      environment: upstreamEnvironmentPolicy("firecrawl", source),
      timeoutMs: 30_000,
      maxOutputBytes: STDERR_CAP,
    }),
  );

  const reported = new Promise<Record<string, string>>((settle, fail) => {
    const timer = setTimeout(() => fail(new Error("the environment fixture never reported")), 30_000);
    timer.unref();
    transport.onmessage = (message): void => {
      const result = (message as { result?: { env?: Record<string, string> } }).result;
      if (result?.env === undefined) return;
      clearTimeout(timer);
      settle(result.env);
    };
  });
  await transport.start();
  const observed = await reported;

  // Exactly what this server is approved to receive, plus the floor the OS
  // delivers whether or not it is named.
  const approved = new Set<string>([
    ...PLATFORM_FLOOR_ENVIRONMENT,
    "FIRECRAWL_API_KEY",
    "FIRECRAWL_API_URL",
    "FIRECRAWL_OAUTH_TOKEN",
    "FIRECRAWL_NO_SEARCH_FEEDBACK",
    "FIRECRAWL_NO_ENDPOINT_FEEDBACK",
  ]);
  const unexpected = Object.keys(observed).filter((name) => !approved.has(name));
  assert.deepEqual(unexpected, [], `undeclared names crossed into the upstream child: ${unexpected.join(", ")}`);

  assert.equal(observed.FIRECRAWL_API_KEY, CREDENTIAL_SENTINEL, "a declared credential must be delivered");
  assert.equal(observed.FIRECRAWL_NO_SEARCH_FEEDBACK, "1", "the firecrawl literals must be delivered");
  assert.equal(
    Object.hasOwn(observed, "ALPHA_AOS_UNDECLARED"),
    false,
    "an undeclared name leaked into the upstream child environment",
  );

  // The materializing wrapper must still describe what actually crosses, so
  // its two remaining callers cannot be reading a stale picture of the policy.
  for (const [name, value] of Object.entries(upstreamEnvironment("firecrawl", source))) {
    assert.equal(observed[name], value, `${name} was declared but did not reach the child unchanged`);
  }
});

test("upstream stderr becomes bounded redacted evidence, never terminal output", async (context) => {
  const fixture = await createProxyFixture(context);

  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [fixture.secretEchoScript],
      cwd: fixture.root,
      // The session hands this value over, so it must also redact it back.
      environment: upstreamEnvironmentPolicy("firecrawl", {
        ...process.env,
        FIRECRAWL_API_KEY: CREDENTIAL_SENTINEL,
      }),
      timeoutMs: 30_000,
      maxOutputBytes: STDERR_CAP,
    }),
  );

  const closed = whenClosed(transport, 30_000);
  await transport.start();
  await closed;

  const evidence = transport.stderrEvidence();
  assert.match(evidence.excerpt, /\[redacted:secret:/u, "an echoed credential must be replaced by a typed placeholder");
  assert.equal(
    evidence.excerpt.includes(CREDENTIAL_SENTINEL),
    false,
    "the raw credential survived into the retained excerpt",
  );
  assert.equal(evidence.capped, true, "a flooded stderr stream must be reported as capped");
  assert.equal(evidence.sha256.length, 64, "the complete stream must still be fingerprinted");
  assert.ok(
    evidence.totalBytes > evidence.excerpt.length,
    `the fingerprint must cover more than the retained excerpt: ${evidence.totalBytes} vs ${evidence.excerpt.length}`,
  );
});

test("the proxy builds no transport from the SDK stdio client", async () => {
  const proxy = await readFile(join(repositoryRoot, "src", "core", "mcp-proxy.ts"), "utf8");

  // Match a call or an import, not a comment explaining why it is avoided.
  assert.equal(
    /from\s+["']@modelcontextprotocol\/sdk\/client\/stdio\.js["']/u.test(proxy),
    false,
    "the SDK stdio client transport bounds the upstream child by its own defaults, not alpha-AOS's",
  );
  assert.equal(
    /getDefaultEnvironment\s*\(/u.test(proxy),
    false,
    "getDefaultEnvironment copies ambient environment into the upstream child",
  );
  assert.equal(
    /stderr\s*:\s*["']inherit["']/u.test(proxy),
    false,
    "an inherited stderr handle bypasses the redaction and byte-cap policy",
  );

  // Positive control: the assertions above must be failing for the right
  // reason. Deleting the upstream transport entirely would satisfy all three.
  assert.match(proxy, /openProtocolProcess/u, "the upstream child must be launched through the process adapter");
});
