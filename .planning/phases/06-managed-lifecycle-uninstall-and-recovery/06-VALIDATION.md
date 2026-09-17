---
phase: "06"
slug: "managed-lifecycle-uninstall-and-recovery"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-18"
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js native test runner (`node:test`) + `node:assert/strict` |
| **Config file** | `tsconfig.json`, `package.json` |
| **Quick run command** | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/uninstall.test.js dist/test/rollback.test.js dist/test/repair.test.js dist/test/status.test.js dist/test/lifecycle.test.js dist/test/recovery-receipt.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/<relevant-suite>.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (baseline: 834 passing tests + new Phase 6 tests)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | LIFE-01, LIFE-08 | T-06-01 | Reconcile unchanged lock reports CURRENT with 0 mutations | unit | `node scripts/run-tests.mjs --files dist/test/lifecycle.test.js` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | LIFE-02 | T-06-02 | Fast offline status completes <50ms with 0 subprocesses/network | unit | `node scripts/run-tests.mjs --files dist/test/status.test.js` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | LIFE-07 | T-06-03 | Validated recovery receipt schema emission with compensation | unit | `node scripts/run-tests.mjs --files dist/test/recovery-receipt.test.js` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 2 | LIFE-06 | T-06-04 | Interrupted journal repair via snapshot rollback & lock release | integration | `node scripts/run-tests.mjs --files dist/test/repair.test.js` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 3 | LIFE-05 | T-06-05 | All-or-nothing rollback refusal on drift before any file mutation | integration | `node scripts/run-tests.mjs --files dist/test/rollback.test.js` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 3 | LIFE-03, LIFE-04 | T-06-06 | Target/all uninstall semantic pruning without touching user auth | integration | `node scripts/run-tests.mjs --files dist/test/uninstall.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/lifecycle.test.ts` — stubs for LIFE-01, LIFE-08 (idempotent reconciliation, update preview)
- [ ] `test/status.test.ts` — stubs for LIFE-02 (fast offline status benchmark, zero subprocesses)
- [ ] `test/recovery-receipt.test.ts` — stubs for LIFE-07 (recovery receipt schema & compensation commands)
- [ ] `test/repair.test.ts` — stubs for LIFE-06 (snapshot safe rollback, stale lock recovery, journal quarantine)
- [ ] `test/rollback.test.ts` — stubs for LIFE-05 (all-or-nothing drift refusal, diff diagnostics, LIFO ordering)
- [ ] `test/uninstall.test.ts` — stubs for LIFE-03, LIFE-04 (semantic pruning, target removal, full uninstall)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive TTY Confirmation | LIFE-03 | Requires user stdin prompt interaction on TTY terminal | Run `alpha-aos uninstall --all --apply` without `-y` and verify `[y/N]` prompt blocks until confirmed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
