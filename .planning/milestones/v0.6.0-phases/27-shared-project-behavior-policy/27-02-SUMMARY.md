# Phase 27 Plan 02 Summary: Exact Root Replacement Detection and Mode Plan Preview

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** MODE-03, MODE-04, MODE-05

## What was built

1. **Exact Root Replacement Detection (`src/core/path-boundary.ts`)**:
   - Added optional decimal string fields `deviceExact` and `inodeExact` to `PathComponentIdentity` using `lstat(..., { bigint: true })`.
   - Populated legacy `device` and `inode` numeric fields only when values are safely representable (`Number.isSafeInteger`).
   - Implemented `compareComponentIdentity`: compares exact decimal string identities when present; allows legacy numeric comparisons only if both values are safe integers; returns `unprovable-filesystem` if unsafe integers are encountered.
   - Updated `provePathBoundary` filesystem capability to require exact device and nonzero inode on existing components.

2. **Read-Only Mode Transition Planner (`src/core/behavior-policy.ts`)**:
   - Implemented `planProjectModeChange(input, requestedMode)` returning `ProjectModePlan`.
   - Binds canonical root, exact root identity (`deviceExact`, `inodeExact`), policy path, coordinator path (`.alpha-aos-behavior.lock`), current existence/source/revision/mode, requested mode, change kind (`create`, `replace`, `current`), and `planDigest` using `reviewedDigest("project-mode-plan-v1", ...)`.
   - Zero writes: preview generates no files, directories, locks, or journals.
   - Distinct revision: whitespace and CRLF edits change the raw bytes SHA-256 and produce a distinct plan digest.

3. **CLI Preview Integration (`src/cli.ts`, `src/format.ts`)**:
   - Added `project mode set strict|flexible [path] [--plan-digest <digest>] [--apply] [--json]`.
   - Rejects empty/invalid modes, surplus positional arguments, unknown flags, and duplicate `--plan-digest`.
   - Rejects `--apply` at this wave with actionable message explaining apply is available in Wave 4.
   - `formatProjectModePlan` renders preview details with root identity, coordinator path, change kind, and review instructions.

4. **Test Verification (`test/path-boundary.test.ts`, `test/behavior-policy.test.ts`, `test/project-mode-cli.test.ts`)**:
   - Verified adjacent BigInt inode values above `Number.MAX_SAFE_INTEGER` compare unequal and serialize to JSON without `BigInt` errors.
   - Verified legacy unsafe numeric proofs fail with `unprovable-filesystem`.
   - Verified `planProjectModeChange` correctly transitions `create`, `replace`, and `current` across missing, existing, and whitespace-modified policy files.
   - Verified CLI `project mode set` previews leave project, sandbox state, and home directories byte-for-byte unchanged.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: cleanly built
- `node scripts/run-tests.mjs --files dist/test/path-boundary.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js dist/test/project-mode-cli.test.js`:
  - 49 tests executed: 43 passed, 0 failed, 6 skipped (Windows unprivileged symlinks / POSIX mode 0o000).
