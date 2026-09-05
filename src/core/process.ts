import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, join } from "node:path";
import type { RedactedExcerpt, RedactionContext } from "../types.js";
import { createRedactedExcerpt, createRedactionContext } from "./redaction.js";

/**
 * Stable outcome codes. Callers branch on these rather than on a message, so a
 * refusal reads the same everywhere it is reported.
 */
export type ProcessCode =
  | "ok"
  | "non-zero-exit"
  | "timeout"
  | "output-cap"
  | "spawn-failed"
  | "unsupported-executable"
  | "environment-conflict"
  | "missing-required-environment";

export class ProcessPolicyError extends Error {
  readonly code: ProcessCode;
  constructor(code: ProcessCode, message: string) {
    super(message);
    this.name = "ProcessPolicyError";
    this.code = code;
  }
}

export interface EnvironmentPolicy {
  /** Names that must exist in `source`, or the operation refuses. */
  required?: readonly string[];
  /** Names passed through when present in `source`. */
  optional?: readonly string[];
  /** Literal values the operation sets itself. */
  literal?: Readonly<Record<string, string>>;
  /**
   * Where names are read from. Defaults to an empty environment: the ambient
   * `process.env` is never inherited implicitly.
   */
  source?: NodeJS.ProcessEnv;
}

export interface ProcessSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  environment?: EnvironmentPolicy;
  /** Written to the child's stdin, which is then closed. Omit for no input. */
  stdin?: string;
}

export interface ProcessResult {
  code: ProcessCode;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  outputCapped: boolean;
  durationMs: number;
  /** Bounded, redacted evidence plus a fingerprint of the complete stream. */
  stdout: RedactedExcerpt;
  stderr: RedactedExcerpt;
}

/**
 * Windows always hands a child a fixed set of system variables regardless of
 * the environment block a parent supplies — libuv guarantees them so the child
 * can locate the system at all. alpha-AOS cannot suppress these, so it names
 * them instead of pretending the allowlist is total.
 *
 * Three of them (`USERNAME`, `USERPROFILE`, `HOMEPATH`) are user-identifying,
 * which is why diagnostics alias private paths rather than assuming a child
 * never learned who is running it.
 */
export const PLATFORM_FLOOR_ENVIRONMENT: readonly string[] =
  process.platform === "win32"
    ? [
        "HOMEDRIVE",
        "HOMEPATH",
        "LOGONSERVER",
        "PATH",
        "SYSTEMDRIVE",
        "SYSTEMROOT",
        "TEMP",
        "USERDOMAIN",
        "USERNAME",
        "USERPROFILE",
        "WINDIR",
      ]
    : [];

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

/**
 * Upper bound on a single stdout frame that has not yet been terminated by a
 * newline. The MCP SDK's own stdio client defaults to 10 MiB; alpha-AOS is
 * deliberately narrower, because a frame that large from a locked tool server
 * is already a malfunction rather than a payload worth buffering.
 */
export const DEFAULT_MAX_MESSAGE_BYTES = 1024 * 1024;

/** Default ceiling for one awaited protocol reply. */
export const DEFAULT_MESSAGE_TIMEOUT_MS = 60_000;

/** How long a closing session waits for a voluntary exit before killing. */
const DEFAULT_CLOSE_GRACE_MS = 2_000;

/**
 * Cap on parsed-but-unclaimed frames. A server that talks without being asked
 * must not grow the parent's memory any more than one that floods stdout.
 */
const PROTOCOL_BACKLOG_LIMIT = 256;

/** Names whose values are treated as secrets when they reach a child. */
const SECRET_ENV_NAME =
  /(?:^|_)(?:secret|password|passwd|pwd|token|key|apikey|credential|auth|authorization|cookie|session)(?:$|_)/iu;

/**
 * Materializes exactly the environment an operation declared. Windows compares
 * environment names case-insensitively, so two names differing only in case are
 * an ambiguous request and are refused rather than silently resolved.
 */
