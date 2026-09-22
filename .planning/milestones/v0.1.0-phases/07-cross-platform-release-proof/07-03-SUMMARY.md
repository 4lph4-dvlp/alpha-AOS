---
phase: 07-cross-platform-release-proof
plan: 03
subsystem: testing
tags: [brownfield, gsd-lifecycle, worker-authority, rollback, unified-memory, context7]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "Evidence-matched project packs, native Context7 observations, and Unified Memory adapters"
  - phase: 04-mandatory-gsd-gates
    provides: "Mandatory lifecycle gate evaluation and single-controller policy"
  - phase: 07-cross-platform-release-proof
    provides: "Plans 01 and 02 release artifact, support matrix, and paired release-control foundations"
provides:
  - "Deterministic offline brownfield Git fixture and discuss-plan-execute-verify-ship benchmark"
  - "Standalone auditor runner proving Context7, project pack, security gate, handoff, and cleanup behavior"
  - "Worker planning-tamper rollback that remains classifiable when the delegated action also fails"
affects: [release-proof, worker-authority, project-packs, mandatory-gates, phase-07]

tech-stack:
  added: []
  patterns:
    - "Offline protocol observations and in-memory adapter runners prove integration contracts without external spend"
    - "Worker authority violations take precedence over delegated action failures after byte rollback is verified"
    - "Disposable project cleanup refuses residual owned files before removing empty owned directories"

key-files:
  created:
    - test/helpers/brownfield-fixture.ts
    - test/brownfield-gsd-cycle.test.ts
    - scripts/run-brownfield-proof.mjs
  modified:
    - src/core/worker-authority.ts

key-decisions:
  - "Exercise Context7 and Unified Memory through deterministic offline observations and a fixture runner; release proof must not depend on credentials, network availability, or paid calls"
  - "Map the plan's stale API names onto current contracts: planProjectCapabilities, memoryHandoff/memorySearch, and root-bounded project cleanup"
  - "When a worker mutates planning state and then throws, report planning-mutation-detected after verifying rollback while retaining the worker failure as diagnostic context"

patterns-established:
  - "Brownfield proof fixtures bind Git timestamps, local identity, package evidence, planning bytes, and support roots for repeatable hashes"
  - "Standalone audit scripts import compiled fixture logic so CI and human reproduction execute the same lifecycle implementation"

requirements-completed: [REL-04]

coverage:
  - id: D1
    description: "A deterministic brownfield repository completes discuss, plan, execute, verify, and ship while exercising all five representative benchmark elements"
    requirement: "REL-04"
    verification:
      - kind: e2e
        ref: "test/brownfield-gsd-cycle.test.ts#brownfield discuss-plan-execute-verify-ship cycle proves all five benchmark elements offline"
        status: pass
      - kind: other
        ref: "node scripts/run-brownfield-proof.mjs"
        status: pass
    human_judgment: false
  - id: D2
    description: "Hermes is denied controller authority and a concurrent writer cannot acquire the controller's state lock"
    requirement: "REL-04"
    verification:
      - kind: integration
        ref: "test/brownfield-gsd-cycle.test.ts#Hermes cannot claim the brownfield GSD controller role"
        status: pass
      - kind: integration
        ref: "test/brownfield-gsd-cycle.test.ts#a controller writer lock excludes a concurrent brownfield state writer"
        status: pass
    human_judgment: false
  - id: D3
    description: "A worker that changes planning bytes and then fails is rolled back byte-for-byte and rejected with planning-mutation-detected"
    requirement: "REL-04"
    verification:
      - kind: integration
        ref: "test/brownfield-gsd-cycle.test.ts#a failing worker that tampers with planning state is rolled back and reported as a planning mutation"
        status: pass
      - kind: other
        ref: "npm test (884 tests, 875 pass, 0 fail, 9 skipped)"
        status: pass
    human_judgment: false

# Metrics
duration: 20min
completed: 2026-09-20
status: complete
---

# Phase 07 Plan 03: Brownfield GSD Lifecycle and Single-Writer Proof Summary

**A deterministic offline brownfield lifecycle now proves Context7 use, project-pack materialization, mandatory security gating, cross-harness handoff, safe cleanup, and byte-verified single-writer rollback.**

## Performance

- **Duration:** 20 min after recovery
- **Started:** 2026-09-19T23:09:22Z
- **Completed:** 2026-09-19T23:29:13Z
- **Tasks:** 2
- **Files modified:** 4 implementation/test files

## Accomplishments

- Synthesized a realistic Express/TypeScript Git repository with deterministic history and pre-existing GSD planning state, then drove the complete discuss -> plan -> execute -> verify -> ship lifecycle inside disposable roots.
- Proved the five REL-04 benchmark elements without external calls: locked Context7 observation matching, API/web/brownfield pack projection, digest-bound security-review blocking, Codex-to-Antigravity memory handoff, and cleanup that preserves user source and planning bytes.
- Strengthened worker authority so planning mutations are restored and re-hashed before a stable `WorkerAuthorityError("planning-mutation-detected")` is returned, even when the delegated action also crashes.
- Added a standalone auditor command whose structured output shows step timings, selected packs, gate transition, and planning hashes.

## Task Commits

1. **Task 1: Brownfield fixture, five-element lifecycle, and standalone runner**
   - `2c32e53` — failing brownfield lifecycle proof (RED)
   - `0b251a0` — deterministic offline lifecycle and standalone auditor (GREEN)
