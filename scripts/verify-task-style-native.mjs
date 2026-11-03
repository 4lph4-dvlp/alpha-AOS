#!/usr/bin/env node

/**
 * Read-only verifier for native execution style proof evidence index.
 * 
 * Enforces D-21, D-22, and D-24:
 * - Read-only index validation: max 64 KiB, max 64 entries, regular file, no symlinks.
 * - Refuses fixture-tier chains and native-label spoofing.
 * - Reopens actual source/result files, verifies producer provenance and artifact hashes.
 * - Verifies git commit existence via git cat-file when gitEvidence is present.
 * - Reports verified / unsupported / unverified / blocked status per route across all six canonical routes.
 * - Zero LLM calls, zero artifact synthesis, zero mutations.
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_INDEX_BYTES = 64 * 1024; // 64 KiB
const MAX_ENTRIES = 64;
const CANONICAL_ROUTES = [
  "conversational-quick",
  "conversational-quick-full",
  "conversational-phase",
  "autopilot-quick",
  "autopilot-quick-full",
  "autopilot-phase",
];
const SUPPORTED_HARNESSES = new Set(["claude", "codex", "antigravity", "pi", "hermes"]);
const MANDATORY_FULL_STAGES = [
  "discussion",
  "research",
  "planning",
  "plan-check",
  "implementation",
  "verification",
  "state-docs",
];

function parseArgs(args) {
  let indexPath = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--index") {
      indexPath = args[++i];
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: node scripts/verify-task-style-native.mjs --index <path> [--json]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!indexPath) {
    console.error("Error: --index <path> is required");
    process.exit(1);
  }

  return { indexPath: resolve(indexPath), jsonOutput };
}

function fail(message, jsonOutput, code = "INVALID_INDEX") {
  if (jsonOutput) {
    console.log(JSON.stringify({ valid: false, code, error: message }, null, 2));
  } else {
    console.error(`Verification Failed [${code}]: ${message}`);
  }
  process.exit(1);
}

function computeFileSha256(filePath) {
  const bytes = readFileSync(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyEntry(entry, indexDir) {
  const issues = [];
  const route = entry.route;

  if (!CANONICAL_ROUTES.includes(route)) {
    return {
      route: route || "unknown",
      status: "blocked",
      reason: `Unknown or non-canonical execution route: '${route}'`,
      issues: [`Unknown route '${route}'`],
    };
  }

  // Check explicit unsupported or unverified marker
  if (entry.status === "unsupported") {
    return {
      route,
      status: "unsupported",
      reason: entry.reason || "Route is explicitly declared unsupported on current host/harness",
      issues: [],
    };
  }

  if (entry.status === "unverified") {
    return {
      route,
      status: "unverified",
      reason: entry.reason || "Route has not undergone live native verification",
      issues: [],
    };
  }

  // Evidence tier must be strictly "native"
  if (entry.evidenceTier !== "native") {
    return {
      route,
      status: "blocked",
      reason: `Evidence tier must be 'native' for native verification; got '${entry.evidenceTier}'. Fixture-tier evidence cannot satisfy native proof.`,
      issues: [`Rejected evidenceTier '${entry.evidenceTier}'`],
    };
  }

  // Provenance check against native-label spoofing
  if (entry.provenance === "fixture" || entry.harness === "fixture" || entry.isFixture === true) {
    return {
      route,
      status: "blocked",
      reason: `Native-label spoofing detected: entry declared evidenceTier 'native' but indicates fixture provenance`,
      issues: ["Spoofed native label on fixture evidence"],
    };
  }

  if (!SUPPORTED_HARNESSES.has(entry.harness)) {
    return {
      route,
      status: "blocked",
      reason: `Unsupported harness '${entry.harness}'`,
      issues: [`Unsupported harness '${entry.harness}'`],
    };
  }

  if (entry.provenance !== "native") issues.push("Missing or invalid native provenance");

  // Project root validation
  if (!entry.projectRoot || typeof entry.projectRoot !== "string") {
    issues.push("Missing or invalid projectRoot");
  } else if (!isAbsolute(entry.projectRoot) && !existsSync(resolve(indexDir, entry.projectRoot))) {
    issues.push(`Referenced projectRoot directory does not exist: ${entry.projectRoot}`);
  } else if (isAbsolute(entry.projectRoot) && !existsSync(entry.projectRoot)) {
    issues.push(`Referenced projectRoot directory does not exist: ${entry.projectRoot}`);
  }

  if (typeof entry.projectRoot !== "string" || !entry.projectRoot) {
    return { route, status: "blocked", reason: issues[0], issues };
  }
  const projRoot = isAbsolute(entry.projectRoot) ? entry.projectRoot : resolve(indexDir, entry.projectRoot);

  // Reopen and verify source locator
  if (typeof entry.sourceLocator !== "string" || !entry.sourceLocator.trim()) {
    issues.push("Missing or invalid sourceLocator");
  } else {
    const srcPath = isAbsolute(entry.sourceLocator) ? entry.sourceLocator : resolve(projRoot, entry.sourceLocator);
    if (!existsSync(srcPath)) {
      issues.push(`Source observation file does not exist: ${srcPath}`);
    } else {
      const stat = lstatSync(srcPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        issues.push(`Source observation path is not a regular file: ${srcPath}`);
      } else if (typeof entry.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/iu.test(entry.sourceSha256)) {
        issues.push("Missing or invalid sourceSha256");
      } else {
        const actualSha = computeFileSha256(srcPath);
        if (actualSha !== entry.sourceSha256) {
          issues.push(`Source SHA-256 mismatch for ${srcPath}: expected ${entry.sourceSha256}, got ${actualSha}`);
        }
      }
    }
  }

  // Reopen and verify result locator
  if (typeof entry.resultLocator !== "string" || !entry.resultLocator.trim()) {
    issues.push("Missing or invalid resultLocator");
  } else {
    const resPath = isAbsolute(entry.resultLocator) ? entry.resultLocator : resolve(projRoot, entry.resultLocator);
    if (!existsSync(resPath)) {
      issues.push(`Result observation file does not exist: ${resPath}`);
    } else {
      const stat = lstatSync(resPath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        issues.push(`Result observation path is not a regular file: ${resPath}`);
      } else if (typeof entry.resultSha256 !== "string" || !/^[a-f0-9]{64}$/iu.test(entry.resultSha256)) {
        issues.push("Missing or invalid resultSha256");
      } else {
        const actualSha = computeFileSha256(resPath);
        if (actualSha !== entry.resultSha256) {
          issues.push(`Result SHA-256 mismatch for ${resPath}: expected ${entry.resultSha256}, got ${actualSha}`);
        }
      }
    }
  }

  // Artifact references verification
  if (Array.isArray(entry.artifacts)) {
    for (const art of entry.artifacts) {
      if (!art.path || typeof art.path !== "string") {
        issues.push("Artifact entry missing path");
        continue;
      }
      const artPath = isAbsolute(art.path) ? art.path : resolve(projRoot, art.path);
      if (!existsSync(artPath)) {
        issues.push(`Referenced artifact does not exist on disk: ${artPath}`);
      } else {
        const stat = lstatSync(artPath);
        if (stat.isSymbolicLink() || !stat.isFile()) {
          issues.push(`Artifact is not a regular file: ${artPath}`);
        } else if (typeof art.sha256 !== "string" || !/^[a-f0-9]{64}$/iu.test(art.sha256)) {
          issues.push("Artifact entry missing or invalid sha256");
        } else {
          const actualSha = computeFileSha256(artPath);
          if (actualSha !== art.sha256) {
            issues.push(`Artifact SHA-256 mismatch for ${artPath}: expected ${art.sha256}, got ${actualSha}`);
          }
        }
      }
    }
  }

  // Git evidence verification
  if (entry.gitEvidence && entry.gitEvidence.commitSha) {
    const commitSha = entry.gitEvidence.commitSha;
    const gitCheck = spawnSync("git", ["cat-file", "-t", commitSha], {
      cwd: projRoot,
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    });
    if (gitCheck.status !== 0 || gitCheck.stdout.trim() !== "commit") {
      issues.push(`Referenced git commit SHA not found in repository: ${commitSha}`);
    }
  }

  // Quality-specific verification for full routes
  if (route === "conversational-quick-full" || route === "autopilot-quick-full") {
    if (!entry.stageReceipts || !Array.isArray(entry.stageReceipts)) {
      issues.push(`Full quality route '${route}' requires stageReceipts array`);
    } else {
      const stagesPresent = new Set();
      for (const rec of entry.stageReceipts) {
        if (!rec.stage || !MANDATORY_FULL_STAGES.includes(rec.stage)) {
          issues.push(`Invalid or non-mandatory stage receipt: ${rec.stage}`);
          continue;
        }
        if (rec.outcome !== "passed") {
          issues.push(`Required stage '${rec.stage}' outcome was '${rec.outcome}' (must be 'passed')`);
        }
        stagesPresent.add(rec.stage);
      }
      for (const reqStage of MANDATORY_FULL_STAGES) {
        if (!stagesPresent.has(reqStage)) {
          issues.push(`Missing mandatory full stage receipt: ${reqStage}`);
        }
      }
    }
  }

  if (issues.length > 0) {
    return {
      route,
      status: "blocked",
      reason: issues[0],
      issues,
    };
  }

  return {
    route,
    status: "verified",
    reason: "Native evidence and proof provenance verified cleanly",
    issues: [],
    details: {
      evidenceTier: entry.evidenceTier,
      harness: entry.harness,
      projectRoot: projRoot,
      runId: entry.runId || null,
      quickId: entry.quickId || null,
      phaseId: entry.phaseId || null,
    },
  };
}

export function verifyTaskStyleNativeProof(indexPath, jsonOutput = false) {
  if (!existsSync(indexPath)) {
    fail(`Index file does not exist: ${indexPath}`, jsonOutput, "INDEX_NOT_FOUND");
  }

  const stat = lstatSync(indexPath);
  if (stat.isSymbolicLink()) {
    fail(`Index file is a symbolic link: ${indexPath}`, jsonOutput, "SYMLINK_REJECTED");
  }
  if (!stat.isFile()) {
    fail(`Index path is not a regular file: ${indexPath}`, jsonOutput, "NOT_A_FILE");
  }
  if (stat.size > MAX_INDEX_BYTES) {
    fail(`Index file exceeds limit of 64 KiB (${stat.size} bytes)`, jsonOutput, "INDEX_TOO_LARGE");
  }

  let parsed;
  try {
    const raw = readFileSync(indexPath, "utf8");
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(`Index is not valid JSON: ${err.message}`, jsonOutput, "INVALID_JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    fail("Index root must be a JSON object", jsonOutput, "INVALID_SHAPE");
  }

  if (parsed.schemaVersion !== 1) {
    fail(`Expected schemaVersion: 1, got ${parsed.schemaVersion}`, jsonOutput, "INVALID_SCHEMA_VERSION");
  }

  if (!Array.isArray(parsed.routes)) {
    fail("Index must contain a 'routes' array", jsonOutput, "MISSING_ROUTES");
  }

  if (parsed.routes.length > MAX_ENTRIES) {
    fail(`Routes array exceeds limit of ${MAX_ENTRIES} entries (${parsed.routes.length})`, jsonOutput, "TOO_MANY_ENTRIES");
  }

  const indexDir = resolve(indexPath, "..");
  const routeResults = {};
  for (const canonical of CANONICAL_ROUTES) {
    routeResults[canonical] = {
      route: canonical,
      status: "unverified",
      reason: "No evidence entry recorded for this route",
      issues: [],
    };
  }

  for (const entry of parsed.routes) {
    if (!entry || typeof entry !== "object") continue;
    const evaluated = verifyEntry(entry, indexDir);
    routeResults[evaluated.route] = evaluated;
  }

  const allVerified = CANONICAL_ROUTES.every((r) => routeResults[r].status === "verified");
  const anyBlocked = CANONICAL_ROUTES.some((r) => routeResults[r].status === "blocked");

  const summary = {
    valid: !anyBlocked,
    allVerified,
    schemaVersion: 1,
    indexPath,
    routes: routeResults,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("=== Native Task Style Proof Verification ===");
    console.log(`Index: ${indexPath}`);
    console.log(`Status: ${allVerified ? "ALL_VERIFIED" : anyBlocked ? "HAS_BLOCKED_ROUTES" : "INCOMPLETE"}`);
    for (const r of CANONICAL_ROUTES) {
      const res = routeResults[r];
      console.log(`  [${res.status.toUpperCase().padEnd(10)}] ${r}: ${res.reason}`);
      if (res.issues && res.issues.length > 1) {
        for (let i = 1; i < res.issues.length; i++) {
          console.log(`      - ${res.issues[i]}`);
        }
      }
    }
  }

  return summary;
}

// Direct execution CLI entrypoint
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { indexPath, jsonOutput } = parseArgs(process.argv.slice(2));
  verifyTaskStyleNativeProof(indexPath, jsonOutput);
}
