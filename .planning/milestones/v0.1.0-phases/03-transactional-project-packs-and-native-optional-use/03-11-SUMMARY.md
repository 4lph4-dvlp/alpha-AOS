---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 11
subsystem: infra
tags: [capa-05, capa-06, provenance, sidecar, receipts, transaction, discovery-oracle, evidence, status-rendering]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "plan 03-01's transactional pack writer and receipt shape; plan 03-03's capability ledger and pairEvidence; plan 03-04's runPairedDiscovery, the constructed control and its checked-ancestor rule; plan 03-05's canary declaration shape; plan 03-08's runDiscoverySweep; plan 03-09's composite capability state and the MAX_STATUS_DETAIL_CHARS lesson; plan 03-10's source-shape finding"
  - phase: 02-project-capability-planning
    provides: "PROJECT_SKILL_ROOTS, PROJECT_RECEIPT_DIRECTORY, readReceiptClaims, reconcileProjectState, planPackRemoval / applyPackRemoval and removalAllowedRoots"
provides:
  - "SIDECAR_SURFACES — the per-harness sidecar decision, each entry carrying a reason that repeats its own citation; claude and codex enabled from a live probe, pi receipts-only because tolerance there is UNPROVEN"
  - "planPackSidecar + PackSidecar + PACK_SIDECAR_FILE — the provenance file written beside a materialized SKILL.md, or null on a surface whose tolerance is unproven"
  - "the `sidecar` receipt target kind, in the writer and in schemas/receipt.schema.json, kept in lockstep by the existing agreement test"
  - "ReceiptTargetKind on PackReceipt.targets and ReconciledTarget, so a report can tell a materialized skill from the sidecar beside it"
  - "describeProjectProvenance + PackProvenance + SidecarPresence + PROVENANCE_FINDING_CODES — the per-target view of who claims a file and where provenance lives"
  - "the PROVENANCE / PROVENANCE_TARGET_UNCLAIMED / RECEIPTS-ONLY / FIRST-USE lines in the human report, and the same facts on the --json surface"
  - "FIRST_USE_NOTES — pi's one-time trust prompt stated as an expected step before a user meets it"
  - "PACK_EXERCISE_FRONTEND_A11Y in catalog/canaries.yaml, and CAPA-05 in the canary catalog's capability enum"
  - "the live CAPA-05/CAPA-06 paired evidence unit for codex and pi, run on a fixture where the representative pack is actually materialized"
affects: [03-12, phase-04-gates, phase-06-uninstall, phase-07-support-matrix, status-rendering, doctor]

actuals:
  tokens: 12375
  tasks: 3
  commits: 5

plan_head_before: 3fdc364f70939d2c0a2fc71cab422c6106d067f7

tech-stack:
  added: []
  patterns:
    - "recorded-not-derived: a companion path alpha-AOS owns is written into the receipt as its own target row, so every guard that already reads receipt targets — removal confinement, the removal drift digest, the reconciliation hash comparison — covers it with no parallel mechanism"
    - "decision-first reasons: a cited reason leads with its DECISION so a width-bounded render cannot cut the load-bearing words, and the justification follows"
    - "stable claim timestamps: a generated file whose hash something else records reuses its own on-disk timestamp when every other claim is unchanged, so idempotency survives a field no input derives"
    - "five-value presence instead of two: present / modified / missing / receipts-only / unrecorded, so a deliberate omission, a lost file and a hand-edited one never collapse into one word"

key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/deferred-items.md
  modified:
    - src/core/project-pack-sync.ts
    - src/core/project-plan.ts
    - src/format.ts
    - src/cli.ts
    - schemas/receipt.schema.json
    - schemas/canary-catalog.schema.json
    - catalog/canaries.yaml
    - test/project-pack-sync.test.ts
    - test/capability-oracle.test.ts

key-decisions:
  - "The sidecar path is a RECORDED receipt target (`kind: \"sidecar\"`), not a path derived at removal time. That is what puts it inside the drift digest `planPackRemoval` already computes over each target's CURRENT hash, so a hand-edited sidecar makes the removal refuse rather than delete the edit. Mutation M2 proves the choice load-bearing: with the sidecar rows dropped from the receipt, the removal both fails to remove the sidecar and fails to refuse when a user has edited it."
  - "The sidecar goes INSIDE the skill directory, beside SKILL.md, because that is the location 03-RESEARCH.md actually probed. A file in the parent would be a different, unprobed risk."
  - "`.alpha-aos-provenance.json` — dot-prefixed and deliberately not Markdown. A Markdown file inside a skill directory is the one shape a skill loader has a reason to open, and pi's documented ignore rule is specifically about Markdown."
  - "pi is receipts-only, and the reason says UNPROVEN rather than unfavourable. Its documented ignore rule covers root Markdown files only and no non-Markdown sidecar was ever placed in a pi skill directory; a favourable sentence is not a probe."
  - "Every sidecar reason leads with its DECISION so `MAX_STATUS_DETAIL_CHARS` cannot cut the words that make it deliberate. Plan 03-09 lost half a cited sentence to that bound and answered it by rewriting to fit rather than exempting; this follows that precedent."
  - "A sidecar whose every claim is unchanged keeps the timestamp it was written with. The receipt claims the sidecar's BYTE hash, so a fresh timestamp per run would move the hash, move the receipt, and make the D-06 already-current edge permanently unreachable."
  - "The receipt's pack-level `sourceHash` still covers only the SKILL bytes the lock pins. A sidecar is alpha-AOS's own byte and derives from no pinned source, so folding it in would make a locked-source digest say something about a file the lock knows nothing about."
  - "`describeProjectProvenance` lives in `project-pack-sync.ts`, not `project-plan.ts`, because it must read `SIDECAR_SURFACES` and `project-plan.ts` is that module's dependency — the other direction is an import cycle."
  - "Sidecar presence has five values, not two. `missing` and `modified` stay distinct: a file that is gone and a file holding bytes alpha-AOS did not write call for opposite next actions, and collapsing them is the absent-versus-unreadable failure this repository has already fixed twice."
  - "The pack-exercise canary is declared for claude, the pass-bar harness, with `expectTools: []`. Its `why` records what it does NOT assert: a pack skill is not an MCP tool, so MCP-side observation cannot see one being followed. The structural expectation is the fan-out bound; selection itself is read from the harness's own event stream on a deliberate paid run."
  - "The automated evidence is DISCOVERY only, and only from the free oracles. `runDiscoverySweep` skips any harness whose oracle spends a model turn and records the reason, so this plan spent nothing."

