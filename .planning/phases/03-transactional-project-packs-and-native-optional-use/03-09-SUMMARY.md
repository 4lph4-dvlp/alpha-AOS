---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 09
subsystem: api
tags: [capability-state, surface-ceiling, json-schema, lifecycle, state-model, rendering]

# Dependency graph
requires:
  - phase: 02-project-capability-planning
    provides: "PackState as the deployment axis, SurfaceSupport as the support axis, reconcileProjectState, classifyInstalledPack, planPackRemoval/applyPackRemoval's approved removal-digest path, and the STALE state-plus-offer rendering register"
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "plan 03-03's capability ledger — readCapabilityLedger's absent/unreadable/present tri-state, NativeUseState, CapabilityProof, BlockedReason and pairEvidence's paired evidence unit"
provides:
  - "SURFACE_CEILING — the structural product claim per declared harness, every entry carrying a citation the reason itself repeats"
  - "classifyAdapterSupport as a RESOLVER over the ceiling and the ledger: it may raise a surface within its ceiling and never above it, and says when the ceiling bound the result"
  - "provenSurfaceSupport — what a positive, project-scoped ledger proof says about a surface on this host"
  - "CapabilityState in src/types.ts — the composite of three orthogonal axes plus their two resolution reasons, now the PRIMARY value"
  - "resolveCapabilityState — the only way to obtain the deployment axis from a reconciliation surface"
  - "ReconciliationHostEvidence and ledgerHostEvidence — host evidence travels IN from the caller, carrying the ledger read's tri-state rather than one collapsed null"
  - "PackLifecycle plus the narrowed pack-catalog lifecycle enum: an unregistered lifecycle is refused at load"
  - "planOneShotOffer and OneShotOffer — a state with an offer that computes and never acts"
  - "ONE_SHOT_OUTPUT_ARTIFACTS and OneShotCorroboration — the documented project-root artifact, observed only, with presence/absence asymmetry on the record"
  - "one CAPABILITY line and one ONE-SHOT block per pack in `project status`"
affects: [phase-04-gates, status-rendering, doctor, project-pack-sync, phase-07-support-matrix]

actuals:
  tokens: 20251
  tasks: 3
  commits: 7
plan_head_before: 859887fd28679b8630cd0465c2739b6aaf2f01aa

tech-stack:
  added: []
  patterns:
    - "a product CEILING and a host FACT are separate inputs to one resolver, and the resolver states when the ceiling bound the result rather than silently returning the ceiling value"
    - "every recorded classification carries a citation, and the rendered reason repeats it so a reader can check the claim without holding the record"
    - "a promoted composite is proven by a contract test that no exported surface returns the demoted axis at the top level — asserted at runtime AND at the source declaration"
    - "opposite aggregations for opposite claim types: a guarantee takes the weakest answer, an existence claim takes the strongest, and each reason names the harness it came from"
    - "host evidence travels IN from the command boundary; no reconciliation resolves a state root of its own, which is what keeps a host fact out of the plan digest"
    - "an offer prints the digest the apply path will actually accept, proven by pasting the printed command back"

key-files:
  created: []
  modified:
    - src/types.ts
    - src/core/project-plan.ts
    - src/format.ts
    - src/cli.ts
    - schemas/pack-catalog.schema.json
    - test/project-plan.test.ts
    - test/pack-catalog.test.ts

key-decisions:
  - "SURFACE_CEILING's meaningful distinction is `unsupported` versus everything else: `unsupported` means no project delivery surface exists, and any other value means the surface can structurally receive a pack and the ledger decides whether this host proved it"
  - "the codex and hermes ceiling reasons were corrected and the pi one was too — RESEARCH.md falsified all three, and the plan named only two"
  - "PackReconciliation.state was RENAMED to .capability rather than retyped, so a stale read is a compile error instead of silently returning an object"
  - "support aggregates to the WEAKEST answer across a pack's harnesses and native-use to the STRONGEST, because one is a guarantee and the other an existence claim"
  - "planPackRemoval gained a SECOND ground — a one-shot pack the ledger records as invoked — so planOneShotOffer prints the digest applyPackRemoval will accept rather than a second digest computed beside it"
  - "the one-shot output artifact is corroboration on the record: presence and absence each get their own sentence, and the reported state is identical either way"
  - "ledgerHostEvidence carries the ledger read's tri-state, so `absent`, `unreadable` and `never asked` are three sentences rather than one"

