import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, rmdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTaskApprovals, reservedRunIdForApproval } from "./task-contract.js";
import type { TaskRunRecord } from "./task-run.js";
import { appendTaskSessionEvent, createTaskSession, hasTaskSessionSourceEvent, validateTaskSessionBinding, type TaskSessionBinding } from "./task-session.js";
import { getCommandJobStatus, readBoundedFile, startCommandJob, writeAtomicPrivateFile, type CommandJobPathBarrier } from "./command-jobs.js";
import { waitForCompletion } from "./completion-wait.js";
import { startTaskProgressPanel } from "./task-progress-panel.js";

const MAX_OBSERVER_MS = 24 * 60 * 60_000;
const LAUNCH_ID = /^[a-f0-9]{32}$/u;
type PanelSpec = { schemaVersion: 1; binding: TaskSessionBinding; deadlineAt: number };
function launchPaths(stateRoot: string, id: string) {
  if (!LAUNCH_ID.test(id)) throw new Error("Invalid panel launch identifier");
  const dir = join(stateRoot, "panel-launches");
  return { dir, spec: join(dir, `${id}.json`), handoff: join(dir, `${id}.handoff`), ready: join(dir, `${id}.ready`) };
}

export async function publishTaskPanelHandoff(stateRoot: string, id: string, value: { url: string; deadlineAt: number }, barrier?: CommandJobPathBarrier): Promise<void> {
  const paths = launchPaths(stateRoot, id);
  await writeAtomicPrivateFile(paths.handoff, JSON.stringify(value), 8192, stateRoot,
    { exclusive: true, ...(barrier ? { barrier } : {}) });
  // Atomic file publication is visible before its identity checks/temp cleanup
  // finish. Announce readiness only after that writer has fully returned.
  await mkdir(paths.ready, { mode: 0o700 });
}

