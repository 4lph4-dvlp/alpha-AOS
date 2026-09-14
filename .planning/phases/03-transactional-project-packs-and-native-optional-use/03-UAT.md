---
status: partial
phase: 03-transactional-project-packs-and-native-optional-use
source: [03-VERIFICATION.md]
started: 2026-09-14T06:39:32.385Z
updated: 2026-09-14T12:34:23.5428638Z
---

## Current Test

[testing paused — 4 blocked items outstanding]

## Tests

### 1. CAPA-02 Native Research Routing

expected: Run the positive multi-source research canary and ordinary-lookup control on an authorized claimed harness without naming skills or tools. Exa discovery must precede bounded Firecrawl extraction, and the ordinary lookup must touch no more than one research server.
result: blocked
blocked_by: third-party
reason: "현재 claude는 계정이 없어서 사용할 수 없는 상태야. 일단 앞으로의 개발에서 claude에 대한 고려는 배제해"

### 2. CAPA-03 Receiving Handoff

expected: Complete an explicit Unified Memory handoff to an authorized receiving harness and judge its answer against the handed-off sentinel. The receiver must genuinely use the context while `.planning/` remains byte-identical and GSD-authoritative.
result: blocked
blocked_by: third-party
reason: "Claude 계정이 없어 지원되는 Hermes→Claude 및 Codex→Claude 수신 handoff를 실행할 수 없고, 앞으로 Claude를 개발 고려 대상에서 제외하기로 확인함."

### 3. CAPA-05 Representative Pack Exercise

expected: Exercise the project-local exact-hash pack with the ordinary declared intent-matched task. The harness must naturally select it, show its provenance, and keep it undiscoverable to the outside control.
result: blocked
blocked_by: third-party
reason: "Claude 계정이 없고 앞으로 Claude를 개발 고려 대상에서 제외하므로, 현재 Claude 전용 native pack 선택 canary를 실행할 수 없음."

### 4. Stable Ordering Backstop

expected: Supply two equally strong documentation proofs and repeat rendering. Both runs must render harness-id ascending with byte-identical order.
result: blocked
blocked_by: third-party
reason: "현재 CAPA-01 ledger의 Codex proof는 invoked지만 Claude proof는 unverified이며, Claude 제외 정책 때문에 동일 강도의 두 surface proof를 만들 수 없음."

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
issues: 0
pending: 0
skipped: 0
blocked: 4

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
