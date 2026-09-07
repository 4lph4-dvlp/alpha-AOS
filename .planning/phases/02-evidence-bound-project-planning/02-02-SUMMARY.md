---
phase: 02-evidence-bound-project-planning
plan: 02
subsystem: api
tags: [pack-catalog, fact-vocabulary, json-schema, ajv, yaml, closed-world, domain-invariants]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: validateManagedDocument closed-world validation, the ManagedDocumentKind registry, ValidationIssue's shape-only reporting contract, and ManagedDocumentError
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's pack-catalog document kind, loadPackCatalogStrict seam, PackCatalog/PackDeclaration types and schemas/pack-catalog.schema.json"
provides:
  - "schemas/fact-vocabulary.schema.json and the fact-vocabulary ManagedDocumentKind"
  - "catalog/facts.yaml — 31 declared facts covering every fact id the seven pack files name"
  - "A full-fidelity schemas/pack-catalog.schema.json: five operators plus nested all/any items bounded at four explicit $defs levels"
  - "loadPackCatalogStrict merging all seven catalog/packs/*.yaml into one catalog of 15 packs sorted by id"
  - "loadFactVocabularyStrict (src/core/pack-catalog.ts)"
  - "packCatalogInvariants: domain.duplicate-pack-id, domain.duplicate-fact-id, domain.undeclared-fact, domain.unknown-detector-kind"
  - "DetectorKind, FactDeclaration, FactVocabulary and EvidenceNode in src/types.ts"
affects: [02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-3-capability-materialization, phase-4-gate-01]

actuals:
  tokens: 19821
  tasks: 3
  commits: 6
plan_head_before: 25e287ab72339aa874d4698c2c99c265ba71aa2e

tech-stack:
  added: []
  patterns:
    - "Declared vocabulary split: detector KINDS are code, detector INSTANCES are data, so adding a fact is a YAML edit"
    - "Recursion bounded by explicit numbered $defs levels rather than a self-referencing $ref cycle"
    - "Post-merge domain invariant pass, run over the merged multi-file value rather than as a per-file domain callback"
    - "An unimplementable declaration refuses at LOAD rather than evaluating to a false leaf"

key-files:
  created:
    - schemas/fact-vocabulary.schema.json
    - catalog/facts.yaml
    - test/pack-catalog.test.ts
  modified:
    - schemas/pack-catalog.schema.json
    - src/core/pack-catalog.ts
    - src/core/validation.ts
    - src/types.ts

key-decisions:
  - "The eight SECURITY_REVIEW risk facts are declared with deferredTo: GATE-01 and kind fileContent but no detector parameters — declaring them keeps the near-miss line honest instead of silent, and Phase 4 already owns deterministic risk evidence"
  - "factVocabularyInvariants is one function called from two places (the vocabulary's domain callback and the post-merge pass) rather than two mechanisms, so a vocabulary reaching the pass from any source is held to the same rule"
  - "The merged catalog is sorted in codepoint order, not localeCompare order, because the value must be byte-stable on every host"
  - "domain.unknown-detector-kind is kept in code even though the schema enum already closes that door, because packCatalogInvariants accepts a vocabulary from any source"
  - "existing-source was deliberately NOT marked broad: true — BROWNFIELD_INIT's all has exactly two leaves, and marking both broad would make the pack unselectable once the broad rule is enforced"

patterns-established:
  - "Fact vocabulary: every fact a pack may name is declared in catalog/facts.yaml with one of six bounded kinds; a pack naming an undeclared fact refuses at load"
  - "Bounded recursion in a JSON Schema: numbered levels 1..N whose deepest level accepts only leaves, never a $ref cycle"
  - "Content-match vocabularies live in a repository-owned reviewed file and are never read from the scanned project"
  - "A cross-file invariant runs after the merge and constructs the ValidationResult shape ManagedDocumentError expects"

requirements-completed: []

