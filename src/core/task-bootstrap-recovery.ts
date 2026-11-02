import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { GsdProjectReadiness } from "./task-gsd-readiness.js";

const ONE_MIB = 1024 * 1024;

export type NativeRecoveryRoute =
  | "resume-new-project"
  | "new-milestone"
  | "reconstruct-state"
  | "blocked";

export interface NativeBootstrapRecoveryPlan {
  readonly route: NativeRecoveryRoute;
  readonly status: "resumable" | "blocked";
  readonly completedSteps: readonly string[];
  readonly firstMissingStep: string | null;
  readonly remainingSteps: readonly string[];
  readonly nativeAction: string;
  readonly reasons: readonly string[];
  readonly artifactCheckpoints: readonly string[];
  readonly preservedArtifacts: readonly string[];
}

export interface VerifyNativeRecoveryOptions {
  readonly projectRoot: string;
  readonly beforeSnapshot: Record<string, string>;
  readonly allowedGeneratedArtifacts: readonly string[];
}

export class TaskBootstrapRecoveryError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly causeDescription: string;
  readonly remediation: string;

  constructor(options: { code: string; path?: string; cause: string; remediation: string }) {
    super(`${options.code}: ${options.cause}`);
    this.name = "TaskBootstrapRecoveryError";
    this.code = options.code;
    this.path = options.path;
    this.causeDescription = options.cause;
    this.remediation = options.remediation;
  }
}

async function readBoundedFile(path: string): Promise<string> {
  const info = await lstat(path);
  if (!info.isFile()) throw new Error("not a regular file");
  if (info.size > ONE_MIB) throw new Error("file exceeds 1 MiB");
  const buf = await readFile(path);
  return new TextDecoder("utf-8", { fatal: true }).decode(buf);
}

