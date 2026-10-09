import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  approveTaskContract,
  loadTaskContract,
  previewTaskContract,
  TaskContractError,
  type GeneralTaskContract,
} from "../src/core/task-contract.js";
import {
  createGenericFixtureConnector,
  connectorManifestDigest,
  connectorArtifactDigest,
  type ConnectorManifestV1,
  type ConnectorFileReceiptV1,
} from "../src/core/task-connector.js";
import {
  startTask,
  TaskRunError,
  type ReviewRequest,
  type ReviewDispatchResult,
  type TaskPorts,
  type ControllerPort,
  type ReviewerPort,
  type TaskPortAssessment,
} from "../src/core/task-run.js";

interface FixtureSetup {
  dir: string;
  contractPath: string;
  stateRoot: string;
}

async function setupFixture(): Promise<FixtureSetup> {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-connector-"));
  const contractPath = join(dir, "task-contract.json");
  const stateRoot = join(dir, "state");
  return { dir, contractPath, stateRoot };
}

function mockPorts(options: {
  connector: ReturnType<typeof createGenericFixtureConnector>;
  reviewerOutcome?: "pass" | "fail";
}): TaskPorts {
  const controller: ControllerPort = {
    async dispatch() {
      return {
        harness: "codex",
        version: "1.0.0",
        executable: "/bin/codex",
        sessionId: "sess-1",
        exitCode: 0,
        processCode: "completed",
        terminal: "completed",
        claim: { status: "completed", summary: "ok", touchedFiles: [], authorityRequest: null, gsdQuickId: "quick-1" },
        detail: null,
      };
    },
  };

  const reviewer: ReviewerPort = {
    async review(req: ReviewRequest): Promise<ReviewDispatchResult> {
      const isPass = (options.reviewerOutcome ?? "pass") === "pass";
      return {
        harness: "codex",
        version: "1.0.0",
        executable: "/bin/codex",
        sessionId: "sess-rev-1",
        exitCode: 0,
        processCode: "completed",
        issues: [],
        report: {
          schemaVersion: 2,
          requestId: req.requestId,
          contractId: req.contract.id,
          contractDigest: req.contractDigest,
          artifactDigest: req.artifactDigest,
          targetRevisionSha: req.targetRevisionSha ?? "general-target",
          suggestions: [],
          criteria: req.contract.criterion.map((c) => ({
            criterionId: c.id,
            verdict: isPass ? "pass" : "fail",
            severity: "blocking" as const,
            evidence: isPass ? "Verified fixture file receipt on disk" : "Missing fixture file receipt",
            abstainReason: null,
            finding: isPass ? null : {
              summary: "Missing file",
              reproduction: null,
            },
            locator: isPass ? {
              kind: "connector-item" as const,
              identifier: "item-alpha",
              digest: req.artifactDigest,
              inspectedRange: null,
            } : null,
          })),
        },
      };
    },
  };

  const assess = async (): Promise<TaskPortAssessment> => ({
    supported: true,
    controller: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
    reviewer: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
    missingProof: [],
  });

  return {
    controller,
    reviewer,
    assess,
    connector: options.connector,
  };
}

