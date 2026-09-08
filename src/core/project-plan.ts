// The pack predicate evaluator.
//
// A pack's evaluation is a full tree of leaf results, NOT a boolean. Every
// leaf of every pack is computed on every run, because `Array.prototype.some`
// short-circuits and short-circuiting destroys exactly the information DETC-03
// needs: the moment an `any` finds its first true leaf, the reasons the other
// leaves failed are gone, and "why did this pack not attach?" becomes
// unanswerable.
//
// Three rules hold across everything below:
//   1. No operator short-circuits. `satisfied` and `failed` are both populated
//      whatever the pack's truth value turns out to be.
//   2. Every phrase renders from the declared vocabulary in `catalog/facts.yaml`
//      or from the synthesized-literal vocabulary here — never from a per-pack
//      hand-written string, so all 15 packs explain uniformly.
//   3. A `broad` fact may never be a pack's ONLY satisfied leaf. That is the
//      mechanical form of "a generic file alone never activates an
//      agent-runtime pack", stated once and applied to every pack rather than
//      special-cased for one.

import { createHash } from "node:crypto";
import { existsSync, type Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  AdapterSupportEntry,
  DeferredFact,
  EvidenceEnvelope,
  EvidenceFact,
  EvidenceNode,
  FactDeclaration,
  HarnessId,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  PackOverride,
  PackSource,
  PackStatus,
  PlanApproval,
  ProjectCapabilityPlan,
  ProjectStackManifest,
  SafeInverse,
  StackLock,
  SubProjectDecision,
  SurfaceSupport,
  TargetPreState,
} from "../types.js";
import { loadCatalog, loadLock } from "./catalog.js";
import {
  assertPlanUnchanged,
  ComponentPlanError,
  reviewedDigest,
  withComponentSession,
  type ReviewedComponentPlan,
  type ReviewedPlanBoundary,
} from "./component-session.js";
import type { DeclaredDependencies, RootPin, ScanBound, SubProject, UndecidableEvidence } from "./evidence.js";
import {
  collectProjectEvidenceDetail,
  digestableEvidence,
  discoverSubProjects,
  isOptedIn,
  lookupDependency,
  normalizeRelativePosix,
  parseUndecidableReason,
  PROJECT_MANIFEST_PATH,
  resolveCanonicalRoot,
} from "./evidence.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "./pack-catalog.js";
import { proveOperationPaths, requiredRolesForFileMutation } from "./path-boundary.js";
import { inspectProjectManifest } from "./project.js";
import { applyFileTransaction } from "./transaction.js";
import { validateManagedDocument } from "./validation.js";
import type { MutationSession } from "./writer-lock.js";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Code point order, never `localeCompare`: no locale may reorder an emitted array. */
function byCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function byFactId(left: LeafResult, right: LeafResult): number {
  return byCodePoint(left.factId, right.factId);
}

/**
 * One record per (bound, limit, path).
 *
 * `discoverSubProjects` seeds its own `bounds` from the scan's, so a plain
 * concatenation would report every scan bound twice. Deduping rather than
 * reading only one source is deliberate: discovery can reach a bound the scan
 * never did (`MAX_SUB_PROJECTS`), so both sources are needed and only the
 * overlap is redundant.
 */
