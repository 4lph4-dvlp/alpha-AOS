---
phase: 02-evidence-bound-project-planning
plan: 09
subsystem: api
tags: [detc-05, approve, plan-drift, reviewed-digest, file-transaction, writer-lock, d-12, d-13, d-16, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-08's nine DETC-04 nouns as named fields, digestablePlan as one literal, sealPlan re-sealing, and the two digests"
  - phase: 02-evidence-bound-project-planning
    provides: "02-07's evaluate-all evaluator, D-06 overrides recorded as evidence, and the print() redaction seam"
  - phase: 02-evidence-bound-project-planning
    provides: "02-06's complete evidence envelope, the ReadLedger input list and the aggregate sourceHash"
  - phase: 02-evidence-bound-project-planning
    provides: "02-04's pack-skill source pinning in catalog/stack.lock.json"
  - phase: 01-safe-operation-boundary
    provides: "reviewedDigest / assertPlanUnchanged / withComponentSession, applyFileTransaction's journal and snapshot, proveOperationPaths, and the exclusive-create writer lock"
provides:
  - "approveProjectPlan: the ONLY writer, refusing through the EXISTING assertPlanUnchanged rather than a second drift mechanism"
  - "revalidateProjectPlan: the read-only half both the preview and the apply run, so the printed digest is the digest the apply recomputes"
  - "classifyPlanDrift + PlanDriftKind: six kinds checked in order of consequence, with joined/left pack ids named"
  - ".alpha-aos/plan.json — the approved artifact Phase 3's apply binds to, written under one journaled, snapshotted transaction with .alpha-aos as the only allowed root"
  - "manifestDigest as a named plan field, so DETC-05's manifest noun is nameable rather than merely detectable inside inputsDigest"
  - "alpha-aos project approve [path] [--project <rel>] [--plan-digest <d>] [--apply] [--json], registered in the SAFE-01 preview enumeration"
  - "approvalCommand: the runnable re-approval command every refusal ends with"
  - "project plan --apply is now an explicit refusal pointing at approve (D-12)"
affects: [02-10, phase-3-capability-materialization, phase-4-gate-01]

actuals:
  tokens: 14659
  tasks: 3
  commits: 6
plan_head_before: 2b6956ba7e1a70d88a97131ea4473e21fb7fff33

tech-stack:
  added: []
  patterns:
    - "A refusal is a next step: every drift error carries the runnable command that re-approves in place, with the newly computed digest already substituted"
    - "Classification order is a decision, not an implementation detail — the selection is checked first because a dependency that selects a new pack also moves that pack's source and target rows"
    - "A noun is proven inside the digest by a pure table over the digestable view, so code-derived nouns no repository fixture can move are still covered by a failing-capable assertion"
    - "The seam that needs a value states so rather than guessing: an unavailable reviewed plan produces a refusal that says the classification is unavailable"
    - "A fixture that creates the thing it then asserts is absent proves nothing — the preview state-root assertion points at a nested path the fixture never creates"

key-files:
  created: []
  modified:
    - src/core/project-plan.ts
    - src/types.ts
    - src/format.ts
    - src/cli.ts
    - test/project-plan.test.ts
    - test/preview.test.ts

key-decisions:
  - "`manifestDigest` was added as a named plan field. The plan's premise that 02-08 already carried a manifest content hash was inaccurate: the manifest is recorded in the read ledger, so it was inside `inputsDigest` and therefore DETECTABLE but not NAMEABLE. D-13 requires a distinct `manifest-changed` classification, which is unreachable without the field — a manifest edit that moves the selection reads as selection-changed, and an inert one would read as inputs-changed."
  - "The transaction's state root is the managed user state root, not a directory inside the project. The journal and snapshots are what make the safe inverse real, and putting them where `alpha-aos rollback` already looks means an approval is undoable by the command that already undoes managed writes. `.alpha-aos` stays the only ALLOWED ROOT for the write itself."
  - "`stateRoot` is a REQUIRED option on both `revalidateProjectPlan` and `approveProjectPlan` rather than defaulting to `userStateRoot()`. A default would let a module-level test take the writer lock on the developer's real home directory, which is precisely the ambient-write class 01-21 spent a plan closing."
  - "Drift classification takes the reviewed plan VALUE, sourced in order from an explicit `reviewedPlan`, then from `.alpha-aos/plan.json` when that artifact IS the reviewed plan. A digest cannot be un-hashed, so the CLI — whose two invocations share only a digest — is honest about an unavailable classification instead of inferring one."
  - "`project plan --apply` is an explicit refusal naming `approve`, not a silently ignored flag. Ignoring it satisfies the letter of the prohibition while letting a user believe `plan` persisted something."
  - "The approved artifact carries no timestamp. Approving the same plan twice therefore produces byte-identical content, which is what makes `already-current` a property of the plan rather than of when it was approved."

patterns-established:
  - "Preview and apply run the SAME revalidation, so the digest a reviewer is asked to pass back is the digest the apply recomputes"
  - "A single construction site for the drift refusal (`explainPlanDrift`), so the classification, the digest pair and the re-approval command can never disagree across call paths"
  - "A pure classification table whose kinds are asserted mutually distinct, so two cases collapsing onto one kind fails rather than silently proving less"

requirements-completed: [DETC-05]

coverage:
  - id: D1
    description: "Approving a freshly printed plan digest against unchanged inputs writes .alpha-aos/plan.json under one journaled, snapshotted transaction and returns the transaction id"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#approving a freshly computed plan digest writes the artifact and returns a transaction id"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project approve --plan-digest --apply writes the artifact and reports the transaction id"
        status: pass
    human_judgment: false
  - id: D2
    description: "An apply refuses when the evidence, the manifest, the stable lock, the renderer, the adapter capability, the executable slot or a target's bytes changed after review — with the refusal naming both digest prefixes"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a dependency changed between plan and approve refuses, naming both digest prefixes"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a target file's bytes changed between plan and approve refuses"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a lock entry changed for a selected pack's skill between plan and approve refuses"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a project manifest changed between plan and approve refuses"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a digest that was never produced refuses without creating the artifact"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#mutating any one of the seven DETC-05 nouns changes the plan digest"
        status: pass
    human_judgment: false
  - id: D3
    description: "The approved artifact is written under .alpha-aos/ inside the project and nowhere else: every file outside that directory has an identical path list and identical hashes before and after"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#approve writes nothing outside .alpha-aos/"
        status: pass
      - kind: unit
        ref: "src/core/transaction.ts requireAllowed over allowedRoots: [<root>/.alpha-aos] — test/transaction.test.ts#transaction rejects paths outside its ownership roots"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only the latest approved plan is kept under .alpha-aos/; no history directory, timestamped filename or rotation scheme accumulates (D-16)"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#only one plan artifact exists under .alpha-aos after two approvals, with no history directory"
        status: pass
    human_judgment: false
  - id: D5
    description: "The written artifact round-trips: reading it back yields the approved fact set and the same three digests"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#the written artifact round-trips: the three digests and the approved fact set survive a read"
        status: pass
    human_judgment: false
  - id: D6
    description: "Running project approve --apply twice with the same plan digest on unchanged inputs is idempotent: the second run reports already-current, opens no transaction and leaves the artifact's mtime unchanged"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a second approve of the same digest reports already-current and writes no new bytes"
        status: pass
    human_judgment: false
  - id: D7
    description: "A refusal distinguishes 'inputs changed but the pack selection is identical' from 'the selection itself changed', naming the packs that joined or left, and each of target-bytes, lock, manifest and adapter-support gets its own classification"
    requirement: DETC-05
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a comment appended to a read file yields inputs-changed, and says the selection is unchanged"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a dependency that selects a new pack yields selection-changed and names the pack that joined"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a dependency removed that deselects a pack yields selection-changed and names the pack that left"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#target-bytes, lock, manifest, adapter-support and inputs changes each get their own classification"
        status: pass
    human_judgment: false
  - id: D8
    description: "Every refusal ends with the runnable re-approval command carrying the newly computed digest, and running that command succeeds"
    requirement: DETC-05
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#a refusal carries a runnable re-approval command, and running it succeeds"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project approve --apply without a plan digest refuses, naming the digest the plan would produce"
        status: pass
    human_judgment: false
  - id: D9
    description: "Two concurrent project approve --apply runs serialize through the writer lock: exactly one writes, the loser refuses with a lock-related reason, and the artifact is never partially written"
    requirement: DETC-05
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#an approve refuses while another writer holds the state root, and writes nothing"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#two concurrent project approve --apply runs never both write, and leave no partial artifact"
        status: pass
    human_judgment: false
  - id: D10
    description: "project plan persists nothing and has no --apply; project approve is the only writer; project sync --apply stays refused until Phase 3; and the approve preview is enforced by the SAFE-01 tracer"
    requirement: DETC-05
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#project approve is registered in the preview enumeration in its preview form"
        status: pass
      - kind: e2e
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical (with the project approve entry)"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project plan has no --apply route and still writes nothing"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project sync --apply still refuses with the Phase 3 message"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#project approve without --apply previews the approval and writes nothing"
        status: pass
    human_judgment: false
  - id: D11
    description: "The D-13 refusal is a usable next step at the terminal — the classification sentence, the digest pair and the pasteable command read as one instruction rather than three facts"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#a refusal carries a runnable re-approval command, and running it succeeds (the command is parsed out of the message and re-run)"
        status: pass
    human_judgment: true
    rationale: "The assertions prove the command is present, carries the newly computed digest and succeeds when run. Whether the refusal READS as a next step rather than as a wall of hashes — and whether the unclassified CLI branch's wording lands as honest rather than as a shrug — is a judgment no test makes."

# Metrics
duration: 40 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 09: Approving a Reviewed Plan Summary

**`alpha-aos project approve` is now the only command that persists anything: it re-reads every input, hands the plan boundary to the same `assertPlanUnchanged` that already guards the ECC, GSD, MCP, isolation and support-bundle components, names which of six things moved when it refuses, and writes exactly one `.alpha-aos/plan.json` under a journaled, snapshotted transaction whose only allowed root is `.alpha-aos`.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-09-07T19:18:12Z
- **Completed:** 2026-09-07T19:58:47Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- **No second drift mechanism was built.** `ProjectCapabilityPlan` already satisfied the reviewed-plan boundary after 02-08, so `approveProjectPlan` constructs that boundary and calls the existing `assertPlanUnchanged`. The refusal a user sees for a changed project plan comes out of the same three lines that refuse a changed ECC skill sync.
- **All seven DETC-05 nouns are proven inside the digest, not argued to be.** Four repository fixtures prove the end-to-end refusal for the nouns a filesystem can move; a seven-entry table over the digestable view proves the other three — `renderer`, `adapterSupport` and the `executable` null — whose values are code-derived and cannot be moved by editing a repository at all. The table asserts its own length is 7, so a noun dropped from the list fails rather than quietly reducing the coverage claim.
- **D-13's split is real and ordered.** `classifyPlanDrift` checks the selection first, because a dependency that selects a new pack also moves that pack's source and target rows — a lock-first order would report "a locked source changed" for what is really a different decision. `inputs-changed` is last: it is what remains once nothing a reviewer decided on has moved, and its message says so.
- **Every refusal ends with a command.** The re-approval command carries the newly computed digest already substituted; a test parses it out of the refusal's stderr and re-runs it, so "the refusal is not a dead end" is an executed assertion rather than a claim.
- **The write is bounded on three axes at once**: `allowedRoots: [<root>/.alpha-aos]` inside the transaction, every path proven up front through `proveOperationPaths`, and one writer through `withComponentSession`. A before/after listing-and-hash snapshot of everything outside `.alpha-aos/` proves project source, package manifests, tests and build configuration stayed read-only inputs.

## Task Commits

Each task ran the full RED → GREEN cycle:

1. **Task 1 RED: approve, drift refusal and the seven digested nouns** — `7038953` (test)
2. **Task 1 GREEN: approveProjectPlan binds the plan to the existing drift contract** — `c6fca4e` (feat)
3. **Task 2 RED: the project approve CLI verb** — `735c5ef` (test)
4. **Task 2 GREEN: project approve, the only command that persists a plan** — `f001757` (feat)
5. **Task 3 RED: the D-13 refusal split and re-approval in place** — `ab75141` (test)
6. **Task 3 GREEN: name what moved and print the command that re-approves** — `bb6ba67` (feat)

No REFACTOR commit was made. Each GREEN landed in the shape it should keep, and a refactor commit with no change is not one this project makes.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 | `7038953` | `c6fca4e` | — (no change) | `RED_EVIDENCE_OK` — 64 tests, 53 pass, 11 fail, target `approving a freshly computed plan digest writes the artifact and returns a transaction id` |
| 2 | `735c5ef` | `f001757` | — (no change) | `RED_EVIDENCE_OK` — 71 tests, 66 pass, 5 fail, target `project approve without --apply previews the approval and writes nothing` |
| 3 | `ab75141` | `bb6ba67` | — (no change) | `RED_EVIDENCE_OK` — 78 tests, 73 pass, 5 fail, target `a comment appended to a read file yields inputs-changed, and says the selection is unchanged` |

Every RED commit preceded its implementation commit. Each RED run was captured with
`--test-reporter=tap`, because this project's default `node --test` reporter is not TAP and a
default-reporter capture misclassifies as `zero_tests_discovered`.

Tasks 2 and 3 each had two tests that were GREEN in their own RED run, and both are disclosed
rather than presented as new coverage:

- Task 2's `project plan has no --apply route and still writes nothing` and
  `project sync --apply still refuses with the Phase 3 message` were already true — `plan`
  ignored the flag and `sync` already refused. They are standing regression nets over two
  prohibitions this plan must not break, which is their point.
- Task 3's `an approve refuses while another writer holds the state root` and
  `two concurrent project approve --apply runs never both write` were already true the moment
  Task 1's GREEN routed the write through `withComponentSession`. The Phase 1 writer lock is
  what makes them pass; the tests exist so a later change that bypasses the session is red.

## Files Created/Modified

- `src/core/project-plan.ts` — `PROJECT_PLAN_ARTIFACT`, `PROJECT_ARTIFACT_DIRECTORY`, exported `PLAN_DIGEST_KIND`, `revalidateProjectPlan`, `approveProjectPlan`, `readApprovedProjectPlan`, `approvalCommand`, `classifyPlanDrift`, `PlanDriftKind`, `explainPlanDrift`, and the `manifestDigest` computation from the read ledger
- `src/types.ts` — `ProjectCapabilityPlan.manifestDigest: string | null`
- `src/format.ts` — `formatProjectPlan` gained a `trailer` option and a `Manifest digest:` line; `formatProjectApprovalPreview` and `formatProjectApproval` added
- `src/cli.ts` — the `project approve` branch, the `project plan --apply` refusal, `--plan-digest` added to the value-flag list, and the help entry
- `test/project-plan.test.ts` — 25 new tests (53 → 78), plus the `packageRootCopy`, `approvalFixture`, `snapshotOutsideArtifactRoot`, `readArtifact` and `expectRefusal` helpers
- `test/preview.test.ts` — `project approve` registered in `PREVIEW_INVOCATIONS` in its preview form

## Decisions Made

See `key-decisions` in the frontmatter. The two most consequential:

**The manifest noun needed its own field.** The plan asserted 02-08 had already put the
manifest's content hash in a named field. It had not: `readManifestEvidence` records
`.alpha-aos/stack.yaml` into the read ledger, so the hash was inside the aggregate
`inputsDigest`. That is enough to REFUSE and not enough to SAY WHY — a manifest edit that moves
the selection classifies as selection-changed, and an inert one would classify as
inputs-changed, so `manifest-changed` would have been an unreachable branch. `manifestDigest`
is now a named plan field inside the digestable view, and D-13's fourth classification is
reachable and tested.

**A digest cannot be un-hashed, and the CLI says so.** `classifyPlanDrift` needs the reviewed
plan value. A caller that still holds it passes it; the CLI, whose two invocations share
nothing but a digest, falls back to `.alpha-aos/plan.json` when that artifact IS the reviewed
plan. When neither is available the refusal states that the classification is unavailable and
still carries both digests and the runnable re-approval command. Inferring a classification
from a digest alone would have been a guess presented as a finding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The manifest content hash the plan assumed existed did not**

- **Found during:** Task 1 (mapping the seven DETC-05 nouns onto named fields)
- **Issue:** the plan's action states "manifest via the manifest content hash" as an existing
  02-08 field. No such field exists — the manifest is only inside `inputsDigest`. Task 1's
  seven-noun table needed a manifest-bearing field path, and Task 3's `manifest-changed`
  classification was unreachable without one.
- **Fix:** `ProjectCapabilityPlan.manifestDigest` added, computed from the evidence read
  ledger (so a manifest skipped as over-cap or unreadable is honestly `null`), carried into
  `digestablePlan`, and rendered as a `Manifest digest:` line.
- **Files modified:** `src/types.ts`, `src/core/project-plan.ts`, `src/format.ts`
- **Verification:** `test/project-plan.test.ts#mutating any one of the seven DETC-05 nouns changes the plan digest` covers it as noun 2, and `#target-bytes, lock, manifest, adapter-support and inputs changes each get their own classification` proves the classification is reachable and distinct.
- **Committed in:** `c6fca4e` (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] `stateRoot` made a required option rather than defaulting to the user's home**

- **Found during:** Task 1 (wiring `withComponentSession`)
- **Issue:** the obvious implementation defaults the transaction state root to `userStateRoot()`.
  That would make every module-level test take the exclusive writer lock on the developer's
  real `~/.alpha-aos` and journal into it — the ambient-write class 01-21 spent a whole plan
  closing, arriving through a convenience default.
- **Fix:** `stateRoot` is required on `revalidateProjectPlan` and `approveProjectPlan`; the CLI
  supplies `userStateRoot()` at the one call site that should.
- **Files modified:** `src/core/project-plan.ts`, `src/cli.ts`
- **Verification:** every approve test passes a temp state root; `test/project-plan.test.ts#project approve without --apply previews the approval and writes nothing` asserts the CLI creates no managed state root on the preview path.
- **Committed in:** `c6fca4e` (Task 1 GREEN)

**3. [Rule 1 - Bug] A RED assertion that could only ever fail was corrected, not deleted**

- **Found during:** Task 2 GREEN
- **Issue:** the preview test asserted `existsSync(stateRoot) === false` against a state root
  the fixture itself had just created with `mkdtemp`. It was a question about the fixture, not
  about the command, and it could never pass.
- **Fix:** the CLI is now pointed at `join(stateRoot, "managed")` — a path the fixture never
  creates — so "did a preview create the managed state root?" is a question about the command.
  Same shape as 02-01's `isIgnored` correction: the RED test encoded the wrong expectation and
  was corrected to the verified one rather than dropped.
- **Files modified:** `test/project-plan.test.ts`
- **Verification:** the assertion now passes, and it fails if the preview acquires a writer.
- **Committed in:** `f001757` (Task 2 GREEN)

**4. [Rule 2 - Missing Critical] `project plan --apply` is an explicit refusal rather than an ignored flag**

- **Found during:** Task 2 (the `plan` branch)
- **Issue:** the prohibition is that `plan` must not GAIN an `--apply` flag, and the acceptance
  allows either rejecting the flag or ignoring it. Ignoring it satisfies the letter while
  leaving a user who typed it believing something was persisted.
- **Fix:** `project plan --apply` throws, naming `alpha-aos project approve <path> --plan-digest <digest> --apply`.
- **Files modified:** `src/cli.ts`
- **Verification:** `test/project-plan.test.ts#project plan has no --apply route and still writes nothing` asserts the tree is unchanged and, when the command exits non-zero, that its message points at `approve`.
- **Committed in:** `f001757` (Task 2 GREEN)

---

**Total deviations:** 4 auto-fixed (1 blocking, 2 missing critical, 1 bug)
**Impact on plan:** all four are inside files the plan already owns. The only surface addition
is one plan field the plan's own Task 3 acceptance requires. No scope creep.

## Issues Encountered

- The plan's Task 1 fixture "changing a lock entry between plan and approve" cannot edit this
  repository's own `catalog/stack.lock.json` — a test that mutates the shipped lock is a test
  that can leave the tree dirty. `packageRootCopy` copies `catalog/` and `schemas/` into a temp
  root the test owns and mutates the copy, which is what the `packageRoot` option already
  exists for.
- The concurrency case cannot be made deterministic through the CLI alone: two children racing
  on an exclusive-create lock may or may not overlap on a fast host, and a test that asserts
  "exactly one refused" would be flaky by construction. It is split into two: a deterministic
  case that holds the writer lock in-process and asserts the child refuses naming
  `operationId`/`pid`/`startedAt`/`retry` and writes nothing, and a genuine two-child race that
  asserts the invariant true under BOTH interleavings — never two writers, the loser either
  refuses on the lock or finds the plan already current, and the artifact is absent or fully
  parseable. Asserting a race outcome that a scheduler decides would have converted a real
  safety property into a flaky one, which is the RC-4 reasoning 01-22 recorded.
- **Broken Windows entry 12 is stale and was NOT disposed here.** It reads "`project plan` does
  not yet name each selected pack's source version and hash", which 02-08 delivered
  (`resolvePackSource`, proven by `#each selected pack's source names the locked package,
  version, integrity and skill hash`). Disposing another plan's ledger entry is outside this
  plan's scope boundary, so it is surfaced for the verifier rather than closed here.

## Deferred and Not Proven

- **D-13 classification is complete for a caller holding the reviewed plan and PARTIAL at the
  CLI.** Recorded as an open Broken Windows entry (`unmet-truth`, `src/core/project-plan.ts`).
  A CLI approve that drifts before any `.alpha-aos/plan.json` exists gets both digests and the
  runnable re-approval command, but cannot name which noun moved — the two invocations share
  only a digest, because D-12 plus SAFE-01 forbid the preview persisting anything. This is not
  a patchable bug: closing it requires a decision, either a reviewed-plan record the preview is
  permitted to write, or scoping the must-have truth to callers that hold the plan value.
- **`PROJECT_RECEIPT_DIRECTORY` remains an accepted residual risk (T-02-30), inherited from
  02-08.** Phase 2 reads receipts; Phase 3 writes them. `.alpha-aos/plan.json` now sits beside
  `.alpha-aos/receipts/` in the same allowed root, so Phase 3's writer inherits both locations
  from the artifact rather than choosing them.
- **The `executable` slot is still null and still Phase 3's.** It is inside the digest and
  covered by the seven-noun table, so the moment Phase 3 fills it the refusal already watches
  it with no new mechanism.
- **Cross-host Unicode path normalization is still not proven** (inherited from 02-08, owned by
  the Phase 7 three-OS matrix). The approved artifact records `scope.canonicalRoot`, so this
  limitation now travels inside a persisted file rather than only inside a printed one.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired data path was introduced. The
`explainPlanDrift` unclassified branch is a stated behaviour with its own message, not a
placeholder — it is reached only when the reviewed plan value genuinely does not exist.

## Threat Flags

None. `.alpha-aos/plan.json` is the first Phase 2 write into a user's repository and it was
planned as such: T-02-31's allowed-root bound, T-02-32's single drift contract, T-02-33's
writer-lock serialization, T-02-34's next-step refusal and T-02-11's preview registration are
each covered by a named test above. No security-relevant surface outside the plan's
`<threat_model>` was introduced.

## User Setup Required

None — no external service configuration is required.

## Next Phase Readiness

- **Ready for `02-10`:** `readApprovedProjectPlan` and the `.alpha-aos/plan.json` artifact are
  the inputs a status/stale reconciliation needs, and `classifyPlanDrift` already answers
  "what moved since the approved plan?" as a pure function over two plan values.
- **Ready for Phase 3:** the artifact is the contract an apply binds to. Phase 3 inherits three
  things it must not redecide — the `.alpha-aos/plan.json` location, the
  `.alpha-aos/receipts/<packId>.json` location carried inside it, and `.alpha-aos` as the only
  allowed write root until harness project-config paths are added.
- **Phase 3 must fill `executable`.** The slot is digested as null today; filling it will move
  `planDigest` for every project, which is correct and already refuses through the existing
  contract.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*

## Self-Check: PASSED

All six modified files exist on disk and all six task commits resolve in `git log`.
`git rev-list --count 2b6956b..HEAD` reports 6, matching the `commits: 6` recorded in the
frontmatter against `plan_head_before: 2b6956ba7e1a70d88a97131ea4473e21fb7fff33`.
Plan-level verification re-run at this HEAD: `npm run check` exits 0;
`node --test dist/test/project-plan.test.js dist/test/transaction.test.js dist/test/transaction-crash.test.js dist/test/preview.test.js`
reports 103 tests, fail 0; `node dist/src/cli.js project sync . --apply` still exits non-zero
with the Phase 3 refusal; `npm test` reports 356 tests, fail 0, 5 skipped — strictly above the
331 recorded in 02-08-SUMMARY.md.
