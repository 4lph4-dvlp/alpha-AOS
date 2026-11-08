---
phase: "42"
slug: "integration-verification-and-recovery"
status: planned
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-09"
---

# Phase 42 — Validation Strategy

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Node built-in `node:test`, compiled TypeScript |
| Configuration | `tsconfig.json`, `scripts/run-tests.mjs --files` |
| Build | `npm run build` |
| Existing focused command | `node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/tool-record-store.test.js dist/test/tool-records.test.js` |
| New focused command after implementation | `node scripts/run-tests.mjs --files dist/test/release-verification.test.js dist/test/release-lifecycle-store.test.js dist/test/release-recovery.test.js dist/test/release-lifecycle-cli.test.js` |
| Full suite | `npm test` — optional manual operation under AGENTS.md |
| Timing | Not measured during planning; target bounded feedback, no watch mode |

Use the repository runner so npm lifecycle environment scrubbing and empty-test-set rejection remain effective. Research's proposed `npm test -- --test-name-pattern=...` commands are unvalidated suggestions and are replaced by the established explicit-file commands above. Build before invoking compiled tests.

## Sampling Rate

- Run the focused tests for changed behavior after each implementation task.
- At a wave boundary, run the affected integration suites; expand only for changed dependencies or unresolved failures.
- Record actual results and durations. No tests were run by this planning artifact.
- Full-suite and cross-platform checks remain optional; planning does not add push, CI or deployment prerequisites.
- Real target-host invocation evidence is a product acceptance condition, separate from repository delivery. Missing credentials, permissions, cost approval, service availability or host reload remain unverified.

## Requirement Verification Map

These are final implementation task IDs, waves, focused commands and globally unique phase threat references. `Pending` means the task has not run; this planning pass executed no implementation test.

| Task | Wave | Requirement | Secure behavior | Test type | Automated command after build | Threat refs | Status |
|---|---:|---|---|---|---|---|---|
| 42-01-01 | 1 | PROOF-01, PROOF-02, PROOF-03 | Unknown exact versions reach protocol/schema and only configured proxy/host invocation can pass; inactive/pending leaves active identity unchanged | Unit + fake MCP/proxy/update integration | `node scripts/run-tests.mjs --files dist/test/release-verification.test.js dist/test/local-release-update.test.js` | T-42-01, T-42-02, T-42-03 | Pending |
| 42-01-02 | 1 | PROOF-01, PROOF-02 | Four evidence tiers and full dependency fingerprint reuse/invalidation; actual-use discovery cannot be replaced by a static harness map | Unit | `node scripts/run-tests.mjs --files dist/test/release-verification.test.js dist/test/local-release-update.test.js` | T-42-01, T-42-02, T-42-03 | Pending |
| 42-02-01 | 2 | PROOF-02, PROOF-03, PROOF-04 | Separate schema preserves old acceptance meaning, exact pending identity and value-free evidence | Store + compatibility integration | `node scripts/run-tests.mjs --files dist/test/release-lifecycle-store.test.js dist/test/release-verification.test.js dist/test/tool-record-store.test.js` | T-42-04, T-42-05 | Pending |
| 42-02-02 | 2 | PROOF-03, PROOF-04 | Append is idempotent/single-writer; cancel retains artifacts/history; protected set is complete | Adversarial store/race | `node scripts/run-tests.mjs --files dist/test/release-lifecycle-store.test.js dist/test/tool-record-store.test.js dist/test/tool-records.test.js` | T-42-05, T-42-06 | Pending |
| 42-03-01 | 3 | PROOF-01, PROOF-02, PROOF-03 | Shared tool waits for every actual affected harness and concurrent apply cannot mutate twice | Fake-adapter update integration | `node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/release-verification.test.js` | T-42-07, T-42-08 | Pending |
| 42-03-02 | 3 | PROOF-02, PROOF-03 | Any batch pending/fail yields zero activation; only all-pass postcheck writes atomic accepted transitions | Update + event-store integration | `node scripts/run-tests.mjs --files dist/test/local-release-update.test.js dist/test/release-verification.test.js dist/test/tool-record-store.test.js` | T-42-07, T-42-09 | Pending |
| 42-04-01 | 4 | PROOF-03, PROOF-04 | Postcheck failure auto-recovers within reviewed scope, then observes actual previous identity/invocation; recovered update remains failed | Fault-injection integration | `node scripts/run-tests.mjs --files dist/test/release-recovery.test.js dist/test/local-release-update.test.js` | T-42-10, T-42-11, T-42-12, T-42-13 | Pending |
| 42-04-02 | 4 | PROOF-04 | All switched tools recover in reverse with capability honesty; only exact official prior artifact may be reacquired | Multi-adapter fault injection | `node scripts/run-tests.mjs --files dist/test/release-recovery.test.js dist/test/local-release-update.test.js` | T-42-10, T-42-11, T-42-12, T-42-13 | Pending |
| 42-05-01 | 5 | PROOF-03, PROOF-04 | Interrupted same-tool operation reconciles before new work; replay/concurrency produces no duplicate native mutation | Race + restart integration | `node scripts/run-tests.mjs --files dist/test/release-recovery.test.js dist/test/local-release-update.test.js dist/test/release-lifecycle-store.test.js` | T-42-14, T-42-15 | Pending |
| 42-05-02 | 5 | PROOF-02, PROOF-04 | Resume preserves exact identity; cancel retains files/history; cleanup rechecks protected set/root/ownership and is idempotent | Service + filesystem integration | `node scripts/run-tests.mjs --files dist/test/release-recovery.test.js dist/test/release-lifecycle-store.test.js dist/test/local-release-update.test.js` | T-42-14, T-42-16, T-42-17 | Pending |
| 42-06-01 | 6 | PROOF-01, PROOF-02, PROOF-03 | Resume preview/apply binding, text/JSON parity, no-latest and exit 0/2/3 | CLI subprocess integration | `node scripts/run-tests.mjs --files dist/test/release-lifecycle-cli.test.js dist/test/local-release-update.test.js dist/test/release-verification.test.js` | T-42-18, T-42-19, T-42-20 | Pending |
| 42-06-02 | 6 | PROOF-01, PROOF-02, PROOF-03, PROOF-04 | All controls use closed flags/bound apply; exit 0/2/3/4/5 and JSON/text report the same redacted actual state | CLI + phase regression | `node scripts/run-tests.mjs --files dist/test/compatibility-adapters.test.js dist/test/local-release-update.test.js dist/test/tool-record-store.test.js dist/test/release-verification.test.js dist/test/release-lifecycle-store.test.js dist/test/release-recovery.test.js dist/test/release-lifecycle-cli.test.js` | T-42-18, T-42-19, T-42-20 | Pending |

