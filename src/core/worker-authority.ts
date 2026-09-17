import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { GsdRole, HarnessId } from "../types.js";
import {
  comparePlanningTrees,
  hashPlanningTree,
  type PlanningTreeDifference,
  type PlanningTreeDigest,
} from "./canary.js";

// ---------------------------------------------------------------------------
// Worker Authority Error Class (GATE-05, D-10, D-11)
// ---------------------------------------------------------------------------

export class WorkerAuthorityError extends Error {
  readonly code: "unauthorized-controller" | "planning-mutation-detected" | "unauthorized-worker-instruction";
  readonly harnessId: string;
  readonly offendingPaths?: readonly string[] | undefined;

  constructor(
    code: "unauthorized-controller" | "planning-mutation-detected" | "unauthorized-worker-instruction",
    harnessId: string,
    message: string,
    offendingPaths?: readonly string[] | undefined
  ) {
    super(message);
    this.name = "WorkerAuthorityError";
    this.code = code;
    this.harnessId = harnessId;
    this.offendingPaths = offendingPaths;
  }
}

// ---------------------------------------------------------------------------
// Worker Delegation Witness Interface (D-11)
// ---------------------------------------------------------------------------

export interface WorkerDelegationWitness {
  readonly harnessId: string;
  readonly role: "worker";
  readonly planningRoot: string;
  readonly immutable: boolean;
  readonly beforeDigest: string | null;
  readonly afterDigest: string | null;
  readonly modifiedPaths: readonly string[];
}

export interface PlanningTreeSnapshot {
  readonly digest: PlanningTreeDigest;
  readonly files: Map<string, Uint8Array>;
}

// ---------------------------------------------------------------------------
// Controller Role Guard & Role Resolver (D-10)
// ---------------------------------------------------------------------------

export function assertControllerRole(harnessId: HarnessId): void {
  if (harnessId === "hermes") {
    throw new WorkerAuthorityError(
      "unauthorized-controller",
      "hermes",
      "Hermes is structurally prohibited from acting as a GSD state controller (D-10)"
    );
  }
}

export function resolveHarnessRole(
  initiatorHarness: HarnessId,
  targetHarness: HarnessId
): GsdRole {
  if (targetHarness === "hermes") {
    return "worker";
  }
  return targetHarness === initiatorHarness ? "controller" : "worker";
}

// ---------------------------------------------------------------------------
// Launch Spec Sanitization (D-11)
// ---------------------------------------------------------------------------

const CONTROLLER_WORKFLOW_PATTERNS = [
  /execute-phase/i,
  /execute-plan/i,
  /verify-work/i,
  /summary\.md/i,
  /roadmap\.md/i,
  /state\.md/i,
];

export function sanitizeWorkerLaunchSpec(
  spec: {
    instructions?: string[] | undefined;
    env?: Record<string, string> | undefined;
    prompt?: string | undefined;
  },
  role: GsdRole
): {
  instructions: string[];
  env: Record<string, string>;
  prompt?: string | undefined;
} {
  if (role === "controller") {
    return {
      instructions: [...(spec.instructions ?? [])],
      env: { ...(spec.env ?? {}) },
      ...(spec.prompt !== undefined ? { prompt: spec.prompt } : {}),
    };
  }

  // Sanitize for worker role: strip orchestrator workflows
  const instructions = (spec.instructions ?? []).filter(
    (inst) => !CONTROLLER_WORKFLOW_PATTERNS.some((pattern) => pattern.test(inst))
  );

  const env: Record<string, string> = {
    ...(spec.env ?? {}),
    ALPHA_AOS_GSD_ROLE: "worker",
  };

  const workerNotice =
    "\nYou are operating in WORKER role. You MUST NOT modify any files in the .planning/ directory or perform GSD lifecycle state transitions.";
  const prompt = (spec.prompt ?? "") + workerNotice;

  return {
    instructions,
    env,
    prompt,
  };
}

// ---------------------------------------------------------------------------
// Planning Tree Snapshotting and Restoring Engine (D-11)
// ---------------------------------------------------------------------------

export async function snapshotPlanningTree(
  planningRoot: string
): Promise<PlanningTreeSnapshot> {
  const digest = await hashPlanningTree(planningRoot);
  const files = new Map<string, Uint8Array>();

  for (const entry of digest.files) {
    const fullPath = join(planningRoot, entry.path);
    try {
      const content = await readFile(fullPath);
      files.set(entry.path, content);
    } catch {
      // Unreadable or disappeared files are omitted
    }
  }

  return { digest, files };
}

export async function restorePlanningTreeSnapshot(
  planningRoot: string,
  snapshot: PlanningTreeSnapshot,
  diff: PlanningTreeDifference
): Promise<void> {
  // 1. Remove added files
  for (const relPath of diff.added) {
    const fullPath = join(planningRoot, relPath);
    try {
      await rm(fullPath, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }

  // 2. Restore modified files
  for (const relPath of diff.modified) {
    const originalBytes = snapshot.files.get(relPath);
    if (originalBytes !== undefined) {
      const fullPath = join(planningRoot, relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, originalBytes);
    }
  }

  // 3. Restore removed files
  for (const relPath of diff.removed) {
    const originalBytes = snapshot.files.get(relPath);
    if (originalBytes !== undefined) {
      const fullPath = join(planningRoot, relPath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, originalBytes);
    }
  }
}

// ---------------------------------------------------------------------------
// Cryptographic Planning Immutability Witness (GATE-05, D-11)
// ---------------------------------------------------------------------------

export async function witnessWorkerDelegation<T>(params: {
  projectRoot: string;
  harnessId: HarnessId;
  role: GsdRole;
  action: () => Promise<T>;
}): Promise<{ result: T; witness: WorkerDelegationWitness }> {
  const planningRoot = join(params.projectRoot, ".planning");

  if (params.role === "controller") {
    const result = await params.action();
    return {
      result,
      witness: {
        harnessId: params.harnessId,
        role: "worker",
        planningRoot,
        immutable: true,
        beforeDigest: null,
        afterDigest: null,
        modifiedPaths: [],
      },
    };
  }

  const preSnapshot = await snapshotPlanningTree(planningRoot);

  let result: T;
  try {
    result = await params.action();
  } catch (error) {
    // Check if failure touched .planning/ and restore immediately
    const errDigest = await hashPlanningTree(planningRoot);
    const errDiff = comparePlanningTrees(preSnapshot.digest, errDigest);
    if (!errDiff.equal) {
      await restorePlanningTreeSnapshot(planningRoot, preSnapshot, errDiff);
    }
    throw error;
  }

  const postDigest = await hashPlanningTree(planningRoot);
  const diff = comparePlanningTrees(preSnapshot.digest, postDigest);

  if (!diff.equal) {
    // Unauthorized worker mutation detected: rollback immediately
    await restorePlanningTreeSnapshot(planningRoot, preSnapshot, diff);
    const offendingPaths = [...diff.modified, ...diff.added, ...diff.removed];
    throw new WorkerAuthorityError(
      "planning-mutation-detected",
      params.harnessId,
      `Unauthorized .planning/ mutation by worker harness ${params.harnessId}. Rolled back.`,
      offendingPaths
    );
  }

  return {
    result,
    witness: {
      harnessId: params.harnessId,
      role: "worker",
      planningRoot,
      immutable: true,
      beforeDigest: preSnapshot.digest.digest,
      afterDigest: postDigest.digest,
      modifiedPaths: [],
    },
  };
}
