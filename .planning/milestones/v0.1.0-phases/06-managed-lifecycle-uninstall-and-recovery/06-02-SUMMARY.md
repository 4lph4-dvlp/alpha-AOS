---
phase: 06-managed-lifecycle-uninstall-and-recovery
plan: 02
subsystem: core
tags: [recovery-receipt, crash-repair, esrch-audit, journal-quarantine, lifecycle]

# Dependency graph
requires:
  - phase: 06-managed-lifecycle-uninstall-and-recovery
    plan: 01
    provides: "Offline status engine with needs-repair detection"
provides:
  - "schemas/recovery-receipt.schema.json — Draft 2020-12 closed JSON schema for recovery receipts"
  - "src/core/recovery-receipt.ts — Write-ahead recovery receipt generator with honest compensation shell commands"
  - "src/core/repair.ts — Snapshot crash repair, ESRCH process audit, and corrupt journal quarantine"
  - "src/types.ts — RecoveryReceipt, CrashRepairPlan, CrashRepairResult interfaces"
  - "src/format.ts — formatRecoveryReceipt, formatCrashRepairPlan, formatCrashRepairResult"
  - "src/cli.ts — alpha-aos repair command integration"
  - "test/recovery-receipt.test.ts — Verification for recovery receipt schema, write-ahead durability, and compensation commands"
  - "test/repair.test.ts — Verification for snapshot crash repair, active writer refusal, ESRCH release, and journal quarantine"
affects: [cli, repair, recovery-receipt, transaction, validation]

actuals:
  tokens: 45000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Write-ahead recovery receipts before non-transactional external package changes (LIFE-07, D-13)"
    - "Honest manual compensation instructions for npm/pnpm/pip package managers instead of false automated rollback (LIFE-07)"
    - "Snapshot crash repair restoring pre-crash baselines and marking journals repaired (LIFE-06, D-09, D-10)"
    - "Active process audit via kill(pid, 0) ESRCH checks refusing repair when writer process is still alive (LIFE-06, D-12)"
    - "Corrupt and incomplete journal quarantine to quarantine/ to unblock operations without data loss (LIFE-06, D-11)"

key-files:
  created:
    - schemas/recovery-receipt.schema.json
    - src/core/recovery-receipt.ts
    - src/core/repair.ts
    - test/recovery-receipt.test.ts
    - test/repair.test.ts
  modified:
    - schemas/transaction-journal.schema.json
    - src/types.ts
    - src/core/transaction.ts
    - src/core/validation.ts
    - src/core/writer-lock.ts
    - src/format.ts
    - src/cli.ts

key-decisions:
  - "Recovery receipts write ahead durably to ~/.alpha-aos/receipts/ before any package modification starts"
  - "Compensations emit honest user-executable shell commands for npm/pnpm/pip; never simulate rollback"
  - "Crash repair refuses if writer process is alive; stale writer locks released only when ESRCH confirms process is dead"
  - "Corrupt or snapshot-missing journals are quarantined with timestamp to unblock future transactions without discarding evidence"

requirements-completed: [LIFE-06, LIFE-07]

coverage:
  - id: LIFE-06
    description: "Interrupted runs are recoverable from snapshots without manual file surgery, releasing stale locks via ESRCH audit and quarantining corrupt journals"
    requirement: "LIFE-06"
    verification:
      - kind: automated
        ref: "test/repair.test.ts#snapshot crash repair safely restores pre-crash baseline and marks repaired (LIFE-06, D-09, D-10)"
        status: pass
      - kind: automated
        ref: "test/repair.test.ts#repair refuses when writer process is still alive (LIFE-06, D-12)"
        status: pass
      - kind: automated
        ref: "test/repair.test.ts#stale writer lock with dead process is released (LIFE-06, D-12)"
        status: pass
      - kind: automated
        ref: "test/repair.test.ts#corrupt journal is quarantined to unblock operations (LIFE-06, D-11)"
        status: pass
      - kind: automated
        ref: "test/repair.test.ts#incomplete journal with missing snapshots is quarantined (LIFE-06, D-11)"
        status: pass
  - id: LIFE-07
    description: "External package additions/upgrades write structured recovery receipts with manual rollback instructions before mutations start"
    requirement: "LIFE-07"
    verification:
      - kind: automated
        ref: "test/recovery-receipt.test.ts#recovery receipt conforms strictly to schema and writes ahead durably (LIFE-07, D-13)"
        status: pass
      - kind: automated
        ref: "test/recovery-receipt.test.ts#GSD compensation generator outputs correct command for upgrade and fresh install"
        status: pass
      - kind: automated
        ref: "test/recovery-receipt.test.ts#ECC runtime compensation generator outputs correct command for upgrade and fresh install"
        status: pass
      - kind: automated
        ref: "test/recovery-receipt.test.ts#Pi bridge and npm link compensation generators output honest instructions"
        status: pass
---

# Plan 06-02 Summary: External Package Recovery Receipts & Snapshot Crash Repair

## Accomplishments
1. **External Package Recovery Receipts (`schemas/recovery-receipt.schema.json`, `src/core/recovery-receipt.ts`, `src/types.ts`)**:
   - Created strict Draft 2020-12 closed JSON schema for recovery receipts validated via Ajv in `src/core/validation.ts`.
   - Implemented write-ahead receipt creation and emission to `~/.alpha-aos/receipts/recovery-<timestamp>-<receiptId>.json` before any package manager mutation begins.
   - Built honest manual compensation command generators (`compensateGsd`, `compensateEcc`, `compensatePiBridge`, `compensateNpmLink`) explicitly detailing exact downgrade or uninstall shell commands for npm, pnpm, and pip.
2. **Snapshot Crash Repair Engine (`src/core/repair.ts`, `src/cli.ts`)**:
   - Implemented `planCrashRepair` and `applyCrashRepair` handling interrupted transactions in state `'applying'`.
   - Restores pre-transaction baseline byte-for-byte from snapshot storage under `~/.alpha-aos/snapshots/` and marks journal status `'repaired'`.
   - Audits writer process liveness via `isProcessAlive(pid)` with `process.kill(pid, 0)`: refuses repair if writer process is actively running (exit code 1), and safely cleans up stale `writer.lock` only when `ESRCH` proves the writer process is terminated.
   - Automatically isolates unparseable or snapshot-missing journals to `~/.alpha-aos/quarantine/` with timestamps, preventing deadlocks and maintaining an inspectable forensic trail.
3. **CLI Integration & Formatting (`src/cli.ts`, `src/format.ts`)**:
   - Wired `alpha-aos repair` CLI command supporting dry-run plan inspection and `--apply` mutation execution with human-readable and `--json` formatting.
4. **Comprehensive Automated Test Coverage (`test/recovery-receipt.test.ts`, `test/repair.test.ts`)**:
   - 10 dedicated automated tests verifying schema compliance, write-ahead durability, compensation accuracy, crash snapshot restoration, active process guard, ESRCH lock cleanup, and journal quarantine.
