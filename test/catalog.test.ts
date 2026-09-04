import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  inspectLock,
  loadCatalog,
  loadCatalogStrict,
  loadLock,
  ManagedDocumentError,
} from "../src/core/catalog.js";
import { renderOwnedSkill } from "../src/core/owned-skills.js";
import { packageRoot } from "../src/core/paths.js";
import { createInstallPlan } from "../src/core/plan.js";

test("stable catalog loads exact locked components", async () => {
  const root = packageRoot();
  const catalog = await loadCatalog(root);
  const lock = await loadLock(root);
  assert.equal(catalog.components.gsd.profile, "standard");
  assert.equal(catalog.components.ecc.profileInstallAllowed, false);
  assert.equal(lock.components.gsd?.version, "1.12.0");
  assert.equal(lock.components.ecc?.version, "2.2.0");
  assert.equal(lock.components.ecc?.sourceSha256["unified-memory"], "a6eb9a96b92dfd4a700bceff15195ca1fd4b7fad2944bb014c08812d1a0dc8b0");
  assert.equal(lock.components.ecc?.targetSha256["deep-research"]?.codex, "620ca763cb5a4f157ad34be4edb25ce86454570c4eecb377c96fcf5f2c1adb74");
  assert.deepEqual(Object.keys(lock.components.mcp ?? {}), ["context7", "exa", "firecrawl"]);
  assert.equal(lock.components.mcpBridges?.pi?.version, "2.31.0");
  assert.deepEqual(catalog.components.ownedSkills.map((skill) => skill.id), ["alpha-aos-ship"]);
  const shipSource = await readFile(join(root, "skills", "alpha-aos-ship", "SKILL.md"));
  const shipHash = createHash("sha256").update(shipSource).digest("hex");
  const lockedShip = lock.components.ownedSkills?.["alpha-aos-ship"];
  assert.equal(lockedShip?.sourceSha256, shipHash);
  const rendered = renderOwnedSkill(shipSource.toString("utf8"), "claude", "explicit", "<phase-number> [--draft] [--text] [--ws <name>]");
  assert.match(rendered, /disable-model-invocation: true/u);
  assert.equal(lockedShip?.targetSha256.claude, createHash("sha256").update(rendered).digest("hex"));
});

test("install plan is ordered and never installs GSD on Hermes", async () => {
  const root = packageRoot();
  const plan = createInstallPlan(await loadCatalog(root), await loadLock(root));
  assert.ok(plan.length > 20);
  assert.equal(plan.some((action) => action.id === "gsd:hermes"), false);
  assert.equal(plan.find((action) => action.id === "gsd:claude")?.note, "canary first");
  assert.ok(plan.filter((action) => action.component === "gsd" && action.operation === "install")
    .every((action) => action.command?.includes("--no-legacy-cleanup")));
  assert.match(plan.find((action) => action.id === "gsd:shared-root-audit")?.note ?? "", /never in parallel/u);
  assert.equal(plan.find((action) => action.id === "ecc:pi")?.operation, "install");
  assert.equal(plan.find((action) => action.id === "ecc:claude")?.operation, "install");
  assert.match(plan.find((action) => action.id === "ecc:claude")?.note ?? "", /upstream --skills is blocked/u);
  assert.match(plan.find((action) => action.id === "ecc:runtime")?.command ?? "", /ecc-universal@2\.2\.0/u);
  assert.match(plan.find((action) => action.id === "mcp:context7:claude")?.command ?? "", /mcp sync --target claude --server context7 --apply/u);
  assert.match(plan.find((action) => action.id === "mcp:firecrawl:hermes")?.note ?? "", /four extraction\/crawl tools/u);
  assert.equal(plan.find((action) => action.id === "mcp-bridge:pi")?.command, "pi install npm:pi-mcp-adapter@2.31.0");
  const ship = plan.find((action) => action.id === "owned-skill:alpha-aos-ship:claude");
  assert.equal(ship?.phase, 3);
  assert.equal(ship?.approval, true);
  assert.match(ship?.command ?? "", /owned-skills sync alpha-aos-ship --target claude --apply/u);
  assert.ok(plan.every((action, index) => index === 0 || action.phase >= (plan[index - 1]?.phase ?? -1)));
});

