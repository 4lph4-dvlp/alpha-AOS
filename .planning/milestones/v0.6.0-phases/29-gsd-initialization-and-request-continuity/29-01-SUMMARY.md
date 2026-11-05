# Phase 29 Plan 01 Summary: Native GSD Readiness Inspection, Public Diagnostic CLI Tracer, and Zero-Write Boundary

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** BOOT-01; Decisions D-01, D-02, D-03, D-04, D-21

## What was built

1. **Closed Task Readiness and Bootstrap Schema (`schemas/task-bootstrap.schema.json`)**:
   - Closed bounded version 1 interchange schema for task readiness and bootstrap inspection.
   - Enforces `schemaVersion: 1`, controller harness enum (`claude`, `codex`, `antigravity`, `pi`, `hermes`), bounded `workflow` (max 128 chars), optional `phase`, bounded `arguments` (max 16 items of max 512 chars), and optional `projectRoot` / `boundProjectRoot`.
   - `additionalProperties: false` ensures caller cannot smuggle unverified authority flags.

2. **Native GSD Project Readiness Service (`src/core/task-gsd-readiness.ts`)**:
   - `GsdProjectReadiness` and `inspectGsdProjectReadiness`: Resolves canonical root and behavior policy without mutations, identifies controller harness config root without cross-harness fallback, and diagnoses Hermes as explicitly unsupported.
   - Bounded native query runner seam (`executeGsdQuery`): queries `runtime-identity`, `init.resume`, and workflow-specific queries (`init.quick`, `init.phase-op`, `init.plan-phase`, `init.execute-phase`).
   - Categorizes native findings into six distinct diagnostic classes:
     - `missing-runtime`: when `gsd-tools.cjs` or the requested controller runtime is not installed.
     - `absent-project`: when `.planning` does not exist (`planning_exists: false`).
     - `partial-project`: when `init_incomplete: true`, or required workflow artifacts are missing, or `milestones_exists: true` with missing active roadmap/state (between-milestones state routing to `new-milestone` / `progress`).
     - `ready`: when all required workflow artifacts and native agent skills are verified present.
     - `probe-error`: on process failure, timeout, capped stdout (> 1 MiB), malformed/non-JSON output, or native project root mismatch.
     - `unsupported`: on Hermes controller, unmapped workflow queries, or missing required phase parameters.
   - Fails closed with `ready: false` and `execution-blocked` capability diagnostics when `agents_installed: false`.
   - Follows safe bounded `@file:` query outputs with absolute path validation, UTF-8 decoding, and 1 MiB file size limits.
   - Rejects duplicate JSON keys, invalid UTF-8 bytes, and oversized files (> 16 KiB) via typed `TaskReadinessError`.

3. **CLI Integration and Text Formatter (`src/cli.ts`, `src/format.ts`)**:
   - Added `alpha-aos task readiness --input <request.json> [--json]` subcommand.
   - Rejects `--apply`, positional operands, and missing `--input`.
   - Formatter `formatGsdProjectReadiness` outputs canonical root, controller, runtime version, workflow, diagnosis, ready flag, execution authorization (`false`), satisfied prerequisites, missing prerequisites, next action, and reasons.
   - Error serializer converts `TaskReadinessError` into structured, redacted JSON error envelopes.

4. **Backward-Compatible Quick Readiness (`src/core/task-gsd.ts`)**:
   - `probeGsdQuickReadiness` retains its `{ ready, reason, gsdToolsPath }` signature.
   - Fails closed on `init_incomplete: true` or `agents_installed: false` without performing automatic bootstrap or state mutation.

5. **Test Suites (`test/task-gsd-readiness.test.ts`, `test/task-bootstrap-cli.test.ts`)**:
   - Unit tests covering all six diagnostic classes, Hermes rejection, runtime missing, partial bootstrap recovery, between-milestones state, probe errors, `@file:` output resolution, and input boundary validation.
   - Compiled CLI tracer verifying `--apply` rejection, operands rejection, text formatting, JSON output, and zero filesystem writes across home, state root, and project directory.

## Verification Evidence

- `npm run check`: 0 errors.
- `npm run build`: built successfully (`dist/build-artifact.json` updated).
- `node scripts/run-tests.mjs --files dist/test/task-gsd-readiness.test.js dist/test/task-bootstrap-cli.test.js dist/test/task-doctor-gsd.test.js dist/test/task-gsd.test.js`:
  - 33 tests executed: 33 passed, 0 failed, 0 skipped.
- Zero-write verification: sandbox home, state root, and project directory fingerprints confirmed completely identical before and after readiness queries.

## Commit References

- `f371c48`: `feat(29-01): inspect native prerequisites through public CLI`
- `dd1977d`: `feat(29-01): keep workflow compatibility and honest diagnostics`
