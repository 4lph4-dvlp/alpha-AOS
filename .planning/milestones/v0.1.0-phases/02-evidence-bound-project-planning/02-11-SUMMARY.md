---
phase: 02-evidence-bound-project-planning
plan: 11
subsystem: core
tags: [canonical-root, monorepo, symlink, junction, scan-boundary, termination, tdd]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "the boundary walk, sub-project discovery and the plan/approve/status verbs (02-05, 02-07) that this plan repairs rather than rebuilds"
provides:
  - "A canonical-root ladder whose shipped rungs and doc comment agree: explicit-override, project-declaration, git-root, standalone-directory"
  - "A descent that pins its root, so `project plan`, `project plan --project`, `project status` and `project approve` all terminate on a git repository containing a nested manifest"
  - "A named cycle refusal when one canonical root is re-entered inside one recursion"
  - "`alias-entry`: a symlink/junction/reparse point is refused before identity is marked, for files as well as directories"
  - "`runCliBounded` and `boundedScan` — hard-timeout test runners, so a non-termination defect is a red assertion and never a stalled suite"
affects: [02-12, 02-13, phase-03-capability-materialization, phase-07-three-os-matrix]

actuals:
  tokens: 11970
  tasks: 3
  commits: 5

plan_head_before: c2cb6453ec00c7ba26707be29ce9080ba69448d3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Bounded test runners: a property whose name is TERMINATION is asserted under a wall-clock kill, never merely observed to finish"
    - "Pinned-root recursion with a visited-root guard that throws by name rather than a guard that silently skips"
    - "Alias refusal before identity marking, so a repository cannot alter its own evidence by adding a link"

key-files:
  created: []
  modified:
    - src/core/evidence.ts
    - src/core/project-plan.ts
    - test/project-plan.test.ts
    - test/evidence.test.ts

key-decisions:
  - "Task 1 (user): option-a — implement `project-declaration` ABOVE `git-root`; a descent reports `project-declaration`, not `explicit-override`; REMOVE `worktree-root` and `submodule-root` from `RootReason`"
  - "Rungs 2 and 3 are ONE ancestor walk, not two, so the ladder can never climb past a `.git` boundary and adopt a parent directory's `package.json`"
  - "An alias is refused unconditionally — including when its target is inside the canonical root — because only unconditional exclusion makes 'adding a link changes nothing' true without a traversal-order tie-break"
  - "A repeated canonical root inside one recursion throws by name rather than being skipped, so a future ladder change that undoes the pin fails loudly"

patterns-established:
  - "Digested vocabulary contains only values the code produces: a declared-but-unreachable union member is a promise in a contract nothing keeps"
  - "A test that reproduces a non-termination defect runs under a hard timeout and fails loudly"
  - "An assertion on a discovered set carries a self-diagnosing failure message that re-derives the discovery from the still-present fixture"

requirements-completed: [DETC-01, DETC-03]

coverage:
  - id: D1
    description: "Every `project` verb terminates on a git repository containing a nested manifest, each observed under a 30000 ms hard timeout"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#project plan terminates on a git root holding a nested manifest and lists both members"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#project status and project approve --apply both terminate on a git root holding a nested manifest"
        status: pass
    human_judgment: false
  - id: D2
    description: "A descended sub-project's plan carries the member's own dependency evidence, not the repository root's, and reports `rootReason: project-declaration`"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a sub-project planned from a git root carries its own evidence, not the repository root's"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a caller that names the git root reports explicit-override, which a descent never does"
        status: pass
    human_judgment: false
  - id: D3
    description: "A repeated canonical root inside one recursion is a named refusal, and a descended member describes its members once without fanning out"
    requirement: DETC-01
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a canonical root repeated inside one recursion is a named refusal rather than another scan"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a descended member describes its own members once and does not fan out"
        status: pass
    human_judgment: false
  - id: D4
    description: "A directory alias added inside the canonical root changes neither the collected fact set nor the pack selection, in either sort position, and the exclusion record names what the alias pointed at"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#an alias beside its target is excluded and the real directory survives"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#an alias sorting after its target produces the identical scan as one sorting before it"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#adding a directory alias inside the canonical root changes neither the fact set nor the selection"
        status: pass
    human_judgment: false
  - id: D5
    description: "Link-cycle termination is preserved after the alias refusal, asserted under a hard bound"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#a self-referential directory link still terminates the walk"
        status: pass
    human_judgment: false
  - id: D6
    description: "Path strings enter the scan as the filesystem reported them, with no Unicode normalization of alpha-AOS's own: NFD and NFC directory names are two entries and two digest inputs"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#two directories named in NFD and NFC form are two scan entries and two digest inputs"
        status: pass
    human_judgment: false
  - id: D7
    description: "Two overlapping `project plan` reads exit 0, are byte-identical, and leave no `.alpha-aos` residue"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#two concurrent project plan invocations are byte-identical"
        status: pass
    human_judgment: false
  - id: D8
    description: "An aliased FILE adds no second path for the file it points at"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/evidence.test.ts#an aliased FILE adds no second path for the file it points at"
        status: unknown
    human_judgment: true
    rationale: "Skipped on this host with a stated reason: Windows requires elevation to create file symlinks (directory junctions do not). The directory-alias half of the same rule runs and passes here; the file half needs a POSIX host or an elevated Windows run, which is the Phase 7 three-OS matrix. Recorded open in .planning/WINDOWS.md."

