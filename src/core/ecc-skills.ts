import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackLock } from "../types.js";
import { eccSkillRoot, runEccFixture, type SelectedEccSkill } from "./ecc-fixture.js";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";

const selectedSkills: SelectedEccSkill[] = ["unified-memory", "documentation-lookup", "deep-research"];

export interface EccSkillSyncEntry {
  skill: SelectedEccSkill;
  destination: string;
  expectedHash: string;
  currentHash: string | null;
  action: "create" | "update" | "current";
}

export interface EccSkillSyncPlan {
  harness: HarnessId;
  targetRoot: string;
  entries: EccSkillSyncEntry[];
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function globalEccSkillRoot(harness: HarnessId, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  switch (harness) {
    case "claude": return join(env.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude"), "skills");
    case "codex": return join(home, ".agents", "skills");
    case "antigravity": return join(env.ANTIGRAVITY_CONFIG_DIR?.trim() || join(home, ".gemini", "config"), "skills");
    case "pi": return join(home, ".agents", "skills");
    case "hermes": return join(env.HERMES_HOME?.trim() || join(home, ".hermes"), "skills");
  }
}

function requireEccLock(lock: StackLock): NonNullable<StackLock["components"]["ecc"]> {
  const ecc = lock.components.ecc;
  if (!ecc) throw new Error("Stable lock has no ECC component");
  for (const skill of selectedSkills) {
    if (!ecc.sourceSha256[skill]) throw new Error(`ECC source hash is missing for ${skill}`);
  }
  return ecc;
}

export async function planEccSkillSync(harness: HarnessId, lock: StackLock, targetRoot = globalEccSkillRoot(harness)): Promise<EccSkillSyncPlan> {
  const ecc = requireEccLock(lock);
  const entries: EccSkillSyncEntry[] = [];
  for (const skill of selectedSkills) {
    const expectedHash = ecc.targetSha256[skill]?.[harness];
    if (!expectedHash) throw new Error(`ECC target hash is missing for ${skill}:${harness}`);
    const destination = join(targetRoot, skill, "SKILL.md");
    if (!inside(targetRoot, destination)) throw new Error(`Unsafe ECC destination: ${destination}`);
    const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
    entries.push({
      skill,
      destination,
      expectedHash,
      currentHash,
      action: currentHash === expectedHash ? "current" : currentHash ? "update" : "create",
    });
  }
  return { harness, targetRoot, entries };
}

export async function applyEccSkillSync(harness: HarnessId, lock: StackLock, options: {
  targetRoot?: string;
  stateRoot?: string;
} = {}): Promise<{ operationId: string | null; plan: EccSkillSyncPlan }> {
  const ecc = requireEccLock(lock);
  const targetRoot = options.targetRoot ?? globalEccSkillRoot(harness);
  const plan = await planEccSkillSync(harness, lock, targetRoot);
  if (plan.entries.every((entry) => entry.action === "current")) return { operationId: null, plan };
  const fixture = await runEccFixture({ harness, ecc, keep: true });
  const retained = fixture.retainedFixture;
  if (!retained) throw new Error("ECC fixture did not retain its verified source tree");
  try {
    for (const skill of selectedSkills) {
      if (fixture.sourceHashes[skill] !== ecc.sourceSha256[skill]) throw new Error(`ECC source hash mismatch for ${skill}`);
      if (fixture.targetHashes[skill] !== ecc.targetSha256[skill]?.[harness]) throw new Error(`ECC rendered hash mismatch for ${skill}:${harness}`);
    }
    const operations = await Promise.all(plan.entries.filter((entry) => entry.action !== "current").map(async (entry) => ({
      target: entry.destination,
      content: await readFile(join(fixture.targetRoot, entry.skill, "SKILL.md")),
    })));
    const journal = await applyFileTransaction({
      stateRoot: options.stateRoot ?? userStateRoot(),
      allowedRoots: [targetRoot],
      operations,
    });
    return { operationId: journal.id, plan: await planEccSkillSync(harness, lock, targetRoot) };
  } finally {
    const tempRoot = resolve(tmpdir());
    const fixtureRoot = resolve(retained);
    if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) throw new Error(`Unsafe ECC fixture cleanup path: ${fixtureRoot}`);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}
