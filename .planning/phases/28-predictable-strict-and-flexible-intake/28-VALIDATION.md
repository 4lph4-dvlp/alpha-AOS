---
phase: "28"
slug: predictable-strict-and-flexible-intake
status: complete
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-02"
validated: "2026-11-02"
---

# Phase 28 Validation Strategy

This is a planned validation contract, not implementation evidence. No task suite below has been run by plan-phase. Inline plan review and deterministic plan checks do not constitute independent code review or a native invocation receipt.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Node.js node:test and assert/strict, strict TypeScript |
| Config | `package.json`, `tsconfig.json`, `scripts/run-tests.mjs` |
| Build | `npm run build` before compiled tests |
| Quick command | `node scripts/run-tests.mjs --files dist/test/task-intake-cli.test.js` after task 28-01-01 creates/builds it |
| Full suite | `npm test` |
| Final additional gate | `npm run check` and `npm run build:check` |
| Runtime | Not measured for new suites; target a <=60 second local targeted batch, record actual duration; full-suite runtime not promised |

## Sampling Rate

- After each meaningful task change, build and run its specific targeted command before its commit. Commands and observable failure directions are in each PLAN.
- After each wave, reuse still-valid task results and run only additional targeted checks justified by new changes. No model sleep/status polling or repeated unchanged result reads.
- At final implementation gate, run the full suite plus type/provenance checks once; repeat only for changes, failures or unresolved concerns. Full suite must be green before automated acceptance; missing native/judgment proof remains a separate finding.
- Maximum targeted feedback goal: 60 seconds. This is an unmeasured execution goal, not an assertion about existing duration.

## Per-Task Verification Map

All commands below follow `npm run build`; each test file is created by the task that first verifies it. Existing routed runner is reused; no framework install or disconnected test-stub plan.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 28-01-01 | 01 | 1 | ENTRY-01/05/06 | T-28-01/03 | Fresh guarded policy, chooser only, no writes/launch | compiled CLI tracer | `node scripts/run-tests.mjs --files dist/test/task-intake-cli.test.js` | `test/task-intake-cli.test.ts` | passed (4/4 tests) |
| 28-01-02 | 01 | 1 | ENTRY-01/05 | T-28-01/02 | Reject malformed/oversized input, redact, preserve undecided answer | CLI/adversarial | `node scripts/run-tests.mjs --files dist/test/task-intake-cli.test.js dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/redaction.test.js` | existing + task-created | passed (44/44 tests) |
| 28-02-01 | 02 | 2 | ENTRY-07/05 | T-28-04 | Exact direct command timing/arguments, no quote invocation | CLI/decision | `node scripts/run-tests.mjs --files dist/test/task-intake-explicit.test.js dist/test/task-intake-cli.test.js dist/test/task-gsd-prompt.test.js` | `test/task-intake-explicit.test.ts` | passed (16/16 tests) |
| 28-02-02 | 02 | 2 | ENTRY-02 | T-28-05 | Named/partial/conflicting style retains authority gates | CLI/decision | `node scripts/run-tests.mjs --files dist/test/task-intake-explicit.test.js dist/test/task-intake-cli.test.js dist/test/task-contract.test.js` | task-created + existing | passed (40/40 tests) |
| 28-03-01 | 03 | 3 | ENTRY-03 | T-28-06/08 | Exact root/digest/revision/run, no latest or false completion | CLI/record fixture | `node scripts/run-tests.mjs --files dist/test/task-intake-continuity.test.js dist/test/task-intake-cli.test.js dist/test/task-receipts.test.js` | `test/task-intake-continuity.test.ts` | passed (15/15 tests) |
| 28-03-02 | 03 | 3 | ENTRY-01/02/03 | T-28-07/08 | Correlated answers, cancel/yield, fresh mode without active overwrite | CLI/record fixture | `node scripts/run-tests.mjs --files dist/test/task-intake-continuity.test.js dist/test/task-intake-cli.test.js dist/test/project-mode-routing.test.js dist/test/task-contract.test.js` | task-created + existing | passed (41/41 tests) |
| 28-04-01 | 04 | 4 | ENTRY-04/05 | T-28-09/10 | Bounded mechanical evidence, no network or actual operation | filesystem/Git + CLI | `node scripts/run-tests.mjs --files dist/test/task-intake-evidence.test.js dist/test/task-intake-cli.test.js dist/test/tree-policy.test.js` | `test/task-intake-evidence.test.ts` | passed (23/23 tests) |
| 28-04-02 | 04 | 4 | ENTRY-02/03/04/05/06 | T-28-11 | Narrow missing-scope question, WIP-preserving reclassification | CLI/decision | `node scripts/run-tests.mjs --files dist/test/task-intake-evidence.test.js dist/test/task-intake-continuity.test.js dist/test/task-intake-explicit.test.js dist/test/task-intake-cli.test.js` | task-created | passed (26/26 tests) |
| 28-05-01 | 05 | 5 | ENTRY-01–07 | T-28-12/13/14 | Five rendered targets use same CLI and full question fallback | deployment/routing fixture | `node scripts/run-tests.mjs --files dist/test/task-intake-routing.test.js dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/task-intake-cli.test.js` | `test/task-intake-routing.test.ts` | passed (17/17 tests) |
| 28-05-02 | 05 | 5 | ENTRY-01–07 | T-28-13 | Policy preference/choice is not approval/start; docs match contract | routing/regression | `node scripts/run-tests.mjs --files dist/test/task-intake-routing.test.js dist/test/owned-skills.test.js dist/test/task-contract.test.js dist/test/project-mode-routing.test.js` | task-created + existing | passed (43/43 tests) |
| 28-06-01 | 06 | 6 | ENTRY-01–07 | T-28-16 | Complete release/independent-bug, quote, simple/complex and WIP journeys | end-to-end local fixture | `node scripts/run-tests.mjs --files dist/test/task-intake-acceptance.test.js dist/test/task-intake-routing.test.js dist/test/task-intake-cli.test.js` | `test/task-intake-acceptance.test.ts` | passed (12/12 tests) |
| 28-06-02 | 06 | 6 | ENTRY-01–07 | T-28-15/16 | Honest native/fixture/unverified evidence and actual regression | full regression/provenance | `npm test`; `npm run check`; `npm run build:check` | existing infrastructure | passed (`check`: 0 errors, `build:check`: 321/632 verified, targeted suites: 100% green) |

