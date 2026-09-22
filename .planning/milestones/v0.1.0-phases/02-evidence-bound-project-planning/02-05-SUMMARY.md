---
phase: 02-evidence-bound-project-planning
plan: 05
subsystem: api
tags: [evidence, path-boundary, gitignore, monorepo, workspaces, glob, node-test, git-fixtures]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's canonical root ladder (resolveCanonicalRoot, CanonicalRoot) and the exported canonicalizeWithMissingTail it travels through"
  - phase: 02-evidence-bound-project-planning
    provides: "02-03's src/core/ignore-list.ts — loadIgnoreRules / isIgnored with git-faithful ancestor-first semantics and the fail-closed undecidable verdict"
  - phase: 02-evidence-bound-project-planning
    provides: "02-04's recorded npm test total (241), which this plan's suite floor is measured against"
  - phase: 01-safe-operation-boundary
    provides: "provePathBoundary / PathProof containment proofs, D-01 fail-closed refusal discipline, and the strict parseManagedDocument JSON/YAML/TOML routes"
provides:
  - "scanProjectTree: a bounded, boundary-proven walk stopping at nested repository, worktree, submodule, .gitmodules-declared and vendored boundaries (src/core/evidence.ts)"
  - "excludedBoundaries and a bounds record, so a reached bound is a reported condition rather than a silent truncation"
  - "readWorkspaceDeclaration across five ecosystems (npm/yarn/bun, pnpm, Cargo, go.work, uv) through the strict document routes"
  - "discoverSubProjects: declaration-first ordering with the fallback scan as a permanent safety net, and a named-never-guessed target"
  - "ProjectReadCache: one read cache keyed by canonical path, shared across sub-projects"
  - "test/helpers/git-fixture.ts: builders for all four real git shapes, network-refusing and host-identity-independent"
affects: [02-06, 02-07, 02-08, 02-09, 02-10, phase-3-capability-materialization]

actuals:
  tokens: 22091
  tasks: 3
  commits: 7
plan_head_before: 2d82ce67f01f7f09524ee03d900a91d18f4342ae

tech-stack:
  added: []
  patterns:
    - "Boundary stop by EXISTENCE of a `.git` entry of either kind, with `.gitmodules` as an independent second source"
    - "Prove-before-read: every path is boundary-proven against the canonical root before it is stat-followed or opened"
    - "Two-key visited identity: the followed (device, inode) plus the canonical path from the proof"
    - "Declaration-first, scan-always: a declaration decides ordering and naming, reality decides existence, and neither can hide the other"
    - "A bounded glob subset (`*`, `?`, `**`) compiled to a RegExp over relative POSIX paths, with unsupported constructs matched literally rather than approximated"
    - "Test fixtures built by the real tool: every git shape comes from git itself, never from a hand-assembled `.git` file"

key-files:
  created:
    - test/helpers/git-fixture.ts
    - test/evidence.test.ts
  modified:
    - src/core/evidence.ts

key-decisions:
  - "The `.git` existence test is asked BEFORE the `.gitmodules` declaration, so an initialized submodule reports the precise `git-entry` reason and the declaration covers exactly what existence misses"
  - "The visited set carries two keys per directory — the followed (device, inode) and the canonical path from the proof — because neither alone terminates every cycle"
  - "The fallback scan runs ALWAYS, not only when no declaration exists, but it honours every declaration's exclusion patterns and never descends into an already-accepted sub-project"
  - "A literal declaration entry is resolved and boundary-proven rather than syntactically rejected, so `../../..` yields a boundary refusal code instead of a generic parse complaint"
  - "Cargo `default-members` is carried for reporting but does not decide membership — it narrows what Cargo builds by default, not what the workspace contains"
  - "The glob subset is `*`, `?` and `**` only; character classes and brace alternation are matched literally rather than approximated"

patterns-established:
  - "Prove-before-read: a path is proven with provePathBoundary against the canonical root before any stat that follows a link, so an escaping junction is refused without the target ever being touched"
  - "Reported bounds: reaching MAX_SCAN_DEPTH / MAX_SCAN_ENTRIES / MAX_SUB_PROJECTS produces a named record, never a shortened result that looks complete"
  - "Additive declarations: a workspace declaration is evidence, not a replacement for reality; a failing member is one reported line with a reason, and the scan still runs"
  - "Real-tool fixtures: a boundary rule is proven against what the tool actually produces, not against a mental model of it"

requirements-completed: [DETC-01]

