// Plan 02-02: `catalog/packs/*.yaml` plus `catalog/facts.yaml` are the single
// authority for which capability packs a repository can qualify for.
//
// These assertions run the loaders directly rather than the CLI, because the
// seam under test is the declared-data boundary: what a YAML file is allowed
// to say, and what happens when it says something ambiguous or unimplementable.

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ManagedDocumentError } from "../src/core/catalog.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict, packCatalogInvariants } from "../src/core/pack-catalog.js";
import { packageRoot } from "../src/core/paths.js";
import type { EvidenceNode } from "../src/types.js";

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

interface FixtureFiles {
  facts: string;
  packs: Record<string, string>;
}

/**
 * A temporary root mirroring the real `schemas/` + `catalog/` layout the
 * loaders read. The whole schemas directory is copied so a fixture is judged
 * by the contracts the repository actually ships, never by a second copy.
 */
async function catalogFixture(
  context: TestContext,
  files: FixtureFiles,
): Promise<{ root: string; packFiles: string[] }> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-packs-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await cp(join(packageRoot(), "schemas"), join(root, "schemas"), { recursive: true });
  await mkdir(join(root, "catalog", "packs"), { recursive: true });
  await writeFile(join(root, "catalog", "facts.yaml"), files.facts, "utf8");
  const packFiles: string[] = [];
  for (const [name, body] of Object.entries(files.packs)) {
    await writeFile(join(root, "catalog", "packs", name), body, "utf8");
    packFiles.push(`catalog/packs/${name}`);
  }
  return { root, packFiles: packFiles.sort() };
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

/** Every fact id a predicate names. Inline literals are not fact ids. */
function collectFactIds(node: EvidenceNode, into: Set<string>): void {
  for (const item of [...(node.all ?? []), ...(node.any ?? [])]) {
    if (typeof item === "string") into.add(item);
    else collectFactIds(item, into);
  }
}

const ONE_FACT = `schemaVersion: 1
facts:
  - id: web-framework
    kind: dependency
    packages: [react, next]
`;

// ---------------------------------------------------------------------------
// Task 1 — the declared fact vocabulary
// ---------------------------------------------------------------------------

test("the declared vocabulary contains every fact id named by the pack catalog", async () => {
  const root = packageRoot();
  const vocabulary = await loadFactVocabularyStrict(root);
  const catalog = await loadPackCatalogStrict(root);

  const declared = new Set(vocabulary.value.facts.map((fact) => fact.id));
  const referenced = new Set<string>();
  for (const pack of catalog.value.packs) collectFactIds(pack.evidence, referenced);

  assert.deepEqual([...referenced].filter((id) => !declared.has(id)).sort(), []);
  assert.ok(declared.size >= 31, `expected at least 31 declared facts, got ${declared.size}`);
  for (const fact of vocabulary.value.facts) {
    assert.ok(
      ["dependency", "file", "directory", "manifestKey", "fileAbsent", "fileContent"].includes(fact.kind),
      `${fact.id} declares an unknown detector kind`,
    );
  }
});

test("a vocabulary declaring one fact id twice is refused", async (t) => {
  const { root } = await catalogFixture(t, {
    facts: `schemaVersion: 1
facts:
  - id: web-framework
    kind: dependency
    packages: [react]
  - id: web-framework
    kind: file
    files: [package.json]
`,
    packs: {},
  });

  const error = await rejection(async () => loadFactVocabularyStrict(root));
  assert.equal(error.issues[0]?.code, "domain.duplicate-fact-id");
});

test("a fact declaring a kind outside the six-value enum is refused by the schema", async (t) => {
  const { root } = await catalogFixture(t, {
    facts: `schemaVersion: 1
facts:
  - id: web-framework
    kind: environmentVariable
`,
    packs: {},
  });

  const error = await rejection(async () => loadFactVocabularyStrict(root));
  assert.match(error.issues[0]?.code ?? "", /^schema\./u);
});

