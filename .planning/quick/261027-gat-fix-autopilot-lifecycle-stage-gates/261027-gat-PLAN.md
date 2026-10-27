---
phase: quick-261027-gat
plan: "01"
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/core/task-gsd-gates.ts
  - src/core/task-gsd-lifecycle.ts
  - src/core/task-gsd-discovery.ts
  - test/task-autopilot-gates.test.ts
  - test/task-gsd-lifecycle.test.ts
  - test/task-gsd-multi-phase.test.ts
must_haves:
  - Strict execution summaries validation (hasExecutionSummaries) rejecting PLANNING-SUMMARY collisions and partial execution
  - Strict verification gate check (hasPassedVerification) verifying status: passed and rejecting gaps_found / human_needed / stale / missing
  - Strict validation gate check (hasNyquistValidation) verifying status: validated and nyquist_compliant: true
  - Lifecycle step progression fail-closed on unexecuted plans or verification gaps
  - discoverPhaseProgression fails closed when verification has gaps
  - 100% green test suite with regression tests
---

# Fix Autopilot Lifecycle Stage Gates and Prevent Premature Advancement

## Context & Evidence

During an autonomous autopilot run, Phase 03 planning created 13 plans and `03-PLANNING-SUMMARY.md`.
The autopilot lifecycle runner matched `*-SUMMARY.md`, mistaking `03-PLANNING-SUMMARY.md` for execution completion, skipping execution entirely.
The verify step then ran, correctly detecting 0/13 implemented code and recording `status: gaps_found` in `03-VERIFICATION.md`.
However, because stage gates checked only shallow file existence rather than frontmatter status, the runner falsely considered verification passed and advanced prematurely to Phase 04.

## Implementation Tasks

1. **`src/core/task-gsd-gates.ts`**:
   - Create canonical gate validation module.
   - Implement `extractFrontmatter(content: string): Record<string, string>`.
   - Implement `hasExecutionSummaries(phaseDir: string | null | undefined, phaseId: string): boolean`.
   - Implement `hasPassedVerification(phaseDir: string | null | undefined, phaseId: string, options?: { projectRoot?: string }): boolean`.
   - Implement `hasNyquistValidation(phaseDir: string | null | undefined, phaseId: string): boolean`.
   - Implement `passesMilestoneReview(contractPath: string, reviewer: string, projectRoot: string): boolean`.

2. **`src/core/task-gsd-lifecycle.ts`**:
   - Update `enumerateProducedArtifacts` to ignore `*-PLANNING-SUMMARY.md` under `execute`.
   - In `executeGsdStep`: fail-closed if `execute` step finishes without all execution summaries.
   - In `executeGsdStep`: fail-closed if `verify` step finishes with verification gaps (`hasPassedVerification` is false).

3. **`src/core/task-gsd-discovery.ts`**:
   - In `discoverPhaseProgression`: ensure `isPhaseComplete` is false if `hasPassedVerification` is false.

4. **Tests & Regression Verification**:
   - Update mock scripts in `test/task-gsd-lifecycle.test.ts` and `test/task-gsd-multi-phase.test.ts` to output standard `status: passed` frontmatter.
   - Add comprehensive tests in `test/task-autopilot-gates.test.ts`.
   - Run `npm run check` and `npm test` to confirm all 865+ tests pass with zero regressions.