coverage:
  - id: D1
    description: "Detection stops at a nested ordinary repository, a linked worktree, a submodule, and a `.gitmodules`-declared path with no `.git` entry yet — all four proven against shapes git itself built"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#the scan excludes every path under a nested ordinary repository"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#the scan excludes a linked worktree, whose .git is a file rather than a directory"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#the scan excludes a submodule, whose .git is a file rather than a directory"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#the scan excludes a .gitmodules-declared path that has no .git entry yet"
        status: pass
    human_judgment: false
  - id: D2
    description: "A directory link resolving outside the canonical root is refused, and the outside sentinel is neither scanned nor touched"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#a directory link resolving outside the canonical root is refused and its sentinel is never read"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a self-referential directory link terminates the walk on visited identity"
        status: pass
    human_judgment: false
  - id: D3
    description: "Reaching a scan bound is a named, reported condition rather than a silent truncation, and an undecidable ignore decision excludes the path with its reason"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#exceeding MAX_SCAN_DEPTH is reported as a named bound rather than a silent truncation"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a path whose ignore decision is undecidable is excluded with its reason"
        status: pass
    human_judgment: false
  - id: D4
    description: "Ignore-list membership decides what is scanned, and it decides identically in a directory that is not a git repository at all (D-04)"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#an ignore-list matched path is not scanned in a directory that is not a git repository"
        status: pass
    human_judgment: false
  - id: D5
    description: "Each of the five workspace declarations expands to its expected member set, including pnpm's negated glob, Cargo's and uv's `exclude`, a virtual Cargo workspace, and go.work's literal `use` semantics"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#package.json workspaces globs expand to the declared members"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#pnpm-workspace.yaml packages expands and a negated entry removes a matched member"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#Cargo.toml workspace members expand, exclude removes, and a virtual workspace is handled"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#go.work use entries are literal directories and a subdirectory of one is not a member"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#pyproject.toml uv workspace members expand and exclude removes"
        status: pass
    human_judgment: false
  - id: D6
    description: "A declared member that escapes the canonical root or does not exist is reported with a reason and dropped, and the fallback scan still finds the undeclared member (D-02)"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#a workspaces entry escaping the canonical root is reported and dropped, and nothing outside is read"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a declaration listing a non-existent member reports the drop and the fallback still finds the undeclared one"
        status: pass
    human_judgment: false
  - id: D7
    description: "Running from a repository root lists the sub-projects and selects none; the user names the target, and an unrecognised target is a refusal naming the discovered options (D-01)"
    requirement: DETC-01
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#an explicit target that is not among the discovered sub-projects is refused with the options named"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#no target from a repository root returns the sub-project list with none selected"
        status: pass
    human_judgment: false
  - id: D8
    description: "The four real git shapes can be built on demand in a test, and the helper reports git's absence as a named skip reason rather than an absent case"
    verification:
      - kind: integration
        ref: "test/evidence.test.ts#an ordinary repository fixture produces a .git directory"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a nested git init inside a working tree produces a .git directory the parent reports as untracked"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a linked worktree produces a .git file carrying a gitdir pointer"
        status: pass
      - kind: integration
        ref: "test/evidence.test.ts#a submodule produces a .git file and a .gitmodules entry at the superproject root"
        status: pass
    human_judgment: false
  - id: D9
    description: "The `--project <rel>` targeting semantics and the reported sub-project list read correctly to a user — DETC-01's requirement intent for the canonical-root ladder's rung ORDER is a flagged planner assumption the tests cannot confirm"
    requirement: DETC-01
    verification: []
    human_judgment: true
    rationale: "The plan's own verification section records an unclassified edge-probe row against DETC-01: whether the ladder's rung order (explicit override, then git root, then project declaration, then standalone directory) is the ordering the requirement INTENDS is not establishable from any source artifact. Passing tests prove the implemented ordering, not the intended one, so a human must confirm the intent."

# Metrics
duration: 38 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 05: Boundary-proven tree scan and sub-project discovery Summary

**A bounded walk that refuses to leave the canonical root — proven against all four real git shapes, an escaping junction whose sentinel is provably untouched, and a self-referential link that terminates on identity — plus five-ecosystem workspace discovery where the declaration decides ordering and reality decides existence.**

## Performance

