---
phase: "39"
slug: "tool-inventory-and-local-release-records"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 39 — Validation Strategy

> Final planning contract; execution has not started. Every row below maps to a written plan/task and real or task-produced test path. No implementation tests, build or live-host checks have run during planning.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test`, compiled TypeScript |
| Config | `tsconfig.json`, `scripts/run-tests.mjs` |
| Quick command | `npm run build` then the current task's exact compiled `--files` command below |
| Static check | `npm run check` |
| Optional full regression | `npm test` |
| Runtime | Not measured; use bounded fixture tests without network or real installers |

## Sampling Rate

- Each implementation task runs its relevant bounded automated check after creating its test dependencies.
- Each wave verifies the completed vertical slice and affected existing consumers; no watch mode.
- Before phase verification, run the phase checks and static check. Expand regression only for observed changes/failures.
- Full suites, cross-platform checks and CI remain optional manual operations under the owner delivery policy. This contract creates no pre-push gate.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 39-01 | 1 | LOC-01, LOC-04 | T-39-01 | Real Cua read→record boundary→model→CLI; absent/unknown and no read mutation | tracer e2e | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-inventory-cli.test.js` | Created by 39-01-01 | not run |
| 39-01-02 | 39-01 | 1 | LOC-04 | T-39-02,03,04 | Closed schema/version/secret/URL/root/identity/empty/adjacency contract | contract/security | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-records.test.js dist/test/tool-inventory-cli.test.js dist/test/validation.test.js` | New records test created here; CLI test from 01-01; validation source existing | not run |
| 39-02-01 | 39-02 | 2 | LOC-04 | T-39-05,06,09 | Explicit writer→CLI; external canonical roots, TOCTOU, session ownership, safe metadata | writer e2e/security | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-record-store.test.js dist/test/tool-inventory-cli.test.js` | Store test created by 39-02-01; CLI test from 01-01 | not run |
| 39-02-02 | 39-02 | 2 | LOC-04 | T-39-06,07,08,09 | Multi-tool failure/interruption/partial; immutable retry; prior accepted; journal commit and ordering | fault/security | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-record-store.test.js dist/test/tool-records.test.js dist/test/tool-inventory-cli.test.js` | All created in preceding tasks; expanded here | not run |
| 39-03-01 | 39-03 | 2 | LOC-01 | T-39-10,12,13 | All managed tools, manual/multiple installs, unknown vs missing; no execution/network/writes | observer fixtures | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-observers.test.js dist/test/tool-inventory-cli.test.js` | Observer test created by 39-03-01 | not run |
| 39-03-02 | 39-03 | 2 | LOC-01 | T-39-10,11,12 | Five harness relations; shared/split installs; installation and connection ownership independent | binding fixtures | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-bindings.test.js dist/test/tool-observers.test.js dist/test/tool-inventory-cli.test.js` | Binding test created by 39-03-02 | not run |
| 39-04-01 | 39-04 | 3 | LOC-01, LOC-04 | T-39-14,15 | Sufficient official proof+current match allows no-install handoff; prior owner/identity/edits retained | provenance/writer roundtrip | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-handoff.test.js dist/test/tool-records.test.js dist/test/tool-record-store.test.js` | Handoff test created by 39-04-01 | not run |
| 39-04-02 | 39-04 | 3 | LOC-01, LOC-04 | T-39-16,17 | Current observation vs accepted vs latest attempt; no false present health | projection/CLI | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-inventory.test.js dist/test/tool-inventory-cli.test.js dist/test/tool-handoff.test.js` | Inventory test created by 39-04-02 | not run |
| 39-05-01 | 39-05 | 4 | LOC-01, LOC-04 | T-39-19,21 | Category boundaries, complete detail, problem-first order and independent status axes | presentation contract | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-inventory.test.js dist/test/tool-observers.test.js dist/test/tool-bindings.test.js` | Existing from prior tasks, expanded here | not run |
| 39-05-02 | 39-05 | 4 | LOC-01, LOC-04 | T-39-18,19,20 | Safe flags/IDs, tool+operation reverse history, human/JSON parity and read-only dispatch | phase e2e | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-inventory-cli.test.js dist/test/tool-inventory-compat.test.js dist/test/tool-records.test.js dist/test/tool-record-store.test.js dist/test/tool-inventory.test.js dist/test/tool-observers.test.js dist/test/tool-bindings.test.js dist/test/tool-handoff.test.js` | Compat test created by 39-05-02; other sources created before this command | not run |
| 39-05-02 regression | 39-05 | 4 | LOC-01, LOC-04 | T-39-20 | Existing sync Inventory consumers and managed document routes remain compatible | regression | After task build: `node scripts/run-tests.mjs --files dist/test/install.test.js dist/test/doctor.test.js dist/test/update.test.js dist/test/validation.test.js` | Existing tracked test sources; compiled by task build | not run |
| 39-05-02 types | 39-05 | 4 | LOC-01, LOC-04 | T-39-20 | Existing and new API contracts retain strict TypeScript compatibility | static | `npm run check` | Existing package.json script | not run |

Every `npm run build` failure (including build-artifact generation) is a task failure; do not run its next test command after failure. Every runner command fails for missing compiled files, assertion failure, child error or timeout. Each PLAN task includes its own observable `<fails_when>` for each runnable command. No watch mode, real-home, network, package installation or live integration dependency is permitted in these fixtures.

## Wave 0 Requirements

- Create isolated temporary checkout/home/state roots, catalog and Cua-pin fixtures, deterministic observers and fault points before their first automated use.
- Create the planned record/inventory test files as part of their owning tasks; no empty stubs or knowingly missing imports as verification.
- Use existing Node test infrastructure; no dependency installation is needed.
- Every file referenced by a verify command must exist by that task's verify step. The producer is specified above and all compiled paths are listed as plan-produced artifacts.

## Required Negative Assertions

- Inventory/detail/history queries create no directories, records, downloads or ownership changes.
- Absent, inaccessible, malformed and unsupported evidence remain distinguishable; expected checksums are not proof of checks performed.
- Failed/interrupted/partially successful multi-tool operations preserve history and prior accepted references without claiming the old runtime is still healthy.
- Concurrent writers, corrupt/unsupported records, traversal, checkout-local state overrides and symlink/junction escapes fail closed.
- Token/userinfo/query-bearing URLs, credentials and raw command/environment/error payloads cannot appear in records, human output or JSON.
- Multiple installations and intentional per-harness version differences are informational; ambiguous use/conflicting paths are diagnosed.
- Arbitrary local hashes cannot establish official provenance; sufficient existing official evidence can support handoff without unconditional re-download.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Real-host discovery coverage and actual selected-tool invocation | LOC-01 / later PROOF scope | Fixtures do not establish target-host operation | If explicitly performed during execution, record exact tool/platform/harness and missing prerequisites. Otherwise report unverified. Actual new integration checks remain Phase 42. |

## Validation Sign-Off

- [x] Final plan task IDs and threat references replace provisional rows.
- [x] All ten tasks have automated verification and create/consume test paths in explicit dependency order.
- [x] Planned sampling continuity has no unchecked implementation task.
- [x] Required negative assertions map to the concrete fixtures in the task table.
- [x] Planned checks have no watch flags, real-home mutations or external installer/network dependencies.
- [ ] Execution evidence recorded before setting `nyquist_compliant: true` or `wave_0_complete: true`.

**Approval:** Planning map complete; implementation and validation evidence remain unexecuted. `status: draft`, `nyquist_compliant: false` and `wave_0_complete: false` intentionally remain unchanged.

## Threat and Edge Coverage

- T-39-01..T-39-21 have specific task/test mappings above; T-39-SC is reserved in every plan and no package installation task exists. ASVS L1/high block is the configured policy, not a claim of completed certification.
- LOC-04 adjacency: equal event ID+equal contents is idempotent, changed contents conflict, distinct tools do not merge (39-01-02/39-02-02).
- LOC-04 empty: absent store→empty history/null accepted; empty operation tools/null mandatory IDs rejected (39-01-02/39-02-01).
- LOC-04 ordering: newest occurredAt first with operationId/sequence/eventId tie-break, independent of directory enumeration (39-02-02).
- A-39-EDGE-01: LOC-01 unclassified remains an unresolved flagged assumption. It is not silently resolved by adjacent fixtures; phase verification must report the classification gap.
- P39-1/P39-2/P39-3 are projected descriptor-less prohibitions in 39-01/39-04 and remain flagged-unverified. Contract tests alone do not satisfy the separate prohibition-enforcement disposition. Preserve honest later human_needed/gaps outcomes.
- Full source/decision coverage, raw probe dispositions, canon-referral breadcrumbs and contribution gate verdicts are in 39-SOURCE-AUDIT.md; no external API integration declaration is in COVERAGE.md.
