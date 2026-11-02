# Phase 30 Plan 03 Summary: Native Stage Receipts and Honest Observation Seam

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** STYLE-05, STYLE-07

## What was built

1. **Closed GSD Stage Receipts and Full Evidence Verification (`src/core/task-gsd-stages.ts`, `schemas/task-gsd-stage-receipt.schema.json`)**:
   - Implemented `TaskGsdStageReceipt` and `schemas/task-gsd-stage-receipt.schema.json` with strict schema validation.
   - Bound exact root, contractDigest, revision, runId, quickId, stage, quality ("full"), harness, sessionId, runtimeVersion, workflowSha256, invocation locator/digest, result locator/digest, outcome, evaluatedCommit, inputArtifacts, and outputArtifacts.
   - Implemented exact boundary and precision limits (STYLE-05):
     - Max receipt raw bytes: 65536 bytes (65535/65536 allowed, 65537 rejected).
     - Max per-run receipts: 64 (63/64 allowed, 65 rejected).
     - Max artifact references per receipt: 32 (31/32 allowed, 33 rejected).
     - Max relative path length: 512 chars.
     - Max detail length: 1000 chars.
   - Enforced symlink and path escape rejection: artifacts and receipts cannot be symbolic links and cannot escape the project root.
   - Implemented `requiredGsdQuickStages`: returns seven mandatory stages (`discussion`, `research`, `planning`, `plan-check`, `implementation`, `verification`, `state-docs`) plus optional active native gates (e.g. `code-review`).
   - Implemented `verifyGsdFullEvidence`: evaluates an ordered observed receipt chain against on-disk artifacts and baseline commits, checking actual file hashes rather than relying on executor claims or a fictional `PLAN-CHECK.md`.

2. **Native Stage Observation Seam & Codex Event Correlation (`src/core/task-gsd-stage-observation.ts`, `src/adapters/task-codex.ts`, `src/adapters/task-agents.ts`, `src/core/task-run.ts`, `src/cli.ts`)**:
   - Implemented `observeCodexStages`: extracts and correlates native stage tool invocations with tool result events from Codex's JSONL stdout stream.
   - Correlates invocation ID and result callId, verifying session lineage, model and effort identity, and input/output artifact references.
   - Fails closed on:
     - Duplicate invocation/result IDs (replay attacks).
     - Mixed session ancestry (invocation and result in different sessions).
     - Model/effort mismatches against approved contract policy.
     - Capped output streams or unobserved/missing stage results.
     - Controller claim alone or terminal exit 0 without observed stage tool events.
   - Wired `codexStageObservationCapability` into `createDynamicTaskPorts` and `nativeTaskPorts`:
     - Supported for Codex controller (`supported: true`, harness: `codex`).
     - Explicitly unsupported for non-Codex controllers (`supported: false`, naming missing capability).
   - Wired observed stage persistence in `startTask` when running with full quality.
   - Updated `readTaskStartReadiness` in CLI to verify stage observation capability against contract agent policy.

3. **Test Suite Coverage (`test/task-gsd-stages.test.ts`, `test/task-gsd-stage-observation.test.ts`)**:
   - Verified schema compilation and exact structure.
   - Verified digest computation and tampered digest detection.
   - Verified exact byte length boundaries (65535, 65536 allowed; 65537 rejected).
   - Verified artifact reference count boundaries (32 allowed; 33 rejected).
   - Verified per-run receipt count boundaries (64 allowed; 65 rejected).
   - Verified complete 7-stage chain verification with actual disk artifacts.
   - Verified one-at-a-time negative cases: missing stages, failed outcomes, tampered digest, hash mismatch, symlink artifacts, and path escape.
   - Verified native event parsing, event replay rejection, mixed session ancestry rejection, wrong model/effort rejection, capped stream rejection, and claim-only rejection.
   - Verified mock `runCodexController` integration populating `stageObservation`.

## Verification Evidence

- `npm run check`: Passed (0 errors).
- `npm run build`: Passed (339 inputs, 668 outputs).
- Targeted test suites:
  - `dist/test/task-gsd-stages.test.js`: 8 tests passed.
  - `dist/test/task-gsd-stage-observation.test.js`: 8 tests passed.
  - `dist/test/task-quick-quality.test.js`: 8 tests passed.
  - `dist/test/task-harness-adapters.test.js`: 8 tests passed.
- All 32 tests passed with 0 failures, 0 skipped.

## Commits

1. `d9356be`: `feat(task-gsd): verify observed full-stage chain with exact artifact inputs`
2. `67d7557`: `feat(task-codex): collect supported native full-stage results without trusting claims`
