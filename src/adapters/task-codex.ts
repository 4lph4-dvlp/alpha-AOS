import { lstat, mkdir, open, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packageRoot as defaultPackageRoot } from "../core/paths.js";
import { ProcessPolicyError, runProcess, type EnvironmentPolicy, type ProcessResult } from "../core/process.js";
import type { ControllerDispatchRequest, ControllerDispatchResult, ExecutorClaim } from "../core/task-run.js";
import { rejectRawCredentials, validateManagedDocument } from "../core/validation.js";
import type { RedactedExcerpt } from "../types.js";
import {
  agentFacingSchema,
  boundedSentence,
  loadAgentSchema,
  nameOnlyEnvironment,
  probeLaunchVersion,
  remainingMilliseconds,
  reportedExecutable,
  resolveTaskAgentLaunch,
  TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  uniqueNames,
  type HarnessVersionProbe,
  type TaskAgentResolver,
  type TaskAgentRunner,
} from "./task-agent-launch.js";

/** The ceiling on one controller run; a contract deadline can only shorten it. */
export const CODEX_TASK_TIMEOUT_MS = 60 * 60 * 1000;

/**
 * How much of the JSONL event stream is retained for parsing. A GSD quick task
 * narrates many tool calls, so the diagnostic-sized default would truncate
 * every real run; past this bound the stream is `not-retained`, never guessed.
 */
export const CODEX_TASK_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Names only. Codex keeps its login under CODEX_HOME (default `~/.codex`,
 * reached through HOME/USERPROFILE) or reads OPENAI_API_KEY; a missing name is
 * fixed by adding the NAME here with its reason, never by passing a value.
 */
export const CODEX_TASK_ENVIRONMENT_NAMES: readonly string[] = uniqueNames([
  ...TASK_AGENT_BASE_ENVIRONMENT_NAMES,
  "CODEX_HOME",
  "OPENAI_API_KEY",
]);

const CLAIM_MAX_BYTES = 64 * 1024;
const CLAIM_SUMMARY_LIMIT = 2000;
const CLAIM_AUTHORITY_LIMIT = 500;
const CLAIM_GSD_TEXT_LIMIT = 200;
const EVENT_MESSAGE_LIMIT = 300;
const DETAIL_LIMIT = 400;

export type CodexTerminal = "completed" | "failed" | "not-retained" | "missing";

export interface CodexEvents {
  sessionId: string | null;
  terminal: CodexTerminal;
  usage: Record<string, number> | null;
  message: string | null;
  eventCount: number;
  unparsedLines: number;
}

export interface CodexClaimRead {
  claim: ExecutorClaim | null;
  issue: string | null;
}

export interface CodexAdapterOptions {
  runner?: TaskAgentRunner;
  resolve?: TaskAgentResolver;
  packageRoot?: string;
  source?: NodeJS.ProcessEnv;
  now?: () => Date;
}

interface ExecutorResultDocument {
  schemaVersion: 1;
  status: ExecutorClaim["status"];
  summary: string;
  gsd: { quickId: string | null; summaryPath: string | null };
  authorityRequest: { effect: string; reason: string } | null;
  decisionsLogged: number;
}

export function codexTaskEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  _options: { gitConfigGlobal?: string } = {},
): EnvironmentPolicy {
  return nameOnlyEnvironment(CODEX_TASK_ENVIRONMENT_NAMES, source);
}

export const CODEX_TASK_PERMISSION_PROFILE = "alpha-aos-task";

export function codexGitAuthorityOverrides(_gitDirectory: string): string[] {
  throw new Error("codexGitAuthorityOverrides is not implemented");
}

export async function writeCodexRunGitConfig(_options: {
  workDirectory: string;
  projectRoot: string;
  globalConfigPath?: string;
}): Promise<string> {
  throw new Error("writeCodexRunGitConfig is not implemented");
}

/**
 * The whole controller argument vector. The sandbox is always
 * `workspace-write` confined by `-C` to the project root; the prompt arrives on
 * stdin (`-`), never in the argument vector.
 */
export function codexControllerArgs(paths: {
  projectRoot: string;
  outputSchemaPath: string;
  lastMessagePath: string;
  gitDirectory: string | null;
}): string[] {
  return [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox",
    "workspace-write",
    "-C",
    paths.projectRoot,
    "--output-schema",
    paths.outputSchemaPath,
    "-o",
    paths.lastMessagePath,
    "-",
  ];
}

export async function probeCodexVersion(options: CodexAdapterOptions = {}): Promise<HarnessVersionProbe> {
  const launch = resolveTaskAgentLaunch("codex", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") return launch;
  return probeLaunchVersion("codex", launch, codexTaskEnvironment(options.source ?? process.env), options.runner ?? runProcess);
}

function numericFields(value: unknown): Record<string, number> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const result: Record<string, number> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    if (typeof field === "number" && Number.isFinite(field)) result[key] = field;
  }
  return result;
}

