---
phase: "22"
slug: "release-proof"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-10"
---

# Phase 22 — Validation Strategy

> Validation contract for VER-01..04. A fixture pass, local run, or earlier revision does not substitute for the final candidate's three-OS and live receipts.

## Test Infrastructure

| Property | Value |
| --- | --- |
| Framework | TypeScript compiled to Node `node:test` |
| Config and runner | `tsconfig.json`, `scripts/run-tests.mjs` |
| Focused checks | `npm run build && node scripts/run-tests.mjs --files dist/test/<named>.test.js && npm run check` |
| Full local gate | `npm run check`, `npm test`, `npm run build`, `npm run build:check` |
| Cross-OS gate | One final-SHA `.github/workflows/ci.yml` run with green Windows, macOS and Linux jobs and one authoritative tarball hash |
| Runtime | Measure during execution; no invented estimate |

## Sampling Rate

- Run focused affected tests after each implementation task; run the cross-OS CI only after a candidate commit is fixed, and rerun it if the release code changes.
- At the final gate, inspect raw logs and named assertions for each injected defect. Record a typed gap for environment failure, unavailable runner, undecidable result, or missing authenticated canary.
- Re-run the packed host comparison with the same artifact hash after investigating unexplained drift.

## Per-Plan Verification Map

| Plan | Requirement | Secure behavior | Automated proof | Additional evidence |
| --- | --- | --- | --- | --- |
| 22-01 | VER-01..04 | One candidate identity, truthful evidence status and nonactivation tracer | New release-evidence test, existing task entry and support matrix tests | Read-only sample report |
| 22-02 | VER-01 | Five named fault controls detect injected broken behavior | Fault-control and CI manifest tests | Same-SHA three-OS job IDs and raw failing assertion logs |
| 22-03 | VER-02 | Exact-version role/capability cells and real handoffs, no blanket support | Support matrix, role receipt and capability receipt tests | Native per-cell and sender/receiver receipts |
| 22-04 | VER-03 | Same-hash packed lifecycle, stable lock and no unknown real-host drift | Tarball fixture and release-control tests | Package SHA and path-category before/after summary |
| 22-05 | VER-04 | Both examples retain every criterion/item and applicable call result | Development and CoursePilot exemplar tests | Same-revision independent review; authenticated LMS check or UNVERIFIED |
| 22-06 | VER-01..04 | Public docs equal release evidence, all final gates block on gaps | Evidence schema/report tests and full suite | Final three-OS run, GSD audit/UAT, integration check and independent review |

## Wave 0 Requirements

- [ ] Add deterministic release evidence fixtures with an absent-receipt and mismatched-SHA case before writing a positive report renderer.
- [ ] Add named fault mutation fixtures for crash, cancellation, duplicate effects, concurrency and false acceptance; assert each intended control becomes red.
- [ ] Add exemplar oracles with a missing required call and an unknown mandatory criterion; both must prevent completed status.
- [ ] Confirm CI logs/artifacts can be retained and referenced by run and job ID before claiming the final matrix complete.

## Manual and External Verification

| Behavior | Requirement | Instructions |
| --- | --- | --- |
| Final three-OS CI | VER-01, VER-03 | Record release commit SHA, run URL, each OS job ID/conclusion, artifact hash and exact named positive/negative assertion references. An unavailable leg stays unverified. |
| Live harness roles and capabilities | VER-02 | Invoke each advertised role and applicable skill/MCP/pack/hook through the native exact-version harness; retain output/receipt and version/binary identity. Record absent or blocked cells with reason/action. |
| Real cross-harness handoff | VER-02 | Send and receive a bounded artifact across representative distinct harness pairs; bind sender and receiver receipts to exact versions. Keep synthetic 5×5×5 results separate. |
| Packed real-host safety | VER-03 | Run packed lifecycle in isolated roots; compare actual host managed path categories before/after. Investigate unknown drift, then retest the same tarball SHA. |
| End-to-end examples | VER-04 | Run development and CoursePilot fixture cases through GSD and read actual criterion/item/capability receipts. Mark live LMS unverified if credentials are unavailable. Independently review the development revision. |
| Milestone closure | VER-01..04 | Run GSD milestone audit, cross-phase integration check, UAT and independent code review. Resolve every blocking gap before closeout; do not turn unverified external evidence into a pass. |

## Validation Sign-Off

- [ ] Every plan task has a runnable check and an observable `<fails_when>` or a clearly marked external evidence gate.
- [ ] Every mandatory requirement and D-01..16 decision has a plan and a named evidence source.
- [ ] The final run uses one candidate SHA and one packed artifact hash on all three OS legs.
- [ ] Public output redacts personal path detail and secret values.
- [ ] No advertised cell or completed task rests on an absent, stale or fixture-only receipt.
- [ ] Set `nyquist_compliant: true` after all validation paths are wired and checked.

**Approval:** pending
