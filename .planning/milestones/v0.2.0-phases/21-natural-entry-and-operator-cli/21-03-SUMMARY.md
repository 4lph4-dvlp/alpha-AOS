# Phase 21 Plan 03: Reserved Run ID and Durable Operator Commands Summary

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-03  
**Requirements:** UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-03 binds a deterministic, unforgeable reserved run ID to contract approvals and surfaces durable, copyable operator control commands across both human and JSON outputs:

1. **D-09 / D-10 Deterministic Reserved Run ID**:
   - `reservedRunIdForApproval({ contractDigest })`: Computes an immutable run ID strictly bound to the approved contract digest (`/^[0-9a-z]{8,}-[0-9a-f]{8}$/u`).
   - `readReservedTaskRun({ stateRoot, contractId, runId })`: Safely reads reserved status (`reserved`) from validated approval records without creating phantom execution records or fabricating start timestamps. Once an actual run starts, it resolves to `active` or `completed`. Unapproved or mismatched queries fail closed with `refused`.
   - `startTask`: Consumes and binds `options.runId = reservedRunId` on start, guaranteeing that the approval receipt and execution record share the identical identifier.
2. **D-10 Copyable Operator Control Commands**:
   - `taskStatusCommand(contractId, runId)`: Generates `alpha-aos task status <contract-id> --run <run-id>`.
   - `taskStopCommand(contractId, runId)`: Generates `alpha-aos task stop <contract-id> --run <run-id> --reason operator_halt`.
   - `taskResumeCommand(contractPath, digest)`: Generates `alpha-aos task resume <contractPath> --contract-digest <digest> --apply`.
   - Both human formatting (`formatTaskApproval`) and JSON output (`TaskApprovalResult`) prominently display the Task ID, Contract File absolute path, Contract Digest, Reserved Run ID, and the exact copyable control commands durable across chat boundaries.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-cli.test.js && npm run check`:
  - 27 tests in `task-contract.test.js` passed.
  - 29 tests in `task-cli.test.js` passed.
  - Strict TypeScript check (`tsc -p tsconfig.json --noEmit`) clean with zero errors.

---

## 3. Files Modified

- `src/core/task-contract.ts`: Implemented `reservedRunIdForApproval`, `readReservedTaskRun`, `taskStatusCommand`, `taskStopCommand`, `taskResumeCommand`, and enriched `TaskApprovalResult`.
- `src/format.ts`: Enriched `formatTaskApproval` with contract location, reserved run ID, and copyable status/stop/resume commands.
- `src/cli.ts`: Wired `reservedRunId` into `startTask`, included copyable commands in approval and start outputs.
- `test/task-contract.test.ts`: Added unit tests for `reservedRunIdForApproval` and `readReservedTaskRun`.
- `test/task-cli.test.ts`: Added CLI verification ensuring approval outputs match reservedRunId, file paths, and control commands across separate CLI processes.
