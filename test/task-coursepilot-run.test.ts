import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  COURSEPILOT_CONNECTOR_ID,
  CoursePilotTaskAdapter,
  classifyCoursePilotPerformResult,
  parseCoursePilotPerformJson,
  type CoursePilotProcessRunner,
  type CoursePilotRuntimeResolution,
} from "../src/adapters/coursepilot-task.js";
import {
  connectorManifestDigest,
  type ConnectorItemV1,
  type ConnectorManifestV1,
} from "../src/core/task-connector.js";
import {
  createEffectLedger,
  generateConnectorEffectKey,
  planConnectorFileEffects,
} from "../src/core/task-effects.js";
import type { ProcessCode, ProcessResult } from "../src/core/process.js";

async function setupTestDir(prefix = "cp-run-"): Promise<string> {
  return await mkdtemp(join(tmpdir(), prefix));
}

function makeMockProcessResult(options: {
  code?: ProcessCode;
  exitCode?: number;
  stdoutText?: string;
  stderrText?: string;
}): ProcessResult {
  const stdoutRaw = options.stdoutText ?? "";
  const stderrRaw = options.stderrText ?? "";
  return {
    code: options.code ?? "ok",
    exitCode: options.exitCode ?? 0,
    signal: null,
    timedOut: false,
    outputCapped: false,
    durationMs: 10,
    stdout: {
      excerpt: stdoutRaw,
      capped: false,
      totalBytes: Buffer.byteLength(stdoutRaw, "utf8"),
      sha256: createHash("sha256").update(stdoutRaw).digest("hex"),
    },
    stderr: {
      excerpt: stderrRaw,
      capped: false,
      totalBytes: Buffer.byteLength(stderrRaw, "utf8"),
      sha256: createHash("sha256").update(stderrRaw).digest("hex"),
    },
  };
}

test("parseCoursePilotPerformJson enforces boundaries, operations, and schemas (TOOL-04)", () => {
  // 1. Valid perform JSON
  const valid = JSON.stringify({
    schema_version: 1,
    operation: "perform",
    status: "ok",
    module_id: "mod-01",
    course_id: "CS101",
    files: [
      {
        file_id: "f1",
        status: "downloaded",
        filename: "lecture.pdf",
        saved_path: "/tmp/lecture.pdf",
        filesize: 1024,
      },
    ],
  });
  const parsed = parseCoursePilotPerformJson(valid);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.operation, "perform");
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.moduleId, "mod-01");
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.fileId, "f1");

  // 2. Reject empty stdout
  assert.throws(
    () => parseCoursePilotPerformJson("   "),
    /empty stdout/u,
  );

  // 3. Reject malformed JSON
  assert.throws(
    () => parseCoursePilotPerformJson("{ not valid json"),
    /malformed JSON/u,
  );

  // 4. Reject unsupported schema version
  const badVersion = JSON.stringify({
    schema_version: 99,
    operation: "perform",
    status: "ok",
    module_id: "mod-01",
    files: [],
  });
  assert.throws(
    () => parseCoursePilotPerformJson(badVersion),
    /Unsupported CoursePilot schema version: 99/u,
  );

  // 5. Reject wrong operation
  const wrongOp = JSON.stringify({
    schema_version: 1,
    operation: "manifest",
    status: "ok",
    module_id: "mod-01",
    files: [],
  });
  assert.throws(
    () => parseCoursePilotPerformJson(wrongOp),
    /Expected operation 'perform'/u,
  );
});

