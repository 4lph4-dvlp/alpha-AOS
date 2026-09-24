---
phase: 12-red-main-guard
plan: 01
subsystem: ci-guard
tags: [ci, github-actions, issue-lifecycle, baseline-check, dependency-promotion]

requires:
  - phase: 10-three-os-ci-baseline
    provides: green 3-OS CI matrix across ubuntu, macos, and windows
provides:
  - scripts/red-main-guard.mjs: tracking issue lifecycle on main CI failures (open, refresh, auto-close)
  - test/red-main-guard.test.ts: in-memory unit tests covering 6 lifecycle scenarios
  - scripts/check-main-baseline.mjs: candidate promotion baseline verification with fail-closed gating
  - test/check-main-baseline.test.ts: in-memory unit tests covering 6 baseline check and PR update scenarios
affects: [12-02 workflow integration, candidate promotion gate]

actuals:
  tokens: 42000
  tasks: 4
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Standalone Node.js ES modules using pure Node 24 standard libraries with injectable CommandExecutor"
    - "GitHub CLI argument vector execution with shell: false and windowsHide: true"
    - "Preflight label creation with --force to prevent HTTP 422 errors"
    - "Bounded HTML comment replacement for idempotent PR description status updates"
    - "Guarded PR label removal only when label is present to avoid API validation errors"

key-files:
  created:
    - scripts/red-main-guard.mjs
    - test/red-main-guard.test.ts
    - scripts/check-main-baseline.mjs
    - test/check-main-baseline.test.ts
  modified: []

key-decisions:
  - "D-01/D-02: Tracking issue identified by label `ci-red-main` and title prefix `[CI] Main branch failure: run #<id>`; repeated failures refresh issue body and append comment without duplication"
  - "D-03: Main CI passing green auto-closes open tracking issue with reason completed and resolution comment"
  - "D-07: Defense-in-depth non-main branch check exits with `{ action: 'ignored' }` without GitHub mutations"
  - "D-08/D-09: Candidate promotion baseline check queries latest completed run and fails closed if run missing or API errors"
  - "D-10: check-main-baseline CLI exits 0 to preserve reviewability of staged candidate lock updates"

patterns-established:
  - "Injectable mock command executor for deterministic in-memory GitHub CLI unit testing"
  - "Fail-closed baseline decision when API errors or no completed CI runs exist"

requirements-completed: [CI-04, DEP-03]

coverage:
  - id: D-01-D-04
    description: "Tracking issue opened on red, refreshed on repeated red, auto-closed on green with 3-OS matrix table"
    requirement: CI-04
    verification:
      - kind: unit
        ref: "test/red-main-guard.test.ts"
        status: pass
    human_judgment: false
  - id: D-08-D-11
    description: "Candidate baseline check reports eligible on green, blocked on red, fails closed on null/error, and safely toggles promotion-blocked label"
    requirement: DEP-03
    verification:
      - kind: unit
        ref: "test/check-main-baseline.test.ts"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-24
status: complete
---

# Plan 12-01 Summary: Core Guard Logic and Unit Test Suites

Plan 12-01 implemented the core logic and deterministic unit test suites for Phase 12 as a robust tracer slice, satisfying requirements **CI-04** and **DEP-03**.

## Implemented Components

### 1. `scripts/red-main-guard.mjs`
- Manages the lifecycle of automated tracking issues on `main` branch CI failures.
- Exports `runRedMainGuard`, `defaultExecutor`, `parseMatrixLegs`, `formatMatrixTable`, `RED_MAIN_LABEL`, `RED_MAIN_TITLE_PREFIX`.
- Implements:
  - Defense-in-depth filtering: exits immediately on non-main branches with `{ action: "ignored" }`.
  - Open tracking issue: queries open issues with label `ci-red-main`.
  - On CI failure: extracts 3-OS matrix legs (`ubuntu-latest`, `macos-latest`, `windows-latest`) plus prerequisite release package step, preflights label creation with `--force`, and opens a new issue or refreshes an existing issue body with an appended timeline comment.
  - On CI success: auto-closes existing open issue with state reason `completed` and posts a resolution comment citing the green run ID and commit SHA.

### 2. `test/red-main-guard.test.ts`
- Tests 6 distinct lifecycle scenarios with 100% in-memory mock executors:
  1. Main CI fails first time -> preflights label and creates tracking issue with matrix table.
  2. Main CI fails while issue open -> refreshes issue body and appends comment without duplication.
  3. Main CI passes while issue open -> posts resolution comment and auto-closes issue with reason `completed`.
  4. Main CI passes with no issue open -> takes no action (`{ action: "none" }`).
  5. Non-main branch execution -> ignores and performs 0 GitHub CLI mutations.
  6. Matrix parsing -> extracts failed steps and prerequisite package failures accurately.

### 3. `scripts/check-main-baseline.mjs`
- Evaluates the latest completed `main` CI baseline to gate candidate dependency promotion.
- Exports `checkMainBaseline`, `defaultExecutor`, `renderPromotionBanner`, `updateCandidatePrStatus`, `PROMOTION_STATUS_START`, `PROMOTION_STATUS_END`, `PROMOTION_BLOCKED_LABEL`.
- Implements:
  - Fail-closed query: if API errors or no completed `main` run exists, returns `{ eligible: false, reason: "..." }`.
  - When baseline is green: returns `{ eligible: true }`.
  - When baseline is failing: returns `{ eligible: false, failedLegs: [...] }`.
  - PR status banner: bounded by `<!-- PROMOTION-STATUS-START -->` and `<!-- PROMOTION-STATUS-END -->`, idempotently replacing previous banners while preserving surrounding text.
  - Safe label toggling: adds `promotion-blocked` when blocked (only if absent); removes `promotion-blocked` when eligible (only if present, preventing GitHub API validation errors).
  - Emits summary markdown to `$GITHUB_STEP_SUMMARY`.
  - CLI entry point always exits 0 per D-10 to maintain inspectability of staged candidate lock changes.

### 4. `test/check-main-baseline.test.ts`
- Tests 6 baseline verification scenarios with 100% in-memory mock executors:
  1. Candidate promotion check on red main -> returns blocked and names failing run and legs.
  2. Candidate promotion check on green main -> returns eligible and names baseline run.
  3. Candidate promotion check with no completed main runs -> fails closed and returns blocked.
  4. Candidate promotion check on API error -> fails closed and returns blocked.
  5. Idempotent banner update -> cleanly replaces existing banner slice while preserving surrounding content.
  6. Safe label toggle -> calls `--remove-label` only when label exists, and calls `--add-label` only when label missing.

## Verification & Self-Check

- Unit tests: `npm run check && npm run build && node --test dist/test/red-main-guard.test.js dist/test/check-main-baseline.test.js` passed 12/12 tests with 0 failures.
- Zero platform-specific path literal violations introduced.
- All acceptance criteria verified.

## Self-Check: PASSED
