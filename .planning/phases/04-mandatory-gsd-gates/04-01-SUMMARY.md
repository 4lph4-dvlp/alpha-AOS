---
phase: 04-mandatory-gsd-gates
plan: 01
subsystem: core
tags: [gates, git-diff, risk-matching, obligations, silent-pass]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "runProcess, commandProbeEnvironment, resolveCommand, catalog/facts.yaml"
provides:
  - "src/core/gate.ts — resolvePhaseGitDiff, matchRiskFacts, evaluateRiskObligations, RISK_SURFACE_DEFINITIONS"
  - "Cumulative Git diff resolution covering phase base commit through working-tree uncommitted changes (D-01)"
  - "Path glob and safe identifier matching without scanning file bodies for arbitrary credentials (D-02)"
  - "Zero-obligation silent pass for low-risk changes (D-03, GATE-04)"
  - "Deterministic selection of security-review, database-migration, or release-check obligations (GATE-01)"
affects: [gate-engine, gate-lifecycle, gsd-capability-overlay, worker-authority]

actuals:
  tokens: 48000
  tasks: 3
  commits: 1
plan_head_before: a427e83

tech-stack:
  added: []
  patterns:
    - "Cumulative Git diff inspection over baseCommit..working tree with untracked file inclusion (-uall)"
    - "Path glob matching using compiled RegExps for risk surfaces"
    - "Safe inspection of package.json version changes via runProcess show without credential scanning"
    - "Zero-obligation silent pass returning obligations: [] and silentPass: true for documentation, styles, and non-risk files"

key-files:
  created:
    - src/core/gate.ts
    - test/gate-diff.test.ts
  modified:
    - catalog/facts.yaml
    - src/types.ts

key-decisions:
  - "resolvePhaseGitDiff uses runProcess exclusively, never calling raw spawn/spawnSync, honoring project process policies"
  - "Untracked files are captured via git status --porcelain -uall so nested directory contents are individually enumerated"
  - "Risk surface definitions maintain deferredTo: 'GATE-01' in catalog/facts.yaml with x-risk-surface: true to protect Phase 2 static pack planning invariants"
  - "package.json changes without a version bump (e.g. devDependencies or formatting) are safely excluded from release-check obligations"

requirements-completed: [GATE-01, GATE-04]

coverage:
  - id: D-01
    description: "Cumulative phase git diff captures changes across commits and working tree"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "test/gate-diff.test.ts#resolvePhaseGitDiff captures cumulative changes across multiple commits and uncommitted working tree"
        status: pass
  - id: D-02
    description: "Deterministic risk surface matching via path globs and safe identifiers without credential scanning"
    requirement: "GATE-01"
    verification:
      - kind: integration
        ref: "test/gate-diff.test.ts#secret configuration change matches secrets by path glob without leaking values (D-02)"
        status: pass
      - kind: integration
        ref: "test/gate-diff.test.ts#safe structural identifier matching detects auth imports without cred scanning (D-02)"
        status: pass
  - id: D-03
    description: "Zero-obligation silent pass for low-risk work"
    requirement: "GATE-04"
    verification:
      - kind: integration
        ref: "test/gate-diff.test.ts#evaluateRiskObligations grants silent pass with zero obligations for low-risk work (GATE-04, D-03)"
        status: pass
---

# Phase 04 Plan 01 Summary

## Summary of Accomplishments
1. **Core Gate Engine (`src/core/gate.ts`)**:
   - Implemented `resolvePhaseGitDiff` providing cumulative phase diff inspection spanning from the resolved base commit (`origin/main`, `main`, `master`, `.planning/STATE.md` `state_head`, or root commit) through all intermediate commits and uncommitted working-tree modifications (staged, unstaged, and untracked files).
   - Ensured shell-free subprocess execution via `runProcess` with bounded output and environment policies, maintaining full compliance with the process adapter assertion in `test/process.test.ts`.

2. **Deterministic Risk Surface Matching (`RISK_SURFACE_DEFINITIONS`, `matchRiskFacts`)**:
   - Defined operational change-risk authorities covering authentication boundaries (`auth-change`), database migrations (`database-migration`), release configurations (`release-check`), and the remaining security facts (`secrets`, `trust-boundary`, `user-input`, `payments`, `sensitive-data`, `command-execution`, `public-api`).
   - Implemented path glob matching and safe identifier matching without scanning file bodies for credentials or secrets (AGENTS.md secrets constraint, D-02).
   - Implemented safe inspection for `package.json` to prevent formatting or non-version changes from triggering `release-check`.
   - Preserved `catalog/facts.yaml` schema validity with `x-risk-surface: true` and `deferredTo: "GATE-01"`.

3. **Zero-Obligation Silent Pass Engine (`evaluateRiskObligations`)**:
   - Engineered the silent pass mechanism: when diff inspection finds zero risk facts matched, `evaluateRiskObligations` immediately returns `silentPass: true` and `obligations: []` (GATE-04, D-03).
   - When risk files are detected, deterministically selects and deduplicates the required obligations (`"security-review"`, `"database-migration"`, `"release-check"`) in a stable order.

4. **Automated Verification**:
   - Created comprehensive test suite `test/gate-diff.test.ts` with 10 test cases verifying cumulative diff resolution, untracked file handling, silent passes, individual obligation triggers, safe identifier matching, and leak-free secret detection.
   - All 786 project tests pass (777 passed, 9 skipped, 0 failed).

## Self-Check: PASSED
- `src/core/gate.ts` exists and compiles cleanly.
- `test/gate-diff.test.ts` exists and passes 10/10 tests.
- Git commit `c904106` created for production and test changes.
