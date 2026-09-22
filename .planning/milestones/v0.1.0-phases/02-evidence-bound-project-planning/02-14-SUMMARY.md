---
phase: 02-evidence-bound-project-planning
plan: 14
subsystem: api
tags: [json-schema, ajv, validation, cli, redaction, threat-model]

requires:
  - phase: 02-evidence-bound-project-planning
    provides: "reconcileProjectState, the six pack states and the digest-gated removal (02-10); the approve digest contract (02-09); the widened ProjectCapabilityPlan disclosure fields (02-13)"
provides:
  - "schemas/approved-plan.schema.json — a closed-world contract for .alpha-aos/plan.json, authored to admit the two shapes plan 02-15 introduces"
  - "approved-plan as a first-class ManagedDocumentKind, so every managed document in the phase now travels validateManagedDocument"
  - "readApprovedProjectPlan(artifactPath, packageRoot) returning a discriminated present/absent/unreadable result"
  - "ApprovedArtifactState gains unreadable; ProjectReconciliation gains artifactIssues; both rendered in text and in --json"
  - "classifyInstalledPack exported, with array-ness established for every artifact-derived collection"
  - "removalAllowedRoots exported, raising a named ComponentPlanError instead of a bare Error"
  - "schemas/receipt.schema.json harness enum narrowed to exactly the keys of PROJECT_SKILL_ROOTS"
affects: [phase-3-capability-materialization, 02-15, receipt-writing, project-status, project-approve]

actuals:
  tokens: 112526
  tasks: 3
  commits: 6
  commits_measured_from: 5a4f9b03ad7b0e404e0ebb43108db48cfab971a6

plan_head_before: 5a4f9b03ad7b0e404e0ebb43108db48cfab971a6

tech-stack:
  added: []
  patterns:
    - "A repository-supplied document is defended twice: a closed schema at the door, and array-ness established at the consumer that reads it"
    - "A discriminated present/absent/unreadable read result, so absence and rejection are never collapsed into one null"
    - "Every string lifted out of a repository-supplied artifact is bounded at REDACTED_STRING_LENGTH_BUDGET and leaves through redactString"
    - "A closed-world schema is authored against the value shape at the END of a run, not the start, so no plan in the same run can make a writer emit what its own reader rejects"

key-files:
  created:
    - schemas/approved-plan.schema.json
  modified:
    - src/core/validation.ts
    - src/core/project-plan.ts
    - src/format.ts
    - src/cli.ts
    - schemas/receipt.schema.json
    - test/project-plan.test.ts
    - test/validation.test.ts

key-decisions:
  - "project status prints its whole report AND exits with the domain-refusal status when the approval artifact is unreadable — the reconciliation is derived from freshly recomputed evidence and stays true, so suppressing the report would cost the user more than the refusal buys"
  - "A non-conforming artifact field is reported as CHANGED naming .alpha-aos/plan.json rather than as a new PackState — the record and the world disagreeing is exactly what CHANGED already means, and a seventh state would have to be honoured by every consumer for no new information"
  - "The receipt schema's harness enum is narrowed to claude/codex/pi AND the bare Error becomes a named ComponentPlanError — the schema is the primary defence, the typed refusal is the backstop for a future harness added to one table and not the other"
  - "readReceiptClaims keeps its bare JSON.parse: it is the deliberately tolerant ownership path whose fail-closed answer is 'do not touch that path', and readPackReceiptsStrict is the strict route beside it"

patterns-established:
  - "Second-defence guards state at the guard WHY they exist beside the schema rather than instead of it"
  - "A schema property a later plan will require is declared now and left out of required, with a description telling the next editor not to narrow it"

requirements-completed: [DETC-05, DETC-06]

