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
  validateConnectorManifest,
  canonicalizeConnectorManifest,
  type ConnectorManifestV1,
  type ConnectorFileReceiptV1,
} from "../src/core/task-connector.js";
import { validateTaskReviewEvidence } from "../src/core/task-review-evidence.js";
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

test("TOOL-01 / TOOL-04: validateConnectorManifest accepts valid empty items array", async () => {
  const emptyManifest = {
    protocolVersion: 1,
    schemaVersion: 1,
    connectorId: "generic-empty",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [],
  };
  const result = await validateConnectorManifest(emptyManifest);
  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
  assert.ok(result.manifest !== undefined);
});

test("TOOL-01 / TOOL-04: validateConnectorManifest rejects item with empty requiredFiles", async () => {
  const invalidManifest = {
    protocolVersion: 1,
    schemaVersion: 1,
    connectorId: "generic-bad-files",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "item-no-files",
        sourceIdentity: "src-01",
        intendedDestination: "out.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [], // minItems: 1 violation!
      },
    ],
  };
  const result = await validateConnectorManifest(invalidManifest);
  assert.equal(result.ok, false);
  assert.ok(result.issues.length > 0);
  assert.ok(result.issues.some((i) => i.includes("requiredFiles")));
});

test("TOOL-01 / TOOL-04: validateConnectorManifest rejects unknown protocol or schema versions", async () => {
  const badProtocol = {
    protocolVersion: 2,
    connectorId: "generic-bad",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [],
  };
  const res1 = await validateConnectorManifest(badProtocol);
  assert.equal(res1.ok, false);
  assert.ok(res1.issues.some((i) => i.includes("protocolVersion")));

  const badSchema = {
    protocolVersion: 1,
    schemaVersion: 99,
    connectorId: "generic-bad",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [],
  };
  const res2 = await validateConnectorManifest(badSchema);
  assert.equal(res2.ok, false);
  assert.ok(res2.issues.some((i) => i.includes("schemaVersion")));
});

test("TOOL-01 / TOOL-04: validateConnectorManifest rejects duplicate itemIds and duplicate fileIds", async () => {
  const dupItems = {
    protocolVersion: 1,
    connectorId: "generic-dup-items",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "dup-id",
        sourceIdentity: "src-01",
        intendedDestination: "out1.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f1", filename: "out1.txt", destination: "out1.txt" }],
      },
      {
        itemId: "dup-id", // Duplicate itemId
        sourceIdentity: "src-02",
        intendedDestination: "out2.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f2", filename: "out2.txt", destination: "out2.txt" }],
      },
    ],
  };
  const res1 = await validateConnectorManifest(dupItems);
  assert.equal(res1.ok, false);
  assert.ok(res1.issues.some((i) => i.includes("duplicate itemId")));

  const dupFiles = {
    protocolVersion: 1,
    connectorId: "generic-dup-files",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "item-1",
        sourceIdentity: "src-01",
        intendedDestination: "out1.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [
          { fileId: "file-dup", filename: "out1.txt", destination: "out1.txt" },
          { fileId: "file-dup", filename: "out2.txt", destination: "out2.txt" }, // Duplicate fileId
        ],
      },
    ],
  };
  const res2 = await validateConnectorManifest(dupFiles);
  assert.equal(res2.ok, false);
  assert.ok(res2.issues.some((i) => i.includes("duplicate fileId")));
});

test("TOOL-01 / TOOL-04: validateConnectorManifest rejects destination path traversal", async () => {
  const pathTraversal = {
    protocolVersion: 1,
    connectorId: "generic-traversal",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "item-traversal",
        sourceIdentity: "src-01",
        intendedDestination: "../escaped.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f1", filename: "escaped.txt", destination: "../escaped.txt" }],
      },
    ],
  };
  const result = await validateConnectorManifest(pathTraversal);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((i) => i.includes("without '..'")));
});

test("TOOL-01 / TOOL-04: validateConnectorManifest rejects unknown additionalProperties", async () => {
  const extraProps = {
    protocolVersion: 1,
    connectorId: "generic-extra",
    adapterContractDigest: "a".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [],
    unknownField: "malicious",
  };
  const result = await validateConnectorManifest(extraProps);
  assert.equal(result.ok, false);
});

