import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  computeRootCauseKey,
  computeFindingId,
  readTaskReviewFindings,
  recordOrReconcileFindings,
  attachFindingGsdRouting,
  markFindingRepaired,
  reverifyFindingResolution,
  extractCandidateFindings,
  type ReconcileCandidateFinding,
} from "../src/core/task-review-findings.js";
import { routeVerificationGap } from "../src/core/task-gap-router.js";
import type { TaskContract } from "../src/core/task-contract.js";
import type { ReviewWitnessReceipt } from "../src/core/task-review-witness.js";
import { computeReviewWitnessPayloadDigest } from "../src/core/task-review-witness.js";

function sampleContract(): TaskContract {
  return {
    schemaVersion: 1,
    id: "repair-test-contract",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Test repair and reverification workflow",
    scope: {
      projectRoot: "D:/dev/sample",
      workflow: "gsd-quick",
      summary: "Sample project",
    },
    allowedRoots: ["D:/dev/sample"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "crit-core-01",
        title: "Core functional requirement",
        description: "Core logic works",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "run.js",
          inputText: "{}",
          expect: { exitCode: 0 },
        },
      },
      {
        id: "crit-arch-01",
        title: "Architecture constraint 1",
        description: "Boundary respected",
        mandatory: true,
        measurement: {
          kind: "cli-json",
          entry: "run.js",
          inputText: "{}",
          expect: { exitCode: 0 },
        },
      },
      {
        id: "crit-arch-02",
        title: "Architecture constraint 2",
        description: "No leaky abstractions",
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
      maxCycles: 3,
    },
  };
}

function createWitnessReceipt(options: {
  contractId: string;
  contractDigest: string;
  targetRevisionSha: string;
  artifactDigest: string;
  sessionId: string;
  witnessVerdict?: "accepted" | "rejected";
}): ReviewWitnessReceipt {
  const payload = {
    schemaVersion: 1 as const,
    kind: "review-witness-receipt" as const,
    requestId: "req-1234-5678-90ab",
    sessionId: options.sessionId,
    reviewerHarness: "claude",
    reviewerVersion: "1.0.0",
    targetRevisionSha: options.targetRevisionSha,
    artifactDigest: options.artifactDigest,
    witnessVerdict: options.witnessVerdict ?? "accepted",
    examinedAt: new Date().toISOString(),
    criteriaWitnessed: [
      { criterionId: "crit-core-01", verdict: "pass" as const },
      { criterionId: "crit-arch-01", verdict: "pass" as const },
      { criterionId: "crit-arch-02", verdict: "pass" as const },
    ],
    reportDigest: "rep-digest-1234",
  };
  const receiptDigest = computeReviewWitnessPayloadDigest(payload);
  return { ...payload, receiptDigest };
}

