import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createGenericFixtureConnector,
  type ConnectorItemV1,
  type ConnectorManifestV1,
  type ConnectorPort,
} from "../src/core/task-connector.js";
import {
  approveTaskContract,
  taskContractDigest,
  type GeneralTaskContract,
} from "../src/core/task-contract.js";
import {
  assertNoConnectorEffectConflict,
  createEffectLedger,
  generateConnectorEffectKey,
  planConnectorFileEffects,
  reconcileEffectEvidence,
  reconcileLedgerOnRecovery,
  recordEffectState,
  type EffectLedgerEntry,
} from "../src/core/task-effects.js";
import {
  readCheckpoint,
  readJournalEvents,
  writeCheckpoint,
  type TaskCheckpoint,
} from "../src/core/task-journal.js";
import type { TaskPorts } from "../src/core/task-run.js";
import {
  readEffectLedger,
  resumeTask,
  saveEffectLedger,
} from "../src/core/task-supervisor.js";

test("generateConnectorEffectKey is stable across retry attempts and normalizes paths", () => {
  const baseInput = {
    contractDigest: "digest-abc",
    connectorId: "coursepilot",
    itemId: "lesson-01",
    fileId: "handout-pdf",
    destination: "content/lesson-01/handout.pdf",
  };

  const key1 = generateConnectorEffectKey(baseInput);
  const key2 = generateConnectorEffectKey({
    ...baseInput,
    destination: "content\\lesson-01\\handout.pdf", // windows path separator
  });

  assert.equal(key1.length, 64);
  assert.equal(key1, key2, "Effect key must normalize path separators");

  // Changing item or fileId changes the key
  const keyOtherItem = generateConnectorEffectKey({ ...baseInput, itemId: "lesson-02" });
  assert.notEqual(key1, keyOtherItem);

  const keyOtherFile = generateConnectorEffectKey({ ...baseInput, fileId: "video-mp4" });
  assert.notEqual(key1, keyOtherFile);
});

test("planConnectorFileEffects skips verified siblings and blocks on unknown effects", () => {
  const ledger = createEffectLedger("contract-digest-1");
  const contractDigest = "contract-digest-1";
  const connectorId = "coursepilot";

  const siblingKey = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-1",
    fileId: "file-sibling",
    destination: "downloads/file-sibling.txt",
  });

  // Mark sibling as already applied
  ledger.entries[siblingKey] = {
    effectKey: siblingKey,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-1",
      fileId: "file-sibling",
      destination: "downloads/file-sibling.txt",
    },
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };

  const items: ConnectorItemV1[] = [
    {
      itemId: "item-1",
      sourceIdentity: "source-1",
      intendedDestination: "downloads",
      effectKinds: ["external-download"],
      requiredFiles: [
        {
          fileId: "file-sibling",
          filename: "file-sibling.txt",
          destination: "downloads/file-sibling.txt",
        },
        {
          fileId: "file-pending",
          filename: "file-pending.txt",
          destination: "downloads/file-pending.txt",
        },
      ],
    },
  ];

  const plan = planConnectorFileEffects({
    contractDigest,
    connectorId,
    items,
    ledger,
    attemptIndex: 1, // retry attempt index
  });

  assert.equal(plan.skippedKeys.length, 1);
  assert.equal(plan.skippedKeys[0], siblingKey);
  assert.equal(plan.plannedEntries.length, 1);
  assert.equal(plan.plannedEntries[0]?.targetPayload["fileId"], "file-pending");

  // If an effect is unknown, planning must block immediately
  const pendingKey = plan.plannedEntries[0]!.effectKey;
  ledger.entries[pendingKey] = {
    ...plan.plannedEntries[0]!,
    status: "unknown",
    error: "Ambiguous hash",
  };

  assert.throws(
    () =>
      planConnectorFileEffects({
        contractDigest,
        connectorId,
        items,
        ledger,
      }),
    /existing effect is in unknown status/u,
  );
});

test("assertNoConnectorEffectConflict rejects duplicate destination collisions across entries", () => {
  const ledger = createEffectLedger("digest-conflict");
  const contractDigest = "digest-conflict";
  const connectorId = "connector-a";

  const key1 = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-1",
    fileId: "f1",
    destination: "shared/target.txt",
  });

  ledger.entries[key1] = {
    effectKey: key1,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-1",
      destination: "shared/target.txt",
    },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const candidateKey = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-2", // different item aiming at same destination
    fileId: "f2",
    destination: "shared/target.txt",
  });

  const candidate: EffectLedgerEntry = {
    effectKey: candidateKey,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-2",
      destination: "shared/target.txt",
    },
    status: "planned",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  assert.throws(
    () => assertNoConnectorEffectConflict(ledger, candidate),
    /Destination "shared\/target.txt" is already occupied/u,
  );
});

