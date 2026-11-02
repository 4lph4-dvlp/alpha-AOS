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

Gate status: pending-final-wave. Final measured counts and source HEAD will be recorded after Plan 31-05.

Historical 261101-ww3 debt remains unwaived: command-job-runtime.test.js job-8aff6aa5e58e46ea hit a worker-start handshake timeout. task-progress-integration.test.js, task-progress.test.js, verify-efficient-wait.test.js and tarball-fixture.test.js were not run in that historical attempt. A current pass is recorded alongside that history, never by deleting it.

Active holds: 3-OS/macOS CI, Claude G-07-2, global reconciliation, git push and npm publish. Local tests cannot clear these holds or count them as passed. The fresh independent read-only phase review is clean at source 2dde9db after resolving CR-01, CR-02, CR-03 and WR-01. This does not clear the separate milestone/release holds. The configured unavailable reviewer/verifier model was replaced only with user-approved current-session inheritance.

Related: [support matrix](./SUPPORT_MATRIX.md), [historical matrix](./SUPPORT_MATRIX_v0.2.0.md), [bootstrap proof](./task-bootstrap-proof.md), [style proof](./task-style-proof.md).
