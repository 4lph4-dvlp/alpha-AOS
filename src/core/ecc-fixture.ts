import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, LockedPackage } from "../types.js";
import {
  evaluateAntigravityDocLookupAdapter,
  evaluateDeepResearchRoutingAdapter,
} from "./compatibility-adapters.js";
import { resolveNodePackageCli, runProcess, type ProcessSpec } from "./process.js";
import { describeProcessFailure, nodeRuntimeEnvironment } from "./install.js";
import { redactHome } from "./paths.js";
import { proveOperationPaths, type OperationPathInput, type OperationPathProofSet } from "./path-boundary.js";
import type { MutationSession } from "./writer-lock.js";
import {
  assertPlanUnchanged,
  assertUnchangedSincePlan,
  beginFixture,
  ComponentPlanError,
  declaredEnvironmentNames,
  declaredProcessSpec,
  plannedFixtureRoot,
  plannedProof,
  reviewedDigest,
} from "./component-session.js";

const selectedSkills = ["unified-memory", "documentation-lookup", "deep-research"] as const;
export type SelectedEccSkill = typeof selectedSkills[number];

/**
 * A skill this fixture may be pointed at, which is a strictly wider set than
 * `SelectedEccSkill`.
 *
 * `selectedSkills` — here and in `ecc-skills.ts` — is the GLOBAL sync list:
 * every id in it is installed into a user's global skill root. Pack skills are
 * project-scoped and must never join it, so they travel under their own name
 * and the two sets stay separable at every call site.
 */
export type PackSkillId = string;

export interface EccFixtureResult {
  harness: HarnessId;
  version: string;
  integrity: string;
  operationCount: number;
  sourceHashes: Record<PackSkillId, string>;
  targetHashes: Record<PackSkillId, string>;
  targetRoot: string;
  retainedFixture: string | null;
}

function inside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function eccSkillRoot(harness: HarnessId, syntheticHome: string): string {
  switch (harness) {
    case "claude": return join(syntheticHome, ".claude", "skills");
    case "codex": return join(syntheticHome, ".agents", "skills");
    case "antigravity": return join(syntheticHome, ".gemini", "config", "skills");
    case "pi": return join(syntheticHome, ".agents", "skills");
    case "hermes": return join(syntheticHome, ".hermes", "skills");
  }
}

/**
 * The one place a fixture reads a skill's bytes.
 *
 * A named skill with no `SKILL.md` is a loud failure naming that skill: D-08's
 * guarantee is that a pack is never planned sourceless, so a silent skip would
 * defeat it. The containment check matters because skill ids now arrive from
 * `catalog/packs/*.yaml` rather than from a three-element tuple in this file.
 */
export async function readEccSkillSource(sourceRoot: string, skill: PackSkillId): Promise<string> {
  const file = join(sourceRoot, skill, "SKILL.md");
  if (!inside(sourceRoot, file)) throw new Error(`Unsafe ECC skill id: ${skill}`);
  try {
    return await readFile(file, "utf8");
  } catch (cause) {
    throw new Error(`ECC package has no SKILL.md for ${skill} (${file})`, { cause });
  }
}

export function renderEccSkill(skill: PackSkillId, source: string, harness?: HarnessId): string {
  if (skill === "documentation-lookup" && harness === "antigravity") {
    const evaluation = evaluateAntigravityDocLookupAdapter(source);
    return evaluation.renderedContent ?? source;
  }
  if (skill === "deep-research") {
    const evaluation = evaluateDeepResearchRoutingAdapter(source, { harness });
    return evaluation.renderedContent ?? source;
  }
  return source;
}

/**
 * The one file `npm pack` wrote into the pack root this fixture just created.
 *
 * The archive name used to be read out of `npm pack --json`, but that document
 * carries the package's entire file list — 292 KB for `ecc-universal@2.2.0` —
 * while a `ProcessResult` is a BOUNDED redacted excerpt by design, so the parse
 * failed at the excerpt cut and the fixture could not run at all. Reading the
 * directory the plan proved is both bounded and stricter: the name comes from a
 * root this fixture owns rather than from a child's stdout.
 */
async function soleArchive(packRoot: string): Promise<string> {
  const files = (await readdir(packRoot, { withFileTypes: true })).filter((entry) => entry.isFile());
  const [entry] = files;
  if (files.length !== 1 || entry === undefined) {
    throw new ComponentPlanError("unplanned-path", `npm pack wrote ${files.length} files into the planned pack root; expected exactly one archive`);
  }
  return join(packRoot, entry.name);
}

/**
 * The tarball's Subresource Integrity string, computed from the bytes on disk.
 * npm reports the same value, but hashing what was actually written is what a
 * locked `integrity` is meant to bind.
 */
async function tarballIntegrity(archive: string): Promise<string> {
  return `sha512-${createHash("sha512").update(await readFile(archive)).digest("base64")}`;
}

// ---------------------------------------------------------------------------
// Complete fixture operation plan
// ---------------------------------------------------------------------------

