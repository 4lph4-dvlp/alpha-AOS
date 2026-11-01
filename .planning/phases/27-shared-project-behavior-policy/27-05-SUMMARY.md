# Phase 27 Plan 05 Summary: Five-Target Mode Routing, Fresh Intake, and Truthful Native Evidence

**Executed:** 2026-11-02  
**Status:** Completed (Native verification open for human review per D-12)  
**Requirements fulfilled:** MODE-01, MODE-02, MODE-03, MODE-04, MODE-05  

## What was built

1. **Five-Target Owned Skill Routing (`skills/alpha-aos-task/SKILL.md`)**:
   - Added `### 1. Project Behavior Policy Request` section preceding general task intake.
   - Instructs agents to resolve project mode via `alpha-aos project mode [path] --json` before task intake.
   - For mode change requests, queries policy, previews change, displays the reviewed `planDigest`, and invokes `--apply --plan-digest <digest>` using already-granted user authority without demanding copied terminal commands or manual JSON edits.
   - For mixed requests, applies the setting change first, then resumes task intake with a freshly reread policy.
   - Establishes the **Mode Preference Invariant (No Authority Expansion)**: A mode change request is solely a preference toggle (`strict` vs `flexible`) and MUST NOT be treated as task execution consent.
   - Retains strict autopilot boundaries: exact-digest contract approval and separate start authorization remain mandatory.
   - Preserves bound task canonical root guard: any root mismatch blocks execution rather than switching projects.

2. **Stack Lock Integrity (`catalog/stack.lock.json`)**:
   - Recomputed `alpha-aos-task` source SHA-256 (`b09adce603f26cb12c4e8f8ecb0f8ace4aac8f3cefd364cea8e50afc5a50c00e`).
   - Recomputed and synchronized identical rendered hashes across all 5 target harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`).

3. **Multi-Target Routing & Fresh Intake Verification (`test/project-mode-routing.test.ts`)**:
   - Verified that `planOwnedSkillSync` and `applyOwnedSkillSync` deploy the updated skill cleanly with exact matching hashes across all 5 disposable target homes.
   - Proved cross-target policy visibility: Target A (`stateRootA`) previews and applies `flexible` mode; Target B (`stateRootB`) executes next-intake query on the canonical root and immediately observes `flexible` with the exact same revision without inheriting Target A's state.
   - Verified structural skill boundaries: policy-only request section precedes general task request, mandates fresh reads, and maintains zero authority expansion.

4. **Documentation Updates (`README.md`, `docs/task-runtime-controls.md`)**:
   - Added command documentation for `alpha-aos project mode [path] [--json]` and `alpha-aos project mode set strict|flexible [path] [--apply] [--plan-digest <digest>] [--json]`.
   - Explained default `strict` with `missing` revision, same-mode no-op zero mutations, and byte-level SHA-256 revision tracking.
   - Documented the physical coordinator (`.alpha-aos-behavior.lock`), finite retry on contention, and single-target transaction rollback.
   - Documented honest native evidence boundaries: distinguishing fixture proof from live host receipts.

5. **Native Evidence & Validation Sign-Off (`27-NATIVE-EVIDENCE.md`, `27-VALIDATION.md`)**:
   - Documented all 5 target host versions and invocation surfaces.
   - Recorded Antigravity as `proven` in the active session.
   - Truthfully classified Claude, Codex, Pi, and Hermes as `unavailable` for live model inference because chargeable API calls and global package mutations are unauthorized in unattended CI execution.
   - Set native proof status to `human_needed` / open for human check per D-12.
   - Marked `27-VALIDATION.md` as `nyquist_compliant: true` and `status: executed`.

6. **Test Isolation Hardening (`test/task-wait.test.ts`)**:
   - Isolated `waitTask` invocations in `test/task-wait.test.ts` from ambient controller locks present in `process.cwd()` during active task executions.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built (311 inputs, 612 outputs)
- `npm run build:check`: verified (311 inputs, 612 outputs)
- `node scripts/run-tests.mjs --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/project-mode-concurrency.test.js`:
  - 32 tests executed: 31 passed, 0 failed, 1 skipped (symlinks unsupported on host).
- `node scripts/run-tests.mjs --files dist/test/task-wait.test.js`:
  - 52 tests executed: 52 passed, 0 failed, 0 skipped.
