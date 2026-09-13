// Plan 03-05: `catalog/canaries.yaml` is the single authority for every prompt
// a canary run may put in front of a model, and `probeReadiness` is the single
// authority for whether a capability is `blocked` or merely `unverified`.
//
// These assertions run the loaders and probes directly rather than the CLI,
// because the seams under test are the declared-data boundary and the
// pre-probe. Nothing here launches a harness: every command result is supplied,
// so the suite is offline, free, and portable to the three-OS matrix.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CODEX_CANARY_DEVELOPER_INSTRUCTIONS,
  ORACLE_DEFINITIONS,
  type PairedDiscovery,
} from "../src/adapters/capability-oracle.js";
import { loadLock, ManagedDocumentError } from "../src/core/catalog.js";
import {
  assertCanaryContext,
  assertCanaryEnvironmentDeclared,
  assertCanaryLaunchIsolation,
  assertRuntimeContainment,
  BLOCKED_CODES,
  CANARY_ENVIRONMENT_UNDECLARED_NAME,
  CANARY_LAUNCH_ISOLATION_VIOLATION,
  CANARY_RUNTIME_ALREADY_CONSUMED,
  CANARY_RUNTIME_NOT_CONTAINED,
  CANARY_SELECTION_EMPTY,
  CanaryBoundaryError,
  CANARY_CATALOG_FILE,
  CANARY_IN_PREVIEW_CONTEXT,
  CanarySelectionError,
  canaryCosts,
  canaryCostsModelTurn,
  canaryEnvironmentNames,
  canaryEnvironmentPolicy,
  canaryPromptArgs,
  CanaryContextError,
  catalogCosts,
  comparePlanningTrees,
  countDistinctServers,
  createCanaryLaunchSpec,
  createCanaryObservationSink,
  createCanaryRuntime,
  decideInvocation,
  disposeCanary,
  disposeCanaryRuntime,
  deriveCodexMcpOverrides,
  findPromptHints,
  HANDOFF_CANARY_ID,
  HANDOFF_CAPABILITY,
  HANDOFF_HARNESS_PAIRS,
  HANDOFF_SCOPE_LIMIT,
  handoffRow,
  hashPlanningTree,
  loadCanaryCatalog,
  MEMORY_HANDOFF_INSTRUCTION_ID,
  ownedInstructionsFor,
  resolveCapabilityFilter,
  resolveHandoffPair,
  runHandoffCanary,
  skippedCanaryRow,
  matchExpectations,
  parseClaudeMcpList,
  parsePiAuthCheck,
  probeReadiness,
  promptNamesTerm,
  canaryRow,
  canaryProof,
  canaryClaimNotes,
  CANARY_RUNTIME_SCOPE_LIMIT,
  discoveryRow,
  runCanary,
  runCanarySweep,
  runDiscoverySweep,
  selectCanaries,
  selfNamedTerms,
  type CanaryCatalog,
  type CanaryDeclaration,
  type CanaryRunResult,
  type CanaryRuntime,
  type CapabilityReportRow,
  type ReadinessCommandResult,
  type ReadinessRunner,
} from "../src/core/canary.js";
import {
  MEMORY_ENVELOPES,
  memoryDoctor,
  memoryHandoff,
  memorySearch,
  type MemoryCommand,
  type MemoryCommandResult,
  type MemoryRunner,
} from "../src/adapters/unified-memory.js";
import {
  CAPABILITY_LEDGER_SCHEMA_VERSION,
  harnessMinorKey,
  pairEvidence,
  readCapabilityLedger,
  upsertProof,
  writeCapabilityLedger,
  type CapabilityProof,
  type LedgerHarness,
} from "../src/core/capability-ledger.js";
import { formatCapabilityReport, formatHandoffEvidence } from "../src/format.js";
import {
  createFileObservationSink,
  identifierShapeOf,
  observationLine,
  readObservationRecords,
  type IdentifierShape,
  type McpObservation,
} from "../src/core/mcp-proxy.js";
import { renderMcpConfig } from "../src/core/mcp.js";
import { createRedactedExcerpt, createRedactionContext, placeholder, serializeObservable } from "../src/core/redaction.js";
import { packageRoot } from "../src/core/paths.js";
import { materializeEnvironment, PLATFORM_FLOOR_ENVIRONMENT } from "../src/core/process.js";
import type { IsolationLaunchSpec, McpServerId, StackLock } from "../src/types.js";

/** Compiled to dist/test, so the repository root is two levels up. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const cliEntry = join(repositoryRoot, "dist", "src", "cli.js");

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

/**
 * A temporary root mirroring the real `schemas/` + `catalog/` layout the loader
 * reads. The whole schemas directory is copied so a fixture is judged by the
 * contract the repository actually ships, never by a second copy of it.
 */
async function canaryFixture(context: TestContext, body: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-canaries-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await cp(join(packageRoot(), "schemas"), join(root, "schemas"), { recursive: true });
  await mkdir(join(root, "catalog"), { recursive: true });
  await writeFile(join(root, ...CANARY_CATALOG_FILE.split("/")), body, "utf8");
  return root;
}

/** Asserts the load was refused, and hands back the refusal for inspection. */
async function rejection(run: () => Promise<unknown>): Promise<ManagedDocumentError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ManagedDocumentError, `expected a ManagedDocumentError, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: "expected the load to be refused, but it resolved" });
}

const VALID_CANARY = `schemaVersion: 1
canaries:
  - id: FIXTURE_LOOKUP
    capability: CAPA-01
    prompt: What port does a Vite dev server listen on by default?
    expectTools: []
    forbidTools: []
    maxDistinctServers: 1
    harnesses:
      - claude
    readOnly: true
`;

let cachedCatalog: CanaryCatalog | null = null;

async function shippedCatalog(): Promise<CanaryCatalog> {
  cachedCatalog ??= (await loadCanaryCatalog(packageRoot())).value;
  return cachedCatalog;
}

interface StackLockShape {
  readonly components: {
    readonly mcp: Record<string, unknown>;
    readonly ecc: { readonly skills: readonly string[] };
    readonly ownedSkills?: Record<string, unknown>;
  };
}

/** The pinned MCP server ids and locked skill ids, read from the lock rather than restated. */
async function lockedVocabulary(): Promise<readonly string[]> {
  const lock = JSON.parse(
    await readFile(join(repositoryRoot, "catalog", "stack.lock.json"), "utf8"),
  ) as StackLockShape;
  return [
    ...Object.keys(lock.components.mcp),
    ...lock.components.ecc.skills,
    ...Object.keys(lock.components.ownedSkills ?? {}),
  ];
}

// ---------------------------------------------------------------------------
// Task 1 — the declared catalog
// ---------------------------------------------------------------------------

test("the shipped catalog declares the documentation canary, the research canary and the fan-out control", async () => {
  const catalog = await shippedCatalog();
  const byId = new Map(catalog.canaries.map((canary) => [canary.id, canary]));

  const documentation = byId.get("DOCUMENTATION_VERSION_SCOPED");
  assert.ok(documentation, "the documentation canary is not declared");
  assert.deepEqual([...documentation.expectTools], ["resolve-library-id", "query-docs"]);
  assert.equal(documentation.expectOrdered, true, "the documentation canary's two legs are ordered");
  const versionScoped = (documentation.expectArgumentPatterns ?? []).find(
    (entry) => entry.tool === "query-docs" && entry.argument === "libraryId",
  );
  assert.ok(versionScoped, "the documentation canary does not require a version-scoped identifier");
  assert.equal(new RegExp(versionScoped.pattern, "u").test("/vercel/next.js/v16.2.2"), true);
  assert.equal(
    new RegExp(versionScoped.pattern, "u").test("/vercel/next.js"),
    false,
    "a two-segment identifier is not version-scoped and must not satisfy the pattern",
  );

  const research = byId.get("RESEARCH_MULTI_SOURCE");
  assert.ok(research, "the multi-source research canary is not declared");
  assert.deepEqual([...research.expectTools], ["web_search_exa", "firecrawl_scrape"]);
  assert.equal(
    research.forbidTools.includes("firecrawl_search"),
    true,
    "the tool the policy proxy denies is not recorded as a finding, so a routing-contract mismatch would read as a routing failure",
  );

  const control = byId.get("ORDINARY_LOOKUP_CONTROL");
  assert.ok(control, "the fan-out control is not declared");
  assert.equal(control.maxDistinctServers, 1, "the fan-out control must permit exactly one distinct research server");

  for (const canary of catalog.canaries) {
    assert.equal(canary.readOnly, true, `${canary.id} is not declared read-only`);
    assert.equal(canary.harnesses.length >= 1, true, `${canary.id} is declared for no harness`);
  }
});

test("the shipped documentation canary declares one Codex leg while retaining Claude", async () => {
  const catalog = await shippedCatalog();
  const codex = selectCanaries(catalog, { harness: "codex", capability: "CAPA-01" });
  const claude = selectCanaries(catalog, { harness: "claude", capability: "CAPA-01" });

  assert.equal(codex.length, 1, "CAPA-01 must select exactly one native Codex invocation leg");
  assert.equal(codex[0]?.declaration.id, "DOCUMENTATION_VERSION_SCOPED");
  assert.equal(claude.length, 1, "the additive Codex leg must not remove the existing Claude declaration");
  assert.equal(claude[0]?.declaration.id, "DOCUMENTATION_VERSION_SCOPED");
});

test("an explicit harness filter with no declaration is refused with stable alternatives", () => {
  const catalog: CanaryCatalog = {
    schemaVersion: 1,
    canaries: [declaration({ id: "CLAUDE_ONLY", capability: "CAPA-02", harnesses: ["claude"] })],
  };

  assert.throws(
    () => selectCanaries(catalog, { harness: "codex" }),
    (error: unknown) => {
      assert.ok(error instanceof CanarySelectionError);
      assert.equal(error.code, CANARY_SELECTION_EMPTY);
      assert.match(error.message, /harness=codex/u);
      assert.match(error.message, /Declared harnesses: claude/u);
      assert.match(error.message, /alpha-aos doctor --canary --harness claude/u);
      return true;
    },
  );
});

test("an explicit capability filter with no declaration names the available ids and capabilities", () => {
  const catalog: CanaryCatalog = {
    schemaVersion: 1,
    canaries: [declaration({ id: "CLAUDE_ONLY", capability: "CAPA-02", harnesses: ["claude"] })],
  };

  assert.throws(
    () => selectCanaries(catalog, { capability: "CAPA-99" }),
    (error: unknown) => {
      assert.ok(error instanceof CanarySelectionError);
      assert.equal(error.code, CANARY_SELECTION_EMPTY);
      assert.match(error.message, /capability=CAPA-99/u);
      assert.match(error.message, /Declared canary ids: CLAUDE_ONLY/u);
      assert.match(error.message, /Declared capabilities: CAPA-02/u);
      return true;
    },
  );
});

test("an unfiltered empty catalog remains a valid zero-work sweep", async () => {
  const announced: string[] = [];
  const sweep = await runCanarySweep({
    catalog: { schemaVersion: 1, canaries: [] },
    announce: (line) => announced.push(line),
    run: async () => {
      throw new Error("an empty unfiltered sweep must not run a canary");
    },
  });

  assert.deepEqual(sweep.selections, []);
  assert.deepEqual(sweep.results, []);
  assert.equal(announced.length, 1, "the zero-work sweep still reports its zero cost honestly");
});

test("an explicit empty selection refuses before announcements or run callbacks", async () => {
  const reached: string[] = [];
  const catalog: CanaryCatalog = {
    schemaVersion: 1,
    canaries: [declaration({ id: "CLAUDE_ONLY", harnesses: ["claude"] })],
  };

  await assert.rejects(
    runCanarySweep({
      catalog,
      harness: "codex",
      announce: () => reached.push("announce"),
      run: async () => {
        reached.push("run");
        return blockedCanaryResult("CLAUDE_ONLY", "claude");
      },
      runHandoff: async () => {
        reached.push("runHandoff");
        throw new Error("runHandoff must not be reached");
      },
    }),
    (error: unknown) => error instanceof CanarySelectionError && error.code === CANARY_SELECTION_EMPTY,
  );
  assert.deepEqual(reached, []);
});

test("the shipped Codex CAPA-01 filter selects one pair and reaches its runner", async () => {
  const catalog = await shippedCatalog();
  const driven: string[] = [];
  const sweep = await runCanarySweep({
    catalog,
    harness: "codex",
    capability: "CAPA-01",
    announce: () => undefined,
    run: async (selection) => {
      driven.push(`${selection.declaration.id}:${selection.harness}`);
      return blockedCanaryResult(selection.declaration.id, selection.harness);
    },
  });

  assert.equal(sweep.selections.length, 1);
  assert.deepEqual(driven, ["DOCUMENTATION_VERSION_SCOPED:codex"]);
});

test("compiled doctor refuses an undeclared Pi canary before creating managed state", async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-canary-cli-pi-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const stateRoot = join(root, "state-must-not-exist");
  const result = spawnSync(
    process.execPath,
    [cliEntry, "doctor", "--canary", ".", "--harness", "pi", "--no-spend", "--json"],
    {
      cwd: repositoryRoot,
      env: { ...process.env, ALPHA_AOS_STATE_DIR: stateRoot },
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    },
  );

  assert.equal(result.error, undefined, String(result.error));
  assert.notEqual(result.status, 0, "an explicit Pi request with no declaration reported success");
  assert.match(result.stderr, /harness=pi/u);
  assert.match(result.stderr, /Declared harnesses: claude, codex/u);
  assert.equal(existsSync(stateRoot), false, "the refused selection created managed state");
});

test("compiled doctor accounts for the one Codex CAPA-01 no-spend leg without launching it", async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-canary-cli-codex-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const result = spawnSync(
    process.execPath,
    [cliEntry, "doctor", "--canary", ".", "--harness", "codex", "--capability", "CAPA-01", "--no-spend", "--json"],
    {
      cwd: repositoryRoot,
      env: { ...process.env, ALPHA_AOS_STATE_DIR: join(root, "state") },
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    },
  );

  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(result.stdout) as {
    readonly results?: readonly unknown[];
    readonly skipped?: readonly { readonly selection?: { readonly harness?: string; readonly declaration?: { readonly capability?: string } } }[];
    readonly rows?: readonly { readonly axes?: { readonly nativeUse?: string } }[];
  };
  assert.deepEqual(output.results, []);
  assert.equal(output.skipped?.length, 1, "the declared spending leg was not accounted for");
  assert.equal(output.skipped?.[0]?.selection?.harness, "codex");
  assert.equal(output.skipped?.[0]?.selection?.declaration?.capability, "CAPA-01");
  assert.equal(output.rows?.[0]?.axes?.nativeUse, "unverified");
});

test("an explicit-filter CLI refusal exposes no auth, credential, environment, or runtime value", async (context: TestContext) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-canary-cli-redaction-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const sentinel = "canary-filter-secret-58f6e7";
  const privateAuthRoot = join(root, "private-auth-root");
  const stateRoot = join(root, "private-runtime-root");
  const result = spawnSync(
    process.execPath,
    [cliEntry, "doctor", "--canary", ".", "--harness", "pi", "--no-spend", "--json"],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        ALPHA_AOS_STATE_DIR: stateRoot,
        CODEX_HOME: privateAuthRoot,
        EXA_API_KEY: sentinel,
      },
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    },
  );
  const observable = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.equal(observable.includes(sentinel), false);
  assert.equal(observable.includes(privateAuthRoot), false);
  assert.equal(observable.includes(stateRoot), false);
  assert.equal(observable.includes("EXA_API_KEY"), false);
  assert.equal(observable.includes("canary/"), false);
});

test("the doctor branch validates selection before state and version work", async () => {
  const source = await readFile(join(repositoryRoot, "src", "cli.ts"), "utf8");
  const start = source.indexOf('if (hasFlag(args, "--canary"))');
  const end = source.indexOf("\n    const inventory = collectInventory", start);
  const branch = source.slice(start, end);
  const selection = branch.indexOf("selectCanaries(");

  assert.notEqual(selection, -1, "the CLI does not validate the declared selection at its boundary");
  assert.equal(selection < branch.indexOf("userStateRoot()"), true, "state-root resolution happens before selection refusal");
  assert.equal(selection < branch.indexOf("probedHarnessVersions()"), true, "harness probing happens before selection refusal");
});

test("every declared prompt names none of its expected tools, no pinned server id and no locked skill id", async () => {
  const catalog = await shippedCatalog();
  const vocabulary = await lockedVocabulary();
  assert.equal(vocabulary.length >= 20, true, "the locked vocabulary is suspiciously small; the check below would be weak");

  for (const canary of catalog.canaries) {
    const forbidden = [...selfNamedTerms(canary), ...vocabulary];
    const hints = findPromptHints(canary.prompt, forbidden);
    assert.deepEqual(
      hints,
      [],
      `${canary.id}'s prompt names ${hints.join(", ")}. A prompt that has to hint at what it should elicit is a ` +
        "finding about discovery, not a prompt to reword until it passes.",
    );
  }
});

test("prompt hygiene compares token sequences, so an ordinary word carrying a server id is not a hint", () => {
  // Negative control: without this, the rule could be satisfied by a check so
  // strict that no ordinary English prompt survives it, or so loose that
  // `web search exa` slips through.
  assert.equal(promptNamesTerm("what does the current API look like on that exact version", "exa"), false);
  assert.equal(promptNamesTerm("give me a hexagonal architecture example", "exa"), false);
  assert.equal(promptNamesTerm("please use exa for this", "exa"), true);
  assert.equal(promptNamesTerm("call web_search_exa first", "web_search_exa"), true);
  assert.equal(promptNamesTerm("run a web search exa call", "web_search_exa"), true);
  assert.equal(promptNamesTerm("do some deep research on this", "deep-research"), true);
  assert.equal(promptNamesTerm("research this deeply", "deep-research"), false);
  assert.equal(promptNamesTerm("check the documentation", "documentation-lookup"), false);
});

test("loadCanaryCatalog refuses a catalog carrying an unknown property", async (context: TestContext) => {
  const root = await canaryFixture(
    context,
    VALID_CANARY.replace("    readOnly: true\n", "    readOnly: true\n    retries: 3\n"),
  );
  const error = await rejection(async () => loadCanaryCatalog(root));
  assert.equal(
    error.issues.some((issue) => issue.code === "schema.unknown-core-field"),
    true,
    `expected a closed-world refusal, got ${error.issues.map((issue) => issue.code).join(", ")}`,
  );
});

test("loadCanaryCatalog refuses a prompt reworded to name the tool it should elicit", async (context: TestContext) => {
  const root = await canaryFixture(
    context,
    `schemaVersion: 1
canaries:
  - id: FIXTURE_HINTING
    capability: CAPA-01
    prompt: Use resolve-library-id and then query-docs to answer this.
    expectTools:
      - resolve-library-id
      - query-docs
    forbidTools: []
    maxDistinctServers: 1
    harnesses:
      - claude
    readOnly: true
`,
  );
  const error = await rejection(async () => loadCanaryCatalog(root));
  assert.equal(
    error.issues.some((issue) => issue.code === "canary.prompt-names-expected-tool"),
    true,
    `expected the hinting refusal, got ${error.issues.map((issue) => issue.code).join(", ")}`,
  );
});

test("loadCanaryCatalog refuses a duplicated canary id rather than silently keeping one", async (context: TestContext) => {
  // Two DIFFERENT entries sharing one id. A byte-identical pair is already
  // refused by the schema's uniqueItems, so it would prove nothing here: the
  // hazard is one id with two prompts, where last-wins would turn an ambiguous
  // catalog into a confident answer.
  const root = await canaryFixture(
    context,
    `${VALID_CANARY}  - id: FIXTURE_LOOKUP
    capability: CAPA-02
    prompt: How large is the default heap for a Node process?
    expectTools: []
    forbidTools: []
    maxDistinctServers: 1
    harnesses:
      - claude
    readOnly: true
`,
  );
  const error = await rejection(async () => loadCanaryCatalog(root));
  assert.equal(
    error.issues.some((issue) => issue.code === "canary.duplicate-id"),
    true,
    `expected the duplicate-id refusal, got ${error.issues.map((issue) => issue.code).join(", ")}`,
  );
});

