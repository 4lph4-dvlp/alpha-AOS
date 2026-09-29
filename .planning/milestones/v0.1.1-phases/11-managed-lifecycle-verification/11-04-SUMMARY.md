---
phase: 11-managed-lifecycle-verification
plan: 04
subsystem: testing
tags: [verification, packed-cli, uninstall, project-pack, isolation, pty, wsl, LIFE-03]

requires:
  - phase: 11-managed-lifecycle-verification
    provides: "plan 11-01 packed-sandbox helper, probe-lib transcript vocabulary, host guard; plan 11-03 claude ship.md seed and LIFE-01/C1 shared-destination finding"
provides:
  - "evidence/life03-uninstall.txt: uninstall previews, non-TTY guard, one-target uninstall for all five harnesses, full-stack leftover scan"
  - "evidence/life03-project.txt: approve-route and uninstall --project pack removal, isolated-runtime clean, uninstall --all against runtimes"
  - "evidence/life03-tty.txt: [y/N] confirmation through a real pseudo-terminal under WSL"
  - "evidence/LIFE-03-findings.md: clause table, oracle audit, D-13 host-safety section, provisional GAP, candidates LIFE-03/C1..C5"
affects: [11-05, 11-07]

actuals:
  tokens: 148000   # chars/4 over all created files (24k authored probes+findings, 124k CLI transcripts)
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Leftover scan: every files[].target recorded by any sandbox journal before uninstall, re-checked for existence after it"
    - "Synthetic preservation fixtures (auth sentinel by hash, user MCP entry by canonical parsed value, user skill by hash) across five native config formats"
    - "Pseudo-terminal confirmation via util-linux script under WSL, sandbox env asserted before each spawn"

key-files:
  created:
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-uninstall.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-project.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-tty.mjs
    - .planning/phases/11-managed-lifecycle-verification/evidence/life03-uninstall.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life03-project.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/life03-tty.txt
    - .planning/phases/11-managed-lifecycle-verification/evidence/LIFE-03-findings.md
  modified: []

key-decisions:
  - "LIFE-03 provisional verdict GAP: uninstall --project removes a user file and the reviewed stack.yaml while leaving every pack target, and no uninstall scope removes the alpha-aos-control/alpha-aos-ship owned skills"
  - "Five gap candidates: C1 owned-skill and claude settings.json leftovers, C2 pi uninstall removes codex ECC skills from the shared root, C3 uninstall --project, C4 removal residue (empty dirs, stale receipt, unapplyable removal offer), C5 isolated runtimes survive uninstall --all"
  - "The five-target setup install refusal is LIFE-01/C1, argued as not failing LIFE-03; the probe falls back to serial per-target installs and reaches an all-CURRENT plan"
  - "Research open question 3 resolved: both removal routes judged; the approve route holds for pack targets, the uninstall --project route violates"
  - "Interactive confirmation (06-VALIDATION manual-only row) is now evidenced through a real pty: prompt shown, n aborts byte-identical, y proceeds"

requirements-completed: [LIFE-09]

