---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 08
subsystem: infra
tags: [routing-contract, owned-skill, mcp-observation, ordered-subsequence, fan-out-count, capability-ledger, identifier-shape, capa-01, capa-02]

# Dependency graph
requires:
  - phase: 03-transactional-project-packs-and-native-optional-use
    provides: "03-07's recorded `narrow` decision, 03-06's canary runtime / McpObservation / two doctor verbs, 03-05's declared canary catalog and prompt-hygiene rule, 03-03's capability ledger and pairEvidence, 03-02's observe/filter split"
provides:
  - "skills/alpha-aos-research-routing/SKILL.md — the alpha-AOS-owned statement of the design 4.2 routing contract, in the tool identifiers the pinned servers actually publish"
  - "ECC_RESEARCH_ROUTING_CONTRACT_MISMATCH — the named finding carrying the pinned runtime ecc-universal@2.2.0, surfaced by runDoctor"
  - "MEASURED_UPSTREAM_TOOLS — the live tools/list surfaces, so a canary expectation is checked against a measurement rather than a document"
  - "matchExpectations / ExpectationMatch — the ONE ordered-subsequence matcher, which decideInvocation now computes its verdict from"
  - "countDistinctServers — the fan-out judgement as a count of distinct servers, collapsing repeated calls to one server"
  - "McpObservation.identifierShape — exactly one new metadata field, a two-value classification and never any part of the identifier"
  - "upsertProof — one ledger row per project/harness/capability/polarity, with the replaced row's exact harness version retained for audit"
  - "the canary runtime materializes the owned instruction into the config root its own launch spec points at"
affects: [capa-01, capa-02, canary-runtime, capability-ledger, ship-gate, cross-os-matrix, phase-04]

actuals:
  tokens: 40865
  tasks: 3
  commits: 6
plan_head_before: ef2d592cbb03968a19ae17aa60e716044d7c9171

tech-stack:
  added: []
  patterns:
    - "measured-not-documented: a declared expectation is cross-checked against a transcribed live tools/list, never against prose describing the server"
    - "one matcher, two consumers: decideInvocation computes from matchExpectations rather than from a second copy of the rules"
    - "classification-not-channel: a record gains one closed, two-valued classification computed and discarded in the proxy frame, rather than an argument field"
    - "identity includes polarity: a ledger row is keyed by project/harness/capability/polarity, because a positive and its negative are two rows of one evidence unit"
    - "round-trip-or-it-did-not-ship: a document a writer produces is asserted readable by the same reader"

key-files:
  created:
    - skills/alpha-aos-research-routing/SKILL.md
  modified:
    - src/core/mcp-proxy.ts
    - src/core/canary.ts
    - src/core/capability-ledger.ts
    - src/core/doctor.ts
    - src/cli.ts
    - schemas/capability-ledger.schema.json
    - catalog/canaries.yaml
    - test/mcp-proxy.test.ts
    - test/canary.test.ts
    - test/capability-ledger.test.ts

key-decisions:
  - "The `narrow` branch ran, and only it: the four-name extraction allowlist is unchanged, PROJECT.md:21 and its two README.md repetitions are untouched, and no third-party byte was edited"
  - "The owned instruction is materialized INTO the canary runtime's own config root. Confirmed rather than assumed as 03-07 asked, and the confirmation was negative: project-only isolation points claude at a CLAUDE_CONFIG_DIR inside the runtime, so a user-scope owned skill is invisible to the run it exists to steer"
  - "McpObservation gained exactly one field, identifierShape, holding version-scoped|unscoped. T-03-52 is re-argued rather than waived: classification happens in the proxy frame and the value is discarded there, the reader is closed against the two declared members, and a pattern no recorded shape decides is still reported UNCHECKED"
  - "Expectations are matched as an ordered SUBSEQUENCE, not a set and not a contiguous run: CAPA-02's claim is an ordering claim, and a correct route may make calls the declaration says nothing about between its legs"
  - "countDistinctServers keys on server id alone. The discovery server ships its own fetch, so a summing count would report this phase's own recommended routing as fan-out"
  - "A ledger row's identity includes POLARITY. Without it a negative control would evict its own positive and D-14's evidence unit could never be assembled"
  - "CAPA-01 and CAPA-02 are NOT marked complete. The machinery is proven end to end on real servers; what is not proven is that a MODEL selected the calls, and that needs the paid turn this executor did not spend unasked"

patterns-established:
  - "Measured-not-documented: expectations are checked against a transcribed live tools/list"
  - "One matcher, two consumers"
  - "Classification-not-channel for observation metadata"
  - "Row identity includes polarity"
  - "Round-trip assertion: a writer's document must be readable by its own reader"

requirements-completed: []

