import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CapabilityLedger, CapabilityProof } from "../src/core/capability-ledger.js";
import {
  BASE_RELEASE_SUPPORT_MATRIX,
  BASE_SUPPORT_MATRIX,
  compareMatrixCells,
  evaluateMatrixCell,
  evaluateReleaseMatrixCell,
  evaluateReleaseSupportMatrix,
  evaluateSupportMatrix,
  renderSupportMatrixMarkdown,
  type SupportMatrixEntry,
} from "../src/core/support-matrix.js";
import type { HarnessRoleReceipt } from "../src/adapters/task-receipts.js";
import type { Inventory } from "../src/types.js";

const observedAt = "2026-09-18T00:00:00.000Z";

function inventory(detected: readonly string[]): Inventory {
  return {
    schemaVersion: 1,
    generatedAt: observedAt,
    platform: "linux",
    architecture: "x64",
    tools: {},
    harnesses: ["claude", "codex", "antigravity", "pi", "hermes"].map((id) => ({
      id: id as Inventory["harnesses"][number]["id"],
      displayName: id,
      command: detected.includes(id) ? id : null,
      version: detected.includes(id) ? "1.0.0" : null,
      configRoots: [],
      detected: detected.includes(id),
      notes: [],
    })),
  };
}

function proof(harness: string, capability: string): CapabilityProof {
  return {
    projectId: null,
    harness: harness as CapabilityProof["harness"],
    capability,
    polarity: "positive",
    nativeUse: "invoked",
    blockedReason: null,
    boundInputs: {
      skillSourceHash: "a".repeat(64),
      mcpServerVersion: "1.0.0",
      evidenceHash: null,
    },
    harnessVersion: { exact: "1.0.0", minorKey: "1.0", raw: "1.0.0" },
    ancestorFreedom: null,
    invocationEvidence: {
      canary: "release-proof",
      observations: [{
        server: "context7",
        tool: "query-docs",
        at: observedAt,
        upstreamVersion: "1.0.0",
        outcome: "ok",
      }],
      verdict: {
        matched: ["query-docs"],
        missing: [],
        forbiddenSeen: [],
        ordered: null,
        distinctServers: 1,
        maxDistinctServers: 1,
        withinServerBudget: true,
        satisfiedArgumentPatterns: [],
        unsatisfiedArgumentPatterns: [],
        uncheckedArgumentPatterns: [],
        observationCount: 1,
        expectationsHeld: true,
        held: true,
        nativeUse: "invoked",
        reasons: [],
      },
    },
    observedAt,
    oracle: {
      command: "fixture-canary",
      exitCode: 0,
      stdoutFingerprint: "sha256:" + "b".repeat(64),
      stderrFingerprint: "sha256:" + "c".repeat(64),
    },
  };
}

function ledger(proofs: readonly CapabilityProof[] = []): CapabilityLedger {
  return {
    schemaVersion: 1,
    producer: { name: "alpha-aos", version: "0.1.0" },
    updatedAt: observedAt,
    proofs,
  };
}

