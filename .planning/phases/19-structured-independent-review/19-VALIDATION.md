---
phase: "19"
slug: "structured-independent-review"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-08"
---

# Phase 19 — Validation Strategy

> A report is usable only when every mandatory criterion has current, resolvable evidence. A confirmed defect creates one bounded repair route; a milestone cannot be accepted before a separate review of the exact revision.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Node.js `node:test`, TypeScript 5.9.3 |
| **Config file** | `tsconfig.json`, `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-evidence.test.js && npm run check` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | Measure during execution; retain bounded targeted feedback |

## Sampling Rate

- **After every task commit:** Build, run that task's focused `dist/test/*.test.js` fixture and type check.
- **After every plan wave:** Run the changed modules' integration fixtures and `npm run check`.
- **Before phase verification:** Run `npm test && npm run check` and inspect exact-revision review evidence.
- **Max feedback latency:** Target less than 120 seconds for focused checks; record actual time in summaries.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure behavior | Test type | Automated command | File exists | Status |
|---|---|---:|---|---|---|---|---|---|---|
| 19-01-01 | 01 | 1 | REV-02 | T-19-01 | Complete, resolvable report only | tracer | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-evidence.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | REV-02, REV-04 | T-19-02 | Malformed or stale whole report refused | adversarial | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-evidence.test.js dist/test/task-verdict.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 19-02-01 | 02 | 2 | REV-02, REV-05 | T-19-03 | Objective architecture and scope classification | contract | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-classification.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-02-02 | 02 | 2 | REV-05 | T-19-04 | Suggestions persist without contract expansion | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-suggestions.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-03-01 | 03 | 3 | REV-04 | T-19-05 | One confirmed cause, one GSD item | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-repair.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-03-02 | 03 | 3 | REV-04 | T-19-06 | New revision/session rechecks all criteria; recurrence needs new failure | adversarial | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-repair.test.js dist/test/task-supervisor-recovery.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 19-04-01 | 04 | 4 | REV-03 | T-19-07 | Separate final review gates milestone acceptance | milestone tracer | `npm run build && node scripts/run-tests.mjs --files dist/test/task-final-review.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-04-02 | 04 | 4 | REV-03, REV-05 | T-19-08 | Missing feature and architecture violation route; suggestion stays deferred | adversarial | `npm run build && node scripts/run-tests.mjs --files dist/test/task-final-review.test.js dist/test/task-review-repair.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-05-01 | 05 | 5 | REV-02..05 | T-19-09 | Terminal report shows criteria, checks, reviewer, evidence and unknown | CLI | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-review.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 19-05-02 | 05 | 5 | REV-02..05 | T-19-10 | Cross-path false acceptance and no-progress blocked | end-to-end | `npm run build && node scripts/run-tests.mjs --files dist/test/task-review-adversarial.test.js && npm run check` | ❌ W0 | ⬜ pending |

New test files are created by their owning tasks before the command runs. All task commands use the existing compiled test runner.

## Wave 0 Requirements

- [ ] Create the shared exact-revision reviewer/evidence fixture for the first tracer in `test/task-review-evidence.test.ts`.
- [ ] Add a bounded fixture with an intentionally missing feature, an approved architecture rule violation, two criteria sharing one cause, and an unrelated suggestion.
- [ ] Ensure simulated reviewer ports expose requested and observed session IDs separately; no fixture may equate a prompt with an independent receipt.

## Manual-Only Verifications

| Behavior | Requirement | Why manual | Test instructions |
|---|---|---|---|
| Real installed reviewer session and milestone integration/codebase assessment on an exact revision | REV-03, REV-04 | Fake adapters cannot prove a native signed-in review session or human judgment on maintainability | Record harness executable/version, fresh session ID, Git SHA, artifact digest, report digest, reviewed source/check references and objective architecture-rule evidence. Any unrun cell remains `unknown` or `unverified`. |

## Validation Sign-Off

- [ ] Every task has a runnable `<automated>` command and an observable `<fails_when>`.
- [ ] Wave 0 creates every new fixture before its command runs.
- [ ] No watch-mode flags appear in verification commands.
- [ ] Focused feedback latency is measured and bounded.
- [ ] Exact-revision, malformed-report, suggestion and milestone negative controls are green.
- [ ] Set `nyquist_compliant: true` only after the validation proof succeeds.

**Approval:** pending
