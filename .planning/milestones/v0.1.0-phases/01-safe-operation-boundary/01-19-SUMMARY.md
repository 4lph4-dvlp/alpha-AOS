---
phase: 01-safe-operation-boundary
plan: 19
subsystem: safety
tags: [path-boundary, realpath, junction, symlink, canonicalization, SAFE-02, regression]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: "01-07 established provePathBoundary / recheckPathProof / proveOperationPaths and the SAFE-02 tracer suite; 01-09 made applyFileTransaction prove every role through this module"
provides:
  - "A single canonical-resolution function (`canonicalizeWithMissingTail`) that produces BOTH operands of every containment comparison in the path boundary"
  - "An allowed root that does not exist yet is resolved through its deepest existing ancestor, exactly as the target already was — closing G-01-1 RC-1"
  - "Explicit `unprovable-filesystem` refusals with a stated reason where three silent catches used to substitute an unresolved string"
  - "`recheckPathProof` carries no residual asymmetry into the moment of mutation"
  - "Four RC-1 regression fixtures that build their own junction/symlink, so the defect reproduces on an ordinary developer host"
affects: [01-23, phase-07-three-os-matrix, transaction, install, update]

# Actuals (#2632) — same estimateTokens scale as the plan's `estimate`.
# Basis: chars/4 over the realized diff (14,325 chars across 2 files).
# For reference on the whole-file scale, path-boundary.ts + path-boundary.test.ts total 44,820 chars.
actuals:
  tokens: 3581
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One resolution function owns both operands of a containment comparison; a comparison never mixes a resolved path with an unresolved one"
    - "ENOENT (not created yet) and every other errno (exists but unreadable) are separated at every resolution site — walking up is correct only for the first"
    - "A failed canonicalization surfaces as a coded refusal carrying a reason, never as a fallback that substitutes the unresolved string"
    - "A regression fixture builds the filesystem shape it depends on (junction / dir symlink) rather than depending on how the host provisions os.tmpdir()"

key-files:
  created: []
  modified:
    - src/core/path-boundary.ts
    - test/path-boundary.test.ts

key-decisions:
  - "`canonicalizeWithMissingTail` is the single canonical form for containment operands; `classifyComponent` keeps its own resolution call because it records a component's own identity, which is not an operand of any comparison and where the not-yet-created-tail branch would be dead code"
  - "A dangling link (lstat succeeds, realpath ENOENT) keeps today's meaning and today's value — `canonical = path` — because the link itself exists and is classified; only a non-ENOENT errno becomes the new unprovable signal"
  - "`recheckPathProof` refuses on an unresolvable allowed root instead of falling back to the configured root: continuing would re-create the same asymmetry at the instant of mutation"
  - "Fixture 4 (`a canonical-root refusal names the canonically resolved root`) is a second negative control, not a reproducer — a not-yet-existing allowed root cannot have an existing escaping descendant, so the asymmetry and the escape cannot co-occur in one fixture"

patterns-established:
  - "Symmetric canonicalization: both sides of a containment test come from one function, enforced by a grep gate counting direct resolution calls in non-comment lines"
  - "Errno-discriminating catch: absence and unreadability are different facts and the code states which one it saw"

requirements-completed: [SAFE-02]

