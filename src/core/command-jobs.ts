import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, rename, stat, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  waitForCompletion,
  validateNumericFlag,
  type ObserverSettlement,
  DEFAULT_OBSERVER_TIMEOUT_MS,
  MAX_OBSERVER_TIMEOUT_MS,
} from "./completion-wait.js";
import { isProcessAlive, syncDirectory } from "./writer-lock.js";
import {
  isDirectlyExecutable,
  resolveCommand,
  spawnDetachedProcess,
  type DetachedProcessHandle,
  type EnvironmentPolicy,
} from "./process.js";
import { packageRoot } from "./paths.js";
import { validateAgainstSchema } from "./validation.js";

export const DEFAULT_JOB_DEADLINE_MS = 20 * 60 * 1000; // 20 minutes
export const MAX_JOB_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_RECORD_BYTES = 512 * 1024; // 512 KiB
export const MAX_COMBINED_OUTPUT_BYTES = 64 * 1024; // 64 KiB

export const JOB_ID_REGEX = /^[a-zA-Z0-9_-]{8,64}$/;

export const ORDINARY_COMMAND_ENV_ALLOWLIST = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "HOME",
  "USERPROFILE",
  "HOMEDRIVE",
  "HOMEPATH",
  "APPDATA",
  "LOCALAPPDATA",
  "LANG",
  "LC_ALL",
] as const;

export const SECRET_ENV_NAME_PATTERN =
  /(?:^|_)(?:secret|password|passwd|pwd|token|key|apikey|credential|auth|authorization|cookie|session)(?:$|_)/iu;

export const STRUCTURAL_CREDENTIAL_PATTERNS: readonly RegExp[] = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/iu,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}\b/u,
  /\bsk-[A-Za-z0-9_-]{16,}\b/u,
  /\bAKIA[0-9A-Z]{12,}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{16,}\b/u,
  /(?:--password|--token|--api[-_]?key|--secret|--auth)[=\s]\S+/iu,
  /Bearer\s+[A-Za-z0-9._~+/-]+=*/iu,
];

export interface CommandJobOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly combined: string;
  readonly truncated: boolean;
  readonly totalBytes: number;
}

export interface CommandJobError {
  readonly code: string;
  readonly message: string;
}

export interface CommandJobRecord {
  readonly schemaVersion: 1;
  readonly kind: "command-job";
  readonly jobId: string;
  readonly ownerToken: string;
  readonly specDigest: string;
  readonly status: "pending" | "running" | "completed" | "failed" | "cancelled" | "timed_out" | "orphaned";
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly acknowledgedAt?: string | null;
  readonly finishedAt: string | null;
  readonly stateRevision?: number;
  readonly cwd: string;
  readonly command: string;
  readonly deadlineMs: number;
  readonly workerPid: number | null;
  readonly workerHost: string | null;
  readonly childPid: number | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly cancelRequested: boolean;
  readonly cancelRequestedAt: string | null;
  readonly cancelDelivered: boolean | null;
  readonly cancelConfirmedAt: string | null;
  readonly durationMs: number | null;
  readonly output: CommandJobOutput | null;
  readonly error: CommandJobError | null;
}

export interface PrivateLaunchSpec {
  readonly schemaVersion: 1;
  readonly kind: "command-job-launch";
  readonly jobId: string;
  readonly ownerToken: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly deadlineMs: number;
  readonly createdAt: string;
}

export interface CancelRequestPayload {
  readonly schemaVersion: 1;
  readonly kind: "command-job-cancel";
  readonly jobId: string;
  readonly ownerToken: string;
  readonly specDigest: string;
  readonly requestedAt: string;
}

export interface StartCommandJobOptions {
  readonly stateRoot: string;
  readonly cwd: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly deadlineMs?: number | undefined;
  readonly cliPath?: string | undefined;
}

