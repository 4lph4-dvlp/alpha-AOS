import { createHash } from "node:crypto";
import type { HarnessId } from "../types.js";
import {
  selectStepObligations,
  type TaskCapabilityObligation,
} from "./task-capability-obligations.js";
import type { TaskCapabilityReceipt } from "./task-capability-receipts.js";
import type { TaskContract } from "./task-contract.js";
import type { GsdStepKind } from "./task-gsd-lifecycle.js";
import type { TaskPrecondition } from "./task-verdict.js";

export type CapabilityDriftReason =
  | "phase-mismatch"
  | "scope-mismatch"
  | "manifest-changed"
  | "dependency-changed"
  | "pack-not-current"
  | "pack-source-changed"
  | "skill-source-changed"
  | "harness-executable-changed"
  | "harness-version-changed"
  | "mcp-server-version-changed"
  | "mcp-tool-unavailable";

export type NextActionKind =
  | "none"
  | "re-invoke"
  | "re-discover"
  | "re-plan"
  | "re-approve"
  | "re-sync"
  | "restore-tool"
  | "re-probe";

export interface CapabilityFingerprint {
  readonly phase?: string | null | undefined;
  readonly scope?: string | null | undefined;
  readonly manifestDigest?: string | null | undefined;
  readonly dependencyDigest?: string | null | undefined;
  readonly packState?: "CURRENT" | "STALE" | "MISSING" | "MODIFIED" | string | null | undefined;
  readonly packSourceHash?: string | null | undefined;
  readonly skillSourceHash?: string | null | undefined;
  readonly harness?: HarnessId | string | null | undefined;
  readonly harnessExecutable?: string | null | undefined;
  readonly harnessVersion?: string | null | undefined;
  readonly mcpServerVersion?: string | null | undefined;
  readonly mcpToolAvailability?: Readonly<Record<string, boolean>> | null | undefined;
}

export interface CapabilityDriftEntry {
  readonly capabilityId: string;
  readonly obligationId: string;
  readonly drifted: boolean;
  readonly changedFields: readonly string[];
  readonly driftReasons: readonly CapabilityDriftReason[];
  readonly invalidatedReceiptIds: readonly string[];
  readonly reusableReceiptIds: readonly string[];
  readonly nextAction: string;
  readonly nextActionKind: NextActionKind;
}

export interface CapabilityDriftAssessment {
  readonly hasDrift: boolean;
  readonly driftedCapabilities: readonly string[];
  readonly invalidatedReceiptIds: readonly string[];
  readonly reusableReceiptIds: readonly string[];
  readonly entries: readonly CapabilityDriftEntry[];
  readonly reselectedObligations: readonly TaskCapabilityObligation[];
  readonly summary: string;
}

export interface AssessCapabilityDriftOptions {
  readonly obligations: readonly TaskCapabilityObligation[];
  readonly receipts: readonly TaskCapabilityReceipt[];
  readonly baseline: CapabilityFingerprint;
  readonly current: CapabilityFingerprint;
  readonly contract?: TaskContract | undefined;
  readonly projectRoot?: string | undefined;
  readonly availableCapabilities?: readonly string[] | undefined;
  readonly projectPacks?: readonly string[] | undefined;
}

/**
 * Compares declaration fingerprints and host observation fingerprints against prior proofs,
 * identifying invalid receipts, specific drift causes, and required next actions (CAP-04, D-09, D-17).
 */
