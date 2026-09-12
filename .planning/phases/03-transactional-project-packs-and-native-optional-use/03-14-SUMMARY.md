---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 14
subsystem: capability-evidence
tags: [doctor, discovery, observable-serialization, report-semantics]
requires:
  - phase: 03-13
    provides: qualified capability proofs and claim-note report lines
provides:
  - Capability report rows whose not-run field and terminal code describe the native-use fact they hold
  - Discovery sweep entries with one canonical evidence-unit path and no cycle placeholder in the CLI envelope
  - Explicit resolution of the discovery-unit serialization deferred item
affects: [doctor, capability-report, capability-ledger, phase-verification]
tech-stack:
  added: []
  patterns: [axis-specific report vocabulary, identity-independent observable aggregate views]
key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-14-SUMMARY.md
  modified:
    - src/core/canary.ts
    - src/format.ts
    - test/canary.test.ts
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/deferred-items.md
key-decisions:
  - Keep unsupportedReason on oracle and process support-domain results; only CapabilityReportRow uses notRunReason.
  - Return identity-independent sweep aggregate views because observable serialization treats every repeated object reference as a cycle.
patterns-established:
  - Report field names and upper-code lines use the vocabulary of the axis they actually describe.
  - Canonical nested evidence remains complete while aggregate views avoid shared identities at serialization boundaries.
requirements-completed: []
coverage:
  - id: D1
    description: Supported capability rows report a reason nothing ran through notRunReason and a NOT-RUN line.
    requirement: CAPA-07
    verification:
      - kind: unit
        ref: test/canary.test.ts#a supported row says NOT-RUN when no discovery leg ran and repeats the reason in its detail cell
        status: pass
      - kind: other
        ref: npm run check
        status: pass
    human_judgment: false
  - id: D2
    description: The serialized doctor discovery envelope contains no cycle placeholder and retains a complete canonical discovery.unit.
    requirement: CAPA-01
    verification:
      - kind: integration
        ref: test/canary.test.ts#the serialized doctor discovery envelope has no cycle placeholder and keeps the canonical unit complete
        status: pass
      - kind: integration
        ref: test/canary.test.ts#discovery rows preserve the driven unit and the skipped leg's stated absence
        status: pass
    human_judgment: false
  - id: D3
    description: A deliberately unspent canary remains unverified with an axis note and never becomes blocked or NOT-RUN.
    requirement: CAPA-02
    verification:
      - kind: unit
        ref: test/canary.test.ts#a no-spend sweep records every spending leg unverified with its reason, and never blocked
        status: pass
    human_judgment: false
actuals:
  tokens: 5314
  tasks: 2
  commits: 3
duration: 17min
completed: 2026-09-12
status: complete
---

# Phase 3 Plan 14: Honest Report and Discovery Envelope Summary

**Capability reports now say `NOT-RUN` for native-use absences, while discovery JSON exposes complete evidence without circular placeholders.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-12T11:40:03Z
- **Completed:** 2026-09-12T11:56:35Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Renamed the report-only reason to `notRunReason` and rendered it as `NOT-RUN`, including the misleading combination where support is `supported` but no discovery leg ran.
- Removed `DiscoverySweepEntry.unit`; the canonical unit remains at `discovery.unit` with completeness, negative proof, and checked ancestors intact.
- Proved the actual doctor envelope shape serializes without cycle placeholders, preserved explicit skipped legs, and resolved the single recorded deferred item in place.

## Task Commits

Each task was committed atomically:

1. **Task 1: A row field and a rendered code that both describe the fact they hold** - `339b8e1` (fix)
2. **Task 2: One evidence unit, one place in the envelope** - `e82b523` (fix)

## Files Created/Modified

- `src/core/canary.ts` - Renames the report field, removes the sweep-entry alias, and returns serialization-safe aggregate views.
- `src/format.ts` - Emits `NOT-RUN` and reads `notRunReason` for the detail cell.
- `test/canary.test.ts` - Covers report semantics, canonical unit preservation, skipped legs, and observable serialization.
- `.planning/phases/03-transactional-project-packs-and-native-optional-use/deferred-items.md` - Replaces the sole open status with resolved and records the closing plan and commit.
- `.planning/phases/03-transactional-project-packs-and-native-optional-use/03-14-SUMMARY.md` - Records execution evidence and bounded remaining work.

## Decisions Made

- Kept `unsupportedReason` unchanged on `DiscoveryResult`, `PairedDiscovery`, and the process adapter because those fields genuinely describe support.
- Cloned sweep aggregate values and row-owned arrays at the observable boundary so the JSON serializer sees data rather than repeated object identities.
- Preserved all CAPA requirement statuses and left `requirements-completed` empty; Plan 03-14 closes report-surface findings without claiming the phase requirements complete.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed remaining repeated identities from the serialized doctor envelope**

- **Found during:** Task 2 serialization test.
- **Issue:** After removing `DiscoverySweepEntry.unit`, `sweep.units`, `sweep.proofs`, and row-owned reason/note arrays still reused identities already reachable through `discovery.unit`. The observable redactor classifies every repeated identity as a cycle, so the plan's no-placeholder acceptance criterion could not pass.
- **Fix:** Returned structured clones for aggregate unit/proof views and copied row-owned reason and claim-note values.
- **Files modified:** `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** The deterministic CLI-envelope test walks the serialized value and reports every cycle path; it now finds none. Focused suites pass 119/119.
- **Committed in:** `e82b523`

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug)
**Impact on plan:** The additional copies are required by the stated no-cycle-placeholder contract and do not add a feature or remove information.

## Issues Encountered

- The first focused Task 1 run found one existing ordering assertion that still named `UNSUPPORTED`; it was updated to the planned `NOT-RUN` code before the task commit.
- The Task 2 serialization test identified repeated fixture and report-view identities by exact JSON path. The fixture was corrected to match production construction, and the remaining production identities were removed as documented above.

## Verification

- `npm run check`, `npm run build`, and the canary suite passed 87/87 for Task 1.
- `npm run check`, `npm run build`, and the canary plus capability-oracle suites passed 119/119 for Task 2.
- The single final `npm test` passed: 734 total, 728 passed, 6 skipped host-specific fixtures, 0 failed.
- The deferred register contains exactly one status line and exactly one `status: resolved` line.
- The oracle adapter retains 8 `unsupportedReason` occurrences; no support-domain field was renamed.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-15 remains the only incomplete plan in Phase 3.
- All eight CAPA requirements remain unchecked for their separately defined completion evidence.
- No paid canary, model turn, or native harness discovery was run during this plan.

## Self-Check: PASSED

All five created or modified deliverable files exist, and both task commits are present in git history.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-12*