export async function readTaskPanelHandoff(stateRoot: string, id: string, deadlineAt: number): Promise<string> {
  const paths = launchPaths(stateRoot, id);
  const ready = await lstat(paths.ready);
  if (!ready.isDirectory() || ready.isSymbolicLink()) throw new Error("Invalid observer readiness marker");
  const data = JSON.parse(await readBoundedFile(paths.handoff, stateRoot, 8192, undefined, true)) as { url?: unknown; deadlineAt?: unknown };
  if (typeof data.url !== "string" || data.deadlineAt !== deadlineAt) throw new Error("Invalid observer handoff");
  const url = new URL(data.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !/^#[A-Za-z0-9_-]{43}$/u.test(url.hash)) throw new Error("Invalid observer handoff");
  return data.url;
}
export function panelDeadline(run: TaskRunRecord, explicitMs?: number, now = Date.now()): number {
  if (explicitMs !== undefined) {
    if (!Number.isSafeInteger(explicitMs) || explicitMs < 1 || explicitMs > MAX_OBSERVER_MS) throw new Error("Invalid observer timeout");
    return now + explicitMs;
  }
  const runDeadline = run.status === "executing" && run.deadlineAt ? Date.parse(run.deadlineAt) : NaN;
  return Number.isFinite(runDeadline) && runDeadline > now ? Math.min(now + MAX_OBSERVER_MS, runDeadline + 60_000) : now + 30 * 60_000;
}
export async function exactRun(stateRoot: string, binding: TaskSessionBinding): Promise<{ run: TaskRunRecord; projectRoot: string; workflow: string | undefined; dedicated?: { dispatch: import("./task-runtime.js").TaskDispatchObservation; workflow: string | undefined } }> {
  const { readTaskReport } = await import("./task-run.js");
  const run = await readTaskReport({ stateRoot, contractId: binding.contractId, runId: binding.runId });
  const approvals = await readTaskApprovals({ stateRoot, contractId: binding.contractId });
  const approval = approvals.find((value) => value.contractDigest === binding.contractDigest && value.revision === binding.revision);
  if (!approval) throw new Error("Exact approved task run not found");
  if (run && run.runId === binding.runId && run.contractDigest === binding.contractDigest && run.revision === binding.revision) return { run, projectRoot: approval.canonicalProjectRoot, workflow: approval.contract.scope.workflow };
  if (binding.runId !== reservedRunIdForApproval({ contractDigest: binding.contractDigest })) throw new Error("Exact approved task run not found");
  const { readTaskDispatches } = await import("./task-runtime.js");
  const dispatches = await readTaskDispatches(stateRoot, binding.contractDigest, { runId: binding.runId, maxRecords: 1000, processOnly: true });
  for (const dispatch of dispatches.reverse()) {
    if (!dispatch.jobId || dispatch.contractDigest !== binding.contractDigest || dispatch.runId !== binding.runId || dispatch.projectRoot !== approval.contract.scope.projectRoot) continue;
    const job = await getCommandJobStatus(stateRoot, dispatch.jobId).catch(() => null);
    if (!job || !job.acknowledgedAt || !job.startedAt || job.cwd !== approval.canonicalProjectRoot) continue;
    const deadline = Date.parse(job.startedAt) + job.deadlineMs;
    const projectedRun = { status: dispatch.status === "running" ? "executing" : "unknown", deadlineAt: Number.isFinite(deadline) ? new Date(deadline).toISOString() : null } as TaskRunRecord;
    return { run: projectedRun, projectRoot: approval.canonicalProjectRoot, workflow: approval.contract.scope.workflow, dedicated: { dispatch, workflow: approval.contract.scope.workflow } };
  }
  throw new Error("Exact approved task run not found");
}
function parseSpec(value: unknown): PanelSpec {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "binding,deadlineAt,schemaVersion") throw new Error("Invalid panel launch spec");
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.deadlineAt) || (data.deadlineAt as number) <= Date.now() || (data.deadlineAt as number) > Date.now() + MAX_OBSERVER_MS) throw new Error("Invalid panel launch deadline");
  return { schemaVersion: 1, binding: validateTaskSessionBinding(data.binding), deadlineAt: data.deadlineAt as number };
}
export async function launchTaskProgressPanel(options: { stateRoot: string; binding: TaskSessionBinding; timeoutMs?: number }): Promise<{ jobId: string; binding: TaskSessionBinding; deadlineAt: number; url: string }> {
  const binding = validateTaskSessionBinding(options.binding);
  const { run, projectRoot, workflow, dedicated } = await exactRun(options.stateRoot, binding);
  const deadlineAt = panelDeadline(run, options.timeoutMs);
  await hydrateTaskProgress({ stateRoot: options.stateRoot, binding, run, workflow, dedicated });
  const id = randomUUID().replaceAll("-", ""), paths = launchPaths(options.stateRoot, id);
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await writeAtomicPrivateFile(paths.spec, JSON.stringify({ schemaVersion: 1, binding, deadlineAt }), 8192, options.stateRoot, { exclusive: true });
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  const job = await startCommandJob({ stateRoot: options.stateRoot, cwd: projectRoot, executable: process.execPath,
    args: [cli, "task", "panel-serve", "--launch-id", id, "--state-root", options.stateRoot], deadlineMs: Math.min(MAX_OBSERVER_MS, Math.max(1, deadlineAt - Date.now() + 10_000)) });
  const observed = await waitForCompletion({ targetPath: paths.ready, timeoutMs: Math.min(10000, Math.max(1, deadlineAt - Date.now())), check: async () => {
    try {
      return { state: "terminal" as const, value: await readTaskPanelHandoff(options.stateRoot, id, deadlineAt) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "pending" as const };
      return { state: "refused" as const, code: "PANEL_HANDOFF_INVALID", reason: "Observer handoff could not be read" };
    }
  } });
  if (observed.status !== "completed") throw new Error(`Panel handoff ${observed.status}; observer job ${job.jobId} remains the exact handle`);
  await unlink(paths.handoff);
  await unlink(paths.spec);
  await rmdir(paths.ready);
  return { jobId: job.jobId, binding, deadlineAt, url: observed.value };
}
async function hydrateTaskProgress(options: { stateRoot: string; binding: TaskSessionBinding; run: TaskRunRecord; workflow: string | undefined; dedicated: Awaited<ReturnType<typeof exactRun>>["dedicated"] }): Promise<void> {
  const { binding, run, workflow, dedicated } = options;
  // Refuse a different origin binding before creating a detached observer.
  await createTaskSession(options.stateRoot, binding);
  const { projectTaskProgress, projectRecordedDecisions, projectRunOutcome } = await import("./task-progress.js");
  const { readTaskDispatches } = await import("./task-runtime.js");
  let historyUnavailable = false;
  const dispatches = dedicated ? [dedicated.dispatch] : await readTaskDispatches(options.stateRoot, binding.contractDigest, { runId: binding.runId, maxRecords: 1000, processOnly: true }).catch(() => { historyUnavailable = true; return []; });
  const outcome = dedicated ? null : projectRunOutcome(run);
  const events = [...dispatches.map((dispatch) => projectTaskProgress(dispatch, workflow)),
    ...(dedicated ? [] : projectRecordedDecisions(run)), ...(outcome ? [outcome] : [])].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  // Earlier lifecycle events are not reconstructible from the bounded run records.
  if (dispatches.length || outcome || historyUnavailable) events.unshift({ sourceEventId: `history-gap:${createHash("sha256").update(binding.runId).digest("hex")}`, observedAt: events[0]?.observedAt ?? run.startedAt,
    kind: "history-gap", workflow: null, step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null,
    observedEffort: null, outcome: null, processState: null, recordedReason: "Earlier activity unavailable", evidenceRefs: [] });
  for (const event of events) {
    const alreadyPublished = () => hasTaskSessionSourceEvent(options.stateRoot, binding, event.sourceEventId);
    if (!await alreadyPublished()) {
      try { await appendTaskSessionEvent(options.stateRoot, binding, event); }
      catch (error) { if (!(error instanceof Error) || !error.message.includes("Conflicting task session source event") || !await alreadyPublished()) throw error; }
    }
  }
}
export async function hydrateExactTaskProgress(stateRoot: string, value: TaskSessionBinding): Promise<void> {
  const binding = validateTaskSessionBinding(value);
  const { run, workflow, dedicated } = await exactRun(stateRoot, binding);
  await hydrateTaskProgress({ stateRoot, binding, run, workflow, dedicated });
}
export async function serveTaskProgressPanel(stateRoot: string, id: string): Promise<void> {
  const paths = launchPaths(stateRoot, id);
  const spec = parseSpec(JSON.parse(await readBoundedFile(paths.spec, stateRoot, 8192, undefined, true)));
  await exactRun(stateRoot, spec.binding);
  await createTaskSession(stateRoot, spec.binding);
  const panel = await startTaskProgressPanel({ stateRoot, binding: spec.binding, deadlineAt: spec.deadlineAt });
  let finish!: () => void;
  let timer!: ReturnType<typeof setTimeout>;
  const stopped = new Promise<void>((resolve) => {
    finish = () => resolve();
    timer = setTimeout(finish, Math.max(1, spec.deadlineAt - Date.now()));
    process.once("SIGTERM", finish);
    process.once("SIGINT", finish);
  });
  try {
    await publishTaskPanelHandoff(stateRoot, id, { url: panel.url, deadlineAt: spec.deadlineAt });
    await stopped;
  } finally {
    clearTimeout(timer);
    process.removeListener("SIGTERM", finish);
    process.removeListener("SIGINT", finish);
    try { await panel.dispose(); }
    finally {
      await unlink(paths.handoff).catch(() => {});
      await unlink(paths.spec).catch(() => {});
      await rmdir(paths.ready).catch(() => {});
    }
  }
}