test("support taxonomy refuses false PROVEN states", () => {
  const codexContext7 = BASE_SUPPORT_MATRIX.find(
    (entry) => entry.harnessId === "codex" && entry.surface === "Context7",
  );
  const claudeContext7 = BASE_SUPPORT_MATRIX.find(
    (entry) => entry.harnessId === "claude" && entry.surface === "Context7",
  );
  const unsupported = BASE_SUPPORT_MATRIX.find((entry) => entry.baselineTier === "UNSUPPORTED");
  assert.ok(codexContext7);
  assert.ok(claudeContext7);
  assert.ok(unsupported);

  assert.equal(evaluateMatrixCell(codexContext7, inventory([]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(codexContext7, inventory(["codex"]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(claudeContext7, inventory([]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(claudeContext7, inventory(["claude"]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(unsupported, inventory([unsupported.harnessId]), ledger()).tier, "UNSUPPORTED");
});

test("only an inspectable matching invocation receipt promotes an active cell to PROVEN", () => {
  const entry: SupportMatrixEntry = {
    harnessId: "codex",
    surface: "Context7",
    platform: "all",
    baselineTier: "PROVEN",
    notes: "Version-sensitive documentation lookup",
    receiptCapability: "CAPA-01",
  };
  const unverified = evaluateMatrixCell(entry, inventory(["codex"]), ledger());
  const proven = evaluateMatrixCell(entry, inventory(["codex"]), ledger([proof("codex", "CAPA-01")]));
  assert.equal(unverified.tier, "UNVERIFIED");
  assert.match(unverified.evidenceSummary, /canary/i);
  assert.equal(proven.tier, "PROVEN");
  assert.equal(proven.receipt?.observedAt, observedAt);
  assert.match(proven.receipt?.reference ?? "", /ledger\.json/u);
});

test("inspectable matching invocation receipt promotes Antigravity active cell to PROVEN", () => {
  const entry: SupportMatrixEntry = {
    harnessId: "antigravity",
    surface: "GSD Core",
    platform: "all",
    baselineTier: "PROVEN",
    notes: "CLI and IDE lifecycle integration",
    receiptCapability: "GSD_CORE",
  };
  const unverified = evaluateMatrixCell(entry, inventory(["antigravity"]), ledger());
  const proven = evaluateMatrixCell(entry, inventory(["antigravity"]), ledger([proof("antigravity", "GSD_CORE")]));
  assert.equal(unverified.tier, "UNVERIFIED");
  assert.match(unverified.evidenceSummary, /canary/i);
  assert.equal(proven.tier, "PROVEN");
  assert.equal(proven.receipt?.observedAt, observedAt);
  assert.match(proven.receipt?.reference ?? "", /ledger\.json/u);
});

test("inspectable matching invocation receipt promotes Claude active cell to PROVEN", () => {
  const entry: SupportMatrixEntry = {
    harnessId: "claude",
    surface: "Context7",
    platform: "all",
    baselineTier: "PROVEN",
    notes: "Version-sensitive documentation lookup",
    receiptCapability: "CAPA-01",
  };
  const unverified = evaluateMatrixCell(entry, inventory(["claude"]), ledger());
  const proven = evaluateMatrixCell(entry, inventory(["claude"]), ledger([proof("claude", "CAPA-01")]));
  assert.equal(unverified.tier, "UNVERIFIED");
  assert.match(unverified.evidenceSummary, /canary/i);
  assert.equal(proven.tier, "PROVEN");
  assert.equal(proven.receipt?.observedAt, observedAt);
  assert.match(proven.receipt?.reference ?? "", /ledger\.json/u);
});

test("support matrix markdown stays byte-identical to the structured source", async () => {
  const report = evaluateSupportMatrix(inventory([]), ledger(), { generatedAt: observedAt, platform: "linux" });
  const committed = await readFile(join(process.cwd(), "docs", "SUPPORT_MATRIX.md"), "utf8");
  assert.equal(committed, renderSupportMatrixMarkdown(report));
});

function mockRoleReceipt(harness: string, role: "controller" | "executor" | "reviewer", version = "1.0.0"): HarnessRoleReceipt {
  return {
    schemaVersion: 1,
    harness: harness as any,
    role,
    version,
    binarySha256: "d".repeat(64),
    executable: `/usr/bin/${harness}`,
    probedAt: observedAt,
    capabilities: {
      invoked: true,
      cancelled: false,
      outputParsed: true,
      readOnlyGuaranteed: true,
    },
    sampleDigest: "e".repeat(64),
  };
}

test("compiled doctor exposes table and structured matrix diagnostics", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "alpha-aos-support-matrix-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const cli = join(process.cwd(), "dist", "src", "cli.js");
  const env = { ...process.env, ALPHA_AOS_STATE_DIR: join(root, "state"), NO_COLOR: "1" };

  const tableResult = spawnSync(process.execPath, [cli, "doctor", "--matrix"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(tableResult.status, 0, `${tableResult.stdout}\n${tableResult.stderr}`);
  assert.match(tableResult.stdout, /HARNESS\s+VERSION\s+OS\s+ROLE\s+CAPABILITY\s+STATUS\s+REASON \/ EVIDENCE\s+NEXT ACTION/u);
  assert.match(tableResult.stdout, /Summary:\s+\d+\s+PROVEN,\s+\d+\s+UNVERIFIED,\s+\d+\s+UNSUPPORTED/u);
  assert.match(tableResult.stdout, /claude\s+.*all\s+controller\s+controller\s+UNVERIFIED/u);
  assert.doesNotMatch(tableResult.stdout, /RESIDUE/u);
  assert.doesNotMatch(tableResult.stdout, /\u001b\[/u);

  const jsonResult = spawnSync(process.execPath, [cli, "doctor", "--matrix", "--json"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
  });
  assert.equal(jsonResult.status, 0, `${jsonResult.stdout}\n${jsonResult.stderr}`);
  const report = JSON.parse(jsonResult.stdout) as {
    readonly schemaVersion?: number;
    readonly release?: string;
    readonly summary?: { readonly provenCount?: number; readonly unverifiedCount?: number };
    readonly cells?: readonly { readonly tier?: string; readonly harness?: string; readonly harnessVersion?: string | null; readonly reason?: string | null; readonly nextAction?: string | null }[];
  };
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.release, "0.2.0");
  assert.ok((report.cells?.length ?? 0) > 0);
  assert.equal(report.cells?.some((cell) => cell.tier === "RESIDUE"), false);
  assert.equal(report.cells?.some((cell) => cell.harness === "claude"), true);
  assert.ok(typeof report.summary?.provenCount === "number");
  assert.ok(typeof report.summary?.unverifiedCount === "number");
});

test("evaluateReleaseSupportMatrix enforces D-01 through D-04 and VER-02 edge probes", async () => {
  const inv = inventory(["claude", "codex", "antigravity", "pi", "hermes"]);

  // 1. Empty receipts -> all advertised cells UNVERIFIED, hermes controller UNSUPPORTED
  const emptyReport = await evaluateReleaseSupportMatrix(inv, {
    roleReceipts: [],
    generatedAt: observedAt,
  });
  assert.equal(emptyReport.summary.provenCount, 0);
  assert.equal(emptyReport.summary.unsupportedCount, 1); // hermes controller
  assert.ok(emptyReport.summary.unverifiedCount > 0);
  const unverifiedCell = emptyReport.cells.find((c) => c.harness === "claude" && c.role === "controller");
  assert.ok(unverifiedCell);
  assert.equal(unverifiedCell.status, "UNVERIFIED");
  assert.ok(unverifiedCell.reason);
  assert.ok(unverifiedCell.nextAction);

  // 2. Exact matching role receipt promotes matching cell to PROVEN
  const claudeCtrl = mockRoleReceipt("claude", "controller", "1.0.0");
  const singleReport = await evaluateReleaseSupportMatrix(inv, {
    roleReceipts: [claudeCtrl],
    generatedAt: observedAt,
  });
  assert.equal(singleReport.summary.provenCount, 1);
  const provenCell = singleReport.cells.find((c) => c.harness === "claude" && c.role === "controller");
  assert.ok(provenCell);
  assert.equal(provenCell.status, "PROVEN");
  assert.equal(provenCell.harnessVersion, "1.0.0");
  assert.equal(provenCell.reason, null);
  assert.equal(provenCell.nextAction, null);
  assert.ok(provenCell.receipt);
  assert.equal(provenCell.receipt.reference, "receipts/claude-controller.receipt.json");

  // 3. Adjacency: claude controller receipt does NOT promote claude executor or codex controller
  const claudeExec = singleReport.cells.find((c) => c.harness === "claude" && c.role === "executor");
  const codexCtrl = singleReport.cells.find((c) => c.harness === "codex" && c.role === "controller");
  assert.equal(claudeExec?.status, "UNVERIFIED");
  assert.equal(codexCtrl?.status, "UNVERIFIED");

  // 4. Version drift: receipt version differs from detected harness version
  const driftedReceipt = mockRoleReceipt("codex", "controller", "0.9.0");
  const driftReport = await evaluateReleaseSupportMatrix(inv, {
    roleReceipts: [driftedReceipt],
    generatedAt: observedAt,
  });
  const driftedCell = driftReport.cells.find((c) => c.harness === "codex" && c.role === "controller");
  assert.equal(driftedCell?.status, "UNVERIFIED");
  assert.match(driftedCell?.reason ?? "", /drift/i);
  assert.ok(driftedCell?.nextAction);

  // 5. Ordering: reversed/permuted input entries produces deterministic sorted output
  const reversedEntries = [...BASE_RELEASE_SUPPORT_MATRIX].reverse();
  const sortedReport1 = await evaluateReleaseSupportMatrix(inv, {
    entries: BASE_RELEASE_SUPPORT_MATRIX,
    roleReceipts: [claudeCtrl],
    generatedAt: observedAt,
  });
  const sortedReport2 = await evaluateReleaseSupportMatrix(inv, {
    entries: reversedEntries,
    roleReceipts: [claudeCtrl],
    generatedAt: observedAt,
  });
  assert.deepEqual(
    sortedReport1.cells.map((c) => `${c.harness}:${c.role}:${c.capability}`),
    sortedReport2.cells.map((c) => `${c.harness}:${c.role}:${c.capability}`),
  );
});
