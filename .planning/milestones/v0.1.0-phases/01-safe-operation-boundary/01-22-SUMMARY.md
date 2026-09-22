---
phase: 01-safe-operation-boundary
plan: 22
subsystem: testing
tags: [process-boundary, posix-signals, procfs, process-groups, test-oracle, node-test]

requires:
  - phase: 01-safe-operation-boundary
    provides: "openProtocolProcess and the bounded protocol-session mode (01-17), whose close-time tree termination this plan documents and re-verifies"
  - phase: 01-safe-operation-boundary
    provides: "platformFloorEnvironment (01-20) and commandProbeEnvironment (01-21), both in src/core/process.ts, the file this plan also edits"
provides:
  - "CLOSE_TREE_DEADLINE_MS — the close-time whole-tree window the product declares, so its verification cannot drift from its contract"
  - "An explicit close() contract: what is guaranteed, what is only signalled, that reaping is not awaited, and why POSIX and Windows differ"
  - "KillDelivery and ProcessResult.treeTermination — killTree reports which delivery path it actually took instead of discarding it"
  - "A sound termination oracle in test/protocol-session.test.ts: identity-bearing atomically published heartbeats, a strict full-line parser, and a pure liveness classifier that concludes termination only from positive terminal evidence"
affects: [01-23, phase-07-ci-matrix]

actuals:
  tokens: 11084
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Split an impure observation from a pure classification, so platform-specific branches (procfs, zombies, pid reuse) are assertable from literal input on hosts that cannot produce them"
    - "Publish a file a concurrent reader polls by write-to-temp-then-rename, with bounded immediate retries on Windows EPERM"
    - "Declare a contract's window as an exported constant the verifying test imports, rather than letting the test invent its own number"

key-files:
  created: []
  modified:
    - src/core/process.ts
    - test/protocol-session.test.ts

key-decisions:
  - "Termination is concluded only from positive terminal evidence; a stalled heartbeat and an unreadable one both classify as indeterminate, because the failure this plan fixes was load-induced and a staleness rule would have converted a flaky red into a flaky green on a safety boundary."
  - "parseHeartbeatLine requires a complete newline-terminated line, so a torn read is `null` (no evidence) and can never be promoted to `false` (foreign nonce). Publishing atomically and parsing strictly are two independent closures over the same hazard; either alone suffices."
  - "The heartbeat writer retries a refused rename a bounded number of times rather than skipping the beat, because on Windows a polling reader refused 78 of 81 renames with EPERM — the plan's assumed occasional skip was in practice a near-total stall."
  - "Every signal to a pid — including the control test's teardown — is gated on the oracle not already calling it stopped AND the heartbeat nonce matching, so no signal reaches an unidentified pid."

patterns-established:
  - "Pure-function test oracles: a verdict function over one observation record, with the observation gathered separately, so every branch has a deterministic literal-input test on every platform"
  - "Contract constants exported from the product and imported by the test that verifies them"
  - "Identity-gated signalling: a test never sends a signal to a pid whose identity it has not confirmed"

requirements-completed: [SAFE-06]

coverage:
  - id: D1
    description: "close() states what it guarantees (direct-child resolution with the whole group already signalled), what it does not (reaping), and why POSIX and Windows differ; the window is declared once as CLOSE_TREE_DEADLINE_MS"
    requirement: SAFE-06
    verification:
      - kind: other
        ref: "test \"$(grep -v -E '^[[:space:]]*(//|\\*|/\\*)' src/core/process.ts | grep -c 'CLOSE_TREE_DEADLINE_MS =')\" = \"1\""
        status: pass
      - kind: unit
        ref: "test/protocol-session.test.ts#closing a protocol session terminates the whole child tree"
        status: pass
    human_judgment: false
  - id: D2
    description: "killTree reports its delivery path into ProcessResult.treeTermination, so a real group signal is distinguishable from a fallback to the direct child alone"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/protocol-session.test.ts#closing a protocol session terminates the whole child tree"
        status: pass
      - kind: unit
        ref: "test/protocol-session.test.ts#one unterminated protocol frame past the cap terminates the child instead of growing the buffer"
        status: pass
    human_judgment: false
  - id: D3
    description: "The liveness oracle concludes termination only from positive terminal evidence — a stalled or unreadable heartbeat is indeterminate, never terminated"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/protocol-session.test.ts#the termination classifier never reads a stalled heartbeat as a stopped process"
        status: pass
    human_judgment: false
  - id: D4
    description: "A process that stopped executing but has not been reaped is judged terminated even while process.kill(pid, 0) still succeeds, and a recycled pid is detected by a changed /proc start time"
    requirement: SAFE-06
    verification:
      - kind: unit
        ref: "test/protocol-session.test.ts#the termination classifier never reads a stalled heartbeat as a stopped process"
        status: pass
    human_judgment: false
  - id: D5
    description: "The oracle can still say no: a fixture observed to advance its counter at least twice is reported not-terminated, and the same fixture after SIGKILL is reported terminated"
    requirement: SAFE-06
    verification:
      - kind: integration
        ref: "test/protocol-session.test.ts#the termination oracle distinguishes a running descendant from a terminated one"
        status: pass
    human_judgment: false
  - id: D6
    description: "All four former single-probe sites judge through the one oracle and the bare pid-probe helper is gone, with every existing failure text retained verbatim"
    requirement: SAFE-06
    verification:
      - kind: other
        ref: "test -z \"$(git grep -l 'function isAlive' -- test/protocol-session.test.ts || true)\" and a grep -qF over all four failure texts"
        status: pass
      - kind: other
        ref: "node --test --test-reporter=tap dist/test/protocol-session.test.js → # fail 0, 11 tests"
        status: pass
    human_judgment: false
  - id: D7
    description: "The new oracle is not itself flaky on the platform it runs on, and gap G-01-1 is actually closed on the ubuntu leg that exposed it"
    verification:
      - kind: other
        ref: "for i in 1 2 3; do node --test dist/test/protocol-session.test.js; done → three consecutive greens (five observed)"
        status: pass
    human_judgment: true
    rationale: "RC-4 is load-dependent and POSIX-only. It never reproduced on this Windows host even under the exact ten-file command, so a green local run cannot distinguish fixed from not-currently-unlucky. The authoritative verification is a green three-OS CI matrix, owned by plan 01-23."

