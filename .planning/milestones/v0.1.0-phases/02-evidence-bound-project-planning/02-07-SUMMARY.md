---
phase: 02-evidence-bound-project-planning
plan: 07
subsystem: api
tags: [predicate-evaluation, near-miss, explainability, pack-overrides, yaml-catalog, cli-flags, node-test]

# Dependency graph
requires:
  - phase: 02-evidence-bound-project-planning
    provides: "02-06's complete evidence envelope, the six detector kinds, the five manifest readers, and the DeclaredDependencies index inline literals resolve against"
  - phase: 02-evidence-bound-project-planning
    provides: "02-02's catalog/facts.yaml declared vocabulary with broad and deferredTo markers, the merged 15-pack catalog, the five-operator predicate schema, and the load-time domain.undeclared-fact refusal"
  - phase: 02-evidence-bound-project-planning
    provides: "02-05's discoverSubProjects and its named-never-guessed targeting contract"
  - phase: 02-evidence-bound-project-planning
    provides: "02-01's canonical root ladder, the three plan digests, and the single print() output seam"
  - phase: 01-safe-operation-boundary
    provides: "validateManagedDocument with stable domain issue codes, the closed-world manifest schema, and the redaction seam"
provides:
  - "evaluateEvidenceNode: the evaluate-all evaluator over all five operators plus bounded nesting, which never short-circuits"
  - "classifyPack: selected / near-miss / silent / unimplemented / forced-on / forced-off from one pure function over the evaluated leaves"
  - "the broad rule: a pack whose only satisfied leaves are broad facts is never selected, as a general rule rather than one pack's special case"
  - "rankNearMisses and MAX_NEAR_MISS_LINES: deterministic order plus a hard cap with a suppression count"
  - "describeLeaf / describeNearMiss: every phrase rendered from catalog/facts.yaml, never a per-pack string"
  - "--why and --project <rel> on `alpha-aos project plan`"
  - "packOverrides in the project manifest, with domain.unknown-pack-override and the override recorded as evidence"
  - "redactDocument: the print() seam's human rendering bounded as a document rather than as one field value"
affects: [02-08, 02-09, 02-10, phase-3-capability-materialization, phase-4-gate-01]

actuals:
  tokens: 20940
  tasks: 3
  commits: 7
plan_head_before: 3d49cace3db520a1a52ff859b2bc6591238f345e

tech-stack:
  added: []
  patterns:
    - "Evaluate-all, never short-circuit: the truth value is accumulated AFTER each child is evaluated, so the leaf data a short-circuiting evaluator would discard is kept"
    - "One explanation vocabulary: every rendered phrase comes from a fact's declared description or from the synthesized-literal vocabulary, so all 15 packs explain uniformly and correcting a phrase is a YAML edit"
    - "Overrides applied AFTER evaluation, never instead of it, so a forced pack still carries the full evidence that would have decided it"
    - "Named-cap discipline extended to explanation output: deterministic order, a hard cap, and a suppression count that names the flag which lifts it"
    - "A document rendering and a field value get different bounds: the per-value cap belongs to redactValue's walk, not to a whole command rendering"

key-files:
  created: []
  modified:
    - src/core/project-plan.ts
    - src/core/project.ts
    - src/core/evidence.ts
    - src/core/redaction.ts
    - src/format.ts
    - src/cli.ts
    - src/types.ts
    - schemas/project-stack.schema.json
    - catalog/packs/security.yaml
    - test/project-plan.test.ts
    - test/project.test.ts

key-decisions:
  - "Near-miss is defined as: at least one leaf satisfied AND at least one not. Under `any` that means a pack with no satisfied leaf stays silent, which is correct because a satisfied leaf would have selected it and there is nothing to explain."
  - "MAX_NEAR_MISS_LINES = 5, ordered by descending satisfied-leaf count then ascending pack id, with a trailing suppression count naming --why. This mirrors finalizeIssues in validation.ts: deterministic order and a hard cap so a hostile catalog cannot flood output."
  - "A leaf phrase is the FIRST SENTENCE of the fact's declared description, whitespace collapsed. Using the whole description would make one multi-sentence declaration dominate a line; using a hand-written per-pack string is the thing the plan prohibits."
  - "`selected` became a sorted id list and `evaluations` carries the full detail, because the redaction seam's global seen-set reports any shared object reference as a cycle. Duplicating the records to dodge it would have doubled the JSON for no gain."
  - "packOverrides values are spelled `force-on` / `force-off`, not `on` / `off`, because YAML 1.1 resolves bare `on` and `off` as booleans and a user writing the obvious thing would have had their override silently refused by the enum."
  - "SECURITY_REVIEW gained a `manifestOptIn: securityReview` branch (a nested node inside its `any`), which is the branch the plan required to be operative. Its eight risk facts stay deferred to GATE-01 and now render as an UNIMPLEMENTED line naming them."
  - "The declared pack id set is loaded once and the packOverrides check is unconditional. Passing the set in per-call would let whichever route forgot it accept an unknown override key, which is precisely the silent acceptance D-06 must not have."
  - "An undeclared fact outranks the predicate's truth value in classification. loadPackCatalogStrict makes the state unreachable, but the fail-closed answer for a predicate arriving any other way must be `unimplemented` naming the fact, never a plain non-match."

