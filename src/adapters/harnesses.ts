import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { HarnessId, HarnessInventory, StackCatalog } from "../types.js";
import { redactHome } from "../core/paths.js";
import { readCommandVersion, resolveCommand } from "../core/process.js";

interface ProbeDefinition {
  commands: string[];
  configRoots: () => string[];
}

function environmentOrFallback(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() ? value : fallback;
}

const probes: Record<HarnessId, ProbeDefinition> = {
  claude: {
    commands: ["claude"],
    configRoots: () => [environmentOrFallback("CLAUDE_CONFIG_DIR", join(homedir(), ".claude"))],
  },
  codex: {
    commands: ["codex"],
    configRoots: () => [environmentOrFallback("CODEX_HOME", join(homedir(), ".codex"))],
  },
  antigravity: {
    commands: ["agy", "antigravity"],
    configRoots: () => [
      join(homedir(), ".gemini", "antigravity-cli"),
      join(homedir(), ".antigravity"),
      join(homedir(), ".gemini", "antigravity"),
      join(homedir(), ".gemini", "antigravity-ide"),
      ...(process.platform === "win32" && process.env.APPDATA ? [join(process.env.APPDATA, "Antigravity")] : []),
    ],
  },
  pi: {
    commands: ["pi"],
    configRoots: () => [environmentOrFallback("PI_CODING_AGENT_DIR", join(homedir(), ".pi", "agent"))],
  },
  hermes: {
    commands: ["hermes"],
    configRoots: () => [environmentOrFallback("HERMES_HOME", join(homedir(), ".hermes"))],
  },
};

export function probeHarness(id: HarnessId, catalog: StackCatalog): HarnessInventory {
  const definition = probes[id];
  const command = definition.commands.map(resolveCommand).find((value) => value !== null) ?? null;
  const roots = definition.configRoots().filter(existsSync);
  const notes: string[] = [];
  if (!command && roots.length > 0) notes.push("config detected, CLI command not found");
  if (id === "hermes") notes.push("worker-only by stack policy; not a GSD state writer");
  if (id === "pi") notes.push("Pi 0.84.4+ discovers Agent Skills from the shared ~/.agents/skills root; extensions remain separate");
  return {
    id,
    displayName: catalog.harnesses[id].displayName,
    command: command ? redactHome(command) : null,
    version: command ? readCommandVersion(command) : null,
    configRoots: roots.map(redactHome),
    detected: command !== null || roots.length > 0,
    notes,
  };
}

export function harnessIds(): HarnessId[] {
  return ["claude", "codex", "antigravity", "pi", "hermes"];
}
