import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { HarnessId, ProjectCapabilityPlan, StackLock, TargetPreState } from "../types.js";
import { loadLock } from "./catalog.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  plannedProof,
  reviewedDigest,
  withComponentSession,
  type ReviewedComponentPlan,
} from "./component-session.js";
import { createEccFixtureOperationPlan, runEccFixture, type EccFixtureOperationPlan } from "./ecc-fixture.js";
import {
  proveOperationPaths,
  requiredRolesForFileMutation,
  type OperationPathInput,
  type OperationPathProofSet,
} from "./path-boundary.js";
import {
  approvalCommand,
  assertPackSourceShape,
  classifyPlanDrift,
  PLAN_OWNER,
  PLAN_RENDERER_ID,
  PROJECT_PLAN_ARTIFACT,
  PROJECT_RECEIPT_DIRECTORY,
  PROJECT_SKILL_ROOTS,
  readApprovedProjectPlan,
  resolvePackSource,
  revalidateProjectPlan,
  type ApprovedProjectPlanArtifact,
  type PackSourceFinding,
  type RevalidateProjectPlanOptions,
} from "./project-plan.js";
import { applyFileTransaction, type FileWriteOperation } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";

/**
 * The writer half of the project-pack lifecycle.
 *
 * Phase 2 built the reader — `readPackReceiptsStrict`, `reconcileProjectState`,
 * `planPackRemoval`, `applyPackRemoval` — against receipts nothing wrote. This
 * module writes them, and it is a SIBLING of `ecc-skills.ts` rather than a
 * fork of it: source bytes and their hash bind at review time, every
 * destination is proven before anything is acquired, and both the skill writes
 * and the receipt writes travel ONE `applyFileTransaction` call so a failure
 * leaves zero receipts (CONTEXT.md D-06).
 *
 * The set of targets comes from the APPROVED ARTIFACT and from nowhere else. A
 * target derived at apply time — from the catalog, from the lock, from a fresh
 * plan — is a write no reviewer authorised, which is threat T-03-01.
 */

export const PACK_SYNC_DIGEST_KIND = "project-pack-sync";

/** Code point order, never `localeCompare`: no locale may reorder an emitted array. */
function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The rendered file one pack skill is read from and written to, under any root. */
function skillFile(root: string, skill: string): string {
  return join(root, skill, "SKILL.md");
}

/**
 * What sort of project target a receipt row claims.
 *
 * `skill` is the only kind this phase implements and verifies. Project-scope
 * MCP servers and policies are reported UNSUPPORTED rather than silently
 * absent (CONTEXT.md D-05), and an unregistered kind is inert under the Phase 1
 * D-08/D-09 closed-world rule — so a later MCP or policy target is an ADDITIVE
 * value here rather than a breaking change to `schemas/receipt.schema.json`.
 */
export type PackTargetKind = "skill" | "sidecar";

/**
 * Every kind `applyProjectPackSync` can emit.
 *
 * Exported so a test can hold it against the schema's `targets[].kind` enum: a
 * kind added to the writer without the schema, or to the schema without the
 * writer, is a red test rather than a receipt one half of the system refuses.
 */
export const PACK_RECEIPT_TARGET_KINDS: readonly PackTargetKind[] = ["sidecar", "skill"];

// ---------------------------------------------------------------------------
// D-07: the provenance sidecar, written where tolerance is PROVEN and nowhere else
// ---------------------------------------------------------------------------
//
// `.alpha-aos/receipts/` is the authoritative provenance record and stays that
// way. A sidecar is added BESIDE the materialized `SKILL.md` so a user who is
// looking at the harness's own skill directory can see that alpha-AOS put the
// file there and which pack it came from — but only on a surface where research
// actually placed a sidecar in a live skill directory and watched the harness
// list the skill unchanged. Before that proof: receipts alone (CONTEXT.md D-07).
//
// The skill BYTES are never touched. `PLAN_RENDERER_ID` is the identity render,
// so the materialized hash must equal the locked source hash — which is exactly
// why provenance has to live in a separate file rather than in a header.

/**
 * The provenance sidecar's file name, inside the materialized skill directory.
 *
 * Dot-prefixed and non-Markdown on purpose: it is the shape a harness is least
 * likely to mistake for a skill, and it is the shape 03-RESEARCH.md actually
 * probed. It deliberately does NOT end in `.md`, because a Markdown file inside
 * a skill directory is the one shape a skill loader has a reason to open.
 */
export const PACK_SIDECAR_FILE = ".alpha-aos-provenance.json";

/**
 * Whether one surface gets a sidecar, and the evidence that decided it.
 *
 * Same discipline as `SURFACE_CEILING`: the decision carries a reason, the
 * reason CARRIES its citation, and an unproven surface is never upgraded on the
 * strength of a favourable documentation sentence. A reader of a rendered
 * receipts-only line can check the claim without holding this record.
 */
export interface SidecarSurface {
  readonly enabled: boolean;
  /** One sentence stating the ground, ending in `[cited: <evidence>]`. */
  readonly reason: string;
  /** The live observation or document the decision rests on. Contained in `reason`. */
  readonly evidence: string;
}

function surface(enabled: boolean, ground: string, evidence: string): SidecarSurface {
  return { enabled, reason: `${ground} [cited: ${evidence}]`, evidence };
}

/**
 * The per-harness sidecar decision, for every harness with a project-local
 * skill root.
 *
 * claude and codex were PROBED: a real sidecar file was placed inside a live
 * skill directory and each harness went on listing the skill unchanged, with
 * empty stderr and no extra skill surfaced. pi was NOT probed with a
 * non-Markdown sidecar — its documented ignore rule covers root Markdown files
 * only — so it stays receipts-only with the reason recorded rather than the
 * tolerance assumed (03-RESEARCH.md Open Question 2, T-03-100).
 */