patterns-established:
  - "Synthesized leaf ids carry an operator prefix and a colon (`dependency:`, `file:`, `manifest:`); a declared fact id cannot, so the two are distinguishable without a second flag on the leaf"
  - "A pure evaluation environment as a VALUE (PackEvaluationEnvironment) rather than a repository, so a nested node, a deferred fact and a broad-only match are each assertable without inventing a repository shape"
  - "Status is computed by one pure function over the evaluated leaves, so the same envelope yields the same classification regardless of invocation order or concurrency"

requirements-completed: [DETC-03]

coverage:
  - id: D1
    description: "Every leaf of every one of the 15 declared packs is evaluated on every run over the full operator set (all, any, anyFiles, anyDependencies, manifestOptIn, plus bounded nesting); no operator short-circuits, so a failed leaf's reason exists even for a pack already decided"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#an all pack selects only when every leaf holds, and records the failed leaf either way"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#an any pack selects on one leaf and still records the leaves that failed"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#anyFiles and anyDependencies synthesize their leaf ids from operator plus matched literal"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#manifestOptIn synthesizes a leaf id with the manifest prefix already in use"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a nested evidence node inside any evaluates and contributes its flattened leaves"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#every one of the 15 declared packs is evaluated with both a satisfied and a failed array"
        status: pass
    human_judgment: false
  - id: D2
    description: "A generic file that exists in ordinary repositories can never activate a pack on its own: a pack whose only satisfied leaves are facts marked `broad` is not selected, as a general rule rather than a special case for AGENT_RUNTIME"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a pack whose only satisfied leaf is a broad fact is never selected on that leaf alone"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#an instructions document alone leaves AGENT_RUNTIME unselected against a real repository"
        status: pass
      - kind: integration
        ref: "test/project.test.ts#an instructions document alone does not activate the agent runtime pack"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every failed leaf carries a reason sourced from the evidence envelope's negative record, so 'not detected' never reads the same as 'not checked'"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#every failed leaf carries a reason sourced from the evidence envelope's negative record"
        status: pass
    human_judgment: false
  - id: D4
    description: "Default output shows full reasoning per selected pack plus one near-miss line per partially matched pack, capped at MAX_NEAR_MISS_LINES, deterministically ordered, with a suppression count naming --why; packs that matched nothing stay silent"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#more near-miss packs than the cap print exactly the cap plus a suppression line naming --why"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#the near-miss order is descending satisfied-leaf count, then ascending pack id"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#a pack with zero satisfied leaves produces no default output line"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#--why prints every one of the 15 packs with leaf detail and applies no cap"
        status: pass
    human_judgment: false
  - id: D5
    description: "Both near-miss phrases render from catalog/facts.yaml rather than from a per-pack string, so the AGENT_RUNTIME line reads 'AGENTS.md present, but no agent SDK dependency' with no pack-specific text existing anywhere"
    requirement: "DETC-03"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#the agent-runtime near-miss line names the present document and the absent SDK, both from catalog/facts.yaml"
        status: pass
    human_judgment: false
  - id: D6
    description: "A pack whose facts are declared but deliberately unimplemented reports `unimplemented` naming the facts and the requirement that owns them, and SECURITY_REVIEW's manifest opt-in branch selects when the manifest opts in"
    requirement: "DETC-03"
    verification:
      - kind: unit
        ref: "test/project-plan.test.ts#a pack naming a deliberately unimplemented fact is unimplemented and names the requirement"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#the security pack is unimplemented naming GATE-01, and its manifest opt-in branch selects"
        status: pass
      - kind: unit
        ref: "test/project-plan.test.ts#a pack naming a fact the vocabulary does not declare is unimplemented, never a plain non-match"
        status: pass
    human_judgment: false
  - id: D7
    description: "D-06: the project manifest can force any declared pack on or off, the override is recorded as evidence rather than a bypass, an override naming an undeclared pack is refused with domain.unknown-pack-override, and an invalid manifest contributes zero overrides"
    requirement: "DETC-03"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#a manifest forcing a pack on selects it, with the manifest recorded as the reason"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a manifest forcing a pack off leaves it unselected even when its predicate holds"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a forced pack still carries its full satisfied and failed leaf arrays"
        status: pass
      - kind: integration
        ref: "test/project-plan.test.ts#a manifest that fails validation contributes zero overrides"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#--why states the manifest as the reason a forced pack attached"
        status: pass
      - kind: integration
        ref: "test/project.test.ts#a packOverrides entry naming an undeclared pack id is refused, not silently ignored"
        status: pass
    human_judgment: false
  - id: D8
    description: "D-01: `--project <rel>` targets one discovered sub-project, an unrecognised value is a refusal naming the discovered options, and a repository root with sub-projects lists each member's own decision and selects none"
    verification:
      - kind: e2e
        ref: "test/project-plan.test.ts#--project with an unrecognised value exits non-zero and names the discovered sub-projects"
        status: pass
      - kind: e2e
        ref: "test/project-plan.test.ts#from a repository root with no --project, each sub-project reports its own decision and none is selected"
        status: pass
    human_judgment: false
  - id: D9
    description: "The 02-06 regression is closed: `alpha-aos project plan .` against this repository selects MCP_SERVER again, on the evidence 02-06 could already observe but not evaluate"
    verification:
      - kind: integration
        ref: "test/project-plan.test.ts#MCP_SERVER selects on a declared MCP SDK dependency"
        status: pass
      - kind: manual_procedural
        ref: "node dist/src/cli.js project plan . --why --json (exit 0, 15 evaluated packs, MCP_SERVER status selected)"
        status: pass
    human_judgment: false