test("D-09: multiple criteria pointing to the same confirmed root-cause are merged into one finding", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-arch-01",
        kind: "architecture-rule-violation",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "Forbidden direct database access in domain layer",
        ruleConfirmation: {
          ruleId: "ARCH-BOUNDARIES-01",
          ruleSource: "CONVENTIONS.md",
          inspectedPath: "src/domain/model.ts",
          observedViolation: "Direct import of db/connection",
          impact: "Bypasses repository isolation",
          checkDescriptor: {
            kind: "pattern-present",
            pattern: "import .* from .*db/connection",
          },
        },
      },
      {
        criterionId: "crit-arch-02",
        kind: "architecture-rule-violation",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "Database connection leak in domain model",
        ruleConfirmation: {
          ruleId: "ARCH-BOUNDARIES-01",
          ruleSource: "CONVENTIONS.md",
          inspectedPath: "src/domain/model.ts",
          observedViolation: "Direct import of db/connection",
          impact: "Bypasses repository isolation",
          checkDescriptor: {
            kind: "pattern-present",
            pattern: "import .* from .*db/connection",
          },
        },
      },
    ];

    const result = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: "1111111111111111111111111111111111111111",
      classifiedFindings: candidateFindings,
    });

    assert.equal(result.findings.length, 1);
    const finding = result.findings[0]!;
    assert.deepEqual(finding.criterionIds, ["crit-arch-01", "crit-arch-02"]);
    assert.equal(finding.status, "open");
    assert.equal(finding.impact, "blocking");
    assert.equal(finding.history.length, 1);
    assert.equal(finding.history[0]?.event, "detected");

    // Reading from disk yields identical single reconciled finding
    const loaded = await readTaskReviewFindings(stateRoot, contract.id);
    assert.equal(loaded.length, 1);
    assert.deepEqual(loaded[0]?.criterionIds, ["crit-arch-01", "crit-arch-02"]);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-12, T-19-05: similar prose summaries do not merge disparate objective root causes", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    // Two findings with identical summary text but different inspected files
    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-arch-01",
        kind: "architecture-rule-violation",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "Forbidden direct database access in domain layer",
        ruleConfirmation: {
          ruleId: "ARCH-BOUNDARIES-01",
          ruleSource: "CONVENTIONS.md",
          inspectedPath: "src/domain/user.ts",
          observedViolation: "Direct import of db/connection",
          impact: "Bypasses repository isolation",
          checkDescriptor: {
            kind: "pattern-present",
            pattern: "import .* from .*db/connection",
          },
        },
      },
      {
        criterionId: "crit-arch-02",
        kind: "architecture-rule-violation",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "Forbidden direct database access in domain layer",
        ruleConfirmation: {
          ruleId: "ARCH-BOUNDARIES-01",
          ruleSource: "CONVENTIONS.md",
          inspectedPath: "src/domain/order.ts", // Different path!
          observedViolation: "Direct import of db/connection",
          impact: "Bypasses repository isolation",
          checkDescriptor: {
            kind: "pattern-present",
            pattern: "import .* from .*db/connection",
          },
        },
      },
    ];

    const result = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: "1111111111111111111111111111111111111111",
      classifiedFindings: candidateFindings,
    });

    // Must NOT false-merge; must result in 2 separate findings
    assert.equal(result.findings.length, 2);
    assert.equal(result.findings[0]?.criterionIds.length, 1);
    assert.equal(result.findings[1]?.criterionIds.length, 1);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-09: confirmed root cause routes to one GSD gap item and is idempotent on repeat", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-arch-01",
        kind: "architecture-rule-violation",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "Database connection leak in domain model",
        ruleConfirmation: {
          ruleId: "ARCH-BOUNDARIES-01",
          ruleSource: "CONVENTIONS.md",
          inspectedPath: "src/domain/model.ts",
          observedViolation: "Direct import of db/connection",
          impact: "Bypasses repository isolation",
          checkDescriptor: {
            kind: "pattern-present",
            pattern: "import .* from .*db/connection",
          },
        },
      },
    ];

    const reconcileRes = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: "1111111111111111111111111111111111111111",
      classifiedFindings: candidateFindings,
    });

    const finding = reconcileRes.findings[0]!;
    assert.ok(finding);

    const routingDecision = routeVerificationGap({
      contract,
      currentPhaseId: "19",
      defectSummary: finding.summary,
      isScopeExpansion: false,
      history: [],
    });

    const routed = await attachFindingGsdRouting({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      routingDecision,
    });

    assert.equal(routed.gsdRouting?.destination, "gap-plan");
    assert.equal(routed.gsdRouting?.targetPhaseId, "19");
    assert.equal(routed.history.length, 2);
    assert.equal(routed.history[1]?.event, "routed");

    // Repeat attach call is idempotent and does not add duplicate history events
    const repeated = await attachFindingGsdRouting({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      routingDecision,
    });
    assert.equal(repeated.history.length, 2);
    assert.equal(repeated.gsdRouting?.gsdItemRef, routed.gsdRouting?.gsdItemRef);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-10, T-19-06: repair completion alone sets repaired, NOT resolved", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-core-01",
        kind: "missing-requirement",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "CLI returns exit code 1 on valid input",
        reproduction: {
          inputText: "{}",
          observedExitCode: 1,
          summary: "CLI returns exit code 1",
        },
      },
    ];

    const reconcileRes = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: "1111111111111111111111111111111111111111",
      classifiedFindings: candidateFindings,
    });

    const finding = reconcileRes.findings[0]!;

    const repaired = await markFindingRepaired({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      repairRevisionSha: "2222222222222222222222222222222222222222",
      repairNote: "Fixed input handling in cli.ts",
    });

    assert.equal(repaired.status, "repaired");
    assert.notEqual(repaired.status, "resolved");
    assert.equal(repaired.history.length, 2);
    assert.equal(repaired.history[1]?.event, "repaired");
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-10: reverifyFindingResolution rejects unmodified revision or remaining defect", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const origSha = "1111111111111111111111111111111111111111";
    const newSha = "2222222222222222222222222222222222222222";

    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-core-01",
        kind: "missing-requirement",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "CLI returns exit code 1",
        reproduction: {
          inputText: "{}",
          observedExitCode: 1,
          summary: "CLI returns exit code 1",
        },
      },
    ];

    const reconcileRes = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: origSha,
      classifiedFindings: candidateFindings,
    });

    const finding = reconcileRes.findings[0]!;

    // 1. Reverify with unchanged HEAD -> refused
    const res1 = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      contract,
      newHeadSha: origSha, // Unchanged!
      newArtifactDigest: "art-digest-1",
      newReviewReceipt: null,
      originalReproductionFails: false,
      contractCriteriaPassed: ["crit-core-01", "crit-arch-01", "crit-arch-02"],
    });
    assert.equal(res1.resolved, false);
    assert.match(res1.reason, /Artifact was not modified/);

    // 2. Reverify where original reproduction still fails -> refused
    const res2 = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      contract,
      newHeadSha: newSha,
      newArtifactDigest: "art-digest-2",
      newReviewReceipt: null,
      originalReproductionFails: true, // Still fails!
      contractCriteriaPassed: ["crit-core-01", "crit-arch-01", "crit-arch-02"],
    });
    assert.equal(res2.resolved, false);
    assert.match(res2.reason, /Original defect reproduction still fails/);

    // 3. Reverify where not all contract criteria passed -> refused (D-10 whole-contract check)
    const res3 = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      contract,
      newHeadSha: newSha,
      newArtifactDigest: "art-digest-2",
      newReviewReceipt: null,
      originalReproductionFails: false,
      contractCriteriaPassed: ["crit-core-01"], // crit-arch-01 and crit-arch-02 missing!
    });
    assert.equal(res3.resolved, false);
    assert.match(res3.reason, /Full contract reverification failed/);

    // 4. Reverify with invalid / missing review witness receipt -> refused
    const res4 = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      contract,
      newHeadSha: newSha,
      newArtifactDigest: "art-digest-2",
      newReviewReceipt: null, // Missing!
      originalReproductionFails: false,
      contractCriteriaPassed: ["crit-core-01", "crit-arch-01", "crit-arch-02"],
    });
    assert.equal(res4.resolved, false);
    assert.match(res4.reason, /Review witness rejected/);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-10, REV-04: reverifyFindingResolution succeeds with fresh revision, session, and full-contract pass", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const origSha = "1111111111111111111111111111111111111111";
    const newSha = "2222222222222222222222222222222222222222";
    const newArt = "artifact-digest-v2";

    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-core-01",
        kind: "missing-requirement",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "CLI returns exit code 1",
        reproduction: {
          inputText: "{}",
          observedExitCode: 1,
          summary: "CLI returns exit code 1",
        },
      },
    ];

    const reconcileRes = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: origSha,
      classifiedFindings: candidateFindings,
    });

    const finding = reconcileRes.findings[0]!;

    const witnessReceipt = createWitnessReceipt({
      contractId: contract.id,
      contractDigest: "contract-digest-sample",
      targetRevisionSha: newSha,
      artifactDigest: newArt,
      sessionId: "session-new-fresh-session-1234",
      witnessVerdict: "accepted",
    });

    const res = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding.findingId,
      contract,
      newHeadSha: newSha,
      newArtifactDigest: newArt,
      newReviewReceipt: witnessReceipt,
      originalReproductionFails: false,
      contractCriteriaPassed: ["crit-core-01", "crit-arch-01", "crit-arch-02"],
    });

    assert.equal(res.resolved, true);
    assert.equal(res.finding.status, "resolved");
    assert.equal(res.finding.history.length, 2);
    assert.equal(res.finding.history[1]?.event, "resolved");
    assert.equal(res.finding.history[1]?.revisionSha, newSha);

    // Reading from disk confirms resolved status
    const diskFindings = await readTaskReviewFindings(stateRoot, contract.id);
    assert.equal(diskFindings[0]?.status, "resolved");
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});

