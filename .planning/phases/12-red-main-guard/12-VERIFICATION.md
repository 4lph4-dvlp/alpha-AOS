---
phase: 12-red-main-guard
verified: 2026-09-24T10:55:00Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
overrides_applied: 0
overrides: []
flagged_prohibitions: 0
prohibitions_resolved: "All prohibitions held"
human_verification: []
---

# Phase 12: Red-Main Guard Verification Report

**Phase Goal:** Surfaces a red `main` CI as a self-closing tracking issue (never duplicated) and blocks dependency candidate promotion while the `main` CI baseline is red.
**Verified:** 2026-09-24T10:55:00Z
**Status:** passed
**Re-verification:** No. Initial verification.

## Goal Achievement & Requirement Traceability

### Requirement CI-04: Red-Main Tracking Issue Lifecycle
- Dedicated standalone module `scripts/red-main-guard.mjs` implements `runRedMainGuard`, `parseMatrixLegs`, `formatMatrixTable`, `defaultExecutor`, `RED_MAIN_LABEL`, `RED_MAIN_TITLE_PREFIX`.
- Dedicated workflow `.github/workflows/red-main-guard.yml` triggers on `workflow_run` (workflow: `CI`, types: `[completed]`, branches: `[main]`) and `workflow_dispatch`.
- Scope and permissions strictly bounded to `issues: write`, `contents: read`, `actions: read`, keeping `.github/workflows/ci.yml` strictly read-only.
- Defense-in-depth condition `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.head_branch == 'main'` ensures non-main branches never trigger issue modifications.
- Label preflight with `--force` avoids HTTP 422 errors.
- Deduplication ensures repeated failures update the existing issue body and append a comment without opening multiple issues.
- Auto-closing on green CI resolves open issues with state reason `completed` and cites the passing run ID and SHA.

### Requirement DEP-03: Dependency Candidate Promotion Gate
- Dedicated standalone module `scripts/check-main-baseline.mjs` implements `checkMainBaseline`, `renderPromotionBanner`, `updateCandidatePrStatus`, `defaultExecutor`, `PROMOTION_STATUS_START`, `PROMOTION_STATUS_END`, `PROMOTION_BLOCKED_LABEL`.
- Candidate workflow `.github/workflows/dependency-candidate.yml` permissions widened to `contents: write`, `pull-requests: write`, `issues: write`, `actions: read`.
- Automated baseline check runs `scripts/check-main-baseline.mjs --update-pr --candidate-branch automation/dependency-candidate`.
- Fails closed if the `main` CI baseline run is missing or API errors occur.
- PR description status banner is idempotently replaced within bounded HTML comments (`<!-- PROMOTION-STATUS-START -->` ... `<!-- PROMOTION-STATUS-END -->`).
- Safely toggles label `promotion-blocked`, omitting `--remove-label` when absent to prevent GitHub API validation errors.
- Candidate staging exits 0 to preserve reviewability of staged dependency updates.

### Observable Truths Matrix

