import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { userStateRoot } from "./paths.js";
import { selectTaskExecution } from "./task-read.js";
import type { TaskExecutionStyle } from "./task-intake.js";

export type ContinuityOutcome =
  | "active-related"
  | "terminal"
  | "unrelated"
  | "uncertain"
  | "pending-mismatch"
  | "cancelled"
  | "status-query"
  | "none";

export interface TaskContinuityResult {
  readonly outcome: ContinuityOutcome;
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly taskReference?: string | undefined;
  readonly reason?: string | undefined;
  readonly clarificationQuestion?: string | undefined;
}

export interface TaskIntakeCurrentTaskReference {
  readonly taskId?: string | undefined;
  readonly runId?: string | undefined;
  readonly contractDigest?: string | undefined;
  readonly revision?: number | undefined;
  readonly artifactPath?: string | undefined;
  readonly selectedStyle?: string | undefined;
  readonly relationship?:
    | "follow-up"
    | "test-repair"
    | "verification"
    | "status"
    | "independent"
    | "unknown"
    | undefined;
}

export interface TaskContinuityInput {
  readonly canonicalRoot: string;
  readonly stateRoot?: string | undefined;
  readonly request: {
    readonly text: string;
    readonly shortGoal?: string | undefined;
    readonly shortScope?: string | undefined;
  };
  readonly currentTask?: TaskIntakeCurrentTaskReference | undefined;
  readonly answer?: {
    readonly raw?: string | undefined;
    readonly canonicalStyle?: string | undefined;
    readonly pendingTaskId?: string | undefined;
  } | undefined;
}

