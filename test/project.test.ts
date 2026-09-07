// Plan 02-06 migrated this suite off the retired hardcoded detector.
//
// The two behavioural cases below are the phase's OLDEST statements of intent,
// so they are rewritten against the engine that replaced the one they were
// written for rather than deleted with it. Both are now asserted against the
// plan's selected pack ids and the declared fact vocabulary — the same claims,
// pointed at the surface that now decides them.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { EvidenceFact } from "../src/types.js";
import { collectProjectEvidence, detectFact, openDetectionContext, resolveCanonicalRoot, scanProjectTree } from "../src/core/evidence.js";
import { loadFactVocabularyStrict } from "../src/core/pack-catalog.js";
import { inspectProjectManifest } from "../src/core/project.js";
import { planProjectCapabilities } from "../src/core/project-plan.js";

/** The alpha-AOS package root that owns `catalog/facts.yaml` and `catalog/packs/`. */
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface TestContext {
  after: (fn: () => Promise<unknown> | unknown) => void;
}

async function scratch(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  return root;
}

/** The pack ids the plan actually selected, sorted. */
async function selectedPacks(root: string): Promise<string[]> {
  const plan = await planProjectCapabilities({ path: root, packageRoot: repositoryRoot });
  return plan.selected.map((evaluation) => evaluation.packId).sort();
}

async function factsOf(root: string): Promise<Map<string, EvidenceFact>> {
  const envelope = await collectProjectEvidence(await resolveCanonicalRoot(root), { packageRoot: repositoryRoot });
  return new Map(envelope.facts.map((fact) => [fact.id, fact]));
}

test("pack selection comes only from positive repository evidence", async (context) => {
  const root = await scratch(context, "project");
  await mkdir(join(root, "src"));
  await mkdir(join(root, "prisma", "migrations"), { recursive: true });
  await writeFile(join(root, "Dockerfile"), "FROM node:24-alpine\n", "utf8");
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { next: "15.0.0", pg: "8.0.0" } }),
    "utf8",
  );

  const packs = await selectedPacks(root);
  // WEB_REACT is the one pack whose operator has an evaluator today; the
  // remaining four operators land with plan 02-07. What must hold NOW is that
  // nothing selects without positive evidence for it.
  assert.deepEqual(packs, ["WEB_REACT"]);
  assert.equal(packs.includes("AGENT_RUNTIME"), false);
  assert.equal(packs.includes("SECURITY_REVIEW"), false);

  // The evidence those still-unevaluated packs will read is already observed,
  // positively and by name, which is what the retired detector could not say.
  const facts = await factsOf(root);
  for (const id of ["web-framework", "browser-entrypoint", "postgres-driver", "migration-directory", "existing-source"]) {
    assert.equal(facts.get(id)?.detected, true, `${id} should be positive evidence in this fixture`);
  }
  assert.equal(facts.get("web-framework")?.path, "package.json");
  assert.equal(facts.get("agent-sdk-dependency")?.detected, false);
  assert.ok((facts.get("agent-sdk-dependency")?.reason ?? "").length > 0);
});

test("an instructions document alone does not activate the agent runtime pack", async (context) => {
  const root = await scratch(context, "project");
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");

  assert.equal((await selectedPacks(root)).includes("AGENT_RUNTIME"), false);

  // The failure this points at is unchanged: the generic file IS present, the
  // SDK dependency is NOT, and the pack does not activate.
  const facts = await factsOf(root);
  assert.equal(facts.get("agent-runtime-config")?.detected, true, "the generic file is present");
  assert.equal(facts.get("agent-runtime-config")?.path, "AGENTS.md");
  assert.equal(facts.get("agent-sdk-dependency")?.detected, false, "the SDK dependency is not");

  // `catalog/facts.yaml` marks the generic file `broad`, and this test is what
  // gives that marker teeth: a broad fact may never be a pack's only leaf.
  const vocabulary = (await loadFactVocabularyStrict(repositoryRoot)).value;
  const declaration = vocabulary.facts.find((fact) => fact.id === "agent-runtime-config");
  assert.equal(declaration?.broad, true, "the over-broad fact must be declared broad");
});

// ---------------------------------------------------------------------------
// Plan 01-06: strict project manifest reading and previewable migration
// ---------------------------------------------------------------------------

async function withManifest(
  context: { after: (fn: () => Promise<unknown> | unknown) => void },
  manifest: string,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-manifest-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".alpha-aos"), { recursive: true });
  await writeFile(join(root, ".alpha-aos", "stack.yaml"), manifest, "utf8");
  return root;
}

/**
 * What the `manifestKey` detector concludes about one manifest key. The
 * `manifest:<key>` fact-id spelling is the convention the retired detector
 * established and the new evaluator's file and dependency leaf ids extend.
 */
async function manifestOptIn(root: string, key: string): Promise<boolean> {
  const canonical = await resolveCanonicalRoot(root);
  const detectionContext = await openDetectionContext(canonical, await scanProjectTree(canonical));
  const detection = await detectFact(detectionContext, {
    id: `manifest:${key}`,
    kind: "manifestKey",
    manifestKey: key,
  });
  return detection.detected;
}

