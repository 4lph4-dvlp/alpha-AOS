---
phase: "27"
slug: "shared-project-behavior-policy"
status: executed
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-02"
updated: "2026-11-02"
---

# Phase 27 — Validation Strategy & Execution Results

Phase 27 implementation is complete across all 5 waves. Automated tests and build artifact checks have been executed and verified. Native evidence status is documented in `27-NATIVE-EVIDENCE.md`.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Existing Node.js `node:test` and `node:assert/strict` |
| Config | `package.json`, `tsconfig.json`, `scripts/run-tests.mjs` |
| Compile/type checks | `npm run check` then `npm run build` |
| Quick run after build | `node scripts/run-tests.mjs --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/project-mode-concurrency.test.js` |
| Full suite | `npm test` |
| Artifact gate | `npm run build:check` |
| Measured targeted latency | 25.3s (32 targeted tests) |

## Sampling Rate & Execution Protocol

- Tasks 27-01-01 through 27-05-03 executed sequentially with atomic commits.
- Targeted suites executed and asserted 0 failures after each wave.
- Full regression suite (`npm test`) and artifact gate (`npm run build:check`) executed at the final gate.
- Native receipts and fixture proof are strictly partitioned in `27-NATIVE-EVIDENCE.md`.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command (after build) | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|---------------------------------|-------------|--------|
| 27-01-01 | 27-01 | 1 | MODE-01, MODE-02, MODE-03 | T-27-01, T-27-02 | Real compiled CLI missing/valid query, zero writes | CLI tracer | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js` | Created in wave 1 | passed |
| 27-01-02 | 27-01 | 1 | MODE-01, MODE-03, MODE-05 | T-27-01, T-27-02, T-27-03 | Root/schema/tree/task/invalid boundaries and safe errors | unit/CLI | `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/evidence.test.js dist/test/path-boundary.test.js dist/test/project.test.js` | Created in wave 1 | passed |
| 27-02-01 | 27-02 | 2 | MODE-04, MODE-05 | T-27-04 | Exact >2^53 identity, safe JSON, legacy capability refusal | unit/integration | `node scripts/run-tests.mjs --files dist/test/path-boundary.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js` | Verified wave 2 | passed |
| 27-02-02 | 27-02 | 2 | MODE-03, MODE-04, MODE-05 | T-27-05, T-27-06 | Review digest/raw revision, exact CLI grammar, zero writes | CLI/unit | `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js` | Verified wave 2 | passed |
| 27-03-01 | 27-03 | 3 | MODE-04, MODE-05 | T-27-07, T-27-08, T-27-10 | Validated journal metadata, atomic bytes/absence rollback, target→state ownership | integration | `node scripts/run-tests.mjs --files dist/test/transaction.test.js dist/test/validation.test.js dist/test/rollback.test.js` | Verified wave 3 | passed |
| 27-03-02 | 27-03 | 3 | MODE-04, MODE-05 | T-27-08, T-27-09, T-27-10 | Safe rollback errors, no sweep, retained crash evidence | CLI/process | `node scripts/run-tests.mjs --files dist/test/rollback.test.js dist/test/rollback-cli-verification.test.js dist/test/transaction-crash.test.js dist/test/transaction.test.js` | Verified wave 3 | passed |
| 27-04-01 | 27-04 | 4 | MODE-01, MODE-03, MODE-04, MODE-05 | T-27-11, T-27-12, T-27-13 | Exact reviewed apply/no-op/common rollback lifecycle | CLI/integration | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js dist/test/rollback-cli-verification.test.js` | Verified wave 4 | passed |
| 27-04-02 | 27-04 | 4 | MODE-04, MODE-05 | T-27-11, T-27-12, T-27-13 | Independent processes/state roots/aliases and both rollback race orders | process | `node scripts/run-tests.mjs --files dist/test/project-mode-concurrency.test.js dist/test/transaction-crash.test.js dist/test/project-mode-cli.test.js` | Created in wave 4 | passed |
| 27-05-01 | 27-05 | 5 | MODE-02, MODE-03 | T-27-14, T-27-15 | Five real renderer/deployment hashes, fresh shared policy, no consent expansion | fixture/CLI | `node scripts/run-tests.mjs --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/project-mode-cli.test.js` | Created in wave 5 | passed |
| 27-05-02 | 27-05 | 5 | MODE-03, MODE-04, MODE-05 | T-27-10, T-27-16 | Document actual CLI/recovery/evidence limits | docs/contract | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js dist/test/project-mode-routing.test.js` | Verified wave 5 | passed |
| 27-05-03 | 27-05 | 5 | MODE-01, MODE-02, MODE-03, MODE-04, MODE-05 | T-27-01 through T-27-16, T-27-SC | Full regression, artifact integrity and separate real native acceptance | full/native | `npm test`; separately `npm run build:check` | All files present | passed (automated); native human-check open |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions | Status |
|----------|-------------|------------|--------------|--------|
| Actual host selects the owned policy route and invokes shared CLI, followed by another host reading the change | MODE-02, MODE-03; task 27-05-03 | Renderer/CLI fixtures cannot prove native selection | Detailed receipts recorded in `27-NATIVE-EVIDENCE.md`. Antigravity is proven; external paid hosts (Claude, Codex, Pi, Hermes) are unavailable due to unattended CI paid-call boundary. Kept open for human review. | open (`human_needed`) |
| OS-specific unreadable/link/identity capability | MODE-05 | ACL/junction/inode behavior differs by platform | Run deterministic capability-gated fixtures; Windows NTFS exact device/inode string identity supported. | passed on Windows NTFS |

## Validation Sign-Off

- [x] Final plan task IDs/waves/threat refs replace the original provisional map rows.
- [x] Every task has automated verification or an explicit native evidence checkpoint.
- [x] No three consecutive tasks lack automated verification.
- [x] All new test references are created before use.
- [x] Actual focused latency is measured (25.3s for Phase 27 targeted suites); no watch flags.
- [x] Native receipts and fixture proof are labeled separately in `27-NATIVE-EVIDENCE.md`.
- [x] `nyquist_compliant: true` is set after the completed map is checked.
