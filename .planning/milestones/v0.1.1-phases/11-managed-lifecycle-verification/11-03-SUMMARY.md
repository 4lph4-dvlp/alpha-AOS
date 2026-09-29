---
phase: 11-managed-lifecycle-verification
plan: 03
subsystem: testing
tags: [verification, packed-cli, sandbox, fingerprint, LIFE-01, LIFE-08, phase-13-gating]

requires:
  - phase: 11-managed-lifecycle-verification
    provides: "plan 11-01 packed-sandbox helper, probe-lib transcript vocabulary, host guard, LIFE-01 codex tracer"
provides:
  - "evidence/life01-harnesses-reconcile.txt: LIFE-01 packed reconcile for claude, antigravity, pi, hermes, all five, plus narrowing diagnostics"
  - "evidence/life08-preview.txt: byte-fingerprint no-mutation evidence for seven update preview surfaces"
  - "evidence/life08-apply.txt: candidate-ignored and stable-reconcile evidence for update --apply"
  - "evidence/LIFE-01-findings.md (PARTIAL, gap candidate LIFE-01/C1, blocks Phase 13: yes)"
  - "evidence/LIFE-08-findings.md (provisional VERIFIED, contingent LIFE-08/C1, blocks Phase 13: no)"
  - "packed lifecycle test assertion: update --apply must ignore an unreviewed candidate lock"
affects: [11-07, 13]

actuals:
  tokens: 71000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Fixture checkout for bootstrap/update-script probes: bare mirror as origin, clone as checkout, own npm ci + npm run build, all inside the sandbox"
    - "No-alpha-AOS control run to attribute a strict byte drift to the host shell runtime without excluding the root"

key-files:
  created:
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-harnesses.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-preview.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-apply.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life01-harnesses-reconcile.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life08-preview.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life08-apply.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-01-findings.md
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-08-findings.md
  modified:
    - test/tarball-fixture.test.ts

