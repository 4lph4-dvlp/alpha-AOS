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
  CANARY_CATALOG_FILE,
  findPromptHints,
  loadCanaryCatalog,
  promptNamesTerm,
  selfNamedTerms,
  type CanaryCatalog,
  type CanaryDeclaration,
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