test("TOOL-01 / TOOL-04: canonicalizeConnectorManifest orders items and files stably for identical digest", async () => {
  const manifestA: ConnectorManifestV1 = {
    protocolVersion: 1,
    schemaVersion: 1,
    connectorId: "stable-connector",
    adapterContractDigest: "b".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "item-b",
        sourceIdentity: "src-b",
        intendedDestination: "b.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [
          { fileId: "f-2", filename: "b2.txt", destination: "b2.txt" },
          { fileId: "f-1", filename: "b1.txt", destination: "b1.txt" },
        ],
      },
      {
        itemId: "item-a",
        sourceIdentity: "src-a",
        intendedDestination: "a.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f-a", filename: "a.txt", destination: "a.txt" }],
      },
    ],
  };

  const manifestB: ConnectorManifestV1 = {
    protocolVersion: 1,
    schemaVersion: 1,
    connectorId: "stable-connector",
    adapterContractDigest: "b".repeat(64),
    observedAt: "2026-10-09T00:00:00.000Z",
    items: [
      {
        itemId: "item-a",
        sourceIdentity: "src-a",
        intendedDestination: "a.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f-a", filename: "a.txt", destination: "a.txt" }],
      },
      {
        itemId: "item-b",
        sourceIdentity: "src-b",
        intendedDestination: "b.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [
          { fileId: "f-1", filename: "b1.txt", destination: "b1.txt" },
          { fileId: "f-2", filename: "b2.txt", destination: "b2.txt" },
        ],
      },
    ],
  };

  assert.equal(connectorManifestDigest(manifestA), connectorManifestDigest(manifestB));

  // Adding a new item MUST alter the digest
  const manifestC: ConnectorManifestV1 = {
    ...manifestA,
    items: [
      ...manifestA.items,
      {
        itemId: "item-c",
        sourceIdentity: "src-c",
        intendedDestination: "c.txt",
        effectKinds: ["workspace-write"],
        requiredFiles: [{ fileId: "f-c", filename: "c.txt", destination: "c.txt" }],
      },
    ],
  };
  assert.notEqual(connectorManifestDigest(manifestA), connectorManifestDigest(manifestC));
});

test("TOOL-04: validateTaskReviewEvidence validates connector-item and rejects falsified evidence", async () => {
  const contract: GeneralTaskContract = {
    schemaVersion: 1,
    id: "general-review-contract",
    revision: 1,
    mode: "autopilot",
    category: "general",
    goal: "Verify review evidence rejection",
    scope: {
      projectRoot: process.cwd(),
      workflow: "generic-connector",
      summary: "Review evidence test",
    },
    connectorId: "generic-fixture",
    protocolVersion: 1,
    manifestDigest: "c".repeat(64),
    allowedRoots: ["out.txt"],
    allowedEffects: ["workspace-write"],
    criterion: [
      {
        id: "crit-alpha",
        title: "Criterion alpha",
        description: "Outcome alpha",
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
    resourcePolicy: { maxCycles: 1 },
  };

  const trueArtifactDigest = "d".repeat(64);
  const contractDigest = "e".repeat(64);

  // 1. Valid review report matches
  const validReport = {
    schemaVersion: 2 as const,
    requestId: "req-1",
    contractId: contract.id,
    contractDigest,
    artifactDigest: trueArtifactDigest,
    targetRevisionSha: "general-target",
    suggestions: [],
    criteria: [
      {
        criterionId: "crit-alpha",
        verdict: "pass" as const,
        severity: "blocking" as const,
        evidence: "Item alpha verified",
        abstainReason: null,
        finding: null,
        locator: {
          kind: "connector-item" as const,
          identifier: "item-alpha",
          itemId: "item-alpha",
          digest: trueArtifactDigest,
          inspectedRange: null,
        },
      },
    ],
  };

  const validResult = await validateTaskReviewEvidence({
    report: validReport,
    request: {
      requestId: "req-1",
      contractDigest,
      artifactDigest: trueArtifactDigest,
      targetRevisionSha: "general-target",
      measurements: [],
    },
    contract,
    snapshotRoot: process.cwd(),
  });
  assert.equal(validResult.valid, true);

  // 2. Mismatched artifact digest in locator is rejected
  const tamperedDigestReport = {
    ...validReport,
    criteria: [
      {
        ...validReport.criteria[0]!,
        locator: {
          ...validReport.criteria[0]!.locator,
          digest: "f".repeat(64), // Mismatched digest
        },
      },
    ],
  };
  const tamperedDigestResult = await validateTaskReviewEvidence({
    report: tamperedDigestReport,
    request: {
      requestId: "req-1",
      contractDigest,
      artifactDigest: trueArtifactDigest,
      targetRevisionSha: "general-target",
      measurements: [],
    },
    contract,
    snapshotRoot: process.cwd(),
  });
  assert.equal(tamperedDigestResult.valid, false);
  assert.ok(tamperedDigestResult.issues.some((i) => i.code === "connector-item-digest-mismatch"));

  // 3. Unresolvable / unapproved item ID is rejected
  const unknownItemReport = {
    ...validReport,
    criteria: [
      {
        ...validReport.criteria[0]!,
        locator: {
          ...validReport.criteria[0]!.locator,
          identifier: "unknown-item-999",
          itemId: "unknown-item-999",
        },
      },
    ],
  };
  const unknownItemResult = await validateTaskReviewEvidence({
    report: unknownItemReport,
    request: {
      requestId: "req-1",
      contractDigest,
      artifactDigest: trueArtifactDigest,
      targetRevisionSha: "general-target",
      measurements: [],
    },
    contract,
    snapshotRoot: process.cwd(),
  });
  assert.equal(unknownItemResult.valid, false);
  assert.ok(unknownItemResult.issues.some((i) => i.code === "unresolvable-connector-item"));
});
