// Plan 03-05: `catalog/canaries.yaml` is the single authority for every prompt
// a canary run may put in front of a model, and `probeReadiness` is the single
// authority for whether a capability is `blocked` or merely `unverified`.
//
// These assertions run the loaders and probes directly rather than the CLI,
// because the seams under test are the declared-data boundary and the
// pre-probe. Nothing here launches a harness: every command result is supplied,
// so the suite is offline, free, and portable to the three-OS matrix.

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { ManagedDocumentError } from "../src/core/catalog.js";
import {
  assertCanaryContext,
  BLOCKED_CODES,
  CANARY_CATALOG_FILE,
  CANARY_IN_PREVIEW_CONTEXT,
  canaryCosts,
  canaryCostsModelTurn,
  CanaryContextError,
  catalogCosts,
  disposeCanary,
  findPromptHints,
  loadCanaryCatalog,
  parseClaudeMcpList,
  parsePiAuthCheck,
  probeReadiness,
  promptNamesTerm,
  selfNamedTerms,
  type CanaryCatalog,
  type CanaryDeclaration,
  type ReadinessCommandResult,
  type ReadinessRunner,
} from "../src/core/canary.js";
import { packageRoot } from "../src/core/paths.js";

/** Compiled to dist/test, so the repository root is two levels up. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

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
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["codex"] })), [{ harness: "codex", costsModelTurn: false }]);
  // A harness with no oracle definition reports an underivable cost, and the
  // fail-closed roll-up treats an unknown cost as spending.
  assert.deepEqual(canaryCosts(declaration({ harnesses: ["hermes"] })), [{ harness: "hermes", costsModelTurn: null }]);
  assert.equal(canaryCostsModelTurn(declaration({ harnesses: ["hermes"] })), true);
  assert.equal(canaryCostsModelTurn(declaration({ harnesses: ["codex"] })), false);
});