test("the canary catalog schema is a closed world at every object level", async () => {
  const schema = JSON.parse(
    await readFile(join(repositoryRoot, "schemas", "canary-catalog.schema.json"), "utf8"),
  ) as Record<string, unknown>;

  const open: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}/${index}`));
      return;
    }
    const record = node as Record<string, unknown>;
    if (record.type === "object" && record.additionalProperties !== false) open.push(path === "" ? "/" : path);
    for (const [key, value] of Object.entries(record)) walk(value, `${path}/${key}`);
  };
  walk(schema, "");

  assert.deepEqual(open, [], `these object nodes are open worlds: ${open.join(", ")}`);

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const canaries = properties.canaries as Record<string, unknown>;
  const item = canaries.items as Record<string, unknown>;
  const fields = item.properties as Record<string, Record<string, unknown>>;
  const prompt = String((fields.prompt as Record<string, unknown>).description).toLowerCase();
  assert.equal(
    prompt.includes("must not name"),
    true,
    "the prompt field's description does not record the never-name rule, so the constraint does not travel with the contract",
  );
});

test("a declaration's expectation lists carry the tool names so the prompt does not have to", async () => {
  const catalog = await shippedCatalog();
  const named = catalog.canaries.flatMap((canary: CanaryDeclaration) => selfNamedTerms(canary));
  assert.equal(
    named.length >= 3,
    true,
    "no canary declares any tool expectation, so the separation between expectation and prompt proves nothing",
  );
});

// ---------------------------------------------------------------------------
// Task 2 — readiness probes, and the blocked-versus-unverified split
// ---------------------------------------------------------------------------

/** A canary declaration built in memory, so a behaviour is not coupled to the shipped catalog. */
function declaration(overrides: Partial<CanaryDeclaration> = {}): CanaryDeclaration {
  return {
    id: "FIXTURE_CANARY",
    capability: "CAPA-02",
    prompt: "What port does a Vite dev server listen on by default?",
    expectTools: [],
    forbidTools: [],
    maxDistinctServers: 1,
    harnesses: ["claude"],
    readOnly: true,
    ...overrides,
  } as CanaryDeclaration;
}

/** The measured shape of `pi auth check --provider google --json` on an unconfigured provider. */
const PI_NOT_READY = '{"status":"not_ready","provider":"google","reason":"credentials_not_configured"}\n';
/** The measured shape when the target IS configured — this host's silent free-model fallback. */
const PI_READY_NVIDIA = '{"status":"ready","provider":"nvidia","authType":"api_key"}\n';

/**
 * The measured shape of `claude mcp list` on this host, 2026-09-10.
 *
 * Three states appear, not two: the phase's research recorded a failed server,
 * and this host additionally produced `! Needs authentication`. Both the
 * connected and the failed lines carry an absolute launch command, which is
 * exactly what the parser must NOT retain.
 */
const CLAUDE_MCP_LIST = [
  "Checking MCP server health…",
  "",
  "claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication",
  "context7: C:\\Program Files\\nodejs\\node.exe C:\\npx-cli.js --yes @upstash/context7-mcp@4.0.4 - ✔ Connected",
  "exa: C:\\Program Files\\nodejs\\node.exe C:\\npx-cli.js --yes exa-mcp-server@3.4.1 - ✔ Connected",
  "firecrawl: C:\\Program Files\\nodejs\\node.exe D:\\dev\\alpha-AOS\\dist\\src\\cli.js mcp-proxy firecrawl - ✘ Failed to connect — CONNECTION_CLOSED: Connection closed",
  "",
].join("\n");

function commandResult(stdout: string): ReadinessCommandResult {
  return { ran: true, reason: null, exitCode: 0, stdout };
}

function notRun(reason: string): ReadinessCommandResult {
  return { ran: false, reason, exitCode: null, stdout: "" };
}

interface RunnerOverrides {
  readonly resolved?: string | null;
  readonly provider?: ReadinessCommandResult;
  readonly connections?: ReadinessCommandResult;
}

function runner(overrides: RunnerOverrides = {}): ReadinessRunner {
  return {
    resolveHarness: () => (overrides.resolved === undefined ? "/usr/bin/harness" : overrides.resolved),
    providerReadiness: async () => overrides.provider ?? notRun("no provider readiness command was supplied"),
    connectionListing: async () => overrides.connections ?? notRun("no connection listing was supplied"),
  };
}

test("an unset required variable is blocked with a code, the variable name and a next action", async () => {
  const canary = declaration({ requiresEnvironment: ["EXA_API_KEY"] });
  const report = await probeReadiness({
    harness: "claude",
    canary,
    environment: {},
    runner: runner(),
  });

  assert.equal(report.ready, false, "an unset required variable must not read as ready");
  const reason = report.blockedReasons.find((entry) => entry.code === "MISSING_CREDENTIAL");
  assert.ok(reason, `expected a MISSING_CREDENTIAL reason, got ${report.blockedReasons.map((e) => e.code).join(", ")}`);
  assert.equal(reason.variable, "EXA_API_KEY", "the blocked reason must name the variable");
  assert.equal(reason.nextAction.length > 20, true, "the next action must be something a reader can act on");
  assert.equal(reason.nextAction.includes("EXA_API_KEY"), true, "the next action must name the variable it is about");
});

test("a set credential value never reaches the serialized readiness report", async () => {
  const sentinel = "sk-canary-sentinel-4a91f0c2e7b3";
  const canary = declaration({ requiresEnvironment: ["EXA_API_KEY", "FIRECRAWL_API_KEY"] });
  const report = await probeReadiness({
    harness: "claude",
    canary,
    environment: { EXA_API_KEY: sentinel },
    runner: runner(),
  });

  const serialized = JSON.stringify(report);
  assert.equal(
    serialized.includes(sentinel),
    false,
    "a credential VALUE reached the serialized readiness report; the shape is supposed to make that unrepresentable",
  );
  assert.equal(serialized.includes("EXA_API_KEY"), true, "the report must still name the variables it read");
  assert.equal(
    report.blockedReasons.some((entry) => entry.variable === "FIRECRAWL_API_KEY"),
    true,
    "the unset second variable was not reported",
  );
  assert.equal(
    report.blockedReasons.some((entry) => entry.variable === "EXA_API_KEY"),
    false,
    "the variable that IS set was reported as missing",
  );
});

test("with every requirement satisfied the readiness report is ready and the canary may run", async () => {
  const canary = declaration({ requiresEnvironment: ["EXA_API_KEY"], requiresMcpServers: ["exa", "context7"] });
  const report = await probeReadiness({
    harness: "claude",
    canary,
    environment: { EXA_API_KEY: "present" },
    runner: runner({ connections: commandResult(CLAUDE_MCP_LIST) }),
  });

  assert.deepEqual(
    report.blockedReasons.map((entry) => entry.code),
    [],
    "a fully satisfied requirement set produced a blocked reason",
  );
  assert.equal(report.ready, true);
  assert.equal(disposeCanary(report, null).outcome, "ready");
});

test("an unconfigured provider is blocked with the provider named, from the harness's own readiness output", async () => {
  const report = await probeReadiness({
    harness: "pi",
    canary: declaration({ harnesses: ["pi"] }),
    environment: {},
    runner: runner({ provider: commandResult(PI_NOT_READY) }),
  });

  const reason = report.blockedReasons.find((entry) => entry.code === "PROVIDER_NOT_CONFIGURED");
  assert.ok(reason, `expected PROVIDER_NOT_CONFIGURED, got ${report.blockedReasons.map((e) => e.code).join(", ")}`);
  assert.equal(reason.variable, "google", "the blocked reason must name the provider the harness reported on");
  assert.equal(report.ready, false);
  // Derived from a readiness command, never from a failed run's output.
  assert.equal(parsePiAuthCheck(PI_NOT_READY)?.status, "not-ready");
  assert.equal(parsePiAuthCheck(PI_NOT_READY)?.reason, "credentials_not_configured");
});

test("a failed MCP server is blocked naming the server, and a registered-but-pending one is not", async () => {
  const failed = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresMcpServers: ["firecrawl"] }),
    environment: {},
    runner: runner({ connections: commandResult(CLAUDE_MCP_LIST) }),
  });
  const reason = failed.blockedReasons.find((entry) => entry.code === "MCP_SERVER_NOT_CONNECTED");
  assert.ok(reason, `expected MCP_SERVER_NOT_CONNECTED, got ${failed.blockedReasons.map((e) => e.code).join(", ")}`);
  assert.equal(reason.variable, "firecrawl");

  // Pitfall 5: at the init event every server is legitimately pending with zero
  // tools. Evaluating a connection rule there would report a false failure, so
  // a pending entry is a registration fact and never a fault.
  const pending = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresMcpServers: ["context7"] }),
    environment: {},
    runner: runner(),
    registeredServers: [{ server: "context7", state: "pending" }],
  });
  assert.deepEqual(
    pending.blockedReasons.map((entry) => entry.code),
    [],
    "a registered-but-pending server produced a blocked reason",
  );
  assert.equal(
    pending.notProbed.some((entry) => entry.probe.includes("connection")),
    true,
    "the connection listing did not run, and that must be recorded rather than silently treated as a pass",
  );

  // A server nobody registered is a different, also-actionable cause.
  const missing = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresMcpServers: ["nowhere"] }),
    environment: {},
    runner: runner({ connections: commandResult(CLAUDE_MCP_LIST) }),
  });
  assert.equal(
    missing.blockedReasons.some((entry) => entry.code === "MCP_SERVER_NOT_REGISTERED"),
    true,
  );
});

test("the connection listing parser keeps server names and states and retains no command line", () => {
  const parsed = parseClaudeMcpList(CLAUDE_MCP_LIST);
  const byName = new Map(parsed.map((entry) => [entry.server, entry.state]));
  assert.equal(byName.get("context7"), "connected");
  assert.equal(byName.get("exa"), "connected");
  assert.equal(byName.get("firecrawl"), "failed");
  assert.equal(byName.get("claude.ai Notion"), "needs-auth");
  const serialized = JSON.stringify(parsed);
  for (const leak of ["npx-cli.js", "Program Files", "cli.js", "mcp-proxy", "https://"]) {
    assert.equal(serialized.includes(leak), false, `the parser retained '${leak}' from the launch command line`);
  }
});

test("an unresolvable harness is blocked, and the readiness report says which command was looked for", async () => {
  const report = await probeReadiness({
    harness: "codex",
    canary: declaration({ harnesses: ["codex"] }),
    environment: {},
    runner: runner({ resolved: null }),
  });
  const reason = report.blockedReasons.find((entry) => entry.code === "HARNESS_NOT_INSTALLED");
  assert.ok(reason, `expected HARNESS_NOT_INSTALLED, got ${report.blockedReasons.map((e) => e.code).join(", ")}`);
  assert.equal(reason.variable, "codex");
});

test("the readiness report records the provider and model the harness would actually run on", async () => {
  const model = "nvidia/nemotron-3-super-120b-a12b";
  const report = await probeReadiness({
    harness: "pi",
    canary: declaration({ harnesses: ["pi"] }),
    environment: {},
    model,
    runner: runner({ provider: commandResult(PI_READY_NVIDIA) }),
  });

  assert.equal(report.identity.provider, "nvidia", "the recorded provider is not the one the harness reported");
  assert.equal(report.identity.model, model, "the recorded model is not the one the answer was about");
  assert.equal(report.identity.source.length > 0, true, "an identity with no recorded source is not interpretable");
  assert.equal(report.ready, true, "a configured fallback provider is ready; it is the anonymity that was the problem");

  // A harness that reports no identity says so, rather than reporting a guess.
  const silent = await probeReadiness({
    harness: "claude",
    canary: declaration(),
    environment: {},
    runner: runner(),
  });
  assert.equal(silent.identity.provider, null);
  assert.equal(silent.identity.model, null);
  assert.equal(
    silent.notProbed.some((entry) => entry.probe.includes("provider")),
    true,
    "a harness with no free provider readiness command must record that, not leave the null unexplained",
  );
});

test("a failure no probe named stays unverified, and no cause yields both blocked and unverified", async () => {
  const ready = await probeReadiness({
    harness: "claude",
    canary: declaration(),
    environment: {},
    runner: runner(),
  });
  const nameless = disposeCanary(ready, "the harness exited 1 with no output any probe accounts for");
  assert.equal(nameless.outcome, "unverified");
  assert.deepEqual(nameless.blockedReasons, [], "an unverified disposition must carry no blocked reason");
  assert.ok(nameless.unverifiedReason);

  const blockedReport = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresEnvironment: ["EXA_API_KEY"] }),
    environment: {},
    runner: runner(),
  });

  // The same cause, put through the same classifier with and without a
  // trailing failure: it is blocked either way, and never also unverified.
  for (const failure of [null, "the run then failed for some other reason"]) {
    const disposition = disposeCanary(blockedReport, failure);
    assert.equal(disposition.outcome, "blocked", "a named cause must never degrade to unverified");
    assert.equal(disposition.unverifiedReason, null, "a blocked disposition must carry no unverified reason");
    assert.equal(disposition.blockedReasons.length > 0, true);
  }

  // Exhaustive over the classifier's inputs: the three outcomes partition, so
  // blocked and unverified are mutually exclusive by construction.
  for (const report of [ready, blockedReport]) {
    for (const failure of [null, "some failure"]) {
      const disposition = disposeCanary(report, failure);
      const isBlocked = disposition.outcome === "blocked";
      const isUnverified = disposition.outcome === "unverified";
      assert.equal(isBlocked && isUnverified, false);
      assert.equal(isBlocked, disposition.blockedReasons.length > 0);
      assert.equal(isUnverified, disposition.unverifiedReason !== null);
    }
  }
});

test("BLOCKED_CODES is a frozen table of upper-snake codes covering the four named causes", () => {
  assert.equal(Object.isFrozen(BLOCKED_CODES), true, "the code table is mutable");
  for (const code of [
    "MISSING_CREDENTIAL",
    "PROVIDER_NOT_CONFIGURED",
    "MCP_SERVER_NOT_CONNECTED",
    "HARNESS_NOT_INSTALLED",
  ]) {
    assert.equal(Object.hasOwn(BLOCKED_CODES, code), true, `${code} is not declared`);
  }
  for (const [code, wording] of Object.entries(BLOCKED_CODES)) {
    assert.match(code, /^[A-Z][A-Z0-9_]*$/u, `${code} is not an upper-snake identifier`);
    assert.equal(wording.length > 0, true, `${code} has no human wording`);
  }
});

test("a BlockedReason has exactly code, variable and nextAction, and no field able to hold a value", async () => {
  const report = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresEnvironment: ["EXA_API_KEY"] }),
    environment: {},
    runner: runner(),
  });
  const reason = report.blockedReasons[0];
  assert.ok(reason, "no blocked reason was produced, so the shape below proves nothing");
  assert.deepEqual(Object.keys(reason).sort(), ["code", "nextAction", "variable"]);
});

test("no readiness argument vector carries a flag whose documented effect is to emit a secret", async () => {
  // `pi auth check` really does have a --credentials flag that puts the
  // credential into the JSON this module parses, and a sibling verb that
  // prints an API key outright. The table must never reach for either.
  const source = await readFile(join(repositoryRoot, "src", "core", "canary.ts"), "utf8");
  const start = source.indexOf("export const READINESS_DEFINITIONS");
  assert.notEqual(start, -1, "READINESS_DEFINITIONS is no longer declared as an exported const");
  const end = source.indexOf("\n};", start);
  assert.notEqual(end, -1, "the READINESS_DEFINITIONS table is not terminated where expected");
  const region = source.slice(start, end);
  assert.equal(region.length >= 200, true, "the table region could not be extracted; the control below would be vacuous");

  for (const flag of ["--credentials", "print-api-key", "print-bearer-token"]) {
    assert.equal(region.includes(flag), false, `a readiness argument vector reaches for ${flag}`);
  }
  // Positive control: the slice really does contain the vectors it is judging.
  assert.equal(region.includes('"auth", "check"'), true, "the extracted region contains no argument vector at all");
});

// ---------------------------------------------------------------------------
// Task 3 — the canary is not a preview, and says so at the boundary
// ---------------------------------------------------------------------------

test("the preview-context guard refuses with a stable code and names the command to run instead", () => {
  assert.throws(
    () => assertCanaryContext("preview", "probeReadiness"),
    (error: unknown) => {
      assert.ok(error instanceof CanaryContextError, `expected a CanaryContextError, got ${String(error)}`);
      assert.equal(error.code, CANARY_IN_PREVIEW_CONTEXT, "the refusal carries no stable code");
      assert.equal(error.operation, "probeReadiness", "the refusal does not name the operation that was refused");
      assert.equal(
        error.message.includes("alpha-aos doctor --canary"),
        true,
        "the refusal does not name the command to run instead, which is what the existing verb refusals do",
      );
      return true;
    },
  );

  // Positive control: the guard is a refusal for previews only, not a blanket one.
  assert.doesNotThrow(() => assertCanaryContext("canary", "probeReadiness"));
});

test("a canary entry point reached from a preview context is refused before it launches anything", async () => {
  let launched = false;
  const watchful: ReadinessRunner = {
    resolveHarness: () => {
      launched = true;
      return "/usr/bin/harness";
    },
    providerReadiness: async () => {
      launched = true;
      return notRun("should never be reached");
    },
    connectionListing: async () => {
      launched = true;
      return notRun("should never be reached");
    },
  };

  await assert.rejects(
    async () =>
      probeReadiness({
        harness: "claude",
        canary: declaration({ requiresEnvironment: ["EXA_API_KEY"] }),
        environment: {},
        context: "preview",
        runner: watchful,
      }),
    (error: unknown) => error instanceof CanaryContextError && error.code === CANARY_IN_PREVIEW_CONTEXT,
  );
  assert.equal(launched, false, "the refusal came after the probe had already reached for a process");
});

test("the preview module does not import the canary module, at the source level", async () => {
  // A refusal can be bypassed by a caller that never calls it. This assertion
  // is the other half: the preview path cannot reach a canary even indirectly,
  // because it does not import the module that holds one.
  const source = await readFile(join(repositoryRoot, "src", "core", "project-plan.ts"), "utf8");
  const imports = source
    .split(/\r?\n/u)
    .filter((line) => /^\s*(?:import|export)\b/u.test(line) && line.includes("from "));
  assert.equal(imports.length >= 5, true, "no import lines were extracted, so the control below would be vacuous");

  for (const line of imports) {
    assert.equal(
      /["'][^"']*canary\.js["']/u.test(line),
      false,
      `src/core/project-plan.ts imports the canary module: ${line.trim()}`,
    );
  }
  // A dynamic import would evade the line filter above, so it is named too.
  assert.equal(
    /import\s*\(\s*["'][^"']*canary\.js["']/u.test(source),
    false,
    "src/core/project-plan.ts reaches the canary module through a dynamic import",
  );
  assert.equal(source.includes("canary.js"), false, "src/core/project-plan.ts names the canary module at all");
});

test("every canary declaration exposes whether a run would spend a model turn", async () => {
  const catalog = await shippedCatalog();
  const costs = catalogCosts(catalog);
  assert.equal(costs.length, catalog.canaries.length, "not every declared canary has a cost");

  for (const entry of costs) {
    assert.equal(typeof entry.costsModelTurn, "boolean", `${entry.id} has no cost answer`);
    assert.equal(entry.perHarness.length >= 1, true, `${entry.id} reports a cost for no harness`);
  }

  // The shipped canaries are declared for the harness whose oracle DOES spend a
  // turn, so a caller listing a sweep sees a real number rather than a zero.
  assert.equal(
    costs.every((entry) => entry.costsModelTurn),
    true,
    "a declared canary reports that it spends nothing; the whole point of the flag is to be true where it is true",
  );

  // Read from the oracle table rather than restated, so the two cannot drift.
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["claude"] })), [{ harness: "claude", costsModelTurn: true }]);
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["codex"] })), [{ harness: "codex", costsModelTurn: true }]);
  // A harness with no oracle definition reports an underivable cost, and the
  // fail-closed roll-up treats an unknown cost as spending.
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["hermes"] })), [{ harness: "hermes", costsModelTurn: null }]);
  assert.equal(canaryCostsModelTurn(declaration({ harnesses: ["hermes"] })), true);
  assert.equal(canaryCostsModelTurn(declaration({ harnesses: ["codex"] })), true);
});

test("Codex discovery remains free while invocation uses the costed ephemeral exec surface", () => {
  const discovery = ORACLE_DEFINITIONS.codex;
  assert.ok(discovery);
  assert.deepEqual([...discovery.args.slice(0, 2)], ["debug", "prompt-input"]);
  assert.equal(discovery.costsModelTurn, false);

  const prompt = "Explain the exact version-sensitive API without naming a tool.";
  const invocation = canaryPromptArgs("codex", prompt);
  assert.ok(invocation, "Codex has no measured invocation vector");
  assert.equal(invocation.includes("debug"), false, "the free discovery command was reused as invocation");
  assert.equal(invocation.includes("prompt-input"), false, "the free discovery command was reused as invocation");
  assert.deepEqual(invocation.slice(0, 2), ["exec", "--json"]);
  for (const flag of ["--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox"]) {
    assert.equal(invocation.includes(flag), true, `Codex invocation is missing ${flag}`);
  }
  assert.equal(invocation[invocation.indexOf("--sandbox") + 1], "read-only");
  const instruction = invocation.indexOf(`developer_instructions=${JSON.stringify(CODEX_CANARY_DEVELOPER_INSTRUCTIONS)}`);
  assert.notEqual(instruction, -1, "the isolated Codex turn has no deterministic Context7 routing instruction");
  assert.equal(invocation[instruction - 1], "-c");
  assert.equal(invocation.at(-1), prompt, "the ordinary prompt was not substituted into the invocation vector");
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["codex"] })), [
    { harness: "codex", costsModelTurn: true },
  ]);
  assert.equal(canaryCostsModelTurn(declaration({ harnesses: ["codex"] })), true);
});

// ---------------------------------------------------------------------------
// Plan 03-06 Task 1 — the canary runtime
// ---------------------------------------------------------------------------

/** A temp project plus a temp managed state root. Nothing here touches a real root. */
async function runtimeFixture(context: TestContext): Promise<{ project: string; state: string; lock: StackLock }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-canary-runtime-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const project = join(root, "project");
  await mkdir(project, { recursive: true });
  return { project, state: join(root, "state"), lock: await loadLock(packageRoot()) };
}

/**
 * A launch spec with a resolvable-looking executable.
 *
 * The real builder resolves the harness on PATH, and no host can be relied upon
 * to HAVE one — so a run's own behaviour is proven against a supplied spec while
 * the builder's canary variant is asserted directly in `test/isolation.test.ts`.
 */
function stubLaunchSpec(runtime: CanaryRuntime, overrides: Partial<IsolationLaunchSpec> = {}): IsolationLaunchSpec {
  return {
    projectId: runtime.projectId,
    projectRoot: runtime.projectRoot,
    harness: runtime.harness,
    mode: "project-only",
    runtimeRoot: join(runtime.root, runtime.harness),
    executable: join(runtime.root, "harness-that-is-never-launched"),
    args: ["--mcp-config", runtime.mcpConfigPath, "--strict-mcp-config"],
    env: { CLAUDE_CONFIG_DIR: join(runtime.root, runtime.harness) },
    guarantees: [],
    warnings: [],
    blockedReasons: [],
    ...overrides,
  };
}

/** The rendered server map, whatever the harness spells its key. */
function renderedServers(text: string): Record<string, { command: string; args: string[] }> {
  const document = JSON.parse(text) as { mcpServers?: Record<string, { command: string; args: string[] }> };
  return document.mcpServers ?? {};
}

function codexRuntimeOverrides(runtime: CanaryRuntime): readonly string[] {
  return (runtime as CanaryRuntime & { readonly mcpConfigOverrides?: readonly string[] }).mcpConfigOverrides ?? [];
}

function codexStubLaunchSpec(runtime: CanaryRuntime, authRoot: string): IsolationLaunchSpec {
  return {
    projectId: runtime.projectId,
    projectRoot: runtime.projectRoot,
    harness: "codex",
    mode: "project-only",
    runtimeRoot: join(runtime.root, "codex"),
    executable: join(runtime.root, "codex-that-is-never-launched"),
    args: ["--ignore-user-config", "--ignore-rules", ...codexRuntimeOverrides(runtime)],
    env: { CODEX_HOME: authRoot },
    guarantees: [],
    warnings: [],
    blockedReasons: [],
  };
}

test("the canary runtime's MCP configuration points every server at the alpha-AOS observation front", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["context7", "exa", "firecrawl"],
    stateRoot: state,
    lock,
    environment: {},
  });

  const servers = renderedServers(await readFile(runtime.mcpConfigPath, "utf8"));
  assert.deepEqual(
    Object.keys(servers).sort(),
    ["context7", "exa", "firecrawl"],
    "the runtime config does not carry every declared server under the harness's own key name",
  );
  for (const [id, entry] of Object.entries(servers)) {
    assert.equal(entry.command, process.execPath, `${id} is not launched by this Node runtime`);
    assert.equal(entry.args.includes("mcp-proxy"), true, `${id} is not fronted by the alpha-AOS proxy`);
    assert.equal(entry.args.includes(id), true, `${id}'s front was not told which server it fronts`);
    assert.equal(entry.args.includes("--observe"), true, `${id} is fronted but not observed`);
    assert.equal(
      entry.args.includes(runtime.observationsPath),
      true,
      `${id}'s front does not record into this runtime's own observation file`,
    );
    // The upstream package is reached THROUGH the front, never beside it.
    assert.equal(
      entry.args.some((argument) => argument.includes("npx") || argument.includes("@")),
      false,
      `${id} still names an upstream package directly, so a call could bypass the observation front`,
    );
  }

  // D-02: the front exists in the canary runtime and nowhere else. The everyday
  // rendering fronts only the server alpha-AOS holds a tool policy for.
  const everyday = renderedServers(renderMcpConfig("claude", "", lock, ["context7", "exa", "firecrawl"]));
  assert.equal(
    (everyday.context7?.args ?? []).includes("--observe"),
    false,
    "the everyday configuration carries an observing front; the observation seam has leaked out of the canary runtime",
  );
});

