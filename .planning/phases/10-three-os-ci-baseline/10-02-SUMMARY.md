---
phase: 10-three-os-ci-baseline
plan: 02
subsystem: testing
tags: [ci, windows, host-immutability-oracle, node-test, test-isolation, diagnostics]

requires:
  - phase: 07-cross-platform-release-proof
    provides: packed release lifecycle fixture and hostSnapshot oracle in test/tarball-fixture.test.ts
provides:
  - Per-entry host drift report (D-05) in the packed-lifecycle oracle message, metadata only, bounded to 50 entries
  - ENOENT-tolerant manifest walk that records vanished entries and keeps the oracle red
  - CI-02 root-cause record classifying the windows ~/.alpha-aos change as a test-isolation leak, with writer chain and evidence
  - Three-class root-cause wording in REQUIREMENTS.md CI-02 and ROADMAP Phase 10 success criterion 3
affects: [10-03, 10-04, phase-11-LIFE-03, phase-11-LIFE-04]

actuals:
  tokens: 6550
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Oracle diagnostics are report-only: the aggregate digest byte stream and the deepEqual operands stay unchanged while a parallel manifest feeds the failure message"
    - "Host drift report prints relative path, kind, size and a 12-hex hash prefix only; content is hashed and discarded"

key-files:
  created:
    - .planning/debug/ci02-windows-alpha-aos-host-leak.md
  modified:
    - test/tarball-fixture.test.ts
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md

key-decisions:
  - "CI-02 classified as a test-isolation leak (D-01 class 3): pair repro reproduced the windows signature on the first run, and the fixture alone wrote nothing; D-02 governs the fix in 10-03 and the D-03 src/ audit is not triggered"
  - "D-06 CI evidence branch not needed: local reproduction succeeded on run 1 of 3"
  - "No bisect: the windows onset is at c6415a2, outside 638d3cc..f1ca570, and the failure is timing-dependent; the onset table is recorded instead"
  - "Drift report interleaves each target header with its own entries (global 50-entry budget) so entry lines from different targets are never ambiguous"

patterns-established:
  - "Snapshot-oracle diagnostics: snapshotTargets(targets, manifests) returns the verdict map and fills an optional manifest map for the message"

requirements-completed: [CI-02]

coverage:
  - id: D1
    description: "Per-entry host drift report in the packed-lifecycle oracle message, with the verdict operands unchanged"
    requirement: CI-02
    verification:
      - kind: unit
        ref: "test/tarball-fixture.test.ts#host fingerprint keeps the aggregate digest byte stream"
        status: pass
      - kind: unit
        ref: "test/tarball-fixture.test.ts#host drift report names changed entries by metadata and never by content"
        status: pass
      - kind: unit
        ref: "test/tarball-fixture.test.ts#host drift report bounds its listing and keeps per-target totals"
        status: pass
      - kind: other
        ref: "diff of the hostMutationTargets block against c6415a2 (empty, 10 lines) and grep of the deepEqual line (count 1)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI-02 root cause reproduced on a redirected home and recorded as a test-isolation leak in .planning/debug/ci02-windows-alpha-aos-host-leak.md"
    requirement: CI-02
    verification:
      - kind: integration
        ref: "node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js (scratch home): tests 46, pass 45, fail 1, drift names only .alpha-aos/mcp-cache/npm-cache entries"
        status: pass
      - kind: integration
        ref: "node --test dist/test/tarball-fixture.test.js (scratch home control): pass 10, fail 0, no .alpha-aos created"
        status: pass
      - kind: other
        ref: "Task 2 grep gates on the debug record"
        status: pass
    human_judgment: true
    rationale: "The classification is an evidence-based judgment; a verifier should confirm the record's reasoning against D-01"
  - id: D3
    description: "Three-class wording in REQUIREMENTS.md CI-02 and ROADMAP Phase 10 success criterion 3"
    requirement: CI-02
    verification:
      - kind: other
        ref: "grep gates: CI-02 contains 'test-isolation leak'; Phase 10 section contains 'a test-oracle defect, or a test-isolation leak'"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 02: CI-02 Diagnosis and Per-Entry Host Drift Report Summary

