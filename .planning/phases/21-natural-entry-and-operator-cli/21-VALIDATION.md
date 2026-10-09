---
phase: "21"
slug: "natural-entry-and-operator-cli"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in `node:test`, compiled from TypeScript |
| **Config file** | `tsconfig.json`, `scripts/run-tests.mjs` |
| **Quick run command** | Use the focused `<automated>` command in the active PLAN.md task; build before running compiled tests. |
| **Full suite command** | `npm run check && npm test && npm run build:check` |
| **Estimated runtime** | Measure during execution; do not invent a duration. |

## Sampling Rate

- **After every task commit:** Run the focused compiled test files for that task.
- **After every plan wave:** Run `npm run check` and all tests changed in that wave.
- **Before `$gsd-verify-work`:** Run the full suite and packed CLI scenarios.
- **Max feedback latency:** Record observed duration at the first implementation wave and keep targeted runs bounded.

## Per-Task Verification Map

| Area | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| Native skill and opt-in entry | UX-01 | Five native skill fixtures discover the task skill; ordinary GSD remains the default; explicit autopilot reaches a read-only preview without approving or starting. | fixture and native canary | `npm run build && node scripts/run-tests.mjs --files dist/test/owned-skills.test.js dist/test/task-skill.test.js` | `task-skill` ❌ W0 | ⬜ pending |
| Contract preview and approval | UX-01, UX-02 | A changed contract gets a new revision and digest; stale or edited preview cannot approve or start; approval and start remain distinct. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-contract.test.js` | ✅ | ⬜ pending |
| Durable cross-process control | UX-02 | Separate processes select the exact run, request stop, confirm process termination before `stopped`, and reconcile before resume. | process and recovery fixture | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-supervisor-recovery.test.js dist/test/task-controller-lease.test.js` | ✅ | ⬜ pending |
| Status, doctor, report and JSON | UX-02, UX-03 | Human and JSON outputs share current run/GSD evidence, reason codes, exact IDs, nullable usage, criteria evidence and next action; blocked commands emit structured JSON. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js dist/test/task-cli-review.test.js` | ✅ | ⬜ pending |

*Map exact task IDs and waves to these areas after PLAN.md is finalized. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky.*

## Wave 0 Requirements

- [ ] `test/task-skill.test.ts` — five target fixture roots, native skill invocation contract, ordinary GSD default and explicit autopilot read-only preview.
- [ ] Extend CLI tests for a new process after approval and start, multiple attempts, stale digest, active child, stop acknowledgment and competing controller.
- [ ] Extend output tests for typed refusals, malformed input, missing model or usage evidence, and consistent human/JSON next actions.
- [ ] Preserve source-bound evidence: fixture installation alone is not a live invocation receipt.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meaningful native skill invocation in each installed, authenticated harness | UX-01 | Fixture rendering cannot prove a real harness loads and invokes the skill. | Invoke the task skill in Claude, Codex, Antigravity, Pi and Hermes where available; record exact version and command receipt. Mark unavailable targets unverified for Phase 22. |

## Validation Sign-Off

- [ ] Every task has `<automated>` verify or an explicit Wave 0 dependency.
- [ ] No three consecutive tasks lack automated verification.
- [ ] Wave 0 covers every missing test reference.
- [ ] No watch-mode flags.
- [ ] Feedback latency measured and bounded.
- [ ] Set `nyquist_compliant: true` only after validation.

**Approval:** pending
