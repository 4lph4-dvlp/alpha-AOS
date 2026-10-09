# Phase 20 Plan 03 Summary: CoursePilot Task Adapter, Bounded Parser & Manifest Diff

## 1. Overview
- **Phase:** 20-general-tool-connectors
- **Plan:** 03 (`20-03-PLAN.md`)
- **Objective:** Read fresh coarse material listings from installed CoursePilot, calculate exact selections, and isolate approved files from changed/unapproved items according to D-01..D-04, D-17, TOOL-02, and TOOL-04.

---

## 2. Completed Tasks

### Task 1: Resolve local CoursePilot contract and parse bounded materials list
- **Implementation:**
  - Implemented `resolveCoursePilotRuntime` in [src/adapters/coursepilot-task.ts](file:///D:/dev/alpha-AOS/src/adapters/coursepilot-task.ts): locates installed SKILL.md, JSON_CONTRACT.md, git head commit, and probes CLI help for D-17 contract flags (`--contract-version`, `--manifest`).
  - Enforced fail-closed behavior on unmet D-17 prerequisite: if the installed CLI does not yet carry D-17 flags, reports `supported: false` with named action `"Implement, test, commit and install the CoursePilot public materials contract in its own repository"`.
  - Implemented `parseCoursePilotManifestJson`: strictly parses wire format, bounds payload size (256KB max), sanitizes LMS strings, enforces `schemaVersion: 1`, rejects duplicate module/file IDs, and preserves unknown attachment status honestly.
  - Added [test/task-coursepilot-preview.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-preview.test.ts) verifying honest unmet gate reporting, LMS string sanitization, and strict parser boundary rejection.

### Task 2: Calculate manifest diff and align exact item/file selection with approval scope
- **Implementation:**
  - Implemented `computeCoursePilotManifestDiff`: compares before and current CoursePilot manifests, accurately partitioning added, removed, changed (with reason), and unchanged items, independent of input ordering.
  - Implemented `CoursePilotTaskAdapter`: provides `preview`, `perform`, `reconcile`, and `verify` under the `ConnectorPort` protocol, converting coarse manifests to `ConnectorManifestV1` with stable digests.
  - Enforced exact selector isolation: unchanged approved selections can execute independently of newly added or modified modules in the same course/week.
  - Added fixture tests in [test/task-coursepilot-preview.test.ts](file:///D:/dev/alpha-AOS/test/task-coursepilot-preview.test.ts) proving diff calculation and adapter preview behavior.

---

## 3. Verification & Compliance
- **Requirements Satisfied:**
  - `TOOL-02`: Approved materials remain executable via exact selectors, isolated from new or changed items.
  - `TOOL-04`: LMS text treated strictly as data; unknown or missing public contract versions fail closed.
  - `D-01..D-04`: Reapproval views provide full manifest diff (added/removed/changed/unchanged) and preserve safe independent selections.
  - `D-17`: Runtime resolution probes real installation and halts with explicit prerequisite action when unversioned/unmet.
- **Verification Commands Executed:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-preview.test.js dist/test/task-connector-effects.test.js dist/test/task-connector.test.js && npm run check`
  - Result: 23 passing tests, 0 failures, 0 TypeScript errors.
