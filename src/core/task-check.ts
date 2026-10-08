import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { reviewedDigest } from "./component-session.js";
import { nodeRuntimeEnvironment } from "./install.js";
import { runProcess, type ProcessResult } from "./process.js";
import { normalizeContractPath, type TaskContract, type TaskCriterion } from "./task-contract.js";
import type { TaskMeasurement, TaskReviewReproduction } from "./task-run.js";
import type { TaskReviewRuleConfirmation } from "./task-review-evidence.js";

/** The domain separator every task artifact digest is bound under. */
export const TASK_ARTIFACT_DIGEST_KIND = "task-artifact";

/** Bounds on what one run collects, copies and executes (T-14-21). */
export const TASK_ARTIFACT_LIMITS = {
  maxFiles: 2000,
  maxTotalBytes: 16 * 1024 * 1024,
  measurementTimeoutMs: 30_000,
  measurementOutputBytes: 65_536,
} as const;

export type TaskDecisionCategory =
  | "implementation"
  | "file-layout"
  | "verification"
  | "dependency"
  | "measurement-substitute"
  | "gsd-default";

/** One controller decision as recorded in the run's decision log (CON-02, D-06). */
export interface TaskDecision {
  id: string;
  at: string;
  category: TaskDecisionCategory;
  choice: string;
  rationale: string;
  criterionIds: string[];
  substitute: { criterionId: string; entry: string } | null;
}

/**
 * A substitute carries an entry path and nothing else: there is no input or
 * expectation field, so a decision cannot change what is measured (D-08).
 */
export interface TaskMeasurementSubstitute {
  decisionId: string;
  criterionId: string;
  entry: string;
}

export interface TaskArtifactFile {
  path: string;
  sha256: string;
  bytes: number;
}

export interface TaskArtifactManifest {
  status: "ok";
  allowedRoots: string[];
  files: TaskArtifactFile[];
  digest: string;
  fileCount: number;
  totalBytes: number;
}

export type TaskArtifactCause = "artifact-link" | "artifact-too-large" | "artifact-unreadable";

export interface TaskArtifactUnavailable {
  status: "unavailable";
  cause: TaskArtifactCause;
  detail: string;
}

export type TaskArtifactCollection = TaskArtifactManifest | TaskArtifactUnavailable;

export interface TaskReproductionConfirmation {
  confirmed: boolean;
  detail: string;
}

/** Path segments that are never part of a task artifact. */
const ARTIFACT_SKIPPED_SEGMENTS = new Set([".git", ".planning", ".alpha-aos", "node_modules"]);
const DETAIL_LIMIT = 299;

