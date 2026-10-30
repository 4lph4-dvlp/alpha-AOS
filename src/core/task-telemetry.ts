import type { HarnessId } from "../types.js";
import type { TaskAgentPolicy, TaskResourcePolicy } from "./task-contract.js";

export interface NormalizedTelemetry {
  harness: HarnessId;
  status: "measured" | "unmetered";
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  durationMs: number | null;
  modelId: string | null;
  cachedInputTokens: number | null;
  uncachedInputTokens: number | null;
  reasoningTokens: number | null;
  reasoningIncludedInOutput: boolean | null;
  nativeSessionId?: string | null;
  aggregation?: "dispatch" | "session-cumulative";
  observedModelCalls?: number | null;
}

export const HARNESS_TELEMETRY_CAPABILITIES: Record<
  HarnessId,
  { metersTokens: boolean; metersCost: boolean }
> = {
  claude: { metersTokens: true, metersCost: true },
  codex: { metersTokens: true, metersCost: false },
  antigravity: { metersTokens: true, metersCost: false },
  pi: { metersTokens: false, metersCost: false },
  hermes: { metersTokens: true, metersCost: false },
};

export function normalizeHarnessTelemetry(harness: HarnessId, raw: unknown): NormalizedTelemetry {
  if (typeof raw !== "object" || raw === null) {
    return {
      harness,
      status: "unmetered",
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costUsd: null,
      durationMs: null,
      modelId: null,
      cachedInputTokens: null,
      uncachedInputTokens: null,
      reasoningTokens: null,
      reasoningIncludedInOutput: null,
    };
  }

  const data = raw as Record<string, unknown>;
  const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];

  const parseNum = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

  const promptTokens = caps?.metersTokens
    ? parseNum(data.promptTokens ?? (data.usage as any)?.input_tokens ?? (data.tokens as any)?.prompt)
    : null;
  const completionTokens = caps?.metersTokens
    ? parseNum(data.completionTokens ?? (data.usage as any)?.output_tokens ?? (data.tokens as any)?.completion)
    : null;
  let totalTokens = caps?.metersTokens
    ? parseNum(data.totalTokens ?? (data.usage as any)?.total_tokens ?? (data.tokens as any)?.total)
    : null;

  if (totalTokens === null && promptTokens !== null && completionTokens !== null) {
    totalTokens = promptTokens + completionTokens;
  }

  // Cost: Only recorded if harness capability meters cost. NEVER default to 0 or 0.00 USD (D-13, D-15).
  const rawCost = parseNum(data.costUsd ?? data.cost);
  const costUsd = caps?.metersCost ? rawCost : null;

  const durationMs = parseNum(data.durationMs ?? data.duration);
  const modelId = typeof data.modelId === "string" ? data.modelId : typeof data.model === "string" ? data.model : null;
  const native = data.usage as Record<string, unknown> | undefined;
  const cached = caps.metersTokens ? parseNum(data.cachedInputTokens ?? native?.cached_input_tokens ?? native?.cache_read_input_tokens) : null;
  const cachedInputTokens = cached !== null && promptTokens !== null && cached <= promptTokens ? cached : null;
  const reasoningTokens = caps.metersTokens ? parseNum(data.reasoningTokens ?? native?.reasoning_output_tokens) : null;

  const isMeasured = promptTokens !== null || completionTokens !== null || totalTokens !== null || costUsd !== null;

  return {
    harness,
    status: isMeasured ? "measured" : "unmetered",
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    durationMs,
    modelId,
    cachedInputTokens,
    uncachedInputTokens: promptTokens !== null && cachedInputTokens !== null ? promptTokens - cachedInputTokens : null,
    reasoningTokens,
    reasoningIncludedInOutput: harness === "codex" ? true : null,
  };
}

export interface TelemetryReadiness {
  ready: boolean;
  missingMeters: string[];
}

export function checkCostMeterReadiness(
  agentPolicy: TaskAgentPolicy,
  resourcePolicy?: TaskResourcePolicy | {
    maxCostUsd?: number | null;
    maxCycles?: number | null;
    maxTokens?: number | null;
    maxWallTimeMinutes?: number | null;
  }
): TelemetryReadiness {
  if (!resourcePolicy || (resourcePolicy.maxCostUsd == null && resourcePolicy.maxTokens == null)) {
    return { ready: true, missingMeters: [] };
  }

  const missingMeters: string[] = [];
  const roles: Array<"controller" | "executor" | "reviewer"> = ["controller", "executor", "reviewer"];

  for (const role of roles) {
    const harness = agentPolicy[role];
    const cap = HARNESS_TELEMETRY_CAPABILITIES[harness];
    if (resourcePolicy.maxTokens != null && (!cap || !cap.metersTokens)) {
      missingMeters.push(
        `${role} ${harness}: does not measure token consumption, required by maxTokens (MISSING_TELEMETRY_METER, D-14)`
      );
    }
    if (resourcePolicy.maxCostUsd != null && (!cap || !cap.metersCost)) {
      missingMeters.push(
        `${role} ${harness}: does not measure USD cost, required by maxCostUsd (MISSING_TELEMETRY_METER, D-14)`
      );
    }
  }

  return {
    ready: missingMeters.length === 0,
    missingMeters,
  };
}

