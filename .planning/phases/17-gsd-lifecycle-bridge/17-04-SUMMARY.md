---
phase: 17-gsd-lifecycle-bridge
plan: "04"
subsystem: core
tags: [gsd-gap, defect-routing, roadmap-routing, anti-loop, regression-prevention]
requires: [17-02]
provides: [gap-router, anti-loop-progression, full-contract-reverification]
affects: [task-gap-router]
tech-stack:
  added: []
  patterns: [scope-based-routing, 3-stage-anti-loop, whole-contract-reverification]
key-files:
  created:
    - src/core/task-gap-router.ts
    - test/task-gap-router.test.ts
  modified: []
key-decisions:
  - "D-05: In-phase criteria defects route to native GSD gap plans (*-GAP-*.md), while scope or architectural expansions route to new phases in ROADMAP.md."
  - "D-06: Gap planning and roadmap additions invoke native GSD CLI conventions without creating shadow state."
  - "D-07: Gap plan resolution mandates full-contract re-verification across all criteria to prevent regressions."
  - "D-08: Repeated identical failures escalate through 3-stage progression and safely halt at blocked after exhausting alternatives."
requirements-completed: [GSD-02, GSD-03]
coverage:
  - deliverable: "Verification defect router, native GSD gap plan dispatcher, roadmap phase allocator, and anti-loop controller"
    verification:
      kind: command
      ref: "dist/test/task-gap-router.test.js"
      status: pass
    human_judgment: false
duration: 5 min
completed: 2026-10-03
---

# Phase 17 Plan 04: Verification Gap Routing & Anti-Loop Recovery Summary

Implemented verification defect routing, native GSD gap plan integration, roadmap phase allocation, whole-contract re-verification enforcement, and 3-stage anti-loop progression satisfying GSD-02, GSD-03, Success Criterion 2, and user decisions D-05 through D-08.

## Accomplishments
- Implemented `src/core/task-gap-router.ts`:
  - `routeVerificationGap`: Evaluates defect scope and failure history, routing in-phase defects to native GSD gap plans (`*-GAP-*.md`), architectural / capability expansions to new roadmap phases in `ROADMAP.md`, and exhausted retry loops to `blocked`.
  - `createGsdGapPlanArgs` & `createNewPhaseRoadmapArgs`: Generates standard GSD CLI arguments for gap planning (`["query", "plan-phase", phaseId, "--gaps", gapSummary]`) and roadmap addition (`["phase", "add", phaseName, "--description", reason]`) preserving GSD as the sole lifecycle state authority.
  - `evaluateGapProgression`: Integrates with Phase 15 failure fingerprinting and `selectRepairStrategy`, advancing through `stage-1-reproduction-injection`, `stage-2-single-criterion-focus`, and escalating to `stage-3-blocked` with `shouldBlock: true`.
  - `requireFullContractReverification`: Mandates verification across all approved contract criteria following gap execution, preventing partial-fix regressions.
- Created test suite in `test/task-gap-router.test.ts` with 7 passing tests covering in-phase gap routing, roadmap phase expansion, GSD CLI argument formatting, 3-stage failure progression, fail-closed `blocked` escalation, and whole-contract re-verification.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-gap-router.test.js && npm run check`: 7 tests passed (100% green), 0 type errors.

## Next Steps
- Execute Plan 17-05: GSD lifecycle step runner and multi-phase progression orchestrator (`src/core/task-gsd-lifecycle.ts`).
