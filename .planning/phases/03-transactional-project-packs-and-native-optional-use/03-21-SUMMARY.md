---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 21
subsystem: capability-canary
tags: [canary, codex, hermes, pi, handoff, unified-memory, planning-immutability, capa-03]

requires:
  - phase: 03-20
    provides: "Active Codex CAPA-02 research routing, stack policy canaryHarness, and CANARY_INSTRUCTION_ROOT.codex"
provides:
  - "Active non-Claude handoff pairs prioritized in HANDOFF_HARNESS_PAIRS: hermes -> codex, pi -> codex, codex -> hermes"
  - "Active Codex declaration for CROSS_HARNESS_HANDOFF in catalog/canaries.yaml while retaining Claude compatibility"
  - "Codex receiving runtime materialization of alpha-AOS-owned memory-handoff steering instruction into .agents/skills"
  - "Auditable planning tree immutability witness proving byte-for-byte identical .planning/ digests across cross-harness handoff"
  - "Fail-closed invalidation on any planning tree mutation, preserving GSD lifecycle state authority"
affects: [phase-03-verification, capability-ledger, doctor-canary]

actuals:
  tokens: 36000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Active non-Claude handoff pairs prioritize Hermes/Pi workers to Codex receivers under D-17"
    - "Canary runtime materializes alpha-aos-memory-handoff into Codex .agents/skills only for CAPA-03"
    - "Planning tree SHA-256 recursive digest witness proves .planning/ immutability across handoffs"
    - "GSD lifecycle state is authoritative; Unified Memory is non-authoritative context"

key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-21-SUMMARY.md
  modified:
    - catalog/canaries.yaml
    - src/cli.ts
    - src/core/canary.ts
    - test/canary.test.ts

key-decisions:
  - "Under D-17, active non-Claude pairs (hermes -> codex, pi -> codex, codex -> hermes) are prioritized first in HANDOFF_HARNESS_PAIRS, with legacy Claude pairs retained as fallback."
  - "Codex is declared as a supported receiving harness in CROSS_HARNESS_HANDOFF in catalog/canaries.yaml."
  - "handoffRow and CLI default receiving harness falls back to codex instead of claude."
  - "Planning tree immutability is strictly enforced: any mutation to .planning/ yields INCOMPLETE with withheld nativeUse axis."

requirements-completed: [CAPA-03]

coverage:
  - id: G-03-2
    description: "Active non-Claude (Hermes -> Codex) cross-harness handoff pair with .planning immutability."
    requirement: CAPA-03
    verification:
      - kind: unit
        ref: "test/canary.test.ts#the handoff canary is declared in the shipped catalog and names neither a harness pair nor a tool"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a handoff run pairs the vault positive with the planning-tree negative into one COMPLETE unit"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#a planning file that moves during the handoff makes the negative fail and the unit INCOMPLETE, naming the file"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the handoff report names both harnesses with their versions and states the scope limit last"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#an unavailable preferred pair falls back to the declared fallback, and the row says which pair actually ran"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#codex runtime materializes owned steering instructions including scoped CAPA-03 into .agents/skills (plan 03-21 / G-03-2)"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#handoff pair resolution preserves fallback to legacy Claude pairs when active non-Claude targets are unavailable"
        status: pass
      - kind: integration
        ref: "npm test"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-17
---

# Plan 03-21 Summary: Active Non-Claude Cross-Harness Handoff Pair with .planning Immutability

## What Was Done
1. **Catalog Declaration & Handoff Priority (`catalog/canaries.yaml`, `src/core/canary.ts`, `src/cli.ts`):**
   - Added `codex` to `CROSS_HARNESS_HANDOFF.harnesses` in `catalog/canaries.yaml` alongside `claude`.
   - Updated `HANDOFF_HARNESS_PAIRS` in `src/core/canary.ts` to prioritize active non-Claude pairs first:
     1. `hermes -> codex` (preferred D-17 active pair)
     2. `pi -> codex` (active alternative)
     3. `codex -> hermes` (active alternative)
     4. `hermes -> claude` (legacy fallback)
     5. `codex -> claude` (legacy fallback)
   - Updated default fallback receiving harness in `handoffRow` and `src/cli.ts` from `"claude"` to `"codex"`.
2. **Codex Receiving Runtime Steering Materialization (`src/core/canary.ts`):**
   - Verified that `createCanaryRuntime` for `codex` when `capability: "CAPA-03"` writes `skills/alpha-aos-memory-handoff/SKILL.md` into `<runtimeRoot>/codex/.agents/skills/alpha-aos-memory-handoff/SKILL.md`.
3. **Immutability & Offline Verification Coverage (`test/canary.test.ts`):**
   - Updated catalog declaration test to assert both `claude` and `codex` can host canary runtimes.
   - Updated primary handoff test to verify the preferred declared pair `hermes (0.20.6) -> codex (0.152.0)` produces a `COMPLETE` unit with matching planning tree digests.
   - Updated handoff report test asserting `source hermes 0.20.6, target codex 0.152.0`.
   - Updated fallback test verifying `withoutHermes` selects `pi -> codex` and renders row with receiving harness `codex`.
   - Added test proving fallback to legacy `hermes -> claude` pair when non-Claude pairs are unavailable.
   - Added test proving Codex runtime materializes `alpha-aos-memory-handoff` under `.agents/skills` only for `CAPA-03`.
   - Verified that planning tree tampering fails closed (`INCOMPLETE`, naming modified path, with nativeUse withheld).

## Verification
- `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/canary.test.js`: All 116 tests passed.
- `npm test`: All 773 tests passed (765 passed, 8 skipped, 0 failed).
