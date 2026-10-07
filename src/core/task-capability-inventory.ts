import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { packageRoot, userStateRoot } from "./paths.js";
import { loadCatalog, loadLock } from "./catalog.js";
import { loadPackCatalogStrict } from "./pack-catalog.js";
import { readCapabilityLedger, capabilityLedgerPath } from "./capability-ledger.js";
import { readApprovedProjectPlan, PROJECT_PLAN_ARTIFACT } from "./project-plan.js";
import {
  evaluateStepObligations,
  type CapabilityBoundary,
  type StepObligationsDecision,
  type TaskCapabilityObligation,
  type OmittedCapabilityObligation,
} from "./task-capability-obligations.js";
import {
  assessCapabilityDrift,
  type CapabilityDriftAssessment,
  type CapabilityFingerprint,
} from "./task-capability-drift.js";
import {
  readCapabilityReceipts,
  type TaskCapabilityReceipt,
} from "./task-capability-receipts.js";
import type { DigestableTaskContract, TaskContract } from "./task-contract.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";
import type {
  CapabilityKind,
  CapabilityLedger,
  CapabilityScope,
  HarnessId,
  NativeUseState,
  PackCatalog,
  PackDeclaration,
  PackState,
  ProjectCapabilityPlan,
  StackCatalog,
  StackLock,
  SurfaceSupport,
  TaskCapabilityInventory,
  TaskCapabilityInventoryItem,
} from "../types.js";

const ALL_HARNESSES: readonly HarnessId[] = ["claude", "codex", "antigravity", "pi", "hermes"];

const KIND_ORDER: Record<CapabilityKind, number> = {
  "gsd-workflow": 1,
  "ecc-global-skill": 2,
  "ecc-project-skill": 3,
  "owned-skill": 4,
  "mcp-server": 5,
  "mcp-tool": 6,
  "capability-pack": 7,
  "control-command": 8,
  "native-tool": 9,
  "mandatory-hook": 10,
};

const MCP_TOOLS: Record<string, readonly string[]> = {
  context7: ["resolve-library-id", "query-docs"],
  exa: ["web_search_exa", "web_fetch_exa"],
  firecrawl: ["firecrawl_scrape", "firecrawl_map", "firecrawl_crawl", "firecrawl_check_crawl_status"],
};

export interface BuildTaskCapabilityInventoryOptions {
  readonly catalog?: StackCatalog | undefined;
  readonly lock?: StackLock | undefined;
  readonly packCatalog?: PackCatalog | undefined;
  readonly projectPlan?: ProjectCapabilityPlan | null | undefined;
  readonly ledger?: CapabilityLedger | null | undefined;
  readonly projectRoot?: string | undefined;
  readonly harness?: HarnessId | undefined;
  readonly packageRoot?: string | undefined;
}

function resolveNativeUseForCapability(
  capabilityId: string,
  capabilityName: string,
  harness: HarnessId | undefined,
  ledger: CapabilityLedger | null | undefined,
): { nativeUse: NativeUseState; nativeUseReason: string } {
  if (!ledger || !ledger.proofs || ledger.proofs.length === 0) {
    return {
      nativeUse: "unverified",
      nativeUseReason: "No host evidence recorded in capability ledger",
    };
  }

  const proofs = ledger.proofs.filter((proof) => {
    if (proof.polarity !== "positive") return false;
    if (harness !== undefined && proof.harness !== harness) return false;
    return (
      proof.capability === capabilityId ||
      proof.capability === capabilityName ||
      capabilityId.endsWith(`:${proof.capability}`)
    );
  });

  const invoked = proofs.find((p) => p.nativeUse === "invoked");
  if (invoked) {
    return {
      nativeUse: "invoked",
      nativeUseReason: invoked.invocationEvidence
        ? `Observed verified invocation on ${invoked.harness}`
        : `Capability ledger records invoked on ${invoked.harness}`,
    };
  }

  const discovered = proofs.find((p) => p.nativeUse === "discovered");
  if (discovered) {
    return {
      nativeUse: "discovered",
      nativeUseReason: `Capability ledger records discovered on ${discovered.harness}`,
    };
  }

  return {
    nativeUse: "unverified",
    nativeUseReason: `No positive host proof in capability ledger for ${capabilityId}`,
  };
}

