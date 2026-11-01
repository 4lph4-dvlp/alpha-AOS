---
phase: 16-composable-harness-roles
plan: "03"
subsystem: core
tags: [controller-lease, fencing, worker-authority, task-run, hermes]
requires: ["16-01", "16-02"]
provides: [project-controller-lease, zombie-lock-reclaim, universal-worker-authority]
affects: [controller-lease, task-run, worker-authority, task-effects, windows-command]
tech-stack:
  added: []
  patterns: [exclusive-fenced-lease, fail-fast-locking, zombie-auto-reclaim, receipt-and-lease-authority]
key-files:
  created:
    - schemas/controller-lock.schema.json
    - src/core/controller-lease.ts
    - test/task-controller-lease.test.ts
  modified:
    - src/core/task-run.ts
    - src/core/task-effects.ts
    - src/core/windows-command.ts
    - src/core/worker-authority.ts
    - test/worker-authority.test.ts
    - test/brownfield-gsd-cycle.test.ts
key-decisions:
  - "D-05: Only one controller holds an active lease (.alpha-aos/controller.lock) on a project at any time; collision fails fast with LOCKED_PROJECT_CONTROLLER."
  - "D-06: Zombie lock from dead process is safely auto-reclaimed via isProcessAlive and logged to controller-lease-audit.jsonl."
  - "D-07: Legacy name-based Hermes blocking in assertControllerRole migrated to universal receipt-and-lease validation."
  - "D-08: Controller lock schema enforces atomic fields: schemaVersion, pid, hostname, harness, acquiredAt, contractDigest, token."
requirements-completed: [ROL-03]
coverage:
  - deliverable: "Project-local fenced controller lease with fail-fast collision and zombie reclaim"
    verification:
      kind: command
      ref: "dist/test/task-controller-lease.test.js"
      status: pass
    human_judgment: false
  - deliverable: "Universal worker authority and receipt-and-lease controller validation"
    verification:
      kind: command
      ref: "dist/test/worker-authority.test.js"
      status: pass
    human_judgment: false
duration: 10 min
completed: 2026-10-02
---

# Phase 16 Plan 03: Exclusive Controller Fenced Lease & D-10 Hermes Migration Summary

Implemented the project-local exclusive controller fenced lease system (`.alpha-aos/controller.lock`), wired it into `startTask` lifecycle with fail-fast collision protection, implemented zombie process auto-reclaim with audit logging, and migrated D-10 hardcoded Hermes blocking to universal receipt-and-lease verification (ROL-03, D-05, D-06, D-07, D-08).

## Accomplishments
- Created `schemas/controller-lock.schema.json` with strict schema validation for project-local controller lease files.
- Implemented `src/core/controller-lease.ts` providing `acquireControllerLease`, `ControllerLockConflictError` with code `LOCKED_PROJECT_CONTROLLER`, atomic writing with `wx` flag, and dead PID zombie auto-reclaim with `controller-lease-audit.jsonl`.
- Integrated lease acquisition into `startTask` (`src/core/task-run.ts`) before controller execution and guaranteed release via `finally` block.
- Updated `src/core/task-effects.ts` to recognize `.alpha-aos/controller.lock` and `.alpha-aos/controller-reclaim.log` as valid control-plane runtime state during task auditing.
- Hardened `src/core/windows-command.ts` to safely catch unreadable PATH candidate errors so Windows command resolution does not throw on exotic driver directories.
- Refactored `src/core/worker-authority.ts` to eliminate hardcoded name-based Hermes checks in `assertControllerRole` and `resolveHarnessRole`, establishing uniform verification based on receipt and lease token context.
- Created `test/task-controller-lease.test.ts` and updated `test/worker-authority.test.ts` and `test/brownfield-gsd-cycle.test.ts` with 100% passing tests.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/worker-authority.test.js dist/test/task-controller-lease.test.js dist/test/brownfield-gsd-cycle.test.js && npm run check`: All 19 tests passed, 0 type errors.

## Next Steps
- Plan 16-04: Implement same-harness reviewer isolation (D-09), `differentReviewerPolicy` in task contracts (D-10), and post-review Tree Mutation Guard (D-11, ROL-04).
