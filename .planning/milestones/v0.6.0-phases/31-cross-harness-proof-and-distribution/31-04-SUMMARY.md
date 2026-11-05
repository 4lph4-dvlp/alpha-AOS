---
phase: 31-cross-harness-proof-and-distribution
plan: "04"
subsystem: documentation
tags: [bilingual, task-entry, packaging]
requires: [{phase: 31-02, provides: proof ledger and verifier}]
provides: [symmetric user guides, README task entry, 14-artifact package contract]
affects: [31-03, 31-05]
key-files:
  created: [docs/task-entry.md, docs/task-entry.ko.md, test/task-entry-docs.test.ts]
  modified: [README.md, README.ko.md, docs/task-runtime-controls.md, scripts/audit-tarball.mjs]
requirements-completed: [PROVE-03]
duration: 8m
completed: 2026-11-03
status: complete
coverage:
  - id: D09-D12
    description: Symmetric bilingual sections, labels, links, decision examples and support limits
    verification: [{kind: unit, ref: "test/task-entry-docs.test.ts", status: pass}]
    human_judgment: false
---

# Phase 31 Plan 04: Bilingual task entry documentation

**Eight-section English/Korean guides, ten-section READMEs with scenarios A–J, and a tested 14-artifact packaging contract.**

## Task commits

| Task | Commit | Result |
|---|---|---|
| 31-04-01 | f8caa0c | Parallel English/Korean guides and runtime-controls cross-link |
| 31-04-02 | 747f0a7 | README entry tables, scenario drift repair and package/doc contract checks |

## Verification

- `npm run check` and `npm run build`: passed (`.planning/tmp/31-04-{check,build}.log`).
- Documentation/provenance suites: 15 passed, 0 failed, 0 skipped (`.planning/tmp/31-04-tests.log`). The smoke-install failure printed by the negative test is expected and asserted.
- Proof verifier: valid, 55 cells, git-checkout.
- Tarball audit: passed, 451 allowlisted entries (`.planning/tmp/31-04-audit.log`).
- `git diff --check`: passed; support matrix and package version unchanged.

## Deviations from Plan

None. The guides distinguish archived receipts, fixture evidence and native UI uncertainty explicitly.

## Self-Check: PASSED

All created files exist, commits are reachable and parity/link/privacy/release-boundary checks pass. Ready for 31-03 (Wave 4).
