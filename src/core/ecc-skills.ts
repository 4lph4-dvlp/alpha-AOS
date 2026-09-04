import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, StackLock } from "../types.js";
import { eccSkillRoot, runEccFixture, type SelectedEccSkill } from "./ecc-fixture.js";
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

/** The rendered file a skill is written from and to, under any root. */
function skillFile(root: string, skill: SelectedEccSkill): string {
  return join(root, skill, "SKILL.md");
}

export async function planEccSkillSync(harness: HarnessId, lock: StackLock, targetRoot = globalEccSkillRoot(harness)): Promise<EccSkillSyncPlan> {
  const ecc = requireEccLock(lock);
  const entries: EccSkillSyncEntry[] = [];
  for (const skill of selectedSkills) {
    const expectedHash = ecc.targetSha256[skill]?.[harness];
    if (!expectedHash) throw new Error(`ECC target hash is missing for ${skill}:${harness}`);
    const destination = skillFile(targetRoot, skill);
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

// ---------------------------------------------------------------------------
// Complete operation plan
// ---------------------------------------------------------------------------

export interface EccSkillOperationSource {
  skill: SelectedEccSkill;
  /** Absolute path the rendered bytes are read from, when it is known now. */
  source: string | null;
  /** Hash of those bytes, bound at review time when a source tree was supplied. */
  sourceHash: string | null;
}

export interface EccSkillOperationPlan {
  kind: "ecc-skill-sync";
  harness: HarnessId;
  targetRoot: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  /** Identity binding a source tree this plan has not seen. */
  package: { name: string; version: string; integrity: string } | null;
  /** Root the rendered skills are read from. Null when a fixture must produce one. */
  sourceRoot: string | null;
  /** Root inside which a fixture-produced source tree must land. */
  tempRoot: string | null;
  sources: readonly EccSkillOperationSource[];
  proofs: OperationPathProofSet;
  digest: string;
  /** The narrow shape existing callers and the CLI already render. */
  sync: EccSkillSyncPlan;
}

export interface EccSkillPlanOptions {
  targetRoot?: string;
  stateRoot?: string;
  /**
   * An already-rendered, already-verified skill tree laid out as
   * `<root>/<skill>/SKILL.md`. Supplying one skips the fixture entirely and
   * lets the plan bind every source byte before anything is acquired.
   */
  verifiedSourceRoot?: string;
}

/**
 * Enumerates every destination, source, state path and expected hash this
 * sync may touch, and binds them into one reviewable digest. Reads only.
 */
export async function planEccSkillOperation(
  harness: HarnessId,
  lock: StackLock,
  options: EccSkillPlanOptions = {},
): Promise<EccSkillOperationPlan> {
  const ecc = requireEccLock(lock);
  const targetRoot = resolve(options.targetRoot ?? globalEccSkillRoot(harness));
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const sourceRoot = options.verifiedSourceRoot ? resolve(options.verifiedSourceRoot) : null;
  const tempRoot = sourceRoot === null ? resolve(tmpdir()) : null;
  const sync = await planEccSkillSync(harness, lock, targetRoot);

  const sources: EccSkillOperationSource[] = [];
  for (const skill of selectedSkills) {
    if (sourceRoot === null) {
      sources.push({ skill, source: null, sourceHash: null });
      continue;
    }
    const source = skillFile(sourceRoot, skill);
    if (!inside(sourceRoot, source)) throw new Error(`Unsafe ECC source: ${source}`);
    sources.push({
      skill,
      source,
      sourceHash: existsSync(source) ? sha256(await readFile(source)) : null,
    });
  }

  const inputs: OperationPathInput[] = [
    ...sync.entries.map((entry): OperationPathInput => ({ role: "target", path: entry.destination })),
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
  ];
  if (sourceRoot !== null) {
    inputs.push({ role: "package-root", path: sourceRoot }, { role: "source", path: sourceRoot });
    for (const source of sources) {
      if (source.source !== null) inputs.push({ role: "source", path: source.source });
    }
  }
  if (tempRoot !== null) inputs.push({ role: "temp", path: tempRoot });

  const allowedRoots = [targetRoot, stateRoot, ...(sourceRoot === null ? [tempRoot as string] : [sourceRoot])];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: sourceRoot === null
      ? ["target", "state", "journal", "snapshot", "temp"]
      : ["target", "state", "journal", "snapshot", "source", "package-root"],
  });

  const digest = reviewedDigest("ecc-skill-sync", {
    harness,
    targetRoot,
    stateRoot,
    allowedRoots,
    package: { name: ecc.package, version: ecc.version, integrity: ecc.integrity },
    sourceRoot,
    tempRoot,
    sources,
    entries: sync.entries,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "ecc-skill-sync",
    harness,
    targetRoot,
    stateRoot,
    allowedRoots,
    package: sourceRoot === null ? { name: ecc.package, version: ecc.version, integrity: ecc.integrity } : null,
    sourceRoot,
    tempRoot,
    sources,
    proofs,
    digest,
    sync,
  };
}

export interface EccSkillApplyOptions extends EccSkillPlanOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: EccSkillOperationPlan;
  /**
   * A writer already held by the caller. When supplied this apply consumes it
   * and takes no lock of its own.
   */
  session?: MutationSession;
}

