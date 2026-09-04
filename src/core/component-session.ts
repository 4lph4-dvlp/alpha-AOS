import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  recheckPathProof,
  type OperationPathProofSet,
  type OperationPathRole,
  type PathProof,
} from "./path-boundary.js";
import { acquireMutationSession, type MutationSession } from "./writer-lock.js";
import type { EnvironmentPolicy, ProcessSpec } from "./process.js";

/**
 * A component mutator is reachable two ways: on its own from the CLI, and as
 * a callee inside a larger install operation. Both must behave identically —
 * one reviewed plan, one writer, no path discovered after review — so the
 * contract lives here rather than being restated by each component.
 */

export type ComponentPlanCode =
  | "plan-incomplete"
  | "plan-drift"
  | "unplanned-path"
  | "boundary-changed"
  | "source-drift"
  | "session-mismatch";

export class ComponentPlanError extends Error {
  readonly code: ComponentPlanCode;
  constructor(code: ComponentPlanCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ComponentPlanError";
    this.code = code;
  }
}

/** The part of any reviewed plan that path lookups and rechecks need. */
export interface ReviewedPlanBoundary {
  /** Names the operation, so a refusal says which plan refused. */
  readonly kind: string;
  readonly proofs: OperationPathProofSet;
  /** Stable over the plan's reviewable content, so review can be rechecked. */
  readonly digest: string;
}

/** The part of a component plan this contract needs to reason about. */
export interface ReviewedComponentPlan extends ReviewedPlanBoundary {
  readonly stateRoot: string;
}

/**
 * A fixture writes only inside a throwaway root it names in advance, so it
 * needs no state root — but it must not touch the disk before the operation
 * that authorized it owns a writer.
 */
export interface ReviewedFixturePlan extends ReviewedPlanBoundary {
  readonly fixtureRoot: string;
}

/**
 * Digest of everything a reviewer would look at. Recomputing a plan and
 * comparing this value is how apply proves nothing moved since review.
 */
export function reviewedDigest(kind: string, content: unknown): string {
  return createHash("sha256").update(`${kind}\n${JSON.stringify(content)}`, "utf8").digest("hex");
}

/**
 * Strips a spec down to what can be reviewed and digested. `source` carries
 * the ambient environment, which is neither stable nor safe to record.
 */
export function declaredProcessSpec(spec: ProcessSpec): ProcessSpec {
  const { environment, ...rest } = spec;
  if (environment === undefined) return rest;
  const declared: EnvironmentPolicy = {};
  if (environment.required !== undefined) declared.required = environment.required;
  if (environment.optional !== undefined) declared.optional = environment.optional;
  if (environment.literal !== undefined) declared.literal = environment.literal;
  return { ...rest, environment: declared };
}

/** The names a child may receive, without reading any of their values. */
export function declaredEnvironmentNames(policy: EnvironmentPolicy): string[] {
  return [...new Set([
    ...(policy.required ?? []),
    ...(policy.optional ?? []),
    ...Object.keys(policy.literal ?? {}),
  ])].sort();
}

/**
 * Returns the proof that authorized a path. An apply step that reaches for a
 * path the plan never proved is refused here rather than proving it late.
 */
export function plannedProof(plan: ReviewedPlanBoundary, role: OperationPathRole, path: string): PathProof {
  const configured = resolve(path);
  const proof = plan.proofs.proofs.find((entry) => entry.role === role && entry.configured === configured);
  if (proof === undefined || !proof.proven) {
    throw new ComponentPlanError("unplanned-path", `${plan.kind} did not prove ${role} ${configured} before apply`);
  }
  return proof;
}

/** Re-reads the ancestor chain immediately before the path is read or written. */
export async function assertUnchangedSincePlan(plan: ReviewedPlanBoundary, proof: PathProof): Promise<void> {
  const recheck = await recheckPathProof(proof);
  if (!recheck.ok) {
    throw new ComponentPlanError(
      "boundary-changed",
      `${plan.kind} ${proof.role} ${proof.configured} changed since it was proven: ${recheck.code} — ${recheck.detail ?? "no detail"}`,
    );
  }
}

/** Refuses when a re-read of the same inputs no longer produces the reviewed plan. */
export function assertPlanUnchanged(reviewed: ReviewedPlanBoundary, revalidated: ReviewedPlanBoundary): void {
  if (revalidated.digest !== reviewed.digest) {
    throw new ComponentPlanError(
      "plan-drift",
      `${reviewed.kind} changed between review and apply: reviewed ${reviewed.digest.slice(0, 12)}, observed ${revalidated.digest.slice(0, 12)}`,
    );
  }
}

/**
 * Runs a component's mutation under exactly one writer.
 *
 * Standalone, the component acquires the session itself and releases it.
 * Nested, it consumes the caller's session and takes no second lock — the
 * writer lock is exclusive-create, so a second acquisition would not merely
 * be wasteful, it would deadlock the operation against itself.
 */
export async function withComponentSession<T>(
  plan: ReviewedComponentPlan,
  caller: MutationSession | undefined,
  run: (session: MutationSession) => Promise<T>,
): Promise<T> {
  if (!plan.proofs.proven) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${plan.kind} path proof is incomplete: ${plan.proofs.code} — ${plan.proofs.detail ?? "no detail"}`,
    );
  }

  if (caller !== undefined) {
    caller.assertOwned();
    if (resolve(caller.stateRoot) !== resolve(plan.stateRoot)) {
      throw new ComponentPlanError(
        "session-mismatch",
        `${plan.kind} plans against ${resolve(plan.stateRoot)} but the caller session owns ${resolve(caller.stateRoot)}`,
      );
    }
    return run(caller);
  }

  const session = await acquireMutationSession({
    stateRoot: plan.stateRoot,
    proofs: plan.proofs,
    planDigest: plan.digest,
  });
  try {
    return await run(session);
  } finally {
    await session.close();
  }
}

/**
 * Takes the fixture root a plan named, refusing a squatted location.
 *
 * The directory is created non-recursively, so `EEXIST` is the same
 * exclusive-create guarantee `mkdtemp` gave — with the path reviewed in
 * advance instead of discovered here. When the operation that authorized this
 * fixture holds a writer, that writer must already be open: no fixture may
 * touch the disk before the session that authorized it exists.
 */
export async function beginFixture(plan: ReviewedFixturePlan, session?: MutationSession): Promise<void> {
  if (!plan.proofs.proven) {
    throw new ComponentPlanError(
      "plan-incomplete",
      `${plan.kind} path proof is incomplete: ${plan.proofs.code} — ${plan.proofs.detail ?? "no detail"}`,
    );
  }
  session?.assertOwned();
  const proof = plannedProof(plan, "temp", plan.fixtureRoot);
  await assertUnchangedSincePlan(plan, proof);
  await mkdir(plan.fixtureRoot, { recursive: false, mode: 0o700 });
}

/** A reviewed, unique location under the system temp root for a fixture. */
export function plannedFixtureRoot(prefix: string): string {
  return resolve(join(tmpdir(), `${prefix}-${randomUUID()}`));
}