test("a fact carrying an unregistered non-x- property is refused", async (t) => {
  const { root } = await catalogFixture(t, {
    facts: `schemaVersion: 1
facts:
  - id: web-framework
    kind: dependency
    packages: [react]
    polarity: positive
`,
    packs: {},
  });

  const error = await rejection(async () => loadFactVocabularyStrict(root));
  assert.equal(error.issues[0]?.code, "schema.unknown-core-field");
});

test("an x- namespaced property on a fact loads and is preserved verbatim", async (t) => {
  const { root } = await catalogFixture(t, {
    facts: `${ONE_FACT}    x-vendor-note: kept
`,
    packs: {},
  });

  const vocabulary = await loadFactVocabularyStrict(root);
  const fact = vocabulary.value.facts.find((entry) => entry.id === "web-framework");
  assert.ok(fact !== undefined, "the fact declaring an x- property must still load");
  assert.equal((fact as unknown as Record<string, unknown>)["x-vendor-note"], "kept");
  assert.equal(fact.kind, "dependency");
});

// ---------------------------------------------------------------------------
// Task 2 — the full-fidelity pack schema and the seven-file merging loader
// ---------------------------------------------------------------------------

/** Every pack id declared under `catalog/packs/`, as the files stand today. */
const DECLARED_PACK_IDS: readonly string[] = [
  "AGENT_RUNTIME",
  "AI_EVAL",
  "API",
  "BROWNFIELD_INIT",
  "CACHE_REDIS",
  "CONTAINER",
  "DB_MIGRATION",
  "DB_POSTGRES",
  "DEPLOYMENT",
  "MCP_SERVER",
  "RESEARCH_SCIENTIFIC",
  "SECURITY_REVIEW",
  "WEB_BASE",
  "WEB_FLOW_AUDIT",
  "WEB_REACT",
];

test("all seven pack files merge into one catalog of fifteen packs", async () => {
  const catalog = await loadPackCatalogStrict(packageRoot());
  const ids = catalog.value.packs.map((pack) => pack.id);

  assert.equal(ids.length, 15);
  assert.deepEqual([...ids].sort(), [...DECLARED_PACK_IDS].sort());
  // Codepoint order, not locale order: the merged catalog must be byte-stable
  // on every host, and `localeCompare` is not.
  assert.deepEqual(ids, [...ids].sort());
});

test("lifecycle and selectionPolicy survive the merge unchanged", async () => {
  const catalog = await loadPackCatalogStrict(packageRoot());
  const byId = new Map(catalog.value.packs.map((pack) => [pack.id, pack]));

  assert.equal(byId.get("BROWNFIELD_INIT")?.lifecycle, "one-shot-remove-after-output");
  assert.equal(byId.get("SECURITY_REVIEW")?.selectionPolicy, "prefer-native-single-engine");
  assert.deepEqual(byId.get("API")?.skills, []);
});

test("an any item may be a nested evidence node", async (t) => {
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "security.yaml": `schemaVersion: 1
packs:
  - id: SECURITY_REVIEW
    evidence:
      any:
        - web-framework
        - manifestOptIn: securityReview
`,
    },
  });

  const catalog = await loadPackCatalogStrict(root, packFiles);
  const node = catalog.value.packs[0]?.evidence;
  assert.deepEqual(node?.any, ["web-framework", { manifestOptIn: "securityReview" }]);
});

test("evidence nesting is accepted to four levels and refused beyond", async (t) => {
  const nested = (depth: number): string => {
    let body = "[web-framework]";
    for (let level = depth; level > 1; level -= 1) body = `[{any: ${body}}]`;
    return body;
  };

  const deep = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: { "deep.yaml": `schemaVersion: 1\npacks:\n  - id: DEEP\n    evidence:\n      any: ${nested(4)}\n` },
  });
  const catalog = await loadPackCatalogStrict(deep.root, deep.packFiles);
  assert.equal(catalog.value.packs[0]?.id, "DEEP");

  const deeper = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: { "deep.yaml": `schemaVersion: 1\npacks:\n  - id: DEEP\n    evidence:\n      any: ${nested(5)}\n` },
  });
  const error = await rejection(async () => loadPackCatalogStrict(deeper.root, deeper.packFiles));
  assert.match(error.issues[0]?.code ?? "", /^schema\./u);
});

