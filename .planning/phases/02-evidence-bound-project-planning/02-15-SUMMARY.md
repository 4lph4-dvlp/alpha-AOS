---
phase: 02-evidence-bound-project-planning
plan: 15
subsystem: api
tags: [digest-stability, json-schema, shell-quoting, safe-inverse, gap-closure]

requires:
  - phase: 02-evidence-bound-project-planning
    provides: "the closed approved-plan schema and its three forward-typed shapes (02-14); the digest construction and byte-stability gates (02-08); the approve/status round trip (02-09, 02-10)"
provides:
  - "ProjectCapabilityPlan.hostNotes — host-derived observations, reported and deliberately undigested"
  - "a host-independent planDigest: two reviewers of the identical commit compute the identical digest"
  - "SHADOWED render lines in formatProjectPlan, so removing the input from the digest did not remove the report from the output"
  - "SafeInverse.guard.expectedHash widened to string | null — an explicit unknown for bytes that were never observed"
  - "a TARGET_UNREADABLE approval naming the pack and the path, digested because it is repository-derived"
  - "shellQuote(value) and paste-safe approvalCommand output for the path and the --project value"
  - "hostNotes tightened into schemas/approved-plan.schema.json plan.required, with the approve-then-status round trip asserted on a fresh fixture"
affects: [02-16, phase-3-capability-materialization, project-approve, project-status]

actuals:
  tokens: 106226
  tasks: 2
  commits: 4

plan_head_before: e524f87486a872c27edc210ae6ca8896603e2a22

tech-stack:
  added: []
  patterns:
    - "A digest input is split by PROVENANCE, not by importance: repository-derived facts are digested, host-derived facts are reported outside the digest"
    - "Removing a host-dependent input from a digest is only correct when the report of it stays in the output — the render loop is the other half of the fix"
    - "An unobservable value is modelled as an explicit unknown rather than substituted from a nearby value that happens to type-check"
    - "A field a closed schema declares as optional is tightened into required by the plan that makes every value carry it, and the tightening is proven by an approve-then-read round trip rather than assumed"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/core/project-plan.ts
    - src/format.ts
    - schemas/approved-plan.schema.json
    - test/project-plan.test.ts
    - test/validation.test.ts

key-decisions:
  - "The personal-skill collision moves from approvals into hostNotes rather than being deleted: the digest must not depend on the reviewer's home directory, but a project pack that would not be the skill that loads is still a real fact the reviewer must see"
  - "TARGET_CONFLICT stays in approvals and stays digested — the split this plan draws is repository-derived versus host-derived, not important versus unimportant"
  - "TARGET_UNREADABLE is scoped to targets that actually receive a safe inverse (existing, receipt-owned, pack not conflicted), because an unowned unreadable target is already a TARGET_CONFLICT whose pack is dropped and has no undo to describe"
  - "approvalCommand keeps the bare form for an ordinary path and quotes only on whitespace, a quote character or a shell metacharacter, so no existing refusal text changed"
  - "test/validation.test.ts was updated alongside the schema tightening and now asserts BOTH halves: an artifact carrying hostNotes validates, and one missing it is rejected"

patterns-established:
  - "Pattern: two hosts inside one test run — the CLI is invoked twice with the personal-skill root environment pointed at two fixture directories, because a host-dependence defect is invisible on a single host"
  - "Pattern: an unreadable target is arranged as a DIRECTORY where a file belongs, which makes readFile fail with EISDIR on every platform and needs no privileges"

requirements-completed: [DETC-04, DETC-05]