function resolveSupportForCapability(
  targetHarnesses: readonly HarnessId[],
  harness: HarnessId | undefined,
): { support: SurfaceSupport; supportReason: string } {
  if (harness !== undefined) {
    if (targetHarnesses.includes(harness)) {
      return {
        support: "supported",
        supportReason: `Target harness ${harness} is supported for this capability.`,
      };
    }
    return {
      support: "unsupported",
      supportReason: `Target harness ${harness} is not in declared targets [${targetHarnesses.join(", ")}].`,
    };
  }

  if (targetHarnesses.length > 0) {
    return {
      support: "supported",
      supportReason: `Supported on target harnesses: ${targetHarnesses.join(", ")}.`,
    };
  }

  return {
    support: "unverified",
    supportReason: "No target harnesses declared.",
  };
}

function computeInputFingerprint(
  catalog: StackCatalog,
  lock: StackLock,
  packs: readonly PackDeclaration[],
  projectPlan?: ProjectCapabilityPlan | null,
): string {
  const gsd = lock.components.gsd;
  const ecc = lock.components.ecc;
  const mcpEntries = Object.entries(lock.components.mcp ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v?.version ?? ""}:${v?.integrity ?? ""}`);

  const parts = [
    catalog.name,
    catalog.defaultChannel,
    lock.channel,
    gsd?.version ?? "",
    gsd?.integrity ?? "",
    ecc?.version ?? "",
    ecc?.integrity ?? "",
    ...mcpEntries,
    ...packs.map((p) => p.id).sort(),
    projectPlan?.planDigest ?? "no-plan",
  ];

  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * Builds the versioned, project-scoped capability inventory (CAP-01).
 *
 * Enumerates all declaration categories with independent orthogonal axes
 * for deployment, nativeUse, and support. Unapproved project packs remain
 * unselected and are not treated as globally available.
 */
export async function buildTaskCapabilityInventory(
  options: BuildTaskCapabilityInventoryOptions = {},
): Promise<TaskCapabilityInventory> {
  const root = options.packageRoot ?? packageRoot();
  const projectRoot = options.projectRoot ?? process.cwd();

  let catalog = options.catalog;
  if (!catalog) {
    catalog = await loadCatalog(root);
  }

  let lock = options.lock;
  if (!lock) {
    lock = await loadLock(root, catalog.defaultChannel);
  }

  const gsd = lock.components.gsd;
  if (!gsd) {
    throw new Error("Lockfile is missing required GSD component");
  }

  const ecc = lock.components.ecc;
  if (!ecc) {
    throw new Error("Lockfile is missing required ECC component");
  }

  let packCatalog = options.packCatalog;
  if (!packCatalog) {
    try {
      const loadedPacks = await loadPackCatalogStrict(root);
      packCatalog = loadedPacks.value;
    } catch {
      packCatalog = { schemaVersion: 1, packs: [] };
    }
  }

  let ledger = options.ledger;
  if (ledger === undefined) {
    try {
      const read = await readCapabilityLedger(capabilityLedgerPath(userStateRoot()));
      ledger = read.state === "present" ? read.ledger : null;
    } catch {
      ledger = null;
    }
  }

  let projectPlan = options.projectPlan;
  if (projectPlan === undefined) {
    try {
      const planPath = join(projectRoot, ...PROJECT_PLAN_ARTIFACT.split("/"));
      const read = await readApprovedProjectPlan(planPath, root);
      if (read.state === "present") {
        projectPlan = read.artifact.plan;
      }
    } catch {
      projectPlan = null;
    }
  }

  const items: TaskCapabilityInventoryItem[] = [];

  // 1. GSD Workflows
  const gsdTargets = catalog.components.gsd.targets;
  const gsdWorkflows = ["discuss", "plan", "execute", "verify", "review"] as const;
  for (const step of gsdWorkflows) {
    const id = `gsd:workflow:${step}`;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, step, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(gsdTargets, options.harness);
    items.push({
      id,
      name: `GSD ${step.charAt(0).toUpperCase() + step.slice(1)} Workflow`,
      kind: "gsd-workflow",
      scope: "global",
      version: gsd.version,
      source: gsd.package,
      sourceHash: gsd.integrity,
      targetHarnesses: gsdTargets,
      applicable: true,
      selected: true,
      applicabilityReason: "Standard GSD lifecycle workflow spine for autonomous task execution.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // 2. Global ECC Skills
  const globalSkills = catalog.components.ecc.globalSkills;
  for (const skill of globalSkills) {
    const id = `ecc:global:${skill}`;
    const sourceHash = ecc.sourceSha256[skill] ?? null;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, skill, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(ALL_HARNESSES, options.harness);
    items.push({
      id,
      name: skill,
      kind: "ecc-global-skill",
      scope: "global",
      version: ecc.version,
      source: ecc.package,
      sourceHash,
      targetHarnesses: ALL_HARNESSES,
      applicable: true,
      selected: true,
      applicabilityReason: "Globally configured low-risk ECC skill distributed across harnesses.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // 3. Project ECC Skills & 7. Capability Packs
  const packs = packCatalog.packs ?? [];
  const selectedPacks = new Set(projectPlan?.selected ?? []);
  const applicablePacks = new Set(projectPlan?.applicable ?? []);

  for (const pack of packs) {
    const packApplicable = applicablePacks.has(pack.id);
    const packSelected = selectedPacks.has(pack.id);

    // Capability pack row
    const packId = `pack:${pack.id}`;
    const { nativeUse: packNativeUse, nativeUseReason: packNativeUseReason } = resolveNativeUseForCapability(
      packId,
      pack.id,
      options.harness,
      ledger,
    );
    const { support: packSupport, supportReason: packSupportReason } = resolveSupportForCapability(
      ALL_HARNESSES,
      options.harness,
    );

    const packDeployment: PackState = packSelected ? "CURRENT" : "STALE";

    items.push({
      id: packId,
      name: pack.id,
      kind: "capability-pack",
      scope: "project",
      version: "1.0.0",
      source: `catalog/packs/${pack.id}.yaml`,
      sourceHash: null,
      targetHarnesses: ALL_HARNESSES,
      applicable: packApplicable,
      selected: packSelected,
      applicabilityReason: packApplicable
        ? `Project evidence satisfies criteria for pack ${pack.id}.`
        : `Project evidence does not satisfy pack ${pack.id} criteria.`,
      exclusionReason: packSelected ? null : `Project pack ${pack.id} is not approved or selected for this project.`,
      unavailableReason: packApplicable ? null : `Pack ${pack.id} is not applicable to current project.`,
      deployment: packDeployment,
      nativeUse: packNativeUse,
      support: packSupport,
      nativeUseReason: packNativeUseReason,
      supportReason: packSupportReason,
    });

    // Skills inside this pack
    for (const skill of pack.skills ?? []) {
      const skillId = `ecc:project:${pack.id}:${skill}`;
      const sourceHash = ecc.sourceSha256[skill] ?? null;
      const { nativeUse: skillNativeUse, nativeUseReason: skillNativeUseReason } = resolveNativeUseForCapability(
        skillId,
        skill,
        options.harness,
        ledger,
      );
      const { support: skillSupport, supportReason: skillSupportReason } = resolveSupportForCapability(
        ALL_HARNESSES,
        options.harness,
      );

      // Target pre-state check if plan targets exist
      let skillDeployment: PackState = packSelected ? "CURRENT" : "STALE";
      if (projectPlan?.targetPreState) {
        const target = projectPlan.targetPreState.find((t) => t.packId === pack.id && t.skill === skill);
        if (target) {
          skillDeployment = target.action === "current" ? "CURRENT" : target.action === "create" ? "STALE" : "DRIFTED";
        }
      }

      items.push({
        id: skillId,
        name: skill,
        kind: "ecc-project-skill",
        scope: "project",
        version: ecc.version,
        source: ecc.package,
        sourceHash,
        targetHarnesses: ALL_HARNESSES,
        applicable: packApplicable,
        selected: packSelected,
        applicabilityReason: packApplicable
          ? `Included in applicable project pack ${pack.id}.`
          : `Parent pack ${pack.id} is not applicable.`,
        exclusionReason: packSelected
          ? null
          : `Project pack ${pack.id} is unapproved or unselected; skill remains inactive.`,
        unavailableReason: packApplicable ? null : `Parent pack ${pack.id} is not applicable.`,
        deployment: skillDeployment,
        nativeUse: skillNativeUse,
        support: skillSupport,
        nativeUseReason: skillNativeUseReason,
        supportReason: skillSupportReason,
      });
    }
  }

  // 4. Owned Skills
  for (const owned of catalog.components.ownedSkills) {
    const id = `owned:${owned.id}`;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, owned.id, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(owned.targets, options.harness);
    items.push({
      id,
      name: owned.id,
      kind: "owned-skill",
      scope: "global",
      version: "1.0.0",
      source: owned.source,
      sourceHash: null,
      targetHarnesses: owned.targets,
      applicable: true,
      selected: true,
      applicabilityReason: `Owned skill configured in catalog for targets: ${owned.targets.join(", ")}.`,
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // 5. MCP Servers & 6. MCP Tools
  const mcpOrder = catalog.components.mcp.rolloutOrder;
  const mcpTargets = catalog.components.mcp.targets;
  const mcpComponents = lock.components.mcp;
  if (mcpComponents) {
    for (const serverKey of mcpOrder) {
      const lockMcp = mcpComponents[serverKey];
      if (!lockMcp) continue;

    const serverId = `mcp:server:${serverKey}`;
    const { nativeUse: serverNativeUse, nativeUseReason: serverNativeUseReason } = resolveNativeUseForCapability(
      serverId,
      serverKey,
      options.harness,
      ledger,
    );
    const { support: serverSupport, supportReason: serverSupportReason } = resolveSupportForCapability(
      mcpTargets,
      options.harness,
    );

    items.push({
      id: serverId,
      name: `${serverKey} MCP Server`,
      kind: "mcp-server",
      scope: "global",
      version: lockMcp.version,
      source: lockMcp.package,
      sourceHash: lockMcp.integrity,
      targetHarnesses: mcpTargets,
      applicable: true,
      selected: true,
      applicabilityReason: "Catalog-declared MCP server rollout.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse: serverNativeUse,
      support: serverSupport,
      nativeUseReason: serverNativeUseReason,
      supportReason: serverSupportReason,
    });

    const tools = MCP_TOOLS[serverKey] ?? [];
    for (const toolName of tools) {
      const toolId = `mcp:tool:${serverKey}:${toolName}`;
      const { nativeUse: toolNativeUse, nativeUseReason: toolNativeUseReason } = resolveNativeUseForCapability(
        toolId,
        toolName,
        options.harness,
        ledger,
      );
      const { support: toolSupport, supportReason: toolSupportReason } = resolveSupportForCapability(
        mcpTargets,
        options.harness,
      );

      items.push({
        id: toolId,
        name: toolName,
        kind: "mcp-tool",
        scope: "global",
        version: lockMcp.version,
        source: lockMcp.package,
        sourceHash: lockMcp.integrity,
        targetHarnesses: mcpTargets,
        applicable: true,
        selected: true,
        applicabilityReason: `MCP tool provided by ${serverKey} server.`,
        exclusionReason: null,
        unavailableReason: null,
        deployment: "CURRENT",
        nativeUse: toolNativeUse,
        support: toolSupport,
        nativeUseReason: toolNativeUseReason,
        supportReason: toolSupportReason,
      });
    }
  }
}

  // 8. Control Commands
  const controlCommands = [
    "plan",
    "status",
    "install",
    "sync",
    "doctor",
    "rollback",
    "checkpoint",
  ] as const;
  for (const cmd of controlCommands) {
    const id = `control:command:${cmd}`;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, cmd, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(ALL_HARNESSES, options.harness);
    items.push({
      id,
      name: `alpha-aos ${cmd}`,
      kind: "control-command",
      scope: "global",
      version: "1.0.0",
      source: "src/cli.ts",
      sourceHash: null,
      targetHarnesses: ALL_HARNESSES,
      applicable: true,
      selected: true,
      applicabilityReason: "alpha-AOS control plane CLI command.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // 9. Native Tools
  const nativeTools = ["bash", "read_file", "write_file", "edit_file", "glob", "grep"] as const;
  for (const tool of nativeTools) {
    const id = `native:tool:${tool}`;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, tool, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(ALL_HARNESSES, options.harness);
    items.push({
      id,
      name: tool,
      kind: "native-tool",
      scope: "global",
      version: "native",
      source: "harness-builtin",
      sourceHash: null,
      targetHarnesses: ALL_HARNESSES,
      applicable: true,
      selected: true,
      applicabilityReason: "Harness native tool execution capability.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // 10. Mandatory Hooks
  const mandatoryHooks = [
    "discuss:pre",
    "discuss:post",
    "plan:pre",
    "plan:post",
    "execute:pre",
    "execute:post",
    "verify:pre",
    "verify:post",
    "quality-gate:review",
  ] as const;
  for (const hook of mandatoryHooks) {
    const id = `hook:${hook}`;
    const { nativeUse, nativeUseReason } = resolveNativeUseForCapability(id, hook, options.harness, ledger);
    const { support, supportReason } = resolveSupportForCapability(ALL_HARNESSES, options.harness);
    items.push({
      id,
      name: hook,
      kind: "mandatory-hook",
      scope: "global",
      version: "1.0.0",
      source: "task-hook-receipt",
      sourceHash: null,
      targetHarnesses: ALL_HARNESSES,
      applicable: true,
      selected: true,
      applicabilityReason: "Mandatory GSD lifecycle verification hook or quality gate.",
      exclusionReason: null,
      unavailableReason: null,
      deployment: "CURRENT",
      nativeUse,
      support,
      nativeUseReason,
      supportReason,
    });
  }

  // Invariant: verify uniqueness of IDs
  const seenIds = new Set<string>();
  for (const item of items) {
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate capability declaration id: ${item.id}`);
    }
    seenIds.add(item.id);
  }

  // Deterministic sorting
  items.sort((left, right) => {
    const kindDiff = (KIND_ORDER[left.kind] ?? 99) - (KIND_ORDER[right.kind] ?? 99);
    if (kindDiff !== 0) return kindDiff;
    return left.id.localeCompare(right.id);
  });

  const inputFingerprint = computeInputFingerprint(catalog, lock, packs, projectPlan);

  return {
    schemaVersion: 1,
    projectRoot,
    harness: options.harness,
    items,
    generatedAt: new Date().toISOString(),
    inputFingerprint,
  };
}