// ---------------------------------------------------------------------------
// Task 3 — domain invariants: duplicate ids and undeclared facts refuse at load
// ---------------------------------------------------------------------------

/** Distinctive enough that a leak into an issue would be unmistakable. */
const UNDECLARED_FACT = "nonexistent-fact-abcxyz";

test("two pack files declaring the same pack id are refused", async (t) => {
  const declaration = (file: string) => `schemaVersion: 1
packs:
  - id: WEB_BASE
    evidence:
      any: [web-framework]
    skills: [${file}]
`;
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: { "a.yaml": declaration("from-a"), "b.yaml": declaration("from-b") },
  });

  const error = await rejection(async () => loadPackCatalogStrict(root, packFiles));
  assert.equal(error.issues[0]?.code, "domain.duplicate-pack-id");
  assert.match(error.issues[0]?.documentPath ?? "", /^\/packs\/\d+$/u);
});

test("a predicate naming a fact the vocabulary does not declare is refused", async (t) => {
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "web.yaml": `schemaVersion: 1
packs:
  - id: WEB_BASE
    evidence:
      all: [web-framework, ${UNDECLARED_FACT}]
`,
    },
  });

  const error = await rejection(async () => loadPackCatalogStrict(root, packFiles));
  assert.equal(error.issues[0]?.code, "domain.undeclared-fact");
  assert.match(error.issues[0]?.expected ?? "", /catalog\/facts\.yaml/u);
});

test("a refusal reports the offending id's shape and never its value", async (t) => {
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "web.yaml": `schemaVersion: 1
packs:
  - id: WEB_BASE
    evidence:
      any:
        - any: [${UNDECLARED_FACT}]
`,
    },
  });

  const error = await rejection(async () => loadPackCatalogStrict(root, packFiles));
  assert.ok(error.issues.length > 0);
  for (const issue of error.issues) {
    assert.match(issue.actualShape, /^string\(length=\d+\)$/u);
  }
  assert.ok(
    !JSON.stringify(error.issues).includes(UNDECLARED_FACT),
    "no part of a refusal may echo the offending value",
  );
  assert.equal(error.issues[0]?.actualShape, `string(length=${UNDECLARED_FACT.length})`);
});

test("inline literals are not fact ids and are never refused as undeclared", async (t) => {
  const literalsOnly = `schemaVersion: 1
packs:
  - id: CONTAINER
    evidence:
      anyFiles: [Dockerfile, compose.yaml]
  - id: WEB_REACT
    evidence:
      anyDependencies: [react, next]
  - id: RESEARCH_SCIENTIFIC
    evidence:
      manifestOptIn: scientificResearch
`;
  const clean = await catalogFixture(t, { facts: ONE_FACT, packs: { "mixed.yaml": literalsOnly } });
  const catalog = await loadPackCatalogStrict(clean.root, clean.packFiles);
  assert.deepEqual(
    catalog.value.packs.map((pack) => pack.id),
    ["CONTAINER", "RESEARCH_SCIENTIFIC", "WEB_REACT"],
  );

  // The same fixture with one `any` leaf added does refuse, which is what
  // shows the literals above were exempt rather than merely unchecked.
  const dirty = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: { "mixed.yaml": `${literalsOnly}  - id: API\n    evidence:\n      any: [${UNDECLARED_FACT}]\n` },
  });
  const error = await rejection(async () => loadPackCatalogStrict(dirty.root, dirty.packFiles));
  assert.equal(error.issues[0]?.code, "domain.undeclared-fact");
});

test("the real repository catalog satisfies every invariant", async () => {
  const root = packageRoot();
  const catalog = await loadPackCatalogStrict(root);
  const vocabulary = await loadFactVocabularyStrict(root);

  assert.deepEqual(packCatalogInvariants(catalog.value, vocabulary.value), []);
  assert.equal(catalog.value.packs.length, 15);
});

// ---------------------------------------------------------------------------
// Plan 02-12 Task 3 (02-REVIEW IN-01, IN-02, IN-04) — a declared contract and
// the code that reads it say the same thing
// ---------------------------------------------------------------------------