coverage:
  - id: D1
    description: "Two people reviewing the identical commit of the identical repository compute the identical planDigest — nothing outside the repository and the pinned lock enters the digest"
    requirement: "DETC-04"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#two project plan runs differing only in the personal-skill root agree on every digest"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#digestablePlan omits hostNotes, so two plans differing only in it digest identically"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#two consecutive project plan runs over an unchanged fixture are byte-identical in text mode"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#two consecutive project plan runs over an unchanged fixture are byte-identical in --json mode"
        status: pass
    human_judgment: false
  - id: D2
    description: "A personal-scope skill collision is still reported to the reviewer, outside the digest, in both renderings"
    requirement: "DETC-04"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#a shadowed personal skill is still reported, as a host note rather than an approval"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project plan names a shadowed personal skill in text mode and stays silent without one"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#a pack skill colliding with a personal-scope skill records a named host note"
        status: pass
    human_judgment: false
  - id: D3
    description: "No safe-inverse guard asserts a hash that was never observed, and the reviewer is told which undo is unguarded"
    requirement: "DETC-05"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#an existing target whose bytes could not be read gets an explicitly unknown guard"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#an existing target that reads is still guarded by the bytes that were observed"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a target that does not exist is still a remove guarded by the hash that will be written"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#an unreadable target is reported to the reviewer and its undo is left unguarded"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#the unknown guard reaches the digest, and a target becoming readable moves the plan digest"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every refusal's command is safe to paste: a path carrying a quote or a shell metacharacter is quoted, and an ordinary path is unchanged"
    requirement: "DETC-05"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#approvalCommand leaves an ordinary path exactly as it emits it today"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#approvalCommand quotes a path containing a double quote and leaves no unbalanced quote"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#approvalCommand quotes a path containing a shell metacharacter rather than emitting it bare"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#approvalCommand quotes the --project value, which is equally user-supplied"
        status: pass
    human_judgment: false
  - id: D5
    description: "project approve cannot emit an artifact the closed approved-plan schema rejects: hostNotes is required and the guard hash is admitted as null, both proven by an approve-then-status round trip"
    requirement: "DETC-05"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#an approved plan carrying hostNotes reads back as current"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#an approved plan carrying an unknown guard hash reads back as current"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#the approved-plan schema admits the two shapes plan 02-15 introduces"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#a well-formed approved-plan artifact validates as a closed current document"
        status: pass
    human_judgment: false

duration: 62min
completed: 2026-09-09
status: complete
---

# Phase 02 Plan 15: Host-independent plan digest and an honest safe inverse Summary

**`planDigest` now depends on the repository and the pinned lock alone — the personal-skill collision moved from `approvals` into a new undigested `hostNotes` field and is still rendered as a `SHADOWED` line — and a target that exists but cannot be read carries an explicitly `null` guard plus a `TARGET_UNREADABLE` approval instead of a fabricated source hash.**

## Performance

- **Duration:** 62 min
- **Started:** 2026-09-09T04:28Z (local +09:00)
- **Completed:** 2026-09-09T05:30Z (local +09:00)
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- **The digest stopped depending on the reviewer's home directory (WR-01).** `discoverPersonalSkillNames` still runs, still runs only on the preview path, and still reports only an OBSERVED collision — what changed is where its output lands. `ProjectCapabilityPlan.hostNotes: string[]` is a new sorted field that `digestablePlan` deliberately omits, documented alongside `createdAt` and the git context as the precedent for the omission. `TARGET_CONFLICT` deliberately stayed in `approvals` and stayed digested: the line drawn is repository-derived versus host-derived, not important versus unimportant.
- **The report survived the removal.** `formatProjectPlan` renders each host note as a `SHADOWED` line beside the `APPROVAL` lines, under a different prefix so a reader can tell a fact the digest binds from one it deliberately does not. Without this half the fix would have traded a stability defect for a silence defect.
- **No guard hash is invented any more (WR-04).** `SafeInverse.guard.expectedHash` is `string | null`, and `buildSafeInverse` returns `target.currentHash` directly instead of falling back to the source hash. A `TARGET_UNREADABLE` approval names the pack and the path, so the reviewer learns the undo is unguarded at review time rather than at rollback time. It is repository-derived, so it stays in `approvals` and in the digest — asserted through `digestablePlan`'s positional `safeInverse` row rather than by reading the code.
- **Every refusal's command is safe to paste (WR-14).** A platform-aware `shellQuote` (Windows doubles an embedded `"` inside `"`; POSIX wraps in `'` and escapes an embedded `'`) is applied to the path AND to the equally user-supplied `--project` value whenever either carries whitespace, a quote or a shell metacharacter. An ordinary path matches none of those and is emitted byte-identically to before, so no existing refusal assertion moved.
- **The artifact contract was proven, not assumed.** `hostNotes` moved into `schemas/approved-plan.schema.json`'s `plan.required` now that every plan value carries it, and both shape changes are closed by a real round trip: approve a fresh fixture, then `project status --json`, and require `artifactState: "current"` with `artifactIssues` of length 0. Two such tests exist — one for a plan carrying `hostNotes`, one for a plan carrying a `null` guard hash.

