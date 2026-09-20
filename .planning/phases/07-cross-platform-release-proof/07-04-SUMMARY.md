---
phase: 07-cross-platform-release-proof
plan: 04
subsystem: release-engineering
tags: [provenance, sha256, npm, smoke-test, release-gate, supply-chain]

# Dependency graph
requires:
  - phase: 07-cross-platform-release-proof
    provides: "Plans 01-03 authoritative tarball, support claims, release controls, and brownfield lifecycle proof"
  - phase: 01-safe-operation-boundary
    provides: "Bounded shell-free process execution, redacted excerpts, and cross-platform environment contracts"
provides:
  - "Cryptographic release bundle verification for the archive, build manifest, and frozen stable lock"
  - "v0.1.0 release notes that separate active targets, compatibility residue, and platform limits"
  - "Isolated local and registry smoke-test modes plus an explicit-publish, preview-first release orchestrator"
affects: [release, npm-publish, provenance, support-documentation, phase-07]

tech-stack:
  added: []
  patterns:
    - "Machine-readable child output requests an explicit bounded excerpt budget instead of parsing a human diagnostic excerpt"
    - "Release verification runs from a disposable tracked-file Git snapshot with isolated npm, state, harness, home, and artifact roots"
    - "Publication is unreachable without an explicit --publish flag and a clean main checkout"

key-files:
  created:
    - scripts/verify-provenance.mjs
    - test/provenance.test.ts
    - CHANGELOG.md
    - docs/RELEASE_NOTES_v0.1.0.md
    - scripts/smoke-test.mjs
    - scripts/release.mjs
  modified:
    - src/cli.ts
    - test/process.test.ts

key-decisions:
  - "Bind one provenance bundle to the tarball SHA-256, the archived build-artifact manifest, and the archived stable-lock bytes"
  - "Run release gates in an off-tree local main repository so repository-sensitive tests remain meaningful without mutating the source checkout"
  - "Keep the dirty-tree bypass test-only and structurally incompatible with --publish"
  - "Treat public-registry Stage 2 as a post-publication manual gate; do not publish or query the registry during plan execution"

patterns-established:
  - "A release preview uses the same check, build, complete test, archive audit, pack, provenance, and Stage 1 smoke gates as publication"
  - "Long structured subprocess responses opt into a larger redacted excerpt and assert the response was retained before parsing"

requirements-completed: [REL-05, REL-06]

coverage:
  - id: D1
    description: "A release bundle fails closed unless the tarball hash, internal build outputs, and frozen stable lock all match"
    requirement: "REL-06"
    verification:
      - kind: unit
        ref: "test/provenance.test.ts#valid provenance verifies the archive, build outputs, and frozen stable lock"
        status: pass
      - kind: unit
        ref: "test/provenance.test.ts#archive, build-output, and stack-lock tamper rejection cases"
        status: pass
    human_judgment: false
  - id: D2
    description: "Release documentation states active harnesses, Claude residue, Windows environment floors, and deferred sealed mode"
    requirement: "REL-06"
    verification:
      - kind: unit
        ref: "test/provenance.test.ts#release documentation separates target scope from receipt-backed proof status"
        status: pass
    human_judgment: false
  - id: D3
    description: "The preview-first release workflow passes the complete non-publish gate and an isolated installed tarball reports version, status, and doctor successfully"
    requirement: "REL-06"
    verification:
      - kind: e2e
        ref: "ALPHA_AOS_RELEASE_TESTING=1 node scripts/release.mjs --allow-dirty-test-only"
        status: pass
      - kind: integration
        ref: "node scripts/smoke-test.mjs --local"
        status: pass
    human_judgment: false
  - id: D4
    description: "The same isolated smoke checks are available for alpha-aos@0.1.0 after public publication"
    requirement: "REL-06"
    verification: []
    human_judgment: true
    rationale: "The user explicitly prohibited npm publish and public-registry Stage 2 during this execution; run the registry smoke only after an authorized publication."

# Metrics
duration: 1h 15m active across recovery sessions
completed: 2026-09-20
status: complete
---

