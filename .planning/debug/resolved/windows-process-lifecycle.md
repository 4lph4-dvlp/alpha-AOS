---
status: resolved
trigger: "그럼 windows 테스트의 근본적인 문제를 분석하고 해결 방안을 정식으로 모색하는게 좋지 않을까? 임시방편으로 해결하는 것은 좋지 않을 것 같아. alpha-aos 시스템을 이용해 이를 진행해봐"
created: 2026-09-27
updated: 2026-09-27
quick_task: 260927-420
---

# Windows command discovery and process lifecycle

## Symptoms

- Expected: the required Git executable is discovered and timed-out process trees are observably terminated before fixture cleanup.
- Actual: CI 36259697387 at `7851b7e` fails two brownfield tests with `git executable not found on PATH`, and one process-tree test with `EBUSY` removing its temporary root.
- Timeline: prior runs 36258268517 and 36259275414 passed all three OSes; the latest change only normalizes planning documents. This is an intermittent runtime/test defect, not established as a documentation regression.
- Reproduction: Windows / Node 24 full suite, 946 tests, 935 pass, 3 fail, 8 skips. Git is reported present in the same job before and after the failing tests.

## Current Focus

- hypothesis: timed subprocess-based discovery can report a present executable as missing; a startup-relative tree timeout can leave test evidence unobserved and Windows handles outstanding.
- test: reproduce each mechanism independently with delayed discovery and delayed process startup, capture raw outcomes and cleanup ownership.
- expecting: discovery failure is distinguishable from absence; process-tree assertion must actually run rather than return without evidence.
- next_action: none; verified repair is reviewable in draft PR #5.
- reasoning_checkpoint:
  - hypothesis: a timed locator is not evidence of executable absence; Windows PID termination is not proof that all filesystem handles have already been released.
  - confirming_evidence: a delayed native locator returned ETIMEDOUT for an existing executable while resolveCommand returned null; failing CI explicitly reports windows-tree delivery, esrch and terminated=true immediately before EBUSY.
  - falsification_test: inspect executable selection without spawning a locator; refuse handle-release cleanup unless the existing nonce-bound termination oracle actually reports terminated.
  - fix_rationale: remove the unnecessary scheduling-dependent Windows locator process, and separate proven process termination from bounded filesystem handle release. Make missing PID evidence fail instead of silently passing.
  - blind_spots: the failed hosted locator's raw error was discarded, so its exact underlying status cannot be recovered; the historical busy handle's owner was not captured, so pending OS release versus an external filesystem observer cannot be distinguished; local probes run Windows ARM64/Node 26 while hosted CI runs x64/Node 24.
  - candidate_causes: code conflates locator failure with absence; OS/filesystem handle cleanup is asynchronous after termination; hosted scheduling pressure is a plausible contributing environment factor, not a measured fact.
  - and_gate: yes for intermittent discovery, a slow/failing locator plus failure-to-absence conflation are jointly required; filesystem failure independently combines handle-release latency with immediate zero-retry removal.

## Evidence

1. alpha-AOS status: stable channel, writer free, no incomplete transactions or required repair.
2. `resolveCommand` launches `where.exe`/`which` with a 3000ms deadline and converts every non-zero/null status into `null`, discarding error/timeout distinction. Brownfield invokes it separately for every Git operation.
3. The process fixture starts a descendant with ignored stdio, then reports its PID immediately; the timeout is 1500ms from parent spawn. Missing PID currently prints a diagnostic and returns from the test without a skip or failure.
4. Fixture cleanup calls recursive `rm` immediately with no bounded retry. Whether its lock is a surviving process or Windows handle-release latency has not yet been established; retry alone cannot distinguish these causes.
5. Native delayed-locator reproduction: executable exists, raw status=null/error=ETIMEDOUT, public resolveCommand=null, combined elapsed 6037ms. This confirms the misclassification mechanism without increasing its deadline.
6. Full failed CI log contains the process-tree diagnostic: windows-tree, esrch, terminated=true, observedMs=2, nonce matched, lastCounter=9. The failing hook then reports EBUSY. Thus this particular cleanup failure follows observed termination; an unobserved surviving PID is contradicted by the actual diagnostic.
7. Native CWD-lock experiment: a ready running child holding the temporary directory produces EBUSY; deletion succeeds after its close event. An independent ignored-stdio descendant experiment did NOT reproduce an orphan on this Windows host (libuv job behavior); this negative result is retained rather than claimed as evidence of a leak.
8. Native delayed-PID-publication reproduction: the unchanged 1500ms deadline returns timeout/windows-tree with no observable PID. The current test's early return is therefore a real coverage hole, although it did not occur in the failed CI sample.

## Candidate causes and discriminating experiments

