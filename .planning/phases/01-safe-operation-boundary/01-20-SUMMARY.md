---
phase: 01-safe-operation-boundary
plan: 20
subsystem: infra
tags: [process-boundary, environment-allowlist, cross-platform, darwin, coreFoundation, tdd]

requires:
  - phase: 01-safe-operation-boundary
    provides: "PLATFORM_FLOOR_ENVIRONMENT and the runtime exact-match assertion `the declared platform floor must match what the OS actually delivers` (01-08)"
provides:
  - "`platformFloorEnvironment(platform)` — the platform environment floor as a pure function of the platform name, assertable for every branch from any host"
  - "A darwin floor branch declaring `__CF_USER_TEXT_ENCODING`, closing the macos-latest failure in CI run 33937610401"
  - "A doc comment that records the darwin entry as user-identifying (its first field is the caller's numeric UID), extending the honesty already recorded for Windows"
affects: [01-23 three-OS CI matrix, phase-05 project-only isolation, diagnostics redaction]

actuals:
  tokens: 1217
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Platform-conditional declarations are pure functions of the platform name, not `process.platform` constant initializers, so every branch is testable off-host"

key-files:
  created: []
  modified:
    - src/core/process.ts
    - test/process.test.ts

key-decisions:
  - "The floor became a pure function of the platform argument rather than gaining a second `process.platform` branch, because a constant initializer keyed on the running host makes a macOS-only regression unobservable until a macOS host runs it"
  - "The darwin branch names exactly one variable. The runtime assertion is an exact `deepEqual`, so a speculative second name would turn the macOS leg red the same way the missing name did"
  - "`__CF_USER_TEXT_ENCODING` stays in the floor and was not added to `NODE_RUNTIME_ENVIRONMENT_NAMES` or `UPSTREAM_ENVIRONMENT_NAMES`; laundering an OS-injected name into a per-child allowlist would make it read as operation-approved and collapse the distinction the boundary exists to state"

patterns-established:
  - "Off-host branch coverage: when a declaration is platform-conditional, expose it as `f(platform)` and assert each branch literally, keeping the runtime observation test as the separate authority for whether the declaration is true"
  - "A floor entry that is user-identifying is documented as such at the declaration site, next to the names it joins"

requirements-completed: [SAFE-06]

coverage:
  - id: D1
    description: "The darwin platform floor declares `__CF_USER_TEXT_ENCODING`, the name CoreFoundation hands every child regardless of the environment block supplied"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#the platform floor is declared per platform rather than only for the running one"
        status: pass
    human_judgment: false
  - id: D2
    description: "`PLATFORM_FLOOR_ENVIRONMENT` keeps its name, `readonly string[]` type and current-platform value while being defined as `platformFloorEnvironment(process.platform)`; all five consumers compile untouched"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/process.test.ts#the platform floor is declared per platform rather than only for the running one"
        status: pass
      - kind: integration
        ref: "node --test dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js dist/test/install.test.js (tests 24, fail 0)"
        status: pass
      - kind: other
        ref: "npm run check (tsc --noEmit, exit 0)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No platform-injected name was laundered into a per-child allowlist to silence the failure"
    requirement: SAFE-06
    verification:
      - kind: other
        ref: "git grep -c '__CF_USER_TEXT_ENCODING' -- src/core/install.ts src/core/mcp-proxy.ts (no match)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The declared darwin floor is *complete* — `__CF_USER_TEXT_ENCODING` is the only name macOS injects, so the runtime exact-match assertion passes on a macOS host"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#the platform environment floor is declared rather than discovered at runtime (macos-latest CI leg)"
        status: unknown
    human_judgment: true
    rationale: "Only a macOS host can answer whether the declaration matches what the OS delivers. This host is win32; the local suite exercises the darwin branch's *content* but not the OS observation. Authoritative verification is the green three-OS matrix owned by plan 01-23. If the macOS leg reports a second injected name, the floor is extended to match observation — the test is right and the declaration follows it."
  - id: D5
    description: "The darwin entry is documented as user-identifying, extending to macOS the honesty already recorded for `USERNAME`, `USERPROFILE` and `HOMEPATH` on Windows"
    requirement: SAFE-06
    verification:
      - kind: other
        ref: "src/core/process.ts doc comment above platformFloorEnvironment — states the value's first field is the caller's numeric UID"
        status: pass
    human_judgment: true
    rationale: "The grep-able fact is present, but whether the wording is adequate input for Phase 5's project-only isolation reasoning is a human read, not an assertion."

duration: 7 min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 20: Darwin Platform Environment Floor Summary

