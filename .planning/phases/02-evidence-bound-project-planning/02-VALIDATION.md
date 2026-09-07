---
phase: "2"
slug: "evidence-bound-project-planning"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-07"
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node built-in runner) via `scripts/run-tests.mjs` over compiled `dist/test/*.test.js` |
| **Config file** | `tsconfig.json` (compile) + `scripts/run-tests.mjs` (runner); no separate test-framework config |
| **Quick run command** | `npm run check && npm run build && node --test dist/test/<file>.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds (full suite, includes `npm run build`) |

**Baseline at phase start:** 208 tests (`pass 203, fail 0, skipped 5`) — confirmed by the researcher this session. Any Phase 2 plan must raise the total above 208.

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node --test dist/test/<task's test file>.test.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (`fail 0`, total > 208)
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

<!-- Filled by /gsd-validate-phase after PLAN.md files exist. -->

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| _pending_ | — | — | — | — | — | — | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

<!-- Filled by /gsd-validate-phase; existing `node:test` + `scripts/run-tests.mjs` infrastructure
     already covers the framework, so Wave 0 is expected to list new test FILES only, not a
     framework install. -->

- [ ] _pending — enumerate new `test/*.test.ts` files referenced by Phase 2 plans_

---

## Manual-Only Verifications

<!-- Filled by /gsd-validate-phase. -->

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| _pending_ | — | — | — |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