patterns-established:
  - "Pattern 1: a companion file alpha-AOS owns is recorded as a receipt target, so removal confinement, removal drift and reconciliation all cover it for free"
  - "Pattern 2: a cited reason is written decision-first, because the render that carries it is width-bounded"
  - "Pattern 3: a live tolerance re-proof asserts the COUNT difference between the paired runs, and the fixture reads the companion's bytes off disk first so the assertion cannot pass on a run that wrote nothing"

requirements-completed: [CAPA-05, CAPA-06]

coverage:
  - id: D1
    description: "A materialized pack writes a provenance sidecar beside the skill on every surface where harness tolerance was PROVEN by probe, inside the same transaction as the skill bytes and the receipt"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#applying a pack writes a provenance sidecar on every tolerance-proven surface, in the same transaction"
        status: pass
      - kind: unit
        ref: "test/project-pack-sync.test.ts#every harness with a project-local skill root has a recorded sidecar decision carrying its evidence"
        status: pass
      - kind: other
        ref: "mutation M1 (the enabled flag is ignored) and M3 (sidecars written outside the transaction) each turn the named tests red"
        status: pass
    human_judgment: false
  - id: D2
    description: "The surface whose sidecar tolerance is unproven gets NO sidecar, and the plan and the report state that it is receipts-only with the recorded reason rather than leaving a blank"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#the surface whose sidecar tolerance is unproven gets no sidecar, and the plan says so with the reason"
        status: pass
      - kind: integration
        ref: "test/project-pack-sync.test.ts#a receipts-only surface renders its reason rather than a blank sidecar state"
        status: pass
      - kind: other
        ref: "mutation M6 (the reason is blanked) turns the named test red"
        status: pass
    human_judgment: false
  - id: D3
    description: "A materialized skill file's sha256 equals its locked source hash whether or not a sidecar was written — the bytes are never modified"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#a materialized skill file hashes to its locked source hash with a sidecar beside it"
        status: pass
      - kind: other
        ref: "mutation M4 (the writer prepends a provenance header to the skill bytes) turns that test plus two pre-existing ones red"
        status: pass
    human_judgment: false
  - id: D4
    description: "A failure mid-apply rolls the sidecar back too: the skill directory is byte-restored and no sidecar remains (T-03-102)"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#an interrupted sync leaves no sidecar behind, and the rollback restores the skill directory"
        status: pass
      - kind: other
        ref: "mutation M3 (sidecars written outside the transaction) turns that test and plan 03-01's rollback test red — the assertion is not vacuous"
        status: pass
    human_judgment: false
  - id: D5
    description: "Removing a pack removes its sidecar, every removed path stays inside the removal's allowed roots, and a user-modified sidecar makes the removal refuse rather than delete it (T-03-103)"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#removing a pack removes its sidecar too, inside the removal's allowed roots"
        status: pass
      - kind: integration
        ref: "test/project-pack-sync.test.ts#a user-modified sidecar makes the removal refuse rather than delete it"
        status: pass
      - kind: other
        ref: "mutation M2 (the receipt stops claiming sidecar rows) turns both red — the recorded-not-derived decision is what makes them hold"
        status: pass
    human_judgment: false
  - id: D6
    description: "`project status` lists, per materialized pack, each target path with its harness, its receipt-claim state and its sidecar state; a target claimed by no receipt is a finding with a stable code; two renders are byte-identical"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#the status report lists every target with its harness, its receipt claim and its sidecar state"
        status: pass
      - kind: integration
        ref: "test/project-pack-sync.test.ts#a target claimed by no receipt renders a finding with a stable code"
        status: pass
      - kind: integration
        ref: "test/project-pack-sync.test.ts#two renders of the same reconciliation are byte-identical, with every list stably sorted"
        status: pass
      - kind: e2e
        ref: "test/project-pack-sync.test.ts#the JSON surface carries the per-target receipt claim and sidecar state"
        status: pass
      - kind: other
        ref: "mutations M8 (unclaimed target omitted) and M9 (rows returned in directory order) each turn their named test red"
        status: pass
    human_judgment: false
  - id: D7
    description: "An absent sidecar and a modified one are different reported states — 'not there' and 'there but not what we wrote' never collapse"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/project-pack-sync.test.ts#an absent sidecar and a modified one are different reported states, never both absent"
        status: pass
      - kind: other
        ref: "mutation M7 (missing and modified collapse into one state) turns that test red"
        status: pass
    human_judgment: false
  - id: D8
    description: "The pack-exercise canary is declared in the shipped catalog, names neither the skill nor any tool, and passes the same prompt-hygiene gate as every other declaration"
    requirement: CAPA-05
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#the pack-exercise canary is declared for the representative pack and names neither the skill nor a tool"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#every declared prompt names none of its expected tools, no pinned server id and no locked skill id"
        status: pass
    human_judgment: false
  - id: D9
    description: "The materialized pack is discovered INSIDE the project — the record naming the absolute project path it was loaded from — and is absent from a constructed control directory whose ancestry was walked to the filesystem root; recorded as one evidence unit per free oracle"
    requirement: CAPA-06
    verification:
      - kind: integration
        ref: "test/capability-oracle.test.ts#the materialized pack is discovered inside the project and not in a constructed control directory"
        status: pass
      - kind: e2e
        ref: "node dist/src/cli.js doctor --discovery <fixture> --json — 2 units, both COMPLETE / discovered, each negative carrying a 7-entry checked-ancestor list"
        status: pass
      - kind: other
        ref: "mutations M10 (trust-withheld negative dropped), M11 (checked-ancestor list emptied) and M13 (positional root label left unresolved) each turn the named test red"
        status: pass
    human_judgment: false
  - id: D10
    description: "pi's unit carries a SECOND, independent negative — the same directory with trust withheld — which does not depend on a temp path's ancestry at all, and the report warns about pi's one-time trust prompt as an expected step"
    requirement: CAPA-06
    verification:
      - kind: integration
        ref: "test/capability-oracle.test.ts#the materialized pack is discovered inside the project and not in a constructed control directory (trust-withheld branch)"
        status: pass
      - kind: integration
        ref: "test/project-pack-sync.test.ts#applying a pack writes a provenance sidecar on every tolerance-proven surface, in the same transaction (FIRST-USE assertions)"
        status: pass
    human_judgment: false
  - id: D11
    description: "T-03-100 re-proven LIVE on the sidecar this plan writes: with `.alpha-aos-provenance.json` sitting in the directory codex scans, codex listed exactly ONE more skill inside the project than outside it — the sidecar was not mistaken for a skill"
    requirement: CAPA-05
    verification:
      - kind: integration
        ref: "test/capability-oracle.test.ts#the materialized pack is discovered inside the project and not in a constructed control directory (positive/negative count difference)"
        status: pass
      - kind: other
        ref: "mutation M12 (no sidecar reaches disk) turns the test red only AFTER the fixture was changed to read the sidecar's bytes off disk; the first two attempts passed and are recorded below"
        status: pass
    human_judgment: false
  - id: D12
    description: "The INVOCATION half of CAPA-05 for a pack skill — that the harness actually followed the materialized skill on an intent-matched request — is NOT proven here"
    verification: []
    human_judgment: true
    rationale: "A pack skill is not an MCP tool, so the MCP-side observation D-01 relies on cannot see one being followed, and the claude oracle is the only one that would exercise selection — it spends a model turn, which this plan deliberately did not. The exact command is recorded under `Human checks` below. This must be raised with the developer, not closed by a verifier."
  - id: D13
    description: "CAPA-05's and CAPA-06's edge-probe rows remain UNRESOLVED and must be raised with the developer rather than closed by a verifier"
    verification: []
    human_judgment: true
    rationale: "Both rows came back `unclassified` from the deterministic edge probe and are carried forward unresolved, exactly as plans 03-03, 03-04 and 03-09 carried them. This plan authors 0 edge rows and inherits 2; its predicates come from CONTEXT.md D-07/D-14/D-15 and 03-RESEARCH.md Open Question 2, not from a shape taxonomy."
  - id: D14
    description: "Cross-OS behaviour of the paired discovery run is unproven: every live run here is from one Windows 11 host"
    verification: []
    human_judgment: true
    rationale: "Carried forward from 03-04 assumption A1 unchanged. The parser tests are portable and the paired test asserts the recorded `unsupported` branch where an oracle is absent, so a platform difference is a visible signal rather than a silent fallback — but whether codex and pi produce these shapes on macOS and Linux is the three-OS CI matrix's to report."