test("a credential value never reaches the rendered canary runtime configuration, and its name does", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const sentinel = "sk-canary-runtime-sentinel-93b1fd7c";
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: { EXA_API_KEY: sentinel },
  });

  const text = await readFile(runtime.mcpConfigPath, "utf8");
  assert.equal(text.includes(sentinel), false, "a credential VALUE reached the rendered canary runtime configuration");
  // Asserted in the same document, so the absence above is a claim with teeth
  // rather than a file that happens to mention neither.
  assert.equal(
    text.includes("EXA_API_KEY"),
    true,
    "the credential NAME is absent too, so the sentinel assertion above proves nothing",
  );
});

test("a second canary runtime does not inherit the first run's observation records", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const base = { projectRoot: project, harness: "claude" as const, servers: ["exa" as const], stateRoot: state, lock, environment: {} };

  const first = await createCanaryRuntime(base);
  createFileObservationSink(first.observationsPath).record({
    server: "exa",
    tool: "web_search_exa",
    at: new Date().toISOString(),
    upstreamVersion: "3.4.1",
    outcome: "ok",
  });
  assert.equal((await createCanaryObservationSink(first).read()).length, 1, "the first run's record was not written");

  const second = await createCanaryRuntime(base);
  assert.notEqual(second.observationsPath, first.observationsPath, "two runs named the same observation file");
  assert.deepEqual(
    await createCanaryObservationSink(second).read(),
    [],
    "a second run read the first run's observation records, so its verdict is computed from another run's evidence",
  );
});

test("the invocation axis is computed from observation records only, never from what the harness said", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa", "firecrawl"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const canary = declaration({ expectTools: ["web_search_exa"], maxDistinctServers: 2 });

  // The harness insists, at length, that it used the tool. The observation
  // front recorded nothing, and the observation front is the oracle (D-01).
  const claimed =
    '{"type":"assistant","message":"I called web_search_exa and then firecrawl_scrape to gather the sources."}';
  const result = await runCanary({
    declaration: canary,
    harness: "claude",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async () => ({
      ran: true,
      reason: null,
      exitCode: 0,
      excerpt: { excerpt: claimed, capped: false, totalBytes: claimed.length, sha256: "0".repeat(64) },
    }),
  });

  assert.equal(result.launched, true, "the run did not reach the launch, so this proves nothing about the axis");
  assert.notEqual(result.nativeUse, "invoked", "a harness transcript claiming a tool call moved the invocation axis");
  assert.equal(result.nativeUse, "unverified");
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.verdict.missing, ["web_search_exa"]);
  // The excerpt is retained for diagnosis, and naming the tool changed nothing.
  assert.equal(result.excerpt?.excerpt.includes("web_search_exa"), true);

  // The same declaration WITH a record moves the axis, so the assertion above
  // is about the source of the evidence rather than about an axis that never
  // moves. A runtime is single-use, so the control takes a fresh one.
  const second = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa", "firecrawl"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const observed = await runCanary({
    declaration: canary,
    harness: "claude",
    projectRoot: project,
    runtime: second,
    sink: createCanaryObservationSink(second),
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(second),
    launcher: async () => {
      createFileObservationSink(second.observationsPath).record({
        server: "exa",
        tool: "web_search_exa",
        at: new Date().toISOString(),
        upstreamVersion: "3.4.1",
        outcome: "ok",
      });
      return { ran: true, reason: null, exitCode: 0, excerpt: null };
    },
  });
  assert.equal(observed.nativeUse, "invoked", "a recorded call did not move the axis, so the negative above is vacuous");

  // A spent runtime can be torn down, and tearing it down takes its records
  // with it.
  await disposeCanaryRuntime(second);
  assert.equal(existsSync(second.root), false, "a disposed runtime is still on disk");
});

test("a declared argument pattern is reported unchecked, never satisfied, because the record has no arguments", async () => {
  const canary = declaration({
    expectTools: ["query-docs"],
    expectArgumentPatterns: [
      { tool: "query-docs", argument: "libraryId", pattern: "^/[^/]+/[^/]+/[^/]+$", why: "version-scoped" },
    ],
  });
  const verdict = decideInvocation(canary, [
    { server: "context7", tool: "query-docs", at: new Date().toISOString(), upstreamVersion: "4.0.4", outcome: "ok" },
  ]);

  assert.deepEqual(verdict.uncheckedArgumentPatterns, ["query-docs.libraryId"]);
  assert.equal(
    verdict.reasons.some((reason) => reason.includes("has no argument field")),
    true,
    "the verdict does not say WHY the declared argument pattern was not checked",
  );
  // The record shape is the mitigation: there is no argument field to read, and
  // a pattern silently counted as met is the shape of a proof that proves nothing.
  assert.equal(
    Object.hasOwn(
      { server: "context7", tool: "query-docs", at: "", upstreamVersion: "", outcome: "ok" },
      "arguments",
    ),
    false,
  );
});

// ---------------------------------------------------------------------------
// Plan 03-06 Task 2 — the user's real configuration survives a canary run
// ---------------------------------------------------------------------------

/**
 * Every environment name that decides where a harness finds its OWN
 * configuration, pointed at a temporary tree so a run that reached one is
 * observable instead of destructive.
 */
const HARNESS_ROOT_OVERRIDES = [
  "CLAUDE_CONFIG_DIR",
  "CODEX_HOME",
  "ANTIGRAVITY_CONFIG_DIR",
  "PI_CODING_AGENT_DIR",
  "HERMES_HOME",
] as const;

interface RootSnapshot {
  readonly root: string;
  readonly entries: readonly string[];
  readonly hash: string;
}

async function walk(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
    found.push(join(entry.parentPath, entry.name));
  }
  return found.sort();
}

async function snapshotRoot(root: string): Promise<RootSnapshot> {
  const entries = await walk(root);
  const digest = createHash("sha256");
  for (const path of entries) {
    digest.update(path);
    const stats = await stat(path);
    if (stats.isFile()) digest.update(await readFile(path));
  }
  return { root, entries, hash: digest.digest("hex") };
}

/** Points every harness config root at a temp tree, seeds a sentinel, and restores after. */
async function seededHarnessRoots(context: TestContext): Promise<Map<string, string>> {
  const base = await mkdtemp(join(tmpdir(), "alpha-aos-harness-roots-"));
  const previous = new Map<string, string | undefined>();
  const roots = new Map<string, string>();
  for (const name of HARNESS_ROOT_OVERRIDES) {
    const root = join(base, name.toLowerCase());
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "sentinel.txt"), `${name} was here before the canary ran\n`, "utf8");
    previous.set(name, process.env[name]);
    process.env[name] = root;
    roots.set(name, root);
  }
  context.after(async () => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(base, { recursive: true, force: true });
  });
  return roots;
}

test("a canary run leaves every harness config root byte-identical and gains no entry", async (context) => {
  const roots = await seededHarnessRoots(context);
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const before = await Promise.all([...roots.values()].map(snapshotRoot));

  // A launcher that behaves like a harness: it writes into the configuration
  // root its own environment names. If the runtime ever leaked a real root into
  // that environment, this write lands in it and the assertions below fail.
  let wrote: string | null = null;
  await runCanary({
    declaration: declaration(),
    harness: "claude",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async (launch) => {
      const configRoot = launch.environment.CLAUDE_CONFIG_DIR;
      assert.ok(configRoot, "the launch named no claude configuration root at all");
      await mkdir(configRoot, { recursive: true });
      wrote = join(configRoot, "written-by-the-harness.json");
      await writeFile(wrote, "{}\n", "utf8");
      return { ran: true, reason: null, exitCode: 0, excerpt: null };
    },
  });

  const after = await Promise.all([...roots.values()].map(snapshotRoot));
  for (const [index, snapshot] of before.entries()) {
    const now = after[index];
    assert.ok(now);
    assert.equal(snapshot.hash, now.hash, `${snapshot.root} changed during a canary run`);
    assert.deepEqual(snapshot.entries, now.entries, `${snapshot.root} gained or lost an entry during a canary run`);
  }
  // The positive control: the write DID happen, and it happened inside the
  // runtime. Without it the assertions above would pass on a run that wrote
  // nothing anywhere, which is not the claim being made.
  const written = wrote as string | null;
  assert.ok(written, "the launcher never wrote anything, so the assertions above prove nothing");
  assert.equal(existsSync(written), true);
  assert.equal(relative(runtime.root, written).startsWith(".."), false, "the harness wrote outside the canary runtime");

  // And the boundary is a refusal rather than a habit: a launch environment
  // naming a configuration root outside the runtime is refused outright.
  assert.throws(
    () => assertCanaryLaunchIsolation({ CLAUDE_CONFIG_DIR: roots.get("CLAUDE_CONFIG_DIR") as string }, runtime),
    (error: unknown) => {
      assert.ok(error instanceof CanaryBoundaryError);
      assert.equal(error.code, CANARY_LAUNCH_ISOLATION_VIOLATION);
      assert.deepEqual(error.names, ["CLAUDE_CONFIG_DIR"]);
      return true;
    },
    "a launch pointing claude at the user's real configuration root was not refused",
  );
});

test("a canary run creates paths only under the managed state root, and only ones it declared", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const before = await walk(state);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });

  await runCanary({
    declaration: declaration(),
    harness: "claude",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async () => ({ ran: true, reason: null, exitCode: 0, excerpt: null }),
  });

  for (const file of runtime.declaredFiles) {
    assert.equal(existsSync(file), true, `${file} was declared and does not exist`);
  }
  const added = (await walk(state)).filter((path) => !before.includes(path));
  assert.equal(added.length > 0, true, "the run created nothing at all, so this assertion proves nothing");
  for (const path of added) {
    assert.equal(
      runtime.declaredRoots.some((root) => !relative(root, path).startsWith("..")),
      true,
      `${path} appeared under the state root and no declared root of the run contains it`,
    );
  }
  // The containment rule is a refusal, not a description of what happened to
  // work: a runtime that would sit outside the state root it named is refused.
  assert.throws(
    () =>
      assertRuntimeContainment({
        root: join(project, "escaped"),
        stateRoot: state,
        declaredFiles: [join(project, "escaped", "mcp.json")],
      }),
    (error: unknown) => {
      assert.ok(error instanceof CanaryBoundaryError);
      assert.equal(error.code, CANARY_RUNTIME_NOT_CONTAINED);
      return true;
    },
    "a runtime outside the managed state root was not refused",
  );
});

test("a canary runtime is single-use, so a second run cannot inherit the first run's records", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const run = async (): Promise<unknown> =>
    runCanary({
      declaration: declaration(),
      harness: "claude",
      projectRoot: project,
      runtime,
      sink: createCanaryObservationSink(runtime),
      environment: {},
      runner: runner(),
      buildLaunchSpec: () => stubLaunchSpec(runtime),
      launcher: async () => {
        createFileObservationSink(runtime.observationsPath).record({
          server: "exa",
          tool: "web_search_exa",
          at: new Date().toISOString(),
          upstreamVersion: "3.4.1",
          outcome: "ok",
        });
        return { ran: true, reason: null, exitCode: 0, excerpt: null };
      },
    });

  await run();
  assert.equal(existsSync(runtime.consumedPath), true, "a spent runtime is not marked as spent");
  await assert.rejects(
    run,
    (error: unknown) => {
      assert.ok(error instanceof CanaryBoundaryError);
      assert.equal(error.code, CANARY_RUNTIME_ALREADY_CONSUMED);
      return true;
    },
    "a second run through one runtime was allowed, and it would have read the first run's records",
  );
});

test("a canary with an unavailable observation sink refuses before the harness launches", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });

  let launched = false;
  const result = await runCanary({
    declaration: declaration(),
    harness: "claude",
    projectRoot: project,
    runtime,
    sink: { name: runtime.observationsPath, ready: async () => false, read: async () => [] },
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async () => {
      launched = true;
      return { ran: true, reason: null, exitCode: 0, excerpt: null };
    },
  });

  assert.equal(launched, false, "the harness was launched with nowhere to record what it did");
  assert.equal(result.launched, false);
  assert.equal(result.outcome, "blocked");
  const reason = result.blockedReasons.find((entry) => entry.code === "OBSERVATION_SINK_UNAVAILABLE");
  assert.ok(reason, `expected OBSERVATION_SINK_UNAVAILABLE, got ${result.blockedReasons.map((e) => e.code).join(", ")}`);
  assert.equal(reason.variable, runtime.observationsPath, "the refusal does not name the sink it is about");
  assert.equal(Object.hasOwn(BLOCKED_CODES, "OBSERVATION_SINK_UNAVAILABLE"), true, "the code is not in the stable table");
  // A run that was refused is not a run that was spent: the block is clearable
  // and the runtime is still usable once the sink is there.
  assert.equal(existsSync(runtime.consumedPath), false, "a refused run consumed the runtime anyway");
});

test("no environment name outside the platform floor plus the declared canary names reaches the harness child", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const canary = declaration({ requiresEnvironment: ["EXA_API_KEY"] });
  const spec = stubLaunchSpec(runtime);
  const declared = canaryEnvironmentNames({ declaration: canary, spec, runtime });

  const sentinel = "ALPHA_AOS_CANARY_LEAK_SENTINEL";
  assert.equal(declared.includes(sentinel), false, "the sentinel is declared, so the assertion below is vacuous");
  assert.equal(
    PLATFORM_FLOOR_ENVIRONMENT.includes(sentinel),
    false,
    "the sentinel sits in the platform floor, so the assertion below is vacuous",
  );

  const environment = materializeEnvironment(
    canaryEnvironmentPolicy({
      declaration: canary,
      spec,
      runtime,
      source: { [sentinel]: "a name nothing declared", EXA_API_KEY: "declared, so it travels", PATH: "declared" },
    }),
  );

  assert.equal(environment[sentinel], undefined, "an undeclared name reached the harness child");
  assert.equal(environment.EXA_API_KEY, "declared, so it travels", "a declared credential name did not reach the child");
  for (const name of Object.keys(environment)) {
    assert.equal(
      PLATFORM_FLOOR_ENVIRONMENT.includes(name) || declared.includes(name),
      true,
      `${name} reached the harness child and is outside the platform floor plus this canary's declaration`,
    );
  }

  // And the rule is enforced rather than merely satisfied: a materialized
  // environment carrying an undeclared name is refused before any launch.
  assert.throws(
    () => assertCanaryEnvironmentDeclared({ ...environment, [sentinel]: "smuggled" }, declared),
    (error: unknown) => {
      assert.ok(error instanceof CanaryBoundaryError);
      assert.equal(error.code, CANARY_ENVIRONMENT_UNDECLARED_NAME);
      assert.deepEqual(error.names, [sentinel]);
      return true;
    },
    "an undeclared environment name was not refused",
  );
});