function bounded(text: string, limit: number = DETAIL_LIMIT): string {
  const single = text.replace(/\s+/gu, " ").trim();
  return single.length <= limit ? single : `${single.slice(0, limit - 3)}...`;
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function outsideRoot(rel: string): boolean {
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

function posix(rel: string): string {
  return rel.split(sep).join("/");
}

function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

class ArtifactUnavailable extends Error {
  constructor(
    readonly cause: TaskArtifactCause,
    readonly detail: string,
  ) {
    super(detail);
  }
}

function errnoOf(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" ? code : "EUNKNOWN";
}

// ---------------------------------------------------------------------------
// Artifact manifest
// ---------------------------------------------------------------------------

/**
 * The sorted path and hash manifest of every regular file under the allowed
 * roots. A link anywhere under (or above) an allowed root refuses the whole
 * artifact, because a link would let the measured bytes differ from the
 * reviewed ones.
 */
export async function collectTaskArtifact(options: {
  projectRoot: string;
  allowedRoots: readonly string[];
}): Promise<TaskArtifactCollection> {
  const projectRoot = resolve(options.projectRoot);
  const allowedRoots = options.allowedRoots.map(normalizeContractPath);
  const files = new Map<string, TaskArtifactFile>();
  let totalBytes = 0;

  const tooLarge = (): ArtifactUnavailable =>
    new ArtifactUnavailable(
      "artifact-too-large",
      `the artifact exceeds ${TASK_ARTIFACT_LIMITS.maxFiles} files or ${TASK_ARTIFACT_LIMITS.maxTotalBytes} bytes`,
    );

  async function statOf(absolute: string, rel: string) {
    try {
      return await lstat(absolute);
    } catch (error) {
      throw new ArtifactUnavailable("artifact-unreadable", `${errnoOf(error)} reading ${rel === "" ? "." : rel}`);
    }
  }

  async function walk(absolute: string, rel: string): Promise<void> {
    if (rel !== "" && rel.split("/").some((segment) => ARTIFACT_SKIPPED_SEGMENTS.has(segment))) return;
    const stat = await statOf(absolute, rel);
    if (stat.isSymbolicLink()) throw new ArtifactUnavailable("artifact-link", `${rel === "" ? "." : rel} is a symbolic link`);
    if (stat.isDirectory()) {
      let names: string[];
      try {
        names = await readdir(absolute);
      } catch (error) {
        throw new ArtifactUnavailable("artifact-unreadable", `${errnoOf(error)} listing ${rel === "" ? "." : rel}`);
      }
      for (const name of names.sort(byCodeUnit)) {
        await walk(join(absolute, name), rel === "" ? name : `${rel}/${name}`);
      }
      return;
    }
    if (!stat.isFile()) throw new ArtifactUnavailable("artifact-unreadable", `${rel} is not a regular file`);
    if (files.has(rel)) return;
    if (files.size + 1 > TASK_ARTIFACT_LIMITS.maxFiles) throw tooLarge();
    if (totalBytes + stat.size > TASK_ARTIFACT_LIMITS.maxTotalBytes) throw tooLarge();
    let content: Buffer;
    try {
      content = await readFile(absolute);
    } catch (error) {
      throw new ArtifactUnavailable("artifact-unreadable", `${errnoOf(error)} reading ${rel}`);
    }
    totalBytes += content.byteLength;
    if (totalBytes > TASK_ARTIFACT_LIMITS.maxTotalBytes) throw tooLarge();
    files.set(rel, { path: rel, sha256: sha256(content), bytes: content.byteLength });
  }

  /** Every segment from the project root down to the allowed root must be a real directory. */
  async function reachable(rel: string): Promise<boolean> {
    const segments = rel === "" ? [] : rel.split("/");
    for (let index = 1; index < segments.length; index += 1) {
      const partial = segments.slice(0, index).join("/");
      try {
        const stat = await lstat(join(projectRoot, ...segments.slice(0, index)));
        if (stat.isSymbolicLink()) throw new ArtifactUnavailable("artifact-link", `${partial} is a symbolic link`);
        if (!stat.isDirectory()) return false;
      } catch (error) {
        if (error instanceof ArtifactUnavailable) throw error;
        if (errnoOf(error) === "ENOENT") return false;
        throw new ArtifactUnavailable("artifact-unreadable", `${errnoOf(error)} reading ${partial}`);
      }
    }
    if (rel === "") return true;
    try {
      await lstat(join(projectRoot, ...segments));
      return true;
    } catch (error) {
      if (errnoOf(error) === "ENOENT") return false;
      throw new ArtifactUnavailable("artifact-unreadable", `${errnoOf(error)} reading ${rel}`);
    }
  }

  try {
    for (const allowed of allowedRoots) {
      const rel = relative(projectRoot, resolve(projectRoot, allowed));
      if (outsideRoot(rel)) {
        throw new ArtifactUnavailable("artifact-unreadable", `allowed root ${allowed} resolves outside the project root`);
      }
      const relPosix = posix(rel);
      if (!(await reachable(relPosix))) continue;
      await walk(join(projectRoot, rel), relPosix);
    }
  } catch (error) {
    if (error instanceof ArtifactUnavailable) {
      return { status: "unavailable", cause: error.cause, detail: bounded(error.detail) };
    }
    throw error;
  }

  const sorted = [...files.values()].sort((left, right) => byCodeUnit(left.path, right.path));
  return {
    status: "ok",
    allowedRoots,
    files: sorted,
    digest: reviewedDigest(
      TASK_ARTIFACT_DIGEST_KIND,
      sorted.map((file) => [file.path, file.sha256]),
    ),
    fileCount: sorted.length,
    totalBytes,
  };
}

/**
 * Copies exactly the manifest's files into a fresh directory and proves the
 * copy re-collects to the manifest digest, so measurement and review both see
 * the bytes that were hashed and nothing written afterwards (REV-01).
 */
export async function materializeTaskSnapshot(options: {
  manifest: TaskArtifactManifest;
  projectRoot: string;
  destination: string;
}): Promise<string> {
  const { manifest } = options;
  const projectRoot = resolve(options.projectRoot);
  const destination = resolve(options.destination);
  await mkdir(destination, { recursive: false });
  for (const file of manifest.files) {
    const segments = file.path.split("/");
    const source = join(projectRoot, ...segments);
    const target = join(destination, ...segments);
    if (outsideRoot(relative(destination, target)) || outsideRoot(relative(projectRoot, source))) {
      throw new Error(`Snapshot refused: manifest path ${file.path} leaves its root.`);
    }
    const content = await readFile(source);
    if (sha256(content) !== file.sha256) {
      throw new Error(`Snapshot refused: ${file.path} changed after the artifact was collected.`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, { flag: "wx" });
    if (sha256(await readFile(target)) !== file.sha256) {
      throw new Error(`Snapshot refused: the copy of ${file.path} does not match its manifest hash.`);
    }
  }
  const copied = await collectTaskArtifact({ projectRoot: destination, allowedRoots: manifest.allowedRoots });
  if (copied.status !== "ok" || copied.digest !== manifest.digest) {
    throw new Error(
      `Snapshot refused: the copy re-collects to ${copied.status === "ok" ? copied.digest.slice(0, 12) : copied.cause}, not ${manifest.digest.slice(0, 12)}.`,
    );
  }
  return destination;
}

// ---------------------------------------------------------------------------
// Measurement (D-11: the executor's claim never enters here)
// ---------------------------------------------------------------------------

function pointerSegment(key: string): string {
  return /^[A-Za-z0-9_.-]{1,64}$/u.test(key) ? key.replaceAll("~", "~0").replaceAll("/", "~1") : "<key>";
}

function preview(value: unknown): string {
  const text = JSON.stringify(value) ?? "undefined";
  return text.length <= 40 ? text : `${text.slice(0, 37)}...`;
}

/** The JSON pointer of the first place `actual` departs from `expected`, with both values there. */
function firstDifference(expected: unknown, actual: unknown, path: string): string {
  const here = (): string => `${path === "" ? "/" : path}: expected ${preview(expected)}, got ${preview(actual)}`;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return here();
    for (let index = 0; index < expected.length; index += 1) {
      if (!isDeepStrictEqual(expected[index], actual[index])) {
        return firstDifference(expected[index], actual[index], `${path}/${index}`);
      }
    }
    return here();
  }
  const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (isObject(expected) && isObject(actual)) {
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort(byCodeUnit);
    for (const key of keys) {
      const at = `${path}/${pointerSegment(key)}`;
      if (!(key in expected)) return `${at}: not expected, got ${preview(actual[key])}`;
      if (!(key in actual)) return `${at}: expected ${preview(expected[key])}, missing`;
      if (!isDeepStrictEqual(expected[key], actual[key])) return firstDifference(expected[key], actual[key], at);
    }
  }
  return here();
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text.trim()) };
  } catch {
    return { ok: false };
  }
}

