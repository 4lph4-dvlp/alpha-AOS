import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));

export function findPackageRoot(start: string): string | null {
  let cursor = resolve(start);
  while (true) {
    if (existsSync(join(cursor, "catalog", "stack.yaml"))) {
      return cursor;
    }
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return null;
}

export function packageRoot(): string {
  const fromModule = findPackageRoot(moduleDirectory);
  if (fromModule) return fromModule;

  const fromWorkingDirectory = findPackageRoot(process.cwd());
  if (fromWorkingDirectory) return fromWorkingDirectory;

  throw new Error("Could not locate catalog/stack.yaml");
}

export function userStateRoot(): string {
  const override = process.env.ALPHA_AOS_STATE_DIR?.trim();
  if (override) return resolve(override);
  return join(homedir(), ".alpha-aos");
}

export function redactHome(value: string): string {
  const home = resolve(homedir());
  const normalized = resolve(value);
  if (normalized.toLowerCase() === home.toLowerCase()) return "~";
  if (normalized.toLowerCase().startsWith(`${home.toLowerCase()}${process.platform === "win32" ? "\\" : "/"}`)) {
    return `~${normalized.slice(home.length)}`;
  }
  return value;
}
