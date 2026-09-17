---
status: diagnosed
phase: 03-transactional-project-packs-and-native-optional-use
source: [03-VERIFICATION.md]
started: 2026-09-14T06:39:32.385Z
updated: 2026-09-14T12:34:23.5428638Z
---

## Current Test

[completed — all 6 items evaluated; 4 issues diagnosed under D-17 for gap planning]

## Tests

### 1. CAPA-02 Native Research Routing

expected: Run the positive multi-source research canary and ordinary-lookup control on an authorized claimed harness without naming skills or tools. Exa discovery must precede bounded Firecrawl extraction, and the ordinary lookup must touch no more than one research server.
result: issue
reason: "Under D-17, Claude is excluded from active development and verification. Shipped CAPA-02 canaries in catalog/canaries.yaml are Claude-only, catalog/stack.yaml names canaryHarness: claude, and CANARY_INSTRUCTION_ROOT.codex is null. Active non-Claude canary declaration and runtime instruction support are required."

### 2. CAPA-03 Receiving Handoff

expected: Complete an explicit Unified Memory handoff to an authorized receiving harness and judge its answer against the handed-off sentinel. The receiver must genuinely use the context while `.planning/` remains byte-identical and GSD-authoritative.
result: issue
reason: "Under D-17, Claude is excluded from active development. Shipped handoff declarations and default pairs target Claude only, and Codex cannot currently receive owned handoff instructions because CANARY_INSTRUCTION_ROOT.codex is null. A genuine two-harness active non-Claude handoff pair is required."

### 3. CAPA-05 Representative Pack Exercise

expected: Exercise the project-local exact-hash pack with the ordinary declared intent-matched task. The harness must naturally select it, show its provenance, and keep it undiscoverable to the outside control.
result: issue
reason: "Under D-17, Claude is excluded from active development. PACK_EXERCISE_FRONTEND_A11Y is Claude-only and no active non-Claude native-selection proof exists in the ledger. Active non-Claude pack exercise declaration and tests are required."

### 4. Stable Ordering Backstop

expected: Supply two equally strong documentation proofs and repeat rendering. Both runs must render harness-id ascending with byte-identical order.
result: issue
reason: "Under D-17, equal-strength proof rendering must be proven deterministically through an offline fixture with at least two active non-Claude harness IDs, without requiring a second live vendor surface."

### 5. Interrupted Sink Backstop

expected: Interrupt a canary before its observation sink closes. No invocation proof may be promoted or written.
result: pass
evidence: A temporary Codex canary was terminated while still running after 123 observation bytes were written; its isolated state root contained no ledger file and zero proofs.

### 6. Fourteen Prohibitions

expected: Resolve every row in the 03-VERIFICATION.md Prohibition Review table as pass, fail, or blocked with evidence. No item may be silently accepted; explicitly clarify the 03-13 spending supersession and 03-18 durable-evidence scope.
result: pass
evidence: Type checking and build passed; 446 focused tests produced 445 passes, 0 failures, and 1 intentional opt-in live skip. The fourteen individual decisions are recorded below.

## Summary

total: 6
passed: 2
issues: 4
pending: 0
skipped: 0
blocked: 0

## Prohibition Decisions

| # | Plan | Result | Evidence and judgment |
|---|---|---|---|
| 1 | 03-01 | pass | Approved-artifact path bounds and transactional sync/rollback tests passed; apply targets come from the reviewed artifact. |
| 2 | 03-03 | pass | Pairing tests passed; an unpaired positive renders `INCOMPLETE` with a withheld native-use axis. |
| 3 | 03-04 | pass | Oracle and type-level tests passed; discovery produces no invocation axis and cannot be promoted as use. |
| 4 | 03-05 | pass | Every shipped canary prompt passed token-level hint checks and names no expected skill, server, or tool. |
| 5 | 03-05 | pass | Readiness, runtime, MCP, and ledger tests passed; credential values and copied authentication bytes have no observable evidence path. |
| 6 | 03-09 | pass | One-shot reporting calls no writer, leaves project bytes unchanged, and offers only the reviewed removal-digest command. |
| 7 | 03-09 | pass | Every surface ceiling reason is non-empty and cited; the recorded reasons remain consistent with the versioned harness behavior and current local command availability checked in this UAT. |
| 8 | 03-13 | pass | Claim-note tests passed; adding inference or scope notes leaves completeness, native-use, and paired verdict unchanged. |
| 9 | 03-13 | pass | The no-spend prohibition is scoped to the 03-13 gap-closure work. Plan 03-18 later and explicitly authorized the Codex paid completion gate with login precondition and pre-run cost disclosure, so it supersedes rather than silently violates that earlier task-local restriction. |
| 10 | 03-14 | pass | Report and JSON tests passed; `notRunReason`, rendered `NOT-RUN`, and the three axis names describe the same facts without borrowing support vocabulary. |
| 11 | 03-15 | pass | CI sets `ALPHA_AOS_REQUIRE_UPSTREAM_MCP=1`; helper branch tests and all three pinned server tool-set tests passed with no `continue-on-error` or equivalent weakening. |
| 12 | 03-18 | pass | Missing `query-docs.libraryId` shape produces an unchecked required pattern, `held=false`, and `nativeUse=unverified`; the strict matrix passed. |
| 13 | 03-18 | pass | “Durable audit evidence” is resolved as the strict `invocationEvidence` projection. Its closed schema contains classified observation metadata and verdict fields only—no raw MCP arguments/responses, model output, authentication bytes, environment values, or credential values. Legacy `oracle.command` is launch metadata and is not accepted as strict completion evidence. |
| 14 | 03-18 | pass | Legacy proofs round-trip without fabricated `invocationEvidence`, and the strict retained-proof gate requires the property and all completion fields before accepting a proof. |

