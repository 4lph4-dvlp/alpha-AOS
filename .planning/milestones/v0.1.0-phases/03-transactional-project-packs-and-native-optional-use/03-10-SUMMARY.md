---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 10
subsystem: testing
tags: [capa-08, pack-selection, evidence, fixtures, near-miss, deterministic, offline, skill-shape, pitfall-7, pitfall-2]

# Dependency graph
requires:
  - phase: 02-project-capability-planning
    provides: "evaluatePack, classifyPack, evaluateEvidenceNode, rankNearMisses, describeNearMiss, planProjectCapabilities and the declared catalog/facts vocabulary the fixtures are built against"
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "plan 03-01's transactional pack writer (planProjectPackSync / applyProjectPackSync, verifiedSourceRoot, receipts), and plan 03-04's per-harness DiscoveredSkill record carrying advertisedName and directoryName"
provides:
  - "test/helpers/pack-fixtures.ts — DOMAIN_FIXTURES, the six CAPA-08 domains as reviewable data: one representative pack each, its skills, the EXACT set it selects, and the recorded reason it was chosen over its siblings"
  - "createDomainFixture / createNearMissFixture — deterministic, offline, three-OS-portable synthetic repositories under a caller-owned temp root"
  - "describeFixture / nearMissSpec / nearMissDifference — the structural one-edit contract: a twin differs from its positive by exactly one file or one project-manifest key, computed from the two shapes rather than from the declared edit"
  - "twelve fixtures — six positives asserting an exact selected set, six twins asserting non-selection plus a reason that NAMES the removed leaf"
  - "GENERIC_INSTRUCTIONS_FIXTURE — the design §5.2 rule as a repository: an AGENTS.md alone activates no agent-runtime pack, carried by the declared `broad` flag rather than a per-pack special case"
  - "assertPackSourceShape + PACK_SOURCE_MULTI_FILE + PackSourceFinding in src/core/project-plan.ts — the 03-RESEARCH.md Pitfall 7 guard, a finding rather than a refusal, with the escalation recorded in its own detail"
  - "ProjectPackSyncPlan.sourceFindings and ProjectPackSyncResult.findings — the guard called from the plan path, before the digest, the boundary proof and every write, and rendered above the written-path list"
  - "the catalog binding for 03-RESEARCH.md Pitfall 2: the diverging skill is one RESEARCH_SCIENTIFIC declares, the lock keys its sourceSha256 on the DIRECTORY name and carries no key under the frontmatter name"
affects: [03-11, 03-12, phase-4-gates, capa-08-verification]

actuals:
  tokens: 17195
  tasks: 3
  commits: 5

plan_head_before: be6e2449531e51fea8df6774c30c06345eb8bc6c

tech-stack:
  added: []
  patterns:
    - "fixtures-as-data: a declarative table carrying the pack, the skills, the exact selected set, the one-edit twin recipe, the reason the twin's leaf must name, and the twin's expected status — so the mapping is reviewable and drift is a red test"
    - "structural twin diff: the one-edit property is computed from the positive's and the twin's SHAPES, never from the declared edit, so declared and materialized cannot drift apart"
    - "finding-not-refusal with the escalation recorded in the finding: the guard says why it is a finding today and what the right escalation is once the assumption breaks"

key-files:
  created:
    - test/helpers/pack-fixtures.ts
  modified:
    - src/core/project-plan.ts
    - src/core/project-pack-sync.ts
    - src/format.ts
    - test/project-plan.test.ts
    - test/pack-catalog.test.ts

