# Phase 21 Plan 05: Unified Read Model and Verdict-First Status Summary

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-05  
**Requirements:** UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-05 delivers a unified read model and verdict-first status view ensuring that status queries and reports consistently select the same actual execution and present clear verdicts, concrete reasons, and required operator actions first:

1. **D-11 Deterministic Execution Selection**:
   - Created `src/core/task-read.ts` providing `selectTaskExecution` and `readTaskStatusModel`.
   - When `--run` is omitted, `selectTaskExecution` inspects runs for the specified contract and picks the latest run deterministically ordered by `startedAt` (descending) with `runId` as a tie-breaker.
   - Distinctly presents `selectedRunId` and `selectedStartedAt` prominently at the top of the output.
   - Specific `--run <run-id>` queries target that exact execution. If the run has not started yet but is reserved via approval, it resolves via `readReservedTaskRun` and presents `reserved` status without phantom execution records or fake timestamps.
2. **D-14 Verdict-First, Action-Oriented Status Layout**:
   - `formatTaskStatus` in `src/format.ts` and JSON status payloads display:
     - Header: Task ID, Run ID, Started at, Contract digest, Verdict, Status, Reason code, Reason, Next action.
     - Followed by: Progress & Execution details (Cycle, Attempt, Wall time, Tokens, Cost, Last verified HEAD, Stop reason, Effect summary, Journal events, Last updated).
     - Followed by: Capability status and drift invalidation details.
   - Guarantees unmetered resource usage is explicitly displayed as `(unmetered)` or `null` without fabricating zeros (UX-03).
3. **Cross-Boundary Coherence**:
   - `task status` and `task report` in `src/cli.ts` use the unified `selectTaskExecution` to eliminate drift between status and audit reports across process boundaries.
   - Reads stop requests and confirmations via `readTaskStopState` ensuring pending/unknown states are faithfully reflected.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js && npm run check`:
  - 42 tests executed across `task-cli` and `task-cli-capabilities`.
  - 42 tests passed, 0 failures.
  - Strict TypeScript check (`tsc -p tsconfig.json --noEmit`) clean with zero errors.
- `node scripts/run-tests.mjs --files dist/test/task-controller-lease.test.js dist/test/task-supervisor-recovery.test.js`:
  - 13 regression tests passed, 0 failures.

---

## 3. Files Modified

- `src/core/task-read.ts`: Created unified read model and deterministic execution selector.
- `src/cli.ts`: Updated `task status` and `task report` to use unified execution selection.
- `src/format.ts`: Re-ordered `formatTaskStatus` to present verdict, reason code, reason, and next action first.
- `test/task-cli.test.ts`: Added tests verifying latest execution selection without `--run`, verdict-first ordering, and reserved status inspection.
