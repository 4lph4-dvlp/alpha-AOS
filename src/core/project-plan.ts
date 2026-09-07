import { createHash } from "node:crypto";
import type {
  EvidenceEnvelope,
  EvidenceFact,
  FactDeclaration,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  PackOverride,
  ProjectCapabilityPlan,
  ProjectStackManifest,
} from "../types.js";
import { reviewedDigest } from "./component-session.js";
import type { DeclaredDependencies } from "./evidence.js";
import {
  collectProjectEvidenceDetail,
  digestableEvidence,
  lookupDependency,
  resolveCanonicalRoot,
} from "./evidence.js";
import { loadPackCatalogStrict } from "./pack-catalog.js";

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function byFactId(left: LeafResult, right: LeafResult): number {
  return left.factId.localeCompare(right.factId);
}

/**
 * Evaluates one pack without short-circuiting. `Array.prototype.some` would
 * stop at the first satisfied leaf and destroy exactly the information a
 * near-miss explanation needs, so every leaf is computed and kept.
 *
 * This tracer implements the `anyDependencies` operator only. A pack declared
 * with an operator that has no evaluator yet contributes no leaves and stays
 * silent — it is never reported as "your repository does not qualify", because
 * that claim would not be true.
 *
 * `anyDependencies` names inline package literals, not declared fact ids, so
 * it resolves against the dependency index rather than against the envelope:
 * the envelope carries exactly the vocabulary declared in `catalog/facts.yaml`
 * and an inline literal is deliberately not part of it.
 */
function evaluateTracerPack(pack: PackDeclaration, dependencies: DeclaredDependencies): PackEvaluation | null {
  const literals = pack.evidence.anyDependencies;
  if (literals === undefined) return null;

  const satisfied: LeafResult[] = [];
  const failed: LeafResult[] = [];
  for (const literal of literals) {
    // The explaining fact id is synthesized from operator plus matched
    // literal, extending the `manifest:<key>` convention already in use.
    const factId = `dependency:${literal}`;
    const declared = lookupDependency(dependencies, literal);
    if (declared !== null) {
      satisfied.push({ factId, detected: true, path: declared.path, reason: null, broad: false, phrase: factId });
    } else {
      failed.push({
        factId,
        detected: false,
        path: null,
        reason: `${literal} is not declared by a dependency manifest at the canonical root`,
        broad: false,
        phrase: factId,
      });
    }
  }

  satisfied.sort(byFactId);
  failed.sort(byFactId);
  return {
    packId: pack.id,
    status: satisfied.length > 0 ? "selected" : "silent",
    satisfied,
    failed,
    deferred: [],
    explanation: "",
    overrideReason: null,
  };
}

/**
 * Digest over the selection-relevant observations only — ids, detected flags,
 * versions and paths. It deliberately excludes `createdAt` and the aggregate
 * input hash, so "an unrelated file changed" and "what we observed changed"
 * stay two answerable questions rather than one.
 */
function evidenceDigestOf(envelope: EvidenceEnvelope): string {
  return sha256(JSON.stringify(digestableEvidence(envelope)));
}

/**
 * Turns one repository directory into a reviewable capability decision.
 *
 * Nothing here writes. The plan is a value; persisting it is a separate act,
 * so "what was looked at" and "what was approved" are never the same command.
 */
export async function planProjectCapabilities(options: {
  path: string;
  packageRoot: string;
}): Promise<ProjectCapabilityPlan> {
  const scope = await resolveCanonicalRoot(options.path);
  const evidence = await collectProjectEvidenceDetail(scope, { packageRoot: options.packageRoot });
  const envelope = evidence.envelope;
  const catalog = await loadPackCatalogStrict(options.packageRoot);

  const evaluations: PackEvaluation[] = [];
  for (const pack of catalog.value.packs) {
    const evaluation = evaluateTracerPack(pack, evidence.dependencies);
    if (evaluation !== null) evaluations.push(evaluation);
  }

  const selected = evaluations
    .filter((evaluation) => evaluation.status === "selected")
    .map((evaluation) => evaluation.packId)
    .sort();

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
    selected,
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
    nearMissOrder: [],
    subProjects: [],
    inputsDigest,
    evidenceDigest,
    planDigest: reviewedDigest("project-capability-plan", digestableView),
  };
}

// ---------------------------------------------------------------------------
// Plan 02-07 Task 1: the surface the evaluate-all evaluator will fill
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

/** Not yet implemented: every leaf, every operator, and the classification. */
export function evaluatePack(pack: PackDeclaration, environment: PackEvaluationEnvironment): PackEvaluation {
  void environment;
  return {
    packId: pack.id,
    status: "silent",
    satisfied: [],
    failed: [],
    deferred: [],
    explanation: "",
    overrideReason: null,
  };
}
