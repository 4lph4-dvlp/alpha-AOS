# Plan 19-01 Summary: Structured Review Report Contract & Evidence Resolution

## 1. Overview
- **Phase**: 19-structured-independent-review
- **Plan**: 19-01
- **Wave**: 1
- **Requirements Satisfied**: REV-02, REV-04
- **Objective**: Establish structured independent review report contracts bound to exact git commits (`targetRevisionSha`) and verified snapshot/receipt evidence locators, implementing whole-report rejection for any incomplete or unresolvable reviews (Decisions D-01 through D-04).

---

## 2. Decision Checkpoint (Task 1)
- **Selected Option**: `v2-audit-v1` (Mandatory v2 reports with evidence locators; legacy v1 reports retained as audit data only and rejected as stale for mandatory reviews).
- **Rationale**: Completely prevents false pass promotions from legacy free-text reviews without breaking read compatibility for historical task runs and transaction receipts.

---

## 3. Key Changes Implemented

### Schemas
- [`schemas/task-review.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-review.schema.json):
  - Upgraded to `schemaVersion: 2`.
  - Added required `targetRevisionSha: string`.
  - Replaced free-text evidence with typed `locator` (`snapshot-file` with `identifier`, `inspectedRange`, `digest` OR `check-receipt` with `identifier`, `digest`).
  - Added structured `ruleConfirmation` support under `finding` (`ruleId`, `ruleSource`, `inspectedPath`, `observedViolation`).
- [`schemas/task-receipt.schema.json`](file:///D:/dev/alpha-AOS/schemas/task-receipt.schema.json):
  - Added optional `locator` support under `TaskVerdictRow.review` for historical and forward compatibility.

### Core Modules
- [`src/core/task-review-evidence.ts`](file:///D:/dev/alpha-AOS/src/core/task-review-evidence.ts):
  - Created dedicated module implementing `validateTaskReviewEvidence()` and exporting all review report/evidence contracts.
  - Implemented identity binding checks (`requestId`, `contractId`, `contractDigest`, `artifactDigest`, `targetRevisionSha`, `currentHeadSha` drift detection).
  - Enforced all-or-nothing criteria matching (omitting, repeating, or adding unknown criteria rejects the entire report per D-03).
  - Implemented deterministic locator resolution against reviewed snapshot files (checking path confinement, regular file status, content hash, line range bounds) and check receipts.
  - Provided `TASK_REVIEW_V1_SCHEMA` for audit parsing.
- [`src/core/task-check.ts`](file:///D:/dev/alpha-AOS/src/core/task-check.ts):
  - Added `confirmReviewerRuleConfirmation()` to safely inspect architectural rule violations in snapshot files without executing arbitrary reviewer-supplied commands (D-02).
- [`src/core/task-verdict.ts`](file:///D:/dev/alpha-AOS/src/core/task-verdict.ts):
  - Updated `assessTaskReview()` to enforce `schemaVersion: 2`, match `targetRevisionSha`, check `evidenceResult`, reject legacy v1 reports as stale, and fail closed if any contract criteria are missing.
  - Updated `reduceTaskVerdict()` to propagate locators and rule confirmations into `TaskVerdictRow`.
- [`src/core/task-run.ts`](file:///D:/dev/alpha-AOS/src/core/task-run.ts):
  - Bound `targetRevisionSha` from git `HEAD` into `ReviewRequest`.
  - Updated `validateReport()` to parse v2 and fallback to v1 for audit.
  - Integrated `validateTaskReviewEvidence()` before `assessTaskReview()`.
  - Added rule confirmation evaluation to confirmation resolution.
- [`src/core/validation.ts`](file:///D:/dev/alpha-AOS/src/core/validation.ts):
  - Added version 2 route support for `task-agent-output`.
- [`src/adapters/task-claude.ts`](file:///D:/dev/alpha-AOS/src/adapters/task-claude.ts):
  - Updated prompt generator (`buildReviewPrompt`) to echo `targetRevisionSha`, require locators, and instruct on `ruleConfirmation`.

### Test Coverage
- [`test/task-review-evidence.test.ts`](file:///D:/dev/alpha-AOS/test/task-review-evidence.test.ts):
  - Created 10 unit and integration tests covering positive tracer pass, missing criteria (D-03), path traversal / unconfined locators, file digest mismatch, line range bounds, unresolvable check receipts, revision drift against HEAD, legacy v1 rejection, and end-to-end rule confirmation rejection.
- [`test/task-verdict.test.ts`](file:///D:/dev/alpha-AOS/test/task-verdict.test.ts):
  - Updated test doubles and assertions to v2 reports, testing all-or-nothing criteria behavior and staleness. All 23 tests pass.
- [`test/task-agents.test.ts`](file:///D:/dev/alpha-AOS/test/task-agents.test.ts):
  - Updated reviewer mock reports to v2 with locators. All 34 tests pass.

---

## 4. Verification
- `npm run build`: Success.
- `node scripts/run-tests.mjs --files dist/test/task-review-evidence.test.js dist/test/task-verdict.test.js dist/test/task-check.test.js dist/test/task-contract.test.js dist/test/task-run.test.js dist/test/task-agents.test.js`: All 119 tests pass (0 failures).
- `npm run check`: TypeScript static analysis clean (0 errors).
