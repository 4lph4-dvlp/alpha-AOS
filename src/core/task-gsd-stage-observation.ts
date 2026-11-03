import { createHash } from "node:crypto";
import type { RedactedExcerpt } from "../types.js";
import type { TaskAgentPolicy } from "./task-contract.js";
import {
  MAX_ARTIFACT_REFS_PER_RECEIPT,
  MAX_RELATIVE_PATH_LENGTH,
  MAX_STAGE_DETAIL_LENGTH,
  type GsdArtifactReference,
  type GsdQuickStage,
  type GsdStageOutcome,
} from "./task-gsd-stages.js";

export interface GsdStageObservationCapability {
  readonly supported: boolean;
  readonly harness: string;
  readonly source: string;
  readonly sourceVersion: string | null;
  readonly reason?: string | undefined;
}

export interface ObservedNativeStageResult {
  readonly stage: GsdQuickStage;
  readonly invocationId: string;
  readonly invocationDigest: string;
  readonly resultId: string;
  readonly resultDigest: string;
  readonly outcome: GsdStageOutcome;
  readonly inputArtifacts: readonly GsdArtifactReference[];
  readonly outputArtifacts: readonly GsdArtifactReference[];
  readonly evaluatedCommit: string | null;
  readonly detail?: string | null | undefined;
  readonly observedAt: string;
}

export interface CodexStageObservationResult {
  readonly status: "observed" | "unsupported" | "partial" | "failed";
  readonly sessionId: string | null;
  readonly stages: readonly ObservedNativeStageResult[];
  readonly reason?: string | undefined;
}

interface RawInvocationEvent {
  readonly id: string;
  readonly stage: GsdQuickStage;
  readonly sessionId: string;
  readonly rawJson: string;
  readonly arguments?: Record<string, unknown> | undefined;
  readonly evaluatedCommit?: string | null | undefined;
}

interface RawResultEvent {
  readonly id: string;
  readonly callId: string;
  readonly sessionId: string;
  readonly rawJson: string;
  readonly outcome: GsdStageOutcome;
  readonly inputArtifacts: GsdArtifactReference[];
  readonly outputArtifacts: GsdArtifactReference[];
  readonly detail?: string | null | undefined;
}

function normalizeStageName(name: string): GsdQuickStage | null {
  const lower = name.toLowerCase();
  if (lower.includes("discuss") || lower === "discussion") return "discussion";
  if (lower.includes("research")) return "research";
  if (lower.includes("plan-check") || lower.includes("plan_check") || lower.includes("check_plan") || lower.includes("checker")) return "plan-check";
  if (lower.includes("plan") || lower === "planning" || lower.includes("planner")) return "planning";
  if (lower.includes("impl") || lower.includes("execute") || lower === "implementation" || lower.includes("executor")) return "implementation";
  if (lower.includes("verify") || lower.includes("verification") || lower.includes("verifier")) return "verification";
  if (lower.includes("docs") || lower.includes("state") || lower === "state-docs") return "state-docs";
  if (lower.includes("review") || lower === "code-review") return "code-review";
  return null;
}

function parseOutcome(output: unknown): GsdStageOutcome {
  if (typeof output === "object" && output !== null) {
    const rec = output as Record<string, unknown>;
    if (rec.outcome === "failed" || rec.passed === false || rec.success === false || rec.verdict === "fail" || rec.status === "failed") return "failed";
    if (rec.status === "needs-input" || rec.needsInput === true) return "needs-input";
    if (typeof rec.outcome === "string") {
      const o = rec.outcome.toLowerCase();
      if (["passed", "failed", "skipped", "needs-input", "unknown"].includes(o)) {
        return o as GsdStageOutcome;
      }
    }
    if (rec.passed === true || rec.success === true || rec.verdict === "pass" || rec.status === "completed") return "passed";
    if (rec.status === "skipped") return "skipped";
  }
  if (typeof output === "string") {
    const s = output.toLowerCase().replace(/\b0\s+(?:failed|errors?)\b|\b(?:failed|errors?)\s*:\s*0\b/gu, "");
    if (/\b(?:failed|errors?)\b|\b(?:not|never)\b[^.;\n]*\bpass(?:ed)?\b/u.test(s)) return "failed";
    if (s.includes("needs input") || s.includes("clarification needed")) return "needs-input";
    if (/\bpassed\b/u.test(s.replace(/\b0\s+passed\b|\bpassed\s*:\s*0\b/gu, "")) || s.includes("status: completed")) return "passed";
  }
  return "unknown";
}

