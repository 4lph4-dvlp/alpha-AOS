---
status: complete
phase: 03-transactional-project-packs-and-native-optional-use
source: [03-VERIFICATION.md]
started: 2026-09-14T06:39:32.385Z
updated: 2026-09-17T09:35:00.000Z
---

## Current Test

[completed — all 6 items evaluated; all 4 gaps closed under D-17]

## Tests

### 1. CAPA-02 Native Research Routing

expected: Run the positive multi-source research canary and ordinary-lookup control on an authorized claimed harness without naming skills or tools. Exa discovery must precede bounded Firecrawl extraction, and the ordinary lookup must touch no more than one research server.
result: pass
evidence: Plan 03-20 added `codex` declarations in `catalog/canaries.yaml`, set `policy.canaryHarness: codex` in `catalog/stack.yaml`, wired `CANARY_INSTRUCTION_ROOT.codex` to `.agents/skills`, and proved fail-closed ordered Exa -> Firecrawl matching within max 2 servers, single-server ordinary lookup bounds, and forbidden tool enforcement.

### 2. CAPA-03 Receiving Handoff

expected: Complete an explicit Unified Memory handoff to an authorized receiving harness and judge its answer against the handed-off sentinel. The receiver must genuinely use the context while `.planning/` remains byte-identical and GSD-authoritative.
result: pass
evidence: Plan 03-21 prioritized active non-Claude pairs (`hermes -> codex`, `pi -> codex`, `codex -> hermes`) in `HANDOFF_HARNESS_PAIRS`, declared `codex` in `CROSS_HARNESS_HANDOFF`, proved Codex receiving runtime steering materialization into `.agents/skills`, and verified recursive planning tree byte immutability and fail-closed corruption detection.

### 3. CAPA-05 Representative Pack Exercise

expected: Exercise the project-local exact-hash pack with the ordinary declared intent-matched task. The harness must naturally select it, show its provenance, and keep it undiscoverable to the outside control.
result: pass
evidence: Plan 03-22 declared `codex` for `PACK_EXERCISE_FRONTEND_A11Y` in `catalog/canaries.yaml`, verified hint-free prompt text, proved project-local `.agents/skills` materialization with unchanged locked hashes, verified `.alpha-aos/receipts/WEB_REACT.json` provenance, and proved paired in-project discovery and out-of-project absence.

### 4. Stable Ordering Backstop

expected: Supply two equally strong documentation proofs and repeat rendering. Both runs must render harness-id ascending with byte-identical order.
result: pass
evidence: Plan 03-19 proved deterministic offline equal-strength proof rendering in byte-identical harness-id ascending order across active non-Claude surfaces (`antigravity`, `codex`, `hermes`, `pi`) regardless of input array permutation.

### 5. Interrupted Sink Backstop

expected: Interrupt a canary before its observation sink closes. No invocation proof may be promoted or written.
result: pass
evidence: A temporary Codex canary was terminated while still running after 123 observation bytes were written; its isolated state root contained no ledger file and zero proofs.

### 6. Fourteen Prohibitions

expected: Resolve every row in the 03-VERIFICATION.md Prohibition Review table as pass, fail, or blocked with evidence. No item may be silently accepted; explicitly clarify the 03-13 spending supersession and 03-18 durable-evidence scope.
result: pass
evidence: Type checking and build passed; full test suite passed with 776 tests (767 passed, 9 intentional opt-in/live skips, 0 failures). The fourteen individual decisions are recorded below.

## Summary

total: 6
passed: 6
issues: 0
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
  status: closed
  truth: "CAPA-02 multi-source research routing and ordinary-lookup control on an active non-Claude surface"
  closure_plan: "03-20-PLAN.md"
  verification: "test/canary.test.ts verifies active Codex CAPA-02 declaration, canaryHarness: codex, CANARY_INSTRUCTION_ROOT.codex, strict ordered Exa -> Firecrawl matching, and single-server control."

- gap_id: G-03-2
  status: closed
  truth: "CAPA-03 explicit handoff between two distinct active non-Claude harnesses with .planning immutability"
  closure_plan: "03-21-PLAN.md"
  verification: "test/canary.test.ts verifies active non-Claude HANDOFF_HARNESS_PAIRS (hermes -> codex, pi -> codex), Codex receiving runtime instruction materialization, and byte-identical .planning/ tree immutability witness."

- gap_id: G-03-3
  status: closed
  truth: "CAPA-05 representative project pack exercise on an active non-Claude harness with project-local provenance"
  closure_plan: "03-22-PLAN.md"
  verification: "test/canary.test.ts and test/capability-oracle.test.ts verify active Codex PACK_EXERCISE_FRONTEND_A11Y declaration, locked byte preservation, .alpha-aos/receipts/WEB_REACT.json provenance, and paired inside/outside discovery absence."

- gap_id: G-03-4
  status: closed
  truth: "Stable equal-strength proof rendering in harness-id ascending order without live vendor dependencies"
  closure_plan: "03-19-PLAN.md"
  verification: "test/canary.test.ts verifies deterministic offline equal-strength proof rendering fixture in byte-identical harness-id ascending order across active non-Claude surfaces (antigravity, codex, hermes, pi)."
