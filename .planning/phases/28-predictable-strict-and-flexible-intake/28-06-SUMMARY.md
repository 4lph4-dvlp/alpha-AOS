# Phase 28 Plan 06 Summary: End-to-End Acceptance Scenarios, Honest Native Evidence, and Final Regression Gate

**Executed:** 2026-11-02
**Status:** Completed
**Requirements fulfilled:** ENTRY-01, ENTRY-02, ENTRY-03, ENTRY-04, ENTRY-05, ENTRY-06, ENTRY-07; Decisions D-01–D-20

## What was built and verified

1. **End-to-End Acceptance Journeys (`test/task-intake-acceptance.test.ts`)**:
   - **Journey A (Release task to independent bug)**: Proves that a major release milestone using `autopilot-phase` retains its style during internal test repair waves, completes authoritatively in GSD, and terminates its selection lifetime. A subsequent independent bug fix receives a fresh strict chooser (does NOT inherit `autopilot-phase`) and cleanly selects `autopilot-quick-full`. Proves no contract digest, approval, or start leakage across tasks and verifies `behavior.json` never stores style choices.
   - **Journey B (Pending chooser correlation, detours, and cancellation)**: Proves that status queries ("status") preserve pending choices without advancing state; invalid answers leave choices pending; cross-task answer correlation mismatches are rejected (`pending-task-correlation-id-mismatch`); explicit cancellation ("cancel") discards pending choices; and valid answers resolve to canonical styles.
   - **Journey C (Precedence, exemptions, twins, and WIP preservation)**: Proves direct command invocation (`gsd-discuss-phase 28`) bypasses chooser while quoted prose goes to substantial work chooser; explicit style outranks simple exemption; positive local rename skips chooser while public API twin requires substantial work chooser; and scope expansion stops before expanded work and preserves dirty WIP (`wipBytesPreserved: true`).
   - **Journey D (Capability fallbacks and authority error boundaries)**: Proves complete numbered text fallback (options 1 to 6) when host capability is limited or unknown; proves fail-closed rejection when caller attempts to inject `executionAuthorized: true`.

2. **Native Evidence and Parity Audit (`.planning/phases/28-predictable-strict-and-flexible-intake/28-NATIVE-EVIDENCE.md`)**:
   - Audited all five target harnesses (`claude`, `codex`, `antigravity`, `pi`, `hermes`) against exact deployed skill SHA-256 (`349b09d2baa3eaae2f4423dfdbb62eebc3bd11fbe16783cb22371ef5dc2a659e`).
   - Documented exact evidence classes:
     - Antigravity: `proven` via native session observation and child process tools; numbered text fallback proven in Journey D.
     - Claude, Codex, Pi, Hermes: `unavailable` for live interactive sessions (chargeable API calls and global package mutations are unauthorized in automated runners); offline fixture execution fully proven in `test/task-intake-routing.test.ts`.
   - Explicitly preserved two descriptor-less prohibitions and three flagged semantic assumptions as `judgment` / `unresolved` for verifier review without manufacturing false passes.

3. **Validation Strategy Update (`.planning/phases/28-predictable-strict-and-flexible-intake/28-VALIDATION.md`)**:
   - Updated all 12 task rows to `passed` with exact test counts and verified automated commands.
   - Noted provenance and type-check results: `npm run check` (0 errors), `npm run build:check` (321 inputs, 632 outputs verified).
   - Preserved global holds and handoff context.

## Final Regression and Gate Evidence

- **Type Check**: `npm run check` -> 0 TypeScript diagnostics / 0 errors.
- **Build Provenance**: `npm run build:check` -> build artifact verified with 321 inputs and 632 outputs.
- **Acceptance Suite**: `node scripts/run-tests.mjs --files dist/test/task-intake-acceptance.test.js`:
  - 4 tests executed: 4 passed, 0 failed, 0 skipped in 19.0s.
- **Tracer & Governance Suites**: `node scripts/run-tests.mjs --files dist/test/task-e2e-tracer.test.js dist/test/task-governance-hierarchy.test.js dist/test/task-intake-acceptance.test.js dist/test/task-intake-routing.test.js`:
  - 14 tests executed: 14 passed, 0 failed, 0 skipped in 54.6s.
- **Total Phase 28 Specific Suites**:
  - `dist/test/task-intake-cli.test.js`: 4 passed
  - `dist/test/task-intake-explicit.test.js`: 6 passed
  - `dist/test/task-intake-continuity.test.js`: 4 passed
  - `dist/test/task-intake-evidence.test.js`: 12 passed
  - `dist/test/task-intake-routing.test.js`: 4 passed
  - `dist/test/task-intake-acceptance.test.js`: 4 passed
  - All 34 new phase-specific tests pass 100% green.

## Preserved Holds and Handoff

- **Unresolved Flagged Assumptions**: ENTRY-04 (simple operation semantics vocabulary limitation), ENTRY-06 (adaptive host behavior vocabulary limitation), and ENTRY-07 (direct command intent vocabulary limitation).
- **Unresolved Prohibitions**: Prohibition 1 (cross-task implicit consent) and Prohibition 2 (hidden styles / persisted project defaults) remain flagged for human/verifier judgment.
- **Milestone Holds**: Quick `261101-ww3` startup failure, release hold, macOS CI hold, push hold, global-apply hold, and publication hold remain intact.
- **Downstream Phase Boundaries**: Execution pipeline bootstrap remains Phase 29; execution pipeline synthesis remains Phase 30.