coverage:
  - id: D1
    description: ".alpha-aos/plan.json travels validateManagedDocument against a closed schema, exactly as every other managed document already does"
    requirement: "DETC-05"
    verification:
      - kind: unit
        ref: "test/validation.test.ts#a well-formed approved-plan artifact validates as a closed current document"
        status: pass
      - kind: unit
        ref: "test/validation.test.ts#each reproduced approved-plan poisoning is refused with a stable code"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a poisoned approval artifact makes project status a named refusal on the stale path"
        status: pass
    human_judgment: false
  - id: D2
    description: "unreadable, absent, current and changed are four distinguishable approval-artifact states in text and in --json"
    requirement: "DETC-06"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#every poisoned artifact shape is reported unreadable rather than absent"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#an absent approval artifact stays absent, with no validation issues"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a well-formed approval artifact over unchanged evidence still reports current"
        status: pass
    human_judgment: false
  - id: D3
    description: "The closed schema admits plan.hostNotes, a null safeInverse[].guard.expectedHash and an open approvals[].code, so plan 02-15 cannot make project approve emit an artifact project status rejects"
    requirement: "DETC-05"
    verification:
      - kind: unit
        ref: "test/validation.test.ts#the approved-plan schema admits the two shapes plan 02-15 introduces"
        status: pass
    human_judgment: false
  - id: D4
    description: "A validated document cannot crash the reconciliation: array-ness is established for every artifact-derived collection and a non-conforming field is reported rather than thrown"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a non-array leaf collection inside an approved plan is reported, never thrown"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#project status on an artifact carrying a non-array satisfied leaf reports rather than crashes"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every string the reconciliation renders out of the approved artifact is bounded at the per-value budget and passes through the redaction seam, so a repository cannot put unbounded prose above a removal digest"
    requirement: "DETC-06"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a stale sentence composed from an oversized artifact leaf renders a bounded line"
        status: pass
    human_judgment: false
  - id: D6
    description: "The support report compares the post-conflict noun on both sides: a pack still selected but newly conflicted is not reported as supported"
    requirement: "DETC-06"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a pack that is still selected but newly conflicted is not reported as supported"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a pack the artifact claims and current evidence does not select is still reported"
        status: pass
    human_judgment: false
  - id: D7
    description: "One corrupt receipt neither blocks plan approval nor hides half the reason when the removal set genuinely cannot be computed"
    requirement: "DETC-05"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#one corrupt receipt does not make plan approval impossible"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#a stale digest plus a corrupt receipt refuses naming both halves"
        status: pass
    human_judgment: false
  - id: D8
    description: "A schema-valid receipt cannot raise an uncaught error from the removal path: the receipt schema and the skill-root table agree, and the throw is a named refusal"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a harness with no project-local skill root is a named refusal, not a bare crash"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the receipt schema and the skill-root table agree about which harnesses exist"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a receipt naming a harness with no project-local root is refused at the door"
        status: pass
    human_judgment: false
  - id: D9
    description: "The built-in project-manifest core schema and the external project-stack contract agree on the manifest's field set (IN-05)"
    verification:
      - kind: unit
        ref: "test/validation.test.ts#the built-in project-manifest core schema accepts every field the external contract declares"
        status: pass
    human_judgment: false
  - id: D10
    description: "The DETC-06 happy path is unchanged: STALE names the missing fact, a digest-gated removal is offered, and nothing is deleted"
    requirement: "DETC-06"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#the DETC-06 happy path is unchanged: STALE names the fact, a removal is offered, nothing is deleted"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#an offered removal still applies through its own digest from the CLI, reporting paths and a transaction"
        status: pass
    human_judgment: false

duration: 68min
completed: 2026-09-08
status: complete
---

# Phase 02 Plan 14: Closing CR-04 and the receipt-shaped defects Summary

**`.alpha-aos/plan.json` now travels `validateManagedDocument` against a closed `approved-plan` schema, so a poisoned committed artifact is an `UNREADABLE-APPROVAL` refusal naming the file and a stable issue code instead of `((intermediate value) ?? []).filter is not a function`.**

## Performance

- **Duration:** 68 min
- **Started:** 2026-09-08T18:15:31Z
- **Completed:** 2026-09-08T19:23:29Z
- **Tasks:** 3
- **Files modified:** 8 (1 created, 7 modified)

## Accomplishments