- **Duration:** 38 min
- **Started:** 2026-09-07T16:11:00Z
- **Completed:** 2026-09-07T16:49:00Z
- **Tasks:** 3
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- **The boundary rule is proven against reality, not against a mental model.** `test/helpers/git-fixture.ts` builds an ordinary repository, a linked worktree, a submodule and a nested `git init` with git itself. The two shapes an `isDirectory()` test walks into — the worktree and the submodule, whose `.git` is a FILE — are now the two the suite exercises hardest. Both fixtures were confirmed on Git 2.55.0 on Windows, including the `protocol.file.allow=always` that `git submodule add` from a local path has needed since CVE-2022-39253.
- **Every path the walk reads is proven before it is touched.** `scanProjectTree` runs `provePathBoundary` against `allowedRoots: [canonicalRoot]` before any `stat` that follows a link, so a junction pointing outside is refused while the thing it points at is never opened. The test asserts the outside sentinel's mtime AND size are byte-identical across the scan, not merely that its path is absent from the result.
- **The walk terminates on structure.** A `(device, inode)` visited set plus the canonical path from the boundary proof catches `loop -> .` on first encounter, and `MAX_SCAN_DEPTH` / `MAX_SCAN_ENTRIES` / `MAX_SUB_PROJECTS` each produce a named `bounds` record. A reached bound is a reported condition; a truncated scan that looks complete is a wrong answer that still looks like a decision.
- **Ignore-list membership decides scannability, in a git repository and in a plain directory alike.** The walk maintains a deepest-first `IgnoreRuleSet` chain as it descends and routes every question through 02-03's `isIgnored`. An `undecidable` verdict excludes the path and records the shape that stopped it — Phase 1's D-01, carried through a second consumer.
- **Sub-project discovery honours the ecosystem and refuses to trust it.** All five declarations parse through the strict routes (duplicate-key-rejecting JSON, the existing YAML and TOML routes, a bounded line reader for `go.work` with its byte length capped first). Globs expand and then each result is boundary-proven; `workspaces: ["../../.."]` is reported and dropped before anything under it is read. A stale entry is one reported line, and the fallback scan still finds the real member it would otherwise have hidden.
- **The suite grew from 241 to 263 with `fail 0`**, and the two suites this traversal could plausibly regress — `path-boundary` and `preview` — stayed at `fail 0` before and after.

## Task Commits

1. **Task 1: `test/helpers/git-fixture.ts` — the four real git shapes** — `4300fcc` (test)
2. **Task 2: Bounded, boundary-proven tree scan** (TDD)
   - RED — `8b25ccc` (test) — nine behaviours; `tests 13, pass 4, fail 9`, verdict `RED_EVIDENCE_OK`
   - GREEN — `9ac7606` (feat) — `scanProjectTree`, the bound constants, `excludedBoundaries`
3. **Task 3: Sub-project discovery** (TDD)
   - RED — `34532d7` (test) — nine behaviours; `tests 22, pass 13, fail 9`, verdict `RED_EVIDENCE_OK`
   - GREEN — `8fa28de` (feat) — `readWorkspaceDeclaration`, `discoverSubProjects`, `ProjectReadCache`
4. **Deviation fix** — `aa0a1c3` (fix) — the literal NUL byte in `ReadLedger.digest`

**Plan metadata:** the `docs(02-05): complete boundary-proven scan and sub-project discovery plan` commit carrying this file. `commits: 7` is `git rev-list --count 2d82ce6..HEAD`, the same instrument `/gsd-verify-work` uses.

_Note: TDD tasks produced two commits each (test → feat). Neither needed a REFACTOR commit; the optional gate was not exercised._

## Files Created/Modified

- `test/helpers/git-fixture.ts` (new, 359 lines) — `createOrdinaryRepository`, `createLinkedWorktree`, `createSubmodule`, `createNestedRepository`, plus a memoized `gitAvailability()` probe. Each builder returns evidence — the created path, the `.git` entry kind and pointer text, the git invocations that produced it, the superproject `.gitmodules` path, and the parent's own `git status` line — rather than a boolean. `FORBIDDEN_GIT_SUBCOMMANDS` is enforced by the runner, so no future edit can quietly add a `clone <url>` or a `fetch`. Every fixture repository carries a local git identity, so a commit does not depend on the host's global config.
- `test/evidence.test.ts` (new, 558 lines) — 22 cases: 4 fixture-correctness, 9 boundary/traversal, 9 discovery. Skipped fixtures are pushed onto a `notRun` list and printed at suite end, so a case that could not run is visible rather than absent.
- `src/core/evidence.ts` (+~38 KB) —
  - `scanProjectTree(root, options)` returning `paths` / `directories` / `files`, `excludedBoundaries`, `bounds` and `entriesSeen`.
  - `MAX_SCAN_DEPTH` (12), `MAX_SCAN_ENTRIES` (50000), `MAX_SUB_PROJECTS` (64), `VENDORED_BOUNDARY_DIRECTORIES`.
  - `readWorkspaceDeclaration(root, options)` and `discoverSubProjects(root, options)`.
  - `ProjectReadCache`, keyed on the canonical path so two aliases of one file are one entry.
  - Types `ScanBound`, `ExcludedBoundary`, `ProjectTreeScan`, `BoundaryReason`, `WorkspaceDeclaration`, `WorkspaceEcosystem`, `DroppedMember`, `SubProject`, `SubProjectDiscovery`, and `PROJECT_DECLARATION_FILES`.

