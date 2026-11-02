# Phase 30 Plan 04 Summary: Mandatory Additive Full-Stage Precondition and Exact Partial-Run Recovery

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** STYLE-04, STYLE-05, STYLE-07

## What was built

1. **Mandatory Additive Full-Stage Precondition (`src/core/task-run.ts`, `schemas/task-receipt.schema.json`, `src/format.ts`)**:
   - Extended `TaskRunGsd` and `schemas/task-receipt.schema.json` with an optional `fullEvidence?: TaskGsdFullEvidence` projection on task receipts.
   - When running a task contract with effective `full` quality (`contract.scope.workflow === "gsd-quick"` and `contract.scope.quickQuality === "full"`), `startTask` performs strict post-dispatch evidence validation via `verifyGsdFullEvidence`:
     - Reads all native stage receipts for the run via `listStageReceipts`.
     - Validates exact bindings (root, contractDigest, revision, runId, quickId, workflowSha256).
     - Verifies on-disk SHA-256 hashes for all input and output artifacts.
     - Adds a mandatory additive precondition `full-quality-stages` into `preconditions` before calling `reduceTaskVerdict`.
   - Any missing, failed, or invalid stage results in an unsatisfied `full-quality-stages` precondition, causing `reduceTaskVerdict` to reduce to `unknown` (or `rejected` on criterion failure), refusing acceptance.
   - Preserves standard minimum GSD quick evidence requirements for contracts with standard quality without requiring stage observation.
   - Updated `formatTaskRunReport` in `src/format.ts` to display full quality stage status (`fe.status`), detailed per-stage outcomes, evaluated commits, receipts, missing/failed stages, and unsatisfied preconditions with clear remediation next actions.

2. **Exact Partial-Run Recovery and Dirty WIP Preservation (`src/core/task-supervisor.ts`, `src/core/task-journal.ts`, `src/core/task-run.ts`)**:
   - Extended `TaskCheckpoint` in `src/core/task-journal.ts` to record `stageReceiptIds`, `quickId`, `nativeSessionId`, and `workflowSha256`.
   - Added `"stage_receipt_recorded"` event kind to `TaskJournalEventKind`.
   - Narrowed the dirty-baseline exception in `startTask` to permit exact approved full quick prior runs on resume (`isApprovedFullQuick`) after validating original baseline, checkpoint revision/root/quickId and verifying 0 effects violations.
   - In `resumeTask` within `src/core/task-supervisor.ts`:
     - Validates single quick directory under `.planning/quick/`, rejecting ambiguous or multiple conflicting quick directories.
     - Validates workflow SHA against installed GSD outline, rejecting incompatible workflow modifications.
     - Revalidates existing stage receipts and artifact hashes without resetting or duplicating the quick directory (quick directory count remains exactly one).
     - Preserves partial summaries, uncommitted bytes, and already verified stages across supervisor recovery loops.

3. **Composed Full Regression Suite (`test/task-gsd-full-run.test.ts`)**:
   - Composed full preview → approve → start → verdict lifecycle tests using authentic fixture environments.
   - Verified that a valid full run with all 7 observed stages and matching disk artifacts achieves `accepted` status with `fullEvidence.status === "verified"`.
   - Verified that ordinary-only evidence (exit 0 and standard quick artifacts) is refused for full quality contracts (verdict is `unknown`, with unsatisfied `full-quality-stages` precondition).
   - Verified that fake `--full` claim with exit 0 is rejected without valid observed receipts.
   - Verified that missing any stage (e.g., verification) or failed stage (e.g., plan-check failed) fails acceptance.
   - Verified that stale checker plan (where plan artifact on disk does not match receipt hash) fails acceptance as `invalid`.
   - Verified that standard quality contracts continue to accept ordinary quick evidence without requiring stage observation.
   - Verified that same-run full resume reuses valid stages, preserves dirty WIP in working directory, and maintains exactly one quick directory.
   - Verified that `resumeTask` rejects multiple ambiguous quick directories and incompatible workflow hashes.

## Verification Evidence

- `npm run check`: Passed (0 errors).
- `npm run build`: Passed (340 inputs, 670 outputs).
- Targeted test suites:
  - Task 30-04-01 verify suite:
    - `dist/test/task-gsd-full-run.test.js`: 11 tests passed.
    - `dist/test/task-gsd-stages.test.js`: 8 tests passed.
    - `dist/test/task-gsd-adversarial.test.js`: 3 tests passed.
    - `dist/test/task-contract.test.js`: 31 tests passed.
    - Result: 53 tests passed, 0 failures.
  - Task 30-04-02 verify suite:
    - `dist/test/task-gsd-full-run.test.js`: 11 tests passed.
    - `dist/test/task-supervisor-recovery.test.js`: 8 tests passed.
    - `dist/test/task-gsd-lifecycle.test.js`: 13 tests passed.
    - `dist/test/task-intake-continuity.test.js`: 4 tests passed.
    - Result: 36 tests passed, 0 failures.

## Commits

1. `7181aa9`: `feat(task-run): require mandatory additive full-stage precondition for full acceptance`
2. `4bdfdd3`: `feat(task-supervisor): resume remaining full stages and preserve wip`