const ONE_PACK = `schemaVersion: 1
packs:
  - id: WEB_THING
    evidence:
      all: [web-framework]
`;

test("an x- namespaced property on a PACK loads, exactly as it does on a fact", async (t) => {
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "web.yaml": `${ONE_PACK}    x-vendor-note: kept
`,
    },
  });

  const catalog = await loadPackCatalogStrict(root, packFiles);
  const pack = catalog.value.packs.find((entry) => entry.id === "WEB_THING");
  assert.ok(pack !== undefined, "the pack declaring an x- property must still load");
  assert.equal((pack as unknown as Record<string, unknown>)["x-vendor-note"], "kept");
});

test("a pack carrying an undeclared non-x- property is still refused", async (t) => {
  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "web.yaml": `${ONE_PACK}    vendorNote: rejected
`,
    },
  });

  const refusal = await rejection(async () => loadPackCatalogStrict(root, packFiles));
  assert.equal(
    refusal.issues.some((entry) => entry.code === "schema.unknown-core-field"),
    true,
    "the closed world must still be closed for a key outside the x- namespace",
  );
});

test("the fact-vocabulary schema states that a description's first sentence is rendered", async () => {
  const text = await readFile(join(packageRoot(), "schemas", "fact-vocabulary.schema.json"), "utf8");
  const schema = JSON.parse(text) as {
    properties: { facts: { items: { properties: Record<string, { description?: string }> } } };
  };
  const declared = schema.properties.facts.items.properties.description?.description ?? "";

  assert.match(declared, /first sentence/iu, "the schema must say the first sentence is load-bearing");
  assert.equal(
    /never by the evaluator/iu.test(declared),
    false,
    "the schema must not claim a field the renderer reads is never read",
  );
});

test("the two catalog schemas agree about namespaced extensions on a nested object", async () => {
  const schemas = join(packageRoot(), "schemas");
  const facts = JSON.parse(await readFile(join(schemas, "fact-vocabulary.schema.json"), "utf8")) as {
    properties: { facts: { items: { patternProperties?: Record<string, unknown> } } };
  };
  const packs = JSON.parse(await readFile(join(schemas, "pack-catalog.schema.json"), "utf8")) as {
    properties: { packs: { items: { patternProperties?: Record<string, unknown> } } };
  };

  const factPatterns = Object.keys(facts.properties.facts.items.patternProperties ?? {});
  const packPatterns = Object.keys(packs.properties.packs.items.patternProperties ?? {});
  assert.equal(factPatterns.length, 1, "the fact item declares exactly one extension pattern");
  assert.deepEqual(packPatterns, factPatterns, "two sibling contracts must not disagree about the same rule");
});

/**
 * The declared patterns as the evaluator compiles them: whole-file, `m` + `u`.
 * That is what makes `\s` in an indentation run able to cross a line boundary,
 * which is the defect these assertions pin (02-REVIEW IN-04).
 */
async function compiledPatterns(factId: string): Promise<RegExp[]> {
  const vocabulary = await loadFactVocabularyStrict(packageRoot());
  const fact = vocabulary.value.facts.find((entry) => entry.id === factId);
  assert.ok(fact !== undefined, `catalog/facts.yaml declares no ${factId}`);
  const patterns = fact.patterns ?? [];
  assert.ok(patterns.length > 0, `${factId} declares no patterns`);
  return patterns.map((pattern) => new RegExp(pattern, "mu"));
}

function anyMatches(patterns: readonly RegExp[], text: string): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

