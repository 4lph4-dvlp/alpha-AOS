import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { RedactionContext, SupportBundlePlan, SupportBundleSource } from "../types.js";
import { aliasPath, packageRoot, userStateRoot } from "./paths.js";
import { createRedactedExcerpt, serializeObservable } from "./redaction.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import { applyFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";

/**
 * Content that is recovery material rather than diagnostic text. Its bytes are
 * never previewed — only alias path, size, hash and permissions — because a
 * snapshot is a verbatim copy of whatever the user's file contained.
 */
const OPAQUE_PREFIXES = ["snapshots/", "snapshot/"] as const;

function isOpaque(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  return OPAQUE_PREFIXES.some((prefix) => normalized.startsWith(prefix) || normalized.includes(`/${prefix}`));
}

/**
 * Produces a deterministic, non-mutating description of what a support bundle
 * would contain. This function performs no write and opens no network
 * connection: creating the artifact is a separate, explicit user action.
 */
export async function planSupportBundle(options: {
  sources: ReadonlyArray<{ path: string; label: string }>;
  destination: string;
  context: RedactionContext;
}): Promise<SupportBundlePlan> {
  const sources: SupportBundleSource[] = [];

  for (const entry of [...options.sources].sort((left, right) => left.path.localeCompare(right.path))) {
    const absolute = resolve(entry.path);
    if (!existsSync(absolute)) {
      sources.push({
        label: entry.label,
        aliasPath: aliasPath(absolute, options.context.aliases),
        byteLength: 0,
        sha256: null,
        mode: null,
        opaque: false,
        preview: null,
        missing: true,
      });
      continue;
    }

    const info = await stat(absolute);
    const bytes = await readFile(absolute);
    const opaque = isOpaque(entry.label);
    sources.push({
      label: entry.label,
      aliasPath: aliasPath(absolute, options.context.aliases),
      byteLength: info.size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      mode: (info.mode & 0o777).toString(8).padStart(3, "0"),
      opaque,
      // Opaque sources contribute metadata only. Everything else is redacted
      // before it can become part of a preview.
      preview: opaque ? null : createRedactedExcerpt(bytes.toString("utf8"), options.context),
      missing: false,
    });
  }

  const plan: SupportBundlePlan = {
    schemaVersion: 1,
    destination: aliasPath(resolve(options.destination), options.context.aliases),
    createdBy: "alpha-aos support",
    // Stated so no reader has to infer it from the absence of a network call.
    network: "none",
    sources,
    planDigest: "",
  };

  // The digest binds every source hash and the destination intent, so a plan
  // reviewed by a user cannot be applied against different bytes.
  const canonical = JSON.stringify({
    destination: plan.destination,
    network: plan.network,
    sources: sources.map((source) => ({ label: source.label, sha256: source.sha256, byteLength: source.byteLength })),
  });
  plan.planDigest = createHash("sha256").update(canonical, "utf8").digest("hex");
  return plan;
}

/**
 * Renders the reviewed plan into the exact bytes a local support artifact
 * would contain. Rendering is deterministic and still writes nothing; the
 * caller decides whether those bytes reach the filesystem.
 */