export const SIDECAR_SURFACES: ReadonlyMap<HarnessId, SidecarSurface> = new Map<HarnessId, SidecarSurface>([
  [
    "claude",
    surface(
      true,
      "a real sidecar file was placed inside a live skill directory and claude went on listing the skill unchanged, with empty stderr and no extra skill surfaced, so an unexpected file is tolerated here",
      "03-RESEARCH.md Open Question 2, claude 2.1.267",
    ),
  ],
  [
    "codex",
    surface(
      true,
      "a real sidecar file was placed inside a live skill directory and codex went on listing the skill with an unchanged description, with empty stderr and no extra skill surfaced, so an unexpected file is tolerated here",
      "03-RESEARCH.md Open Question 2, codex-cli 0.152.0",
    ),
  ],
  [
    "pi",
    surface(
      false,
      "pi's documented ignore rule covers only root Markdown files that do not look like skills, and no non-Markdown sidecar was ever placed in a pi skill directory, so tolerance here is UNPROVEN rather than unfavourable; this surface stays receipts-only and .alpha-aos/receipts remains the authoritative provenance record",
      "03-RESEARCH.md Open Question 2, pi 0.85.1 docs/skills.md",
    ),
  ],
]);

/**
 * What a sidecar says, exactly as serialized.
 *
 * Every field restates something the receipt already carries. That is the
 * point: the sidecar is a CONVENIENCE VIEW placed where a user is already
 * looking, and never a second source of truth. It names the receipt so a reader
 * who wants the authoritative record knows where it is.
 */
export interface PackSidecarDocument {
  readonly schemaVersion: 1;
  readonly owner: string;
  readonly packId: string;
  readonly harness: HarnessId;
  readonly skill: string;
  readonly source: { readonly package: string; readonly version: string; readonly sha256: string };
  /** Relative POSIX path of the authoritative receipt. */
  readonly receipt: string;
  readonly createdAt: string;
  readonly note: string;
}

const SIDECAR_NOTE =
  "alpha-aos wrote the SKILL.md beside this file as part of a project capability pack. The authoritative " +
  "provenance record is the receipt named above; this file restates it where you are already looking and is never a " +
  "second source of truth. Deleting this file by hand does not remove the pack, and does not stop the harness " +
  "loading the skill — run `alpha-aos project status` to see what is installed and how to remove it.";

/** One planned sidecar: what it says, where it goes, and what its bytes hash to. */
export interface PackSidecar {
  readonly packId: string;
  readonly harness: HarnessId;
  readonly skill: string;
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly document: PackSidecarDocument;
  /** Exact bytes, so a re-run can compare rather than rewrite. */
  readonly content: string;
  readonly targetHash: string;
}

/** The receipt facts a sidecar restates. Every one of them is already on the receipt. */
export interface PackSidecarReceiptFacts {
  readonly skill: string;
  /** Relative POSIX path of the receipt that authoritatively claims this target. */
  readonly path: string;
  readonly sourcePackage: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly createdAt: string;
}

/** A planned sidecar, bound to a destination and to what is at it now. */
export interface ProjectPackSyncSidecar extends PackSidecar {
  /** Absolute destination. */
  readonly destination: string;
  /** sha256 of the bytes at the destination at plan time, or null when absent. */
  readonly currentHash: string | null;
}

/** One surface's sidecar decision, as this sync's plan records it. */
export interface PackSidecarDecision {
  readonly harness: HarnessId;
  readonly enabled: boolean;
  /** The `SIDECAR_SURFACES` reason verbatim, so a receipts-only surface is never a blank. */
  readonly reason: string;
}

