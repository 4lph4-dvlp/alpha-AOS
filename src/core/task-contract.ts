import { open, readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { HarnessId } from "../types.js";
import { reviewedDigest } from "./component-session.js";
import { packageRoot } from "./paths.js";
import { shellQuote } from "./project-plan.js";
import { applyFileTransaction } from "./transaction.js";
import { rejectRawCredentials, validateManagedDocument, type ValidationIssue } from "./validation.js";

/** The domain separator every task contract digest is bound under. */
export const TASK_CONTRACT_DIGEST_KIND = "task-contract";

/** A contract larger than this is refused before it is parsed. */
export const TASK_CONTRACT_MAX_BYTES = 256 * 1024;

export type TaskEffect = "workspace-write" | "local-commit" | "dependency-change";

export interface TaskCliJsonMeasurement {
  kind: "cli-json";
  entry: string;
  inputText: string;
  expect: {
    exitCode: number;
    stdoutJson?: unknown;
    stdoutEmpty?: true;
    stderrJson?: unknown;
  };
}

export interface TaskCriterion {
  id: string;
  title: string;
  description: string;
  mandatory: true;
  measurement: TaskCliJsonMeasurement;
}

export interface TaskScope {
  projectRoot: string;
  workflow: "gsd-quick";
  summary: string;
}

export interface TaskAgentPolicy {
  controller: HarnessId;
  executor: HarnessId;
  reviewer: HarnessId;
  reviewerSession: "fresh-read-only";
}

export interface TaskResourcePolicy {
  maxWallTimeMinutes?: number;
}

export interface TaskContract {
  schemaVersion: 1;
  id: string;
  revision: number;
  mode: "autopilot";
  category: "development";
  goal: string;
  scope: TaskScope;
  allowedRoots: string[];
  allowedEffects: TaskEffect[];
  criterion: TaskCriterion[];
  agentPolicy: TaskAgentPolicy;
  resourcePolicy: TaskResourcePolicy;
}

export interface DigestableTaskCriterion {
  id: string;
  title: string;
  description: string;
  mandatory: true;
  measurement: {
    kind: "cli-json";
    entry: string;
    inputText: string;
    expect: { exitCode: number; stdoutJson: unknown; stdoutEmpty: boolean; stderrJson: unknown };
  };
}

/** Everything a reviewer approves, in one fixed key order. */
export interface DigestableTaskContract {
  schemaVersion: 1;
  id: string;
  revision: number;
  mode: "autopilot";
  category: "development";
  goal: string;
  scope: TaskScope;
  allowedRoots: string[];
  allowedEffects: TaskEffect[];
  criterion: DigestableTaskCriterion[];
  agentPolicy: TaskAgentPolicy;
  resourcePolicy: { maxWallTimeMinutes: number | null };
}

export interface LoadedTaskContract {
  contract: TaskContract;
  digest: string;
  sourcePath: string;
}

export interface TaskApprovalRecord {
  schemaVersion: 1;
  kind: "task-approval";
  contractId: string;
  revision: number;
  contractDigest: string;
  approvedAt: string;
  canonicalProjectRoot: string;
  consent: { mode: "autopilot"; grant: "explicit-cli-approval"; scope: "single-run" };
  contract: DigestableTaskContract;
}

export type TaskContractErrorCode =
  | "contract-invalid"
  | "contract-drift"
  | "not-approved"
  | "revision-reused"
  | "root-changed"
  | "secret-in-contract"
  | "unsupported-controller";

export class TaskContractError extends Error {
  readonly code: TaskContractErrorCode;
  constructor(code: TaskContractErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TaskContractError";
    this.code = code;
  }
}

export interface TaskContractPreview {
  contract: DigestableTaskContract;
  digest: string;
  sourcePath: string;
  approvals: TaskApprovalRecord[];
  approved: boolean;
}

export type TaskApprovalResult =
  | { status: "approved"; recordPath: string; contractDigest: string; transactionId: string }
  | { status: "already-approved"; recordPath: string; contractDigest: string; transactionId: null };

export type TaskSchemaName = "task-contract" | "task-receipt" | "task-review";

const CONTRACT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

const schemaCache = new Map<string, Record<string, unknown>>();

/**
 * One of the closed task schemas, read once per package root. The repository
 * file is the single source of truth; the built-in envelope only routes.
 */
export async function taskSchema(name: TaskSchemaName, root: string = packageRoot()): Promise<Record<string, unknown>> {
  const path = join(root, "schemas", `${name}.schema.json`);
  const cached = schemaCache.get(path);
  if (cached !== undefined) return cached;
  const schema = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  schemaCache.set(path, schema);
  return schema;
}

/** Whether a value can name a task — and so a directory under the state root. */
export function isTaskContractId(value: string): boolean {
  return CONTRACT_ID.test(value);
}

/** Names a validation issue by code and document path only, never by value. */
export function describeIssue(issue: ValidationIssue | undefined, fallback: string): string {
  return issue === undefined ? fallback : `${issue.code} at ${issue.documentPath} (${issue.expected})`;
}

function invalid(message: string): TaskContractError {
  return new TaskContractError("contract-invalid", message);
}

async function readContractText(path: string): Promise<string> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    handle = await open(path, "r");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? "unreadable";
    throw invalid(`Task contract ${path} cannot be read (${code}).`);
  }
  try {
    const buffer = Buffer.alloc(TASK_CONTRACT_MAX_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
    }
    if (total > TASK_CONTRACT_MAX_BYTES) {
      throw invalid(`Task contract ${path} is larger than ${TASK_CONTRACT_MAX_BYTES} bytes.`);
    }
    if (total === 0) throw invalid(`Task contract ${path} is empty.`);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, total));
    } catch {
      throw invalid(`Task contract ${path} is not valid UTF-8.`);
    }
  } catch (error) {
    if (error instanceof TaskContractError) throw error;
    const code = (error as NodeJS.ErrnoException).code ?? "unreadable";
    throw invalid(`Task contract ${path} cannot be read (${code}).`);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

/**
 * Validates contract text against the closed schema and the invariants the
 * schema cannot state. Every refusal names a document path, never a value.
 */
async function parseTaskContract(text: string, label: string): Promise<TaskContract> {
  const validation = validateManagedDocument<TaskContract>({
    text,
    format: "json",
    kind: "task-contract",
    schema: await taskSchema("task-contract"),
    domain: rejectRawCredentials,
  });
  if (!validation.ok || validation.value === null) {
    throw invalid(`Task contract ${label} is invalid: ${describeIssue(validation.issues[0], validation.status)}.`);
  }
  // A contract is closed: an extension key would be shown to the approver
  // yet excluded from the digest, so it is refused rather than ignored.
  const extension = Object.keys(validation.extensions)[0];
  if (extension !== undefined) {
    throw invalid(`Task contract ${label} is invalid: schema.unknown-core-field at /${extension}.`);
  }
  const contract = validation.value;
  const seen = new Set<string>();
  for (const [index, criterion] of contract.criterion.entries()) {
    if (seen.has(criterion.id)) {
      throw invalid(`Task contract ${label} is invalid: duplicate criterion id at /criterion/${index}/id.`);
    }
    seen.add(criterion.id);
  }
  return contract;
}

/** Reads, bounds, decodes and validates one contract file, and digests it. */
export async function loadTaskContract(path: string): Promise<LoadedTaskContract> {
  const sourcePath = resolve(path);
  const text = await readContractText(sourcePath);
  const contract = await parseTaskContract(text, sourcePath);
  return { contract, digest: taskContractDigest(contract), sourcePath };
}

/** One spelling per allowed path, so equivalent contracts share one digest. */
export function normalizeContractPath(value: string): string {
  let normalized = value.replaceAll("\\", "/");
  while (normalized.startsWith("./")) normalized = normalized.slice(2);
  while (normalized.length > 1 && normalized.endsWith("/")) normalized = normalized.slice(0, -1);
  return normalized.normalize("NFC");
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return Array.from(new Set(values)).sort();
}

/**
 * The reviewable content of a contract, built as a literal with a fixed key
 * order because `reviewedDigest` hashes `JSON.stringify`, which is key-order
 * sensitive. Collections are sorted so authoring order never moves the digest.
 */
export function digestableTaskContract(contract: TaskContract): DigestableTaskContract {
  return {
    schemaVersion: contract.schemaVersion,
    id: contract.id,
    revision: contract.revision,
    mode: contract.mode,
    category: contract.category,
    goal: contract.goal,
    scope: {
      projectRoot: contract.scope.projectRoot,
      workflow: contract.scope.workflow,
      summary: contract.scope.summary,
    },
    allowedRoots: sortedUnique(contract.allowedRoots.map(normalizeContractPath)),
    allowedEffects: sortedUnique(contract.allowedEffects),
    criterion: [...contract.criterion]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        description: criterion.description,
        mandatory: criterion.mandatory,
        measurement: {
          kind: criterion.measurement.kind,
          entry: criterion.measurement.entry,
          inputText: criterion.measurement.inputText,
          expect: {
            exitCode: criterion.measurement.expect.exitCode,
            stdoutJson: criterion.measurement.expect.stdoutJson ?? null,
            stdoutEmpty: criterion.measurement.expect.stdoutEmpty ?? false,
            stderrJson: criterion.measurement.expect.stderrJson ?? null,
          },
        },
      })),
    agentPolicy: {
      controller: contract.agentPolicy.controller,
      executor: contract.agentPolicy.executor,
      reviewer: contract.agentPolicy.reviewer,
      reviewerSession: contract.agentPolicy.reviewerSession,
    },
    resourcePolicy: { maxWallTimeMinutes: contract.resourcePolicy.maxWallTimeMinutes ?? null },
  };
}

