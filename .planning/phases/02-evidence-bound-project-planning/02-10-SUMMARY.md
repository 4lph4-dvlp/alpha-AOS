---
phase: 02-evidence-bound-project-planning
plan: 10
subsystem: api
tags: [detc-06, stale, reconciliation, receipt, removal-plan, git-context, d-14, d-15, undecidable, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-09's approveProjectPlan, the .alpha-aos/plan.json artifact that persists the approved fact set, and the assertPlanUnchanged digest contract"
  - phase: 02-evidence-bound-project-planning
    provides: "02-08's nine DETC-04 nouns, targetPreState with ownedByReceipt, PROJECT_RECEIPT_DIRECTORY, and sealPlan"
  - phase: 02-evidence-bound-project-planning
    provides: "02-07's evaluate-all evaluator, so every pack carries both satisfied and failed leaves"
  - phase: 02-evidence-bound-project-planning
    provides: "02-06's complete evidence envelope and its UNDECIDABLE classification for a non-ENOENT read"
  - phase: 02-evidence-bound-project-planning
    provides: "02-05's test/helpers/git-fixture.ts real-repository builders"
  - phase: 01-safe-operation-boundary
    provides: "applyFileTransaction's journal and snapshot, proveOperationPaths, withComponentSession, reviewedDigest, and the print() redaction seam"
provides:
  - "reconcileProjectState: six honest states per installed pack — CURRENT, STALE, DRIFTED, CHANGED, CONFLICT, UNDECIDABLE — derived by RECOMPUTING evidence, never by trusting .alpha-aos/plan.json"
  - "readPackReceiptsStrict: every receipt through the one managed-document route; a malformed one refuses by path rather than producing a half-trusted ownership answer"
  - "StaleReason: one entry, and one rendered line, per fact that selected a pack and is now absent — never a merged summary"
  - "readGitContext: branch and commit read from .git with no subprocess, handling a gitdir: pointer, commondir, a loose ref, packed-refs and a detached HEAD, with every read byte-capped"
  - "ApprovedProjectPlanArtifact.gitContext — recorded BESIDE the plan, so it stays out of digestablePlan by construction"
  - "describeGitDifference: D-15's sentence that distinguishes a checkout from a real removal"
  - "planPackRemoval + applyPackRemoval: an approval-gated, journaled, snapshotted removal offered ONLY for a STALE pack"
  - "alpha-aos project status [path] [--project <rel>] [--json], registered in the SAFE-01 preview enumeration"
  - "formatProjectStatus: the report, with STALE-FACT and UNDECIDABLE-PATH lines and a capped DETAIL column"
affects: [phase-3-capability-materialization, receipt-writer, rollback, gate-01]

actuals:
  tokens: 22870
  tasks: 3
  commits: 6

plan_head_before: 8a28b44a49240ef909699114ff6e049bc8086abc

tech-stack:
  added: []
  patterns:
    - "Order-of-consequence classification: a pack state is decided by the first rule that applies, and the order is the contract"
    - "Absence and unreadability stay different facts one layer up: UNDECIDABLE never becomes STALE, so a permission error can never motivate a removal"
    - "Context recorded beside a digested value rather than inside it, so exclusion from the digest is structural rather than remembered"
    - "One digest contract reused for a second operation: a removal is approved through the same approve verb, so the phase has exactly one writer"

key-files:
  created: []
  modified:
    - src/core/project-plan.ts
    - src/format.ts
    - src/cli.ts
    - src/core/evidence.ts
    - test/project-plan.test.ts
    - test/preview.test.ts
    - test/helpers/git-fixture.ts

key-decisions:
  - "STALE vs CHANGED is discriminated by whether a specific approved fact can be NAMED as having flipped, not by an evidence-digest comparison: removing a dependency always moves the evidence digest, so the digest cannot separate the two, and naming the fact can"
  - "A declared dependency fact's `named` is its fact id, not a package name: the envelope records that the fact matched and which manifest answered, never which of its declared alternatives it was, so claiming one would be a guess — the specific names reach the user through the negative record's own enumerating reason"
  - "The branch and commit live BESIDE `plan` in the approval artifact, so `digestablePlan` — a literal listing exactly what a reviewer reviewed — cannot reach them and no commit can invalidate an approval"
  - "A removal is approved through the EXISTING approve verb with the removal plan's digest rather than a new command or a `status --apply`, so there is exactly one writer in the phase"
  - "A removal's allowedRoots are the project-local skill roots that own its targets, never the canonical root, so the transaction's containment check is not vacuous"
  - "Only a STALE pack is offered a removal: a DRIFTED, CONFLICT, CHANGED or UNDECIDABLE pack is never offered one, which is what stops an unreadable evidence file from motivating a deletion"
  - "Per-fact lines use hyphenated codes (STALE-FACT, UNDECIDABLE-PATH) because a bare `STALE ` is also the opening of the state table's own row"

patterns-established:
  - "Reconciliation as a pure read: the whole fixture tree, including .alpha-aos/, is asserted byte-identical before and after"
  - "A removal digest that covers each target's CURRENT hash, so drift refuses through the same recompute-and-compare an approval uses rather than a second mechanism"
  - "A sentence with exactly one producer and one parser, co-located: undecidableReason / parseUndecidableReason in evidence.ts"

requirements-completed: [DETC-06]

coverage:
  - id: D1
    description: "reconcileProjectState classifies every installed pack into one of six honest states by recomputing evidence rather than trusting the stored artifact"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#an installed pack whose evidence and target bytes are unchanged reports CURRENT"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#removing the dependency that selected an installed pack reports STALE"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#editing an installed target's bytes reports DRIFTED"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a pack whose target holds a file alpha-AOS did not write reports CONFLICT"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a planted plan artifact claiming a pack the evidence does not support reports CHANGED"
        status: pass
    human_judgment: false
  - id: D2
    description: "An evidence file that exists but cannot be read reports UNDECIDABLE carrying the errno and path, and is never reported STALE"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#an evidence file that exists but cannot be read reports UNDECIDABLE with the errno and path"
        status: pass
    human_judgment: false
  - id: D3
    description: "A malformed receipt refuses by name rather than producing a partially trusted ownership answer"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a malformed receipt refuses by name rather than producing a partially trusted state"
        status: pass
    human_judgment: false
  - id: D4
    description: "The STALE report names the missing fact, one line per fact, not merely the pack"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a STALE line names the missing fact by name, not merely the pack"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#two facts that disappeared for one pack emit two distinct STALE lines"
        status: pass
      - kind: e2e
        ref: "node dist/src/cli.js project status <stale fixture> — STALE-FACT line names DB_POSTGRES and pg"
        status: pass
    human_judgment: false
  - id: D5
    description: "The branch and commit are read from the filesystem with no subprocess, across loose refs, packed refs, detached HEAD and an unparseable .git"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#readGitContext reports an ordinary repository's branch and commit from the filesystem"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#readGitContext reports a detached HEAD's commit and never guesses a branch"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#readGitContext resolves a branch tip from packed-refs when the loose ref is gone"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#readGitContext reports an unparseable .git state as unavailable rather than guessing"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the status path reads git from the filesystem and spawns no subprocess"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-15: a branch switch that removes evidence yields STALE AND a branch-differs note; one that removes nothing yields the note and no STALE; no commit moves any digest"
    requirement: "DETC-06"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a branch switch that removes evidence yields STALE and a branch-differs note together"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a branch switch that removes no evidence yields no STALE and still reports the differing branch"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#an irrelevant commit leaves every digest unchanged while the reported commit differs"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-14: a stale pack is offered an approval-gated removal plan, and nothing is deleted to say so"
    requirement: "DETC-06"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a stale pack yields a removal plan naming every target, its guard hash and its own digest"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a pack that is not stale is offered no removal plan"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#approving a removal plan's digest removes exactly the named targets and produces a journal id"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#approving a removal plan whose target bytes changed refuses with the drift code"
        status: pass
    human_judgment: false
  - id: D8
    description: "`project status` is a read: it prints the report and the approval command, has no --apply, and leaves the tree byte-identical"
    requirement: "DETC-06"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#project status against a stale fixture leaves every target present with an unchanged hash"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project status prints the removal plan, its digest and the command that approves it"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project status has no --apply, so status can never be the thing that deletes"
        status: pass
      - kind: integration
        ref: "test/preview.test.ts#PREVIEW_INVOCATIONS project status — SAFE-01 tracer"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#reconciling changes nothing on disk, including under .alpha-aos"
        status: pass
    human_judgment: false
  - id: D9
    description: "The Phase 3 gate is still shut: `project sync --apply` remains refused at phase close"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#project sync --apply is still refused, so this phase did not open the Phase 3 gate"
        status: pass
    human_judgment: false

duration: 118 min
completed: 2026-09-08
status: complete
---

# Phase 02 Plan 10: Reconciling an installed pack against what is true now — Summary

**`alpha-aos project status` reconciles every receipt against freshly recomputed evidence into six honest states, names the specific fact that disappeared on its own line, distinguishes a branch switch from a real removal without spawning git, and offers a journaled removal that a human must approve by digest — deleting nothing to say any of it.**

## Performance

- **Duration:** 118 min
- **Started:** 2026-09-07T20:03:02Z
- **Completed:** 2026-09-07T21:01:00Z (wall clock spans the full-suite runs)
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- **Six states, derived by recomputation.** `reconcileProjectState` reads every `.alpha-aos/receipts/<packId>.json` through the strict validator, re-collects evidence, and classifies each installed pack `CURRENT`, `STALE`, `DRIFTED`, `CHANGED`, `CONFLICT` or `UNDECIDABLE`. `.alpha-aos/plan.json` contributes exactly one thing — the fact set that was approved — and is never an authority about what is true now. An artifact whose evidence digest disagrees with a fresh collection reports `artifactState: "changed"` and every pack it claims without support is named in `unsupportedClaims`.
- **`STALE` names the fact, one line per fact.** The report emits `STALE-FACT DB_POSTGRES — the \`postgres-driver\` fact (A PostgreSQL driver is a declared dependency) that selected it is gone: no dependency manifest at the canonical root declares any of: pg, postgres, …`. Two facts that disappeared produce two lines, never a merged summary.
- **`UNDECIDABLE` is not `STALE`.** An evidence file that exists but fails a non-ENOENT read is classified with its errno and path. `STALE` asserts the evidence is GONE and a permission error does not establish that — which is also why an `UNDECIDABLE` pack is never offered a removal.
- **The branch context, offline.** `readGitContext` parses `.git` as a directory or a `gitdir:` pointer, follows `commondir` for a linked worktree, resolves a loose ref then `packed-refs`, handles a detached HEAD, caps every read by a named constant, and reports an unparseable state as unavailable rather than guessing. No subprocess runs, asserted by a test that greps the module for every `child_process` spelling.
- **A commit cannot invalidate an approval.** The branch and commit are recorded BESIDE `plan` in the approval artifact, so `digestablePlan` cannot reach them. A test commits an irrelevant change on a real fixture repository and observes `inputsDigest`, `evidenceDigest` and `planDigest` all unchanged while the reported commit differs.
- **A removal a human approves.** `planPackRemoval` builds a plan per stale pack — every target path, each one's current hash as a guard, and the plan's own digest — and `status` stops there. `applyPackRemoval` recomputes, matches the digest, and removes under one journaled, snapshotted transaction whose allowed roots are the project-local skill roots. A target whose bytes moved changes the digest, so the approval refuses with `plan-drift`.
- **All three read verbs are tracer-covered.** `project status .` joined `PREVIEW_INVOCATIONS`, so `plan`, `approve` and `status` are all asserted to leave every observable surface byte-identical.

## Task Commits

1. **Task 1: Receipt-by-evidence reconciliation and the six pack states** — RED `3af11d2` (test), GREEN `bd1e69e` (feat)
2. **Task 2: `STALE` names the missing fact, plus the offline branch context** — RED `41e737f` (test), GREEN `b347140` (feat)
3. **Task 3: The approval-gated removal plan and the `project status` verb** — RED `84d06e6` (test), GREEN `fcccbe8` (feat)

No `refactor` commit was made: no cleanup changed behaviour, and the TDD contract commits a refactor only when one occurred.

## TDD Gate Compliance

`type: tdd` was applicable to all three tasks. Every task wrote and committed its failing test before any implementation, and every RED run was captured with `--test-reporter=tap` and classified.

| Task | RED commit | GREEN commit | REFACTOR | RED evidence |
|------|-----------|--------------|----------|--------------|
| 1 | `3af11d2` | `bd1e69e` | — (no change) | `RED_EVIDENCE_OK` — 86 tests, 78 pass, 8 fail, target `an installed pack whose evidence and target bytes are unchanged reports CURRENT` |
| 2 | `41e737f` | `b347140` | — (no change) | `RED_EVIDENCE_OK` — 96 tests, 86 pass, 10 fail, target `a STALE line names the missing fact by name, not merely the pack` |
| 3 | `84d06e6` | `fcccbe8` | — (no change) | `RED_EVIDENCE_OK` — 115 tests, 108 pass, 7 fail, target `a stale pack yields a removal plan naming every target, its guard hash and its own digest` |

Task 3's RED run had one test green in its own RED phase — `project sync --apply is still refused, so this phase did not open the Phase 3 gate`. It is a REGRESSION GUARD, not a behaviour this plan adds: it asserts that a refusal shipped in an earlier plan is still in place at phase close, so passing before the implementation is its correct result. It is disclosed here rather than counted as evidence.

Every RED run used `node --test --test-reporter=tap`: this project's default `node --test` reporter is not TAP, and a default-reporter capture is misclassified as `zero_tests_discovered`.

## Files Created/Modified

- `src/core/project-plan.ts` — `PackState`, `ReconciledTarget`, `StaleReason`, `PackReconciliation`, `ProjectReconciliation`, `PackReceipt`, `readPackReceiptsStrict`, `reconcileProjectState`, `classifyInstalledPack`, `GitContext`, `readGitContext`, `describeGitDifference`, `RemovalTarget`, `RemovalPlan`, `planPackRemoval`, `applyPackRemoval`, plus `gitContext` on the approval artifact
- `src/format.ts` — `formatProjectStatus`, `MAX_STATUS_DETAIL_CHARS`
- `src/cli.ts` — the `project status` subcommand, its `--apply` refusal, and the approve branch's routing of a removal digest
- `src/core/evidence.ts` — `UNDECIDABLE_REASON_PREFIX` and `parseUndecidableReason`, beside the sentence's only producer
- `test/project-plan.test.ts` — 26 new tests (78 → 104), plus the `writeInstalledPack`, `installedPostgresFixture`, `stalePostgresFixture`, `branchFixture`, `packStateOf` and `formatExport` helpers
- `test/preview.test.ts` — `project status .` in `PREVIEW_INVOCATIONS`
- `test/helpers/git-fixture.ts` — exported `gitCommand` and `GitRun`

## Decisions Made

- **`STALE` vs `CHANGED` is discriminated by nameability, not by a digest.** Removing a dependency always moves `evidenceDigest`, so an artifact-digest comparison cannot tell "the fact that selected this pack went away" from "this artifact claims something the evidence never supported". What separates them is whether a specific approved-satisfied fact can be named as having flipped. `STALE` when one can; `CHANGED` when none can. The artifact-level disagreement is reported separately as `artifactState` plus `unsupportedClaims`, so both statements are available and neither is inferred from the other.
- **A declared dependency fact reports its fact id, not a package name.** `DB_POSTGRES` names the declared fact `postgres-driver`, which lists eight packages; the evidence envelope records that the fact matched and which manifest answered, never which of the eight it was. The rendered sentence therefore names the fact, its vocabulary description, and the negative record's own reason — which enumerates `pg` and its siblings. Naming `pg` specifically would have been a guess dressed as a finding.
- **The branch context sits beside the plan, not inside it.** `digestablePlan` is a literal listing exactly what a reviewer reviewed; putting `gitContext` at the artifact's top level makes its exclusion from every digest structural rather than a rule someone must remember.
- **One writer, one command shape.** A removal is approved with `alpha-aos project approve <path> --plan-digest <removal-digest> --apply` — the same verb, the same flag, the same digest contract. `status` has no `--apply` at all.
- **A removal's allowed roots are the three project-local skill roots**, derived from `PROJECT_SKILL_ROOTS`, never the canonical root. Passing the canonical root would have made the transaction's containment check vacuous.
- **Only `STALE` is offered a removal.** `DRIFTED` means a human edited a file we wrote; `CONFLICT` means we never wrote it; `CHANGED` means the record disagrees with the world; `UNDECIDABLE` means we could not read the evidence. None of those is "the evidence that selected this pack is gone", and none may motivate a deletion.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The RED test asserted a package name the evidence envelope does not record**

- **Found during:** Task 2 (GREEN)
- **Issue:** The Task 2 RED test asserted `pack.stale[0].named === "pg"`. `DB_POSTGRES` is declared as `any: [postgres-driver, postgres-dsn]` — DECLARED facts, not inline `anyDependencies: [pg]` literals — so the leaf id is `postgres-driver`. The envelope's `EvidenceFact` records `path` and `version` for a positive dependency detection but not which of the declared package names matched, so no honest code path can recover `pg` from an approved plan.
- **Fix:** The assertion now checks `factId === "postgres-driver"` and that the RENDERED sentence contains both the pack id and `pg` — which it does, because the fresh negative record's own reason enumerates the declared package names. `describeMissingFact` was extended to append the fact's vocabulary description so the line stays readable. The behaviour under test — "a STALE line names the missing fact, not merely the pack" — is unchanged; only the field the test read was wrong about the data shape.
- **Files modified:** `test/project-plan.test.ts`, `src/core/project-plan.ts`
- **Verification:** `node --test --test-reporter=tap dist/test/project-plan.test.js` — 96 tests, fail 0
- **Committed in:** `b347140`

**2. [Rule 1 - Bug] The `STALE ` line prefix collided with the status table's own state column**

- **Found during:** Task 2 (GREEN)
- **Issue:** The per-fact lines were emitted as `STALE <sentence>` while the state table's first column also renders `STALE` followed by padding, so a line-prefix scan counted three "STALE lines" where two facts exist. A reader — human or test — could not tell a per-fact line from a per-pack row.
- **Fix:** Per-fact lines became `STALE-FACT` and `UNDECIDABLE-PATH`, matching the existing hyphenated-code convention (`NEAR-MISS`, `UNSUPPORTED-CLAIM`). The `STALE` table detail became a short summary naming the count and the fact ids, and `MAX_STATUS_DETAIL_CHARS` now caps every DETAIL cell — the same deterministic-order-plus-hard-cap discipline `MAX_NEAR_MISS_LINES` and `MAX_TARGET_ROWS` already apply, so a verbose detector reason cannot decide the report's width.
- **Files modified:** `src/format.ts`, `src/core/project-plan.ts`, `test/project-plan.test.ts`
- **Verification:** `node --test dist/test/project-plan.test.js` — fail 0; live `project status` output inspected
- **Committed in:** `b347140`

**3. [Rule 2 - Missing Critical] The git fixture helper had no sanctioned way to branch or commit**

- **Found during:** Task 2 (RED)
- **Issue:** `test/helpers/git-fixture.ts` builds repository SHAPES but exposes no way to run a further git command, so the branch-switch, detached-HEAD, packed-refs and irrelevant-commit cases would have had to call `spawnSync("git", …)` directly — escaping `FORBIDDEN_GIT_SUBCOMMANDS`, the per-repository identity and the prompt-disabling environment the helper exists to enforce.
- **Fix:** Exported `gitCommand(cwd, args)`, a thin pass-through to the module's own `runGit`, and exported the `GitRun` result type. Every new fixture invocation therefore still travels the network-subcommand refusal.
- **Files modified:** `test/helpers/git-fixture.ts`
- **Verification:** All ten Task 2 tests use it; `node --test dist/test/project-plan.test.js` — fail 0
- **Committed in:** `41e737f`

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 missing critical)
**Impact on plan:** No scope creep. Two were assertions and a rendering prefix that were wrong about data shapes the plan could not have known without running the code; the third closed a hole that would have let a test bypass a control the helper exists to enforce.