export function renderSupportBundleBytes(plan: SupportBundlePlan, context: RedactionContext): Uint8Array {
  const envelope = serializeObservable(plan, context);
  return Buffer.from(`${envelope.text}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Complete operation plan
// ---------------------------------------------------------------------------

export interface SupportBundleOperationPlan {
  kind: "support-bundle";
  stateRoot: string;
  /** Absolute local destination. There is no remote one. */
  destination: string;
  allowedRoots: readonly string[];
  /** Absolute paths of every diagnostic source, in the order they were bound. */
  sourcePaths: readonly string[];
  /** The reviewable, already-redacted content. */
  bundle: SupportBundlePlan;
  /** Hash of the exact bytes the apply would write. */
  renderedHash: string;
  proofs: OperationPathProofSet;
  digest: string;
}

export interface SupportBundleOptions {
  sources: ReadonlyArray<{ path: string; label: string }>;
  destination: string;
  context: RedactionContext;
  stateRoot?: string;
  packageRoot?: string;
}

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Binds every diagnostic source, the local destination and the exact bytes the
 * artifact would contain into one reviewable digest. Reads only; there is no
 * upload destination and no network step anywhere in this module.
 */
export async function planSupportBundleOperation(options: SupportBundleOptions): Promise<SupportBundleOperationPlan> {
  const destination = resolve(options.destination);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const ownRoot = resolve(options.packageRoot ?? packageRoot());
  const bundle = await planSupportBundle(options);
  const rendered = renderSupportBundleBytes(bundle, options.context);
  const sourcePaths = [...options.sources]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((entry) => resolve(entry.path));

  const allowedRoots = [dirname(destination), stateRoot, ownRoot];
  const inputs: OperationPathInput[] = [
    { role: "target", path: destination },
    { role: "temp", path: dirname(destination) },
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
    { role: "package-root", path: ownRoot },
    ...sourcePaths.map((path): OperationPathInput => ({ role: "source", path })),
  ];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: ["target", "temp", "state", "journal", "snapshot", "source", "package-root"],
  });

  const renderedHash = sha256(rendered);
  const digest = reviewedDigest("support-bundle", {
    destination: bundle.destination,
    stateRoot,
    allowedRoots,
    network: bundle.network,
    // Source metadata only: hashes, sizes and permissions, never bytes.
    sources: bundle.sources.map((source) => ({
      label: source.label,
      aliasPath: source.aliasPath,
      sha256: source.sha256,
      byteLength: source.byteLength,
      mode: source.mode,
      opaque: source.opaque,
      missing: source.missing,
    })),
    bundleDigest: bundle.planDigest,
    renderedHash,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "support-bundle",
    stateRoot,
    destination,
    allowedRoots,
    sourcePaths,
    bundle,
    renderedHash,
    proofs,
    digest,
  };
}

export interface SupportBundleApplyOptions extends SupportBundleOptions {
  plan?: SupportBundleOperationPlan;
  session?: MutationSession;
}

/**
 * Writes the reviewed artifact to its local destination through the shared
 * transaction. Every source is rechecked immediately before it is read, and
 * the rendered bytes must still hash to what review saw.
 */
export async function applySupportBundle(options: SupportBundleApplyOptions): Promise<{
  operationId: string;
  destination: string;
  digest: string;
  plan: SupportBundleOperationPlan;
}> {
  const reviewed = options.plan ?? await planSupportBundleOperation(options);
  const revalidated = await planSupportBundleOperation({
    sources: options.sources,
    destination: reviewed.destination,
    context: options.context,
    stateRoot: reviewed.stateRoot,
  });
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(reviewed, options.session, async (session) => {
    for (const path of reviewed.sourcePaths) {
      await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "source", path));
    }
    await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "target", reviewed.destination));

    const rendered = renderSupportBundleBytes(revalidated.bundle, options.context);
    if (sha256(rendered) !== reviewed.renderedHash) {
      throw new ComponentPlanError("plan-drift", "The support bundle content changed between review and apply");
    }
    const journal = await applyFileTransaction({
      stateRoot: reviewed.stateRoot,
      allowedRoots: [dirname(reviewed.destination)],
      operations: [{ target: reviewed.destination, content: rendered }],
      session,
    });
    return { operationId: journal.id, destination: reviewed.destination, digest: reviewed.digest, plan: reviewed };
  });
}

/**
 * The diagnostic sources a support bundle draws on: the operation evidence
 * this tool wrote itself, plus its own lock and catalog. Nothing outside the
 * state root and the package root is collected, and snapshot payloads are
 * labelled so they stay opaque.
 */
export async function collectSupportSources(stateRoot: string, packageDirectory: string): Promise<Array<{ path: string; label: string }>> {
  const sources: Array<{ path: string; label: string }> = [];
  const root = resolve(stateRoot);

  for (const relative of ["writer.lock", "install-state.json"]) {
    sources.push({ path: join(root, relative), label: relative });
  }
  for (const directory of ["journal", "bootstrap"]) {
    const absolute = join(root, directory);
    if (!existsSync(absolute)) continue;
    for (const name of (await readdir(absolute)).filter((entry) => entry.endsWith(".json")).sort()) {
      sources.push({ path: join(absolute, name), label: `${directory}/${name}` });
    }
  }
  // Snapshot bytes are a verbatim copy of the user's file. They are listed so
  // their metadata is reviewable, and the `snapshots/` label keeps them opaque.
  const snapshotRoot = join(root, "snapshots");
  if (existsSync(snapshotRoot)) {
    for (const operation of (await readdir(snapshotRoot)).sort()) {
      const directory = join(snapshotRoot, operation);
      if (!existsSync(directory)) continue;
      for (const name of (await readdir(directory).catch(() => [] as string[])).sort()) {
        sources.push({ path: join(directory, name), label: `snapshots/${operation}/${name}` });
      }
    }
  }
  for (const relative of [join("catalog", "stack.lock.json"), join("catalog", "stack.yaml")]) {
    sources.push({ path: join(resolve(packageDirectory), relative), label: relative.replaceAll("\\", "/") });
  }
  return sources;
}
