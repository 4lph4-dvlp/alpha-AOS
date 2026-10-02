---
phase: "17"
slug: "gsd-lifecycle-bridge"
status: draft
nyquist_compliant: false
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
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-*.test.js` |
| **Full suite command** | `npm test` (`npm run build && node scripts/run-tests.mjs`) |
| **Estimated runtime** | ~15 seconds (quick) / ~60 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-*.test.js`
- **After every plan wave:** Run `npm test && npm run check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | GSD-01 | T-17-01 | Pure read GSD state observation without supervisor state machine | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-discovery.test.js` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | GSD-01 | T-17-01 | Native GSD step execution with --auto injection and checkpoints | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-lifecycle.test.js` | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | GSD-02 | T-17-01 | Authorized default response and needs-input boundary pause | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-prompt.test.js` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 2 | GSD-02 | T-17-01 | Async task answer / task resume CLI commands and journal audit | cli | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-answer.test.js` | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 3 | GSD-03 | T-17-03 | Triple-correlation resume skips finished plans and freezes scope decisions | fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-recovery.test.js` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 3 | GSD-03 | T-17-04 | Gap routing to native gap plan or new phase with loop prevention | scenario | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gap-router.test.js` | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 4 | GSD-04 | T-17-03 | Mandatory hook execution receipts and fail-closed gate block | fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-hook-receipt.test.js` | ❌ W0 | ⬜ pending |
| 17-04-02 | 04 | 4 | GSD-04 | T-17-02 | Same-revision review witness receipt verification and anti-tamper | fault-injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-witness.test.js` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 5 | GSD-01..04 | T-17-01..04 | 4-adversarial fault-injection fixture suite and multi-phase progression | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-adversarial.test.js dist/test/task-gsd-multi-phase.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/task-gsd-discovery.test.ts` — stubs for GSD-01 state discovery
- [ ] `test/task-gsd-lifecycle.test.ts` — stubs for GSD-01 lifecycle execution
- [ ] `test/task-gsd-prompt.test.ts` — stubs for GSD-02 prompt/pause policy
- [ ] `test/task-gap-router.test.ts` — stubs for GSD-03 gap routing
- [ ] `test/task-hook-receipt.test.ts` — stubs for GSD-04 hook receipts
- [ ] `test/task-review-witness.test.ts` — stubs for GSD-04 review witness

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | All | All phase behaviors have automated verification | Run automated tests |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-02