coverage:
  - id: D1
    description: "The `narrow` decision is implemented in exactly the recorded direction: the four-name extraction allowlist does not move and PROJECT.md's bounded-extraction claim stays true as written"
    requirement: "CAPA-02"
    verification:
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the extraction allowlist is exactly the four names the narrow decision preserved"
        status: pass
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the extraction allowlist and the declared research expectations agree"
        status: pass
      - kind: integration
        ref: "live on this host: alpha-aos mcp-proxy firecrawl -> tools/list returned exactly firecrawl_check_crawl_status, firecrawl_crawl, firecrawl_map, firecrawl_scrape in 2904ms"
        status: pass
      - kind: other
        ref: "git diff ef2d592..HEAD -- .planning/PROJECT.md README.md src/core/mcp-proxy.ts (firecrawlTools block) — the allowlist set and both claim sentences are unchanged"
        status: pass
    human_judgment: false
  - id: D2
    description: "The reconciliation lands in an alpha-AOS-owned instruction that names the identifiers the pinned servers publish and none of the three the third-party text got wrong"
    requirement: "CAPA-02"
    verification:
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the alpha-AOS-owned routing instruction names the published tools and none of the three that disagree"
        status: pass
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the pinned third-party research instruction's bytes are untouched by this reconciliation"
        status: pass
    human_judgment: true
    rationale: "The mechanical half — front matter present, the two published identifiers named, the three disputed ones absent, third-party bytes untouched — is asserted. Whether the instruction's PROSE would actually steer a model away from the shipped third-party text is the option's own recorded con, and it cannot be settled by a test. Only the paid canary in D7 can answer it, and it has not been run."
  - id: D3
    description: "The mismatch is recorded as a named finding carrying the pinned runtime version, and is printed rather than merely declared"
    verification:
      - kind: unit
        ref: "test/mcp-proxy.test.ts#the recorded routing-contract finding carries the pinned runtime version and a stable code"
        status: pass
      - kind: other
        ref: "src/core/doctor.ts pushes ROUTING_CONTRACT_MISMATCH.code as an info-level finding, so `alpha-aos doctor` prints it"
        status: pass
    human_judgment: false
  - id: D4
    description: "The verdict logic is order-sensitive and provable offline: seven declared behaviours, all driven from synthetic observation lists"
    requirement: "CAPA-02"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#expectations are matched as an ordered sequence, so extraction-before-discovery is a different verdict from discovery-then-extraction"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the distinct-server boundary passes at exactly the declared maximum and fails at one past it"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#two calls to one research server count as one touch and two calls to two servers count as two"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a forbidden tool anywhere in the observation list is a finding naming that tool, even when the expectations matched"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a discovery leg that returned zero results is unverified with its reason and carries no invocation record for the leg that never ran"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an empty observation list yields the unverified axis with the empty oracle output fingerprinted, never discovered"
        status: pass
    human_judgment: false
  - id: D5
    description: "The observation record carries the identifier's SHAPE and never the identifier, proven on a real call through a real observing proxy"
    requirement: "CAPA-01"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a version-scoped identifier's full value is absent from the serialized observation record"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a reader skips an observation line whose identifier shape is not one this repository declared"
        status: pass
      - kind: integration
        ref: "test/mcp-proxy.test.ts#an observed call records the identifier's SHAPE and never the identifier itself"
        status: pass
      - kind: integration
        ref: "live on this host against @upstash/context7-mcp@4.0.4 through alpha-aos mcp-proxy --observe: the query-docs record carries identifierShape version-scoped and the observation file contains neither /vercel/next.js/v16.2.2 nor next.js (transcribed verbatim below)"
        status: pass
    human_judgment: false
  - id: D6
    description: "One ledger row per project/harness/capability/polarity, with the replaced row's exact harness version retained for audit"
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a second proof for one project-harness-capability triple replaces the first and retains the replaced exact harness version"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a replaced proof's superseded versions accumulate rather than overwrite, and null exact versions are not recorded"
        status: pass
      - kind: unit
        ref: "test/capability-ledger.test.ts#a proof for a harness that printed no version line survives the write-then-read round trip"
        status: pass
      - kind: integration
        ref: "live on this host: three consecutive `alpha-aos doctor --discovery .` runs left 8 rows on disk, the third reporting { recorded: 8, replaced: 8 }"
        status: pass
    human_judgment: false
  - id: D7
    description: "CAPA-01 and CAPA-02 proven by a paid canary: a model, given an ordinary prompt naming no tool, natively selects the capability and the observation front records the call"
    requirement: "CAPA-01"
    verification: []
    human_judgment: true
    rationale: "NOT RUN. The precondition is MET on this host — measured, not assumed: claude 2.1.267 authenticated, EXA_API_KEY set, all three pinned servers answering a live tools listing through `alpha-aos mcp-proxy`, and probeReadiness returning ready with no blocked reason for all three declarations. Everything except the model turn is proven live, including the observation front recording real calls against the real pinned servers. The one thing not demonstrated is a run that spends real money: the orchestrator's instruction for this run was explicitly not to spend the user's money unasked, and 03-RESEARCH.md Pitfall 10 measured roughly $0.13 a run. A human must run `node dist/src/cli.js doctor --canary . --json` (the announcement it prints first is transcribed below) and confirm the recorded axes."