coverage:
  - id: D1
    description: "An allowed root that does not exist yet, whose ancestor is a junction or POSIX directory symlink, is proven rather than refused as outside-canonical-root (G-01-1 RC-1, UAT missing[0] and missing[2])"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#an allowed root that does not exist yet under a link is still provable"
        status: pass
      - kind: unit
        ref: "test/path-boundary.test.ts#an allowed root reached through a link is canonicalized on both sides"
        status: pass
    human_judgment: false
  - id: D2
    description: "The target and the allowed root are canonicalized by exactly one function; a second resolution call exists only for component identity and no third site exists"
    requirement: SAFE-02
    verification:
      - kind: other
        ref: "test \"$(grep -v -E '^[[:space:]]*(//|\\*|/\\*)' src/core/path-boundary.ts | grep -c 'await realpath(')\" = \"2\" -> 2"
        status: pass
      - kind: other
        ref: "test \"$(grep -c 'canonicalizeWithMissingTail' src/core/path-boundary.ts)\" -ge 4 -> 4"
        status: pass
    human_judgment: false
  - id: D3
    description: "SAFE-02 is not weakened: a target that escapes the canonical root is still refused with outside-canonical-root even when the allowed root is reached through a link, and the outside sentinel is byte-identical (ROADMAP SC2, threat T-01-19-01)"
    requirement: SAFE-02
    verification:
      - kind: unit
        ref: "test/path-boundary.test.ts#a target that escapes a linked allowed root is still refused"
        status: pass
      - kind: unit
        ref: "test/path-boundary.test.ts#a canonical-root refusal names the canonically resolved root"
        status: pass
      - kind: unit
        ref: "test/path-boundary.test.ts#a link that escapes the allowed root is refused and the outside sentinel is untouched"
        status: pass
    human_judgment: false
  - id: D4
    description: "A canonicalization that cannot be completed is reported as unprovable-filesystem with a stated reason at all three former silent-catch sites, including the apply-time recheck (UAT missing[1], threats T-01-19-03 and T-01-19-04)"
    requirement: SAFE-02
    verification: []
    human_judgment: true
    rationale: "The non-ENOENT branches (EACCES/EPERM/ELOOP/EIO on an existing component or root) are structurally present and compiler-checked at both classifyComponent call sites, but no test drives them: creating an unreadable-but-existing path requires privileged or platform-specific fixture setup that this plan did not authorize, and faking it would assert the mock rather than the boundary. A human should confirm the refusal path reads correctly by inspection at the phase checkpoint."
  - id: D5
    description: "The consumers of the boundary — transaction, install and update — keep their meaning after the change"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "node --test dist/test/transaction-crash.test.js dist/test/install.test.js dist/test/update.test.js -> 27 tests, 27 pass, fail 0"
        status: pass
      - kind: integration
        ref: "npm test -> tests 195, pass 193, fail 0, skipped 2"
        status: pass
    human_judgment: false

# Metrics
duration: 11 min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 19: Symmetric Canonical Resolution in the Path Boundary Summary

**`provePathBoundary` now resolves the allowed root through the same `canonicalizeWithMissingTail` helper as the target, so a not-yet-created state root under a junction or POSIX symlink is proven instead of being refused as `outside-canonical-root`, and three silent catches became coded `unprovable-filesystem` refusals.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-05T16:18:59Z
- **Completed:** 2026-09-05T16:29:59Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **Closed G-01-1 RC-1.** The target was canonicalized as "realpath of the deepest existing ancestor plus the not-yet-created tail" while the allowed root got a bare `realpath` whose catch left the unresolved string in place. `withinRoot` then compared a resolved path against an unresolved one. Both operands now come from one function.
- **Reproduced the defect on this developer host before fixing it.** The RED fixture builds its own junction and places a never-created `<junction>/state` under it; against unmodified source it fails with `outside-canonical-root` and a detail that literally shows the two spellings being compared. That failure and its `detail` string are recorded verbatim in the RED commit body.
- **Separated absence from unreadability at both resolution sites.** `ENOENT` means the tail has not been created and the walk continues one level up; every other errno means something that exists could not be resolved and is reported as a reason. Without that split, "walk up to a shallower ancestor" would itself be a new silent catch.
- **Extended the refusal to the apply-time recheck.** `recheckPathProof` resolves its allowed root through the same helper and refuses with `unprovable-filesystem` rather than falling back to the configured root, which would have re-created the asymmetry at the instant of mutation.
- **Proved the fix is not a boundary relaxation.** Two negative controls — the escape refusal and the refusal detail naming the canonically resolved root — were green before the fix and are green after it, with the outside sentinel's sha256 asserted unchanged across the call. `withinRoot`, `comparable`, `outside-configured-root`, `unknown-reparse` and `ancestor-changed` are untouched.

## Task Commits

Each task was committed atomically. This plan is a plan-level TDD cycle (`test` → `fix`).

