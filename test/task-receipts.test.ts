import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import type { HarnessId } from "../src/types.js";
import {
  computeBinarySha256,
  readHarnessRoleReceipt,
  receiptFilePath,
  validateHarnessRoleReceiptShape,
  writeHarnessRoleReceipt,
  type HarnessRoleReceipt,
} from "../src/adapters/task-receipts.js";
import type { TaskAgentResolver, TaskAgentRunner } from "../src/adapters/task-agent-launch.js";
import type { ProcessResult, ProcessSpec } from "../src/core/process.js";
import { createRedactedExcerpt, createRedactionContext } from "../src/core/redaction.js";

const Ajv2020 = ((Ajv2020Module as unknown as { default?: unknown }).default ?? Ajv2020Module) as
  typeof import("ajv/dist/2020.js").default;

import { packageRoot } from "../src/core/paths.js";

const repositoryRoot = packageRoot();

async function scratch(context: TestContext, name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-task-receipts-${name}-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

function mockSuccessProcessResult(stdoutText: string): ProcessResult {
  const redaction = createRedactionContext();
  return {
    code: "ok",
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputCapped: false,
    durationMs: 10,
    stdout: createRedactedExcerpt(stdoutText, redaction, 4096),
    stderr: createRedactedExcerpt("", redaction, 4096),
  };
}

test("computeBinarySha256 produces deterministic 64-char hex SHA-256 hash", async (context) => {
  const root = await scratch(context, "hash");
  const testFile = join(root, "mock-binary.exe");
  const payload = Buffer.from("mock-binary-content-v1.0.0", "utf8");
  await writeFile(testFile, payload);

  const expectedHash = createHash("sha256").update(payload).digest("hex");
  const actualHash = await computeBinarySha256(testFile);

  assert.equal(actualHash, expectedHash);
  assert.equal(actualHash.length, 64);
  assert.match(actualHash, /^[0-9a-f]{64}$/);
});

test("harness role receipt conforms strictly to schemas/harness-role-receipt.schema.json (ROL-02, D-04)", async (context) => {
  const root = await scratch(context, "schema");
  const schemaPath = join(repositoryRoot, "schemas", "harness-role-receipt.schema.json");
  const schemaText = await readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaText) as Record<string, unknown>;

  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const validate = ajv.compile(schema);

  const harnesses: HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
  const roles = ["controller", "executor", "reviewer"] as const;

  for (const harness of harnesses) {
    for (const role of roles) {
      const receipt: HarnessRoleReceipt = {
        schemaVersion: 1,
        harness,
        role,
        version: "1.2.3",
        binarySha256: "a".repeat(64),
        executable: `/usr/local/bin/${harness}`,
        probedAt: new Date().toISOString(),
        capabilities: {
          invoked: true,
          cancelled: true,
          outputParsed: true,
          readOnlyGuaranteed: role === "reviewer",
        },
        sampleDigest: "b".repeat(64),
      };

      const valid = validate(receipt);
      assert.equal(valid, true, `Receipt for ${harness}-${role} should be valid according to schema: ${JSON.stringify(validate.errors)}`);
      assert.doesNotThrow(() => validateHarnessRoleReceiptShape(receipt));
    }
  }

  // Schema rejects extra properties
  const invalidReceipt = {
    schemaVersion: 1,
    harness: "claude",
    role: "executor",
    version: "1.0.0",
    binarySha256: "c".repeat(64),
    executable: "/bin/claude",
    probedAt: new Date().toISOString(),
    capabilities: { invoked: true, cancelled: true, outputParsed: true },
    sampleDigest: "d".repeat(64),
    unauthorizedProperty: "malicious",
  };
  assert.equal(validate(invalidReceipt), false);
  assert.throws(() => validateHarnessRoleReceiptShape(invalidReceipt));
});

test("atomic write and read of harness role receipt with missing file handling", async (context) => {
  const root = await scratch(context, "store");

  // Missing receipt returns null without throwing
  const missing = await readHarnessRoleReceipt("codex", "controller", root, { checkDrift: false });
  assert.equal(missing.receipt, null);
  assert.equal(missing.versionDrift, false);
  assert.equal(missing.driftReason, null);

  const receipt: HarnessRoleReceipt = {
    schemaVersion: 1,
    harness: "codex",
    role: "controller",
    version: "0.2.0",
    binarySha256: "1234567890abcdef".repeat(4),
    executable: "/opt/codex/bin/codex",
    probedAt: new Date().toISOString(),
    capabilities: {
      invoked: true,
      cancelled: true,
      outputParsed: true,
    },
    sampleDigest: "fedcba0987654321".repeat(4),
  };

  await writeHarnessRoleReceipt(receipt, root);

  const expectedPath = receiptFilePath("codex", "controller", root);
  const rawSaved = await readFile(expectedPath, "utf8");
  assert.equal(JSON.parse(rawSaved).version, "0.2.0");

  const readBack = await readHarnessRoleReceipt("codex", "controller", root, { checkDrift: false });
  assert.deepEqual(readBack.receipt, receipt);
  assert.equal(readBack.versionDrift, false);
  assert.equal(readBack.driftReason, null);
});

