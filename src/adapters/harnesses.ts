import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { GsdRole, HarnessId, HarnessInventory, StackCatalog } from "../types.js";
import { redactHome } from "../core/paths.js";
import { probeCommand } from "../core/process.js";

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
    configRoots: () => [
      ...(process.env.HERMES_HOME?.trim() ? [process.env.HERMES_HOME.trim()] : []),
      ...(process.platform === "win32" && process.env.LOCALAPPDATA ? [join(process.env.LOCALAPPDATA, "hermes")] : []),
      join(homedir(), ".hermes"),
    ],
  },
};

export function hermesHome(
  env: NodeJS.ProcessEnv = process.env,
  home = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.HERMES_HOME?.trim()) return env.HERMES_HOME.trim();
  if (platform === "win32" && env.LOCALAPPDATA?.trim()) {
    const local = join(env.LOCALAPPDATA.trim(), "hermes");
    if (existsSync(local)) return local;
  }
  const dotHermes = join(home, ".hermes");
  if (existsSync(dotHermes)) return dotHermes;
  if (platform === "win32" && env.LOCALAPPDATA?.trim()) {
    return join(env.LOCALAPPDATA.trim(), "hermes");
  }
  return dotHermes;
}

export function probeHarness(id: HarnessId, catalog: StackCatalog): HarnessInventory {
  const definition = probes[id];
  const probe = definition.commands.map(probeCommand).find((value) => value.command !== null)
    ?? { command: null, version: null, unsupportedReason: null };
  const command = probe.command;
  const roots = definition.configRoots().filter(existsSync);
  const notes: string[] = [];
  if (!command && roots.length > 0) notes.push("config detected, CLI command not found");
  // An unreadable version is reported as unsupported, never simulated.
  if (probe.unsupportedReason !== null) notes.push(`version unavailable: ${probe.unsupportedReason}`);
  if (id === "pi") notes.push("Pi 0.84.4+ discovers Agent Skills from the shared ~/.agents/skills root; extensions remain separate");
  return {
    id,
    displayName: catalog.harnesses[id].displayName,
    command: command ? redactHome(command) : null,
    version: probe.version,
    configRoots: roots.map(redactHome),
    detected: command !== null || roots.length > 0,
    notes,
  };
}

export function harnessIds(): HarnessId[] {
  return ["claude", "codex", "antigravity", "pi", "hermes"];
}

export interface HarnessAuthority {
  readonly id: HarnessId;
  readonly defaultRole: GsdRole;
  readonly isStateWriterAllowed: boolean;
  readonly notes: readonly string[];
}

export function probeHarnessAuthority(id: HarnessId): HarnessAuthority {
  return {
    id,
    defaultRole: "controller",
    isStateWriterAllowed: true,
    notes: ["permitted GSD controller role when session initiator"],
  };
}

