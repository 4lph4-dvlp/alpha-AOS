---
phase: 02-evidence-bound-project-planning
plan: 16
subsystem: infra
tags: [pack-catalog, caching, package-root, github-actions, drift-detection, supply-chain]

# Dependency graph
requires:
  - phase: 02-15
    provides: The shape-changing half of the same review findings; this plan is its shape-neutral sibling and inherits its 467-test floor
  - phase: 02-04
    provides: scripts/pin-pack-skills.mjs and the deliberate decision to keep it outside `npm test` because it needs the network
provides:
  - One package root decides one catalog — the root is threaded to every loader instead of rediscovered
  - RootKeyedCache in src/core/paths.ts — a single bounded keying rule for every process-wide cache whose value depends on a package root
  - inspectProjectManifest(inputRoot, packageRoot) — the caller's root reaches the override check
  - .github/workflows/pack-skill-drift.yml — the catalog/lock drift check now has a scheduled home that fails red
affects: [phase-03-harness-rendering, phase-07-packaging]

# Actuals (#2632)
actuals:
  tokens: 8003
  tasks: 2
  commits: 3
plan_head_before: 7fd53867fc701b302ddc259463d33fa4b6add705

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RootKeyedCache: every process-wide cache whose value depends on a caller-supplied package root is keyed by that root and bounded at ROOT_CACHE_LIMIT=8"
    - "Scheduled network-touching maintainer checks live in their own read-only workflow, offset in the cron hour from dependency-candidate.yml"

key-files:
  created:
    - .github/workflows/pack-skill-drift.yml
  modified:
    - src/core/paths.ts
    - src/core/project.ts
    - src/core/project-plan.ts
    - src/core/pack-catalog.ts
    - src/core/evidence.ts
    - test/project-plan.test.ts
    - test/project.test.ts

key-decisions:
  - "Task 2 (option-a): `node scripts/pin-pack-skills.mjs check` runs in a NEW scheduled GitHub Actions workflow, weekly on cron `17 4 * * 1`, and drift FAILS the run red"
  - "Not folded into ci.yml: that workflow has no schedule and runs on every push and pull request; this check needs the network and a cadence, not per-push execution"
  - "Read-only permissions (contents: read): the job opens no pull request and pushes no branch, unlike dependency-candidate.yml"
  - "RootKeyedCache is bounded at 8 with oldest-inserted eviction; eviction costs one re-read and never changes which root's answer a caller receives"
  - "inspectProjectManifest takes `null` as the explicit request for the discovery fallback rather than leaving the fallback implied"

patterns-established:
  - "Root-keyed caching: a memo whose value depends on a caller-supplied root is keyed by that root, bounded, and states its behaviour at the bound"
  - "Cadence over ceremony: a network-touching maintainer check gets its own scheduled workflow rather than a per-push CI step or a human-memory checklist"

requirements-completed: [DETC-02, DETC-04]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Within one process, two package roots holding different catalogs answer with their own catalog — the first caller no longer decides for every later caller"
    requirement: DETC-02
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#two package roots in one process declare two different pack id sets"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a packOverrides key is judged by the package root the caller supplied, not by the first root in the process"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each root-keyed cache is bounded, and an evicted root still answers with its own catalog"
    requirement: DETC-02
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#the root-keyed manifest caches stop at their bound, and an evicted root still answers with its own catalog"
        status: pass
    human_judgment: false
  - id: D3
    description: "The catalog and lock drift check has a named home on a stated cadence: .github/workflows/pack-skill-drift.yml, weekly on `17 4 * * 1`, failing red on drift"
    requirement: DETC-04
    verification:
      - kind: other
        ref: "node scripts/pin-pack-skills.mjs check (run locally: exit 0, `pack skills verified: 19 pack skills pinned in catalog/stack.lock.json`)"
        status: pass
      - kind: other
        ref: "YAML parse of .github/workflows/pack-skill-drift.yml — schedule `17 4 * * 1`, workflow_dispatch, permissions contents:read, one job `check`"
        status: pass
    human_judgment: true
    rationale: "Whether a weekly red run is the right maintainer notification policy is a judgment the user already made at the Task 2 checkpoint; that the schedule actually fires on GitHub's cron cannot be observed locally and is first proven by the workflow's own first scheduled or dispatched run."

# Metrics
duration: 5h 24m
completed: 2026-09-09
status: complete
---

# Phase 02 Plan 16: One Package Root Decides One Catalog, and the Drift Check Gets a Home Summary