export interface TaskCapabilitySummaryItem {
  readonly capabilityId: string;
  readonly name?: string | undefined;
  readonly source?: string | undefined;
  readonly version?: string | undefined;
  readonly reason?: string | undefined;
  readonly reusedFromReceiptId?: string | null | undefined;
}

export interface TaskCapabilityFailedItem {
  readonly capabilityId: string;
  readonly receiptId?: string | undefined;
  readonly outcome: string;
  readonly error: string;
}

export interface TaskCapabilityBlockedItem {
  readonly capabilityId: string;
  readonly reason: string;
  readonly nextAction?: string | undefined;
}

export interface TaskCapabilityOmittedItem {
  readonly capabilityId: string;
  readonly supersededBy?: string | undefined;
  readonly reason: string;
}

export interface TaskCapabilitySummary {
  readonly selectedCount: number;
  readonly failedCount: number;
  readonly blockedCount: number;
  readonly omittedCount: number;
  readonly selected: readonly TaskCapabilitySummaryItem[];
  readonly failed: readonly TaskCapabilityFailedItem[];
  readonly blocked: readonly TaskCapabilityBlockedItem[];
  readonly omitted: readonly TaskCapabilityOmittedItem[];
}

export interface TaskCapabilityReceiptSummary {
  readonly receiptId: string;
  readonly obligationId: string;
  readonly capabilityId: string;
  readonly step: CapabilityBoundary;
  readonly harness: string;
  readonly toolName?: string | undefined;
  readonly outcome: string;
  readonly verified: boolean;
  readonly timestamp: string;
  readonly invocationEvidenceHash: string;
  readonly status: "valid" | "invalidated" | "unverified";
}

