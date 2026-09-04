---
phase: 01-safe-operation-boundary
plan: 02
subsystem: testing
tags: [node-test, tdd, symlink, junction, reparse, writer-lock, failpoint, subprocess]

requires: []
provides:
  - "Canonical containment and parent-swap adversarial contract with an outside sentinel"
  - "Writer contention and five-stage durable failpoint contract"
  - "Shell-free, allowlisted, bounded, timeout-aware subprocess contract"
affects: [01-07, 01-08, 01-09, 01-11, 01-12, 01-13, 01-14, 01-16]

actuals:
  tokens: 10000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Host capability probes gate privileged fixtures and report skips instead of passes"
    - "Child driver scripts are written to OS temp, never into the repository"
    - "Named durable boundaries drive a failpoint matrix through ALPHA_AOS_FAILPOINT"

key-files:
  created:
    - test/path-boundary.test.ts
    - test/transaction-crash.test.ts
    - test/process.test.ts
  modified: []

key-decisions:
  - "Unsupported fixtures use context.skip so node:test reports them as skipped, satisfying the plan's rule that a not-run fixture is never counted as a pass"
  - "The failpoint contract is expressed as an environment-driven seam the implementation must honour, so an unimplemented boundary fails loudly rather than passing silently"
  - "The shell-trace assertion uses an argv-only child so a shell name in the result can only have come from the adapter"

patterns-established:
  - "Every path assertion re-checks an outside sentinel hash, so a boundary breach is observable even when the operation reports success"
  - "Process assertions use real child processes with sentinel side effects rather than mocking spawn"

requirements-completed: [SAFE-02, SAFE-03, SAFE-06]

coverage:
  - id: D1
    description: "Containment holds for the configured path and its canonical resolution across every managed root class, including a parent swapped after preflight"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#every managed root class enforces containment, not just the target root"
        status: pass
      - kind: integration
        ref: "test/path-boundary.test.ts#a link that escapes the allowed root is refused and the outside sentinel is untouched"
        status: fail
      - kind: integration
        ref: "test/path-boundary.test.ts#a parent swapped between preflight and mutation is caught by an immediate recheck"
        status: fail
    human_judgment: false
  - id: D2
    description: "Windows unknown-reparse refusal on a privileged host fixture"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#an unclassified reparse point yields a stable unsupported refusal"
        status: unknown
    human_judgment: true
    rationale: "Unclassified reparse tags need privileges or host facilities ordinary CI runners do not guarantee; the suite reports not-run and a Windows canary must confirm the refusal."
  - id: D3
    description: "A competing writer fails fast with diagnostics, and an abandoned-looking lock is never auto-cleared"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#a second writer fails immediately instead of waiting or clearing the lock"
        status: fail
      - kind: integration
        ref: "test/transaction-crash.test.ts#a writer lock is never removed on the basis of elapsed time or a missing pid"
        status: fail
    human_judgment: false
  - id: D4
    description: "Every durable boundary leaves hash-diagnosable journal evidence"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#every durable boundary leaves the target diagnosable as before, after, or neither"
        status: fail
    human_judgment: false
  - id: D5
    description: "External commands run shell-free with an allowlisted environment, bounded output and enforced timeouts"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/process.test.ts#shell metacharacters in an argument stay data and never execute"
        status: pass
      - kind: integration
        ref: "test/process.test.ts#unbounded child output is capped and reported as capped"
        status: fail
      - kind: integration
        ref: "test/process.test.ts#environment names that collide only by case are rejected deterministically"
        status: fail
    human_judgment: false

duration: 95min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 02: Wave 0 path, writer/crash and process contracts

**Three adversarial suites that pin SAFE-02, SAFE-03 and SAFE-06 to real filesystem, child-process and contention behavior — 24 tests, of which 13 pass, 9 are red against behavior later waves must build, and 2 report as skipped where this host cannot prove the fixture.**

## Performance

- **Duration:** ~95 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 3

## Accomplishments

- `test/path-boundary.test.ts` builds inside and escaping link fixtures, checks containment for the configured path *and* its canonical resolution across all seven managed root classes, drives a deterministic parent-swap failpoint, and asserts the apply surface exposes no override for an unproven boundary. Every case re-checks the outside sentinel hash.
- `test/transaction-crash.test.ts` runs a competing writer against a held state root, plants an abandoned-looking lock with a dead pid and an ancient timestamp, and names the five durable boundaries a managed write crosses, driving each through `ALPHA_AOS_FAILPOINT`.
- `test/process.test.ts` exercises seven argv injection payloads against a sentinel side-effect file, an environment allowlist, Windows case-colliding names, output flooding, timeouts, descendant processes, npm/npx shim normalization and arbitrary batch input.

## Task Commits

1. **Task 1: Outside-sentinel path escape tracer** — `20b47ad` (test)
2. **Task 2: Writer contention and interruption failpoint matrix** — `408d480` (test)
3. **Task 3: Shell-free bounded process contract** — `11f6273` (test)

## Files Created/Modified

- `test/path-boundary.test.ts` — canonical containment and reparse suite
- `test/transaction-crash.test.ts` — contention, crash and repair suite
- `test/process.test.ts` — shell, environment, cap and timeout suite

## Verification

`npm run check` succeeds and all three sources compile — the plan's `<automated>` gate for every task.

| Suite | tests | pass | fail | skipped |
|-------|-------|------|------|---------|
| path-boundary | 8 | 4 | 2 | 2 |
| transaction-crash | 5 | 2 | 3 | 0 |
| process | 11 | 7 | 4 | 0 |

Not-run evidence on this Windows host: file symlink creation and privileged reparse fixtures are unavailable, so both are reported as skipped rather than passed.

## Decisions Made

- **`context.skip` replaces an early return for unavailable fixtures.** An early return made an unsupported fixture indistinguishable from a passing one, which the plan explicitly forbids. node:test now reports these in a separate skipped count.
- **The failpoint seam is environment-driven.** `ALPHA_AOS_FAILPOINT` names each durable boundary; a boundary that ignores it fails the assertion, so an unimplemented stage cannot pass by running to completion.
- **The shell-trace assertion uses an argv-only child.** The first draft used a child that echoed its whole environment, so `ComSpec` appeared in the captured result for reasons unrelated to the adapter's execution path.

## Notable Findings

Three concrete gaps confirmed against current `main`:

- `src/core/transaction.ts` checks containment lexically via `path.relative`, so a link whose canonical target is outside the allowed root is accepted.
- There is no writer lock, no fsync ordering and no repair path, so contention and interruption are both undiagnosable today.
- `src/core/process.ts` routes `.cmd` through `cmd.exe` (with `windowsVerbatimArguments`) and `.ps1` through `powershell.exe`, applies no output cap, and returns raw stdout including any secret the child prints.

## Deviations from Plan

None — the plan was executed as written. The two adjustments above are refinements within the stated task actions, made after observing the first run.

## Next Phase Readiness

Wave 1 (`01-03`, `01-04`, `01-07`) can proceed. `01-07` (canonical PathProof), `01-08` (process adapter) and `01-09` (MutationSession) each have their acceptance contract already expressed as failing assertions.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
