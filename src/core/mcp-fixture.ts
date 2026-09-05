import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, LockedPackage, McpServerId, StackLock } from "../types.js";
import { mcpStdioCommand, planMcpSync } from "./mcp.js";
import { allowedMcpTools } from "./mcp-proxy.js";
import { openProtocolProcess, resolveCommand, resolveNodePackageCli, runProcess } from "./process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "./install.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  beginFixture,
  plannedFixtureRoot,
  plannedProof,
  reviewedDigest,
} from "./component-session.js";

interface PackResult {
  filename: string;
  integrity: string;
}

export interface McpFixtureResult {
  harness: HarnessId;
  server: McpServerId;
  version: string;
  integrity: string;
  toolNames: string[];
  expectedToolFound: boolean;
  configPath: string;
  configHash: string;
  credentialStored: false;
  piBridgeVersion: string | null;
  retainedFixture: string | null;
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function parsePackResult(stdout: string): PackResult {
  const start = stdout.indexOf("[");
  if (start < 0) throw new Error(`npm pack did not return JSON: ${stdout}`);
  const value = JSON.parse(stdout.slice(start)) as unknown;
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== "object" || value[0] === null) throw new Error("npm pack returned an unexpected result");
  const first = value[0] as Record<string, unknown>;
  if (typeof first.filename !== "string" || typeof first.integrity !== "string") throw new Error("npm pack result lacks filename or integrity");
  return { filename: first.filename, integrity: first.integrity };
}

async function verifyPackage(fixtureRoot: string, locked: LockedPackage, label: string): Promise<void> {
  const packRoot = join(fixtureRoot, "packs", label);
  await mkdir(packRoot, { recursive: true });
  const npm = resolveNodePackageCli("npm");
  const result = await runProcess({
    executable: npm.executable,
    args: [...npm.argsPrefix, "pack", `${locked.package}@${locked.version}`, "--json", "--pack-destination", packRoot],
    cwd: fixtureRoot,
    timeoutMs: 180_000,
    maxOutputBytes: 256 * 1024,
    environment: nodeRuntimeEnvironment(),
  });
  if (result.code !== "ok") throw new Error(describeProcessFailure(`npm pack for ${label}`, result));
  const packed = parsePackResult(result.stdout.excerpt);
  if (packed.integrity !== locked.integrity) throw new Error(`${label} integrity mismatch: expected ${locked.integrity}, got ${packed.integrity}`);
  if (!existsSync(join(packRoot, basename(packed.filename)))) throw new Error(`${label} archive is missing after npm pack`);
}

function expectedTool(server: McpServerId, name: string): boolean {
  switch (server) {
    case "context7": return name === "resolve-library-id" || name === "query-docs" || name.includes("library") || name.includes("docs");
    case "exa": return name === "web_search_exa" || name === "web_fetch_exa";
    case "firecrawl": return name === "firecrawl_scrape";
  }
}

/**
 * Drives one MCP server's stdio JSON-RPC handshake far enough to read its
 * advertised tool surface.
 *
 * The session, not this function, owns the boundary: no shell, an absolute
 * executable, only the environment names declared below, an absolute deadline,
 * and a byte cap that terminates a server emitting one endless line.
 *
 * The resolved stdio command is injected rather than derived from the lock, so
 * the probe can be driven against a fake upstream server in the test suite —
 * this is a production path with no other automated coverage.
 */
export async function discoverTools(
  command: { command: string; args: readonly string[] },
  server: McpServerId,
  cwd: string,
): Promise<string[]> {
  const session = await openProtocolProcess({
    executable: command.command,
    args: command.args,
    cwd,
    // Fixture credentials are deliberate non-secrets, and no real credential
    // from the ambient environment is offered to the probe child. The policy
    // is handed over unmaterialized so the session also seeds its redaction
    // context from the secret-bearing names it passes.
    environment: nodeRuntimeEnvironment({
      literal: {
        CONTEXT7_API_KEY: "alpha-aos-fixture-not-a-real-key",
        EXA_API_KEY: "alpha-aos-fixture-not-a-real-key",
        FIRECRAWL_API_KEY: "alpha-aos-fixture-not-a-real-key",
        FIRECRAWL_NO_SEARCH_FEEDBACK: "1",
        FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1",
      },
    }),
    timeoutMs: 120_000,
    maxOutputBytes: 64 * 1024,
  });

  const send = (value: unknown): void => { session.send(value); };
  const waitFor = async (id: number): Promise<Record<string, unknown>> => {
    try {
      return await session.waitFor((message) => message.id === id, 60_000);
    } catch {
      // A wait ends only with a coded session outcome, so the failure is
      // described from exit metadata and stream fingerprints — never by
      // interpolating what the child happened to print (D-12).
      throw new Error(describeProcessFailure(`${server} MCP protocol`, await session.close()));
    }
  };

  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "alpha-aos-fixture", version: "0.1.0" },
      },
    });
    const initialized = await waitFor(1);
    if (initialized.error) throw new Error(`${server} initialize failed: ${JSON.stringify(initialized.error)}`);
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    const listed = await waitFor(2);
    if (listed.error) throw new Error(`${server} tools/list failed: ${JSON.stringify(listed.error)}`);
    const result = listed.result as Record<string, unknown> | undefined;
    const tools = result?.tools;
    if (!Array.isArray(tools)) throw new Error(`${server} tools/list returned no tool array`);
    return tools.map((tool) => typeof tool === "object" && tool !== null ? String((tool as Record<string, unknown>).name ?? "") : "").filter(Boolean);
  } finally {
    await session.close();
  }
}

