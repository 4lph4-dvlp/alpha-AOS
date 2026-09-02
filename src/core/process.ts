import { existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";

export function resolveCommand(command: string): string | null {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], { encoding: "utf8", timeout: 3000, windowsHide: true });
  if (result.status !== 0) return null;
  const paths = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (process.platform !== "win32") return paths[0] ?? null;
  return paths.find((path) => extname(path).toLowerCase() === ".exe")
    ?? paths.find((path) => extname(path).toLowerCase() === ".cmd")
    ?? paths.find((path) => extname(path).toLowerCase() === ".ps1")
    ?? paths[0]
    ?? null;
}

export function resolveNodePackageCli(command: "npm" | "npx"): { executable: string; argsPrefix: string[] } {
  const resolved = resolveCommand(command);
  if (!resolved) throw new Error(`${command} was not found`);
  if (process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd")) {
    const script = join(dirname(resolved), "node_modules", "npm", "bin", `${command}-cli.js`);
    if (!existsSync(script)) throw new Error(`Could not locate ${command}-cli.js beside ${resolved}`);
    return { executable: process.execPath, argsPrefix: [script] };
  }
  return { executable: resolved, argsPrefix: [] };
}

export function readCommandVersion(commandPath: string): string | null {
  const extension = extname(commandPath).toLowerCase();
  let executable = commandPath;
  let args = ["--version"];
  let windowsVerbatimArguments = false;
  if (process.platform === "win32" && extension === ".cmd") {
    executable = process.env.ComSpec ?? "cmd.exe";
    args = ["/d", "/s", "/c", `""${commandPath}" --version"`];
    windowsVerbatimArguments = true;
  } else if (process.platform === "win32" && extension === ".ps1") {
    executable = "powershell.exe";
    args = ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", commandPath, "--version"];
  }
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    windowsVerbatimArguments,
  });
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return text ? text.split(/\r?\n/u)[0]?.trim() ?? null : null;
}

export function runCommandInteractive(commandPath: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): number {
  const extension = extname(commandPath).toLowerCase();
  let executable = commandPath;
  let actualArgs = args;
  if (process.platform === "win32" && extension === ".cmd") {
    executable = process.env.ComSpec ?? "cmd.exe";
    actualArgs = ["/d", "/s", "/c", commandPath, ...args];
  } else if (process.platform === "win32" && extension === ".ps1") {
    executable = "powershell.exe";
    actualArgs = ["-NoLogo", "-NoProfile", "-File", commandPath, ...args];
  }
  const result = spawnSync(executable, actualArgs, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
    windowsHide: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function runCommandCapture(commandPath: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  timeout?: number;
}): { status: number; stdout: string; stderr: string } {
  const extension = extname(commandPath).toLowerCase();
  let executable = commandPath;
  let actualArgs = args;
  if (process.platform === "win32" && extension === ".cmd") {
    executable = process.env.ComSpec ?? "cmd.exe";
    actualArgs = ["/d", "/s", "/c", commandPath, ...args];
  } else if (process.platform === "win32" && extension === ".ps1") {
    executable = "powershell.exe";
    actualArgs = ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", commandPath, ...args];
  }
  const result = spawnSync(executable, actualArgs, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    timeout: options.timeout ?? 120_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
