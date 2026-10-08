import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { approveTaskContract, previewTaskContract } from "../src/core/task-contract.js";
import {
  validateTaskReviewEvidence,
  type TaskReviewLocator,
  type TaskReviewReportV1,
  type TaskReviewReportV2,
} from "../src/core/task-review-evidence.js";
import {
  type ControllerPort,
  type ControllerDispatchRequest,
  type ControllerDispatchResult,
  type ReviewerPort,
  type ReviewRequest,
  type TaskRunRecord,
} from "../src/core/task-run.js";
import {
  createTaskFixture,
  fixturePorts,
  fixtureQuickId,
  inventorySummaryContract,
  passingReview,
  referenceControllerPort,
  simulateGsdQuick,
  startFixtureTask,
  staticReviewerPort,
  writeInventorySummaryImplementation,
  writeTaskContract,
  type TaskFixture,
} from "./helpers/task-fixture.js";

async function approvedFixture(fixture: TaskFixture): Promise<string> {
  await writeTaskContract(fixture.contractPath, inventorySummaryContract(fixture.projectRoot));
  const preview = await previewTaskContract({ contractPath: fixture.contractPath, stateRoot: fixture.stateRoot });
  await approveTaskContract({ contractPath: fixture.contractPath, expectedDigest: preview.digest, stateRoot: fixture.stateRoot });
  return preview.digest;
}

// ---------------------------------------------------------------------------
// Unit tests: validateTaskReviewEvidence (Adversarial / D-01..D-04)
// ---------------------------------------------------------------------------

test("validateTaskReviewEvidence accepts a completely valid v2 report with snapshot-file locator", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(join(snapshotRoot, "bin"), { recursive: true });
  const scriptContent = "#!/usr/bin/env node\nconsole.log('test');\n";
  const scriptPath = join(snapshotRoot, "bin", "inventory-summary.mjs");
  await writeFile(scriptPath, scriptContent, "utf8");
  const scriptSha = createHash("sha256").update(Buffer.from(scriptContent, "utf8")).digest("hex");

  const targetSha = "a".repeat(40);
  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: targetSha,
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "Verified bin/inventory-summary.mjs lines 1-2.",
        locator: {
          kind: "snapshot-file",
          identifier: "bin/inventory-summary.mjs",
          inspectedRange: "lines:1-2",
          digest: scriptSha,
        },
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "Verified via check receipt.",
        locator: {
          kind: "check-receipt",
          identifier: "bin/inventory-summary.mjs",
          inspectedRange: null,
          digest: null,
        },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: targetSha,
      measurements: [
        { criterionId: "valid-summary", outcome: "pass", stdoutSha256: "b".repeat(64), detail: "ok" },
        { criterionId: "invalid-quantity", outcome: "pass", stdoutSha256: "b".repeat(64), detail: "ok" },
      ],
    },
    contract,
    snapshotRoot,
    currentHeadSha: targetSha,
  });

  assert.equal(result.valid, true);
  assert.equal(result.issues.length, 0);
  assert.equal(result.resolvedLocations.size, 2);
  const loc1 = result.resolvedLocations.get("valid-summary");
  assert.ok(loc1 !== undefined);
  assert.equal(loc1.kind, "snapshot-file");
  assert.equal(loc1.digest, scriptSha);
  assert.equal(loc1.inspectedRange, "lines:1-2");
});

test("validateTaskReviewEvidence rejects report omitting a criterion (D-03)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(snapshotRoot, { recursive: true });

  const targetSha = "a".repeat(40);
  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: targetSha,
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "Verified valid summary.",
        locator: {
          kind: "check-receipt",
          identifier: "bin/inventory-summary.mjs",
          inspectedRange: null,
          digest: null,
        },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: targetSha,
      measurements: [],
    },
    contract,
    snapshotRoot,
  });

  assert.equal(result.valid, false);
  const missingIssue = result.issues.find((i) => i.code === "missing-criterion");
  assert.ok(missingIssue !== undefined);
  assert.equal(missingIssue.criterionId, "invalid-quantity");
});