/** A canary result that never launched, for a sweep test that must spend nothing. */
function blockedCanaryResult(canary: string, harness: LedgerHarness): CanaryRunResult {
  const declared = declaration({ id: canary });
  return {
    canary,
    capability: declared.capability,
    harness,
    outcome: "blocked",
    nativeUse: "unverified",
    verdict: decideInvocation(declared, []),
    observations: [],
    readiness: {
      harness,
      canary,
      ready: false,
      blockedReasons: [{ code: "HARNESS_NOT_INSTALLED", variable: harness, nextAction: `Install ${harness}.` }],
      identity: { provider: null, model: null, source: "not probed in this fixture" },
      checkedEnvironment: [],
      connections: [],
      notProbed: [],
    },
    identity: { provider: null, model: null, source: "not probed in this fixture" },
    blockedReasons: [{ code: "HARNESS_NOT_INSTALLED", variable: harness, nextAction: `Install ${harness}.` }],
    unverifiedReason: null,
    launched: false,
    exitCode: null,
    excerpt: null,
    oracle: null,
    runtimeRoot: "<state>/canary/never-created",
    ownedInstructionIds: [],
    costsModelTurn: true,
    launchArgs: [],
  };
}

// ---------------------------------------------------------------------------
// Plan 03-06 Task 3 — two commands: the free sweep and the paid canary
// ---------------------------------------------------------------------------

/** A discovery result that listed the capability, so the sweep has something to pair. */
function discoveryProof(harness: LedgerHarness, polarity: "positive" | "negative"): CapabilityProof {
  return {
    projectId: "0123456789abcdef",
    harness,
    capability: "WEB_BASE",
    polarity,
    nativeUse: polarity === "positive" ? "discovered" : "unverified",
    blockedReason: null,
    boundInputs: { skillSourceHash: "a".repeat(64), mcpServerVersion: null, evidenceHash: "b".repeat(64) },
    harnessVersion: { exact: "1.2.3", minorKey: "1.2", raw: "1.2.3" },
    ancestorFreedom: polarity === "negative" ? { asserted: true, checkedAncestors: ["<temp>"] } : null,
    observedAt: new Date().toISOString(),
    oracle: { command: "harness debug", exitCode: 0, stdoutFingerprint: "c".repeat(64), stderrFingerprint: "d".repeat(64) },
  };
}

function pairedDiscovery(harness: LedgerHarness, unit: ReturnType<typeof pairEvidence>): PairedDiscovery {
  return {
    harness,
    capability: "WEB_BASE",
    unit,
    unsupportedReason: null,
    positive: null,
    negatives: [],
    ancestorFreedom: unit.negative?.ancestorFreedom === null || unit.negative?.ancestorFreedom === undefined
      ? { asserted: true, checkedAncestors: [] }
      : {
          asserted: unit.negative.ancestorFreedom.asserted,
          checkedAncestors: [...unit.negative.ancestorFreedom.checkedAncestors],
        },
    incompleteReasons: [...unit.incompleteReasons],
    findings: [],
  };
}

test("the free discovery sweep completes with no credential, spends no model turn, and records an evidence unit", async () => {
  const driven: LedgerHarness[] = [];
  const sweep = await runDiscoverySweep({
    projectRoot: process.cwd(),
    controlRoot: tmpdir(),
    capability: "WEB_BASE",
    skillDirectories: ["web-patterns"],
    projectId: "0123456789abcdef",
    boundInputs: { skillSourceHash: "a".repeat(64), mcpServerVersion: null, evidenceHash: "b".repeat(64) },
    harnessVersions: {},
    // No credential is read anywhere in this path, and the drive is supplied so
    // the assertion holds on a host with no harness installed at all.
    run: async (options) => {
      driven.push(options.harness);
      const unit = pairEvidence(discoveryProof(options.harness, "positive"), discoveryProof(options.harness, "negative"));
      return {
        harness: options.harness,
        capability: options.capability,
        unit,
        unsupportedReason: null,
        positive: null,
        negatives: [],
        ancestorFreedom: { asserted: true, checkedAncestors: [] },
        incompleteReasons: [],
        findings: [],
      };
    },
  });

  assert.equal(sweep.costsModelTurn, false, "the free sweep reports that it spends something");
  assert.equal(sweep.units.length >= 1, true, "the free sweep recorded no evidence unit at all");
  assert.equal(sweep.proofs.length >= 2, true, "an evidence unit reached the ledger without both of its halves");

  // The harness whose oracle costs a turn is SKIPPED with that as the reason,
  // not driven. Read from the oracle table rather than restated here.
  assert.equal(driven.includes("claude"), false, "the free sweep drove the oracle that spends a model turn");
  const claude = sweep.entries.find((entry) => entry.harness === "claude");
  assert.ok(claude);
  assert.equal(claude.ran, false);
  assert.equal(claude.costsModelTurn, true);
  assert.equal(
    claude.skippedReason?.includes("doctor --canary"),
    true,
    "the skip does not name the command that spends deliberately",
  );
  for (const entry of sweep.entries) {
    assert.notEqual(entry.ran && entry.costsModelTurn === true, true, `${entry.harness} was driven and it costs a turn`);
  }
});

test("the canary sweep prints what it would spend before it runs anything", async () => {
  const catalog = await shippedCatalog();
  const announced: string[] = [];
  const announcedWhenRunStarted: number[] = [];

  const sweep = await runCanarySweep({
    catalog,
    announce: (line) => announced.push(line),
    run: async (selection) => {
      // The ordering assertion: how many cost lines had been announced by the
      // time this run began.
      announcedWhenRunStarted.push(announced.length);
      return blockedCanaryResult(selection.declaration.id, selection.harness);
    },
  });

  assert.equal(sweep.selections.length >= 3, true, "the sweep selected nothing, so the ordering proves nothing");
  assert.equal(announced.length >= 1, true, "nothing was announced at all");
  // Every selection is accounted for EXACTLY once — run, routed to the handoff
  // runner, or skipped with a reason. A selection that simply vanished would be
  // a canary nobody was told did not happen.
  assert.equal(
    announcedWhenRunStarted.length + sweep.handoffResults.length + sweep.skipped.length,
    sweep.selections.length,
    `runs ${announcedWhenRunStarted.length}, handoffs ${sweep.handoffResults.length}, skipped ${sweep.skipped.length}`,
  );
  // With no handoff runner supplied, the CAPA-03 declaration is skipped WITH a
  // reason rather than forced through the plain-canary shape.
  assert.equal(sweep.handoffResults.length, 0);
  assert.equal(
    sweep.skipped.every((entry) => entry.selection.declaration.capability === "CAPA-03" && entry.reason.length > 0),
    true,
    "a skipped selection must carry the reason it was skipped",
  );
  for (const seen of announcedWhenRunStarted) {
    assert.equal(seen, announced.length, "a run started before every cost line had been announced");
  }
  assert.equal(
    announced[0]?.includes("spend a model turn"),
    true,
    "the first announced line does not say how many pairs would spend a model turn",
  );
  // The shipped canaries are declared for the harness that DOES spend, so the
  // summary carries a real number rather than a zero.
  assert.equal(
    sweep.costLines.some((line) => line.includes("SPENDS")),
    true,
    "no selection was reported as spending, so the cost summary proves nothing",
  );
});

test("a canary blocked on an unset credential names the variable and the next action, and never a value", async () => {
  const sentinel = "sk-doctor-canary-sentinel-51ac7e";
  const canary = declaration({ requiresEnvironment: ["EXA_API_KEY", "FIRECRAWL_API_KEY"] });
  const readiness = await probeReadiness({
    harness: "claude",
    canary,
    environment: { EXA_API_KEY: sentinel },
    runner: runner(),
  });
  const row = canaryRow(
    {
      canary: canary.id,
      capability: canary.capability,
      harness: "claude",
      outcome: "blocked",
      nativeUse: "unverified",
      verdict: decideInvocation(canary, []),
      observations: [],
      readiness,
      identity: readiness.identity,
      blockedReasons: readiness.blockedReasons,
      unverifiedReason: null,
      launched: false,
      exitCode: null,
      excerpt: null,
      oracle: null,
      runtimeRoot: "<state>/canary/run",
      ownedInstructionIds: [],
      costsModelTurn: true,
      launchArgs: [],
    },
    "supported",
  );

  const rendered = formatCapabilityReport("Invocation canaries", [row], []);
  assert.equal(rendered.includes("MISSING_CREDENTIAL"), true, "the rendering does not carry the stable blocked code");
  assert.equal(rendered.includes("FIRECRAWL_API_KEY"), true, "the rendering does not name the unset variable");
  assert.equal(rendered.includes(sentinel), false, "a credential VALUE reached the rendered report");
  assert.equal(
    rendered.includes("Set FIRECRAWL_API_KEY"),
    true,
    "the rendering does not carry a next action the reader can act on",
  );
});

test("--json carries all three axes for every capability and the human output carries one line each", async () => {
  const rows: CapabilityReportRow[] = [
    discoveryRow(
      {
        harness: "codex",
        ran: true,
        skippedReason: null,
        costsModelTurn: false,
        discovery: pairedDiscovery("codex", pairEvidence(discoveryProof("codex", "positive"), discoveryProof("codex", "negative"))),
      },
      "WEB_BASE",
      "unverified",
    ),
    discoveryRow(
      {
        harness: "pi",
        ran: true,
        skippedReason: null,
        costsModelTurn: false,
        // No negative control was taken, so the unit is INCOMPLETE.
        discovery: pairedDiscovery("pi", pairEvidence(discoveryProof("pi", "positive"), null)),
      },
      "WEB_BASE",
      "unverified",
    ),
  ];

  for (const row of rows) {
    assert.equal(Object.hasOwn(row.axes, "deployment"), true, "a reported capability carries no deployment axis");
    assert.equal(Object.hasOwn(row.axes, "support"), true, "a reported capability carries no support axis");
    assert.equal(Object.hasOwn(row.axes, "nativeUse"), true, "a reported capability carries no native-use axis");
    // The axis this command did not measure is a recorded absence WITH a
    // reason, never a value picked to fill the column.
    assert.equal(row.axes.deployment, null);
    assert.equal(row.axisNotes.deployment.length > 20, true, "the unmeasured axis carries no reason");
  }

  const rendered = formatCapabilityReport("Free discovery sweep", rows, []);
  // A summary row is the TABLE line: its evidence cell is padded to the column
  // width, so it is followed by two or more spaces. The per-reason lines below
  // the table carry a single space and are deliberately not summary lines.
  const summaryLines = rendered.split("\n").filter((line) => /^(COMPLETE|INCOMPLETE) {2,}/u.test(line));
  assert.equal(summaryLines.length, rows.length, "the human output does not carry exactly one summary line per capability");
});

test("a supported row says NOT-RUN when no discovery leg ran and repeats the reason in its detail cell", () => {
  const reason = "no free oracle ran for this harness";
  const row: CapabilityReportRow = {
    capability: "WEB_BASE",
    harness: "codex",
    completeness: null,
    axes: { deployment: null, support: "supported", nativeUse: null },
    axisNotes: { deployment: "not measured by this command", nativeUse: reason },
    blockedReason: null,
    notRunReason: reason,
    incompleteReasons: [],
    claimNotes: [],
  };

  const rendered = formatCapabilityReport("Free discovery sweep", [row], []);
  assert.match(rendered, new RegExp(`^NOT-RUN WEB_BASE on codex — ${reason}$`, "mu"));
  const tableRow = rendered.split("\n").find((line) => line.includes("WEB_BASE") && !line.startsWith("NOT-RUN"));
  assert.ok(tableRow, "the report rendered no table row for the supported capability");
  assert.equal(tableRow.includes(reason), true, "the detail cell does not carry the same not-run reason");
});

test("a complete discovery row exposes both halves' claim notes in positive-then-negative order", () => {
  const positive = { ...discoveryProof("codex", "positive"), claimNotes: [{ kind: "scope-limit" as const, statement: "Observed fixture scope", basis: "The positive fixture ran here" }] };
  const negative = { ...discoveryProof("codex", "negative"), claimNotes: [{ kind: "inference" as const, statement: "Cannot invoke outside the project", basis: "The control did not list the capability" }] };
  const row = discoveryRow(
    { harness: "codex", ran: true, skippedReason: null, costsModelTurn: false, discovery: pairedDiscovery("codex", pairEvidence(positive, negative)) },
    "WEB_BASE", "supported",
  );
  assert.equal(row.completeness, "COMPLETE");
  assert.deepEqual(row.claimNotes, [...positive.claimNotes, ...negative.claimNotes]);
  assert.deepEqual(JSON.parse(JSON.stringify(row)).claimNotes, row.claimNotes);
});

test("claim notes render in full on tagged lines after incompleteness without changing the table", () => {
  const proof = { ...discoveryProof("pi", "positive"), claimNotes: [
    { kind: "inference" as const, statement: "A qualified conclusion", basis: "The observed premise repeated for width coverage. ".repeat(8) },
    { kind: "scope-limit" as const, statement: "A bounded scope", basis: "The fixture supplied its own configuration" },
  ] };
  const row = discoveryRow(
    { harness: "pi", ran: true, skippedReason: "Fixture not run", costsModelTurn: false, discovery: pairedDiscovery("pi", pairEvidence(proof, null)) },
    "WEB_BASE", "unverified",
  );
  const rendered = formatCapabilityReport("Report", [row]);
  const lines = rendered.split("\n");
  const claimLines = lines.filter((line) => line.startsWith("CLAIM-"));
  assert.deepEqual(claimLines, proof.claimNotes.map((note) =>
    `${note.kind === "inference" ? "CLAIM-INFERENCE" : "CLAIM-SCOPE"} WEB_BASE on pi — ${note.statement} Basis: ${note.basis}`,
  ));
  const tableRow = (output: string) => output.split("\n").find((line) => /^INCOMPLETE {2,}/u.test(line));
  assert.ok(tableRow(rendered));
  assert.equal(tableRow(rendered), tableRow(formatCapabilityReport("Report", [{ ...row, claimNotes: [] }])));
  assert.ok(lines.findIndex((line) => line.startsWith("INCOMPLETE WEB_BASE")) < lines.indexOf(claimLines[0]!));
  assert.ok(lines.indexOf(claimLines[1]!) < lines.findIndex((line) => line.startsWith("NOT-RUN WEB_BASE")));
});

test("an INCOMPLETE unit renders INCOMPLETE and never the positive's native-use value", () => {
  const incomplete = pairEvidence(discoveryProof("pi", "positive"), null);
  assert.equal(incomplete.completeness, "INCOMPLETE");
  assert.equal(incomplete.positive?.nativeUse, "discovered", "the positive half did not record a native-use value to withhold");

  const row = discoveryRow(
    { harness: "pi", ran: true, skippedReason: null, costsModelTurn: false, discovery: pairedDiscovery("pi", incomplete) },
    "WEB_BASE",
    "unverified",
  );
  const rendered = formatCapabilityReport("Free discovery sweep", [row], []);
  const summary = rendered.split("\n").find((line) => /^INCOMPLETE {2,}WEB_BASE\s+pi\s/u.test(line));
  assert.ok(summary, `no INCOMPLETE summary line was rendered:\n${rendered}`);
  assert.equal(
    summary.includes("discovered"),
    false,
    "an INCOMPLETE unit rendered the positive's native-use value, which reads as a result",
  );
  assert.equal(row.axes.nativeUse, null, "an INCOMPLETE unit reported a native-use axis at all");
});

// ---------------------------------------------------------------------------
// Plan 03-08 Task 1 — the owned instruction has to be REACHABLE, not just written
//
// 03-07 asked 03-08 to confirm rather than assume that the new owned
// instruction is reachable inside the isolated canary runtime. Confirming it
// produced a negative: `createCanaryLaunchSpec` uses `project-only` isolation,
// which points claude at a CLAUDE_CONFIG_DIR inside the runtime, so a
// user-scope owned skill at ~/.claude/skills is invisible to the very run it
// was written to steer. These assertions cover the repair.
// ---------------------------------------------------------------------------

test("the canary runtime carries the alpha-AOS-owned routing instruction inside the config root the launch points at", async (context: TestContext) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa", "firecrawl"],
    stateRoot: state,
    lock,
    environment: {},
  });

  // The exact directory the launch spec sets as CLAUDE_CONFIG_DIR. Derived from
  // the spec rather than restated, so a change to one is a failure here rather
  // than a runtime that quietly writes to a path nothing reads.
  const spec = createCanaryLaunchSpec({ harness: "claude", runtime, projectRoot: project });
  const configRoot = spec.env.CLAUDE_CONFIG_DIR;
  assert.ok(configRoot, "the canary launch sets no CLAUDE_CONFIG_DIR, so nothing here can be reachable");

  const instruction = join(configRoot, "skills", "alpha-aos-research-routing", "SKILL.md");
  assert.equal(existsSync(instruction), true, `the owned routing instruction is not under the canary's own config root: ${instruction}`);
  assert.equal(
    runtime.declaredFiles.includes(instruction),
    true,
    "the runtime wrote a file it did not declare, which is exactly what the D-02 containment assertion exists to catch",
  );

  // Byte-for-byte with the repository source: this is alpha-AOS's own document,
  // so source hash and target hash are one fact and a second rendering here
  // would be a second place the text could differ from the reviewed one.
  const shipped = await readFile(join(repositoryRoot, "skills", "alpha-aos-research-routing", "SKILL.md"), "utf8");
  assert.equal(await readFile(instruction, "utf8"), shipped, "the runtime's copy is not byte-identical to the reviewed source");
});

test("runtime instruction ids name exactly the materialized targets, including the scoped CAPA-03 instruction", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  for (const capability of [null, "CAPA-01", "CAPA-03"]) {
    const runtime = await createCanaryRuntime({ projectRoot: project, harness: "claude", servers: [], stateRoot: state, lock, environment: {}, capability });
    const expected = capability === "CAPA-03" ? ["alpha-aos-research-routing", "alpha-aos-memory-handoff"] : ["alpha-aos-research-routing"];
    assert.deepEqual(runtime.ownedInstructionIds, expected);
    assert.deepEqual(runtime.declaredFiles.filter((file) => file.endsWith("SKILL.md")), expected.map((id) => join(runtime.root, "claude", "skills", id, "SKILL.md")));
    for (const id of runtime.ownedInstructionIds) assert.ok(existsSync(join(runtime.root, "claude", "skills", id, "SKILL.md")));
  }
});

test("the serialized doctor discovery envelope has no cycle placeholder and keeps the canonical unit complete", async () => {
  const sweep = await runDiscoverySweep({
    projectRoot: process.cwd(),
    controlRoot: tmpdir(),
    capability: "WEB_BASE",
    skillDirectories: ["web-patterns"],
    projectId: "0123456789abcdef",
    boundInputs: { skillSourceHash: "a".repeat(64), mcpServerVersion: null, evidenceHash: "b".repeat(64) },
    harnessVersions: {},
    harnesses: ["codex", "pi", "claude"],
    run: async (options) => pairedDiscovery(
      options.harness,
      pairEvidence(discoveryProof(options.harness, "positive"), discoveryProof(options.harness, "negative")),
    ),
  });
  const rows = sweep.entries.map((entry) => discoveryRow(entry, "WEB_BASE", "supported"));
  const serialized = serializeObservable({
    command: "doctor --discovery",
    project: process.cwd(),
    packs: ["WEB_BASE"],
    costsModelTurn: false,
    rows,
    sweeps: [sweep],
    ledger: { status: "unchanged", recorded: sweep.proofs.length, path: "<state>/capabilities.json" },
  }, createRedactionContext({ projectRoot: process.cwd() }));
  assert.equal(serialized.truncated, false, "the deterministic doctor envelope exceeded the observable byte budget");
  const envelope = JSON.parse(serialized.text) as {
    sweeps: Array<{ entries: Array<{ ran: boolean; skippedReason: string | null; discovery: PairedDiscovery | null }>; units: unknown[] }>;
  };
  const cyclePaths: string[] = [];
  const walk = (value: unknown, path = "$ "): void => {
    if (value === placeholder("cycle")) cyclePaths.push(path.trim());
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    } else if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
    }
  };
  walk(envelope);
  assert.deepEqual(cyclePaths, [], `the serialized CLI envelope contains a cycle placeholder at ${cyclePaths.join(", ")}`);

  const serializedSweep = envelope.sweeps[0];
  assert.ok(serializedSweep);
  assert.equal(serializedSweep.units.length, 2, "the two free legs did not both reach the aggregate unit view");
  const ran = serializedSweep.entries.find((entry) => entry.ran && entry.discovery?.unit !== null);
  assert.ok(ran?.discovery?.unit, "a driven leg lost its canonical discovery unit");
  assert.equal(ran.discovery.unit.completeness, "COMPLETE");
  assert.ok(ran.discovery.unit.negative, "the canonical unit lost its negative proof");
  assert.ok(
    (ran.discovery.unit.negative.ancestorFreedom?.checkedAncestors.length ?? 0) > 0,
    "the canonical negative lost its checked-ancestor list",
  );
  const skipped = serializedSweep.entries.find((entry) => !entry.ran);
  assert.ok(skipped, "the spending leg was not represented in the envelope");
  assert.equal(skipped.discovery, null, "the skipped leg invented a discovery result");
  assert.ok((skipped.skippedReason?.length ?? 0) > 0, "the skipped leg has no reason");
});