const CURRENT_MANIFEST = [
  "schemaVersion: 1",
  "trusted: false",
  "scientificResearch: true",
  "criticalUserFlows:",
  "  - checkout",
  "",
].join("\n");

test("a current manifest keeps its existing detection behavior", async (context) => {
  const root = await withManifest(context, CURRENT_MANIFEST);

  assert.equal(await manifestOptIn(root, "scientificResearch"), true);
  assert.equal(await manifestOptIn(root, "criticalUserFlows"), true);

  const inspection = await inspectProjectManifest(root);
  assert.equal(inspection?.status, "current");
  assert.equal(inspection?.migration, null);
});

test("an invalid manifest contributes no detection evidence at all", async (context) => {
  const cases: ReadonlyArray<{ name: string; manifest: string; code: string }> = [
    {
      name: "duplicate key",
      manifest: "schemaVersion: 1\nscientificResearch: true\nscientificResearch: false\n",
      code: "syntax.duplicate-key",
    },
    {
      name: "unknown core field",
      manifest: "schemaVersion: 1\nscientificResearch: true\nunknownCoreField: 1\n",
      code: "schema.unknown-core-field",
    },
    {
      name: "unknown newer version",
      manifest: "schemaVersion: 9\nscientificResearch: true\n",
      code: "version.unknown-newer",
    },
  ];

  for (const entry of cases) {
    const root = await withManifest(context, entry.manifest);
    const inspection = await inspectProjectManifest(root);
    assert.equal(inspection?.issues[0]?.code, entry.code, `${entry.name} produced ${inspection?.issues[0]?.code}`);

    // Partial application is the failure mode this guards against: the
    // document declares scientificResearch, but an invalid document must
    // contribute nothing rather than the parts that happened to parse.
    assert.equal(
      await manifestOptIn(root, "scientificResearch"),
      false,
      `${entry.name} leaked an opt-in from an invalid manifest`,
    );
  }
});

test("a supported older manifest is inspection-only and yields a migration plan", async (context) => {
  const root = await withManifest(context, "schemaVersion: 0\nscientificResearch: true\n");

  const inspection = await inspectProjectManifest(root);
  assert.equal(inspection?.status, "migratable");
  assert.equal(inspection?.value, null, "a migratable manifest is not consumed as current");
  assert.notEqual(inspection?.readOnlyValue, null, "a migratable manifest is still readable");
  assert.equal(inspection?.migration?.fromVersion, 0);
  assert.equal(inspection?.migration?.toVersion, 1);
  assert.notEqual(inspection?.migration?.sourceHash, inspection?.migration?.targetHash);

  // Detection does not act on it.
  assert.equal(await manifestOptIn(root, "scientificResearch"), false);

  // Planning the migration leaves the file byte-identical.
  const onDisk = await readFile(join(root, ".alpha-aos", "stack.yaml"), "utf8");
  assert.equal(onDisk, "schemaVersion: 0\nscientificResearch: true\n");
});

test("an unregistered manifest extension cannot select capabilities or change detection", async (context) => {
  const plainRoot = await withManifest(context, CURRENT_MANIFEST);
  const extendedRoot = await withManifest(
    context,
    `${CURRENT_MANIFEST}${["x-team-owner: platform", "x-vendor-packs:", "  - SECURITY_REVIEW", ""].join("\n")}`,
  );

  assert.deepEqual(await selectedPacks(extendedRoot), await selectedPacks(plainRoot), "an extension must not add a pack");
  assert.equal((await selectedPacks(extendedRoot)).includes("SECURITY_REVIEW"), false);
  assert.equal(await manifestOptIn(extendedRoot, "x-vendor-packs"), false);

  const inspection = await inspectProjectManifest(extendedRoot);
  assert.deepEqual(inspection?.extensions, { "x-team-owner": "platform", "x-vendor-packs": ["SECURITY_REVIEW"] });
  assert.equal(Object.hasOwn(inspection?.value ?? {}, "x-vendor-packs"), false);
});

test("an isolation mode without an adapter fails closed rather than degrading", async (context) => {
  const sealed = [
    "schemaVersion: 1",
    "isolation:",
    "  mode: sealed",
    "  allowedHarnesses: [claude]",
    "  exclusive: true",
    "  inherit:",
    "    globalConfig: false",
    "    globalSkills: false",
    "    globalMcp: false",
    "    globalMemory: false",
    "    globalHooks: false",
    "  allowedSkills: []",
    "  allowedMcp: []",
    "  execution:",
    "    isolation: process",
    "    network: inherited",
    "    environment: allowlist",
    "",
  ].join("\n");

  const root = await withManifest(context, sealed);
  const inspection = await inspectProjectManifest(root);

  assert.equal(inspection?.status, "invalid");
  assert.equal(inspection?.issues[0]?.code, "domain.sealed-unsupported");
});

test("no manifest at all is not an error", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-manifest-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  assert.equal(await inspectProjectManifest(root), null);
  assert.equal(await manifestOptIn(root, "scientificResearch"), false);
});
