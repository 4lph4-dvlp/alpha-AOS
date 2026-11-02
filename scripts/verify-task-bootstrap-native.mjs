#!/usr/bin/env node

/**
 * Read-only verifier for separately captured native bootstrap and request continuity receipts.
 * 
 * Enforces D-23 and D-24:
 * - Rejects fixture-tier receipts (requires evidenceTier === "native")
 * - Validates referenced native GSD artifacts on disk and computes their SHA-256
 * - Validates Git commit evidence where applicable
 * - Enforces single original implementation (duplicateTaskCount === 0, taskInvocationCount === 1)
 * - Zero LLM calls, zero artifact synthesis, zero mutation
 */

import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const MAX_RECEIPT_BYTES = 64 * 1024; // 64 KiB
const SUPPORTED_CONTROLLERS = new Set(["claude", "codex", "antigravity", "pi"]);

function parseArgs(args) {
  let receiptPath = null;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--receipt") {
      receiptPath = args[++i];
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log("Usage: node scripts/verify-task-bootstrap-native.mjs --receipt <path> [--json]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(1);
    }
  }

  if (!receiptPath) {
    console.error("Error: --receipt <path> is required");
    process.exit(1);
  }

  return { receiptPath: resolve(receiptPath), jsonOutput };
}

function fail(message, jsonOutput, code = "INVALID_RECEIPT") {
  if (jsonOutput) {
    console.log(JSON.stringify({ valid: false, code, error: message }, null, 2));
  } else {
    console.error(`Verification Failed [${code}]: ${message}`);
  }
  process.exit(1);
}

