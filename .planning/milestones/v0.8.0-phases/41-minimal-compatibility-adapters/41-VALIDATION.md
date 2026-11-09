---
phase: "41"
slug: "minimal-compatibility-adapters"
status: ready
nyquist_compliant: true
wave_0_complete: false
created: "2026-11-08"
---

# Phase 41 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner (`node:test` + `node:assert/strict`) |
| **Config file** | `tsconfig.json` + `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js dist/test/tool-inventory-cli.test.js dist/test/local-release-update.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js dist/test/tool-inventory-cli.test.js dist/test/local-release-update.test.js`
- **After every plan wave:** Run `npm run check && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 41-01-01 | 01 | 1 | ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04 | T-41-01 | Separates permanent `policy-interface` boundaries from retireable `compatibility-correction` adapters, enforces 3-stage guidance proof gate, and derives deterministic digests | unit | `npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js` | ❌ W0 | ⬜ pending |
| 41-01-02 | 01 | 1 | ADAPT-02, ADAPT-03, ADAPT-04 | T-41-02, T-41-03 | Enforces structural ECC/GSD preconditions, `inside()` path containment on hook closures, global `alpha-aos-research-routing` deployment, and pure-fixture retirement | unit + integration | `npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js dist/test/owned-skills.test.js` | ❌ W0 | ⬜ pending |
| 41-02-01 | 02 | 2 | ADAPT-01, ADAPT-02, ADAPT-04 | T-41-04, T-41-05 | Binds adapter revisions/digests into `ReviewedToolBinding`, `synthesizeReleaseStackLock`, and `tool-records` `ToolEvidence` | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/local-release-update.test.js dist/test/tool-record-store.test.js` | ✅ | ⬜ pending |
| 41-02-02 | 02 | 2 | ADAPT-01, ADAPT-04 | T-41-05, T-41-06 | Exposes concise adapter summaries on `inventory` and full metadata/retirement evidence on `inventory --detail`/`--tool` and `install`/`update` previews | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js dist/test/local-release-update.test.js dist/test/ecc-skills.test.js dist/test/gsd-compat.test.js && npm run check` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/compatibility-adapters.test.ts` — covers ADAPT-01, ADAPT-02, ADAPT-03, ADAPT-04 adapter registry, minimal structural transforms, 3-stage guidance gate, and retirement/postcondition contracts
- [ ] `test/gsd-compat.test.ts` — extended for relative require closure discovery, `hooks/lib/` traversal rejection, and `resolved-upstream` pure-fixture retirement
- [ ] `test/ecc-skills.test.ts` and `test/local-release-update.test.ts` — extended for structural ECC adapter resilience, `alpha-aos-research-routing` owned skill deployment, and `ReviewedToolBinding` adapter evidence

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
