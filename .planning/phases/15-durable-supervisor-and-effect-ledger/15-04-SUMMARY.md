---
phase: 15-durable-supervisor-and-effect-ledger
plan: 04
subsystem: task-limits
tags: [resource-limits, cost-meter, quota-exhaustion, stop-reasons, fail-closed, node-test]

requires:
  - phase: 15
    plan: 02
    provides: "process cancellation and resource monitoring boundaries"
provides:
  - "Resource policy schema and models for maxCycles, maxWallTimeMinutes, maxCostUsd, maxTokens"
  - "Fail-closed cost meter checking (checkCostMeterReadiness)"
  - "Standard stop reason classification (evaluateResourceLimits, detectQuotaExhaustion)"
affects: [15-06]

actuals:
  tokens: 41000
  tasks: 2
  commits: 1
  plan_head_before: ca13319089aa14d59f7df8b6d4b4a1b072212959

tech-stack:
  added: []
  patterns:
    - "Cent-safe financial precision rounding Math.round(cost * 100) / 100"
    - "Fail-closed cost meter refusal (cost-meter-unavailable) when cost telemetry missing"
    - "Explicit unmetered field disclosures in usage breakdowns"

key-files:
  created:
    - test/task-limits.test.ts
  modified:
    - schemas/task-contract.schema.json
    - src/core/task-contract.ts

key-decisions:
  - "ResourcePolicy enforces strict schema boundary validations (maxCycles >= 1, maxWallTimeMinutes 1..1440, maxCostUsd >= 0.01, maxTokens >= 1)"
  - "Unmetered telemetry fields explicitly recorded rather than reported as 0"
  - "Canonical alphabetical ordering in digestableTaskContract preserves contract digest stability"

patterns-established:
  - "StandardStopCode distinguishes cycle_limit_exceeded, wall_time_exceeded, cost_limit_exceeded, no_progress_exhausted, quota_exhausted"
  - "Quota exhaustion regex detects HTTP 429, insufficient quota, credit balance exhausted, and rate limits"

requirements-completed: [RUN-04]

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 04: Resource Policy Schema Expansion and Stop Code Classifier Summary

**Extended `schemas/task-contract.schema.json` and `src/core/task-contract.ts` with comprehensive resource limits (`maxCycles`, `maxWallTimeMinutes`, `maxCostUsd`, `maxTokens`), fail-closed cost meter checking (`checkCostMeterReadiness`), and standard stop reason classification (`evaluateResourceLimits`, `detectQuotaExhaustion`).**

## Accomplishments
- `schemas/task-contract.schema.json`:
  - Added `resourcePolicy` properties with strict bounds: `maxCycles` (int, min 1), `maxWallTimeMinutes` (int, min 1, max 1440), `maxCostUsd` (num, min 0.01), `maxTokens` (int, min 1).
- `src/core/task-contract.ts`:
  - Defined `TaskResourcePolicy`, `StandardStopCode`, `TaskUsageBreakdown`.
  - Updated `digestableTaskContract` with canonical alphabetical key ordering (`maxCostUsd`, `maxCycles`, `maxTokens`, `maxWallTimeMinutes`).
  - Updated `changedContractFields` to detect changes across all resource limit fields.
  - Implemented `evaluateResourceLimits`: cent-safe rounding, unmetered field tracking, standard stop codes.
  - Implemented `checkCostMeterReadiness`: fail-closed refusal when `maxCostUsd` is requested without telemetry.
  - Implemented `detectQuotaExhaustion`: catches HTTP 429, provider credit exhaustion, rate limit errors.
- `test/task-limits.test.ts`:
  - 10 unit tests covering schema boundaries, alphabetical key stability, field diffs, cycle / wall time limits, cent-safe cost precision, unmetered reporting, fail-closed meter checking, and quota detection.

## Verification
- `npm run check`: exit 0.
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-limits.test.js`: 10 passed, 0 failed.

## Self-Check: PASSED