# Phase 07 Plan 04: Release Provenance and Preview-First Publication Summary

**A hash-bound provenance bundle, explicit release scope documentation, isolated installed-artifact smoke tests, and a non-publishing full release preview now guard the v0.1.0 publication path.**

## Performance

- **Duration:** 1h 15m active across recovery sessions
- **Started:** 2026-09-20T08:47:14+09:00
- **Completed:** 2026-09-20T13:42:14+09:00
- **Tasks:** 2
- **Files modified:** 8 implementation, documentation, and test files

## Accomplishments

- Added a pure-Node provenance tool that creates and verifies the archive digest, archived build-output hashes, and exact stable-lock bytes, failing closed on corruption or drift.
- Published v0.1.0 changelog and release notes that distinguish Codex, Antigravity, Pi, and Hermes targets from Claude Code residue and disclose Windows environment floors plus deferred v2 sealed isolation.
- Added disposable-prefix smoke verification for installed `--version`, `status`, and `doctor`, with every mutable root redirected and removed afterward.
- Added a clean-main, preview-first release orchestrator whose non-publish path passed the complete gate and produced artifact SHA-256 `e20a8d18788548fd1c98110e1ef1dfc24b1b47a99fc98296642e19ef71cc5400`.

## Task Commits

1. **Task 1: Cryptographic provenance and release documentation**
   - `3edd5fa` — failing provenance, tamper, lock, and documentation tests (RED)
   - `c242333` — provenance bundle implementation and v0.1.0 documentation (GREEN)
2. **Task 2: Isolated smoke testing and guarded release flow**
   - `b2237eb` — failing smoke and release-safety tests (RED)
   - `318f2c8` — failing installed-version assertion (RED)
   - `bbeed83` — isolated smoke runner, preview-first orchestrator, and canonical `--version` (GREEN)
3. **Recovery and inline correctness repairs**
   - `0890575` — preserved the first usage-limit recovery boundary
   - `e44acf6` — initialized the off-tree release snapshot as a local main repository
   - `3869ece` — retained complete bounded evidence for process-test JSON parsing

**Plan metadata:** committed separately with this summary and sequential GSD tracking updates.

## Files Created/Modified

- `scripts/verify-provenance.mjs` — creates and validates the three-record SHA-256 release provenance bundle.
- `test/provenance.test.ts` — covers valid provenance, archive/build/lock tampering, release documentation, smoke cleanup, release-mode safety, and installed version output.
- `CHANGELOG.md` — v0.1.0 release history and support/limitation boundaries.
- `docs/RELEASE_NOTES_v0.1.0.md` — public release scope, compatibility residue, verification, and known limitations.
- `scripts/smoke-test.mjs` — disposable local-tarball and public-registry installed-CLI smoke modes.
- `scripts/release.mjs` — clean-main release gates, isolated staging snapshot, explicit publish branch, and bounded failure diagnostics.
- `src/cli.ts` — canonical package `--version` output used by installed-artifact verification.
- `test/process.test.ts` — deterministic structured-output regression above the 4 KiB diagnostic excerpt budget.

## Decisions Made

- Provenance includes three independently verified records: the packed tarball, `dist/build-artifact.json`, and `catalog/stack.lock.json`. A valid outer hash cannot hide internal build or lock drift.
- The release workflow copies tracked working-tree bytes into a disposable checkout, links only the existing dependency tree, creates a local `main` snapshot, and runs every gate there. Generated release artifacts never dirty the source checkout.
- The test-only dirty-tree option requires `ALPHA_AOS_RELEASE_TESTING=1` and cannot coexist with `--publish`; production publication still requires a clean real `main` checkout.
- Structured child output must declare its parse budget. The default 4 KiB excerpt remains appropriate for human diagnostics and was not weakened globally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added canonical installed version output**
- **Found during:** Task 2 installed-artifact smoke verification
- **Issue:** The planned smoke gate required `alpha-aos --version`, but the CLI did not expose the package version.
- **Fix:** Added `--version` and `-v` handling at the CLI boundary and an installed-version regression assertion.
- **Files modified:** `src/cli.ts`, `test/provenance.test.ts`
- **Verification:** Provenance/release suite and installed Stage 1 smoke passed.
- **Committed in:** `318f2c8`, `bbeed83`

