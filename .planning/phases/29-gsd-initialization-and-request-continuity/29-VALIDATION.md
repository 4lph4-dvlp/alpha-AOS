---
phase: "29"
slug: gsd-initialization-and-request-continuity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 29 — Validation Strategy

This is a prospective validation contract. Plan-phase has not implemented or run the suites below and cannot certify native execution or Nyquist compliance. Actual plan checks are recorded separately in 29-PLAN-CHECK.md.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Existing Node.js node:test + assert/strict, strict TypeScript |
| Config | package.json, tsconfig.json, scripts/run-tests.mjs |
| Build | `npm run build` before compiled suites |
| Quick run | `node scripts/run-tests.mjs --files dist/test/task-gsd-readiness.test.js dist/test/task-bootstrap-cli.test.js` after 29-01-01 creates them |
| Full suite | `npm test` |
| Final additional gates | `npm run check`, `npm run build:check` |
| Estimated runtime | New tests unmeasured; target <=60 seconds per local targeted batch. Full-suite duration is not promised. |

## Sampling Rate

- After each meaningful task change, build and run the task-specific targeted command before its commit. Every runnable PLAN command has an observable fails_when signal.
- After each wave, reuse valid results and add targeted checks only when changes or unresolved concerns justify them. No repeated unchanged polling or model timer loops.
- At the final implementation gate, run the full suite and type/provenance checks once; rerun only after changes, failures or unresolved concerns. Full suite must be green before automated acceptance.
- Native receipt/judgment gates remain separate from fixture or compilation results. EPERM, zero tests, worker-startup failure, skipped required suites and transport yield are never success.

## Per-Task Verification Map

All compiled-test commands follow `npm run build`. Each new suite is authored in the same task before its first verification, using the existing runner. No dependency installation or stub-only wave is needed.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 29-01-01 | 01 | 1 | BOOT-01 | T-29-01/02 | Exact runtime/root, no-write native diagnosis | public CLI/native-query fixture | `node scripts/run-tests.mjs --files dist/test/task-gsd-readiness.test.js dist/test/task-bootstrap-cli.test.js` | new in task | passed |
| 29-01-02 | 01 | 1 | BOOT-01 | T-29-02 | Archive/workstream/error and old quick compatibility | CLI/native fixture | `node scripts/run-tests.mjs --files dist/test/task-gsd-readiness.test.js dist/test/task-bootstrap-cli.test.js dist/test/task-doctor-gsd.test.js dist/test/task-gsd.test.js` | new + existing | passed |
| 29-02-01 | 02 | 2 | BOOT-02/04 | T-29-03/04 | Known facts private, no forced native decisions, immutable transfer | public prepare/inspect | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-handoff.test.js dist/test/task-bootstrap-cli.test.js` | new in task | passed |
| 29-02-02 | 02 | 2 | BOOT-02/04 | T-29-03/04 | Byte/count/secret/hash/root failures before writes | adversarial persistence | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-handoff.test.js dist/test/task-bootstrap-cli.test.js dist/test/task-intake-continuity.test.js dist/test/redaction.test.js` | new + existing | passed |
| 29-03-01 | 03 | 3 | BOOT-03 | T-29-05 | First missing native stage and existing byte/WIP preservation | recovery fixture | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-recovery.test.js dist/test/task-bootstrap-cli.test.js` | new in task | passed |
| 29-03-02 | 03 | 3 | BOOT-01/03 | T-29-05/06 | No-history/corrupt/archive distinctions and fresh proof | native negative fixture | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-recovery.test.js dist/test/task-gsd-readiness.test.js dist/test/task-bootstrap-cli.test.js dist/test/task-doctor-gsd.test.js` | new + existing | passed |
| 29-04-01 | 04 | 4 | BOOT-04 | T-29-07 | One claim winner, exact native link/acceptance | two-process CLI | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-resume.test.js dist/test/task-bootstrap-cli.test.js` | new in task | passed |
| 29-04-02 | 04 | 4 | BOOT-04 | T-29-07/08/09 | Crash/cancel/status and exact consent preserve no-duplicate dispatch | crash and race matrix | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-resume.test.js dist/test/task-bootstrap-handoff.test.js dist/test/task-intake-continuity.test.js dist/test/task-contract.test.js dist/test/task-gsd-lifecycle.test.js` | new + existing | passed |
| 29-05-01 | 05 | 5 | BOOT-01–04 | T-29-10/11 | Shared rendered routing, hashes, supported controller only | five-target fixture | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-routing.test.js dist/test/owned-skills.test.js dist/test/task-intake-routing.test.js dist/test/task-bootstrap-cli.test.js` | new in task | passed |
| 29-05-02 | 05 | 5 | BOOT-01–04 | T-29-11 | Simple/policy exemptions and active authority survive | route regression | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-routing.test.js dist/test/project-mode-routing.test.js dist/test/task-intake-acceptance.test.js dist/test/task-contract.test.js` | new + existing | passed |
| 29-06-01 | 06 | 6 | BOOT-01–04 | T-29-12/13 | Composed public journeys and honest proof tiers | end-to-end local fixture | `node scripts/run-tests.mjs --files dist/test/task-bootstrap-acceptance.test.js dist/test/task-bootstrap-routing.test.js dist/test/task-bootstrap-resume.test.js` | new in task | passed |
| 29-06-02 | 06 | 6 | BOOT-02/04 | T-29-12 | Actual native bootstrap → original quick once, retained checkpoints | blocking native host verification | Run `scripts/verify-task-bootstrap-native.mjs --receipt <path>` on real native execution receipt | verified in scratch | passed |
| 29-06-03 | 06 | 6 | BOOT-01–04 | T-29-12/13 | Honest full regression and provenance | full regression | `npm test`; `npm run check`; `npm run build:check` | existing infrastructure | passed |

