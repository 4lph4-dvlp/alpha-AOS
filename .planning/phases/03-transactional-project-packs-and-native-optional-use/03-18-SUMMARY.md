---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 18
subsystem: capability-canary
tags: [codex, context7, capability-ledger, fail-closed, durable-evidence]

requires:
  - phase: 03-17
    provides: "Native Codex CAPA-01 selection, isolated invocation, and fail-closed explicit filters"
provides:
  - "Fail-closed required argument-pattern matching for version-sensitive CAPA-01 evidence"
  - "Closed, redacted invocationEvidence retained on CapabilityProof without invalidating legacy rows"
  - "Strict offline, opt-in live, production-CLI, and post-process retained-ledger completion gates"
affects: [phase-03-verification, capability-ledger, doctor-canary, phase-04-gates]

actuals:
  tokens: 6038
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Unchecked required evidence is a failing verdict, never affirmative absence"
    - "Durable proof projections copy only closed redacted observation classifications and verdict fields"
    - "Legacy compatibility permits an absent audit projection but strict completion never treats absence as evidence"

key-files:
  created: []
  modified:
    - src/core/canary.ts
    - src/core/capability-ledger.ts
    - schemas/capability-ledger.schema.json
    - test/canary.test.ts
    - test/capability-ledger.test.ts

key-decisions:
  - "A declared argument pattern participates in the final held predicate: unchecked is fail-closed and produces nativeUse=unverified."
  - "CapabilityProof.invocationEvidence is additive and optional for legacy readability, but only a present audited projection can satisfy strict CAPA-01 completion."
  - "The durable projection reconstructs each allowed observation and verdict field instead of spreading runtime objects, preventing raw arguments, responses, model text, authentication data, environment values, or credentials from entering the ledger."

patterns-established:
  - "Immediate/durable agreement: a live result and its independently reopened ledger proof must agree on native use, order, counts, patterns, and observations."
  - "Persistent closure artifact: native verification leaves a reviewed LocalAppData ledger after the production CLI exits, then a separate process audits it."

requirements-completed: [CAPA-01, CAPA-07]

coverage:
  - id: D1
    description: "Missing query-docs.libraryId shape metadata fails held and cannot promote native use, while the complete ordered version-scoped route still invokes."
    requirement: CAPA-01
    verification:
      - kind: unit
        ref: "test/canary.test.ts#a declared pattern is still reported unchecked when the record carries no shape for it"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the shipped documentation canary has one strict completion route and five fail-closed controls"
        status: pass
    human_judgment: false
  - id: D2
    description: "Capability proofs optionally retain closed redacted observations and a complete verdict while legacy proofs remain readable without fabricated evidence."
    requirement: CAPA-07
    verification:
      - kind: unit
        ref: "test/capability-ledger.test.ts#a redacted audited invocation proof survives the transactional ledger round trip"
        status: pass
      - kind: unit
        ref: "test/capability-ledger.test.ts#a legacy proof without invocation evidence round-trips without fabricated evidence"
        status: pass
      - kind: integration
        ref: "npm run check; npm run build; node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/capability-ledger.test.js"
        status: pass
    human_judgment: false
  - id: D3
    description: "The opt-in live Codex test proves immediate and temporary-ledger verdict agreement with no Claude result."
    requirement: CAPA-01
    verification:
      - kind: e2e
        ref: "$env:ALPHA_AOS_LIVE_CANARY='1'; node scripts/run-tests.mjs --files dist/test/canary.test.js"
        status: pass
    human_judgment: false
  - id: D4
    description: "The production Codex CLI leaves one independently auditable CAPA-01 proof at the reviewed persistent LocalAppData state root."
    requirement: CAPA-01
    verification:
      - kind: e2e
        ref: "node dist/src/cli.js doctor --canary . --harness codex --capability CAPA-01 --json"
        status: pass
      - kind: other
        ref: "post-process retained-ledger PowerShell audit -> RETAINED_CAPA01_PROOF_OK"
        status: pass
    human_judgment: false
  - id: D5
    description: "Non-inferable CAPA-02, CAPA-03, and CAPA-05 native exercises, two backstops, and twelve judgment prohibitions remain explicit end-of-phase human checks."
    verification: []
    human_judgment: true
    rationale: "These claims depend on native model behavior, interruption timing, multi-surface ordering, or human policy judgment; fixtures and source presence cannot establish them."

duration: 19min
completed: 2026-09-14
status: complete
---

# Phase 03 Plan 18: Fail-Closed Durable Codex Proof Summary

**Version-sensitive Codex documentation use now fails closed on unchecked evidence and leaves a closed redacted ledger proof that remains independently auditable after the production CLI exits.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-14T02:39:21Z
- **Completed:** 2026-09-14T02:58:47Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added unchecked required argument patterns to the final expectation predicate, so an unclassified `query-docs.libraryId` produces `held=false` and `nativeUse=unverified`.
- Added optional typed and schema-closed `invocationEvidence` containing only ordered redacted MCP observations and the complete final verdict; legacy proofs remain readable with the property absent.
- Proved the strict completion matrix offline, ran the live Codex test against temporary state, ran the production CLI against reviewed persistent LocalAppData state, and independently reopened the retained ledger after process exit.

## Task Commits

