---
phase: "30"
slug: "six-execution-styles-and-quality-binding"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 30 — Validation Strategy

This is a planning contract, not executed test evidence. Inline planning/checking is explicitly authorized; independent implementation review remains a later mandatory gate.

## Test infrastructure

| Property | Value |
|---|---|
| Framework | Node.js built-in node:test, compiled TypeScript |
| Config | package.json, tsconfig.json, scripts/run-tests.mjs |
| Quick check | `npm run check`, then `npm run build` and the task's selected `node scripts/run-tests.mjs --files ...` |
| Full regression | `npm test` |
| Build provenance | `npm run build:check` |
| Runtime estimate | Not measured in this planning run; use targeted suites for prompt feedback and retain actual timings |
| Native proof | `node scripts/verify-task-style-native.mjs --index docs/task-style-proof-index.json --json` after plan 07 |

## Sampling

- After each implementation change and before its atomic commit, build and run the owning targeted behavioral suites.
- Each wave validates its own named integration paths; no unverified three-task window.
- Run `npm run check`, `npm test` and `npm run build:check` at plan 07 final gate, then repeat only for justified changes/failures.
- Plan 08 checks actual native proof without implying permission to launch paid models or mutate another root.
- Every runnable automated command has an immediately following fails_when. Missing new tests are created in the same task before its verify; none is an unexplained MISSING placeholder.
- Nonzero exit, zero selected tests, missing suite or absent required native evidence is failure. A process exit 0 alone is never full acceptance.
- Do not run full suite after every wave; targeted checks preserve feedback and the full suite is a final gate.

## Per-task verification map

| Task ID | Plan | Wave | Requirements | Threat ref | Test type | Automated command | Creation status | Outcome |
|---|---|---|---|---|---|---|---|---|
| 30-01-01 | 01 | 1 | STYLE-01, STYLE-02, STYLE-03, STYLE-07 | T-30-01/02 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-style.test.js dist/test/task-intake-cli.test.js dist/test/task-intake-explicit.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-01-02 | 01 | 1 | STYLE-01, STYLE-02, STYLE-03, STYLE-07 | T-30-01/02 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-style.test.js dist/test/task-bootstrap-resume.test.js dist/test/task-intake-continuity.test.js dist/test/task-intake-acceptance.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-02-01 | 02 | 2 | STYLE-04, STYLE-05, STYLE-07 | T-30-03/04 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-quick-quality.test.js dist/test/task-contract.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-02-02 | 02 | 2 | STYLE-04, STYLE-05, STYLE-07 | T-30-03/04 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-quick-quality.test.js dist/test/task-gsd.test.js dist/test/task-harness-adapters.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-02-03 | 02 | 2 | STYLE-04, STYLE-05, STYLE-07 | T-30-03/04 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-quick-quality.test.js dist/test/task-contract.test.js dist/test/task-gsd-readiness.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-03-01 | 03 | 3 | STYLE-05, STYLE-07 | T-30-05/06/07 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-gsd-stages.test.js dist/test/task-gsd-adversarial.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-03-02 | 03 | 3 | STYLE-05, STYLE-07 | T-30-05/06/07 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-gsd-stage-observation.test.js dist/test/task-gsd-stages.test.js dist/test/task-quick-quality.test.js dist/test/task-harness-adapters.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-04-01 | 04 | 4 | STYLE-04, STYLE-05, STYLE-07 | T-30-08/09/10 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-gsd-full-run.test.js dist/test/task-gsd-stages.test.js dist/test/task-gsd-adversarial.test.js dist/test/task-contract.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-04-02 | 04 | 4 | STYLE-04, STYLE-05, STYLE-07 | T-30-08/09/10 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-gsd-full-run.test.js dist/test/task-supervisor-recovery.test.js dist/test/task-gsd-lifecycle.test.js dist/test/task-intake-continuity.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-05-01 | 05 | 5 | STYLE-06, STYLE-07 | T-30-11/12 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-contract.test.js dist/test/task-gsd-multi-phase.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-05-02 | 05 | 5 | STYLE-06, STYLE-07 | T-30-11/12 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-gsd-lifecycle.test.js dist/test/task-gsd-multi-phase.test.js dist/test/task-gsd-discovery.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-05-03 | 05 | 5 | STYLE-06, STYLE-07 | T-30-11/12 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-phase-scope.test.js dist/test/task-gsd-lifecycle.test.js dist/test/task-gsd-multi-phase.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-06-01 | 06 | 6 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | T-30-13/14 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-style-routing.test.js dist/test/owned-skills.test.js dist/test/task-intake-routing.test.js dist/test/task-bootstrap-routing.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-06-02 | 06 | 6 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | T-30-13/14 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-style-routing.test.js dist/test/task-intake-acceptance.test.js dist/test/task-quick-quality.test.js dist/test/task-phase-scope.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-07-01 | 07 | 7 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | T-30-15/16 | behavioral integration | `node scripts/run-tests.mjs --files dist/test/task-style-acceptance.test.js dist/test/task-style-native-proof.test.js dist/test/task-gsd-full-run.test.js dist/test/task-style-routing.test.js` | new tests created by owning task; existing regressions tracked | pending |
| 30-07-02 | 07 | 7 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | T-30-15/16 | behavioral integration | `npm run build:check` | new tests created by owning task; existing regressions tracked | pending |
| 30-08-01 | 08 | 8 | STYLE-01, STYLE-02, STYLE-03, STYLE-04, STYLE-05, STYLE-06, STYLE-07 | T-30-17/18 | native checkpoint | `node scripts/verify-task-style-native.mjs --index docs/task-style-proof-index.json --json` | verifier created in 07 | pending |

