---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 19
subsystem: capability-canary
tags: [canary, capability-ledger, ordering, backstop, fail-closed]

requires:
  - phase: 03-18
    provides: "Fail-closed argument matching, durable audited invocationEvidence, and persistent LocalAppData proof closure"
provides:
  - "Deterministic code-point ascending sorting (sortCapabilityReportRows, byCodePoint) for capability report rows"
  - "Format capability report table rows sorted by capability name then harness ID ascending"
  - "Offline automated test fixture proving equal-strength documentation proofs render in byte-identical harness-id ascending order across active non-Claude surfaces"
  - "Multi-harness proof persistence and round-trip verification across distinct non-Claude harness entries (codex, pi, hermes)"
affects: [phase-03-verification, capability-ledger, doctor-canary]

actuals:
  tokens: 18000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Offline equal-strength proof ordering is proven deterministically without live vendor API calls or Claude Code dependencies"
    - "Row formatting enforces code-point ascending tie-breaking on harness ID"

key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-19-SUMMARY.md
  modified:
    - src/core/canary.ts
    - src/format.ts
    - test/canary.test.ts
    - test/capability-ledger.test.ts

key-decisions:
  - "Under D-17, Claude Code is excluded from active verification. Equal-strength proof ordering is verified across active non-Claude harnesses (codex, pi, hermes) via offline fixtures."
  - "formatCapabilityReport sorts report rows deterministically using sortCapabilityReportRows so display order is invariant to input order or async completion order."

requirements-completed: [CAPA-01, CAPA-07]

coverage:
  - id: G-03-4
    description: "Offline equal-strength documentation proofs render in stable, byte-identical harness-id ascending order across active non-Claude surfaces."
    requirement: CAPA-01
    verification:
      - kind: unit
        ref: "test/canary.test.ts#offline equal-strength documentation proofs render in stable, byte-identical harness-id ascending order across active non-Claude surfaces (03-08 backstop / G-03-4)"
        status: pass
      - kind: unit
        ref: "test/capability-ledger.test.ts#multiple active non-Claude proofs stored in the ledger round-trip and retain their distinct harness entries without clobbering"
        status: pass
      - kind: integration
        ref: "npm test"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-09-17
---

# Plan 03-19 Summary: Deterministic Offline Equal-Strength Proof Rendering Fixture

## What Was Done
1. **Deterministic Row Sorting (`src/core/canary.ts`, `src/format.ts`):**
   - Added canonical `byCodePoint` string comparator and `sortCapabilityReportRows` in `src/core/canary.ts`.
   - Updated `formatCapabilityReport` in `src/format.ts` to sort all rows via `sortCapabilityReportRows` (primary key: capability, secondary key: harness ID) before rendering.
2. **Offline Ordering Invariance Test (`test/canary.test.ts`):**
   - Created test verifying that equal-strength documentation proofs (`nativeUse: "invoked"`, identical positive completeness) across active non-Claude harnesses (`codex` and `pi`) render in stable harness-id ascending order (`codex` before `pi`).
   - Verified that supplying rows in reversed or permuted order produces byte-identical output with 0 network calls and 0 model spend.
3. **Multi-Harness Persistence Test (`test/capability-ledger.test.ts`):**
   - Stored proofs for `codex`, `pi`, and `hermes` in the capability ledger and verified that all distinct harness entries survive round-tripping through the transactional writer and reader without clobbering.
4. **Full Verification:**
   - Ran `npm test` across the full test suite (765 tests; 758 passed, 7 skipped, 0 failed).