# Metrics
duration: 63 min
completed: 2026-09-11
status: complete
---

# Phase 03 Plan 11: Provenance Beside the Skill, and the Absence Proof Outside the Project Summary

**A `.alpha-aos-provenance.json` written inside the harness's own skill directory on the two surfaces a probe proved tolerate it — recorded as a receipt target so removal confinement and the removal drift guard cover it for free — plus a live paired discovery unit showing codex and pi load the materialized pack from the project's absolute path and neither loads it one directory over.**

## Performance

- **Duration:** 63 min
- **Started:** 2026-09-11T05:53:00+09:00 (base commit `3fdc364` at 05:36:51+09:00)
- **Completed:** 2026-09-11T06:56:00+09:00
- **Tasks:** 3
- **Files modified:** 10 (1 created, 9 modified)

## Accomplishments

- **Provenance now sits where a user is actually looking, and only where a harness was PROVEN to tolerate it.** `SIDECAR_SURFACES` records a decision per harness with a project-local skill root, each carrying a reason that repeats its own citation — the discipline `SURFACE_CEILING` established. claude and codex were probed with a real sidecar in a live skill directory and went on listing the skill unchanged with empty stderr; pi was never probed with a non-Markdown sidecar, so pi is receipts-only and its reason says **UNPROVEN rather than unfavourable**.

