import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { loadLock } from "../src/core/catalog.js";

// Dynamically import scripts/promote-candidate.mjs
const scriptPath = join(process.cwd(), "scripts", "promote-candidate.mjs");
const { promoteCandidate, runPromotionCli } = await import(pathToFileURL(scriptPath).href);

async function setupTempRepo(): Promise<{ tempDir: string; stablePath: string; candidatePath: string }> {
  const tempDir = join(tmpdir(), `test-promote-candidate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const catalogDir = join(tempDir, "catalog");
  await mkdir(catalogDir, { recursive: true });

  const stablePath = join(catalogDir, "stack.lock.json");
  const candidatePath = join(catalogDir, "candidate.lock.json");

  // Copy schemas directory into tempDir so loadLock can validate
  const schemasDir = join(tempDir, "schemas");
  await mkdir(schemasDir, { recursive: true });
  await copyFile(join(process.cwd(), "schemas", "lock.schema.json"), join(schemasDir, "lock.schema.json"));

  // Copy current stable lock and set pre-promotion baseline versions for promotion test fixtures
  const stableDoc = JSON.parse(await readFile(join(process.cwd(), "catalog", "stack.lock.json"), "utf8"));
  if (stableDoc.components?.gsd) stableDoc.components.gsd.version = "1.12.0";
  if (stableDoc.components?.ecc) stableDoc.components.ecc.version = "2.2.0";
  if (stableDoc.components?.mcp?.context7) stableDoc.components.mcp.context7.version = "4.0.4";
  if (stableDoc.components?.mcp?.firecrawl) stableDoc.components.mcp.firecrawl.version = "3.24.0";
  if (stableDoc.components?.mcpBridges?.pi) stableDoc.components.mcpBridges.pi.version = "2.31.0";
  await writeFile(stablePath, `${JSON.stringify(stableDoc, null, 2)}\n`, "utf8");

  // Write a fixture candidate lock with candidate components
  const candidateFixture = {
    schemaVersion: 1,
    channel: "candidate",
    generatedAt: "2026-09-22T17:41:01.804Z",
    status: "unverified",
    components: {
      gsd: {
        package: "@opengsd/gsd-core",
        version: "1.14.0",
        integrity: "sha512-e05sV2c8KlcQ2hoJ4U3U1OBjqswQOon4C29Cs75fEAr+tq7qJ/XyFYrN/nwblREWUkPUUoxmVzLVj4Im2KjQxQ==",
        profile: "standard",
      },
      ecc: {
        package: "ecc-universal",
        version: "2.2.1",
        integrity: "sha512-D8vFXQ++Aub1CD2RPyYfPEXVt51eEHzvImLd1XaOos/gUxYRWU+BRDXMDnmRrjDfWwX5+uFEJULYpqPYFPSGuw==",
        skills: ["unified-memory", "documentation-lookup", "deep-research"],
        sourceSha256: {},
        targetSha256: {},
      },
      mcp: {
        context7: {
          package: "@upstash/context7-mcp",
          version: "4.1.1",
          integrity: "sha512-fUARTIZGVKzlzQKDhKUg4aIQ3yEU/12STdfxJDDnLMSN7yyHiPvNHI05iFwxkv3vC8G76Wp27MwK6Jucl/C5pA==",
        },
        firecrawl: {
          package: "firecrawl-mcp",
          version: "3.25.2",
          integrity: "sha512-Z0PWA9UD757p8w1ahAh6Fyqm28uDc8ng7OkTE3NE0x1F85vAeU4/MMmx1l+xtmDm8OSpybriMjNJZavca4ijfA==",
        },
      },
      mcpBridges: {
        pi: {
          package: "pi-mcp-adapter",
          version: "2.36.0",
          integrity: "sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==",
        },
      },
    },
  };
  await writeFile(candidatePath, `${JSON.stringify(candidateFixture, null, 2)}\n`, "utf8");

  return { tempDir, stablePath, candidatePath };
}

test("runPromotionCli handles --help flag", async () => {
  const result = await runPromotionCli(["--help"]);
  assert.equal(result.exitCode, 0);
});

test("promoteCandidate dry-run does not modify stable or candidate lockfiles", async () => {
  const { tempDir, stablePath, candidatePath } = await setupTempRepo();
  try {
    const stableBefore = await readFile(stablePath, "utf8");
    const candidateBefore = await readFile(candidatePath, "utf8");

    const result = await promoteCandidate({
      root: tempDir,
      dryRun: true,
      resetCandidate: true,
    });

    assert.deepEqual(result.promoted.sort(), ["context7", "ecc", "firecrawl", "gsd", "pi"].sort());
    assert.equal(result.candidateReset, false);

    const stableAfter = await readFile(stablePath, "utf8");
    const candidateAfter = await readFile(candidatePath, "utf8");

    assert.equal(stableAfter, stableBefore);
    assert.equal(candidateAfter, candidateBefore);
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("promoteCandidate supports selective component promotion", async () => {
  const { tempDir, stablePath } = await setupTempRepo();
  try {
    const result = await promoteCandidate({
      root: tempDir,
      components: ["context7"],
      dryRun: false,
    });

    assert.deepEqual(result.promoted, ["context7"]);

    const stable = JSON.parse(await readFile(stablePath, "utf8"));
    assert.equal(stable.components.mcp.context7.version, "4.1.1");
    // Other components remain at previous version
    assert.equal(stable.components.gsd.version, "1.12.0");
    assert.equal(stable.components.ecc.version, "2.2.0");
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("promoteCandidate full promotion updates all components and resets candidate lock", async () => {
  const { tempDir, stablePath, candidatePath } = await setupTempRepo();
  try {
    const mockFetch = async (_pkg: string, _ver: string) => {
      // Mock registry returning matching integrity
      if (_pkg === "@opengsd/gsd-core") return "sha512-e05sV2c8KlcQ2hoJ4U3U1OBjqswQOon4C29Cs75fEAr+tq7qJ/XyFYrN/nwblREWUkPUUoxmVzLVj4Im2KjQxQ==";
      if (_pkg === "ecc-universal") return "sha512-D8vFXQ++Aub1CD2RPyYfPEXVt51eEHzvImLd1XaOos/gUxYRWU+BRDXMDnmRrjDfWwX5+uFEJULYpqPYFPSGuw==";
      if (_pkg === "@upstash/context7-mcp") return "sha512-fUARTIZGVKzlzQKDhKUg4aIQ3yEU/12STdfxJDDnLMSN7yyHiPvNHI05iFwxkv3vC8G76Wp27MwK6Jucl/C5pA==";
      if (_pkg === "firecrawl-mcp") return "sha512-Z0PWA9UD757p8w1ahAh6Fyqm28uDc8ng7OkTE3NE0x1F85vAeU4/MMmx1l+xtmDm8OSpybriMjNJZavca4ijfA==";
      if (_pkg === "pi-mcp-adapter") return "sha512-aX7Hf1FMGoHFjjx2Y4t12Hkue83CiBQmZaeQQ0mg+2wxOzbIOYdWzEkh1bmKlLHKiH6zRWlxWitsr+RaiXvoRQ==";
      throw new Error(`Unexpected package: ${_pkg}`);
    };

    const result = await promoteCandidate({
      root: tempDir,
      verifyIntegrity: true,
      resetCandidate: true,
      fetchIntegrity: mockFetch,
    });

    assert.equal(result.candidateReset, true);
    assert.deepEqual(result.promoted.sort(), ["context7", "ecc", "firecrawl", "gsd", "pi"].sort());

    const stable = JSON.parse(await readFile(stablePath, "utf8"));
    assert.equal(stable.components.gsd.version, "1.14.0");
    assert.equal(stable.components.gsd.profile, "standard");
    assert.equal(stable.components.ecc.version, "2.2.1");
    assert.equal(stable.components.mcp.context7.version, "4.1.1");
    assert.equal(stable.components.mcp.firecrawl.version, "3.25.2");
    assert.equal(stable.components.mcpBridges.pi.version, "2.36.0");

    const candidate = JSON.parse(await readFile(candidatePath, "utf8"));
    assert.equal(candidate.status, "empty");
    assert.equal(candidate.generatedAt, null);
    assert.deepEqual(candidate.components, {});

    // Schema validation passes
    const loadedLock = await loadLock(tempDir, "stable");
    assert.equal(loadedLock.components.gsd?.version, "1.14.0");
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("promoteCandidate throws on integrity mismatch", async () => {
  const { tempDir } = await setupTempRepo();
  try {
    const mismatchFetch = async () => "sha512-completely-different-registry-hash==";

    await assert.rejects(
      () =>
        promoteCandidate({
          root: tempDir,
          verifyIntegrity: true,
          fetchIntegrity: mismatchFetch,
        }),
      /Integrity mismatch/u,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
