import { StringDecoder } from "node:string_decoder";
import { normalizeHarnessTelemetry, type NormalizedTelemetry } from "./task-telemetry.js";

/** Extract numeric usage independently of retained narrative output. Native
 * token_count is cumulative; completed-turn summaries must not be added to it. */
export class CodexUsageCollector {
  private decoder = new StringDecoder("utf8");
  private pending = "";
  private discarding = false;
  private cumulative: Record<string, number> | null = null;
  private turns: Record<string, number> = {};
  private seenTurns = new Set<string>();
  private calls: number | null = null;
  sessionId: string | null = null;
  failureMessage: string | null = null;
  terminal: "completed" | "failed" | "missing" = "missing";
  meter: NormalizedTelemetry = normalizeHarnessTelemetry("codex", null);
  constructor(private readonly observe?: ((meter: NormalizedTelemetry) => void) | undefined) {}

  push(chunk: Buffer): void {
    for (const part of this.decoder.write(chunk).split(/(?<=\n)/u)) {
      if (!this.discarding) this.pending += part;
      if (Buffer.byteLength(this.pending) > 64 * 1024) { this.pending = ""; this.discarding = true; }
      if (part.endsWith("\n")) {
        if (!this.discarding) this.line(this.pending);
        this.pending = "";
        this.discarding = false;
      }
    }
  }

  finish(): NormalizedTelemetry {
    this.pending += this.decoder.end();
    if (!this.discarding && this.pending.trim()) this.line(this.pending);
    this.pending = "";
    return this.meter;
  }

  get observedModelCalls(): number | null { return this.calls; }

  private line(line: string): void {
    let event: any;
    try { event = JSON.parse(line); } catch { return; }
    if (event?.type === "thread.started" && typeof event.thread_id === "string") {
      this.sessionId = event.thread_id;
      this.meter = { ...this.meter, nativeSessionId: this.sessionId };
      this.observe?.(this.meter);
    }
    if (event?.type === "turn.failed" || event?.type === "error") {
      this.terminal = "failed";
      const message = event.error?.message ?? event.error ?? event.message;
      if (typeof message === "string") this.failureMessage = message.slice(0, 400);
    }
    if (event?.type === "event_msg" && event.payload?.type === "token_count") {
      const raw = event.payload.info?.total_token_usage;
      if (raw && typeof raw === "object") {
        const next = normalizeHarnessTelemetry("codex", { usage: raw });
        if (next.totalTokens === null) return;
        if (this.cumulative && next.totalTokens < (this.meter.totalTokens ?? 0)) throw new Error("Native usage watermark regressed");
        if (next.totalTokens > (this.meter.totalTokens ?? 0)) this.calls = (this.calls ?? 0) + 1;
        this.cumulative = raw as Record<string, number>;
      }
    } else if (event?.type === "turn.completed") {
      this.terminal = "completed";
      this.failureMessage = null;
      const id = typeof event.turn_id === "string" ? event.turn_id : null;
      if (id !== null && this.seenTurns.has(id)) return;
      if (id !== null) this.seenTurns.add(id);
      const raw = event.usage;
      if (raw && typeof raw === "object") {
        for (const [key, value] of Object.entries(raw)) {
          if (typeof value === "number" && Number.isFinite(value) && value >= 0) this.turns[key] = (this.turns[key] ?? 0) + value;
        }
      }
    } else return;
    const next = normalizeHarnessTelemetry("codex", { usage: this.cumulative ?? this.turns });
    next.nativeSessionId = this.sessionId;
    next.aggregation = this.cumulative === null ? "dispatch" : "session-cumulative";
    next.observedModelCalls = this.calls;
    if (next.totalTokens !== null && JSON.stringify(next) !== JSON.stringify(this.meter)) {
      this.meter = next;
      this.observe?.(next);
    }
  }
}
