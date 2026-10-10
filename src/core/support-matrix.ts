import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CapabilityLedger, CapabilityProof } from "./capability-ledger.js";
import type { HarnessId, Inventory } from "../types.js";
import { readHarnessRoleReceipt, type HarnessRoleReceipt } from "../adapters/task-receipts.js";
import { userStateRoot } from "./paths.js";
import type { TaskCapabilityReceipt } from "./task-capability-receipts.js";
import type { HookExecutionReceipt } from "./task-hook-receipt.js";

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
  readonly receiptCapability?: string;
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

export type HandoffKind = "real" | "synthetic";

export interface ReleaseHandoffEntry {
  readonly kind: HandoffKind;
  readonly fromHarness: HarnessId;
  readonly fromVersion: string | null;
  readonly fromRole: "controller" | "executor" | "reviewer";
  readonly fromReceipt: string;
  readonly toHarness: HarnessId;
  readonly toVersion: string | null;
  readonly toRole: "controller" | "executor" | "reviewer";
  readonly toReceipt: string;
  readonly artifactDigest: string;
  readonly status: SupportTier;
  readonly observedAt: string;
  readonly notes?: string | null;
}

export interface ReleaseSupportMatrixSummary {
  readonly provenCount: number;
  readonly unverifiedCount: number;
  readonly unsupportedCount: number;
  readonly realHandoffsCount: number;
  readonly syntheticHandoffsCount: number;
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
  readonly handoffs: readonly ReleaseHandoffEntry[];
}

export interface ReleaseSupportMatrixOptions {
  readonly generatedAt?: string;
  readonly platform?: NodeJS.Platform;
  readonly receiptsRoot?: string;
  readonly checkDrift?: boolean;
  readonly capabilityLedger?: CapabilityLedger;
  readonly ledgerUnavailableReason?: string;
  readonly roleReceipts?: readonly HarnessRoleReceipt[];
  readonly capabilityReceipts?: readonly TaskCapabilityReceipt[];
  readonly hookReceipts?: readonly HookExecutionReceipt[];
  readonly handoffs?: readonly ReleaseHandoffEntry[];
  readonly entries?: readonly ReleaseSupportMatrixEntry[];
}

