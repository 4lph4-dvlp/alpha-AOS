---
phase: "40"
slug: "local-official-release-updates"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test` + `node:assert/strict`) via `scripts/run-tests.mjs` |
| **Config file** | `tsconfig.json` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (targeted suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js`
- **After every plan wave:** Run `npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js dist/test/tool-inventory.test.js dist/test/tool-records.test.js dist/test/update.test.js`
- **Before `/gsd-verify-work`:** Targeted phase + regression suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | LOC-02, LOC-03 | T-40-01, T-40-02 | Stable channel resolution, prerelease/nightly/withdrawn/incomplete-pagination refusal, dynamic Cua SHA256SUMS + Sigstore verification | unit / integration | `npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/cua-release-update.test.js` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 2 | LOC-03 | T-40-03, T-40-04 | Read-only preview (SAFE-01), bound `--plan-digest` + `--reviewed-plan` revalidation, `plan-drift` refusal, zero checkout mutation, `tool-records` persistence | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/update.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/local-release-update.test.ts` — stubs/tests for `LOC-02` and `LOC-03` (`D-01`–`D-12`, `D-16`)
- [ ] `test/cua-release-update.test.ts` — stubs/tests for Cua dynamic release verification & retention (`D-12`–`D-15`)

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