key-decisions:
  - "The six domain-to-pack choices are recorded as data with a written reason each, not left implicit: WEB_BASE (web), DB_POSTGRES (API/data), CONTAINER (infrastructure), AI_EVAL (agent/AI), SECURITY_REVIEW (security), RESEARCH_SCIENTIFIC (scientific). Every one supplies at least one skill, so every fixture exercises a real materialization target."
  - "The twin's classification is NOT uniform across the six, and is recorded per domain rather than flattened. An `all`-shaped pack keeps a satisfied leaf and its twin is a genuine `near-miss`; an `any`-shaped pack over a single minimal leaf has nothing left and its twin is `silent`; SECURITY_REVIEW's twin is `unimplemented` because its eight change-risk leaves are deferred to GATE-01. Flattening the three would have hidden a real property of the evaluator behind a fixture convention."
  - "The universal per-twin contract is asserted at LEAF level — the removed leaf is reported as failed with a reason that names it, never the evaluator's non-empty fallback sentence — because that is the contract (DETC-03) that actually holds for all six. The near-miss RENDERING is additionally asserted only for the two twins that genuinely are near-misses."
  - "AI_EVAL rather than AGENT_RUNTIME represents the agent/AI domain, because it is the only one of the three AI packs whose predicate is `all` and whose twin is therefore a real near-miss. AGENT_RUNTIME's own rule is not skipped: it is proven directly by the generic-instructions test on a repository built for exactly that question."
  - "assertPackSourceShape returns a FINDING, never a refusal. 03-RESEARCH.md Pitfall 7 established the one-file rule is safe today by coincidence, so refusing would break a materialization that demonstrably loses nothing while silence would let the next ECC bump ship half a pack. The detail records that a refusal is the right escalation once a pack skill genuinely needs a second file."
  - "A pack that fires the source-shape finding is NOT dropped. It keeps its place in `packs` and keeps its targets, so the user is told both facts rather than losing an evidence-earned capability silently."
  - "The findings fold into the pack-sync reviewed digest. `sourceRoot` and `readHash` cover the SKILL.md bytes but say nothing about what sits beside them, so without this a companion file appearing between review and apply would move nothing a reviewer had agreed to."
  - "Pitfall 2 is RECORDED, not resolved: no canonicalizer, no directory rename, no frontmatter edit. Asserted in both directions — the lock keys on the directory name and carries no key under the frontmatter name, and the three harnesses' advertised names remain three distinct values."

patterns-established:
  - "Pattern 1: every positive fixture asserts the EXACT selected set, never membership — a fixture that quietly starts qualifying a second pack is no longer minimal evidence for the first"
  - "Pattern 2: the fixture table records the expected twin STATUS per domain, so a catalog change that moves a twin from near-miss to silent is a red test rather than an invisible drift"
  - "Pattern 3: a plan-time guard is proven loud by asserting the finding exists while every target is still absent from disk"

requirements-completed: [CAPA-08]

