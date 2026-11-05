import { createHash } from "node:crypto";
import { join } from "node:path";
import { readBoundedFile, writeAtomicPrivateFile } from "./command-jobs.js";
import { waitForCompletion } from "./completion-wait.js";
import { createTaskSession, validateTaskSessionBinding, type TaskSessionBinding } from "./task-session.js";
import { capabilityDiagnostic } from "./task-capability-health.js";
import type { TaskContract } from "./task-contract.js";

export async function taskOriginProcessClosed(stateRoot: string, contract: TaskContract): Promise<boolean> {
  const { readTaskChainDispatches } = await import("./task-runtime.js");
  const records = await readTaskChainDispatches(stateRoot, contract);
  return records.length > 0 && records.every((record) => record.closeConfirmed === true && record.finishedAt !== null && !["running", "interrupted"].includes(record.status));
}

export interface TaskOriginOutcome {
  schemaVersion: 1;
  binding: TaskSessionBinding;
  chainId: string;
  outcomeId: string;
  finalRunId: string | null;
  finalDigest: string;
  status: "accepted" | "rejected" | "blocked" | "stopped" | "needs-input" | "unknown";
  reason: string | null;
  acceptance: "verified" | "not-accepted";
  processClosure: "confirmed" | "unknown";
  delivery: "foreground-return";
}

export function nativeOriginReadiness(host?: string, session?: string, source: NodeJS.ProcessEnv = process.env) {
  const originHost = host ?? (source.CODEX_THREAD_ID || source.CODEX_SESSION_ID ? "codex" : undefined);
  const originSession = session ?? (host === undefined || host === "codex" ? source.CODEX_THREAD_ID ?? source.CODEX_SESSION_ID : undefined);
  if ((originHost && !originSession) || (!originHost && originSession)) throw new Error("Native delivery requires both origin host and session");
  if (originHost && (!["codex", "claude", "antigravity", "agy", "pi", "hermes"].includes(originHost) || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(originSession!))) throw new Error("Invalid native origin identity");
  return { registered: Boolean(originHost && originSession), supported: Boolean(originHost === "codex" && originSession), mode: "foreground-return" as const, host: originHost ?? null, originatingSessionId: originSession ?? null,
    automaticIdleWakeup: false, continuation: "Keep the originating native tool/process completion handle awaited until final outcome; reconnect with task follow and acknowledge its outcomeId. Detached idle-session injection is not supported." };
}

function paths(stateRoot: string, value: TaskSessionBinding) {
  const binding = validateTaskSessionBinding(value);
  const origin = createHash("sha256").update(JSON.stringify(binding)).digest("hex");
  const root = join(stateRoot, "runs", binding.contractDigest, "delivery", origin);
  return { root, registration: join(root, "origin.json"), outcome: join(root, "outcome.json"), ack: join(root, "ack.json") };
}

