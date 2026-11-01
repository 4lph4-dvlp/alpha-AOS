---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T05:23:53Z
depth: focused-delta
head: 2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a
basis_digest: 1ede8c39cca5c2a069d396ac427c7d75b279ea2dbf0affc3df7df8b64f5d8eae
files_reviewed: 3
files_reviewed_list:
  - src/core/task-runtime.ts
  - test/task-runtime-controls.test.ts
  - src/core/command-jobs.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 25: Final Focused Review

The remaining CR-02 source defect is closed. No material defect was found in the requested final delta: effective native/process outcome normalization and the command-job start/cancel deadline-edge reads. This is a focused source review, not a fresh full review or a regression pass.

## Narrative Findings (AI reviewer)

No additional findings in the reviewed delta.

## Closure evidence

**CR-02 — resolved in the reviewed source.** `src/core/task-runtime.ts:242-256` now resolves effective `processCode`, `exitCode` and `terminal` from the returned value with fallback to the persisted `onProcess` evidence. The same effective values drive `processFailed`, the saved receipt and its reason. For the original normal-reviewer counterexample—callback terminal `failed`, process `ok`, exit 0, confirmed closure, and no returned terminal—the effective terminal remains `failed`, giving saved status `failed` and reason `native_failed`. The added `callback-only native reviewer failure survives a successful process return` fixture asserts those exact receipt fields. Its assertions were inspected, not executed by this reviewer.

**Start deadline edge — no material flaw found in the inspected change.** `src/core/command-jobs.ts:2043-2075` reuses the existing final read after the handshake loop. `readJobRecord` applies closed schema/domain validation, including claim completeness, positive revision, coherent timestamps and terminal facts. The new acceptance branch additionally requires acknowledged start/child evidence and matches immutable job identity plus the PID/host of the worker actually spawned by this start operation. Pending, orphaned, unreadable or unmatched records do not enter that branch. The five-second observer timeout remains unchanged; a returned `running` status is an observed running job, not fabricated completion.

**Cancel deadline edge — no material flaw found in the inspected change.** `src/core/command-jobs.ts:2225-2233` performs one additional validated read only after an observer timeout. It checks the caller's pinned identity and returns the record only when its existing status is terminal. Existing refused/unresolved outcomes still throw before this branch; a nonterminal final read still results in the original timeout refusal. No new polling, timeout extension or process killing was introduced by this delta.

The source-level dispositions of CR-01 and CR-03 through CR-07, and the WR-01 fixture construction, are retained from `25-REVIEW-DELTA.md`. Those unchanged areas were not re-reviewed. The original and delta reports remain intact as the review history.

## Validation boundary

No tests, paid native calls, source/test edits, commits, installation changes or original-project operations were performed. Parent-owned serial targeted session `39560` was not polled or duplicated. The parent reports a successful fresh build and a passing public-resume reduced integration; those reports do not establish the outcome of the current targeted suite or final full regression. Phase acceptance still requires the parent's actual remaining regression and GSD closure evidence. This clean review is not a claim that those gates passed.

## Exact reviewed bytes

HEAD was verified as `2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a`. The fixes are working-tree bytes. Basis digest is SHA-256 of `JSON.stringify(files)`, with the following ordered array of `{path, sha256}` objects:

| File | SHA-256 |
|---|---|
| `src/core/task-runtime.ts` | `8bded91e2e9191e5c2eb1b746ada803241003d988f036f797b1753250538db2a` |
| `test/task-runtime-controls.test.ts` | `62ccb18ef5c91f8f2184552d1e64e91540e3b063f3e958141c6ed063feb6a0b3` |
| `src/core/command-jobs.ts` | `6af428bbec81a8fcc4ea8f603571560dd5c17f805327aa437ececb959cea3c82` |

_Independent final focused review; only this report was written._