function dedupeBounds(bounds: readonly ScanBound[]): ScanBound[] {
  const seen = new Set<string>();
  const unique: ScanBound[] = [];
  for (const bound of bounds) {
    const key = `${bound.bound}|${bound.limit}|${bound.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(bound);
  }
  return unique;
}

/**
 * At most this many near-miss lines print by default, with a trailing line
 * naming how many were suppressed.
 *
 * The bound mirrors `finalizeIssues` in `validation.ts`: deterministic order
 * plus a hard cap, so a hostile or pathological catalog cannot flood output.
 */
export const MAX_NEAR_MISS_LINES = 5;

/**
 * At most this many target pre-state rows print, with a trailing line naming
 * how many were suppressed. Same discipline as `MAX_NEAR_MISS_LINES`: a
 * catalog naming many skills must not be able to flood the rendering.
 */
export const MAX_TARGET_ROWS = 20;

/**
 * At most this many scan-completeness disclosure lines print per list, with a
 * trailing line naming how many were suppressed.
 *
 * Same discipline as `MAX_NEAR_MISS_LINES` and `MAX_TARGET_ROWS`, and needed
 * for the same reason in reverse: a repository that refused thousands of paths
 * must disclose that it refused them WITHOUT the disclosure itself becoming
 * the flood that hides everything else (T-02-54).
 */
export const MAX_DISCLOSURE_LINES = 20;

// ---------------------------------------------------------------------------
// Rendering — one vocabulary, never a per-pack string
// ---------------------------------------------------------------------------

/** The first sentence of a declared description, whitespace collapsed. */
function firstSentence(text: string): string {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  const stop = collapsed.search(/\.(?:\s|$)/u);
  return stop === -1 ? collapsed : collapsed.slice(0, stop);
}

/**
 * The phrase a declared fact explains itself with. It comes from the
 * vocabulary's own `description`, so correcting how a pack explains itself is
 * a YAML edit rather than a TypeScript one.
 */
function declaredPhrase(factId: string, declaration: FactDeclaration | undefined): string {
  const description = declaration?.description;
  if (description === undefined || description.length === 0) return factId;
  return firstSentence(description);
}

/** Names the fact and the file that carried it, never a bare fact id. */
export function describeLeaf(leaf: LeafResult): string {
  return leaf.path === null ? leaf.phrase : `${leaf.phrase} (${leaf.path})`;
}

/**
 * The near-miss line, in the shape the CONTEXT asked for: the pack id, what
 * was found, and what was missing. Both phrases come from the vocabulary, so
 * the line reads the same way for every one of the 15 packs.
 */
export function describeNearMiss(evaluation: PackEvaluation): string {
  const found = evaluation.satisfied[0];
  const missing = evaluation.failed[0];
  if (found === undefined || missing === undefined) return `${evaluation.packId}: no declared evidence matched`;
  return `${evaluation.packId}: ${describeLeaf(found)} — missing: ${missing.phrase}`;
}

function describeDeferral(evaluation: PackEvaluation): string {
  if (evaluation.undeclared.length > 0) {
    return `${evaluation.packId}: ${evaluation.undeclared.join(", ")} is not declared by catalog/facts.yaml, so this pack cannot be evaluated`;
  }
  const requirements = [...new Set(evaluation.deferred.map((entry) => entry.deferredTo))].sort(byCodePoint);
  const facts = evaluation.deferred.map((entry) => entry.factId).join(", ");
  return `${evaluation.packId}: no detector runs for ${facts} — deferred to ${requirements.join(", ")}`;
}

function explain(evaluation: PackEvaluation): string {
  switch (evaluation.status) {
    case "selected":
      return `${evaluation.packId}: ${evaluation.satisfied.map(describeLeaf).join(", ")}`;
    case "forced-on":
    case "forced-off":
      return `${evaluation.packId}: ${evaluation.overrideReason ?? "forced by the project manifest"}`;
    case "unimplemented":
      return describeDeferral(evaluation);
    case "near-miss":
      return describeNearMiss(evaluation);
    case "silent":
      return `${evaluation.packId}: no declared evidence matched`;
  }
}

// ---------------------------------------------------------------------------
// The environment one pack is evaluated against
// ---------------------------------------------------------------------------

/**
 * Everything one pack's predicate is evaluated against, as a value.
 *
 * Passing an environment rather than a repository is what lets a nested node,
 * a deferred fact and a broad-only match be asserted without inventing a
 * repository shape for each.
 */
export interface PackEvaluationEnvironment {
  /** Declared facts, keyed by id. Leaf phrases render from this and nothing else. */
  readonly vocabulary: ReadonlyMap<string, FactDeclaration>;
  /** One evidence record per declared fact, positive and negative. */
  readonly facts: ReadonlyMap<string, EvidenceFact>;
  /** Scannable relative POSIX paths, for `anyFiles`. */
  readonly paths: ReadonlySet<string>;
  readonly dependencies: DeclaredDependencies;
  /** Only a CURRENT, VALID manifest reaches here. */
  readonly manifest: ProjectStackManifest | null;
  /** Why the manifest contributes nothing, when it does not. */
  readonly manifestReason: string;
  readonly overrides: ReadonlyMap<string, PackOverride>;
}

/** One leaf naming a declared fact, answered from the evidence envelope. */
function leafForFact(factId: string, environment: PackEvaluationEnvironment): LeafResult {
  const declaration = environment.vocabulary.get(factId);
  const phrase = declaredPhrase(factId, declaration);
  const broad = declaration?.broad === true;
  const fact = environment.facts.get(factId);

  // Unreachable through `loadPackCatalogStrict`, which refuses an undeclared
  // fact at load. Fail-closed for a predicate that arrived any other way.
  if (fact === undefined) {
    return {
      factId,
      detected: false,
      path: null,
      reason: `${factId} is not declared by catalog/facts.yaml, so no evidence answers for it`,
      broad,
      phrase,
    };
  }

  return {
    factId,
    detected: fact.detected,
    path: fact.path ?? null,
    // Every negative record already carries a reason; the fallback exists so a
    // failed leaf can never be silent, which is the defect DETC-03 prevents.
    reason: fact.detected ? null : (fact.reason ?? "not detected, and the detector gave no further reason"),
    broad,
    phrase,
  };
}

/**
 * One `anyFiles` literal. The explaining fact id is synthesized from operator
 * plus matched literal, extending the `manifest:<key>` convention already in
 * the codebase rather than introducing a second one.
 */
function leafForFile(literal: string, environment: PackEvaluationEnvironment): LeafResult {
  const normalized = normalizeRelativePosix(literal);
  const present = normalized !== null && environment.paths.has(normalized);
  return {
    factId: `file:${literal}`,
    detected: present,
    path: present ? normalized : null,
    reason: present ? null : `${literal} does not exist inside the canonical root`,
    broad: false,
    phrase: `${literal} exists at the project root`,
  };
}

/**
 * One `anyDependencies` literal. Inline literals are deliberately NOT part of
 * the declared vocabulary, so they resolve against the dependency index rather
 * than against the evidence envelope.
 */
function leafForDependency(literal: string, environment: PackEvaluationEnvironment): LeafResult {
  const declared = lookupDependency(environment.dependencies, literal);
  return {
    factId: `dependency:${literal}`,
    detected: declared !== null,
    path: declared?.path ?? null,
    reason: declared === null ? `${literal} is not declared by a dependency manifest at the canonical root` : null,
    broad: false,
    phrase: `the ${literal} package is a declared dependency`,
  };
}

/** One `manifestOptIn` key, under the status-gating rule: only a current, valid manifest contributes. */
function leafForManifestOptIn(key: string, environment: PackEvaluationEnvironment): LeafResult {
  const factId = `manifest:${key}`;
  const phrase = `the project manifest opts in to ${key}`;
  if (environment.manifest === null) {
    return { factId, detected: false, path: null, reason: environment.manifestReason, broad: false, phrase };
  }
  const safe = Object.assign(Object.create(null) as Record<string, unknown>, environment.manifest);
  if (!isOptedIn(safe[key])) {
    return {
      factId,
      detected: false,
      path: PROJECT_MANIFEST_PATH,
      reason: `${PROJECT_MANIFEST_PATH} does not opt in to ${key}`,
      broad: false,
      phrase,
    };
  }
  return { factId, detected: true, path: PROJECT_MANIFEST_PATH, reason: null, broad: false, phrase };
}

/** The truth value of one node plus every leaf underneath it, flattened. */
export interface EvidenceNodeResult {
  readonly value: boolean;
  readonly leaves: readonly LeafResult[];
}

/**
 * Evaluates one predicate node and every leaf beneath it.
 *
 * The loops below deliberately never `break`. `all` accumulates with `&&` and
 * `any` with `||` AFTER the child has been evaluated, so the truth value is
 * the same one a short-circuiting evaluator would produce while the leaf data
 * a short-circuiting evaluator would have thrown away is kept.
 */
export function evaluateEvidenceNode(
  node: EvidenceNode,
  environment: PackEvaluationEnvironment,
): EvidenceNodeResult {
  const leaves: LeafResult[] = [];

  if (node.all !== undefined) {
    let value = true;
    for (const item of node.all) {
      if (typeof item === "string") {
        const leaf = leafForFact(item, environment);
        leaves.push(leaf);
        value = leaf.detected && value;
        continue;
      }
      const nested = evaluateEvidenceNode(item, environment);
      leaves.push(...nested.leaves);
      value = nested.value && value;
    }
    return { value, leaves };
  }

  if (node.any !== undefined) {
    let value = false;
    for (const item of node.any) {
      if (typeof item === "string") {
        const leaf = leafForFact(item, environment);
        leaves.push(leaf);
        value = leaf.detected || value;
        continue;
      }
      const nested = evaluateEvidenceNode(item, environment);
      leaves.push(...nested.leaves);
      value = nested.value || value;
    }
    return { value, leaves };
  }

  if (node.anyFiles !== undefined) {
    let value = false;
    for (const literal of node.anyFiles) {
      const leaf = leafForFile(literal, environment);
      leaves.push(leaf);
      value = leaf.detected || value;
    }
    return { value, leaves };
  }

  if (node.anyDependencies !== undefined) {
    let value = false;
    for (const literal of node.anyDependencies) {
      const leaf = leafForDependency(literal, environment);
      leaves.push(leaf);
      value = leaf.detected || value;
    }
    return { value, leaves };
  }

  if (node.manifestOptIn !== undefined) {
    const leaf = leafForManifestOptIn(node.manifestOptIn, environment);
    return { value: leaf.detected, leaves: [leaf] };
  }

  // A node carrying no operator matches nothing. The schema's
  // `minProperties: 1` closes the same door from the other side.
  return { value: false, leaves: [] };
}

/**
 * Which facts this pack names that are declared but deliberately unimplemented.
 *
 * This is NOT the same case as `domain.undeclared-fact`, which
 * `loadPackCatalogStrict` refuses at load: that is a fact nothing declares,
 * while this is a fact the vocabulary declares AND marks as owned by a later
 * requirement. Keeping the two distinct is what stops a permanently
 * unselectable pack from looking like an unqualified repository.
 */
function deferredFactsOf(
  leaves: readonly LeafResult[],
  environment: PackEvaluationEnvironment,
): DeferredFact[] {
  const found = new Map<string, string>();
  for (const leaf of leaves) {
    const deferredTo = environment.vocabulary.get(leaf.factId)?.deferredTo;
    if (deferredTo !== undefined) found.set(leaf.factId, deferredTo);
  }
  return [...found.entries()]
    .map(([factId, deferredTo]) => ({ factId, deferredTo }))
    .sort((left, right) => byCodePoint(left.factId, right.factId));
}

/**
 * Leaves naming a fact the vocabulary does not declare at all.
 *
 * A synthesized leaf id always carries an operator prefix and a colon, which
 * a declared fact id cannot (`^[a-z][a-z0-9-]*$` in the vocabulary schema), so
 * the two are distinguishable without a second flag on the leaf.
 */
function undeclaredFactsOf(
  leaves: readonly LeafResult[],
  environment: PackEvaluationEnvironment,
): string[] {
  const found = new Set<string>();
  for (const leaf of leaves) {
    if (leaf.factId.includes(":")) continue;
    if (!environment.vocabulary.has(leaf.factId)) found.add(leaf.factId);
  }
  return [...found].sort(byCodePoint);
}

export interface PackClassification {
  readonly value: boolean;
  readonly satisfied: readonly LeafResult[];
  readonly failed: readonly LeafResult[];
  readonly deferred: readonly DeferredFact[];
  readonly undeclared: readonly string[];
  readonly override: PackOverride | null;
}

/**
 * Turns one evaluated predicate into a status.
 *
 * The `broad` rule sits here rather than inside the operators on purpose: a
 * pack whose ONLY satisfied leaves are facts that also exist in repositories
 * of a different kind is not selected. It is the general form of "an
 * `AGENTS.md` alone does not activate an agent runtime" — a bare `src/`
 * satisfies `browser-entrypoint` just as readily, and is safe today only
 * because that pack's `all` also demands a framework dependency.
 */
export function classifyPack(classification: PackClassification): PackStatus {
  if (classification.override === "force-off") return "forced-off";
  if (classification.override === "force-on") return "forced-on";

  const broadOnly = classification.satisfied.length > 0 && classification.satisfied.every((leaf) => leaf.broad);
  // An undeclared fact outranks the truth value: a pack that cannot be
  // evaluated must never be reported as a repository that did not qualify.
  if (classification.undeclared.length > 0) return "unimplemented";
  if (classification.value && !broadOnly) return "selected";
  if (classification.deferred.length > 0) return "unimplemented";
  if (classification.satisfied.length > 0 && classification.failed.length > 0) return "near-miss";
  return "silent";
}

/** Evaluates one pack without short-circuiting, then classifies and explains it. */
export function evaluatePack(pack: PackDeclaration, environment: PackEvaluationEnvironment): PackEvaluation {
  const result = evaluateEvidenceNode(pack.evidence, environment);
  const satisfied = result.leaves.filter((leaf) => leaf.detected).sort(byFactId);
  const failed = result.leaves.filter((leaf) => !leaf.detected).sort(byFactId);
  const deferred = deferredFactsOf(result.leaves, environment);
  const undeclared = undeclaredFactsOf(result.leaves, environment);
  const override = environment.overrides.get(pack.id) ?? null;

  const status = classifyPack({ value: result.value, satisfied, failed, deferred, undeclared, override });
  // D-06: the override is recorded as EVIDENCE, in the same structure as every
  // other reason, so "why did this pack attach?" can answer "the user
  // specified it explicitly" rather than leaving an unexplained deviation.
  const overrideReason =
    override === null
      ? null
      : `${PROJECT_MANIFEST_PATH} explicitly forces this pack ${override === "force-on" ? "on" : "off"} through packOverrides`;

  const evaluation: PackEvaluation = {
    packId: pack.id,
    status,
    satisfied,
    failed,
    deferred,
    undeclared,
    explanation: "",
    overrideReason,
  };
  evaluation.explanation = explain(evaluation);
  return evaluation;
}

/**
 * Near-misses in the order they print: descending satisfied-leaf count, then
 * ascending pack id as a deterministic tiebreak, so the same envelope always
 * yields the same list whatever order the packs were evaluated in.
 */
export function rankNearMisses(evaluations: readonly PackEvaluation[]): PackEvaluation[] {
  return evaluations
    .filter((evaluation) => evaluation.status === "near-miss")
    .sort(
      (left, right) =>
        right.satisfied.length - left.satisfied.length || byCodePoint(left.packId, right.packId),
    );
}

// ---------------------------------------------------------------------------
// The whole decision
// ---------------------------------------------------------------------------

/**
 * Digest over the selection-relevant observations only — ids, detected flags,
 * versions and paths. It deliberately excludes `createdAt` and the aggregate
 * input hash, so "an unrelated file changed" and "what we observed changed"
 * stay two answerable questions rather than one.
 */
function evidenceDigestOf(envelope: EvidenceEnvelope): string {
  return sha256(JSON.stringify(digestableEvidence(envelope)));
}

function byPackId(left: PackEvaluation, right: PackEvaluation): number {
  return byCodePoint(left.packId, right.packId);
}

// ---------------------------------------------------------------------------
// DETC-04: one named field per noun
// ---------------------------------------------------------------------------

/**
 * Where a materialization receipt lives, relative to the canonical root.
 *
 * Phase 2 must READ receipts to decide whether a file at a target path is one
 * alpha-AOS wrote, while Phase 3 WRITES them. The location is therefore a
 * Phase 2 decision Phase 3 inherits, and carrying it inside the plan artifact
 * is what stops Phase 3 choosing differently.
 */
export const PROJECT_RECEIPT_DIRECTORY = ".alpha-aos/receipts";

/** The constant owner every plan declares. */
export const PLAN_OWNER = "alpha-aos";

/**
 * The render identity a pack skill passes through.
 *
 * `renderEccSkill` returns its source unchanged for every skill except
 * `documentation-lookup`+`antigravity` and `deep-research`, neither of which
 * is a pack skill. For all pack skills the render is therefore the identity
 * and the target hash equals the source hash — stated in the plan value rather
 * than left implied.
 */
export const PLAN_RENDERER_ID = "ecc-skill/identity";

/**
 * The project-local skill root each harness reads, as a relative POSIX path.
 *
 * These are exactly the three roots `discoverSkillPaths` in
 * `src/core/isolation.ts` already enumerates. A harness absent from this table
 * has no project-local root, so no target is planned for it at all.
 */
export const PROJECT_SKILL_ROOTS: Readonly<Partial<Record<HarnessId, string>>> = {
  claude: ".claude/skills",
  codex: ".agents/skills",
  pi: ".pi/skills",
};

/**
 * What is actually recorded about each harness's project-scope pack delivery.
 *
 * Every classification below is read off documented discovery or off
 * `catalog/stack.yaml`'s recorded strategy. No probe runs on the preview path
 * — probes are Phase 3's canaries — so nothing here is upgraded on the
 * strength of a plausible filename.
 */
const ADAPTER_SUPPORT_EVIDENCE = new Map<HarnessId, { support: SurfaceSupport; reason: string }>([
  [
    "claude",
    {
      support: "supported",
      reason: "project skills load from .claude/skills/<skill>/SKILL.md, which is the documented project-scope location and the shape the design docs already assume",
    },
  ],
  [
    "codex",
    {
      support: "unverified",
      reason: "a project-local .agents/skills root exists, but no documented project-scope discovery has been proven; an over-claimed supported is the failure that matters",
    },
  ],
  [
    "pi",
    {
      support: "unverified",
      reason: "catalog/stack.yaml records eccStrategy: bridge with no eccTarget, and project-scope discovery under .pi/skills is not documented",
    },
  ],
  [
    "antigravity",
    {
      support: "unsupported",
      reason: "no project-local skill root is enumerated for antigravity; project-scope pack delivery stays unsupported until a canary proves otherwise",
    },
  ],
  [
    "hermes",
    {
      support: "unsupported",
      reason: "catalog/stack.yaml records gsdStrategy: worker-only, which rules out project-scope pack delivery until a canary proves otherwise",
    },
  ],
]);

/**
 * One classification per DECLARED harness, from recorded evidence only.
 *
 * A harness this table does not know is `unverified`, never `supported`: the
 * fail-closed answer for an unclassified surface is the one that blocks a
 * mandatory gate rather than the one that quietly promises an opt-out.
 */
export function classifyAdapterSupport(declared: readonly HarnessId[]): AdapterSupportEntry[] {
  return [...declared].sort(byCodePoint).map((harness) => {
    const recorded = ADAPTER_SUPPORT_EVIDENCE.get(harness);
    if (recorded === undefined) {
      return {
        harness,
        support: "unverified" as SurfaceSupport,
        reason: `no recorded evidence classifies project-scope pack delivery for ${harness}`,
      };
    }
    return { harness, support: recorded.support, reason: recorded.reason };
  });
}

/**
 * The exact source version and hash for one pack skill.
 *
 * This is a SEPARATE read path from the global ECC skill sync. That list is
 * the set of skills installed into a user's global skill root; consulting it
 * for a pack skill is one step from installing all of them everywhere, which
 * is the precise opposite of what a project-scoped pack is for. A skill with
 * no hash in the lock is a refusal naming that skill — a pack is never planned
 * sourceless.
 */
export function resolvePackSource(lock: StackLock, packId: string, skill: string): PackSource {
  const ecc = lock.components.ecc;
  if (ecc === undefined) {
    throw new Error(`The stable lock has no ECC component, so the pack skill ${skill} (${packId}) cannot be sourced`);
  }
  const hashes = Object.assign(Object.create(null) as Record<string, unknown>, ecc.sourceSha256);
  const sourceSha256 = hashes[skill];
  if (typeof sourceSha256 !== "string" || sourceSha256.length === 0) {
    throw new Error(
      `The stable lock has no sourceSha256 for the pack skill ${skill} (named by ${packId}), so the pack would be planned sourceless`,
    );
  }
  return { packId, skill, package: ecc.package, version: ecc.version, integrity: ecc.integrity, sourceSha256 };
}

/** One target path a receipt says alpha-AOS wrote. */
export interface ReceiptClaim {
  readonly packId: string;
  readonly path: string;
  readonly targetHash: string;
}

export interface ReceiptClaims {
  /** Relative POSIX target path to the receipt entry claiming it. */
  readonly byPath: ReadonlyMap<string, ReceiptClaim>;
  /** Receipt files that exist but could not be read as a claim set. Sorted. */
  readonly unreadable: readonly string[];
}

/**
 * Reads every receipt under the receipt directory.
 *
 * A receipt that cannot be read is reported rather than skipped: an unreadable
 * receipt means ownership is UNDECIDABLE for whatever it claimed, and silently
 * treating that as "not ours" would let planning overwrite a file it wrote.
 */
export async function readReceiptClaims(root: string): Promise<ReceiptClaims> {
  const directory = join(root, ...PROJECT_RECEIPT_DIRECTORY.split("/"));
  const byPath = new Map<string, ReceiptClaim>();
  const unreadable: string[] = [];
  if (!existsSync(directory)) return { byPath, unreadable };

  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(byCodePoint);
  } catch {
    return { byPath, unreadable: [PROJECT_RECEIPT_DIRECTORY] };
  }

  for (const name of names) {
    const relativePath = `${PROJECT_RECEIPT_DIRECTORY}/${name}`;
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(join(directory, name), "utf8"));
    } catch {
      unreadable.push(relativePath);
      continue;
    }
    const receipt = parsed as { packId?: unknown; targets?: unknown } | null;
    const packId = typeof receipt?.packId === "string" ? receipt.packId : "";
    if (packId.length === 0 || !Array.isArray(receipt?.targets)) {
      unreadable.push(relativePath);
      continue;
    }
    for (const entry of receipt.targets as ReadonlyArray<{ path?: unknown; targetHash?: unknown } | null>) {
      const claimed = typeof entry?.path === "string" ? normalizeRelativePosix(entry.path) : null;
      const targetHash = typeof entry?.targetHash === "string" ? entry.targetHash : "";
      if (claimed === null || targetHash.length === 0) continue;
      if (!byPath.has(claimed)) byPath.set(claimed, { packId, path: claimed, targetHash });
    }
  }
  return { byPath, unreadable: unreadable.sort(byCodePoint) };
}

/**
 * Personal-scope skill roots, mirroring the global ECC skill roots.
 *
 * Declared here rather than imported so this module never reaches the global
 * skill SYNC list: what is needed is where a personal skill would already be,
 * not which skills alpha-AOS installs globally.
 */
function personalSkillRoots(environment: NodeJS.ProcessEnv, home: string): string[] {
  return [
    join(environment.CLAUDE_CONFIG_DIR?.trim() || join(home, ".claude"), "skills"),
    join(home, ".agents", "skills"),
    join(environment.ANTIGRAVITY_CONFIG_DIR?.trim() || join(home, ".gemini", "config"), "skills"),
    join(environment.HERMES_HOME?.trim() || join(home, ".hermes"), "skills"),
  ];
}

/**
 * Skill names that already exist at personal scope.
 *
 * Claude Code resolves a same-named skill by SOURCE, and personal overrides
 * project — so a pack skill colliding with a personal one would silently not
 * be the skill that loads. That is reported as an observed collision, never
 * assumed: none of the declared pack skills collides with the three global
 * skills today, so an unconditional warning would be noise.
 */
export async function discoverPersonalSkillNames(
  environment: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): Promise<ReadonlySet<string>> {
  const names = new Set<string>();
  for (const root of personalSkillRoots(environment, home)) {
    if (!existsSync(root)) continue;
    let entries: Dirent[];
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && existsSync(join(root, entry.name, "SKILL.md"))) names.add(entry.name);
    }
  }
  return names;
}

export interface InspectTargetPreStateOptions {
  /** Absolute canonical root. */
  readonly root: string;
  readonly packId: string;
  readonly skill: string;
  readonly harness: HarnessId;
  /** The hash the render would produce. Identity render, so the source hash. */
  readonly expectedHash: string;
  readonly claims: ReadonlyMap<string, ReceiptClaim>;
}

/**
 * What is already at one target path.
 *
 * Follows the pre-state read shape the ECC skill sync already uses: existence
 * check, hash of the current bytes when present, and a create/update/current
 * action. Nothing here writes, moves or renames — the conflict D-11 cares
 * about is reported by READING.
 */
export async function inspectTargetPreState(options: InspectTargetPreStateOptions): Promise<TargetPreState> {
  const skillRoot = PROJECT_SKILL_ROOTS[options.harness];
  if (skillRoot === undefined) {
    throw new Error(`${options.harness} has no project-local skill root, so no target can be planned for it`);
  }
  const path = `${skillRoot}/${options.skill}/SKILL.md`;
  const absolute = join(options.root, ...path.split("/"));
  const exists = existsSync(absolute);

  let currentHash: string | null = null;
  if (exists) {
    try {
      currentHash = sha256(await readFile(absolute, "utf8"));
    } catch {
      // Present but unreadable: the hash is unknown, so ownership cannot be
      // proven and the action stays `update` rather than `current`.
      currentHash = null;
    }
  }

  return {
    packId: options.packId,
    skill: options.skill,
    harness: options.harness,
    path,
    exists,
    currentHash,
    ownedByReceipt: options.claims.has(path),
    expectedHash: options.expectedHash,
    action: !exists ? "create" : currentHash === options.expectedHash ? "current" : "update",
  };
}

/**
 * The undo for one planned target, and the hash that guards it.
 *
 * Transaction snapshot semantics, stated as a value: the inverse of a create
 * is a remove guarded by the hash that will be written, and the inverse of an
 * update is a restore guarded by the hash that was there before.
 */
export function buildSafeInverse(target: TargetPreState): SafeInverse {
  if (target.action === "create") {
    return {
      packId: target.packId,
      operation: "remove",
      guard: { path: target.path, expectedHash: target.expectedHash },
    };
  }
  return {
    packId: target.packId,
    operation: "restore",
    guard: { path: target.path, expectedHash: target.currentHash ?? target.expectedHash },
  };
}

/**
 * Everything a reviewer would look at, as ONE object literal in ONE place.
 *
 * Built as a literal rather than derived by deleting fields from the plan:
 * that is what keeps `createdAt` and the git branch/commit context out of
 * every digest BY CONSTRUCTION, and what stops two code paths building the
 * same logical object with keys in different orders. Every array reaching here
 * is already sorted by its producer.
 */
export function digestablePlan(plan: Omit<ProjectCapabilityPlan, "planDigest">): Record<string, unknown> {
  return {
    schemaVersion: plan.schemaVersion,
    scope: {
      canonicalRoot: plan.scope.canonicalRoot,
      rootReason: plan.scope.rootReason,
      projectId: plan.scope.projectId,
      subProjectPath: plan.scope.subProjectPath,
    },
    owner: {
      id: plan.owner.id,
      producer: { name: plan.owner.producer.name, version: plan.owner.producer.version },
    },
    receiptDirectory: plan.receiptDirectory,
    renderer: {
      id: plan.renderer.id,
      version: plan.renderer.version,
      identity: plan.renderer.identity,
    },
    source: plan.source.map((entry) => [
      entry.packId,
      entry.skill,
      entry.package,
      entry.version,
      entry.integrity,
      entry.sourceSha256,
    ]),
    targetPreState: plan.targetPreState.map((target) => [
      target.packId,
      target.skill,
      target.harness,
      target.path,
      target.exists,
      target.currentHash,
      target.ownedByReceipt,
      target.expectedHash,
      target.action,
    ]),
    adapterSupport: plan.adapterSupportEvidence.map((entry) => [entry.harness, entry.support]),
    approvals: plan.approvals.map((approval) => [approval.code, approval.detail]),
    safeInverse: plan.safeInverse.map((inverse) => [
      inverse.packId,
      inverse.operation,
      inverse.guard.path,
      inverse.guard.expectedHash,
    ]),
    // DETC-05 names an executable among the things whose change must refuse an
    // apply. Phase 2 spawns nothing, so the slot is null — and it is digested
    // as null, so the moment Phase 3 fills it the existing drift refusal
    // already watches it with no new mechanism.
    executable: plan.executable,
    executableDisposition: {
      deferredTo: plan.executableDisposition.deferredTo,
      reason: plan.executableDisposition.reason,
    },
    manifestDigest: plan.manifestDigest,
    inputsDigest: plan.inputsDigest,
    evidenceDigest: plan.evidenceDigest,
    evaluations: plan.evaluations.map((evaluation) => ({
      packId: evaluation.packId,
      status: evaluation.status,
      satisfied: evaluation.satisfied.map((leaf) => [leaf.factId, leaf.path]),
      failed: evaluation.failed.map((leaf) => [leaf.factId, leaf.reason]),
      deferred: evaluation.deferred.map((entry) => [entry.factId, entry.deferredTo]),
      undeclared: evaluation.undeclared,
    })),
    selected: plan.selected,
    applicable: plan.applicable,
    nearMissOrder: plan.nearMissOrder,
    subProjects: plan.subProjects.map((entry) => [entry.path, entry.selected.join("+")]),
    // DETC-05: an approval taken while a bound was in force must not be
    // silently reusable once the bound clears. Digesting the completeness
    // record is what makes those two situations different values rather than
    // the same one (02-REVIEW CR-03).
    scanBounds: plan.scanBounds.map((bound) => [bound.bound, bound.limit, bound.at]),
    undecidableBoundaries: plan.undecidableBoundaries.map((entry) => [entry.path, entry.reason, entry.detail]),
  };
}

/** The digest name every reviewed project plan is bound under. */
export const PLAN_DIGEST_KIND = "project-capability-plan";

function sealPlan(plan: Omit<ProjectCapabilityPlan, "planDigest">): ProjectCapabilityPlan {
  return { ...plan, planDigest: reviewedDigest(PLAN_DIGEST_KIND, digestablePlan(plan)) };
}

/** Selected covers the predicate answer AND an explicit manifest force-on. */
function isSelected(evaluation: PackEvaluation): boolean {
  return evaluation.status === "selected" || evaluation.status === "forced-on";
}

export interface PlanProjectCapabilitiesOptions {
  path: string;
  packageRoot: string;
  /** A discovered sub-project path, relative to the canonical root. Never guessed (D-01). */
  subProject?: string | undefined;
  /**
   * Pins the canonical root for this call, so the ladder does not climb out of
   * a descent. Without this, planning a workspace member re-resolves to the
   * repository root, re-discovers the same members, and never terminates.
   */
  explicitRoot?: string | undefined;
  /** How the pinned root was arrived at. Decides the reported rung. */
  rootPin?: RootPin | undefined;
  /**
   * The canonical roots already entered on this recursion path. A root that
   * appears twice is a named refusal, never a second scan (T-02-40).
   */
  visitedRoots?: ReadonlySet<string> | undefined;
  /**
   * Whether to describe each discovered sub-project's own decision. Default
   * true. A descent sets it false, which bounds description to exactly one
   * level: a member's plan is about the member, not about its children.
   */
  describeMembers?: boolean | undefined;
}

/**
 * Turns one repository directory into a reviewable capability decision.
 *
 * Nothing here writes. The plan is a value; persisting it is a separate act,
 * so "what was looked at" and "what was approved" are never the same command.
 */
export async function planProjectCapabilities(
  options: PlanProjectCapabilitiesOptions,
): Promise<ProjectCapabilityPlan> {
  const scope = await resolveCanonicalRoot(options.path, options.explicitRoot, options.rootPin ?? "caller");

  // The cycle guard is deliberately a THROW rather than a quiet skip: a
  // repeated canonical root means the ladder climbed back out of a descent, and
  // a future change that reintroduces that must fail loudly here rather than
  // silently produce a plan that scanned one directory twice.
  if (options.visitedRoots?.has(scope.root) === true) {
    throw new Error(
      `Project planning re-entered the canonical root ${scope.root}` +
        `${options.subProject === undefined ? "" : ` through sub-project ${options.subProject}`}` +
        ", so the descent did not make progress and the scan is refused rather than repeated.",
    );
  }

  const evidence = await collectProjectEvidenceDetail(scope, { packageRoot: options.packageRoot });
  const envelope = evidence.envelope;
  const catalog = await loadPackCatalogStrict(options.packageRoot);
  const vocabulary = await loadFactVocabularyStrict(options.packageRoot);

  // D-01: the user names the target; discovery never picks one. An
  // unrecognised `--project` value throws here, naming the discovered options.
  const discovery = await discoverSubProjects(scope, {
    scan: evidence.scan,
    ...(options.subProject === undefined ? {} : { target: options.subProject }),
  });

  if (discovery.selected !== null) {
    return planSubProject(discovery.selected, options, scope.root);
  }

  const inspection = await inspectProjectManifest(scope.root);
  const manifest = inspection !== null && inspection.status === "current" ? inspection.value : null;
  const manifestReason =
    inspection === null
      ? `${PROJECT_MANIFEST_PATH} does not exist at the canonical root`
      : `${PROJECT_MANIFEST_PATH} is ${inspection.status}, so it is not consumed as current`;

  const environment: PackEvaluationEnvironment = {
    vocabulary: new Map(vocabulary.value.facts.map((fact) => [fact.id, fact])),
    facts: new Map(envelope.facts.map((fact) => [fact.id, fact])),
    paths: new Set(evidence.scan.paths),
    dependencies: evidence.dependencies,
    manifest,
    manifestReason,
    overrides: overridesOf(manifest),
  };

  const evaluations = catalog.value.packs
    .map((pack) => evaluatePack(pack, environment))
    .sort(byPackId);

  // A repository root that HAS sub-projects reports each one's own decision
  // and selects nothing itself: the user names the target rather than the tool
  // guessing which member of a workspace they meant (D-01).
  const subProjects =
    options.describeMembers === false ? [] : await describeSubProjects(discovery.subProjects, options, scope.root);
  const rootSelects = subProjects.length === 0;

  const selected = rootSelects
    ? evaluations.filter(isSelected).map((evaluation) => evaluation.packId)
    : [];
  const nearMissOrder = rootSelects ? rankNearMisses(evaluations).map((evaluation) => evaluation.packId) : [];

  const inputsDigest = envelope.sourceHash;
  const evidenceDigest = evidenceDigestOf(envelope);
  // The manifest's own content hash, taken from the read ledger rather than
  // re-read: the ledger records what a detector ACTUALLY read, so a manifest
  // that was skipped as over-cap or unreadable is honestly absent here.
  const manifestDigest = evidence.readInputs.find((input) => input.path === PROJECT_MANIFEST_PATH)?.hash ?? null;

  // DETC-04's remaining nouns. Every array below is sorted by its producer, so
  // the digestable view never has to re-sort and two runs cannot disagree on
  // order.
  const lock = await loadLock(options.packageRoot);
  const stack = await loadCatalog(options.packageRoot);
  const packSkills = new Map(catalog.value.packs.map((pack) => [pack.id, [...(pack.skills ?? [])].sort(byCodePoint)]));

  const source: PackSource[] = [];
  for (const packId of selected) {
    for (const skill of packSkills.get(packId) ?? []) source.push(resolvePackSource(lock, packId, skill));
  }
  source.sort((left, right) => byCodePoint(left.packId, right.packId) || byCodePoint(left.skill, right.skill));

  const claims = await readReceiptClaims(scope.root);
  const targetHarnesses = (Object.keys(PROJECT_SKILL_ROOTS) as HarnessId[]).sort(byCodePoint);
  const targetPreState: TargetPreState[] = [];
  for (const entry of source) {
    for (const harness of targetHarnesses) {
      targetPreState.push(
        await inspectTargetPreState({
          root: scope.root,
          packId: entry.packId,
          skill: entry.skill,
          harness,
          expectedHash: entry.sourceSha256,
          claims: claims.byPath,
        }),
      );
    }
  }
  targetPreState.sort((left, right) => byCodePoint(left.path, right.path));

  const adapterSupportEvidence = classifyAdapterSupport(Object.keys(stack.harnesses) as HarnessId[]);
  const adapterSupport = {} as Record<HarnessId, SurfaceSupport>;
  for (const entry of adapterSupportEvidence) adapterSupport[entry.harness] = entry.support;

  const approvals: PlanApproval[] = [];
  // D-06: a forced pack is recorded as something a reviewer accepted, in the
  // same structure as every other approval, rather than as a silent deviation.
  for (const evaluation of evaluations) {
    if (evaluation.status !== "forced-on" && evaluation.status !== "forced-off") continue;
    approvals.push({
      code: "PACK_OVERRIDE_FORCED",
      detail: `${evaluation.packId}: ${evaluation.overrideReason ?? "forced by the project manifest"}`,
    });
  }
  for (const path of claims.unreadable) {
    approvals.push({ code: "RECEIPT_UNREADABLE", detail: `${path} could not be read, so ownership of what it claims is undecidable` });
  }
  for (const detail of [...new Set(source.map((entry) => `${entry.package}@${entry.version} (${entry.integrity})`))].sort(byCodePoint)) {
    approvals.push({ code: "PACKAGE_SOURCE", detail });
  }

  // D-11: a target holding bytes alpha-AOS did not write DROPS its pack. There
  // is no automatic overwrite and no silent rename — the conflict is found by
  // reading, and the drop is explained by an approval rather than merely
  // observed as an absence.
  const conflicts = targetPreState.filter((target) => target.exists && !target.ownedByReceipt);
  for (const target of conflicts) {
    approvals.push({
      code: "TARGET_CONFLICT",
      detail: `${target.packId}: ${target.path} already holds a file alpha-AOS did not write, so the pack is dropped from the applicable set; nothing was overwritten or renamed`,
    });
  }

  // A personal skill overrides a project one, so a collision means the pack
  // would not be the skill that loads. Reported only when actually observed.
  const personalSkills = source.length === 0 ? new Set<string>() : await discoverPersonalSkillNames();
  for (const skill of [...new Set(source.map((entry) => entry.skill))].sort(byCodePoint)) {
    if (!personalSkills.has(skill)) continue;
    approvals.push({
      code: "SKILL_SHADOWED",
      detail: `${skill} already exists as a personal-scope skill, and a personal skill overrides a project one, so the project pack would not be the skill that loads`,
    });
  }

  approvals.sort((left, right) => byCodePoint(left.code, right.code) || byCodePoint(left.detail, right.detail));

  // ---- What the scan could NOT decide, carried into the plan value --------
  //
  // `scanProjectTree` has always built both records; until now nothing above
  // it could read them, so a scan that refused an entire tree printed as a
  // confident "No pack qualified on the evidence found." (02-REVIEW CR-03).
  // Both lists are total and sorted here, so the digestable view never
  // re-sorts and two runs cannot disagree on order.
  const scanBounds = dedupeBounds([...evidence.scan.bounds, ...discovery.bounds]).sort(
    (left, right) => byCodePoint(left.bound, right.bound) || byCodePoint(left.at, right.at),
  );
  // Only the two reasons that mean the walk could not ANSWER. An ignored path,
  // a git entry, a declared submodule, a vendored directory and an alias entry
  // are DECIDED exclusions: they belong in the full boundary list, not in the
  // "could not read" list, or the disclosure stops meaning anything.
  const undecidableBoundaries = evidence.scan.excludedBoundaries
    .filter((boundary) => boundary.reason === "undecidable" || boundary.reason === "unreadable")
    .slice()
    .sort((left, right) => byCodePoint(left.path, right.path) || byCodePoint(left.reason, right.reason));

  const conflicted = new Set(conflicts.map((target) => target.packId));
  const applicable = selected.filter((packId) => !conflicted.has(packId));
  const applicableSet = new Set(applicable);
  const safeInverse = targetPreState.filter((target) => applicableSet.has(target.packId)).map(buildSafeInverse);

  return sealPlan({
    schemaVersion: 1,
    scope: {
      canonicalRoot: scope.root,
      rootReason: scope.reason,
      projectId: scope.projectId,
      subProjectPath: null,
    },
    owner: { id: PLAN_OWNER, producer: { name: envelope.producer.name, version: envelope.producer.version } },
    source,
    renderer: {
      id: PLAN_RENDERER_ID,
      version: envelope.producer.version,
      identity: true,
      note: "the ECC skill render returns its source unchanged for every pack skill, so each target hash equals its source hash",
    },
    targetPreState,
    adapterSupport,
    adapterSupportEvidence,
    approvals,
    safeInverse,
    executable: null,
    executableDisposition: {
      deferredTo: "phase-3-capability-materialization",
      reason: "Phase 2's `plan` and `approve` spawn nothing, so there is no executable to name; the slot is declared null and digested as null, so the moment Phase 3 fills it the existing drift refusal already watches it",
    },
    receiptDirectory: PROJECT_RECEIPT_DIRECTORY,
    evaluations,
    selected,
    applicable,
    nearMissOrder,
    subProjects,
    scanBounds,
    undecidableBoundaries,
    manifestDigest,
    inputsDigest,
    evidenceDigest,
  });
}

/**
 * The options a descent into `member` runs under.
 *
 * Three things make the recursion terminate, and each covers a case the others
 * do not. `explicitRoot` pins the member as the canonical root, so the ladder
 * cannot climb back to the repository root and re-discover the same members —
 * that is the CR-01 fix. `rootPin: "descent"` makes the pinned root report
 * `project-declaration` rather than `explicit-override`, so a root the tool
 * descended to stays distinguishable from a root the user typed. `visitedRoots`
 * carries the roots already entered, so any future ladder change that undoes
 * the pin throws by name instead of looping. `describeMembers: false` bounds
 * description to one level.
 */
function descentOptions(
  member: SubProject,
  options: PlanProjectCapabilitiesOptions,
  currentRoot: string,
): PlanProjectCapabilitiesOptions {
  return {
    path: member.absolute,
    packageRoot: options.packageRoot,
    explicitRoot: member.absolute,
    rootPin: "descent",
    visitedRoots: new Set([...(options.visitedRoots ?? []), currentRoot]),
    describeMembers: false,
  };
}

/** The named sub-project's own decision, recorded as the plan's scope. */
async function planSubProject(
  target: SubProject,
  options: PlanProjectCapabilitiesOptions,
  currentRoot: string,
): Promise<ProjectCapabilityPlan> {
  const plan = await planProjectCapabilities(descentOptions(target, options, currentRoot));
  // Re-seal: the scope this plan reports is not the one the inner run digested,
  // and a plan digest that does not cover the plan's own scope would let two
  // different sub-projects share a digest.
  const { planDigest: _superseded, ...rest } = plan;
  return sealPlan({ ...rest, scope: { ...plan.scope, subProjectPath: target.path } });
}

/** Each discovered sub-project with the packs its OWN evidence selects. */
async function describeSubProjects(
  subProjects: readonly SubProject[],
  options: PlanProjectCapabilitiesOptions,
  currentRoot: string,
): Promise<SubProjectDecision[]> {
  const decisions: SubProjectDecision[] = [];
  for (const member of subProjects) {
    const plan = await planProjectCapabilities(descentOptions(member, options, currentRoot));
    decisions.push({ path: member.path, declarationFile: member.declarationFile, selected: plan.selected });
  }
  return decisions.sort((left, right) => byCodePoint(left.path, right.path));
}

/**
 * D-06 overrides, read from a CURRENT, VALID manifest only.
 *
 * A migratable manifest is readable but is not consumed as current, and an
 * invalid one contributes nothing rather than partially applying whatever
 * happened to parse. An override naming a pack id the catalog does not declare
 * never reaches here: `inspectProjectManifest` refuses the whole document with
 * `domain.unknown-pack-override`.
 */
function overridesOf(manifest: ProjectStackManifest | null): ReadonlyMap<string, PackOverride> {
  const overrides = new Map<string, PackOverride>();
  if (manifest === null || manifest.packOverrides === undefined) return overrides;
  const safe = Object.assign(Object.create(null) as Record<string, unknown>, manifest.packOverrides);
  for (const key of Object.keys(safe).sort(byCodePoint)) {
    const value = safe[key];
    if (value === "force-on" || value === "force-off") overrides.set(key, value);
  }
  return overrides;
}

// ---------------------------------------------------------------------------
// DETC-05: approving a reviewed plan
// ---------------------------------------------------------------------------
//
// `plan` previews and persists nothing; `approve` is the only writer (D-12).
// The refusal is NOT a second drift mechanism: it is the plan boundary handed
// to the same `assertPlanUnchanged` that already serves the ECC, GSD, MCP,
// isolation and support-bundle components. A second comparison would be a
// second thing to keep true, and the two would drift apart.

/** The approved-plan artifact, relative to the canonical root. D-16: latest only. */
export const PROJECT_PLAN_ARTIFACT = ".alpha-aos/plan.json";

/**
 * The ONE directory inside a project alpha-AOS may write (D-10).
 *
 * Project source, package manifests, tests and build configuration are
 * read-only inputs. Passing this as the transaction's `allowedRoots` is what
 * makes that an enforced property rather than a convention.
 */
export const PROJECT_ARTIFACT_DIRECTORY = ".alpha-aos";

export interface RevalidateProjectPlanOptions extends PlanProjectCapabilitiesOptions {
  /** Where the journal and snapshots live. The writer lock is taken here. */
  readonly stateRoot: string;
}

export interface ProjectPlanRevalidation {
  readonly plan: ProjectCapabilityPlan;
  /** The boundary `assertPlanUnchanged` and `withComponentSession` consume. */
  readonly boundary: ReviewedComponentPlan;
  /** Absolute path of the approved-plan artifact. */
  readonly artifactPath: string;
  /** Absolute `.alpha-aos` directory — the only root an approve may write inside. */
  readonly artifactRoot: string;
  readonly stateRoot: string;
}

/**
 * Re-reads everything a reviewer looked at and proves every path an approve
 * would touch, before anything is acquired or written.
 *
 * This is the read-only half of `approve`, and it is also what the preview form
 * of `project approve` prints: previewing and persisting run the same
 * revalidation, so the digest a user is asked to pass back is the digest the
 * apply will recompute.
 */
export async function revalidateProjectPlan(options: RevalidateProjectPlanOptions): Promise<ProjectPlanRevalidation> {
  const plan = await planProjectCapabilities(options);
  const artifactRoot = join(plan.scope.canonicalRoot, PROJECT_ARTIFACT_DIRECTORY);
  const artifactPath = join(plan.scope.canonicalRoot, ...PROJECT_PLAN_ARTIFACT.split("/"));
  const stateRoot = resolve(options.stateRoot);

  // Every role is declared here, up front and as one set. A step that reached
  // for a path this set does not carry could not prove it after the fact.
  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: artifactPath },
      { role: "state", path: stateRoot },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [artifactRoot, stateRoot],
    requiredRoles: requiredRolesForFileMutation(),
  });

  return {
    plan,
    boundary: { kind: PLAN_DIGEST_KIND, digest: plan.planDigest, proofs, stateRoot },
    artifactPath,
    artifactRoot,
    stateRoot,
  };
}

/** The exact command that approves one plan, ready to paste. */
export interface ApprovalCommandParts {
  readonly path: string;
  readonly subProject?: string | null | undefined;
  readonly planDigest: string;
}

/**
 * The runnable approve command for a given plan digest.
 *
 * Every refusal ends with one of these. A refusal that only says what went
 * wrong leaves the user to reconstruct the command; D-13 is explicit that the
 * refusal must be a next step rather than a dead end.
 */
export function approvalCommand(parts: ApprovalCommandParts): string {
  const target = /\s/u.test(parts.path) ? `"${parts.path}"` : parts.path;
  const project = parts.subProject === undefined || parts.subProject === null ? [] : ["--project", parts.subProject];
  return ["alpha-aos", "project", "approve", target, ...project, "--plan-digest", parts.planDigest, "--apply"].join(" ");
}

export type ProjectApprovalStatus = "written" | "already-current";

export interface ProjectApprovalResult {
  readonly status: ProjectApprovalStatus;
  /** The journal id, or `null` when the artifact was already current. */
  readonly operationId: string | null;
  readonly artifactPath: string;
  readonly plan: ProjectCapabilityPlan;
}

/** The approved-plan artifact, as written and as read back. */
export interface ApprovedProjectPlanArtifact {
  readonly schemaVersion: 1;
  readonly kind: string;
  readonly approvedDigest: string;
  /**
   * The branch and commit the approval was recorded on. CONTEXT ONLY.
   *
   * It sits BESIDE `plan` rather than inside it, which is what keeps it out of
   * `digestablePlan` by construction: the digest covers the plan value, and a
   * branch that entered it would make every commit invalidate every approval.
   * Optional, so an artifact written before this field existed still reads.
   */
  readonly gitContext?: GitContext;
  readonly plan: ProjectCapabilityPlan;
}

export interface ApproveProjectPlanOptions extends RevalidateProjectPlanOptions {
  /** The digest a reviewer saw. Nothing is written unless a re-read reproduces it. */
  readonly expectedDigest: string;
  /**
   * The plan the reviewer actually saw, when the caller still holds it.
   *
   * A digest alone cannot say WHAT moved, so a caller that kept the reviewed
   * value gets the D-13 classification. A caller that did not — the CLI, whose
   * two invocations share nothing but the digest — falls back to the last
   * approved artifact, and to an unclassified refusal when there is none.
   */
  readonly reviewedPlan?: ProjectCapabilityPlan;
  /** A writer already held by the caller. When supplied, no second lock is taken. */
  readonly session?: MutationSession;
}

/**
 * The bytes of the approved artifact.
 *
 * Deliberately carries no timestamp: approving the same plan twice produces
 * byte-identical content, which is what makes "already current" a property of
 * the plan rather than of when it was approved.
 */
function approvalArtifactBytes(plan: ProjectCapabilityPlan, gitContext: GitContext): string {
  const artifact: ApprovedProjectPlanArtifact = {
    schemaVersion: 1,
    kind: PLAN_DIGEST_KIND,
    approvedDigest: plan.planDigest,
    gitContext,
    plan,
  };
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/** The last approved plan at a path, or `null` when there is none to read. */
export async function readApprovedProjectPlan(artifactPath: string): Promise<ApprovedProjectPlanArtifact | null> {
  if (!existsSync(artifactPath)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(artifactPath, "utf8"));
  } catch {
    return null;
  }
  const artifact = parsed as ApprovedProjectPlanArtifact | null;
  if (artifact === null || typeof artifact !== "object") return null;
  if (typeof artifact.approvedDigest !== "string" || artifact.approvedDigest.length === 0) return null;
  if (artifact.plan === null || typeof artifact.plan !== "object") return null;
  return artifact;
}

/**
 * Applies a reviewed plan: refuses the instant anything a reviewer saw moved,
 * then writes exactly one artifact under one journaled, snapshotted transaction.
 */
export async function approveProjectPlan(options: ApproveProjectPlanOptions): Promise<ProjectApprovalResult> {
  const revalidated = await revalidateProjectPlan(options);
  const reviewed: ReviewedPlanBoundary = {
    kind: PLAN_DIGEST_KIND,
    proofs: revalidated.boundary.proofs,
    digest: options.expectedDigest,
  };

  try {
    assertPlanUnchanged(reviewed, revalidated.boundary);
  } catch (error) {
    if (!(error instanceof ComponentPlanError)) throw error;
    throw await explainPlanDrift(options, revalidated);
  }

  // Idempotency: the same plan already on disk is not rewritten. Writing
  // identical bytes would still churn the file's mtime and add a journal entry
  // that undoes nothing.
  const existing = await readApprovedProjectPlan(revalidated.artifactPath);
  if (existing !== null && existing.approvedDigest === revalidated.plan.planDigest) {
    return {
      status: "already-current",
      operationId: null,
      artifactPath: revalidated.artifactPath,
      plan: revalidated.plan,
    };
  }

  // The writer lock is exclusive-create, so a second acquisition inside an
  // already-held session would deadlock the operation against itself. The
  // wrapper is what handles the caller-supplied and standalone cases alike.
  // Read once, before the transaction: it is recorded so `status` can later
  // say the working tree moved, and it takes part in no digest.
  const gitContext = await readGitContext(revalidated.plan.scope.canonicalRoot);

  return withComponentSession(revalidated.boundary, options.session, async (session): Promise<ProjectApprovalResult> => {
    const journal = await applyFileTransaction({
      stateRoot: revalidated.stateRoot,
      // D-10, enforced: `.alpha-aos` is the only root, so a target anywhere
      // else refuses inside the transaction rather than being trusted here.
      allowedRoots: [revalidated.artifactRoot],
      operations: [{ target: revalidated.artifactPath, content: approvalArtifactBytes(revalidated.plan, gitContext) }],
      session,
    });
    return {
      status: "written",
      operationId: journal.id,
      artifactPath: revalidated.artifactPath,
      plan: revalidated.plan,
    };
  });
}

/**
 * What moved between review and apply.
 *
 * `inputs-changed` and `selection-changed` are the two D-13 names: the first is
 * routine — a file that was read changed without changing any decision — and
 * the second is the one that deserves a second look, because the decision
 * itself is different. The other four exist so a refusal can name the specific
 * surface rather than making a user diff two plans to find it.
 */
export type PlanDriftKind =
  | "inputs-changed"
  | "selection-changed"
  | "target-changed"
  | "lock-changed"
  | "manifest-changed"
  | "adapter-changed";

export interface PlanDrift {
  readonly kind: PlanDriftKind;
  /** One sentence a user can act on, already naming the specific surface. */
  readonly detail: string;
  /** Pack ids the revalidated selection has and the reviewed one did not. */
  readonly joined: readonly string[];
  /** Pack ids the reviewed selection had and the revalidated one does not. */
  readonly left: readonly string[];
}

/** Stable comparison of two already-sorted, already-canonical values. */
function differs(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) !== JSON.stringify(right);
}

/**
 * Names what moved, in order of consequence.
 *
 * The order is the point, not an implementation detail. A dependency that
 * selects a new pack ALSO moves that pack's source and target rows, so a
 * lock-first order would report "a locked source changed" for what is really a
 * different decision. The selection is checked first because it is the answer a
 * reviewer actually reviewed; `inputs-changed` is last because it is what
 * remains once nothing a reviewer decided on has moved.
 */
export function classifyPlanDrift(reviewed: ProjectCapabilityPlan, revalidated: ProjectCapabilityPlan): PlanDrift {
  const joined = revalidated.selected.filter((packId) => !reviewed.selected.includes(packId));
  const left = reviewed.selected.filter((packId) => !revalidated.selected.includes(packId));

  if (joined.length > 0 || left.length > 0) {
    return {
      kind: "selection-changed",
      detail:
        "the pack selection itself changed, so this is a different decision from the one that was reviewed: " +
        `joined ${joined.join(", ") || "none"}; left ${left.join(", ") || "none"}`,
      joined,
      left,
    };
  }

  if (differs(reviewed.source, revalidated.source)) {
    const moved = revalidated.source
      .filter((entry) => {
        const before = reviewed.source.find((candidate) => candidate.packId === entry.packId && candidate.skill === entry.skill);
        return before === undefined || before.sourceSha256 !== entry.sourceSha256 || before.version !== entry.version;
      })
      .map((entry) => `${entry.packId}/${entry.skill}`);
    return {
      kind: "lock-changed",
      detail: `the stable lock's pinned source moved for ${moved.join(", ") || "a selected pack"}; the pack selection is unchanged`,
      joined,
      left,
    };
  }

  if (differs(reviewed.targetPreState, revalidated.targetPreState)) {
    const moved = revalidated.targetPreState
      .filter((entry) => {
        const before = reviewed.targetPreState.find((candidate) => candidate.path === entry.path);
        return before === undefined || before.currentHash !== entry.currentHash || before.exists !== entry.exists;
      })
      .map((entry) => entry.path);
    return {
      kind: "target-changed",
      detail: `bytes at a planned target changed: ${moved.join(", ") || "a planned target"}; the pack selection is unchanged`,
      joined,
      left,
    };
  }

  if (
    differs(reviewed.adapterSupportEvidence, revalidated.adapterSupportEvidence) ||
    differs(reviewed.adapterSupport, revalidated.adapterSupport)
  ) {
    const moved = revalidated.adapterSupportEvidence
      .filter((entry) => reviewed.adapterSupport[entry.harness] !== entry.support)
      .map((entry) => `${entry.harness} -> ${entry.support}`);
    return {
      kind: "adapter-changed",
      detail: `a harness's project-scope pack delivery classification changed: ${moved.join(", ") || "a declared harness"}; the pack selection is unchanged`,
      joined,
      left,
    };
  }

  if (reviewed.manifestDigest !== revalidated.manifestDigest) {
    return {
      kind: "manifest-changed",
      detail:
        `${PROJECT_MANIFEST_PATH} changed (${reviewed.manifestDigest?.slice(0, 12) ?? "absent"} -> ` +
        `${revalidated.manifestDigest?.slice(0, 12) ?? "absent"}); the pack selection is unchanged`,
      joined,
      left,
    };
  }

  const observed = reviewed.evidenceDigest !== revalidated.evidenceDigest;
  return {
    kind: "inputs-changed",
    detail: observed
      ? "a file that was read changed and moved an observation, but the pack selection is unchanged, so re-approval is routine"
      : "a file that was read changed without changing any observation, and the pack selection is unchanged, so re-approval is routine",
    joined,
    left,
  };
}

