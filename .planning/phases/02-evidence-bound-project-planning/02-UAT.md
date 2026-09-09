---
status: testing
phase: 02-evidence-bound-project-planning
source: [02-VERIFICATION.md]
started: 2026-09-09T02:35:00Z
updated: 2026-09-09T02:35:00Z
---

## Current Test

number: 1
name: Decide how D-13 drift classification should behave at the CLI when no `.alpha-aos/plan.json` exists yet
expected: |
  Either a refusal that names the moved noun in every case, or a must-have narrowed
  to match D-12 + SAFE-01.
awaiting: user response

## Tests

### 1. Decide how D-13 drift classification should behave at the CLI when no `.alpha-aos/plan.json` exists yet
expected: Either permit the preview to write a reviewed-plan record so the refusal can always name the moved noun, or scope the must-have truth to callers that hold the plan value.
result: [pending]

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
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