patterns-established:
  - "Cited classification: a recorded claim names the file or version it was read from, and a named test refuses an empty or uncited reason"
  - "Ceiling-bounded raise: host evidence raises within a product claim and never above it, and the bound is stated rather than implied"
  - "Promotion by rename: demoting a primary value to a field renames the old accessor so every stale reader fails to compile"
  - "Offer-by-construction: an offer carries the digest its own apply path computes, never a parallel one"

requirements-completed: [CAPA-07]

coverage:
  - id: D1
    description: "A support ceiling owned by code and catalog, separate from the host fact, with a resolver that may raise a surface within its ceiling and never above it"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#SURFACE_CEILING classifies every declared harness and an unclassified surface stays unverified"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a ledger proving a surface raises it from the unverified ceiling to supported"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a ledger proving a surface whose ceiling is unsupported does not raise it, and the reason says the ceiling bound it"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the resolver with no ledger returns exactly the ceiling values"
        status: pass
      - kind: other
        ref: "mutation: removing the `The ceiling bound this result` clause from dist turns the named test red"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every recorded support reason survives contact with the harness it describes: the codex, hermes and pi reasons RESEARCH.md falsified are corrected, and no reason may be empty or uncited"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#the codex ceiling reason cites the observed project-scope discovery and the version it was observed at"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the hermes ceiling reason names the scoping ground and no longer cites the recorded worker strategy"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#every SURFACE_CEILING reason is non-empty and carries a citation naming a file or a version"
        status: pass
      - kind: other
        ref: "mutation: restoring `worker-only` as the hermes ground, and stripping the citation from the ceiling helper, each turn their named test red"
        status: pass
    human_judgment: false
  - id: D3
    description: "The composite capability state is the primary value and the deployment axis cannot be read alone"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#no exported reconciliation surface returns a bare deployment-axis value at the top level"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the three axes are independently settable on one composite and JSON exposes all three under distinct keys"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#PackState's union members are unchanged from Phase 2 and it is declared exactly once"
        status: pass
      - kind: other
        ref: "mutation: re-adding a top-level `state` field to the returned record turns the invariant test red"
        status: pass
    human_judgment: false
  - id: D4
    description: "One line per capability carries all three axes; a blocked axis renders its code and variable name and never a value; an INCOMPLETE evidence unit renders INCOMPLETE and never the positive's axis"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#project status renders one line per capability carrying all three axes, and a blocked axis renders its code and variable name"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a capability whose evidence unit is INCOMPLETE renders INCOMPLETE and never the positive's native-use axis"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#two renders of the same reconciliation are byte-identical in both human and JSON form"
        status: pass
      - kind: other
        ref: "mutation: passing the whole BlockedReason through instead of its three named fields renders the smuggled sentinel and turns the test red"
        status: pass
      - kind: e2e
        ref: "node dist/src/cli.js project status <fixture> — one CAPABILITY line, deployment=CURRENT native-use=invoked support=supported"
        status: pass
    human_judgment: false
  - id: D5
    description: "Neither host-derived axis enters the plan digest, so two reviewers of one commit still agree"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#changing a ledger record leaves the plan digest unchanged, so no host-derived axis enters digestablePlan"
        status: pass
    human_judgment: false
  - id: D6
    description: "The declared one-shot lifecycle validates against a narrowed enum, and an unregistered lifecycle is refused at load"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#the pack catalog schema admits the declared one-shot lifecycle and refuses an undeclared one"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#PackLifecycle and the schema lifecycle enum agree in both directions"
        status: pass
      - kind: other
        ref: "mutation: restoring `type: string, minLength: 1` turns both named tests red"
        status: pass
    human_judgment: false
  - id: D7
    description: "An invoked one-shot pack reports as a state with an offer, deletes nothing, and prints a digest the approve path actually accepts"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a one-shot pack the ledger records as invoked reports one-shot, already invoked, with a runnable approve command"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a one-shot pack with no invocation record reports one-shot, not yet invoked, and offers nothing"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the one-shot reporting path calls no removal and leaves the project tree byte-unchanged"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the corroborating one-shot artifact is reported when present and its absence is not evidence that no output occurred"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the one-shot offer states what is ready and never implies anything was deleted"
        status: pass
      - kind: e2e
        ref: "the printed `alpha-aos project approve <path> --plan-digest <d> --apply` was pasted back and removed the pack through the approved digest path — the offer is a next step, not a dead end"
        status: pass
    human_judgment: false
  - id: D8
    description: "CAPA-07's edge-probe row remains UNRESOLVED and must be raised with the developer rather than closed by a verifier"
    verification: []
    human_judgment: true
    rationale: "This plan authors 0 edge rows. CAPA-07's row came back `unclassified` from the deterministic edge probe and is carried forward `unresolved` here exactly as plan 03-03 carried it. The predicates implemented come from CONTEXT.md D-10/D-11/D-12/D-13, not from an edge criterion, so no automated check can decide whether the developer considers the row answered."

