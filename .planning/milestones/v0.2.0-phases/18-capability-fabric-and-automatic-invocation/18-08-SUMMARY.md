---
phase: 18-capability-fabric-and-automatic-invocation
plan: "08"
status: completed
completed_at: 2026-10-08T01:30:00+09:00
commits:
  - (pending) feat(18-08): connect capability obligations to gsd lifecycle and review boundaries
artifacts:
  - src/core/task-capability-obligations.ts
  - src/core/task-capability-receipts.ts
  - src/core/task-capability-inventory.ts
  - src/core/task-gsd-lifecycle.ts
  - src/core/task-run.ts
  - test/helpers/task-fixture.ts
  - test/task-gsd-lifecycle.test.ts
  - test/task-capability-trace.test.ts
requirements_addressed: [CAP-03, CAP-05]
---

# Plan 18-08 Summary: GSD Boundary Integration & Five-Boundary Verdict Gating

## Executive Overview

Plan 18-08 connects capability obligations and receipt verification across all five operational boundaries: `discuss`, `plan`, `execute`, `review`, and `verify`. Previously, automatic capability selection and invocation was tested primarily on the `execute` boundary. Now, all four operational GSD lifecycle steps (`executeGsdStep`, `runPhaseLifecycle`, `orchestrateMultiPhaseProgression`) and the independent reviewer dispatch boundary enforce capability obligations fail-closed. Furthermore, removing any single verified receipt from any of the five boundaries halts progression or blocks acceptance in `reduceTaskVerdict`.

## Delivered Capabilities

### 1. Operational GSD Lifecycle Boundary Enforcement (Task 1, CAP-03, D-06..D-09)
- Extended `CapabilityBoundary` union type (`GsdStepKind | "review"`) and defined `CAPABILITY_BOUNDARIES` and `INDEPENDENT_CHECK_BOUNDARIES` (`review`, `verify`).
- `executeGsdStep` now loads prior receipts, evaluates step obligations, checks for valid D-09 reuse where permitted, invokes `capabilityPort` when required, writes linked receipts, and verifies receipt validity. If a required obligation is unsatisfied or fails, step progression immediately halts with status `'failed'` and `nextStep: null`.
- Enforced D-09 reuse guard: independent check boundaries (`review`, `verify`) are strictly prohibited from reusing prior receipts; fresh invocation is mandatory.
- `runPhaseLifecycle` propagates verified receipts across lifecycle steps and halts if any step fails capability verification.
- `orchestrateMultiPhaseProgression` halts phase sequencing if capability obligations fail.

### 2. Independent Review Boundary & Five-Boundary Verdict Gating (Task 2, CAP-03, CAP-05)
- Preserved `GsdStepKind` as `"discuss" | "plan" | "execute" | "verify"`; review is modeled as an independent dispatch boundary.
- `extractQuestionFromContract` scopes review boundary questions specifically to review-related criteria or questions matching `/\breview\b/iu`.
- `startTask` (`src/core/task-run.ts`):
  - Invocations for the `review` boundary connect directly to the reviewer's `sessionId`, `harness`, and verified `artifact.digest`.
  - Aggregates boundary outcomes for all five boundaries (`CapabilityBoundaryOutcome`) using helper functions (`capabilityBoundaryOutcome`, `unsatisfiedCapabilityBoundary`, `notExercisedCapabilityBoundary`).
  - Converts outcomes into typed `TaskPrecondition` entries (`capabilityBoundaryPreconditions`) with IDs `capability-obligations:<boundary>`.
  - In `startTask` (`gsd-quick`), unexercised boundaries (`discuss`, `plan`, `verify`) are reported as `'not-exercised'` by default and contribute no failing precondition.
  - When explicit `requiredBoundaries` are supplied or full lifecycle is executed, missing or failing receipts for any of the five boundaries produce failing preconditions, causing `reduceTaskVerdict` to yield `overall: "unknown"` (or `blocked` if execution failed), preventing acceptance.
  - Interactive contracts (`mode: "interactive"`) are rejected with `contract-invalid` before autopilot execution begins.

## Verification

- **GSD Lifecycle Suite (`test/task-gsd-lifecycle.test.ts`):**
  - Missing port in discuss/plan/verify halts lifecycle step.
  - Capability port throwing or failing halts step.
  - Successful capability invocation advances step with linked receipt.
  - D-09 reuse allowed between discuss and execute, but rejected at verify.
  - Multi-phase progression halts if phase fails capability verification.
- **Trace Suite (`test/task-capability-trace.test.ts`):**
  - CAP-03: review boundary selects and verifies capability connected to sessionId and artifactDigest.
  - CAP-05: five-boundary regression matrix (1 baseline + 5 negative cases omitting discuss, plan, execute, review, verify receipts individually).
  - CAP-03: ordinary interactive GSD contract does not start autopilot execution.
- **Full Test Suite:**
  - `npm test`: 1,359 passing tests, 0 failures, 10 skipped.
  - `npm run check`: 0 type errors.