test("reconcileEffectEvidence correctly reconciles external-download with filesystem and connector", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-conn-eff-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const contractDigest = "digest-recon-1";
  const connectorId = "mock-connector";
  const relDest = "data/sample.json";
  const absPath = join(dir, "data", "sample.json");
  await mkdir(join(dir, "data"), { recursive: true });

  const sampleContent = JSON.stringify({ hello: "world" });
  const sampleSha = createHash("sha256").update(sampleContent).digest("hex");
  const sampleBytes = Buffer.byteLength(sampleContent);

  const effectKey = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-sample",
    fileId: "sample-json",
    destination: relDest,
  });

  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-sample",
      fileId: "sample-json",
      destination: relDest,
      expectedSha256: sampleSha,
      expectedBytes: sampleBytes,
    },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  // Case 1: File absent, no connector -> not-applied
  const resAbsent = await reconcileEffectEvidence(dir, null, entry);
  assert.equal(resAbsent.status, "not-applied");

  // Case 2: File present with exact match -> applied
  await writeFile(absPath, sampleContent, "utf8");
  const resApplied = await reconcileEffectEvidence(dir, null, entry);
  assert.equal(resApplied.status, "applied");

  // Case 3: File present but corrupted/tampered hash -> unknown
  await writeFile(absPath, JSON.stringify({ corrupted: true }), "utf8");
  const resCorrupted = await reconcileEffectEvidence(dir, null, entry);
  assert.equal(resCorrupted.status, "unknown");
  assert.match(resCorrupted.reason ?? "", /sha256 mismatch/u);

  // Restore correct file
  await writeFile(absPath, sampleContent, "utf8");

  // Case 4: Connector port reports absent -> not-applied
  const mockPortAbsent: ConnectorPort = {
    preview: async () => {
      throw new Error("not implemented");
    },
    perform: async () => {
      throw new Error("not implemented");
    },
    reconcile: async () => ({ itemId: "item-sample", status: "absent", detail: "Remote item missing" }),
    verify: async () => {
      throw new Error("not implemented");
    },
  };
  const dummyManifest: ConnectorManifestV1 = {
    protocolVersion: 1,
    connectorId,
    adapterContractDigest: "adapter-digest",
    observedAt: new Date().toISOString(),
    items: [],
  };

  const resConnAbsent = await reconcileEffectEvidence(dir, null, entry, {
    connectorPort: mockPortAbsent,
    manifest: dummyManifest,
  });
  assert.equal(resConnAbsent.status, "not-applied");

  // Case 5: Connector port reports unknown -> unknown
  const mockPortUnknown: ConnectorPort = {
    preview: async () => {
      throw new Error("not implemented");
    },
    perform: async () => {
      throw new Error("not implemented");
    },
    reconcile: async () => ({ itemId: "item-sample", status: "unknown", detail: "Network timeout" }),
    verify: async () => {
      throw new Error("not implemented");
    },
  };

  const resConnUnknown = await reconcileEffectEvidence(dir, null, entry, {
    connectorPort: mockPortUnknown,
    manifest: dummyManifest,
  });
  assert.equal(resConnUnknown.status, "unknown");
  assert.match(resConnUnknown.reason ?? "", /Network timeout/u);
});