function extractArtifacts(data: unknown): GsdArtifactReference[] {
  const refs: GsdArtifactReference[] = [];
  if (data === undefined) return refs;
  if (typeof data !== "object" || data === null) throw new Error("Invalid native artifact metadata");

  const rec = data as Record<string, unknown>;
  const list = Array.isArray(data)
    ? data
    : Array.isArray(rec.artifacts)
      ? rec.artifacts
      : Array.isArray(rec.files)
        ? rec.files
        : [];

  if ((!Array.isArray(data) && rec.artifacts !== undefined && !Array.isArray(rec.artifacts))
    || (rec.files !== undefined && !Array.isArray(rec.files))
    || list.length > MAX_ARTIFACT_REFS_PER_RECEIPT) throw new Error("Invalid or excessive native artifact references");

  for (const item of list) {
    if (typeof item === "object" && item !== null) {
      const art = item as Record<string, unknown>;
      if (typeof art.path === "string" && typeof art.sha256 === "string" && /^[0-9a-f]{64}$/u.test(art.sha256)) {
        if (art.path.length > 0 && art.path.length <= MAX_RELATIVE_PATH_LENGTH) {
          refs.push({ path: art.path, sha256: art.sha256 });
          continue;
        }
      }
    }
    throw new Error("Invalid native artifact reference");
  }

  // Also check direct path/hash on the record itself
  if (rec.path !== undefined || rec.sha256 !== undefined) {
    if (typeof rec.path === "string" && rec.path.length > 0 && rec.path.length <= MAX_RELATIVE_PATH_LENGTH
      && typeof rec.sha256 === "string" && /^[0-9a-f]{64}$/u.test(rec.sha256) && refs.length < MAX_ARTIFACT_REFS_PER_RECEIPT) {
      refs.push({ path: rec.path, sha256: rec.sha256 });
    } else throw new Error("Invalid or excessive native artifact reference");
  }

  return refs;
}

