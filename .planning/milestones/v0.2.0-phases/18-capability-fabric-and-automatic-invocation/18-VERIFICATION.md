---
phase: 18-capability-fabric-and-automatic-invocation
verified: 2026-10-08T04:10:00Z
status: passed
score: 5/5 success criteria verified
behavior_unverified: 0
overrides_applied: 0
---

# Phase 18: Capability Fabric and Automatic Invocation Verification Report

## Phase Goal
Every alpha-AOS capability that applies to a task is discoverable, safely activated and actually used at its natural GSD step, with missing required invocations preventing false completion.

## Requirements Coverage
| Requirement | Status | Verification Reference |
|---|---|---|
| **CAP-01**: Versioned, project-scoped capability inventory across 10 categories with orthogonal deployment, native use, and support axes | PASS | `dist/test/task-capability-inventory.test.js`, `dist/test/task-cli-capabilities.test.js` |
| **CAP-02**: Setup barrier, exact digest approval binding, CURRENT verification, and fresh session discovery | PASS | `dist/test/task-effects.test.js`, `dist/test/task-capability-session.test.js`, `dist/test/project-pack-sync.test.js` |
| **CAP-03**: Automatic step-boundary obligation matching, invocation receipts, MCP error preservation, and review boundary gating | PASS | `dist/test/task-capability-trace.test.js`, `dist/test/task-capability-receipts.test.js`, `dist/test/task-gsd-lifecycle.test.js` |
| **CAP-04**: Drift recomputation, targeted evidence invalidation, approved-equivalent fallbacks, and honest blocked reporting | PASS | `dist/test/task-capability-drift.test.js`, `dist/test/task-run.test.js`, `dist/test/task-cli-capabilities.test.js` |
| **CAP-05**: Positive/negative fixtures for all 77 declared capabilities, live 5-harness support matrix, and fail-closed missing-call gates | PASS | `dist/test/task-capability-fixtures.test.js`, `dist/test/capability-oracle.test.js`, `dist/test/task-gsd-adversarial.test.js` |

## Success Criteria Verification

### 1. Setup Barrier, Exact Digest Approval & Pack Checkpoint (SC1)
- **Status:** PASS
- **Evidence:** `test/task-effects.test.ts` verifies consecutive setup operation aggregation into a single barrier (`SetupBarrierTracker`), running the read-only pack checkpoint before application work. Partial setup failures halt execution safely. `test/task-capability-session.test.ts` and `test/project-pack-sync.test.ts` verify that modifying manifests/dependencies changes the plan digest and triggers `plan-drift` refusal, strictly preventing stale or unapproved digest synchronization.

### 2. Approved CURRENT Pack, Fresh Session Discovery & Step-Boundary Invocation (SC2)
- **Status:** PASS
- **Evidence:** `test/task-capability-session.test.ts` validates that tool reloads inside an existing session are rejected and fresh session IDs (`startFreshCapabilitySession`) are mandatory for discovering new project ECC skills and MCP tools. `test/task-capability-selection.test.ts` proves that D-07 project skill precedence selects project skills over global ones while recording explicit omission reasons for unused capabilities.

### 3. Automatic Step-Boundary Invocation, Documentation/Research Selection & Gate Failure on Missing Call (SC3)
- **Status:** PASS
- **Evidence:** `test/task-capability-trace.test.ts` and `test/task-gsd-lifecycle.test.ts` verify automatic obligation selection across GSD steps (`discuss`, `plan`, `execute`, `verify`) and the independent `review` boundary. Context7 (`documentation-lookup`) and Exa (`deep-research`) are both selected without omission (D-06). Missing or failing invocations prevent task acceptance in `reduceTaskVerdict` with failing preconditions, even when process exit code is 0 and reviewer passes.

### 4. Input Drift Invalidation, Proven Equivalents & Blocked Halts (SC4)
- **Status:** PASS
- **Evidence:** `test/task-capability-drift.test.ts` verifies that changes in phase, scope, manifest, pack state, or harness versions invalidate affected receipts while preserving external audit history. `test/task-run.test.ts` proves that unproven alternates fail, harness switches require exact approval digests, and unresolvable missing capabilities halt with `blocked` rather than silently dropping requirements.

### 5. Declaration Fixture Manifest (77 Capabilities) & Live Five-Harness Support Matrix (SC5)
- **Status:** PASS
- **Evidence:** `test/task-capability-fixtures.test.ts` enforces exact set equality between `CAPABILITY_FIXTURE_MANIFEST` and `buildTaskCapabilityInventory()` across all 77 declared capabilities, requiring positive and negative scenarios for every single item. `test/capability-oracle.test.ts` and `scripts/capability-host-matrix.mjs` evaluate all 385 host cells across Claude, Codex, Antigravity, Pi, and Hermes, strictly rejecting synthetic test promotion to live support.

## Automated Test Results
- Plan 18-focused suites (`task-capability-*`, `task-effects`, `task-cli-capabilities`, `capability-oracle`, `task-gsd-*`): 162 tests passed, 0 failed.
- Full regression test suite: 1,380 tests (1,370 passed, 0 failed, 10 skipped).
- TypeScript compilation: `npm run check` (`tsc -p tsconfig.json --noEmit`) clean with 0 errors.
