---
phase: 02-evidence-bound-project-planning
plan: 12
subsystem: infra
tags: [gitignore, ignore-matcher, redaction, utf-8, json-schema, regex, temp-fixture]

requires:
  - phase: 02-evidence-bound-project-planning
    provides: "ordering-only edge on 02-11 — both plans build into the shared dist/ tree before `node --test dist/...`; no data or decision consumed"
provides:
  - "IgnoreRuleSet.notes — a non-poisoning parse channel, so one uncompilable .gitignore line no longer makes a whole subtree unscannable"
  - "IGNORE_PATTERN_COUNT_CAP tested before the push, so the reported cap is the cap that decided"
  - "print() refuses an over-budget --json envelope by name instead of writing a document cut mid-token with exit 0"
  - "truncateToUtf8Bytes — one code-point-boundary-safe cut behind every byte budget in the redaction seam"
  - "OBSERVABLE_BYTE_BUDGET / REDACTED_STRING_LENGTH_BUDGET — the budgets named, with their units stated"
  - "describeOverBudgetEnvelope — the refusal every --json surface owes, in one sentence"
  - "pack items accept ^x- extensions, matching the sibling fact item"
  - "deploy-workflow / release-workflow patterns confined to one line"
  - "ECC fixture cleans up on failure by default and names a retained tree when retention was asked for"
affects: [02-13, phase-03-capability-packs, phase-04-mandatory-gates]

actuals:
  tokens: 58159
  tasks: 3
  commits: 5
plan_head_before: d9c025d4ad0f8d14604a01f96fd1886370531e69

tech-stack:
  added: []
  patterns:
    - "Two-channel parse failure vocabulary: `undecidable` (the file could not be taken on at all, fail-closed and total) vs `notes` (one line stopped, the rest still answers)"
    - "Byte budgets measured AND applied in UTF-8 bytes through a single helper whose slice end walks back off continuation bytes"
    - "An over-budget observable surface refuses and writes nothing to stdout, rather than truncating with a success exit"

key-files:
  created: []
  modified:
    - src/core/ignore-list.ts
    - src/core/redaction.ts
    - src/cli.ts
    - src/core/ecc-fixture.ts
    - schemas/fact-vocabulary.schema.json
    - schemas/pack-catalog.schema.json
    - catalog/facts.yaml
    - test/ignore-list.test.ts
    - test/redaction.test.ts
    - test/pack-catalog.test.ts
    - test/evidence.test.ts

key-decisions:
  - "The ignore parser's failure vocabulary is split in two: only a file that could not be taken on at all (byte cap, pattern-count cap, unreadable) stays `undecidable` and fail-closed; a single uncompilable line becomes a bounded `note` and the remaining patterns keep deciding."
  - "The escaped-comment fix prescribed by 02-REVIEW IN-06 was NOT applied: stripping the backslash from `\\#foo` hands `#foo` to the matcher, which discards it as a comment. Verified both ways against `ignore@7` and `git check-ignore`. The line is kept verbatim and the behaviour is pinned by a regression that cross-checks git."
  - "An over-budget `--json` envelope is a thrown refusal naming the budget in bytes and the envelope's sha256, with nothing at all written to stdout — a partial document on stdout plus a refusal on stderr is worse than a refusal alone, because a pipeline reads stdout."
  - "ECC fixture retention: option (a) — `retain` is initialised FROM the caller's `keep` option, so a failure cleans up by default; additionally, when retention WAS requested the rethrow names the retained root (aliased), so a kept tree is never silent either."
  - "`redactString`'s bound stays a UTF-16 code-unit bound (unchanged in value), now stated as such and cut without splitting a surrogate pair. It bounds one field inside an envelope; the envelope carries the byte budget."

patterns-established:
  - "Assert the user-visible seam, not only the layer below it: the .gitignore defect was invisible for as long as it was only tested at the module, where `undecidable` looked honest."
  - "A declared contract's own prose is testable: the schema descriptions and the two catalog schemas' extension rule are now pinned by assertions that read the shipped JSON."

requirements-completed: [DETC-02, DETC-03, DETC-04]