function sidecarBytes(document: PackSidecarDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Everything a sidecar ASSERTS, with `createdAt` removed.
 *
 * Exactly the discipline `receiptClaimShape` already applies, and for the same
 * reason: `createdAt` is the one field no input derives, so comparing it would
 * make every re-run rewrite a file whose every claim is unchanged. Here it
 * matters twice over, because the receipt claims the sidecar's BYTE hash — a
 * fresh timestamp on every run would move that hash, move the receipt, and make
 * the D-06 idempotency edge permanently unreachable.
 */
function sidecarClaimShape(document: PackSidecarDocument): string {
  const { createdAt: _createdAt, ...claims } = document;
  return JSON.stringify(claims);
}

/** The sidecar already on disk, when it parses. Never partly trusted. */
async function readExistingSidecar(destination: string): Promise<PackSidecarDocument | null> {
  if (!existsSync(destination)) return null;
  try {
    return JSON.parse(await readFile(destination, "utf8")) as PackSidecarDocument;
  } catch {
    return null;
  }
}

/** The POSIX directory one relative target path sits in. */
function posixDirectory(path: string): string {
  const cut = path.lastIndexOf("/");
  if (cut <= 0) {
    throw new ComponentPlanError("unplanned-path", `a pack target has no directory to place provenance beside: ${path}`);
  }
  return path.slice(0, cut);
}

/**
 * The provenance sidecar for one materialized skill, or null on a surface whose
 * tolerance is unproven.
 *
 * Null is a DECISION, not an omission: the caller records the surface and the
 * reason alongside, so a report can say "not written here on purpose" rather
 * than leaving a blank that reads as a missing file.
 */
export function planPackSidecar(
  packId: string,
  harness: HarnessId,
  targetDirectory: string,
  receipt: PackSidecarReceiptFacts,
): PackSidecar | null {
  const decision = SIDECAR_SURFACES.get(harness);
  if (decision === undefined || !decision.enabled) return null;
  const document: PackSidecarDocument = {
    schemaVersion: 1,
    owner: PLAN_OWNER,
    packId,
    harness,
    skill: receipt.skill,
    source: { package: receipt.sourcePackage, version: receipt.sourceVersion, sha256: receipt.sourceSha256 },
    receipt: receipt.path,
    createdAt: receipt.createdAt,
    note: SIDECAR_NOTE,
  };
  const content = sidecarBytes(document);
  return {
    packId,
    harness,
    skill: receipt.skill,
    path: `${targetDirectory}/${PACK_SIDECAR_FILE}`,
    document,
    content,
    targetHash: sha256(content),
  };
}

/** The relative POSIX receipt path for one pack. Stated once. */
function receiptPathFor(packId: string): string {
  return `${PROJECT_RECEIPT_DIRECTORY}/${packId}.json`;
}

/** One target path a receipt this module writes will claim. */
export interface PackReceiptTarget {
  readonly harness: HarnessId;
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly targetHash: string;
  readonly kind: PackTargetKind;
}

/** The receipt document, exactly as serialized. */
export interface PackReceiptDocument {
  readonly schemaVersion: 1;
  readonly packId: string;
  readonly producer: { readonly name: string; readonly version: string };
  readonly createdAt: string;
  readonly sourceHash: string;
  readonly evidenceHash: string;
  readonly targets: readonly PackReceiptTarget[];
}

/** One planned write: where the bytes come from, and what they must hash to. */
export interface ProjectPackSyncTarget {
  readonly packId: string;
  readonly skill: string;
  readonly harness: HarnessId;
  /** Relative POSIX path from the canonical root, as the artifact recorded it. */
  readonly path: string;
  /** Absolute destination. */
  readonly destination: string;
  /** Absolute source file the bytes are read from. */
  readonly source: string;
  /** The hash `catalog/stack.lock.json` pins for this skill. */
  readonly sourceSha256: string;
  /**
   * sha256 of the bytes actually read at review time, or `null` when the source
   * tree does not exist yet because a fixture will produce it. The locked hash
   * binds it in that case, and apply refuses on any mismatch.
   */
  readonly readHash: string | null;
  /** Identity render, so this is `sourceSha256` — asserted, never recomputed. */
  readonly targetHash: string;
  /** What the reviewed artifact recorded at the destination. */
  readonly currentHash: string | null;
  readonly action: "create" | "update";
}

/** One receipt this sync would write. */
export interface ProjectPackSyncReceipt {
  readonly packId: string;
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly destination: string;
  readonly document: PackReceiptDocument;
  /** Exact bytes, so a re-run can compare rather than rewrite. */
  readonly content: string;
}

export interface ProjectPackSyncPlan extends ReviewedComponentPlan {
  readonly kind: typeof PACK_SYNC_DIGEST_KIND;
  readonly canonicalRoot: string;
  readonly stateRoot: string;
  readonly artifactPath: string;
  /** The plan a fresh read produces now. Equal to `approved` by construction. */
  readonly plan: ProjectCapabilityPlan;
  /** The reviewed artifact every target was read out of. */
  readonly approved: ApprovedProjectPlanArtifact;
  readonly targets: readonly ProjectPackSyncTarget[];
  readonly receipts: readonly ProjectPackSyncReceipt[];
  /**
   * The provenance sidecars this sync would write, on the surfaces where
   * tolerance is proven. Sorted by path.
   */
  readonly sidecars: readonly ProjectPackSyncSidecar[];
  /**
   * One entry per harness this sync targets, saying whether it gets a sidecar
   * and why. A receipts-only surface is stated with its reason rather than
   * rendered as an absent sidecar: "not written here on purpose" and "should be
   * here and is not" are different facts.
   */
  readonly sidecarSurfaces: readonly PackSidecarDecision[];
  /** Pack ids this sync materializes, sorted. */
  readonly packs: readonly string[];
  /** The only roots a write may land inside. */
  readonly allowedRoots: readonly string[];
  /** Root the pack skills are read from, supplied or fixture-produced. */
  readonly sourceRoot: string;
  /**
   * Pack skills whose source directory is not the single file D-05 writes.
   *
   * Produced at PLAN time, before a byte is written, and carried in the plan
   * value so the finding reaches a reviewer rather than a log line. A pack that
   * fires one is NOT dropped: it stays in `packs` and keeps its targets, so the
   * user is told both facts (T-03-92).
   */
  readonly sourceFindings: readonly PackSourceFinding[];
  /** The fixture that will produce the sources, when no tree was supplied. */
  readonly fixture: EccFixtureOperationPlan | null;
  readonly proofs: OperationPathProofSet;
  readonly digest: string;
  /** True when every skill target and every receipt is already exactly right. */
  readonly alreadyCurrent: boolean;
}

export type ProjectPackSyncStatus = "written" | "already-current";

export interface ProjectPackSyncResult {
  readonly status: ProjectPackSyncStatus;
  /** The journal id, or `null` when nothing needed writing. */
  readonly operationId: string | null;
  /** Relative POSIX skill paths written. Sorted. */
  readonly written: readonly string[];
  /** Relative POSIX receipt paths written. Sorted. */
  readonly receipts: readonly string[];
  /** Relative POSIX provenance-sidecar paths written. Sorted. */
  readonly sidecars: readonly string[];
  /** Which surfaces got a sidecar and which are receipts-only, with the reason. */
  readonly sidecarSurfaces: readonly PackSidecarDecision[];
  /** Relative POSIX paths that were already exactly right. Sorted. */
  readonly current: readonly string[];
  /** Pack ids this sync materialized, sorted. */
  readonly packs: readonly string[];
  /** The plan-time source-shape findings, carried through to the report. */
  readonly findings: readonly PackSourceFinding[];
  readonly digest: string;
}

export interface ProjectPackSyncOptions extends RevalidateProjectPlanOptions {
  /**
   * An already-rendered, already-verified pack skill tree laid out as
   * `<root>/<skill>/SKILL.md`. Supplying one skips the fixture entirely and
   * lets the plan bind every source byte before anything is acquired.
   *
   * Reading from a globally installed ECC instead would let a local upgrade
   * silently change pack bytes, which is exactly what the lock exists to stop.
   */
  readonly verifiedSourceRoot?: string | undefined;
  /** Reuses a reviewed fixture location so revalidation compares the same plan. */
  readonly fixtureRoot?: string | undefined;
}

export interface ApplyProjectPackSyncOptions extends ProjectPackSyncOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  readonly plan?: ProjectPackSyncPlan | undefined;
  /** A writer already held by the caller. When supplied, no second lock is taken. */
  readonly session?: MutationSession | undefined;
}

