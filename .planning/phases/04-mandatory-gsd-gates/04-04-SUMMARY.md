---
phase: 04-mandatory-gsd-gates
plan: 04
subsystem: core
tags: [worker-authority, gsd-controller, planning-immutability, tree-witness, rollback]

# Dependency graph
requires:
  - phase: 04-mandatory-gsd-gates
    provides: "src/core/gate-lifecycle.ts — evaluateLifecycleGates, checkReceiptStaleness"
provides:
  - "src/core/worker-authority.ts — assertControllerRole, resolveHarnessRole, sanitizeWorkerLaunchSpec, snapshotPlanningTree, restorePlanningTreeSnapshot, witnessWorkerDelegation, WorkerAuthorityError"
  - "src/adapters/harnesses.ts — probeHarnessAuthority identifying Hermes as worker-only"
  - "src/types.ts — GsdRole type"
  - "test/worker-authority.test.ts — automated test suite covering role assignments, Hermes controller prohibition, launch spec sanitization, and cryptographic witness with rollback"
affects: []

actuals:
  tokens: 46000
  tasks: 3
  commits: 1
plan_head_before: 84a6ff2

tech-stack:
  added: []
  patterns:
    - "Strict single-controller GSD authority where session initiator is controller and delegated harnesses are workers (D-10)"
    - "Structural prohibition of Hermes acting as a GSD state writer (GATE-05)"
    - "Launch spec sanitization stripping orchestrator workflow guides and injecting worker constraint notices"
    - "Cryptographic pre- and post-execution tree witnessing over .planning/ using recursive SHA-256 digests"
    - "Automatic byte-for-byte rollback restoring modified/removed files and purging unauthorized files upon worker tampering (D-11)"

key-files:
  created:
    - src/core/worker-authority.ts
    - test/worker-authority.test.ts
  modified:
    - src/adapters/harnesses.ts
    - src/types.ts

key-decisions:
  - "assertControllerRole strictly throws WorkerAuthorityError if Hermes attempts to assume the controller role (D-10, GATE-05)"
  - "sanitizeWorkerLaunchSpec strips controller workflow instructions (execute-phase, execute-plan, verify-work, summary.md) and injects ALPHA_AOS_GSD_ROLE='worker' with a strict prohibition notice (D-11)"
  - "witnessWorkerDelegation snapshots all regular files in .planning/ before delegating to a worker, comparing the tree hash afterwards with comparePlanningTrees and rolling back any detected difference before raising an error (D-11)"
  - "probeHarnessAuthority in src/adapters/harnesses.ts documents and verifies the native capability boundary of Hermes and active harnesses"

requirements-completed: [GATE-05]

coverage:
  - id: D-10
    description: "Controller vs Worker authority with Hermes structural prohibition"
    requirement: "GATE-05"
    verification:
      - kind: unit
        ref: "test/worker-authority.test.ts#Role resolution assigns controller to initiator and worker to external harnesses (GATE-05, D-10)"
        status: pass
      - kind: unit
        ref: "test/worker-authority.test.ts#assertControllerRole strictly prohibits Hermes from being a GSD state controller (GATE-05, D-10)"
        status: pass
  - id: D-11
    description: "Multi-layer .planning/ protection using recursive SHA-256 tree hashing and automatic rollback"
    requirement: "GATE-05"
    verification:
      - kind: unit
        ref: "test/worker-authority.test.ts#sanitizeWorkerLaunchSpec strips controller instructions and injects worker role and notice (D-11)"
        status: pass
      - kind: integration
        ref: "test/worker-authority.test.ts#witnessWorkerDelegation passes cleanly when worker modifies only workspace files outside .planning (D-11)"
        status: pass
      - kind: integration
        ref: "test/worker-authority.test.ts#witnessWorkerDelegation halts and rolls back unauthorized .planning/ modifications (GATE-05, D-11)"
        status: pass
      - kind: integration
        ref: "test/worker-authority.test.ts#witnessWorkerDelegation rolls back .planning/ mutations even if worker action throws an error"
        status: pass
---

# Phase 04 Plan 04 Summary

## Summary of Accomplishments

1. **GSD Controller Authority & Structural Hermes Prohibition (`src/core/worker-authority.ts`, `src/types.ts`)**:
   - Defined `GsdRole: "controller" | "worker"`.
   - Implemented `assertControllerRole`: strictly enforces that Hermes cannot assume the controller role, throwing `WorkerAuthorityError("unauthorized-controller")` (GATE-05, D-10).
   - Implemented `resolveHarnessRole`: assigns `"controller"` strictly to the initiator harness and `"worker"` to delegated/external harnesses (Hermes, Pi, subagents).

2. **Worker Launch Spec Sanitization (`sanitizeWorkerLaunchSpec`)**:
   - Strips GSD orchestrator workflow guides (`execute-phase`, `execute-plan`, `verify-work`, `summary.md`, `roadmap.md`, `state.md`) from worker instruction lists.
   - Sets `ALPHA_AOS_GSD_ROLE: "worker"` in the environment.
   - Appends explicit operational boundaries to prompts instructing worker models that `.planning/` file mutations are prohibited (D-11).

3. **Cryptographic `.planning/` Witness & Byte Rollback Engine (`witnessWorkerDelegation`)**:
   - Implemented `snapshotPlanningTree`: recursively digests `.planning/` via `hashPlanningTree` and captures in-memory byte snapshots of all planning files.
   - Implemented `restorePlanningTreeSnapshot`: reverses any unauthorized modifications or file deletions by restoring original bytes, and recursively deletes unauthorized newly created files.
   - Implemented `witnessWorkerDelegation`: wraps worker operations in a before/after cryptographic witness; detects mutations via `comparePlanningTrees`, triggers immediate rollback, and throws `WorkerAuthorityError("planning-mutation-detected")` with cited paths.
   - Handles failure paths: rolls back partial `.planning/` tampering even when the worker subprocess crashes or throws an exception.

4. **Harness Adapter Integration & Verification (`src/adapters/harnesses.ts`, `test/worker-authority.test.ts`)**:
   - Added `probeHarnessAuthority` to report default roles and state writer permissions.
   - Created comprehensive test suite `test/worker-authority.test.ts` (7/7 tests passing).
   - Full regression suite verified green (`npm test`: 800 passing, 0 failing, 9 skipped).

## Self-Check: PASSED
- `src/core/worker-authority.ts` created and validated.
- `src/adapters/harnesses.ts` and `src/types.ts` updated and compiling cleanly.
- `test/worker-authority.test.ts` passes 7/7 tests.
- Full test suite passes 800 tests with 0 regressions.
