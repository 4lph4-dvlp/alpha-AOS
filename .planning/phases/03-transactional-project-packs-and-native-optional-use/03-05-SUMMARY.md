---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 05
subsystem: testing
tags: [canary-catalog, readiness-probe, blocked-reason, json-schema, closed-world, prompt-hygiene, preview-boundary]

# Dependency graph
requires:
  - phase: 01-safe-operation-boundary
    provides: "runProcess with a shell-free bounded launch, commandProbeEnvironment, resolveCommand, and the excerpt/fingerprint split that keeps raw child output out of persisted records"
  - phase: 02-project-capability-planning
    provides: "the catalog-plus-closed-schema pair (catalog/packs/*.yaml + schemas/pack-catalog.schema.json + loadPackCatalogStrict) this plan copies verbatim in shape, and the verb-discipline refusal register in src/cli.ts"
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "plan 03-03's BlockedReason record shape (code/variable/nextAction, no value field), and plan 03-04's ORACLE_DEFINITIONS cost flag and resolveDirectLaunch"
provides:
  - "catalog/canaries.yaml — three declared canaries: a version-scoped documentation lookup, a multi-source research run, and the ordinary-lookup fan-out control"
  - "schemas/canary-catalog.schema.json — closed at every object level, with the never-name rule written into the prompt field's description"
  - "the canary-catalog ManagedDocumentKind, registered across the same three validation tables pack-catalog uses"
  - "loadCanaryCatalog — refuses an unknown property, a duplicated id, and a prompt reworded to name a tool its own declaration lists"
  - "promptNamesTerm / findPromptHints / selfNamedTerms — token-sequence hygiene, so `exact` is not read as `exa`"
  - "BLOCKED_CODES — five stable upper-snake codes with their human wording"
  - "probeReadiness — four free pre-probe questions, in order, all before any model turn"
  - "parsePiAuthCheck / parseClaudeMcpList — field-selective readers that keep names and states and drop everything else"
  - "READINESS_DEFINITIONS — a per-harness table whose nulls carry the reason the probe is absent"
  - "disposeCanary — the one place blocked and unverified are told apart, three mutually exclusive branches"
  - "assertCanaryContext / CanaryContextError / CANARY_IN_PREVIEW_CONTEXT — the preview boundary as a refusal"
  - "canaryCosts / canaryCostsModelTurn / catalogCosts — what a sweep would spend, read from the oracle table rather than restated"
affects: [canary-runtime, doctor-verbs, invocation-evidence, status-rendering, capability-promotion, one-shot-lifecycle]

actuals:
  tokens: 22240
  tasks: 3
  commits: 4
plan_head_before: b6fa0303c757417464ed8e737ca06a467b74b4b3

tech-stack:
  added: []
  patterns:
    - "declared-prompt catalog: every model-visible instruction lives in one reviewed YAML file behind a closed schema, so a reword is a diff"
    - "token-sequence matching rather than substring matching for a forbidden-vocabulary check, with an explicit negative control for the false-positive direction"
    - "shape-as-mitigation: a record type with no field able to hold a secret, instead of a redaction pass over prose"
    - "field-selective parsing: read the three named fields, never keep the parsed object, so a future field carrying a value cannot ride along"
    - "recorded absence: a per-harness table entry that is null carries the reason it is null, and no unverified command is ever named"
    - "pre-probe rather than post-mortem: the blocked/unverified split is derived from free questions asked before the run, not parsed out of a failed run's output"

key-files:
  created:
    - catalog/canaries.yaml
    - schemas/canary-catalog.schema.json
    - src/core/canary.ts
    - test/canary.test.ts
  modified:
    - src/core/validation.ts