// ---------------------------------------------------------------------------
// Plan 01-06: strict catalog and lock loaders
// ---------------------------------------------------------------------------

/** Writes a checkout-shaped fixture root carrying the real schemas. */
async function fixtureRoot(
  context: { after: (fn: () => Promise<unknown> | unknown) => void },
  files: { catalog?: string; stableLock?: string; candidateLock?: string },
): Promise<string> {
  const source = packageRoot();
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-strict-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "schemas"), { recursive: true });
  await mkdir(join(root, "catalog"), { recursive: true });
  for (const name of ["stack.schema.json", "lock.schema.json", "project-stack.schema.json"]) {
    await copyFile(join(source, "schemas", name), join(root, "schemas", name));
  }
  await writeFile(
    join(root, "catalog", "stack.yaml"),
    files.catalog ?? (await readFile(join(source, "catalog", "stack.yaml"), "utf8")),
    "utf8",
  );
  await writeFile(
    join(root, "catalog", "stack.lock.json"),
    files.stableLock ?? (await readFile(join(source, "catalog", "stack.lock.json"), "utf8")),
    "utf8",
  );
  await writeFile(
    join(root, "catalog", "candidate.lock.json"),
    files.candidateLock ?? (await readFile(join(source, "catalog", "candidate.lock.json"), "utf8")),
    "utf8",
  );
  return root;
}

test("catalog refuses duplicate, multi-document and unknown-core input before returning a value", async (context) => {
  const source = await readFile(join(packageRoot(), "catalog", "stack.yaml"), "utf8");

  const cases: ReadonlyArray<{ name: string; document: string; code: string }> = [
    { name: "duplicate top-level key", document: `${source}\nharnesses: {}\n`, code: "syntax.duplicate-key" },
    { name: "multi-document stream", document: `${source}\n---\nschemaVersion: 1\n`, code: "syntax.multiple-documents" },
    { name: "unknown core field", document: `${source}\nunknownCoreField: true\n`, code: "schema.unknown-core-field" },
    { name: "unknown newer version", document: source.replace("schemaVersion: 1", "schemaVersion: 2"), code: "version.unknown-newer" },
  ];

  for (const entry of cases) {
    const root = await fixtureRoot(context, { catalog: entry.document });
    await assert.rejects(
      () => loadCatalog(root),
      (error: unknown) => {
        assert.ok(error instanceof ManagedDocumentError, `${entry.name} must raise ManagedDocumentError`);
        assert.equal(error.issues[0]?.code, entry.code, `${entry.name} produced ${error.issues[0]?.code}`);
        return true;
      },
      `catalog with a ${entry.name} must be refused`,
    );
  }
});

test("catalog domain invariants are checked beyond what the schema can express", async (context) => {
  const source = await readFile(join(packageRoot(), "catalog", "stack.yaml"), "utf8");

  const undeclaredChannel = source.replace("defaultChannel: stable", "defaultChannel: pinned").replace(
    "  pinned:\n    description: An explicit immutable lock supplied by the user.\n",
    "",
  );
  const root = await fixtureRoot(context, { catalog: undeclaredChannel });
  await assert.rejects(
    () => loadCatalog(root),
    (error: unknown) => {
      assert.ok(error instanceof ManagedDocumentError);
      assert.equal(error.issues[0]?.code, "domain.unknown-default-channel");
      return true;
    },
    "a defaultChannel that is not declared in /channels must be refused",
  );
});

test("an unregistered catalog extension round-trips but cannot alter the plan", async (context) => {
  const source = await readFile(join(packageRoot(), "catalog", "stack.yaml"), "utf8");
  const baseRoot = await fixtureRoot(context, {});
  const extendedRoot = await fixtureRoot(context, {
    catalog: `${source}\nx-vendor-experiment:\n  enabled: true\n`,
  });

  const baseline = await loadCatalogStrict(baseRoot);
  const extended = await loadCatalogStrict(extendedRoot);

  assert.deepEqual(baseline.extensions, {});
  assert.deepEqual(extended.extensions, { "x-vendor-experiment": { enabled: true } });
  assert.deepEqual(extended.value, baseline.value, "an extension must not change the loaded catalog");

  const baselinePlan = createInstallPlan(baseline.value, await loadLock(baseRoot));
  const extendedPlan = createInstallPlan(extended.value, await loadLock(extendedRoot));
  assert.equal(
    createHash("sha256").update(JSON.stringify(extendedPlan)).digest("hex"),
    createHash("sha256").update(JSON.stringify(baselinePlan)).digest("hex"),
    "an unregistered extension must not change the install plan digest",
  );
});