# Metrics
duration: 52 min
completed: 2026-09-07
status: complete
---

# Phase 02 Plan 07: Explainable Pack Selection and Manifest Overrides Summary

**An evaluate-all predicate evaluator over all five declared operators that keeps every leaf of every pack, classifies each into selected / near-miss / silent / unimplemented / forced, renders one bounded deterministically ordered near-miss line per pack from `catalog/facts.yaml` alone, and lets the project manifest force any declared pack on or off with the override recorded as evidence.**

## Performance

- **Duration:** 52 min
- **Started:** 2026-09-07T17:35:00Z
- **Completed:** 2026-09-07T18:27:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- **The evaluator stopped being a tracer.** `evaluateEvidenceNode` covers `all`, `any`,
  `anyFiles`, `anyDependencies` and `manifestOptIn`, plus the bounded nesting 02-02 added to the
  schema. Twelve of fifteen packs previously contributed **no evaluation at all** and were absent
  from the plan value; all fifteen are now evaluated on every run, each with both a `satisfied`
  and a `failed` array.
- **Nothing short-circuits.** Each loop accumulates its truth value with `&&` or `||` *after*
  the child has been evaluated, so the answer is identical to a short-circuiting evaluator's
  while the leaf data a short-circuiting evaluator would have thrown away survives. That
  discarded data is exactly what DETC-03 asks for: the moment an `any` finds its first true leaf,
  the reasons the other leaves failed are gone, and "why did this pack not attach?" becomes
  unanswerable.
- **`AGENTS.md` alone can no longer carry a pack, and the output says so.** The rule is general,
  not a carve-out for one pack: a pack whose only satisfied leaves are facts marked `broad` is not
  selected. Against this repository — which carries a 21 KB `AGENTS.md` and is therefore its own
  negative fixture — the default output now prints
  `NEAR-MISS AGENT_RUNTIME: A generic agent-instruction file or skill directory (AGENTS.md) — missing: An agent-orchestration framework is a declared dependency`.
  That is the CONTEXT's specific ask, rendered without any per-pack string existing anywhere.
- **The near-miss list is bounded and ordered.** `MAX_NEAR_MISS_LINES = 5`, descending
  satisfied-leaf count then ascending pack id, with a trailing `... N more near-miss pack(s)
  suppressed (use --why)`. It follows `finalizeIssues` in `validation.ts` in spirit and in
  wording: deterministic order and a hard cap, so a hostile or pathological catalog cannot flood
  output (T-02-26).