/**
 * Where a rendered skill tree comes from, and what must be released when the
 * operation ends. A supplied tree belongs to the caller and is never removed.
 */
interface RenderedSource {
  root: string;
  cleanup: string | null;
}

/**
 * Runs the fixture and proves its output landed inside the temp root the plan
 * declared. The fixture still names its own directory, so this is a
 * containment check rather than a precomputed path — see the plan summary.
 */
async function renderEccSkills(plan: EccSkillOperationPlan, lock: StackLock): Promise<RenderedSource> {
  if (plan.sourceRoot !== null) return { root: plan.sourceRoot, cleanup: null };
  const tempRoot = plan.tempRoot as string;
  await assertUnchangedSincePlan(plan, plannedProof(plan, "temp", tempRoot));

  const ecc = requireEccLock(lock);
  const fixture = await runEccFixture({ harness: plan.harness, ecc, keep: true });
  const retained = fixture.retainedFixture;
  if (retained === null) throw new Error("ECC fixture did not retain its verified source tree");
  const root = resolve(retained);
  if (!inside(tempRoot, root) || root === resolve(tempRoot)) {
    throw new ComponentPlanError("unplanned-path", `ECC fixture landed outside the planned temp root: ${root}`);
  }
  for (const skill of selectedSkills) {
    if (fixture.sourceHashes[skill] !== ecc.sourceSha256[skill]) {
      throw new ComponentPlanError("source-drift", `ECC source hash mismatch for ${skill}`);
    }
    if (fixture.targetHashes[skill] !== ecc.targetSha256[skill]?.[plan.harness]) {
      throw new ComponentPlanError("source-drift", `ECC rendered hash mismatch for ${skill}:${plan.harness}`);
    }
  }
  if (!inside(root, fixture.targetRoot)) {
    throw new ComponentPlanError("unplanned-path", `ECC fixture target root escaped its fixture: ${fixture.targetRoot}`);
  }
  return { root: resolve(fixture.targetRoot), cleanup: root };
}

export async function applyEccSkillSync(harness: HarnessId, lock: StackLock, options: EccSkillApplyOptions = {}): Promise<{
  operationId: string | null;
  plan: EccSkillSyncPlan;
  digest: string;
}> {
  const reviewed = options.plan ?? await planEccSkillOperation(harness, lock, options);

  // Complete read-only revalidation before anything is acquired or run.
  const revalidation: EccSkillPlanOptions = { targetRoot: reviewed.targetRoot, stateRoot: reviewed.stateRoot };
  if (reviewed.sourceRoot !== null) revalidation.verifiedSourceRoot = reviewed.sourceRoot;
  const revalidated = await planEccSkillOperation(harness, lock, revalidation);
  assertPlanUnchanged(reviewed, revalidated);

  if (reviewed.sync.entries.every((entry) => entry.action === "current")) {
    return { operationId: null, plan: reviewed.sync, digest: reviewed.digest };
  }

  return withComponentSession(reviewed, options.session, async (session) => {
    const rendered = await renderEccSkills(reviewed, lock);
    try {
      const operations: Array<{ target: string; content: Uint8Array }> = [];
      for (const entry of reviewed.sync.entries) {
        if (entry.action === "current") continue;
        const source = skillFile(rendered.root, entry.skill);
        if (!inside(rendered.root, source)) {
          throw new ComponentPlanError("unplanned-path", `ECC source escaped its verified root: ${source}`);
        }
        if (reviewed.sourceRoot !== null) {
          const sourceProof = plannedProof(reviewed, "source", source);
          await assertUnchangedSincePlan(reviewed, sourceProof);
        }
        if (!existsSync(source)) {
          throw new ComponentPlanError("source-drift", `ECC rendered skill is missing: ${entry.skill}`);
        }
        const content = await readFile(source);
        // The lock's rendered hash is the authority for what may be written,
        // whichever root produced the bytes.
        if (sha256(content) !== entry.expectedHash) {
          throw new ComponentPlanError("source-drift", `ECC rendered skill changed since it was reviewed: ${entry.skill}`);
        }
        const current = existsSync(entry.destination) ? sha256(await readFile(entry.destination)) : null;
        if (current !== entry.currentHash) {
          throw new ComponentPlanError("plan-drift", `ECC destination changed since it was reviewed: ${entry.skill}`);
        }

        const targetProof = plannedProof(reviewed, "target", entry.destination);
        await assertUnchangedSincePlan(reviewed, targetProof);
        operations.push({ target: entry.destination, content });
      }

      if (operations.length === 0) {
        return { operationId: null, plan: reviewed.sync, digest: reviewed.digest };
      }

      const journal = await applyFileTransaction({
        stateRoot: reviewed.stateRoot,
        allowedRoots: [reviewed.targetRoot],
        operations,
        session,
      });
      return {
        operationId: journal.id,
        plan: await planEccSkillSync(harness, lock, reviewed.targetRoot),
        digest: reviewed.digest,
      };
    } finally {
      if (rendered.cleanup !== null) {
        const tempRoot = resolve(tmpdir());
        const fixtureRoot = rendered.cleanup;
        if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) {
          throw new Error(`Unsafe ECC fixture cleanup path: ${fixtureRoot}`);
        }
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    }
  });
}
