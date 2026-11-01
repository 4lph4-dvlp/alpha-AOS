# Phase 20 Plan 02 Summary: General Connector Effect Ledger & Supervisor Recovery

## 1. Overview
- **Phase:** 20-general-tool-connectors
- **Plan:** 02 (`20-02-PLAN.md`)
- **Objective:** Connect general connector file effects to the existing durable effect ledger and supervisor recovery paths, guaranteeing crash safety, duplicate prevention, and explicit halts on unknown evidence (TOOL-01, TOOL-04, D-08, D-10).

---

## 2. Completed Tasks

### Task 1: Record stable connector effect identity and reconcile with source evidence
- **Implementation:**
  - Implemented `generateConnectorEffectKey` in [src/core/task-effects.ts](file:///D:/dev/alpha-AOS/src/core/task-effects.ts): derives deterministic effect keys from contract digest, connector ID, source item ID, file ID, and normalized destination, completely independent of retry attempt indexes.
  - Added `planConnectorFileEffects`: skips previously applied/verified sibling files to prevent duplicate external downloads and throws on existing unknown or performing effects.
  - Added `checkConnectorEffectConflict` and `assertNoConnectorEffectConflict`: rejects concurrent operations or conflicting effects targeting the same destination.
  - Extended `reconcileEffectEvidence` to support `baseCommit: string | null` and `external-download` reconciliation against both filesystem evidence (bytes + sha256) and optional `ConnectorPort.reconcile`.
  - Added test suite in [test/task-connector-effects.test.ts](file:///D:/dev/alpha-AOS/test/task-connector-effects.test.ts) verifying key stability, verified sibling skipping, conflict rejection, and filesystem/connector reconciliation.
- **Commit:** `1ddb904`

### Task 2: Verify current files on resume and halt supervisor on unknown effects
- **Implementation:**
  - Extended `reconcileLedgerOnRecovery` in [src/core/task-effects.ts](file:///D:/dev/alpha-AOS/src/core/task-effects.ts) with `reverifyAppliedFiles: boolean` (D-08 / D-10). If a previously applied file has disappeared from disk prior to recovery, it is demoted to `planned` so that it can be safely retried, while preserving full audit history.
  - Updated `verifyGsdStateConsistency` in [src/core/task-supervisor.ts](file:///D:/dev/alpha-AOS/src/core/task-supervisor.ts) to return `{ consistent: true }` when `lastVerifiedHead === null` (general contracts).
  - Updated `resumeTask` in [src/core/task-supervisor.ts](file:///D:/dev/alpha-AOS/src/core/task-supervisor.ts) to support general contracts without Git dependencies, pass connector ports to recovery reconciliation, record demoted file events (`effect_reconciled`) in the journal, and block with named unknown effect keys and next actions (`reconcile_or_repair_source_evidence`) when uncertain evidence exists.
  - Added end-to-end recovery tests in [test/task-connector-effects.test.ts](file:///D:/dev/alpha-AOS/test/task-connector-effects.test.ts) demonstrating missing file demotion and unknown effect blocking.
- **Commit:** `8a937ac`

---

## 3. Verification & Compliance
- **Requirements Satisfied:**
  - `TOOL-01`: Approved file effects are durably recorded with stable keys prior to external execution and reconciled against source/current file evidence on restart.
  - `TOOL-04`: Uncertain effects are never blindly re-executed; unknown evidence explicitly halts supervisor progression with blocked checkpoints.
  - `D-08 / D-10`: Historical receipts alone do not claim present success if the file has disappeared from disk; already verified files are never blindly re-downloaded.
- **Verification Commands Executed:**
  - `npm run build && node scripts/run-tests.mjs --files dist/test/task-connector-effects.test.js dist/test/task-effects-ledger.test.js dist/test/task-supervisor-recovery.test.js dist/test/task-connector.test.js && npm run check`
  - Result: 35 passing tests, 0 failures, 0 TypeScript errors.
