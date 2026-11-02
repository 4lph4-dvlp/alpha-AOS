import { lstat, readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, relative, dirname } from "node:path";
import { provePathBoundary } from "./path-boundary.js";
import { runGitRead } from "./task-gsd.js";
import type {
  TaskFactItem,
  TaskExecutionStyle,
} from "./task-intake.js";

export const MAX_SCOPED_PATHS = 16;
export const MAX_INSPECTED_TEXT_BYTES = 64 * 1024; // 64 KiB

export interface TaskIntakeOperationInput {
  readonly type?: string | undefined;
  readonly target?: string | undefined;
  readonly result?: string | undefined;
  readonly boundedImpact?: boolean | undefined;
  readonly remote?: string | undefined;
  readonly branch?: string | undefined;
  readonly localRef?: string | undefined;
  readonly force?: boolean | undefined;
  readonly delete?: boolean | undefined;
  readonly mirror?: boolean | undefined;
  readonly historyRewrite?: boolean | undefined;
  readonly conflictResolution?: boolean | undefined;
  readonly oldPath?: string | undefined;
  readonly newPath?: string | undefined;
  readonly unchangedApiMeaning?: boolean | undefined;
  readonly sourcePath?: string | undefined;
  readonly targetLink?: string | undefined;
  readonly scopedPaths?: readonly string[] | undefined;
  readonly faithful?: boolean | undefined;
  readonly redesign?: boolean | undefined;
  readonly newFeatureScope?: boolean | undefined;
}

export interface TaskIntakeScopeChangeInput {
  readonly previousOperationId?: string | undefined;
  readonly expandedScope?: boolean | undefined;
  readonly requiresInvestigation?: boolean | undefined;
  readonly wipBytesPreserved?: boolean | undefined;
  readonly isTaskRepair?: boolean | undefined;
  readonly reason?: string | undefined;
}

export interface TaskIntakeEvidenceOptions {
  readonly canonicalRoot: string;
  readonly requestText: string;
  readonly shortGoal?: string | undefined;
  readonly shortScope?: string | undefined;
  readonly operation?: TaskIntakeOperationInput | undefined;
  readonly scopeChange?: TaskIntakeScopeChangeInput | undefined;
  readonly currentTask?: {
    readonly taskId?: string | undefined;
    readonly runId?: string | undefined;
    readonly contractDigest?: string | undefined;
    readonly revision?: number | undefined;
    readonly selectedStyle?: string | undefined;
    readonly artifactPath?: string | undefined;
    readonly relationship?: string | undefined;
  } | undefined;
  readonly facts?: readonly TaskFactItem[] | undefined;
}

export type TaskIntakeEvidenceOutcome =
  | {
      readonly status: "eligible";
      readonly operationType: "push" | "rename" | "readme-translation" | "readme-link";
      readonly reasons: readonly string[];
      readonly observations: readonly string[];
      readonly facts: readonly TaskFactItem[];
    }
  | {
      readonly status: "clarification-needed";
      readonly question: string;
      readonly missingFacts: readonly string[];
      readonly reasons: readonly string[];
      readonly observations: readonly string[];
      readonly facts: readonly TaskFactItem[];
    }
  | {
      readonly status: "substantial-work";
      readonly reasons: readonly string[];
      readonly observations: readonly string[];
      readonly facts: readonly TaskFactItem[];
    }
  | {
      readonly status: "scope-expansion";
      readonly isTaskRepair: boolean;
      readonly retainedStyle?: TaskExecutionStyle | undefined;
      readonly taskReference?: string | undefined;
      readonly reasons: readonly string[];
      readonly observations: readonly string[];
      readonly facts: readonly TaskFactItem[];
    }
  | {
      readonly status: "none";
      readonly facts: readonly TaskFactItem[];
    };

/**
 * Normalizes a relative or absolute path against canonicalRoot and verifies containment.
 */
