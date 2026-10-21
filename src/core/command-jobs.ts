import { createHash, randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import { link, lstat, mkdir, open, rename, rmdir, stat, unlink } from "node:fs/promises";
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
import { assertPathProven, provePathBoundary, recheckPathProof, type PathProof } from "./path-boundary.js";

export const DEFAULT_JOB_DEADLINE_MS = 20 * 60 * 1000; // 20 minutes
export const MAX_JOB_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_RECORD_BYTES = 512 * 1024; // 512 KiB
export const MAX_COMBINED_OUTPUT_BYTES = 64 * 1024; // 64 KiB
export const MAX_LAUNCH_SPEC_BYTES = 64 * 1024; // 64 KiB
export const MAX_CANCEL_REQUEST_BYTES = 4 * 1024; // 4 KiB
export const MAX_AGGREGATE_ARGS_BYTES = 64 * 1024; // 64 KiB

export const JOB_ID_REGEX = /^job-[0-9a-f]{16}$/;
export const SPEC_DIGEST_REGEX = /^[0-9a-f]{64}$/;

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

const SENSITIVE_FLAG_PREFIX_PATTERN =
  /^--(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|auth|authorization|access[-_]?token)$/iu;

const SENSITIVE_FLAG_EQUALS_PATTERN =
  /^--(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|auth|authorization|access[-_]?token)=(.*)$/iu;

const KNOWN_CREDENTIAL_QUERY_PARAM_PATTERN =
  /(?:^|[?&])(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|auth|authorization|access[-_]?token|client_secret)=/iu;

const URL_WITH_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/u;

const isCaseInsensitiveHost = process.platform === "win32" || process.platform === "darwin";

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
  readonly acknowledgedAt: string | null;
  readonly finishedAt: string | null;
  readonly stateRevision: number;
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

export interface ExpectedJobIdentity {
  readonly jobId: string;
  readonly ownerToken: string;
  readonly specDigest: string;
  readonly createdAt?: string;
  readonly cwd?: string;
  readonly command?: string;
  readonly deadlineMs?: number;
  readonly minRevision?: number;
  readonly workerPid?: number | null;
  readonly workerHost?: string | null;
  readonly childPid?: number | null;
  readonly startedAt?: string | null;
  readonly acknowledgedAt?: string | null;
  readonly finishedAt?: string | null;
}

export function assertJobIdentityMatch(
  record: CommandJobRecord,
  expected: ExpectedJobIdentity,
  context: "handshake" | "wait" | "cancel" | "fallback" = "wait",
): void {
  if (record.jobId !== expected.jobId) {
    throw new Error(`Job ID mismatch in ${context}: expected ${expected.jobId}, got ${record.jobId}: code=JOB_ID_MISMATCH`);
  }
  if (record.ownerToken !== expected.ownerToken) {
    throw new Error(`Job owner mismatch in ${context}: expected ${expected.ownerToken}, got ${record.ownerToken}: code=OWNERSHIP_DRIFT`);
  }
  if (record.specDigest !== expected.specDigest) {
    throw new Error(`Job specDigest mismatch in ${context}: expected ${expected.specDigest}, got ${record.specDigest}: code=SPEC_MISMATCH`);
  }
  if (expected.createdAt !== undefined && record.createdAt !== expected.createdAt) {
    throw new Error(`Job createdAt mismatch in ${context}: expected ${expected.createdAt}, got ${record.createdAt}: code=METADATA_DRIFT`);
  }
  if (expected.cwd !== undefined && record.cwd !== expected.cwd) {
    throw new Error(`Job cwd mismatch in ${context}: expected ${expected.cwd}, got ${record.cwd}: code=METADATA_DRIFT`);
  }
  if (expected.command !== undefined && record.command !== expected.command) {
    throw new Error(`Job command mismatch in ${context}: expected ${expected.command}, got ${record.command}: code=METADATA_DRIFT`);
  }
  if (expected.deadlineMs !== undefined && record.deadlineMs !== expected.deadlineMs) {
    throw new Error(`Job deadlineMs mismatch in ${context}: expected ${expected.deadlineMs}, got ${record.deadlineMs}: code=METADATA_DRIFT`);
  }
  if (expected.minRevision !== undefined && record.stateRevision < expected.minRevision) {
    throw new Error(`Job state revision rolled backward in ${context}: expected >= ${expected.minRevision}, got ${record.stateRevision}: code=REVISION_ROLLBACK`);
  }
  if (expected.workerPid !== undefined && expected.workerPid !== null) {
    if (record.workerPid !== expected.workerPid) {
      throw new Error(`Job workerPid changed in ${context}: expected ${expected.workerPid}, got ${record.workerPid}: code=CLAIM_DRIFT`);
    }
  }
  if (expected.workerHost !== undefined && expected.workerHost !== null) {
    if (record.workerHost !== expected.workerHost) {
      throw new Error(`Job workerHost changed in ${context}: expected ${expected.workerHost}, got ${record.workerHost}: code=CLAIM_DRIFT`);
    }
  }
  if (expected.childPid !== undefined && expected.childPid !== null) {
    if (record.childPid !== expected.childPid) {
      throw new Error(`Job childPid changed in ${context}: expected ${expected.childPid}, got ${record.childPid}: code=CLAIM_DRIFT`);
    }
  }
  if (expected.startedAt !== undefined && expected.startedAt !== null) {
    if (record.startedAt !== expected.startedAt) {
      throw new Error(`Job startedAt changed in ${context}: expected ${expected.startedAt}, got ${record.startedAt}: code=CLAIM_DRIFT`);
    }
  }
  if (expected.acknowledgedAt !== undefined && expected.acknowledgedAt !== null) {
    if (record.acknowledgedAt !== expected.acknowledgedAt) {
      throw new Error(`Job acknowledgedAt changed in ${context}: expected ${expected.acknowledgedAt}, got ${record.acknowledgedAt}: code=CLAIM_DRIFT`);
    }
  }
  if (expected.finishedAt !== undefined && expected.finishedAt !== null) {
    if (record.finishedAt !== expected.finishedAt) {
      throw new Error(`Job finishedAt changed in ${context}: expected ${expected.finishedAt}, got ${record.finishedAt}: code=CLAIM_DRIFT`);
    }
  }
}

export interface ExpectedLaunchRecord {
  readonly jobId: string;
  readonly ownerToken: string;
  readonly specDigest: string;
  readonly cwd: string;
  readonly deadlineMs: number;
  readonly createdAt: string;
  readonly status?: string;
}

export interface JobFence {
  readonly jobId: string;
  readonly ownerToken: string;
  readonly specDigest: string;
  readonly stateRevision: number;
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
let cachedLaunchSchema: Record<string, unknown> | null = null;
let cachedCancelSchema: Record<string, unknown> | null = null;

export async function getCommandJobSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedSchema !== null) return cachedSchema;
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "command-job.schema.json");
  const content = await readBoundedFile(schemaPath, root, 64 * 1024);
  cachedSchema = JSON.parse(content) as Record<string, unknown>;
  return cachedSchema;
}

export async function getLaunchSpecSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedLaunchSchema !== null) return cachedLaunchSchema;
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "command-job-launch.schema.json");
  const content = await readBoundedFile(schemaPath, root, 64 * 1024);
  cachedLaunchSchema = JSON.parse(content) as Record<string, unknown>;
  return cachedLaunchSchema;
}

export async function getCancelRequestSchema(pkgRoot?: string): Promise<Record<string, unknown>> {
  if (cachedCancelSchema !== null) return cachedCancelSchema;
  const root = pkgRoot ?? packageRoot();
  const schemaPath = join(root, "schemas", "command-job-cancel.schema.json");
  const content = await readBoundedFile(schemaPath, root, 64 * 1024);
  cachedCancelSchema = JSON.parse(content) as Record<string, unknown>;
  return cachedCancelSchema;
}

export function validateJobId(jobId: string): void {
  if (typeof jobId !== "string" || !JOB_ID_REGEX.test(jobId)) {
    throw new Error(`Invalid job ID format. Must match ${JOB_ID_REGEX}`);
  }
}

export function computeSpecDigest(params: {
  executable: string;
  args: readonly string[];
  cwd: string;
  deadlineMs: number;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        executable: params.executable,
        args: params.args,
        cwd: params.cwd,
        deadlineMs: params.deadlineMs,
      }),
    )
    .digest("hex");
}

export function comparablePath(value: string): string {
  const resolved = resolve(value);
  return isCaseInsensitiveHost ? resolved.toLowerCase() : resolved;
}

export function isPathSameOrInside(parent: string, candidate: string): boolean {
  const compParent = comparablePath(parent);
  const compCandidate = comparablePath(candidate);
  if (compCandidate === compParent) return true;
  const boundary = compParent.endsWith(sep) ? compParent : `${compParent}${sep}`;
  return compCandidate.startsWith(boundary);
}

