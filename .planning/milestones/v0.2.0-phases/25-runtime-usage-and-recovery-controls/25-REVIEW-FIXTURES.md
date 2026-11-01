---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T05:47:37Z
depth: focused-fixture-integrity
head: 2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a
basis_digest: 0c58ee601e9185b306ae3a403329d779fcef01f5ea5ef8b2197ef8fb268588d6
files_reviewed: 6
files_reviewed_list:
  - src/core/command-job-worker.ts
  - test/helpers/command-job-runtime.ts
  - test/efficient-wait-cli.test.ts
  - test/command-job-worker.test.ts
  - test/task-gsd-lifecycle.test.ts
  - test/task-cli.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 25: Fixture Integrity Review

No material safety/completion criterion was removed by the requested fixture changes. This review is limited to those changes and the optional worker observation seam; it does not reopen the product review or claim test success.

## Narrative Findings (AI reviewer)

No findings in the inspected fixture delta.

## Evidence and limits

- **Owned cancellation:** `test/helpers/command-job-runtime.ts:74-92` rethrows every error except the explicit cancellation observer timeout. On that timeout it reconnects to the same job ID through the existing finite `finish` observer, then still requires `cancelled`, matching child/worker identity, delivered/confirmed cancellation, actual exit or signal, and reaped processes. Neither observer timeout nor a different terminal status satisfies those assertions.
- **CLI cancellation:** `test/efficient-wait-cli.test.ts:34-42` accepts a failed initial command only when it reports `CANCEL_OBSERVATION_TIMEOUT`, then performs one finite wait on the exact same ID and verifies that ID. Both callers still require actual `status: cancelled`; a wait timeout, refusal, ordinary completion, failure or orphan is insufficient.
- **Timing interpretation:** These fixtures now permit eventual cancellation after a transport/observer timeout. The cancellation call keeps its five-second observation bound, followed only when needed by a separate six-second helper wait or ten-second CLI wait. The total fixture observation window can therefore be longer than one five-second interval. This is not evidence that cancellation completes within five seconds, and a future latency guarantee would need a separate assertion. No production timeout was raised, and no timeout is relabeled as cancellation success.
- **Owned child closure:** `test/command-job-worker.test.ts:143-176` now observes the actual `runProcess` result via `onProcessOutcome`, requiring `closeConfirmed: true` plus a concrete exit code or signal. The callback is invoked only after the worker's owned process operation settles (`src/core/command-job-worker.ts:385`), rather than querying a reusable PID. Spawn evidence, non-success exit status, untouched foreign record bytes and no running/completed success claim remain required. A spawn failure without exit/signal or an unconfirmed cleanup cannot satisfy the new assertion.
- **Process independence:** `test/task-gsd-lifecycle.test.ts:87-89,144-147` binds PID to the native Node process time origin. This accommodates sequential Windows PID reuse while retaining four distinct process instances. All four invocation counts, exact phase/auto argv checks and hook receipts remain asserted. The unrelated verify fixture now emits and expects explicit passing verification frontmatter rather than a bare heading; its argv/artifact assertions remain intact.
- **CLI labels:** The two `task-cli` expectation updates track the clarified logical-cycle and unavailable-reported-cost labels. They retain the assertions that unavailable usage is not displayed as measured zero.

The optional `onProcessOutcome` callback is a test seam. With no seam supplied, the added optional call has no production effect. It does not supply or manufacture the process result it observes.

No tests, polling, paid native calls, source/test edits or commits were performed by this reviewer. Parent session `7476` was not accessed. The parent-provided cancellation timing log and earlier pass/fail counts were context only; this artifact does not independently verify them or infer a passing current run. Full regression and GSD final acceptance remain separate gates.

## Exact reviewed bytes

HEAD was `2cdc70d9edb09e48f8bdf9f85c976d2dbe58af7a`; these are working-tree hashes. Basis digest is SHA-256 of `JSON.stringify(files)` for the ordered `{path, sha256}` array represented below.

| File | SHA-256 |
|---|---|
| `src/core/command-job-worker.ts` | `849c34e93e4d6d75a3f550c348e5ec87903fd4875a3da539150bc1f3acc7f66f` |
| `test/helpers/command-job-runtime.ts` | `fb90641ab107d36fcfe578913b07fbe1a95fc1f31dae23be2a610281cdd3a100` |
| `test/efficient-wait-cli.test.ts` | `ffcbee6dd1818ee88d9fb398e13de5190a924102464fbfccaa6ee26b352357c4` |
| `test/command-job-worker.test.ts` | `b1016c67b9e2c544c2f45608fae0aaaa3f51e3e1e1d7fd461422135b2c93996d` |
| `test/task-gsd-lifecycle.test.ts` | `bff130ba1a5c342134476926128c2f57997b614e6bd9ebf940eb9f9efa9c183a` |
| `test/task-cli.test.ts` | `20b1b82e76d977797da78f8158f0b0036d6f20b8fc57305cfd50258446aad7b4` |

_Independent narrow fixture-integrity review; only this report was written._