| # | Truth / Requirement | Status | Evidence |
|---|---|---|---|
| 1 | When a main CI run fails, `runRedMainGuard` opens exactly one tracking issue with label `ci-red-main` and title prefix `[CI] Main branch failure: run #<id>` (CI-04, D-01, D-04) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario 1 passes. Issue created with run ID, commit SHA, and 3-OS matrix table. |
| 2 | When main CI fails repeatedly while a tracking issue is already open, `runRedMainGuard` refreshes the existing issue body with the latest matrix table and appends a single timestamped comment without creating duplicate issues (CI-04, D-01, D-02) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario 2 passes. Issue edit and comment called; no issue create call. |
| 3 | When main CI completes green on all legs, `runRedMainGuard` posts a resolution comment referencing the successful run ID and SHA and closes the tracking issue with state reason `completed` (CI-04, D-03) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario 3 passes. Resolution comment posted and issue closed with `--reason completed`. |
| 4 | When main CI completes green with no issue open, no action is taken (CI-04) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario 3b passes with `{ action: 'none' }`. |
| 5 | When triggered for a non-main branch, `runRedMainGuard` immediately exits with `{ action: 'ignored' }` and performs no GitHub API mutations (CI-04, D-07) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario non-main passes with 0 CLI calls. |
| 6 | 3-OS matrix parsing correctly extracts failed steps across OS legs and prerequisite package failure (CI-04, D-04) | ✓ VERIFIED | `test/red-main-guard.test.ts` Scenario parseMatrixLegs passes with expected markdown table format. |
| 7 | When the latest completed main baseline CI run is red or failing, `checkMainBaseline` reports promotion blocked naming the failing run ID, SHA, and failed OS legs (DEP-03, D-08, D-11) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario 4 passes with eligible: false and failedLegs. |
| 8 | When the latest completed main baseline CI run is green, `checkMainBaseline` reports promotion eligible naming the green baseline run ID and SHA (DEP-03, D-08, D-11) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario 5 passes with eligible: true and baselineRun info. |
| 9 | When no completed main baseline run exists, `checkMainBaseline` fails closed and reports promotion blocked (DEP-03, D-09, D-15) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario 6 passes with eligible: false and baselineRun: null. |
| 10 | When GitHub API query errors occur, `checkMainBaseline` fails closed and reports promotion blocked (DEP-03, D-09, D-15) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario 6b passes with eligible: false and baselineRun: null. |
| 11 | Candidate PR body updates idempotently replace the promotion status section bounded by comments without clobbering other description text (DEP-03, D-08) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario banner replacement passes. |
| 12 | The `promotion-blocked` label is preflighted and toggled safely, invoking `--remove-label` only when the label is currently present on the candidate PR (DEP-03, D-08) | ✓ VERIFIED | `test/check-main-baseline.test.ts` Scenario safe label toggle passes across all 4 combinations. |
| 13 | A dedicated GitHub Actions workflow `.github/workflows/red-main-guard.yml` is triggered on `workflow_run` (CI completed on main) and `workflow_dispatch` with minimal permissions `issues: write`, `contents: read`, `actions: read` (CI-04, D-05, D-06, D-07) | ✓ VERIFIED | `.github/workflows/red-main-guard.yml` verified with YAML parse and schema checks. |
| 14 | `.github/workflows/dependency-candidate.yml` permissions widened to `contents: write`, `pull-requests: write`, `issues: write`, `actions: read`, invoking `check-main-baseline.mjs --update-pr` and exiting 0 on block (DEP-03, D-08, D-10) | ✓ VERIFIED | `.github/workflows/dependency-candidate.yml` verified with YAML parse and step checks. |
| 15 | Build artifact manifest matches compiled sources and outputs exactly (`npm run build:check`) | ✓ VERIFIED | `dist/build-artifact.json` verified (126 inputs, 250 outputs). |
| 16 | Release packaging audit passes with positive allowlist and zero leaks (`npm run audit-tarball`) | ✓ VERIFIED | `alpha-aos-0.1.0.tgz` verified with 158 allowlisted entries and 0 violations. |

## Prohibitions Check

- MUST NOT invoke GitHub CLI commands via shell interpolation (`sh -c` or `pwsh -c`): HELD. Both scripts strictly use `spawn("gh", args, { shell: false, windowsHide: true })`.
- MUST NOT create duplicate tracking issues for repeated main CI failures: HELD. Open issues are queried by label `ci-red-main` and refreshed.
- MUST NOT report candidate promotion as eligible when completed main baseline run is missing or unreadable: HELD. Fails closed with `eligible: false`.
- MUST NOT invoke `gh pr edit --remove-label promotion-blocked` if label not present: HELD. `pr.labels` is inspected before removing.
- MUST NOT grant write permissions to `ci.yml`: HELD. `ci.yml` remains strictly `contents: read`.
- MUST NOT fail candidate workflow with non-zero exit code when blocked: HELD. Script exits 0 and communicates via banner and label.

---
**Score:** 16/16 must-haves verified
**Status:** PASSED