export interface TaskCapabilityReport {
  readonly contractId?: string | undefined;
  readonly contractRevision?: number | undefined;
  readonly contractDigest?: string | undefined;
  readonly step: CapabilityBoundary;
  readonly summary: TaskCapabilitySummary;
  readonly obligations: readonly TaskCapabilityObligation[];
  readonly omittedObligations: readonly OmittedCapabilityObligation[];
  readonly inventory: TaskCapabilityInventory;
  readonly drift: CapabilityDriftAssessment;
  readonly receipts: readonly TaskCapabilityReceiptSummary[];
}

export interface BuildTaskCapabilityReportOptions {
  readonly contract?: DigestableTaskContract | TaskContract | undefined;
  readonly contractId?: string | undefined;
  readonly contractRevision?: number | undefined;
  readonly contractDigest?: string | undefined;
  readonly projectRoot?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly harness?: HarnessId | undefined;
  readonly step?: CapabilityBoundary | undefined;
  readonly receipts?: readonly TaskCapabilityReceipt[] | undefined;
  readonly inventory?: TaskCapabilityInventory | undefined;
  readonly stopReason?: string | null | undefined;
  readonly checkpointStatus?: string | undefined;
}

/**
 * Builds a comprehensive, read-only task capability report (D-16, D-17).
 * Integrates inventory, step obligations, failure/blocking records, receipts, and drift assessment.
 */
