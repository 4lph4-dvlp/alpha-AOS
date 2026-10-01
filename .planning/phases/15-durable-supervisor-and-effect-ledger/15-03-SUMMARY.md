---
phase: 15-durable-supervisor-and-effect-ledger
plan: 03
subsystem: effect-control
tags: [operation-keys, effect-ledger, state-machine, reconciliation, crash-recovery, node-test]

requires:
  - phase: 15
    plan: 01
    provides: "durable append-only journal and atomic checkpoints"
provides:
  - "Deterministic effect operation keys (generateEffectKey)"
  - "Effect ledger state machine (planned -> performing -> applied | failed | uncertain)"
  - "Deterministic source evidence reconciliation (reconcileEffectEvidence, reconcileLedgerOnRecovery)"
affects: [15-06]

actuals:
  tokens: 39000
  tasks: 2
  commits: 1
plan_head_before: 859f4632a4e9b9c97b83ec4d57c234a413d78c0e

tech-stack:
  added: []
  patterns:
    - "Canonical JSON sorting for deterministic SHA-256 operation key generation"
    - "Fail-closed crash recovery transitioning unprovable effects to unknown/blocked"
    - "Source-evidence inspection across filesystem hashes, git commits, and package manifests"

key-files:
  created:
    - test/task-effects-ledger.test.ts
  modified:
    - src/core/task-effects.ts

key-decisions:
  - "Operation keys strictly bind contractDigest, attemptIndex, effectType, and canonical targetPayload"
  - "State transitions forbid backwards or skipped states (e.g. applied -> planned)"
  - "Ambiguous or conflicting source evidence halts supervisor recovery in blocked mode"

patterns-established:
  - "reconcileLedgerOnRecovery returns hasUnknown: true whenever any performing/uncertain effect cannot be verified"
  - "Effects already confirmed by source evidence transition to applied without re-running writes"

requirements-completed: [TOOL-03]

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 03: Deterministic Operation Keys and Effect Ledger State Machine Summary

**Implemented deterministic operation keys (`generateEffectKey`), the effect ledger state machine (`planned` -> `performing` -> `applied` | `failed` | `uncertain`), and deterministic source evidence reconciliation (`reconcileEffectEvidence`, `reconcileLedgerOnRecovery`) in `src/core/task-effects.ts`.**

## Accomplishments
- `src/core/task-effects.ts`:
  - `generateEffectKey`: computes SHA-256 over `${contractDigest}:${attemptIndex}:${effectType}:${canonical(targetPayload)}`.
  - `recordEffectState`: enforces strict valid transitions (`planned -> performing`, `performing -> applied | failed | uncertain`, `uncertain -> applied | unknown | planned`).
  - `reconcileEffectEvidence`: inspects actual disk hashes for `workspace-write`, git log commits for `local-commit`, and dependency field differences for `dependency-change`.
  - `reconcileLedgerOnRecovery`: reconciles all interrupted effects on recovery, marking confirmed effects `applied` and ambiguous effects `unknown`.
- `test/task-effects-ledger.test.ts`:
  - 10 unit tests verifying deterministic key generation across key permutations, state transitions, workspace write evidence, git log commit evidence, dependency change evidence, and crash recovery with unknown blockers.

## Verification
- `npm run check`: exit 0 (0 TS errors).
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects-ledger.test.js`: 10 passed, 0 failed.

## Self-Check: PASSED
