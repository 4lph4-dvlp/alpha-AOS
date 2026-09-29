---
phase: "13"
slug: "dependency-candidate-promotion"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: validated
nyquist_compliant: true
wave_0_complete: false
created: "2026-09-25"
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` runner + `node:assert/strict` |
| **Config file** | `tsconfig.json` |
| **Quick run command** | `npm run check && npm run build` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | DEP-01 | — | Pass large JSON without truncation | unit / integration | `node dist/test/mcp-fixture.test.js` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | DEP-01 | — | Deterministic maintainer tool with schema validation | unit / integration | `node scripts/promote-candidate.mjs --help` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 1 | DEP-01 | — | Isolated fixtures pass cleanly across all 5 candidate components | integration | `npm run check && npm run build && npm test` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | DEP-01, DEP-03 | — | Red-Main Guard evaluates green main baseline unblocked | integration | `node scripts/check-main-baseline.mjs --branch main` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | DEP-01 | — | PR #1 CI matrix green on Ubuntu, macOS, Windows | CI | `gh pr checks 1` | ✅ | ⬜ pending |
| 13-03-01 | 03 | 3 | DEP-01, DEP-02 | — | Promoted lock complies with lock schema, candidate lock reset | integration | `node dist/test/catalog.test.js` | ✅ | ⬜ pending |
| 13-03-02 | 03 | 3 | DEP-01, DEP-02 | — | Derives 19 pack skills hashes atomically, syncs code/test literals | integration | `node scripts/pin-pack-skills.mjs write` | ✅ | ⬜ pending |
| 13-03-03 | 03 | 3 | DEP-01, DEP-02 | — | Positive allowlist packaging excludes `.planning/` and candidate lock | security / audit | `npm pack && node scripts/audit-tarball.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/promote-candidate.mjs` — Maintainer helper script for automated candidate promotion and schema validation

*Existing test infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub PR #1 review & check inspection | DEP-01 | Requires GitHub remote repository access / web UI | Inspect `gh pr view 1` and `gh pr checks 1` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending 2026-09-25