export async function buildTaskCapabilityReport(
  options: BuildTaskCapabilityReportOptions = {},
): Promise<TaskCapabilityReport> {
  const projectRoot = options.projectRoot ?? options.contract?.scope.projectRoot ?? process.cwd();
  const harness = options.harness ?? options.contract?.agentPolicy?.executor ?? "codex";

  let step: CapabilityBoundary = "execute";
  if (options.step) {
    step = options.step;
  } else if (
    options.contract?.scope.workflow &&
    ["discuss", "plan", "execute", "verify", "review"].includes(options.contract.scope.workflow)
  ) {
    step = options.contract.scope.workflow as CapabilityBoundary;
  }

  const inventory = options.inventory ?? (await buildTaskCapabilityInventory({ projectRoot, harness }));
  const receipts = options.receipts ?? (options.stateRoot ? await readCapabilityReceipts(options.stateRoot) : []);

  let decision: StepObligationsDecision;
  if (options.contract) {
    decision = evaluateStepObligations({
      contract: options.contract as TaskContract,
      step,
      projectRoot,
      inventory,
      priorReceipts: receipts,
    });
  } else {
    decision = { status: "ready", obligations: [], omitted: [] };
  }

  const baselinePhase = receipts[0]?.step ?? step;
  const baselineFingerprint: CapabilityFingerprint = {
    phase: baselinePhase,
    scope: projectRoot,
    harness,
  };
  const currentFingerprint: CapabilityFingerprint = {
    phase: step,
    scope: projectRoot,
    harness,
  };

  const drift = assessCapabilityDrift({
    obligations: decision.obligations,
    receipts,
    baseline: baselineFingerprint,
    current: currentFingerprint,
    contract: options.contract as TaskContract | undefined,
    projectRoot,
  });

  const selectedItems: TaskCapabilitySummaryItem[] = decision.obligations.map((ob) => ({
    capabilityId: ob.capabilityId,
    name: ob.capabilityId,
    source: ob.source,
    version: ob.version,
    reason: ob.selectionReason,
    reusedFromReceiptId: ob.reusedFromReceiptId ?? null,
  }));

  const failedItems: TaskCapabilityFailedItem[] = receipts
    .filter((r) => r.outcome !== "ok" || r.isError)
    .map((r) => ({
      capabilityId: r.capabilityId,
      receiptId: r.receiptId,
      outcome: r.outcome,
      error: r.errorMessage ?? "failed invocation",
    }));

  const blockedItems: TaskCapabilityBlockedItem[] = [];
  if (decision.status === "needs-input" && decision.needsInputReason) {
    blockedItems.push({
      capabilityId: "step-obligations",
      reason: decision.needsInputReason,
    });
  }
  if (options.stopReason) {
    blockedItems.push({
      capabilityId: "task-execution",
      reason: options.stopReason,
    });
  }
  if (drift.hasDrift) {
    for (const entry of drift.entries) {
      if (entry.drifted && entry.nextActionKind !== "none") {
        blockedItems.push({
          capabilityId: entry.capabilityId,
          reason: `${entry.driftReasons.join(", ")}: ${entry.nextAction}`,
          nextAction: entry.nextAction,
        });
      }
    }
  }

  const omittedItems: TaskCapabilityOmittedItem[] = decision.omitted.map((om) => ({
    capabilityId: om.capabilityId,
    supersededBy: om.supersededByCapabilityId,
    reason: om.reason,
  }));

  const summary: TaskCapabilitySummary = {
    selectedCount: selectedItems.length,
    failedCount: failedItems.length,
    blockedCount: blockedItems.length,
    omittedCount: omittedItems.length,
    selected: selectedItems,
    failed: failedItems,
    blocked: blockedItems,
    omitted: omittedItems,
  };

  const receiptSummaries: TaskCapabilityReceiptSummary[] = receipts.map((r) => {
    const isInvalidated = drift.invalidatedReceiptIds.includes(r.receiptId);
    const verified = !r.isError && r.outcome === "ok";
    const status: "valid" | "invalidated" | "unverified" = isInvalidated
      ? "invalidated"
      : verified
        ? "valid"
        : "unverified";
    return {
      receiptId: r.receiptId,
      obligationId: r.obligationId,
      capabilityId: r.capabilityId,
      step: r.step,
      harness: r.harness,
      toolName: r.toolName,
      outcome: r.outcome,
      verified,
      timestamp: r.invokedAt,
      invocationEvidenceHash: r.rawResultSha256,
      status,
    };
  });

  return {
    contractId: options.contractId ?? options.contract?.id,
    contractRevision: options.contractRevision ?? options.contract?.revision,
    contractDigest: options.contractDigest,
    step,
    summary,
    obligations: decision.obligations,
    omittedObligations: decision.omitted,
    inventory,
    drift,
    receipts: receiptSummaries,
  };
}

