import { createHash } from "node:crypto";
import { lstat, mkdir, open, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertNoSymlinksInPathAndAncestors, STRUCTURAL_CREDENTIAL_PATTERNS } from "./command-jobs.js";

export interface TaskSessionBinding {
  schemaVersion: 1;
  contractId: string;
  contractDigest: string;
  revision: number;
  runId: string;
  host: "claude" | "codex" | "antigravity" | "pi" | "hermes";
  originatingSessionId: string;
}
export interface TaskSessionEventInput {
  sourceEventId: string;
  observedAt: string;
  kind: string;
  workflow: string | null;
  step: string | null;
  role: string | null;
  configuredModel: string | null;
  configuredEffort: string | null;
  observedModel: string | null;
  observedEffort: string | null;
  outcome: string | null;
  processState: "confirmed-closed" | "unconfirmed" | "unknown" | null;
  recordedReason: string | null;
  evidenceRefs: readonly string[];
}
export interface TaskSessionEvent extends TaskSessionEventInput { binding: TaskSessionBinding; sequence: number; }
const bindingKeys = ["schemaVersion", "contractId", "contractDigest", "revision", "runId", "host", "originatingSessionId"];
const eventKeys = ["sourceEventId", "observedAt", "kind", "workflow", "step", "role", "configuredModel", "configuredEffort", "observedModel", "observedEffort", "outcome", "processState", "recordedReason", "evidenceRefs"];
const id = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
function closed(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
export function validateTaskSessionBinding(value: unknown): TaskSessionBinding {
  if (!closed(value, bindingKeys) || value.schemaVersion !== 1 || typeof value.contractId !== "string" || !id.test(value.contractId) ||
    typeof value.contractDigest !== "string" || !/^[a-f0-9]{64}$/u.test(value.contractDigest) ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 || typeof value.runId !== "string" || !id.test(value.runId) ||
    typeof value.originatingSessionId !== "string" || !id.test(value.originatingSessionId) ||
    typeof value.host !== "string" || !["claude", "codex", "antigravity", "agy", "pi", "hermes"].includes(value.host)) throw new Error("Invalid task session binding");
  return { schemaVersion: 1, contractId: value.contractId, contractDigest: value.contractDigest, revision: value.revision as number,
    runId: value.runId, host: (value.host === "agy" ? "antigravity" : value.host) as TaskSessionBinding["host"], originatingSessionId: value.originatingSessionId };
}
function canonical(binding: TaskSessionBinding): string { return JSON.stringify(validateTaskSessionBinding(binding)); }
export function taskSessionRoot(stateRoot: string, binding: TaskSessionBinding): string {
  const tuple = validateTaskSessionBinding(binding);
  return join(stateRoot, "runs", tuple.contractDigest, "sessions", createHash("sha256").update(tuple.runId).digest("hex"));
}
function eventInput(value: TaskSessionEventInput): TaskSessionEventInput {
  if (!closed(value, eventKeys) || typeof value.sourceEventId !== "string" || !id.test(value.sourceEventId) ||
    typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt)) ||
    typeof value.kind !== "string" || !id.test(value.kind) || !Array.isArray(value.evidenceRefs) || value.evidenceRefs.length > 16 ||
    value.evidenceRefs.some((ref) => typeof ref !== "string" || !id.test(ref))) throw new Error("Invalid task session event");
  for (const key of ["workflow", "step", "role", "configuredModel", "configuredEffort", "observedModel", "observedEffort", "outcome", "recordedReason"] as const) {
    const field = value[key];
    if (field !== null && (typeof field !== "string" || field.length > (key === "recordedReason" ? 512 : 128) || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(field))) throw new Error("Invalid task session event field");
  }
  if (value.processState !== null && !["confirmed-closed", "unconfirmed", "unknown"].includes(value.processState as string)) throw new Error("Invalid task session process state");
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 8192) throw new Error("Task session event too large");
  if (STRUCTURAL_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text)) ||
    /(?:[a-zA-Z]:[\\/]|\\\\|(?:^|[\s"])\/(?!\/)[^\s"]|\b(?:password|passwd|token|api[_-]?key|secret|authorization)\s*[=:]\s*\S+|:\/\/)/iu.test(text)) throw new Error("Sensitive task session event refused");
  return { sourceEventId: value.sourceEventId as string, observedAt: value.observedAt as string, kind: value.kind as string,
    workflow: value.workflow as string | null, step: value.step as string | null, role: value.role as string | null,
    configuredModel: value.configuredModel as string | null, configuredEffort: value.configuredEffort as string | null,
    observedModel: value.observedModel as string | null, observedEffort: value.observedEffort as string | null,
    outcome: value.outcome as string | null, processState: value.processState as TaskSessionEventInput["processState"], recordedReason: value.recordedReason as string | null,
    evidenceRefs: value.evidenceRefs as string[] };
}
const maxReplayBytes = 256 * 1024;
type Db = import("node:sqlite").DatabaseSync;
// Observed identity checks are not an OS sandbox against same-user renames.
async function identities(root: string, dbPath: string): Promise<string[]> {
  const result: string[] = [];
  const ancestors: string[] = [];
  for (let path = dirname(resolve(root)); ; path = dirname(path)) {
    ancestors.push(path);
    if (dirname(path) === path) break;
  }
  for (const path of [root, dbPath, dbPath + "-journal", dbPath + "-wal", dbPath + "-shm", ...ancestors]) {
    await assertNoSymlinksInPathAndAncestors(path);
    try {
      const stat = await lstat(path);
      if (path === root || ancestors.includes(path) ? !stat.isDirectory() : !stat.isFile()) throw new Error("Unsafe task session path");
      if (!ancestors.includes(path) && process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("Task session path is not private");
      result.push(`${stat.dev}:${stat.ino}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      result.push("");
    }
  }
  return result;
}
function checkIdentity(before: string[], after: string[]): void {
  if (before[0] !== after[0] || before[1] !== after[1]) throw new Error("Task session path identity changed");
  for (let i = 2; i < before.length; i++) if ((i >= 5 && before[i] !== after[i]) || (i < 5 && before[i] && after[i] && before[i] !== after[i])) throw new Error("Task session path identity changed");
}
async function withStore<T>(stateRoot: string, binding: TaskSessionBinding, create: boolean, action: (db: Db) => T): Promise<T> {
  const root = taskSessionRoot(stateRoot, binding), path = join(root, "events.sqlite");
  let created = false;
  await assertNoSymlinksInPathAndAncestors(root);
  if (create) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const handle = await open(path, "wx", 0o600).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") return null;
      throw error;
    });
    if (handle) { created = true; await handle.close(); }
  }
  const names = await readdir(root);
  if (names.some((name) => !["events.sqlite", "events.sqlite-journal", "events.sqlite-wal", "events.sqlite-shm", "steering"].includes(name))) throw new Error("Unsupported legacy task session store");
  if (names.includes("steering")) {
    const child = join(root, "steering");
    await assertNoSymlinksInPathAndAncestors(child);
    const stat = await lstat(child);
    if (!stat.isDirectory() || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new Error("Unsafe task steering directory");
  }
  const before = await identities(root, path);
  if (!before[0] || !before[1]) throw new Error("Task session store does not exist");
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch { throw new Error("Task session observer requires Node SQLite support"); }
  let db: Db | undefined;
  try {
    db = new DatabaseSync(path, { allowExtension: false, timeout: 500 });
    checkIdentity(before, await identities(root, path));
    db.exec("PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=500");
    db.exec("BEGIN IMMEDIATE");
    try {
      const schema = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
      if (schema.length === 0 && created) {
        db.exec("CREATE TABLE binding (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL); CREATE TABLE events (sequence INTEGER PRIMARY KEY, source TEXT NOT NULL UNIQUE, input TEXT NOT NULL)");
        db.prepare("INSERT INTO binding(id,value) VALUES(1,?)").run(canonical(binding));
      } else if (schema.length !== 2 || schema[0]?.name !== "binding" || schema[1]?.name !== "events") throw new Error("Unsupported or corrupt task session schema");
      const stored = db.prepare("SELECT value FROM binding WHERE id=1").get();
      if (!stored || stored.value !== canonical(binding)) throw new Error("Task run session binding mismatch");
      const result = action(db);
      db.exec("COMMIT");
      checkIdentity(before, await identities(root, path));
      return result;
    } catch (error) {
      try { db.exec("ROLLBACK"); } catch { /* transaction already closed */ }
      throw error;
    }
  } finally { db?.close(); }
}
export async function createTaskSession(stateRoot: string, binding: TaskSessionBinding): Promise<void> {
  await withStore(stateRoot, binding, true, () => undefined);
}
export async function appendTaskSessionEvent(stateRoot: string, binding: TaskSessionBinding, event: TaskSessionEventInput): Promise<TaskSessionEvent> {
  const input = eventInput(event), encoded = JSON.stringify(input);
  return withStore(stateRoot, binding, false, (db) => {
    const prior = db.prepare("SELECT sequence,input FROM events WHERE source=?").get(input.sourceEventId);
    if (prior) {
      if (prior.input !== encoded) throw new Error("Conflicting task session source event");
      return { ...input, binding: validateTaskSessionBinding(binding), sequence: Number(prior.sequence) };
    }
    const sequence = Number(db.prepare("SELECT COALESCE(MAX(sequence),0)+1 AS next FROM events").get()?.next);
    if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid task session sequence");
    db.prepare("INSERT INTO events(sequence,source,input) VALUES(?,?,?)").run(sequence, input.sourceEventId, encoded);
    return { ...input, binding: validateTaskSessionBinding(binding), sequence };
  });
}
export async function hasTaskSessionSourceEvent(stateRoot: string, binding: TaskSessionBinding, sourceEventId: string): Promise<boolean> {
  if (!id.test(sourceEventId)) throw new Error("Invalid task session source event");
  return withStore(stateRoot, binding, false, (db) => !!db.prepare("SELECT 1 FROM events WHERE source=?").get(sourceEventId));
}
export async function readTaskSessionEvents(stateRoot: string, binding: TaskSessionBinding, cursor = 0): Promise<{ binding: TaskSessionBinding; events: TaskSessionEvent[]; cursor: number; gap: boolean }> {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid task session cursor");
  return withStore(stateRoot, binding, false, (db) => {
    const last = Number(db.prepare("SELECT COALESCE(MAX(sequence),0) AS last FROM events").get()?.last);
    if (cursor > last) throw new Error("Invalid task session cursor");
    const rows = db.prepare("SELECT sequence,input FROM events WHERE sequence>? ORDER BY sequence DESC LIMIT 250").all(cursor);
    const events: TaskSessionEvent[] = [];
    let bytes = 0;
    for (const row of rows) {
      const input = eventInput(JSON.parse(String(row.input)) as TaskSessionEventInput);
      const item = { ...input, binding: validateTaskSessionBinding(binding), sequence: Number(row.sequence) };
      bytes += Buffer.byteLength(JSON.stringify(item));
      if (bytes > maxReplayBytes) break;
      events.unshift(item);
    }
    const historicalGap = cursor === 0 && !!db.prepare("SELECT 1 FROM events WHERE source=?").get(`history-gap:${createHash("sha256").update(binding.runId).digest("hex")}`);
    return { binding: validateTaskSessionBinding(binding), events, cursor: last, gap: historicalGap || cursor < (events[0]?.sequence ?? last + 1) - 1 };
  });
}
export async function readTaskSessionBindingForRun(stateRoot: string, identity: { contractDigest: string; runId: string; contractId: string; revision: number }): Promise<TaskSessionBinding | null> {
  if (!/^[a-f0-9]{64}$/u.test(identity.contractDigest) || !id.test(identity.runId)) throw new Error("Invalid task session run identity");
  const root = join(stateRoot, "runs", identity.contractDigest, "sessions", createHash("sha256").update(identity.runId).digest("hex"));
  const path = join(root, "events.sqlite");
  await assertNoSymlinksInPathAndAncestors(path);
  try { await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  const before = await identities(root, path);
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch { throw new Error("Task session observer requires Node SQLite support"); }
  const db = new DatabaseSync(path, { allowExtension: false, timeout: 500 });
  let binding: TaskSessionBinding;
  try {
    checkIdentity(before, await identities(root, path));
    const row = db.prepare("SELECT value FROM binding WHERE id=1").get();
    binding = validateTaskSessionBinding(JSON.parse(String(row?.value)));
    checkIdentity(before, await identities(root, path));
  } finally { db.close(); }
  if (binding.contractDigest !== identity.contractDigest || binding.runId !== identity.runId || binding.contractId !== identity.contractId || binding.revision !== identity.revision) throw new Error("Task run session binding mismatch");
  await withStore(stateRoot, binding, false, () => undefined);
  return binding;
}
export async function publishTaskSessionEvent(stateRoot: string, identity: { contractDigest: string; runId: string; contractId: string; revision: number }, event: TaskSessionEventInput): Promise<void> {
  const binding = await readTaskSessionBindingForRun(stateRoot, identity);
  if (!binding) return;
  await appendTaskSessionEvent(stateRoot, binding, event);
}
export async function publishTaskSessionDispatch(stateRoot: string, record: import("./task-runtime.js").TaskDispatchObservation, contract: import("./task-contract.js").TaskContract): Promise<void> {
  const { projectTaskProgress } = await import("./task-progress.js");
  await publishTaskSessionEvent(stateRoot, { contractDigest: record.contractDigest, runId: record.runId, contractId: contract.id, revision: contract.revision }, projectTaskProgress(record, contract.scope.workflow));
}