# Metrics
duration: 1h 21m
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 09: The Composite Capability State Summary

**Support resolved from a product ceiling and a host ledger that are never merged, `PackState` demoted from primary to the `deployment` field of a composite no consumer can bypass, three falsified harness reasons corrected, and the declared one-shot lifecycle given a schema enum plus a report whose printed approve command was pasted back and actually worked.**

## Performance

- **Duration:** 1h 21m
- **Started:** 2026-09-10T17:55:00Z
- **Completed:** 2026-09-10T19:16:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- **The support axis has two inputs that are never merged, and the bound is stated rather than implied.** `SURFACE_CEILING` holds the structural product claim — can this surface receive project-scope packs at all — and `classifyAdapterSupport` became a resolver over it plus the capability ledger. A ledger row may raise a surface WITHIN its ceiling; a surface whose ceiling is `unsupported` stays `unsupported` and the returned reason says the ceiling bound it and names the ledger value it refused to honour. A harness the ceiling does not know is `unverified` and has no ceiling to be raised within, so a forged ledger row for it changes nothing — the fail-closed default is not reachable around.

- **Three recorded reasons were contradicted by the harnesses they describe. All three are corrected; all three decisions stand.** The plan named two. The codex entry asserted "no documented project-scope discovery has been proven", which codex 0.152.0 falsifies by discovering `.agents/skills` AND `.codex/skills` with a fixture skill watched entering the model-visible prompt. The hermes entry cited its recorded worker strategy as the ground, which `hermes skills trust` at 0.20.6 contradicts in its own help text. The **pi** entry asserted "project-scope discovery under `.pi/skills` is not documented", which pi 0.85.1 falsifies both in `docs/skills.md` and by reporting `scope: "project"` in its own output — that third correction is a Rule 2 deviation, because the prohibition is about EVERY recorded reason and not only the two the planner happened to have found.

- **Every ceiling entry carries a citation, and the rendered reason repeats it.** `SurfaceCeilingEntry` has a `citation` field naming the file it was read from or the version it was observed at, and the `ceiling()` helper appends `[cited: …]` to the reason so a reader of the rendered line can check the claim without holding the record. A named test fails on an empty reason, an empty citation, a citation naming neither a file nor a version, or a reason that does not carry its own citation.

