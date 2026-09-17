---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-14T13:00:00.000Z
status: gaps_found
score: 2/5 must-haves verified
behavior_unverified: 3
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 2/5
  gaps_closed:
    - "Scope-authority rebaseline under D-17: excluded Claude Code from active development and release gates; resolved interrupted-sink backstop and all 14 plan prohibitions in UAT."
  gaps_remaining:
    - "G-03-1: CAPA-02 native research routing on active non-Claude surface (anchored by Codex)."
    - "G-03-2: CAPA-03 explicit handoff between two distinct active non-Claude harnesses."
    - "G-03-3: CAPA-05 representative pack exercise on active non-Claude surface (anchored by Codex)."
    - "G-03-4: Deterministic offline equal-strength proof ordering fixture across active non-Claude surfaces."
  regressions: []
behavior_unverified_items:
  - truth: "A multi-source research request routes through Exa discovery and bounded Firecrawl extraction, while an ordinary lookup does not fan out. (SC2 / CAPA-02 / G-03-1)"
    test: "Run the research positive and ordinary-lookup control on an active non-Claude harness (anchored by Codex) and inspect the ordered observation evidence."
    expected: "The positive records web_search_exa before firecrawl_scrape across exactly two servers; the ordinary control touches at most one research server."
    gap_id: G-03-1
  - truth: "A supported receiving harness works from an explicit Unified Memory handoff while .planning remains unchanged and GSD remains authoritative. (SC3 / CAPA-03 / G-03-2)"
    test: "Run a handoff between two active non-Claude harnesses and judge the response against the handed-off sentinel context."
    expected: "The receiver demonstrably uses the handed-off context, while the recursive planning-tree witness remains byte-identical."
    gap_id: G-03-2
  - truth: "A materialized exact-hash project pack is selected from a representative intent-matched task without naming the pack or skill. (SC4 / CAPA-05 / G-03-3)"
    test: "Run the declared pack-exercise task on an active non-Claude harness (anchored by Codex) and inspect native skill selection plus project-local provenance."
    expected: "The harness selects and follows the materialized pack for the ordinary prompt, with unchanged locked skill bytes and project-local provenance."
    gap_id: G-03-3
non_inferable_unverified_items:
  - truth: "Two equally strong documentation proofs render in stable harness-id order without live vendor dependencies. (G-03-4)"
    reason: missing_fixture
    gap_id: G-03-4
unverified_prohibitions: 0
decision_coverage:
  honored: 17
  total: 17
  not_honored: []
gaps:
  - gap_id: G-03-1
    requirement: CAPA-02
    summary: "Active non-Claude (Codex) research routing and ordinary lookup control"
  - gap_id: G-03-2
    requirement: CAPA-03
    summary: "Two-harness active non-Claude handoff pair with .planning immutability"
  - gap_id: G-03-3
    requirement: CAPA-05
    summary: "Active non-Claude (Codex) representative pack exercise and project-local provenance"
  - gap_id: G-03-4
    requirement: 03-08-backstop
    summary: "Deterministic offline equal-strength proof rendering fixture"
---

# Phase 3: Transactional Project Packs and Native Optional Use Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-14T13:00:00.000Z
**Status:** gaps_found (rebaselined under D-17)
**Re-verification:** Scope-authority rebaseline following human UAT evaluation

## Goal Achievement

This report records a scope-authority rebaseline following the user decision (D-17) that Claude Code is outside active v0.1.0 development, support commitments, and release gates. Shipped Claude Code adapters, schemas, and historical evidence remain compatibility residue.

This update is not a regression in the already verified transactional engine or Codex CAPA-01 evidence. In UAT, the interrupted-sink backstop and all 14 plan prohibitions passed with verified evidence. The 4 former Claude-bound blockers have been converted into 4 diagnosed, actionable implementation/evidence gaps (`G-03-1`, `G-03-2`, `G-03-3`, `G-03-4`) ready for `$gsd-plan-phase 3 --gaps`.

### Observable Truths

| # | Roadmap truth | Status | Evidence |
|---|---|---|---|
| 1 | Version-sensitive documentation requests natively select and use Context7 on every actively claimed verification surface. | ✓ VERIFIED | D-17 excludes Claude from active verification. The retained Codex proof at the redacted LocalAppData location validates through the production reader and records exactly one CAPA-01 positive: `nativeUse=invoked`, `held=true`, `ordered=true`, 3 observations, `query-docs.libraryId` satisfied, no unchecked patterns, and a version-scoped `query-docs` after `resolve-library-id`. `matchExpectations()` requires zero unchecked patterns. |
| 2 | Multi-source research routes Exa then bounded Firecrawl, while ordinary lookup does not fan out. | ⚠️ GAP_FOUND (G-03-1) | Ordered-sequence, distinct-server, forbidden-tool, and ordinary-control logic is substantive and fixture-tested. Shipped declarations were Claude-only; active non-Claude (Codex) canary declarations and instruction root support are required under `G-03-1`. |
| 3 | Unified Memory hands work to a receiver while `.planning/` remains authoritative through GSD. | ⚠️ GAP_FOUND (G-03-2) | Memory adapters, sentinel recall, paired evidence, and recursive planning-tree hashes are wired and tested. Shipped pairs targeted Claude; a genuine two-harness active non-Claude pair (e.g. Hermes→Codex) is required under `G-03-2`. |
| 4 | A reviewed exact-hash project pack is applied with local provenance and exercised by representative intent. | ⚠️ GAP_FOUND (G-03-3) | Preview/apply, transaction rollback, exact bytes, project scope, provenance, and discovery negatives are verified. Shipped pack exercise was Claude-only; an active non-Claude (Codex) pack exercise is required under `G-03-3`. |
| 5 | The capability is absent outside the project and status/six-domain packs are accurately represented without broad global profiles. | ✓ VERIFIED | The paired outside-project discovery oracle, three-axis/eight-state resolver, CAPA-06 recorded inference, and all six CAPA-08 positive/near-miss fixture pairs remain substantive and wired; named regression checks passed. |

