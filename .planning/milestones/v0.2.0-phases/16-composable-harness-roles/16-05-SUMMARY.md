---
phase: 16-composable-harness-roles
plan: "05"
subsystem: core
tags: [telemetry-normalization, missing-telemetry-meter, task-doctor, task-cli]
requires: ["16-01", "16-02"]
provides: [telemetry-normalization, cost-meter-readiness-gate, 3d-task-doctor]
affects: [task-telemetry, task-doctor, cli]
tech-stack:
  added: []
  patterns: [telemetry-normalization, fail-closed-meter-gate, diagnostic-3d-matrix]
key-files:
  created:
    - src/core/task-telemetry.ts
    - src/core/task-doctor.ts
    - test/task-telemetry.test.ts
    - test/task-doctor.test.ts
  modified:
    - src/cli.ts
    - test/task-cli.test.ts
key-decisions:
  - "D-13: Telemetry normalization preserves honest nulls and status unmetered rather than coercing unmetered fields to 0 or 0.00 USD."
  - "D-14: Contracts specifying maxCostUsd or maxTokens fail closed at preview, approve, and start with MISSING_TELEMETRY_METER if any assigned harness does not meter that resource."
  - "D-15: Hermes, Codex, Antigravity, and Pi are never assumed free ($0.00) simply because they lack cost telemetry."
  - "D-16: alpha-aos task doctor renders a structured 3D matrix table reporting proven roles, MCP capabilities, and telemetry metering across all 5 supported harnesses."
requirements-completed: [ROL-05]
coverage:
  - deliverable: "Telemetry normalization and honest null preservation"
    verification:
      kind: command
      ref: "dist/test/task-telemetry.test.js"
      status: pass
    human_judgment: false
  - deliverable: "Task Doctor 3D matrix report and CLI integration"
    verification:
      kind: command
      ref: "dist/test/task-doctor.test.js"
      status: pass
    human_judgment: false
duration: 12 min
completed: 2026-10-02
---

# Phase 16 Plan 05: Telemetry Normalization, MISSING_TELEMETRY_METER Gate & 3D Task Doctor Summary

Implemented strict telemetry normalization with honest null preservation, fail-closed `MISSING_TELEMETRY_METER` limit gate across CLI preview/approve/start workflows, and the 3D Task Doctor diagnostic matrix (`alpha-aos task doctor [--json]`) inspecting roles, MCP, and telemetry across all 5 harnesses (ROL-05, D-13, D-14, D-15, D-16).

## Accomplishments
- Implemented `src/core/task-telemetry.ts` defining `HARNESS_TELEMETRY_CAPABILITIES`, `normalizeHarnessTelemetry`, and `checkCostMeterReadiness`. Fields that are not measured by a harness remain `null` with status `"unmetered"` instead of 0 or $0.00 USD (D-13, D-15).
- Integrated `checkCostMeterReadiness` fail-closed gate into `src/cli.ts` in `readTaskStartReadiness` (populating `missingProof`), `task start --apply`, `task preview`, and `task approve --apply`, rejecting resource limits on unmetered harnesses with `MISSING_TELEMETRY_METER` (D-14).
- Implemented `src/core/task-doctor.ts` providing `buildTaskDoctorReport` and `formatDoctorTable`, checking role receipts (`PROVEN` / `UNVERIFIED` / `MISSING`), native MCP adapters, and telemetry capabilities across `claude`, `codex`, `antigravity`, `pi`, and `hermes`.
- Wired `alpha-aos task doctor [--json]` into `src/cli.ts` dispatching either a structured 4-column ASCII matrix or a JSON envelope `{ status: "ok", harnesses: [...] }`, rejecting `--apply` without side effects.
- Created `test/task-telemetry.test.ts` (8 tests) and `test/task-doctor.test.ts` (4 tests), plus updated `test/task-cli.test.ts` to verify doctor subcommands and receipt output matching.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-telemetry.test.js dist/test/task-limits.test.js dist/test/task-doctor.test.js dist/test/task-cli.test.js && npm run check`: All 48 tests passed, 0 type errors.

## Next Steps
- Wave 5 (Plan 16-06): Native task adapters for Antigravity, Pi, and Hermes, Codex controller hardening, live defect tracer, and final phase verification.
