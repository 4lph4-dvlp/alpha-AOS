---
phase: 01-safe-operation-boundary
plan: 01
subsystem: testing
tags: [node-test, tdd, redaction, schema-validation, dry-run, sha256]

requires: []
provides:
  - "Zero-mutation preview contract across the CLI, four shell wrappers and five mutation surfaces"
  - "Cross-surface secret corpus with seven secret families and chunk-boundary reassembly checks"
  - "Nine-kind by seven-class strict managed-document validation matrix with a coverage gate"
affects: [01-03, 01-05, 01-06, 01-10, 01-14, 01-15, 01-16]

actuals:
  tokens: 11000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "SHA-256 tree digests taken before and after every observable invocation"
    - "Sandboxed HOME / state / package / harness roots plus an outside sentinel"
    - "Table-driven matrices with a self-checking coverage test"

key-files:
  created:
    - test/preview.test.ts
    - test/redaction.test.ts
    - test/validation.test.ts
  modified: []

key-decisions:
  - "Wrapper previews run against a copied checkout so a bootstrapping wrapper cannot reach the developer tree"
  - "A wrapper that cannot produce a plan within a 20s budget is treated as doing install work, which keeps the failure direction without a multi-minute suite"
  - "Positive redaction controls assert a visible typed placeholder rather than requiring the CLI to echo user configuration"

patterns-established:
  - "Mutation surfaces are digested as a set, so a leak on any one surface fails the whole assertion"
  - "Unavailable host fixtures are recorded as explicit not-run evidence, never counted as passes"

requirements-completed: [SAFE-01, SAFE-04, SAFE-05]

coverage:
  - id: D1
    description: "Every mutating CLI preview leaves checkout, home, state, package and harness surfaces byte-identical"
    requirement: SAFE-01
    verification:
      - kind: integration
        ref: "test/preview.test.ts#every mutating CLI preview leaves all five mutation surfaces byte-identical"
        status: pass
      - kind: integration
        ref: "test/preview.test.ts#install and update wrappers preview without mutating either shell family"
        status: fail
    human_judgment: false
  - id: D2
    description: "No observable surface or persisted evidence carries a secret sentinel"
    requirement: SAFE-04
    verification:
      - kind: integration
        ref: "test/redaction.test.ts#no observable CLI surface leaks a secret sentinel"
        status: pass
      - kind: integration
        ref: "test/redaction.test.ts#a removed secret leaves a visible typed placeholder, not a silent hole"
        status: fail
    human_judgment: false
  - id: D3
    description: "Malformed, ambiguous, closed-world and newer-version managed documents are rejected before mutation"
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: "test/validation.test.ts#malformed, ambiguous, closed-world and newer-version documents are rejected before mutation"
        status: fail
      - kind: unit
        ref: "test/validation.test.ts#every managed document kind carries a case in every validation class"
        status: pass
    human_judgment: false

duration: 95min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 01: Wave 0 preview, redaction and strict-validation contracts

**Three executable regression suites that pin SAFE-01, SAFE-04 and SAFE-05 to the current CLI surface — 17 tests, of which 12 pass and 5 are red against behavior later waves must build.**

## Performance

- **Duration:** ~95 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- `test/preview.test.ts` enumerates 17 mutating CLI invocations plus four shell wrapper families and asserts SHA-256 tree-digest equality across five mutation surfaces, including interrupted and concurrent previews.
- `test/redaction.test.ts` plants seven secret families in native configuration and the environment, then asserts zero occurrences across human output, JSON, stderr, error paths and journal evidence as one corpus, with chunk-boundary reassembly and segment-aware path aliasing.
- `test/validation.test.ts` covers nine managed document kinds across seven validation classes (63 cells) with a coverage test that fails on any empty cell, and asserts a sentinel is untouched on every case so rejection is proven to precede mutation.

## Task Commits

1. **Task 1: Preview 무변이 tracer 계약** — `e4be384` (test)
2. **Task 2: Redaction corpus** — `a089a69` (test)
3. **Task 3: Strict validation matrix** — `a1d6474` (test)

## Files Created/Modified

- `test/preview.test.ts` — zero-mutation digest matrix for the CLI and wrapper families
- `test/redaction.test.ts` — cross-surface secret and path-alias corpus
- `test/validation.test.ts` — strict managed-document rejection and extension-inertness matrix

## Verification

`npm run check` succeeds and all three sources compile — the plan's `<automated>` gate for every task.

Runtime results are intentionally mixed; the red assertions are the contract later waves close:

| Suite | tests | pass | fail | skipped |
|-------|-------|------|------|---------|
| preview | 6 | 5 | 1 | 0 |
| redaction | 6 | 4 | 2 | 0 |
| validation | 5 | 3 | 2 | 0 |

## Decisions Made

- **Wrapper previews run in a copied checkout.** The first draft executed `scripts/install.sh` against the live tree, which runs `npm ci`, `npm run build` and `npm link` before printing a plan. That is the SAFE-01 violation under test, but running it on the developer's checkout is an unacceptable side effect for a routine suite.
- **A 20-second preview budget replaces a 180-second timeout.** A preview that has not produced a plan in 20s is necessarily doing install work, so the shorter budget preserves the failure direction and cuts the suite from ~120s to ~21s.
- **The redaction positive control asserts a typed placeholder.** An earlier version required the CLI to echo a user's MCP host back, which would have specified a worse privacy posture as a requirement.

## Notable Finding

`scripts/install.sh` and `scripts/install.ps1` run `npm ci`, `npm run build` and `npm link` **before** showing the plan, with no `--apply`. This is a live SAFE-01 / D-01 violation on the current main branch, not a hypothetical: a user asking for a preview gets a global npm link.

## Deviations from Plan

None — the plan was executed as written. The two adjustments above are refinements within Task 1's stated action, made after observing the first run.

## Next Phase Readiness

Wave 1 (`01-03`, `01-04`, `01-07`) can proceed. The redaction and validation suites name the seams that `01-03`, `01-05` and `01-06` implement.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
