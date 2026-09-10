// Plan 02-01 tracer: one repository directory selects one YAML-declared pack.
//
// The assertions here run the built CLI, not the modules, because the seam
// under test is the whole path — canonical root, evidence, pack catalog,
// predicate evaluation, plan digests, and the single `print()` output seam.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  AdapterSupportEntry,
  EvidenceFact,
  FactDeclaration,
  HarnessId,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  PackOverride,
  ProjectCapabilityPlan,
  ProjectStackManifest,
  StackLock,
  SurfaceSupport,
  TargetPreState,
} from "../src/types.js";
import type {
  BlockedReason,
  CapabilityLedger,
  CapabilityProof,
  LedgerHarness,
  NativeUseState,
} from "../src/core/capability-ledger.js";
import type { DeclaredDependency } from "../src/core/evidence.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { reviewedDigest } from "../src/core/component-session.js";
import { proveOperationPaths } from "../src/core/path-boundary.js";
import { acquireMutationSession } from "../src/core/writer-lock.js";
import {
  collectProjectEvidence,
  digestableEvidence,
  discoverSubProjects,
  MAX_SCAN_DEPTH,
  PROJECT_MANIFEST_PATH,
  resolveCanonicalRoot,
  scanProjectTree,
} from "../src/core/evidence.js";
import { IGNORE_FILE_BYTE_CAP } from "../src/core/ignore-list.js";
import { REDACTED_STRING_LENGTH_BUDGET } from "../src/core/redaction.js";
import { formatProjectPlan } from "../src/format.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "../src/core/pack-catalog.js";
import { ROOT_CACHE_LIMIT } from "../src/core/paths.js";
import { inspectProjectManifest, manifestCacheSizes } from "../src/core/project.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";
import {
  AGENT_RUNTIME_PACK_ID,
  createDomainFixture,
  createGenericInstructionsFixture,
  createNearMissFixture,
  describeFixture,
  DOMAIN_FIXTURES,
  nearMissDifference,
  nearMissSpec,
  PACK_DOMAINS,
  removeFixture,
  type DomainFixtureSpec,
  type PackDomain,
} from "./helpers/pack-fixtures.js";
import {
  assertPackSourceShape,
  digestablePlan,
  evaluatePack,
  MAX_NEAR_MISS_LINES,
  PACK_SOURCE_MULTI_FILE,
  planProjectCapabilities,
  rankNearMisses,
  resolvePackSource,
  type PackEvaluationEnvironment,
} from "../src/core/project-plan.js";
import { applyProjectPackSync, planProjectPackSync } from "../src/core/project-pack-sync.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Mirrors `runCli` in test/preview.test.ts, but asynchronous so two runs can
 * overlap, and with an environment override so the personal-scope skill roots
 * a shadowing check reads can be pointed at a fixture instead of the host.
 */
function runCli(args: readonly string[], environment: Record<string, string | undefined> = {}): Promise<RunResult> {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of Object.entries(environment)) {
    if (value === undefined) delete childEnvironment[name];
    else childEnvironment[name] = value;
  }
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: repositoryRoot,
      windowsHide: true,
      env: childEnvironment,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status) => resolveRun({ status, stdout, stderr }));
  });
}

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
  skip: (message: string) => void;
}

/** A real directory whose `package.json` declares `react`, and nothing else. */
async function reactFixture(context: TestContext): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-plan-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "plan-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  return root;
}

/** A bare temporary directory the caller fills with exactly the evidence under test. */
async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

/** Directory symlink creation differs by platform and may need privileges. */
async function tryDirectorySymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    await symlink(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    return existsSync(linkPath);
  } catch {
    return false;
  }
}

test("project plan selects WEB_REACT and names the path and digests that decided it", async (context) => {
  const root = await reactFixture(context);
  const result = await runCli(["project", "plan", root]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /WEB_REACT/u);
  assert.match(result.stdout, /package\.json/u);
  assert.match(result.stdout, /Inputs digest: [0-9a-f]{64}/u);
  assert.match(result.stdout, /Evidence digest: [0-9a-f]{64}/u);
  assert.match(result.stdout, /Plan digest: [0-9a-f]{64}/u);
});

test("project plan --json emits the same decision as a redacted JSON envelope", async (context) => {
  const root = await reactFixture(context);
  const result = await runCli(["project", "plan", root, "--json"]);

  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout) as {
    scope: { canonicalRoot: string; rootReason: string; projectId: string };
    evaluations: Array<{ packId: string; satisfied: Array<{ factId: string; path: string | null }> }>;
    selected: string[];
    inputsDigest: string;
    evidenceDigest: string;
    planDigest: string;
  };

  assert.deepEqual(plan.selected, ["WEB_REACT"]);
  assert.match(plan.scope.projectId, /^[0-9a-f]{16}$/u);
  // Plan 02-11 Task 1 (option-a): a directory carrying a project-declaration
  // file answers the `project-declaration` rung, ABOVE `git-root`. This fixture
  // carries a `package.json`, so it is a project in its own right and no longer
  // reports `standalone-directory` — which now means what it says: neither a
  // declaration nor a git entry, anywhere above.
  assert.equal(plan.scope.rootReason, "project-declaration");
  assert.deepEqual(
    plan.evaluations.find((evaluation) => evaluation.packId === "WEB_REACT")?.satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["dependency:react", "package.json"]],
  );
  for (const digest of [plan.inputsDigest, plan.evidenceDigest, plan.planDigest]) {
    assert.match(digest, /^[0-9a-f]{64}$/u);
  }

  // D-07: a fact records path, name and version — never a per-file hash.
  const canonical = await resolveCanonicalRoot(root);
  const envelope = await collectProjectEvidence(canonical);
  assert.ok(envelope.facts.length > 0);
  for (const fact of envelope.facts) {
    assert.equal(Object.hasOwn(fact, "hash"), false, `fact ${fact.id} carries a hash`);
  }
});

test("two concurrent project plan invocations are byte-identical", async (context) => {
  const root = await reactFixture(context);
  const [first, second] = await Promise.all([
    runCli(["project", "plan", root]),
    runCli(["project", "plan", root]),
  ]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);
  // `plan` is a READ. Two reads that overlap in time leave no residue, so the
  // artifact directory an approval would create must not exist.
  assert.equal(existsSync(join(root, ".alpha-aos")), false, "an overlapping pair of reads persisted something");
});

// ---------------------------------------------------------------------------
// Plan 02-11 Task 3 (CR-02): a repository cannot steer its own pack selection
// by adding a link inside itself
// ---------------------------------------------------------------------------

/**
 * A react project with a real `src`, optionally with a directory alias to it
 * named `alias` — so the same target can be made to sort before or after `src`.
 */
async function aliasSelectionFixture(context: TestContext, alias: string | null): Promise<string | null> {
  const root = await scratchRoot(context, "alias-selection");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "aliased", private: true, dependencies: { react: "^19.0.0" } }),
    "utf8",
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export {};\n", "utf8");
  if (alias !== null && !(await tryDirectorySymlink(join(root, "src"), join(root, alias)))) {
    context.skip("alias-selection fixture not run: this host cannot create directory links");
    return null;
  }
  return root;
}

async function selectedSet(root: string): Promise<string[]> {
  const result = await runCli(["project", "plan", root, "--json"]);
  assert.equal(result.status, 0, result.stderr);
  return (JSON.parse(result.stdout) as { selected: string[] }).selected;
}

test("adding a directory alias inside the canonical root changes neither the fact set nor the selection", async (context) => {
  const plain = await aliasSelectionFixture(context, null);
  if (plain === null) return;
  const before = await aliasSelectionFixture(context, "aaa");
  if (before === null) return;
  const after = await aliasSelectionFixture(context, "zzz");
  if (after === null) return;

  const expected = await selectedSet(plain);
  // The pre-fix observation this pins: BROWNFIELD_INIT and WEB_BASE were both
  // selected without the alias and both LOST when `aaa` sorted before `src`,
  // because the alias claimed `src`'s identity and the real `src` was then
  // dropped as already-visited.
  assert.ok(expected.includes("BROWNFIELD_INIT"), `the fixture no longer exercises the defect: ${expected.join(",")}`);
  assert.deepEqual(await selectedSet(before), expected, "an alias sorting BEFORE its target changed the selection");
  assert.deepEqual(await selectedSet(after), expected, "an alias sorting AFTER its target changed the selection");
});

test("a symlinked alias of the same repository yields the same canonical root and project id", async (context) => {
  const root = await reactFixture(context);
  const linkParent = await mkdtemp(join(tmpdir(), "alpha-aos-plan-link-"));
  context.after(async () => rm(linkParent, { recursive: true, force: true }));
  const linkPath = join(linkParent, "alias");

  if (!(await tryDirectorySymlink(root, linkPath))) {
    context.skip("symlink-alias case not run: this host cannot create directory symlinks");
    return;
  }

  const direct = JSON.parse((await runCli(["project", "plan", root, "--json"])).stdout) as {
    scope: { canonicalRoot: string; projectId: string };
  };
  const aliased = JSON.parse((await runCli(["project", "plan", linkPath, "--json"])).stdout) as {
    scope: { canonicalRoot: string; projectId: string };
  };

  assert.equal(aliased.scope.canonicalRoot, direct.scope.canonicalRoot);
  assert.equal(aliased.scope.projectId, direct.scope.projectId);
});

// ---------------------------------------------------------------------------
// Plan 02-07 Task 1: evaluate-all predicate evaluation over the full operator set
// ---------------------------------------------------------------------------
//
// The assertions below run the PURE evaluator wherever the claim is about the
// predicate algebra, and the built CLI wherever the claim is about the whole
// path. A synthetic pack plus a synthetic environment is what lets a nested
// node, a deferred fact and a broad-only match be asserted without inventing a
// repository shape for each.

/** The real declared vocabulary, keyed by fact id. Phrases render from it. */
async function vocabularyIndex(): Promise<Map<string, FactDeclaration>> {
  const loaded = await loadFactVocabularyStrict(repositoryRoot);
  return new Map(loaded.value.facts.map((fact) => [fact.id, fact]));
}

interface EnvironmentOptions {
  readonly vocabulary: Map<string, FactDeclaration>;
  /** Declared fact id to the path that carried it, or `true` for a pathless positive. */
  readonly detected?: Record<string, string | true>;
  /** Scannable relative paths, for `anyFiles`. */
  readonly paths?: readonly string[];
  /** Package name to the manifest that declared it. */
  readonly dependencies?: Record<string, string>;
  readonly manifest?: ProjectStackManifest | null;
  readonly overrides?: Record<string, PackOverride>;
}

/**
 * A whole evaluation environment as a value. Every fact the vocabulary
 * declares gets a record — positive for the named ones, negative WITH A REASON
 * for the rest — because a failed leaf with no reason is the exact defect
 * DETC-03 exists to prevent.
 */
function environment(options: EnvironmentOptions): PackEvaluationEnvironment {
  const facts = new Map<string, EvidenceFact>();
  for (const [id, declaration] of options.vocabulary) {
    const hit = options.detected?.[id];
    if (hit === undefined) {
      facts.set(id, { id, kind: declaration.kind, detected: false, reason: `${id} was not detected in this fixture` });
      continue;
    }
    const fact: EvidenceFact = { id, kind: declaration.kind, detected: true };
    if (typeof hit === "string") fact.path = hit;
    facts.set(id, fact);
  }

  const byName = new Map<string, DeclaredDependency>();
  for (const [name, path] of Object.entries(options.dependencies ?? {})) {
    byName.set(name, { name, path, version: "1.0.0" });
  }

  return {
    vocabulary: options.vocabulary,
    facts,
    paths: new Set(options.paths ?? []),
    dependencies: { byName, undecidable: [], bounded: [] },
    manifest: options.manifest ?? null,
    manifestReason: ".alpha-aos/stack.yaml does not exist at the canonical root",
    overrides: new Map(Object.entries(options.overrides ?? {})),
  };
}

function leafIds(leaves: readonly LeafResult[]): string[] {
  return leaves.map((leaf) => leaf.factId);
}

test("an all pack selects only when every leaf holds, and records the failed leaf either way", async () => {
  const vocabulary = await vocabularyIndex();
  const pack: PackDeclaration = { id: "AI_EVAL", evidence: { all: ["model-sdk", "eval-assets"] } };

  const partial = evaluatePack(pack, environment({ vocabulary, detected: { "model-sdk": "package.json" } }));
  assert.notEqual(partial.status, "selected");
  assert.deepEqual(leafIds(partial.satisfied), ["model-sdk"]);
  assert.deepEqual(leafIds(partial.failed), ["eval-assets"]);

  const complete = evaluatePack(
    pack,
    environment({ vocabulary, detected: { "model-sdk": "package.json", "eval-assets": "evals" } }),
  );
  assert.equal(complete.status, "selected");
  assert.deepEqual(leafIds(complete.satisfied), ["eval-assets", "model-sdk"]);
  assert.deepEqual(complete.failed, []);
});

test("an any pack selects on one leaf and still records the leaves that failed", async () => {
  const vocabulary = await vocabularyIndex();
  const pack: PackDeclaration = { id: "MCP_SERVER", evidence: { any: ["mcp-sdk-dependency", "mcp-server-manifest"] } };
  const evaluation = evaluatePack(
    pack,
    environment({ vocabulary, detected: { "mcp-sdk-dependency": "package.json" } }),
  );

  assert.equal(evaluation.status, "selected");
  // No short-circuit: the second leaf is still computed, and it says why.
  assert.deepEqual(leafIds(evaluation.failed), ["mcp-server-manifest"]);
  assert.ok((evaluation.failed[0]?.reason ?? "").length > 0);
});

test("anyFiles and anyDependencies synthesize their leaf ids from operator plus matched literal", async () => {
  const vocabulary = await vocabularyIndex();

  const container = evaluatePack(
    { id: "CONTAINER", evidence: { anyFiles: ["Dockerfile", "compose.yml"] } },
    environment({ vocabulary, paths: ["Dockerfile"] }),
  );
  assert.equal(container.status, "selected");
  assert.deepEqual(leafIds(container.satisfied), ["file:Dockerfile"]);
  assert.deepEqual(leafIds(container.failed), ["file:compose.yml"]);
  assert.equal(container.satisfied[0]?.path, "Dockerfile");

  const web = evaluatePack(
    { id: "WEB_REACT", evidence: { anyDependencies: ["react", "next"] } },
    environment({ vocabulary, dependencies: { react: "package.json" } }),
  );
  assert.equal(web.status, "selected");
  assert.deepEqual(leafIds(web.satisfied), ["dependency:react"]);
  assert.deepEqual(leafIds(web.failed), ["dependency:next"]);
});

test("manifestOptIn synthesizes a leaf id with the manifest prefix already in use", async () => {
  const vocabulary = await vocabularyIndex();
  const pack: PackDeclaration = { id: "RESEARCH_SCIENTIFIC", evidence: { manifestOptIn: "scientificResearch" } };

  const absent = evaluatePack(pack, environment({ vocabulary }));
  assert.deepEqual(leafIds(absent.failed), ["manifest:scientificResearch"]);
  assert.equal(absent.status, "silent");

  const optedIn = evaluatePack(
    pack,
    environment({ vocabulary, manifest: { schemaVersion: 1, scientificResearch: true } }),
  );
  assert.equal(optedIn.status, "selected");
  assert.deepEqual(leafIds(optedIn.satisfied), ["manifest:scientificResearch"]);
});

test("a nested evidence node inside any evaluates and contributes its flattened leaves", async () => {
  const vocabulary = await vocabularyIndex();
  const pack: PackDeclaration = {
    id: "NESTED",
    evidence: { any: ["web-framework", { all: ["existing-source", "openapi"] }] },
  };

  const partial = evaluatePack(pack, environment({ vocabulary, detected: { "existing-source": "src" } }));
  assert.equal(partial.status, "near-miss");
  assert.deepEqual(leafIds(partial.satisfied), ["existing-source"]);
  assert.deepEqual(leafIds(partial.failed), ["openapi", "web-framework"]);

  const whole = evaluatePack(
    pack,
    environment({ vocabulary, detected: { "existing-source": "src", openapi: "openapi.yaml" } }),
  );
  assert.equal(whole.status, "selected");
  assert.deepEqual(leafIds(whole.satisfied), ["existing-source", "openapi"]);
});

test("a pack naming a deliberately unimplemented fact is unimplemented and names the requirement", async () => {
  const vocabulary = await vocabularyIndex();
  const evaluation = evaluatePack(
    { id: "SECURITY_REVIEW", evidence: { any: ["auth-change", "secrets"] } },
    environment({ vocabulary }),
  );

  assert.equal(evaluation.status, "unimplemented");
  assert.deepEqual(evaluation.deferred, [
    { factId: "auth-change", deferredTo: "GATE-01" },
    { factId: "secrets", deferredTo: "GATE-01" },
  ]);
  assert.match(evaluation.explanation, /GATE-01/u);
});

test("a pack whose only satisfied leaf is a broad fact is never selected on that leaf alone", async () => {
  const vocabulary = await vocabularyIndex();
  assert.equal(vocabulary.get("agent-runtime-config")?.broad, true);

  const broadOnly = evaluatePack(
    { id: "AGENT_RUNTIME", evidence: { any: ["agent-sdk-dependency", "agent-runtime-config"] } },
    environment({ vocabulary, detected: { "agent-runtime-config": "AGENTS.md" } }),
  );
  assert.notEqual(broadOnly.status, "selected");
  assert.deepEqual(leafIds(broadOnly.satisfied), ["agent-runtime-config"]);
  assert.deepEqual(leafIds(broadOnly.failed), ["agent-sdk-dependency"]);

  // The same pack WITH a non-broad leaf selects: the rule bounds the broad
  // fact, it does not disqualify the pack.
  const withSdk = evaluatePack(
    { id: "AGENT_RUNTIME", evidence: { any: ["agent-sdk-dependency", "agent-runtime-config"] } },
    environment({
      vocabulary,
      detected: { "agent-runtime-config": "AGENTS.md", "agent-sdk-dependency": "package.json" },
    }),
  );
  assert.equal(withSdk.status, "selected");
});

test("every failed leaf carries a reason sourced from the evidence envelope's negative record", async () => {
  const vocabulary = await vocabularyIndex();
  const evaluation = evaluatePack(
    { id: "DEPLOYMENT", evidence: { any: ["deploy-workflow", "release-workflow", "kubernetes", "terraform"] } },
    environment({ vocabulary }),
  );

  assert.equal(evaluation.failed.length, 4);
  for (const leaf of evaluation.failed) {
    assert.equal(leaf.reason, `${leaf.factId} was not detected in this fixture`);
  }
});

test("every one of the 15 declared packs is evaluated with both a satisfied and a failed array", async (context) => {
  const root = await reactFixture(context);
  const result = await runCli(["project", "plan", root, "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const plan = JSON.parse(result.stdout) as {
    evaluations: Array<{ packId: string; status: string; satisfied: unknown[]; failed: unknown[] }>;
  };
  assert.equal(plan.evaluations.length, 15);
  for (const evaluation of plan.evaluations) {
    assert.ok(Array.isArray(evaluation.satisfied), `${evaluation.packId} has no satisfied array`);
    assert.ok(Array.isArray(evaluation.failed), `${evaluation.packId} has no failed array`);
  }
});

test("an instructions document alone leaves AGENT_RUNTIME unselected against a real repository", async (context) => {
  const root = await scratchRoot(context, "agents");
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");

  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const agentRuntime = plan.evaluations.find((evaluation) => evaluation.packId === "AGENT_RUNTIME");

  assert.ok(agentRuntime);
  assert.notEqual(agentRuntime.status, "selected");
  assert.deepEqual(leafIds(agentRuntime.satisfied), ["agent-runtime-config"]);
  assert.deepEqual(leafIds(agentRuntime.failed), ["agent-sdk-dependency"]);
  assert.equal(plan.selected.includes("AGENT_RUNTIME"), false);
});

test("the API and DEPLOYMENT packs both evaluate and select on their declared evidence", async (context) => {
  const root = await scratchRoot(context, "api");
  await mkdir(join(root, "src", "routes"), { recursive: true });
  await writeFile(join(root, "terraform.tf"), "# terraform\n", "utf8");

  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  assert.ok(plan.selected.includes("API"), `API not selected: ${plan.selected.join(", ")}`);
  assert.ok(plan.selected.includes("DEPLOYMENT"), `DEPLOYMENT not selected: ${plan.selected.join(", ")}`);
});

test("MCP_SERVER selects on a declared MCP SDK dependency", async (context) => {
  const root = await scratchRoot(context, "mcp");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "mcp-fixture", dependencies: { "@modelcontextprotocol/sdk": "1.30.0" } }),
    "utf8",
  );

  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(plan.selected.includes("MCP_SERVER"), `MCP_SERVER not selected: ${plan.selected.join(", ")}`);
  const mcp = plan.evaluations.find((evaluation) => evaluation.packId === "MCP_SERVER");
  assert.ok(mcp);
  assert.deepEqual(
    mcp.satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["mcp-sdk-dependency", "package.json"]],
  );
});

test("the security pack is unimplemented naming GATE-01, and its manifest opt-in branch selects", async (context) => {
  const bare = await scratchRoot(context, "security");
  const unopted = await planProjectCapabilities({ path: bare, packageRoot: repositoryRoot });
  const silentSecurity = unopted.evaluations.find((evaluation) => evaluation.packId === "SECURITY_REVIEW");

  assert.ok(silentSecurity);
  assert.equal(silentSecurity.status, "unimplemented");
  assert.deepEqual(
    silentSecurity.deferred.map((entry) => entry.factId),
    ["auth-change", "command-execution", "payments", "public-api", "secrets", "sensitive-data", "trust-boundary", "user-input"],
  );
  for (const entry of silentSecurity.deferred) assert.equal(entry.deferredTo, "GATE-01");
  assert.match(silentSecurity.explanation, /GATE-01/u);

  const opted = await scratchRoot(context, "security-optin");
  await mkdir(join(opted, ".alpha-aos"), { recursive: true });
  await writeFile(join(opted, ".alpha-aos", "stack.yaml"), "schemaVersion: 1\nsecurityReview: true\n", "utf8");
  const plan = await planProjectCapabilities({ path: opted, packageRoot: repositoryRoot });

  assert.ok(plan.selected.includes("SECURITY_REVIEW"), `not selected: ${plan.selected.join(", ")}`);
  const selectedSecurity = plan.evaluations.find((evaluation) => evaluation.packId === "SECURITY_REVIEW");
  assert.deepEqual(
    selectedSecurity?.satisfied.map((leaf) => leaf.factId),
    ["manifest:securityReview"],
  );
});

// ---------------------------------------------------------------------------
// Plan 02-07 Task 2: near-miss classification, the bound, uniform rendering,
// `--why` and `--project <rel>`
// ---------------------------------------------------------------------------

function syntheticLeaf(factId: string, detected: boolean): LeafResult {
  return {
    factId,
    detected,
    path: detected ? "package.json" : null,
    reason: detected ? null : `${factId} was not detected`,
    broad: false,
    phrase: `the ${factId} signal`,
  };
}

/** A near-miss evaluation with a chosen satisfied-leaf count, for ordering and cap tests. */
function syntheticNearMiss(packId: string, satisfiedCount: number): PackEvaluation {
  const satisfied = Array.from({ length: satisfiedCount }, (_unused, index) =>
    syntheticLeaf(`${packId.toLowerCase()}-hit-${index}`, true),
  );
  const failed = [syntheticLeaf(`${packId.toLowerCase()}-miss`, false)];
  return {
    packId,
    status: "near-miss",
    satisfied,
    failed,
    deferred: [],
    undeclared: [],
    explanation: `${packId}: ${satisfied[0]?.phrase ?? ""} — missing: ${failed[0]?.phrase ?? ""}`,
    overrideReason: null,
  };
}

function syntheticPlan(evaluations: PackEvaluation[]): ProjectCapabilityPlan {
  return {
    schemaVersion: 1,
    scope: { canonicalRoot: "/tmp/fixture", rootReason: "standalone-directory", projectId: "0".repeat(16), subProjectPath: null },
    owner: { id: "alpha-aos", producer: { name: "alpha-aos", version: "0.0.0" } },
    source: [],
    renderer: { id: "ecc-skill/identity", version: "0.0.0", identity: true, note: "identity render" },
    targetPreState: [],
    adapterSupport: { claude: "supported", codex: "unverified", pi: "unverified", antigravity: "unsupported", hermes: "unsupported" },
    adapterSupportEvidence: [],
    approvals: [],
    safeInverse: [],
    executable: null,
    executableDisposition: { deferredTo: "phase-3-capability-materialization", reason: "phase 2 spawns nothing" },
    receiptDirectory: ".alpha-aos/receipts",
    evaluations,
    selected: [],
    applicable: [],
    nearMissOrder: rankNearMisses(evaluations).map((evaluation) => evaluation.packId),
    subProjects: [],
    hostNotes: [],
    scanBounds: [],
    undecidableBoundaries: [],
    excludedBoundaries: [],
    droppedMembers: [],
    manifestDigest: null,
    inputsDigest: "0".repeat(64),
    evidenceDigest: "1".repeat(64),
    planDigest: "2".repeat(64),
  };
}

/** The phrase the renderer must use, derived here from the declaration itself. */
function expectedPhrase(declaration: FactDeclaration | undefined): string {
  const collapsed = (declaration?.description ?? "").replace(/\s+/gu, " ").trim();
  const stop = collapsed.search(/\.(?:\s|$)/u);
  return stop === -1 ? collapsed : collapsed.slice(0, stop);
}

/** A workspace whose two members carry different evidence. */
async function workspaceFixture(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "workspace");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "monorepo", private: true, workspaces: ["packages/*"] }),
    "utf8",
  );
  await mkdir(join(root, "packages", "api"), { recursive: true });
  await mkdir(join(root, "packages", "web"), { recursive: true });
  await writeFile(
    join(root, "packages", "api", "package.json"),
    JSON.stringify({ name: "api", dependencies: { express: "4.0.0" } }),
    "utf8",
  );
  await writeFile(
    join(root, "packages", "web", "package.json"),
    JSON.stringify({ name: "web", dependencies: { react: "19.0.0" } }),
    "utf8",
  );
  return root;
}

test("more near-miss packs than the cap print exactly the cap plus a suppression line naming --why", () => {
  const evaluations = ["A_PACK", "B_PACK", "C_PACK", "D_PACK", "E_PACK", "F_PACK", "G_PACK", "H_PACK"].map(
    (packId, index) => syntheticNearMiss(packId, 8 - index),
  );
  const text = formatProjectPlan(syntheticPlan(evaluations));
  const nearMissLines = text.split("\n").filter((line) => line.startsWith("NEAR-MISS "));

  assert.equal(nearMissLines.length, MAX_NEAR_MISS_LINES);
  assert.equal(evaluations.length > MAX_NEAR_MISS_LINES, true);
  const suppressed = text.split("\n").find((line) => line.includes("suppressed"));
  assert.ok(suppressed, text);
  assert.match(suppressed, /3 more/u);
  assert.match(suppressed, /--why/u);
});

test("the near-miss order is descending satisfied-leaf count, then ascending pack id", () => {
  const evaluations = [
    syntheticNearMiss("ZED", 2),
    syntheticNearMiss("ALPHA", 1),
    syntheticNearMiss("BETA", 2),
    syntheticNearMiss("GAMMA", 3),
  ];
  assert.deepEqual(
    rankNearMisses(evaluations).map((evaluation) => evaluation.packId),
    ["GAMMA", "BETA", "ZED", "ALPHA"],
  );
});

test("--why prints every one of the 15 packs with leaf detail and applies no cap", async (context) => {
  const root = await reactFixture(context);
  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);

  assert.equal(why.status, 0, why.stderr);
  const catalog = await loadPackCatalogStrict(repositoryRoot);
  assert.equal(catalog.value.packs.length, 15);
  for (const pack of catalog.value.packs) {
    assert.ok(why.stdout.includes(`WHY ${pack.id} `), `--why omitted ${pack.id}`);
  }
  assert.equal(why.stdout.includes("suppressed"), false);
  assert.ok(why.stdout.length > plain.stdout.length);
});

test("a pack with zero satisfied leaves produces no default output line", async (context) => {
  const root = await reactFixture(context);
  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);

  assert.equal(plain.status, 0, plain.stderr);
  // CACHE_REDIS matches nothing in a react-only fixture: silent by default,
  // present under --why.
  assert.equal(plain.stdout.includes("CACHE_REDIS"), false, plain.stdout);
  assert.ok(why.stdout.includes("CACHE_REDIS"));
});

test("the agent-runtime near-miss line names the present document and the absent SDK, both from catalog/facts.yaml", async (context) => {
  const root = await scratchRoot(context, "near-miss");
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");
  const result = await runCli(["project", "plan", root]);

  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split("\n").find((entry) => entry.startsWith("NEAR-MISS AGENT_RUNTIME"));
  assert.ok(line, result.stdout);

  const vocabulary = await vocabularyIndex();
  const present = expectedPhrase(vocabulary.get("agent-runtime-config"));
  const missing = expectedPhrase(vocabulary.get("agent-sdk-dependency"));
  assert.ok(present.length > 0);
  assert.ok(missing.length > 0);
  assert.ok(line.includes(present), `${line} does not carry the declared phrase "${present}"`);
  assert.ok(line.includes(missing), `${line} does not carry the declared phrase "${missing}"`);
  assert.ok(line.includes("AGENTS.md"), line);
});

test("--project with an unrecognised value exits non-zero and names the discovered sub-projects", async (context) => {
  const root = await workspaceFixture(context);
  const result = await runCli(["project", "plan", root, "--project", "packages/nope"]);

  assert.notEqual(result.status, 0);
  const message = `${result.stdout}${result.stderr}`;
  assert.match(message, /packages\/api/u);
  assert.match(message, /packages\/web/u);
});

test("from a repository root with no --project, each sub-project reports its own decision and none is selected", async (context) => {
  const root = await workspaceFixture(context);
  const listed = await runCli(["project", "plan", root, "--json"]);
  assert.equal(listed.status, 0, listed.stderr);

  const plan = JSON.parse(listed.stdout) as {
    selected: string[];
    subProjects: Array<{ path: string; selected: string[] }>;
  };
  assert.deepEqual(plan.selected, []);
  assert.deepEqual(plan.subProjects.map((member) => member.path), ["packages/api", "packages/web"]);
  assert.ok(plan.subProjects.find((member) => member.path === "packages/api")?.selected.includes("API"));
  assert.ok(plan.subProjects.find((member) => member.path === "packages/web")?.selected.includes("WEB_REACT"));

  const targeted = JSON.parse((await runCli(["project", "plan", root, "--project", "packages/web", "--json"])).stdout) as {
    scope: { subProjectPath: string | null };
    selected: string[];
  };
  assert.equal(targeted.scope.subProjectPath, "packages/web");
  assert.ok(targeted.selected.includes("WEB_REACT"));
});

// ---------------------------------------------------------------------------
// Plan 02-11 Task 2 (CR-01): every project verb terminates on a git root that
// contains a nested manifest
// ---------------------------------------------------------------------------
//
// `workspaceFixture` above is a bare `mkdtemp` directory, so the canonical-root
// ladder answers `standalone-directory` at the member and the recursion happens
// to bottom out. The shape a user actually has is that same workspace INSIDE a
// repository, and there the ladder used to climb back to the `.git` root on
// every descent, re-discover the same members, and never terminate. Every
// assertion below therefore runs under a hard timeout: a regression must be a
// red assertion on `timedOut`, never a stalled suite (T-02-43).

