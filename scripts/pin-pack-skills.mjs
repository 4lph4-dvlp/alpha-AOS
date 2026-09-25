#!/usr/bin/env node
// Pins the source hash of every skill any declared pack names into
// `catalog/stack.lock.json`.
//
// This exists so `alpha-aos project plan` can state each selected pack's exact
// source version and hash while touching no network and no package manager
// (D-08). `src/core/ecc-skills.ts` throws when `sourceSha256` lacks a skill, so
// without pinning, the first pack whose skill is unpinned would make planning
// fail at the moment it is needed — and resolving at plan time would put an npm
// invocation back on a preview path, which is what plan 01-21 removed.
//
// This is a MAINTAINER script. It is the only place in the pack-skill path
// where a package manager runs. It acquires `ecc-universal` through
// `runEccFixture`, which compares the packed tarball's integrity against the
// locked `components.ecc.integrity` and throws on mismatch; hashes are never
// read out of a global `node_modules` install.
//
// It never writes `catalog/candidate.lock.json`: the stable lock is the
// authority, and the candidate lock must never reach an end-user apply path.

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOCK = "catalog/stack.lock.json";
const PACK_DIRECTORY = "catalog/packs";
/** The fixture renders per harness; raw source bytes are harness-independent. */
const HARNESS = "codex";

/**
 * The compiled acquisition path. A maintainer script must not carry a second
 * implementation of hashing or integrity checking, so it runs the same code a
 * user's sync runs.
 */
async function loadCompiled() {
  const built = join(repositoryRoot, "dist", "src", "core", "ecc-fixture.js");
  if (!existsSync(built)) {
    throw new Error("no compiled ECC fixture at dist/src/core/ecc-fixture.js; run npm run build first");
  }
  const [fixture, catalog, packCatalog] = await Promise.all([
    import(new URL("../dist/src/core/ecc-fixture.js", import.meta.url).href),
    import(new URL("../dist/src/core/catalog.js", import.meta.url).href),
    import(new URL("../dist/src/core/pack-catalog.js", import.meta.url).href),
  ]);
  return {
    runEccFixture: fixture.runEccFixture,
    loadLock: catalog.loadLock,
    loadPackCatalogStrict: packCatalog.loadPackCatalogStrict,
  };
}

/**
 * Every pack file, read from the directory rather than from a name list in
 * this script. D-05's whole point is that adding a pack is a YAML edit; a
 * hardcoded list here would reintroduce the code edit it removes.
 *
 * An empty directory is a loud failure, never a successful no-op: a catalog
 * that silently stopped being read would look like one that declares nothing.
 */
async function declaredPackFiles() {
  const names = (await readdir(join(repositoryRoot, "catalog", "packs")))
    .filter((name) => name.endsWith(".yaml"))
    .sort();
  if (names.length === 0) throw new Error(`no pack files under ${PACK_DIRECTORY}`);
  return names.map((name) => `${PACK_DIRECTORY}/${name}`);
}

/**
 * The union of every declared pack's skills, through the strict
 * managed-document route rather than a bare YAML parse, so a malformed pack
 * file is a refusal. `catalog/packs/backend.yaml` declares `skills: []` for
 * API, so an empty list is normal and contributes nothing.
 */
async function declaredPackSkills(loadPackCatalogStrict) {
  const files = await declaredPackFiles();
  const catalog = await loadPackCatalogStrict(repositoryRoot, files);
  const skills = new Set();
  for (const pack of catalog.value.packs) {
    for (const skill of pack.skills ?? []) skills.add(skill);
  }
  return { files, skills: [...skills].sort() };
}

/**
 * Acquires the locked ECC tarball and returns the sha256 of each named skill's
 * raw `SKILL.md`. The three global skills ride along as the cross-check that
 * validates the whole run: they must hash to the values already in the lock,
 * which proves both that `sourceSha256` means the sha256 of the raw `SKILL.md`
 * bytes and that the acquired tree matches the locked tarball.
 */
async function acquire({ runEccFixture, loadLock }, packSkills, isUpgrade = false) {
  const lock = await loadLock(repositoryRoot);
  const ecc = lock.components.ecc;
  if (!ecc) throw new Error(`${LOCK} has no ECC component`);

  const requested = [...new Set([...ecc.skills, ...packSkills])];
  const result = await runEccFixture({
    harness: HARNESS,
    ecc: { ...ecc, skills: requested },
    skills: requested,
  });
  if (result.integrity !== ecc.integrity) throw new Error("ECC tarball integrity mismatch after acquisition");

  for (const skill of ecc.skills) {
    const pinned = ecc.sourceSha256[skill];
    const acquired = result.sourceHashes[skill];
    if (pinned !== acquired) {
      if (isUpgrade) {
        process.stdout.write(`notice: hash changed for ${skill}: ${pinned} -> ${acquired}\n`);
      } else {
        throw new Error(`cross-check failed: ${skill} is pinned as ${pinned} but the locked tarball hashes to ${acquired}`);
      }
    }
  }
  return { ecc, sourceHashes: result.sourceHashes };
}

