---
phase: "18"
slug: "capability-fabric-and-automatic-invocation"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-03"
---

# Phase 18 — Validation Strategy

> Validate actual selection, invocation, and outcome at each GSD boundary. Installed configuration alone cannot satisfy a required capability.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js `node:test`, TypeScript 5.9.3 |
| **Config file** | `tsconfig.json`, `scripts/run-tests.mjs` |
| **Quick run command** | `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects.test.js dist/test/task-gsd-lifecycle.test.js` |
| **Full suite command** | `npm test && npm run check` |
| **Estimated runtime** | Measure in Wave 0; use focused commands during implementation |

## Sampling Rate

- **After every task commit:** Build and run the task's focused `dist/test/*.test.js` files through `scripts/run-tests.mjs --files`.
- **After every plan wave:** Run focused integration fixtures and `npm run check`.
- **Before `$gsd-verify-work`:** Run `npm test && npm run check` and inspect five-harness evidence matrix.
- **Max feedback latency:** Target under 120 seconds for focused tests; record actual runtime in execution summaries.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | CAP-03, CAP-05 | T-18-01 | Actual step call/result required before verdict | end-to-end tracer | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-trace.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 1 | CAP-03, CAP-05 | T-18-01 | Empty, wrong-step and stale receipts fail | adversarial | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-trace.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 2 | CAP-01, CAP-05 | T-18-03 | Declaration and host proof stay distinct | inventory | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-inventory.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | CAP-03, CAP-04 | T-18-04 | Overlap and reuse require current evidence | selection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-selection.test.js dist/test/task-capability-inventory.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-03-01 | 03 | 2 | CAP-02 | T-18-05 | Setup checkpoint precedes application work | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-effects.test.js && npm run check` | ✅ | ⬜ pending |
| 18-03-02 | 03 | 2 | CAP-02, CAP-03 | T-18-06 | Exact digest, CURRENT and fresh-session discovery | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/project-pack-sync.test.js dist/test/task-capability-session.test.js && npm run check` | ✅ + ❌ W0 | ⬜ pending |
| 18-04-01 | 04 | 2 | CAP-03 | T-18-07 | MCP error/throw do not become success | fault injection | `npm run build && node scripts/run-tests.mjs --files dist/test/mcp-proxy.test.js dist/test/capability-ledger.test.js && npm run check` | ✅ | ⬜ pending |
| 18-04-02 | 04 | 2 | CAP-03, CAP-05 | T-18-08 | Skill and MCP receipts both required | contract | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-receipts.test.js dist/test/mcp-proxy.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 18-05-01 | 05 | 3 | CAP-04 | T-18-09 | Drift invalidates current proof | fault injection | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-drift.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-05-02 | 05 | 3 | CAP-04 | T-18-10 | Unproven alternate or unauthorized role fails | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-drift.test.js dist/test/task-run.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 18-06-01 | 06 | 4 | CAP-01, CAP-03 | T-18-11 | Summary is honest and read-only | CLI | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-capabilities.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-06-02 | 06 | 4 | CAP-01, CAP-04 | T-18-12 | Detail/JSON show exclusions and invalidations | CLI | `npm run build && node scripts/run-tests.mjs --files dist/test/task-cli-capabilities.test.js && npm run check` | ❌ W0 | ⬜ pending |
| 18-08-01 | 08 | 4 | CAP-03, CAP-05 | T-18-15 | Discuss/plan/execute/verify operational calls gate progression | integration | `npm run build && node scripts/run-tests.mjs --files dist/test/task-gsd-lifecycle.test.js && npm run check` | ✅ | ⬜ pending |
| 18-08-02 | 08 | 4 | CAP-03, CAP-05 | T-18-16 | Separate review dispatch and five missing-call cases gate verdict | end-to-end | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-trace.test.js dist/test/task-run.test.js dist/test/task-gsd-lifecycle.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 18-07-01 | 07 | 5 | CAP-01..05 | T-18-13 | Every declaration has positive/negative fixture | completeness | `npm run build && node scripts/run-tests.mjs --files dist/test/task-capability-fixtures.test.js dist/test/task-gsd-adversarial.test.js && npm run check` | ❌ W0 + ✅ | ⬜ pending |
| 18-07-02 | 07 | 5 | CAP-05 | T-18-14 | Five-harness cells need exact-version actual result | matrix | `npm run build && node scripts/run-tests.mjs --files dist/test/capability-oracle.test.js dist/test/task-capability-fixtures.test.js && npm run check` | ✅ + ❌ W0 | ⬜ pending |

Plan and task identifiers match `18-01-PLAN.md` through `18-08-PLAN.md`. New tests are created by their owning task before their automated command runs.

## Wave 0 Requirements

- [ ] Create a declaration-to-positive/negative fixture manifest for every alpha-AOS capability; fail when a declaration has no fixtures.
- [ ] Add focused fixtures for successful, failed, denied, and transport-error invocation receipts, including older ledger compatibility.
- [ ] Add a setup-partial-failure and fresh-session fixture with fake adapters; separate it from real host claims.
- [ ] Add one `startTask` → GSD boundary → required capability → verdict trace that fails when the call is missing.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|
| Exact-version native skill, MCP, pack, command, and hook evidence on each of five harnesses | CAP-05 | CI fakes cannot prove a particular installed host version or signed-in tool session | Record executable/version, OS, fresh session ID, native discovery, meaningful invocation result, and outcome receipt per advertised matrix cell; mark unrun cells `unverified` and unsupported cells `unsupported`. |

## Validation Sign-Off

- [ ] All actual tasks have `<automated>` verify or an explicit Wave 0 dependency.
- [ ] No three consecutive tasks lack automated verification.
- [ ] Wave 0 covers all `MISSING` references in plans.
- [ ] No watch-mode flags appear in verify commands.
- [ ] Focused feedback latency is measured and bounded.
- [ ] `nyquist_compliant: true` is set only after validation succeeds.

**Approval:** pending
