import type { TaskDispatchObservation } from "./task-runtime.js";
import type { TaskSessionEventInput } from "./task-session.js";
import type { TaskRunRecord } from "./task-run.js";
import { createHash } from "node:crypto";

/** Project recorded dispatch evidence without deriving lifecycle acceptance. */
export function projectTaskProgress(record: TaskDispatchObservation, workflow: string | undefined): TaskSessionEventInput {
  const actualWorkflow = workflow && ["gsd-quick", "gsd", "gsd-multi-phase", "generic-connector"].includes(workflow) ? workflow : null;
  return { sourceEventId: `${record.dispatchId}:${record.finishedAt === null ? "start" : "end"}`,
    observedAt: record.finishedAt ?? record.startedAt, kind: record.finishedAt === null ? "dispatch-start" : "dispatch-end",
    workflow: actualWorkflow, step: null, role: record.role, configuredModel: record.model, configuredEffort: record.effort ?? null,
    observedModel: record.telemetry.modelId, observedEffort: null, outcome: record.status,
    processState: record.closeConfirmed === true ? "confirmed-closed" : record.closeConfirmed === false ? "unconfirmed" : "unknown",
    recordedReason: record.reason, evidenceRefs: [record.dispatchId] };
}

export function projectGsdStep(input: { phaseId: string; attemptId: string; workflow: string | undefined; step: string; at: string; outcome: "running" | "completed" | "failed" | "needs-input"; evidenceRefs: readonly string[] }): TaskSessionEventInput {
  const phaseHash = createHash("sha256").update(input.phaseId).digest("hex");
  return { sourceEventId: `gsd:${phaseHash}:${input.attemptId}:${input.outcome === "running" ? "start" : "end"}`,
    observedAt: input.at, kind: input.outcome === "running" ? "gsd-step-start" : "gsd-step-end", workflow: input.workflow === "gsd" || input.workflow === "gsd-multi-phase" ? input.workflow : null,
    step: `${input.phaseId.slice(0, 100)}: ${input.step}`, role: null, configuredModel: null, configuredEffort: null,
    observedModel: null, observedEffort: null, outcome: input.outcome, processState: null, recordedReason: null,
    evidenceRefs: input.evidenceRefs.slice(0, 16) };
}

export function projectRunOutcome(record: TaskRunRecord): TaskSessionEventInput | null {
  if (record.status === "executing" || record.finishedAt === null) return null;
  return { sourceEventId: `run:${record.runId}:${record.status}`, observedAt: record.finishedAt, kind: "run-outcome", workflow: null,
    step: null, role: null, configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null,
    outcome: record.status, processState: null, recordedReason: record.stopReason, evidenceRefs: [record.runId] };
}

export function projectRecordedDecisions(record: TaskRunRecord): TaskSessionEventInput[] {
  if (record.decisionLog?.status !== "valid") return [];
  const shorten = (text: string, max: number) => text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  return record.decisions.map((decision) => ({ sourceEventId: `decision:${createHash("sha256").update(decision.id).digest("hex")}`,
    observedAt: decision.at, kind: "decision", workflow: null, step: shorten(decision.choice, 128), role: "controller",
    configuredModel: null, configuredEffort: null, observedModel: null, observedEffort: null, outcome: null,
    processState: null, recordedReason: shorten(decision.rationale, 512), evidenceRefs: [decision.id] }));
}