- **The last untrusted document joined the strict route.** `readApprovedProjectPlan` no longer runs a bare `JSON.parse` with three shallow checks. It takes `(artifactPath, packageRoot)`, lazily memoizes `schemas/approved-plan.schema.json` the way `receiptSchema` is memoized, and returns a discriminated `present | absent | unreadable` result. Returning `null` for both an absent artifact and a malformed one is exactly what hid the difference; a user is now told *why* there is no approved plan.
- **The schema is authored against the END of this run, not its start.** `approvalArtifactBytes` serializes the entire `ProjectCapabilityPlan`, so a schema authored against today's shape would have made `project approve` emit an artifact `project status` then rejects — re-breaking the DETC-06 path this plan exists to fix. `plan.hostNotes` is declared and deliberately left out of `plan.required`; `plan.safeInverse[].guard.expectedHash` is `["string","null"]`; `plan.approvals[].code` is a plain string with no `enum`. Each carries a `description` telling the next editor not to narrow it.
- **Two independent defences, and the second one says why it exists.** `classifyInstalledPack` establishes array-ness for every collection lifted out of the artifact rather than guarding only against nullish values, and a non-conforming field is reported as `CHANGED` naming `.alpha-aos/plan.json` rather than raised. The guard is now directly testable — `classifyInstalledPack` is exported.
- **Repository-authored prose above a removal digest is bounded.** Every string `StaleReason` composes from the artifact is capped at `REDACTED_STRING_LENGTH_BUDGET` and leaves through `redactString`. A 100 000-character leaf name used to render a 100 136-character `STALE-FACT` line immediately above a removal a user was being asked to approve.
- **One corrupt receipt no longer makes plan approval impossible.** The CLI computes the current plan digest through the same revalidation the apply runs and consults the strict removal set only when the supplied digest is not that digest — restoring the `RECEIPT_UNREADABLE` tolerance the approve flow was deliberately written to have.

## Task Commits

1. **Task 1 (tracer): the committed artifact travels the strict route**
   - RED — `ae2c427` (test)
   - GREEN — `6c599cd` (feat)
2. **Task 2: reconciliation cannot be crashed, flooded or mis-reported**
   - RED — `02b4865` (test)
   - GREEN — `3432d4e` (fix)
3. **Task 3: one corrupt receipt neither blocks approval nor crashes removal**
   - RED — `1a9f8ea` (test)
   - GREEN — `73e4448` (fix)

## Files Created/Modified

- `schemas/approved-plan.schema.json` — **created.** Closed-world contract for `.alpha-aos/plan.json`, modelled on `schemas/receipt.schema.json` in every structural respect: `additionalProperties: false` at each object level, an explicit `required` list, and every array element typed. The three shapes 02-15 introduces are typed up front with a `description` on each explaining why.
- `src/core/validation.ts` — `approved-plan` added to `ManagedDocumentKind`, `OWNED_SUBTREE` and `CORE_SCHEMAS`; `CORE_SCHEMAS["project-manifest"]` mirrors `packOverrides` and `securityReview` from the external contract (IN-05).
- `src/core/project-plan.ts` — `ApprovedPlanRead` union and the rewritten `readApprovedProjectPlan`; `ApprovedArtifactState` gains `unreadable`; `ProjectReconciliation` gains `artifactIssues`; `artifactLeaves` / `artifactStringArray` second-defence helpers; `boundedArtifactText` and the module-scoped `ARTIFACT_TEXT_CONTEXT`; `classifyInstalledPack` and `removalAllowedRoots` exported; the `unsupportedClaims` comparison fixed.
- `src/format.ts` — `UNREADABLE-APPROVAL` line naming the artifact and each issue's stable code, deliberately not reusing the `changed` wording.
- `src/cli.ts` — `project status` exits with the domain-refusal status when the artifact is unreadable, after printing the whole report; the approve branch's removal lookup is conditional and its failure names both halves.
- `schemas/receipt.schema.json` — `harness` enum narrowed to `["claude","codex","pi"]`.
- `test/project-plan.test.ts` — `poisonedApprovalFixture`, `corruptReceiptFixture`, `unapprovedPostgresFixture` and 18 new tests.
- `test/validation.test.ts` — the approved-plan schema's own acceptance and refusal cases, the 02-15 forward-compatibility case, and the IN-05 case.

