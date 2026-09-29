---
phase: 11-managed-lifecycle-verification
plan: 01
subsystem: testing
tags: [verification, packed-cli, sandbox, host-guard, evidence, node-test, gh-cli]

requires:
  - phase: 10-three-os-ci-baseline
    provides: host-immutability oracle in test/tarball-fixture.test.ts, CI run 35818198049 (3-OS green at 35d4c15)
provides:
  - test/helpers/packed-sandbox.ts shared by the CI packed lifecycle test and every Phase 11 probe
  - probe-lib.mjs transcript vocabulary, path aliasing, twelve-name sandbox containment, host guard (exit 3)
  - LIFE-01 Codex reconcile tracer transcript (5 HOLDS, 3 OBSERVED) cited from 06-VERIFICATION.md
  - five-harness seeding self-check transcript
  - Phase 6 suites local transcript (33/33) and per-OS CI log corroboration for run 35818198049
  - 06-VERIFICATION.md skeleton with LIFE-01 Codex clause rows
affects: [11-02, 11-03, 11-04, 11-05, 11-06, 11-07]

actuals:
  tokens: 56500
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Evidence transcripts: header/step/CHECK/footer vocabulary written only through probe-lib.mjs"
    - "Probes import the compiled test helper dist/test/helpers/packed-sandbox.js; one fingerprint implementation for CI and evidence"
    - "Host guard around every probe; containment assertion before every packed-CLI spawn"

key-files:
  created:
    - test/helpers/packed-sandbox.ts
    - .planning/phases/11-managed-lifecycle-verification/evidence/README.md
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/probe-lib.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-reconcile.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/seed-selfcheck.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/suites-and-ci.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life01-codex-reconcile.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/seed-selfcheck.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/suites-local.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/ci-35818198049-lifelines.txt
    - .planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md
  modified:
    - test/tarball-fixture.test.ts

key-decisions:
  - "LIFE-01 'the plan' is `alpha-aos install` without --apply (stateful, prints CURRENT); static `alpha-aos plan` recorded as OBSERVED, and no README/docs line directs users to it, so no gap candidate"
  - "The install recipe moved fully into the helper: every recipe assertion (tarball audit, cli.js present, no candidate lock in tarball or install, channel stable, three ECC target hashes) survives there, so the lifecycle test calls packRelease/installPackedRelease/seedHarnessPrerequisites"
  - "Second-apply sandbox byte-identity assertion committed, because the tracer recorded life01.codex.second-apply-byte-identical HOLDS"
  - "suites.supporting counts explicit skips as non-failures: 3 opt-in live Codex canaries are skipped by design, so HOLDS requires fail 0 and tests = pass + skipped + todo with the skipped titles named"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "Packed sandbox helper shared by tarball-fixture and the probes"
    requirement: LIFE-09
    verification:
      - kind: integration
        ref: "test/tarball-fixture.test.ts#packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (scratch-home run)"
        status: pass
      - kind: other
        ref: "npm run check"
        status: pass
    human_judgment: false
  - id: D2
    description: "LIFE-01 Codex reconcile tracer transcript, reproducible CHECK lines"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-reconcile.mjs (+ --out re-run, CHECK diff empty)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Strengthened packed lifecycle oracle (dry-run CURRENT, dry-run and second-apply sandbox byte identity) with the Phase 10 host oracle unchanged"
    requirement: LIFE-09
    verification:
      - kind: integration
        ref: "node scripts/run-tests.mjs --files dist/test/tarball-fixture.test.js dist/test/path-literal-guard.test.js (scratch home)"
        status: pass
      - kind: other
        ref: "hostMutationTargets diff gate vs 35d4c15"
        status: pass
    human_judgment: false
  - id: D4
    description: "Five-harness seeding self-check"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/seed-selfcheck.mjs"
        status: pass
    human_judgment: false
  - id: D5
    description: "Phase 6 suites local transcript and CI run 35818198049 per-OS corroboration"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/suites-and-ci.mjs"
        status: pass
    human_judgment: false
  - id: D6
    description: "06-VERIFICATION.md skeleton with LIFE-01 Codex rows"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "grep gates: 8 LIFE matrix rows, transcript and check id cited, Re-run index heading"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-23
status: complete
---

# Phase 11 Plan 01: Evidence Harness and LIFE-01 Codex Tracer Summary

**Packed-release sandbox helper plus a transcript/host-guard probe library, proven on LIFE-01: a Codex second reconcile through the packed CLI prints only CURRENT, is a no-op, and changes no sandbox byte. The same plan re-ran the Phase 6 suites (33/33) and pulled per-OS CI evidence for run 35818198049.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-23T11:45:28Z
- **Completed:** 2026-09-23T12:10:29Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- `test/helpers/packed-sandbox.ts` exports the sandbox (`openSandbox`, `createIsolatedSandbox`), the release recipe (`hostNpmCache`, `packRelease`, `installPackedRelease`), five-harness `harnessPaths` and `seedHarnessPrerequisites`, and the fingerprint/drift helpers. Importing the compiled helper registers no test.
- `probe-lib.mjs` implements the transcript vocabulary in `evidence/README.md`: path aliasing (plain, JSON-escaped, forward-slash, MSYS forms), the twelve-name containment assertion before every packed-CLI spawn, a 17-target host guard, `--out`, `--out-dir` and `--keep`, and `ALPHA_AOS_P11_TARBALL`.
- The LIFE-01 tracer ran twice. The second run went to a scratch `--out`, and its CHECK lines matched the committed transcript exactly (the diff was empty).
- The CI packed lifecycle test now guards the dry-run CURRENT promise and sandbox byte identity. The Phase 10 host oracle is byte-identical to 35d4c15.
- `06-VERIFICATION.md` exists at the archived Phase 6 path. It has the full section list, the eight-row verdict matrix, and the LIFE-01 Codex clause rows.

