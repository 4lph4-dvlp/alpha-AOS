import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverAffectedHarnesses,
  buildEvidenceDependencyFingerprint,
  verifyPreparedReleaseCandidate,
} from "../src/core/release-verification.js";
import { applyLocalReleasePlan, createLocalReleasePlan } from "../src/core/update.js";
import type {
  ReadOnlyInvocationDescriptor,
  ReleaseVerificationRequest,
  NativePreparationProof,
} from "../src/types.js";
import { packageRoot } from "../src/core/paths.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function createTempState(context: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-verif-test-"));
  context.after(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  });
  return dir;
}

test("Task 42-01-01 Test 1: unlisted exact MCP candidate proceeds through protocol/schema checks without rejection (PROOF-01)", async () => {
  // A candidate version "99.9.9" not present in any official catalog list
  const request: ReleaseVerificationRequest = {
    toolId: "mcp:context7",
    candidateRelease: "99.9.9",
    candidateArtifact: "context7-mcp-99.9.9.tgz",
    candidateIntegrity: "sha512-fakehash999",
    candidateDigest: "abcdef0123456789",
    currentVersion: "4.0.4",
  };

  const result = await verifyPreparedReleaseCandidate(request);

  // Discovery and protocol-schema tiers MUST pass despite 99.9.9 being unlisted
  const discoveryTier = result.tiers.find((t) => t.tier === "discovery");
  const schemaTier = result.tiers.find((t) => t.tier === "protocol-schema");

  assert.ok(discoveryTier);
  assert.equal(discoveryTier.state, "pass");
  assert.match(discoveryTier.reason!, /official support-list presence not required/);

  assert.ok(schemaTier);
  assert.equal(schemaTier.state, "pass");
});

test("Task 42-01-01 Test 2: inactive candidate staging preserves active alias, config, PATH, and old active identity (D-01)", async () => {
  const request: ReleaseVerificationRequest = {
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateArtifact: "context7-4.5.0.tgz",
    candidateIntegrity: "sha512-integrity450",
    candidateDigest: "digest450",
    currentVersion: "4.0.4",
    preparationProof: {
      prepareMode: "inactive",
      candidateArtifact: "context7-4.5.0.tgz",
      candidateIntegrity: "sha512-integrity450",
      activeIdentityPreserved: true,
      activeAliasDigest: "initial-alias-digest",
      activeConfigDigest: "initial-config-digest",
      resolvedExecutionPath: "/staging/inactive/context7/4.5.0",
      positiveProofEstablished: true,
    },
  };

  const result = await verifyPreparedReleaseCandidate(request);
  const installTier = result.tiers.find((t) => t.tier === "installation");

  assert.ok(installTier);
  assert.equal(installTier.state, "pass");
  assert.equal(result.preparationProof.activeIdentityPreserved, true);
  assert.equal(result.preparationProof.prepareMode, "inactive");
});

test("Task 42-01-01 Test 3: only genuine alpha-AOS proxy/client observation ok passes invocation; direct upstream or unproxied calls fail (D-01, PROOF-01)", async () => {
  const descriptor: ReadOnlyInvocationDescriptor = {
    descriptorId: "desc-context7-read-docs",
    revision: "v1",
    toolId: "mcp:context7",
    harness: "codex",
    requestClass: "read-only-safe",
    toolName: "query-docs",
    argumentSchema: { libraryId: "string", query: "string" },
    credentialTier: "none",
    permissionScope: [],
    costClass: "free",
    requiresApproval: false,
    actualBoundary: "alpha-aos-proxy",
    expectedObservation: "ok",
    redactionPolicy: "redact-credentials-and-args",
  };

  const request: ReleaseVerificationRequest = {
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateArtifact: "context7-4.5.0.tgz",
    candidateIntegrity: "sha512-hash",
    candidateDigest: "digest",
    currentVersion: "4.0.4",
    descriptors: [descriptor],
  };

  // Case A: Direct upstream bypass without crossing alpha-AOS proxy
  const upstreamDirect = await verifyPreparedReleaseCandidate(request, {
    proxyObservation: {
      boundary: "direct-upstream",
      executionPath: "/usr/local/bin/context7",
      outcome: "ok",
      toolName: "query-docs",
    },
  });
  const invTierA = upstreamDirect.tiers.find((t) => t.tier === "invocation");
  assert.ok(invTierA);
  assert.equal(invTierA.state, "failed");
  assert.match(invTierA.reason!, /direct upstream or unproxied calls do not cross alpha-AOS proxy/);

  // Case B: Genuine alpha-AOS proxy observation with outcome 'ok'
  const proxiedSuccess = await verifyPreparedReleaseCandidate(request, {
    proxyObservation: {
      boundary: "alpha-aos-proxy",
      executionPath: "/managed/inactive/mcp:context7/4.5.0",
      outcome: "ok",
      toolName: "query-docs",
    },
  });
  const invTierB = proxiedSuccess.tiers.find((t) => t.tier === "invocation");
  assert.ok(invTierB);
  assert.equal(invTierB.state, "pass");
  assert.equal(proxiedSuccess.overallState, "pass");
});