test("discovery rows preserve the driven unit and the skipped leg's stated absence", () => {
  const unit = pairEvidence(discoveryProof("codex", "positive"), discoveryProof("codex", "negative"));
  const driven = discoveryRow({
    harness: "codex",
    ran: true,
    skippedReason: null,
    costsModelTurn: false,
    discovery: pairedDiscovery("codex", unit),
  }, "WEB_BASE", "supported");
  assert.deepEqual(
    { completeness: driven.completeness, nativeUse: driven.axes.nativeUse, notRunReason: driven.notRunReason },
    { completeness: "COMPLETE", nativeUse: "discovered", notRunReason: null },
  );

  const reason = "driving claude spends a model turn";
  const skipped = discoveryRow({
    harness: "claude",
    ran: false,
    skippedReason: reason,
    costsModelTurn: true,
    discovery: null,
  }, "WEB_BASE", "supported");
  assert.deepEqual(
    {
      completeness: skipped.completeness,
      nativeUse: skipped.axes.nativeUse,
      axisNote: skipped.axisNotes.nativeUse,
      blockedReason: skipped.blockedReason,
      notRunReason: skipped.notRunReason,
    },
    { completeness: null, nativeUse: null, axisNote: reason, blockedReason: null, notRunReason: reason },
  );
});

test("a validated Codex runtime supplies readiness evidence and ordered observations decide invocation", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const authRoot = join(project, "synthetic-codex-auth");
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["context7"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const canary = declaration({
    id: "DOCUMENTATION_VERSION_SCOPED",
    capability: "CAPA-01",
    harnesses: ["codex"],
    expectTools: ["resolve-library-id", "query-docs"],
    expectOrdered: true,
    expectArgumentPatterns: [
      { tool: "query-docs", argument: "libraryId", pattern: "^/[^/]+/[^/]+/[^/]+$", why: "version-scoped" },
    ],
    requiresMcpServers: ["context7"],
  });
  let launchArgs: readonly string[] = [];
  const result = await runCanary({
    declaration: canary,
    harness: "codex",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: { CODEX_HOME: authRoot },
    runner: runner(),
    buildLaunchSpec: () => codexStubLaunchSpec(runtime, authRoot),
    launcher: async (launch) => {
      launchArgs = launch.args;
      const observer = createFileObservationSink(runtime.observationsPath);
      observer.record(observation("context7", "resolve-library-id", 0));
      observer.record(observation("context7", "query-docs", 1, { identifierShape: "version-scoped" }));
      return { ran: true, reason: null, exitCode: 0, excerpt: createRedactedExcerpt("model text is diagnostic only", createRedactionContext()) };
    },
  });

  assert.equal(result.readiness.ready, true, JSON.stringify(result.readiness.blockedReasons));
  assert.deepEqual(result.readiness.connections, [{ server: "context7", state: "pending" }]);
  assert.equal(result.launched, true);
  assert.equal(result.nativeUse, "invoked");
  assert.equal((result.verdict as typeof result.verdict & { readonly held?: boolean }).held, true);
  assert.equal(result.costsModelTurn, true);
  assert.equal(result.oracle?.stdoutFingerprint.length, 64);
  assert.equal(launchArgs.includes("exec"), true);
  assert.equal(launchArgs.includes("debug"), false);

  const missingRuntime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: [],
    stateRoot: state,
    lock,
    environment: {},
  });
  let missingLaunched = false;
  const missing = await runCanary({
    declaration: canary,
    harness: "codex",
    projectRoot: project,
    runtime: missingRuntime,
    sink: createCanaryObservationSink(missingRuntime),
    environment: { CODEX_HOME: authRoot },
    runner: runner(),
    buildLaunchSpec: () => codexStubLaunchSpec(missingRuntime, authRoot),
    launcher: async () => {
      missingLaunched = true;
      return { ran: true, reason: null, exitCode: 0, excerpt: null };
    },
  });
  assert.equal(missingLaunched, false, "a runtime missing Context7 reached the launcher");
  assert.equal(missing.readiness.ready, false);
  assert.equal(missing.blockedReasons.some((reason) => reason.code === "MCP_SERVER_NOT_REGISTERED"), true);
});

test("Codex canary artifacts preserve credential names but never credential values or copied auth bytes", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const authRoot = join(project, "synthetic-codex-auth");
  const authBytes = "synthetic-auth-bytes-that-must-never-be-read";
  const credentialValue = "context7-credential-value-that-must-not-serialize";
  await mkdir(authRoot, { recursive: true });
  await writeFile(join(authRoot, "auth.json"), authBytes, "utf8");
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["context7"],
    stateRoot: state,
    lock,
    environment: { CONTEXT7_API_KEY: credentialValue },
  });
  const canary = declaration({
    id: "DOCUMENTATION_VERSION_SCOPED",
    capability: "CAPA-01",
    harnesses: ["codex"],
    expectTools: ["resolve-library-id", "query-docs"],
    expectOrdered: true,
    requiresMcpServers: ["context7"],
  });
  let serializedLaunch = "";
  const result = await runCanary({
    declaration: canary,
    harness: "codex",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: { CODEX_HOME: authRoot, CONTEXT7_API_KEY: credentialValue },
    runner: runner(),
    buildLaunchSpec: () => codexStubLaunchSpec(runtime, authRoot),
    launcher: async (launch) => {
      serializedLaunch = JSON.stringify({ args: launch.args, environmentNames: Object.keys(launch.environment) });
      const observer = createFileObservationSink(runtime.observationsPath);
      observer.record(observation("context7", "resolve-library-id", 0));
      observer.record(observation("context7", "query-docs", 1, { identifierShape: "version-scoped" }));
      return { ran: true, reason: null, exitCode: 0, excerpt: createRedactedExcerpt("", createRedactionContext()) };
    },
  });
  const runtimeFiles = (await Promise.all(runtime.declaredFiles.map((file) => readFile(file, "utf8")))).join("\n");
  const observable = [serializedLaunch, JSON.stringify(result.readiness), JSON.stringify(result), runtimeFiles].join("\n");
  assert.equal(observable.includes("CONTEXT7_API_KEY"), true, "the credential name is absent, so the value check is vacuous");
  assert.equal(observable.includes(credentialValue), false, "a credential value reached a serialized canary artifact");
  assert.equal(observable.includes(authBytes), false, "authentication bytes were copied or serialized");
  assert.equal(await readFile(join(authRoot, "auth.json"), "utf8"), authBytes, "the synthetic auth file was modified");
});

test("a Codex runtime derives overrides for exactly its validated observation-front servers", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["context7"],
    stateRoot: state,
    lock,
    environment: {},
  });

  const overrides = codexRuntimeOverrides(runtime);
  assert.equal(overrides.length > 0, true, "the Codex runtime carries no native config overrides");
  assert.equal(overrides.length % 2, 0, "Codex config overrides are not emitted as -c/value pairs");
  const assignments = overrides.filter((_entry, index) => index % 2 === 1);
  assert.equal(overrides.filter((entry) => entry === "-c").length, assignments.length);
  assert.deepEqual(
    assignments.map((entry) => entry.slice(0, entry.indexOf("="))).sort(),
    [
      "mcp_servers.context7.args",
      "mcp_servers.context7.command",
      "mcp_servers.context7.env_vars",
      "mcp_servers.context7.startup_timeout_sec",
    ],
  );
  assert.equal(assignments.some((entry) => entry.includes("mcp_servers.exa")), false);
  assert.equal(assignments.some((entry) => entry.includes("mcp_servers.firecrawl")), false);
  assert.equal(assignments.some((entry) => entry.includes("mcp_servers.ambient")), false);
  const serialized = JSON.stringify(assignments);
  assert.equal(serialized.includes("mcp-proxy"), true, "the override command does not cross the alpha-AOS front");
  assert.equal(serialized.includes("--observe"), true, "the override command is fronted but not observed");
  assert.equal(
    assignments.some((entry) => entry.includes(runtime.observationsPath.replaceAll("\\", "\\\\"))),
    true,
    "the override observes into another runtime",
  );
});

function completeCodexArgs(runtime: CanaryRuntime): string[] {
  const prompt = canaryPromptArgs("codex", "Use the capability when relevant.");
  assert.ok(prompt);
  return [...prompt.slice(0, -1), ...codexRuntimeOverrides(runtime), prompt.at(-1) as string];
}

test("Codex authentication fallback preserves the platform home while every controlled write root stays runtime-local", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["context7"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const authHome = join(state, "synthetic-auth-home");
  const source = { HOME: authHome, USERPROFILE: authHome };
  const spec = createCanaryLaunchSpec({ harness: "codex", runtime, projectRoot: project, environment: source });
  const environment = materializeEnvironment({
    ...canaryEnvironmentPolicy({ declaration: declaration({ harnesses: ["codex"] }), spec, runtime, source }),
  });
  const platformHomeName = process.platform === "win32" ? "USERPROFILE" : "HOME";
  assert.equal(environment[platformHomeName], authHome);
  for (const name of [
    "LOCALAPPDATA",
    "APPDATA",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
    "npm_config_cache",
  ]) {
    const value = environment[name];
    assert.ok(value, `${name} is absent`);
    assert.equal(resolve(value).startsWith(`${resolve(runtime.root)}${process.platform === "win32" ? "\\" : "/"}`), true, `${name} escaped`);
  }
  assert.doesNotThrow(() => assertCanaryLaunchIsolation(environment, runtime, completeCodexArgs(runtime)));
});

test("Codex boundary mutations are refused before any launcher can run", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["context7"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const validArgs = completeCodexArgs(runtime);
  const authRoot = join(state, "outside-auth");
  const validEnvironment = {
    CODEX_HOME: authRoot,
    LOCALAPPDATA: join(runtime.root, "write", "local"),
    APPDATA: join(runtime.root, "write", "roaming"),
    XDG_CACHE_HOME: join(runtime.root, "write", "cache"),
    XDG_CONFIG_HOME: join(runtime.root, "write", "config"),
    XDG_DATA_HOME: join(runtime.root, "write", "data"),
    XDG_STATE_HOME: join(runtime.root, "write", "state"),
    npm_config_cache: join(runtime.root, "write", "npm-cache"),
  };
  const mutations = [
    validArgs.filter((entry) => entry !== "--ignore-user-config"),
    validArgs.filter((entry) => entry !== "--ignore-rules"),
    [...validArgs.slice(0, -1), "-c", "mcp_servers.ambient.command=\"ambient\"", validArgs.at(-1) as string],
  ];
  const instruction = validArgs.indexOf(`developer_instructions=${JSON.stringify(CODEX_CANARY_DEVELOPER_INSTRUCTIONS)}`);
  assert.notEqual(instruction, -1, "the valid fixture has no Codex routing instruction");
  mutations.push(validArgs.filter((_entry, index) => index !== instruction && index !== instruction - 1));
  for (const args of mutations) {
    assert.throws(
      () => assertCanaryLaunchIsolation(validEnvironment, runtime, args),
      (error: unknown) => error instanceof CanaryBoundaryError && error.code === CANARY_LAUNCH_ISOLATION_VIOLATION,
    );
  }
  assert.throws(
    () => assertCanaryLaunchIsolation({ ...validEnvironment, npm_config_cache: join(state, "escaped-cache") }, runtime, validArgs),
    (error: unknown) => error instanceof CanaryBoundaryError && error.code === CANARY_LAUNCH_ISOLATION_VIOLATION,
  );

  const rendered = await readFile(runtime.mcpConfigPath, "utf8");
  assert.throws(
    () => deriveCodexMcpOverrides(rendered.replace('"mcp-proxy"', '"not-the-observation-front"'), ["context7"], runtime.observationsPath),
    /does not invoke alpha-aos mcp-proxy/u,
  );

  let launched = false;
  await assert.rejects(
    runCanary({
      declaration: declaration({ harnesses: ["codex"], requiresMcpServers: ["context7"] }),
      harness: "codex",
      projectRoot: project,
      runtime,
      sink: createCanaryObservationSink(runtime),
      environment: { CODEX_HOME: authRoot },
      runner: runner(),
      buildLaunchSpec: () => ({
        ...codexStubLaunchSpec(runtime, authRoot),
        args: [...codexRuntimeOverrides(runtime), "-c", 'mcp_servers.ambient.command="ambient"'],
      }),
      launcher: async () => {
        launched = true;
        return { ran: true, reason: null, exitCode: 0, excerpt: null };
      },
    }),
    (error: unknown) => error instanceof CanaryBoundaryError && error.code === CANARY_LAUNCH_ISOLATION_VIOLATION,
  );
  assert.equal(launched, false);
});

test("a launched canary proof records its runtime scope and the recorded instruction ids without recomputing them", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const created = await createCanaryRuntime({ projectRoot: project, harness: "claude", servers: [], stateRoot: state, lock, environment: {}, capability: "CAPA-03" });
  // A deliberately shorter recorded list must travel through runCanary unchanged.
  const runtime = { ...created, ownedInstructionIds: ["alpha-aos-memory-handoff"] };
  const result = await runCanary({
    declaration: declaration(), harness: "claude", projectRoot: project, runtime,
    sink: createCanaryObservationSink(runtime), environment: {}, runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async () => ({ ran: true, reason: null, exitCode: 0, excerpt: createRedactedExcerpt("", createRedactionContext()) }),
  });
  assert.equal(result.launched, true);
  assert.deepEqual(result.ownedInstructionIds, ["alpha-aos-memory-handoff"]);
  const base = discoveryProof("claude", "positive");
  const proof = canaryProof(result, base);
  assert.ok(proof);
  assert.deepEqual(proof.claimNotes, canaryClaimNotes(result));
  assert.deepEqual(canaryRow(result, "supported").claimNotes, proof.claimNotes);
  assert.equal(proof.claimNotes?.length, 1);
  assert.equal(proof.claimNotes?.[0]?.kind, "scope-limit");
  assert.equal(proof.claimNotes?.[0]?.statement, CANARY_RUNTIME_SCOPE_LIMIT);
  assert.match(proof.claimNotes?.[0]?.basis ?? "", /own harness configuration root.*alpha-aos-memory-handoff/u);
  assert.equal(proof.claimNotes?.[0]?.basis.includes("alpha-aos-research-routing"), false);
  assert.equal(proof.nativeUse, result.nativeUse);
});

test("a refused canary carries runtime instruction ids but has no proof or claim note", async (context) => {
  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({ projectRoot: project, harness: "claude", servers: [], stateRoot: state, lock, environment: {} });
  for (const blocked of [true, false]) {
    const result = await runCanary({
      declaration: declaration({ requiresEnvironment: blocked ? ["EXA_API_KEY"] : [] }),
      harness: "claude", projectRoot: project, runtime, sink: createCanaryObservationSink(runtime),
      environment: {}, runner: runner(), buildLaunchSpec: () => stubLaunchSpec(runtime, { blockedReasons: ["fixture isolation refused"] }),
      launcher: async () => { throw new Error("a refused run must not reach the launcher"); },
    });
    assert.equal(result.launched, false);
    assert.deepEqual(result.ownedInstructionIds, runtime.ownedInstructionIds);
    assert.equal(canaryProof(result, discoveryProof("claude", "positive")), null);
    assert.deepEqual(canaryClaimNotes(result), []);
  }
});

test("a canary runtime refuses to be created when its owned instruction is missing", async (context: TestContext) => {
  const { project, state, lock } = await runtimeFixture(context);
  const emptyPackage = await mkdtemp(join(tmpdir(), "alpha-aos-no-instruction-"));
  context.after(async () => {
    await rm(emptyPackage, { recursive: true, force: true });
  });

  await assert.rejects(
    async () =>
      createCanaryRuntime({
        projectRoot: project,
        harness: "claude",
        servers: ["exa"],
        stateRoot: state,
        lock,
        packageRoot: emptyPackage,
        environment: {},
      }),
    (error: unknown) => {
      const message = String((error as Error).message);
      assert.ok(message.includes("alpha-aos-research-routing"), message);
      return true;
    },
    "a canary that ran without its steering layer and passed would be reporting the third-party text's behaviour under alpha-AOS's name",
  );
});

test("a harness with no reachable skill root gets no instruction rather than one written where nothing reads it", async (context: TestContext) => {
  const { project, state, lock } = await runtimeFixture(context);
  // codex's canary launch is blocked before it starts (only claude has the two
  // MCP isolation flags), so a skill root guessed for it would be a path
  // nothing ever reads. A recorded absence, in the shape this module already
  // uses for CANARY_MCP_ISOLATION.
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "codex",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });
  assert.equal(
    runtime.declaredFiles.some((file) => file.includes("alpha-aos-research-routing")),
    false,
    "an instruction was written for a harness whose canary launch is blocked, so it is a file nothing will read",
  );
});

// ---------------------------------------------------------------------------
// Plan 03-08 Task 2 — the ordered-sequence matcher and the fan-out judgement
//
// Every one of these is driven from a SYNTHETIC observation list, so the whole
// verdict logic is provable on a CI leg with no harness, no credential and no
// network. That is deliberate: 03-RESEARCH.md Pitfall 10 measured a paid canary
// at roughly $0.13 a run and recorded that hosted CI has no credential at all,
// so a verdict that could only be checked by spending would never be checked.
// ---------------------------------------------------------------------------

/** One synthetic observation. `at` is ordered by index so call order is unambiguous. */
function observation(
  server: McpServerId,
  tool: string,
  index: number,
  extra: { readonly outcome?: "ok" | "denied"; readonly identifierShape?: IdentifierShape } = {},
): McpObservation {
  return {
    server,
    tool,
    at: new Date(Date.UTC(2026, 8, 10, 0, 0, index)).toISOString(),
    upstreamVersion: "0.0.0-fixture",
    outcome: extra.outcome ?? "ok",
    ...(extra.identifierShape === undefined ? {} : { identifierShape: extra.identifierShape }),
  };
}

const DOCUMENTATION_CANARY = declaration({
  id: "FIXTURE_DOCUMENTATION",
  capability: "CAPA-01",
  expectTools: ["resolve-library-id", "query-docs"],
  expectOrdered: true,
  expectArgumentPatterns: [
    { tool: "query-docs", argument: "libraryId", pattern: "^/[^/]+/[^/]+/[^/]+$", why: "version-scoped" },
  ],
  maxDistinctServers: 1,
});

const RESEARCH_CANARY = declaration({
  id: "FIXTURE_RESEARCH",
  expectTools: ["web_search_exa", "firecrawl_scrape"],
  expectOrdered: true,
  forbidTools: ["firecrawl_search"],
  maxDistinctServers: 2,
});

// --- Test 1: the version-sensitivity assertion is structural ----------------