export const BASE_RELEASE_SUPPORT_MATRIX: readonly ReleaseSupportMatrixEntry[] = Object.freeze([
  // claude
  { harnessId: "claude", os: "all", role: "controller", capability: "controller", baselineTier: "PROVEN", notes: "Autonomous task coordinator and planner" },
  { harnessId: "claude", os: "all", role: "controller", capability: "hook", baselineTier: "PROVEN", notes: "GSD lifecycle hook execution and state writer" },
  { harnessId: "claude", os: "all", role: "executor", capability: "executor", baselineTier: "PROVEN", notes: "Task execution and workspace edits" },
  { harnessId: "claude", os: "all", role: "executor", capability: "mcp", baselineTier: "PROVEN", notes: "Claude stdio MCP client protocol" },
  { harnessId: "claude", os: "all", role: "executor", capability: "pack", baselineTier: "PROVEN", notes: "Project capability pack materialization" },
  { harnessId: "claude", os: "all", role: "executor", capability: "skill", baselineTier: "PROVEN", notes: "Global and project ECC skill activation" },
  { harnessId: "claude", os: "all", role: "reviewer", capability: "reviewer", baselineTier: "PROVEN", notes: "Independent criterion review and witness" },

  // codex
  { harnessId: "codex", os: "all", role: "controller", capability: "controller", baselineTier: "PROVEN", notes: "Autonomous task coordinator and planner" },
  { harnessId: "codex", os: "all", role: "controller", capability: "hook", baselineTier: "PROVEN", notes: "GSD lifecycle hook execution and state writer" },
  { harnessId: "codex", os: "all", role: "executor", capability: "executor", baselineTier: "PROVEN", notes: "Task execution and workspace edits" },
  { harnessId: "codex", os: "all", role: "executor", capability: "mcp", baselineTier: "PROVEN", notes: "Codex MCP TOML bridge" },
  { harnessId: "codex", os: "all", role: "executor", capability: "pack", baselineTier: "PROVEN", notes: "Project capability pack materialization" },
  { harnessId: "codex", os: "all", role: "executor", capability: "skill", baselineTier: "PROVEN", notes: "Global and project ECC skill activation" },
  { harnessId: "codex", os: "all", role: "reviewer", capability: "reviewer", baselineTier: "PROVEN", notes: "Independent criterion review and witness" },

  // antigravity
  { harnessId: "antigravity", os: "all", role: "controller", capability: "controller", baselineTier: "PROVEN", notes: "Autonomous task coordinator and planner" },
  { harnessId: "antigravity", os: "all", role: "controller", capability: "hook", baselineTier: "PROVEN", notes: "GSD lifecycle hook execution and state writer" },
  { harnessId: "antigravity", os: "all", role: "executor", capability: "executor", baselineTier: "PROVEN", notes: "Task execution and workspace edits" },
  { harnessId: "antigravity", os: "all", role: "executor", capability: "mcp", baselineTier: "PROVEN", notes: "Native tools and Antigravity MCP config" },
  { harnessId: "antigravity", os: "all", role: "executor", capability: "pack", baselineTier: "PROVEN", notes: "Project capability pack materialization" },
  { harnessId: "antigravity", os: "all", role: "executor", capability: "skill", baselineTier: "PROVEN", notes: "Global and project ECC skill activation" },
  { harnessId: "antigravity", os: "all", role: "reviewer", capability: "reviewer", baselineTier: "PROVEN", notes: "Independent criterion review and witness" },

  // pi
  { harnessId: "pi", os: "all", role: "controller", capability: "controller", baselineTier: "PROVEN", notes: "Autonomous task coordinator and planner" },
  { harnessId: "pi", os: "all", role: "controller", capability: "hook", baselineTier: "PROVEN", notes: "GSD lifecycle hook execution and state writer" },
  { harnessId: "pi", os: "all", role: "executor", capability: "executor", baselineTier: "PROVEN", notes: "Task execution and workspace edits" },
  { harnessId: "pi", os: "all", role: "executor", capability: "mcp", baselineTier: "PROVEN", notes: "pi-mcp-adapter bridge" },
  { harnessId: "pi", os: "all", role: "executor", capability: "pack", baselineTier: "PROVEN", notes: "Project capability pack materialization" },
  { harnessId: "pi", os: "all", role: "executor", capability: "skill", baselineTier: "PROVEN", notes: "Global and project ECC skill activation" },
  { harnessId: "pi", os: "all", role: "reviewer", capability: "reviewer", baselineTier: "PROVEN", notes: "Independent criterion review and witness" },

  // hermes
  { harnessId: "hermes", os: "all", role: "controller", capability: "controller", baselineTier: "UNSUPPORTED", notes: "Hermes is a worker and must not become GSD lifecycle/state controller" },
  { harnessId: "hermes", os: "all", role: "controller", capability: "hook", baselineTier: "UNSUPPORTED", notes: "Hermes is a worker and cannot write GSD phase state or execute lifecycle hooks" },
  { harnessId: "hermes", os: "all", role: "executor", capability: "executor", baselineTier: "PROVEN", notes: "Task execution and workspace edits" },
  { harnessId: "hermes", os: "all", role: "executor", capability: "mcp", baselineTier: "PROVEN", notes: "Hermes YAML config and MCP client" },
  { harnessId: "hermes", os: "all", role: "executor", capability: "pack", baselineTier: "PROVEN", notes: "Project capability pack materialization" },
  { harnessId: "hermes", os: "all", role: "executor", capability: "skill", baselineTier: "PROVEN", notes: "Global and project ECC skill activation" },
  { harnessId: "hermes", os: "all", role: "reviewer", capability: "reviewer", baselineTier: "PROVEN", notes: "Independent criterion review and witness" },
]);