interface BoundedRunResult extends RunResult {
  /** True when the runner killed the child rather than the child exiting. */
  readonly timedOut: boolean;
}

/**
 * `runCli` with a wall-clock bound. On expiry the child is SIGKILLed and the
 * result says so, so a non-termination defect fails an assertion instead of
 * hanging `node --test` until the CI job is cancelled.
 */
function runCliBounded(
  args: readonly string[],
  options: { readonly timeoutMs: number; readonly environment?: Record<string, string | undefined> },
): Promise<BoundedRunResult> {
  const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
  for (const [name, value] of Object.entries(options.environment ?? {})) {
    if (value === undefined) delete childEnvironment[name];
    else childEnvironment[name] = value;
  }
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: repositoryRoot,
      windowsHide: true,
      env: childEnvironment,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolveRun({ status: null, stdout, stderr, timedOut: true });
    }, options.timeoutMs);
    child.on("close", (status) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolveRun({ status, stdout, stderr, timedOut: false });
    });
  });
}

/** The budget every bounded assertion in this plan runs under. */
const TERMINATION_BUDGET_MS = 30000;

/**
 * `workspaceFixture`'s shape made into a REAL repository by git itself, because
 * the defect is precisely about what the `.git` entry does to the root ladder.
 * Returns null when git is unavailable, having already skipped the test.
 */
async function gitWorkspaceFixture(context: TestContext): Promise<string | null> {
  const parent = await scratchRoot(context, "git-workspace");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return null;
  }
  const root = created.fixture.path;
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "monorepo", private: true, workspaces: ["packages/*"] }),
    "utf8",
  );
  await mkdir(join(root, "packages", "api"), { recursive: true });
  await mkdir(join(root, "packages", "web"), { recursive: true });
  await writeFile(
    join(root, "packages", "api", "package.json"),
    JSON.stringify({ name: "api", dependencies: { express: "4.0.0" } }),
    "utf8",
  );
  await writeFile(
    join(root, "packages", "web", "package.json"),
    JSON.stringify({ name: "web", dependencies: { react: "19.0.0" } }),
    "utf8",
  );
  return root;
}

/**
 * Why a member the fixture wrote is missing from a plan, in the walk's and the
 * discovery's own words.
 *
 * A bare `deepEqual` on the member list says only that one is absent, and an
 * absence has at least four distinct causes here — the scan excluded it, a
 * bound was reached, the declaration glob did not match it, or the declaration
 * file was unreadable and reported as absent. Re-deriving the discovery from
 * the still-present fixture turns any recurrence into a statement of which one,
 * which is the same standard this phase holds the product to.
 */
async function discoveryDiagnostics(root: string): Promise<string> {
  try {
    const canonical = await resolveCanonicalRoot(root);
    const scan = await scanProjectTree(canonical);
    const discovery = await discoverSubProjects(canonical, { scan });
    return JSON.stringify(
      {
        canonicalRoot: canonical.root,
        rootReason: canonical.reason,
        directories: scan.directories,
        excludedBoundaries: scan.excludedBoundaries,
        bounds: scan.bounds,
        declarations: discovery.declarations,
        discovered: discovery.subProjects.map((member) => member.path),
        dropped: discovery.dropped,
      },
      null,
      2,
    );
  } catch (error) {
    return `diagnostics could not be gathered: ${error instanceof Error ? error.message : String(error)}`;
  }
}

test("project plan terminates on a git root holding a nested manifest and lists both members", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;

  const result = await runCliBounded(["project", "plan", root, "--json"], { timeoutMs: TERMINATION_BUDGET_MS });

  assert.equal(result.timedOut, false, "project plan did not terminate on a git root holding a nested manifest");
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout) as {
    selected: string[];
    subProjects: Array<{ path: string; selected: string[] }>;
  };
  const listed = plan.subProjects.map((member) => member.path);
  assert.deepEqual(
    listed,
    ["packages/api", "packages/web"],
    `the plan listed ${JSON.stringify(listed)}; discovery re-derived from the same fixture reports:\n${await discoveryDiagnostics(root)}`,
  );
  assert.deepEqual(plan.selected, [], "a root with sub-projects selects nothing itself");
});

test("a sub-project planned from a git root carries its own evidence, not the repository root's", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;

  const web = await runCliBounded(["project", "plan", root, "--project", "packages/web", "--json"], {
    timeoutMs: TERMINATION_BUDGET_MS,
  });
  assert.equal(web.timedOut, false, "project plan --project packages/web did not terminate");
  assert.equal(web.status, 0, web.stderr);
  const webPlan = JSON.parse(web.stdout) as {
    scope: { subProjectPath: string | null; rootReason: string };
    selected: string[];
  };
  assert.equal(webPlan.scope.subProjectPath, "packages/web");
  // Task 1 decision (option-a): a root the tool DESCENDED to reports
  // `project-declaration`, never `explicit-override`, so a reviewer can tell it
  // apart from a root the user typed. The value is contract: it folds into
  // `planDigest`, and an approved plan is committed under `.alpha-aos/`.
  assert.equal(webPlan.scope.rootReason, "project-declaration");
  assert.ok(webPlan.selected.includes("WEB_REACT"), webPlan.selected.join(","));
  assert.equal(webPlan.selected.includes("API"), false, "the member borrowed the sibling's evidence");

  const api = await runCliBounded(["project", "plan", root, "--project", "packages/api", "--json"], {
    timeoutMs: TERMINATION_BUDGET_MS,
  });
  assert.equal(api.timedOut, false, "project plan --project packages/api did not terminate");
  assert.equal(api.status, 0, api.stderr);
  const apiPlan = JSON.parse(api.stdout) as { selected: string[] };
  assert.ok(apiPlan.selected.includes("API"), apiPlan.selected.join(","));
  assert.equal(apiPlan.selected.includes("WEB_REACT"), false, "the member borrowed the sibling's evidence");
});

test("project status and project approve --apply both terminate on a git root holding a nested manifest", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;
  const stateRoot = await scratchRoot(context, "git-workspace-state");

  const status = await runCliBounded(["project", "status", root], {
    timeoutMs: TERMINATION_BUDGET_MS,
    environment: { ALPHA_AOS_STATE_DIR: stateRoot },
  });
  assert.equal(status.timedOut, false, "project status did not terminate");
  assert.equal(status.status, 0, status.stderr);

  const preview = await runCliBounded(["project", "approve", root], {
    timeoutMs: TERMINATION_BUDGET_MS,
    environment: { ALPHA_AOS_STATE_DIR: stateRoot },
  });
  assert.equal(preview.timedOut, false, "project approve preview did not terminate");
  assert.equal(preview.status, 0, preview.stderr);
  const digest = planDigestOf(preview.stdout);

  const applied = await runCliBounded(["project", "approve", root, "--plan-digest", digest, "--apply"], {
    timeoutMs: TERMINATION_BUDGET_MS,
    environment: { ALPHA_AOS_STATE_DIR: stateRoot },
  });
  assert.equal(applied.timedOut, false, "project approve --apply did not terminate");
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), true, "the approved apply wrote no artifact");
});

test("the same git root fixture with .git removed keeps working exactly as it did", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;
  await rm(join(root, ".git"), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });

  const result = await runCliBounded(["project", "plan", root, "--json"], { timeoutMs: TERMINATION_BUDGET_MS });

  assert.equal(result.timedOut, false, "the pre-existing passing case regressed into a hang");
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout) as { subProjects: Array<{ path: string }> };
  assert.deepEqual(plan.subProjects.map((member) => member.path), ["packages/api", "packages/web"]);
});

test("a caller that names the git root reports explicit-override, which a descent never does", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;
  const member = join(root, "packages", "web");

  const named = await planProjectCapabilities({
    path: member,
    packageRoot: repositoryRoot,
    explicitRoot: member,
  });
  assert.equal(named.scope.rootReason, "explicit-override", "a root the caller pinned lost its rung");

  const descended = await planProjectCapabilities({
    path: root,
    packageRoot: repositoryRoot,
    subProject: "packages/web",
  });
  assert.equal(descended.scope.rootReason, "project-declaration");
  assert.equal(descended.scope.canonicalRoot, named.scope.canonicalRoot, "the two routes disagree on the root");
});

test("a canonical root repeated inside one recursion is a named refusal rather than another scan", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;
  const canonical = await resolveCanonicalRoot(root);

  await assert.rejects(
    async () =>
      planProjectCapabilities({
        path: root,
        packageRoot: repositoryRoot,
        visitedRoots: new Set([canonical.root]),
      }),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      assert.ok(
        message.includes(canonical.root),
        `the refusal did not name the repeated canonical root:\n${message}`,
      );
      return true;
    },
  );
});

test("a descended member describes its own members once and does not fan out", async (context) => {
  const root = await gitWorkspaceFixture(context);
  if (root === null) return;

  const member = await planProjectCapabilities({
    path: root,
    packageRoot: repositoryRoot,
    subProject: "packages/web",
  });
  assert.deepEqual(member.subProjects, [], "a member's plan is about the member, not about its children");
});

// ---------------------------------------------------------------------------
// Plan 02-07 Task 3: D-06 pack overrides recorded as evidence
// ---------------------------------------------------------------------------

/** Mirrors `withManifest` in test/project.test.ts: a root carrying one manifest. */
async function withManifest(context: TestContext, manifest: string, extras: Record<string, string> = {}): Promise<string> {
  const root = await scratchRoot(context, "override");
  await mkdir(join(root, ".alpha-aos"), { recursive: true });
  await writeFile(join(root, ".alpha-aos", "stack.yaml"), manifest, "utf8");
  for (const [name, content] of Object.entries(extras)) {
    await writeFile(join(root, name), content, "utf8");
  }
  return root;
}

const REACT_PACKAGE = JSON.stringify({ name: "override-fixture", dependencies: { react: "19.0.0" } });

test("a manifest forcing a pack on selects it, with the manifest recorded as the reason", async (context) => {
  const root = await withManifest(context, "schemaVersion: 1\npackOverrides:\n  CACHE_REDIS: force-on\n");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const cache = plan.evaluations.find((evaluation) => evaluation.packId === "CACHE_REDIS");

  assert.ok(plan.selected.includes("CACHE_REDIS"), `not selected: ${plan.selected.join(", ")}`);
  assert.equal(cache?.status, "forced-on");
  assert.match(cache?.overrideReason ?? "", /\.alpha-aos\/stack\.yaml/u);
  assert.match(cache?.overrideReason ?? "", /packOverrides/u);
  assert.match(cache?.explanation ?? "", /packOverrides/u);
});

test("a manifest forcing a pack off leaves it unselected even when its predicate holds", async (context) => {
  const root = await withManifest(
    context,
    "schemaVersion: 1\npackOverrides:\n  WEB_REACT: force-off\n",
    { "package.json": REACT_PACKAGE },
  );
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const web = plan.evaluations.find((evaluation) => evaluation.packId === "WEB_REACT");

  assert.equal(plan.selected.includes("WEB_REACT"), false, `selected: ${plan.selected.join(", ")}`);
  assert.equal(web?.status, "forced-off");
  assert.match(web?.overrideReason ?? "", /packOverrides/u);
});

test("a forced pack still carries its full satisfied and failed leaf arrays", async (context) => {
  const root = await withManifest(
    context,
    "schemaVersion: 1\npackOverrides:\n  WEB_REACT: force-off\n",
    { "package.json": REACT_PACKAGE },
  );
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const web = plan.evaluations.find((evaluation) => evaluation.packId === "WEB_REACT");

  // The override was applied AFTER evaluation, not instead of it.
  assert.deepEqual(leafIds(web?.satisfied ?? []), ["dependency:react"]);
  assert.deepEqual(leafIds(web?.failed ?? []), ["dependency:next"]);
  assert.equal(web?.satisfied[0]?.path, "package.json");
});

test("a manifest that fails validation contributes zero overrides", async (context) => {
  // A duplicate key makes the document ambiguous, so it is invalid and adds
  // nothing rather than partially applying whatever happened to parse.
  const root = await withManifest(
    context,
    "schemaVersion: 1\npackOverrides:\n  CACHE_REDIS: force-on\nschemaVersion: 1\n",
  );
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const cache = plan.evaluations.find((evaluation) => evaluation.packId === "CACHE_REDIS");

  assert.equal(plan.selected.includes("CACHE_REDIS"), false);
  assert.equal(cache?.status, "silent");
  assert.equal(cache?.overrideReason, null);
});

test("--why states the manifest as the reason a forced pack attached", async (context) => {
  const root = await withManifest(context, "schemaVersion: 1\npackOverrides:\n  CACHE_REDIS: force-on\n");
  const result = await runCli(["project", "plan", root, "--why"]);

  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split("\n").find((entry) => entry.startsWith("WHY CACHE_REDIS"));
  assert.ok(line, result.stdout);
  assert.match(line, /forced-on/u);
  assert.match(line, /packOverrides/u);
});

test("a pack naming a fact the vocabulary does not declare is unimplemented, never a plain non-match", async () => {
  const vocabulary = await vocabularyIndex();
  vocabulary.delete("eval-assets");

  const evaluation = evaluatePack(
    { id: "AI_EVAL", evidence: { all: ["model-sdk", "eval-assets"] } },
    environment({ vocabulary, detected: { "model-sdk": "package.json" } }),
  );

  assert.equal(evaluation.status, "unimplemented");
  assert.deepEqual(evaluation.undeclared, ["eval-assets"]);
  assert.match(evaluation.explanation, /eval-assets/u);
  assert.match(evaluation.explanation, /catalog\/facts\.yaml/u);

  // A synthesized inline literal is not a declared fact id and is never
  // mistaken for one.
  const container = evaluatePack(
    { id: "CONTAINER", evidence: { anyFiles: ["Dockerfile"] } },
    environment({ vocabulary, paths: ["Dockerfile"] }),
  );
  assert.deepEqual(container.undeclared, []);
  assert.equal(container.status, "selected");
});

// ---------------------------------------------------------------------------
// Plan 02-08 Task 1: the nine DETC-04 nouns as named fields
// ---------------------------------------------------------------------------
//
// The assertions below read the plan STRUCTURALLY rather than through the
// compiled `ProjectCapabilityPlan` interface. That is deliberate: it is what
// lets the RED run compile and fail on the missing behaviour rather than on a
// missing type, and it keeps `Object.hasOwn` — the thing DETC-04 actually
// demands of a field that may legitimately be null or empty — assertable.

/** One field per DETC-04 noun. A reviewer must be able to read every one. */
const DETC04_FIELDS = [
  "scope",
  "owner",
  "source",
  "renderer",
  "targetPreState",
  "adapterSupport",
  "approvals",
  "safeInverse",
  "inputsDigest",
  "evidenceDigest",
  "planDigest",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object", `expected an object, got ${typeof value}`);
  assert.notEqual(value, null, "expected an object, got null");
  return value as Record<string, unknown>;
}

function asRecordArray(value: unknown, label: string): Array<Record<string, unknown>> {
  assert.ok(Array.isArray(value), `${label} is not an array`);
  return (value as unknown[]).map((entry) => asRecord(entry));
}

/**
 * A named export this plan adds, resolved at run time.
 *
 * Resolving by name rather than by static import is what makes the RED gate
 * honest — the test is discovered and fails on the assertion below, naming the
 * export that does not exist yet, instead of failing to compile.
 */
async function planExport<T>(name: string): Promise<T> {
  const module = (await import("../src/core/project-plan.js")) as unknown as Record<string, unknown>;
  const value = module[name];
  assert.notEqual(value, undefined, `src/core/project-plan.ts does not export ${name}`);
  return value as T;
}

type ResolvePackSource = (lock: StackLock, packId: string, skill: string) => unknown;
type EccComponent = NonNullable<StackLock["components"]["ecc"]>;

/** The real stable lock's ECC component, which every pack source is read from. */
async function eccComponent(): Promise<EccComponent> {
  const lock = await loadLock(repositoryRoot);
  const ecc = lock.components.ecc;
  assert.ok(ecc, "catalog/stack.lock.json has no ECC component");
  return ecc;
}

async function withEcc(mutate: (ecc: EccComponent) => EccComponent): Promise<StackLock> {
  const lock = await loadLock(repositoryRoot);
  const ecc = lock.components.ecc;
  assert.ok(ecc, "catalog/stack.lock.json has no ECC component");
  return { ...lock, components: { ...lock.components, ecc: mutate(ecc) } };
}

/** Pack id to the skills it declares, from the real merged catalog. */
async function skillsByPack(): Promise<Map<string, string[]>> {
  const catalog = await loadPackCatalogStrict(repositoryRoot);
  return new Map(catalog.value.packs.map((pack) => [pack.id, [...(pack.skills ?? [])]]));
}

test("the plan carries every DETC-04 noun as a named field", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));

  for (const field of DETC04_FIELDS) {
    assert.equal(Object.hasOwn(plan, field), true, `the plan has no ${field} field`);
  }
  // The receipt location is a Phase 2 decision Phase 3 inherits, so it travels
  // inside the artifact rather than only inside this repository's source.
  assert.equal(plan.receiptDirectory, ".alpha-aos/receipts");

  const owner = asRecord(plan.owner);
  assert.equal(owner.id, "alpha-aos");
  const producer = asRecord(owner.producer);
  assert.equal(producer.name, "alpha-aos");
  assert.equal(typeof producer.version, "string");
  assert.ok(String(producer.version).length > 0);
});

test("a project with zero selected packs still carries every DETC-04 field, with empty arrays rather than omitted keys", async (context) => {
  const root = await scratchRoot(context, "no-packs");
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));

  assert.deepEqual(plan.selected, []);
  for (const field of DETC04_FIELDS) {
    assert.equal(Object.hasOwn(plan, field), true, `the plan has no ${field} field`);
  }
  assert.deepEqual(plan.source, [], "source is not an empty array");
  assert.deepEqual(plan.targetPreState, [], "targetPreState is not an empty array");
  assert.deepEqual(plan.safeInverse, [], "safeInverse is not an empty array");
  assert.deepEqual(plan.approvals, [], "approvals is not an empty array");
  assert.deepEqual(plan.applicable, [], "applicable is not an empty array");

  // The non-array nouns are present and populated, never omitted.
  assert.equal(typeof asRecord(plan.renderer).id, "string");
  assert.ok(Object.keys(asRecord(plan.adapterSupport)).length > 0);
});

test("each selected pack's source names the locked package, version, integrity and skill hash", async (context) => {
  const root = await reactFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const source = asRecordArray(asRecord(plan).source, "source");
  const ecc = await eccComponent();
  const skills = await skillsByPack();

  assert.ok(source.length > 0, "a selected pack produced no source entry");
  for (const entry of source) {
    assert.equal(entry.package, ecc.package);
    assert.equal(entry.version, ecc.version);
    assert.equal(entry.integrity, ecc.integrity);
    assert.equal(entry.sourceSha256, ecc.sourceSha256[String(entry.skill)]);
    assert.match(String(entry.sourceSha256), /^[0-9a-f]{64}$/u);
    assert.ok(
      skills.get(String(entry.packId))?.includes(String(entry.skill)),
      `${String(entry.packId)} does not declare the skill ${String(entry.skill)}`,
    );
  }

  const expected = plan.selected
    .flatMap((packId) => (skills.get(packId) ?? []).map((skill) => `${packId}/${skill}`))
    .sort();
  assert.deepEqual(source.map((entry) => `${String(entry.packId)}/${String(entry.skill)}`), expected);
});

test("a lock with no source hash for a selected pack's skill is a refusal naming that skill", async () => {
  const resolvePackSource = await planExport<ResolvePackSource>("resolvePackSource");
  const stripped = await withEcc((ecc) => ({ ...ecc, sourceSha256: {} }));

  assert.throws(
    () => resolvePackSource(stripped, "WEB_REACT", "frontend-a11y"),
    /frontend-a11y/u,
    "a missing pack skill hash did not refuse by name",
  );
});

test("pack source resolution never consults the global ECC skill list", async () => {
  const resolvePackSource = await planExport<ResolvePackSource>("resolvePackSource");
  const ecc = await eccComponent();

  // `components.ecc.skills` is the GLOBAL sync list. Emptying it must not stop
  // a pack skill resolving — the two read paths are separate by construction,
  // which is what keeps 19 project-scoped skills out of every user's global
  // skill root.
  const narrowed = await withEcc((component) => ({ ...component, skills: [] }));
  const resolved = asRecord(resolvePackSource(narrowed, "WEB_REACT", "frontend-a11y"));
  assert.equal(resolved.sourceSha256, ecc.sourceSha256["frontend-a11y"]);

  const text = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  assert.equal(/from "\.\/ecc-skills\.js"/u.test(text), false, "project-plan.ts imports the global ECC skill sync module");
  assert.equal(text.includes("selectedSkills"), false, "project-plan.ts names the global skill tuple");
  assert.equal(text.includes("planEccSkillSync"), false, "project-plan.ts reaches the global skill sync plan");
});

test("the renderer is declared as an identity render and every planned target expects the source hash unchanged", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  const renderer = asRecord(plan.renderer);

  assert.equal(renderer.id, "ecc-skill/identity");
  assert.equal(renderer.identity, true);
  assert.equal(typeof renderer.version, "string");
  assert.ok(String(renderer.version).length > 0);

  const bySkill = new Map(
    asRecordArray(plan.source, "source").map((entry) => [`${String(entry.packId)}/${String(entry.skill)}`, String(entry.sourceSha256)]),
  );
  const targets = asRecordArray(plan.targetPreState, "targetPreState");
  assert.ok(targets.length > 0, "a selected pack produced no target pre-state");
  for (const target of targets) {
    assert.equal(target.expectedHash, bySkill.get(`${String(target.packId)}/${String(target.skill)}`));
  }
});

test("the executable slot is an own property whose value is null, and the digestable view carries it too", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));

  assert.equal(Object.hasOwn(plan, "executable"), true, "the plan omits the executable slot");
  assert.equal(plan.executable, null, "the executable slot is not exactly null");

  const disposition = asRecord(plan.executableDisposition);
  assert.match(String(disposition.deferredTo), /phase-3/iu);
  assert.ok(String(disposition.reason).length > 0);

  // The slot Phase 3 fills is already one the DETC-05 drift refusal watches.
  const digestablePlan = await planExport<(value: unknown) => unknown>("digestablePlan");
  const view = asRecord(digestablePlan(plan));
  assert.equal(Object.hasOwn(view, "executable"), true, "the digestable view omits the executable slot");
  assert.equal(view.executable, null);
});

test("safeInverse names an operation and a guard carrying a path and an expected hash for every planned target", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  const applicable = new Set((plan.applicable as string[]) ?? []);
  const planned = asRecordArray(plan.targetPreState, "targetPreState").filter((target) => applicable.has(String(target.packId)));
  const inverses = asRecordArray(plan.safeInverse, "safeInverse");

  assert.ok(planned.length > 0, "no target was planned");
  assert.equal(inverses.length, planned.length);
  for (const inverse of inverses) {
    assert.ok(["remove", "restore"].includes(String(inverse.operation)), `unknown inverse operation ${String(inverse.operation)}`);
    const guard = asRecord(inverse.guard);
    assert.equal(typeof guard.path, "string");
    assert.ok(String(guard.path).length > 0);
    assert.match(String(guard.expectedHash), /^[0-9a-f]{64}$/u);
  }
  assert.deepEqual(
    inverses.map((inverse) => String(asRecord(inverse.guard).path)).sort(),
    planned.map((target) => String(target.path)).sort(),
  );
});

// ---------------------------------------------------------------------------
// Plan 02-08 Task 2: target pre-state, the D-11 conflict, and honest support
// ---------------------------------------------------------------------------

/** The skill WEB_REACT declares, and therefore the path a target conflict sits at. */
const REACT_PACK_SKILL = "frontend-a11y";

/** A react fixture whose Claude project skill root already holds an unowned file. */
async function conflictFixture(context: TestContext): Promise<{ root: string; targetPath: string }> {
  const root = await reactFixture(context);
  await mkdir(join(root, ".claude", "skills", REACT_PACK_SKILL), { recursive: true });
  await writeFile(
    join(root, ".claude", "skills", REACT_PACK_SKILL, "SKILL.md"),
    "# hand-written by somebody else\n",
    "utf8",
  );
  return { root, targetPath: `.claude/skills/${REACT_PACK_SKILL}/SKILL.md` };
}

/** Every file under a root, as sorted `[relative POSIX path, sha256]` pairs. */
async function snapshotTree(root: string): Promise<Array<[string, string]>> {
  const entries: Array<[string, string]> = [];
  async function walk(directory: string, prefix: string): Promise<void> {
    const listing = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of listing) {
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(join(directory, entry.name), relativePath);
        continue;
      }
      entries.push([relativePath, createHash("sha256").update(await readFile(join(directory, entry.name))).digest("hex")]);
    }
  }
  await walk(root, "");
  return entries;
}

test("a target path that does not exist yields a pre-state with exists false and a null current hash", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  const targets = asRecordArray(plan.targetPreState, "targetPreState");

  assert.ok(targets.length > 0, "a selected pack produced no target pre-state");
  for (const target of targets) {
    assert.equal(target.exists, false, `${String(target.path)} unexpectedly exists`);
    assert.equal(target.currentHash, null);
    assert.equal(target.ownedByReceipt, false);
    assert.equal(target.action, "create");
  }
});

test("an unowned file at a pack's target path drops the pack from the applicable set and records the conflict", async (context) => {
  const { root, targetPath } = await conflictFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));

  assert.ok((plan.selected as string[]).includes("WEB_REACT"), "the evidence no longer selects the pack under test");
  assert.equal((plan.applicable as string[]).includes("WEB_REACT"), false, "a conflicting target did not drop the pack");

  const conflicts = asRecordArray(plan.approvals, "approvals").filter((entry) => String(entry.code) === "TARGET_CONFLICT");
  assert.equal(conflicts.length, 1, `expected exactly one conflict approval, got ${conflicts.length}`);
  const detail = String(conflicts[0]?.detail ?? "");
  assert.match(detail, /WEB_REACT/u);
  assert.ok(detail.includes(targetPath), detail);

  const target = asRecord(asRecordArray(plan.targetPreState, "targetPreState").find((entry) => String(entry.path) === targetPath));
  assert.equal(target.exists, true);
  assert.equal(target.ownedByReceipt, false);

  // No inverse is planned for a pack that was dropped.
  assert.equal(
    asRecordArray(plan.safeInverse, "safeInverse").some((entry) => String(entry.packId) === "WEB_REACT"),
    false,
    "a dropped pack still planned an inverse",
  );
});

test("planning a conflicting target renames, moves and overwrites nothing", async (context) => {
  const { root } = await conflictFixture(context);
  const before = await snapshotTree(root);

  await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const rendered = await runCli(["project", "plan", root]);
  assert.equal(rendered.status, 0, rendered.stderr);

  assert.deepEqual(await snapshotTree(root), before, "planning changed the target directory");
});

