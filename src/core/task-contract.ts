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
 * One spelling per JSON value: object keys sorted by code-unit order at every
 * depth, arrays kept in order because their order is meaning. `fromEntries`
 * defines own properties, so a `__proto__` key stays data and never a prototype.
 */
export function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, canonicalJsonValue(record[key])]),
    );
  }
  return value;
}

/**
 * The reviewable content of a contract, built as a literal with a fixed key
 * order because `reviewedDigest` hashes `JSON.stringify`, which is key-order
 * sensitive. Collections are sorted, text is NFC and paths have one spelling,
 * so authoring form never moves the digest. `inputText` is program input and
 * is never normalized: a byte change there is a real contract change.
 */
export function digestableTaskContract(contract: TaskContract): DigestableTaskContract {
  return {
    schemaVersion: contract.schemaVersion,
    id: contract.id,
    revision: contract.revision,
    mode: contract.mode,
    category: contract.category,
    goal: contract.goal.normalize("NFC"),
    scope: {
      projectRoot: resolve(contract.scope.projectRoot).normalize("NFC"),
      workflow: contract.scope.workflow,
      summary: contract.scope.summary.normalize("NFC"),
    },
    allowedRoots: sortedUnique(contract.allowedRoots.map(normalizeContractPath)),
    allowedEffects: sortedUnique(contract.allowedEffects),
    criterion: [...contract.criterion]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((criterion) => ({
        id: criterion.id,
        title: criterion.title.normalize("NFC"),
        description: criterion.description.normalize("NFC"),
        mandatory: criterion.mandatory,
        measurement: {
          kind: criterion.measurement.kind,
          entry: normalizeContractPath(criterion.measurement.entry),
          inputText: criterion.measurement.inputText,
          expect: {
            exitCode: criterion.measurement.expect.exitCode,
            stdoutJson: canonicalJsonValue(criterion.measurement.expect.stdoutJson ?? null),
            stdoutEmpty: criterion.measurement.expect.stdoutEmpty ?? false,
            stderrJson: canonicalJsonValue(criterion.measurement.expect.stderrJson ?? null),
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
 * The names of every reviewable field that differs between two digestable
 * views, sorted. The vocabulary is closed: a new contract field must be added
 * here in the same change that adds it to the schema. Each criterion is named
 * `criterion[<id>]` when it was added, removed or changed.
 */
export function changedContractFields(before: DigestableTaskContract, after: DigestableTaskContract): string[] {
  const changed: string[] = [];
  const compare = (name: string, left: unknown, right: unknown) => {
    if (JSON.stringify(left) !== JSON.stringify(right)) changed.push(name);
  };
  compare("id", before.id, after.id);
  compare("revision", before.revision, after.revision);
  compare("mode", before.mode, after.mode);
  compare("category", before.category, after.category);
  compare("goal", before.goal, after.goal);
  compare("scope.projectRoot", before.scope.projectRoot, after.scope.projectRoot);
  compare("scope.workflow", before.scope.workflow, after.scope.workflow);
  compare("scope.summary", before.scope.summary, after.scope.summary);
  compare("allowedRoots", before.allowedRoots, after.allowedRoots);
  compare("allowedEffects", before.allowedEffects, after.allowedEffects);
  compare("agentPolicy.controller", before.agentPolicy.controller, after.agentPolicy.controller);
  compare("agentPolicy.executor", before.agentPolicy.executor, after.agentPolicy.executor);
  compare("agentPolicy.reviewer", before.agentPolicy.reviewer, after.agentPolicy.reviewer);
  compare("agentPolicy.reviewerSession", before.agentPolicy.reviewerSession, after.agentPolicy.reviewerSession);
  compare("resourcePolicy.maxWallTimeMinutes", before.resourcePolicy.maxWallTimeMinutes, after.resourcePolicy.maxWallTimeMinutes);
  const criteria = (view: DigestableTaskContract) =>
    new Map(view.criterion.map((criterion) => [criterion.id, JSON.stringify(canonicalJsonValue(criterion))]));
  const left = criteria(before);
  const right = criteria(after);
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    if (left.get(id) !== right.get(id)) changed.push(`criterion[${id}]`);
  }
  return changed.sort();
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

/** The exact runnable line that shows a contract and its current digest. */
export function taskPreviewCommand(options: { contractPath: string }): string {
  return `alpha-aos task preview ${shellQuote(options.contractPath)}`;
}

/** The lowest revision number that no approval for this id has used yet. */
function nextRevision(approvals: readonly TaskApprovalRecord[], current: number): number {
  return Math.max(current, ...approvals.map((approval) => approval.revision)) + 1;
}

function describeChangedFields(fields: readonly string[]): string {
  return fields.length === 0 ? "no named field (the recorded view no longer re-digests alike)" : fields.join(", ");
}

/**
 * Why a supplied digest is not the current one (D-04): when that digest was
 * approved, the fields that changed since, the new digest, the preview and
 * approve commands and — when the revision was not raised — the revision the
 * changed contract needs. Otherwise, that the digest is unknown here.
 */
async function driftError(loaded: LoadedTaskContract, expectedDigest: string, stateRoot: string): Promise<TaskContractError> {
  const { contract, digest, sourcePath } = loaded;
  const preview = taskPreviewCommand({ contractPath: sourcePath });
  const approve = taskApproveCommand({ contractPath: sourcePath, digest });
  if (!SHA256.test(expectedDigest)) {
    return new TaskContractError(
      "contract-drift",
      `task ${contract.id}: the supplied digest is malformed. Current digest ${digest}. Preview it: ${preview} Then approve exactly the current digest: ${approve}`,
    );
  }
  const approvals = await readTaskApprovals({ stateRoot, contractId: contract.id });
  const prior = approvals.find((approval) => approval.contractDigest === expectedDigest);
  if (prior === undefined) {
    return new TaskContractError(
      "contract-drift",
      `task ${contract.id}: digest ${expectedDigest.slice(0, 12)} was never approved in this state root. Current digest ${digest}. Preview it: ${preview} Then approve exactly the current digest: ${approve}`,
    );
  }
  const changed = changedContractFields(prior.contract, digestableTaskContract(contract));
  const lines = [
    `task ${contract.id}: the approved contract (digest ${expectedDigest.slice(0, 12)}) changed: ${describeChangedFields(changed)}. Current digest ${digest}.`,
    `Preview it: ${preview}`,
    `Approve the changed contract: ${approve}`,
  ];
  if (contract.revision === prior.revision) {
    lines.push(`Increase revision to ${nextRevision(approvals, contract.revision)} before approving the changed contract.`);
  }
  return new TaskContractError("contract-drift", lines.join(" "));
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
  if (loaded.digest !== options.expectedDigest) throw await driftError(loaded, options.expectedDigest, options.stateRoot);

  const { contract, digest } = loaded;
  const recordPath = taskApprovalPath(options.stateRoot, contract.id, contract.revision, digest);
  const approvals = await readTaskApprovals({ stateRoot: options.stateRoot, contractId: contract.id });
  if (approvals.some((approval) => approval.contractDigest === digest)) {
    return { status: "already-approved", recordPath, contractDigest: digest, transactionId: null };
  }
  // CON-03: one revision number names one approved content. Changed content
  // under an approved number would make "revision 1" mean two contracts.
  const reused = approvals.find((approval) => approval.revision === contract.revision);
  if (reused !== undefined) {
    const changed = changedContractFields(reused.contract, digestableTaskContract(contract));
    throw new TaskContractError(
      "revision-reused",
      `task ${contract.id}: revision ${contract.revision} is already approved as digest ${reused.contractDigest.slice(0, 12)}, and this content differs: ${describeChangedFields(changed)}. A changed contract is a new revision: set revision ${nextRevision(approvals, contract.revision)}, then preview it: ${taskPreviewCommand({ contractPath: loaded.sourcePath })}`,
    );
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
  if (loaded.digest !== options.expectedDigest) throw await driftError(loaded, options.expectedDigest, options.stateRoot);
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
