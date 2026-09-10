---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 07
subsystem: infra
tags: [routing-contract, mcp-allowlist, capa-02, product-decision, third-party-skill-drift, blocking-human-gate]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "03-02's structural separation of observation from filtering (`allowedMcpTools` decides WHAT is permitted, the mode decides only WHETHER a call is recorded), 03-05's declared canary catalog and its prompt-hygiene rule, and 03-06's canary runtime, `McpObservation` record shape and the two doctor verbs"
provides:
  - "the recorded human decision on the CAPA-02 routing-contract reconciliation: option id `narrow`"
  - "the statement that the four-name extraction allowlist in src/core/mcp-proxy.ts does NOT change, and that PROJECT.md's bounded-extraction claim therefore stays true as written"
  - "the concrete task action plan 03-08 executes: author skills/alpha-aos-research-routing/SKILL.md as an alpha-AOS-owned instruction and record the third-party mismatch as a named finding"
  - "the explicit constraint that the reconciliation must be expressed as tool-identifier expectations, never as an argument-level expectation, because McpObservation has no argument field (T-03-52)"
affects: [03-08, capa-02, mcp-allowlist, canary-expectations, ledger-findings, ship-gate]

actuals:
  tokens: 4209
  tasks: 1
  commits: 1
plan_head_before: 76c4b493eb9a6b1570ebbf5d4efcb042615e8e09

tech-stack:
  added: []
  patterns:
    - "product-claim-preserving reconciliation: a three-document disagreement is closed in an alpha-AOS-owned document rather than by widening a policy boundary, so the narrower claim survives as a stated claim"

key-files:
  created: []
  modified: []

key-decisions:
  - "CAPA-02 routing-contract reconciliation resolved as option id `narrow`: keep the four-tool extraction allowlist, reconcile in an alpha-AOS-owned instruction, and record the mismatch as a named finding"
  - "src/core/mcp-proxy.ts's four-name allowlist is unchanged; `firecrawl_search` stays denied and the stable policy refusal stays byte-identical"
  - "PROJECT.md's Validated-list sentence about the bounded four-tool Firecrawl surface does NOT change, and neither do its two repetitions in README.md"
  - "The reconciliation is expressible only as tool-identifier expectations (expectTools / forbidTools / expectOrdered / maxDistinctServers); an argument-level expectation is not provable from an McpObservation record and must not be introduced"

patterns-established:
  - "A blocking-human gate whose answer is recorded with an explicit boundary between the developer's words and the option text's words, so a later reader can tell which is which"

requirements-completed: []

coverage:
  - id: D1
    description: "The CAPA-02 routing-contract reconciliation is a recorded human decision with a verbatim option id, not a planner default"
    requirement: "CAPA-02"
    verification:
      - kind: manual_procedural
        ref: "grep -n 'narrow' .planning/phases/03-transactional-project-packs-and-native-optional-use/03-07-SUMMARY.md — the chosen option id is recorded verbatim in `## The Decision`"
        status: pass
    human_judgment: true
    rationale: "The option id is mechanically greppable, but whether the recorded rationale honestly represents what the developer actually supplied — a selection and no prose — is a judgement only a human reading this file can make. The distinction is deliberately called out in `## The Decision`; a reader must confirm it reads as an honest record rather than as invented reasoning."
  - id: D2
    description: "This plan modified no source file: the allowlist, the catalog, the schemas and the design document are untouched"
    verification:
      - kind: other
        ref: "git status --porcelain -- src/ catalog/ schemas/ docs/ — empty output, exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Plan 03-08 can execute the `narrow` branch from this record without re-asking the question"
    requirement: "CAPA-02"
    verification: []
    human_judgment: true
    rationale: "Whether `## What Plan 03-08 Must Implement` is concrete enough to be a task action without re-opening the decision cannot be proven until 03-08 runs. A human (or 03-08's own precondition check) is the verifier."

# Metrics
duration: 9 min
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 7: CAPA-02 Routing-Contract Reconciliation Summary

