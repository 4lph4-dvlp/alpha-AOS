import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  gateMilestoneFinalReview,
  readFinalReviewWitness,
  validateFinalReviewReport,
  type FinalReviewPort,
  type TaskFinalReviewReport,
} from "../src/core/task-final-review.js";
import { taskContractDigest, type TaskContract } from "../src/core/task-contract.js";
import { readTaskReviewSuggestions } from "../src/core/task-review-suggestions.js";
import { readTaskReviewFindings } from "../src/core/task-review-findings.js";

function sampleAdversarialContract(): TaskContract {
  return {
    schemaVersion: 1,
    id: "adversarial-milestone-contract",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Adversarial test for milestone final review gate",
    scope: {
      projectRoot: "D:/dev/sample-adversarial",
      workflow: "gsd-quick",
      summary: "Adversarial review test",
    },
    allowedRoots: ["D:/dev/sample-adversarial"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "crit-1",
        title: "Requirement 1",
        description: "Must verify correctly",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "run.js",
          inputText: "{}",
          expect: { exitCode: 0 },
        },
      },
    ],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "claude",
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {
      maxCycles: 2,
    },
  };
}

function baseValidReport(options: {
  contractId: string;
  contractDigest: string;
  targetRevisionSha: string;
  artifactDigest: string;
  sessionId?: string;
}): TaskFinalReviewReport {
  return {
    schemaVersion: 1,
    requestId: "11111111-1111-4111-8111-111111111111",
    contractId: options.contractId,
    contractDigest: options.contractDigest,
    targetRevisionSha: options.targetRevisionSha,
    artifactDigest: options.artifactDigest,
    sessionId: options.sessionId ?? "22222222-2222-4222-8222-222222222222",
    reviewerHarness: "claude",
    reviewerVersion: "1.0.0",
    evaluatedAt: new Date().toISOString(),
    overallVerdict: "accepted",
    requirements: [
      {
        requirementId: "REQ-01",
        description: "Primary feature requirement",
        status: "verified",
        implementationLocation: {
          path: "src/feature.ts",
          lineRange: "10-25",
          digest: "a".repeat(64),
        },
        checkReceiptRef: {
          receiptId: "chk-01",
          digest: "b".repeat(64),
          status: "pass",
        },
        reviewEvidenceRef: {
          reportDigest: "c".repeat(64),
          criterionId: "crit-1",
        },
      },
    ],
    crossPhaseAssessment: {
      userFlow: { status: "pass", summary: "User flows validated." },
      approvalBoundaries: { status: "pass", summary: "Explicit approvals maintained." },
      gsdStateOwnership: { status: "pass", summary: "GSD authority preserved." },
      reviewerIndependence: { status: "pass", summary: "Fresh read-only session verified." },
    },
    findings: [],
    summary: "Base valid report",
  };
}