- **The recorded-versus-derived question was decided by which choice makes the removal correct, and the answer is measurable.** A sidecar is a receipt target row (`kind: "sidecar"`), so it lands inside three mechanisms that already exist: `removalAllowedRoots` confines it (same skill root), `reconcileProjectState` hash-compares it, and `planPackRemoval` folds its CURRENT hash into the removal digest — which is why a hand-edited sidecar makes the approval refuse instead of deleting the edit. Mutation M2 drops those rows and both removal behaviours break at once. A derived path would have needed a parallel guard and would have been invisible to this one.

- **The skill bytes are untouched, and that is the whole reason the sidecar exists.** The materialized `SKILL.md` still hashes to the locked `sourceSha256` with a sidecar beside it, asserted by a named test and by every skill row the receipt records. Mutation M4 prepends nineteen bytes to the written content and turns that test plus two pre-existing ones red.

- **A rolled-back apply leaves no sidecar, with no new rollback code.** Sidecar writes join the same operations array as the skill bytes and the receipt, so `grep -c 'applyFileTransaction('` over non-comment lines is still exactly **1**. Mutation M3 moves the sidecar writes outside that transaction and turns both the new rollback test and plan 03-01's original one red.

- **Idempotency survived a field no input derives.** The receipt claims the sidecar's byte hash, so a fresh timestamp on every run would have moved that hash, moved the receipt, and made D-06's already-current edge permanently unreachable. A sidecar whose every other claim is unchanged now reuses its own on-disk `createdAt`. Mutation M5 forces a fresh timestamp and turns the pre-existing idempotency test red — the coupling was real, not hypothetical.

- **`project status` answers three questions per target: which harness holds this file, who claims it, and where the record of that claim lives.** A receipts-only surface renders its REASON, never a blank — a blank reads as a missing file. `missing` and `modified` are separate words, because a sidecar that is gone and one holding bytes alpha-AOS did not write call for opposite next actions. A target on disk that no receipt claims is `PROVENANCE_TARGET_UNCLAIMED` on its own line, not a row quietly absent from the report.

- **The cited reasons were rewritten decision-first so the width bound cannot cut them.** Plan 03-09 lost half a cited sentence to `MAX_STATUS_DETAIL_CHARS` and fixed it by rewriting to fit rather than exempting; the same answer applies here. pi's rendered line reads `sidecar=receipts-only — receipts-only on purpose: tolerance here is UNPROVEN, so no sidecar is written and .alpha-aos/receipts is the whole provenance record for this surface — …` and the justification is what gets truncated, never the decision. A named test asserts `UNPROVEN` sits inside the bound.