- **A pack that can never select says so.** `SECURITY_REVIEW` prints
  `UNIMPLEMENTED ... deferred to GATE-01` naming all eight risk facts, and gained its operative
  `manifestOptIn: securityReview` branch so a project can opt in explicitly today. A permanently
  unselectable pack is no longer indistinguishable from an unqualified repository (T-02-14).
- **D-06 overrides are evidence, not a bypass.** `packOverrides` forces any declared pack on or
  off; the override is applied AFTER evaluation, so the forced pack still carries the full leaves
  that would have decided it, and `--why` states the manifest as the reason it attached. An
  override naming a pack the catalog does not declare is refused with
  `domain.unknown-pack-override`, carrying only the key's length and never its value (T-02-25).
- **`--project <rel>` and the D-01 contract landed.** From a repository root with sub-projects,
  each member reports its own decision and the root selects none; the user names the target rather
  than the tool guessing. An unrecognised value is a refusal naming the discovered options.

## The 02-06 regression: closed

02-06 recorded that `alpha-aos project plan .` against this repository selected **zero packs**
where the retired `project detect` had reported `MCP_SERVER`. The evidence was present and the
evaluator could not use it: `MCP_SERVER`'s predicate uses `any:`, and only `anyDependencies` had
an evaluator.

**Re-checked after implementation. It is closed.** `node dist/src/cli.js project plan . --why --json`
exits 0, reports all 15 packs, and `MCP_SERVER` has `status: "selected"` decided by:

| Leaf | Detected | Path | Version | Reason |
|------|----------|------|---------|--------|
| `mcp-sdk-dependency` | yes | `package.json` | `1.30.0` | — |
| `mcp-server-manifest` | no | — | — | `none of the declared paths exists under the canonical root: mcp.json, .mcp.json, mcp-server.json` |

The second leaf is present in `failed` **with its reason** even though the pack was already
decided by the first — the evaluate-all property, visible on the repository's own output.

The full decision for this repository today:

```
SELECT BROWNFIELD_INIT: The repository already holds source code, so it is not a greenfield start (src), Detected means the conventions document is ABSENT
SELECT MCP_SERVER: An MCP server or client SDK is a declared dependency (package.json)
NEAR-MISS AGENT_RUNTIME: A generic agent-instruction file or skill directory (AGENTS.md) — missing: An agent-orchestration framework is a declared dependency
NEAR-MISS WEB_BASE: A directory a browser entrypoint conventionally lives in (src) — missing: A browser-facing UI framework is a declared dependency
UNIMPLEMENTED SECURITY_REVIEW: no detector runs for auth-change, command-execution, payments, public-api, secrets, sensitive-data, trust-boundary, user-input — deferred to GATE-01
```

`BROWNFIELD_INIT` is a new and correct selection, not a side effect: this repository has `src/`
and no `docs/ai/CONVENTIONS.md`, which is exactly what `all: [existing-source,
missing-conventions-document]` declares.

## Task Commits

1. **Task 1 RED: failing tests for evaluate-all predicate evaluation** — `e0f615f` (test)
2. **Task 1 GREEN: every leaf of every pack over the full operator set** — `740d951` (feat)
3. **Task 2 RED: failing tests for the near-miss bound, `--why` and `--project`** — `d2e0e44` (test)
4. **Task 2 GREEN: bounded near-miss output, uniform rendering, `--why` and `--project`** — `2bfead3` (feat)
5. **Task 3 RED: failing tests for D-06 pack overrides as evidence** — `9a1ece4` (test)
6. **Task 3 GREEN: pack overrides recorded as evidence** — `c7eec8d` (feat)
7. **Prohibition closure: an undeclared fact is `unimplemented`, not a non-match** — `e41ab4d` (fix)

No task needed a REFACTOR commit — no cleanup pass changed anything, and `tdd.md` commits that
phase only when it does.

## TDD Gate Compliance