test("a workflow content pattern matches within one line and never straddles a line boundary", async () => {
  const deploy = await compiledPatterns("deploy-workflow");

  // Two lines: an indented run, a break, then `environment:` at column 0. The
  // `\s{2,}` form matched this by consuming the newline as indentation.
  assert.equal(
    anyMatches(deploy, "jobs:\n  \nenvironment: production\n"),
    false,
    "an indentation run must not cross a line boundary",
  );
  // The genuine single-line form still matches.
  assert.equal(anyMatches(deploy, "jobs:\n  environment: production\n"), true);
  // And still matches on a CRLF checkout.
  assert.equal(anyMatches(deploy, "jobs:\r\n  environment: production\r\n"), true);

  const release = await compiledPatterns("release-workflow");
  assert.equal(anyMatches(release, "on:\n  \nrelease:\n"), false, "an indentation run must not cross a line boundary");
  assert.equal(anyMatches(release, "on:\n  release:\n"), true);
  assert.equal(anyMatches(release, "on:\r\n  release:\r\n"), true, "a CRLF checkout must still match");
  assert.equal(anyMatches(release, "    types:\r\n      - published\r\n"), true, "a CRLF checkout must still match");
});

// ---------------------------------------------------------------------------
// Plan 03-09 Task 3: the declared one-shot lifecycle gets a home in the schema
// ---------------------------------------------------------------------------
//
// `lifecycle: one-shot-remove-after-output` has sat in `catalog/packs/
// brownfield.yaml` since Phase 2 validating against nothing: the property
// admitted any non-empty string. Phase 1's closed-world rule says an
// unregistered value is REFUSED at load rather than silently carried, so the
// property is narrowed to exactly the values the code implements.

const DECLARED_ONE_SHOT = "one-shot-remove-after-output";

/** The lifecycle values `schemas/pack-catalog.schema.json` admits. */
async function schemaLifecycleEnum(): Promise<string[]> {
  const schema = JSON.parse(
    await readFile(join(packageRoot(), "schemas", "pack-catalog.schema.json"), "utf8"),
  ) as Record<string, unknown>;
  const packs = (schema.properties as Record<string, unknown>).packs as Record<string, unknown>;
  const items = packs.items as Record<string, unknown>;
  const properties = items.properties as Record<string, Record<string, unknown> | undefined>;
  const lifecycle = properties.lifecycle;
  assert.ok(lifecycle, "the pack catalog schema declares no lifecycle property");
  const values = lifecycle.enum;
  assert.ok(
    Array.isArray(values),
    `the lifecycle property is not an enum, so an unregistered lifecycle would still be carried: ${JSON.stringify(lifecycle)}`,
  );
  return values as string[];
}

test("the pack catalog schema admits the declared one-shot lifecycle and refuses an undeclared one", async (t) => {
  assert.deepEqual(await schemaLifecycleEnum(), [DECLARED_ONE_SHOT]);

  const { root, packFiles } = await catalogFixture(t, {
    facts: ONE_FACT,
    packs: {
      "brownfield.yaml": `schemaVersion: 1
packs:
  - id: BROWNFIELD_INIT
    evidence:
      all: [web-framework]
    lifecycle: remove-after-a-fortnight
`,
    },
  });
  const error = await rejection(async () => loadPackCatalogStrict(root, packFiles));
  assert.match(
    `${error.message} ${error.issues.map((issue) => `${issue.code} ${issue.documentPath} ${issue.expected}`).join(" ")}`,
    /lifecycle/u,
    "the refusal does not name the lifecycle property that failed",
  );
  assert.deepEqual(packFiles, ["catalog/packs/brownfield.yaml"]);
});

test("PackLifecycle and the schema lifecycle enum agree in both directions", async () => {
  const declared = await schemaLifecycleEnum();
  const source = await readFile(join(packageRoot(), "src", "types.ts"), "utf8");
  const declaration = /export type PackLifecycle = ([^;]+);/u.exec(source);
  assert.ok(declaration, "src/types.ts declares no PackLifecycle union");
  const members = (declaration[1] ?? "")
    .split("|")
    .map((member) => member.trim().replace(/^"|"$/gu, ""))
    .filter((member) => member.length > 0);

  assert.deepEqual([...members].sort(), [...declared].sort(), "the union and the schema enum do not agree");
  for (const member of members) {
    assert.ok(declared.includes(member), `PackLifecycle admits ${member}, which the schema enum refuses`);
  }
  for (const value of declared) {
    assert.ok(members.includes(value), `the schema enum admits ${value}, which PackLifecycle refuses`);
  }
});