coverage:
  - id: D1
    description: "All seven catalog/packs/*.yaml files load through validateManagedDocument into one merged, validated catalog of 15 pack declarations, sorted by id"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#all seven pack files merge into one catalog of fifteen packs"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#the real repository catalog satisfies every invariant"
        status: pass
    human_judgment: false
  - id: D2
    description: "A pack id declared twice across two pack files, and a fact id declared twice in catalog/facts.yaml, are each refused at load with a distinct stable domain.* code rather than resolving last-wins"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#two pack files declaring the same pack id are refused"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#a vocabulary declaring one fact id twice is refused"
        status: pass
    human_judgment: false
  - id: D3
    description: "A pack whose predicate references a fact id absent from catalog/facts.yaml is refused at load with a stable code naming the offending fact — it is never silently unselectable — while anyFiles / anyDependencies literals and manifestOptIn keys stay exempt"
    requirement: DETC-03
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#a predicate naming a fact the vocabulary does not declare is refused"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#inline literals are not fact ids and are never refused as undeclared"
        status: pass
    human_judgment: false
  - id: D4
    description: "lifecycle: one-shot-remove-after-output on BROWNFIELD_INIT and selectionPolicy: prefer-native-single-engine on SECURITY_REVIEW load and round-trip without validation error, and neither field changes any Phase 2 behaviour"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#lifecycle and selectionPolicy survive the merge unchanged"
        status: pass
      - kind: integration
        ref: "git diff --stat -- catalog/packs/ (empty — no declaration file was rewritten)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Adding a pack declaration or a fact declaration requires editing only YAML under catalog/ — no TypeScript edit and no rebuild of the predicate engine"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#an any item may be a nested evidence node (a pack that exists in no source file loads from YAML alone)"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#inline literals are not fact ids and are never refused as undeclared (three new packs, YAML only)"
        status: pass
      - kind: unit
        ref: "test/pack-catalog.test.ts#the declared vocabulary contains every fact id named by the pack catalog"
        status: pass
    human_judgment: false
  - id: D6
    description: "Evidence nesting is bounded at four explicit $defs levels with no self-referencing $ref cycle, so a hostile document cannot set validation cost (T-02-12)"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#evidence nesting is accepted to four levels and refused beyond"
        status: pass
      - kind: integration
        ref: "grep -o '\"$ref\": \"#/$defs/evidenceNode[0-9]\"' schemas/pack-catalog.schema.json — each level references only the next, strictly descending"
        status: pass
    human_judgment: false
  - id: D7
    description: "A refusal names what is wrong without echoing a value: every issue reports string(length=N) only, because a scanned document may carry a secret (T-02-13)"
    verification:
      - kind: unit
        ref: "test/pack-catalog.test.ts#a refusal reports the offending id's shape and never its value"
        status: pass
    human_judgment: false
  - id: D8
    description: "Every fileContent match pattern is declared in catalog/facts.yaml — a repository-owned reviewed file — and is never taken from the scanned project (T-02-05)"
    verification:
      - kind: integration
        ref: "grep -rn 'patterns' src/ returns exactly one hit, the FactDeclaration type declaration; no code applies a pattern"
        status: pass
    human_judgment: true
    rationale: "The declared deploy-workflow / release-workflow / postgres-dsn / redis-dsn pattern sets are a judgement about false-positive risk, not a testable property. No fileContent detector exists yet (02-06 owns it), so their real-world precision is unmeasured; a human should review the pattern list before that detector ships."

# Metrics
duration: 18 min
completed: 2026-09-07
status: complete
---

# Phase 2 Plan 02: Declared Fact Vocabulary and the Merged Pack Catalog Summary

**All 15 declared packs now load as one validated value from seven YAML files against a 31-fact declared vocabulary, and a duplicate id, an undeclared fact, or an unregistered field refuses at load with a stable code that reports a length rather than a value.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-09-07T13:43:34Z
- **Completed:** 2026-09-07T14:01:55Z
- **Tasks:** 3
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments

- **D-05 is now true for facts as well as packs.** `catalog/facts.yaml` declares every one of the 31 fact ids the seven pack files name, each against one of six bounded detector kinds. Adding a fact is a YAML edit; only the kinds are code. Without this split D-05 was half true — a pack could be added in YAML and would silently never match.
- **A pack that can never select is now impossible to ship silently.** `domain.undeclared-fact` refuses at load rather than treating an unknown leaf as false. That is the Phase 1 D-01 fail-closed rule applied to the catalog, and it closes the exact failure DETC-03 exists to prevent: a pack that never matches being indistinguishable from a repository whose evidence is genuinely absent.
- **The tracer's one-file loader became the real seven-file merge without any declaration file being edited.** `git diff --stat -- catalog/packs/` is empty. The schema was written to fit the declarations, not the other way round — including the one extension `SECURITY_REVIEW` genuinely needs (a nested node inside `any`), which the one-operator-per-pack shape could not express.
- **Recursion is bounded by the schema, not by the document.** `evidenceNode1..4` are four explicit levels whose deepest accepts fact-id strings only. There is no `$ref` cycle, so a hostile document cannot make validation cost unbounded (T-02-12).
- **Refusals stay honest about what they will not say.** Every domain issue carries `string(length=N)`; the offending id never enters an issue, `documentPath`, or `expected`. One test asserts that by serializing the whole issue list and checking the id does not appear in it.