duration: 32min
completed: 2026-09-05
status: complete
---

# Phase 01 Plan 22: Bounded, identity-checked descendant-termination oracle Summary

**Descendant termination is now judged by polling to `CLOSE_TREE_DEADLINE_MS` — a window the product itself declares — using a nonce-bearing heartbeat and positive terminal evidence (`ESRCH`, `EPERM`, absent `/proc`, a `Z`/`X` state character, a changed start time, a foreign nonce), replacing four unsynchronised `process.kill(pid, 0)` probes that could neither distinguish a zombie from a live process nor a recycled pid from the one the test started.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-09-05T17:42:54Z
- **Completed:** 2026-09-05T18:15:19Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- **The product now states its close-time contract instead of leaving it to be inferred.** `close()` documents that it resolves on the direct child's `close` with the whole process group already signalled, that every descendant stops within `CLOSE_TREE_DEADLINE_MS`, that reaping is explicitly *not* awaited (a grandchild is not a `waitpid` target, so claiming otherwise would be false), and that the POSIX/Windows asymmetry is deliberate — Windows blocks on `taskkill /T /F`, POSIX is synchronous only as far as signal delivery.
- **`killTree` no longer discards what it learned.** It returns a `KillDelivery` (`group` / `direct` / `windows-tree` / `already-gone` / `not-required`) at every exit path, all five call sites record it, and both `ProcessResult` construction sites carry it. Two tests now assert a real `group` delivery, so a silent fallback to signalling the direct child alone would be visible instead of indistinguishable from success.
- **The termination oracle is sound in both directions, and deliberately asymmetric about which observation proves what.** Positive liveness (a counter advancing under our nonce) proves a process runs; its *absence* proves nothing. Only positive terminal evidence yields `terminated: true`. A deadline that expires without such evidence returns `terminated: false`, which reads as "could not prove it stopped" — the honest verdict, and a red rather than a green.
- **Both routes to the dangerous failure direction are closed.** A stalled counter classifies as `indeterminate` (a live descendant starved of CPU under the ten-file concurrent load is never called terminated), and an unreadable or partial heartbeat classifies as `indeterminate` too — `heartbeatNonceMatches: false` is reachable only from a complete newline-terminated line whose nonce token differs. Each is pinned by its own literal-input assertion.
- **Judgment is about identity, not about a pid.** Every heartbeat carries a `randomUUID()` nonce and lives at a path named after it; `registerProbe` records the `/proc` start time while the process is known alive, giving the pid-reuse branch its baseline. No signal is sent to a pid whose identity has not been confirmed — including the control test's teardown.
- **All four bare-probe sites were converted, not two.** The UAT named `:284-291` and `:453`; the file had four. `:328` and `:351` were converted with their assertions and failure texts intact, and the pid-probe helper was deleted so no site could quietly keep the unsound instrument.
- **The suite grew by exactly two tests, 200 → 202**, matching the chain `01-23` Task 1 checks. Converting an assertion added none and removed none.

## Task Commits

