---
phase: "31"
slug: "cross-harness-proof-and-distribution"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `node:test` + `node:assert/strict` (`Node >=24.0.0`) |
| **Config file** | `tsconfig.json` + `scripts/run-tests.mjs` (`package.json` `"test": "npm run build && node scripts/run-tests.mjs"`) |
| **Quick run command** | `npm run check && npm run build && node scripts/run-tests.mjs --files <target-dist-test-files>` |
| **Full suite command** | `npm test` (single final-gate execution per `D-14`, paired with `npm run audit-tarball`, `npm run build:check`, and `node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json`) |
| **Estimated runtime** | ~10–15 seconds (targeted slice) / ~90–150 seconds (full final gate including packed sandbox) |

---

## Sampling Rate

- **After every task commit:** Run `npm run check && npm run build && node scripts/run-tests.mjs --files <modified-test-slice>`
- **After every plan wave:** Run targeted Phase 31 suites (`dist/test/task-entry-cross-harness.test.js`, `dist/test/task-entry-proof.test.js`, `dist/test/task-entry-docs.test.js`, plus `npm run audit-tarball` when packaging/docs change; do NOT repeat full `npm test` across intermediate waves per `D-14`)
- **Before `/gsd-verify-work`:** Complete single-`HEAD` final gate (`npm run check` → `npm run build` → targeted Phase 31 suites → `npm run audit-tarball` → `npm test` → `npm run build:check` → `node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json`) and record actual measured outcomes in `docs/task-entry-proof.md` and `docs/task-entry-proof-index.json`
- **Max feedback latency:** 30 seconds (ordinary targeted task commits; packed sandbox slice ~60 seconds in its dedicated plan)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | PROVE-02 | T-31-01, T-31-02 | Sanitize private host paths across packaged docs/indices/READMEs and fail closed in `audit-tarball.mjs` on missing v0.6.0 entries or private-path text leaks | packaging / unit | `npm run audit-tarball && node scripts/run-tests.mjs --files dist/test/provenance.test.js` | ⚠️ extend `scripts/audit-tarball.mjs` | ⬜ pending |
| 31-01-02 | 01 | 1 | PROVE-02 | T-31-03 | `runDoctor` verifies packaged `alpha-aos-task` frontmatter, `sourceSha256`, and all 5 rendered `targetSha256` digests against `stack.lock.json` (`error` / exit `2` on tamper; host global drift remains `warning` under Global Apply Hold) | unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/doctor.test.js dist/test/owned-skills.test.js` | ✅ `test/doctor.test.ts` | ⬜ pending |
| 31-02-01 | 02 | 2 | PROVE-01, PROVE-04 | T-31-04 | Composed 5-harness CLI/filesystem integration (`Codex flexible -> Antigravity -> Pi strict -> existing Codex session`), release -> independent bug-fix fresh chooser, `absent`/`partial` once-only handoff, and `D-13` positive/negative pairs preserve `executionAuthorized: false` and exact autopilot consent | integration | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/task-entry-cross-harness.test.js` | ❌ W0 (`test/task-entry-cross-harness.test.ts`) | ⬜ pending |
| 31-02-02 | 02 | 2 | PROVE-01 | T-31-05, T-31-06 | `scripts/verify-task-entry-proof.mjs`, `docs/task-entry-proof-index.json` (`<=64 KiB`, 55 harness×axis cells), and `docs/task-entry-proof.md` enforce anti-spoofing, symlink/size bounds, dual source/packed context verification, and non-destructive `SUPPORT_MATRIX.md` cross-linking | verifier + unit | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/task-entry-proof.test.js && node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json` | ❌ W0 (`test/task-entry-proof.test.ts`) | ⬜ pending |
| 31-03-01 | 03 | 3 | PROVE-02 | T-31-03, T-31-07 | Packed tarball sandbox verifies 5-target `alpha-aos-task` hash parity & tamper refusal (`install`/`doctor`), meaningful discoverability (`doctor`/frontmatter/`CURRENT` + paid-call-free local probes), meaningful CLI invocation (`project mode`, `task intake`, `task readiness`, `task preview` w/ `quickQuality: "full"`), and zero `hostSnapshot` drift | packed e2e | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js` | ✅ `test/tarball-fixture.test.ts` | ⬜ pending |
| 31-04-01 | 04 | 3 | PROVE-03 | T-31-01 | Symmetric English/Korean guides (`docs/task-entry.md`, `docs/task-entry.ko.md`) and repaired `README.md`/`README.ko.md` preserve verbatim 6 Korean labels, positive/counterexample twins, honest 5-harness limits, `0.5.0` non-inflation, valid relative links, and zero private paths | doc contract | `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/task-entry-docs.test.js && npm run audit-tarball` | ❌ W0 (`test/task-entry-docs.test.ts`) | ⬜ pending |
| 31-05-01 | 05 | 4 | PROVE-04 | T-31-05 | Single-`HEAD` final regression gate executes `D-14` sequence end-to-end, records exact counts + `261101-ww3` 4-suite comparison + unwaived active holds in `docs/task-entry-proof.md` and `docs/task-entry-proof-index.json`, and re-verifies clean tarball/build/proof state | full regression gate | `npm run audit-tarball && npm test && npm run build:check && node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/task-entry-cross-harness.test.ts` — 5-harness composed journeys and `D-13` positive/negative behavioral pairs (`PROVE-01`, `PROVE-04`)
- [ ] `test/task-entry-proof.test.ts` — `scripts/verify-task-entry-proof.mjs` boundary, anti-spoofing, and packed-copy verification (`PROVE-01`)
- [ ] `test/task-entry-docs.test.ts` — Bilingual section symmetry, verbatim 6 Korean labels, relative link resolution, `0.5.0` non-inflation, and `assertNoPrivatePaths` scan (`PROVE-02`, `PROVE-03`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live paid isolated canary execution on `Claude Code` (`G-07-2`) and cross-OS (`macos-latest`, `ubuntu-latest`) CI workflow runs | PROVE-01, PROVE-04 | Explicitly held out of scope by user policy (`D-02`, `D-12`, `D-15`, `D-16`): paid native canaries, global reconcile, `git push`, 3-OS CI repair, and `npm publish` remain held and must be reported honestly as `unverified` / `blocked` / `not-run` rather than counted as `passed`. | Automated verifier (`scripts/verify-task-entry-proof.mjs`) asserts that held/blocked items are explicitly disclosed with reason codes (`G-07-2`, `3-os-ci-held`, `release-publish-held`) and never promoted to `verified-native` or `passed`. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for standard tasks (packed tarball slot isolated)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
