import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { applyManagedInstall, createManagedInstallOperationPlan, nodeRuntimeEnvironment, type ManagedInstallOperationPlan, type ManagedInstallOptions, type ManagedInstallResult } from "./install.js";
import { userStateRoot } from "./paths.js";
import { describeProcessFailure } from "./install.js";
import { resolveCommand, resolveNodePackageCli, runProcess, type ProcessSpec } from "./process.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import { applyFileTransaction } from "./transaction.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  declaredEnvironmentNames,
  declaredProcessSpec,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";

/**
 * The wrapper scripts used to run `git pull`, `npm ci`, `npm run build` and
 * `npm link` before anything had been reviewed, and before any writer existed.
 * This module is where that work moves: one read-only plan that names every
 * child and every path it may touch, and one apply that acquires a single
 * session before the first of them runs.
 */

export type BootstrapKind = "install" | "update";

/**
 * The record a build writes beside its output, naming the exact inputs it was
 * produced from and the exact files it produced. Written by
 * `scripts/build-artifact.mjs`; only verified here.
 */
export interface BuildArtifactManifest {
  schemaVersion: 1;
  generatedAt: string;
  /** Repo-relative path to sha256, for every file the build consumed. */
  inputs: Record<string, string>;
  /** Repo-relative path to sha256, for every file the build emitted. */
  outputs: Record<string, string>;
}

export const BUILD_ARTIFACT_MANIFEST = join("dist", "build-artifact.json");

export interface BuildArtifactInspection {
  manifestPath: string;
  present: boolean;
  /** Null when absent or unreadable. */
  manifest: BuildArtifactManifest | null;
  /** Repo-relative paths whose bytes no longer match the manifest. */
  changedInputs: string[];
  changedOutputs: string[];
  missing: string[];
  /** True only for a present manifest whose inputs and outputs all match. */
  verified: boolean;
  /** Hash of the manifest document itself. */
  manifestHash: string | null;
}

async function sha256File(path: string): Promise<string | null> {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isManifest(value: unknown): value is BuildArtifactManifest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || typeof record.generatedAt !== "string") return false;
  for (const key of ["inputs", "outputs"] as const) {
    const table = record[key];
    if (typeof table !== "object" || table === null || Array.isArray(table)) return false;
    for (const entry of Object.values(table as Record<string, unknown>)) {
      if (typeof entry !== "string" || !/^[0-9a-f]{64}$/u.test(entry)) return false;
    }
  }
  return true;
}

/**
 * Verifies an existing build against the manifest that describes it. Nothing
 * is built here: a wrapper that has no verified artifact is refused rather
 * than quietly rebuilt.
 */
export async function inspectBuildArtifact(root: string): Promise<BuildArtifactInspection> {
  const manifestPath = join(resolve(root), BUILD_ARTIFACT_MANIFEST);
  const absent: BuildArtifactInspection = {
    manifestPath,
    present: false,
    manifest: null,
    changedInputs: [],
    changedOutputs: [],
    missing: [],
    verified: false,
    manifestHash: null,
  };
  if (!existsSync(manifestPath)) return absent;

  const text = await readFile(manifestPath, "utf8").catch(() => null);
  if (text === null) return { ...absent, present: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ...absent, present: true, manifestHash: sha256(text) };
  }
  if (!isManifest(parsed)) return { ...absent, present: true, manifestHash: sha256(text) };

  const changedInputs: string[] = [];
  const changedOutputs: string[] = [];
  const missing: string[] = [];
  for (const [group, table] of [["inputs", parsed.inputs], ["outputs", parsed.outputs]] as const) {
    for (const [relative, expected] of Object.entries(table)) {
      const actual = await sha256File(join(resolve(root), relative));
      if (actual === null) missing.push(relative);
      else if (actual !== expected) (group === "inputs" ? changedInputs : changedOutputs).push(relative);
    }
  }

  return {
    manifestPath,
    present: true,
    manifest: parsed,
    changedInputs: changedInputs.sort(),
    changedOutputs: changedOutputs.sort(),
    missing: missing.sort(),
    verified: changedInputs.length === 0 && changedOutputs.length === 0 && missing.length === 0,
    manifestHash: sha256(text),
  };
}

