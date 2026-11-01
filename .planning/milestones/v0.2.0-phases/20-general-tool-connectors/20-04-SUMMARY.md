# Phase 20 Plan 04 Summary: File Evidence Verification & Aggregate Counters

## 1. Overview
- **Phase:** 20-general-tool-connectors
- **Plan:** 04 (`20-04-PLAN.md`)
- **Objective:** Independently verify downloaded file receipts against disk evidence, separate newly downloaded and previously verified files, deduplicate shared physical files, and accurately distinguish physical file counts from item (material) completion (D-05..D-08, D-12, D-17, TOOL-01, TOOL-02).

---

## 2. Completed Tasks

### Task 1: Verify saved files and source identity with physical bytes and hashes
- **Implementation:**
  - Implemented `verifyConnectorFileReceipt` in [src/core/task-connector-files.ts](file:///D:/dev/alpha-AOS/src/core/task-connector-files.ts): verifies regular files, rejects symlinks and directory escapes (`path-traversal`), checks source identity matching, and measures actual file length and sha256 checksums.
  - Implemented strict `previously-confirmed` origin validation: requires a matching prior receipt and identical current file sha256, refusing to accept `skipped` claims without source-bound verification.
  - Added unit test suite in [test/task-coursepilot-files.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-files.test.ts) covering success, source mismatch, missing files, path escape, size/hash divergence, and symlink rejection.

### Task 2: Separate physical file deduplication, partial attachments, and reverification
- **Implementation:**
  - Implemented `summarizeConnectorFiles`: deduplicates physical files by `canonicalPath` across items (e.g. shared handouts count once physically while satisfying distinct material links).
  - Enforced material completion criteria: requires all required files to be verified AND `attachmentsComplete === true` (D-17); incomplete/uninspected attachments remain `unknown` or `partial`.
  - Implemented `reverifyConnectorReceipts`: reverifies existing receipts against disk; missing or corrupted files are purged from current counts while retaining historical audit detail.
  - Added fixture tests in [test/task-coursepilot-files.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-files.test.ts) proving physical deduplication, partial material completion, unknown attachment isolation, and file disappearance reverification.

---

## 3. Verification & Compliance
- **Requirements Satisfied:**
  - `TOOL-01 / TOOL-02`: File receipts bind approved destination, source identity, byte counts, and hashes; distinct physical files are never double counted.
  - `D-05`: Only verified newly downloaded and previously confirmed files count toward successful storage.
  - `D-06 / D-07`: Shared physical files count once; partial attachments produce partial items rather than false complete items.
  - `D-08 / D-12`: Missing or deleted files decrease current counts; historical receipts are retained as audit history.
  - `D-17`: Uninspected or incomplete attachment sets are never promoted to verified material items.
- **Verification Commands Executed:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-files.test.js dist/test/task-coursepilot-preview.test.js dist/test/task-connector-effects.test.js dist/test/task-connector.test.js && npm run check`
  - Result: 27 passing tests, 0 failures, 0 TypeScript errors.