**The three-way disagreement between the shipped `deep-research` skill's named tools, the four-name alpha-AOS extraction allowlist, and the routing contract in design §4.2 is resolved as option `narrow`: the allowlist does not move, the reconciliation lands in a new alpha-AOS-owned instruction, and the mismatch becomes a named ledger finding rather than a silent workaround.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-09-10T16:39:00Z
- **Completed:** 2026-09-10T16:48:21Z
- **Tasks:** 1 (one `checkpoint:decision`, `gate="blocking-human"`)
- **Files modified:** 0

## The Decision

**Chosen option id: `narrow`**

Full option name as presented: *"Keep the four-tool allowlist; reconcile in an alpha-AOS-owned instruction and record the mismatch"*.

### What the developer supplied, and what they did not

The developer **selected option `narrow`**, which is the option RESEARCH.md's assumption A6 recorded as
the researcher's recommendation.

**No additional prose rationale was supplied beyond the selection itself.** The developer wrote no
sentence explaining the choice. Nothing in this summary is a quotation, paraphrase or reconstruction of
the developer's reasoning, because there is none on record.

The plan's acceptance criteria asked for "the developer's rationale in their own words". That criterion
is recorded here as **partially unmet by fact**: the option id is recorded verbatim as required, and the
absence of accompanying prose is stated plainly rather than papered over with invented reasoning. A
future reader who wants to know *why the developer chose this* has exactly one answer available: they
selected the option below, and they did not say more.

### The reasoning attributed to the option text, not to the developer

The following are the **recorded pros of option `narrow` as written in `03-07-PLAN.md`** — the argument
the option presented to the developer. They are the option's words, not the developer's:

- PROJECT.md's bounded-extraction claim stays true as written.
- The narrowing becomes a stated product claim rather than an implementation detail, which is what
  RESEARCH.md's `## State of the Art` row (Firecrawl 3.24.0 grew to 25 tools keyless / 27 with a key,
  against an allowlist of 4) argues it now deserves to be.
- The mismatch is recorded as a named ledger finding, so a future runtime bump that changes the skill's
  text is visible instead of silent.
- No third-party bytes are touched.
- It was the researcher's recommendation.

The option also carried a recorded **con**, which is inherited by this decision and is not softened here:
the canary's success now depends on an alpha-AOS-owned instruction steering the model, which is one more
moving part between the shipped skill and the observed calls. If the model follows the third-party
skill's text in preference to that instruction, the CAPA-02 canary will report a routing finding that is
really a documentation conflict — a correct report, but one that needs reading carefully.

## Which Documents Change

Three documents were in disagreement. This is what happens to each.

| Document | Changes as a result? | Detail |
|---|---|---|
| The extraction allowlist — `src/core/mcp-proxy.ts:26-31` (`firecrawlTools`) | **No** | Stays exactly `firecrawl_scrape`, `firecrawl_map`, `firecrawl_crawl`, `firecrawl_check_crawl_status`. `firecrawl_search` remains denied and the stable refusal `MCP tool is not allowed by alpha-aos policy: firecrawl_search` stays byte-identical. |
| An alpha-AOS-owned instruction | **Yes — a new file** | `skills/alpha-aos-research-routing/SKILL.md` is created by plan 03-08. It does not exist today. |
| PROJECT.md's Validated list | **No** | The bounded-extraction claim stays true as written. See below. |
| The third-party skill — `ecc-universal@2.2.0` `skills/deep-research/SKILL.md` | **No — forbidden** | CONTEXT.md D-07 and design §5.3 forbid modifying the bytes, and `PLAN_RENDERER_ID = "ecc-skill/identity"` means target hash equals source hash, so a modified skill would fail its own exact-hash contract. This was never in the option set. |
| The routing contract — `docs/alpha-vibe-stack-codex.md` §4.2 | **No** | §4.2 already states discovery-then-extraction ("Exa부터 시작한다" → "본문 전체나 사이트 구조가 필요한 URL만 Firecrawl로 넘긴다"). `narrow` reconciles *toward* this document; it is the fixed point, not a thing being edited. |
| `catalog/canaries.yaml` | **Yes — finalised, not redirected** | Plan 03-08 finalises the expectation lists against measured tool identifiers. The shipped declaration is already consistent with `narrow` (`RESEARCH_MULTI_SOURCE` expects `web_search_exa` → `firecrawl_scrape`, ordered, and explicitly carries `forbidTools: [firecrawl_search]`). |

