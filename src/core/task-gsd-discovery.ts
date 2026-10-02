import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { runGitRead } from "./task-gsd.js";

export interface PlanCompletionProof {
  readonly planId: string;
  readonly completed: boolean;
  readonly hasSummary: boolean;
  readonly hasStateRow: boolean;
  readonly hasGitCommit: boolean;
  readonly summaryPath?: string | undefined;
  readonly commitSha?: string | undefined;
}

export interface PhaseProgressionState {
  readonly phaseId: string;
  readonly completedPlans: readonly PlanCompletionProof[];
  readonly pendingPlans: readonly string[];
  readonly isPhaseComplete: boolean;
  readonly immutableContext: string | null;
}

async function resolvePhaseDirectory(projectRoot: string, phaseId: string): Promise<string | null> {
  const phasesRoot = join(projectRoot, ".planning", "phases");
  if (!existsSync(phasesRoot)) {
    return null;
  }
  const directPath = join(phasesRoot, phaseId);
  if (existsSync(directPath)) {
    return directPath;
  }
  try {
    const entries = await readdir(phasesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === phaseId || entry.name.startsWith(`${phaseId}-`)) {
          return join(phasesRoot, entry.name);
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function verifyPlanTripleCorrelation(options: {
  projectRoot: string;
  phaseId: string;
  planId: string;
  baseCommit?: string | undefined;
}): Promise<PlanCompletionProof> {
  const { projectRoot, phaseId, planId, baseCommit } = options;

  let hasSummary = false;
  let summaryPath: string | undefined;

  const phaseDir = await resolvePhaseDirectory(projectRoot, phaseId);
  if (phaseDir) {
    const normalizedPlanId = planId.replace(/^0+/, "") || "0";
    const paddedPlanId = planId.length === 1 ? `0${planId}` : planId;

    const candidates = [
      join(phaseDir, `${phaseId}-${paddedPlanId}-SUMMARY.md`),
      join(phaseDir, `${phaseId}-${normalizedPlanId}-SUMMARY.md`),
      join(phaseDir, `${paddedPlanId}-SUMMARY.md`),
      join(phaseDir, `${normalizedPlanId}-SUMMARY.md`),
    ];

    for (const cand of candidates) {
      if (existsSync(cand)) {
        try {
          const s = await stat(cand);
          if (s.isFile()) {
            hasSummary = true;
            summaryPath = cand;
            break;
          }
        } catch {}
      }
    }
  }

  let hasStateRow = false;
  try {
    const statePath = join(projectRoot, ".planning", "STATE.md");
    if (existsSync(statePath)) {
      const stateText = await readFile(statePath, "utf8");
      const normalizedPlanId = planId.replace(/^0+/, "") || "0";
      const paddedPlanId = planId.length === 1 ? `0${planId}` : planId;

      hasStateRow =
        stateText.includes(`| ${planId} |`) ||
        stateText.includes(`| ${paddedPlanId} |`) ||
        stateText.includes(`| ${normalizedPlanId} |`) ||
        stateText.includes(`${phaseId}-${planId}`) ||
        stateText.includes(`${phaseId}-${paddedPlanId}`) ||
        stateText.includes(`${phaseId}-${normalizedPlanId}`);
    }
  } catch {}

  let hasGitCommit = false;
  let commitSha: string | undefined;
  try {
    const logArgs = [
      "log",
      baseCommit ? `${baseCommit}..HEAD` : "HEAD",
      "--format=%H%x09%s",
    ];
    const logOutput = await runGitRead(projectRoot, logArgs);
    const lines = logOutput.split(/\r?\n/u).filter((l) => l.trim().length > 0);

    const normalizedPlanId = planId.replace(/^0+/, "") || "0";
    const paddedPlanId = planId.length === 1 ? `0${planId}` : planId;

    const prefixes = [
      `docs(${phaseId}-${paddedPlanId}):`,
      `docs(${phaseId}-${normalizedPlanId}):`,
      `docs(${phaseId}-${planId}):`,
    ];

    for (const line of lines) {
      const [sha, subject] = line.split("\t");
      if (!subject) continue;
      const trimmed = subject.trim();
      if (prefixes.some((prefix) => trimmed.startsWith(prefix))) {
        hasGitCommit = true;
        commitSha = sha;
        break;
      }
    }
  } catch {}

  const completed = hasSummary && hasStateRow && hasGitCommit;
  return {
    planId,
    completed,
    hasSummary,
    hasStateRow,
    hasGitCommit,
    summaryPath,
    commitSha,
  };
}

export async function discoverPhaseProgression(options: {
  projectRoot: string;
  phaseId: string;
  baseCommit?: string | undefined;
}): Promise<PhaseProgressionState> {
  const { projectRoot, phaseId, baseCommit } = options;
  const phaseDir = await resolvePhaseDirectory(projectRoot, phaseId);

  const completedPlans: PlanCompletionProof[] = [];
  const pendingPlans: string[] = [];
  let immutableContext: string | null = null;

  if (phaseDir && existsSync(phaseDir)) {
    try {
      const files = await readdir(phaseDir);
      const contextFile = files.find((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
      if (contextFile) {
        immutableContext = await readFile(join(phaseDir, contextFile), "utf8");
      }

      const planFiles = files
        .filter((f) => f.endsWith("-PLAN.md"))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      for (const planFile of planFiles) {
        const baseName = planFile.replace(/-PLAN\.md$/u, "");
        const parts = baseName.split("-");
        const extractedPlanId = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;

        const proof = await verifyPlanTripleCorrelation({
          projectRoot,
          phaseId,
          planId: extractedPlanId,
          baseCommit,
        });

        if (proof.completed) {
          completedPlans.push(proof);
        } else {
          pendingPlans.push(extractedPlanId);
        }
      }
    } catch {}
  }

  let isPhaseComplete = false;
  const declaredCount = completedPlans.length + pendingPlans.length;
  if (declaredCount > 0 && pendingPlans.length === 0) {
    try {
      const statePath = join(projectRoot, ".planning", "STATE.md");
      if (existsSync(statePath)) {
        const stateText = await readFile(statePath, "utf8");
        const lowerState = stateText.toLowerCase();
        if (
          lowerState.includes(`phase: ${phaseId}`) &&
          (lowerState.includes("complete") || lowerState.includes("verified"))
        ) {
          isPhaseComplete = true;
        } else if (
          lowerState.includes(`phase ${phaseId}: complete`) ||
          lowerState.includes(`phase ${phaseId} completed`) ||
          (lowerState.includes(`current_phase: ${phaseId}`) && lowerState.includes("status: complete"))
        ) {
          isPhaseComplete = true;
        }
      }
    } catch {}
  }

  return {
    phaseId,
    completedPlans,
    pendingPlans,
    isPhaseComplete,
    immutableContext,
  };
}

export function selectNextPendingPlan(progression: PhaseProgressionState): string | null {
  if (progression.pendingPlans.length === 0) {
    return null;
  }
  return progression.pendingPlans[0] ?? null;
}

export async function readImmutablePlanDecisions(options: {
  projectRoot: string;
  phaseId: string;
  planId: string;
}): Promise<{
  contextLocked: boolean;
  planLocked: boolean;
  lockedDecisions: readonly string[];
}> {
  const { projectRoot, phaseId, planId } = options;
  const phaseDir = await resolvePhaseDirectory(projectRoot, phaseId);

  let contextLocked = false;
  let planLocked = false;
  const lockedDecisions: string[] = [];

  if (phaseDir && existsSync(phaseDir)) {
    try {
      const files = await readdir(phaseDir);

      const contextFile = files.find((f) => f.endsWith("-CONTEXT.md") || f === "CONTEXT.md");
      if (contextFile) {
        const contextText = await readFile(join(phaseDir, contextFile), "utf8");
        contextLocked = true;
        const decisionsMatch = contextText.match(/<decisions>([\s\S]*?)<\/decisions>/u);
        const sourceText = decisionsMatch ? decisionsMatch[1]! : contextText;
        const decisionLines = sourceText
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter((line) => line.startsWith("- **D-") || line.startsWith("- D-") || line.startsWith("* **D-"));
        lockedDecisions.push(...decisionLines);
      }

      const normalizedPlanId = planId.replace(/^0+/, "") || "0";
      const paddedPlanId = planId.length === 1 ? `0${planId}` : planId;
      const planFile = files.find(
        (f) =>
          f === `${phaseId}-${paddedPlanId}-PLAN.md` ||
          f === `${phaseId}-${normalizedPlanId}-PLAN.md` ||
          f === `${paddedPlanId}-PLAN.md` ||
          f === `${normalizedPlanId}-PLAN.md`,
      );

      if (planFile) {
        const planText = await readFile(join(phaseDir, planFile), "utf8");
        planLocked = true;
        const mustHavesMatch = planText.match(/<must_haves>([\s\S]*?)<\/must_haves>/u);
        if (mustHavesMatch) {
          const mustHavesLines = mustHavesMatch[1]!
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("- \"") || line.startsWith("- '") || line.startsWith("-"));
          lockedDecisions.push(...mustHavesLines);
        }
      }
    } catch {}
  }

  return {
    contextLocked,
    planLocked,
    lockedDecisions,
  };
}