## Issues Encountered

None. Three RED/GREEN cycles, three GREEN runs, no repair budget consumed.

## Verification

All of the plan's `<verification>` commands were run at phase close:

- `npm run check` — exits 0.
- `node --test dist/test/project-plan.test.js dist/test/preview.test.js dist/test/validation.test.js` — `fail 0`; `project-plan.test.js` reports **104 tests** (baseline 78, threshold 88).
- `node dist/src/cli.js project sync . --apply` — still exits non-zero with `Project apply is not enabled until trust and transaction support are implemented`. The Phase 3 gate was not opened by this phase.
- `npm test` — **382 tests, pass 377, fail 0, skipped 5**. Strictly above the 356 recorded in `02-09-SUMMARY.md` and strictly above the 208 phase baseline in `02-VALIDATION.md`.
- No fixture was skipped for want of a host capability. The `UNDECIDABLE` case is built as a DIRECTORY where a dependency manifest is declared, which reads as `EISDIR` on every host, so it runs everywhere rather than being skipped on Windows for want of a chmod. A `context.skip` with a named reason is still wired for a host that cannot create it, and for every git fixture on a host without git.

### Phase success criterion 5, demonstrated

Run end-to-end against a scratch fixture (a repository whose `pg` dependency selected `DB_POSTGRES`, with the pack installed and approved, then the dependency removed):

