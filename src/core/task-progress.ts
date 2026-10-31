import type { TaskDispatchObservation } from "./task-runtime.js";
import type { TaskSessionEventInput } from "./task-session.js";
import type { TaskRunRecord } from "./task-run.js";
import { createHash } from "node:crypto";
import { STRUCTURAL_CREDENTIAL_PATTERNS } from "./command-jobs.js";

function safeDetail(value: string | null | undefined, max: number): string | null {
  if (value == null) return null;
  if (value.length > max || /[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value) ||
    STRUCTURAL_CREDENTIAL_PATTERNS.some((pattern) => pattern.test(JSON.stringify(value))) ||
    /(?:[a-zA-Z]:[\\/]|\\\\|(?:^|[\s"])\/(?!\/)[^\s"]|\b(?:password|passwd|token|api[_-]?key|secret|authorization)\s*[=:]\s*\S+|:\/\/)/iu.test(value)) return "Detail unavailable";
  return value;
}

/** Project recorded dispatch evidence without deriving lifecycle acceptance. */
export function projectTaskProgress(record: TaskDispatchObservation, workflow: string | undefined): TaskSessionEventInput {
  const actualWorkflow = workflow && ["gsd-quick", "gsd", "gsd-multi-phase", "generic-connector"].includes(workflow) ? workflow : null;
  return { sourceEventId: `${record.dispatchId}:${record.finishedAt === null ? "start" : "end"}`,
    observedAt: record.finishedAt ?? record.startedAt, kind: record.finishedAt === null ? "dispatch-start" : "dispatch-end",
    workflow: actualWorkflow, step: null, role: record.role, configuredModel: safeDetail(record.model, 128), configuredEffort: safeDetail(record.effort, 128),
    observedModel: safeDetail(record.telemetry.modelId, 128), observedEffort: null, outcome: record.status,
    processState: record.closeConfirmed === true ? "confirmed-closed" : record.closeConfirmed === false ? "unconfirmed" : "unknown",
    recordedReason: safeDetail(record.reason, 512), evidenceRefs: [record.dispatchId] };
}

export function projectGsdStep(input: { phaseId: string; attemptId: string; workflow: string | undefined; step: string; at: string; outcome: "running" | "completed" | "failed" | "needs-input"; evidenceRefs: readonly string[] }): TaskSessionEventInput {
  const phaseHash = createHash("sha256").update(input.phaseId).digest("hex");
  return { sourceEventId: `gsd:${phaseHash}:${input.attemptId}:${input.outcome === "running" ? "start" : "end"}`,
    observedAt: input.at, kind: input.outcome === "running" ? "gsd-step-start" : "gsd-step-end", workflow: input.workflow === "gsd" || input.workflow === "gsd-multi-phase" ? input.workflow : null,
    step: safeDetail(`${input.phaseId.slice(0, 100)}: ${input.step}`, 128), role: null, configuredModel: null, configuredEffort: null,
    observedModel: null, observedEffort: null, outcome: input.outcome, processState: null, recordedReason: null,
    evidenceRefs: input.evidenceRefs.slice(0, 16) };
}

export function projectRunOutcome(record: TaskRunRecord): TaskSessionEventInput | null {
  if (record.status === "executing" || record.finishedAt === null) return null;
  return { sourceEventId: `run:${record.runId}:${record.status}`, observedAt: record.finishedAt, kind: "run-outcome", workflow: null,
    step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: record.status, processState: null, recordedReason: safeDetail(record.stopReason, 512), evidenceRefs: [record.runId] };
}

export function projectRecordedDecisions(record: TaskRunRecord): TaskSessionEventInput[] {
  if (record.decisionLog?.status !== "valid") return [];
  return record.decisions.map((decision) => ({ sourceEventId: `decision:${createHash("sha256").update(decision.id).digest("hex")}`,
    observedAt: decision.at, kind: "decision", workflow: null, step: safeDetail(decision.choice, 128), role: "controller",
    configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null, outcome: null,
    processState: null, recordedReason: safeDetail(decision.rationale, 512), evidenceRefs: [decision.id] }));
}
