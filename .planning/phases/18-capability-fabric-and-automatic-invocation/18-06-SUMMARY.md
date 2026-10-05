---
phase: 18-capability-fabric-and-automatic-invocation
plan: "06"
status: completed
completed_at: 2026-10-05T22:40:00+09:00
commits:
  - de53acb feat(18-06): display task-centric capability summary in task plan and status
  - (this plan) test(18-06): align CAP-05 tracer with D-13 blocked halt introduced in 18-05
artifacts:
  - src/cli.ts
  - src/format.ts
  - src/core/task-capability-inventory.ts
  - src/core/task-capability-drift.ts
  - src/core/task-capability-obligations.ts
  - test/task-cli-capabilities.test.ts
  - test/task-cli.test.ts
  - test/task-capability-trace.test.ts
requirements_addressed: [CAP-01, CAP-03, CAP-04]
---

# Plan 18-06 Summary: Read-only Task Plan/Status Capability Presentation

## Executive Overview

`task plan` and `task status` now show a short, task-focused capability summary by default. `--detail` and `--json` expose the full versioned inventory, step obligations, receipts, and drift/recovery guidance. All of it comes from one structured read model (`TaskCapabilityReport`), so the default, detail, and JSON views can't disagree.

## Delivered Capabilities

### 1. Task-centric default summary (Task 1, D-16)
- New read-only `alpha-aos task plan <contract.json> [--detail] [--json]` route. It refuses `--apply` and writes nothing to the project or `stateRoot`. This is checked by a before/after listing of the state root.
- `task status <id>` now includes a `Capabilities:` block (Selected / Failed / Blocked / Omitted) alongside the existing checkpoint and GSD diagnostics.
- Empty categories render as `none`. Failed receipts show outcome plus a redacted error. Unverified receipts are labelled `unverified` and never shown as active or invoked (CAP-01 prohibition).

### 2. Full inventory, detail/JSON, and drift guidance (Task 2, D-16, D-17)
- `buildTaskCapabilityReport` (`src/core/task-capability-inventory.ts`) combines inventory, step obligations, D-07 omissions, receipts, and the drift assessment.
- The `--detail` view adds:
  - a Step Obligations table
  - the Capability Inventory with orthogonal axes (deployment / support / native-use) and selection or exclusion reasons
  - Capability Drift Guidance (changed fields, drift reasons, invalidated receipt IDs, next action)
  - a Capability Receipts table where each receipt is `valid`, `invalidated`, or `unverified`, so old audit receipts stay separate from current proof.
- Receipts expose only IDs, source/version, and the result hash. No credential values or tool response bodies appear in output.

## Fixes Made Along the Way
- **Approved plan path:** the inventory now reads the approved project plan from `PROJECT_PLAN_ARTIFACT` (`.alpha-aos/plan.json`). It previously used a non-existent `project-plan.json`, so approved project packs never reached task inventory.
- **Cross-phase drift detection (`task-capability-drift.ts`):** receipts now match an obligation by obligation ID or capability ID. A receipt recorded in a different step than the current one triggers `phase-mismatch` → `re-invoke`. Before this, the extra `r.step === obligation.step` filter meant a cross-phase receipt could never be compared at all.
- **Report fingerprints:** the baseline phase comes from the recorded receipts and the current phase from the evaluated step. Previously the same fingerprint was passed for both, so drift could never be detected.
- **D-07 project skill matching (`task-capability-obligations.ts`):** a project skill now also supersedes global `documentation-lookup` when the documentation question names the skill (by name or short ID). Previously only skills whose IDs contained `doc` matched.
- **Stale 18-01 tracer (`task-capability-trace.test.ts`):** 18-05's D-13 rule makes a failed required capability with no alternate halt as `blocked` before any verdict is issued. The CAP-05 tracer still expected `unknown` plus a verdict precondition, so it had been failing since `5ff5136` (confirmed by reverting the 18-06 source changes). It now asserts `blocked`, a `capability-failure` stop reason, and no verdict.

## Deviations
- Tasks 1 and 2 landed in a single feature commit (`de53acb`) instead of one commit per task, because both share the same report model and CLI routes.

## Verification
- `test/task-cli-capabilities.test.ts`: 10/10. Covers default/detail/JSON parity, `--apply` refusal, no mutations, D-07 omission, D-17 drift invalidation, empty/multiple-omission/blocked formatting, and absence of credential keys.
- Phase 18 capability suites (drift, selection, inventory, receipts, session, trace, task-run, task-cli, task-cli-capabilities): 116/116.
- `npm run check`: 0 errors.