/** The reviewed plan, when the last approved artifact IS the plan under review. */
async function reviewedPlanFromArtifact(
  artifactPath: string,
  expectedDigest: string,
): Promise<ProjectCapabilityPlan | null> {
  const artifact = await readApprovedProjectPlan(artifactPath);
  if (artifact === null || artifact.approvedDigest !== expectedDigest) return null;
  return artifact.plan;
}

/**
 * Turns the boundary's digest mismatch into a refusal that is a next step.
 *
 * The classification needs the reviewed plan VALUE, and a digest is not one. A
 * caller that still holds the plan it reviewed passes it; the CLI, whose two
 * invocations share nothing but a digest, falls back to the last approved
 * artifact. When neither is available the refusal SAYS SO rather than guessing
 * — and still carries the command that re-approves in place, because a refusal
 * with no next step is D-13's whole complaint.
 */
async function explainPlanDrift(
  options: ApproveProjectPlanOptions,
  revalidated: ProjectPlanRevalidation,
): Promise<ComponentPlanError> {
  const command = approvalCommand({
    path: options.path,
    subProject: options.subProject,
    planDigest: revalidated.plan.planDigest,
  });
  const digests = `reviewed ${options.expectedDigest.slice(0, 12)}, observed ${revalidated.plan.planDigest.slice(0, 12)}`;
  const reviewed =
    options.reviewedPlan ?? (await reviewedPlanFromArtifact(revalidated.artifactPath, options.expectedDigest));

  if (reviewed === null) {
    return new ComponentPlanError(
      "plan-drift",
      `${PLAN_DIGEST_KIND} changed between review and apply (${digests}). The reviewed plan value is not available here, ` +
        `so what moved cannot be named; review the current plan again first. Re-approve in place with: ${command}`,
    );
  }

  const drift = classifyPlanDrift(reviewed, revalidated.plan);
  return new ComponentPlanError(
    "plan-drift",
    `${drift.kind}: ${drift.detail} (${digests}). Re-approve in place with: ${command}`,
  );
}

