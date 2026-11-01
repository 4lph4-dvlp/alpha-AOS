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

| Task IDs | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----------|------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01/02 | 01 | 1 | UX-01, UX-02 | Ordinary GSD stays the default; explicit autopilot reaches read-only preview; each of five native harnesses also yields a real discovery and invocation receipt. | fixture and native canary | `npm run build && node scripts/run-tests.mjs --files dist/test/task-skill.test.js dist/test/owned-skills.test.js && npm run check` | `task-skill` ❌ W0 | ⬜ pending |
| 21-02-01/02 | 02 | 2 | UX-01, UX-02, UX-03 | Full contract and change diff precede approval; stale digest, missing support and unmeasured required limits block start. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js && npm run check` | ✅ base | ⬜ pending |
| 21-03-01/02 | 03 | 3 | UX-02, UX-03 | Approval reserves an ID without inventing a run; start binds the same ID and emits recoverable commands. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-contract.test.js dist/test/task-cli.test.js && npm run check` | ✅ base | ⬜ pending |
| 21-04-01/02 | 04 | 4 | UX-02, UX-03 | A separate process requests stop; only observed child exit becomes `stopped`; resume checks GSD, Git and effects. | process and recovery fixture | `npm run build && node scripts/run-tests.mjs --files dist/test/task-supervisor-recovery.test.js dist/test/task-controller-lease.test.js dist/test/task-cli.test.js && npm run check` | ✅ base | ⬜ pending |
| 21-05-01/02 | 05 | 5 | UX-02, UX-03 | Status and report select the same exact run and present verdict, reason, next action and nullable measurements. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js && npm run check` | ✅ base | ⬜ pending |
| 21-06-01/02 | 06 | 6 | UX-02, UX-03 | Development and general-task reports retain every criterion, item, source and unresolved result. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-capabilities.test.js dist/test/task-cli-review.test.js && npm run check` | ✅ base | ⬜ pending |
| 21-07-01/02 | 07 | 7 | UX-01, UX-02, UX-03 | Doctor separates environment and task diagnosis; blocked/failed JSON keeps reason codes and IDs without secrets or false success. | CLI integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli.test.js dist/test/task-cli-capabilities.test.js dist/test/task-cli-review.test.js dist/test/task-skill.test.js && npm run check` | `task-skill` ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky. Live native receipts are a separate Phase 21 completion gate.*

## Wave 0 Requirements

- [ ] `test/task-skill.test.ts` — five target fixture roots, native skill invocation contract, ordinary GSD default and explicit autopilot read-only preview.
- [ ] Extend CLI tests for a new process after approval and start, multiple attempts, stale digest, active child, stop acknowledgment and competing controller.
- [ ] Extend output tests for typed refusals, malformed input, missing model or usage evidence, and consistent human/JSON next actions.
- [ ] Preserve source-bound evidence: fixture installation alone is not a live invocation receipt.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Meaningful native skill invocation in every supported harness | UX-01 | Fixture rendering cannot prove a real harness loads and invokes the skill. | Invoke the task skill in Claude, Codex, Antigravity, Pi and Hermes; record exact version, discovery, skill activation, and read-only preview receipt. An unavailable target leaves Phase 21 `human_needed/unverified` and blocks completion; carry the gap into Phase 22's release matrix. |

## Validation Sign-Off

- [ ] Every task has `<automated>` verify or an explicit Wave 0 dependency.
- [ ] No three consecutive tasks lack automated verification.
- [ ] Wave 0 covers every missing test reference.
- [ ] No watch-mode flags.
- [ ] Feedback latency measured and bounded.
- [ ] Set `nyquist_compliant: true` only after validation.

**Approval:** pending