test("a documentation pair whose query carried a version-scoped identifier matches, and the same pair without one does not", () => {
  const scoped = matchExpectations(
    [
      observation("context7", "resolve-library-id", 0),
      observation("context7", "query-docs", 1, { identifierShape: "version-scoped" }),
    ],
    DOCUMENTATION_CANARY,
  );
  assert.deepEqual([...scoped.matched], ["resolve-library-id", "query-docs"]);
  assert.deepEqual([...scoped.missing], []);
  assert.deepEqual([...scoped.satisfiedArgumentPatterns], ["query-docs.libraryId"]);
  assert.deepEqual([...scoped.unsatisfiedArgumentPatterns], []);
  assert.equal(scoped.held, true, "a version-scoped documentation pair must satisfy the CAPA-01 expectation");

  const unscoped = matchExpectations(
    [
      observation("context7", "resolve-library-id", 0),
      observation("context7", "query-docs", 1, { identifierShape: "unscoped" }),
    ],
    DOCUMENTATION_CANARY,
  );
  assert.deepEqual([...unscoped.satisfiedArgumentPatterns], []);
  assert.deepEqual([...unscoped.unsatisfiedArgumentPatterns], ["query-docs.libraryId"]);
  assert.equal(
    unscoped.held,
    false,
    "a two-segment identifier is not version-scoped; counting it as one is CAPA-01 proving nothing",
  );
  assert.equal(
    unscoped.reasons.some((reason) => reason.includes("query-docs.libraryId")),
    true,
    "the verdict does not say which declared pattern went unsatisfied",
  );
});

test("a declared pattern is still reported unchecked when the record carries no shape for it", () => {
  // The narrowing that keeps 03-06's T-03-52 reasoning intact. The record gained
  // ONE shape field, not a general argument channel: a call the proxy did not
  // classify carries no shape, and a pattern over it stays unchecked with its
  // reason rather than being counted either way.
  const match = matchExpectations(
    [
      observation("context7", "resolve-library-id", 0),
      observation("context7", "query-docs", 1),
    ],
    DOCUMENTATION_CANARY,
  );
  assert.deepEqual([...match.uncheckedArgumentPatterns], ["query-docs.libraryId"]);
  assert.deepEqual([...match.satisfiedArgumentPatterns], []);
  assert.deepEqual([...match.unsatisfiedArgumentPatterns], []);
  assert.equal(
    match.reasons.some((reason) => reason.includes("has no argument field")),
    true,
    "an unchecked pattern must still carry the reason it could not be checked",
  );
});

// --- Test 2: ordering is a verdict, not a set membership --------------------

test("expectations are matched as an ordered sequence, so extraction-before-discovery is a different verdict from discovery-then-extraction", () => {
  const inOrder = matchExpectations(
    [observation("exa", "web_search_exa", 0), observation("firecrawl", "firecrawl_scrape", 1)],
    RESEARCH_CANARY,
  );
  const reversed = matchExpectations(
    [observation("firecrawl", "firecrawl_scrape", 0), observation("exa", "web_search_exa", 1)],
    RESEARCH_CANARY,
  );

  // The SAME two calls, the same servers, the same count — only the order
  // differs, and the verdicts must differ with it. A set comparison cannot
  // express the ordering claim CAPA-02 exists to make.
  assert.equal(inOrder.ordered, true);
  assert.equal(reversed.ordered, false);
  assert.equal(inOrder.held, true);
  assert.equal(reversed.held, false);
  assert.notDeepEqual(inOrder, reversed, "two orderings of one pair produced an identical verdict");
  assert.equal(
    reversed.reasons.some((reason) => reason.includes("order")),
    true,
    "an out-of-order run does not say that order is why it failed",
  );
});

test("the ordered match is a subsequence, so an unrelated call between the two legs does not break the order", () => {
  const match = matchExpectations(
    [
      observation("exa", "web_search_exa", 0),
      observation("exa", "web_fetch_exa", 1),
      observation("firecrawl", "firecrawl_scrape", 2),
    ],
    RESEARCH_CANARY,
  );
  assert.equal(match.ordered, true, "a subsequence match must tolerate calls the declaration says nothing about");
  assert.equal(match.held, true);
});

// --- Test 3 / 3b: the fan-out judgement is a COUNT --------------------------

test("the distinct-server boundary passes at exactly the declared maximum and fails at one past it", () => {
  const control = declaration({ expectTools: [], maxDistinctServers: 1 });
  const exactlyOne = matchExpectations([observation("exa", "web_search_exa", 0)], control);
  const exactlyTwo = matchExpectations(
    [observation("exa", "web_search_exa", 0), observation("firecrawl", "firecrawl_scrape", 1)],
    control,
  );

  // Asserted as a PAIR, in one test: a boundary rule checked only on the failing
  // side is satisfied by a rule that fails everything.
  assert.equal(exactlyOne.distinctServers, 1);
  assert.equal(exactlyOne.withinServerBudget, true, "exactly the declared maximum must pass");
  assert.equal(exactlyTwo.distinctServers, 2);
  assert.equal(exactlyTwo.withinServerBudget, false, "one past the declared maximum must fail");
  assert.equal(
    exactlyTwo.reasons.some((reason) => reason.includes("2") && reason.includes("1")),
    true,
    "the fan-out finding names neither the count observed nor the count declared",
  );
});

test("two calls to one research server count as one touch and two calls to two servers count as two", () => {
  // Two lists of IDENTICAL LENGTH differing only in the second call's server id.
  // 03-RESEARCH.md Pitfall 1's second-order note is why this matters: the
  // discovery server ships its own fetch, so search-then-fetch entirely on it is
  // a correct single-server run, and a count that summed the two calls would
  // report this phase's own recommended routing as fan-out.
  const oneServer = [observation("exa", "web_search_exa", 0), observation("exa", "web_fetch_exa", 1)];
  const twoServers = [observation("exa", "web_search_exa", 0), observation("firecrawl", "firecrawl_scrape", 1)];
  assert.equal(oneServer.length, twoServers.length, "the two lists must differ only in a server id");

  assert.equal(countDistinctServers(oneServer), 1);
  assert.equal(countDistinctServers(twoServers), 2);

  const control = declaration({ expectTools: [], maxDistinctServers: 1 });
  assert.equal(matchExpectations(oneServer, control).withinServerBudget, true);
  assert.equal(matchExpectations(twoServers, control).withinServerBudget, false);
});

// --- Test 4: a forbidden tool is a finding regardless of the match ----------

test("a forbidden tool anywhere in the observation list is a finding naming that tool, even when the expectations matched", () => {
  const match = matchExpectations(
    [
      observation("exa", "web_search_exa", 0),
      observation("firecrawl", "firecrawl_search", 1, { outcome: "denied" }),
      observation("firecrawl", "firecrawl_scrape", 2),
    ],
    RESEARCH_CANARY,
  );

  assert.deepEqual([...match.matched], ["web_search_exa", "firecrawl_scrape"]);
  assert.equal(match.ordered, true, "the expected legs did occur in the declared order");
  assert.deepEqual([...match.forbiddenSeen], ["firecrawl_search"]);
  assert.equal(match.held, false, "a forbidden tool must not be absorbed by an otherwise-matching run");
  assert.equal(
    match.reasons.some((reason) => reason.includes("firecrawl_search")),
    true,
    "the finding does not name the forbidden tool that produced it",
  );
});

// --- Test 5: nothing observed is never discovery ----------------------------

test("an empty observation list yields the unverified axis with the empty oracle output fingerprinted, never discovered", async (context: TestContext) => {
  const empty = matchExpectations([], RESEARCH_CANARY);
  assert.equal(empty.observationCount, 0);
  assert.equal(
    empty.reasons.some((reason) => reason.includes("no tool call")),
    true,
    "an empty list must say that nothing crossed the observation front",
  );

  const { project, state, lock } = await runtimeFixture(context);
  const runtime = await createCanaryRuntime({
    projectRoot: project,
    harness: "claude",
    servers: ["exa"],
    stateRoot: state,
    lock,
    environment: {},
  });
  const emptyOutput = createRedactedExcerpt("", createRedactionContext());
  const result = await runCanary({
    declaration: RESEARCH_CANARY,
    harness: "claude",
    projectRoot: project,
    runtime,
    sink: createCanaryObservationSink(runtime),
    environment: {},
    runner: runner(),
    buildLaunchSpec: () => stubLaunchSpec(runtime),
    launcher: async () => ({ ran: true, reason: null, exitCode: 0, excerpt: emptyOutput }),
  });

  assert.equal(result.nativeUse, "unverified");
  assert.notEqual(result.nativeUse, "discovered", "a canary decides the invocation axis and never the discovery axis");
  assert.ok(result.oracle, "a run that launched must carry an oracle record");
  assert.equal(
    result.oracle.stdoutFingerprint,
    createHash("sha256").update("", "utf8").digest("hex"),
    "the empty oracle output was not fingerprinted, so 'nothing came back' and 'nothing was recorded' are the same shape",
  );
  assert.equal(result.oracle.stdoutFingerprint.length, 64);
});

// --- Test 6: a discovery leg that returned nothing ---------------------------

test("a discovery leg that returned zero results is unverified with its reason and carries no invocation record for the leg that never ran", () => {
  // The observable shape of "discovery found nothing": the discovery call
  // crossed the front, the extraction call never did, because there was no URL
  // to extract. The verdict must name the missing leg rather than inventing one.
  const match = matchExpectations([observation("exa", "web_search_exa", 0)], RESEARCH_CANARY);

  assert.deepEqual([...match.matched], ["web_search_exa"]);
  assert.deepEqual([...match.missing], ["firecrawl_scrape"]);
  assert.equal(match.held, false);
  assert.equal(
    match.reasons.some((reason) => reason.includes("firecrawl_scrape")),
    true,
    "the verdict does not name the leg that never ran",
  );

  const verdict = decideInvocation(RESEARCH_CANARY, [observation("exa", "web_search_exa", 0)]);
  assert.equal(verdict.nativeUse, "unverified", "a half-completed route must not read as invoked");
  // The leg that never ran carries NO record. Asserted positively, so the
  // absence is a claim rather than an artefact of a short list.
  assert.equal(
    verdict.matched.includes("firecrawl_scrape"),
    false,
    "the extraction leg that never ran was recorded as matched anyway",
  );
});

// --- The record shape: one field, and it carries no value -------------------

test("the observation record gained exactly one new metadata field, and it records a shape rather than a value", () => {
  const record = observation("context7", "query-docs", 0, { identifierShape: "version-scoped" });
  const serialized = JSON.parse(observationLine(record)) as Record<string, unknown>;

  assert.deepEqual(
    Object.keys(serialized).sort(),
    ["at", "identifierShape", "outcome", "server", "tool", "upstreamVersion"],
    "the serialized record does not carry exactly the five original fields plus one",
  );
  assert.equal(serialized.identifierShape, "version-scoped");
  assert.equal(Object.hasOwn(serialized, "arguments"), false, "a general argument channel was opened");
});

test("a version-scoped identifier's full value is absent from the serialized observation record", () => {
  const identifier = "/vercel/next.js/v16.2.2";
  assert.equal(identifierShapeOf("query-docs", { libraryId: identifier }), "version-scoped");
  assert.equal(identifierShapeOf("query-docs", { libraryId: "/vercel/next.js" }), "unscoped");
  // A tool alpha-AOS declares no identifier argument for is classified as
  // nothing at all, which is what keeps this a declared field rather than a
  // general argument reader.
  assert.equal(identifierShapeOf("firecrawl_scrape", { url: "https://example.invalid/a" }), null);

  // Built from the classifier's own output rather than from a literal, so the
  // absence asserted below is about the path a real call travels.
  const classified = identifierShapeOf("query-docs", { libraryId: identifier });
  assert.ok(classified, "the classifier returned nothing for a declared identifier argument");
  const line = observationLine(observation("context7", "query-docs", 0, { identifierShape: classified }));
  assert.equal(line.includes(identifier), false, "the identifier VALUE reached the serialized record");
  assert.equal(line.includes("next.js"), false, "part of the identifier value reached the serialized record");
  assert.equal(line.includes("version-scoped"), true, "the shape is absent too, so the assertion above proves nothing");

  // And the reader round-trips the shape without ever reconstructing a value.
  const [read] = readObservationRecords(line);
  assert.ok(read);
  assert.equal(read.identifierShape, "version-scoped");
});

test("a reader skips an observation line whose identifier shape is not one this repository declared", () => {
  // Field-selective, exactly as the five original fields are: a line that grew
  // a shape value nobody declared is skipped rather than guessed at.
  const forged = `${JSON.stringify({
    server: "context7",
    tool: "query-docs",
    at: new Date().toISOString(),
    upstreamVersion: "4.0.4",
    outcome: "ok",
    identifierShape: "/vercel/next.js/v16.2.2",
  })}\n`;
  assert.deepEqual(readObservationRecords(forged), [], "a forged shape carrying a value was read as a record");
});

// --- Test 7: one record per triple, and the audit survives replacement ------

test("a second proof for one project-harness-capability triple replaces the first and retains the replaced exact harness version", () => {
  const base = {
    projectId: "project-a",
    harness: "claude" as LedgerHarness,
    capability: "CAPA-02",
    polarity: "positive" as const,
    nativeUse: "unverified" as const,
    blockedReason: null,
    boundInputs: {
      skillSourceHash: "a".repeat(64),
      mcpServerVersion: "3.4.1",
      evidenceHash: "b".repeat(64),
    },
    ancestorFreedom: null,
    observedAt: "2026-09-10T00:00:00.000Z",
    oracle: { command: "harness -p", exitCode: 0, stdoutFingerprint: "c".repeat(64), stderrFingerprint: "d".repeat(64) },
  };
  const first: CapabilityProof = { ...base, harnessVersion: { exact: "2.1.252", minorKey: "2.1", raw: "2.1.252 (Claude Code)" } };
  const second: CapabilityProof = {
    ...base,
    nativeUse: "invoked",
    observedAt: "2026-09-11T00:00:00.000Z",
    harnessVersion: { exact: "2.1.253", minorKey: "2.1", raw: "2.1.253 (Claude Code)" },
  };

  const afterFirst = upsertProof([], first);
  assert.equal(afterFirst.replaced, null);
  const afterSecond = upsertProof(afterFirst.proofs, second);
  assert.ok(afterSecond.replaced, "the second write did not replace anything, so the ledger grew a duplicate row");

  const forTriple = afterSecond.proofs.filter(
    (proof) => proof.projectId === "project-a" && proof.harness === "claude" && proof.capability === "CAPA-02" && proof.polarity === "positive",
  );
  assert.equal(forTriple.length, 1, "the ledger holds more than one record for one triple and polarity");
  const kept = forTriple[0];
  assert.ok(kept);
  assert.equal(kept.nativeUse, "invoked", "the LATER proof must be the one that survives");
  assert.equal(kept.harnessVersion.exact, "2.1.253");
  // D-04: the ledger always records the exact version that was proven, so an
  // audit can still see it after a replacement or a demotion.
  assert.deepEqual(
    [...(kept.supersededHarnessVersions ?? [])],
    ["2.1.252"],
    "the replaced proof's exact harness version was dropped, so an audit cannot see what was proven before",
  );

  // The negative half is a DIFFERENT row of the same unit and must survive: a
  // key without polarity would let a negative control evict its own positive,
  // and D-14's evidence unit could then never be assembled.
  const negative: CapabilityProof = {
    ...base,
    polarity: "negative",
    harnessVersion: { exact: "2.1.253", minorKey: "2.1", raw: "2.1.253 (Claude Code)" },
    ancestorFreedom: { asserted: true, checkedAncestors: ["/tmp/control"] },
  };
  const afterNegative = upsertProof(afterSecond.proofs, negative);
  assert.equal(afterNegative.replaced, null);
  assert.equal(afterNegative.proofs.length, 2);
  assert.equal(pairEvidence(kept, afterNegative.proofs[1] as CapabilityProof).completeness, "COMPLETE");

  // And a different project keys differently rather than colliding.
  const other = upsertProof(afterNegative.proofs, { ...second, projectId: "project-b" });
  assert.equal(other.replaced, null);
  assert.equal(other.proofs.length, 3);
});

test("a replaced proof's superseded versions accumulate rather than overwrite, and null exact versions are not recorded", () => {
  const base = {
    projectId: null,
    harness: "codex" as LedgerHarness,
    capability: "CAPA-01",
    polarity: "positive" as const,
    nativeUse: "unverified" as const,
    blockedReason: null,
    boundInputs: { skillSourceHash: "a".repeat(64), mcpServerVersion: null, evidenceHash: "b".repeat(64) },
    ancestorFreedom: null,
    observedAt: "2026-09-10T00:00:00.000Z",
    oracle: { command: "harness", exitCode: 0, stdoutFingerprint: "c".repeat(64), stderrFingerprint: "d".repeat(64) },
  };
  const version = (exact: string | null): CapabilityProof => ({
    ...base,
    harnessVersion: exact === null ? { exact: null, minorKey: null, raw: "unparsed" } : { exact, minorKey: exact.split(".").slice(0, 2).join("."), raw: exact },
  });

  let proofs = upsertProof([], version("0.1.0")).proofs;
  proofs = upsertProof(proofs, version(null)).proofs;
  proofs = upsertProof(proofs, version("0.3.0")).proofs;
  const kept = proofs[0];
  assert.ok(kept);
  assert.equal(proofs.length, 1);
  // The unparsed one contributes nothing: 03-RESEARCH.md Pitfall 6 records that
  // a harness can print a version line no parser can read, and an audit trail
  // padded with nulls is a trail that says less than an empty one.
  assert.deepEqual([...(kept.supersededHarnessVersions ?? [])], ["0.1.0"]);
  assert.equal(kept.harnessVersion.exact, "0.3.0");
});

// ---------------------------------------------------------------------------
// Plan 03-08 Task 3 — the connection listing's two glyph spellings
//
// Found while evaluating Task 3's precondition read-only. The readiness probe
// reported every genuinely connected server as `unknown`; `claude mcp list`
// prints one glyph in a terminal and a different one when alpha-AOS launches
// it through the bounded process adapter, and only the terminal spelling was
// declared. A rule that can never observe `connected` cannot enforce what the
// catalog's requiresMcpServers says it enforces.
// ---------------------------------------------------------------------------

/**
 * The EXACT stdout `createReadinessRunner`'s connection listing returned on
 * this host, 2026-09-11, transcribed rather than typed from memory. Note the
 * `√` — U+221A — where the same command in a terminal prints `✔`.
 */
const CLAUDE_MCP_LIST_NON_TTY = [
  "Checking MCP server health…",
  "",
  "claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication",
  "context7: C:\\Program Files\\nodejs\\node.exe C:\\npx-cli.js --yes @upstash/context7-mcp@4.0.4 - √ Connected",
  "exa: C:\\Program Files\\nodejs\\node.exe C:\\npx-cli.js --yes exa-mcp-server@3.4.1 - √ Connected",
  "firecrawl: C:\\Program Files\\nodejs\\node.exe D:\\dev\\alpha-AOS\\dist\\src\\cli.js mcp-proxy firecrawl - √ Connected",
  "",
].join("\n");

test("a connected server is read as connected in both glyph spellings the harness prints", () => {
  const terminal = parseClaudeMcpList(CLAUDE_MCP_LIST);
  const nonTty = parseClaudeMcpList(CLAUDE_MCP_LIST_NON_TTY);

  // The terminal spelling, which already worked.
  assert.equal(terminal.find((entry) => entry.server === "context7")?.state, "connected");
  // The spelling alpha-AOS's own launch actually receives. Before this, it was
  // `unknown`, and a connected server that reads as unknown makes the whole
  // connection gate unenforceable rather than merely imprecise.
  assert.equal(nonTty.find((entry) => entry.server === "context7")?.state, "connected");
  assert.equal(nonTty.find((entry) => entry.server === "exa")?.state, "connected");
  assert.equal(nonTty.find((entry) => entry.server === "firecrawl")?.state, "connected");

  // The other two states must not have been widened along with it. `Failed to
  // connect` contains the word `connect`, and a naive unanchored rule would
  // have swallowed it.
  assert.equal(terminal.find((entry) => entry.server === "firecrawl")?.state, "failed");
  assert.equal(nonTty.find((entry) => entry.server === "claude.ai Notion")?.state, "needs-auth");
  assert.deepEqual(
    parseClaudeMcpList("s: cmd - ✗ Failed to connect — CONNECTION_CLOSED: Connection closed"),
    [{ server: "s", state: "failed" }],
    "a failure sentence naming the connection was read as a success",
  );
  // A line with no marker and no word stays unknown rather than defaulting.
  assert.deepEqual(parseClaudeMcpList("s: cmd - starting"), [{ server: "s", state: "unknown" }]);
});

