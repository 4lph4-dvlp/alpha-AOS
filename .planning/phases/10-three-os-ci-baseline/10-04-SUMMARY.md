---
phase: 10-three-os-ci-baseline
plan: 04
subsystem: ci
tags: [ci, github-actions, cross-platform, proof-run, gh-cli]

requires:
  - phase: 10-three-os-ci-baseline
    provides: "10-01 CI-01 host-native fixtures and path-literal guard; 10-03 CI-02 test-owned state roots"
provides:
  - "Push-triggered main CI run 35818198049 attempt 1 on 35d4c15: ubuntu, macos, windows legs and the package job all success"
  - ".planning/phases/10-three-os-ci-baseline/CI_RUN.md, the CI-03 proof record built from gh output"
  - "CI-02 debug record marked resolved with a Resolution section citing CI_RUN.md"
affects: [10-VERIFICATION, phase-11-LIFE-03, phase-11-LIFE-04]

actuals:
  tokens: 4100
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "CI proof records are generated from captured gh run view / gh api JSON and job logs, and are pinned to a run id and attempt rather than to the current origin/main head"

key-files:
  created:
    - .planning/phases/10-three-os-ci-baseline/CI_RUN.md
  modified:
    - .planning/debug/ci02-windows-alpha-aos-host-leak.md

key-decisions:
  - "CI-03 proof is run 35818198049 attempt 1 (push, main, 35d4c15); green on the first attempt, so D-13 re-run was not used"
  - "Task 1 has no repository commit; its artifact is the fast-forward push c6415a2..35d4c15 and the captured gh output"

requirements-completed: [CI-03]

coverage:
  - id: D1
    description: "One push-triggered main run green on all three OS legs and the package job in a single attempt"
    requirement: CI-03
    verification:
      - kind: other
        ref: "gh run view 35818198049 --json event,conclusion,jobs -> push success success,success,success"
        status: pass
      - kind: other
        ref: "gh api repos/4lph4-dvlp/alpha-AOS/actions/runs/35818198049/attempts/1 -> run_attempt 1, run_started_at 2026-09-23T04:24:21Z, all job startedAt after it"
        status: pass
    human_judgment: false
  - id: D2
    description: "CI-01 and CI-02 fixes observed on CI legs of the same attempt"
    requirement: CI-03
    verification:
      - kind: other
        ref: "job logs 107044319989 / 107044319988: destinationFor resolves destinations across all five harnesses ok"
        status: pass
      - kind: other
        ref: "job logs (all three legs): no test under test/ asserts against a platform-specific absolute path literal ok"
        status: pass
      - kind: other
        ref: "job log 107044319963: packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle ok"
        status: pass
    human_judgment: false
  - id: D3
    description: "CI_RUN.md and resolved debug record published to origin/main by a docs-only fast-forward push, still pinned to the proof run"
    requirement: CI-03
    verification:
      - kind: other
        ref: "Task 2 verify 1-3 (run id from CI_RUN.md re-read via gh; debug record resolved; origin/main == main == 7df2327, recorded run headSha != origin/main)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-09-23
status: complete
---

# Phase 10 Plan 04: Three-OS CI Proof Run Summary

**Push-triggered `main` run 35818198049, attempt 1, on 35d4c15 is green on ubuntu-latest, macos-latest, windows-latest and the Linux package job with no re-run. It is recorded in CI_RUN.md from `gh` output, and the CI-02 debug record is closed with it.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-09-23T04:22:45Z
- **Completed:** 2026-09-23T04:35:44Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Proof Run

| Field | Value |
|---|---|
| Run ID | `35818198049` |
| Attempt | `1` (`run_started_at` 2026-09-23T04:24:21Z) |
| Event / branch | `push` / `main` |
| Head SHA | `35d4c1579102fd9effd2ad7bf0f4d438db7865ba` |
| Conclusion | `success` |

| Job | Job ID | Conclusion | `npm test` counts | `Safety boundary suites` counts |
|---|---|---|---|---|
| Authoritative Release Package (Linux) | 107044198034 | success | n/a | n/a |
| ubuntu-latest / Node 24 | 107044319989 | success | 919 / pass 914 / fail 0 / skipped 5 | 177 / pass 175 / fail 0 / skipped 2 |
| macos-latest / Node 24 | 107044319988 | success | 919 / pass 913 / fail 0 / skipped 6 | 177 / pass 175 / fail 0 / skipped 2 |
| windows-latest / Node 24 | 107044319963 | success | 919 / pass 911 / fail 0 / skipped 8 | 177 / pass 172 / fail 0 / skipped 5 |

**D-13 re-run:** none. The run was green on attempt 1. No `gh run rerun` of any form was issued.

