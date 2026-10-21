import { createHash } from "node:crypto";
import { readFile, lstat, realpath, open } from "node:fs/promises";
import { basename, dirname, join, relative, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Ajv } from "ajv";
import type { ValidateFunction } from "ajv";
import { stringify } from "yaml";
import { BoundedStdioTransport } from "../core/mcp-proxy.js";
import { runProcess, commandProbeEnvironment, resolveCommand } from "../core/process.js";
import { computerHash, computerActions, validateComputerAuthority } from "../core/computer-use-policy.js";
import type { ComputerAuthority, ComputerAction, ComputerTarget } from "../core/computer-use-policy.js";
import type { ComputerObservation, ComputerUseTransport } from "../core/computer-use.js";
import { safeComputerPath } from "../core/computer-use-audit.js";

export interface CuaRuntimeApproval {
  version: "0.37.0"; sourceCommit: string; platform: string; arch: string;
  executable: string; executableHash: string; archive: string; archiveHash: string; schemaHash: string;
  publisherVerified: boolean; publisherIdentity: string;
}
async function verifyCuaCompanions(approval: CuaRuntimeApproval, pin: Record<string, unknown>): Promise<void> {
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const asset = (pin.assets as Array<{ os: string; arch: string; sha256: string; entrypoint?: string; files?: Record<string, string> }>).find((v) => v.os === os && (v.arch === approval.arch || v.arch === "universal") && v.sha256 === approval.archiveHash);
  const entrypoint = asset?.entrypoint;
  const safeEntry = (name: string): boolean => /^(?:[\w.-]+\/)*[\w.-]+$/.test(name) && name.split("/").every((part) => part !== "." && part !== "..");
  if (!entrypoint || !safeEntry(entrypoint) || !asset.files || Object.keys(asset.files).length > 32 || asset.files[entrypoint] !== approval.executableHash || basename(approval.executable) !== basename(entrypoint)) throw new Error("Computer runtime selected executable is not the verified archive entrypoint");
  let extractionRoot = approval.executable;
  for (const _part of entrypoint.split("/")) extractionRoot = dirname(extractionRoot);
  if (await realpath(join(extractionRoot, ...entrypoint.split("/"))) !== await realpath(approval.executable)) throw new Error("Computer runtime entrypoint path mismatch");
  for (const [name, hash] of Object.entries(asset.files)) {
    if (!safeEntry(name) || !/^[a-f0-9]{64}$/.test(hash) || await hashFile(join(extractionRoot, ...name.split("/")), 256 * 1024 * 1024) !== hash) throw new Error("Computer runtime companion bytes drifted");
  }
}
export function cuaCapabilityManifest(a: ComputerAuthority): Record<string, unknown> {
  const seconds = Math.floor(Math.min(a.budget.durationMs, a.expiresAt - Date.now()) / 1000);
  const idle = Math.floor(a.idleMs / 1000);
  if (seconds < 1 || idle < 1) throw new Error("Cua native manifest requires at least one remaining whole second");
  return { version: 3, expires_after: `${seconds}s`, idle_timeout: `${idle}s`,
    allow: { tools: ["get_window_state", ...a.permissions.actions] },
    resources: { apps: [{ ...(process.platform === "darwin" ? { bundle_id: a.target.bundleId } : { executable: a.target.executable }), launch: a.permissions.actions.includes("launch_app"), windows: "all" }], desktop: { display: false } } };
}
async function hashFile(path: string, maximum: number): Promise<string> {
  await safeComputerPath(path); const stat = await lstat(path);
  if (!stat.isFile() || stat.size < 1 || stat.size > maximum) throw new Error("Computer runtime invalid file size/type");
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
export async function verifyCuaRuntime(approval: CuaRuntimeApproval, pin: Record<string, unknown>, ownedRoot: string): Promise<void> {
  if (approval.version !== "0.37.0" || approval.sourceCommit !== "2d2f99228d4d2508dc6fcc84c176b296e146714a" || approval.platform !== process.platform || approval.arch !== process.arch) throw new Error("Computer runtime version/source/platform mismatch");
  const assets = pin.assets as Array<{ os: string; arch: string; sha256: string }>;
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  if (!assets?.some((v) => v.os === os && (v.arch === approval.arch || v.arch === "universal") && v.sha256 === approval.archiveHash)) throw new Error("Computer runtime archive is outside pinned provenance");
  for (const path of [approval.executable, approval.archive]) {
    if (!isAbsolute(path)) throw new Error("Computer runtime absolute task-local path required");
    const rel = relative(await realpath(ownedRoot), await realpath(await safeComputerPath(path)));
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Computer runtime outside owned root");
  }
  if (!approval.publisherVerified || approval.publisherIdentity !== pin.publisherIdentity) throw new Error("Computer runtime publisher verification unavailable");
  if (await hashFile(approval.archive, 256 * 1024 * 1024) !== approval.archiveHash || await hashFile(approval.executable, 256 * 1024 * 1024) !== approval.executableHash) throw new Error("Computer runtime bytes drifted");
  await verifyCuaCompanions(approval, pin);
  if (!/^[a-f0-9]{64}$/.test(approval.schemaHash)) throw new Error("Computer runtime schema approval missing");
}
export async function computerProcessIdentity(target: ComputerTarget): Promise<void> {
  if (await hashFile(target.executable, 512 * 1024 * 1024) !== target.executableHash || await realpath(target.executable) !== target.executable) throw new Error("Computer target executable identity changed");
  if (process.platform === "linux") {
    const executable = await realpath(`/proc/${target.pid}/exe`);
    const stat = await readFile(`/proc/${target.pid}/stat`, "utf8"); const generation = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    if (executable !== target.executable || generation !== target.processGeneration) throw new Error("Computer process identity changed");
    return;
  }
  const windows = process.platform === "win32";
  const executable = resolveCommand(windows ? "powershell.exe" : "ps"); if (!executable) throw new Error("Computer process identity probe unavailable");
  const args = windows ? ["-NoProfile", "-NonInteractive", "-Command", `$p=Get-Process -Id ${target.pid} -ErrorAction Stop; [Console]::Write(($p.Path)+[char]10+($p.StartTime.ToUniversalTime().Ticks))`] : ["-p", String(target.pid), "-o", "comm=", "-o", "lstart="];
  const result = await runProcess({ executable, args, cwd: dirname(target.executable), environment: commandProbeEnvironment(), timeoutMs: 3000, maxOutputBytes: 8192, excerptBytes: 8192 });
  if (result.code !== "ok") throw new Error("Computer process identity probe failed");
  // The raw-stream fingerprint binds path and generation without persisting
  // private process details or treating a redacted path alias as identity.
  if (result.stdout.sha256 !== target.processGeneration) throw new Error("Computer process generation mismatch");
}
export function cuaActionArguments(a: ComputerAuthority, action: ComputerAction, observation: ComputerObservation): Record<string, unknown> {
  const windowId = Number(a.target.windowId); if (!Number.isSafeInteger(windowId) || windowId < 1) throw new Error("Cua native window identifier unsupported");
  const target = { pid: a.target.pid, window_id: windowId, delivery_mode: action.delivery ?? "background" };
  switch (action.kind) {
    case "click": return { ...target, x: action.x, y: action.y, capture_id: observation.captureId };
    case "right_click": return { ...target, x: action.x, y: action.y };
    case "drag": return { ...target, from_x: action.x, from_y: action.y, to_x: action.toX, to_y: action.toY };
    case "type_text": return { ...target, text: action.text };
    case "press_key": return { ...target, key: action.key };
    case "launch_app": return { path: a.target.executable };
  }
}
export class CuaComputerTransport implements ComputerUseTransport {
  readonly identity: { executableHash: string; schemaHash: string };
  readonly #client: Client;
  readonly #transport: BoundedStdioTransport;
  readonly #authority: ComputerAuthority;
  readonly #approval: CuaRuntimeApproval;
  readonly #pin: Record<string, unknown>;
  readonly #schemas: Map<string, ValidateFunction>;
  #closed = false;
  #closing: Promise<void> | undefined;
  private constructor(a: ComputerAuthority, approval: CuaRuntimeApproval, client: Client, transport: BoundedStdioTransport, schemas: Map<string, ValidateFunction>, pin: Record<string, unknown>) {
    this.#authority = validateComputerAuthority(a); this.#approval = structuredClone(approval); this.#pin = structuredClone(pin); this.#client = client; this.#transport = transport; this.#schemas = schemas; this.identity = Object.freeze({ executableHash: approval.executableHash, schemaHash: approval.schemaHash });
  }
  static async connect(a: ComputerAuthority, approval: CuaRuntimeApproval, pin: Record<string, unknown>, ownedRoot: string): Promise<CuaComputerTransport> {
    await verifyCuaRuntime(approval, pin, ownedRoot);
    if (a.runtime.executableHash !== approval.executableHash || a.runtime.schemaHash !== approval.schemaHash) throw new Error("Cua runtime authority mismatch");
    if (process.platform === "darwin" && !a.target.bundleId) throw new Error("Cua macOS requires an approved app bundle identifier and existing TCC grants for the direct runtime");
    await computerProcessIdentity(a.target);
    const manifestPath = join(ownedRoot, `capabilities-${a.runId}.yaml`); await safeComputerPath(manifestPath);
    const file = await open(manifestPath, "wx", 0o600); try { await file.writeFile(stringify(cuaCapabilityManifest(a))); await file.sync(); } finally { await file.close(); }
    const environment = commandProbeEnvironment({ writeRoot: join(ownedRoot, "state") });
    const transport = new BoundedStdioTransport({ executable: approval.executable, args: ["mcp", "--direct"], cwd: ownedRoot,
      timeoutMs: a.budget.durationMs, maxOutputBytes: a.budget.bytes, maxMessageBytes: Math.min(a.budget.bytes, 24 * 1024 * 1024),
      environment: { ...environment, optional: [...(environment.optional ?? []), "DISPLAY", "WAYLAND_DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"], literal: { ...environment.literal, CUA_DRIVER_PERMISSION_MODE: "bounded", CUA_DRIVER_CAPABILITY_MANIFEST_FILE: manifestPath, CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED: "1", CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false" } } });
    const client = new Client({ name: "alpha-aos-computer-use", version: "0.4.0" });
    try {
      await client.connect(transport);
      const listing = await client.listTools({}, { timeout: a.budget.gestureMs });
      const tools = [...listing.tools].sort((x, y) => x.name.localeCompare(y.name));
      if (computerHash(tools) !== approval.schemaHash) throw new Error("Cua discovered schema drifted from reviewed pin");
      const ajv = new Ajv({ strict: false }); const schemas = new Map<string, ValidateFunction>();
      for (const name of ["get_window_state", ...a.permissions.actions]) { const tool = tools.find((v) => v.name === name); if (!tool) throw new Error("Cua required native tool unavailable"); schemas.set(name, ajv.compile(tool.inputSchema)); }
      return new CuaComputerTransport(a, approval, client, transport, schemas, pin);
    } catch (error) { await transport.close(); throw error; }
  }
  async #call(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    signal.throwIfAborted(); if (this.#closed || !this.#schemas.get(name)?.(args)) throw new Error("Cua action/schema refused");
    if (await hashFile(this.#approval.executable, 256 * 1024 * 1024) !== this.identity.executableHash) throw new Error("Cua executable drifted before dispatch");
    await verifyCuaCompanions(this.#approval, this.#pin);
    await computerProcessIdentity(this.#authority.target); signal.throwIfAborted();
    const result = await this.#client.callTool({ name, arguments: args }, undefined, { signal, timeout: this.#authority.budget.gestureMs, maxTotalTimeout: this.#authority.budget.gestureMs });
    if (result.isError) {
      // Only machine codes cross the boundary; native bodies may contain data.
      const codes: string[] = [];
      function inspect(value: unknown, depth = 0): void {
        if (depth > 5 || !value || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value)) {
          if (["code", "error_code", "error"].includes(key) && typeof child === "string" && /^[a-z][a-z0-9_]{1,80}$/.test(child)) codes.push(child);
          if (key === "text" && typeof child === "string" && child.length < 100000) {
            const prefix = /^([a-z][a-z0-9_]{1,80}):/.exec(child); if (prefix) codes.unshift(prefix[1]!);
            try { inspect(JSON.parse(child), depth + 1); } catch { /* Unstructured native messages stay private. */ }
          }
          else inspect(child, depth + 1);
        }
      }
      inspect(result); throw new Error(`Cua native ${name} refused (${codes[0] ?? "unclassified"})`);
    }
    return result;
  }
  async observe(signal: AbortSignal): Promise<ComputerObservation> { return this.#observeNative(signal, false); }
  async discoverTarget(signal: AbortSignal): Promise<ComputerTarget> { return (await this.#observeNative(signal, true)).target; }
  async discoverWindow(signal: AbortSignal): Promise<ComputerObservation> { return this.#observeNative(signal, true); }
  async #observeNative(signal: AbortSignal, discovery: boolean): Promise<ComputerObservation> {
    const a = this.#authority;
    const result = await this.#call("get_window_state", { pid: a.target.pid, window_id: Number(a.target.windowId), include_screenshot: true, tree_format: "elements" }, signal);
    const state = result.structuredContent as Record<string, unknown> | undefined;
    if (!state || state.screenshot_error || Number(state.pid) !== a.target.pid || String(state.window_id) !== a.target.windowId || typeof state.capture_id !== "string") throw new Error("Cua exact-window observation identity unavailable");
    const images = (result.content as Array<{ type: string; data?: string; mimeType?: string }>).filter((v) => v.type === "image" && v.mimeType === "image/png");
    if (images.length !== 1 || !images[0]!.data) throw new Error("Cua target-only PNG unavailable; desktop fallback denied");
    const png = Buffer.from(images[0]!.data, "base64"); if (png.length < 24) throw new Error("Cua invalid capture");
    if (state.screenshot_width !== png.readUInt32BE(16) || state.screenshot_height !== png.readUInt32BE(20)) throw new Error("Cua native screenshot pixel context mismatched");
    const generation = computerHash({ process: a.target.processGeneration, window: state.window_id, app: state.app_name ?? null, title: state.window_title ?? null });
    if (!discovery && generation !== a.target.windowGeneration) throw new Error("Cua window generation/fingerprint changed");
    if (!Array.isArray(state.elements) || state.elements.length > 5000) throw new Error("Cua structured accessibility postcondition unavailable");
    // Snapshot tokens change on every read and must never count as an observed
    // application effect. Keep stable semantic fields only.
    const semantic = state.elements.map((element: Record<string, unknown>) => Object.fromEntries(["role", "label", "value", "enabled", "selected", "focused", "actions", "frame", "parent_index", "depth"].map((key) => [key, element[key] ?? null])));
    const bounds = state.window_bounds as { x: number; y: number; width: number; height: number } | undefined;
    if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)) throw new Error("Cua window geometry unavailable");
    return { target: { ...a.target, windowGeneration: generation }, captureId: state.capture_id, png, width: png.readUInt32BE(16), height: png.readUInt32BE(20), state: JSON.stringify(semantic), safe: a.permissions.publicData, foreground: a.permissions.foreground, windowBounds: bounds };
  }
  async dispatch(action: ComputerAction, observation: ComputerObservation, signal: AbortSignal): Promise<void> {
    if (!computerActions.includes(action.kind)) throw new Error("Cua raw passthrough denied");
    // right_click/drag use this private runtime's latest exact-window pixel
    // context; unlike click their 0.37.0 schemas do not accept capture_id.
    const result = await this.#call(action.kind, cuaActionArguments(this.#authority, action, observation), signal);
    if (action.kind === "launch_app" && Number((result.structuredContent as Record<string, unknown> | undefined)?.pid) !== this.#authority.target.pid) throw new Error("Cua launch returned an unbound process; new target authority required, outcome remains unknown");
  }
  async close(): Promise<void> { this.#closed = true; this.#closing ??= this.#transport.close(); await this.#closing; }
}