test("D-11: resolved finding reopens when verified failure recurs in newer revision with full history preserved", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "alpha-aos-repair-test-"));
  try {
    const contract = sampleContract();
    const sha1 = "1111111111111111111111111111111111111111";
    const sha2 = "2222222222222222222222222222222222222222";
    const sha3 = "3333333333333333333333333333333333333333";

    const candidateFindings: ReconcileCandidateFinding[] = [
      {
        criterionId: "crit-core-01",
        kind: "missing-requirement",
        scope: "in-scope",
        impact: "blocking",
        isConfirmed: true,
        summary: "CLI returns exit code 1",
        reproduction: {
          inputText: "{}",
          observedExitCode: 1,
          summary: "CLI returns exit code 1",
        },
      },
    ];

    // 1. Initial detection in sha1
    const rec1 = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: sha1,
      classifiedFindings: candidateFindings,
    });
    const finding1 = rec1.findings[0]!;

    // 2. Repair in sha2
    await markFindingRepaired({
      stateRoot,
      contractId: contract.id,
      findingId: finding1.findingId,
      repairRevisionSha: sha2,
      repairNote: "Fixed bug",
    });

    // 3. Resolve in sha2
    const witness2 = createWitnessReceipt({
      contractId: contract.id,
      contractDigest: "digest-1",
      targetRevisionSha: sha2,
      artifactDigest: "art-sha2",
      sessionId: "session-2",
      witnessVerdict: "accepted",
    });
    const resResolve = await reverifyFindingResolution({
      stateRoot,
      contractId: contract.id,
      findingId: finding1.findingId,
      contract,
      newHeadSha: sha2,
      newArtifactDigest: "art-sha2",
      newReviewReceipt: witness2,
      originalReproductionFails: false,
      contractCriteriaPassed: ["crit-core-01", "crit-arch-01", "crit-arch-02"],
    });
    assert.equal(resResolve.resolved, true);

    // 4. Recurrence in sha3: defect reappears with verified evidence
    const rec3 = await recordOrReconcileFindings({
      stateRoot,
      contractId: contract.id,
      targetRevisionSha: sha3,
      classifiedFindings: candidateFindings,
    });

    assert.equal(rec3.findings.length, 1);
    const recurred = rec3.findings[0]!;
    assert.equal(recurred.status, "reopened");
    assert.equal(rec3.reopenedFindings.length, 1);

    // Full history event sequence must be preserved: detected -> repaired -> resolved -> reopened
    const events = recurred.history.map((h) => h.event);
    assert.deepEqual(events, ["detected", "repaired", "resolved", "reopened"]);
    assert.equal(recurred.history[0]?.revisionSha, sha1);
    assert.equal(recurred.history[1]?.revisionSha, sha2);
    assert.equal(recurred.history[2]?.revisionSha, sha2);
    assert.equal(recurred.history[3]?.revisionSha, sha3);
  } finally {
    await rm(stateRoot, { recursive: true, force: true });
  }
});