export function taskContractDigest(contract: TaskContract): string {
  return reviewedDigest(TASK_CONTRACT_DIGEST_KIND, digestableTaskContract(contract));
}

/**
 * The contract a stored digestable view stands for: the optional fields the
 * view spells as null or false are dropped again, so the snapshot can be
 * re-validated and re-digested exactly as a contract file would be.
 */
function contractFromView(view: unknown): unknown {
  const copy = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
  const criteria = Array.isArray(copy.criterion) ? copy.criterion : [];
  for (const criterion of criteria) {
    const measurement = (criterion as { measurement?: { expect?: Record<string, unknown> } } | null)?.measurement;
    const expect = measurement?.expect;
    if (typeof expect !== "object" || expect === null) continue;
    if (expect.stdoutJson === null) delete expect.stdoutJson;
    if (expect.stdoutEmpty === false) delete expect.stdoutEmpty;
    if (expect.stderrJson === null) delete expect.stderrJson;
  }
  const resources = copy.resourcePolicy as Record<string, unknown> | undefined;
  if (typeof resources === "object" && resources !== null && resources.maxWallTimeMinutes === null) {
    delete resources.maxWallTimeMinutes;
  }
  return copy;
}

export function taskApprovalPath(stateRoot: string, contractId: string, revision: number, digest: string): string {
  return join(stateRoot, "tasks", contractId, "approvals", `r${revision}-${digest}.json`);
}

