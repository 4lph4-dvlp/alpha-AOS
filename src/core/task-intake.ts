import { existsSync } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ProjectBehaviorInput,
  ProjectBehaviorMode,
  ProjectBehaviorSource,
  ProjectBehaviorView,
} from "./behavior-policy.js";
import { BehaviorPolicyError, resolveProjectBehavior } from "./behavior-policy.js";
import type { RootReason } from "./evidence.js";
import { findPackageRoot } from "./paths.js";
import { parseManagedDocument, validateAgainstSchema } from "./validation.js";
import type { ExplicitCommandRoute } from "./task-intake-explicit.js";
import { normalizeExplicitTaskIntent } from "./task-intake-explicit.js";
import { resolveTaskIntakeContinuity } from "./task-intake-continuity.js";
import type {
  TaskIntakeOperationInput,
  TaskIntakeScopeChangeInput,
} from "./task-intake-evidence.js";
import { collectTaskIntakeEvidence } from "./task-intake-evidence.js";

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

export type TaskIntakeDecisionKind =
  | "explicit-command"
  | "explicit-style"
  | "continuation"
  | "simple-operation"
  | "substantial-work"
  | "clarification-needed";

export type TaskIntakeNextAction =
  | "choose-style"
  | "adaptive-intake"
  | "ask-clarification"
  | "execute-explicit"
  | "continue-task"
  | "execute-simple";

export interface TaskIntakePolicySummary {
  readonly canonicalRoot: string;
  readonly projectId: string;
  readonly rootReason: RootReason;
  readonly effectiveMode: ProjectBehaviorMode;
  readonly source: ProjectBehaviorSource;
  readonly revision: string;
}

export interface TaskIntakeChooserQuestion {
  readonly prompt: string;
  readonly rendering: "native" | "numbered-text";
  readonly options: readonly TaskExecutionStyleCatalogEntry[];
  readonly pendingTaskId?: string | undefined;
}

export interface TaskFactItem {
  readonly fact: string;
  readonly status: "known" | "unknown" | "contradicted";
  readonly provenance:
    | "user-explicit"
    | "filesystem"
    | "git"
    | "gsd-artifact"
    | "contract-run"
    | "host-capability";
  readonly detail?: string | undefined;
}

export interface TaskIntakeRequest {
  readonly text: string;
  readonly shortGoal?: string | undefined;
  readonly shortScope?: string | undefined;
}

export interface TaskIntakeInput {
  readonly schemaVersion: 1;
  readonly projectRoot?: string | undefined;
  readonly boundProjectRoot?: string | undefined;
  readonly request: TaskIntakeRequest;
  readonly explicit?: {
    readonly command?: string | undefined;
    readonly style?: string | undefined;
    readonly phase?: string | undefined;
    readonly arguments?: readonly string[] | undefined;
  } | undefined;
  readonly currentTask?: {
    readonly taskId?: string | undefined;
    readonly runId?: string | undefined;
    readonly contractDigest?: string | undefined;
    readonly revision?: number | undefined;
    readonly selectedStyle?: string | undefined;
    readonly relationship?:
      | "follow-up"
      | "test-repair"
      | "verification"
      | "status"
      | "independent"
      | "unknown"
      | undefined;
  } | undefined;
  readonly operation?: TaskIntakeOperationInput | undefined;
  readonly scopeChange?: TaskIntakeScopeChangeInput | undefined;
  readonly questionCapability?: {
    readonly supportsSixOptions?: boolean | undefined;
    readonly style?: "native" | "numbered-text" | "unknown" | undefined;
  } | undefined;
  readonly answer?: {
    readonly raw?: string | undefined;
    readonly canonicalStyle?: string | undefined;
    readonly pendingTaskId?: string | undefined;
  } | undefined;
  readonly facts?: readonly TaskFactItem[] | undefined;
}

export interface TaskIntakeHandoff {
  readonly schemaVersion: 1;
  readonly originalRequest: string;
  readonly shortGoal?: string | undefined;
  readonly shortScope?: string | undefined;
  readonly knownFacts: readonly TaskFactItem[];
  readonly commandRoute?: ExplicitCommandRoute | undefined;
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly taskReference?: string | undefined;
  readonly policyRevision: string;
  readonly nextAction: TaskIntakeNextAction;
}

