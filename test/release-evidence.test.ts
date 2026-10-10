import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateOrdinaryGsdBoundary,
  evaluateReleaseEvidence,
  type ReleaseCandidateIdentity,
  type ReleaseEvidenceSource,
} from "../src/core/release-evidence.js";
import {
  BASE_RELEASE_SUPPORT_MATRIX,
  evaluateReleaseSupportMatrix,
} from "../src/core/support-matrix.js";
import type { HarnessRoleReceipt } from "../src/adapters/task-receipts.js";
import type { Inventory } from "../src/types.js";

const candidateSha = "1234567890abcdef1234567890abcdef12345678";
const candidateTarballSha = "a".repeat(64);
const observedAt = "2026-10-10T09:00:00.000Z";

const candidate: ReleaseCandidateIdentity = {
  releaseVersion: "0.2.0",
  releaseSha: candidateSha,
  tarballSha256: candidateTarballSha,
};

function inventory(detected: readonly string[]): Inventory {
  return {
    schemaVersion: 1,
    generatedAt: observedAt,
    platform: "linux",
    architecture: "x64",
    tools: {},
    harnesses: ["claude", "codex", "antigravity", "pi", "hermes"].map((id) => ({
      id: id as Inventory["harnesses"][number]["id"],
      displayName: id,
      command: detected.includes(id) ? id : null,
      version: detected.includes(id) ? "2.0.0" : null,
      configRoots: [],
      detected: detected.includes(id),
      notes: [],
    })),
  };
}

function mockRoleReceipt(harness: string, role: "controller" | "executor" | "reviewer", version = "2.0.0"): HarnessRoleReceipt {
  return {
    schemaVersion: 1,
    harness: harness as any,
    role,
    version,
    binarySha256: "b".repeat(64),
    executable: `/usr/bin/${harness}`,
    probedAt: observedAt,
    capabilities: {
      invoked: true,
      cancelled: false,
      outputParsed: true,
      readOnlyGuaranteed: true,
    },
    sampleDigest: "c".repeat(64),
  };
}

// ---------------------------------------------------------------------------
// Candidate Identity Validation
// ---------------------------------------------------------------------------

test("ReleaseCandidateIdentity strictly rejects invalid versions or empty identifiers", () => {
  assert.throws(
    () => evaluateReleaseEvidence({ releaseVersion: "0.1.0" as any, releaseSha: candidateSha, tarballSha256: candidateTarballSha }, []),
    /Invalid candidate version/i,
  );
  assert.throws(
    () => evaluateReleaseEvidence({ releaseVersion: "0.2.0", releaseSha: "", tarballSha256: candidateTarballSha }, []),
    /releaseSha must be a non-empty string/i,
  );
  assert.throws(
    () => evaluateReleaseEvidence({ releaseVersion: "0.2.0", releaseSha: candidateSha, tarballSha256: "  " }, []),
    /tarballSha256 must be a non-empty string/i,
  );
});

// ---------------------------------------------------------------------------
// Release Evidence Evaluation & Mismatch Probes (VER-01..04)
// ---------------------------------------------------------------------------

test("evaluateReleaseEvidence with 0 sources returns UNVERIFIED with empty summary", () => {
  const report = evaluateReleaseEvidence(candidate, []);
  assert.equal(report.overallStatus, "UNVERIFIED");
  assert.equal(report.summary.total, 0);
  assert.equal(report.summary.proven, 0);
  assert.equal(report.summary.unverified, 0);
  assert.equal(report.summary.rejected, 0);
  assert.equal(report.items.length, 0);
});

test("evaluateReleaseEvidence rejects commit SHA mismatch with typed reason and nextAction", () => {
  const sources: ReleaseEvidenceSource[] = [
    {
      id: "ci-run-1",
      category: "ci",
      reference: "https://github.com/example/actions/runs/1",
      releaseSha: "ffffffffffffffffffffffffffffffffffffffff", // Mismatched SHA
      tarballSha256: candidateTarballSha,
    },
  ];
  const report = evaluateReleaseEvidence(candidate, sources);
  assert.equal(report.overallStatus, "REJECTED");
  assert.equal(report.summary.rejected, 1);
  const item = report.items[0];
  assert.ok(item);
  assert.equal(item.status, "REJECTED");
  assert.match(item.reason ?? "", /Commit SHA mismatch/i);
  assert.match(item.nextAction ?? "", /candidate commit/i);
});

test("evaluateReleaseEvidence rejects package tarball SHA mismatch with typed reason and nextAction", () => {
  const sources: ReleaseEvidenceSource[] = [
    {
      id: "pkg-tarball-1",
      category: "package",
      reference: "artifacts/alpha-aos-0.2.0.tgz",
      releaseSha: candidateSha,
      tarballSha256: "9".repeat(64), // Mismatched tarball hash
    },
  ];
  const report = evaluateReleaseEvidence(candidate, sources);
  assert.equal(report.overallStatus, "REJECTED");
  assert.equal(report.summary.rejected, 1);
  const item = report.items[0];
  assert.ok(item);
  assert.equal(item.status, "REJECTED");
  assert.match(item.reason ?? "", /Tarball SHA-256 mismatch/i);
  assert.match(item.nextAction ?? "", /re-verify/i);
});