/**
 * The roots a materialization may write inside: the project-local skill roots
 * that own the targets, plus the receipt directory, and nothing else.
 *
 * This is the exact inverse of `removalAllowedRoots`, derived the same way from
 * the same two constants. Passing the canonical root would make the
 * transaction's containment check vacuous; re-spelling either constant here
 * would let a write and its undo disagree about where packs live.
 *
 * A harness with no project-local root is a NAMED refusal rather than a bare
 * `Error`, because the value that reaches here came out of a repository-supplied
 * approved-plan artifact.
 */
export function packSyncAllowedRoots(
  canonicalRoot: string,
  targets: readonly { readonly harness: HarnessId; readonly path: string }[],
): string[] {
  const roots = new Set<string>();
  for (const target of targets) {
    roots.add(join(canonicalRoot, ...requireSkillRoot(target.harness, target.path).split("/")));
  }
  roots.add(join(canonicalRoot, ...PROJECT_RECEIPT_DIRECTORY.split("/")));
  return [...roots].sort(byCodePoint);
}

/** The project-local skill root for a harness, or a `plan-incomplete` refusal naming it. */
function requireSkillRoot(harness: HarnessId, path: string): string {
  const skillRoot = PROJECT_SKILL_ROOTS[harness];
  if (skillRoot === undefined) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${PROJECT_PLAN_ARTIFACT} names the harness ${harness}, which has no project-local skill root, so ` +
        `${path} is a target no materialization could be confined to and nothing was written. An approved plan may ` +
        `only name a harness that has a project-local skill root: ` +
        `${Object.keys(PROJECT_SKILL_ROOTS).sort(byCodePoint).join(", ")}.`,
    );
  }
  return skillRoot;
}

/**
 * The pack-level source hash a receipt records.
 *
 * A pack may declare several skills — `RESEARCH_SCIENTIFIC` declares four — so
 * there is no single locked hash to copy. This is a digest over the pack's
 * sorted `[skill, sourceSha256]` pairs, which is recomputable from
 * `catalog/stack.lock.json` alone and moves the instant any one of the pack's
 * pinned sources moves.
 */
function packSourceHash(targets: readonly ProjectPackSyncTarget[]): string {
  const pairs = targets
    .map((target): [string, string] => [target.skill, target.sourceSha256])
    .sort((left, right) => byCodePoint(left[0], right[0]));
  return sha256(JSON.stringify(pairs));
}

/**
 * The receipt document for one pack, and the exact bytes it serializes to.
 *
 * `JSON.stringify(value, null, 2)` plus a trailing newline is the same
 * serialization every other managed document in this repository uses, so a
 * re-run that computes the same document produces byte-identical content.
 */
function receiptDocument(options: {
  packId: string;
  version: string;
  createdAt: string;
  evidenceHash: string;
  targets: readonly ProjectPackSyncTarget[];
  sidecars: readonly PackSidecar[];
}): PackReceiptDocument {
  // Sidecars are RECORDED receipt rows rather than paths derived at removal
  // time. That is what puts them inside the drift guard `planPackRemoval`
  // already computes over each target's CURRENT hash: a sidecar a user edited
  // moves the removal digest, so the approval refuses instead of deleting the
  // edit. A derived path would be invisible to that guard.
  const rows: PackReceiptTarget[] = [
    ...options.targets.map((target): PackReceiptTarget => ({
      harness: target.harness,
      path: target.path,
      targetHash: target.targetHash,
      kind: "skill",
    })),
    ...options.sidecars.map((sidecar): PackReceiptTarget => ({
      harness: sidecar.harness,
      path: sidecar.path,
      targetHash: sidecar.targetHash,
      kind: "sidecar",
    })),
  ];
  return {
    schemaVersion: 1,
    packId: options.packId,
    producer: { name: PLAN_OWNER, version: options.version },
    createdAt: options.createdAt,
    // The pack-level source hash is over the SKILL bytes the lock pins. A
    // sidecar is alpha-AOS's own byte and derives from no pinned source, so
    // folding it in here would make a locked-source digest say something about
    // a file the lock knows nothing about.
    sourceHash: packSourceHash(options.targets),
    evidenceHash: options.evidenceHash,
    targets: rows.sort((left, right) => byCodePoint(left.path, right.path)),
  };
}

function receiptBytes(document: PackReceiptDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

/**
 * Everything a receipt ASSERTS, with `createdAt` removed.
 *
 * `createdAt` is the one field no input derives, so two runs of the same
 * approved artifact cannot agree on it. Comparing it would make every re-run
 * rewrite a receipt whose every claim is unchanged, which is the opposite of
 * the D-06 idempotency this comparison exists to establish. Everything the
 * receipt actually claims — pack, producer, source hash, evidence hash and
 * every target with its hash and kind — IS compared.
 */
function receiptClaimShape(document: PackReceiptDocument): string {
  const { createdAt: _createdAt, ...claims } = document;
  return JSON.stringify(claims);
}

/** The receipt already on disk, when it parses. Never partly trusted. */
async function readExistingReceipt(destination: string): Promise<PackReceiptDocument | null> {
  if (!existsSync(destination)) return null;
  try {
    return JSON.parse(await readFile(destination, "utf8")) as PackReceiptDocument;
  } catch {
    return null;
  }
}

function requireEcc(lock: StackLock): NonNullable<StackLock["components"]["ecc"]> {
  const ecc = lock.components.ecc;
  if (ecc === undefined) {
    throw new ComponentPlanError(
      "plan-incomplete",
      "the stable lock has no ECC component, so no pack skill has a pinned source and nothing may be written",
    );
  }
  return ecc;
}

/** The read-only half of an apply's options, with the apply-only fields dropped. */
function planOptionsOf(options: ApplyProjectPackSyncOptions): ProjectPackSyncOptions {
  const { plan: _plan, session: _session, ...rest } = options;
  return rest;
}

/** The command a refusal hands the user, built from the digest the approve will recompute. */
function reapprovalCommand(options: ProjectPackSyncOptions, planDigest: string): string {
  return approvalCommand({
    path: options.path,
    subProject: options.subProject ?? null,
    planDigest,
  });
}

/**
 * Reads the reviewed artifact and binds every byte it authorises.
 *
 * Reads only. Nothing is acquired, created or written here, so the plan a
 * reviewer sees and the plan an apply recomputes are produced by the same code
 * path against the same inputs.
 */
export async function planProjectPackSync(options: ProjectPackSyncOptions): Promise<ProjectPackSyncPlan> {
  const revalidated = await revalidateProjectPlan(options);
  const stateRoot = revalidated.stateRoot;
  const canonicalRoot = revalidated.plan.scope.canonicalRoot;
  const command = reapprovalCommand(options, revalidated.plan.planDigest);

  const read = await readApprovedProjectPlan(revalidated.artifactPath, options.packageRoot);
  if (read.state === "absent") {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${PROJECT_PLAN_ARTIFACT} does not exist at ${canonicalRoot}, so there is no approved plan to materialize and ` +
        `nothing was written. Review the current plan and approve it with: ${command}`,
    );
  }
  if (read.state === "unreadable") {
    const codes = read.issues.map((issue) => `${issue.code}@${issue.documentPath}`).join(", ");
    throw new ComponentPlanError(
      "plan-incomplete",
      `${PROJECT_PLAN_ARTIFACT} exists but is not a valid approved-plan artifact, so what it claims is refused rather ` +
        `than partly trusted: ${codes || "no issue reported"}. Re-approve in place with: ${command}`,
    );
  }

  const approved = read.artifact;
  if (approved.approvedDigest !== revalidated.plan.planDigest && !isOwnMaterialization(approved, revalidated.plan)) {
    throw driftRefusal(approved, revalidated.plan, command);
  }

  const lock = await loadLock(options.packageRoot);
  const ecc = requireEcc(lock);

  // The renderer is stated by the plan rather than re-derived: PLAN_RENDERER_ID
  // is the identity render for every pack skill, so the target hash EQUALS the
  // source hash. Asserting that is honest; recomputing a render here would be a
  // second renderer that could disagree with the one the plan recorded.
  if (approved.plan.renderer.id !== PLAN_RENDERER_ID || approved.plan.renderer.identity !== true) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `the approved plan records the renderer ${approved.plan.renderer.id} (identity=${String(approved.plan.renderer.identity)}), ` +
        `but this materialization only writes bytes that pass through ${PLAN_RENDERER_ID}, where the target hash equals ` +
        "the source hash. Nothing was written.",
    );
  }

  const applicable = new Set(approved.plan.applicable);
  const planned = approved.plan.targetPreState
    .filter((entry: TargetPreState) => entry.action === "create" || entry.action === "update")
    .filter((entry: TargetPreState) => applicable.has(entry.packId));

  // A harness with no project-local skill root refuses HERE, before a source
  // root is chosen and long before a file is opened for writing (T-03-04).
  for (const entry of planned) requireSkillRoot(entry.harness, entry.path);

  const skills = [...new Set(planned.map((entry) => entry.skill))].sort(byCodePoint);
  const supplied = options.verifiedSourceRoot === undefined ? null : resolve(options.verifiedSourceRoot);

  // Pack skills pass through the identity render, so the fixture's harness
  // decides nothing but the temp layout. It is taken from the sorted target
  // harnesses so the choice is deterministic and reviewable rather than a
  // constant chosen here.
  const fixtureHarness: HarnessId = [...new Set(planned.map((entry) => entry.harness))].sort(byCodePoint)[0] ?? "claude";
  const fixture =
    supplied === null && skills.length > 0
      ? await createEccFixtureOperationPlan({
          harness: fixtureHarness,
          ecc,
          skills,
          ...(options.fixtureRoot === undefined ? {} : { fixtureRoot: options.fixtureRoot }),
        })
      : null;
  const sourceRoot = supplied ?? (fixture === null ? resolve(canonicalRoot) : fixture.targetRoot);

  const targets: ProjectPackSyncTarget[] = [];
  for (const entry of planned) {
    const source = resolvePackSource(lock, entry.packId, entry.skill);
    const sourceFile = skillFile(sourceRoot, entry.skill);
    if (!inside(sourceRoot, sourceFile)) {
      throw new ComponentPlanError("unplanned-path", `unsafe pack skill id: ${entry.skill}`);
    }
    if (entry.expectedHash !== source.sourceSha256) {
      throw new ComponentPlanError(
        "plan-drift",
        `${entry.path} was approved expecting ${entry.expectedHash.slice(0, 12)}, but the lock now pins ` +
          `${source.sourceSha256.slice(0, 12)} for ${entry.packId}/${entry.skill}. Nothing was written.`,
      );
    }
    targets.push({
      packId: entry.packId,
      skill: entry.skill,
      harness: entry.harness,
      path: entry.path,
      destination: join(canonicalRoot, ...entry.path.split("/")),
      source: sourceFile,
      sourceSha256: source.sourceSha256,
      readHash: supplied !== null && existsSync(sourceFile) ? sha256(await readFile(sourceFile)) : null,
      // Identity render: the target hash IS the source hash.
      targetHash: source.sourceSha256,
      currentHash: entry.currentHash,
      action: entry.action === "update" ? "update" : "create",
    });
  }
  targets.sort((left, right) => byCodePoint(left.path, right.path));

  const packs = [...new Set(targets.map((target) => target.packId))].sort(byCodePoint);
  const createdAt = new Date().toISOString();

  // The sidecars are planned BEFORE the receipts, because a receipt claims each
  // sidecar's byte hash. The dependency runs one way only: a sidecar names the
  // receipt's PATH, which is a constant, so there is no cycle.
  const sidecars: ProjectPackSyncSidecar[] = [];
  for (const target of targets) {
    const draft = planPackSidecar(target.packId, target.harness, posixDirectory(target.path), {
      skill: target.skill,
      path: receiptPathFor(target.packId),
      sourcePackage: ecc.package,
      sourceVersion: ecc.version,
      sourceSha256: target.sourceSha256,
      createdAt,
    });
    if (draft === null) continue;
    const destination = join(canonicalRoot, ...draft.path.split("/"));
    // A sidecar whose every claim is unchanged keeps the timestamp it was
    // written with, so its bytes — and therefore the receipt row claiming them —
    // are stable across re-runs. Without this the D-06 already-current edge
    // would be unreachable forever: each run would mint a new timestamp, move
    // the hash, move the receipt, and rewrite everything.
    const existing = await readExistingSidecar(destination);
    const document =
      existing !== null && sidecarClaimShape(existing) === sidecarClaimShape(draft.document)
        ? { ...draft.document, createdAt: existing.createdAt }
        : draft.document;
    const content = sidecarBytes(document);
    sidecars.push({
      ...draft,
      document,
      content,
      targetHash: sha256(content),
      destination,
      currentHash: existsSync(destination) ? sha256(await readFile(destination, "utf8")) : null,
    });
  }
  sidecars.sort((left, right) => byCodePoint(left.path, right.path));

  const sidecarSurfaces: PackSidecarDecision[] = [...new Set(targets.map((target) => target.harness))]
    .sort(byCodePoint)
    .map((harness): PackSidecarDecision => {
      const decision = SIDECAR_SURFACES.get(harness);
      return {
        harness,
        enabled: decision?.enabled ?? false,
        reason:
          decision?.reason ??
          `${harness} has no recorded sidecar tolerance decision at all, so nothing is written beside its skills and ` +
            `${PROJECT_RECEIPT_DIRECTORY} is the whole provenance record for it`,
      };
    });

  const receipts: ProjectPackSyncReceipt[] = [];
  for (const packId of packs) {
    const document = receiptDocument({
      packId,
      version: ecc.version,
      createdAt,
      evidenceHash: approved.plan.evidenceDigest,
      targets: targets.filter((target) => target.packId === packId),
      sidecars: sidecars.filter((sidecar) => sidecar.packId === packId),
    });
    const path = receiptPathFor(packId);
    receipts.push({
      packId,
      path,
      destination: join(canonicalRoot, ...path.split("/")),
      document,
      content: receiptBytes(document),
    });
  }

  // The shape guard runs HERE: after the source root is resolved, and before
  // the digest, the boundary proof and every write. It reads the same verified
  // source root the writer will read from, so the shape asserted is the shape
  // that would be materialized rather than some other copy of it.
  const sourceFindings: PackSourceFinding[] = [];
  for (const skill of skills) {
    const packId = targets.find((target) => target.skill === skill)?.packId ?? "";
    const finding = await assertPackSourceShape(packId, skill, join(sourceRoot, skill));
    if (finding !== null) sourceFindings.push(finding);
  }
  sourceFindings.sort((left, right) => byCodePoint(left.packId, right.packId) || byCodePoint(left.skill, right.skill));

  const allowedRoots = packSyncAllowedRoots(canonicalRoot, targets);
  const packageRootPath = supplied ?? fixture?.extractionRoot ?? resolve(canonicalRoot);
  const proofRoots = [...allowedRoots, stateRoot, packageRootPath, sourceRoot];
  if (fixture !== null) proofRoots.push(fixture.fixtureRoot);

  const inputs: OperationPathInput[] = [
    ...targets.map((target): OperationPathInput => ({ role: "target", path: target.destination })),
    ...sidecars.map((sidecar): OperationPathInput => ({ role: "target", path: sidecar.destination })),
    ...receipts.map((receipt): OperationPathInput => ({ role: "target", path: receipt.destination })),
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
    { role: "package-root", path: packageRootPath },
    { role: "source", path: sourceRoot },
    ...targets.map((target): OperationPathInput => ({ role: "source", path: target.source })),
  ];
  if (fixture !== null) inputs.push({ role: "temp", path: fixture.fixtureRoot });

  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: proofRoots,
    requiredRoles: requiredRolesForFileMutation(),
  });

  // Everything a reviewer would look at, folded into ONE value: which bytes,
  // from where, to where, under which roots, behind which boundary verdict.
  const digest = reviewedDigest(PACK_SYNC_DIGEST_KIND, {
    canonicalRoot,
    stateRoot,
    approvedDigest: approved.approvedDigest,
    evidenceDigest: approved.plan.evidenceDigest,
    renderer: approved.plan.renderer.id,
    package: { name: ecc.package, version: ecc.version, integrity: ecc.integrity },
    sourceRoot,
    // Folded in on purpose: `sourceRoot` and `readHash` cover the SKILL.md
    // bytes but say nothing about what sits beside them, so without this a
    // companion file appearing between review and apply would move nothing a
    // reviewer had agreed to.
    sourceFindings: sourceFindings.map((finding) => [finding.code, finding.packId, finding.skill, ...finding.extraEntries]),
    fixture: fixture?.digest ?? null,
    allowedRoots,
    targets: targets.map((target) => [
      target.packId,
      target.skill,
      target.harness,
      target.path,
      target.source,
      target.sourceSha256,
      target.readHash,
      target.targetHash,
      target.currentHash,
      target.action,
    ]),
    receipts: receipts.map((receipt) => [receipt.path, receiptClaimShape(receipt.document)]),
    // The sidecar bytes and the per-surface DECISION are both reviewed. Without
    // the decision, flipping a surface from receipts-only to sidecar-writing on
    // a pack that happens to have no target there would move nothing a reviewer
    // agreed to.
    sidecars: sidecars.map((sidecar) => [sidecar.path, sidecarClaimShape(sidecar.document), sidecar.currentHash]),
    sidecarSurfaces: sidecarSurfaces.map((entry) => [entry.harness, String(entry.enabled), entry.reason]),
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: PACK_SYNC_DIGEST_KIND,
    canonicalRoot,
    stateRoot,
    artifactPath: revalidated.artifactPath,
    plan: revalidated.plan,
    approved,
    targets,
    receipts,
    sidecars,
    sidecarSurfaces,
    packs,
    allowedRoots,
    sourceRoot,
    sourceFindings,
    fixture,
    proofs,
    digest,
    alreadyCurrent: await isAlreadyCurrent(targets, receipts, sidecars),
  };
}