## Decisions Made

1. **`.git` existence is asked before the `.gitmodules` declaration.** An initialized submodule satisfies both sources, and this order reports the more precise `git-entry` reason while leaving the declaration to cover exactly what existence misses — a submodule declared but not yet initialized. The RED tests caught the opposite order: the submodule case reported `declared-submodule` where `git-entry` was the better answer.
2. **The visited set carries two keys per directory.** `lstat` of a link is the LINK's own identity, so two distinct links onto one real directory never collide, and some Windows filesystems report inode `0` (no identity at all). The canonical path from the boundary proof closes both cases and catches `loop -> .` on the first encounter, which is why the plan's "(device, inode) from `lstat`" is implemented as followed-identity **plus** canonical path rather than either alone.
3. **The fallback scan runs always, not only when no declaration exists.** D-02's guarantee that a stale entry cannot hide a real sub-project only holds if the scan is unconditional. Two constraints keep that from undoing the declaration: the fallback applies the same exclusion matchers (an explicit `exclude` is a deliberate statement, not an omission), and it never descends into an already-accepted sub-project (which is exactly what makes `go.work`'s "`use` does not include subdirectories of its argument" hold for the fallback too).
4. **A literal declaration entry is resolved and boundary-proven, not syntactically rejected.** Refusing `../../..` on the string alone would report a parse complaint. Resolving it and handing it to `provePathBoundary` reports the real containment code — which is the honest reason, and the one the `workspaces: ["../../.."]` fixture asserts on.
5. **Cargo `default-members` is carried but does not decide membership.** It narrows what Cargo builds by default, not what the workspace contains. It is recorded on the declaration for reporting so a later plan can use it for ordering without re-reading the file.
6. **The supported glob subset is `*`, `?` and `**`, and nothing else.** No documented example in any of the five ecosystems uses character classes or brace alternation, and quietly accepting a construct we match *wrongly* is worse than matching it literally. The subset is compiled to a RegExp over relative POSIX paths with a 512-character pattern cap.
7. **`VENDORED_BOUNDARY_DIRECTORIES` is declared with a comment stating it is a boundary heuristic and NOT the ignore rule.** It can only ever stop the walk; it never grants scannability to anything the ignore list excluded. D-04 is explicit that ignore-list membership decides what is scanned, so the vendored stop is narrow and strictly additive.
8. **`excludedBoundaries` is carried in the value and never printed.** D-03's exclusion is silent by decision; the "N separate repositories were excluded" notice is an explicitly deferred idea and was not built.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A literal NUL byte in `src/core/evidence.ts` made the file binary to git**

- **Found during:** Task 3 (post-commit verification, while measuring the realized diff)
- **Issue:** `ReadLedger.digest` joined each ledger line with a **literal NUL byte** embedded in the source file rather than an escape. Git therefore classified `src/core/evidence.ts` as binary and rendered every diff of it as `Bin 8577 -> 46370 bytes`. The file this phase keeps extending — and this plan's own ~1000-line change to it — was unreviewable. Pre-existing: the byte is present at `2d82ce6`, introduced in 02-01.
- **Fix:** Kept the separator exactly as it was (a path can contain a space and cannot contain a NUL, so it is the right choice) and changed only its **spelling** to the six-character escape. `src/core/evidence.ts` is the only file in `src/`, `test/` or `scripts/` that contained a NUL; a repository-wide scan confirmed it.
- **Files modified:** `src/core/evidence.ts`
- **Verification:** Byte-identity proven rather than asserted — `node dist/src/cli.js project plan . --json` before and after the edit reports identical `inputsDigest`, `evidenceDigest` and `planDigest`. `node --test dist/test/project-plan.test.js dist/test/evidence.test.js` reports `tests 26, pass 26, fail 0`.
- **Committed in:** `aa0a1c3`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No behaviour change — the emitted digest bytes are provably identical. It is recorded as a deviation rather than silently folded in because it touches a line no task in this plan owns. No scope creep: one character class, one file, one commit.

