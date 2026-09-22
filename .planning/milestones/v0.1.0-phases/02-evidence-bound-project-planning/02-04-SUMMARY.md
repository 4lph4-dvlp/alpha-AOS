---
phase: 02-evidence-bound-project-planning
plan: 04
subsystem: infra
tags: [supply-chain, stack-lock, sha256, npm-pack, integrity, ecc-universal, pack-catalog, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's pack-catalog loader and ProjectCapabilityPlan seam; 02-02's loadPackCatalogStrict merge over the seven declared pack files and catalog/facts.yaml"
  - phase: 01-safe-operation-boundary
    provides: "runEccFixture's reviewed operation plan, proveOperationPaths boundary proofs, bounded redacted process results, and the stable-lock managed-document route"
provides:
  - "All 19 skills named by catalog/packs/*.yaml pinned as components.ecc.sourceSha256 in catalog/stack.lock.json (22 entries total)"
  - "scripts/pin-pack-skills.mjs — a maintainer-only write|check pinning tool driven by the integrity-checked ECC fixture"
  - "An ECC fixture that accepts a caller-supplied skill list without widening the global sync list (PackSkillId, readEccSkillSource)"
  - "A catalog-derived coverage net that turns red the moment a declared pack names an unpinned skill"
  - "A working npm pack acquisition path: tarball identity is now read from disk, not from npm's unbounded --json stdout"
affects: [02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-3-capability-materialization]

actuals:
  tokens: 15544
  tasks: 3
  commits: 7
plan_head_before: 7c1e1635545c08f2e0cc7f539b20bca4bcb9fddb

tech-stack:
  added: []
  patterns:
    - "Maintainer-side pinning script mirroring scripts/build-artifact.mjs's write|check argument pair and loud-failure conventions"
    - "Tarball identity computed from the bytes on disk (sha512 SRI) rather than parsed out of a child's bounded stdout excerpt"
    - "Coverage assertions derived from the catalog at runtime, never from a name list restated in the test"
    - "Additive, idempotent lock merge: existing keys keep their position and bytes, new keys append sorted"

key-files:
  created:
    - scripts/pin-pack-skills.mjs
  modified:
    - catalog/stack.lock.json
    - src/core/ecc-fixture.ts
    - test/catalog.test.ts
    - test/ecc-skills.test.ts

key-decisions:
  - "PackSkillId is a string alias declared in src/core/ecc-fixture.ts, not src/types.ts — plan 02-02 owns src/types.ts in this same wave, and a shared file between two same-wave plans is the merge conflict the file-overlap rule exists to prevent"
  - "The fixture's skill list is an optional parameter defaulting to the existing selectedSkills tuple; both global tuples stay literally three members, asserted by a source-level gate and by a count-and-ids test"
  - "runEccFixture now derives the archive name from the pack root it created and computes the tarball's sha512 SRI itself, because npm pack --json for ecc-universal@2.2.0 is 292 KB and a ProcessResult is a bounded redacted excerpt by design"
  - "The pinning script reads catalog/packs/ from the directory but routes the files through loadPackCatalogStrict, so the skill list is data (D-05) while validation stays on the one managed-document route"
  - "The coverage test also asserts the loader's PACK_FILES list has not drifted from the directory — without that, a pack added as YAML would be pinned by the script and still be permanently unselectable"
  - "No targetSha256 was written for pack skills: the render is identity for all 19, targetSha256 is not in the schema's required list, and per-harness targets are Phase 3's work"

patterns-established:
  - "Cross-check by re-derivation: the three pre-existing global hashes are recomputed on every pinning run and must match byte-for-byte, which validates the acquisition path itself rather than any single hash"
  - "Non-vacuous safety nets: a coverage assertion must also assert that the thing it guards actually grew, or the count can pass against an unchanged world"
  - "RED by controlled probe: for a test-shaped deliverable, prove the net is red by temporarily introducing the defect it claims to catch, then remove it"

requirements-completed: [DETC-04]

coverage:
  - id: D1
    description: "Every skill named by any of the seven catalog/packs/*.yaml files has a sourceSha256 entry in catalog/stack.lock.json, so a pack can never be planned sourceless"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/catalog.test.ts#every skill any declared pack names is pinned in the stable lock"
        status: pass
      - kind: other
        ref: "node scripts/pin-pack-skills.mjs check"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each pinned hash was produced by the integrity-checked ECC fixture path, not copied from a global install"
    requirement: DETC-04
    verification:
      - kind: other
        ref: "node scripts/pin-pack-skills.mjs check — re-acquires the tarball, verifies its sha512 SRI against components.ecc.integrity, and re-derives all 22 hashes"
        status: pass
      - kind: other
        ref: "cross-check: all 19 pinned values equal the independent 02-RESEARCH F-1 table, and the three global values are byte-identical to their pre-change lock entries"
        status: pass
    human_judgment: false
  - id: D3
    description: "planEccSkillSync still produces exactly three entries after the lock grows — pack skills never reach the global skill root"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/ecc-skills.test.ts#a grown ECC lock does not grow the global skill sync"
        status: pass
      - kind: other
        ref: "source gate: the selectedSkills tuple in src/core/ecc-fixture.ts still has exactly 3 members"
        status: pass
    human_judgment: false
  - id: D4
    description: "The integrity-checked fixture can be pointed at any skill list, and a named skill with no SKILL.md is a loud failure naming that skill"
    verification:
      - kind: unit
        ref: "test/ecc-skills.test.ts#the ECC fixture plan accepts a caller-supplied skill list"
        status: pass
      - kind: unit
        ref: "test/ecc-skills.test.ts#the ECC fixture plan defaults to exactly the three global skills"
        status: pass
      - kind: unit
        ref: "test/ecc-skills.test.ts#a fixture skill with no SKILL.md is a loud failure naming that skill"
        status: pass
    human_judgment: false
  - id: D5
    description: "runEccFixture completes against the real ecc-universal@2.2.0 tarball; the previous npm pack --json parse could not, so no caller could acquire ECC at all"
    verification:
      - kind: e2e
        ref: "node scripts/pin-pack-skills.mjs write then check — two full acquisitions, both exit 0, integrity verified against the lock"
        status: pass
    human_judgment: true
    rationale: "Proven by real runs during this plan, but no committed automated test exercises the network acquisition path; a maintainer must re-run the script to observe it. Committing a network test would put a package-manager invocation into the suite."
  - id: D6
    description: "alpha-aos project plan stays offline: the lock is the source of truth and the plan path invokes no package manager"
    requirement: DETC-04
    verification:
      - kind: e2e
        ref: "node dist/src/cli.js project plan . --json (exit 0, no npm on the route: grep of src/core/project-plan.ts and src/core/evidence.ts finds none)"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
    human_judgment: false

# Metrics
duration: 30 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 04: Pre-pinned pack skill source hashes Summary

**All 19 skills the seven declared packs name are pinned in `catalog/stack.lock.json` from the integrity-checked `ecc-universal@2.2.0` tarball — via a maintainer `write|check` script, a fixture that now takes a caller-supplied skill list without widening the three-skill global sync list, and a catalog-derived net that turns red the moment a pack names an unpinned skill.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-09-07T15:36:04Z
- **Completed:** 2026-09-07T16:06:07Z
- **Tasks:** 3
- **Files modified:** 5 (1 created, 4 modified)

## Accomplishments

- **D-08 is now true for every declared pack.** `components.ecc.sourceSha256` carries 22 entries (3 global + 19 pack). `src/core/ecc-skills.ts` throws when `sourceSha256` lacks a skill; before this plan, the first pack whose skill was unpinned would have made planning fail at the moment it was needed.
- **The hashes are trustworthy by construction, not by assertion.** Every value came out of `runEccFixture`, which verifies the packed tarball against the locked `components.ecc.integrity` before anything is hashed. The three pre-existing global hashes are recomputed on every run as the cross-check that validates the whole acquisition — they came back byte-identical, and all 19 new values independently match the 02-RESEARCH §F-1 table that was read from a global install by a different route.
- **The global sync list provably did not grow.** `selectedSkills` in both `src/core/ecc-fixture.ts` and `src/core/ecc-skills.ts` still has exactly three members; `planEccSkillSync` against the grown lock still returns exactly three entries with exactly the global three ids. Both count and ids are asserted, and the test first asserts the lock actually grew so neither half can pass vacuously.
- **The ECC acquisition path works again.** `npm pack --json` for `ecc-universal@2.2.0` emits 292 KB because it lists every packed file, while a `ProcessResult` is a bounded redacted excerpt by design. `parsePackResult` was parsing a 4096-byte truncation and threw `Expected property name or '}' in JSON at position 4096` — `runEccFixture` could not complete for *any* caller, including `alpha-aos ecc fixture` and the install path. Identity now comes from the pack root the plan proved plus a sha512 SRI over the bytes on disk.
- **Adding a pack stays a YAML edit — and is now checked from both sides.** The pinning script derives its skill list by reading `catalog/packs/`, and the coverage test asserts that the loader's own `PACK_FILES` list has not drifted from that directory. Without that second assertion, a pack added as YAML would be pinned by the script and remain permanently unselectable by the product.

## Task Commits

1. **Task 1: The ECC fixture accepts a caller-supplied skill list** (TDD)
   - RED — `22e9bd0` (test) — four behaviours; `tests 9, pass 7, fail 2`, verdict `RED_EVIDENCE_OK`
   - GREEN — `94e1d16` (feat) — `skills` parameter, `PackSkillId`, `readEccSkillSource`
   - REFACTOR — `e667372` (refactor) — RED-phase casts replaced by the real typed API
2. **Task 2: `scripts/pin-pack-skills.mjs` and the 19 pinned source hashes**
   - `7af0932` (fix) — the blocking `npm pack --json` truncation, found running the script
   - `212a12b` (feat) — the pinning script and the 19 lock entries
3. **Task 3: Lock/pack coverage test and the global-sync anti-regression net** — `1993914` (test), verdict `RED_EVIDENCE_OK` via a controlled probe pack

**Plan metadata:** the `docs(02-04): complete pack-skill pinning plan` commit carrying this file. `commits: 7` is `git rev-list --count 7c1e163..HEAD` measured with the same instrument `/gsd-verify-work` uses.

_Note: TDD tasks produced multiple commits (test → feat → refactor)._

## Files Created/Modified

- `scripts/pin-pack-skills.mjs` — maintainer `write|check` pinning tool. Reads `catalog/packs/` from the directory, routes the files through `loadPackCatalogStrict`, acquires the locked tarball through `runEccFixture`, cross-checks the three global hashes, merges additively and idempotently, and never touches `catalog/candidate.lock.json`.
- `catalog/stack.lock.json` — 19 new `components.ecc.sourceSha256` entries and the same 19 ids appended to `components.ecc.skills`. Purely additive: the three existing entries keep their position and their bytes.
- `src/core/ecc-fixture.ts` — optional `skills` on `createEccFixtureOperationPlan` / `runEccFixture` defaulting to `selectedSkills`; `PackSkillId`; `readEccSkillSource` (loud, named failure plus a containment check on the skill id); `soleArchive` + `tarballIntegrity` replacing `parsePackResult`; the apply-time re-plan derives its skill list from the *reviewed* plan.
- `test/catalog.test.ts` — the catalog-derived coverage case, the loader-vs-directory drift assertion, and all three global `sourceSha256` values as string literals.
- `test/ecc-skills.test.ts` — four fixture cases plus the non-vacuous global-sync anti-regression case.

## Decisions Made

1. **`PackSkillId` lives in `src/core/ecc-fixture.ts`.** The plan directed this explicitly and the reason held: plan 02-02 owns `src/types.ts` in this same wave.
2. **The fixture guard was generalised, not removed.** `createEccFixtureOperationPlan` still refuses a skill the caller's `ecc.skills` does not declare; it now names the undeclared ids. The pinning script declares its intent by passing the union explicitly, so the guard keeps meaning rather than being bypassed.
3. **`runEccFixture` re-plans from `reviewed.skills`.** The apply-time `assertPlanUnchanged` re-derivation takes its skill list from the reviewed plan, so a caller cannot hand apply a wider list than review approved.
4. **Tarball integrity is computed, not reported.** Hashing the bytes on disk is what a locked `integrity` is meant to bind; it was verified byte-identical to npm's own report for `ecc-universal@2.2.0` before the change was accepted.
5. **Existing lock keys keep their position; new keys append sorted.** Deterministic and idempotent — a second `write` run produced no diff — while keeping the diff additive and reviewable.
6. **No `targetSha256` for pack skills.** `renderEccSkill` is identity for all 19, `targetSha256` is not in the schema's `required` list, and per-harness targets are Phase 3's concern.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm pack --json` output exceeds the bounded process excerpt, so `runEccFixture` could not complete**

- **Found during:** Task 2 (first `node scripts/pin-pack-skills.mjs write` run)
- **Issue:** `parsePackResult` parsed `packed.stdout.excerpt`, but `createRedactedExcerpt` caps a process result at `LIMITS.excerptBytes` (4096) by design, and `npm pack ecc-universal@2.2.0 --json` emits 298,990 bytes because it enumerates every packed file. The parse threw `Expected property name or '}' in JSON at position 4096`. This is pre-existing and affects every caller of `runEccFixture`, including `alpha-aos ecc fixture` and `src/core/install.ts`; it was invisible to CI because that path needs the network.
- **Fix:** `soleArchive` reads the one file `npm pack` wrote into the pack root the operation plan already proved, and `tarballIntegrity` computes `sha512-<base64>` over the bytes on disk and compares it against the locked `components.ecc.integrity`. `parsePackResult` and its `PackResult` shape were removed. The `inside()` containment check and the `ComponentPlanError("unplanned-path", ...)` refusal are unchanged.
- **Files modified:** `src/core/ecc-fixture.ts`
- **Verification:** the computed SRI was confirmed byte-identical to npm's own `integrity` for `ecc-universal@2.2.0` before the change was accepted; two full acquisitions (`write`, then `check`) then completed and verified against the lock.
- **Committed in:** `7af0932`

**2. [Rule 2 - Missing Critical] The coverage net could not actually catch a newly declared pack**

- **Found during:** Task 3
- **Issue:** Task 3's stated behaviour is "a pack declaring a skill with no lock entry is detectable… adding such a pack turns the test red". `loadPackCatalogStrict(packageRoot())` reads a hardcoded `PACK_FILES` list (02-02's deliberate anti-glob decision), so a pack file added to `catalog/packs/` would be pinned by the Task 2 script — which reads the directory — and still be invisible to both the loader and the test. The stated behaviour would have been false as written.
- **Fix:** the coverage test derives its file list from the directory, loads through `loadPackCatalogStrict` with that list, and additionally asserts that the default (`PACK_FILES`) load yields the identical pack-id set. A directory/loader divergence now fails the suite.
- **Files modified:** `test/catalog.test.ts`
- **Verification:** a probe pack declaring `red-probe-unpinned-skill` turned the test red naming that skill (`tests 10, pass 9, fail 1`); the probe was then removed and the net is green against the real catalog.
- **Committed in:** `1993914`

**3. [Rule 2 - Missing Critical] Skill ids from YAML are now a path input**

- **Found during:** Task 1
- **Issue:** `join(sourceRoot, skill, "SKILL.md")` was safe while `skill` came from a three-element tuple in the source file. With a caller-supplied list sourced from `catalog/packs/*.yaml`, an id containing path separators could escape the extracted tree.
- **Fix:** `readEccSkillSource` refuses an id whose resolved file is not inside `sourceRoot` before any read. The plan path is independently covered because `proveOperationPaths` bounds every target to `fixtureRoot`.
- **Files modified:** `src/core/ecc-fixture.ts`
- **Verification:** `npm run check` exits 0; the fixture suite is green; the boundary helper is the one already used for the fixture cleanup and destination checks.
- **Committed in:** `94e1d16`

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 missing critical)
**Impact on plan:** Deviation 1 was a hard prerequisite — Task 2 could not run at all without it, and it repairs a user-facing break well outside this plan. Deviations 2 and 3 make stated guarantees actually hold rather than adding scope. No architectural change; no plan task was skipped or reinterpreted.

## Threat Flags

None. No new network endpoint, auth path, or trust-boundary schema was introduced. The one package-manager invocation added is in a maintainer script, deliberately off the product's `project plan` path.

Threat-register mitigations applied and evidenced:

- **T-02-09 (Tampering — hash acquisition):** every hash comes from `runEccFixture`; the tarball's sha512 SRI is now computed over the bytes on disk and compared to the locked `integrity`, and the three pre-existing hashes are re-derived every run as a cross-check. Hashes were never read from a global `node_modules` install.
- **T-02-17 (Elevation of Privilege — the global sync list):** both `selectedSkills` tuples are unchanged at three, asserted by a source-level node gate and by a count-and-ids test against the grown lock.
- **T-02-18 (Tampering — `catalog/candidate.lock.json`):** the script never writes it; `git diff --stat -- catalog/candidate.lock.json` is empty.
- **T-02-19 (Denial of Service — plan-time resolution):** pre-pinning removes any need for plan-time resolution; `project plan` invokes no package manager.
- **T-02-20 (Spoofing — a pack whose skill has no `SKILL.md`):** `readEccSkillSource` fails loudly naming the skill, the script stops and reports, and no placeholder hash is ever written.

## Known Stubs

| Stub | File | Reason it is intentional | Resolved by |
|------|------|--------------------------|-------------|
| `ProjectCapabilityPlan` does not yet carry a per-pack source version and hash, so `alpha-aos project plan` cannot print them even though the lock can now answer for all 19 | `src/core/project-plan.ts` | This plan's tasks deliver the offline authority (the pinned lock) and explicitly do not touch `project-plan.ts`. The plan output field is later-plan work. | 02-05 – 02-10 |
| No pack skill has a `targetSha256` entry | `catalog/stack.lock.json` | Stated in the plan: the render is identity for all 19, the schema does not require it, and per-harness targets are Phase 3's work. | Phase 3 |

The first row is recorded in `.planning/WINDOWS.md` for phase 02 as an `unmet-truth`, so the gap between "the lock can answer" and "`project plan` says it" is visible at ship time rather than only here.

## Issues Encountered

- **One flaky, unrelated test.** `test/process.test.js#a timed-out command leaves no descendant process behind` failed once with `EBUSY: resource busy or locked, rmdir` on a Windows temp directory, during a run that immediately followed two 6.5 MB `npm pack` acquisitions. Re-running that file alone gave `tests 21, pass 21, fail 0`, and the final full-suite run was `fail 0`. It touches nothing this plan changed and is out of scope per the deviation scope boundary.
- **Committed on `main`.** `git.branching_strategy` is `none` and this phase's prior three plans committed there; the orchestrator directed the same. `git.allow_default_branch_commits` is not present in `.planning/config.json`, so the executor's generic default-branch guard would otherwise halt. Recorded here rather than silently bypassed.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | exits 0 |
| `npm run build` | exits 0 |
| `npm run build:check` | `build artifact verified: 63 inputs, 120 outputs` |
| `node scripts/pin-pack-skills.mjs check` | exits 0 — `pack skills verified: 19 pack skills pinned` |
| `node scripts/pin-pack-skills.mjs write` (second run) | exits 0, `0 added`, `diff -q` against the previous file reports no difference |
| `sourceSha256` key count | 22 (≥ 22 required) |
| `unified-memory` / `documentation-lookup` / `deep-research` hashes | byte-identical to their pre-change values |
| 19 pack hashes vs 02-RESEARCH §F-1 | all 19 match |
| `targetSha256` key count | 3 — no pack skill added |
| `git diff --stat -- catalog/candidate.lock.json` | empty |
| global `selectedSkills` tuple gate (`src/core/ecc-fixture.ts`) | `global skills 3` |
| `src/core/ecc-skills.ts:26` | still the three global skills |
| `node --test dist/test/catalog.test.js dist/test/ecc-skills.test.js` | `tests 19, pass 19, fail 0` |
| `npm test` | `tests 241, pass 236, fail 0, skipped 5` — above the 212 total recorded in 02-01-SUMMARY.md |
| `node dist/src/cli.js project plan . --json` | exits 0 |
| RED gate, Task 1 | `RED_EVIDENCE_OK` (`tests 9, pass 7, fail 2`) |
| RED gate, Task 3 | `RED_EVIDENCE_OK` (`tests 10, pass 9, fail 1`, probe pack) |

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 | ✓ `22e9bd0` | ✓ `94e1d16` | ✓ `e667372` | Pass |
| Task 3 | ✓ (probe, `RED_EVIDENCE_OK`) | ✓ `1993914` | — | Pass |

Task 1's RED tests were written against a type shim (`Parameters<...>[0] & { skills?: readonly string[] }` and a dynamic module lookup) so that the run failed on the *behaviour* rather than on a compile error — a build failure produces no TAP and classifies as `INVALID_RED`. The shims were removed in the REFACTOR commit with no assertion changed.

Task 3's deliverable is itself a test, so RED was demonstrated by a controlled probe: a temporary `catalog/packs/zz-red-probe.yaml` declaring `red-probe-unpinned-skill` turned the coverage net red with `pack skills with no sourceSha256 entry: red-probe-unpinned-skill`. The probe was removed before the commit; it is not in the repository. The single `test(02-04)` commit therefore carries a green net whose non-vacuity was proven rather than assumed.

RED evidence was captured with `--test-reporter=tap`; `node --test`'s default reporter is not TAP and misclassifies as `zero_tests_discovered`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 02-05 through 02-10.** The lock can now answer "what exact source version and hash backs this pack's skills" for all 19 pack skills, entirely offline. The remaining DETC-04 work is surfacing those values in `ProjectCapabilityPlan` and the `project plan` output.
- **`alpha-aos ecc fixture` and the install path work again** for `ecc-universal@2.2.0`. Any plan that exercises real ECC acquisition can now do so.
- **One maintainer obligation.** `catalog/stack.lock.json` and `catalog/packs/*.yaml` must stay in step: `node scripts/pin-pack-skills.mjs check` is the gate, and it needs the network. It is not wired into `npm test` (which must stay offline) — a CI job or release checklist is the right home for it.
- **One carried gap.** `project plan` still does not print per-pack source version and hash; recorded in `.planning/WINDOWS.md` as an `unmet-truth` for phase 02 rather than left to memory.

## Self-Check: PASSED

- `scripts/pin-pack-skills.mjs` verified present on disk.
- All five task commits verified in `git log`: `22e9bd0`, `94e1d16`, `e667372`, `7af0932`, `212a12b`, `1993914` (six task commits; the RED/GREEN/REFACTOR triple counts as three).
- `catalog/packs/zz-red-probe.yaml` verified absent from both the working tree and `git log --all`.
- Commit count measured from `plan_head_before` (`7c1e163`) with `git rev-list --count`: 6 before this metadata commit, 7 after.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*
