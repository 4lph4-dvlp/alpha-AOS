---
phase: 18-capability-fabric-and-automatic-invocation
plan: "03"
status: completed
completed_at: 2026-10-03T13:20:00+09:00
commits:
  - ae2dc21 feat(18-03): implement setup operation barrier and read-only pack checkpoint
  - 4daf01c feat(18-03): implement exact digest approval and fresh session discovery
artifacts:
  - src/core/task-effects.ts
  - src/adapters/task-agents.ts
  - src/core/task-capability-obligations.ts
  - test/task-effects.test.ts
  - test/task-capability-session.test.ts
requirements_addressed: [CAP-02, CAP-03, CAP-04]
---

# Plan 18-03 Summary: Setup Barrier, Exact Digest Approval, and Fresh Session Discovery

## Executive Overview

Plan 18-03 delivered the setup operation completion barrier, read-only pack status checkpointing before application dispatch, and the exact digest approval to fresh session capability discovery and invocation pipeline.

## Delivered Capabilities

### 1. Setup Operation Completion Barrier (`src/core/task-effects.ts`)
- **D-01 (Consecutive Setup Aggregation):** Consecutive scaffolding and dependency installation operations are grouped under a single setup barrier section (`SetupBarrierTracker`). When all setup operations complete, a single read-only pack plan/status checkpoint runs before application work proceeds.
- **D-02 (Partial Setup Failure Handling):** If a setup operation fails after mutating project files or dependencies, the barrier records a read-only checkpoint of the current state and halts execution with status `needs-input`/`blocked` rather than allowing subsequent application work to proceed on a broken baseline.
- **D-04 (Subsequent Manifest Changes):** Subsequent manifest or lockfile modifications trigger re-validation of the barrier before dispatching application steps.
- **No-Op Protection:** Tasks with no setup changes bypass the pack checkpoint, avoiding unnecessary synchronization overhead.

### 2. Exact Digest Approval and CURRENT Enforcement (`src/core/project-pack-sync.ts`)
- **D-05 (Exact Plan Digest Binding):** Project pack synchronization (`planProjectPackSync`/`applyProjectPackSync`) strictly revalidates the current plan against the approved plan artifact. Any change to dependencies or manifest produces a new digest and triggers `driftRefusal` (`plan-drift`), rejecting stale autopilot approvals. Sync proceeds only when re-approved with the exact new digest.
- **Single Transaction Materialization:** Skill files, provenance sidecars, and receipts are atomically committed in one transaction, ensuring that CURRENT status guarantees both disk bytes and verification artifacts.

### 3. Fresh Session Rediscovery and Capability Invocation (`src/adapters/task-agents.ts`)
- **D-03 (Fresh Session Requirement):** Re-loading tools in an existing session is explicitly rejected (`allowExistingSessionReload: true` throws error). Fresh capability sessions (`startFreshCapabilitySession`) always allocate a new, distinct `sessionId` and execute native discovery probes for project skills and MCP tools.
- **Fresh Session Capability Port:** `createFreshSessionCapabilityPort` binds invocation requests to the fresh `sessionId`. Invoking undiscovered capabilities records a failure receipt (`outcome: "failed"`, `isError: true`) and prevents promotion to usable evidence.
- **Session ID Integrity Verification:** `verifyRequiredCapabilityReceipts` verifies that receipts belong to `currentSessionId`, rejecting receipts from older or mismatched sessions.

### 4. Word Boundary Robustness (`src/core/task-capability-obligations.ts`)
- Added word boundary assertions (`\b`) to `DOC_LOOKUP_PATTERN`, `DEEP_RESEARCH_PATTERN`, and `AMBIGUOUS_PATTERN` to prevent substring false-positives (such as `exa` matching `exactly`).

## Verification

- Automated test suites:
  - `test/task-effects.test.ts`: 25 passing tests including 4 setup barrier scenarios (consecutive scaffolding/install, partial failure, manifest change, no-op).
  - `test/task-capability-session.test.ts`: 6 passing tests covering exact approved plan digest requirement, stale approval rejection, tool reload rejection, fresh session discovery, undiscovered failure receipt generation, and stale session receipt rejection.
  - `test/project-pack-sync.test.ts`: 20 passing tests verifying transactional sync and status reporting.
  - `test/task-capability-selection.test.ts`: 9 passing tests for D-06..D-09 rules.
- Static type checking: `npm run check` with 0 errors.