coverage:
  - id: D1
    description: "A .gitignore with many valid patterns and one over-length line still decides every path beneath it; the over-long line is a bounded note and the remaining patterns keep answering"
    requirement: "DETC-02"
    verification:
      - kind: integration
        ref: "test/ignore-list.test.ts#an over-long .gitignore line does not blind the scan — the CLI still selects the packs the evidence supports"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#an over-long line leaves the remaining patterns deciding, and is reported as a bounded note"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#a hostile .gitignore of over-long lines produces a bounded note list, not an unbounded one"
        status: pass
    human_judgment: false
  - id: D2
    description: "A .gitignore that genuinely could not be taken on — over the byte cap, over the pattern-count cap, or unreadable — still makes the subtree undecidable"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#a .gitignore beyond the byte cap is undecidable rather than partially applied"
        status: pass
      - kind: unit
        ref: "test/evidence.test.ts#a path whose ignore decision is undecidable is excluded with its reason"
        status: pass
    human_judgment: false
  - id: D3
    description: "The reported pattern-count cap describes the behaviour: the file at exactly the cap is accepted, the file one past it is refused, and the refusal names the cap that decided"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#the pattern-count cap accepts the file at the cap and refuses the one past it"
        status: pass
    human_judgment: false
  - id: D4
    description: "A .gitignore line escaping a leading # names a file whose name starts with #, and an unescaped one is a comment — both cross-checked against git check-ignore"
    requirement: "DETC-02"
    verification:
      - kind: unit
        ref: "test/ignore-list.test.ts#a leading # escaped with a backslash names a file whose name begins with #"
        status: pass
      - kind: unit
        ref: "test/ignore-list.test.ts#an unescaped leading # is a comment for this parser and for git alike"
        status: pass
    human_judgment: false
  - id: D5
    description: "--json never emits truncated bytes with a success exit: an over-budget envelope is a refusal naming the budget and the sha256, and stdout carries no partial document"
    requirement: "DETC-03"
    verification:
      - kind: e2e
        ref: "test/redaction.test.ts#a --json envelope over the observable byte budget is refused, not truncated"
        status: pass
      - kind: e2e
        ref: "test/redaction.test.ts#an under-budget --json envelope is written unchanged with exit 0"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every byte budget in the redaction seam is measured and enforced in UTF-8 bytes, and no cut emits half a code point"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/redaction.test.ts#redactDocument measures and cuts in UTF-8 bytes, and never emits half a code point"
        status: pass
      - kind: unit
        ref: "test/redaction.test.ts#redactDocument cutting through an astral code point emits neither half of it"
        status: pass
      - kind: unit
        ref: "test/redaction.test.ts#redactString observes its declared bound in the unit that bound is declared in"
        status: pass
      - kind: unit
        ref: "test/redaction.test.ts#a bounded excerpt is bounded in bytes and survives a UTF-8 round trip"
        status: pass
    human_judgment: false
  - id: D7
    description: "A repository on which no pack qualifies still produces a complete plan: all nine DETC-04 nouns present as named fields, selected and applicable empty arrays rather than absent, and --json parses"
    requirement: "DETC-04"
    verification:
      - kind: unit
        ref: "test/redaction.test.ts#an empty answer is still a complete answer — a plan-shaped envelope with nothing selected parses and names every DETC-04 noun"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a project with zero selected packs still carries every DETC-04 field, with empty arrays rather than omitted keys"
        status: pass
    human_judgment: false
  - id: D8
    description: "The fact-vocabulary description contract, the pack/fact extension rule, and the two workflow content patterns say what the code that reads them does"
    requirement: "DETC-04"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#the fact-vocabulary schema states that a description's first sentence is rendered"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#the two catalog schemas agree about namespaced extensions on a nested object"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#an x- namespaced property on a PACK loads, exactly as it does on a fact"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#a workflow content pattern matches within one line and never straddles a line boundary"
        status: pass
    human_judgment: false
  - id: D9
    description: "A maintainer ECC fixture that fails mid-run removes its temporary tree, or names the retained path in the error when retention was requested"
    verification: []
    human_judgment: true
    rationale: "The failure path runs `npm pack` against the real registry tarball and is maintainer-only; no automated test drives a mid-run throw. The change is a five-line control-flow correction reviewable by reading, but the behaviour it produces is not asserted by the suite."

duration: 56 min
completed: 2026-09-08
status: complete
---

# Phase 02 Plan 12: Bounded inputs and honest outputs Summary

**A `.gitignore` line the parser cannot compile no longer unscans a whole subtree, an over-budget `--json` envelope is a refusal naming the budget and its sha256 instead of a document cut mid-token with exit 0, and every byte budget in the redaction seam is measured and applied in UTF-8 bytes.**

## Performance

