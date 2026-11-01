---
phase: 15-durable-supervisor-and-effect-ledger
plan: 05
subsystem: strategy-engine
tags: [failure-fingerprint, no-progress, adaptive-repair, blocked-report, node-test]

requires:
  - phase: 15
    plan: 01
    provides: "durable append-only journal and atomic checkpoints"
provides:
  - "Deterministic error normalization and failure fingerprinting (normalizeErrorMessage, computeFailureFingerprint)"
  - "Two-consecutive repeated failure detector (NoProgressDetector)"
  - "Three-stage adaptive repair strategy controller (selectRepairStrategy)"
  - "Structured durable blocked reporting (BlockedReport, formatBlockedReport)"
affects: [15-06]

actuals:
  tokens: 42000
  tasks: 2
  commits: 1
  plan_head_before: d57574d754703565017cba570074a00445d47e85

tech-stack:
  added: []
  patterns:
    - "Normalized regex replacement of paths, timestamps, memory addresses, and line numbers for stable SHA-256 fingerprinting"
    - "Consecutive failure counter tracking repeated identical fingerprints"
    - "Escalating repair policy injecting reproduction context before restricting scope and halting in blocked mode"

key-files:
  created:
    - src/core/task-strategy.ts
    - test/task-strategy.test.ts
  modified: []

key-decisions:
  - "Fingerprint combines criterionId, cause, and SHA-256 hash of normalized error message"
  - "Two consecutive identical failures trigger immediate transition to Stage 1 reproduction injection"
  - "Four consecutive identical failures halt execution in Stage 3 blocked mode with durable structured report"

patterns-established:
  - "selectRepairStrategy guides supervisor through Stage 0 (default) -> Stage 1 (repro injection) -> Stage 2 (single criterion) -> Stage 3 (blocked)"
  - "formatBlockedReport generates human-readable terminal output without loss of structured diagnostics"

requirements-completed: [RUN-05]

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 05: Failure Fingerprinting, No-Progress Detector, and Adaptive Repair Controller Summary

**Implemented failure fingerprinting (`computeFailureFingerprint`), the 2-consecutive repeated failure detector (`NoProgressDetector`), and the 3-stage adaptive repair strategy controller (`selectRepairStrategy`) with structured blocked reporting (`BlockedReport`, `formatBlockedReport`) in `src/core/task-strategy.ts`.**

## Accomplishments
- `src/core/task-strategy.ts`:
  - `normalizeErrorMessage`: strips ANSI escapes, Windows/POSIX absolute paths, line/column numbers, ISO timestamps, and hex memory addresses.
  - `computeFailureFingerprint`: calculates deterministic `${criterionId}:${cause}:${sha256(normalizedError)}`.
  - `NoProgressDetector`: tracks consecutive identical fingerprints; reports repeated failure when threshold (>= 2) is met.
  - `selectRepairStrategy`: evaluates trailing failure progression:
    - 0-1 failure: `stage-0-default`
    - 2 consecutive: `stage-1-reproduction-injection` with reproduction test input and failure details
    - 3 consecutive: `stage-2-single-criterion-focus` with scope lock on the failing criterion
    - 4 consecutive: `stage-3-blocked` with full `BlockedReport`
  - `formatBlockedReport`: renders a clean terminal display with attempted strategies, reproduction evidence, and next actions.
- `test/task-strategy.test.ts`:
  - 10 unit tests verifying ANSI/path/time normalization, fingerprint invariance across transient noise, failure differentiation, detector resets on differing errors or success, 3-stage transitions, and blocked report formatting.

## Verification
- `npm run check`: exit 0.
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-strategy.test.js`: 10 passed, 0 failed.

## Self-Check: PASSED