1. **Task 1 RED: Failing durable CAPA-01 proof tests** — `22d4357` (test)
2. **Task 1 GREEN: Fail-closed matching and durable invocation evidence** — `98cfc8e` (feat)
3. **Task 2: Strict matrix and live immediate/durable verification** — `5c6a4a9` (test)

**Plan metadata:** committed after this summary and the sequential state updates were written.

## Files Created/Modified

- `src/core/canary.ts` — Requires zero unchecked patterns for `held` and reconstructs the durable redacted proof projection.
- `src/core/capability-ledger.ts` — Defines the three named invocation-evidence types and the optional proof field.
- `schemas/capability-ledger.schema.json` — Adds the recursively closed optional evidence contract while retaining schema version one and legacy compatibility.
- `test/canary.test.ts` — Covers the missing-shape failing direction, strict completion matrix, immutable projection copies, and opt-in live Codex ledger agreement.
- `test/capability-ledger.test.ts` — Covers valid audited/legacy round trips and rejects unknown keys, invalid identifier-shape enums, and malformed nested verdicts.

## Decisions Made

- Unchecked is distinct from unsatisfied for diagnosis, but both prevent `held`; lack of checkable evidence is never proof of invocation.
- The ledger retains one additive projection on the existing `(projectId, harness, capability, polarity)` proof identity; no second ledger or identity axis was introduced.
- The persistent closure artifact is referenced only as `[local-app-data]/alpha-aos-verification/phase-03-capa-01/capabilities/ledger.json`; resolved profile paths and raw live output remain outside repository artifacts.

## Durable Automated Verdict

The production command exited zero and returned exactly one Codex `DOCUMENTATION_VERSION_SCOPED` result and no Claude result. A separate post-process read selected exactly one `(projectId=null, harness=codex, capability=CAPA-01, polarity=positive)` proof and established:

- top-level and retained verdict `nativeUse=invoked`
- `held=true`, `expectationsHeld=true`, and `ordered=true`
- positive `observationCount` equal to the retained observation array length
- `query-docs.libraryId` satisfied and absent from `uncheckedArgumentPatterns`
- `resolve-library-id` before `query-docs`
- at least one retained `query-docs` observation with `identifierShape=version-scoped`

Retained artifact: `[local-app-data]/alpha-aos-verification/phase-03-capa-01/capabilities/ledger.json`.

## Human Verification Remaining

The automated proof-completeness gap is closed. The following remain end-of-phase human checks and were not reclassified as fixture evidence:

1. CAPA-02 native multi-source research positive/control behavior.
2. CAPA-03 real receiving-harness handoff behavior with `.planning/` authority unchanged.
3. CAPA-05 representative native project-pack selection and provenance.
4. Stable ordering of equally strong documentation proofs and non-promotion when interrupted before the observation sink closes.
5. The twelve judgment-only prohibitions in `03-VERIFICATION.md`.
6. Preserve the no-Claude-account direction; no Claude turn was requested or spent.

## TDD Gate Compliance

- **RED:** `22d4357` compiled and ran 140 focused tests with exactly three expected failures: unchecked shape incorrectly held, proof projection absent, and valid audited proof rejected by the old schema.
- **GREEN:** `98cfc8e` passed type-check, build, and 140/140 focused tests.
- **Verification expansion:** `5c6a4a9` adds the Task 2 strict matrix and opt-in live gate after the Task 1 behavior was green; Task 2 owns no production implementation file.

No plan-level RED/GREEN gate is missing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- Pre-change focused baseline: 136/136 pass.
- Task 1 RED: 140 total, 137 pass, 3 expected failures.
- Task 1 GREEN and tracer feedback gate: 140/140 pass after `npm run check` and `npm run build`.
- Task 2 default focused gate: 142 total, 141 pass, 0 fail, 1 opt-in live skip.
- Opt-in live Codex suite: 107/107 pass, 0 skip.
- Persistent production CLI: `RETAINED_CAPA01_LEDGER=[local-app-data]/alpha-aos-verification/phase-03-capa-01/capabilities/ledger.json`.
- Separate ledger audit: `RETAINED_CAPA01_PROOF_OK` at the same redacted location.
- Full repository suite: 763 total, 756 pass, 0 fail, 7 skip. The additional skip relative to the prior six-platform-skip baseline is the opt-in live test, which passed separately in the same execution.

## Known Stubs

None. The live test is opt-in in the ordinary suite to avoid unintended model spend, and it executed successfully under the explicit Task 2 gate.

## User Setup Required

None - the existing Codex login was reused by reference; no credential value or new service configuration was introduced.

## Next Phase Readiness

- The automated CAPA-01 proof-completeness blocker in `03-VERIFICATION.md` is closed.
- CAPA-02, CAPA-03, CAPA-05, the two explicit backstops, and judgment-only prohibitions remain routed to end-of-phase human verification.

## Self-Check: PASSED

- All five modified production/test/schema files exist.
- Commits `22d4357`, `98cfc8e`, and `5c6a4a9` exist in history and contain no tracked-file deletions.
- Every task acceptance criterion and plan-level automated verification command passed.
- The retained ledger was read after the production CLI exited; no SUMMARY-only claim is required to reconstruct the CAPA-01 verdict.

---
*Phase: 03-transactional-project-packs-and-native-optional-use*
*Completed: 2026-09-14*