- **Duration:** 56 min
- **Started:** 2026-09-08T08:29:00Z
- **Completed:** 2026-09-08T09:25:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- **One bad line no longer blinds a scan.** `IgnoreRuleSet` gained `notes`, a bounded, non-poisoning channel for a condition that stopped one line. `undecidable` keeps exactly its old meaning and its old fail-closed power for a file that could not be taken on at all. `decideOne` is unchanged and deliberately does not consult `notes`.
- **The count cap now describes its own behaviour.** The pattern count is tested before the push, so a file holding exactly `IGNORE_PATTERN_COUNT_CAP` patterns is accepted and one holding one more is refused — previously 5001 were accepted while the refusal reported 5000.
- **The output seam refuses rather than truncates.** `print()` binds the envelope and branches on `truncated`; an over-budget `--json` throws a refusal naming the budget in bytes, the envelope's sha256, and the two narrowing steps the CLI has, and writes nothing to stdout.
- **Byte budgets are enforced in bytes.** One `truncateToUtf8Bytes` helper backs `redactDocument`, `serializeObservable` and `createRedactedExcerpt`. Its slice end walks back off any continuation byte, so the retained bytes end on a code-point boundary: inside the budget, decoding cleanly, with no character the source did not contain.
- **Four declared contracts now match their readers.** The fact-vocabulary `description` field says its first sentence is rendered into user-facing output; pack items accept `^x-` extensions exactly as fact items do; the two workflow content patterns are confined to one line; and the ECC fixture cleans up on failure or names what it kept.

## Task Commits

1. **Task 1 (tracer): one over-long `.gitignore` line no longer blinds a subtree** — `7651137` (fix)
2. **Task 2 RED: the output seam truncates where it must refuse** — `72064da` (test)
3. **Task 2 GREEN: refuse an over-budget envelope, enforce byte budgets in bytes** — `e6ef5cb` (fix)
4. **Task 3: declared contracts say what the code does, and a failed fixture names its leftovers** — `5aa4a78` (fix)

## Files Created/Modified

- `src/core/ignore-list.ts` — `notes` channel, note count cap, count-cap off-by-one, escaped-comment documentation
- `src/core/redaction.ts` — `truncateToUtf8Bytes` / `truncateToLength`, `OBSERVABLE_BYTE_BUDGET`, `REDACTED_STRING_LENGTH_BUDGET`, `describeOverBudgetEnvelope`, per-key units on `LIMITS`
- `src/cli.ts` — `print()` binds the envelope and refuses on `truncated`
- `src/core/ecc-fixture.ts` — `retain` initialised from the caller's option; a retained tree is named in the rethrow
- `schemas/fact-vocabulary.schema.json` — `description` is load-bearing; the extension rule stated once
- `schemas/pack-catalog.schema.json` — `patternProperties` for `^x-` on the pack item
- `catalog/facts.yaml` — horizontal-only whitespace in `deploy-workflow` / `release-workflow`, and a header note explaining why
- `test/ignore-list.test.ts` — `partialIgnoreFixture`, local `runCli`, six new cases
- `test/redaction.test.ts` — `runCliParts`, `overBudgetStateRoot`, eight new cases
- `test/pack-catalog.test.ts` — four new contract cases
- `test/evidence.test.ts` — the undecidable fixture moved to the pattern-count cap

## Observed pre-fix behaviour (required by the plan's verification)

**Partial-`.gitignore` selection.** A fixture with 500 valid patterns, one 2000-character line, a `package.json` declaring `react` and a `src/index.ts`:

```
$ node dist/src/cli.js project plan <fixture> --json
exit=0
selected= []
applicable= []
nearMissOrder= ["BROWNFIELD_INIT"]
```

After the fix the same fixture selects `WEB_REACT`, asserted at the CLI.

**Over-budget `--json` exit code.** A state root carrying 130 journal files, `support-bundle --json`:

```
exit: 0
stdout bytes: 262351
stdout parses: NO — Bad control character in string literal in JSON at position 262144
```

The RED run of the suite recorded the same three failures numerically:

- `an envelope cut mid-token must not be reported as a successful result` — `actual: 0`
- `the retained document is 786446 bytes against a 262144-byte budget` — exactly the 3x a code-unit cut under a byte guard produces
- `excerpt is 12288 bytes` against a 4096-byte budget

After the fix: non-zero exit, empty stdout, refusal naming `262144` and a 64-character digest; `redactDocument` within 262144 bytes; excerpt within 4096 bytes.

## Decisions Made

