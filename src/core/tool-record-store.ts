import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { proveOperationPaths, provePathBoundary, recheckPathProof, type OperationPathProofSet, type PathProof } from "./path-boundary.js";
import { packageRoot as installedPackageRoot } from "./paths.js";
import { inspectToolRecordJournal, proveToolRecordRoot, readToolRecordStore, safeToolRecordSource, type ToolRecordEvent, type ToolResult } from "./tool-records.js";
import { applyFileTransaction, type TransactionFailpoint } from "./transaction.js";
import { acquireMutationSession, writerLockPath, type MutationSession } from "./writer-lock.js";
import { rejectRawCredentials, validateManagedDocument } from "./validation.js";

type Request = NonNullable<ToolRecordEvent["requests"]>[number];
type Transition = NonNullable<ToolRecordEvent["acceptedTransitions"]>[number];

export interface ToolRecordOperationPlan {
  readonly stateRoot: string;
  readonly packageRoot: string;
  readonly operationId: string;
  readonly occurredAt: string;
  readonly requests: readonly Request[];
  readonly targets: readonly string[];
  readonly digest: string;
  readonly proofs: OperationPathProofSet;
  readonly checkoutProof: PathProof;
}

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/;
const json = (value: unknown): string => JSON.stringify(value);
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const issuedPlans = new WeakSet<ToolRecordOperationPlan>();

async function validateEvent(event: ToolRecordEvent): Promise<void> {
  const schema = JSON.parse(await readFile(join(installedPackageRoot(), "schemas", "tool-release-record.schema.json"), "utf8")) as Record<string, unknown>;
  const checked = validateManagedDocument<ToolRecordEvent>({ text: json(event), format: "json", kind: "tool-release-record", schema, domain: rejectRawCredentials });
  const results = event.kind === "finished" ? event.results ?? [] : event.result ? [event.result] : [];
  if (!checked.ok || !Number.isFinite(Date.parse(event.occurredAt)) || results.some((result) => !safeToolRecordSource(result))) throw new Error("Invalid tool record event");
}

function eventPath(plan: ToolRecordOperationPlan, sequence: number): string {
  const target = plan.targets[sequence];
  if (!target) throw new Error("Event sequence is outside reviewed plan");
  return target;
}

export async function planToolRecordOperation(options: { stateRoot: string; packageRoot: string; operationId: string; occurredAt: string; requests: Request[] }): Promise<ToolRecordOperationPlan> {
  const stateRoot = resolve(options.stateRoot), packageRoot = resolve(options.packageRoot);
  if (!idPattern.test(options.operationId) || !(await proveToolRecordRoot(stateRoot, packageRoot))) throw new Error("Unsafe tool record root or operation ID");
  const requests = JSON.parse(json(options.requests)) as Request[];
  const start: ToolRecordEvent = { schemaVersion: 1, operationId: options.operationId, eventId: `${options.operationId}-start`, sequence: 0, occurredAt: options.occurredAt, kind: "started", requests };
  await validateEvent(start);
  if (new Set(requests.map((request) => request.toolId)).size !== requests.length) throw new Error("Duplicate tool request");
  const base = join(stateRoot, "tool-records", "v1", "operations", options.operationId);
  const targets = [join(base, `0-${options.operationId}-start.json`), ...requests.map((_, index) => join(base, `${index + 1}-${options.operationId}-result-${index + 1}.json`)), join(base, `${requests.length + 1}-${options.operationId}-finish.json`)];
  const inputs = [
    ...targets.map((path) => ({ role: "target" as const, path })),
    { role: "state" as const, path: stateRoot },
    { role: "journal" as const, path: join(stateRoot, "journal") },
    { role: "snapshot" as const, path: join(stateRoot, "snapshots") },
    ...targets.flatMap((_, sequence) => [
      { role: "journal" as const, path: join(stateRoot, "journal", `${options.operationId}--event-${sequence}.json`) },
      { role: "snapshot" as const, path: join(stateRoot, "snapshots", `${options.operationId}--event-${sequence}`) },
    ]),
  ];
  const proofs = await proveOperationPaths({ inputs, allowedRoots: [stateRoot], requiredRoles: ["target", "state", "journal", "snapshot"] });
  if (!proofs.proven || proofs.proofs.some((proof) => !proof.capability.componentIdentity)) throw new Error("Tool record path proof failed");
  const checkoutProof = await provePathBoundary({ path: packageRoot, allowedRoots: [packageRoot], role: "source" });
  if (!checkoutProof.proven || !checkoutProof.capability.componentIdentity) throw new Error("Checkout path proof failed");
  const planDigest = digest(json({ stateRoot, packageRoot, operationId: options.operationId, occurredAt: options.occurredAt, requests, targets }));
  const plan = Object.freeze({ stateRoot, packageRoot, operationId: options.operationId, occurredAt: options.occurredAt, requests: Object.freeze(requests.map((request) => Object.freeze(request))), targets: Object.freeze(targets), digest: planDigest, proofs, checkoutProof });
  issuedPlans.add(plan);
  return plan;
}