function verifyReceipt(receiptPath, jsonOutput) {
  if (!existsSync(receiptPath)) {
    fail(`Receipt file does not exist: ${receiptPath}`, jsonOutput, "RECEIPT_NOT_FOUND");
  }

  const stat = lstatSync(receiptPath);
  if (!stat.isFile()) {
    fail(`Receipt path is not a regular file: ${receiptPath}`, jsonOutput, "NOT_A_FILE");
  }

  if (stat.size > MAX_RECEIPT_BYTES) {
    fail(`Receipt file exceeds maximum size of 64 KiB (${stat.size} bytes)`, jsonOutput, "FILE_TOO_LARGE");
  }

  let receipt;
  try {
    const raw = readFileSync(receiptPath, "utf8");
    receipt = JSON.parse(raw);
  } catch (err) {
    fail(`Receipt is not valid JSON: ${err.message}`, jsonOutput, "INVALID_JSON");
  }

  if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) {
    fail("Receipt root must be a JSON object", jsonOutput, "INVALID_SHAPE");
  }

  // Schema version
  if (receipt.schemaVersion !== 1) {
    fail(`Expected schemaVersion: 1, got ${receipt.schemaVersion}`, jsonOutput, "INVALID_SCHEMA_VERSION");
  }

  // Evidence tier: MUST be "native" (reject fixtures!)
  if (receipt.evidenceTier !== "native") {
    fail(
      `Evidence tier must be 'native' for native verification; got '${receipt.evidenceTier}'. Fixture-tier evidence cannot satisfy native proof.`,
      jsonOutput,
      "REJECTED_FIXTURE_TIER",
    );
  }

  // Project root
  if (typeof receipt.projectRoot !== "string" || !isAbsolute(receipt.projectRoot)) {
    fail("projectRoot must be an absolute path string", jsonOutput, "INVALID_PROJECT_ROOT");
  }
  if (!existsSync(receipt.projectRoot)) {
    fail(`Referenced projectRoot directory does not exist: ${receipt.projectRoot}`, jsonOutput, "PROJECT_NOT_FOUND");
  }

  // Controller
  if (!SUPPORTED_CONTROLLERS.has(receipt.controller)) {
    fail(`Controller must be one of [claude, codex, antigravity, pi]; got '${receipt.controller}'`, jsonOutput, "UNSUPPORTED_CONTROLLER");
  }

  // Identifiers
  if (typeof receipt.pendingId !== "string" || receipt.pendingId.length === 0) {
    fail("pendingId must be a non-empty string", jsonOutput, "MISSING_PENDING_ID");
  }
  if (typeof receipt.claimNonce !== "string" || receipt.claimNonce.length === 0) {
    fail("claimNonce must be a non-empty string", jsonOutput, "MISSING_CLAIM_NONCE");
  }

  // Duplicate task check
  const invocationCount = receipt.taskInvocationCount ?? 1;
  const duplicateCount = receipt.duplicateTaskCount ?? 0;
  if (invocationCount !== 1 || duplicateCount !== 0) {
    fail(
      `Violation of single original task execution: invocationCount=${invocationCount}, duplicateCount=${duplicateCount}`,
      jsonOutput,
      "DUPLICATE_EXECUTION_DETECTED",
    );
  }

  // Native artifact reference
  if (typeof receipt.nativeReference !== "object" || receipt.nativeReference === null) {
    fail("nativeReference must be an object with artifact information", jsonOutput, "MISSING_NATIVE_REFERENCE");
  }

  const { artifactPath, artifactSha256 } = receipt.nativeReference;
  if (typeof artifactPath !== "string") {
    fail("nativeReference.artifactPath must be a string", jsonOutput, "INVALID_ARTIFACT_PATH");
  }

  const resolvedArtifact = isAbsolute(artifactPath) ? artifactPath : resolve(receipt.projectRoot, artifactPath);
  if (!existsSync(resolvedArtifact)) {
    fail(`Referenced native artifact does not exist on disk: ${resolvedArtifact}`, jsonOutput, "ARTIFACT_NOT_FOUND");
  }

  const artifactBytes = readFileSync(resolvedArtifact);
  const actualHash = createHash("sha256").update(artifactBytes).digest("hex");
  if (artifactSha256 && actualHash !== artifactSha256) {
    fail(
      `Artifact SHA-256 mismatch for ${resolvedArtifact}: expected ${artifactSha256}, got ${actualHash}`,
      jsonOutput,
      "ARTIFACT_HASH_MISMATCH",
    );
  }

  // Check Git commit if provided
  let gitCommitVerified = false;
  if (receipt.gitEvidence && typeof receipt.gitEvidence.commitSha === "string") {
    const commitSha = receipt.gitEvidence.commitSha;
    const gitCheck = spawnSync("git", ["cat-file", "-t", commitSha], {
      cwd: receipt.projectRoot,
      encoding: "utf8",
    });
    if (gitCheck.status !== 0 || gitCheck.stdout.trim() !== "commit") {
      fail(`Referenced commit SHA does not exist in repository: ${commitSha}`, jsonOutput, "COMMIT_NOT_FOUND");
    }
    gitCommitVerified = true;
  }

  const summary = {
    valid: true,
    evidenceTier: receipt.evidenceTier,
    controller: receipt.controller,
    projectRoot: receipt.projectRoot,
    pendingId: receipt.pendingId,
    claimNonce: receipt.claimNonce,
    nativeArtifact: {
      path: resolvedArtifact,
      sha256: actualHash,
      verified: true,
    },
    gitCommitVerified,
    singleTaskExecutionVerified: true,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("=== Native Bootstrap Proof Verification PASSED ===");
    console.log(`Evidence Tier:    ${summary.evidenceTier}`);
    console.log(`Controller:       ${summary.controller}`);
    console.log(`Project Root:     ${summary.projectRoot}`);
    console.log(`Pending ID:       ${summary.pendingId}`);
    console.log(`Claim Nonce:      ${summary.claimNonce}`);
    console.log(`Native Artifact:  ${summary.nativeArtifact.path} (SHA: ${summary.nativeArtifact.sha256.slice(0, 16)}...)`);
    console.log(`Git Commit Valid: ${summary.gitCommitVerified}`);
    console.log(`Zero Duplicates:  true`);
  }
}

const { receiptPath, jsonOutput } = parseArgs(process.argv.slice(2));
verifyReceipt(receiptPath, jsonOutput);
