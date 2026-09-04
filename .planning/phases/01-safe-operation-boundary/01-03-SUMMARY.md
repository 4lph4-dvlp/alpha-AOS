---
phase: 01-safe-operation-boundary
plan: 03
subsystem: infra
tags: [redaction, path-alias, support-bundle, sha256, node-test]

requires:
  - phase: 01-01
    provides: "Cross-surface secret corpus that defines what must never be observable"
provides:
  - "Central recursive redactor with a fixed replacement order and hard bounds"
  - "Segment-aware private path aliases for project, state, temp and home roots"
  - "Non-mutating, deterministic, hash-bound local support-bundle plan"
affects: [01-08, 01-09, 01-10, 01-13, 01-15]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "One call-scoped redaction context; exact secrets never enter a global cache"
    - "Ordered replacement: exact credentials, structural secrets, URL credentials, path aliases"
    - "Plan digests bind source hashes to destination intent"

key-files:
  created:
    - src/core/redaction.ts
    - src/core/support-bundle.ts
  modified:
    - src/core/paths.ts
    - src/types.ts
    - test/redaction.test.ts

key-decisions:
  - "Path aliasing applies only to path-shaped values; substring replacement inside prose or a URL mangles it"
  - "createRedactedExcerpt uses the core redactor directly so the excerpt budget is not masked by the generic string cap"
  - "The CLI output seam stays a named todo rather than being wired here, because src/cli.ts is outside this plan's files_modified"

patterns-established:
  - "Snapshot content is opaque: metadata only, never a preview"
  - "Every bound (depth, items, string, total bytes) emits a stable marker instead of silently dropping data"

requirements-completed: [SAFE-04]

coverage:
  - id: D1
    description: "A secret-bearing nested Error reaches a support preview as typed placeholders with no raw value"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a secret-bearing nested Error reaches a support preview as typed placeholders"
        status: pass
    human_judgment: false
  - id: D2
    description: "Recursive redaction is bounded on cycles, depth, item count and string length"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/redaction.test.ts#recursive redaction is bounded on cycles, depth, item count and string length"
        status: pass
    human_judgment: false
  - id: D3
    description: "Private path aliases are segment-aware across roots, separators and case"
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: "test/redaction.test.ts#path aliases are segment-aware across roots, separators and case"
        status: pass
      - kind: unit
        ref: "test/redaction.test.ts#aliasing applies to path values, not to arbitrary message substrings"
        status: pass
    human_judgment: false
  - id: D4
    description: "CLI human and JSON surfaces serialize through the central redactor"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#a removed secret leaves a visible typed placeholder, not a silent hole"
        status: unknown
    human_judgment: true
    rationale: "src/cli.ts is outside this plan's files_modified; the output seam is plan 01-15 and the test is marked todo until then."

duration: 55min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 03: Central redaction, path aliases and support-bundle planning

**A single ordered redactor that bounds arbitrary values before they are serialized, segment-aware aliases for private roots, and a support-bundle plan that hashes its sources without writing a byte or opening a connection.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-04
- **Tasks:** 2
- **Files created:** 2 · **modified:** 3

## Accomplishments

- `src/core/redaction.ts` applies one fixed order — exact credentials, structural secrets (PEM/JWT/API keys), URL userinfo and token parameters, then private path aliases — and walks arbitrary values with bounds on depth, item count, string length and total bytes. Cycles terminate on a stable marker; a secret-bearing key redacts its value whatever the value looks like.
- `src/core/paths.ts` replaces the string-prefix home check with segment-boundary comparison and most-specific-root ordering, so `<project>` wins over `~` and `/home/al-backup` is no longer aliased under `/home/al`.
- `src/core/support-bundle.ts` produces a deterministic plan whose digest binds every source hash to the destination intent, treats snapshot content as opaque metadata, and reports `network: "none"` explicitly.

## Task Commits

1. **Task 1: Redaction path from Error to support preview** — `bf088ee` (feat)
2. **Task 2: Segment-aware private path aliases** — `5fdc894` (feat)

## Verification

`npm run check && npm run build && node --test dist/test/redaction.test.js` → exit 0 (11 tests, 10 pass, 1 todo).
`node --test dist/test/paths.test.js` → exit 0. Pre-existing suites: 38/38.

## Decisions Made

- **Aliasing is restricted to path-shaped values.** Replacing the home path as a substring inside prose or a URL corrupts the surrounding text, so the alias stage runs only on values that parse as a path and did not already match as a URL.
- **The CLI output seam is left to plan 01-15.** `src/cli.ts` is not in this plan's `files_modified`, so `print()` still bypasses `serializeObservable`. The Wave 0 assertion for that behavior is marked `todo` naming 01-15 rather than deleted or weakened.

## Issues Encountered

Two defects in the first implementation, both found by the new tests and fixed in the same commit:

1. **Embedded URLs were not redacted.** `new URL(value)` only parses a string that is *entirely* a URL, so `sync failed for https://user:pass@host/x?token=y` leaked both the userinfo and the token. Replaced with a scan that redacts every URL found inside a string.
2. **The excerpt cap was unreachable.** `createRedactedExcerpt` called `redactString`, which had already truncated to the 2 KB generic string bound, so a 24 KB stream reported `capped: false`. The excerpt now uses the core redactor and applies its own budget.

## Deviations from Plan

None — both tasks were executed as written.

## Next Phase Readiness

`01-08` (process adapter) and `01-09` (MutationSession) can consume `createRedactedExcerpt` and `serializeObservable`. `01-15` must wire `src/cli.ts` through `serializeObservable` to close the todo.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
