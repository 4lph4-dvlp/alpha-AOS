---
phase: "11"
slug: "managed-lifecycle-verification"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-23"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert/strict` (Node 24) |
| **Config file** | `tsconfig.json`, `package.json` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/<file>.test.js` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~300 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick command for touched test files, plus `npm run check`
- **After every plan wave:** Run `npm test` (must stay green; failing probes never land in `test/`)
- **Before `/gsd-verify-work`:** Full suite must be green; the verifier re-runs a sample of the cited evidence commands
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-xx | TBD | 1 | LIFE-01 (oracle) | — | packed second reconcile reports all `CURRENT`, sandbox byte-identical | integration | extend `test/tarball-fixture.test.ts` (pass-only) | ✅ partial | ⬜ pending |
| 11-xx | TBD | 1 | LIFE-05/08 (oracle) | — | packed rollback restore/refusal; update preview fingerprint unchanged | integration | new `test/lifecycle-verification.test.ts` (if passing) | ❌ W1 | ⬜ pending |
| 11-xx | TBD | 2 | LIFE-09 | — | report has 8 verdicts; every non-VERIFIED clause carries a G-11 id with a reproduction | doc check | `grep -cE "^\| LIFE-0[1-8]" 06-VERIFICATION.md` + `grep G-11-` in report and REQUIREMENTS.md | ❌ W2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Task IDs are finalized by the planner.

---

## Wave 0 Requirements

- [ ] Export `fingerprintManifest` / `hostSnapshot` / `describeHostDrift` (or a sandbox-root variant) from `test/tarball-fixture.test.ts` for reuse
- [ ] Evidence directory and transcript naming convention

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code real-host discovery/canary | LIFE-02 | Spends a model turn; excluded by planning note (G-07-2 / REL-02 is future) | Not required this milestone — recorded as named gap if unmet |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