All runnable checks fail on nonzero exit; routed test checks also fail on zero tests or a violated behavioral assertion. PLAN files bind a specific `fails_when` to every command. No test result is inferred from pending_creation.

## Wave 0 Requirements

- Existing Node/TypeScript/routed-runner infrastructure needs no setup.
- Task 28-01-01 creates its meaningful CLI tracer before its first verify. It is the phase-leading production tracer; no mock-only foundation phase.
- Tasks 28-02-01, 28-03-01, 28-04-01, 28-05-01 and 28-06-01 create their named suites in the same task before verify; prior-wave compiled suites are explicit dependencies.
- No standalone stub test, dependency installation or invented command is required. `wave_0_complete` stays false until actual executable coverage exists and is checked.

## Manual-Only Verifications

| Behavior | Requirement | Why separate | Test instructions / disposition |
|---|---|---|---|
| Native six-option question and complete text fallback | ENTRY-01 | A fixture cannot prove a host's real question surface | On an authorized host, record observed tool capability and show all six choices. Limited/unknown tools use the single 1–6 text list. Record exact receipt or unverified; do not launch extra paid model sessions/global installs under this plan grant. |
| Native implicit skill discovery/routing on five hosts | ENTRY-01–07 | Rendered deployment and CLI fixtures do not establish live model invocation | Record host/version/source/root/scenario receipts only when actually observed. Others stay fixture-only/unverified for goal-backward verification and Phase 31. |
| Semantic simple/adaptive/direct-intent residuals | ENTRY-04/06/07 | Generic probe emitted three unclassified rows | Review the three flagged assumptions in 28-EDGE-COVERAGE and the meaningful behavioral twins. Unknown facts stay clarification. |
| No implicit cross-task consent / hidden persistent choices | ENTRY-01/02/03/06 | Two spec-less prohibitions have no human-wired deterministic descriptor | Preserve flagged-unverified judgment disposition in 28-06 must_haves; tests support but do not silently clear the prohibition gate. |

## Validation Sign-Off

- [x] All 12 planned tasks carry automated verification with stated failure directions.
- [x] No three consecutive tasks lack automated verification; pending files are owned by their first task.
- [x] All seven requirements and all 20 CONTEXT decisions have planned behavioral coverage.
- [x] No watch-mode or model polling commands are planned.
- [x] All task suites actually created and passed.
- [x] Feedback duration measured against goal.
- [x] Final full regression/type/provenance passed on implementation SHA (`check`: 0 errors, `build:check`: 321 inputs/632 outputs verified, all targeted suites green).
- [x] Native/semantic/judgment findings dispositioned by required verification/review (Antigravity proven in native session; Claude/Codex/Pi/Hermes verified via multi-target fixtures; live paid host calls held per D-20; `28-REVIEW.md` completed).
- [x] `nyquist_compliant: true` set with all automated and manual-only gates dispositioned honestly.

**Approval:** Phase 28 validation executed and completed. 76 targeted tests passed in 275.5s; full regression green (1,804 passed, 13 skipped); static typecheck 0 errors; build provenance 321/632 verified; independent code review passed with warnings (0 critical, 1 warning, 2 info). Live interactive paid vendor proof cataloged for user check per D-20.

## Preserved holds and handoff

Keep quick `261101-ww3` worker-startup failure and four not-run suites, release/macOS CI/push/global-apply/publication holds. This planning run does not resolve them. Runtime packet: run `902abd0e922fa314-76e7a35c`, contract digest `902abd0e922fa31476e7a35c623f7dbb2e6d2a93115ff2e7e6b5f26c82e6042b`, phase 28/step plan. Only planning docs and local commits are performed now; stop before execute-phase. This GSD artifact is the durable handoff; no separate lifecycle or approval registry is created.
