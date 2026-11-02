# Cross-harness task entry proof and regression ledger

This v0.6.0 source-workflow evidence covers PROVE-01–PROVE-04. Package version remains 0.5.0; release and publication holds remain active.

## Evidence tiers and 55-cell matrix

The [index](./task-entry-proof-index.json) records 5 harnesses × 11 scenario/role axes with an explicit reason code in every cell. verified-native refers to archived authorized receipts, verified-fixture to paid-call-free CLI/filesystem composition, unsupported to absent authority, unverified to unexecuted or unavailable native evidence, and blocked to a known auth hold. Passing fixture tests never proves a paid native model turn or native question UI delivery.

| Axis | Claude Code | Codex | Antigravity | Pi Agent | Hermes Agent |
|---|---|---|---|---|---|
| policy-query-and-set | verified-fixture | verified-fixture | verified-fixture | verified-fixture | verified-fixture |
| independent-task-reselection | verified-fixture | verified-fixture | verified-fixture | verified-fixture | verified-fixture |
| bootstrap-and-recovery-handoff | verified-fixture | verified-native | verified-fixture | verified-fixture | verified-fixture |
| conversational-quick | unverified | unverified | unverified | verified-native | unsupported |
| conversational-quick-full | unverified | unverified | unverified | verified-native | unsupported |
| conversational-phase | unverified | unverified | unverified | verified-native | unsupported |
| autopilot-quick | unverified | unverified | unverified | verified-native | unsupported |
| autopilot-quick-full | unverified | unverified | unverified | verified-native | unsupported |
| autopilot-phase | blocked | unverified | unverified | verified-native | unsupported |
| question-ui-delivery | verified-fixture | verified-fixture | verified-fixture | verified-fixture | verified-fixture |
| gsd-controller-authority | unverified | unverified | unverified | unverified | unsupported |

Pi's six route receipts bind commit f0b7f315c9d719a3ed74f591b92b0fc8e4cebe9b in the [style ledger](./task-style-proof.md). Codex's bootstrap receipt binds commit 3adb72549623865abc4187715bc344b346f8acc9 in the [bootstrap ledger](./task-bootstrap-proof.md). Antigravity's Phase 27/28 intake/policy session observations are disclosed as historical observations; without a portable per-cell receipt this index conservatively retains fixture status. Native UI delivery remains unverified even where numbered text fallback is fixture-verified. Hermes supports shared mode/intake and workers; its GSD controller/state-writer and six controller execution routes are unsupported. Claude Code's G-07-2 isolated canary auth hold remains blocked. Unrun paid routes use NO_SPEND_POLICY_PAID_TURN_WITHHELD.

## Four composed scenarios

1. chain-policy-transition: Codex sets flexible → Antigravity consumes flexible → Pi sets strict → the same Codex session re-reads strict on next intake. Corrupt policy, stale digest and wrong-root inputs fail closed.
2. chain-task-boundary: a completed autopilot-phase release requires a fresh six-style chooser for an independent bug fix; the same active task keeps its style across a mode flip. Conflicting style/command or root bindings refuse.
3. chain-bootstrap-continuity: absent/partial recovery preserves existing PROJECT.md bytes and hands off the original request/style once (new-task → continue-existing). Autopilot dispatchAuthorized stays false; exact approval and separate start remain necessary.
4. chain-quality-and-tamper-guards: full quick requires discussion, research, planning, plan-check, implementation, verification and state-docs. Ordinary quick evidence, changed digests, skill/lock tampering and Hermes controller execution refuse.

The hash-bound checkout-only source is test/task-entry-cross-harness.test.ts. It is deliberately absent from npm packages.

## Read-only verification in two contexts

Run node scripts/verify-task-entry-proof.mjs --index docs/task-entry-proof-index.json --json from a checkout or unpacked package. Both contexts re-open packaged bytes and the stable lock, verify SHA-256 bindings, canonical cell order, tier rules and unwaived holds. git-checkout additionally checks scenario source hashes and git cat-file archive commits and the committed archival document bytes. packed-package needs neither .git nor .planning, reports checkoutEvidence: not-shipped, and verifies packaged archival evidence without claiming fresh native execution. No model calls, global writes or artifact synthesis occur.