// ---------------------------------------------------------------------------
// Checkout inspection
// ---------------------------------------------------------------------------

export interface CheckoutInspection {
  gitDir: string;
  head: string | null;
  dirty: boolean | null;
  remote: string;
  ref: string;
  /** The OID `git ls-remote` reported for the configured remote and ref. */
  targetOid: string | null;
  /** Whether that object can be read here without changing the object store. */
  targetObjectPresent: boolean;
  /** Whether HEAD is an ancestor of the target, so the move is a fast-forward. */
  fastForward: boolean | null;
}

async function git(root: string, args: string[], timeoutMs = 60_000): Promise<{ ok: boolean; out: string }> {
  const command = resolveCommand("git");
  if (!command) return { ok: false, out: "" };
  const result = await runProcess({
    executable: command,
    args,
    cwd: resolve(root),
    timeoutMs,
    maxOutputBytes: 256 * 1024,
    environment: nodeRuntimeEnvironment({ extraNames: ["GIT_SSH_COMMAND", "SSH_AUTH_SOCK", "GIT_TERMINAL_PROMPT"] }),
  });
  return { ok: result.code === "ok", out: result.stdout.excerpt.trim() };
}

/**
 * Reads everything an update needs to know about the checkout, changing
 * nothing. `ls-remote` is a query; the target object is only accepted if it is
 * already readable here, because fetching it would mutate the object store
 * before the plan has been reviewed.
 */
export async function inspectCheckout(root: string, options: { remote?: string; ref?: string } = {}): Promise<CheckoutInspection> {
  const remote = options.remote ?? "origin";
  const ref = options.ref ?? "HEAD";
  const gitDir = join(resolve(root), ".git");

  const head = await git(root, ["rev-parse", "HEAD"]);
  const status = await git(root, ["status", "--porcelain"]);
  const remoteRefs = await git(root, ["ls-remote", remote, ref], 120_000);
  const targetOid = remoteRefs.ok ? remoteRefs.out.split(/\s+/u)[0] ?? null : null;

  let targetObjectPresent = false;
  let fastForward: boolean | null = null;
  if (targetOid && /^[0-9a-f]{40}$/u.test(targetOid)) {
    targetObjectPresent = (await git(root, ["cat-file", "-e", `${targetOid}^{commit}`])).ok;
    if (targetObjectPresent && head.ok) {
      fastForward = (await git(root, ["merge-base", "--is-ancestor", head.out, targetOid])).ok;
    }
  }

  return {
    gitDir,
    head: head.ok ? head.out : null,
    dirty: status.ok ? status.out.length > 0 : null,
    remote,
    ref,
    targetOid: targetOid && /^[0-9a-f]{40}$/u.test(targetOid) ? targetOid : null,
    targetObjectPresent,
    fastForward,
  };
}

// ---------------------------------------------------------------------------
// The reviewed plan
// ---------------------------------------------------------------------------

export type BootstrapStepId = "git-merge-ff-only" | "npm-ci" | "npm-build" | "npm-link";
export type BootstrapEffect = "checkout" | "packages" | "artifact" | "link";

export interface BootstrapExternalStep {
  id: BootstrapStepId;
  effect: BootstrapEffect;
  /** Declared before it runs, so review sees the exact child and arguments. */
  spec: ProcessSpec;
}

