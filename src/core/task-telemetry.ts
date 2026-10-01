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
    };
  }

  const data = raw as Record<string, unknown>;
  const caps = HARNESS_TELEMETRY_CAPABILITIES[harness];

  const parseNum = (v: unknown): number | null =>
    typeof v === "number" && !Number.isNaN(v) && v >= 0 ? v : null;

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