coverage:
  - id: D1
    description: "Each of the six CAPA-08 domains — web, API/data, infrastructure, agent/AI, security, scientific — receives its domain's pack from positive repository evidence, with no broad language or framework profile installed globally, asserted as an EXACT selected set"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 web: a vue project with a browser entrypoint selects exactly WEB_BASE"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 API/data: a declared postgres driver selects exactly DB_POSTGRES"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 infrastructure: a lone Dockerfile selects exactly CONTAINER"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 agent/AI: a model SDK plus eval assets selects exactly AI_EVAL"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 security: SECURITY_REVIEW selects from the manifest opt-in, not from a file heuristic"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 scientific: RESEARCH_SCIENTIFIC selects from the manifest opt-in, not from a file heuristic"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each of the six domains has a near-miss twin cut from the same scaffold that does NOT select the pack, and the reported reason names which evidence leaf was unsatisfied"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 web twin: removing the browser entrypoint drops WEB_BASE and names the leaf"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 API/data twin: removing the postgres driver drops DB_POSTGRES and names the leaf"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 infrastructure twin: removing the Dockerfile drops CONTAINER and names the leaf"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 agent/AI twin: removing the eval assets drops AI_EVAL and names the leaf"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 security twin: removing the manifest opt-in drops SECURITY_REVIEW and names the key"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#CAPA-08 scientific twin: removing the manifest opt-in drops RESEARCH_SCIENTIFIC and names the key"
        status: pass
    human_judgment: false
  - id: D3
    description: "A generic agent-instructions file alone never selects an agent-runtime pack, and the reason names the evidence that was actually required"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a repository holding only a generic agent-instructions file activates no agent-runtime pack"
        status: pass
    human_judgment: false
  - id: D4
    description: "Two synthetic fixture repositories evaluated in the same process against one package root do not share cached catalog or evidence state — each selects only the packs its own evidence supports (CAPA-08 concurrency edge)"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#two synthetic fixtures evaluated in one process do not borrow each other's selection"
        status: pass
    human_judgment: false
  - id: D5
    description: "A twin differs from its positive by exactly one file or one manifest key, asserted structurally against the materialized tree so a twin cannot drift into a different test"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#every near-miss twin differs from its positive by exactly one file or one manifest key"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the described shape of a twin matches what it actually writes to disk"
        status: pass
    human_judgment: false
  - id: D6
    description: "A near-miss reason is reported for a pack that came close and withheld from one nothing touched, so the two absences stay distinguishable"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a near-miss reason is reported for a pack that came close and withheld from one nothing touched"
        status: pass
    human_judgment: false
  - id: D7
    description: "A pack whose source skill directory holds more than one file is loud at PLAN time — a named finding carrying a stable code, the pack, the skill and the extra entries, produced before any byte is written — and the pack is still listed in the plan"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a pack skill source directory holding exactly one file passes the shape guard"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a two-file pack skill source is loud at plan time, naming the pack, the skill and the extra entry"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a pack whose source shape fires the finding is still listed in the plan, with the finding attached"
        status: pass
    human_judgment: false
  - id: D8
    description: "No code path renames a pack skill source directory or rewrites skill frontmatter: the materialized file hashes to the locked source hash and every target path segment is the catalog-declared skill id verbatim"
    requirement: CAPA-08
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a materialized pack skill hashes to the locked source hash, and no code path rewrites the bytes"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#no shipped module renames a pack skill source directory or edits its frontmatter"
        status: pass
      - kind: other
        ref: "git diff --stat -- catalog/stack.lock.json catalog/packs/ (empty)"
        status: pass
    human_judgment: false
  - id: D9
    description: "The scientific pack's diverging skill is recorded under BOTH names per harness and neither is resolved: the lock keys sourceSha256 on the DIRECTORY name and carries no key under the frontmatter name, and codex/pi/claude remain three distinct advertised values"
    requirement: CAPA-08
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#the diverging skill is declared by the scientific pack and keyed in the lock by its DIRECTORY name"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#a scientific-pack skill's advertised and directory names differ, and the pair differs per harness"
        status: pass
    human_judgment: false
  - id: D10
    description: "The twelve fixtures are deterministic, offline and portable to the three-OS CI matrix — proven on Windows only in this run; the macOS and Linux legs are the CI matrix's to report"
    requirement: CAPA-08
    verification:
      - kind: other
        ref: "npm test — 662 tests, 656 pass, 0 fail, 6 skipped, no harness invoked and no network reached (win32, node 24)"
        status: pass
    human_judgment: true
    rationale: "Portability across the three-OS matrix is a claim about macOS and Linux runners that this run cannot make. The fixtures use only POSIX-relative paths, node:fs and node:os temp roots and assert no platform-specific string, but the other two legs are observed by CI, not here."

# Metrics
duration: 66 min
completed: 2026-09-11
status: complete
---

# Phase 03 Plan 10: The Six CAPA-08 Domains, Deterministic and Offline Summary

**Twelve synthetic fixtures — six positives asserting an EXACT selected set and six twins each cut by exactly one file or manifest key — plus `assertPackSourceShape`, a plan-time finding that makes a pack which stops being one file loud before a byte is written.**

## Performance

- **Duration:** 66 min
- **Started:** 2026-09-11T04:19Z (local 2026-09-11T13:19+09:00 equivalent; base commit `be6e244` at 2026-09-11T04:18:32+09:00)
- **Completed:** 2026-09-11T05:25:00+09:00
- **Tasks:** 3
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- **All six CAPA-08 domains select their pack from minimal positive evidence, with nothing installed globally.** `DOMAIN_FIXTURES` is a reviewable table, not a comment: per domain it records the chosen pack, the skills it supplies, the exact selected set, the one-edit twin recipe, the evidence the twin's reason must name, and the twin's expected status. Every positive asserts the exact set — a fixture that quietly starts qualifying a second pack is a red test.
- **Every domain has a twin cut from the same scaffold by exactly one edit, and every twin's reason names the leaf that went missing.** The one-edit property is computed from the two SHAPES rather than from the declared edit, then cross-checked against what the twin actually writes to disk, so the table and the repository cannot drift apart.
- **A generic agent-instructions file alone activates nothing**, and the test asserts the rule is carried by the declared `broad` flag rather than by a per-pack special case — so the general form of the rule stays under test, not this one pack's spelling of it.
- **Two fixtures evaluated in one process against one package root do not borrow each other's selection.** Both qualify through a manifest opt-in and opt in to *different* keys, which is the sharpest available probe of the root-keyed caches: a cache carrying a project fact rather than a package-root fact would let one fixture select the other's pack.
- **`assertPackSourceShape` makes 03-RESEARCH.md Pitfall 7 an asserted property.** It runs on the plan path, against the same verified source root the writer reads from, before the digest, the boundary proof and every write. It is a FINDING, not a refusal, and the finding's own detail records why — and what the right escalation is once the assumption breaks. The pack keeps its place in the plan; the user is told both facts.
- **Pitfall 2 is recorded rather than resolved, and the record is now bound to the catalog.** The diverging skill is one `RESEARCH_SCIENTIFIC` declares; the lock keys its `sourceSha256` on the DIRECTORY name and carries no key under the frontmatter name; codex, pi and claude remain three distinct advertised values. A byte comparison against the locked hash is the runtime backstop and a static scan of the shipped modules is the second.

