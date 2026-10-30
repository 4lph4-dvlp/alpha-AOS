---
phase: 25-runtime-usage-and-recovery-controls
reviewed: 2026-10-29T23:31:18Z
depth: standard
files_reviewed: 32
files_reviewed_list:
  - docs/task-runtime-controls.md
  - schemas/command-job-launch.schema.json
  - schemas/task-contract.schema.json
  - schemas/task-receipt.schema.json
  - src/adapters/task-agent-launch.ts
  - src/adapters/task-agents.ts
  - src/adapters/task-codex.ts
  - src/cli.ts
  - src/core/command-job-worker.ts
  - src/core/command-jobs.ts
  - src/core/process.ts
  - src/core/task-contract.ts
  - src/core/task-final-review.ts
  - src/core/task-gsd-discovery.ts
  - src/core/task-gsd-gates.ts
  - src/core/task-gsd-lifecycle.ts
  - src/core/task-journal.ts
  - src/core/task-native-job.ts
  - src/core/task-native-sessions.ts
  - src/core/task-native-usage.ts
  - src/core/task-read.ts
  - src/core/task-review-basis.ts
  - src/core/task-run.ts
  - src/core/task-runtime.ts
  - src/core/task-supervisor.ts
  - src/core/task-telemetry.ts
  - test/task-final-review.test.ts
  - test/task-gsd-discovery.test.ts
  - test/task-gsd-multi-phase.test.ts
  - test/task-limits.test.ts
  - test/task-native-job.test.ts
  - test/task-runtime-controls.test.ts
findings:
  critical: 7
  warning: 1
  info: 0
  total: 8
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-10-29T23:31:18Z
**Depth:** standard, with targeted cross-file tracing
**Files Reviewed:** 32
**Status:** issues_found

## Summary

Reviewed the explicit working-tree scope against base `952a179`. All 32 file hashes still matched scope digest `ec758d8fec8f8301235eeda2660d22cdea27b7fe2ade8509f7028b87ec788337` at the final scope check. Review focuses on R1–R8 and the newly connected final acceptance path. Seven correctness blockers and one essential integration coverage gap remain.

Credential-free, temporary-fixture probes independently reproduced unsupported-meter dispatch, relaunch after unconfirmed closure, missing local usage recovery, project writes during final review, mismatched native/report session identity, and acceptance with an omitted mandatory requirement. No paid model was called, no source/test/state file was edited, and no full suite was run or polled. Full regression session `64309` belongs to the parent; this report makes no claim about its outcome. Prior subset pass counts are context supplied by the parent, not acceptance evidence produced by this review.

The original incident used dedicated jobs and a project PowerShell runner. Generic-path defects below are independently identified product defects, not assertions that the generic supervisor caused that incident. Arbitrary legacy shell wrappers remain outside the registered bridge; no provider hard cap or notification callback is assumed.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Unconfirmed child closure does not prevent another dispatch

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:193-216`
**Related:** `D:/dev/alpha-AOS/src/core/task-native-job.ts:103-112`; `D:/dev/alpha-AOS/src/core/process.ts:530-548`
**Issue:** `runProcess` explicitly returns `closeConfirmed: false` when its cleanup deadline expires. The registered bridge nests that result, but the runtime never inspects or persists closure evidence. It marks the observation settled and removes the dispatch lock. The next dispatch only rejects `running`/`interrupted` observations; neither it nor reconciliation checks live children of settled records. The exception path similarly writes `failed` and releases the lock without establishing closure. This permits duplicate execution while an earlier owned process may still run, violating R2.
**Counterexample:** A temporary fixture supplied an observed live PID and returned `{code: "timeout", closeConfirmed: false}` with known usage below the cap. Its saved status was `completed`, reason `null`; a second invocation ran, producing `launches: 2`. The PID was a controlled seam value, not authority to kill any process.
**Fix:** Carry explicit process/closure evidence through adapter results. Persist `interrupted` or an equivalent unresolved state whenever closure is unconfirmed, including throws after spawn. Preserve a durable fence until explicit reconciliation verifies the owned handle and descendant status. Add a regression that asserts zero second spawns after unconfirmed timeout/cancel and after an exception with an unresolved child.

### CR-02: BLOCKER — Native failures are persisted as successful runtime completions

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:192-196`
**Related:** `D:/dev/alpha-AOS/src/core/task-native-job.ts:109-112`; `D:/dev/alpha-AOS/src/core/task-read.ts:403-418`
**Issue:** A resolved invocation is classified `completed` unless free-form detail matches quota text. The result contract carries no mandatory process or native terminal outcome. Consequently spawn failure, argv rejection, ordinary `turn.failed`, nonzero exit, timeout, and cancellation can all become completed runtime observations. The job worker can independently mark its job failed, but `readTaskDispatches` reconciles a job only while the runtime observation is `running`, leaving a permanent contradiction. An ordinary native failure emitted on stdout with process exit 0 also receives no failing task stop code because the bridge only special-cases quota.
**Counterexample:** The CR-01 probe returned a non-quota timeout; its runtime record was `{status: "completed", reason: null}`. A native CLI argv rejection before `thread.started` follows the same branch and need not imply any measured model call.
**Fix:** Normalize native terminal status, process code, exit code and launch/closure evidence before recording the outcome. Preserve distinct launch failure, native failure, quota and interruption reasons. Reconcile terminal job evidence even when a contradictory runtime completion was previously written. Add spawn/argv rejection and ordinary `turn.failed` regressions; keep logical dispatch cycles separate from observed model calls.

