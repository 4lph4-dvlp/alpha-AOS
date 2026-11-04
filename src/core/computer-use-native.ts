import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { BoundedStdioTransport } from "./mcp-proxy.js";
import { commandProbeEnvironment, resolveCommand } from "./process.js";
import { packageRoot } from "./paths.js";

// Ordinary GUI work uses native standard approvals. Autopilot's bounded broker
// remains a separate entrypoint with an exact approved task grant.
export const defaultCuaTools: ReadonlySet<string> = new Set([
  "list_apps", "list_windows", "get_window_state", "get_accessibility_tree",
  "get_browser_state", "get_guide", "check_permissions", "health_report",
  "start_session", "end_session", "get_session", "get_session_state",
  "click", "right_click", "double_click", "drag", "type_text", "press_key",
  "hotkey", "scroll", "zoom", "set_value", "invoke_menu", "launch_app",
  "bring_to_front", "set_window_frame", "move_cursor", "get_agent_cursor_state",
  "set_agent_cursor_enabled", "set_agent_cursor_motion", "set_agent_cursor_theme",
  "browser_prepare", "browser_navigate", "browser_click", "browser_dialog",
  "browser_pointer", "browser_select", "browser_type", "verify_state",
]);

interface NativeAsset { os: string; arch: string; entrypoint: string; files: Record<string, string> }
interface NativePin { version: string; sourceCommit: string; assets: NativeAsset[] }

export async function verifyNativeCua(executable: string, root = packageRoot()): Promise<{ executable: string; version: string; executableHash: string }> {
  const pin = JSON.parse(await readFile(join(root, "catalog", "computer-use-runtime.json"), "utf8")) as NativePin;
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const asset = pin.assets.find((item) => item.os === os && (item.arch === process.arch || item.arch === "universal"));
  const safeName = (name: string): boolean => /^(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(name) && name.split("/").every((part) => part !== "." && part !== "..");
  if (!asset?.entrypoint || !safeName(asset.entrypoint) || !asset.files || Object.keys(asset.files).length < 1 || Object.keys(asset.files).length > 32 || !/^[a-f0-9]{64}$/.test(asset.files[asset.entrypoint] ?? "")) throw new Error("Cua has no reviewed runtime for this platform/architecture");
  const resolved = await realpath(executable);
  let extractionRoot = resolved;
  for (const _part of asset.entrypoint.split("/")) extractionRoot = dirname(extractionRoot);
  if (await realpath(join(extractionRoot, asset.entrypoint)) !== resolved) throw new Error("Cua executable is not the reviewed entrypoint");
  for (const [name, hash] of Object.entries(asset.files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("Cua runtime pin is invalid");
    const file = join(extractionRoot, ...name.split("/"));
    const rel = relative(extractionRoot, await realpath(file));
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Cua runtime companion is outside the release root");
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 || createHash("sha256").update(await readFile(file)).digest("hex") !== hash) throw new Error("Cua runtime bytes differ from the reviewed release; update Cua Driver before connecting");
  }
  return { executable: resolved, version: pin.version, executableHash: asset.files[asset.entrypoint]! };
}

export async function nativeCuaStatus(root = packageRoot()): Promise<Record<string, unknown>> {
  const executable = resolveCommand("cua-driver");
  if (!executable) return { available: false, reason: "Cua Driver is not installed or not on PATH" };
  try { const runtime = await verifyNativeCua(executable, root); return { available: true, version: runtime.version, executableHash: runtime.executableHash, reason: "Reviewed native bytes available; tools and GUI behavior require live invocation" }; }
  catch { return { available: false, reason: "Installed Cua Driver does not match the reviewed runtime; update or repair it" }; }
}

export function createNativeCuaServer(client: Pick<Client, "listTools" | "callTool">, revalidate: () => Promise<unknown>): Server {
  const server = new Server({ name: "alpha-aos-cua", version: "0.6.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    await revalidate();
    const listing = await client.listTools(request.params);
    return { ...listing, tools: listing.tools.filter((tool) => defaultCuaTools.has(tool.name)) };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    if (!defaultCuaTools.has(request.params.name)) throw new Error("Cua tool is outside the managed GUI surface");
    await revalidate();
    return client.callTool(request.params, undefined, { signal: extra.signal, timeout: 120_000 });
  });
  return server;
}

export async function serveNativeCua(downstream: Transport = new StdioServerTransport()): Promise<void> {
  const executable = resolveCommand("cua-driver");
  if (!executable) throw new Error("Install the reviewed Cua Driver release, then reconnect this harness");
  const runtime = await verifyNativeCua(executable);
  const probe = commandProbeEnvironment();
  const upstream = new BoundedStdioTransport({
    executable: runtime.executable, args: ["mcp", "--direct"],
    cwd: dirname(runtime.executable), timeoutMs: 0, maxOutputBytes: 256 * 1024 * 1024, maxMessageBytes: 24 * 1024 * 1024,
    environment: {
      source: process.env,
      optional: [...(probe.optional ?? []), "LOCALAPPDATA", "APPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"],
      literal: { CUA_DRIVER_PERMISSION_MODE: "standard", CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false" },
    },
  });
  const client = new Client({ name: "alpha-aos-cua", version: "0.6.0" });
  const server = createNativeCuaServer(client, () => verifyNativeCua(runtime.executable));
  let ended!: () => void;
  const closed = new Promise<void>((resolve) => { ended = resolve; });
  const stdio = downstream instanceof StdioServerTransport;
  if (stdio) { process.stdin.once("end", ended); process.stdin.once("close", ended); }
  const onSignal = (): void => { ended(); };
  process.once("SIGINT", onSignal); process.once("SIGTERM", onSignal);
  try {
    await client.connect(upstream);
    await server.connect(downstream);
    const close = downstream.onclose; downstream.onclose = () => { close?.(); ended(); };
    client.onclose = ended;
    await closed;
  } finally {
    if (stdio) { process.stdin.off("end", ended); process.stdin.off("close", ended); }
    process.off("SIGINT", onSignal); process.off("SIGTERM", onSignal);
    try { await server.close(); } finally { try { await client.close(); } finally { await upstream.close(); } }
  }
}