## Task Commits

1. **Task 1: The six-domain fixture scaffold and its positive cases** — `bd67dc8` (test)
2. **Task 2: Six near-miss twins and the generic-instructions rule** — `6eb7086` (test, RED) → `46937e8` (feat, GREEN)
3. **Task 3: The one-file-per-pack-skill guard and the per-harness name record** — `05eab74` (test, RED) → `ebf28be` (feat, GREEN)

No REFACTOR commit: neither GREEN step left anything to restructure.

## Files Created/Modified

- `test/helpers/pack-fixtures.ts` (new, 438 lines) — the six-domain fixture table, `createDomainFixture`, `createNearMissFixture`, `createGenericInstructionsFixture`, `describeFixture`, `nearMissSpec`, `nearMissDifference`, `removeFixture`
- `src/core/project-plan.ts` — `PACK_SKILL_FILE`, `PACK_SOURCE_MULTI_FILE`, `PackSourceFinding`, `assertPackSourceShape`
- `src/core/project-pack-sync.ts` — the plan-path call site, `ProjectPackSyncPlan.sourceFindings`, `ProjectPackSyncResult.findings`, findings folded into the reviewed digest
- `src/format.ts` — findings printed above the written-path list in `formatProjectPackSync`
- `test/project-plan.test.ts` — 22 new tests (six positives, six twins, the generic-instructions rule, the distinguishable-absences rule, the two structural twin tests, the domain-table invariant, the concurrency test, and five source-shape tests)
- `test/pack-catalog.test.ts` — two new tests binding the scientific pack to the recorded per-harness name divergence

## Decisions Made

See `key-decisions` in the frontmatter. The two most consequential:

**The twin's status is not uniform, and pretending it was would have been the lie.** The plan's wording ("near-miss twin") implies every twin classifies as `near-miss`. Against the declared catalog it does not: only `WEB_BASE` and `AI_EVAL` are `all`-shaped and keep a satisfied leaf when one is removed. The four `any`-shaped and manifest-opt-in twins go `silent` or `unimplemented`, which is the evaluator correctly declining to claim a repository "came close" when nothing of that pack's evidence remains. Rather than pick fixtures that hid this, the expected status is recorded per domain and the universal contract is asserted one level down, at the failed leaf — where DETC-03's guarantee actually lives and holds for all six.

