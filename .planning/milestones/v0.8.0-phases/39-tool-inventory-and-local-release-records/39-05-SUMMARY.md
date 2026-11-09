---
phase: 39-tool-inventory-and-local-release-records
plan: "05"
status: complete
subsystem: tool-inventory
tags: [inventory, history, read-only, cli]
requires: [39-04]
provides: [component-inventory, tool-history-cli, operation-history-cli]
affects: [40, 41, 42, 43]
tech-stack:
  added: []
  patterns: [bounded-read-only-discovery, shared-record-reader, problem-first-projection]
key-files:
  created: [test/tool-inventory-compat.test.ts]
  modified: [src/core/tool-inventory.ts, src/cli.ts, src/format.ts, test/tool-inventory.test.ts, test/tool-inventory-cli.test.ts, test/tool-observers.test.ts]
key-decisions:
  - "File discovery establishes presence only; it does not establish version, trust or successful invocation."
  - "History selectors use the validated common reader and never map an input ID directly to a file path."
actuals:
  tokens: 8051
  tasks: 2
  commits: 5
  plan_head_before: 1ea846b12962734c80c9857dd03635e034c64177
  plan_head_after: 135c3ede9a5f7ef35d8c7d7131007992e9113d44
completed: 2026-11-06
---

# Phase 39 Plan 05: Inventory and History Summary

The inventory command now presents managed tool observations with problem-first ordering and component category summaries. Detail includes owned skill, bundled dependency, prerequisite and harness observations; tool and operation history use the validated local record reader.

## Work and Verification

- `50d84b3` and `2d12789` recorded RED tests. Both evidence files passed `RED_EVIDENCE_OK`; the named assertions failed on missing category output and missing usage validation respectively.
- `54b8151`, `f1e8834`, and `135c3ed` implement the projections, CLI dispatch, formatters and bounded command-file observations.
- `npm run build` and `npm run check` passed. The specified phase suite passed 32 tests and the install/doctor/update/validation suite passed 46 tests. After the final bounded discovery change, the affected inventory, observer and compatibility tests passed 10 tests; after the snapshot addition, the CLI and affected suite passed 15 tests.
- A writer-created mixed-result operation was queried in JSON and human formats. A byte hash snapshot of the isolated fixture tree was unchanged after the queries; a separate observer test rejects subprocess execution. The existing synchronous inventory type and selection contract remain available.

## Scope and Limitations

Prerequisite and harness observations examine a bounded PATH without executing programs. A found command file has no inferred version or integrity; an unobserved command remains unknown. Bundled libraries are observed through manifests and owned skills through their rendered destinations. These observations do not provision or adopt components.

The existing npm handoff policy remains empty and no real-host package provenance, invocation, installation, migration, update, deployment, or other operating system was verified here. The compatibility fixture directly exercises synchronous selection and read-only collection; the separate existing regression suites exercise install, doctor, update and validation. This plan does not implement later phase integration verification or migration.

## Deviations from Plan

- Updated the existing observer regression to compare the managed tool set independently of its old fixed order, since problem-first ordering intentionally changes that order. Later changed its CLI invocation to the default inventory route because `--tool` now filters to the selected tool.
- Added a third production commit for bounded PATH file discovery and its fixture following the initial implementation. No new package was installed.

## Self-Check: PASSED

Source and test files exist; all five recorded task commits are ancestors of the plan head. The plan diff and measured commit count were checked before writing this summary.
