---
phase: 01-safe-operation-boundary
plan: 16
subsystem: infra
tags: [wrappers, build-artifact, provenance, ci, three-os]

requires:
  - phase: 01-14
    provides: "createBootstrapOperationPlan and applyBootstrapOperation"
  - phase: 01-15
    provides: "The preview-first bootstrap CLI route and the single output seam"
provides:
  - "scripts/build-artifact.mjs write|check: a build that names its own inputs and outputs"
  - "Four thin wrappers that verify an artifact and delegate; none runs git, npm, build or link"
  - "A structural prohibition test and native wrapper behaviour on every OS"
affects: []

actuals:
  tokens: 26000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A wrapper has one prerequisite and one delegation, and no fallback between them"
    - "A build records the sources it was produced from, so provenance is checkable rather than assumed"

key-files:
  created:
    - scripts/build-artifact.mjs
  modified:
    - scripts/install.sh
    - scripts/install.ps1
    - scripts/update.sh
    - scripts/update.ps1
    - package.json
    - src/cli.ts
    - test/preview.test.ts
    - .github/workflows/ci.yml

key-decisions:
  - "npm run build ends by writing the manifest, so an artifact and its provenance record are never out of step"
  - "A wrapper exits 3 on an unmet prerequisite and never rebuilds: building is a mutation and mutations belong to the reviewed operation"
  - "The wrapper prohibition is a source-level scan, so a future fallback is caught structurally rather than by review"
  - "The PowerShell startup cache is excluded from the home digest by exact path, and ancestor directory names with it, so the assertion still covers everything else"

patterns-established:
  - "A digest-based safety assertion excludes an interpreter footprint by path, never by widening the ignore set"

requirements-completed: [SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05, SAFE-06]

coverage:
  - id: D1
    description: "No wrapper contains a direct git, npm, build or link command, or a fallback that would run one"
    requirement: SAFE-01
    verification:
      - kind: unit
        ref: "test/preview.test.ts#no wrapper contains a direct mutation command or a fallback that would run one"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each wrapper family previews without changing the checkout, package sentinel, home, harness roots or state root"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/preview.test.ts#install and update wrappers preview without mutating either shell family"
        status: pass
    human_judgment: false
  - id: D3
    description: "A wrapper refuses without a verified artifact and delegates with one, changing nothing either way"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/preview.test.ts#a wrapper refuses without a verified build artifact and delegates with one"
        status: pass
    human_judgment: false
  - id: D4
    description: "The build artifact manifest binds the exact sources a build consumed and the files it produced"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "npm run build:check"
        status: pass
      - kind: integration
        ref: "test/install.test.ts#a missing or stale build artifact blocks the bootstrap without touching anything"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every Phase 1 safety suite runs on Windows, macOS and Linux, and an unavailable launcher is recorded as not-run"
    requirement: SAFE-01
    verification: []
    human_judgment: true
    rationale: "The workflow names each suite explicitly and preview.test.ts records not-run entries rather than passes. Verified locally on Windows with all four wrapper families executed and an empty not-run list; the macOS and Linux legs are asserted by the workflow definition and confirmed only when CI runs."

duration: 55min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 16: Thin wrappers and the three-OS behavioural gate

**All four wrappers are launchers now: one artifact check, one delegation, and no path between them that runs `git`, `npm`, a build or a link. The Wave 0 SAFE-01 tracer is green, and the suite has no failures left.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 1 · **modified:** 8

## Accomplishments

