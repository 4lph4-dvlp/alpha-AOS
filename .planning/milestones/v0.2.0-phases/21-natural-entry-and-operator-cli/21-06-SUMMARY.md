# Phase 21 Plan 06: Comprehensive Audit Report with Unresolved Criteria and Provenance Summary

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-06  
**Requirements:** UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-06 delivers a comprehensive audit report for both development and general tasks, displaying all mandatory criteria, failed/unresolved items first, action-oriented next steps, verified individual evidence, and unmetered provenance:

1. **D-15 Unresolved Criteria & Action-First Layout**:
   - `formatTaskRunReport` in `src/format.ts` partitions mandatory criteria into unresolved (failed/unknown) and verified pass sets without omitting any criterion.
   - When unresolved criteria exist, an "Unresolved Mandatory Criteria" table and "Unresolved Criteria Next Actions" are printed at the top of the report before verified passing criteria.
   - All passed criteria are presented in a dedicated "Passed Mandatory Criteria (Verified)" table with full measurement outcomes, review verdicts, and artifact digests.
2. **D-15 / T-21-12 Review Evidence & Artifact Stale Protection**:
   - `normalizeTaskRunForReport` in `src/core/task-read.ts` verifies that passing criteria rows are strictly bound to the current artifact digest and have mandatory review evidence.
   - If a reviewer report or locator is bound to a stale artifact digest, or if review evidence is missing, the criterion is judged as `unknown` with concrete explanation and actionable next step, preventing false `accepted` status claims (UX-03).
3. **D-11 Execution Identity & Provenance Parity**:
   - Both human text and JSON reports display `Run: <runId>` and `Started at: <startedAt>`, eliminating execution ambiguity across chat boundaries.
   - Human and JSON modes maintain identical criterion IDs and verdict mappings.
4. **General Task Report Details & Unmetered Usage (UX-03)**:
   - `formatGeneralTaskReport` displays aggregate denominator counts (Approved Target Total, Verified Complete, Partial Complete, Failed / Unsaved, Pending Unapproved), material and file-level statuses, and next actions.
   - Includes Section 4: Execution & Resource Provenance with executor and reviewer harness/version identities, explicitly rendering `Tokens: (unmetered)` and `Cost (USD): (unmetered)` without fabricating fake zeros.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-review.test.js dist/test/task-cli.test.js && npm run check`:
  - 41 tests executed across `task-cli-review` and `task-cli`.
  - 41 tests passed, 0 failures.
  - Strict TypeScript check (`tsc -p tsconfig.json --noEmit`) clean with zero errors.
- `node scripts/run-tests.mjs --files dist/test/task-cli-capabilities.test.js`:
  - 10 tests passed, 0 failures.

---

## 3. Files Modified

- `src/core/task-read.ts`: Added `normalizeTaskRunForReport` to fail closed on stale reviewer artifact digests or missing reviews.
- `src/cli.ts`: Updated `task report` to pass normalized run records to `print` and `formatTaskRunReport`.
- `src/format.ts`: Updated `formatTaskRunReport` and `formatGeneralTaskReport` to prioritize unresolved criteria, show startedAt, and include execution provenance.
- `test/task-cli-review.test.ts`: Added comprehensive test coverage for unresolved criteria prioritization, stale artifact handling, review absence, human/JSON parity, and general task report formatting.