test("reconcileLedgerOnRecovery reverts deleted applied files to planned and halts on unknown (D-08, D-10)", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-recon-rec-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const contractDigest = "digest-rec-d08";
  const connectorId = "coursepilot";
  const ledger = createEffectLedger(contractDigest);

  const file1Dest = "files/existing.txt";
  const file1Abs = join(dir, "files", "existing.txt");
  await mkdir(join(dir, "files"), { recursive: true });
  await writeFile(file1Abs, "existing content", "utf8");
  const file1Sha = createHash("sha256").update("existing content").digest("hex");

  const key1 = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-1",
    fileId: "f1",
    destination: file1Dest,
  });

  // Entry 1 was previously applied and file still exists
  ledger.entries[key1] = {
    effectKey: key1,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-1",
      destination: file1Dest,
      expectedSha256: file1Sha,
    },
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    evidence: "verified",
  };

  // Entry 2 was previously applied but file was deleted before recovery!
  const file2Dest = "files/deleted.txt";
  const key2 = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-2",
    fileId: "f2",
    destination: file2Dest,
  });
  ledger.entries[key2] = {
    effectKey: key2,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-2",
      destination: file2Dest,
      expectedSha256: "some-sha",
    },
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    evidence: "verified",
  };

  // Entry 3 was performing and file was corrupted
  const file3Dest = "files/corrupted.txt";
  const file3Abs = join(dir, "files", "corrupted.txt");
  await writeFile(file3Abs, "corrupt data", "utf8");
  const key3 = generateConnectorEffectKey({
    contractDigest,
    connectorId,
    itemId: "item-3",
    fileId: "f3",
    destination: file3Dest,
  });
  ledger.entries[key3] = {
    effectKey: key3,
    contractDigest,
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {
      connectorId,
      itemId: "item-3",
      destination: file3Dest,
      expectedSha256: "different-sha",
    },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };

  const recResult = await reconcileLedgerOnRecovery(dir, null, ledger, { reverifyAppliedFiles: true });

  assert.equal(recResult.hasUnknown, true, "Must flag unknown effects");
  assert.equal(recResult.unknownEffects.length, 1);
  assert.equal(recResult.unknownEffects[0]?.effectKey, key3);

  // Key 1 remains applied
  assert.equal(ledger.entries[key1]?.status, "applied");

  // Key 2 was demoted to planned because its file disappeared
  assert.equal(ledger.entries[key2]?.status, "planned");
  assert.equal(ledger.entries[key2]?.completedAt, null);
  assert.equal(recResult.demotedEffects.length, 1);
  assert.equal(recResult.demotedEffects[0]?.effectKey, key2);
});

test("recordEffectState allows recovery demotion only when explicit option is passed", () => {
  const ledger = createEffectLedger("digest-demote");
  const effectKey = "effect-demote-01";

  const entry: EffectLedgerEntry = {
    effectKey,
    contractDigest: "digest-demote",
    attemptIndex: 0,
    effectType: "external-download",
    targetPayload: {},
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  };
  ledger.entries[effectKey] = { ...entry };

  // Without allowRecoveryDemotion -> throws
  entry.status = "planned";
  assert.throws(
    () => recordEffectState(ledger, entry),
    /Invalid effect state transition from "applied" to "planned"/u,
  );

  // With allowRecoveryDemotion -> allowed
  recordEffectState(ledger, entry, { allowRecoveryDemotion: true });
  assert.equal(ledger.entries[effectKey]?.status, "planned");
});

