#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateThreeOsRun } from "../dist/src/core/release-fault-proof.js";

/**
 * Parses and validates CI metadata JSON according to VER-01 requirements.
 * Reclassifies OS runs and evaluates three-OS release proof conformance.
 */
export function parseCiMetadata(raw) {
  const data = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!data || typeof data !== "object") {
    throw new Error("Invalid CI metadata: must be a non-null object");
  }

  const { candidateSha, candidateTarballSha256, legs } = data;
  if (!candidateSha || typeof candidateSha !== "string") {
    throw new Error("Missing candidateSha in CI metadata");
  }
  if (!candidateTarballSha256 || typeof candidateTarballSha256 !== "string") {
    throw new Error("Missing candidateTarballSha256 in CI metadata");
  }
  if (!Array.isArray(legs)) {
    throw new Error("legs must be an array of CI leg results");
  }

  return evaluateThreeOsRun({
    candidateSha,
    candidateTarballSha256,
    legs,
  });
}

async function main() {
  const args = process.argv.slice(2);
  let metadataPath = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--metadata" && i + 1 < args.length) {
      metadataPath = args[++i];
    } else if (args[i] === "--json") {
      jsonOutput = true;
    }
  }

  if (!metadataPath) {
    process.stderr.write("Usage: node scripts/release-evidence.mjs --metadata <path-to-ci-metadata.json> [--json]\n");
    process.exit(1);
  }

  const content = await readFile(resolve(metadataPath), "utf8");
  const result = parseCiMetadata(content);

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`alpha-AOS v0.2.0 CI Release Proof Evaluation\n`);
    process.stdout.write(`Candidate SHA: ${result.releaseSha}\n`);
    process.stdout.write(`Tarball SHA-256: ${result.tarballSha256}\n`);
    process.stdout.write(`Overall Status: ${result.overallStatus.toUpperCase()}\n`);
    if (result.reason) {
      process.stdout.write(`Reason: ${result.reason}\n`);
    }
    if (result.nextAction) {
      process.stdout.write(`Next Action: ${result.nextAction}\n`);
    }
    process.stdout.write(`\nLegs Summary:\n`);
    for (const leg of result.legs) {
      const faultCount = leg.faults.filter((f) => f.detected).length;
      process.stdout.write(`  - ${leg.os.padEnd(8)}: ${leg.status.toUpperCase()} (${faultCount}/${leg.faults.length} faults detected) [Job: ${leg.jobId}]\n`);
    }
  }

  if (result.overallStatus !== "passed") {
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("release-evidence.mjs")) {
  main().catch((err) => {
    process.stderr.write(`ERROR: ${err.message}\n`);
    process.exit(1);
  });
}