/** The raw lock document, so unregistered fields survive a write untouched. */
async function readLockDocument() {
  return JSON.parse(await readFile(join(repositoryRoot, "catalog", "stack.lock.json"), "utf8"));
}

/**
 * Existing entries keep their position and their bytes; new ones are appended
 * in sorted order. Deterministic and idempotent: a second run appends nothing,
 * so the file does not churn between runs.
 */
function mergeSorted(existing, additions) {
  const merged = { ...existing };
  const sorted = [...additions].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  for (const [key, value] of sorted) merged[key] = value;
  return merged;
}

async function write(isUpgrade = false) {
  const compiled = await loadCompiled();
  const { files, skills } = await declaredPackSkills(compiled.loadPackCatalogStrict);
  const { sourceHashes } = await acquire(compiled, skills, isUpgrade);

  const document = await readLockDocument();
  const ecc = document.components?.ecc;
  if (!ecc) throw new Error(`${LOCK} has no ECC component`);

  const additions = [];
  const allSkills = [...new Set([...ecc.skills, ...skills])];
  for (const skill of allSkills) {
    const hash = sourceHashes[skill];
    if (typeof hash !== "string") continue;
    if (isUpgrade) {
      if (ecc.sourceSha256[skill] !== hash) {
        additions.push([skill, hash]);
      }
    } else {
      if (ecc.sourceSha256[skill] === undefined) {
        additions.push([skill, hash]);
      }
    }
  }
  ecc.sourceSha256 = mergeSorted(ecc.sourceSha256, additions);
  // `targetSha256` is deliberately NOT written for pack skills: the render is
  // identity for all of them, the schema does not require it, and per-harness
  // targets are Phase 3's concern.
  const newSkills = skills.filter((skill) => !ecc.skills.includes(skill)).sort();
  ecc.skills = [...ecc.skills, ...newSkills];

  await writeFile(join(repositoryRoot, "catalog", "stack.lock.json"), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  process.stdout.write(
    `pinned pack skills: ${LOCK} now carries ${Object.keys(ecc.sourceSha256).length} source hashes `
    + `(${additions.length} updated/added, from ${files.length} pack files)\n`,
  );
}

async function check() {
  const compiled = await loadCompiled();
  const { skills } = await declaredPackSkills(compiled.loadPackCatalogStrict);
  const { ecc, sourceHashes } = await acquire(compiled, skills, false);

  const problems = [];
  for (const skill of skills) {
    const pinned = ecc.sourceSha256[skill];
    const acquired = sourceHashes[skill];
    if (pinned === undefined) problems.push(`missing from ${LOCK}: ${skill}`);
    else if (pinned !== acquired) problems.push(`hash mismatch: ${skill} (locked ${pinned}, acquired ${acquired})`);
    if (!ecc.skills.includes(skill)) problems.push(`missing from components.ecc.skills: ${skill}`);
  }

  if (problems.length > 0) {
    process.stderr.write(`alpha-aos: ${problems.length} pack skill problem(s) in ${LOCK}.\n`);
    for (const problem of problems) process.stderr.write(`  ${problem}\n`);
    process.stderr.write("Run node scripts/pin-pack-skills.mjs write to re-pin from the locked tarball.\n");
    return 3;
  }
  process.stdout.write(`pack skills verified: ${skills.length} pack skills pinned in ${LOCK}\n`);
  return 0;
}

const isUpgrade = process.argv.some((arg) => arg === "--all" || arg === "--update-all" || arg === "--recompute");
const mode = process.argv[2] ?? "";
try {
  if (mode === "write") {
    await write(isUpgrade);
  } else if (mode === "check") {
    process.exitCode = await check();
  } else {
    process.stderr.write("Usage: node scripts/pin-pack-skills.mjs write|check [--all|--update-all|--recompute]\n");
    process.exitCode = 2;
  }
} catch (error) {
  // A sourceless pack is reported, never pinned with a placeholder and never
  // dropped silently.
  process.stderr.write(`alpha-aos: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 3;
}