export function materializeEnvironment(policy: EnvironmentPolicy = {}): Record<string, string> {
  const source = policy.source ?? {};
  const result: Record<string, string> = {};
  const byUpperCase = new Map<string, string>();

  const claim = (name: string): void => {
    const upper = name.toUpperCase();
    const previous = byUpperCase.get(upper);
    if (previous !== undefined && previous !== name) {
      throw new ProcessPolicyError(
        "environment-conflict",
        `Environment names "${previous}" and "${name}" differ only by case and cannot both be passed`,
      );
    }
    byUpperCase.set(upper, name);
  };

  for (const name of policy.required ?? []) {
    claim(name);
    const value = source[name];
    if (value === undefined) {
      throw new ProcessPolicyError("missing-required-environment", `Required environment name is absent: ${name}`);
    }
    result[name] = value;
  }
  for (const name of policy.optional ?? []) {
    claim(name);
    const value = source[name];
    if (value !== undefined) result[name] = value;
  }
  for (const [name, value] of Object.entries(policy.literal ?? {})) {
    claim(name);
    result[name] = value;
  }
  return result;
}

/**
 * Seeds a redaction context with the secret-bearing values this operation
 * itself handed to the child, so an echoed credential is caught even though it
 * matches no structural pattern.
 */
function redactionForEnvironment(environment: Record<string, string>): RedactionContext {
  const secrets: string[] = [];
  for (const [name, value] of Object.entries(environment)) {
    if (SECRET_ENV_NAME.test(name)) secrets.push(value);
  }
  return createRedactionContext({ secrets });
}

/** Collects a stream into a whole-stream hash plus a bounded head buffer. */
class BoundedStream {
  private readonly hash = createHash("sha256");
  private readonly chunks: Buffer[] = [];
  private held = 0;
  private total = 0;
  capped = false;

  constructor(private readonly limit: number) {}

  push(chunk: Buffer): void {
    this.hash.update(chunk);
    this.total += chunk.byteLength;
    if (this.held >= this.limit) {
      this.capped = true;
      return;
    }
    const room = this.limit - this.held;
    if (chunk.byteLength <= room) {
      this.chunks.push(chunk);
      this.held += chunk.byteLength;
      return;
    }
    this.chunks.push(chunk.subarray(0, room));
    this.held = this.limit;
    this.capped = true;
  }

  get totalBytes(): number {
    return this.total;
  }

  /**
   * The retained head is redacted as one string, so a secret split across
   * chunk boundaries is still caught.
   *
   * A live protocol session reads its evidence more than once, so the digest
   * is taken from a copy: `digest()` finalizes a hash permanently and would
   * make the second read throw.
   */
  snapshot(context: RedactionContext): RedactedExcerpt {
    const text = Buffer.concat(this.chunks).toString("utf8");
    const excerpt = createRedactedExcerpt(text, context);
    return {
      excerpt: excerpt.excerpt,
      capped: this.capped || excerpt.capped,
      totalBytes: this.total,
      sha256: this.hash.copy().digest("hex"),
    };
  }

  finish(context: RedactionContext): RedactedExcerpt {
    return this.snapshot(context);
  }
}

function killTree(pid: number, signal: NodeJS.Signals): void {
  if (process.platform === "win32") {
    // taskkill is an executable, not a shell, and /T reaches descendants that
    // a direct kill on the parent would leave running.
    spawnSync("taskkill.exe", ["/pid", String(pid), "/T", "/F"], { windowsHide: true, timeout: 10_000 });
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // The child already exited.
    }
  }
}

/**
 * Runs one child with no shell, an explicit environment, a deadline and an
 * output budget. The result carries only coded metadata and bounded redacted
 * excerpts — raw bytes are hashed and dropped, never returned.
 */
