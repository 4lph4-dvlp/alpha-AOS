import { randomUUID } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTaskApprovals } from "./task-contract.js";
import { readTaskReport, type TaskRunRecord } from "./task-run.js";
import { createTaskSession, validateTaskSessionBinding, type TaskSessionBinding } from "./task-session.js";
import { readBoundedFile, startCommandJob, writeAtomicPrivateFile } from "./command-jobs.js";
import { waitForCompletion } from "./completion-wait.js";
import { startTaskProgressPanel } from "./task-progress-panel.js";

const MAX_OBSERVER_MS = 24 * 60 * 60_000;
const LAUNCH_ID = /^[a-f0-9]{32}$/u;
type PanelSpec = { schemaVersion: 1; binding: TaskSessionBinding; deadlineAt: number };
function launchPaths(stateRoot: string, id: string) {
  if (!LAUNCH_ID.test(id)) throw new Error("Invalid panel launch identifier");
  const dir = join(stateRoot, "panel-launches");
  return { dir, spec: join(dir, `${id}.json`), handoff: join(dir, `${id}.handoff`) };
}
export function panelDeadline(run: TaskRunRecord, explicitMs?: number, now = Date.now()): number {
  if (explicitMs !== undefined) {
    if (!Number.isSafeInteger(explicitMs) || explicitMs < 1 || explicitMs > MAX_OBSERVER_MS) throw new Error("Invalid observer timeout");
    return now + explicitMs;
  }
  const runDeadline = run.status === "executing" && run.deadlineAt ? Date.parse(run.deadlineAt) : NaN;
  return Number.isFinite(runDeadline) && runDeadline > now ? Math.min(now + MAX_OBSERVER_MS, runDeadline + 60_000) : now + 30 * 60_000;
}
async function exactRun(stateRoot: string, binding: TaskSessionBinding): Promise<{ run: TaskRunRecord; projectRoot: string }> {
  const run = await readTaskReport({ stateRoot, contractId: binding.contractId, runId: binding.runId });
  if (!run || run.runId !== binding.runId || run.contractDigest !== binding.contractDigest || run.revision !== binding.revision) throw new Error("Exact approved task run not found");
  const approvals = await readTaskApprovals({ stateRoot, contractId: binding.contractId });
  const approval = approvals.find((value) => value.contractDigest === binding.contractDigest && value.revision === binding.revision);
  if (!approval) throw new Error("Exact task approval not found");
  return { run, projectRoot: approval.canonicalProjectRoot };
}
function parseSpec(value: unknown): PanelSpec {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "binding,deadlineAt,schemaVersion") throw new Error("Invalid panel launch spec");
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1 || !Number.isSafeInteger(data.deadlineAt) || (data.deadlineAt as number) <= Date.now() || (data.deadlineAt as number) > Date.now() + MAX_OBSERVER_MS) throw new Error("Invalid panel launch deadline");
  return { schemaVersion: 1, binding: validateTaskSessionBinding(data.binding), deadlineAt: data.deadlineAt as number };
}
export async function launchTaskProgressPanel(options: { stateRoot: string; binding: TaskSessionBinding; timeoutMs?: number }): Promise<{ jobId: string; binding: TaskSessionBinding; deadlineAt: number; url: string }> {
  const binding = validateTaskSessionBinding(options.binding);
  const { run, projectRoot } = await exactRun(options.stateRoot, binding);
  const deadlineAt = panelDeadline(run, options.timeoutMs);
  const id = randomUUID().replaceAll("-", ""), paths = launchPaths(options.stateRoot, id);
  await mkdir(paths.dir, { recursive: true, mode: 0o700 });
  await writeAtomicPrivateFile(paths.spec, JSON.stringify({ schemaVersion: 1, binding, deadlineAt }), 8192, options.stateRoot, { exclusive: true });
  const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
  const job = await startCommandJob({ stateRoot: options.stateRoot, cwd: projectRoot, executable: process.execPath,
    args: [cli, "task", "panel-serve", "--launch-id", id], deadlineMs: Math.min(MAX_OBSERVER_MS, Math.max(1, deadlineAt - Date.now() + 10_000)) });
  const observed = await waitForCompletion({ targetPath: paths.handoff, timeoutMs: Math.min(10000, Math.max(1, deadlineAt - Date.now())), check: async () => {
    try {
      const data = JSON.parse(await readBoundedFile(paths.handoff, options.stateRoot, 8192, undefined, true)) as { url?: unknown; deadlineAt?: unknown };
      if (typeof data.url !== "string" || data.deadlineAt !== deadlineAt) return { state: "refused" as const, code: "PANEL_HANDOFF_INVALID", reason: "Invalid observer handoff" };
      const url = new URL(data.url);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !/^#[A-Za-z0-9_-]{43}$/u.test(url.hash)) return { state: "refused" as const, code: "PANEL_HANDOFF_INVALID", reason: "Invalid observer handoff" };
      return { state: "terminal" as const, value: data.url };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { state: "pending" as const };
      return { state: "refused" as const, code: "PANEL_HANDOFF_INVALID", reason: "Observer handoff could not be read" };
    }
  } });
  if (observed.status !== "completed") throw new Error(`Panel handoff ${observed.status}; observer job ${job.jobId} remains the exact handle`);
  await unlink(paths.handoff);
  return { jobId: job.jobId, binding, deadlineAt, url: observed.value };
}
export async function serveTaskProgressPanel(stateRoot: string, id: string): Promise<void> {
  const paths = launchPaths(stateRoot, id);
  const spec = parseSpec(JSON.parse(await readBoundedFile(paths.spec, stateRoot, 8192, undefined, true)));
  await exactRun(stateRoot, spec.binding);
  await createTaskSession(stateRoot, spec.binding);
  const panel = await startTaskProgressPanel({ stateRoot, binding: spec.binding, deadlineAt: spec.deadlineAt });
  try {
    await writeAtomicPrivateFile(paths.handoff, JSON.stringify({ url: panel.url, deadlineAt: spec.deadlineAt }), 8192, stateRoot, { exclusive: true });
    await new Promise<void>((resolve) => { const timer = setTimeout(resolve, Math.max(1, spec.deadlineAt - Date.now()));
      const finish = () => { clearTimeout(timer); resolve(); }; process.once("SIGTERM", finish); process.once("SIGINT", finish); });
  } finally {
    await panel.dispose();
    await unlink(paths.handoff).catch(() => {});
    await unlink(paths.spec).catch(() => {});
  }
}