## Task Commits

Each task ran the full RED → GREEN cycle:

1. **Task 1: The declared fact vocabulary** — `8127826` (test, RED) → `69170ef` (feat, GREEN)
2. **Task 2: Full-fidelity pack schema and the seven-file merging loader** — `90b9e59` (test, RED) → `72a7e38` (feat, GREEN)
3. **Task 3: Domain invariants — duplicate ids and undeclared facts refuse at load** — `7ade3d7` (test, RED) → `8c582b4` (feat, GREEN)

No REFACTOR commit: no cleanup was warranted after any GREEN.

**Plan metadata:** the `docs(02-02): complete declared fact vocabulary and merged pack catalog plan` commit carrying this file. `commits: 6` is `git rev-list --count 25e287a..HEAD` measured before that commit, using the same instrument `/gsd-verify-work` will.

## Files Created/Modified

- `schemas/fact-vocabulary.schema.json` — closed contract for `catalog/facts.yaml`. `additionalProperties: false` at both the document and the per-fact level, `kind` an enum of exactly the six detectors, per-kind parameters (`packages`, `files`, `directories`, `manifestKey`, `patterns`) plus cross-kind `broad` / `description` / `deferredTo`, and an `x-*` `patternProperties` escape.
- `catalog/facts.yaml` — 31 declared facts. `broad: true` on `browser-entrypoint` and `agent-runtime-config`; the eight SECURITY_REVIEW risk facts carry `deferredTo: GATE-01`; every content-match pattern is anchored or literal with no nested quantifier.
- `schemas/pack-catalog.schema.json` — widened from the tracer's fact-id-strings-only shape to the full operator set with bounded nesting.
- `src/core/pack-catalog.ts` — `PACK_FILES` (explicit sorted literal list, not a glob), the merge and codepoint sort, `loadFactVocabularyStrict`, `factVocabularyInvariants`, `collectFactLeaves`, `orderIssues` / `invariantResult`, and `packCatalogInvariants`.
- `src/core/validation.ts` — `"fact-vocabulary"` added to `ManagedDocumentKind`, `OWNED_SUBTREE` (`null`) and `CORE_SCHEMAS`. All three are `Record<ManagedDocumentKind, …>`, so `tsc` enumerated the omissions.
- `src/types.ts` — `EvidenceNode` (replacing `PackEvidenceNode`, which had no other reference), `DetectorKind`, `FactDeclaration`, `FactVocabulary`.
- `test/pack-catalog.test.ts` — 14 cases across the three tasks, using a `catalogFixture` helper that copies the real `schemas/` directory so a fixture is judged by the contracts the repository actually ships.

## Decisions Made

1. **The eight risk facts are declared with `deferredTo: GATE-01`, `kind: fileContent`, and no detector parameters.** The plan directed this; the open question it left was which of the six kinds a parameterless deferred fact should carry. `fileContent` is the kind a Phase 4 change-risk detector would actually use, and the schema makes per-kind parameters optional so a deferred declaration carries none. Declaring them keeps the near-miss line honest; `deferredTo` is what stops a future detector author reading the empty parameter set as an oversight.
2. **`factVocabularyInvariants` is one function invoked from two places, not two mechanisms.** It is the `domain` callback of `loadFactVocabularyStrict` AND the first contributor to `packCatalogInvariants`. That is what lets `packCatalogInvariants` genuinely produce all three codes the plan specifies for a caller holding a vocabulary from any source, without a second duplicate-detection implementation.
3. **Codepoint order for the merged catalog, not `localeCompare`.** `localeCompare` is ICU- and locale-dependent; the merged catalog feeds a plan digest that must be byte-identical across hosts. The test asserts `deepEqual(ids, [...ids].sort())`, which is the same instrument.
4. **`existing-source` was deliberately left unmarked by `broad: true`.** It is genuinely broad, but `BROWNFIELD_INIT` declares `all: [existing-source, missing-conventions-document]` — exactly two leaves. Marking both broad would make the pack unselectable the moment the "a broad fact may never be a pack's only satisfied leaf" rule is enforced mechanically. The plan named only `browser-entrypoint` and `agent-runtime-config`, and that restraint is now deliberate rather than incidental.
5. **`ISSUE_CAP` and the issue comparator are mirrored rather than imported.** `finalizeIssues` and `ISSUE_CAP` are module-private in `validation.ts`. Exporting them for one consumer would widen a Phase 1 module's public surface; the post-merge pass duplicates the 6-line comparator with a comment naming the original, matching the 02-01 precedent for `parseStrictJson`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `x-` extensions on a fact are not reachable through the root-level extension split**