/** One canonical native meter per session; cumulative samples are watermarks,
 * response samples have stable provider response IDs. Never combine both meters
 * for the same session. Parent aggregate meters suppress their descendants. */
export interface TaskUsageObservation {
  contractDigest: string;
  runId: string;
  attemptId: string;
  sessionId: string;
  parentSessionId: string | null;
  role: "controller" | "executor" | "reviewer" | "subagent" | "management";
  model: string | null;
  effort: string | null;
  tier: string | null;
  source: string;
  mode: "cumulative" | "response";
  scope: "self" | "includes-children";
  observationId: string;
  sequence: number;
  observedModelCalls: number | null;
  granularity: "model-call" | "turn" | "session";
  telemetry: NormalizedTelemetry;
}

export interface TaskUsageTotals {
  tokens: number | null;
  knownTokens: number;
  costUsd: number | null;
  knownCostUsd: number;
  observedModelCalls: number | null;
  sessions: number;
  excludedDescendants: number;
  byRole: Partial<Record<TaskUsageObservation["role"], number>>;
}

export function aggregateTaskUsage(observations: readonly TaskUsageObservation[]): TaskUsageTotals {
  const sessions = new Map<string, TaskUsageObservation[]>();
  const seen = new Map<string, string>();
  const identities = new Set(observations.map((o) => o.contractDigest));
  if (identities.size > 1) throw new Error("Usage contract identity mismatch");
  for (const observation of observations) {
    if (!Number.isSafeInteger(observation.sequence) || observation.sequence < 0 || !observation.sessionId || !observation.observationId) {
      throw new Error("Invalid usage observation identity or sequence");
    }
    for (const value of [observation.telemetry.totalTokens, observation.telemetry.costUsd, observation.observedModelCalls]) {
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("Invalid usage counter");
    }
    const key = JSON.stringify([observation.sessionId, observation.source, observation.observationId]);
    const content = JSON.stringify({ ...observation, runId: undefined, attemptId: undefined });
    if (seen.has(key)) {
      if (seen.get(key) !== content) throw new Error("Contradictory replayed usage observation");
      continue;
    }
    seen.set(key, content);
    const values = sessions.get(observation.sessionId) ?? [];
    if (values.some((prior) => prior.source !== observation.source || prior.mode !== observation.mode ||
      prior.scope !== observation.scope || prior.parentSessionId !== observation.parentSessionId)) {
      throw new Error("Overlapping or inconsistent session meters; reconcile canonical source before accounting");
    }
    values.push(observation);
    sessions.set(observation.sessionId, values);
  }
  const totals: TaskUsageTotals = { tokens: 0, knownTokens: 0, costUsd: 0, knownCostUsd: 0,
    observedModelCalls: 0, sessions: sessions.size, excludedDescendants: 0, byRole: {} };
  for (const [sessionId, samples] of sessions) {
    let ancestor = samples[0]!.parentSessionId;
    const visited = new Set([sessionId]);
    let excluded = false;
    while (ancestor !== null) {
      if (visited.has(ancestor)) throw new Error("Cycle in native usage session ancestry");
      visited.add(ancestor);
      const parent = sessions.get(ancestor)?.[0];
      if (!parent) break;
      if (parent.scope === "includes-children") excluded = true;
      ancestor = parent.parentSessionId;
    }
    if (excluded) { totals.excludedDescendants++; continue; }
    samples.sort((a, b) => a.sequence - b.sequence);
    if (samples[0]!.mode === "cumulative") {
      for (let i = 1; i < samples.length; i++) {
        const prior = samples[i - 1]!, current = samples[i]!;
        for (const field of ["promptTokens", "completionTokens", "totalTokens", "cachedInputTokens", "reasoningTokens", "costUsd"] as const) {
          const previous = prior.telemetry[field], next = current.telemetry[field];
          if (previous !== null && (next === null || next < previous)) throw new Error("Native cumulative usage counter regressed");
        }
        if (current.sequence === prior.sequence && JSON.stringify(current.telemetry) !== JSON.stringify(prior.telemetry)) {
          throw new Error("Contradictory cumulative usage sequence");
        }
      }
    }
    const selected = samples[0]!.mode === "cumulative" ? [samples.at(-1)!] : samples;
    for (const sample of selected) {
      const meter = sample.telemetry;
      if (meter.totalTokens === null) totals.tokens = null;
      else { totals.knownTokens += meter.totalTokens; totals.byRole[sample.role] = (totals.byRole[sample.role] ?? 0) + meter.totalTokens; }
      if (meter.costUsd === null) totals.costUsd = null;
      else totals.knownCostUsd += meter.costUsd;
      if (sample.observedModelCalls === null) totals.observedModelCalls = null;
      else if (totals.observedModelCalls !== null) totals.observedModelCalls += sample.observedModelCalls;
    }
  }
  if (totals.tokens !== null) totals.tokens = totals.knownTokens;
  if (totals.costUsd !== null) totals.costUsd = totals.knownCostUsd;
  return totals;
}