```
STALE  DB_POSTGRES  1/1 matching  DB_POSTGRES: 1 fact(s) that selected it are gone (postgres-driver); …

STALE-FACT DB_POSTGRES — the `postgres-driver` fact (A PostgreSQL driver is a declared dependency)
that selected it is gone: no dependency manifest at the canonical root declares any of: pg, postgres,
postgres.js, psycopg, psycopg2, psycopg2-binary (+2 more)

REMOVAL DB_POSTGRES — 1 target(s). Nothing has been removed.
  dc54a730ea03  .claude/skills/postgres-patterns/SKILL.md
  Removal digest: 021600a0bad9966a9b6476d08b019c1b2791884a67d46a5bfc21518956564f5b
  Approve this removal with: alpha-aos project approve <path> --plan-digest 021600a0… --apply

Read only. `project status` deletes nothing: a removal is a separate act a human approves by digest.
```

A full path-and-hash listing of the fixture tree taken before and after the run is deep-equal, and the target file is still on disk with an unchanged hash. The criterion is demonstrated, not asserted.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO or unwired component was introduced by this plan.

## Open planner assumption (carried to verification)

The plan's own `<verification>` section flagged one unresolved edge-probe row against DETC-06, and it remains unresolved because no Phase 2 artifact can settle it:

- **What "previously installed" means.** This plan implements it as "has a receipt under `.alpha-aos/receipts/`". A pack that was approved but never materialized therefore has NO state in the reconciliation — it is neither `CURRENT` nor `STALE`; it appears only as an `UNSUPPORTED-CLAIM` line when the artifact claims it and the evidence does not support it. Phase 3 is what writes receipts, so whether this matches the intended meaning of "installed" must be confirmed against Phase 3's receipt writer before the passing tests here are read as agreement. Recorded in `.planning/WINDOWS.md` as an `unrun-verify` entry so it survives past this summary.

## Other limitations worth knowing

- **A receipt with no approved artifact reports `CHANGED`, not `STALE`.** With no `.alpha-aos/plan.json` there is no approved fact set to diff against, so no fact can be named — and naming none while claiming `STALE` is exactly the defect DETC-06 exists to prevent. The detail line says so explicitly.
- **`applyPackRemoval` removes the target files and not the receipt.** The receipt's lifecycle belongs to Phase 3, which writes it; removing it here would make Phase 2 a partial owner of a record it does not produce.
- **Broken Windows entry 12 is stale but was left alone.** It claims `project plan` does not name each pack's source version and hash; `node dist/src/cli.js project plan .` prints `APPROVAL PACKAGE_SOURCE ecc-universal@2.2.0 (sha512-…)`, so 02-08 closed it. Disposing of it is outside this plan's DETC-06 scope, so it is left for the verifier rather than silently marked fixed here.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **DETC-06 is closed and the phase's read side is complete.** `plan`, `approve` and `status` are the three read verbs, all three are in the SAFE-01 preview enumeration, and all three are offline and subprocess-free.
- **Phase 3 inherits four contracts from this plan.** The receipt location (`PROJECT_RECEIPT_DIRECTORY`, already carried inside the plan artifact), the receipt envelope it must satisfy to be readable here (`schemas/receipt.schema.json`, now read through the strict validator so a malformed one refuses), the `evidenceHash` binding a receipt to the evidence that selected its pack, and the removal transaction whose snapshot is the safe inverse.
- **The Phase 3 gate is still shut,** asserted by a test rather than by inspection: `project sync --apply` exits non-zero with the same refusal message it carried at phase start.
- **One item is carried forward for confirmation**, above: the meaning of "installed". It is a reading, it is implemented and tested, and it is recorded where the ship gate will surface it.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-08*
