---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-12T12:24:36Z
status: human_needed
score: 1/5 must-haves verified
behavior_unverified: 4
overrides_applied: 0
next_action: "Run the four explicit native-use checks and record the human judgements; do not mark CAPA requirements complete from implementation evidence alone."
next_command: "$gsd-verify-work 3"
covered_files:
  - ".planning/ROADMAP.md"
  - ".planning/REQUIREMENTS.md"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-01-PLAN.md through 03-15-PLAN.md (frontmatter and must-haves)"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/03-01-SUMMARY.md through 03-15-SUMMARY.md (frontmatter; 13-15 read closely)"
  - ".planning/phases/03-transactional-project-packs-and-native-optional-use/deferred-items.md"
  - "src/core/capability-ledger.ts"
  - "schemas/capability-ledger.schema.json"
  - "src/adapters/capability-oracle.ts"
  - "src/core/canary.ts"
  - "src/format.ts"
  - "test/capability-ledger.test.ts"
  - "test/capability-oracle.test.ts"
  - "test/canary.test.ts"
  - "test/helpers/upstream-gate.ts"
  - "test/mcp-proxy.test.ts"
  - ".github/workflows/ci.yml"
covered_digest: "v1:sha256:36727c63dab7f376388bb94165c0f649d619bd50f5aeff973457dd36944ce67b"
covered_head: "2eaf4f3a151083ac3c954dc1bf4de2d4462e4102"
re_verification:
  previous_status: gaps_found
  previous_score: 1/5
  gaps_closed:
    - "REQUIREMENTS.md no longer marks CAPA-05 or any other Phase 3 CAPA requirement Complete without representative-use evidence."
    - "CAPA-06's outside-project non-invocation inference is recorded on the qualifying negative proof with its observed premise."
    - "Canary proofs record their canary-runtime configuration and instruction scope on the proof itself."
    - "Doctor output uses NOT-RUN for the reason a supported surface did not run and serializes discovery evidence without cycle placeholders."
    - "CI fails closed when pinned MCP startup checks cannot reach the registry, while local offline runs retain an explained skip."
    - "The pending-MCP regression guard now asserts and explains its precondition."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "On every claimed harness surface, a version-sensitive documentation request natively selects the global documentation capability and completes a meaningful read-only Context7 call. (SC1 / CAPA-01)"
    test: "Run the Phase 3 UAT documentation canary from `$gsd-verify-work 3`; inspect the produced proof and ordered Context7 observations."
    expected: "The claimed surface records nativeUse=invoked with resolve-library-id before query-docs, and the query observation records a version-scoped three-segment library identifier shape."
    why_human: "No paid model turn was authorized or run; implementation and fixtures cannot prove that a model selected and used the capability natively."
  - truth: "A multi-source research request routes through Exa discovery and bounded Firecrawl extraction, while an ordinary lookup does not fan out. (SC2 / CAPA-02)"
    test: "Run the Phase 3 UAT research positive and ordinary-lookup control from `$gsd-verify-work 3`; inspect the tool sequence, distinct-server count, and recorded canary-runtime scope note."
    expected: "The positive records web_search_exa before firecrawl_scrape across exactly two servers; the ordinary control touches at most one research server; the reviewer accepts or rejects the explicit canary-runtime scope limitation."
    why_human: "The native routing leg needs paid model execution, and a human must judge whether evidence from the alpha-AOS-owned canary configuration is sufficient for the claimed surface."
  - truth: "A supported receiving harness works from an explicit Unified Memory handoff while `.planning/` remains unchanged and GSD remains authoritative. (SC3 / CAPA-03)"
    test: "Run the Phase 3 UAT handoff canary from `$gsd-verify-work 3` and judge the receiving response against the handed-off sentinel/context."
    expected: "The receiving harness demonstrably uses the handed-off context; the already-automated planning-tree witness remains complete and byte-identical."
    why_human: "The receiving leg was not run because it spends a model turn, and the observation front cannot distinguish use of recalled context from coincidental general knowledge."
  - truth: "A materialized exact-hash project pack is selected from a representative intent-matched task without naming the pack or skill. (SC4 / CAPA-05)"
    test: "In the Phase 3 UAT project, run the declared pack-exercise canary from `$gsd-verify-work 3` and inspect the harness event stream for native skill selection."
    expected: "The harness selects and follows the materialized pack for the ordinary intent-matched prompt, with project-local provenance visible and no skill name or subject hint in the prompt."
    why_human: "This requires a paid model turn and skill selection is not an MCP tool call, so the automated MCP observation sink cannot establish it."