## Task Commits

1. **Task 1 (tracer): the same commit yields the same digest on any host**
   - RED — `5f9889a` (test)
   - GREEN — `88aaf54` (feat)
2. **Task 2: an honest inverse and a paste-safe refusal**
   - RED — `acd3858` (test)
   - GREEN — `9692514` (fix)

No REFACTOR commit: neither implementation had a cleanup worth a separate commit, and `tdd.md` commits REFACTOR only on change.

**Plan metadata:** see the `docs(02-15)` commit following this summary.

## Observed pre-fix output

**WR-01, the host-dependent digest.** Two `project plan --json` runs over one `reactFixture`, differing only in the personal-skill root the environment pointed at:

```
AssertionError [ERR_ASSERTION]: planDigest moved with the reviewer's home directory,
so a digest reviewed on a laptop cannot be approved on CI
+ actual   - expected
+ '42ad4f0182f313d30fdd0d4d1910a07eb3474206672579afc37fe0ef2017cdcc'
- '7fc792220ae8165eea8b534d234530ae32673e246cdb87616a17a4c068077714'
```

The colliding run's text rendering showed the input that moved it:

```
APPROVAL SKILL_SHADOWED frontend-a11y already exists as a personal-scope skill, and a
personal skill overrides a project one, so the project pack would not be the skill that loads
```

Also observed pre-fix: `the plan carries no hostNotes array`, `no SHADOWED line in: ...`, and `the written artifact carries no hostNotes array`.

**WR-04, the fabricated guard.**

```
AssertionError [ERR_ASSERTION]: the restore is guarded by a hash that was never observed,
so it would restore bytes that were never there
AssertionError [ERR_ASSERTION]: a guard hash was invented for bytes that were never observed
AssertionError [ERR_ASSERTION]: the unknown guard did not reach the digestable view
```

**WR-14, the unquoted paste command.**

```
a path containing a quote was emitted bare:
  alpha-aos project approve /tmp/pro"ject --plan-digest eee... --apply
/tmp/pro$ject was emitted bare into a command documented as ready to paste:
  alpha-aos project approve /tmp/pro$ject --plan-digest eee... --apply
the --project value was emitted unquoted:
  alpha-aos project approve /tmp/project --project packages/my app --plan-digest eee... --apply
```

## Schema amendment made

`schemas/approved-plan.schema.json`:

- `properties.plan.required` gains `"hostNotes"`. 02-14 declared the property and deliberately left it out of `required` so an artifact written before this plan landed still validated; every plan value now carries it, so an artifact missing it is a rejected artifact rather than a silently half-typed one.
- The property's `description` was rewritten to record that the tightening happened, why the field is the one plan field `digestablePlan` omits, and that it must not be loosened back out of `required`.
- **No change was needed for the null guard hash.** 02-14 typed `plan.safeInverse[].guard.expectedHash` as `["string","null"]` up front, and `approvals[].code` carries no enum, so `TARGET_UNREADABLE` needed no schema edit either. Both were asserted rather than trusted.

## Files Created/Modified

