# Phase 29 Plan 02 Summary: Absent-Project Request Preparation, Known Facts Transfer, and Bounded Persistence

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** BOOT-02, BOOT-04; Decisions D-05, D-06, D-07, D-08, D-13, D-14, D-15, D-16

## What was built

1. **Transaction-Bound Bootstrap Handoff Store (`src/core/task-bootstrap-store.ts`)**:
   - `persistTaskBootstrapHandoff`: Writes root-bound handoff record to `userStateRoot()/task-intake/<projectId>/<pendingId>.json` using `applyFileTransaction` outside `.planning` and project directories.
   - Enforces exact size and count limits: record size <= 32 KiB, request text <= 8192 chars and <= 16 KiB UTF-8, shortGoal <= 512, shortScope <= 1024, max 32 known facts (each <= 512 chars), max 16 arguments (each <= 512 chars), and max 16 source references.
   - Enforces secret detection (`detectSuspectedSecret`) rejecting raw tokens (GitHub PATs, OpenAI/Anthropic keys, AWS credentials, Bearer tokens) without echoing raw values in diagnostics.
   - Restricts `pendingId` to alphanumeric/dash/underscore (rejects path traversals e.g. `../traversal`).
   - Idempotency & Collision handling: duplicate prepare calls with identical content digest succeed idempotently; duplicate prepare calls with different content digest refuse with `pending-id-collision`.
   - `readTaskBootstrapHandoff`: reads and validates record bounds, content digests, and canonical root containment.

2. **Task Bootstrap Service & Native Input Builder (`src/core/task-bootstrap.ts`)**:
   - `prepareTaskBootstrap`: Revalidates canonical root and project behavior policy, runs fresh readiness check, generates deterministic `contentDigest` and `planDigest`.
   - Read-only preview (`apply: false`) previews proposed destination path, status, readiness diagnosis, and plan digest with 0 filesystem writes.
   - Applied operation (`apply: true`) requires matching `planDigest` to prevent drift.
   - `inspectTaskBootstrap`: Read-only inspection returning public status, pendingId, content digest, and opaque references without leaking confidential request text or private facts.
   - `buildNativeBootstrapInput`: Constructs structured conversational prompt for GSD new-project workflow containing goal, scope, and provenance-tagged known facts; preserves user checkpoints without synthesizing `--auto`.

3. **Task Bootstrap CLI & Schema Integration (`src/cli.ts`, `schemas/task-bootstrap.schema.json`)**:
   - Added `alpha-aos task bootstrap --input <packet.json> [--apply] [--plan-digest <digest>] [--json]` subcommand.
   - Rejects positional operands and missing input options.
   - Serializes `TaskBootstrapError` into redacted JSON error envelopes.
   - Extended `schemas/task-bootstrap.schema.json` with closed operation definitions.

4. **Test Suites (`test/task-bootstrap-handoff.test.ts`, `test/task-bootstrap-cli.test.ts`)**:
   - Preview zero-write verification against sandbox manifest.
   - Applied persistence test verifying state-root record creation and zero mutations in project directory.
   - Idempotency test and collision rejection test for matching and conflicting content digests.
   - Full round-trip tests for all 6 canonical style IDs and explicit command arguments.
   - Negative boundary tests for suspected credentials, path traversals, stale plan digests, and oversized inputs.
   - Public inspection leakage test ensuring private facts and raw requests are omitted from public JSON.
   - CLI tracer tests verifying command dispatch, argument parsing, text formatting, and JSON output.

## Verification Evidence

- `npm run check`: 0 errors.
- `npm run build`: cleanly built (`dist/build-artifact.json` updated).
- `node scripts/run-tests.mjs --files dist/test/task-bootstrap-handoff.test.js dist/test/task-bootstrap-cli.test.js dist/test/task-intake-continuity.test.js dist/test/redaction.test.js`:
  - 34 tests executed: 34 passed, 0 failed, 0 skipped.
- Zero-write verification: sandbox project directory confirmed completely untouched during preview and project setup.

## Commit References

- `41d1f45`: `feat(29-02): prepare absent-project request for native conversation and reject unsafe handoffs`