async function verifyRootPath(
  pathCandidate: string,
  canonicalRoot: string,
): Promise<{ absolutePath: string; ok: boolean; reason?: string }> {
  const normPath = isAbsolute(pathCandidate)
    ? resolve(pathCandidate)
    : resolve(canonicalRoot, pathCandidate);

  try {
    const proof = await provePathBoundary({
      path: normPath,
      allowedRoots: [canonicalRoot],
      role: "target",
    });
    if (!proof.proven || proof.code !== "ok") {
      return {
        absolutePath: normPath,
        ok: false,
        reason: proof.detail ?? `Path is outside canonical root: ${pathCandidate}`,
      };
    }
    return { absolutePath: normPath, ok: true };
  } catch (err: unknown) {
    return {
      absolutePath: normPath,
      ok: false,
      reason: err instanceof Error ? err.message : "Path proof failed",
    };
  }
}

/**
 * Checks bounded text inspection budget for a list of paths.
 */
async function inspectScopedFiles(
  scopedPaths: readonly string[],
  canonicalRoot: string,
): Promise<{
  inspectedBytes: number;
  fileCount: number;
  exceededCount: boolean;
  exceededBytes: boolean;
  missingPath?: string | undefined;
}> {
  if (scopedPaths.length > MAX_SCOPED_PATHS) {
    return {
      inspectedBytes: 0,
      fileCount: scopedPaths.length,
      exceededCount: true,
      exceededBytes: false,
    };
  }

  let totalBytes = 0;
  for (const p of scopedPaths) {
    const verified = await verifyRootPath(p, canonicalRoot);
    if (!verified.ok) {
      return {
        inspectedBytes: totalBytes,
        fileCount: scopedPaths.length,
        exceededCount: false,
        exceededBytes: false,
        missingPath: p,
      };
    }
    try {
      const s = await stat(verified.absolutePath);
      if (s.isFile()) {
        totalBytes += s.size;
        if (totalBytes > MAX_INSPECTED_TEXT_BYTES) {
          return {
            inspectedBytes: totalBytes,
            fileCount: scopedPaths.length,
            exceededCount: false,
            exceededBytes: true,
          };
        }
      }
    } catch {
      return {
        inspectedBytes: totalBytes,
        fileCount: scopedPaths.length,
        exceededCount: false,
        exceededBytes: false,
        missingPath: p,
      };
    }
  }

  return {
    inspectedBytes: totalBytes,
    fileCount: scopedPaths.length,
    exceededCount: false,
    exceededBytes: false,
  };
}

/**
 * Evaluates candidate operation evidence against canonical roots, filesystem,
 * git and boundedness constraints without mutation or push.
 */
