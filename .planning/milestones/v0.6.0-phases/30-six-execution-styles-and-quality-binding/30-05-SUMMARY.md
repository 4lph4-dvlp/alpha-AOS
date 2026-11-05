# Phase 30 Plan 05 Summary: Approved Phase Scope Binding, Boundary Enforcement, and Blocked-Phase Stop

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** STYLE-06, STYLE-07

## What was built

1. **Exact Approved Phase Selection with Legacy Digest Compatibility (`src/core/task-contract.ts`, `schemas/task-contract.schema.json`, `schemas/task-receipt.schema.json`, `src/format.ts`)**:
   - Added optional `TaskPhaseSelection` interface:
     ```ts
     export interface TaskPhaseSelection {
       readonly phaseIds: readonly string[];
       readonly roadmapSha256: string;
     }
     ```
   - Extended `TaskScope` and `DigestableTaskContract["scope"]` with `phaseSelection?: TaskPhaseSelection`.
   - Updated `schemas/task-contract.schema.json` with strict schema validation for `phaseSelection` under `scope`: max 64 items, unique phaseIds matching native phase syntax (`^[0-9]+(?:\.[0-9]+)?[a-zA-Z0-9_-]*$`), and 64-character hex `roadmapSha256`.
   - Updated `schemas/task-receipt.schema.json` to allow `phaseSelection` under `gsd` projection on task receipts.
   - Enforced in `validateTaskContract`:
     - `phaseSelection` is allowed only for `development` contracts with effective workflow `gsd` or `gsd-multi-phase`.
     - Rejects `phaseSelection` on `gsd-quick` or `general` contracts.
     - Validates non-empty `phaseIds`, uniqueness, max 64 items, native ID syntax (including decimal phases e.g. `02.1`), and lowercase 64-hex SHA-256.
   - In `digestableTaskContract`: normalized `phaseIds` (preserving exact array order and NFC normalization) and `roadmapSha256` (lowercase). Preserved byte-for-byte identical canonical views and digests for legacy contracts where `phaseSelection` is absent.
   - In `changedContractFields`: added comparison for `scope.phaseSelection`, detecting additions, deletions, reorderings, and revisions under the closed vocabulary.
   - In `previewTaskContract`: populated `executionStyle.phaseSelection` and `executionStyle.scopeBoundaryReason` detailing approved phase count and roadmap revision prefix.
   - In `src/format.ts`: formatted approved phase selection in task previews and run reports.

2. **Approved Phase Scope Resolution and Lifecycle Boundary Enforcement (`src/core/task-phase-scope.ts`, `src/core/task-gsd-lifecycle.ts`, `src/core/task-run.ts`)**:
   - Created `src/core/task-phase-scope.ts`:
     - `resolveApprovedPhaseSelection`:
       - If contract has explicit `scope.phaseSelection`, validates requested subsets against approved `phaseIds` and preserves approved relative ordering.
       - If legacy approval has no metadata, derives approved selection from the git baseline `.planning/ROADMAP.md` at `baseCommit`. If no trustworthy baseline exists, fails closed with `scope-binding-required`.
     - `verifyPhaseScopeBoundary`:
       - Checks that currently executing phase belongs to `approvedSelection.phaseIds`.
       - Inspects live `.planning/ROADMAP.md` to ensure no unauthorized phases were added live, distinguishing native GSD progress edits (`- [x] Phase 01: ...`) from unauthorized scope expansions.
   - Exported `parsePhasesFromRoadmap` in `src/core/task-gsd-lifecycle.ts` with extended regex matching decimal phase IDs.
   - Integrated `resolveApprovedPhaseSelection` and `verifyPhaseScopeBoundary` into `orchestrateMultiPhaseProgression` in `src/core/task-gsd-lifecycle.ts`:
     - Replaced mutable live roadmap phase parsing with approved selection resolution before progression starts.
     - Verified boundaries before each phase lifecycle execution.
     - Returned `phaseSelection` and exact `stopReason` on early halts.
   - In `startMultiPhaseTask` (`src/core/task-run.ts`), recorded `phaseSelection` in `run.gsd.phaseSelection` and persisted exact `stopReason` on failure.

3. **Blocked-Phase Stop and Remaining-Slice Recovery Verification (`test/task-phase-scope.test.ts`, `test/task-gsd-multi-phase.test.ts`)**:
   - Verified that a blocked/failed phase halts execution fail-closed, leaving subsequent phases with exactly 0 command invocations (including 0 plan calls).
   - Verified that interrupted phase execution preserves uncommitted user WIP (`preserved-wip.txt`) and partial summaries, and resumes only remaining pending slices (skipping already completed `discuss` and `plan` steps).
   - Verified that live addition of unapproved phases into `ROADMAP.md` is rejected at the boundary before execution.
   - Verified legacy contract compatibility, round-trip preview and approval preservation, drift detection, and input validation rejections.

## Verification Evidence

- `npm run check`: Passed (0 errors).
- `npm run build`: Passed (342 inputs, 674 outputs).
- Targeted test suites:
  - Task 30-05-01:
    - `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-contract.test.js dist/test/task-gsd-multi-phase.test.js`: 39 tests passed, 0 failures.
  - Task 30-05-02:
    - `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-gsd-lifecycle.test.js dist/test/task-gsd-multi-phase.test.js dist/test/task-gsd-discovery.test.js`: 32 tests passed, 0 failures.
  - Task 30-05-03:
    - `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-gsd-lifecycle.test.js dist/test/task-gsd-multi-phase.test.js`: 28 tests passed, 0 failures.

## Commits

1. `2b931a7`: `feat(task-contract): add phaseSelection to contract scope with legacy digest compatibility`
2. `6e3fb39`: `feat(task-phase-scope): enforce approved phase selection at lifecycle boundaries`
3. `18fff41`: `test(task-phase-scope): verify blocked-phase stop and remaining-slice recovery`