- **Found during:** Task 1 (the "an `x-`-namespaced property loads and is preserved as an inert extension" behaviour)
- **Issue:** `splitExtensions` in `src/core/validation.ts` splits `x-*` keys only at the document root that alpha-AOS owns. A namespaced key on a **nested** object — a fact entry — never reaches it, so `additionalProperties: false` at the per-fact level would have refused the very document the plan says must load.
- **Fix:** Added `patternProperties: { "^x-[a-z0-9]+(?:-[a-z0-9]+)*$": {...} }` at the per-fact level of `schemas/fact-vocabulary.schema.json`, using the same namespace regex `EXTENSION_NAMESPACE` enforces at the root. `additionalProperties: false` is retained, so the acceptance criterion holds and a malformed namespace (`x-`, `X-VENDOR`) still fails the closed-world check.
- **Files modified:** `schemas/fact-vocabulary.schema.json`
- **Verification:** `test/pack-catalog.test.ts#an x- namespaced property on a fact loads and is preserved verbatim` passes; `#a fact carrying an unregistered non-x- property is refused` proves the closed world is intact.
- **Committed in:** `69170ef` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** None on scope. The plan's stated behaviour required this; without it two of Task 1's five behaviours were mutually unsatisfiable. No scope creep.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | Status |
|------|-----|-------|----------|--------|
| 1 — fact vocabulary | `8127826` | `69170ef` | — | Pass |
| 2 — merged catalog | `90b9e59` | `72a7e38` | — | Pass |
| 3 — domain invariants | `7ade3d7` | `8c582b4` | — | Pass |

Every RED run was validated with `gsd-tools check tdd-red-evidence` and returned `RED_EVIDENCE_OK` (`target_test_failed`) — the named target test failed on an assertion about the planned behaviour, never on a load crash or an unrelated failure:

| Task | Target test | tests / pass / fail at RED |
|------|-------------|-----------------------------|
| 1 | the declared vocabulary contains every fact id named by the pack catalog | 5 / 0 / 5 |
| 2 | all seven pack files merge into one catalog of fifteen packs | 9 / 5 / 4 |
| 3 | two pack files declaring the same pack id are refused | 14 / 10 / 4 |

Each RED commit carries only the failing tests plus the minimum scaffolding needed for them to compile and RUN (types, and a stub whose body is explicitly marked `RED scaffold`) — a test that cannot run cannot produce RED evidence.

## Known Stubs

| Stub | File | Reason it is intentional | Resolved by |
|------|------|--------------------------|-------------|
| 31 facts are declared across all six detector kinds, but `collectProjectEvidence` still implements only the `dependency` detector over `package.json` | `src/core/evidence.ts` | Explicitly outside this plan's scope — this plan makes the vocabulary declarable and validated; observing a `file` / `directory` / `manifestKey` / `fileAbsent` / `fileContent` fact is the next layer. | 02-06 |
| The eight SECURITY_REVIEW risk facts carry `deferredTo: GATE-01` and no detector parameters, so `SECURITY_REVIEW` can never select | `catalog/facts.yaml` | The plan's stated design. They are change-risk semantics, not repository state, and two would require credential-scanning a user's repository. Declaring them keeps the near-miss line honest rather than silent. | 02-07 (renders them `unimplemented`), Phase 4 GATE-01 (implements them) |
| `evaluatePack` still implements only the `anyDependencies` operator, so 14 of the 15 merged packs contribute no evaluation | `src/core/project-plan.ts` | Carried from 02-01; this plan widened the loader, not the evaluator. Nothing false is claimed — such a pack is absent from the plan value rather than reported `silent`. | 02-06, 02-07 |

The first two are recorded in `.planning/WINDOWS.md` as open `stub` entries for phase 02; the third was already recorded there by 02-01 and remains open.