test("a receipt claiming the target file yields no conflict for that pack", async (context) => {
  const { root, targetPath } = await conflictFixture(context);
  const bytes = await readFile(join(root, ".claude", "skills", REACT_PACK_SKILL, "SKILL.md"), "utf8");
  await mkdir(join(root, ".alpha-aos", "receipts"), { recursive: true });
  await writeFile(
    join(root, ".alpha-aos", "receipts", "WEB_REACT.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        packId: "WEB_REACT",
        producer: { name: "alpha-aos", version: "0.0.0" },
        createdAt: "2026-01-01T00:00:00.000Z",
        sourceHash: "0".repeat(64),
        targets: [{ harness: "claude", kind: "skill", path: targetPath, targetHash: createHash("sha256").update(bytes, "utf8").digest("hex") }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  assert.ok((plan.applicable as string[]).includes("WEB_REACT"), "a receipt-owned target still dropped the pack");
  assert.equal(
    asRecordArray(plan.approvals, "approvals").some((entry) => String(entry.code) === "TARGET_CONFLICT"),
    false,
    "a receipt-owned target still reported a conflict",
  );

  const target = asRecord(asRecordArray(plan.targetPreState, "targetPreState").find((entry) => String(entry.path) === targetPath));
  assert.equal(target.exists, true);
  assert.equal(target.ownedByReceipt, true);
});

test("adapterSupport reports one classification per declared harness in the project's own three-value vocabulary", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  const declared = Object.keys((await loadCatalog(repositoryRoot)).harnesses).sort();
  const support = asRecord(plan.adapterSupport);

  assert.deepEqual(Object.keys(support).sort(), declared);
  for (const [harness, value] of Object.entries(support)) {
    assert.ok(
      ["supported", "unsupported", "unverified"].includes(String(value)),
      `${harness} carries ${String(value)}, which is not one of the project's three support classifications`,
    );
  }
});

test("no harness lacking documented project-scope discovery is reported supported", async (context) => {
  const root = await reactFixture(context);
  const plan = asRecord(await planProjectCapabilities({ path: root, packageRoot: repositoryRoot }));
  const support = asRecord(plan.adapterSupport);

  // Only Claude Code's project skill location is documented. Everything else
  // is reported at the confidence it actually has.
  assert.deepEqual(
    Object.entries(support).filter(([, value]) => value === "supported").map(([harness]) => harness),
    ["claude"],
  );
  assert.equal(support.codex, "unverified");
  assert.equal(support.pi, "unverified");
  assert.equal(support.antigravity, "unsupported");
  assert.equal(support.hermes, "unsupported");

  const evidence = asRecordArray(plan.adapterSupportEvidence, "adapterSupportEvidence");
  assert.equal(evidence.length, Object.keys(support).length);
  for (const entry of evidence) {
    assert.equal(support[String(entry.harness)], entry.support);
    assert.ok(String(entry.reason).length > 0, `${String(entry.harness)} states no basis for its classification`);
  }

  // A harness nothing has classified fails CLOSED to unverified.
  const classify = await planExport<(declared: readonly string[]) => Array<Record<string, unknown>>>("classifyAdapterSupport");
  assert.equal(classify(["future-harness"])[0]?.support, "unverified");
});

test("a pack skill colliding with a personal-scope skill records a named host note", async (context) => {
  const root = await reactFixture(context);
  const collidingHome = await scratchRoot(context, "personal-home");
  await mkdir(join(collidingHome, ".claude", "skills", REACT_PACK_SKILL), { recursive: true });
  await writeFile(join(collidingHome, ".claude", "skills", REACT_PACK_SKILL, "SKILL.md"), "# personal\n", "utf8");
  const emptyHome = await scratchRoot(context, "personal-empty");

  const collided = await runCli(["project", "plan", root, "--json"], {
    HOME: collidingHome,
    USERPROFILE: collidingHome,
    CLAUDE_CONFIG_DIR: undefined,
    ANTIGRAVITY_CONFIG_DIR: undefined,
    HERMES_HOME: undefined,
  });
  assert.equal(collided.status, 0, collided.stderr);
  const collidedPlan = JSON.parse(collided.stdout) as {
    approvals: Array<{ code: string; detail: string }>;
    hostNotes: string[];
  };
  // 02-15/WR-01: the collision is a fact about this HOME DIRECTORY, so it is
  // reported outside the digest. It used to be a `SKILL_SHADOWED` approval,
  // and `approvals` folds into `digestablePlan` — which made two reviewers of
  // the identical commit compute different plan digests.
  assert.equal(collidedPlan.hostNotes.length, 1, `expected one host note, got ${collidedPlan.hostNotes.length}`);
  assert.match(collidedPlan.hostNotes[0] ?? "", new RegExp(REACT_PACK_SKILL, "u"));
  assert.deepEqual(
    collidedPlan.approvals.filter((entry) => entry.code === "SKILL_SHADOWED"),
    [],
    "the host-derived collision is still an approval, so it still reaches the digest",
  );

  // Emitted on an OBSERVED collision, never assumed.
  const quiet = await runCli(["project", "plan", root, "--json"], {
    HOME: emptyHome,
    USERPROFILE: emptyHome,
    CLAUDE_CONFIG_DIR: undefined,
    ANTIGRAVITY_CONFIG_DIR: undefined,
    HERMES_HOME: undefined,
  });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.deepEqual((JSON.parse(quiet.stdout) as { hostNotes: string[] }).hostNotes, []);
});

test("the text rendering carries the target pre-state, adapter-support and approval rows", async (context) => {
  const { root, targetPath } = await conflictFixture(context);
  const result = await runCli(["project", "plan", root]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^CONFLICT WEB_REACT /mu, result.stdout);
  assert.ok(result.stdout.includes(targetPath), result.stdout);
  assert.match(result.stdout, /HARNESS\s+SUPPORT\s+BASIS/u, result.stdout);
  assert.match(result.stdout, /^claude\s+supported\s+\S/mu, result.stdout);
  assert.match(result.stdout, /^codex\s+unverified\s+\S/mu, result.stdout);
  assert.match(result.stdout, /^TARGET\s+HARNESS\s+STATE\s+ACTION/mu, result.stdout);
  assert.match(result.stdout, /^APPROVAL PACKAGE_SOURCE /mu, result.stdout);
});

// ---------------------------------------------------------------------------
// Plan 02-08 Task 3: two digests, and byte-identical output on repeated runs
// ---------------------------------------------------------------------------
//
// The byte-stability assertions are the cheapest possible regression net for
// the whole DETC-04 stability claim: if `plan` produces different bytes on two
// runs over an unchanged repository, `approve` refuses its own freshly printed
// digest and the contract collapses.

/** The three files every plan digest is actually computed in. */
const DIGEST_PATH_FILES = ["src/core/evidence.ts", "src/core/project-plan.ts", "src/core/component-session.ts"];

test("a byte change to a read file moves inputsDigest and leaves evidenceDigest unchanged", async (context) => {
  const root = await reactFixture(context);
  const before = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  // Same declared dependencies, different bytes. D-07 keeps a fact to path,
  // name and version, so no individual fact moves — but the AGGREGATE input
  // digest is a different object and must notice.
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<string, unknown>;
  await writeFile(join(root, "package.json"), `${JSON.stringify(manifest, null, 4)}\n`, "utf8");

  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.notEqual(after.inputsDigest, before.inputsDigest, "inputsDigest did not move when a read file changed");
  assert.equal(after.evidenceDigest, before.evidenceDigest, "evidenceDigest moved without any fact changing");
  assert.deepEqual(after.selected, before.selected);
});

test("a dependency that satisfies a declared fact moves both digests", async (context) => {
  const root = await reactFixture(context);
  const before = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.equal(before.selected.includes("MCP_SERVER"), false);

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify(
      { name: "plan-fixture", private: true, dependencies: { react: "^19.0.0", "@modelcontextprotocol/sdk": "^1.0.0" } },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.notEqual(after.inputsDigest, before.inputsDigest);
  assert.notEqual(after.evidenceDigest, before.evidenceDigest, "evidenceDigest did not move when a fact flipped");
  assert.ok(after.selected.includes("MCP_SERVER"), after.selected.join(", "));
});

test("two consecutive project plan runs over an unchanged fixture are byte-identical in text mode", async (context) => {
  const root = await reactFixture(context);
  const first = await runCli(["project", "plan", root]);
  const second = await runCli(["project", "plan", root]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout, "text output is not byte-identical across runs");
  assert.equal(Buffer.byteLength(second.stdout, "utf8"), Buffer.byteLength(first.stdout, "utf8"));
});

test("two consecutive project plan runs over an unchanged fixture are byte-identical in --json mode", async (context) => {
  const root = await reactFixture(context);
  const first = await runCli(["project", "plan", root, "--json"]);
  const second = await runCli(["project", "plan", root, "--json"]);

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(second.stdout, first.stdout, "JSON output is not byte-identical across runs");
  assert.equal(Buffer.byteLength(second.stdout, "utf8"), Buffer.byteLength(first.stdout, "utf8"));
});

test("createdAt is excluded from every digest by construction and never reaches the plan output", async (context) => {
  const root = await reactFixture(context);
  const canonical = await resolveCanonicalRoot(root);
  const envelope = await collectProjectEvidence(canonical);
  assert.match(envelope.createdAt, /^\d{4}-\d{2}-\d{2}T/u);

  // Deterministic proof of exclusion: two envelopes differing ONLY in
  // createdAt normalize to the same digestable evidence. This is exclusion by
  // construction, not by deleting a field after the fact.
  const later = { ...envelope, createdAt: "2099-12-31T23:59:59.999Z" };
  assert.notEqual(later.createdAt, envelope.createdAt);
  assert.deepEqual(digestableEvidence(later), digestableEvidence(envelope));

  // And the clock does advance between real runs while every digest holds still.
  const second = await collectProjectEvidence(canonical);
  assert.ok(Date.parse(second.createdAt) >= Date.parse(envelope.createdAt));

  const firstPlan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const secondPlan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.equal(secondPlan.inputsDigest, firstPlan.inputsDigest);
  assert.equal(secondPlan.evidenceDigest, firstPlan.evidenceDigest);
  assert.equal(secondPlan.planDigest, firstPlan.planDigest);

  const rendered = await runCli(["project", "plan", root, "--json"]);
  const json = JSON.parse(rendered.stdout) as Record<string, unknown>;
  assert.equal(Object.hasOwn(json, "createdAt"), false, "the plan output carries a wall-clock timestamp");
  assert.equal(
    /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(rendered.stdout),
    false,
    "a wall-clock timestamp reached the plan output",
  );
});

test("a canonical root whose name contains non-ASCII characters digests identically across two runs", async (context) => {
  const parent = await mkdtemp(join(tmpdir(), "alpha-aos-unicode-"));
  context.after(async () => rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const root = join(parent, "프로젝트-café-Ω");
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "unicode-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const first = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const second = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  assert.deepEqual(first.selected, ["WEB_REACT"]);
  assert.equal(second.inputsDigest, first.inputsDigest);
  assert.equal(second.evidenceDigest, first.evidenceDigest);
  assert.equal(second.planDigest, first.planDigest);

  const rendered = await runCli(["project", "plan", root, "--json"]);
  const repeated = await runCli(["project", "plan", root, "--json"]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.equal(repeated.stdout, rendered.stdout);
});

test("every hash of a string in the digest path passes an explicit utf8 encoding", async () => {
  let checked = 0;
  for (const file of DIGEST_PATH_FILES) {
    const text = await readFile(join(repositoryRoot, ...file.split("/")), "utf8");
    for (const match of text.matchAll(/\.update\(([\s\S]*?)\)\.digest\(/gu)) {
      checked += 1;
      assert.ok(
        (match[1] ?? "").includes('"utf8"'),
        `${file} hashes without an explicit utf8 encoding: .update(${(match[1] ?? "").trim()})`,
      );
    }
  }
  // Non-vacuous: the gate must actually have found the hash calls it guards.
  assert.ok(checked >= DIGEST_PATH_FILES.length, `the encoding gate inspected only ${checked} hash call(s)`);
});

// ---------------------------------------------------------------------------
// Plan 02-09 Task 1: approve — revalidate, refuse on drift, write under one
// transaction
// ---------------------------------------------------------------------------
//
// DETC-05 is the reviewed-digest contract Phase 1 already implements for the
// ECC, GSD, MCP, isolation and support-bundle components. The assertions below
// therefore test a BINDING, not a second mechanism: every refusal here has to
// come out of `assertPlanUnchanged` over the plan boundary, and every write has
// to go through `applyFileTransaction` with `.alpha-aos` as the only allowed
// root.

/** The approved-plan artifact, relative to the canonical root. Latest only (D-16). */
const PLAN_ARTIFACT_RELATIVE = ".alpha-aos/plan.json";

interface ApproveResult {
  readonly status: string;
  readonly operationId: string | null;
  readonly artifactPath: string;
  readonly plan: ProjectCapabilityPlan;
}

interface ApproveOptions {
  path: string;
  packageRoot: string;
  stateRoot: string;
  expectedDigest: string;
  subProject?: string;
  reviewedPlan?: ProjectCapabilityPlan;
}

type ApproveProjectPlan = (options: ApproveOptions) => Promise<ApproveResult>;

/**
 * A package root the test OWNS, so a lock-drift fixture can move a lock entry
 * without editing the repository's own `catalog/stack.lock.json`.
 */
async function packageRootCopy(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "package-root");
  await cp(join(repositoryRoot, "catalog"), join(root, "catalog"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(root, "schemas"), { recursive: true });
  return root;
}

/** A project fixture plus the managed state root its approve journals into. */
async function approvalFixture(context: TestContext): Promise<{ root: string; stateRoot: string }> {
  const root = await reactFixture(context);
  const stateRoot = await scratchRoot(context, "approve-state");
  return { root, stateRoot };
}

/** Every file under a root EXCEPT the one directory an approve may write inside. */
async function snapshotOutsideArtifactRoot(root: string): Promise<Array<[string, string]>> {
  return (await snapshotTree(root)).filter(([path]) => !path.startsWith(".alpha-aos/"));
}

async function readArtifact(artifactPath: string): Promise<Record<string, unknown>> {
  return asRecord(JSON.parse(await readFile(artifactPath, "utf8")));
}

/** A second react fixture manifest that pulls in one more declared dependency. */
const REACT_PLUS_SDK = `${JSON.stringify(
  { name: "plan-fixture", private: true, dependencies: { react: "^19.0.0", "@modelcontextprotocol/sdk": "^1.0.0" } },
  null,
  2,
)}\n`;

async function expectRefusal(run: () => Promise<unknown>, label: string): Promise<Error> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof Error, `${label} threw a non-Error value`);
    return error;
  }
  assert.fail(`${label} did not refuse`);
}

test("approving a freshly computed plan digest writes the artifact and returns a transaction id", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const result = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: plan.planDigest,
  });

  assert.equal(result.status, "written");
  assert.equal(typeof result.operationId, "string");
  assert.ok((result.operationId ?? "").length > 0, "an approve that wrote reported no transaction id");
  assert.equal(existsSync(result.artifactPath), true, `the artifact was not written at ${result.artifactPath}`);
  assert.ok(
    result.artifactPath.replaceAll("\\", "/").endsWith(PLAN_ARTIFACT_RELATIVE),
    `the artifact was written somewhere other than ${PLAN_ARTIFACT_RELATIVE}: ${result.artifactPath}`,
  );
});

test("a dependency changed between plan and approve refuses, naming both digest prefixes", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await writeFile(join(root, "package.json"), REACT_PLUS_SDK, "utf8");

  const error = await expectRefusal(
    () => approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest }),
    "an approve against changed dependencies",
  );

  assert.match(error.message, /plan-drift/u);
  const observed = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(error.message.includes(plan.planDigest.slice(0, 12)), `the refusal did not name the reviewed digest: ${error.message}`);
  assert.ok(error.message.includes(observed.planDigest.slice(0, 12)), `the refusal did not name the observed digest: ${error.message}`);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a refused approve still wrote the artifact");
});

test("a target file's bytes changed between plan and approve refuses", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await mkdir(join(root, ".claude", "skills", REACT_PACK_SKILL), { recursive: true });
  await writeFile(join(root, ".claude", "skills", REACT_PACK_SKILL, "SKILL.md"), "# somebody else\n", "utf8");

  const error = await expectRefusal(
    () => approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest }),
    "an approve against changed target bytes",
  );
  assert.match(error.message, /plan-drift/u);
});

test("a lock entry changed for a selected pack's skill between plan and approve refuses", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const packageRoot = await packageRootCopy(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot });

  const lockPath = join(packageRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  assert.equal(
    typeof lock.components.ecc.sourceSha256[REACT_PACK_SKILL],
    "string",
    `the lock carries no sourceSha256 for ${REACT_PACK_SKILL}`,
  );
  lock.components.ecc.sourceSha256[REACT_PACK_SKILL] = `${"0".repeat(63)}1`;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  const error = await expectRefusal(
    () => approveProjectPlan({ path: root, packageRoot, stateRoot, expectedDigest: plan.planDigest }),
    "an approve against a changed lock entry",
  );
  assert.match(error.message, /plan-drift/u);
});

test("a project manifest changed between plan and approve refuses", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await mkdir(join(root, ".alpha-aos"), { recursive: true });
  await writeFile(join(root, ".alpha-aos", "stack.yaml"), "schemaVersion: 1\n", "utf8");

  const error = await expectRefusal(
    () => approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest }),
    "an approve against a changed project manifest",
  );
  assert.match(error.message, /plan-drift/u);
});

test("a digest that was never produced refuses without creating the artifact", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");

  const error = await expectRefusal(
    () => approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: "9".repeat(64) }),
    "an approve of a digest that was never printed",
  );
  assert.match(error.message, /plan-drift/u);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a refused approve created the artifact");
});

test("the written artifact round-trips: the three digests and the approved fact set survive a read", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const result = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: plan.planDigest,
  });

  const artifact = await readArtifact(result.artifactPath);
  assert.equal(artifact.approvedDigest, plan.planDigest);
  const stored = asRecord(artifact.plan);
  assert.equal(stored.planDigest, plan.planDigest);
  assert.equal(stored.inputsDigest, plan.inputsDigest);
  assert.equal(stored.evidenceDigest, plan.evidenceDigest);
  assert.deepEqual(stored.selected, plan.selected);
  assert.deepEqual(stored.applicable, plan.applicable);
  assert.deepEqual(stored.source, JSON.parse(JSON.stringify(plan.source)));
  assert.deepEqual(stored.targetPreState, JSON.parse(JSON.stringify(plan.targetPreState)));
});

test("approve writes nothing outside .alpha-aos/", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const before = await snapshotOutsideArtifactRoot(root);

  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest });

  assert.deepEqual(await snapshotOutsideArtifactRoot(root), before, "approve changed a file outside .alpha-aos/");
});

test("a second approve of the same digest reports already-current and writes no new bytes", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const first = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: plan.planDigest,
  });
  const stampBefore = (await stat(first.artifactPath)).mtimeMs;

  const again = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const second = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: again.planDigest,
  });

  assert.equal(second.status, "already-current");
  assert.equal(second.operationId, null, "an already-current approve still opened a transaction");
  assert.equal((await stat(first.artifactPath)).mtimeMs, stampBefore, "an already-current approve rewrote the artifact");
});

test("only one plan artifact exists under .alpha-aos after two approvals, with no history directory", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");

  const first = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: first.planDigest });

  await writeFile(join(root, "package.json"), REACT_PLUS_SDK, "utf8");
  const second = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.notEqual(second.planDigest, first.planDigest, "the fixture did not actually produce a second, different plan");
  const result = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: second.planDigest,
  });
  assert.equal(result.status, "written");

  const entries = (await readdir(join(root, ".alpha-aos"), { withFileTypes: true }))
    .map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`)
    .sort();
  assert.deepEqual(entries, ["plan.json"], `.alpha-aos accumulated more than the latest plan: ${entries.join(", ")}`);
  const artifact = await readArtifact(result.artifactPath);
  assert.equal(artifact.approvedDigest, second.planDigest, "the artifact is not the latest approved plan");
});

/**
 * One entry per DETC-05 noun, naming the field the plan carries it in.
 *
 * The four repository fixtures above prove the END-TO-END refusal path for the
 * nouns a filesystem can move. This table proves the DIFFERENT thing: that no
 * noun sits outside the digestable view — including `renderer`, `adapterSupport`
 * and the `executable` null, whose values are code-derived and cannot be moved
 * by editing a repository at all. A noun whose mutation leaves `planDigest`
 * equal is a change the refusal can never see.
 */
const DETC05_DIGESTED_NOUNS: ReadonlyArray<{
  readonly noun: string;
  readonly field: string;
  readonly mutate: (plan: Record<string, unknown>) => void;
}> = [
  {
    noun: "evidence",
    field: "evidenceDigest",
    mutate: (plan) => {
      plan.evidenceDigest = "f".repeat(64);
    },
  },
  {
    noun: "manifest",
    field: "manifestDigest",
    mutate: (plan) => {
      plan.manifestDigest = "e".repeat(64);
    },
  },
  {
    noun: "stable lock",
    field: "source[0].sourceSha256",
    mutate: (plan) => {
      const entry = asRecordArray(plan.source, "source")[0];
      assert.ok(entry, "the fixture plan selected no pack, so no lock entry could be mutated");
      entry.sourceSha256 = "d".repeat(64);
    },
  },
  {
    noun: "renderer",
    field: "renderer.id",
    mutate: (plan) => {
      asRecord(plan.renderer).id = "ecc-skill/transform";
    },
  },
  {
    noun: "executable",
    field: "executable",
    mutate: (plan) => {
      plan.executable = "/usr/bin/env";
    },
  },
  {
    noun: "adapter capability",
    field: "adapterSupportEvidence[0].support",
    mutate: (plan) => {
      const entry = asRecordArray(plan.adapterSupportEvidence, "adapterSupportEvidence")[0];
      assert.ok(entry, "no harness was classified, so adapter support could not be mutated");
      entry.support = entry.support === "supported" ? "unsupported" : "supported";
    },
  },
  {
    noun: "target bytes",
    field: "targetPreState[0].currentHash",
    mutate: (plan) => {
      const entry = asRecordArray(plan.targetPreState, "targetPreState")[0];
      assert.ok(entry, "the fixture plan planned no target, so no target hash could be mutated");
      entry.currentHash = "c".repeat(64);
    },
  },
];

test("mutating any one of the seven DETC-05 nouns changes the plan digest", async (context) => {
  assert.equal(
    DETC05_DIGESTED_NOUNS.length,
    7,
    "DETC-05 names seven nouns; a shorter table means one was dropped from the coverage claim rather than proven",
  );
  const kind = await planExport<string>("PLAN_DIGEST_KIND");
  const root = await reactFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  // The record and its evidence array must agree, or mutating one would leave
  // the other stating something the digest never sees.
  for (const entry of plan.adapterSupportEvidence) {
    assert.equal(
      plan.adapterSupport[entry.harness],
      entry.support,
      `adapterSupport disagrees with its recorded evidence for ${entry.harness}`,
    );
  }

  const baseline = reviewedDigest(kind, digestablePlan(plan));
  assert.equal(baseline, plan.planDigest, "the digestable view no longer reproduces the sealed plan digest");

  for (const entry of DETC05_DIGESTED_NOUNS) {
    const mutated = structuredClone(plan) as unknown as Record<string, unknown>;
    entry.mutate(mutated);
    const digest = reviewedDigest(kind, digestablePlan(mutated as unknown as ProjectCapabilityPlan));
    assert.notEqual(
      digest,
      baseline,
      `the ${entry.noun} noun (${entry.field}) is outside the digestable view, so a change to it can never refuse an apply`,
    );
  }
});

// ---------------------------------------------------------------------------
// Plan 02-09 Task 2: the `project approve` CLI verb and its preview registration
// ---------------------------------------------------------------------------
//
// D-12 in command form: `plan` previews, `approve` persists, and `--apply`
// belongs to exactly one of them. The assertions below run the built binary,
// because the claim is about the command surface rather than about the module.

/** The `Plan digest:` line every project rendering ends with. */
function planDigestOf(stdout: string): string {
  const line = /^Plan digest: ([0-9a-f]{64})$/mu.exec(stdout);
  assert.ok(line, `no plan digest line in:\n${stdout.slice(-600)}`);
  return line[1] as string;
}

test("project approve is registered in the preview enumeration in its preview form", async () => {
  const source = await readFile(join(repositoryRoot, "test", "preview.test.ts"), "utf8");
  const entries = [...source.matchAll(/args:\s*\[([^\]]*)\]/gu)].map(([, body]) =>
    (body ?? "")
      .split(",")
      .map((part) => part.trim().replace(/^"|"$/gu, ""))
      .filter((part) => part.length > 0),
  );

  assert.ok(
    entries.some((args) => JSON.stringify(args) === JSON.stringify(["project", "approve", "."])),
    'test/preview.test.ts has no PREVIEW_INVOCATIONS entry whose args are exactly ["project", "approve", "."]. ' +
      "Adding a mutating command without adding it there is the regression that enumeration exists to catch.",
  );
  // The list is the PREVIEW enumeration. An --apply entry in it would assert
  // that a live write changes nothing, which is the opposite of the contract.
  assert.equal(
    entries.some((args) => args.includes("approve") && args.includes("--apply")),
    false,
    "an --apply invocation was added to the preview enumeration",
  );
});

test("project approve without --apply previews the approval and writes nothing", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const before = await snapshotTree(root);

  // A managed state root that does NOT exist yet, so "a preview created it" is
  // a question about the command rather than about this fixture.
  const managed = join(stateRoot, "managed");
  const result = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: managed });

  assert.equal(result.status, 0, result.stderr);
  const digest = planDigestOf(result.stdout);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.equal(digest, plan.planDigest, "the preview printed a digest the plan does not produce");
  assert.match(result.stdout, /--plan-digest/u);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a preview wrote the artifact");
  assert.deepEqual(await snapshotTree(root), before, "a preview changed the project tree");
  assert.equal(existsSync(managed), false, "a preview created the managed state root");
});

test("project approve --plan-digest --apply writes the artifact and reports the transaction id", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const result = await runCli(["project", "approve", root, "--plan-digest", plan.planDigest, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), true, "an approved apply wrote no artifact");
  const transaction = /Transaction: (\S+)/u.exec(result.stdout);
  assert.ok(transaction, `the apply printed no transaction id:\n${result.stdout}`);
  assert.ok((transaction[1] ?? "").length > 0);
});

test("project approve --apply without a plan digest refuses, naming the digest the plan would produce", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const result = await runCli(["project", "approve", root, "--apply"], { ALPHA_AOS_STATE_DIR: stateRoot });

  assert.notEqual(result.status, 0, "an apply with no reviewed digest succeeded");
  assert.ok(
    result.stderr.includes(plan.planDigest),
    `the refusal did not name the digest the current plan would produce:\n${result.stderr}`,
  );
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a refused apply wrote the artifact");
});

test("project plan has no --apply route and still writes nothing", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const before = await snapshotTree(root);

  const result = await runCli(["project", "plan", root, "--apply"], { ALPHA_AOS_STATE_DIR: stateRoot });

  // Either shape is acceptable; what is NOT acceptable is an apply route on
  // `plan`. D-12's whole point is that previewing and persisting are two acts.
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "project plan --apply wrote the artifact");
  assert.deepEqual(await snapshotTree(root), before, "project plan --apply changed the project tree");
  if (result.status !== 0) {
    assert.match(result.stderr, /approve/u, `a rejected plan --apply must point at the command that does apply:\n${result.stderr}`);
  }
});

// Phase 3 plan 03-01 opened this gate. What used to assert the blanket
// "not enabled" stub now asserts the contract that replaced it: with no
// approved artifact, `sync --apply` refuses under D-08 and hands back the
// runnable approve command rather than a dead end.
test("project sync --apply with no approved artifact refuses with a runnable approve command", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);

  const result = await runCli(["project", "sync", root, "--apply"], { ALPHA_AOS_STATE_DIR: stateRoot });

  assert.notEqual(result.status, 0, "a sync with no approved artifact was accepted");
  assert.match(result.stderr, /plan-incomplete/u);
  assert.match(result.stderr, /project approve/u);
  assert.match(result.stderr, /--plan-digest/u);
  assert.match(result.stderr, /--apply/u);
  assert.equal(existsSync(join(root, ".alpha-aos", "receipts")), false, "a refused sync created a receipt directory");
});

test("project approve --json carries the same decision as the text rendering", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);

  const text = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: stateRoot });
  const structured = await runCli(["project", "approve", root, "--json"], { ALPHA_AOS_STATE_DIR: stateRoot });

  assert.equal(text.status, 0, text.stderr);
  assert.equal(structured.status, 0, structured.stderr);
  const parsed = asRecord(JSON.parse(structured.stdout));
  assert.equal(typeof parsed.planDigest, "string", "the JSON envelope carries no plan digest field");
  assert.equal(parsed.planDigest, planDigestOf(text.stdout), "text and JSON reported different plan digests");
  assert.equal(parsed.applied, false, "a preview reported itself as applied");
});

// ---------------------------------------------------------------------------
// Plan 02-09 Task 3: D-13 — a refusal that says what changed, and re-approval
// in place
// ---------------------------------------------------------------------------
//
// The load-bearing distinction is D-13's: "a file that was read changed but the
// pack selection is identical" reads very differently from "the selection
// itself changed", and whether re-approval is routine depends entirely on which
// one it is. Plan 02-08's two digests make that a comparison rather than a
// re-derivation.

interface PlanDrift {
  readonly kind: string;
  readonly detail: string;
  readonly joined: readonly string[];
  readonly left: readonly string[];
}

type ClassifyPlanDrift = (reviewed: ProjectCapabilityPlan, revalidated: ProjectCapabilityPlan) => PlanDrift;

/** A react fixture that ALSO declares the MCP SDK, so MCP_SERVER selects. */
async function reactAndSdkFixture(context: TestContext): Promise<string> {
  const root = await reactFixture(context);
  await writeFile(join(root, "package.json"), REACT_PLUS_SDK, "utf8");
  return root;
}

test("a comment appended to a read file yields inputs-changed, and says the selection is unchanged", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  // A key no fact reads: the bytes of a read file move, no observation does.
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "plan-fixture", private: true, description: "an inert edit", dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.notEqual(after.inputsDigest, plan.inputsDigest, "the fixture edit moved no input digest");
  assert.equal(after.evidenceDigest, plan.evidenceDigest, "the fixture edit moved an observation, so it is not the inputs-only case");

  const error = await expectRefusal(
    () =>
      approveProjectPlan({
        path: root,
        packageRoot: repositoryRoot,
        stateRoot,
        expectedDigest: plan.planDigest,
        reviewedPlan: plan,
      }),
    "an approve after an inert edit to a read file",
  );

  assert.match(error.message, /inputs-changed/u);
  assert.match(error.message, /the pack selection is unchanged/u);
});

test("a dependency that selects a new pack yields selection-changed and names the pack that joined", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await writeFile(join(root, "package.json"), REACT_PLUS_SDK, "utf8");
  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const joined = after.selected.filter((packId) => !plan.selected.includes(packId));
  assert.ok(joined.length > 0, "the fixture dependency selected no new pack");

  const error = await expectRefusal(
    () =>
      approveProjectPlan({
        path: root,
        packageRoot: repositoryRoot,
        stateRoot,
        expectedDigest: plan.planDigest,
        reviewedPlan: plan,
      }),
    "an approve after a pack joined the selection",
  );

  assert.match(error.message, /selection-changed/u);
  for (const packId of joined) {
    assert.ok(error.message.includes(packId), `the refusal did not name the pack that joined (${packId}): ${error.message}`);
  }
});

test("a dependency removed that deselects a pack yields selection-changed and names the pack that left", async (context) => {
  const root = await reactAndSdkFixture(context);
  const stateRoot = await scratchRoot(context, "approve-state");
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(plan.selected.includes("WEB_REACT"), `the fixture did not select WEB_REACT: ${plan.selected.join(", ")}`);

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "plan-fixture", private: true, dependencies: { "@modelcontextprotocol/sdk": "^1.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const error = await expectRefusal(
    () =>
      approveProjectPlan({
        path: root,
        packageRoot: repositoryRoot,
        stateRoot,
        expectedDigest: plan.planDigest,
        reviewedPlan: plan,
      }),
    "an approve after a pack left the selection",
  );

  assert.match(error.message, /selection-changed/u);
  assert.ok(error.message.includes("WEB_REACT"), `the refusal did not name the pack that left: ${error.message}`);
});

test("target-bytes, lock, manifest, adapter-support and inputs changes each get their own classification", async (context) => {
  const classifyPlanDrift = await planExport<ClassifyPlanDrift>("classifyPlanDrift");
  const root = await reactFixture(context);
  const reviewed = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const cases: ReadonlyArray<{ kind: string; mutate: (plan: ProjectCapabilityPlan) => void }> = [
    {
      kind: "selection-changed",
      mutate: (plan) => {
        plan.selected = [...plan.selected, "MCP_SERVER"].sort();
      },
    },
    {
      kind: "lock-changed",
      mutate: (plan) => {
        const entry = plan.source[0];
        assert.ok(entry, "the fixture plan carries no pack source");
        entry.sourceSha256 = "d".repeat(64);
      },
    },
    {
      kind: "target-changed",
      mutate: (plan) => {
        const entry = plan.targetPreState[0];
        assert.ok(entry, "the fixture plan planned no target");
        entry.currentHash = "c".repeat(64);
        entry.exists = true;
      },
    },
    {
      kind: "adapter-changed",
      mutate: (plan) => {
        const entry = plan.adapterSupportEvidence[0];
        assert.ok(entry, "the fixture plan classified no harness");
        const flipped = entry.support === "supported" ? "unsupported" : "supported";
        entry.support = flipped;
        plan.adapterSupport[entry.harness] = flipped;
      },
    },
    {
      kind: "manifest-changed",
      mutate: (plan) => {
        plan.manifestDigest = "e".repeat(64);
      },
    },
    {
      kind: "inputs-changed",
      mutate: (plan) => {
        plan.inputsDigest = "b".repeat(64);
      },
    },
  ];

  const kinds = new Set(cases.map((entry) => entry.kind));
  assert.equal(kinds.size, cases.length, "two cases claim the same classification, so the table proves less than it states");

  for (const entry of cases) {
    const revalidated = structuredClone(reviewed);
    entry.mutate(revalidated);
    const drift = classifyPlanDrift(reviewed, revalidated);
    assert.equal(drift.kind, entry.kind, `mutating for ${entry.kind} classified as ${drift.kind}: ${drift.detail}`);
    assert.ok(drift.detail.length > 0, `${entry.kind} produced an empty detail`);
  }
});

test("a refusal carries a runnable re-approval command, and running it succeeds", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const managed = join(stateRoot, "managed");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await writeFile(join(root, "package.json"), REACT_PLUS_SDK, "utf8");
  const refused = await runCli(["project", "approve", root, "--plan-digest", plan.planDigest, "--apply"], {
    ALPHA_AOS_STATE_DIR: managed,
  });
  assert.notEqual(refused.status, 0, "a stale digest was accepted");

  const command = /Re-approve in place with: alpha-aos (.+)$/mu.exec(refused.stderr);
  assert.ok(command, `the refusal carried no re-approval command:\n${refused.stderr}`);
  const argv = (command[1] ?? "").trim().split(/\s+/u);
  const observed = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(argv.includes(observed.planDigest), `the re-approval command does not carry the newly computed digest: ${argv.join(" ")}`);

  const retried = await runCli(argv, { ALPHA_AOS_STATE_DIR: managed });
  assert.equal(retried.status, 0, `the printed re-approval command did not succeed:\n${retried.stderr}`);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), true, "the re-approval wrote no artifact");
});

test("an approve refuses while another writer holds the state root, and writes nothing", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const managed = join(stateRoot, "managed");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const artifactRoot = join(plan.scope.canonicalRoot, ".alpha-aos");

  const proofs = await proveOperationPaths({
    inputs: [
      { role: "target", path: join(artifactRoot, "plan.json") },
      { role: "state", path: managed },
      { role: "journal", path: join(managed, "journal") },
      { role: "snapshot", path: join(managed, "snapshots") },
    ],
    allowedRoots: [artifactRoot, managed],
    requiredRoles: ["target", "state", "journal", "snapshot"],
  });
  assert.equal(proofs.proven, true, `${proofs.code} — ${proofs.detail ?? "no detail"}`);
  const holder = await acquireMutationSession({ stateRoot: managed, proofs, planDigest: plan.planDigest });

  try {
    const result = await runCli(["project", "approve", root, "--plan-digest", plan.planDigest, "--apply"], {
      ALPHA_AOS_STATE_DIR: managed,
    });
    assert.notEqual(result.status, 0, "an approve wrote while another writer held the state root");
    const diagnostics = result.stderr.toLowerCase();
    for (const field of ["operationid", "pid", "startedat", "retry"]) {
      assert.ok(diagnostics.includes(field), `the lock refusal did not name ${field}:\n${result.stderr}`);
    }
    assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a lock-refused approve still wrote the artifact");
  } finally {
    await holder.close();
  }
});

test("two concurrent project approve --apply runs never both write, and leave no partial artifact", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const managed = join(stateRoot, "managed");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const argv = ["project", "approve", root, "--plan-digest", plan.planDigest, "--apply", "--json"];

  const [left, right] = await Promise.all([
    runCli(argv, { ALPHA_AOS_STATE_DIR: managed }),
    runCli(argv, { ALPHA_AOS_STATE_DIR: managed }),
  ]);
  const runs = [left, right];

  const written = runs.filter((run) => run.status === 0 && run.stdout.includes('"status": "written"'));
  assert.equal(written.length, 1, `expected exactly one writer, got ${written.length}:\n${runs.map((run) => `${run.status}|${run.stdout.slice(0, 200)}|${run.stderr.slice(0, 200)}`).join("\n")}`);

  const loser = runs.find((run) => !written.includes(run));
  assert.ok(loser, "no second run was observed");
  if (loser.status !== 0) {
    assert.match(
      loser.stderr,
      /Another writer holds this state root/u,
      `the loser refused for a reason that is not the writer lock:\n${loser.stderr}`,
    );
  } else {
    // The only other legal outcome: the loser ran after the winner finished
    // and found the artifact already current. It must never write a second one.
    assert.match(loser.stdout, /"status": "already-current"/u, `the loser neither refused nor found the plan current:\n${loser.stdout}`);
  }

  // Absent or complete and parseable — never a truncated partial write.
  const artifactPath = join(plan.scope.canonicalRoot, ".alpha-aos", "plan.json");
  if (existsSync(artifactPath)) {
    const artifact = await readArtifact(artifactPath);
    assert.equal(artifact.approvedDigest, plan.planDigest, "the artifact on disk is not the plan that was approved");
    assert.equal(asRecord(artifact.plan).planDigest, plan.planDigest);
  }
});

// ---------------------------------------------------------------------------
// Plan 02-10 / DETC-06: reconciling what is installed against what is true now
// ---------------------------------------------------------------------------
//
// Every new export below is resolved through `planExport` rather than imported
// statically, for the reason that helper already records: a static import of a
// name that does not exist yet fails to COMPILE, and a suite that never ran
// proves nothing. Resolved by name, the RED run discovers the test and fails on
// an assertion that names the missing export.

/** The pack, skill and target the CONTEXT's own `STALE` example is written about. */
const POSTGRES_SKILL = "postgres-patterns";
const POSTGRES_TARGET = `.claude/skills/${POSTGRES_SKILL}/SKILL.md`;
const POSTGRES_PACK = "DB_POSTGRES";

interface ReconciledTargetLike {
  readonly path: string;
  readonly harness: string;
  readonly expectedHash: string;
  readonly currentHash: string | null;
  readonly exists: boolean;
  readonly matches: boolean;
}

interface StaleReasonLike {
  readonly packId: string;
  readonly factId: string;
  readonly named: string;
  readonly sentence: string;
}

interface CapabilityStateLike {
  readonly deployment: string;
  readonly nativeUse: string;
  readonly support: string;
  readonly nativeUseReason: string;
  readonly supportReason: string;
}

interface PackReconciliationLike {
  readonly packId: string;
  /** D-11: the composite. The deployment axis is reachable only through it. */
  readonly capability: CapabilityStateLike;
  readonly receiptPath: string;
  readonly detail: string;
  readonly targets: readonly ReconciledTargetLike[];
  readonly stale: readonly StaleReasonLike[];
  readonly undecidable: ReadonlyArray<{ readonly path: string; readonly errno: string }>;
}

interface GitContextLike {
  readonly available: boolean;
  readonly branch: string | null;
  readonly commit: string | null;
  readonly detached: boolean;
  readonly source: string | null;
  readonly reason: string | null;
}

interface ProjectReconciliationLike {
  readonly plan: ProjectCapabilityPlan;
  readonly approved: ProjectCapabilityPlan | null;
  readonly artifactState: string;
  readonly artifactIssues: ReadonlyArray<{ readonly code: string; readonly documentPath: string }>;
  readonly artifactPath: string;
  readonly unsupportedClaims: readonly string[];
  readonly packs: readonly PackReconciliationLike[];
  readonly git: GitContextLike;
  readonly approvedGit: GitContextLike | null;
  readonly gitNote: string | null;
}

type ReconcileProjectState = (
  options: { path: string; packageRoot: string; subProject?: string },
  host?: { readonly ledger?: CapabilityLedger | null } | null,
) => Promise<ProjectReconciliationLike>;

/** The receipt bytes Phase 3 will write, built here by hand against the real schema. */
async function writeInstalledPack(
  root: string,
  options: { packId: string; target: string; body: string; evidenceHash?: string },
): Promise<{ absolute: string; targetHash: string }> {
  const absolute = join(root, ...options.target.split("/"));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, options.body, "utf8");
  const targetHash = createHash("sha256").update(options.body, "utf8").digest("hex");
  const receipt = {
    schemaVersion: 1,
    packId: options.packId,
    producer: { name: "alpha-aos", version: "0.1.0" },
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceHash: "a".repeat(64),
    ...(options.evidenceHash === undefined ? {} : { evidenceHash: options.evidenceHash }),
    targets: [{ harness: "claude", kind: "skill", path: options.target, targetHash }],
  };
  await mkdir(join(root, ".alpha-aos", "receipts"), { recursive: true });
  await writeFile(
    join(root, ".alpha-aos", "receipts", `${options.packId}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  return { absolute, targetHash };
}

