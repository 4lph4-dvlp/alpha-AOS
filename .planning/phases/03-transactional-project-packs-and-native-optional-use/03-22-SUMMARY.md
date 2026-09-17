---
phase: 03-transactional-project-packs-and-native-optional-use
plan: 22
subsystem: capability-canary
tags: [canary, codex, representative-pack, provenance, capa-05, capa-06]

requires:
  - phase: 03-20
    provides: "Active Codex CAPA-02 research routing, stack policy canaryHarness, and CANARY_INSTRUCTION_ROOT.codex"
provides:
  - "Active Codex declaration for PACK_EXERCISE_FRONTEND_A11Y in catalog/canaries.yaml while retaining Claude compatibility"
  - "Canary selector and prompt vector support for Codex representative pack exercise (CAPA-05)"
  - "Verified project-local .agents/skills/ materialization with exact locked hashes from catalog/stack.lock.json"
  - "Durable project-local provenance recorded in .alpha-aos/receipts/WEB_REACT.json"
  - "Paired evidence unit proving in-scope discovery (CAPA-05) and out-of-scope absence (CAPA-06) for Codex"
affects: [phase-03-verification, capability-ledger, doctor-canary]

actuals:
  tokens: 38000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Active representative pack exercise anchored by Codex under D-17"
    - "Representative pack prompt names neither the pack nor skill, ensuring native intent-driven selection"
    - "Pack synchronization writes locked skill bytes into project-local .agents/skills/ with zero modifications"
    - "Atomic receipts record project-local provenance with sourceHash, targetHash, and destination paths"
    - "Paired evidence unit joins in-project discovery with ancestor-free negative discovery control"

key-files:
  created:
    - .planning/phases/03-transactional-project-packs-and-native-optional-use/03-22-SUMMARY.md
  modified:
    - catalog/canaries.yaml
    - test/canary.test.ts
    - test/capability-oracle.test.ts

key-decisions:
  - "Under D-17, Codex is declared alongside Claude for PACK_EXERCISE_FRONTEND_A11Y in catalog/canaries.yaml as the active verification anchor."
  - "The representative prompt is verified hint-free (naming neither WEB_REACT nor frontend-a11y), ensuring native intent-driven selection."
  - "Project-local provenance for Codex is established in .alpha-aos/receipts/WEB_REACT.json mapping .agents/skills/frontend-a11y/SKILL.md."
  - "Paired evidence unit validates in-project discovery and ancestor-free out-of-project absence for Codex, satisfying both CAPA-05 and CAPA-06."

requirements-completed: [CAPA-05]

coverage:
  - id: G-03-3
    description: "Active non-Claude (Codex) representative pack exercise, project-local provenance, and paired absence."
    requirement: CAPA-05
    verification:
      - kind: unit
        ref: "test/capability-oracle.test.ts#the pack-exercise canary is declared for the representative pack and names neither the skill nor a tool"
        status: pass
      - kind: unit
        ref: "test/canary.test.ts#the pack-exercise canary is declared for Codex and Claude in shipped catalog (plan 03-22 / G-03-3)"
        status: pass
      - kind: unit
        ref: "test/capability-oracle.test.ts#Codex representative pack exercise: materializes into .agents/skills with exact locked hashes, establishes receipt provenance, and verifies paired absence (plan 03-22 / G-03-3)"
        status: pass
      - kind: integration
        ref: "npm test"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-09-17
---

# Plan 03-22 Summary: Active Codex Representative Project Pack Exercise, Provenance, & Paired Absence

## What Was Done
1. **Catalog Declaration & Selection (`catalog/canaries.yaml`, `test/canary.test.ts`):**
   - Added `codex` to `harnesses` in `PACK_EXERCISE_FRONTEND_A11Y` in `catalog/canaries.yaml`, preserving existing `claude` declarations for backward compatibility.
   - Verified that the declared prompt text contains zero occurrences of the pack name (`WEB_REACT`) or the skill name (`frontend-design`, `frontend-a11y`, `a11y`, `accessib`), ensuring native intent-driven selection.
   - Added test in `test/canary.test.ts` verifying that `selectCanaries(catalog, { harness: "codex", capability: "CAPA-05" })` selects `PACK_EXERCISE_FRONTEND_A11Y`.
   - Verified that `canaryPromptArgs("codex", canary.prompt)` properly resolves the non-interactive invocation vector.
   - Added opt-in live test structure for Codex CAPA-05 gated behind `ALPHA_AOS_LIVE_CANARY === '1'`.
2. **Representative Pack Materialization & Receipt Provenance (`test/capability-oracle.test.ts`):**
   - Verified that `applyProjectPackSync` for `WEB_REACT` writes `frontend-a11y` into `.agents/skills/frontend-a11y/SKILL.md` (the project-local skill root for Codex).
   - Asserted that the written skill bytes match the locked SHA-256 digest with zero modifications.
   - Asserted that `.alpha-aos/receipts/WEB_REACT.json` records durable project-local provenance for Codex, including `sourceHash`, `targetHash`, and exact relative path `.agents/skills/frontend-a11y/SKILL.md`.
3. **Paired In-Scope Discovery & Out-of-Scope Absence (`test/capability-oracle.test.ts`):**
   - Added test running `runDiscoverySweep` across the project directory and an ancestor-free control directory.
   - Proved that the representative pack is discovered inside the project and absent outside it, producing a `COMPLETE` evidence unit with `nativeUse === "discovered"`.

## Verification
- `npm run check && npm run build && node scripts/run-tests.mjs --files dist/test/canary.test.js dist/test/capability-oracle.test.js`: All 149 tests passed.
- `npm test`: All 776 tests passed (767 passed, 9 skipped, 0 failed).