# Metrics
duration: 45 min
completed: 2026-09-08
status: complete
---

# Phase 02 Plan 11: Terminating monorepo planning and alias-proof evidence Summary

**A canonical-root ladder that pins the root it descended to — so all four `project` verbs terminate on a git repository holding a nested manifest — plus an `alias-entry` refusal that stops a junction evicting or impersonating the real directory it points at.**

## Performance

- **Duration:** 45 min
- **Started:** 2026-09-08T07:40:00Z (approx; first task commit 2026-09-08T07:41:33Z)
- **Completed:** 2026-09-08T08:25:23Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- **CR-01 closed.** `resolveCanonicalRoot` climbed to the `.git` root for ANY input path, so `planSubProject`/`describeSubProjects` undid their own descent, re-discovered the same members, and no `project` verb terminated on a monorepo. Descent now pins the member as the canonical root, carries a visited-root set that throws by name on re-entry, and suppresses member description one level down.
- **CR-02 closed.** The walk marked a directory's identity by its CANONICAL target at the moment it was LISTED, in ascending name order, so a junction `aaa -> src` claimed `src`'s identity and the real `src` was dropped as already-visited. An alias is now refused immediately after the boundary proof and before any identity marking, for file entries as well as directory entries.
- **WR-11 closed.** `worktree-root` and `submodule-root` are gone from `RootReason`. The union now contains only members the code produces, which matters because `scope.rootReason` folds into `planDigest` and D-10 commits an approved plan under `.alpha-aos/`.
- **Two hard-timeout test runners.** `runCliBounded` (CLI, SIGKILL at 30000 ms) and `boundedScan` (in-process walk, `Promise.race`) mean a non-termination regression is a red assertion on `timedOut`, never a stalled CI job (T-02-43).
- **Test total 382 → 394**, `fail 0`, 6 skipped (5 pre-existing host-capability skips plus one new, each with a stated reason). **394 is the floor sibling plan 02-12 gates against.**

## Task 1 decision — recorded verbatim

The user selected **option-a**, with the secondary answer **remove**:

> 1. Implement the `project-declaration` rung ABOVE `git-root` in the canonical-root ladder. Final ladder, highest priority first:
>    1. `explicit-override` — the caller named this root
>    2. `project-declaration` — a project-declaration file (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, and whichever others the plan/catalog already recognise) marks this directory
>    3. `git-root`
>    4. `standalone-directory`
> 2. A descent (`planSubProject` / `describeSubProjects` recursing into a workspace member) reports `rootReason: "project-declaration"`, NOT `"explicit-override"` — so a reviewer reading a plan can tell a root the tool descended to apart from a root the user typed.
> 3. **Remove** `worktree-root` and `submodule-root` from the `RootReason` union. Rationale accepted by the user: `isGitBoundary` already tests `existsSync(join(dir, ".git"))`, which catches the `.git` *file* form used by linked worktrees and submodules, so `git-root` already covers those behaviourally. The union must contain only members the code actually produces — no dead members ride into `planDigest`. This is the direct response to WR-11.
> 4. Accepted consequence, which you must NOT treat as a regression: `alpha-aos project plan /repo/packages/web` now targets `/repo/packages/web` instead of `/repo`. This is a deliberate behaviour change that closes D-01's stated contract ("Running inside a sub-project targets that sub-project"). Update any existing test or fixture that encodes the old behaviour, and call the change out explicitly in SUMMARY.md under deviations/decisions.

The chosen values are contract: `scope.rootReason` folds into `planDigest`, and approved plans are committed under `.alpha-aos/` per D-10.

## Observed pre-fix failure output

**CR-01 — the timeout assertion.** Against the tree at `c2cb645`, with the RED tests committed at `a71769c`:

```
✖ project plan terminates on a git root holding a nested manifest and lists both members (30541.0451ms)
  AssertionError: project plan did not terminate on a git root holding a nested manifest
  true !== false
✖ a sub-project planned from a git root carries its own evidence, not the repository root's (30506.5242ms)
  AssertionError: project plan --project packages/web did not terminate
✖ project status and project approve --apply both terminate on a git root holding a nested manifest (30506.8921ms)
  AssertionError: project status did not terminate
ℹ fail 3
```

An independent probe on the same fixture, `.git` present versus removed:

```
WITH .git    -> {"status":null,"timedOut":true,"stdoutBytes":0}
WITHOUT .git -> {"status":0,"timedOut":false,"stdoutBytes":1823}
```

**CR-02 — the selection-set assertion.** Against the tree with the RED tests committed at `24d8d25`:

```
✖ an alias beside its target is excluded and the real directory survives
  AssertionError: the alias evicted the real directory — actual: false, expected: true
✖ an alias sorting after its target produces the identical scan as one sorting before it
  AssertionError: an alias before its target changed the walk — actual: [ 'aaa' ], expected: [ 'src' ]
✖ adding a directory alias inside the canonical root changes neither the fact set nor the selection
  AssertionError: an alias sorting BEFORE its target changed the selection
    actual:   [ 'WEB_REACT' ]
    expected: [ 'BROWNFIELD_INIT', 'WEB_BASE', 'WEB_REACT' ]
ℹ fail 4
```

An independent probe showing the outcome turns on name order alone:

```
no alias  selected: ["BROWNFIELD_INIT","WEB_BASE","WEB_REACT"]
aaa alias selected: ["WEB_REACT"]
zzz alias selected: ["BROWNFIELD_INIT","WEB_BASE","WEB_REACT"]
```

## Task Commits

1. **Task 1: canonical-root ladder decision** — no code commit; the decision is recorded verbatim above and implemented and asserted by name in Task 2 (`e5d72b6`, `test/project-plan.test.ts` asserts `scope.rootReason === "project-declaration"` for a descent and `"explicit-override"` for a caller-named root).
2. **Task 2: end-to-end "plan a monorepo"** — `a71769c` (test, RED) → `e5d72b6` (feat, GREEN)
3. **Task 3: an alias can neither evict nor impersonate** — `24d8d25` (test, RED) → `c157ae5` (feat, GREEN) → `c313110` (test, bounded link-cycle assertion)

## Files Created/Modified

- `src/core/evidence.ts` — `RootReason` narrowed to four produced members; new `RootPin` type; `isProjectDeclarationBoundary`; `resolveCanonicalRoot` gains the `project-declaration` rung and a `pin` parameter; `BoundaryReason` gains `alias-entry`; the scan loop refuses aliases before identity marking; `identityKeys` takes `isAlias` and reads the entry's own identity with `lstat`.
- `src/core/project-plan.ts` — `PlanProjectCapabilitiesOptions` gains `explicitRoot`, `rootPin`, `visitedRoots`, `describeMembers`; a visited-root cycle guard that throws by name; `descentOptions` centralises what a descent runs under; `planSubProject` and `describeSubProjects` pin `member.absolute`.
- `test/project-plan.test.ts` — `runCliBounded`, `TERMINATION_BUDGET_MS`, `gitWorkspaceFixture`, `discoveryDiagnostics`, `aliasSelectionFixture`; seven new tests; the `standalone-directory` assertion updated to `project-declaration`; the concurrency test now asserts no `.alpha-aos` residue.
- `test/evidence.test.ts` — `boundedScan`, `aliasFixture`; four new tests (directory alias, sort-position invariance, file alias, NFD/NFC); the link-cycle test bounded and its reason updated to `alias-entry`.

## Decisions Made