**The caller's package root is threaded to every manifest loader and every process-wide cache is keyed by it, so an override is judged by the catalog that evaluated the packs; and `pin-pack-skills.mjs check` now runs weekly in its own read-only scheduled workflow that fails red on drift.**

## Performance

- **Duration:** 5h 24m wall clock — but that number is mostly waiting, not work. Task 1 executed and committed in a prior session; the span is dominated by the human decision wait at Task 2's `checkpoint:decision`. Active execution across both sessions was well under an hour.
- **Started:** 2026-09-08T20:28:32Z (STATE.md timestamp at 02-15 close-out; the prior executor's exact start is not recorded)
- **Completed:** 2026-09-09T01:52:22Z
- **Tasks:** 2
- **Files modified:** 8 (7 modified, 1 created)

## Accomplishments

- **WR-09 closed.** `options.packageRoot` now reaches `inspectProjectManifest`, and the six process-wide memos that previously answered from module state keyed on nothing (`manifestSchema`, `declaredPackIds`, `approvedPlanSchema`, `receiptSchema`, `packCatalogSchema`, `factVocabularySchema`) are keyed by the resolved root through one shared `RootKeyedCache`. The catalog that validates a `packOverrides` key and the catalog that evaluates the packs are now the same catalog.
- **T-02-67 closed with it.** `RootKeyedCache` is bounded at `ROOT_CACHE_LIMIT = 8` with oldest-inserted eviction, and the behaviour at the bound is stated rather than implied: eviction costs one re-read and never changes which root's answer a caller receives.
- **W-3 closed.** `.github/workflows/pack-skill-drift.yml` gives `node scripts/pin-pack-skills.mjs check` its first caller anywhere in the repository, clearing the ORPHANED row that `02-VERIFICATION.md` flagged against `scripts/pin-pack-skills.mjs`.
- **DETC-02 and DETC-04 both closed.** DETC-04 was held open by the shared-ID gate while this plan ran; `requirements.ready-ids` reported `2/2 requirement(s) ready` and both are now `Complete` in `REQUIREMENTS.md`.

## Task Commits

1. **Task 1: End-to-end "one package root decides one catalog" (WR-09)** — `cbc8182` (fix)
2. **Task 2: Decide where the catalog and lock drift check runs (W-3)** — `ba93266` (ci)

Measured, not narrated: `git rev-list --count 7fd5386..HEAD` = **3** — the two task commits above plus this plan's metadata commit, which is what `actuals.commits` records.

## The Task 2 decision, verbatim

The plan asked where `node scripts/pin-pack-skills.mjs check` runs, on what cadence, and whether it fails or merely reports. The user selected **option-a**, with both secondary answers:

1. **Home:** a NEW scheduled GitHub Actions workflow. Do not fold it into `ci.yml` — that workflow has no schedule and runs on every push/PR, and this check needs the network and a cadence, not per-push execution.
2. **Cadence:** weekly, `cron: "17 4 * * 1"` — deliberately offset one hour from `dependency-candidate.yml`'s `17 3 * * 1` so the two network-touching scheduled jobs do not contend.
3. **On drift:** **fail the run red.** Surface `pin-pack-skills.mjs check`'s exit 3 as a failed workflow run. Do NOT use `continue-on-error` and do NOT downgrade drift to an annotation. The user explicitly weighed this against the "report only" alternative and chose the red run, accepting that a transient upstream or network fault will also show red.

Accompanying implementation notes the user gave, all honoured: add `workflow_dispatch` alongside the schedule so a maintainer can run it on demand and verify it without waiting a week; give the job the minimum permissions it needs (it only reads the repository, so no `contents: write` / `pull-requests: write` as in `dependency-candidate.yml`); and let the non-zero exit fail the step rather than masking it with `|| true`.

**This is a deliberate maintainer policy choice, not a default.** A later reader should treat the weekly cadence, the read-only permission set, and especially the red-on-drift behaviour as decided rather than inherited.

**Implementation:** `.github/workflows/pack-skill-drift.yml` (`git ls-files .github/workflows/` lists it alongside `ci.yml` and `dependency-candidate.yml`). It follows the repository's existing conventions rather than inventing new ones: `actions/checkout@v6`, `actions/setup-node@v6` with `node-version: 24` and `cache: npm`, then `npm ci` — the same four steps both existing workflows open with. `npm run build` precedes the check because `pin-pack-skills.mjs` refuses to start without `dist/src/core/ecc-fixture.js`, running the same compiled acquisition path a user's sync runs rather than carrying a second implementation of hashing; `dependency-candidate.yml` builds for the same reason.

## The observed pre-fix failure for the two-root cache assertion

The plan requires this SUMMARY to record the observed pre-fix output. Task 1 ran in a prior session, so rather than report its RED second-hand, the failure was **re-reproduced in this session** against the pre-fix sources, with no change to the working tree: the tree at `cbc8182^` was extracted to a scratch directory, `src/core/{evidence,pack-catalog,paths,project,project-plan}.ts` restored to their pre-fix bytes, and the same scenario driven through the pre-fix public API.

The scenario is WR-09's exact claim. `rootB` is a package root whose catalog declares `BROWNFIELD_INIT_B` (and not `BROWNFIELD_INIT`); the project manifest carries `packOverrides: { BROWNFIELD_INIT_B: force-on }`. The catalog that evaluates the packs for a caller supplying `rootB` therefore declares the overridden pack, and the override must be accepted.

```
=== PRE-FIX (cbc8182^ sources, 1-arg inspectProjectManifest) ===
rootB catalog declares BROWNFIELD_INIT_B : true
inspectProjectManifest status            : invalid
issue codes                              : domain.unknown-pack-override

=== POST-FIX (HEAD sources, 2-arg inspectProjectManifest) ===
rootB catalog declares BROWNFIELD_INIT_B : true
inspectProjectManifest status            : current
issue codes                              : (none)
```

Pre-fix, the override is refused by a catalog that never evaluated the packs — `packageDirectoryOrThrow()` resolves from `moduleDirectory` first, so the caller's `rootB` cannot reach `loadDeclaredPackIds()` at all, and `declaredPackIds` is a single nullable memo that then answers for every later caller in the process. Post-fix the same manifest against the same root is `current` with no issues.

Note on the shape of the pre-fix RED: the three regressions the fix added cannot be compiled against the pre-fix API at all — `tsc` on the pre-fix tree with the post-fix tests reports `TS2305: Module '"../src/core/paths.js"' has no exported member 'ROOT_CACHE_LIMIT'`, `TS2305: ... no exported member 'manifestCacheSizes'`, and sixteen `TS2554: Expected 1 arguments, but got 2`. That compile refusal is itself the finding — pre-fix there was no way to *express* "validate this manifest against that root" — which is why the runtime reproduction above drives the pre-fix 1-arg API directly rather than running the new tests unchanged.

## Files Created/Modified

- `.github/workflows/pack-skill-drift.yml` — **created.** Weekly (`17 4 * * 1`) and on-demand (`workflow_dispatch`) drift check; `permissions: contents: read`; `npm ci` → `npm run build` → `node scripts/pin-pack-skills.mjs check`, whose non-zero exit fails the run.
- `src/core/paths.ts` — `RootKeyedCache` and `ROOT_CACHE_LIMIT`, the one keying rule for every root-dependent process-wide cache.
- `src/core/project.ts` — `inspectProjectManifest(inputRoot, packageRoot)`; `manifestSchema` and `declaredPackIds` re-keyed by resolved root.
- `src/core/project-plan.ts` — `options.packageRoot` passed at every `inspectProjectManifest` call site; `approvedPlanSchema` and `receiptSchema` re-keyed.
- `src/core/pack-catalog.ts` — `packCatalogSchema` and `factVocabularySchema` re-keyed.
- `src/core/evidence.ts` — the root threaded through `collectProjectEvidenceDetail` → `detectProjectFacts` → `openDetectionContext` → `readManifestEvidence`, so the `manifestKey` detector and the pack evaluator read one catalog.
- `test/project-plan.test.ts` — three regressions asserting the property directly (two roots, two answers; the same override accepted against one root and refused against the other in one process; the bound holds and an evicted root still answers with its own catalog).
- `test/project.test.ts` — existing `inspectProjectManifest` call sites updated to the two-argument form.

## Decisions Made

Recorded above in full under "The Task 2 decision, verbatim". In brief: option-a, a new scheduled workflow, weekly `17 4 * * 1`, drift fails the run red, read-only permissions, `workflow_dispatch` for on-demand runs.

One additional decision belongs on the record: **commits for this plan were made on `main`.** `gsd-tools query git.base-branch --is-protected main` returns `true`, and the executor's default posture is to halt rather than commit to a protected branch. That guard exists to catch accidental *drift* onto a protected branch, which is not what happened here: `.planning/config.json` sets `git.branching_strategy: "none"`, this plan's dispatch explicitly directed `main` and forbade creating or switching branches, and Task 1's commit plus the phase's 42 preceding plans already landed there. Committing on `main` is this project's configured workflow, and it is stated here rather than passed over silently.

## Deviations from Plan

None — plan executed exactly as written. Task 1 applied the fix and its regressions; Task 2's checkpoint was answered by the user and the answer implemented as given.

The one thing worth flagging is not a deviation but a scope note: `src/core/pack-catalog.ts` and `src/core/evidence.ts` are not in the plan's `files_modified` list, and Task 1 modified both. Both were necessary and both are inside the plan's own instructions — the action text asks for "any schema memo" to be re-keyed "so the whole phase has one keying rule rather than two" (which reaches `pack-catalog.ts`), and threading the root to the manifest evidence path is what makes the `manifestKey` detector and the pack evaluator read one catalog (which reaches `evidence.ts`). Neither touches `src/types.ts`, `src/format.ts`, `schemas/`, a digest, or a published contract, so the plan's shape-neutrality holds.

## Verification

| Check | Result |
|---|---|
| `npm run check` | exit 0 (tsc --noEmit, clean) |
| `npm run build` | exit 0 — build artifact manifest written, 65 inputs, 124 outputs |
| `node --test dist/test/project-plan.test.js dist/test/project.test.js` | tests 167, **pass 167, fail 0** |
| `npm test` | tests **470**, pass 464, **fail 0**, skipped 6 — above the 467 floor 02-15 left behind |
| `node scripts/pin-pack-skills.mjs check` | exit **0** — `pack skills verified: 19 pack skills pinned in catalog/stack.lock.json` |
| `node scripts/pin-pack-skills.mjs` (no mode) / `bogus` | exit **2** both, confirming the usage code the workflow comment documents |
| `.github/workflows/pack-skill-drift.yml` YAML parse | valid — `schedule: 17 4 * * 1`, `workflow_dispatch`, `permissions.contents: read`, one job `check` |
| `git ls-files .github/workflows/` | lists `ci.yml`, `dependency-candidate.yml`, `pack-skill-drift.yml` |
| Shape-neutrality | `git diff 7fd5386..HEAD --name-only` touches no `src/types.ts`, no `src/format.ts`, no `schemas/`, no lock and no digest |

The drift check was run locally against the real catalog and lock rather than assumed: it is green today, so the workflow's first scheduled run starts from a clean baseline rather than an inherited red.

## Known Stubs

None. Nothing in this plan is placeholder, and no test was skipped or left unrun on its account. The 6 skips in `npm test` are pre-existing and unrelated to this plan.

## Issues Encountered

None that required problem-solving. The only friction was reproducing Task 1's pre-fix RED without a worktree and without `git stash` (both prohibited for this dispatch); it was resolved by extracting `cbc8182^` to a scratch directory outside the repository and junction-linking `node_modules`, leaving the working tree untouched throughout (`git status --short` shows only the pre-existing untracked `.gsd/` and `.planning/milestone.lock`).

## User Setup Required

None — no external service configuration required. The new workflow needs no secrets and no write-scoped token.

## Next Phase Readiness

- **Phase 02 is complete.** This was plan 16 of 16, and with DETC-02 and DETC-04 closed here, every requirement Phase 2 owns now reads `Complete`.
- **Ready for `/gsd-verify-work 02`.** Both review findings this plan carried (WR-09, W-3) are closed, and the ORPHANED artifact row for `scripts/pin-pack-skills.mjs` in `02-VERIFICATION.md` now has a caller to point at.
- **Phase 7 (packaging) inherits a green drift check** as an input, which was one of option-a's stated arguments.
- **One thing a human should watch:** the workflow's first run. Everything about it is verified locally except that GitHub's scheduler actually fires it — dispatch it manually via `workflow_dispatch` to confirm, rather than waiting until a Monday to discover a typo in the cron.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `.github/workflows/pack-skill-drift.yml` — present on disk and tracked by git.
- `.planning/phases/02-evidence-bound-project-planning/02-16-SUMMARY.md` — present on disk.
- Commit `cbc8182` (Task 1) — found in `git log --oneline --all`.
- Commit `ba93266` (Task 2) — found in `git log --oneline --all`.
- `git rev-list --count 7fd5386..HEAD` = 3 (2 task commits + the metadata commit), matching `actuals.commits: 3`.
- `DETC-02` and `DETC-04` both read `Complete` in `REQUIREMENTS.md`.
