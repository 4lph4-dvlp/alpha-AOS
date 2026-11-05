# Phase 27 Plan 03 Summary: Shared Writer Coordinator and Safe Policy Rollback

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** MODE-04, MODE-05

## What was built

1. **Target Writer Coordinator (`src/core/writer-lock.ts`)**:
   - Added `policyTargetLockPath(canonicalRoot)` resolving `<canonicalRoot>/.alpha-aos-behavior.lock`.
   - Exported `PolicyTargetLockRecord`, `PolicyTargetSession`, `PolicyTargetConflictError`, and `acquirePolicyTargetSession`.
   - Binds `schemaVersion: 1`, `kind: "project-mode-target-lock"`, `canonicalRoot`, exact `rootIdentity` (`deviceExact`, `inodeExact`), random owner token, pid, host, startedAt, operationId, and planDigest.
   - Enforces exclusive creation with `wx` flag; rejects existing locks with `PolicyTargetConflictError` and diagnostic evidence.
   - Lock release checks the owner token and retains replaced/malformed locks on disk without deleting them.

2. **Additive Journal Metadata & Schema (`schemas/transaction-journal.schema.json`, `src/core/validation.ts`)**:
   - Added optional `policyOperation` to `schemas/transaction-journal.schema.json` and `CORE_SCHEMAS.journal` in `src/core/validation.ts`.
   - Closed-world definition: `kind: "project-mode"`, `canonicalRoot`, `rootIdentity` (`deviceExact`, `inodeExact`), `policyRelativePath: ".alpha-aos/behavior.json"`.
   - Preserves complete backward compatibility with existing generic journals.
   - Corrupt or malformed `policyOperation` metadata fails strict validation at consumption boundaries and prevents unsafe fallback to generic rollback.

3. **Safe Policy Apply & Atomic Rollback (`src/core/transaction.ts`)**:
   - Exported `PolicyOperationMetadata` and `PolicyMutationContext`.
   - Extended `FileTransactionOptions` with optional `policyOperation` and `policyContext`.
   - `applyFileTransaction` validates that policy operations have exactly 1 target matching `<canonicalRoot>/.alpha-aos/behavior.json` and allowedRoots includes `.alpha-aos`.
   - Apply failure recovery reuses active policy context without recursive lock acquisition.
   - `planManagedRollback` and `rollbackFileTransaction` strictly validate journals using `validateManagedDocument`.
   - Checked tree-off (`tree-policy.ts`) and root existence/exact identity prior to rollback preview/apply.
   - Target restoration durably and atomically writes exact original bytes (preserving CRLF and Unicode).
   - First-create rollback unlinks only `behavior.json` without sweeping `.alpha-aos` or sibling files.
   - Post-apply drift diagnostics for policy operations set `unifiedDiff: null` and omit file contents, preventing secret/sentinel disclosure in text and JSON output.

4. **Comprehensive Test Suite Coverage**:
   - `test/transaction.test.ts`: verified first-create rollback preserves `.alpha-aos` and siblings, replacement rollback restores exact CRLF/Unicode bytes, snapshot corruption halts rollback, and malformed metadata is rejected.
   - `test/rollback.test.ts`: verified policy drift diagnostics omit edited policy content and sentinels, canonical root identity mismatch refuses rollback, and tree policy "off" blocks rollback.
   - `test/rollback-cli-verification.test.ts`: verified CLI text and JSON rollback on drifted policy file omit secrets and diff snippets; first-create rollback preserves siblings.
   - `test/transaction-crash.test.ts`: verified state-only repair does not remove retained policy target lock, and release rejects mismatched tokens.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built
- `node scripts/run-tests.mjs --files dist/test/transaction.test.js dist/test/validation.test.js dist/test/rollback.test.js dist/test/rollback-cli-verification.test.js dist/test/transaction-crash.test.js`:
  - 52 tests executed: 52 passed, 0 failed, 0 skipped.
