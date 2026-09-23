import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { executeGateCheck, selectGateEngine } from "../src/core/gate.js";
import {
  computeRiskSurfaceDigest,
  createGateReceipt,
  readGateReceiptStrict,
  writeGateReceipt,
} from "../src/core/gate-receipt.js";
import type { GateReceipt } from "../src/types.js";

async function scratchRoot(context: TestContext, label: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `alpha-aos-${label}-`));
  context.after(async () => {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return root;
}

function redirectStateRoot(context: TestContext, stateRoot: string): void {
  // writeGateReceipt journals into userStateRoot(), which reads this name, so
  // the journal and snapshot land in the test's scratch root, never the host's.
  const previousStateDir = process.env.ALPHA_AOS_STATE_DIR;
  process.env.ALPHA_AOS_STATE_DIR = stateRoot;
  context.after(() => {
    if (previousStateDir === undefined) delete process.env.ALPHA_AOS_STATE_DIR;
    else process.env.ALPHA_AOS_STATE_DIR = previousStateDir;
  });
}

test("selectGateEngine follows Native-First precedence and visibly suppresses ECC skills (D-04, D-05)", async (context) => {
  const root = await scratchRoot(context, "gate-native-first");

  // Project with a native "audit" script
  const scripts = {
    audit: "npm audit --audit-level=high",
    build: "tsc",
  };

  const selection = selectGateEngine("security-review", root, scripts);

  assert.equal(selection.obligation, "security-review");
  assert.equal(selection.selectedEngine.kind, "native");
  assert.equal(selection.selectedEngine.id, "npm-run-audit");
  assert.equal(selection.selectedEngine.command, "npm run audit");

  // Visible suppression of overlapping ECC skill
  assert.equal(selection.suppressedEngines.length, 1);
  assert.equal(selection.suppressedEngines[0]?.engine, "ecc-universal:security-review");
  assert.equal(
    selection.suppressedEngines[0]?.reason,
    "native script found in package.json: npm run audit"
  );
});

test("selectGateEngine falls back to ECC skill when no native script exists", async (context) => {
  const root = await scratchRoot(context, "gate-ecc-fallback");

  // Project with only unrelated scripts
  const scripts = {
    build: "tsc",
    test: "node --test",
  };

  const selection = selectGateEngine("security-review", root, scripts);

  assert.equal(selection.obligation, "security-review");
  assert.equal(selection.selectedEngine.kind, "ecc");
  assert.equal(selection.selectedEngine.id, "ecc-universal:security-review");
  assert.equal(selection.selectedEngine.skill, "security-review");
  assert.deepEqual(selection.suppressedEngines, []);
});

test("selectGateEngine detects native ORM configuration for database migrations", async (context) => {
  const root = await scratchRoot(context, "gate-orm-detection");

  // Create prisma directory and schema.prisma
  await mkdir(join(root, "prisma"), { recursive: true });
  await writeFile(join(root, "prisma", "schema.prisma"), "datasource db { provider = \"sqlite\" }\n", "utf8");

  const selection = selectGateEngine("database-migration", root, {});

  assert.equal(selection.obligation, "database-migration");
  assert.equal(selection.selectedEngine.kind, "native");
  assert.equal(selection.selectedEngine.id, "native-prisma");
  assert.equal(selection.selectedEngine.command, "npx prisma migrate status");
  assert.equal(selection.suppressedEngines.length, 1);
  assert.equal(selection.suppressedEngines[0]?.engine, "ecc-universal:migration-check");
});

test("executeGateCheck returns exitCode 0 and bounded output for successful command", async (context) => {
  const root = await scratchRoot(context, "gate-exec-pass");

  const selection = {
    obligation: "release-check" as const,
    selectedEngine: {
      id: "node-version",
      kind: "native" as const,
      command: "node -e process.exit(0)",
    },
    suppressedEngines: [],
  };

  const result = await executeGateCheck(selection, root, { timeoutMs: 5000 });

  assert.equal(result.exitCode, 0);
  assert.equal(result.timedOut, false);
});

test("executeGateCheck captures non-zero exit code without crashing (SAFE-05)", async (context) => {
  const root = await scratchRoot(context, "gate-exec-fail");

  const selection = {
    obligation: "security-review" as const,
    selectedEngine: {
      id: "failing-check",
      kind: "native" as const,
      command: "node -e console.error('Vulnerabilities_found');process.exit(2)",
    },
    suppressedEngines: [],
  };

  const result = await executeGateCheck(selection, root, { timeoutMs: 5000 });

  assert.equal(result.exitCode, 2);
  assert.equal(result.timedOut, false);
  assert.equal(result.stderr.includes("Vulnerabilities_found"), true);
});

test("computeRiskSurfaceDigest generates a deterministic 64-hex digest", async (context) => {
  const root = await scratchRoot(context, "gate-digest");

  await mkdir(join(root, "src", "auth"), { recursive: true });
  await writeFile(join(root, "src", "auth", "token.ts"), "const secret = 1;\n", "utf8");
  await writeFile(join(root, "package.json"), "{\"name\":\"app\"}\n", "utf8");

  const digest1 = await computeRiskSurfaceDigest(root, [
    "package.json",
    "src/auth/token.ts",
  ]);

  // Order of input should not alter digest (sorted internally)
  const digest2 = await computeRiskSurfaceDigest(root, [
    "src/auth/token.ts",
    "package.json",
  ]);

  assert.equal(digest1, digest2);
  assert.equal(/^[0-9a-f]{64}$/.test(digest1), true);

  // Digest changes when file content changes
  await writeFile(join(root, "src", "auth", "token.ts"), "const secret = 2;\n", "utf8");
  const digest3 = await computeRiskSurfaceDigest(root, [
    "package.json",
    "src/auth/token.ts",
  ]);
  assert.notEqual(digest1, digest3);

  // Missing files are recorded deterministically without throwing
  const digestWithMissing = await computeRiskSurfaceDigest(root, [
    "nonexistent.ts",
    "package.json",
  ]);
  assert.equal(/^[0-9a-f]{64}$/.test(digestWithMissing), true);
});

test("writeGateReceipt writes an atomic receipt that readGateReceiptStrict validates (D-06, SAFE-03)", async (context) => {
  const root = await scratchRoot(context, "gate-receipt-io");
  const stateRoot = join(root, "state");

  const receipt: GateReceipt = {
    schemaVersion: 1,
    obligation: "security-review",
    status: "passed",
    engine: {
      id: "npm-run-audit",
      kind: "native",
      command: "npm run audit",
    },
    targetCommitSha: "a".repeat(40),
    workingTreeDigest: "b".repeat(64),
    exitCode: 0,
    executedAt: new Date().toISOString(),
    suppressedEngines: [
      {
        engine: "ecc-universal:security-review",
        reason: "native script found in package.json",
      },
    ],
    evidenceHash: "c".repeat(64),
  };

  redirectStateRoot(context, stateRoot);
  const written = await writeGateReceipt(root, receipt);
  assert.equal(written.receiptPath.endsWith("security-review.json"), true);
  assert.notEqual(written.transactionId, undefined);
  assert.equal(
    existsSync(join(stateRoot, "journal", `${written.transactionId}.json`)),
    true,
    "the gate receipt journal must land in the test-owned state root, not the host state root",
  );

  const read = await readGateReceiptStrict(root, "security-review");
  assert.notEqual(read, null);
  assert.equal(read?.obligation, "security-review");
  assert.equal(read?.status, "passed");
  assert.equal(read?.targetCommitSha, "a".repeat(40));
  assert.equal(read?.workingTreeDigest, "b".repeat(64));
  assert.equal(read?.suppressedEngines.length, 1);
});

test("readGateReceiptStrict rejects invalid or tampered receipt documents", async (context) => {
  const root = await scratchRoot(context, "gate-receipt-tamper");

  const receiptDir = join(root, ".alpha-aos", "receipts", "gates");
  await mkdir(receiptDir, { recursive: true });

  // Tampered receipt with invalid status and missing required fields
  const tampered = {
    schemaVersion: 1,
    obligation: "security-review",
    status: "unknown_status",
  };
  await writeFile(join(receiptDir, "security-review.json"), JSON.stringify(tampered), "utf8");

  await assert.rejects(
    async () => {
      await readGateReceiptStrict(root, "security-review");
    },
    (err: Error) => {
      return err.message.includes("is invalid or tampered");
    }
  );
});

test("createGateReceipt creates a status: failed receipt when exit code is non-zero", () => {
  const selection = {
    obligation: "database-migration" as const,
    selectedEngine: {
      id: "native-prisma",
      kind: "native" as const,
      command: "npx prisma migrate status",
    },
    suppressedEngines: [],
  };

  const receipt = createGateReceipt({
    obligation: "database-migration",
    engineSelection: selection,
    executionResult: {
      exitCode: 1,
      stdout: "",
      stderr: "Migration drift detected",
    },
    targetCommitSha: "d".repeat(40),
    workingTreeDigest: "e".repeat(64),
    evidenceHash: "f".repeat(64),
  });

  assert.equal(receipt.status, "failed");
  assert.equal(receipt.exitCode, 1);
  assert.equal(receipt.diagnostics?.includes("Migration drift detected"), true);
});