function eventMessage(event: Record<string, unknown>): string | null {
  const error = event.error;
  if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") {
    return boundedSentence((error as Record<string, unknown>).message as string, EVENT_MESSAGE_LIMIT);
  }
  if (typeof event.message === "string") return boundedSentence(event.message, EVENT_MESSAGE_LIMIT);
  return null;
}

/**
 * Reads the `codex exec --json` event stream. The final turn event decides the
 * terminal: `turn.completed` is completed and `turn.failed` is failed; an
 * `error` event decides only when no turn ended, because Codex also reports
 * recoverable stream errors before a turn completes. A capped stream is
 * `not-retained`: its end was never seen, so no completion is inferred.
 */
export function parseCodexEvents(stdout: RedactedExcerpt, outputCapped: boolean): CodexEvents {
  let sessionId: string | null = null;
  let usage: Record<string, number> | null = null;
  let turnTerminal: "completed" | "failed" | null = null;
  let turnMessage: string | null = null;
  let errorMessage: string | null = null;
  let sawError = false;
  let eventCount = 0;
  let unparsedLines = 0;

  for (const line of stdout.excerpt.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      unparsedLines += 1;
      continue;
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      unparsedLines += 1;
      continue;
    }
    eventCount += 1;
    const event = parsed as Record<string, unknown>;
    switch (event.type) {
      case "thread.started":
        if (typeof event.thread_id === "string" && sessionId === null) sessionId = boundedSentence(event.thread_id, 200);
        break;
      case "turn.completed":
        turnTerminal = "completed";
        turnMessage = null;
        usage = numericFields(event.usage);
        break;
      case "turn.failed":
        turnTerminal = "failed";
        turnMessage = eventMessage(event);
        break;
      case "error":
        sawError = true;
        errorMessage = eventMessage(event) ?? errorMessage;
        break;
      default:
        break;
    }
  }

  const base = { sessionId, usage, eventCount, unparsedLines };
  if (outputCapped || stdout.capped) return { ...base, terminal: "not-retained", message: "the event stream exceeded its retained bound" };
  if (turnTerminal === "completed") return { ...base, terminal: "completed", message: null };
  if (turnTerminal === "failed") return { ...base, terminal: "failed", message: turnMessage ?? errorMessage };
  if (sawError) return { ...base, terminal: "failed", message: errorMessage };
  return { ...base, terminal: "missing", message: null };
}

async function readBoundedText(path: string, limit: number): Promise<{ text: string } | { issue: string }> {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return { issue: "the executor wrote no final message" };
    return { issue: `the executor final message could not be read (${code ?? "unknown"})` };
  }
  if (info.isSymbolicLink()) return { issue: "the executor final message is a link and is not followed" };
  if (!info.isFile()) return { issue: "the executor final message is not a regular file" };
  if (info.size > limit) return { issue: `the executor final message exceeds ${limit} bytes` };

  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, limit + 1, 0);
    if (bytesRead > limit) return { issue: `the executor final message exceeds ${limit} bytes` };
    try {
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead)) };
    } catch {
      return { issue: "the executor final message is not UTF-8 text" };
    }
  } finally {
    await handle.close();
  }
}

/**
 * Reads the executor's own claim from the `-o` last-message file. It is
 * untrusted data: a link, an oversize file, invalid JSON, a schema violation,
 * a credential-shaped value or an over-long field is an issue and no claim.
 */
export async function readCodexClaim(path: string, schema: Record<string, unknown>): Promise<CodexClaimRead> {
  const read = await readBoundedText(path, CLAIM_MAX_BYTES);
  if ("issue" in read) return { claim: null, issue: read.issue };

  const validation = validateManagedDocument<ExecutorResultDocument>({
    text: read.text,
    format: "json",
    kind: "task-agent-output",
    schema,
    domain: rejectRawCredentials,
  });
  if (!validation.ok || validation.value === null) {
    const first = validation.issues[0];
    const where = first === undefined ? validation.status : `${first.code} at ${first.documentPath}`;
    return { claim: null, issue: `the executor final message is invalid: ${where}` };
  }
  if (Object.keys(validation.extensions).length > 0) {
    return { claim: null, issue: "the executor final message carries extension keys" };
  }
  const document = validation.value;
  if (document.summary.length > CLAIM_SUMMARY_LIMIT) {
    return { claim: null, issue: `the executor summary exceeds ${CLAIM_SUMMARY_LIMIT} characters` };
  }
  const authority = document.authorityRequest;
  if (authority !== null && (authority.effect.length > CLAIM_AUTHORITY_LIMIT || authority.reason.length > CLAIM_AUTHORITY_LIMIT)) {
    return { claim: null, issue: `the executor authority request exceeds ${CLAIM_AUTHORITY_LIMIT} characters` };
  }
  for (const value of [document.gsd.quickId, document.gsd.summaryPath]) {
    if (value !== null && value.length > CLAIM_GSD_TEXT_LIMIT) {
      return { claim: null, issue: `the executor GSD reference exceeds ${CLAIM_GSD_TEXT_LIMIT} characters` };
    }
  }
  return {
    claim: {
      status: document.status,
      summary: document.summary,
      authorityRequest: authority === null ? null : { effect: authority.effect, reason: authority.reason },
      gsdQuickId: document.gsd.quickId,
    },
    issue: null,
  };
}

