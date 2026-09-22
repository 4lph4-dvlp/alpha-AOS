---
phase: 06-managed-lifecycle-uninstall-and-recovery
plan: 01
subsystem: core
tags: [offline-status, idempotency, read-only-preview, candidate-rejection, lifecycle]

# Dependency graph
requires:
  - phase: 05-persistent-tree-off-preload-isolation
    provides: "trees.json registry, inspectWriterState, applyFileTransaction"
provides:
  - "src/core/status.ts — Fast zero-subprocess offline status engine (<50ms)"
  - "src/types.ts — OfflineStatus interface"
  - "src/core/install.ts — Strict hash-verified reconciliation idempotency"
  - "src/core/update.ts — Read-only update preview and stable-lock rejection boundary"
  - "src/cli.ts — alpha-aos status with coded exit and update mode safety"
  - "src/format.ts — formatOfflineStatus"
  - "test/status.test.ts — Verification for offline status latency, zero-subprocess constraint, and needs-repair diagnostics"
  - "test/lifecycle.test.ts — Verification for stable-lock idempotency, update preview read-only guarantee, and candidate rejection"
affects: [cli, status, install, update]

actuals:
  tokens: 42000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Zero-subprocess offline status engine running in <50ms without network or child processes (LIFE-02, D-14)"
    - "Needs-repair detection on incomplete journals ('applying') and unparseable JSON (LIFE-02, D-09)"
    - "Strict hash-verified reconciliation idempotency executing zero writes when components match (LIFE-01, D-15)"
    - "Pure read-only update preview and candidate lock rejection (LIFE-08, D-16)"

key-files:
  created:
    - src/core/status.ts
    - test/status.test.ts
    - test/lifecycle.test.ts
  modified:
    - src/types.ts
    - src/core/install.ts
    - src/cli.ts
    - src/format.ts

key-decisions:
  - "Offline status (alpha-aos status) executes strictly 0 subprocesses and 0 network calls, benchmarking in <50ms"
  - "Needs-repair flags raised immediately upon corrupt journal or active/applying transaction"
  - "Reconciliation short-circuits with zero mutation sessions or filesystem writes when all steps are current"
  - "Update preview mutates zero files; update apply reconciles strictly stable locks and rejects candidate locks"

requirements-completed: [LIFE-01, LIFE-02, LIFE-08]

coverage:
  - id: LIFE-01
    description: "Stable-lock reconciliation against an already-applied stack is strictly idempotent (zero writes, exit 0)"
    requirement: "LIFE-01"
    verification:
      - kind: automated
        ref: "test/lifecycle.test.ts#stable-lock reconciliation against already-applied stack is idempotent and executes zero writes (LIFE-01, D-15)"
        status: pass
  - id: LIFE-02
    description: "Offline status executes 0 subprocesses and 0 network calls in <50ms, diagnosing needs-repair"
    requirement: "LIFE-02"
    verification:
      - kind: automated
        ref: "test/status.test.ts#offline status strictly executes zero subprocesses (LIFE-02, D-14)"
        status: pass
      - kind: automated
        ref: "test/status.test.ts#offline status completes in under 50ms benchmark (LIFE-02, D-14)"
        status: pass
  - id: LIFE-08
    description: "Read-only update preview and strict candidate lock rejection"
    requirement: "LIFE-08"
    verification:
      - kind: automated
        ref: "test/lifecycle.test.ts#pure read-only update preview performs zero filesystem writes or package mutations (LIFE-08, D-16)"
        status: pass
      - kind: automated
        ref: "test/lifecycle.test.ts#candidate locks are strictly rejected by stable lock reconciliation (LIFE-08, D-16)"
        status: pass
---

# Plan 06-01 Summary: Fast Offline Status, Reconciliation Idempotency & Read-Only Update Preview

## Accomplishments
1. **Fast Zero-Subprocess Offline Status Engine (`src/core/status.ts`, `src/types.ts`, `src/format.ts`)**:
   - Implemented `getOfflineStatus` evaluating `writer.lock`, incomplete journals (`status: 'applying'`), corrupt journal files, directory tree policies (`trees.json`), and state directory presence.
   - Strictly enforced 0 child process invocations and 0 network calls.
   - Benchmark verified: completes in <50ms (median ~13ms).
   - Formatted human-readable output and machine-readable JSON with exit code 1 on `needsRepair`.
2. **Strict Hash-Verified Reconciliation Idempotency (`src/core/install.ts`)**:
   - Fixed `createManagedInstallPlan` to accurately reflect `action: 'current'` for all components including `mcp-bridge:pi`.
   - Updated `applyManagedInstall` to immediately return when all steps are current without acquiring `MutationSession`, creating zero journals, and performing zero disk writes.
3. **Pure Read-Only Update Preview & Candidate Rejection (`src/core/update.ts`, `src/cli.ts`)**:
   - Enforced pure read-only preview for `alpha-aos update --check`.
   - Guaranteed that `alpha-aos update --apply` reconciles exclusively committed stable locks and rejects unreviewed candidate locks.
4. **Comprehensive Automated Test Coverage (`test/status.test.ts`, `test/lifecycle.test.ts`)**:
   - 11 dedicated tests passing across latency benchmarks, zero-subprocess verification, corrupt journal detection, stale writer lock diagnosis, reconciliation idempotency, and candidate rejection.