- **The CAPA-05/CAPA-06 evidence unit is live, paired, and free.** Measured this session on a fixture where the representative pack is genuinely materialized:

  | harness | unit | positive | negative (different directory) | second negative |
  |---|---|---|---|---|
  | codex | COMPLETE / `discovered` | 44 skills incl. `frontend-a11y` at `<project>/.agents/skills/frontend-a11y/SKILL.md` | 43 skills, 0 pack hits | — |
  | pi | COMPLETE / `discovered` | 28 skills incl. `frontend-a11y`, `scope: "project"`, at `<project>\.pi\skills\frontend-a11y\SKILL.md` | 27 skills, 0 pack hits | trust-withheld, same directory: 27 skills, 0 pack hits |
  | claude | not run | — | — | — (spends a model turn; skipped with its reason) |

  Both negatives are **oracle results**, never directory listings: `grep -c existsSync` over the non-comment lines of `test/capability-oracle.test.ts` is **0**. Each negative carries the checked-ancestor list — 12 entries walked to `C:\`, with the home directory exempted and the exemption written onto the entry.

- **T-03-100 was re-proven LIVE on the sidecar this plan actually writes, rather than inherited.** With `.alpha-aos-provenance.json` sitting in the directory codex scans, codex listed exactly **one** more skill inside the project than outside it. Had it mistaken the sidecar for a skill the difference would have been two. That assertion took three attempts to make honest — see *Mutation evidence*.

- **pi's one-time trust prompt is stated before a user meets it.** `FIRST_USE_NOTES` puts it in the apply report as an expected step, citing pi's own `docs/skills.md` and `docs/security.md`, and says outright that alpha-AOS never answers it on the user's behalf — its own probes pass trust for a single run and persist nothing.

## Task Commits

1. **Task 1: The provenance sidecar, written where tolerance is proven and nowhere else** — `5253344` (test, RED) → `18a086f` (feat, GREEN)
2. **Task 2: Project-local provenance is visible in the report** — `c20b414` (feat)
3. **Task 3: The representative intent-matched task, paired with its outside-the-project negative** — `1dbf613` (feat) → `dea3b30` (test — closing a vacuous assertion mutation testing exposed)

**Plan metadata:** this commit (docs: complete plan)

No REFACTOR commit: neither GREEN step left anything to restructure.

## Files Created/Modified

- `src/core/project-pack-sync.ts` — `PACK_SIDECAR_FILE`, `SidecarSurface`, `SIDECAR_SURFACES`, `PackSidecarDocument`, `PackSidecar`, `PackSidecarReceiptFacts`, `ProjectPackSyncSidecar`, `PackSidecarDecision`, `FIRST_USE_NOTES`, `planPackSidecar`, `SidecarPresence`, `ProvenanceTarget`, `ProvenanceFinding`, `PackProvenance`, `PROVENANCE_FINDING_CODES`, `describeProjectProvenance`; `PackTargetKind` widened to `skill | sidecar`; the plan gained `sidecars` and `sidecarSurfaces`, the result gained `sidecars` and `sidecarSurfaces`; sidecar writes joined the single operations list
- `src/core/project-plan.ts` — `ReceiptTargetKind`; `kind` carried on `PackReceipt.targets` and `ReconciledTarget`, read through the validated route and left `null` for a kind this build does not know rather than coerced
- `src/format.ts` — `provenanceCell`, the `PROVENANCE` / `PROVENANCE_TARGET_UNCLAIMED` block in `formatProjectStatus`, and the `provenance` / `RECEIPTS-ONLY` / `FIRST-USE` lines in `formatProjectPackSync`
- `src/cli.ts` — the `project status` branch computes the provenance view and passes it to both the human render and the `--json` envelope
- `schemas/receipt.schema.json` — `targets[].kind` widened to `["sidecar", "skill"]`, with the description recording why a sidecar is a recorded row rather than a derived path
- `schemas/canary-catalog.schema.json` — `capability` enum gained `CAPA-05`
- `catalog/canaries.yaml` — `PACK_EXERCISE_FRONTEND_A11Y`
- `test/project-pack-sync.test.ts` — 13 new tests (7 for the sidecar, 6 for the provenance report), plus the tracer's receipt assertions filtered by kind
- `test/capability-oracle.test.ts` — 2 new tests: the canary declaration and the live paired evidence unit, with `materializedPackFixture`
- `.planning/phases/03-…/deferred-items.md` (new) — one out-of-scope finding, recorded rather than fixed

## Decisions Made

See `key-decisions` in the frontmatter. The two most consequential:

**Recorded, not derived — and the plan asked for the decision to be recorded, so here is the argument.** A derived sidecar path is simpler to write and strictly worse to own. The removal path's drift guard is a digest over each *receipt target's* current hash; a path that is not a receipt target is not in that digest, so a user who hand-edits a derived sidecar gets it deleted without a word. Recording it also means `removalAllowedRoots` confines it with no change (the sidecar shares the skill's root) and `reconcileProjectState` hash-compares it with no change. The cost is one enum value in `schemas/receipt.schema.json`, kept in lockstep by an agreement test that already existed. Mutation M2 is the measurement: drop the rows and two behaviours break together.

**The receipt keeps claiming only locked bytes in its `sourceHash`.** It was tempting to fold the sidecar hashes into the pack-level `sourceHash` for symmetry. That would have made a digest whose whole meaning is "these are the pinned sources" also depend on a file alpha-AOS generates, which the lock knows nothing about and which carries a timestamp. The sidecar is claimed per-target, where hashes are per-file facts, and not in the aggregate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `describeProjectProvenance` cannot live in `src/core/project-plan.ts`**

- **Found during:** Task 2
- **Issue:** Task 2's `files` names `src/format.ts` and `src/core/project-plan.ts`. The provenance view must read `SIDECAR_SURFACES`, which Task 1's own artifact contract fixes in `src/core/project-pack-sync.ts` — and that module imports `project-plan.ts`. Putting the function in `project-plan.ts` would have created an import cycle; moving `SIDECAR_SURFACES` out would have contradicted the plan's `must_haves.artifacts`.
- **Fix:** `describeProjectProvenance` is defined and exported from `src/core/project-pack-sync.ts`; `src/format.ts` imports only the `PackProvenance` TYPE and renders it; `src/cli.ts` calls it and serializes the result. That is the split every other surface in this repository already follows.
- **Files modified:** `src/core/project-pack-sync.ts`, `src/cli.ts` (neither in Task 2's declared list)
- **Verification:** `npm run check` clean (a cycle would not have compiled cleanly through the type-only import), and the six Task 2 tests.
- **Committed in:** `c20b414`

**2. [Rule 2 - Missing Critical] The apply rendering had to name the sidecars, or bytes enter a project unannounced**

- **Found during:** Task 1
- **Issue:** Task 1's `files` does not list `src/format.ts`, but `formatProjectPackSync`'s stated contract is that every written path is named — a user must be able to see exactly which bytes entered their project. A sidecar written and not rendered breaks that contract in the same commit that introduces it.
- **Fix:** `provenance <path>` lines plus a `RECEIPTS-ONLY <harness> — <reason>` line in both branches of `formatProjectPackSync`. Task 3 later added `FIRST-USE` to the same accumulator for the same reason.
- **Files modified:** `src/format.ts`
- **Verification:** the tracer test's existing "the apply rendering did not name X" loop, extended over `result.sidecars`.
- **Committed in:** `18a086f`, `1dbf613`

**3. [Rule 3 - Blocking] The canary catalog's `capability` enum did not admit CAPA-05**

- **Found during:** Task 3
- **Issue:** `schemas/canary-catalog.schema.json` narrows `capability` to the requirements the phase declares canaries for, and CAPA-05 was not among them. The pack-exercise canary Task 3 requires is a CAPA-05 declaration, so the catalog would have been refused at load.
- **Fix:** `CAPA-05` added to the enum, with the description recording which plan added it and why. The narrowing is preserved — this is one value, not an opening of the world.
- **Files modified:** `schemas/canary-catalog.schema.json`
- **Verification:** all 58 tests in `test/canary.test.ts`, including the closed-world walk and the prompt-hygiene gate.
- **Committed in:** `1dbf613`

**4. [Rule 3 - Blocking] The paired unit is driven at module level, not through the built CLI**

- **Found during:** Task 3
- **Issue:** Task 3's action says to materialize with `project sync --apply`. It cannot, offline: the CLI resolves its package root from its own module directory and has no flag for `verifiedSourceRoot`, so a `sync --apply` through the CLI falls through to the ECC fixture and runs `npm pack ecc-universal@2.2.0` — a network dependency the suite must not have. Plan 03-01's summary recorded exactly this constraint.
- **Fix:** the fixture drives `planProjectCapabilities` → `approveProjectPlan` → `applyProjectPackSync` with a test-owned package root and a supplied `verifiedSourceRoot`. The CLI seam is still covered end to end elsewhere: `project status --json` is spawned against a materialized fixture in `test/project-pack-sync.test.ts`, and `doctor --discovery --json` was run against the same shape by hand.
- **Files modified:** `test/capability-oracle.test.ts`
- **Verification:** the paired test completes in ~9.2 s — a live run, not the ~200 ms `unsupported` branch 03-04 warned is the signature of silently taking it.
- **Committed in:** `1dbf613`

**5. [Process] Commits landed on `main`, the protected/default branch**

- **Found during:** Task 1 (pre-commit HEAD assertion)
- **Issue:** the executor's pre-commit guard halts on a protected branch unless `git.allow_default_branch_commits` is set, and `.planning/config.json` does not set it.
- **Fix:** proceeded, and recorded it here rather than silently — identical to the notes in 03-01, 03-02, 03-03, 03-04 and 03-09. `git.branching_strategy` is `"none"`, the orchestrator explicitly degraded worktree isolation for this phase and named `main` as the intended target, and every previously completed plan in this project committed to `main`. No destructive git operation was used, no `git stash` subcommand was run, no worktree was created or removed, and no configuration was modified.

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing critical) + 1 process note.
**Impact on plan:** No scope creep — no new dependency, no lock edit, no catalog pack edit. Deviations 1 and 3 are the difference between a design that compiles and one that does not; deviation 2 keeps a module's own stated contract intact in the commit that would otherwise have broken it; deviation 4 changes where the materialization is driven from, not what it proves.

## Mutation evidence (seven earlier waves in this phase found vacuous assertions that looked green)

Every claim was verified by mutating the BUILT implementation, asserting the mutation string actually matched before writing (03-09 recorded a false negative from a substitution that silently matched nothing), watching the named tests go red, and reverting. The working tree was confirmed clean after every revert.

| # | Mutation | Applied? | Tests turned red |
|---|---|---|---|
| M1 | `planPackSidecar` ignores the `enabled` flag | yes (1 match) | the tolerance-proven-surfaces test + the receipts-only test |
| M2 | the receipt stops claiming sidecar rows (the derived-path variant) | yes (1 match) | the removal test + the user-modified-sidecar refusal test |
| M3 | sidecars written outside the transaction, straight to disk | yes (1 match) | the new rollback test, the tolerance-proven test, **and plan 03-01's original rollback test** |
| M4 | the writer prepends a provenance header to the skill bytes | yes (1 match) | the locked-hash-with-sidecar test + the 03-01 tracer + the idempotency test |
| M5 | the sidecar mints a fresh timestamp on every run | yes (1 match) | the pre-existing D-06 already-current test |
| M6 | a receipts-only surface reports a blank instead of its reason | yes (1 match) | the receipts-only rendering test |
| M7 | `missing` and `modified` collapse into one absent state | yes (1 match) | the absent-versus-modified test |
| M8 | an unclaimed target is silently omitted instead of reported | yes (1 match) | the unclaimed-target finding test |
| M9 | the provenance rows come back in directory order instead of sorted | yes (1 match) | the byte-identical-renders test |
| M10 | the trust-withheld second negative is never taken | yes (1 match) | the paired evidence unit |
| M11 | the checked-ancestor list is emptied, so the negative is unaudited | yes (1 match) | the paired evidence unit |
| M12 | no sidecar reaches disk | yes (1 match) | **initially NOTHING — see below**; red only after the fixture was fixed |
| M13 | the positional root label is left unresolved, so no absolute path names where the skill was loaded from | yes (1 match) | the paired evidence unit |

**M12 is the one worth reading.** The live tolerance re-proof asserts that codex listed exactly one more skill inside the project than outside it. The first version of that assertion passed with the sidecar write operation removed entirely — because `result.sidecars` reports what the transaction was *handed*, not what reached disk, so the fixture's precondition was checking a report rather than a file. It caught the dangerous direction (a sidecar counted as a skill would make the difference two) but re-proved nothing about tolerance. The fixture now READS the sidecar's bytes out of the directory codex is about to scan and asserts they name `alpha-aos` and the pack; with M12 applied it goes red. That correction is commit `dea3b30`, and it is exactly the class of green-looking vacuity the previous seven waves kept finding.

## Issues Encountered

- **A hand-made fixture without a frontmatter `description` is invisible to the oracles.** The first end-to-end probe reported `nativeUse: unverified` with zero pack hits in the *positive*, which looks exactly like a sidecar breaking discovery. It was not: that scratch fixture's `SKILL.md` had only a `name:` in its frontmatter. Rebuilt with a description, both harnesses discovered it immediately. Worth knowing before anyone reads a `unverified` positive as a tolerance failure.
- **One full-suite run failed `a directory identity key carries the host's exact 64-bit index, never a rounded double` in `test/evidence.test.ts`, and it did not reproduce.** Six isolated runs and two further full runs after it are all green (677 tests / 671 pass / 0 fail / 6 skipped, twice). Nothing in this plan touches `identityKeys`, `lstat` or the evidence walk. It is the known Windows file-index precision item PROJECT.md already carries as Active and unowned by any phase; this plan's seven new temp-directory fixtures plausibly raise the churn that surfaces it. Recorded rather than swallowed, and logged to `.planning/WINDOWS.md`.
- **This shell mangles heredocs containing apostrophes.** 03-03 and 03-04 recorded the apostrophe and backslash halves of this; appending a large TypeScript block via `cat <<'EOF'` failed with `unexpected EOF while looking for matching`. Routed through the Write/Edit tools instead, as those summaries advise.
- **TypeScript reported TS7022 (circular inference) on a `const` shadowing a loop variable in a `find()` over an assertion-narrowed value.** Not a real cycle — an explicit `PackProvenance["targets"][number] | undefined` annotation resolved it.
- **`actuals.tokens` is on the diff instrument.** 12,375 is chars/4 over this plan's added lines (49,501 added characters across `src`, `schemas`, `catalog` and `test`), the same instrument 03-03, 03-09 and 03-10 named. The plan estimated 86,000, so this came in far under: most of the work reused mechanisms that already existed rather than adding modules — which is itself the recorded-not-derived decision paying off.