export function findEnclosingProjectRoots(startDir: string): string[] {
  const roots: string[] = [];
  let cursor = resolve(startDir);
  const home = resolve(process.env.USERPROFILE ?? process.env.HOME ?? "");

  while (true) {
    if (home.length > 0 && comparablePath(cursor) === comparablePath(home)) {
      const parent = dirname(cursor);
      if (parent === cursor) break;
      cursor = parent;
      continue;
    }

    const hasGit = existsSync(join(cursor, ".git"));
    const hasAlphaAos = existsSync(join(cursor, ".alpha-aos"));
    const hasStackYaml = existsSync(join(cursor, "catalog", "stack.yaml"));

    if (hasGit || hasAlphaAos || hasStackYaml) {
      roots.push(cursor);
    }

    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  return roots;
}

export function findProjectRoot(startDir: string): string {
  const roots = findEnclosingProjectRoots(startDir);
  return roots[0] ?? resolve(startDir);
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

  // 1. Direct cwd containment check
  if (isPathSameOrInside(normCwd, normStateRoot)) {
    throw new Error(
      `External state root must not be inside working directory / project: stateRoot=${normStateRoot}, cwd=${normCwd}`,
    );
  }

  // 2. Discover ALL enclosing project/repo boundaries independently (nearer .alpha-aos cannot mask enclosing .git)
  const projectRoots = findEnclosingProjectRoots(normCwd);
  for (const root of projectRoots) {
    if (isPathSameOrInside(root, normStateRoot)) {
      throw new Error(
        `External state root must not be inside discovered project root: stateRoot=${normStateRoot}, projectRoot=${root}, cwd=${normCwd}`,
      );
    }
  }

  // 3. For any ancestor of cwd, stateRoot must not be a project-local .alpha-aos directory
  const home = resolve(process.env.USERPROFILE ?? process.env.HOME ?? "");
  let cursor = normCwd;
  while (true) {
    const parent = dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
    if (home.length > 0 && comparablePath(cursor) === comparablePath(home)) {
      continue;
    }
    const dotAlphaAos = join(cursor, ".alpha-aos");
    if (isPathSameOrInside(dotAlphaAos, normStateRoot)) {
      throw new Error(
        `External state root must not be inside project ancestor: stateRoot=${normStateRoot}, projectRoot=${cursor}, cwd=${normCwd}`,
      );
    }
  }
}

export async function assertNoSymlinksInAncestors(fullPath: string, stateRoot: string): Promise<void> {
  const normStateRoot = resolve(stateRoot);
  const normPath = resolve(fullPath);
  if (!isPathSameOrInside(normStateRoot, normPath)) {
    throw new Error(`Path ${normPath} escapes state root ${normStateRoot}`);
  }

  // Canonicalize and check every ancestor up to filesystem root
  await assertNoSymlinksInPathAndAncestors(normPath);
}

export type CommandJobPathPhase =
  | "read:before-open" | "read:before-bytes" | "read:after-bytes"
  | "write:before-mkdir" | "write:before-open" | "write:before-bytes"
  | "write:before-rename" | "write:after-rename"
  | "start:before-job-mkdir" | "start:after-job-mkdir";
export type CommandJobPathBarrier = (phase: CommandJobPathPhase, path: string) => void | Promise<void>;

interface JobFileIdentity { readonly dev: number; readonly ino: number }
interface PrivateWriteOptions {
  readonly exclusive?: boolean;
  readonly barrier?: CommandJobPathBarrier | undefined;
}

async function provePlainJobPath(path: string, stateRoot: string, role: "state" | "source" | "temp"): Promise<PathProof> {
  const proof = await provePathBoundary({ path: resolve(path), allowedRoots: [resolve(stateRoot)], role });
  assertPathProven(proof);
  if (proof.components.some((component) =>
    component.reparse !== "none" ||
    (component.kind !== "missing" && (component.device === null || component.inode === null))
  )) {
    throw new Error("Job path has a link or unavailable component identity: code=JOB_PATH_UNPROVEN");
  }
  return proof;
}

async function recheckJobPath(proof: PathProof): Promise<void> {
  const result = await recheckPathProof(proof);
  if (!result.ok) throw new Error("Job path identity changed: code=JOB_PATH_CHANGED");
}

function jobFileIdentity(value: { dev: number; ino: number }): JobFileIdentity {
  if (!Number.isFinite(value.dev) || !Number.isFinite(value.ino) || value.ino === 0) {
    throw new Error("Job file identity unavailable: code=JOB_PATH_UNPROVEN");
  }
  return { dev: value.dev, ino: value.ino };
}

async function assertJobFileIdentity(path: string, expected: JobFileIdentity): Promise<void> {
  const current = await lstat(path);
  const identity = jobFileIdentity(current);
  if (!current.isFile() || current.isSymbolicLink() || identity.dev !== expected.dev || identity.ino !== expected.ino) {
    throw new Error("Job file identity changed: code=JOB_PATH_CHANGED");
  }
}

async function assertJobDescriptor(handle: import("node:fs/promises").FileHandle, path: string): Promise<JobFileIdentity> {
  const descriptor = await handle.stat();
  if (!descriptor.isFile()) throw new Error("Job descriptor is not a regular file: code=JOB_PATH_UNPROVEN");
  const identity = jobFileIdentity(descriptor);
  await assertJobFileIdentity(path, identity);
  return identity;
}

async function unlinkOwnedJobFile(path: string, identity: JobFileIdentity, parentProof: PathProof): Promise<void> {
  // Refuse cleanup through a changed parent or a replacement leaf.
  await recheckJobPath(parentProof);
  await assertJobFileIdentity(path, identity);
  await unlink(path);
}

function assertPrivateByteLimit(content: string, maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || Buffer.byteLength(content, "utf8") > maxBytes) {
    throw new Error("Private payload exceeds maximum byte limit: code=JOB_PAYLOAD_TOO_LARGE");
  }
}