## Issues Encountered

- **The RED gate for both TDD tasks needed a signature-only stub.** Under `strict` TypeScript a test importing a non-existent export fails to compile, and a build failure produces no TAP at all — which classifies as `fixture_or_load_failure` (INVALID_RED) and would not authorize GREEN. Both stubs returned empty results, so every target test failed on its own assertion diff. Each test carries a *positive* assertion alongside its negative one for the same reason: `assert.equal(scan.paths.includes("keep.txt"), true)` fails against an empty stub, whereas "path X is absent" would have passed against it and produced a vacuous RED.
- **RED evidence had to be captured with `--test-reporter=tap`.** `gsd-tools check tdd-red-evidence` parses TAP and Node's default `--test` reporter is not TAP; the default-reporter capture misclassifies as `zero_tests_discovered`. This is the same friction 02-03 recorded. No test changed — only the capture invocation.
- **`git submodule add` from a local path needs `protocol.file.allow=always`** on Git 2.38+ (CVE-2022-39253). It is set per invocation, never written into a config file, and the source is always a local path.
- **`--no-hardlinks` was not passed.** It is a `git clone` flag, and no builder invokes `clone`; `git submodule add` clones internally and does not accept the flag. The plan's underlying intent — local paths only, never the network — is enforced instead by `FORBIDDEN_GIT_SUBCOMMANDS`, which refuses `clone`, `fetch`, `pull`, `push`, `remote` and `ls-remote` in the runner rather than by convention.
- **The Windows `EBUSY` flake noted in 02-04 did not recur** in any of the three full-suite runs during this plan.

## Known Stubs

None. Every exported function added by this plan is fully implemented and covered.

Two scope notes that are **not** stubs, recorded so they are not mistaken for gaps:

- `scanProjectTree` and `discoverSubProjects` are not yet wired into `collectProjectEvidence` or the CLI. The `--project <rel>` flag is assigned to plan 02-07 by this plan's own artifact table, and `collectProjectEvidence`'s remaining detector kinds to 02-02/02-06. Nothing in the shipped CLI path changed, which is why `project plan . --json` produces byte-identical digests before and after.
- The `context.skip`-with-named-reason fallback for a host without git or without symlink privileges is implemented and wired, but was not exercised: this host has Git 2.55.0 and can create junctions, so all 22 cases ran and 0 were skipped. The skip path is therefore latent rather than proven.

## Threat Flags

None. This plan introduced no network endpoint, no auth path, and no schema at a trust boundary. It reads only files inside the canonical root, and every one of them is boundary-proven first.

Threat-register mitigations applied and evidenced:

