import type { CapabilityLedger, CapabilityProof } from "./capability-ledger.js";
import type { HarnessId, Inventory } from "../types.js";
import { readHarnessRoleReceipt, type HarnessRoleReceipt } from "../adapters/task-receipts.js";

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
  claude: [
    ["GSD Core", "GSD_CORE", "Lifecycle controller and state writer"],
    ["Context7", "CAPA-01", "Version-sensitive documentation lookup"],
    ["Unified Memory", "CAPA-03", "Cross-harness handoff sender and receiver"],
    ["Project Packs", "CAPA-05", "Evidence-selected project capability materialization"],
  ],
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
} as const satisfies Readonly<Record<HarnessId, readonly (readonly [string, string, string])[]>>);

const activeEntries = (Object.entries(activeSurfaces) as Array<[
  HarnessId,
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
  if (entry.receiptCapability === undefined) return null;
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
    return { entry, tier: "UNVERIFIED", evidenceSummary: "Canary unrun on host or matching invocation receipt is not inspectable", receipt: null };
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
    "A cell reaches **PROVEN** only through a matching, inspectable real-host invocation receipt; an unmatched claim is **UNVERIFIED**; a surface offered only for legacy compatibility is **RESIDUE**; and a structurally incompatible surface is **UNSUPPORTED**.",
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

// ---------------------------------------------------------------------------
// v0.2.0 Release Support Matrix (VER-01..04, D-01..D-04)
// ---------------------------------------------------------------------------

export const RELEASE_SUPPORT_MATRIX_VERSION = "0.2.0";

export interface ReleaseSupportMatrixEntry {
  readonly harnessId: HarnessId;
  readonly os: "win32" | "darwin" | "linux" | "all";
  readonly role: "controller" | "executor" | "reviewer";
  readonly capability: string;
  readonly baselineTier: SupportTier;
  readonly notes: string;
}

export interface ReleaseMatrixCell {
  readonly harness: HarnessId;
  readonly harnessVersion: string | null;
  readonly os: "win32" | "darwin" | "linux" | "all";
  readonly role: "controller" | "executor" | "reviewer";
  readonly capability: string;
  readonly status: SupportTier;
  readonly tier: SupportTier;
  readonly evidenceSummary: string;
  readonly reason: string | null;
  readonly nextAction: string | null;
  readonly receipt: SupportReceiptReference | null;
}

export interface ReleaseSupportMatrixSummary {
  readonly provenCount: number;
  readonly unverifiedCount: number;
  readonly unsupportedCount: number;
  readonly byHarness: Readonly<Record<HarnessId, {
    readonly harnessVersion: string | null;
    readonly provenCount: number;
    readonly unverifiedCount: number;
    readonly unsupportedCount: number;
  }>>;
}

export interface ReleaseSupportMatrixReport {
  readonly schemaVersion: 2;
  readonly release: "0.2.0";
  readonly generatedAt: string;
  readonly platform: NodeJS.Platform;
  readonly evidenceSource: string;
  readonly summary: ReleaseSupportMatrixSummary;
  readonly cells: readonly ReleaseMatrixCell[];
}

export interface ReleaseSupportMatrixOptions {
  readonly generatedAt?: string;
  readonly platform?: NodeJS.Platform;
  readonly receiptsRoot?: string;
  readonly checkDrift?: boolean;
  readonly capabilityLedger?: CapabilityLedger;
  readonly ledgerUnavailableReason?: string;
  readonly roleReceipts?: readonly HarnessRoleReceipt[];
  readonly entries?: readonly ReleaseSupportMatrixEntry[];
}

export const BASE_RELEASE_SUPPORT_MATRIX: readonly ReleaseSupportMatrixEntry[] = Object.freeze([
  // claude
  {
    harnessId: "claude",
    os: "all",
    role: "controller",
    capability: "controller",
    baselineTier: "PROVEN",
    notes: "Autonomous task coordinator and planner",
  },
  {
    harnessId: "claude",
    os: "all",
    role: "executor",
    capability: "executor",
    baselineTier: "PROVEN",
    notes: "Task execution and workspace edits",
  },
  {
    harnessId: "claude",
    os: "all",
    role: "reviewer",
    capability: "reviewer",
    baselineTier: "PROVEN",
    notes: "Independent criterion review",
  },
  // codex
  {
    harnessId: "codex",
    os: "all",
    role: "controller",
    capability: "controller",
    baselineTier: "PROVEN",
    notes: "Autonomous task coordinator and planner",
  },
  {
    harnessId: "codex",
    os: "all",
    role: "executor",
    capability: "executor",
    baselineTier: "PROVEN",
    notes: "Task execution and workspace edits",
  },
  {
    harnessId: "codex",
    os: "all",
    role: "reviewer",
    capability: "reviewer",
    baselineTier: "PROVEN",
    notes: "Independent criterion review",
  },
  // antigravity
  {
    harnessId: "antigravity",
    os: "all",
    role: "controller",
    capability: "controller",
    baselineTier: "PROVEN",
    notes: "Autonomous task coordinator and planner",
  },
  {
    harnessId: "antigravity",
    os: "all",
    role: "executor",
    capability: "executor",
    baselineTier: "PROVEN",
    notes: "Task execution and workspace edits",
  },
  {
    harnessId: "antigravity",
    os: "all",
    role: "reviewer",
    capability: "reviewer",
    baselineTier: "PROVEN",
    notes: "Independent criterion review",
  },
  // pi
  {
    harnessId: "pi",
    os: "all",
    role: "controller",
    capability: "controller",
    baselineTier: "PROVEN",
    notes: "Autonomous task coordinator and planner",
  },
  {
    harnessId: "pi",
    os: "all",
    role: "executor",
    capability: "executor",
    baselineTier: "PROVEN",
    notes: "Task execution and workspace edits",
  },
  {
    harnessId: "pi",
    os: "all",
    role: "reviewer",
    capability: "reviewer",
    baselineTier: "PROVEN",
    notes: "Independent criterion review",
  },
  // hermes
  {
    harnessId: "hermes",
    os: "all",
    role: "controller",
    capability: "controller",
    baselineTier: "UNSUPPORTED",
    notes: "Hermes is a worker and must not become GSD lifecycle/state controller",
  },
  {
    harnessId: "hermes",
    os: "all",
    role: "executor",
    capability: "executor",
    baselineTier: "PROVEN",
    notes: "Task execution and workspace edits",
  },
  {
    harnessId: "hermes",
    os: "all",
    role: "reviewer",
    capability: "reviewer",
    baselineTier: "PROVEN",
    notes: "Independent criterion review",
  },
]);

const HARNESS_ORDER: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];
const ROLE_ORDER: readonly string[] = ["controller", "executor", "reviewer"];

export function compareMatrixCells(a: ReleaseMatrixCell, b: ReleaseMatrixCell): number {
  const hA = HARNESS_ORDER.indexOf(a.harness);
  const hB = HARNESS_ORDER.indexOf(b.harness);
  if (hA !== hB) return hA - hB;

  const vA = a.harnessVersion ?? "";
  const vB = b.harnessVersion ?? "";
  if (vA !== vB) return vA.localeCompare(vB);

  if (a.os !== b.os) return a.os.localeCompare(b.os);

  const rA = ROLE_ORDER.indexOf(a.role);
  const rB = ROLE_ORDER.indexOf(b.role);
  if (rA !== rB) return (rA >= 0 ? rA : 99) - (rB >= 0 ? rB : 99);

  return a.capability.localeCompare(b.capability);
}

export async function evaluateReleaseMatrixCell(
  entry: ReleaseSupportMatrixEntry,
  inventory: Inventory,
  options: ReleaseSupportMatrixOptions = {},
): Promise<ReleaseMatrixCell> {
  const detectedHarness = inventory.harnesses.find((cand) => cand.id === entry.harnessId);

  // 1. Structural incompatibility / unsupported baseline
  if (entry.baselineTier === "UNSUPPORTED") {
    return {
      harness: entry.harnessId,
      harnessVersion: detectedHarness?.version ?? null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNSUPPORTED",
      tier: "UNSUPPORTED",
      evidenceSummary: entry.notes,
      reason: entry.notes,
      nextAction: null,
      receipt: null,
    };
  }

  // 2. Platform mismatch
  if (entry.os !== "all" && entry.os !== inventory.platform) {
    return {
      harness: entry.harnessId,
      harnessVersion: detectedHarness?.version ?? null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNSUPPORTED",
      tier: "UNSUPPORTED",
      evidenceSummary: `Not supported on platform ${inventory.platform}`,
      reason: `Platform mismatch: cell requires ${entry.os}, current is ${inventory.platform}`,
      nextAction: null,
      receipt: null,
    };
  }

  // 3. Harness executable not detected
  if (!detectedHarness?.detected) {
    return {
      harness: entry.harnessId,
      harnessVersion: null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: "Harness executable not detected on host",
      reason: `Harness '${entry.harnessId}' executable not detected on PATH`,
      nextAction: `Install ${entry.harnessId} or ensure executable is on PATH`,
      receipt: null,
    };
  }

  // 4. Role receipt evaluation (exact version & binary drift)
  let receipt: HarnessRoleReceipt | null = null;
  let versionDrift = false;
  let driftReason: string | null = null;

  if (options.roleReceipts !== undefined) {
    // If role receipts are supplied in options, check them directly
    const found = options.roleReceipts.find(
      (r) => r.harness === entry.harnessId && r.role === entry.role,
    );
    if (found) {
      receipt = found;
      if (detectedHarness.version && found.version !== detectedHarness.version) {
        versionDrift = true;
        driftReason = `Version drift: receipt has ${found.version}, detected ${detectedHarness.version}`;
      }
    }
  } else {
    try {
      const readResult = await readHarnessRoleReceipt(
        entry.harnessId,
        entry.role,
        options.receiptsRoot,
        { checkDrift: options.checkDrift ?? true },
      );
      receipt = readResult.receipt;
      versionDrift = readResult.versionDrift;
      driftReason = readResult.driftReason;
    } catch (error) {
      return {
        harness: entry.harnessId,
        harnessVersion: detectedHarness.version ?? null,
        os: entry.os,
        role: entry.role,
        capability: entry.capability,
        status: "UNVERIFIED",
        tier: "UNVERIFIED",
        evidenceSummary: `Error reading receipt: ${error instanceof Error ? error.message : String(error)}`,
        reason: `Receipt read failed for ${entry.harnessId} ${entry.role}`,
        nextAction: `Inspect receipt directory or re-run role canary`,
        receipt: null,
      };
    }
  }

  if (receipt === null) {
    return {
      harness: entry.harnessId,
      harnessVersion: detectedHarness.version ?? null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: `Receipt missing: receipts/${entry.harnessId}-${entry.role}.receipt.json`,
      reason: `No verified invocation receipt on this host for ${entry.harnessId} ${entry.role}`,
      nextAction: `Run role probe or task preview with ${entry.harnessId} to generate receipt`,
      receipt: null,
    };
  }

  if (versionDrift) {
    return {
      harness: entry.harnessId,
      harnessVersion: receipt.version,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: driftReason ?? `Binary or version drift detected for ${entry.harnessId} ${entry.role}`,
      reason: driftReason ?? `Binary drift detected: current binary differs from receipt`,
      nextAction: `Re-run role probe on current ${entry.harnessId} binary to update receipt`,
      receipt: null,
    };
  }

  if (!receipt.capabilities.invoked) {
    return {
      harness: entry.harnessId,
      harnessVersion: receipt.version,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: `Role receipt exists but capability.invoked is false`,
      reason: `Receipt indicates ${entry.harnessId} ${entry.role} invocation failed or was cancelled`,
      nextAction: `Execute successful invocation canary for ${entry.harnessId}`,
      receipt: null,
    };
  }

  return {
    harness: entry.harnessId,
    harnessVersion: receipt.version,
    os: entry.os,
    role: entry.role,
    capability: entry.capability,
    status: "PROVEN",
    tier: "PROVEN",
    evidenceSummary: `Verified ${entry.harnessId} ${entry.role} invocation at ${receipt.probedAt}`,
    reason: null,
    nextAction: null,
    receipt: {
      reference: `receipts/${entry.harnessId}-${entry.role}.receipt.json`,
      capability: entry.capability,
      observedAt: receipt.probedAt,
      harnessVersion: receipt.version,
      oracleCommand: receipt.executable,
    },
  };
}

export async function evaluateReleaseSupportMatrix(
  inventory: Inventory,
  options: ReleaseSupportMatrixOptions = {},
): Promise<ReleaseSupportMatrixReport> {
  const entries = options.entries ?? BASE_RELEASE_SUPPORT_MATRIX;
  const unsortedCells = await Promise.all(
    entries.map((entry) => evaluateReleaseMatrixCell(entry, inventory, options)),
  );
  const cells = [...unsortedCells].sort(compareMatrixCells);

  const provenCount = cells.filter((c) => c.status === "PROVEN").length;
  const unverifiedCount = cells.filter((c) => c.status === "UNVERIFIED").length;
  const unsupportedCount = cells.filter((c) => c.status === "UNSUPPORTED").length;

  const byHarness: Record<HarnessId, {
    harnessVersion: string | null;
    provenCount: number;
    unverifiedCount: number;
    unsupportedCount: number;
  }> = {} as any;

  for (const h of HARNESS_ORDER) {
    const hCells = cells.filter((c) => c.harness === h);
    const detected = inventory.harnesses.find((cand) => cand.id === h);
    const version = hCells.find((c) => c.harnessVersion !== null)?.harnessVersion ?? detected?.version ?? null;
    byHarness[h] = {
      harnessVersion: version,
      provenCount: hCells.filter((c) => c.status === "PROVEN").length,
      unverifiedCount: hCells.filter((c) => c.status === "UNVERIFIED").length,
      unsupportedCount: hCells.filter((c) => c.status === "UNSUPPORTED").length,
    };
  }

  return {
    schemaVersion: 2,
    release: "0.2.0",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    platform: options.platform ?? inventory.platform,
    evidenceSource: options.receiptsRoot ? `receipts under ${options.receiptsRoot}` : "state/receipts",
    summary: {
      provenCount,
      unverifiedCount,
      unsupportedCount,
      byHarness,
    },
    cells,
  };
}