test("validateTaskReviewEvidence rejects directory traversal and unconfined snapshot paths (D-04)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(snapshotRoot, { recursive: true });

  const traversals = [
    "../secret.txt",
    "/etc/passwd",
    "C:/Windows/system.ini",
    "bin/../../outside.txt",
  ];

  for (const maliciousPath of traversals) {
    const report: TaskReviewReportV2 = {
      schemaVersion: 2,
      requestId: "req-1",
      contractId: contract.id,
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: "a".repeat(40),
      criteria: [
        {
          criterionId: "valid-summary",
          verdict: "pass",
          severity: "blocking",
          evidence: "Traversing path.",
          locator: {
            kind: "snapshot-file",
            identifier: maliciousPath,
            inspectedRange: null,
            digest: null,
          },
          abstainReason: null,
          finding: null,
        },
        {
          criterionId: "invalid-quantity",
          verdict: "pass",
          severity: "blocking",
          evidence: "ok",
          locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
          abstainReason: null,
          finding: null,
        },
      ],
      suggestions: [],
    };

    const result = await validateTaskReviewEvidence({
      report,
      request: {
        requestId: "req-1",
        contractDigest: "c".repeat(64),
        artifactDigest: "e".repeat(64),
        targetRevisionSha: "a".repeat(40),
        measurements: [],
      },
      contract,
      snapshotRoot,
    });

    assert.equal(result.valid, false, `Expected failure for malicious path: ${maliciousPath}`);
    assert.ok(result.issues.some((i) => i.code === "unconfined-locator-path"));
  }
});

test("validateTaskReviewEvidence rejects file digest mismatch (D-04)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(join(snapshotRoot, "bin"), { recursive: true });
  await writeFile(join(snapshotRoot, "bin", "inventory-summary.mjs"), "real content\n", "utf8");

  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: "a".repeat(40),
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "Digest mismatch check.",
        locator: {
          kind: "snapshot-file",
          identifier: "bin/inventory-summary.mjs",
          inspectedRange: null,
          digest: "f".repeat(64), // wrong digest
        },
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "ok",
        locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: "a".repeat(40),
      measurements: [],
    },
    contract,
    snapshotRoot,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "digest-mismatch"));
});

test("validateTaskReviewEvidence rejects inspectedRange exceeding file line count", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(join(snapshotRoot, "bin"), { recursive: true });
  await writeFile(join(snapshotRoot, "bin", "inventory-summary.mjs"), "line 1\nline 2\n", "utf8");

  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: "a".repeat(40),
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "Out of bounds range.",
        locator: {
          kind: "snapshot-file",
          identifier: "bin/inventory-summary.mjs",
          inspectedRange: "lines:1-999", // only 2 lines exist
          digest: null,
        },
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "ok",
        locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: "a".repeat(40),
      measurements: [],
    },
    contract,
    snapshotRoot,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "invalid-inspected-range"));
});

test("validateTaskReviewEvidence rejects check-receipt locator that cannot be resolved", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(snapshotRoot, { recursive: true });

  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: "a".repeat(40),
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "Invalid check receipt.",
        locator: {
          kind: "check-receipt",
          identifier: "completely-unrelated-receipt.json",
          inspectedRange: null,
          digest: null,
        },
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "ok",
        locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: "a".repeat(40),
      measurements: [],
    },
    contract,
    snapshotRoot,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "unresolvable-check-receipt"));
});

test("validateTaskReviewEvidence detects revision drift against git HEAD (REV-04, D-04)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(snapshotRoot, { recursive: true });

  const targetSha = "a".repeat(40);
  const driftedHead = "b".repeat(40);
  const report: TaskReviewReportV2 = {
    schemaVersion: 2,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    targetRevisionSha: targetSha,
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "ok",
        locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "ok",
        locator: { kind: "check-receipt", identifier: "bin/inventory-summary.mjs", inspectedRange: null, digest: null },
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: targetSha,
      measurements: [],
    },
    contract,
    snapshotRoot,
    currentHeadSha: driftedHead,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "revision-drift"));
});

