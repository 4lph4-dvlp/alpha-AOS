import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redactHome } from "../core/paths.js";
import {
  PLATFORM_FLOOR_ENVIRONMENT,
  ProcessPolicyError,
  resolveCommand,
  runProcess,
  type EnvironmentPolicy,
  type ProcessResult,
  type ProcessSpec,
} from "../core/process.js";
import { resolveDirectLaunch } from "./capability-oracle.js";
import type { HarnessId } from "../types.js";
import type { TaskContract, TaskAgentPolicy } from "../core/task-contract.js";

export function taskComputerUseRoute(harness: HarnessId, contract: Pick<TaskContract, "computerUse">): { command: string; args: string[]; granted: boolean; instruction: string } {
  if (!["claude", "codex", "antigravity", "pi", "hermes"].includes(harness)) throw new Error("Unsupported computer-use harness");
  return { command: "alpha-aos", args: ["computer-use", "plan"], granted: contract.computerUse !== undefined,
    instruction: contract.computerUse ? "GUI checks must use alpha-aos computer-use plan/action/mcp with this exact approved digest and run. Reversible deterministic checks may run automatically; journal the decision. Human judgment stays manual." : "No GUI authority is granted. Offer automatic/manual verification for ordinary GSD; obtain a reviewed task grant before native input." };
}

/**
 * The names every task agent child may receive before its harness-specific
 * names. Names only: the values are read from the parent at launch and never
 * written into a policy, an argument or a record. Deduplicated without regard
 * to case, because Windows compares environment names case-insensitively and
 * `materializeEnvironment` refuses two spellings of one name.
 */
export const TASK_AGENT_BASE_ENVIRONMENT_NAMES: readonly string[] = uniqueNames([
  ...PLATFORM_FLOOR_ENVIRONMENT,
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LANG",
  "LC_ALL",
  "TZ",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
]);

/** A version probe is a cheap local question; a slow answer is a failed one. */
export const TASK_AGENT_VERSION_TIMEOUT_MS = 15_000;

export type TaskAgentRunner = (spec: ProcessSpec) => Promise<ProcessResult>;
export type TaskAgentResolver = (command: string) => string | null;

export type TaskAgentLaunch =
  | { status: "ok"; executable: string; argsPrefix: string[]; resolved: string }
  | { status: "unsupported"; reason: string };

export type HarnessVersionProbe =
  | { status: "ok"; executable: string; version: string; raw: string }
  | { status: "unsupported"; reason: string };

export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** A name-only environment policy reading from the parent, with no literals. */
export function nameOnlyEnvironment(names: readonly string[], source: NodeJS.ProcessEnv): EnvironmentPolicy {
  return { optional: [...names], source };
}

/**
 * The schema an agent CLI receives: the same contract without the top-level
 * `$schema`, `$id`, `title` and `description`, which structured-output
 * validators either reject or ignore.
 */
export function agentFacingSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const copy = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
  for (const key of ["$schema", "$id", "title", "description"]) delete copy[key];
  return copy;
}

/**
 * Resolves a harness command to something `runProcess` may launch: a native
 * executable unchanged, or the proven npm `.cmd` shim pattern as the running
 * Node binary plus the shim's own script. Anything else is unsupported and is
 * never handed to a shell.
 */
export function resolveTaskAgentLaunch(command: string, options: { resolve?: TaskAgentResolver } = {}): TaskAgentLaunch {
  let resolved: string | null;
  try {
    resolved = (options.resolve ?? resolveCommand)(command);
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return { status: "unsupported", reason: `${command} could not be located on PATH (${code})` };
  }
  if (resolved === null) return { status: "unsupported", reason: `${command} was not found on PATH` };
  const direct = resolveDirectLaunch(resolved);
  if (direct === null) {
    return {
      status: "unsupported",
      reason: `${command} resolved to ${redactHome(resolved)}, an interpreted shim with no proven direct equivalent; alpha-AOS does not shell out`,
    };
  }
  return { status: "ok", executable: direct.executable, argsPrefix: [...direct.argsPrefix], resolved };
}

const SEMANTIC_VERSION = /\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/u;

/** The first semantic version on the first line of a `--version` answer, or null. */
export function parseHarnessVersion(text: string): string | null {
  const first = text.split(/\r?\n/u, 1)[0] ?? "";
  return SEMANTIC_VERSION.exec(first)?.[1] ?? null;
}