function requireContractId(contractId: string): void {
  if (!isTaskContractId(contractId)) {
    throw invalid("The task contract id must be a lowercase letter or digit followed by up to 63 lowercase letters, digits or hyphens.");
  }
}

async function readApprovalRecord(path: string, contractId: string): Promise<TaskApprovalRecord> {
  const tampered = (detail: string) => new Error(`Task approval record ${path} is invalid or tampered: ${detail}.`);
  const validation = validateManagedDocument<TaskApprovalRecord>({
    text: await readFile(path, "utf8"),
    format: "json",
    kind: "task-receipt",
    schema: await taskSchema("task-receipt"),
    domain: rejectRawCredentials,
  });
  if (!validation.ok || validation.value === null) throw tampered(describeIssue(validation.issues[0], validation.status));
  const record = validation.value;
  if (record.kind !== "task-approval") throw tampered("the record is not a task approval");
  if (record.contractId !== contractId) throw tampered("the record names a different contract id");
  if (!path.endsWith(`r${record.revision}-${record.contractDigest}.json`)) {
    throw tampered("the file name does not match the approved revision and digest");
  }
  let snapshot: TaskContract;
  try {
    snapshot = await parseTaskContract(JSON.stringify(contractFromView(record.contract)), path);
  } catch {
    throw tampered("the approved contract snapshot is not a valid contract");
  }
  if (snapshot.id !== record.contractId || snapshot.revision !== record.revision) {
    throw tampered("the approved contract snapshot names a different id or revision");
  }
  if (taskContractDigest(snapshot) !== record.contractDigest) {
    throw tampered("the approved contract snapshot does not re-digest to the approved digest");
  }
  return record;
}

/** Every approval recorded for one contract id, strictly read and re-digested. */
export async function readTaskApprovals(options: { stateRoot: string; contractId: string }): Promise<TaskApprovalRecord[]> {
  requireContractId(options.contractId);
  const directory = join(options.stateRoot, "tasks", options.contractId, "approvals");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records: TaskApprovalRecord[] = [];
  for (const name of names.filter((entry) => entry.endsWith(".json")).sort()) {
    records.push(await readApprovalRecord(join(directory, name), options.contractId));
  }
  return records;
}