function notLaunched(processCode: string, detail: string, extra: Partial<ControllerDispatchResult> = {}): ControllerDispatchResult {
  return {
    harness: "codex",
    version: null,
    executable: null,
    sessionId: null,
    exitCode: null,
    processCode,
    terminal: "missing",
    claim: null,
    detail: boundedSentence(detail, DETAIL_LIMIT),
    ...extra,
  };
}

function failureDetail(result: ProcessResult, events: CodexEvents, claimIssue: string | null): string | null {
  if (result.code !== "ok") {
    return `codex exec ended with ${result.code} (exit ${String(result.exitCode)})${events.message === null ? "" : `: ${events.message}`}`;
  }
  if (events.terminal !== "completed") {
    return `codex exec exited 0 but its terminal event is ${events.terminal}${events.message === null ? "" : `: ${events.message}`}`;
  }
  return claimIssue;
}

/**
 * Runs Codex as the single GSD controller and executor for one approved
 * contract. Every launch goes through the bounded process boundary: absolute
 * executable, fixed arguments, name-only environment, deadline-bounded
 * timeout and an output cap. The returned claim is the executor's word only.
 */
export async function runCodexController(
  request: ControllerDispatchRequest,
  options: CodexAdapterOptions = {},
): Promise<ControllerDispatchResult> {
  const clock = options.now ?? (() => new Date());
  const runner = options.runner ?? runProcess;
  const environment = codexTaskEnvironment(options.source ?? process.env);

  const launch = resolveTaskAgentLaunch("codex", options.resolve === undefined ? {} : { resolve: options.resolve });
  if (launch.status !== "ok") return notLaunched("unsupported-executable", launch.reason);

  const executable = reportedExecutable(launch);
  const before = remainingMilliseconds(request.deadlineAt, clock());
  if (before !== null && before <= 0) {
    return notLaunched("deadline", "the contract deadline passed before codex was launched", { executable });
  }

  const probe = await probeLaunchVersion("codex", launch, environment, runner);
  const version = probe.status === "ok" ? probe.version : null;

  const remaining = remainingMilliseconds(request.deadlineAt, clock());
  if (remaining !== null && remaining <= 0) {
    return notLaunched("deadline", "the contract deadline passed before codex was launched", { executable, version });
  }

  const workDirectory = join(request.scratchRoot, "codex");
  await mkdir(workDirectory, { recursive: true });
  const outputSchemaPath = join(workDirectory, "executor-result.schema.json");
  const lastMessagePath = join(workDirectory, "last-message.json");
  const schema = await loadAgentSchema("task-executor-result.schema.json", options.packageRoot ?? defaultPackageRoot());
  await writeFile(outputSchemaPath, `${JSON.stringify(agentFacingSchema(schema), null, 2)}\n`, "utf8");
  // A final message left from anything earlier must never be read as this run's.
  await rm(lastMessagePath, { force: true });

  let result: ProcessResult;
  try {
    result = await runner({
      executable: launch.executable,
      args: [...launch.argsPrefix, ...codexControllerArgs({ projectRoot: request.projectRoot, outputSchemaPath, lastMessagePath, gitDirectory: null })],
      cwd: request.projectRoot,
      stdin: request.prompt,
      environment,
      timeoutMs: remaining === null ? CODEX_TASK_TIMEOUT_MS : Math.min(CODEX_TASK_TIMEOUT_MS, remaining),
      maxOutputBytes: CODEX_TASK_OUTPUT_BYTES,
      excerptBytes: CODEX_TASK_OUTPUT_BYTES,
    });
  } catch (error) {
    const code = error instanceof ProcessPolicyError ? error.code : "spawn-failed";
    return notLaunched(code, `codex exec could not be launched (${code})`, { executable, version });
  }

  const events = parseCodexEvents(result.stdout, result.outputCapped);
  const read = await readCodexClaim(lastMessagePath, schema);
  const detail = failureDetail(result, events, read.issue);
  return {
    harness: "codex",
    version,
    executable,
    sessionId: events.sessionId,
    exitCode: result.exitCode,
    processCode: result.code,
    terminal: events.terminal,
    claim: read.claim,
    detail: detail === null ? null : boundedSentence(detail, DETAIL_LIMIT),
  };
}