export async function runProcess(spec: ProcessSpec): Promise<ProcessResult> {
  const environment = materializeEnvironment(spec.environment);
  const redaction = redactionForEnvironment(environment);
  const timeoutMs = spec.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const limit = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  if (!isAbsolute(spec.executable)) {
    throw new ProcessPolicyError(
      "unsupported-executable",
      `Executable must be an absolute path to avoid PATH-search ambiguity: ${spec.executable}`,
    );
  }

  const stdout = new BoundedStream(limit);
  const stderr = new BoundedStream(limit);
  const startedAt = Date.now();

  return new Promise<ProcessResult>((resolveResult) => {
    const child = spawn(spec.executable, [...spec.args], {
      cwd: spec.cwd,
      env: environment,
      // Command and data stay separate: arguments are never parsed by a shell.
      shell: false,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: [spec.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });

    if (spec.stdin !== undefined) {
      child.stdin?.end(spec.stdin, "utf8");
      // A child that never reads its input must not fail the whole call.
      child.stdin?.on("error", () => undefined);
    }

    let settled = false;
    let timedOut = false;
    let cappedKill = false;

    const finish = (code: ProcessCode, exitCode: number | null, signal: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolveResult({
        code,
        exitCode,
        signal,
        timedOut,
        outputCapped: stdout.capped || stderr.capped,
        durationMs: Date.now() - startedAt,
        stdout: stdout.finish(redaction),
        stderr: stderr.finish(redaction),
      });
    };

    const deadline = setTimeout(() => {
      timedOut = true;
      if (child.pid !== undefined) killTree(child.pid, "SIGKILL");
    }, timeoutMs);
    deadline.unref();

    const watch = (stream: NodeJS.ReadableStream | null, sink: BoundedStream): void => {
      stream?.on("data", (chunk: Buffer) => {
        sink.push(chunk);
        // A child that keeps writing past the budget is terminated rather than
        // allowed to exhaust memory.
        if (sink.totalBytes > limit * 8 && !cappedKill) {
          cappedKill = true;
          if (child.pid !== undefined) killTree(child.pid, "SIGKILL");
        }
      });
    };
    watch(child.stdout, stdout);
    watch(child.stderr, stderr);

    child.once("error", () => {
      finish("spawn-failed", null, null);
    });
    child.once("close", (exitCode, signal) => {
      if (timedOut) return finish("timeout", exitCode, signal);
      if (cappedKill) return finish("output-cap", exitCode, signal);
      if (exitCode === 0) return finish("ok", exitCode, signal);
      finish("non-zero-exit", exitCode, signal);
    });
  });
}

// ---------------------------------------------------------------------------
// Long-lived protocol sessions
// ---------------------------------------------------------------------------

export interface ProtocolProcessSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
  environment?: EnvironmentPolicy;
  /**
   * Absolute ceiling on the whole session. A literal `0` disables only this
   * ceiling, for a deliberately long-lived proxy; every other bound still
   * applies, including the per-frame byte cap.
   */
  timeoutMs?: number;
  /** Budget for the retained, redacted stdout/stderr evidence. */
  maxOutputBytes?: number;
  /** Budget for one stdout frame not yet terminated by a newline. */
  maxMessageBytes?: number;
}