export interface TaskIntakePublicDecision {
  readonly schemaVersion: 1;
  readonly kind: TaskIntakeDecisionKind;
  readonly policy: TaskIntakePolicySummary;
  readonly nextAction: TaskIntakeNextAction;
  readonly executionAuthorized: false;
  readonly commandRoute?: ExplicitCommandRoute | undefined;
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly taskReference?: string | undefined;
  readonly reasons: readonly string[];
  readonly observations: readonly string[];
  readonly missingEvidence?: readonly string[] | undefined;
  readonly chooser?: TaskIntakeChooserQuestion | undefined;
  readonly clarification?: {
    readonly question: string;
    readonly missingFacts: readonly string[];
  } | undefined;
}

export interface TaskIntakeDecision extends TaskIntakePublicDecision {
  readonly handoff?: TaskIntakeHandoff | undefined;
}

export type TaskIntakeErrorCode =
  | "invalid-input"
  | "unreadable-input"
  | "input-too-large"
  | "invalid-json"
  | "duplicate-key"
  | "schema-validation"
  | "path-escape"
  | "not-a-file"
  | "empty-input";

export class TaskIntakeError extends Error {
  readonly code: TaskIntakeErrorCode;
  readonly path?: string | undefined;
  readonly causeDescription: string;
  readonly causeCategory: string;
  readonly remediation: string;

  constructor(options: {
    code: TaskIntakeErrorCode;
    path?: string | undefined;
    cause: string;
    causeCategory?: string | undefined;
    remediation: string;
  }) {
    super(options.cause);
    this.name = "TaskIntakeError";
    this.code = options.code;
    this.path = options.path;
    this.causeDescription = options.cause;
    this.causeCategory = options.causeCategory ?? options.code;
    this.remediation = options.remediation;
  }
}

export interface TaskStyleAnswerResolution {
  readonly resolved: boolean;
  readonly style: TaskExecutionStyle | null;
  readonly reason?: string | undefined;
}

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
let cachedSchema: Record<string, unknown> | null = null;

async function getTaskIntakeSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const pkgRoot = findPackageRoot(moduleDirectory) ?? findPackageRoot(process.cwd());
  if (pkgRoot !== null) {
    const schemaPath = join(pkgRoot, "schemas", "task-intake.schema.json");
    if (existsSync(schemaPath)) {
      try {
        const text = await readFile(schemaPath, "utf8");
        cachedSchema = JSON.parse(text) as Record<string, unknown>;
        return cachedSchema;
      } catch {
        // Fall back to embedded schema
      }
    }
  }
  cachedSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://alpha-aos.local/schemas/task-intake.schema.json",
    type: "object",
    required: ["schemaVersion", "request"],
    additionalProperties: false,
    properties: {
      schemaVersion: { type: "integer", const: 1 },
      projectRoot: { type: "string", maxLength: 1024 },
      boundProjectRoot: { type: "string", maxLength: 1024 },
      request: {
        type: "object",
        required: ["text"],
        additionalProperties: false,
        properties: {
          text: { type: "string", maxLength: 8192 },
          shortGoal: { type: "string", maxLength: 512 },
          shortScope: { type: "string", maxLength: 1024 },
        },
      },
    },
  };
  return cachedSchema;
}

export function renderTaskStyleQuestion(
  options: readonly TaskExecutionStyleCatalogEntry[] = TASK_EXECUTION_STYLES,
  capability?: {
    readonly supportsSixOptions?: boolean | undefined;
    readonly style?: "native" | "numbered-text" | "unknown" | undefined;
  },
  pendingTaskId?: string,
): TaskIntakeChooserQuestion {
  const isNative = capability?.supportsSixOptions === true && capability?.style === "native";
  return {
    prompt: "작업을 진행할 방식을 선택해 주세요 (1–6):",
    rendering: isNative ? "native" : "numbered-text",
    options,
    pendingTaskId,
  };
}

