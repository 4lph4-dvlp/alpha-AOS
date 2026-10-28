---
phase: quick
plan: 261028-mmk
type: execute
autonomous: true
files_modified:
  - schemas/task-contract.schema.json
  - test/task-contract.test.ts
must_haves:
  truths:
    - Existing native gsd-multi-phase and gsd lifecycle routes can be selected by a validated development contract.
    - Unknown workflows remain rejected and existing quick/connector contracts retain validation and digest behavior.
    - Contract preview is read-only; this repair neither approves nor starts user work.
---

# Repair native full GSD contract validation

User approved repairing the installed alpha-AOS repository on 2026-10-28 so the existing Oh-My-Circuit task can resume. This is a focused tooling repair, separate from the unapproved revision of that autopilot contract. Sol high owns diagnosis/plan/review; Terra high implements this plan. Native runner model routing already exists in src/core/task-run.ts and src/core/task-gsd-lifecycle.ts; do not build another orchestrator.

## Evidence and boundaries

- Live failure: alpha-aos task preview of the proposed resume contract returns CONTRACT_INVALID, schema.enum at /scope/workflow for gsd-multi-phase.
- src/core/task-run.ts already dispatches gsd-multi-phase and gsd into startMultiPhaseTask.
- schemas/task-contract.schema.json only allows gsd-quick and generic-connector.
- Live baseline: no tracked modifications; another operator's untracked .planning/quick/261028-lv9-repair-ci-parity-and-weekly-dependency-v/261028-lv9-SUMMARY.md must be preserved.
- Own only the two production/test files above and this task's SUMMARY. No global settings, credentials, other quick tasks, lifecycle acceptance gates, model substitutions, or releases. Parent owns STATE updates after completion; do not write STATE while executing.

## Task 1

Files: schemas/task-contract.schema.json; test/task-contract.test.ts

Action: Add real contract-loader regression coverage for gsd-multi-phase and gsd, with distinct stable canonical digests; retain unknown workflow rejection and quick/connector behavior. Demonstrate failure before the fix. Extend the workflow enum only for the existing native lifecycle routes. Do not relax the closed schema, approval requirements, side effects, or verification. If inspection reveals a second necessary validation path, diagnose and report before expanding ownership.

Verify: npm run build; node --test --test-name-pattern="multi-phase|workflow|full GSD" dist/test/task-contract.test.js (use names matching the added regressions).

Done: New tests fail before the enum change and pass after it, including rejection of unsupported workflows. Commit code/tests atomically with an honest message and preserved unrelated work.

## Task 2

Files: this task's 261028-mmk-SUMMARY.md

Action: Run required full suite once at the final gate using the repository test runner, save verbose logs outside the repo, and report bounded totals, failures, commit, and exit code. Do not retry quota failures or duplicate an existing active run. Record incomplete checks honestly. Parent will verify the real Oh-My-Circuit contract preview and append GSD state after terminal completion.

Verify: npm test (one final suite); npm run check if not covered by build; npm run build:check.

Done: Summary records exact targeted/full validation evidence and any unrelated failures. No push or deployment. Do not claim Oh-My-Circuit resumed or accepted.