export async function resolveTaskIntakeContinuity(
  input: TaskContinuityInput,
): Promise<TaskContinuityResult> {
  const current = input.currentTask;

  // 1. Answer correlation check for pending task
  if (input.answer?.pendingTaskId !== undefined) {
    if (current?.taskId !== undefined && input.answer.pendingTaskId !== current.taskId) {
      return {
        outcome: "pending-mismatch",
        reason: `Pending task correlation ID mismatch: received '${input.answer.pendingTaskId}' but expected '${current.taskId}'`,
      };
    }

    const rawAns = (input.answer.raw ?? input.answer.canonicalStyle ?? "").trim().toLowerCase();
    if (rawAns === "cancel" || rawAns === "취소") {
      return {
        outcome: "cancelled",
        reason: "Task selection was explicitly cancelled by user",
      };
    }

    if (
      rawAns === "status" ||
      rawAns === "상태" ||
      rawAns === "진행 상황" ||
      rawAns === "진행상황"
    ) {
      return {
        outcome: "status-query",
        reason: "Status query preserves pending selection without advancing workflow",
      };
    }
  }

  // 2. If no currentTask reference is provided, no continuity
  if (!current) {
    return { outcome: "none" };
  }

  // 3. Explicit independent relationship
  if (current.relationship === "independent") {
    return {
      outcome: "unrelated",
      reason: "Explicit independent task request does not inherit active task style",
    };
  }

  const effectiveStateRoot = input.stateRoot ?? userStateRoot();

  // 4. Autopilot task contract reference check
  const isContractRef =
    !current.artifactPath &&
    (current.contractDigest !== undefined ||
      current.runId !== undefined ||
      (current.taskId !== undefined &&
        !current.taskId.startsWith("quick-") &&
        !current.taskId.startsWith("phase-")));

  if (isContractRef && current.taskId) {
    // Prohibit implicit latest selection when runId is missing
    if (!current.runId || current.runId.trim().length === 0) {
      return {
        outcome: "uncertain",
        reason: "Missing exact runId for task contract continuity; latest-run fallback is prohibited",
        clarificationQuestion: "작업 실행 ID(runId)가 지정되지 않았습니다. 현재 활성 작업의 후속인가요, 별도 작업인가요?",
      };
    }

    let selected;
    try {
      selected = await selectTaskExecution({
        stateRoot: effectiveStateRoot,
        contractId: current.taskId,
        runId: current.runId,
      });
    } catch {
      return {
        outcome: "uncertain",
        reason: `Could not read task execution record for ${current.taskId} / ${current.runId}`,
        clarificationQuestion: "지정된 작업 실행 기록을 찾을 수 없습니다. 현재 활성 작업의 후속인가요, 별도 작업인가요?",
      };
    }

    if (!selected.runRecord && !selected.isReserved) {
      return {
        outcome: "unrelated",
        reason: `No run record found for task ${current.taskId} with run ${current.runId}`,
      };
    }

    // Digest comparison
    if (
      current.contractDigest !== undefined &&
      selected.contractDigest &&
      selected.contractDigest !== current.contractDigest
    ) {
      return {
        outcome: "uncertain",
        reason: `Contract digest mismatch: reference ${current.contractDigest.slice(0, 12)} does not match state ${selected.contractDigest.slice(0, 12)}`,
        clarificationQuestion: "계약 요약(digest)이 일치하지 않습니다. 현재 활성 작업의 후속인가요, 별도 작업인가요?",
      };
    }

    // Revision comparison
    if (
      current.revision !== undefined &&
      selected.revision !== undefined &&
      selected.revision !== current.revision
    ) {
      return {
        outcome: "uncertain",
        reason: `Contract revision mismatch: reference revision ${current.revision} does not match state revision ${selected.revision}`,
        clarificationQuestion: "계약 버전(revision)이 일치하지 않습니다. 현재 활성 작업의 후속인가요, 별도 작업인가요?",
      };
    }

    // Check terminal status
    if (selected.runRecord) {
      if (selected.runRecord.status === "accepted") {
        return {
          outcome: "terminal",
          reason: `Task ${current.taskId} completed successfully; completed tasks do not restore style to new work`,
        };
      }

      if (
        selected.runRecord.status === "stopped" &&
        selected.runRecord.stopReason &&
        /cancel/iu.test(selected.runRecord.stopReason)
      ) {
        return {
          outcome: "terminal",
          reason: `Task ${current.taskId} was cancelled; cancelled tasks do not restore style to new work`,
        };
      }
    }

    // Active related task check
    const isRunningOrReserved =
      selected.runRecord?.status === "executing" || selected.isReserved;

    if (isRunningOrReserved) {
      if (current.relationship === "unknown" || !current.relationship) {
        return {
          outcome: "uncertain",
          reason: "Active contract found but task relationship is unspecified",
          clarificationQuestion: "현재 활성 작업의 후속 작업인가요, 아니면 별도의 독립 작업인가요?",
        };
      }

      const style =
        (current.selectedStyle as TaskExecutionStyle) ?? "autopilot-quick";
      return {
        outcome: "active-related",
        selectedStyle: style,
        taskReference: current.taskId,
        reason: `Continuing verified active task ${current.taskId} (run: ${current.runId})`,
      };
    }

    // Stopped, failed or interrupted: not completed by inference, requires explicit resume
    return {
      outcome: "uncertain",
      reason: `Task ${current.taskId} is in non-terminal stopped/failed state (status: ${selected.runRecord?.status ?? "unknown"}); requires explicit resume evidence`,
      clarificationQuestion: "이전 작업이 중단되거나 실패한 상태입니다. 이 작업을 재개하시겠습니까, 새로운 작업을 시작하시겠습니까?",
    };
  }

  // 5. GSD task / quick / phase artifact reference check
  if (current.artifactPath || current.taskId) {
    const rawPath = current.artifactPath ?? `.planning/quick/${current.taskId}.md`;
    const normCanonical = resolve(input.canonicalRoot);
    const resolvedPath = isAbsolute(rawPath) ? normalize(rawPath) : resolve(normCanonical, rawPath);

    // Path boundary check: ensure artifact does not escape canonical root
    if (!resolvedPath.startsWith(normCanonical)) {
      return {
        outcome: "unrelated",
        reason: `GSD artifact path '${rawPath}' escapes canonical project root`,
      };
    }

    if (!existsSync(resolvedPath)) {
      return {
        outcome: "unrelated",
        reason: `GSD artifact '${rawPath}' does not exist in canonical project root`,
      };
    }

    // Read artifact content safely
    let content: string;
    try {
      content = await readFile(resolvedPath, "utf8");
    } catch {
      return {
        outcome: "unrelated",
        reason: `Could not read GSD artifact at '${rawPath}'`,
      };
    }

    // Check if artifact represents a completed phase or task
    const isCompletedArtifact =
      resolvedPath.endsWith("SUMMARY.md") ||
      /status:\s*(?:completed|closed|passed)\b/iu.test(content);

    if (isCompletedArtifact) {
      return {
        outcome: "terminal",
        reason: `Referenced GSD artifact '${rawPath}' represents a completed task or phase`,
      };
    }

    // Active GSD task
    if (current.relationship === "unknown" || !current.relationship) {
      return {
        outcome: "uncertain",
        reason: "Active GSD task reference found but task relationship is unspecified",
        clarificationQuestion: "현재 활성 작업의 후속 작업인가요, 아니면 별도의 독립 작업인가요?",
      };
    }

    const style = (current.selectedStyle as TaskExecutionStyle) ?? "conversational-quick";
    return {
      outcome: "active-related",
      selectedStyle: style,
      taskReference: current.taskId ?? current.artifactPath,
      reason: `Continuing verified active GSD task ${current.taskId ?? current.artifactPath}`,
    };
  }

  return { outcome: "none" };
}
