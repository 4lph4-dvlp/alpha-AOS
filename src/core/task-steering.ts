import type { TaskSessionBinding } from "./task-session.js";

export interface TaskSteeringProposal {
  schemaVersion: 1;
  binding: TaskSessionBinding;
  requestId: string;
  submittedAt: string;
  text: string;
  evidenceIds?: string[];
}
export async function submitTaskSteering(_options: { stateRoot: string; proposal: TaskSteeringProposal }): Promise<{ state: string; digest: string }> {
  return { state: "unimplemented", digest: "" };
}
export async function readTaskSteering(_options: { stateRoot: string; binding: TaskSessionBinding }): Promise<{ state: string; digest: string }[]> {
  return [];
}