async function installPiBridge(fixtureRoot: string, bridge: LockedPackage): Promise<string> {
  await verifyPackage(fixtureRoot, bridge, "pi-mcp-adapter");
  const pi = resolveCommand("pi");
  if (!pi) throw new Error("Pi executable is required for the Pi MCP bridge fixture");
  const agentRoot = join(fixtureRoot, "home", ".pi", "agent");
  await mkdir(agentRoot, { recursive: true });
  const installed = await runProcess({
    executable: pi,
    args: ["install", `npm:${bridge.package}@${bridge.version}`],
    cwd: fixtureRoot,
    timeoutMs: 180_000,
    maxOutputBytes: 256 * 1024,
    environment: nodeRuntimeEnvironment({ literal: { PI_CODING_AGENT_DIR: agentRoot } }),
  });
  if (installed.code !== "ok") throw new Error(describeProcessFailure("Pi MCP bridge install", installed));
  const packageJson = join(agentRoot, "npm", "node_modules", bridge.package, "package.json");
  const manifest = JSON.parse(await readFile(packageJson, "utf8")) as Record<string, unknown>;
  if (manifest.version !== bridge.version) throw new Error(`Pi MCP bridge version mismatch: ${String(manifest.version)}`);
  const settings = JSON.parse(await readFile(join(agentRoot, "settings.json"), "utf8")) as Record<string, unknown>;
  const packages = settings.packages;
  if (!Array.isArray(packages) || !packages.includes(`npm:${bridge.package}@${bridge.version}`)) throw new Error("Pi settings did not record the exact bridge package");
  return bridge.version;
}

function fixtureConfigPath(root: string, harness: HarnessId): string {
  switch (harness) {
    case "claude": return join(root, "home", ".claude.json");
    case "codex": return join(root, "home", ".codex", "config.toml");
    case "antigravity": return join(root, "home", ".gemini", "config", "mcp_config.json");
    case "pi": return join(root, "home", ".pi", "agent", "mcp.json");
    case "hermes": return join(root, "home", ".hermes", "config.yaml");
  }
}

// ---------------------------------------------------------------------------
// Complete fixture operation plan
// ---------------------------------------------------------------------------

export interface McpFixtureOperationPlan {
  kind: "mcp-fixture";
  harness: HarnessId;
  server: McpServerId;
  /** Named before it exists, so the location is reviewed rather than discovered. */
  fixtureRoot: string;
  packRoot: string;
  configPath: string;
  /** The Pi agent root the bridge fixture writes into; null for other harnesses. */
  piAgentRoot: string | null;
  package: { name: string; version: string; integrity: string };
  piBridge: { name: string; version: string; integrity: string } | null;
  proofs: OperationPathProofSet;
  digest: string;
}

/**
 * Enumerates every path this fixture may use, before it creates anything.
 *
 * The protocol probe itself is a long-lived bidirectional stdio session. It
 * runs through the process adapter's protocol-session mode, so it shares the
 * stdout frame cap, the absolute deadline and the environment allowlist with
 * every other child alpha-AOS starts.
 */
