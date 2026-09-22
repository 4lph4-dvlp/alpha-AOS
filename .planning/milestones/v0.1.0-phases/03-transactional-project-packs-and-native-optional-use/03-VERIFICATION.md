---
phase: 03-transactional-project-packs-and-native-optional-use
verified: 2026-09-17T09:36:00.000Z
status: passed
score: 5/5 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/5
  gaps_closed:
    - "G-03-1: CAPA-02 active Codex multi-source research routing and ordinary lookup control (Plan 03-20)."
    - "G-03-2: CAPA-03 active non-Claude handoff pair (Hermes -> Codex) with .planning immutability (Plan 03-21)."
    - "G-03-3: CAPA-05 active Codex representative pack exercise with project-local provenance and paired absence (Plan 03-22)."
    - "G-03-4: Deterministic offline equal-strength proof rendering fixture across active non-Claude surfaces (Plan 03-19)."
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
non_inferable_unverified_items: []
unverified_prohibitions: 0
decision_coverage:
  honored: 17
  total: 17
  not_honored: []
gaps: []
---

# Phase 3: Transactional Project Packs and Native Optional Use Verification Report

**Phase Goal:** Users can obtain optional capabilities in exactly the intended scope and prove native discovery and representative use rather than trusting file presence.
**Verified:** 2026-09-17T09:36:00.000Z
**Status:** passed (all 4 gaps closed under D-17)
**Re-verification:** Gap closure verification covering plans 03-19 through 03-22

## Goal Achievement

This report records the complete closure of all Phase 03 gaps under user decision D-17 (active targets: Codex, Antigravity, Pi, Hermes; Claude Code excluded from active gates and preserved as compatibility residue).

All 22 plans (including the 4 gap closure plans 03-19..03-22) have been executed and verified. The full test suite passes at 776 tests (767 passed, 9 intentional live/opt-in skips, 0 failures).

### Observable Truths

| # | Roadmap truth | Status | Evidence |
|---|---|---|---|
| 1 | Version-sensitive documentation requests natively select and use Context7 on every actively claimed verification surface. | ✓ VERIFIED | D-17 excludes Claude from active verification. Retained Codex proof validates through the production reader and records CAPA-01 positive: `nativeUse=invoked`, `held=true`, `ordered=true`, `query-docs.libraryId` satisfied. Offline fixture proves stable harness-id ascending ordering (G-03-4 closed by 03-19). |
| 2 | Multi-source research routes Exa then bounded Firecrawl, while ordinary lookup does not fan out. | ✓ VERIFIED | Plan 03-20 declared Codex for `RESEARCH_MULTI_SOURCE` and `ORDINARY_LOOKUP_CONTROL`, set `policy.canaryHarness: codex`, wired `CANARY_INSTRUCTION_ROOT.codex`, and proved fail-closed ordered Exa -> Firecrawl matching within 2 servers and single-server ordinary lookup bounds (G-03-1 closed). |
| 3 | Unified Memory hands work to a receiver while `.planning/` remains authoritative through GSD. | ✓ VERIFIED | Plan 03-21 prioritized active non-Claude pairs (`hermes -> codex`, `pi -> codex`) in `HANDOFF_HARNESS_PAIRS`, declared `codex` in `CROSS_HARNESS_HANDOFF`, proved Codex receiving runtime steering materialization into `.agents/skills`, and verified recursive planning tree byte immutability and fail-closed corruption detection (G-03-2 closed). |
| 4 | A reviewed exact-hash project pack is applied with local provenance and exercised by representative intent. | ✓ VERIFIED | Plan 03-22 declared `codex` for `PACK_EXERCISE_FRONTEND_A11Y`, verified hint-free prompt text, proved project-local `.agents/skills` materialization with unchanged locked hashes, verified `.alpha-aos/receipts/WEB_REACT.json` provenance, and proved paired in-project discovery and out-of-project absence (G-03-3 closed). |
| 5 | The capability is absent outside the project and status/six-domain packs are accurately represented without broad global profiles. | ✓ VERIFIED | Paired outside-project discovery oracle, three-axis/eight-state resolver, CAPA-06 recorded inference, and all six CAPA-08 positive/near-miss fixture pairs remain substantive and wired; all tests pass. |

**Score:** 5/5 truths verified (0 gaps remaining)

### Required Artifacts

