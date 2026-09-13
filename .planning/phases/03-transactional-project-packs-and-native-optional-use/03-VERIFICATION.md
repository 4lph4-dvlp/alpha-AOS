---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-13T13:10:21Z
status: gaps_found
score: 1/5 must-haves verified
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 1/5
  gaps_closed:
    - "G-03-1 transport gap: Codex now has a separate costed native invocation path with runtime-local Context7 observation-front configuration and authentication by reference."
    - "Explicit canary filters that select zero declarations now refuse before state creation, announcements, callbacks, or spend."
  gaps_remaining:
    - "CAPA-01's completion proof accepts `held: true` when the version-scoped identifier pattern is unchecked, and the durable ledger does not retain the observation/verdict detail needed to independently disprove that false positive."
  regressions: []
gaps:
  - truth: "On every actively claimed harness surface, a version-sensitive documentation request natively selects the documentation capability and completes a meaningful, version-scoped read-only Context7 call. (SC1 / CAPA-01)"
    status: failed
    reason: "The Codex path is substantive and a durable ledger row records nativeUse=invoked, but matchExpectations() sets held=true when query-docs.libraryId is unchecked. The final native gate checks only invoked/held, and the ledger drops satisfied/unchecked argument-pattern and observation details, so the retained evidence cannot prove the version-scoped clause."
    artifacts:
      - path: "src/core/canary.ts"
        issue: "matchExpectations() excludes uncheckedArgumentPatterns from the held predicate; decideInvocation() therefore promotes an unchecked version-shape run to invoked."
      - path: "test/canary.test.ts"
        issue: "The missing-shape test verifies that the pattern is reported unchecked but never asserts held=false; the live-gate contract only checks nativeUse and held."
      - path: "C:/Users/alpha/.alpha-aos/capabilities/ledger.json"
        issue: "The current Codex CAPA-01 proof records invoked and an exit-0 oracle fingerprint, but not the three observations, ordered verdict, or satisfied version-shape pattern."
    missing:
      - "Make every declared but unchecked argument pattern fail closed for a proof whose must-have depends on it, or require satisfiedArgumentPatterns to contain query-docs.libraryId and uncheckedArgumentPatterns to be empty in the CAPA-01 completion gate."
      - "Persist or otherwise retain replayable, redacted verdict detail sufficient to audit ordered calls, observation count, and the version-scoped shape without trusting SUMMARY.md."
behavior_unverified_items:
  - truth: "A multi-source research request routes through Exa discovery and bounded Firecrawl extraction, while an ordinary lookup does not fan out. (SC2 / CAPA-02)"
    test: "Run the research positive and ordinary-lookup control on an authorized active harness and inspect the ordered observation evidence."
    expected: "The positive records web_search_exa before firecrawl_scrape across exactly two servers; the ordinary control touches at most one research server."
    why_human: "The matcher and controls are wired, but no native model run on an available harness exercises this routing transition; the shipped declarations remain Claude-only."
  - truth: "A supported receiving harness works from an explicit Unified Memory handoff while `.planning/` remains unchanged and GSD remains authoritative. (SC3 / CAPA-03)"
    test: "Run a handoff to an authorized active receiving harness and judge the response against handed-off sentinel context."
    expected: "The receiver demonstrably uses the handed-off context, while the recursive planning-tree witness remains byte-identical."
    why_human: "The deterministic immutability half is implemented, but no receiving model leg has run and use of recalled context is not inferable from symbol presence."
  - truth: "A materialized exact-hash project pack is selected from a representative intent-matched task without naming the pack or skill. (SC4 / CAPA-05)"
    test: "Run the declared pack-exercise task on an authorized active harness and inspect native skill selection plus project-local provenance."
    expected: "The harness selects and follows the materialized pack for the ordinary prompt, with unchanged locked skill bytes and project-local provenance."
    why_human: "Materialization and provenance are verified, but the representative native skill-selection leg remains Claude-only and unrun."