key-decisions:
  - "Canary prompts live in catalog/canaries.yaml rather than beside each pack, because the catalog-plus-closed-schema pair is this repository's existing shape for declared policy and a reviewed diff is what makes the no-rewording prohibition observable"
  - "Prompt hygiene compares TOKEN SEQUENCES, not substrings: substring matching would read `exact` as the server id `exa` and reject every ordinary English prompt, and a rule nobody can satisfy is a rule that gets deleted"
  - "loadCanaryCatalog enforces the self-contained half of the hygiene rule (a prompt must not name its own declared tools) so a hinting prompt is refused at load; the wider locked vocabulary is asserted by the suite, which already holds the lock"
  - "requiresEnvironment and requiresMcpServers were added to the declaration in Task 1 because Task 2's probe needs declared requirements to check; both carry NAMES only"
  - "BlockedReason is imported from capability-ledger.ts rather than redeclared, so this plan produces values for the existing shape instead of introducing a second one"
  - "READINESS_DEFINITIONS names only commands measured on this host; codex and pi connection listings are recorded as absent-with-a-reason rather than guessed, because a guessed probe fails as a confident wrong answer"
  - "The provider probe asks about a model when the caller knows one and about the harness's documented default provider otherwise, and records which of the two the answer was about — that is what makes a silent free-model fallback nameable"
  - "disposeCanary gives a named cause precedence over a trailing failure: downgrading a blocked run to unverified would throw away the only actionable thing anyone learned"
  - "The cost flag is READ from ORACLE_DEFINITIONS rather than restated in the catalog, so the two tables cannot drift; an underivable cost is null and the fail-closed roll-up treats it as spending"
  - "probeReadiness itself asserts the preview boundary before it reaches for a process, so the guard is live rather than decorative"

patterns-established:
  - "Declared-prompt catalog: a model-visible instruction is data under a closed schema, never a string literal in a code path"
  - "Hygiene with a negative control: a forbidden-vocabulary check ships with assertions in BOTH directions, so it cannot be satisfied by being uselessly strict"
  - "Pre-probe over post-mortem: an actionable failure state is derived from free questions asked first, never from parsing a failure"
  - "Recorded absence with a reason: a null in a per-harness table says why it is null, and no unverified command is named as an oracle"
  - "Boundary proven twice: a runtime refusal with a stable code, plus a source-level assertion that the forbidden caller cannot reach the module at all"

requirements-completed: []

coverage:
  - id: D1
    description: "Every canary prompt lives in one declared, schema-validated catalog and is reviewable as ordinary text before any run spends money"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the shipped catalog declares the documentation canary, the research canary and the fan-out control"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the canary catalog schema is a closed world at every object level"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#loadCanaryCatalog refuses a catalog carrying an unknown property"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#loadCanaryCatalog refuses a duplicated canary id rather than silently keeping one"
        status: pass
      - kind: other
        ref: "node -e 'schemas/canary-catalog.schema.json additionalProperties !== false' — printed 'closed'"
        status: pass
      - kind: other
        ref: "grep -v '^\\s*[/*]' src/core/validation.ts | grep -c canary-catalog — 3"
        status: pass
    human_judgment: false
  - id: D2
    description: "A prompt that names the skill, server or tool it is meant to elicit is refused mechanically, so rewording a canary until it passes is a visible diff rather than an invisible edit"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#every declared prompt names none of its expected tools, no pinned server id and no locked skill id"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#loadCanaryCatalog refuses a prompt reworded to name the tool it should elicit"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#prompt hygiene compares token sequences, so an ordinary word carrying a server id is not a hint"
        status: pass
    human_judgment: true
    rationale: "The mechanical half is fully covered above, and it is the only half that can be. Whether a prompt reads as an ordinary request — the standard 03-CONTEXT.md actually sets — is a judgement no test can make; a prompt could pass every assertion here and still be a leading question. A human must read the three shipped prompts."
  - id: D3
    description: "A canary that cannot finish because a credential is unset reports blocked naming the environment variable and the next action, never the value"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#an unset required variable is blocked with a code, the variable name and a next action"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a set credential value never reaches the serialized readiness report"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a BlockedReason has exactly code, variable and nextAction, and no field able to hold a value"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#no readiness argument vector carries a flag whose documented effect is to emit a secret"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the connection listing parser keeps server names and states and retains no command line"
        status: pass
    human_judgment: false
  - id: D4
    description: "The readiness probe runs BEFORE the canary, so blocked-versus-unverified is derived from a pre-probe rather than parsed out of a failed run, and a nameless failure stays honestly unverified"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a failure no probe named stays unverified, and no cause yields both blocked and unverified"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#with every requirement satisfied the readiness report is ready and the canary may run"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an unconfigured provider is blocked with the provider named, from the harness's own readiness output"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a failed MCP server is blocked naming the server, and a registered-but-pending one is not"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an unresolvable harness is blocked, and the readiness report says which command was looked for"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#BLOCKED_CODES is a frozen table of upper-snake codes covering the four named causes"
        status: pass
    human_judgment: false
  - id: D5
    description: "A canary result is attributable to a named provider and model, so a run on a silently substituted free model is interpretable rather than anonymous"
    requirement: "CAPA-07"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the readiness report records the provider and model the harness would actually run on"
        status: pass
      - kind: other
        ref: "live probe this session: `pi auth check --provider google --json` -> not_ready/credentials_not_configured; `pi auth check --model nvidia/nemotron-3-super-120b-a12b --json` -> ready/nvidia"
        status: pass
    human_judgment: false
  - id: D6
    description: "The canary cannot be reached from the preview path, proven by a source-level assertion rather than assumed, and a caller can list what a run would spend before running it"
    requirement: "CAPA-05"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the preview-context guard refuses with a stable code and names the command to run instead"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a canary entry point reached from a preview context is refused before it launches anything"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the preview module does not import the canary module, at the source level"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#every canary declaration exposes whether a run would spend a model turn"
        status: pass
      - kind: other
        ref: "grep -c canary.js src/core/project-plan.ts — 0"
        status: pass
      - kind: integration
        ref: "node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/project-plan.test.js dist/test/preview.test.js — 194 tests, fail 0"
        status: pass
    human_judgment: false

