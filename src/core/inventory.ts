import type { Inventory, StackCatalog } from "../types.js";
import { harnessIds, probeHarness } from "../adapters/harnesses.js";
import { readCommandVersion, resolveCommand } from "./process.js";

function toolVersion(command: string): { version: string | null; command: string | null } {
  const path = resolveCommand(command);
  if (!path) return { version: null, command: null };
  return { version: readCommandVersion(path), command: path };
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
