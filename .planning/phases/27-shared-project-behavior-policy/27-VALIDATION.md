---
phase: "27"
slug: "shared-project-behavior-policy"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 27 — Validation Strategy

Planning contract only. No implementation tests have run. The task IDs, waves, threats and commands below match the five saved plans. Status remains draft until execution and native evidence are validated.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Existing Node.js `node:test` and `node:assert/strict` |
| Config | `package.json`, `tsconfig.json`, `scripts/run-tests.mjs` |
| Compile/type checks | `npm run check` then `npm run build` |
| Quick run after build | `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js` |
| Full suite | `npm test` |
| Artifact gate | `npm run build:check` |
| Runtime | Not measured; target focused feedback within 30 seconds |

## Sampling Rate

- After each task: compile and run its entire targeted file plus regressions for touched services.
- After each wave: run all available Phase 27 files and affected validation/root/path/transaction/rollback/owned-skill tests.
- Before GSD verification: record actual `npm test` and `npm run build:check` outcomes. Existing failed/not-run regressions stay explicit and block affected acceptance.
- Do not use watch mode or accept a zero-match test-name filter as behavioral proof.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command (after build) | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|---------------------------------|-------------|--------|
| 27-01-01 | 27-01 | 1 | MODE-01, MODE-02, MODE-03 | T-27-01, T-27-02 | Real compiled CLI missing/valid query, zero writes | CLI tracer | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js` | Created in this task before build | not-run |
| 27-01-02 | 27-01 | 1 | MODE-01, MODE-03, MODE-05 | T-27-01, T-27-02, T-27-03 | Root/schema/tree/task/invalid boundaries and safe errors | unit/CLI | `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js dist/test/evidence.test.js dist/test/path-boundary.test.js dist/test/project.test.js` | New behavior file created here; others exist | not-run |
| 27-02-01 | 27-02 | 2 | MODE-04, MODE-05 | T-27-04 | Exact >2^53 identity, safe JSON, legacy capability refusal | unit/integration | `node scripts/run-tests.mjs --files dist/test/path-boundary.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js` | Existing by wave 2 | not-run |
| 27-02-02 | 27-02 | 2 | MODE-03, MODE-04, MODE-05 | T-27-05, T-27-06 | Review digest/raw revision, exact CLI grammar, zero writes | CLI/unit | `node scripts/run-tests.mjs --files dist/test/behavior-policy.test.js dist/test/project-mode-cli.test.js` | Existing by wave 2 | not-run |
| 27-03-01 | 27-03 | 3 | MODE-04, MODE-05 | T-27-07, T-27-08, T-27-10 | Validated journal metadata, atomic bytes/absence rollback, target→state ownership | integration | `node scripts/run-tests.mjs --files dist/test/transaction.test.js dist/test/validation.test.js dist/test/rollback.test.js` | Existing tracked files extended here | not-run |
| 27-03-02 | 27-03 | 3 | MODE-04, MODE-05 | T-27-08, T-27-09, T-27-10 | Safe rollback errors, no sweep, retained crash evidence | CLI/process | `node scripts/run-tests.mjs --files dist/test/rollback.test.js dist/test/rollback-cli-verification.test.js dist/test/transaction-crash.test.js dist/test/transaction.test.js` | Existing tracked files extended here | not-run |
| 27-04-01 | 27-04 | 4 | MODE-01, MODE-03, MODE-04, MODE-05 | T-27-11, T-27-12, T-27-13 | Exact reviewed apply/no-op/common rollback lifecycle | CLI/integration | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js dist/test/behavior-policy.test.js dist/test/transaction.test.js dist/test/rollback-cli-verification.test.js` | Existing by wave 4 | not-run |
| 27-04-02 | 27-04 | 4 | MODE-04, MODE-05 | T-27-11, T-27-12, T-27-13 | Independent processes/state roots/aliases and both rollback race orders | process | `node scripts/run-tests.mjs --files dist/test/project-mode-concurrency.test.js dist/test/transaction-crash.test.js dist/test/project-mode-cli.test.js` | New concurrency file created here before build | not-run |
| 27-05-01 | 27-05 | 5 | MODE-02, MODE-03 | T-27-14, T-27-15 | Five real renderer/deployment hashes, fresh shared policy, no consent expansion | fixture/CLI | `node scripts/run-tests.mjs --files dist/test/project-mode-routing.test.js dist/test/owned-skills.test.js dist/test/project-mode-cli.test.js` | New routing file created here before build | not-run |
| 27-05-02 | 27-05 | 5 | MODE-03, MODE-04, MODE-05 | T-27-10, T-27-16 | Document actual CLI/recovery/evidence limits | docs/contract | `node scripts/run-tests.mjs --files dist/test/project-mode-cli.test.js dist/test/project-mode-routing.test.js` | Existing by prior task | not-run |
| 27-05-03 | 27-05 | 5 | MODE-01, MODE-02, MODE-03, MODE-04, MODE-05 | T-27-01 through T-27-16, T-27-SC | Full regression, artifact integrity and separate real native acceptance | full/native | `npm test`; separately `npm run build:check` | All new files must exist by this gate | not-run; native human-check open |