1. **Task 1: RC-1 regression fixtures that actually go red on a developer host** — `f69c74d` (test — RED)
2. **Task 2: one resolution function for target and root, failure surfaced in the proof** — `fb30d55` (fix — GREEN)

No REFACTOR commit was needed.

**Plan metadata:** see the `docs(01-19)` commit that carries this SUMMARY.

## Files Created/Modified

- `src/core/path-boundary.ts` — added module-local `canonicalizeWithMissingTail`; routed the target, the allowed root and the recheck's allowed root through it; widened `classifyComponent`'s return with an `unprovable` signal and handled it at both call sites. No exported signature changed and `PathBoundaryCode` gained no member.
- `test/path-boundary.test.ts` — four RC-1 regression tests plus a `realpath` import; each fixture builds its own junction (Windows) or directory symlink (POSIX).

## Verification Results

| Gate | Expected | Observed |
|------|----------|----------|
| `npm run check` | exit 0, no output | exit 0, no output |
| `npm run build` | exit 0 | exit 0 (55 inputs, 104 outputs) |
| RED gate: test 1 fails pre-fix | non-zero exit, no `RED-GATE-NOT-MET` | `red confirmed` — `outside-canonical-root` |
| Negative control green pre-fix | `fail 0` | 1 test, 1 pass, fail 0 |
| RED commit touches only the test file | `test/path-boundary.test.ts` | exact match |
| `node --test dist/test/path-boundary.test.js` | `fail 0`, all four new names present | 21 tests, 19 pass, **fail 0**, 2 pre-existing skips; all four names in the passing output |
| `node --test dist/test/{transaction-crash,install,update}.test.js` | `fail 0` | 27 tests, 27 pass, **fail 0** |
| Non-comment `await realpath(` count | exactly `2` | `2` |
| `canonicalizeWithMissingTail` references | `>= 4` | `4` |
| `npm test` | `fail 0`, total ≥ 195 | **195 tests, 193 pass, 0 fail, 2 skipped** |

**Test count of record: 195.** The plan's stated threshold was 194 against a "190" baseline; `01-18-SUMMARY.md` actually records **191**, and the plan's own fallback clause ("If `01-18-SUMMARY.md` records a higher final count, that number is the baseline instead and the threshold rises with it") therefore sets the threshold at 195. Met exactly: 191 + 4.

**Not-run list unchanged.** The two skips are pre-existing and platform-honest: file symlinks need privileges on this host, and `fsutil reparsepoint` is unprivileged here. All four new link fixtures executed rather than skipped — a skip would have been a fixture defect.

**Local green is necessary but not sufficient.** The authoritative verification for G-01-1 is a green three-OS CI matrix run; that observation is owned by plan `01-23`.

## Decisions Made

- **`classifyComponent` keeps its own resolution call rather than routing through the helper.** What it needs is the canonical location of a component `lstat` has already proven exists — not "a path with a not-yet-created tail". Sending it through the helper would make the missing-tail branch permanently dead code at that site while adding a third apparent resolution site to reason about. The catch was changed instead, using exactly the helper's errno rule.
- **A dangling link keeps today's value.** `lstat` succeeding while `realpath` raises `ENOENT` is precisely a link with no target; the link itself exists and is classified, so `canonical = path` is retained. Only a non-`ENOENT` errno becomes the new `unprovable` signal. This plan does not change that case's meaning.
- **`recheckPathProof` refuses rather than falls back.** The previous comment ("containment is still checked below") was true but useless: by the time those checks run they compare a resolved endpoint against an unresolved root, which is the same defect one layer later.
- **Fixture 4 is a negative control, not a reproducer** — see Deviations.

## Deviations from Plan

### Documented deviations

**1. [Rule 1 - Plan expectation vs observed reality] Fixture 4 passes before the fix; only one test reproduces RC-1**

