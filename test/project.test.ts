import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detectProject, inspectProjectManifest } from "../src/core/project.js";

test("project detector selects packs only from positive repository evidence", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-project-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "src"));
  await mkdir(join(root, "prisma", "migrations"), { recursive: true });
  await writeFile(join(root, "Dockerfile"), "FROM node:24-alpine\n", "utf8");
  await writeFile(join(root, "package.json"), JSON.stringify({ dependencies: { next: "15.0.0", pg: "8.0.0" } }), "utf8");

  const result = await detectProject(root);
  assert.deepEqual(result.packs, ["CONTAINER", "DB_MIGRATION", "DB_POSTGRES", "WEB_BASE", "WEB_REACT"]);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
  assert.equal(result.packs.includes("SECURITY_REVIEW"), false);
});

test("AGENTS.md alone does not activate agent runtime", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-project-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "AGENTS.md"), "# Instructions\n", "utf8");
  const result = await detectProject(root);
  assert.equal(result.packs.includes("AGENT_RUNTIME"), false);
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
  const result = await detectProject(root);

  assert.ok(result.packs.includes("RESEARCH_SCIENTIFIC"));
  assert.ok(result.packs.includes("WEB_FLOW_AUDIT"));
  assert.ok(result.evidence.includes("manifest:scientificResearch"));
  assert.ok(result.evidence.includes("manifest:criticalUserFlows"));

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
    const result = await detectProject(root);
    assert.equal(
      result.packs.includes("RESEARCH_SCIENTIFIC"),
      false,
      `${entry.name} leaked a pack from an invalid manifest`,
    );
    assert.equal(result.evidence.includes("manifest:scientificResearch"), false);
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
  const result = await detectProject(root);
  assert.equal(result.packs.includes("RESEARCH_SCIENTIFIC"), false);

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

  const plain = await detectProject(plainRoot);
  const extended = await detectProject(extendedRoot);

  assert.deepEqual(extended.packs, plain.packs, "an extension must not add a pack");
  assert.deepEqual(extended.evidence, plain.evidence, "an extension must not add evidence");
  assert.equal(extended.packs.includes("SECURITY_REVIEW"), false);

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
  const result = await detectProject(root);
  assert.equal(result.packs.includes("RESEARCH_SCIENTIFIC"), false);
});