1. **Task 1: close() 계약을 소스에 쓰고 killTree 의 delivery 를 결과로 흘린다** — `698d8fc` (refactor)
2. **Task 2: 단발 프로브를 nonce heartbeat 기반의 경계 있는 종료 판정으로 교체한다** — `b28c0db` (test: atomically published heartbeat fixtures), `0f33012` (fix: the oracle and the four conversions)

## Files Created/Modified

- `src/core/process.ts` — Declares `CLOSE_TREE_DEADLINE_MS` and `KillDelivery`, documents the `close()` contract, makes `killTree` report its delivery path, and carries that path into `ProcessResult.treeTermination` from both construction sites.
- `test/protocol-session.test.ts` — Heartbeat-publishing fixtures (`sleepScript`, `unterminatedFloodScript`, `silentScript`, with `descendantScript` forwarding to the grandchild), `mintHeartbeat`, `parseHeartbeatLine`, `classifyProcessSample`, `statFieldsFromThree`, `registerProbe`, `waitForTermination`, `waitForHeartbeatAdvance`, the four converted call sites, and the two control tests. `isAlive` deleted.

## Decisions Made

- **Staleness never concludes anything.** The obvious replacement oracle — declare termination when the counter stops advancing — is unsound in the opposite direction, and that direction is worse. The observed failure came from the ubuntu runner's ten-file concurrent load, where a live descendant can easily go a few hundred milliseconds unscheduled. Rule 7 of the classifier (`no-terminal-evidence` → `indeterminate`) is the design's centre of gravity.
- **A torn read is no evidence, never a foreign nonce.** This was the one way the foreign-nonce rule could smuggle RC-4 back in: a reader landing mid-write sees a first token that is not our nonce, the rule fires, and a live, actively-writing descendant is reported terminated — load-sensitive in exactly RC-4's way. Closed at both ends (atomic publish, strict parse), either of which suffices alone.
- **The stat parser anchors on the last `)`.** Field 2 of `/proc/<pid>/stat` is the executable name and can contain spaces and parentheses; anchoring earlier silently misclassifies awkwardly named processes. Asserted with a literal `(weird ) name)` comm.
- **The two direct-child sites do not assert `treeTermination`.** `not-required` is a legitimate value when the child leaves within the grace period, so asserting a delivery path there would claim a contract that does not exist. Only the two whole-tree sites assert it.
- **The live control observes advancement rather than its absence.** An earlier design watched for the counter failing to advance, which made the control share the very load-sensitivity it existed to catch. It now asserts `advances >= 2` before asserting the oracle declines to call the process terminated.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The atomic heartbeat publish stalled almost completely on Windows under a polling reader**

