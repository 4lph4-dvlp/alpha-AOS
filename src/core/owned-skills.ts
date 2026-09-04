import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackCatalog, StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
import { applyFileTransaction } from "./transaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";

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

/** The Claude configuration root an owned skill is written into. */
function claudeHomeRoot(override?: string): string {
  return override ? resolve(override) : join(homedir(), ".claude");
}

function destinationFor(target: HarnessId, id: string, claudeHome?: string): string {
  if (target === "claude") return join(claudeHomeRoot(claudeHome), "skills", id, "SKILL.md");
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

export interface OwnedSkillPlanOptions {
  stateRoot?: string;
  /** Overrides the Claude configuration root; defaults to `~/.claude`. */
  claudeHome?: string;
}

export async function planOwnedSkillSync(
  root: string,
  catalog: StackCatalog,
  lock: StackLock,
  id: string,
  target: HarnessId,
  options: OwnedSkillPlanOptions = {},
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

  const destination = destinationFor(target, id, options.claudeHome);
  const currentHash = existsSync(destination) ? sha256(await readFile(destination)) : null;
  const workflow = join(claudeHomeRoot(options.claudeHome), locked.upstreamWorkflow);
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

// ---------------------------------------------------------------------------
// Complete operation plan
// ---------------------------------------------------------------------------

export interface OwnedSkillOperationPlan {
  kind: "owned-skill-sync";
  id: string;
  target: HarnessId;
  stateRoot: string;
  /** The `skills` directory a managed write may land in. */
  skillRoot: string;
  packageRoot: string;
  allowedRoots: readonly string[];
  sourceHash: string;
  /** Hash of the rendered document, which the lock also names. */
  expectedHash: string;
  proofs: OperationPathProofSet;
  digest: string;
  /** The narrow shape existing callers and the CLI already render. */
  sync: OwnedSkillSyncPlan;
}

/**
 * Enumerates the source, destination, workflow dependency and state paths this
 * sync may touch, and binds the locked source and rendered hashes. Reads only.
 */
export async function planOwnedSkillOperation(
  root: string,
  catalog: StackCatalog,
  lock: StackLock,
  id: string,
  target: HarnessId,
  options: OwnedSkillPlanOptions = {},
): Promise<OwnedSkillOperationPlan> {
  const packageRootPath = resolve(root);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  // planOwnedSkillSync already proves the source and rendered hashes against
  // the lock, so a mismatch refuses before any path role is declared.
  const sync = await planOwnedSkillSync(root, catalog, lock, id, target, options);
  const skillRoot = resolve(sync.destination, "..", "..");

  const inputs: OperationPathInput[] = [
    { role: "target", path: sync.destination },
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
    { role: "package-root", path: packageRootPath },
    { role: "source", path: sync.source },
    { role: "source", path: sync.workflow },
  ];
  const allowedRoots = [skillRoot, stateRoot, packageRootPath, resolve(sync.workflow, "..")];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: ["target", "state", "journal", "snapshot", "source", "package-root"],
  });

  const sourceHash = sha256(await readFile(sync.source));
  const digest = reviewedDigest("owned-skill-sync", {
    id,
    target,
    stateRoot,
    skillRoot,
    packageRoot: packageRootPath,
    allowedRoots,
    source: sync.source,
    sourceHash,
    destination: sync.destination,
    currentHash: sync.currentHash,
    expectedHash: sync.expectedHash,
    action: sync.action,
    workflow: sync.workflow,
    workflowFound: sync.workflowFound,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "owned-skill-sync",
    id,
    target,
    stateRoot,
    skillRoot,
    packageRoot: packageRootPath,
    allowedRoots,
    sourceHash,
    expectedHash: sync.expectedHash,
    proofs,
    digest,
    sync,
  };
}

export interface OwnedSkillApplyOptions extends OwnedSkillPlanOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: OwnedSkillOperationPlan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

export async function applyOwnedSkillSync(
  root: string,
  catalog: StackCatalog,
  lock: StackLock,
  id: string,
  target: HarnessId,
  options: OwnedSkillApplyOptions = {},
): Promise<{ plan: OwnedSkillSyncPlan; operationId: string | null; digest: string }> {
  const reviewed = options.plan ?? await planOwnedSkillOperation(root, catalog, lock, id, target, options);
  if (!reviewed.sync.workflowFound) throw new Error(`Required GSD workflow is missing: ${reviewed.sync.workflow}`);
  if (reviewed.sync.action === "current") return { plan: reviewed.sync, operationId: null, digest: reviewed.digest };

  const planOptions: OwnedSkillPlanOptions = { stateRoot: reviewed.stateRoot };
  if (options.claudeHome !== undefined) planOptions.claudeHome = options.claudeHome;
  const revalidated = await planOwnedSkillOperation(root, catalog, lock, id, target, planOptions);
  assertPlanUnchanged(reviewed, revalidated);

  const skill = catalog.components.ownedSkills.find((candidate) => candidate.id === id);
  if (!skill) throw new Error(`Unknown owned skill: ${id}`);

  return withComponentSession(reviewed, options.session, async (session) => {
    const sourceProof = plannedProof(reviewed, "source", reviewed.sync.source);
    await assertUnchangedSincePlan(reviewed, sourceProof);
    const source = await readFile(reviewed.sync.source, "utf8");
    if (sha256(Buffer.from(source, "utf8")) !== reviewed.sourceHash) {
      throw new ComponentPlanError("source-drift", `Owned skill source changed since it was reviewed: ${id}`);
    }
    const content = renderOwnedSkill(source, target, skill.invocation, skill.argumentHint);
    if (sha256(Buffer.from(content, "utf8")) !== reviewed.expectedHash) {
      throw new ComponentPlanError("source-drift", `Owned skill rendered bytes changed since they were reviewed: ${id}`);
    }

    const targetProof = plannedProof(reviewed, "target", reviewed.sync.destination);
    await assertUnchangedSincePlan(reviewed, targetProof);
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [reviewed.skillRoot],
      operations: [{ target: reviewed.sync.destination, content }],
      session,
    });
    return {
      plan: await planOwnedSkillSync(root, catalog, lock, id, target, planOptions),
      operationId: journal.id,
      digest: reviewed.digest,
    };
  });
}
