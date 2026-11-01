---
phase: 15-durable-supervisor-and-effect-ledger
plan: 02
subsystem: process-control
tags: [process-tree, cancellation, abort-signal, taskkill, safety-bounds, node-test]

requires:
  - phase: 14
    provides: "runProcess and process boundary execution"
provides:
  - "Cross-platform process tree termination (terminateProcessTree, terminateProcessTreeGraceful)"
  - "AbortSignal cancellation support in runProcess with output and hash retention"
  - "Mandatory attempt safety bounds: 15-minute timeout (ATTEMPT_PROCESS_TIMEOUT_MS) and 10MB stream buffer cap (ATTEMPT_MAX_OUTPUT_BYTES)"
affects: [15-04, 15-06]

actuals:
  tokens: 36000
  tasks: 2
  commits: 1
plan_head_before: 72945eb38e88e2c39e248b64e0a7f1a302fe1ff5

tech-stack:
  added: []
  patterns:
    - "Whole process-tree termination across Windows (/T /F) and POSIX process groups"
    - "Non-blocking signal abort listener with post-termination buffer flush before resolution"
    - "Mandatory per-attempt bounds unbypassable even in unlimited mode"

key-files:
  created:
    - test/task-process.test.ts
  modified:
    - src/core/process.ts

key-decisions:
  - "Process cancellation retains all pre-cancellation stdout/stderr bytes, redacts them, and preserves stream SHA-256"
  - "ATTEMPT_PROCESS_TIMEOUT_MS (15 min) and ATTEMPT_MAX_OUTPUT_BYTES (10 MB) established as safety ceiling constants"
  - "terminateProcessTreeGraceful provides SIGTERM with a 500ms grace window before falling back to SIGKILL on POSIX"

patterns-established:
  - "Cancelled runProcess returns code: 'cancelled' and terminates child tree immediately"
  - "Stream buffers flush on process close so evidence is captured before result resolution"

requirements-completed: [RUN-03]

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 02: Cross-Platform Process Tree Termination, Cancellation, and Safety Bounds Summary

**Enhanced `src/core/process.ts` with cross-platform process tree termination (`terminateProcessTree`, `terminateProcessTreeGraceful`), `AbortSignal` cancellation support with output retention, and mandatory per-attempt safety bounds (15-minute timeout, 10MB stream buffer cap).**

## Accomplishments
- `src/core/process.ts`:
  - `ProcessCode` widened to include `"cancelled"`.
  - `ProcessSpec` accepts optional `signal?: AbortSignal`.
  - Exported `terminateProcessTree`: targets `taskkill.exe /pid <pid> /T /F` on Windows and `-pid` process groups on POSIX.
  - Exported `terminateProcessTreeGraceful`: signals `SIGTERM`, waits a configurable grace period, and falls back to `SIGKILL`.
  - Exported `ATTEMPT_PROCESS_TIMEOUT_MS = 15 * 60 * 1000` (15 min) and `ATTEMPT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024` (10 MB).
  - `runProcess` cancellation support: terminates child process tree immediately upon abort signal and retains all pre-abort stdout/stderr evidence with redaction and SHA-256 summaries.
- `test/task-process.test.ts`:
  - 6 unit tests covering attempt bounds constants, exported termination functions, pre-aborted signal handling, running process cancellation with pre-abort output retention, timeout enforcement, and stream output-cap enforcement.

## Verification
- `npm run check`: exit 0 (0 TS errors).
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-process.test.js dist/test/process.test.js`: 27 passed, 0 failed.

## Self-Check: PASSED