- **`scripts/build-artifact.mjs` gives a build a provenance record.** `write` hashes every source the build consumed (`src/`, `test/`, `tsconfig.json`, `package.json`, `package-lock.json`) and every file it emitted, into a sorted, POSIX-keyed document that is identical on every OS. `check` recompares and exits 3 with a bounded list of what moved. `npm run build` ends with `write`, so an artifact and the record describing it are never out of step.
- **The wrappers stopped installing.** `install.sh`, `install.ps1`, `update.sh` and `update.ps1` verify Node, verify the artifact, and hand the whole operation to `alpha-aos bootstrap install|update`. They preserve `--target`, `--skip-link` and `--apply` and do nothing else. The dirty-checkout check, the remote resolution, the fast-forward, `npm ci`, the build, the link and the managed reconcile all now happen inside the reviewed plan and the single session that 01-14 built — the wrapper cannot reach them first because it no longer knows how.
- **A missing artifact is a refusal, not a rebuild.** Every wrapper exits 3 with a stable message. There is no fallback branch, because building is a mutation and mutations belong to the reviewed operation. That is exactly the shape the Wave 0 test was written to demand: the previous wrappers ran `npm ci && npm run build && npm link` before printing anything, which is why the tracer had been red since the phase began.
- **The prohibition is structural.** A source-level scan over all four wrappers fails on `npm ci`, `npm install`, `npm run build`, `npm link`, `git pull`, `git fetch` or `git merge`, and requires each one to contain both the artifact check and the bootstrap delegation. A future fallback is caught by the suite rather than by review.
- **Native behaviour, not syntax.** `preview.test.ts` now runs all four families on the host, refusing with no artifact and delegating with one, and asserts the package sentinel, home surface, harness roots, checkout and state root are byte-identical either way. Where a launcher is unavailable it records a not-run entry, which the suite prints — an unavailable host is never counted as a pass.
- **CI runs the boundary, per OS.** The workflow now runs `npm run check`, the full suite, `npm run build:check`, and then names each Phase 1 safety suite explicitly, so a suite that silently stops running is a failure rather than an omission nobody notices.

## Verification

`npm test` → 176 tests, 174 pass, 0 fail, 2 skipped, 0 todo.

The 2 skipped are the privileged Windows reparse fixtures documented in `01-VALIDATION.md` as manual-only. **The suite has no failing test and no todo for the first time in this phase.**

## Issues Encountered

**PowerShell writes into the home surface before the script it was given runs.** With the wrapper fixed, the wrapper test failed on a home-digest change that turned out to be `AppData/Local/Microsoft/PowerShell/StartupProfileData-NonInteractive`, created by `pwsh` itself at startup.

The fix excludes that subtree by exact path rather than widening the ignore set by name — and excludes the *entry lines* of the directories that exist only to contain it, while still descending into them. Anything a wrapper writes beside that cache is still recorded, so the assertion keeps its coverage instead of trading it for a green result.

## Deviations from Plan

- **`src/cli.ts` changed although it is not in this plan's file list.** The `bootstrap` route needed to accept `--target` so the wrappers could preserve the argument the plan requires them to preserve. It is four lines, and the route itself is 01-15's.
- **The CI wrapper steps validate syntax rather than re-running a filtered suite.** The plan describes a name-pattern-filtered run per OS; `preview.test.js` already runs natively in the safety-boundary step above it, so a second filtered run of the same file would double a two-minute step to prove the same thing.

## Open Gaps

- **The macOS and Linux legs are asserted, not observed.** Everything here was verified on Windows, where all four wrapper families executed with an empty not-run list. The other two legs run the same suites by workflow definition and are only confirmed when CI runs.
- **`openProtocolProcess` remains unbuilt.** Carried from 01-08, 01-11 and 01-14: the MCP fixture's JSON-RPC child is a long-lived bidirectional session the one-shot adapter cannot express. It stays a named, asserted exception in `test/process.test.ts`, and no plan in this phase owns it.
- **No end-to-end managed install test.** Carried from 01-14: running one would install GSD and ECC globally on the test machine. Every callee is separately proven session-aware and the aggregate is structurally verified; a container-backed integration test is the right home for the rest.

## Next Phase Readiness

Phase 1 is complete. Every mutating surface previews without changing a byte, every write is proof-bound, serialized and journaled, every observable surface redacts, and the wrapper scripts can no longer reach around any of it. The three open gaps above are recorded in `STATE.md` and belong to later phases or to a container-backed integration suite, not to this one.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
