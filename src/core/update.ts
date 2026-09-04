import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { LockedPackage, StackLock } from "../types.js";
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

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

/** The document a candidate stage would write, byte for byte. */
export function renderCandidate(candidate: StackLock): string {
  return `${JSON.stringify(candidate, null, 2)}\n`;
}

export function candidateLockPath(root: string): string {
  return join(resolve(root), "catalog", "candidate.lock.json");
}

export interface CandidateStagePlan {
  kind: "candidate-stage";
  root: string;
  target: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  currentHash: string | null;
  renderedHash: string;
  action: "create" | "update" | "current";
  proofs: OperationPathProofSet;
  digest: string;
}

export interface CandidateStageOptions {
  stateRoot?: string;
}

/**
 * Enumerates the paths a candidate stage would touch and binds the current and
 * rendered hashes. Reads only — a preview compares without writing.
 */
export async function planCandidateStage(
  root: string,
  candidate: StackLock,
  options: CandidateStageOptions = {},
): Promise<CandidateStagePlan> {
  const target = candidateLockPath(root);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const rendered = renderCandidate(candidate);
  const renderedHash = sha256(rendered);
  const currentHash = existsSync(target) ? sha256(await readFile(target)) : null;

  const allowedRoots = [dirname(target), stateRoot];
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: target },
      { role: "package-root", path: resolve(root) },
      { role: "state", path: stateRoot },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [...allowedRoots, resolve(root)],
    requiredRoles: ["target", "state", "journal", "snapshot", "package-root"],
  });

  const action = currentHash === renderedHash ? "current" : currentHash === null ? "create" : "update";
  const digest = reviewedDigest("candidate-stage", {
    root: resolve(root),
    target,
    stateRoot,
    allowedRoots,
    currentHash,
    renderedHash,
    action,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "candidate-stage",
    root: resolve(root),
    target,
    stateRoot,
    allowedRoots,
    currentHash,
    renderedHash,
    action,
    proofs,
    digest,
  };
}

export interface CandidateStageApplyOptions extends CandidateStageOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: CandidateStagePlan;
  /** A writer already held by the caller; apply then takes no lock of its own. */
  session?: MutationSession;
}

/**
 * Stages a candidate lock through the shared transaction, so the previous
 * candidate is snapshotted and the write is journaled rather than renamed
 * over whatever was there.
 */
export async function writeCandidate(
  root: string,
  candidate: StackLock,
  options: CandidateStageApplyOptions = {},
): Promise<string | null> {
  const reviewed = options.plan ?? await planCandidateStage(root, candidate, options);
  if (reviewed.action === "current") return null;

  const revalidated = await planCandidateStage(reviewed.root, candidate, { stateRoot: reviewed.stateRoot });
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    const proof = plannedProof(reviewed, "target", reviewed.target);
    await assertUnchangedSincePlan(reviewed, proof);
    const rendered = renderCandidate(candidate);
    if (sha256(rendered) !== reviewed.renderedHash) {
      throw new ComponentPlanError("plan-drift", `Candidate lock changed between review and apply: ${reviewed.target}`);
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [dirname(reviewed.target)],
      operations: [{ target: reviewed.target, content: rendered }],
      session,
    });
    return journal.id;
  });
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
