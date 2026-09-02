import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackCatalog, StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";

export interface OwnedSkillSyncPlan {
  id: string;
  target: HarnessId;
  source: string;
  destination: string;
  expectedHash: string;
  currentHash: string | null;
  action: "create" | "replace" | "current";
  workflow: string;
  workflowFound: boolean;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function destinationFor(target: HarnessId, id: string): string {
  if (target === "claude") return join(homedir(), ".claude", "skills", id, "SKILL.md");
  throw new Error(`Owned skill adapter is not implemented for target: ${target}`);
}

export function renderOwnedSkill(source: string, target: HarnessId, invocation: "explicit" | "automatic", argumentHint?: string): string {
  if (target !== "claude") throw new Error(`Owned skill renderer is not implemented for target: ${target}`);
  if (!source.startsWith("---\n")) throw new Error("Owned skill source must start with YAML frontmatter");
  const additions: string[] = [];
  if (argumentHint) additions.push(`argument-hint: ${JSON.stringify(argumentHint)}`);
  if (invocation === "explicit") additions.push("disable-model-invocation: true");
  return additions.length === 0 ? source : `---\n${additions.join("\n")}\n${source.slice(4)}`;
}

export async function planOwnedSkillSync(
  root: string,
  catalog: StackCatalog,
  lock: StackLock,
  id: string,
  target: HarnessId,
): Promise<OwnedSkillSyncPlan> {
  const skill = catalog.components.ownedSkills.find((candidate) => candidate.id === id);
  if (!skill) throw new Error(`Unknown owned skill: ${id}`);
  if (!skill.targets.includes(target)) throw new Error(`Owned skill ${id} does not support target: ${target}`);
  const locked = lock.components.ownedSkills?.[id];
  if (!locked) throw new Error(`Owned skill lock missing ${id}`);

  const source = resolve(root, skill.source);
  if (!inside(root, source)) throw new Error(`Owned skill source escapes package root: ${skill.source}`);
  const sourceContent = await readFile(source, "utf8");
  const sourceHash = sha256(Buffer.from(sourceContent, "utf8"));
  if (sourceHash !== locked.sourceSha256) {
    throw new Error(`Owned skill source hash mismatch for ${id}: expected ${locked.sourceSha256}, got ${sourceHash}`);
  }
  const rendered = renderOwnedSkill(sourceContent, target, skill.invocation, skill.argumentHint);
  const expectedHash = locked.targetSha256[target];
  if (!expectedHash) throw new Error(`Owned skill target hash missing for ${id}:${target}`);
  const renderedHash = sha256(Buffer.from(rendered, "utf8"));
  if (renderedHash !== expectedHash) {
    throw new Error(`Owned skill rendered hash mismatch for ${id}:${target}: expected ${expectedHash}, got ${renderedHash}`);
  }

  const destination = destinationFor(target, id);
  const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
  const workflow = join(homedir(), ".claude", locked.upstreamWorkflow);
  return {
    id,
    target,
    source,
    destination,
    expectedHash,
    currentHash,
    action: currentHash === expectedHash ? "current" : currentHash === null ? "create" : "replace",
    workflow,
    workflowFound: existsSync(workflow),
  };
}

export async function applyOwnedSkillSync(
  root: string,
  catalog: StackCatalog,
  lock: StackLock,
  id: string,
  target: HarnessId,
): Promise<{ plan: OwnedSkillSyncPlan; operationId: string | null }> {
  const plan = await planOwnedSkillSync(root, catalog, lock, id, target);
  if (!plan.workflowFound) throw new Error(`Required GSD workflow is missing: ${plan.workflow}`);
  if (plan.action === "current") return { plan, operationId: null };
  const skill = catalog.components.ownedSkills.find((candidate) => candidate.id === id);
  if (!skill) throw new Error(`Unknown owned skill: ${id}`);
  const source = await readFile(plan.source, "utf8");
  const content = renderOwnedSkill(source, target, skill.invocation, skill.argumentHint);
  const skillRoot = resolve(plan.destination, "..", "..");
  const journal = await applyFileTransaction({
    stateRoot: userStateRoot(),
    allowedRoots: [skillRoot],
    operations: [{ target: plan.destination, content }],
  });
  return { plan: await planOwnedSkillSync(root, catalog, lock, id, target), operationId: journal.id };
}