non_inferable_unverified_items:
  - truth: "Two equally strong documentation proofs render in stable harness-id order. (03-08 backstop)"
    reason: insufficient_spec
    why_human: "Plan 03-08 explicitly authors no held-out assertion and only one active surface has a native proof."
  - truth: "An interruption before the observation sink closes leaves no invocation record in the ledger. (03-08 backstop)"
    reason: insufficient_spec
    why_human: "Plan 03-08 explicitly authors no interruption test for a paid run; presence of sink checks and partial-list matching is not direct evidence of this ordering invariant."
unverified_prohibitions: 12
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
---

# Phase 3: Transactional Project Packs and Native Optional Use Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-13T13:10:21Z
**Status:** gaps_found
**Re-verification:** Yes — after gap-closure plans 03-16 and 03-17

## Goal Achievement

Plans 03-16 and 03-17 close the diagnosed Codex transport and empty-selection gaps. The implementation now selects one Codex CAPA-01 leg, launches native `codex exec` with isolated runtime-local Context7 overrides, and refuses explicit zero-match filters before state or spend. The phase still cannot pass: the retained CAPA-01 evidence does not prove the version-scoped identifier clause, three representative native-use truths remain unexercised, and two plan-authored backstop truths require abstention.

### Observable Truths

| # | Roadmap truth | Status | Evidence |
|---|---------------|--------|----------|
| 1 | Version-sensitive documentation requests natively select and use Context7 on every active claimed surface. | ✗ FAILED | The live Codex ledger row says `invoked`, but `matchExpectations()` returns `held=true` for an unchecked identifier shape and the durable proof omits the verdict/observations. The preserved Claude declaration has no successful result; the UAT explicitly narrows active verification to Codex. |
| 2 | Multi-source research routes Exa then bounded Firecrawl, while ordinary lookup does not fan out. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ordered and fan-out matchers are wired and tested with fixtures; the native positive/control pair remains Claude-only and unrun. |
| 3 | Unified Memory hands work to a receiver while `.planning/` remains authoritative through GSD. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Memory adapters and planning-tree hashing are wired; no receiving model leg has demonstrated use of recalled context. |
| 4 | A reviewed exact-hash project pack is applied with local provenance and exercised by representative intent. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Preview/apply, transaction rollback, exact bytes, project scope, and provenance are verified; representative native skill selection remains unrun. |
| 5 | The capability is absent outside the project and status/six-domain packs are accurately represented without broad global profiles. | ✓ VERIFIED | Paired discovery negatives, the three-axis/eight-state resolver, six positive packs, six near-miss twins, and the CAPA-06 recorded inference remain substantive and wired. |

**Score:** 1/5 truths verified (3 present and wired but behavior-unverified)

### Re-verification of G-03-1

| Gap-closure claim | Result | Evidence |
|-------------------|--------|----------|
| Codex can run CAPA-01 without a Claude account. | ✓ CLOSED (transport) | `catalog/canaries.yaml` declares Codex; `INVOCATION_DEFINITIONS.codex` uses `exec --json --ephemeral`; runtime-derived Context7 overrides cross `mcp-proxy --observe`; the current ledger has a Codex CAPA-01 positive with `nativeUse=invoked`, exit code 0, observed at `2026-09-13T08:41:25.931Z`. |
| Explicit zero-match filters fail closed. | ✓ CLOSED | Verifier invocation of the compiled CLI with `--harness pi --no-spend --json` exited 2, named `CANARY_SELECTION_EMPTY`, and did not create the supplied state root. |
| Codex proof establishes ordered, version-scoped Context7 use. | ✗ OPEN | A direct matcher probe with ordered `resolve-library-id` / `query-docs` observations but no identifier shape returned `held=true`, `unchecked=["query-docs.libraryId"]`, and no satisfied pattern. |

### Required Artifacts