**The source-shape guard is a finding with its own escalation written into it.** Refusing today would break a materialization that demonstrably loses nothing (the one multi-file skill's own text never references its companion). Staying silent would let the next runtime bump ship half a pack. The finding's detail states both facts, so the next reader does not have to rediscover Pitfall 7 to judge whether to escalate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan path the guard must be called from lives outside the plan's declared `files_modified`**

- **Found during:** Task 3
- **Issue:** Task 3's acceptance requires `assertPackSourceShape` to be "called from the plan path, before any write". The plan's `files_modified` names only `src/core/project-plan.ts` for source. But the pack skill *source directory* is not known anywhere in `project-plan.ts` — it is resolved inside `planProjectPackSync` in `src/core/project-pack-sync.ts`, which is the only place that holds `sourceRoot` and is also the last read before `applyFileTransaction`. Calling the guard anywhere else would have asserted the shape of a directory other than the one the writer reads from, which is exactly what the plan's own `key_links` entry (`verifiedSourceRoot`) forbids.
- **Fix:** `assertPackSourceShape` is defined and exported from `src/core/project-plan.ts` as the plan specifies, and is *called* from `planProjectPackSync`. `ProjectPackSyncPlan` gained `sourceFindings` and `ProjectPackSyncResult` gained `findings`; `src/format.ts` prints them above the written-path list so the finding actually reaches a reviewer rather than sitting in a value nothing renders.
- **Files modified:** `src/core/project-pack-sync.ts`, `src/format.ts`
- **Verification:** `dist/test/project-plan.test.js` + `dist/test/project-pack-sync.test.js` + `dist/test/pack-catalog.test.js` — 232 pass / 0 fail. Mutation B (the plan path stops calling the guard) turns two named tests red.
- **Committed in:** `ebf28be` (Task 3 GREEN)

**2. [Rule 3 - Blocking] The findings are folded into the pack-sync reviewed digest**

- **Found during:** Task 3
- **Issue:** The reviewed digest already covers `sourceRoot` and the SKILL.md `readHash`, but nothing about what sits *beside* the skill file. A companion appearing between review and apply would therefore move nothing a reviewer had agreed to — the shape a reviewer was shown and the shape that gets materialized could differ with no refusal.
- **Fix:** `sourceFindings` (code, pack, skill, extra entries) is an input to `reviewedDigest`. This is consistent with the pack-sync digest already being host-bound (it carries absolute `sourceRoot` and `stateRoot`), and is deliberately NOT done to the capability `planDigest`, which must stay host-free (T-03-83).
- **Files modified:** `src/core/project-pack-sync.ts`
- **Verification:** full suite green; `assertPlanUnchanged` between plan and apply now covers the source shape.
- **Committed in:** `ebf28be` (Task 3 GREEN)

**3. [Process] Task 2's helper surface landed in Task 1's commit, so its RED could not be driven by it**

- **Found during:** Task 2
- **Issue:** `createNearMissFixture`, `nearMissSpec`, `describeFixture`, `createGenericInstructionsFixture` and `GENERIC_INSTRUCTIONS_FIXTURE` were written into `test/helpers/pack-fixtures.ts` during Task 1 and committed in `bd67dc8`, before Task 2's tests existed. Task 2's action says to write the nine behaviours as failing tests *first, then build `createNearMissFixture`* — so for that function specifically, a genuine RED was no longer available.
- **Fix:** Not reverted (the surface is correct and used). Instead, Task 2's RED was made genuine on the part that did NOT yet exist: `nearMissDifference` — the structural positive-vs-twin comparison the action calls for ("compare the two materialized file sets and require the difference to be one file or one manifest key") — plus the per-domain `nearMissReasonNames` field. The RED is recorded verbatim in `6eb7086`: two `TS2305`/`TS2339` refusals from the type gate, before any test executed.
- **Files modified:** none (process note)
- **Verification:** see "Mutation evidence" below — every one of Task 2's nine behaviours was independently shown to go red under a targeted implementation mutation, which is the substantive form of the evidence a RED provides.
- **Committed in:** n/a

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking) + 1 recorded process deviation.
**Impact on plan:** Both auto-fixes were required for the plan's own acceptance criteria to be satisfiable at all ("called from the plan path", against "the same verified source root the writer reads from"). No scope creep: no new dependency, no catalog edit, no lock edit — `git diff --stat -- catalog/stack.lock.json catalog/packs/` is empty.

## Mutation evidence (six earlier waves in this phase found vacuous assertions)

Every claim below was verified by mutating the implementation, confirming the mutation string actually applied, watching the named tests go red, and reverting. The applied-check matters: 03-09 recorded a mutation that silently failed to match and produced a false negative, so each mutation here asserts its own match count before writing.

