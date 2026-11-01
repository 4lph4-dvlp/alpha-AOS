---
phase: 18-capability-fabric-and-automatic-invocation
plan: "01"
subsystem: core
tags: [capability, obligations, receipts, gsd-lifecycle, task-run, tracer]
requires: []
provides: [task-capability-obligations, task-capability-receipts, single-capability-trace, edge-probe-verification]
affects: [task-capability-obligations, task-capability-receipts, task-gsd-lifecycle, task-run]
tech-stack:
  added: []
  patterns: [deterministic-obligation-selection, atomic-fsync-write, fail-closed-receipt-precondition, edge-probe-testing]
key-files:
  created:
    - src/core/task-capability-obligations.ts
    - src/core/task-capability-receipts.ts
    - test/task-capability-trace.test.ts
  modified:
    - src/core/task-gsd-lifecycle.ts
    - src/core/task-run.ts
key-decisions:
  - "D-06/D-09: Version-specific API documentation lookup obligations deterministically selected for execute step and linked to actual invocation receipt."
  - "CAP-03/CAP-05: Missing or failed capability receipts prevent accepted verdict even with exitCode 0 and passing reviewer."
requirements-completed: [CAP-03, CAP-05]
coverage:
  - deliverable: "Single required capability tracer from GSD execute boundary to verdict"
    verification:
      kind: command
      ref: "dist/test/task-capability-trace.test.js"
      status: pass
    human_judgment: false
duration: 10 min
completed: 2026-10-03
---

# Phase 18 Plan 01: GSD Execute Capability Trace & Receipt Verification Summary

Implemented the single required capability tracer connecting GSD execute step obligation selection, observed invocation, atomic external receipts, and final verdict preconditions to satisfy CAP-03 and CAP-05.

## Accomplishments
- Implemented `src/core/task-capability-obligations.ts` defining `TaskCapabilityObligation` and deterministic `selectStepObligations` for identifying documentation-lookup needs at the GSD execute boundary.
- Implemented `src/core/task-capability-receipts.ts` defining `TaskCapabilityReceipt`, atomic fsync writing under external `stateRoot`, canonical SHA-256 digest validation, credential sanitization check, and `verifyRequiredCapabilityReceipts`.
- Extended `src/core/task-gsd-lifecycle.ts` and `src/core/task-run.ts` to attach selected obligations at the execute boundary, observe capability invocations via `TaskPorts.capability`, and enforce receipt verification as a mandatory `TaskPrecondition` before `reduceTaskVerdict`.
- Created comprehensive test suite in `test/task-capability-trace.test.ts` with 10 passing tests verifying happy-path acceptance, missing-port rejection, failed-invocation rejection, lifecycle step attachment, and edge probes covering wrong-step adjacency, stale runId ordering, empty question rejection, digest tampering, and unlinked reuse.

## Self-Check: PASSED
- `key-files.created`: `src/core/task-capability-obligations.ts`, `src/core/task-capability-receipts.ts`, `test/task-capability-trace.test.ts` exist on disk.
- `git log`: `feat(18-01): trace single required capability from GSD execute boundary to verdict` committed.
- Test suite: `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-trace.test.js && npm run check`: All 10 tests passed with 0 TypeScript errors.

## Next Steps
- Proceed to Wave 2: Plan 18-02, 18-03, 18-04.