/** Read-only: loads, digests and reports approval state. Creates nothing. */
export async function previewTaskContract(options: { contractPath: string; stateRoot: string }): Promise<TaskContractPreview> {
  const loaded = await loadTaskContract(options.contractPath);
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: loaded.contract.id });
  return {
    contract: digestableTaskContract(loaded.contract),
    digest: loaded.digest,
    sourcePath: loaded.sourcePath,
    approvals,
    approved: approvals.some((approval) => approval.contractDigest === loaded.digest),
  };
}

/** The exact runnable line that approves one reviewed digest. */
export function taskApproveCommand(options: { contractPath: string; digest: string }): string {
  return `alpha-aos task approve ${shellQuote(options.contractPath)} --contract-digest ${options.digest} --apply`;
}

function driftError(loaded: LoadedTaskContract, expectedDigest: string): TaskContractError {
  const reviewed = SHA256.test(expectedDigest) ? `the reviewed digest was ${expectedDigest}` : "the supplied digest is malformed";
  return new TaskContractError(
    "contract-drift",
    `Task contract ${loaded.contract.id} r${loaded.contract.revision} does not match the reviewed digest: ${reviewed}, the current digest is ${loaded.digest}. Preview it again, then run: ${taskApproveCommand({ contractPath: loaded.sourcePath, digest: loaded.digest })}`,
  );
}

/**
 * Records explicit single-run consent for exactly one recomputed digest (D-01).
 * A digest that is not the one recomputed from the file right now is refused.
 */
export async function approveTaskContract(options: {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
  now?: () => Date;
}): Promise<TaskApprovalResult> {
  const loaded = await loadTaskContract(options.contractPath);
  if (loaded.digest !== options.expectedDigest) throw driftError(loaded, options.expectedDigest);

  const { contract, digest } = loaded;
  const recordPath = taskApprovalPath(options.stateRoot, contract.id, contract.revision, digest);
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: contract.id });
  if (approvals.some((approval) => approval.contractDigest === digest)) {
    return { status: "already-approved", recordPath, contractDigest: digest, transactionId: null };
  }

  const record: TaskApprovalRecord = {
    schemaVersion: 1,
    kind: "task-approval",
    contractId: contract.id,
    revision: contract.revision,
    contractDigest: digest,
    approvedAt: (options.now ?? (() => new Date()))().toISOString(),
    canonicalProjectRoot: resolve(contract.scope.projectRoot),
    consent: { mode: "autopilot", grant: "explicit-cli-approval", scope: "single-run" },
    contract: digestableTaskContract(contract),
  };
  const text = `${JSON.stringify(record, null, 2)}\n`;
  const validation = validateManagedDocument<TaskApprovalRecord>({
    text,
    format: "json",
    kind: "task-receipt",
    schema: await taskSchema("task-receipt"),
    domain: rejectRawCredentials,
  });
  if (!validation.ok) {
    throw new Error(`Task approval record failed schema validation: ${describeIssue(validation.issues[0], validation.status)}.`);
  }
  const journal = await applyFileTransaction({
    stateRoot: options.stateRoot,
    allowedRoots: [join(options.stateRoot, "tasks")],
    operations: [{ target: recordPath, content: Buffer.from(text, "utf8") }],
  });
  return { status: "approved", recordPath, contractDigest: digest, transactionId: journal.id };
}

/**
 * The start gate (D-02): the file must still digest to the value the caller
 * names, and that exact digest must carry an approval record.
 */
export async function assertTaskStartable(options: {
  contractPath: string;
  expectedDigest: string;
  stateRoot: string;
}): Promise<{ loaded: LoadedTaskContract; approval: TaskApprovalRecord }> {
  const loaded = await loadTaskContract(options.contractPath);
  if (loaded.digest !== options.expectedDigest) throw driftError(loaded, options.expectedDigest);
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: loaded.contract.id });
  const approval = approvals.find((candidate) => candidate.contractDigest === loaded.digest);
  if (approval === undefined) {
    throw new TaskContractError(
      "not-approved",
      `Task contract ${loaded.contract.id} r${loaded.contract.revision} digest ${loaded.digest} has no approval. Preview it, then run: ${taskApproveCommand({ contractPath: loaded.sourcePath, digest: loaded.digest })}`,
    );
  }
  return { loaded, approval };
}
