import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  gateMilestoneFinalReview,
  parseRequirementsFromMarkdown,
  readFinalReviewWitness,
  validateFinalReviewReport,
  type FinalReviewPort,
  type TaskFinalReviewReport,
} from "../src/core/task-final-review.js";
import { orchestrateMultiPhaseProgression } from "../src/core/task-gsd-lifecycle.js";
import { taskContractDigest, type TaskContract } from "../src/core/task-contract.js";
import { createOrdinaryRepository, gitCommand } from "./helpers/git-fixture.js";

function sampleContract(): TaskContract {
  return {
    schemaVersion: 1,
    id: "milestone-review-contract",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Test milestone final review workflow",
    scope: {
      projectRoot: "D:/dev/sample",
      workflow: "gsd-quick",
      summary: "Sample project",
    },
    allowedRoots: ["D:/dev/sample"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "crit-1",
        title: "Requirement 1",
        description: "Criterion 1",
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

function buildValidFinalReport(options: {
  contractId: string;
  contractDigest: string;
  targetRevisionSha: string;
  artifactDigest: string;
  verdict?: "accepted" | "rejected" | "unknown";
}): TaskFinalReviewReport {
  return {
    schemaVersion: 1,
    requestId: "a1111111-1111-4111-8111-111111111111",
    contractId: options.contractId,
    contractDigest: options.contractDigest,
    targetRevisionSha: options.targetRevisionSha,
    artifactDigest: options.artifactDigest,
    sessionId: "b2222222-2222-4222-8222-222222222222",
    reviewerHarness: "claude",
    reviewerVersion: "1.0.0",
    evaluatedAt: new Date().toISOString(),
    overallVerdict: options.verdict ?? "accepted",
    requirements: [
      {
        requirementId: "REV-01",
        description: "Review report contracts",
        status: "verified",
        implementationLocation: {
          path: "src/core/task-run.ts",
          lineRange: "100-200",
          digest: "c".repeat(64),
        },
        checkReceiptRef: {
          receiptId: "chk-01",
          digest: "d".repeat(64),
          status: "pass",
        },
        reviewEvidenceRef: {
          reportDigest: "e".repeat(64),
          criterionId: "crit-1",
        },
      },
      {
        requirementId: "REV-02",
        description: "Structured reviewer report",
        status: "verified",
        implementationLocation: {
          path: "src/core/task-review-evidence.ts",
          digest: "f".repeat(64),
        },
        checkReceiptRef: {
          receiptId: "chk-02",
          digest: "1".repeat(64),
          status: "pass",
        },
        reviewEvidenceRef: {
          reportDigest: "2".repeat(64),
        },
      },
    ],
    crossPhaseAssessment: {
      userFlow: { status: "pass", summary: "All user flows intact across phases." },
      approvalBoundaries: { status: "pass", summary: "Explicit approvals respected." },
      gsdStateOwnership: { status: "pass", summary: "GSD remains single state authority." },
      reviewerIndependence: { status: "pass", summary: "Independent fresh session confirmed." },
    },
    findings: [],
    summary: "Milestone final review passed all criteria.",
  };
}

async function writeFinalRequirements(root: string): Promise<void> {
  await mkdir(join(root, ".planning"), { recursive: true });
  await writeFile(join(root, ".planning", "REQUIREMENTS.md"), "# Requirements\n- **REV-01**: Review report contracts\n- **REV-02**: Structured reviewer report\n");
}

test("parseRequirementsFromMarkdown extracts requirement IDs and descriptions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-final-test-"));
  try {
    await mkdir(join(dir, ".planning"), { recursive: true });
    const content = `# Requirements\n- **REV-01**: Review contract\n- **REV-02**: Evidence locator\n`;
    await writeFile(join(dir, ".planning", "REQUIREMENTS.md"), content, "utf8");

    const reqs = await parseRequirementsFromMarkdown(dir);
    assert.equal(reqs.length, 2);
    assert.equal(reqs[0]?.id, "REV-01");
    assert.equal(reqs[1]?.id, "REV-02");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("validateFinalReviewReport validates schema and detects revision/digest drift", async () => {
  const contract = sampleContract();
  const cDigest = taskContractDigest(contract);
  const targetSha = "1111111111111111111111111111111111111111";
  const artDigest = "a".repeat(64);

  const report = buildValidFinalReport({
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
  });

  const valid = await validateFinalReviewReport(report, {
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: artDigest,
  });
  assert.equal(valid.valid, true);
  assert.ok(valid.report);

  // Drift in revision SHA
  const driftedSha = await validateFinalReviewReport(report, {
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: "2222222222222222222222222222222222222222",
    artifactDigest: artDigest,
  });
  assert.equal(driftedSha.valid, false);
  assert.match(driftedSha.issues.join("; "), /Target revision mismatch/);

  // Drift in artifact digest
  const driftedArt = await validateFinalReviewReport(report, {
    contractId: contract.id,
    contractDigest: cDigest,
    targetRevisionSha: targetSha,
    artifactDigest: "b".repeat(64),
  });
  assert.equal(driftedArt.valid, false);
  assert.match(driftedArt.issues.join("; "), /Artifact digest mismatch/);
});

test("D-13: gateMilestoneFinalReview returns unknown when port is absent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-final-test-"));
  try {
    await writeFinalRequirements(dir);
    const contract = sampleContract();
    const cDigest = taskContractDigest(contract);

    const gate = await gateMilestoneFinalReview({
      projectRoot: dir,
      stateRoot: dir,
      contract,
      contractDigest: cDigest,
      targetRevisionSha: "1111111111111111111111111111111111111111",
      workingTreeDigest: "a".repeat(64),
      finalReviewPort: undefined, // Port absent
    });

    assert.equal(gate.status, "unknown");
    assert.match(gate.reason, /Milestone final review port is absent/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("D-14: gateMilestoneFinalReview returns unknown when required evidence is missing or unverified", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-test-")));
  try {
    await writeFinalRequirements(dir);
    const contract = sampleContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "1111111111111111111111111111111111111111";
    const artDigest = "a".repeat(64);

    const completeReport = buildValidFinalReport({ contractId: contract.id, contractDigest: cDigest,
      targetRevisionSha: targetSha, artifactDigest: artDigest });
    const unverifiedReport: TaskFinalReviewReport = { ...completeReport,
      requirements: completeReport.requirements.map((row) => row.requirementId === "REV-01"
        ? { ...row, status: "unverified", checkReceiptRef: { ...row.checkReceiptRef, status: "unknown" } } : row),
    };

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => unverifiedReport,
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

    assert.equal(gate.status, "unknown");
    assert.match(gate.reason, /unverified requirements/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("D-15: gateMilestoneFinalReview rejects when cross-phase core constraints fail", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-test-")));
  try {
    await writeFinalRequirements(dir);
    const contract = sampleContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "1111111111111111111111111111111111111111";
    const artDigest = "a".repeat(64);

    const crossFailedReport: TaskFinalReviewReport = {
      ...buildValidFinalReport({
        contractId: contract.id,
        contractDigest: cDigest,
        targetRevisionSha: targetSha,
        artifactDigest: artDigest,
      }),
      crossPhaseAssessment: {
        userFlow: { status: "pass", summary: "Intact." },
        approvalBoundaries: { status: "fail", summary: "Automated write bypassed operator confirmation." },
        gsdStateOwnership: { status: "pass", summary: "GSD authority respected." },
        reviewerIndependence: { status: "pass", summary: "Independent session used." },
      },
    };

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => crossFailedReport,
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

    assert.equal(gate.status, "rejected");
    assert.match(gate.reason, /Cross-phase assessment failed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("REV-03, Task 2: missing feature or architecture violation blocks milestone and routes to GSD repair", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-test-")));
  try {
    await writeFinalRequirements(dir);
    const contract = sampleContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "1111111111111111111111111111111111111111";
    const artDigest = "a".repeat(64);

    const blockedReport: TaskFinalReviewReport = {
      ...buildValidFinalReport({
        contractId: contract.id,
        contractDigest: cDigest,
        targetRevisionSha: targetSha,
        artifactDigest: artDigest,
      }),
      findings: [
        {
          findingId: "f-missing-feature-1",
          category: "missing-requirement",
          impact: "blocking",
          scope: "in-scope",
          summary: "Essential rollback preflight routine is omitted",
          reproduction: {
            summary: "Command fails with missing module",
            observedExitCode: 1,
          },
        },
        {
          findingId: "f-arch-violation-1",
          category: "architecture-violation",
          impact: "blocking",
          scope: "in-scope",
          summary: "Direct native mutation bypasses transaction boundary",
          ruleConfirmation: {
            ruleId: "ARCH-TRANSACTIONS-01",
            ruleSource: "ARCHITECTURE.md",
            inspectedPath: "src/core/install.ts",
            observedViolation: "Direct fs.writeFileSync instead of applyFileTransaction",
            impact: "Bypasses crash recovery journal",
          },
        },
      ],
    };

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => blockedReport,
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

    assert.equal(gate.status, "blocked");
    assert.match(gate.reason, /detected 2 blocking defect\(s\); routed to GSD repair/);
    assert.ok(gate.routedGaps);
    assert.equal(gate.routedGaps.length, 2);
    assert.equal(gate.routedGaps[0]?.destination, "gap-plan");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("D-13, REV-03: successful final review yields accepted and writes immutable witness receipt", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-test-")));
  try {
    await writeFinalRequirements(dir);
    const contract = sampleContract();
    const cDigest = taskContractDigest(contract);
    const targetSha = "1111111111111111111111111111111111111111";
    const artDigest = "a".repeat(64);

    const validReport = buildValidFinalReport({
      contractId: contract.id,
      contractDigest: cDigest,
      targetRevisionSha: targetSha,
      artifactDigest: artDigest,
    });

    const port: FinalReviewPort = {
      evaluateMilestoneFinal: async () => validReport,
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

    assert.equal(gate.status, "accepted");
    assert.ok(gate.witnessReceipt);
    assert.equal(gate.witnessReceipt.overallVerdict, "accepted");

    // Reading from disk confirms receipt integrity
    const savedReceipt = await readFinalReviewWitness(dir, contract.id);
    assert.ok(savedReceipt);
    assert.equal(savedReceipt.receiptDigest, gate.witnessReceipt.receiptDigest);
    assert.equal(savedReceipt.targetRevisionSha, targetSha);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("orchestrateMultiPhaseProgression requires real GSD evidence and final independent acceptance", async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-test-")));
  try {
    const repository = await createOrdinaryRepository(dir, "project");
    assert.equal(repository.ok, true);
    if (!repository.ok) return;
    const projectRoot = repository.fixture.path;
    const stateRoot = join(dir, "runtime");
    const planning = join(projectRoot, ".planning");
    const phaseDir = join(planning, "phases", "01-fixture");
    await mkdir(planning, { recursive: true });
    await writeFile(join(planning, "ROADMAP.md"), "### Phase 01: Fixture\n");
    await writeFile(join(planning, "STATE.md"), "status: executing\n");
    await writeFinalRequirements(projectRoot);
    const contract = { ...sampleContract(), scope: { projectRoot, workflow: "gsd-multi-phase", summary: "fixture" }, allowedRoots: ["src"] };
    const baseCommit = gitCommand(projectRoot, ["rev-parse", "HEAD"]).stdout.trim();
    const noOp = { executable: process.execPath, args: ["-e", "process.exit(0)"] };
    const options = { projectRoot, stateRoot, contract, baseCommit, phases: ["01"],
      commandMap: { discuss: noOp, plan: noOp, execute: noOp, verify: noOp },
      hookCommand: process.execPath, hookArgs: ["-e", "process.exit(0)"] };
    assert.equal((await orchestrateMultiPhaseProgression(options)).finalStatus, "failed",
      "Exit zero without GSD evidence cannot reach acceptance");
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, "01-01-PLAN.md"), "# Plan\n");
    await writeFile(join(phaseDir, "01-01-SUMMARY.md"), "# Completed fixture\n");
    await writeFile(join(phaseDir, "01-VERIFICATION.md"), "---\nstatus: passed\n---\nObserved fixture verification.\n");
    await writeFile(join(planning, "STATE.md"), "Phase: 01 COMPLETE\n| 01 | 01-01 | complete |\n");
    gitCommand(projectRoot, ["add", "-A"]);
    assert.equal(gitCommand(projectRoot, ["commit", "-m", "docs(01-01): complete fixture"]).ok, true);
    assert.equal((await orchestrateMultiPhaseProgression(options)).finalStatus, "needs-input");
    let reviews = 0;
    const finalReviewPort: FinalReviewPort = { evaluateMilestoneFinal: async (request) => {
      reviews++;
      return buildValidFinalReport({ contractId: contract.id, contractDigest: taskContractDigest(contract),
        targetRevisionSha: request.targetRevisionSha, artifactDigest: request.artifactDigest });
    } };
    assert.equal((await orchestrateMultiPhaseProgression({ ...options, finalReviewPort })).finalStatus, "completed");
    assert.equal(reviews, 1);
    assert.equal((await orchestrateMultiPhaseProgression({ ...options, finalReviewPort })).finalStatus, "completed");
    assert.equal(reviews, 1, "Unchanged basis reuses the actual independent witness");
    await writeFile(join(planning, "REQUIREMENTS.md"), "- **REV-01**: Changed requirement basis.\n- **REV-02**: Structured reviewer report\n");
    assert.equal((await orchestrateMultiPhaseProgression({ ...options, finalReviewPort })).finalStatus, "completed");
    assert.equal(reviews, 2, "A requirement change invalidates the prior witness");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fresh final review cannot dispatch with an unavailable Codex USD meter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-final-meter-"));
  try {
    await writeFinalRequirements(dir);
    const base = sampleContract();
    const contract = { ...base, agentPolicy: { ...base.agentPolicy, controller: "codex" as const, executor: "codex" as const,
      reviewer: "codex" as const }, resourcePolicy: { maxCostUsd: 1 } };
    let calls = 0;
    const gate = await gateMilestoneFinalReview({ projectRoot: dir, stateRoot: dir, contract, contractDigest: taskContractDigest(contract),
      targetRevisionSha: "1".repeat(40), workingTreeDigest: "2".repeat(64), finalReviewPort: { evaluateMilestoneFinal: async () => {
        calls++; throw new Error("Unsupported paid invocation must not occur");
      } } });
    assert.equal(gate.status, "unknown");
    assert.equal(calls, 0);
    assert.match(gate.reason, /telemetry_unavailable/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("final requirement coverage rejects omitted, duplicate and unknown schema-valid rows", async () => {
  for (const kind of ["omitted", "duplicate", "unknown"] as const) {
    const dir = await realpath(await mkdtemp(join(tmpdir(), "alpha-aos-final-coverage-")));
    try {
      await writeFinalRequirements(dir);
      const contract = sampleContract(), contractDigest = taskContractDigest(contract);
      const report = buildValidFinalReport({ contractId: contract.id, contractDigest, targetRevisionSha: "1".repeat(40), artifactDigest: "2".repeat(64) });
      const rows = kind === "omitted" ? report.requirements.slice(0, 1) : kind === "duplicate"
        ? [report.requirements[0]!, report.requirements[0]!]
        : [report.requirements[0]!, { ...report.requirements[1]!, requirementId: "REV-99" }];
      const gate = await gateMilestoneFinalReview({ projectRoot: dir, stateRoot: dir, contract, contractDigest,
        targetRevisionSha: report.targetRevisionSha, workingTreeDigest: report.artifactDigest,
        finalReviewPort: { evaluateMilestoneFinal: async () => ({ ...report, requirements: rows }) } });
      assert.equal(gate.status, "unknown");
      assert.match(gate.reason, /coverage/);
      assert.equal(await readFinalReviewWitness(dir, contract.id), null);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