export async function createMcpFixtureOperationPlan(options: {
  harness: HarnessId;
  server: McpServerId;
  lock: StackLock;
  fixtureRoot?: string;
}): Promise<McpFixtureOperationPlan> {
  const locked = options.lock.components.mcp?.[options.server];
  if (!locked) throw new Error(`Stable lock has no MCP component: ${options.server}`);
  const fixtureRoot = resolve(options.fixtureRoot ?? plannedFixtureRoot(`alpha-aos-mcp-${options.server}-${options.harness}`));
  const packRoot = join(fixtureRoot, "packs", options.server);
  const configPath = fixtureConfigPath(fixtureRoot, options.harness);
  const bridge = options.harness === "pi" ? options.lock.components.mcpBridges?.pi ?? null : null;
  if (options.harness === "pi" && !bridge) throw new Error("Stable lock has no Pi MCP bridge");
  const piAgentRoot = options.harness === "pi" ? join(fixtureRoot, "home", ".pi", "agent") : null;

  const inputs: OperationPathInput[] = [
    { role: "temp", path: fixtureRoot },
    { role: "temp", path: packRoot },
    { role: "target", path: configPath },
  ];
  if (piAgentRoot !== null) inputs.push({ role: "temp", path: piAgentRoot }, { role: "temp", path: join(fixtureRoot, "packs", "pi-mcp-adapter") });
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: [fixtureRoot],
    requiredRoles: ["temp", "target"],
  });

  const digest = reviewedDigest("mcp-fixture", {
    harness: options.harness,
    server: options.server,
    fixtureRoot,
    packRoot,
    configPath,
    piAgentRoot,
    package: { name: locked.package, version: locked.version, integrity: locked.integrity },
    piBridge: bridge === null ? null : { name: bridge.package, version: bridge.version, integrity: bridge.integrity },
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "mcp-fixture",
    harness: options.harness,
    server: options.server,
    fixtureRoot,
    packRoot,
    configPath,
    piAgentRoot,
    package: { name: locked.package, version: locked.version, integrity: locked.integrity },
    piBridge: bridge === null ? null : { name: bridge.package, version: bridge.version, integrity: bridge.integrity },
    proofs,
    digest,
  };
}

export async function runMcpFixture(options: {
  harness: HarnessId;
  server: McpServerId;
  lock: StackLock;
  keep?: boolean;
  /** A fixture plan reviewed by the operation that authorized this run. */
  plan?: McpFixtureOperationPlan;
  /** The operation writer; the fixture refuses to start before it exists. */
  session?: MutationSession;
}): Promise<McpFixtureResult> {
  const locked = options.lock.components.mcp?.[options.server];
  if (!locked) throw new Error(`Stable lock has no MCP component: ${options.server}`);
  const reviewed = options.plan ?? await createMcpFixtureOperationPlan(options);
  assertPlanUnchanged(reviewed, await createMcpFixtureOperationPlan({
    harness: reviewed.harness,
    server: reviewed.server,
    lock: options.lock,
    fixtureRoot: reviewed.fixtureRoot,
  }));

  const fixtureRoot = reviewed.fixtureRoot;
  await beginFixture(reviewed, options.session);
  let retain = true;
  try {
    await verifyPackage(fixtureRoot, locked, options.server);
    const configPath = reviewed.configPath;
    plannedProof(reviewed, "target", configPath);
    const plan = await planMcpSync(options.harness, options.lock, {
      configPath,
      selected: [options.server],
      env: {},
    });
    const toolNames = await discoverTools(mcpStdioCommand(options.server, locked), options.server, fixtureRoot);
    if (toolNames.length === 0) throw new Error(`${options.server} exposed zero tools`);
    const expectedToolFound = toolNames.some((name) => expectedTool(options.server, name));
    if (!expectedToolFound) throw new Error(`${options.server} did not expose its expected tool family: ${toolNames.join(", ")}`);
    const allow = allowedMcpTools(options.server);
    if (allow && (toolNames.length !== allow.size || toolNames.some((name) => !allow.has(name)))) {
      throw new Error(`${options.server} filtered tool surface drifted: ${toolNames.join(", ")}`);
    }
    let piBridgeVersion: string | null = null;
    if (options.harness === "pi") {
      const bridge = options.lock.components.mcpBridges?.pi;
      if (!bridge) throw new Error("Stable lock has no Pi MCP bridge");
      plannedProof(reviewed, "temp", reviewed.piAgentRoot as string);
      piBridgeVersion = await installPiBridge(fixtureRoot, bridge);
    }
    retain = options.keep ?? false;
    return {
      harness: options.harness,
      server: options.server,
      version: locked.version,
      integrity: locked.integrity,
      toolNames,
      expectedToolFound,
      configPath: plan.configPath,
      configHash: plan.expectedHash,
      credentialStored: false,
      piBridgeVersion,
      retainedFixture: retain ? fixtureRoot : null,
    };
  } finally {
    if (!retain) {
      const tempRoot = resolve(tmpdir());
      if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) throw new Error(`Unsafe MCP fixture cleanup path: ${fixtureRoot}`);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
}