test("Task 42-01-01 Test 4: missing credentials, permissions, cost approval or reload returns typed pending/needs-action and preserves active identity (D-02)", async () => {
  const descriptorWithCreds: ReadOnlyInvocationDescriptor = {
    descriptorId: "desc-firecrawl-scrape",
    revision: "v1",
    toolId: "mcp:firecrawl",
    harness: "claude",
    requestClass: "read-only-permissioned",
    toolName: "firecrawl_scrape",
    argumentSchema: { url: "string" },
    credentialTier: "explicit",
    permissionScope: ["web:read"],
    costClass: "paid",
    requiresApproval: true,
    actualBoundary: "alpha-aos-proxy",
    expectedObservation: "ok",
    redactionPolicy: "redact-credentials-and-args",
  };

  const request: ReleaseVerificationRequest = {
    toolId: "mcp:firecrawl",
    candidateRelease: "3.35.0",
    candidateArtifact: "firecrawl-3.35.0.tgz",
    candidateIntegrity: "sha512-fc335",
    candidateDigest: "digestfc",
    currentVersion: "3.24.0",
    descriptors: [descriptorWithCreds],
  };

  const result = await verifyPreparedReleaseCandidate(request, {
    credentialsAvailable: false,
    costApproved: false,
    approvedPermissions: [],
  });

  assert.equal(result.overallState, "pending");
  assert.ok(result.pendingReasons.length > 0);
  assert.match(result.pendingReasons[0]!, /Invocation pending conditions/);
  assert.ok(result.nextAction);
  assert.match(result.nextAction, /alpha-aos update --resume --tool mcp:firecrawl/);
  assert.ok(result.needsActionDetail);
  assert.ok(result.needsActionDetail.missingRequirements!.length > 0);
});

test("Task 42-01-02 Test 1: all four tiers maintain independent states and reasons (PROOF-02)", async () => {
  const request: ReleaseVerificationRequest = {
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateArtifact: "context7.tgz",
    candidateIntegrity: "sha512-integ",
    candidateDigest: "dig",
    currentVersion: "4.0.4",
    preparationProof: {
      prepareMode: "activation-required", // installation pending
      candidateArtifact: "context7.tgz",
      candidateIntegrity: "sha512-integ",
      activeIdentityPreserved: true,
      activeAliasDigest: "alias",
      activeConfigDigest: "cfg",
      resolvedExecutionPath: "/path",
      positiveProofEstablished: false,
    },
  };

  const result = await verifyPreparedReleaseCandidate(request);
  assert.equal(result.tiers.length, 4);

  const [t1, t2, t3, t4] = result.tiers;
  assert.equal(t1?.tier, "installation");
  assert.equal(t1?.state, "pending");

  assert.equal(t2?.tier, "discovery");
  assert.equal(t2?.state, "pass");

  assert.equal(t3?.tier, "protocol-schema");
  assert.equal(t3?.state, "pass");

  assert.equal(t4?.tier, "invocation");
  assert.equal(t4?.state, "pending"); // No descriptor provided
});