## Wave 0 Requirements

- [ ] Add meaningful behavior tests in `test/release-verification.test.ts` in the owning implementation task.
- [ ] Add native-installer fault injection and reconciliation tests in `test/release-recovery.test.ts` in the owning implementation task.
- [ ] Add `test/release-lifecycle-cli.test.ts` in Task 42-06-01 and cover exit statuses, JSON/text evidence, resume/cancel/recover/cleanup, stale preview, secret redaction and unknown actual identity.
- [ ] Reuse existing tool-record/update/proxy test fixtures; add no new test framework.
- [ ] Finalize the per-task map, commands, wave dependencies and threat IDs alongside PLAN.md files.

## Manual-Only Verifications

| Behavior | Requirement | Why manual / conditional | Instructions |
|---|---|---|---|
| Actual configured harness read-only invocation of the exact candidate, including alpha-AOS proxy route where applicable | PROOF-01, PROOF-02 | Isolated fake hosts and protocol fixtures cannot prove target-host execution; credentials, service and reload may be unavailable | Under a separately authorized reviewed operation, inspect real execution/config identities and capture redacted observed invocation receipts for each actual affected harness. Otherwise leave pending and keep the prior active version. |
| Actual native recovery of a reviewed installation and remaining side effects | PROOF-04 | Planning does not authorize global installs or destructive fault injection | Use the adapter's declared approved recovery mechanism and read-only reconciliation; retain unknown identity and unrecovered effects when observation is insufficient. |

## Validation Sign-Off

- [ ] All final tasks have automated verification or an explicit conditional manual boundary.
- [ ] No three consecutive tasks lack automated verification.
- [ ] New test files have explicit owning tasks and are built before invocation.
- [ ] Threat IDs map to concrete adversarial behavior tests.
- [ ] All commands include observable failure conditions in PLAN.md.
- [ ] Actual check results are recorded during implementation; this draft asserts none.

Approval: pending implementation and validation audit. `nyquist_compliant` and `wave_0_complete` remain false until supported by evidence.

## Spec-less Edge Probe Accounting

The deterministic fallback report surfaced 6 applicable and 0 resolved rows. The plan set authors all six without dismissal:

| Probe row | Disposition | Authored location |
|---|---|---|
| PROOF-01 / unclassified | Flagged assumption; unresolved | 42-01 `must_haves.truths` |
| PROOF-02 / unclassified | Flagged assumption; unresolved | 42-01 `must_haves.truths` |
| PROOF-03 / idempotency | Explicit criterion | 42-02 `must_haves.truths`; Task 42-02-02 |
| PROOF-03 / concurrency | Explicit criterion | 42-03 `must_haves.truths`; Task 42-03-01 |
| PROOF-04 / idempotency | Explicit criterion | 42-05 `must_haves.truths`; Tasks 42-05-01/02 |
| PROOF-04 / concurrency | Explicit criterion | 42-05 `must_haves.truths`; Task 42-05-01 |

Equality: **6 surfaced = 4 authored explicit criteria + 2 flagged assumptions**. No row was auto-dismissed and no unclassified row was converted to a backstop pass.

Prohibition recall was serialized through each plan's `must_haves.prohibitions` block as descriptor-less `status: unresolved` items. No `check_kind`, `check_target`, `check_rule`, or fixture descriptor was invented. Routine OWASP controls were dropped from prohibition recall and are handled in the STRIDE registers instead.

