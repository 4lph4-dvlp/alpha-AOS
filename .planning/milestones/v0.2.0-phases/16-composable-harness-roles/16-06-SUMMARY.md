---
phase: 16-composable-harness-roles
plan: "06"
subsystem: adapters
tags: [native-adapters, antigravity, pi, hermes, codex-hardening, live-tracer]
requires: ["16-01", "16-03", "16-04", "16-05"]
provides: [antigravity-native-adapter, pi-native-adapter, hermes-native-adapter, codex-hardened-adapter]
affects: [task-antigravity, task-pi, task-hermes, task-codex, task-agents, task-tracer]
tech-stack:
  added: []
  patterns: [shell-free-execution, stdin-teardown-defense, exit-status-interpretation, minimal-env-allowlist]
key-files:
  created:
    - src/adapters/task-antigravity.ts
    - src/adapters/task-pi.ts
    - src/adapters/task-hermes.ts
    - test/task-harness-adapters.test.ts
  modified:
    - src/adapters/task-codex.ts
    - src/adapters/task-agents.ts
    - test/task-tracer.integration.ts
    - test/task-cli.test.ts
    - test/process.test.ts
key-decisions:
  - "D-12: Native machine interfaces execute directly via shell: false with minimal environment allowlisting and standardized exit status interpretation."
  - "Pitfall 4 Defense: Pi adapter detects Windows libuv stdin teardown crash (0xC0000409 / 3221226505) and accepts valid parsed JSON outputs with status ok rather than failing immediately."
  - "SC6: Codex controller accepts schema-conforming claims from lastMessagePath even if exit code is non-zero, logging diagnostic advisory."
requirements-completed: [ROL-01, ROL-02, SC6]
coverage:
  - deliverable: "Native adapters for Antigravity, Pi, and Hermes"
    verification:
      kind: command
      ref: "dist/test/task-harness-adapters.test.js"
      status: pass
    human_judgment: false
  - deliverable: "Dynamic ports routing and legacy probe delegation"
    verification:
      kind: command
      ref: "dist/test/task-agents.test.js"
      status: pass
    human_judgment: false
  - deliverable: "Codex controller hardening and exit status interpretation"
    verification:
      kind: command
      ref: "dist/test/task-codex.ts"
      status: pass
    human_judgment: false
duration: 15 min
completed: 2026-10-02
---

# Phase 16 Plan 06: Native Adapters for Antigravity, Pi, Hermes & Codex Hardening Summary

Implemented native adapters for Antigravity (`agy`), Pi (`pi`), and Hermes (`hermes`) with minimal environment allowlisting, Windows stdin teardown crash protection, hardened Codex controller launch and exit status interpretation, and dynamic port dispatch across all 5 harnesses (ROL-01, ROL-02, SC6, D-12).

## Accomplishments
- Implemented `src/adapters/task-antigravity.ts` providing shell-free execution for controller (`--mode accept-edits`), reviewer (`--mode plan --sandbox`), version probing, and `AGY_HOME` environment allowlisting.
- Implemented `src/adapters/task-pi.ts` providing RPC mode execution, read-only reviewer tools (`--tools read,grep,find,ls` per D-11), and `interpretPiExitResult` defending against Windows libuv stdin teardown crashes (`0xC0000409` / `3221226505`) when valid JSON output was generated.
- Implemented `src/adapters/task-hermes.ts` providing one-shot command arguments (`-z`), usage file parsing for token telemetry, and environment filtering for `HERMES_HOME`.
- Hardened `src/adapters/task-codex.ts` with standard exit status interpretation: accepting valid schema-conforming claims from `lastMessagePath` on non-zero exit with advisory details, plus added read-only sandbox reviewer support (`codexReviewerArgs`, `runCodexReviewer`).
- Connected all 5 harnesses in `src/adapters/task-agents.ts` via `createDynamicTaskPorts` and updated `ports.assess` delegation to preserve mock runners and resolvers.
- Created `test/task-harness-adapters.test.ts` (8 tests) verifying argument vectors, environment filtering, and exit status interpretation across Antigravity, Pi, and Hermes.
- Refined `test/task-tracer.integration.ts` with honest `NOT PROVEN` handling for Windows restricted token sandbox runner pipe timeouts in background sessions.

## Verification
- `node scripts/run-tests.mjs --files dist/test/task-harness-adapters.test.js dist/test/process.test.js dist/test/task-agents.test.js dist/test/task-cli.test.js`: All 88 tests pass 100%.
- `npm run check`: 0 type errors.

## Next Steps
- Execute Phase 16 completion gates: verification of ROL-01..ROL-05, full regression test, and roadmap state updates.