export async function readBoundedFile(
  filePath: string,
  stateRoot: string,
  maxBytes: number,
  _testBarrier?: CommandJobPathBarrier,
): Promise<string> {
  const normFilePath = resolve(filePath);
  const normStateRoot = resolve(stateRoot);

  // Retain ancestor identities across all retries; fresh scans alone do not detect replacement.
  const parentProof = await provePlainJobPath(dirname(normFilePath), normStateRoot, "source");
  await _testBarrier?.("read:before-open", normFilePath);

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await recheckJobPath(parentProof);
      const lstatsBefore = await lstat(normFilePath);
      if (lstatsBefore.isSymbolicLink()) {
        throw new Error(`Target file is a symbolic link: ${normFilePath}`);
      }
      if (!lstatsBefore.isFile()) {
        throw new Error(`Target is not a regular file: ${normFilePath}`);
      }
      if (lstatsBefore.size > maxBytes) {
        throw new Error(`File ${normFilePath} exceeds byte limit (${lstatsBefore.size} > ${maxBytes})`);
      }

      const flags = constants.O_NOFOLLOW !== undefined ? constants.O_RDONLY | constants.O_NOFOLLOW : "r";
      const handle = await open(normFilePath, flags);
      try {
        const fstats = await handle.stat();
        if (!fstats.isFile()) {
          throw new Error(`Opened descriptor for ${normFilePath} is not a regular file`);
        }
        if (fstats.size > maxBytes) {
          throw new Error(`File ${normFilePath} exceeds byte limit (${fstats.size} > ${maxBytes})`);
        }

        // Compare device/inode identity when non-zero
        if (
          lstatsBefore.ino !== 0 &&
          fstats.ino !== 0 &&
          (lstatsBefore.dev !== fstats.dev || lstatsBefore.ino !== fstats.ino)
        ) {
          throw new Error(`Descriptor file identity mismatch for ${normFilePath} (possible race or file swap)`);
        }

        const postOpenLstat = await lstat(normFilePath);
        if (postOpenLstat.isSymbolicLink()) {
          throw new Error(`Symlink race detected on ${normFilePath}`);
        }
        if (
          fstats.ino !== 0 &&
          postOpenLstat.ino !== 0 &&
          (postOpenLstat.dev !== fstats.dev || postOpenLstat.ino !== fstats.ino)
        ) {
          throw new Error(`Post-open lstat identity mismatch for ${normFilePath}`);
        }

        await _testBarrier?.("read:before-bytes", normFilePath);
        await recheckJobPath(parentProof);
        await assertJobDescriptor(handle, normFilePath);

        // Descriptor read bytes authoritative, strict EOF loop correct on short reads/growth size + 1
        const chunks: Buffer[] = [];
        let totalBytesRead = 0;
        const chunkSize = 16384;

        while (totalBytesRead <= maxBytes) {
          const toRead = Math.min(chunkSize, maxBytes + 1 - totalBytesRead);
          const buf = Buffer.alloc(toRead);
          const { bytesRead } = await handle.read(buf, 0, toRead, totalBytesRead);
          if (bytesRead === 0) {
            break; // Natural EOF
          }
          chunks.push(buf.subarray(0, bytesRead));
          totalBytesRead += bytesRead;
        }

        if (totalBytesRead > maxBytes) {
          throw new Error(`File ${normFilePath} read exceeded maximum byte limit (${totalBytesRead} > ${maxBytes})`);
        }

        await _testBarrier?.("read:after-bytes", normFilePath);
        // Strict EOF ceiling and file growth check (reject if file grew or changed size during read)
        const postReadFstat = await handle.stat();
        if (postReadFstat.size !== totalBytesRead || totalBytesRead !== fstats.size) {
          throw new Error(
            `File ${normFilePath} changed size during read: initial ${fstats.size}, read ${totalBytesRead}, final ${postReadFstat.size}`,
          );
        }

        // Post-read leaf identity check before decoding ANY payload bytes
        const postReadLstat = await lstat(normFilePath);
        if (postReadLstat.isSymbolicLink()) {
          throw new Error(`Symlink race detected on ${normFilePath} after read`);
        }
        if (postReadLstat.size !== totalBytesRead) {
          throw new Error(`File size changed after read: expected ${totalBytesRead}, got ${postReadLstat.size}`);
        }
        if (
          fstats.ino !== 0 &&
          postReadLstat.ino !== 0 &&
          (postReadLstat.dev !== fstats.dev || postReadLstat.ino !== fstats.ino)
        ) {
          throw new Error(`Post-read lstat identity mismatch for ${normFilePath}`);
        }

        await assertJobDescriptor(handle, normFilePath);
        await recheckJobPath(parentProof);

        // Fatal UTF-8 decoding
        const fullBuffer = Buffer.concat(chunks, totalBytesRead);
        const decoder = new TextDecoder("utf-8", { fatal: true });
        return decoder.decode(fullBuffer);
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

  // 1. Check known secret values from credential-named environment variables FIRST
  const secretValues: string[] = [];
  for (const [key, value] of Object.entries(source)) {
    if (value && SECRET_ENV_NAME_PATTERN.test(key) && value.trim().length >= 8) {
      secretValues.push(value.trim());
    }
  }

  for (let index = 0; index < allTokens.length; index++) {
    const token = allTokens[index]!;
    for (const secret of secretValues) {
      if (token.includes(secret)) {
        const name = index === 0 ? "executable" : "argument";
        throw new Error(
          `Command argument or executable contains secret value from credential-named environment variable: reason=secret_env_match, position=${name}, index=${index}`,
        );
      }
    }
  }

  // 2. Check sensitive flags and credential-bearing URLs
  for (let index = 0; index < allTokens.length; index++) {
    const token = allTokens[index]!;
    const name = index === 0 ? "executable" : "argument";

    // Equals form: --password=secret
    if (SENSITIVE_FLAG_EQUALS_PATTERN.test(token)) {
      throw new Error(
        `Command argument or executable contains sensitive credential flag: reason=sensitive_flag_equals, position=${name}, index=${index}`,
      );
    }

    // Split form: --password <value>
    if (SENSITIVE_FLAG_PREFIX_PATTERN.test(token)) {
      throw new Error(
        `Command argument or executable contains sensitive credential flag: reason=sensitive_flag_split, position=${name}, index=${index}`,
      );
    }

    // URL with userinfo or sensitive query parameters
    if (token.includes("://") || URL_WITH_SCHEME_PATTERN.test(token)) {
      try {
        const parsed = new URL(token);
        if (parsed.username.length > 0 || parsed.password.length > 0) {
          throw new Error(
            `Command argument or executable contains URL userinfo credential: reason=url_userinfo, position=${name}, index=${index}`,
          );
        }
        for (const key of parsed.searchParams.keys()) {
          if (
            /(?:password|passwd|pwd|token|api[-_]?key|apikey|secret|auth|authorization|access[-_]?token|client_secret)/iu.test(
              key,
            )
          ) {
            throw new Error(
              `Command argument or executable contains credential in URL query parameter: reason=url_credential_query, position=${name}, index=${index}`,
            );
          }
        }
      } catch (err: unknown) {
        if ((err as Error).message.includes("reason=url_")) {
          throw err;
        }
        if (/[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/\s@]+:[^/\s@]+@/iu.test(token)) {
          throw new Error(
            `Command argument or executable contains URL userinfo credential: reason=url_userinfo, position=${name}, index=${index}`,
          );
        }
        if (KNOWN_CREDENTIAL_QUERY_PARAM_PATTERN.test(token)) {
          throw new Error(
            `Command argument or executable contains credential in URL query parameter: reason=url_credential_query, position=${name}, index=${index}`,
          );
        }
      }
    }

    // 3. Structural credential patterns
    for (const pattern of STRUCTURAL_CREDENTIAL_PATTERNS) {
      if (pattern.test(token)) {
        throw new Error(
          `Command argument or executable contains credential-shaped data: reason=structural_pattern, position=${name}, index=${index}`,
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

export function truncateToUtf8Bytes(str: string, maxBytes: number): { text: string; truncated: boolean } {
  if (maxBytes <= 0) {
    return { text: "", truncated: str.length > 0 };
  }
  const initialBytes = Buffer.byteLength(str, "utf8");
  if (initialBytes <= maxBytes) {
    return { text: str, truncated: false };
  }

  let low = 0;
  let high = Math.min(str.length, maxBytes);
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let candidate = str.slice(0, mid);
    if (
      candidate.length > 0 &&
      candidate.charCodeAt(candidate.length - 1) >= 0xd800 &&
      candidate.charCodeAt(candidate.length - 1) <= 0xdbff
    ) {
      candidate = candidate.slice(0, -1);
    }
    const bLen = Buffer.byteLength(candidate, "utf8");
    if (bLen <= maxBytes) {
      best = candidate.length;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  let result = str.slice(0, best);
  if (
    result.length > 0 &&
    result.charCodeAt(result.length - 1) >= 0xd800 &&
    result.charCodeAt(result.length - 1) <= 0xdbff
  ) {
    result = result.slice(0, -1);
  }
  return { text: result, truncated: true };
}

export function budgetJobOutput(
  stdout: string,
  stderr: string,
  capped: boolean,
  totalBytes: number,
): CommandJobOutput {
  let truncated = capped;

  let outBytes = Buffer.byteLength(stdout, "utf8");
  let errBytes = Buffer.byteLength(stderr, "utf8");

  let outStr = stdout;
  let errStr = stderr;

  const maxCombined = MAX_COMBINED_OUTPUT_BYTES; // 65536 bytes
  const halfBudget = Math.floor(maxCombined / 2); // 32768 bytes

  if (outBytes + errBytes > maxCombined) {
    truncated = true;
    let outBudget: number;
    let errBudget: number;

    if (outBytes <= halfBudget) {
      outBudget = outBytes;
      errBudget = maxCombined - outBytes;
    } else if (errBytes <= halfBudget) {
      errBudget = errBytes;
      outBudget = maxCombined - errBytes;
    } else {
      outBudget = halfBudget;
      errBudget = maxCombined - halfBudget;
    }

    const outTrunc = truncateToUtf8Bytes(stdout, outBudget);
    const errTrunc = truncateToUtf8Bytes(stderr, errBudget);
    outStr = outTrunc.text;
    errStr = errTrunc.text;
    if (outTrunc.truncated || errTrunc.truncated) {
      truncated = true;
    }
  }

  let combStr = `${outStr}${errStr}`;
  let combBytes = Buffer.byteLength(combStr, "utf8");
  if (combBytes > maxCombined) {
    const combTrunc = truncateToUtf8Bytes(combStr, maxCombined);
    combStr = combTrunc.text;
    truncated = true;
  }

  // Record ceiling: reserve 128 KiB for metadata, leaving 384 KiB for output JSON
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
    const nextOutLimit = Math.floor(Buffer.byteLength(outStr, "utf8") * 0.75);
    const nextErrLimit = Math.floor(Buffer.byteLength(errStr, "utf8") * 0.75);
    outStr = truncateToUtf8Bytes(outStr, nextOutLimit).text;
    errStr = truncateToUtf8Bytes(errStr, nextErrLimit).text;
    combStr = `${outStr}${errStr}`;
    if (Buffer.byteLength(combStr, "utf8") > maxCombined) {
      combStr = truncateToUtf8Bytes(combStr, maxCombined).text;
    }
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

async function withJobWriteLock<T>(
  stateRoot: string,
  jobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  validateJobId(jobId);
  const dir = jobDirectory(stateRoot, jobId);
  const creationProof = await provePlainJobPath(dir, stateRoot, "state");
  await recheckJobPath(creationProof);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await recheckJobPath(creationProof);
  const parentProof = await provePlainJobPath(dir, stateRoot, "state");
  const lockPath = join(dir, ".job-write.lock");
  const content = JSON.stringify({ pid: process.pid, host: hostname(), time: new Date().toISOString() });
  const started = Date.now(), timeoutMs = 5000;
  let identity: JobFileIdentity | null = null;
  while (Date.now() - started < timeoutMs) {
    await recheckJobPath(parentProof);
    try {
      identity = await publishPrivateJobFile(lockPath, content, 4096, stateRoot, { exclusive: true });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await new Promise((resume) => setTimeout(resume, 20));
    }
  }
  if (identity === null) throw new Error("Timeout acquiring job write lock: code=LOCK_TIMEOUT");
  try {
    await recheckJobPath(parentProof);
    await assertJobFileIdentity(lockPath, identity);
    return await fn();
  } finally {
    await unlinkOwnedJobFile(lockPath, identity, parentProof).catch(() => undefined);
  }
}

async function publishPrivateJobFile(
  filePath: string,
  content: string,
  maxBytes: number,
  stateRoot: string,
  options: PrivateWriteOptions = {},
): Promise<JobFileIdentity> {
  // Validate the exact wire bytes before any mkdir.
  assertPrivateByteLimit(content, maxBytes);
  const target = resolve(filePath), root = resolve(stateRoot), dir = dirname(target);
  const creationProof = await provePlainJobPath(dir, root, "state");
  await options.barrier?.("write:before-mkdir", target);
  await recheckJobPath(creationProof);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await recheckJobPath(creationProof);
  const parentProof = await provePlainJobPath(dir, root, "state");
  const temporary = join(dir, "." + basename(target) + "." + randomUUID() + ".tmp");
  let handle: import("node:fs/promises").FileHandle | null = null;
  let identity: JobFileIdentity | null = null;
  let published = false;
  let succeeded = false;

  try {
    await options.barrier?.("write:before-open", temporary);
    await recheckJobPath(parentProof);
    handle = await open(temporary, "wx", 0o600);
    identity = jobFileIdentity(await handle.stat());
    await options.barrier?.("write:before-bytes", temporary);
    await recheckJobPath(parentProof);
    const temporaryProof = await provePlainJobPath(temporary, root, "temp");
    await assertJobDescriptor(handle, temporary);
    await recheckJobPath(parentProof);
    // Observed identity fences are not an OS sandbox against arbitrary same-user renames.
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await assertJobDescriptor(handle, temporary);
    await recheckJobPath(temporaryProof);
    await recheckJobPath(parentProof);
    await handle.close();
    handle = null;

    await options.barrier?.("write:before-rename", temporary);
    for (let attempt = 0; attempt < 5; attempt++) {
      await recheckJobPath(parentProof);
      await recheckJobPath(temporaryProof);
      await assertJobFileIdentity(temporary, identity);
      try {
        if (options.exclusive) {
          // Same-directory hard-link publication is atomic and cannot replace an existing entry.
          await link(temporary, target);
        } else {
          await rename(temporary, target);
        }
        published = true;
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt === 4 || (code !== "EBUSY" && code !== "EPERM")) throw error;
        await new Promise((resume) => setTimeout(resume, 20 * (attempt + 1)));
      }
    }
    await options.barrier?.("write:after-rename", target);
    await recheckJobPath(parentProof);
    await assertJobFileIdentity(target, identity);
    await syncDirectory(dir);
    await recheckJobPath(parentProof);
    await assertJobFileIdentity(target, identity);
    succeeded = true;
    return identity;
  } finally {
    await handle?.close().catch(() => undefined);
    if (identity !== null) {
      if (!succeeded && published && options.exclusive) {
        await unlinkOwnedJobFile(target, identity, parentProof).catch(() => undefined);
      }
      await unlinkOwnedJobFile(temporary, identity, parentProof).catch(() => undefined);
    }
  }
}

export async function writeAtomicPrivateFile(
  filePath: string,
  content: string,
  maxBytes: number,
  stateRoot: string,
  options: PrivateWriteOptions = {},
): Promise<void> {
  await publishPrivateJobFile(filePath, content, maxBytes, stateRoot, options);
}

export function validatePrivateLaunchSpec(
  value: unknown,
  expectedRecord?: ExpectedLaunchRecord,
): PrivateLaunchSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Private launch spec must be a non-null object: code=INVALID_SPEC_SHAPE");
  }

  const spec = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "schemaVersion",
    "kind",
    "jobId",
    "ownerToken",
    "executable",
    "args",
    "cwd",
    "deadlineMs",
    "createdAt",
  ]);

  for (const key of Object.keys(spec)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Private launch spec contains unexpected field: field=${key}, code=LAUNCH_SPEC_UNKNOWN_FIELD`);
    }
  }

  if (spec.schemaVersion !== 1) {
    throw new Error("Private launch spec schemaVersion must be 1: code=INVALID_SCHEMA_VERSION");
  }
  if (spec.kind !== "command-job-launch") {
    throw new Error("Private launch spec kind must be 'command-job-launch': code=INVALID_SPEC_KIND");
  }
  if (typeof spec.jobId !== "string" || !JOB_ID_REGEX.test(spec.jobId)) {
    throw new Error("Invalid job ID format in launch spec: code=INVALID_JOB_ID");
  }
  if (typeof spec.ownerToken !== "string" || spec.ownerToken.length < 1 || spec.ownerToken.length > 128) {
    throw new Error("Invalid owner token in launch spec: code=INVALID_OWNER_TOKEN");
  }

  // Executable: non-empty, absolute, normalized
  if (typeof spec.executable !== "string" || spec.executable.length === 0 || spec.executable.length > 1024) {
    throw new Error("Executable must be a non-empty string <= 1024 chars: code=INVALID_EXECUTABLE");
  }
  const normExec = resolve(spec.executable);
  if (normExec !== spec.executable) {
    throw new Error("Executable path must be absolute and normalized: code=NON_NORMALIZED_EXECUTABLE");
  }

  // CWD: non-empty, absolute, normalized
  if (typeof spec.cwd !== "string" || spec.cwd.length === 0 || spec.cwd.length > 1024) {
    throw new Error("CWD must be a non-empty string <= 1024 chars: code=INVALID_CWD");
  }
  const normCwd = resolve(spec.cwd);
  if (normCwd !== spec.cwd) {
    throw new Error("CWD path must be absolute and normalized: code=NON_NORMALIZED_CWD");
  }

  // Args: array of bounded strings, no NUL
  if (!Array.isArray(spec.args)) {
    throw new Error("Args must be an array: code=INVALID_ARGS_SHAPE");
  }
  let aggregateBytes = 0;
  for (let i = 0; i < spec.args.length; i++) {
    const arg = spec.args[i];
    if (typeof arg !== "string") {
      throw new Error(`Argument at index ${i} is not a string: code=INVALID_ARG_TYPE`);
    }
    if (arg.includes("\0")) {
      throw new Error(`Argument at index ${i} contains forbidden NUL character: code=FORBIDDEN_NUL_CHAR`);
    }
    const aBytes = Buffer.byteLength(arg, "utf8");
    if (aBytes > 65536) {
      throw new Error(`Argument at index ${i} exceeds maximum byte limit: code=ARG_OVERSIZE`);
    }
    aggregateBytes += aBytes;
  }
  if (aggregateBytes > MAX_AGGREGATE_ARGS_BYTES) {
    throw new Error("Arguments aggregate byte size exceeds 64 KiB: code=AGGREGATE_ARGS_OVERSIZE");
  }

  // Deadline: positive integer <= 24 hours
  if (
    typeof spec.deadlineMs !== "number" ||
    !Number.isInteger(spec.deadlineMs) ||
    spec.deadlineMs < 1 ||
    spec.deadlineMs > MAX_JOB_DEADLINE_MS
  ) {
    throw new Error("Deadline must be positive integer <= 24 hours: code=INVALID_DEADLINE");
  }

  // CreatedAt: ISO string <= 64 chars
  if (typeof spec.createdAt !== "string" || spec.createdAt.length === 0 || spec.createdAt.length > 64) {
    throw new Error("CreatedAt must be a string <= 64 chars: code=INVALID_CREATED_AT");
  }
  if (Number.isNaN(Date.parse(spec.createdAt))) {
    throw new Error("CreatedAt must be a valid ISO date string: code=INVALID_CREATED_AT_DATE");
  }

  // Shared credential check
  assertNoCredentialsInArgs(spec.executable, spec.args as string[], process.env);

  // Compute spec digest
  const computedDigest = computeSpecDigest({
    executable: spec.executable,
    args: spec.args as string[],
    cwd: spec.cwd,
    deadlineMs: spec.deadlineMs,
  });

  // Check serialized size bound <= 64 KiB
  const serialized = JSON.stringify(spec);
  const specBytes = Buffer.byteLength(serialized, "utf8");
  if (specBytes > MAX_LAUNCH_SPEC_BYTES) {
    throw new Error(
      `Serialized launch spec exceeds 64 KiB limit (${specBytes} > ${MAX_LAUNCH_SPEC_BYTES}): code=SPEC_BYTE_LIMIT_EXCEEDED`,
    );
  }

  // Compare against expectedRecord if provided
  if (expectedRecord !== undefined) {
    if (spec.jobId !== expectedRecord.jobId) {
      throw new Error("Launch spec jobId mismatch: code=SPEC_JOB_ID_MISMATCH");
    }
    if (spec.ownerToken !== expectedRecord.ownerToken) {
      throw new Error("Launch spec ownerToken mismatch: code=SPEC_OWNER_TOKEN_MISMATCH");
    }
    if (computedDigest !== expectedRecord.specDigest) {
      throw new Error("Launch spec digest mismatch: code=SPEC_DIGEST_MISMATCH");
    }
    if (spec.cwd !== expectedRecord.cwd) {
      throw new Error("Launch spec cwd mismatch: code=SPEC_CWD_MISMATCH");
    }
    if (spec.deadlineMs !== expectedRecord.deadlineMs) {
      throw new Error("Launch spec deadlineMs mismatch: code=SPEC_DEADLINE_MISMATCH");
    }
    if (spec.createdAt !== expectedRecord.createdAt) {
      throw new Error("Launch spec createdAt mismatch: code=SPEC_CREATED_AT_MISMATCH");
    }
    if (expectedRecord.status !== undefined && expectedRecord.status !== "pending") {
      throw new Error(
        `Expected record status is not pending: status=${expectedRecord.status}, code=INVALID_INITIAL_STATUS`,
      );
    }
  }

  return spec as unknown as PrivateLaunchSpec;
}

export function validateCancelRequest(
  value: unknown,
  expectedIdentity?: ExpectedJobIdentity,
): CancelRequestPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Cancel request must be a non-null object: code=INVALID_CANCEL_SHAPE");
  }

  const req = value as Record<string, unknown>;
  const allowedKeys = new Set(["schemaVersion", "kind", "jobId", "ownerToken", "specDigest", "requestedAt"]);

  for (const key of Object.keys(req)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Cancel request contains unexpected field: field=${key}, code=CANCEL_REQUEST_UNKNOWN_FIELD`);
    }
  }

  if (req.schemaVersion !== 1) {
    throw new Error("Cancel request schemaVersion must be 1: code=INVALID_SCHEMA_VERSION");
  }
  if (req.kind !== "command-job-cancel") {
    throw new Error("Cancel request kind must be 'command-job-cancel': code=INVALID_CANCEL_KIND");
  }
  if (typeof req.jobId !== "string" || !JOB_ID_REGEX.test(req.jobId)) {
    throw new Error("Invalid job ID in cancel request: code=INVALID_JOB_ID");
  }
  if (typeof req.ownerToken !== "string" || req.ownerToken.length < 1 || req.ownerToken.length > 128) {
    throw new Error("Invalid owner token in cancel request: code=INVALID_OWNER_TOKEN");
  }
  if (typeof req.specDigest !== "string" || !SPEC_DIGEST_REGEX.test(req.specDigest)) {
    throw new Error("Invalid spec digest in cancel request: code=INVALID_SPEC_DIGEST");
  }
  if (typeof req.requestedAt !== "string" || req.requestedAt.length === 0 || req.requestedAt.length > 64) {
    throw new Error("RequestedAt must be a string <= 64 chars: code=INVALID_REQUESTED_AT");
  }
  if (Number.isNaN(Date.parse(req.requestedAt))) {
    throw new Error("RequestedAt must be a valid ISO date string: code=INVALID_REQUESTED_AT_DATE");
  }

  const serialized = JSON.stringify(req);
  const reqBytes = Buffer.byteLength(serialized, "utf8");
  if (reqBytes > MAX_CANCEL_REQUEST_BYTES) {
    throw new Error(
      `Serialized cancel request exceeds 4 KiB limit (${reqBytes} > ${MAX_CANCEL_REQUEST_BYTES}): code=CANCEL_BYTE_LIMIT_EXCEEDED`,
    );
  }

  if (expectedIdentity !== undefined) {
    if (req.jobId !== expectedIdentity.jobId) {
      throw new Error("Cancel request jobId mismatch: code=CANCEL_JOB_ID_MISMATCH");
    }
    if (req.ownerToken !== expectedIdentity.ownerToken) {
      throw new Error("Cancel request ownerToken mismatch: code=CANCEL_OWNER_TOKEN_MISMATCH");
    }
    if (req.specDigest !== expectedIdentity.specDigest) {
      throw new Error("Cancel request specDigest mismatch: code=CANCEL_SPEC_DIGEST_MISMATCH");
    }
  }

  return req as unknown as CancelRequestPayload;
}

export function validateJobRecord(
  record: unknown,
  schema?: Record<string, unknown>,
): CommandJobRecord {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("Job record must be a non-null object: code=INVALID_RECORD_SHAPE");
  }

  const rec = record as Record<string, unknown>;

  if (schema !== undefined) {
    const issues = validateAgainstSchema(rec, schema);
    if (issues.length > 0) {
      throw new Error(
        `Command job record failed closed schema validation: ${issues.map((i) => `${i.code} at ${i.documentPath} (${i.expected})`).join("; ")}`,
      );
    }
  }

  if (rec.schemaVersion !== 1) {
    throw new Error("Job record schemaVersion must be 1: code=INVALID_SCHEMA_VERSION");
  }
  if (rec.kind !== "command-job") {
    throw new Error("Job record kind must be 'command-job': code=INVALID_RECORD_KIND");
  }
  if (typeof rec.jobId !== "string" || !JOB_ID_REGEX.test(rec.jobId)) {
    throw new Error(`Invalid job ID format. Must match ${JOB_ID_REGEX}: code=INVALID_JOB_ID`);
  }
  if (typeof rec.ownerToken !== "string" || rec.ownerToken.length < 1 || rec.ownerToken.length > 128) {
    throw new Error("Invalid owner token in job record: code=INVALID_OWNER_TOKEN");
  }
  if (typeof rec.specDigest !== "string" || !SPEC_DIGEST_REGEX.test(rec.specDigest)) {
    throw new Error("Invalid spec digest in job record: code=INVALID_SPEC_DIGEST");
  }
  const timestamp = (value: unknown, field: string, nullable: boolean): number | null => {
    if (value === null && nullable) return null;
    if (typeof value !== "string" || value.length === 0 || value.length > 64) {
      throw new Error("Invalid canonical timestamp " + field + ": code=INVALID_RECORD_TIMESTAMP");
    }
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
      throw new Error("Invalid canonical timestamp " + field + ": code=INVALID_RECORD_TIMESTAMP");
    }
    return parsed;
  };
  const created = timestamp(rec.createdAt, "createdAt", false)!;
  const started = timestamp(rec.startedAt, "startedAt", true);
  const acknowledged = timestamp(rec.acknowledgedAt, "acknowledgedAt", true);
  const finished = timestamp(rec.finishedAt, "finishedAt", true);
  const requested = timestamp(rec.cancelRequestedAt, "cancelRequestedAt", true);
  const confirmed = timestamp(rec.cancelConfirmedAt, "cancelConfirmedAt", true);
  if (typeof rec.cwd !== "string" || rec.cwd.length === 0) {
    throw new Error("Cwd must be non-empty: code=INVALID_CWD");
  }
  if (typeof rec.command !== "string" || rec.command.length === 0) {
    throw new Error("Command must be non-empty: code=INVALID_COMMAND");
  }
  if (typeof rec.deadlineMs !== "number" || !Number.isSafeInteger(rec.deadlineMs) || rec.deadlineMs < 1 || rec.deadlineMs > MAX_JOB_DEADLINE_MS) {
    throw new Error("Deadline must be a positive safe integer <= 24 hours: code=INVALID_DEADLINE");
  }
  if (typeof rec.stateRevision !== "number" || !Number.isSafeInteger(rec.stateRevision) || rec.stateRevision < 0) {
    throw new Error("Revision must be a nonnegative safe integer: code=INVALID_REVISION");
  }
  const statuses = new Set(["pending", "running", "completed", "failed", "cancelled", "timed_out", "orphaned"]);
  if (typeof rec.status !== "string" || !statuses.has(rec.status)) {
    throw new Error("Invalid job status: code=INVALID_STATUS");
  }
  for (const key of ["workerPid", "childPid"] as const) {
    if (rec[key] !== null && (typeof rec[key] !== "number" || !Number.isSafeInteger(rec[key]) || rec[key] <= 0)) {
      throw new Error("Invalid positive safe PID " + key + ": code=INVALID_CLAIM");
    }
  }
  if (rec.workerHost !== null && (typeof rec.workerHost !== "string" || rec.workerHost.trim().length === 0)) {
    throw new Error("Worker host must be nonempty: code=INVALID_CLAIM");
  }
  if (rec.exitCode !== null && (typeof rec.exitCode !== "number" || !Number.isSafeInteger(rec.exitCode))) {
    throw new Error("Exit code must be an integer or null: code=INVALID_EXIT_FACTS");
  }
  if (rec.signal !== null && (typeof rec.signal !== "string" || !/^SIG[A-Z0-9]+$/.test(rec.signal))) {
    throw new Error("Signal must be a concrete signal name or null: code=INVALID_EXIT_FACTS");
  }
  if (rec.exitCode !== null && rec.signal !== null) {
    throw new Error("Exit code and signal are mutually exclusive: code=INVALID_EXIT_FACTS");
  }
  if (rec.durationMs !== null && (typeof rec.durationMs !== "number" || !Number.isFinite(rec.durationMs) || rec.durationMs < 0)) {
    throw new Error("Duration must be finite and nonnegative: code=INVALID_DURATION");
  }
  if (rec.error !== null) {
    const error = rec.error as Record<string, unknown> | undefined;
    if (!error || typeof error !== "object" || Array.isArray(error) ||
      typeof error.code !== "string" || error.code.trim().length === 0 ||
      typeof error.message !== "string" || error.message.trim().length === 0) {
      throw new Error("Error must contain concrete code and message: code=INVALID_ERROR");
    }
  }
  const needsClaim = ["running", "completed", "cancelled", "timed_out"].includes(rec.status);
  const hasWorkerClaim = rec.workerPid !== null || rec.workerHost !== null || started !== null || acknowledged !== null;
  if (needsClaim || hasWorkerClaim) {
    if (started === null || acknowledged === null || rec.workerPid === null || rec.workerHost === null || rec.childPid === null) {
      throw new Error("Execution requires concrete acknowledgement, start, worker, host and child: code=INVALID_CLAIM");
    }
    if (rec.stateRevision < 1) throw new Error("Claim requires a positive revision: code=INVALID_CLAIM");
  }
  if ((started !== null && started < created) ||
      (acknowledged !== null && (started === null || acknowledged < started)) ||
      (finished !== null && (finished < created || (acknowledged !== null && finished < acknowledged)))) {
    throw new Error("Execution timestamps are incoherent: code=INCOHERENT_TIMESTAMPS");
  }
  if (TERMINAL_STATUSES.has(rec.status) && finished === null) {
    throw new Error("Terminal record requires finishedAt: code=MISSING_FINISHED_AT");
  }
  if ((["completed", "cancelled", "timed_out"].includes(rec.status) || (TERMINAL_STATUSES.has(rec.status) && hasWorkerClaim)) && rec.durationMs === null) {
    throw new Error("Confirmed terminal execution requires duration: code=INVALID_DURATION");
  }
  if ((rec.status === "failed" || rec.status === "orphaned") && rec.error === null) {
    throw new Error("Failed or orphaned execution requires an error: code=INVALID_ERROR");
  }
  if (rec.status === "pending" && (hasWorkerClaim || rec.childPid !== null || finished !== null ||
      rec.durationMs !== null || rec.exitCode !== null || rec.signal !== null)) {
    throw new Error("Pending record cannot claim execution facts: code=INVALID_PENDING_FACTS");
  }
  if (rec.status === "running" && (finished !== null || rec.exitCode !== null || rec.signal !== null)) {
    throw new Error("Running record cannot claim terminal facts: code=INVALID_RUNNING_FACTS");
  }
  if (rec.status === "completed" && (rec.exitCode !== 0 || rec.signal !== null || rec.error !== null)) {
    throw new Error("Completed requires zero exit without signal or error: code=INVALID_COMPLETED_EXIT_CODE");
  }
  if (typeof rec.cancelRequested !== "boolean" ||
      (rec.cancelDelivered !== null && typeof rec.cancelDelivered !== "boolean")) {
    throw new Error("Cancellation flags must have canonical types: code=INCOHERENT_CANCEL_FACTS");
  }
  if (rec.cancelRequested !== (requested !== null) ||
      (requested !== null && requested < created) ||
      (rec.cancelDelivered === true && (!rec.cancelRequested || rec.childPid === null)) ||
      (confirmed !== null && (rec.cancelDelivered !== true || !rec.cancelRequested || rec.status !== "cancelled")) ||
      (confirmed !== null && requested !== null && confirmed < requested) ||
      (finished !== null && ((requested !== null && finished < requested) || (confirmed !== null && finished < confirmed))) ||
      (rec.status === "completed" && rec.cancelDelivered === true)) {
    throw new Error("Cancellation milestones are incoherent: code=INCOHERENT_CANCEL_FACTS");
  }
  if (rec.status === "cancelled" && (!rec.cancelRequested || rec.cancelDelivered !== true ||
      confirmed === null || (rec.exitCode === null && rec.signal === null))) {
    throw new Error("Cancelled requires requested, delivered and confirmed termination: code=UNCONFIRMED_CANCELLATION");
  }

  // Output byte bounds check
  if (rec.output !== null) {
    const out = rec.output as CommandJobOutput;
    if (typeof out !== "object" || out === null) {
      throw new Error("Output must be an object or null: code=INVALID_OUTPUT");
    }
    const outBytes = Buffer.byteLength(out.stdout ?? "", "utf8");
    const errBytes = Buffer.byteLength(out.stderr ?? "", "utf8");
    const combBytes = Buffer.byteLength(out.combined ?? "", "utf8");
    if (outBytes + errBytes > MAX_COMBINED_OUTPUT_BYTES || combBytes > MAX_COMBINED_OUTPUT_BYTES) {
      throw new Error(
        `Retained output exceeds combined 64 KiB limit (${outBytes}+${errBytes} > ${MAX_COMBINED_OUTPUT_BYTES}): code=OUTPUT_BYTE_LIMIT_EXCEEDED`,
      );
    }
  }

  return rec as unknown as CommandJobRecord;
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