key-decisions:
  - "LIFE-01 provisional PARTIAL with gap candidate LIFE-01/C1: a combined install of codex and pi refuses with plan-drift because both render alpha-aos-control into ~/.agents/skills; LIFE-01 blocks Phase 13: yes"
  - "LIFE-08 provisional VERIFIED: the only strict preview violation is the PowerShell engine cache that pwsh writes under LOCALAPPDATA, which a no-alpha-AOS control reproduces; a contingent LIFE-08/C1 is listed for 11-07 to decide; LIFE-08 blocks Phase 13: no"
  - "The claude GSD seed is completed with gsd-core/workflows/ship.md from the locked GSD package, because the alpha-aos-ship owned skill requires it as upstreamWorkflow; this is a seeding precondition, not a gap"
  - "The fixture checkout builds its own dist, because the host working tree has CRLF bytes for LF-indexed files and a copied dist manifest does not verify"
  - "The candidate-ignored update --apply assertion was committed to the packed lifecycle test, because life08.apply.candidate-ignored and life08.apply.byte-identical both recorded HOLDS"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "LIFE-01 five-harness packed reconcile evidence and findings with Phase 13 gating line"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life01-harnesses.mjs (6 checks per group for claude, antigravity, pi, hermes, all; host guard unchanged)"
        status: pass
      - kind: other
        ref: "LIFE-01-findings.md grep gates (verdict heading, gating line, codex citation, synthetic-plan note)"
        status: pass
    human_judgment: false
  - id: D2
    description: "LIFE-08 preview no-mutation fingerprints on seven surfaces"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life08-preview.mjs (seven no-mutation checks present, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "LIFE-08 apply evidence and CI guard for the candidate-ignored property"
    requirement: LIFE-09
    verification:
      - kind: integration
        ref: "test/tarball-fixture.test.ts#packed release completes the isolated install, reconcile, diagnose, and uninstall lifecycle (scratch-home run, 16/16)"
        status: pass
      - kind: other
        ref: "hostMutationTargets diff gate vs 35d4c15; host deepEqual line count 1"
        status: pass
    human_judgment: false
  - id: D4
    description: "Attribution of the update.ps1 byte drift to the PowerShell engine cache (not a LIFE-08 mutation class)"
    requirement: LIFE-09
    human_judgment: true
    rationale: "Whether the PowerShell startup cache counts as 'configuration' under LIFE-08 is a judgment for plan 11-07; the evidence (drift-scope and pwsh-control checks) is recorded"

duration: 4h27m
completed: 2026-09-23
status: complete
---

# Phase 11 Plan 03: LIFE-01 and LIFE-08 Phase 13 Gating Evidence Summary

**The packed CLI reconciles the stable lock idempotently for each of the five harnesses. A second plan is CURRENT, and a second apply is a byte-identical no-op. However, a combined codex+pi install refuses with plan-drift (LIFE-01/C1), so LIFE-01 blocks Phase 13. All seven update preview surfaces leave the checkout, package, global link, configuration and state byte-identical, apart from the PowerShell engine's own cache. `update --apply` ignores an unreviewed candidate lock and restores managed files from the stable lock.**

## Performance

- **Duration:** about 4h27m wall time. This includes a rate-limit pause and several 8-minute five-harness probe runs.
- **Started:** 2026-09-23T15:09:26Z
- **Completed:** 2026-09-23T19:36:02Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

### LIFE-01 five-harness table (`evidence/life01-harnesses-reconcile.txt`; codex from `life01-codex-reconcile.txt`)

| Group | initial-apply | preview-current | preview-no-mutation | preview-json-current | second-apply-noop | second-apply-byte-identical |
|---|---|---|---|---|---|---|
| codex (11-01) | OBSERVED (applied 2) | HOLDS | HOLDS | HOLDS | HOLDS | HOLDS |
| claude | OBSERVED (applied 3) | HOLDS (7 steps) | HOLDS | HOLDS | HOLDS | HOLDS |
| antigravity | OBSERVED (applied 1) | HOLDS (5) | HOLDS | HOLDS | HOLDS | HOLDS |
| pi | OBSERVED (applied 1) | HOLDS (6) | HOLDS | HOLDS | HOLDS | HOLDS |
| hermes | OBSERVED (applied 1) | HOLDS (4) | HOLDS | HOLDS | HOLDS | HOLDS |
| all five | **VIOLATED** (plan-drift) | NOT-OBSERVED | NOT-OBSERVED | NOT-OBSERVED | NOT-OBSERVED | NOT-OBSERVED |

Diagnostics that narrow the five-target failure:

- `all-retry`: the same refusal on retry.
- `all-failure.owned-skills`: the failed apply rolled back all 5 journals, and every owned skill is back to `create`.
- `codex-pi`: codex and pi alone reproduce the refusal.
- `claude-antigravity-hermes`: a combined three-target install with no shared destination succeeds, followed by 5 HOLDS.
- `codex-then-pi`: installed one at a time, the combined plan is all current and the combined apply is a no-op.

### LIFE-08 preview no-mutation outcomes (`evidence/life08-preview.txt`)

| Check | Outcome |
|---|---|
| life08.preview.update-default.no-mutation | HOLDS |
| life08.preview.update-check.no-mutation | HOLDS |
| life08.preview.update-stage.no-mutation | HOLDS |
| life08.preview.bootstrap-update.no-mutation | HOLDS (exit 2: JSON envelope over the byte budget, nothing printed) |
| life08.preview.bootstrap-update-human.no-mutation | HOLDS |
| life08.preview.update-sh.no-mutation | HOLDS |
| life08.preview.update-ps1.no-mutation | VIOLATED: only `<sandbox>/home/AppData/Local/Microsoft/PowerShell/*` drifted (`drift-scope`); a pwsh control with no alpha-AOS code writes the same file |

Supporting checks: `checkout-artifact` HOLDS (verified build), `update-check.result` OBSERVED (candidate gsd 1.14.0, ecc 2.2.1, context7 4.1.1, exa 3.4.1, firecrawl 3.25.4, pi bridge 2.37.0), `bootstrap-update.plan` OBSERVED (git-merge-ff-only, npm-ci, npm-build, npm-link planned, not blocked), `update-ps1-rerun.no-mutation` VIOLATED (the pwsh cache is rewritten).

### LIFE-08 apply outcomes (`evidence/life08-apply.txt`)

| Check | Outcome |
|---|---|
| life08.apply.candidate-ignored | HOLDS |
| life08.apply.no-new-journal | HOLDS |
| life08.apply.byte-identical | HOLDS |
| life08.apply.message | HOLDS |
| life08.apply.reconciles-stable | HOLDS |
| life08.apply.reconcile-idempotent | HOLDS |

### Phase 13 gating

- `LIFE-01 blocks Phase 13: yes` (LIFE-01/C1)
- `LIFE-08 blocks Phase 13: no`

**The lifecycle assertion was committed.** `test/tarball-fixture.test.ts` now carries the `update --apply must ignore an unreviewed candidate lock` block between the reconcile assertions and `status`. The Phase 10 `hostMutationTargets` block is byte-identical to 35d4c15, and the final host `deepEqual` line appears exactly once.

## Task Commits

1. **Task 1: LIFE-01 packed reconcile for claude, antigravity, pi, hermes and all five**: `0b69ed2` (test)
2. **Task 2: LIFE-08 update preview non-mutation on six surfaces**: `48b68df` (test)
3. **Task 3: LIFE-08 update apply, findings, pass-only lifecycle assertion**: `2630db6` (test)

**Plan metadata:** the docs commit that adds this SUMMARY

## Files Created/Modified

- `evidence/probes/life01-harnesses.mjs`: per-harness and combined reconcile probe, with the claude ship-workflow seed and the narrowing diagnostics
- `evidence/probes/life08-preview.mjs`: scenario A packed update surfaces; scenario B fixture checkout runner (sandbox env asserted, `--apply`/`-Apply` refused), pwsh control
- `evidence/probes/life08-apply.mjs`: bogus candidate lock in the sandbox package, stable reconcile of a removed managed file
- `evidence/life01-harnesses-reconcile.txt`, `life08-preview.txt`, `life08-apply.txt`: transcripts
- `evidence/LIFE-01-findings.md`, `evidence/LIFE-08-findings.md`: clause tables, oracle audits, verdicts, Phase 13 gating
- `test/tarball-fixture.test.ts`: candidate-ignored `update --apply` assertion

## Decisions Made

See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Claude GSD seed completed with the ship workflow**
- **Found during:** Task 1
- **Issue:** The first run failed `life01.claude.initial-apply` with `Required GSD workflow is missing: ...\.claude\gsd-core\workflows\ship.md`. `seedHarnessPrerequisites` writes only GSD version files, but the `alpha-aos-ship` owned skill requires `gsd-core/workflows/ship.md` (`upstreamWorkflow`). A real GSD install provides that file, so recording this as VIOLATED would have been a false gap.
- **Fix:** The probe installs the locked `@opengsd/gsd-core@1.12.0` into `<sandbox>/temp` from the host npm cache and copies the workflow file into the sandbox claude root. The step and a note are recorded in the transcript, and `LIFE-01-findings.md` states the precondition. `packed-sandbox.ts` and `probe-lib.mjs` are untouched.
- **Files modified:** `evidence/probes/life01-harnesses.mjs`
- **Committed in:** `0b69ed2`

**2. [Rule 2 - Missing critical] Diagnostics that narrow the five-target failure**
- **Found during:** Task 1
- **Issue:** `life01.all.initial-apply` was VIOLATED by a product `plan-drift` refusal. The plan's six `all` checks alone could not show the cause, so they could not serve as a D-06 reproduction.
- **Fix:** The six `life01.all.*` checks are kept exactly as the plan specifies. The probe adds the `life01.all-failure.*`, `all-retry.*`, `codex-pi.*`, `claude-antigravity-hermes.*` and `codex-then-pi.*` checks. Stderr quotes replace digest prefixes with `<digest>`, so the CHECK lines stay reproducible across runs.
- **Committed in:** `0b69ed2`

**3. [Rule 3 - Blocking] The fixture checkout builds its own dist instead of copying `<repo>/dist`**
- **Found during:** Task 2
- **Issue:** With the copied dist, `build-artifact.mjs check` failed on 10 changed inputs. The host working tree holds CRLF bytes for files the index stores as LF (`* text=auto eol=lf`), so the repo manifest does not describe an LF clone.
- **Fix:** The checkout runs `npm run build` after `npm ci`. It also uses a sandbox bare mirror as `origin`, so `git ls-remote` never reaches the real repository. A `cwd` note precedes every checkout step.
- **Committed in:** `48b68df`

**4. [Rule 2 - Missing critical] PowerShell control and re-run checks**
- **Found during:** Task 2
- **Issue:** `life08.preview.update-ps1.no-mutation` recorded VIOLATED because of files under `LOCALAPPDATA/Microsoft/PowerShell`. Excluding that path is forbidden by the plan's transparency rule.
- **Fix:** No exclusion was added. The probe adds `update-ps1.drift-scope`, a `pwsh-control` run of the same cmdlets with no alpha-AOS code, and `update-ps1-rerun`, so the drift can be attributed without weakening the check.
- **Committed in:** `48b68df`

**Total deviations:** 4 auto-fixed (2 blocking, 2 missing critical)
**Impact on plan:** The evidence is more discriminating. Every plan check id is present with the plan's semantics, and `src/` is untouched.

## TDD Gate Compliance

Task 3 is `tdd="true"`, but D-12 allows committing only a passing assertion for behavior the probe already observed as HOLDS. No RED commit can exist. The assertion went straight to green in `2630db6` and passes in the scratch-home run (16/16). This follows the plan 11-01 precedent.

## Issues Encountered

- `bootstrap update --json` refuses to print its plan: the envelope exceeds the 262144-byte budget, and the command exits 2. This is recorded as an observation in `LIFE-08-findings.md` (not a mutation).
- An API rate limit interrupted execution after the three probes had run. Work resumed without re-doing committed state. The life01 and life08-preview probes were re-run after their final edits.

## Verification (plan level)

- All three transcripts end with a `RESULT:` line and `host-guard: unchanged (17 targets)`.
- Scratch-home `tarball-fixture` + `path-literal-guard`: 16/16 pass, no `.alpha-aos` in the scratch home. The `hostMutationTargets` diff against 35d4c15 is empty, and the host deepEqual count is 1.
- Host-safe full suite (`ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`, capability-oracle excluded): tests 889, pass 880, fail 0, skipped 9. The scratch home stayed clean.
- `npm run check` passes. `git status --porcelain -- src` and `git status --porcelain catalog` are empty.

## User Setup Required

None: no external service configuration is required.

## Next Phase Readiness

Plan 11-07 has both gating findings. Phase 13 is blocked by LIFE-01/C1 unless a follow-up fixes shared-destination owned-skill writes in combined installs. Plan 11-07 must also decide the contingent LIFE-08/C1 (PowerShell engine cache).

---
*Phase: 11-managed-lifecycle-verification*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 8 created files and 1 modified file exist, and commits 0b69ed2, 48b68df and 2630db6 are in history.
