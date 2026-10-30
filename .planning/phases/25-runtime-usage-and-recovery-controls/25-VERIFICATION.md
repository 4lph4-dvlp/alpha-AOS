---
phase: 25-runtime-usage-and-recovery-controls
verified: 2026-10-30T07:24:50.192Z
status: passed
score: 8/8
source_commit: 77cf6d156df66a023a4e5c93dcba82a3738dc367
human_verification: []
---

# Phase 25 Verification

The source repair meets the eight approved fixture-first criteria. Final native
test execution ended with exit 0: **1857 tests, 1846 passed, 11 skipped, zero
failures**. All eight runner groups, including ten packed lifecycle cases, passed.
`25-FINAL-TESTS.json` binds this result to the source SHA, native handle 49739,
observation time and SHA-256 of `full-acceptance.log`.

| Requirement | Evidence and observed result |
|---|---|
| RUNTIME-01 / R1 | Quota, failed terminal, lost final usage and native process outcome fixtures retain failure/usage evidence; no successful completion is inferred. |
| RUNTIME-02 / R2 | Live/unconfirmed children, missing PIDs, native-handle-only outcomes and throws retain fences with zero subsequent invokes. Positive actual owned-child close evidence permits recovery. |
| RUNTIME-03 / R3 | Parent/child fixtures, stable response IDs and cumulative watermarks match manual totals across replay/resume, retain partial usage and avoid cache/reasoning double addition. |
| RUNTIME-04 / R4 | Approved route and common/final guards prevent the next spawn after observed limits; unsupported Codex USD is rejected before any callback. Unknown is not zero. |
| RUNTIME-05 / R5 | Command-job, completion-wait, task-wait and CLI reconnect tests use runtime handles/timers, without bookkeeping model calls or waiting agents. |
| RUNTIME-06 / R6 | Same-basis review witness is reused; SHA/artifact/requirements/config/dependency changes invalidate reuse. Independent final review and exact requirement coverage remain required. |
| RUNTIME-07 / R7 | Actual Windows PowerShell shim reproduces delimiter loss; typed argv preserves executable, Unicode, literal metacharacters and exact resume identity. |
| RUNTIME-08 / R8 | Public approved resume enters through the supervisor with original partial HEAD/base and dirty WIP, completes remaining execution, verification, Nyquist and final independent port acceptance. No-op evidence is refused. |

## Independent Judgment

Real independent reviewers produced the original review and focused followups.
The original seven critical findings and integration gap are closed in source;
the late reconciliation counterexample is closed by `25-REVIEW-CLOSURE.md`.
Runner/fixture reviews explicitly found no dropped coverage, masked failure or
weakened assertion. These reports preserve exact reviewed hashes and do not
pretend to be another full review or a test invocation.

## Limits and Responsibility

The incident used approved dedicated jobs and a project PowerShell controller;
the generic supervisor issue is independently reproduced, not asserted to have
caused that incident. The repair reuses existing telemetry, evaluator,
checkpoints/durable jobs and GSD gates. Legacy wrappers need registered leaf
launches; arbitrary `job start` does not acquire task controls automatically.

Native-internal calls may exceed a cap before completion-only usage is observed.
This is boundary enforcement, not a provider reservation/hard-cap guarantee.
Codex costUsd stays null; Standard audit credit conversions are estimates, not
measured billing. Notifications are durable CLI records, not a promised callback.
Missing closure requires inspection, never a PID-based force-clear.

No paid model canary, global installation, original-project migration/restart,
or three-OS remote CI run is claimed. Source and Windows credential-free
verification are complete within the approved scope.
