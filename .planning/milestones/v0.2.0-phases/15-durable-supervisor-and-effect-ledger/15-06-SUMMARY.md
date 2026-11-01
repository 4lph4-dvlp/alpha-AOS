---
phase: 15-durable-supervisor-and-effect-ledger
plan: 06
subsystem: task-supervisor
tags: [durable-supervisor, crash-recovery, effect-ledger, task-resume, task-status, task-stop, cli]

requires:
  - phase: 15
    plan: 01
    provides: "durable append-only journal and atomic checkpoints"
  - phase: 15
    plan: 02
    provides: "safe process execution and tree termination"
  - phase: 15
    plan: 03
    provides: "effect ledger with idempotency and reconciliation"
  - phase: 15
    plan: 04
    provides: "resource limit evaluation and standard stop codes"
  - phase: 15
    plan: 05
    provides: "failure fingerprinting, no-progress detection, and adaptive repair escalation"
provides:
  - "Durable task supervisor loop with crash recovery and effect reconciliation (superviseTask, resumeTask)"
  - "GSD and Git state consistency verification (verifyGsdStateConsistency)"
  - "Resume readiness inspection without side effects (inspectTaskResumeReadiness)"
  - "Effect ledger persistence and retrieval (readEffectLedger, saveEffectLedger)"
  - "CLI commands for task lifecycle management (task resume, task status, task stop)"
affects: []

actuals:
  tokens: 65000
  tasks: 2
  commits: 1
  plan_head_before: 8e497ecb020084f3333333333333333333333333

tech-stack:
  added: []
  patterns:
    - "Crash-consistent effect reconciliation matching disk state against ledger sha256 before resuming tasks"
    - "Durable supervisor checkpointing at stateRoot/runs/<contractDigest>/checkpoint.json and journal.jsonl"
    - "Fail-closed start and resume gates refusing execution on GSD HEAD divergence or missing approval"
    - "Two-phase resume inspection previewing recovery state without launch or disk mutation"

key-files:
  created:
    - src/core/task-supervisor.ts
    - test/task-supervisor-recovery.test.ts
  modified:
    - src/core/task-gsd.ts
    - src/core/task-run.ts
    - src/format.ts
    - src/cli.ts
    - test/task-cli.test.ts

key-decisions:
  - "superviseTask and resumeTask share runSupervisorLoop with consistent checkpoint and journal state management"
  - "resumeTask reconciles performing and uncertain effects before continuing execution loop"
  - "verifyGsdStateConsistency refuses resumption if project Git HEAD has diverged from lastVerifiedHead"
  - "task resume previews readiness and exit code 2 when not ready, launching supervisor only with --apply"
  - "task status displays cycle, wall time, attempt, stop reason, effect summary, and journal count"
  - "task stop mutates checkpoint to stopped and logs limit_exceeded event"

patterns-established:
  - "runDirectory strictly isolated under userStateRoot()/runs/<contractDigest>/"
  - "Adaptive repair strategy injected dynamically into controller prompt on repeated failures"
  - "Complete supervisor report formatted in formatSupervisorReport and task status in formatTaskStatus"

requirements-completed: [RUN-01, RUN-02, RUN-03, RUN-04, RUN-05]

duration: 35min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 06: Durable Supervisor, Effect Recovery, and Task Resume CLI Summary

**Implemented the durable supervisor (`superviseTask`, `resumeTask`), crash recovery with effect ledger reconciliation, and CLI subcommands (`task resume`, `task status`, `task stop`) in `src/core/task-supervisor.ts`, `src/format.ts`, and `src/cli.ts`.**

## Accomplishments
- `src/core/task-supervisor.ts`:
  - `superviseTask`: supervises multi-attempt execution loops with resource limit checks, fail-closed cost metering, durable checkpointing, and journal logging.
  - `resumeTask`: recovers interrupted/crashed runs by verifying GSD/Git HEAD consistency, reconciling unconfirmed effects against workspace disk state, and resuming the supervisor loop.
  - `verifyGsdStateConsistency`: guards against external git changes by checking `git rev-parse HEAD` against `lastVerifiedHead`.
  - `inspectTaskResumeReadiness`: dry-run probe returning readiness status, checkpoint metadata, consistency, and unapplied effect count.
  - `readEffectLedger` / `saveEffectLedger`: durable ledger I/O with atomic rename and schema validation.
- `src/core/task-gsd.ts` & `src/core/task-run.ts`:
  - Added `promptInjection` option to `dispatchGsdQuickPlan` and `startTask` to support Stage 1/2 adaptive repair instructions.
  - Added `allowPriorRun` flag to `startTask` allowing supervisor retry attempts without violating the single-run approval gate.
- `src/format.ts`:
  - `formatSupervisorReport`: human-readable output of supervisor result, usage breakdown, effect ledger summary, and blocked report or next actions.
  - `formatTaskResumeReadiness`: formatted table of resume readiness, checkpoint state, GSD consistency, and next resume command.
  - `formatTaskStatus`: formatted summary of task status, attempt/cycle, wall time, stop reason, effect counts, and journal event count.
- `src/cli.ts`:
  - `alpha-aos task resume <contract.json> [--contract-digest <digest>] [--apply]`:
    - Dry-run preview: calls `inspectTaskResumeReadiness`, prints preview table, exits with code 2 if not ready.
    - Live execution with `--apply`: verifies digest, calls `resumeTask`, prints report, exits 0 on accept, 1 on stop/block.
  - `alpha-aos task status <contract-id> [--run <run-id>]`: loads latest checkpoint and effect ledger from `stateRoot/runs/<digest>/`, formats and displays task status.
  - `alpha-aos task stop <contract-id> [--reason <reason>]`: transitions checkpoint to `stopped`, logs `limit_exceeded` journal event, and reports completion.
- `test/task-supervisor-recovery.test.ts` & `test/task-cli.test.ts`:
  - 7 integration tests covering crash recovery before/after effect write, Git HEAD divergence detection, cycle limit stoppage, wall time limit stoppage, and 3-stage adaptive repair escalation to blocked mode.
  - 4 CLI integration tests for `task resume` (not ready / ready), `task status`, and `task stop`.

## Verification
- `npm run check`: exit code 0 (TypeScript strict mode satisfied).
- `npm run build`: exit code 0.
- `node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-supervisor-recovery.test.js`: 32/32 tests pass.
- Full Phase 15 suite (53 tests): 53/53 tests pass.

## Self-Check: PASSED
