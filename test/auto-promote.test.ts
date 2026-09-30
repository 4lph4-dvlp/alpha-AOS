import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { loadLock } from "../src/core/catalog.js";

const scriptPath = join(process.cwd(), "scripts", "auto-promote.mjs");
const { ALL_COMPONENTS, changedPackages, describeChanges, runAutoPromoteCli, stagePromotion, verifyRegistry } =
  await import(pathToFileURL(scriptPath).href);

const NEW_INTEGRITY = "sha512-bmV3LWZpcmVjcmF3bC1pbnRlZ3JpdHk=";
const NEW_ECC_INTEGRITY = "sha512-bmV3LWVjYy1pbnRlZ3JpdHk=";

type LockDocument = any;

async function stableDocument(): Promise<LockDocument> {
  return JSON.parse(await readFile(join(process.cwd(), "catalog", "stack.lock.json"), "utf8"));
}

function candidateFrom(stable: LockDocument, edit: (components: LockDocument) => void): LockDocument {
  const candidate = structuredClone(stable);
  candidate.channel = "candidate";
  candidate.status = "unverified";
  edit(candidate.components);
  return candidate;
}

async function tempRepo(candidate: LockDocument | null): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-auto-promote-"));
  await mkdir(join(root, "catalog"), { recursive: true });
  await mkdir(join(root, "schemas"), { recursive: true });
  await copyFile(join(process.cwd(), "schemas", "lock.schema.json"), join(root, "schemas", "lock.schema.json"));
  await copyFile(join(process.cwd(), "catalog", "stack.lock.json"), join(root, "catalog", "stack.lock.json"));
  const empty = { schemaVersion: 1, channel: "candidate", generatedAt: null, status: "empty", components: {} };
  await writeFile(join(root, "catalog", "candidate.lock.json"), `${JSON.stringify(candidate ?? empty, null, 2)}\n`, "utf8");
  return root;
}

test("the unattended promotion covers every pinned package, exa included", () => {
  assert.deepEqual([...ALL_COMPONENTS].sort(), ["context7", "ecc", "exa", "firecrawl", "gsd", "pi"]);
});

test("changedPackages reports only version or integrity moves", async () => {
  const stable = await stableDocument();
  assert.deepEqual(changedPackages(stable, stable), []);
  const next = candidateFrom(stable, (components) => {
    components.mcp.firecrawl = { ...components.mcp.firecrawl, version: "99.0.0", integrity: NEW_INTEGRITY };
  });
  const changes = changedPackages(stable, next);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "mcp:firecrawl");
  assert.equal(changes[0].to, "99.0.0");
  assert.match(describeChanges(changes), /^mcp:firecrawl \d+\.\d+\.\d+ -> 99\.0\.0$/u);
});

