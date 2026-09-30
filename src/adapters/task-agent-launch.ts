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
