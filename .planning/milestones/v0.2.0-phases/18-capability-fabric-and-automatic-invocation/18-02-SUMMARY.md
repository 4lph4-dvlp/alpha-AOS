---
phase: 18-capability-fabric-and-automatic-invocation
plan: "02"
status: completed
completed_at: 2026-10-03T13:00:00+09:00
commits:
  - e0edeb9 feat(18-02): implement full project capability inventory graph
  - b2f03ca feat(18-02): implement capability selection and reuse decision rules
artifacts:
  - src/types.ts
  - src/core/task-capability-inventory.ts
  - src/core/task-capability-obligations.ts
  - test/task-capability-inventory.test.ts
  - test/task-capability-selection.test.ts
requirements_addressed: [CAP-01, CAP-03, CAP-04, CAP-05]
---

# Plan 18-02 Summary: Full Project Capability Inventory and Selection Rules

## Executive Overview

Plan 18-02 established the versioned, project-scoped capability inventory and the deterministic D-06..D-09 step-boundary decision rules.

## Delivered Capabilities

### 1. Version-Bound Capability Inventory (`src/core/task-capability-inventory.ts`)
- Implemented `buildTaskCapabilityInventory` to synthesize all 10 declaration categories:
  - GSD workflows (`gsd-workflow`)
  - Global ECC skills (`ecc-global-skill`)
  - Project ECC skills (`ecc-project-skill`)
  - alpha-AOS owned skills (`owned-skill`)
  - MCP servers (`mcp-server`) and tools (`mcp-tool`)
  - Capability packs (`capability-pack`)
  - alpha-AOS control commands (`control-command`)
  - Harness native tools (`native-tool`)
  - Mandatory lifecycle hooks and quality gates (`mandatory-hook`)
- Preserved three independent, orthogonal axes for each row:
  - `deployment`: `PackState` (`"CURRENT" | "STALE" | "DRIFTED" | "CHANGED" | "CONFLICT" | "UNDECIDABLE"`)
  - `nativeUse`: `NativeUseState` (`"discovered" | "invoked" | "unverified"`)
  - `support`: `SurfaceSupport` (`"supported" | "unsupported" | "unverified"`)
- Maintained strict separation: host facts and ledger proofs never enter the approval `inputFingerprint`.
- Enforced CAP-01 prohibition: unapproved project packs are marked unselected (`selected: false`) and are never presented as globally available.

### 2. Decision Rules and Result Reuse (`src/core/task-capability-obligations.ts`)
- **D-06 (Distinct Research Paths):** When a task requires both version-specific library documentation and external examples, both `documentation-lookup`/Context7 and `deep-research`/Exa obligations are selected without dropping either.
- **D-07 (Project Skill Precedence):** When an approved project-only skill and a global skill fulfill the same requirement, the project-only skill is prioritized. Omitted global skills are recorded with an explicit reason in `omitted`.
- **D-08 (Ambiguity Resolution):** When requirement status is ambiguous in the task description and unsupported by repository files, `evaluateStepObligations` halts execution with `status: "needs-input"` specifying the missing evidence.
- **D-09 (Receipt Reuse):** Prior GSD step receipts are reused only if source, version, scope, question match, and outcome is `"ok"`. Reused obligations link `reusedFromReceiptId` and `originalReceiptId` rather than falsely claiming a fresh invocation. Changed question, source, version, or failed status triggers a fresh invocation.

## Verification

- Automated test suites:
  - `test/task-capability-inventory.test.ts`: 6 passing tests covering enumeration, uniqueness, unapproved pack isolation, approval target state, ledger orthogonality, lock sensitivity, and harness filtering.
  - `test/task-capability-selection.test.ts`: 9 passing tests covering D-06..D-09 decision rules, ambiguity resolution, and receipt reuse.
  - Regression: `test/task-capability-trace.test.ts` (10 passing tests).
- Static type checking: `npm run check` with 0 errors.