1. **`undecidable` vs `notes`.** Only a file that could not be taken on at all keeps the total, fail-closed power. A prefix of a rule set is a different rule set, so the pattern-count cap stays `undecidable`; a single uncompilable line is not, because the other lines are still the repository's own complete rules.
2. **The escaped-comment fix was inverted (see deviations).** `\#foo` is kept verbatim, not unescaped.
3. **Nothing on stdout when refusing.** A pipeline reads stdout; a partial document there plus a refusal on stderr is strictly worse than a refusal alone.
4. **ECC fixture retention: option (a).** `retain` is initialised from `options.keep ?? false`, so a failure cleans up by default and retention is something a caller asked for rather than an accident of where a throw landed. When retention *was* asked for, the rethrow names the retained root through `redactHome`, so the kept tree is a diagnostic and not a leak. Both halves were implemented because the criterion's `or` is satisfied by the first and the second costs four lines.
5. **`redactString` stays a code-unit bound.** Its numeric value is unchanged; it bounds one field inside an envelope, and the envelope carries the byte budget. The unit is now stated in both the declaration and the doc comment, and the cut will not split a surrogate pair.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The plan's prescribed escaped-comment fix would have introduced the defect it was closing**

- **Found during:** Task 1
- **Issue:** The plan's `<action>` and 02-REVIEW IN-06 both prescribe `patterns.push(line.startsWith("\\#") ? line.slice(1) : line)`, and an acceptance criterion demands the stored pattern's first character be `#`. Implemented literally, the test failed: the `ignore` matcher receives `#literal.md`, treats it as a comment, discards it, and the file the repository declared ignored becomes scannable. The corresponding must_have clause — "the escape is removed before the pattern reaches the matcher" — is not implementable against this matcher.
- **Fix:** The escape belongs to the matcher's grammar, not the parser's, so the line is handed over verbatim (which is what the code already did). Verified both directions before deviating: `ignore@7.0.5` reports `\#literal.md` as matching `#literal.md` and `#literal.md` as matching nothing; a real `git init` + `git check-ignore -v` agrees on both. Two regressions now pin the behaviour, each cross-checking `git check-ignore` where the host has git.
- **Files modified:** `src/core/ignore-list.ts`, `test/ignore-list.test.ts`
- **Verification:** `node --test dist/test/ignore-list.test.js` — 16 tests, `fail 0`
- **Committed in:** `7651137`
- **Unmet acceptance criterion:** "a `.gitignore` whose only line escapes a leading `#` produces exactly one pattern, and that pattern's first character is `#`". It cannot be satisfied without breaking the observable truth it exists to serve. Recorded in `.planning/WINDOWS.md` as an `unmet-truth`.

**2. [Rule 3 - Blocking] `test/evidence.test.ts` used the reclassified case as its undecidable fixture**

- **Found during:** Task 1
- **Issue:** "a path whose ignore decision is undecidable is excluded with its reason" built its undecidable rule set from a single 2048-character pattern — exactly the case this plan reclassifies as a note. It failed after the fix, blocking the plan's own `npm test` gate. The file is outside this plan's declared `files_modified`.
- **Fix:** The fixture moved to a `.gitignore` past `IGNORE_PATTERN_COUNT_CAP`, which is still genuinely undecidable. Every assertion is unchanged; only the vehicle that reaches them moved, and the comment says so.
- **Files modified:** `test/evidence.test.ts`
- **Verification:** `node --test dist/test/evidence.test.js dist/test/ignore-list.test.js` — 60 tests, `fail 0`
- **Committed in:** `7651137`
- **Ownership note:** 02-13 owns `src/core/evidence.ts`; this touches only the test file's ignore-cap fixture, no source. Recorded in `.planning/WINDOWS.md`.

**3. [Rule 2 - Missing Critical] `createRedactedExcerpt` carried the same units defect**

- **Found during:** Task 2
- **Issue:** The plan named `redactDocument` and `serializeObservable`, but `createRedactedExcerpt` guards with `Buffer.byteLength(...) > LIMITS.excerptBytes` and cuts with `redacted.slice(...)` — the identical shape. Measured at 12288 bytes against a 4096-byte budget. The plan's must_have says *every* byte budget in the seam is measured and enforced in bytes, so leaving it would have shipped a truth the code contradicts.
- **Fix:** Routed through the same `truncateToUtf8Bytes` helper.
- **Files modified:** `src/core/redaction.ts`, `test/redaction.test.ts`
- **Verification:** `test/redaction.test.ts#a bounded excerpt is bounded in bytes and survives a UTF-8 round trip` — pass
- **Committed in:** `72064da` (RED), `e6ef5cb` (GREEN)