Windows .CMD shims may be discovered through local inventory. resolveTaskAgentLaunch unwraps Node-backed shims for invocation; command discovery alone proves neither authentication nor execution. An absent binary must remain explicitly undetected.

## Regression ledger and release holds

Gate status: passed for the local D-14 regression. Tested source HEAD: 9b6679a481a0d694551712e6c1f621afbdada704. Platform: win32/x64, Node v24.13.1, npm 11.8.0. Measured aggregate: 2149 total, 2135 passed, 0 failed, 14 skipped, 0 not-run. Windows symlink privilege skips remain separate from passed tests.

All eight ordered check/build/targeted/audit/full/build-check/style-proof/entry-proof gates exited 0 at the same source HEAD. The superseded earlier full run was stopped for a source correction and is excluded from these counts.

| Full-run group | Total | Passed | Failed | Skipped | Not-run | Duration ms |
|---|---:|---:|---:|---:|---:|---:|
| ordinary | 1951 | 1938 | 0 | 13 | 0 | 920487.162 |
| command-job-runtime.test.js | 5 | 5 | 0 | 0 | 0 | 25177.5311 |
| command-job-worker.test.js | 4 | 4 | 0 | 0 | 0 | 10200.5595 |
| command-jobs.test.js | 38 | 38 | 0 | 0 | 0 | 20054.4803 |
| efficient-wait-cli.test.js | 9 | 9 | 0 | 0 | 0 | 31340.1378 |
| process.test.js | 31 | 31 | 0 | 0 | 0 | 29121.9634 |
| protocol-session.test.js | 11 | 11 | 0 | 0 | 0 | 25717.2224 |
| task-cli.test.js | 42 | 42 | 0 | 0 | 0 | 205462.4199 |
| task-progress-integration.test.js | 13 | 13 | 0 | 0 | 0 | 140074.8029 |
| task-progress.test.js | 15 | 15 | 0 | 0 | 0 | 70265.804 |
| verify-efficient-wait.test.js | 20 | 19 | 0 | 1 | 0 | 28154.4319 |
| tarball-fixture.test.js | 10 | 10 | 0 | 0 | 0 | 360371.6056 |

| Historical 261101-ww3 suite | Historical outcome (unwaived) | Current Phase 31 result |
|---|---|---|
| command-job-runtime.test.js | worker startup timeout after 4009 ms, job-8aff6aa5e58e46ea | 5 passed, 0 failed, 0 skipped |
| task-progress-integration.test.js | not-run | 13 passed, 0 failed, 0 skipped |
| task-progress.test.js | not-run | 15 passed, 0 failed, 0 skipped |
| verify-efficient-wait.test.js | not-run | 19 passed, 0 failed, 1 skipped |
| tarball-fixture.test.js | not-run | 10 passed, 0 failed, 0 skipped |

Historical 261101-ww3 debt remains unwaived: command-job-runtime.test.js job-8aff6aa5e58e46ea hit a worker-start handshake timeout. task-progress-integration.test.js, task-progress.test.js, verify-efficient-wait.test.js and tarball-fixture.test.js were not run in that historical attempt. A current pass is recorded alongside that history, never by deleting it.

Active holds: 3-OS/macOS CI, Claude G-07-2, global reconciliation, git push and npm publish. Local tests cannot clear these holds or count them as passed. The fresh independent read-only phase review is clean at source 2dde9db after resolving CR-01, CR-02, CR-03 and WR-01. This does not clear the separate milestone/release holds. The configured unavailable reviewer/verifier model was replaced only with user-approved current-session inheritance.

Related: [support matrix](./SUPPORT_MATRIX.md), [historical matrix](./SUPPORT_MATRIX_v0.2.0.md), [bootstrap proof](./task-bootstrap-proof.md), [style proof](./task-style-proof.md).

The phase source review is clean. A separate milestone final review remains pending (independent-review-gate-pending), along with 3-os-ci-held, G-07-2, global-apply-hold, git-push-hold and npm-publish-hold, including the version bump beyond 0.5.0. None is included in passed test totals.
