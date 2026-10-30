---
phase: 25-runtime-usage-and-recovery-controls
plan: "01"
subsystem: runtime
tags: [telemetry, budgets, durable-jobs, recovery, gsd]
requires:
  - phase: 24
    provides: Harness role and lifecycle controls
provides:
  - Shared native usage and resource boundaries for generic and registered execution
  - Durable process observations and positive-closure recovery fences
  - Review evidence reuse and preserved GSD final acceptance
affects: [task-execution, dedicated-runners, review, recovery]
tech-stack:
  added: []
  patterns: [shared-dispatch-guard, native-closure-evidence, cumulative-watermarks]
key-files:
  created: [src/core/task-runtime.ts, src/core/task-native-job.ts, src/core/task-native-sessions.ts, docs/task-runtime-controls.md]
  modified: [src/core/task-telemetry.ts, src/core/task-supervisor.ts, src/core/task-final-review.ts, src/core/task-gsd-lifecycle.ts]
key-decisions:
  - Reuse existing telemetry, limit evaluation, checkpoints, command jobs and GSD ownership.
  - Keep unknown meters null and refuse unsupported required meters before dispatch.
  - Require positive owned-process closure before releasing an interrupted fence.
  - Keep Codex USD unavailable and audit credit conversions separate from billing.
requirements-completed: [RUNTIME-01, RUNTIME-02, RUNTIME-03, RUNTIME-04, RUNTIME-05, RUNTIME-06, RUNTIME-07, RUNTIME-08]
coverage:
  - id: D1
    description: Quota and interrupted native execution remain observable.
    requirement: RUNTIME-01
    verification:
      - kind: integration
        ref: "test/task-runtime-controls.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: Surviving or unconfirmed native work cannot be relaunched.
    requirement: RUNTIME-02
    verification:
      - kind: integration
        ref: "test/task-native-job.test.ts; test/task-runtime-controls.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: Partial cumulative and descendant usage survives replay and resume once.
    requirement: RUNTIME-03
    verification:
      - kind: integration
        ref: "test/task-runtime-controls.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: Aggregate limits and missing required meters prevent another dispatch.
    requirement: RUNTIME-04
    verification:
      - kind: integration
        ref: "test/task-native-job.test.ts; test/task-limits.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: Runtime timers and completion handles own bookkeeping and waits.
    requirement: RUNTIME-05
    verification:
      - kind: integration
        ref: "test/efficient-wait-cli.test.ts; test/task-wait.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: Review reuse preserves exact evidence and mandatory independent final review.
    requirement: RUNTIME-06
    verification:
      - kind: integration
        ref: "test/task-final-review.test.ts; test/task-final-review-adapters.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: Windows typed argv preserves delimiters, Unicode and resume identity.
    requirement: RUNTIME-07
    verification:
      - kind: integration
        ref: "test/task-native-job.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: Approved public resume preserves partial commits and WIP through final acceptance.
    requirement: RUNTIME-08
    verification:
      - kind: integration
        ref: "test/task-gsd-multi-phase.test.ts"
        status: pass
    human_judgment: false
duration: 523min wall elapsed, including waits and handoffs
completed: 2026-10-30
status: complete
---

# Phase 25 Plan 01 Summary

Existing controls now reach supported native execution, preserving usage and
process truth without replacing GSD acceptance or changing approved models.

## Accomplishments

- Connected shared dispatch guards, native telemetry and local cumulative family
  recovery across generic execution and the registered `codex-json-v1` job bridge.
- Preserved cache/reasoning semantics, failed usage, model/effort and exact native
  handles; separated protocol IDs and logical cycles from measured native events.
- Prevented recovery from manufacturing positive closure when PID/native handles
  are missing; proved positive owned-child closure can still resume remaining work.
- Reused unchanged review evidence and retained isolated independent final review,
  exact requirement coverage, Nyquist and real GSD acceptance.

## Task Commits

- `2cdc70d`: initial credential-free RED resource/telemetry reproductions.
- `17718a3`: integrated runtime, approved bridge and GSD/review repair.
- `04fab20`: preserved full coverage while isolating Windows host process fixtures.
- `77cf6d1`: positive closure proof, native/protocol identity and recovery counterexamples.

## Test Evidence

`npm run build` and final `ALPHA_AOS_LIVE_CANARY=0 npm test -- --test-reporter=tap`
passed. Final result: **1857 tests, 1846 passed, 11 skipped, zero failures**, exit 0,
including the packed install/reconcile/diagnose/uninstall lifecycle. The immutable
source SHA and log hash are recorded in `25-FINAL-TESTS.json`.

Independent review was actually invoked. Original findings remain preserved;
focused closure is documented in `25-REVIEW-FINAL.md`, `25-REVIEW-FIXTURES.md`,
`25-REVIEW-RUNNER.md` and final `25-REVIEW-CLOSURE.md`. Unchanged scope was not
gratuitously reviewed again.

## Decisions and Deviations

Runtime owns process/usage observations; GSD alone owns lifecycle and acceptance.
The incident's dedicated runner is distinct from the separately reproduced generic
supervisor defect. Handoff R1–R8 map directly to GSD IDs RUNTIME-01..08.

Adversarial review fixtures now declare their existing report requirement. Windows
PID reuse is judged using owned closure/start evidence; a finite cancel timeout
requires reconnecting to the same actual terminal job. Host process-tree fixtures
run separately, with all original deadlines and descendant assertions retained.
One runner fixture proves no registered file is dropped or executed twice.

## Delivery Boundary

47 implementation/test/schema/script/document files changed. Wall elapsed time
523 minutes includes tests, waits and handoffs; it is not active model time or a
billing measurement. No dependency, global installation, release or original
Oh-My-Circuit state was changed. No paid native canary was run.

Legacy PowerShell controllers must migrate leaf launches to the registered route.
Codex USD remains null. Boundary checks are not a provider hard cap or a zero
overshoot guarantee. Unconfirmed native closure remains fenced for inspection.

## Self-Check: PASSED

Implementation commits, final native completion receipt, targeted regressions and
actual independent review artifacts exist. All eight scoped criteria have evidence.
