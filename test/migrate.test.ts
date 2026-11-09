import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSafeUserBackup,
  planMigrationOperation,
  applyMigrationOperation,
  formatMigrationPreview,
  formatMigrationApplyResult,
  updateMarkerBoundary,
  type MigrationCandidate,
} from "../src/core/migrate.js";
import { resolveAcceptedToolRecord } from "../src/core/tool-bindings.js";
import { readToolRecordStore } from "../src/core/tool-records.js";

test("Task 1: createSafeUserBackup creates an exact copy at <filepath>.<timestamp>.user-backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-backup-test-"));
  try {
    const originalFile = join(root, "config.toml");
    const originalContent = '[mcp_servers.custom]\ncommand = "my-custom-tool"\n';
    await writeFile(originalFile, originalContent, "utf8");

    const backupPath = await createSafeUserBackup(originalFile);

    assert.match(backupPath, /\.user-backup$/);
    assert.notEqual(backupPath, originalFile);

    const backupContent = await readFile(backupPath, "utf8");
    assert.equal(backupContent, originalContent);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 1: resolveAcceptedToolRecord fails closed with helpful guidance when tool record is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-ssot-fail-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(packageRoot, { recursive: true });

    await assert.rejects(
      async () => {
        await resolveAcceptedToolRecord("gsd", { stateRoot, packageRoot });
      },
      (err: Error) => {
        assert.match(err.message, /No accepted tool records? found for '?gsd'?/);
        assert.match(err.message, /alpha-aos install/);
        assert.match(err.message, /alpha-aos migrate/);
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Task 1: End-to-end legacy tool migration pipeline: plan -> apply -> .user-backup -> atomic store commit -> resolveAcceptedToolRecord", async () => {
  const root = await mkdtemp(join(tmpdir(), "aos-migrate-e2e-"));
  try {
    const stateRoot = join(root, "state");
    const packageRoot = join(root, "package");
    const catalogDir = join(packageRoot, "catalog");
    await mkdir(stateRoot, { recursive: true });
    await mkdir(catalogDir, { recursive: true });

    // 1. Create simulated legacy lockfiles in catalog
    const stackLock = {
      schemaVersion: 1,
      channel: "stable",
      components: {
        gsd: {
          package: "@opengsd/gsd-core",
          version: "1.18.0",
          integrity: "sha512-test-integrity",
        },
        ecc: {
          package: "ecc-universal",
          version: "2.2.3",
          integrity: "sha512-test-integrity",
        },
        mcp: {
          context7: {
            package: "@upstash/context7-mcp",
            version: "4.4.4",
            integrity: "sha512-test-integrity",
          },
        },
      },
    };
    await writeFile(join(catalogDir, "stack.lock.json"), JSON.stringify(stackLock, null, 2), "utf8");

    const cuaLock = {
      name: "cua-driver",
      version: "0.38.0",
      assets: [
        {
          os: "windows",
          arch: "x64",
          name: "cua-driver-rs-0.38.0-windows-x86_64-binary.zip",
          sha256: "5edaa74d0afa1b55a9668dbc4f32736507bd2bd4d75b18ca1dc8881bb12402b5",
        },
      ],
    };
    await writeFile(join(catalogDir, "computer-use-runtime.json"), JSON.stringify(cuaLock, null, 2), "utf8");

    // 2. Create simulated modified config file
    const configFile = join(root, "modified-config.json");
    await writeFile(configFile, JSON.stringify({ customKey: "userValue" }, null, 2), "utf8");

    // 3. Plan migration operation
    const plan = await planMigrationOperation({
      stateRoot,
      packageRoot,
      tools: ["gsd", "cua-driver"],
      simulatedConfigs: [{ path: configFile, content: '{"customKey":"userValue"}', modified: true }],
    });

    assert.equal(plan.schemaVersion, 1);
    assert.ok(plan.planDigest && /^[a-f0-9]{64}$/.test(plan.planDigest));
    assert.ok(plan.reviewedPlanToken && plan.reviewedPlanToken.length > 0);
    assert.equal(plan.candidates.length, 2);
    assert.deepEqual(plan.retainedLockfiles, ["catalog/stack.lock.json", "catalog/computer-use-runtime.json"]);

    const previewOutput = formatMigrationPreview(plan);
    assert.match(previewOutput, /alpha-aos migration preview/);
    assert.match(previewOutput, /gsd@1\.18\.0/);
    assert.match(previewOutput, /cua-driver@0\.38\.0/);
    assert.match(previewOutput, /catalog\/stack\.lock\.json/);

    // 4. Assert apply rejects mismatched digest
    await assert.rejects(
      async () => {
        await applyMigrationOperation({
          stateRoot,
          packageRoot,
          planDigest: "0".repeat(64),
          reviewedPlanToken: plan.reviewedPlanToken,
        });
      },
      /Migration plan digest mismatch/,
    );

    // 5. Apply migration operation with valid digest
    const applyResult = await applyMigrationOperation({
      stateRoot,
      packageRoot,
      planDigest: plan.planDigest,
      reviewedPlanToken: plan.reviewedPlanToken,
      simulatedConfigs: [{ path: configFile, content: '{"customKey":"userValue"}', modified: true }],
    });

    assert.equal(applyResult.applied, true);
    assert.ok(applyResult.operationId.startsWith("migrate-"));
    assert.equal(applyResult.migratedTools.length, 2);
    assert.ok(applyResult.backupsCreated.length > 0);
    assert.match(applyResult.backupsCreated[0]!, /\.user-backup$/);

    const applyOutput = formatMigrationApplyResult(applyResult);
    assert.match(applyOutput, /alpha-aos migration applied/);
    assert.match(applyOutput, /Operation ID: migrate-/);
    assert.match(applyOutput, /gsd@1\.18\.0/);

    // 6. Verify tool-record-store state
    const store = await readToolRecordStore({ stateRoot, packageRoot });
    assert.equal(store.status, "current");
    assert.equal(store.incomplete, false);

    // Verify atomic operations log contains migrate operation
    assert.ok(store.operations.some((op) => op.operationId === applyResult.operationId));

    // Verify acceptedTransitions are recorded
    assert.ok(store.accepted);
    assert.ok(Object.keys(store.accepted!).some((k) => k.startsWith("gsd/")));
    assert.ok(Object.keys(store.accepted!).some((k) => k.startsWith("cua-driver/")));

    // 7. Verify resolveAcceptedToolRecord retrieves adopted tool records
    const gsdRecord = await resolveAcceptedToolRecord("gsd", { stateRoot, packageRoot });
    assert.equal(gsdRecord.toolId, "gsd");
    assert.equal(gsdRecord.version, "1.18.0");
    assert.equal(gsdRecord.legacy?.sourceId, "npm-registry");

    const cuaRecord = await resolveAcceptedToolRecord("cua-driver", { stateRoot, packageRoot });
    assert.equal(cuaRecord.toolId, "cua-driver");
    assert.equal(cuaRecord.version, "0.38.0");
    assert.equal(cuaRecord.legacy?.sourceId, "driver-release");

    // 8. Verify legacy lockfiles are preserved (not deleted)
    const preservedStack = await readFile(join(catalogDir, "stack.lock.json"), "utf8");
    assert.ok(preservedStack.includes("1.18.0"));
    const preservedCua = await readFile(join(catalogDir, "computer-use-runtime.json"), "utf8");
    assert.ok(preservedCua.includes("0.38.0"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
