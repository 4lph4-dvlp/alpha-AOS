---
phase: "08"
slug: "autonomous-project-pack-advisor-and-cross-harness-materializ"
status: approved
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-21"
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js native test runner (`node:test`) + `node:assert/strict` |
| **Config file** | `tsconfig.json`, `package.json` |
| **Quick run command** | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/owned-skills.test.js dist/test/pack-advisor.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/<relevant-suite>.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | PACK-03 | T-08-01 | Owned skill engine resolves paths and renders valid frontmatter for all 5 harnesses without escaping boundaries | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/owned-skills.test.js` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | PACK-03 | T-08-02 | Install and reconciliation loop discovers and transactionally plans owned skills across all selected targets | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/owned-skills.test.js` | ❌ W0 | ⬜ pending |
| 08-02-01 | 02 | 2 | PACK-01, PACK-03 | T-08-03 | `alpha-aos-pack-advisor` registered in catalog & lock with valid SHA-256 integrity and correct frontmatter | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/catalog.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | PACK-01, PACK-02 | T-08-04 | Advisor execution extracts exact 64-char plan digest, approves, and materializes packs without tampering or unapproved mutation | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/pack-advisor.test.js` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/owned-skills.test.ts` — test cases for multi-target destination resolution, rendering, and transaction planning
- [ ] `test/pack-advisor.test.ts` — test cases for advisor skill execution, plan digest extraction, and auto-approval verification
