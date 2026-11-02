---
phase: 31-cross-harness-proof-and-distribution
plan: "05"
subsystem: verification
tags: [regression, provenance, independent-review, release-holds]
requires: [{phase: 31-03, provides: packed lifecycle proof}, {phase: 31-04, provides: bilingual guide contract}]
provides: [measured single-HEAD regression ledger, guide hash bindings, historical debt comparison]
affects: [milestone-audit]
key-files:
  created: []
  modified: [docs/task-entry-proof-index.json, docs/task-entry-proof.md]
requirements-completed: [PROVE-01, PROVE-02, PROVE-03, PROVE-04]
duration: 45m
completed: 2026-11-03
status: complete
coverage:
  - id: D14
    description: Ordered single-source final regression, packed lifecycle and proof verifiers
    verification: [{kind: integration, ref: ".planning/tmp/31-final-gates.json", status: pass}]
    human_judgment: false
  - id: D15-D16
    description: Measured separate counts, historical debt retained, release holds and independent review
    verification: [{kind: integration, ref: "test/task-entry-proof.test.ts", status: pass}, {kind: integration, ref: "31-REVIEW.md", status: pass}]
    human_judgment: false
---

# Phase 31 Plan 05: Final regression and proof ledger

**A complete local regression at one source commit records 2149 total / 2135 passed / 0 failed / 14 skipped / 0 not-run, with all historical debt and release holds preserved.**

## Task commits

| Task | Commit | Result |
|---|---|---|
| 31-05-01 | bdd19aa, 9b6679a | Mandatory guide hashes and clean independent review; complete D-14 sequence executed against source `9b6679a481a0d694551712e6c1f621afbdada704` |
| 31-05-02 | 2182da9 | Measured 12-group regression counts, eight command receipts, source bindings and five-row historical comparison |

## Final gate evidence

- Source: `9b6679a481a0d694551712e6c1f621afbdada704`; Windows `win32/x64`, Node `v24.13.1`, npm `11.8.0`.
- Started `2026-11-02T19:29:03Z`, finished `2026-11-02T20:02:20Z` (UTC).
- `check` → `build` → targeted Phase 31 suites → `audit-tarball` → full `npm test` → `build:check` → native-style proof → task-entry proof: all exit 0.
- Full suite: **2149 total, 2135 passed, 0 failed, 14 skipped, 0 not-run**. Includes the ordinary pool, ten isolated Windows native-process files, and final packed lifecycle (12 distinct groups). The full test command took 1887926 ms.
- Logs: `.planning/tmp/31-final-*.log`; command receipts `.planning/tmp/31-final-gates.json`; parsed counts `.planning/tmp/31-final-counts.json`.
- Both proof JSONs returned `valid: true`; native-style proof also reports `allVerified: true` for its existing archived Pi receipts. No fresh paid native turn is claimed.
- Post-ledger proof/docs suites: 10 total, 9 passed, 0 failed, 1 Windows symlink skip (`.planning/tmp/31-post-ledger-tests.log`).
- Post-ledger tarball audit: passed, 451 allowlisted entries. Build artifact check: passed, 348 inputs / 686 outputs. Both read-only proof verifiers: passed.

## Historical debt and holds

The original `261101-ww3` worker-start timeout (`command-job-runtime.test.js`, `job-8aff6aa5e58e46ea`, 4009 ms) and four previously not-run suites are retained verbatim in the historical ledger. The new five-row comparison records the actual current measurements beside that history; it does not waive or erase it.

Fourteen host-permission/fixture skips remain distinct from passed tests. CI on other OSes, Claude G-07-2, global reconciliation, git push, npm publication/version bump, and the separate milestone final review remain held. Package version stays 0.5.0; no global install, push or publish was performed.

## Deviations and review fixes

The mandatory fresh reviewer found and verified fixes for CR-01 (incomplete/zero-test ledger success), CR-02 (encoded JSON/YAML private paths, including native Map/Set values), CR-03 (optional user-guide hashes), and WR-01 (unreadable deployed skills aborting doctor). Fixes: `c162bf3`, `b4de18d`, `bdd19aa`, `2dde9db`. Final independent review is clean, with disposition in `31-REVIEW-DISPOSITION.md`.

The earlier gate attempt at `bdd19aa` was explicitly stopped for the remaining YAML set fix. It is preserved as superseded evidence and excluded from all final counts. The complete gate above ran after the source correction. Reviewer/verifier model inheritance was explicitly approved by the user when the configured model was unavailable; no global model configuration was changed.

## Self-Check: PASSED

Both guide hashes are mandatory in the verifier and index. All required source/command/suite receipts are present, count totals reconcile, tested source bindings match committed bytes, dual-context and negative tests pass, and the existing support matrix has no Phase 31 changes. All five plans are summarized; phase goal verification is the next gate.