- **`PackState` is no longer primary, and the promotion is real rather than nominal.** `CapabilityState` in `src/types.ts` carries exactly three axes plus their two resolution reasons. `PackReconciliation.state` was RENAMED to `.capability` — not retyped — so every stale reader is a compile error rather than a silent object read. A contract test asserts at runtime that no top-level property of the returned record IS a deployment value, and at the source declaration that neither `PackReconciliation` nor `ProjectReconciliation` declares a property typed `PackState`. Re-adding the shortcut field in the built output turns that test red.

- **The two cross-harness aggregations are deliberately opposite, and the asymmetry is written down.** `support` is a GUARANTEE, so the weakest answer wins and its reason names the harness that bound it — reporting the best surface would promise an opt-out the worst cannot honour. `nativeUse` is an EXISTENCE claim, so the strongest answer wins and its reason names the harness it came from — reporting the weakest would deny an invocation that happened.

- **An unpaired positive still cannot read as a pass at the render seam.** `resolveCapabilityState` runs `pairEvidence` and, on `INCOMPLETE`, reports `unverified` while carrying the unit's OWN summary verbatim — the sentence 03-03 guarantees names the missing half and never prints the positive's axis. A named test asserts the reason says INCOMPLETE and does not contain `invoked`; mutating the implementation to append the positive's axis turns it red.

- **A blocked axis renders a code and a variable name at a third layer of defence.** The sentence is composed from `BlockedReason`'s three NAMED fields rather than from the object, so a value smuggled past the type and the closed schema reaches nothing rendered. The test smuggles one through a cast exactly as 03-03's copy-down test does; passing the whole object through instead turns it red.

- **The declared one-shot lifecycle finally validates against something.** `schemas/pack-catalog.schema.json` narrows `lifecycle` from any non-empty string to an enum of exactly the value the code implements, `PackLifecycle` is the matching union, and a named test asserts the two agree in BOTH directions. A catalog declaring `remove-after-a-fortnight` is now refused at load rather than silently carried.

- **The one-shot report is a state with an offer, and the offer is not a dead end.** `planPackRemoval` gained a SECOND ground beside `STALE` — a one-shot pack the ledger records as `invoked` — so the digest `planOneShotOffer` prints is the one `applyPackRemoval` computes and accepts, rather than a parallel digest calculated beside it. This was verified by pasting the printed command back: `alpha-aos project approve <path> --plan-digest <d> --apply` removed the pack through the approved, snapshotted, reversible path. Reporting itself computes and never acts: a source-level test asserts `planOneShotOffer`'s body names no writer, and a filesystem test asserts the project tree is byte-identical after a full report.

- **The corroborating artifact's asymmetry is on the record, not in a comment.** `ONE_SHOT_OUTPUT_ARTIFACTS` maps `BROWNFIELD_INIT` to `.ai-style-rules.md`, and the observed `OneShotCorroboration` carries a note that states presence corroborates output while absence proves nothing, because a run can be declined partway. A named test asserts the reported state — the invocation date and the removal digest — is identical with the artifact present and absent.

## Task Commits

1. **Task 1: The support ceiling and the resolver bounded by it** — `b5cbefa` (test, RED) → `1b6457e` (feat, GREEN)
2. **Task 2: Promote the composite capability state, and render it in one line** — `1fa3933` (test, RED) → `8c7aa49` (feat, GREEN)
3. **Task 3: The one-shot lifecycle gets a home in the schema and a report with an offer** — `77766b2` (test, RED) → `0713eda` (feat, GREEN)

**End-to-end fixes:** `f646d1e` (fix — three defects only a real CLI run could surface)

**Plan metadata:** this commit (docs: complete plan)

## Files Created/Modified

