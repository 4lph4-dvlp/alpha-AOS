---
phase: 16-composable-harness-roles
plan: "04"
subsystem: core
tags: [reviewer-isolation, different-reviewer-policy, tree-mutation-guard, task-contract, task-run]
requires: ["16-01"]
provides: [reviewer-diversity-policy, reviewer-ephemeral-isolation, tree-mutation-guard]
affects: [task-contract, task-run, tree-mutation-guard]
tech-stack:
  added: []
  patterns: [ephemeral-session-isolation, pre-post-tree-snapshotting, fail-closed-mutation-guard]
key-files:
  created:
    - src/core/tree-mutation-guard.ts
    - test/task-tree-guard.test.ts
  modified:
    - schemas/task-contract.schema.json
    - src/core/task-contract.ts
    - src/core/task-run.ts
    - test/task-contract.test.ts
key-decisions:
  - "D-09: Same-harness reviewer runs in a fresh, separately identified read-only session with an isolated ephemeral directory and unique reviewerSessionId."
  - "D-10: differentReviewerPolicy ('require-different-harness' | 'require-different-model' | 'allow-same') in TaskContract rejects matching reviewer fail-closed at contract preview."
  - "D-11: TreeMutationGuard takes pre/post review snapshots and invalidates any review modifying project tree with INVALID_MUTATING_REVIEW."
requirements-completed: [ROL-04]
coverage:
  - deliverable: "differentReviewerPolicy schema and contract validation"
    verification:
      kind: command
      ref: "dist/test/task-contract.test.js#differentReviewerPolicy require-different-harness rejects matching reviewer and accepts distinct harnesses (ROL-04, D-10)"
      status: pass
    human_judgment: false
  - deliverable: "TreeMutationGuard pre/post review snapshotting and INVALID_MUTATING_REVIEW invalidation"
    verification:
      kind: command
      ref: "dist/test/task-tree-guard.test.js"
      status: pass
    human_judgment: false
duration: 8 min
completed: 2026-10-02
---

# Phase 16 Plan 04: Same-Harness Reviewer Isolation, differentReviewerPolicy & TreeMutationGuard Summary

Implemented reviewer diversity policy enforcement (`differentReviewerPolicy`), same-harness ephemeral configuration isolation, and pre/post review workspace tree mutation protection (`TreeMutationGuard`) invalidating violating reviews with `INVALID_MUTATING_REVIEW` (ROL-04, D-09, D-10, D-11).

## Accomplishments
- Extended `schemas/task-contract.schema.json` and `src/core/task-contract.ts` with `differentReviewerPolicy` enum (`require-different-harness`, `require-different-model`, `allow-same`), enforcing fail-closed contract preview validation when reviewer matches controller or executor under `require-different-harness`.
- Updated `src/core/task-run.ts` to isolate same-harness reviewer executions into dedicated ephemeral directories (`scratch/reviewer-env-*`) with fresh session IDs and clean environment mappings (`CLAUDE_CONFIG_DIR`, `HERMES_HOME`, etc.).
- Implemented `src/core/tree-mutation-guard.ts` providing `captureTreeSnapshot` and `evaluateTreeMutations`, accurately detecting created, modified, and deleted workspace files while safely filtering OS noise files (`.DS_Store`, `Thumbs.db`, `desktop.ini`).
- Integrated `TreeMutationGuard` into `src/core/task-run.ts` immediately before and after reviewer execution, invalidating violating reviews with `INVALID_MUTATING_REVIEW` and attaching a failing `reviewer-tree-integrity` precondition.
- Created `test/task-tree-guard.test.ts` with 6 comprehensive unit and integration tests and updated `test/task-contract.test.ts` to verify all 5 controllers loading and `differentReviewerPolicy` behaviors.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-tree-guard.test.js dist/test/task-contract.test.js && npm run check`: All 31 tests passed, 0 type errors.

## Next Steps
- Wave 4 (Plan 16-05): Implement `task-telemetry.ts` (D-13, D-14, D-15), missing telemetry limit gate (`MISSING_TELEMETRY_METER`), and 3D Task Doctor diagnostics in `task-doctor.ts` and `cli.ts` (ROL-05, D-16, D-17).