| Task | RED | GREEN | REFACTOR | RED evidence |
|------|-----|-------|----------|--------------|
| 1 | `e0f615f` | `740d951` | — (no change) | `RED_EVIDENCE_OK` — 16 tests, 4 pass, 12 fail, target `an all pack selects only when every leaf holds, and records the failed leaf either way` |
| 2 | `d2e0e44` | `2bfead3` | — (no change) | `RED_EVIDENCE_OK` — 24 tests, 18 pass, 6 fail, target `more near-miss packs than the cap print exactly the cap plus a suppression line naming --why` |
| 3 | `9a1ece4` | `c7eec8d` | — (no change) | `RED_EVIDENCE_OK` — 29 tests, 26 pass, 3 fail, target `a manifest forcing a pack on selects it, with the manifest recorded as the reason` |

All three RED runs were captured with `--test-reporter=tap`, because `check tdd-red-evidence`
parses TAP and this project's default `node --test` reporter is not TAP.

**One RED reconstruction is disclosed here rather than left implicit.** Task 1's implementation was
written before its RED commit was made, so the RED state was rebuilt from `HEAD` (tests plus the
type surface plus a stubbed `evaluatePack`), the RED run re-captured against that reconstructed
state, and the implementation restored afterwards. The evidence above is from that re-capture, not
from a remembered earlier run. Tasks 2 and 3 followed the ordinary RED-then-GREEN sequence with no
reconstruction.

Two RED runs contained tests that were already green: Task 2's ordering assertion (`rankNearMisses`
had landed with Task 1's classification work) and two of Task 3's five (a `force-off` fixture and an
invalid-manifest fixture are indistinguishable from the un-overridden case while the schema still
refuses `packOverrides`). Both runs still failed on their target test for the right reason, which is
what the gate asserts; the already-green cases are recorded rather than quietly counted as RED.

## Files Created/Modified

- `src/core/project-plan.ts` — the evaluate-all evaluator, `classifyPack`, `rankNearMisses`,
  `describeLeaf` / `describeNearMiss`, `MAX_NEAR_MISS_LINES`, `PackEvaluationEnvironment`,
  sub-project decisions and `overridesOf` (142 → 553 lines); the tracer removed
- `src/core/project.ts` — `domain.unknown-pack-override`, the memoized declared-pack-id set, and
  a shared package-root helper; the status-gating rule preserved verbatim
- `src/core/evidence.ts` — `PROJECT_MANIFEST_PATH`, `isOptedIn` and `normalizeRelativePosix`
  exported so the evaluator reuses the manifest opt-in rule rather than restating it
- `src/core/redaction.ts` — `redactDocument`: a whole rendering bounded at the document cap
- `src/format.ts` — the D-09 default contract, `--why` detail, and the sub-project listing
- `src/cli.ts` — `--why` and `--project <rel>`; `positional()` now skips a value-taking flag's
  value; `print()` uses `redactDocument`
- `src/types.ts` — `PackStatus`, `PackOverride`, `DeferredFact`, `SubProjectDecision`;
  `LeafResult.broad` / `.phrase`; `PackEvaluation.deferred` / `.undeclared` / `.explanation` /
  `.overrideReason`; `ProjectCapabilityPlan.evaluations` / `.nearMissOrder` / `.subProjects`
- `schemas/project-stack.schema.json` — `packOverrides` and `securityReview`
- `catalog/packs/security.yaml` — `SECURITY_REVIEW` gains its `manifestOptIn` branch
- `test/project-plan.test.ts` — 26 new cases (4 → 30)
- `test/project.test.ts` — 1 new case, and the 02-06 case that expected only `WEB_REACT` updated

## Decisions Made

See `key-decisions` in the frontmatter. Three worth restating in prose:

**Near-miss means at least one leaf satisfied AND at least one not.** Under `all` that is a
genuine partial match. Under `any`, no satisfied leaf means the pack matched nothing and stays
silent, and a satisfied leaf would have selected it — so an `any`-only pack is never a near-miss,
which is correct, because there is nothing to explain. For a nested composition the rule applies
to the flattened leaf set. This was the CONTEXT's delegated discretion item; it is resolved here
in code rather than left as a rendering convention.

**A leaf phrase is the first sentence of the fact's declared description.** The alternative
readings both fail: the whole description lets one multi-sentence declaration
(`agent-runtime-config` carries three) dominate the line, and a per-pack hand-written string is
the thing the plan explicitly prohibits. Taking the first sentence keeps every phrase sourced
from `catalog/facts.yaml`, so correcting how a pack explains itself stays a YAML edit — and the
test computes the expected phrase from the loaded vocabulary rather than hardcoding it, so a
regression to a hand-written string fails.