- **The `project-declaration` and `git-root` rungs share ONE ancestor walk.** The plan's action text read as two sequential walks ("before the git-root loop, walk the ancestor chain..."). Implemented literally, a repository whose root carries no declaration file would climb PAST its own `.git` boundary and adopt an unrelated `package.json` in a parent directory — the ladder could leave the repository it started inside, which is precisely the "borrowing another project's evidence" prohibition this phase exists to enforce. One interleaved walk gives the required precedence (a declaration outranks a git entry at the same directory; a deeper declaration outranks an ancestor git root) while making a git boundary end the climb whether or not it answered.
- **A new `rootPin` option carries the descent's reason.** The plan's acceptance criteria require `explicitRoot` to be passed as `resolveCanonicalRoot`'s second argument, and the Task 1 decision requires the descent to report `project-declaration` rather than the `explicit-override` that argument produces. `rootPin: "caller" | "descent"` separates *pinning* from *reason*, so both hold: a caller-named root still reports `explicit-override` (now genuinely reachable through `PlanProjectCapabilitiesOptions.explicitRoot`, and covered by a test), and a descent reports `project-declaration`.
- **An alias is refused unconditionally**, including when its target is inside the canonical root, and for files as well as directories. The review's alternative — admit an alias whose target the walk did not otherwise reach — was rejected as the plan directed: it leaves the outcome dependent on traversal order and leaves a repository able to add evidence to itself by adding a link.
- **The cycle guard throws rather than skips.** A silent skip would let a future ladder change reintroduce the climb and produce a plan that scanned one directory twice; a throw naming the repeated root makes that a loud failure.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The ladder could climb out of the repository it started inside**
- **Found during:** Task 2
- **Issue:** The plan's action text specifies the `project-declaration` rung as a separate walk placed "before the git-root loop". Two sequential walks over the ancestor chain mean a repository whose root carries no project-declaration file (a Go repo without a root `go.mod`, a Python repo without root `pyproject.toml`) would keep climbing past its own `.git` and answer with an unrelated `package.json` in a parent directory — planning a scope that includes the user's whole home directory.
- **Fix:** One interleaved ancestor walk. At each ancestor, a declaration answers first; a `.git` entry answers second; either ends the climb. Precedence is unchanged from the decision.
- **Files modified:** `src/core/evidence.ts`
- **Verification:** `npm run check`; the git-workspace fixture (root carries `package.json`) reports `project-declaration`, and `test/evidence.test.ts`'s existing git-boundary suites still resolve their repository roots correctly.
- **Committed in:** `e5d72b6`

**2. [Rule 2 - Missing Critical] An existing fixture encoded the old root reason**
- **Found during:** Task 2
- **Issue:** `test/project-plan.test.ts` asserted `scope.rootReason === "standalone-directory"` for a fixture carrying a `package.json`. Under the decided ladder that directory is a project in its own right.
- **Fix:** Updated to `project-declaration`, with a comment stating that `standalone-directory` now means what it says: neither a declaration nor a git entry, anywhere above. This is the Task 1 decision's point 4 in effect and is NOT a regression.
- **Files modified:** `test/project-plan.test.ts`
- **Committed in:** `e5d72b6`

**3. [Rule 2 - Missing Critical] The existing link-cycle test's reason changed and its termination was unasserted**
- **Found during:** Task 3
- **Issue:** `loop -> workspace` is an alias, so it is now refused one rung earlier with `alias-entry` instead of `visited-identity`. Separately, a test whose stated property is TERMINATION was asserting it by simply completing, which would stall the suite on a regression rather than fail it.
- **Fix:** Reason updated with a comment stating that termination — the property under test — is unchanged. Added `boundedScan`, which races the walk against a 30000 ms timer.
- **Files modified:** `test/evidence.test.ts`
- **Verification:** `node --test dist/test/evidence.test.js` — `fail 0`
- **Committed in:** `c157ae5`, `c313110`

**4. [Rule 2 - Missing Critical] A discovered-set assertion that could not explain its own failure**
- **Found during:** Task 2
- **Issue:** One full-suite run failed `project plan terminates on a git root...` with `subProjects` listing only `packages/api`. A bare `deepEqual` says only that a member is absent, and an absence here has at least four distinct causes (scan exclusion, a reached bound, a glob that did not match, or an unreadable declaration file reported as an absent one).
- **Fix:** Added `discoveryDiagnostics`, which re-derives the scan and the discovery from the still-present fixture and puts the directories, excluded boundaries, bounds, declarations and dropped-member reasons into the assertion message.
- **Files modified:** `test/project-plan.test.ts`
- **Committed in:** `e5d72b6`
- **Note:** The failure itself was NOT reproduced — see Issues Encountered.

### Scope-down from an acceptance criterion

**Task 3's Unicode criterion**, as written, asks that two NFD/NFC-named directories "yield two different `digestableEvidence` inputs". `digestableEvidence` projects only `[factId, detected, path, version]`, and no fact in `catalog/facts.yaml` has a non-ASCII declared name, so a `café` directory contributes to no fact and cannot move that particular projection whatever the fix. The test asserts the contract the criterion is protecting — **alpha-AOS applies no normalization of its own** — on the value that actually carries it: the two forms are two distinct entries in `scan.paths`, byte-preserved (proved by `paths.filter(p => p.normalize("NFC") === …).length === 2`), and a sha256 over `scan.paths` differs from the same fixture holding only one form. `scan.paths` is the input every path predicate and path-bearing fact is decided from. The cross-host NFD-vs-NFC case remains deferred to Phase 7, unchanged.