// ---------------------------------------------------------------------------
// DETC-06: reconciling what is installed against what is true NOW
// ---------------------------------------------------------------------------
//
// `status` answers one question per installed pack: is what is on disk still
// what the evidence supports? Three rules hold across everything below.
//
//   1. Evidence is RECOMPUTED, never read back from `.alpha-aos/plan.json`.
//      The artifact is a record of what was approved, not an authority about
//      what is true now, and a hostile or simply stale checkout can contain
//      one. An artifact whose evidence digest disagrees with freshly collected
//      evidence is reported `CHANGED` and is not honoured.
//   2. Absence and unreadability are different facts, one layer up from where
//      plan 02-06 first drew that line. `STALE` asserts the evidence is GONE;
//      a permission error does not establish that, so an unreadable evidence
//      file is `UNDECIDABLE` carrying the errno and the path — and therefore
//      never motivates a removal.
//   3. Reconciliation is a READ. It writes nothing, creates nothing and
//      deletes nothing, which is what makes the phase's standing constraint —
//      stale evidence never triggers automatic deletion — a property of the
//      code rather than a promise about it.

/**
 * What one installed pack's evidence and bytes say about it now.
 *
 * Six states, checked in order of consequence. The order is the point: a pack
 * whose evidence cannot be READ must not be reported as a pack whose evidence
 * is GONE, and a pack the stored artifact claims without support must not be
 * reported as one the evidence still selects.
 */
