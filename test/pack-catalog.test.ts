// Plan 02-02: `catalog/packs/*.yaml` plus `catalog/facts.yaml` are the single
// authority for which capability packs a repository can qualify for.
//
// These assertions run the loaders directly rather than the CLI, because the
// seam under test is the declared-data boundary: what a YAML file is allowed
// to say, and what happens when it says something ambiguous or unimplementable.

import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ManagedDocumentError } from "../src/core/catalog.js";
import { loadFactVocabularyStrict, loadPackCatalogStrict } from "../src/core/pack-catalog.js";
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