export interface ProtocolSession {
  /** Writes one newline-delimited JSON frame to the child's stdin. */
  send(message: unknown): void;
  onMessage(listener: (message: Record<string, unknown>) => void): void;
  waitFor(
    match: (message: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ): Promise<Record<string, unknown>>;
  /** Bounded, redacted, fingerprinted evidence, readable while the session lives. */
  evidence(): { stdout: RedactedExcerpt; stderr: RedactedExcerpt };
  readonly closed: Promise<ProcessResult>;
  close(): Promise<ProcessResult>;
}

interface ProtocolWaiter {
  match: (message: Record<string, unknown>) => boolean;
  resolve: (message: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Runs a long-lived newline-delimited JSON-RPC child inside the same boundary
 * `runProcess` enforces for a one-shot command: an absolute executable, no
 * shell, only the declared environment, a bounded output budget, and a child
 * tree that is terminated rather than allowed to grow a buffer.
 *
 * Being long-lived buys no exemption. The one bound a streaming reader needs
 * that a captured run does not is a cap on a single unterminated frame, which
 * is what stops a child emitting one endless line from exhausting memory.
 */
export async function openProtocolProcess(spec: ProtocolProcessSpec): Promise<ProtocolSession> {
  if (!isAbsolute(spec.executable)) {
    throw new ProcessPolicyError(
      "unsupported-executable",
      `Executable must be an absolute path to avoid PATH-search ambiguity: ${spec.executable}`,
    );
  }
  const environment = materializeEnvironment(spec.environment);
  const redaction = redactionForEnvironment(environment);
  const outputLimit = spec.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const frameLimit = spec.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES;

  const stdout = new BoundedStream(outputLimit);
  const stderr = new BoundedStream(outputLimit);
  const startedAt = Date.now();

  const child = spawn(spec.executable, [...spec.args], {
    cwd: spec.cwd,
    // Command and data stay separate: arguments are never parsed by a shell.
    shell: false,
    env: environment,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["pipe", "pipe", "pipe"],
  });
  // A child that stops reading its input must not take the parent down.
  child.stdin?.on("error", () => undefined);

  const backlog: Record<string, unknown>[] = [];
  const listeners: Array<(message: Record<string, unknown>) => void> = [];
  const waiters: ProtocolWaiter[] = [];

  let pending: Buffer = Buffer.alloc(0);
  let settled = false;
  let settledResult: ProcessResult | null = null;
  const timedOut = false;
  let frameCapped = false;

  let publish: (result: ProcessResult) => void = () => undefined;
  const closed = new Promise<ProcessResult>((resolveClosed) => {
    publish = resolveClosed;
  });

  const evidence = (): { stdout: RedactedExcerpt; stderr: RedactedExcerpt } => ({
    stdout: stdout.snapshot(redaction),
    stderr: stderr.snapshot(redaction),
  });

  /**
   * Describes a session by coded outcome and fingerprints only. Accumulated
   * child output is never interpolated into a message (D-12).
   */
  const describe = (headline: string): string => {
    const current = evidence();
    return (
      `${headline}. stdout sha256 ${current.stdout.sha256.slice(0, 12)}, ${current.stdout.totalBytes} bytes; ` +
      `stderr sha256 ${current.stderr.sha256.slice(0, 12)}, ${current.stderr.totalBytes} bytes`
    );
  };

  const settle = (code: ProcessCode, exitCode: number | null, signal: NodeJS.Signals | null): void => {
    if (settled) return;
    settled = true;
    const current = evidence();
    const result: ProcessResult = {
      code,
      exitCode,
      signal,
      timedOut,
      outputCapped: frameCapped || current.stdout.capped || current.stderr.capped,
      durationMs: Date.now() - startedAt,
      stdout: current.stdout,
      stderr: current.stderr,
    };
    settledResult = result;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new ProcessPolicyError(code, describe(`Protocol session ended before a matching message arrived (${code})`)),
      );
    }
    publish(result);
  };