export interface BootstrapOperationPlan {
  kind: "bootstrap";
  operation: BootstrapKind;
  root: string;
  stateRoot: string;
  allowedRoots: readonly string[];
  artifact: BuildArtifactInspection;
  packages: { lockPath: string; lockHash: string | null; nodeModulesPresent: boolean };
  link: { skipped: boolean };
  /** Null for an install, which does not move the checkout. */
  checkout: CheckoutInspection | null;
  external: readonly BootstrapExternalStep[];
  /** The managed reconcile this bootstrap ends with, when one was requested. */
  managed: ManagedInstallOperationPlan | null;
  environmentNames: readonly string[];
  /** Non-empty means apply refuses. Every reason is stable and reviewable. */
  blockedReasons: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
}

export interface BootstrapPlanOptions {
  operation: BootstrapKind;
  root: string;
  stateRoot?: string;
  /** Skips the global link step, the way `install.sh --skip-link` did. */
  skipLink?: boolean;
  remote?: string;
  ref?: string;
  /** Supplying these embeds the managed reconcile in the same reviewed plan. */
  managed?: Omit<ManagedInstallOptions, "root" | "stateRoot">;
}

function npmSpec(root: string, args: string[], timeoutMs: number): ProcessSpec {
  const npm = resolveNodePackageCli("npm");
  return declaredProcessSpec({
    executable: npm.executable,
    args: [...npm.argsPrefix, ...args],
    cwd: resolve(root),
    timeoutMs,
    maxOutputBytes: 256 * 1024,
    environment: nodeRuntimeEnvironment(),
  });
}

/**
 * Enumerates every path and child a wrapper operation may touch, and reads
 * enough of the checkout, package lock and build artifact to bind them.
 * Creates nothing, runs no mutating child, and is digest-stable.
 */