**2. [Rule 3 - Blocking] Initialized the release staging copy as a real Git repository**
- **Found during:** Task 2 explicit non-publish preview
- **Issue:** Repository-sensitive tests correctly failed because the copied staging tree had no `.git` metadata.
- **Fix:** Created a local `main` repository with a fixed non-user identity and one snapshot commit before running gates; bounded failing test titles are retained in release errors.
- **Files modified:** `scripts/release.mjs`
- **Verification:** Focused release suite passed 10/10 and the complete non-publish preview passed.
- **Committed in:** `e44acf6`

**3. [Rule 1 - Test Bug] Stopped parsing a deliberately truncated diagnostic excerpt as complete JSON**
- **Found during:** Task 2 recovered preview gate
- **Issue:** npm extended the Windows `PATH` by 548 characters in the off-tree checkout. Two process tests parsed the default 4096-byte evidence excerpt and failed with `Unterminated string in JSON at position 4096` even though the child process succeeded.
- **Fix:** Requested a 64 KiB bounded excerpt for the two machine-readable assertions, required `capped: false` before parsing, and added a deterministic 5 KiB approved-value regression.
- **Files modified:** `test/process.test.ts`
- **Verification:** Direct focused tests passed 2/2; the exact staged npm process suite passed 21/21; the complete preview then passed.
- **Committed in:** `3869ece`

---

**Total deviations:** 3 auto-fixed (1 missing critical interface, 1 blocking staging defect, 1 test bug).
**Impact on plan:** All repairs were required to exercise the planned release gates honestly. No gate was skipped, filtered, weakened, or replaced.

## Issues Encountered

- Execution crossed a usage-limit recovery boundary after the first staged preview diagnosis. Commit `0890575` and `07-04-RECOVERY.md` preserved the exact completed commits and remaining repair.
- The first staged preview lacked Git metadata; after that repair, its full suite exposed the pre-existing parse-budget defect above. The second recovery captured the complete assertion in an off-tree reproducer before applying the focused test fix.
- Public publication and registry Stage 2 were deliberately not attempted. No npm registry mutation occurred.

## Verification

- `npm run check` — passed.
- `npm run build` — passed (115 inputs, 224 outputs).
- `node scripts/run-tests.mjs --files dist/test/provenance.test.js` — 10 passed, 0 failed.
- Direct implicated process tests — 2 passed, 0 failed.
- Off-tree npm process suite — 21 passed, 0 failed under the long lifecycle `PATH`.
- Changed explicit non-publish preview — passed; embedded complete suite 894 tests, 885 passed, 0 failed, 9 platform-gated skips; audit, pack, provenance, and Stage 1 smoke all passed.
- `npm run build:check` — passed (115 inputs, 224 outputs).
- `git diff --check` — passed.

## Authentication Gates

None.

## Known Stubs

None. Empty values and null branches in the changed scripts represent explicit absence/error states; all release-preview and Stage 1 outputs are wired to real packed-artifact execution.

## User Setup Required

After an separately authorized `npm publish` of `alpha-aos@0.1.0`, run `node scripts/smoke-test.mjs --registry alpha-aos@0.1.0` before declaring the public release complete. This post-publication gate was intentionally not run here.

## Next Phase Readiness

- Plan 07-04 implementation and non-publish verification are complete; REL-05 and REL-06 tracking can advance.
- Phase-level verification can consume the 894-test green preview as the required full-suite and regression evidence without rerunning it.
- Public release declaration still requires an authorized publish followed by the documented Stage 2 registry smoke test.

## Self-Check: PASSED

- All eight declared implementation/documentation artifacts and this summary exist.
- All RED/GREEN, recovery, staging-fix, and parse-budget commits resolve in Git.
- Summary frontmatter records `status: complete`; no goal-blocking stubs remain.

---
*Phase: 07-cross-platform-release-proof*
*Completed: 2026-09-20*