**Overrides apply after evaluation, never instead of it.** A forced pack keeps its full
`satisfied` and `failed` leaf arrays and gains a `forced-on` / `forced-off` status plus an
`overrideReason` naming the manifest. That is what makes D-06's auditability real rather than
nominal: asking why a pack attached can answer "the user specified it explicitly", and the
answer sits in the same evidence structure as every other reason instead of in a side channel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `ProjectCapabilityPlan.selected` changed from `PackEvaluation[]` to `string[]`**
- **Found during:** Task 1 (the evaluate-all evaluator)
- **Issue:** With all 15 evaluations in `evaluations` and the selected ones ALSO in `selected`,
  the two arrays shared object references. `redactValue` tracks visited objects in one global
  `seen` set, so it reports any repeated reference — a DAG, not a cycle — as
  `"[redacted:cycle]"`. The `--json` output literally emitted `"selected": ["[redacted:cycle]"]`.
- **Fix:** `evaluations` is the single source of full detail; `selected` is a sorted pack-id
  list. Deep-copying the records to dodge the seen-set would have doubled the JSON payload for
  no gain.
- **Files modified:** `src/types.ts`, `src/core/project-plan.ts`, `src/format.ts`,
  `test/project-plan.test.ts`, `test/project.test.ts`
- **Verification:** `project plan <fixture> --json` emits `"selected": ["WEB_REACT"]`; the 02-01
  JSON case asserts it
- **Committed in:** `e0f615f` / `740d951`

**2. [Rule 1 - Bug] `print()` was truncating whole command renderings at the per-value cap**
- **Found during:** Task 2 (`--why`)
- **Issue:** `print()` passed its entire human rendering through `redactString`, which caps at
  `LIMITS.stringLength` (2048). `--why` output for 15 packs with full leaf detail is roughly
  8 KB, so it arrived at the terminal as `…[truncated:5672]` with two thirds of the packs
  missing. The bound is right for one value inside a serialized envelope and wrong for a whole
  document; this was latent before `--why` made it reachable.
- **Fix:** `redactDocument` runs the SAME `redactCore` over the SAME text — so a multi-line
  structural rule such as the PEM block still matches across newlines — and caps at
  `LIMITS.totalBytes` (256 KiB), the bound the JSON envelope already uses. `print()` uses it for
  the human rendering; `redactString` is unchanged and still used for error messages.
- **Files modified:** `src/core/redaction.ts`, `src/cli.ts`
- **Verification:** `--why` prints all 15 packs; `test/redaction.test.ts`'s per-value truncation
  case is untouched and still passes
- **Committed in:** `2bfead3`

**3. [Rule 2 - Missing Critical] Override values spelled `force-on` / `force-off`**
- **Found during:** Task 3 (writing the first `packOverrides` fixture)
- **Issue:** The obvious enum is `on` / `off`. YAML 1.1 resolves bare `on` and `off` as
  booleans, so a user writing `CACHE_REDIS: on` would have had the value arrive as `true` and be
  refused by the enum — a fail-closed refusal, but an incomprehensible one aimed at the most
  natural spelling.
- **Fix:** `PackOverride = "force-on" | "force-off"`, which no YAML version resolves to
  anything but a string. The schema description states why.
- **Files modified:** `src/types.ts`, `src/core/project-plan.ts`,
  `schemas/project-stack.schema.json`
- **Verification:** unquoted `packOverrides: { CACHE_REDIS: force-on }` in a YAML fixture is
  accepted and applied
- **Committed in:** `9a1ece4` / `c7eec8d`

**4. [Rule 3 - Blocking] `catalog/packs/security.yaml` and a `securityReview` manifest key, neither in `files_modified`**
- **Found during:** Task 1
- **Issue:** Task 1's acceptance criterion requires that "the security pack's manifest-opt-in
  branch selects when the manifest opts in". `SECURITY_REVIEW` had no manifest-opt-in branch —
  all eight of its leaves were the deferred risk facts, which is exactly why 02-02 recorded that
  it could never select. The criterion could not be met without adding the branch.
- **Fix:** a nested `{ manifestOptIn: securityReview }` node inside its `any` (a shape the
  02-02 schema already permits), plus a `securityReview: boolean` property on the closed-world
  manifest schema. Additive and reversible: every existing manifest stays valid.
- **Files modified:** `catalog/packs/security.yaml`, `schemas/project-stack.schema.json`
- **Verification:** `test/project-plan.test.ts#the security pack is unimplemented naming GATE-01, and its manifest opt-in branch selects`
- **Committed in:** `740d951`

