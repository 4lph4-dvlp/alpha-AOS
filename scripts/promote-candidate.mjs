#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Fetches the live Subresource Integrity (SRI) hash from the official npm registry.
 */
export async function fetchLiveIntegrity(packageName, version) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`npm registry returned HTTP ${res.status} for ${packageName}@${version}`);
  }
  const data = await res.json();
  const integrity = data.dist?.integrity;
  if (!integrity || typeof integrity !== "string") {
    throw new Error(`npm registry metadata lacks dist.integrity for ${packageName}@${version}`);
  }
  return integrity;
}

/**
 * Promotes verified components from candidate.lock.json into stack.lock.json.
 */
export async function promoteCandidate(options = {}) {
  const repositoryRoot = resolve(options.root ?? defaultRepositoryRoot);
  const stableLockPath = options.stableLockPath ?? join(repositoryRoot, "catalog", "stack.lock.json");
  const candidateLockPath = options.candidateLockPath ?? join(repositoryRoot, "catalog", "candidate.lock.json");

  if (!existsSync(stableLockPath)) {
    throw new Error(`Stable lock not found at: ${stableLockPath}`);
  }

  const stable = JSON.parse(await readFile(stableLockPath, "utf8"));
  let candidate;

  if (existsSync(candidateLockPath)) {
    candidate = JSON.parse(await readFile(candidateLockPath, "utf8"));
  }

  // If local candidate lock has no components, attempt reading from origin/automation/dependency-candidate
  if (!candidate?.components || Object.keys(candidate.components).length === 0) {
    try {
      const out = execFileSync(
        "git",
        ["show", "origin/automation/dependency-candidate:catalog/candidate.lock.json"],
        { cwd: repositoryRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      const fromGit = JSON.parse(out);
      if (fromGit?.components && Object.keys(fromGit.components).length > 0) {
        candidate = fromGit;
      }
    } catch {
      // Ignore git lookup failure
    }
  }

  if (!candidate?.components || Object.keys(candidate.components).length === 0) {
    throw new Error("No candidate components found to promote in candidate.lock.json");
  }

  const rawComponents = options.components ?? ["gsd", "ecc", "context7", "firecrawl", "pi"];
  const componentsToPromote = Array.isArray(rawComponents)
    ? rawComponents
    : String(rawComponents).split(",").map((s) => s.trim()).filter(Boolean);

  const fetchIntegrity = options.fetchIntegrity ?? fetchLiveIntegrity;
  const promoted = [];

  for (const comp of componentsToPromote) {
    let candPkg = null;
    if (comp === "gsd") candPkg = candidate.components?.gsd;
    else if (comp === "ecc") candPkg = candidate.components?.ecc;
    else if (comp === "context7" || comp === "firecrawl" || comp === "exa") {
      candPkg = candidate.components?.mcp?.[comp];
    } else if (comp === "pi") {
      candPkg = candidate.components?.mcpBridges?.pi;
    }

    if (!candPkg) continue;

    if (options.verifyIntegrity) {
      const liveIntegrity = await fetchIntegrity(candPkg.package, candPkg.version);
      if (liveIntegrity !== candPkg.integrity) {
        throw new Error(
          `Integrity mismatch for ${candPkg.package}@${candPkg.version}: candidate has ${candPkg.integrity}, registry has ${liveIntegrity}`,
        );
      }
    }

    // Apply component promotion to stable lock structure
    if (comp === "gsd") {
      stable.components.gsd = {
        ...candPkg,
        profile: "standard", // GSD Core standard profile spine invariant
      };
      promoted.push(comp);
    } else if (comp === "ecc") {
      if (!stable.components.ecc) {
        stable.components.ecc = { ...candPkg };
      } else {
        stable.components.ecc.version = candPkg.version;
        stable.components.ecc.integrity = candPkg.integrity;
      }
      promoted.push(comp);
    } else if (comp === "context7" || comp === "firecrawl" || comp === "exa") {
      if (!stable.components.mcp) stable.components.mcp = {};
      stable.components.mcp[comp] = {
        package: candPkg.package,
        version: candPkg.version,
        integrity: candPkg.integrity,
      };
      promoted.push(comp);
    } else if (comp === "pi") {
      if (!stable.components.mcpBridges) stable.components.mcpBridges = {};
      stable.components.mcpBridges.pi = {
        package: candPkg.package,
        version: candPkg.version,
        integrity: candPkg.integrity,
      };
      promoted.push(comp);
    }
  }

  stable.generatedAt = new Date().toISOString();

  let candidateReset = false;

  if (!options.dryRun) {
    await writeFile(stableLockPath, `${JSON.stringify(stable, null, 2)}\n`, "utf8");

    if (options.resetCandidate) {
      const emptyCandidate = {
        schemaVersion: 1,
        channel: "candidate",
        generatedAt: null,
        status: "empty",
        components: {},
      };
      await writeFile(candidateLockPath, `${JSON.stringify(emptyCandidate, null, 2)}\n`, "utf8");
      candidateReset = true;
    }

    // Validate updated lock against schema via catalog loader if available
    const builtCatalog = join(defaultRepositoryRoot, "dist", "src", "core", "catalog.js");
    if (existsSync(builtCatalog)) {
      try {
        const { loadLock } = await import(pathToFileURL(builtCatalog).href);
        await loadLock(repositoryRoot, "stable");
      } catch (err) {
        throw new Error(`Promoted stable lock failed schema validation: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    promoted,
    candidateReset,
    stableLockPath,
    candidateLockPath,
  };
}

/**
 * CLI Entry point for maintainer candidate promotion.
 */
export async function runPromotionCli(args) {
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(`Usage: node scripts/promote-candidate.mjs [options]

Promote verified components from candidate.lock.json to catalog/stack.lock.json.

Options:
  --verify-integrity      Verify live SHA-512 SRI against registry metadata
  --components <list>     Comma-separated components to promote (default: gsd,ecc,context7,firecrawl,pi)
  --reset-candidate       Reset catalog/candidate.lock.json to empty status
  --dry-run               Preview changes without modifying lockfiles
  --root <path>           Repository root directory
  --help, -h              Show this help message
`);
    return { exitCode: 0 };
  }

  const dryRun = args.includes("--dry-run");
  const verifyIntegrity = args.includes("--verify-integrity");
  const resetCandidate = args.includes("--reset-candidate");

  let components;
  const compIdx = args.indexOf("--components");
  if (compIdx !== -1 && args[compIdx + 1] && !args[compIdx + 1].startsWith("-")) {
    components = args[compIdx + 1].split(",").map((s) => s.trim()).filter(Boolean);
  }

  let root;
  const rootIdx = args.indexOf("--root");
  if (rootIdx !== -1 && args[rootIdx + 1] && !args[rootIdx + 1].startsWith("-")) {
    root = args[rootIdx + 1];
  }

  const result = await promoteCandidate({
    root,
    components,
    verifyIntegrity,
    resetCandidate,
    dryRun,
  });

  process.stdout.write(`Promotion complete:
  Promoted components: ${result.promoted.join(", ")}
  Dry run: ${dryRun}
  Candidate reset: ${result.candidateReset}
  Stable lock: ${result.stableLockPath}
`);

  return { exitCode: 0 };
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;
if (isMain) {
  try {
    const result = await runPromotionCli(process.argv.slice(2));
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`alpha-aos promote-candidate: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