export function resolveTaskStyleAnswer(
  rawAnswer: string | undefined | null,
): TaskStyleAnswerResolution {
  if (rawAnswer === undefined || rawAnswer === null) {
    return { resolved: false, style: null, reason: "No answer provided" };
  }

  const trimmed = rawAnswer.trim();
  if (trimmed.length === 0) {
    return { resolved: false, style: null, reason: "Answer is empty" };
  }

  // Exact number 1 to 6
  if (/^[1-6]$/u.test(trimmed)) {
    const num = parseInt(trimmed, 10);
    const entry = TASK_EXECUTION_STYLES.find((e) => e.number === num);
    if (entry) {
      return { resolved: true, style: entry.id };
    }
  }

  // Number outside 1-6
  if (/^\d+$/u.test(trimmed)) {
    return {
      resolved: false,
      style: null,
      reason: `Answer number ${trimmed} is out of range (must be 1–6)`,
    };
  }

  // Exact canonical ID match
  const matchById = TASK_EXECUTION_STYLES.find((e) => e.id === trimmed);
  if (matchById) {
    return { resolved: true, style: matchById.id };
  }

  // Exact label match
  const matchByLabel = TASK_EXECUTION_STYLES.find((e) => e.label === trimmed);
  if (matchByLabel) {
    return { resolved: true, style: matchByLabel.id };
  }

  // Check substring / prefix / partial ambiguity
  const lower = trimmed.toLowerCase();
  const matchingStyles = TASK_EXECUTION_STYLES.filter(
    (e) =>
      e.id.toLowerCase().includes(lower) ||
      e.label.toLowerCase().includes(lower),
  );

  if (matchingStyles.length === 1) {
    return { resolved: true, style: matchingStyles[0]!.id };
  }

  if (matchingStyles.length > 1) {
    return {
      resolved: false,
      style: null,
      reason: `Ambiguous style answer '${trimmed}' matches multiple styles: ${matchingStyles.map((m) => m.id).join(", ")}`,
    };
  }

  return {
    resolved: false,
    style: null,
    reason: `Unrecognized style answer '${trimmed}'`,
  };
}

export function toPublicTaskIntakeDecision(
  decision: TaskIntakeDecision,
): TaskIntakePublicDecision {
  const { handoff, ...pub } = decision;
  return pub;
}

export interface InspectTaskIntakeOptions {
  readonly inputPath?: string | undefined;
  readonly input?: unknown | undefined;
  readonly invocationPath?: string | undefined;
  readonly stateRoot?: string | undefined;
}

