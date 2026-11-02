import { createHash, randomBytes } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessId } from "../types.js";
import {
  resolveProjectBehavior,
  type ProjectBehaviorInput,
} from "./behavior-policy.js";
import { findPackageRoot } from "./paths.js";
import {
  computeHandoffContentDigest,
  persistTaskBootstrapHandoff,
  readTaskBootstrapHandoff,
  resolveBootstrapStoragePath,
  TaskBootstrapStoreError,
  validateTaskBootstrapHandoffLimits,
  type TaskBootstrapHandoff,
} from "./task-bootstrap-store.js";
import {
  inspectGsdProjectReadiness,
  type GsdProjectReadiness,
  type GsdProjectReadinessDiagnosis,
  type GsdToolsRunner,
} from "./task-gsd-readiness.js";
import {
  planNativeBootstrapRecovery,
  type NativeBootstrapRecoveryPlan,
} from "./task-bootstrap-recovery.js";
import type { ExplicitCommandRoute } from "./task-intake-explicit.js";
import type { TaskExecutionStyle } from "./task-intake.js";
import { parseManagedDocument, validateAgainstSchema } from "./validation.js";
import type { MutationSession } from "./writer-lock.js";

const MAX_INPUT_BYTES = 16 * 1024;

export type TaskBootstrapOperation =
  | "prepare"
  | "inspect"
  | "claim"
  | "link"
  | "acknowledge"
  | "cancel";

export interface TaskBootstrapErrorOptions {
  readonly code: string;
  readonly path?: string | undefined;
  readonly cause: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;
}

export class TaskBootstrapError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly causeDescription: string;
  readonly causeCategory?: string | undefined;
  readonly remediation: string;

  constructor(options: TaskBootstrapErrorOptions) {
    super(`${options.code}: ${options.cause}`);
    this.name = "TaskBootstrapError";
    this.code = options.code;
    this.path = options.path;
    this.causeDescription = options.cause;
    this.causeCategory = options.causeCategory;
    this.remediation = options.remediation;
  }
}

export interface TaskBootstrapResult {
  readonly schemaVersion: 1;
  readonly operation: TaskBootstrapOperation;
  readonly canonicalRoot: string;
  readonly projectId: string;
  readonly pendingId: string;
  readonly contentDigest: string;
  readonly planDigest: string | null;
  readonly applied: boolean;
  readonly destinationPath: string | null;
  readonly status: "pending" | "claimed" | "linked" | "acknowledged" | "cancelled" | "exempt" | "blocked";
  readonly readinessDiagnosis: GsdProjectReadinessDiagnosis | null;
  readonly nextAction: string;
  readonly reasons: readonly string[];
  readonly selectedStyle?: TaskExecutionStyle | undefined;
  readonly commandRoute?: ExplicitCommandRoute | undefined;
  readonly recoveryPlan?: NativeBootstrapRecoveryPlan | undefined;
}

export interface PrepareTaskBootstrapOptions {
  readonly inputPath?: string | undefined;
  readonly input?: unknown | undefined;
  readonly invocationPath?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly apply?: boolean | undefined;
  readonly runner?: GsdToolsRunner | undefined;
  readonly session?: MutationSession | undefined;
}

export interface InspectTaskBootstrapOptions {
  readonly inputPath?: string | undefined;
  readonly input?: unknown | undefined;
  readonly invocationPath?: string | undefined;
  readonly stateRoot?: string | undefined;
  readonly pendingId?: string | undefined;
  readonly projectRoot?: string | undefined;
  readonly runner?: GsdToolsRunner | undefined;
}

let cachedBootstrapSchema: Record<string, unknown> | null = null;

async function getBootstrapSchema(): Promise<Record<string, unknown>> {
  if (cachedBootstrapSchema) return cachedBootstrapSchema;
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const pkgRoot = findPackageRoot(currentDir) ?? resolve(currentDir, "..", "..");
  const schemaPath = join(pkgRoot, "schemas", "task-bootstrap.schema.json");
  const raw = await readFile(schemaPath, "utf8");
  cachedBootstrapSchema = JSON.parse(raw) as Record<string, unknown>;
  return cachedBootstrapSchema;
}