2. **Task 2: Single GSD writer enforcement**
   - `49e206c` — failing worker-tamper classification and lock tests (RED)
   - `35ff658` — verified rollback and stable authority violation (GREEN)

**Recovery boundary:** `f7d2adc` preserved the Task 1 RED commit and exact usage-limit resume point.

## Files Created/Modified

- `test/helpers/brownfield-fixture.ts` — deterministic Git/planning fixture, offline integration adapters, lifecycle driver, and root-bounded cleanup.
- `test/brownfield-gsd-cycle.test.ts` — five-element lifecycle, Hermes prohibition, tamper rollback, and writer-lock exclusion tests.
- `scripts/run-brownfield-proof.mjs` — standalone auditor reproduction of the same compiled lifecycle driver.
- `src/core/worker-authority.ts` — verified planning rollback and mutation-first error classification for failing workers.

## Decisions Made

- Context7 and Unified Memory are represented by locked, schema-valid offline observations and command results. This proves alpha-AOS routing and invariants without claiming a live paid invocation.
- Pack synchronization uses the current reviewed-plan APIs and explicit verified source bytes. The fixture never reads or alters a user's global ECC installation.
- A planning mutation is the governing failure when a worker also throws: the original action error remains in the diagnostic message, but callers always receive the authority error code needed to halt the lifecycle.
- Project cleanup first uses the public project uninstall planner/apply path, then removes only empty, root-contained owned directories; any remaining file is a refusal rather than something recursively erased.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Aligned stale plan API names with current repository contracts**
- **Found during:** Task 1 recovery audit
- **Issue:** The plan named `createProjectPlan`, `recordHandoff`/`consumeHandoff`, and `uninstallProjectPack`, which are not current exports.
- **Fix:** Used `planProjectCapabilities`, `memoryHandoff`/`memorySearch`, and sandboxed project uninstall plus owned empty-directory cleanup.
- **Files modified:** `test/helpers/brownfield-fixture.ts`
- **Verification:** Focused lifecycle and standalone auditor both pass.
- **Committed in:** `0b251a0`

**2. [Rule 3 - Blocking] Seeded the complete inherited web-pack skill closure**
- **Found during:** Task 1 focused GREEN run
- **Issue:** Selecting `WEB_REACT` also selects `WEB_BASE`; the offline verified source initially omitted `accessibility` and `browser-qa`, so materialization correctly refused source drift.
- **Fix:** Added explicit offline bytes for both inherited skills and rebound their hashes only in the fixture copy of the stable lock.
- **Files modified:** `test/helpers/brownfield-fixture.ts`
- **Verification:** Brownfield project-pack materialization writes 12 projections and the full lifecycle passes.
- **Committed in:** `0b251a0`

**3. [Rule 1 - Portability] Used directory-specific cleanup on Windows and refused residual owned files**
- **Found during:** Task 1 focused GREEN run
- **Issue:** `rm()` without recursive mode cannot remove empty directories on Windows, and the public project uninstall leaves empty owned directory shells after removing their files.
- **Fix:** Used `rmdir()` for verified-empty directories and added a root-bounded recursive empty-directory sweep that throws if any file remains.
- **Files modified:** `test/helpers/brownfield-fixture.ts`
- **Verification:** Focused suite and standalone runner both restore the project baseline with `.alpha-aos` absent.
- **Committed in:** `0b251a0`

---

**Total deviations:** 3 auto-fixed (1 portability bug, 2 blocking contract/fixture alignments).
**Impact on plan:** All changes were required for deterministic, cross-platform execution and remained inside plan-owned files.

## Issues Encountered

- Execution resumed after a prior usage-limit interruption. The recovery commit preserved the exact RED boundary and uncommitted GREEN files, so no completed work was recreated.
- The complete suite is substantially slower than the validation document's historical estimate on this host because packed lifecycle and mutation-preview tests run real isolated subprocess flows; it completed successfully without retries.

## Verification

- `npm run check` — passed.
- `npm run build` — passed (114 inputs, 222 outputs).
- `node scripts/run-tests.mjs --files dist/test/brownfield-gsd-cycle.test.js` — 5 passed, 0 failed.
- `node scripts/run-tests.mjs --files dist/test/brownfield-gsd-cycle.test.js dist/test/worker-authority.test.js` — 12 passed, 0 failed.
- `node scripts/run-brownfield-proof.mjs` — all five lifecycle steps passed; before/after planning digests were identical.
- `npm test` — 884 tests: 875 passed, 0 failed, 9 platform-gated skips, 0 todo.
- `npm run build:check` — passed (114 inputs, 222 outputs).

## Authentication Gates

None.

## Known Stubs

None. Empty collections and null checks in the fixture represent explicit absence or accumulation states; all rendered proof data is wired to deterministic sources.

## User Setup Required

None - no credentials, network services, paid canaries, or external capability calls are required.

## Next Phase Readiness

- Plan 07-04 can consume REL-04 as fully automated release evidence and proceed to provenance, release notes, smoke testing, and preview-first publishing.
- No plan-owned blockers remain. The nine full-suite skips are pre-existing platform/privilege gates and did not affect REL-04 coverage.

## Self-Check: PASSED

- All four declared implementation artifacts and this summary exist.
- Task 1 RED/GREEN, Task 2 RED/GREEN, and recovery commits resolve in Git.
- `git diff --check` reports no whitespace errors in the summary.

---
*Phase: 07-cross-platform-release-proof*
*Completed: 2026-09-20*
