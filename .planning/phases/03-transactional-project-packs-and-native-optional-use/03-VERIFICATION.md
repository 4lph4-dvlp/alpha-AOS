---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-14T06:33:07.749Z
status: human_needed
score: 2/5 must-haves verified
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 1/5
  gaps_closed:
    - "CAPA-01 now fails closed when query-docs.libraryId is unchecked and retains a schema-validated, redacted invocationEvidence projection that independently proves the ordered version-scoped Codex call."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "A multi-source research request routes through Exa discovery and bounded Firecrawl extraction, while an ordinary lookup does not fan out. (SC2 / CAPA-02)"
    test: "Run the research positive and ordinary-lookup control on an authorized active harness and inspect the ordered observation evidence."
    expected: "The positive records web_search_exa before firecrawl_scrape across exactly two servers; the ordinary control touches at most one research server."
    why_human: "The matcher and controls are wired and fixture-tested, but the only shipped native declarations are Claude-only and no authorized native run has exercised the routing behavior."
  - truth: "A supported receiving harness works from an explicit Unified Memory handoff while .planning remains unchanged and GSD remains authoritative. (SC3 / CAPA-03)"
    test: "Run a handoff to an authorized active receiving harness and judge the response against the handed-off sentinel context."
    expected: "The receiver demonstrably uses the handed-off context, while the recursive planning-tree witness remains byte-identical."
    why_human: "The deterministic memory and immutability halves are implemented, but no receiving model leg has demonstrated use of recalled context."
  - truth: "A materialized exact-hash project pack is selected from a representative intent-matched task without naming the pack or skill. (SC4 / CAPA-05)"
    test: "Run the declared pack-exercise task on an authorized active harness and inspect native skill selection plus project-local provenance."
    expected: "The harness selects and follows the materialized pack for the ordinary prompt, with unchanged locked skill bytes and project-local provenance."
    why_human: "Materialization, exact bytes, scope, and provenance are verified, but the representative native skill-selection leg remains Claude-only and unrun."
non_inferable_unverified_items:
  - truth: "Two equally strong documentation proofs render in stable harness-id order. (03-08 backstop)"
    reason: insufficient_spec
    why_human: "Plan 03-08 explicitly marks this verification: backstop; no held-out test or direct observation exercises two equally strong active-surface proofs."
  - truth: "An interruption before the observation sink closes leaves no invocation record in the ledger. (03-08 backstop)"
    reason: insufficient_spec
    why_human: "Plan 03-08 explicitly marks this verification: backstop; no held-out interruption test directly observes the ordering invariant."
unverified_prohibitions: 14
unverified_prohibition_items:
  - "03-01: Writes must remain limited to paths named by the approved artifact."
  - "03-03: An unpaired positive proof must not render or export as a pass."
  - "03-04: Discovery evidence must not be represented as invocation evidence."
  - "03-05: Canary prompts must not be reworded to hint at skills, tools, or servers."
  - "03-05: Credential values must not enter blocked reasons, ledger records, or transcripts."
  - "03-09: One-shot invocation state must not schedule or trigger deletion."
  - "03-09: Support reasons must not contradict documented harness behavior."
  - "03-13: Inference and scope-limit notes must not stand in for evidence."
  - "03-13: Paid canaries must not be absorbed into the earlier no-spend gap-closure work without an explicit spending decision."
  - "03-14: Field names and rendered code must describe the same fact."
  - "03-15: The CI upstream gate must not be weakened into a false green."
  - "03-18: An unchecked required argument pattern must not produce held=true or nativeUse=invoked."
  - "03-18: Durable audit evidence must not retain raw MCP arguments/responses, model text, authentication bytes, or credential values."
  - "03-18: A legacy proof without invocationEvidence must not satisfy strict CAPA-01 completion."
decision_coverage:
  honored: 16
  total: 16
  not_honored: []
human_verification:
  - test: "CAPA-02 native research routing and ordinary-lookup control"
    expected: "A native positive uses Exa before bounded Firecrawl; the ordinary control touches no more than one research server."
    why_human: "No authorized native model run exercises the shipped Claude-only pair."
  - test: "CAPA-03 receiving-harness handoff"
    expected: "The receiver uses the handed-off sentinel context and .planning remains byte-identical and GSD-authoritative."
    why_human: "Fixture wiring cannot prove that the receiving model used recalled context."
  - test: "CAPA-05 representative project-pack exercise"
    expected: "The target harness naturally selects the exact-hash project-local pack and exposes its provenance; the outside control cannot discover it."
    why_human: "Native skill selection remains unrun on an authorized active harness."
  - test: "Stable ordering backstop"
    expected: "Two equally strong documentation proofs render identically in harness-id ascending order across repeated runs."
    why_human: "The plan marks this non-inferable and supplies no held-out test."
  - test: "Interrupted observation-sink backstop"
    expected: "Interrupting before the sink closes leaves no promoted invocation proof."
    why_human: "The cancellation/ordering invariant has no direct behavioral test."
  - test: "Resolve all 14 plan prohibitions item by item"
    expected: "Record pass, fail, or blocked evidence for every item in the Prohibition Review table; none may be silently accepted from source presence."
    why_human: "Eleven are judgment-tier and three are explicitly flagged without a verification tier; autonomous LLM review is non-authoritative."
