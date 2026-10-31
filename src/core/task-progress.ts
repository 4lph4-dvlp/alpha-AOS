import type { TaskDispatchObservation } from "./task-runtime.js";
import type { TaskSessionEventInput } from "./task-session.js";

/** Project recorded dispatch evidence without deriving lifecycle acceptance. */
export function projectTaskProgress(record: TaskDispatchObservation, workflow: string | undefined): TaskSessionEventInput {
  const actualWorkflow = workflow && ["gsd-quick", "gsd", "gsd-multi-phase", "generic-connector"].includes(workflow) ? workflow : null;
  return { sourceEventId: `${record.dispatchId}:${record.finishedAt === null ? "start" : "end"}`,
    observedAt: record.finishedAt ?? record.startedAt, kind: record.finishedAt === null ? "dispatch-start" : "dispatch-end",
    workflow: actualWorkflow, step: null, role: record.role, configuredModel: record.model, configuredEffort: record.effort ?? null,
    observedModel: null, observedEffort: null, outcome: record.status,
    processState: record.closeConfirmed === true ? "confirmed-closed" : record.closeConfirmed === false ? "unconfirmed" : "unknown",
    recordedReason: record.reason, evidenceRefs: [record.dispatchId] };
}