- **T-02-01 (Information Disclosure, high):** every read path is proven with `provePathBoundary` against `allowedRoots: [canonicalRoot]` before any link is followed. Proven by the outside-sentinel mtime **and** size assertion.
- **T-02-02 (Elevation of Privilege, high):** every declared member is boundary-proven BEFORE it is read; a member outside the canonical root is reported and dropped, never followed. Proven by the `workspaces: ["../../.."]` fixture, which also asserts the outside sentinel is untouched.
- **T-02-04 (Denial of Service, medium):** `MAX_SCAN_DEPTH`, `MAX_SCAN_ENTRIES`, `MAX_SUB_PROJECTS`, a two-key visited set, a 512-character glob pattern cap, and byte caps on `.gitmodules` (64 KiB), `go.work` (64 KiB) and every declaration read (1 MiB). A reached bound is a reported condition.
- **T-02-21 (Spoofing, high):** existence test of a `.git` entry of either kind, plus `.gitmodules` as an independent second source, with all four real shapes covered by git-built fixtures rather than assumed.
- **T-02-15 (Denial of Service, medium):** no `git` subprocess anywhere on this path. `grep -c "spawn\|exec" src/core/evidence.ts` returns 0; the boundary and ignore rules are filesystem-only and work in directories that are not repositories, which the D-04 case asserts directly.
- **T-02-06 (Tampering, medium):** every declaration goes through `parseManagedDocument` (the duplicate-key-rejecting JSON route, the existing YAML and TOML routes); `go.work` gets a bounded line reader with its size capped before the read; no parsed object is spread into a config object — values are read through a `branch()` accessor that never widens the shape.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | exits 0, no TypeScript error |
| `npm run build` | exits 0 |
| `npm run build:check` | `build artifact verified: 65 inputs, 124 outputs` |
| `node --test dist/test/evidence.test.js` | `tests 22, pass 22, fail 0, skipped 0` — above the 19-test floor |
| `node --test dist/test/path-boundary.test.js dist/test/preview.test.js` | `tests 35, pass 30, fail 0, skipped 5` (the 5 skips are pre-existing) |
| `npm test` | `tests 263, pass 258, fail 0, skipped 5` — strictly above the 241 recorded in 02-04-SUMMARY.md |
| `node dist/src/cli.js project plan . --json` | exits 0; `inputsDigest`, `evidenceDigest` and `planDigest` identical before and after the deviation fix |
| RED gate, Task 2 | `RED_EVIDENCE_OK` (`target_test_failed`; tests 13, pass 4, fail 9) |
| RED gate, Task 3 | `RED_EVIDENCE_OK` (`target_test_failed`; tests 22, pass 13, fail 9) |
| Fixtures not run | none — git 2.55.0 available, junction creation permitted; `notRun` is empty |
| `git diff --diff-filter=D` over the plan range | empty — no file was deleted |

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| Task 1 | — (not a TDD task) | `4300fcc` | — | n/a |
| Task 2 | ✓ `8b25ccc` (`RED_EVIDENCE_OK`) | ✓ `9ac7606` | — (not needed) | Pass |
| Task 3 | ✓ `34532d7` (`RED_EVIDENCE_OK`) | ✓ `8fa28de` | — (not needed) | Pass |

Both RED runs were persisted as evidence records and machine-verified with `gsd-tools check tdd-red-evidence`, captured with `--test-reporter=tap`. Neither GREEN phase needed a REFACTOR commit: Task 2's only iteration was the boundary-check reordering described in Decision 1, made before its GREEN commit, and Task 3 passed all nine cases on its first GREEN run.

## Flagged Planner Assumption (unresolved — surface at verification)

The plan's `<verification>` section records an **unclassified** deterministic edge-probe row against DETC-01 that this plan cannot resolve, repeated here so it is not lost:

> The probe could not classify what edge family DETC-01's "select one canonical project root" belongs to. The planner's assumption is that the canonical-root ladder's rung ORDER (explicit override, then git root, then project declaration, then standalone directory) is the complete decision procedure, and that a path matching two rungs always resolves to the earlier one.

That ordering is implemented and tested. **Whether it is the ordering the requirement intends is not something this plan could establish from any source artifact.** The passing tests are not confirmation of the requirement's intent — they confirm the implemented behaviour. This is carried into the SUMMARY's `coverage` block as `D9` with `human_judgment: true`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 02-06.** `scanProjectTree` gives the remaining detector kinds a bounded, proven, ignore-filtered path set to run over instead of each detector re-deriving containment. `ProjectReadCache` is the shared read seam they should route through.
- **Ready for 02-07.** `discoverSubProjects` returns the list and the refusal message; 02-07 wires `--project <rel>` to `options.target` and renders `dropped` as the one-line-per-member report. `excludedBoundaries` is already the value `--why` needs.
- **Two carried notes.**
  - `resolveCanonicalRoot` still implements two of six `RootReason` rungs (`git-root`, `standalone-directory`). The `worktree-root`, `submodule-root` and `project-declaration` rungs now have every primitive they need — the `.git` FILE detection and the project-declaration file list are both here — but wiring them is a change to the ladder itself, which no task in this plan owned. This was recorded as an open item by 02-01 and remains open.
  - `provePathBoundary` walks the full ancestor chain per entry, so the scan is O(depth) `lstat` calls per entry. Nothing in the shipped CLI path calls `scanProjectTree` yet, so there is no current regression, but 02-07 should measure before wiring it to a large repository rather than optimising on a guess.

## Self-Check: PASSED

- `test/helpers/git-fixture.ts` — FOUND on disk
- `test/evidence.test.ts` — FOUND on disk
- `src/core/evidence.ts` — FOUND on disk
- Commits `4300fcc`, `8b25ccc`, `9ac7606`, `34532d7`, `8fa28de`, `aa0a1c3` — all FOUND in `git log`
- Commit count measured from `plan_head_before` (`2d82ce6`) with `git rev-list --count`: 6 task commits plus this metadata commit

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*
