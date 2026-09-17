import { existsSync } from "node:fs";
import { chmod, link, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { packageRoot, userStateRoot } from "../core/paths.js";
import type { HarnessId, ShimGenerationResult, UpstreamBinaryResolution } from "../types.js";
import { getHarnessPreloadExclusion } from "./isolation.js";

export const SHIMMED_COMMANDS = ["codex", "pi", "hermes", "agy"] as const;

/**
 * Maps shimmed command names to their canonical HarnessId.
 */
export function commandToHarness(command: string): HarnessId | null {
  switch (command) {
    case "codex":
      return "codex";
    case "pi":
      return "pi";
    case "hermes":
      return "hermes";
    case "agy":
    case "antigravity":
      return "antigravity";
    default:
      return null;
  }
}

/**
 * Reuses user credentials via filesystem hardlinks (or symlinks) without reading
 * or copying credential bytes into state (D-07).
 */
export async function linkAuthWithoutCopying(
  sourceAuthFile: string,
  targetAuthFile: string,
): Promise<{ linked: boolean; method: "hardlink" | "symlink" | "none" }> {
  if (!existsSync(sourceAuthFile)) {
    return { linked: false, method: "none" };
  }

  await mkdir(dirname(targetAuthFile), { recursive: true });

  if (existsSync(targetAuthFile)) {
    await rm(targetAuthFile, { force: true });
  }

  // Attempt hardlink first (no elevated privilege needed on same filesystem volume)
  try {
    await link(sourceAuthFile, targetAuthFile);
    return { linked: true, method: "hardlink" };
  } catch {
    // Fall back to symlink if hardlink fails (e.g. cross-volume or permission)
    try {
      await symlink(sourceAuthFile, targetAuthFile, "file");
      return { linked: true, method: "symlink" };
    } catch {
      return { linked: false, method: "none" };
    }
  }
}

/**
 * Provisions a clean, isolated configuration root under ~/.alpha-aos/isolated/trees/<tree-id>/
 * and links user login credentials safely without copying bytes.
 */
export async function prepareIsolatedTreeRoot(
  treeId: string,
  harness: HarnessId,
  stateRoot?: string,
): Promise<{ isolatedRoot: string; env: Record<string, string> }> {
  const isolatedRoot = join(stateRoot ?? userStateRoot(), "isolated", "trees", treeId);
  await mkdir(isolatedRoot, { recursive: true });

  const exclusion = getHarnessPreloadExclusion(harness, isolatedRoot, { surface: "cli" });

  if (harness === "codex") {
    const globalCodexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
    const globalAuthFile = join(globalCodexHome, "auth.json");
    const targetAuthFile = join(isolatedRoot, "codex", "auth.json");
    await linkAuthWithoutCopying(globalAuthFile, targetAuthFile);
  } else if (harness === "pi") {
    const globalPiHome = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
    const globalAuthFile = join(globalPiHome, "auth.json");
    const targetAuthFile = join(isolatedRoot, "pi", "auth.json");
    await linkAuthWithoutCopying(globalAuthFile, targetAuthFile);
  }

  return {
    isolatedRoot,
    env: { ...exclusion.env },
  };
}

/**
 * Helper to inspect Windows .cmd / .bat npm wrappers to locate the target .js CLI directly,
 * preserving shell: false execution (SAFE-06).
 */
async function extractNodeScriptFromCmd(cmdPath: string): Promise<string | null> {
  try {
    const content = await readFile(cmdPath, "utf8");
    // Look for patterns like: node "%~dp0\..\path\to\script.js" or "%_prog%" "%dp0%\..."
    const match = content.match(/["']([^"'\r\n]+\.js)["']/i);
    if (match && match[1]) {
      const scriptRelativeOrAbsolute = match[1];
      const scriptResolved = isAbsolute(scriptRelativeOrAbsolute)
        ? scriptRelativeOrAbsolute
        : resolve(dirname(cmdPath), scriptRelativeOrAbsolute);
      if (existsSync(scriptResolved)) {
        return scriptResolved;
      }
    }
  } catch {
    // Ignore read errors and fall back to raw executable
  }
  return null;
}

/**
 * Finds the real upstream binary for commandName on PATH, strictly excluding
 * ~/.alpha-aos/shims/ from the search to prevent recursive fork loops (D-05).
 */
export function findUpstreamBinary(
  commandName: string,
  options?: { pathEnv?: string | undefined; shimsDir?: string | undefined },
): UpstreamBinaryResolution | null {
  const pathEnv = options?.pathEnv ?? process.env.PATH ?? "";
  const shimsDir = resolve(options?.shimsDir ?? join(userStateRoot(), "shims"));

  const entries = pathEnv.split(delimiter).filter(Boolean);
  const isWin = process.platform === "win32";
  const extensions = isWin ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of entries) {
    const canonicalDir = resolve(dir);
    // CRITICAL: Skip the shims directory to break recursive loops
    if (canonicalDir === shimsDir) continue;

    for (const ext of extensions) {
      const candidate = join(canonicalDir, `${commandName}${ext}`);
      if (existsSync(candidate)) {
        return {
          executable: candidate,
          isDirectScript: false,
        };
      }
    }
  }

  return null;
}

