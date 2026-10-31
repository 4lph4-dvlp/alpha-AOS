---
phase: 26-autopilot-session-progress-and-steering
plan: "01"
subsystem: task-progress
tags: [autopilot, observer, sqlite, sse, cli]
status: complete
requires:
  - phase: 25
    provides: durable runtime dispatch and command-job ownership
provides:
  - exact-bound passive session projection and authenticated finite local viewer
  - early opt-in start and exact attach for task runs and acknowledged registered dispatches
affects: [26-02, 26-03, phase-26-verification]
tech-stack:
  added: [node-sqlite]
  patterns: [transactional-run-projection, private-startup-handoff, passive-finite-observer]
key-files:
  created: [src/core/task-session.ts, src/core/task-progress.ts, src/core/task-progress-panel.ts, src/core/task-progress-launch.ts, test/task-session.test.ts, test/task-progress.test.ts, test/task-progress-panel.test.ts]
  modified: [src/cli.ts, src/core/task-run.ts, src/core/task-runtime.ts, src/core/task-gsd-lifecycle.ts, src/core/redaction.ts, test/task-cli.test.ts, test/task-connector.test.ts, test/task-gsd-lifecycle.test.ts]
key-decisions:
  - "Use a lazy transactional SQLite projection with bounded native path identity checks; this is not an OS sandbox."
  - "Allow registered-dispatch attach only with exact approval and run identity plus durable dispatch and acknowledged command-job evidence."
  - "Keep bootstrap fragments in private handoff and direct launch output; redact them from retained process output."
requirements-completed: []
actuals:
  tokens: null
  token_measurement: unavailable
  agent_reported_tokens_unverified: 50682
  tasks: 3
  commits: 39
plan_head_before: 88683538d5a7b9a4883078b7b2ad8c08ad8dba8a
plan_head_after: ea4ca999fdd234424e50dcd25092102bbb1b273f
duration: multi-session
completed: 2026-11-01
---

# Phase 26 Plan 01: Passive Session Progress Summary

**Exact-bound, authenticated local progress panels now follow actual task and registered dispatch evidence without a reporting model call.**

## Accomplishments

- Added run-scoped SQLite event projection with transactional sequencing, duplicate/conflict detection, bounded replay, explicit gaps, and observed path protections.
- Projected dispatch, GSD step, recorded decision, outcome, configured and observed model, and process uncertainty from existing authoritative records; the panel does not own task lifecycle or acceptance.
- Added finite authenticated loopback HTTP/SSE and a Korean responsive viewer, plus honest five-host native capability facts. Opt-in `task start --progress panel --origin-host ... --origin-session ...` emits an early private URL; `task attach` requires the full exact run tuple. Registered typed dispatches require durable dispatch and acknowledged job evidence rather than approval reservation alone.
- Preserved normal detached behavior and independent task versus observer cancellation. Captured output redacts loopback bootstrap fragments; no credential is placed in job arguments or specifications.

## Task Commits

- Task 1: `4712a8b` through `4168292`, including transactional store `ab4cede` and focused recovery checks `7091cd2`.
- Task 2: `4e59008` through `3811a0e`, including GSD and outcome projections, model evidence, and live owner-death observations.
- Task 3: `ced2c0e`, `53fda1c`, `9e752f5`, `b9a808b`, `2b31977`, and `ea4ca99` cover durable run-ready hooks, exact finite observer launch, credential protection, registered job attach, and public held-controller CLI start.

## Test Evidence

- `npm run check` and `npm run build`: passed. The final additional change was fixture-only and its build passed.
- Phase26 targeted compiled fixtures: 41 passed, one Windows file-symlink EPERM skip, and one four-second observer fixture expired under parallel load. The affected fixture was adjusted to use a bounded 20-second lifetime and explicit cancellation; its targeted retest passed along with the updated general and multi-phase hooks (3 passed). The separately added public CLI start held-controller fixture passed using a local fake executable and fixture-only receipts; the public registered-job attach fixture also passed without a provider call.
- Related runtime-controls, native-job, completion-wait, task-wait, redaction and connector fixtures: 120 passed. Logs are under `.alpha-aos/research/phase26-*.log` and are local evidence, not tracked artifacts.
- The 251-event replay fixture passed in the targeted run; elapsed time under concurrent load was approximately 26 seconds, with no predeclared performance budget claimed.
- Earlier changed-source browser evidence is recorded in `26-PROTOTYPE-UI-EVIDENCE.md` and versioned visual captures. Capability labels changed after those captures, so final-source browser QA remains pending. Native host UI delivery and Windows ACL guarantees remain unverified.

## Process Deviations and Fixes

1. **[Process deviation] Initial historical RED missing.** The first prototype did not preserve a RED-only commit or historical RED classification. Later RED/GREEN evidence is genuine; history was not reconstructed or flags changed.
2. **[Rule 1 - Bug] Private observer worker lost its custom state root.** Passed the nonsecret state-root explicitly in shell-free argv; verified with actual CLI launch fixtures.
3. **[Rule 2 - Critical functionality] Retained output could expose a bootstrap fragment.** Extended the existing redactor narrowly for the panel credential shape and verified secret exclusion from retained job/spec evidence.
4. **[Rule 2 - Critical functionality] Registered dispatches have no TaskRunRecord.** Exact attach now checks their existing durable dispatch and acknowledged command-job evidence, preserving the distinction from mere reservation and from GSD acceptance.

## Remaining Phase Gates

Plans 02 and 03, final-source visual review, independent review and accepted fixes, the single final full regression, Nyquist and goal verification remain with the orchestrator. SESSION requirements span these plans and are not marked complete here. No paid native canary, global install, original project operation or denied temporary-directory cleanup was performed.

## Self-Check: PASSED

Source files and the recorded commits were checked on the phase branch; the target verification results and the skipped symlink case are reported above without inferring native UI acceptance.
