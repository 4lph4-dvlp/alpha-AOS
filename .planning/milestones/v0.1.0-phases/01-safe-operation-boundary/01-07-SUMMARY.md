---
phase: 01-safe-operation-boundary
plan: 07
subsystem: infra
tags: [symlink, junction, reparse, realpath, lstat, containment, node-test]

requires:
  - phase: 01-02
    provides: "Outside-sentinel escape and parent-swap fixtures that define the boundary contract"
provides:
  - "PathProof: dual configured/canonical containment with per-component identity"
  - "OperationPathProofSet: all seven path roles proven up front, immutable"
  - "recheckPathProof: ancestor identity drift detected immediately before mutation"
affects: [01-09, 01-11, 01-12, 01-13, 01-14]

actuals:
  tokens: 10000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Classify every component of the chain, not only the final path segment"
    - "An unclassifiable component refuses; support is never advertised unproven"
    - "Proof sets are frozen so apply cannot discover and self-authorize a new path"

key-files:
  created:
    - src/core/path-boundary.ts
  modified:
    - test/path-boundary.test.ts

key-decisions:
  - "Node surfaces Windows junctions through the symlink API, so a readable link is a classified kind and an unreadable reparse point is refused"
  - "Segment-aware containment is duplicated locally rather than exported from paths.ts, which is outside this plan's files_modified"
  - "The transaction-level integration stays a named todo for plan 01-09 instead of being wired here"

patterns-established:
  - "Every refusal carries a typed code plus a detail string, never a bare throw"
  - "A proof that never succeeded can never pass a recheck"

requirements-completed: [SAFE-02]

coverage:
  - id: D1
    description: "A path whose canonical form escapes the allowed root is refused even though the configured path is inside it"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#a link that escapes the allowed root is refused and the outside sentinel is untouched"
        status: pass
    human_judgment: false
  - id: D2
    description: "All seven path roles are proven up front and a path discovered during apply cannot be proven late"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#a complete operation proof set proves every declared role"
        status: pass
      - kind: integration
        ref: "test/path-boundary.test.ts#an operation missing a required path role refuses before mutation"
        status: pass
      - kind: integration
        ref: "test/path-boundary.test.ts#a path discovered during apply is not in the proof set and cannot be proven late"
        status: pass
    human_judgment: false
  - id: D3
    description: "An ancestor retargeted or replaced after preflight fails the immediate recheck"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#a parent swapped between preflight and mutation is caught by an immediate recheck"
        status: pass
      - kind: integration
        ref: "test/path-boundary.test.ts#an ancestor replaced by a different directory fails the recheck"
        status: pass
    human_judgment: false
  - id: D4
    description: "An unclassified Windows reparse point yields a stable unsupported refusal"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#an unclassified reparse point yields a stable unsupported refusal"
        status: unknown
    human_judgment: true
    rationale: "Creating an unclassified reparse tag needs privileges this host does not have; the fixture reports not-run and a Windows canary must confirm the refusal."
  - id: D5
    description: "applyFileTransaction refuses a write whose canonical path escapes"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#a transaction refuses a write whose canonical path escapes"
        status: unknown
    human_judgment: true
    rationale: "src/core/transaction.ts is outside this plan's files_modified; routing it through the proof set is plan 01-09 and the test is marked todo until then."

duration: 55min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 07: Canonical PathProof and immediate recheck

**Containment proven twice — as configured and after canonical resolution — over every component of the chain, with all seven path roles declared up front and ancestor identity re-read immediately before mutation.**

## Performance

- **Duration:** ~55 min
- **Completed:** 2026-09-04
- **Tasks:** 2
- **Files created:** 1 · **modified:** 1

## Accomplishments

- `provePathBoundary` walks every ancestor with `lstat`, classifies links and reparse kinds, resolves the nearest existing ancestor with `realpath` and appends the not-yet-existing suffix, then requires containment against both the configured and the canonical root. A component Node cannot classify returns `unknown-reparse` rather than a guess.
- `proveOperationPaths` proves all seven roles — target, state, journal, snapshot, temp, source, package-root — and returns a frozen set. A missing role refuses the whole operation; `includes()` is false for any path first seen during apply.
- `recheckPathProof` re-reads each recorded component's kind, reparse class, canonical location and device/inode identity, so both a retargeted symlink and a same-named replacement directory fail before any byte moves.
- There is no override anywhere on the surface: an unproven boundary refuses, and `capability.supported` is false whenever nothing was proven.

## Task Commits

1. **Task 1 + Task 2** — `13cbc79` (feat). Both tasks touch the same two files and share one contract; they were verified separately but committed together.

## Verification

`npm run check && npm run build && node --test dist/test/path-boundary.test.js` → exit 0 (16 tests, 13 pass, 2 skipped, 1 todo). Pre-existing suites: 38/38.

Not-run evidence on this Windows host: file symlink creation and privileged reparse fixtures are unavailable and report as skipped.

## Decisions Made

- **A readable link is a classified kind; an unreadable reparse point is not.** Node surfaces Windows junctions through the symlink API, so `readlink` succeeding is the classification test. Anything that fails it — including sockets, FIFOs and unclassified reparse tags — refuses.
- **Segment-aware containment is implemented locally.** `src/core/paths.ts` has equivalent logic but is outside this plan's `files_modified`; exporting it is a change for a later plan rather than scope creep here.

## Deviations from Plan

The plan's two tasks were committed as one commit rather than two. Both modify the same pair of files and Task 2's proof set is not meaningful without Task 1's proof, so splitting the commit would have produced a non-building intermediate.

## Next Phase Readiness

`01-09` (MutationSession) can route `applyFileTransaction` through `proveOperationPaths` and call `recheckPathProof` before each rename or removal, which closes the remaining todo.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
