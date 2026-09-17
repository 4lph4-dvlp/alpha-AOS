---
phase: "05"
slug: "persistent-tree-off-preload-isolation"
status: draft
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-18"
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` |
| **Config file** | `tsconfig.json`, `package.json` |
| **Quick run command** | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-policy.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds (quick), ~240 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run quick run command (`node scripts/run-tests.mjs --files ...`)
- **After every plan wave:** Run `npm test` (full regression suite)
- **Before `/gsd-verify-work`:** Full suite must be 100% green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | OPTO-01 | T-05-01 | Tree policy registry persists in `~/.alpha-aos/trees.json` without modifying repo files | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-policy.test.js` | ✅ | ✅ green |
| 05-01-02 | 01 | 1 | OPTO-01 | T-05-02 | Nearest Ancestor inheritance and nested overrides resolve accurately | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-policy.test.js` | ✅ | ✅ green |
| 05-02-01 | 02 | 2 | OPTO-02, OPTO-05 | T-05-03 | CLI shims intercept ordinary invocations and inject preload exclusion flags | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/shims.test.js` | ✅ | ✅ green |
| 05-02-02 | 02 | 2 | OPTO-08 | T-05-04 | Upstream binary resolution avoids recursive loops and unprovable surfaces fail closed | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/shims.test.js` | ✅ | ✅ green |
| 05-03-01 | 03 | 3 | OPTO-03, OPTO-04 | T-05-05 | Unclassified Git roots trigger first-use prompt; CI headless falls back to fail-safe Off | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-classify.test.js` | ✅ | ✅ green |
| 05-04-01 | 04 | 4 | OPTO-06, OPTO-07 | T-05-06 | Reviewed environment allowlist scrubs ambient secrets; local resources pass through | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-inspect.test.js` | ✅ | ✅ green |
| 05-04-02 | 04 | 4 | OPTO-08, OPTO-09 | T-05-07 | 8-dimension inspection report and sealed fail-closed enforcement | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tree-inspect.test.js` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `test/tree-policy.test.ts` — stubs for OPTO-01 (registry schema, canonical paths, LPM inheritance)
- [x] `test/shims.test.ts` — stubs for OPTO-02, OPTO-05, OPTO-08 (CLI shim generation, recursion-free upstream lookup, fail-closed)
- [x] `test/tree-classify.test.ts` — stubs for OPTO-03, OPTO-04 (interactive prompt, headless CI fallback)
- [x] `test/tree-inspect.test.ts` — stubs for OPTO-06, OPTO-07, OPTO-08, OPTO-09 (allowlist scrubbing, local passthrough, surface inspection)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | N/A | All Phase 5 behaviors are covered by automated synthetic integration tests | Automated via node:test suites |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-18