# Metrics
duration: 60 min
completed: 2026-09-10
status: complete
---

# Phase 3 Plan 8: The Routing-Contract Decision, the Ordered Matcher, and the Recorded Proofs Summary

**The `narrow` decision is implemented exactly as recorded — the four-name extraction allowlist does not move, the reconciliation lands in a new alpha-AOS-owned instruction that the canary runtime now actually carries, and the mismatch is a named finding pinned to `ecc-universal@2.2.0`; the verdict logic became one ordered-subsequence matcher with a distinct-server count and a shape-only identifier classification that closes CAPA-01's structural gap on a real call; and three bugs that would have made green output meaningless were found by refusing to accept a passing check without asking what it could fail on.**

## Performance

- **Duration:** ~60 min (reconstructed from file and commit timestamps; no stopwatch was started at dispatch)
- **Started:** 2026-09-10T16:52:00Z (approx.)
- **Completed:** 2026-09-10T17:52:00Z
- **Tasks:** 3
- **Files modified:** 11 (1 created, 10 modified)

## Accomplishments

- **The `narrow` branch ran, and only it.** `src/core/mcp-proxy.ts`'s `firecrawlTools` is byte-for-byte what it was; `PROJECT.md:21`, `README.md:5` and `README.md:113` are untouched; no third-party byte was edited. Each of those is asserted by a named test rather than claimed, and a mutation run confirmed the tests go red when the allowlist is widened by one name.
- **The owned instruction is reachable, which it would not have been.** 03-07 asked 03-08 to confirm rather than assume that a new owned skill can reach the isolated canary runtime. The confirmation was negative: `createCanaryLaunchSpec` uses `project-only` isolation, which sets `CLAUDE_CONFIG_DIR` to a directory *inside* the runtime, so a user-scope skill at `~/.claude/skills` is invisible to the very run it exists to steer. `createCanaryRuntime` now copies the instruction byte-for-byte into that config root, declares the file, and REFUSES to create a runtime whose owned instruction is missing.
- **The mismatch is a printed, versioned finding.** `ECC_RESEARCH_ROUTING_CONTRACT_MISMATCH` carries `ecc-universal@2.2.0`, the two names no pinned server publishes, the one name policy denies, and the document that reconciles them. `runDoctor` emits it at `info`. A test asserts the denied names really are denied and the unpublished names really are absent from the measured surfaces, so the finding cannot drift into describing something that is no longer true.
- **Expectations are now checked against a measurement.** `MEASURED_UPSTREAM_TOOLS` transcribes the live `tools/list` results. A named test asserts every declared expectation names a tool in that table, and a second asserts the proxy test fixture agrees with it — so the fixture cannot drift into checking alpha-AOS against alpha-AOS's own idea of the upstream.
- **One matcher, and it is order-sensitive.** `matchExpectations` matches an ordered subsequence; `decideInvocation` computes from it rather than from a second copy of the rules. A named test drives the SAME two calls in both orders and asserts the verdicts differ.
- **CAPA-01's structural gap is closed on a real call.** 03-06 recorded `uncheckedArgumentPatterns` as "a real gap in CAPA-01's structural proof [that] a later plan must close or narrow". `McpObservation` gained exactly one field holding a two-value classification, and a live call to `@upstash/context7-mcp@4.0.4` through `alpha-aos mcp-proxy --observe` recorded `identifierShape: "version-scoped"` with no part of the identifier anywhere in the file.
- **Three bugs found by asking what a green check could fail on.** A connected MCP server that read as `unknown`, a ledger the discovery sweep wrote and then refused, and a policy refusal recorded exactly as designed. Details under Deviations.

## Task Commits

1. **Task 1: Implement the recorded routing-contract decision** — `b25ec26` (feat)
2. **Task 2: The ordered-sequence matcher, the fan-out judgement, and their offline tests** — `c8ef633` (test, RED) → `bf80939` (feat, GREEN)
3. **Task 3: Run both canaries on the pass-bar harness and record the proofs** — `19d1eac` (fix) and `0326c2f` (fix)

**Plan metadata:** the `docs(03-08)` commit carrying this file, `.planning/STATE.md` and `.planning/ROADMAP.md`. Named rather than hashed: it is the commit this sentence is inside.

_Task 2 was a TDD task; RED and GREEN are separate commits. No REFACTOR commit — see TDD Gate Compliance below._

## TDD Gate Compliance

