// Plan 02-01 tracer: one repository directory selects one YAML-declared pack.
//
// The assertions here run the built CLI, not the modules, because the seam
// under test is the whole path — canonical root, evidence, pack catalog,
// predicate evaluation, plan digests, and the single `print()` output seam.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
  EvidenceFact,
  FactDeclaration,
  LeafResult,
  PackDeclaration,
  PackEvaluation,
  PackOverride,
  ProjectCapabilityPlan,
  ProjectStackManifest,
} from "../src/types.js";
import type { DeclaredDependency } from "../src/core/evidence.js";
import { collectProjectEvidence, resolveCanonicalRoot } from "../src/core/evidence.js";
import { formatProjectPlan } from "../src/format.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "../src/core/pack-catalog.js";
import {
  evaluatePack,
  MAX_NEAR_MISS_LINES,
  planProjectCapabilities,
  rankNearMisses,
  type PackEvaluationEnvironment,
} from "../src/core/project-plan.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(testDirectory, "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Mirrors `runCli` in test/preview.test.ts, but asynchronous so two runs can overlap. */
function runCli(args: readonly string[]): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliEntry, ...args], {
      cwd: repositoryRoot,
      windowsHide: true,
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
  assert.equal(plan.scope.rootReason, "standalone-directory");
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
    evaluations,
    selected: [],
    nearMissOrder: rankNearMisses(evaluations).map((evaluation) => evaluation.packId),
    subProjects: [],
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
