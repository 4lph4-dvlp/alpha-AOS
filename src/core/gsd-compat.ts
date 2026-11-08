import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AdapterRetirementRecord, RedactedExcerpt, StackLock } from "../types.js";
import { userStateRoot } from "./paths.js";
import { resolveNodePackageCli, runProcess, type ProcessSpec } from "./process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "./install.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  ComponentPlanError,
  declaredEnvironmentNames,
  declaredProcessSpec,
  plannedProof,
  reviewedDigest,
  withComponentSession,
} from "./component-session.js";

/** SHA-256 of an empty stream, so an absent probe still reports a fingerprint. */
const EMPTY_STREAM_SHA256 = createHash("sha256").update("").digest("hex");
import { applyFileTransaction, rollbackFileTransaction } from "./transaction.js";

export const CODEX_HOOK_HELPERS = ["hook-exit.js", "cli-exit.js", "exit-code-registry.js"] as const;

export type CodexHookHelper = typeof CODEX_HOOK_HELPERS[number] | (string & {});

export interface CodexGsdHookCompatibilityPlan {
  configRoot: string;
  monitor: string;
  required: boolean;
  entries: Array<{
    file: CodexHookHelper;
    destination: string;
    action: "create" | "verify";
  }>;
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function packageInstallPath(root: string, packageName: string): string {
  return join(root, "node_modules", ...packageName.split("/"));
}

async function soleArchive(packRoot: string): Promise<string> {
  const files = (await readdir(packRoot, { withFileTypes: true })).filter((entry) => entry.isFile());
  const [entry] = files;
  if (files.length !== 1 || entry === undefined) {
    throw new ComponentPlanError("unplanned-path", `npm pack wrote ${files.length} files into the planned pack root; expected exactly one archive`);
  }
  return join(packRoot, entry.name);
}

async function tarballIntegrity(archive: string): Promise<string> {
  return `sha512-${createHash("sha512").update(await readFile(archive)).digest("base64")}`;
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

export function codexConfigRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  return resolve(env.CODEX_HOME?.trim() || join(home, ".codex"));
}

/** The one directory this operation may write into. */
function hookLibraryRoot(configRoot: string): string {
  return join(resolve(configRoot), "hooks", "lib");
}

/** Strips single-line and multi-line JS comments while preserving string literals. */
export function stripJsComments(source: string): string {
  return source.replace(/(["'`])(?:(?=(\\?))\2[\s\S])*?\1|\/\*[\s\S]*?\*\/|(?:\/\/.*$)/gm, (match) => {
    if (match.startsWith("/") || match.startsWith("#")) {
      return "";
    }
    return match;
  });
}

/**
 * Extracts static relative require and import specifiers from JS source.
 * Fails closed with ComponentPlanError("plan-incomplete", ...) if:
 * - Dynamic non-literal require/import expressions are detected (e.g. require('./lib/' + x)).
 * - Relative paths attempt directory traversal escape (..) outside bounds.
 */
export function extractLocalHookSpecifiers(source: string, originFile: string): string[] {
  const stripped = stripJsComments(source);
  const specifiers: string[] = [];

  // Match require(...)
  const requireRegex = /\brequire\s*\(([\s\S]*?)\)/g;
  let match: RegExpExecArray | null;
  while ((match = requireRegex.exec(stripped)) !== null) {
    const rawArg = match[1]?.trim() ?? "";
    const literalMatch = /^(['"`])(.*)\1$/.exec(rawArg);
    if (!literalMatch) {
      throw new ComponentPlanError(
        "plan-incomplete",
        `Dynamic non-literal require detected in ${originFile}: require(${rawArg})`,
      );
    }
    const spec = literalMatch[2];
    if (spec !== undefined && spec.startsWith(".")) {
      const normalized = spec.replace(/\\/g, "/");
      if (normalized.split("/").includes("..")) {
        throw new ComponentPlanError(
          "plan-incomplete",
          `Relative path traversal escape (..) detected in ${originFile}: ${spec}`,
        );
      }
      specifiers.push(spec);
    }
  }

  // Match import(...)
  const dynamicImportRegex = /\bimport\s*\(([\s\S]*?)\)/g;
  while ((match = dynamicImportRegex.exec(stripped)) !== null) {
    const rawArg = match[1]?.trim() ?? "";
    const literalMatch = /^(['"`])(.*)\1$/.exec(rawArg);
    if (!literalMatch) {
      throw new ComponentPlanError(
        "plan-incomplete",
        `Dynamic non-literal import detected in ${originFile}: import(${rawArg})`,
      );
    }
    const spec = literalMatch[2];
    if (spec !== undefined && spec.startsWith(".")) {
      const normalized = spec.replace(/\\/g, "/");
      if (normalized.split("/").includes("..")) {
        throw new ComponentPlanError(
          "plan-incomplete",
          `Relative path traversal escape (..) detected in ${originFile}: ${spec}`,
        );
      }
      specifiers.push(spec);
    }
  }

  // Match static import ... from '...'
  const staticImportRegex = /\bimport\s+(?:[\w*\s{},]*\s+from\s+)?(['"`])([^'"`]+)\1/g;
  while ((match = staticImportRegex.exec(stripped)) !== null) {
    const spec = match[2];
    if (spec !== undefined && spec.startsWith(".")) {
      const normalized = spec.replace(/\\/g, "/");
      if (normalized.split("/").includes("..")) {
        throw new ComponentPlanError(
          "plan-incomplete",
          `Relative path traversal escape (..) detected in ${originFile}: ${spec}`,
        );
      }
      specifiers.push(spec);
    }
  }

  return specifiers;
}

export interface CodexHookHelperClosureOptions {
  monitorPath: string;
  upstreamHooksLibRoot?: string | undefined;
  installedHooksLibRoot?: string | undefined;
}

export interface CodexHookHelperClosureResult {
  required: boolean;
  helpers: string[];
  missingInInstalled: string[];
}

/**
 * Traverses relative module references starting from gsd-context-monitor.js into hooks/lib/.
 * Fails closed if relative references escape hooks/lib or are missing from the verified upstream package.
 */
export async function discoverCodexHookHelperClosure(
  options: CodexHookHelperClosureOptions,
): Promise<CodexHookHelperClosureResult> {
  const { monitorPath, upstreamHooksLibRoot, installedHooksLibRoot } = options;
  if (!existsSync(monitorPath)) {
    return { required: false, helpers: [], missingInInstalled: [] };
  }

  const monitorContent = await readFile(monitorPath, "utf8");
  const initialSpecs = extractLocalHookSpecifiers(monitorContent, monitorPath);
  const monitorDir = dirname(resolve(monitorPath));
  const expectedLibRoot = join(monitorDir, "lib");

  const queue: string[] = [];
  const discovered = new Set<string>();

  for (const spec of initialSpecs) {
    const resolved = resolve(monitorDir, spec);
    if (!inside(expectedLibRoot, resolved)) {
      throw new ComponentPlanError(
        "plan-incomplete",
        `Hook specifier ${spec} resolves outside hooks/lib boundary: ${resolved}`,
      );
    }
    const helperName = relative(expectedLibRoot, resolved).replace(/\\/g, "/");
    if (!discovered.has(helperName)) {
      discovered.add(helperName);
      queue.push(helperName);
    }
  }

  while (queue.length > 0) {
    const currentHelper = queue.shift()!;
    let currentContent: string | null = null;
    let currentFile: string | null = null;

    if (upstreamHooksLibRoot) {
      currentFile = join(upstreamHooksLibRoot, currentHelper);
      if (!existsSync(currentFile)) {
        throw new ComponentPlanError(
          "plan-incomplete",
          `Referenced Codex hook helper does not exist in upstream package: ${currentHelper}`,
        );
      }
      currentContent = await readFile(currentFile, "utf8");
    } else if (installedHooksLibRoot) {
      currentFile = join(installedHooksLibRoot, currentHelper);
      if (existsSync(currentFile)) {
        currentContent = await readFile(currentFile, "utf8");
      }
    }

    if (currentContent && currentFile) {
      const helperDir = dirname(resolve(currentFile));
      const libRootToCheck = upstreamHooksLibRoot ?? installedHooksLibRoot ?? expectedLibRoot;
      const specs = extractLocalHookSpecifiers(currentContent, currentFile);
      for (const spec of specs) {
        const resolved = resolve(helperDir, spec);
        if (!inside(libRootToCheck, resolved)) {
          throw new ComponentPlanError(
            "plan-incomplete",
            `Helper ${currentHelper} references specifier ${spec} outside hooks/lib boundary: ${resolved}`,
          );
        }
        const childHelper = relative(libRootToCheck, resolved).replace(/\\/g, "/");
        if (!discovered.has(childHelper)) {
          discovered.add(childHelper);
          queue.push(childHelper);
        }
      }
    }
  }

  const helpers = Array.from(discovered).sort();
  const missingInInstalled: string[] = [];
  if (installedHooksLibRoot) {
    for (const h of helpers) {
      if (!existsSync(join(installedHooksLibRoot, h))) {
        missingInInstalled.push(h);
      }
    }
  }

  return {
    required: helpers.length > 0,
    helpers,
    missingInInstalled,
  };
}

export async function planCodexGsdHookCompatibility(
  configRoot = codexConfigRoot(),
  sourceRoot?: string,
): Promise<CodexGsdHookCompatibilityPlan> {
  const root = resolve(configRoot);
  const monitor = join(root, "hooks", "gsd-context-monitor.js");
  const installedLibRoot = hookLibraryRoot(root);

  const closure = await discoverCodexHookHelperClosure({
    monitorPath: monitor,
    upstreamHooksLibRoot: sourceRoot && existsSync(sourceRoot) ? sourceRoot : undefined,
    installedHooksLibRoot: installedLibRoot,
  });

  const helpersSet = new Set(closure.helpers);
  if (helpersSet.has("hook-exit.js")) {
    for (const h of CODEX_HOOK_HELPERS) {
      helpersSet.add(h);
    }
  }
  const helpers = Array.from(helpersSet).sort();
  const required = existsSync(monitor) && (closure.required || helpers.length > 0);

  return {
    configRoot: root,
    monitor,
    required,
    entries: helpers.map((file) => {
      const destination = join(root, "hooks", "lib", file);
      return { file, destination, action: existsSync(destination) ? "verify" : "create" };
    }),
  };
}

// ---------------------------------------------------------------------------
// Complete operation plan
// ---------------------------------------------------------------------------

export interface GsdCompatibilitySource {
  file: CodexHookHelper;
  /** Absolute path the helper bytes are read from. */
  source: string;
  /**
   * Hash bound at review time. Null only when the source does not exist yet
   * because this plan's own declared package steps produce it — in that case
   * the locked package integrity is what binds the bytes.
   */
  sourceHash: string | null;
  destination: string;
  destinationHash: string | null;
  action: "create" | "update" | "current";
}

export interface GsdCompatibilityProcessStep {
  step: "pack" | "extract";
  spec: ProcessSpec;
  /**
   * An argument whose value only the previous step can produce. Apply may
   * substitute it, but only with a path inside `withinRoot`, which the plan
   * proved — so a deferred value can never widen the operation's reach.
   */
  deferredArgument: { index: number; kind: "archive"; withinRoot: string } | null;
}

export interface GsdCompatibilityOperationPlan {
  kind: "gsd-compatibility";
  required: boolean;
  configRoot: string;
  monitor: string;
  stateRoot: string;
  /** The only roots a managed write may land in. */
  allowedRoots: readonly string[];
  /** Identity binding an unverified source tree. Null when one was supplied. */
  package: { name: string; version: string; integrity: string } | null;
  sourceRoot: string;
  packageRoot: string;
  /** Precomputed, not yet created. Null when a verified source root was supplied. */
  fixtureRoot: string | null;
  packRoot: string | null;
  extractionRoot: string | null;
  sources: readonly GsdCompatibilitySource[];
  processes: readonly GsdCompatibilityProcessStep[];
  environmentNames: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
  /** The narrow shape existing callers and the CLI already render. */
  compatibility: CodexGsdHookCompatibilityPlan;
}

export interface GsdCompatibilityPlanOptions {
  configRoot?: string;
  stateRoot?: string;
  /** An already-verified tree of helper sources; skips the package steps. */
  verifiedSourceRoot?: string;
  /**
   * Reuses a previously reviewed fixture location so revalidation compares
   * the same plan rather than a freshly named one.
   */
  fixtureRoot?: string;
}

/**
 * Enumerates every path role, source identity, child process and environment
 * name this operation may touch, and binds them into one reviewable digest.
 * Reads only; creates nothing.
 */
export async function planCodexGsdHookCompatibilityOperation(
  lock: StackLock,
  options: GsdCompatibilityPlanOptions = {},
): Promise<GsdCompatibilityOperationPlan> {
  const gsd = lock.components.gsd;
  if (!gsd) throw new Error("Stable lock has no GSD component");

  const configRoot = resolve(options.configRoot ?? codexConfigRoot());
  const stateRoot = resolve(options.stateRoot ?? userStateRoot());
  const targetRoot = hookLibraryRoot(configRoot);

  const verified = options.verifiedSourceRoot ? resolve(options.verifiedSourceRoot) : null;
  const fixtureRoot = verified
    ? null
    : resolve(options.fixtureRoot ?? join(tmpdir(), `alpha-aos-gsd-compat-${randomUUID()}`));
  const packRoot = fixtureRoot ? join(fixtureRoot, "pack") : null;
  const extractionRoot = fixtureRoot ? join(fixtureRoot, "extract") : null;
  const packageRoot = verified ?? packageInstallPath(extractionRoot as string, gsd.package);
  const sourceRoot = verified ?? join(packageRoot, "hooks", "lib");
  const compatibility = await planCodexGsdHookCompatibility(configRoot, sourceRoot);

  if (verified && compatibility.required) {
    await discoverCodexHookHelperClosure({
      monitorPath: compatibility.monitor,
      upstreamHooksLibRoot: sourceRoot,
      installedHooksLibRoot: targetRoot,
    });
  }

  const sources: GsdCompatibilitySource[] = [];
  for (const entry of compatibility.entries) {
    const source = join(sourceRoot, entry.file);
    if (!inside(sourceRoot, source)) throw new Error(`Unsafe GSD helper source: ${source}`);
    // A supplied tree exists now, so its bytes are bound now. A packed tree
    // does not exist yet; the locked integrity binds it instead.
    const sourceHash = verified && existsSync(source) ? sha256(await readFile(source)) : null;
    const destinationHash = existsSync(entry.destination) ? sha256(await readFile(entry.destination)) : null;
    sources.push({
      file: entry.file,
      source,
      sourceHash,
      destination: entry.destination,
      destinationHash,
      action: sourceHash !== null && sourceHash === destinationHash
        ? "current"
        : destinationHash === null ? "create" : "update",
    });
  }

  const processes: GsdCompatibilityProcessStep[] = [];
  const environment = nodeRuntimeEnvironment();
  if (fixtureRoot && packRoot && extractionRoot) {
    const npm = resolveNodePackageCli("npm");
    processes.push({
      step: "pack",
      spec: declaredProcessSpec({
        executable: npm.executable,
        args: [...npm.argsPrefix, "pack", `${gsd.package}@${gsd.version}`, "--json", "--pack-destination", packRoot],
        cwd: fixtureRoot,
        timeoutMs: 300_000,
        maxOutputBytes: 256 * 1024,
        environment,
      }),
      deferredArgument: null,
    });
    const extractArgs = [
      ...npm.argsPrefix,
      "install",
      "--prefix",
      extractionRoot,
      "",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
    ];
    processes.push({
      step: "extract",
      spec: declaredProcessSpec({
        executable: npm.executable,
        args: extractArgs,
        cwd: fixtureRoot,
        timeoutMs: 300_000,
        maxOutputBytes: 256 * 1024,
        environment,
      }),
      deferredArgument: { index: extractArgs.indexOf(""), kind: "archive", withinRoot: packRoot },
    });
  }

  const inputs: OperationPathInput[] = [
    ...sources.map((source): OperationPathInput => ({ role: "target", path: source.destination })),
    { role: "state", path: stateRoot },
    { role: "journal", path: join(stateRoot, "journal") },
    { role: "snapshot", path: join(stateRoot, "snapshots") },
    { role: "package-root", path: packageRoot },
    { role: "source", path: sourceRoot },
    ...sources.map((source): OperationPathInput => ({ role: "source", path: source.source })),
  ];
  if (fixtureRoot && packRoot && extractionRoot) {
    inputs.push(
      { role: "temp", path: fixtureRoot },
      { role: "temp", path: packRoot },
      { role: "temp", path: extractionRoot },
    );
  }

  const allowedRoots = [targetRoot, stateRoot, fixtureRoot ?? sourceRoot];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots,
    requiredRoles: fixtureRoot
      ? ["target", "state", "journal", "snapshot", "temp", "source", "package-root"]
      : ["target", "state", "journal", "snapshot", "source", "package-root"],
  });

  const digest = reviewedDigest("gsd-compatibility", {
    configRoot,
    monitor: compatibility.monitor,
    required: compatibility.required,
    stateRoot,
    allowedRoots,
    package: { name: gsd.package, version: gsd.version, integrity: gsd.integrity },
    sourceRoot,
    packageRoot,
    sources,
    processes,
    environmentNames: declaredEnvironmentNames(environment),
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "gsd-compatibility",
    required: compatibility.required,
    configRoot,
    monitor: compatibility.monitor,
    stateRoot,
    allowedRoots,
    package: verified ? null : { name: gsd.package, version: gsd.version, integrity: gsd.integrity },
    sourceRoot,
    packageRoot,
    fixtureRoot,
    packRoot,
    extractionRoot,
    sources,
    processes,
    environmentNames: declaredEnvironmentNames(environment),
    proofs,
    digest,
    compatibility,
  };
}

export interface CodexHookSmokeResult {
  ok: boolean;
  code: string;
  exitCode: number | null;
  /** Bounded, redacted evidence plus a fingerprint of the complete stream. */
  stdout: RedactedExcerpt;
  stderr: RedactedExcerpt;
}

/**
 * Drives the Codex Stop hook the way Codex would: one JSON event on stdin,
 * and silence plus a zero exit as the pass condition.
 *
 * The child receives only the declared runtime environment, is bounded by a
 * deadline and an output cap, and its output is returned as fingerprinted
 * excerpts rather than raw bytes.
 */
export async function smokeTestCodexGsdStopHook(configRoot = codexConfigRoot()): Promise<CodexHookSmokeResult> {
  const monitor = join(resolve(configRoot), "hooks", "gsd-context-monitor.js");
  const absent: RedactedExcerpt = { excerpt: "", capped: false, totalBytes: 0, sha256: EMPTY_STREAM_SHA256 };
  if (!existsSync(monitor)) return { ok: true, code: "not-applicable", exitCode: 0, stdout: absent, stderr: absent };

  const result = await runProcess({
    executable: process.execPath,
    args: [monitor],
    cwd: tmpdir(),
    timeoutMs: 15_000,
    maxOutputBytes: 64 * 1024,
    environment: nodeRuntimeEnvironment(),
    stdin: JSON.stringify({
      session_id: `alpha-aos-smoke-${process.pid}`,
      cwd: tmpdir(),
      hook_event_name: "Stop",
    }),
  });

  return {
    // The hook protocol is silence on success; anything written is a failure.
    ok: result.code === "ok" && result.stdout.totalBytes === 0 && result.stderr.totalBytes === 0,
    code: result.code,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Describes a failed smoke run without quoting the hook's own output. */
function describeSmokeFailure(label: string, smoke: CodexHookSmokeResult): string {
  return (
    `${label} failed (${smoke.code}, exit ${String(smoke.exitCode)}). ` +
    `stdout ${smoke.stdout.totalBytes}B sha256 ${smoke.stdout.sha256.slice(0, 12)}, ` +
    `stderr ${smoke.stderr.totalBytes}B sha256 ${smoke.stderr.sha256.slice(0, 12)}.`
  );
}

export interface PureUpstreamCodexStopHookInspection {
  status: "active" | "retired";
  resolution: "applied" | "resolved-upstream";
  helpers: string[];
  missingHelpers: string[];
  smoke: CodexHookSmokeResult;
  retirement?: AdapterRetirementRecord;
}

/**
 * Inspects pure upstream Codex Stop hook health without applying alpha-AOS compatibility helpers.
 * If the upstream package contains all required helpers and passes the Stop smoke test,
 * it is considered resolved-upstream (retired).
 */
export async function inspectPureUpstreamCodexStopHook(
  configRoot: string,
  verifiedRelease?: string,
): Promise<PureUpstreamCodexStopHookInspection> {
  const root = resolve(configRoot);
  const monitor = join(root, "hooks", "gsd-context-monitor.js");
  const installedLibRoot = hookLibraryRoot(root);

  const closure = await discoverCodexHookHelperClosure({
    monitorPath: monitor,
    installedHooksLibRoot: installedLibRoot,
  });

  const smoke = await smokeTestCodexGsdStopHook(root);

  // If there are no missing helpers and smoke test passed without alpha-AOS adaptation
  if (closure.missingInInstalled.length === 0 && smoke.ok) {
    return {
      status: "retired",
      resolution: "resolved-upstream",
      helpers: closure.helpers,
      missingHelpers: [],
      smoke,
      retirement: {
        retirementReason: "Upstream GSD includes required Codex hook helpers in native package",
        verifiedRelease: verifiedRelease ?? "resolved-upstream",
        verificationMethod: "smokeTestCodexGsdStopHook on pure upstream installation",
        evidenceSummary: "Pure upstream hook execution succeeded without compatibility helper copying",
      },
    };
  }

  return {
    status: "active",
    resolution: "applied",
    helpers: closure.helpers,
    missingHelpers: closure.missingInInstalled,
    smoke,
  };
}

/** Materializes the precomputed fixture root, refusing a squatted location. */
async function createFixtureRoot(plan: GsdCompatibilityOperationPlan, root: string): Promise<void> {
  await assertUnchangedSincePlan(plan, plannedProof(plan, "temp", root));
  // Not recursive: an existing entry here is someone else's, and EEXIST is
  // the same exclusive-create guarantee mkdtemp gave.
  await mkdir(root, { mode: 0o700 });
  await mkdir(plan.packRoot as string, { mode: 0o700 });
}

/** Runs the plan's declared package steps into the proven fixture root. */
async function materializeVerifiedSource(plan: GsdCompatibilityOperationPlan): Promise<void> {
  const pack = plan.processes.find((step) => step.step === "pack");
  const extract = plan.processes.find((step) => step.step === "extract");
  if (!pack || !extract || !plan.package || !plan.packRoot) {
    throw new ComponentPlanError("unplanned-path", "GSD compatibility package steps were not planned");
  }

  const packed = await runProcess({ ...pack.spec, environment: nodeRuntimeEnvironment() });
  if (packed.code !== "ok") throw new Error(describeProcessFailure("npm pack", packed));
  const archive = await soleArchive(plan.packRoot);
  const integrity = await tarballIntegrity(archive);
  if (integrity !== plan.package.integrity) {
    throw new Error(`GSD tarball integrity mismatch: expected ${plan.package.integrity}, got ${integrity}`);
  }

  const deferred = extract.deferredArgument;
  if (!deferred || deferred.kind !== "archive") {
    throw new ComponentPlanError("unplanned-path", "GSD extraction step declared no archive argument");
  }
  // The archive name comes from a child, so it is only ever accepted inside
  // the root the plan proved for it.
  if (!inside(deferred.withinRoot, archive) || !existsSync(archive)) {
    throw new ComponentPlanError("unplanned-path", `npm pack archive is not inside the planned pack root: ${archive}`);
  }
  const args = [...extract.spec.args];
  args[deferred.index] = archive;
  const installed = await runProcess({ ...extract.spec, args, environment: nodeRuntimeEnvironment() });
  if (installed.code !== "ok") throw new Error(describeProcessFailure("GSD tarball extraction", installed));
}

export interface GsdCompatibilityApplyOptions extends GsdCompatibilityPlanOptions {
  /** A plan reviewed earlier; apply refuses if re-reading no longer matches it. */
  plan?: GsdCompatibilityOperationPlan;
  /**
   * A writer already held by the caller. When supplied this apply consumes it
   * and takes no lock of its own.
   */
  session?: MutationSession;
}

export async function applyCodexGsdHookCompatibility(lock: StackLock, options: GsdCompatibilityApplyOptions = {}): Promise<{
  operationId: string | null;
  plan: CodexGsdHookCompatibilityPlan;
  digest: string;
}> {
  const reviewed = options.plan ?? await planCodexGsdHookCompatibilityOperation(lock, options);
  if (!reviewed.required) return { operationId: null, plan: reviewed.compatibility, digest: reviewed.digest };

  // Complete read-only revalidation before anything is acquired or run. The
  // same inputs must still produce the same plan, or nothing happens.
  const revalidation: GsdCompatibilityPlanOptions = { configRoot: reviewed.configRoot, stateRoot: reviewed.stateRoot };
  if (reviewed.fixtureRoot === null) revalidation.verifiedSourceRoot = reviewed.sourceRoot;
  else revalidation.fixtureRoot = reviewed.fixtureRoot;
  const revalidated = await planCodexGsdHookCompatibilityOperation(lock, revalidation);
  assertPlanUnchanged(reviewed, revalidated);

  if (reviewed.sources.every((source) => source.action === "current")) {
    const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
    if (!smoke.ok) throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test", smoke));
    return { operationId: null, plan: reviewed.compatibility, digest: reviewed.digest };
  }

  // If pure upstream has already resolved the hook natively without compatibility adaptation
  const pureInspection = await inspectPureUpstreamCodexStopHook(reviewed.configRoot, lock.components.gsd?.version);
  if (pureInspection.resolution === "resolved-upstream") {
    const targetRoot = hookLibraryRoot(reviewed.configRoot);
    if (existsSync(targetRoot) && reviewed.fixtureRoot === null && options.verifiedSourceRoot) {
      const sourceRoot = resolve(options.verifiedSourceRoot);
      const existingInLib = (await readdir(targetRoot, { withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => e.name);
      const obsolete = existingInLib.filter((f) => !existsSync(join(sourceRoot, f)) && (CODEX_HOOK_HELPERS as readonly string[]).includes(f));
      if (obsolete.length > 0) {
        return withComponentSession(reviewed, options.session, async (session) => {
          const operations = obsolete.map((f) => ({ target: join(targetRoot, f), content: null }));
          const journal = await applyFileTransaction({
            stateRoot: reviewed.stateRoot,
            allowedRoots: [targetRoot],
            operations,
            session,
          });
          const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
          if (!smoke.ok) {
            await rollbackFileTransaction(reviewed.stateRoot, journal.id, [targetRoot]);
            throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test after helper cleanup", smoke));
          }
          return {
            operationId: journal.id,
            plan: await planCodexGsdHookCompatibility(reviewed.configRoot),
            digest: reviewed.digest,
          };
        });
      }
    }
    const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
    if (!smoke.ok) throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test", smoke));
    return { operationId: null, plan: reviewed.compatibility, digest: reviewed.digest };
  }

  return withComponentSession(reviewed, options.session, async (session) => {
    const targetRoot = hookLibraryRoot(reviewed.configRoot);
    try {
      if (reviewed.fixtureRoot) {
        await createFixtureRoot(reviewed, reviewed.fixtureRoot);
        await materializeVerifiedSource(reviewed);
      }

      const operations: Array<{ target: string; content: Uint8Array }> = [];
      for (const source of reviewed.sources) {
        const sourceProof = plannedProof(reviewed, "source", source.source);
        await assertUnchangedSincePlan(reviewed, sourceProof);
        if (!existsSync(source.source)) {
          throw new ComponentPlanError("source-drift", `GSD hook helper is missing from the verified package: ${source.file}`);
        }
        const content = await readFile(source.source);
        if (source.sourceHash !== null && sha256(content) !== source.sourceHash) {
          throw new ComponentPlanError("source-drift", `GSD hook helper changed since it was reviewed: ${source.file}`);
        }
        const current = existsSync(source.destination) ? await readFile(source.destination) : null;
        if (current !== null && sha256(current) !== source.destinationHash) {
          throw new ComponentPlanError("plan-drift", `GSD hook helper destination changed since it was reviewed: ${source.file}`);
        }
        if (current !== null && sha256(current) === sha256(content)) continue;

        const targetProof = plannedProof(reviewed, "target", source.destination);
        await assertUnchangedSincePlan(reviewed, targetProof);
        operations.push({ target: source.destination, content });
      }

      if (operations.length === 0) {
        const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
        if (!smoke.ok) throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test", smoke));
        return {
          operationId: null,
          plan: await planCodexGsdHookCompatibility(reviewed.configRoot),
          digest: reviewed.digest,
        };
      }

      const journal = await applyFileTransaction({
        stateRoot: reviewed.stateRoot,
        allowedRoots: [targetRoot],
        operations,
        session,
      });
      const smoke = await smokeTestCodexGsdStopHook(reviewed.configRoot);
      if (!smoke.ok) {
        await rollbackFileTransaction(reviewed.stateRoot, journal.id, [targetRoot]);
        throw new Error(describeSmokeFailure("Codex GSD Stop hook smoke test after compatibility sync", smoke));
      }
      return {
        operationId: journal.id,
        plan: await planCodexGsdHookCompatibility(reviewed.configRoot),
        digest: reviewed.digest,
      };
    } finally {
      if (reviewed.fixtureRoot) {
        const tempRoot = resolve(tmpdir());
        const fixtureRoot = reviewed.fixtureRoot;
        if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) {
          throw new Error(`Unsafe GSD compatibility fixture cleanup path: ${fixtureRoot}`);
        }
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    }
  });
}
