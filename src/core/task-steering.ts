import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertNoSymlinksInPathAndAncestors, readBoundedFile, writeAtomicPrivateFile, STRUCTURAL_CREDENTIAL_PATTERNS } from "./command-jobs.js";
import { appendTaskSessionEvent, readTaskSessionEvents, taskSessionRoot, validateTaskSessionBinding, type TaskSessionBinding } from "./task-session.js";

export interface TaskSteeringProposal {
  schemaVersion: 1;
  binding: TaskSessionBinding;
  requestId: string;
  submittedAt: string;
  text: string;
  evidenceIds?: string[];
}
type Receipt = { state: "received"; digest: string; requestId: string; binding: TaskSessionBinding; submittedAt: string; actor: "user"; sequence: number | null };
const id = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function normalize(value: TaskSteeringProposal): TaskSteeringProposal {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((k) => !["schemaVersion", "binding", "requestId", "submittedAt", "text", "evidenceIds"].includes(k)) ||
    value.schemaVersion !== 1 || typeof value.requestId !== "string" || !id.test(value.requestId) ||
    typeof value.submittedAt !== "string" || !Number.isFinite(Date.parse(value.submittedAt)) || value.submittedAt.length > 64 ||
    typeof value.text !== "string" || !value.text.trim() || Buffer.byteLength(value.text) > 8192 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value.text) ||
    STRUCTURAL_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(value.text)) || /\b(?:password|passwd|token|api[_-]?key|secret|authorization)\s*[=:]\s*\S+/iu.test(value.text) ||
    (value.evidenceIds !== undefined && (!Array.isArray(value.evidenceIds) || value.evidenceIds.length > 20 || value.evidenceIds.some((entry) => typeof entry !== "string" || !id.test(entry))))) throw new Error("Invalid task steering proposal");
  const binding = validateTaskSessionBinding(value.binding);
  const proposal = { schemaVersion: 1 as const, binding, requestId: value.requestId, submittedAt: value.submittedAt, text: value.text,
    ...(value.evidenceIds === undefined ? {} : { evidenceIds: [...value.evidenceIds] }) };
  if (Buffer.byteLength(JSON.stringify(proposal)) > 16 * 1024) throw new Error("Task steering proposal too large");
  return proposal;
}
async function validateRun(stateRoot: string, binding: TaskSessionBinding): Promise<void> {
  const { exactRun } = await import("./task-progress-launch.js");
  await exactRun(stateRoot, binding);
  await readTaskSessionEvents(stateRoot, binding);
}
function directory(stateRoot: string, binding: TaskSessionBinding): string { return join(taskSessionRoot(stateRoot, binding), "steering"); }
function slotFor(dir: string, slot: number): string { return join(dir, `${String(slot).padStart(3, "0")}.json`); }
async function readProposal(path: string, stateRoot: string): Promise<TaskSteeringProposal> {
  return normalize(JSON.parse(await readBoundedFile(path, stateRoot, 16 * 1024)) as TaskSteeringProposal);
}
export async function submitTaskSteering(options: { stateRoot: string; proposal: TaskSteeringProposal }): Promise<Receipt> {
  const proposal = normalize(options.proposal);
  await validateRun(options.stateRoot, proposal.binding);
  if (proposal.evidenceIds?.length) {
    const replay = await readTaskSessionEvents(options.stateRoot, proposal.binding);
    const known = new Set(replay.events.flatMap((event) => event.evidenceRefs));
    if (proposal.evidenceIds.some((ref) => !known.has(ref))) throw new Error("Unknown task steering evidence reference");
  }
  const dir = directory(options.stateRoot, proposal.binding), content = JSON.stringify(proposal);
  // Exclusive immutable slots bound concurrent producers without a recoverable lock.
  const start = Number.parseInt(hash(proposal.requestId).slice(0, 8), 16) % 100;
  let stored = false;
  for (let offset = 0; offset < 100; offset++) {
    const path = slotFor(dir, (start + offset) % 100);
    try { await writeAtomicPrivateFile(path, content, 16 * 1024, options.stateRoot, { exclusive: true }); stored = true; break; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const previous = await readProposal(path, options.stateRoot);
      if (JSON.stringify(previous.binding) !== JSON.stringify(proposal.binding)) throw new Error("Task steering binding mismatch");
      if (previous.requestId === proposal.requestId) {
        if (JSON.stringify(previous) !== content) throw new Error("Conflicting task steering request");
        stored = true; break;
      }
    }
  }
  if (!stored) throw new Error("Task steering inbox full");
  const digest = hash(content);
  const event = await appendTaskSessionEvent(options.stateRoot, proposal.binding, { sourceEventId: `steering:${digest}`, observedAt: proposal.submittedAt,
    kind: "steering-received", workflow: null, step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null,
    observedEffort: null, outcome: "received", processState: null, recordedReason: null, evidenceRefs: [] });
  return { state: "received", digest, requestId: proposal.requestId, binding: proposal.binding, submittedAt: proposal.submittedAt, actor: "user", sequence: event.sequence };
}
export async function readTaskSteering(options: { stateRoot: string; binding: TaskSessionBinding }): Promise<Receipt[]> {
  const binding = validateTaskSessionBinding(options.binding);
  await validateRun(options.stateRoot, binding);
  const dir = directory(options.stateRoot, binding);
  let names: string[];
  let before: import("node:fs").Stats;
  try {
    await assertNoSymlinksInPathAndAncestors(dir);
    before = await lstat(dir);
    if (!before.isDirectory() || (process.platform !== "win32" && (before.mode & 0o077) !== 0)) throw new Error("Unsafe task steering directory");
    names = await readdir(dir);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  if (names.some((name) => !/^0\d\d\.json$/u.test(name) && !/^\.0\d\d\.json\.[a-f0-9-]{36}\.tmp$/u.test(name))) throw new Error("Invalid task steering inbox");
  names = names.filter((name) => /^0\d\d\.json$/u.test(name));
  if (names.length > 100) throw new Error("Invalid task steering inbox");
  const replay = await readTaskSessionEvents(options.stateRoot, binding);
  const receipts: Receipt[] = [];
  for (const name of names.sort()) {
    const proposal = await readProposal(join(dir, name), options.stateRoot);
    if (JSON.stringify(proposal.binding) !== JSON.stringify(binding)) throw new Error("Task steering binding mismatch");
    const digest = hash(JSON.stringify(proposal));
    receipts.push({ state: "received", digest, requestId: proposal.requestId, binding, submittedAt: proposal.submittedAt, actor: "user",
      sequence: replay.events.find((event) => event.sourceEventId === `steering:${digest}`)?.sequence ?? null });
  }
  await assertNoSymlinksInPathAndAncestors(dir);
  const after = await lstat(dir);
  if (!after.isDirectory() || before.dev !== after.dev || before.ino !== after.ino) throw new Error("Task steering directory changed");
  return receipts;
}
