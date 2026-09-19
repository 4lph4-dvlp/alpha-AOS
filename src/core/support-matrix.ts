import type { CapabilityLedger, CapabilityProof } from "./capability-ledger.js";
import type { HarnessId, Inventory } from "../types.js";

export type SupportTier = "PROVEN" | "RESIDUE" | "UNVERIFIED" | "UNSUPPORTED";

export interface SupportMatrixEntry {
  readonly harnessId: HarnessId;
  readonly surface: string;
  readonly platform: "win32" | "darwin" | "linux" | "all";
  /** The highest release tier this cell may reach; live evaluation can only downgrade it. */
  readonly baselineTier: SupportTier;
  readonly notes: string;
  /** Exact capability id a real-host invocation proof must bind to before this cell is PROVEN. */
  readonly receiptCapability?: string;
}

export interface SupportReceiptReference {
  readonly reference: string;
  readonly capability: string;
  readonly observedAt: string;
  readonly harnessVersion: string | null;
  readonly oracleCommand: string;
}

export interface EvaluatedMatrixCell {
  readonly entry: SupportMatrixEntry;
  readonly tier: SupportTier;
  readonly evidenceSummary: string;
  readonly receipt: SupportReceiptReference | null;
}

export interface SupportMatrixReport {
  readonly schemaVersion: 1;
  readonly release: "0.1.0";
  readonly generatedAt: string;
  readonly platform: NodeJS.Platform;
  readonly evidenceSource: "capabilities/ledger.json";
  readonly cells: readonly EvaluatedMatrixCell[];
}

export interface SupportMatrixEvaluationOptions {
  readonly generatedAt?: string;
  readonly platform?: NodeJS.Platform;
  readonly ledgerUnavailableReason?: string;
}

export const SUPPORT_MATRIX_RELEASE = "0.1.0";
export const SUPPORT_MATRIX_EFFECTIVE_AT = "2026-09-18T00:00:00.000Z";

const activeSurfaces = Object.freeze({
  codex: [
    ["GSD Core", "GSD_CORE", "Lifecycle controller and state writer"],
    ["Context7", "CAPA-01", "Version-sensitive documentation lookup"],
    ["Unified Memory", "CAPA-03", "Cross-harness handoff sender and receiver"],
    ["Project Packs", "CAPA-05", "Evidence-selected project capability materialization"],
  ],
  antigravity: [
    ["GSD Core", "GSD_CORE", "CLI and IDE lifecycle integration"],
    ["Unified Memory", "CAPA-03", "Cross-harness handoff sender and receiver"],
  ],
  pi: [
    ["GSD Core", "GSD_CORE", "GSD workflow through the Pi adapter"],
    ["Context7", "CAPA-01", "Version-sensitive documentation lookup through the MCP bridge"],
  ],
  hermes: [
    ["Worker Authority", "WORKER_AUTHORITY", "Workspace worker with planning-state writes prohibited"],
    ["Unified Memory", "CAPA-03", "Cross-harness context handoff"],
  ],
} as const satisfies Readonly<Record<Exclude<HarnessId, "claude">, readonly (readonly [string, string, string])[]>>);

const activeEntries = (Object.entries(activeSurfaces) as Array<[
  Exclude<HarnessId, "claude">,
  readonly (readonly [string, string, string])[],
]>).flatMap(([harnessId, surfaces]) => surfaces.map(([surface, receiptCapability, notes]) => ({
  harnessId,
  surface,
  platform: "all" as const,
  baselineTier: "PROVEN" as const,
  notes,
  receiptCapability,
})));

/**
 * Official v0.1.0 claim ledger. `baselineTier: PROVEN` is eligibility, not evidence:
 * `evaluateMatrixCell` always downgrades it until a matching invocation receipt exists.
 */
export const BASE_SUPPORT_MATRIX: readonly SupportMatrixEntry[] = Object.freeze([
  ...activeEntries,
  {
    harnessId: "antigravity",
    surface: "GUI Desktop Preload",
    platform: "all",
    baselineTier: "UNSUPPORTED",
    notes: "The desktop GUI has no supported preload interception surface",
  },
  {
    harnessId: "hermes",
    surface: "GSD State Controller",
    platform: "all",
    baselineTier: "UNSUPPORTED",
    notes: "Hermes is a worker and must not become the GSD lifecycle/state writer",
  },
  {
    harnessId: "claude",
    surface: "All managed surfaces",
    platform: "all",
    baselineTier: "RESIDUE",
    notes: "Compatibility residue outside the active v0.1.0 release bar",
  },
]);

function receiptIsInspectable(proof: CapabilityProof): boolean {
  const evidence = proof.invocationEvidence;
  return proof.polarity === "positive"
    && proof.nativeUse === "invoked"
    && proof.blockedReason === null
    && proof.oracle.exitCode === 0
    && evidence !== undefined
    && evidence.verdict.held
    && evidence.verdict.nativeUse === "invoked"
    && evidence.verdict.observationCount > 0
    && evidence.observations.length > 0
    && Number.isFinite(Date.parse(proof.observedAt));
}