**Score:** 2/5 truths verified (3 active capability gaps diagnosed)

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

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|---|---|---|---|---|
| CAPA-01 | 02, 08, 13-18 | Version-sensitive native documentation use | ✓ SATISFIED | Fail-closed matcher, strict matrix, actual retained Codex evidence, schema-valid durable audit. |
| CAPA-02 | 02, 07, 08, 13-15 | Native Exa → bounded Firecrawl plus ordinary control | ⚠️ GAPS_FOUND | G-03-1: Deterministic matcher/control works; active non-Claude declaration/instruction path pending. |
| CAPA-03 | 12 | Explicit Unified Memory handoff without `.planning/` authority drift | ⚠️ GAPS_FOUND | G-03-2: Memory and tree-hash wiring pass; active two-harness non-Claude receiving pair pending. |
| CAPA-04 | 01 | Preview/apply exact-hash pack only in selected project | ✓ SATISFIED | Approved artifact, single bounded transaction, idempotency/refusal/rollback tests; exact interruption regression passed. |
| CAPA-05 | 04-06, 11 | Project-local provenance and representative exercise | ⚠️ GAPS_FOUND | G-03-3: Provenance and materialization pass; active non-Claude representative exercise pending. |
| CAPA-06 | 03, 04, 11, 13-15 | Outside project cannot discover or invoke pack | ✓ SATISFIED WITH RECORDED INFERENCE | Outside discovery negative passed; the no-invocation inference and its premise remain attached to the qualifying proof. |
| CAPA-07 | 03, 05, 06, 09, 14, 16-18 | Distinct capability states | ✓ SATISFIED | Orthogonal axes and fail-closed unverified state remain substantive; durable evidence does not collapse them. |
| CAPA-08 | 10 | Six evidence-based domain packs without broad global profiles | ✓ SATISFIED | Exact six-domain fixture contract and near-miss logic remain wired; named regression passed. |

### Decision Coverage

All **17/17** `03-CONTEXT.md` decisions (including D-17 superseding D-09) are honored. The retained Codex proof is the active CAPA-01 evidence while Claude compatibility remains intact.

### Prohibition Review — Resolved in UAT

All 14 plan prohibitions were explicitly reviewed and passed in `03-UAT.md`:
1. `03-01`: Approved-artifact path bounds and transactional sync/rollback passed.
2. `03-03`: Pairing tests passed; unpaired positive renders `INCOMPLETE`.
3. `03-04`: Discovery oracles produce no invocation axis.
4. `03-05`: Canary prompts contain no hints.
5. `03-05`: Credential values have no observable evidence path.
6. `03-09`: One-shot reporting calls no writer and leaves project bytes unchanged.
7. `03-09`: Surface ceiling reasons are cited and consistent.
8. `03-13`: Claim-note tests passed; inference notes leave axes unchanged.
9. `03-13`: Spending supersession explicitly authorized in 03-18.
10. `03-14`: Field names and rendered code describe the same facts.
11. `03-15`: CI sets `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1` without weakening.
12. `03-18`: Unchecked required patterns fail `held=false` and `nativeUse=unverified`.
13. `03-18`: Durable audit evidence is the closed, redacted `invocationEvidence` projection.
14. `03-18`: Legacy proofs round-trip without fabricated evidence; strict gate enforces required fields.

### Gaps Summary

Phase 3 transitions from `human_needed` to `gaps_found` under D-17. The 4 diagnosed gaps are:

1. **`G-03-1` (CAPA-02)**: Supply active non-Claude (Codex) canary declarations and instruction root support for multi-source research routing and ordinary-lookup control.
2. **`G-03-2` (CAPA-03)**: Establish an evidence-backed active non-Claude handoff pair (e.g. Hermes→Codex) and receiving runtime with `.planning/` immutability.
3. **`G-03-3` (CAPA-05)**: Add active non-Claude representative pack exercise declaration and tests with project-local provenance and CAPA-06 absence preservation.
4. **`G-03-4` (03-08 Backstop)**: Add an offline deterministic fixture feeding equivalent proofs across multiple active non-Claude harness IDs to prove invariant ascending sorting.

Next step: Run `$gsd-plan-phase 3 --gaps` to create gap-closure implementation plans for these four items.

---

_Verified: 2026-09-14T13:00:00.000Z_
_Verifier: Codex / Antigravity (gsd-verifier)_
