import type { Inventory, StackCatalog } from "../types.js";
import { harnessIds, probeHarness } from "../adapters/harnesses.js";
import { probeCommand } from "./process.js";

function toolVersion(command: string): { version: string | null; command: string | null } {
  const probe = probeCommand(command);
  return { version: probe.version, command: probe.command };
}

export function collectInventory(catalog: StackCatalog): Inventory {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    tools: {
      node: { version: process.version, command: process.execPath },
      npm: toolVersion("npm"),
      git: toolVersion("git"),
    },
    harnesses: harnessIds().map((id) => probeHarness(id, catalog)),
  };
}