- **Found during:** Task 1 (RED confirmation)
- **Issue:** Task 1's acceptance criteria say "the RED commit body records the observed `code` and `detail` for **the two** tests that fail before the fix", and the action text predicts fixtures 1 and 4 both go red. Observed against unmodified source: fixture 1 failed; fixtures 2, 3 and 4 passed.
- **Analysis:** This is structural, not a fixture defect. Fixture 4 shares fixture 3's shape, where the allowed root is `<root>/link` — a junction that **exists**. `realpath(configuredRoot)` therefore succeeds and the detail already names the canonical root, so there is no asymmetry left to observe. The asymmetry only appears when `realpath(allowedRoot)` throws, i.e. when the allowed root does not exist yet — and a non-existent root cannot have an existing escaping descendant to refuse. The two conditions cannot co-occur in one fixture, so a refusal-detail assertion cannot be red before the fix under any arrangement of this shape.
- **Fix:** No code change. The fixture was kept exactly as specified and reclassified as a **second negative control** alongside fixture 3 — it pins that the refusal names a canonically resolved root, which is what would regress if a future change reintroduced a one-sided comparison. The RED commit body records fixture 1's observed `code` and `detail` verbatim and states, with the structural reason, why fixture 4 is green.
- **Files modified:** none beyond the planned `test/path-boundary.test.ts`
- **Verification:** fixture 4 green before (`ok 4`) and after (`ok 21`) the fix; the mandatory RED gate in the plan's own `<verify>` block keys only on fixture 1 and was met (`red confirmed`).
- **Committed in:** `f69c74d` (commit body)

**2. [Rule 1 - Stale baseline in plan text] Test-count threshold raised from 194 to 195**

- **Found during:** Task 2 (final gate)
- **Issue:** The plan states the `01-18` baseline as 190 and the threshold as 194. `01-18-SUMMARY.md` records 191.
- **Fix:** Applied the plan's own written fallback clause and used 191 + 4 = 195 as the threshold. Measured on this host before any edit: 191 tests, fail 0 — confirming the recorded baseline rather than the plan's number.
- **Verification:** `npm test` → 195 tests, fail 0.
- **Committed in:** `fb30d55` (commit body)

---

**Total deviations:** 2 documented (both plan-text vs observed-reality corrections; no code deviated from the plan's specification)
**Impact on plan:** None on scope or safety. Every artifact, call site and prohibition the plan named was implemented as written. Both deviations tighten rather than loosen a gate (the test threshold rose; the fixture's role was stated honestly instead of a red being manufactured).

## Issues Encountered

None. The defect reproduced on the first attempt with exactly the mechanism `01-UAT.md` described, and the fix turned it green without touching any containment logic.

## Prohibition Status

| Prohibition | Status | Evidence |
|-------------|--------|----------|
| No comparison places a canonicalized path against a non-canonically-resolved root | **verified** | Both operands assigned from `canonicalizeWithMissingTail`; grep gate pins exactly two direct resolution calls in non-comment lines and ≥4 helper references |
| No failed canonicalization is absorbed into a fallback substituting the unresolved string | **verified** (target/root/recheck) / **partial** (non-ENOENT component branch) | All three former catches now return a reason. The non-ENOENT component branch is compiler-checked at both call sites but has no test driving it — recorded as coverage `D4`, `human_judgment: true` |
| An escaping target stays refused with `outside-canonical-root` even when the allowed root is reached through a link | **verified** | `a target that escapes a linked allowed root is still refused` green pre- and post-fix, outside sentinel sha256 identical |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-01-1 `missing` items 1, 2 and 3 are closed on this host. Item 4 (the observed three-OS matrix) is owned by `01-23`.
- `01-20` (wave 11) can proceed: it opens with a type-error RED, and this plan's tree builds clean and is whole-suite green at 195/fail 0, which is the well-founded baseline `01-20` should quote.
- One residual concern, tracked as coverage `D4`: the `unprovable-filesystem` branch for an existing-but-unreadable component or root has no automated coverage. Building an EACCES/EPERM fixture needs privileged or platform-specific setup that was outside this plan's authorization.

## Self-Check: PASSED

- `src/core/path-boundary.ts` — FOUND
- `test/path-boundary.test.ts` — FOUND
- Commit `f69c74d` — FOUND
- Commit `fb30d55` — FOUND
- No file deletions in either task commit (`git diff --diff-filter=D HEAD~2 HEAD` empty)
- No untracked files produced by this plan

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*