# Metrics
duration: 36 min
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 5: The Declared Canary Catalog and the Readiness Pre-Probe Summary

**Three canary prompts declared as reviewable text behind a closed schema, a token-sequence hygiene rule that refuses a prompt naming what it should elicit, and a four-question pre-probe that makes `blocked` name a variable and a next action while a nameless failure stays honestly `unverified`.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-09-10T13:24:25Z
- **Completed:** 2026-09-10T14:00:00Z
- **Tasks:** 3
- **Files modified:** 5 (4 created, 1 modified)

## Accomplishments

- `catalog/canaries.yaml` declares three canaries — a version-scoped documentation lookup, a two-leg multi-source research run, and the ordinary-lookup fan-out control whose `maxDistinctServers` is 1. Every prompt is ordinary text; the tool names live in `expectTools` so the prompt never has to hint.
- `schemas/canary-catalog.schema.json` is `additionalProperties: false` at every object level, and the `prompt` field's description carries the never-name rule, so the constraint travels with the contract rather than living only in a review comment.
- The hygiene check compares **token sequences**, not substrings. That single choice is what makes it usable: `exact version` does not read as the server id `exa`, while `deep research` still reads as the skill id `deep-research`. It ships with assertions in both directions.
- `probeReadiness` asks four free questions in a fixed order, all before any model turn: declared environment **names**, harness presence, the harness's own provider readiness, and its own MCP connection listing. Every `blocked` answer this produces names a variable and a next action.
- `disposeCanary` is the one place `blocked` and `unverified` are told apart — three mutually exclusive branches, so a single cause can never produce both, and a named cause never degrades to `unverified`.
- The preview boundary is proven twice: a runtime refusal (`CANARY_IN_PREVIEW_CONTEXT`) asserted *before* the probe reaches for a process, and a source-level assertion that `src/core/project-plan.ts` never names the canary module at all, statically or dynamically.

## Task Commits

1. **Task 1: The canary catalog — declared prompts and a closed schema** — `e885519` (feat)
2. **Task 2: Readiness probes that produce a named, actionable `blocked`** — `05343a3` (test, RED) → `f5c34b2` (feat, GREEN)
3. **Task 3: The canary is not a preview, and says so at the boundary** — `3142903` (feat)