test("the connection gate blocks on a server this host reports as needing authentication", async () => {
  // The positive control for the fix above: `connected` now being observable is
  // only useful if a NON-connected required server still blocks. Driven from
  // the same measured non-TTY listing.
  const canary = declaration({ requiresMcpServers: ["claude.ai Notion"] });
  const report = await probeReadiness({
    harness: "claude",
    canary,
    environment: {},
    runner: runner({ connections: commandResult(CLAUDE_MCP_LIST_NON_TTY) }),
  });
  assert.equal(report.ready, false);
  assert.equal(report.blockedReasons.some((reason) => reason.code === "MCP_SERVER_NOT_CONNECTED"), true);

  const ok = await probeReadiness({
    harness: "claude",
    canary: declaration({ requiresMcpServers: ["context7", "exa", "firecrawl"] }),
    environment: {},
    runner: runner({ connections: commandResult(CLAUDE_MCP_LIST_NON_TTY) }),
  });
  assert.equal(ok.ready, true, "three servers this host reports connected must not block");
  assert.deepEqual(
    ok.connections.filter((entry) => ["context7", "exa", "firecrawl"].includes(entry.server)).map((entry) => entry.state),
    ["connected", "connected", "connected"],
    "the recorded connection states are what a ledger and a report render, so they must be the observed ones",
  );
});

// ---------------------------------------------------------------------------
// Plan 03-12 Task 1: the bounded adapter over the Memory Vault's own envelopes
// ---------------------------------------------------------------------------
//
// Every assertion below drives an INJECTED runner, so nothing here launches the
// vault CLI: the suite stays offline, free and portable. The one live check —
// that the shipped `MEMORY_ENVELOPES` identifiers match what this host's vault
// actually emits — is transcribed into the plan summary rather than run here,
// for the reason 03-08 recorded about live `tools/list` results.

interface RecordedMemoryCommand {
  readonly args: readonly string[];
  readonly stdin: string | null;
  readonly cwd: string;
}

/** A runner that records what it was asked to launch and replies from a table. */
function memoryRunner(
  reply: (command: MemoryCommand) => Partial<MemoryCommandResult>,
  recorded: RecordedMemoryCommand[] = [],
): MemoryRunner {
  return async (command) => {
    recorded.push({ args: [...command.args], stdin: command.stdin, cwd: command.cwd });
    return {
      ran: true,
      reason: null,
      unsupported: null,
      exitCode: 0,
      stdout: "",
      stderr: "",
      ...reply(command),
    };
  };
}

const DOCTOR_ENVELOPE = JSON.stringify({
  schemaVersion: "ecc.memory.doctor.v1",
  ok: true,
  memoryCount: 3,
  invalidFiles: [],
  invalidFileCount: 0,
});

test("the vault doctor envelope is read through its declared schema identifier, and a mismatch is refused naming both", async () => {
  const ok = await memoryDoctor({ cwd: process.cwd(), runner: memoryRunner(() => ({ stdout: DOCTOR_ENVELOPE })) });
  assert.equal(ok.state, "ok");
  assert.equal(ok.state === "ok" ? ok.schemaVersion : null, MEMORY_ENVELOPES.doctor);
  assert.equal(ok.state === "ok" ? ok.value.memoryCount : null, 3);
  assert.equal(ok.state === "ok" ? ok.value.ok : null, true);

  // A version bump must arrive as a refusal, not as `undefined` where a count
  // belongs. Both identifiers are named so the reader knows what moved.
  const bumped = await memoryDoctor({
    cwd: process.cwd(),
    runner: memoryRunner(() => ({
      stdout: JSON.stringify({ schemaVersion: "ecc.memory.doctor.v2", ok: true, memoryCount: 3 }),
    })),
  });
  assert.equal(bumped.state, "unparsed");
  assert.equal(bumped.state === "unparsed" ? bumped.code : null, "ENVELOPE_SCHEMA_MISMATCH");
  const reason = bumped.state === "unparsed" ? bumped.reason : "";
  assert.match(reason, /ecc\.memory\.doctor\.v1/u, "the refusal must name the identifier that was expected");
  assert.match(reason, /ecc\.memory\.doctor\.v2/u, "the refusal must name the identifier that was observed");
});

test("a handoff is written for a named source and target harness and returns the envelope the vault produced", async () => {
  const recorded: RecordedMemoryCommand[] = [];
  const written = await memoryHandoff({
    cwd: process.cwd(),
    source: "codex",
    target: "claude",
    title: "ALPHA-AOS-HANDOFF-CANARY-abc123",
    body: "the work so far",
    runner: memoryRunner(
      () => ({
        stdout: JSON.stringify({
          schemaVersion: "ecc.memory.write.v1",
          memory: {
            id: "mem_20260911_0000",
            title: "ALPHA-AOS-HANDOFF-CANARY-abc123",
            kind: "handoff",
            scope: "project",
            sourceHarness: "codex",
            targetHarnesses: ["claude"],
          },
          path: "project:handoffs/mem_20260911_0000.md",
        }),
      }),
      recorded,
    ),
  });

  assert.equal(written.state, "ok");
  assert.equal(written.state === "ok" ? written.schemaVersion : null, MEMORY_ENVELOPES.write);
  assert.equal(written.state === "ok" ? written.value.memory.id : null, "mem_20260911_0000");
  assert.equal(written.state === "ok" ? written.value.memory.sourceHarness : null, "codex");
  assert.deepEqual(written.state === "ok" ? written.value.memory.targetHarnesses : null, ["claude"]);
  assert.equal(written.state === "ok" ? written.value.path : null, "project:handoffs/mem_20260911_0000.md");

  const args = recorded.at(0)?.args ?? [];
  assert.deepEqual(args.slice(0, 2), ["memory", "handoff"], "the write primitive is the vault's own handoff verb");
  assert.equal(args.includes("--from"), true);
  assert.equal(args[args.indexOf("--from") + 1], "codex");
  assert.equal(args.includes("--target"), true);
  assert.equal(args[args.indexOf("--target") + 1], "claude");
  assert.equal(args.includes("--json"), true, "the closed envelope is what is parsed, never human text");
});

test("a filtered recall returns only the entries whose target is the named harness", async () => {
  const recorded: RecordedMemoryCommand[] = [];
  const found = await memorySearch({
    cwd: process.cwd(),
    targetHarness: "claude",
    runner: memoryRunner(
      (command) => ({
        stdout: JSON.stringify({
          schemaVersion: "ecc.memory.search.v1",
          query: "",
          results: [
            {
              memory: {
                id: "mem_a",
                title: "for claude",
                kind: "handoff",
                scope: "project",
                sourceHarness: "codex",
                targetHarnesses: [command.args[command.args.indexOf("--target-harness") + 1] ?? "?"],
              },
              score: 0,
              excerpt: "a body that must not survive into the record",
            },
          ],
        }),
      }),
      recorded,
    ),
  });

  assert.equal(found.state, "ok");
  assert.equal(found.state === "ok" ? found.schemaVersion : null, MEMORY_ENVELOPES.search);
  const results = found.state === "ok" ? found.value.results : [];
  assert.equal(results.length, 1);
  assert.deepEqual(results[0]?.targetHarnesses, ["claude"], "the filter the caller named is the one that was sent");
  // The body excerpt is USER CONTENT and has no field to land in. Serializing
  // the whole result and searching it is the check that survives a refactor.
  assert.equal(
    JSON.stringify(found).includes("a body that must not survive into the record"),
    false,
    "a search result's body excerpt must not enter the parsed record",
  );

  const args = recorded.at(0)?.args ?? [];
  assert.deepEqual(args.slice(0, 2), ["memory", "search"]);
  assert.equal(args[args.indexOf("--target-harness") + 1], "claude");
});

test("the memory adapter makes no direct child-process call and travels the bounded process adapter", async () => {
  const source = await readFile(join(repositoryRoot, "src", "adapters", "unified-memory.ts"), "utf8");
  const code = source
    .split(/\r?\n/u)
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/u.test(line))
    .join("\n");

  assert.equal(
    /child_process/u.test(code),
    false,
    "a direct child-process import here would make the vault the one command that escapes the process boundary",
  );
  assert.equal(/\bspawnSync?\s*\(/u.test(code), false, "no direct spawn");
  assert.equal(/\bexecFile\b|\bexecSync\b/u.test(code), false, "no direct exec");
  // The positive control: the check above is only meaningful if this file really
  // does launch something, and does it through the bounded adapter.
  assert.equal(/runProcess\(/u.test(code), true, "the adapter must launch through runProcess");
  assert.equal(/environment:\s*commandProbeEnvironment\(/u.test(code), true, "with a DECLARED environment");
});

test("a handoff body travels the non-argument input path and its sentinel never reaches the recorded arguments", async () => {
  const sentinel = "SENTINEL-BODY-VALUE-9f3c2ae1";
  const recorded: RecordedMemoryCommand[] = [];
  await memoryHandoff({
    cwd: process.cwd(),
    source: "codex",
    target: "claude",
    title: "a handoff",
    body: `context before\n${sentinel}\ncontext after`,
    runner: memoryRunner(
      () => ({
        stdout: JSON.stringify({
          schemaVersion: "ecc.memory.write.v1",
          memory: {
            id: "mem_b",
            title: "a handoff",
            kind: "handoff",
            scope: "project",
            sourceHarness: "codex",
            targetHarnesses: ["claude"],
          },
          path: "project:handoffs/mem_b.md",
        }),
      }),
      recorded,
    ),
  });

  const command = recorded.at(0);
  assert.notEqual(command, undefined);
  assert.equal(
    (command?.args ?? []).join(" ").includes(sentinel),
    false,
    "an argument list is the one place a value reliably reaches a process listing and a shell history",
  );
  assert.equal((command?.args ?? []).includes("--stdin"), true, "the vault's non-argument input path is declared");
  assert.equal(
    (command?.stdin ?? "").includes(sentinel),
    true,
    "the body must actually have been delivered — a check that passes because nothing was sent is vacuous",
  );
});

test("an absent vault CLI is unsupported with its reason and an unreadable envelope is unparsed, never a success", async () => {
  const absent = await memoryDoctor({
    cwd: process.cwd(),
    runner: async () => ({
      ran: false,
      reason: "ecc did not resolve on PATH",
      unsupported: "COMMAND_ABSENT" as const,
      exitCode: null,
      stdout: "",
      stderr: "",
    }),
  });
  assert.equal(absent.state, "unsupported", "an absent tool is not an absent capability, and it is not a failure either");
  assert.equal(absent.state === "unsupported" ? absent.code : null, "COMMAND_ABSENT");
  assert.match(absent.state === "unsupported" ? absent.reason : "", /PATH/u);

  const garbage = await memorySearch({
    cwd: process.cwd(),
    runner: memoryRunner(() => ({ stdout: "not json at all", stderr: "warning: something" })),
  });
  assert.equal(garbage.state, "unparsed");
  assert.equal(garbage.state === "unparsed" ? garbage.code : null, "ENVELOPE_NOT_JSON");
  assert.match(
    garbage.state === "unparsed" ? garbage.stdoutFingerprint : "",
    /^[0-9a-f]{64}$/u,
    "an unreadable envelope is recorded as a fingerprint, never as bytes",
  );
  assert.match(garbage.state === "unparsed" ? garbage.stderrFingerprint : "", /^[0-9a-f]{64}$/u);

  const failed = await memoryHandoff({
    cwd: process.cwd(),
    source: "codex",
    target: "claude",
    title: "t",
    body: "b",
    runner: async () => ({ ran: false, reason: "exit 1", unsupported: null, exitCode: 1, stdout: "", stderr: "boom" }),
  });
  assert.equal(failed.state, "unparsed", "a non-zero exit is a refusal, never a fabricated write");
  assert.equal(failed.state === "unparsed" ? failed.code : null, "COMMAND_FAILED");
});

// ---------------------------------------------------------------------------
// Plan 03-12 Task 2: the planning-tree immutability check
// ---------------------------------------------------------------------------

/** A small planning tree with nested directories, built under a fresh root. */
async function planningFixture(
  context: TestContext,
  files: Readonly<Record<string, string>>,
  prefix = "alpha-aos-planning-",
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  context.after(async () => rm(root, { recursive: true, force: true }));
  for (const [relativePath, body] of Object.entries(files)) {
    const target = join(root, ...relativePath.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body, "utf8");
  }
  return root;
}

const PLANNING_FILES = Object.freeze({
  "STATE.md": "current plan: 12\n",
  "ROADMAP.md": "phase 3\n",
  "phases/03-x/03-12-PLAN.md": "the plan\n",
  "phases/03-x/notes/deferred.md": "one item\n",
});

test("two consecutive digests over an unchanged planning tree are identical", async (context) => {
  const root = await planningFixture(context, PLANNING_FILES);
  const first = await hashPlanningTree(root);
  const second = await hashPlanningTree(root);

  assert.equal(first.complete, true, `bounds: ${first.bounds.join(", ")}; unreadable: ${first.unreadable.length}`);
  assert.equal(first.rootPresent, true);
  assert.equal(typeof first.digest, "string");
  assert.match(first.digest ?? "", /^[0-9a-f]{64}$/u);
  assert.equal(first.digest, second.digest, "the same bytes must hash the same twice, or nothing downstream means anything");
  assert.equal(first.files.length, 4);
  assert.deepEqual(
    first.files.map((entry) => entry.path),
    ["ROADMAP.md", "STATE.md", "phases/03-x/03-12-PLAN.md", "phases/03-x/notes/deferred.md"],
    "relative POSIX paths, sorted in code-point order",
  );

  const difference = comparePlanningTrees(first, second);
  assert.equal(difference.comparable, true);
  assert.equal(difference.equal, true);
  assert.deepEqual([...difference.modified, ...difference.added, ...difference.removed], []);
});

test("changing one byte under the planning tree moves the digest and names the file that moved", async (context) => {
  const root = await planningFixture(context, PLANNING_FILES);
  const before = await hashPlanningTree(root);
  await writeFile(join(root, "phases", "03-x", "03-12-PLAN.md"), "the plan, edited\n", "utf8");
  const after = await hashPlanningTree(root);

  assert.notEqual(before.digest, after.digest, "a changed byte that leaves the digest alone is not a check");
  const difference = comparePlanningTrees(before, after);
  assert.equal(difference.comparable, true);
  assert.equal(difference.equal, false);
  assert.deepEqual(difference.modified, ["phases/03-x/03-12-PLAN.md"], "a report that will not name the file is not actionable");
  assert.deepEqual([...difference.added, ...difference.removed], []);
  assert.equal(difference.reasons.length > 0, true);
});

test("adding a file and removing a file each move the digest and name the path", async (context) => {
  const root = await planningFixture(context, PLANNING_FILES);
  const before = await hashPlanningTree(root);

  await writeFile(join(root, "phases", "03-x", "03-12-SUMMARY.md"), "a summary\n", "utf8");
  const grown = await hashPlanningTree(root);
  assert.notEqual(before.digest, grown.digest);
  const addition = comparePlanningTrees(before, grown);
  assert.deepEqual(addition.added, ["phases/03-x/03-12-SUMMARY.md"]);
  assert.deepEqual([...addition.modified, ...addition.removed], []);
  assert.equal(addition.equal, false);

  await rm(join(root, "STATE.md"));
  const shrunk = await hashPlanningTree(root);
  const removal = comparePlanningTrees(grown, shrunk);
  assert.deepEqual(removal.removed, ["STATE.md"]);
  assert.deepEqual([...removal.modified, ...removal.added], []);
  assert.equal(removal.equal, false);
});

test("a path under the planning tree that cannot be read is undecidable with its errno, and the digest is incomplete", async (context) => {
  const root = await planningFixture(context, PLANNING_FILES);
  // A dangling link: created on every platform this repository supports
  // (`junction` on Windows, an ordinary symlink elsewhere), reported by readdir
  // as a non-directory, and refused by readFile with a real errno. That is the
  // shape an unreadable planning file has, produced portably.
  await symlink(join(root, "does-not-exist"), join(root, "phases", "03-x", "dangling.md"), "junction");

  const digest = await hashPlanningTree(root);
  assert.equal(digest.complete, false, "an aggregate over a partial set must never be presented as an answer");
  assert.equal(digest.digest, null, "the digest is withheld, not computed over what happened to be readable");
  assert.equal(digest.unreadable.length, 1);
  assert.equal(digest.unreadable[0]?.path, "phases/03-x/dangling.md", "the unreadable path is named");
  assert.match(digest.unreadable[0]?.errno ?? "", /^(E[A-Z]+|NOT_A_REGULAR_FILE)$/u, "with the reason it could not be read");

  // And an incomplete digest is not silently comparable: two partial sets that
  // happen to agree prove nothing about the files neither of them read.
  const complete = await hashPlanningTree(await planningFixture(context, PLANNING_FILES, "alpha-aos-planning-b-"));
  const difference = comparePlanningTrees(digest, complete);
  assert.equal(difference.comparable, false);
  assert.equal(difference.equal, false);
  assert.equal(
    difference.reasons.some((reason) => /incomplete/iu.test(reason)),
    true,
    `reasons were ${JSON.stringify(difference.reasons)}`,
  );
});

test("the same planning content under two different directory names produces the same digest", async (context) => {
  const left = await planningFixture(context, PLANNING_FILES, "alpha-aos-planning-left-");
  const right = await planningFixture(context, PLANNING_FILES, "alpha-aos-planning-right-");

  const a = await hashPlanningTree(left);
  const b = await hashPlanningTree(right);
  assert.equal(a.complete && b.complete, true);
  assert.equal(
    a.digest,
    b.digest,
    "a digest that carried the absolute root, the host's separator or directory order would differ here",
  );
  assert.deepEqual(a.files.map((entry) => entry.path), b.files.map((entry) => entry.path));
  assert.equal(
    a.files.every((entry) => !entry.path.includes("\\")),
    true,
    "separators are normalised to POSIX so a Windows digest matches a Linux one",
  );
  assert.equal(comparePlanningTrees(a, b).equal, true);
});

test("hashing the planning tree writes nothing: bytes and modification times are identical afterwards", async (context) => {
  const root = await planningFixture(context, PLANNING_FILES);

  async function snapshot(): Promise<string[]> {
    const rows: string[] = [];
    for (const relativePath of Object.keys(PLANNING_FILES).sort()) {
      const target = join(root, ...relativePath.split("/"));
      const info = await stat(target);
      const bytes = await readFile(target, "utf8");
      rows.push(`${relativePath} ${info.mtimeMs} ${info.size} ${createHash("sha256").update(bytes).digest("hex")}`);
    }
    return rows;
  }

  const before = await snapshot();
  await hashPlanningTree(root);
  await hashPlanningTree(root);
  const after = await snapshot();

  assert.deepEqual(after, before, "a check that modified the thing it measures would be worse than no check");
  // Nothing new appeared either — a scratch file beside the tree would be a
  // write the mtime comparison above cannot see.
  const entries = await readdir(root, { recursive: true });
  assert.deepEqual(
    entries.map((entry) => String(entry).split("\\").join("/")).sort(),
    [
      "ROADMAP.md",
      "STATE.md",
      "phases",
      "phases/03-x",
      "phases/03-x/03-12-PLAN.md",
      "phases/03-x/notes",
      "phases/03-x/notes/deferred.md",
    ],
  );
});

// ---------------------------------------------------------------------------
// Plan 03-12 Task 3: the handoff canary — one run, both halves
// ---------------------------------------------------------------------------

interface FakeVault {
  readonly runner: MemoryRunner;
  readonly recorded: RecordedMemoryCommand[];
  count: () => number;
}

/**
 * A vault whose whole state is in this process.
 *
 * `onWrite` is the seam that makes the negative half falsifiable: it fires
 * between the two planning-tree digests, which is exactly where a memory tool
 * that DID reach into `.planning/` would do its damage.
 */
function fakeVault(options: { readonly start?: number; readonly onWrite?: () => Promise<void> | void } = {}): FakeVault {
  let count = options.start ?? 0;
  const entries: { title: string; target: string; source: string }[] = [];
  const recorded: RecordedMemoryCommand[] = [];

  const ok = (document: unknown): MemoryCommandResult => ({
    ran: true,
    reason: null,
    unsupported: null,
    exitCode: 0,
    stdout: JSON.stringify(document),
    stderr: "",
  });
  const memoryOf = (entry: { title: string; target: string; source: string }, id: string): unknown => ({
    id,
    title: entry.title,
    kind: "handoff",
    scope: "project",
    sourceHarness: entry.source,
    targetHarnesses: [entry.target],
  });

  const runner: MemoryRunner = async (command) => {
    recorded.push({ args: [...command.args], stdin: command.stdin, cwd: command.cwd });
    const value = (flag: string): string => command.args[command.args.indexOf(flag) + 1] ?? "";
    switch (command.args[1]) {
      case "doctor":
        return ok({ schemaVersion: "ecc.memory.doctor.v1", ok: true, memoryCount: count, invalidFileCount: 0 });
      case "handoff": {
        await options.onWrite?.();
        const entry = { title: value("--title"), target: value("--target"), source: value("--from") };
        entries.push(entry);
        count += 1;
        return ok({
          schemaVersion: "ecc.memory.write.v1",
          memory: memoryOf(entry, `mem_${entries.length}`),
          path: `project:handoffs/mem_${entries.length}.md`,
        });
      }
      case "search": {
        const target = value("--target-harness");
        return ok({
          schemaVersion: "ecc.memory.search.v1",
          query: "",
          results: entries
            .map((entry, index) => ({ entry, id: `mem_${index + 1}` }))
            .filter(({ entry }) => entry.target === target)
            .map(({ entry, id }) => ({ memory: memoryOf(entry, id), score: 0, excerpt: "a body" })),
        });
      }
      default:
        return { ran: false, reason: "unknown verb", unsupported: null, exitCode: 1, stdout: "", stderr: "" };
    }
  };

  return { runner, recorded, count: () => count };
}

/** Every declared harness resolves. The suite never depends on what a host has. */
const everyHarnessResolves = (harness: LedgerHarness): string | null => `/fake/${harness}`;

async function handoffDeclaration(): Promise<CanaryDeclaration> {
  const catalog = await shippedCatalog();
  const found = catalog.canaries.find((entry) => entry.id === HANDOFF_CANARY_ID);
  assert.notEqual(found, undefined, `the shipped catalog does not declare ${HANDOFF_CANARY_ID}`);
  return found as CanaryDeclaration;
}

test("the handoff canary is declared in the shipped catalog and names neither a harness pair nor a tool", async () => {
  const declaration = await handoffDeclaration();
  assert.equal(declaration.capability, HANDOFF_CAPABILITY);
  assert.deepEqual([...declaration.expectTools], []);
  assert.deepEqual([...declaration.harnesses], ["claude"], "only claude can host a canary runtime (plan 03-06)");
  assert.equal(declaration.readOnly, true);

  // The prompt must read as an ordinary handover. The wider hygiene test already
  // walks every declaration against the lock; this one names the terms a handoff
  // prompt is specifically tempted to leak.
  for (const term of ["ecc", "memory", "vault", "unified-memory", "handoff", "search", "skill", "mcp"]) {
    assert.equal(
      promptNamesTerm(declaration.prompt, term),
      false,
      `the handoff prompt names "${term}", which is the reword this catalog exists to make visible`,
    );
  }
  // `--capability handoff` resolves through the DECLARED alias table.
  assert.equal(resolveCapabilityFilter("handoff"), HANDOFF_CAPABILITY);
  assert.equal(resolveCapabilityFilter("HANDOFF"), HANDOFF_CAPABILITY);
  assert.equal(resolveCapabilityFilter("CAPA-01"), "CAPA-01", "an unaliased value passes through untouched");
  assert.equal(resolveCapabilityFilter(null), null);
});

test("a handoff run pairs the vault positive with the planning-tree negative into one COMPLETE unit", async (context) => {
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault({ start: 4 });
  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    resolveHarness: everyHarnessResolves,
    harnessVersions: { claude: harnessMinorKey("2.1.267"), hermes: harnessMinorKey("0.20.6") },
    now: () => new Date("2026-09-11T00:00:00.000Z"),
  });

  // The pair, and both exact versions — a result that does not say which two
  // harnesses were involved is uninterpretable.
  assert.deepEqual(result.pair, HANDOFF_HARNESS_PAIRS[0], "the preferred declared pair should have been chosen");
  assert.equal(result.harnessVersions.source, "0.20.6");
  assert.equal(result.harnessVersions.target, "2.1.267");

  // The positive: increased by EXACTLY one against a baseline taken in this run,
  // and the filtered recall returned the sentinel.
  assert.equal(result.vaultBefore, 4);
  assert.equal(result.vaultAfter, 5);
  assert.equal(result.recalled, true);
  assert.match(result.sentinelTitle ?? "", /^ALPHA-AOS-HANDOFF-CANARY-/u);
  assert.equal(result.positive?.polarity, "positive");
  assert.equal(result.positive?.nativeUse, "discovered", "a vault recall proves the context is reachable, not invoked");

  // The negative: BOTH digests, present and equal.
  const witness = result.negative?.immutabilityWitness ?? null;
  assert.notEqual(witness, null);
  assert.equal(witness?.asserted, true);
  assert.equal(witness?.complete, true);
  assert.match(witness?.beforeDigest ?? "", /^[0-9a-f]{64}$/u);
  assert.equal(witness?.beforeDigest, witness?.afterDigest, "the unit must carry two digests, and they must be equal");
  assert.deepEqual([...(witness?.changedPaths ?? [])], []);
  assert.equal(result.planningDifference?.equal, true);

  assert.equal(result.unit?.completeness, "COMPLETE", result.unit?.summary);
  assert.equal(result.unit?.nativeUse, "discovered");
  assert.equal(result.outcome, "ready");

  // The receiving leg is the one that spends, and it was not requested.
  assert.equal(result.receiving, null);
  assert.match(result.receivingSkippedReason ?? "", /spends a model turn/u);
});