test("a lock is never promoted into a channel it does not declare", async (context) => {
  const root = await fixtureRoot(context, {});

  // Each fixture is valid in its own channel.
  assert.equal((await loadLock(root, "stable")).channel, "stable");
  assert.equal((await loadLock(root, "candidate")).channel, "candidate");

  // Placing the candidate bytes where the stable lock lives does not make them
  // stable authority: the channel the file declares must match the request.
  const candidateBytes = await readFile(join(root, "catalog", "candidate.lock.json"), "utf8");
  const promoted = await fixtureRoot(context, { stableLock: candidateBytes });
  await assert.rejects(
    () => loadLock(promoted, "stable"),
    (error: unknown) => {
      assert.ok(error instanceof ManagedDocumentError);
      assert.equal(error.issues[0]?.code, "domain.channel-mismatch");
      return true;
    },
    "a candidate lock must not be accepted as stable authority",
  );
});

test("lock domain invariants reject missing integrity and duplicate packages", async (context) => {
  const source = JSON.parse(await readFile(join(packageRoot(), "catalog", "stack.lock.json"), "utf8")) as {
    components: Record<string, Record<string, unknown>>;
  };

  const missingIntegrity = structuredClone(source);
  const missingMcp = missingIntegrity.components.mcp as Record<string, Record<string, unknown>>;
  delete missingMcp.context7?.integrity;
  const missingRoot = await fixtureRoot(context, { stableLock: JSON.stringify(missingIntegrity) });
  await assert.rejects(
    () => loadLock(missingRoot, "stable"),
    (error: unknown) => {
      assert.ok(error instanceof ManagedDocumentError);
      // The schema requires integrity, so this is caught before the domain pass.
      assert.match(error.issues[0]?.code ?? "", /schema\.|domain\.missing-integrity/u);
      return true;
    },
  );

  const duplicated = structuredClone(source);
  const mcp = duplicated.components.mcp as Record<string, Record<string, unknown>>;
  mcp.exa = { ...mcp.context7 };
  const duplicateRoot = await fixtureRoot(context, { stableLock: JSON.stringify(duplicated) });
  await assert.rejects(
    () => loadLock(duplicateRoot, "stable"),
    (error: unknown) => {
      assert.ok(error instanceof ManagedDocumentError);
      assert.equal(error.issues[0]?.code, "domain.duplicate-package");
      return true;
    },
    "the same package locked twice must be refused",
  );
});

test("a lock with a non-exact version is not a lock", async (context) => {
  const source = JSON.parse(await readFile(join(packageRoot(), "catalog", "stack.lock.json"), "utf8")) as {
    components: { gsd: Record<string, unknown> };
  };
  source.components.gsd.version = "^1.12.0";
  const root = await fixtureRoot(context, { stableLock: JSON.stringify(source) });

  await assert.rejects(
    () => loadLock(root, "stable"),
    (error: unknown) => {
      assert.ok(error instanceof ManagedDocumentError);
      assert.equal(error.issues[0]?.code, "schema.pattern");
      return true;
    },
    "a version range must be refused where an exact version is required",
  );
});

test("a supported older lock is readable but not authoritative", async (context) => {
  const source = JSON.parse(await readFile(join(packageRoot(), "catalog", "stack.lock.json"), "utf8")) as Record<string, unknown>;
  source.schemaVersion = 0;
  const root = await fixtureRoot(context, { stableLock: JSON.stringify(source) });

  const inspection = await inspectLock(root, "stable");
  assert.equal(inspection.status, "migratable");
  assert.equal(inspection.value, null, "a migratable lock yields no authoritative value");
  assert.notEqual(inspection.readOnlyValue, null, "a migratable lock is still readable");

  await assert.rejects(() => loadLock(root, "stable"), ManagedDocumentError, "a migratable lock must not load as current");
});