## Human checks

Two judgements a test cannot make, and one paid run that was deliberately not made:

1. **Does the pack-exercise prompt read as an ordinary request, and is the materialized skill genuinely the natural answer to it?** The declaration is `PACK_EXERCISE_FRONTEND_A11Y` in `catalog/canaries.yaml`: *"Our checkout form works fine with a mouse, but a customer told us they cannot get through it with the keyboard alone and that nothing useful is announced to them as they move between the fields. Go through the form and tell me what to fix."* It names no skill, no pack, no tool, and does not use the words "accessibility" or "a11y". The pack it should elicit supplies exactly one skill, whose own description is *"Use when a page or form has to be operable by keyboard alone and understandable to a screen reader."*
2. **Is the recorded negative convincing as an absence proof?** The control is a fresh `mkdtemp` directory that is not a repository. Its ancestry was walked to `C:\` — 12 entries — and every one checked against the roots each harness READS (`DISCOVERED_PROJECT_SKILL_ROOTS`, which is wider than what alpha-AOS writes). The home directory is the one exemption and it is written onto the entry that claims it (`~ holds .agents/skills, .codex/skills as the harness user root, loaded as user scope — exempt`), for the reason 03-04 recorded: every Windows temp path sits beneath it, and pi classifies what it loads from there as `scope: "user"` — the side of the line a control belongs on. pi additionally carries a second negative that does not depend on path ancestry at all.
3. **The claude leg costs money and was not run.** To spend deliberately, on a project where the pack is materialized:
   ```
   alpha-aos doctor --canary <project> --harness claude --capability PACK_EXERCISE_FRONTEND_A11Y --json
   ```
   Pin `ALPHA_AOS_STATE_DIR` first if the host ledger should not be written. A bare `claude -p` in a fixture measured **$0.135** in 03-RESEARCH.md, so this is not free.

## Deferred Issues

- **`doctor --discovery --json` renders `sweeps[].entries[].unit` as `[redacted:cycle]`.** The full evidence unit IS in the output under `entries[].discovery.unit` (verified over 4 units in this repository and 2 against a fixture — every one carrying its `completeness`, its negative, and that negative's non-empty checked-ancestor list); only the redundant alias degrades, because the observable serializer detects the repeated object reference. The sweep shape and that CLI branch are plan 03-08's, and nothing in this plan caused or worsened it, so it is recorded rather than fixed. Full entry in `deferred-items.md`.

## Known Stubs

None. Every export added here is implemented and exercised. `planPackSidecar` returning `null` is a DECISION, not a stub: the caller records the surface and its reason alongside, which is why a receipts-only surface renders a sentence rather than a blank.

## Threat Flags

None. This plan introduces one new write target — a file inside a directory alpha-AOS already owns whole — and it is covered by the register the plan declared: T-03-100 (a sidecar a harness misreads as a skill) is now proven live on this host rather than inherited; T-03-101 (modifying skill bytes) is excluded by construction and asserted; T-03-102 (a sidecar surviving a rolled-back apply) rides the single transaction and is asserted by failpoint; T-03-103 (a removal deleting a user-modified sidecar) is the drift refusal, asserted. No package was installed (T-03-SC).

## User Setup Required

None — no external service configuration required. The whole suite runs with no credential and no network; the two live oracles that do run are free by construction.

## Next Phase Readiness

- **CAPA-05 and CAPA-06 are claimed here.** `requirements.ready-ids` reports 2/2 ready: every plan in this phase declaring either has now finished, so the shared-ID gate opens.
- **What CAPA-05 does and does not now have.** Provenance is visible in the harness's own directory on two surfaces and honestly absent with a stated reason on the third; the pack is proven DISCOVERABLE inside the project and not outside it, live, on two harnesses. The INVOCATION half for a pack skill is deliberately not automated — see coverage entry D12 and *Human checks* item 3.
- **Carried forward unchanged:** CAPA-01/CAPA-02 remain deliberately not complete — the machinery is demonstrated and no paid canary has run. The precondition is MET, so the correct state is `unverified` / not-attempted, never `blocked`.
- **For plan 03-12:** anything asserting on `project status` output must pin `ALPHA_AOS_STATE_DIR` (wave 9's rule, still true — this plan's JSON test does). `materializedPackFixture` in `test/capability-oracle.test.ts` is reusable for anything that needs a project with a pack genuinely on disk. If a new harness gains a project-local skill root, it needs a `SIDECAR_SURFACES` entry or it silently gets the `unrecorded` fallback.
- **Nothing spent.** No paid run was made in this plan.
- **Baselines for the next plan:** `npm test` is 677 tests (671 pass, 0 fail, 6 pre-existing platform skips) and `npm run build` reports `75 inputs, 144 outputs`.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-11*

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 (tdd) | `5253344` | `18a086f` | — (none needed) | `RED_EVIDENCE_OK` — `node --test --test-reporter=tap dist/test/project-pack-sync.test.js`, exit 1, 14 tests / 8 pass / 6 fail; target test `applying a pack writes a provenance sidecar on every tolerance-proven surface, in the same transaction` failed on `the tolerance-proven surfaces did not each get exactly one sidecar` — an assertion for the planned behaviour, not a load error |
| 2 | — | `c20b414` | — | Not a TDD task (`type="auto"` without `tdd="true"`); its six tests were written with the implementation and each proven capable of failing by mutation (M6–M9) |
| 3 | — | `1dbf613`, `dea3b30` | — | Not a TDD task; proven by mutation (M10–M13), and `dea3b30` exists precisely because M12 exposed a vacuous assertion in `1dbf613` |

No gate violations. The RED commit carries the full type surface and an empty `SIDECAR_SURFACES` map so the suite compiles and the failure is an assertion rather than a compile refusal — the shape plan 03-04 used. One test in that RED run (`an interrupted sync leaves no sidecar behind`) passed vacuously under the stub, since a sidecar that is never written cannot survive a rollback; it was proven non-vacuous afterwards by mutation M3 instead.

## Self-Check: PASSED

- Every declared file exists on disk: `src/core/project-pack-sync.ts`, `src/core/project-plan.ts`, `src/format.ts`, `src/cli.ts`, `schemas/receipt.schema.json`, `schemas/canary-catalog.schema.json`, `catalog/canaries.yaml`, `test/project-pack-sync.test.ts`, `test/capability-oracle.test.ts`, `deferred-items.md`, and this summary.
- Commits `5253344`, `18a086f`, `c20b414`, `1dbf613` and `dea3b30` are all reachable from `git log`; `git rev-list --count 3fdc364..HEAD` is **5**, matching `actuals.commits`, measured from the persisted plan ledger rather than narrated.
- `npm run check` clean; `npm run build` 75 inputs / 144 outputs; `npm test` 677 tests / 671 pass / 0 fail / 6 skipped — above the 662-test carried-forward baseline and far above the 208-test Phase 1 baseline.
- Task acceptance re-run: `applyFileTransaction(` occurs exactly **1** time in non-comment `src/core/project-pack-sync.ts`; `existsSync` occurs **0** times in non-comment `test/capability-oracle.test.ts`; the receipt schema's `kind` enum and `PACK_RECEIPT_TARGET_KINDS` both read `["sidecar","skill"]`; `SIDECAR_SURFACES` has an entry for each of the three harnesses in `PROJECT_SKILL_ROOTS`, each with a reason that contains its own citation.
- Plan-level `<verification>` re-run: `npm test` reports `# fail 0` above baseline; a materialized skill's sha256 equals its locked source hash with a sidecar present; the CAPA-05/CAPA-06 unit is recorded, paired, COMPLETE for both free oracles, each negative carrying a non-empty checked-ancestor list.
- No tracked file was deleted by this plan (`git diff --diff-filter=D --name-only 3fdc364..HEAD` is empty).
- No host state was written: every end-to-end run pinned `ALPHA_AOS_STATE_DIR` to a scratch directory, and `catalog/stack.lock.json` and `catalog/packs/` are untouched (`git diff --stat` over them is empty).