/**
 * A repository whose `pg` dependency selects DB_POSTGRES, with the pack's
 * skill materialized, a receipt claiming it, and the plan approved — in that
 * order, so the approved artifact records the world the receipt describes.
 */
async function installedPostgresFixture(
  context: TestContext,
  options: { dsn?: boolean } = {},
): Promise<{ root: string; stateRoot: string; target: string; targetHash: string }> {
  const root = await scratchRoot(context, "reconcile");
  const stateRoot = await scratchRoot(context, "reconcile-state");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "reconcile-fixture", private: true, dependencies: { pg: "^8.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  if (options.dsn === true) {
    await writeFile(join(root, ".env.example"), "DATABASE_URL=postgres://db.example.invalid/app\n", "utf8");
  }
  const installed = await writeInstalledPack(root, {
    packId: POSTGRES_PACK,
    target: POSTGRES_TARGET,
    body: "# postgres-patterns\n",
  });
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(
    plan.selected.includes(POSTGRES_PACK),
    `the fixture did not select ${POSTGRES_PACK}: ${plan.selected.join(", ")}`,
  );
  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest });
  return { root, stateRoot, target: installed.absolute, targetHash: installed.targetHash };
}

function packStateOf(reconciliation: ProjectReconciliationLike, packId: string): PackReconciliationLike {
  const found = reconciliation.packs.find((pack) => pack.packId === packId);
  assert.ok(
    found,
    `the reconciliation reported no state for ${packId}: ${reconciliation.packs.map((entry) => `${entry.packId}=${entry.capability.deployment}`).join(", ")}`,
  );
  return found;
}

test("an installed pack whose evidence and target bytes are unchanged reports CURRENT", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "CURRENT", pack.detail);
  assert.equal(reconciliation.packs.filter((entry) => entry.capability.deployment === "CURRENT").length, 1);
  assert.equal(pack.targets.length, 1);
  assert.equal(pack.targets[0]?.matches, true);
});

test("removing the dependency that selected an installed pack reports STALE", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root, target } = await installedPostgresFixture(context);

  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "reconcile-fixture", private: true, dependencies: {} }, null, 2)}\n`,
    "utf8",
  );

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "STALE", pack.detail);
  assert.ok(pack.stale.length > 0, "a STALE pack named no missing fact");
  assert.equal(existsSync(target), true, "reporting STALE deleted the installed target");
});

test("editing an installed target's bytes reports DRIFTED", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root, target } = await installedPostgresFixture(context);

  await writeFile(target, "# postgres-patterns\n\nedited by a human\n", "utf8");

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "DRIFTED", pack.detail);
  assert.equal(pack.targets[0]?.matches, false);
  assert.notEqual(pack.targets[0]?.currentHash, pack.targets[0]?.expectedHash);
});

test("an evidence file that exists but cannot be read reports UNDECIDABLE with the errno and path", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);

  // A directory where a file is declared reads as EISDIR on every host, so the
  // case is exercised rather than skipped. A host that could not produce it at
  // all is reported here by name rather than silently not running.
  await rm(join(root, "package.json"), { force: true });
  await mkdir(join(root, "package.json"), { recursive: true });
  if (!existsSync(join(root, "package.json"))) {
    context.skip("this host could not create a directory where a dependency manifest is declared");
    return;
  }

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "UNDECIDABLE", pack.detail);
  assert.ok(pack.undecidable.length > 0, "UNDECIDABLE carried no errno and no path");
  assert.equal(pack.undecidable[0]?.path, "package.json");
  assert.ok((pack.undecidable[0]?.errno ?? "").length > 0, "UNDECIDABLE carried an empty errno");
  assert.ok(pack.detail.includes("package.json"), `the UNDECIDABLE detail did not name the path: ${pack.detail}`);
});

test("a planted plan artifact claiming a pack the evidence does not support reports CHANGED", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const root = await scratchRoot(context, "planted");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "planted-fixture", private: true, dependencies: {} }, null, 2)}\n`,
    "utf8",
  );
  await writeInstalledPack(root, {
    packId: "SECURITY_REVIEW",
    target: ".claude/skills/security-review/SKILL.md",
    body: "# security-review\n",
  });
  // A hand-planted artifact: a record of an approval, never an authority.
  //
  // It is built from a REAL plan value for this root and then edited, because
  // the artifact now travels the same closed schema every other managed
  // document travels — a four-key stub is a rejected document rather than a
  // planted one, and this case is about a schema-valid record disagreeing with
  // the world, not about a malformed one.
  const genuine = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  await writeFile(
    join(root, ".alpha-aos", "plan.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "project-capability-plan",
        approvedDigest: "f".repeat(64),
        plan: {
          ...genuine,
          selected: ["SECURITY_REVIEW"],
          applicable: ["SECURITY_REVIEW"],
          evidenceDigest: "0".repeat(64),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, "SECURITY_REVIEW");

  assert.equal(reconciliation.artifactState, "changed", "the artifact's evidence digest did not disagree with fresh evidence");
  assert.ok(reconciliation.unsupportedClaims.includes("SECURITY_REVIEW"), "the unsupported claim was not named");
  assert.equal(pack.capability.deployment, "CHANGED", pack.detail);
});

test("a malformed receipt refuses by name rather than producing a partially trusted state", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);
  const receiptPath = join(root, ".alpha-aos", "receipts", `${POSTGRES_PACK}.json`);
  await writeFile(receiptPath, `${JSON.stringify({ schemaVersion: 1, packId: POSTGRES_PACK }, null, 2)}\n`, "utf8");

  const error = await expectRefusal(
    () => reconcileProjectState({ path: root, packageRoot: repositoryRoot }),
    "a reconciliation over a malformed receipt",
  );
  assert.ok(
    error.message.includes(`${POSTGRES_PACK}.json`),
    `the refusal did not name the receipt path: ${error.message}`,
  );
});

test("a pack whose target holds a file alpha-AOS did not write reports CONFLICT", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);

  // A second harness root for the same skill, holding bytes no receipt claims.
  const foreign = join(root, ".agents", "skills", POSTGRES_SKILL, "SKILL.md");
  await mkdir(dirname(foreign), { recursive: true });
  await writeFile(foreign, "# a file alpha-AOS did not write\n", "utf8");

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "CONFLICT", pack.detail);
  assert.ok(
    pack.detail.includes(".agents/skills"),
    `the CONFLICT detail did not name the conflicting path: ${pack.detail}`,
  );
});

test("reconciling changes nothing on disk, including under .alpha-aos", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);

  const before = await snapshotTree(root);
  await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const after = await snapshotTree(root);

  assert.deepEqual(after, before, "reconciliation wrote, created or deleted something");
  assert.ok(
    before.some(([path]) => path.startsWith(".alpha-aos/")),
    "the snapshot covered no .alpha-aos/ entry, so it could not have proven one unchanged",
  );
});

// ---------------------------------------------------------------------------
// Plan 02-10 Task 2: `STALE` names the missing fact, plus the branch context
// ---------------------------------------------------------------------------

type ReadGitContext = (canonicalRoot: string) => Promise<GitContextLike>;
type FormatProjectStatus = (
  reconciliation: ProjectReconciliationLike,
  removals: readonly unknown[],
  options: { path: string; subProject?: string | null },
  oneShotOffers?: readonly unknown[],
) => string;

/** A named export from `src/format.ts`, resolved at run time for the same reason `planExport` is. */
async function formatExport<T>(name: string): Promise<T> {
  const module = (await import("../src/format.js")) as unknown as Record<string, unknown>;
  const value = module[name];
  assert.notEqual(value, undefined, `src/format.ts does not export ${name}`);
  return value as T;
}

const NO_DEPENDENCIES = `${JSON.stringify({ name: "branch-fixture", private: true, dependencies: {} }, null, 2)}\n`;
const PG_DEPENDENCY = `${JSON.stringify({ name: "branch-fixture", private: true, dependencies: { pg: "^8.0.0" } }, null, 2)}\n`;

/**
 * A REAL repository whose main branch selects DB_POSTGRES and whose second
 * branch does not, with the pack installed and approved on main.
 *
 * Built by git itself rather than by hand: the thing under test is whether the
 * branch context read from the filesystem matches what git actually produces.
 */
async function branchFixture(
  context: TestContext,
  options: { readonly secondBranch: "removes-evidence" | "removes-nothing" },
): Promise<{ root: string; stateRoot: string; branch: string; target: string } | null> {
  const parent = await scratchRoot(context, "branch");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return null;
  }
  const root = created.fixture.path;
  const stateRoot = await scratchRoot(context, "branch-state");
  const branch = options.secondBranch === "removes-evidence" ? "no-pg" : "docs-only";

  await writeFile(join(root, "package.json"), PG_DEPENDENCY, "utf8");
  const installed = await writeInstalledPack(root, {
    packId: POSTGRES_PACK,
    target: POSTGRES_TARGET,
    body: "# postgres-patterns\n",
  });
  for (const argv of [["add", "-A"], ["commit", "-m", "fixture: install the postgres pack"]]) {
    const run = gitCommand(root, argv);
    if (!run.ok) {
      context.skip(`git ${argv.join(" ")} failed: ${run.stderr.trim() || run.stdout.trim()}`);
      return null;
    }
  }

  const branched = gitCommand(root, ["checkout", "-b", branch]);
  if (!branched.ok) {
    context.skip(`git checkout -b ${branch} failed: ${branched.stderr.trim()}`);
    return null;
  }
  if (options.secondBranch === "removes-evidence") {
    await writeFile(join(root, "package.json"), NO_DEPENDENCIES, "utf8");
  } else {
    await writeFile(join(root, "NOTES.md"), "# notes\n", "utf8");
  }
  for (const argv of [["add", "-A"], ["commit", "-m", `fixture: ${branch}`], ["checkout", "main"]]) {
    const run = gitCommand(root, argv);
    if (!run.ok) {
      context.skip(`git ${argv.join(" ")} failed: ${run.stderr.trim() || run.stdout.trim()}`);
      return null;
    }
  }

  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(plan.selected.includes(POSTGRES_PACK), `the branch fixture did not select ${POSTGRES_PACK} on main`);
  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest });

  return { root, stateRoot, branch, target: installed.absolute };
}

test("a STALE line names the missing fact by name, not merely the pack", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const { root } = await installedPostgresFixture(context);
  await writeFile(join(root, "package.json"), NO_DEPENDENCIES, "utf8");

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);
  assert.equal(pack.capability.deployment, "STALE", pack.detail);

  const sentence = pack.stale[0]?.sentence ?? "";
  assert.ok(sentence.includes(POSTGRES_PACK), `the STALE sentence did not name the pack: ${sentence}`);
  assert.ok(sentence.includes("pg"), `the STALE sentence did not name the dependency that selected it: ${sentence}`);
  // The pack names a DECLARED fact rather than an inline `pg` literal, so the
  // fact id is what identifies it; the specific package names reach the user
  // through the negative record's own reason, which enumerates them.
  assert.equal(pack.stale[0]?.factId, "postgres-driver");
  assert.equal(pack.stale[0]?.named, "postgres-driver");

  const rendered = formatProjectStatus(reconciliation, [], { path: root });
  const stale = rendered.split("\n").filter((line) => line.startsWith("STALE-FACT "));
  assert.equal(stale.length, 1, `expected exactly one STALE line:\n${rendered}`);
  assert.ok(stale[0]?.includes(POSTGRES_PACK) === true && stale[0]?.includes("pg") === true, stale[0] ?? "");
});

test("two facts that disappeared for one pack emit two distinct STALE lines", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const { root } = await installedPostgresFixture(context, { dsn: true });

  await writeFile(join(root, "package.json"), NO_DEPENDENCIES, "utf8");
  await rm(join(root, ".env.example"), { force: true });

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.equal(pack.capability.deployment, "STALE", pack.detail);
  assert.equal(pack.stale.length, 2, `expected two missing facts, got ${pack.stale.map((entry) => entry.factId).join(", ")}`);
  assert.equal(new Set(pack.stale.map((entry) => entry.sentence)).size, 2, "two missing facts produced one merged line");

  const rendered = formatProjectStatus(reconciliation, [], { path: root });
  assert.equal(rendered.split("\n").filter((line) => line.startsWith("STALE-FACT ")).length, 2, rendered);
});

test("readGitContext reports an ordinary repository's branch and commit from the filesystem", async (context) => {
  const readGitContext = await planExport<ReadGitContext>("readGitContext");
  const parent = await scratchRoot(context, "git-ordinary");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }

  const git = await readGitContext(created.fixture.path);
  assert.equal(git.available, true, git.reason ?? "no reason recorded");
  assert.equal(git.branch, "main");
  assert.equal(git.detached, false);
  assert.equal(git.source, "loose");
  assert.match(git.commit ?? "", /^[0-9a-f]{40,64}$/u);
});

test("readGitContext reports a detached HEAD's commit and never guesses a branch", async (context) => {
  const readGitContext = await planExport<ReadGitContext>("readGitContext");
  const parent = await scratchRoot(context, "git-detached");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const attached = await readGitContext(created.fixture.path);
  const detachedRun = gitCommand(created.fixture.path, ["checkout", "--detach", "HEAD"]);
  if (!detachedRun.ok) {
    context.skip(`git checkout --detach failed: ${detachedRun.stderr.trim()}`);
    return;
  }

  const git = await readGitContext(created.fixture.path);
  assert.equal(git.available, true, git.reason ?? "no reason recorded");
  assert.equal(git.detached, true);
  assert.equal(git.branch, null, "a detached HEAD reported a branch it does not have");
  assert.equal(git.commit, attached.commit);
  assert.equal(git.source, "detached");
});

test("readGitContext resolves a branch tip from packed-refs when the loose ref is gone", async (context) => {
  const readGitContext = await planExport<ReadGitContext>("readGitContext");
  const parent = await scratchRoot(context, "git-packed");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const loose = await readGitContext(created.fixture.path);
  const packed = gitCommand(created.fixture.path, ["pack-refs", "--all"]);
  if (!packed.ok) {
    context.skip(`git pack-refs --all failed: ${packed.stderr.trim()}`);
    return;
  }
  if (existsSync(join(created.fixture.path, ".git", "refs", "heads", "main"))) {
    context.skip("this git left the loose ref in place, so the packed-refs branch is not exercised");
    return;
  }

  const git = await readGitContext(created.fixture.path);
  assert.equal(git.available, true, git.reason ?? "no reason recorded");
  assert.equal(git.branch, "main");
  assert.equal(git.commit, loose.commit);
  assert.equal(git.source, "packed");
});

test("readGitContext reports an unparseable .git state as unavailable rather than guessing", async (context) => {
  const readGitContext = await planExport<ReadGitContext>("readGitContext");
  const root = await scratchRoot(context, "git-broken");

  const absent = await readGitContext(root);
  assert.equal(absent.available, false);
  assert.ok((absent.reason ?? "").length > 0, "an absent .git reported no reason");

  await writeFile(join(root, ".git"), "this is not a gitdir pointer\n", "utf8");
  const broken = await readGitContext(root);
  assert.equal(broken.available, false, "an unparseable .git file produced a guess");
  assert.equal(broken.branch, null);
  assert.equal(broken.commit, null);
  assert.ok((broken.reason ?? "").length > 0, "an unparseable .git reported no reason");
});

test("a branch switch that removes evidence yields STALE and a branch-differs note together", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const fixture = await branchFixture(context, { secondBranch: "removes-evidence" });
  if (fixture === null) return;

  const switched = gitCommand(fixture.root, ["checkout", fixture.branch]);
  if (!switched.ok) {
    context.skip(`git checkout ${fixture.branch} failed: ${switched.stderr.trim()}`);
    return;
  }

  const reconciliation = await reconcileProjectState({ path: fixture.root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  // D-15: both facts are present, and neither replaces the other.
  assert.equal(pack.capability.deployment, "STALE", pack.detail);
  assert.equal(reconciliation.git.branch, fixture.branch);
  assert.ok(reconciliation.gitNote !== null, "a branch switch produced no branch-differs note");
  assert.ok((reconciliation.gitNote ?? "").includes("main"), reconciliation.gitNote ?? "");
  assert.ok((reconciliation.gitNote ?? "").includes(fixture.branch), reconciliation.gitNote ?? "");

  const rendered = formatProjectStatus(reconciliation, [], { path: fixture.root });
  assert.ok(rendered.split("\n").some((line) => line.startsWith("STALE-FACT ")), rendered);
  assert.ok(rendered.includes("BRANCH-DIFFERS"), rendered);
  assert.equal(existsSync(fixture.target), true, "a branch switch deleted the installed target");
});

test("a branch switch that removes no evidence yields no STALE and still reports the differing branch", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const fixture = await branchFixture(context, { secondBranch: "removes-nothing" });
  if (fixture === null) return;

  const switched = gitCommand(fixture.root, ["checkout", fixture.branch]);
  if (!switched.ok) {
    context.skip(`git checkout ${fixture.branch} failed: ${switched.stderr.trim()}`);
    return;
  }

  const reconciliation = await reconcileProjectState({ path: fixture.root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  assert.notEqual(pack.capability.deployment, "STALE", `a checkout that removed nothing reported STALE: ${pack.detail}`);
  assert.equal(reconciliation.packs.filter((entry) => entry.capability.deployment === "STALE").length, 0);
  assert.equal(reconciliation.git.branch, fixture.branch);
  assert.ok(reconciliation.gitNote !== null, "a differing branch produced no note");
});

test("an irrelevant commit leaves every digest unchanged while the reported commit differs", async (context) => {
  const readGitContext = await planExport<ReadGitContext>("readGitContext");
  const parent = await scratchRoot(context, "git-digest");
  const created = await createOrdinaryRepository(parent, "repo");
  if (!created.ok) {
    context.skip(created.reason);
    return;
  }
  const root = created.fixture.path;
  await writeFile(join(root, "package.json"), PG_DEPENDENCY, "utf8");

  const before = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const beforeGit = await readGitContext(root);

  // A commit changes git's own state and no working-tree byte an evidence
  // detector reads. If any digest moved, every commit would invalidate every
  // approval — which is exactly why the branch context is context only.
  for (const argv of [["add", "-A"], ["commit", "-m", "fixture: commit what is already on disk"]]) {
    const run = gitCommand(root, argv);
    if (!run.ok) {
      context.skip(`git ${argv.join(" ")} failed: ${run.stderr.trim() || run.stdout.trim()}`);
      return;
    }
  }

  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const afterGit = await readGitContext(root);

  assert.notEqual(afterGit.commit, beforeGit.commit, "the fixture commit did not move HEAD, so nothing was proven");
  assert.equal(after.inputsDigest, before.inputsDigest, "a commit moved inputsDigest");
  assert.equal(after.evidenceDigest, before.evidenceDigest, "a commit moved evidenceDigest");
  assert.equal(after.planDigest, before.planDigest, "a commit moved planDigest");
});

test("the status path reads git from the filesystem and spawns no subprocess", async () => {
  const source = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  for (const forbidden of ["node:child_process", "child_process", "spawnSync", "execFileSync", "execSync"]) {
    assert.equal(
      source.includes(forbidden),
      false,
      `src/core/project-plan.ts reaches for ${forbidden}; plan, approve and status are offline and subprocess-free`,
    );
  }
  assert.ok(source.includes("packed-refs"), "the git context does not handle a packed ref, so a packed repository reports its branch unavailable");
});

// ---------------------------------------------------------------------------
// Plan 02-10 Task 3: the approval-gated removal plan and the `status` verb
// ---------------------------------------------------------------------------

interface RemovalTargetLike {
  readonly path: string;
  readonly harness: string;
  readonly expectedHash: string | null;
  readonly exists: boolean;
}

interface RemovalPlanLike {
  readonly packId: string;
  readonly receiptPath: string;
  readonly targets: readonly RemovalTargetLike[];
  readonly reasons: readonly string[];
  readonly removalDigest: string;
}

type PlanPackRemoval = (reconciliation: ProjectReconciliationLike) => RemovalPlanLike[];

type ApplyPackRemoval = (options: {
  path: string;
  packageRoot: string;
  stateRoot: string;
  removalDigest: string;
}) => Promise<{
  packId: string;
  operationId: string;
  removed: readonly string[];
  removalDigest: string;
}>;

/** A fixture whose installed pack has become stale: the `pg` dependency is gone. */
async function stalePostgresFixture(context: TestContext): Promise<{ root: string; stateRoot: string; target: string }> {
  const fixture = await installedPostgresFixture(context);
  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify({ name: "reconcile-fixture", private: true, dependencies: {} }, null, 2)}\n`,
    "utf8",
  );
  return { root: fixture.root, stateRoot: fixture.stateRoot, target: fixture.target };
}

test("a stale pack yields a removal plan naming every target, its guard hash and its own digest", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await stalePostgresFixture(context);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const removals = planPackRemoval(reconciliation);

  assert.equal(removals.length, 1, `expected one removal plan, got ${removals.map((entry) => entry.packId).join(", ")}`);
  const removal = removals[0];
  assert.ok(removal);
  assert.equal(removal.packId, POSTGRES_PACK);
  assert.equal(removal.targets.length, 1);
  assert.equal(removal.targets[0]?.path, POSTGRES_TARGET);
  assert.match(removal.targets[0]?.expectedHash ?? "", /^[0-9a-f]{64}$/u);
  assert.match(removal.removalDigest, /^[0-9a-f]{64}$/u);
  assert.ok(removal.reasons.length > 0, "a removal plan carried no reason for existing");

  // A removal plan is a VALUE. Building one must not have removed anything.
  assert.equal(existsSync(join(root, ...POSTGRES_TARGET.split("/"))), true);
});

test("a pack that is not stale is offered no removal plan", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await installedPostgresFixture(context);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  assert.equal(packStateOf(reconciliation, POSTGRES_PACK).capability.deployment, "CURRENT");
  assert.deepEqual(planPackRemoval(reconciliation), []);
});

test("project status against a stale fixture leaves every target present with an unchanged hash", async (context) => {
  const { root, target } = await stalePostgresFixture(context);
  const before = await snapshotTree(root);

  const result = await runCli(["project", "status", root]);
  assert.equal(result.status, 0, `project status failed:\n${result.stderr}`);
  assert.ok(result.stdout.includes("STALE-FACT "), `project status printed no STALE-FACT line:\n${result.stdout}`);

  assert.equal(existsSync(target), true, "project status deleted the stale pack's target");
  assert.deepEqual(await snapshotTree(root), before, "project status changed a byte on disk");
});

test("project status prints the removal plan, its digest and the command that approves it", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await stalePostgresFixture(context);

  const removal = planPackRemoval(await reconcileProjectState({ path: root, packageRoot: repositoryRoot }))[0];
  assert.ok(removal);

  const result = await runCli(["project", "status", root]);
  assert.equal(result.status, 0, `project status failed:\n${result.stderr}`);
  assert.ok(result.stdout.includes(`REMOVAL ${POSTGRES_PACK}`), result.stdout);
  assert.ok(result.stdout.includes(POSTGRES_TARGET), result.stdout);
  assert.ok(result.stdout.includes(removal.removalDigest), result.stdout);

  const command = /Approve this removal with: alpha-aos (.+)$/mu.exec(result.stdout);
  assert.ok(command, `project status printed no approval command:\n${result.stdout}`);
  assert.ok((command[1] ?? "").includes(removal.removalDigest), command[1] ?? "");
  assert.ok((command[1] ?? "").includes("--apply"), command[1] ?? "");
});

test("project status has no --apply, so status can never be the thing that deletes", async (context) => {
  const { root, target } = await stalePostgresFixture(context);

  const result = await runCli(["project", "status", root, "--apply"]);
  assert.notEqual(result.status, 0, "`project status --apply` was accepted");
  assert.match(result.stderr, /--apply/u);
  assert.equal(existsSync(target), true, "a refused status still deleted the target");
});

test("approving a removal plan's digest removes exactly the named targets and produces a journal id", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const applyPackRemoval = await planExport<ApplyPackRemoval>("applyPackRemoval");
  const { root, stateRoot, target } = await stalePostgresFixture(context);

  const removal = planPackRemoval(await reconcileProjectState({ path: root, packageRoot: repositoryRoot }))[0];
  assert.ok(removal);
  const untouched = join(root, "package.json");

  const result = await applyPackRemoval({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    removalDigest: removal.removalDigest,
  });

  assert.equal(result.packId, POSTGRES_PACK);
  assert.ok(result.operationId.length > 0, "an approved removal produced no journal id");
  assert.deepEqual([...result.removed], [POSTGRES_TARGET]);
  assert.equal(existsSync(target), false, "the approved removal did not remove its named target");
  assert.equal(existsSync(untouched), true, "the removal reached outside the targets it named");
  // The journal's snapshot is the safe inverse, so the removal is reversible.
  assert.equal(existsSync(join(stateRoot, "snapshots", result.operationId)), true, "the removal kept no snapshot");
});

test("approving a removal plan whose target bytes changed refuses with the drift code", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const applyPackRemoval = await planExport<ApplyPackRemoval>("applyPackRemoval");
  const { root, stateRoot, target } = await stalePostgresFixture(context);

  const removal = planPackRemoval(await reconcileProjectState({ path: root, packageRoot: repositoryRoot }))[0];
  assert.ok(removal);
  await writeFile(target, "# postgres-patterns\n\nedited after the removal plan was built\n", "utf8");

  const error = await expectRefusal(
    () =>
      applyPackRemoval({
        path: root,
        packageRoot: repositoryRoot,
        stateRoot,
        removalDigest: removal.removalDigest,
      }),
    "an approved removal whose target bytes moved",
  );

  assert.match(error.message, /plan-drift/u);
  assert.equal(existsSync(target), true, "a refused removal still deleted the target");
});

test("project sync --apply refuses in this repository, which has no approved artifact of its own", async () => {
  const result = await runCli(["project", "sync", ".", "--apply"]);
  assert.notEqual(result.status, 0, "`project sync --apply` materialized something in a repository that approved nothing");
  assert.match(result.stderr, /plan-incomplete/u);
  assert.match(result.stderr, /project approve/u);
});

// ---------------------------------------------------------------------------
// Plan 02-13 Task 1: a bounded or undecidable scan says so, in every rendering
// ---------------------------------------------------------------------------
//
// 02-REVIEW CR-03 reproduced the opposite: a fixture whose whole tree was
// refused printed `No pack qualified on the evidence found.` with no trace of
// the refusal in text, in `--why`, or in `--json`. The assertions below are
// written against the user-visible seam for that reason — the record already
// existed inside `scanProjectTree`, and being carried in a value no consumer
// reads is exactly the state that looked honest and was not.

/**
 * A tree whose root `.gitignore` exceeds `IGNORE_FILE_BYTE_CAP`, so the rule
 * set cannot be taken on and every entry beneath the root is `undecidable`.
 *
 * Every line is a comment, so the file carries ZERO effective rules: what the
 * scan loses here is decidability itself, not any pattern's meaning. The
 * fixture therefore holds real evidence (`react`, a `src` directory) that a
 * complete scan would have selected on.
 */
async function boundedScanFixture(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "bounded-scan");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "bounded", private: true, dependencies: { react: "^19.0.0" } }),
    "utf8",
  );
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export const value = 1;\n", "utf8");
  const line = `# ${"x".repeat(78)}\n`;
  await writeFile(join(root, ".gitignore"), line.repeat(Math.ceil((IGNORE_FILE_BYTE_CAP + 4096) / line.length)), "utf8");
  return root;
}

/** A tree with exactly one chain nested one level past `MAX_SCAN_DEPTH`. */
async function deepScanFixture(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "deep-scan");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "deep", private: true, dependencies: { react: "^19.0.0" } }),
    "utf8",
  );
  const segments = Array.from({ length: MAX_SCAN_DEPTH + 1 }, (_unused, index) => `d${index}`);
  await mkdir(join(root, ...segments), { recursive: true });
  return root;
}

