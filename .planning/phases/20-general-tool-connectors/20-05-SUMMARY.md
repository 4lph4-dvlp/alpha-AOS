# Phase 20 Plan 05 Summary: CoursePilot Exact Perform & Partial/Fatal Policy

## 1. Overview
- **Phase:** 20-general-tool-connectors
- **Plan:** 05 (`20-05-PLAN.md`)
- **Objective:** Execute exact approved CoursePilot materials and files, classify exit codes and bounded JSON outputs into selection-local stale vs global fatal outcomes, preserve receipts across partial failures, and isolate single-file retries without redundant external invocations (TOOL-01, TOOL-02, TOOL-04, D-01, D-03, D-09..D-12, D-17).

---

## 2. Completed Tasks

### Task 1: Execute Approved CoursePilot File Selections and Preserve Receipts
- **Implementation:**
  - Extended `ConnectorPerformRequest` and `ConnectorPerformResult` in [src/core/task-connector.ts](file:///D:/dev/alpha-AOS/src/core/task-connector.ts) to support exact `fileId` selection, granular status (`"completed" | "partial" | "failed" | "stale" | "fatal"`), verified receipts, and unverified file lists.
  - Implemented `parseCoursePilotPerformJson` in [src/adapters/coursepilot-task.ts](file:///D:/dev/alpha-AOS/src/adapters/coursepilot-task.ts): strictly bounds stdout to 256KB, validates non-empty output, verifies `schema_version: 1` and `operation: "perform"`, sanitizes LMS strings, and normalizes file/module identifiers.
  - Implemented `classifyCoursePilotPerformResult` in [src/adapters/coursepilot-task.ts](file:///D:/dev/alpha-AOS/src/adapters/coursepilot-task.ts):
    - **Exit 2 `status: "stale"`**: selection-local stale outcome (routes only the affected module to user reapproval while keeping prior receipts intact).
    - **Exit 2 `status: "fatal"`, malformed JSON, unknown version, identity mismatch, empty stdout, or unrecognized exit**: global fatal outcome that immediately halts subsequent external effects (`fatal: true`) with named next action.
    - **Exit 0 / Exit 1**: parses per-file outcomes; executes `verifyConnectorFileReceipt` on actual disk files so that missing or corrupt files fail individually without invalidating sibling successes (D-12).
  - Updated `startGeneralTask` in [src/core/task-run.ts](file:///D:/dev/alpha-AOS/src/core/task-run.ts) to preserve accumulated receipts on partial/stale results and immediately stop on fatal conditions.
  - Added test suite in [test/task-coursepilot-run.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-run.test.ts) covering stale vs unchanged module progression, exit 1 partial success, missing physical file handling (D-12), and fatal error halts.

### Task 2: Isolate Failed File Retries, Manual Checks, and Unknown Halts
- **Implementation:**
  - Verified sibling exclusion: verified siblings in the ledger (`applied`) are skipped during planning (`planConnectorFileEffects`), and retries target only failed files using exact CLI selector (`--file-id <fileId>`) with 0 external calls to verified siblings (D-10, D-17).
  - `viewed_only` isolation: non-downloaded items are classified as `viewed_only` without creating fake physical receipts, routing them to manual check instead of automated download loops (D-11).
  - Upstream D-17 gate fail-closed: verified that `CoursePilotTaskAdapter` fails closed on unmet runtime without falling back to course/week legacy CLI flags.
  - Re-approval gating: `perform` rejects mismatched or mutated manifest digests (`stale manifest`).
  - Added tests in [test/task-coursepilot-run.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-run.test.ts) covering single-file retries, zero sibling calls, unmet gate fail-closed, and stale digest rejection.

---

## 3. Verification & Compliance
- **Requirements Satisfied:**
  - `TOOL-01 / TOOL-02 / TOOL-04`: Exact file selectors, per-file receipt persistence, bounded JSON parsing, and separation of physical files from material items.
  - `D-01 / D-03 / D-09`: Structurally valid exit 2 `status: stale` routes only affected selections to reapproval while unchanged approved selections continue.
  - `D-10 / D-11 / D-17`: Retries invoke only failed file selectors with zero external sibling calls; `viewed_only` routes to manual review.
  - `D-12`: Individual missing physical files fail independently without erasing verified sibling receipts.
- **Verification Commands Executed:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-run.test.js dist/test/task-supervisor-recovery.test.js && npm run check`
  - Result: 16 passing tests, 0 failures, 0 TypeScript errors.
