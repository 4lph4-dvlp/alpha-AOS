---
phase: 01-safe-operation-boundary
plan: 09
subsystem: infra
tags: [writer-lock, transaction, write-ahead-journal, fsync, repair, failpoint]

requires:
  - phase: 01-02
    provides: "Writer contention and durable failpoint contract"
  - phase: 01-05
    provides: "Strict document validation for lock and journal records"
  - phase: 01-07
    provides: "PathProof sets and immediate ancestor recheck"
provides:
  - "MutationSession: one exclusive, token-bound writer per state root"
  - "Durable write-ahead journal with per-file intent and proof binding"
  - "Read-only repair diagnosis plus a narrow, digest-bound explicit repair"
affects: [01-11, 01-12, 01-13, 01-14, 01-15]

actuals:
  tokens: 16000
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Exclusive create (open 'wx') is the atomic step that decides ownership"
    - "Snapshot and intent are durable before the target changes"
    - "A repair acts only on a transition proven by hashes, bound to a reviewed digest"

key-files:
  created:
    - src/core/writer-lock.ts
    - schemas/writer-lock.schema.json
    - schemas/transaction-journal.schema.json
  modified:
    - src/core/transaction.ts
    - src/core/path-boundary.ts
    - test/transaction.test.ts
    - test/transaction-crash.test.ts
    - test/path-boundary.test.ts

key-decisions:
  - "The session is optional on applyFileTransaction: an unmigrated caller still gets serialization by acquiring one for the call"
  - "A component recorded as missing may become a plain directory or file, but a link appearing there refuses"
  - "The ownership token is never returned to a reader, only to the session that created it"

patterns-established:
  - "needs-repair, never free: elapsed time and a dead pid are not proof that a write finished"
  - "Failpoints are named boundaries reachable by env var, so every durable step is testable"

requirements-completed: [SAFE-02, SAFE-03, SAFE-04]

coverage:
  - id: D1
    description: "A competing writer fails fast with operation metadata and never removes the lock; readers stay available"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#a second writer fails immediately instead of waiting or clearing the lock"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#a reader can inspect writer state while a writer holds the lock"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#an in-process transaction serializes against a held session"
        status: pass
    human_judgment: false
  - id: D2
    description: "An abandoned-looking lock is needs-repair and is never cleared by elapsed time or a missing pid"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#a writer lock is never removed on the basis of elapsed time or a missing pid"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every durable boundary leaves the target classifiable and the journal present"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#every durable boundary leaves the target diagnosable as before, after, or neither"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repair diagnosis is read-only with a stable digest; apply performs only a proven transition and drift blocks it"
    requirement: SAFE-03
    verification:
      - kind: integration
        ref: "test/transaction-crash.test.ts#repair diagnosis is read-only and its plan digest is stable"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#an explicit repair finalizes a fully proven interruption"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#an interruption before the target was touched restores to the before state"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#a neither-hash target blocks repair and keeps its drift"
        status: pass
      - kind: integration
        ref: "test/transaction-crash.test.ts#an interruption with no journal evidence refuses rather than guessing"
        status: pass
    human_judgment: false
  - id: D5
    description: "The transaction consumes a complete path proof and rechecks it before every mutation"
    requirement: SAFE-02
    verification:
      - kind: integration
        ref: "test/path-boundary.test.ts#a transaction refuses a write whose canonical path escapes"
        status: pass
      - kind: integration
        ref: "test/path-boundary.test.ts#a component the operation creates is allowed, but a link appearing there is not"
        status: pass
    human_judgment: false

duration: 90min
completed: 2026-09-04
status: complete
---

# Phase 01 Plan 09: MutationSession and durable transaction state

**One token-bound writer owns a state root; a competitor fails in under a second with the active operation's metadata; every durable boundary leaves hash-classifiable evidence; and recovery happens only through a digest-bound explicit repair.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-09-04
- **Tasks:** 3
- **Files created:** 3 · **modified:** 5

## Accomplishments

- **`acquireMutationSession` takes ownership with `open(lock, "wx", 0o600)`** — the exclusive-create flag is the atomic step that decides which of two racing writers owns the root. The record (operation id, random token, pid, host, start time, journal path, plan digest) is fsynced and the directory entry flushed before the session is usable.
- **A competitor never waits, signals, or unlinks.** It raises `WriterConflictError` with code `ACTIVE_WRITER` naming the active operation id, pid, start time and the retry/repair guidance. Measured refusal is well under the one-second bound.
- **`inspectWriterState` is read-only and never returns `free` for an abandoned lock.** A dead pid, an ancient timestamp, a lock from another host or a malformed record all yield `needs-repair`. The ownership token is stripped from anything a reader sees.
- **The journal is write-ahead and durable.** Snapshot bytes are fsynced before the target is touched; per-file intent carrying both hashes and the authorizing proof digest is fsynced before the mutation; step and final states are fsynced after. Directory entries are flushed where the filesystem supports it, and `directorySyncSupported` records the answer rather than assuming one.
- **The path proof is rechecked immediately before each mutation**, so an ancestor retargeted after preflight refuses before any byte moves. `applyFileTransaction` now proves all four required roles up front and refuses a target that is not in the proof set.
- **Five named failpoints** (`after-snapshot-sync`, `after-intent-journal-sync`, `after-target-rename`, `after-step-sync`, `after-final-sync`) are reachable through `ALPHA_AOS_FAILPOINT`, so each durable boundary is independently tested rather than assumed.
- **`planWriterRepair` is read-only** and classifies every recorded target as before/after/neither/missing, returning one permitted transition plus a digest binding the operation, journal and every observed hash. `applyWriterRepair` recomputes the plan and refuses if the digest moved. Drift, missing evidence and mixed states all return `transition: "none"` and leave the lock in place.

## Verification

`node --test dist/test/transaction-crash.test.js` → 10/10.
`node --test dist/test/transaction.test.js dist/test/path-boundary.test.js` → 20 tests, 18 pass, 2 skipped.

## Issues Encountered

**The first implementation broke six isolation tests.** Proving paths up front records a not-yet-created ancestor as `missing`; the transaction then creates it, and the strict "nothing may change" recheck read its own directory creation as ancestor substitution.

The fix distinguishes the two cases rather than relaxing the rule: a component recorded as `missing` may become a plain directory or file, because that is what the operation was authorized to create — but a **link** appearing at that spot still refuses, which is the substitution the boundary exists to stop. A second pass narrowed the containment check to components at or below the allowed root, since ancestors above it are not the operation's to create.

Both cases are now pinned by `test/path-boundary.test.ts#a component the operation creates is allowed, but a link appearing there is not`.

## Deviations from Plan

- **`src/core/path-boundary.ts` was modified although it is not in this plan's `files_modified`.** The recheck rule above cannot be expressed anywhere else, and leaving it would have made the proof set unusable for any operation that creates a directory.
- **The session is optional on `applyFileTransaction`.** The plan describes a caller-supplied session; six modules still call the transaction directly and are outside this plan's scope, so the transaction acquires a session for the call when none is supplied. Those callers get serialization today and can be migrated to an explicit session without another behaviour change.

## Next Phase Readiness

Wave 3 (`01-10`, `01-11`) is unblocked. The repair seam exists but has no CLI surface yet; wiring `repair`/`status` to `planWriterRepair` and `applyWriterRepair` belongs to `01-15`.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-04*