The canonical artifact queries report 50/50 artifacts present/substantive across plans 03-01 through 03-17. Wiring queries report 37/37 declared links matched (plan 03-07 declares no links). Manual inspection changes one artifact's final behavioral status:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/adapters/capability-oracle.ts` | Separate free discovery and costed Codex invocation | ✓ VERIFIED | Discovery remains `debug prompt-input`; invocation is native ephemeral/read-only `codex exec`; Claude compatibility remains declared. |
| `src/adapters/isolation.ts` + `src/core/canary.ts` | Runtime-only fronted MCP configuration with auth by reference | ✓ VERIFIED | Codex requires ignore flags and validated `mcp_servers.*` overrides; ambient/unfronted servers and uncontrolled write roots are refused. |
| `src/core/canary.ts` | Fail-closed selection and trustworthy CAPA-01 verdict | ✗ PARTIAL | Selection is fail closed, but the expectation verdict treats an unchecked required identifier pattern as held. |
| `src/cli.ts` | Validate selection before state/spend and persist proof | ⚠️ PARTIAL | Early selection ordering is correct; persisted proof retains only the promoted axis and oracle fingerprint, not the verdict detail needed to audit CAPA-01's shape clause. |
| `catalog/canaries.yaml` | Reviewable declarations | ✓ VERIFIED | CAPA-01 declares Claude and Codex; CAPA-02/03/05 remain Claude-only. |
| Prior pack, ledger, oracle, provenance, memory, and six-domain artifacts | Existing Phase 03 delivery | ✓ REGRESSION CHECK | All declared paths remain present and substantive; no changed gap-closure file removes their imports or public wiring. |

### Key Link and Data-Flow Verification

| From | To | Status | Evidence |
|------|----|--------|----------|
| Canary catalog | Codex invocation definition | ✓ WIRED | `selectCanaries` selects the Codex CAPA-01 declaration; `canaryPromptArgs` consumes the separate invocation table. |
| Runtime TOML | Isolation launch | ✓ WIRED | Validated Context7 entries become exact `-c mcp_servers.*` overrides with the run's observation path. |
| CLI explicit filters | Core selector | ✓ WIRED | `selectCanaries()` runs before `userStateRoot()` and `runCanarySweep()` repeats the assertion. |
| MCP observations | `matchExpectations()` | ✓ FLOWING | Tool order and `identifierShape` reach the matcher through the closed observation record. |
| Matcher verdict | durable ledger proof | ⚠️ HOLLOW | Only the derived `nativeUse` and oracle fingerprints persist; ordered/satisfied/unchecked pattern details do not. A false-positive `held` is therefore indistinguishable after runtime disposal. |

### Behavioral Spot-Checks

| Behavior | Command/evidence | Result | Status |
|----------|------------------|--------|--------|
| Missing version shape must not satisfy CAPA-01 | Direct import of compiled `matchExpectations()` with ordered Context7 calls and no `identifierShape` | `held=true`, one unchecked pattern, zero satisfied patterns | ✗ FAIL |
| Explicit empty filter refuses before state | Compiled CLI with a fresh nonexistent `ALPHA_AOS_STATE_DIR` and `--harness pi --no-spend --json` | exit 2; state root remained absent | ✓ PASS |
| Native Codex run left durable evidence | Read `C:/Users/alpha/.alpha-aos/capabilities/ledger.json` | Codex CAPA-01 positive, `nativeUse=invoked`, native `codex exec`, exit 0 | ⚠️ PARTIAL — shape/order detail absent |
| Plan artifact/link contracts | `verify.artifacts` and `verify.key-links` for all 17 plans | 50/50 artifacts; 37/37 links | ✓ PASS (presence/wiring only) |
| Targeted and full repository suites | Not rerun by this verifier per orchestrator direction | Reported execution gate: 129/129 targeted; 757 total / 751 pass / 0 fail / 6 skip | ℹ️ NOT VERIFIER-OWNED EVIDENCE |

### Probe Execution

No `probe-*.sh` path is declared or present. The costed/stateful native Codex command was not rerun during verification; its durable ledger record was inspected instead. That record is insufficient for the version-shape clause for the reasons above.

### Requirements Coverage

