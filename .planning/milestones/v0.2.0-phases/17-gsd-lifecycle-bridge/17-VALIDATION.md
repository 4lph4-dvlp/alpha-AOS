---
phase: "17"
slug: "gsd-lifecycle-bridge"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-10-02"
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test`, `node:assert/strict`) |
| **Config file** | none — uses `scripts/run-tests.mjs` test runner |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-hook-receipt.test.js dist/test/task-review-witness.test.js dist/test/task-gsd-*.test.js dist/test/task-cli-answer.test.js dist/test/task-gap-router.test.js dist/test/task-doctor-gsd.test.js` |
| **Full suite command** | `npm test` (`npm run build && node scripts/run-tests.mjs`) |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-*.test.js dist/test/task-hook-receipt.test.js dist/test/task-review-witness.test.js`
- **After every plan wave:** Run `npm test && npm run check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | GSD-04 | T-17-01, T-17-02 | Mandatory hook execution receipts and fail-closed gate invoker | unit / fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-hook-receipt.test.js` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | GSD-04 | T-17-03, T-17-04 | Review witness receipt verification, exact SHA matching, and 1-byte mutation rejection | fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-witness.test.js dist/test/task-hook-receipt.test.js` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | GSD-03 | T-17-05, T-17-07 | Pure read-only GSD state observer and triple-correlation plan completion verifier | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-discovery.test.js` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | GSD-03 | T-17-06, T-17-08 | Scope immutability lock and idempotent plan-skipping resume selector | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-discovery.test.js` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 1 | GSD-01, GSD-02 | T-17-09, T-17-10 | Interactive prompt classifier, contract boundary evaluator, and needs-input decision maker | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-prompt.test.js` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 1 | GSD-02 | T-17-11, T-17-12 | CLI task answer and task resume command handlers with checkpoint reconciliation | cli | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-answer.test.js dist/test/task-gsd-prompt.test.js` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 2 | GSD-02, GSD-03 | T-17-14, T-17-16 | Verification defect scope classifier, native GSD gap plan dispatcher, and roadmap phase router | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gap-router.test.js` | ❌ W0 | ⬜ pending |
| 17-04-02 | 04 | 2 | GSD-02, GSD-03 | T-17-13, T-17-15 | Whole-contract re-verification after gap execution and 2x failure anti-loop escalation | scenario | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gap-router.test.js` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 2 | GSD-01, GSD-04 | T-17-17, T-17-20 | Bounded GSD lifecycle step execution adapter with --auto flag injection and checkpoints | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| 17-05-02 | 05 | 2 | GSD-01, GSD-03 | T-17-18, T-17-19 | Multi-phase continuous progression adapter and native transition driver | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-multi-phase.test.js dist/test/task-gsd-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| 17-06-01 | 06 | 3 | GSD-01..04 | T-17-21, T-17-23 | Supervisor pipeline integration of hook receipts, review witness check, and doctor/status diagnostics | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-doctor-gsd.test.js` | ❌ W0 | ⬜ pending |
| 17-06-02 | 06 | 3 | GSD-01..04 | T-17-22, T-17-24 | The 4-adversarial fault-injection fixture suite verifying all fail-closed invariants | fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-adversarial.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/task-hook-receipt.test.ts` — stubs for GSD-04 hook receipts
- [ ] `test/task-review-witness.test.ts` — stubs for GSD-04 review witness
- [ ] `test/task-gsd-discovery.test.ts` — stubs for GSD-03 state discovery and triple correlation
- [ ] `test/task-gsd-prompt.test.ts` — stubs for GSD-01/02 prompt/pause policy
- [ ] `test/task-cli-answer.test.ts` — stubs for GSD-02 task answer / resume CLI
- [ ] `test/task-gap-router.test.ts` — stubs for GSD-02/03 gap routing and anti-loop
- [ ] `test/task-gsd-lifecycle.test.ts` — stubs for GSD-01/04 lifecycle step execution
- [ ] `test/task-gsd-multi-phase.test.ts` — stubs for GSD-01/03 multi-phase progression
- [ ] `test/task-doctor-gsd.test.ts` — stubs for GSD-01..04 doctor and status diagnostics
- [ ] `test/task-gsd-adversarial.test.ts` — stubs for GSD-01..04 4-adversarial fault injection

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | All | All phase behaviors have automated verification | Run automated tests |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-02