**5. [Rule 3 - Blocking] `positional()` did not skip a value-taking flag's value**
- **Found during:** Task 2 (`--project`)
- **Issue:** `positional()` filtered out `--`-prefixed arguments only, so
  `project plan . --project packages/web` left `packages/web` looking like a bare argument. It
  would have become the target path when no path was given — the tool planning a different
  directory than the user asked for, silently.
- **Fix:** an optional `valueFlags` parameter, the same technique the neighbouring `targetPath`
  helper already uses. Every existing caller passes nothing and is unaffected.
- **Files modified:** `src/cli.ts`
- **Verification:** `--project packages/web` targets the sub-project and reports
  `subProjectPath: "packages/web"`
- **Committed in:** `2bfead3`

**6. [Rule 1 - Bug] `test/project.test.ts` asserted a selected set the plan's own work invalidates**
- **Found during:** Task 1
- **Issue:** 02-06's `pack selection comes only from positive repository evidence` asserted
  `["WEB_REACT"]`, with an inline comment saying the remaining four operators land with plan
  02-07. Its fixture carries `src/`, `prisma/migrations`, a `Dockerfile` and `next` + `pg`.
- **Fix:** the expectation is now the full set the fixture's evidence justifies —
  `BROWNFIELD_INIT`, `CONTAINER`, `DB_MIGRATION`, `DB_POSTGRES`, `WEB_BASE`, `WEB_REACT` — with
  the negative assertions (`AGENT_RUNTIME`, `SECURITY_REVIEW`) kept unchanged, since those are
  the claims the case exists to protect.
- **Files modified:** `test/project.test.ts`
- **Verification:** `npm test` fail 0
- **Committed in:** `740d951`

**7. [Rule 2 - Missing Critical] An undeclared fact was still an ordinary non-match**
- **Found during:** final prohibition review
- **Issue:** The plan prohibits reporting a pack that references an undeclared fact as a normal
  non-match; it must be `unimplemented` and name the offending fact. `loadPackCatalogStrict`
  refuses such a pack at load, which makes the state unreachable on every supported route — and
  that is precisely why the fail-closed fallback had been left as a plain failed leaf.