test("corrupt receipt file returns versionDrift: true with descriptive reason", async (context) => {
  const root = await scratch(context, "corrupt");
  const path = receiptFilePath("claude", "reviewer", root);
  const dir = dirname(path);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(dir, { recursive: true });
  await writeFile(path, "{ corrupt json ...", "utf8");

  const result = await readHarnessRoleReceipt("claude", "reviewer", root, { checkDrift: false });
  assert.equal(result.receipt, null);
  assert.equal(result.versionDrift, true);
  assert.match(result.driftReason ?? "", /corrupt or invalid/i);
});

test("Version Drift defense: binary hash mismatch demotes role to unverified (ROL-02, D-02)", async (context) => {
  const root = await scratch(context, "drift-hash");
  const mockExePath = join(root, "mock-agent.exe");
  const originalBytes = Buffer.from("version-1-initial-binary-bytes", "utf8");
  await writeFile(mockExePath, originalBytes);

  const originalHash = createHash("sha256").update(originalBytes).digest("hex");

  const receipt: HarnessRoleReceipt = {
    schemaVersion: 1,
    harness: "claude",
    role: "reviewer",
    version: "1.0.0",
    binarySha256: originalHash,
    executable: mockExePath,
    probedAt: new Date().toISOString(),
    capabilities: {
      invoked: true,
      cancelled: true,
      outputParsed: true,
      readOnlyGuaranteed: true,
    },
    sampleDigest: "digest-12345",
  };
  await writeHarnessRoleReceipt(receipt, root);

  const resolver: TaskAgentResolver = (cmd) => (cmd === "claude" ? mockExePath : null);
  const runner: TaskAgentRunner = async () => mockSuccessProcessResult("claude 1.0.0");

  // Before modification: no drift
  const fresh = await readHarnessRoleReceipt("claude", "reviewer", root, {
    checkDrift: true,
    resolve: resolver,
    runner,
  });
  assert.equal(fresh.versionDrift, false);
  assert.equal(fresh.driftReason, null);

  // Modify the host binary (e.g. npm update on host)
  await writeFile(mockExePath, Buffer.from("version-2-updated-binary-bytes", "utf8"));

  // After modification: binary hash drift detected
  const drifted = await readHarnessRoleReceipt("claude", "reviewer", root, {
    checkDrift: true,
    resolve: resolver,
    runner,
  });
  assert.equal(drifted.versionDrift, true);
  assert.match(drifted.driftReason ?? "", /binary hash mismatch/);
  assert.match(drifted.driftReason ?? "", /Re-probe required\. \(D-02\)/);
});

test("Version Drift defense: CLI version mismatch demotes role to unverified (ROL-02, D-02)", async (context) => {
  const root = await scratch(context, "drift-version");
  const mockExePath = join(root, "mock-agent.exe");
  const bytes = Buffer.from("agent-bytes-fixed", "utf8");
  await writeFile(mockExePath, bytes);

  const hash = createHash("sha256").update(bytes).digest("hex");

  const receipt: HarnessRoleReceipt = {
    schemaVersion: 1,
    harness: "pi",
    role: "executor",
    version: "0.84.4",
    binarySha256: hash,
    executable: mockExePath,
    probedAt: new Date().toISOString(),
    capabilities: {
      invoked: true,
      cancelled: true,
      outputParsed: true,
    },
    sampleDigest: "digest-pi-sample",
  };
  await writeHarnessRoleReceipt(receipt, root);

  const resolver: TaskAgentResolver = (cmd) => (cmd === "pi" ? mockExePath : null);
  // Runner reports version 0.85.0 instead of 0.84.4
  const runner: TaskAgentRunner = async () => mockSuccessProcessResult("pi 0.85.0");

  const drifted = await readHarnessRoleReceipt("pi", "executor", root, {
    checkDrift: true,
    resolve: resolver,
    runner,
  });
  assert.equal(drifted.versionDrift, true);
  assert.match(drifted.driftReason ?? "", /CLI version mismatch \(receipt: 0\.84\.4, current: 0\.85\.0\)/);
  assert.match(drifted.driftReason ?? "", /Re-probe required\. \(D-02\)/);
});

test("Version Drift defense: CLI executable no longer resolvable (ROL-02, D-02)", async (context) => {
  const root = await scratch(context, "drift-unresolvable");

  const receipt: HarnessRoleReceipt = {
    schemaVersion: 1,
    harness: "hermes",
    role: "controller",
    version: "1.0.0",
    binarySha256: "0".repeat(64),
    executable: "/missing/hermes",
    probedAt: new Date().toISOString(),
    capabilities: {
      invoked: true,
      cancelled: true,
      outputParsed: true,
    },
    sampleDigest: "digest-hermes",
  };
  await writeHarnessRoleReceipt(receipt, root);

  const resolver: TaskAgentResolver = () => null; // Not found on PATH

  const drifted = await readHarnessRoleReceipt("hermes", "controller", root, {
    checkDrift: true,
    resolve: resolver,
  });
  assert.equal(drifted.versionDrift, true);
  assert.match(drifted.driftReason ?? "", /CLI executable no longer resolvable/);
});