## Multi-Source Coverage Audit

| Source | ID | Feature / constraint | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Meaningful integration evidence gates update acceptance; failures preserve/recover working state with honest native-effect reporting | 01-06 | COVERED | Verification tracer → durable state → barrier → recovery → controls → CLI |
| REQ | PROOF-01 | Evaluate newly resolved versions through actual integration checks | 01, 03, 06 | COVERED | No support-list refusal; actual proxy/harness invocation boundary |
| REQ | PROOF-02 | Distinguish installation/discovery/protocol/invocation and explicit unverified state | 01-03, 05-06 | COVERED | Four tiers, fingerprints, statuses, outputs |
| REQ | PROOF-03 | Pre-apply failure preserves working installation and reports specific failure | 01, 03-05 | COVERED | Inactive preparation, global barrier, interruption-first gate |
| REQ | PROOF-04 | Post-apply/interrupted native recovery and honest remaining state | 02, 04-06 | COVERED | Durable lifecycle, adapter-native reverse recovery, CLI controls |
| RESEARCH | R-01 | Per-adapter inactive preparation requires positive before/after identity/config/path proof | 01, 04 | COVERED | Unavailable/unproven capability is pending with old active identity unchanged |
| RESEARCH | R-02 | Four evidence tiers with auditable invocation descriptor and dependency fingerprints | 01 | COVERED | Descriptor binds request schema, cost/permission and actual boundary; absence is pending |
| RESEARCH | R-03 | Actual affected-harness discovery from current config/execution path | 01, 03 | COVERED | Static table remains preview-only |
| RESEARCH | R-04 | Backward-readable separate lifecycle schema; old acceptance semantics immutable | 02 | COVERED | `tool-release-lifecycle/v1/...` separate versioned path, no legacy promotion |
| RESEARCH | R-05 | All-tool/all-actual-harness activation and acceptance barrier | 03 | COVERED | Zero activation on any pending/fail |
| RESEARCH | R-06 | Native adapter prepare/verify/activate/recover/reconcile with capability honesty | 04 | COVERED | Cua/npm/GSD/ECC/MCP/Pi descriptors |
| RESEARCH | R-07 | Reverse recover all switched tools, then actual identity/invocation observation | 04 | COVERED | Update remains failed when recovered |
| RESEARCH | R-08 | Interruption-first reconciliation and retention-safe lifecycle controls | 05 | COVERED | Resume/cancel/recover/cleanup service contracts |
| RESEARCH | R-09 | Proposed command flags and exit 0/2/3/4/5 with JSON/text parity | 06 | COVERED | Concrete additive CLI contract |
| CONTEXT | D-01 | Pending actual invocation keeps old active version | 01 | COVERED | Inactive tracer and pending result |
| CONTEXT | D-02 | Preview checks/cost/permission; no approval expansion | 01, 06 | COVERED | Domain result and output |
| CONTEXT | D-03 | Exact resume command; no latest reselection | 02, 05, 06 | COVERED | Durable binding and CLI |
| CONTEXT | D-04 | Reuse only unchanged evidence; pre-switch recheck | 01, 02, 05 | COVERED | Fingerprint invalidation |
| CONTEXT | D-05 | Shared install waits for all affected harnesses | 03 | COVERED | Two-harness tracer |
| CONTEXT | D-06 | Actual-use harness scope, unknown means hold | 01, 03 | COVERED | Config/path proof |
| CONTEXT | D-07 | Any batch pending/fail holds whole reviewed operation | 03 | COVERED | Fresh `--tool` preview action |
| CONTEXT | D-08 | Success only after switch+checks; distinct non-success exits | 03, 06 | COVERED | Structured statuses + exits |
| CONTEXT | D-09 | Immediate bounded recovery after postcheck failure | 04 | COVERED | Auto-recovery tracer |
| CONTEXT | D-10 | Reverse-recover all switched tools and report residuals | 04 | COVERED | Multi-adapter fault tests |
| CONTEXT | D-11 | Keep recovered prior state; explicit retry only | 04 | COVERED | No candidate reactivation |
| CONTEXT | D-12 | Read-only diagnosis and exact next command on uncertain recovery | 04, 06 | COVERED | Unknown/residual output |
| CONTEXT | D-13 | Reconcile interruption before same-tool new work | 05 | COVERED | Single-writer interruption gate |
| CONTEXT | D-14 | Protect active/last-good/pending/recovery and never auto-delete history | 02, 05-06 | COVERED | Protected set + cleanup binding |
| CONTEXT | D-15 | Explicit cancel preserves files/evidence/history | 02, 05-06 | COVERED | Cancel terminal event only |
| CONTEXT | D-16 | Reacquire exact official prior identity only within scope | 04-05 | COVERED | Integrity-verified exact tuple |

Exclusions are not gaps: Phase 43 migration/all-consumer/bilingual guidance consistency, unresolved v0.7.0 live acceptance, real global update/deployment/GUI operation, full-suite/cross-platform/push/CI requirements.