export function assessCapabilityDrift(options: AssessCapabilityDriftOptions): CapabilityDriftAssessment {
  const { obligations, receipts, baseline, current } = options;
  const entries: CapabilityDriftEntry[] = [];
  const allInvalidatedReceipts: string[] = [];
  const allReusableReceipts: string[] = [];
  const driftedCapabilities: string[] = [];

  // Determine global fingerprint diffs
  const globalChangedFields: string[] = [];
  const globalReasons: CapabilityDriftReason[] = [];

  if (baseline.manifestDigest !== undefined && current.manifestDigest !== undefined && baseline.manifestDigest !== current.manifestDigest) {
    globalChangedFields.push("manifestDigest");
    globalReasons.push("manifest-changed");
  }

  if (baseline.dependencyDigest !== undefined && current.dependencyDigest !== undefined && baseline.dependencyDigest !== current.dependencyDigest) {
    globalChangedFields.push("dependencyDigest");
    globalReasons.push("dependency-changed");
  }

  if (current.packState !== undefined && current.packState !== "CURRENT") {
    globalChangedFields.push("packState");
    globalReasons.push("pack-not-current");
  }

  if (baseline.packSourceHash !== undefined && current.packSourceHash !== undefined && baseline.packSourceHash !== current.packSourceHash) {
    globalChangedFields.push("packSourceHash");
    globalReasons.push("pack-source-changed");
  }

  if (baseline.skillSourceHash !== undefined && current.skillSourceHash !== undefined && baseline.skillSourceHash !== current.skillSourceHash) {
    globalChangedFields.push("skillSourceHash");
    globalReasons.push("skill-source-changed");
  }

  if (baseline.harnessExecutable !== undefined && current.harnessExecutable !== undefined && baseline.harnessExecutable !== current.harnessExecutable) {
    globalChangedFields.push("harnessExecutable");
    globalReasons.push("harness-executable-changed");
  }

  if (baseline.harnessVersion !== undefined && current.harnessVersion !== undefined && baseline.harnessVersion !== current.harnessVersion) {
    globalChangedFields.push("harnessVersion");
    globalReasons.push("harness-version-changed");
  }

  if (baseline.mcpServerVersion !== undefined && current.mcpServerVersion !== undefined && baseline.mcpServerVersion !== current.mcpServerVersion) {
    globalChangedFields.push("mcpServerVersion");
    globalReasons.push("mcp-server-version-changed");
  }

  // Assess each obligation
  for (const obligation of obligations) {
    const matchingReceipts = receipts.filter(
      (r) => r.obligationId === obligation.id || (r.capabilityId === obligation.capabilityId && r.step === obligation.step),
    );

    const changedFields = [...globalChangedFields];
    const driftReasons = [...globalReasons];
    const invalidatedReceiptIds: string[] = [];
    const reusableReceiptIds: string[] = [];

    // Phase check (D-09: phase mismatch invalidates cross-phase reuse unless step matches)
    const currentPhase = current.phase ?? obligation.step;
    if (baseline.phase !== undefined && currentPhase !== undefined && baseline.phase !== currentPhase) {
      if (!changedFields.includes("phase")) changedFields.push("phase");
      if (!driftReasons.includes("phase-mismatch")) driftReasons.push("phase-mismatch");
    }

    // Scope check
    if (baseline.scope !== undefined && current.scope !== undefined && baseline.scope !== current.scope) {
      if (!changedFields.includes("scope")) changedFields.push("scope");
      if (!driftReasons.includes("scope-mismatch")) driftReasons.push("scope-mismatch");
    }

    // Tool availability check
    if (current.mcpToolAvailability) {
      const toolNames = new Set<string>();
      toolNames.add(obligation.capabilityId);
      const suffix = obligation.capabilityId.split(":").pop();
      if (suffix) toolNames.add(suffix);
      if (obligation.capabilityId === "documentation-lookup") toolNames.add("context7");
      if (obligation.capabilityId === "deep-research") {
        toolNames.add("exa");
        toolNames.add("firecrawl");
      }
      for (const r of matchingReceipts) {
        if (r.toolName) toolNames.add(r.toolName);
      }

      let isUnavailable = false;
      for (const t of toolNames) {
        if (current.mcpToolAvailability[t] === false) {
          isUnavailable = true;
          break;
        }
      }

      if (isUnavailable) {
        if (!changedFields.includes("mcpToolAvailability")) changedFields.push("mcpToolAvailability");
        if (!driftReasons.includes("mcp-tool-unavailable")) driftReasons.push("mcp-tool-unavailable");
      }
    }

    const hasDrift = changedFields.length > 0;

    for (const receipt of matchingReceipts) {
      if (hasDrift) {
        invalidatedReceiptIds.push(receipt.receiptId);
        if (!allInvalidatedReceipts.includes(receipt.receiptId)) {
          allInvalidatedReceipts.push(receipt.receiptId);
        }
      } else {
        reusableReceiptIds.push(receipt.receiptId);
        if (!allReusableReceipts.includes(receipt.receiptId)) {
          allReusableReceipts.push(receipt.receiptId);
        }
      }
    }

    let nextAction = "none";
    let nextActionKind: NextActionKind = "none";

    if (driftReasons.includes("manifest-changed") || driftReasons.includes("dependency-changed")) {
      nextAction = "re-plan project capabilities and re-approve pack plan";
      nextActionKind = "re-plan";
    } else if (driftReasons.includes("pack-not-current") || driftReasons.includes("pack-source-changed")) {
      nextAction = "sync project pack with exact digest approval";
      nextActionKind = "re-sync";
    } else if (driftReasons.includes("skill-source-changed")) {
      nextAction = "re-discover skills in fresh session and re-invoke";
      nextActionKind = "re-discover";
    } else if (driftReasons.includes("harness-version-changed") || driftReasons.includes("harness-executable-changed")) {
      nextAction = "re-probe harness version and re-discover capabilities";
      nextActionKind = "re-probe";
    } else if (driftReasons.includes("mcp-tool-unavailable")) {
      nextAction = "restore MCP tool availability or start server";
      nextActionKind = "restore-tool";
    } else if (driftReasons.includes("phase-mismatch") || driftReasons.includes("scope-mismatch")) {
      nextAction = "re-invoke capability for the current phase";
      nextActionKind = "re-invoke";
    }

    if (hasDrift) {
      if (!driftedCapabilities.includes(obligation.capabilityId)) {
        driftedCapabilities.push(obligation.capabilityId);
      }
    }

    entries.push({
      capabilityId: obligation.capabilityId,
      obligationId: obligation.id,
      drifted: hasDrift,
      changedFields: changedFields.sort(),
      driftReasons: driftReasons.sort(),
      invalidatedReceiptIds: invalidatedReceiptIds.sort(),
      reusableReceiptIds: reusableReceiptIds.sort(),
      nextAction,
      nextActionKind,
    });
  }

  // Reselect obligations if contract provided
  let reselectedObligations: readonly TaskCapabilityObligation[] = obligations;
  if (options.contract && current.phase) {
    reselectedObligations = selectStepObligations({
      contract: options.contract,
      step: current.phase as GsdStepKind,
      projectRoot: options.projectRoot ?? options.contract.scope.projectRoot ?? process.cwd(),
      priorReceipts: receipts,
    });
  }

  const hasDrift = driftedCapabilities.length > 0 || globalChangedFields.length > 0;
  const summary = hasDrift
    ? `Capability drift detected across ${driftedCapabilities.length} capabilities (${globalChangedFields.join(", ") || "phase/scope change"}). Prior proofs invalidated: ${allInvalidatedReceipts.length}.`
    : "No capability drift detected. Previous results remain valid for reuse.";

  return {
    hasDrift,
    driftedCapabilities: driftedCapabilities.sort(),
    invalidatedReceiptIds: allInvalidatedReceipts.sort(),
    reusableReceiptIds: allReusableReceipts.sort(),
    entries,
    reselectedObligations,
    summary,
  };
}