test("two modules: first valid exit 2 status: stale sends affected selection to reapproval while second unchanged module runs (D-01, D-03, D-09, TOOL-04)", async () => {
  const testRoot = await setupTestDir("cp-two-mod-");
  try {
    const f2Content = "Second module content";
    const f2Path = join(testRoot, "mod-02-file.pdf");
    await writeFile(f2Path, f2Content, "utf8");
    const f2Sha = createHash("sha256").update(f2Content).digest("hex");

    const manifest: ConnectorManifestV1 = {
      protocolVersion: 1,
      schemaVersion: 1,
      connectorId: COURSEPILOT_CONNECTOR_ID,
      adapterContractDigest: "digest-1",
      observedAt: new Date().toISOString(),
      items: [
        {
          itemId: "mod-01",
          sourceIdentity: "cs101:1:mod-01",
          title: "Module 1",
          intendedDestination: testRoot,
          effectKinds: ["external-download"],
          requiredFiles: [
            {
              fileId: "f1",
              filename: "mod-01-file.pdf",
              destination: join(testRoot, "mod-01-file.pdf"),
            },
          ],
        },
        {
          itemId: "mod-02",
          sourceIdentity: "cs101:1:mod-02",
          title: "Module 2",
          intendedDestination: testRoot,
          effectKinds: ["external-download"],
          requiredFiles: [
            {
              fileId: "f2",
              filename: "mod-02-file.pdf",
              destination: f2Path,
              expectedSha256: f2Sha,
              expectedBytes: Buffer.byteLength(f2Content),
            },
          ],
        },
      ],
    };
    const expectedDigest = connectorManifestDigest(manifest);

    const callLog: string[] = [];
    const mockRunner: CoursePilotProcessRunner = async (options) => {
      const isMod1 = options.args.includes("mod-01");
      const isMod2 = options.args.includes("mod-02");

      if (isMod1) {
        callLog.push("mod-01");
        return makeMockProcessResult({
          exitCode: 2,
          stdoutText: JSON.stringify({
            schema_version: 1,
            operation: "perform",
            status: "stale",
            course_id: "cs101",
            module_id: "mod-01",
            files: [],
          }),
        });
      }

      if (isMod2) {
        callLog.push("mod-02");
        return makeMockProcessResult({
          exitCode: 0,
          stdoutText: JSON.stringify({
            schema_version: 1,
            operation: "perform",
            status: "ok",
            course_id: "cs101",
            module_id: "mod-02",
            files: [
              {
                file_id: "f2",
                status: "downloaded",
                saved_path: f2Path,
                filesize: Buffer.byteLength(f2Content),
                sha256: f2Sha,
              },
            ],
          }),
        });
      }

      throw new Error(`Unexpected invocation args: ${options.args.join(" ")}`);
    };

    const mockRuntime: CoursePilotRuntimeResolution = {
      status: "available",
      repoRoot: testRoot,
      skillPath: join(testRoot, "SKILL.md"),
      contractDocPath: join(testRoot, "JSON_CONTRACT.md"),
      skillFingerprint: "fingerprint",
      contractFingerprint: "doc-fingerprint",
      sourceCommit: "commit-sha",
      uvExecutable: "uv",
      contractVersion: 1,
      supported: true,
      missingProof: [],
      nextAction: null,
    };

    const adapter = new CoursePilotTaskAdapter({
      runtime: mockRuntime,
      runner: mockRunner,
      projectRoot: testRoot,
    });

    // 1. Perform mod-01: valid exit 2 status stale
    const res1 = await adapter.perform({
      manifest,
      itemId: "mod-01",
      expectedDigest,
    });

    assert.equal(res1.status, "stale");
    assert.equal(res1.fatal, false);
    assert.deepEqual(res1.staleItemIds, ["mod-01"]);
    assert.ok(res1.nextAction?.includes("reapproval"));

    // 2. Perform mod-02: second unchanged module runs normally
    const res2 = await adapter.perform({
      manifest,
      itemId: "mod-02",
      expectedDigest,
    });

    assert.equal(res2.status, "completed");
    assert.equal(res2.fatal, false);
    assert.equal(res2.receipts?.length, 1);
    assert.equal(res2.receipts?.[0]?.fileId, "f2");
    assert.equal(res2.receipts?.[0]?.sha256, f2Sha);

    // Assert both modules were called in order without mod-01 halting mod-02
    assert.deepEqual(callLog, ["mod-01", "mod-02"]);
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("exit 1 partial success preserves verified files and runs subsequent module (D-09, D-12)", async () => {
  const testRoot = await setupTestDir("cp-partial-");
  try {
    const f1Content = "F1 valid content";
    const f1Path = join(testRoot, "mod-01-f1.pdf");
    await writeFile(f1Path, f1Content, "utf8");
    const f1Sha = createHash("sha256").update(f1Content).digest("hex");

    const f3Content = "F3 valid content";
    const f3Path = join(testRoot, "mod-02-f3.pdf");
    await writeFile(f3Path, f3Content, "utf8");
    const f3Sha = createHash("sha256").update(f3Content).digest("hex");

    const manifest: ConnectorManifestV1 = {
      protocolVersion: 1,
      schemaVersion: 1,
      connectorId: COURSEPILOT_CONNECTOR_ID,
      adapterContractDigest: "digest-2",
      observedAt: new Date().toISOString(),
      items: [
        {
          itemId: "mod-01",
          sourceIdentity: "cs101:1:mod-01",
          title: "Module 1",
          intendedDestination: testRoot,
          effectKinds: ["external-download"],
          requiredFiles: [
            {
              fileId: "f1",
              filename: "mod-01-f1.pdf",
              destination: f1Path,
            },
            {
              fileId: "f2",
              filename: "mod-01-f2.pdf",
              destination: join(testRoot, "mod-01-f2.pdf"),
            },
          ],
        },
        {
          itemId: "mod-02",
          sourceIdentity: "cs101:1:mod-02",
          title: "Module 2",
          intendedDestination: testRoot,
          effectKinds: ["external-download"],
          requiredFiles: [
            {
              fileId: "f3",
              filename: "mod-02-f3.pdf",
              destination: f3Path,
            },
          ],
        },
      ],
    };
    const expectedDigest = connectorManifestDigest(manifest);

    const mockRunner: CoursePilotProcessRunner = async (options) => {
      if (options.args.includes("mod-01")) {
        return makeMockProcessResult({
          exitCode: 1,
          stdoutText: JSON.stringify({
            schema_version: 1,
            operation: "perform",
            status: "partial",
            course_id: "cs101",
            module_id: "mod-01",
            files: [
              {
                file_id: "f1",
                status: "downloaded",
                saved_path: f1Path,
                filesize: Buffer.byteLength(f1Content),
                sha256: f1Sha,
              },
              {
                file_id: "f2",
                status: "failed",
                error_message: "Download connection timeout",
              },
            ],
          }),
        });
      }

      if (options.args.includes("mod-02")) {
        return makeMockProcessResult({
          exitCode: 0,
          stdoutText: JSON.stringify({
            schema_version: 1,
            operation: "perform",
            status: "ok",
            course_id: "cs101",
            module_id: "mod-02",
            files: [
              {
                file_id: "f3",
                status: "downloaded",
                saved_path: f3Path,
                filesize: Buffer.byteLength(f3Content),
                sha256: f3Sha,
              },
            ],
          }),
        });
      }

      throw new Error(`Unexpected invocation args: ${options.args.join(" ")}`);
    };

    const mockRuntime: CoursePilotRuntimeResolution = {
      status: "available",
      repoRoot: testRoot,
      skillPath: join(testRoot, "SKILL.md"),
      contractDocPath: join(testRoot, "JSON_CONTRACT.md"),
      skillFingerprint: "fingerprint",
      contractFingerprint: "doc-fingerprint",
      sourceCommit: "commit-sha",
      uvExecutable: "uv",
      contractVersion: 1,
      supported: true,
      missingProof: [],
      nextAction: null,
    };

    const adapter = new CoursePilotTaskAdapter({
      runtime: mockRuntime,
      runner: mockRunner,
      projectRoot: testRoot,
    });

    const res1 = await adapter.perform({ manifest, itemId: "mod-01", expectedDigest });
    assert.equal(res1.status, "partial");
    assert.equal(res1.fatal, false);
    assert.equal(res1.receipts?.length, 1);
    assert.equal(res1.receipts?.[0]?.fileId, "f1");
    assert.equal(res1.unverifiedFiles?.length, 1);
    assert.equal(res1.unverifiedFiles?.[0]?.fileId, "f2");

    const res2 = await adapter.perform({ manifest, itemId: "mod-02", expectedDigest });
    assert.equal(res2.status, "completed");
    assert.equal(res2.receipts?.length, 1);
    assert.equal(res2.receipts?.[0]?.fileId, "f3");
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("D-12: CLI reporting downloaded when actual file is missing fails only that file", async () => {
  const testRoot = await setupTestDir("cp-missing-file-");
  try {
    const f2Content = "F2 actual file content";
    const f2Path = join(testRoot, "mod-01-f2.pdf");
    await writeFile(f2Path, f2Content, "utf8");

    const f1Path = join(testRoot, "mod-01-f1-missing.pdf");
    // f1 is intentionally NOT created on disk!

    const manifest: ConnectorManifestV1 = {
      protocolVersion: 1,
      schemaVersion: 1,
      connectorId: COURSEPILOT_CONNECTOR_ID,
      adapterContractDigest: "digest-3",
      observedAt: new Date().toISOString(),
      items: [
        {
          itemId: "mod-01",
          sourceIdentity: "cs101:1:mod-01",
          title: "Module 1",
          intendedDestination: testRoot,
          effectKinds: ["external-download"],
          requiredFiles: [
            { fileId: "f1", filename: "mod-01-f1-missing.pdf", destination: f1Path },
            { fileId: "f2", filename: "mod-01-f2.pdf", destination: f2Path },
          ],
        },
      ],
    };
    const expectedDigest = connectorManifestDigest(manifest);

    const mockRunner: CoursePilotProcessRunner = async () =>
      makeMockProcessResult({
        exitCode: 0,
        stdoutText: JSON.stringify({
          schema_version: 1,
          operation: "perform",
          status: "ok",
          course_id: "cs101",
          module_id: "mod-01",
          files: [
            { file_id: "f1", status: "downloaded", saved_path: f1Path },
            { file_id: "f2", status: "downloaded", saved_path: f2Path },
          ],
        }),
      });

    const adapter = new CoursePilotTaskAdapter({
      runtime: {
        status: "available",
        repoRoot: testRoot,
        skillPath: join(testRoot, "SKILL.md"),
        contractDocPath: join(testRoot, "JSON_CONTRACT.md"),
        skillFingerprint: "fp",
        contractFingerprint: "cp",
        sourceCommit: "commit",
        uvExecutable: "uv",
        contractVersion: 1,
        supported: true,
        missingProof: [],
        nextAction: null,
      },
      runner: mockRunner,
      projectRoot: testRoot,
    });

    const res = await adapter.perform({ manifest, itemId: "mod-01", expectedDigest });
    assert.equal(res.status, "partial");
    assert.equal(res.fatal, false);
    assert.equal(res.receipts?.length, 1);
    assert.equal(res.receipts?.[0]?.fileId, "f2");
    assert.equal(res.unverifiedFiles?.length, 1);
    assert.equal(res.unverifiedFiles?.[0]?.fileId, "f1");
    assert.equal(res.unverifiedFiles?.[0]?.status, "missing-file");
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("fatal scenarios halt with fatal: true and clear nextAction", async () => {
  const testRoot = await setupTestDir("cp-fatal-");
  try {
    const item: ConnectorItemV1 = {
      itemId: "mod-01",
      sourceIdentity: "cs101:1:mod-01",
      title: "Module 1",
      intendedDestination: testRoot,
      effectKinds: ["external-download"],
      requiredFiles: [{ fileId: "f1", filename: "f1.pdf", destination: join(testRoot, "f1.pdf") }],
    };

    // 1. Exit 2 with empty stdout
    const emptyRes = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({ exitCode: 2, stdoutText: "   " }),
      projectRoot: testRoot,
      item,
    });
    assert.equal(emptyRes.fatal, true);
    assert.equal(emptyRes.status, "fatal");
    assert.ok(emptyRes.detail?.includes("empty stdout"));

    // 2. Exit 2 with status: fatal
    const fatalRes = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({
        exitCode: 2,
        stdoutText: JSON.stringify({
          schema_version: 1,
          operation: "perform",
          status: "fatal",
          module_id: "mod-01",
          files: [],
          errors: [{ message: "Database connection lost" }],
        }),
      }),
      projectRoot: testRoot,
      item,
    });
    assert.equal(fatalRes.fatal, true);
    assert.equal(fatalRes.status, "fatal");
    assert.ok(fatalRes.detail?.includes("Database connection lost"));

    // 3. Unknown schema version
    const versionRes = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({
        exitCode: 0,
        stdoutText: JSON.stringify({
          schema_version: 999,
          operation: "perform",
          status: "ok",
          module_id: "mod-01",
          files: [],
        }),
      }),
      projectRoot: testRoot,
      item,
    });
    assert.equal(versionRes.fatal, true);
    assert.equal(versionRes.status, "fatal");
    assert.ok(versionRes.detail?.includes("Unsupported CoursePilot schema version"));

    // 4. Module ID identity mismatch
    const idMismatch = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({
        exitCode: 0,
        stdoutText: JSON.stringify({
          schema_version: 1,
          operation: "perform",
          status: "ok",
          module_id: "different-mod",
          files: [],
        }),
      }),
      projectRoot: testRoot,
      item,
    });
    assert.equal(idMismatch.fatal, true);
    assert.equal(idMismatch.status, "fatal");
    assert.ok(idMismatch.detail?.includes("Identity mismatch"));

    // 5. Unrecognized exit code 127
    const badExit = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({ exitCode: 127, stdoutText: "{}" }),
      projectRoot: testRoot,
      item,
    });
    assert.equal(badExit.fatal, true);
    assert.equal(badExit.status, "fatal");
    assert.ok(badExit.detail?.includes("Unrecognized CoursePilot CLI exit code"));
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("viewed_only results in unverified manual-check status without receipts (D-11)", async () => {
  const testRoot = await setupTestDir("cp-viewed-");
  try {
    const item: ConnectorItemV1 = {
      itemId: "mod-01",
      sourceIdentity: "cs101:1:mod-01",
      title: "Module 1",
      intendedDestination: testRoot,
      effectKinds: ["external-download"],
      requiredFiles: [{ fileId: "f1", filename: "f1.pdf", destination: join(testRoot, "f1.pdf") }],
    };

    const res = await classifyCoursePilotPerformResult({
      result: makeMockProcessResult({
        exitCode: 0,
        stdoutText: JSON.stringify({
          schema_version: 1,
          operation: "perform",
          status: "ok",
          module_id: "mod-01",
          files: [{ file_id: "f1", status: "viewed_only" }],
        }),
      }),
      projectRoot: testRoot,
      item,
    });

    assert.equal(res.status, "failed");
    assert.equal(res.fatal, false);
    assert.equal(res.receipts?.length, 0);
    assert.equal(res.unverifiedFiles?.length, 1);
    assert.equal(res.unverifiedFiles?.[0]?.status, "viewed_only");
    assert.ok(res.unverifiedFiles?.[0]?.reason.includes("Viewed only without physical download"));
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("verified sibling is skipped on retry with zero external calls (D-10, D-17)", async () => {
  const testRoot = await setupTestDir("cp-retry-sibling-");
  try {
    const contractDigest = "digest-retry-test";
    const connectorId = COURSEPILOT_CONNECTOR_ID;
    const ledger = createEffectLedger(contractDigest);

    const f1Key = generateConnectorEffectKey({
      contractDigest,
      connectorId,
      itemId: "mod-01",
      fileId: "f1",
      destination: join(testRoot, "f1.pdf"),
    });

    // Mark f1 as already applied (verified sibling)
    ledger.entries[f1Key] = {
      effectKey: f1Key,
      contractDigest,
      attemptIndex: 0,
      effectType: "external-download",
      targetPayload: {
        connectorId,
        itemId: "mod-01",
        fileId: "f1",
        destination: join(testRoot, "f1.pdf"),
      },
      status: "applied",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };

    const items: ConnectorItemV1[] = [
      {
        itemId: "mod-01",
        sourceIdentity: "cs101:1:mod-01",
        title: "Module 1",
        intendedDestination: testRoot,
        effectKinds: ["external-download"],
        requiredFiles: [
          { fileId: "f1", filename: "f1.pdf", destination: join(testRoot, "f1.pdf") },
          { fileId: "f2", filename: "f2.pdf", destination: join(testRoot, "f2.pdf") },
        ],
      },
    ];

    const plan = planConnectorFileEffects({
      contractDigest,
      connectorId,
      items,
      ledger,
      attemptIndex: 1,
    });

    // f1 must be skipped
    assert.deepEqual(plan.skippedKeys, [f1Key]);
    // only f2 must be planned
    assert.equal(plan.plannedEntries.length, 1);
    assert.equal(plan.plannedEntries[0]?.targetPayload["fileId"], "f2");

    // Call adapter with exact file selector: f2 only
    const f2Content = "F2 retry content";
    const f2Path = join(testRoot, "f2.pdf");
    await writeFile(f2Path, f2Content, "utf8");

    const invokedFiles: string[] = [];
    const mockRunner: CoursePilotProcessRunner = async (options) => {
      const fileIdx = options.args.indexOf("--file-id");
      if (fileIdx !== -1 && options.args[fileIdx + 1]) {
        invokedFiles.push(options.args[fileIdx + 1]!);
      }
      return makeMockProcessResult({
        exitCode: 0,
        stdoutText: JSON.stringify({
          schema_version: 1,
          operation: "perform",
          status: "ok",
          module_id: "mod-01",
          file_id: "f2",
          files: [
            {
              file_id: "f2",
              status: "downloaded",
              saved_path: f2Path,
              filesize: Buffer.byteLength(f2Content),
            },
          ],
        }),
      });
    };

    const adapter = new CoursePilotTaskAdapter({
      runtime: {
        status: "available",
        repoRoot: testRoot,
        skillPath: join(testRoot, "SKILL.md"),
        contractDocPath: join(testRoot, "JSON_CONTRACT.md"),
        skillFingerprint: "fp",
        contractFingerprint: "cp",
        sourceCommit: "commit",
        uvExecutable: "uv",
        contractVersion: 1,
        supported: true,
        missingProof: [],
        nextAction: null,
      },
      runner: mockRunner,
      projectRoot: testRoot,
    });

    const manifest: ConnectorManifestV1 = {
      protocolVersion: 1,
      schemaVersion: 1,
      connectorId,
      adapterContractDigest: "contract-digest",
      observedAt: new Date().toISOString(),
      items,
    };

    const performRes = await adapter.perform({
      manifest,
      itemId: "mod-01",
      fileId: "f2", // exact file selector
      expectedDigest: connectorManifestDigest(manifest),
    });

    assert.equal(performRes.status, "completed");
    assert.deepEqual(invokedFiles, ["f2"], "Verified sibling f1 must have 0 external calls!");
  } finally {
    await rm(testRoot, { recursive: true, force: true }).catch(() => undefined);
  }
});