export type PackState = "CURRENT" | "STALE" | "DRIFTED" | "CHANGED" | "CONFLICT" | "UNDECIDABLE";

/** One target a receipt claims, compared against the bytes on disk. */
export interface ReconciledTarget {
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly harness: HarnessId;
  /** The hash the receipt recorded when the pack was materialized. */
  readonly expectedHash: string;
  /** The hash of the bytes there now, or null when absent or unreadable. */
  readonly currentHash: string | null;
  readonly exists: boolean;
  readonly matches: boolean;
}

/**
 * One fact that selected a pack and is now absent.
 *
 * `sentence` is the whole of what a user reads. Naming only the pack is the
 * defect this closes: a user told "the pack is stale" cannot tell whether the
 * dependency was removed, the branch changed, or the file became unreadable.
 */
export interface StaleReason {
  readonly packId: string;
  readonly factId: string;
  /** The package, file or manifest key the fact was ABOUT, without its operator prefix. */
  readonly named: string;
  /** Why the fresh run says it is not detected. */
  readonly reason: string;
  readonly sentence: string;
}

export interface PackReconciliation {
  readonly packId: string;
  readonly state: PackState;
  /** Relative POSIX path of the receipt that makes this pack "installed". */
  readonly receiptPath: string;
  /** One sentence naming why this state and not another. */
  readonly detail: string;
  readonly targets: readonly ReconciledTarget[];
  /** One entry per fact that selected this pack and is now absent. Empty unless STALE. */
  readonly stale: readonly StaleReason[];
  /** Paths that exist but could not be read. Empty unless UNDECIDABLE. */
  readonly undecidable: readonly UndecidableEvidence[];
}

