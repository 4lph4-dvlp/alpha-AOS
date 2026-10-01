import { statSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";

export interface WindowsCommandSearch {
  cwd: string;
  path: string;
  pathExt: string;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Preserve where's search scope and alpha-AOS's preference for native executables. */
export function resolveWindowsCommand(command: string, search: WindowsCommandSearch): string | null {
  const extensions = search.pathExt.split(";").map((value) => value.trim()).filter(Boolean);
  const names = extname(command) === "" ? [command, ...extensions.map((extension) => command + extension)] : [command];
  const qualified = isAbsolute(command) || /[\\/]/u.test(command);
  const roots = qualified ? [search.cwd] : [
    search.cwd,
    ...search.path.split(";").map((entry) => entry.trim().replace(/^"(.*)"$/u, "$1")).filter(Boolean),
  ];
  const candidates: string[] = [];
  for (const root of roots) {
    for (const name of names) {
      const candidate = qualified ? resolve(search.cwd, name) : resolve(search.cwd, join(root, name));
      if (isFile(candidate)) candidates.push(candidate);
    }
  }
  return candidates.find((path) => extname(path).toLowerCase() === ".exe")
    ?? candidates.find((path) => extname(path).toLowerCase() === ".cmd")
    ?? candidates.find((path) => extname(path).toLowerCase() === ".ps1")
    ?? candidates[0]
    ?? null;
}