export interface EccFixtureProcessStep {
  step: "pack" | "extract";
  spec: ProcessSpec;
  /**
   * An argument only the previous step can produce. Apply may substitute it,
   * but only with a path inside `withinRoot`, which the plan proved.
   */
  deferredArgument: { index: number; kind: "archive"; withinRoot: string } | null;
}

export interface EccFixtureOperationPlan {
  kind: "ecc-fixture";
  harness: HarnessId;
  /** Named before it exists, so the location is reviewed rather than discovered. */
  fixtureRoot: string;
  packRoot: string;
  extractionRoot: string;
  syntheticHome: string;
  /** Where the rendered skills land: `<targetRoot>/<skill>/SKILL.md`. */
  targetRoot: string;
  sourceRoot: string;
  package: { name: string; version: string; integrity: string };
  skills: readonly PackSkillId[];
  processes: readonly EccFixtureProcessStep[];
  environmentNames: readonly string[];
  proofs: OperationPathProofSet;
  digest: string;
}

/**
 * Enumerates every path and child this fixture may use, before it creates
 * anything. The rendered skill files are therefore addressable by a caller
 * that wants to copy them, rather than discovered once a temp directory
 * happens to exist.
 */
export async function createEccFixtureOperationPlan(options: {
  harness: HarnessId;
  ecc: LockedPackage & { skills: string[] };
  fixtureRoot?: string;
  /**
   * The skills to acquire. Defaults to the three global skills, so an
   * unparameterised call plans exactly what it always did. A caller that names
   * pack skills gets them from this same integrity-checked path without any of
   * them reaching the global sync list.
   */
  skills?: readonly PackSkillId[];
}): Promise<EccFixtureOperationPlan> {
  const skills: readonly PackSkillId[] = options.skills ?? selectedSkills;
  const undeclared = skills.filter((skill) => !options.ecc.skills.includes(skill));
  if (undeclared.length > 0) throw new Error(`ECC lock does not contain all selected logical skills: ${undeclared.join(", ")}`);
  const fixtureRoot = resolve(options.fixtureRoot ?? plannedFixtureRoot(`alpha-aos-ecc-${options.harness}`));
  const packRoot = join(fixtureRoot, "pack");
  const extractionRoot = join(fixtureRoot, "extract");
  const syntheticHome = join(fixtureRoot, "home");
  const targetRoot = eccSkillRoot(options.harness, syntheticHome);
  const sourceRoot = join(extractionRoot, "node_modules", "ecc-universal", "skills");
  const npm = resolveNodePackageCli("npm");
  const environment = nodeRuntimeEnvironment();

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
  const processes: EccFixtureProcessStep[] = [
    {
      step: "pack",
      spec: declaredProcessSpec({
        executable: npm.executable,
        args: [...npm.argsPrefix, "pack", `${options.ecc.package}@${options.ecc.version}`, "--json", "--pack-destination", packRoot],
        cwd: fixtureRoot,
        timeoutMs: 300_000,
        maxOutputBytes: 256 * 1024,
        environment,
      }),
      deferredArgument: null,
    },
    {
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
    },
  ];

  const inputs: OperationPathInput[] = [
    { role: "temp", path: fixtureRoot },
    { role: "temp", path: packRoot },
    { role: "temp", path: extractionRoot },
    { role: "temp", path: syntheticHome },
    { role: "temp", path: targetRoot },
    { role: "package-root", path: join(extractionRoot, "node_modules", "ecc-universal") },
    { role: "source", path: sourceRoot },
    ...skills.map((skill): OperationPathInput => ({ role: "target", path: join(targetRoot, skill, "SKILL.md") })),
  ];
  const proofs = await proveOperationPaths({
    inputs,
    allowedRoots: [fixtureRoot],
    requiredRoles: ["temp", "target", "source", "package-root"],
  });

  const digest = reviewedDigest("ecc-fixture", {
    harness: options.harness,
    fixtureRoot,
    packRoot,
    extractionRoot,
    syntheticHome,
    targetRoot,
    sourceRoot,
    package: { name: options.ecc.package, version: options.ecc.version, integrity: options.ecc.integrity },
    skills,
    processes,
    environmentNames: declaredEnvironmentNames(environment),
    boundary: { code: proofs.code, roles: proofs.proofs.map((proof) => [proof.role, proof.configured, proof.proven]) },
  });

  return {
    kind: "ecc-fixture",
    harness: options.harness,
    fixtureRoot,
    packRoot,
    extractionRoot,
    syntheticHome,
    targetRoot,
    sourceRoot,
    package: { name: options.ecc.package, version: options.ecc.version, integrity: options.ecc.integrity },
    skills,
    processes,
    environmentNames: declaredEnvironmentNames(environment),
    proofs,
    digest,
  };
}