- **Found during:** Task 2 (after the first `fix` implementation, caught by the plan's own three-consecutive-runs gate)
- **Issue:** The plan specifies write-to-temp-then-`renameSync`, noting that "a rename that fails (Windows can refuse while a reader holds the file open) is swallowed and the beat is simply skipped; the counter advances again on the next tick." Measured, that assumption is wrong by two orders of magnitude. Against a reader polling every 25ms, `renameSync` was refused with `EPERM` on **78 of 81** beats, and the published counter advanced three times in five seconds. The new control test — which requires the fixture to prove it is running via `advances >= 2` within 5s — therefore failed intermittently (observed 1 failure in 6 runs before the fix, with `0 advances, last counter 0`).
- **Fix:** The beat retries a refused rename up to 20 times immediately before giving up. Measured after the change: 81 of 81 beats published in 157 total attempts (~2 per beat), and the reader observed 81 distinct beats. The publish mechanism is unchanged in kind — still write-to-temp-then-rename, still swallowing failure once retries are exhausted, since a skipped beat is a stall and a stall concludes nothing.
- **Files modified:** `test/protocol-session.test.ts` (the `heartbeatSource` fixture prelude and its doc comment, which now records the measurement)
- **Verification:** Five consecutive green runs of `dist/test/protocol-session.test.js` after the change (three required by the gate), then three more in the final gate sweep. Eight consecutive greens total.
- **Committed in:** `0f33012` (part of the Task 2 fix commit)
- **Note:** This is a *red*-direction flake, not a green-direction one — a stalled heartbeat never produced a termination verdict, so the oracle's soundness was never at risk. It made a mandatory control test unreliable, which is still a defect. On Linux, `rename(2)` over an open file always succeeds, so this never affected the ubuntu leg that G-01-1 is about.

**2. [Rule 3 - Blocking] `waitForTermination`'s declared return type could not express the guard the plan requires**

- **Found during:** Task 2
- **Issue:** The plan declares `waitForTermination` returning `{ terminated, evidence, observedMs, lastCounter, advanced }`, but also requires that every cleanup signal be gated on "the *previous sample's* `heartbeatNonceMatches === true`". Nothing in the declared shape carries that value, so the two requirements could not both be satisfied as written.
- **Fix:** Added `heartbeatNonceMatches: boolean | null` to the return — a strict superset of the declared sketch, carrying the last sample's identity evidence. Every guard now reads literally `termination.heartbeatNonceMatches === true`.
- **Files modified:** `test/protocol-session.test.ts`
- **Verification:** `npm run check` exits 0; the guard is exercised at all three signalling sites.
- **Committed in:** `0f33012`

**3. [Rule 3 - Blocking] `descendantScript` would have crashed when opened without a heartbeat identity**

- **Found during:** Task 2
- **Issue:** The plan specifies `spawn(process.execPath, [process.argv[2], process.argv[3], process.argv[4]], …)`. When the script is opened without heartbeat arguments, `argv[3]`/`argv[4]` are `undefined` and `spawn` throws on an `undefined` argument. This would have broken the descendant test at the intermediate `test(01-22)` commit, before the call sites started passing arguments.
- **Fix:** The forwarded arguments are filtered for `undefined` before being spread into `spawn`.
- **Files modified:** `test/protocol-session.test.ts`
- **Verification:** The full suite was green at the intermediate commit `b28c0db` (9 tests in this file, fail 0) as well as after the conversion.
- **Committed in:** `b28c0db`

---

**Total deviations:** 3 auto-fixed (1 × Rule 1 bug, 2 × Rule 3 blocking)
**Impact on plan:** None on scope or on any `must_haves` truth or prohibition. Deviation 1 is the only substantive one and it strengthens the fixture against a measured platform behaviour the plan had estimated optimistically; the plan's required publish mechanism, `renameSync` key link, and swallow-on-failure semantics are all preserved. Deviations 2 and 3 are minimal reconciliations where the plan's own requirements were mutually unsatisfiable as literally written.

## Issues Encountered

**Windows `renameSync` EPERM under a concurrent reader.** Diagnosed by instrumenting the writer to count error codes rather than by inference — the first two hypotheses (an unref'd interval, and ordinary collision probability) were both wrong, and the measured 96% refusal rate is what pointed at destination-replace semantics rather than a timing collision. Resolved as deviation 1 above.

No other issues. No authentication gates. No architectural decisions required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **The suite baseline is now 202 tests** (pass 200, fail 0, 2 pre-existing platform skips). Plan `01-23` must use 202, and its Task 1 chain check (`190 → +4 / +1 / +4 / +2`) resolves against this figure.
- **`ProcessResult.treeTermination` is available to any future consumer.** `describeProcessFailure` in `src/core/install.ts` was deliberately left untouched: D-12 keeps diagnostics to coded metadata, and the delivery path is a contract value tests read, not user-facing text.
- **Gap G-01-1 is not authoritatively closed by this plan.** RC-4 is load-dependent and POSIX-only and did not reproduce on this Windows host even under the exact ten-file CI command. A green local run cannot distinguish "fixed" from "not currently unlucky". The authoritative verification is a green three-OS CI matrix, owned by `01-23`.
- **Two falsifiable predictions for the ubuntu leg.** If the descendant assertion still fails there, the failure message now carries `evidence`, `observedMs`, `lastCounter` and `advanced`, which distinguishes "the tree really was not terminated" (`no-terminal-evidence` with an advancing counter) from "the oracle is still mis-instrumented" (any other combination). And `treeTermination` should read `group` on both POSIX legs — a `direct` or `not-required` there would be new information about the product rather than about the test.
- **Carried forward, unchanged and still not planned:** `src/core/process.ts` `readCommandVersion` and `probeCommand` are now environment-pinned (01-21), but the adjacent UAT finding about probe behaviour remains a post-`01-23` item by design.

---
*Phase: 01-safe-operation-boundary*
*Completed: 2026-09-05*

## Self-Check: PASSED

- Both modified files exist on disk; no files were claimed created.
- All three task commits are reachable: `698d8fc`, `b28c0db`, `0f33012`.
- `CLOSE_TREE_DEADLINE_MS` and `KillDelivery` are exported from `src/core/process.ts`; `treeTermination` appears at its declaration and both construction sites.
- `parseHeartbeatLine`, `classifyProcessSample`, `registerProbe`, `waitForTermination`, `waitForHeartbeatAdvance`, `mintHeartbeat` and `renameSync` are all present in `test/protocol-session.test.ts`; `isAlive` is absent.
- Plan-level verification re-run at close-out: `npm run check` exits 0, `npm run build` compiles, the tap gate reports `# fail 0` with both control tests as passing `ok` lines by exact name, the ten-file CI command reports 125 tests / fail 0, and `npm test` reports 202 tests / pass 200 / fail 0 / skipped 2.