export async function createBootstrapOperationPlan(options: BootstrapPlanOptions): Promise<BootstrapOperationPlan> {
  const root = resolve(options.root);
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const skipLink = options.skipLink ?? false;
  const artifact = await inspectBuildArtifact(root);
  const lockPath = join(root, "package-lock.json");
  const packages = {
    lockPath,
    lockHash: await sha256File(lockPath),
    nodeModulesPresent: existsSync(join(root, "node_modules")),
  };
  const checkout = options.operation === "update"
    ? await inspectCheckout(root, {
      ...(options.remote === undefined ? {} : { remote: options.remote }),
      ...(options.ref === undefined ? {} : { ref: options.ref }),
    })
    : null;

  const external: BootstrapExternalStep[] = [];
  if (checkout?.targetOid) {
    const command = resolveCommand("git");
    if (command) {
      external.push({
        id: "git-merge-ff-only",
        effect: "checkout",
        spec: declaredProcessSpec({
          executable: command,
          // The exact object identity is bound here, so the step cannot follow
          // a ref that moved between review and apply.
          args: ["merge", "--ff-only", checkout.targetOid],
          cwd: root,
          timeoutMs: 120_000,
          maxOutputBytes: 256 * 1024,
          environment: nodeRuntimeEnvironment({ extraNames: ["GIT_SSH_COMMAND", "SSH_AUTH_SOCK", "GIT_TERMINAL_PROMPT"] }),
        }),
      });
    }
  }
  external.push({ id: "npm-ci", effect: "packages", spec: npmSpec(root, ["ci"], 600_000) });
  external.push({ id: "npm-build", effect: "artifact", spec: npmSpec(root, ["run", "build"], 600_000) });
  if (!skipLink) external.push({ id: "npm-link", effect: "link", spec: npmSpec(root, ["link"], 300_000) });

  const managed = options.managed
    ? await createManagedInstallOperationPlan({ ...options.managed, root, stateRoot })
    : null;

  const evidenceRoot = join(stateRoot, "bootstrap");
  const inputs: OperationPathInput[] = [
    { role: "package-root", path: root },
    { role: "source", path: lockPath },
    { role: "source", path: artifact.manifestPath },
    { role: "temp", path: join(root, "node_modules") },
    { role: "target", path: join(evidenceRoot, "pending.json") },
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
  ];
  if (checkout !== null) inputs.push({ role: "source", path: checkout.gitDir });
  const allowedRoots = [root, stateRoot];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: ["target", "state", "journal", "snapshot", "source", "package-root", "temp"],
  });

  const blockedReasons: string[] = [];
  if (!artifact.present) {
    blockedReasons.push(`no build artifact manifest at ${BUILD_ARTIFACT_MANIFEST}; build the package before installing or updating`);
  } else if (artifact.manifest === null) {
    blockedReasons.push("the build artifact manifest is malformed or from an unknown version");
  } else if (!artifact.verified) {
    const detail = [
      artifact.missing.length > 0 ? `${artifact.missing.length} missing` : null,
      artifact.changedInputs.length > 0 ? `${artifact.changedInputs.length} changed inputs` : null,
      artifact.changedOutputs.length > 0 ? `${artifact.changedOutputs.length} changed outputs` : null,
    ].filter(Boolean).join(", ");
    blockedReasons.push(`the build artifact does not match its manifest (${detail})`);
  }
  if (packages.lockHash === null) blockedReasons.push("package-lock.json is missing, so the package set cannot be bound");
  if (!proofs.proven) blockedReasons.push(`path boundary refused: ${proofs.code} — ${proofs.detail ?? "no detail"}`);
  if (checkout !== null) {
    if (checkout.head === null) blockedReasons.push("the checkout HEAD could not be read");
    if (checkout.dirty === null) blockedReasons.push("the checkout status could not be read");
    else if (checkout.dirty) blockedReasons.push("the checkout has uncommitted changes; commit or stash them first");
    if (checkout.targetOid === null) {
      blockedReasons.push(`the target commit for ${checkout.remote}/${checkout.ref} could not be resolved`);
    } else if (!checkout.targetObjectPresent) {
      // Fetching it would change the object store before this plan is
      // reviewed, so the honest answer is to stop and say what is needed.
      blockedReasons.push(`the target commit ${checkout.targetOid.slice(0, 12)} is not present locally; run git fetch and review the plan again`);
    } else if (checkout.fastForward === false) {
      blockedReasons.push("the target commit is not a fast-forward from HEAD");
    }
  }
  if (managed !== null && managed.install.targets.length === 0) blockedReasons.push("no install target was selected");

  const environmentNames = declaredEnvironmentNames(nodeRuntimeEnvironment());
  const digest = reviewedDigest("bootstrap", {
    operation: options.operation,
    root,
    stateRoot,
    allowedRoots,
    skipLink,
    artifact: {
      manifestPath: artifact.manifestPath,
      present: artifact.present,
      verified: artifact.verified,
      manifestHash: artifact.manifestHash,
      changedInputs: artifact.changedInputs,
      changedOutputs: artifact.changedOutputs,
      missing: artifact.missing,
    },
    packages,
    checkout,
    external,
    managed: managed?.digest ?? null,
    environmentNames,
    blockedReasons,
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "bootstrap",
    operation: options.operation,
    root,
    stateRoot,
    allowedRoots,
    artifact,
    packages,
    link: { skipped: skipLink },
    checkout,
    external,
    managed,
    environmentNames,
    blockedReasons,
    proofs,
    digest,
  };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export class BootstrapRefusal extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(`Bootstrap refused: ${reasons.join("; ")}`);
    this.name = "BootstrapRefusal";
    this.reasons = reasons;
  }
}

/**
 * What an external step is observed to have done. `unknown` is a real answer:
 * a step whose effect cannot be read back is not reported as either applied or
 * rolled back.
 */
export type ExternalObservation = "changed" | "unchanged" | "unknown";

export interface BootstrapStepEvidence {
  id: BootstrapStepId;
  effect: BootstrapEffect;
  status: "planned" | "ran" | "failed" | "skipped";
  before: string | null;
  after: string | null;
  observation: ExternalObservation;
  /** Coded failure text: fingerprints and exit metadata, never raw output. */
  detail: string | null;
}