**The platform environment floor became a pure function of the platform name with a darwin branch declaring `__CF_USER_TEXT_ENCODING`, so the macOS-only boundary failure from CI run 33937610401 is now assertable — and fixed — from a Windows host.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-05T16:39:47Z
- **Completed:** 2026-09-05T16:46:20Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- Added `export function platformFloorEnvironment(platform: NodeJS.Platform): readonly string[]` to `src/core/process.ts`, replacing the `process.platform === "win32"` constant initializer. Every branch — win32, darwin, and the empty default — is now callable with an explicit platform name from any host.
- Declared the darwin branch as exactly `["__CF_USER_TEXT_ENCODING"]`, the single name macos-latest reported in CI run 33937610401 as `undeclared names crossed the process/protocol boundary`.
- Kept `PLATFORM_FLOOR_ENVIRONMENT` byte-compatible for its five consumers (`src/core/install.ts`, `src/core/mcp-proxy.ts`, `test/process.test.ts`, `test/protocol-session.test.ts`, `test/mcp-proxy.test.ts`, plus the `src/cli.ts` comment) by defining it as `platformFloorEnvironment(process.platform)`.
- Added a host-independent test that pins all three branches literally and ties the exported constant to the function that defines it, so the constant cannot drift into a second declaration.
- Restructured the doc comment to state the general rule first (names the OS hands a child regardless of the parent's environment block) and then the per-platform facts, recording that `__CF_USER_TEXT_ENCODING` carries the caller's numeric UID and is therefore the same class of user-identifying exposure as `USERNAME`, `USERPROFILE` and `HOMEPATH`.

## Task Commits

Each task was committed atomically:

1. **Task 1: 어느 호스트에서도 도는 플랫폼별 floor 단언** — `733ea62` (test — RED)
2. **Task 2: floor 를 플랫폼 인자를 받는 순수 함수로 만들고 darwin 분기를 선언한다** — `9f2c812` (fix — GREEN)

No REFACTOR commit: the GREEN implementation is a `switch` over three branches with no cleanup left to do.

## Files Created/Modified

- `src/core/process.ts` — `platformFloorEnvironment(platform)` replaces the conditional constant initializer; darwin branch added; `PLATFORM_FLOOR_ENVIRONMENT` retained as its application to `process.platform`; doc comment restructured and extended with the macOS UID-exposure note.
- `test/process.test.ts` — imports `platformFloorEnvironment` and adds `the platform floor is declared per platform rather than only for the running one`, asserting the darwin name, the eleven win32 names literally, the empty linux floor, and constant-to-function agreement.

## Decisions Made

- **A pure function, not a second `process.platform` ternary branch.** The plan's stated reason held up in execution: the RED for a darwin-only bug has to be observable on a developer host, and a constant keyed on the running platform cannot provide one. Making the platform an argument moved the declaration itself under test while leaving the runtime observation test as the separate authority for whether the declaration is *true*.
- **Exactly one darwin name.** The runtime assertion is an exact `deepEqual`, so an over-declared floor is as wrong as an under-declared one. No speculative additions were made; if the macOS leg reports a second name, the floor follows the observation.
- **The name stays in the floor, not in an allowlist.** Adding `__CF_USER_TEXT_ENCODING` to `NODE_RUNTIME_ENVIRONMENT_NAMES` or `UPSTREAM_ENVIRONMENT_NAMES` would have silenced the failure while making an OS-injected name read as operation-approved. A negative grep guards this.

## Verification Results

| Check | Result |
|---|---|
| `npm run check` (RED, before Task 2) | Fails: `test/process.test.ts(19,3): error TS2724: '"../src/core/process.js"' has no exported member named 'platformFloorEnvironment'` — recorded in the RED commit body |
| RED commit scope | `git diff --name-only HEAD~1 HEAD` = `test/process.test.ts` exactly; 44 insertions, 0 deletions (the existing runtime test is byte-identical) |
| `npm run check` (after Task 2) | Exit 0, no output |
| `npm run build` | Succeeds — build artifact manifest written (55 inputs, 104 outputs) |
| `node --test dist/test/process.test.js` | tests 20, pass 20, **fail 0**; the new test name appears in the passing output |
| `node --test dist/test/protocol-session.test.js dist/test/mcp-proxy.test.js dist/test/install.test.js` | tests 24, pass 24, **fail 0** |
| `npm test` | tests **196**, pass 194, **fail 0**, skipped 2 (pre-existing platform skips). Baseline from `01-19-SUMMARY.md` was 195, so the suite grew by exactly the one test this plan added |
| `git grep -c '__CF_USER_TEXT_ENCODING' -- src/core/install.ts src/core/mcp-proxy.ts` | No match — the name lives in the floor, not in a per-child allowlist |

**Local green is necessary but not sufficient.** Whether `__CF_USER_TEXT_ENCODING` is the *complete* darwin floor is answered only by `the declared platform floor must match what the OS actually delivers` on the macos-latest leg. That observation is owned by plan `01-23`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. One mechanical note: the `sed` insertion of the new test initially collapsed the blank line separating it from the preceding test and left a doubled blank line after it; both were corrected before the RED commit, and the committed diff is purely additive.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap `G-01-1` root cause **RC-2** is closed at the declaration level. The remaining half of `G-01-1` — proving the declaration against a real macOS host — is plan `01-23`'s green three-OS matrix, which now has a floor that should let macos-latest pass rather than fail on a single name.
- `UAT missing[4]` (the floor test running on every CI leg) needs no work here: `dist/test/process.test.js` is already named in the `Safety boundary suites` CI step and covered by `npm test` on every leg. This plan additionally removes the dependency on an actually-running macOS leg for branch coverage, so the same class of gap cannot re-hide behind an unrun leg.
- No consumer changes were needed and none are pending. Plan `01-21` starts from a tree where `npm run check`, `npm run build` and `npm test` are all green.
- Suite baseline for the next plan: **196 tests, fail 0, 2 skipped** (not 195).

## Self-Check: PASSED

- `src/core/process.ts` — FOUND
- `test/process.test.ts` — FOUND
- Commit `733ea62` — FOUND
- Commit `9f2c812` — FOUND
- No stubs, TODOs or skipped tests introduced by this plan.
- No new threat surface beyond the `<threat_model>` register: the change narrows an information-disclosure gap (T-01-20-01) and adds no endpoint, auth path or schema.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*
