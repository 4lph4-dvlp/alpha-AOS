import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { CapabilityLedger, CapabilityProof } from "../src/core/capability-ledger.js";
import {
  BASE_SUPPORT_MATRIX,
  evaluateMatrixCell,
  evaluateSupportMatrix,
  renderSupportMatrixMarkdown,
  type SupportMatrixEntry,
} from "../src/core/support-matrix.js";
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

function proof(harness: CapabilityProof["harness"], capability: string): CapabilityProof {
  return {
    projectId: null,
    harness,
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
  const claude = BASE_SUPPORT_MATRIX.find((entry) => entry.harnessId === "claude");
  const unsupported = BASE_SUPPORT_MATRIX.find((entry) => entry.baselineTier === "UNSUPPORTED");
  assert.ok(codexContext7);
  assert.ok(claude);
  assert.ok(unsupported);

  assert.equal(evaluateMatrixCell(codexContext7, inventory([]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(codexContext7, inventory(["codex"]), ledger()).tier, "UNVERIFIED");
  assert.equal(evaluateMatrixCell(claude, inventory(["claude"]), ledger([proof("claude", "CAPA-01")])).tier, "RESIDUE");
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

test("support matrix markdown stays byte-identical to the structured source", async () => {
  const report = evaluateSupportMatrix(inventory([]), ledger(), { generatedAt: observedAt, platform: "linux" });
  const committed = await readFile(join(process.cwd(), "docs", "SUPPORT_MATRIX.md"), "utf8");
  assert.equal(committed, renderSupportMatrixMarkdown(report));
});
