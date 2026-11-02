import type { ExplicitCommandRoute } from "./task-intake-explicit.js";

export type TaskExecutionStyle =
  | "conversational-quick"
  | "conversational-quick-full"
  | "conversational-phase"
  | "autopilot-quick"
  | "autopilot-quick-full"
  | "autopilot-phase";

export interface TaskExecutionStyleCatalogEntry {
  readonly id: TaskExecutionStyle;
  readonly number: number;
  readonly label: string;
  readonly description: string;
}

export const TASK_EXECUTION_STYLES: readonly TaskExecutionStyleCatalogEntry[] = [
  {
    id: "conversational-quick",
    number: 1,
    label: "대화형-quick",
    description: "현재 대화에서 작은 작업을 간소화된 GSD 절차로 처리",
  },
  {
    id: "conversational-quick-full",
    number: 2,
    label: "대화형-quick-full",
    description: "작은 작업에 토론·조사·계획 검사·구현·검증 적용",
  },
  {
    id: "conversational-phase",
    number: 3,
    label: "대화형-phase",
    description: "로드맵과 Phase를 따라 필요한 사항을 질문하며 진행",
  },
  {
    id: "autopilot-quick",
    number: 4,
    label: "오토파일럿-quick",
    description: "승인된 계약과 별도 실행기로 작은 작업 처리",
  },
  {
    id: "autopilot-quick-full",
    number: 5,
    label: "오토파일럿-quick-full",
    description: "승인된 범위에서 작은 작업의 전체 품질 절차 수행",
  },
  {
    id: "autopilot-phase",
    number: 6,
    label: "오토파일럿-phase",
    description: "승인된 로드맵 범위의 Phase들을 자율 진행",
  },
] as const;

export type TaskExecutionSurface = "conversation" | "isolated-runner";
export type TaskQuickQuality = "standard" | "full";

export interface TaskExecutionAuthorityRequirements {
  readonly executionAuthorized: false;
  readonly requiresExactApproval: boolean;
  readonly requiresSeparateStart: boolean;
  readonly requiresEvidenceValidation: boolean;
  readonly surface: TaskExecutionSurface;
}

export interface TaskExecutionRoute {
  readonly style: TaskExecutionStyle;
  readonly label: string;
  readonly surface: TaskExecutionSurface;
  readonly workflow: string;
  readonly command: string;
  readonly phase?: string | undefined;
  readonly arguments: readonly string[];
  readonly quickQuality?: TaskQuickQuality | undefined;
  readonly stoppingPoint?: string | undefined;
  readonly authorityRequirements: TaskExecutionAuthorityRequirements;
}

export interface ResolveTaskExecutionRouteOptions {
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly commandRoute?: ExplicitCommandRoute | undefined;
}

function resolveStyleLabel(style: TaskExecutionStyle): string {
  const entry = TASK_EXECUTION_STYLES.find((e) => e.id === style);
  return entry ? entry.label : style;
}

export function resolveTaskExecutionRoute(
  options: ResolveTaskExecutionRouteOptions,
): TaskExecutionRoute | undefined {
  const { selectedStyle, commandRoute } = options;

  if (!selectedStyle && !commandRoute) {
    return undefined;
  }

  // Derive style from commandRoute if selectedStyle is omitted
  let effectiveStyle = selectedStyle;
  if (!effectiveStyle && commandRoute) {
    if (commandRoute.workflow === "quick") {
      effectiveStyle = commandRoute.arguments.includes("--full")
        ? "conversational-quick-full"
        : "conversational-quick";
    } else {
      effectiveStyle = "conversational-phase";
    }
  }

  if (!effectiveStyle) {
    return undefined;
  }

  const surface: TaskExecutionSurface = effectiveStyle.startsWith("autopilot-")
    ? "isolated-runner"
    : "conversation";

  const isAutopilot = surface === "isolated-runner";
  const label = resolveStyleLabel(effectiveStyle);

  // When explicit commandRoute is given, preserve command, workflow, phase, arguments, stoppingPoint
  if (commandRoute) {
    const isQuick = commandRoute.workflow === "quick" || effectiveStyle.includes("quick");
    const isFull =
      effectiveStyle.endsWith("-full") || commandRoute.arguments.includes("--full");

    const routeArgs = [...commandRoute.arguments];
    if (isFull && !routeArgs.includes("--full")) {
      routeArgs.push("--full");
    }

    return {
      style: effectiveStyle,
      label,
      surface,
      workflow: commandRoute.workflow,
      command: commandRoute.command,
      phase: commandRoute.phase,
      arguments: routeArgs,
      quickQuality: isQuick ? (isFull ? "full" : "standard") : undefined,
      stoppingPoint: commandRoute.stoppingPoint,
      authorityRequirements: {
        executionAuthorized: false,
        requiresExactApproval: isAutopilot,
        requiresSeparateStart: isAutopilot,
        requiresEvidenceValidation: isAutopilot || isFull,
        surface,
      },
    };
  }

  // Default mappings for the six styles without explicit commandRoute
  switch (effectiveStyle) {
    case "conversational-quick":
      return {
        style: "conversational-quick",
        label,
        surface: "conversation",
        workflow: "quick",
        command: "gsd-quick",
        arguments: [],
        quickQuality: "standard",
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: false,
          requiresSeparateStart: false,
          requiresEvidenceValidation: false,
          surface: "conversation",
        },
      };

    case "conversational-quick-full":
      return {
        style: "conversational-quick-full",
        label,
        surface: "conversation",
        workflow: "quick",
        command: "gsd-quick",
        arguments: ["--full"],
        quickQuality: "full",
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: false,
          requiresSeparateStart: false,
          requiresEvidenceValidation: true,
          surface: "conversation",
        },
      };

    case "conversational-phase":
      return {
        style: "conversational-phase",
        label,
        surface: "conversation",
        workflow: "phase",
        command: "gsd-next",
        arguments: [],
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: false,
          requiresSeparateStart: false,
          requiresEvidenceValidation: false,
          surface: "conversation",
        },
      };

    case "autopilot-quick":
      return {
        style: "autopilot-quick",
        label,
        surface: "isolated-runner",
        workflow: "quick",
        command: "gsd-quick",
        arguments: [],
        quickQuality: "standard",
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: true,
          requiresSeparateStart: true,
          requiresEvidenceValidation: true,
          surface: "isolated-runner",
        },
      };

    case "autopilot-quick-full":
      return {
        style: "autopilot-quick-full",
        label,
        surface: "isolated-runner",
        workflow: "quick",
        command: "gsd-quick",
        arguments: ["--full"],
        quickQuality: "full",
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: true,
          requiresSeparateStart: true,
          requiresEvidenceValidation: true,
          surface: "isolated-runner",
        },
      };

    case "autopilot-phase":
      return {
        style: "autopilot-phase",
        label,
        surface: "isolated-runner",
        workflow: "phase",
        command: "gsd-phase",
        arguments: [],
        authorityRequirements: {
          executionAuthorized: false,
          requiresExactApproval: true,
          requiresSeparateStart: true,
          requiresEvidenceValidation: true,
          surface: "isolated-runner",
        },
      };
  }
}