---

**Total deviations:** 4 auto-fixed (1 bug, 3 missing-critical) and 1 documented scope-down.
**Impact on plan:** No scope creep. Deviation 1 prevents a scope-escape the decided ladder would otherwise have introduced; 2 and 3 are the decided behaviour change landing in fixtures that encoded the old one; 4 converts a future mystery into a self-explaining failure.

## Issues Encountered

**One unreproduced failure of the CR-01 regression.** The first full `npm test` after the CR-01 fix reported `fail 1`: `project plan terminates on a git root holding a nested manifest and lists both members`, with `actual: [ 'packages/api' ]`, `expected: [ 'packages/api', 'packages/web' ]`, in 2549 ms — i.e. the verb TERMINATED (the defect this plan closes stayed closed) but one workspace member was missing from the listing. It has not recurred in:

- 4 consecutive full `npm test` runs on the same bytes,
- 200 parallel in-process `scanProjectTree` iterations on the fixture shape,
- 64 parallel CLI-spawn iterations on the full fixture including `git init`/commit,
- 480 parallel in-process `discoverSubProjects` iterations under deliberate temp-tree churn contention.

The one silent path that could produce it is `ProjectReadCache.read`'s blanket `catch { text = null }`: a transient read failure on `packages/web/package.json` becomes `declarationFileIn(...) === null`, which `acceptCandidate` reports as "the directory contains no project-declaration file" — an absence where the truth is an unreadable file. That is a hypothesis, not a diagnosis; no evidence for it was obtained, and fixing an unconfirmed cause would be worse than naming it. It is not silently dropped: `discoveryDiagnostics` is now wired into the assertion so any recurrence reports the scan's directories, excluded boundaries, bounds, declarations and dropped-member reasons; and the item is recorded **open** in `.planning/WINDOWS.md` as a `deviation` entry for phase 02. The read-honesty question (an unreadable input must never be reported as an absent one) belongs to plan 02-13 Task 3, which already owns the general negative-reason invariant.

## Known Stubs

None.

## Skipped verification

- `test/evidence.test.ts` — *an aliased FILE adds no second path for the file it points at*: **skipped with a stated reason** on this host. Windows requires elevation to create file symlinks; directory junctions do not, so the directory half of the same rule runs and passes here. Recorded open in `.planning/WINDOWS.md`.

## Threat Flags

None. No new network endpoint, auth path, file-access pattern or schema change at a trust boundary was introduced. The threat register's four entries for this plan are all `mitigate` and all mitigated: T-02-40 (pinned root + named cycle refusal + one-level description + hard-timeout regression), T-02-41 (alias refused before identity marking, never contributing the canonical key), T-02-42 (partially — the alias no longer evicts its target; the general invariant remains 02-13's), T-02-43 (`runCliBounded`/`boundedScan` kill and assert rather than stall).

## Verification

- `npm run check && npm run build && node --test dist/test/project-plan.test.js dist/test/evidence.test.js` — exit 0, `fail 0`.
- `npm test` — exit 0, **`tests 394`, `pass 388`, `fail 0`, `skipped 6`**. Strictly greater than the 382 floor. **394 is the floor plan 02-12 gates against.**
- Every regression added by this plan was observed FAILING against the tree before its fix; the failing output for both the CR-01 timeout assertion and the CR-02 selection-set assertion is transcribed above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- CR-01 and CR-02 are closed; phase truth 1 ("every `project` verb terminates on the monorepo shape D-01 and D-02 exist to serve") is now reachable and asserted under a hard timeout.
- Plan 02-12's test-count floor is **394**, not 382.
- Plan 02-13 Task 3 inherits two live threads: the general "a negative reason must be true" invariant (T-02-42), and the read-honesty case named in Issues Encountered — an unreadable declaration file currently reports as an absent one.
- Phase 7 inherits, unchanged: cross-host NFD/NFC path-digest equality, and the file-alias case that needs a POSIX host or an elevated Windows run.

## Self-Check: PASSED

- All four modified source/test files exist on disk.
- All five task commits plus the metadata commit exist in `git log`: `a71769c`, `e5d72b6`, `24d8d25`, `c157ae5`, `c313110`, `78ed189`.
- Plan-level `<verification>` re-run at close-out: `npm test` — `tests 394`, `fail 0`.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-08*