async function loadAndValidatePacket(options: {
  inputPath?: string | undefined;
  input?: unknown | undefined;
}): Promise<Record<string, unknown>> {
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
      throw new TaskBootstrapError({
        code: "unreadable-input",
        path: normPath,
        cause: code === "ENOENT" ? "Input file does not exist" : "Input file could not be accessed",
        causeCategory: "file-access",
        remediation: "Provide a valid, accessible file path to --input.",
      });
    }

    if (!fileLstat.isFile()) {
      throw new TaskBootstrapError({
        code: "not-a-file",
        path: normPath,
        cause: "Input path is not a regular file",
        causeCategory: "not-a-file",
        remediation: "Provide a path to a regular JSON file.",
      });
    }

    if (fileLstat.size > MAX_INPUT_BYTES) {
      throw new TaskBootstrapError({
        code: "input-too-large",
        path: normPath,
        cause: `Input file exceeds maximum size limit of 16 KiB (${fileLstat.size} bytes > ${MAX_INPUT_BYTES} bytes)`,
        causeCategory: "byte-budget",
        remediation: "Reduce input size below 16 KiB.",
      });
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(normPath);
    } catch {
      throw new TaskBootstrapError({
        code: "unreadable-input",
        path: normPath,
        cause: "Failed to read input file",
        causeCategory: "read-failed",
        remediation: "Ensure the file has read permissions.",
      });
    }

    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      rawText = decoder.decode(buffer);
    } catch {
      throw new TaskBootstrapError({
        code: "invalid-input",
        path: normPath,
        cause: "Input file contains invalid UTF-8 byte sequences",
        causeCategory: "utf8-decode-error",
        remediation: "Encode the packet file in valid UTF-8 without malformed multibyte sequences.",
      });
    }
  } else if (typeof options.input === "string") {
    const buf = Buffer.from(options.input, "utf8");
    if (buf.length > MAX_INPUT_BYTES) {
      throw new TaskBootstrapError({
        code: "input-too-large",
        cause: `Input exceeds 16 KiB limit (${buf.length} bytes > ${MAX_INPUT_BYTES} bytes)`,
        remediation: "Reduce input size below 16 KiB.",
      });
    }
    rawText = options.input;
  } else if (typeof options.input === "object" && options.input !== null) {
    rawText = JSON.stringify(options.input);
  } else {
    throw new TaskBootstrapError({
      code: "empty-input",
      cause: "No input provided for task bootstrap",
      remediation: "Provide a JSON input file via --input.",
    });
  }

  if (rawText.trim().length === 0) {
    throw new TaskBootstrapError({
      code: "empty-input",
      path: filePathForDiagnostics,
      cause: "Input file is empty",
      causeCategory: "empty-file",
      remediation: "Provide a valid, non-empty JSON bootstrap packet object.",
    });
  }

  const parseResult = parseManagedDocument({ text: rawText, format: "json" });
  if (!parseResult.ok) {
    const isDuplicate = parseResult.issues.some((i) => i.code === "syntax.duplicate-key");
    throw new TaskBootstrapError({
      code: isDuplicate ? "duplicate-key" : "invalid-json",
      path: filePathForDiagnostics,
      cause: isDuplicate ? "Input file contains duplicate JSON key" : "Input file is not valid JSON",
      causeCategory: isDuplicate ? "duplicate-key" : "invalid-json",
      remediation: isDuplicate
        ? "Ensure each key appears exactly once in the JSON document."
        : "Ensure the file contains valid JSON syntax.",
    });
  }

  const value = parseResult.value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TaskBootstrapError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input document must be a top-level JSON object",
      causeCategory: "invalid-shape",
      remediation: "Wrap input fields in a top-level JSON object.",
    });
  }

  const schema = await getBootstrapSchema();
  const schemaIssues = validateAgainstSchema(value, schema);
  if (schemaIssues.length > 0) {
    throw new TaskBootstrapError({
      code: "schema-validation",
      path: filePathForDiagnostics,
      cause: "Input file does not adhere to task bootstrap schema",
      causeCategory: "schema-validation",
      remediation: `Fix schema issues: ${schemaIssues.map((i) => `${i.documentPath}: expected ${i.expected}`).join("; ")}`,
    });
  }

  return value as Record<string, unknown>;
}