export type CapabilitySupportStatus = "supported" | "unsupported" | "unverified";
export type CapabilityCellOutcome = "ok" | "failed" | "denied" | "unavailable" | "none";

export interface HostCapabilitySupportCell {
  readonly harness: HarnessId;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly kind: CapabilityKind;
  readonly executable: string | null;
  readonly version: string | null;
  readonly os: string;
  readonly sessionId: string | null;
  readonly installed: boolean;
  readonly discovered: boolean;
  readonly invoked: boolean;
  readonly resultId: string | null;
  readonly outcome: CapabilityCellOutcome;
  readonly support: CapabilitySupportStatus;
  readonly reason: string;
  readonly isSynthetic?: boolean;
}

export interface HarnessHostMatrixReport {
  readonly generatedAt: string;
  readonly os: string;
  readonly harnesses: Record<
    HarnessId,
    {
      readonly executable: string | null;
      readonly version: string | null;
      readonly status: "ok" | "not-found" | "failed";
      readonly cells: readonly HostCapabilitySupportCell[];
    }
  >;
  readonly cells: readonly HostCapabilitySupportCell[];
  readonly summary: {
    readonly totalCapabilities: number;
    readonly totalCells: number;
    readonly supportedCount: number;
    readonly unsupportedCount: number;
    readonly unverifiedCount: number;
  };
}