| Gate | Commit | Evidence |
|---|---|---|
| RED | `c8ef633` `test(03-08)` | 56 discovered, 42 pass, 14 fail — every failure on an assertion for the planned behaviour, against compiling stubs. `gsd-tools check tdd-red-evidence` returned **`RED_EVIDENCE_OK` / `target_test_failed`** for the target test "a documentation pair whose query carried a version-scoped identifier matches, and the same pair without one does not". |
| GREEN | `bf80939` `feat(03-08)` | `dist/test/canary.test.js` 56 tests, fail 0. Full suite 612 tests, fail 0. |
| REFACTOR | — | Not needed. `decideInvocation`'s delegation to the one matcher was part of the GREEN design rather than a cleanup pass, so there was no separate change to commit (per the cycle's "only commit if changes made"). |

No gate violations.

**Two assertions were added AFTER the RED, and are recorded as regression guards rather than counted as RED behaviours:** `test/mcp-proxy.test.ts#an observed call records the identifier's SHAPE and never the identifier itself` and its unscoped negative control. They exercise the same classification end to end through a real proxy child, which the seven declared behaviours deliberately do not (they are synthetic so they run on a CI leg with no network).

## Files Created/Modified

- `skills/alpha-aos-research-routing/SKILL.md` — **new.** The alpha-AOS-owned statement of the design §4.2 routing contract: `web_search_exa` for discovery on the discovery server, `firecrawl_scrape` for bounded extraction of a URL already in hand, a note that the discovery server's own fetch makes a single-server run correct, and an explicit statement that the instruction steers a model and cannot widen what the proxy permits.
- `src/core/mcp-proxy.ts` — `MEASURED_UPSTREAM_TOOLS` and `MeasuredToolSurface`; `ROUTING_CONTRACT_MISMATCH` + its stable code + `RESEARCH_ROUTING_INSTRUCTION_ID`/`_SOURCE`; `IdentifierShape`, `identifierShapeOf`, `classifiedIdentifierArgument`, `VERSION_SCOPED_IDENTIFIER_PATTERN`; `McpObservation.identifierShape` with the serializer, the closed reader arm, and the proxy-frame classification. **The allowlist is unchanged.**
- `src/core/canary.ts` — `ExpectationMatch`, `matchExpectations`, `countDistinctServers`, `isOrderedSubsequence`, `shapeDecides`; `decideInvocation` rewritten to delegate; `InvocationVerdict` gained the satisfied/unsatisfied pattern lists; `CANARY_INSTRUCTION_ROOT` / `CANARY_OWNED_INSTRUCTIONS` and the runtime materialization + refusal; `CONNECTION_MARKERS` repaired.
- `src/core/capability-ledger.ts` — `proofKey`, `CapabilityProofUpsert`, `upsertProof`; `CapabilityProof.supersededHarnessVersions`.
- `src/core/doctor.ts` — prints the routing-contract finding at `info`.
- `src/cli.ts` — `appendCapabilityProofs` now upserts rather than appends and reports `replaced`.
- `schemas/capability-ledger.schema.json` — `supersededHarnessVersions` added; `harnessVersion.raw`'s `minLength: 1` removed with the reason recorded in its description.
- `catalog/canaries.yaml` — a header comment recording that the expectation lists are final, what they were checked against, and which decision produced them. **No prompt and no expectation changed.**
- `test/mcp-proxy.test.ts` — 9 new assertions.
- `test/canary.test.ts` — 17 new assertions.
- `test/capability-ledger.test.ts` — 1 new assertion (the round trip).

## Transcribed Evidence — measured on this host, 2026-09-10/11

Task 3 requires every number transcribed, from the runs that passed as well as the ones that did not.

### Precondition, evaluated read-only before anything ran

| Clause | Measured |
|---|---|
| Canary harness installed and authenticated | `claude --version` → `2.1.267 (Claude Code)`; `claude mcp list` exit 0, health checks executed |
| Discovery server credential set | `EXA_API_KEY` **set** (presence only; no value was read or printed) |
| Three pinned servers answer a tools listing **through `alpha-aos mcp-proxy`** | `context7`: 2 tools in **2639 ms** → `query-docs, resolve-library-id`. `exa`: 2 tools in **2236 ms** → `web_fetch_exa, web_search_exa`. `firecrawl`: 4 tools in **2904 ms** → `firecrawl_check_crawl_status, firecrawl_crawl, firecrawl_map, firecrawl_scrape`. None is the ~200 ms signature of silently taking an `unsupported` branch. |
| Readiness probe ready for both declarations | `DOCUMENTATION_VERSION_SCOPED` ready=**true**, blocked=[]. `RESEARCH_MULTI_SOURCE` ready=**true**, blocked=[]. `ORDINARY_LOOKUP_CONTROL` ready=**true**, blocked=[]. Required servers observed **connected** (after the deviation-1 repair; before it, all three read `unknown`). |