export function computeBootstrapPlanDigest(options: {
  canonicalRoot: string;
  projectId: string;
  pendingId: string;
  contentDigest: string;
  controller: HarnessId;
  workflow: string;
}): string {
  const content = JSON.stringify({
    canonicalRoot: options.canonicalRoot,
    projectId: options.projectId,
    pendingId: options.pendingId,
    contentDigest: options.contentDigest,
    controller: options.controller,
    workflow: options.workflow,
  });
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function prepareTaskBootstrap(
  options: PrepareTaskBootstrapOptions,
): Promise<TaskBootstrapResult> {
  const packet = await loadAndValidatePacket(options);
  const invocationPath = options.invocationPath ?? process.cwd();

  const projectRoot = typeof packet.projectRoot === "string" ? packet.projectRoot : undefined;
  const boundProjectRoot = typeof packet.boundProjectRoot === "string" ? packet.boundProjectRoot : undefined;

  // 1. Resolve canonical root and behavior policy
  const behaviorInput: ProjectBehaviorInput = {
    invocationPath,
    projectRoot,
    boundProjectRoot,
    stateRoot: options.stateRoot,
  };
  const policyView = await resolveProjectBehavior(behaviorInput);
  const canonicalRoot = policyView.canonicalRoot;
  const projectId = policyView.projectId;

  const controller = (packet.controller ?? "codex") as HarnessId;
  const workflow = typeof packet.workflow === "string" ? packet.workflow : "quick";
  const phase = typeof packet.phase === "string" ? packet.phase : undefined;

  // 2. Resolve request payload
  let requestText = "";
  let shortGoal: string | undefined;
  let shortScope: string | undefined;
  let knownFacts: Array<{ fact: string; source?: string; detail?: string }> = [];
  let selectedStyle: TaskExecutionStyle | undefined;
  let commandRoute: ExplicitCommandRoute | undefined;

  if (typeof packet.request === "object" && packet.request !== null) {
    const req = packet.request as Record<string, unknown>;
    requestText = typeof req.text === "string" ? req.text : "";
    shortGoal = typeof req.shortGoal === "string" ? req.shortGoal : undefined;
    shortScope = typeof req.shortScope === "string" ? req.shortScope : undefined;
  } else if (typeof packet.intakeInput === "object" && packet.intakeInput !== null) {
    const intake = packet.intakeInput as Record<string, unknown>;
    if (typeof intake.request === "object" && intake.request !== null) {
      const req = intake.request as Record<string, unknown>;
      requestText = typeof req.text === "string" ? req.text : "";
      shortGoal = typeof req.shortGoal === "string" ? req.shortGoal : undefined;
      shortScope = typeof req.shortScope === "string" ? req.shortScope : undefined;
    }
  }

  if (typeof packet.selectedStyle === "string") {
    selectedStyle = packet.selectedStyle as TaskExecutionStyle;
  }
  if (typeof packet.commandRoute === "object" && packet.commandRoute !== null) {
    commandRoute = packet.commandRoute as unknown as ExplicitCommandRoute;
  }
  if (Array.isArray(packet.facts)) {
    knownFacts = packet.facts as Array<{ fact: string; source?: string; detail?: string }>;
  }

  if (!requestText || requestText.trim().length === 0) {
    throw new TaskBootstrapError({
      code: "missing-request-text",
      cause: "Original request text is required to prepare task bootstrap.",
      causeCategory: "missing-field",
      remediation: "Provide request.text in bootstrap input packet.",
    });
  }

  // 3. Resolve pending ID
  let pendingId: string;
  if (typeof packet.pendingId === "string" && packet.pendingId.trim().length > 0) {
    pendingId = packet.pendingId.trim();
  } else {
    pendingId = `pending-${randomBytes(8).toString("hex")}`;
  }

  // 4. Perform fresh readiness check
  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller,
      workflow,
      phase,
      projectRoot: canonicalRoot,
      boundProjectRoot,
    },
    invocationPath: canonicalRoot,
    stateRoot: options.stateRoot,
    runner: options.runner,
  });

  const recoveryPlan = await planNativeBootstrapRecovery({ canonicalRoot, readiness });

  if (readiness.diagnosis === "missing-runtime" || readiness.diagnosis === "probe-error") {
    return {
      schemaVersion: 1,
      operation: "prepare",
      canonicalRoot,
      projectId,
      pendingId,
      contentDigest: "",
      planDigest: null,
      applied: false,
      destinationPath: null,
      status: "blocked",
      readinessDiagnosis: readiness.diagnosis,
      nextAction: readiness.nextAction,
      reasons: readiness.reasons,
      selectedStyle,
      commandRoute,
      recoveryPlan,
    };
  }

  if (readiness.diagnosis === "partial-project" && recoveryPlan.status === "blocked") {
    return {
      schemaVersion: 1,
      operation: "prepare",
      canonicalRoot,
      projectId,
      pendingId,
      contentDigest: "",
      planDigest: null,
      applied: false,
      destinationPath: null,
      status: "blocked",
      readinessDiagnosis: readiness.diagnosis,
      nextAction: recoveryPlan.nativeAction,
      reasons: recoveryPlan.reasons,
      selectedStyle,
      commandRoute,
      recoveryPlan,
    };
  }

  // 5. Construct Handoff record
  const now = new Date().toISOString();
  const partialHandoff: Omit<TaskBootstrapHandoff, "contentDigest"> = {
    schemaVersion: 1,
    canonicalRoot,
    projectId,
    pendingId,
    originalRequest: {
      text: requestText,
      shortGoal,
      shortScope,
    },
    knownFacts,
    canonicalSelectedStyle: selectedStyle,
    commandRoute,
    policyRevision: policyView.revision,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  const contentDigest = computeHandoffContentDigest(partialHandoff);
  const handoff: TaskBootstrapHandoff = {
    ...partialHandoff,
    contentDigest,
  };

  try {
    validateTaskBootstrapHandoffLimits(handoff);
  } catch (err) {
    if (err instanceof TaskBootstrapStoreError) {
      throw new TaskBootstrapError({
        code: err.code,
        path: err.path,
        cause: err.causeDescription,
        causeCategory: err.causeCategory,
        remediation: err.remediation,
      });
    }
    throw err;
  }

  const stateRoot = options.stateRoot ?? join(process.env.HOME ?? process.cwd(), ".alpha-aos");
  let destinationPath: string;
  try {
    destinationPath = resolveBootstrapStoragePath(stateRoot, projectId, pendingId);
  } catch (err) {
    if (err instanceof TaskBootstrapStoreError) {
      throw new TaskBootstrapError({
        code: err.code,
        path: err.path,
        cause: err.causeDescription,
        causeCategory: err.causeCategory,
        remediation: err.remediation,
      });
    }
    throw err;
  }
  const planDigest = computeBootstrapPlanDigest({
    canonicalRoot,
    projectId,
    pendingId,
    contentDigest,
    controller,
    workflow,
  });

  const shouldApply = options.apply === true || packet.apply === true;

  if (!shouldApply) {
    // Read-only Preview
    return {
      schemaVersion: 1,
      operation: "prepare",
      canonicalRoot,
      projectId,
      pendingId,
      contentDigest,
      planDigest,
      applied: false,
      destinationPath,
      status: "pending",
      readinessDiagnosis: readiness.diagnosis,
      nextAction: `Apply bootstrap plan with 'alpha-aos task bootstrap --input <packet.json> --plan-digest ${planDigest} --apply'.`,
      reasons: [
        `Readiness diagnosed as ${readiness.diagnosis}. Bootstrap handoff previewed with zero filesystem writes.`,
        ...(recoveryPlan?.status === "resumable"
          ? [`Native recovery route: ${recoveryPlan.route} (${recoveryPlan.nativeAction})`]
          : []),
      ],
      selectedStyle,
      commandRoute,
      recoveryPlan,
    };
  }

  // With --apply: Verify plan digest
  const suppliedDigest = typeof packet.planDigest === "string" ? packet.planDigest : undefined;
  if (!suppliedDigest || suppliedDigest !== planDigest) {
    throw new TaskBootstrapError({
      code: "stale-plan-digest",
      cause: `Supplied planDigest '${suppliedDigest ?? "none"}' does not match previewed plan digest '${planDigest}'.`,
      causeCategory: "digest-mismatch",
      remediation: "Re-preview the bootstrap plan and provide the exact planDigest.",
    });
  }

  // Persist record under state root
  try {
    await persistTaskBootstrapHandoff({
      stateRoot,
      handoff,
      session: options.session,
    });
  } catch (err) {
    if (err instanceof TaskBootstrapStoreError) {
      throw new TaskBootstrapError({
        code: err.code,
        path: err.path,
        cause: err.causeDescription,
        causeCategory: err.causeCategory,
        remediation: err.remediation,
      });
    }
    throw err;
  }

  return {
    schemaVersion: 1,
    operation: "prepare",
    canonicalRoot,
    projectId,
    pendingId,
    contentDigest,
    planDigest,
    applied: true,
    destinationPath,
    status: "pending",
    readinessDiagnosis: readiness.diagnosis,
    nextAction: recoveryPlan?.status === "resumable"
      ? recoveryPlan.nativeAction
      : "Start native project initialization workflow (e.g. gsd-new-project).",
    reasons: [
      `Handoff record persisted successfully at ${destinationPath}.`,
      "Native GSD initialization may now consume known facts without retyping.",
      ...(recoveryPlan?.status === "resumable"
        ? [`Native recovery route: ${recoveryPlan.route} (${recoveryPlan.nativeAction})`]
        : []),
    ],
    selectedStyle,
    commandRoute,
    recoveryPlan,
  };
}