/**
 * True when every skill target already holds exactly the reviewed bytes AND
 * every receipt already claims exactly what this sync would claim.
 *
 * All three halves matter. Skill bytes alone would report already-current for a
 * pack whose receipt was deleted, leaving provenance the reader cannot see;
 * receipts alone would report already-current for a pack whose bytes were
 * replaced; and a deleted sidecar would leave the receipt claiming a target
 * that is not there.
 */
async function isAlreadyCurrent(
  targets: readonly ProjectPackSyncTarget[],
  receipts: readonly ProjectPackSyncReceipt[],
  sidecars: readonly ProjectPackSyncSidecar[],
): Promise<boolean> {
  for (const target of targets) {
    if (!existsSync(target.destination)) return false;
    if (sha256(await readFile(target.destination)) !== target.targetHash) return false;
  }
  for (const sidecar of sidecars) {
    if (sidecar.currentHash !== sidecar.targetHash) return false;
  }
  for (const receipt of receipts) {
    const existing = await readExistingReceipt(receipt.destination);
    if (existing === null) return false;
    if (receiptClaimShape(existing) !== receiptClaimShape(receipt.document)) return false;
  }
  return true;
}

/**
 * True when the ONLY thing that moved since approval is this very artifact's
 * own materialization landing on disk.
 *
 * A `sync --apply` writes the files the plan describes, which changes those
 * files' pre-state and therefore the plan digest. Refusing on that would make a
 * materialization a strictly one-shot act and would make the D-06 idempotency
 * edge — run it twice, get already-current — unreachable.
 *
 * The tolerance is deliberately narrow. It applies only when `classifyPlanDrift`
 * says `target-changed` (so the selection, the lock and the adapter
 * classification are all unmoved), and only when EVERY moved path is one this
 * artifact authorises, now holds exactly the bytes the artifact expected, and is
 * claimed by a receipt. Bytes some other writer put at a planned target satisfy
 * none of those and still refuse.
 */