/** The executable a record names: the script a Node launch runs, else the binary, home-aliased. */
export function reportedExecutable(launch: { executable: string; argsPrefix: readonly string[] }): string {
  return redactHome(launch.argsPrefix[0] ?? launch.executable);
}

/** Collapses whitespace and bounds a sentence for a record. */
export function boundedSentence(text: string, limit: number): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 3)}...`;
}

/** Milliseconds left before a deadline, or null when the contract sets none. */
export function remainingMilliseconds(deadlineAt: string | null, now: Date): number | null {
  if (deadlineAt === null) return null;
  const deadline = Date.parse(deadlineAt);
  if (Number.isNaN(deadline)) return 0;
  return deadline - now.getTime();
}

/** Asks a resolved harness for its version through the bounded runner. */
export async function probeLaunchVersion(
  command: string,
  launch: Extract<TaskAgentLaunch, { status: "ok" }>,
  environment: EnvironmentPolicy,
  runner: TaskAgentRunner = runProcess,
): Promise<HarnessVersionProbe> {
  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args: [...launch.argsPrefix, "--version"],
      cwd: tmpdir(),
      environment,
      timeoutMs: TASK_AGENT_VERSION_TIMEOUT_MS,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return { status: "unsupported", reason: `${command} --version could not be launched (${code})` };
  }
  if (result.code !== "ok") {
    return { status: "unsupported", reason: `${command} --version did not complete (${result.code}, exit ${String(result.exitCode)})` };
  }
  const raw = boundedSentence(result.stdout.excerpt.split(/\r?\n/u, 1)[0] ?? "", 200);
  const version = parseHarnessVersion(result.stdout.excerpt);
  if (version === null) return { status: "unsupported", reason: `${command} --version reported no semantic version` };
  return { status: "ok", executable: reportedExecutable(launch), version, raw };
}

const schemaCache = new Map<string, Record<string, unknown>>();

/** Reads one repository schema, cached by path so validators compile once. */
export async function loadAgentSchema(fileName: string, root: string): Promise<Record<string, unknown>> {
  const path = join(root, "schemas", fileName);
  const cached = schemaCache.get(path);
  if (cached !== undefined) return cached;
  const schema = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  schemaCache.set(path, schema);
  return schema;
}

export const SAFE_MODEL_ID = /^[A-Za-z0-9._:/-]+$/u;

/**
 * Resolves the explicit model identifier for a harness role from:
 * 1. direct adapter option
 * 2. contract agentPolicy (controllerModel, executorModel, reviewerModel)
 * 3. project .planning/config.json (model_profile_overrides, model_overrides, cross_ai_command)
 */
export async function resolveHarnessRoleModel(options: {
  harness: HarnessId;
  role: "controller" | "executor" | "reviewer";
  adapterModel?: string | undefined;
  agentPolicy?: TaskAgentPolicy | undefined;
  projectRoot?: string | undefined;
}): Promise<string | undefined> {
  const sanitize = (candidate: unknown): string | undefined => {
    if (typeof candidate !== "string") return undefined;
    const trimmed = candidate.trim();
    return trimmed.length > 0 && SAFE_MODEL_ID.test(trimmed) ? trimmed : undefined;
  };

  const direct = sanitize(options.adapterModel);
  if (direct !== undefined) return direct;

  const policy = options.agentPolicy;
  if (policy !== undefined) {
    if (options.role === "controller") {
      const ctrl = sanitize(policy.controllerModel) ?? (policy.controller === policy.executor ? sanitize(policy.executorModel) : undefined);
      if (ctrl !== undefined) return ctrl;
    } else if (options.role === "executor") {
      const exec = sanitize(policy.executorModel) ?? (policy.executor === policy.controller ? sanitize(policy.controllerModel) : undefined);
      if (exec !== undefined) return exec;
    } else if (options.role === "reviewer") {
      const rev = sanitize(policy.reviewerModel);
      if (rev !== undefined) return rev;
    }
  }

  if (options.projectRoot) {
    try {
      const configPath = join(options.projectRoot, ".planning", "config.json");
      const raw = await readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const overrides = parsed.model_profile_overrides;
      if (typeof overrides === "object" && overrides !== null && !Array.isArray(overrides)) {
        const record = overrides as Record<string, unknown>;
        const harnessNested = record[options.harness];
        if (typeof harnessNested === "object" && harnessNested !== null && !Array.isArray(harnessNested)) {
          const nestedRole =
            sanitize((harnessNested as Record<string, unknown>)[options.role]) ??
            (options.role === "reviewer" ? sanitize((harnessNested as Record<string, unknown>).verifier) : undefined);
          if (nestedRole !== undefined) return nestedRole;
        }
        const roleOverride =
          sanitize(record[options.role]) ??
          (options.role === "reviewer" ? sanitize(record.verifier) : undefined);
        if (roleOverride !== undefined) return roleOverride;
        if (options.role === "controller") {
          const execFallback = sanitize(record.executor);
          if (execFallback !== undefined) return execFallback;
        }
        const defaultOverride = sanitize(record.default);
        if (defaultOverride !== undefined) return defaultOverride;
      }
      const modelOverrides = parsed.model_overrides;
      if (typeof modelOverrides === "object" && modelOverrides !== null && !Array.isArray(modelOverrides)) {
        const record = modelOverrides as Record<string, unknown>;
        if (options.role === "reviewer") {
          const revOverride = sanitize(record["gsd-verifier"]) ?? sanitize(record["gsd-code-reviewer"]);
          if (revOverride !== undefined) return revOverride;
        } else if (options.role === "controller") {
          const ctrlOverride = sanitize(record["gsd-planner"]) ?? sanitize(record["gsd-roadmapper"]);
          if (ctrlOverride !== undefined) return ctrlOverride;
        } else if (options.role === "executor") {
          const execOverride = sanitize(record["gsd-executor"]) ?? sanitize(record["gsd-code-fixer"]);
          if (execOverride !== undefined) return execOverride;
        }
      }
      const crossAiCmd =
        typeof parsed.cross_ai_command === "string"
          ? parsed.cross_ai_command
          : typeof parsed.review === "object" && parsed.review !== null && typeof (parsed.review as Record<string, unknown>).cross_ai_command === "string"
            ? ((parsed.review as Record<string, unknown>).cross_ai_command as string)
            : undefined;
      if (crossAiCmd) {
        const match = crossAiCmd.match(/--model(?:\s+|=)([A-Za-z0-9._:/-]+)/u);
        const extracted = sanitize(match?.[1]);
        if (extracted !== undefined) return extracted;
      }
    } catch {
      // Optional .planning/config.json not present or unreadable
    }
  }

  return undefined;
}

/**
 * Normalizes a canonical model identifier to Antigravity's subagent Model enum.
 */
export function canonicalModelToAntigravityTier(model?: string | undefined): "pro" | "flash" | "flash_lite" | "inherit" {
  if (typeof model !== "string") return "pro";
  const m = model.toLowerCase().trim();
  if (m === "inherit" || m === "pro" || m === "flash" || m === "flash_lite") {
    return m as "pro" | "flash" | "flash_lite" | "inherit";
  }
  if (m.includes("flash-low") || m.includes("flash-lite") || m.includes("lite") || m.includes("haiku")) {
    return "flash_lite";
  }
  if (m.includes("flash") || m.includes("sonnet") || m.includes("gpt-4o-mini") || m.includes("gpt-4o")) {
    return "flash";
  }
  if (m.includes("argon") || m.includes("pro") || m.includes("opus") || m.includes("high") || m.includes("o1") || m.includes("o3")) {
    return "pro";
  }
  return "pro";
}

/**
 * Verifies that the actually dispatched model conforms to the contracted model policy.
 * Throws a ModelComplianceError if a silent downgrade or mismatch occurs.
 */
export function assertModelCompliance(options: {
  step: string;
  expectedModel: string | undefined;
  actualModel: string | undefined;
  harness: HarnessId;
}): void {
  if (!options.expectedModel) return;
  if (!options.actualModel) {
    throw new Error(
      `MODEL_ENFORCEMENT_VIOLATION: Contract requires model '${options.expectedModel}' for step '${options.step}' on harness '${options.harness}', but no model was dispatched.`,
    );
  }
  if (options.expectedModel.trim().toLowerCase() !== options.actualModel.trim().toLowerCase()) {
    throw new Error(
      `MODEL_ENFORCEMENT_VIOLATION: Contract requires model '${options.expectedModel}' for step '${options.step}', but received '${options.actualModel}'. Fail-closed to prevent silent model downgrade.`,
    );
  }
}
