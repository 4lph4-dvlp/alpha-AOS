---
phase: "15"
slug: "durable-supervisor-and-effect-ledger"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-01"
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | `package.json` (`test` script: `tsc -p tsconfig.json && node scripts/run-tests.mjs`) |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-supervisor.test.js` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/<target>.test.js`
- **After every plan wave:** Run `npm test && npm run check`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | RUN-02 | — | Append-only fsync journal with secrets masked | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-journal.test.js` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | RUN-02 | — | Atomic checkpoint write via tmp-rename-fsync | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-journal.test.js` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | RUN-03 | — | Process tree termination across OS platforms | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-process.test.js` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | RUN-03 | — | Redacted output capture capped at 64KB | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-process.test.js` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 2 | TOOL-03 | — | Deterministic effect key hashing and state machine | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects-ledger.test.js` | ❌ W0 | ⬜ pending |
| 15-03-02 | 03 | 2 | TOOL-03 | — | Source evidence reconciliation and duplicate skip | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects-ledger.test.js` | ❌ W0 | ⬜ pending |
| 15-04-01 | 04 | 2 | RUN-04 | — | Resource limits classification and stop reasons | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-limits.test.js` | ❌ W0 | ⬜ pending |
| 15-04-02 | 04 | 2 | RUN-04 | — | Fail-closed cost meter enforcement when telemetry absent | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-limits.test.js` | ❌ W0 | ⬜ pending |
| 15-05-01 | 05 | 3 | RUN-05 | — | Failure fingerprint computation and 2-consecutive no-progress detection | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-strategy.test.js` | ❌ W0 | ⬜ pending |
| 15-05-02 | 05 | 3 | RUN-05 | — | 3-stage adaptive strategy transition and blocked report | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/task-strategy.test.js` | ❌ W0 | ⬜ pending |
| 15-06-01 | 06 | 4 | RUN-02, RUN-03 | — | Supervisor loop crash recovery and idempotent resume | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-supervisor-recovery.test.js` | ❌ W0 | ⬜ pending |
| 15-06-02 | 06 | 4 | RUN-02, TOOL-03 | — | CLI resume command and journal status inspectability | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-supervisor-recovery.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/task-journal.test.ts` — stubs for RUN-02 journal and checkpoint tests
- [ ] `test/task-process.test.ts` — stubs for RUN-03 tree cleanup and safety bounds
- [ ] `test/task-effects-ledger.test.ts` — stubs for TOOL-03 effect key and reconciliation
- [ ] `test/task-limits.test.ts` — stubs for RUN-04 limits and fail-closed telemetry
- [ ] `test/task-strategy.test.ts` — stubs for RUN-05 failure fingerprint and adaptive strategies
- [ ] `test/task-supervisor-recovery.test.ts` — stubs for fault injection and recovery

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-OS process-tree orphan inspection on non-Windows hosts | RUN-03 | Local workstation is Windows 11; macOS/Linux process groups tested in CI | Verify CI matrix runs `test/task-process.test.ts` on macOS and Linux |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-10-01