/** Whether the stored approval is absent, still describes this world, or does not. */
export type ApprovedArtifactState = "absent" | "current" | "changed";

export interface ProjectReconciliation {
  /** Freshly recomputed. The reconciliation is derived from THIS, never from the artifact. */
  readonly plan: ProjectCapabilityPlan;
  /** The plan the last approval recorded, or null when there is none to read. */
  readonly approved: ProjectCapabilityPlan | null;
  readonly artifactState: ApprovedArtifactState;
  readonly artifactPath: string;
  /** Pack ids the stored artifact claims that freshly collected evidence does not select. */
  readonly unsupportedClaims: readonly string[];
  /** One entry per INSTALLED pack — one that has a receipt. Sorted by pack id. */
  readonly packs: readonly PackReconciliation[];
  /** The working tree's branch and commit. Context only; never digested. */
  readonly git: GitContext;
  /** The context recorded at approval time, or null when the artifact carries none. */
  readonly approvedGit: GitContext | null;
  /** D-15's distinguishing sentence, or null when nothing differs. */
  readonly gitNote: string | null;
}

/** One receipt, as read through the strict validator. */
export interface PackReceipt {
  readonly packId: string;
  /** Relative POSIX path of the receipt file itself. */
  readonly path: string;
  readonly sourceHash: string;
  /** The evidence envelope that selected this pack, when the receipt records one. */
  readonly evidenceHash: string | null;
  readonly targets: readonly { readonly harness: HarnessId; readonly path: string; readonly targetHash: string }[];
}

let receiptSchema: Record<string, unknown> | null = null;

/**
 * Every receipt under the receipt directory, read through the ONE managed
 * document route.
 *
 * A malformed receipt is a REFUSAL naming the receipt path, never a partially
 * trusted state: a receipt decides whether alpha-AOS owns a file, and half of
 * that answer is worse than none of it. This is deliberately stricter than
 * `readReceiptClaims`, which tolerates an unreadable receipt because its only
 * question is ownership and its fail-closed answer is "do not touch that path".
 */
export async function readPackReceiptsStrict(root: string, packageRoot: string): Promise<PackReceipt[]> {
  const directory = join(root, ...PROJECT_RECEIPT_DIRECTORY.split("/"));
  if (!existsSync(directory)) return [];

  let names: string[];
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort(byCodePoint);
  } catch (error) {
    throw new Error(`${PROJECT_RECEIPT_DIRECTORY} exists but could not be listed: ${String(error)}`);
  }

  receiptSchema ??= JSON.parse(await readFile(join(packageRoot, "schemas", "receipt.schema.json"), "utf8")) as Record<
    string,
    unknown
  >;

  const receipts: PackReceipt[] = [];
  for (const name of names) {
    const relativePath = `${PROJECT_RECEIPT_DIRECTORY}/${name}`;
    let text: string;
    try {
      text = await readFile(join(directory, name), "utf8");
    } catch (error) {
      throw new Error(`${relativePath} exists but could not be read: ${String(error)}`);
    }
    const result = validateManagedDocument<PackReceipt>({
      text,
      format: "json",
      kind: "receipt",
      schema: receiptSchema,
    });
    if (!result.ok || result.value === null) {
      const codes = result.issues.map((entry) => `${entry.code}@${entry.documentPath}`).join(", ");
      throw new Error(`${relativePath} is not a valid receipt, so what it claims is refused rather than partly trusted: ${codes || result.status}`);
    }
    const value = result.value as unknown as {
      packId: string;
      sourceHash: string;
      evidenceHash?: string;
      targets: ReadonlyArray<{ harness: HarnessId; path: string; targetHash: string }>;
    };
    const targets: PackReceipt["targets"] = value.targets.flatMap((entry) => {
      const normalized = normalizeRelativePosix(entry.path);
      return normalized === null ? [] : [{ harness: entry.harness, path: normalized, targetHash: entry.targetHash }];
    });
    receipts.push({
      packId: value.packId,
      path: relativePath,
      sourceHash: value.sourceHash,
      evidenceHash: value.evidenceHash ?? null,
      targets: [...targets].sort((left, right) => byCodePoint(left.path, right.path)),
    });
  }
  return receipts.sort((left, right) => byCodePoint(left.packId, right.packId));
}

