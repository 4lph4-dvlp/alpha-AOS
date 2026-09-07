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
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
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
import { reviewedDigest } from "./component-session.js";
import type { DeclaredDependencies, SubProject } from "./evidence.js";
import {
  collectProjectEvidenceDetail,
  digestableEvidence,
  discoverSubProjects,
  isOptedIn,
  lookupDependency,
  normalizeRelativePosix,
  PROJECT_MANIFEST_PATH,
  resolveCanonicalRoot,
} from "./evidence.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "./pack-catalog.js";
import { inspectProjectManifest } from "./project.js";

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
  };
}

/** The digest name every reviewed project plan is bound under. */
const PLAN_DIGEST_KIND = "project-capability-plan";

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
  const scope = await resolveCanonicalRoot(options.path);
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
    return planSubProject(discovery.selected, options);
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
  const subProjects = await describeSubProjects(discovery.subProjects, options);
  const rootSelects = subProjects.length === 0;

  const selected = rootSelects
    ? evaluations.filter(isSelected).map((evaluation) => evaluation.packId)
    : [];
  const nearMissOrder = rootSelects ? rankNearMisses(evaluations).map((evaluation) => evaluation.packId) : [];

  const inputsDigest = envelope.sourceHash;
  const evidenceDigest = evidenceDigestOf(envelope);

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
    inputsDigest,
    evidenceDigest,
  });
}

/** The named sub-project's own decision, recorded as the plan's scope. */
async function planSubProject(
  target: SubProject,
  options: PlanProjectCapabilitiesOptions,
): Promise<ProjectCapabilityPlan> {
  const plan = await planProjectCapabilities({ path: target.absolute, packageRoot: options.packageRoot });
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
): Promise<SubProjectDecision[]> {
  const decisions: SubProjectDecision[] = [];
  for (const member of subProjects) {
    const plan = await planProjectCapabilities({ path: member.absolute, packageRoot: options.packageRoot });
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
