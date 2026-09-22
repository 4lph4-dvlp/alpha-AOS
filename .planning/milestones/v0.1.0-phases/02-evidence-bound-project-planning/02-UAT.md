---
status: complete
phase: 02-evidence-bound-project-planning
source: [02-VERIFICATION.md]
started: 2026-09-09T02:35:00Z
updated: 2026-09-09T03:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Decide how D-13 drift classification should behave at the CLI when no `.alpha-aos/plan.json` exists yet
expected: Either permit the preview to write a reviewed-plan record so the refusal can always name the moved noun, or scope the must-have truth to callers that hold the plan value.
result: pass
decision: |
  Narrow the must-have truth to callers that hold the reviewed plan value. The preview
  is NOT permitted to persist a reviewed-plan record — SAFE-01 ("the preview persists
  nothing") and D-12 (whose reversibility is declared costly, since the Phase 3 apply
  contract binds to the plan/approve split) both stand.

  Reproduced at HEAD 8e757db on this Windows host before deciding:
    - `project plan` on a fresh repo creates no `.alpha-aos/` — SAFE-01 holds in code.
    - Drift with NO prior artifact: honest refusal, "what moved cannot be named",
      exit 2, carries a runnable re-approval command.
    - The SAME drift WITH a prior artifact: `selection-changed: ... left WEB_BASE,
      WEB_REACT`, exit 2.
    - The suggested re-approval command was executed and succeeded (exit 0), so
      D-13's actual requirement — the refusal is not a dead end — holds in BOTH
      branches.

  ROADMAP success criterion 4 is satisfied either way; the un-nameable window exists
  only before a repository's first approval and closes permanently after it.

  Future candidate, NOT this phase: `ApproveProjectPlanOptions.reviewedPlan`
  (src/core/project-plan.ts:1533) is library-only. Exposing a `--reviewed-plan <file>`
  flag would let a caller supply the value it saved itself, closing the diagnostic gap
  without touching SAFE-01 or D-12. That is an interface change needing its own plan.

  Broken-windows ledger #14 closes as a DECISION, not a patchable bug.

<!--
Why this needs a human (re-confirmed verbatim at HEAD by the verifier):

WITH a prior artifact, the refusal names the noun:
  plan-drift: selection-changed: ... joined none; left WEB_BASE, WEB_REACT
  (reviewed 282d1264bc87, observed 4d0e852d3dd9)

WITHOUT one, it honestly declines to name it:
  The reviewed plan value is not available here, so what moved cannot be named;
  review the current plan again first.

Both branches refuse, both exit 2, both emit a runnable next step, and neither
lies — so ROADMAP success criterion 4 is satisfied EITHER WAY. This is not a
gap in criterion 4.

The open question is diagnostic quality versus a stated safety property.
Closing the diagnostic gap means letting the preview persist a reviewed-plan
record, which trades away SAFE-01 ("the preview persists nothing"). That is a
product decision, not a patchable bug.

Carried as broken-windows ledger entry #14.
-->

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
