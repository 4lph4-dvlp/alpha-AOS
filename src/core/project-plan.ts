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
import type {
  DeferredFact,
  EvidenceEnvelope,
  EvidenceFact,
  EvidenceNode,
  FactDeclaration,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  PackOverride,
  PackStatus,
  ProjectCapabilityPlan,
  ProjectStackManifest,
  SubProjectDecision,
} from "../types.js";
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

export interface PackClassification {
  readonly value: boolean;
  readonly satisfied: readonly LeafResult[];
  readonly failed: readonly LeafResult[];
  readonly deferred: readonly DeferredFact[];
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
  const override = environment.overrides.get(pack.id) ?? null;

  const status = classifyPack({ value: result.value, satisfied, failed, deferred, override });
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

  // Built once, here, as a literal. Deriving it by deleting fields from a
  // larger envelope is how `createdAt` or a git ref leaks into a digest and
  // makes two runs over an unchanged repository disagree.
  const digestableView = {
    schemaVersion: 1,
    scope: {
      canonicalRoot: scope.root,
      rootReason: scope.reason,
      projectId: scope.projectId,
      subProjectPath: null,
    },
    inputsDigest,
    evidenceDigest,
    evaluations: evaluations.map((evaluation) => ({
      packId: evaluation.packId,
      status: evaluation.status,
      satisfied: evaluation.satisfied.map((leaf) => [leaf.factId, leaf.path]),
      failed: evaluation.failed.map((leaf) => [leaf.factId, leaf.reason]),
      deferred: evaluation.deferred.map((entry) => [entry.factId, entry.deferredTo]),
    })),
    selected,
    nearMissOrder,
    subProjects: subProjects.map((entry) => [entry.path, entry.selected.join("+")]),
  };

  return {
    schemaVersion: 1,
    scope: {
      canonicalRoot: scope.root,
      rootReason: scope.reason,
      projectId: scope.projectId,
      subProjectPath: null,
    },
    evaluations,
    selected,
    nearMissOrder,
    subProjects,
    inputsDigest,
    evidenceDigest,
    planDigest: reviewedDigest("project-capability-plan", digestableView),
  };
}

/** The named sub-project's own decision, recorded as the plan's scope. */
async function planSubProject(
  target: SubProject,
  options: PlanProjectCapabilitiesOptions,
): Promise<ProjectCapabilityPlan> {
  const plan = await planProjectCapabilities({ path: target.absolute, packageRoot: options.packageRoot });
  return { ...plan, scope: { ...plan.scope, subProjectPath: target.path } };
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