### The PROJECT.md sentence that does NOT change

Recorded for the ledger, because the alternative option `admit-search` would have changed it and a future
reader needs to know exactly what was preserved and where it is repeated.

The sentence is **`.planning/PROJECT.md:21`**:

> `- ✓ Context7, Exa, and a bounded four-tool Firecrawl surface can be rendered into native user-scope configuration for all five logical harness targets — existing`

It is repeated in two further places, both of which likewise stay unchanged:

- **`README.md:5`** — "…registers Context7, Exa, and a four-tool Firecrawl surface."
- **`README.md:113`** — "User-scope Context7, Exa, and the four-tool filtered Firecrawl proxy are synchronized to all five logical harness targets… and native four-tool discovery on Hermes…"

Two in-repository assertions already hold this claim mechanically and continue to hold it under `narrow`:
`03-02-PLAN.md`'s T-03-12 mitigation and `03-02-SUMMARY.md`'s coverage entry D-, both of which assert
firecrawl's four-tool set is **identical in both proxy modes** and that a denied tool still produces the
byte-identical policy refusal.

## What Plan 03-08 Must Implement

This is the `narrow` branch of 03-08 Task 1, stated concretely enough to execute without re-asking. Do
not blend branches; the `admit-search` and `both-recorded` branches of that task do not run.

1. **Leave `src/core/mcp-proxy.ts` untouched.** The `firecrawlTools` set keeps exactly its four names.
   No PROJECT.md or README.md edit follows from this decision.
2. **Author `skills/alpha-aos-research-routing/SKILL.md`** as a new alpha-AOS-owned instruction, following
   the front-matter and layout shape of the existing owned skill `skills/alpha-aos-ship/SKILL.md`. Its
   content states the design §4.2 routing contract **in terms of the tool identifiers the pinned servers
   actually expose**, as measured in RESEARCH.md Pitfall 1:
   - discovery — `web_search_exa` on the discovery server (`exa-mcp-server@3.4.1`, which exposes exactly
     `web_search_exa` and `web_fetch_exa`);
   - bounded extraction — `firecrawl_scrape` on the extraction server (`firecrawl-mcp@3.24.0`) for a URL
     already in hand;
   - it must **not** name `firecrawl_search`, `web_search_advanced_exa` or `crawling_exa`. The first is
     denied by policy; the latter two do not exist on the pinned server.
3. **Record the mismatch as a named finding** with a stable upper-snake code, carrying the pinned runtime
   version (`ecc-universal@2.2.0`), so a later ECC bump that changes the third-party text is visible
   rather than silent. This is the half of `narrow` that makes the decision diagnosable later; a finding
   with no version in it does not do that job.
4. **Finalise `catalog/canaries.yaml`** expectation lists against measured identifiers, and add the named
   test in `test/mcp-proxy.test.ts` asserting the allowlist and the declared research expectations agree,
   so a one-sided future edit is red.

### Constraints this decision carries into 03-08

These are not new decisions; they are facts from earlier waves that bound how the `narrow` branch can be
implemented, recorded here so 03-08 does not rediscover them.

- **The reconciliation must be expressed as tool-identifier expectations, never as an argument-level
  expectation.** `McpObservation` has **no argument field, by design (T-03-52)**, so a declared argument
  pattern cannot be proven from a record — 03-06 reports such patterns as `uncheckedArgumentPatterns`
  with the reason rather than counting them satisfied. Everything `narrow` needs *is* expressible in the
  checkable vocabulary: `expectTools`, `expectOrdered`, `forbidTools`, `maxDistinctServers`. If a future
  reading of `narrow` implies checking *which tool was called with what argument*, that check is not
  available from the current record shape and would require a schema change, not a canary edit. (The
  existing `expectArgumentPatterns` on the CAPA-01 `DOCUMENTATION_VERSION_SCOPED` canary is a separate,
  pre-existing CAPA-01 concern and is untouched by this decision.)