function isOwnMaterialization(approved: ApprovedProjectPlanArtifact, fresh: ProjectCapabilityPlan): boolean {
  const reviewed = approved.plan as ProjectCapabilityPlan | undefined;
  if (reviewed === undefined || !Array.isArray(reviewed.targetPreState)) return false;
  if (classifyPlanDrift(reviewed, fresh).kind !== "target-changed") return false;

  const applicable = new Set(reviewed.applicable);
  const authorised = new Map(
    reviewed.targetPreState
      .filter((entry) => applicable.has(entry.packId))
      .map((entry): [string, TargetPreState] => [entry.path, entry]),
  );

  const moved = fresh.targetPreState.filter((entry) => {
    const before = reviewed.targetPreState.find((candidate) => candidate.path === entry.path);
    return before === undefined || before.currentHash !== entry.currentHash || before.exists !== entry.exists;
  });
  if (moved.length === 0) return false;

  return moved.every((entry) => {
    const before = authorised.get(entry.path);
    return (
      before !== undefined &&
      entry.exists &&
      entry.ownedByReceipt &&
      entry.currentHash !== null &&
      entry.currentHash === before.expectedHash
    );
  });
}

/**
 * Turns an approved digest that no longer matches into a refusal that is a next
 * step, naming what moved.
 *
 * The classification is delegated to `classifyPlanDrift` verbatim — this module
 * adds no second drift vocabulary. When the reviewed plan VALUE is unavailable
 * the refusal says so and prints both digests, rather than guessing.
 */