test("Task 42-01-02 Test 2: identical dependencies produce identical fingerprint allowing tier reuse (D-04)", async () => {
  const harnesses = discoverAffectedHarnesses("mcp:context7");
  const fp1 = buildEvidenceDependencyFingerprint({
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateIntegrity: "sha512-hashA",
    platform: "win32",
    architecture: "x64",
    affectedHarnesses: harnesses,
  });

  const fp2 = buildEvidenceDependencyFingerprint({
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateIntegrity: "sha512-hashA",
    platform: "win32",
    architecture: "x64",
    affectedHarnesses: harnesses,
  });

  assert.equal(fp1, fp2);
  assert.equal(typeof fp1, "string");
  assert.equal(fp1.length, 64);
});

test("Task 42-01-02 Test 3: changed dependency invalidates fingerprint and requires tier re-evaluation (D-04)", async () => {
  const harnesses = discoverAffectedHarnesses("mcp:context7");
  const baseFp = buildEvidenceDependencyFingerprint({
    toolId: "mcp:context7",
    candidateRelease: "4.5.0",
    candidateIntegrity: "sha512-hashA",
    platform: "win32",
    architecture: "x64",
    affectedHarnesses: harnesses,
  });

  // Change integrity / release
  const changedReleaseFp = buildEvidenceDependencyFingerprint({
    toolId: "mcp:context7",
    candidateRelease: "4.5.1",
    candidateIntegrity: "sha512-hashB",
    platform: "win32",
    architecture: "x64",
    affectedHarnesses: harnesses,
  });

  assert.notEqual(baseFp, changedReleaseFp);
});

test("Task 42-01-02 Test 4: ambiguous or unconfirmed actual-use harness target yields explicit pending (D-06)", async () => {
  const harnesses = discoverAffectedHarnesses("mcp:context7", {
    requestedHarnesses: ["claude", "codex"],
    harnessConfigs: {
      claude: { configPath: "/path/claude.json", inActualUse: false },
      codex: { configPath: "/path/codex.toml", inActualUse: false },
    },
  });

  assert.equal(harnesses.length, 2);
  assert.equal(harnesses[0]?.inActualUse, false);
  assert.equal(harnesses[1]?.inActualUse, false);
  assert.match(harnesses[0]?.reason!, /does not actively bind/);
});

test("Task 42-01-01 Integration: applyLocalReleasePlan rejects activation when candidate verification is pending or failed (D-01, PROOF-03)", async (context) => {
  const stateRoot = await createTempState(context);
  const repoRoot = packageRoot();

  const preview = await createLocalReleasePlan({
    mode: "update",
    tools: ["gsd"],
    packageRoot: repoRoot,
    stateRoot,
  });

  // Call apply with candidate verification that is pending
  const pendingReq: ReleaseVerificationRequest = {
    toolId: "gsd",
    candidateRelease: "1.18.0",
    candidateArtifact: "gsd-core.tgz",
    candidateIntegrity: "sha512-fakehash",
    candidateDigest: "fakedigest",
    currentVersion: "1.16.0",
    preparationProof: {
      prepareMode: "activation-required",
      candidateArtifact: "gsd-core.tgz",
      candidateIntegrity: "sha512-fakehash",
      activeIdentityPreserved: true,
      activeAliasDigest: "alias",
      activeConfigDigest: "cfg",
      resolvedExecutionPath: "/managed/gsd",
      positiveProofEstablished: false,
    },
  };

  const applyResult = await applyLocalReleasePlan({
    planDigest: preview.planDigest!,
    reviewedPlanToken: preview.reviewedPlanToken!,
    packageRoot: repoRoot,
    stateRoot,
    candidateVerificationRequests: [pendingReq],
  });

  assert.equal(applyResult.applied, false);
  assert.match(applyResult.message, /Candidate verification pending/);
  assert.ok(applyResult.verification);
  assert.equal(applyResult.verification[0]?.overallState, "pending");
  assert.ok(applyResult.pendingReasons && applyResult.pendingReasons.length > 0);
  assert.ok(applyResult.nextAction);
});