/** The relative POSIX path of the directory `deepScanFixture` puts past the bound. */
const DEEPEST_BOUNDED_PATH = Array.from({ length: MAX_SCAN_DEPTH + 1 }, (_unused, index) => `d${index}`).join("/");

function linesStartingWith(text: string, prefix: string): string[] {
  return text.split("\n").filter((line) => line.startsWith(prefix));
}

test("a scan whose root rule set could not be taken on discloses the undecidable path in text, in --why and in --json", async (context) => {
  const root = await boundedScanFixture(context);

  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);
  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(plain.status, 0, plain.stderr);
  const disclosed = linesStartingWith(plain.stdout, "UNDECIDABLE-PATH ");
  assert.ok(disclosed.length > 0, `the default rendering disclosed nothing:\n${plain.stdout}`);
  assert.ok(
    disclosed.some((line) => line.includes("src")),
    `the disclosure did not name the refused path:\n${disclosed.join("\n")}`,
  );

  assert.equal(why.status, 0, why.stderr);
  assert.ok(
    linesStartingWith(why.stdout, "UNDECIDABLE-PATH ").length > 0,
    `--why disclosed nothing:\n${why.stdout}`,
  );

  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout) as {
    undecidableBoundaries: Array<{ path: string; reason: string; detail: string | null }>;
  };
  assert.ok(Array.isArray(parsed.undecidableBoundaries), json.stdout);
  assert.ok(parsed.undecidableBoundaries.length >= 1, json.stdout);
  assert.ok(
    parsed.undecidableBoundaries.some((entry) => entry.path === "src"),
    JSON.stringify(parsed.undecidableBoundaries),
  );
});

test("a scan that reached MAX_SCAN_DEPTH names the bound, its limit and where it was first reached", async (context) => {
  const root = await deepScanFixture(context);

  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);
  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(plain.status, 0, plain.stderr);
  const bounded = linesStartingWith(plain.stdout, "BOUNDED ");
  assert.ok(bounded.length > 0, `the default rendering disclosed no bound:\n${plain.stdout}`);
  const line = bounded[0] as string;
  assert.ok(line.includes("MAX_SCAN_DEPTH"), line);
  assert.ok(line.includes(String(MAX_SCAN_DEPTH)), line);
  assert.ok(line.includes(DEEPEST_BOUNDED_PATH), line);

  assert.ok(linesStartingWith(why.stdout, "BOUNDED ").length > 0, `--why disclosed no bound:\n${why.stdout}`);

  const parsed = JSON.parse(json.stdout) as {
    scanBounds: Array<{ bound: string; limit: number; at: string }>;
    undecidableBoundaries: Array<{ path: string; reason: string; detail: string | null }>;
  };
  // Broken-windows ledger #13's shape at the CLI: anything that stops the
  // descent early means the bound is never reached. The disclosure this plan
  // added is also the diagnosis, so a recurrence names its own cause.
  assert.deepEqual(
    parsed.scanBounds,
    [{ bound: "MAX_SCAN_DEPTH", limit: MAX_SCAN_DEPTH, at: DEEPEST_BOUNDED_PATH }],
    JSON.stringify(parsed.undecidableBoundaries),
  );
});

test("the scan-completeness record takes part in the plan digest", () => {
  const { planDigest: _superseded, ...base } = syntheticPlan([]);

  const complete = digestablePlan(base);
  const bounded = digestablePlan({
    ...base,
    scanBounds: [{ bound: "MAX_SCAN_DEPTH", limit: 12, at: "a/b" }],
  });
  const undecidable = digestablePlan({
    ...base,
    undecidableBoundaries: [{ path: "src", reason: "undecidable", detail: "gitignore-byte-cap" }],
  });

  assert.notDeepEqual(complete, bounded, "a scan bound left the digestable plan unchanged");
  assert.notDeepEqual(complete, undecidable, "an undecidable path left the digestable plan unchanged");
});

test("a complete scan reports empty scan-completeness arrays and prints no disclosure line", async (context) => {
  const root = await reactFixture(context);

  const plain = await runCli(["project", "plan", root]);
  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(plain.status, 0, plain.stderr);
  assert.deepEqual(linesStartingWith(plain.stdout, "BOUNDED "), []);
  assert.deepEqual(linesStartingWith(plain.stdout, "UNDECIDABLE-PATH "), []);

  const parsed = JSON.parse(json.stdout) as { scanBounds: unknown[]; undecidableBoundaries: unknown[] };
  assert.deepEqual(parsed.scanBounds, []);
  assert.deepEqual(parsed.undecidableBoundaries, []);
});

test("an empty directory is a complete answer: exit 0, nothing selected, and both completeness arrays empty", async (context) => {
  const root = await scratchRoot(context, "empty-answer");

  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout) as {
    selected: string[];
    scanBounds: unknown[];
    undecidableBoundaries: unknown[];
  };
  assert.deepEqual(parsed.selected, []);
  assert.deepEqual(parsed.scanBounds, []);
  assert.deepEqual(parsed.undecidableBoundaries, []);
});

// ---------------------------------------------------------------------------
// Plan 02-13 Task 2: dropped members, boundary exclusions, and a refused glob
// ---------------------------------------------------------------------------
//
// 02-REVIEW WR-08: `discoverSubProjects` builds a precise `DroppedMember[]`
// that no code path could reach, so a typo'd workspace entry, a member behind
// a boundary and a hostile `../../..` all vanished identically and silently.
// 02-REVIEW IN-03: `globToRegExp` splices three control-character sentinels
// into the pattern string on the stated assumption that they cannot occur in a
// path segment; on POSIX they can, and an entry carrying one is mis-compiled
// into a wildcard rather than refused.

/**
 * A workspace declaring one glob that matches nothing and one entry that
 * escapes the canonical root, beside a `packages/*` that legitimately
 * resolves — so the screen can be shown NOT to reject ordinary globs.
 *
 * `node_modules` is present so the fixture also carries an ordinary, DECIDED
 * boundary exclusion, which belongs under `--why` and nowhere else.
 */
async function droppedMemberFixture(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "dropped-member");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "monorepo",
      private: true,
      workspaces: ["packages/*", "packages/nothing-*", "../../outside-the-root"],
    }),
    "utf8",
  );
  await mkdir(join(root, "packages", "api"), { recursive: true });
  await writeFile(
    join(root, "packages", "api", "package.json"),
    JSON.stringify({ name: "api", dependencies: { express: "4.0.0" } }),
    "utf8",
  );
  await mkdir(join(root, "node_modules", "left-pad"), { recursive: true });
  await writeFile(join(root, "node_modules", "left-pad", "package.json"), JSON.stringify({ name: "left-pad" }), "utf8");
  return root;
}

test("a dropped workspace member is named with the entry as written, its ecosystem and its reason", async (context) => {
  const root = await droppedMemberFixture(context);

  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);
  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(plain.status, 0, plain.stderr);
  const dropped = linesStartingWith(plain.stdout, "DROPPED-MEMBER ");
  assert.equal(dropped.length, 2, `the default rendering named no dropped member:\n${plain.stdout}`);
  assert.ok(
    dropped.some((line) => line.includes("packages/nothing-*")),
    `the typo'd entry was not named verbatim:\n${dropped.join("\n")}`,
  );
  assert.ok(
    dropped.some((line) => line.includes("../../outside-the-root")),
    `the escaping entry was not named verbatim:\n${dropped.join("\n")}`,
  );
  assert.ok(dropped.every((line) => line.includes("npm")), dropped.join("\n"));

  assert.equal(linesStartingWith(why.stdout, "DROPPED-MEMBER ").length, 2, why.stdout);

  const parsed = JSON.parse(json.stdout) as {
    droppedMembers: Array<{ declared: string; ecosystem: string; reason: string }>;
    excludedBoundaries: Array<{ path: string; reason: string; detail: string | null }>;
  };
  assert.equal(parsed.droppedMembers.length, 2, JSON.stringify(parsed.droppedMembers));
  assert.ok(parsed.excludedBoundaries.length >= 1, JSON.stringify(parsed.excludedBoundaries));
});

test("boundary exclusions render under --why only, so the boundary-walk comment is true of the shipped code", async (context) => {
  const root = await droppedMemberFixture(context);

  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);

  const rendered = linesStartingWith(why.stdout, "EXCLUDED-BOUNDARY ");
  assert.ok(rendered.length >= 1, `--why rendered no boundary exclusion:\n${why.stdout}`);
  assert.ok(
    rendered.some((line) => line.includes("node_modules")),
    rendered.join("\n"),
  );
  // An ordinary repository excludes many paths for ordinary reasons; flooding
  // the default rendering with them would bury Task 1's disclosure.
  assert.deepEqual(linesStartingWith(plain.stdout, "EXCLUDED-BOUNDARY "), []);
});

/**
 * `LEADING_GLOBSTAR` as a repository would write it. Built from a code point
 * rather than typed, so this source file stays free of control characters
 * while the fixture on disk carries a real one.
 */
const SENTINEL_ENTRY = `packages/${String.fromCharCode(1)}*`;

test("a workspace entry carrying a glob sentinel is dropped by name rather than compiled into a wildcard", async (context) => {
  const root = await scratchRoot(context, "glob-sentinel");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "monorepo", private: true, workspaces: ["packages/*", SENTINEL_ENTRY] }),
    "utf8",
  );
  await mkdir(join(root, "packages", "api"), { recursive: true });
  await writeFile(
    join(root, "packages", "api", "package.json"),
    JSON.stringify({ name: "api", dependencies: { express: "4.0.0" } }),
    "utf8",
  );

  const json = await runCli(["project", "plan", root, "--json"]);

  assert.equal(json.status, 0, json.stderr);
  const parsed = JSON.parse(json.stdout) as {
    droppedMembers: Array<{ declared: string; ecosystem: string; reason: string }>;
    subProjects: Array<{ path: string }>;
  };
  const refused = parsed.droppedMembers.filter((member) => /control character/iu.test(member.reason));
  assert.equal(refused.length, 1, JSON.stringify(parsed.droppedMembers));
  assert.equal(refused[0]?.declared, SENTINEL_ENTRY);
  // The screen refuses one entry; it does not reject ordinary globs.
  assert.deepEqual(
    parsed.subProjects.map((member) => member.path),
    ["packages/api"],
  );
});

// ---------------------------------------------------------------------------
// Plan 02-13 Task 3: the negative reason, where a user actually meets it
// ---------------------------------------------------------------------------
//
// The module-level assertions live in test/evidence.test.ts. This one drives
// the CLI, because the rendering is where a user reads the claim and acts on
// it. `--why` is the mode that carries a leaf's REASON: the default
// `NEAR-MISS` line carries the vocabulary PHRASE only, by D-09's design, so
// the reason under test cannot appear on it.

test("a near-miss reason rendered by the CLI names the ignored directory rather than claiming it is absent", async (context) => {
  const root = await scratchRoot(context, "ignored-directory");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "ignored-src", private: true, dependencies: { react: "^19.0.0" } }),
    "utf8",
  );
  await writeFile(join(root, ".gitignore"), "src/\n", "utf8");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export {};\n", "utf8");

  const plain = await runCli(["project", "plan", root]);
  const why = await runCli(["project", "plan", root, "--why"]);

  assert.equal(why.status, 0, why.stderr);
  // The affected pack is still reported as a near miss in the default mode.
  assert.ok(
    linesStartingWith(plain.stdout, "NEAR-MISS ").some((line) => line.includes("BROWNFIELD_INIT")),
    plain.stdout,
  );

  const leafLines = why.stdout.split("\n").filter((line) => line.trimStart().startsWith("- "));
  const sourceLeaf = leafLines.filter((line) => line.includes("already holds source code"));
  assert.ok(sourceLeaf.length > 0, why.stdout);
  for (const line of sourceLeaf) {
    assert.ok(line.includes("src"), line);
    assert.ok(line.includes("ignored"), line);
    assert.equal(/exists under the canonical root/u.test(line), false, `the CLI still claims non-existence: ${line}`);
  }
});

// ---------------------------------------------------------------------------
// Plan 02-14 Task 1: the one committed managed document travels the strict route
// ---------------------------------------------------------------------------
//
// `.gitignore` ignores `.alpha-aos/install-state.json`, `journal/`, `snapshots/`
// and `evidence/` and deliberately does NOT ignore `plan.json`, which is what
// confirms the approval artifact is meant to be committed — and therefore
// arrives attacker-supplied on every clone. 02-REVIEW CR-04 reproduced a raw
// JavaScript type error from `project status` against one whose
// `evaluations[i].satisfied` was a string, on exactly the stale branch DETC-06
// exists to report on.

/** The exact bytes one poisoned-artifact case writes over `.alpha-aos/plan.json`. */
type ArtifactMutation = (artifact: Record<string, unknown>) => string;

/** Rewrites the artifact's `plan` subtree in place and re-serializes the whole artifact. */
function mutateApprovedPlan(mutate: (plan: Record<string, unknown>) => void): ArtifactMutation {
  return (artifact) => {
    const plan = asRecord(artifact.plan);
    mutate(plan);
    return `${JSON.stringify({ ...artifact, plan }, null, 2)}\n`;
  };
}

/** The reproduced CR-04 mutation: a leaf array replaced with a string. */
const POISON_NON_ARRAY_SATISFIED = mutateApprovedPlan((plan) => {
  const evaluations = asRecordArray(plan.evaluations, "plan.evaluations");
  const target = evaluations.find((entry) => entry.packId === POSTGRES_PACK);
  assert.ok(target, `the approved artifact carried no ${POSTGRES_PACK} evaluation`);
  target.satisfied = "the pg dependency, according to this repository";
  plan.evaluations = evaluations;
});

const POISON_UNDECLARED_KEY = mutateApprovedPlan((plan) => {
  plan.somethingNobodyDeclared = { anything: 1 };
});

const POISON_SELECTED_IS_OBJECT = mutateApprovedPlan((plan) => {
  plan.selected = { [POSTGRES_PACK]: true };
});

const POISON_NOT_JSON: ArtifactMutation = () => "this is not JSON at all\n";

/**
 * A real approval over a real fixture, then a hostile rewrite of the artifact,
 * then the removal of the evidence that selected the pack.
 *
 * The order matters: the artifact must be a genuine approval before it is
 * poisoned, and the evidence must go away afterwards, so the branch under test
 * is exactly the stale branch rather than the still-selected one.
 */
async function poisonedApprovalFixture(
  context: TestContext,
  mutation: ArtifactMutation,
): Promise<{ root: string; stateRoot: string; artifactPath: string }> {
  const fixture = await installedPostgresFixture(context);
  const artifactPath = join(fixture.root, ".alpha-aos", "plan.json");
  await writeFile(artifactPath, mutation(await readArtifact(artifactPath)), "utf8");
  await writeFile(
    join(fixture.root, "package.json"),
    `${JSON.stringify({ name: "reconcile-fixture", private: true, dependencies: {} }, null, 2)}\n`,
    "utf8",
  );
  return { root: fixture.root, stateRoot: fixture.stateRoot, artifactPath };
}

/** An installed pack whose plan was never approved: no artifact exists at all. */
async function unapprovedPostgresFixture(context: TestContext): Promise<string> {
  const root = await scratchRoot(context, "unapproved");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "reconcile-fixture", private: true, dependencies: { pg: "^8.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  await writeInstalledPack(root, { packId: POSTGRES_PACK, target: POSTGRES_TARGET, body: "# postgres-patterns\n" });
  return root;
}

interface StatusEnvelope {
  readonly reconciliation: {
    readonly artifactState: string;
    readonly artifactIssues: ReadonlyArray<{ readonly code: string; readonly documentPath: string }>;
  };
}

async function statusJson(root: string): Promise<{ status: number | null; envelope: StatusEnvelope; raw: string }> {
  const result = await runCli(["project", "status", root, "--json"]);
  const raw = `${result.stdout}\n${result.stderr}`;
  assert.ok(result.stdout.trim().length > 0, `project status --json printed nothing:\n${raw}`);
  return { status: result.status, envelope: JSON.parse(result.stdout) as StatusEnvelope, raw };
}

test("a poisoned approval artifact makes project status a named refusal on the stale path", async (context) => {
  const { root } = await poisonedApprovalFixture(context, POISON_NON_ARRAY_SATISFIED);

  const result = await runCli(["project", "status", root]);
  const output = `${result.stdout}\n${result.stderr}`;

  // The refusal is asserted by its own shape, never by scanning for the text of
  // the runtime error it replaced: an assertion against a crash message stops
  // being a regression the moment that message is reworded upstream.
  assert.equal(result.status, 2, `expected the domain-refusal status, got ${result.status}:\n${output}`);
  const line = output.split("\n").find((entry) => entry.startsWith("UNREADABLE-APPROVAL "));
  assert.ok(line, `project status emitted no UNREADABLE-APPROVAL line:\n${output}`);
  assert.ok(line.includes(PLAN_ARTIFACT_RELATIVE), `the refusal did not name the artifact: ${line}`);
  assert.match(line, /\b(?:schema|syntax|version|domain)\.[a-z-]+/u, `the refusal carried no stable issue code: ${line}`);
});

test("project status --json reports a poisoned artifact as unreadable with its validation issues", async (context) => {
  const { root } = await poisonedApprovalFixture(context, POISON_NON_ARRAY_SATISFIED);

  const { envelope, raw } = await statusJson(root);

  assert.equal(envelope.reconciliation.artifactState, "unreadable", raw);
  assert.ok(envelope.reconciliation.artifactIssues.length > 0, `artifactIssues was empty:\n${raw}`);
  assert.ok((envelope.reconciliation.artifactIssues[0]?.code ?? "").length > 0, raw);
});

test("every poisoned artifact shape is reported unreadable rather than absent", async (context) => {
  const cases: ReadonlyArray<{ name: string; mutation: ArtifactMutation }> = [
    { name: "a leaf array replaced with a string", mutation: POISON_NON_ARRAY_SATISFIED },
    { name: "an undeclared top-level plan key", mutation: POISON_UNDECLARED_KEY },
    { name: "selected replaced with an object", mutation: POISON_SELECTED_IS_OBJECT },
    { name: "bytes that are not JSON at all", mutation: POISON_NOT_JSON },
  ];

  for (const entry of cases) {
    const { root } = await poisonedApprovalFixture(context, entry.mutation);
    const { envelope, raw } = await statusJson(root);
    assert.equal(envelope.reconciliation.artifactState, "unreadable", `${entry.name}:\n${raw}`);
    assert.ok(envelope.reconciliation.artifactIssues.length > 0, `${entry.name} carried no issues:\n${raw}`);
  }
});

test("an absent approval artifact stays absent, with no validation issues", async (context) => {
  const root = await unapprovedPostgresFixture(context);

  const { status, envelope, raw } = await statusJson(root);

  assert.equal(status, 0, raw);
  assert.equal(envelope.reconciliation.artifactState, "absent", raw);
  assert.deepEqual([...envelope.reconciliation.artifactIssues], [], raw);
});

test("a well-formed approval artifact over unchanged evidence still reports current", async (context) => {
  const { root } = await installedPostgresFixture(context);

  const { status, envelope, raw } = await statusJson(root);

  assert.equal(status, 0, raw);
  assert.equal(envelope.reconciliation.artifactState, "current", raw);
  assert.deepEqual([...envelope.reconciliation.artifactIssues], [], raw);
});

test("approving the same reviewed plan twice writes once, and the verdict comes from a validated artifact", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const first = await runCli(["project", "approve", root, "--plan-digest", plan.planDigest, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });
  assert.equal(first.status, 0, first.stderr);
  const artifactPath = join(root, ".alpha-aos", "plan.json");
  const afterFirst = await readFile(artifactPath, "utf8");

  const second = await runCli(["project", "approve", root, "--plan-digest", plan.planDigest, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });
  assert.equal(second.status, 0, second.stderr);
  assert.match(second.stdout, /Already current/u, second.stdout);
  assert.equal(await readFile(artifactPath, "utf8"), afterFirst, "the second approve rewrote the artifact");
});

test("an unreadable artifact whose approvedDigest matches the current plan never reports already-current", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest });
  const artifactPath = join(root, ".alpha-aos", "plan.json");
  // W-1: the digest an attacker keeps correct while poisoning everything else.
  // A false already-current is a denial a repository can inflict on its users.
  await writeFile(artifactPath, POISON_UNDECLARED_KEY(await readArtifact(artifactPath)), "utf8");

  const again = await approveProjectPlan({
    path: root,
    packageRoot: repositoryRoot,
    stateRoot,
    expectedDigest: plan.planDigest,
  });

  assert.equal(again.status, "written", "an unreadable artifact was accepted as already-current");
  const rewritten = await readArtifact(artifactPath);
  assert.equal(rewritten.somethingNobodyDeclared, undefined, "the poisoned key survived the rewrite");
});

// ---------------------------------------------------------------------------
// Plan 02-14 Task 2: a validated document still cannot crash the reconciliation
// ---------------------------------------------------------------------------
//
// The closed schema is the primary defence and these are the second. Two
// independent defences against a repository-supplied document is the posture
// this codebase already takes for every other managed document, and the schema
// can be edited by a future change that does not notice this consumer.

interface ClassifyInstalledPackInput {
  readonly receipt: {
    readonly packId: string;
    readonly path: string;
    readonly sourceHash: string;
    readonly evidenceHash: string | null;
    readonly targets: readonly { readonly harness: string; readonly path: string; readonly targetHash: string }[];
  };
  readonly targets: readonly ReconciledTargetLike[];
  readonly plan: ProjectCapabilityPlan;
  readonly approved: unknown;
  readonly selected: boolean;
}

type ClassifyInstalledPack = (input: ClassifyInstalledPackInput) => PackReconciliationLike;

/** A leaf that is schema-shaped but whose fact id is far past any per-value bound. */
function oversizedLeaf(length: number): Record<string, unknown> {
  return {
    factId: `dependency:${"n".repeat(length)}`,
    detected: true,
    path: "package.json",
    reason: null,
    broad: false,
    phrase: "z".repeat(length),
  };
}

test("a non-array leaf collection inside an approved plan is reported, never thrown", async (context) => {
  const classifyInstalledPack = await planExport<ClassifyInstalledPack>("classifyInstalledPack");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  // The schema Task 1 added refuses this shape at the door. This asserts the
  // SECOND defence: the consumer itself does not throw when handed one anyway.
  const approved = {
    ...plan,
    evaluations: [
      { packId: POSTGRES_PACK, status: "selected", satisfied: "the pg dependency", failed: [], deferred: [], undeclared: [], explanation: "", overrideReason: null },
    ],
  };

  const result = classifyInstalledPack({
    receipt: { packId: POSTGRES_PACK, path: `.alpha-aos/receipts/${POSTGRES_PACK}.json`, sourceHash: "a".repeat(64), evidenceHash: null, targets: [] },
    targets: [],
    plan,
    approved,
    selected: false,
  });

  assert.ok(result.capability.deployment.length > 0, "a non-conforming artifact field produced no reported state");
  assert.ok(result.detail.length > 0, "a non-conforming artifact field produced no explanatory detail");
  assert.ok(
    result.detail.includes(PLAN_ARTIFACT_RELATIVE),
    `the reported detail did not name the artifact: ${result.detail}`,
  );
});

test("project status on an artifact carrying a non-array satisfied leaf reports rather than crashes", async (context) => {
  const { root } = await poisonedApprovalFixture(context, POISON_NON_ARRAY_SATISFIED);

  const result = await runCli(["project", "status", root]);
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 2, `expected the domain-refusal status, got ${result.status}:\n${output}`);
  const row = output.split("\n").find((line) => line.includes(POSTGRES_PACK) && /^(?:CURRENT|STALE|DRIFTED|CHANGED|CONFLICT|UNDECIDABLE)\s/u.test(line));
  assert.ok(row, `project status reported no state for ${POSTGRES_PACK}:\n${output}`);
  assert.ok(row.trim().split(/\s{2,}/u).length >= 3, `the reported row carried no explanatory detail: ${row}`);
});

test("a stale sentence composed from an oversized artifact leaf renders a bounded line", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");

  // A leaf name a repository authored, 100000 characters long, and every field
  // of it schema-valid: the closed schema bounds SHAPE, not length, so the
  // rendering is what must bound this.
  const { root } = await poisonedApprovalFixture(
    context,
    mutateApprovedPlan((plan) => {
      const evaluations = asRecordArray(plan.evaluations, "plan.evaluations");
      const target = evaluations.find((entry) => entry.packId === POSTGRES_PACK);
      assert.ok(target, `the approved artifact carried no ${POSTGRES_PACK} evaluation`);
      target.satisfied = [...asRecordArray(target.satisfied, "satisfied"), oversizedLeaf(100000)];
      plan.evaluations = evaluations;
    }),
  );

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  // The point is that this artifact PASSED its closed schema — length is not a
  // shape — so the rendering is the only thing that can bound it.
  assert.notEqual(reconciliation.artifactState, "unreadable", "the oversized leaf was refused instead of rendered");
  const pack = packStateOf(reconciliation, POSTGRES_PACK);
  assert.equal(pack.capability.deployment, "STALE", pack.detail);

  const rendered = formatProjectStatus(reconciliation, planPackRemoval(reconciliation), { path: root });
  const staleLines = rendered.split("\n").filter((line) => line.startsWith("STALE-FACT "));
  assert.ok(staleLines.length > 0, `no STALE-FACT line was rendered:\n${rendered.slice(0, 400)}`);
  for (const line of staleLines) {
    assert.ok(
      line.length <= REDACTED_STRING_LENGTH_BUDGET + 256,
      `a STALE-FACT line ran to ${line.length} characters, past the ${REDACTED_STRING_LENGTH_BUDGET} per-value bound`,
    );
  }
  for (const reason of pack.stale) {
    assert.ok(reason.sentence.length <= REDACTED_STRING_LENGTH_BUDGET + 64, `a stale sentence ran to ${reason.sentence.length} characters`);
    assert.ok(reason.named.length <= REDACTED_STRING_LENGTH_BUDGET + 64, `a stale subject ran to ${reason.named.length} characters`);
  }
});

test("a pack that is still selected but newly conflicted is not reported as supported", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);

  // A second harness root for the same skill, holding bytes no receipt claims.
  // D-11 drops the pack from `applicable` while leaving it in `selected`, which
  // is exactly the distinction the claim comparison used to lose.
  const foreign = join(root, ".agents", "skills", POSTGRES_SKILL, "SKILL.md");
  await mkdir(dirname(foreign), { recursive: true });
  await writeFile(foreign, "# a file alpha-AOS did not write\n", "utf8");

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });

  assert.ok(reconciliation.plan.selected.includes(POSTGRES_PACK), "the fixture no longer selects the pack at all");
  assert.equal(reconciliation.plan.applicable.includes(POSTGRES_PACK), false, "the conflict did not drop the pack from applicable");
  assert.ok(
    reconciliation.unsupportedClaims.includes(POSTGRES_PACK),
    `a still-selected but newly conflicted pack was reported as supported: ${JSON.stringify(reconciliation.unsupportedClaims)}`,
  );
});

test("a pack the artifact claims and current evidence does not select is still reported", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await stalePostgresFixture(context);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });

  assert.equal(reconciliation.plan.selected.includes(POSTGRES_PACK), false, "the fixture still selects the pack");
  assert.ok(
    reconciliation.unsupportedClaims.includes(POSTGRES_PACK),
    `a no-longer-selected claimed pack stopped being reported: ${JSON.stringify(reconciliation.unsupportedClaims)}`,
  );
});

