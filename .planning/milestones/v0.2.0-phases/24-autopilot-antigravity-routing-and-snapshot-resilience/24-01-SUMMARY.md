---
phase: 24-autopilot-antigravity-routing-and-snapshot-resilience
plan: 1
status: complete
requirements-completed:
  - AUTO-FIX-01
  - AUTO-FIX-05
---

# Summary: 24-01 Antigravity Model Tier Routing & Subagent Guardrails

## Completed Work

1. **Contract Schema & Digest Extensions (`schemas/task-contract.schema.json`, `src/core/task-contract.ts`)**:
   - Added optional `controllerModel`, `executorModel`, and `reviewerModel` properties (`pattern: "^[A-Za-z0-9._:/-]+$"`) to `agentPolicy`.
   - Updated `digestableTaskContract` and `changedContractFields` to include defined model fields in contract digests while preserving 100% backward compatibility for existing contracts that omit model overrides.
2. **Antigravity Adapter Model Injection (`src/adapters/task-antigravity.ts`)**:
   - Added `model?: string` to `AntigravityAdapterOptions`, `antigravityControllerArgs`, `antigravityExecutorArgs`, and `antigravityReviewerArgs`, injecting `["--model", model]` into spawned CLI invocations.
   - Implemented `resolveAntigravityRoleModel` resolving role models from `adapterModel` → `contract.agentPolicy.{controllerModel,executorModel,reviewerModel}` → `<projectRoot>/.planning/config.json` (`model_profile_overrides` and `review.cross_ai_command`).
   - Wired `resolveAntigravityRoleModel` into `runAntigravityController`, `runAntigravityReviewer`, and `runAntigravityFinalReviewer`.
3. **Subagent Inheritance Guardrails (`src/adapters/task-antigravity.ts`, `src/core/task-gsd.ts`)**:
   - Added `validateAntigravitySubagentDispatch` and `assertAntigravitySubagentDispatch` failing closed with `INCOMPATIBLE_SUBAGENT_MODEL` when `typeName: "self"` is paired with a conflicting explicit `Model` override.
   - Updated `buildGsdControllerPrompt` (`# Delegation` section) with explicit subagent model routing guardrails.