async function readOptional(path: string, stateRoot: string): Promise<unknown | null> {
  try { return JSON.parse(await readBoundedFile(path, stateRoot, 16 * 1024, undefined, true)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

export async function registerTaskOrigin(stateRoot: string, value: TaskSessionBinding): Promise<void> {
  const binding = validateTaskSessionBinding(value);
  const target = paths(stateRoot, binding);
  const registration = { schemaVersion: 1, binding, delivery: "foreground-return" };
  const prior = await readOptional(target.registration, stateRoot);
  if (prior && JSON.stringify(prior) !== JSON.stringify(registration)) throw new Error("Origin registration identity mismatch");
  if (!prior) {
    try { await writeAtomicPrivateFile(target.registration, JSON.stringify(registration), 16 * 1024, stateRoot, { exclusive: true }); }
    catch (error) { if (JSON.stringify(await readOptional(target.registration, stateRoot)) !== JSON.stringify(registration)) throw error; }
  }
  await createTaskSession(stateRoot, binding);
}

export async function readTaskOriginOutcome(stateRoot: string, binding: TaskSessionBinding): Promise<TaskOriginOutcome | null> {
  const data = await readOptional(paths(stateRoot, binding).outcome, stateRoot) as TaskOriginOutcome | null;
  if (!data) return null;
  const { outcomeId, ...body } = data;
  const keys = ["schemaVersion", "binding", "chainId", "outcomeId", "finalRunId", "finalDigest", "status", "reason", "acceptance", "processClosure", "delivery"];
  if (data.schemaVersion !== 1 || JSON.stringify(validateTaskSessionBinding(data.binding)) !== JSON.stringify(validateTaskSessionBinding(binding)) ||
    Object.keys(data).length !== keys.length || keys.some((key) => !Object.hasOwn(data, key)) ||
    !["accepted", "rejected", "blocked", "stopped", "needs-input", "unknown"].includes(data.status) ||
    data.acceptance !== (data.status === "accepted" ? "verified" : "not-accepted") || !["confirmed", "unknown"].includes(data.processClosure) ||
    (data.reason !== null && (typeof data.reason !== "string" || data.reason.length > 512)) ||
    (data.finalRunId !== null && (typeof data.finalRunId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(data.finalRunId))) ||
    data.chainId !== binding.contractDigest || data.delivery !== "foreground-return" || !/^[a-f0-9]{64}$/u.test(data.finalDigest) ||
    outcomeId !== createHash("sha256").update(JSON.stringify(body)).digest("hex")) throw new Error("Origin outcome identity or integrity mismatch");
  return data;
}

export async function settleTaskOrigin(options: { stateRoot: string; binding: TaskSessionBinding; finalRunId: string | null; finalDigest: string; status: TaskOriginOutcome["status"]; reason: string | null; processClosed?: boolean }): Promise<TaskOriginOutcome> {
  const binding = validateTaskSessionBinding(options.binding);
  const target = paths(options.stateRoot, binding);
  if (!await readOptional(target.registration, options.stateRoot)) throw new Error("Origin was not registered before execution");
  const body: Omit<TaskOriginOutcome, "outcomeId"> = { schemaVersion: 1, binding, chainId: binding.contractDigest,
    finalRunId: options.finalRunId, finalDigest: options.finalDigest, status: options.status,
    reason: options.reason === null ? null : capabilityDiagnostic(options.reason).slice(0, 512),
    acceptance: options.status === "accepted" ? "verified" : "not-accepted", processClosure: options.processClosed ? "confirmed" : "unknown", delivery: "foreground-return" };
  const result = { ...body, outcomeId: createHash("sha256").update(JSON.stringify(body)).digest("hex") };
  const prior = await readTaskOriginOutcome(options.stateRoot, binding);
  if (prior) { if (prior.outcomeId !== result.outcomeId) throw new Error("A final recovery outcome cannot be overwritten"); return prior; }
  await writeAtomicPrivateFile(target.outcome, JSON.stringify(result), 16 * 1024, options.stateRoot, { exclusive: true });
  return result;
}

export async function acknowledgeTaskOrigin(stateRoot: string, binding: TaskSessionBinding, outcomeId: string): Promise<{ firstAcknowledgement: boolean }> {
  const outcome = await readTaskOriginOutcome(stateRoot, binding);
  if (!outcome || outcome.outcomeId !== outcomeId) throw new Error("Cannot acknowledge an absent or different origin outcome");
  const path = paths(stateRoot, binding).ack;
  const ack = { outcomeId, originatingSessionId: binding.originatingSessionId };
  const prior = await readOptional(path, stateRoot);
  if (prior) { if (JSON.stringify(prior) !== JSON.stringify(ack)) throw new Error("Outcome acknowledgement mismatch"); return { firstAcknowledgement: false }; }
  try { await writeAtomicPrivateFile(path, JSON.stringify(ack), 4096, stateRoot, { exclusive: true }); }
  catch (error) { if (JSON.stringify(await readOptional(path, stateRoot)) !== JSON.stringify(ack)) throw error; return { firstAcknowledgement: false }; }
  return { firstAcknowledgement: true };
}

export async function followTaskOrigin(options: { stateRoot: string; binding: TaskSessionBinding; timeoutMs: number; signal?: AbortSignal }) {
  const target = paths(options.stateRoot, options.binding);
  if (!await readOptional(target.registration, options.stateRoot)) throw new Error("No registered native origin for this exact chain");
  return waitForCompletion({ targetPath: target.outcome, timeoutMs: options.timeoutMs, signal: options.signal, check: async () => {
    const outcome = await readTaskOriginOutcome(options.stateRoot, options.binding);
    return outcome ? { state: "terminal", value: { outcome, acknowledged: await readOptional(target.ack, options.stateRoot) !== null } } : { state: "pending" };
  } });
}