Canonical artifact queries report **59/59** artifacts present and substantive across all 22 plans.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `catalog/canaries.yaml` | Active Codex declarations for research, lookup, handoff, and pack exercise | ✓ VERIFIED | Shipped declarations include `codex` across all canaries while preserving Claude compatibility. |
| `src/core/canary.ts` | Fail-closed matching, active pairs, and Codex runtime steering | ✓ VERIFIED | `CANARY_INSTRUCTION_ROOT.codex` maps to `.agents/skills`, `HANDOFF_HARNESS_PAIRS` prioritizes active non-Claude pairs, and ordered/fan-out bounds are enforced. |
| `src/core/capability-ledger.ts` | Typed optional durable invocation evidence | ✓ VERIFIED | Closed interfaces attached to `CapabilityProof`; reader accepts retained row and legacy rows remain optional. |
| `schemas/capability-ledger.schema.json` | Closed evidence schema with legacy compatibility | ✓ VERIFIED | Nested objects set `additionalProperties: false`; malformed nested fields/unknown keys rejected by tests. |
| `test/canary.test.ts` | Strict matrix, handoff immutability, and offline sorting | ✓ VERIFIED | All 118 canary suite tests pass offline deterministically. |
| `test/capability-oracle.test.ts` | Codex pack materialization, provenance receipts, and paired absence | ✓ VERIFIED | All 31 capability-oracle suite tests pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `catalog/canaries.yaml` | `src/core/canary.ts` | CAPA-01/02/03/05 Codex selection and declared expectations | ✓ WIRED | Shipped declarations require ordered tool calls, server bounds, and active pairs. |
| MCP observation front | `matchExpectations()` / `decideInvocation()` | Closed observation records | ✓ WIRED | Recorded server/tool/order/outcome/identifier shape determine the verdict; model output text is not consulted. |
| `src/core/canary.ts` | `src/core/capability-ledger.ts` | `canaryProof(...).invocationEvidence` | ✓ WIRED | Runtime observations and verdict are copied into the persisted proof. |
| `src/core/canary.ts` | `.planning` | `hashPlanningTree` / `comparePlanningTrees` | ✓ WIRED | Byte-identical recursive SHA-256 witness proves `.planning/` immutability across cross-harness handoffs. |
| `catalog/packs/web.yaml` | `src/core/project-pack-sync.ts` | `applyProjectPackSync` | ✓ WIRED | Materializes `WEB_REACT` into `.agents/skills` with exact locked hashes and `.alpha-aos/receipts/`. |

### Requirements Coverage

| Requirement | Source plans | Description | Status | Evidence |
|---|---|---|---|---|
| CAPA-01 | 02, 08, 13-18 | Version-sensitive native documentation use | ✓ SATISFIED | Fail-closed matcher, strict matrix, actual retained Codex evidence, schema-valid durable audit. |
| CAPA-02 | 02, 07, 08, 13-15, 20 | Native Exa → bounded Firecrawl plus ordinary control | ✓ SATISFIED | Plan 03-20: active Codex declaration, canaryHarness: codex, ordered Exa->Firecrawl matching, max 1 server ordinary control. |
| CAPA-03 | 12, 21 | Explicit Unified Memory handoff without `.planning/` authority drift | ✓ SATISFIED | Plan 03-21: active non-Claude pair (Hermes -> Codex), Codex receiving runtime steering, byte-identical .planning/ digest witness. |
| CAPA-04 | 01 | Preview/apply exact-hash pack only in selected project | ✓ SATISFIED | Approved artifact, single bounded transaction, idempotency/refusal/rollback tests; exact interruption regression passed. |
| CAPA-05 | 04-06, 11, 22 | Project-local provenance and representative exercise | ✓ SATISFIED | Plan 03-22: active Codex pack exercise declaration, .agents/skills materialization, locked hash match, receipt provenance. |
| CAPA-06 | 03, 04, 11, 13-15, 22 | Outside project cannot discover or invoke pack | ✓ SATISFIED | Paired outside discovery negative passed; completeness === "COMPLETE" on paired evidence unit. |
| CAPA-07 | 03, 05, 06, 09, 14, 16-18 | Distinct capability states | ✓ SATISFIED | Orthogonal axes and fail-closed unverified state remain substantive; durable evidence does not collapse them. |
| CAPA-08 | 10 | Six evidence-based domain packs without broad global profiles | ✓ SATISFIED | Exact six-domain fixture contract and near-miss logic remain wired; all tests pass. |

### Decision Coverage

All **17/17** `03-CONTEXT.md` decisions (including D-17 superseding D-09) are honored.

### Prohibition Review — Resolved in UAT

All 14 plan prohibitions were explicitly reviewed and passed in `03-UAT.md`.

### Gaps Summary

All 4 diagnosed gaps (`G-03-1`, `G-03-2`, `G-03-3`, `G-03-4`) have been fully resolved and verified by gap closure plans 03-19 through 03-22:
- `G-03-1` closed by 03-20
- `G-03-2` closed by 03-21
- `G-03-3` closed by 03-22
- `G-03-4` closed by 03-19

Phase 3 is complete and ready to advance to Phase 4.

---

_Verified: 2026-09-17T09:36:00.000Z_
_Verifier: Codex / Antigravity (gsd-verifier)_
