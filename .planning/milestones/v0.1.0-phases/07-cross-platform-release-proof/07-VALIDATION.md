---
phase: "07"
slug: "cross-platform-release-proof"
status: approved
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-18"
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js native test runner (`node:test`) + `node:assert/strict` |
| **Config file** | `tsconfig.json`, `package.json` |
| **Quick run command** | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js dist/test/release-controls.test.js dist/test/brownfield-gsd-cycle.test.js dist/test/provenance.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/<relevant-suite>.js`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green (baseline: 867 passing tests + new Phase 7 tests)
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | REL-05 | T-07-01 | Tarball content audit strictly rejects candidate lock and unallowlisted files | unit | `npm run check && npm run build && node scripts/audit-tarball.mjs` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | REL-01 | T-07-02 | Packed tarball installs, reconciles, diagnoses, and uninstalls cleanly in temp-root sandbox | integration | `node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | REL-02 | T-07-03 | Support matrix ledger with 4-tier taxonomy, redacted canary receipts & doctor --matrix | unit | `node scripts/run-tests.mjs --files dist/test/support-matrix.test.js` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | REL-03 | T-07-04 | Paired positive/negative controls for Context7, project packs, auth gate & tree-off | integration | `node scripts/run-tests.mjs --files dist/test/release-controls.test.js` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 3 | REL-04 | T-07-05 | Brownfield fixture harness setup & 5-benchmark element GSD runner | integration | `node scripts/run-tests.mjs --files dist/test/brownfield-gsd-cycle.test.js` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 3 | REL-04 | T-07-06 | Single GSD writer enforcement during cross-harness worker delegation | integration | `node scripts/run-tests.mjs --files dist/test/brownfield-gsd-cycle.test.js` | ❌ W0 | ⬜ pending |
| 07-04-01 | 04 | 4 | REL-06 | T-07-07 | Cryptographic SHA-256 provenance verification & frozen stable lock integrity | unit | `node scripts/run-tests.mjs --files dist/test/provenance.test.js` | ❌ W0 | ⬜ pending |
| 07-04-02 | 04 | 4 | REL-05, REL-06 | T-07-08 | Two-stage clean-environment smoke test runner & preview-first dry-run release script | integration | `node scripts/smoke-test.mjs --local` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/audit-tarball.mjs` — fail-closed tarball content validator
- [ ] `test/tarball-fixture.test.ts` — stubs for REL-01 (lifecycle execution with packed tarball in isolated prefix)
- [ ] `test/support-matrix.test.ts` — stubs for REL-02 (matrix rendering, 4-tier taxonomy, canary execution)
- [ ] `test/release-controls.test.ts` — stubs for REL-03 (paired positive/negative acceptance controls)
- [ ] `test/brownfield-gsd-cycle.test.ts` — stubs for REL-04 (5 benchmark elements and writer-lock invariants)
- [ ] `test/provenance.test.ts` — stubs for REL-06 (SHA-256 bundle verification and build manifest audit)
- [ ] `scripts/smoke-test.mjs` — clean temporary environment smoke test runner
- [ ] `scripts/release.mjs` — dry-run-first release orchestrator

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public Registry Fresh Install Smoke Test | REL-06 | Post-publish verification against live npm registry (`npm install -g alpha-aos@0.1.0`) | Execute `node scripts/smoke-test.mjs --registry` after release publish |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-18