- **An alpha-AOS-owned instruction cannot widen the allowlist, and must not be written as though it
  could.** 03-02 made observation and filtering structurally separate — the mode decides only WHETHER a
  call is recorded, `allowedMcpTools` decides only WHAT is permitted — and that separation is a tested
  property, not a comment. The owned instruction steers the *model*; the proxy still refuses
  `firecrawl_search` if the model calls it anyway. That refusal remains the expected, correct outcome of
  a model that follows the third-party text.
- **Only `claude` can host the resulting canary.** Per 03-06, `--mcp-config` + `--strict-mcp-config`
  exist on `claude` and nowhere else; every other harness gets a blocked launch naming that reason. A
  canary `claude` launch also suppresses the project's own `.mcp.json`, without which a tool call could
  cross unfronted. `catalog/canaries.yaml` already declares `harnesses: [claude]` for both CAPA-02
  canaries, so no change is needed — but the new owned skill must be reachable in that isolated runtime
  for the steering to have any effect at all, and 03-08 should confirm that rather than assume it.
- **The verb names are settled.** 03-06 shipped `alpha-aos doctor --discovery` (free) and
  `alpha-aos doctor --canary` (paid, cost announced before spend); `assertCanaryContext`'s refusal
  message names the string `alpha-aos doctor --canary`. Any instruction or documentation 03-08 writes
  should use those two spellings.

## Task Commits

This plan produced no production commits. It runs nothing and modifies no source file — that is the
plan's own stated shape ("This plan produces no source symbols and no new files"), not an omission.

**Plan metadata:** see the `docs(03-07)` commit (this SUMMARY, STATE.md, ROADMAP.md).

## Files Created/Modified

None. `files_modified` in the plan frontmatter is empty and stays empty.

Verified: `git status --porcelain -- src/ catalog/ schemas/ docs/` → empty output, exit 0.

## Decisions Made

- **`narrow`** — recorded above in full, including the honest boundary between the developer's selection
  and the option text's own stated pros.

## Deviations from Plan

None - plan executed exactly as written.

One acceptance criterion is recorded as **met-with-a-stated-fact rather than fully satisfiable**: "the
developer's rationale in their own words" could not be recorded because no prose rationale was supplied.
This is documented in `## The Decision` rather than resolved by fabricating one. It is not a deviation
from the plan's instructions — it is a fact about the response the gate received.

## Issues Encountered

None.

## Known Stubs

None. This plan created no code and no placeholder.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-08's `<precondition>` is satisfied: `03-07-SUMMARY.md` exists and records a chosen option id of
  `narrow` together with what that plan must implement.
- The open risk carried forward is the one the option itself named: the owned instruction is a steering
  layer, and a model that prefers the third-party skill's text will produce a CAPA-02 finding that is a
  documentation conflict rather than a routing failure. 03-08's report should be read with that in mind.

## Self-Check: PASSED

- `key-files.created` / `key-files.modified` are both empty, and `git status --porcelain -- src/ catalog/ schemas/ docs/` returns empty — the "no source file modified" claim is verified, not asserted.
- This SUMMARY exists on disk at the declared path.
- `git rev-list --count 76c4b493..HEAD` = 1, matching `actuals.commits: 1` — the single `docs(03-07)` metadata commit, which is the only commit this plan produces.
- `.planning/ROADMAP.md` is present in that commit's diff, with `03-07-PLAN.md` flipped to `[x]` and the phase row advanced to 7/12.
- `CAPA-02` was deliberately NOT marked complete: `requirements.ready-ids` reports 0/1 ready because plan 03-08 also declares it and has no SUMMARY yet.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*