export interface BootstrapEvidence {
  schemaVersion: 1;
  operationId: string;
  operation: BootstrapKind;
  root: string;
  planDigest: string;
  startedAt: string;
  finishedAt: string | null;
  steps: BootstrapStepEvidence[];
  /** Set only when the managed reconcile ran. */
  managed: { applied: string[]; current: string[]; operationIds: string[]; externalChanges: string[] } | null;
  /** Guidance a human can act on, coded rather than free-form. */
  recovery: string[];
}

/** Reads the observable state an effect changes, or null when it cannot be read. */
async function observe(plan: BootstrapOperationPlan, effect: BootstrapEffect): Promise<string | null> {
  switch (effect) {
    case "checkout": {
      const head = await git(plan.root, ["rev-parse", "HEAD"]);
      return head.ok ? head.out : null;
    }
    case "packages":
      return existsSync(join(plan.root, "node_modules")) ? await sha256File(plan.packages.lockPath) : null;
    case "artifact": {
      const inspection = await inspectBuildArtifact(plan.root);
      return inspection.manifestHash;
    }
    case "link": {
      const npm = resolveNodePackageCli("npm");
      const result = await runProcess({
        executable: npm.executable,
        args: [...npm.argsPrefix, "root", "--global"],
        cwd: plan.root,
        timeoutMs: 60_000,
        maxOutputBytes: 64 * 1024,
        environment: nodeRuntimeEnvironment(),
      });
      if (result.code !== "ok") return null;
      const target = join(result.stdout.excerpt.trim(), "alpha-aos");
      return existsSync(target) ? "present" : "absent";
    }
  }
}

function evidencePath(stateRoot: string, operationId: string): string {
  return join(stateRoot, "bootstrap", `${operationId}.json`);
}

/** Writes the running record through the transaction, so intent is durable. */
async function recordEvidence(plan: BootstrapOperationPlan, session: MutationSession, evidence: BootstrapEvidence): Promise<void> {
  await applyFileTransaction({
    stateRoot: plan.stateRoot,
    allowedRoots: [join(plan.stateRoot, "bootstrap")],
    operations: [{ target: evidencePath(plan.stateRoot, evidence.operationId), content: `${JSON.stringify(evidence, null, 2)}\n` }],
    session,
  });
}

export interface BootstrapResult {
  operationId: string;
  evidence: BootstrapEvidence;
  managed: ManagedInstallResult | null;
  plan: BootstrapOperationPlan;
}

/**
 * Runs a reviewed wrapper operation under exactly one writer.
 *
 * The session is acquired before the first external child, so nothing in the
 * checkout, the package set, the build output or the global link changes
 * before the operation owns the state root. Each step records its observed
 * before and after state; a step whose effect cannot be read back is recorded
 * as `unknown` and never described as rolled back.
 */
