#!/usr/bin/env node
// Unattended weekly dependency promotion.
//
// `stage` runs on Monday inside .github/workflows/dependency-candidate.yml after
// `alpha-aos update --stage --apply` has written catalog/candidate.lock.json.
// It promotes every changed component into catalog/stack.lock.json, re-pins
// ECC skill hashes when the ECC runtime moved, and resets the candidate lock.
// The resulting commit touches only the two lock files, so it never conflicts
// with feature work. The workflow then runs the full CI matrix against it.
//
// `verify-registry` runs on Wednesday in .github/workflows/auto-promote.yml
// before the verified commit is fast-forwarded onto main. For every package
// whose pin differs from the base lock it re-fetches the registry record and
// refuses when the version was unpublished, its integrity changed, or it is
// younger than the cooldown. Unpublished-after-release is the common fate of a
// malicious version, which is what the two-day gap is for.

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promoteCandidate } from "./promote-candidate.mjs";

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HARNESSES = ["claude", "codex", "antigravity", "pi", "hermes"];
export const ALL_COMPONENTS = ["gsd", "ecc", "context7", "exa", "firecrawl", "pi"];
const DEFAULT_MIN_AGE_HOURS = 36;

/** `component -> {package, version, integrity}` for every pinned package in a lock document. */
export function lockedPackages(lock) {
  const components = lock?.components ?? {};
  const packages = {};
  if (components.gsd) packages.gsd = components.gsd;
  if (components.ecc) packages.ecc = components.ecc;
  for (const [id, entry] of Object.entries(components.mcp ?? {})) packages[`mcp:${id}`] = entry;
  for (const [id, entry] of Object.entries(components.mcpBridges ?? {})) {
    if (entry) packages[`mcp-bridge:${id}`] = entry;
  }
  return packages;
}

/** Components whose version or integrity differs between two lock documents. */
export function changedPackages(base, next) {
  const before = lockedPackages(base);
  const after = lockedPackages(next);
  const changes = [];
  for (const [id, entry] of Object.entries(after)) {
    const previous = before[id];
    if (previous?.version === entry.version && previous?.integrity === entry.integrity) continue;
    changes.push({
      id,
      package: entry.package,
      from: previous?.version ?? null,
      to: entry.version,
      integrity: entry.integrity,
    });
  }
  return changes;
}

export function describeChanges(changes) {
  return changes.map((change) => `${change.id} ${change.from ?? "(new)"} -> ${change.to}`).join(", ");
}

function writeOutputs(outputs) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  for (const [key, value] of Object.entries(outputs)) appendFileSync(target, `${key}=${value}\n`, "utf8");
}

function runNode(root, args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`node ${args.join(" ")} exited with ${result.status ?? result.signal}`);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/**
 * Recomputes the per-harness target hashes of the global ECC skills from the
 * locked tarball. pin-pack-skills re-pins source hashes only; the targets are
 * what `ecc sync` compares a rendered skill against before writing it.
 */