test("resumeTask on general contract demotes missing applied files to planned and audits in journal", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-sup-gen-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const contractPath = join(dir, "task-contract.json");
  const stateRoot = join(dir, "state");
  const projectRoot = join(dir, "project");
  await mkdir(projectRoot, { recursive: true });

  const items: ConnectorItemV1[] = [
    {
      itemId: "item-alpha",
      sourceIdentity: "source-alpha",
      intendedDestination: "downloads",
      effectKinds: ["workspace-write", "external-download"],
      requiredFiles: [
        {
          fileId: "file-keep",
          filename: "keep.txt",
          destination: "keep.txt",
        },
        {
          fileId: "file-remove",
          filename: "remove.txt",
          destination: "remove.txt",
        },
      ],
    },
  ];

  const connector = createGenericFixtureConnector({
    projectRoot,
    items,
  });

  const preview = await connector.preview({ projectRoot });

  const rawContract: GeneralTaskContract = {
    schemaVersion: 1,
    id: "general-task-01",
    revision: 1,
    mode: "autopilot",
    category: "general",
    connectorId: "generic-fixture",
    protocolVersion: 1,
    manifestDigest: preview.manifestDigest,
    goal: "Test recovery",
    scope: {
      projectRoot,
      summary: "General test task",
    },
    allowedRoots: ["keep.txt", "remove.txt"],
    allowedEffects: ["workspace-write", "external-download"],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
    resourcePolicy: {
      maxCycles: 5,
      maxWallTimeMinutes: 60,
      maxTokens: 100000,
      maxCostUsd: 10,
    },
    criterion: [
      {
        id: "crit-1",
        title: "verify item-alpha",
        description: "Outcome verification",
        mandatory: true,
        measurement: {
          kind: "outcome",
          itemId: "item-alpha",
          expect: { status: "verified" },
        },
      },
    ],
  };

  const digest = taskContractDigest(rawContract);
  await writeFile(contractPath, JSON.stringify(rawContract, null, 2), "utf8");
  await approveTaskContract({
    contractPath,
    expectedDigest: digest,
    stateRoot,
  });

  // Keep file-keep on disk
  await writeFile(join(projectRoot, "keep.txt"), "staying here", "utf8");
  const keepSha = createHash("sha256").update("staying here").digest("hex");
  // Do NOT write remove.txt on disk (simulating file disappeared!)

  const keyKeep = generateConnectorEffectKey({
    contractDigest: digest,
    connectorId: "generic-fixture",
    itemId: "item-alpha",
    fileId: "file-keep",
    destination: "keep.txt",
  });
  const keyRemove = generateConnectorEffectKey({
    contractDigest: digest,
    connectorId: "generic-fixture",
    itemId: "item-alpha",
    fileId: "file-remove",
    destination: "remove.txt",
  });

  const ledger = createEffectLedger(digest);
  ledger.entries[keyKeep] = {
    effectKey: keyKeep,
    contractDigest: digest,
    attemptIndex: 1,
    effectType: "external-download",
    targetPayload: {
      connectorId: "generic-fixture",
      itemId: "item-alpha",
      fileId: "file-keep",
      destination: "keep.txt",
      expectedSha256: keepSha,
    },
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    evidence: "pre-verified",
  };
  ledger.entries[keyRemove] = {
    effectKey: keyRemove,
    contractDigest: digest,
    attemptIndex: 1,
    effectType: "external-download",
    targetPayload: {
      connectorId: "generic-fixture",
      itemId: "item-alpha",
      fileId: "file-remove",
      destination: "remove.txt",
      expectedSha256: "some-hash",
    },
    status: "applied",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    evidence: "pre-verified",
  };
  await saveEffectLedger(stateRoot, digest, ledger);

  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "general-task-01",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(stateRoot, checkpoint);

  const ports: TaskPorts = {
    controller: {
      dispatch: async () => ({
        harness: "codex",
        version: "1.0.0",
        executable: "/bin/codex",
        sessionId: "sess-1",
        exitCode: 0,
        processCode: "completed",
        terminal: "completed",
        claim: { status: "completed", summary: "ok", authorityRequest: null, gsdQuickId: "quick-1" },
        detail: null,
      }),
    },
    reviewer: {
      review: async (req) => ({
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
          targetRevisionSha: req.targetRevisionSha ?? "target",
          suggestions: [],
          criteria: req.contract.criterion.map((c) => ({
            criterionId: c.id,
            verdict: "pass",
            severity: "blocking",
            evidence: "Verified",
            abstainReason: null,
            finding: null,
            locator: {
              kind: "connector-item",
              identifier: "item-alpha",
              digest: req.artifactDigest,
              inspectedRange: null,
            },
          })),
        },
      }),
    },
    assess: async () => ({
      supported: true,
      controller: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
      reviewer: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
      missingProof: [],
    }),
    connector,
  };

  await resumeTask({
    contractPath,
    stateRoot,
    packageRoot: dir,
    ports,
  });

  const reloadedLedger = await readEffectLedger(stateRoot, digest);
  assert.ok(reloadedLedger);
  assert.equal(reloadedLedger.entries[keyKeep]?.status, "applied");
  const events = await readJournalEvents(stateRoot, digest);
  const demoteEvent = events.find((e) => e.kind === "effect_reconciled");
  assert.ok(demoteEvent, "Must record demoted event in journal on recovery");
  assert.equal((demoteEvent.payload as any).action, "demoted_missing_applied_files");
});

