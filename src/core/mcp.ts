import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { HarnessId, LockedPackage, McpServerId, StackLock } from "../types.js";
import { resolveNodePackageCli } from "./process.js";
import { aliasPath, createPathAliases, userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import {
  parseManagedDocument,
  validateAgainstSchema,
  type ManagedFormat,
  type ValidationIssue,
} from "./validation.js";

const serverOrder: McpServerId[] = ["context7", "exa", "firecrawl"];

interface McpDefinition {
  id: McpServerId;
  credentialEnv: string;
  credentialRequiredForCalls: boolean;
  fixedEnv?: Record<string, string>;
}

const definitions: Record<McpServerId, McpDefinition> = {
  context7: {
    id: "context7",
    credentialEnv: "CONTEXT7_API_KEY",
    credentialRequiredForCalls: false,
  },
  exa: {
    id: "exa",
    credentialEnv: "EXA_API_KEY",
    credentialRequiredForCalls: true,
  },
  firecrawl: {
    id: "firecrawl",
    credentialEnv: "FIRECRAWL_API_KEY",
    credentialRequiredForCalls: false,
    fixedEnv: {
      FIRECRAWL_NO_SEARCH_FEEDBACK: "1",
      FIRECRAWL_NO_ENDPOINT_FEEDBACK: "1",
    },
  },
};

export interface McpSyncEntry {
  server: McpServerId;
  package: string;
  version: string;
  integrity: string;
  credentialEnv: string;
  credentialPresent: boolean;
  credentialRequiredForCalls: boolean;
}

export interface McpSyncPlan {
  harness: HarnessId;
  configPath: string;
  action: "create" | "update" | "current";
  currentHash: string | null;
  expectedHash: string;
  entries: McpSyncEntry[];
  piBridgeRequired: boolean;
  piBridge: LockedPackage | null;
  piBridgeCurrent: boolean;
  notes: string[];
  rendered: string;
}

interface StdioCommand {
  command: string;
  args: string[];
}

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function lockedServers(lock: StackLock, selected: McpServerId[]): Record<McpServerId, LockedPackage> {
  const mcp = lock.components.mcp;
  if (!mcp) throw new Error("Stable lock has no MCP components");
  const result = {} as Record<McpServerId, LockedPackage>;
  for (const id of selected) {
    const locked = mcp[id];
    if (!locked) throw new Error(`Stable lock has no MCP component: ${id}`);
    if (!locked.integrity.startsWith("sha512-")) throw new Error(`MCP integrity is invalid: ${id}`);
    result[id] = locked;
  }
  return result;
}

export function globalMcpConfigPath(harness: HarnessId, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  switch (harness) {
    case "claude": return join(home, ".claude.json");
    case "codex": return join(env.CODEX_HOME?.trim() || join(home, ".codex"), "config.toml");
    case "antigravity": return join(home, ".gemini", "config", "mcp_config.json");
    case "pi": return join(env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent"), "mcp.json");
    case "hermes": return join(env.HERMES_HOME?.trim() || join(home, ".hermes"), "config.yaml");
  }
}

export function mcpStdioCommand(server: McpServerId, locked: LockedPackage): StdioCommand {
  if (server === "firecrawl") {
    return {
      command: process.execPath,
      args: [fileURLToPath(new URL("../cli.js", import.meta.url)), "mcp-proxy", "firecrawl"],
    };
  }
  const npx = resolveNodePackageCli("npx");
  return {
    command: npx.executable,
    args: [...npx.argsPrefix, "--yes", `${locked.package}@${locked.version}`],
  };
}

function jsonObject(text: string, label: string): Record<string, unknown> {
  if (!text.trim()) return {};
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must contain a JSON object`);
  return value as Record<string, unknown>;
}

function jsonServer(command: StdioCommand, definition: McpDefinition, harness: "claude" | "antigravity" | "pi"): Record<string, unknown> {
  const fixedEnv = definition.fixedEnv ?? {};
  if (harness === "pi") {
    return {
      command: command.command,
      args: command.args,
      env: { [definition.credentialEnv]: `\${${definition.credentialEnv}}`, ...fixedEnv },
      lifecycle: "lazy",
      directTools: false,
    };
  }
  return {
    ...(harness === "claude" ? { type: "stdio" } : {}),
    command: command.command,
    args: command.args,
    ...(Object.keys(fixedEnv).length > 0 ? { env: fixedEnv } : {}),
  };
}

function renderJsonConfig(harness: "claude" | "antigravity" | "pi", existing: string, locks: Record<McpServerId, LockedPackage>, selected: McpServerId[]): string {
  const root = jsonObject(existing, `${harness} MCP config`);
  const rawServers = root.mcpServers;
  const servers = typeof rawServers === "object" && rawServers !== null && !Array.isArray(rawServers)
    ? { ...(rawServers as Record<string, unknown>) }
    : {};
  for (const id of selected) servers[id] = jsonServer(mcpStdioCommand(id, locks[id]), definitions[id], harness);
  root.mcpServers = servers;
  if (harness === "pi") {
    const rawSettings = root.settings;
    const settings = typeof rawSettings === "object" && rawSettings !== null && !Array.isArray(rawSettings)
      ? { ...(rawSettings as Record<string, unknown>) }
      : {};
    root.settings = {
      ...settings,
      hostConfigDiscovery: "off",
      directTools: false,
      toolPrefix: "server",
      notifyOnStartupConnect: false,
      outputGuard: true,
    };
  }
  return `${JSON.stringify(root, null, 2)}\n`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function managedJsonIsCurrent(
  harness: "claude" | "antigravity" | "pi",
  existing: string,
  rendered: string,
  selected: McpServerId[],
): boolean {
  if (!existing.trim()) return false;
  const current = jsonObject(existing, `${harness} MCP config`);
  const desired = jsonObject(rendered, `${harness} rendered MCP config`);
  const currentServers = current.mcpServers;
  const desiredServers = desired.mcpServers;
  if (typeof currentServers !== "object" || currentServers === null || Array.isArray(currentServers)) return false;
  if (typeof desiredServers !== "object" || desiredServers === null || Array.isArray(desiredServers)) return false;
  for (const id of selected) {
    const currentEntry = (currentServers as Record<string, unknown>)[id];
    const desiredEntry = (desiredServers as Record<string, unknown>)[id];
    if (canonicalJson(currentEntry) !== canonicalJson(desiredEntry)) return false;
  }
  if (harness === "pi") {
    const managedSettings = ["hostConfigDiscovery", "directTools", "toolPrefix", "notifyOnStartupConnect", "outputGuard"];
    const currentSettings = typeof current.settings === "object" && current.settings !== null && !Array.isArray(current.settings)
      ? current.settings as Record<string, unknown>
      : {};
    const desiredSettings = desired.settings as Record<string, unknown>;
    for (const key of managedSettings) {
      if (canonicalJson(currentSettings[key]) !== canonicalJson(desiredSettings[key])) return false;
    }
  }
  return true;
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function stripManagedToml(text: string): string {
  let result = text.replace(/(?:^|\r?\n)# alpha-aos:start mcp[\s\S]*?# alpha-aos:end mcp(?:\r?\n|$)/gu, "\n");
  for (const id of serverOrder) {
    const lines = result.split(/\r?\n/u);
    const kept: string[] = [];
    let skip = false;
    const prefix = `mcp_servers.${id}`;
    for (const line of lines) {
      const match = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
      if (match) {
        const table = (match[1] ?? "").replaceAll('"', "").replaceAll("'", "");
        skip = table === prefix || table.startsWith(`${prefix}.`);
      }
      if (!skip) kept.push(line);
    }
    result = kept.join("\n");
  }
  return result.trimEnd();
}

function existingCodexServerIds(text: string): McpServerId[] {
  const found = new Set<McpServerId>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^\s*\[mcp_servers\.([^.\]"']+)(?:\.[^\]]+)?\]\s*(?:#.*)?$/u.exec(line);
    const id = match?.[1] as McpServerId | undefined;
    if (id && serverOrder.includes(id)) found.add(id);
  }
  return serverOrder.filter((id) => found.has(id));
}

function renderCodexConfig(existing: string, locks: Record<McpServerId, LockedPackage>, selected: McpServerId[]): string {
  const base = stripManagedToml(existing);
  const blocks: string[] = ["# alpha-aos:start mcp"];
  for (const id of selected) {
    const definition = definitions[id];
    const command = mcpStdioCommand(id, locks[id]);
    blocks.push(
      `[mcp_servers.${id}]`,
      `command = ${tomlString(command.command)}`,
      `args = [${command.args.map(tomlString).join(", ")}]`,
    );
    if (definition.credentialRequiredForCalls) blocks.push(`env_vars = [${tomlString(definition.credentialEnv)}]`);
    blocks.push("startup_timeout_sec = 40");
    if (definition.fixedEnv) {
      blocks.push(`[mcp_servers.${id}.env]`);
      for (const [name, value] of Object.entries(definition.fixedEnv)) blocks.push(`${name} = ${tomlString(value)}`);
    }
    blocks.push("");
  }
  blocks.push("# alpha-aos:end mcp");
  return `${base ? `${base}\n\n` : ""}${blocks.join("\n")}\n`;
}

function renderHermesConfig(existing: string, locks: Record<McpServerId, LockedPackage>, selected: McpServerId[]): string {
  const document = parseDocument(existing.trim() ? existing : "{}\n");
  if (document.errors.length > 0) throw new Error(`Hermes config YAML is invalid: ${document.errors[0]?.message ?? "unknown parse error"}`);
  for (const id of selected) {
    const definition = definitions[id];
    const command = mcpStdioCommand(id, locks[id]);
    document.setIn(["mcp_servers", id], {
      command: command.command,
      args: command.args,
      env: { [definition.credentialEnv]: `\${${definition.credentialEnv}}`, ...(definition.fixedEnv ?? {}) },
      connect_timeout: 40,
      enabled: true,
    });
  }
  return document.toString({ lineWidth: 0 });
}

export function renderMcpConfig(harness: HarnessId, existing: string, lock: StackLock, selected: McpServerId[] = serverOrder): string {
  // Codex stores alpha-AOS servers in a single managed TOML block. Rebuilding
  // that block for one selected server must retain the other managed servers;
  // otherwise `--server exa` would silently remove an existing Context7 entry.
  const renderedIds = harness === "codex"
    ? serverOrder.filter((id) => selected.includes(id) || existingCodexServerIds(existing).includes(id))
    : selected;
  const locks = lockedServers(lock, renderedIds);
  switch (harness) {
    case "claude": return renderJsonConfig("claude", existing, locks, renderedIds);
    case "codex": return renderCodexConfig(existing, locks, renderedIds);
    case "antigravity": return renderJsonConfig("antigravity", existing, locks, renderedIds);
    case "pi": return renderJsonConfig("pi", existing, locks, renderedIds);
    case "hermes": return renderHermesConfig(existing, locks, renderedIds);
  }
}

function assertNoCredentialValue(rendered: string, env: NodeJS.ProcessEnv): void {
  for (const definition of Object.values(definitions)) {
    const value = env[definition.credentialEnv];
    if (value && value.length >= 4 && rendered.includes(value)) throw new Error(`Rendered MCP config contains the value of ${definition.credentialEnv}`);
  }
}

/** The syntax each harness writes its native configuration in. */
export function nativeConfigFormat(harness: HarnessId): ManagedFormat {
  if (harness === "codex") return "toml";
  if (harness === "hermes") return "yaml";
  return "json";
}

export class NativeConfigError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(harness: HarnessId, configPath: string, issues: readonly ValidationIssue[]) {
    const first = issues[0];
    super(
      `Native ${harness} configuration at ${aliasPath(configPath, createPathAliases())} was rejected` +
        `${first ? `: ${first.code} at ${first.documentPath} (${first.expected})` : ""}`,
    );
    this.name = "NativeConfigError";
    this.issues = issues;
  }
}

/**
 * The fields alpha-AOS writes on a managed MCP server entry.
 *
 * `additionalProperties` stays open on purpose. A harness owns the rest of its
 * own entry — Codex writes `startup_timeout_sec`, for example — and claiming
 * the whole object would mean rejecting or discarding fields that are not this
 * tool's to manage. Only the fields alpha-AOS renders are checked.
 */
const OWNED_SERVER_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["command", "args"],
  properties: {
    type: { const: "stdio" },
    command: { type: "string", minLength: 1 },
    args: { type: "array", items: { type: "string" } },
    env: { type: "object", additionalProperties: { type: "string" } },
    lifecycle: { enum: ["lazy", "eager"] },
    directTools: { type: "boolean" },
  },
  additionalProperties: true,
};

/**
 * Validates a native configuration file before anything is rendered or
 * applied. Syntax ambiguity — a duplicate key, a multi-document YAML stream,
 * a colliding TOML key — is rejected here, and each alpha-AOS-owned entry is
 * checked against the managed shape.
 *
 * User-owned keys are deliberately not validated, defaulted, or removed: this
 * tool owns its own entries and nothing else in the file.
 */
export function validateNativeConfig(harness: HarnessId, text: string): ValidationIssue[] {
  if (!text.trim()) return [];
  const format = nativeConfigFormat(harness);
  const parsed = parseManagedDocument({ text, format });
  if (!parsed.ok) return parsed.issues;

  const root = parsed.value;
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return [
      {
        code: "schema.not-an-object",
        documentPath: "/",
        expected: "an object at the configuration root",
        actualShape: Array.isArray(root) ? `array(length=${root.length})` : typeof root,
      },
    ];
  }

  const record = root as Record<string, unknown>;
  const serversKey = harness === "codex" ? "mcp_servers" : "mcpServers";
  const servers = record[serversKey];
  if (servers === undefined) return [];
  if (typeof servers !== "object" || servers === null || Array.isArray(servers)) {
    return [
      {
        code: "schema.type",
        documentPath: `/${serversKey}`,
        expected: "an object mapping server ids to definitions",
        actualShape: Array.isArray(servers) ? `array(length=${servers.length})` : typeof servers,
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  for (const id of serverOrder) {
    const entry = (servers as Record<string, unknown>)[id];
    if (entry === undefined) continue;
    issues.push(...validateAgainstSchema(entry, OWNED_SERVER_SCHEMA, `/${serversKey}/${id}`));
  }
  return issues;
}

export async function planMcpSync(harness: HarnessId, lock: StackLock, options: {
  configPath?: string;
  selected?: McpServerId[];
  env?: NodeJS.ProcessEnv;
} = {}): Promise<McpSyncPlan> {
  const configPath = options.configPath ?? globalMcpConfigPath(harness);
  const selected = options.selected ?? serverOrder;
  const env = options.env ?? process.env;
  const existing = existsSync(configPath) ? await readFile(configPath, "utf8") : "";
  // Ambiguous or malformed native input ends here, before a renderer is asked
  // to reason about it and long before anything is written.
  const issues = validateNativeConfig(harness, existing);
  if (issues.length > 0) throw new NativeConfigError(harness, configPath, issues);
  const rendered = renderMcpConfig(harness, existing, lock, selected);
  assertNoCredentialValue(rendered, env);
  const currentHash = existing ? sha256(existing) : null;
  const managedCurrent = currentHash !== null && (
    harness === "claude" || harness === "antigravity" || harness === "pi"
      ? managedJsonIsCurrent(harness, existing, rendered, selected)
      : currentHash === sha256(rendered)
  );
  const expectedHash = managedCurrent ? currentHash : sha256(rendered);
  const locks = lockedServers(lock, selected);
  const entries = selected.map((id): McpSyncEntry => ({
    server: id,
    package: locks[id].package,
    version: locks[id].version,
    integrity: locks[id].integrity,
    credentialEnv: definitions[id].credentialEnv,
    credentialPresent: Boolean(env[definitions[id].credentialEnv]),
    credentialRequiredForCalls: definitions[id].credentialRequiredForCalls,
  }));
  const piBridge = harness === "pi" ? lock.components.mcpBridges?.pi ?? null : null;
  if (harness === "pi" && !piBridge) throw new Error("Stable lock has no Pi MCP bridge");
  let piBridgeCurrent = false;
  if (harness === "pi" && piBridge) {
    const manifestPath = join(dirname(configPath), "npm", "node_modules", piBridge.package, "package.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
        piBridgeCurrent = manifest.version === piBridge.version;
      } catch {
        piBridgeCurrent = false;
      }
    }
  }
  const notes = [
    "No credential value is written to the config, lock, journal, or command arguments.",
    harness === "antigravity"
      ? "The global Antigravity config is shared by GUI, IDE, and CLI; restart those processes after changing user environment variables."
      : "Restart the harness after changing user environment variables.",
  ];
  if (harness === "pi") notes.push("Pi requires the separately pinned pi-mcp-adapter package before this config can load.");
  if (entries.some((entry) => entry.credentialRequiredForCalls && !entry.credentialPresent)) notes.push("At least one server can be registered but cannot complete authenticated calls until its required environment variable is set.");
  const plan: McpSyncPlan = {
    harness,
    configPath,
    action: managedCurrent ? "current" : currentHash ? "update" : "create",
    currentHash,
    expectedHash,
    entries,
    piBridgeRequired: harness === "pi",
    piBridge,
    piBridgeCurrent,
    notes,
    rendered,
  };
  // The rendered document can contain unrelated user-owned MCP configuration.
  // Keep it available to the transaction layer but never emit it through --json.
  Object.defineProperty(plan, "rendered", { value: rendered, enumerable: false, writable: false });
  return plan;
}

export async function applyMcpSync(harness: HarnessId, lock: StackLock, options: {
  configPath?: string;
  selected?: McpServerId[];
  env?: NodeJS.ProcessEnv;
  stateRoot?: string;
} = {}): Promise<{ operationId: string | null; plan: McpSyncPlan }> {
  const plan = await planMcpSync(harness, lock, options);
  if (plan.action === "current") return { operationId: null, plan };
  if (harness === "pi" && !plan.piBridgeCurrent) throw new Error(`Pi MCP bridge ${plan.piBridge?.package}@${plan.piBridge?.version} must be installed and fixture-verified before applying MCP config`);
  const journal = await applyFileTransaction({
    stateRoot: options.stateRoot ?? userStateRoot(),
    allowedRoots: [dirname(plan.configPath)],
    operations: [{ target: plan.configPath, content: plan.rendered }],
  });
  return { operationId: journal.id, plan: await planMcpSync(harness, lock, options) };
}

export function mcpServerIds(): McpServerId[] {
  return [...serverOrder];
}