The targeted row is a sampling summary. Every task's complete automated list, acceptance criteria and native trust checks remain binding in its PLAN.md.

## Wave 0 dependencies

No dependency installation, framework setup or empty test scaffolding is required. Existing helpers cover temp roots/Git/ports/CLI. Plans 01–07 create their new test files before executing them; plan 03 produces the observation/evidence interface consumed by 04, and 07 produces the verifier consumed by 08. `wave_0_complete: false` remains until actual execution verifies those dependencies; do not mark it green at plan time.

## Required positive/negative coverage

| Boundary | Required evidence |
|---|---|
| Contract quality | Frozen old canonical bytes/digests and old approval reads, explicit standard equivalence, full add/remove/tamper, invalid workflow/quality |
| Invocation | Six canonical routes; full flag; original direct command/target/timing; actual native questions vs delegated answers |
| Evidence producer | Correlated actual native invocation/result/session; worker claim, standalone success marker and fixture relabel refused |
| Stage freshness | Each required stage missing/failed/unknown, stale PLAN hash, stale implementation/review SHA, foreign quick/run/root/workflow |
| Bounds/precision | 64 KiB bytes, 64 receipts, 32 artifact refs at N−1/N/N+1; exact IDs/hashes and safe revisions |
| Authority | Approval-failed and approval-only zero worker launch; unsupported approved model/effort/observer; roots/effects retained |
| Recovery | Same-run stage reuse, affected dependency invalidation, dirty WIP and partial summaries retained, no duplicate quick |
| Phase scope | Bound selection, legacy baseline reconstruction/refusal, live addition/order drift, blocked predecessor zero successor dispatch |
| Distribution | Tracked skill source and five actual renderer hashes, composed guidance→public invocation fixtures |
| Final gate | Actual full suite/provenance + fresh independent review + goal verification; historical holds preserved |

## Native / judgment verifications

| Behavior | Requirements | Procedure and gate |
|---|---|---|
| Current-conversation quick/full/phase | STYLE-01–03 | Plan 08 opens actual native receipts and artifacts; record questions and direct discuss-only stop |
| Exact approved isolated quick/full/phase | STYLE-04–06 | Inspect existing exact scratch grant and separate start, observed dispatch and full/phase acceptance; missing grant stays pending |
| Approval framing and bespoke prohibitions | STYLE-07; plans 04–06 | Approved fresh reviewer/human checkpoint records explicit disposition; descriptor-less projection is flagged-unverified until reviewed |
| Unsupported native capability | STYLE-05/07 | No substitution, paid probe or fabricated receipts; preserve exact blocker/handle |
| Five-harness aggregate proof/packed docs | Phase 31 | Outside this phase; do not plan it while Phase 30 checkpoint is blocked |

## Sign-off

- [x] All 17 tasks have an automated verify and observable failing direction in their plans.
- [x] Every new compiled test target has an explicit owning creation task.
- [x] No watch commands or unbounded model polling loops are planned.
- [x] Security L1/high threats have test/review coverage and unique IDs.
- [ ] Implementation suites executed and actual timings/counts recorded.
- [ ] Full regression/provenance green.
- [ ] Required native proof and fresh independent review complete.
- [ ] Nyquist validate-phase sets actual validated/compliant state.

**Approval:** planning validated structurally only; implementation/native sign-off pending.