export async function inspectTaskIntake(
  options: InspectTaskIntakeOptions,
): Promise<TaskIntakeDecision> {
  let rawText: string;
  let filePathForDiagnostics: string | undefined;

  if (options.inputPath !== undefined) {
    const normPath = resolve(options.inputPath);
    filePathForDiagnostics = normPath;

    let fileLstat;
    try {
      fileLstat = await lstat(normPath);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      throw new TaskIntakeError({
        code: "unreadable-input",
        path: normPath,
        cause: code === "ENOENT" ? "Input file does not exist" : "Input file could not be accessed",
        causeCategory: "file-access",
        remediation: "Provide a valid, accessible file path to --input.",
      });
    }

    if (fileLstat.isSymbolicLink()) {
      throw new TaskIntakeError({
        code: "not-a-file",
        path: normPath,
        cause: "Input file is a symbolic link",
        causeCategory: "symlink-rejected",
        remediation: "Provide a regular file instead of a symbolic link.",
      });
    }

    if (!fileLstat.isFile()) {
      throw new TaskIntakeError({
        code: "not-a-file",
        path: normPath,
        cause: "Input path is not a regular file",
        causeCategory: "not-a-file",
        remediation: "Provide a path to a regular JSON file.",
      });
    }

    if (fileLstat.size > 16384) {
      throw new TaskIntakeError({
        code: "input-too-large",
        path: normPath,
        cause: `Input file exceeds maximum size limit of 16 KiB (${fileLstat.size} bytes > 16384 bytes)`,
        causeCategory: "byte-budget",
        remediation: "Reduce input size below 16 KiB.",
      });
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(normPath);
    } catch {
      throw new TaskIntakeError({
        code: "unreadable-input",
        path: normPath,
        cause: "Failed to read input file",
        causeCategory: "read-failed",
        remediation: "Ensure the file has read permissions.",
      });
    }

    if (buffer.length > 16384) {
      throw new TaskIntakeError({
        code: "input-too-large",
        path: normPath,
        cause: `Input file exceeds maximum size limit of 16 KiB (${buffer.length} bytes > 16384 bytes)`,
        causeCategory: "byte-budget",
        remediation: "Reduce input size below 16 KiB.",
      });
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      rawText = decoder.decode(buffer);
    } catch {
      throw new TaskIntakeError({
        code: "invalid-input",
        path: normPath,
        cause: "Input file contains invalid UTF-8 byte sequences",
        causeCategory: "utf8-decode-error",
        remediation: "Encode the request file in valid UTF-8 without malformed multibyte sequences.",
      });
    }
  } else if (typeof options.input === "string") {
    const buf = Buffer.from(options.input, "utf8");
    if (buf.length > 16384) {
      throw new TaskIntakeError({
        code: "input-too-large",
        cause: `Input exceeds 16 KiB limit (${buf.length} bytes > 16384 bytes)`,
        remediation: "Reduce input size below 16 KiB.",
      });
    }
    rawText = options.input;
  } else if (typeof options.input === "object" && options.input !== null) {
    rawText = JSON.stringify(options.input);
    const buf = Buffer.from(rawText, "utf8");
    if (buf.length > 16384) {
      throw new TaskIntakeError({
        code: "input-too-large",
        cause: `Input exceeds 16 KiB limit (${buf.length} bytes > 16384 bytes)`,
        remediation: "Reduce input size below 16 KiB.",
      });
    }
  } else {
    throw new TaskIntakeError({
      code: "empty-input",
      cause: "No input provided for task intake",
      remediation: "Provide a JSON input file via --input.",
    });
  }

  if (rawText.trim().length === 0) {
    throw new TaskIntakeError({
      code: "empty-input",
      path: filePathForDiagnostics,
      cause: "Input file is empty",
      causeCategory: "empty-file",
      remediation: "Provide a valid, non-empty JSON request object.",
    });
  }

  const parseResult = parseManagedDocument({ text: rawText, format: "json" });
  if (!parseResult.ok) {
    const isDuplicate = parseResult.issues.some((i) => i.code === "syntax.duplicate-key");
    throw new TaskIntakeError({
      code: isDuplicate ? "duplicate-key" : "invalid-json",
      path: filePathForDiagnostics,
      cause: isDuplicate
        ? "Input file contains duplicate JSON key"
        : "Input file is not valid JSON",
      causeCategory: isDuplicate ? "duplicate-key" : "invalid-json",
      remediation: isDuplicate
        ? "Ensure each key appears exactly once in the JSON document."
        : "Ensure the file contains valid JSON syntax without trailing commas or comments.",
    });
  }

  const value = parseResult.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TaskIntakeError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input document must be a top-level JSON object",
      causeCategory: "invalid-shape",
      remediation: "Wrap input fields in a top-level JSON object.",
    });
  }

  const schema = await getTaskIntakeSchema();
  const schemaIssues = validateAgainstSchema(value, schema);
  if (schemaIssues.length > 0) {
    throw new TaskIntakeError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input file does not adhere to task intake schema",
      causeCategory: "schema-validation",
      remediation: "Check schema requirements: schemaVersion must be 1, request.text is required, and no unknown fields are permitted.",
    });
  }

  const inputObj = value as TaskIntakeInput;

  // Resolve project behavior policy afresh. Structured errors propagate directly.
  const behaviorInput: ProjectBehaviorInput = {
    invocationPath: options.invocationPath ?? process.cwd(),
    projectRoot: inputObj.projectRoot,
    boundProjectRoot: inputObj.boundProjectRoot,
    stateRoot: options.stateRoot,
  };
  const policyView = await resolveProjectBehavior(behaviorInput);

  const policySummary: TaskIntakePolicySummary = {
    canonicalRoot: policyView.canonicalRoot,
    projectId: policyView.projectId,
    rootReason: policyView.rootReason,
    effectiveMode: policyView.effectiveMode,
    source: policyView.source,
    revision: policyView.revision,
  };

  // 1. Check explicit intent (D-02, D-03, D-04)
  const explicitIntent = normalizeExplicitTaskIntent(inputObj);

  if (explicitIntent.kind === "conflict") {
    const clarification = {
      question:
        explicitIntent.clarificationQuestion ??
        "명시된 의도가 상충됩니다. 진행 방식을 선택해 주세요.",
      missingFacts: explicitIntent.missingFacts ?? ["explicit-intent-resolution"],
    };
    return {
      schemaVersion: 1,
      kind: "clarification-needed",
      policy: policySummary,
      nextAction: "ask-clarification",
      executionAuthorized: false,
      reasons: ["conflicting-explicit-intent"],
      observations: [
        explicitIntent.conflictReason ?? "Explicit command and style requests conflict",
      ],
      clarification,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "ask-clarification",
      },
    };
  }

  if (explicitIntent.kind === "command" && explicitIntent.commandRoute) {
    const observations: string[] = [
      `Direct GSD command invocation: ${explicitIntent.commandRoute.command}`,
      `Workflow: ${explicitIntent.commandRoute.workflow}`,
    ];
    if (explicitIntent.commandRoute.phase) {
      observations.push(`Target phase: ${explicitIntent.commandRoute.phase}`);
    }
    if (explicitIntent.commandRoute.arguments.length > 0) {
      observations.push(`Arguments: ${explicitIntent.commandRoute.arguments.join(" ")}`);
    }
    if (explicitIntent.commandRoute.stoppingPoint) {
      observations.push(`Stopping point: ${explicitIntent.commandRoute.stoppingPoint}`);
    }
    const reasons = [`explicit-gsd-command:${explicitIntent.commandRoute.command}`];

    return {
      schemaVersion: 1,
      kind: "explicit-command",
      policy: policySummary,
      nextAction: "execute-explicit",
      executionAuthorized: false,
      commandRoute: explicitIntent.commandRoute,
      selectedStyle: explicitIntent.selectedStyle,
      reasons,
      observations,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        commandRoute: explicitIntent.commandRoute,
        selectedStyle: explicitIntent.selectedStyle,
        policyRevision: policyView.revision,
        nextAction: "execute-explicit",
      },
    };
  }

  if (explicitIntent.kind === "style" && explicitIntent.selectedStyle) {
    const reasons = [`explicit-style-selected:${explicitIntent.selectedStyle}`];
    const observations = [`Explicit task style specified: ${explicitIntent.selectedStyle}`];

    return {
      schemaVersion: 1,
      kind: "explicit-style",
      policy: policySummary,
      nextAction: "execute-explicit",
      executionAuthorized: false,
      selectedStyle: explicitIntent.selectedStyle,
      reasons,
      observations,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        selectedStyle: explicitIntent.selectedStyle,
        policyRevision: policyView.revision,
        nextAction: "execute-explicit",
      },
    };
  }

  if (explicitIntent.kind === "partial") {
    const reasons = ["partial-autopilot-style-specified-requires-depth-selection"];
    const observations = [
      "Autopilot mode requested; work depth (quick, quick-full, phase) requires selection",
    ];
    const autopilotOptions = TASK_EXECUTION_STYLES.filter((s) => s.id.startsWith("autopilot-"));
    const chooser = renderTaskStyleQuestion(
      autopilotOptions,
      inputObj.questionCapability,
      inputObj.answer?.pendingTaskId,
    );
    return {
      schemaVersion: 1,
      kind: "substantial-work",
      policy: policySummary,
      nextAction: "choose-style",
      executionAuthorized: false,
      reasons,
      observations,
      chooser,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "choose-style",
      },
    };
  }

  // 2. Check scope change before continuity / simple operation (D-16)
  if (inputObj.scopeChange?.expandedScope === true || inputObj.scopeChange?.requiresInvestigation === true) {
    const isRepair = inputObj.scopeChange.isTaskRepair === true;
    const currentStyle = inputObj.currentTask?.selectedStyle as TaskExecutionStyle | undefined;

    if (isRepair && currentStyle) {
      const taskRef = inputObj.currentTask?.taskId ?? inputObj.scopeChange.previousOperationId;
      return {
        schemaVersion: 1,
        kind: "continuation",
        policy: policySummary,
        nextAction: "continue-task",
        executionAuthorized: false,
        selectedStyle: currentStyle,
        taskReference: taskRef,
        reasons: ["active-task-repair-retains-style", "wip-bytes-preserved"],
        observations: [
          `Active task repair retains style ${currentStyle} and preserves dirty WIP without inheriting new effects`,
        ],
        handoff: {
          schemaVersion: 1,
          originalRequest: inputObj.request.text,
          shortGoal: inputObj.request.shortGoal,
          shortScope: inputObj.request.shortScope,
          knownFacts: inputObj.facts ?? [],
          selectedStyle: currentStyle,
          taskReference: taskRef,
          policyRevision: policyView.revision,
          nextAction: "continue-task",
        },
      };
    }

    const nextAction: TaskIntakeNextAction =
      policyView.effectiveMode === "strict" ? "choose-style" : "adaptive-intake";
    return {
      schemaVersion: 1,
      kind: "substantial-work",
      policy: policySummary,
      nextAction,
      executionAuthorized: false,
      reasons: ["scope-expansion-reclassified", "wip-bytes-preserved"],
      observations: [
        "Expanded scope requiring investigation stops before expanded work and preserves dirty WIP",
      ],
      chooser:
        policyView.effectiveMode === "strict"
          ? renderTaskStyleQuestion(TASK_EXECUTION_STYLES, inputObj.questionCapability)
          : undefined,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction,
      },
    };
  }

  // 3. Check active task continuity (D-07, D-08, D-09, D-10, D-11, D-12)
  const continuity = await resolveTaskIntakeContinuity({
    canonicalRoot: policyView.canonicalRoot,
    stateRoot: options.stateRoot,
    request: inputObj.request,
    currentTask: inputObj.currentTask,
    answer: inputObj.answer,
  });

  if (continuity.outcome === "pending-mismatch") {
    const reasons = ["pending-task-correlation-id-mismatch"];
    const observations = [
      continuity.reason ?? "Pending task correlation ID mismatch; answer ignored",
    ];
    const chooser = renderTaskStyleQuestion(
      TASK_EXECUTION_STYLES,
      inputObj.questionCapability,
      inputObj.answer?.pendingTaskId,
    );
    return {
      schemaVersion: 1,
      kind: "substantial-work",
      policy: policySummary,
      nextAction: "choose-style",
      executionAuthorized: false,
      reasons,
      observations,
      chooser,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "choose-style",
      },
    };
  }

  if (continuity.outcome === "cancelled") {
    const reasons = ["task-selection-cancelled-by-user"];
    const observations = ["Pending task selection was cancelled"];
    return {
      schemaVersion: 1,
      kind: "substantial-work",
      policy: policySummary,
      nextAction: "choose-style",
      executionAuthorized: false,
      reasons,
      observations,
      chooser: renderTaskStyleQuestion(
        TASK_EXECUTION_STYLES,
        inputObj.questionCapability,
      ),
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "choose-style",
      },
    };
  }

  if (continuity.outcome === "status-query") {
    const reasons = ["status-query-preserves-pending-choice"];
    const observations = [
      continuity.reason ?? "Status query preserves pending task choice",
    ];
    return {
      schemaVersion: 1,
      kind: "substantial-work",
      policy: policySummary,
      nextAction: "choose-style",
      executionAuthorized: false,
      reasons,
      observations,
      chooser: renderTaskStyleQuestion(
        TASK_EXECUTION_STYLES,
        inputObj.questionCapability,
        inputObj.answer?.pendingTaskId,
      ),
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "choose-style",
      },
    };
  }

  if (continuity.outcome === "uncertain") {
    const clarification = {
      question:
        continuity.clarificationQuestion ??
        "현재 활성 작업의 후속 작업인가요, 아니면 별도의 독립 작업인가요?",
      missingFacts: ["task-relationship"],
    };
    return {
      schemaVersion: 1,
      kind: "clarification-needed",
      policy: policySummary,
      nextAction: "ask-clarification",
      executionAuthorized: false,
      taskReference: inputObj.currentTask?.taskId,
      reasons: ["active-task-relationship-uncertain"],
      observations: [
        continuity.reason ?? "Active task relationship requires clarification",
      ],
      clarification,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        policyRevision: policyView.revision,
        nextAction: "ask-clarification",
      },
    };
  }

  if (continuity.outcome === "active-related" && continuity.selectedStyle) {
    const selectedStyle = continuity.selectedStyle;
    const taskRef = continuity.taskReference;
    const reasons = ["active-task-continuity-verified"];
    const observations = [
      continuity.reason ?? `Continuing verified active task ${taskRef}`,
    ];

    return {
      schemaVersion: 1,
      kind: "continuation",
      policy: policySummary,
      nextAction: "continue-task",
      executionAuthorized: false,
      selectedStyle,
      taskReference: taskRef,
      reasons,
      observations,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: inputObj.facts ?? [],
        selectedStyle,
        taskReference: taskRef,
        policyRevision: policyView.revision,
        nextAction: "continue-task",
      },
    };
  }

  // Evaluate candidate simple operation evidence
  const evidence = await collectTaskIntakeEvidence({
    canonicalRoot: policyView.canonicalRoot,
    requestText: inputObj.request.text,
    shortGoal: inputObj.request.shortGoal,
    shortScope: inputObj.request.shortScope,
    operation: inputObj.operation,
    scopeChange: inputObj.scopeChange,
    currentTask: inputObj.currentTask,
    facts: inputObj.facts,
  });

  if (evidence.status === "eligible") {
    return {
      schemaVersion: 1,
      kind: "simple-operation",
      policy: policySummary,
      nextAction: "execute-simple",
      executionAuthorized: false,
      reasons: evidence.reasons,
      observations: evidence.observations,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: evidence.facts,
        policyRevision: policyView.revision,
        nextAction: "execute-simple",
      },
    };
  }

  if (evidence.status === "clarification-needed") {
    return {
      schemaVersion: 1,
      kind: "clarification-needed",
      policy: policySummary,
      nextAction: "ask-clarification",
      executionAuthorized: false,
      reasons: evidence.reasons,
      observations: evidence.observations,
      clarification: {
        question: evidence.question,
        missingFacts: evidence.missingFacts,
      },
      missingEvidence: evidence.missingFacts,
      handoff: {
        schemaVersion: 1,
        originalRequest: inputObj.request.text,
        shortGoal: inputObj.request.shortGoal,
        shortScope: inputObj.request.shortScope,
        knownFacts: evidence.facts,
        policyRevision: policyView.revision,
        nextAction: "ask-clarification",
      },
    };
  }

  let selectedStyle: TaskExecutionStyle | undefined;
  let chooser: TaskIntakeChooserQuestion | undefined;
  let nextAction: TaskIntakeNextAction;
  const reasons: string[] = evidence.status === "substantial-work" ? [...evidence.reasons] : [];
  const observations: string[] =
    evidence.status === "substantial-work" ? [...evidence.observations] : [];

  if (continuity.outcome === "terminal") {
    observations.push(
      continuity.reason ??
        "Previous task reached terminal status; starting fresh task intake",
    );
  }

  // Check answer if provided
  let answerResolution: TaskStyleAnswerResolution | undefined;
  if (inputObj.answer?.raw !== undefined || inputObj.answer?.canonicalStyle !== undefined) {
    answerResolution = resolveTaskStyleAnswer(
      inputObj.answer.raw ?? inputObj.answer.canonicalStyle,
    );
    if (answerResolution.resolved && answerResolution.style) {
      selectedStyle = answerResolution.style;
    }
  }

  if (policyView.effectiveMode === "strict") {
    observations.push("Strict mode policy active");
    if (selectedStyle) {
      nextAction = "choose-style";
      reasons.push("strict-mode-task-style-selected");
      observations.push(`Task style selected: ${selectedStyle}`);
    } else {
      nextAction = "choose-style";
      reasons.push("strict-mode-substantial-work-requires-style-selection");
      if (answerResolution && !answerResolution.resolved) {
        reasons.push("provided-answer-invalid-or-ambiguous");
        observations.push(answerResolution.reason ?? "Style selection remains pending");
      } else {
        observations.push("New substantial task request received without explicit style");
      }
      chooser = renderTaskStyleQuestion(
        TASK_EXECUTION_STYLES,
        inputObj.questionCapability,
        inputObj.answer?.pendingTaskId,
      );
    }
  } else {
    observations.push("Flexible mode policy active");
    nextAction = "adaptive-intake";
    reasons.push("flexible-mode-adaptive-intake");
    observations.push("Adaptive intake applies without mandatory six-style chooser");
  }

  const handoff: TaskIntakeHandoff = {
    schemaVersion: 1,
    originalRequest: inputObj.request.text,
    shortGoal: inputObj.request.shortGoal,
    shortScope: inputObj.request.shortScope,
    knownFacts: inputObj.facts ?? [],
    selectedStyle,
    policyRevision: policyView.revision,
    nextAction,
  };

  return {
    schemaVersion: 1,
    kind: "substantial-work",
    policy: policySummary,
    nextAction,
    executionAuthorized: false,
    selectedStyle,
    reasons,
    observations,
    chooser,
    handoff,
  };
}
