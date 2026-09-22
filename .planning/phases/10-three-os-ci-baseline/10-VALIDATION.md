---
phase: "10"
slug: "three-os-ci-baseline"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-23"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node 24) with `node:assert/strict`, compiled by `tsc` 5.9.3 |
| **Config file** | `tsconfig.json`; runner `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node --test dist/test/path-literal-guard.test.js dist/test/owned-skills.test.js dist/test/ecc-skills.test.js dist/test/gate-engine.test.js dist/test/gate-lifecycle.test.js` |
| **Full suite command** | `npm test` (on the dev host, run with `HOME`/`USERPROFILE` redirected to a scratch directory) |
| **Estimated runtime** | ~300 seconds full suite; ~30 seconds quick run |

---

## Sampling Rate

- **After every task commit:** Run the quick run command
- **After every plan wave:** Run `npm test` under a redirected home, plus the CI-02 pair reproduction (`mcp-proxy` + `tarball-fixture` concurrently)
- **Before `/gsd-verify-work`:** A push-triggered `main` run green on all three legs, recorded in `CI_RUN.md`
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-xx | 01 | 1 | CI-01 | — | N/A | unit | `node --test --test-name-pattern="destinationFor resolves" dist/test/owned-skills.test.js` | ✅ (edit) | ⬜ pending |
| 10-01-xx | 01 | 1 | CI-01 | — | N/A | unit (source scan) | `node --test dist/test/path-literal-guard.test.js` | ❌ W0 | ⬜ pending |
| 10-02-xx | 02 | 1 | CI-02 | T-10-02 | Tests never write into the real host `~/.alpha-aos` | unit | `node --test --test-name-pattern="state root" dist/test/mcp-proxy.test.js` | ✅ (add test) | ⬜ pending |
| 10-02-xx | 02 | 1 | CI-02 | T-10-02 | Gate receipts journal into the test-owned state root | unit / integration | `node --test dist/test/gate-engine.test.js dist/test/gate-lifecycle.test.js` | ✅ (add assertion) | ⬜ pending |
| 10-02-xx | 02 | 1 | CI-02 | T-10-01 | Fingerprint diff names entries by metadata only, never content | unit | `node --test dist/test/tarball-fixture.test.js` | ❌ W0 | ⬜ pending |
| 10-03-xx | 03 | 2 | CI-03 | — | N/A | CI | `gh run view <id> --json attempt,headSha,event,conclusion,jobs` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/helpers/path-literal-scan.ts` — scanner (CI-01)
- [ ] `test/path-literal-guard.test.ts` — self-tests plus a real-tree scan (CI-01)
- [ ] Manifest-diff unit coverage in `test/tarball-fixture.test.ts` (D-05)
- [ ] RED regression assertions in `mcp-proxy` / `gate-engine` / `gate-lifecycle`, observed failing before the redirect lands (D-08)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `destinationFor` passes on a POSIX host | CI-01 | Dev host is Windows; POSIX observed via WSL or the CI leg | Run the owned-skills test under WSL, or observe the ubuntu/macos legs in the CI-03 run |
| Packed lifecycle leaves the host byte-identical with leaking file running concurrently | CI-02 | Timing-dependent pair reproduction | Run `mcp-proxy` and `tarball-fixture` together on a redirected home; expect `fail 0` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
