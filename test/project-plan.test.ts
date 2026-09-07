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
  StackLock,
} from "../src/types.js";
import type { DeclaredDependency } from "../src/core/evidence.js";
import { loadCatalog, loadLock } from "../src/core/catalog.js";
import { reviewedDigest } from "../src/core/component-session.js";
import { collectProjectEvidence, digestableEvidence, resolveCanonicalRoot } from "../src/core/evidence.js";
import { formatProjectPlan } from "../src/format.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "../src/core/pack-catalog.js";
import {
  digestablePlan,
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
        targets: [{ harness: "claude", path: targetPath, targetHash: createHash("sha256").update(bytes, "utf8").digest("hex") }],
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

test("a pack skill colliding with a personal-scope skill records a named shadowing approval", async (context) => {
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
  const shadowed = (JSON.parse(collided.stdout) as { approvals: Array<{ code: string; detail: string }> }).approvals
    .filter((entry) => entry.code === "SKILL_SHADOWED");
  assert.equal(shadowed.length, 1, `expected one shadowing approval, got ${shadowed.length}`);
  assert.match(shadowed[0]?.detail ?? "", new RegExp(REACT_PACK_SKILL, "u"));

  // Emitted on an OBSERVED collision, never assumed.
  const quiet = await runCli(["project", "plan", root, "--json"], {
    HOME: emptyHome,
    USERPROFILE: emptyHome,
    CLAUDE_CONFIG_DIR: undefined,
    ANTIGRAVITY_CONFIG_DIR: undefined,
    HERMES_HOME: undefined,
  });
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.deepEqual(
    (JSON.parse(quiet.stdout) as { approvals: Array<{ code: string }> }).approvals.filter((entry) => entry.code === "SKILL_SHADOWED"),
    [],
  );
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

  const result = await runCli(["project", "approve", root], { ALPHA_AOS_STATE_DIR: stateRoot });

  assert.equal(result.status, 0, result.stderr);
  const digest = planDigestOf(result.stdout);
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  assert.equal(digest, plan.planDigest, "the preview printed a digest the plan does not produce");
  assert.match(result.stdout, /--plan-digest/u);
  assert.equal(existsSync(join(root, ".alpha-aos", "plan.json")), false, "a preview wrote the artifact");
  assert.deepEqual(await snapshotTree(root), before, "a preview changed the project tree");
  assert.equal(existsSync(stateRoot), false, "a preview created the managed state root");
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

test("project sync --apply still refuses with the Phase 3 message", async (context) => {
  const { root, stateRoot } = await approvalFixture(context);

  const result = await runCli(["project", "sync", root, "--apply"], { ALPHA_AOS_STATE_DIR: stateRoot });

  assert.notEqual(result.status, 0, "the Phase 3 gate was opened early");
  assert.match(result.stderr, /not enabled until trust and transaction support are implemented/u);
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
