import { createHash } from "node:crypto";
import { readFile, lstat, realpath, open } from "node:fs/promises";
import { dirname, join, relative, isAbsolute } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Ajv } from "ajv";
import type { ValidateFunction } from "ajv";
import { stringify } from "yaml";
import { BoundedStdioTransport } from "../core/mcp-proxy.js";
import { runProcess, commandProbeEnvironment, resolveCommand } from "../core/process.js";
import { computerHash, computerActions } from "../core/computer-use-policy.js";
import type { ComputerAuthority, ComputerAction, ComputerTarget } from "../core/computer-use-policy.js";
import type { ComputerObservation, ComputerUseTransport } from "../core/computer-use.js";
import { safeComputerPath } from "../core/computer-use-audit.js";

export interface CuaRuntimeApproval {
  version: "0.37.0"; sourceCommit: string; platform: string; arch: string;
  executable: string; executableHash: string; archive: string; archiveHash: string; schemaHash: string;
  publisherVerified: boolean; publisherIdentity: string;
}
export function cuaCapabilityManifest(a: ComputerAuthority): Record<string, unknown> {
  return { version: 3, expires_after: `${Math.max(1, Math.min(a.budget.durationMs, a.expiresAt - Date.now()))}ms`, idle_timeout: `${a.idleMs}ms`,
    allow: { tools: ["get_window_state", ...a.permissions.actions] },
    resources: { apps: [{ executable: a.target.executable, launch: a.permissions.actions.includes("launch_app"), windows: "all" }], desktop: { display: false } } };
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
  if (!approval.publisherVerified || !approval.publisherIdentity.startsWith("https://github.com/trycua/cua/")) throw new Error("Computer runtime publisher verification unavailable");
  if (await hashFile(approval.archive, 256 * 1024 * 1024) !== approval.archiveHash || await hashFile(approval.executable, 256 * 1024 * 1024) !== approval.executableHash) throw new Error("Computer runtime bytes drifted");
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
  // Diagnostic excerpts deliberately alias private paths. Compare a hash-only
  // generation supplied by the trusted launcher instead of trusting an alias.
  if (computerHash(result.stdout.excerpt.trim()) !== target.processGeneration) throw new Error("Computer process generation mismatch");
}
export function cuaActionArguments(a: ComputerAuthority, action: ComputerAction, observation: ComputerObservation): Record<string, unknown> {
  const windowId = Number(a.target.windowId); if (!Number.isSafeInteger(windowId) || windowId < 1) throw new Error("Cua native window identifier unsupported");
  const target = { pid: a.target.pid, window_id: windowId, delivery_mode: a.permissions.foreground ? "foreground" : "target" };
  switch (action.kind) {
    case "click": case "right_click": return { ...target, x: action.x, y: action.y, capture_id: observation.captureId };
    case "drag": return { ...target, from_x: action.x, from_y: action.y, to_x: action.toX, to_y: action.toY, capture_id: observation.captureId };
    case "type_text": return { ...target, text: action.text };
    case "press_key": return { ...target, key: action.key };
    case "launch_app": return { executable: a.target.executable };
  }
}
export class CuaComputerTransport implements ComputerUseTransport {
  readonly identity: { executableHash: string; schemaHash: string };
  readonly #client: Client;
  readonly #transport: BoundedStdioTransport;
  readonly #authority: ComputerAuthority;
  readonly #approval: CuaRuntimeApproval;
  readonly #schemas: Map<string, ValidateFunction>;
  #closed = false;
  private constructor(a: ComputerAuthority, approval: CuaRuntimeApproval, client: Client, transport: BoundedStdioTransport, schemas: Map<string, ValidateFunction>) {
    this.#authority = a; this.#approval = approval; this.#client = client; this.#transport = transport; this.#schemas = schemas; this.identity = { executableHash: approval.executableHash, schemaHash: approval.schemaHash };
  }
  static async connect(a: ComputerAuthority, approval: CuaRuntimeApproval, pin: Record<string, unknown>, ownedRoot: string): Promise<CuaComputerTransport> {
    await verifyCuaRuntime(approval, pin, ownedRoot);
    if (a.runtime.executableHash !== approval.executableHash || a.runtime.schemaHash !== approval.schemaHash) throw new Error("Cua runtime authority mismatch");
    if (process.platform === "darwin") throw new Error("Cua macOS requires a reviewed signed service identity; private bare stdio is unavailable");
    await computerProcessIdentity(a.target);
    const manifestPath = join(ownedRoot, `capabilities-${a.runId}.yaml`); await safeComputerPath(manifestPath);
    const file = await open(manifestPath, "wx", 0o600); try { await file.writeFile(stringify(cuaCapabilityManifest(a))); await file.sync(); } finally { await file.close(); }
    const transport = new BoundedStdioTransport({ executable: approval.executable, args: ["mcp"], cwd: ownedRoot,
      timeoutMs: a.budget.durationMs, maxOutputBytes: a.budget.bytes, maxMessageBytes: Math.min(a.budget.bytes, 24 * 1024 * 1024),
      environment: { ...commandProbeEnvironment(), literal: { CUA_DRIVER_PERMISSION_MODE: "bounded", CUA_DRIVER_CAPABILITY_MANIFEST_FILE: manifestPath, CUA_DRIVER_CAPABILITY_MANIFEST_APPROVED: "1" } } });
    const client = new Client({ name: "alpha-aos-computer-use", version: "0.4.0" });
    try {
      await client.connect(transport);
      const listing = await client.listTools({}, { timeout: a.budget.gestureMs });
      const tools = [...listing.tools].sort((x, y) => x.name.localeCompare(y.name));
      if (computerHash(tools) !== approval.schemaHash) throw new Error("Cua discovered schema drifted from reviewed pin");
      const ajv = new Ajv({ strict: false }); const schemas = new Map<string, ValidateFunction>();
      for (const name of ["get_window_state", ...a.permissions.actions]) { const tool = tools.find((v) => v.name === name); if (!tool) throw new Error("Cua required native tool unavailable"); schemas.set(name, ajv.compile(tool.inputSchema)); }
      return new CuaComputerTransport(a, approval, client, transport, schemas);
    } catch (error) { await transport.close(); throw error; }
  }
  async #call(name: string, args: Record<string, unknown>, signal: AbortSignal) {
    signal.throwIfAborted(); if (this.#closed || !this.#schemas.get(name)?.(args)) throw new Error("Cua action/schema refused");
    if (await hashFile(this.#approval.executable, 256 * 1024 * 1024) !== this.identity.executableHash) throw new Error("Cua executable drifted before dispatch");
    await computerProcessIdentity(this.#authority.target); signal.throwIfAborted();
    const result = await this.#client.callTool({ name, arguments: args }, undefined, { signal, timeout: this.#authority.budget.gestureMs, maxTotalTimeout: this.#authority.budget.gestureMs });
    if (result.isError) throw new Error("Cua native operation refused or failed");
    return result;
  }
  async observe(signal: AbortSignal): Promise<ComputerObservation> {
    const a = this.#authority;
    const result = await this.#call("get_window_state", { pid: a.target.pid, window_id: Number(a.target.windowId), include_screenshot: true, tree_format: "elements" }, signal);
    const state = result.structuredContent as Record<string, unknown> | undefined;
    if (!state || state.screenshot_error || Number(state.pid) !== a.target.pid || String(state.window_id) !== a.target.windowId || typeof state.capture_id !== "string") throw new Error("Cua exact-window observation identity unavailable");
    const images = (result.content as Array<{ type: string; data?: string; mimeType?: string }>).filter((v) => v.type === "image" && v.mimeType === "image/png");
    if (images.length !== 1 || !images[0]!.data) throw new Error("Cua target-only PNG unavailable; desktop fallback denied");
    const png = Buffer.from(images[0]!.data, "base64"); if (png.length < 24) throw new Error("Cua invalid capture");
    const generation = computerHash({ process: a.target.processGeneration, window: state.window_id, app: state.app_name ?? null, title: state.window_title ?? null });
    if (generation !== a.target.windowGeneration) throw new Error("Cua window generation/fingerprint changed");
    return { target: a.target, captureId: state.capture_id, png, width: png.readUInt32BE(16), height: png.readUInt32BE(20), state: JSON.stringify(state.elements ?? state.tree_markdown ?? null), safe: a.permissions.publicData, foreground: a.permissions.foreground };
  }
  async dispatch(action: ComputerAction, observation: ComputerObservation, signal: AbortSignal): Promise<void> {
    if (!computerActions.includes(action.kind)) throw new Error("Cua raw passthrough denied");
    await this.#call(action.kind, cuaActionArguments(this.#authority, action, observation), signal);
  }
  async close(): Promise<void> { if (this.#closed) return; this.#closed = true; await this.#transport.close(); }
}
