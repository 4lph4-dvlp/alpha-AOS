---
phase: 12-red-main-guard
plan: 02
subsystem: ci-workflows
tags: [ci, github-actions, workflows, red-main-guard, candidate-promotion, tarball-audit]

requires:
  - phase: 12-red-main-guard
    provides: scripts/red-main-guard.mjs and scripts/check-main-baseline.mjs modules with unit tests
provides:
  - .github/workflows/red-main-guard.yml: tracking issue automation on main CI completions
  - .github/workflows/dependency-candidate.yml: promotion gating and status surfacing on candidate PR
affects: [candidate dependency staging, main CI issue tracking]

actuals:
  tokens: 38000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "workflow_run trigger for secure default-branch issue tracking isolation"
    - "Minimal least-privilege permissions: issues: write, contents: read, actions: read"
    - "Promotion status surfacing via PR description banner and promotion-blocked label"
    - "Candidate workflow exits 0 to preserve reviewability of staged dependency locks"

key-files:
  created:
    - .github/workflows/red-main-guard.yml
  modified:
    - .github/workflows/dependency-candidate.yml

key-decisions:
  - "D-05/D-06: .github/workflows/red-main-guard.yml is triggered on workflow_run (CI completed on main) and workflow_dispatch with minimal permissions `issues: write`, `contents: read`, `actions: read`, keeping `ci.yml` strictly `contents: read`"
  - "D-07: Defense-in-depth condition `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.head_branch == 'main'` prevents execution on non-main branches"
  - "D-08/D-10: .github/workflows/dependency-candidate.yml permissions widened to `contents: write`, `pull-requests: write`, `issues: write`, `actions: read`, and executes `check-main-baseline.mjs --update-pr`, exiting 0 on block to preserve reviewability"

patterns-established:
  - "Privilege separation between pull request CI runs and default-branch issue management"
  - "Step summary + PR banner + label integration for clear operational status visibility"

requirements-completed: [CI-04, DEP-03]

coverage:
  - id: D-05-D-07
    description: "Red-main guard workflow triggered on CI completion on main with minimal issue permissions"
    requirement: CI-04
    verification:
      - kind: integration
        ref: ".github/workflows/red-main-guard.yml"
        status: pass
    human_judgment: false
  - id: D-08-D-11
    description: "Candidate dependency workflow invokes baseline check and surfaces promotion block"
    requirement: DEP-03
    verification:
      - kind: integration
        ref: ".github/workflows/dependency-candidate.yml"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-09-24
status: complete
---

# Plan 12-02 Summary: Workflow Integration and End-to-End Validation

Plan 12-02 wired the core guard logic into GitHub Actions automation and completed end-to-end repository validation, satisfying requirements **CI-04** and **DEP-03**.

## Implemented Workflows

### 1. `.github/workflows/red-main-guard.yml`
- Triggers on `workflow_run` (workflow: `CI`, types: `[completed]`, branches: `[main]`) and `workflow_dispatch`.
- Scope bounded with minimal permissions: `issues: write`, `contents: read`, `actions: read`.
- Defense-in-depth gate: `if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.head_branch == 'main'`.
- Runs `node scripts/red-main-guard.mjs` with runtime metadata environment variables (`WORKFLOW_RUN_ID`, `WORKFLOW_RUN_BRANCH`, `WORKFLOW_RUN_SHA`, `WORKFLOW_RUN_CONCLUSION`, `WORKFLOW_RUN_URL`, `GH_TOKEN`).

### 2. `.github/workflows/dependency-candidate.yml`
- Permissions widened to include `issues: write` (for label management) and `actions: read` (for querying completed CI runs).
- Integrates step `Check main CI baseline and update candidate promotion status` running `node scripts/check-main-baseline.mjs --update-pr --candidate-branch automation/dependency-candidate`.
- Exits 0 on promotion block so staged candidate lock updates stay reviewable and inspectable.

## Verification & Self-Check

- TypeScript typecheck (`npm run check`): 0 errors.
- Build and manifest verification (`npm run build && npm run build:check`): passed with 126 inputs and 250 outputs matching exactly.
- Test suites (`npm test`): 934 tests executed, 925 passing, 0 failing, 9 skipped across the entire repository.
- Release tarball audit (`npm run audit-tarball`): PASSED with 158 allowlisted entries verified in `alpha-aos-0.1.0.tgz`.

## Self-Check: PASSED
