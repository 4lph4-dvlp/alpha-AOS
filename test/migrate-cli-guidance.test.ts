import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  formatMigrationPreview,
  formatMigrationApplyResult,
  type MigrationPlan,
  type MigrationApplyResult,
} from "../src/core/migrate.js";
import { formatOfflineStatus } from "../src/format.js";
import type { OfflineStatus } from "../src/types.js";

test("Task 2 CLI Guidance: alpha-aos --help contains 2-track update and deploy sections", () => {
  const cliPath = "dist/src/cli.js";
  const helpOutput = execFileSync(process.execPath, [cliPath, "--help"], {
    encoding: "utf8",
  });

  // Section 1: External Tool Updates
  assert.match(helpOutput, /External Tool Updates:/);
  assert.match(helpOutput, /Updates managed external tools: Cua, GSD, ECC, MCP servers\. Does not update alpha-AOS engine/);

  // Section 2: Engine Deployment (alpha-AOS code)
  assert.match(helpOutput, /Engine Deployment \(alpha-AOS code\):/);
  assert.match(helpOutput, /npm run deploy:local/);
  assert.match(helpOutput, /npm install -g alpha-aos@latest/);

  // Documents alpha-aos migrate
  assert.match(helpOutput, /alpha-aos migrate/);

  // Zero occurrences of outdated background / scheduled / nightly update terms
  assert.equal(/scheduled promotion/i.test(helpOutput), false, "help should not mention scheduled promotion");
  assert.equal(/background update/i.test(helpOutput), false, "help should not mention background update");
  assert.equal(/nightly/i.test(helpOutput), false, "help should not mention nightly");
});

test("Task 2 CLI Guidance: formatMigrationPreview renders component-harness matrix table", () => {
  const plan: MigrationPlan = {
    schemaVersion: 1,
    planDigest: "d".repeat(64),
    reviewedPlanToken: "token-mock",
    occurredAt: new Date().toISOString(),
    candidates: [
      {
        toolId: "cua-driver",
        version: "0.38.0",
        sourceId: "driver-release",
        sourceUrl: "https://github.com/trycua/cua",
        artifact: "cua.zip",
        platform: "windows",
        architecture: "x64",
        artifactDigest: "a".repeat(64),
        path: "C:\\mock\\cua",
        pathAlias: "cua-driver",
        status: "ready",
        reason: "legacy-seed-match",
        ownership: "alpha-aos",
      },
    ],
    ambiguousCandidates: [],
    readyCandidates: [],
    modifiedCandidates: [],
    unsupportedCandidates: [],
    retainedLockfiles: ["catalog/stack.lock.json"],
    payload: {
      v: 1,
      mode: "migrate",
      targets: ["codex"],
      selectedTools: ["cua-driver"],
      candidates: [],
    },
    matrix: [
      {
        toolId: "cua-driver",
        harness: "codex",
        status: "retained",
        sharedConfigImpact: "preserved",
        actionRequired: "ready to migrate",
      },
    ],
  };

  const output = formatMigrationPreview(plan);

  assert.match(output, /Component and Harness Status Matrix:/);
  assert.match(output, /Tool\s+Harness\s+Status\s+Shared Config Impact\s+Action Required/);
  assert.match(output, /cua-driver\s+codex\s+RETAINED \[SKIP\]\s+preserved\s+ready to migrate/);
});

test("Task 2 CLI Guidance: formatMigrationApplyResult renders component-harness matrix table", () => {
  const result: MigrationApplyResult = {
    applied: true,
    operationId: "op-migrate-test",
    planDigest: "d".repeat(64),
    migratedTools: [
      {
        toolId: "mcp:context7",
        version: "0.3.0",
        installationId: "context7-0.3.0",
      },
    ],
    backupsCreated: ["C:\\harness\\mcp_config.json.20261109.user-backup"],
    retainedLockfiles: ["catalog/stack.lock.json"],
    message: "Successfully migrated 1 tool(s) to local tool-records.",
    matrix: [
      {
        toolId: "mcp:context7",
        harness: "antigravity",
        status: "updated",
        sharedConfigImpact: "backup created (.user-backup)",
        actionRequired: "none",
      },
    ],
  };

  const output = formatMigrationApplyResult(result);

  assert.match(output, /Component and Harness Status Matrix:/);
  assert.match(output, /Tool\s+Harness\s+Status\s+Shared Config Impact\s+Action Required/);
  assert.match(output, /mcp:context7\s+antigravity\s+UPDATED \[OK\]\s+backup created \(\.user-backup\)\s+none/);
});

test("Task 2 CLI Guidance: formatOfflineStatus with matrix renders component-harness matrix table", () => {
  const status: OfflineStatus = {
    channel: "stable",
    generatedAt: "2026-11-09T12:00:00Z",
    writerStatus: "free",
    needsRepair: false,
    incompleteTransactions: [],
    corruptJournals: [],
    treePoliciesCount: 1,
    managedStatePresent: true,
    matrix: [
      {
        toolId: "gsd",
        harness: "codex",
        status: "retained",
        sharedConfigImpact: "unaffected",
        actionRequired: "none",
      },
      {
        toolId: "cua-driver",
        harness: "claude",
        status: "updated",
        sharedConfigImpact: "preserved",
        actionRequired: "none",
      },
    ],
  };

  const output = formatOfflineStatus(status);

  assert.match(output, /Component and Harness Status Matrix:/);
  assert.match(output, /Tool\s+Harness\s+Status\s+Shared Config Impact\s+Action Required/);
  assert.match(output, /gsd\s+codex\s+RETAINED \[SKIP\]\s+unaffected\s+none/);
  assert.match(output, /cua-driver\s+claude\s+UPDATED \[OK\]\s+preserved\s+none/);
});
