---
phase: 02-evidence-bound-project-planning
plan: 03
subsystem: api
tags: [gitignore, ignore, path-scanning, supply-chain, fail-closed, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's canonical project root ladder and boundary-proven traversal, which supplies the root the relative POSIX paths here are measured from"
  - phase: 01-safe-operation-boundary
    provides: "D-01 fail-closed refusal discipline and the ValidationIssue shape-only reporting convention (construct and length, never the value)"
provides:
  - "src/core/ignore-list.ts: loadIgnoreRules / isIgnored, a bounded ignore predicate that answers ignored | scannable | undecidable"
  - "Ignore-list membership as the scannability rule, working identically in a git repository and in a plain directory, with no subprocess"
  - "Deepest-first .gitignore precedence plus the gitignore(5) rule that a file cannot be re-included once a parent directory is excluded"
  - "ignore@7.0.5 as a reviewed, human-approved, integrity-bound dependency"
affects: [02-05, 02-06, 02-07, 02-08, phase-3-capability-materialization]

actuals:
  tokens: 5555
  tasks: 2
  commits: 3
plan_head_before: 2a675d1e1fb1e6d7db2571773ca4386ef250ba04

tech-stack:
  added: ["ignore@7.0.5"]
  patterns:
    - "Bounded read: open the file and read at most CAP + 1 bytes in a short-read loop, so an oversized or growing file is detected without ever being held"
    - "Shape-only refusal reasons: construct name plus length, never the untrusted text itself"
    - "Derived matchers memoized in a module WeakMap keyed by the rule-set value, so the rule set stays plain comparable data"
    - "Ancestor-first path decision, so a negation cannot resurrect a path beneath an excluded directory"

key-files:
  created:
    - src/core/ignore-list.ts
    - test/ignore-list.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "The ignore@7.0.5 legitimacy gate was approved by a human; the dist.integrity was re-verified against the live registry immediately before it was written, and matched byte for byte"
  - "Installed with --ignore-scripts after confirming 7.0.5 declares no preinstall/install/postinstall — only prepublishOnly, which never runs at install"
  - "isIgnored decides ancestor directories before the path itself, because gitignore(5) forbids re-including a file whose parent directory is excluded — verified against git check-ignore rather than assumed"
  - "An unreadable .gitignore (any errno other than ENOENT/ENOTDIR) yields undecidable, not an empty rule set: silently treating an unreadable ignore file as 'no patterns' would be the fail-open D-01 forbids"
  - "A cap breach discards the whole pattern set rather than applying the prefix that was read, because a partial set answers with rules that are not the repository's own"

patterns-established:
  - "Bounded untrusted-file read: CAP + 1 byte probe distinguishes 'fits' from 'exceeds' without a second stat and without unbounded memory"
  - "Third-value fail-closed predicate: undecidable is a distinct decision that propagates to the caller and is never collapsed into the permissive value"
  - "Delegate semantics, keep traversal: the external matcher reads no files and walks no directories; alpha-AOS retains the boundary-proven walk"

requirements-completed: []

coverage:
  - id: D1
    description: "ignore@7.0.5 installed and pinned to an exact version, bound to the dist.integrity a human approved at the legitimacy gate, with no lifecycle script executed"
    requirement: "DETC-01"
    verification:
      - kind: other
        ref: "npm view ignore@7.0.5 name version dist.integrity repository.url scripts --json"
        status: pass
      - kind: other
        ref: "npm ls ignore@7.0.5 --depth=0"
        status: pass
      - kind: other
        ref: "git diff -- package.json (exactly one added dependency line, no other version change)"
        status: pass
    human_judgment: false
  - id: D2
    description: "loadIgnoreRules reads one directory's .gitignore under a byte cap and a pattern-count cap, and reports undecidable rather than partially applying a set that exceeded either"
    requirement: "DETC-01"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#a .gitignore beyond the byte cap is undecidable rather than partially applied"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a .gitignore beyond the pattern-count cap is undecidable and names the cap"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a missing .gitignore yields an empty rule set rather than an error"
        status: pass
    human_judgment: false
  - id: D3
    description: "isIgnored answers ignored | scannable | undecidable by ignore-list membership, with deepest-first .gitignore precedence and the deciding pattern returned"
    requirement: "DETC-01"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#a listed path is ignored and an unlisted sibling is scannable"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a nested .gitignore takes precedence over a shallower one for paths beneath it"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a negation re-includes a file whose parent directory is not itself excluded"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a deliberately un-ignored build directory stays scannable — membership decides, not the name"
        status: pass
    human_judgment: false
  - id: D4
    description: "The same rule holds in a directory that is not a git repository, and commit status is never consulted — an uncommitted, unignored file is scannable"
    requirement: "DETC-01"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#the same .gitignore decides identically in a directory that is not a git repository"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#an uncommitted, unignored file is scannable — commit status is never consulted"
        status: pass
    human_judgment: false
  - id: D5
    description: "No subprocess reaches the ignore path (D-04, D-08), asserted by a code-only grep gate"
    requirement: "DETC-01"
    verification:
      - kind: other
        ref: "grep -vE '^\\s*(//|\\*|/\\*)' src/core/ignore-list.ts | grep -cE 'spawn|execFile|execSync|child_process' => 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "An undecidable reason names the construct and the pattern length only — a raw pattern from a scanned repository never enters a returned reason (T-02-13)"
    requirement: "DETC-01"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#an over-long pattern is reported by shape — construct and length, never its text"
        status: pass
    human_judgment: false

# Metrics
duration: 15 min
completed: 2026-09-08
status: complete
---

# Phase 02 Plan 03: Bounded Ignore Predicate Summary

**`ignore@7.0.5` pinned behind a human legitimacy gate with its registry integrity re-verified at install time, plus `src/core/ignore-list.ts` — a capped, subprocess-free `ignored | scannable | undecidable` predicate that matches `git check-ignore` including the rule that a negation cannot re-include a file under an excluded directory.**

## Performance

- **Duration:** 15 min (continuation agent span; excludes the time the plan spent parked at the Task 1 human gate)
- **Started:** 2026-09-07T15:15:14Z
- **Completed:** 2026-09-07T15:31:00Z
- **Tasks:** 2 executed (Task 1 was the checkpoint itself, discharged by human approval)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Carried `ignore@7.0.5` through the same supply-chain gate `smol-toml@1.8.0` passed at 01-04: human approval first, then an automated re-verification of `dist.integrity` against the live registry immediately before the value was written, then `--ignore-scripts` install.
- Built `src/core/ignore-list.ts` so that ignore-list membership — not commit status, not a directory's name — decides scannability, and the decision is identical in a git repository and in a plain directory.
- Made the module agree with real `git check-ignore` on the re-inclusion rule that a naive delegation to the matcher gets wrong, and proved the agreement rather than asserting it.
- Made every refusal path fail closed: caps, unreadable files, and matcher-rejected paths all produce `undecidable`, which propagates to the caller and is never collapsed into `scannable`.

## Task Commits

1. **Task 2: Install and pin the approved matcher** — `a663fce` (chore)
2. **Task 3 RED: failing tests for the bounded ignore predicate** — `a78cf66` (test)
3. **Task 3 GREEN: decide path scannability by ignore-list membership** — `98d0488` (feat)

**Plan metadata:** the `docs(02-03): complete bounded ignore predicate plan` commit carrying this file. `commits: 3` is `git rev-list --count 2a675d1..HEAD` measured before that commit, using the same instrument `/gsd-verify-work` will.

_No REFACTOR commit: the GREEN implementation needed no cleanup, and tdd.md commits a refactor only when changes are actually made._

## Files Created/Modified

- `src/core/ignore-list.ts` - `loadIgnoreRules` / `isIgnored`, the `IgnoreDecision` and `IgnoreRuleSet` types, and the three exported caps.
- `test/ignore-list.test.ts` - 10 `node:test` cases over real `mkdtemp` fixtures, covering all seven behaviours the plan named.
- `package.json` - one added dependency line, `"ignore": "7.0.5"`, exact with no range prefix.
- `package-lock.json` - pure addition of the `ignore` entry with the bound integrity; no unrelated version moved.

## Checkpoint Outcome (Task 1)

**Recorded human outcome: `approve`.** `ignore@7.0.5` was approved for install and pinning. The `reject` branch — the bounded in-house fallback with its acknowledged D-04 fidelity loss on `!` negation — was therefore not taken, and no D-04 limitation needs recording.

The approval was granted after the following was established, and the integrity was independently re-verified by this executor at install time before being written:

- **`dist.integrity` re-verified at install time:** `sha512-Hs59xBNfUIunMFgWAbGX5cq6893IbWg4KnrjbYwX3tx0ztorVgTDA6B2sxf8ejHJ4wz8BqGUMYlnzNBer5NvGg==` — identical to the value recorded in `02-RESEARCH.md` and shown at the gate, and identical to what `package-lock.json` now records. A mismatch would have been a hard stop; there was none.
- **Lifecycle scripts:** 7.0.5 declares no `preinstall`, `install`, or `postinstall`. The only publish-time hook is `prepublishOnly`, which never runs on install. Installed with `npm install --ignore-scripts` regardless.
- **Publisher and repository:** sole npm maintainer `kael <i@kael.me>`, matching the `7.0.5` publisher identity; packument `repository.url` resolves to `github.com/kaelzhang/node-ignore`, which is not a fork and not archived, created 2013-09-01, with tag `7.0.5` present.
- **The `too-new` signal:** originates from 7.0.8 (published 2026-08-31), not from 7.0.5 (published 2025-05-31). The pin is exactly `7.0.5` — no caret, no tilde, no float to `latest`.
- **Transitive surface:** `dependencies: {}` — zero runtime dependencies.

The version-level `repository.url` reads `git+ssh://git@github.com/kaelzhang/node-ignore.git` where `02-RESEARCH.md` recorded the `git+https://` form. This is the same repository expressed in the version-level rather than packument-level field, and was resolved at the gate; it is not an outstanding discrepancy.

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `a78cf66` `test(02-03): ...` | Pass |
| GREEN | `98d0488` `feat(02-03): ...` | Pass |
| REFACTOR | — | Not needed (optional gate) |

RED evidence was persisted and machine-verified rather than asserted:

```
gsd-tools check tdd-red-evidence  =>  verdict: RED_EVIDENCE_OK
                                      reason:  target_test_failed
                                      tests 10, pass 1, fail 9
```

The RED phase landed `src/core/ignore-list.ts` as a signature-only stub returning `scannable` unconditionally. This is deliberate: under `strict` TypeScript a test importing a non-existent module fails to compile, which classifies as `fixture_or_load_failure` (INVALID_RED) and would not authorize GREEN. With the stub, all nine target tests failed on their own expected/actual assertion diffs. The tenth test (missing `.gitignore` yields an empty rule set) passed against the stub legitimately, since an empty rule set is what the stub already returned.

## Decisions Made

- **Ancestors are decided before the path itself.** gitignore(5) states a file cannot be re-included once a parent directory is excluded. The `ignore` matcher applies rules in order and does not know about directory traversal, so handing it `build/keep.txt` under `build/` + `!build/keep.txt` returns "re-included". `isIgnored` therefore walks the path's ancestor directories outermost-first and stops at the first excluded one.
- **An unreadable `.gitignore` is `undecidable`, not empty.** Only `ENOENT` and `ENOTDIR` mean "there is no ignore file here". Every other errno means there may be patterns we could not see, and reporting "no patterns" there would be exactly the fail-open D-01 forbids. The errno code is reported; no file content is.
- **A cap breach discards the entire pattern set.** Applying the prefix that was read would answer with a rule set that is not the repository's own — worse than refusing, because it looks authoritative.
- **Matchers are memoized in a module-level `WeakMap` keyed by the rule-set object**, so `IgnoreRuleSet` remains plain, comparable, serializable data with no live matcher embedded in it.
- **`DETC-01` was not marked complete.** `requirements.ready-ids` reports `0/1 ready` because sibling plans in this phase also declare `DETC-01` and have not produced summaries yet. Marking it now would flip the requirement to `Complete` while the rest of the phase is still building it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected a test expectation that encoded non-git ignore semantics**
- **Found during:** Task 3 (GREEN phase)
- **Issue:** The RED test `the same .gitignore decides identically in a directory that is not a git repository` used the fixture `*.log` / `build/` / `!build/keep.txt` and asserted `build/keep.txt` was `scannable`. That is what a bare delegation to the `ignore` matcher returns, but it is not what git does. Shipping it would have baked a wrong answer into the module that decides pack selection, and `02-RESEARCH.md` cites this exact rule ("It is not possible to re-include a file if a parent directory of that file is excluded") as a determinism hazard.
- **Fix:** Verified the real behaviour first — a scratch repository with that exact `.gitignore` where `git check-ignore -q build/keep.txt` reports it **ignored** — then implemented the ancestor-first decision in `isIgnored` and corrected the expectation to the git-verified `["ignored", "scannable", "ignored", "ignored"]`, with the verification recorded in a comment beside the assertion.
- **Files modified:** `src/core/ignore-list.ts`, `test/ignore-list.test.ts`
- **Verification:** `node --test dist/test/ignore-list.test.js` reports `tests 10, pass 10, fail 0`; the corrected expectation matches `git check-ignore` output captured directly.
- **Committed in:** `98d0488` (Task 3 GREEN commit)

**2. [Rule 2 - Missing Critical] Fail-closed handling for an unreadable `.gitignore`**
- **Found during:** Task 3 (GREEN phase)
- **Issue:** The plan specified only "a missing `.gitignore` yields an empty rule set, never an error". A file that exists but cannot be read (permissions, I/O error, a directory named `.gitignore`) would have fallen into the same empty-rule-set path and been silently reported as "nothing is ignored here" — a fail-open on the predicate that decides what gets scanned.
- **Fix:** `readCapped` distinguishes `ENOENT`/`ENOTDIR` (genuinely missing → empty rule set) from every other errno (→ `undecidable` naming the construct and the errno code, no file content).
- **Files modified:** `src/core/ignore-list.ts`
- **Verification:** Covered by the same `undecidable` propagation path the cap tests exercise; `npm run check` and the full suite pass.
- **Committed in:** `98d0488` (Task 3 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both were necessary for correctness of the stated D-04 rule. Neither expanded scope — no new files, no new dependency, no new exported surface beyond what the plan specified.

## Issues Encountered

- The `gsd-tools check tdd-red-evidence` verifier parses TAP, and Node's default `--test` reporter is not TAP, so the first evidence record classified as `zero_tests_discovered`. Re-running with `node --test --test-reporter=tap` and capturing that output produced `RED_EVIDENCE_OK`. No change to the tests themselves — only to how the run was captured.

## User Setup Required

None - no external service configuration required.

## Verification Results

| Gate | Result |
|------|--------|
| `npm run check` | exit 0 |
| `npm run build` | exit 0 (63 inputs, 120 outputs) |
| `node --test dist/test/ignore-list.test.js` | `tests 10, pass 10, fail 0` — at least 7 required |
| Code-only subprocess grep on `src/core/ignore-list.ts` | `0` |
| `npm ls ignore@7.0.5 --depth=0` | exit 0 |
| `npm test` (full suite) | `tests 236, pass 231, fail 0, skipped 5` — above the 212 total recorded in `02-01-SUMMARY.md` |

The 5 skipped tests are the pre-existing platform-conditional skips carried since Phase 1; this plan added none.

## Next Phase Readiness

- The evidence collector can now ask "is this path scannable?" against a bounded, subprocess-free predicate that works in a plain directory. Plans 02-05 onward can wire it into the depth-bounded walk.
- The caller contract to honour: `relativePosixPath` is measured from the **shallowest** rule set in the stack, and the stack must be an ancestor chain. Do the native-to-POSIX conversion once at the traversal boundary.
- `undecidable` must not be swallowed by the collector. It is the third value precisely so a pattern set that could not be taken on surfaces as a refusal rather than as evidence.
- `DETC-01` remains open pending the sibling plans in this phase that also declare it.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-08*

## Self-Check: PASSED

- `src/core/ignore-list.ts` — present on disk
- `test/ignore-list.test.ts` — present on disk
- `.planning/phases/02-evidence-bound-project-planning/02-03-SUMMARY.md` — present on disk
- Commits `a663fce`, `a78cf66`, `98d0488` — all present in `git log --oneline --all`
- `commits: 3` measured via `git rev-list --count 2a675d1..HEAD`, not narrated
