import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import type { HarnessId, LockedPackage } from "../types.js";
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
    const description = "description: Use up-to-date library and framework docs via Context7 MCP instead of training data. In Antigravity, use the surface's native Context7 MCP route and never substitute native web search. Activates for setup questions, API references, code examples, or named frameworks.";
    let rendered = source.replace(/^description:.*$/mu, description);
    if (rendered === source) throw new Error("documentation-lookup source no longer contains the expected description");
    const heading = "# Documentation Lookup (Context7)\n\n";
    const routing = "## Antigravity GUI/IDE Routing\n\n- In Antigravity GUI, call the namespaced MCP tools `context7/resolve-library-id` and, when documentation content is needed, `context7/query-docs`.\n- In Antigravity IDE, invoke the generic `call_mcp_tool` gateway. Resolve with `ServerName: \"context7\"`, `ToolName: \"resolve-library-id\"`, and `Arguments: { libraryName, query }`. When documentation content is needed, invoke the same gateway with `ToolName: \"query-docs\"` and `Arguments: { libraryId, query }`. Reading a JSON tool descriptor does not execute the MCP tool.\n\nDo not replace a required Context7 call with native web search. If the native Context7 route is unavailable, report that Context7 is unavailable and stop instead of searching the web for a guessed library ID.\n\n";
    if (!rendered.includes(heading)) throw new Error("documentation-lookup source no longer contains the expected title");
    rendered = rendered.replace(heading, `${heading}${routing}`);
    return rendered;
  }
  if (skill !== "deep-research") return source;
  function replaceRequired(value: string, pattern: RegExp, replacement: string, section: string): string {
    const next = value.replace(pattern, replacement);
    if (next === value) throw new Error(`deep-research source no longer contains the expected ${section} section`);
    return next;
  }
  let rendered = replaceRequired(
    source,
    /## MCP Requirements[\s\S]*?(?=## Workflow)/u,
    `## MCP Requirements\n\nThis alpha-AOS rendering uses both configured MCP roles:\n\n- **exa** — \`web_search_exa\` owns web discovery and source URL collection.\n- **firecrawl** — \`firecrawl_scrape\` owns full-text extraction for known URLs. \`firecrawl_map\`, \`firecrawl_crawl\`, and \`firecrawl_check_crawl_status\` are available only for an explicitly bounded site task after capability and credential checks.\n\nUse only these configured tool names. Default research must remain search plus single-page scrape; never start a site crawl merely because a deep-research skill activated.\n\n`,
    "MCP Requirements",
  );
  rendered = replaceRequired(
    rendered,
    /### Step 3: Execute Multi-Source Search[\s\S]*?(?=### Step 4: Deep-Read Key Sources)/u,
    `### Step 3: Execute Multi-Source Search\n\nFor each sub-question, discover sources with Exa:\n\n\`\`\`text\nweb_search_exa(query: "<sub-question keywords>", numResults: 8)\n\`\`\`\n\nUse 2-3 focused query variations where needed, deduplicate URLs, and aim for 15-30 relevant sources across the whole report. Prefer academic, official, and primary sources, followed by reputable reporting. Do not send secrets or private repository content in search queries.\n\n`,
    "Step 3 search",
  );
  rendered = replaceRequired(
    rendered,
    /### Step 4: Deep-Read Key Sources[\s\S]*?(?=### Step 5: Synthesize and Write Report)/u,
    `### Step 4: Deep-Read Key Sources\n\nFetch the most important known URLs with Firecrawl:\n\n\`\`\`text\nfirecrawl_scrape(url: "<url>", formats: ["markdown"])\n\`\`\`\n\nRead 3-5 key sources in full instead of relying on snippets. Use map or crawl only when the user requested a bounded site-level task, the relevant Firecrawl capability and credential are available, and the scope and limit are explicit. Poll an initiated crawl with \`firecrawl_check_crawl_status\`; do not start autonomous or unbounded crawling.\n\n`,
    "Step 4 deep-read",
  );
  rendered = replaceRequired(
    rendered,
    /## Parallel Research with Subagents[\s\S]*?(?=## Quality Rules)/u,
    `## Parallel Research With Native Harness Capabilities\n\nFor broad topics, use the current harness's native subagent or parallel-work capability when available. Assign non-overlapping research sub-questions, require each worker to return source URLs and evidence, and let one controller synthesize the report. If the harness has no isolated worker capability, execute the sub-questions sequentially. Do not nest this research parallelism inside a GSD execution wave.\n\n`,
    "parallel research",
  );
  return rendered;
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
        timeoutMs: 180_000,
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
        timeoutMs: 180_000,
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
