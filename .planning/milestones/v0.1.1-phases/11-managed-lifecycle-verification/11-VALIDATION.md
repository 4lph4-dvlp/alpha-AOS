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
| 11-01-T1 | 01 | 1 | LIFE-09 (LIFE-01 tracer) | T-11-01, T-11-02 | packed Codex reconcile through the CLI; host guard unchanged; no unaliased home path in the transcript | probe + doc check | `npm run check && npm run build && node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-reconcile.mjs` + transcript and report greps | ❌ W1 | ⬜ pending |
| 11-01-T2 | 01 | 1 | LIFE-09 (LIFE-01 oracle) | T-11-03, T-11-04 | packed lifecycle asserts dry-run `CURRENT` and sandbox byte identity; Phase 10 oracle byte-identical | integration | scratch-home `node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js dist/test/path-literal-guard.test.js` + oracle diff gate + `seed-selfcheck.mjs` | ✅ partial | ⬜ pending |
| 11-01-T3 | 01 | 1 | LIFE-09 (suites, CI) | T-11-05 | Phase 6 suites fail 0 locally; per-OS CI lines for run 35818198049; staleness diff empty | probe | `node .planning/phases/11-managed-lifecycle-verification/evidence/probes/suites-and-ci.mjs` + CHECK greps | ❌ W1 | ⬜ pending |
| 11-02-T1 | 02 | 2 | LIFE-09 (LIFE-02) | T-11-09 | CLI `status` spawns nothing and opens no connection, with positive controls | integration + probe | `node scripts/run-tests.mjs --files dist/test/status-offline-verification.test.js` (host and WSL) + `life02-status.mjs` | ❌ W2 | ⬜ pending |
| 11-02-T2 | 02 | 2 | LIFE-09 (LIFE-02) | T-11-06, T-11-07 | discovery and no-spend canary per harness; no model turn; repository unchanged; real harness homes fingerprinted (`life02.harness-homes-unchanged`, managed-path drift VIOLATED) | probe | `node .../probes/life02-discovery.mjs` + findings grep | ❌ W2 | ⬜ pending |
| 11-03-T1 | 03 | 2 | LIFE-09 (LIFE-01) | T-11-01 | five-harness packed reconcile; Phase 13 gating line | probe | `node .../probes/life01-harnesses.mjs` + findings grep | ❌ W2 | ⬜ pending |
| 11-03-T2 | 03 | 2 | LIFE-09 (LIFE-08) | T-11-10, T-11-12 | six update preview surfaces change no byte of checkout, package, link, config or state | probe | `node .../probes/life08-preview.mjs` | ❌ W2 | ⬜ pending |
| 11-03-T3 | 03 | 2 | LIFE-09 (LIFE-08) | T-11-11, T-11-13 | `update --apply` ignores an unreviewed candidate lock and reconciles the stable lock | probe + integration | `node .../probes/life08-apply.mjs` + scratch-home tarball-fixture run + findings grep | ✅ partial | ⬜ pending |
| 11-04-T1 | 04 | 2 | LIFE-09 (LIFE-03) | T-11-14, T-11-15 | previews change nothing; one-target uninstall per harness keeps auth and user resources; leftover scan | probe | `node .../probes/life03-uninstall.mjs` | ❌ W2 | ⬜ pending |
| 11-04-T2 | 04 | 2 | LIFE-09 (LIFE-03) | T-11-14 | both project-pack removal routes; isolated runtime clean | probe | `node .../probes/life03-project.mjs` | ❌ W2 | ⬜ pending |
| 11-04-T3 | 04 | 2 | LIFE-09 (LIFE-03) | T-11-16 | `[y/N]` confirmation through a real pseudo-terminal | probe (WSL) | `wsl.exe --cd "$(cygpath -w "$PWD")" -e sh -c 'node .../probes/life03-tty.mjs'` + findings grep | ❌ W2 | ⬜ pending |
| 11-05-T1 | 05 | 2 | LIFE-09 (LIFE-04) | T-11-20, T-11-21 | removal limited to receipted, still-matching state; refusal on drift and user edits | probe | `node .../probes/life04-receipts.mjs` + findings grep | ❌ W2 | ⬜ pending |
| 11-05-T2 | 05 | 2 | LIFE-09 (LIFE-07) | T-11-18, T-11-19 | external changes shown and verified; recovery instructions match the stable lock | probe | `node .../probes/life07-external.mjs` + findings grep | ❌ W2 | ⬜ pending |
| 11-06-T1 | 06 | 2 | LIFE-09 (LIFE-05) | T-11-23, T-11-24 | rollback restores exact bytes; drift refusal changes no byte, journal or snapshot | integration + probe | `node scripts/run-tests.mjs --files dist/test/rollback-cli-verification.test.js` (host and WSL) + `life05-rollback.mjs` | ❌ W2 | ⬜ pending |
| 11-06-T2 | 06 | 2 | LIFE-09 (LIFE-06) | T-11-22, T-11-25 | five failpoints: needs-repair, repair, restart, idempotent repair; no false success | probe | `node .../probes/life06-recovery.mjs` + findings grep | ❌ W2 | ⬜ pending |
| 11-07-T1 | 07 | 3 | LIFE-09 | T-11-26, T-11-28 | report has eight verdicts; every PARTIAL/GAP row carries G-11 ids with reproductions; gating consistent with D-08; the 11-01 skeleton content (LIFE-01 Codex rows, `verified_in`, re-run index heading) is preserved | doc check | grep gates + YAML frontmatter consistency check on `06-VERIFICATION.md` | ❌ W3 | ⬜ pending |
| 11-07-T2 | 07 | 3 | LIFE-09 | T-11-27 | every G-11 id registered; records edited additively | doc check | grep gates over REQUIREMENTS.md, MILESTONES.md, v0.1.0-REQUIREMENTS.md, v0.1.0-ROADMAP.md | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Task IDs are finalized by the planner.

---

## Wave 0 Requirements

- [ ] Shared helpers in `test/helpers/packed-sandbox.ts` (`fingerprintManifest`, `snapshotTargets`, `describeHostDrift`, `openSandbox`, `installPackedRelease`, `seedHarnessPrerequisites`), imported by `test/tarball-fixture.test.ts` — plan 11-01 Tasks 1-2
- [ ] Evidence directory, transcript vocabulary and findings template in `evidence/README.md` — plan 11-01 Task 1

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