export interface StartCommandJobResult {
  readonly jobId: string;
  readonly status: "running" | "completed" | "failed" | "cancelled" | "timed_out";
  readonly cwd: string;
  readonly command: string;
  readonly deadlineMs: number;
  readonly createdAt: string;
}

let cachedSchema: Record<string, unknown> | null = null;

export async function getCommandJobSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "command-job.schema.json");
  const content = await readBoundedFile(schemaPath, root, 64 * 1024);
  cachedSchema = JSON.parse(content) as Record<string, unknown>;
  return cachedSchema;
}

export function validateJobId(jobId: string): void {
  if (typeof jobId !== "string" || !JOB_ID_REGEX.test(jobId)) {
    throw new Error(`Invalid job ID format: ${JSON.stringify(jobId)}. Must match ${JOB_ID_REGEX}`);
  }
}

export async function assertNoSymlinksInPathAndAncestors(targetPath: string): Promise<void> {
  const normTarget = resolve(targetPath);
  let current = normTarget;

  while (true) {
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Symlink or reparse point detected at ${current}, refusing access`);
      }
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

export function assertStateRootNotInsideProject(stateRoot: string, cwd: string): void {
  const normStateRoot = resolve(stateRoot);
  const normCwd = resolve(cwd);
  if (normStateRoot === normCwd || normStateRoot.startsWith(normCwd + sep)) {
    throw new Error(
      `External state root must not be inside working directory / project: stateRoot=${normStateRoot}, cwd=${normCwd}`,
    );
  }
}

export async function assertNoSymlinksInAncestors(fullPath: string, stateRoot: string): Promise<void> {
  const normStateRoot = resolve(stateRoot);
  const normPath = resolve(fullPath);
  if (!normPath.startsWith(normStateRoot + sep) && normPath !== normStateRoot) {
    throw new Error(`Path ${normPath} escapes state root ${normStateRoot}`);
  }

  // Canonicalize and check every ancestor up to filesystem root
  await assertNoSymlinksInPathAndAncestors(normPath);
}

export async function readBoundedFile(
  filePath: string,
  stateRoot: string,
  maxBytes: number,
): Promise<string> {
  await assertNoSymlinksInAncestors(filePath, stateRoot);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const lstatsBefore = await lstat(filePath);
      if (lstatsBefore.isSymbolicLink()) {
        throw new Error(`Target file is a symbolic link: ${filePath}`);
      }
      if (!lstatsBefore.isFile()) {
        throw new Error(`Target is not a regular file: ${filePath}`);
      }
      if (lstatsBefore.size > maxBytes) {
        throw new Error(`File ${filePath} exceeds byte limit (${lstatsBefore.size} > ${maxBytes})`);
      }

      const flags = constants.O_NOFOLLOW !== undefined ? constants.O_RDONLY | constants.O_NOFOLLOW : "r";
      const handle = await open(filePath, flags);
      try {
        const fstats = await handle.stat();
        if (!fstats.isFile()) {
          throw new Error(`Opened descriptor for ${filePath} is not a regular file`);
        }
        if (fstats.size > maxBytes) {
          throw new Error(`File ${filePath} exceeds byte limit (${fstats.size} > ${maxBytes})`);
        }

        const recheckLstat = await lstat(filePath);
        if (recheckLstat.isSymbolicLink()) {
          throw new Error(`Symlink race detected on ${filePath}`);
        }

        const readLimit = Math.min(fstats.size, maxBytes) + 1;
        const buf = Buffer.alloc(readLimit);
        const { bytesRead } = await handle.read(buf, 0, readLimit, 0);
        if (bytesRead > maxBytes) {
          throw new Error(`File ${filePath} read exceeded maximum byte limit (${bytesRead} > ${maxBytes})`);
        }
        return buf.subarray(0, bytesRead).toString("utf8");
      } finally {
        await handle.close();
      }
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt < 3 && (code === "ENOENT" || code === "EBUSY" || code === "EPERM")) {
        await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function assertNoCredentialsInArgs(
  executable: string,
  args: readonly string[],
  source: NodeJS.ProcessEnv = process.env,
): void {
  const allTokens = [executable, ...args];

  // Check known secret values from credential-named environment variables FIRST
  const secretValues: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (value && SECRET_ENV_NAME_PATTERN.test(key) && value.trim().length >= 8) {
      secretValues.push(value.trim());
    }
  }

  for (const token of allTokens) {
    for (const secret of secretValues) {
      if (token.includes(secret)) {
        throw new Error(
          "Command argument or executable contains secret value from credential-named environment variable",
        );
      }
    }
  }

  // Check structural credential patterns
  for (const token of allTokens) {
    for (const pattern of STRUCTURAL_CREDENTIAL_PATTERNS) {
      if (pattern.test(token)) {
        throw new Error(
          `Command argument or executable contains credential-shaped data matching pattern: ${token.slice(0, 16)}...`,
        );
      }
    }
  }
}

export function buildOrdinaryCommandEnvironment(
  source: NodeJS.ProcessEnv = process.env,
  literal: Record<string, string> = {},
): EnvironmentPolicy {
  const optionalNames: string[] = [];
  const sourceKeys = Object.keys(source);
  for (const allowed of ORDINARY_COMMAND_ENV_ALLOWLIST) {
    const matchedKey = sourceKeys.find((k) => k.toUpperCase() === allowed.toUpperCase());
    if (matchedKey !== undefined && source[matchedKey] !== undefined) {
      optionalNames.push(matchedKey);
    }
  }
  return {
    optional: optionalNames,
    literal,
    source,
  };
}

export function budgetJobOutput(
  stdout: string,
  stderr: string,
  capped: boolean,
  totalBytes: number,
): CommandJobOutput {
  let truncated = capped;
  let outStr = stdout;
  let errStr = stderr;

  const MAX_STR_LEN = 65536;
  if (outStr.length > MAX_STR_LEN) {
    outStr = outStr.slice(0, MAX_STR_LEN);
    truncated = true;
  }
  if (errStr.length > MAX_STR_LEN) {
    errStr = errStr.slice(0, MAX_STR_LEN);
    truncated = true;
  }

  let combStr = `${outStr}${errStr}`;
  if (combStr.length > MAX_STR_LEN) {
    combStr = combStr.slice(0, MAX_STR_LEN);
    truncated = true;
  }

  // Record has a 512 KiB ceiling; reserve 128 KiB for metadata, leaving 384 KiB for output JSON
  const MAX_OUTPUT_JSON_BYTES = 384 * 1024;
  while (true) {
    const jsonLen = Buffer.byteLength(
      JSON.stringify({ stdout: outStr, stderr: errStr, combined: combStr }),
      "utf8",
    );
    if (jsonLen <= MAX_OUTPUT_JSON_BYTES || (outStr.length === 0 && errStr.length === 0)) {
      break;
    }
    truncated = true;
    outStr = outStr.slice(0, Math.floor(outStr.length * 0.75));
    errStr = errStr.slice(0, Math.floor(errStr.length * 0.75));
    combStr = `${outStr}${errStr}`;
  }

  return {
    stdout: outStr,
    stderr: errStr,
    combined: combStr,
    truncated,
    totalBytes,
  };
}

export function jobDirectory(stateRoot: string, jobId: string): string {
  validateJobId(jobId);
  return join(stateRoot, "jobs", jobId);
}

export function jobRecordPath(stateRoot: string, jobId: string): string {
  return join(jobDirectory(stateRoot, jobId), "job.json");
}

export function launchSpecPath(stateRoot: string, jobId: string): string {
  return join(jobDirectory(stateRoot, jobId), "launch-spec.json");
}

export function cancelRequestPath(stateRoot: string, jobId: string): string {
  return join(jobDirectory(stateRoot, jobId), "cancel.request");
}

export async function writeJobRecord(
  stateRoot: string,
  record: CommandJobRecord,
  pkgRoot?: string,
): Promise<void> {
  validateJobId(record.jobId);
  const dir = jobDirectory(stateRoot, record.jobId);
  await assertNoSymlinksInAncestors(dir, stateRoot);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  const schema = await getCommandJobSchema(pkgRoot);
  const issues = validateAgainstSchema(record, schema);
  if (issues.length > 0) {
    throw new Error(`Command job record failed closed schema validation: ${issues.map((i) => `${i.code} at ${i.documentPath} (${i.expected})`).join("; ")}`);
  }

  const content = `${JSON.stringify(record, null, 2)}\n`;
  const byteLength = Buffer.byteLength(content, "utf8");
  if (byteLength > MAX_RECORD_BYTES) {
    throw new Error(`Job record ${record.jobId} exceeds maximum byte limit (${byteLength} > ${MAX_RECORD_BYTES})`);
  }

  const target = jobRecordPath(stateRoot, record.jobId);
  const temporary = join(dir, `.job.json.${randomUUID()}.tmp`);

  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  let renamed = false;
  for (let i = 0; i < 5; i++) {
    try {
      await rename(temporary, target);
      renamed = true;
      break;
    } catch (err: unknown) {
      if (i === 4) throw err;
      await new Promise((r) => setTimeout(r, 20 * (i + 1)));
    }
  }
  if (!renamed) {
    await unlink(temporary).catch(() => undefined);
  }
  await syncDirectory(dir);
}

export async function readJobRecord(
  stateRoot: string,
  jobId: string,
  pkgRoot?: string,
): Promise<CommandJobRecord> {
  validateJobId(jobId);
  const target = jobRecordPath(stateRoot, jobId);
  const rawText = await readBoundedFile(target, stateRoot, MAX_RECORD_BYTES);
  const parsed = JSON.parse(rawText) as CommandJobRecord;

  const schema = await getCommandJobSchema(pkgRoot);
  const issues = validateAgainstSchema(parsed, schema);
  if (issues.length > 0) {
    throw new Error(`Command job record failed closed schema validation: ${issues.map((i) => `${i.code} at ${i.documentPath} (${i.expected})`).join("; ")}`);
  }

  if (parsed.jobId !== jobId || parsed.kind !== "command-job" || parsed.schemaVersion !== 1) {
    throw new Error(`Job record ${target} identity mismatch or tampered`);
  }

  return parsed;
}

function resolveCliPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateDist = resolve(dirname(currentFile), "..", "cli.js");
  return candidateDist;
}

/**
 * Starts a detached bounded command job and awaits the start handshake.
 * Returns only after worker ownership is established and status is running or fast completed.
 */
export async function startCommandJob(options: StartCommandJobOptions): Promise<StartCommandJobResult> {
  const { stateRoot, cwd, executable, args } = options;

  // 1. Validate CWD exists and is a directory
  const resolvedCwd = resolve(cwd);
  const cwdStat = await stat(resolvedCwd);
  if (!cwdStat.isDirectory()) {
    throw new Error(`Job working directory is not a directory: ${resolvedCwd}`);
  }

  // 2. Validate external state root is not inside cwd or project
  assertStateRootNotInsideProject(stateRoot, resolvedCwd);

  // 3. Validate executable exists and is directly executable without an interpreter
  const resolvedExecutable = resolveCommand(executable) ?? (resolve(executable));
  try {
    const execStat = await stat(resolvedExecutable);
    if (!execStat.isFile()) {
      throw new Error(`Executable is not a regular file: ${resolvedExecutable}`);
    }
  } catch (err: unknown) {
    throw new Error(`Cannot locate executable: ${resolvedExecutable} (${(err as Error).message})`);
  }

  if (!isDirectlyExecutable(resolvedExecutable)) {
    throw new Error(
      `Running interpreted scripts without a native binary is not permitted: ${resolvedExecutable}`,
    );
  }

  // 4. Reject credentials in arguments or executable before any serialization
  assertNoCredentialsInArgs(resolvedExecutable, args, process.env);

  // 5. Validate deadline
  const deadlineMs = options.deadlineMs !== undefined
    ? validateNumericFlag(options.deadlineMs, "deadlineMs", 1, MAX_JOB_DEADLINE_MS)
    : DEFAULT_JOB_DEADLINE_MS;

  // 6. Create immutable random job ID and owner token
  const jobId = `job-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const ownerToken = randomUUID();
  const createdAt = new Date().toISOString();

  // 7. Compute spec digest (transient launch spec)
  const specDigest = createHash("sha256")
    .update(JSON.stringify({ executable: resolvedExecutable, args, cwd: resolvedCwd, deadlineMs }))
    .digest("hex");

  const commandName = basename(resolvedExecutable);

  const initialRecord: CommandJobRecord = {
    schemaVersion: 1,
    kind: "command-job",
    jobId,
    ownerToken,
    specDigest,
    status: "pending",
    createdAt,
    startedAt: null,
    acknowledgedAt: null,
    finishedAt: null,
    stateRevision: 0,
    cwd: resolvedCwd,
    command: commandName,
    deadlineMs,
    workerPid: null,
    workerHost: null,
    childPid: null,
    exitCode: null,
    signal: null,
    cancelRequested: false,
    cancelRequestedAt: null,
    cancelDelivered: null,
    cancelConfirmedAt: null,
    durationMs: null,
    output: null,
    error: null,
  };

  const dir = jobDirectory(stateRoot, jobId);
  await assertNoSymlinksInAncestors(dir, stateRoot);
  await mkdir(dir, { recursive: true, mode: 0o700 });

  // 8. Persist private launch spec atomically and exclusively (0o600)
  const launchSpecFile = launchSpecPath(stateRoot, jobId);
  const launchSpec: PrivateLaunchSpec = {
    schemaVersion: 1,
    kind: "command-job-launch",
    jobId,
    ownerToken,
    executable: resolvedExecutable,
    args,
    cwd: resolvedCwd,
    deadlineMs,
    createdAt,
  };

  const specContent = `${JSON.stringify(launchSpec, null, 2)}\n`;
  const specTemp = join(dir, `.launch-spec.${randomUUID()}.tmp`);
  const specHandle = await open(specTemp, "wx", 0o600);
  try {
    await specHandle.writeFile(specContent, "utf8");
    await specHandle.sync();
  } finally {
    await specHandle.close();
  }
  await rename(specTemp, launchSpecFile);
  await syncDirectory(dir);

  // 9. Persist initial job record
  await writeJobRecord(stateRoot, initialRecord);

  // 10. Start detached one-job worker via process adapter
  const cliPath = options.cliPath ?? resolveCliPath();
  let workerSpawnError: Error | null = null;
  const getSpawnError = (): Error | null => workerSpawnError;
  let workerHandle: DetachedProcessHandle | null = null;

  try {
    workerHandle = spawnDetachedProcess({
      executable: process.execPath,
      args: [cliPath, "job-worker", "--state-root", stateRoot, "--job-id", jobId, "--owner-token", ownerToken],
      cwd: resolvedCwd,
      environment: buildOrdinaryCommandEnvironment(process.env, {
        ALPHA_AOS_STATE_DIR: stateRoot,
      }),
      onError: (err) => {
        workerSpawnError = err;
      },
    });
    workerHandle.unref();
  } catch (err: unknown) {
    await unlink(launchSpecFile).catch(() => undefined);
    throw err;
  }

  // 11. Handshake: wait for worker to assume ownership and transition to running (or fast completion)
  const startTime = Date.now();
  const HANDSHAKE_TIMEOUT_MS = 5000;
  let runningRecord: (Omit<CommandJobRecord, "status"> & { status: StartCommandJobResult["status"] }) | null = null;

  try {
    while (Date.now() - startTime < HANDSHAKE_TIMEOUT_MS) {
      const spawnErr = getSpawnError();
      if (spawnErr !== null) {
        throw new Error(`Worker spawn failed: ${spawnErr.message}`);
      }

      try {
        const current = await readJobRecord(stateRoot, jobId);
        if (current.status === "running") {
          runningRecord = { ...current, status: "running" };
          break;
        }
        // Accept fast terminal record proving worker claimed and child spawn occurred
        if (
          (current.status === "completed" ||
            current.status === "failed" ||
            current.status === "cancelled" ||
            current.status === "timed_out") &&
          (current.startedAt !== null ||
            current.workerPid !== null ||
            current.acknowledgedAt !== null ||
            current.childPid !== null)
        ) {
          runningRecord = { ...current, status: current.status };
          break;
        }
        if (current.status === "orphaned") {
          throw new Error(`Worker orphaned during start handshake: ${current.error?.message ?? "unknown error"}`);
        }
      } catch (err: unknown) {
        if (
          (err as Error).message.includes("Worker spawn failed") ||
          (err as Error).message.includes("Worker orphaned")
        ) {
          throw err;
        }
      }
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 50));
    }

    if (runningRecord === null) {
      let reconciled: CommandJobRecord | null = null;
      try {
        reconciled = await readJobRecord(stateRoot, jobId);
      } catch {
        // ignore
      }

      await unlink(launchSpecFile).catch(() => undefined);

      if (reconciled && reconciled.workerPid !== null && isProcessAlive(reconciled.workerPid)) {
        throw new Error(
          `Worker handshake timed out for job ${jobId}; worker process ${reconciled.workerPid} is active but unacknowledged (status: ${reconciled.status})`,
        );
      }

      throw new Error(
        `Worker handshake failed: detached worker for job ${jobId} failed to start within ${HANDSHAKE_TIMEOUT_MS}ms`,
      );
    }
  } catch (err: unknown) {
    await unlink(launchSpecFile).catch(() => undefined);
    throw err;
  }

  return {
    jobId,
    status: runningRecord.status,
    cwd: runningRecord.cwd,
    command: runningRecord.command,
    deadlineMs: runningRecord.deadlineMs,
    createdAt: runningRecord.createdAt,
  };
}