test("the DETC-06 happy path is unchanged: STALE names the fact, a removal is offered, nothing is deleted", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root, target } = await stalePostgresFixture(context);
  const receiptPath = join(root, ".alpha-aos", "receipts", `${POSTGRES_PACK}.json`);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const pack = packStateOf(reconciliation, POSTGRES_PACK);
  assert.equal(pack.capability.deployment, "STALE", pack.detail);

  const result = await runCli(["project", "status", root]);
  assert.equal(result.status, 0, `project status failed:\n${result.stderr}`);
  const staleLines = result.stdout.split("\n").filter((line) => line.startsWith("STALE-FACT "));
  assert.ok(staleLines.length > 0, `project status printed no STALE-FACT line:\n${result.stdout}`);
  // The line names the MISSING FACT, never merely the pack.
  assert.ok(
    staleLines.some((line) => pack.stale.some((reason) => line.includes(reason.named))),
    `no STALE-FACT line named the missing fact: ${staleLines.join("\n")}`,
  );

  const removals = planPackRemoval(reconciliation);
  assert.equal(removals.length, 1, `expected one removal plan, got ${removals.map((entry) => entry.packId).join(", ")}`);
  assert.match(removals[0]?.removalDigest ?? "", /^[0-9a-f]{64}$/u);

  assert.equal(existsSync(target), true, "reporting STALE deleted the installed target");
  assert.equal(existsSync(receiptPath), true, "reporting STALE deleted the receipt");
});

// ---------------------------------------------------------------------------
// Plan 02-14 Task 3: one corrupt receipt neither blocks approval nor crashes
// ---------------------------------------------------------------------------
//
// The approve flow was deliberately written to TOLERATE an unreadable receipt:
// `readReceiptClaims` records it and the plan carries a `RECEIPT_UNREADABLE`
// approval for exactly that. 02-REVIEW WR-02 reproduced the CLI overriding that
// intent by running the strict removal-set lookup first on every `--apply`.

type RemovalAllowedRoots = (canonicalRoot: string, targets: readonly RemovalTargetLike[], receiptPath: string) => string[];

interface RemovalTargetLike {
  readonly path: string;
  readonly harness: string;
  readonly expectedHash: string | null;
  readonly exists: boolean;
}

const CORRUPT_RECEIPT_NAME = "CORRUPT.json";
const CORRUPT_RECEIPT_PATH = `.alpha-aos/receipts/${CORRUPT_RECEIPT_NAME}`;

/** An installed, unapproved pack with one corrupt receipt beside its valid one. */
async function corruptReceiptFixture(context: TestContext): Promise<{ root: string; stateRoot: string }> {
  const root = await scratchRoot(context, "corrupt-receipt");
  const stateRoot = await scratchRoot(context, "corrupt-receipt-state");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "corrupt-receipt-fixture", private: true, dependencies: { pg: "^8.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  await writeInstalledPack(root, { packId: POSTGRES_PACK, target: POSTGRES_TARGET, body: "# postgres-patterns\n" });
  await writeFile(join(root, ".alpha-aos", "receipts", CORRUPT_RECEIPT_NAME), "{ this is not a receipt", "utf8");
  return { root, stateRoot };
}

test("one corrupt receipt does not make plan approval impossible", async (context) => {
  const { root, stateRoot } = await corruptReceiptFixture(context);

  const preview = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: stateRoot });
  assert.equal(preview.status, 0, `the preview refused:\n${preview.stderr}`);
  const digest = planDigestOf(preview.stdout);

  const applied = await runCli(["project", "approve", root, "--plan-digest", digest, "--apply", "--json"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });

  assert.equal(applied.status, 0, `an approve with the CURRENT plan digest refused:\n${applied.stderr}`);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), true, "the approval wrote no artifact");

  // The tolerance is recorded, not merely exercised: a reviewer is told that
  // ownership of whatever the corrupt receipt claimed is undecidable.
  const result = asRecord(JSON.parse(applied.stdout));
  const approvals = asRecordArray(asRecord(result.plan).approvals, "plan.approvals");
  const unreadable = approvals.filter((entry) => entry.code === "RECEIPT_UNREADABLE");
  assert.ok(unreadable.length > 0, `the approval recorded no unreadable receipt: ${JSON.stringify(approvals)}`);
  assert.ok(
    unreadable.some((entry) => String(entry.detail).includes(CORRUPT_RECEIPT_PATH)),
    `the RECEIPT_UNREADABLE approval did not name the receipt: ${JSON.stringify(unreadable)}`,
  );
});

test("a stale digest plus a corrupt receipt refuses naming both halves", async (context) => {
  const { root, stateRoot } = await corruptReceiptFixture(context);
  // Neither the plan digest nor any removal digest: the one case that legitimately
  // has to consult the removal set, and cannot.
  const strange = "e".repeat(64);

  const result = await runCli(["project", "approve", root, "--plan-digest", strange, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });

  assert.equal(result.status, 2, `expected the domain-refusal status, got ${result.status}:\n${result.stderr}`);
  assert.ok(
    /not the current plan digest/u.test(result.stderr),
    `the refusal did not name the digest mismatch:\n${result.stderr}`,
  );
  assert.ok(
    /removal set could not be computed/u.test(result.stderr),
    `the refusal did not name the removal-set failure:\n${result.stderr}`,
  );
  assert.ok(result.stderr.includes(CORRUPT_RECEIPT_NAME), `the refusal did not name the receipt:\n${result.stderr}`);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a refused approve wrote the artifact");
});

test("a harness with no project-local skill root is a named refusal, not a bare crash", async () => {
  const removalAllowedRoots = await planExport<RemovalAllowedRoots>("removalAllowedRoots");
  const receiptPath = `.alpha-aos/receipts/${POSTGRES_PACK}.json`;
  const targets: RemovalTargetLike[] = [
    { path: ".hermes/skills/postgres-patterns/SKILL.md", harness: "hermes", expectedHash: "a".repeat(64), exists: true },
  ];

  let error: unknown;
  try {
    removalAllowedRoots("/tmp/project", targets, receiptPath);
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof Error, "a harness with no skill root did not refuse at all");
  assert.equal(error.constructor.name, "ComponentPlanError", `the refusal was a bare ${error.constructor.name}`);
  assert.ok(error.message.includes(receiptPath), `the refusal did not name the receipt: ${error.message}`);
  assert.ok(error.message.includes("hermes"), `the refusal did not name the harness: ${error.message}`);
  assert.ok(
    error.message.includes(".hermes/skills/postgres-patterns/SKILL.md"),
    `the refusal did not name the target path: ${error.message}`,
  );
});

test("the receipt schema and the skill-root table agree about which harnesses exist, in both directions", async () => {
  const receiptSchema = JSON.parse(await readFile(join(repositoryRoot, "schemas", "receipt.schema.json"), "utf8")) as {
    properties: { targets: { items: { required: string[]; properties: { harness: { enum: string[] }; kind: { enum: string[] } } } } };
  };
  const projectSkillRoots = await planExport<Readonly<Record<string, string>>>("PROJECT_SKILL_ROOTS");
  const declared = receiptSchema.properties.targets.items.properties.harness.enum;
  const rooted = Object.keys(projectSkillRoots);

  // Both directions, stated separately so a one-sided change says WHICH side
  // moved. Schema-wider is the crash 02-REVIEW WR-03 found: a target no
  // removal could be confined to. Table-wider is the mirror defect: a harness
  // this repository can materialize into but can never write a receipt for.
  for (const harness of declared) {
    assert.ok(
      rooted.includes(harness),
      `the receipt schema permits ${harness}, which PROJECT_SKILL_ROOTS does not carry, so the removal path is reachable with no root`,
    );
  }
  for (const harness of rooted) {
    assert.ok(
      declared.includes(harness),
      `PROJECT_SKILL_ROOTS carries ${harness}, which the receipt schema forbids, so a materialization there could never record a receipt`,
    );
  }
});

test("the receipt schema's kind enum and the kinds the writer can emit agree", async () => {
  const receiptSchema = JSON.parse(await readFile(join(repositoryRoot, "schemas", "receipt.schema.json"), "utf8")) as {
    properties: { targets: { items: { required: string[]; properties: { kind?: { enum?: string[] } } } } };
  };
  const item = receiptSchema.properties.targets.items;
  const emitted = (await import("../src/core/project-pack-sync.js")).PACK_RECEIPT_TARGET_KINDS;

  assert.ok(item.required.includes("kind"), "the receipt schema does not require the D-05 kind discriminator");
  assert.deepEqual(
    [...(item.properties.kind?.enum ?? [])].sort(),
    [...emitted].sort(),
    "a kind was added to the writer without the schema, or to the schema without the writer",
  );
});

test("a receipt naming a harness with no project-local root is refused at the door", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);
  const receiptPath = join(root, ".alpha-aos", "receipts", `${POSTGRES_PACK}.json`);
  const receipt = asRecord(JSON.parse(await readFile(receiptPath, "utf8")));
  const targets = asRecordArray(receipt.targets, "receipt.targets");
  targets[0] = { ...(targets[0] as Record<string, unknown>), harness: "hermes" };
  await writeFile(receiptPath, `${JSON.stringify({ ...receipt, targets }, null, 2)}\n`, "utf8");

  const error = await expectRefusal(
    () => reconcileProjectState({ path: root, packageRoot: repositoryRoot }),
    "a reconciliation over a receipt naming a harness with no project-local skill root",
  );
  assert.ok(
    error.message.includes(`${POSTGRES_PACK}.json`),
    `the refusal did not name the receipt path: ${error.message}`,
  );
});

test("an offered removal still applies through its own digest from the CLI, reporting paths and a transaction", async (context) => {
  const { root, stateRoot, target } = await stalePostgresFixture(context);

  const status = await runCli(["project", "status", root]);
  assert.equal(status.status, 0, `project status failed:\n${status.stderr}`);
  const offered = /Removal digest: ([0-9a-f]{64})/u.exec(status.stdout);
  assert.ok(offered, `project status offered no removal digest:\n${status.stdout}`);

  const applied = await runCli(["project", "approve", root, "--plan-digest", offered[1] as string, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });

  assert.equal(applied.status, 0, `the approved removal refused:\n${applied.stderr}`);
  assert.ok(applied.stdout.includes(`removed ${POSTGRES_TARGET}`), `the removal reported no removed path:\n${applied.stdout}`);
  assert.match(applied.stdout, /Transaction: \S+/u, applied.stdout);
  assert.equal(existsSync(target), false, "the approved removal did not remove its named target");
});

// ---------------------------------------------------------------------------
// Plan 02-15 Task 1: the plan digest depends on the repository, never on the host
// ---------------------------------------------------------------------------
//
// `discoverPersonalSkillNames` reads the reviewer's HOME-directory skill roots
// on the preview path, and a hit used to append a `SKILL_SHADOWED` approval —
// which `digestablePlan` folds in. Two people reviewing the identical commit of
// the identical repository therefore computed DIFFERENT `planDigest` values, so
// a digest reviewed on a laptop could not be approved on CI (02-REVIEW WR-01).
//
// The assertions below run the built CLI with the personal-skill roots pointed
// at a fixture, because the defect is only observable across two hosts and a
// fixture root is the only honest way to have two hosts inside one test run.

/** The skill `reactFixture`'s selected pack ships, and therefore the one a personal skill can shadow. */
const SHADOWED_SKILL = "frontend-a11y";

/** A personal-scope config directory holding exactly the named skills under `skills/`. */
async function personalSkillRoot(context: TestContext, label: string, skills: readonly string[]): Promise<string> {
  const configDirectory = await scratchRoot(context, `personal-${label}`);
  await mkdir(join(configDirectory, "skills"), { recursive: true });
  for (const skill of skills) {
    await mkdir(join(configDirectory, "skills", skill), { recursive: true });
    await writeFile(join(configDirectory, "skills", skill, "SKILL.md"), `# ${skill}\n`, "utf8");
  }
  return configDirectory;
}

/** Points every environment-overridable personal-skill root at one fixture directory. */
function personalSkillEnvironment(configDirectory: string): Record<string, string> {
  return {
    CLAUDE_CONFIG_DIR: configDirectory,
    ANTIGRAVITY_CONFIG_DIR: configDirectory,
    HERMES_HOME: configDirectory,
  };
}

/** The plan value as `--json` emits it, plus the field this plan adds to it. */
type PlanWithHostNotes = ProjectCapabilityPlan & { readonly hostNotes?: readonly string[] };

async function planOnHost(root: string, configDirectory: string): Promise<PlanWithHostNotes> {
  const result = await runCli(["project", "plan", root, "--json"], personalSkillEnvironment(configDirectory));
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as PlanWithHostNotes;
}

test("two project plan runs differing only in the personal-skill root agree on every digest", async (context) => {
  const root = await reactFixture(context);
  const colliding = await personalSkillRoot(context, "colliding", [SHADOWED_SKILL]);
  const empty = await personalSkillRoot(context, "empty", []);

  const shadowed = await planOnHost(root, colliding);
  const clean = await planOnHost(root, empty);

  assert.ok(
    shadowed.selected.includes("WEB_REACT"),
    `the fixture did not select WEB_REACT: ${shadowed.selected.join(", ")}`,
  );
  assert.equal(shadowed.inputsDigest, clean.inputsDigest, "inputsDigest moved with the reviewer's home directory");
  assert.equal(shadowed.evidenceDigest, clean.evidenceDigest, "evidenceDigest moved with the reviewer's home directory");
  assert.equal(
    shadowed.planDigest,
    clean.planDigest,
    "planDigest moved with the reviewer's home directory, so a digest reviewed on a laptop cannot be approved on CI",
  );
});

test("a shadowed personal skill is still reported, as a host note rather than an approval", async (context) => {
  const root = await reactFixture(context);
  const colliding = await personalSkillRoot(context, "colliding-note", [SHADOWED_SKILL]);
  const empty = await personalSkillRoot(context, "empty-note", []);

  const shadowed = await planOnHost(root, colliding);
  const clean = await planOnHost(root, empty);

  assert.ok(Array.isArray(shadowed.hostNotes), "the plan carries no hostNotes array");
  assert.ok(Array.isArray(clean.hostNotes), "the plan carries no hostNotes array");
  assert.ok(
    (shadowed.hostNotes ?? []).length > (clean.hostNotes ?? []).length,
    `the collision was not reported at all: ${JSON.stringify(shadowed.hostNotes ?? [])}`,
  );
  assert.ok(
    (shadowed.hostNotes ?? []).some((note) => note.includes(SHADOWED_SKILL)),
    `no host note names the shadowed skill: ${JSON.stringify(shadowed.hostNotes ?? [])}`,
  );
  assert.equal(
    (clean.hostNotes ?? []).some((note) => note.includes(SHADOWED_SKILL)),
    false,
    "a host with no colliding personal skill still reported one",
  );
  // Removing the collision from the digest must not remove it from the record.
  assert.equal(
    shadowed.approvals.some((approval) => approval.code === "SKILL_SHADOWED"),
    false,
    "the host-derived collision is still an approval, so it still reaches the digest",
  );
});

test("project plan names a shadowed personal skill in text mode and stays silent without one", async (context) => {
  const root = await reactFixture(context);
  const colliding = await personalSkillRoot(context, "colliding-text", [SHADOWED_SKILL]);
  const empty = await personalSkillRoot(context, "empty-text", []);

  const shadowed = await runCli(["project", "plan", root], personalSkillEnvironment(colliding));
  const clean = await runCli(["project", "plan", root], personalSkillEnvironment(empty));
  assert.equal(shadowed.status, 0, shadowed.stderr);
  assert.equal(clean.status, 0, clean.stderr);

  const shadowedLine = /^SHADOWED .*$/mu.exec(shadowed.stdout);
  assert.ok(shadowedLine, `no SHADOWED line in:\n${shadowed.stdout.slice(-800)}`);
  assert.ok(
    (shadowedLine[0] as string).includes(SHADOWED_SKILL),
    `the SHADOWED line does not name the skill: ${shadowedLine[0] as string}`,
  );
  assert.equal(/^SHADOWED /mu.test(clean.stdout), false, "a host with no collision printed a SHADOWED line");
});

test("digestablePlan omits hostNotes, so two plans differing only in it digest identically", async (context) => {
  const root = await reactFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const noted: PlanWithHostNotes = {
    ...plan,
    hostNotes: ["a note true of this machine and of no repository"],
  };

  assert.deepEqual(
    digestablePlan(noted),
    digestablePlan(plan),
    "hostNotes reached the digestable view, so the digest is host-dependent again",
  );
  assert.equal(
    JSON.stringify(digestablePlan(noted)).includes("hostNotes"),
    false,
    "the digestable view names hostNotes",
  );
});

test("an approved plan carrying hostNotes reads back as current", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);

  const preview = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: stateRoot });
  assert.equal(preview.status, 0, preview.stderr);
  const digest = planDigestOf(preview.stdout);

  const applied = await runCli(["project", "approve", root, "--plan-digest", digest, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });
  assert.equal(applied.status, 0, applied.stderr);

  const artifact = await readArtifact(join(root, ".alpha-aos", "plan.json"));
  const artifactPlan = asRecord(artifact.plan);
  assert.ok(Array.isArray(artifactPlan.hostNotes), "the written artifact carries no hostNotes array");

  const status = await runCli(["project", "status", root, "--json"], { ALPHA_AOS_STATE_DIR: stateRoot });
  assert.equal(status.status, 0, status.stderr);
  const report = JSON.parse(status.stdout) as { reconciliation: ProjectReconciliationLike };
  assert.equal(
    report.reconciliation.artifactState,
    "current",
    `an approval carrying hostNotes did not read back as current: ${JSON.stringify(report.reconciliation.artifactIssues)}`,
  );
  assert.equal(report.reconciliation.artifactIssues.length, 0, JSON.stringify(report.reconciliation.artifactIssues));
});

// ---------------------------------------------------------------------------
// Plan 02-15 Task 2: an honest inverse, and a refusal safe to paste
// ---------------------------------------------------------------------------
//
// WR-04: for a target that EXISTS and whose bytes could not be read,
// `buildSafeInverse` guarded the restore with the SOURCE hash — an assertion
// that the pre-existing bytes are precisely the thing nobody observed. WR-14:
// `approvalCommand` quoted only on whitespace, so a path carrying a quote
// produced a command that does not parse and a path carrying a shell
// metacharacter was emitted bare into something documented as ready to paste.

interface SafeInverseLike {
  readonly packId: string;
  readonly operation: string;
  readonly guard: { readonly path: string; readonly expectedHash: string | null };
}

type BuildSafeInverse = (target: TargetPreState) => SafeInverseLike;
type ApprovalCommand = (parts: { path: string; subProject?: string | null; planDigest: string }) => string;

/** A pre-state for one target, with only the fields under test varied. */
function preState(overrides: Partial<TargetPreState>): TargetPreState {
  return {
    packId: POSTGRES_PACK,
    skill: POSTGRES_SKILL,
    harness: "claude",
    path: POSTGRES_TARGET,
    exists: true,
    currentHash: "b".repeat(64),
    ownedByReceipt: true,
    expectedHash: "a".repeat(64),
    action: "update",
    ...overrides,
  };
}

/**
 * A repository whose `pg` dependency selects DB_POSTGRES, whose claude target
 * EXISTS and cannot be read, and whose receipt claims that exact path.
 *
 * The unreadable target is a DIRECTORY where a file belongs: `existsSync` says
 * yes and `readFile` fails with EISDIR on every platform, which is the same
 * observation a permission failure makes and needs no privileges to arrange.
 * The receipt is what keeps the pack applicable — an unowned target would be a
 * D-11 conflict, the pack would be dropped, and there would be no inverse to
 * guard at all.
 */
async function unreadableTargetFixture(context: TestContext): Promise<{ root: string; stateRoot: string }> {
  const root = await scratchRoot(context, "unreadable-target");
  const stateRoot = await scratchRoot(context, "unreadable-target-state");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "unreadable-fixture", private: true, dependencies: { pg: "^8.0.0" } }, null, 2)}\n`,
    "utf8",
  );
  await mkdir(join(root, ...POSTGRES_TARGET.split("/")), { recursive: true });
  const receipt = {
    schemaVersion: 1,
    packId: POSTGRES_PACK,
    producer: { name: "alpha-aos", version: "0.1.0" },
    createdAt: "2026-01-01T00:00:00.000Z",
    sourceHash: "a".repeat(64),
    targets: [{ harness: "claude", kind: "skill", path: POSTGRES_TARGET, targetHash: "b".repeat(64) }],
  };
  await mkdir(join(root, ".alpha-aos", "receipts"), { recursive: true });
  await writeFile(
    join(root, ".alpha-aos", "receipts", `${POSTGRES_PACK}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  return { root, stateRoot };
}

test("an existing target whose bytes could not be read gets an explicitly unknown guard", async () => {
  const buildSafeInverse = await planExport<BuildSafeInverse>("buildSafeInverse");
  const inverse = buildSafeInverse(preState({ currentHash: null }));

  assert.equal(inverse.operation, "restore");
  assert.equal(
    inverse.guard.expectedHash,
    null,
    "the restore is guarded by a hash that was never observed, so it would restore bytes that were never there",
  );
});

test("an existing target that reads is still guarded by the bytes that were observed", async () => {
  const buildSafeInverse = await planExport<BuildSafeInverse>("buildSafeInverse");
  const inverse = buildSafeInverse(preState({ currentHash: "b".repeat(64) }));

  assert.equal(inverse.operation, "restore");
  assert.equal(inverse.guard.expectedHash, "b".repeat(64));
});

test("a target that does not exist is still a remove guarded by the hash that will be written", async () => {
  const buildSafeInverse = await planExport<BuildSafeInverse>("buildSafeInverse");
  const inverse = buildSafeInverse(preState({ exists: false, currentHash: null, action: "create" }));

  assert.equal(inverse.operation, "remove");
  assert.equal(inverse.guard.expectedHash, "a".repeat(64));
});

test("an unreadable target is reported to the reviewer and its undo is left unguarded", async (context) => {
  const { root } = await unreadableTargetFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  assert.ok(
    plan.applicable.includes(POSTGRES_PACK),
    `the fixture did not keep ${POSTGRES_PACK} applicable: ${plan.applicable.join(", ")}`,
  );

  const inverse = plan.safeInverse.find((entry) => entry.guard.path === POSTGRES_TARGET);
  assert.ok(inverse, `no safe inverse for ${POSTGRES_TARGET}`);
  assert.equal(inverse.operation, "restore");
  assert.equal(inverse.guard.expectedHash, null, "a guard hash was invented for bytes that were never observed");

  const approval = plan.approvals.find((entry) => entry.code === "TARGET_UNREADABLE");
  assert.ok(
    approval,
    `no TARGET_UNREADABLE approval, so the reviewer is never told which undo is unguarded: ${plan.approvals
      .map((entry) => entry.code)
      .join(", ")}`,
  );
  assert.ok(approval.detail.includes(POSTGRES_TARGET), `the approval does not name the path: ${approval.detail}`);
  assert.ok(approval.detail.includes(POSTGRES_PACK), `the approval does not name the pack: ${approval.detail}`);
});

test("the unknown guard reaches the digest, and a target becoming readable moves the plan digest", async (context) => {
  const { root } = await unreadableTargetFixture(context);
  const before = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const digestable = digestablePlan(before) as { safeInverse: unknown[][] };
  const row = digestable.safeInverse.find((entry) => entry[2] === POSTGRES_TARGET);
  assert.ok(row, "the digestable view carries no row for the unreadable target");
  assert.equal(row[3], null, "the unknown guard did not reach the digestable view");

  await rm(join(root, ...POSTGRES_TARGET.split("/")), { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await writeFile(join(root, ...POSTGRES_TARGET.split("/")), "# postgres-patterns\n", "utf8");
  const after = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  assert.notEqual(after.planDigest, before.planDigest, "a target becoming readable did not move the plan digest");
  assert.notEqual(
    after.safeInverse.find((entry) => entry.guard.path === POSTGRES_TARGET)?.guard.expectedHash,
    null,
    "a readable target still carries an unknown guard",
  );
});

test("an approved plan carrying an unknown guard hash reads back as current", async (context) => {
  const { root, stateRoot } = await unreadableTargetFixture(context);

  const preview = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: stateRoot });
  assert.equal(preview.status, 0, preview.stderr);
  const digest = planDigestOf(preview.stdout);

  const applied = await runCli(["project", "approve", root, "--plan-digest", digest, "--apply"], {
    ALPHA_AOS_STATE_DIR: stateRoot,
  });
  assert.equal(applied.status, 0, applied.stderr);

  const status = await runCli(["project", "status", root, "--json"], { ALPHA_AOS_STATE_DIR: stateRoot });
  assert.equal(status.status, 0, status.stderr);
  const report = JSON.parse(status.stdout) as { reconciliation: ProjectReconciliationLike };
  assert.equal(
    report.reconciliation.artifactState,
    "current",
    `an approval carrying a null guard hash did not read back as current: ${JSON.stringify(report.reconciliation.artifactIssues)}`,
  );
  assert.equal(report.reconciliation.artifactIssues.length, 0, JSON.stringify(report.reconciliation.artifactIssues));
});

// --- WR-14: the command every refusal ends with is safe to paste ------------

const PASTE_DIGEST = "e".repeat(64);

/** The quoting the emitted command must use on THIS platform, and its quote character. */
const PASTE_QUOTE = process.platform === "win32" ? '"' : "'";

function shellQuoted(value: string): string {
  return process.platform === "win32"
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
}

test("approvalCommand leaves an ordinary path exactly as it emits it today", async () => {
  const approvalCommand = await planExport<ApprovalCommand>("approvalCommand");

  assert.equal(
    approvalCommand({ path: "/tmp/project", planDigest: PASTE_DIGEST }),
    `alpha-aos project approve /tmp/project --plan-digest ${PASTE_DIGEST} --apply`,
  );
});

test("approvalCommand quotes a path containing a double quote and leaves no unbalanced quote", async () => {
  const approvalCommand = await planExport<ApprovalCommand>("approvalCommand");
  const path = '/tmp/pro"ject';
  const command = approvalCommand({ path, planDigest: PASTE_DIGEST });

  assert.equal(
    command.includes(`approve ${path} --plan-digest`),
    false,
    `a path containing a quote was emitted bare: ${command}`,
  );
  assert.ok(command.includes(shellQuoted(path)), `the path was not quoted for this platform: ${command}`);
  assert.equal(
    (command.match(new RegExp(PASTE_QUOTE, "gu")) ?? []).length % 2,
    0,
    `the emitted command carries an unbalanced quote: ${command}`,
  );
});

test("approvalCommand quotes a path containing a shell metacharacter rather than emitting it bare", async () => {
  const approvalCommand = await planExport<ApprovalCommand>("approvalCommand");

  for (const path of ["/tmp/pro$ject", "/tmp/pro`ject", "/tmp/pro;ject", "/tmp/pro|ject"]) {
    const command = approvalCommand({ path, planDigest: PASTE_DIGEST });
    assert.equal(
      command.includes(`approve ${path} --plan-digest`),
      false,
      `${path} was emitted bare into a command documented as ready to paste: ${command}`,
    );
    assert.ok(command.includes(shellQuoted(path)), `${path} was not quoted for this platform: ${command}`);
  }
});

test("approvalCommand quotes the --project value, which is equally user-supplied", async () => {
  const approvalCommand = await planExport<ApprovalCommand>("approvalCommand");
  const subProject = "packages/my app";
  const command = approvalCommand({ path: "/tmp/project", subProject, planDigest: PASTE_DIGEST });

  assert.equal(
    command.includes(`--project ${subProject} --plan-digest`),
    false,
    `the --project value was emitted unquoted: ${command}`,
  );
  assert.ok(command.includes(shellQuoted(subProject)), `the --project value was not quoted: ${command}`);
});

// ---------------------------------------------------------------------------
// WR-09: one package root decides one catalog
//
// Pre-fix, `inspectProjectManifest` took ONE argument and both of its loaders
// were memoized on nothing, so the root that decided a `packOverrides` refusal
// was the one this module rediscovered — never the one the caller supplied.
// Observed before the fix, against the same fixtures these tests build:
//
//   inspectProjectManifest.length (declared params) = 1
//   override BROWNFIELD_INIT   -> current (no issues)
//   override BROWNFIELD_INIT_B -> invalid domain.unknown-pack-override
//
// Both answers came from the repository's own catalog. Neither supplied root
// was consulted, so the second test below could not have passed.
// ---------------------------------------------------------------------------

/**
 * Two package roots whose catalogs declare DIFFERENT pack id sets.
 *
 * Root B renames the single pack in `catalog/packs/brownfield.yaml`, which no
 * other catalog file references, so the two roots differ in exactly one id and
 * a test can name which root decided an answer.
 */
async function divergentPackageRoots(context: TestContext): Promise<{ rootA: string; rootB: string }> {
  const rootA = await packageRootCopy(context);
  const rootB = await packageRootCopy(context);
  const brownfield = join(rootB, "catalog", "packs", "brownfield.yaml");
  const text = await readFile(brownfield, "utf8");
  const renamed = text.replace("id: BROWNFIELD_INIT", "id: BROWNFIELD_INIT_B");
  assert.notEqual(renamed, text, "the brownfield pack id fixture no longer matches catalog/packs/brownfield.yaml");
  await writeFile(brownfield, renamed, "utf8");
  return { rootA, rootB };
}

/** A project whose manifest forces one pack on by id, and declares nothing else. */
async function projectOverriding(context: TestContext, packId: string): Promise<string> {
  const root = await scratchRoot(context, "override-project");
  await mkdir(join(root, ".alpha-aos"), { recursive: true });
  await writeFile(
    join(root, ".alpha-aos", "stack.yaml"),
    `schemaVersion: 1
packOverrides:
  ${packId}: force-on
`,
    "utf8",
  );
  return root;
}

test("two package roots in one process declare two different pack id sets", async (context) => {
  const { rootA, rootB } = await divergentPackageRoots(context);

  const idsA = new Set((await loadPackCatalogStrict(rootA)).value.packs.map((pack) => pack.id));
  const idsB = new Set((await loadPackCatalogStrict(rootB)).value.packs.map((pack) => pack.id));

  assert.notDeepEqual([...idsA].sort(), [...idsB].sort(), "the two fixture roots declare the same pack ids");
  assert.ok(idsA.has("BROWNFIELD_INIT") && !idsB.has("BROWNFIELD_INIT"));
  assert.ok(idsB.has("BROWNFIELD_INIT_B") && !idsA.has("BROWNFIELD_INIT_B"));
});

test("a packOverrides key is judged by the package root the caller supplied, not by the first root in the process", async (context) => {
  const { rootA, rootB } = await divergentPackageRoots(context);
  const project = await projectOverriding(context, "BROWNFIELD_INIT");

  // Order matters: root A answers first, and must not decide for root B.
  const againstA = await inspectProjectManifest(project, rootA);
  const againstB = await inspectProjectManifest(project, rootB);

  assert.equal(againstA?.status, "current", "root A declares BROWNFIELD_INIT, so its own catalog must accept the override");
  assert.equal(againstA?.issues.length, 0);

  assert.equal(againstB?.status, "invalid", "root B does not declare BROWNFIELD_INIT, so its own catalog must refuse the override");
  const refusal = againstB?.issues.find((issue) => issue.code === "domain.unknown-pack-override");
  assert.equal(refusal?.documentPath, "/packOverrides/BROWNFIELD_INIT");

  // And the reverse key, so neither answer is an accident of ordering.
  const reverse = await projectOverriding(context, "BROWNFIELD_INIT_B");
  assert.equal((await inspectProjectManifest(reverse, rootB))?.status, "current");
  assert.equal((await inspectProjectManifest(reverse, rootA))?.status, "invalid");
});