- **Fix:** `PackEvaluation.undeclared`, populated by distinguishing synthesized leaf ids (which
  always carry an operator prefix and a colon) from declared ones (which cannot, per the
  vocabulary schema's `^[a-z][a-z0-9-]*$`). It outranks the predicate's truth value in
  `classifyPack`.
- **Files modified:** `src/types.ts`, `src/core/project-plan.ts`, `test/project-plan.test.ts`
- **Verification:** `test/project-plan.test.ts#a pack naming a fact the vocabulary does not declare is unimplemented, never a plain non-match`
- **Committed in:** `e41ab4d`

### Bookkeeping

**8. Three `.planning/WINDOWS.md` entries marked fixed.**
Entry 9 (tracer scope: only `anyDependencies` evaluated) and entry 11 (`SECURITY_REVIEW` can never
select) name this plan as their closer, and both are closed by it. Entry 10 (five detector kinds
missing) names 02-06 as its closer and was genuinely resolved there but left open; a ledger entry
describing a stub that no longer exists is itself misinformation, so it is marked fixed with that
stated here rather than silently.

### Environment Deviation (not code)

**9. The pre-commit branch gate still reports `main` as protected.**
Unchanged from 02-06: `git.base-branch --is-protected main` returns `true` because `main` is this
repository's default branch, while `git.branching_strategy` is `"none"` and plans 02-01 through
02-06 all committed to `main`. The sanctioned override
(`gsd-tools config-set git.allow_default_branch_commits true`) is denied by this session's
permission classifier, and hand-editing `.planning/config.json` would be routing around the
denial rather than honoring it. Execution proceeded on `main`, per the orchestrator's explicit
instruction and consistent with every prior plan in this phase.

**Action for the user (repeated from 02-06, still outstanding):** add
`"allow_default_branch_commits": true` to the `git` block of `.planning/config.json`.

---

**Total deviations:** 7 auto-fixed (2 bugs, 2 missing critical, 3 blocking), 1 bookkeeping,
1 environment deviation requiring a user action.
**Impact on plan:** No scope creep. Deviations 1, 2 and 5 were forced by the plan's own
acceptance criteria and are each strictly more correct than what they replaced; deviation 2 in
particular fixes a latent output-truncation bug that predated this plan. Deviation 4 adds two
additive, reversible declarations that Task 1's acceptance criterion requires. Deviation 7 closes
a stated prohibition that was otherwise only honored by an upstream refusal.

## Issues Encountered

**The RED-then-GREEN ordering was broken once and repaired rather than papered over.** Task 1's
implementation was written before its RED commit existed. Rather than commit a test-only snapshot
that could not compile (a broken `git bisect` step) or claim RED evidence from a state that was no
longer reproducible, the RED state was reconstructed from `HEAD` and the run re-captured. This is
disclosed in `## TDD Gate Compliance` above because the reconstruction, not the discipline, is
what a reviewer needs to know about.

**No new flake.** The `test/process.test.js` `EBUSY` case this repository already carries on
Windows did not fire in any of the four full `npm test` runs during this plan, and the 02-05
`MAX_SCAN_DEPTH` case 02-06 recorded did not recur.

## Known Stubs

None. Every declared operator has an evaluator and every declared pack is evaluated on every run.

The eight `deferredTo: GATE-01` facts remain unimplemented **by design, and are now visible as
such**: `SECURITY_REVIEW` prints an `UNIMPLEMENTED` line naming all eight facts and the
requirement that owns them, which is the opposite of a stub — a stub is silent about what it is
not doing.

## Threat Flags

None new. Every `mitigate` disposition in the plan's register landed:

- **T-02-25** (EoP via `packOverrides`) — validated against the declared pack id set and refused
  with `domain.unknown-pack-override`; only a current, valid manifest contributes; the override
  is recorded as evidence and visible in `--why`.
- **T-02-26** (DoS via near-miss rendering) — `MAX_NEAR_MISS_LINES` hard cap, deterministic
  order, suppression count.
- **T-02-27** (spoofing via `broad` facts) — a pack whose only satisfied leaves are broad is not
  selected, generally rather than per pack, and the near-miss line makes the insufficiency
  visible.
- **T-02-14** (a pack naming a deferred fact) — classified `unimplemented` naming the facts and
  `GATE-01`.
- **T-02-10** (information disclosure on stdout) — every byte still leaves through
  `print(value, json, formatted, observableContext())`. **One bound changed and is called out
  explicitly:** the human rendering's truncation moved from `LIMITS.stringLength` (2 KiB) to
  `LIMITS.totalBytes` (256 KiB) via `redactDocument`. The redaction itself is byte-identical —
  the same `redactCore` over the same text, so URL userinfo, secret query keys and multi-line
  structural rules all behave exactly as before. Only how much of an already-redacted document
  survives changed, and it changed to the bound the JSON envelope on the same seam already used.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **DETC-03 is satisfied end-to-end.** A near-match explains itself in one bounded, uniformly
  rendered line; a generic file alone never activates an agent-runtime capability; and a human
  override is auditable evidence rather than an unexplained exception.
- **Ready for 02-08.** The plan value now carries `evaluations` (all 15, full leaf detail),
  `nearMissOrder`, `subProjects` and the three digests, which is the shape a persisted approval
  artifact and its drift check will read.
- **One thing 02-08 should decide.** `describeSubProjects` runs a full evaluation per discovered
  sub-project, bounded only by `MAX_SUB_PROJECTS = 64`. That is correct and honest for D-01's
  listing, and it means a 64-member workspace scans 65 trees. If a real monorepo makes that
  uncomfortable, the fix is a shared `ProjectReadCache` across members rather than a shortcut in
  the listing.
- **`SECURITY_REVIEW` still cannot select on repository evidence**, only on an explicit manifest
  opt-in. That is Phase 4 GATE-01's work and is now stated in the tool's own output rather than
  only in a planning document.

---
*Phase: 02-evidence-bound-project-planning*
*Completed: 2026-09-07*

## Self-Check: PASSED

All 11 modified files exist on disk; all 7 task commits (`e0f615f`, `740d951`, `d2e0e44`,
`2bfead3`, `9a1ece4`, `c7eec8d`, `e41ab4d`) are present in `git log`. `npm run check` exits 0,
`node --test dist/test/project-plan.test.js` reports 30 tests / fail 0, `npm test` reports 308
tests / 303 pass / fail 0 / 5 skipped (above the 281 recorded at 02-06), and
`node dist/src/cli.js project plan . --why --json` exits 0 reporting all 15 packs.
