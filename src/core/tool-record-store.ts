import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { proveOperationPaths, provePathBoundary, recheckPathProof, type OperationPathProofSet, type PathProof } from "./path-boundary.js";
import { packageRoot as installedPackageRoot } from "./paths.js";
import { proveToolRecordRoot, readToolRecordStore, safeToolRecordSource, type ToolRecordEvent, type ToolResult } from "./tool-records.js";
import { applyFileTransaction } from "./transaction.js";
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
  const start: ToolRecordEvent = { schemaVersion: 1, operationId: options.operationId, eventId: "start", sequence: 0, occurredAt: options.occurredAt, kind: "started", requests };
  await validateEvent(start);
  if (new Set(requests.map((request) => request.toolId)).size !== requests.length) throw new Error("Duplicate tool request");
  const base = join(stateRoot, "tool-records", "v1", "operations", options.operationId);
  const targets = [join(base, "0-start.json"), ...requests.map((_, index) => join(base, `${index + 1}-result-${index + 1}.json`)), join(base, `${requests.length + 1}-finish.json`)];
  const inputs = [
    ...targets.map((path) => ({ role: "target" as const, path })),
    { role: "state" as const, path: stateRoot },
    { role: "journal" as const, path: join(stateRoot, "journal") },
    { role: "snapshot" as const, path: join(stateRoot, "snapshots") },
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

async function writeEvent(plan: ToolRecordOperationPlan, session: MutationSession, event: ToolRecordEvent): Promise<{ idempotent: boolean; directorySyncSupported: boolean }> {
  await validateEvent(event);
  await verifySession(plan, session);
  const target = eventPath(plan, event.sequence), content = `${json(event)}\n`;
  const existing = await readFile(target, "utf8").catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return null; throw error; });
  if (existing !== null) {
    if (existing !== content) throw new Error("Tool record event conflict");
    return { idempotent: true, directorySyncSupported: false };
  }
  await verifySession(plan, session);
  const journal = await applyFileTransaction({ stateRoot: plan.stateRoot, allowedRoots: [join(plan.stateRoot, "tool-records", "v1", "operations", plan.operationId)], operations: [{ target, content }], session, failpoint: null });
  return { idempotent: false, directorySyncSupported: journal.directorySyncSupported === true };
}

export async function beginToolOperation(plan: ToolRecordOperationPlan, session: MutationSession) {
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: "start", sequence: 0, occurredAt: plan.occurredAt, kind: "started", requests: [...plan.requests] });
}

export async function appendToolResult(plan: ToolRecordOperationPlan, session: MutationSession, result: ToolResult) {
  const index = plan.requests.findIndex((request) => request.toolId === result.toolId);
  if (index < 0 || json(plan.requests[index]) !== json(result.requested)) throw new Error("Tool result does not match request");
  const store = await readToolRecordStore({ stateRoot: plan.stateRoot, packageRoot: plan.packageRoot });
  if (!store.events.some((event) => event.operationId === plan.operationId && event.kind === "started")) throw new Error("Tool operation has not started");
  if (store.events.some((event) => event.operationId === plan.operationId && event.kind === "finished")) throw new Error("Tool operation already finished");
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: `result-${index + 1}`, sequence: index + 1, occurredAt: plan.occurredAt, kind: "tool-result", result: JSON.parse(json(result)) as ToolResult });
}

export async function finishToolOperation(plan: ToolRecordOperationPlan, session: MutationSession, transitions: Transition[] = []) {
  await verifySession(plan, session);
  const store = await readToolRecordStore({ stateRoot: plan.stateRoot, packageRoot: plan.packageRoot });
  const events = store.events.filter((event) => event.operationId === plan.operationId);
  const results = plan.requests.map((request) => events.find((event) => event.kind === "tool-result" && event.result?.toolId === request.toolId)?.result);
  if (store.status !== "current" || results.some((result) => !result) || !events.some((event) => event.kind === "started")) throw new Error("Tool operation results incomplete");
  const complete = results as ToolResult[];
  const count = complete.filter((result) => result.outcome === "succeeded").length;
  const outcome = count === complete.length ? "succeeded" : count === 0 ? "failed" : "partial";
  if (outcome !== "succeeded" && transitions.length) throw new Error("Unsuccessful operation cannot advance acceptance");
  for (const transition of transitions) {
    const result = complete.find((item) => item.toolId === transition.toolId);
    const proof = result?.evidence.find((item) => item.proofId === transition.proofId);
    if (!result?.resolved || result.installed?.installationId !== transition.installationId || result.installed.version !== result.resolved.release || result.verified !== transition.proofId || proof?.subject !== transition.installationId || proof.target !== "integration" || proof.method !== "invocation" || proof.result !== "pass" || !proof.harness || proof.platform !== result.resolved.platform || proof.architecture !== result.resolved.architecture || transition.priorDigest !== (store.accepted?.[`${transition.toolId}/${transition.installationId}`] ?? null)) throw new Error("Tool acceptance evidence or prior reference invalid");
  }
  if (new Set(transitions.map((transition) => `${transition.toolId}/${transition.installationId}`)).size !== transitions.length) throw new Error("Duplicate acceptance transition");
  return writeEvent(plan, session, { schemaVersion: 1, operationId: plan.operationId, eventId: "finish", sequence: plan.requests.length + 1, occurredAt: plan.occurredAt, kind: "finished", results: complete, outcome, acceptedTransitions: JSON.parse(json(transitions)) as Transition[] });
}

export async function runToolRecordOperation(plan: ToolRecordOperationPlan, run: (request: Request) => Promise<ToolResult>) {
  return withToolRecordSession(plan, async (session) => {
    await beginToolOperation(plan, session);
    let failed = false;
    for (const request of plan.requests) {
      let result: ToolResult;
      try { result = await run(request); } catch { failed = true; result = { toolId: request.toolId, requested: request, resolved: null, installed: null, verified: null, evidence: [], outcome: "failed" }; }
      await appendToolResult(plan, session, result);
    }
    await finishToolOperation(plan, session);
    return { ok: !failed };
  });
}