test("the root-keyed manifest caches stop at their bound, and an evicted root still answers with its own catalog", async (context) => {
  const { rootB } = await divergentPackageRoots(context);
  const project = await projectOverriding(context, "BROWNFIELD_INIT_B");

  assert.equal((await inspectProjectManifest(project, rootB))?.status, "current");

  // More roots than the bound admits, so root B is certainly evicted.
  for (let index = 0; index < ROOT_CACHE_LIMIT + 2; index += 1) {
    await inspectProjectManifest(project, await packageRootCopy(context));
  }

  const sizes = manifestCacheSizes();
  assert.equal(sizes.packIds, ROOT_CACHE_LIMIT, "the declared pack id cache grew past its declared bound");
  assert.equal(sizes.schemas, ROOT_CACHE_LIMIT, "the manifest schema cache grew past its declared bound");

  // Eviction costs a re-read and nothing else: it cannot change WHICH catalog answers.
  assert.equal((await inspectProjectManifest(project, rootB))?.status, "current");
});

// ---------------------------------------------------------------------------
// Plan 03-09 Task 1: the support CEILING and the resolver bounded by it
// ---------------------------------------------------------------------------
//
// 03-CONTEXT.md D-10 splits support into two axes that are never merged. Code
// and catalog own the CEILING — the product claim that a surface can
// structurally receive project-scope packs at all. The capability ledger owns
// whether it was PROVEN ON THIS HOST, and may only raise a surface WITHIN its
// ceiling. The two are never merged, and where the ceiling bound the result the
// returned reason says so rather than silently returning the ceiling value.

/** A citation names either a file it was read from or a version it was observed at. */
const CEILING_CITATION = /[A-Za-z0-9_.-]+\.(?:md|ya?ml|json|ts)|\d+\.\d+\.\d+/u;

const DECLARED_HARNESSES: readonly HarnessId[] = ["antigravity", "claude", "codex", "hermes", "pi"];

type CeilingEntry = { readonly support: SurfaceSupport; readonly reason: string; readonly citation: string };
type ClassifyAdapterSupport = (
  declared: readonly HarnessId[],
  ledger?: CapabilityLedger | null,
) => AdapterSupportEntry[];

async function surfaceCeiling(): Promise<ReadonlyMap<HarnessId, CeilingEntry>> {
  return planExport<ReadonlyMap<HarnessId, CeilingEntry>>("SURFACE_CEILING");
}

/** A ledger holding one positive, project-scoped proof per named surface. */
function provingLedger(
  rows: readonly { readonly harness: LedgerHarness; readonly nativeUse: NativeUseState }[],
): CapabilityLedger {
  return {
    schemaVersion: 1,
    producer: { name: "alpha-aos", version: "0.1.0" },
    updatedAt: "2026-09-11T00:00:00.000Z",
    proofs: rows.map((row) => ({
      projectId: "a".repeat(64),
      harness: row.harness,
      capability: "project-pack-delivery",
      polarity: "positive" as const,
      nativeUse: row.nativeUse,
      blockedReason: null,
      boundInputs: { skillSourceHash: "b".repeat(64), mcpServerVersion: null, evidenceHash: "c".repeat(64) },
      harnessVersion: { exact: "0.152.0", minorKey: "0.152", raw: "codex-cli 0.152.0" },
      ancestorFreedom: null,
      observedAt: "2026-09-11T00:00:00.000Z",
      oracle: {
        command: "codex debug prompt-input",
        exitCode: 0,
        stdoutFingerprint: "d".repeat(64),
        stderrFingerprint: "e".repeat(64),
      },
    })),
  };
}

test("SURFACE_CEILING classifies every declared harness and an unclassified surface stays unverified", async () => {
  const ceiling = await surfaceCeiling();
  for (const harness of DECLARED_HARNESSES) {
    assert.ok(ceiling.get(harness), `SURFACE_CEILING has no entry for the declared harness ${harness}`);
  }
  assert.equal(ceiling.size, DECLARED_HARNESSES.length, "SURFACE_CEILING carries an entry for an undeclared harness");

  // The fail-closed default survives the refactor: a harness the table does not
  // know is `unverified`, and a ledger claiming to have proven it has no
  // ceiling to be raised within, so it is STILL unverified.
  const classify = await planExport<ClassifyAdapterSupport>("classifyAdapterSupport");
  const unknown = "future-harness" as HarnessId;
  assert.equal(classify([unknown])[0]?.support, "unverified");

  const forged = provingLedger([{ harness: "codex", nativeUse: "invoked" }]);
  const claimsUnknown: CapabilityLedger = {
    ...forged,
    proofs: forged.proofs.map((proof) => ({ ...proof, harness: unknown as unknown as LedgerHarness })),
  };
  assert.equal(
    classify([unknown], claimsUnknown)[0]?.support,
    "unverified",
    "a ledger row for a surface with no ceiling raised it anyway, so the fail-closed default is reachable around",
  );
});

test("a ledger proving a surface raises it from the unverified ceiling to supported", async () => {
  const ceiling = await surfaceCeiling();
  assert.equal(ceiling.get("codex")?.support, "unverified", "the fixture surface is no longer the unverified one");

  const classify = await planExport<ClassifyAdapterSupport>("classifyAdapterSupport");
  assert.equal(classify(["codex"])[0]?.support, "unverified");

  const raised = classify(["codex"], provingLedger([{ harness: "codex", nativeUse: "discovered" }]))[0];
  assert.equal(raised?.support, "supported", "host evidence did not raise a surface its ceiling permits");
  assert.match(
    raised?.reason ?? "",
    /capability ledger/u,
    "the raised reason does not say the ledger is what raised it, so the two axes read as one",
  );
  assert.match(raised?.reason ?? "", /discovered/u, "the raised reason does not name the recorded ledger value");
});

test("a ledger proving a surface whose ceiling is unsupported does not raise it, and the reason says the ceiling bound it", async () => {
  const ceiling = await surfaceCeiling();
  assert.equal(ceiling.get("hermes")?.support, "unsupported", "the fixture surface is no longer the unsupported one");

  const classify = await planExport<ClassifyAdapterSupport>("classifyAdapterSupport");
  const bound = classify(["hermes"], provingLedger([{ harness: "hermes", nativeUse: "invoked" }]))[0];
  assert.equal(bound?.support, "unsupported", "host evidence raised a surface ABOVE its ceiling");
  assert.match(
    bound?.reason ?? "",
    /ceiling bound/iu,
    "the ceiling silently returned its own value instead of stating that it bound the result",
  );
  assert.match(bound?.reason ?? "", /invoked/u, "the bound reason does not name the ledger value it refused to honour");
});

test("the resolver with no ledger returns exactly the ceiling values", async () => {
  const ceiling = await surfaceCeiling();
  const classify = await planExport<ClassifyAdapterSupport>("classifyAdapterSupport");

  for (const entries of [classify(DECLARED_HARNESSES), classify(DECLARED_HARNESSES, null)]) {
    assert.equal(entries.length, DECLARED_HARNESSES.length);
    for (const entry of entries) {
      const recorded = ceiling.get(entry.harness);
      assert.ok(recorded, `the resolver classified ${entry.harness}, which the ceiling does not know`);
      assert.equal(entry.support, recorded.support, `${entry.harness}: the no-ledger support is not the ceiling value`);
      assert.equal(entry.reason, recorded.reason, `${entry.harness}: the no-ledger reason is not the ceiling reason`);
    }
  }
});

test("the codex ceiling reason cites the observed project-scope discovery and the version it was observed at", async () => {
  const ceiling = await surfaceCeiling();
  const codex = ceiling.get("codex");
  assert.ok(codex);
  // The DECISION stays with the ledger; only the REASON is corrected.
  assert.equal(codex.support, "unverified");
  assert.doesNotMatch(
    codex.reason,
    /no documented project-scope discovery has been proven/u,
    "the codex reason still asserts what 03-RESEARCH.md Open Question 3 falsified",
  );
  assert.match(codex.reason, /\.agents\/skills/u, "the codex reason does not name the observed shared project skill root");
  assert.match(codex.reason, /\.codex\/skills/u, "the codex reason does not name the second, harness-specific root");
  assert.match(codex.reason, /0\.152\.0/u, "the codex reason does not name the version the discovery was observed at");
});

test("the hermes ceiling reason names the scoping ground and no longer cites the recorded worker strategy", async () => {
  const ceiling = await surfaceCeiling();
  const hermes = ceiling.get("hermes");
  assert.ok(hermes);
  // 03-CONTEXT.md's deferred list scopes hermes out of this phase, so the
  // DECISION stands. The recorded REASON was falsified and does not.
  assert.equal(hermes.support, "unsupported");
  assert.doesNotMatch(
    hermes.reason,
    /worker-only/u,
    "the hermes reason still cites the strategy the harness's own trust subcommand contradicts",
  );
  assert.match(
    hermes.reason,
    /not in scope|no .*project delivery surface/iu,
    "the hermes reason does not state the actual ground: nothing is in scope and nothing was probed",
  );
});

test("every SURFACE_CEILING reason is non-empty and carries a citation naming a file or a version", async () => {
  const ceiling = await surfaceCeiling();
  for (const [harness, entry] of ceiling) {
    assert.ok(entry.reason.trim().length > 0, `${harness} records a classification and states no basis for it`);
    assert.ok(entry.citation.trim().length > 0, `${harness} states a reason and cites nothing`);
    assert.match(
      entry.citation,
      CEILING_CITATION,
      `${harness} cites "${entry.citation}", which names neither a file nor a version`,
    );
    assert.ok(
      entry.reason.includes(entry.citation),
      `${harness}'s reason does not carry its own citation, so a reader of the rendered reason cannot check it`,
    );
  }
});

// ---------------------------------------------------------------------------
// Plan 03-09 Task 2: the composite capability state, promoted to primary
// ---------------------------------------------------------------------------
//
// 03-CONTEXT.md D-11 models CAPA-07's eight states as three ORTHOGONAL AXES.
// This plan's assumption-delta decision promotes the composite to the PRIMARY
// value: `PackState` keeps every union member it had in Phase 2 and is demoted
// to the `deployment` FIELD of that composite. The promotion is only real if
// the general representation is the one a consumer gets by default, so the
// invariant below pins that no exported reconciliation surface hands back a
// bare deployment value at the top level.

/** The Phase 2 union, spelled out here so a drift in either direction is red. */
const PHASE_2_PACK_STATES = ["CURRENT", "STALE", "DRIFTED", "CHANGED", "CONFLICT", "UNDECIDABLE"] as const;

/** A credential value has nowhere to live in a BlockedReason; this proves the renderer agrees. */
const BLOCKED_VALUE_SENTINEL = "zzz-sentinel-credential-value-zzz";

function packProof(overrides: Partial<CapabilityProof>): CapabilityProof {
  return {
    projectId: null,
    harness: "claude",
    capability: POSTGRES_PACK,
    polarity: "positive",
    nativeUse: "invoked",
    blockedReason: null,
    boundInputs: { skillSourceHash: "b".repeat(64), mcpServerVersion: null, evidenceHash: "c".repeat(64) },
    harnessVersion: { exact: "2.1.267", minorKey: "2.1", raw: "2.1.267 (Claude Code)" },
    ancestorFreedom: null,
    observedAt: "2026-09-11T00:00:00.000Z",
    oracle: {
      command: "claude -p",
      exitCode: 0,
      stdoutFingerprint: "d".repeat(64),
      stderrFingerprint: "e".repeat(64),
    },
    ...overrides,
  };
}

function packLedger(proofs: readonly CapabilityProof[]): CapabilityLedger {
  return {
    schemaVersion: 1,
    producer: { name: "alpha-aos", version: "0.1.0" },
    updatedAt: "2026-09-11T00:00:00.000Z",
    proofs,
  };
}

/** The paired unit a COMPLETE capability needs: a positive and its asserted negative. */
function pairedProofs(projectId: string, overrides: Partial<CapabilityProof> = {}): CapabilityProof[] {
  const positive = packProof({ projectId, ...overrides });
  const negative = packProof({
    projectId,
    ...overrides,
    polarity: "negative",
    nativeUse: "unverified",
    ancestorFreedom: { asserted: true, checkedAncestors: ["/tmp/control", "/tmp", "/"] },
    blockedReason: null,
  });
  return [positive, negative];
}

test("no exported reconciliation surface returns a bare deployment-axis value at the top level", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);
  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });

  const deploymentValues = new Set<string>(PHASE_2_PACK_STATES);
  const pack = packStateOf(reconciliation, POSTGRES_PACK);

  // Runtime: nothing at the top level of the record IS a deployment value.
  for (const [key, value] of Object.entries(pack as unknown as Record<string, unknown>)) {
    assert.ok(
      !(typeof value === "string" && deploymentValues.has(value)),
      `PackReconciliation.${key} is a bare deployment-axis value (${String(value)}) at the top level; the axis must ` +
        "be reachable only through the composite CapabilityState",
    );
  }
  // ...and it IS reachable through the composite.
  assert.ok(
    deploymentValues.has(pack.capability.deployment),
    `the composite does not carry a deployment axis: ${JSON.stringify(pack.capability)}`,
  );

  // Source level: adding a shortcut field later is red, not merely discouraged.
  const source = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  for (const name of ["PackReconciliation", "ProjectReconciliation"]) {
    const declaration = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`, "u").exec(source);
    assert.ok(declaration, `src/core/project-plan.ts declares no exported interface ${name}`);
    assert.doesNotMatch(
      declaration[1] ?? "",
      /^\s*readonly [A-Za-z0-9_]+: PackState;/mu,
      `${name} declares a top-level property typed PackState, which reopens the bare deployment axis`,
    );
  }
});

test("the three axes are independently settable on one composite and JSON exposes all three under distinct keys", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const projectId = plan.scope.projectId;

  const invoked = await reconcileProjectState(
    { path: root, packageRoot: repositoryRoot },
    { ledger: packLedger(pairedProofs(projectId)) },
  );
  const discovered = await reconcileProjectState(
    { path: root, packageRoot: repositoryRoot },
    { ledger: packLedger(pairedProofs(projectId, { nativeUse: "discovered" })) },
  );
  const bare = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });

  const a = packStateOf(invoked, POSTGRES_PACK).capability;
  const b = packStateOf(discovered, POSTGRES_PACK).capability;
  const c = packStateOf(bare, POSTGRES_PACK).capability;

  // The deployment axis is identical across all three; only the native-use axis
  // moved. Two axes that moved together would not be orthogonal.
  assert.equal(a.deployment, c.deployment);
  assert.equal(b.deployment, c.deployment);
  assert.equal(a.nativeUse, "invoked");
  assert.equal(b.nativeUse, "discovered");
  assert.equal(c.nativeUse, "unverified");
  // The support axis is the third, independent answer: it did NOT move when the
  // native-use axis did, because claude's ceiling already carries the product
  // claim and host evidence has nothing above it to raise it to.
  assert.equal(c.support, "supported", "the claude ceiling is no longer the supported one");
  assert.equal(a.support, c.support);
  assert.equal(b.support, c.support);

  const rendered = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
  for (const key of ["deployment", "nativeUse", "support", "nativeUseReason", "supportReason"]) {
    assert.ok(key in rendered, `the JSON render of CapabilityState carries no ${key} key`);
  }
  assert.equal(
    Object.keys(rendered).length,
    5,
    `CapabilityState carries ${Object.keys(rendered).join(", ")}: exactly the three axes plus their two reasons`,
  );
});

test("project status renders one line per capability carrying all three axes, and a blocked axis renders its code and variable name", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  const blocked = {
    code: "EXA_KEY_MISSING",
    variable: "EXA_API_KEY",
    nextAction: "set EXA_API_KEY in the environment and re-run the canary",
    // Smuggled through a cast exactly as 03-03's copy-down test does: the type
    // and the closed schema both refuse it, so the renderer is the third layer.
    value: BLOCKED_VALUE_SENTINEL,
  } as unknown as BlockedReason;

  const reconciliation = await reconcileProjectState(
    { path: root, packageRoot: repositoryRoot },
    {
      ledger: packLedger(pairedProofs(plan.scope.projectId, { nativeUse: "unverified", blockedReason: blocked })),
    },
  );
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const rendered = formatProjectStatus(reconciliation, planPackRemoval(reconciliation), { path: root });
  const lines = rendered.split("\n").filter((line: string) => line.startsWith("CAPABILITY "));

  assert.equal(
    lines.length,
    reconciliation.packs.length,
    `expected one CAPABILITY line per installed pack, got ${lines.length}:\n${rendered}`,
  );
  const line = lines[0] ?? "";
  assert.match(line, new RegExp(`^CAPABILITY ${POSTGRES_PACK} `, "u"));
  assert.match(line, /deployment=CURRENT/u, `the capability line carries no deployment axis: ${line}`);
  assert.match(line, /native-use=unverified/u, `the capability line carries no native-use axis: ${line}`);
  assert.match(line, /support=/u, `the capability line carries no support axis: ${line}`);
  assert.match(line, /EXA_KEY_MISSING/u, `the blocked axis renders no stable code: ${line}`);
  assert.match(line, /EXA_API_KEY/u, `the blocked axis renders no variable name: ${line}`);
  assert.doesNotMatch(
    rendered,
    new RegExp(BLOCKED_VALUE_SENTINEL, "u"),
    "a value smuggled onto a blocked reason reached the rendered status",
  );
});

test("PackState's union members are unchanged from Phase 2 and it is declared exactly once", async () => {
  const source = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  const declarations = source
    .split("\n")
    .filter((line) => !/^\s*[/*]/u.test(line))
    .filter((line) => line.includes("export type PackState"));
  assert.equal(declarations.length, 1, `export type PackState is declared ${declarations.length} times, not once`);
  assert.equal(
    declarations[0]?.trim(),
    `export type PackState = ${PHASE_2_PACK_STATES.map((state) => `"${state}"`).join(" | ")};`,
    "PackState's union members moved; D-11 requires the deployment axis untouched by the promotion",
  );
});

test("a capability whose evidence unit is INCOMPLETE renders INCOMPLETE and never the positive's native-use axis", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });

  // A positive with NO negative control: D-14's unpaired positive.
  const reconciliation = await reconcileProjectState(
    { path: root, packageRoot: repositoryRoot },
    { ledger: packLedger([packProof({ projectId: plan.scope.projectId, nativeUse: "invoked" })]) },
  );
  const state = packStateOf(reconciliation, POSTGRES_PACK).capability;
  assert.equal(state.nativeUse, "unverified", "an unpaired positive reported its own axis as the unit's answer");
  assert.match(state.nativeUseReason, /INCOMPLETE/u, "the native-use reason does not say the unit is incomplete");
  assert.doesNotMatch(
    state.nativeUseReason,
    /invoked/u,
    "the INCOMPLETE reason prints the positive's axis, which is the unpaired-positive-as-pass failure D-14 forbids",
  );

  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const rendered = formatProjectStatus(reconciliation, planPackRemoval(reconciliation), { path: root });
  const line = rendered.split("\n").find((entry: string) => entry.startsWith(`CAPABILITY ${POSTGRES_PACK} `)) ?? "";
  assert.match(line, /INCOMPLETE/u, `the rendered capability line does not say INCOMPLETE: ${line}`);
  assert.doesNotMatch(line, /=invoked|native-use=invoked/u, `the rendered line printed the positive's axis: ${line}`);
});

test("two renders of the same reconciliation are byte-identical in both human and JSON form", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const ledger = packLedger(pairedProofs(plan.scope.projectId));

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger });
  const removals = planPackRemoval(reconciliation);

  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const first = formatProjectStatus(reconciliation, removals, { path: root });
  const second = formatProjectStatus(reconciliation, removals, { path: root });
  assert.equal(first, second, "two human renders of one reconciliation differ");
  assert.equal(
    JSON.stringify(reconciliation),
    JSON.stringify(reconciliation),
    "two JSON renders of one reconciliation differ",
  );

  // A second reconciliation over the same unchanged world renders the same
  // capability lines, so the rendering carries no run-scoped value.
  const again = await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger });
  const capabilityLines = (text: string) => text.split("\n").filter((line) => line.startsWith("CAPABILITY "));
  assert.deepEqual(
    capabilityLines(formatProjectStatus(again, planPackRemoval(again), { path: root })),
    capabilityLines(first),
  );
  assert.deepEqual(
    again.packs.map((pack) => pack.capability),
    reconciliation.packs.map((pack) => pack.capability),
  );
});

test("changing a ledger record leaves the plan digest unchanged, so no host-derived axis enters digestablePlan", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const { root } = await installedPostgresFixture(context);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  const projectId = plan.scope.projectId;

  const bare = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const proven = await reconcileProjectState(
    { path: root, packageRoot: repositoryRoot },
    { ledger: packLedger(pairedProofs(projectId)) },
  );

  // The ledger DID move an axis, so the comparison below is not vacuous.
  assert.notEqual(
    packStateOf(bare, POSTGRES_PACK).capability.nativeUse,
    packStateOf(proven, POSTGRES_PACK).capability.nativeUse,
    "the ledger changed nothing, so this test would pass without proving anything",
  );

  assert.equal(
    proven.plan.planDigest,
    bare.plan.planDigest,
    "a host-derived axis reached the plan digest, so two reviewers of one commit would disagree",
  );
  assert.equal(
    JSON.stringify(digestablePlan(proven.plan)),
    JSON.stringify(digestablePlan(bare.plan)),
    "the digestable view of the plan moved with the ledger",
  );
});

// ---------------------------------------------------------------------------
// Plan 03-09 Task 3: the one-shot lifecycle reports, and never deletes
// ---------------------------------------------------------------------------
//
// 03-CONTEXT.md D-13: when the ledger records `invoked` for a one-shot pack,
// `status` reports it as one-shot, already invoked, removal plan ready — and
// the removal itself still travels the approved removal-digest path. Phase 2
// D-14 and PROJECT.md's safety constraint both stand: nothing here deletes.

const BROWNFIELD_PACK = "BROWNFIELD_INIT";
const BROWNFIELD_SKILL = "inherit-legacy-style";
const BROWNFIELD_TARGET = `.claude/skills/${BROWNFIELD_SKILL}/SKILL.md`;
const ONE_SHOT_LIFECYCLE = "one-shot-remove-after-output";
/** RESEARCH.md Open Question 7: the skill writes this at the project ROOT. */
const BROWNFIELD_OUTPUT = ".ai-style-rules.md";
const INVOKED_AT = "2026-09-11T00:00:00.000Z";

interface OneShotOfferLike {
  readonly packId: string;
  readonly lifecycle: string;
  readonly invokedAt: string | null;
  readonly removalDigest: string | null;
  readonly approveCommand: string | null;
  readonly corroboration: { readonly path: string; readonly present: boolean; readonly note: string } | null;
  readonly sentence: string;
}

type PlanOneShotOffer = (
  reconciliation: ProjectReconciliationLike,
  ledger: CapabilityLedger | null,
  options: { path: string; subProject?: string | null },
) => OneShotOfferLike[];

/** A brownfield repository with the one-shot pack materialized and a receipt claiming it. */
async function installedBrownfieldFixture(
  context: TestContext,
): Promise<{ root: string; stateRoot: string; projectId: string }> {
  const root = await scratchRoot(context, "one-shot");
  const stateRoot = await scratchRoot(context, "one-shot-state");
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "one-shot-fixture", private: true }, null, 2)}\n`,
    "utf8",
  );
  // `existing-source` is a directory detector; `missing-conventions-document`
  // is satisfied by NOT writing a conventions document.
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "index.ts"), "export const legacy = true;\n", "utf8");
  await writeInstalledPack(root, {
    packId: BROWNFIELD_PACK,
    target: BROWNFIELD_TARGET,
    body: "# inherit-legacy-style\n",
  });
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.ok(
    plan.selected.includes(BROWNFIELD_PACK),
    `the fixture did not select ${BROWNFIELD_PACK}: ${plan.selected.join(", ")}`,
  );
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  await approveProjectPlan({ path: root, packageRoot: repositoryRoot, stateRoot, expectedDigest: plan.planDigest });
  return { root, stateRoot, projectId: plan.scope.projectId };
}

function invokedBrownfieldLedger(projectId: string): CapabilityLedger {
  return packLedger([
    packProof({ projectId, capability: BROWNFIELD_PACK, nativeUse: "invoked", observedAt: INVOKED_AT }),
    packProof({
      projectId,
      capability: BROWNFIELD_PACK,
      polarity: "negative",
      nativeUse: "unverified",
      observedAt: INVOKED_AT,
      ancestorFreedom: { asserted: true, checkedAncestors: ["/tmp/control", "/tmp", "/"] },
    }),
  ]);
}

/** Every file under a root, keyed by relative POSIX path, with its content hash. */
async function treeFingerprint(root: string): Promise<Map<string, string>> {
  const seen = new Map<string, string>();
  const walk = async (directory: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(absolute, relative);
      else seen.set(relative, createHash("sha256").update(await readFile(absolute)).digest("hex"));
    }
  };
  await walk(root, "");
  return seen;
}

test("a one-shot pack the ledger records as invoked reports one-shot, already invoked, with a runnable approve command", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planOneShotOffer = await planExport<PlanOneShotOffer>("planOneShotOffer");
  const { root, projectId } = await installedBrownfieldFixture(context);

  const ledger = invokedBrownfieldLedger(projectId);
  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger });
  const offers = planOneShotOffer(reconciliation, ledger, { path: root });

  assert.equal(offers.length, 1, `expected one offer, got ${offers.map((offer) => offer.packId).join(", ")}`);
  const offer = offers[0];
  assert.ok(offer);
  assert.equal(offer.packId, BROWNFIELD_PACK);
  assert.equal(offer.lifecycle, ONE_SHOT_LIFECYCLE);
  assert.equal(offer.invokedAt, INVOKED_AT);
  assert.ok(offer.removalDigest, "an invoked one-shot pack was offered no removal digest");
  assert.match(
    offer.approveCommand ?? "",
    new RegExp(`^alpha-aos project approve .*--plan-digest ${offer.removalDigest ?? ""} --apply$`, "u"),
    `the approve command is not runnable: ${String(offer.approveCommand)}`,
  );

  // The digest is the one the APPROVE path will look for, not a second one
  // computed beside it. A digest nothing accepts is a dead end, not an offer.
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const offered = planPackRemoval(reconciliation) as ReadonlyArray<{ removalDigest: string }>;
  assert.ok(
    offered.some((entry) => entry.removalDigest === offer.removalDigest),
    `the one-shot digest ${String(offer.removalDigest)} is on no removal plan the approve path would find`,
  );
});

test("a one-shot pack with no invocation record reports one-shot, not yet invoked, and offers nothing", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planOneShotOffer = await planExport<PlanOneShotOffer>("planOneShotOffer");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root } = await installedBrownfieldFixture(context);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot });
  const offer = planOneShotOffer(reconciliation, null, { path: root })[0];

  assert.ok(offer, "a one-shot pack with no invocation record was not reported at all");
  assert.equal(offer.packId, BROWNFIELD_PACK);
  assert.equal(offer.lifecycle, ONE_SHOT_LIFECYCLE);
  assert.equal(offer.invokedAt, null);
  assert.equal(offer.removalDigest, null, "a pack nothing has invoked was offered a removal");
  assert.equal(offer.approveCommand, null);
  assert.match(offer.sentence, /not yet invoked/u, `the sentence does not say it has not been invoked: ${offer.sentence}`);
  assert.deepEqual(planPackRemoval(reconciliation), [], "an uninvoked one-shot pack was offered a removal plan");
});

test("the one-shot reporting path calls no removal and leaves the project tree byte-unchanged", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planOneShotOffer = await planExport<PlanOneShotOffer>("planOneShotOffer");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const { root, projectId } = await installedBrownfieldFixture(context);
  const ledger = invokedBrownfieldLedger(projectId);

  const before = await treeFingerprint(root);
  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger });
  const offers = planOneShotOffer(reconciliation, ledger, { path: root });
  formatProjectStatus(reconciliation, planPackRemoval(reconciliation), { path: root }, offers);
  const after = await treeFingerprint(root);

  assert.deepEqual([...after.entries()].sort(), [...before.entries()].sort(), "reporting changed the project tree");
  assert.ok(existsSync(join(root, ...BROWNFIELD_TARGET.split("/"))), "the one-shot target was deleted by a report");

  // Source level, so a future edit that reaches for the writer is red rather
  // than merely discouraged.
  const source = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  const body = /export function planOneShotOffer\([\s\S]*?\n\}/u.exec(source);
  assert.ok(body, "src/core/project-plan.ts exports no planOneShotOffer");
  for (const forbidden of ["applyPackRemoval", "applyFileTransaction", "unlink(", "rm(", "rmdir("]) {
    assert.ok(
      !(body[0] ?? "").includes(forbidden),
      `planOneShotOffer names ${forbidden}: an invoked one-shot pack must never cause a deletion by accident`,
    );
  }
});

test("the corroborating one-shot artifact is reported when present and its absence is not evidence that no output occurred", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planOneShotOffer = await planExport<PlanOneShotOffer>("planOneShotOffer");
  const { root, projectId } = await installedBrownfieldFixture(context);
  const ledger = invokedBrownfieldLedger(projectId);

  const absent = planOneShotOffer(
    await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger }),
    ledger,
    { path: root },
  )[0];
  assert.ok(absent);
  assert.equal(absent.corroboration?.path, BROWNFIELD_OUTPUT);
  assert.equal(absent.corroboration?.present, false);
  assert.match(
    absent.corroboration?.note ?? "",
    /absence .*not/iu,
    `the absent case does not state that absence proves nothing: ${String(absent.corroboration?.note)}`,
  );

  await writeFile(join(root, BROWNFIELD_OUTPUT), "# style rules\n", "utf8");
  const present = planOneShotOffer(
    await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger }),
    ledger,
    { path: root },
  )[0];
  assert.ok(present);
  assert.equal(present.corroboration?.present, true);

  // The artifact is CORROBORATION. The ledger's invocation record is the
  // primary signal, so the reported state is the same either way (A8).
  assert.equal(present.invokedAt, absent.invokedAt);
  assert.equal(present.removalDigest, absent.removalDigest);
});

test("the one-shot offer states what is ready and never implies anything was deleted", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const planOneShotOffer = await planExport<PlanOneShotOffer>("planOneShotOffer");
  const planPackRemoval = await planExport<PlanPackRemoval>("planPackRemoval");
  const formatProjectStatus = await formatExport<FormatProjectStatus>("formatProjectStatus");
  const { root, projectId } = await installedBrownfieldFixture(context);
  const ledger = invokedBrownfieldLedger(projectId);

  const reconciliation = await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, { ledger });
  const offers = planOneShotOffer(reconciliation, ledger, { path: root });
  const rendered = formatProjectStatus(reconciliation, planPackRemoval(reconciliation), { path: root }, offers);
  const block = rendered.split("\n").filter((line) => /ONE-SHOT|^ {2}/u.test(line));
  const text = block.join("\n");

  assert.match(text, new RegExp(`ONE-SHOT ${BROWNFIELD_PACK}`, "u"), `no ONE-SHOT line was rendered:\n${rendered}`);
  assert.match(text, new RegExp(ONE_SHOT_LIFECYCLE, "u"), "the offer does not name the lifecycle");
  assert.match(text, new RegExp(INVOKED_AT, "u"), "the offer does not name the invocation date");
  assert.match(text, /removal plan ready/u, "the offer does not say a removal plan is ready");
  assert.match(text, /Nothing has been removed/u, "the offer does not say nothing has been removed");
  assert.match(text, /alpha-aos project approve /u, "the offer carries no runnable command");

  assert.doesNotMatch(text, /delet/iu, `the offer uses deletion wording: ${text}`);
  for (const line of text.split("\n")) {
    if (!/\bremoved\b/u.test(line)) continue;
    assert.match(
      line,
      /Nothing has been removed/u,
      `a one-shot line says something was removed: ${line}`,
    );
  }
});

test("an absent ledger, a refused ledger and an unasked path give three different native-use reasons", async (context) => {
  const reconcileProjectState = await planExport<ReconcileProjectState>("reconcileProjectState");
  const ledgerHostEvidence = await planExport<
    (read: Record<string, unknown>) => { ledger: CapabilityLedger | null; ledgerAbsence: string | null }
  >("ledgerHostEvidence");
  const { root } = await installedPostgresFixture(context);

  const unasked = packStateOf(
    await reconcileProjectState({ path: root, packageRoot: repositoryRoot }),
    POSTGRES_PACK,
  ).capability.nativeUseReason;
  const absent = packStateOf(
    await reconcileProjectState({ path: root, packageRoot: repositoryRoot }, ledgerHostEvidence({ state: "absent" })),
    POSTGRES_PACK,
  ).capability.nativeUseReason;
  const refused = packStateOf(
    await reconcileProjectState(
      { path: root, packageRoot: repositoryRoot },
      ledgerHostEvidence({
        state: "unreadable",
        path: join(root, "ledger.json"),
        errno: "EISDIR",
        issues: [{ code: "SCHEMA_INVALID", documentPath: "/proofs/0", expected: "a closed proof row" }],
      }),
    ),
    POSTGRES_PACK,
  ).capability.nativeUseReason;

  // Three facts calling for three different next actions. Collapsing any two of
  // them hides a REFUSED document behind a routine one, which is the same
  // collapse `readCapabilityLedger` itself refuses to make.
  assert.equal(new Set([unasked, absent, refused]).size, 3, `${unasked}\n${absent}\n${refused}`);
  assert.match(unasked, /no capability ledger was supplied on this path/u);
  assert.match(absent, /no capability ledger exists on this host yet/u);
  assert.match(refused, /REFUSED/u);
  assert.match(refused, /EISDIR/u, "the refusal does not carry the errno a user needs");
  assert.doesNotMatch(refused, /exists on this host yet/u, "a refused ledger reads as an absent one");
});

// ---------------------------------------------------------------------------
// Plan 03-10 Task 1: the six CAPA-08 domains, from synthetic evidence
// ---------------------------------------------------------------------------
//
// CAPA-08 asks for representative packs across web, API/data, infrastructure,
// agent/AI, security and scientific projects, WITHOUT installing a broad
// language or framework profile globally. 03-CONTEXT.md D-15 chooses synthetic
// fixture repositories built by the tests for that proof, because they are
// deterministic, offline and portable to the three-OS matrix.
//
// Every assertion below runs the planner MODULE rather than the CLI. That is
// deliberate and is what makes the concurrency case expressible at all: the
// catalog, schema and manifest caches are process-wide and root-keyed, so two
// fixtures must be live in ONE process for the keying to be under test.

/** The fixture root for one domain, removed when the test ends. */
async function domainRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-capa08-${label}-`));
  context.after(async () => removeFixture(root));
  return root;
}