| Requirement | Source plans | Status | Evidence |
|-------------|--------------|--------|----------|
| CAPA-01 | 02, 08, 13-17 | ✗ BLOCKED | Codex invocation exists and ran, but the proof can pass with the version-shape pattern unchecked and no replayable verdict remains. `.planning/REQUIREMENTS.md` currently marks this Complete; that claim is not supported by auditable evidence. |
| CAPA-02 | 02, 07, 08, 13-15 | ? NEEDS HUMAN | Matcher, control, scope disclosure, and strict upstream gate exist; no native research positive/control pair has run on an available harness. |
| CAPA-03 | 12 | ? NEEDS HUMAN | Planning immutability is automated; receiving behavior is unrun. |
| CAPA-04 | 01 | ✓ SATISFIED | Approved exact-hash preview/apply, idempotency, bounded transaction, rollback, receipts, and refusal paths are implemented and wired. |
| CAPA-05 | 04-06, 11 | ? NEEDS HUMAN | Project-local provenance and exact bytes are verified; representative skill selection is unrun. |
| CAPA-06 | 03, 04, 11, 13-15 | ✓ SATISFIED WITH RECORDED INFERENCE | Outside discovery is paired and ancestor-bounded; the no-invocation inference is attached only to the qualifying negative proof and does not alter axes. |
| CAPA-07 | 03, 05, 06, 09, 14, 16, 17 | ✓ SATISFIED | Selected/deployed/native-use/support axes and blocked/stale/unsupported/unverified distinctions remain separate; explicit empty selection is a refusal, not fake evidence. |
| CAPA-08 | 10 | ✓ SATISFIED | Six exact-set domain fixtures and their near-miss twins exercise evidence-based pack selection without global profiles. |

All CAPA-01 through CAPA-08 IDs appear in plan frontmatter; no Phase 03 requirement is orphaned.

### Decision Coverage

All 16 trackable `03-CONTEXT.md` decisions are found in shipped artifacts. This gate is advisory and does not alter the blocker above. The UAT's later user direction excludes Claude from active development/verification; this report therefore treats Codex as the active CAPA-01 surface while noting that the preserved Claude declaration has no successful native result.

### Test Quality Audit

| Test surface | Linked requirement | Disabled | Circular | Strongest assertion | Verdict |
|--------------|--------------------|----------|----------|---------------------|---------|
| Codex selection/isolation/CLI tests | CAPA-01/07 | 0 | No | Behavioral | ✓ SUFFICIENT for transport and fail-closed selection |
| CAPA-01 matcher tests | CAPA-01 | 0 | No | Value | 🛑 INSUFFICIENT: the test titled “same pair without one does not” covers an explicit `unscoped` shape, while the separate missing-shape test never asserts `held=false` |
| Native completion command | CAPA-01 | N/A | No | Status | 🛑 INSUFFICIENT: checks only result count, harness, `nativeUse=invoked`, and `held=true`; it does not assert the satisfied pattern or absence of unchecked patterns |
| Prior ledger/oracle/pack/memory fixtures | CAPA-02..08 | 0 static skips | No circular oracle found | Value/behavioral | ✓ SUFFICIENT for deterministic halves; native model legs remain separately unverified |

No disabled requirement test or circular expected-value generator was found. The CAPA-01 assertion weakness is blocking because it is the sole automated acceptance path for the version-sensitive clause.

### Anti-Patterns and Prohibitions

No `TBD`, `FIXME`, or `XXX` marker exists in the 03-16/03-17 production and test files. `placeholder` matches belong to the deliberate free discovery prompt and redaction vocabulary; `return null` matches are typed absence paths, not stubs.

The 12 judgment-tier prohibitions appear held by inspection, but remain non-authoritative LLM judgements: **unverified-prohibition — human review recommended**. The CAPA-01 gap is not waived by any override in the existing verification frontmatter.

### Human Verification Still Required

After the blocker is fixed, three roadmap behaviors still need authorized native runs: CAPA-02 research positive/control, CAPA-03 receiving handoff, and CAPA-05 representative pack selection. Plan 03-08 additionally marks stable multi-surface ordering and interrupted-run non-promotion as `verification: backstop`; no held-out/property test directly observes either, so both remain `insufficient_spec` abstentions.

### Gaps Summary

The new Codex path is real, but Phase 03 still lacks an auditable proof of CAPA-01's version-sensitive call. `held` must fail closed when a required identifier shape is unchecked, and the completion evidence must retain or assert the relevant verdict fields. This concern is not assigned to any later phase. Once fixed, the remaining native research, handoff, and pack-exercise checks still route to human verification; the two explicit backstops must also be resolved or accepted by a human.

---

_Verified: 2026-09-13T13:10:21Z_
_Verifier: Codex (gsd-verifier)_