## Gaps

- gap_id: G-03-1
  status: failed
  truth: "CAPA-02 multi-source research routing and ordinary-lookup control on an active non-Claude surface"
  reason: "catalog/canaries.yaml declares both CAPA-02 canaries only for Claude, catalog/stack.yaml still names policy.canaryHarness: claude, and CANARY_INSTRUCTION_ROOT.codex is null even though Codex has a bounded observation-front launch path."
  severity: high
  test: "Run the research positive and ordinary control on an active non-Claude surface (anchored by Codex) and assert ordered Exa->Firecrawl discovery and single-server control behavior."
  root_cause: "Canary declarations and runtime instruction paths were authored exclusively for Claude in Phase 03 Wave 5-8 before Claude was excluded by D-17."
  artifacts:
    - catalog/canaries.yaml
    - catalog/stack.yaml
    - src/core/canary.ts
  missing: "Active Codex CAPA-02 canary declarations, runtime instruction root configuration, and deterministic ordered/fan-out assertions without deleting Claude compatibility."
  diagnosis_note: "Ready for $gsd-plan-phase 3 --gaps"

- gap_id: G-03-2
  status: failed
  truth: "CAPA-03 explicit handoff between two distinct active non-Claude harnesses with .planning immutability"
  reason: "Shipped handoff declaration is Claude-only, default HANDOFF_HARNESS_PAIRS target Claude, CLI fallback resolves absent target as Claude, and Codex cannot receive owned handoff instructions because CANARY_INSTRUCTION_ROOT.codex is null."
  severity: high
  test: "Run an explicit Unified Memory handoff between two active non-Claude harnesses (e.g. Hermes->Codex) and prove receiver context use with byte-identical .planning hash."
  root_cause: "Handoff wiring assumed Claude Code as the universal receiver in 03-12."
  artifacts:
    - catalog/canaries.yaml
    - src/core/canary.ts
    - src/cli.ts
  missing: "Evidence-backed active non-Claude handoff pair, receiving runtime support for Codex, and immutability verification."
  diagnosis_note: "Ready for $gsd-plan-phase 3 --gaps"

- gap_id: G-03-3
  status: failed
  truth: "CAPA-05 representative project pack exercise on an active non-Claude harness with project-local provenance"
  reason: "PACK_EXERCISE_FRONTEND_A11Y is Claude-only and there is no retained active non-Claude native-selection proof in the ledger."
  severity: high
  test: "Exercise the materialized exact-hash pack with an intent prompt on an active non-Claude harness (anchored by Codex) and verify native selection and project-local provenance."
  root_cause: "Representative pack exercise was configured and probed solely against Claude in 03-11."
  artifacts:
    - catalog/canaries.yaml
    - src/core/canary.ts
  missing: "Active non-Claude pack exercise declaration, test runner integration, and preservation of locked skill bytes and CAPA-06 absence boundary."
  diagnosis_note: "Ready for $gsd-plan-phase 3 --gaps"

- gap_id: G-03-4
  status: failed
  truth: "Stable equal-strength proof rendering in harness-id ascending order without live vendor dependencies"
  reason: "The prior UAT expected a live Claude proof only because no held-out automated test existed; equal-proof ordering must be proven deterministically offline."
  severity: medium
  test: "Supply equivalent documentation proofs across at least two active non-Claude harness IDs in varied input orders and assert repeated byte-identical harness-id-ascending output."
  root_cause: "03-08 backstop was marked non-inferable and left without an automated fixture test."
  artifacts:
    - src/core/canary.ts
    - test/canary.test.ts
  missing: "Offline deterministic fixture feeding equivalent proofs across multiple active non-Claude harness IDs and asserting invariant sorting."
  diagnosis_note: "Ready for $gsd-plan-phase 3 --gaps"