test("validateTaskReviewEvidence rejects legacy v1 reports as unsupported-schema-version (v2-audit-v1)", async (context) => {
  const fixture = await createTaskFixture(context);
  const contract = inventorySummaryContract(fixture.projectRoot);
  const snapshotRoot = join(fixture.scratch, "test-snapshot");
  await mkdir(snapshotRoot, { recursive: true });

  const reportV1: TaskReviewReportV1 = {
    schemaVersion: 1,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest: "c".repeat(64),
    artifactDigest: "e".repeat(64),
    criteria: [
      {
        criterionId: "valid-summary",
        verdict: "pass",
        severity: "blocking",
        evidence: "legacy report",
        abstainReason: null,
        finding: null,
      },
      {
        criterionId: "invalid-quantity",
        verdict: "pass",
        severity: "blocking",
        evidence: "legacy report",
        abstainReason: null,
        finding: null,
      },
    ],
    suggestions: [],
  };

  const result = await validateTaskReviewEvidence({
    report: reportV1,
    request: {
      requestId: "req-1",
      contractDigest: "c".repeat(64),
      artifactDigest: "e".repeat(64),
      targetRevisionSha: "a".repeat(40),
      measurements: [],
    },
    contract,
    snapshotRoot,
  });

  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "legacy-schema-v1"));
});

// ---------------------------------------------------------------------------
// End-to-end integration: startFixtureTask with v2 review & rule confirmation
// ---------------------------------------------------------------------------

test("tracer: complete valid v2 report is accepted end-to-end through startFixtureTask", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);
  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer: staticReviewerPort(passingReview),
    }),
    expectedDigest: digest,
  });

  assert.equal(record.status, "accepted");
  assert.equal(record.verdict?.overall, "accepted");
  assert.equal(record.reviewer?.report?.schemaVersion, 2);
  assert.ok(record.reviewer?.report?.targetRevisionSha.length === 40);
  assert.equal(record.verdict?.rows.length, 2);
  for (const row of record.verdict.rows) {
    assert.equal(row.verdict, "pass");
    assert.equal(row.review?.verdict, "pass");
    assert.equal(row.review?.locator?.kind, "check-receipt");
  }
});

test("blocking fail with valid ruleConfirmation is confirmed and rejected end-to-end", async (context) => {
  const fixture = await createTaskFixture(context);
  const digest = await approvedFixture(fixture);

  // Reviewer reports a blocking rule violation on bin/inventory-summary.mjs
  const reviewer: ReviewerPort = {
    async review(request: ReviewRequest) {
      const base = passingReview(request);
      return {
        harness: "claude",
        version: "fixture",
        executable: null,
        sessionId: request.sessionId,
        exitCode: 0,
        processCode: "ok",
        report: {
          ...base,
          criteria: base.criteria.map((row) =>
            row.criterionId === "valid-summary"
              ? {
                  ...row,
                  verdict: "fail" as const,
                  severity: "blocking" as const,
                  evidence: "Found rule violation in implementation.",
                  locator: {
                    kind: "snapshot-file" as const,
                    identifier: "bin/inventory-summary.mjs",
                    inspectedRange: "lines:1-10",
                    digest: null,
                  },
                  finding: {
                    summary: "Violation of architectural rule ARCH-01.",
                    reproduction: null,
                    ruleConfirmation: {
                      ruleId: "ARCH-01",
                      ruleSource: "PROJECT.md",
                      inspectedPath: "bin/inventory-summary.mjs",
                      observedViolation: "The file violates single-purpose module layout.",
                    },
                  },
                }
              : row,
          ),
        },
        issues: [],
      };
    },
  };

  const { run: record } = await startFixtureTask(fixture, {
    ports: fixturePorts({
      controller: referenceControllerPort("correct"),
      reviewer,
    }),
    expectedDigest: digest,
  });

  assert.equal(record.status, "rejected");
  assert.equal(record.verdict?.overall, "rejected");
  const failedRow = record.verdict?.rows.find((r) => r.criterionId === "valid-summary");
  assert.ok(failedRow !== undefined);
  assert.equal(failedRow.verdict, "fail");
  assert.equal(failedRow.review?.verdict, "fail");
  assert.equal(failedRow.review?.confirmed, true);
  assert.match(failedRow.review?.confirmationDetail ?? "", /confirmed rule violation for rule ARCH-01/u);
});
