---
phase: 31-cross-harness-proof-and-distribution
plan: "06"
subsystem: bootstrap
tags: [gap-closure, authority, idempotency, regression]
requires: [{phase: 31-02, provides: composed journeys}, {phase: 31-05, provides: prior regression ledger}]
provides: [correct pre-link autopilot retry authority, five-source provenance binding, corrected-source complete regression]
affects: [phase-verification, milestone-audit]
key-files:
  created: []
  modified: [src/core/task-bootstrap.ts, test/task-bootstrap-resume.test.ts, test/task-entry-cross-harness.test.ts, scripts/verify-task-entry-proof.mjs, test/task-entry-proof.test.ts, docs/task-entry-proof-index.json, docs/task-entry-proof.md]
duration: 40m
completed: 2026-11-03
status: complete
coverage:
  - id: G-31-01
    description: Initial, same-nonce pre-link retry and linked reentry preserve autopilot refusal and route across all three canonical styles
    verification: [{kind: integration, ref: "test/task-bootstrap-resume.test.ts", status: pass}, {kind: integration, ref: "test/task-entry-cross-harness.test.ts", status: pass}]
    human_judgment: false
  - id: PROVE-01-PROVE-04
    description: Corrected-source regression, mandatory bootstrap source binding and separate historical measurements
    verification: [{kind: integration, ref: ".planning/tmp/31-final-gates.json", status: pass}]
    human_judgment: false
---

# Phase 31 Plan 06: Bootstrap retry authority gap closure

**All autopilot claim retries retain withheld dispatch authority and route metadata; a complete fresh regression at the corrected source passes with 2150 total / 2136 passed / 0 failed / 14 skipped / 0 not-run.**

## Why this plan exists

Goal verification found G-31-01 after the earlier test run passed: the durable claimed-state same-nonce branch returned `dispatchAuthorized: true` before linking, even for autopilot. The separate task-run approval/start gates were not bypassed. This gap directly contradicted D-13/31-02, so the narrow closure plan was structurally and independently checked; completed Waves 1–5 were preserved.

## Task commits

| Task | Commit | Result |
|---|---|---|
| 31-06-01 | e3ead95 | Shared guarded action/reason, canonical autopilot authorization guard and route projection on retry; three-style service and real CLI regressions |
| 31-06-02 | b961a0f, 3215bca | Bootstrap becomes mandatory fifth source hash; previous measurements retained and fresh review bound before corrected-source full gate |

## Verification

- Targeted bootstrap-resume and composed journeys: **14 passed, 0 failed, 0 skipped** (`.planning/tmp/31-06-targeted.log`). Includes all three canonical autopilot styles across initial claim, pre-link retry and linked reentry; wrong nonce refuses and conversational retry retains its authority/route.
- Proof/docs checks before final gate: 9 passed, 1 Windows symlink skip, 0 failed.
- Independent correction review: clean at `b961a0f`.
- Fresh complete source: **`3215bca7540a964b02d5a7e636a8d5dcadf0ca3d`**. All eight D-14 commands passed in order; full `npm test` took 1799181 ms.
- Full runner: **2150 total, 2136 passed, 0 failed, 14 skipped, 0 not-run**, across 12 ordinary/isolated/packed groups (`.planning/tmp/31-final-counts.json`, `31-final-gates.json`, `31-final-*.log`).
- Post-ledger tests: 10 total, 9 passed, 0 failed, 1 host symlink skip (`.planning/tmp/31-06-post-ledger-tests.log`).
- Post-ledger archive audit: passed, 451 entries. Build artifact: verified, 348 inputs/686 outputs. Both proof verifiers valid; native-style archived evidence allVerified true. No fresh paid turns claimed.

## History and limits

The previous complete source `9b6679a` run remains in `priorCompletedRuns`, explicitly marked as passing tests followed by a later goal-verification gap. Its immutable copied logs use `31-9b6679a-31-final-*.log`. It is not used as corrected-source acceptance. The older `261101-ww3` timeout/not-run history remains unwaived, and every existing paid/CI/global/push/publication/version/milestone-review hold remains intact.

## Deviations

None from the scoped gap plan. The source fix changes the claim response guard/projection, not task-run's independent contract approval/start checks or native execution behavior.

## Self-Check: PASSED

The identified intermediate state is covered through real service and CLI calls, all corrected-source checks pass, source provenance includes the corrected module, and history remains separated. Objective work is complete; four original flagged prohibition judgments remain a separate explicit end-of-phase human checkpoint. Phase completion is not claimed here.

Final source/ledger review gate: clean at `2a16e9d`; G-31-01 and prior CR/WR findings are resolved in code/evidence. Four human prohibition decisions remain pending.
