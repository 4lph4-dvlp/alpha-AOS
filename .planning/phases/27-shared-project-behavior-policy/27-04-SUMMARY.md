# Phase 27 Plan 04 Summary: Apply Project Mode Changes and Concurrent Writer Exclusion

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** MODE-01, MODE-03, MODE-04, MODE-05

## What was built

1. **Reviewed Project Mode Apply Implementation (`src/core/behavior-policy.ts`)**:
   - Implemented and exported `applyProjectModeChange` and its result contract `ApplyProjectModeResult`.
   - Linearization point: Pre-checks current view and compares against reviewed digest.
   - Zero-mutation same-mode shortcut: When requested mode equals current valid mode and bytes/plan digest match, returns `{ change: "current", mode, operationId: null, ... }` without creating any lock, transaction, session, or journal.
   - Two-phase lock acquisition: For real mutations, acquires physical target coordinator lock (`<canonicalRoot>/.alpha-aos-behavior.lock`), then acquires the state session.
   - Inside-lock verification: Freshly re-resolves input, validates root identity, re-reads file bytes, re-checks path containment, and recalculates the plan digest. Refuses with `"stale-plan"` if live state changed since preview.
   - Transactional execution: Executes single-target transaction via `applyFileTransaction` with `policyOperation` metadata and held `policyContext`.
   - Guarantees deterministic reverse cleanup of locks (state session then target lock) in both success and error paths.

2. **CLI Integration & Output Formatting (`src/cli.ts`, `src/format.ts`)**:
   - Extended `project mode set` to support `--apply` and required `--plan-digest <digest>`.
   - Rejects apply attempts without `--plan-digest` with helpful guidance showing current plan digest.
   - Added `formatApplyProjectModeResult` in `src/format.ts` to output human-readable confirmation of created/replaced/current mode status and operation ID.
   - Enforces observable byte budget and redaction on CLI JSON and text output envelopes.

3. **Concurrency & Exclusion Testing (`test/project-mode-concurrency.test.ts`)**:
   - Verified that two competing processes reviewing the same initial state with separate state roots result in exactly one winner and one stale refusal (MODE-04, D-19).
   - Proved that canonical root aliases share the same physical target coordinator lock.
   - Confirmed that retrying with a stale plan digest after a winner finishes is rejected without overwriting current policy.
   - Verified complete lifecycle of apply followed by rollback, verifying that the target coordinator lock is completely removed after each step and initial absence/content is durably restored.

4. **CLI Full Lifecycle Testing (`test/project-mode-cli.test.ts`)**:
   - Verified end-to-end preview, apply, stale digest rejection, same-mode no-op zero writes, and rollback restoration.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built
- `node scripts/run-tests.mjs --files dist/test/project-mode-concurrency.test.js dist/test/project-mode-cli.test.js dist/test/transaction-crash.test.js`:
  - 21 tests executed: 21 passed, 0 failed, 0 skipped.
- `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js dist/test/rollback-cli-verification.test.js`:
  - 31 tests executed: 30 passed, 0 failed, 1 skipped (symlinks unsupported on host).