- `src/types.ts` — `ProjectCapabilityPlan.hostNotes: string[]` with the doc comment naming `createdAt` and the git context as the precedent for its omission from the digest; `SafeInverse.guard.expectedHash` widened to `string | null` with the meaning of the unknown stated.
- `src/core/project-plan.ts` — the collision builds `hostNotes` instead of a `SKILL_SHADOWED` approval; `digestablePlan`'s doc comment names all three deliberate omissions as one decision made three times; `buildSafeInverse` returns the observed hash or the explicit unknown; the `TARGET_UNREADABLE` approval loop and the hoisted `conflicted` set it needs; `SHELL_UNSAFE_ARGUMENT`, the exported `shellQuote`, `pasteSafe`, and an `approvalCommand` that applies it to the path and the `--project` value.
- `src/format.ts` — the `SHADOWED` render loop beside the `APPROVAL` loop, with the comment stating it is the other half of the WR-01 fix and must not be dropped.
- `schemas/approved-plan.schema.json` — `hostNotes` into `plan.required`, description rewritten.
- `test/project-plan.test.ts` — 15 new tests plus two updated ones (see Deviations); the `personalSkillRoot` / `personalSkillEnvironment` "two hosts in one run" helpers and the `unreadableTargetFixture` EISDIR helper.
- `test/validation.test.ts` — `VALID_APPROVED_PLAN.plan` gains `hostNotes: []`, and the 02-15 forward-compatibility test now asserts both halves of the tightening.

## Decisions Made

- **The collision moved rather than being deleted.** WR-01 offered two fixes; the one taken keeps the report and moves it out of the digest, because a project pack that would not be the skill that loads is a fact a reviewer needs even though it is a fact about one machine.
- **`TARGET_CONFLICT` was left alone.** It is a fact about a file in the tree, and a reviewer who accepted a plan carrying one must not be able to apply it once the conflict resolves — so it must stay digested.
- **`TARGET_UNREADABLE` is scoped to targets that actually get an inverse.** An unowned unreadable target is already a `TARGET_CONFLICT`, its pack is dropped from `applicable`, and it therefore has no undo to describe; a second line about it would be noise, not disclosure.
- **The quoting predicate is opt-in, not unconditional.** Existing refusal assertions across the suite expect the bare form for ordinary paths, and a gap-closure plan is the wrong place to churn them. `SHELL_UNSAFE_ARGUMENT` covers whitespace, both quote characters, and the metacharacters a shell would reinterpret (including glob characters), and an ordinary POSIX or Windows path matches none of them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `test/validation.test.ts` had to change with the schema tightening**

- **Found during:** Task 1 (GREEN)
- **Issue:** `test/validation.test.ts` is not in this plan's `files_modified`, but moving `hostNotes` into `plan.required` makes its `VALID_APPROVED_PLAN` fixture an invalid document, and the 02-14 test `the approved-plan schema admits the two shapes plan 02-15 introduces` carried a comment asserting the field is "deliberately NOT required" — which this plan makes false. Leaving either would ship a red suite or a stale contract comment.
- **Fix:** `VALID_APPROVED_PLAN.plan` gains `hostNotes: []`, and the forward-compatibility test now asserts BOTH halves of the tightening: an artifact carrying `hostNotes` validates, and one with the field omitted is rejected. The null-guard and open-approval-code cases are unchanged.
- **Files modified:** `test/validation.test.ts`
- **Verification:** `node --test dist/test/validation.test.js` — the whole file passes, including the strengthened case.
- **Committed in:** `88aaf54`

**2. [Rule 1 - Bug] A pre-existing test asserted the defect WR-01 reported**

- **Found during:** Task 1 (GREEN)
- **Issue:** `a pack skill colliding with a personal-scope skill records a named shadowing approval` asserted the collision appears in `approvals` — i.e. it asserted the exact host-dependent digest input this plan removes. It failed on the fix, correctly.
- **Fix:** Renamed to `... records a named host note` and rewritten to assert the collision lands in `hostNotes`, that exactly one note is present for an observed collision and none for an unobserved one (its original "observed, never assumed" meaning is preserved verbatim), and additionally that no `SKILL_SHADOWED` approval remains — so the test now guards the fix instead of the defect.
- **Files modified:** `test/project-plan.test.ts`
- **Verification:** The test passes and its HOME/USERPROFILE fixture isolation is unchanged.
- **Committed in:** `88aaf54`

**3. [Rule 3 - Blocking] `syntheticPlan` in the test suite did not type-check**