/**
 * Reads command job status with orphan diagnosis (READ-ONLY; never mutates job.json).
 */
export async function getCommandJobStatus(stateRoot: string, jobId: string): Promise<CommandJobRecord> {
  validateJobId(jobId);
  const record = await readJobRecord(stateRoot, jobId);

  if (record.status === "running") {
    // Check worker liveness
    const isForeignHost = record.workerHost !== null && record.workerHost !== hostname();
    const isWorkerDead = record.workerPid !== null && !isProcessAlive(record.workerPid);

    if (isForeignHost || isWorkerDead) {
      // Re-read after 50ms grace in case the worker just flushed its terminal write
      await new Promise((r) => setTimeout(r, 50));
      const fresh = await readJobRecord(stateRoot, jobId).catch(() => record);
      if (fresh.status !== "running") {
        return fresh;
      }

      // Diagnostic only: readers NEVER overwrite job.json
      const orphanedRecord: CommandJobRecord = {
        ...fresh,
        status: "orphaned",
        finishedAt: new Date().toISOString(),
        error: {
          code: "WORKER_ORPHANED",
          message: isForeignHost
            ? `Worker running on remote host ${fresh.workerHost}`
            : `Worker process ${fresh.workerPid} terminated unexpectedly`,
        },
      };
      return orphanedRecord;
    }
  }

  return record;
}