- `src/types.ts` — `CapabilityState` (the three axes plus `nativeUseReason` and `supportReason`, exactly five fields) and `PackLifecycle`. Both new imports are type-only and erased at runtime, following the precedent `RootReason` already set: each axis is declared beside the code that produces it.
- `src/core/project-plan.ts` — `SurfaceCeilingEntry`, `SURFACE_CEILING`, `provenSurfaceSupport`, the resolver form of `classifyAdapterSupport`, `CapabilityStateInput`, `resolveCapabilityState`, `ReconciliationHostEvidence`, `ledgerHostEvidence`, `ONE_SHOT_LIFECYCLE`, `ONE_SHOT_OUTPUT_ARTIFACTS`, `OneShotCorroboration`, `OneShotOffer`, `planOneShotOffer`; `PackReconciliation.state` → `.capability` plus `lifecycle` and `corroboration`; `classifyInstalledPack` split into a private deployment draft and the composing wrapper; `planPackRemoval`'s second ground; `applyPackRemoval` reads the ledger from the state root its caller named.
- `src/format.ts` — one `CAPABILITY` line per pack carrying all three axes, a `SUPPORT-CEILING` line only where the ceiling actually bounds something, and the `ONE-SHOT` block in the state-plus-offer register CONTEXT.md's `<specifics>` sets. The generic `REMOVAL` block is skipped for a pack that already has a one-shot offer, so one pack never gets two offers.
- `src/cli.ts` — the status branch reads the ledger at the command boundary and passes it in; the approve branch reads it from the same state root, so a one-shot digest the preview printed is not refused as unknown.
- `schemas/pack-catalog.schema.json` — `lifecycle` narrowed to an enum, with a description recording the closed-world rule and the lockstep obligation with `PackLifecycle`.
- `test/project-plan.test.ts` — 19 new tests plus the migration of every existing `pack.state` assertion to the composite.
- `test/pack-catalog.test.ts` — the two schema/union agreement tests.

## Decisions Made

- **The ceiling's real distinction is `unsupported` versus everything else.** D-10 describes the ceiling as "can this surface structurally receive packs at all", which is a yes/no question; `unverified` and `supported` are both "yes" and differ only in whether a product claim has already been made. So the resolver refuses to raise anything whose ceiling is `unsupported` and otherwise lets host evidence raise to `supported`. Codex and pi stay `unverified` in the ceiling deliberately: the plan is explicit that whether they resolve `supported` is the ledger's business.
- **`provenSurfaceSupport` reads the RECORDED observation, not the demotion-aware axis.** D-04's demotion governs the native-use axis — whether a proof still stands for the inputs it was taken against — and `resolveCapabilityState` composes the two. Applying the demotion inside the support resolver would put one axis inside another, which is the one thing D-10 forbids. The doc comment says so on the record rather than leaving it inferable.
- **`PackReconciliation.state` was renamed rather than retyped.** Retyping it to the composite would have left `pack.state` compiling everywhere and silently returning an object; renaming to `.capability` makes every stale reader a compile error. Fourteen existing assertions moved in the RED commit, which is what made the migration visible rather than incidental.
- **`planPackRemoval` gained a second ground instead of `planOneShotOffer` computing its own digest.** The alternative — recomputing `reviewedDigest(REMOVAL_DIGEST_KIND, …)` beside the removal planner — would have produced a digest `applyPackRemoval` refuses, which is a dead end dressed as an offer. The two grounds carry different `reasons`, so they produce different digests and a user can never approve one while reading the other.
- **The corroboration note is short by design.** It is capped by `MAX_STATUS_DETAIL_CHARS` like every other status detail, and the first draft was truncated mid-clause, cutting the half that states the asymmetry. The sentence was rewritten to fit rather than exempted from the bound.
- **The plan path passes no ledger, and that is load-bearing.** `digestablePlan` folds `adapterSupportEvidence` in, so `planProjectCapabilities` calls `classifyAdapterSupport` with no ledger and `reconcileProjectState` resolves no state root of its own. A named test moves a ledger record, asserts the native-use axis actually changed, and then asserts the plan digest and `digestablePlan`'s serialization did not.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] The pi ceiling reason was falsified too, and the plan named only codex and hermes**