export async function inspectTaskBootstrap(
  options: InspectTaskBootstrapOptions,
): Promise<TaskBootstrapResult> {
  const packet = options.inputPath || options.input ? await loadAndValidatePacket(options) : {};
  const invocationPath = options.invocationPath ?? process.cwd();

  const projectRoot = options.projectRoot ?? (typeof packet.projectRoot === "string" ? packet.projectRoot : undefined);
  const pendingId = options.pendingId ?? (typeof packet.pendingId === "string" ? packet.pendingId : undefined);

  if (!pendingId) {
    throw new TaskBootstrapError({
      code: "missing-pending-id",
      cause: "inspect operation requires pendingId",
      causeCategory: "missing-field",
      remediation: "Provide pendingId in packet or options.",
    });
  }

  const behaviorInput: ProjectBehaviorInput = {
    invocationPath,
    projectRoot,
    stateRoot: options.stateRoot,
  };
  const policyView = await resolveProjectBehavior(behaviorInput);
  const canonicalRoot = policyView.canonicalRoot;
  const projectId = policyView.projectId;

  const stateRoot = options.stateRoot ?? join(process.env.HOME ?? process.cwd(), ".alpha-aos");

  let handoff: TaskBootstrapHandoff;
  try {
    handoff = await readTaskBootstrapHandoff({
      stateRoot,
      projectId,
      pendingId,
      canonicalRoot,
    });
  } catch (err) {
    if (err instanceof TaskBootstrapStoreError) {
      throw new TaskBootstrapError({
        code: err.code,
        path: err.path,
        cause: err.causeDescription,
        causeCategory: err.causeCategory,
        remediation: err.remediation,
      });
    }
    throw err;
  }

  const destinationPath = resolveBootstrapStoragePath(stateRoot, projectId, pendingId);

  // Fresh readiness and recovery projection
  const readiness = await inspectGsdProjectReadiness({
    input: {
      schemaVersion: 1,
      controller: "codex",
      workflow: "quick",
      projectRoot: canonicalRoot,
    },
    invocationPath: canonicalRoot,
    stateRoot: options.stateRoot,
    runner: options.runner,
  });

  const recoveryPlan = await planNativeBootstrapRecovery({ canonicalRoot, readiness });

  return {
    schemaVersion: 1,
    operation: "inspect",
    canonicalRoot,
    projectId,
    pendingId,
    contentDigest: handoff.contentDigest,
    planDigest: null,
    applied: false,
    destinationPath,
    status: handoff.status,
    readinessDiagnosis: readiness.diagnosis,
    nextAction: recoveryPlan.status === "resumable" && handoff.status === "pending"
      ? recoveryPlan.nativeAction
      : handoff.status === "pending"
        ? "Execute native initialization and link generated task reference."
        : "Inspect task status or continue workflow.",
    reasons: [
      `Record inspected: status is '${handoff.status}', policy revision is '${handoff.policyRevision}'.`,
      `Readiness diagnosed as '${readiness.diagnosis}', recovery route '${recoveryPlan.route}'.`,
    ],
    selectedStyle: handoff.canonicalSelectedStyle,
    commandRoute: handoff.commandRoute,
    recoveryPlan,
  };
}

