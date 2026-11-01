# Phase 21 Plan 04: Cross-Process Stop Transport and Termination Verification Summary

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-04  
**Requirements:** UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-04 delivers durable cross-process stop transport and guarantees that stop requests and observed process terminations are clearly distinguished, preventing premature claims of task stoppage and unsafe resumes:

1. **D-12 Durable Stop Transport and Status Discrimination**:
   - Created `src/core/task-control.ts` providing `requestTaskStop`, `readTaskStopState`, and `recordTaskStopConfirmation`.
   - Durable 0600 stop records are persisted under `tasks/<contractId>/control/<runOrDigest>.stop.json`.
   - Distinct statuses:
     - `pending`: Stop request is recorded and delivered to active controller/process, but process termination has not been observed yet (D-12).
     - `confirmed`: Process exit has been verified and confirmed, updating checkpoint and recording limit events.
     - `unknown`: Process exited or crashed before confirmation, requiring reconciliation before resume.
   - Fencing (T-21-07, UX-02): Stop requests targeting a specific run or contract digest only attach to matching controller leases, protecting concurrent controllers and separate tasks from cross-cancellation.
2. **D-13 Verified Termination Gate Before Resume**:
   - `inspectTaskResumeReadiness` in `src/core/task-supervisor.ts` checks `readTaskStopState` before evaluating GSD and effect consistency. If a stop request is `pending` or `unknown`, it blocks resume with `ready: false` and explanatory reasons.
   - `resumeTask` strictly fails closed if a stop request is `pending` or `unknown`.
   - Once termination is verified and confirmed, `task stop` and `task resume` output the exact resume command with copyable arguments.
3. **CLI Task Stop Integration**:
   - `alpha-aos task stop <contract-id> [--run <run-id>] [--reason <reason>]` invokes `requestTaskStop`.
   - Outputs human and JSON records distinguishing `stopped (confirmed)` from `stop requested (pending)` with explicit next actions and copyable resume commands when confirmed.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-controller-lease.test.js dist/test/task-supervisor-recovery.test.js dist/test/task-cli.test.js && npm run check`:
  - 42 tests executed across `task-controller-lease`, `task-supervisor-recovery`, and `task-cli`.
  - 42 tests passed, 0 failures.
  - Strict TypeScript check (`tsc -p tsconfig.json --noEmit`) clean with zero errors.

---

## 3. Files Modified

- `src/core/task-control.ts`: Created durable stop transport module with lease fencing and status discrimination.
- `src/core/task-supervisor.ts`: Wired stopState checking into `inspectTaskResumeReadiness`, `resumeTask`, and `runSupervisorLoop`.
- `src/cli.ts`: Updated `task stop` handler to call `requestTaskStop` and emit D-12/D-13 receipts.
- `test/task-controller-lease.test.ts`: Added tests verifying lease fencing against foreign digests and pending state for live processes.
- `test/task-supervisor-recovery.test.ts`: Added tests verifying that resume readiness and resume calls block on pending/unknown stop states.
- `test/task-cli.test.ts`: Updated CLI stop test verifying confirmation and resume command emission.
