import { createHash } from "node:crypto";
import type {
  EvidenceEnvelope,
  EvidenceFact,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  ProjectCapabilityPlan,
} from "../types.js";
import { reviewedDigest } from "./component-session.js";
import { collectProjectEvidence, resolveCanonicalRoot } from "./evidence.js";
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
 */
function evaluatePack(pack: PackDeclaration, facts: ReadonlyMap<string, EvidenceFact>): PackEvaluation | null {
  const literals = pack.evidence.anyDependencies;
  if (literals === undefined) return null;

  const satisfied: LeafResult[] = [];
  const failed: LeafResult[] = [];
  for (const literal of literals) {
    // The explaining fact id is synthesized from operator plus matched
    // literal, extending the `manifest:<key>` convention already in use.
    const factId = `dependency:${literal}`;
    const fact = facts.get(factId);
    if (fact !== undefined && fact.detected) {
      satisfied.push({ factId, detected: true, path: fact.path ?? null, reason: null });
    } else {
      failed.push({
        factId,
        detected: false,
        path: null,
        reason: `${literal} is not declared by a dependency manifest at the canonical root`,
      });
    }
  }

  satisfied.sort(byFactId);
  failed.sort(byFactId);
  return { packId: pack.id, status: satisfied.length > 0 ? "selected" : "silent", satisfied, failed };
}

/**
 * Digest over the selection-relevant observations only — ids, detected flags,
 * versions and paths. It deliberately excludes `createdAt` and the aggregate
 * input hash, so "an unrelated file changed" and "what we observed changed"
 * stay two answerable questions rather than one.
 */
function evidenceDigestOf(envelope: EvidenceEnvelope): string {
  const normalized = [...envelope.facts]
    .map((fact) => [fact.id, fact.detected, fact.path ?? null, fact.version ?? null] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  return sha256(JSON.stringify(normalized));
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
  const envelope = await collectProjectEvidence(scope);
  const catalog = await loadPackCatalogStrict(options.packageRoot);

  const facts = new Map(envelope.facts.map((fact) => [fact.id, fact]));
  const evaluations: PackEvaluation[] = [];
  for (const pack of catalog.value.packs) {
    const evaluation = evaluatePack(pack, facts);
    if (evaluation !== null) evaluations.push(evaluation);
  }

  const selected = evaluations
    .filter((evaluation) => evaluation.status === "selected")
    .sort((left, right) => left.packId.localeCompare(right.packId));

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
    selected: selected.map((evaluation) => ({
      packId: evaluation.packId,
      status: evaluation.status,
      satisfied: evaluation.satisfied.map((leaf) => [leaf.factId, leaf.path]),
      failed: evaluation.failed.map((leaf) => [leaf.factId, leaf.reason]),
    })),
  };

  return {
    schemaVersion: 1,
    scope: {
      canonicalRoot: scope.root,
      rootReason: scope.reason,
      projectId: scope.projectId,
      subProjectPath: null,
    },
    selected,
    inputsDigest,
    evidenceDigest,
    planDigest: reviewedDigest("project-capability-plan", digestableView),
  };
}
