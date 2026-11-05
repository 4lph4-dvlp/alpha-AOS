import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { runProcess, type ProcessSpec } from "./process.js";
import type { MutationSession } from "./writer-lock.js";

const hash = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
interface Asset {
  os: string; arch: string; entrypoint: string; installedEntrypoint?: string;
  files: Record<string, string>; installedFiles?: Record<string, string>;
}
interface Pin {
  version: string; assets: Asset[];
  installer: { directory: string; sourceCommit: string; files: Record<string, string> };
}
const safeName = (name: string): boolean => /^(?:[\w.@+-]+\/)*[\w.@+-]+$/.test(name) && name.split("/").every((part) => part !== "." && part !== "..");

async function loadPin(root: string): Promise<{ pin: Pin; pinHash: string; asset: Asset }> {
  const source = await readFile(join(root, "catalog", "computer-use-runtime.json"));
  const pin = JSON.parse(source.toString()) as Pin;
  const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : process.platform;
  const asset = pin.assets.find((item) => item.os === os && (item.arch === process.arch || item.arch === "universal"));
  if (!asset || !/^\d+\.\d+\.\d+$/.test(pin.version)) throw new Error("No reviewed Cua release for this platform");
  return { pin, pinHash: hash(source), asset };
}

export function officialCuaPaths(platform = process.platform, home = homedir(), localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local")) {
  const packageHome = join(home, ".cua-driver");
  const binRoot = platform === "win32" ? join(localAppData, "Programs", "Cua", "cua-driver") : join(home, ".local", "bin");
  return {
    packageHome, binRoot,
    legacyRoots: [join(home, ".cua-driver-rs"), ...(platform === "win32" ? [join(localAppData, "Programs", "trycua", "cua-driver-rs")] : [])],
    executable: platform === "darwin" ? "/Applications/CuaDriver.app/Contents/MacOS/cua-driver" : join(binRoot, ...(platform === "win32" ? ["bin", "cua-driver.exe"] : ["cua-driver"])),
    roots: [packageHome, binRoot, ...(platform === "darwin" ? ["/Applications/CuaDriver.app"] : [])],
  };
}

export async function verifyOfficialCua(executable: string, root = packageRoot()) {
  const { pin, asset } = await loadPin(root);
  const entrypoint = asset.installedEntrypoint ?? asset.entrypoint;
  if (!safeName(entrypoint)) throw new Error("Invalid Cua entrypoint");
  const resolved = await realpath(executable);
  let runtimeRoot = resolved;
  for (const _part of entrypoint.split("/")) runtimeRoot = dirname(runtimeRoot);
  if (await realpath(join(runtimeRoot, entrypoint)) !== resolved) throw new Error("Invalid installed Cua layout");
  const files = asset.installedFiles ?? asset.files;
  if (!files[entrypoint] || Object.keys(files).length > 128) throw new Error("Invalid installed Cua manifest");
  for (const [name, digest] of Object.entries(files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(digest)) throw new Error("Invalid installed Cua file pin");
    const file = join(runtimeRoot, name);
    const rel = relative(runtimeRoot, await realpath(file));
    const stat = await lstat(file);
    if (rel.startsWith("..") || isAbsolute(rel) || !stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024 || hash(await readFile(file)) !== digest) throw new Error("Installed Cua bytes differ from the reviewed release");
  }
  return { executable: resolved, version: pin.version, executableHash: files[entrypoint]! };
}

export async function planCuaInstall(_stateRoot = userStateRoot(), root = packageRoot()) {
  const { pin, pinHash } = await loadPin(root);
  const paths = officialCuaPaths();
  const legacyConflicts: string[] = [];
  for (const path of paths.legacyRoots) {
    try { await lstat(path); legacyConflicts.push(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  const installer = pin.installer;
  if (!installer || !safeName(installer.directory) || !/^[a-f0-9]{40}$/.test(installer.sourceCommit)) throw new Error("Cua installer provenance is missing");
  for (const [name, digest] of Object.entries(installer.files)) {
    if (!safeName(name) || !/^[a-f0-9]{64}$/.test(digest) || hash(await readFile(join(root, installer.directory, name))) !== digest) throw new Error("Official Cua installer bytes drifted");
  }
  for (const name of ["install.ps1", "install.sh", "_install-rust.sh", "_install-common.sh", "_install-common.psm1"]) {
    if (!installer.files[name]) throw new Error("Official Cua installer helper is missing");
  }
  let current = false;
  try { await verifyOfficialCua(paths.executable, root); current = true; } catch { /* Missing/drifted installations require the official installer. */ }
  const directory = join(root, installer.directory);
  const spec: ProcessSpec = {
    executable: process.platform === "win32" ? join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "/bin/bash",
    args: process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", join(directory, "install.ps1"), "-Release", pin.version, "-NoAutoStart"]
      : [join(directory, "install.sh")],
    cwd: directory, timeoutMs: 300_000, maxOutputBytes: 1024 * 1024,
    environment: {
      optional: ["PATH", "Path", "SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "TEMP", "TMP", "SHELL"],
      literal: {
        CUA_DRIVER_RS_VERSION: pin.version, CUA_DRIVER_RS_KEEP_VERSIONS: "0",
        CUA_DRIVER_RS_TELEMETRY_ENABLED: "false", CUA_DRIVER_RS_UPDATE_CHECK: "false",
      },
    },
  };
  return { ...paths, legacyConflicts, targetRoot: paths.packageHome, current, pinHash, spec };
}

export async function installCua(plan: Awaited<ReturnType<typeof planCuaInstall>>, session?: MutationSession, root = packageRoot()) {
  const fresh = await planCuaInstall(undefined, root);
  if (JSON.stringify(fresh) !== JSON.stringify(plan)) throw new Error("Cua installation plan changed before apply");
  if (plan.current) return false;
  if (!session) throw new Error("Official Cua installation requires a managed writer session");
  session.assertOwned();
  if (plan.legacyConflicts.length > 0) throw new Error("Legacy Cua directories require explicit migration review before running the official installer; no legacy files were removed");
  const result = await runProcess({ ...plan.spec, environment: { ...plan.spec.environment, source: process.env } });
  if (result.code !== "ok") throw new Error(`Official Cua installer failed (${result.code}, exit ${result.exitCode}); inspect native Cua installation before retrying`);
  await verifyOfficialCua(plan.executable, root);
  return true;
}