**The precondition is MET.** That is recorded plainly because the paid runs were nevertheless not made, and a reader deserves to know the reason was a spending decision and not a missing prerequisite.

### The live tools listing that the `narrow` decision rests on

- `exa-mcp-server@3.4.1` publishes **exactly** `web_search_exa`, `web_fetch_exa`. The third-party text's `web_search_advanced_exa` and `crawling_exa` **do not exist** — confirmed live, not inherited from RESEARCH.md.
- `firecrawl-mcp@3.24.0` **through the alpha-AOS proxy** publishes exactly the four allowlisted names. `firecrawl_search` is filtered out of the listing.

### The observation seam, driven end to end against the real pinned servers

Calls made by a one-off script, **not** by a model — so this is a machinery check and **nothing here was written to the capability ledger**. Verbatim observation file:

```
{"server":"context7","tool":"resolve-library-id","at":"2026-09-10T17:40:37.450Z","upstreamVersion":"4.0.4","outcome":"ok"}
{"server":"context7","tool":"query-docs","at":"2026-09-10T17:40:39.962Z","upstreamVersion":"4.0.4","outcome":"ok","identifierShape":"version-scoped"}
{"server":"firecrawl","tool":"firecrawl_search","at":"2026-09-10T17:40:44.840Z","upstreamVersion":"3.24.0","outcome":"denied"}
```

- **Observed tool-call sequence, in order:** `resolve-library-id` → `query-docs` → `firecrawl_search`.
- **Distinct-server count:** 2 over all records; 1 over the context7 records the documentation declaration is scored against.
- `firecrawl_search` was refused with the byte-identical policy refusal `MCP tool is not allowed by alpha-aos policy: firecrawl_search` **and recorded as `denied`** — the `narrow` decision's predicted behaviour, observed rather than argued.
- The identifier `/vercel/next.js/v16.2.2` appears nowhere in the file; the classification does.
- `matchExpectations` against the **shipped** `DOCUMENTATION_VERSION_SCOPED` declaration returned: `matched: [resolve-library-id, query-docs]`, `missing: []`, `forbiddenSeen: []`, `ordered: true`, `distinctServers: 1`, `maxDistinctServers: 1`, `withinServerBudget: true`, `satisfiedArgumentPatterns: [query-docs.libraryId]`, `unsatisfiedArgumentPatterns: []`, **`uncheckedArgumentPatterns: []`**, `observationCount: 2`, `held: true`, `reasons: []`.

That empty `uncheckedArgumentPatterns` is the closure of the gap 03-06 recorded. **It is not a CAPA-01 proof**, because a script made the calls.

### The free discovery sweep

`node dist/src/cli.js doctor --discovery .` — **exit 0**, run three times consecutively.

| Capability | Harness | Evidence | Native use | Recorded reason |
|---|---|---|---|---|
| BROWNFIELD_INIT | claude | — | unverified | driving claude spends a model turn, and this sweep spends nothing |
| BROWNFIELD_INIT | codex | COMPLETE | unverified | — |
| BROWNFIELD_INIT | pi | COMPLETE | unverified | — |
| BROWNFIELD_INIT | hermes | — | unverified | no discovery oracle is defined for hermes |
| MCP_SERVER | claude | — | unverified | driving claude spends a model turn, and this sweep spends nothing |
| MCP_SERVER | codex | COMPLETE | unverified | — |
| MCP_SERVER | pi | COMPLETE | unverified | — |
| MCP_SERVER | hermes | — | unverified | no discovery oracle is defined for hermes |

Ledger after the third run: `{ status: "written", recorded: 8, replaced: 8 }`, **8 rows on disk**. Before this plan the same three runs would have left 24. Every row's `harnessVersion.exact` is `null` with `raw: ""` — `probedHarnessVersions` could not read a version line for codex or pi on this host, which is a recorded absence and is exactly the state that used to make the file unreadable.

### The paid canaries — announced, not run

`selectCanaries` + `canaryCostLines` were evaluated directly (both pure, both free) to obtain the announcement the paid command prints **before** it spends anything:

```
This run would drive 3 canary/harness pair(s): 3 spend a model turn, 0 do not.
  SPENDS DOCUMENTATION_VERSION_SCOPED on claude
  SPENDS RESEARCH_MULTI_SOURCE on claude
  SPENDS ORDINARY_LOOKUP_CONTROL on claude
```

