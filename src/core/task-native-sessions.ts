import { createReadStream } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { assertNoSymlinksInPathAndAncestors } from "./command-jobs.js";
import { normalizeHarnessTelemetry, type TaskUsageObservation } from "./task-telemetry.js";

/** Read only exact native session ancestry. Never emit conversations or attach
 * unrelated sessions by cwd alone. Bounds are explicit failures, never zero. */
export async function collectCodexSessionFamily(options: {
  sessionId: string; projectRoot: string; contractDigest: string; runId: string; attemptId: string;
  role: TaskUsageObservation["role"]; sessionRoot?: string | undefined; now?: Date | undefined;
}): Promise<TaskUsageObservation[] | null> {
  if (!/^[a-f0-9-]{36}$/u.test(options.sessionId)) return null;
  const sessionRoot = options.sessionRoot ?? join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "sessions");
  const now = options.now ?? new Date();
  const days = new Set([now.toISOString().slice(0, 10)]);
  if (options.sessionId[14] === "7") {
    const created = new Date(Number.parseInt(options.sessionId.replaceAll("-", "").slice(0, 12), 16));
    if (Number.isFinite(created.getTime())) days.add(created.toISOString().slice(0, 10));
  }
  const candidates = new Map<string, { path: string; parent: string | null }>();
  let visited = 0;
  for (const day of days) {
    const directory = join(sessionRoot, ...day.split("-"));
    await assertNoSymlinksInPathAndAncestors(directory);
    let files;
    try { files = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".jsonl")) continue;
      if (++visited > 5000) throw new Error("Native session discovery bound exceeded; usage coverage unknown");
      const path = join(directory, file.name);
      const handle = await open(path, "r");
      let meta: any;
      try {
        const buffer = Buffer.alloc(256 * 1024);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        const text = buffer.subarray(0, bytesRead).toString("utf8").replace(/^\uFEFF/u, "");
        const first = text.split("\n", 1)[0]!;
        if (Buffer.byteLength(first) >= buffer.length) continue;
        const event = JSON.parse(first);
        if (event.type !== "session_meta") continue;
        meta = event.payload;
      } catch { continue; } finally { await handle.close(); }
      if (typeof meta?.id !== "string" || typeof meta?.cwd !== "string" || resolve(meta.cwd).toLowerCase() !== resolve(options.projectRoot).toLowerCase()) continue;
      const parent = meta.source?.subagent?.thread_spawn?.parent_thread_id ?? meta.parent_thread_id ?? null;
      candidates.set(meta.id, { path, parent: typeof parent === "string" ? parent : null });
    }
  }
  if (!candidates.has(options.sessionId)) return null;
  const included = new Set([options.sessionId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const [id, entry] of candidates) if (entry.parent && included.has(entry.parent) && !included.has(id)) { included.add(id); changed = true; }
  }
  if (included.size > 32) throw new Error("Native session family exceeds receipt bound; usage coverage unknown");
  const observations: TaskUsageObservation[] = [];
  for (const id of included) {
    const entry = candidates.get(id)!;
    let last: ReturnType<typeof normalizeHarnessTelemetry> | null = null;
    let lineNumber = 0, lastLine = 0, observedCalls = 0;
    const models = new Set<string>(), efforts = new Set<string>();
    const lines = createInterface({ input: createReadStream(entry.path), crlfDelay: Infinity });
    for await (const line of lines) {
      if (++lineNumber > 1_000_000) { lines.close(); throw new Error("Native session line bound exceeded"); }
      if (Buffer.byteLength(line) > 1024 * 1024) continue;
      let event: any;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === "turn_context") {
        if (typeof event.payload?.model === "string") models.add(event.payload.model);
        const effort = event.payload?.effort ?? event.payload?.reasoning_effort;
        if (typeof effort === "string") efforts.add(effort);
      }
      if (event.type !== "event_msg" || event.payload?.type !== "token_count") continue;
      const raw = event.payload.info?.total_token_usage;
      const meter = normalizeHarnessTelemetry("codex", { usage: raw });
      if (meter.totalTokens === null) continue;
      if (last?.totalTokens !== null && last?.totalTokens !== undefined && meter.totalTokens < last.totalTokens) throw new Error("Native session usage counter regressed");
      if (meter.totalTokens > (last?.totalTokens ?? 0)) observedCalls++;
      last = meter; lastLine = lineNumber;
    }
    observations.push({ contractDigest: options.contractDigest, runId: options.runId, attemptId: options.attemptId,
      sessionId: id, parentSessionId: id === options.sessionId ? null : entry.parent,
      role: id === options.sessionId ? options.role : "subagent", model: models.size === 1 ? [...models][0]! : null,
      effort: efforts.size === 1 ? [...efforts][0]! : null, tier: null, source: "codex-session-token-count",
      mode: "cumulative", scope: "self", observationId: `${id}:${lastLine}`, sequence: lastLine,
      observedModelCalls: last === null ? null : observedCalls, granularity: "model-call",
      telemetry: last ?? normalizeHarnessTelemetry("codex", null) });
  }
  return observations;
}