export function buildNativeBootstrapInput(
  handoff: TaskBootstrapHandoff,
  recoveryPlan?: NativeBootstrapRecoveryPlan,
): string {
  const sections: string[] = [
    `# Project Task Context (${handoff.pendingId})`,
    "",
    `Goal: ${handoff.originalRequest.shortGoal ?? handoff.originalRequest.text.slice(0, 100)}`,
  ];

  if (handoff.originalRequest.shortScope) {
    sections.push(`Scope: ${handoff.originalRequest.shortScope}`);
  }

  sections.push("");
  sections.push("## Known Facts from User Request");
  if (handoff.knownFacts.length === 0) {
    sections.push("- (No specific technical facts supplied)");
  } else {
    for (const item of handoff.knownFacts) {
      sections.push(`- [${item.source ?? "user-request"}] ${item.fact}${item.detail ? ` (${item.detail})` : ""}`);
    }
  }

  if (handoff.commandRoute) {
    sections.push("");
    sections.push(`Command Route: ${handoff.commandRoute.command} (workflow: ${handoff.commandRoute.workflow})`);
  }
  if (handoff.canonicalSelectedStyle) {
    sections.push(`Selected Style: ${handoff.canonicalSelectedStyle}`);
  }

  if (recoveryPlan) {
    sections.push("");
    sections.push(`## Recovery Guidance (${recoveryPlan.route})`);
    sections.push(`Status: ${recoveryPlan.status}`);
    if (recoveryPlan.completedSteps.length > 0) {
      sections.push("Completed Native Steps:");
      for (const step of recoveryPlan.completedSteps) {
        sections.push(`- ${step}`);
      }
    }
    sections.push(`First Missing Stage: ${recoveryPlan.firstMissingStep ?? "None"}`);
    if (recoveryPlan.remainingSteps.length > 0) {
      sections.push("Remaining Native Stages:");
      for (const step of recoveryPlan.remainingSteps) {
        sections.push(`- ${step}`);
      }
    }
    sections.push(`Native Action: ${recoveryPlan.nativeAction}`);
    sections.push("");
    sections.push("Preservation Guarantees:");
    sections.push("- Existing planning artifacts and unrelated user working tree files MUST be preserved byte for byte.");
    sections.push("- Resumed initialization MUST NOT overwrite or regenerate already completed artifacts.");
    if (recoveryPlan.artifactCheckpoints.length > 0) {
      sections.push("Required Artifact Checkpoints:");
      for (const cp of recoveryPlan.artifactCheckpoints) {
        sections.push(`- ${cp}`);
      }
    }
  }

  sections.push("");
  sections.push("Note: Confirm any missing or ambiguous requirements directly with the user.");
  sections.push("Do not assume pre-approval for unstated architecture decisions.");

  return sections.join("\n");
}

