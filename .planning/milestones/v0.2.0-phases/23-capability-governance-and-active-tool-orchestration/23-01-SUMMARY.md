---
status: complete
phase: 23
plan: 1
---

# 23-01 Summary: Governance Precedence Hierarchy

Established `alpha-aos-task` as the highest-priority task intake authority across all five harnesses, while preserving native shortcuts under alpha-AOS governance and preventing agents from silently bypassing user intake interviews.

## Accomplishments

1. **`AGENTS.md` Governance Hierarchy**:
   - Refactored `## GSD Workflow Enforcement & alpha-AOS Governance` to declare a strict two-layer architecture:
     - **Layer 1: Primary Intake Authority (Top Priority)**: All natural task requests and intents route first through `alpha-aos-task`, requiring path confirmation (Ordinary Conversational GSD vs Autonomous Autopilot). Unilateral bypass to bare `$gsd-quick` is explicitly forbidden.
     - **Layer 2: Execution Entry Points & Native Shortcuts**: Preserved `$gsd-quick`, `$gsd-debug`, and `$gsd-execute-phase` as downstream execution mechanisms subordinate to `alpha-aos-task` intake rules.
     - **Non-trivial Task Guard**: Bare quick is barred from bypassing research on tasks involving external repositories, new tools, or architecture decisions.
2. **`skills/alpha-aos-task/SKILL.md` Alignment**:
   - Added explicit `Precedence Invariant (No Ambient Shortcut Bypass)` and documented that shortcuts operate downstream of intake confirmation.
3. **Lock & Multi-Harness Sync**:
   - Re-computed SHA-256 hash for `skills/alpha-aos-task/SKILL.md` (`9fdbde08...`) and updated `catalog/stack.lock.json`.
   - Applied transactional owned-skill sync across all 5 harnesses: Claude, Codex, Antigravity, Pi, and Hermes.
4. **Invariant Test Suite**:
   - Added `test/task-governance-hierarchy.test.ts` testing marker preservation, top priority intake declarations, shortcut preservation, anti-bypass rules, and lock hash parity (3/3 pass).

## Verification

- `npm run check` passed.
- `npm run build` and `scripts/build-artifact.mjs check` passed (242 inputs, 480 outputs).
- `node scripts/run-tests.mjs --files dist/test/task-governance-hierarchy.test.js` passed with 3/3 tests green.