coverage:
  - id: D1
    description: "Uninstall previews, non-TTY guard, five one-target uninstalls and full-stack leftover scan"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-uninstall.mjs + Task 1 grep gate (7 target checks x 5 harnesses, leftover check, 4 preview checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both project-pack removal routes and the isolated-runtime clean"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "node .planning/phases/11-managed-lifecycle-verification/evidence/probes/life03-project.mjs + Task 2 grep gate (eleven named checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pseudo-terminal [y/N] confirmation under WSL"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "wsl.exe --cd <repo> -e sh -c 'node .../life03-tty.mjs' + Task 3 gate (platform linux, three TTY checks, host guard unchanged)"
        status: pass
    human_judgment: false
  - id: D4
    description: "LIFE-03 findings with the D-13 citation and gap candidates"
    requirement: LIFE-09
    verification:
      - kind: other
        ref: "findings grep gate (verdict heading, ci02 citation, 8f17c7e, host-safety heading, 40 check citations, src untouched)"
        status: pass
    human_judgment: true
    rationale: "The GAP grade and the reading that a user note and the reviewed stack.yaml under .alpha-aos/ are unrelated user resources are judgments plan 11-07 and the verifier must confirm"

duration: 34min
completed: 2026-09-23
status: complete
---

# Phase 11 Plan 04: LIFE-03 Uninstall, Pack Removal and Runtime Clean Evidence Summary

**The packed CLI was run against all five harnesses and both pack-removal routes. It keeps authentication, user MCP entries, user skills and harness applications on every uninstall, and its previews and `[y/N]` prompt are byte-safe. However, `uninstall --project` deletes user files and the reviewed `stack.yaml` while leaving the pack in place. No uninstall scope removes the `alpha-aos-control`/`alpha-aos-ship` owned skills, and `uninstall --target pi` strips codex's ECC skills from the shared root. Provisional LIFE-03 verdict: GAP.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-09-23T19:38:22Z
- **Completed:** 2026-09-23T20:12:51Z
- **Tasks:** 3
- **Files created:** 7

## Accomplishments

### One-target uninstall per harness (`evidence/life03-uninstall.txt`)

| Harness | managed-mcp-removed | ecc-removed | owned-removed | auth-kept | user-mcp-kept | user-skill-kept | others-untouched |
|---|---|---|---|---|---|---|---|
| hermes | HOLDS | HOLDS | **VIOLATED** (alpha-aos-control) | HOLDS | HOLDS | HOLDS | HOLDS |
| pi | HOLDS | OBSERVED (shared root with codex; all three removed) | **VIOLATED** | HOLDS | HOLDS | HOLDS | HOLDS (shared ECC excluded) |
| antigravity | HOLDS | HOLDS | **VIOLATED** | HOLDS | HOLDS | HOLDS | HOLDS |
| codex | HOLDS | HOLDS (already gone via pi) | **VIOLATED** | HOLDS | HOLDS | HOLDS | HOLDS |
| claude | HOLDS | HOLDS | **VIOLATED** (alpha-aos-control, alpha-aos-ship) | HOLDS | HOLDS | HOLDS | HOLDS |

In addition, `life03.target.pi.sibling-codex-intact` is **VIOLATED**: after `uninstall --target pi`, codex, which is still installed, has no ECC skills left, and its plan step reads `ecc:codex=create`.

Previews: `life03.preview.{target,target-json,all,purge}.no-mutation` are all HOLDS by byte fingerprint. `life03.guard.non-tty-refuses` is HOLDS: exit 2, the `--yes` message is printed, and the fingerprint is unchanged.

### Full-stack leftover list (`life03.all.leftovers VIOLATED`, 6 of 7 journal-recorded targets)

- `<home>/.agents/skills/alpha-aos-control/SKILL.md` (codex/pi)
- `<home>/.claude/skills/alpha-aos-control/SKILL.md`
- `<home>/.claude/skills/alpha-aos-ship/SKILL.md`
- `<home>/.gemini/antigravity/skills/alpha-aos-control/SKILL.md`
- `<home>/.hermes/skills/alpha-aos-control/SKILL.md`
- `<home>/.claude/settings.json`, which alpha-AOS created and pruned to 3 bytes but did not remove

The following full-stack checks HOLD: seeded ECC removed, auth kept, user MCP kept, user skill kept, journals kept without `--purge`, `--purge` removes the state root, auth kept after purge, and harness applications kept (inventory command@version identical). One OBSERVED check: 12 empty skill directories are left behind.

### Project-pack routes (`evidence/life03-project.txt`)

- **Approve route (web / WEB_BASE):** the removal digest that `project status` printed (step 8) was consumed by `project approve --plan-digest <removal> --apply` (step 9). All 10 receipted targets were removed (`approve-route HOLDS`). Both user files were kept, `plan.json` was kept, and the removal is listed by `rollback --json`. Residue: 5 empty pack-created directories (`empty-dirs-swept VIOLATED`) and the pack receipt remain. Status then shows `UNSUPPORTED-CLAIM` and keeps offering a removal, which refuses with `plan-incomplete`.
- **`uninstall --project` route (security / SECURITY_REVIEW):** the preview is byte-safe (HOLDS). The apply removed only `.alpha-aos/*`, which included the user note and the reviewed `stack.yaml`. It left all 5 pack skill files and sidecars. `pack-removed`, `user-file-kept` and `manifest-kept` are all VIOLATED.

### Runtime clean outcome

`project isolate init|sync|clean` worked through the packed CLI. The preview is byte-safe, the clean removes the runtime (`codex/config.toml`, `runtime.json`), both files are listed in a new journal, and the project tree is unchanged. All four checks HOLD. Two follow-ups against `uninstall --all`:

- An isolated runtime under `<state>/isolated/<id>` survives it (`life03.runtime.uninstall-all-isolated VIOLATED`).
- The unmarked `<state>/runtimes/p11-unmarked` is removed (OBSERVED; it sits inside alpha-AOS state and no user resource is shown removed).

### TTY outcome (`evidence/life03-tty.txt`, `platform: linux x64`)

`life03.tty.prompt-shown`, `life03.tty.no-aborts` and `life03.tty.yes-proceeds` are all HOLDS. The pty output is `Proceed with uninstall? [y/N] Uninstall aborted.`, and the sandbox digests are unchanged after `n`. After `y`, the codex policy file is removed.

### Provisional LIFE-03 verdict

**GAP** (D-02). The core promise ("remove alpha-AOS-managed state without removing unrelated user resources") fails on two counts. `uninstall --project` removes user resources (C3), and no scope removes the owned skills (C1). Further candidates are C2 (shared-root sibling removal), C4 (removal residue) and C5 (isolated runtimes survive `uninstall --all`). All three transcripts end with `host-guard: unchanged (17 targets)`. The findings cite the ci02 test-isolation-leak record and its fix commits `8f17c7e` and `7a3ee28`, and name no product violation for that leak.

## Task Commits

1. **Task 1: Uninstall previews, five one-target uninstalls, full-stack leftover scan**: `7759497` (test)
2. **Task 2: Both project-pack removal routes and the isolated-runtime clean**: `bcf53cc` (test)
3. **Task 3: Pseudo-terminal confirmation under WSL and LIFE-03 findings**: `e603c9c` (test)

**Plan metadata:** recorded in the docs commit that adds this SUMMARY

## Files Created/Modified

- `evidence/probes/life03-uninstall.mjs`, `evidence/life03-uninstall.txt`: previews, guard, per-harness and full-stack uninstall
- `evidence/probes/life03-project.mjs`, `evidence/life03-project.txt`: pack removal routes and isolation runtime
- `evidence/probes/life03-tty.mjs`, `evidence/life03-tty.txt`: WSL pty confirmation
- `evidence/LIFE-03-findings.md`: findings for plan 11-07

## Decisions Made

See `key-decisions`. The main judgment is that a user note under `.alpha-aos/` and the reviewed `.alpha-aos/stack.yaml` are unrelated user resources. They are judged by what the user wrote, not by where they live, which is the plan's D-09 prohibition. That makes C3 a core-clause failure rather than an observation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Five-target setup install refuses (LIFE-01/C1); serial fallback**
- **Found during:** Task 1
- **Issue:** `install --target claude,codex,antigravity,pi,hermes --apply` exits 2 with `plan-drift` because codex and pi share the `alpha-aos-control` destination.
- **Fix:** The refusal is recorded as `life03.setup.install VIOLATED` (and `life03.all-setup.install`). The probe then installs one target at a time and confirms an all-CURRENT plan (`setup.all-current HOLDS 24 steps`), so the uninstall checks run against a fully journaled stack.
- **Committed in:** `7759497`

**2. [Rule 3 - Blocking] The web selecting evidence is a directory fact**
- **Found during:** Task 2 (first scratch run: no removal was offered)
- **Issue:** `browser-entrypoint` is a directory fact. Deleting only `public/index.html` left WEB_BASE `CURRENT`.
- **Fix:** The probe deletes the `public/` directory and notes why in the transcript.
- **Committed in:** `bcf53cc`

**3. [Rule 2 - Missing critical] Uninstall route uses the `security` domain**
- **Found during:** Task 2
- **Issue:** The `web` fixture has no `.alpha-aos/stack.yaml`, so `life03.project.manifest-kept` could never have been observed.
- **Fix:** The second project is the `security` domain fixture, which selects its pack through a reviewed `stack.yaml` opt-in.
- **Committed in:** `bcf53cc`

**4. [Rule 1 - Bug] Redacted `runtimeRoot` resolved against the sandbox state**
- **Found during:** Task 2 (first run recorded a vacuous `journaled` check over 0 files)
- **Issue:** The CLI redaction seam prints the runtime root as `<state>\isolated\<id>`.
- **Fix:** The probe resolves `<state>` to the sandbox state root, fails if the result does not exist, and replaces the per-run project id with `<project-id>` in CHECK details.
- **Committed in:** `bcf53cc`

**5. [Rule 3 - Blocking] npm 12 under WSL: `npm pack --json` shape and a stale npm cache**
- **Found during:** Task 3
- **Issue:** npm 12 prints the pack report as an object, and `packOnce` in the read-only `probe-lib.mjs` expects an array. `installPackedRelease --prefer-offline` then hit `ETARGET` for `@modelcontextprotocol/sdk@1.30.0` from a stale WSL cache.
- **Fix:** The probe packs the tarball itself (accepting both shapes), hands it to `packOnce` through `ALPHA_AOS_P11_TARBALL`, and refreshes the six direct dependencies into the WSL npm cache with `npm cache add` first. All of this is recorded as transcript steps and notes.
- **Committed in:** `e603c9c`

**6. [Rule 2 - Missing critical] Checks beyond the plan's named set**
- `life03.target.pi.sibling-codex-intact`, `life03.runtime.uninstall-all-isolated`, `life03.pack.receipt-after-removal`, `life03.pack.removal-still-offered`, `life03.all.empty-skill-dirs`, `life03.all.seeded-ecc-removed`, `life03.all.purge-auth-kept` and `life03.preview.all-owned-skills` were added. Without them, the shared-root side effect, the stale receipt and the isolated-runtime leftover would have passed silently.
- The approve route is judged on the receipted targets (skill files plus sidecars), and the receipt is reported separately.
- The user MCP fixture is reported by the hash of its canonical parsed entry, because the config bytes embed sandbox paths.
- **Committed in:** `7759497`, `bcf53cc`

---

**Total deviations:** 6 auto-fixed (3 blocking, 2 missing critical, 1 bug)
**Impact on plan:** The evidence is stronger and stays honest. No scope creep, and `src/` is untouched.

## Issues Encountered

- The first `life03-project` scratch run offered no removal (deviation 2) and produced a vacuous runtime check (deviation 4). Neither run was committed.
- Python-based edits once corrupted a regex escape in `life03-project.mjs`. `node --check` caught it before any run, and it was repaired.

## Known Stubs

None.

## Verification (plan level)

- Task 1 gate: pass. There are 7 target checks for each of the 5 harnesses, a leftover check, exactly 4 preview checks, and the host guard is unchanged. The sentinel string appears 0 times across all three transcripts.
- Task 2 gate: pass. All eleven named checks are present and the host guard is unchanged.
- Task 3 gates: pass. The TTY transcript reports `platform: linux x64`, has three TTY checks and an unchanged host guard. The findings gate passes (40 check citations).
- All three LIFE-03 transcripts end with `RESULT:` and `host-guard: unchanged (17 targets)`.
- `git status --porcelain -- src` is empty.

## User Setup Required

None: no external service configuration required.

## Next Phase Readiness

Plan 11-07 can compile LIFE-03 from `evidence/LIFE-03-findings.md` and assign G-11 ids to C1..C5. Plan 11-05 (LIFE-04) should cross-reference C1 and C3, whose leftovers and removals of non-receipted bytes also bear on LIFE-04, rather than merge them. It should also pick up the compensation-command observation for LIFE-07. LIFE-03 gaps do not block Phase 13 (D-08).

---
*Phase: 11-managed-lifecycle-verification*
*Completed: 2026-09-23*

## Self-Check: PASSED

All 7 created files exist. Task commits 7759497, bcf53cc and e603c9c are in history. All three LIFE-03 transcripts end with a RESULT line and an unchanged host guard.