test("resumeTask halts and records blocked checkpoint when unknown connector effect exists", async (context) => {
  const dir = await mkdtemp(join(tmpdir(), "alpha-aos-sup-gen-unk-"));
  context.after(async () => rm(dir, { recursive: true, force: true }));

  const contractPath = join(dir, "task-contract.json");
  const stateRoot = join(dir, "state");
  const projectRoot = join(dir, "project");
  await mkdir(projectRoot, { recursive: true });

  const items: ConnectorItemV1[] = [
    {
      itemId: "item-alpha",
      sourceIdentity: "source-alpha",
      intendedDestination: "downloads",
      effectKinds: ["workspace-write", "external-download"],
      requiredFiles: [
        {
          fileId: "file-corrupt",
          filename: "corrupt.txt",
          destination: "corrupt.txt",
        },
      ],
    },
  ];

  const connector = createGenericFixtureConnector({
    projectRoot,
    items,
  });

  const preview = await connector.preview({ projectRoot });

  const rawContract: GeneralTaskContract = {
    schemaVersion: 1,
    id: "general-task-unk",
    revision: 1,
    mode: "autopilot",
    category: "general",
    connectorId: "generic-fixture",
    protocolVersion: 1,
    manifestDigest: preview.manifestDigest,
    goal: "Test recovery blocked",
    scope: {
      projectRoot,
      summary: "General test task with unknown effect",
    },
    allowedRoots: ["corrupt.txt"],
    allowedEffects: ["workspace-write", "external-download"],
    agentPolicy: {
      controller: "codex",
      executor: "codex",
      reviewer: "codex",
      reviewerSession: "fresh-read-only",
      differentReviewerPolicy: "allow-same",
    },
    resourcePolicy: {
      maxCycles: 5,
      maxWallTimeMinutes: 60,
      maxTokens: 100000,
      maxCostUsd: 10,
    },
    criterion: [
      {
        id: "crit-1",
        title: "verify item-alpha",
        description: "Outcome verification",
        mandatory: true,
        measurement: {
          kind: "outcome",
          itemId: "item-alpha",
          expect: { status: "verified" },
        },
      },
    ],
  };

  const digest = taskContractDigest(rawContract);
  await writeFile(contractPath, JSON.stringify(rawContract, null, 2), "utf8");
  await approveTaskContract({
    contractPath,
    expectedDigest: digest,
    stateRoot,
  });

  // Write corrupt content on disk
  await writeFile(join(projectRoot, "corrupt.txt"), "unexpected corrupted bytes", "utf8");

  const keyCorrupt = generateConnectorEffectKey({
    contractDigest: digest,
    connectorId: "generic-fixture",
    itemId: "item-alpha",
    fileId: "file-corrupt",
    destination: "corrupt.txt",
  });

  const ledger = createEffectLedger(digest);
  ledger.entries[keyCorrupt] = {
    effectKey: keyCorrupt,
    contractDigest: digest,
    attemptIndex: 1,
    effectType: "external-download",
    targetPayload: {
      connectorId: "generic-fixture",
      itemId: "item-alpha",
      fileId: "file-corrupt",
      destination: "corrupt.txt",
      expectedSha256: createHash("sha256").update("expected content").digest("hex"),
    },
    status: "performing",
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  await saveEffectLedger(stateRoot, digest, ledger);

  const checkpoint: TaskCheckpoint = {
    schemaVersion: 1,
    contractDigest: digest,
    contractId: "general-task-unk",
    revision: 1,
    status: "running",
    attemptIndex: 1,
    lastSequence: 1,
    lastVerifiedHead: null,
    usage: { cycles: 1, wallTimeMs: 1000, tokens: null, costUsd: null },
    stopReason: null,
    updatedAt: new Date().toISOString(),
  };
  await writeCheckpoint(stateRoot, checkpoint);

  const ports: TaskPorts = {
    controller: {
      dispatch: async () => {
        throw new Error("Controller should not be called when blocked");
      },
    },
    reviewer: {
      review: async () => {
        throw new Error("Reviewer should not be called when blocked");
      },
    },
    assess: async () => ({
      supported: true,
      controller: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
      reviewer: { harness: "codex", version: "1.0.0", executable: "/bin/codex" },
      missingProof: [],
    }),
    connector,
  };

  const result = await resumeTask({
    contractPath,
    stateRoot,
    packageRoot: dir,
    ports,
  });

  assert.equal(result.status, "blocked");
  assert.ok(result.checkpoint.stopReason?.includes("ambiguous_effect_recovery"));
  assert.ok(result.checkpoint.stopReason?.includes(keyCorrupt));

  const events = await readJournalEvents(stateRoot, digest);
  const blockedEvent = events.find((e) => e.kind === "blocked");
  assert.ok(blockedEvent);
  assert.equal((blockedEvent.payload as any).nextAction, "reconcile_or_repair_source_evidence");
});

