---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 17
subsystem: capability-canary
tags: [canary, cli, fail-closed, codex, context7]

requires:
  - phase: 03-16
    provides: Native Codex CAPA-01 invocation and observation-front evidence
provides:
  - Fail-closed explicit harness and capability selection
  - CLI refusal before state resolution, harness probes, announcements, callbacks, or spend
  - Parsed native Codex-only CAPA-01 completion evidence
affects: [capability-ledger, doctor-canary, native-verification]

actuals:
  tokens: 3327
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - Treat an explicit CLI filter as an assertion that at least one declared leg must run
    - Keep selection policy in the core selector and invoke it at the earliest CLI boundary

key-files:
  created: []
  modified:
    - src/core/canary.ts
    - src/cli.ts
    - test/canary.test.ts

key-decisions:
  - "An explicit harness or capability filter that selects zero declarations is a stable refusal, not a skipped or unverified evidence row."
  - "The CLI calls the core selector before state-root resolution and harness version probing; runCanarySweep retains the same assertion as defense in depth."

patterns-established:
  - "Explicit-selection assertion: zero work is valid only for an unfiltered sweep; explicit zero matches throw CANARY_SELECTION_EMPTY."
  - "Bounded refusal: errors contain only requested catalog identifiers, declared alternatives, and a runnable correction."

requirements-completed: [CAPA-01, CAPA-07]

coverage:
  - id: D1
    description: Explicit harness and capability filters that match no declarations refuse before any callback.
    requirement: CAPA-07
    verification:
      - kind: unit
        ref: test/canary.test.ts#an explicit empty selection refuses before announcements or run callbacks
        status: pass
      - kind: unit
        ref: test/canary.test.ts#an unfiltered empty catalog remains a valid zero-work sweep
        status: pass
    human_judgment: false
  - id: D2
    description: The compiled doctor CLI refuses a Pi filter before creating managed state and exposes no private values.
    requirement: CAPA-07
    verification:
      - kind: integration
        ref: test/canary.test.ts#compiled doctor refuses an undeclared Pi canary before creating managed state
        status: pass
      - kind: integration
        ref: node dist/src/cli.js doctor --canary . --harness pi --no-spend --json
        status: pass
    human_judgment: false
  - id: D3
    description: The shipped Codex CAPA-01 filter selects one spending leg and no-spend accounts for it without launching.
    requirement: CAPA-01
    verification:
      - kind: integration
        ref: test/canary.test.ts#compiled doctor accounts for the one Codex CAPA-01 no-spend leg without launching it
        status: pass
    human_judgment: false
  - id: D4
    description: A live Codex-only CAPA-01 run crossed the observation front and produced invoked and held evidence.
    requirement: CAPA-01
    verification:
      - kind: e2e
        ref: node dist/src/cli.js doctor --canary . --harness codex --capability CAPA-01 --json
        status: pass
    human_judgment: false
  - id: D5
    description: Targeted canary and isolation tests plus the complete repository suite pass after gap closure.
    requirement: CAPA-07
    verification:
      - kind: integration
        ref: node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/isolation.test.js
        status: pass
      - kind: integration
        ref: npm test
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-09-13
status: complete
---

# Phase 03 Plan 17: Fail-Closed Canary Selection Summary

**Explicit canary filters now refuse zero matches before state or spend, and Codex alone closes CAPA-01 with observation-derived invoked/held evidence**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-13T17:23:00+09:00
- **Completed:** 2026-09-13T17:42:00+09:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added the stable `CANARY_SELECTION_EMPTY` refusal for explicit harness or capability filters that select no declared legs, while preserving valid unfiltered zero-work sweeps.
- Bound `doctor --canary` to the selector before state-root resolution, harness probes, cost announcements, runtime callbacks, or ledger work.
- Proved the negative Pi path without state creation and the positive Codex-only CAPA-01 path with `nativeUse: invoked`, `held: true`, three observations, and no Claude result.

## Task Commits

Each TDD task was committed as a RED test followed by its implementation:

1. **Task 1 RED: Empty-selection core contract** - `1d545e0`
2. **Task 1 GREEN: Fail-closed explicit filters** - `8ab8541`
3. **Task 2 RED: Doctor CLI selection boundary** - `222dcfe`
4. **Task 2 GREEN: Earliest CLI validation** - `cdb23a6`

## Files Created/Modified

- `src/core/canary.ts` - Defines the stable selection refusal and enforces it in the core selector used by sweeps.
- `src/cli.ts` - Validates the requested declaration set before resolving mutable or executable runtime concerns.
- `test/canary.test.ts` - Covers core ordering, compiled CLI behavior, no-spend accounting, and refusal redaction.

## Decisions Made

- Kept the refusal outside `blocked` and `unverified`: those are evidence outcomes, while a zero-match explicit request is invalid configuration and must not create an evidence row.
- Reused `selectCanaries` at the CLI boundary rather than duplicating matching rules or user-facing alternatives in the CLI.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - the final native check reused the existing Codex login by reference and introduced no credential or configuration requirement.

## Next Phase Readiness

- Gap G-03-1 is closed: Codex natively invoked version-scoped Context7, and an explicit zero-match filter can no longer report success.
- Phase 03 is ready for aggregate code review and goal verification.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-13*