test("TOOL-01 tracer: single fixture item executes preview -> perform -> reconcile -> verify -> independent review on non-git dir", async () => {
  const { dir, contractPath, stateRoot } = await setupFixture();
  try {
    const connector = createGenericFixtureConnector({ projectRoot: dir });
    const { manifest, manifestDigest } = await connector.preview({ projectRoot: dir });

    const contract: GeneralTaskContract = {
      schemaVersion: 1,
      id: "general-fixture-task",
      revision: 1,
      mode: "autopilot",
      category: "general",
      goal: "Execute single fixture connector item",
      scope: {
        projectRoot: dir,
        workflow: "generic-connector",
        summary: "Generic connector test",
      },
      connectorId: "generic-fixture",
      protocolVersion: 1,
      manifestDigest,
      allowedRoots: ["alpha-output.txt"],
      allowedEffects: ["workspace-write", "external-download"],
      criterion: [
        {
          id: "verify-item-alpha",
          title: "Verify item alpha",
          description: "Item alpha produces verified file receipt",
          mandatory: true,
          measurement: {
            kind: "outcome",
            itemId: "item-alpha",
            expect: { status: "verified" },
          },
        },
      ],
      agentPolicy: {
        controller: "codex",
        executor: "codex",
        reviewer: "codex",
        reviewerSession: "fresh-read-only",
      },
      resourcePolicy: {
        maxCycles: 5,
        maxWallTimeMinutes: 10,
      },
    };

    await writeFile(contractPath, JSON.stringify(contract, null, 2), "utf8");
    const preview = await previewTaskContract({ contractPath, stateRoot });
    assert.equal(preview.approved, false);
    assert.equal(typeof preview.digest, "string");

    const approval = await approveTaskContract({
      contractPath,
      expectedDigest: preview.digest,
      stateRoot,
    });
    assert.equal(approval.status, "approved");

    const ports = mockPorts({ connector });
    const { run } = await startTask({
      contractPath,
      expectedDigest: preview.digest,
      stateRoot,
      packageRoot: process.cwd(),
      ports,
    });

    assert.equal(run.status, "accepted");
    assert.equal(run.contractDigest, preview.digest);
    assert.ok(run.artifact !== null);
    assert.ok(run.verdict !== null);
    assert.equal(run.verdict.overall, "accepted");
    assert.equal(run.verdict.rows.length, 1);
    assert.equal(run.verdict.rows[0]?.verdict, "pass");
    assert.equal(run.verdict.rows[0]?.measured.outcome, "pass");
    assert.equal(run.baseCommit, null); // Proves no fake Git SHA was created!
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("TOOL-01 negative: altered manifest digest is rejected before perform", async () => {
  const { dir, contractPath, stateRoot } = await setupFixture();
  try {
    const connector = createGenericFixtureConnector({ projectRoot: dir });
    const { manifestDigest } = await connector.preview({ projectRoot: dir });

    const contract: GeneralTaskContract = {
      schemaVersion: 1,
      id: "general-fixture-task-2",
      revision: 1,
      mode: "autopilot",
      category: "general",
      goal: "Execute single fixture connector item",
      scope: {
        projectRoot: dir,
        workflow: "generic-connector",
        summary: "Generic connector test",
      },
      connectorId: "generic-fixture",
      protocolVersion: 1,
      manifestDigest: "0".repeat(64), // Stale/tampered manifest digest!
      allowedRoots: ["alpha-output.txt"],
      allowedEffects: ["workspace-write", "external-download"],
      criterion: [
        {
          id: "verify-item-alpha",
          title: "Verify item alpha",
          description: "Item alpha produces verified file receipt",
          mandatory: true,
          measurement: {
            kind: "outcome",
            itemId: "item-alpha",
            expect: { status: "verified" },
          },
        },
      ],
      agentPolicy: {
        controller: "codex",
        executor: "codex",
        reviewer: "codex",
        reviewerSession: "fresh-read-only",
      },
      resourcePolicy: {
        maxCycles: 5,
        maxWallTimeMinutes: 10,
      },
    };

    await writeFile(contractPath, JSON.stringify(contract, null, 2), "utf8");
    const preview = await previewTaskContract({ contractPath, stateRoot });
    const approval = await approveTaskContract({
      contractPath,
      expectedDigest: preview.digest,
      stateRoot,
    });
    assert.equal(approval.status, "approved");

    const ports = mockPorts({ connector });
    await assert.rejects(
      async () => {
        await startTask({
          contractPath,
          expectedDigest: preview.digest,
          stateRoot,
          packageRoot: process.cwd(),
          ports,
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof TaskRunError);
        assert.equal(error.code, "stale-manifest");
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
});
