import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type { TaskContract, TaskPhaseSelection } from "./task-contract.js";
import { runGitRead } from "./task-gsd.js";
import { parsePhasesFromRoadmap } from "./task-gsd-lifecycle.js";

export type ResolvedPhaseSelection =
  | {
      readonly status: "ok";
      readonly phaseSelection: TaskPhaseSelection;
      readonly candidatePhases: readonly string[];
      readonly source: "contract" | "derived-baseline";
    }
  | {
      readonly status: "blocked";
      readonly code:
        | "scope-binding-required"
        | "scope-unauthorized-phase"
        | "scope-reorder-rejected"
        | "scope-baseline-missing"
        | "scope-roadmap-mismatch";
      readonly reason: string;
    };

export interface ResolveApprovedPhaseSelectionOptions {
  readonly contract: TaskContract;
  readonly projectRoot: string;
  readonly baseCommit?: string | null | undefined;
  readonly requestedPhases?: readonly string[] | undefined;
}

/**
 * Resolves the approved ordered phase selection and candidate phase sequence.
 * Enforces decisions D-17, D-20 and T-30-11:
 * - Explicit contract scope.phaseSelection is authoritative.
 * - Legacy contracts derive an exact selection from their approved git baseline.
 * - Without a trustworthy baseline, legacy contracts fail closed with scope-binding-required.
 * - Requested subset must preserve approved relative order and contain no unapproved phases.
 */
export async function resolveApprovedPhaseSelection(
  options: ResolveApprovedPhaseSelectionOptions,
): Promise<ResolvedPhaseSelection> {
  const { contract, projectRoot, baseCommit, requestedPhases } = options;

  if (contract.scope.phaseSelection !== undefined) {
    const approvedSelection = contract.scope.phaseSelection;
    const approvedIds = approvedSelection.phaseIds;

    if (requestedPhases !== undefined && requestedPhases.length > 0) {
      for (const phaseId of requestedPhases) {
        if (!approvedIds.includes(phaseId)) {
          return {
            status: "blocked",
            code: "scope-unauthorized-phase",
            reason: `Requested phase "${phaseId}" is not in the approved phase selection [${approvedIds.join(", ")}]. Scope changes require a new contract revision and re-approval.`,
          };
        }
      }
      const requestedIndices = requestedPhases.map((id) => approvedIds.indexOf(id));
      for (let i = 1; i < requestedIndices.length; i++) {
        if (requestedIndices[i]! <= requestedIndices[i - 1]!) {
          return {
            status: "blocked",
            code: "scope-reorder-rejected",
            reason: `Requested phases [${requestedPhases.join(", ")}] violate the approved order [${approvedIds.join(", ")}].`,
          };
        }
      }
      return {
        status: "ok",
        phaseSelection: approvedSelection,
        candidatePhases: requestedPhases,
        source: "contract",
      };
    }

    return {
      status: "ok",
      phaseSelection: approvedSelection,
      candidatePhases: [...approvedIds],
      source: "contract",
    };
  }

  // Legacy approval without metadata: derive from git baseline ROADMAP.md
  if (!baseCommit) {
    return {
      status: "blocked",
      code: "scope-binding-required",
      reason: "Legacy contract has no phaseSelection and no trustworthy git base commit exists to derive approved roadmap scope. Explicit preview and approval with phaseSelection is required.",
    };
  }

  let baselineRoadmapText: string;
  try {
    baselineRoadmapText = await runGitRead(projectRoot, ["show", `${baseCommit}:.planning/ROADMAP.md`]);
  } catch (error) {
    return {
      status: "blocked",
      code: "scope-baseline-missing",
      reason: `Cannot read .planning/ROADMAP.md at approved base commit ${baseCommit.slice(0, 8)}: ${error instanceof Error ? error.message : String(error)}. Explicit phaseSelection approval is required.`,
    };
  }

  const baselinePhases = parsePhasesFromRoadmap(baselineRoadmapText);
  if (baselinePhases.length === 0) {
    return {
      status: "blocked",
      code: "scope-binding-required",
      reason: `Approved baseline .planning/ROADMAP.md at ${baseCommit.slice(0, 8)} defines no roadmap phases. Explicit phaseSelection preview and approval is required.`,
    };
  }

  const baselineRoadmapSha256 = createHash("sha256").update(baselineRoadmapText).digest("hex");
  const derivedSelection: TaskPhaseSelection = {
    phaseIds: baselinePhases,
    roadmapSha256: baselineRoadmapSha256,
  };

  if (requestedPhases !== undefined && requestedPhases.length > 0) {
    for (const phaseId of requestedPhases) {
      if (!baselinePhases.includes(phaseId)) {
        return {
          status: "blocked",
          code: "scope-unauthorized-phase",
          reason: `Requested phase "${phaseId}" is not in the derived baseline phase selection [${baselinePhases.join(", ")}]. Scope changes require a new contract revision and re-approval.`,
        };
      }
    }
    const requestedIndices = requestedPhases.map((id) => baselinePhases.indexOf(id));
    for (let i = 1; i < requestedIndices.length; i++) {
      if (requestedIndices[i]! <= requestedIndices[i - 1]!) {
        return {
          status: "blocked",
          code: "scope-reorder-rejected",
          reason: `Requested phases [${requestedPhases.join(", ")}] violate the baseline phase order [${baselinePhases.join(", ")}].`,
        };
      }
    }
    return {
      status: "ok",
      phaseSelection: derivedSelection,
      candidatePhases: requestedPhases,
      source: "derived-baseline",
    };
  }

  return {
    status: "ok",
    phaseSelection: derivedSelection,
    candidatePhases: baselinePhases,
    source: "derived-baseline",
  };
}

export interface VerifyPhaseScopeBoundaryOptions {
  readonly phaseId: string;
  readonly approvedSelection: TaskPhaseSelection;
  readonly projectRoot: string;
}

/**
 * Rechecks selection membership and detects unauthorized scope expansion at lifecycle boundaries.
 * Distinguishes native GSD progress edits from scope edits.
 */
export async function verifyPhaseScopeBoundary(
  options: VerifyPhaseScopeBoundaryOptions,
): Promise<{ allowed: boolean; reason?: string }> {
  const { phaseId, approvedSelection, projectRoot } = options;

  if (!approvedSelection.phaseIds.includes(phaseId)) {
    return {
      allowed: false,
      reason: `Phase "${phaseId}" is not in approved phase selection [${approvedSelection.phaseIds.join(", ")}]. Execution blocked.`,
    };
  }

  const roadmapPath = join(projectRoot, ".planning", "ROADMAP.md");
  if (existsSync(roadmapPath)) {
    let currentRoadmapText: string;
    try {
      currentRoadmapText = await readFile(roadmapPath, "utf8");
    } catch {
      return { allowed: false, reason: "Failed to read live .planning/ROADMAP.md at phase boundary." };
    }
    const currentPhases = parsePhasesFromRoadmap(currentRoadmapText);
    for (const pid of currentPhases) {
      if (!approvedSelection.phaseIds.includes(pid)) {
        return {
          allowed: false,
          reason: `Live ROADMAP.md contains unauthorized phase "${pid}" not present in approved selection [${approvedSelection.phaseIds.join(", ")}]. Live discovery cannot authorize an added phase (D-17, T-30-11).`,
        };
      }
    }
  }

  return { allowed: true };
}