---

# Phase 3: Transactional Project Packs and Native Optional Use Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-14T06:33:07.749Z
**Status:** human_needed
**Re-verification:** Yes — after gap-closure plan 03-18

## Goal Achievement

Plan 03-18 closes the only automated blocker from the previous report. The code now makes unchecked required evidence fail `held`, and the retained production ledger independently proves the selected Codex CAPA-01 route after the CLI process exited. The phase cannot be marked `passed`: three roadmap behaviors are present and wired but have not been exercised natively, two plan-authored backstops remain non-inferable, and fourteen plan prohibitions still require explicit human resolution.

### Observable Truths

| # | Roadmap truth | Status | Evidence |
|---|---|---|---|
| 1 | Version-sensitive documentation requests natively select and use Context7 on every actively claimed verification surface. | ✓ VERIFIED | User direction excludes Claude from active verification. The retained Codex proof at the redacted LocalAppData location validates through the production reader and records exactly one CAPA-01 positive: `nativeUse=invoked`, `held=true`, `ordered=true`, 3 observations, `query-docs.libraryId` satisfied, no unchecked patterns, and a version-scoped `query-docs` after `resolve-library-id`. `matchExpectations()` now requires zero unchecked patterns. |
| 2 | Multi-source research routes Exa then bounded Firecrawl, while ordinary lookup does not fan out. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Ordered-sequence, distinct-server, forbidden-tool, and ordinary-control logic is substantive and fixture-tested; the native positive/control declarations remain Claude-only and unrun under the no-Claude direction. |
| 3 | Unified Memory hands work to a receiver while `.planning/` remains authoritative through GSD. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Memory adapters, sentinel recall, paired evidence, and recursive planning-tree hashes are wired and tested; no receiving model leg has demonstrated that it used recalled context. |
| 4 | A reviewed exact-hash project pack is applied with local provenance and exercised by representative intent. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Preview/apply, transaction rollback, exact bytes, project scope, provenance, and discovery negatives are verified; representative native skill selection remains unrun. |
| 5 | The capability is absent outside the project and status/six-domain packs are accurately represented without broad global profiles. | ✓ VERIFIED | The paired outside-project discovery oracle, three-axis/eight-state resolver, CAPA-06 recorded inference, and all six CAPA-08 positive/near-miss fixture pairs remain substantive and wired; named regression checks passed. |

**Score:** 2/5 truths verified (3 present and wired but behavior-unverified)

### Re-verification of the Previous Gap

| Gap-closure condition | Result | Evidence |
|---|---|---|
| Unchecked `query-docs.libraryId` cannot hold or invoke. | ✓ CLOSED | `src/core/canary.ts:2009-2015` includes `uncheckedArgumentPatterns.length === 0` in `held`; `decideInvocation()` at 2087 promotes only a non-empty held observation list. The exact missing-shape named test passed 1/1. |
| Complete CAPA-01 evidence proves order, version shape, count, and required pattern. | ✓ CLOSED | The strict six-case matrix at `test/canary.test.ts:2639-2697` passes; the actual retained proof independently reports ordered resolution/query, a positive count equal to the observation array, the required satisfied pattern, and no unchecked patterns. |
| Durable proof retains replayable redacted audit detail. | ✓ CLOSED | `canaryProof()` reconstructs only six observation fields plus the closed verdict (`src/core/canary.ts:3715-3757`); types and schema agree (`src/core/capability-ledger.ts:161-222`, `schemas/capability-ledger.schema.json:184-253`). The production reader accepted the retained ledger. |
| Legacy rows stay readable without becoming strict completion. | ✓ CLOSED | The optional field is absent on legacy rows and the named round-trip test passes; the separate retained-ledger gate refuses absence and found one non-legacy proof. |

### Required Artifacts