| Run | Harness + exact version | Observed sequence | Distinct servers | Resolved axis | Blocked code / variable | Provider / model | Cost |
|---|---|---|---|---|---|---|---|
| DOCUMENTATION_VERSION_SCOPED | claude 2.1.267 | — none; never launched | — | **unverified** — not attempted | none (readiness ready=true, blocked=[]) | not measurable without a run: `claude` publishes no free provider-readiness command, and the model a run would use is stated only in that run's own `init` event | not spent |
| RESEARCH_MULTI_SOURCE | claude 2.1.267 | — none; never launched | — | **unverified** — not attempted | none (readiness ready=true, blocked=[]) | as above | not spent |
| ORDINARY_LOOKUP_CONTROL | claude 2.1.267 | — none; never launched | — | **unverified** — not attempted | none (readiness ready=true, blocked=[]) | as above | not spent |

`unverified` and not `blocked` is deliberate and is D-12 applied literally: `blocked` means the reason is known and actionable by the user, `unverified` means **not attempted**. Nothing was preventing these runs.

**Exact command a human should run to close this:**

```
node dist/src/cli.js doctor --canary . --json
```

It announces the three cost lines above before it starts, writes one ledger row per completed run, and exits 2 if any run reports `blocked`. 03-RESEARCH.md Pitfall 10 measured a bare `claude -p` on this host at `$0.13491` / `$0.109881` / `$0.11592`, so the three runs are roughly $0.35. Per-capability: `--capability DOCUMENTATION_VERSION_SCOPED`, `--capability RESEARCH_MULTI_SOURCE`, `--capability ORDINARY_LOOKUP_CONTROL`.

**No prompt was reworded.** `git diff -- catalog/canaries.yaml` is empty for the whole of Task 3, and the only change this plan made to that file at all was a header comment in Task 1.

## Decisions Made

See `key-decisions` in the frontmatter. The three that most shape what comes next:

1. **The owned instruction lives inside the canary runtime.** Anything else makes the `narrow` decision's steering half provably inert, because `project-only` isolation hides user-scope skills.
2. **One field, closed at two values, classified in the proxy frame.** This is how CAPA-01's structural claim became checkable without opening the argument channel T-03-52 exists to keep shut. If a future declaration wants a different argument pattern, it stays UNCHECKED until someone adds a row to `CLASSIFIED_IDENTIFIER_ARGUMENTS` and re-argues the reasoning — which is the point.
3. **A ledger row's identity includes polarity.** The plan's Test 7 wording says "project-harness-capability triple"; implemented as the triple **plus polarity**, because the bare triple would let a negative control evict its own positive and make D-14's evidence unit unassemblable. Recorded as a deviation below rather than quietly reinterpreted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] A connected MCP server read as `unknown`, so the connection gate could not fail for the reason it claims to test**