### LIFE-01 check outcomes (`evidence/life01-codex-reconcile.txt`)

| Check | Outcome | Detail |
|---|---|---|
| life01.codex.initial-apply | OBSERVED | exit 0; applied policy:codex-execution, owned-skill:alpha-aos-control:codex; 2 journaled operations; external none |
| life01.codex.preview-current | HOLDS | 6 step lines, all CURRENT |
| life01.codex.preview-no-mutation | HOLDS | home/state/prefix digests equal across the dry-run |
| life01.codex.preview-json-current | HOLDS | 6 steps, all `current` |
| life01.codex.second-apply-noop | HOLDS | applied 0, operationIds 0, current 6/6, journal names unchanged |
| life01.codex.second-apply-byte-identical | HOLDS | digests after the second apply equal those after the initial apply |
| life01.plan-command-static | OBSERVED | `alpha-aos plan` shows no CURRENT line, and `plan --json` has no `current` value |
| life01.plan-command-docs | OBSERVED | none (no README.md/docs line contains `alpha-aos plan`) |

The second-apply byte-identity assertion **was committed** to `test/tarball-fixture.test.ts`, alongside the dry-run CURRENT and dry-run no-mutation assertions.

### Seed self-check preview table (`evidence/seed-selfcheck.txt`)

The seeding checks passed for all five harnesses: gsd, ecc and mcp for each harness, plus `seed.pi.bridge`. That is 15 HOLDS, and hermes gsd is OBSERVED because hermes gets no GSD. No harness reaches an all-`current` preview from seeding alone. The only non-current steps are alpha-AOS-owned file steps that `--apply` itself creates. Every external step is current (GSD, ECC runtime, Pi bridge), and so are all ECC skill and MCP steps.

| Harness | Non-current steps (dry-run) | Current steps |
|---|---|---|
| claude | owned-skill:alpha-aos-ship:claude, owned-skill:alpha-aos-control:claude, policy:claude-ecc (create) | gsd:claude, ecc:runtime, ecc:claude, mcp:claude |
| codex | policy:codex-execution, owned-skill:alpha-aos-control:codex (create) | gsd:codex, ecc:runtime, ecc:codex, mcp:codex |
| antigravity | owned-skill:alpha-aos-control:antigravity (create) | gsd:antigravity, ecc:runtime, ecc:antigravity, mcp:antigravity |
| pi | owned-skill:alpha-aos-control:pi (create) | gsd:pi, ecc:runtime, ecc:pi, mcp-bridge:pi, mcp:pi |
| hermes | owned-skill:alpha-aos-control:hermes (create) | ecc:runtime, ecc:hermes, mcp:hermes |

### CI title results (`evidence/ci-35818198049-lifelines.txt`)

| Job | Phase 6 titles | Packed lifecycle |
|---|---|---|
| ubuntu-latest 107044319989 | HOLDS, 33/33 | HOLDS |
| macos-latest 107044319988 | HOLDS, 33/33 | HOLDS |
| windows-latest 107044319963 | HOLDS, 33/33 | HOLDS |

`ci.run` HOLDS (push, success, head 35d4c15, attempt 1). `ci.staleness` HOLDS: src, scripts, catalog, the package files and all 12 cited suites are byte-identical between 35d4c15 and HEAD. No per-OS result needs flagging for plan 11-07. Locally, `suites.phase6` HOLDS (33/33), `suites.supporting` HOLDS (164 pass, 3 opt-in canary skips, 0 fail) and `suites.scratch-home-clean` HOLDS.

## Task Commits

1. **Task 1: Tracer (helper, probe library, LIFE-01 probe, transcript, report rows)**: `83a3053` (test)
2. **Task 2: Shared helpers in tarball-fixture, strengthened LIFE-01 oracle, seed self-check**: `84bce0a` (test)
3. **Task 3: Phase 6 suites locally and CI run 35818198049 per-OS lines**: `3e8f438` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## Files Created/Modified