async function recheck(plan: ToolRecordOperationPlan): Promise<void> {
  if (!issuedPlans.has(plan) || !(await recheckPathProof(plan.checkoutProof)).ok || !(await proveToolRecordRoot(plan.stateRoot, plan.packageRoot))) throw new Error("Unsafe tool record root or plan");
  for (const proof of plan.proofs.proofs) if (!(await recheckPathProof(proof)).ok) throw new Error("Tool record path changed");
}

async function verifySession(plan: ToolRecordOperationPlan, session: MutationSession): Promise<void> {
  session.assertOwned();
  if (resolve(session.stateRoot) !== plan.stateRoot || session.operationId !== plan.operationId || session.planDigest !== plan.digest || session.proofs !== plan.proofs) throw new Error("Tool record session mismatch");
  await recheck(plan);
  let lock: { operationId?: unknown; token?: unknown; planDigest?: unknown };
  try { lock = JSON.parse(await readFile(writerLockPath(plan.stateRoot), "utf8")) as typeof lock; } catch { throw new Error("Tool record writer ownership lost"); }
  if (lock.operationId !== session.operationId || lock.token !== session.token || lock.planDigest !== session.planDigest) throw new Error("Tool record writer ownership lost");
}

export async function withToolRecordSession<T>(plan: ToolRecordOperationPlan, run: (session: MutationSession) => Promise<T>, session?: MutationSession): Promise<T> {
  await recheck(plan);
  const owned = session ?? await acquireMutationSession({ stateRoot: plan.stateRoot, proofs: plan.proofs, planDigest: plan.digest, operationId: plan.operationId });
  try { await verifySession(plan, owned); return await run(owned); } finally { if (!session) await owned.close(); }
}

async function writeEvent(plan: ToolRecordOperationPlan, session: MutationSession, event: ToolRecordEvent, testFailpoint?: () => TransactionFailpoint): Promise<{ idempotent: boolean; directorySyncSupported: boolean }> {
  await validateEvent(event);
  await verifySession(plan, session);
  const target = eventPath(plan, event.sequence), content = `${json(event)}\n`;
  const existing = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  if (existing !== null) {
    if (existing !== content) throw new Error("Tool record event conflict");
    const commit = await inspectToolRecordJournal(plan.stateRoot, target, digest(existing));
    await verifySession(plan, session);
    if (!commit.applied) throw new Error("Tool record event commit unverified");
    return { idempotent: true, directorySyncSupported: commit.directorySyncSupported === true };
  }
  await verifySession(plan, session);
  const transactionId = `${plan.operationId}--event-${event.sequence}`;
  const journalPath = join(plan.stateRoot, "journal", `${transactionId}.json`);
  const journalExists = await readFile(journalPath).then(() => true, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return false; throw error; });
  if (journalExists) throw new Error("Tool record event journal already exists");
  await verifySession(plan, session);
  const eventSession: MutationSession = { ...session, allocateTransactionId: () => transactionId };
  const journal = await applyFileTransaction({ stateRoot: plan.stateRoot, allowedRoots: [join(plan.stateRoot, "tool-records", "v1", "operations", plan.operationId)], operations: [{ target, content }], session: eventSession, failpoint: testFailpoint?.() ?? null });
  return { idempotent: false, directorySyncSupported: journal.directorySyncSupported === true };
}

export async function beginToolOperation(plan: ToolRecordOperationPlan, session: MutationSession) {
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: `${plan.operationId}-start`, sequence: 0, occurredAt: plan.occurredAt, kind: "started", requests: [...plan.requests] });
}