Each task's PLAN includes its preceding `npm run build` (and `npm run check` where specified) and an immediately following `fails_when` for every automated command. Named-file missing, nonzero exits and zero executed tests fail acceptance. Compile first; the table does not authorize running a missing future test. `27-05-02` reuses the immediately preceding build because it edits documentation only. Final native proof is a configured end-of-phase human-check, not a reversibility checkpoint; missing evidence blocks MODE-02.

## Test Creation Order (no separate setup dependency)

- [ ] 27-01-01 creates `test/project-mode-cli.test.ts` with isolated project/home/state fingerprints before its first build/run.
- [ ] 27-01-02 creates `test/behavior-policy.test.ts` with read/schema/root/zero-write oracles before its first build/run.
- [ ] 27-04-02 creates `test/project-mode-concurrency.test.ts` with real children, barriers/deadlines, separate state roots and aliases before its first build/run.
- [ ] 27-05-01 creates `test/project-mode-routing.test.ts` with real renderer and five temporary homes before its first build/run.
- [ ] Extend existing rollback, transaction, path-boundary and owned-skill regression coverage where touched.
- Existing runner/compiler/dependencies suffice; no framework installation.

## Required Behavioral Oracles

Missing query and preview create no project/home/state files. Missing-to-explicit-strict creates policy; a valid same-mode request preserves original bytes with no operation ID or journal. Invalid/duplicate/unknown-field/version policy blocks without echoing arbitrary bytes. Bind root identity, target, requested mode and raw-byte revision or missing into the reviewed digest. Reject post-preview creation/deletion/format edit/root replacement/path retarget. Independent processes using different state roots cannot both overwrite the same reviewed prior state; a contending loser can retry only to receive stale evidence. Apply and rollback share coordination and recheck paths, LIFO and drift inside it. Rollback restores exact CRLF/Unicode bytes or removes only the created policy while preserving parent and siblings. Tree-off and bound-task root mismatch remain effective. See `27-RESEARCH.md` Validation Architecture for the full matrix.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Instructions |
|----------|-------------|------------|--------------|
| Actual host selects the owned policy route and invokes shared CLI, followed by another host reading the change | MODE-02, MODE-03; task 27-05-03 | Renderer/CLI fixtures cannot prove native selection | Capture five target/version/loaded-revision/tool receipts and native A→B change/read in 27-NATIVE-EVIDENCE.md. Each unavailable/not-run host carries reason; missing receipt keeps MODE-02 unaccepted. No paid calls or global install are authorized. |
| OS-specific unreadable/link/identity capability | MODE-05 | ACL/junction/inode behavior differs by platform | Run deterministic capability-gated fixtures; skipped cases remain not-run and require supported-platform evidence before claiming parity. |

## Validation Sign-Off

- [x] Final plan task IDs/waves/threat refs replace the original provisional map rows.
- [ ] Every task has automated verification or an explicit native evidence checkpoint.
- [ ] No three consecutive tasks lack automated verification.
- [ ] All new test references are created before use.
- [ ] Actual focused latency is measured; no watch flags.
- [ ] Native receipts and fixture proof are labeled separately.
- [ ] `nyquist_compliant: true` is set only after the completed map is checked.

**Approval:** Planning draft; execution and native acceptance remain open. The three unclassified edge assumptions and two descriptor-less prohibitions remain flagged in 27-SOURCE-AUDIT.md and plans. No test or native success is inferred from the completed planning map.