export function observeCodexStages(
  stdout: RedactedExcerpt | string,
  options: {
    projectRoot: string;
    outputCapped?: boolean | undefined;
    expectedModel?: string | undefined;
    expectedEffort?: string | undefined;
  },
): CodexStageObservationResult {
  const text = typeof stdout === "string" ? stdout : stdout.excerpt;
  const isCapped = typeof stdout === "string" ? Boolean(options.outputCapped) : (stdout.capped || options.outputCapped);

  if (isCapped) {
    return {
      status: "partial",
      sessionId: null,
      stages: [],
      reason: "Codex event stream was capped before full completion",
    };
  }

  let threadId: string | null = null;
  const invocationsById = new Map<string, RawInvocationEvent>();
  const resultsByCallId = new Map<string, RawResultEvent>();
  const invocationOrder: string[] = [];
  const duplicateIds = new Set<string>();
  const sessionIdsSeen = new Set<string>();

  const lines = text.split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }

    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
      sessionIdsSeen.add(threadId);
      continue;
    }

    if (event.type === "turn_context") {
      const payload = event.payload as Record<string, unknown> | undefined;
      const model = typeof payload?.model === "string" ? payload.model : undefined;
      const effort = typeof payload?.effort === "string" ? payload.effort : (typeof payload?.reasoning_effort === "string" ? payload.reasoning_effort : undefined);

      if (options.expectedModel && model && model !== options.expectedModel) {
        return {
          status: "unsupported",
          sessionId: threadId,
          stages: [],
          reason: `Observed turn model ${model} does not match expected approved model ${options.expectedModel}`,
        };
      }
      if (options.expectedEffort && effort && effort !== options.expectedEffort) {
        return {
          status: "unsupported",
          sessionId: threadId,
          stages: [],
          reason: `Observed turn effort ${effort} does not match expected approved effort ${options.expectedEffort}`,
        };
      }
      continue;
    }

    const currentSession = (typeof event.session_id === "string" ? event.session_id : (typeof event.thread_id === "string" ? event.thread_id : threadId)) ?? "default-thread";
    sessionIdsSeen.add(currentSession);

    // 1. Check for stage tool invocation
    let invocation: { id: string; stage: GsdQuickStage; args?: Record<string, unknown> | undefined; commit?: string | null | undefined } | null = null;

    if (event.type === "item.created" || event.type === "item.completed") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item && (item.type === "function_call" || item.type === "tool_call")) {
        const name = String(item.name ?? "");
        const stage = normalizeStageName(name);
        const id = String(item.id ?? item.call_id ?? "");
        if (stage && id) {
          let args: Record<string, unknown> | undefined;
          if (typeof item.arguments === "string") {
            try {
              const parsed = JSON.parse(item.arguments) as unknown;
              if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid arguments");
              args = parsed as Record<string, unknown>;
            } catch {
              return { status: "failed", sessionId: threadId, stages: [], reason: "Malformed native invocation arguments" };
            }
          } else if (typeof item.arguments === "object" && item.arguments !== null) {
            args = item.arguments as Record<string, unknown>;
          }
          const commit = typeof args?.evaluatedCommit === "string" ? args.evaluatedCommit : null;
          invocation = { id, stage, args, commit };
        }
      }
    } else if (event.type === "tool_invocation") {
      const name = String(event.name ?? event.tool ?? "");
      const stage = normalizeStageName(name);
      const id = String(event.id ?? event.invocation_id ?? "");
      if (stage && id) {
        const args = typeof event.arguments === "object" && event.arguments !== null ? (event.arguments as Record<string, unknown>) : undefined;
        const commit = typeof args?.evaluatedCommit === "string" ? args.evaluatedCommit : null;
        invocation = { id, stage, args, commit };
      }
    } else if (event.type === "stage_invocation") {
      const stage = normalizeStageName(String(event.stage ?? ""));
      const id = String(event.id ?? event.invocation_id ?? "");
      if (stage && id) {
        const args = typeof event.arguments === "object" && event.arguments !== null ? (event.arguments as Record<string, unknown>) : undefined;
        invocation = { id, stage, args, commit: typeof event.evaluatedCommit === "string" ? event.evaluatedCommit : null };
      }
    }

    if (invocation) {
      if (invocationsById.has(invocation.id)) {
        duplicateIds.add(invocation.id);
      } else {
        invocationsById.set(invocation.id, {
          id: invocation.id,
          stage: invocation.stage,
          sessionId: currentSession,
          rawJson: trimmed,
          arguments: invocation.args,
          evaluatedCommit: invocation.commit,
        });
        invocationOrder.push(invocation.id);
      }
      continue;
    }

    // 2. Check for stage tool result
    let result: { id: string; callId: string; output: unknown } | null = null;

    if (event.type === "item.created" || event.type === "item.completed") {
      const item = event.item as Record<string, unknown> | undefined;
      if (item && (item.type === "function_call_output" || item.type === "tool_result")) {
        const callId = String(item.call_id ?? item.invocation_id ?? "");
        const id = String(item.id ?? `res-${callId}`);
        if (callId) {
          result = { id, callId, output: item.output };
        }
      }
    } else if (event.type === "tool_result") {
      const callId = String(event.call_id ?? event.invocation_id ?? "");
      const id = String(event.id ?? `res-${callId}`);
      if (callId) {
        result = { id, callId, output: event.output };
      }
    } else if (event.type === "stage_result") {
      const callId = String(event.call_id ?? event.invocation_id ?? "");
      const id = String(event.id ?? `res-${callId}`);
      if (callId) {
        result = { id, callId, output: event.output ?? event };
      }
    }

    if (result) {
      if (typeof result.output === "string" && /^[\s]*[\[{]/u.test(result.output)) {
        try { result.output = JSON.parse(result.output) as unknown; }
        catch { return { status: "failed", sessionId: threadId, stages: [], reason: "Malformed native tool result JSON" }; }
      }
      if (resultsByCallId.has(result.callId)) {
        duplicateIds.add(result.callId);
      } else {
        const outcome = parseOutcome(result.output);
        let detail: string | null = null;
        if (typeof result.output === "object" && result.output !== null) {
          const rec = result.output as Record<string, unknown>;
          if (typeof rec.detail === "string") detail = rec.detail.slice(0, MAX_STAGE_DETAIL_LENGTH);
          else if (typeof rec.reason === "string") detail = rec.reason.slice(0, MAX_STAGE_DETAIL_LENGTH);
        } else if (typeof result.output === "string") {
          detail = result.output.slice(0, MAX_STAGE_DETAIL_LENGTH);
        }

        let inputArtifacts: GsdArtifactReference[], outputArtifacts: GsdArtifactReference[];
        try {
          const record = typeof result.output === "object" && result.output !== null ? result.output as Record<string, unknown> : undefined;
          inputArtifacts = extractArtifacts(record?.inputArtifacts ?? record?.inputs);
          outputArtifacts = extractArtifacts(record?.outputArtifacts ?? record?.outputs ?? record);
        } catch {
          return { status: "failed", sessionId: threadId, stages: [], reason: "Invalid or excessive native artifact references" };
        }

        resultsByCallId.set(result.callId, {
          id: result.id,
          callId: result.callId,
          sessionId: currentSession,
          rawJson: trimmed,
          outcome,
          inputArtifacts,
          outputArtifacts,
          detail,
        });
      }
    }
  }

  // Replay / duplicate validation
  if (duplicateIds.size > 0) {
    return {
      status: "failed",
      sessionId: threadId,
      stages: [],
      reason: `Duplicate invocation/result IDs observed: ${[...duplicateIds].join(", ")}`,
    };
  }

  // Correlate invocations and results
  const stages: ObservedNativeStageResult[] = [];
  for (const invId of invocationOrder) {
    const inv = invocationsById.get(invId)!;
    const res = resultsByCallId.get(invId);

    if (!res) {
      return {
        status: "partial",
        sessionId: threadId,
        stages: [],
        reason: `Missing result for observed stage invocation ${inv.stage} (call id ${inv.id})`,
      };
    }

    if (inv.sessionId !== res.sessionId) {
      return {
        status: "failed",
        sessionId: threadId,
        stages: [],
        reason: `Mixed session ancestry: invocation in ${inv.sessionId} but result in ${res.sessionId}`,
      };
    }

    const invocationDigest = createHash("sha256").update(inv.rawJson, "utf8").digest("hex");
    const resultDigest = createHash("sha256").update(res.rawJson, "utf8").digest("hex");

    // Inherit input artifacts from invocation arguments if present
    const inputs = [...res.inputArtifacts];
    if (inv.arguments) {
      let invInputs: GsdArtifactReference[];
      try { invInputs = extractArtifacts(inv.arguments); }
      catch { return { status: "failed", sessionId: threadId, stages: [], reason: "Invalid or excessive invocation artifact references" }; }
      for (const item of invInputs) {
        const existing = inputs.find((value) => value.path === item.path);
        if (existing && existing.sha256 !== item.sha256) {
          return { status: "failed", sessionId: threadId, stages: [], reason: "Conflicting invocation and result artifact bindings" };
        }
        if (!existing) {
          inputs.push(item);
        }
      }
    }
    if (inputs.length > MAX_ARTIFACT_REFS_PER_RECEIPT) {
      return { status: "failed", sessionId: threadId, stages: [], reason: "Excessive combined input artifact references" };
    }

    stages.push({
      stage: inv.stage,
      invocationId: inv.id,
      invocationDigest,
      resultId: res.id,
      resultDigest,
      outcome: res.outcome,
      inputArtifacts: inputs,
      outputArtifacts: res.outputArtifacts,
      evaluatedCommit: inv.evaluatedCommit ?? null,
      detail: res.detail,
      observedAt: new Date().toISOString(),
    });
  }

  return {
    status: stages.length > 0 ? "observed" : "unsupported",
    sessionId: threadId,
    stages,
    reason: stages.length === 0 ? "No native GSD stages observed in the event stream" : undefined,
  };
}

export function codexStageObservationCapability(policy: TaskAgentPolicy): GsdStageObservationCapability {
  if (policy.controller !== "codex") {
    return {
      supported: false,
      harness: policy.controller,
      source: "codex-stdout-observer",
      sourceVersion: null,
      reason: `Harness ${policy.controller} does not provide native full stage observation`,
    };
  }

  return {
    supported: true,
    harness: "codex",
    source: "codex-stdout-observer",
    sourceVersion: "0.110.0",
  };
}