async function recomputeEccTargets(root, runEccFixture) {
  const lockPath = join(root, "catalog", "stack.lock.json");
  const document = await readJson(lockPath);
  const ecc = document.components?.ecc;
  if (!ecc) throw new Error("catalog/stack.lock.json has no ECC component");
  const globalSkills = Object.keys(ecc.targetSha256 ?? {});
  if (globalSkills.length === 0) throw new Error("catalog/stack.lock.json names no global ECC skills in targetSha256");
  const targets = {};
  for (const harness of HARNESSES) {
    const result = await runEccFixture({ harness, ecc: { ...ecc, skills: globalSkills }, skills: globalSkills });
    if (result.integrity !== ecc.integrity) throw new Error(`ECC integrity mismatch while rendering ${harness}`);
    for (const skill of globalSkills) {
      if (result.sourceHashes[skill] !== ecc.sourceSha256[skill]) {
        throw new Error(`ECC source hash for ${skill} disagrees with the re-pinned lock`);
      }
      targets[skill] = { ...(targets[skill] ?? {}), [harness]: result.targetHashes[skill] };
    }
  }
  ecc.targetSha256 = targets;
  await writeFile(lockPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function loadEccFixture(root) {
  const built = join(root, "dist", "src", "core", "ecc-fixture.js");
  if (!existsSync(built)) throw new Error("no compiled ECC fixture at dist/src/core/ecc-fixture.js; run npm run build first");
  return (await import(pathToFileURL(built).href)).runEccFixture;
}

/**
 * Promotes every changed candidate component into the stable lock. Returns the
 * list of changes; an empty list means nothing was written.
 */
export async function stagePromotion(options = {}) {
  const root = resolve(options.root ?? defaultRepositoryRoot);
  const stablePath = join(root, "catalog", "stack.lock.json");
  const candidatePath = join(root, "catalog", "candidate.lock.json");
  const candidate = existsSync(candidatePath) ? await readJson(candidatePath) : null;
  // An empty candidate means `update --stage` found nothing new. It must not
  // fall through to promoteCandidate, which would read a stale branch copy.
  if (!candidate?.components || Object.keys(candidate.components).length === 0) return [];

  const before = await readJson(stablePath);
  const pending = changedPackages(before, candidate);
  if (pending.length === 0) return [];

  await promoteCandidate({
    root,
    components: ALL_COMPONENTS,
    verifyIntegrity: true,
    resetCandidate: true,
    ...(options.fetchIntegrity ? { fetchIntegrity: options.fetchIntegrity } : {}),
  });

  const after = await readJson(stablePath);
  const changes = changedPackages(before, after);
  if (changes.some((change) => change.id === "ecc")) {
    const repin = options.repinEcc ?? (async () => {
      runNode(root, ["scripts/pin-pack-skills.mjs", "write", "--all"]);
      await recomputeEccTargets(root, await loadEccFixture(root));
      runNode(root, ["scripts/pin-pack-skills.mjs", "check"]);
    });
    await repin(root);
  }
  return changes;
}

async function fetchPackument(name) {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status} for ${name}`);
  return response.json();
}

/**
 * Re-checks every package that differs from the base lock against the live
 * registry. Returns the list of problems; empty means the promotion may land.
 */
export async function verifyRegistry(base, next, options = {}) {
  const fetchDocument = options.fetchPackument ?? fetchPackument;
  const now = options.now ?? Date.now();
  const minAgeHours = options.minAgeHours ?? DEFAULT_MIN_AGE_HOURS;
  const problems = [];
  for (const change of changedPackages(base, next)) {
    let document;
    try {
      document = await fetchDocument(change.package);
    } catch (error) {
      problems.push(`${change.package}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const published = document?.versions?.[change.to];
    if (!published) {
      problems.push(`${change.package}@${change.to} is no longer published`);
      continue;
    }
    if (published.dist?.integrity !== change.integrity) {
      problems.push(`${change.package}@${change.to} integrity changed on the registry`);
    }
    const publishedAt = Date.parse(document?.time?.[change.to] ?? "");
    if (Number.isNaN(publishedAt)) {
      problems.push(`${change.package}@${change.to} has no publish time`);
    } else if (now - publishedAt < minAgeHours * 3_600_000) {
      problems.push(`${change.package}@${change.to} is younger than the ${minAgeHours}h cooldown`);
    }
  }
  return problems;
}

function gitShow(root, spec) {
  const result = spawnSync("git", ["show", spec], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`git show ${spec} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

export async function runAutoPromoteCli(args) {
  const mode = args[0];
  const root = resolve(optionValue(args, "--root") ?? defaultRepositoryRoot);
  if (mode === "stage") {
    const changes = await stagePromotion({ root });
    const summary = describeChanges(changes);
    process.stdout.write(changes.length > 0 ? `Promoted into stable lock: ${summary}\n` : "No dependency version changes.\n");
    writeOutputs({ changed: changes.length > 0 ? "true" : "false", summary: summary || "none" });
    return 0;
  }
  if (mode === "verify-registry") {
    const baseRef = optionValue(args, "--base") ?? "origin/main";
    const minAge = optionValue(args, "--min-age-hours");
    const base = JSON.parse(gitShow(root, `${baseRef}:catalog/stack.lock.json`));
    const next = await readJson(join(root, "catalog", "stack.lock.json"));
    const changes = changedPackages(base, next);
    const problems = await verifyRegistry(base, next, minAge ? { minAgeHours: Number(minAge) } : {});
    if (problems.length > 0) {
      process.stderr.write(`alpha-aos auto-promote: registry re-verification refused ${problems.length} package(s):\n`);
      for (const problem of problems) process.stderr.write(`  ${problem}\n`);
      return 1;
    }
    process.stdout.write(`Registry re-verified: ${describeChanges(changes) || "no changed packages"}\n`);
    return 0;
  }
  process.stderr.write("Usage: node scripts/auto-promote.mjs stage | verify-registry [--base <ref>] [--min-age-hours <n>]\n");
  return 2;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) {
  try {
    process.exitCode = await runAutoPromoteCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`alpha-aos auto-promote: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