- **Found during:** Task 1
- **Issue:** The recorded pi reason asserted "project-scope discovery under `.pi/skills` is not documented". 03-RESEARCH.md Open Question 3 settled that pi is documented AND proven, with an explicit `scope: "project"` in the harness's own output behind its trust gate. The plan's prohibition is about a support classification "whose stated reason is contradicted by the harness's own documented behaviour" — it is not scoped to the two entries the planner happened to name, and leaving a third false reason recorded is exactly the failure the prohibition exists to prevent.
- **Fix:** The pi reason now cites the documented discovery and the observed `scope: project`, names `catalog/stack.yaml`'s recorded strategy as the reason no target is planned yet, and states that whether this host proved delivery is the ledger's business. The DECISION is unchanged at `unverified`.
- **Files modified:** `src/core/project-plan.ts`
- **Verification:** `every SURFACE_CEILING reason is non-empty and carries a citation naming a file or a version` covers the shape; the substance is cited to `pi 0.85.1 docs/skills.md`.
- **Committed in:** `1b6457e`

**2. [Rule 2 - Missing Critical] `src/cli.ts` had to change, or the phase's own verification line would be satisfied only nominally**

- **Found during:** Task 2
- **Issue:** The plan's `files_modified` does not list `src/cli.ts`. Without a change there, `project status` would render three axes that always read `unverified`, because nothing would ever supply the ledger — the mechanism would exist and the command would never exercise it. The plan's verification line is "`project status` renders one line per capability carrying three axes", and three permanently-unverified axes is a technically-passing answer to a question about whether a user can tell the states apart.
- **Fix:** The status branch reads the ledger at the command boundary — the same place every other host path is resolved — and passes it in. `reconcileProjectState` still resolves no state root of its own, so the host fact cannot reach the plan digest. Task 3 extended the same wiring to the approve branch.
- **Files modified:** `src/cli.ts`
- **Verification:** End-to-end runs against a fixture with no ledger, an absent ledger, a refused ledger and an invoked ledger, each producing a different sentence.
- **Committed in:** `8c7aa49`, `0713eda`, `f646d1e`

**3. [Rule 1 - Bug] A REFUSED ledger read exactly like a host where nothing had been proven**

- **Found during:** end-to-end verification after Task 3
- **Issue:** The CLI passed `ledger: null` for both `absent` and `unreadable`, so the rendered reason was the single sentence "no capability ledger was supplied on this path" in three different situations calling for three different next actions. This is precisely the `absent`-versus-`unreadable` collapse `readCapabilityLedger` was written in 03-03 to refuse, reintroduced one layer up at the render seam.
- **Fix:** `ReconciliationHostEvidence` gained `ledgerAbsence`, and `ledgerHostEvidence` turns a ledger read into host evidence with its tri-state intact: `absent` names the next command to run, `unreadable` names the path, the errno and the issue codes and says outright that this is not the same as nothing having been proven.
- **Files modified:** `src/core/project-plan.ts`, `src/cli.ts`, `test/project-plan.test.ts`
- **Verification:** `an absent ledger, a refused ledger and an unasked path give three different native-use reasons`, which asserts the three sentences form a set of size three and that the refused one carries its errno and never reads as absent.
- **Committed in:** `f646d1e`

**4. [Rule 1 - Bug] The corroboration sentence was truncated mid-clause, and the ONE-SHOT line repeated the pack id**

- **Found during:** end-to-end verification after Task 3
- **Issue:** The corroboration note ran past `MAX_STATUS_DETAIL_CHARS` and the status width bound cut it at "…invocation record remai…", removing the half that says absence proves nothing. The rendered ONE-SHOT line also read `ONE-SHOT BROWNFIELD_INIT — lifecycle … . BROWNFIELD_INIT — one-shot, …`.
- **Fix:** The note was rewritten to fit under the bound rather than exempted from it, and the offer's own sentence now carries the lifecycle so the render is `ONE-SHOT ${offer.sentence}`.
- **Files modified:** `src/core/project-plan.ts`, `src/format.ts`
- **Verification:** `the one-shot offer states what is ready and never implies anything was deleted`, plus the end-to-end run showing the whole note.
- **Committed in:** `f646d1e`