/** A synthesized leaf id carries its operator; the rest of it is the thing named. */
function namedByLeaf(factId: string): string {
  const separator = factId.indexOf(":");
  return separator === -1 ? factId : factId.slice(separator + 1);
}

/**
 * How one missing fact is described, in the shape the CONTEXT asked for.
 *
 * "`postgres-patterns` — the `pg` dependency that selected it is gone." An
 * inline literal already carries its noun in its synthesized id, so a
 * dependency, a file and a manifest opt-in each read as themselves. A DECLARED
 * fact carries its noun in the vocabulary's own description instead, which is
 * what `phrase` is — so the line names the fact AND says what it means without
 * a per-pack string anywhere.
 *
 * A declared `dependency` fact deliberately does NOT claim which package was
 * installed: the envelope records that the fact matched and the manifest that
 * answered, never which of the declared alternatives it was. The specific
 * names reach the user through the negative record's own reason, which
 * enumerates them, rather than through a guess made here.
 */
function describeMissingFact(factId: string, phrase: string | null): string {
  const named = namedByLeaf(factId);
  if (factId.startsWith("dependency:")) return `\`${named}\` dependency`;
  if (factId.startsWith("file:")) return `\`${named}\` file`;
  if (factId.startsWith("manifest:")) return `\`${named}\` manifest opt-in`;
  return phrase === null || phrase.length === 0 ? `\`${factId}\` fact` : `\`${factId}\` fact (${phrase})`;
}

function staleReasonFor(packId: string, leaf: LeafResult, fresh: LeafResult | undefined): StaleReason {
  const reason = fresh?.reason ?? "the fresh run reports it as not detected and gave no further reason";
  return {
    packId,
    factId: leaf.factId,
    named: namedByLeaf(leaf.factId),
    reason,
    sentence: `${packId} — the ${describeMissingFact(leaf.factId, fresh?.phrase ?? leaf.phrase)} that selected it is gone: ${reason}`,
  };
}

function evaluationOf(plan: ProjectCapabilityPlan | null, packId: string): PackEvaluation | null {
  if (plan === null || !Array.isArray(plan.evaluations)) return null;
  return plan.evaluations.find((evaluation) => evaluation.packId === packId) ?? null;
}

/**
 * The whole reconciliation: every installed pack, one honest state each.
 *
 * Nothing here writes. `planProjectCapabilities` is what recomputes evidence,
 * so the states below are derived from a fresh read of the repository and the
 * stored artifact contributes exactly one thing — the fact set that was
 * approved, which is what lets a `STALE` line name WHICH fact disappeared.
 */
export async function reconcileProjectState(
  options: PlanProjectCapabilitiesOptions,
): Promise<ProjectReconciliation> {
  const plan = await planProjectCapabilities(options);
  const root = plan.scope.canonicalRoot;
  const artifactPath = join(root, ...PROJECT_PLAN_ARTIFACT.split("/"));
  const artifact = await readApprovedProjectPlan(artifactPath);
  const approved = artifact?.plan ?? null;
  const approvedGit = artifact?.gitContext ?? null;
  const git = await readGitContext(root);

  const artifactState: ApprovedArtifactState =
    approved === null ? "absent" : approved.evidenceDigest === plan.evidenceDigest ? "current" : "changed";

  const selectedNow = new Set(plan.selected);
  const claimed = Array.isArray(approved?.applicable) ? (approved.applicable as string[]) : [];
  const unsupportedClaims = [...new Set(claimed.filter((packId) => !selectedNow.has(packId)))].sort(byCodePoint);

  const receipts = await readPackReceiptsStrict(root, options.packageRoot);
  const packs: PackReconciliation[] = [];

  for (const receipt of receipts) {
    const targets: ReconciledTarget[] = [];
    for (const claim of receipt.targets) {
      const absolute = join(root, ...claim.path.split("/"));
      const exists = existsSync(absolute);
      let currentHash: string | null = null;
      if (exists) {
        try {
          currentHash = sha256(await readFile(absolute, "utf8"));
        } catch {
          // Present but unreadable: the hash is unknown, so the target cannot
          // be proven to match and is reported as not matching.
          currentHash = null;
        }
      }
      targets.push({
        path: claim.path,
        harness: claim.harness,
        expectedHash: claim.targetHash,
        currentHash,
        exists,
        matches: exists && currentHash === claim.targetHash,
      });
    }

    packs.push(classifyInstalledPack({ receipt, targets, plan, approved, selected: selectedNow.has(receipt.packId) }));
  }

  return {
    plan,
    approved,
    artifactState,
    artifactPath,
    unsupportedClaims,
    packs,
    git,
    approvedGit,
    gitNote: describeGitDifference(approvedGit, git),
  };
}

interface InstalledPackInput {
  readonly receipt: PackReceipt;
  readonly targets: readonly ReconciledTarget[];
  readonly plan: ProjectCapabilityPlan;
  readonly approved: ProjectCapabilityPlan | null;
  readonly selected: boolean;
}

/**
 * One installed pack's state, decided in order of consequence.
 *
 * The pack is still selected: a conflicting unowned target outranks drifted
 * bytes, because a conflict means alpha-AOS would not be the writer at all.
 * The pack is NOT selected: an unreadable fact outranks a missing one, because
 * `STALE` asserts absence and a read failure does not establish it; and a fact
 * that CAN be named outranks a bare artifact claim, because naming the fact is
 * the whole difference between an actionable report and an unexplained one.
 */
function classifyInstalledPack(input: InstalledPackInput): PackReconciliation {
  const { receipt, targets, plan, approved, selected } = input;
  const freshEvaluation = evaluationOf(plan, receipt.packId);
  const approvedEvaluation = evaluationOf(approved, receipt.packId);
  const base = { packId: receipt.packId, receiptPath: receipt.path, targets };

  if (selected) {
    const conflicts = plan.targetPreState.filter(
      (target) => target.packId === receipt.packId && target.exists && !target.ownedByReceipt,
    );
    if (conflicts.length > 0) {
      return {
        ...base,
        state: "CONFLICT",
        detail: `${receipt.packId} is still selected, but ${conflicts
          .map((target) => target.path)
          .join(", ")} already holds a file alpha-AOS did not write; nothing was overwritten or renamed`,
        stale: [],
        undecidable: [],
      };
    }
    const drifted = targets.filter((target) => !target.matches);
    if (drifted.length > 0) {
      return {
        ...base,
        state: "DRIFTED",
        detail: `${receipt.packId} is still selected, but the bytes at ${drifted
          .map((target) => (target.exists ? target.path : `${target.path} (absent)`))
          .join(", ")} no longer match the hash its receipt recorded`,
        stale: [],
        undecidable: [],
      };
    }
    return {
      ...base,
      state: "CURRENT",
      detail: `${receipt.packId} is still selected and every target it claims matches the hash its receipt recorded`,
      stale: [],
      undecidable: [],
    };
  }

  const freshSatisfied = new Set((freshEvaluation?.satisfied ?? []).map((leaf) => leaf.factId));
  const freshFailed = new Map((freshEvaluation?.failed ?? []).map((leaf) => [leaf.factId, leaf]));
  const disappeared = (approvedEvaluation?.satisfied ?? []).filter((leaf) => !freshSatisfied.has(leaf.factId));

  const undecidable = disappeared
    .map((leaf) => parseUndecidableReason(freshFailed.get(leaf.factId)?.reason ?? null))
    .filter((entry): entry is UndecidableEvidence => entry !== null);

  if (undecidable.length > 0) {
    return {
      ...base,
      state: "UNDECIDABLE",
      detail: `${receipt.packId} cannot be decided: ${undecidable
        .map((entry) => `${entry.path} (errno=${entry.errno})`)
        .join("; ")} exists but could not be read — that is not evidence the pack's basis is gone, so it is not reported STALE`,
      stale: [],
      undecidable,
    };
  }

  if (disappeared.length > 0) {
    const stale = disappeared.map((leaf) => staleReasonFor(receipt.packId, leaf, freshFailed.get(leaf.factId)));
    return {
      ...base,
      state: "STALE",
      // Short by design: the full sentence for each missing fact is emitted on
      // its own line, and repeating all of them inside a table cell is how a
      // pack with several missing facts floods the report.
      detail: `${receipt.packId}: ${stale.length} fact(s) that selected it are gone (${stale
        .map((entry) => entry.factId)
        .join(", ")}); each is named in full on its own STALE-FACT line`,
      stale,
      undecidable: [],
    };
  }

  // Not selected, and no approved fact set names what disappeared. The honest
  // answer is that the record and the world disagree — not that some
  // unidentified fact went away.
  return {
    ...base,
    state: "CHANGED",
    detail:
      approved === null
        ? `${receipt.packId} has a receipt but freshly collected evidence does not select it, and no approved plan records which facts selected it, so the fact that changed cannot be named`
        : `${receipt.packId} is claimed by ${PROJECT_PLAN_ARTIFACT} but freshly collected evidence does not select it; the artifact is a record of what was approved, not an authority about what is true now`,
    stale: [],
    undecidable: [],
  };
}

// ---------------------------------------------------------------------------
// D-15: the branch context, read from the filesystem and digested nowhere
// ---------------------------------------------------------------------------
//
// `plan`, `approve` and `status` are offline and subprocess-free by contract,
// so the branch is read from `.git` rather than from `git rev-parse`. The same
// rule that keeps a package manager off the preview path keeps git off it.
//
// Every value below is CONTEXT ONLY. It never reaches `digestablePlan`, which
// is a literal listing exactly what a reviewer reviewed — if the branch or the
// commit entered any digest, every commit would invalidate every approval.

/** 4 KiB is far above any `HEAD`, ref or `gitdir:` pointer; anything larger is not one. */
export const MAX_GIT_POINTER_BYTES = 4096;

/** 1 MiB of `packed-refs` is read. A larger one reports the tip unresolved rather than looping. */
export const MAX_GIT_PACKED_REFS_BYTES = 1048576;

/** A git object id, in either the sha-1 or the sha-256 object format. */
const GIT_OBJECT_ID = /^[0-9a-f]{40}$|^[0-9a-f]{64}$/u;

/**
 * Where the branch context came from, so a reader can tell a resolved tip from
 * a guessed one. `null` means the branch is known and its tip is not.
 */
export type GitContextSource = "loose" | "packed" | "detached" | null;

export interface GitContext {
  readonly available: boolean;
  /** The branch name for an attached HEAD; null when detached or unavailable. */
  readonly branch: string | null;
  /** The object id HEAD resolves to, or null when it could not be resolved. */
  readonly commit: string | null;
  readonly detached: boolean;
  readonly source: GitContextSource;
  /** Why the context is unavailable or incomplete. Null when fully resolved. */
  readonly reason: string | null;
}

function gitUnavailable(reason: string): GitContext {
  return { available: false, branch: null, commit: null, detached: false, source: null, reason };
}