## Observed pre-fix output (the verifier asked for these verbatim)

**Poisoned-artifact assertion** — `project status` against a fixture whose `evaluations[i].satisfied` is a string and whose selecting evidence was removed:

```
alpha-aos: ((intermediate value) ?? []).filter is not a function
```

Zero bytes on stdout, exit 2. The reproduction matches 02-REVIEW CR-04 exactly. Two further pre-fix observations from the same commit: the reconciliation carried no `artifactIssues` field at all (`envelope.reconciliation.artifactIssues is not iterable`), and a poisoned artifact whose `approvedDigest` still matched the current plan was accepted as `already-current` — the 02-REVIEW W-1 exposure, reproduced as `actual: 'already-current', expected: 'written'`.

**Corrupt-receipt approval assertion** — `project approve <fixture> --plan-digest <the CURRENT plan digest> --apply`:

```
alpha-aos: .alpha-aos/receipts/CORRUPT.json is not a valid receipt, so what it claims is refused rather than partly trusted: syntax.malformed@/
```

Exit 2. The approve flow's own `RECEIPT_UNREADABLE` tolerance never got a chance to run.

**Conflicted-claim assertion** — a pack still selected but newly conflicted by an unowned target:

```
a still-selected but newly conflicted pack was reported as supported: []
```

**Bounded-prose assertion** — a schema-valid artifact carrying a 100 000-character leaf name:

```
a STALE-FACT line ran to 100136 characters, past the 2048 per-value bound
```

**Receipt/skill-root disagreement:**

```
the receipt schema permits a harness PROJECT_SKILL_ROOTS does not carry, so the removal path is reachable with no root
+   'antigravity',
+   'hermes',
```

## Note Phase 3 must receive

**`schemas/receipt.schema.json` narrowed its `harness` enum from `["claude","codex","antigravity","pi","hermes"]` to `["claude","codex","pi"]`.** Phase 3 is the phase that *writes* receipts, so this constrains it directly: a receipt naming `antigravity` or `hermes` is now refused at the door by `readPackReceiptsStrict`. The enum is exactly the key set of `PROJECT_SKILL_ROOTS` in `src/core/project-plan.ts`, and a test asserts the two agree — adding a harness to one without the other fails that test rather than reopening the crash. If Phase 3 needs project-scope delivery for a fourth harness, the correct order is: add the project-local skill root to `PROJECT_SKILL_ROOTS` first, then the enum follows.

## Decisions Made

- **`project status` prints its whole report *and* exits 2 when the artifact is unreadable.** The reconciliation is derived from freshly recomputed evidence, so every pack state it reports stays true even when the artifact is refused; suppressing the report would cost a user more than the refusal buys. The exit status is what carries "the artifact was REJECTED, not merely missing".
- **A non-conforming artifact field reports `CHANGED`, not a new seventh `PackState`.** "The record and the world disagree" is exactly what `CHANGED` already means, and a new state would have to be honoured by every consumer for no information a caller does not already get from the detail line and `artifactIssues`.
- **Both the narrowed receipt enum and the named `ComponentPlanError` shipped.** The plan offered them as alternatives ("either… or"); shipping only the schema would leave a bare `Error` one table-edit away from being reachable again, and shipping only the refusal would leave an invalid receipt accepted at the door.
- **`readReceiptClaims` keeps its bare `JSON.parse`.** It is the deliberately tolerant ownership path — its only question is "did alpha-AOS write this file?" and its fail-closed answer is "do not touch that path". `readPackReceiptsStrict` is the strict route beside it, and this plan did not collapse the two. The prohibition "a managed document must not be read with a bare parse" is satisfied for the *authoritative* read of every managed document; the tolerant ownership read is a documented, pre-existing exception 02-10 shipped on purpose.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The existing planted-artifact fixture became a rejected document**