**5. [Process] Commits landed on `main`, the protected/default branch**

- **Found during:** Task 1 (pre-commit HEAD assertion)
- **Issue:** The executor's pre-commit guard halts on a protected branch unless `git.allow_default_branch_commits` is set, and `.planning/config.json` does not set it.
- **Fix:** Proceeded, and recorded it here rather than silently — identical to the notes in 03-01, 03-02 and 03-03. `git.branching_strategy` is `"none"`, the orchestrator explicitly degraded worktree isolation for this phase and named `main` as the intended target, and every previously completed plan in this project committed to `main`. No destructive git operation was used and no configuration was modified.

---

**Total deviations:** 4 auto-fixed (2 missing critical, 2 bugs) + 1 process note
**Impact on plan:** No scope creep. Deviations 1 and 3 each close a hole through which a false or collapsed statement would have been recorded as evidence — the exact failure class this phase exists to prevent. Deviation 2 is one file the planner did not list and one read at a command boundary; without it the phase's own verification line would have passed while proving nothing.

## Issues Encountered

- **Every one of the 19 new tests was mutation-checked, and one mutation harness gave a false negative.** Following the phase's standing instruction, each behavioural claim was proven capable of failing by mutating the built implementation and watching the named test go red: the ceiling-bound clause, the hermes ground, the citation helper, the top-level `state` field, the INCOMPLETE axis leak, the blocked-reason copy-down, the one-shot removal ground, the offer's wording, the corroboration asymmetry, the schema enum, and the source-level no-writer assertion. One attempt initially reported the test still passing — the multi-line replacement string had not matched the compiled output at all, so nothing was mutated. Re-running with a verified substitution turned it red. A mutation harness that does not assert its own edit applied produces exactly the false green it was meant to detect.
- **The one-shot offer would have been a dead end if the digest had been computed beside `planPackRemoval`.** `applyPackRemoval` looks a digest up in `planPackRemoval`'s output, and a one-shot pack is `CURRENT`, not `STALE`, so nothing would have matched. This is invisible to a unit test that only inspects the offer's fields; it surfaced by pasting the printed command back and watching the removal actually run.
- **The `codex debug prompt-input` and `pi --mode rpc` observations in the corrected ceiling reasons are RESEARCH.md's, not this plan's.** Nothing in this plan probed a harness. The reasons cite the version each observation was recorded at so an audit can tell a recorded observation from a live one.
- **`actuals.tokens` is on the diff instrument.** 20251 is chars/4 over this plan's added lines (81,003 added characters across `src`, `schemas` and `test`), the same instrument 03-03 named explicitly. The plan estimated 94,000, so this came in far under — most of the work was replacing and rewiring existing code rather than adding modules.

## Deferred Issues