export async function createJobRecord(
  stateRoot: string,
  record: CommandJobRecord,
  pkgRoot?: string,
): Promise<void> {
  validateJobId(record.jobId);
  if (record.status !== "pending") {
    throw new Error(`Initial job record must have status 'pending', got: ${record.status}`);
  }
  if (record.stateRevision !== 0) {
    throw new Error(`Initial job record stateRevision must be 0, got: ${record.stateRevision}`);
  }

  return withJobWriteLock(stateRoot, record.jobId, async () => {
    const target = jobRecordPath(stateRoot, record.jobId);
    if (existsSync(target)) {
      throw new Error(`Job record ${record.jobId} already exists; exclusive initial creation refused`);
    }

    const schema = await getCommandJobSchema(pkgRoot);
    validateJobRecord(record, schema);

    const content = `${JSON.stringify(record, null, 2)}\n`;
    await writeAtomicPrivateFile(target, content, MAX_RECORD_BYTES, stateRoot, { exclusive: true });
  });
}

export async function writeJobRecord(
  stateRoot: string,
  record: CommandJobRecord,
  pkgRoot?: string,
): Promise<void> {
  validateJobId(record.jobId);
  const target = jobRecordPath(stateRoot, record.jobId);
  if (existsSync(target)) {
    throw new Error(
      `writeJobRecord cannot overwrite existing job record ${record.jobId}; use fenced updateJobRecord API: code=UNCONDITIONAL_OVERWRITE_REFUSED`,
    );
  }
  return createJobRecord(stateRoot, record, pkgRoot);
}

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "timed_out", "orphaned"]);

