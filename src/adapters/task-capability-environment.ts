import type { TaskContract } from "../core/task-contract.js";
import { selectStepObligations } from "../core/task-capability-obligations.js";

/** Credential names only, for capabilities the reviewed task actually requires. */
export function taskCapabilityEnvironmentNames(contract: TaskContract): string[] {
  if (contract.category !== "development") return [];
  const capabilities = new Set((["discuss", "plan", "execute", "review", "verify"] as const).flatMap((step) =>
    selectStepObligations({ contract, step, projectRoot: contract.scope.projectRoot }).filter((item) => item.required).map((item) => item.capabilityId)));
  return [
    ...(capabilities.has("documentation-lookup") ? ["CONTEXT7_API_KEY"] : []),
    ...(capabilities.has("deep-research") ? ["EXA_API_KEY", "FIRECRAWL_API_KEY", "FIRECRAWL_OAUTH_TOKEN"] : []),
  ];
}