/**
 * Waits on a command job using race-safe event-driven observation.
 * Pins job identity on attach and refuses ownership or spec drift.
 */
export async function waitCommandJob(options: {
  stateRoot: string;
  jobId: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}): Promise<ObserverSettlement<CommandJobRecord>> {
  const { stateRoot, jobId, timeoutMs, signal } = options;
  validateJobId(jobId);

  const targetPath = jobRecordPath(stateRoot, jobId);
  const watchDir = jobDirectory(stateRoot, jobId);

  let pinnedOwner: string | null = null;
  let pinnedSpecDigest: string | null = null;

  return waitForCompletion<CommandJobRecord>({
    targetPath,
    watchDir,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(signal !== undefined ? { signal } : {}),
    check: async () => {
      let record: CommandJobRecord;
      try {
        record = await getCommandJobStatus(stateRoot, jobId);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EBUSY" || code === "EPERM") {
          return { state: "pending" };
        }
        return {
          state: "unresolved",
          code: "RECORD_READ_ERROR",
          reason: err instanceof Error ? err.message : String(err),
        };
      }

      if (pinnedOwner === null) {
        pinnedOwner = record.ownerToken;
        pinnedSpecDigest = record.specDigest;
      } else if (record.ownerToken !== pinnedOwner || record.specDigest !== pinnedSpecDigest) {
        return {
          state: "unresolved",
          code: "OWNERSHIP_DRIFT",
          reason: `Job ownership or spec drifted during observation: owner=${record.ownerToken}, spec=${record.specDigest}`,
        };
      }

      if (
        record.status === "completed" ||
        record.status === "failed" ||
        record.status === "cancelled" ||
        record.status === "timed_out"
      ) {
        return { state: "terminal", value: record };
      }

      if (record.status === "orphaned") {
        return {
          state: "unresolved",
          code: "WORKER_ORPHANED",
          reason: record.error?.message ?? "Worker orphaned",
        };
      }

      return { state: "pending" };
    },
  });
}