export async function updateJobRecord(
  stateRoot: string,
  expected: JobFence,
  patchOrUpdater:
    | Partial<CommandJobRecord>
    | ((current: CommandJobRecord) => Partial<CommandJobRecord>),
  pkgRoot?: string,
): Promise<CommandJobRecord> {
  validateJobId(expected.jobId);

  return withJobWriteLock(stateRoot, expected.jobId, async () => {
    // 1. Read current record with bounded reader & path proof
    const current = await readJobRecord(stateRoot, expected.jobId, pkgRoot);

    // 2. Fenced CAS comparison
    if (current.jobId !== expected.jobId) {
      throw new Error(`Job ID mismatch: expected ${expected.jobId}, current ${current.jobId}`);
    }
    if (current.ownerToken !== expected.ownerToken) {
      throw new Error(
        `Stale ownerToken: expected ${expected.ownerToken}, current ${current.ownerToken}: code=STALE_OWNER`,
      );
    }
    if (current.specDigest !== expected.specDigest) {
      throw new Error(
        `Spec digest mismatch: expected ${expected.specDigest}, current ${current.specDigest}: code=SPEC_MISMATCH`,
      );
    }
    if (current.stateRevision !== expected.stateRevision) {
      throw new Error(
        `CAS state revision mismatch: expected ${expected.stateRevision}, current ${current.stateRevision}: code=STALE_REVISION`,
      );
    }

    // 3. Terminal monotonicity: once terminal, no updates permitted!
    if (TERMINAL_STATUSES.has(current.status)) {
      throw new Error(
        `Cannot update job record in terminal status '${current.status}': code=TERMINAL_RECORD_IMMUTABLE`,
      );
    }

    // Deep-freeze or clone updater input separately from untouched immutable baseline
    const baseline = structuredClone(current);
    const frozenBaseline = deepFreeze(structuredClone(current));

    const rawPatch = typeof patchOrUpdater === "function" ? patchOrUpdater(frozenBaseline) : patchOrUpdater;
    if (typeof rawPatch !== "object" || rawPatch === null || Array.isArray(rawPatch)) {
      throw new Error("Job patch must be a non-null object: code=INVALID_PATCH");
    }
    const patch = structuredClone(rawPatch);

    // 5. Verify immutable metadata preservation
    if (patch.schemaVersion !== undefined && patch.schemaVersion !== baseline.schemaVersion) {
      throw new Error("Attempted mutation of immutable schemaVersion: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.kind !== undefined && patch.kind !== baseline.kind) {
      throw new Error("Attempted mutation of immutable kind: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.jobId !== undefined && patch.jobId !== baseline.jobId) {
      throw new Error("Attempted mutation of immutable jobId: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.ownerToken !== undefined && patch.ownerToken !== baseline.ownerToken) {
      throw new Error("Attempted mutation of immutable ownerToken: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.specDigest !== undefined && patch.specDigest !== baseline.specDigest) {
      throw new Error("Attempted mutation of immutable specDigest: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.createdAt !== undefined && patch.createdAt !== baseline.createdAt) {
      throw new Error("Attempted mutation of immutable createdAt: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.cwd !== undefined && patch.cwd !== baseline.cwd) {
      throw new Error("Attempted mutation of immutable cwd: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.command !== undefined && patch.command !== baseline.command) {
      throw new Error("Attempted mutation of immutable command: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.deadlineMs !== undefined && patch.deadlineMs !== baseline.deadlineMs) {
      throw new Error("Attempted mutation of immutable deadlineMs: code=MUTATE_IMMUTABLE_METADATA");
    }
    if (patch.stateRevision !== undefined) {
      throw new Error(
        `Explicit stateRevision assignment in patch is refused; revision is managed by updateJobRecord: code=REVISION_REGRESSION`,
      );
    }

    // Helper controls revision: baseline + 1
    const nextRevision = baseline.stateRevision + 1;

    // Full candidate={...baseline,...patch,stateRevision:baseline+1}
    const candidate: CommandJobRecord = {
      ...baseline,
      ...patch,
      schemaVersion: 1,
      kind: "command-job",
      jobId: baseline.jobId,
      ownerToken: baseline.ownerToken,
      specDigest: baseline.specDigest,
      createdAt: baseline.createdAt,
      cwd: baseline.cwd,
      command: baseline.command,
      deadlineMs: baseline.deadlineMs,
      stateRevision: nextRevision,
    };

    // Allowed monotonic status transitions
    const nextStatus = candidate.status;
    if (baseline.status === "pending") {
      if (nextStatus !== "pending" && nextStatus !== "running" && !TERMINAL_STATUSES.has(nextStatus)) {
        throw new Error(`Invalid status transition from 'pending' to '${nextStatus}': code=INVALID_TRANSITION`);
      }
    } else if (baseline.status === "running") {
      if (nextStatus !== "running" && !TERMINAL_STATUSES.has(nextStatus)) {
        throw new Error(`Invalid status transition from 'running' to '${nextStatus}': code=INVALID_TRANSITION`);
      }
    }

    // Once nonnull workerPid/host/childPid/startedAt/acknowledgedAt cannot change or clear
    if (baseline.workerPid !== null && candidate.workerPid !== baseline.workerPid) {
      throw new Error(
        `Job workerPid once set cannot be changed or cleared: baseline ${baseline.workerPid}, candidate ${candidate.workerPid}: code=CLAIM_DRIFT`,
      );
    }
    if (baseline.workerHost !== null && candidate.workerHost !== baseline.workerHost) {
      throw new Error(
        `Job workerHost once set cannot be changed or cleared: baseline ${baseline.workerHost}, candidate ${candidate.workerHost}: code=CLAIM_DRIFT`,
      );
    }
    if (baseline.childPid !== null && candidate.childPid !== baseline.childPid) {
      throw new Error(
        `Job childPid once set cannot be changed or cleared: baseline ${baseline.childPid}, candidate ${candidate.childPid}: code=CLAIM_DRIFT`,
      );
    }
    if (baseline.startedAt !== null && candidate.startedAt !== baseline.startedAt) {
      throw new Error(
        `Job startedAt once set cannot be changed or cleared: baseline ${baseline.startedAt}, candidate ${candidate.startedAt}: code=CLAIM_DRIFT`,
      );
    }
    if (baseline.acknowledgedAt !== null && candidate.acknowledgedAt !== baseline.acknowledgedAt) {
      throw new Error(
        `Job acknowledgedAt once set cannot be changed or cleared: baseline ${baseline.acknowledgedAt}, candidate ${candidate.acknowledgedAt}: code=CLAIM_DRIFT`,
      );
    }

    // Validate candidate schema + domain invariants through shared validateJobRecord
    const schema = await getCommandJobSchema(pkgRoot);
    validateJobRecord(candidate, schema);

    const content = `${JSON.stringify(candidate, null, 2)}\n`;
    const target = jobRecordPath(stateRoot, expected.jobId);
    await writeAtomicPrivateFile(target, content, MAX_RECORD_BYTES, stateRoot);

    return candidate;
  });
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
  validateJobRecord(parsed, schema);

  if (parsed.jobId !== jobId || parsed.kind !== "command-job" || parsed.schemaVersion !== 1) {
    throw new Error(`Job record ${target} identity mismatch or tampered`);
  }

  // Enforce output byte invariant on read
  if (parsed.output !== null) {
    const outBytes = Buffer.byteLength(parsed.output.stdout, "utf8");
    const errBytes = Buffer.byteLength(parsed.output.stderr, "utf8");
    const combBytes = Buffer.byteLength(parsed.output.combined, "utf8");
    if (outBytes + errBytes > MAX_COMBINED_OUTPUT_BYTES || combBytes > MAX_COMBINED_OUTPUT_BYTES) {
      throw new Error(`Output exceeds combined 64 KiB UTF-8 byte limit on read`);
    }
  }

  return parsed;
}

function resolveCliPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const candidateDist = resolve(dirname(currentFile), "..", "cli.js");
  return candidateDist;
}

export async function startCommandJob(
  options: StartCommandJobOptions,
  _testBarrier?: CommandJobPathBarrier,
): Promise<StartCommandJobResult> {
  const { stateRoot, cwd, executable, args } = options;

  // 1. Bound aggregate args BEFORE any state creation
  let aggregateBytes = 0;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== "string") {
      throw new Error(`Argument at index ${i} is not a string`);
    }
    if (arg.includes("\0")) {
      throw new Error(`Argument at index ${i} contains forbidden NUL character`);
    }
    aggregateBytes += Buffer.byteLength(arg, "utf8");
  }
  if (aggregateBytes > MAX_AGGREGATE_ARGS_BYTES) {
    throw new Error(
      `Command arguments aggregate size exceeds 64 KiB limit (${aggregateBytes} > ${MAX_AGGREGATE_ARGS_BYTES})`,
    );
  }

  // 2. Validate CWD exists and is a directory
  const resolvedCwd = resolve(cwd);
  const cwdStat = await stat(resolvedCwd);
  if (!cwdStat.isDirectory()) {
    throw new Error(`Job working directory is not a directory: ${resolvedCwd}`);
  }

  // 3. Validate external state root is not inside cwd or project
  assertStateRootNotInsideProject(stateRoot, resolvedCwd);

  // 4. Validate executable exists and is directly executable without an interpreter
  const resolvedExecutable = resolveCommand(executable) ?? resolve(executable);
  try {
    const execStat = await stat(resolvedExecutable);
    if (!execStat.isFile()) {
      throw new Error(`Executable is not a regular file: ${resolvedExecutable}`);
    }
  } catch (err: unknown) {
    throw new Error(`Cannot locate executable: ${resolvedExecutable} (${(err as Error).message})`);
  }

  if (!isDirectlyExecutable(resolvedExecutable)) {
    throw new Error(`Running interpreted scripts without a native binary is not permitted: ${resolvedExecutable}`);
  }

  // 5. Reject credentials in arguments or executable before any serialization
  assertNoCredentialsInArgs(resolvedExecutable, args, process.env);

  // 6. Validate deadline
  const deadlineMs =
    options.deadlineMs !== undefined
      ? validateNumericFlag(options.deadlineMs, "deadlineMs", 1, MAX_JOB_DEADLINE_MS)
      : DEFAULT_JOB_DEADLINE_MS;

  // 7. Create immutable random job ID and owner token
  const jobId = `job-${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const ownerToken = randomUUID();
  const createdAt = new Date().toISOString();

  // 8. Validate private launch spec BEFORE state creation
  const launchSpec = validatePrivateLaunchSpec({
    schemaVersion: 1,
    kind: "command-job-launch",
    jobId,
    ownerToken,
    executable: resolvedExecutable,
    args,
    cwd: resolvedCwd,
    deadlineMs,
    createdAt,
  });

  const specDigest = computeSpecDigest({
    executable: resolvedExecutable,
    args,
    cwd: resolvedCwd,
    deadlineMs,
  });

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

  // Serialize the actual wire representations before creating any state.
  const specContent = JSON.stringify(launchSpec, null, 2) + "\n";
  const initialRecordContent = JSON.stringify(initialRecord, null, 2) + "\n";
  assertPrivateByteLimit(specContent, MAX_LAUNCH_SPEC_BYTES);
  assertPrivateByteLimit(initialRecordContent, MAX_RECORD_BYTES);

  const dir = jobDirectory(stateRoot, jobId), jobsDir = dirname(dir);
  const jobsCreationProof = await provePlainJobPath(jobsDir, stateRoot, "state");
  await recheckJobPath(jobsCreationProof);
  await mkdir(jobsDir, { recursive: true, mode: 0o700 });
  await recheckJobPath(jobsCreationProof);
  const jobsProof = await provePlainJobPath(jobsDir, stateRoot, "state");
  await _testBarrier?.("start:before-job-mkdir", dir);
  await recheckJobPath(jobsProof);
  await mkdir(dir, { mode: 0o700 }); // Exclusive claim: EEXIST must preserve the entire prior directory.
  await recheckJobPath(jobsProof);
  const directoryProof = await provePlainJobPath(dir, stateRoot, "state");
  const launchSpecFile = launchSpecPath(stateRoot, jobId);
  let launchIdentity: JobFileIdentity | null = null;
  const cleanupOwnedLaunch = async (): Promise<void> => {
    if (launchIdentity !== null) {
      await unlinkOwnedJobFile(launchSpecFile, launchIdentity, directoryProof).catch(() => undefined);
    }
  };

  try {
    await _testBarrier?.("start:after-job-mkdir", dir);
    await recheckJobPath(directoryProof);
    launchIdentity = await publishPrivateJobFile(
      launchSpecFile, specContent, MAX_LAUNCH_SPEC_BYTES, stateRoot,
      { exclusive: true, barrier: _testBarrier },
    );
    await recheckJobPath(directoryProof);
    await createJobRecord(stateRoot, initialRecord);
  } catch (error) {
    await cleanupOwnedLaunch();
    // A failed create may have encountered another record. Never unlink job.json here.
    await recheckJobPath(directoryProof).then(() => rmdir(dir)).catch(() => undefined);
    throw error;
  }

  // 11. Start detached one-job worker via process adapter
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
    await cleanupOwnedLaunch();
    throw err;
  }

  // 12. Handshake: wait for worker to assume ownership and transition to running (or fast completion)
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

        // Bind acknowledged records to the actual worker spawned by this launcher.
        try {
          assertJobIdentityMatch(current, {
            ...identityOfJob(initialRecord),
            ...(current.status !== "pending" ? { workerPid: workerHandle?.pid ?? -1, workerHost: hostname() } : {}),
          }, "handshake");
        } catch (err: unknown) {
          throw new Error(`Job identity drift during start handshake: code=IDENTITY_DRIFT; ${(err as Error).message}`);
        }
        // Verify pinned immutable identity during handshake
        if (
          current.jobId !== jobId ||
          current.ownerToken !== ownerToken ||
          current.specDigest !== specDigest ||
          current.cwd !== resolvedCwd ||
          current.deadlineMs !== deadlineMs ||
          current.createdAt !== createdAt
        ) {
          throw new Error(`Job identity drift detected during start handshake: code=IDENTITY_DRIFT`);
        }

        if (current.status === "running") {
          // Require proven claim and child start
          if (
            typeof current.acknowledgedAt === "string" &&
            current.acknowledgedAt.length > 0 &&
            typeof current.startedAt === "string" &&
            current.startedAt.length > 0 &&
            typeof current.workerPid === "number" &&
            current.workerPid > 0 &&
            typeof current.childPid === "number" &&
            current.childPid > 0 &&
            typeof current.stateRevision === "number" &&
            current.stateRevision >= 1 &&
            current.workerHost !== null
          ) {
            runningRecord = { ...current, status: "running" };
            break;
          }
        }

        // Accept fast terminal record ONLY with concrete proof of claim and start
        if (
          (current.status === "completed" ||
            current.status === "failed" ||
            current.status === "cancelled" ||
            current.status === "timed_out") &&
          typeof current.acknowledgedAt === "string" &&
          current.acknowledgedAt.length > 0 &&
          typeof current.startedAt === "string" &&
          current.startedAt.length > 0 &&
          typeof current.workerPid === "number" &&
          current.workerPid > 0 &&
          typeof current.childPid === "number" &&
          current.childPid > 0 &&
          typeof current.stateRevision === "number" &&
          current.stateRevision >= 1 &&
          current.workerHost !== null &&
          typeof current.finishedAt === "string"
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
          (err as Error).message.includes("Worker orphaned") ||
          (err as Error).message.includes("IDENTITY_DRIFT")
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

      await cleanupOwnedLaunch();

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
    await cleanupOwnedLaunch();
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

export async function getCommandJobStatus(stateRoot: string, jobId: string): Promise<CommandJobRecord> {
  validateJobId(jobId);
  const record = await readJobRecord(stateRoot, jobId);

  // Check pre-ack dead pending worker
  if (record.status === "pending") {
    const ageMs = Date.now() - Date.parse(record.createdAt);
    if (ageMs > 10000) {
      return {
        ...record,
        status: "orphaned",
        finishedAt: new Date().toISOString(),
        error: {
          code: "WORKER_ORPHANED",
          message: "Worker failed to acknowledge job within handshake window",
        },
      };
    }
    return record;
  }

  if (record.status === "running") {
    const isForeignHost = record.workerHost !== null && record.workerHost !== hostname();
    if (isForeignHost) {
      return record;
    }
    const isWorkerDead = record.workerPid !== null && !isProcessAlive(record.workerPid);

    if (isWorkerDead) {
      // Re-read after 50ms grace in case the worker just flushed its terminal write
      await new Promise((r) => setTimeout(r, 50));
      const fresh = await readJobRecord(stateRoot, jobId).catch(() => record);
      if (fresh.status !== "running") {
        return fresh;
      }

      // Verify worker identity is identical before diagnosing orphaned
      if (fresh.workerPid === record.workerPid && fresh.ownerToken === record.ownerToken) {
        const orphanedRecord: CommandJobRecord = {
          ...fresh,
          status: "orphaned",
          finishedAt: new Date().toISOString(),
          error: {
            code: "WORKER_ORPHANED",
            message: `Worker process ${fresh.workerPid} terminated unexpectedly`,
          },
        };
        return orphanedRecord;
      }
    }
  }

  return record;
}

function identityOfJob(record: CommandJobRecord): ExpectedJobIdentity {
  return {
    jobId: record.jobId, ownerToken: record.ownerToken, specDigest: record.specDigest,
    createdAt: record.createdAt, cwd: record.cwd, command: record.command,
    deadlineMs: record.deadlineMs, minRevision: record.stateRevision,
    workerPid: record.workerPid, workerHost: record.workerHost, childPid: record.childPid,
    startedAt: record.startedAt, acknowledgedAt: record.acknowledgedAt,
  };
}

export async function waitCommandJob(options: {
  stateRoot: string;
  jobId: string;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  expectedIdentity?: ExpectedJobIdentity | undefined;
}): Promise<ObserverSettlement<CommandJobRecord>> {
  const { stateRoot, jobId, timeoutMs, signal, expectedIdentity } = options;
  validateJobId(jobId);
  let pinned: ExpectedJobIdentity | undefined = expectedIdentity;
  let lastRevision: number | null = null;
  let lastSnapshot: string | null = null;
  return waitForCompletion<CommandJobRecord>({
    targetPath: jobRecordPath(stateRoot, jobId), watchDir: jobDirectory(stateRoot, jobId),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(signal !== undefined ? { signal } : {}),
    check: async () => {
      let record: CommandJobRecord;
      try {
        record = await getCommandJobStatus(stateRoot, jobId);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "EBUSY" || code === "EPERM") return { state: "pending" };
        return { state: "unresolved", code: "RECORD_READ_ERROR", reason: err instanceof Error ? err.message : String(err) };
      }
      try {
        if (pinned) assertJobIdentityMatch(record, pinned, "wait");
      } catch (err: unknown) {
        const reason = err instanceof Error ? err.message : String(err);
        return { state: "unresolved", code: /code=([A-Z_]+)/.exec(reason)?.[1] ?? "IDENTITY_DRIFT", reason };
      }
      const snapshot = JSON.stringify(record);
      if (lastRevision === record.stateRevision && lastSnapshot !== snapshot) {
        return { state: "unresolved", code: "REVISION_CONFLICT", reason: "Job bytes changed without advancing their state revision." };
      }
      lastRevision = record.stateRevision;
      lastSnapshot = snapshot;
      // A concrete claim can first appear after a pending record, then remains immutable.
      pinned = identityOfJob(record);
      if (record.workerHost !== null && record.workerHost !== hostname() && record.status === "running") {
        return { state: "unresolved", code: "REMOTE_WORKER_UNRESOLVABLE", reason: `Worker is on remote host ${record.workerHost}; liveness is unprovable locally.` };
      }
      if (record.status === "orphaned") {
        return { state: "unresolved", code: "WORKER_ORPHANED", reason: record.error?.message ?? "Worker orphaned" };
      }
      if (TERMINAL_STATUSES.has(record.status)) return { state: "terminal", value: record };
      return { state: "pending" };
    },
  });
}

export async function cancelCommandJob(options: {
  stateRoot: string;
  jobId: string;
  timeoutMs?: number;
}): Promise<CommandJobRecord> {
  const { stateRoot, jobId } = options;
  validateJobId(jobId);
  const timeoutMs = validateNumericFlag(options.timeoutMs ?? 5000, "timeoutMs", 1, MAX_JOB_DEADLINE_MS);
  const current = await readJobRecord(stateRoot, jobId);
  if (TERMINAL_STATUSES.has(current.status)) return current;
  const expected = identityOfJob(current);
  const cancelPayload = validateCancelRequest({
    schemaVersion: 1, kind: "command-job-cancel", jobId,
    ownerToken: current.ownerToken, specDigest: current.specDigest, requestedAt: new Date().toISOString(),
  }, expected);
  await writeAtomicPrivateFile(cancelRequestPath(stateRoot, jobId), `${JSON.stringify(cancelPayload, null, 2)}\n`, MAX_CANCEL_REQUEST_BYTES, stateRoot);
  const settlement = await waitCommandJob({ stateRoot, jobId, timeoutMs, expectedIdentity: expected });
  if (settlement.status === "completed") {
    assertJobIdentityMatch(settlement.value, expected, "cancel");
    return settlement.value;
  }
  if (settlement.status === "refused" || settlement.status === "unresolved") {
    throw new Error(`Cancellation observation refused: code=${settlement.code}; ${settlement.reason}`);
  }
  throw new Error(`Cancellation confirmation was not observed: code=${settlement.status === "timeout" ? "CANCEL_OBSERVATION_TIMEOUT" : "CANCEL_OBSERVATION_ABORTED"}`);
}
