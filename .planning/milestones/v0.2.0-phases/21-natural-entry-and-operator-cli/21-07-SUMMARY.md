# Phase 21 Plan 07: Targeted Doctor and Structured Error JSON Contracts

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-07  
**Requirements:** UX-01, UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-07 finalizes the environment sweep vs. targeted task doctoring paths and unifies error serialization into structured, redacted JSON responses:

1. **D-16 Targeted Doctor vs Environment Sweep**:
   - `task doctor` without an operand performs an environment-wide sweep across all 5 harnesses and GSD lifecycle diagnostics without implicitly selecting any recent task or run.
   - `task doctor <contract-id | run-id>` runs `diagnoseTargetedTask`, inspecting blocking findings, role support proofs, stop/lease fencing, GSD status, and resume blockers for the explicitly targeted task or run.
   - Invalid or non-existent identifiers fail closed (`NOT_FOUND` / `RUN_NOT_FOUND`) without falling back to recent runs or other tasks (T-21-15).
   - Invariant: doctor diagnostics remain strictly read-only and mutate zero state.

2. **D-17 Structured Error JSON Contracts**:
   - `serializeCliError` in `src/cli.ts` produces a structured JSON error envelope (`status`, `reasonCode`, `reason`, `nextAction`, `contractId?`, `runId?`, `contractDigest?`, `evidence?`).
   - Handles `TaskContractError`, `TaskRunError`, and standard CLI exceptions with typed `reasonCode`s (`STALE_DIGEST`, `APPROVAL_REQUIRED`, `UNSUPPORTED_ROLE`, `MISSING_METER`, `STOP_PENDING`, `RESUME_BLOCKED`, `RUN_NOT_FOUND`, `NOT_FOUND`, `CONTRACT_INVALID`, `DIRTY_BASELINE`, etc.).
   - Identifiers (`contractId`, `runId`, `contractDigest`) are validated strictly before inclusion, preventing arbitrary or untrusted strings from being echoed as valid IDs.
   - Secret redaction (T-21-14) is enforced on all output surfaces; sensitive credentials and tokens are redacted from both stdout JSON and stderr human messages.
   - Preserves non-zero exit code (exit code 2) while emitting parseable JSON to stdout when `--json` is supplied for task commands.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js dist/test/task-cli-review.test.js dist/test/task-doctor.test.js dist/test/task-skill.test.js && npm run check`:
  - 63 tests executed across task CLI, capabilities, review, doctor, and skill suites.
  - 63 tests passed, 0 failures.
  - TypeScript strict typecheck clean.
- `npm run build:check`:
  - Build artifact manifest verified (231 inputs, 460 outputs).

---

## 3. Files Modified

- `src/core/task-doctor.ts`: Added `diagnoseTargetedTask`, `formatTaskTargetedDoctorReport`, and `TaskTargetedDoctorReport`.
- `src/format.ts`: Re-exported `formatTaskTargetedDoctorReport` and `TaskTargetedDoctorReport`.
- `src/cli.ts`: Wired targeted doctor when operand/runId is supplied; implemented `serializeCliError` and emitted structured JSON errors on stdout for task failures with `--json`.
- `src/adapters/coursepilot-task.ts`: Preserved D-17 prerequisite in missingProof when probe returns non-ok.
- `test/task-cli.test.ts`: Added tests for targeted doctor vs environment sweep (D-16), and structured error JSON across CLI failure modes (D-17, T-21-14, T-21-15).
- `test/catalog.test.ts`: Updated ownedSkills test expectations for `alpha-aos-task`.
- `test/install.test.ts`: Updated plan components ownedSkills length for `alpha-aos-task`.
- `test/task-capability-fixtures.test.ts`: Added `owned:alpha-aos-task` capability fixture and updated total count to 78.
- `test/capability-oracle.test.ts`: Updated total capability count from 77 to 78 and total cells from 385 to 390.
