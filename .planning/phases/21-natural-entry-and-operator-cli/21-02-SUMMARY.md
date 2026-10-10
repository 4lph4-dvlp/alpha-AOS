# Phase 21 Plan 02: Contract Preview Full Fidelity and Blocked Review Summary

**Date:** 2026-10-10  
**Phase:** 21 (Natural Entry and Operator CLI)  
**Plan:** 21-02  
**Requirements:** UX-01, UX-02, UX-03  
**Status:** Completed  

---

## 1. Summary of Delivered Work

Plan 21-02 ensures the task contract preview provides full fidelity and reviewability under all conditions:
1. **D-05 / D-08 Ordering & Presentation**:
   - The preview now prioritizes Goal, Mandatory Criteria, Allowed Roots, Allowed Effects, and Git Authority ahead of agent configuration and resource limits.
   - Resource limits (wall-time, cycles, tokens, cost) clearly distinguish unconfigured limits (`no limit`) and telemetry meters (`unmetered`) from measured values without fabricating numbers or 0.00 estimates.
2. **D-06 / D-09 Reapproval Diffs**:
   - Previewing a contract revision when prior revisions were approved displays the full contract along with `changedContractFields` diff identifying the exact attributes modified since previous approval.
   - Stale digests are strictly refused on approval and start.
3. **D-07 / D-08 Blocked Reviewability**:
   - Missing prerequisite telemetry meters or unverified role combinations no longer throw and suppress preview output.
   - Instead, the preview clearly presents a top-level `Blocked: task prerequisites not satisfied` banner with explicit reason codes (`MISSING_TELEMETRY_METER`) and recommended next actions, while keeping the complete contract reviewable.
   - JSON envelopes emit `{ status: "blocked", blockedReasons: [...], nextActions: [...] }`.
   - Mutation commands (`task approve --apply` and `task start --apply`) strictly remain fail-closed.

---

## 2. Verification Evidence

- `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-contract.test.js dist/test/task-cli-capabilities.test.js && npm run check`:
  - 63 tests executed, 63 tests passed, 0 failures.
  - Strict TypeScript check (`tsc -p tsconfig.json --noEmit`) clean with zero errors.

---

## 3. Files Modified

- `src/core/task-contract.ts`: Extended `TaskContractPreview` interface and calculated `changedFields` in `previewTaskContract`.
- `src/format.ts`: Re-ordered `formatTaskContractPreview` per D-05, formatting blocked banners, unmeasured limits, and diffs.
- `src/cli.ts`: Updated `showPreview` and preview dispatch to combine readiness into reviewable blocked preview without throwing before display.
- `test/task-cli.test.ts`: Added automated test suite covering D-05 ordering, D-06 diffs, D-07 blocked preview, and D-08 unmeasured limits.
