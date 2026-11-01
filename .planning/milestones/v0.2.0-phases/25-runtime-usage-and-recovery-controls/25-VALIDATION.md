---
phase: 25
status: validated
nyquist_compliant: true
wave_0_complete: true
---

# Validation map

Final gate: source `77cf6d156df66a023a4e5c93dcba82a3738dc367`, exit 0.
1857 tests: 1846 passed, 11 skipped, zero failures, eight runner groups including
all ten packed lifecycle cases. See `25-FINAL-TESTS.json` for the native completion
handle, observation time and complete log hash. RUNTIME-01..08 map to R1..R8 below.

| Requirement | Credential-free evidence |
|---|---|
| R1 quota/process termination | task-native-job, command-job-worker/runtime, task-runtime-controls |
| R2 surviving child | task-native-job parent-death fixture; existing job orphan/fence fixtures |
| R3 replay/resume/partial usage | task-runtime-controls cumulative ledger; task-native-job local session-family fixture |
| R4 next-dispatch budget guard | task-native-job approved route quota/limit fixture; task-runtime-controls missing meter guard |
| R5 no model polling | existing completion-wait and command job finite-wait fixtures; runtime invokes no LLM for bookkeeping |
| R6 unchanged review basis | task-final-review real witness reuse and requirement invalidation |
| R7 Windows argv | task-native-job typed multilingual/resume argv; existing process and job CLI parser regressions |
| R8 GSD recovery/final acceptance | task-gsd-multi-phase partial commit, incomplete SUMMARY, dirty WIP, Nyquist and final port; task-final-review no-op refusal |

Initial RED: 4/4 new resource/telemetry reproductions failed before source repair.
Earlier targeted regressions: 42/42, then 118/118; later GSD/review subset 38/38.
Earlier runs below are historical failure/repair evidence; the final current-source
gate and independent review have now passed.
No paid native canary or global installation modification is authorized/performed.

## Historical failure and repair gates

The initial full regression found 10 failures (1834 total, 1813 passed, 11
skipped). Its failures are retained in `full-regression.log`; this is not a
passing final gate. The independent review recorded CR-01 through CR-07 and
WR-01 in `25-REVIEW.md`. Fixes and counterexamples require a focused delta check.

`focused-recovery-v3.log` overlapped a build and therefore does not establish
the final compiled-source baseline. It also records real Windows worker
handshake timeouts. These failures are not waived or hidden by increasing
timeouts. A serial, post-build recovery/cancellation check is required before
the next full regression. Phase 25 remains incomplete.

Post-build `focused-recovery-v4.log` proves the public approved multi-phase
resume fixture passed, including preserved dirty WIP and the final acceptance
port. That run still failed four Windows job-start cases. Deadline-edge
reconciliation was subsequently repaired without increasing the timeout.

Independent focused source review is clean in `25-REVIEW-FINAL.md`. It closes
the remaining callback-only native reviewer failure, with exact source hashes,
and retains the unchanged dispositions from `25-REVIEW-DELTA.md`. Reviewers did
not execute or poll tests. The serial 16-file `targeted-final.log` run remains
parent-owned; a passing review is not a passing regression or phase acceptance.

## Current evidence (source commit 17718a3)

- `targeted-final.log`: 209 tests, 203 pass, six failures; retained as historical
  failure evidence, not a green gate. All new R1–R8 runtime/review/resume cases
  passed. Remaining Windows/process fixtures were isolated for repair.
- `cancel-timing.log`: same exact job timed out after its five-second observation
  and subsequently produced a genuine cancelled record. This is not timeout
  success: delivered/confirmed cancellation and owned process closure are required.
- `targeted-windows-reconnect.log`: 14 selected cases, 12 passed; the two remaining
  failures exposed the fixture's incorrect expectation that cancelled `job wait`
  exits 0. Its real terminal exit is 1.
- `targeted-cancel-terminal.log`: final two cases passed, exit 0 for the test run;
  cancelled job exit 1 and actual terminal identity/closure remain mandatory.
- `25-REVIEW-FIXTURES.md`: independent inspection confirms unchanged product
  timeouts and retained completion/safety criteria. PID plus process-start identity
  and actual ChildProcess closure replace invalid PID uniqueness assumptions.
- Latest build passed. `full-final.log` is the current final `npm test --
  --test-reporter=tap` gate with `ALPHA_AOS_LIVE_CANARY=0`; host session 41645 is
  completed with 1843 tests: 1827 passed, five failed, 11 skipped. It is not a
  passing gate. Three pre-existing adversarial fixtures lacked declared
  requirements; two Windows tree-termination cases suffered concurrent host
  contention. The original process deadlines and assertions remain unchanged.

## Final regression reconnect (source 04fab20)

- `process-isolated.log`: both previously failing native tree cases pass with
  unchanged 1500ms timeout and original elapsed/liveness checks. Windows tree
  delivery and nonce-matched descendant termination are observed, not inferred.
- `targeted-final-gates.log`: 6/6 pass. Adversarial fixtures declare the exact
  requirement already present in their reports. A separate runner fixture proves
  every registered file executes once, native suites do not overlap on Windows,
  and the packed gate runs last.
- `25-REVIEW-RUNNER.md`: clean independent focused review; no dropped coverage,
  masked failure or weakened assertion. Product timeouts were not increased.
- `full-verified.log`: source 04fab20 full npm test passed, exit 0: 1854 total,
  1843 pass, 11 skipped, zero failures, including all ten packed lifecycle cases.
  Its recorded source does not include the later R2 reconciliation repair.

## Current final gate (source 77cf6d1)

- `unknown-closure-red.log` reproduces invented positive closure during resume.
- `targeted-closure-accepted.log`: 30/30 pass across runtime/native/public GSD
  resume/supervisor recovery. Missing PID, explicit false, returned/streamed native
  handles, null final placeholders and process-only timeout outcomes keep fences;
  an actual owned Node close callback still permits recovery after owner loss.
- `25-REVIEW-CLOSURE.md`: clean focused independent review, exact hashes. Native
  and protocol/report identities stay separate; unknown closure cannot become true
  merely because the PID is absent. No source changes followed this review.
- `full-acceptance.log`: final npm test with live canaries disabled, native handle
  49739 completed with exit 0. 1857 tests: 1846 passed, 11 skipped, zero failures.
  Source remained unchanged throughout the gate; structured receipt:
  `25-FINAL-TESTS.json`. No original-project restart/global install occurred.
