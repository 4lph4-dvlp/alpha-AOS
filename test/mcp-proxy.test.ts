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
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test, { type TestContext } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { parse as parseYaml } from "yaml";
import { loadLock } from "../src/core/catalog.js";
import { loadCanaryCatalog, type CanaryCatalog } from "../src/core/canary.js";
import {
  allowedMcpTools,
  BoundedStdioTransport,
  MCP_SERVER_IDS,
  mcpPolicyRefusal,
  MEASURED_UPSTREAM_TOOLS,
  OBSERVED_UPSTREAM_LATE_EXIT,
  openObservedUpstream,
  upstreamEnvironment,
  upstreamEnvironmentPolicy,
  upstreamProcessSpec,
  ROUTING_CONTRACT_MISMATCH,
} from "../src/core/mcp-proxy.js";
import { userStateRoot } from "../src/core/paths.js";
import { PLATFORM_FLOOR_ENVIRONMENT, resolveNodePackageCli } from "../src/core/process.js";
import type { LockedPackage, McpServerId } from "../src/types.js";
import {
  classifyUpstreamFailure,
  REGISTRY_UNREACHABLE,
  UPSTREAM_REQUIRED_ENV_NAME,
} from "./helpers/upstream-gate.js";

/** The host state root as this process saw it before any test ran. */
const hostStateRootAtLoad = resolve(process.env.ALPHA_AOS_STATE_DIR?.trim() || join(homedir(), ".alpha-aos"));
/** The state root every pinned upstream startup in this file writes under. */
const testStateRoot = join(tmpdir(), "alpha-aos-test-mcp-proxy-state");
// node --test runs each file in its own process, so this cannot reach another file; the stable tmp root keeps the npx cache warm across CI test steps without touching the host root.
process.env.ALPHA_AOS_STATE_DIR = testStateRoot;

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
  /** An MCP server advertising exactly the comma-separated tools it is given. */
  readonly toolListScript: string;
  /** Runs `runMcpProxy` as its own child, with a file-backed observation sink. */
  readonly proxyHostScript: string;
  /** Serves its tools, then exits with the given code once stdin closes. */
  readonly lateExitScript: string;
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
  const toolListScript = join(root, "tool-list-server.mjs");
  const proxyHostScript = join(root, "proxy-host.mjs");
  const lateExitScript = join(root, "late-exit-server.mjs");

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

  // A whole MCP server whose advertised tool set is an argument, so one
  // fixture can stand in for any of the three pinned upstreams. It answers a
  // tools/call for any name it advertises — filtering is the proxy's job, and
  // a fixture that refused would hide a proxy that had stopped filtering.
  await writeFile(
    toolListScript,
    [
      "import { createInterface } from 'node:readline';",
      "const advertised = String(process.argv[2] ?? '').split(',').filter(Boolean);",
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
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: advertised.map((name) => ({ name, description: 'fixture tool', inputSchema: { type: 'object' } })) } }));",
      "    return;",
      "  }",
      "  if (message.method === 'tools/call') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'upstream answered' }] } }));",
      "    return;",
      "  }",
      "  console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'method not found' } }));",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  // The proxy owns its process's stdio once its downstream server is up, so
  // it runs as a child here exactly as the CLI runs it. The sink is
  // file-backed for the same reason: stdout belongs to the protocol.
  await writeFile(
    proxyHostScript,
    [
      `import { runMcpProxy } from ${JSON.stringify(pathToFileURL(join(repositoryRoot, "dist", "src", "core", "mcp-proxy.js")).href)};`,
      "import { appendFileSync } from 'node:fs';",
      "const [server, mode, sinkPath, upstreamScript, tools, version] = process.argv.slice(2);",
      "const sink = { record(observation) { appendFileSync(sinkPath, JSON.stringify(observation) + '\\u000a', 'utf8'); } };",
      "await runMcpProxy(server, { package: 'fixture-' + server, version, integrity: 'sha512-fixture' }, {",
      "  mode,",
      "  sink,",
      "  upstream: {",
      "    executable: process.execPath,",
      "    args: [upstreamScript, tools],",
      "    cwd: process.cwd(),",
      "    environment: { source: {} },",
      "    timeoutMs: 0,",
      "    maxOutputBytes: 64 * 1024,",
      "  },",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );

  // Answers normally and then dies badly on the way out — the Pitfall 9 shape,
  // where the useful output is already in hand when teardown faults. Exiting
  // on stdin close means it leaves on its OWN terms, so the non-zero code is
  // genuinely the child's rather than a forced termination's.
  await writeFile(
    lateExitScript,
    [
      "import { createInterface } from 'node:readline';",
      "const advertised = String(process.argv[2] ?? '').split(',').filter(Boolean);",
      "const exitCode = Number.parseInt(process.argv[3] ?? '3', 10);",
      "const lines = createInterface({ input: process.stdin });",
      "lines.on('close', () => { process.exit(exitCode); });",
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
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { tools: advertised.map((name) => ({ name, description: 'fixture tool', inputSchema: { type: 'object' } })) } }));",
      "    return;",
      "  }",
      "  if (message.method === 'tools/call') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'upstream answered' }] } }));",
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
    unterminatedFloodScript,
    toolCallLogScript,
    environmentScript,
    secretEchoScript,
    toolListScript,
    proxyHostScript,
    lateExitScript,
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

  // The guard below stands in for the proxy's own call-path handler. Keeping a
  // source assertion beside it means the two cannot drift apart silently: if
  // the refusal is ever deleted from the proxy, this test's premise fails here
  // rather than passing against a policy nobody enforces. The shape moved when
  // filtering and observation were split — a null allowlist is now forwarded
  // rather than refused — so the assertion follows the guard, not its old text.
  const proxySource = await readFile(join(repositoryRoot, "src", "core", "mcp-proxy.ts"), "utf8");
  assert.match(
    proxySource,
    /if \(allow && !allow\.has\(tool\)\) \{/u,
    "the proxy's call handler must still refuse a name outside a non-null allowlist",
  );
  assert.match(
    proxySource,
    /throw new Error\(mcpPolicyRefusal\(tool\)\);/u,
    "the refusal must still be thrown from the call handler",
  );
  // Byte-identical, not merely matching: Phase 1 D-11 made this a contract.
  assert.equal(
    mcpPolicyRefusal(DISALLOWED_TOOL),
    `MCP tool is not allowed by alpha-aos policy: ${DISALLOWED_TOOL}`,
    "the policy refusal string is a stable contract and may not be reworded",
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
  // delivers whether or not it is named. The write-location names are here
  // because they are DECLARED, not inherited — the test below asserts each
  // one arrives carrying alpha-AOS's pinned value rather than the source's.
  const approved = new Set<string>([
    ...PLATFORM_FLOOR_ENVIRONMENT,
    ...WRITE_LOCATION_NAMES,
    "npm_config_logs_max",
    "PATH",
    "PATHEXT",
    "COMSPEC",
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

  // A declared write location is only honest if the value the child receives
  // is alpha-AOS's, not the ambient one it would otherwise have inherited.
  const cacheRoot = expectedProxyCacheRoot(userStateRoot());
  for (const name of WRITE_LOCATION_NAMES) {
    assert.ok(
      observed[name]?.startsWith(cacheRoot),
      `${name} reached the child as ${observed[name]}, outside the pinned root ${cacheRoot}`,
    );
  }

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

// ---------------------------------------------------------------------------
// The three pinned servers actually start (RESEARCH.md Pitfall 8).
//
// `alpha-aos mcp-proxy firecrawl` did not start on this host: npm's cache
// location is decided by names the upstream environment policy never declared,
// so the npx child died before the JSON-RPC handshake and the harness saw
// CONNECTION_CLOSED. Nothing that observes a real MCP call can be attempted
// until that is closed, so the regression is asserted against the real pinned
// packages rather than against a fixture that could never reproduce it.
//
// These are the only tests in this suite that reach the npm registry. A leg
// that cannot reach it reports unsupported WITH the reason rather than
// disappearing into a silent green.
// ---------------------------------------------------------------------------

/** One bounded budget per pinned-server test, npx download included. */
const STARTUP_BUDGET_MS = 300_000;

/** Where a proxy child is allowed to write, given a state root. */
function expectedProxyCacheRoot(stateRoot: string): string {
  return join(stateRoot, "mcp-cache");
}

/** The names that decide where an npx child writes, and nothing else. */
const WRITE_LOCATION_NAMES = [
  "npm_config_cache",
  "APPDATA",
  "LOCALAPPDATA",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
] as const;

async function lockedMcpPackage(server: McpServerId): Promise<LockedPackage> {
  const lock = await loadLock(repositoryRoot);
  const locked = lock.components.mcp?.[server];
  assert.ok(locked, `catalog/stack.lock.json must pin an MCP component for ${server}`);
  return locked;
}

interface StartupProbe {
  /** Sorted tool names, or null when the registry could not be reached. */
  readonly tools: readonly string[] | null;
  readonly unsupportedReason: string | null;
}

/**
 * Starts one pinned server exactly the way the proxy does and asks it for its
 * tools. The environment is the product's own upstream policy — that is the
 * whole point: a policy that omits a load-bearing name fails here.
 */
async function startPinnedServer(
  fixture: ProxyFixture,
  server: McpServerId,
  source: NodeJS.ProcessEnv = process.env,
): Promise<StartupProbe> {
  const locked = await lockedMcpPackage(server);
  // The product's own spec, so a launch this test proves is the launch the
  // proxy actually performs. Only cwd and the environment source are the
  // fixture's — the executable, the pinned package and every bound are not.
  const transport = fixture.track(
    new BoundedStdioTransport({
      ...upstreamProcessSpec(server, locked),
      cwd: fixture.root,
      environment: upstreamEnvironmentPolicy(server, source),
    }),
  );

  const client = new Client({ name: "alpha-aos-mcp-startup-probe", version: "0.1.0" });
  try {
    // A cold npx cache downloads the package before the server can answer, so
    // the handshake budget is the download budget, not the protocol's.
    await client.connect(transport, { timeout: STARTUP_BUDGET_MS });
    const listed = await client.listTools(undefined, { timeout: STARTUP_BUDGET_MS });
    return { tools: listed.tools.map((tool) => tool.name).sort(), unsupportedReason: null };
  } catch (error) {
    let stderr = "";
    try {
      stderr = transport.stderrEvidence().excerpt;
    } catch {
      stderr = "<the session never started, so there is no upstream evidence>";
    }
    const classification = classifyUpstreamFailure({
      stderr,
      packageName: locked.package,
      version: locked.version,
      env: source,
    });
    if (classification.kind === "skip") {
      return {
        tools: null,
        unsupportedReason: classification.reason,
      };
    }
    throw new Error(
      `${server} (${locked.package}@${locked.version}) did not answer a tools listing: ` +
        `${error instanceof Error ? error.message : String(error)}; ${classification.reason}; ` +
        `upstream gate: ${UPSTREAM_REQUIRED_ENV_NAME}; upstream stderr: ${stderr}`,
    );
  } finally {
    await transport.close().catch(() => undefined);
  }
}

test("registry-unreachable stderr skips when the pinned upstream is not required", () => {
  const stderr = "npm error code ENOTFOUND registry.npmjs.org";
  assert.equal(REGISTRY_UNREACHABLE.test(stderr), true, "the fixture must exercise registry vocabulary");
  const result = classifyUpstreamFailure({
    stderr,
    packageName: "example-mcp",
    version: "1.2.3",
    env: {},
  });

  assert.equal(result.kind, "skip");
  assert.match(result.reason, /example-mcp@1\.2\.3/u);
});

test("registry-unreachable stderr fails when the pinned upstream is required", () => {
  const result = classifyUpstreamFailure({
    stderr: "npm error code ENOTFOUND registry.npmjs.org",
    packageName: "example-mcp",
    version: "1.2.3",
    env: { [UPSTREAM_REQUIRED_ENV_NAME]: "1" },
  });

  assert.equal(result.kind, "fail");
  assert.match(result.reason, /example-mcp@1\.2\.3/u);
  assert.match(result.reason, /required the pinned upstream/u);
});

test("a non-registry startup failure cannot be skipped", () => {
  const result = classifyUpstreamFailure({
    stderr: "the package started and rejected its configuration",
    packageName: "example-mcp",
    version: "1.2.3",
    env: {},
  });

  assert.equal(result.kind, "fail");
});

test("empty stderr cannot be treated as evidence of an unreachable registry", () => {
  const result = classifyUpstreamFailure({
    stderr: "",
    packageName: "example-mcp",
    version: "1.2.3",
    env: {},
  });

  assert.equal(result.kind, "fail");
});

test("CI requires pinned upstream MCP startups using the helper's gate name", async () => {
  const workflow = parseYaml(await readFile(join(repositoryRoot, ".github", "workflows", "ci.yml"), "utf8")) as {
    jobs?: { test?: { env?: Record<string, unknown> } };
  };

  assert.equal(workflow.jobs?.test?.env?.[UPSTREAM_REQUIRED_ENV_NAME], "1");
});

test("the context7 proxy starts and lists exactly its two tools", { timeout: STARTUP_BUDGET_MS }, async (context) => {
  const fixture = await createProxyFixture(context);
  const probe = await startPinnedServer(fixture, "context7");
  if (probe.tools === null) {
    context.skip(`unsupported: ${probe.unsupportedReason}`);
    return;
  }
  // The SET, not the count: a server that renames a tool must go red rather
  // than pass silently against a number that happens to still match.
  assert.deepEqual(probe.tools, ["query-docs", "resolve-library-id"]);
});

test("the exa proxy starts and lists exactly its two tools", { timeout: STARTUP_BUDGET_MS }, async (context) => {
  const fixture = await createProxyFixture(context);
  const probe = await startPinnedServer(fixture, "exa");
  if (probe.tools === null) {
    context.skip(`unsupported: ${probe.unsupportedReason}`);
    return;
  }
  assert.deepEqual(probe.tools, ["web_fetch_exa", "web_search_exa"]);
});

test("the firecrawl proxy starts and lists its allowlisted tools", { timeout: STARTUP_BUDGET_MS }, async (context) => {
  const fixture = await createProxyFixture(context);
  const probe = await startPinnedServer(fixture, "firecrawl");
  if (probe.tools === null) {
    context.skip(`unsupported: ${probe.unsupportedReason}`);
    return;
  }
  // This is the Pitfall 8 regression. Before the environment repair the same
  // command exits with an MCP closed-connection error and never reaches here.
  const allow = allowedMcpTools("firecrawl");
  assert.notEqual(allow, null, "firecrawl must have an alpha-AOS tool allowlist");
  const filtered = probe.tools.filter((name) => allow?.has(name));
  assert.deepEqual(filtered, [
    "firecrawl_check_crawl_status",
    "firecrawl_crawl",
    "firecrawl_map",
    "firecrawl_scrape",
  ]);
});

test("pinned upstream startups keep their npx cache under the test-owned state root, never the host state root", () => {
  assert.equal(userStateRoot(), testStateRoot, "this file must resolve its own state root, not the host one");
  assert.notEqual(testStateRoot, hostStateRootAtLoad, "the test-owned state root must differ from the host state root");
  const fromHost = relative(hostStateRootAtLoad, testStateRoot);
  assert.ok(
    fromHost.split(/[\\/]/)[0] === ".." || isAbsolute(fromHost),
    `the test-owned state root ${testStateRoot} must sit outside the host state root ${hostStateRootAtLoad}`,
  );
  const expectedCache = join(expectedProxyCacheRoot(testStateRoot), "npm-cache");
  for (const server of MCP_SERVER_IDS) {
    const cache = upstreamEnvironmentPolicy(server).literal?.npm_config_cache;
    assert.equal(cache, expectedCache, `${server} must pin its npx cache under the test-owned state root`);
    assert.ok(
      !cache.startsWith(hostStateRootAtLoad),
      `${server} npx cache ${cache} must not sit under the host state root ${hostStateRootAtLoad}`,
    );
  }
});

test("the module pins a proxy cache root under the managed state root", async () => {
  // Read through a cast so this test compiles against the module as it is
  // today: the assertion is that the export exists, not the compiler's.
  const loaded = (await import("../src/core/mcp-proxy.js")) as unknown as Record<string, unknown>;
  const cacheRootOf = loaded.proxyCacheRoot;
  assert.equal(typeof cacheRootOf, "function", "mcp-proxy must export proxyCacheRoot");
  const stateRoot = join(tmpdir(), "alpha-aos-state-root-fixture");
  assert.equal(
    (cacheRootOf as (root?: string) => string)(stateRoot),
    expectedProxyCacheRoot(stateRoot),
    "the proxy cache root must sit under the state root it was given",
  );
  assert.equal(
    (cacheRootOf as (root?: string) => string)(),
    expectedProxyCacheRoot(userStateRoot()),
    "with no argument the proxy cache root must sit under the managed user state root",
  );
});

test("the upstream child's write locations are declared, never inherited", async () => {
  const home = join(tmpdir(), "alpha-aos-home-fixture");
  const source: NodeJS.ProcessEnv = {
    ...process.env,
    APPDATA: join(home, "AppData", "Roaming"),
    LOCALAPPDATA: join(home, "AppData", "Local"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    npm_config_cache: join(home, "npm-cache"),
  };

  const materialized = upstreamEnvironment("firecrawl", source);
  const cacheRoot = expectedProxyCacheRoot(userStateRoot());

  for (const name of WRITE_LOCATION_NAMES) {
    const value = materialized[name];
    assert.ok(value !== undefined, `${name} decides where the child writes and must be declared`);
    assert.ok(
      value.startsWith(cacheRoot),
      `${name} must resolve under the managed cache root ${cacheRoot}, not ${value}`,
    );
    assert.notEqual(value, source[name], `${name} was inherited from the ambient environment`);
  }
  assert.equal(
    materialized.npm_config_logs_max,
    "0",
    "an npm debug log is a write into the pinned root for every invocation",
  );

  // The repair must not have widened or narrowed anything else.
  const policy = upstreamEnvironmentPolicy("firecrawl", source);
  for (const name of ["FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "FIRECRAWL_OAUTH_TOKEN"]) {
    assert.equal(
      policy.optional?.includes(name),
      true,
      `${name} must still be an approved upstream credential name`,
    );
  }
  for (const name of PLATFORM_FLOOR_ENVIRONMENT) {
    assert.equal(
      policy.optional?.includes(name),
      true,
      `${name} is delivered by the OS regardless, so the allowlist must keep naming it`,
    );
  }
  assert.equal(
    policy.optional?.includes("PATH"),
    true,
    "PATH must be present so node shebangs can resolve node across all platforms",
  );
  assert.equal(
    materialized.FIRECRAWL_NO_SEARCH_FEEDBACK,
    "1",
    "the firecrawl feedback-suppression literals must survive the repair",
  );
});

test("a proxy launch writes nothing into the user's home", { timeout: STARTUP_BUDGET_MS }, async (context) => {
  const fixture = await createProxyFixture(context);
  const syntheticHome = join(fixture.root, "synthetic-home");
  const syntheticState = join(fixture.root, "synthetic-state");
  await mkdir(syntheticHome, { recursive: true });
  await mkdir(syntheticState, { recursive: true });

  // userStateRoot() reads this name, so the pinned cache lands in the fixture
  // rather than in the developer's real managed root.
  const previousStateDir = process.env.ALPHA_AOS_STATE_DIR;
  process.env.ALPHA_AOS_STATE_DIR = syntheticState;
  context.after(() => {
    if (previousStateDir === undefined) delete process.env.ALPHA_AOS_STATE_DIR;
    else process.env.ALPHA_AOS_STATE_DIR = previousStateDir;
  });

  const source: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: syntheticHome,
    USERPROFILE: syntheticHome,
    ALPHA_AOS_STATE_DIR: syntheticState,
  };

  const probe = await startPinnedServer(fixture, "context7", source);
  if (probe.tools === null) {
    context.skip(`unsupported: ${probe.unsupportedReason}`);
    return;
  }

  const homeEntries = await readdir(syntheticHome);
  assert.deepEqual(homeEntries, [], `a proxy launch wrote into the user's home: ${homeEntries.join(", ")}`);

  // Positive control: the pin is load-bearing rather than vacuous — npm did
  // write, and it wrote where alpha-AOS said it could.
  const cacheEntries = await readdir(expectedProxyCacheRoot(syntheticState)).catch(() => [] as string[]);
  assert.ok(
    cacheEntries.length > 0,
    "the pinned cache root received nothing, so the empty home proves nothing about where npm writes",
  );
});

// ---------------------------------------------------------------------------
// Observation is a separate responsibility from filtering (D-01, D-02).
//
// CAPA-01 and CAPA-02 both need a real MCP call to be OBSERVED, and the two
// servers a capability canary reaches for first — context7 and exa — have no
// allowlist at all. The module used to fuse the two jobs: `runMcpFilterProxy`
// refused outright for any server whose allowlist was null, so the seam that
// records a call could not be put in front of the servers that need it.
//
// Splitting them is only safe if observing changes nothing about what may be
// called, and if a record carries names and outcomes but never values. Both
// are asserted here, offline, against fixture upstreams.
// ---------------------------------------------------------------------------

/** The byte-identical policy refusal Phase 1 D-11 pinned as a stable contract. */
const POLICY_REFUSAL = "MCP tool is not allowed by alpha-aos policy: firecrawl_extract";

/** Passed as a tool ARGUMENT, so a record that stored arguments would carry it. */
const ARGUMENT_SENTINEL = "alphaAOSargumentSentinel0033";

/** What the fixture upstreams advertise, per server. */
const FIXTURE_TOOLS: Record<McpServerId, readonly string[]> = {
  context7: ["resolve-library-id", "query-docs"],
  exa: ["web_search_exa", "web_fetch_exa"],
  firecrawl: [
    "firecrawl_scrape",
    "firecrawl_map",
    "firecrawl_crawl",
    "firecrawl_check_crawl_status",
    DISALLOWED_TOOL,
  ],
};

/** The pinned version a fixture proxy reports as the observed upstream. */
const FIXTURE_VERSION = "9.9.9";

interface ProxyChild {
  readonly client: Client;
  /** Every observation the proxy's sink recorded, in order. */
  observations(): Promise<Record<string, unknown>[]>;
  /** The proxy child's own stderr, for a failure that needs explaining. */
  readonly transport: BoundedStdioTransport;
}

/**
 * Runs `runMcpProxy` as its own child and speaks MCP to it.
 *
 * The proxy owns this process's stdio when it stands up its downstream server,
 * so it cannot be driven in-process by a test runner that also owns stdio. A
 * child is not a workaround: it is how the CLI runs it.
 */
async function startProxyChild(
  fixture: ProxyFixture,
  options: { server: McpServerId; mode: "filter" | "observe" },
): Promise<ProxyChild> {
  const sinkPath = join(fixture.root, `observations-${options.server}-${options.mode}.jsonl`);
  const transport = fixture.track(
    new BoundedStdioTransport({
      executable: process.execPath,
      args: [
        fixture.proxyHostScript,
        options.server,
        options.mode,
        sinkPath,
        fixture.toolListScript,
        FIXTURE_TOOLS[options.server].join(","),
        FIXTURE_VERSION,
      ],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 60_000,
      maxOutputBytes: STDERR_CAP,
    }),
  );
  const client = new Client({ name: "alpha-aos-mcp-observation-test", version: "0.1.0" });
  try {
    await client.connect(transport, { timeout: 30_000 });
  } catch (error) {
    let stderr = "";
    try {
      stderr = transport.stderrEvidence().excerpt;
    } catch {
      stderr = "<the proxy child never started>";
    }
    throw new Error(
      `runMcpProxy did not front ${options.server} in ${options.mode} mode: ` +
        `${error instanceof Error ? error.message : String(error)}; proxy stderr: ${stderr}`,
    );
  }
  return {
    client,
    transport,
    async observations(): Promise<Record<string, unknown>[]> {
      const text = await readFile(sinkPath, "utf8").catch(() => "");
      return text
        .split(/\r?\n/u)
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>);
    },
  };
}

async function listedToolNames(child: ProxyChild): Promise<string[]> {
  const listed = await child.client.listTools(undefined, { timeout: 30_000 });
  return listed.tools.map((tool) => tool.name).sort();
}

test("a server with no allowlist is fronted for observation instead of refused", async (context) => {
  const fixture = await createProxyFixture(context);

  for (const server of ["context7", "exa"] as const) {
    const child = await startProxyChild(fixture, { server, mode: "observe" });
    assert.deepEqual(
      await listedToolNames(child),
      [...FIXTURE_TOOLS[server]].sort(),
      `${server} has no allowlist, so its tool listing must be forwarded unchanged`,
    );
  }
});

test("observing firecrawl does not widen the tools it may call", async (context) => {
  const fixture = await createProxyFixture(context);

  const filtered = await startProxyChild(fixture, { server: "firecrawl", mode: "filter" });
  const observed = await startProxyChild(fixture, { server: "firecrawl", mode: "observe" });

  const expected = [
    "firecrawl_check_crawl_status",
    "firecrawl_crawl",
    "firecrawl_map",
    "firecrawl_scrape",
  ];
  assert.deepEqual(await listedToolNames(filtered), expected, "filter mode must drop the disallowed tool");
  assert.deepEqual(await listedToolNames(observed), expected, "observation must not widen the allowed surface");
});

test("a denied tool still produces the byte-identical policy refusal", async (context) => {
  const fixture = await createProxyFixture(context);
  const child = await startProxyChild(fixture, { server: "firecrawl", mode: "observe" });

  await assert.rejects(
    async () => child.client.callTool({ name: DISALLOWED_TOOL, arguments: {} }, undefined, { timeout: 30_000 }),
    (error: unknown) => {
      // The exact string, not a pattern: Phase 1 D-11 made this a contract a
      // caller may match on, so a reworded refusal is a breaking change.
      assert.ok(String((error as Error).message).includes(POLICY_REFUSAL), String((error as Error).message));
      return true;
    },
  );

  // A refusal is itself evidence: the canary must be able to see that the
  // model reached for a tool policy denied it.
  const records = await child.observations();
  assert.equal(records.length, 1, `a denied call must be recorded exactly once: ${JSON.stringify(records)}`);
  assert.equal(records[0]?.outcome, "denied");
  assert.equal(records[0]?.tool, DISALLOWED_TOOL);
});

test("an observed tool call records names and outcomes but never values", async (context) => {
  const fixture = await createProxyFixture(context);
  const child = await startProxyChild(fixture, { server: "firecrawl", mode: "observe" });

  await child.client.callTool(
    { name: "firecrawl_scrape", arguments: { url: "https://example.invalid", apiKey: ARGUMENT_SENTINEL } },
    undefined,
    { timeout: 30_000 },
  );

  const records = await child.observations();
  assert.equal(records.length, 1, `exactly one record per observed call: ${JSON.stringify(records)}`);
  const record = records[0] ?? {};

  assert.deepEqual(
    Object.keys(record).sort(),
    ["at", "outcome", "server", "tool", "upstreamVersion"],
    "an observation is a closed record: no argument field, no response field",
  );
  assert.equal(record.server, "firecrawl");
  assert.equal(record.tool, "firecrawl_scrape");
  assert.equal(record.outcome, "ok");
  assert.equal(record.upstreamVersion, FIXTURE_VERSION, "the record must name the upstream version from the lock");
  assert.ok(
    typeof record.at === "string" && !Number.isNaN(Date.parse(record.at)),
    `the record must carry an ISO timestamp: ${String(record.at)}`,
  );

  // Arguments are where credentials live. The serialized record is the thing
  // that reaches a ledger or a CI log, so that is what is asserted.
  assert.equal(
    JSON.stringify(record).includes(ARGUMENT_SENTINEL),
    false,
    "a credential passed as a tool argument survived into the observation record",
  );
});

test("filter mode records nothing even when a sink is supplied", async (context) => {
  const fixture = await createProxyFixture(context);
  const child = await startProxyChild(fixture, { server: "firecrawl", mode: "filter" });

  await child.client.callTool({ name: "firecrawl_scrape", arguments: {} }, undefined, { timeout: 30_000 });

  assert.deepEqual(
    await child.observations(),
    [],
    "D-02: the everyday filter proxy is not an observation surface",
  );
});

test("the CLI can front every pinned server, not only the filtered one", async () => {
  // `alpha-aos mcp-proxy <id>` is what a harness config points at, so the
  // command's own argument gate decides whether context7 and exa can be
  // observed at all. Driven through the built CLI: a unit test of
  // MCP_SERVER_IDS would not have caught the branch that refused them.
  const result = spawnSync(process.execPath, [join(repositoryRoot, "dist", "src", "cli.js"), "mcp-proxy", "bogus"], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "an unknown server id must be refused");
  const message = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  for (const server of MCP_SERVER_IDS) {
    assert.ok(message.includes(server), `the usage message must name ${server}: ${message}`);
  }
  assert.deepEqual(
    [...MCP_SERVER_IDS].sort(),
    ["context7", "exa", "firecrawl"],
    "the frontable set is the pinned set, derived from the upstream environment table",
  );
});

// ---------------------------------------------------------------------------
// A per-canary open/close cycle (RESEARCH.md Pitfall 9).
//
// An everyday filter proxy closes once per harness session. An observation
// proxy closes once per canary run, so it exercises teardown far more often —
// and a clean stdio MCP client close on this Windows host has already been
// observed producing a libuv assertion AFTER the useful output was in hand.
// A crash on the way out must not be allowed to discard a proof that already
// exists, and must not be allowed to disappear either.
// ---------------------------------------------------------------------------

/** Every value the session's delivery union declares (src/core/process.ts). */
const KILL_DELIVERIES = ["group", "direct", "windows-tree", "already-gone", "not-required"];

test("an observed session closes through the bounded contract and keeps its proof", async (context) => {
  const fixture = await createProxyFixture(context);
  const sunk: Record<string, unknown>[] = [];

  const upstream = await openObservedUpstream(
    "firecrawl",
    { package: "fixture-firecrawl", version: FIXTURE_VERSION, integrity: "sha512-fixture" },
    { record: (observation) => void sunk.push({ ...observation }) },
    {
      executable: process.execPath,
      args: [fixture.toolListScript, FIXTURE_TOOLS.firecrawl.join(",")],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 60_000,
      maxOutputBytes: STDERR_CAP,
    },
  );

  await upstream.callTool({ name: "firecrawl_scrape", arguments: {} });
  assert.equal(upstream.observations().length, 1, "the call must be recorded before close");

  const closed = await upstream.close();

  assert.equal(closed.observations.length, 1, "an observation recorded before close must survive it");
  assert.equal(closed.observations[0]?.tool, "firecrawl_scrape");
  assert.equal(sunk.length, 1, "the caller's own sink must have received the same record");
  assert.ok(
    closed.treeTermination !== null && KILL_DELIVERIES.includes(closed.treeTermination),
    `the reported delivery path must be one the session's union declares: ${String(closed.treeTermination)}`,
  );
  assert.equal(closed.finding, null, "a clean teardown is not a finding");
});

test("a non-zero child exit after a complete record is a named finding, not a failure", async (context) => {
  const fixture = await createProxyFixture(context);

  const upstream = await openObservedUpstream(
    "firecrawl",
    { package: "fixture-firecrawl", version: FIXTURE_VERSION, integrity: "sha512-fixture" },
    { record: () => undefined },
    {
      executable: process.execPath,
      args: [fixture.lateExitScript, FIXTURE_TOOLS.firecrawl.join(","), "3"],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 60_000,
      maxOutputBytes: STDERR_CAP,
    },
  );

  await upstream.callTool({ name: "firecrawl_scrape", arguments: {} });

  // Not a rejection: the proof was already complete when the child crashed.
  const closed = await upstream.close();

  assert.equal(closed.observations.length, 1, "the record must survive a child that exits badly");
  assert.notEqual(closed.finding, null, "a non-zero exit after a complete record must be reported");
  assert.equal(
    closed.finding?.code,
    OBSERVED_UPSTREAM_LATE_EXIT,
    "the finding must carry a stable upper-snake code, not only a message",
  );
  assert.equal(closed.finding?.reason, "non-zero-exit");
  assert.equal(closed.finding?.exitCode, 3);
  assert.equal(
    closed.finding?.completed.length,
    1,
    "the finding must state which observations were already complete when it fired",
  );
  assert.equal(closed.finding?.completed[0]?.tool, "firecrawl_scrape");
});

test("a non-zero child exit with no complete record is a genuine failure", async (context) => {
  const fixture = await createProxyFixture(context);

  const upstream = await openObservedUpstream(
    "firecrawl",
    { package: "fixture-firecrawl", version: FIXTURE_VERSION, integrity: "sha512-fixture" },
    { record: () => undefined },
    {
      executable: process.execPath,
      args: [fixture.lateExitScript, FIXTURE_TOOLS.firecrawl.join(","), "3"],
      cwd: fixture.root,
      environment: { source: {} },
      timeoutMs: 60_000,
      maxOutputBytes: STDERR_CAP,
    },
  );

  // Nothing was observed, so there is no proof to protect and the fault is
  // simply a failed run.
  await assert.rejects(
    async () => upstream.close(),
    /exited 3 with no complete observation record/u,
  );
});

test("the observed close path builds no SDK transport close of its own", async () => {
  const proxy = await readFile(join(repositoryRoot, "src", "core", "mcp-proxy.ts"), "utf8");
  const code = proxy
    .split(/\r?\n/u)
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/u.test(line))
    .join("\n");

  assert.ok(
    code.includes("session.close()"),
    "teardown must route through the process adapter's bounded session close",
  );

  // Positive control: the block being checked must actually be there, or the
  // absence assertion below would pass against nothing.
  const start = code.indexOf("close: async (): Promise<ObservedUpstreamClose>");
  assert.notEqual(start, -1, "the observed-upstream close must exist to be checked");

  // The SDK client's own close tears down its transport its way, bypassing the
  // descendant termination Phase 1 hardened across three operating systems.
  assert.equal(
    code.slice(start).includes("client.close()"),
    false,
    "the observed close must not reach the SDK client's own transport teardown",
  );
  assert.ok(
    code.slice(start).includes("transport.closeSession()"),
    "the observed close must go through the bounded transport's session close",
  );
});

// ---------------------------------------------------------------------------
// Plan 03-08 Task 1 — the `narrow` routing-contract decision, made checkable
//
// Plan 03-07 recorded option `narrow`: the four-name extraction allowlist does
// not move, PROJECT.md's bounded-extraction claim stays true as written, the
// reconciliation lands in an alpha-AOS-owned instruction, and the leftover
// disagreement with the pinned third-party text becomes a named, versioned
// finding. These assertions are what make a one-sided future edit red instead
// of silently reopening the question.
// ---------------------------------------------------------------------------

/** The shipped canary catalog, read from the repository rather than a fixture. */
async function shippedCanaryCatalog(): Promise<CanaryCatalog> {
  const loaded = await loadCanaryCatalog(repositoryRoot);
  return loaded.value;
}

test("the extraction allowlist is exactly the four names the narrow decision preserved", () => {
  const allow = allowedMcpTools("firecrawl");
  assert.ok(allow, "firecrawl must carry a tool allowlist");
  assert.deepEqual(
    [...allow].sort(),
    ["firecrawl_check_crawl_status", "firecrawl_crawl", "firecrawl_map", "firecrawl_scrape"],
    "plan 03-07 recorded that this set does not move; widening it changes a stated product claim in PROJECT.md",
  );
  // Negative control for the assertion above: the one name the pinned
  // third-party instructions direct discovery at is the name that must NOT be
  // here. Without this line the deepEqual could be satisfied by a set that
  // simply spelled the four differently.
  assert.equal(allow.has("firecrawl_search"), false);
});

test("every declared canary expectation names a tool a pinned server was measured to publish", async () => {
  const catalog = await shippedCanaryCatalog();
  const measured = new Set(Object.values(MEASURED_UPSTREAM_TOOLS).flatMap((surface) => surface.tools));
  assert.equal(measured.size >= 6, true, "the measured surface table is suspiciously small; the check below would be weak");

  for (const canary of catalog.canaries) {
    for (const tool of [...canary.expectTools, ...canary.forbidTools]) {
      assert.equal(
        measured.has(tool),
        true,
        `${canary.id} names ${tool}, which no pinned server was measured to publish. An expectation checked against a ` +
          "document rather than a tools listing is how the third-party routing text came to name two tools that do not exist.",
      );
    }
  }

  // Negative control: a name that reads like a tool but was never measured must
  // fail this check, or the loop above would pass over any string at all.
  assert.equal(measured.has("web_search_advanced_exa"), false);
  assert.equal(measured.has("crawling_exa"), false);
});

test("the extraction allowlist and the declared research expectations agree", async () => {
  const catalog = await shippedCanaryCatalog();
  const allow = allowedMcpTools("firecrawl");
  assert.ok(allow);
  const research = catalog.canaries.find((canary) => canary.id === "RESEARCH_MULTI_SOURCE");
  assert.ok(research, "the multi-source research canary is not declared");

  const firecrawlNames = (names: readonly string[]): string[] =>
    names.filter((name) => MEASURED_UPSTREAM_TOOLS.firecrawl.tools.includes(name));

  // Expected extraction tools must be PERMITTED. An expectation the proxy would
  // refuse can never be satisfied, so a canary declaring one would be red for a
  // policy reason while reporting a routing failure.
  for (const tool of firecrawlNames(research.expectTools)) {
    assert.equal(allow.has(tool), true, `the research canary expects ${tool}, which the allowlist does not permit`);
  }
  // Forbidden extraction tools must be DENIED. A forbidden name the allowlist
  // permits is a finding the proxy would never produce.
  for (const tool of firecrawlNames(research.forbidTools)) {
    assert.equal(allow.has(tool), false, `the research canary forbids ${tool}, but the allowlist permits it`);
  }
  assert.equal(
    firecrawlNames(research.expectTools).length + firecrawlNames(research.forbidTools).length >= 2,
    true,
    "neither list names an extraction tool, so the agreement above was checked against nothing",
  );
});

test("the recorded routing-contract finding carries the pinned runtime version and a stable code", () => {
  assert.equal(ROUTING_CONTRACT_MISMATCH.code, "ECC_RESEARCH_ROUTING_CONTRACT_MISMATCH");
  assert.match(ROUTING_CONTRACT_MISMATCH.code, /^[A-Z][A-Z0-9_]*$/u);
  assert.equal(
    ROUTING_CONTRACT_MISMATCH.runtime,
    "ecc-universal@2.2.0",
    "the finding must carry the exact pinned runtime, or a later bump that changed the text is invisible",
  );

  const allow = allowedMcpTools("firecrawl");
  assert.ok(allow);
  for (const name of ROUTING_CONTRACT_MISMATCH.namesDeniedByPolicy) {
    assert.equal(allow.has(name), false, `${name} is recorded as denied by policy but the allowlist permits it`);
  }
  const measured = new Set(Object.values(MEASURED_UPSTREAM_TOOLS).flatMap((surface) => surface.tools));
  for (const name of ROUTING_CONTRACT_MISMATCH.namesNotPublished) {
    assert.equal(measured.has(name), false, `${name} is recorded as unpublished but the measured surface table has it`);
  }
  assert.equal(ROUTING_CONTRACT_MISMATCH.namesNotPublished.length >= 1, true);
  assert.equal(ROUTING_CONTRACT_MISMATCH.namesDeniedByPolicy.length >= 1, true);
});

test("the alpha-AOS-owned routing instruction names the published tools and none of the three that disagree", async () => {
  const source = join(repositoryRoot, ROUTING_CONTRACT_MISMATCH.reconciledBy);
  const text = await readFile(source, "utf8");

  assert.ok(text.startsWith("---\n"), "an owned instruction must start with YAML frontmatter, as alpha-aos-ship does");
  assert.ok(text.includes("name: alpha-aos-research-routing"), "the instruction does not declare its own name");
  assert.ok(text.includes("description:"), "the instruction has no description, so nothing tells a model when it applies");
  assert.ok(text.includes("allowed-tools:"), "the instruction declares no tool surface");

  // It must state the contract in the identifiers the servers actually publish.
  for (const tool of ["web_search_exa", "firecrawl_scrape"]) {
    assert.ok(text.includes(tool), `the instruction does not name ${tool}, so it states no routing contract at all`);
  }
  // And it must not repeat the three names the third-party text got wrong: two
  // that no pinned server publishes, one that policy denies.
  for (const name of [...ROUTING_CONTRACT_MISMATCH.namesNotPublished, ...ROUTING_CONTRACT_MISMATCH.namesDeniedByPolicy]) {
    assert.equal(
      text.includes(name),
      false,
      `the owned instruction repeats ${name}, which is one of the names it exists to correct`,
    );
  }
});

test("the pinned third-party research instruction's bytes are untouched by this reconciliation", async (context: TestContext) => {
  // 03-CONTEXT.md D-07 and the design doc forbid editing the shipped skill, and
  // PLAN_RENDERER_ID = "ecc-skill/identity" means an edited one would fail its
  // own exact-hash contract. Asserted rather than trusted: `narrow` is the
  // option that touches no third-party bytes, and this is that half of it.
  // The pinned runtime is installed globally on a real host, not into this
  // repository, so both roots are tried before the file is called absent.
  const npm = resolveNodePackageCli("npm");
  const globalRoot = spawnSync(npm.executable, [...npm.argsPrefix, "root", "-g"], { encoding: "utf8" }).stdout?.trim() ?? "";
  const candidates = [
    join(repositoryRoot, "node_modules", "ecc-universal", ROUTING_CONTRACT_MISMATCH.document),
    ...(globalRoot.length > 0 ? [join(globalRoot, "ecc-universal", ROUTING_CONTRACT_MISMATCH.document)] : []),
  ];
  const shipped = candidates.find((candidate) => existsSync(candidate));
  if (shipped === undefined) {
    context.skip(`${ROUTING_CONTRACT_MISMATCH.runtime} is installed in neither ${candidates.join(" nor ")}`);
    return;
  }
  const text = await readFile(shipped, "utf8");
  assert.equal(
    text.includes("alpha-aos"),
    false,
    "the shipped third-party instruction mentions alpha-aos, so its bytes were modified",
  );
  // Positive control: the file this test is asserting about must be the one
  // that carries the disagreement, or the absence assertion proves nothing.
  assert.ok(
    ROUTING_CONTRACT_MISMATCH.namesNotPublished.some((name) => text.includes(name)) ||
      ROUTING_CONTRACT_MISMATCH.namesDeniedByPolicy.some((name) => text.includes(name)),
    "the shipped instruction names none of the disputed tools, so the recorded finding describes a different document",
  );
});

test("the proxy fixture's advertised tools agree with the measured upstream surfaces", () => {
  // The fixture in this file stands in for the real servers. If it drifts from
  // what the servers were measured to publish, every proxy assertion above is
  // checking alpha-AOS against alpha-AOS's own idea of the upstream.
  for (const server of MCP_SERVER_IDS) {
    const measured = MEASURED_UPSTREAM_TOOLS[server];
    for (const tool of FIXTURE_TOOLS[server]) {
      assert.equal(
        measured.tools.includes(tool),
        true,
        `the ${server} fixture advertises ${tool}, which is not in the measured upstream surface`,
      );
    }
    if (measured.complete) {
      assert.deepEqual(
        [...FIXTURE_TOOLS[server]].sort(),
        [...measured.tools].sort(),
        `${server}'s surface was measured complete, so the fixture must advertise all of it and nothing else`,
      );
    }
  }
});

test("an observed call records the identifier's SHAPE and never the identifier itself", async (context) => {
  // The end-to-end half of plan 03-08 Task 2's offline matcher assertions: a
  // real call through a real observing proxy, so the classification is proven
  // on the path a canary actually travels rather than only on a synthetic
  // record. Added as a regression guard after the offline behaviours were
  // green, and recorded as such rather than counted as a RED.
  const fixture = await createProxyFixture(context);
  const child = await startProxyChild(fixture, { server: "context7", mode: "observe" });
  const identifier = "/vercel/next.js/v16.2.2";

  await child.client.callTool(
    { name: "resolve-library-id", arguments: { libraryName: "Next.js" } },
    undefined,
    { timeout: 30_000 },
  );
  await child.client.callTool(
    { name: "query-docs", arguments: { libraryId: identifier, query: "streaming route handlers" } },
    undefined,
    { timeout: 30_000 },
  );

  const records = await child.observations();
  assert.equal(records.length, 2, `exactly one record per observed call: ${JSON.stringify(records)}`);

  const queried = records.find((record) => record.tool === "query-docs");
  assert.ok(queried, "the observed query-docs call produced no record");
  assert.deepEqual(
    Object.keys(queried).sort(),
    ["at", "identifierShape", "outcome", "server", "tool", "upstreamVersion"],
    "the record is still closed: the five original fields plus exactly one classification, and no argument field",
  );
  assert.equal(queried.identifierShape, "version-scoped");

  // A tool alpha-AOS declares no identifier argument for carries no shape at
  // all, so the field stays a declared classification rather than a reader of
  // whatever was passed.
  const resolved = records.find((record) => record.tool === "resolve-library-id");
  assert.ok(resolved);
  assert.equal(Object.hasOwn(resolved, "identifierShape"), false);

  // And the identifier VALUE is nowhere in what a ledger or a CI log reads.
  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes(identifier), false, "the identifier value reached the observation record");
  assert.equal(serialized.includes("next.js"), false, "part of the identifier value reached the observation record");
  assert.equal(
    serialized.includes("version-scoped"),
    true,
    "the shape is absent too, so the two assertions above prove nothing",
  );
});

test("an unscoped identifier is classified as unscoped rather than left unrecorded", async (context) => {
  // The negative control for the assertion above: without it, "version-scoped"
  // could be a constant the proxy writes for every classified call.
  const fixture = await createProxyFixture(context);
  const child = await startProxyChild(fixture, { server: "context7", mode: "observe" });

  await child.client.callTool(
    { name: "query-docs", arguments: { libraryId: "/vercel/next.js" } },
    undefined,
    { timeout: 30_000 },
  );

  const records = await child.observations();
  const queried = records.find((record) => record.tool === "query-docs");
  assert.ok(queried);
  assert.equal(queried.identifierShape, "unscoped");
});
