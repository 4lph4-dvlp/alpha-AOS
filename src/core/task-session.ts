import { createHash, randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { mkdir, open, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { assertNoSymlinksInPathAndAncestors, readBoundedFile, writeAtomicPrivateFile, STRUCTURAL_CREDENTIAL_PATTERNS } from "./command-jobs.js";

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
const maxStore = 2 * 1024 * 1024;
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
  return join(stateRoot, "runs", tuple.contractDigest, "sessions", createHash("sha256").update(canonical(tuple)).digest("hex"));
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
interface Store { binding: TaskSessionBinding; lastSequence: number; events: TaskSessionEvent[]; }
const maxReplayBytes = 256 * 1024;
const maxEventBytes = 16 * 1024;
function checkedEvent(item: TaskSessionEvent, binding: TaskSessionBinding): TaskSessionEvent {
  if (!item || typeof item !== "object") throw new Error("Invalid task session event");
  const { binding: eventBinding, sequence, ...input } = item;
  if (canonical(eventBinding) !== canonical(binding) || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Invalid task session sequence");
  return { ...eventInput(input), binding: validateTaskSessionBinding(eventBinding), sequence };
}
async function readStore(stateRoot: string, binding: TaskSessionBinding): Promise<Store> {
  const root = taskSessionRoot(stateRoot, binding);
  const value = JSON.parse(await readBoundedFile(join(root, "events.json"), stateRoot, maxReplayBytes, undefined, true)) as Store;
  if (!closed(value, ["binding", "lastSequence", "events"]) || canonical(value.binding) !== canonical(binding) ||
    !Number.isSafeInteger(value.lastSequence) || value.lastSequence < 0 || !Array.isArray(value.events) || value.events.length > 250 ||
    value.events.length > value.lastSequence || (value.lastSequence > 0 && value.events.length === 0)) throw new Error("Invalid task session store");
  const ids = new Set<string>();
  value.events.forEach((item, index) => {
    const checked = checkedEvent(item, binding);
    if (checked.sequence !== value.lastSequence - value.events.length + index + 1 || ids.has(checked.sourceEventId)) throw new Error("Invalid task session sequence");
    ids.add(checked.sourceEventId);
  });
  return value;
}
function addReplay(store: Store, event: TaskSessionEvent): void {
  if (event.sequence !== store.lastSequence + 1) throw new Error("Invalid task session sequence");
  store.events.push(event); store.lastSequence = event.sequence;
  while (store.events.length > 250 || Buffer.byteLength(JSON.stringify(store)) > maxReplayBytes) {
    if (store.events.length <= 1) throw new Error("Task session event too large");
    store.events.shift();
  }
}
async function readPending(stateRoot: string, binding: TaskSessionBinding): Promise<TaskSessionEvent | null> {
  try { return checkedEvent(JSON.parse(await readBoundedFile(join(taskSessionRoot(stateRoot, binding), "pending.json"), stateRoot, maxEventBytes, undefined, true)) as TaskSessionEvent, binding); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
function sourcePath(root: string, sourceEventId: string): string {
  return join(root, "sources", `${createHash("sha256").update(sourceEventId).digest("hex")}.json`);
}
async function ensureSource(stateRoot: string, binding: TaskSessionBinding, event: TaskSessionEvent): Promise<void> {
  const root = taskSessionRoot(stateRoot, binding), directory = join(root, "sources"), path = sourcePath(root, event.sourceEventId);
  await assertNoSymlinksInPathAndAncestors(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const existing = checkedEvent(JSON.parse(await readBoundedFile(path, stateRoot, maxEventBytes, undefined, true)) as TaskSessionEvent, binding);
    if (JSON.stringify(existing) !== JSON.stringify(event)) throw new Error("Conflicting task session source event");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeAtomicPrivateFile(path, JSON.stringify(event), maxEventBytes, stateRoot, { exclusive: true });
  }
}
async function recoverPending(stateRoot: string, binding: TaskSessionBinding, store: Store): Promise<void> {
  const pending = await readPending(stateRoot, binding);
  if (!pending) return;
  await ensureSource(stateRoot, binding, pending);
  if (pending.sequence === store.lastSequence + 1) {
    addReplay(store, pending);
    await writeAtomicPrivateFile(join(taskSessionRoot(stateRoot, binding), "events.json"), JSON.stringify(store), maxReplayBytes, stateRoot);
  } else if (pending.sequence !== store.lastSequence || JSON.stringify(store.events.at(-1)) !== JSON.stringify(pending)) {
    throw new Error("Invalid pending task session event");
  }
  await unlink(join(taskSessionRoot(stateRoot, binding), "pending.json"));
}
async function ensureRunBinding(stateRoot: string, binding: TaskSessionBinding): Promise<void> {
  const tuple = validateTaskSessionBinding(binding);
  const directory = join(stateRoot, "runs", tuple.contractDigest, "session-bindings");
  await assertNoSymlinksInPathAndAncestors(directory);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, `${createHash("sha256").update(tuple.runId).digest("hex")}.json`);
  const expected = canonical(tuple);
  const handle = await open(path, "wx", 0o600).catch((error: NodeJS.ErrnoException) => { if (error.code === "EEXIST") return null; throw error; });
  if (handle) { try { await handle.writeFile(expected); await handle.sync(); } finally { await handle.close(); } }
  const stored = await readBoundedFile(path, stateRoot, 4096, undefined, true);
  if (canonical(JSON.parse(stored) as TaskSessionBinding) !== expected) throw new Error("Task run session binding mismatch");
}
export async function createTaskSession(stateRoot: string, binding: TaskSessionBinding): Promise<void> {
  await ensureRunBinding(stateRoot, binding);
  const root = taskSessionRoot(stateRoot, binding);
  await assertNoSymlinksInPathAndAncestors(root);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const path = join(root, "events.json");
  try { await readStore(stateRoot, binding); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const handle = await open(path, "wx", 0o600).catch((e: NodeJS.ErrnoException) => { if (e.code === "EEXIST") return null; throw e; });
    if (handle) { try { await handle.writeFile(JSON.stringify({ binding: validateTaskSessionBinding(binding), lastSequence: 0, events: [] })); await handle.sync(); } finally { await handle.close(); } }
    else await readStore(stateRoot, binding);
  }
}
export async function appendTaskSessionEvent(stateRoot: string, binding: TaskSessionBinding, event: TaskSessionEventInput): Promise<TaskSessionEvent> {
  const root = taskSessionRoot(stateRoot, binding);
  await assertNoSymlinksInPathAndAncestors(root);
  const input = eventInput(event);
  const fencePath = join(root, "events.lock");
  let fence: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { fence = await open(fencePath, "wx", 0o600); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await new Promise((resolve) => setTimeout(resolve, 10)); }
  }
  if (!fence) throw new Error("Task session publication fence unavailable");
  const fenceText = JSON.stringify({ host: hostname(), pid: process.pid, token: randomUUID() });
  try {
    await fence.writeFile(fenceText); await fence.sync();
    const store = await readStore(stateRoot, binding);
    await recoverPending(stateRoot, binding, store);
    const path = sourcePath(root, input.sourceEventId);
    try {
      const prior = checkedEvent(JSON.parse(await readBoundedFile(path, stateRoot, maxEventBytes, undefined, true)) as TaskSessionEvent, binding);
      const { binding: _binding, sequence: _sequence, ...priorInput } = prior;
      if (JSON.stringify(eventInput(priorInput)) !== JSON.stringify(input)) throw new Error("Conflicting task session source event");
      return prior;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const result: TaskSessionEvent = { ...input, binding: validateTaskSessionBinding(binding), sequence: store.lastSequence + 1 };
    await writeAtomicPrivateFile(join(root, "pending.json"), JSON.stringify(result), maxEventBytes, stateRoot, { exclusive: true });
    await recoverPending(stateRoot, binding, store);
    return result;
  } finally {
    await fence.close();
    if (await readBoundedFile(fencePath, stateRoot, 4096, undefined, true) !== fenceText) throw new Error("Task session publication fence changed");
    await unlink(fencePath);
  }
}
export async function readTaskSessionEvents(stateRoot: string, binding: TaskSessionBinding, cursor = 0): Promise<{ binding: TaskSessionBinding; events: TaskSessionEvent[]; cursor: number; gap: boolean }> {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid task session cursor");
  const store = await readStore(stateRoot, binding);
  const pending = await readPending(stateRoot, binding);
  if (pending?.sequence === store.lastSequence + 1) addReplay(store, pending);
  else if (pending && (pending.sequence !== store.lastSequence || JSON.stringify(store.events.at(-1)) !== JSON.stringify(pending))) throw new Error("Invalid pending task session event");
  if (cursor > store.lastSequence) throw new Error("Invalid task session cursor");
  const earliest = (store.events[0]?.sequence ?? 1) - 1;
  return { binding: store.binding, events: store.events.filter((event) => event.sequence > cursor), cursor: store.lastSequence, gap: cursor < earliest };
}
export async function publishTaskSessionDispatch(stateRoot: string, record: import("./task-runtime.js").TaskDispatchObservation, contract: { id: string; revision: number }): Promise<void> {
  const base = join(stateRoot, "runs", record.contractDigest, "sessions");
  await assertNoSymlinksInPathAndAncestors(base);
  let names: string[];
  try { names = await readdir(base); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  if (names.length > 128) throw new Error("Task session observer limit exceeded");
  for (const name of names) {
    if (!/^[a-f0-9]{64}$/u.test(name)) continue;
    const path = join(base, name, "events.json");
    const store = JSON.parse(await readBoundedFile(path, stateRoot, maxStore, undefined, true)) as Store;
    const binding = validateTaskSessionBinding(store.binding);
    if (taskSessionRoot(stateRoot, binding) !== join(base, name)) throw new Error("Invalid task session location");
    if (binding.contractDigest !== record.contractDigest || binding.runId !== record.runId || binding.contractId !== contract.id || binding.revision !== contract.revision) continue;
    await appendTaskSessionEvent(stateRoot, binding, { sourceEventId: `${record.dispatchId}:${record.finishedAt === null ? "start" : "end"}`,
      observedAt: record.finishedAt ?? record.startedAt, kind: record.finishedAt === null ? "dispatch-start" : "dispatch-end",
      workflow: null, step: null, role: record.role, configuredModel: record.model, configuredEffort: record.effort ?? null,
      observedModel: null, observedEffort: null, outcome: record.status, processState: record.closeConfirmed === true ? "confirmed-closed" : record.closeConfirmed === false ? "unconfirmed" : "unknown", recordedReason: record.reason,
      evidenceRefs: [record.dispatchId] });
  }
}