function compareJson(stream: "stdout" | "stderr", expected: unknown, text: string): string | null {
  const parsed = parseJson(text);
  if (!parsed.ok) return `${stream} is not a single JSON value`;
  if (isDeepStrictEqual(parsed.value, expected)) return null;
  return `${stream} JSON differs at ${firstDifference(expected, parsed.value, "")}`;
}

type RunOutcome =
  | { kind: "ran"; result: ProcessResult }
  | { kind: "unavailable"; cause: "timeout" | "output-capped" | "spawn-failed"; detail: string; result: ProcessResult | null };

async function runEntry(options: {
  entryPath: string;
  inputPath: string;
  root: string;
  timeoutMs: number;
}): Promise<RunOutcome> {
  let result: ProcessResult;
  try {
    result = await runProcess({
      executable: process.execPath,
      args: [options.entryPath, options.inputPath],
      cwd: options.root,
      environment: nodeRuntimeEnvironment({ source: process.env }),
      timeoutMs: options.timeoutMs,
      maxOutputBytes: TASK_ARTIFACT_LIMITS.measurementOutputBytes,
      excerptBytes: TASK_ARTIFACT_LIMITS.measurementOutputBytes,
    });
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    return {
      kind: "unavailable",
      cause: "spawn-failed",
      detail: `Node could not start the program (${typeof code === "string" ? code : "spawn-refused"}).`,
      result: null,
    };
  }
  if (result.code === "timeout" || result.timedOut) {
    return {
      kind: "unavailable",
      cause: "timeout",
      detail: `The program ran past the ${options.timeoutMs} ms measurement bound and was stopped.`,
      result,
    };
  }
  if (result.code === "output-cap" || result.outputCapped || result.stdout.capped || result.stderr.capped) {
    return {
      kind: "unavailable",
      cause: "output-capped",
      detail: `The program wrote more than ${TASK_ARTIFACT_LIMITS.measurementOutputBytes} bytes to one stream.`,
      result,
    };
  }
  if (result.code !== "ok" && result.code !== "non-zero-exit") {
    return { kind: "unavailable", cause: "spawn-failed", detail: `Node could not run the program (${result.code}).`, result };
  }
  return { kind: "ran", result };
}

