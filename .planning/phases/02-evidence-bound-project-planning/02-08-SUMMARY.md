---
phase: 02-evidence-bound-project-planning
plan: 08
subsystem: api
tags: [detc-04, plan-artifact, sha256-digest, determinism, target-pre-state, adapter-support, receipts, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-07's evaluate-all evaluator, pack classification, D-06 overrides recorded as evidence, and the redactDocument print() seam"
  - phase: 02-evidence-bound-project-planning
    provides: "02-04's pack-skill source pinning: all 19 declared pack skills carry a sourceSha256 in catalog/stack.lock.json alongside the package, version and integrity"
  - phase: 02-evidence-bound-project-planning
    provides: "02-06's complete evidence envelope, the ReadLedger input list, digestableEvidence, and the aggregate sourceHash"
  - phase: 02-evidence-bound-project-planning
    provides: "02-05's canonical root, projectId and named-never-guessed sub-project targeting"
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's tracer seam and digest construction rules: one literal, sorted arrays, no timestamp, no git ref"
  - phase: 01-safe-operation-boundary
    provides: "reviewedDigest / assertPlanUnchanged, the pre-state read shape, transaction snapshot semantics, and the redaction seam"
provides:
  - "ProjectCapabilityPlan carries one named field per DETC-04 noun: scope, owner, source, renderer, targetPreState, adapterSupport, approvals, safeInverse, and both digests"
  - "resolvePackSource: a pack-skill lock read path SEPARATE from the global ECC skill sync, refusing by name when a hash is missing"
  - "inspectTargetPreState + readReceiptClaims + PROJECT_RECEIPT_DIRECTORY: the .alpha-aos/receipts contract Phase 3 inherits"
  - "D-11 conflict handling: an unowned file at a target path drops its pack from the applicable set, with nothing overwritten, moved or renamed"
  - "classifyAdapterSupport: one SurfaceSupport per declared harness from recorded evidence only, failing closed to unverified"
  - "discoverPersonalSkillNames: a shadowing approval emitted only on an OBSERVED personal/project skill collision"
  - "digestablePlan: the whole reviewable view as ONE object literal in ONE place, with executable carried as an explicit null"
  - "A two-runs-byte-identical regression net over text and --json, plus a non-ASCII-root digest-stability fixture"
affects: [02-09, 02-10, phase-3-capability-materialization, phase-7-three-os-matrix]

actuals:
  tokens: 16679
  tasks: 3
  commits: 6
plan_head_before: 545223fb508e6993d13639e228f675a58e66d64f

tech-stack:
  added: []
  patterns:
    - "One named field per requirement noun, so coverage is verifiable by inspection rather than by argument"
    - "A deliberately empty slot is declared AND attributed (executable: null + executableDisposition.deferredTo), never omitted — the same discipline 02-02 used for deferredTo: GATE-01"
    - "The digestable view is built as one object literal in one place, so exclusion of createdAt and git context is by construction rather than by deleting fields"
    - "Fail-closed classification: an unknown harness is unverified, never supported — an over-claimed supported is the failure that costs a user their opt-out guarantee"
    - "Non-vacuous source gates: the encoding gate asserts it actually inspected the hash calls it guards, so it cannot pass against a file it failed to parse"

key-files:
  created: []
  modified:
    - src/core/project-plan.ts
    - src/core/evidence.ts
    - src/format.ts
    - src/types.ts
    - test/project-plan.test.ts

key-decisions:
  - "`adapterSupport` is a Record<HarnessId, SurfaceSupport> of plain strings, with the per-harness justification carried in a sibling `adapterSupportEvidence` array. A single field could not both hold the three-value vocabulary the requirement checks and state the basis; putting the reasons into `approvals` instead would have made `approvals` never-empty and broken the zero-selected-pack contract."
  - "`safeInverse` is an ARRAY with one entry per planned target, not a single value. DETC-04 asks for a guard carrying a path and an expected hash for every planned target, and a repository selecting two packs across three harness roots plans six targets."
  - "Target pre-state is enumerated for all three project-local skill roots (.claude/skills, .agents/skills, .pi/skills), not only for the harness classified `supported`. Reporting what is already at a path is a different question from whether we would write there, and narrowing the read would have hidden a conflict at an unverified harness's root."
  - "A conflicting target drops the pack but the pack STAYS in `selected` and keeps its full target pre-state. `selected` answers 'what did the evidence decide' and `applicable` answers 'what can be acted on'; collapsing them would have made a dropped pack indistinguishable from one the evidence never chose."
  - "Shadowing is detected against personal-scope skill roots declared locally in project-plan.ts rather than imported from the global ECC skill module, so a source gate can assert this module never reaches the global sync list at all."
  - "`readReceiptClaims` reports an unreadable receipt as a RECEIPT_UNREADABLE approval rather than skipping it. An unreadable receipt makes ownership undecidable, and silently reading that as 'not ours' is what would let planning overwrite a file alpha-AOS itself wrote."
  - "The evidence module's sha256 narrowed from `Uint8Array | string` to `string` with an explicit \"utf8\" encoding. Every caller already passed text, and narrowing let the encoding gate be a plain assertion over every `.update(...)` call rather than a special case."

patterns-established:
  - "Structural test reads (Object.hasOwn over a record) for fields that may legitimately be null or empty, so a RED run fails on the behaviour rather than on a missing type"
  - "A before/after listing-and-hash snapshot of the whole target tree as the proof that a read-only operation is read-only"
  - "Runtime export resolution in tests (planExport) for functions a plan is about to add, so the RED gate names the missing export instead of failing to compile"

requirements-completed: [DETC-04]

coverage:
  - id: D1
    description: "Every DETC-04 noun is a named field on the plan value — scope, owner, exact source version and hash, renderer, target pre-state, adapter support, approvals, safe inverse, and both digests — and a project selecting zero packs carries all of them with empty arrays rather than omitted keys"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#the plan carries every DETC-04 noun as a named field"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a project with zero selected packs still carries every DETC-04 field, with empty arrays rather than omitted keys"
        status: pass
      - kind: e2e
        ref: "node dist/src/cli.js project plan . --json (all eleven keys present as own properties)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Each selected pack's source names the locked package, version, integrity and skill hash read from catalog/stack.lock.json through a read path separate from the global ECC skill sync; a missing hash refuses by name"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#each selected pack's source names the locked package, version, integrity and skill hash"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a lock with no source hash for a selected pack's skill is a refusal naming that skill"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#pack source resolution never consults the global ECC skill list"
        status: pass
    human_judgment: false
  - id: D3
    description: "The renderer is declared as an identity render and every planned target expects the source hash unchanged, with a safe inverse carrying a path and an expected hash for every planned target"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#the renderer is declared as an identity render and every planned target expects the source hash unchanged"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#safeInverse names an operation and a guard carrying a path and an expected hash for every planned target"
        status: pass
    human_judgment: false
  - id: D4
    description: "DETC-05's executable noun is an own property whose value is exactly null with a stated disposition, and the same key is an own property of the digestable view that feeds planDigest"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#the executable slot is an own property whose value is null, and the digestable view carries it too"
        status: pass
    human_judgment: false
  - id: D5
    description: "A target path holding bytes with no matching receipt yields a conflict, drops the pack from the applicable set, and records one approval naming the path — with the target tree byte-identical before and after planning"
    requirement: DETC-04
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#an unowned file at a pack's target path drops the pack from the applicable set and records the conflict"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#planning a conflicting target renames, moves and overwrites nothing"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a receipt claiming the target file yields no conflict for that pack"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a target path that does not exist yields a pre-state with exists false and a null current hash"
        status: pass
    human_judgment: false
  - id: D6
    description: "adapterSupport reports one classification per declared harness in the project's own three-value vocabulary, no harness lacking documented project-scope discovery is reported supported, and no probe subprocess runs on the preview path"
    requirement: DETC-04
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#adapterSupport reports one classification per declared harness in the project's own three-value vocabulary"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#no harness lacking documented project-scope discovery is reported supported"
        status: pass
      - kind: e2e
        ref: "node --test dist/test/preview.test.js (11 tests, fail 0 — the preview tracer stays green, so no probe subprocess runs)"
        status: pass
    human_judgment: false
  - id: D7
    description: "A pack skill colliding with a personal-scope skill records a named shadowing approval, emitted only on an observed collision"
    requirement: DETC-04
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a pack skill colliding with a personal-scope skill records a named shadowing approval"
        status: pass
    human_judgment: false
  - id: D8
    description: "inputsDigest and evidenceDigest answer different questions: a byte change that alters no fact moves only inputsDigest, while a dependency that satisfies a declared fact moves both"
    requirement: DETC-04
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a byte change to a read file moves inputsDigest and leaves evidenceDigest unchanged"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a dependency that satisfies a declared fact moves both digests"
        status: pass
    human_judgment: false
  - id: D9
    description: "Repeated project plan over an unchanged repository produces byte-identical text AND byte-identical JSON; createdAt and the git context are excluded from every digest by construction; a non-ASCII canonical root digests identically across two runs on the host"
    requirement: DETC-04
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#two consecutive project plan runs over an unchanged fixture are byte-identical in text mode"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#two consecutive project plan runs over an unchanged fixture are byte-identical in --json mode"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#createdAt is excluded from every digest by construction and never reaches the plan output"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a canonical root whose name contains non-ASCII characters digests identically across two runs"
        status: pass
      - kind: e2e
        ref: "two `node dist/src/cli.js project plan .` runs compared byte-for-byte in text and --json mode against this repository"
        status: pass
    human_judgment: false
  - id: D10
    description: "The text rendering carries the same decision as the JSON: conflict lines, a bounded target pre-state table, the adapter-support table with its basis column, and the approval lines"
    requirement: DETC-04
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#the text rendering carries the target pre-state, adapter-support and approval rows"
        status: pass
    human_judgment: true
    rationale: "The assertions prove every row is present and correctly valued, but whether the widened rendering is readable at a terminal width — the BASIS column runs to ~160 characters — is a judgment no test makes."

# Metrics
duration: 28 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 08: The Reviewable DETC-04 Plan Artifact Summary

**`ProjectCapabilityPlan` now carries one named field per DETC-04 noun — scope, owner, locked source version and hash, identity renderer, per-harness target pre-state, three-value adapter support, approvals and a guarded safe inverse — with a D-11 conflict dropping its pack rather than overwriting anything, and a two-runs-byte-identical gate standing over the whole stability claim.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-09-07T18:47:04Z
- **Completed:** 2026-09-07T19:15:08Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Every noun DETC-04 enumerates is a field a reviewer can read by name, and the one noun this phase cannot answer — DETC-05's `executable` — is an explicit `null` with its owner named, carried into the digested view so the slot Phase 3 fills is already one the drift refusal watches.
- Pack source resolution got its own lock read path. The global ECC skill list is never consulted for a pack skill, asserted both behaviourally (a lock whose global `skills` array is emptied still resolves a pack skill) and by a source gate over the module's imports.
- D-11 holds mechanically: a target path holding bytes with no matching receipt drops its pack from the applicable set and records one approval naming the path, and a before/after listing-and-hash snapshot of the whole fixture tree proves nothing was renamed, moved or overwritten.
- Adapter support is reported at the confidence it actually has — `claude` supported on documented project-scope discovery, `codex`/`pi` unverified, `antigravity`/`hermes` unsupported on their recorded strategies — with an unclassified harness failing closed to `unverified` and no probe running on the preview path.
- The stability claim now has a standing net: two consecutive `project plan` runs over an unchanged repository are asserted byte-identical in text and in `--json` separately, `createdAt` exclusion is proven by construction rather than by inspection, and a non-ASCII canonical root digests identically across runs.

## Task Commits

Each task ran the full RED → GREEN cycle:

1. **Task 1 RED: the nine DETC-04 nouns as named fields** — `d90f01c` (test)
2. **Task 1 GREEN: the nine DETC-04 nouns as named fields** — `bdf8ed9` (feat)
3. **Task 2 RED: D-11 conflict and honest adapter support** — `4f49743` (test)
4. **Task 2 GREEN: D-11 conflict and honest adapter support** — `e7cd740` (feat)
5. **Task 3 RED: two digests and byte-identical output** — `1e55b90` (test)
6. **Task 3 GREEN: explicit hash encoding** — `b3b11a8` (feat)

No REFACTOR commit was made: each GREEN landed in the shape it should keep, and a
refactor commit with no change is not one this project makes.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 | `d90f01c` | `bdf8ed9` | — (no change) | `RED_EVIDENCE_OK` — 38 tests, 30 pass, 8 fail, target `the plan carries every DETC-04 noun as a named field` |
| 2 | `4f49743` | `e7cd740` | — (no change) | `RED_EVIDENCE_OK` — 46 tests, 43 pass, 3 fail, target `an unowned file at a pack's target path drops the pack from the applicable set and records the conflict` |
| 3 | `1e55b90` | `b3b11a8` | — (no change) | `RED_EVIDENCE_OK` — 53 tests, 52 pass, 1 fail, target `every hash of a string in the digest path passes an explicit utf8 encoding` |

Every RED commit preceded its implementation commit — unlike 02-07, no RED state had to
be reconstructed after the fact. Each RED run was captured with `--test-reporter=tap`,
because this project's default `node --test` reporter is not TAP and a default-reporter
capture misclassifies as `zero_tests_discovered`.

Task 3's RED had a single failing test because most of its behaviours were already true:
`inputsDigest`/`evidenceDigest` were separated in 02-01/02-06 and the digestable view was
already one literal. The genuinely new production change was the explicit hash encoding;
the other six assertions landed as the standing regression net the plan asked for, which
is their point rather than a shortfall.

## Files Created/Modified

- `src/types.ts` — `SurfaceSupport`, `PackSource`, `PlanRenderer`, `TargetPreState`, `PlanApproval`, `SafeInverse`, `PlanOwner`, `DeferredSlot`, `AdapterSupportEntry`; `ProjectCapabilityPlan` extended with eleven fields including `applicable` and `executable: null`
- `src/core/project-plan.ts` — `PROJECT_RECEIPT_DIRECTORY`, `PLAN_OWNER`, `PLAN_RENDERER_ID`, `PROJECT_SKILL_ROOTS`, `MAX_TARGET_ROWS`, `classifyAdapterSupport`, `resolvePackSource`, `readReceiptClaims`, `discoverPersonalSkillNames`, `inspectTargetPreState`, `buildSafeInverse`, `digestablePlan`, and the plan assembly that ties them together
- `src/format.ts` — conflict lines, the bounded target pre-state table, the adapter-support table with its basis column, and the approval lines
- `src/core/evidence.ts` — the input digest hashes text with an explicit `"utf8"` encoding
- `test/project-plan.test.ts` — 23 new tests (30 → 53), plus an environment override on `runCli`

## Decisions Made

See `key-decisions` in the frontmatter. The two most consequential:

**`selected` and `applicable` are different questions.** A pack dropped by a D-11 conflict
stays in `selected` with its full target pre-state and leaves `applicable`. Collapsing the
two would have made "the evidence chose this pack but something is already at its target"
indistinguishable from "the evidence never chose this pack" — which is the reporting
failure D-11 exists to prevent.

**`adapterSupport` holds only the three-value vocabulary; the basis lives beside it.**
The requirement checks that every value is one of `supported`/`unsupported`/`unverified`,
so the field cannot also carry prose. Folding the reasons into `approvals` was rejected
because it would have made `approvals` non-empty for every project, breaking the
zero-selected-pack contract that every array-valued noun is empty.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A sub-project plan's digest did not cover its own scope**

- **Found during:** Task 1 (wiring `digestablePlan` into the plan assembly)
- **Issue:** `planSubProject` computed the plan against the sub-project's absolute path — which digests `subProjectPath: null` — and then overrode `scope.subProjectPath` on the returned value while keeping the already-computed `planDigest`. Two different sub-projects of the same shape could therefore share a plan digest, and the digest did not cover a field a reviewer reads.
- **Fix:** the scoped plan is re-sealed through `sealPlan`, so `planDigest` is recomputed over the scope actually reported.
- **Files modified:** `src/core/project-plan.ts`
- **Verification:** `test/project-plan.test.ts#from a repository root with no --project, each sub-project reports its own decision and none is selected` still passes, and the whole 53-test file is green.
- **Committed in:** `bdf8ed9` (Task 1 GREEN)

**2. [Rule 2 - Missing Critical] An unreadable receipt was silently ownerless**

- **Found during:** Task 1 (`readReceiptClaims`)
- **Issue:** the straightforward implementation skips a receipt it cannot parse, which reads as "no receipt claims this path" — the same answer as "a foreign file sits here". For a receipt alpha-AOS itself wrote, that turns an undecidable ownership question into a silent conflict.
- **Fix:** an unreadable or malformed receipt is recorded as a `RECEIPT_UNREADABLE` approval naming the file, so ownership being undecidable is stated rather than inferred.
- **Files modified:** `src/core/project-plan.ts`
- **Verification:** covered structurally — a malformed receipt produces an approval rather than vanishing; the conflict path itself is asserted by D5's tests.
- **Committed in:** `bdf8ed9` (Task 1 GREEN)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** both are correctness fixes inside files the plan already owns. No scope creep.

## Issues Encountered

- The plan's Task 1 acceptance requires `Object.hasOwn(plan, executable)` to be asserted **directly**, which cannot be done through the compiled interface before the field exists. Tests read the plan structurally (`Record<string, unknown>`) and resolve new module exports by name at run time, so each RED run compiled and failed on the behaviour rather than on a type error. That is why `planExport` and `asRecord` exist in the test file.
- The initial source gate for "never consult the global ECC skill list" tripped on a doc comment that merely *named* the global sync plan function as the shape being mirrored. The comment was reworded rather than the gate loosened — a strict substring gate is worth more than one identifier in prose.

## Deferred and Not Proven

- **Cross-host Unicode path normalization is NOT proven by this plan.** The non-ASCII fixture proves digest stability across two runs **on the same host**. A macOS NFD path and a Linux NFC path naming the same file would produce different digests, and nothing here rules that out. That belongs to the Phase 7 three-OS matrix and must not be read as settled.
- **DETC-05's `executable` noun is deferred to Phase 3 as its owner**, recorded in the artifact itself as `executable: null` plus `executableDisposition: { deferredTo: "phase-3-capability-materialization", … }`. This is the same form plan 02-02 used for the eight security risk facts carrying `deferredTo: GATE-01`: a deliberately empty slot is declared and attributed, so it can never be mistaken for one nobody considered. Phase 3 — the first thing that spawns anything on a project path — fills it, and because the null is inside the digested view, a change to it already refuses an apply through the existing contract with no new mechanism.
- **`PROJECT_RECEIPT_DIRECTORY` is an accepted residual risk (T-02-30).** Phase 2 only reads receipts; Phase 3 writes them. The location is declared here and written into the plan artifact so Phase 3 cannot choose differently, but nothing in Phase 2 can enforce that. Flagged for Phase 3 confirmation.

## Known Stubs

None. No hardcoded empty value, placeholder string or unwired data path was introduced.

## User Setup Required

None — no external service configuration is required.

## Next Phase Readiness

- Ready for `02-09`: `ProjectCapabilityPlan` structurally satisfies the reviewed-plan boundary (`kind` + digest), so the DETC-05 drift refusal can reuse `assertPlanUnchanged` rather than growing a second mechanism. `planDigest` covers all seven DETC-05 nouns present in Phase 2, including the `executable` null.
- Ready for `02-10`: `applicable`, `targetPreState` and `receiptDirectory` are the inputs the status/stale reconciliation needs.
- Phase 3 inherits two contracts it must not redecide: the `.alpha-aos/receipts/<packId>.json` location and the `targetPreState` record shape.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*

## Self-Check: PASSED

All modified files exist on disk (`src/core/project-plan.ts`, `src/core/evidence.ts`,
`src/format.ts`, `src/types.ts`, `test/project-plan.test.ts`) and all six task commits
resolve in `git log`. `git rev-list --count 545223f..HEAD` reports 6, matching the
`commits: 6` recorded in the frontmatter.
