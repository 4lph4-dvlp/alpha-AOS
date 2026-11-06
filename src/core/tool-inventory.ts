import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { officialCuaPaths } from "./computer-use-install.js";
import { readToolRecordStore } from "./tool-records.js";
import type { StackCatalog, StackLock } from "../types.js";

export interface ToolObservation {
  toolId: string;
  installation: "installed" | "absent" | "unknown";
  installed: { version: string | null; source: string } | null;
  selected: { version: string; source: string } | null;
  integrity: "unverified";
  integration: "unverified";
  reason: string;
  nextAction: string;
  candidates?: import("./tool-observers.js").ToolCandidate[];
  checkedRoots?: string[];
  scope?: string;
}
export interface ToolInventory { observations: ToolObservation[]; records: Awaited<ReturnType<typeof readToolRecordStore>> }

export async function collectToolInventory(options: { catalog: StackCatalog; lock: StackLock; packageRoot: string; stateRoot: string; home?: string; env?: NodeJS.ProcessEnv }): Promise<ToolInventory> {
  const home = options.home ?? homedir(), env = options.env ?? process.env;
  const executable = officialCuaPaths(process.platform, home, env.LOCALAPPDATA).executable;
  let selected: ToolObservation["selected"] = null;
  let reason = "Checks have not been performed";
  try {
    const pinFile = await open(join(options.packageRoot, "catalog", "computer-use-runtime.json"), "r");
    let source: Buffer;
    try {
      const info = await pinFile.stat();
      if (!info.isFile() || info.size > 1024 * 1024) throw new Error("oversize");
      source = Buffer.alloc(info.size);
      const result = await pinFile.read(source, 0, source.length, 0);
      if (result.bytesRead !== source.length) throw new Error("short read");
    } finally { await pinFile.close(); }
    const pin = JSON.parse(source.toString()) as { version?: unknown; assets?: Array<{ os?: unknown; arch?: unknown; entrypoint?: unknown; sha256?: unknown }> };
    if (typeof pin.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pin.version) || !Array.isArray(pin.assets)) throw new Error("invalid");
    const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
    const asset = pin.assets.find((item) => item && item.os === os && (item.arch === process.arch || item.arch === "universal"));
    if (!asset || typeof asset.entrypoint !== "string" || !/^[A-Za-z0-9._-]+$/.test(asset.entrypoint) || typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error("unsupported or invalid asset");
    selected = { version: pin.version, source: "reviewed-pin" };
  } catch { reason = "Reviewed pin is unavailable or invalid"; }
  let installation: ToolObservation["installation"] = "unknown";
  let installed: ToolObservation["installed"] = null;
  if (!["win32", "linux", "darwin"].includes(process.platform)) reason = "Platform is unsupported";
  else if (selected !== null) try {
    const file = await open(executable, "r");
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error("invalid file");
      const bytes = Buffer.alloc(Math.min(info.size, 4096));
      await file.read(bytes, 0, bytes.length, 0);
      installation = "installed";
      installed = { version: null, source: "observed-file" };
    } finally { await file.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") installation = "absent";
    else reason = "Installation could not be read";
  }
  const { observeManagedTools } = await import("./tool-observers.js");
  const observations = await observeManagedTools({ ...options, home, env }, { toolId: "cua-driver", installation, installed, selected, integrity: "unverified", integration: "unverified", reason, nextAction: "Inspect installation and run explicit verification" });
  return { observations, records: await readToolRecordStore(options) };
}