test("evaluateReleaseEvidence marks empty or whitespace reference as UNVERIFIED", () => {
  const sources: ReleaseEvidenceSource[] = [
    {
      id: "empty-ref",
      category: "matrix",
      reference: "   ",
      releaseSha: candidateSha,
      tarballSha256: candidateTarballSha,
    },
  ];
  const report = evaluateReleaseEvidence(candidate, sources);
  assert.equal(report.overallStatus, "UNVERIFIED");
  assert.equal(report.summary.unverified, 1);
  const item = report.items[0];
  assert.ok(item);
  assert.equal(item.status, "UNVERIFIED");
  assert.match(item.reason ?? "", /reference is empty/i);
  assert.ok(item.nextAction);
});

test("evaluateReleaseEvidence marks verified matching sources as PROVEN", () => {
  const sources: ReleaseEvidenceSource[] = [
    {
      id: "ci-linux",
      category: "ci",
      reference: "github/ci/run/101",
      releaseSha: candidateSha,
      tarballSha256: candidateTarballSha,
      description: "Linux CI pass",
    },
    {
      id: "pkg-sandbox",
      category: "package",
      reference: "receipts/package-sandbox.json",
      releaseSha: candidateSha,
      tarballSha256: candidateTarballSha,
      description: "Packed sandbox verification",
    },
  ];
  const report = evaluateReleaseEvidence(candidate, sources);
  assert.equal(report.overallStatus, "PROVEN");
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.proven, 2);
  assert.equal(report.summary.rejected, 0);
  assert.equal(report.summary.unverified, 0);
});

// ---------------------------------------------------------------------------
// Ordinary GSD Non-Activation Boundary Probes (D-01, D-02, Prohibition)
// ---------------------------------------------------------------------------

test("evaluateOrdinaryGsdBoundary verifies ordinary requests produce zero supervisor runs", () => {
  // 1. General request with 0 supervisor runs -> PROVEN
  const cleanResult = evaluateOrdinaryGsdBoundary("Refactor paths in src/core/paths.ts", 0);
  assert.equal(cleanResult.status, "PROVEN");
  assert.equal(cleanResult.pathChosen, "ordinary-gsd");
  assert.equal(cleanResult.contractGenerated, false);
  assert.equal(cleanResult.supervisorRunsCount, 0);
  assert.equal(cleanResult.reason, null);

  // 2. Prohibition probe: ordinary request producing 1 supervisor run -> REJECTED
  const contaminatedResult = evaluateOrdinaryGsdBoundary("Refactor paths in src/core/paths.ts", 1);
  assert.equal(contaminatedResult.status, "REJECTED");
  assert.equal(contaminatedResult.pathChosen, "ordinary-gsd");
  assert.match(contaminatedResult.reason ?? "", /supervisor run record\(s\) without task-specific approval/i);
  assert.ok(contaminatedResult.nextAction);

  // 3. Explicit autopilot request -> autopilot-preview with contract preview
  const explicitAutopilot = evaluateOrdinaryGsdBoundary("Run autonomous autopilot for migration", 0, {
    isExplicitAutopilot: true,
  });
  assert.equal(explicitAutopilot.status, "PROVEN");
  assert.equal(explicitAutopilot.pathChosen, "autopilot-preview");
  assert.equal(explicitAutopilot.contractGenerated, true);

  // 4. Ambiguous autopilot -> clarification-needed, no contract
  const ambiguousAutopilot = evaluateOrdinaryGsdBoundary("Run in autopilot", 0, {
    isExplicitAutopilot: true,
    hasAmbiguousScope: true,
  });
  assert.equal(ambiguousAutopilot.status, "UNVERIFIED");
  assert.equal(ambiguousAutopilot.pathChosen, "clarification-needed");
  assert.equal(ambiguousAutopilot.contractGenerated, false);
});

// ---------------------------------------------------------------------------
// Edge Probes: Adjacency, Ordering, and Permutation Invariance
// ---------------------------------------------------------------------------

test("mixing identical-version role receipts preserves strict cell boundaries and deterministic order", async () => {
  const inv = inventory(["claude", "codex", "antigravity", "pi", "hermes"]);

  // Two role receipts for claude: controller and reviewer (same version 2.0.0)
  const claudeCtrl = mockRoleReceipt("claude", "controller", "2.0.0");
  const claudeRev = mockRoleReceipt("claude", "reviewer", "2.0.0");

  const forwardReport = await evaluateReleaseSupportMatrix(inv, {
    roleReceipts: [claudeCtrl, claudeRev],
    generatedAt: observedAt,
  });

  const backwardReport = await evaluateReleaseSupportMatrix(inv, {
    roleReceipts: [claudeRev, claudeCtrl],
    generatedAt: observedAt,
  });

  // 1. Order invariance: shuffling input role receipts produces identical output order
  assert.deepEqual(
    forwardReport.cells.map((c) => ({ harness: c.harness, role: c.role, status: c.status })),
    backwardReport.cells.map((c) => ({ harness: c.harness, role: c.role, status: c.status })),
  );

  // 2. Strict cell boundaries: executor remains UNVERIFIED
  const ctrlCell = forwardReport.cells.find((c) => c.harness === "claude" && c.role === "controller");
  const execCell = forwardReport.cells.find((c) => c.harness === "claude" && c.role === "executor");
  const revCell = forwardReport.cells.find((c) => c.harness === "claude" && c.role === "reviewer");

  assert.equal(ctrlCell?.status, "PROVEN");
  assert.equal(execCell?.status, "UNVERIFIED");
  assert.equal(revCell?.status, "PROVEN");

  // 3. Other harnesses remain unaffected
  const codexCtrl = forwardReport.cells.find((c) => c.harness === "codex" && c.role === "controller");
  assert.equal(codexCtrl?.status, "UNVERIFIED");
});
