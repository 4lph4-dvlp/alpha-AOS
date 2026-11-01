---
phase: 15-durable-supervisor-and-effect-ledger
plan: 01
subsystem: autonomous-work
tags: [task-journal, checkpoint, fsync, redaction, output-cap, node-test]

requires:
  - phase: 14
    provides: "task-contract and task-run schemas, approval and receipt boundaries"
provides:
  - "Append-only run journal (`journal.jsonl`) under `stateRoot/runs/<contractDigest>/` with fsync"
  - "Atomic checkpoint storage (`checkpoint.json`) under `stateRoot/runs/<contractDigest>/`"
  - "Secret masking and 64KB capped excerpts with SHA-256 for process stdout and stderr in journal payloads"
  - "Complete separation between alpha-AOS attempt state and GSD project lifecycle state"
affects: [15-03, 15-05, 15-06]

actuals:
  tokens: 38000
  tasks: 2
  commits: 1
plan_head_before: 8ddc1c9b29cb190547743d573f0c3bf2ce079e0a

tech-stack:
  added: []
  patterns:
    - "Append-only fsync journal with monotonic sequence numbers and ISO timestamps"
    - "Atomic temporary-file write, fsync, rename, and directory sync for checkpoints"
    - "Recursive payload redaction with 64KB process output capping and SHA-256 preservation"

key-files:
  created:
    - src/core/task-journal.ts
    - test/task-journal.test.ts
  modified:
    - src/core/redaction.ts

key-decisions:
  - "Journal events and checkpoints reside strictly under stateRoot/runs/<contractDigest>/, isolating execution state from .planning/ and project Git"
  - "Payload stdout and stderr strings are converted to RedactedExcerpt with a 64KB cap and full-stream SHA-256 hash"
  - "Checkpoint writes use atomic temp-file fsync and rename, followed by directory sync"

patterns-established:
  - "runDirectory, runJournalPath, and runCheckpointPath normalize forward slashes across platforms"
  - "appendJournalEvent ensures handle.sync() is executed before resolving"

requirements-completed: [RUN-02]

duration: 15min
completed: 2026-10-01
status: complete
---

# Phase 15 Plan 01: Append-Only Run Journal and Atomic Checkpoint Storage Summary

**Implemented the append-only run journal (`journal.jsonl`) and atomic checkpoint storage (`checkpoint.json`) under `stateRoot/runs/<contractDigest>/` with immediate fsync flushing, secret redaction, and 64KB process output caps.**

## Accomplishments
- `src/core/task-journal.ts`:
  - `runDirectory`, `runJournalPath`, and `runCheckpointPath` for normalized path resolution under `stateRoot/runs/<contractDigest>/`.
  - `appendJournalEvent`: assigns monotonic sequence numbers, redacts sensitive secrets in payloads, enforces 64KB bounds on stdout/stderr, and executes `handle.sync()` for durable writes.
  - `readJournalEvents`: parses line-delimited JSON and fails fast with descriptive errors on torn/corrupt records.
  - `writeCheckpoint`: atomically writes `checkpoint.json` via temp file, `handle.sync()`, atomic `rename`, and `syncDirectory`.
  - `readCheckpoint`: strictly validates schema version and structure, returning `null` when absent.
- `src/core/redaction.ts`:
  - Exported `redactCore` and re-exported `RedactionContext`, `RedactedExcerpt` to enable deep journal redaction.
- `test/task-journal.test.ts`:
  - 10 automated tests verifying paths, monotonic sequence numbers, secret masking, 64KB process output caps, corrupt line detection, atomic checkpoint write/read roundtrip, schema version validation, and state root boundaries.

## Verification
- `npm run check`: exit 0 (0 TS errors).
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-journal.test.js`: 10 passed, 0 failed.

## Self-Check: PASSED