- **Found during:** Task 1 (GREEN)
- **Issue:** `a planted plan artifact claiming a pack the evidence does not support reports CHANGED` planted a four-key stub as `.alpha-aos/plan.json`. Under the new closed schema that stub is a *rejected* document, so the test's `artifactState` became `unreadable` instead of `changed` — it had stopped testing what it was written to test.
- **Fix:** The fixture now builds its planted artifact from a REAL plan value for that root and edits `selected`, `applicable` and `evidenceDigest`, so it stays a schema-valid record that disagrees with the world. The test's meaning — a stored artifact is a record of what was approved, never an authority about what is true now — is unchanged.
- **Files modified:** `test/project-plan.test.ts`
- **Verification:** The test passes and still asserts `artifactState === "changed"`, `unsupportedClaims` names the pack, and the pack reports `CHANGED`.
- **Committed in:** `6c599cd`

**2. [Rule 2 - Missing Critical] `removalAllowedRoots` had no way to name the receipt**

- **Found during:** Task 3
- **Issue:** The plan requires the refusal to name "the receipt path, the harness, and the target path", but `removalAllowedRoots(canonicalRoot, targets)` received only `RemovalTarget[]`, which carries no receipt path. A refusal that cannot name the offending receipt is not the next step D-13 requires.
- **Fix:** The signature gained a third parameter, `receiptPath`; `applyPackRemoval` passes `removal.receiptPath`, which it already holds.
- **Files modified:** `src/core/project-plan.ts`
- **Verification:** `a harness with no project-local skill root is a named refusal, not a bare crash` asserts all three appear in the message.
- **Committed in:** `73e4448`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both were necessary for the plan's own acceptance criteria to be satisfiable. No scope creep; no file outside `files_modified` was touched.

## Issues Encountered

None. Every RED gate failed for the reason it was written to fail, and every acceptance criterion was verified by running the command that proves it before the task was committed.

## Verification Results

| Check | Result |
|---|---|
| `npm run check` | exit 0 |
| `npm run build` | exit 0 |
| `node --test dist/test/project-plan.test.js dist/test/validation.test.js` | **158 tests, pass 158, fail 0** |
| `npm test` | exit 0 — **452 tests, pass 446, fail 0, skipped 6** |

The 6 skipped tests are pre-existing host-capability skips, unchanged from the 429/423/0/6 floor 02-13 left behind.

**`npm test` total is 452.** That is the floor sibling plan 02-15 gates against.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **02-15 is unblocked and its two shape changes are already admitted.** `schemas/approved-plan.schema.json` declares `plan.properties.hostNotes` (deliberately absent from `plan.required` — 02-15 owns tightening it), types `plan.safeInverse[].guard.expectedHash` as `["string","null"]`, and leaves `plan.approvals[].code` an open string so `TARGET_UNREADABLE` needs no schema edit. `test/validation.test.ts#the approved-plan schema admits the two shapes plan 02-15 introduces` proves all three today.
- **DETC-05 is declared by 02-15 as well**, so it stays open under the shared-ID gate until 02-15 produces its summary. DETC-06 is complete.
- **Phase 3 carries one inherited constraint**, recorded above: the narrowed receipt `harness` enum.
- **Still deferred, unchanged:** DETC-06's "previously installed" covering a pack approved but never materialized (broken-windows entry #15, deferred to Phase 3 because Phase 3 owns receipt writing), and the DETC-06 edge-probe row `unclassified`, carried as a flagged assumption rather than silently dropped.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-08*

## Self-Check: PASSED

- `schemas/approved-plan.schema.json` — FOUND on disk
- `.planning/phases/02-evidence-bound-project-planning/02-14-SUMMARY.md` — FOUND on disk
- Commits `ae2c427`, `6c599cd`, `02b4865`, `3432d4e`, `1a9f8ea`, `73e4448`, `db9a3de` — all FOUND in `git log`
- `npm test` re-run at HEAD: exit 0, 452 tests, fail 0