_Task 2 was a TDD task; RED and GREEN are separate commits. No REFACTOR commit — the GREEN implementation needed no cleanup._

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `05343a3` `test(03-05)` | 19 tests discovered, 10 pass, 9 fail — all on assertions for the planned behaviour, against compiling stubs. `gsd-tools check tdd-red-evidence` returned **`RED_EVIDENCE_OK` / `target_test_failed`** for the target test "an unset required variable is blocked with a code, the variable name and a next action". |
| GREEN | `f5c34b2` `feat(03-05)` | `dist/test/canary.test.js` 20 tests, fail 0. Full suite 565 tests, fail 0. |
| REFACTOR | — | Not needed; no cleanup was warranted, so no commit was made (per the cycle's "only commit if changes made"). |

No gate violations.

## Files Created/Modified

- `catalog/canaries.yaml` — the three declared canaries, their expectation lists, their environment and server requirements, and a `why` line per entry for a reviewer reading the diff.
- `schemas/canary-catalog.schema.json` — the closed contract. Narrowed enums for `capability` and `harnesses`, `readOnly` pinned to `const: true`, `requiresEnvironment` items constrained to upper-snake variable names.
- `src/core/canary.ts` — catalog loading and its domain invariants, prompt hygiene, `BLOCKED_CODES`, the per-harness readiness table and its two parsers, `probeReadiness`, `disposeCanary`, the preview guard, and the cost surface.
- `test/canary.test.ts` — 24 assertions across the three tasks, entirely offline: every command result is supplied, so nothing here launches a harness or spends anything.
- `src/core/validation.ts` — the `canary-catalog` kind registered across `ManagedDocumentKind`, `OWNED_SUBTREE` and `CORE_SCHEMAS`.

## Decisions Made

See `key-decisions` in the frontmatter. The three that most shape what comes next:

1. **Prompt storage resolved to the catalog.** 03-CONTEXT.md left this to Claude's Discretion. The catalog-plus-closed-schema pair is this repository's existing shape for declared policy, and a reviewed diff is the only thing that makes "do not reword the prompt until it passes" observable rather than aspirational.
2. **The fan-out judgement rule is a count, not a sequence.** `maxDistinctServers` encodes 03-RESEARCH.md Pitfall 1's second-order note: the discovery server ships its own fetch tool, so more than one reasonable two-tool path exists and a required sequence would fail a correct run.
3. **No unverified command is named as an oracle.** `READINESS_DEFINITIONS` records `codex` and `pi` connection listings as *absent, with the reason*, because a guessed probe does not fail loudly — it produces a confident wrong answer.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `requiresEnvironment` and `requiresMcpServers` to the canary declaration**

- **Found during:** Task 1 (while authoring the schema, reading ahead to Task 2)
- **Issue:** Task 1's field list did not include them, but Task 2 requires "the environment-name presence check for the canary's **declared** requirements" and a per-server connection check. Without declared requirement fields the probe would have had nothing to check, and a closed schema cannot be extended later without a version bump.
- **Fix:** Both fields declared in `schemas/canary-catalog.schema.json` and in `CanaryDeclaration`, carrying NAMES only — `requiresEnvironment` items are constrained to `^[A-Z][A-Z0-9_]*$`, and the schema description records that presence is all that is ever read.
- **Files modified:** `schemas/canary-catalog.schema.json`, `catalog/canaries.yaml`, `src/core/canary.ts`
- **Verification:** `test/canary.test.ts#an unset required variable is blocked…` and `#a failed MCP server is blocked naming the server…`
- **Committed in:** `e885519` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Added `checkedEnvironment` to `ReadinessReport`**

- **Found during:** Task 2 GREEN
- **Issue:** The T-03-40 sentinel test asserts a set value is absent from the serialized report. As first written the report named a variable only when it was *missing*, so for a variable that IS set the sentinel assertion was vacuous — the name was absent too, and a report that mentioned neither would have passed.
- **Fix:** `ReadinessReport.checkedEnvironment` records the variable NAMES the probe looked up, present or not. The sentinel test now asserts the name is in the document and the value is not, in the same document.
- **Files modified:** `src/core/canary.ts`
- **Verification:** `test/canary.test.ts#a set credential value never reaches the serialized readiness report`
- **Committed in:** `f5c34b2` (Task 2 GREEN commit)

**3. [Rule 2 - Missing Critical] Added a source-level test forbidding secret-emitting flags in the readiness argument vectors**

- **Found during:** Task 2 (while measuring `pi auth --help` on this host)
- **Issue:** `pi auth check` accepts `--credentials`, whose documented effect is to emit the credential — or include it in the JSON this module parses. A sibling verb prints an API key outright. Nothing structurally stopped a future edit from adding that flag to the table.
- **Fix:** Field-selective parsing in `parsePiAuthCheck` (three named fields read, the parsed object never kept) plus a named source-level test asserting the `READINESS_DEFINITIONS` region contains none of `--credentials`, `print-api-key`, `print-bearer-token`, with a positive control proving the extracted region really does contain argument vectors.
- **Files modified:** `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** `test/canary.test.ts#no readiness argument vector carries a flag whose documented effect is to emit a secret`
- **Committed in:** `f5c34b2` (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (3 missing-critical, all under Rule 2)
**Impact on plan:** All three are correctness or secrets-constraint requirements the plan's own tasks implied but did not enumerate. No scope creep — no new surface beyond what Tasks 1–3 named.

## Re-measured on this host (orchestrator carry-forward)

The orchestrator asked that any readiness or connection oracle observation be **re-measured here** rather than inherited from 03-RESEARCH.md or 03-04. Measured live this session, 2026-09-10:

| Command | Measured result |
|---|---|
| `pi auth check --provider google --json` | `{"status":"not_ready","provider":"google","reason":"credentials_not_configured"}` — matches RESEARCH.md Pattern 4 exactly |
| `pi auth check --provider anthropic --json` | `{"status":"not_ready","provider":"anthropic","reason":"credentials_not_configured"}` |
| `pi auth check --model nvidia/nemotron-3-super-120b-a12b --json` | `{"status":"ready","provider":"nvidia","authType":"api_key"}` — **A7 confirmed**: the silent free-model fallback IS configured on this host while all three named providers are not |
| `claude mcp list` | Ten servers. **Three states, not two:** `✔ Connected` (context7, exa, firecrawl and five others), `! Needs authentication` (one), and RESEARCH.md's recorded `✘ Failed to connect`. |

Two facts differ from the record and are carried forward:

- **`firecrawl` is now `✔ Connected`.** RESEARCH.md Pitfall 8 recorded `✘ Failed to connect — CONNECTION_CLOSED`; plan 03-02's proxy environment repair evidently closed it. The failed-connection branch is therefore exercised by a recorded fixture rather than by this host's live state, which is stated here so nobody reads the parser's `failed` coverage as a live observation.
- **`! Needs authentication` is a third state RESEARCH.md did not record.** `parseClaudeMcpList` classifies it as `needs-auth` and `probeReadiness` treats it as blocking, because a server that will not answer without a login is exactly as unusable to a canary as one that failed outright — and, unlike a failure, it has an obvious next action.

`pi auth --help` also documents `--credentials`, which "emits the credential, or includes it in JSON output". That is a measured hazard, not a hypothetical one, and it is why deviation 3 exists.

## Issues Encountered

- **A byte-identical duplicate canary is caught by the schema, not by the domain invariant.** The first duplicate-id test used two identical entries and was refused with `schema.uniqueItems` before `canary.duplicate-id` ever ran. Rewritten to use two *different* entries sharing one id, which is the actual hazard: last-wins would turn an ambiguous catalog into a confident answer. The original test would have passed while proving nothing.
- **No REFACTOR commit for Task 2.** Deliberate, not an omission — the GREEN implementation had no cleanup worth a commit, and the cycle only commits REFACTOR when changes are made.

## User Setup Required

None — no external service configuration was introduced. The `EXA_API_KEY` requirement in `catalog/canaries.yaml` is a *declaration* consumed by the probe; nothing in this plan reads or requires the value.

## Next Phase Readiness

Ready for plan 03-06 (the canary runtime and the two `doctor` verbs). What it inherits:

- `loadCanaryCatalog(packageRoot)` returns the declared canaries; `catalogCosts(catalog)` answers "what would this sweep spend" before anything runs, which is what `alpha-aos doctor --canary` needs to print.
- `probeReadiness` returns a `ReadinessReport`; `disposeCanary(report, failure)` maps it to `ready | blocked | unverified`; `ledgerFieldsFor(disposition)` produces the `nativeUse` + `blockedReason` pair a ledger row takes. 03-06 should render from those and add no fourth vocabulary.
- The refusal register is set: `assertCanaryContext` throws `CANARY_IN_PREVIEW_CONTEXT` naming `alpha-aos doctor --canary`, which is the verb 03-06 declares. If 03-06 renames the verb, that string must move with it.

Two things 03-06 and later plans must not inherit blindly:

1. **The `failed` connection branch is fixture-covered, not host-covered** (see the re-measured table). A CI leg that asserts a live failure will not find one on this host.
2. **`READINESS_DEFINITIONS` has real holes** — codex has neither probe, pi has no connection listing. Those are recorded absences with reasons, and a plan that needs them must *measure* a command rather than fill the null in from documentation.

Requirements `CAPA-05` and `CAPA-07` are **not** marked complete: `requirements.ready-ids` reports 0 of 2 ready, because sibling plans in this phase also declare them and have not finished. That is the shared-ID gate working as intended.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*

## Self-Check: PASSED

- All four created files exist on disk.
- All four task commits (`e885519`, `05343a3`, `f5c34b2`, `3142903`) are present in `git log`.
- `commits: 4` is measured, not narrated: `git rev-list --count b6fa030..HEAD` at SUMMARY write.
- Every task's `<acceptance_criteria>` re-run and passing; plan-level `<verification>`: `npm test` → 569 tests, fail 0, 6 pre-existing platform skips.
