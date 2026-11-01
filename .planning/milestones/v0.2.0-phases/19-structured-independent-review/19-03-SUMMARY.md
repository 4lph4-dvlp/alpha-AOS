# Plan 19-03 Summary: Cause-Based Defect Deduplication, GSD Repair Routing & Reverification

## 1. Overview
- **Phase**: 19-structured-independent-review
- **Plan**: 19-03
- **Wave**: 3
- **Requirements Satisfied**: REV-04
- **Objective**: Reconcile verified review defects by objective root causes across multiple criteria, bind each confirmed cause to a single idempotent GSD repair item, and strictly enforce whole-contract reverification with fresh revisions and witness sessions before marking defects resolved (Decisions D-09, D-10, D-11, D-12).

---

## 2. Key Decisions & Guarantees Implemented

- **Cause-Based Deduplication (D-09, D-12, T-19-05)**:
  - Multiple criteria pointing to the same verified root cause (e.g. identical architectural rule + file path + check pattern, or identical reproduction input) are unified into a single `FindingRecord` while preserving per-criterion evaluation.
  - Similar prose summaries or failure fingerprints do NOT trigger false merges when objective root causes differ.
- **Single GSD Repair Routing (D-09, REV-04)**:
  - Each confirmed root cause routes to exactly one GSD repair gap item (`routeVerificationGap`), stored under external state (`<stateRoot>/tasks/<contractId>/findings.json`).
  - GSD routing is idempotent; re-running or resuming tasks preserves existing GSD item references without generating duplicate tasks.
- **Strict Whole-Contract Reverification (D-10, T-19-06)**:
  - Executing a repair plan transitions a finding to `repaired`, NEVER `resolved`.
  - Resolution requires `reverifyFindingResolution`:
    1. A newer git revision than the detection revision (`newHeadSha !== originalSha`).
    2. Verification that the original reproduction or rule violation no longer occurs.
    3. Full contract reverification (`requireFullContractReverification`) passing for ALL contract criteria.
    4. A fresh `ReviewWitnessReceipt` from a new review session matching the new revision with `witnessVerdict === "accepted"`.
  - Stale receipts or unmodified revisions are immediately refused.
- **Recurrence Tracking (D-11)**:
  - Resolved findings reopen (`reopened`) only when verified failure evidence recurs in a newer revision.
  - The chronological event lifecycle (`detected` -> `routed` -> `repaired` -> `resolved` -> `reopened`) is immutably preserved in external task state.

---

## 3. Key Changes Implemented

### Core Modules
- [`src/core/task-review-findings.ts`](file:///D:/dev/alpha-AOS/src/core/task-review-findings.ts) (New):
  - `computeRootCauseKey()`: Calculates deterministic root-cause signatures distinguishing architectural violations, command reproductions, and criterion-specific causes.
  - `extractCandidateFindings()`: Extracts candidate findings from review reports and defect classifications.
  - `recordOrReconcileFindings()`: Atomically reconciles new observations against external state, merging matching causes and reopening recurred defects.
  - `attachFindingGsdRouting()`: Idempotently attaches GSD gap decisions to findings.
  - `markFindingRepaired()`: Records repair completion without prematurely resolving defects.
  - `reverifyFindingResolution()`: Enforces full re-verification against fresh revisions, sessions, and complete contract criteria.
- [`src/core/task-supervisor.ts`](file:///D:/dev/alpha-AOS/src/core/task-supervisor.ts):
  - Integrated `extractCandidateFindings` and `recordOrReconcileFindings` into the attempt loop on rejection.
  - Connected confirmed unrouted defects to `routeVerificationGap` and `attachFindingGsdRouting`.

### Test Coverage
- [`test/task-review-repair.test.ts`](file:///D:/dev/alpha-AOS/test/task-review-repair.test.ts) (New):
  - 7 unit and integration tests verifying multi-criterion deduplication (D-09), disparate cause separation (D-12, T-19-05), idempotent GSD routing, repaired-not-resolved semantics (D-10, T-19-06), reverification failure modes (unmodified revision, lingering defect, incomplete criteria, missing receipt), successful reverification with fresh receipt, and recurrence transition with full event history (D-11).

---

## 4. Verification & Results
- `npm run build`: Success.
- `npm run check`: Strict TypeScript checks passed with zero errors.
- Test execution:
  - `test/task-review-repair.test.ts`: 7 passed (100%).
  - Full supervisor recovery and review suites (68 tests total): 100% pass.