test("an empty candidate stages nothing and leaves both locks untouched", async () => {
  const root = await tempRepo(null);
  try {
    const stableBefore = await readFile(join(root, "catalog", "stack.lock.json"), "utf8");
    const changes = await stagePromotion({ root, fetchIntegrity: async () => assert.fail("no registry call expected") });
    assert.deepEqual(changes, []);
    assert.equal(await readFile(join(root, "catalog", "stack.lock.json"), "utf8"), stableBefore);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("a changed candidate is promoted into a valid stable lock and the candidate is reset", async () => {
  const stable = await stableDocument();
  const candidate = candidateFrom(stable, (components) => {
    components.mcp.exa = { ...components.mcp.exa, version: "99.1.0", integrity: NEW_INTEGRITY };
  });
  const root = await tempRepo(candidate);
  try {
    let repinned = false;
    const changes = await stagePromotion({
      root,
      fetchIntegrity: async (name: string, version: string) =>
        name === "exa-mcp-server" && version === "99.1.0" ? NEW_INTEGRITY : lockedIntegrity(stable, name),
      repinEcc: async () => {
        repinned = true;
      },
    });
    assert.deepEqual(changes.map((change: { id: string }) => change.id), ["mcp:exa"]);
    assert.equal(repinned, false, "ECC hashes are only re-pinned when the ECC runtime moved");
    const promoted = await loadLock(root, "stable");
    assert.equal(promoted.components.mcp?.exa?.version, "99.1.0");
    const reset = JSON.parse(await readFile(join(root, "catalog", "candidate.lock.json"), "utf8"));
    assert.equal(reset.status, "empty");
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("an ECC move triggers re-pinning of its skill hashes", async () => {
  const stable = await stableDocument();
  const candidate = candidateFrom(stable, (components) => {
    components.ecc = { ...components.ecc, version: "99.2.0", integrity: NEW_ECC_INTEGRITY, sourceSha256: {}, targetSha256: {} };
  });
  const root = await tempRepo(candidate);
  try {
    let repinnedRoot = "";
    const changes = await stagePromotion({
      root,
      fetchIntegrity: async (name: string) => (name === "ecc-universal" ? NEW_ECC_INTEGRITY : lockedIntegrity(stable, name)),
      repinEcc: async (repoRoot: string) => {
        repinnedRoot = repoRoot;
      },
    });
    assert.deepEqual(changes.map((change: { id: string }) => change.id), ["ecc"]);
    assert.equal(repinnedRoot, root);
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("a registry integrity mismatch refuses the promotion", async () => {
  const stable = await stableDocument();
  const candidate = candidateFrom(stable, (components) => {
    components.mcp.context7 = { ...components.mcp.context7, version: "99.3.0", integrity: NEW_INTEGRITY };
  });
  const root = await tempRepo(candidate);
  try {
    await assert.rejects(
      () => stagePromotion({ root, fetchIntegrity: async () => "sha512-somethingelse" }),
      /Integrity mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => undefined);
  }
});

function lockedIntegrity(lock: LockDocument, name: string): string {
  const all = [
    lock.components.gsd,
    lock.components.ecc,
    ...Object.values(lock.components.mcp ?? {}),
    ...Object.values(lock.components.mcpBridges ?? {}),
  ] as { package: string; integrity: string }[];
  const entry = all.find((candidate) => candidate.package === name);
  if (!entry) throw new Error(`unexpected package ${name}`);
  return entry.integrity;
}

test("registry re-verification refuses unpublished, altered and too-young versions", async () => {
  const base = await stableDocument();
  const next = candidateFrom(base, (components) => {
    components.mcp.firecrawl = { ...components.mcp.firecrawl, version: "99.0.0", integrity: NEW_INTEGRITY };
  });
  const now = Date.parse("2026-10-07T03:17:00Z");
  const document = (integrity: string, time: string) => ({
    versions: { "99.0.0": { dist: { integrity } } },
    time: { "99.0.0": time },
  });

  assert.deepEqual(
    await verifyRegistry(base, next, { now, fetchPackument: async () => document(NEW_INTEGRITY, "2026-10-04T00:00:00Z") }),
    [],
  );
  assert.match(
    (await verifyRegistry(base, next, { now, fetchPackument: async () => ({ versions: {}, time: {} }) }))[0] ?? "",
    /no longer published/u,
  );
  assert.match(
    (await verifyRegistry(base, next, { now, fetchPackument: async () => document("sha512-other", "2026-10-04T00:00:00Z") }))[0] ?? "",
    /integrity changed/u,
  );
  assert.match(
    (await verifyRegistry(base, next, { now, fetchPackument: async () => document(NEW_INTEGRITY, "2026-10-06T20:00:00Z") }))[0] ?? "",
    /cooldown/u,
  );
  assert.match(
    (await verifyRegistry(base, next, { now, fetchPackument: async () => { throw new Error("HTTP 404"); } }))[0] ?? "",
    /HTTP 404/u,
  );
});

test("the CLI rejects an unknown mode", async () => {
  assert.equal(await runAutoPromoteCli(["bogus"]), 2);
});
