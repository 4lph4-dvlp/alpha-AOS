---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 15
subsystem: test-infrastructure
tags: [mcp, ci, upstream-gate, anti-vacuity]
requires:
  - phase: 03-14
    provides: completed capability evidence reporting and the remaining verification observations
provides:
  - Pure classification of pinned MCP startup failures with strict CI and graceful local behavior
  - CI-wide enforcement that registry-unreachable pinned MCP startup regressions fail on all three operating systems
  - A live pending-server precondition on the Claude MCP finding regression guard
affects: [ci, mcp-proxy, capability-oracle, phase-verification]
tech-stack:
  added: []
  patterns: [pure environment gate classification, exported workflow-variable contract, anti-vacuity preconditions]
key-files:
  created:
    - test/helpers/upstream-gate.ts
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-15-SUMMARY.md
  modified:
    - test/mcp-proxy.test.ts
    - test/capability-oracle.test.ts
    - .github/workflows/ci.yml
key-decisions: []
patterns-established:
  - Registry-dependent tests classify captured stderr through one pure helper before deciding whether a local skip is justified.
  - CI workflow variables that alter test strictness are asserted from the same exported constant the tests read.
requirements-completed: []
coverage:
  - id: D1
    description: Registry-unreachable pinned MCP startup failures skip locally and fail in CI with the locked package and version named.
    verification:
      - kind: unit
        ref: test/mcp-proxy.test.ts#four classifyUpstreamFailure branch tests
        status: pass
      - kind: integration
        ref: test/mcp-proxy.test.ts#CI requires pinned upstream MCP startups using the helper's gate name
        status: pass
      - kind: integration
        ref: test/mcp-proxy.test.ts#three pinned-server exact tool-set tests
        status: pass
    human_judgment: false
  - id: D2
    description: The Claude pending-MCP finding assertion proves its live precondition and records its current structural limit.
    verification:
      - kind: unit
        ref: test/capability-oracle.test.ts#the recorded claude init event parses to its skills and its MCP servers, with pending recorded not judged
        status: pass
    human_judgment: false
actuals:
  tokens: 2225
  tasks: 2
  commits: 3
duration: 11min
completed: 2026-09-12
status: complete
---

# Phase 03 Plan 15: Fail-Closed Upstream Test Gates Summary

**A pure registry-failure classifier preserves offline developer skips while CI requires every pinned MCP tool-set regression to run or fail loudly.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-12T12:03:17Z
- **Completed:** 2026-09-12T12:14:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added offline branch coverage for registry-unreachable, strict-upstream, non-network, and empty-stderr startup failures.
- Set `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1` at the CI test-job level so both test entrypoints enforce the same three-OS policy without changing local skip behavior or exact MCP tool sets.
- Added a live nonempty pending-server precondition and an explicit structural-limit comment to the existing Claude MCP finding oracle assertion.

## Task Commits

Each task was committed atomically:

1. **Task 1: The three pinned-server regressions cannot skip silently in CI** - `457b4a9` (test)
2. **Task 2: An assertion that states its own precondition** - `6204e09` (test)

## Files Created/Modified

- `test/helpers/upstream-gate.ts` - Defines the shared gate name, unchanged registry vocabulary, and pure skip/fail classifier.
- `test/mcp-proxy.test.ts` - Routes pinned startups through the classifier and proves its four branches plus the workflow binding.
- `.github/workflows/ci.yml` - Requires upstream MCP startup success for the entire three-OS test job.
- `test/capability-oracle.test.ts` - States the pending-server premise and the current regression-guard limitation.

## Verification

- Task 1 focused gate: 36 tests passed, 0 failed.
- Task 2 focused gate: 30 tests passed, 0 failed.
- Final `npm test`: 739 tests, 733 passed, 6 existing platform skips, 0 failed.
- TypeScript check and build passed for both task boundaries.

## Decisions Made

None - followed the plan as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - CI supplies the strict gate; local environments retain the documented graceful skip.

## Next Phase Readiness

All 15 Phase 3 plans are implemented. Phase 3 remains pending verification, and all CAPA requirement statuses remain unchanged until that verification is completed.

## Self-Check: PASSED

All created and modified files exist, and both task commits are present in git history.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-12*