async function hasSubstantialGsdHistory(projectRoot: string): Promise<boolean> {
  const planningDir = join(projectRoot, ".planning");
  if (!existsSync(planningDir)) return false;

  const milestonesDir = join(planningDir, "milestones");
  if (existsSync(milestonesDir)) {
    try {
      const entries = await readdir(milestonesDir);
      if (entries.length > 0) return true;
    } catch {
      // ignore
    }
  }

  const phasesDir = join(planningDir, "phases");
  if (existsSync(phasesDir)) {
    try {
      const entries = await readdir(phasesDir);
      if (entries.length > 0) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export async function planNativeBootstrapRecovery(options: {
  canonicalRoot: string;
  readiness: GsdProjectReadiness;
}): Promise<NativeBootstrapRecoveryPlan> {
  const { canonicalRoot, readiness } = options;
  const planningDir = join(canonicalRoot, ".planning");

  if (!existsSync(planningDir)) {
    return {
      route: "blocked",
      status: "blocked",
      completedSteps: [],
      firstMissingStep: ".planning directory",
      remainingSteps: ["init.new-project"],
      nativeAction: "Initialize project with gsd-new-project.",
      reasons: ["No .planning directory exists in the canonical project root."],
      artifactCheckpoints: [],
      preservedArtifacts: [],
    };
  }

  const projectPath = join(planningDir, "PROJECT.md");
  const requirementsPath = join(planningDir, "REQUIREMENTS.md");
  const roadmapPath = join(planningDir, "ROADMAP.md");
  const statePath = join(planningDir, "STATE.md");
  const milestonesPath = join(planningDir, "MILESTONES.md");

  // Validate existing files for corruption/unreadable bytes
  const preservedArtifacts: string[] = [];
  const filesToCheck = [
    { name: "PROJECT.md", path: projectPath },
    { name: "REQUIREMENTS.md", path: requirementsPath },
    { name: "ROADMAP.md", path: roadmapPath },
    { name: "STATE.md", path: statePath },
    { name: "MILESTONES.md", path: milestonesPath },
  ];

  for (const item of filesToCheck) {
    if (existsSync(item.path)) {
      try {
        const text = await readBoundedFile(item.path);
        if (text.trim().length === 0) {
          return {
            route: "blocked",
            status: "blocked",
            completedSteps: preservedArtifacts,
            firstMissingStep: item.name,
            remainingSteps: [],
            nativeAction: `Inspect and repair empty file ${item.name}.`,
            reasons: [`Planning file ${item.name} exists but is empty (corrupt artifact).`],
            artifactCheckpoints: [],
            preservedArtifacts,
          };
        }
        preservedArtifacts.push(item.name);
      } catch (err) {
        return {
          route: "blocked",
          status: "blocked",
          completedSteps: preservedArtifacts,
          firstMissingStep: item.name,
          remainingSteps: [],
          nativeAction: `Fix file permissions or repair ${item.name}.`,
          reasons: [`Planning file ${item.name} could not be safely read (${err instanceof Error ? err.message : "unknown"}).`],
          artifactCheckpoints: [],
          preservedArtifacts,
        };
      }
    }
  }

  const projectExists = existsSync(projectPath);
  const requirementsExists = existsSync(requirementsPath);
  const roadmapExists = existsSync(roadmapPath);
  const stateExists = existsSync(statePath);
  const milestonesExists = existsSync(milestonesPath);

  const nativeResume = readiness.nativeEvidence ?? {};
  const isInitIncomplete = nativeResume.init_incomplete === true;
  const milestonesReported = nativeResume.milestones_exists === true || milestonesExists;

  // Check unsupported controller or missing runtime first
  if (readiness.diagnosis === "unsupported") {
    return {
      route: "blocked",
      status: "blocked",
      completedSteps: preservedArtifacts,
      firstMissingStep: null,
      remainingSteps: [],
      nativeAction: "Use a supported controller (Claude Code, Codex, Antigravity, or Pi).",
      reasons: readiness.reasons,
      artifactCheckpoints: [],
      preservedArtifacts,
    };
  }

  if (readiness.diagnosis === "missing-runtime") {
    return {
      route: "blocked",
      status: "blocked",
      completedSteps: preservedArtifacts,
      firstMissingStep: "gsd-tools",
      remainingSteps: [],
      nativeAction: readiness.nextAction,
      reasons: readiness.reasons,
      artifactCheckpoints: [],
      preservedArtifacts,
    };
  }

  // Case 1: Inconsistent partial planning where .planning exists but PROJECT.md is absent
  if (!projectExists) {
    return {
      route: "blocked",
      status: "blocked",
      completedSteps: [],
      firstMissingStep: "PROJECT.md",
      remainingSteps: ["new-project"],
      nativeAction: "Initialize project afresh with gsd-new-project or restore PROJECT.md manually.",
      reasons: [
        "Inconsistent partial planning directory: .planning exists but PROJECT.md is absent. Installed GSD resume-project does not support headless recovery without PROJECT.md.",
      ],
      artifactCheckpoints: [],
      preservedArtifacts,
    };
  }

  // Case 2: Native init_incomplete === true (Interrupted native bootstrap)
  if (isInitIncomplete) {
    const completedSteps: string[] = ["PROJECT.md (context and configuration)"];
    if (requirementsExists) {
      completedSteps.push("REQUIREMENTS.md");
      return {
        route: "resume-new-project",
        status: "resumable",
        completedSteps,
        firstMissingStep: "ROADMAP.md",
        remainingSteps: ["ROADMAP.md", "STATE.md"],
        nativeAction: "gsd-new-project (resume at ROADMAP/STATE generation stage)",
        reasons: [
          "GSD reports init_incomplete: true with PROJECT.md and REQUIREMENTS.md present.",
          "Existing REQUIREMENTS.md skips regeneration; next native stage is ROADMAP and STATE generation.",
        ],
        artifactCheckpoints: ["REQUIREMENTS.md"],
        preservedArtifacts,
      };
    }

    return {
      route: "resume-new-project",
      status: "resumable",
      completedSteps,
      firstMissingStep: "REQUIREMENTS.md",
      remainingSteps: ["REQUIREMENTS.md", "ROADMAP.md", "STATE.md"],
      nativeAction: "gsd-new-project (resume at REQUIREMENTS generation stage)",
      reasons: [
        "GSD reports init_incomplete: true with PROJECT.md present but REQUIREMENTS.md missing.",
        "Existing PROJECT.md and config are preserved; next native stage is REQUIREMENTS generation.",
      ],
      artifactCheckpoints: ["PROJECT.md"],
      preservedArtifacts,
    };
  }

  // Case 3: Milestones archive present but active roadmap/state missing (between-milestones)
  if (milestonesReported && (!roadmapExists || !stateExists)) {
    return {
      route: "new-milestone",
      status: "resumable",
      completedSteps: ["archived-milestones", "PROJECT.md"],
      firstMissingStep: !roadmapExists ? "ROADMAP.md" : "STATE.md",
      remainingSteps: ["new-milestone"],
      nativeAction: "gsd-new-milestone or gsd-progress",
      reasons: [
        "Milestones archive exists but active roadmap/state are missing (between-milestones state); route to native gsd-new-milestone.",
      ],
      artifactCheckpoints: ["MILESTONES.md"],
      preservedArtifacts,
    };
  }

  // Case 4: STATE.md missing but project has historical phase artifacts
  if (!stateExists && projectExists) {
    const hasHistory = await hasSubstantialGsdHistory(canonicalRoot);
    if (hasHistory) {
      return {
        route: "reconstruct-state",
        status: "resumable",
        completedSteps: ["historical-phases", "PROJECT.md"],
        firstMissingStep: "STATE.md",
        remainingSteps: ["reconstruct-state"],
        nativeAction: "gsd-resume-project (reconstruct STATE.md from phase and roadmap history)",
        reasons: [
          "STATE.md is missing but valid historical phase artifacts exist.",
          "Route to native resume-project reconstruction with checkpoints.",
        ],
        artifactCheckpoints: ["ROADMAP.md"],
        preservedArtifacts,
      };
    }

    // STATE.md missing and NO history exists (unrecoverable without new-project)
    return {
      route: "blocked",
      status: "blocked",
      completedSteps: ["PROJECT.md"],
      firstMissingStep: "STATE.md",
      remainingSteps: [],
      nativeAction: "Restart initialization with gsd-new-project.",
      reasons: [
        "STATE.md is missing and no historical phase artifacts exist; history-backed reconstruction is not possible.",
      ],
      artifactCheckpoints: [],
      preservedArtifacts,
    };
  }

  // If all files exist, no recovery is needed
  return {
    route: "resume-new-project",
    status: "resumable",
    completedSteps: ["PROJECT.md", "REQUIREMENTS.md", "ROADMAP.md", "STATE.md"],
    firstMissingStep: null,
    remainingSteps: [],
    nativeAction: "No recovery needed; proceed with requested workflow.",
    reasons: ["All core planning artifacts are verified present."],
    artifactCheckpoints: ["STATE.md"],
    preservedArtifacts,
  };
}

export async function snapshotPlanningArtifacts(
  projectRoot: string,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const planningDir = join(projectRoot, ".planning");
  if (!existsSync(planningDir)) return result;

  async function walk(dir: string, relPrefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relPath = join(relPrefix, entry.name).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        await walk(fullPath, relPath);
      } else if (entry.isFile()) {
        const bytes = await readFile(fullPath);
        result[relPath] = createHash("sha256").update(bytes).digest("hex");
      }
    }
  }

  await walk(planningDir, "");
  return result;
}

export async function verifyNativeBootstrapRecovery(
  options: VerifyNativeRecoveryOptions,
): Promise<{
  readonly verified: boolean;
  readonly modifiedOrCreated: readonly string[];
  readonly preserved: readonly string[];
  readonly violated: readonly string[];
}> {
  const { projectRoot, beforeSnapshot, allowedGeneratedArtifacts } = options;
  const currentSnapshot = await snapshotPlanningArtifacts(projectRoot);

  const modifiedOrCreated: string[] = [];
  const preserved: string[] = [];
  const violated: string[] = [];

  for (const [path, beforeHash] of Object.entries(beforeSnapshot)) {
    const currentHash = currentSnapshot[path];
    if (currentHash === undefined) {
      violated.push(`Deleted: ${path}`);
    } else if (currentHash === beforeHash) {
      preserved.push(path);
    } else {
      if (allowedGeneratedArtifacts.includes(path)) {
        modifiedOrCreated.push(path);
      } else {
        violated.push(`Unexpected modification: ${path}`);
      }
    }
  }

  for (const path of Object.keys(currentSnapshot)) {
    if (beforeSnapshot[path] === undefined) {
      if (allowedGeneratedArtifacts.includes(path)) {
        modifiedOrCreated.push(path);
      } else {
        violated.push(`Unexpected new file: ${path}`);
      }
    }
  }

  return {
    verified: violated.length === 0,
    modifiedOrCreated,
    preserved,
    violated,
  };
}
