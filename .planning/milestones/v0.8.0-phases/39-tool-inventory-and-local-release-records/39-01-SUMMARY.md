---
phase: 39-tool-inventory-and-local-release-records
plan: "01"
subsystem: tool-inventory
tags: [inventory, cua, local-records, validation]
requires: []
provides: [read-only Cua inventory, versioned tool event reader, evidence-gated accepted references]
affects: [39-02, 39-03, 39-04, 39-05]
tech-stack:
  added: []
  patterns: [closed versioned event documents, external-root path proofs, applied-journal evidence]
key-files:
  created: [src/core/tool-inventory.ts, src/core/tool-records.ts, schemas/tool-release-record.schema.json, test/tool-inventory-cli.test.ts, test/tool-records.test.ts]
  modified: [src/cli.ts, src/format.ts, src/core/validation.ts]
key-decisions:
  - "Keep installed versions null when observed bytes provide no version evidence."
  - "Require matching integration invocation evidence and an applied transaction journal before accepting a transition."
  - "Key accepted references by tool and installation identity."
requirements-completed: [LOC-01, LOC-04]
actuals:
  tokens: 10352
  tasks: 2
  commits: 4
  plan_head_before: 3169c6acb13a01794b3445daed5500285be44042
  plan_head_after: aca291ffa6800ba25d62a02ef3cdc3e9c71aa5bb
duration: 27min
completed: 2026-11-06
status: complete
---

# Phase 39 Plan 01: Tool Inventory and Local Release Records Summary

**Read-only Cua observation separates installed bytes from the selected pin, and a closed local event reader gates accepted references on matching proof and applied journal evidence.**

## Accomplishments

- Added `inventory --tool cua-driver` with independent installation, integrity and integration states; existing synchronous inventory remains unchanged.
- Added versioned event validation, constrained source URLs, bounded reads, external-root and ancestor checks, deterministic history ordering, and separate operation/tool views.
- Added acceptance reduction keyed by tool and installation, requiring matching integration evidence, complete operation results, and an applied journal with the event's hash.

## Task Commits

1. `e3a3559` — RED: Cua CLI tracer.
2. `972ebfd` — Cua inventory tracer.
3. `56a4fbb` — RED: empty record history.
4. `aca291f` — versioned records and validation.

## Verification

- `npm run build` — passed after the final changes.
- `node scripts/run-tests.mjs --files dist/test/tool-records.test.js dist/test/tool-inventory-cli.test.js dist/test/validation.test.js` — passed, 26 tests.
- The tracer was rebuilt and rerun successfully after its commit and before expansion.
- Both RED evidence files in this directory were checked with `gsd-tools check tdd-red-evidence` and returned `RED_EVIDENCE_OK`; each target assertion failed for the planned missing behavior before implementation.
- Windows temporary fixtures exercised the CLI, alias/junction and ancestor replacement. The macOS CLI fixture simulates the Linux observer path to avoid touching `/Applications`; real macOS installation discovery, host Cua invocation, official provenance and other host/platform behavior were not verified.

## Deviations from Plan

- The CLI fixture uses the repository's reviewed pin and an isolated temporary home/state instead of creating a temporary package checkout. The observer's installed version remains unknown because the fixture contains no independent version evidence.
- The unresolved prohibition descriptor remains flagged-unverified; this summary does not count it as verified. Lookup itself performs no record writes in the exercised fixtures.
- Acceptance currently requires integration invocation proof and supports the declared Cua and npm registry source paths; unsupported sources fail closed. This is narrower than treating an applied journal or a digest alone as tool verification.

## Self-Check: PASSED

The created source, schema, and test files exist, and all four task commits are ancestors of the recorded plan head.