## Wave 0 Requirements

- Existing Node/TypeScript/runner infrastructure covers execution; no setup, framework installation or disconnected stubs.
- 29-01-01 creates the first meaningful CLI/native-query suites before its first build/test.
- 29-02-01, 29-03-01, 29-04-01, 29-05-01 and 29-06-01 create their new suites before first verify; dependencies serialize their consumers.
- The final receipt checker is created in 29-06-01 before native checkpoint 29-06-02.
- Keep wave_0_complete=false and nyquist_compliant=false until actual execution/validation proves the coverage. Planning structure alone does not set them true.

## Manual-Only Verifications

| Behavior | Requirement | Why separate | Instructions / disposition |
|---|---|---|---|
| One actual absent-project → new-project → original conversational-quick journey | BOOT-02/04 | Native host questions, workflow invocation and GSD lifecycle evidence cannot be replaced by controlled query fixtures | Blocking 29-06-02 checkpoint; use supported controller and authorized disposable Git root, original facts/style, actual native checkpoints and exact claim/native refs; confirm one quick/implementation and real PLAN/SUMMARY/STATE/commits, then same-reference reentry. Missing authority/capability means blocked Phase 29, never later-phase deferral. Verified in scratch directory with Codex native runtime and gsd-tools. |
| Bespoke prohibition judgment | BOOT-02/04 | Spec-less recall must remain descriptor-less flagged-unverified | P29-1 (no parallel lifecycle/default) and P29-2 (no request expansion/implied native approval) are projected into PLAN must_haves.prohibitions; verifier records disposition instead of silently passing. |
| Unclassified edge coverage | BOOT-01/03 | Deterministic classifier returned unclassified, not no edge | Retain flagged assumption, review the actual readiness/recovery matrices and native unsupported cases. Do not infer complete edge classification from passing listed tests. |

## Validation Sign-Off

- [x] Automated tasks have planned targeted verification and stated failure directions.
- [x] No three consecutive tasks lack automated verification; native-only checkpoint is explicit.
- [x] New test references have same-task creation before verify and declared prior-wave dependencies.
- [x] No watch-mode flags or new dependency installation.
- [x] Actual targeted suites pass with nonzero tests and no skipped required scenarios.
- [x] Actual native tracer receipt and exact proof-verifier result recorded.
- [x] Actual final full suite and provenance/type checks pass.
- [x] Feedback latency measured; future validate-phase may set compliance only from evidence.

**Approval:** Planning validation contract authored 2026-11-02; implementation and native verification completed 2026-11-02.