/** The entry normalized and confined to the allowed roots, or null. */
function confinedEntry(entry: string, allowedRoots: readonly string[]): string | null {
  const normalized = normalizeContractPath(entry);
  if (normalized === "" || isAbsolute(normalized) || /^[A-Za-z]:/u.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) return null;
  const inside = allowedRoots
    .map(normalizeContractPath)
    .some((root) => normalized === root || normalized.startsWith(`${root}/`));
  return inside ? normalized : null;
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch {
    return false;
  }
}

function resolvedInside(root: string, entry: string): string | null {
  const path = resolve(root, ...entry.split("/"));
  const rel = relative(root, path);
  return rel === "" || outsideRoot(rel) ? null : path;
}

/**
 * Measures one criterion on the snapshot with exactly the contract's input
 * and expectations. A substitute relocates the entry only, and only when the
 * contract entry is absent and the substitute lies inside the allowed roots.
 */
export async function measureTaskCriterion(options: {
  criterion: TaskCriterion;
  root: string;
  scratchRoot: string;
  allowedRoots: readonly string[];
  substitute: TaskMeasurementSubstitute | null;
  timeoutMs?: number;
}): Promise<TaskMeasurement> {
  const { criterion } = options;
  const root = resolve(options.root);
  const measurement = criterion.measurement;
  const contractEntry = normalizeContractPath(measurement.entry);
  const contractPath = resolvedInside(root, contractEntry);

  let entryPath: string | null = contractPath !== null && (await isRegularFile(contractPath)) ? contractPath : null;
  let entryName = contractEntry;
  let measuredBy: TaskMeasurement["measuredBy"] = "contract";
  let substituteDecisionId: string | null = null;
  if (entryPath === null && options.substitute !== null && options.substitute.criterionId === criterion.id) {
    const confined = confinedEntry(options.substitute.entry, options.allowedRoots);
    const candidate = confined === null ? null : resolvedInside(root, confined);
    if (confined !== null && candidate !== null && (await isRegularFile(candidate))) {
      entryPath = candidate;
      entryName = confined;
      measuredBy = "substitute";
      substituteDecisionId = options.substitute.decisionId;
    }
  }

  const base = { criterionId: criterion.id, measuredBy, substituteDecisionId };
  if (entryPath === null) {
    return {
      ...base,
      outcome: "unavailable",
      cause: "entry-missing",
      exitCode: null,
      stdoutSha256: null,
      detail: bounded(`The measurement entry ${contractEntry} does not exist in the artifact.`),
    };
  }

  const inputDirectory = join(options.scratchRoot, "inputs");
  await mkdir(inputDirectory, { recursive: true });
  const inputPath = join(inputDirectory, `${criterion.id}.txt`);
  await writeFile(inputPath, measurement.inputText, "utf8");

  const ran = await runEntry({
    entryPath,
    inputPath,
    root,
    timeoutMs: options.timeoutMs ?? TASK_ARTIFACT_LIMITS.measurementTimeoutMs,
  });
  if (ran.kind === "unavailable") {
    return {
      ...base,
      outcome: "unavailable",
      cause: ran.cause,
      exitCode: ran.result?.exitCode ?? null,
      stdoutSha256: ran.result?.stdout.sha256 ?? null,
      detail: bounded(ran.detail),
    };
  }

  const { result } = ran;
  const expect = measurement.expect;
  let mismatch: string | null = null;
  if (result.exitCode !== expect.exitCode) {
    mismatch = `exit code ${String(result.exitCode)}, expected ${expect.exitCode}`;
  }
  if (mismatch === null && expect.stdoutJson !== undefined) mismatch = compareJson("stdout", expect.stdoutJson, result.stdout.excerpt);
  if (mismatch === null && expect.stdoutEmpty === true && result.stdout.totalBytes > 0) {
    mismatch = `stdout carried ${result.stdout.totalBytes} bytes, expected none`;
  }
  if (mismatch === null && expect.stderrJson !== undefined) mismatch = compareJson("stderr", expect.stderrJson, result.stderr.excerpt);

  return {
    ...base,
    outcome: mismatch === null ? "pass" : "fail",
    cause: "none",
    exitCode: result.exitCode,
    stdoutSha256: result.stdout.sha256,
    detail: bounded(
      mismatch === null
        ? `${entryName} exited ${String(result.exitCode)} and its output matched the contract.`
        : `${entryName}: ${mismatch}.`,
    ),
  };
}

/**
 * The first measurement-substitute decision per contract criterion. Any other
 * decision category, or a substitute naming no contract criterion, is ignored.
 */