export type CapabilityRecoveryStatus = "recovered" | "alternate-ready" | "needs-input" | "blocked";

export interface CapabilityAlternateCandidate {
  readonly capabilityId: string;
  readonly harness: HarnessId | string;
  readonly roleChange: boolean;
  readonly harnessChange: boolean;
  readonly answersSameQuestion: boolean;
  readonly provenResult: boolean;
  readonly permissionChanges?: readonly string[];
  readonly costChanges?: string | null;
  readonly requiredContractDigest?: string | null;
}

export interface EvaluateRecoveryOptions {
  readonly failedObligation: TaskCapabilityObligation;
  readonly failedReceipt: TaskCapabilityReceipt;
  readonly retrySuccessful?: boolean | undefined;
  readonly availableAlternates?: readonly CapabilityAlternateCandidate[] | undefined;
  readonly currentContract?: TaskContract | undefined;
  readonly approvedContractDigest?: string | undefined;
  readonly userActionAvailable?: boolean | undefined;
  readonly userActionDescription?: string | undefined;
  readonly blockingReason?: string | undefined;
}

export interface CapabilityRecoveryResult {
  readonly status: CapabilityRecoveryStatus;
  readonly obligationId: string;
  readonly capabilityId: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly selectedAlternate: CapabilityAlternateCandidate | null;
  readonly precondition: TaskPrecondition;
  readonly requiresNewContractApproval: boolean;
  readonly proposedContractDigest: string | null;
}

/**
 * Implements capability recovery and fallback boundaries (CAP-04, D-10..D-13).
 * Prioritizes repairing current path; accepts equivalent alternates only with verified proof;
 * gates role/harness alterations behind new contract approval; and classifies into needs-input or blocked.
 */
