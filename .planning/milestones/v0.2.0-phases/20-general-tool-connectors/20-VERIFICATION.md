---
phase: 20-general-tool-connectors
verified: 2026-10-10T15:45:00Z
status: passed
score: 4/4 success criteria verified
covered_files:
  - schemas/task-connector-manifest.schema.json
  - schemas/task-receipt.schema.json
  - src/adapters/coursepilot-task.ts
  - src/core/task-connector.ts
  - src/core/task-run.ts
  - src/core/task-contract.ts
  - src/cli.ts
  - src/format.ts
  - test/task-connector.test.ts
  - test/task-coursepilot-run.test.ts
  - test/task-coursepilot-report.test.ts
behavior_unverified: 0
overrides_applied: 0
---

# Phase 20: General Tool Connectors Verification Report

## Phase Goal
The same contract/run/review engine can execute non-code work and prove per-item outcomes with CoursePilot as the first real connector.

## Requirements Coverage
| Requirement | Status | Verification Reference |
|---|---|---|
| **TOOL-01**: General connector protocol and itemized execution without Git diff assumptions | PASS | `dist/test/task-connector.test.js`, `dist/test/task-coursepilot-run.test.js` |
| **TOOL-02**: CoursePilot materials contract, multi-level file identity preservation, and SHA-256 verification | PASS | `dist/test/task-coursepilot-run.test.js`, `dist/test/task-coursepilot-report.test.js` |
| **TOOL-04**: Sanitization of untrusted LMS data, partial download recovery, and fail-closed security | PASS | `dist/test/task-coursepilot-report.test.js`, `dist/test/task-connector.test.js` |

## Success Criteria Verification

### 1. General Connector Itemized Execution (SC1)
- **Status:** PASS
- **Evidence:** `test/task-connector.test.ts` verifies that non-code tasks execute through `TaskConnectorPort`, itemizing tasks into deterministic item receipts without assuming Git repositories, code compilation, or test runners.

### 2. Multi-Level CoursePilot Material Verification (SC2)
- **Status:** PASS
- **Evidence:** `test/task-coursepilot-run.test.ts` tests CoursePilot material downloads across complex course structures. Files are stored and verified with hierarchical uniqueness (`${courseId}:${weekId}:${moduleId}:${fileId}`), preventing file name collisions. Saved vs unsaved counts and SHA-256 digests on disk are strictly verified.

### 3. Partial Failure Isolation & Next Action Routing (SC3)
- **Status:** PASS
- **Evidence:** `test/task-coursepilot-report.test.ts` verifies that partial download failures preserve successful item evidence in the effect ledger, queue failed items for auto-retry, and map unrecoverable fatal errors to specific next actions (`manual_check`, `reapproval_required`, `blocked`).

### 4. Idempotent Reconciliation & Hostile String Sanitization (SC4)
- **Status:** PASS
- **Evidence:** `test/task-coursepilot-report.test.ts` tests idempotency on repeated runs: existing verified files are reconciled without duplicate downloads. LMS material titles containing shell commands or prompt-injection payloads (`IGNORE ALL PREVIOUS INSTRUCTIONS`) are sanitized via `sanitizeLmsString` and treated strictly as passive data.

## Automated Test Results
- Plan 20 Test Suites (`task-connector`, `task-coursepilot-run`, `task-coursepilot-report`): 29 tests passed, 0 failed.
- Full Project Regression Suite: 1,561 tests (1,551 passed, 0 failed, 10 skipped).
- TypeScript compilation: `npm run check` clean with 0 errors.

---

_Verified: 2026-10-10T15:45:00Z_  
_Verifier: Claude (gsd-verifier)_