## Accomplishments

- Preflight passed before the push: clean tracked tree, ci.yml identical to c6415a2, `npm run check`, `npm run build` and `npm run build:check` passed, and the scratch-home quick run passed (36/36 across the path-literal-guard, owned-skills, ecc-skills, gate-engine and gate-lifecycle files, then 4/4 on the state-root and host-drift pattern in mcp-proxy and tarball-fixture), with 0 entries left in the scratch home.
- Published local main to origin with a plain fast-forward (`c6415a2..35d4c15  main -> main`) and drove its push-triggered run to a green first attempt.
- CI observations in that attempt: `destinationFor resolves destinations across all five harnesses` passes on ubuntu and macOS (CI-01). The path-literal guard passes on all three legs. The packed lifecycle passes on windows (82.4 s) in the same `npm test` step as cold context7, exa and firecrawl startups (37.0 s, 58.9 s, 70.4 s), under the unchanged host oracle (CI-02).
- Wrote CI_RUN.md with its six sections from the captured `gh run view --attempt 1`, `gh api .../attempts/1` and per-job logs. Set the CI-02 debug record to `status: resolved` with a `## Resolution` section, and published both files with a docs-only fast-forward push (`35d4c15..7df2327`).

## Preflight POSIX Check

The 10-01 line reads `POSIX observation: WSL red-to-green`. WSL was available (`wsl.exe -e node --version` returned v26.8.2). The plan's WSL command against the freshly built dist passed:

```
✔ global ECC roots preserve native roots and share Agent Skills between Codex and Pi (3.671058ms)
✔ destinationFor resolves destinations across all five harnesses (2.55788ms)
ℹ tests 2
ℹ pass 2
ℹ fail 0
✔ no test under test/ asserts against a platform-specific absolute path literal (1914.343474ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
```

The proof run's ubuntu and macOS legs are the authoritative Node 24 POSIX observation; WSL ran Node 26.8.2.

## Docs-Only Record Push (not the proof run)

The record commit `7df2327` (`docs(10-04): record three-OS proof run`) triggered push run `35818948517`. It was `in_progress` when last checked, and waiting for it was not required. **This run is not the proof run.** CI_RUN.md stays pinned to run 35818198049 attempt 1, and this run's outcome neither closes nor reopens CI-03.

## Task Commits

1. **Task 1 (tracer): publish Phase 10 commits and drive the green run.** No repository commit. The artifact is the fast-forward push of 35d4c15 plus the gh captures in the session scratchpad. Tracer gate: automated verify re-run printed `push success success,success,success`.
2. **Task 2: record the proof and close CI-02.** `7df2327` (docs), pushed to origin/main.

**Plan metadata:** the final docs commit for this plan

## Files Created/Modified

- `.planning/phases/10-three-os-ci-baseline/CI_RUN.md`: the CI-03 proof record (Run Metadata with Attempt, Matrix Jobs, Phase 10 Observations, Single-Run Integrity, Phase 10 Commits Contained, Conclusion)
- `.planning/debug/ci02-windows-alpha-aos-host-leak.md`: `status: resolved`, plus a `## Resolution` section citing run 35818198049 attempt 1, head SHA and CI_RUN.md

## Decisions Made

- Accepted run 35818198049 attempt 1 as the CI-03 proof. It was green on the first attempt, so none of the D-13 or A-10-04-3 re-run handling came into play.
- The CI_RUN.md reduced JSON block was generated by a `node` filter over the saved `gh run view` JSON rather than hand-copied, per D-14.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. GitHub annotations noted that `actions/upload-artifact@v4` and `actions/download-artifact@v4` target the deprecated Node 20 runtime and that `ubuntu-latest` will move to Ubuntu 26 from October 19, 2026. Both are informational, and ci.yml was deliberately left unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase complete (4/4 plans). The phase verifier writes 10-VERIFICATION.md. It must cite `.planning/phases/10-three-os-ci-baseline/CI_RUN.md` as the CI-03 evidence (D-14) and `.planning/debug/ci02-windows-alpha-aos-host-leak.md` as the CI-02 root-cause record.
- Re-check the proof through the run id in CI_RUN.md (`gh run view 35818198049 --attempt 1 ...`), not through the current origin/main head, which is now the docs commit 7df2327.

## Self-Check: PASSED

- FOUND: .planning/phases/10-three-os-ci-baseline/CI_RUN.md, .planning/debug/ci02-windows-alpha-aos-host-leak.md
- FOUND commit: 7df2327; proof SHA 35d4c15 on origin/main history
- Task 1 verify (both), Task 2 verify (all three) exit 0

---
*Phase: 10-three-os-ci-baseline*
*Completed: 2026-09-23*
