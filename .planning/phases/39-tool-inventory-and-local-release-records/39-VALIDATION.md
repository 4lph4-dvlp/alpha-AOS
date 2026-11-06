---
phase: "39"
slug: "tool-inventory-and-local-release-records"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-06"
---

# Phase 39 — Validation Strategy

> Planning contract only. No implementation tests or live-host checks have run. The planner must align the task IDs and commands below with the final plans.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test`, compiled TypeScript |
| Config | `tsconfig.json`, `scripts/run-tests.mjs` |
| Quick command | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-records.test.js dist/test/tool-inventory.test.js` (new files created by planned tasks) |
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
| Planner to resolve: records | TBD | TBD | LOC-04 | Planner to resolve | Invalid identities/secret-bearing metadata/unsafe roots rejected; interrupted writes retain prior accepted identity | contract / fault injection | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-records.test.js` | Missing: created in task | pending |
| Planner to resolve: inventory | TBD | TBD | LOC-01 | Planner to resolve | Read-only observation; absent differs from unknown; discovery grants no ownership/trust | fixture / integration | `npm run build` then `node scripts/run-tests.mjs --files dist/test/tool-inventory.test.js` | Missing: created in task | pending |
| Planner to resolve: compatibility | TBD | TBD | LOC-01, LOC-04 | Planner to resolve | Existing inventory consumers stay compatible; no implicit migration/install | regression | `npm run build` then `node scripts/run-tests.mjs --files dist/test/install.test.js` | Existing source `test/install.test.ts` | pending |

## Wave 0 Requirements

- Create isolated temporary checkout/home/state roots, catalog and Cua-pin fixtures, deterministic observers and fault points before their first automated use.
- Create the planned record/inventory test files as part of their owning tasks; no empty stubs or knowingly missing imports as verification.
- Use existing Node test infrastructure; no dependency installation is needed.
- Every file referenced by a verify command must exist by that task's verify step. Planner must replace provisional map rows with final task IDs and runnable commands.

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

- [ ] Final plan task IDs and threat references replace provisional rows.
- [ ] All tasks have automated verification or an explicit dependency that creates the referenced fixture/test file.
- [ ] Sampling continuity has no three consecutive unchecked tasks.
- [ ] Planned negative assertions are mapped to concrete test cases.
- [ ] No watch flags, real-home mutations or external installer/network dependencies in fixture checks.
- [ ] Execution evidence recorded before setting `nyquist_compliant: true` or `wave_0_complete: true`.

**Approval:** Pending implementation and validation evidence.