/**
 * Generates transparent shim scripts in targetDir for codex, pi, hermes, and agy.
 */
export async function generateShimScripts(
  targetDir: string,
  options?: { nodePath?: string | undefined; dispatchScriptPath?: string | undefined },
): Promise<ShimGenerationResult> {
  await mkdir(targetDir, { recursive: true });

  const nodePath = options?.nodePath ?? process.execPath;
  const dispatchScriptPath =
    options?.dispatchScriptPath ?? join(packageRoot(), "dist", "src", "shim-dispatch.js");

  const createdShims: string[] = [];

  for (const cmd of SHIMMED_COMMANDS) {
    // 1. POSIX shell script: <cmd>
    const posixPath = join(targetDir, cmd);
    const posixContent = `#!/bin/sh\nexec "${nodePath}" "${dispatchScriptPath}" "${cmd}" "$@"\n`;
    await writeFile(posixPath, posixContent, "utf8");
    await chmod(posixPath, 0o755).catch(() => undefined);
    createdShims.push(posixPath);

    // 2. Windows CMD wrapper: <cmd>.cmd
    const cmdPath = join(targetDir, `${cmd}.cmd`);
    const cmdContent = `@echo off\r\n"${nodePath}" "${dispatchScriptPath}" ${cmd} %*\r\n`;
    await writeFile(cmdPath, cmdContent, "utf8");
    createdShims.push(cmdPath);

    // 3. Windows PowerShell script: <cmd>.ps1
    const ps1Path = join(targetDir, `${cmd}.ps1`);
    const ps1Content = `& "${nodePath}" "${dispatchScriptPath}" "${cmd}" @args\r\n`;
    await writeFile(ps1Path, ps1Content, "utf8");
    createdShims.push(ps1Path);
  }

  return {
    shimsDir: targetDir,
    createdShims,
    commands: SHIMMED_COMMANDS,
  };
}

/**
 * Verifies whether shimsDir has precedence on PATH (is located before any other directory).
 */
export function verifyShimsPrecedence(
  shimsDir: string,
  pathEnv?: string,
): { isFirstOnPath: boolean; position: number; issues: string[] } {
  const env = pathEnv ?? process.env.PATH ?? "";
  const entries = env.split(delimiter).filter(Boolean);
  const canonicalShimsDir = resolve(shimsDir);

  const position = entries.findIndex((dir) => resolve(dir) === canonicalShimsDir);
  const isFirstOnPath = position === 0;
  const issues: string[] = [];

  if (position === -1) {
    issues.push(`Shims directory '${shimsDir}' is not present on PATH.`);
  } else if (position > 0) {
    const preceding = entries.slice(0, position).join(", ");
    issues.push(`Shims directory '${shimsDir}' is preceded on PATH by ${position} other directory(s): ${preceding}`);
  }

  return {
    isFirstOnPath,
    position,
    issues,
  };
}