- `test/helpers/packed-sandbox.ts`: packed sandbox, release recipe, harness seeding, fingerprint and drift helpers
- `test/tarball-fixture.test.ts`: imports the helpers; new dry-run CURRENT and sandbox byte-identity assertions
- `evidence/README.md`: layout, transcript vocabulary, safety rules, re-run recipe, findings template
- `evidence/probes/probe-lib.mjs`: transcript writer, aliasing, containment, host guard, `packOnce`, `runProbe`
- `evidence/probes/life01-reconcile.mjs`, `seed-selfcheck.mjs`, `suites-and-ci.mjs`: the three probes
- `evidence/life01-codex-reconcile.txt`, `seed-selfcheck.txt`, `suites-local.txt`, `ci-35818198049-lifelines.txt`: transcripts
- `.planning/milestones/v0.1.0-phases/06-managed-lifecycle-uninstall-and-recovery/06-VERIFICATION.md`: report skeleton

## Decisions Made

See `key-decisions` in the frontmatter. Research open question 1 is resolved as planned. The docs scan found no line that directs users to `alpha-aos plan`, so no gap candidate is raised for the static plan command.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `suites.supporting` rule adjusted for explicit skips**
- **Found during:** Task 3
- **Issue:** The plan's literal rule ("fail 0 and tests equals pass") would record VIOLATED for the supporting suites. `canary.test.ts` has three opt-in live Codex canaries that are skipped by design (the same skips seen in CI), so the run has tests 167 and pass 164 with 0 failures.
- **Fix:** HOLDS now requires exit 0, fail 0, and tests = pass + skipped + todo. The CHECK detail names every skipped title. When nothing is skipped, the check is still the strict tests = pass rule.
- **Files modified:** `evidence/probes/suites-and-ci.mjs`
- **Verification:** `CHECK suites.supporting HOLDS exit=0; tests=167 pass=164 fail=0 skipped=3 ...` names the three `opt-in live Codex` canaries
- **Committed in:** `3e8f438`

**2. [Rule 3 - Blocking] `--out-dir` added to probe-lib**
- **Found during:** Task 3
- **Issue:** `suites-and-ci.mjs` writes two transcripts, so a single `--out` cannot redirect both for a D-17 re-run.
- **Fix:** `--out-dir <dir>` writes each transcript under its committed file name. `suites-and-ci.mjs` refuses `--out`. The option is documented in `evidence/README.md`.
- **Files modified:** `evidence/probes/probe-lib.mjs`, `evidence/README.md`
- **Committed in:** `3e8f438`

**3. [Rule 2 - Missing critical] Tarball audit folded into `installPackedRelease`**
- **Found during:** Task 1
- **Issue:** The interfaces block gave `installPackedRelease` only the lock-channel and candidate-lock assertions. Moving the recipe out of the lifecycle test would have dropped the tarball allowlist audit and the `dist/src/cli.js` presence check.
- **Fix:** The helper runs the audit before installing, so every recipe assertion survives the move (Task 2 step 2 condition).
- **Files modified:** `test/helpers/packed-sandbox.ts`
- **Committed in:** `83a3053`

Additive API beyond the interfaces block, for wave-2 probes that must not modify the library: `harnessPaths` takes an optional lock argument (default: the repository stable lock) to name the Pi bridge manifest; probe-lib additionally exports `runCommand`, `runProbe`, `newScratch`, `registerAlias`, `alias`, `stripAnsi`, `evidencePath`, `repositoryRoot`, `probeArgs` and re-exports the helper functions.

---

**Total deviations:** 3 auto-fixed (1 bug, 1 blocking, 1 missing critical)
**Impact on plan:** All three keep the evidence honest and re-runnable. No scope creep, and `src/` is untouched.

## TDD Gate Compliance

Task 2 is `tdd="true"`, but it strengthens an oracle for behavior that the Task 1 tracer had already observed as HOLDS. D-12 allows committing only passing assertions, so no RED commit could exist. The new assertions went straight to green in `84bce0a`. Their failure path is the same `describeHostDrift` metadata output that the unchanged drift tests cover.

## Issues Encountered

None. The host guard reported `unchanged (17 targets)` on all four transcripts, and no transcript contains the unaliased home path.

## Known Stubs

- `06-VERIFICATION.md`: every section except the LIFE-01 Codex rows reads `TO-BE-COMPILED` by design, and plan 11-07 compiles them. This is recorded in `.planning/WINDOWS.md` as a phase 11 stub.

## Verification (plan level)

- `npm run check`: pass
- Scratch-home `tarball-fixture` + `path-literal-guard`: 16/16 pass, no `.alpha-aos` in the scratch home
- Four transcripts end with `RESULT:`; none contains `HOST-DRIFT`
- Host-safe full suite with `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1` (capability-oracle excluded): tests 888, pass 879, fail 0, skipped 9, scratch home clean
- `git status --porcelain -- src` is empty; `git diff --quiet 35d4c15 HEAD -- src` exits 0

## User Setup Required

None: no external service configuration required.

## Next Phase Readiness

The wave-2 plans (11-02..11-06) can reuse `probe-lib.mjs` and `packed-sandbox.ts` as-is. Seeding reaches current state for every external and MCP/ECC step on all five harnesses. The new tarball-fixture oracle gets POSIX corroboration only from the next `main` CI run.

---
*Phase: 11-managed-lifecycle-verification*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 11 created files and 1 modified file exist; commits 83a3053, 84bce0a, 3e8f438 and dd54d88 are in history; all four transcripts end with a RESULT line and carry no HOST-DRIFT marker.
