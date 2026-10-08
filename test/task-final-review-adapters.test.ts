import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createDynamicFinalReviewPort,
  createNativeFinalReviewPort,
} from "../src/adapters/task-agents.js";
import {
  taskContractDigest,
  type TaskContract,
} from "../src/core/task-contract.js";
import type {
  TaskFinalReviewReport,
} from "../src/core/task-final-review.js";
import type { ProcessCode, ProcessResult, ProcessSpec } from "../src/core/process.js";
import type { HarnessId } from "../src/types.js";

function sampleContract(reviewer: HarnessId = "claude"): TaskContract {
  return {
    schemaVersion: 1,
    id: "milestone-adapter-contract",
    revision: 1,
    mode: "autopilot",
    category: "development",
    goal: "Verify native milestone final review adapters across 5 harnesses",
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
      reviewer,
      reviewerSession: "fresh-read-only",
    },
    resourcePolicy: {
      maxCycles: 2,
    },
  };
}

function buildValidFinalReport(options: {
  requestId: string;
  contractId: string;
  contractDigest: string;
  targetRevisionSha: string;
  artifactDigest: string;
  sessionId: string;
  reviewerHarness: string;
  verdict?: "accepted" | "rejected" | "unknown";
}): TaskFinalReviewReport {
  return {
    schemaVersion: 1,
    requestId: options.requestId,
    contractId: options.contractId,
    contractDigest: options.contractDigest,
    targetRevisionSha: options.targetRevisionSha,
    artifactDigest: options.artifactDigest,
    sessionId: options.sessionId,
    reviewerHarness: options.reviewerHarness,
    reviewerVersion: "1.0.0",
    evaluatedAt: new Date().toISOString(),
    overallVerdict: options.verdict ?? "accepted",
    requirements: [
      {
        requirementId: "REV-03",
        description: "Review report contracts",
        status: "verified",
        implementationLocation: {
          path: "src/core/task-final-review.ts",
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
    ],
    crossPhaseAssessment: {
      userFlow: { status: "pass", summary: "Workflow executes end-to-end" },
      approvalBoundaries: { status: "pass", summary: "Explicit gates respected" },
      gsdStateOwnership: { status: "pass", summary: "GSD owns lifecycle spine" },
      reviewerIndependence: { status: "pass", summary: "Read-only independent session" },
    },
    findings: [],
    summary: "Milestone meets all mandatory requirements.",
  };
}

function processResult(stdoutText: string, exitCode = 0, code: ProcessCode = "ok"): ProcessResult {
  return {
    code,
    exitCode,
    signal: null,
    timedOut: false,
    stdout: {
      excerpt: stdoutText,
      capped: false,
      totalBytes: Buffer.byteLength(stdoutText, "utf8"),
      sha256: "0".repeat(64),
    },
    stderr: {
      excerpt: "",
      capped: false,
      totalBytes: 0,
      sha256: "0".repeat(64),
    },
    outputCapped: false,
    durationMs: 10,
  };
}

test("Task 1: All 5 native harnesses successfully execute final review with structured output (REV-03, REV-04)", async () => {
  const harnesses: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  const targetRevisionSha = "1".repeat(40);
  const artifactDigest = "2".repeat(64);
  const requirements = [{ id: "REV-03", description: "Independent milestone review" }];

  for (const harness of harnesses) {
    const contract = sampleContract(harness);
    const contractDigest = taskContractDigest(contract);
    const capturedSpecs: ProcessSpec[] = [];

    const scratchDir = await mkdtemp(join(tmpdir(), `final-rev-${harness}-`));

    try {
      const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
        capturedSpecs.push(spec);

        // Find the sessionId passed in stdin prompt or args
        const promptText = spec.stdin ?? "";
        const sessionMatch = /sessionId ([0-9a-f-]{36})/i.exec(promptText);
        const requestMatch = /requestId ([0-9a-f-]{36})/i.exec(promptText);
        const sessionId = sessionMatch ? sessionMatch[1]! : randomUUID();
        const requestId = requestMatch ? requestMatch[1]! : randomUUID();

        const report = buildValidFinalReport({
          requestId,
          contractId: contract.id,
          contractDigest,
          targetRevisionSha,
          artifactDigest,
          sessionId,
          reviewerHarness: harness,
        });

        // Harness specific output formats
        if (harness === "claude") {
          const claudeJson = JSON.stringify({
            type: "result",
            session_id: sessionId,
            result: JSON.stringify(report),
          });
          return processResult(claudeJson);
        } else if (harness === "codex") {
          // Codex can write to last-message.json or stdout
          const lastMsgPath = join(scratchDir, ".alpha-aos-review", "final-last-message.json");
          await mkdir(join(scratchDir, ".alpha-aos-review"), { recursive: true });
          await writeFile(lastMsgPath, JSON.stringify(report), "utf8");
          return processResult(JSON.stringify(report));
        } else {
          // Antigravity, Pi, Hermes: direct stdout JSON
          return processResult(JSON.stringify(report));
        }
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
      });

      const report = await port.evaluateMilestoneFinal({
        contract,
        targetRevisionSha,
        artifactDigest,
        requirements,
        reviewRoot: scratchDir,
      });

      assert.equal(report.overallVerdict, "accepted");
      assert.equal(report.contractId, contract.id);
      assert.equal(report.contractDigest, contractDigest);
      assert.equal(report.targetRevisionSha, targetRevisionSha);
      assert.equal(report.artifactDigest, artifactDigest);
      assert.equal(report.reviewerHarness, harness);
      assert.equal(report.requirements.length, 1);
      assert.equal(report.crossPhaseAssessment.reviewerIndependence.status, "pass");

      // Verify command line bounds & read-only isolation flags
      assert.ok(capturedSpecs.length > 0, `${harness} runner was invoked`);
      const spec = capturedSpecs[0]!;
      if (harness === "claude") {
        assert.ok(spec.args.includes("--restricted"));
        assert.ok(spec.args.includes("plan"));
      } else if (harness === "codex") {
        assert.ok(spec.args.includes("--sandbox"));
        assert.ok(spec.args.includes("read-only"));
      } else if (harness === "antigravity") {
        assert.ok(spec.args.includes("--sandbox"));
        assert.ok(spec.args.includes("plan"));
      } else if (harness === "pi") {
        assert.ok(spec.args.includes("--no-session"));
        assert.ok(spec.args.includes("--tools"));
      } else if (harness === "hermes") {
        assert.ok(spec.args.includes("--toolsets"));
        assert.ok(spec.args.includes("file"));
      }
    } finally {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
});

test("createDynamicFinalReviewPort dispatches according to agentPolicy.reviewer", async () => {
  const contract = sampleContract("antigravity");
  const targetRevisionSha = "1".repeat(40);
  const artifactDigest = "2".repeat(64);
  const requirements = [{ id: "REV-03", description: "Independent review" }];
  const capturedSpecs: ProcessSpec[] = [];

  const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
    capturedSpecs.push(spec);
    const sessionMatch = /sessionId ([0-9a-f-]{36})/i.exec(spec.stdin ?? "");
    const requestMatch = /requestId ([0-9a-f-]{36})/i.exec(spec.stdin ?? "");
    const sessionId = sessionMatch ? sessionMatch[1]! : randomUUID();
    const requestId = requestMatch ? requestMatch[1]! : randomUUID();

    const report = buildValidFinalReport({
      requestId,
      contractId: contract.id,
      contractDigest: taskContractDigest(contract),
      targetRevisionSha,
      artifactDigest,
      sessionId,
      reviewerHarness: "antigravity",
    });
    return processResult(JSON.stringify(report));
  };

  const port = createDynamicFinalReviewPort(contract.agentPolicy, {
    runner,
    resolve: (cmd) => `C:/mock/${cmd}.exe`,
  });

  const report = await port.evaluateMilestoneFinal({
    contract,
    targetRevisionSha,
    artifactDigest,
    requirements,
    reviewRoot: "D:/dev/sample",
  });

  assert.equal(report.reviewerHarness, "antigravity");
  assert.equal(report.overallVerdict, "accepted");
  assert.ok(capturedSpecs[0]!.args.includes("--mode"));
});

test("Task 2: Adversarial failure scenarios are rejected across all harnesses (T-19-11)", async () => {
  const harnesses: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  const targetRevisionSha = "1".repeat(40);
  const artifactDigest = "2".repeat(64);
  const requirements = [{ id: "REV-03", description: "Independent review" }];

  for (const harness of harnesses) {
    const contract = sampleContract(harness);
    const contractDigest = taskContractDigest(contract);

    // 1. Session ID mismatch
    {
      const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
        const report = buildValidFinalReport({
          requestId: randomUUID(),
          contractId: contract.id,
          contractDigest,
          targetRevisionSha,
          artifactDigest,
          sessionId: randomUUID(), // Mismatched session!
          reviewerHarness: harness,
        });
        const out = harness === "claude"
          ? JSON.stringify({ type: "result", session_id: report.sessionId, result: JSON.stringify(report) })
          : JSON.stringify(report);
        return processResult(out);
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
      });

      await assert.rejects(
        () => port.evaluateMilestoneFinal({
          contract,
          targetRevisionSha,
          artifactDigest,
          requirements,
          reviewRoot: "D:/dev/sample",
        }),
        (err: Error) => {
          assert.match(err.message, /session|validation/i);
          return true;
        },
        `${harness} should reject mismatched session ID`,
      );
    }

    // 2. Digest / Revision SHA mismatch
    {
      const runner = async (spec: ProcessSpec): Promise<ProcessResult> => {
        const sessionMatch = /sessionId ([0-9a-f-]{36})/i.exec(spec.stdin ?? "");
        const requestMatch = /requestId ([0-9a-f-]{36})/i.exec(spec.stdin ?? "");
        const report = buildValidFinalReport({
          requestId: requestMatch ? requestMatch[1]! : randomUUID(),
          contractId: contract.id,
          contractDigest: "f".repeat(64), // Mismatched contract digest!
          targetRevisionSha,
          artifactDigest,
          sessionId: sessionMatch ? sessionMatch[1]! : randomUUID(),
          reviewerHarness: harness,
        });
        const out = harness === "claude"
          ? JSON.stringify({ type: "result", session_id: report.sessionId, result: JSON.stringify(report) })
          : JSON.stringify(report);
        return processResult(out);
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
      });

      await assert.rejects(
        () => port.evaluateMilestoneFinal({
          contract,
          targetRevisionSha,
          artifactDigest,
          requirements,
          reviewRoot: "D:/dev/sample",
        }),
        (err: Error) => {
          assert.match(err.message, /validation failed|contractDigest/i);
          return true;
        },
        `${harness} should reject mismatched contract digest`,
      );
    }

    // 3. Process failure (exitCode !== 0)
    {
      const runner = async (): Promise<ProcessResult> => {
        return processResult("error output", 1, "spawn-failed");
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
      });

      await assert.rejects(
        () => port.evaluateMilestoneFinal({
          contract,
          targetRevisionSha,
          artifactDigest,
          requirements,
          reviewRoot: "D:/dev/sample",
        }),
        (err: Error) => {
          assert.match(err.message, /process failed|spawn-failed|validation failed/i);
          return true;
        },
        `${harness} should reject non-zero exit code`,
      );
    }

    // 4. Truncated output / Invalid JSON
    {
      const runner = async (): Promise<ProcessResult> => {
        return processResult("{\"schemaVersion\": 1, \"requestId\": \"incomplete");
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
      });

      await assert.rejects(
        () => port.evaluateMilestoneFinal({
          contract,
          targetRevisionSha,
          artifactDigest,
          requirements,
          reviewRoot: "D:/dev/sample",
        }),
        (err: Error) => {
          assert.match(err.message, /valid JSON|parse|validation failed/i);
          return true;
        },
        `${harness} should reject truncated JSON`,
      );
    }

    // 5. Deadline passed before launch
    {
      const runner = async (): Promise<ProcessResult> => {
        return processResult("{}");
      };

      const port = createNativeFinalReviewPort(harness, {
        runner,
        resolve: (cmd) => `C:/mock/${cmd}.exe`,
        now: () => new Date("2026-10-08T16:00:00.000Z"),
      });

      await assert.rejects(
        () => port.evaluateMilestoneFinal({
          contract,
          targetRevisionSha,
          artifactDigest,
          requirements,
          reviewRoot: "D:/dev/sample",
          deadlineAt: new Date("2026-10-08T15:00:00.000Z"), // in the past!
        }),
        (err: Error) => {
          assert.match(err.message, /deadline passed/i);
          return true;
        },
        `${harness} should reject when deadline has passed`,
      );
    }
  }
});

test("Oversized final review prompt (> 64KB) is rejected before launching process", async () => {
  const contract = sampleContract("claude");
  const hugeRequirements = Array.from({ length: 1500 }, (_, i) => ({
    id: `REQ-${i}`,
    description: `Huge requirement description that takes substantial bytes to exceed sixty-four kilobytes prompt limit ${i}`,
  }));

  let runnerInvoked = false;
  const runner = async (): Promise<ProcessResult> => {
    runnerInvoked = true;
    return processResult("{}");
  };

  const port = createNativeFinalReviewPort("claude", {
    runner,
    resolve: (cmd) => `C:/mock/${cmd}.exe`,
  });

  await assert.rejects(
    () => port.evaluateMilestoneFinal({
      contract,
      targetRevisionSha: "1".repeat(40),
      artifactDigest: "2".repeat(64),
      requirements: hugeRequirements,
      reviewRoot: "D:/dev/sample",
    }),
    /exceeding 64KB bound/i,
  );

  assert.equal(runnerInvoked, false, "Runner was never invoked when prompt is too large");
});