function driftRefusal(
  approved: ApprovedProjectPlanArtifact,
  revalidated: ProjectCapabilityPlan,
  command: string,
): ComponentPlanError {
  const digests = `reviewed ${approved.approvedDigest.slice(0, 12)}, observed ${revalidated.planDigest.slice(0, 12)}`;
  const reviewed = approved.plan as ProjectCapabilityPlan | undefined;
  if (reviewed === undefined || !Array.isArray(reviewed.selected)) {
    return new ComponentPlanError(
      "plan-drift",
      `${PROJECT_PLAN_ARTIFACT} was approved for a different plan (${digests}). The reviewed plan value is not ` +
        `available here, so what moved cannot be named; review the current plan again first. ` +
        `Re-approve in place with: ${command}`,
    );
  }
  const drift = classifyPlanDrift(reviewed, revalidated);
  return new ComponentPlanError(
    "plan-drift",
    `${drift.kind}: ${drift.detail} (${digests}). Nothing was written. Re-approve in place with: ${command}`,
  );
}

/**
 * Where the pack skill bytes come from, and what must be released afterwards.
 * A supplied tree belongs to the caller and is never removed.
 */
interface RenderedPackSource {
  readonly root: string;
  readonly cleanup: string | null;
}

/**
 * Produces the rendered pack skill tree the plan named.
 *
 * With a supplied tree there is nothing to acquire. Otherwise the plan carries
 * the fixture plan, so the fixture writes to the exact location review
 * authorized rather than one it picks, and every acquired byte is checked
 * against the lock's pinned `sourceSha256` before it can become a write.
 */