### CR-03: BLOCKER — The shared guard allows the first final review with an unavailable required meter

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:161-168`
**Related:** `D:/dev/alpha-AOS/src/core/task-final-review.ts:414-426`; `D:/dev/alpha-AOS/src/cli.ts:2531-2562`
**Issue:** With no prior observations, `dispatchUsage([])` reports numeric zero for cost and tokens. `meteredTaskDispatch` evaluates those values without checking harness meter capabilities. Ordinary start and registered dispatch call `assertTaskStartable`, but `task final-review --apply` uses readiness inspection that does not perform the telemetry capability check. A Codex final reviewer can therefore be launched under `maxCostUsd`, although Codex has no USD meter. The first unsupported paid call has already happened before the next boundary sees null usage. This violates R4 and the documented pre-dispatch guarantee.
**Counterexample:** Directly invoking the same shared guard used by final review, with Codex policy, `maxCostUsd: 1` and an empty ledger, executed the supplied callback once: `invokes: 1`.
**Fix:** Enforce `checkCostMeterReadiness(agentPolicy, resourcePolicy)` inside the common dispatch boundary before invocation, and surface the same reason in final-review readiness. Keep a verified empty supported ledger distinguishable from an unsupported meter. Regression: fresh final review with Codex plus USD limit must invoke the reviewer zero times.

### CR-04: BLOCKER — Final native review writes into the live product after its artifact was hashed

**File:** `D:/dev/alpha-AOS/src/core/task-final-review.ts:420-424`
**Related:** `D:/dev/alpha-AOS/src/adapters/task-agents.ts:285-300`; `D:/dev/alpha-AOS/src/adapters/task-codex.ts:806-812`
**Issue:** The final gate omits `reviewRoot`. The native port defaults it to `contract.scope.projectRoot`; Codex then creates `.alpha-aos-review/final-review.schema.json` there and directs its last-message output into that directory. The read-only native sandbox does not prevent the parent adapter's own writes. These operations occur after `workingTreeDigest` was supplied, and the final gate neither snapshots the reviewed artifact nor checks subsequent mutation. It can issue an accepted witness for an artifact that has changed during its own review. The new generic final-review wiring reaches this existing unsafe adapter behavior.
**Counterexample:** A fake native runner with a valid report created `projectRoot/.alpha-aos-review/final-review.schema.json`; the probe confirmed `sourceSchemaCreated: true`. No paid process was involved.
**Fix:** Reuse the existing isolated review snapshot mechanism, allocate schema/message files outside the source project, pass an explicit snapshot root to the final port, and verify tree/HEAD integrity before accepting. Preserve the original artifact digest in the witness. Regression: final native review leaves the complete source tree unchanged, including on failure.

### CR-05: BLOCKER — Crash and exception recovery never imports available local session usage

**File:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:197-212`
**Related:** `D:/dev/alpha-AOS/src/core/task-runtime.ts:59-104`
**Issue:** Local cumulative family collection runs only after `invoke` resolves. On an adapter exception, the runtime persists the last streaming telemetry and stops; dead-parent inspection/reconciliation also never loads local session logs. Codex can have recorded local `token_count` usage before a quota/crash without emitting a final CLI usage summary. The native handle can be recovered from streamed `thread.started`, yet its known local usage is omitted from aggregate accounting and child-family correlation. R1/R3 specifically require this recovery case.
**Counterexample:** A fixture emitted only a known native session handle, supplied a local cumulative log with 50 input plus 5 output tokens, then threw before final usage. `collectCodexSessionFamily` independently read 55 tokens, but the saved runtime aggregate remained `tokens: null, knownTokens: 0`.
**Fix:** Recover the native session handle and import monotonic local family observations on exception and orphan reconciliation, retaining already observed usage even if discovery fails. Keep unknown coverage explicit and block dispatch until unresolved coverage is reconciled. Add quota-before-final-event and dead-parent local-log regressions, including a child session and replay.

