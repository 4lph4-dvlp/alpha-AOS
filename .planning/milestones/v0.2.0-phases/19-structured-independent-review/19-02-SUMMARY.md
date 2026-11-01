# Plan 19-02 Summary: Review Defect Classification & Pending Suggestions Persistence

## 1. Overview
- **Phase**: 19-structured-independent-review
- **Plan**: 19-02
- **Wave**: 2
- **Requirements Satisfied**: REV-02, REV-05
- **Objective**: Implement objective classification of review defects (blocking vs. advisory, in-scope vs. out-of-scope) based on independently verifiable evidence, and safely store out-of-scope proposals in external pending suggestion state without expanding approved contracts or modifying GSD planning files (Decisions D-02, D-05, D-06, D-07, D-08).

---

## 2. Key Decisions & Guarantees Implemented
- **Defect Impact Classification (D-02, D-05, D-07)**:
  - Missing functional requirements block (`blocking`) only when backed by confirmed reproductions (`confirmReviewerReproduction`) or objective check receipts.
  - Architectural defects block only when bound to an approved architecture rule ID (`ARCH-*`, `SEC-*`, `GSD-*`, `REL-*`, `POLICY-*`), a verified snapshot file location, documented impact, and deterministic pattern confirmation (`checkDescriptor`) or fresh-session direct inspection.
  - Style, formatting, and naming preferences are strictly classified as `advisory` (`kind: "style-preference"`) and never block a task verdict.
- **Out-of-Scope Reliability Threats (D-06)**:
  - Pre-existing issues outside the contract that compromise current run results or required evidence are classified as `out-of-scope` but `blocking` once verified.
- **External Pending Suggestions (D-08, REV-05, T-19-04)**:
  - Advisory proposals and unrelated improvements are saved to external host state (`<stateRoot>/tasks/<contractId>/suggestions.json`) with cryptographic content hashing and deduplication.
  - Suggestions maintain statuses: `pending`, `promoted`, or `discarded`.
  - Suggestions NEVER automatically expand or modify `.planning/` files or the active task contract. Promotion or disposal requires explicit actions with audit logs.
  - Task status, doctor diagnostics (`diagnoseGsdLifecycleStatus`), and reports (`formatGsdDoctorReport`, `formatTaskRunReport`) discover and present pending suggestions without treating them as blockers.

---

## 3. Key Changes Implemented

### Schemas
- [`schemas/task-review.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-review.schema.json):
  - Added `impact` and `checkDescriptor` (`kind`, `pattern`, `caseSensitive`, `inverted`) to `ruleConfirmation`.
  - Added optional `impact` and `scope` to `finding`.
- [`schemas/task-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-receipt.schema.json):
  - Added optional `reviewClassification` property to `run` definition (`findings`, `hasBlockingDefects`, `deferredSuggestionsCount`).

### Core Modules
- [`src/core/task-review-classification.ts`](file:///D:/dev/alpha-AOS/src/core/task-review-classification.ts) (New):
  - Created defect classification and aggregation engine (`classifyFinding`, `classifyReviewReport`).
  - Implemented heuristics for `isStylePreference()`, `isReliabilityThreat()`, and `isApprovedArchitectureRule()`.
  - Enforced that only verified, in-scope requirements or approved architecture rules with location & impact can result in `impact: "blocking"`.
- [`src/core/task-review-suggestions.ts`](file:///D:/dev/alpha-AOS/src/core/task-review-suggestions.ts) (New):
  - Created suggestions persistence and lifecycle management module.
  - `recordReviewSuggestions()`: Atomic transaction write under `<stateRoot>/tasks/<contractId>/suggestions.json` with deduplication by hash (`contractId:targetRevisionSha:summary`). Enforced credential checking via `assertNoRawCredentials` and text truncation limits.
  - `readTaskReviewSuggestions()`: Read suggestions and return typed items, raising errors on corrupt files rather than masking as empty.
  - `promoteTaskReviewSuggestion()` / `discardTaskReviewSuggestion()`: Safe status updates with recorded reviewer audits, strictly keeping `.planning/` untouched.
- [`src/core/task-check.ts`](file:///D:/dev/alpha-AOS/src/core/task-check.ts):
  - Extended `confirmReviewerRuleConfirmation()` to validate rule IDs using `isApprovedArchitectureRule()` and evaluate deterministic pattern descriptors (`TaskRuleCheckDescriptor`).
- [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts):
  - Integrated `classifyReviewReport()` into the review confirmation loop.
  - Filtered confirmation items so that non-blocking or advisory findings do not block verdict reduction.
  - Added automated persistence of deferred suggestions via `recordReviewSuggestions()`.
- [`src/core/task-doctor.ts`](file:///D:/dev/alpha-AOS/src/core/task-doctor.ts):
  - Added pending suggestions detection to `diagnoseGsdLifecycleStatus()`.
  - Formatted pending suggestions count and audit hints in `formatGsdDoctorReport()`.
- [`src/format.ts`](file:///D:/dev/alpha-AOS/src/format.ts):
  - Added `Pending deferred proposals` indicator to `formatTaskRunReport()`.

### Test Coverage
- [`test/task-review-classification.test.ts`](file:///D:/dev/alpha-AOS/test/task-review-classification.test.ts) (New):
  - 14 unit and integration tests verifying style preferences, reliability threats, approved rule validation, reproduction confirmation, unapproved rule handling, missing impact, and end-to-end non-blocking execution in `startFixtureTask`.
- [`test/task-review-suggestions.test.ts`](file:///D:/dev/alpha-AOS/test/task-review-suggestions.test.ts) (New):
  - 7 unit and integration tests verifying atomic persistence, idempotency/deduplication, explicit promote/discard operations without touching contracts, corrupted file handling, doctor report integration, and end-to-end capture in `startFixtureTask`.

---

## 4. Verification & Results
- `npm run build`: Success.
- `npm run check`: TypeScript static check passed with zero errors.
- Unit & Integration Test Suites:
  - `test/task-review-classification.test.ts`: 14 passed (100%).
  - `test/task-review-suggestions.test.ts`: 7 passed (100%).
  - `test/task-review-evidence.test.ts`: 10 passed (100%).
  - `test/task-verdict.test.ts`: 23 passed (100%).
  - `test/task-agents.test.ts`: 34 passed (100%).
  - Total: 88 passed out of 88 tests.