export interface ProjectLiveSupportCellOptions {
  readonly harness: HarnessId;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly kind: CapabilityKind;
  readonly executable?: string | null;
  readonly version?: string | null;
  readonly os?: string;
  readonly sessionId?: string | null;
  readonly installed?: boolean;
  readonly discovered?: boolean;
  readonly invoked?: boolean;
  readonly resultId?: string | null;
  readonly outcome?: CapabilityCellOutcome;
  readonly failureReason?: string | null;
  readonly isSynthetic?: boolean;
  readonly harnessSupported?: boolean;
}

/**
 * Projects a live host capability support cell enforcing CAP-05 invariants.
 *
 * Rules:
 * 1. Synthetic fixture success must NEVER be recorded or promoted as live host support.
 * 2. Meaningful read-only invocation success actually observed with a valid result ID
 *    is strictly required for 'supported'.
 * 3. Installed-only and discovered-only states remain 'unverified'.
 * 4. Missing executables, unresolvable versions, unsupported harnesses, or failed/denied/unavailable
 *    outcomes yield 'unsupported' (or 'unverified' when missing invocation).
 */
export function projectLiveSupportCell(options: ProjectLiveSupportCellOptions): HostCapabilitySupportCell {
  const harness = options.harness;
  const executable = options.executable ?? null;
  const version = options.version ?? null;
  const os = options.os ?? process.platform;
  const sessionId = options.sessionId ?? null;
  const installed = options.installed ?? false;
  const discovered = options.discovered ?? false;
  const invoked = options.invoked ?? false;
  const resultId = options.resultId ?? null;
  const outcome = options.outcome ?? "none";
  const isSynthetic = options.isSynthetic ?? false;
  const harnessSupported = options.harnessSupported ?? true;

  let support: CapabilitySupportStatus = "unverified";
  let reason = options.failureReason ?? "";

  // CAP-05 Prohibition: synthetic fixture success must NEVER be recorded or promoted as live host support
  if (isSynthetic) {
    support = "unverified";
    reason = "Synthetic fixture evidence cannot prove live host support";
  } else if (!harnessSupported) {
    support = "unsupported";
    reason = options.failureReason ?? `Harness '${harness}' does not support '${options.kind}' capability '${options.capabilityId}'`;
  } else if (executable === null) {
    support = "unsupported";
    reason = options.failureReason ?? `Harness '${harness}' executable not found on PATH`;
  } else if (version === null) {
    support = "unsupported";
    reason = options.failureReason ?? `Harness '${harness}' version probe failed or unavailable`;
  } else if (outcome === "failed" || outcome === "denied" || outcome === "unavailable") {
    support = "unsupported";
    reason = options.failureReason ?? `Invocation outcome was '${outcome}'`;
  } else if (!installed) {
    support = "unverified";
    reason = options.failureReason ?? "Capability not installed on host";
  } else if (!discovered) {
    support = "unverified";
    reason = options.failureReason ?? "Installed on host, but not discovered in session";
  } else if (!invoked) {
    support = "unverified";
    reason = options.failureReason ?? "Discovered in session, but not invoked with meaningful read-only call";
  } else if (outcome === "ok" && resultId !== null) {
    support = "supported";
    reason = options.failureReason ?? `Meaningful read-only invocation verified with result ID ${resultId}`;
  } else {
    support = "unverified";
    reason = options.failureReason ?? "Invoked but no meaningful result ID recorded";
  }

  return {
    harness,
    capabilityId: options.capabilityId,
    capabilityName: options.capabilityName,
    kind: options.kind,
    executable,
    version,
    os,
    sessionId,
    installed,
    discovered,
    invoked,
    resultId,
    outcome,
    support,
    reason,
    ...(isSynthetic ? { isSynthetic: true } : {}),
  };
}