## Threat Flags

None. No new network endpoint, auth path, or file-access pattern was introduced; the only new read is `catalog/facts.yaml`, a repository-owned file routed through the same managed-document pipeline as every other.

Threat-register mitigations applied and evidenced:

- **T-02-05 (Denial of Service — content-match patterns):** every pattern is declared in `catalog/facts.yaml` and none is read from the scanned project. `grep -rn "patterns" src/` returns exactly one hit — the `FactDeclaration` type declaration. Every declared pattern is anchored or literal with no nested quantifier, so match cost is linear in the input.
- **T-02-07 (Denial of Service — YAML load):** both loaders route through `validateManagedDocument`, whose YAML path caps alias expansion at `MAX_ALIAS_COUNT`. `src/core/pack-catalog.ts` contains no bare `yaml` import.
- **T-02-12 (Denial of Service — `$defs` recursion):** four explicit levels, deepest accepting fact-id strings only. Each `$ref` descends strictly; there is no cycle.
- **T-02-13 (Information Disclosure — `actualShape`):** proved by `#a refusal reports the offending id's shape and never its value`, which serializes the entire issue list and asserts the offending id does not appear anywhere in it.
- **T-02-14 (Spoofing — a pack naming an undeclared fact):** `domain.undeclared-fact` refuses at load, with `expected` naming `catalog/facts.yaml`.

## Issues Encountered

None beyond the deviation above.

## Verification Results

| Check | Result |
|-------|--------|
| `npm run check` | exits 0, no TypeScript error |
| `npm run build` | exits 0 |
| `npm run build:check` | `build artifact verified: 61 inputs, 116 outputs` |
| `node --test dist/test/pack-catalog.test.js` | `tests 14, pass 14, fail 0` — at least 12 required |
| `node scripts/run-tests.mjs` (full suite, = `npm test`) | `tests 226, pass 221, fail 0, skipped 5` — strictly above the 212 total recorded in 02-01-SUMMARY.md |
| `git diff --stat -- catalog/packs/` | empty — all seven declaration files validate unchanged |
| declared fact count | 31; every fact id referenced by the seven pack files is declared (0 undeclared) |
| `broad: true` markers | `agent-runtime-config`, `browser-entrypoint` |
| `deferredTo: GATE-01` markers | 8, exactly the SECURITY_REVIEW leaf set |
| `node dist/src/cli.js project plan . --json` | exits 0, parses, `scope.projectId` = `b33de7edb6d8ad07` unchanged from 02-01 |
| `$defs` levels in `schemas/pack-catalog.schema.json` | `evidenceNode1..4`, each referencing only the next level |

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **Ready for 02-05 / 02-06.** The vocabulary is the contract a detector implements against: `kind` selects the detector, and the per-kind parameters (`packages`, `files`, `directories`, `manifestKey`, `patterns`) are the detector's whole input. 02-06 adds the five missing detector kinds and the non-npm manifest readers without touching the catalog.
- **Ready for 02-07.** `domain.undeclared-fact` refuses an *unimplementable* declaration at load; the complementary case 02-07 owns is a fact that is declared but has no detector yet (the eight `deferredTo: GATE-01` facts), which must surface as `unimplemented` in output rather than as a silent absence.
- **One carried risk.** `SECURITY_REVIEW` currently cannot select at all, because all eight of its leaves are deferred. That is recorded in `.planning/WINDOWS.md` rather than left to memory, and it is visible in the plan output as an absent pack until 02-07 gives it an `unimplemented` status.
- **One item for human review before 02-06.** The `deploy-workflow` / `release-workflow` / `postgres-dsn` / `redis-dsn` pattern sets were seeded conservatively per the researcher's open question 3 and have never been run against a real repository. Coverage D8 is marked `human_judgment: true` for exactly this reason.

## Self-Check: PASSED

All three created files verified present on disk (`schemas/fact-vocabulary.schema.json`, `catalog/facts.yaml`, `test/pack-catalog.test.ts`). All six task commits verified in `git log`: `8127826`, `69170ef`, `90b9e59`, `72a7e38`, `7ade3d7`, `8c582b4`. Commit count measured from `plan_head_before` (`25e287a`) with `git rev-list --count`: 6 before this metadata commit. Every task's `<acceptance_criteria>` was re-run after the final GREEN and every plan-level `<verification>` command passed.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*