human_verification:
  - test: "CAPA-01 documentation invocation"
    expected: "Native Context7 selection and ordered version-scoped read-only use on the claimed surface."
    why_human: "Paid model behavior was deliberately not run."
  - test: "CAPA-02 research routing and ordinary negative"
    expected: "Ordered Exa-to-Firecrawl routing, bounded ordinary lookup, and an explicit decision on the canary-runtime scope note."
    why_human: "Paid model behavior and the scope judgement remain unobserved."
  - test: "CAPA-03 receiving handoff leg"
    expected: "The receiver demonstrably works from the memory handoff; the planning-tree witness stays unchanged."
    why_human: "The receiver was not run and use of recalled context requires judgement."
  - test: "CAPA-05 representative pack exercise"
    expected: "The harness natively selects the project pack for an ordinary intent-matched task."
    why_human: "Paid model behavior is unrun and skill selection is outside the MCP observation channel."
unverified_prohibitions: 12
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
---

# Phase 3: Transactional Project Packs and Native Optional Use Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-12T12:24:36Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure plans 03-13 through 03-15

## Goal Achievement

The implementation gap is closed. Phase 3 now records what each proof actually observed, what it inferred, and the scope in which it ran. It also reports non-runs and CI upstream failures without turning absence into a pass. The phase goal still depends on four real native-use observations that were deliberately not purchased or simulated, so the canonical result is `human_needed`, not `passed`.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Version-sensitive documentation requests natively select and use Context7. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ordered matcher, version-scoped identifier shape, proxy, canary runtime, and scope note are wired and tested. No paid native invocation has run. |
| 2 | Multi-source research routes Exa then bounded Firecrawl, while ordinary lookup does not fan out. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ordered sequence and distinct-server bounds are non-vacuously tested; canary scope is persisted. No paid positive/control pair has run. |
| 3 | Unified Memory hands work to a receiver while `.planning/` stays authoritative through GSD. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The live/free immutability witness and failure-capable negative remain verified. The receiving harness leg has not run. |
| 4 | A reviewed exact-hash project pack is applied with local provenance and exercised by representative intent. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Preview/apply, atomic rollback, exact bytes, provenance, and project scoping remain verified. Native representative skill selection has not run. |
| 5 | The capability is absent outside the project and status/six-domain packs remain accurately represented without broad global profiles. | ✓ VERIFIED | Paired discovery negative, three-axis state, eight named states, six positive packs and six near-miss twins retain behavioral coverage. CAPA-06's non-invocation inference attaches only to a parsed, ancestor-free negative whose control saw none of the capability's skills. |

**Score:** 1/5 truths verified (4 present and wired, behavior unverified)

### Re-verification of the Previous Gap

| Previous gap | Result | Evidence |
|--------------|--------|----------|
| CAPA-05 was falsely marked Complete without representative-use evidence. | ✓ CLOSED | Commit `5c49abc` reverted all Phase 3 CAPA checkboxes to unchecked and CAPA-04..08 traceability rows to `Gaps Found`. Current REQUIREMENTS still has all eight CAPA boxes unchecked. Plan 03-13 added only a Recorded Inferences note and preserved those statuses. |

