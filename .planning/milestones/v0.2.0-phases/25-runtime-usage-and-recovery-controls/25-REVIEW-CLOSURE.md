---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T06:57:00Z
depth: focused-closure
head: 04fab2043f9b09a08523b568ad18a6a9705c2ccd
basis_digest: 3072d2ea3c2c2f6fab1a1e2f0731cd958a5ca1be7d248fa988983e09c47f7607
files_reviewed: 3
files_reviewed_list:
  - src/core/task-runtime.ts
  - test/task-runtime-controls.test.ts
  - docs/task-runtime-controls.md
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 25: Focused Closure Review

The remaining handle-only CR-01 counterexample from `25-REVIEW-RECONCILIATION.md` is closed in the inspected source. No material defect was found in the requested native/protocol identity, resolved-result closure, catch, read or reconciliation delta. This is a focused review of the reopened R2 criterion, not a repeated full product review.

## Narrative Findings (AI reviewer)

No additional findings in this delta.

## Closure evidence

- **Native identity stays distinct:** The effective native handle now comes from an explicit native result, native telemetry or recorded native callback evidence. Generic `result.sessionId` is retained separately as `protocolSessionId`. A null returned native placeholder falls through to a known streamed/callback handle. Protocol-only fixture/session identity does not assert that a native process launched.
- **Resolved unknown closure stays fenced:** The resolved-result path recognizes an actual PID, native handle or observed process outcome as launch evidence. With null exit code and no positive closure callback/result, this produces `closeConfirmed: false`, `interrupted` status and a durable fence. Thus the previous observed-handle/no-PID/nonthrowing failure no longer becomes a settled failed record that permits another invocation. Known pre-launch refusals without native evidence remain distinct.
- **Catch and read preserve uncertainty:** The catch path retains interruption after a PID, explicit false closure or native handle was observed without positive closure. Reads keep explicit false closure interrupted. Both routes leave the fence in place; subsequent dispatch checks refuse running/interrupted observations.
- **Reconciliation does not invent proof:** Interrupted records must already have `closeConfirmed === true` and the same host to reconcile. Missing PIDs do not satisfy this condition, and reconciliation no longer assigns positive closure. A saved actual close observation can permit recovery even if a numeric child PID has since been recycled. Existing native usage recovery remains invoked before persisted reconciliation; no usage reset or GSD acceptance is introduced.
- **Counterexample coverage:** The new fixture loops over telemetry-handle, explicit-result-handle, callback-handle with a null returned placeholder, and process-only timeout cases. It requires interrupted state, false closure, correct native/protocol identities, retained 22-token partial streaming usage where supplied, refused reconciliation and zero subsequent calls. The explicit-false resolved/throwing cases and the actual Node child positive-close/bookkeeping-crash recovery fixture remain intact. Assertions were inspected, not executed by this reviewer.

The earlier positive callback and usage recovery reviews are retained rather than repeated. This source-level closure does not claim migration or manual force-unlock behavior for legacy records, stronger job-terminal overrides, provider hard caps or final GSD acceptance.

## Validation boundary

No tests, polling, source/test edits, commits or paid calls were performed. Parent-owned suite `36571` was not accessed. Parent-reported build success and earlier 29/29 and 30/30 results are context; they do not establish the pending final targeted or new full-regression outcome. The previously reported full pass was before these closure changes. Actual current-byte regression and GSD closure remain the parent's gates. Only this report was written.

## Exact reviewed bytes

HEAD was `04fab2043f9b09a08523b568ad18a6a9705c2ccd`; repairs are working-tree bytes. Basis digest is SHA-256 of `JSON.stringify(files)` for the ordered `{path, sha256}` array below. The documentation hash matches the prior reconciliation review.

| File | SHA-256 |
|---|---|
| `src/core/task-runtime.ts` | `2431fbe1442777c18e4bd793b4733487a5d63538313623217dd8e9afd9882628` |
| `test/task-runtime-controls.test.ts` | `aff22ba5dd92e87f01e8f99d6590d10ad151df6f6eaa173347846cad9a3c742e` |
| `docs/task-runtime-controls.md` | `175ac04c4b1a371cac24f50fd383f2a41d053b21e5113aa43ca6dc0c9d36bc5e` |

_Independent focused review of the remaining CR-01 closure repair._