/** A bounded read that reports "not there / too large / unreadable" as null. */
async function readCapped(path: string, cap: number): Promise<string | null> {
  try {
    const info = await stat(path);
    if (!info.isFile() || info.size > cap) return null;
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

/**
 * The branch and commit a working tree is on, read from `.git`.
 *
 * Handles the four shapes that actually occur: a `.git` DIRECTORY, a `.git`
 * FILE carrying a `gitdir:` pointer (linked worktree, submodule), a detached
 * HEAD holding a raw object id, and a branch whose loose ref has been packed
 * away into `packed-refs`. A linked worktree keeps `HEAD` in its own git dir
 * and its refs in the COMMON dir, so `commondir` is followed when present.
 *
 * When the parse fails for any reason the context is reported UNAVAILABLE
 * rather than guessed. It is context only: a wrong branch name here would be a
 * confident statement about something nothing else verified.
 */
export async function readGitContext(canonicalRoot: string): Promise<GitContext> {
  const entry = join(canonicalRoot, ".git");
  let gitDir = entry;
  let info: Awaited<ReturnType<typeof stat>>;
  try {
    info = await stat(entry);
  } catch {
    return gitUnavailable(".git does not exist at the canonical root, so there is no branch context to read");
  }

  if (info.isFile()) {
    if (info.size > MAX_GIT_POINTER_BYTES) {
      return gitUnavailable(`.git is a file larger than MAX_GIT_POINTER_BYTES=${MAX_GIT_POINTER_BYTES}, so it is not a gitdir pointer`);
    }
    const pointer = await readCapped(entry, MAX_GIT_POINTER_BYTES);
    const match = pointer === null ? null : /^gitdir:\s*(.+)$/mu.exec(pointer);
    const target = match?.[1]?.trim();
    if (target === undefined || target.length === 0) {
      return gitUnavailable(".git is a file that carries no gitdir: pointer, so the branch context cannot be read");
    }
    gitDir = resolve(canonicalRoot, target);
  } else if (!info.isDirectory()) {
    return gitUnavailable(".git is neither a directory nor a file, so the branch context cannot be read");
  }

  const head = await readCapped(join(gitDir, "HEAD"), MAX_GIT_POINTER_BYTES);
  if (head === null) {
    return gitUnavailable("HEAD could not be read inside the git directory, so the branch context is unavailable");
  }
  const trimmed = head.trim();
  if (GIT_OBJECT_ID.test(trimmed)) {
    return { available: true, branch: null, commit: trimmed, detached: true, source: "detached", reason: null };
  }
  const pointer = /^ref:\s*(\S+)$/mu.exec(trimmed);
  const refName = pointer?.[1];
  if (refName === undefined) {
    return gitUnavailable("HEAD holds neither a ref pointer nor an object id, so the branch context cannot be read");
  }
  const branch = refName.startsWith("refs/heads/") ? refName.slice("refs/heads/".length) : refName;

  // A linked worktree's own git dir holds HEAD; its refs live in the common
  // dir. Both are consulted, own dir first, so an ordinary repository (where
  // they are the same directory) is unaffected.
  const commonPointer = await readCapped(join(gitDir, "commondir"), MAX_GIT_POINTER_BYTES);
  const commonDir = commonPointer === null ? gitDir : resolve(gitDir, commonPointer.trim());
  const searchRoots = commonDir === gitDir ? [gitDir] : [gitDir, commonDir];

  for (const base of searchRoots) {
    const loose = (await readCapped(join(base, ...refName.split("/")), MAX_GIT_POINTER_BYTES))?.trim();
    if (loose !== undefined && GIT_OBJECT_ID.test(loose)) {
      return { available: true, branch, commit: loose, detached: false, source: "loose", reason: null };
    }
  }

  for (const base of searchRoots) {
    const packed = await readCapped(join(base, "packed-refs"), MAX_GIT_PACKED_REFS_BYTES);
    if (packed === null) continue;
    for (const line of packed.split(/\r?\n/u)) {
      // `#` opens a header line and `^` a peeled tag; neither names a branch tip.
      if (line.length === 0 || line.startsWith("#") || line.startsWith("^")) continue;
      const [objectId, name] = line.trim().split(/\s+/u);
      if (name !== refName || objectId === undefined || !GIT_OBJECT_ID.test(objectId)) continue;
      return { available: true, branch, commit: objectId, detached: false, source: "packed", reason: null };
    }
  }

  // The branch is known and its tip is not. Reporting the branch is honest;
  // inventing a commit would not be.
  return {
    available: true,
    branch,
    commit: null,
    detached: false,
    source: null,
    reason: `${refName} resolves to no loose ref and to no packed-refs entry, so its tip is unresolved`,
  };
}

/**
 * D-15's distinguishing sentence, or null when there is nothing to distinguish.
 *
 * `STALE` reflects CURRENT state, so a checkout that removes evidence DOES
 * produce `STALE` — that is correct. This note is what lets a user tell that
 * from a real removal. Both are reported; neither replaces the other.
 */
export function describeGitDifference(approved: GitContext | null, current: GitContext): string | null {
  if (approved === null || !approved.available) return null;
  if (approved.branch === current.branch && approved.commit === current.commit) return null;
  const describe = (context: GitContext): string =>
    `${context.branch === null ? (context.detached ? "a detached HEAD" : "an unknown branch") : `branch ${context.branch}`} at commit ${context.commit?.slice(0, 12) ?? "unknown"}`;
  return `the approved plan was recorded on ${describe(approved)}; the working tree is now on ${describe(current)} — a checkout can remove evidence without anything having been deleted`;
}

// ---------------------------------------------------------------------------
// D-14: the removal plan a human approves, and nothing removes on its own
// ---------------------------------------------------------------------------
//
// Building the removal plan is the WHOLE of what `status` does about
// staleness. The removal still travels the same digest contract an approval
// does — recompute, compare, refuse the instant anything moved — and executes
// only inside one journaled, snapshotted transaction. The snapshot IS the safe
// inverse, which is what makes "stale evidence never triggers automatic
// deletion" enforceable rather than aspirational.

/** The digest name every reviewed pack removal is bound under. */
export const REMOVAL_DIGEST_KIND = "project-pack-removal";

/** One file a removal would delete, and the hash that guards deleting it. */
export interface RemovalTarget {
  /** Relative POSIX path from the canonical root. */
  readonly path: string;
  readonly harness: HarnessId;
  /** The hash of the bytes there NOW. Null when the target is absent or unreadable. */
  readonly expectedHash: string | null;
  readonly exists: boolean;
}

export interface RemovalPlan {
  readonly packId: string;
  readonly receiptPath: string;
  readonly targets: readonly RemovalTarget[];
  /** Why this removal is offered: the STALE sentences, verbatim. */
  readonly reasons: readonly string[];
  readonly removalDigest: string;
}

/** Everything a reviewer of a removal looks at, as ONE literal in ONE place. */
function digestableRemoval(removal: Omit<RemovalPlan, "removalDigest">): Record<string, unknown> {
  return {
    packId: removal.packId,
    receiptPath: removal.receiptPath,
    targets: removal.targets.map((target) => [target.path, target.harness, target.expectedHash, target.exists]),
    reasons: removal.reasons,
  };
}

/**
 * A removal plan for every stale pack, and for nothing else.
 *
 * A `DRIFTED`, `CONFLICT`, `CHANGED` or `UNDECIDABLE` pack is deliberately NOT
 * offered a removal: only `STALE` means the evidence that selected the pack is
 * gone, and an unreadable evidence file must never motivate a deletion.
 *
 * The digest covers each target's CURRENT hash, so a target whose bytes move
 * between the plan and its approval produces a different digest and the
 * approval refuses — the same "recompute and compare" the plan artifact uses,
 * rather than a second drift mechanism that would drift from the first.
 */
export function planPackRemoval(reconciliation: ProjectReconciliation): RemovalPlan[] {
  const plans: RemovalPlan[] = [];
  for (const pack of reconciliation.packs) {
    if (pack.state !== "STALE") continue;
    const draft = {
      packId: pack.packId,
      receiptPath: pack.receiptPath,
      targets: pack.targets.map((target) => ({
        path: target.path,
        harness: target.harness,
        expectedHash: target.currentHash,
        exists: target.exists,
      })),
      reasons: pack.stale.map((reason) => reason.sentence),
    };
    plans.push({ ...draft, removalDigest: reviewedDigest(REMOVAL_DIGEST_KIND, digestableRemoval(draft)) });
  }
  return plans;
}

export interface ApplyPackRemovalOptions extends RevalidateProjectPlanOptions {
  /** The removal digest a reviewer saw. Nothing is removed unless a re-read reproduces it. */
  readonly removalDigest: string;
  /** A writer already held by the caller. When supplied, no second lock is taken. */
  readonly session?: MutationSession;
}

export interface PackRemovalResult {
  readonly packId: string;
  readonly operationId: string;
  /** Relative POSIX paths actually removed, sorted. */
  readonly removed: readonly string[];
  readonly removalDigest: string;
}

/**
 * The roots a removal may write inside: the project-local skill roots that own
 * the targets, and nothing else.
 *
 * Passing the canonical root would make the transaction's containment check
 * vacuous. Deriving the roots from `PROJECT_SKILL_ROOTS` keeps a removal
 * confined to the same three directories a materialization can reach.
 */
function removalAllowedRoots(canonicalRoot: string, targets: readonly RemovalTarget[]): string[] {
  const roots = new Set<string>();
  for (const target of targets) {
    const skillRoot = PROJECT_SKILL_ROOTS[target.harness];
    if (skillRoot === undefined) {
      throw new Error(`${target.harness} has no project-local skill root, so ${target.path} cannot be removed`);
    }
    roots.add(join(canonicalRoot, ...skillRoot.split("/")));
  }
  return [...roots].sort(byCodePoint);
}

/**
 * Removes one stale pack's targets, under one journaled, snapshotted transaction.
 *
 * The reconciliation is recomputed here rather than carried from the preview,
 * so the digest a user pastes back is compared against the world as it is at
 * apply time. A removal plan that no longer exists — because the evidence came
 * back, or because a target's bytes moved — is a `plan-drift` refusal naming
 * what is on offer now, never a partial deletion.
 */
export async function applyPackRemoval(options: ApplyPackRemovalOptions): Promise<PackRemovalResult> {
  const reconciliation = await reconcileProjectState(options);
  const offered = planPackRemoval(reconciliation);
  const removal = offered.find((entry) => entry.removalDigest === options.removalDigest);

  if (removal === undefined) {
    const available =
      offered.map((entry) => `${entry.packId}=${entry.removalDigest.slice(0, 12)}`).join(", ") || "none";
    throw new ComponentPlanError(
      "plan-drift",
      `no stale pack currently offers a removal plan with digest ${options.removalDigest.slice(0, 12)} ` +
        `(on offer now: ${available}). Either the evidence came back or a target's bytes moved since the plan ` +
        `was built, so nothing was removed. Review the current state again with: ` +
        `alpha-aos project status ${/\s/u.test(options.path) ? `"${options.path}"` : options.path}`,
    );
  }

  const canonicalRoot = reconciliation.plan.scope.canonicalRoot;
  const present = removal.targets.filter((target) => target.exists);
  if (present.length === 0) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${removal.packId} has no target file left on disk, so there is nothing for a removal to remove`,
    );
  }

  const stateRoot = resolve(options.stateRoot);
  const allowedRoots = removalAllowedRoots(canonicalRoot, present);
  const absolute = present.map((target) => join(canonicalRoot, ...target.path.split("/")));

  // Every role declared up front and as one set, exactly as an approval does.
  const proofs = await proveOperationPaths({
    inputs: [
      ...absolute.map((path) => ({ role: "target" as const, path })),
      { role: "state", path: stateRoot },
      { role: "journal", path: join(stateRoot, "journal") },
      { role: "snapshot", path: join(stateRoot, "snapshots") },
    ],
    allowedRoots: [...allowedRoots, stateRoot],
    requiredRoles: requiredRolesForFileMutation(),
  });

  const boundary: ReviewedComponentPlan = {
    kind: REMOVAL_DIGEST_KIND,
    digest: removal.removalDigest,
    proofs,
    stateRoot,
  };

  return withComponentSession(boundary, options.session, async (session): Promise<PackRemovalResult> => {
    const journal = await applyFileTransaction({
      stateRoot,
      allowedRoots,
      // `content: null` is the transaction's removal, so the snapshot taken
      // before the delete is the restore that undoes it.
      operations: absolute.map((target) => ({ target, content: null })),
      session,
    });
    return {
      packId: removal.packId,
      operationId: journal.id,
      removed: present.map((target) => target.path).sort(byCodePoint),
      removalDigest: removal.removalDigest,
    };
  });
}
