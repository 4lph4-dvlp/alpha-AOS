---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-30T06:42:25Z
depth: focused-reconciliation
head: 04fab2043f9b09a08523b568ad18a6a9705c2ccd
basis_digest: 527588f409317006f90542697776d30393d033c54b5ecea96863b2519483cda5
files_reviewed: 3
files_reviewed_list:
  - src/core/task-runtime.ts
  - test/task-runtime-controls.test.ts
  - docs/task-runtime-controls.md
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Phase 25: Reconciliation Safety Delta

The explicit `closeConfirmed: false` reconciliation counterexample is repaired, including the callback-plus-throw variant. One related unknown-closure case remains in the resolved-result path. This report reopens only that original R2/CR-01 safety criterion; prior unrelated review dispositions are retained.

## Narrative Findings (AI reviewer)

### CR-01: BLOCKER — A resolved handle-only failure can still settle without positive closure evidence

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:239-253`

**Related:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:101,118-120,270-276,280-289`

**Issue:** The catch path now treats an observed native handle without confirmed closure as unresolved even when the child PID was never captured. The resolved-result path still defines `unresolved` solely as `confirmed === false`. With a native handle, no child PID, null exit code and no explicit closure field, `confirmed` becomes null. The record is classified failed/completed rather than interrupted and its lock is removed. `readTaskDispatches` only reclassifies explicit false closure; reconciliation only applies the new positive-proof requirement to interrupted records. It therefore cannot protect this already-settled record, and the next dispatch is permitted without positive closure evidence.

**Concrete counterexample, traced from current source (not executed by this reviewer):** Use a normal policy without a required token/USD meter. Inside `invoke`, call `onTelemetry` with an observed native session handle, omit `onSpawn`, then resolve with:

```ts
{
  sessionId: "fixture-unclosed-native-thread",
  processCode: "non-zero-exit",
  exitCode: null,
  terminal: "failed"
  // closeConfirmed is absent; no owned close observation exists.
}
```

At lines 246-248, closure resolves to null and unresolved is false. The outcome is `failed` with `closeConfirmed: null`; the finally block removes the fence. A subsequent read leaves that failed record settled, reconciliation has no interrupted record to reject, and another invocation can start. The same handle-only evidence followed by a throw is correctly fenced by the new catch predicate. Adapter layers that convert transport exceptions to ordinary result objects therefore have a weaker safety boundary than throwing ones.

**Fix:** Use the same effective launch-evidence/positive-closure predicate in both paths. If a PID, explicit false closure, native session or streamed native handle establishes a launch and closure is not positively confirmed, retain interrupted state and its fence. Keep pre-launch exceptions/results without launch evidence retryable. Reconciliation/read handling should not allow the settled form of this unknown-closure record to bypass the proof requirement. Add one resolved-result regression with native handle, absent PID, null exit code and omitted closure; require interrupted state, refused reconciliation and zero next invocations.

## Confirmed repair and preserved recovery

- `reconcileTaskRuntime` now requires existing `closeConfirmed === true` and a local host for interrupted records. It no longer writes positive closure or relies on PID absence. Explicit false/undefined proof cannot pass that branch.
- Catch handling now retains interruption for PID evidence, explicit false closure or a recorded native handle when closure is not positive. The two new missing-PID cases explicitly provide false closure and assert retained fence/refused reconciliation/zero next callbacks; they do not cover the omitted-field resolved-result case above.
- The positive recovery fixture observes a real Node child through `runProcess`, requires actual `closeConfirmed: true`, then simulates a crash after that evidence was saved. Reconciliation preserves that proof and permits remaining dispatch. The removed numeric child-PID liveness lookup no longer lets a recycled PID override already recorded owned-process closure.
- Usage recovery remains called before reconciled receipts are written and in the catch path. The repair does not remove telemetry/native family fields, reset observed usage, or create GSD acceptance. The positive fixture itself has no usage budget; the earlier native usage tests remain the relevant accounting evidence.
- Documentation now accurately states the explicit-unconfirmed fence/inspection limitation; the unresolved omitted-field path above must also be fixed before that guarantee applies uniformly.

## Validation boundary

No tests, polling, paid calls, source/test edits or commits were performed. Pending build handle `13968` was not accessed. The parent reports a pre-repair full pass and an earlier 29/29 targeted pass; those results do not validate the final current bytes or the remaining counterexample. This report makes no phase-closure or post-repair full-pass claim. Only this report was written.

## Exact reviewed bytes

HEAD was `04fab2043f9b09a08523b568ad18a6a9705c2ccd`. Basis digest is SHA-256 of `JSON.stringify(files)` for the ordered `{path, sha256}` array below; repairs are working-tree bytes.

| File | SHA-256 |
|---|---|
| `src/core/task-runtime.ts` | `b01d59e8e745496d3934d794fa922431a422fc962514e659d0bea9403aba0ebf` |
| `test/task-runtime-controls.test.ts` | `42444c5dd3f3c10533148a29df12a1300728995dea88c38738aba450a71c34a4` |
| `docs/task-runtime-controls.md` | `175ac04c4b1a371cac24f50fd383f2a41d053b21e5113aa43ca6dc0c9d36bc5e` |

_Independent review of the original R2 reconciliation safety criterion only._
