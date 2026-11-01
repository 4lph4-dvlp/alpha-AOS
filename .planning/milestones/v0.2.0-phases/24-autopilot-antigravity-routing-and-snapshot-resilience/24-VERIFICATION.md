---
phase: 24-autopilot-antigravity-routing-and-snapshot-resilience
status: passed
verified_at: "2026-10-18T20:36:00.000Z"
requirements_verified:
  - AUTO-FIX-01
  - AUTO-FIX-02
  - AUTO-FIX-03
  - AUTO-FIX-04
  - AUTO-FIX-05
---

# Phase 24 Verification Report: Autopilot Antigravity Routing and Snapshot Resilience

## Verification Summary

- **Verdict**: **PASSED**
- **Type Check (`npm run check`)**: 0 errors
- **Build (`npm run build`)**: 0 errors
- **Regression & Bugfix Suites (`test/task-autopilot-bugfixes.test.ts`, `test/task-harness-adapters.test.ts`, `test/task-receipts.test.ts`, `test/task-check.test.ts`, `test/task-gsd.test.ts`, `test/task-contract.test.ts`)**: All passed

## Defect-by-Defect Verification Matrix

| Defect ID | Requirement | Root Cause Addressed | Code Changes | Verification Evidence |
|---|---|---|---|---|
| `BUG-01` | `AUTO-FIX-01` | Antigravity adapter omitted `--model <model-id>`, causing `agy` to fall back to the default exhausted tier | `schemas/task-contract.schema.json`, `src/core/task-contract.ts`, `src/adapters/task-antigravity.ts` (`antigravityReviewerArgs`, `antigravityControllerArgs`, `antigravityExecutorArgs`, `resolveAntigravityRoleModel`) | `test/task-autopilot-bugfixes.test.ts`: verifies `--model` flag injection, `.planning/config.json` resolution (`model_profile_overrides` & `review.cross_ai_command`), contract `agentPolicy` model resolution, and `ProcessSpec` args inspection |
| `BUG-02` | `AUTO-FIX-02` | Host CLI upgrades caused `binarySha256` / version drift with no automated re-probe path | `src/adapters/task-receipts.ts` (`reprobeHarnessRoleReceipt`, `autoReprobeOnDrift`, `probeMissing`), `src/adapters/task-agents.ts`, `src/core/task-doctor.ts`, `src/cli.ts` (`--probe`) | `test/task-autopilot-bugfixes.test.ts` & `test/task-receipts.test.ts`: verifies strict drift detection when `reprobeOnDrift` is off and atomic receipt refresh on disk when `reprobeOnDrift: true` |
| `BUG-03` | `AUTO-FIX-03` | `collectTaskArtifact` excluded `.planning`, so `materializeTaskSnapshot` left `.planning/ROADMAP.md` and `STATE.md` missing in the review/measurement snapshot | `src/core/task-check.ts` (`mirrorPlanningDirectory` inside `materializeTaskSnapshot`) | `test/task-autopilot-bugfixes.test.ts` & `test/task-check.test.ts`: verifies `.planning/ROADMAP.md` and `.planning/STATE.md` are readable by snapshot `cli-json` scripts while `collectTaskArtifact` digest remains identical |
| `BUG-04` | `AUTO-FIX-04` | `verifyGsdEvidence` rejected claimed `.planning/quick/<id>` directories that already existed at `baseCommit` on contract retries | `src/core/task-gsd.ts` (`allowExistingClaimedQuick`), `src/core/task-run.ts` (`startTask`) | `test/task-autopilot-bugfixes.test.ts` & `test/task-gsd.test.ts`: verifies pre-existing claimed quick directories are rejected on fresh runs (`allowExistingClaimedQuick: false`) and verified on contract retries (`allowExistingClaimedQuick: true`) |
| `BUG-05` | `AUTO-FIX-05` | Antigravity platform launcher forces `"inherit": true` on `invoke_subagent` with `typeName: "self"`, silently ignoring explicit `Model` overrides | `src/adapters/task-antigravity.ts` (`validateAntigravitySubagentDispatch`, `assertAntigravitySubagentDispatch`), `src/core/task-gsd.ts` (`buildGsdControllerPrompt`) | `test/task-autopilot-bugfixes.test.ts`: verifies `INCOMPATIBLE_SUBAGENT_MODEL` fail-closed guard and controller prompt delegation guardrail |
