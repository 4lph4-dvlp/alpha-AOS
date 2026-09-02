import { writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { LockedPackage, StackLock } from "../types.js";

interface RegistryDocument {
  version: string;
  dist?: { integrity?: string };
}

async function latestPackage(name: string): Promise<LockedPackage> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm registry returned ${response.status} for ${name}`);
  const body = await response.json() as RegistryDocument;
  if (!body.version || !body.dist?.integrity) throw new Error(`npm metadata incomplete for ${name}`);
  return { package: name, version: body.version, integrity: body.dist.integrity };
}

export async function resolveCandidate(current: StackLock): Promise<StackLock> {
  const gsdName = current.components.gsd?.package;
  const eccName = current.components.ecc?.package;
  const mcpEntries = Object.entries(current.components.mcp ?? {});
  const bridgeEntries = Object.entries(current.components.mcpBridges ?? {}).filter((entry): entry is [string, LockedPackage] => Boolean(entry[1]));
  if (!gsdName || !eccName) throw new Error("Current lock does not name GSD and ECC packages");
  const [gsd, ecc, mcp, bridges] = await Promise.all([
    latestPackage(gsdName),
    latestPackage(eccName),
    Promise.all(mcpEntries.map(([, entry]) => latestPackage(entry.package))),
    Promise.all(bridgeEntries.map(([, entry]) => latestPackage(entry.package))),
  ]);
  const candidateMcp: Record<string, LockedPackage> = {};
  mcpEntries.forEach(([id], index) => {
    const entry = mcp[index];
    if (entry) candidateMcp[id] = entry;
  });
  const candidateBridges: NonNullable<StackLock["components"]["mcpBridges"]> = {};
  bridgeEntries.forEach(([id], index) => {
    const entry = bridges[index];
    if (entry) candidateBridges[id as keyof typeof candidateBridges] = entry;
  });
  return {
    schemaVersion: 1,
    channel: "candidate",
    generatedAt: new Date().toISOString(),
    status: "unverified",
    components: {
      gsd: { ...gsd, profile: current.components.gsd?.profile ?? "standard" },
      ecc: {
        ...ecc,
        skills: current.components.ecc?.skills ?? [],
        sourceSha256: ecc.version === current.components.ecc?.version ? current.components.ecc.sourceSha256 : {},
        targetSha256: ecc.version === current.components.ecc?.version ? current.components.ecc.targetSha256 : {},
      },
      mcp: candidateMcp,
      mcpBridges: candidateBridges,
      ...(current.components.ownedSkills ? { ownedSkills: current.components.ownedSkills } : {}),
    },
  };
}

export async function writeCandidate(root: string, candidate: StackLock): Promise<void> {
  const target = join(root, "catalog", "candidate.lock.json");
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(candidate, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, target);
}

export function hasVersionChanges(current: StackLock, candidate: StackLock): boolean {
  const version = (value: LockedPackage | undefined): string | null => value?.version ?? null;
  if (version(current.components.gsd) !== version(candidate.components.gsd)) return true;
  if (version(current.components.ecc) !== version(candidate.components.ecc)) return true;
  const ids = new Set([...Object.keys(current.components.mcp ?? {}), ...Object.keys(candidate.components.mcp ?? {})]);
  for (const id of ids) {
    if (version(current.components.mcp?.[id]) !== version(candidate.components.mcp?.[id])) return true;
  }
  const bridgeIds = new Set([
    ...Object.keys(current.components.mcpBridges ?? {}),
    ...Object.keys(candidate.components.mcpBridges ?? {}),
  ]) as Set<keyof NonNullable<StackLock["components"]["mcpBridges"]>>;
  for (const id of bridgeIds) {
    if (version(current.components.mcpBridges?.[id]) !== version(candidate.components.mcpBridges?.[id])) return true;
  }
  return false;
}