### CR-06: BLOCKER — Final-review accounting uses a generated report ID instead of the native thread ID

**File:** `D:/dev/alpha-AOS/src/core/task-final-review.ts:424`
**Related:** `D:/dev/alpha-AOS/src/adapters/task-agents.ts:285`; `D:/dev/alpha-AOS/src/adapters/task-codex.ts:849-875`; `D:/dev/alpha-AOS/src/core/task-runtime.ts:197-204`
**Issue:** Native final review validates and returns the generated request/report `sessionId`. The Codex usage collector independently discovers the real `thread.started.thread_id`, but that identity is not returned to the metered wrapper. The wrapper passes `report.sessionId` into `collectCodexSessionFamily`, which searches for the wrong UUID. It marks coverage unknown and forces aggregate tokens to null even when streaming usage was measured and the real local family exists. This loses final-review child accounting and can prevent a legitimate budgeted repair/review from resuming.
**Counterexample:** A fake successful native run emitted thread `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`, while the adapter returned report session `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`. These values were observed separately by the credential-free probe.
**Fix:** Keep independent report/request identity separate from native transport/session identity. Return the native handle as explicit dispatch metadata and use it for ancestry, recovery and cumulative deduplication without weakening report binding. Regression: successful native final review resolves the real family, includes child usage once, and does not turn measured totals unknown solely because the report uses a generated ID.

### CR-07: BLOCKER — Final acceptance does not require a report row for every mandatory requirement

**File:** `D:/dev/alpha-AOS/src/core/task-final-review.ts:532-543`
**Related:** `D:/dev/alpha-AOS/src/core/task-final-review.ts:404`; `D:/dev/alpha-AOS/src/core/task-gsd-lifecycle.ts:889-899`
**Issue:** The gate discovers the mandatory requirement list, but checks only whether rows supplied in the report are verified. It never compares returned requirement IDs with the requested set. A schema-valid report omitting a mandatory requirement can be accepted, persisted as a witness, and then reused for that unchanged basis. This is a pre-existing acceptance defect now reached by the newly connected final native path; it directly prevents R8's final gate from proving all original requirements.
**Counterexample:** A fixture declared REQ-01 and REQ-02. The final port received two requirements but returned only one verified REQ-01 row, with passing cross-phase fields. `gateMilestoneFinalReview` returned `accepted`.
**Fix:** Validate exact requirement coverage before acceptance: reject missing, duplicate and unknown IDs, and require each requested requirement to be verified. Ensure invalid old witness evidence cannot bypass this stronger validation through reuse. Add a schema-valid omitted-row regression that must produce no accepted witness.

## Warnings

### WR-01: WARNING — R8 fixture bypasses the generic resume entry that the change claims to support

**File:** `D:/dev/alpha-AOS/test/task-gsd-multi-phase.test.ts:225-237`
**Related:** `D:/dev/alpha-AOS/src/core/task-run.ts:1482-1494`; `D:/dev/alpha-AOS/src/core/task-supervisor.ts:329-440`
**Issue:** The new partial-commit/dirty-WIP fixture calls `orchestrateMultiPhaseProgression` directly with a `node` command map. It exercises lifecycle skipping, verification/Nyquist and the injected final port, but bypasses contract approval, checkpoint-bound dirty-baseline recovery, `resumeTask` reconciliation, controller lease acquisition, real role dispatch construction and the outer task acceptance/effect audit. Its mock contract even names `gsd-quick`. It therefore cannot establish the generic `task resume` integration required by R8. This is a coverage gap, not a claim that the lower-level fixture failed or proof that dirty-WIP resume is broken.
**Fix:** Add one bounded credential-free integration fixture entering through `resumeTask`/the public task entry with a real approved multi-phase contract and checkpoint. Preserve the original dirty WIP and incomplete summary; use narrow injectable native seams to reach remaining execution, verification, Nyquist and final acceptance. Assert approval/model/effort and runtime-budget enforcement remain active. Do not duplicate the full project suite or restart the original project.

---

_Reviewer: independent gsd-code-reviewer; no source modifications or commit._
_Depth: standard; targeted counterexamples and call-chain tracing, not a paid end-to-end canary._