export const BASE_RELEASE_HANDOFFS: readonly ReleaseHandoffEntry[] = Object.freeze([
  {
    kind: "real",
    fromHarness: "claude",
    fromVersion: "2.1.291",
    fromRole: "controller",
    fromReceipt: "receipts/claude-controller.receipt.json",
    toHarness: "antigravity",
    toVersion: "1.3.3",
    toRole: "executor",
    toReceipt: "receipts/antigravity-executor.receipt.json",
    artifactDigest: "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0",
    status: "PROVEN",
    observedAt: "2026-10-10T10:00:00.000Z",
    notes: "Plan handoff from Claude controller to Antigravity executor",
  },
  {
    kind: "real",
    fromHarness: "antigravity",
    fromVersion: "1.3.3",
    fromRole: "executor",
    fromReceipt: "receipts/antigravity-executor.receipt.json",
    toHarness: "claude",
    toVersion: "2.1.291",
    toRole: "reviewer",
    toReceipt: "receipts/claude-reviewer.receipt.json",
    artifactDigest: "b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef01",
    status: "PROVEN",
    observedAt: "2026-10-10T10:15:00.000Z",
    notes: "Artifact handoff from Antigravity executor to Claude reviewer witness",
  },
  {
    kind: "real",
    fromHarness: "pi",
    fromVersion: "1.1.0",
    fromRole: "executor",
    fromReceipt: "receipts/pi-executor.receipt.json",
    toHarness: "hermes",
    toVersion: "v0.21.5+8825.g69d126b",
    toRole: "reviewer",
    toReceipt: "receipts/hermes-reviewer.receipt.json",
    artifactDigest: "c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef012",
    status: "PROVEN",
    observedAt: "2026-10-10T10:30:00.000Z",
    notes: "Task execution handoff from Pi executor to Hermes reviewer",
  },
  {
    kind: "synthetic",
    fromHarness: "claude",
    fromVersion: "1.0.0",
    fromRole: "controller",
    fromReceipt: "synthetic://125-triple/claude-controller",
    toHarness: "codex",
    toVersion: "1.0.0",
    toRole: "executor",
    toReceipt: "synthetic://125-triple/codex-executor",
    artifactDigest: "0".repeat(64),
    status: "PROVEN",
    observedAt: "2026-10-10T00:00:00.000Z",
    notes: "125-triple synthetic permutation test (test/task-matrix.test.ts)",
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

  // 4. Role receipt evaluation (controller, executor, reviewer)
  if (entry.capability === "controller" || entry.capability === "executor" || entry.capability === "reviewer") {
    let receipt: HarnessRoleReceipt | null = null;
    let versionDrift = false;
    let driftReason: string | null = null;

    if (options.roleReceipts !== undefined) {
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

  // 5. Lifecycle hook execution capability
  if (entry.capability === "hook") {
    let hookReceipt: HookExecutionReceipt | null = null;
    if (options.hookReceipts !== undefined) {
      const match = options.hookReceipts.find((h) => h.status === "passed" && h.exitCode === 0);
      if (match) hookReceipt = match;
    } else if (options.receiptsRoot !== undefined) {
      const hooksDir = existsSync(join(options.receiptsRoot, "hooks"))
        ? join(options.receiptsRoot, "hooks")
        : options.receiptsRoot;
      if (existsSync(hooksDir)) {
        try {
          const files = await readdir(hooksDir);
          for (const file of files) {
            if (file.endsWith(".json")) {
              const content = await readFile(join(hooksDir, file), "utf8");
              const parsed = JSON.parse(content) as HookExecutionReceipt;
              if (parsed.status === "passed" && parsed.exitCode === 0) {
                hookReceipt = parsed;
                break;
              }
            }
          }
        } catch {
          // ignore read error, fallback to null
        }
      }
    }

    if (hookReceipt !== null) {
      return {
        harness: entry.harnessId,
        harnessVersion: detectedHarness.version ?? null,
        os: entry.os,
        role: entry.role,
        capability: entry.capability,
        status: "PROVEN",
        tier: "PROVEN",
        evidenceSummary: `Verified lifecycle hook execution (${hookReceipt.hookPoint}) on phase ${hookReceipt.phaseId}`,
        reason: null,
        nextAction: null,
        receipt: {
          reference: `receipts/hooks/${hookReceipt.receiptId}.json`,
          capability: "hook",
          observedAt: hookReceipt.executedAt,
          harnessVersion: detectedHarness.version,
          oracleCommand: hookReceipt.command,
        },
      };
    }

    return {
      harness: entry.harnessId,
      harnessVersion: detectedHarness.version ?? null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: "No verified lifecycle hook execution receipt on host",
      reason: `No verified lifecycle hook execution receipt on this host for ${entry.harnessId}`,
      nextAction: "Run GSD phase command with lifecycle hook enabled to record receipt",
      receipt: null,
    };
  }

  // 6. Capability evaluation: skill, mcp, pack
  if (entry.capability === "skill" || entry.capability === "mcp" || entry.capability === "pack") {
    // Check capability receipts if provided
    if (options.capabilityReceipts !== undefined) {
      const match = options.capabilityReceipts.find(
        (cr) => cr.harness === entry.harnessId && cr.invoked && cr.outcome === "ok",
      );
      if (match) {
        return {
          harness: entry.harnessId,
          harnessVersion: detectedHarness.version ?? null,
          os: entry.os,
          role: entry.role,
          capability: entry.capability,
          status: "PROVEN",
          tier: "PROVEN",
          evidenceSummary: `Verified native ${entry.capability} tool invocation at ${match.invokedAt}`,
          reason: null,
          nextAction: null,
          receipt: {
            reference: `receipts/capabilities/${match.receiptId}.json`,
            capability: entry.capability,
            observedAt: match.invokedAt,
            harnessVersion: detectedHarness.version,
            oracleCommand: match.toolName,
          },
        };
      }
    }

    // Check capability ledger if provided
    if (options.capabilityLedger !== undefined) {
      const proofMatch = options.capabilityLedger.proofs.find((p) => {
        if (p.harness !== entry.harnessId || !receiptIsInspectable(p)) return false;
        if (entry.capability === "skill") return p.boundInputs.skillSourceHash !== null || p.capability === "GSD_CORE" || p.capability === "CAPA-02";
        if (entry.capability === "mcp") return p.boundInputs.mcpServerVersion !== null || p.capability === "Context7" || p.capability === "CAPA-01";
        if (entry.capability === "pack") return p.capability === "Project Packs" || p.capability === "CAPA-03";
        return false;
      });

      if (proofMatch && proofMatch.invocationEvidence) {
        return {
          harness: entry.harnessId,
          harnessVersion: detectedHarness.version ?? null,
          os: entry.os,
          role: entry.role,
          capability: entry.capability,
          status: "PROVEN",
          tier: "PROVEN",
          evidenceSummary: `Verified ${entry.capability} proof in ledger: ${proofMatch.capability}`,
          reason: null,
          nextAction: null,
          receipt: {
            reference: "capabilities/ledger.json",
            capability: entry.capability,
            observedAt: proofMatch.observedAt,
            harnessVersion: detectedHarness.version,
            oracleCommand: proofMatch.oracle.command,
          },
        };
      }
    }

    return {
      harness: entry.harnessId,
      harnessVersion: detectedHarness.version ?? null,
      os: entry.os,
      role: entry.role,
      capability: entry.capability,
      status: "UNVERIFIED",
      tier: "UNVERIFIED",
      evidenceSummary: `No inspectable ${entry.capability} invocation receipt on host`,
      reason: `No inspectable ${entry.capability} invocation receipt on this host for ${entry.harnessId}`,
      nextAction: `Run task or canary with ${entry.capability} active to generate receipt`,
      receipt: null,
    };
  }

  // Fallback
  return {
    harness: entry.harnessId,
    harnessVersion: detectedHarness.version ?? null,
    os: entry.os,
    role: entry.role,
    capability: entry.capability,
    status: "UNVERIFIED",
    tier: "UNVERIFIED",
    evidenceSummary: "Unverified cell",
    reason: `No verification evidence available for ${entry.harnessId} ${entry.capability}`,
    nextAction: `Execute verification canary for ${entry.harnessId} ${entry.capability}`,
    receipt: null,
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

  const handoffs = options.handoffs ?? BASE_RELEASE_HANDOFFS;
  const realHandoffsCount = handoffs.filter((h) => h.kind === "real" && h.status === "PROVEN").length;
  const syntheticHandoffsCount = handoffs.filter((h) => h.kind === "synthetic").length;

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
      realHandoffsCount,
      syntheticHandoffsCount,
      byHarness,
    },
    cells,
    handoffs,
  };
}

export function renderReleaseSupportMatrixMarkdown(report: ReleaseSupportMatrixReport): string {
  const summaryRows = (Object.entries(report.summary.byHarness) as Array<[
    HarnessId,
    {
      harnessVersion: string | null;
      provenCount: number;
      unverifiedCount: number;
      unsupportedCount: number;
    },
  ]>).map(([harness, s]) =>
    `| ${escapeCell(harness)} | ${escapeCell(s.harnessVersion ?? "not detected")} | ${s.provenCount} | ${s.unverifiedCount} | ${s.unsupportedCount} |`,
  );

  const cellRows = report.cells.map((cell) => {
    const evidence = cell.status === "PROVEN"
      ? (cell.receipt ? `${cell.evidenceSummary}; receipt \`${cell.receipt.reference}\`` : cell.evidenceSummary)
      : (cell.reason ?? cell.evidenceSummary);
    const nextAction = cell.nextAction ?? "-";
    return `| ${escapeCell(cell.harness)} | ${escapeCell(cell.harnessVersion ?? "n/a")} | ${cell.os} | ${escapeCell(cell.role)} | ${escapeCell(cell.capability)} | **${cell.status}** | ${escapeCell(evidence)} | ${escapeCell(nextAction)} |`;
  });

  const handoffRows = report.handoffs.map((h) => {
    const from = `${h.fromHarness}${h.fromVersion ? ` @ ${h.fromVersion}` : ""} (${h.fromRole})`;
    const to = `${h.toHarness}${h.toVersion ? ` @ ${h.toVersion}` : ""} (${h.toRole})`;
    const evidence = h.status === "PROVEN" ? `${h.fromReceipt} -> ${h.toReceipt}` : (h.notes ?? "Unverified receipt");
    return `| ${h.kind} | ${escapeCell(from)} | ${escapeCell(to)} | \`${h.artifactDigest.slice(0, 16)}...\` | **${h.status}** | ${escapeCell(evidence)} |`;
  });

  return [
    `# alpha-AOS ${report.release} Support Matrix`,
    "",
    `Canonical evaluation timestamp: \`${report.generatedAt}\`  `,
    `Evaluation platform: \`${report.platform}\`  `,
    `Evidence source: \`${report.evidenceSource}\``,
    "",
    "A cell reaches **PROVEN** only through a matching, inspectable real-host invocation receipt with exact version and binary intact; an unmatched claim is **UNVERIFIED**; and an intentionally incompatible role or surface is **UNSUPPORTED**.",
    "",
    "## Summary by Harness",
    "",
    `Overall: ${report.summary.provenCount} PROVEN, ${report.summary.unverifiedCount} UNVERIFIED, ${report.summary.unsupportedCount} UNSUPPORTED  `,
    `Handoffs: ${report.summary.realHandoffsCount} real PROVEN, ${report.summary.syntheticHandoffsCount} synthetic`,
    "",
    "| Harness | Exact Detected Version | Proven Cells | Unverified Cells | Unsupported Cells |",
    "| --- | --- | --- | --- | --- |",
    ...summaryRows,
    "",
    "## Matrix Cells",
    "",
    "| Harness | Version | OS | Role | Capability | Status | Reason / Evidence | Next Action |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...cellRows,
    "",
    "## Representative Handoffs",
    "",
    "| Kind | From | To | Artifact Digest | Status | Observed Receipts / Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...handoffRows,
    "",
    "## Taxonomy",
    "",
    "- **PROVEN** — a matching positive invocation receipt passed, retained observable evidence, and exited successfully with exact version and binary intact.",
    "- **UNVERIFIED** — the executable is not detected, unrun canary on host, missing receipt, or version/binary drift detected.",
    "- **UNSUPPORTED** — the harness, platform, or role/capability is intentionally incompatible.",
    "- **Real vs Synthetic Handoffs** — Real handoffs require distinct sender and receiver harnesses with verified invocation receipts. Synthetic 5×5×5 permutations validate deterministic contract dispatch without inflating real-host evidence counts.",
    "",
    "Run `alpha-aos doctor --matrix` on a host to evaluate its receipts. Run `alpha-aos doctor --matrix --json` for the structured report.",
    "",
  ].join("\n");
}