async function planFor(root: string): Promise<ProjectCapabilityPlan> {
  return planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
}

function evaluationOf(plan: ProjectCapabilityPlan, packId: string): PackEvaluation {
  const found = plan.evaluations.find((evaluation) => evaluation.packId === packId);
  assert.ok(found, `${packId} was not evaluated at all: ${plan.evaluations.map((entry) => entry.packId).join(", ")}`);
  return found;
}

/**
 * Everything a positive fixture must be true of, asserted once so the six
 * per-domain tests below differ only in their domain.
 *
 * The EXACT selected set is the load-bearing part. A membership assertion would
 * pass on a fixture whose evidence had quietly started qualifying a second
 * pack, and a fixture that selects two packs is no longer minimal evidence for
 * one of them.
 */
async function assertPositiveDomain(context: TestContext, domain: PackDomain): Promise<ProjectCapabilityPlan> {
  const spec = DOMAIN_FIXTURES[domain];
  const root = await domainRoot(context, domain);
  await createDomainFixture(domain, root);
  const plan = await planFor(root);

  assert.deepEqual(
    plan.selected,
    [...spec.selectsExactly],
    `${domain}: the fixture no longer selects EXACTLY its declared pack`,
  );
  assert.equal(evaluationOf(plan, spec.packId).status, "selected");

  // The rationale is data, not prose in a comment: a domain whose recorded
  // reason was dropped is a red test rather than an unreviewable mapping.
  assert.ok(spec.rationale.length > 40, `${domain}: no recorded reason for choosing ${spec.packId}`);
  assert.ok(
    spec.skills.length > 0,
    `${domain}: ${spec.packId} supplies no skill, so it exercises no materialization target`,
  );

  // Offline and root-bounded, asserted rather than asserted-by-comment. Every
  // evidence path a leaf names is relative and inside the fixture, and the plan
  // names no executable, so nothing here could have spawned a harness.
  assert.equal(plan.executable, null, `${domain}: the plan names an executable, so the preview path is not spawn-free`);
  for (const evaluation of plan.evaluations) {
    for (const leaf of [...evaluation.satisfied, ...evaluation.failed]) {
      if (leaf.path === null) continue;
      assert.equal(isAbsolute(leaf.path), false, `${domain}: ${leaf.factId} names an absolute path: ${leaf.path}`);
      assert.equal(
        leaf.path.split("/").includes(".."),
        false,
        `${domain}: ${leaf.factId} escapes the fixture: ${leaf.path}`,
      );
    }
  }
  return plan;
}

test("CAPA-08 web: a vue project with a browser entrypoint selects exactly WEB_BASE", async (context) => {
  const plan = await assertPositiveDomain(context, "web");
  assert.deepEqual(
    evaluationOf(plan, "WEB_BASE").satisfied.map((leaf) => leaf.factId),
    ["browser-entrypoint", "web-framework"],
  );
  // WEB_REACT declares react and next as inline literals. A vue dependency must
  // not reach it, or the fixture would be evidence for two packs at once.
  assert.notEqual(evaluationOf(plan, "WEB_REACT").status, "selected");
});

test("CAPA-08 API/data: a declared postgres driver selects exactly DB_POSTGRES", async (context) => {
  const plan = await assertPositiveDomain(context, "api-data");
  assert.deepEqual(
    evaluationOf(plan, "DB_POSTGRES").satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["postgres-driver", "package.json"]],
  );
});

test("CAPA-08 infrastructure: a lone Dockerfile selects exactly CONTAINER", async (context) => {
  const plan = await assertPositiveDomain(context, "infrastructure");
  assert.deepEqual(
    evaluationOf(plan, "CONTAINER").satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["file:Dockerfile", "Dockerfile"]],
  );
});

test("CAPA-08 agent/AI: a model SDK plus eval assets selects exactly AI_EVAL", async (context) => {
  const plan = await assertPositiveDomain(context, "agent-ai");
  assert.deepEqual(
    evaluationOf(plan, "AI_EVAL").satisfied.map((leaf) => leaf.factId),
    ["eval-assets", "model-sdk"],
  );
  // The agent-runtime pack must not ride along on a repository that merely
  // holds an AI dependency. Its own rule gets its own fixture in Task 2.
  assert.notEqual(evaluationOf(plan, AGENT_RUNTIME_PACK_ID).status, "selected");
});

/**
 * A manifest-opt-in domain qualified through the MANIFEST branch, not through a
 * file heuristic.
 *
 * Asserting the selected set alone would pass if some future file heuristic
 * started answering for the same pack, which is precisely the confusion
 * `manifestOptIn` exists to prevent: an opt-in is a statement the project made,
 * and a heuristic is a guess alpha-AOS made.
 */
function assertManifestBranch(plan: ProjectCapabilityPlan, spec: DomainFixtureSpec): void {
  const evaluation = evaluationOf(plan, spec.packId);
  const edit = spec.nearMissEdit;
  assert.equal(edit.kind, "manifestKey", `${spec.domain} is not a manifest-opt-in domain`);
  const key = edit.kind === "manifestKey" ? edit.key : "";

  assert.deepEqual(
    evaluation.satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [[`manifest:${key}`, PROJECT_MANIFEST_PATH]],
    `${spec.domain}: the selection did not come from the manifest branch alone`,
  );
  assert.match(evaluation.explanation, new RegExp(`opts in to ${key}`, "u"));
}

test("CAPA-08 security: SECURITY_REVIEW selects from the manifest opt-in, not from a file heuristic", async (context) => {
  const plan = await assertPositiveDomain(context, "security");
  assertManifestBranch(plan, DOMAIN_FIXTURES.security);
});

test("CAPA-08 scientific: RESEARCH_SCIENTIFIC selects from the manifest opt-in, not from a file heuristic", async (context) => {
  const plan = await assertPositiveDomain(context, "scientific");
  assertManifestBranch(plan, DOMAIN_FIXTURES.scientific);
});

test("two synthetic fixtures evaluated in one process do not borrow each other's selection", async (context) => {
  // Both fixtures reach the SAME package root, so the process-wide catalog,
  // schema and manifest caches are shared between them by construction. Both
  // qualify through a manifest opt-in, and they opt in to DIFFERENT keys — so a
  // cache that carried a project fact rather than a package-root fact would let
  // one fixture select the other's pack, which is the CAPA-08 concurrency edge.
  const securityRoot = await domainRoot(context, "concurrent-security");
  const scientificRoot = await domainRoot(context, "concurrent-scientific");
  await createDomainFixture("security", securityRoot);
  await createDomainFixture("scientific", scientificRoot);

  const [security, scientific] = await Promise.all([planFor(securityRoot), planFor(scientificRoot)]);
  assert.deepEqual(security.selected, ["SECURITY_REVIEW"]);
  assert.deepEqual(scientific.selected, ["RESEARCH_SCIENTIFIC"]);
  assert.notEqual(security.scope.projectId, scientific.scope.projectId);

  // Interleaved, and then re-read: an evaluation that changed on the second
  // pass would mean the first pass left something behind.
  const securityAgain = await planFor(securityRoot);
  const scientificAgain = await planFor(scientificRoot);
  assert.deepEqual(securityAgain.selected, ["SECURITY_REVIEW"]);
  assert.deepEqual(scientificAgain.selected, ["RESEARCH_SCIENTIFIC"]);
  assert.equal(securityAgain.planDigest, security.planDigest);
  assert.equal(scientificAgain.planDigest, scientific.planDigest);

  // Neither borrowed the other's manifest key.
  assert.equal(evaluationOf(security, "RESEARCH_SCIENTIFIC").status, "silent");
  assert.equal(evaluationOf(scientific, "SECURITY_REVIEW").status, "unimplemented");
});

test("every CAPA-08 domain fixture is covered, and each names its pack, its skills and its reason", () => {
  assert.deepEqual(
    [...PACK_DOMAINS],
    ["web", "api-data", "infrastructure", "agent-ai", "security", "scientific"],
    "the six CAPA-08 domains are no longer the six the requirement names",
  );
  const packIds = new Set<string>();
  for (const domain of PACK_DOMAINS) {
    const spec = DOMAIN_FIXTURES[domain];
    assert.equal(spec.domain, domain, `${domain}: the table key and the recorded domain disagree`);
    assert.ok(spec.packId.length > 0, `${domain}: no pack id`);
    assert.equal(packIds.has(spec.packId), false, `${spec.packId} represents two domains`);
    packIds.add(spec.packId);
    assert.deepEqual(spec.selectsExactly, [spec.packId], `${domain}: the exact selected set is not its own pack`);
  }
  assert.equal(packIds.size, 6);
});

// ---------------------------------------------------------------------------
// Plan 03-10 Task 2: six near-miss twins, and the generic-instructions rule
// ---------------------------------------------------------------------------
//
// A twin is its positive minus exactly ONE required evidence leaf. The
// one-edit property is asserted structurally rather than trusted, because a
// twin that drifts into differing by three things is quietly testing something
// else and nothing would say so.
//
// What each twin must produce is a REASON that names the leaf that went
// missing. DETC-03's contract is that a failed leaf is never silent; these six
// are that contract applied to the six CAPA-08 domains, and they are the
// difference between a useful report and a shrug.

/**
 * The recorded twin status is per domain, and deliberately not uniform.
 *
 * The declared catalog does not make it uniform: a pack whose predicate is
 * `all` keeps a satisfied leaf when one is removed and is a genuine
 * `near-miss`, a pack whose predicate is `any` over a single minimal leaf has
 * nothing left and is `silent`, and `SECURITY_REVIEW` is `unimplemented`
 * because its eight change-risk leaves are declared and deferred to GATE-01.
 * Flattening the three into one expectation would hide a real property of the
 * evaluator behind a fixture convention.
 */
async function assertNearMissTwin(context: TestContext, domain: PackDomain): Promise<ProjectCapabilityPlan> {
  const spec = DOMAIN_FIXTURES[domain];
  const root = await domainRoot(context, `twin-${domain}`);
  await createNearMissFixture(domain, root);
  const plan = await planFor(root);

  // Non-selection, stated as the whole set: a twin that selects some OTHER
  // pack is no longer the same repository minus one leaf.
  assert.deepEqual(plan.selected, [], `${domain}: the twin selected something`);

  const evaluation = evaluationOf(plan, spec.packId);
  assert.equal(evaluation.status, spec.twinStatus, `${domain}: the twin's status moved`);

  const leaf = evaluation.failed.find((entry) => entry.factId === spec.nearMissLeafFactId);
  assert.ok(
    leaf,
    `${domain}: the removed leaf ${spec.nearMissLeafFactId} is not among the failed leaves: ` +
      evaluation.failed.map((entry) => entry.factId).join(", "),
  );
  assert.equal(leaf.detected, false);

  // The reason must NAME the removed evidence. A non-empty string is not
  // enough — the fallback sentence is non-empty too, and it says nothing.
  const reason = leaf.reason ?? "";
  assert.notEqual(
    reason,
    "not detected, and the detector gave no further reason",
    `${domain}: the removed leaf fell back to the silent reason`,
  );
  assert.ok(
    reason.includes(spec.nearMissReasonNames),
    `${domain}: the reason does not name ${spec.nearMissReasonNames}: ${reason}`,
  );

  // Where the twin IS a near-miss, the rendered top line must carry the same
  // fact: what was found, and what was missing.
  if (spec.twinStatus === "near-miss") {
    assert.ok(plan.nearMissOrder.includes(spec.packId), `${domain}: a near-miss twin is not in nearMissOrder`);
    assert.match(evaluation.explanation, /— missing: /u);
    assert.ok(
      evaluation.explanation.includes(leaf.phrase),
      `${domain}: the near-miss line does not name the removed leaf: ${evaluation.explanation}`,
    );
  }
  return plan;
}

test("CAPA-08 web twin: removing the browser entrypoint drops WEB_BASE and names the leaf", async (context) => {
  await assertNearMissTwin(context, "web");
});

test("CAPA-08 API/data twin: removing the postgres driver drops DB_POSTGRES and names the leaf", async (context) => {
  await assertNearMissTwin(context, "api-data");
});

test("CAPA-08 infrastructure twin: removing the Dockerfile drops CONTAINER and names the leaf", async (context) => {
  await assertNearMissTwin(context, "infrastructure");
});

test("CAPA-08 agent/AI twin: removing the eval assets drops AI_EVAL and names the leaf", async (context) => {
  await assertNearMissTwin(context, "agent-ai");
});

test("CAPA-08 security twin: removing the manifest opt-in drops SECURITY_REVIEW and names the key", async (context) => {
  const plan = await assertNearMissTwin(context, "security");
  // The twin is `unimplemented`, and its top line names the eight deferred
  // change-risk facts rather than the manifest key. That is the evaluator
  // being honest about which absence dominates — the key is still named, at
  // leaf level, which is what `assertNearMissTwin` just checked.
  assert.match(evaluationOf(plan, "SECURITY_REVIEW").explanation, /deferred to GATE-01/u);
});

test("CAPA-08 scientific twin: removing the manifest opt-in drops RESEARCH_SCIENTIFIC and names the key", async (context) => {
  await assertNearMissTwin(context, "scientific");
});

test("a repository holding only a generic agent-instructions file activates no agent-runtime pack", async (context) => {
  const root = await domainRoot(context, "generic-instructions");
  await createGenericInstructionsFixture(root);
  const plan = await planFor(root);

  // design §5.2 and DETC-03, at the pack level: an AGENTS.md is evidence that
  // SOMETHING reads agent instructions, never evidence of which runtime.
  assert.deepEqual(plan.selected, [], "a bare AGENTS.md selected a pack");

  const agentRuntime = evaluationOf(plan, AGENT_RUNTIME_PACK_ID);
  assert.notEqual(agentRuntime.status, "selected");
  assert.deepEqual(
    agentRuntime.satisfied.map((leaf) => [leaf.factId, leaf.path]),
    [["agent-runtime-config", "AGENTS.md"]],
  );
  // The rule is carried by the `broad` flag on the declared fact, not by a
  // per-pack special case. Asserting the flag is what keeps the general form
  // of the rule under test rather than this one pack's spelling of it.
  assert.equal(
    agentRuntime.satisfied.every((leaf) => leaf.broad),
    true,
    "the only satisfied leaf is no longer marked broad, so the rule now rests on something else",
  );

  // The reason names what was actually required, rather than merely reporting
  // a non-selection.
  assert.ok(
    agentRuntime.failed.some((leaf) => leaf.factId === "agent-sdk-dependency"),
    "the agent SDK leaf is not reported as the missing one",
  );
  assert.match(agentRuntime.explanation, /— missing: /u);
  assert.match(agentRuntime.explanation, /agent-orchestration framework/u);

  // The sibling AI packs must not ride along on the same file either.
  assert.notEqual(evaluationOf(plan, "MCP_SERVER").status, "selected");
  assert.notEqual(evaluationOf(plan, "AI_EVAL").status, "selected");
});

test("a near-miss reason is reported for a pack that came close and withheld from one nothing touched", async (context) => {
  const root = await domainRoot(context, "distinguishable-absences");
  await createNearMissFixture("web", root);
  const plan = await planFor(root);

  const close = evaluationOf(plan, "WEB_BASE");
  const untouched = evaluationOf(plan, "CACHE_REDIS");

  // Two ABSENCES that call for opposite next actions. Collapsing them would
  // make "did not qualify" indistinguishable from "was never evaluated",
  // which is the failure Phase 2 recorded when a predicate operator had no
  // evaluator at all.
  assert.equal(close.status, "near-miss");
  assert.equal(untouched.status, "silent");
  assert.ok(close.satisfied.length > 0);
  assert.equal(untouched.satisfied.length, 0);

  assert.ok(plan.nearMissOrder.includes("WEB_BASE"), "the close pack carries no near-miss reason");
  assert.equal(
    plan.nearMissOrder.includes("CACHE_REDIS"),
    false,
    "an untouched pack was given a near-miss reason it did not earn",
  );
  assert.deepEqual(
    rankNearMisses(plan.evaluations).map((entry) => entry.packId),
    [...plan.nearMissOrder],
    "the plan's near-miss order and the ranking function disagree",
  );

  assert.match(close.explanation, /— missing: /u);
  assert.doesNotMatch(untouched.explanation, /— missing: /u);
  assert.match(untouched.explanation, /no declared evidence matched/u);
});

test("every near-miss twin differs from its positive by exactly one file or one manifest key", () => {
  for (const domain of PACK_DOMAINS) {
    const spec = DOMAIN_FIXTURES[domain];
    const difference = nearMissDifference(domain);

    // Nothing is ADDED. A twin that adds a file to compensate for the one it
    // removed is a different repository, not a twin.
    assert.deepEqual(difference.addedFiles, [], `${domain}: the twin adds a file`);
    assert.deepEqual(difference.addedManifestKeys, [], `${domain}: the twin adds a manifest key`);

    const removals = difference.removedFiles.length + difference.removedManifestKeys.length;
    assert.equal(
      removals,
      1,
      `${domain}: the twin differs by ${removals} things, not one: ` +
        `files=${difference.removedFiles.join(",")} keys=${difference.removedManifestKeys.join(",")}`,
    );

    // And the ONE difference is the edit the table declares, so the recorded
    // leaf and the materialized edit cannot drift apart.
    if (spec.nearMissEdit.kind === "file") {
      assert.deepEqual(difference.removedFiles, [spec.nearMissEdit.path], `${domain}: the removed file is not the declared one`);
    } else {
      assert.deepEqual(
        difference.removedManifestKeys,
        [spec.nearMissEdit.key],
        `${domain}: the removed manifest key is not the declared one`,
      );
    }
  }
});

test("the described shape of a twin matches what it actually writes to disk", async (context) => {
  // `describeFixture` is what the one-edit assertion above compares. If it
  // described something other than what `createNearMissFixture` materializes,
  // that assertion would be about a table rather than about a repository.
  for (const domain of PACK_DOMAINS) {
    const root = await domainRoot(context, `shape-${domain}`);
    await createNearMissFixture(domain, root);
    const written: string[] = [];
    const walk = async (directory: string, prefix: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isDirectory()) await walk(join(directory, entry.name), relativePath);
        else if (entry.isFile()) written.push(relativePath);
      }
    };
    await walk(root, "");
    assert.deepEqual(
      written.sort(),
      [...describeFixture(nearMissSpec(domain)).files].sort(),
      `${domain}: the twin's described shape and its materialized files disagree`,
    );
  }
});

// ---------------------------------------------------------------------------
// Plan 03-10 Task 3: the one-file-per-pack-skill guard
// ---------------------------------------------------------------------------
//
// 03-RESEARCH.md Pitfall 7 measured the situation this guard exists for: 21 of
// the 22 locked skills are a lone SKILL.md, `security-review` ships a companion
// `cloud-infrastructure-security.md`, and D-05 materializes SKILL.md only. The
// companion is never referenced by `security-review/SKILL.md`, so the rule is
// safe TODAY — by coincidence, not by contract.
//
// That is exactly why the guard is a FINDING and not a refusal. Refusing today
// would break a materialization that loses nothing; staying silent would let
// the next ECC bump that adds a `references/` directory ship a half-written
// pack. The finding is what makes the next bump loud, and escalating it to a
// refusal is a one-line change once a pack skill genuinely needs a second file.

/** A pack-sync fixture whose source tree the test owns, so no ECC pack is fetched. */
interface ShapeFixture {
  readonly root: string;
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly sourceRoot: string;
  readonly sourceHash: string;
}

const SHAPE_PACK_ID = "WEB_REACT";
const SHAPE_PACK_SKILL = "frontend-a11y";

/**
 * A project selecting one pack, plus a package root whose lock pins the bytes
 * of a source tree this test wrote.
 *
 * `companions` are extra entries placed BESIDE the skill file, which is the
 * shape 03-RESEARCH.md Pitfall 7 found in `security-review` and the shape the
 * guard has to notice.
 */
async function shapeFixture(
  context: TestContext,
  label: string,
  companions: readonly string[] = [],
): Promise<ShapeFixture> {
  const root = await scratchRoot(context, `shape-${label}-project`);
  await writeFile(
    join(root, "package.json"),
    `${JSON.stringify({ name: "shape-fixture", private: true, dependencies: { react: "^19.0.0" } }, null, 2)}\n`,
    "utf8",
  );

  const support = await scratchRoot(context, `shape-${label}-support`);
  const stateRoot = join(support, "state");
  const packageRoot = join(support, "package-root");
  await cp(join(repositoryRoot, "catalog"), join(packageRoot, "catalog"), { recursive: true });
  await cp(join(repositoryRoot, "schemas"), join(packageRoot, "schemas"), { recursive: true });

  const sourceRoot = join(support, "source");
  const body = `---\nname: ${SHAPE_PACK_SKILL}\n---\n\n# frontend accessibility, fixture bytes\n`;
  await mkdir(join(sourceRoot, SHAPE_PACK_SKILL), { recursive: true });
  await writeFile(join(sourceRoot, SHAPE_PACK_SKILL, "SKILL.md"), body, "utf8");
  for (const companion of companions) {
    await writeFile(join(sourceRoot, SHAPE_PACK_SKILL, companion), "# a companion this SKILL.md never references\n", "utf8");
  }
  const sourceHash = createHash("sha256").update(body, "utf8").digest("hex");

  const lockPath = join(packageRoot, "catalog", "stack.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8")) as {
    components: { ecc: { sourceSha256: Record<string, string> } };
  };
  lock.components.ecc.sourceSha256[SHAPE_PACK_SKILL] = sourceHash;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

  const plan = await planProjectCapabilities({ path: root, packageRoot });
  assert.deepEqual(plan.applicable, [SHAPE_PACK_ID], "the shape fixture no longer selects exactly one pack");
  const approveProjectPlan = await planExport<ApproveProjectPlan>("approveProjectPlan");
  const approved = await approveProjectPlan({ path: root, packageRoot, stateRoot, expectedDigest: plan.planDigest });
  assert.equal(approved.status, "written");

  return { root, stateRoot, packageRoot, sourceRoot, sourceHash };
}

test("a pack skill source directory holding exactly one file passes the shape guard", async (context) => {
  const fixture = await shapeFixture(context, "single");
  const finding = await assertPackSourceShape(
    SHAPE_PACK_ID,
    SHAPE_PACK_SKILL,
    join(fixture.sourceRoot, SHAPE_PACK_SKILL),
  );
  assert.equal(finding, null, "a lone SKILL.md produced a finding");

  const plan = await planProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.deepEqual(plan.sourceFindings, [], "a one-file pack produced a plan-time finding");
});

test("a two-file pack skill source is loud at plan time, naming the pack, the skill and the extra entry", async (context) => {
  const companion = "cloud-infrastructure-security.md";
  const fixture = await shapeFixture(context, "companion", [companion]);

  const finding = await assertPackSourceShape(
    SHAPE_PACK_ID,
    SHAPE_PACK_SKILL,
    join(fixture.sourceRoot, SHAPE_PACK_SKILL),
  );
  assert.ok(finding, "a two-file source directory produced no finding");
  assert.equal(finding.code, PACK_SOURCE_MULTI_FILE, "the finding carries no stable upper-snake code");
  assert.match(finding.code, /^[A-Z][A-Z0-9_]*$/u);
  assert.equal(finding.packId, SHAPE_PACK_ID);
  assert.equal(finding.skill, SHAPE_PACK_SKILL);
  assert.deepEqual(finding.extraEntries, [companion], "the finding does not name the extra entry");
  for (const named of [SHAPE_PACK_ID, SHAPE_PACK_SKILL, companion]) {
    assert.ok(finding.detail.includes(named), `the finding's detail does not name ${named}: ${finding.detail}`);
  }
  // The finding records WHY it is a finding rather than a refusal, so the next
  // reader does not have to rediscover 03-RESEARCH.md Pitfall 7 to judge it.
  assert.match(finding.detail, /refus/iu, "the finding does not say what the right escalation is");

  const plan = await planProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.deepEqual(
    plan.sourceFindings.map((entry) => [entry.code, entry.packId, entry.skill]),
    [[PACK_SOURCE_MULTI_FILE, SHAPE_PACK_ID, SHAPE_PACK_SKILL]],
  );

  // BEFORE any write. `planProjectPackSync` is a read, so the target it
  // describes must still be absent when the finding has already been produced.
  for (const target of plan.targets) {
    assert.equal(existsSync(target.destination), false, `${target.path} exists, so a write preceded the finding`);
  }
});

test("a pack whose source shape fires the finding is still listed in the plan, with the finding attached", async (context) => {
  const fixture = await shapeFixture(context, "still-listed", ["references"]);
  const plan = await planProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });

  // Both facts, together. Dropping the pack would silently withhold a
  // capability the evidence earned; withholding the finding would materialize
  // a partial pack. The user is told both.
  assert.deepEqual(plan.packs, [SHAPE_PACK_ID], "the pack was dropped when the finding fired");
  assert.ok(plan.targets.length > 0, "the pack's targets were dropped when the finding fired");
  assert.equal(plan.sourceFindings.length, 1);
  assert.equal(plan.sourceFindings[0]?.packId, SHAPE_PACK_ID);
});

test("a materialized pack skill hashes to the locked source hash, and no code path rewrites the bytes", async (context) => {
  const fixture = await shapeFixture(context, "bytes");
  const result = await applyProjectPackSync({
    path: fixture.root,
    packageRoot: fixture.packageRoot,
    stateRoot: fixture.stateRoot,
    verifiedSourceRoot: fixture.sourceRoot,
  });
  assert.equal(result.status, "written");

  const lock = await loadLock(fixture.packageRoot);
  const expected = (resolvePackSource(lock, SHAPE_PACK_ID, SHAPE_PACK_SKILL) as { sourceSha256: string }).sourceSha256;
  assert.equal(expected, fixture.sourceHash, "the fixture lock no longer pins the bytes the fixture wrote");

  const written = result.written.filter((path) => path.endsWith("SKILL.md"));
  assert.ok(written.length > 0, "no SKILL.md was written");
  for (const path of written) {
    // The DIRECTORY segment of every target is the catalog-declared skill id,
    // verbatim. A canonicalizer that resolved the frontmatter/directory
    // divergence would show up here as a different segment, and the lock's
    // sourceSha256 keying would break with it.
    const segments = path.split("/");
    assert.equal(
      segments[segments.length - 2],
      SHAPE_PACK_SKILL,
      `a target path segment is not the catalog-declared skill id: ${path}`,
    );
    const bytes = await readFile(join(fixture.root, ...path.split("/")));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expected,
      `${path} does not hash to the locked source hash, so something rewrote the bytes`,
    );
  }
});

test("no shipped module renames a pack skill source directory or edits its frontmatter", async () => {
  // The byte comparison above is the runtime backstop. This is the static one:
  // the only `rename` in the shipped source is the transaction's atomic
  // temp-file swap, which renames alpha-AOS's OWN temporary file into place and
  // never a source directory.
  const suspects = ["core/project-plan.ts", "core/project-pack-sync.ts", "core/ecc-skills.ts", "adapters/capability-oracle.ts"];
  for (const relative of suspects) {
    const source = await readFile(join(repositoryRoot, "src", ...relative.split("/")), "utf8");
    const code = source
      .split("\n")
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/u.test(line))
      .join("\n");
    assert.doesNotMatch(code, /\brename\s*\(/u, `${relative} calls rename()`);
    assert.doesNotMatch(code, /replace\([^)]*name:/u, `${relative} rewrites a frontmatter name`);
  }
});
