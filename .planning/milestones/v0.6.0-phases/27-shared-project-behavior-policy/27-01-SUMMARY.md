# Phase 27 Plan 01 Summary: Project Behavior Policy Query Tracer and Guarded Resolution

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** MODE-01, MODE-02 (partial query), MODE-03, MODE-05

## What was built

1. **Closed Behavior Policy Schema (`schemas/behavior-policy.schema.json`)**:
   - Schema version 1 with required `schemaVersion` (const 1) and `mode` (enum `["strict", "flexible"]`).
   - `additionalProperties: false` preventing extra or namespaced fields.

2. **Guarded Policy Resolution (`src/core/behavior-policy.ts`)**:
   - `resolveProjectBehavior`: Resolves canonical root via the standard root ladder (`resolveCanonicalRoot`).
   - Enforces tree-off checks on both invocation path and canonical root.
   - Proves policy path containment against canonical root (`provePathBoundary` and `recheckPathProof`).
   - Distinguishes absent policy (returning `builtin-default` strict with revision `missing` and `exists: false`) under an intact readable ancestor chain from invalid, unreadable, directory, or escaping paths.
   - Employs strict JSON parsing (`parseManagedDocument`) to reject malformed JSON and duplicate keys.
   - Validates unsplit parsed values against `schemas/behavior-policy.schema.json` via `validateAgainstSchema`.
   - Projects safe diagnostics via `BehaviorPolicyError` with `code`, `path`, `cause`, `causeCategory`, and `remediation` without leaking arbitrary property names or file contents.

3. **CLI Integration and Formatting (`src/cli.ts`, `src/format.ts`)**:
   - Early `project mode [path] [--json]` query route before pack commands.
   - Rejects mutation flags (`--apply`, `--plan-digest`) and surplus operands on query.
   - `formatProjectBehavior` outputs canonical root, root reason, project ID, policy path, existence, effective mode, source, and revision.
   - JSON error serialization in `serializeCliError` formatting safe `BehaviorPolicyError` diagnostics.

4. **Test Suites (`test/project-mode-cli.test.ts`, `test/behavior-policy.test.ts`)**:
   - End-to-end compiled CLI subprocess tracer confirming zero writes across sandbox home, state root, and project directory.
   - Comprehensive boundary matrix: malformed JSON, duplicate keys, invalid modes, unsupported schema versions, non-directory roots, directory policy paths, task bound root mismatches, tree-off isolation, declaration boundaries, and worktree/submodule boundaries.

## Verification Evidence

- `npm run check`: 0 errors
- `npm run build`: built cleanly (manifest updated)
- `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/evidence.test.js dist/test/path-boundary.test.js dist/test/project.test.js`:
  - 102 tests executed: 95 passed, 0 failed, 7 skipped (host capability skips: Windows unprivileged symlinks / POSIX mode 0o000).
- Zero-write verification: sandbox home, sandbox state, and project directories retained identical SHA-256 fingerprints before and after CLI queries.