| Candidate | Category | Evidence that would confirm or eliminate |
| --- | --- | --- |
| Git truly absent or PATH modified | environment | Record PATH/directory identity and locator result; an existing native executable plus locator timeout eliminates absence for the reproduction. |
| Locator timeout misclassified as absence | code | Delay a native locator beyond the unchanged deadline and compare raw timeout with resolveCommand result. |
| Deadline races fixture startup | code/environment | Delay child readiness and observe PID-not-visible branch; require ready identity before exercising timeout in a replacement test. |
| Descendant survives termination | code | Observe nonce-bound liveness and termination delivery before any filesystem retry. |
| Folder deletion races released handles | OS/filesystem | Establish all owned children terminated first, then inspect a bounded cleanup outcome. |

## Eliminated

- Planning-path normalization as a runtime code change: diff from passing `92806d8` to failing `7851b7e` contains only `.planning/` documents.
- A surviving descendant as the explanation of this EBUSY sample: its nonce-bound termination evidence is explicitly esrch/terminated=true before cleanup.

## Decision and sources

| Option | Decision | Reason |
| --- | --- | --- |
| Raise locator/process deadlines or retry entire suites | reject | Changes timing without removing absence misclassification or defining cleanup ownership. |
| Cache one successful Git path | reject | Masks the same resolver flaw elsewhere and becomes stale when PATH changes. |
| Windows filesystem discovery preserving current/PATH/PATHEXT and native extension preference | select | Removes the unnecessary locator process and its scheduling deadline; native invocation remains separately verified. Add selection, missing-command, quoted-path and locator-independent regressions. |
| Unconditional recursive deletion retries | reject | Could obscure a live-descendant failure. |
| Bounded Windows handle-release retries after positive termination evidence | select | Handles the observed OS lifecycle stage with a separate condition and finite 2.75-second backoff budget; failed or unobserved termination remains red. |
| Silently accept an unobserved descendant | reject | Removes the safety assertion; replace with a hard assertion and keep the unchanged operation deadline. |

References: [Microsoft where semantics](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/where), [Node 24 fs.rm semantics](https://nodejs.org/docs/latest-v24.x/api/fs.html#fspromisesrmpath-options), [Node child-process close semantics](https://nodejs.org/api/child_process.html#event-close), [libuv Windows process implementation](https://github.com/libuv/libuv/blob/v1.52.1/src/win/process.c), [Microsoft handle-close/delete semantics](https://learn.microsoft.com/en-us/windows/win32/fileio/closing-and-deleting-files). Filesystem retry concerns handle release only; it is not a proof of tree termination. The exact historical handle owner is unknown and is not claimed as established.

## Resolution

- root_cause: failure/absence conflation in subprocess-based discovery; zero-retry Windows fixture deletion after proven termination, before guaranteed filesystem handle release. A separate missing-PID early return permits unobserved assertions to pass.
- fix: deterministic Windows candidate discovery; typed POSIX locator errors; evidence-gated bounded Windows fixture handle release; hard assertion for missing descendant evidence.
- verification: source `75ebbd4` passes local 952-test suite (942 pass, zero failures, ten platform skips), final package/build gates, and two independent complete three-platform CI runs: [36261526375](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36261526375) and [36261525872](https://github.com/4lph4-dvlp/alpha-AOS/actions/runs/36261525872). Windows main suite: 943 pass / zero failures / nine platform skips; real ECC and safety gates also pass. Earlier repaired source `b04f0a6` also passed CI 36261304182.

## Implementation and recurrence guards

- `698efd7`: Windows filesystem candidate discovery retains current/PATH/PATHEXT scope and native extension preference; no locator process or cached path is involved. POSIX locator startup/deadline errors are typed separately from absence.
- `b04f0a6`: only observed `termination.terminated` permits the Windows fixture's finite handle-release retry budget. Missing PID now asserts rather than returns. The 1500ms operation deadline and 5000ms termination observation budget remain unchanged.
- `75ebbd4`: POSIX status 1 alone means absence; other exits or signal termination remain discovery failures. Regression covers timeout, abnormal exit and signal outcome.
- Regression guards: native Windows test removes where.exe from PATH and actually invokes a discovered Node binary; portable selection tests cover precedence, quoted paths, PATHEXT, explicit extensions and missing commands. Existing nonce-based tree oracle remains the prerequisite for cleanup allowance.
- Why this escaped: successful version probes were not a test of locator independence or failure classification; recursive removal conflated process liveness with filesystem availability. A separate silent early return weakened the termination test's coverage.
- No concurrency reduction, global timeout increase, suite rerun-until-green, new dependency, lock change or upstream-gate removal is used.
- No shared-memory index was used; these inspectable GSD records are the durable evidence and resume point.