export async function runEccFixture(options: {
  harness: HarnessId;
  ecc: LockedPackage & { skills: string[] };
  keep?: boolean;
  /** A fixture plan reviewed by the operation that authorized this run. */
  plan?: EccFixtureOperationPlan;
  /** The operation writer; the fixture refuses to start before it exists. */
  session?: MutationSession;
  /** Defaults to the three global skills; see createEccFixtureOperationPlan. */
  skills?: readonly PackSkillId[];
}): Promise<EccFixtureResult> {
  const reviewed = options.plan ?? await createEccFixtureOperationPlan(options);
  // The re-plan derives its skill list from the REVIEWED plan, so a caller
  // cannot hand apply a different list than the one that was reviewed.
  assertPlanUnchanged(reviewed, await createEccFixtureOperationPlan({
    harness: reviewed.harness,
    ecc: options.ecc,
    fixtureRoot: reviewed.fixtureRoot,
    skills: reviewed.skills,
  }));

  const fixtureRoot = reviewed.fixtureRoot;
  const targetRoot = reviewed.targetRoot;
  const sourceRoot = reviewed.sourceRoot;
  await beginFixture(reviewed, options.session);
  await mkdir(reviewed.packRoot, { mode: 0o700 });
  // Initialised from the CALLER's choice, not from `true`.
  //
  // `retain` used to start at `true` and only reach `options.keep` on the
  // success path, so any throw between the two skipped the `rm` in `finally`
  // and left the extracted tree and the packed tarball in the system temp
  // directory forever, with nothing reporting where — a silent leak rather
  // than a diagnostic retention (02-REVIEW WR-12). Starting from the option
  // makes a failure clean up by default, and makes retention something a
  // caller asked for. When it WAS asked for, the rethrow below names what was
  // kept, aliased, so a failure is never silent about its leftovers either.
  const retain = options.keep ?? false;
  try {
    const packStep = reviewed.processes.find((step) => step.step === "pack");
    const extractStep = reviewed.processes.find((step) => step.step === "extract");
    if (!packStep || !extractStep?.deferredArgument) {
      throw new ComponentPlanError("unplanned-path", "ECC fixture package steps were not planned");
    }
    const packed = await runProcess({ ...packStep.spec, environment: nodeRuntimeEnvironment() });
    if (packed.code !== "ok") throw new Error(describeProcessFailure("npm pack", packed));
    const deferred = extractStep.deferredArgument;
    const archive = await soleArchive(deferred.withinRoot);
    // The archive name comes from a child's write, so it is only accepted
    // inside the root the plan proved for it.
    if (!inside(deferred.withinRoot, archive) || !existsSync(archive)) {
      throw new ComponentPlanError("unplanned-path", `npm pack archive is not inside the planned pack root: ${archive}`);
    }
    const integrity = await tarballIntegrity(archive);
    if (integrity !== options.ecc.integrity) throw new Error(`ECC tarball integrity mismatch: expected ${options.ecc.integrity}, got ${integrity}`);
    const extractArguments = [...extractStep.spec.args];
    extractArguments[deferred.index] = archive;
    const installed = await runProcess({ ...extractStep.spec, args: extractArguments, environment: nodeRuntimeEnvironment() });
    if (installed.code !== "ok") throw new Error(describeProcessFailure("ECC tarball extraction", installed));
    await assertUnchangedSincePlan(reviewed, plannedProof(reviewed, "source", sourceRoot));
    const sourceHashes: Record<PackSkillId, string> = {};
    const targetHashes: Record<PackSkillId, string> = {};
    for (const skill of reviewed.skills) {
      const source = await readEccSkillSource(sourceRoot, skill);
      const rendered = renderEccSkill(skill, source, reviewed.harness);
      sourceHashes[skill] = sha256(source);
      targetHashes[skill] = sha256(rendered);
      const destination = join(targetRoot, skill, "SKILL.md");
      if (!inside(targetRoot, destination)) throw new Error(`Unsafe ECC fixture destination: ${destination}`);
      // The destination was proven at review time; apply looks it up rather
      // than proving a path it just computed.
      plannedProof(reviewed, "target", destination);
      await mkdir(join(targetRoot, skill), { recursive: true });
      await writeFile(destination, rendered, { encoding: "utf8", mode: 0o600 });
    }
    return {
      harness: reviewed.harness,
      version: options.ecc.version,
      integrity,
      operationCount: reviewed.skills.length,
      sourceHashes,
      targetHashes,
      targetRoot,
      retainedFixture: retain ? fixtureRoot : null,
    };
  } catch (error) {
    // A retained tree that nothing names is a leak; a retained tree the error
    // points at is evidence. The path is aliased because it sits under a
    // private root.
    if (!retain) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message} (ECC fixture retained at ${redactHome(fixtureRoot)})`, { cause: error });
  } finally {
    if (!retain) {
      const tempRoot = resolve(tmpdir());
      if (!inside(tempRoot, fixtureRoot) || fixtureRoot === tempRoot) throw new Error(`Unsafe ECC fixture cleanup path: ${fixtureRoot}`);
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  }
}
