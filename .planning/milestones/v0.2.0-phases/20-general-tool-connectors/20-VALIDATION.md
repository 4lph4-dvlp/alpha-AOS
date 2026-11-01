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
| **Quick run command** | Use the focused `<automated>` command in the active PLAN.md task; Phase 20 has separate connector, preview, files, run, and report suites. |
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
| 20-01-01/02 | 01 | 1 | TOOL-01 | Generic itemized connector runs without Git or code-test assumptions; stale preview blocks perform. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-connector.test.js` | ❌ W0 | ⬜ pending |
| 20-02-01/02 | 02 | 2 | TOOL-01 | Stable file effect keys, reconciliation, and current file recheck preserve unknown-stop behavior. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-connector-effects.test.js` | ❌ W0 | ⬜ pending |
| 20-03-01/02 | 03 | 2 | TOOL-02 | Preview bounds and current approval changes block unsafe CoursePilot calls. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-preview.test.js` | ❌ W0 | ⬜ pending |
| 20-04-01/02 | 04 | 2 | TOOL-02 | Only source-bound existing files count; partial and unknown attachment sets remain unresolved. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-files.test.js` | ❌ W0 | ⬜ pending |
| 20-05-01/02 | 05 | 3 | TOOL-02, TOOL-04 | Two independent modules: valid exit 2 stale reapproves only the first, preserves receipts and continues the second; fatal, invalid schema/output/version or unrecognized exit stops later effects. | adversarial fixture | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-run.test.js` | ❌ W0 | ⬜ pending |
| 20-06-01/02 | 06 | 4 | TOOL-02, TOOL-04 | Human and JSON reapproval preview show full approved course/week/material scope plus highlighted added/removed/changed entries; current evidence drives exact counts and next actions. | fixture/integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-coursepilot-report.test.js` | ❌ W0 | ⬜ pending |

*Task IDs and waves reflect the current draft plans. The research blockers above prevent sign-off. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.*

## Wave 0 Requirements

- [ ] `test/task-connector.test.ts` — generic versioned protocol and stale-approval fixture.
- [ ] `test/task-connector-effects.test.ts` — stable file effects and interrupted reconciliation.
- [ ] `test/task-coursepilot-preview.test.ts` — bounded preview, approval diff, and unsafe batch fixture.
- [ ] `test/task-coursepilot-files.test.ts` — source-bound physical file checks and attachment completeness limits.
- [ ] `test/task-coursepilot-run.test.ts` — fake CoursePilot CLI outputs for partial/fatal/stale exits, two-module independent continuation, bounded output, and retry safety.
- [ ] `test/task-coursepilot-report.test.ts` — human/JSON full-scope reapproval diff, mixed statuses, hostile text, exact counts, and disappeared files.
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