test("a planning file that moves during the handoff makes the negative fail and the unit INCOMPLETE, naming the file", async (context) => {
  // The falsification test the whole negative half rests on. Without it, "the
  // planning tree did not change" is an assertion that passes because nothing
  // was ever capable of changing it — vacuous by construction.
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault({
    start: 0,
    onWrite: async () => {
      // Exactly what a memory tool treating its content as authoritative policy
      // would do, at exactly the moment it would do it.
      await writeFile(join(planningRoot, "STATE.md"), "current plan: 12\nrewritten from a memory\n", "utf8");
    },
  });

  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    resolveHarness: everyHarnessResolves,
  });

  // The positive still holds — the handoff really did happen. That is the point:
  // the two halves are independent, and only the pairing makes the claim.
  assert.notEqual(result.positive, null, "the positive half must be unaffected, or the test proves the wrong thing");
  assert.equal(result.recalled, true);

  const witness = result.negative?.immutabilityWitness ?? null;
  assert.equal(witness?.asserted, false, "a changed planning tree that still asserts immutability is the whole failure");
  assert.deepEqual([...(witness?.changedPaths ?? [])], ["STATE.md"], "the witness must name the file that moved");
  assert.equal(result.planningDifference?.equal, false);
  assert.notEqual(result.planningBefore?.digest, result.planningAfter?.digest);

  assert.equal(result.unit?.completeness, "INCOMPLETE");
  assert.equal(result.unit?.nativeUse, null, "an INCOMPLETE unit never reports the positive's axis");
  assert.equal(
    result.unit?.incompleteReasons.some((reason) => reason.includes("STATE.md")),
    true,
    `reasons were ${JSON.stringify(result.unit?.incompleteReasons)}`,
  );
  assert.equal(
    formatHandoffEvidence(result).some((line) => line.startsWith("HANDOFF PLANNING") && line.includes("STATE.md")),
    true,
    "the rendered report must name the file, not merely say the tree changed",
  );
});

test("a handoff whose recall does not return the sentinel yields no positive, and the unit says which half is missing", async (context) => {
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  // A vault that writes but addresses the memory to somebody else: the filtered
  // recall for the target then returns nothing, which is the case a check that
  // only counted memories would have passed.
  const vault = fakeVault();
  const misdirected: MemoryRunner = async (command) => {
    const args = command.args.map((value, index) =>
      index === command.args.indexOf("--target") + 1 && command.args[1] === "handoff" ? "somebody-else" : value,
    );
    return vault.runner({ ...command, args });
  };

  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: misdirected,
    resolveHarness: everyHarnessResolves,
  });

  assert.equal(result.vaultAfter, 1, "the memory count still grew, which is exactly why a count alone is not the check");
  assert.equal(result.recalled, false);
  assert.equal(result.recallCount, 0);
  assert.equal(result.positive, null);
  assert.equal(result.unit?.completeness, "INCOMPLETE");
  assert.equal(result.unit?.missingHalf, "positive", "the unit must name WHICH half is missing");
  assert.equal(result.outcome, "unverified", "not attempted is not the same as blocked");
  // The negative half was still taken and is still asserted: the planning tree
  // genuinely did not move, and saying otherwise would be a second error.
  assert.equal(result.negative?.immutabilityWitness?.asserted, true);
});

test("a vault that gained TWO memories yields no positive: the claim is exactly one, not at least one", async (context) => {
  // The arithmetic has to be exact. A vault that gained two during one canary
  // means something else wrote as well, and a proof that binds a handoff to a
  // count nobody can attribute is not evidence about this handoff.
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault();
  const writesTwice: MemoryRunner = async (command) => {
    const first = await vault.runner(command);
    if (command.args[1] !== "handoff") return first;
    // A second, unrelated write lands in the same window.
    await vault.runner({ ...command, args: command.args.map((v, i) => (i === command.args.indexOf("--title") + 1 ? "an unrelated memory" : v)) });
    return first;
  };

  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: writesTwice,
    resolveHarness: everyHarnessResolves,
  });

  assert.equal(result.vaultBefore, 0);
  assert.equal(result.vaultAfter, 2, "the fixture must really have written twice, or this proves nothing");
  assert.equal(result.recalled, true, "the sentinel IS recallable — only the arithmetic is wrong");
  assert.equal(result.positive, null, "at-least-one would have passed here; exactly-one is what is claimed");
  assert.equal(result.unit?.completeness, "INCOMPLETE");
});

test("a host that cannot run two harnesses records blocked with the requirement named, and nothing is attempted", async (context) => {
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault();
  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    // Only the target resolves. A handoff measured with one harness would be a
    // harness talking to itself.
    resolveHarness: (harness) => (harness === "claude" ? "/fake/claude" : null),
  });

  assert.equal(result.outcome, "blocked");
  assert.equal(result.pair, null);
  assert.equal(result.blockedReasons[0]?.code, "HANDOFF_PAIR_UNAVAILABLE");
  assert.match(result.blockedReasons[0]?.nextAction ?? "", /TWO harnesses/u);
  assert.equal(vault.recorded.length, 0, "the run must not be attempted: nothing was written to the vault");
  assert.equal(result.planningBefore, null, "and nothing was hashed either");
  assert.equal(
    result.pairResolution.considered.length,
    HANDOFF_HARNESS_PAIRS.length,
    "every declared pair must be reported as considered, or the choice is unauditable",
  );
});

test("the handoff report names both harnesses with their versions and states the scope limit last", async (context) => {
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault();
  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    resolveHarness: everyHarnessResolves,
    harnessVersions: { claude: harnessMinorKey("2.1.267"), hermes: harnessMinorKey("0.20.6") },
  });

  const lines = formatHandoffEvidence(result);
  const pairLine = lines.find((line) => line.startsWith("HANDOFF PAIR")) ?? "";
  assert.match(pairLine, /hermes 0\.20\.6/u, "the source harness and its exact version");
  assert.match(pairLine, /claude 2\.1\.267/u, "the target harness and its exact version");

  const vaultLine = lines.find((line) => line.startsWith("HANDOFF VAULT")) ?? "";
  assert.match(vaultLine, /before 0, after 1/u);
  assert.match(vaultLine, new RegExp(result.sentinelTitle ?? "IMPOSSIBLE", "u"));
  assert.match(lines.find((line) => line.startsWith("HANDOFF RECALL")) ?? "", /DID include the sentinel/u);
  assert.match(lines.find((line) => line.startsWith("HANDOFF PLANNING")) ?? "", /byte-for-byte identical/u);

  // The scope limit is the last thing a reader sees, and it says what was NOT
  // proven rather than leaving it to be assumed.
  const last = lines.at(-1) ?? "";
  assert.equal(last.startsWith("HANDOFF SCOPE"), true, `the last line was ${JSON.stringify(last)}`);
  assert.match(last, /did NOT observe or restrict what the memory tool did elsewhere/u);
  assert.match(last, /invocation proxy/u);
  assert.equal(last.includes(HANDOFF_SCOPE_LIMIT), true);
  // And the scope limit rides on the ledger row too, so it survives the report.
  assert.equal(result.negative?.immutabilityWitness?.scopeLimit, HANDOFF_SCOPE_LIMIT);
});

test("the memory-handoff steering instruction is materialized for CAPA-03 and for nothing else", async () => {
  const forHandoff = ownedInstructionsFor(HANDOFF_CAPABILITY).map((entry) => entry.id);
  const forDocumentation = ownedInstructionsFor("CAPA-01").map((entry) => entry.id);
  const forNothing = ownedInstructionsFor(null).map((entry) => entry.id);

  assert.equal(forHandoff.includes(MEMORY_HANDOFF_INSTRUCTION_ID), true);
  assert.equal(
    forDocumentation.includes(MEMORY_HANDOFF_INSTRUCTION_ID),
    false,
    "handing this instruction to the documentation canary would quietly change the run whose job is to show what a " +
      "harness does WITHOUT being pointed at anything",
  );
  assert.equal(forNothing.includes(MEMORY_HANDOFF_INSTRUCTION_ID), false);
  // The unscoped research-routing instruction still reaches every run.
  assert.equal(forDocumentation.length >= 1, true);
  assert.equal(forNothing.length, forDocumentation.length);

  // The instruction exists where the runtime will look for it, or a runtime
  // build REFUSES — the refusal plan 03-08 added.
  const source = await readFile(join(repositoryRoot, "skills", "alpha-aos-memory-handoff", "SKILL.md"), "utf8");
  assert.match(source, /^---\r?\nname: alpha-aos-memory-handoff\r?\n/u);
  assert.match(source, /ecc memory search --json --target-harness/u, "it has to say HOW to read a handoff");
  assert.match(source, /never executable policy/u, "and that a memory is not policy");
  assert.match(source, /\.planning/u, "and that the planning tree is not its to write");
});

test("an unavailable preferred pair falls back to the declared fallback, and the row says which pair actually ran", async (context) => {
  // Only the fallback source is present. A result that did not say which two
  // harnesses were involved would be uninterpretable, so the fallback has to be
  // visible in the resolution AND in the rendered row.
  const withoutHermes = (harness: LedgerHarness): string | null => (harness === "hermes" ? null : `/fake/${harness}`);
  const resolution = resolveHandoffPair({ resolveHarness: withoutHermes });
  assert.deepEqual(resolution.pair, HANDOFF_HARNESS_PAIRS[1], "the declared fallback pair should have been chosen");
  assert.deepEqual(
    resolution.considered.map((entry) => [entry.pair.source, entry.sourceResolved]),
    [
      ["hermes", false],
      ["codex", true],
    ],
    "every pair considered is recorded, so the choice is auditable rather than a guess",
  );
  assert.deepEqual([...resolution.blockedReasons], []);

  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault();
  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    resolveHarness: withoutHermes,
    harnessVersions: { claude: harnessMinorKey("2.1.267"), codex: harnessMinorKey("0.152.0") },
  });
  assert.equal(result.pair?.source, "codex");
  assert.match(
    formatHandoffEvidence(result).find((line) => line.startsWith("HANDOFF PAIR")) ?? "",
    /source codex 0\.152\.0, target claude 2\.1\.267/u,
  );

  // The rendering layer is where a green-looking result has relapsed before, so
  // the row is asserted directly rather than inferred from the result.
  const row = handoffRow(result, "supported");
  assert.equal(row.harness, "claude", "the row's harness is the RECEIVING one");
  assert.equal(row.capability, `${HANDOFF_CAPABILITY} (${HANDOFF_CANARY_ID})`);
  assert.equal(row.completeness, "COMPLETE");
  assert.equal(row.axes.nativeUse, "discovered");
  assert.equal(row.blockedReason, null);
  assert.match(row.axisNotes.nativeUse ?? "", /spends a model turn/u, "the unrun receiving leg is the first thing a reader needs");
  assert.equal(
    formatCapabilityReport("Invocation canaries", [row], formatHandoffEvidence(result)).includes(HANDOFF_SCOPE_LIMIT),
    true,
    "the scope limit must survive into the rendered report, not only the result object",
  );
});

test("both handoff proofs survive the ledger write-then-read round trip", async (context) => {
  // The property whose absence let plan 03-08's ledger-bricking defect ship, and
  // which this plan hit again one field over: a proof that is WRITABLE but not
  // READABLE turns a one-shot command into one that refuses its own file for
  // ever after. Asserting the round trip is the only thing that catches it.
  const planningRoot = await planningFixture(context, PLANNING_FILES);
  const vault = fakeVault();
  const result = await runHandoffCanary({
    declaration: await handoffDeclaration(),
    projectRoot: dirname(planningRoot),
    planningRoot,
    memoryRunner: vault.runner,
    resolveHarness: everyHarnessResolves,
  });

  const proofs = [result.positive, result.negative].filter((proof): proof is CapabilityProof => proof !== null);
  assert.equal(proofs.length, 2, "both halves of the unit must reach the ledger, or nobody can reassemble it later");

  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-handoff-ledger-"));
  context.after(async () => rm(stateRoot, { recursive: true, force: true }));
  const write = await writeCapabilityLedger({
    stateRoot,
    ledger: {
      schemaVersion: CAPABILITY_LEDGER_SCHEMA_VERSION,
      producer: { name: "alpha-aos", version: "0.1.0" },
      updatedAt: new Date().toISOString(),
      proofs,
    },
  });
  assert.equal(write.status, "written");

  const read = await readCapabilityLedger(write.path);
  assert.equal(read.state, "present", read.state === "unreadable" ? JSON.stringify(read.issues) : read.state);
  const negative = read.state === "present" ? read.ledger.proofs.find((proof) => proof.polarity === "negative") : null;
  assert.equal(negative?.immutabilityWitness?.asserted, true, "the witness must survive the round trip, not just the write");
  assert.equal(negative?.immutabilityWitness?.beforeDigest, result.negative?.immutabilityWitness?.beforeDigest);
  assert.equal(negative?.immutabilityWitness?.scopeLimit, HANDOFF_SCOPE_LIMIT);
  // And the pair reassembles into the same unit it was written from.
  const positive = read.state === "present" ? read.ledger.proofs.find((proof) => proof.polarity === "positive") : null;
  assert.equal(pairEvidence(positive ?? null, negative ?? null).completeness, "COMPLETE");
});

test("a no-spend sweep records every spending leg unverified with its reason, and never blocked", async () => {
  const catalog = await shippedCatalog();
  const announced: string[] = [];
  const sweep = await runCanarySweep({
    catalog,
    spend: false,
    announce: (line) => announced.push(line),
    run: async () => {
      throw new Error("a no-spend sweep must not run a leg that spends");
    },
  });

  assert.equal(sweep.results.length, 0);
  assert.equal(sweep.skipped.length, sweep.selections.length, "every selection must be accounted for");
  assert.equal(
    announced.some((line) => line.includes("--no-spend")),
    true,
    "a no-spend run announces itself with the cost lines, before anything starts",
  );

  const rows = sweep.skipped.map((entry) => skippedCanaryRow(entry, "supported"));
  for (const row of rows) {
    assert.equal(row.axes.nativeUse, "unverified");
    assert.deepEqual(row.claimNotes, [], "skipped canaries have no claim to qualify");
    assert.equal(row.blockedReason, null, "D-12: not attempted is not a known, actionable cause a user can clear");
    assert.match(row.axisNotes.nativeUse ?? "", /not attempted|no handoff runner/u);
    assert.equal(row.notRunReason, null, "nobody asked to spend is an axis note, not a reason nothing could run");
    assert.equal(
      formatCapabilityReport("Invocation canaries", [row], []).includes("NOT-RUN"),
      false,
      "a deliberately skipped paid canary rendered as though its discovery leg could not run",
    );
  }
});