  const deliver = (message: Record<string, unknown>): void => {
    for (const listener of [...listeners]) {
      try {
        listener(message);
      } catch {
        // A faulty observer must not break the session it observes.
      }
    }
    for (let index = 0; index < waiters.length; index += 1) {
      const waiter = waiters[index];
      if (waiter === undefined) continue;
      let matched = false;
      try {
        matched = waiter.match(message);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      return;
    }
    // Unclaimed frames are retained only up to a fixed depth: a server that
    // talks unprompted must not grow the parent either.
    backlog.push(message);
    if (backlog.length > PROTOCOL_BACKLOG_LIMIT) backlog.shift();
  };

  child.stdout?.on("data", (chunk: Buffer) => {
    stdout.push(chunk);
    if (settled || frameCapped) return;
    pending = pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);

    let newline = pending.indexOf(0x0a);
    while (newline >= 0) {
      const line = pending.subarray(0, newline).toString("utf8").trim();
      pending = pending.subarray(newline + 1);
      // Only object frames are parsed; anything else is server chatter and is
      // dropped rather than surfaced raw or evaluated.
      if (line.startsWith("{")) {
        try {
          const value: unknown = JSON.parse(line);
          if (typeof value === "object" && value !== null && !Array.isArray(value)) {
            deliver(value as Record<string, unknown>);
          }
        } catch {
          // Unparseable output stays counted in the stream evidence only.
        }
      }
      newline = pending.indexOf(0x0a);
    }

    // The one shape a line-oriented reader would otherwise buffer without
    // limit: a frame that never terminates.
    if (pending.byteLength > frameLimit) {
      pending = Buffer.alloc(0);
      frameCapped = true;
      if (child.pid !== undefined) killTree(child.pid, "SIGKILL");
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    // Never echoed to a terminal and never concatenated into a message.
    stderr.push(chunk);
  });

  child.once("error", () => {
    settle("spawn-failed", null, null);
  });
  child.once("close", (exitCode, signal) => {
    if (timedOut) return settle("timeout", exitCode, signal);
    if (frameCapped) return settle("output-cap", exitCode, signal);
    if (exitCode === 0) return settle("ok", exitCode, signal);
    settle("non-zero-exit", exitCode, signal);
  });

  const send = (message: unknown): void => {
    if (settled) {
      throw new ProcessPolicyError(
        settledResult?.code ?? "spawn-failed",
        describe(`Protocol session has ended and cannot accept a message (${settledResult?.code ?? "unknown"})`),
      );
    }
    child.stdin?.write(`${JSON.stringify(message)}\n`, "utf8");
  };

  const onMessage = (listener: (message: Record<string, unknown>) => void): void => {
    listeners.push(listener);
  };

  const waitFor = (
    match: (message: Record<string, unknown>) => boolean,
    timeoutMs: number = DEFAULT_MESSAGE_TIMEOUT_MS,
  ): Promise<Record<string, unknown>> => {
    for (let index = 0; index < backlog.length; index += 1) {
      const candidate = backlog[index];
      if (candidate === undefined) continue;
      let matched = false;
      try {
        matched = match(candidate);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      backlog.splice(index, 1);
      return Promise.resolve(candidate);
    }
    if (settled) {
      return Promise.reject(
        new ProcessPolicyError(
          settledResult?.code ?? "spawn-failed",
          describe(`Protocol session has ended (${settledResult?.code ?? "unknown"})`),
        ),
      );
    }
    return new Promise<Record<string, unknown>>((resolveMessage, rejectMessage) => {
      const timer = setTimeout(() => {
        const index = waiters.findIndex((entry) => entry.timer === timer);
        if (index >= 0) waiters.splice(index, 1);
        rejectMessage(
          new ProcessPolicyError("timeout", describe(`Protocol reply did not arrive within ${timeoutMs}ms (timeout)`)),
        );
      }, timeoutMs);
      waiters.push({ match, resolve: resolveMessage, reject: rejectMessage, timer });
    });
  };

  let closing: Promise<ProcessResult> | null = null;
  const close = (): Promise<ProcessResult> => {
    if (closing !== null) return closing;
    closing = (async (): Promise<ProcessResult> => {
      if (!settled) {
        try {
          child.stdin?.end();
        } catch {
          // The pipe is already gone.
        }
        await Promise.race([
          closed.then(() => undefined),
          new Promise<void>((resolveGrace) => {
            const timer = setTimeout(resolveGrace, DEFAULT_CLOSE_GRACE_MS);
            timer.unref();
          }),
        ]);
        // A child that declined to leave on its own is terminated, and so are
        // its descendants.
        if (!settled && child.pid !== undefined) killTree(child.pid, "SIGKILL");
      }
      return closed;
    })();
    return closing;
  };

  return { send, onMessage, waitFor, evidence, closed, close };
}

// ---------------------------------------------------------------------------
// Executable resolution
// ---------------------------------------------------------------------------

export function resolveCommand(command: string): string | null {
  const resolver = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(resolver, [command], { encoding: "utf8", timeout: 3000, windowsHide: true });
  if (result.status !== 0) return null;
  const paths = result.stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (process.platform !== "win32") return paths[0] ?? null;
  return paths.find((path) => extname(path).toLowerCase() === ".exe")
    ?? paths.find((path) => extname(path).toLowerCase() === ".cmd")
    ?? paths.find((path) => extname(path).toLowerCase() === ".ps1")
    ?? paths[0]
    ?? null;
}

/**
 * npm and npx ship as batch shims on Windows. Rather than handing those to an
 * interpreter, they are normalized to the running Node binary plus the exact
 * CLI script the shim would have invoked.
 */
export function resolveNodePackageCli(command: "npm" | "npx"): { executable: string; argsPrefix: string[] } {
  const resolved = resolveCommand(command);
  if (!resolved) throw new Error(`${command} was not found`);
  if (process.platform === "win32" && resolved.toLowerCase().endsWith(".cmd")) {
    const script = join(dirname(resolved), "node_modules", "npm", "bin", `${command}-cli.js`);
    if (!existsSync(script)) throw new Error(`Could not locate ${command}-cli.js beside ${resolved}`);
    return { executable: process.execPath, argsPrefix: [script] };
  }
  return { executable: resolved, argsPrefix: [] };
}

/** Script extensions that only an interpreter could run. */
const INTERPRETED_EXTENSIONS = new Set([".cmd", ".bat", ".ps1", ".psm1", ".vbs", ".wsf"]);

export function isDirectlyExecutable(commandPath: string): boolean {
  return !INTERPRETED_EXTENSIONS.has(extname(commandPath).toLowerCase());
}

/**
 * Normalizes a spec's executable, refusing anything that would need an
 * interpreter. A known npm/npx shim is the one case with a proven direct
 * equivalent; everything else is reported unsupported rather than shelled out.
 */
export function normalizeProcessSpec(spec: ProcessSpec): ProcessSpec {
  if (isDirectlyExecutable(spec.executable)) return spec;

  const base = spec.executable.toLowerCase();
  for (const command of ["npm", "npx"] as const) {
    if (!base.endsWith(`\\${command}.cmd`) && !base.endsWith(`/${command}.cmd`)) continue;
    const script = join(dirname(spec.executable), "node_modules", "npm", "bin", `${command}-cli.js`);
    if (!existsSync(script)) break;
    return { ...spec, executable: process.execPath, args: [script, ...spec.args] };
  }

  throw new ProcessPolicyError(
    "unsupported-executable",
    `Running ${extname(spec.executable)} files requires an interpreter, which alpha-AOS does not use: ${spec.executable}`,
  );
}

/**
 * Reads a version string. An interpreted shim without a proven direct
 * equivalent returns null — unsupported and reported, never simulated.
 */
export function readCommandVersion(commandPath: string): string | null {
  if (!isDirectlyExecutable(commandPath)) return null;
  const result = spawnSync(commandPath, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
    shell: false,
  });
  if (result.error) return null;
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
  return text ? text.split(/\r?\n/u)[0]?.trim() ?? null : null;
}

export function runCommandInteractive(commandPath: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}): number {
  if (!isDirectlyExecutable(commandPath)) {
    throw new ProcessPolicyError(
      "unsupported-executable",
      `Interactive launch of ${extname(commandPath)} files is unsupported: ${commandPath}`,
    );
  }
  const result = spawnSync(commandPath, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: "inherit",
    shell: false,
    windowsHide: false,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export interface CommandProbe {
  /** Resolved absolute path, or null when the command is not on PATH. */
  command: string | null;
  version: string | null;
  /** Why a version could not be read, when the command itself was found. */
  unsupportedReason: string | null;
}

/**
 * Read-only discovery for a single command. A shim with a proven direct
 * equivalent (npm, npx) is normalized; any other interpreted shim is reported
 * as found-but-unsupported rather than run through an interpreter.
 */
export function probeCommand(command: string): CommandProbe {
  const resolved = resolveCommand(command);
  if (resolved === null) return { command: null, version: null, unsupportedReason: null };

  if (isDirectlyExecutable(resolved)) {
    return { command: resolved, version: readCommandVersion(resolved), unsupportedReason: null };
  }

  if (command === "npm" || command === "npx") {
    try {
      const normalized = resolveNodePackageCli(command);
      const result = spawnSync(normalized.executable, [...normalized.argsPrefix, "--version"], {
        encoding: "utf8",
        timeout: 10_000,
        windowsHide: true,
        shell: false,
      });
      const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
      return {
        command: resolved,
        version: text ? text.split(/\r?\n/u)[0]?.trim() ?? null : null,
        unsupportedReason: null,
      };
    } catch {
      return { command: resolved, version: null, unsupportedReason: "the npm CLI script could not be located beside the shim" };
    }
  }

  return {
    command: resolved,
    version: null,
    unsupportedReason: `reading a version from ${extname(resolved)} shims would require an interpreter`,
  };
}
