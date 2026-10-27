---
quick_id: 261027-gat
status: complete
completed: true
updated: 2026-10-27
blocker: none
---

# Autopilot Lifecycle Stage Gates Repair — Execution Summary

Fixed the premature lifecycle advancement bug where autopilot runners skipped execution and prematurely advanced across GSD phases due to loose suffix matching and shallow existence checks.

## Key Changes Implemented

1. **New Stage Gate Oracle Module (`src/core/task-gsd-gates.ts`)**:
   - `hasExecutionSummaries(dir, phase)`: Performs 1:1 correlation between all plan files (`*-PLAN.md`) and their corresponding execution summary files (`*-SUMMARY.md`). Explicitly ignores planning summary files (`*-PLANNING-SUMMARY.md`) and rejects empty phases, partial executions, or directories masquerading as files.
   - `hasPassedVerification(dir, phase, options)`: Inspects verification frontmatter `status` (or queries `gsd-tools verification.status`) and asserts `status === "passed"`. Rejects `gaps_found`, `human_needed`, `stale`, and missing verification artifacts. Also asserts `status: clean` for any accompanying `*-REVIEW.md`.
   - `hasNyquistValidation(dir, phase)`: Enforces `status: validated` and `nyquist_compliant: true`. Explicitly rejects `status: draft` or incomplete wave 0 validation.
   - `passesMilestoneReview(contractPath, reviewer, projectRoot)`: Verifies milestone review status.

2. **GSD Lifecycle & Discovery Integration**:
   - `src/core/task-gsd-lifecycle.ts`: Updated `enumerateProducedArtifacts` to ignore `*-PLANNING-SUMMARY.md`. Added stage gate enforcement in `executeGsdStep` to fail closed if `execute` step finishes without complete execution summaries or if `verify` step finishes with verification gaps.
   - `src/core/task-gsd-discovery.ts`: In `discoverPhaseProgression`, phase completion is rejected if a verification artifact exists with `gaps_found` or fails gate checks.

3. **Regression Tests**:
   - Added `test/task-autopilot-gates.test.ts` covering planning-summary collisions, partial executions, verification gap rejection, and Nyquist validation.
   - Updated mock scripts in `test/task-gsd-lifecycle.test.ts` and `test/task-gsd-multi-phase.test.ts` to output standard `status: passed` frontmatter.
   - Full test suite passed 870/870 tests green (100%).