/**
 * Requests owned cancellation of a command job and waits for the worker's confirmed closure.
 * Writes ONLY an atomic bounded cancel request with pinned identity; never rewrites job.json.
 */
export async function cancelCommandJob(options: {
  stateRoot: string;
  jobId: string;
  timeoutMs?: number;
}): Promise<CommandJobRecord> {
  const { stateRoot, jobId } = options;
  validateJobId(jobId);

  const current = await readJobRecord(stateRoot, jobId);
  if (
    current.status === "completed" ||
    current.status === "failed" ||
    current.status === "cancelled" ||
    current.status === "timed_out" ||
    current.status === "orphaned"
  ) {
    return current;
  }

  // Pin identity
  const pinnedJobId = current.jobId;
  const pinnedOwnerToken = current.ownerToken;
  const pinnedSpecDigest = current.specDigest;

  // 1. Write atomic bounded cancel request marker containing pinned identity (0o600)
  const dir = jobDirectory(stateRoot, jobId);
  await assertNoSymlinksInAncestors(dir, stateRoot);
  const cancelFile = cancelRequestPath(stateRoot, jobId);
  const cancelPayload: CancelRequestPayload = {
    schemaVersion: 1,
    kind: "command-job-cancel",
    jobId: pinnedJobId,
    ownerToken: pinnedOwnerToken,
    specDigest: pinnedSpecDigest,
    requestedAt: new Date().toISOString(),
  };

  const cancelTemp = join(dir, `.cancel.request.${randomUUID()}.tmp`);
  const handle = await open(cancelTemp, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(cancelPayload, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(cancelTemp, cancelFile);
  await syncDirectory(dir);

  // 2. Await worker confirmation
  const timeoutMs = options.timeoutMs ?? 5000;
  const settlement = await waitCommandJob({ stateRoot, jobId, timeoutMs });
  if (settlement.status === "completed") {
    return settlement.value;
  }

  return getCommandJobStatus(stateRoot, jobId);
}