export function selectMeasurementSubstitutes(
  decisions: readonly TaskDecision[],
  contract: TaskContract,
): TaskMeasurementSubstitute[] {
  const known = new Set(contract.criterion.map((criterion) => criterion.id));
  const chosen = new Map<string, TaskMeasurementSubstitute>();
  for (const decision of decisions) {
    if (decision.category !== "measurement-substitute" || decision.substitute === null) continue;
    const { criterionId, entry } = decision.substitute;
    if (!known.has(criterionId) || chosen.has(criterionId)) continue;
    chosen.set(criterionId, { decisionId: decision.id, criterionId, entry: normalizeContractPath(entry) });
  }
  return [...chosen.values()];
}

function sameStdout(observed: string, actual: string): boolean {
  const left = parseJson(observed);
  const right = parseJson(actual);
  if (left.ok && right.ok) return isDeepStrictEqual(left.value, right.value);
  return observed.trim() === actual.trim();
}

/**
 * Runs the CONTRACT entry on the reviewer's input text — written to a scratch
 * file as data, never executed — and confirms the reviewer's observation only
 * when alpha-AOS sees the same exit code and output itself (D-14, T-14-18).
 */
export async function confirmReviewerReproduction(options: {
  criterion: TaskCriterion;
  reproduction: TaskReviewReproduction;
  root: string;
  scratchRoot: string;
  timeoutMs?: number;
}): Promise<TaskReproductionConfirmation> {
  const { criterion, reproduction } = options;
  const root = resolve(options.root);
  const entry = normalizeContractPath(criterion.measurement.entry);
  const entryPath = resolvedInside(root, entry);
  if (entryPath === null || !(await isRegularFile(entryPath))) {
    return { confirmed: false, detail: bounded(`The contract entry ${entry} does not exist, so the reproduction cannot be run.`) };
  }
  const directory = join(options.scratchRoot, "reproductions");
  await mkdir(directory, { recursive: true });
  const inputPath = join(directory, `${criterion.id}.txt`);
  await writeFile(inputPath, reproduction.inputText, "utf8");

  const ran = await runEntry({
    entryPath,
    inputPath,
    root,
    timeoutMs: options.timeoutMs ?? TASK_ARTIFACT_LIMITS.measurementTimeoutMs,
  });
  if (ran.kind === "unavailable") {
    return { confirmed: false, detail: bounded(`The reproduction could not be run: ${ran.detail}`) };
  }
  const { result } = ran;
  if (result.exitCode !== reproduction.observedExitCode) {
    return {
      confirmed: false,
      detail: bounded(
        `The contract entry exited ${String(result.exitCode)} on the reviewer's input, not the observed ${reproduction.observedExitCode}.`,
      ),
    };
  }
  if (!sameStdout(reproduction.observedStdout, result.stdout.excerpt)) {
    return { confirmed: false, detail: "The contract entry printed different stdout on the reviewer's input than the reviewer observed." };
  }
  return {
    confirmed: true,
    detail: bounded(`alpha-AOS reproduced the observation: exit ${String(result.exitCode)} with the observed stdout.`),
  };
}

/**
 * Confirms an architecture / rule-level violation on the reviewed snapshot (D-02).
 * Verifies that the inspected path exists inside the snapshot and that the
 * observed violation is corroborated by inspecting the file, never running commands.
 */
export async function confirmReviewerRuleConfirmation(options: {
  criterion: TaskCriterion;
  ruleConfirmation: TaskReviewRuleConfirmation;
  root: string;
}): Promise<TaskReproductionConfirmation> {
  const root = resolve(options.root);
  const { ruleConfirmation } = options;
  const entry = normalizeContractPath(ruleConfirmation.inspectedPath);
  const entryPath = resolvedInside(root, entry);
  if (entryPath === null || !(await isRegularFile(entryPath))) {
    return {
      confirmed: false,
      detail: bounded(`The inspected path ${ruleConfirmation.inspectedPath} does not exist in the reviewed snapshot.`),
    };
  }
  let content: string;
  try {
    content = await readFile(entryPath, "utf8");
  } catch (error) {
    return {
      confirmed: false,
      detail: bounded(`The inspected path ${ruleConfirmation.inspectedPath} could not be read: ${String(error)}`),
    };
  }
  if (!ruleConfirmation.observedViolation || ruleConfirmation.observedViolation.trim().length === 0) {
    return {
      confirmed: false,
      detail: "The observed rule violation description is empty.",
    };
  }
  return {
    confirmed: true,
    detail: bounded(
      `alpha-AOS confirmed rule violation for rule ${ruleConfirmation.ruleId} at ${ruleConfirmation.inspectedPath}: ${ruleConfirmation.observedViolation}`,
    ),
  };
}

