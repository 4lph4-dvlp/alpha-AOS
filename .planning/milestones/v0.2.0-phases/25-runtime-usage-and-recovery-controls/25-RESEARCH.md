# Phase 25 research

## Local source findings

- `task-telemetry.ts` already normalizes tokens and honestly leaves Codex USD null.
- `task-contract.ts::checkCostMeterReadiness` contradicts that policy for Codex.
- `task-supervisor.ts:616` increments cycles/time without consuming adapter usage.
- `task-codex.ts` parses usage but drops it from dispatch results; only the last
  turn survives parsing. Failed turns with no final usage lose partial observations.
- `command-jobs.ts::getCommandJobStatus` derives orphan state when worker dies;
  project-specific controller JSON is outside that ownership and is not authoritative.
- `task-run.ts::startMultiPhaseTask` omits a finalReviewPort; lifecycle already has
  a final gate, so readiness cannot honestly mean acceptance.
- Generic start requires a clean baseline before multi-phase routing. Preserve WIP
  through an explicit recovery boundary rather than automatically committing it.

## Reuse and implementation approach

Use one telemetry accumulator for explicit native session identities and scopes;
preserve raw measurement semantics and expose incomplete coverage. Thread usage
through existing adapter/runner/checkpoint boundaries. Bind dedicated execution
to approved contracts with typed argv and existing durable jobs. Refuse unsupported
bridges instead of silently claiming equivalent controls. Store only runtime
observations; continue reading GSD artifacts for lifecycle decisions.

## API grounding

Context7 `/websites/nodejs_latest-v24_x_api`, 2026-10-30:
https://nodejs.org/docs/latest-v24.x/api/child_process.html and process.html.
spawn defaults to shell:false; Windows cmd/bat requires an interpreter, so reuse
proven direct launch resolution. PID existence does not prove process identity.
Detached process lifetime depends on detached stdio and unref; do not promise UI
callbacks or notifications without a real host capability.
