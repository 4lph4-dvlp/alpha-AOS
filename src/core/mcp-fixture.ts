import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { HarnessId, LockedPackage, McpServerId, StackLock } from "../types.js";
import { mcpStdioCommand, planMcpSync } from "./mcp.js";
import { allowedMcpTools } from "./mcp-proxy.js";
import { materializeEnvironment, resolveCommand, resolveNodePackageCli, runProcess } from "./process.js";
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

async function discoverTools(locked: LockedPackage, server: McpServerId): Promise<string[]> {
  const command = mcpStdioCommand(server, locked);
  // Fixture credentials are deliberate non-secrets, and no real credential
  // from the ambient environment is offered to the probe child.
  const env = materializeEnvironment(
    nodeRuntimeEnvironment({
      literal: {
        CONTEXT7_API_KEY: "alpha-aos-fixture-not-a-real-key",
        EXA_API_KEY: "alpha-aos-fixture-not-a-real-key",
        FIRECRAWL_API_KEY: "alpha-aos-fixture-not-a-real-key",
        FIRECRAWL_NO_SEARCH_FEEDBACK: "1",
        FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1",
      },
    }),
  );
  const child = spawn(command.command, command.args, {
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  const responses = new Map<number, Record<string, unknown>>();
  let wake: (() => void) | null = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    const lines = stdout.split(/\r?\n/u);
    stdout = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim().startsWith("{")) continue;
      try {
        const value = JSON.parse(line) as Record<string, unknown>;
        if (typeof value.id === "number") responses.set(value.id, value);
      } catch {
        // Server diagnostics are ignored unless the protocol response times out.
      }
    }
    wake?.();
  });
  child.stderr.on("data", (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-8_000); });

  const send = (value: unknown): void => { child.stdin.write(`${JSON.stringify(value)}\n`); };
  const waitFor = async (id: number): Promise<Record<string, unknown>> => {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const response = responses.get(id);
      if (response) return response;
      await new Promise<void>((resolveWait) => {
        const timer = setTimeout(resolveWait, 250);
        wake = () => { clearTimeout(timer); wake = null; resolveWait(); };
      });
    }
    throw new Error(`${server} MCP protocol timed out. stderr: ${stderr || "<empty>"}`);
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
    child.stdin.end();
    child.kill();
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
 * The protocol probe itself is a long-lived bidirectional stdio session, which
 * the one-shot process adapter cannot express; that child is still spawned
 * directly and is named as an asserted exception in test/process.test.ts.
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
    const toolNames = await discoverTools(locked, options.server);
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