async function renderPackSkills(
  plan: ProjectPackSyncPlan,
  lock: StackLock,
  session: MutationSession,
): Promise<RenderedPackSource> {
  if (plan.fixture === null) return { root: plan.sourceRoot, cleanup: null };
  const ecc = requireEcc(lock);
  const fixture = await runEccFixture({
    harness: plan.fixture.harness,
    ecc,
    keep: true,
    plan: plan.fixture,
    skills: plan.fixture.skills,
    session,
  });
  if (resolve(fixture.targetRoot) !== plan.sourceRoot) {
    throw new ComponentPlanError("unplanned-path", `the ECC fixture wrote outside the reviewed location: ${fixture.targetRoot}`);
  }
  for (const target of plan.targets) {
    if (fixture.sourceHashes[target.skill] !== target.sourceSha256) {
      throw new ComponentPlanError(
        "source-drift",
        `the acquired source for ${target.packId}/${target.skill} does not match the hash catalog/stack.lock.json pins`,
      );
    }
  }
  return { root: plan.sourceRoot, cleanup: plan.fixture.fixtureRoot };
}

/**
 * Materializes exactly the approved artifact, under ONE transaction.
 *
 * The skill writes and the receipt writes are one `operations` array handed to
 * one `applyFileTransaction` call, so a failure anywhere rolls everything back
 * and leaves ZERO receipts (CONTEXT.md D-06, threat T-03-03). A receipt written
 * by a second transaction would survive a rolled-back skill write and claim
 * bytes that are not there.
 */
export async function applyProjectPackSync(options: ApplyProjectPackSyncOptions): Promise<ProjectPackSyncResult> {
  const supplied = options.plan;

  // Complete read-only revalidation before anything is acquired or written. A
  // caller that reviewed a plan earlier gets its digest compared against this
  // re-read; a caller that supplied none is handed the re-read itself, so both
  // routes apply a plan that was produced from the world as it is NOW.
  const reviewed = await planProjectPackSync({
    ...planOptionsOf(options),
    ...(supplied?.fixture == null ? {} : { fixtureRoot: supplied.fixture.fixtureRoot }),
  });
  if (supplied !== undefined) assertPlanUnchanged(supplied, reviewed);

  const currentPaths = [
    ...reviewed.targets.map((target) => target.path),
    ...reviewed.sidecars.map((sidecar) => sidecar.path),
    ...reviewed.receipts.map((receipt) => receipt.path),
  ].sort(byCodePoint);

  if (reviewed.alreadyCurrent) {
    return {
      status: "already-current",
      operationId: null,
      written: [],
      receipts: [],
      sidecars: [],
      sidecarSurfaces: reviewed.sidecarSurfaces,
      current: currentPaths,
      packs: reviewed.packs,
      findings: reviewed.sourceFindings,
      digest: reviewed.digest,
    };
  }

  if (reviewed.targets.length === 0) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${PROJECT_PLAN_ARTIFACT} names no applicable pack target to materialize, so there is nothing to write`,
    );
  }

  const lock = await loadLock(options.packageRoot);

  return withComponentSession(reviewed, options.session, async (session): Promise<ProjectPackSyncResult> => {
    const rendered = await renderPackSkills(reviewed, lock, session);
    try {
      const operations: FileWriteOperation[] = [];
      for (const target of reviewed.targets) {
        const source = skillFile(rendered.root, target.skill);
        if (!inside(rendered.root, source)) {
          throw new ComponentPlanError("unplanned-path", `a pack skill source escaped its verified root: ${source}`);
        }
        await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "source", source));
        if (!existsSync(source)) {
          throw new ComponentPlanError("source-drift", `the pack skill source is missing: ${target.packId}/${target.skill}`);
        }
        const content = await readFile(source);
        if (sha256(content) !== target.sourceSha256) {
          throw new ComponentPlanError(
            "source-drift",
            `${target.packId}/${target.skill} no longer hashes to the ${target.sourceSha256.slice(0, 12)} ` +
              "catalog/stack.lock.json pins, so the bytes that were reviewed are not the bytes on offer",
          );
        }
        const currentHash = existsSync(target.destination) ? sha256(await readFile(target.destination)) : null;
        if (currentHash !== target.currentHash && currentHash !== target.targetHash) {
          throw new ComponentPlanError(
            "plan-drift",
            `the bytes at ${target.path} changed since the plan was approved, so nothing was written`,
          );
        }
        await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "target", target.destination));
        operations.push({ target: target.destination, content });
      }

      // The sidecars join the SAME operations array as the skill bytes, and the
      // receipts join it after them. This is D-06 and it is the whole of why
      // T-03-102 needs no new rollback code: a throw anywhere in here rolls the
      // sidecars back with everything else, so a rolled-back apply cannot leave
      // an unowned provenance file behind.
      for (const sidecar of reviewed.sidecars) {
        const currentHash = existsSync(sidecar.destination) ? sha256(await readFile(sidecar.destination, "utf8")) : null;
        if (currentHash !== sidecar.currentHash && currentHash !== sidecar.targetHash) {
          throw new ComponentPlanError(
            "plan-drift",
            `the bytes at ${sidecar.path} changed since the plan was reviewed, so nothing was written`,
          );
        }
        await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "target", sidecar.destination));
        operations.push({ target: sidecar.destination, content: sidecar.content });
      }

      for (const receipt of reviewed.receipts) {
        await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "target", receipt.destination));
        operations.push({ target: receipt.destination, content: receipt.content });
      }

      const journal = await applyFileTransaction({
        stateRoot: reviewed.stateRoot,
        allowedRoots: [...reviewed.allowedRoots],
        operations,
        session,
      });

      return {
        status: "written",
        operationId: journal.id,
        written: reviewed.targets.map((target) => target.path).sort(byCodePoint),
        receipts: reviewed.receipts.map((receipt) => receipt.path).sort(byCodePoint),
        sidecars: reviewed.sidecars.map((sidecar) => sidecar.path).sort(byCodePoint),
        sidecarSurfaces: reviewed.sidecarSurfaces,
        current: [],
        packs: reviewed.packs,
        findings: reviewed.sourceFindings,
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