- **Found during:** Task 1 (GREEN)
- **Issue:** `hostNotes` is a required field of `ProjectCapabilityPlan`, so the suite's `syntheticPlan` literal stopped compiling (`TS2741`).
- **Fix:** `hostNotes: []` added to the literal.
- **Files modified:** `test/project-plan.test.ts`
- **Verification:** `npm run check` exits 0.
- **Committed in:** `88aaf54`

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All three were required for this plan's own acceptance criteria to be satisfiable. `test/validation.test.ts` is the only file touched outside `files_modified`, and it is the file that owns the schema this plan amends. No scope creep.

## Issues Encountered

- **`gsd-tools check tdd-red-evidence` could not parse `node --test`'s default reporter.** The first RED evidence record was returned `INVALID_RED (zero_tests_discovered)` because the checker parses TAP and the default reporter emits `ℹ tests 155` / `✖ name`. Re-running the same RED tree with `--test-reporter=tap` produced `RED_EVIDENCE_OK (target_test_failed)` with `tests 155, pass 149, fail 6` and the target test named in `failing_tests`. This was a reporter-format mismatch, not an invalid RED; no product code was touched between the two runs.

## Verification Results

| Check | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm run build` | exit 0 |
| `node --test dist/test/project-plan.test.js dist/test/preview.test.js` | **166 tests, pass 166, fail 0** |
| `node --test dist/test/project-plan.test.js dist/test/validation.test.js` | **163 tests, pass 163, fail 0** |
| `npm test` | exit 0 — **467 tests, pass 461, fail 0, skipped 6** |

**`npm test` total is 467**, against the 452 floor `02-14-SUMMARY.md` recorded. The 6 skipped tests are the same pre-existing host-capability skips 02-13 and 02-14 both reported; none was added here.

**Tracer feedback gate (Task 1).** The task carried no `gate="blocking-human"`, auto mode is off, `workflow.human_verify_mode` is `end-of-phase`, and the tracer's `<verify>` carries only `<automated>` blocks — so the gate re-ran the tracer verification end-to-end at the tracer commit (`npm run check && npm run build && node --test dist/test/project-plan.test.js` → 145 tests, pass 145, fail 0) and expansion proceeded without synthesizing a checkpoint.

**Calibration note.** `actuals.tokens` is `chars/4` over the full text of the six files actually changed (424 904 chars). The realized diff alone is 40 379 chars, i.e. ~10 095 on the same scale. The plan's `estimate.tokens` was 65 000 at `confidence: low`; both readings are recorded so the calibration is not silently flattered in either direction.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO or unwired component was introduced; `hostNotes` is empty only when no collision was observed, which is its correct value.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Sibling plan 02-16 is unblocked and untouched.** This plan changed `src/types.ts`, `src/core/project-plan.ts`, `src/format.ts`, `schemas/approved-plan.schema.json` and two test files; 02-16's root-keyed catalog caches (WR-09) and the `pin-pack-skills.mjs check` home decision touch `src/core/project.ts` and `scripts/`, and neither depends on anything left behind here. **The `npm test` floor 02-16 gates against is 467.**
- **DETC-04 and DETC-05 are both closed by this plan's summary.** DETC-05 was held open by the shared-ID gate waiting on this plan; 02-14 already closed DETC-06.
- **Phase 3 inherits one new constraint from here.** `SafeInverse.guard.expectedHash` may be `null`, and Phase 3 owns rollback. A rollback that reads a null guard must treat that undo as UNGUARDED — refuse it, or require an explicit human confirmation — and must not fall back to the source hash, which is exactly the defect this plan removed.
- **Nothing deferred was picked up here.** D-13's drift classification with no prior artifact (broken-windows entry #14) remains an open product question, unchanged.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-09*

## Self-Check: PASSED

- `src/types.ts`, `src/core/project-plan.ts`, `src/format.ts`, `schemas/approved-plan.schema.json`, `test/project-plan.test.ts`, `test/validation.test.ts` — all FOUND on disk
- Commits `5f9889a`, `88aaf54`, `acd3858`, `9692514` — all FOUND in `git log`
- `TARGET_UNREADABLE` present in `src/core/project-plan.ts`; `export function shellQuote` present in `src/core/project-plan.ts`; `hostNotes` present in `properties.plan.required` of `schemas/approved-plan.schema.json`
- `npm test` re-run at HEAD: exit 0, 467 tests, fail 0
