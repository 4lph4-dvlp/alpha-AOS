---
phase: "20"
slug: "general-tool-connectors"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-09"
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test`, compiled from TypeScript |
| **Config file** | `tsconfig.json`, `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-connector.test.js dist/test/task-coursepilot.test.js` |
| **Full suite command** | `npm run check && npm test` |
| **Estimated runtime** | Measure during execution; no invented target |

## Sampling Rate

- **After every task commit:** Run targeted compiled tests for the connector, contract, effects, or reporting module changed by that task.
- **After every plan wave:** Run `npm run check` and affected task tests.
- **Before `$gsd-verify-work`:** Run `npm run check && npm test` and a generic connector fixture end to end.
- **Max feedback latency:** Record the observed duration at Wave 0; keep targeted tests bounded.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| Assigned by planner | TBD | TBD | TOOL-01 | Generic itemized connector runs without Git or code-test assumptions; stale preview blocks perform. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-connector.test.js` | ❌ W0 | ⬜ pending |
| Assigned by planner | TBD | TBD | TOOL-02 | Only source-bound existing files count; changed or missing files and unknown attachment sets remain unresolved. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot.test.js` | ❌ W0 | ⬜ pending |
| Assigned by planner | TBD | TBD | TOOL-04 | Partial results preserve successes; fatal or malformed outputs block; unapproved batch items never execute. | adversarial fixture | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot.test.js` | ❌ W0 | ⬜ pending |

*Task IDs and waves are filled after PLAN.md files are finalized. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.*

## Wave 0 Requirements

- [ ] `test/task-connector.test.ts` — generic versioned protocol and stale-approval fixture.
- [ ] `test/task-coursepilot.test.ts` — fake CoursePilot CLI outputs for mixed statuses, partial and fatal exits, hostile text, bounded output, resume, and disappeared files.
- [ ] Prove course/week batches with unapproved or already verified actionable materials do not invoke a live download.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Approved bounded CoursePilot live download | TOOL-02 | Requires an authorized account and task scope | Run only against an explicitly approved course/week; inspect current file and source evidence without recording credentials. |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency measured and bounded.
- [ ] `nyquist_compliant: true` set only after validation.

**Approval:** pending