| # | Mutation | Applied? | Tests turned red |
|---|---|---|---|
| 1 | `leafForFile`: every declared literal reports present | yes (1 match) | all six positive domain tests + the concurrency test (12 total in file) |
| 2 | `classifyPack`: the `broad` rule disabled | yes (1 match) | the generic-instructions test + 3 pre-existing broad-rule tests |
| 3 | `classifyPack`: `near-miss` collapsed into `silent` | yes (1 match) | the web twin, the agent/AI twin, the generic-instructions test, the distinguishable-absences test |
| 4 | `leafForFact`: the detector reason replaced by the silent fallback | yes (1 match) | the web, API/data and agent/AI twins (the three declared-fact leaves) |
| 5 | `leafForFile` + `leafForManifestOptIn`: reasons replaced by the silent fallback | yes (2 matches) | the infrastructure, security and scientific twins (the other three) |
| 6 | `nearMissSpec`: the twin also drops `README.md` | yes (1 match) | the one-edit structural test, and only it |
| 7 | `assertPackSourceShape`: the guard never fires | yes (1 match) | the two-file finding test + the still-listed test |
| 8 | `planProjectPackSync`: the plan path stops calling the guard | yes (1 match) | the two-file finding test + the still-listed test |
| 9 | `applyProjectPackSync`: the materialized bytes are rewritten | yes (1 match) | the locked-hash byte test + 4 pre-existing pack-sync tests |
| 10 | `parsePiCommands`: a canonicalizer forces the advertised name to the directory name | yes (1 match) | the per-harness name-divergence test, and only it |

Mutations 4 and 5 together cover all six twins; neither alone does, because the six twins' reasons come from three different leaf constructors. Working tree confirmed identical to `HEAD` after every revert.

## Issues Encountered

- **`planProjectCapabilities` reads the developer's home on the plan path.** When a plan selects a pack that declares skills, it calls `discoverPersonalSkillNames()`, which enumerates the personal-scope skill roots under `homedir()`. This is pre-existing (Phase 2) and deliberate — a personal skill overrides a project one, so a collision means the pack would not be the skill that loads — and its output lands in `hostNotes`, which is deliberately excluded from `planDigest` for exactly this reason (02-REVIEW WR-01). It is recorded here because the plan's acceptance says "no fixture reads outside its temp root", and strictly that is a claim about the *fixture*, not about the whole planner: none of the twelve fixtures writes outside its temp root, no assertion in this plan depends on `hostNotes`, and every leaf path asserted is checked to be relative and free of `..`. Nothing was changed; the honest statement is that the fixtures are root-bounded and the planner has one home read that no assertion here rests on.
- **`ALPHA_AOS_STATE_DIR` (carried forward from wave 9)** — no assertion in this plan reads `project status` or the capability ledger, so no host state directory is consulted. The three pack-sync tests supply their own `stateRoot` under a temp root explicitly.
- **`npm test` runtime grew from 178s (baseline) to 215s** with 25 added tests. Each of the three source-shape tests copies `catalog/` and `schemas/` into a temp package root, which is the existing `project-pack-sync.test.ts` pattern and the reason the suite stays offline.

## User Setup Required

None — no external service configuration required. The whole suite runs with no harness installed and no network.

## Next Phase Readiness

- **CAPA-08's evidence half is complete and deterministic.** Twelve fixtures, offline, no harness, no network, no host state.
- **The invocation half is deliberately NOT covered here**, per 03-CONTEXT.md D-15: invocation proof is scoped to one representative pack through the pass-bar canary (D-09), and the other five domains carry deployment and discovery evidence only. That is the recorded scope, not a gap.
- **Carried forward unchanged from wave 8:** CAPA-01/CAPA-02 remain deliberately not complete — the machinery is demonstrated, no paid canary has run. The precondition is MET, so the correct state is `unverified` / not-attempted, never `blocked`.
- **For plans 03-11 and 03-12:** `DOMAIN_FIXTURES` and `createDomainFixture` are reusable. Anything asserting on `project status` output must pin `ALPHA_AOS_STATE_DIR`; the fixtures here do not exercise that surface.
- **Nothing spent.** No paid run was made. If a future plan needs live per-domain invocation proof, it costs real money and must be recorded as a human check with the exact command, as 03-06 and 03-08 did.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-11*

## Self-Check: PASSED

All 7 declared files exist on disk. All 5 task commits (`bd67dc8`, `6eb7086`, `46937e8`, `05eab74`, `ebf28be`) exist in git history. `git rev-list --count be6e244..HEAD` = 5, matching `actuals.commits`. `git diff --stat -- catalog/stack.lock.json catalog/packs/` is empty.

## Known Stubs

None. No hardcoded empty value, placeholder string, TODO, FIXME or unwired component was introduced. `assertPackSourceShape` returning `null` for a source directory that does not exist is a documented branch, not a stub: on the fixture route the tree is produced after planning, and the writer's own `source-drift` refusal already covers a source that never appears.