Canonical artifact queries report **55/55** artifacts present and substantive across all 18 plans. Canonical key-link queries report **40/40** declared links matched; plan 03-07 intentionally declares no links.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/core/canary.ts` | Fail-closed matching and canary-to-proof projection | ✓ VERIFIED | Substantive implementation, imported by CLI/tests, missing-shape and complete-route branches both tested. |
| `src/core/capability-ledger.ts` | Typed optional durable invocation evidence | ✓ VERIFIED | Closed interfaces are attached to `CapabilityProof`; production reader accepted the retained row and legacy rows remain optional. |
| `schemas/capability-ledger.schema.json` | Closed evidence schema with legacy compatibility | ✓ VERIFIED | Nested objects set `additionalProperties: false`; malformed nested fields/unknown keys are rejected by tests. |
| `test/canary.test.ts` | Strict matrix and opt-in live agreement | ✓ VERIFIED | Default focused run executed active tests with the one costed live test intentionally skipped; strict matrix and failing direction are active. |
| `test/capability-ledger.test.ts` | Closed-schema and round-trip coverage | ✓ VERIFIED | Active ledger tests in the focused run include audited/legacy round trips and malformed evidence cases. |
| Prior pack/oracle/memory/provenance/state artifacts | Existing Phase 03 delivery | ✓ REGRESSION CHECK | All declared artifacts still pass canonical existence/substance checks; named CAPA-04, CAPA-06, and CAPA-08 regressions pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `catalog/canaries.yaml` | `src/core/canary.ts` | CAPA-01 Codex selection and declared expectations | ✓ WIRED | The shipped declaration requires ordered Context7 calls and the exact version-scoped shape pattern. |
| MCP observation front | `matchExpectations()` / `decideInvocation()` | Closed observation records | ✓ WIRED | Recorded server/tool/order/outcome/identifier shape determine the verdict; model output text is not consulted. |
| `src/core/canary.ts` | `src/core/capability-ledger.ts` | `canaryProof(...).invocationEvidence` | ✓ WIRED | Runtime observations and verdict are copied into the persisted proof. |
| `src/core/capability-ledger.ts` | capability-ledger schema | Type/schema agreement | ✓ WIRED | The typed optional field and closed JSON schema accept the same evidence structure. |
| CLI canary run | durable ledger | transactional upsert and post-process read | ✓ FLOWING | The external retained ledger contains the unique actual Codex CAPA-01 proof and validates through `readCapabilityLedger()`. |
| Project approval artifact | project pack sync | reviewed targets and hashes through one transaction | ✓ WIRED | Named interruption regression confirms rollback removes partial skill/receipt state. |

### Data-Flow Trace (Level 4)

| Artifact | Data variable | Source | Produces real data | Status |
|---|---|---|---|---|
| CAPA-01 proof | `invocationEvidence.observations/verdict` | Runtime observation-front JSONL → matcher → `canaryProof` → transactional ledger | Yes — retained production evidence was independently reopened and schema-validated | ✓ FLOWING |
| Project-local pack | skill bytes and receipt targets | Locked exact hash → reviewed plan artifact → bounded transaction | Yes — exact bytes and receipts are exercised by transaction tests | ✓ FLOWING |
| Capability report | deployment/native-use/support axes | Approved artifact + ledger proof + support ceiling | Yes — each axis remains independently resolved and rendered | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Missing version shape fails closed | `node --test --test-name-pattern="a declared pattern is still reported unchecked when the record carries no shape for it" dist/test/canary.test.js` | 1 pass, 0 fail | ✓ PASS |
| CAPA-04 interrupted sync rolls back | Exact named `node --test --test-name-pattern=... dist/test/project-pack-sync.test.js` | 1 pass, 0 fail | ✓ PASS |
| CAPA-08 six-domain fixture contract | Exact named `node --test --test-name-pattern=... dist/test/project-plan.test.js` | 1 pass, 0 fail | ✓ PASS |
| CAPA-01 retained production evidence | Production reader plus independent field audit of the redacted LocalAppData ledger | One unique valid proof; invoked/held/ordered; count 3; satisfied version pattern; zero unchecked | ✓ PASS |
| Phase 03 focused canary/ledger regression | `node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/capability-ledger.test.js` | 142 total, 141 pass, 0 fail, 1 intentional opt-in live skip | ✓ PASS |
| Full workspace regression | Not rerun by this verifier | Executor gate: 763 total / 756 pass / 0 fail / 7 skip. A later duplicate timed out at 600s without surfaced failures; that duplicate is inconclusive, neither pass nor fail. | ℹ CORROBORATED BY TARGETED CHECKS |

`npm run check` and `npm run build` also exited zero during this verification. A separate CAPA-06 named discovery regression passed, but took about 22.7 seconds and is recorded as supporting regression evidence rather than a sub-10-second spot-check.

### Probe Execution

No `probe-*.sh` path is declared or present for Phase 03. Native canaries are CLI/test gates rather than shell probes. This verifier did not spend another model turn; it audited the durable production evidence left by the completed opt-in run.

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|---|---|---|---|---|
| CAPA-01 | 02, 08, 13-18 | Version-sensitive native documentation use | ✓ SATISFIED | Fail-closed matcher, strict matrix, actual retained Codex evidence, schema-valid durable audit. |
| CAPA-02 | 02, 07, 08, 13-15 | Native Exa → bounded Firecrawl plus ordinary control | ? NEEDS HUMAN | Deterministic matcher/control works; native positive/control behavior is unrun. |
| CAPA-03 | 12 | Explicit Unified Memory handoff without `.planning/` authority drift | ? NEEDS HUMAN | Memory and tree-hash wiring pass; receiving model use is unrun. |
| CAPA-04 | 01 | Preview/apply exact-hash pack only in selected project | ✓ SATISFIED | Approved artifact, single bounded transaction, idempotency/refusal/rollback tests; exact interruption regression passed. |
| CAPA-05 | 04-06, 11 | Project-local provenance and representative exercise | ? NEEDS HUMAN | Provenance and materialization pass; representative native selection is unrun. |
| CAPA-06 | 03, 04, 11, 13-15 | Outside project cannot discover or invoke pack | ✓ SATISFIED WITH RECORDED INFERENCE | Outside discovery negative passed; the no-invocation inference and its premise remain attached to the qualifying proof. |
| CAPA-07 | 03, 05, 06, 09, 14, 16-18 | Distinct capability states | ✓ SATISFIED | Orthogonal axes and fail-closed unverified state remain substantive; durable evidence does not collapse them. |
| CAPA-08 | 10 | Six evidence-based domain packs without broad global profiles | ✓ SATISFIED | Exact six-domain fixture contract and near-miss logic remain wired; named regression passed. |

All CAPA-01 through CAPA-08 IDs appear in plan frontmatter; no Phase 03 requirement is orphaned. The checkbox/traceability statuses in `REQUIREMENTS.md` are lifecycle metadata owned by the orchestrator and were not edited by this verifier.

### Decision Coverage

All **16/16** trackable `03-CONTEXT.md` decisions are found in shipped artifacts. The gate is advisory and reports no missing decision. The later UAT direction excludes Claude from active development and verification; the retained Codex proof is therefore the active CAPA-01 evidence while Claude compatibility stays present.

### Test Quality Audit

| Test surface | Linked requirement | Active/default | Skipped | Circular | Strongest assertion | Verdict |
|---|---|---:|---:|---|---|---|
| CAPA-01 matcher/strict matrix | CAPA-01 | Active | 0 | No | Behavioral/value | ✓ SUFFICIENT — both complete and five failing directions asserted |
| Opt-in native Codex test | CAPA-01 | Opt-in | 1 in default focused run | No | End-to-end behavioral | ✓ SUPPORTED by actual durable production proof; not silently treated as a default-suite pass |
| Capability ledger schema/round trip | CAPA-01/07 | Active | 0 | No | Value/behavioral | ✓ SUFFICIENT — valid, legacy, unknown-key, enum, and malformed-verdict cases |
| Prior pack/oracle/memory/domain suites | CAPA-02..08 | Active fixture coverage | 0 static requirement skips found | No circular oracle found | Value/behavioral | ✓ SUFFICIENT for deterministic halves; native model legs remain separately human-needed |

**Disabled requirement tests:** 1 intentional opt-in native test in default mode; its live result is evidenced by the independently valid retained proof.

**Circular patterns detected:** 0. Test fixture writes create isolated inputs and do not generate an oracle baseline from the system under test.

**Insufficient assertions:** 0 for the automated CAPA-01 closure contract.

### Anti-Patterns Found

| File | Line/offset | Pattern | Severity | Impact |
|---|---:|---|---|---|
| Phase-modified production/test/schema files | — | `TBD`, `FIXME`, or `XXX` | — | No matches; no debt-marker blocker. |
| `src/core/capability-ledger.ts` | byte offset 35569 | Literal NUL separator in source | ⚠️ Warning | Functionally intentional as a proof-key separator and tests/build pass, but ordinary text search classifies the file as binary; replace with an escaped `"\0"` in later cleanup to preserve reviewability. |
| Placeholder/not-available matches | various | Deliberate oracle sentinel, redaction vocabulary, and absence messages | ℹ Info | None flows as a user-facing implementation stub. |

### Prohibition Review — Human Resolution Required

Autonomous inspection is non-authoritative. The latest plan says “twelve” judgment prohibitions, but parsing all 18 PLAN frontmatters yields **14** items: eleven `verification: judgment` items and three explicit flagged items in 03-18 with no tier. This report conservatively routes all fourteen to human review.

| # | Plan | Prohibition | Automated observation only |
|---|---|---|---|
| 1 | 03-01 | No write outside approved artifact paths | Bounded transaction/tests support it; human resolution required. |
| 2 | 03-03 | No unpaired positive rendered as pass | Pairing tests support it; human resolution required. |
| 3 | 03-04 | Discovery is not invocation | Separate axes/oracles support it; human resolution required. |
| 4 | 03-05 | No prompt hinting/rewording | Token hygiene tests support it; human judgment of ordinary phrasing required. |
| 5 | 03-05 | No credential values in observable evidence | Structural redaction tests support it; human review required. |
| 6 | 03-09 | One-shot state never auto-deletes | Removal approval path supports it; human review required. |
| 7 | 03-09 | Support reasons do not contradict harness behavior | Requires human source judgment. |
| 8 | 03-13 | Notes do not substitute for evidence | Axes stay byte-identical in tests; human interpretation required. |
| 9 | 03-13 | Earlier gap closure does not silently spend | 03-18 later authorized and ran a paid Codex gate; a human must resolve the scope/supersession explicitly. |
| 10 | 03-14 | Field names/rendered codes mean the same thing | Serialization tests support it; human judgment required. |
| 11 | 03-15 | CI upstream gate is not weakened | Workflow/helper tests support it; human policy review required. |
| 12 | 03-18 | Unchecked required pattern never holds/invokes | Deterministic test passes, but plan keeps the prohibition flagged. |
| 13 | 03-18 | Durable audit evidence excludes forbidden raw/model/auth/credential content | `invocationEvidence` is closed and redacted. The surrounding legacy `oracle.command` still retains the declared canary prompt and execution paths, so a human must decide whether “durable audit evidence” means only the new projection or the whole proof. |
| 14 | 03-18 | Legacy proof cannot satisfy strict completion | External strict audit refuses absence and current proof is non-legacy; plan keeps the item flagged. |

### Human Verification Required

#### 1. CAPA-02 Native Research Routing

**Test:** Run the positive multi-source research canary and ordinary-lookup control on an authorized claimed harness without naming skills/tools.

**Expected:** Exa discovery precedes bounded Firecrawl extraction; the ordinary lookup touches no more than one research server.

**Why human:** No authorized native model run currently exercises the Claude-only pair.

#### 2. CAPA-03 Receiving Handoff

**Test:** Complete an explicit Unified Memory handoff to an authorized receiving harness and judge its answer against the handed-off sentinel.

**Expected:** The receiver genuinely uses the context; `.planning/` stays byte-identical and GSD-authoritative.

**Why human:** Fixture wiring cannot prove model reliance on recalled context.

#### 3. CAPA-05 Representative Pack Exercise

**Test:** Exercise the project-local exact-hash pack with the ordinary declared intent-matched task.

**Expected:** The harness naturally selects it, provenance is visible, and the outside control cannot discover it.

**Why human:** Native skill selection remains unrun.

#### 4. Stable Ordering Backstop

**Test:** Supply two equally strong documentation proofs and repeat rendering.

**Expected:** Both runs render harness-id ascending with byte-identical order.

**Why human:** This is explicitly `verification: backstop` with no held-out test.

#### 5. Interrupted Sink Backstop

**Test:** Interrupt a canary before its observation sink closes.

**Expected:** No invocation proof is promoted or written.

**Why human:** No behavioral test directly exercises this cancellation/ordering invariant.

#### 6. Fourteen Prohibitions

**Test:** Resolve every row in the Prohibition Review table as pass, fail, or blocked with evidence.

**Expected:** No item is silently accepted; clarify the 03-13 spending supersession and 03-18 durable-evidence scope.

**Why human:** Judgment-tier and explicitly flagged prohibitions cannot receive an authoritative autonomous pass.

### Gaps Summary

No automated gap remains and no failed item clearly belongs to a later milestone phase. The previous CAPA-01 blocker is closed. Overall status remains `human_needed` because the three native behaviors, two non-inferable backstops, and fourteen prohibition decisions are unresolved; the ordered status decision tree therefore forbids `passed`.

---

_Verified: 2026-09-14T06:33:07.749Z_
_Verifier: Codex (gsd-verifier)_
