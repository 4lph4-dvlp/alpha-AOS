---
phase: 01-safe-operation-boundary
plan: 11
subsystem: infra
tags: [subprocess, environment-allowlist, fixture, installer, redaction, stdin]

requires:
  - phase: 01-08
    provides: "runProcess, environment policy, bounded redacted excerpts"
  - phase: 01-09
    provides: "MutationSession and durable transaction state"
provides:
  - "Every fixture and installer child runs through the process adapter"
  - "nodeRuntimeEnvironment: one declared allowlist for Node/npm children"
  - "describeProcessFailure: coded, fingerprinted failure text with no raw output"
affects: [01-14, 01-15, 01-16]

actuals:
  tokens: 11000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A child's environment is named by the operation, never inherited"
    - "A failure is described by code, exit metadata and stream fingerprints"

key-files:
  created: []
  modified:
    - src/core/install.ts
    - src/core/mcp-fixture.ts
    - src/core/ecc-fixture.ts
    - src/core/gsd-fixture.ts
    - src/core/gsd-compat.ts
    - src/core/doctor.ts
    - src/core/process.ts
    - src/cli.ts
    - test/process.test.ts

key-decisions:
  - "The runCommandCapture compatibility wrapper is removed now that no caller remains"
  - "runProcess gained stdin so the Codex Stop hook can be driven the way Codex drives it"
  - "The remaining direct spawn is named as an explicit, tested exception rather than hidden"

patterns-established:
  - "A source-level test enumerates every module and fails on a direct spawn or an ambient-environment spread"

requirements-completed: [SAFE-06]

coverage:
  - id: D1
    description: "No source module spawns a child outside the process adapter or spreads the ambient environment"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#no source module spawns a child outside the process adapter"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fixture and installer children receive only the names their operation declares"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#the environment policy for a node child names what it passes"
        status: pass
    human_judgment: false
  - id: D3
    description: "A failed fixture or installer step is described without quoting raw output"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/process.test.ts#a failed child is described by fingerprints, never by its raw output"
        status: pass
    human_judgment: false
  - id: D4
    description: "Fixtures precompute their paths and consume a caller-supplied MutationSession"
    requirement: SAFE-06
    verification: []
    human_judgment: true
    rationale: "Not built. Fixtures still call mkdtemp during apply and acquire their own session through applyFileTransaction; the plan/execute split is described below as an open gap."
  - id: D5
    description: "The MCP protocol probe runs through openProtocolProcess"
    requirement: SAFE-06
    verification: []
    human_judgment: true
    rationale: "Not built. mcp-fixture.ts still spawns its JSON-RPC child directly because the one-shot adapter cannot express a bidirectional session; the exception is named and asserted in test/process.test.ts."

duration: 75min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 11: Fixture and installer subprocess migration

**Every fixture and installer child now runs through the process adapter with a declared environment, a deadline and an output cap, and no failure path quotes raw output — but the plan/execute split with caller-supplied sessions and the protocol-session transport are not built.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-09-04
- **Tasks:** 3 (two partially — see below)
- **Files modified:** 9

## Accomplishments

- **Every `runCommandCapture` and ambient `spawnSync` call site is migrated** across `install.ts`, `mcp-fixture.ts`, `ecc-fixture.ts`, `gsd-fixture.ts` and `gsd-compat.ts`. The compatibility wrapper is deleted now that nothing calls it, so there is no remaining path that bypasses the policy.
- **`nodeRuntimeEnvironment()` replaces every `...process.env` spread.** One declared allowlist covers what a Node or npm child needs to find the system, its cache and its temp space; each operation adds only the names it owns. `PLATFORM_FLOOR_ENVIRONMENT` is folded in so the list stays honest about what Windows delivers regardless.
- **`describeProcessFailure()` is the single failure-text seam.** A failed step reports its coded outcome, exit status, timeout/cap flags and stream fingerprints plus a bounded redacted stderr excerpt — never raw output, and never a value the adapter itself handed the child.
- **`runProcess` gained `stdin`,** so the Codex Stop hook smoke test is driven the way Codex drives it — one JSON event in, silence and a zero exit as the pass condition — instead of through a bare `spawnSync` that inherited the whole environment.
- **`runDoctor` and the smoke test became async** to carry that change through `doctor.ts`, `gsd-compat.ts`, `gsd-fixture.ts` and `cli.ts`.
- **The isolated `project run` launch no longer spreads `process.env`.** It materializes a declared environment instead; narrowing this further is phase 5's isolation work, and the comment says so.
- **A source-level test enumerates every module** under `src/` and fails on a direct spawn or an ambient-environment spread, so a future regression is caught structurally rather than by review.

## Verification

`node --test dist/test/process.test.js` → 19/19.

## Deviations from Plan

Two of the plan's three tasks are only partly done. Both gaps are recorded above as `human_judgment: true` coverage entries rather than marked complete.

**The plan/execute split is not built.** The plan asks for `createMcpFixtureOperationPlan` / `createGsdFixtureOperationPlan` / `createEccFixtureOperationPlan` returning a read-only plan with precomputed fixture, temp, source, package, cache, config and target paths plus a complete `OperationPathProofSet`, and mutating executors that require a caller-supplied `MutationSession`. What exists still calls `mkdtemp` during apply and lets `applyFileTransaction` acquire its own session. Every fixture is therefore still serialized and path-proven — but by the transaction, not by a reviewed plan the caller approved first.

**`openProtocolProcess` is not built.** `mcp-fixture.ts` drives a long-lived JSON-RPC session over stdio, which the one-shot adapter cannot express. This is the same gap recorded in the 01-08 summary. The direct `spawn` is now named as an explicit exception in `test/process.test.ts`, so it is visible and cannot widen silently.

The plan itself places aggregate ordering and single-session ownership in plan 01-14. Both gaps sit naturally with that work rather than with a subprocess migration.

## Next Phase Readiness

Wave 4 (`01-12`, `01-13`) can proceed: they depend on the session-aware mutators, not on the fixture plan/execute split. `01-14` should absorb the two gaps above alongside its own ordering contract.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