No regression was found in the previously verified pack transaction, discovery, ledger, state-rendering, provenance, six-domain fixture, or planning-immutability paths. The supplied final regression gate is `npm test`: 739 total, 733 pass, 0 fail, 6 existing platform skips.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/core/capability-ledger.ts` + schema | Closed optional claim notes that never alter verdicts | ✓ VERIFIED | Three fields, two-value kind, optional persistence, closed schema, round trip, and refusal of unknown keys/kinds. |
| `src/adapters/capability-oracle.ts` | Truthful CAPA-06 inference | ✓ VERIFIED | Requires a negative, asserted ancestor-free control, parsed output, a declared capability, and no loaded capability skill; unparsed, trust-withheld, empty, partial, and positive cases carry no inference. |
| `src/core/canary.ts` + `src/format.ts` | Runtime scope, NOT-RUN semantics, noncyclic discovery JSON | ✓ VERIFIED | Scope uses recorded instruction IDs; no-spend stays unverified; aggregate clones prevent cycle placeholders while `discovery.unit` remains complete. |
| `test/helpers/upstream-gate.ts` + `.github/workflows/ci.yml` | Strict upstream CI with graceful local behavior | ✓ VERIFIED | Pure decision, exact `=1` opt-in, package/version reasons, job-level three-OS env, no soft-failure escape, and exact tool sets retained. |
| `test/capability-oracle.test.ts` | Anti-vacuity pending check | ✓ VERIFIED | Asserts a pending server before the unchanged MCP-finding assertion and explains its current regression-guard limit. |
| `.planning/REQUIREMENTS.md` | Honest Phase 3 claims | ✓ VERIFIED | No Phase 3 CAPA checkbox is complete; CAPA-06 inference is recorded without changing status. |

Gap-plan artifact queries report 11/11 substantive artifacts; key-link queries report 7/7 links wired.

### Key Link and Data-Flow Verification

| From | To | Status | Evidence |
|------|----|--------|----------|
| Oracle negative proof | Ledger claim note | ✓ WIRED | `proofFor` conditionally adds the reviewed inference; schema write/read tests preserve it. |
| Canary runtime | Proof and report row | ✓ WIRED | Instruction IDs travel through `runCanary` to claim notes; refused/unlaunched runs emit no note. |
| Report row | Human and JSON output | ✓ WIRED | Full tagged notes and NOT-RUN render; serialization finds zero cycle placeholders and keeps the canonical unit. |
| CI workflow | Upstream classifier | ✓ WIRED | Job-level exported env name covers both test invocations. |

There is no rendered application data path. Level-4 verification traced proof data from oracle/canary results through the ledger and CLI envelope; no hardcoded success value or hollow prop is involved.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Truthful inference guards | named `capability-oracle` tests | 3 pass, 0 fail | ✓ PASS |
| NOT-RUN, scope, noncyclic envelope | named `canary` tests | 3 pass, 0 fail | ✓ PASS |
| Upstream classification and workflow binding | named `mcp-proxy` tests | 5 pass, 0 fail | ✓ PASS |
| Pending-server precondition | named `capability-oracle` test | 1 pass, 0 fail | ✓ PASS |
| Full regression gate | supplied final `npm test` | 739 total, 733 pass, 0 fail, 6 existing platform skips | ✓ PASS |
| Paid/native model legs | deliberately not run | Routed below | ? HUMAN |

### Probe Execution

No plan declares a probe script and no conventional `scripts/*/tests/probe-*.sh` exists. Step 7c is skipped; the phase uses named Node tests and CLI UAT.

### Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CAPA-01 | 02, 08, 13, 14, 15 | ? NEEDS HUMAN | Evidence machinery verified; native documentation invocation unrun. |
| CAPA-02 | 02, 07, 08, 13, 14, 15 | ? NEEDS HUMAN | Matcher, control, strict CI, and scope disclosure verified; native routing unrun. |
| CAPA-03 | 12 | ? NEEDS HUMAN | Planning immutability verified; receiving behavior unrun. |
| CAPA-04 | 01 | ✓ SATISFIED | Preview/apply, exact hashes, atomicity, refusal, and project scope remain covered. |
| CAPA-05 | 04, 05, 06, 11 | ? NEEDS HUMAN | Provenance verified; representative native exercise unrun. |
| CAPA-06 | 03, 04, 11, 13, 14, 15 | ✓ SATISFIED WITH RECORDED INFERENCE | Outside discovery is live; non-invocation inference and premise ride on the qualifying proof. |
| CAPA-07 | 03, 05, 06, 09, 14 | ✓ SATISFIED | Three axes remain distinct; NOT-RUN no longer borrows support vocabulary. |
| CAPA-08 | 10 | ✓ SATISFIED | Six exact-set packs and near-miss twins remain active without broad profiles. |

No requirement is orphaned. All CAPA-01..08 appear in plan frontmatter. REQUIREMENTS boxes stay unchecked until UAT closes the behavior clauses.

### Decision Coverage

All 16 trackable `03-CONTEXT.md` decisions are honored by shipped artifacts.

### Test Quality Audit

| Test surface | Linked requirements | Disabled | Circular | Assertion | Verdict |
|--------------|---------------------|----------|----------|-----------|---------|
| Ledger/oracle claim-note tests | CAPA-06 | 0 | No | Behavioral/value | ✓ SUFFICIENT |
| Canary reporting, ordering, scope, single-use, serialization | CAPA-01/02/03/05/07 | 0 | No | Behavioral | ✓ SUFFICIENT |
| MCP upstream gate | CAPA-01/02 | 0 static; explained dynamic local skip | No | Value/behavioral | ✓ SUFFICIENT — CI fails on registry-unreachable |

No disabled requirement test or circular oracle was found. The Claude pending-MCP assertion remains a future regression guard; plan 15 now states that limit and asserts its live precondition, and it is not sole proof of a requirement.

### Anti-Patterns and Prohibitions

No `TBD`, `FIXME`, or `XXX` marker exists in gap-plan files. `placeholder` matches are deliberate oracle/redaction vocabulary, not stubs. No empty handler, hardcoded success, or disconnected implementation was found.

The 12 judgment-tier prohibitions across plans 01, 03, 04, 05, 09, 13, 14, and 15 appear held: bounded approved paths; no unpaired-positive pass; discovery never promoted to invocation; unhindered prompts; no credential values; no automatic deletion; support reasons tied to evidence; source bytes unchanged; notes never replace evidence; no paid closure run; NOT-RUN uses native-use vocabulary; and CI has no soft-failure escape. **Non-authoritative LLM judgements — unverified-prohibition, human review recommended.**

### Human Verification Required

Deferred checks from plans 08, 11, and 12 deduplicate into these four checks.

#### 1. CAPA-01 documentation invocation

**Test:** Run documentation UAT through `$gsd-verify-work 3` and inspect Context7 observations.
**Expected:** Native selection without naming it; resolve before query; version-scoped identifier shape.
**Why human:** Requires an authorized paid model turn and proves model behavior.

#### 2. CAPA-02 research routing and ordinary control

**Test:** Run research UAT and the ordinary control through `$gsd-verify-work 3`; review the scope note.
**Expected:** Exa before bounded Firecrawl over two servers; ordinary control at one or fewer; accept or reject the canary-runtime scope.
**Why human:** Requires paid model behavior and a scope judgement.

#### 3. CAPA-03 receiving handoff leg

**Test:** Run handoff UAT through `$gsd-verify-work 3` and judge whether the receiver used the handoff.
**Expected:** The answer depends on handed-off context; planning-tree evidence stays complete and unchanged.
**Why human:** The receiver was not run and memory use is not observable as an MCP call.

#### 4. CAPA-05 representative pack exercise

**Test:** Run pack-exercise UAT through `$gsd-verify-work 3` and inspect the harness event stream.
**Expected:** Native project-skill selection from an ordinary intent-matched prompt without hints.
**Why human:** Requires a paid model turn; skill selection is outside the MCP observation sink.

### Gaps Summary

No implementation gap remains. The phase cannot pass until these four behavior-dependent truths are observed and accepted. Later phases do not explicitly own them, so none is deferred.

---

_Verified: 2026-09-12T12:24:36Z_
_Verifier: Codex (gsd-verifier)_