- **Found during:** Task 3, evaluating the precondition read-only
- **Issue:** `claude mcp list` prints `✔ Connected` in a terminal and `√ Connected` — U+221A, the Windows console fallback — when alpha-AOS launches the same command through the bounded process adapter. Only the terminal spelling was in `CONNECTION_MARKERS`. Measured before the fix: `claude mcp list` reported context7, exa and firecrawl all connected, while `probeReadiness` recorded all three as `unknown`. Because `MCP_SERVER_NOT_CONNECTED` fires only on `failed`/`needs-auth`, the `connected` state was not merely imprecise — it was **unobservable**, so the catalog's `requiresMcpServers` rule could not distinguish a connected server from one nobody knows about, and every ledger and report rendered the wrong connection states on Windows.
- **Fix:** both glyph spellings declared for all three states, and the state words matched unanchored so an unpredicted glyph degrades to reading the sentence. `failed` and `connection closed` are still tested first because "Failed to connect" contains the word the success state is named after.
- **Files modified:** `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** the EXACT non-TTY stdout from this host is pinned as a fixture; a positive control asserts a required server needing authentication still blocks, and that "Failed to connect" is still read as failed.
- **Committed in:** `19d1eac`

**2. [Rule 3 — Blocking] `doctor --discovery` wrote a ledger its own reader then refused**

- **Found during:** Task 3, recording the evidence
- **Issue:** The sweep wrote eight proofs and exited 0; the next run refused the file with eight `schema.minLength@/proofs/N/harnessVersion/raw` issues and kept refusing. `probedHarnessVersions` records a harness it could not version as `harnessMinorKey("")` = `{exact: null, minorKey: null, raw: ""}`, and the schema required `raw` non-empty — so that recorded-absence state was writable but unreadable. `doctor --discovery` was a one-shot command that bricked its own ledger, and it blocked Task 3 from recording anything.
- **Fix:** `raw`'s `minLength` removed, with the reason recorded in its description. `raw` is bound to by NOTHING (D-04), so this narrows nothing a comparison reads.
- **Files modified:** `schemas/capability-ledger.schema.json`, `test/capability-ledger.test.ts`
- **Verification:** the write-then-read round trip is now asserted — the property whose absence let this ship. A positive control in the same test confirms a non-semver `exact` is still refused, so the relaxation is confined to `raw`. Live after the fix: three consecutive sweeps, exit 0, 8 rows.
- **Committed in:** `0326c2f`

**3. [Rule 2 — Missing Critical] The owned instruction was written where the canary cannot see it**

- **Found during:** Task 1
- **Issue:** 03-07 asked 03-08 to confirm the new owned skill is reachable inside the isolated canary runtime. It is not: `createCanaryLaunchSpec` uses `project-only` isolation, so `CLAUDE_CONFIG_DIR` points inside the runtime and a user-scope skill is invisible. Authoring the file alone would have shipped a steering layer that provably steers nothing — and the CAPA-02 canary would then have been measuring the third-party text under alpha-AOS's name.
- **Fix:** `createCanaryRuntime` copies the instruction byte-for-byte into the runtime's own config root, declares the file so the D-02 containment assertion covers it, and **refuses** to create a runtime whose owned instruction is missing.
- **Files modified:** `src/core/canary.ts`, `test/canary.test.ts`
- **Verification:** a named test derives the directory from the launch spec's own `CLAUDE_CONFIG_DIR` rather than restating it, asserts the file is there and byte-identical to the reviewed source, asserts it is in `declaredFiles`, asserts the refusal, and asserts a harness whose canary launch is blocked gets no instruction written for it.
- **Committed in:** `b25ec26`

**4. [Rule 1 — Bug] The `narrow` reconciliation had no home in the ledger vocabulary**

- **Found during:** Task 1
- **Issue:** The plan requires the mismatch recorded "as a named finding". Nothing in the codebase carried an UPPER_SNAKE finding that was actually printed; a constant nobody emits is a note, not a finding.
- **Fix:** `ROUTING_CONTRACT_MISMATCH` is emitted by `runDoctor` at `info` level.
- **Files modified:** `src/core/mcp-proxy.ts`, `src/core/doctor.ts`, `test/mcp-proxy.test.ts`
- **Verification:** the finding's denied names are asserted denied by the live allowlist and its unpublished names asserted absent from the measured surfaces, so it cannot drift into describing something untrue.
- **Committed in:** `b25ec26`

### Recorded reinterpretations

**5. Ledger row identity is the triple PLUS polarity.** Task 2's Test 7 wording says "project-harness-capability triple". Implemented as the triple plus polarity because the bare triple would let a negative control evict its own positive and D-14's evidence unit could never be assembled. The test asserts exactly one row per (triple, polarity), asserts the negative coexists, and asserts `pairEvidence` over the pair is `COMPLETE` — so the reinterpretation is itself checked. `bf80939`.

**6. Task 1's "cross-checked against a live tools listing in a named test" is met in two halves.** The named test cross-checks every declared expectation against `MEASURED_UPSTREAM_TOOLS`, a transcribed live listing. The listing itself was run live on this host during this plan and is transcribed above; it is **not** in the automated suite, because a test that launches three npm-resolved servers over the network would be neither offline nor CI-portable — which 03-RESEARCH.md Pitfall 10 is the argument for. Recorded rather than papered over.

**7. Task 3's paid runs were not made.** The precondition was met. The orchestrator's instruction for this run was explicitly not to spend the user's money unasked, and the exact command plus its cost announcement are recorded above so a human can close it in one step. Following the plan literally here would have been the wrong kind of obedience; claiming the runs happened would have been worse.

---

**Total deviations:** 4 auto-fixed (2 bugs under Rule 1, 1 blocking under Rule 3, 1 missing-critical under Rule 2) plus 3 recorded reinterpretations.
**Impact on plan:** Three of the four auto-fixes close a hole that would have made a check pass while proving nothing — a connected server nothing could observe, a ledger nothing could re-read, and a steering instruction nothing could load. No scope creep: every file touched is in this plan's declared set or is the schema/CLI seam those files write through.

## Issues Encountered

- **The paid half of this phase's central deliverable is still unrun.** This is the second wave in a row to record it (03-06 D7). Everything around it is now proven live, so the remaining gap is exactly one command and roughly $0.35.
- **`probedHarnessVersions` reads no version for codex or pi on this host,** so every discovery proof carries `harnessVersion.exact: null`. That is a recorded absence, not an error — but it also means `supersededHarnessVersions` accumulates nothing on this host, so the audit-retention behaviour is proven by test rather than by the live ledger.
- **The RED phase could not include the two end-to-end proxy assertions.** They need a real proxy child, which the seven declared behaviours deliberately avoid so they run offline. They are recorded above as post-RED regression guards rather than counted as RED behaviours.
- **`git` normalized CRLF to LF** in `src/core/canary.ts`, `src/core/cli.ts` and two test files on first staging, which inflates the diff line counts and the `actuals.tokens` figure below the level any conclusion should be drawn from.

## Known Stubs

None. The two functions committed as stubs in the RED commit (`matchExpectations`, `upsertProof`) were both implemented in the GREEN commit of the same task; no stub survives in `HEAD`. Verified: `grep -n "STUB" src/core/*.ts` returns nothing.

## Threat Flags

None. Every surface this plan adds was already in the plan's `<threat_model>`: the unchanged prompts and the empty catalog diff (T-03-70), the shape-only identifier field (T-03-71), the ordered subsequence (T-03-72), the branch-only allowlist discipline and the agreement test (T-03-73), and the ordered match's refusal of a partial list (T-03-74).

One thing worth naming that is **not** a new threat but is a sharpened one: `identifierShape` is the first field ever added to the observation record. The mitigation is structural rather than procedural — the classifier is a table of one, it runs in a frame that discards the value, and the reader is closed against the two declared members so a forged line carrying a value is skipped rather than parsed. A reviewer should confirm that reasoning holds before a second row is ever added to `CLASSIFIED_IDENTIFIER_ARGUMENTS`.

## User Setup Required

None — no external service configuration was introduced. `EXA_API_KEY` was read for presence only; no value was read, printed or recorded.

## Requirements

`requirements-completed` is deliberately **empty**, and this plan declared `[CAPA-01, CAPA-02]`.

Marking them complete would put a claim in `REQUIREMENTS.md` that this phase exists to refuse: CAPA-01 asks that a harness *natively select* a documentation capability and complete a meaningful read-only call, and CAPA-02 the same for research routing. What is proven is the whole apparatus — the observation front, the record shape, the matcher, the fan-out count, the ledger — on real servers. What is not proven is that a **model** made the selection, and that is precisely the paid turn recorded as unrun above. Both IDs should be marked complete by whoever runs `doctor --canary` and reads the result, not by this executor.

## Next Phase Readiness

Ready for plan 03-09. What it inherits:

- `matchExpectations` / `countDistinctServers` — the one verdict path, order-sensitive and offline-provable. A later plan that needs a verdict should compute from these rather than add a third.
- `upsertProof` — one row per identity, wired into the CLI's single ledger write path.
- `MEASURED_UPSTREAM_TOOLS` — the place a future server bump gets checked against, and the place to add a row when one is re-probed.
- `ROUTING_CONTRACT_MISMATCH` — the finding a future `ecc-universal` bump should be checked against; if the bump fixes the shipped text, this constant and its tests are what should change.

Three things a later plan must not inherit blindly:

1. **CAPA-01 and CAPA-02 are still unproven in the sense that matters.** One command, roughly $0.35, transcribed above.
2. **The owned instruction is a steering layer, not a guarantee.** The option's own recorded con stands: if a model follows the third-party skill's text in preference, the CAPA-02 canary reports a routing finding that is really a documentation conflict. The finding above is what makes that readable.
3. **`MEASURED_UPSTREAM_TOOLS.firecrawl` is deliberately incomplete** (`complete: false`). It holds the four allowed names plus the two this repository states something about. A check that treats it as the whole surface will be wrong.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-10*

## Self-Check: PASSED

- `skills/alpha-aos-research-routing/SKILL.md` exists on disk; every file in `key-files.modified` carries this plan's changes.
- All five production commits (`b25ec26`, `c8ef633`, `bf80939`, `19d1eac`, `0326c2f`) and the metadata commit (`ff6277c`) are present in `git log`.
- `commits: 6` is MEASURED, not narrated: `git rev-list --count ef2d592..HEAD` = 6 from the ledger recorded before the first commit. Five production commits plus this plan's own metadata commit.
- `.planning/ROADMAP.md` is present in the `docs(03-08)` commit's diff, with `03-08-PLAN.md` flipped to `[x]`.
- Every task's `<acceptance_criteria>` was re-run. Task 1 and Task 2: all pass. Task 3: the precondition, the empty `catalog/canaries.yaml` diff and the ordinary-lookup declaration all pass; the four criteria that require a completed paid run are recorded as unmet with the reason and the exact command, not silently skipped.
- Plan-level `<verification>`: `npm test` → **615 tests, fail 0**, 6 pre-existing platform skips, well above the 208-test Phase 1 baseline. `git diff -- catalog/canaries.yaml` → empty. Both capabilities have an honest `unverified` record with a named reason rather than a paired evidence unit; that is the third verification line's stated alternative and it is what happened.
- The new assertions were checked for vacuity by MUTATION, not by inspection: widening the allowlist by one name and adding a corrected tool name to the owned instruction turned four of the new Task 1 tests red for exactly the reasons they name (`not ok 23/25/26/27`), and the mutation was reverted before anything was committed.
- Two entries were appended to `.planning/WINDOWS.md`: the unrun paid canary (`unrun-verify`) and the schema relaxation (`deviation`).
- `requirements-completed` is empty by decision, not by omission. See `## Requirements`.