export async function applyBootstrapOperation(
  reviewed: BootstrapOperationPlan,
  options: { managed?: Omit<ManagedInstallOptions, "root" | "stateRoot">; session?: MutationSession } = {},
): Promise<BootstrapResult> {
  if (reviewed.blockedReasons.length > 0) throw new BootstrapRefusal(reviewed.blockedReasons);

  // The whole plan is re-read before anything is acquired or run.
  const revalidated = await createBootstrapOperationPlan({
    operation: reviewed.operation,
    root: reviewed.root,
    stateRoot: reviewed.stateRoot,
    skipLink: reviewed.link.skipped,
    ...(reviewed.checkout === null ? {} : { remote: reviewed.checkout.remote, ref: reviewed.checkout.ref }),
    ...(options.managed === undefined ? {} : {
      // The reviewed fixture locations are reused, so re-reading the aggregate
      // produces the same digest rather than naming fresh temp directories.
      managed: { ...options.managed, ...(reviewed.managed === null ? {} : { fixtureRoots: reviewed.managed.fixtureRoots }) },
    }),
  });
  assertPlanUnchanged(reviewed, revalidated);

  return withComponentSession(
    { kind: "bootstrap", stateRoot: reviewed.stateRoot, proofs: reviewed.proofs, digest: reviewed.digest },
    options.session,
    async (session) => {
      const evidence: BootstrapEvidence = {
        schemaVersion: 1,
        operationId: session.operationId,
        operation: reviewed.operation,
        root: reviewed.root,
        planDigest: reviewed.digest,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        steps: reviewed.external.map((step) => ({
          id: step.id,
          effect: step.effect,
          status: "planned" as const,
          before: null,
          after: null,
          observation: "unknown" as const,
          detail: null,
        })),
        managed: null,
        recovery: [],
      };
      // Intent is durable before the first child runs.
      await recordEvidence(reviewed, session, evidence);

      let managed: ManagedInstallResult | null = null;
      try {
        for (const [index, step] of reviewed.external.entries()) {
          const record = evidence.steps[index] as BootstrapStepEvidence;
          record.before = await observe(reviewed, step.effect);
          const result = await runProcess({ ...step.spec, environment: nodeRuntimeEnvironment(step.id === "git-merge-ff-only" ? { extraNames: ["GIT_SSH_COMMAND", "SSH_AUTH_SOCK", "GIT_TERMINAL_PROMPT"] } : {}) });
          record.after = await observe(reviewed, step.effect);
          record.observation = record.before === null || record.after === null
            ? "unknown"
            : record.before === record.after ? "unchanged" : "changed";
          if (result.code !== "ok") {
            record.status = "failed";
            record.detail = describeProcessFailure(step.id, result);
            await recordEvidence(reviewed, session, evidence);
            throw new Error(record.detail);
          }
          record.status = "ran";
          await recordEvidence(reviewed, session, evidence);
        }

        if (reviewed.managed !== null && options.managed !== undefined) {
          managed = await applyManagedInstall({
            ...options.managed,
            root: reviewed.root,
            stateRoot: reviewed.stateRoot,
            fixtureRoots: reviewed.managed.fixtureRoots,
            plan: reviewed.managed,
            session,
          });
          evidence.managed = {
            applied: managed.applied,
            current: managed.current,
            operationIds: managed.operationIds,
            externalChanges: managed.externalChanges,
          };
        }

        evidence.finishedAt = new Date().toISOString();
        await recordEvidence(reviewed, session, evidence);
        return { operationId: session.operationId, evidence, managed, plan: reviewed };
      } catch (error) {
        // Only what the observations prove is claimed. A checkout, package set
        // or global link that moved stays moved, and says so.
        evidence.recovery = describeRecovery(evidence);
        evidence.finishedAt = new Date().toISOString();
        await recordEvidence(reviewed, session, evidence).catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${message} ${evidence.recovery.join(" ")}`.trim());
      }
    },
  );
}

/**
 * Turns observations into guidance without overstating them. A step that
 * changed something external is reported as still changed, because this
 * operation has no proven inverse for it.
 */
export function describeRecovery(evidence: BootstrapEvidence): string[] {
  const lines: string[] = [];
  for (const step of evidence.steps) {
    if (step.status === "planned" || step.status === "skipped") continue;
    if (step.observation === "changed") {
      lines.push(`${step.effect} was changed by ${step.id} and is not rolled back (${step.before ?? "unknown"} -> ${step.after ?? "unknown"}).`);
    } else if (step.observation === "unknown") {
      lines.push(`${step.effect} could not be read back after ${step.id}; its state is unknown.`);
    }
  }
  if (evidence.managed?.externalChanges.length) {
    lines.push(`External managed changes retained: ${evidence.managed.externalChanges.join(", ")}.`);
  }
  lines.push(`Durable evidence: ${evidence.operationId}.`);
  return lines;
}