**The packed-lifecycle host oracle now reports each changed entry by path, kind, size and 12-hex hash prefix (never content). A scratch-home pair reproduction pinned the windows `~/.alpha-aos` change to `mcp-proxy.test.ts` npx downloads into `mcp-cache/npm-cache`, which is a test-isolation leak.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-22T23:38:50Z
- **Completed:** 2026-09-22T23:47:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- `fingerprintManifest`, `snapshotTargets`, `hostSnapshot(manifests)`, `describeHostDrift`, `vanishedEntryCount`, `HOST_DRIFT_LISTING_LIMIT` (50) and `HOST_DRIFT_HASH_PREFIX` (12) are in `test/tarball-fixture.test.ts`. The aggregate digest byte stream is unchanged, `hostMutationTargets` is byte-identical to c6415a2, and the lifecycle assertion reads `assert.deepEqual(afterHost, beforeHost, describeHostDrift(beforeManifests, afterManifests));`.
- ENOENT during the walk records a `vanished` entry, which feeds `vanished:REL` into the digest and fails a new `vanishedEntryCount` assertion. Every other errno rethrows.
- Pair reproduction command: `env -u ALPHA_AOS_STATE_DIR -u CODEX_HOME -u CLAUDE_CONFIG_DIR -u HERMES_HOME -u PI_CODING_AGENT_DIR -u ANTIGRAVITY_CONFIG_DIR HOME="$WH" USERPROFILE="$WH" ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1 node --test --test-concurrency=2 dist/test/mcp-proxy.test.js dist/test/tarball-fixture.test.js`. It reproduced on the first run. TAP: `tests 46 / pass 45 / fail 1`, and the only failure was the packed lifecycle. Drift header: `.alpha-aos: 6b9fc8df91ac -> 10ccaadd2d61 (added 20447, removed 0, changed 0, vanished 0)`. All 20,447 added entries are under `mcp-cache/npm-cache/` (`_npx` 18,116, `_cacache` 2,330, plus the `_update-notifier-last-checked` file). The other seven targets stayed `absent`.
- Control run (fixture alone, fresh scratch home): `tests 10 / pass 10 / fail 0`, and no `.alpha-aos` was created.
- Classification: **test-isolation leak** (D-01 class 3). This is recorded with the writer chain, evidence, onset table and follow-ups in `.planning/debug/ci02-windows-alpha-aos-host-leak.md`.
- D-06 fallback was **not needed**. No evidence branch was pushed and no workflow was dispatched.

## Task Commits

1. **Task 1: Tracer, per-entry host fingerprint manifest wired into the lifecycle assertion message**
   - RED `bbfcc4d` (test): three unit tests; `npm run check` failed on the missing symbols
   - GREEN `8d681ce` (feat): implementation; 3/3 pass
2. **Task 2: Reproduce, classify, debug record, three-class wording** - `5248432` (docs)

**Plan metadata:** recorded in the final docs commit for this plan

## Files Created/Modified

- `test/tarball-fixture.test.ts`: manifest fingerprint, drift report, vanished handling, three unit tests, and a new lifecycle assertion message
- `.planning/debug/ci02-windows-alpha-aos-host-leak.md`: CI-02 root-cause record (Classification, Writer, Evidence, Onset, Regression RED observations (D-08), Follow-ups)
- `.planning/REQUIREMENTS.md`: CI-02 now names three root-cause classes
- `.planning/ROADMAP.md`: Phase 10 success criterion 3 now names three root-cause classes

## Decisions Made

- The classification is a test-isolation leak, so D-02 applies to 10-03 (fix the leaking tests; leave the oracle as it is) and the D-03 audit is not triggered.
- No bisect was run. The onset table and timing evidence are recorded instead.
- The drift report prints each drifting target's header right before that target's entries. The entry line format is the one the plan specifies, and the listing uses one 50-entry budget across all targets. The plan put all headers first. Grouping each header with its entries keeps entry lines from different targets unambiguous. Every must-have still holds: target order then code-unit path order, 50-entry bound, and per-target totals.

## Deviations from Plan

None. The plan ran as written, apart from the output-layout interpretation described under Decisions Made.

## Issues Encountered

None. The pair reproduction failed as expected on the first attempt, and the control run passed.

## Safety Notes

- Every reproduction and control run used a fresh `mktemp -d` scratch home under the session scratchpad, with `ALPHA_AOS_STATE_DIR` and the harness root variables unset. The developer's real `~/.alpha-aos` was not read, modified or deleted.
- The drift report and the debug record contain metadata only. The content-sentinel unit test proves the report never includes file bytes.
- No CI artifact upload was added, and no evidence branch was created.

## TDD Gate Compliance

RED `test(10-02)` bbfcc4d, then GREEN `feat(10-02)` 8d681ce. No refactor commit was needed.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- 10-03 can fix the three leaking test files (`mcp-proxy`, `gate-engine`, `gate-lifecycle`) under D-02. It should record each RED observation in the debug record's `## Regression RED observations (D-08)` section.
- A future red windows leg will print the per-entry drift report in its log.

---
*Phase: 10-three-os-ci-baseline*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: test/tarball-fixture.test.ts, .planning/debug/ci02-windows-alpha-aos-host-leak.md
- FOUND commits: bbfcc4d, 8d681ce, 5248432