export function evaluateCapabilityRecovery(options: EvaluateRecoveryOptions): CapabilityRecoveryResult {
  const { failedObligation, failedReceipt } = options;

  // D-10: 1. Attempt recovery of current path within approved permissions
  if (options.retrySuccessful) {
    return {
      status: "recovered",
      obligationId: failedObligation.id,
      capabilityId: failedObligation.capabilityId,
      reason: `Current capability path ${failedObligation.capabilityId} recovered and reverified on retry.`,
      nextAction: "proceed with execution",
      selectedAlternate: null,
      precondition: {
        id: "capability-recovery",
        satisfied: true,
        reason: `Capability ${failedObligation.capabilityId} recovered.`,
        nextAction: "none",
      },
      requiresNewContractApproval: false,
      proposedContractDigest: null,
    };
  }

  // D-10, D-12: 2. Evaluate equivalent alternative paths
  const alternates = options.availableAlternates ?? [];
  for (const alt of alternates) {
    // D-12: Must answer same question and have verified proof (provenResult), not merely installed or similar name
    if (!alt.answersSameQuestion || !alt.provenResult) {
      continue;
    }

    // D-11: Alternate requires harness or role change -> requires new contract approval
    if (alt.roleChange || alt.harnessChange) {
      const proposedDigest = createHash("sha256")
        .update(`alt:${alt.capabilityId}:${alt.harness}:${failedObligation.id}`, "utf8")
        .digest("hex");

      // Check if already approved with this exact new contract digest
      const isApproved = options.approvedContractDigest !== undefined && options.approvedContractDigest === proposedDigest;
      if (!isApproved) {
        return {
          status: "needs-input",
          obligationId: failedObligation.id,
          capabilityId: failedObligation.capabilityId,
          reason: `Equivalent alternate ${alt.capabilityId} requires changing harness/role to ${alt.harness} (permissions/cost changed). Contract re-approval required.`,
          nextAction: `approve contract with digest ${proposedDigest} to switch to ${alt.harness}`,
          selectedAlternate: alt,
          precondition: {
            id: "capability-recovery",
            satisfied: false,
            reason: `Alternate ${alt.capabilityId} requires contract re-approval for harness ${alt.harness}.`,
            nextAction: `approve contract with digest ${proposedDigest}`,
          },
          requiresNewContractApproval: true,
          proposedContractDigest: proposedDigest,
        };
      }

      return {
        status: "alternate-ready",
        obligationId: failedObligation.id,
        capabilityId: alt.capabilityId,
        reason: `Approved alternate ${alt.capabilityId} on harness ${alt.harness} ready for invocation.`,
        nextAction: "invoke approved alternate capability",
        selectedAlternate: alt,
        precondition: {
          id: "capability-recovery",
          satisfied: true,
          reason: `Approved alternate ${alt.capabilityId} selected.`,
          nextAction: "none",
        },
        requiresNewContractApproval: false,
        proposedContractDigest: proposedDigest,
      };
    }

    // Equivalent alternate within current role/harness
    return {
      status: "alternate-ready",
      obligationId: failedObligation.id,
      capabilityId: alt.capabilityId,
      reason: `Verified equivalent alternate ${alt.capabilityId} available on current harness.`,
      nextAction: "invoke equivalent alternate capability",
      selectedAlternate: alt,
      precondition: {
        id: "capability-recovery",
        satisfied: true,
        reason: `Equivalent alternate ${alt.capabilityId} ready.`,
        nextAction: "none",
      },
      requiresNewContractApproval: false,
      proposedContractDigest: null,
    };
  }

  // D-13: 3. If user action remains, pause at needs-input
  if (options.userActionAvailable) {
    const actionDesc = options.userActionDescription ?? "Configure required credential or fix local installation";
    return {
      status: "needs-input",
      obligationId: failedObligation.id,
      capabilityId: failedObligation.capabilityId,
      reason: `Capability ${failedObligation.capabilityId} failed (${failedReceipt.errorMessage ?? failedReceipt.outcome}). User action required: ${actionDesc}.`,
      nextAction: actionDesc,
      selectedAlternate: null,
      precondition: {
        id: "capability-recovery",
        satisfied: false,
        reason: `User action required for ${failedObligation.capabilityId}: ${actionDesc}`,
        nextAction: actionDesc,
      },
      requiresNewContractApproval: false,
      proposedContractDigest: null,
    };
  }

  // D-13: 4. No actionable path remains -> blocked
  const blockReason = options.blockingReason ?? `No viable recovery or equivalent alternate path for ${failedObligation.capabilityId}.`;
  return {
    status: "blocked",
    obligationId: failedObligation.id,
    capabilityId: failedObligation.capabilityId,
    reason: blockReason,
    nextAction: "halt task execution; resolve blocked dependency or adjust requirements",
    selectedAlternate: null,
    precondition: {
      id: "capability-recovery",
      satisfied: false,
      reason: blockReason,
      nextAction: "halt task execution",
    },
    requiresNewContractApproval: false,
    proposedContractDigest: null,
  };
}