export async function appendToolResult(plan: ToolRecordOperationPlan, session: MutationSession, result: ToolResult) {
  const index = plan.requests.findIndex((request) => request.toolId === result.toolId);
  if (index < 0 || json(plan.requests[index]) !== json(result.requested)) throw new Error("Tool result does not match request");
  const store = await readToolRecordStore({ stateRoot: plan.stateRoot, packageRoot: plan.packageRoot });
  if (!store.events.some((event) => event.operationId === plan.operationId && event.kind === "started")) throw new Error("Tool operation has not started");
  if (store.status !== "current" || store.incomplete) throw new Error("Tool record history is unavailable");
  if (store.events.some((event) => event.operationId === plan.operationId && event.kind === "finished") && !store.events.some((event) => event.operationId === plan.operationId && event.kind === "tool-result" && event.result?.toolId === result.toolId)) throw new Error("Tool operation already finished");
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: `${plan.operationId}-result-${index + 1}`, sequence: index + 1, occurredAt: plan.occurredAt, kind: "tool-result", result: JSON.parse(json(result)) as ToolResult });
}

export async function finishToolOperation(plan: ToolRecordOperationPlan, session: MutationSession, transitions: Transition[] = [], testFailpoint?: () => TransactionFailpoint) {
  await verifySession(plan, session);
  const store = await readToolRecordStore({ stateRoot: plan.stateRoot, packageRoot: plan.packageRoot });
  const events = store.events.filter((event) => event.operationId === plan.operationId);
  const results = plan.requests.map((request) => events.find((event) => event.kind === "tool-result" && event.result?.toolId === request.toolId)?.result);
  if (store.status !== "current" || results.some((result) => !result) || !events.some((event) => event.kind === "started")) throw new Error("Tool operation results incomplete");
  const complete = results as ToolResult[];
  const count = complete.filter((result) => result.outcome === "succeeded").length;
  const outcome = count === complete.length ? "succeeded" : count === 0 ? "failed" : "partial";
  if (outcome !== "succeeded" && transitions.length) throw new Error("Unsuccessful operation cannot advance acceptance");
  const finished = events.find((event) => event.kind === "finished");
  if (finished) return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: `${plan.operationId}-finish`, sequence: plan.requests.length + 1, occurredAt: plan.occurredAt, kind: "finished", results: complete, outcome, acceptedTransitions: JSON.parse(json(transitions)) as Transition[] });
  for (const transition of transitions) {
    const result = complete.find((item) => item.toolId === transition.toolId);
    const proof = result?.evidence.find((item) => item.proofId === transition.proofId);
    if (!result?.resolved || result.installed?.installationId !== transition.installationId || result.installed.version !== result.resolved.release || result.verified !== transition.proofId || proof?.subject !== transition.installationId || proof.target !== "integration" || proof.method !== "invocation" || proof.result !== "pass" || !proof.harness || proof.platform !== result.resolved.platform || proof.architecture !== result.resolved.architecture || transition.priorDigest !== (store.accepted?.[`${transition.toolId}/${transition.installationId}`] ?? null)) throw new Error("Tool acceptance evidence or prior reference invalid");
  }
  if (new Set(transitions.map((transition) => `${transition.toolId}/${transition.installationId}`)).size !== transitions.length) throw new Error("Duplicate acceptance transition");
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: `${plan.operationId}-finish`, sequence: plan.requests.length + 1, occurredAt: plan.occurredAt, kind: "finished", results: complete, outcome, acceptedTransitions: JSON.parse(json(transitions)) as Transition[] }, testFailpoint);
}

export async function runToolRecordOperation(plan: ToolRecordOperationPlan, run: (request: Request) => Promise<ToolResult>) {
  try {
    return await withToolRecordSession(plan, async (session) => {
      const started = await beginToolOperation(plan, session);
      let failed = false, directorySyncSupported = started.directorySyncSupported;
      for (const request of plan.requests) {
        let result: ToolResult;
        try { result = await run(request); } catch { result = { toolId: request.toolId, requested: request, resolved: null, installed: null, verified: null, evidence: [], outcome: "failed" }; }
        failed ||= result.outcome !== "succeeded";
        directorySyncSupported = (await appendToolResult(plan, session, result)).directorySyncSupported && directorySyncSupported;
      }
      directorySyncSupported = (await finishToolOperation(plan, session)).directorySyncSupported && directorySyncSupported;
      return { ok: !failed, code: failed ? "tool-failed" as const : null, directorySyncSupported };
    });
  } catch {
    return { ok: false, code: "persistence-failed" as const, directorySyncSupported: false };
  }
}