test("D-09, REV-05: missing feature and architecture violation sharing root cause are unified in GSD gap routing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-adversarial-"));
  try {
    const contract = sampleAdversarialContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const artDigest = "1".repeat(64);

    // Report contains two distinct blocking defects that share the same objective reproduction root cause (D-09)
    const sharedReproduction = {
      summary: "Command fails on unvalidated input",
      inputText: "run-failed-cmd",
      observedExitCode: 1,
      observedStdout: "VALIDATION_FAILED",
    };

    const adversarialReport: TaskFinalReviewReport = {
      ...baseValidReport({
        contractId: contract.id,
        contractDigest: cDigest,
        targetRevisionSha: targetSha,
        artifactDigest: artDigest,
      }),
      overallVerdict: "rejected",
      findings: [
        {
          findingId: "f-missing-feature-1",
          category: "missing-requirement",
          impact: "blocking",
          scope: "in-scope",
          summary: "Essential data validation step missing",
          reproduction: sharedReproduction,
        },
        {
          findingId: "f-arch-violation-1",
          category: "architecture-violation",
          impact: "blocking",
          scope: "in-scope",
          summary: "Direct bypass of boundary parser",
          reproduction: sharedReproduction,
        },
      ],
    };

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => adversarialReport,
    };

    const gate = await gateMilestoneFinalReview({
      projectRoot: dir,
      stateRoot: dir,
      contract,
      contractDigest: cDigest,
      targetRevisionSha: targetSha,
      workingTreeDigest: artDigest,
      finalReviewPort: port,
    });

    // Milestone is blocked due to the defects
    assert.equal(gate.status, "blocked");
    assert.match(gate.reason, /detected 2 blocking defect\(s\); routed to GSD repair/);

    // GSD gap routing decisions should be recorded
    assert.ok(gate.routedGaps);
    assert.ok(gate.routedGaps.length >= 1);
    for (const gap of gate.routedGaps) {
      assert.equal(gap.destination, "gap-plan");
    }

    // Both findings are unified under a single root cause in findings.json (D-09)
    const recordedFindings = await readTaskReviewFindings(dir, contract.id);
    assert.equal(recordedFindings.length, 1);
    assert.equal(recordedFindings[0]?.criterionIds.length, 2);
    assert.ok(recordedFindings[0]?.criterionIds.includes("f-missing-feature-1"));
    assert.ok(recordedFindings[0]?.criterionIds.includes("f-arch-violation-1"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("D-08, REV-03: out-of-scope style suggestion is isolated to deferred suggestions without blocking milestone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-adversarial-"));
  try {
    const contract = sampleAdversarialContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const artDigest = "1".repeat(64);

    // Report contains an advisory out-of-scope style suggestion
    const reportWithAdvisory: TaskFinalReviewReport = {
      ...baseValidReport({
        contractId: contract.id,
        contractDigest: cDigest,
        targetRevisionSha: targetSha,
        artifactDigest: artDigest,
      }),
      findings: [
        {
          findingId: "f-style-suggestion-1",
          category: "style-preference",
          impact: "advisory",
          scope: "out-of-scope",
          summary: "Consider using PascalCase for enum members in internal module",
        },
      ],
      summary: "All mandatory criteria satisfied. Advisory suggestion noted.",
    };

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => reportWithAdvisory,
    };

    const gate = await gateMilestoneFinalReview({
      projectRoot: dir,
      stateRoot: dir,
      contract,
      contractDigest: cDigest,
      targetRevisionSha: targetSha,
      workingTreeDigest: artDigest,
      finalReviewPort: port,
    });

    // Milestone MUST be accepted (advisory suggestions do NOT block completion)
    assert.equal(gate.status, "accepted");
    assert.ok(gate.witnessReceipt);
    assert.equal(gate.witnessReceipt.overallVerdict, "accepted");

    // The witness receipt must be stored
    const witness = await readFinalReviewWitness(dir, contract.id);
    assert.ok(witness);
    assert.equal(witness.receiptDigest, gate.witnessReceipt.receiptDigest);

    // The advisory suggestion MUST be recorded in external suggestions.json file (D-08)
    const suggestionsResult = await readTaskReviewSuggestions({
      stateRoot: dir,
      contractId: contract.id,
    });
    assert.equal(suggestionsResult.status, "ok");
    assert.equal(suggestionsResult.count, 1);
    assert.equal(suggestionsResult.pendingCount, 1);
    const saved = suggestionsResult.suggestions[0];
    assert.ok(saved);
    assert.equal(saved.status, "pending");
    assert.ok(saved.summary.includes("PascalCase for enum members"));
    assert.equal(saved.targetRevisionSha, targetSha);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("REV-03: stale revision SHA is strictly rejected", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-adversarial-"));
  try {
    const contract = sampleAdversarialContract();
    const cDigest = taskContractDigest(contract);
    const cleanSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const staleSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const artDigest = "1".repeat(64);

    // Reviewer returns a report with a stale/different revision SHA
    const staleReport = baseValidReport({
      contractId: contract.id,
      contractDigest: cDigest,
      targetRevisionSha: staleSha, // Stale!
      artifactDigest: artDigest,
    });

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => staleReport,
    };

    const gate = await gateMilestoneFinalReview({
      projectRoot: dir,
      stateRoot: dir,
      contract,
      contractDigest: cDigest,
      targetRevisionSha: cleanSha, // Expected clean SHA
      workingTreeDigest: artDigest,
      finalReviewPort: port,
    });

    assert.equal(gate.status, "rejected");
    assert.match(gate.reason, /Target revision mismatch/);
    assert.equal(gate.witnessReceipt, undefined);

    // Witness file must NOT be written
    const witness = await readFinalReviewWitness(dir, contract.id);
    assert.equal(witness, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("REV-04: session ID mismatch is rejected during final review validation", async () => {
  const contract = sampleAdversarialContract();
  const cDigest = taskContractDigest(contract);
  const targetSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const artDigest = "1".repeat(64);

  const report = baseValidReport({
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
    sessionId: "original-session-111",
  });

  const validation = await validateFinalReviewReport(report, {
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
    sessionId: "requested-fresh-session-222", // Expected fresh session does not match report
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((i) => i.includes("Session ID mismatch")));
});

test("REV-04: malformed and truncated schema output is rejected", async () => {
  const contract = sampleAdversarialContract();
  const cDigest = taskContractDigest(contract);
  const targetSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const artDigest = "1".repeat(64);

  // Missing crossPhaseAssessment entirely
  const malformedReport = {
    schemaVersion: 1,
    requestId: "11111111-1111-4111-8111-111111111111",
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
    sessionId: "22222222-2222-4222-8222-222222222222",
    reviewerHarness: "claude",
    reviewerVersion: "1.0.0",
    evaluatedAt: new Date().toISOString(),
    overallVerdict: "accepted",
    requirements: [],
    // crossPhaseAssessment is omitted!
    findings: [],
    summary: "Malformed report",
  };

  const validation = await validateFinalReviewReport(malformedReport, {
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
  });

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.length > 0);
});