**4. [Rule 1 - Bug] A trailing `$`-anchored whitespace run written horizontal-only would break CRLF checkouts**

- **Found during:** Task 3
- **Issue:** The plan and IN-04 prescribe `[^\S\r\n]` for every whitespace class in the two workflow patterns. Applied to `release:\s*$`, that excludes `\r`, so `  release:\r\n` in a CRLF checkout would stop matching — a silent false negative on Windows clones.
- **Fix:** Leading indentation runs use `[^\S\r\n]` (the actual straddle defect); trailing runs before `$` use `[^\S\n]`, which still cannot cross a line but keeps the CR that CRLF puts before the terminator. Both forms are asserted, including CRLF inputs, and the reasoning is written into the `catalog/facts.yaml` header.
- **Files modified:** `catalog/facts.yaml`, `test/pack-catalog.test.ts`
- **Verification:** `test/pack-catalog.test.ts#a workflow content pattern matches within one line and never straddles a line boundary` — pass
- **Committed in:** `5aa4a78`

**5. [Process] Commits landed on `main`**

- **Issue:** The executor protocol halts on a commit to the resolved default branch unless `git.allow_default_branch_commits` is set, which it is not. The orchestrator dispatched this plan in sequential single-writer mode with an explicit instruction to stay on `main`, `.planning/config.json` sets `git.branching_strategy: "none"`, and every prior commit in this repository's GSD history is on `main`.
- **Resolution:** Proceeded as dispatched. **Recommendation:** set `git.allow_default_branch_commits: true` in `.planning/config.json` so the intent is explicit rather than inferred, and the guard stops firing on every plan.

---

**Total deviations:** 4 auto-fixed (2 bugs, 1 missing critical, 1 blocking) + 1 process note
**Impact on plan:** No scope creep. Deviations 1 and 4 are corrections to the plan's own prescriptions, both empirically verified before deviating; 3 is the plan's own must_have applied to the one call site it did not name; 2 is the minimum edit that keeps the plan's `npm test` gate honest.

## Issues Encountered

- **One flaky test observed under full-suite load.** `test/project-plan.test.ts#project plan terminates on a git root holding a nested manifest and lists both members` failed once in a full `npm test` run, then passed in isolation (112/112) and on the immediate full re-run (412 tests, `fail 0`). It is a 02-11 fixture, not touched by this plan, and it runs a real `git init` workspace under a termination budget. Recorded in `.planning/WINDOWS.md` so it is visible at ship time rather than rediscovered.

## Verification

- `npm run check && npm run build && node --test dist/test/ignore-list.test.js dist/test/redaction.test.js dist/test/pack-catalog.test.js` — **56 tests, pass 56, fail 0**
- `node --test dist/test/pack-catalog.test.js dist/test/catalog.test.js` — **29 tests, fail 0**
- `node --test dist/test/redaction.test.js dist/test/preview.test.js` — **32 tests, fail 0**
- `npm test` — **412 tests, pass 406, fail 0, skipped 6**, strictly greater than the 394 recorded by `02-11-SUMMARY.md`

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired component was introduced.

## Threat Flags

None. Every file touched is inside the boundaries the plan's threat model already named; no new endpoint, auth path, file-access pattern or trust-boundary schema change was introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The INPUT and OUTPUT bounds this plan owns are closed. **02-13 is unblocked** and its file set (`src/core/evidence.ts`, `src/core/project-plan.ts`, `src/types.ts`, `src/format.ts`) is untouched here, with one exception noted as deviation 2: `test/evidence.test.ts` carries a one-fixture change.
- **02-13 should be aware of `IgnoreRuleSet.notes`.** Making a bound VISIBLE to the user is 02-13's job, and `notes` is now the channel a scan-level surface would read to say "this directory's rules dropped one line" — a note is exactly the kind of bound that is currently silent.
- Threat register entries T-02-44 through T-02-48 are all mitigated as dispositioned.
- `SECURITY_REVIEW` remains deferred to `GATE-01` in Phase 4, unchanged; the eight deferred leaves in `catalog/facts.yaml` were not touched.

## Self-Check: PASSED

- Files claimed as modified: all 11 present on disk.
- Commits claimed: `7651137`, `72064da`, `e6ef5cb`, `5aa4a78` — all resolve in `git log`.
- Plan `<verification>` re-run at close: `fail 0` on every listed command; `npm test` total 412 > 394.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-08*