export function formatTaskBootstrapResult(result: TaskBootstrapResult): string {
  const lines: string[] = [
    `Operation: ${result.operation}`,
    `Project: ${result.canonicalRoot}`,
    `Pending ID: ${result.pendingId}`,
    `Status: ${result.status}`,
    `Applied: ${result.applied ? "true" : "false"}`,
    `Content digest: ${result.contentDigest || "none"}`,
  ];
  if (result.planDigest) {
    lines.push(`Plan digest: ${result.planDigest}`);
  }
  if (result.destinationPath) {
    lines.push(`Storage path: ${result.destinationPath}`);
  }
  if (result.readinessDiagnosis) {
    lines.push(`Readiness: ${result.readinessDiagnosis}`);
  }
  if (result.recoveryPlan) {
    lines.push(`Recovery route: ${result.recoveryPlan.route} (${result.recoveryPlan.status})`);
    if (result.recoveryPlan.firstMissingStep) {
      lines.push(`First missing stage: ${result.recoveryPlan.firstMissingStep}`);
    }
    if (result.recoveryPlan.completedSteps.length > 0) {
      lines.push(`Completed steps: ${result.recoveryPlan.completedSteps.join(", ")}`);
    }
    lines.push(`Native recovery action: ${result.recoveryPlan.nativeAction}`);
  }
  if (result.selectedStyle) {
    lines.push(`Selected style: ${result.selectedStyle}`);
  }
  if (result.commandRoute) {
    lines.push(`Command route: ${result.commandRoute.command} (${result.commandRoute.workflow})`);
  }
  lines.push(`Next action: ${result.nextAction}`);
  if (result.reasons.length > 0) {
    lines.push("Reasons:");
    for (const r of result.reasons) {
      lines.push(`  - ${r}`);
    }
  }
  return lines.join("\n");
}
