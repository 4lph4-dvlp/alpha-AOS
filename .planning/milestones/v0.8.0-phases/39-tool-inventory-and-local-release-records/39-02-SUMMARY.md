---
phase: 39-tool-inventory-and-local-release-records
plan: "02"
subsystem: tool-inventory
tags: [tool-records, writer-lock, journal, durability]
requires: [39-01]
provides: [explicit tool record writer, durable operation history, acceptance protection]
affects: [39-03, 39-04, 39-05, 43]
tech-stack:
  added: []
  patterns: [immutable event records, reviewed path proofs, identity-bound acceptance]
key-files:
  created: [src/core/tool-record-store.ts, test/tool-record-store.test.ts]
  modified: [src/core/tool-records.ts, src/core/transaction.ts, src/format.ts]
key-decisions:
  - "Use operation-scoped deterministic event and journal names so resumed writes preserve earlier journals."
  - "A matching existing event is idempotent only when its applied journal also proves its commit."
  - "Disable environment failpoints for this writer and allow an explicit test hook."
requirements-completed: [LOC-04]
actuals:
  tokens: 11862
  tasks: 2
  commits: 4
  plan_head_before: 049c823575fd88b3e39205c9dd9f50d42334259c
  plan_head_after: ce0ecbfecb5277f00420f37c0c9946dc61bc11b8
duration: approximately 20 min
completed: 2026-11-06
status: complete
coverage:
  - deliverable: Explicit writer, external-root proofs and CLI round trip
    verification:
      - kind: test
        ref: test/tool-record-store.test.ts
        status: pass
    human_judgment: false
  - deliverable: Partial and interrupted history, accepted reference protection and terminal rename fault
    verification:
      - kind: test
        ref: test/tool-record-store.test.ts
        status: pass
    human_judgment: false
---

# Phase 39 Plan 02: Tool Record Writer Summary

**Explicit, path-proven tool operation events share the production inventory reader and preserve accepted references across partial results and an uncommitted terminal file.**

## Accomplishments

- Added reviewed operation plans, session reuse, on-disk lock ownership checks, immutable event writes, and durable journal checks on retries.
- Added partial and interrupted operation statuses, deterministic ordering, identity-bound acceptance, stale reference rejection, and directory-sync diagnostics in human and JSON inventory output.
- Bound each event to its own deterministic journal name so a resumed operation cannot overwrite earlier transaction evidence. Existing installer and update flows do not call the new API.

## Task Commits

1. `8bc82a0` — RED: writer availability assertion.
2. `e1cd589` — explicit writer and initial CLI and boundary tests.
3. `f6c8df1` — RED: interrupted status assertion.
4. `ce0ecbf` — durable history, retry and terminal-fault handling.

## Verification

- `npm run build` passed.
- `node scripts/run-tests.mjs --files dist/test/tool-record-store.test.js dist/test/tool-records.test.js dist/test/tool-inventory-cli.test.js dist/test/transaction.test.js` passed: 22 tests.
- Both RED evidence records passed `tdd-red-evidence`; the first demonstrated missing writer availability, and the second demonstrated the missing interrupted status. The first assertion checks availability rather than the full writer behavior; the later tests exercise the actual API and CLI.
- A bounded child process exited at `after-target-rename`, leaving the terminal event and applying journal. The reader reported an unverified terminal commit and retained the previous accepted digest. Started-only and started-plus-result cases were also observed as interrupted after the writer session ended.
- Windows junction alias rejection was exercised. Directory-sync limitation reporting was exercised by setting the journal capability to false in a fixture; a real unsupported filesystem and actual power loss were not tested. No macOS or Linux filesystem runs were performed.

## Deviations from Plan

- **[Rule 2 - Critical functionality] Transaction compatibility extension:** `src/core/transaction.ts` accepts an explicit null failpoint to suppress its existing environment failpoint for this writer, and records directory-sync failures encountered during the transaction. Existing callers retain their prior failpoint behavior. This was necessary for test-only writer fault injection and truthful durability reporting. Existing transaction tests passed.
- **[Rule 2 - Critical functionality] Human CLI diagnostics:** `src/format.ts` now displays record diagnostics so unsupported directory sync is visible outside JSON output.
- **[Rule 1 - Bug] Event and journal identity:** the first implementation reused event IDs between operations and session-generated journal names after a restart. Tests exposed the former; both names are now operation-scoped and immutable. Retrying an event without an applied journal is refused.

## Self-Check: PASSED

Created source, tests and evidence files exist. All four task commits are ancestors of the plan head; the targeted build and tests passed before this summary was written.