function matchingReceipt(
  entry: SupportMatrixEntry,
  ledger: CapabilityLedger,
): { readonly proof: CapabilityProof; readonly index: number } | null {
  if (entry.receiptCapability === undefined || entry.harnessId === "antigravity") return null;
  const index = ledger.proofs.findIndex((proof) =>
    proof.harness === entry.harnessId
    && proof.capability === entry.receiptCapability
    && receiptIsInspectable(proof),
  );
  return index < 0 ? null : { proof: ledger.proofs[index]!, index };
}

export function evaluateMatrixCell(
  entry: SupportMatrixEntry,
  inventory: Inventory,
  ledger: CapabilityLedger,
  options: Pick<SupportMatrixEvaluationOptions, "ledgerUnavailableReason"> = {},
): EvaluatedMatrixCell {
  if (entry.harnessId === "claude") {
    return { entry, tier: "RESIDUE", evidenceSummary: entry.notes, receipt: null };
  }
  if (entry.baselineTier === "UNSUPPORTED" || (entry.platform !== "all" && entry.platform !== inventory.platform)) {
    return { entry, tier: "UNSUPPORTED", evidenceSummary: entry.notes, receipt: null };
  }

  const harness = inventory.harnesses.find((candidate) => candidate.id === entry.harnessId);
  if (!harness?.detected) {
    return { entry, tier: "UNVERIFIED", evidenceSummary: "Harness executable not detected", receipt: null };
  }
  if (options.ledgerUnavailableReason !== undefined) {
    return { entry, tier: "UNVERIFIED", evidenceSummary: options.ledgerUnavailableReason, receipt: null };
  }

  const match = matchingReceipt(entry, ledger);
  if (match === null) {
    const reason = entry.harnessId === "antigravity"
      ? "No inspectable Antigravity invocation receipt can be represented by the current host ledger"
      : "Canary unrun on host or matching invocation receipt is not inspectable";
    return { entry, tier: "UNVERIFIED", evidenceSummary: reason, receipt: null };
  }

  const { proof, index } = match;
  return {
    entry,
    tier: "PROVEN",
    evidenceSummary: `Verified ${proof.capability} invocation at ${proof.observedAt}`,
    receipt: {
      reference: `capabilities/ledger.json#proof-${index + 1}`,
      capability: proof.capability,
      observedAt: proof.observedAt,
      harnessVersion: proof.harnessVersion.exact,
      oracleCommand: proof.oracle.command,
    },
  };
}

export function evaluateSupportMatrix(
  inventory: Inventory,
  ledger: CapabilityLedger,
  options: SupportMatrixEvaluationOptions = {},
): SupportMatrixReport {
  return {
    schemaVersion: 1,
    release: SUPPORT_MATRIX_RELEASE,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    platform: options.platform ?? inventory.platform,
    evidenceSource: "capabilities/ledger.json",
    cells: BASE_SUPPORT_MATRIX.map((entry) => evaluateMatrixCell(entry, inventory, ledger, options)),
  };
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\r", " ").replaceAll("\n", " ");
}

export function renderSupportMatrixMarkdown(report: SupportMatrixReport): string {
  const rows = report.cells.map((cell) => {
    const evidence = cell.receipt === null
      ? cell.evidenceSummary
      : `${cell.evidenceSummary}; receipt \`${cell.receipt.reference}\``;
    return `| ${escapeCell(cell.entry.harnessId)} | ${escapeCell(cell.entry.surface)} | ${cell.entry.platform} | **${cell.tier}** | ${escapeCell(evidence)} |`;
  });
  return [
    `# alpha-AOS ${report.release} Support Matrix`,
    "",
    `Canonical evaluation timestamp: \`${report.generatedAt}\`  `,
    `Evaluation platform: \`${report.platform}\`  `,
    `Evidence source: \`${report.evidenceSource}\``,
    "",
    "A cell is **PROVEN** only when a detected active harness has a matching, inspectable real-host invocation receipt. A declared claim without that receipt is **UNVERIFIED**; Claude Code is always **RESIDUE**; structurally incompatible surfaces are **UNSUPPORTED**.",
    "",
    "| Harness | Surface | Platform | Status | Evidence / Notes |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "## Taxonomy",
    "",
    "- **PROVEN** — a matching positive invocation receipt passed, retained observable evidence, and exited successfully.",
    "- **RESIDUE** — compatibility-only behavior outside the active v0.1.0 release bar.",
    "- **UNVERIFIED** — the executable or an inspectable matching invocation receipt is absent.",
    "- **UNSUPPORTED** — the harness, platform, or surface is intentionally incompatible.",
    "",
    "Run `alpha-aos doctor --matrix` on a host to evaluate its receipts. Run `alpha-aos doctor --matrix --json` for the structured report.",
    "",
  ].join("\n");
}
