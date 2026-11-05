# Phase 28 Plan 05 Summary: Owned Skill Routing Across Five Targets, Lock Integrity, and Runtime Contracts

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, ENTRY-05, ENTRY-06, ENTRY-07; Decisions D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-12, D-13, D-14, D-15, D-16, D-17, D-18, D-19, D-20

## What was built

1. **Canonical Owned Skill Routing Procedure (`skills/alpha-aos-task/SKILL.md`)**:
   - Replaced legacy unconditional two-path prompt and conflicting blanket shortcut bans with the shared `alpha-aos task intake --input <request.json> --json` procedure.
   - Preserved Policy-Only Request precedence (Section 1), query freshness, canonical root verification, and mode preference invariants.
   - Updated General Task Request (Section 2) to invoke `task intake` through a transient JSON document, immediately unlinking the temporary input within its authorized root.
   - Implemented precedence and decision dispatch:
     - Direct GSD command invocations (`explicit-command`): preserves command, workflow, phase, arguments, and native checkpoints without an unrelated chooser.
     - Explicit canonical styles (`explicit-style`): preserves full requested style (e.g. `대화형-quick-full`). Partial autopilot retains autopilot mode and prompts only for depth options (`오토파일럿-quick`, `오토파일럿-quick-full`, `오토파일럿-phase`).
     - Verified active task continuity (`continuation`): retains existing style and exact contract binding.
     - Proven simple operations (`simple-operation`): skips chooser and forced bootstrap (`nextAction: "execute-simple"`).
     - Clarification needed (`clarification-needed`): asks single returned discriminating question.
     - Substantial work (`substantial-work`): strict mode presents all six canonical options in exact order; flexible mode returns adaptive intake without mandatory 6-item chooser.
   - Retained strict Autopilot Boundary Invariants: zero inline implementation in chat, exact contract preview, exact-digest approval, and separate execution start command via isolated background runners.

2. **Catalog Lockfile Synchronization (`catalog/stack.lock.json`)**:
   - Recomputed SHA-256 for `alpha-aos-task` source and all five rendered targets (`claude`, `codex`, `antigravity`, `pi`, `hermes`) using `renderOwnedSkill`.
   - Exact hash verified: `0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0`.

3. **Task Runtime Controls Documentation (`docs/task-runtime-controls.md`)**:
   - Added complete "Task intake and execution style controls" specification.
   - Documented `task intake --input path [--json]` read-only contract, duplicate-key rejection, and 16 KiB pre-parse budget.
   - Documented the six canonical Korean labels, short descriptions, and numbers in approved order.
   - Documented native UI capability detection vs complete numbered 1–6 fallback, answer correlation via `pendingTaskId`, status detours, and cancellation.
   - Documented task-scoped style transport vs project-scoped mode preference, zero inline autopilot execution in chat, and deferred Phase 29/30 boundaries.

4. **Test Suites (`test/task-intake-routing.test.ts`)**:
   - Verified clean deployment and exact lockfile integrity across all 5 target fixtures (`claude`, `codex`, `antigravity`, `pi`, `hermes`).
   - Verified real compiled CLI execution across targets for strict chooser (all 6 ordered options), flexible adaptive intake, direct GSD command bypass, explicit style bypass, and local rename exemption.
   - Verified authority boundaries: `executionAuthorized: false`, zero file writes, and absence of `style` property in `.alpha-aos/behavior.json`.

## Source and Target Integrity Hashes

```json
"alpha-aos-task": {
  "sourceSha256": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0",
  "targetSha256": {
    "claude": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0",
    "codex": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0",
    "antigravity": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0",
    "pi": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0",
    "hermes": "0008e5e342fd6366c542b062e215afccc4e6f30af7003d8c381f5f904ec15df0"
  }
}
```

## Native Evidence Classes and Honest Limits (ENTRY-06)

- **Offline Target Deployment Fixtures**: Fully verified across all 5 targets (`claude`, `codex`, `antigravity`, `pi`, `hermes`). Verifies that `renderOwnedSkill` produces the canonical skill and matches the locked SHA-256 in temporary home sandboxes.
- **Compiled Shared CLI Subprocess Invocations**: Fully verified across all 5 target environment configurations (`ALPHA_AOS_STATE_DIR`, config roots). Verifies deterministic classification, root validation, and zero mutations.
- **Native Host Question Tools**: Unverified / Not Claimed. While `renderTaskStyleQuestion` supports native question rendering contracts where hosts expose 6-choice capabilities, tests treat live model tool delivery as unverified and ensure the complete 1–6 numbered text fallback operates cleanly across all environments.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built (`dist/build-artifact.json` generated)
- `node scripts/run-tests.mjs --files dist/test/task-intake-routing.test.js dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/task-intake-cli.test.js`:
  - 17 tests executed: 17 passed, 0 failed, 0 skipped.
- `node scripts/run-tests.mjs --files dist/test/task-contract.test.js`:
  - 30 tests executed: 30 passed, 0 failed, 0 skipped.