export async function collectTaskIntakeEvidence(
  options: TaskIntakeEvidenceOptions,
): Promise<TaskIntakeEvidenceOutcome> {
  const { canonicalRoot, requestText, shortGoal, shortScope, operation, scopeChange, currentTask } =
    options;
  const combinedText = `${requestText} ${shortGoal ?? ""} ${shortScope ?? ""}`;
  const facts: TaskFactItem[] = [...(options.facts ?? [])];

  // 1. Check scope-change first
  if (scopeChange?.expandedScope === true || scopeChange?.requiresInvestigation === true) {
    const wipPreserved = scopeChange.wipBytesPreserved !== false;
    const isRepair = scopeChange.isTaskRepair === true;
    const currentStyle = currentTask?.selectedStyle as TaskExecutionStyle | undefined;

    if (isRepair && currentStyle) {
      facts.push({
        fact: "active-task-repair-retains-style",
        status: "known",
        provenance: "user-explicit",
        detail: `Retaining verified style ${currentStyle} for repair; dirty WIP preserved`,
      });
      return {
        status: "scope-expansion",
        isTaskRepair: true,
        retainedStyle: currentStyle,
        taskReference: currentTask?.taskId,
        reasons: ["active-task-repair-retains-style", "wip-bytes-preserved"],
        observations: [
          `Active task repair retains style ${currentStyle} and preserves dirty WIP without inheriting new effects`,
        ],
        facts,
      };
    }

    facts.push({
      fact: "scope-expansion-reclassified",
      status: "known",
      provenance: "user-explicit",
      detail: "Expanded work requiring investigation preserves dirty WIP and reclassifies before expansion",
    });
    return {
      status: "scope-expansion",
      isTaskRepair: false,
      reasons: ["scope-expansion-reclassified", "wip-bytes-preserved"],
      observations: [
        "Expanded scope requiring investigation stops before expanded work and preserves dirty WIP",
      ],
      facts,
    };
  }

  // 2. Determine candidate operation type
  const opType = operation?.type?.toLowerCase();
  const isPushRequest =
    opType === "push" ||
    /\b(?:git\s+push|push)\b/i.test(combinedText);

  const isRenameRequest =
    opType === "rename" ||
    /\b(?:rename|mv)\b/i.test(combinedText) ||
    /(?:이름|파일명|파일\s*이름)\s*변경/.test(combinedText);

  const isReadmeRequest =
    opType === "readme-translation" ||
    opType === "readme-link" ||
    (/\breadme\b/i.test(combinedText) && /(?:번역|translate|link|링크)/i.test(combinedText));

  if (!isPushRequest && !isRenameRequest && !isReadmeRequest) {
    return {
      status: "none",
      facts,
    };
  }

  // 3. Evaluate Push operation
  if (isPushRequest) {
    const isForce =
      operation?.force === true ||
      operation?.delete === true ||
      operation?.mirror === true ||
      operation?.historyRewrite === true ||
      operation?.conflictResolution === true ||
      /--force|-f\b|force\s*push|\bforce\b|--delete|--mirror|rebase|history\s*rewrite|amend|conflict/i.test(
        combinedText,
      );

    if (isForce) {
      facts.push({
        fact: "push-non-force",
        status: "contradicted",
        provenance: "user-explicit",
        detail: "Force push, deletion, mirror or history rewrite requested",
      });
      return {
        status: "substantial-work",
        reasons: [
          "complex-operation-requires-substantial-intake",
          "push-force-or-history-rewrite-not-exempt",
        ],
        observations: [
          "Force push, delete, mirror or history rewrite cannot receive simple operation exemption",
        ],
        facts,
      };
    }

    // Extract remote and branch
    let remote = operation?.remote;
    let branch = operation?.branch ?? operation?.localRef;

    if (!remote || !branch) {
      const match = combinedText.match(/\b(?:git\s+push|push)\s+([a-zA-Z0-9_.-]+)\s+([a-zA-Z0-9/_.-]+)/i);
      if (match) {
        if (!remote && match[1]) remote = match[1];
        if (!branch && match[2]) branch = match[2];
      }
    }

    if (!remote || !branch) {
      const missingFacts: string[] = [];
      if (!remote) missingFacts.push("remote");
      if (!branch) missingFacts.push("branch");

      facts.push({
        fact: "push-target-specified",
        status: "unknown",
        provenance: "user-explicit",
        detail: `Missing target: ${missingFacts.join(", ")}`,
      });

      return {
        status: "clarification-needed",
        question: "어느 원격 저장소(remote)와 브랜치(branch)로 push할 예정인가요?",
        missingFacts,
        reasons: ["simple-operation-missing-evidence", "push-target-missing"],
        observations: [
          "Push operation requires explicit remote and branch before exemption can be considered",
        ],
        facts,
      };
    }

    // Verify local ref in git
    let localRefExists = false;
    try {
      await runGitRead(canonicalRoot, ["rev-parse", "--verify", branch]);
      localRefExists = true;
    } catch {
      localRefExists = false;
    }

    if (!localRefExists) {
      facts.push({
        fact: "push-local-ref-exists",
        status: "contradicted",
        provenance: "git",
        detail: `Local ref '${branch}' not found in repository`,
      });
      return {
        status: "clarification-needed",
        question: `로컬 브랜치/커밋 '${branch}'를 저장소에서 찾을 수 없습니다. push할 유효한 로컬 브랜치 이름이 무엇인가요?`,
        missingFacts: ["local-ref"],
        reasons: ["simple-operation-missing-evidence", "push-local-ref-not-found"],
        observations: [
          `Local ref '${branch}' does not exist in repository; cannot prove bounded push`,
        ],
        facts,
      };
    }

    facts.push({
      fact: "push-target-remote",
      status: "known",
      provenance: "user-explicit",
      detail: `Remote: ${remote}`,
    });
    facts.push({
      fact: "push-local-ref",
      status: "known",
      provenance: "git",
      detail: `Local ref ${branch} verified in repository`,
    });
    facts.push({
      fact: "push-non-force",
      status: "known",
      provenance: "user-explicit",
      detail: "Standard non-force push intent confirmed",
    });

    return {
      status: "eligible",
      operationType: "push",
      reasons: ["bounded-simple-operation-exemption", "simple-operation-push"],
      observations: [
        `Explicit remote '${remote}' and local ref '${branch}' verified with existing local ref`,
        "Normal non-force push intent confirmed; push authority not granted during intake",
      ],
      facts,
    };
  }

  // 4. Evaluate Rename operation
  if (isRenameRequest) {
    const isPublicApiOrSchema =
      operation?.unchangedApiMeaning === false ||
      /\b(?:public\s+api|api\s*변경|schema|스키마|breaking\s*change|cross-subsystem)\b/i.test(
        combinedText,
      );

    if (isPublicApiOrSchema) {
      facts.push({
        fact: "rename-unchanged-api",
        status: "contradicted",
        provenance: "user-explicit",
        detail: "Rename affects public API or schema meaning",
      });
      return {
        status: "substantial-work",
        reasons: [
          "complex-operation-requires-substantial-intake",
          "rename-affects-public-api-or-schema",
        ],
        observations: [
          "Public API or schema changes require substantial task intake",
        ],
        facts,
      };
    }

    const oldPath = operation?.oldPath ?? operation?.target;
    const newPath = operation?.newPath ?? operation?.result;

    if (!oldPath) {
      facts.push({
        fact: "rename-source-path",
        status: "unknown",
        provenance: "user-explicit",
        detail: "Source file path not provided",
      });
      return {
        status: "clarification-needed",
        question: "변경할 원본 파일의 정확한 경로가 무엇인가요?",
        missingFacts: ["old-path"],
        reasons: ["simple-operation-missing-evidence", "rename-old-path-missing"],
        observations: [
          "Rename requires exact source file path before exemption can be considered",
        ],
        facts,
      };
    }

    if (!newPath) {
      facts.push({
        fact: "rename-target-path",
        status: "unknown",
        provenance: "user-explicit",
        detail: "Target file path not provided",
      });
      return {
        status: "clarification-needed",
        question: "새로 변경할 대상 파일의 경로가 무엇인가요?",
        missingFacts: ["new-path"],
        reasons: ["simple-operation-missing-evidence", "rename-new-path-missing"],
        observations: [
          "Rename requires exact target file path before exemption can be considered",
        ],
        facts,
      };
    }

    // If unchangedApiMeaning is not explicitly indicated and text is ambiguous
    if (
      operation?.unchangedApiMeaning === undefined &&
      !/(?:국소|local|단순|내부|파일명만)\s*(?:변경|rename)/i.test(combinedText)
    ) {
      facts.push({
        fact: "rename-unchanged-api",
        status: "unknown",
        provenance: "user-explicit",
        detail: "API impact unknown",
      });
      return {
        status: "clarification-needed",
        question: "파일명만 변경하나요, 아니면 공개 API/인터페이스도 변경하나요?",
        missingFacts: ["api-impact"],
        reasons: ["simple-operation-missing-evidence", "rename-api-impact-unspecified"],
        observations: [
          "Rename requires confirming unchanged API meaning before exemption",
        ],
        facts,
      };
    }

    // Check oldPath root containment and existence
    const oldVerified = await verifyRootPath(oldPath, canonicalRoot);
    if (!oldVerified.ok) {
      facts.push({
        fact: "rename-old-path-contained",
        status: "contradicted",
        provenance: "filesystem",
        detail: oldVerified.reason ?? "Source path outside canonical root",
      });
      return {
        status: "substantial-work",
        reasons: ["target-path-outside-canonical-root"],
        observations: [oldVerified.reason ?? "Source path is outside canonical root"],
        facts,
      };
    }

    try {
      const s = await lstat(oldVerified.absolutePath);
      if (!s.isFile() && !s.isDirectory()) {
        facts.push({
          fact: "rename-old-path-regular",
          status: "contradicted",
          provenance: "filesystem",
          detail: "Source path is not a regular file or directory",
        });
        return {
          status: "substantial-work",
          reasons: ["source-path-not-regular-file"],
          observations: ["Source path is not a regular file or directory"],
          facts,
        };
      }
    } catch {
      facts.push({
        fact: "rename-old-path-exists",
        status: "contradicted",
        provenance: "filesystem",
        detail: `Source path '${oldPath}' does not exist`,
      });
      return {
        status: "clarification-needed",
        question: `원본 파일 '${oldPath}'가 존재하지 않습니다. 정확한 원본 파일 경로를 확인해주세요.`,
        missingFacts: ["old-path-exists"],
        reasons: ["simple-operation-missing-evidence", "rename-old-path-not-found"],
        observations: [`Source path '${oldPath}' does not exist on filesystem`],
        facts,
      };
    }

    // Check newPath root containment
    const newVerified = await verifyRootPath(newPath, canonicalRoot);
    if (!newVerified.ok) {
      facts.push({
        fact: "rename-new-path-contained",
        status: "contradicted",
        provenance: "filesystem",
        detail: newVerified.reason ?? "Target path outside canonical root",
      });
      return {
        status: "substantial-work",
        reasons: ["target-path-outside-canonical-root"],
        observations: [newVerified.reason ?? "Target path is outside canonical root"],
        facts,
      };
    }

    // Scoped paths inspection
    const scopedPaths = operation?.scopedPaths ?? [oldPath];
    const inspection = await inspectScopedFiles(scopedPaths, canonicalRoot);

    if (inspection.exceededCount) {
      facts.push({
        fact: "rename-scoped-paths-cap",
        status: "contradicted",
        provenance: "filesystem",
        detail: `Scoped path count ${inspection.fileCount} exceeds limit of ${MAX_SCOPED_PATHS}`,
      });
      return {
        status: "substantial-work",
        reasons: ["inspection-path-limit-exceeded"],
        observations: [
          `Scoped path count (${inspection.fileCount}) exceeds limit of ${MAX_SCOPED_PATHS} files; treated as substantial work`,
        ],
        facts,
      };
    }

    if (inspection.exceededBytes) {
      facts.push({
        fact: "rename-scoped-bytes-cap",
        status: "contradicted",
        provenance: "filesystem",
        detail: `Inspected bytes ${inspection.inspectedBytes} exceeds limit of ${MAX_INSPECTED_TEXT_BYTES}`,
      });
      return {
        status: "substantial-work",
        reasons: ["inspection-byte-budget-exceeded"],
        observations: [
          `Inspected text exceeds limit of ${MAX_INSPECTED_TEXT_BYTES} bytes; treated as substantial work`,
        ],
        facts,
      };
    }

    facts.push({
      fact: "rename-old-path-exists",
      status: "known",
      provenance: "filesystem",
      detail: `Source path '${oldPath}' exists and is root-contained`,
    });
    facts.push({
      fact: "rename-unchanged-api",
      status: "known",
      provenance: "user-explicit",
      detail: "Local rename with unchanged API meaning confirmed",
    });
    facts.push({
      fact: "rename-reference-impact-bounded",
      status: "known",
      provenance: "filesystem",
      detail: `Scoped impact bounded within ${inspection.fileCount} files and ${inspection.inspectedBytes} bytes`,
    });

    return {
      status: "eligible",
      operationType: "rename",
      reasons: ["bounded-simple-operation-exemption", "simple-operation-local-rename"],
      observations: [
        "Local file rename verified with unchanged API meaning and root containment",
        `Scoped reference impact bounded within ${inspection.fileCount} files and ${inspection.inspectedBytes} bytes`,
      ],
      facts,
    };
  }

  // 5. Evaluate README translation/link operation
  if (isReadmeRequest) {
    const isRedesignOrArchitecture =
      operation?.redesign === true ||
      operation?.newFeatureScope === true ||
      /\b(?:redesign|재설계|개편|구조\s*개편|새\s*기능|new\s*feature|architecture)\b/i.test(
        combinedText,
      );

    if (isRedesignOrArchitecture) {
      facts.push({
        fact: "readme-unchanged-structure",
        status: "contradicted",
        provenance: "user-explicit",
        detail: "README redesign or new feature architecture requested",
      });
      return {
        status: "substantial-work",
        reasons: [
          "complex-operation-requires-substantial-intake",
          "readme-redesign-or-new-feature-not-exempt",
        ],
        observations: [
          "README redesign, structural reorganization or new feature scope requires substantial task intake",
        ],
        facts,
      };
    }

    const isLink =
      opType === "readme-link" ||
      operation?.targetLink !== undefined ||
      /\b(?:link|링크)\b/i.test(combinedText);

    if (isLink) {
      const sourcePath = operation?.sourcePath ?? "README.md";
      const targetLink = operation?.targetLink ?? operation?.target;

      if (!targetLink) {
        facts.push({
          fact: "readme-target-link",
          status: "unknown",
          provenance: "user-explicit",
          detail: "Target document link not specified",
        });
        return {
          status: "clarification-needed",
          question: "README에 추가할 대상 문서의 정확한 경로가 무엇인가요?",
          missingFacts: ["target-link"],
          reasons: ["simple-operation-missing-evidence", "readme-link-target-missing"],
          observations: [
            "Adding document link requires existing target document path before exemption",
          ],
          facts,
        };
      }

      const targetVerified = await verifyRootPath(targetLink, canonicalRoot);
      if (!targetVerified.ok) {
        facts.push({
          fact: "readme-link-target-contained",
          status: "contradicted",
          provenance: "filesystem",
          detail: targetVerified.reason ?? "Target link path outside canonical root",
        });
        return {
          status: "substantial-work",
          reasons: ["target-path-outside-canonical-root"],
          observations: [targetVerified.reason ?? "Target document is outside canonical root"],
          facts,
        };
      }

      try {
        await stat(targetVerified.absolutePath);
      } catch {
        facts.push({
          fact: "readme-link-target-exists",
          status: "contradicted",
          provenance: "filesystem",
          detail: `Target link document '${targetLink}' does not exist`,
        });
        return {
          status: "clarification-needed",
          question: `대상 문서 '${targetLink}'가 존재하지 않습니다. 유효한 문서 경로를 입력해주세요.`,
          missingFacts: ["target-link-exists"],
          reasons: ["simple-operation-missing-evidence", "readme-link-target-not-found"],
          observations: [`Target link '${targetLink}' does not exist on filesystem`],
          facts,
        };
      }

      // Check source readme
      const sourceVerified = await verifyRootPath(sourcePath, canonicalRoot);
      if (!sourceVerified.ok) {
        return {
          status: "substantial-work",
          reasons: ["source-path-outside-canonical-root"],
          observations: [sourceVerified.reason ?? "Source README is outside canonical root"],
          facts,
        };
      }

      try {
        await stat(sourceVerified.absolutePath);
      } catch {
        return {
          status: "clarification-needed",
          question: `원본 파일 '${sourcePath}'가 존재하지 않습니다.`,
          missingFacts: ["source-path"],
          reasons: ["simple-operation-missing-evidence"],
          observations: [`Source file '${sourcePath}' does not exist`],
          facts,
        };
      }

      const scopedPaths = operation?.scopedPaths ?? [sourcePath, targetLink];
      const inspection = await inspectScopedFiles(scopedPaths, canonicalRoot);
      if (inspection.exceededBytes) {
        return {
          status: "substantial-work",
          reasons: ["inspection-byte-budget-exceeded"],
          observations: ["Inspected documents exceed 64 KiB limit"],
          facts,
        };
      }

      facts.push({
        fact: "readme-link-target-exists",
        status: "known",
        provenance: "filesystem",
        detail: `Target document '${targetLink}' verified in canonical root`,
      });
      facts.push({
        fact: "readme-source-exists",
        status: "known",
        provenance: "filesystem",
        detail: `Source README '${sourcePath}' verified in canonical root`,
      });

      return {
        status: "eligible",
        operationType: "readme-link",
        reasons: ["bounded-simple-operation-exemption", "simple-operation-readme-link"],
        observations: [
          `Adding link to existing document '${targetLink}' verified within canonical root`,
          "Target/result/impact bounded and verified; skips chooser and forced bootstrap",
        ],
        facts,
      };
    }

    // Translation
    const sourcePath = operation?.sourcePath ?? "README.md";
    const targetPath = operation?.target ?? operation?.newPath ?? "README.ko.md";

    if (operation?.faithful === false) {
      facts.push({
        fact: "readme-faithful-translation",
        status: "contradicted",
        provenance: "user-explicit",
        detail: "Non-faithful translation requested",
      });
      return {
        status: "substantial-work",
        reasons: ["readme-non-faithful-translation"],
        observations: ["Non-faithful translation requires substantial task intake"],
        facts,
      };
    }

    const sourceVerified = await verifyRootPath(sourcePath, canonicalRoot);
    if (!sourceVerified.ok) {
      facts.push({
        fact: "readme-source-contained",
        status: "contradicted",
        provenance: "filesystem",
        detail: sourceVerified.reason ?? "Source README outside canonical root",
      });
      return {
        status: "substantial-work",
        reasons: ["target-path-outside-canonical-root"],
        observations: [sourceVerified.reason ?? "Source README is outside canonical root"],
        facts,
      };
    }

    try {
      await stat(sourceVerified.absolutePath);
    } catch {
      facts.push({
        fact: "readme-source-exists",
        status: "contradicted",
        provenance: "filesystem",
        detail: `Source README '${sourcePath}' does not exist`,
      });
      return {
        status: "clarification-needed",
        question: `번역할 원본 README 파일 '${sourcePath}'가 존재하지 않습니다. 원본 파일 위치를 확인해주세요.`,
        missingFacts: ["source-path"],
        reasons: ["simple-operation-missing-evidence", "readme-source-not-found"],
        observations: [`Source README '${sourcePath}' does not exist on filesystem`],
        facts,
      };
    }

    const targetVerified = await verifyRootPath(targetPath, canonicalRoot);
    if (!targetVerified.ok) {
      facts.push({
        fact: "readme-target-contained",
        status: "contradicted",
        provenance: "filesystem",
        detail: targetVerified.reason ?? "Target README outside canonical root",
      });
      return {
        status: "substantial-work",
        reasons: ["target-path-outside-canonical-root"],
        observations: [targetVerified.reason ?? "Target README is outside canonical root"],
        facts,
      };
    }

    const scopedPaths = operation?.scopedPaths ?? [sourcePath];
    const inspection = await inspectScopedFiles(scopedPaths, canonicalRoot);
    if (inspection.exceededBytes) {
      facts.push({
        fact: "readme-bytes-cap",
        status: "contradicted",
        provenance: "filesystem",
        detail: `Inspected bytes ${inspection.inspectedBytes} exceeds 64 KiB`,
      });
      return {
        status: "substantial-work",
        reasons: ["inspection-byte-budget-exceeded"],
        observations: ["Inspected README text exceeds 64 KiB limit; treated as substantial work"],
        facts,
      };
    }

    facts.push({
      fact: "readme-source-exists",
      status: "known",
      provenance: "filesystem",
      detail: `Source README '${sourcePath}' verified in canonical root`,
    });
    facts.push({
      fact: "readme-faithful-translation",
      status: "known",
      provenance: "user-explicit",
      detail: "Faithful translation intent without structural redesign",
    });

    return {
      status: "eligible",
      operationType: "readme-translation",
      reasons: ["bounded-simple-operation-exemption", "simple-operation-readme-translation"],
      observations: [
        `Faithful README translation from '${sourcePath}' to '${targetPath}' verified with root containment`,
        "Target/result/impact bounded and verified; skips chooser and forced bootstrap",
      ],
      facts,
    };
  }

  return {
    status: "none",
    facts,
  };
}