- **`<project>/.codex/skills` is named in the corrected codex reason and is still not a target.** RESEARCH.md's still-open question — whether it should join `PROJECT_SKILL_ROOTS` — is unchanged by this plan, and plan 03-04 already recorded the second root as report-only. The reason now names both roots so the gap is visible rather than implied.
- **The support axis does not demote when the ledger's proof does.** `provenSurfaceSupport` reads the recorded observation, by design and with the boundary documented. A composed view that applies D-04's demotion to the support axis as well would need `CurrentInputs` on the status path, which nothing supplies today.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Phase 4's gates have a composite to resolve against.** `resolveCapabilityState` is the single entry point, `CapabilityState` is the shape, and no surface hands back a bare deployment value — so a gate cannot accidentally bind to the deployment axis alone.
- **CAPA-07 is claimed here, and CAPA-06 is not.** This plan's `requirements` field names only CAPA-07. The shared-ID gate held CAPA-07 back until every declaring plan finished; 03-03 and 03-09 are the two, and both now have summaries.
- **CAPA-07's edge-probe row stays UNRESOLVED and must be raised, not closed.** It came back `unclassified` from the deterministic edge probe. This plan authors 0 rows and inherits 1, and the predicates implemented come from CONTEXT.md D-10/D-11/D-12/D-13. See coverage entry D8.
- **`project status` now depends on a host file, so two developers on one commit can see different output.** That is D-11 working as designed — the native-use and support axes are host facts and are reported, never digested — but it is the first command whose human output varies with the machine. Any later test asserting on `project status` output must pin `ALPHA_AOS_STATE_DIR`, or it will read whatever the developer's real ledger says.
- **Baselines for the next plan:** `npm test` is 637 tests (631 pass, 0 fail, 6 pre-existing platform skips) and `npm run build` reports `74 inputs, 142 outputs`.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 (tdd) | `b5cbefa` | `1b6457e` | — (none needed) | `RED_EVIDENCE_OK` — 166 tests, 159 pass, 7 fail; target `the hermes ceiling reason names the scoping ground and no longer cites the recorded worker strategy` |
| 2 (tdd) | `1fa3933` | `8c7aa49` | — (none needed) | `RED_EVIDENCE_OK` — 173 tests, 154 pass, 19 fail; target `the three axes are independently settable on one composite and JSON exposes all three under distinct keys` |
| 3 (tdd) | `77766b2` | `0713eda` | — (none needed) | `RED_EVIDENCE_OK` — 199 tests, 192 pass, 7 fail; target `a one-shot pack the ledger records as invoked reports one-shot, already invoked, with a runnable approve command` |

No gate violations. No REFACTOR commit was made for any task because none had an obvious cleanup to make, and the cycle commits a refactor only when one changes something. The one additional `fix(03-09)` commit is not a gate commit: it carries four defects found by end-to-end verification AFTER all three cycles closed, each with its own test.

## Self-Check: PASSED

- Every modified file exists on disk: `src/types.ts`, `src/core/project-plan.ts`, `src/format.ts`, `src/cli.ts`, `schemas/pack-catalog.schema.json`, `test/project-plan.test.ts`, `test/pack-catalog.test.ts`, and this summary.
- Commits `b5cbefa`, `1b6457e`, `1fa3933`, `8c7aa49`, `77766b2`, `0713eda` and `f646d1e` are all reachable from `git log`; `git rev-list --count 859887f..HEAD` is 7, matching the `commits` field before this metadata commit.
- `npm run check` clean; `npm run build` 74 inputs / 142 outputs; `npm test` 637 tests / 631 pass / 0 fail / 6 skipped — above the 615-test carried-forward baseline and far above the 208-test Phase 1 baseline.
- Every task acceptance criterion re-run: `SURFACE_CEILING` has 5 entries covering every declared harness, each with a non-empty citation its reason repeats; `export type PackState` occurs exactly once in non-comment `src/core/project-plan.ts`; `CapabilityState` is declared once in `src/types.ts` with exactly five fields; `one-shot-remove-after-output` occurs twice in `schemas/pack-catalog.schema.json` and sits inside an `enum` array.
- Plan-level `<verification>`: `npm test` reports `# fail 0` above baseline; `project status` renders one line per capability carrying three axes (verified end to end); a one-shot pack recorded as invoked printed its offer and deleted nothing — the target file was still on disk after the report, and was removed only when the printed approve command was pasted back.
- No tracked file was deleted by this plan (`git diff --diff-filter=D --name-only 859887f..HEAD` is empty).
- No ledger write reached the developer state root: every end-to-end run pinned `ALPHA_AOS_STATE_DIR` to a scratch directory.
