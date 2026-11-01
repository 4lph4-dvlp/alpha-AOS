# Release 0.5.0 regression investigation

## Later release-gate and host findings

After the fixture correction commit4f3db9b, the second normal pre-push run did
not complete. It had an additional existing command-job-runtime owned-cancellation
failure, and its log stopped changing for over30minutes. That exact native exec
was interrupted; no remote ref changed. Standalone MCP fixture4/4 passed, while
the standalone owned-cancellation case failed with observation timeout.

Native taskkill/T/F was separately tested against directly created, owned Node
children and did not finish or terminate the child within15s/10s. PID filtering
did not help. Cleanup used held owned Process handles, not a blanket PID kill.
The user-approved elevated WMI-only restart returned service-running, but the
same native probe still timed out afterward. This does not establish WMI as
the cause or a successful repair. User chose manual PC restart before continuation.
See261101-km8-HANDOFF.md for current authority, exact source and resume sequence.

## Findings

The full Windows pre-push batch had six cancellation-observation timeouts and one panel handoff timeout. A concurrent reproduction before changes had one cancellation timeout (69 passed, one failed). An isolated CLI run also saw a refused panel fetch, and an isolated named run saw the short handoff timeout. These observations do not establish a specific Windows or production runtime root cause.

Two fixture assumptions conflict with the behavior under test: an exact-binding refresh used a five-second total observer lifetime without explicit cleanup, while panel cleanup treated one finite cancellation-observation timeout as proof of failure without reconnecting to the exact job. Fixtures now use finite lifetimes sized for startup and assertions, explicitly cancel owned observers, and reconnect once only on `CANCEL_OBSERVATION_TIMEOUT`. A cancelled terminal record, confirmed delivery and actual dead child and worker processes remain mandatory. The ordinary Windows full suite isolates the three process-heavy progress files using the existing runner partition; explicit `--files` remains literal.

## Verification

- Build and artifact verification passed; no production implementation or cancellation timeout changed.
- Serial named cases: 8 passed, 0 failed (two CLI cases, all five hosts, and detached-history attach).
- Three-file concurrent named cases: 6 passed, 2 failed. Panel launch and detached-history attach returned `unresolved` after cancellation timeout and one finite reconnect. Those failures are preserved; unconfirmed closure was not accepted. The normal Windows suite isolates these files; explicit concurrent execution remains a limitation.
- Original and new outputs are retained under `.planning/tmp/release050-regression-*` and `.planning/tmp/release050-fix-*`. The instrumented attach case passed without producing failure-only diagnostics. Full release-gate verification remains for the normal pre-push hook.

## Post-reboot verification

- After the user's restart, the root-owned native `taskkill /T` probe exited 0 in 520 ms and its owned child closed. The named owned-cancellation case passed 1/1 in 2.93 seconds. These observations do not establish the cause of the earlier host failure.
- Added `command-job-runtime.test.js` to the existing Windows-only isolated list because it exercises real owned child and worker cancellation. The ordinary Windows partition contains 144 concurrent files, 10 isolated files and one packed file: all 155 current compiled test files occur exactly once. Explicit `--files` behavior remains unchanged.
- Build and artifact check both exited 0; the complete compiled command-job-runtime file passed 5/5 with no skips, and the existing runner-isolation test passed 1/1. Logs and partition evidence are under `.planning/tmp/release050-postboot-*`. The full release gate remains outstanding.

## Computer-use policy clock fixture

- The subsequent normal pre-push run reached the computer-use policy check after the 155-file suite, packed fixture and real upstream ECC check; the policy check failed with `Computer invalid clock/counters`. The release gate did not pass.
- A separate Node process with a preload advancing `Date.now()` by 1 ms per call reproduced that exact failure in the actual policy script (exit 1). Capturing one timestamp for the fixture's `now`, `startedAt` and `lastActivityAt` made the same invocation pass (exit 0). The production guard and existing negative policy assertions were unchanged.
- Build and artifact check passed; the four mandatory policy, audit, integration and research checks each returned `ok: true`, and the existing compiled computer-use policy suite passed 3/3 with no skips. Logs are under `.planning/tmp/release050-postboot-cu-*` and `.planning/tmp/release050-postboot-clock-*`. A fresh full release gate remains outstanding.

## POSIX release remediation

Commit c2d45a727ab492be92f7a8d3594e6bae5189a6ed exempts only absolute values of exact uppercase PWD/OLDPWD from credential-env matching and canonicalizes newly created fixture roots. Deterministic RED reproduced secret_env_match; GREEN, build, check and artifact passed. Concurrent targeted run:152 total146 pass4 fail2 cancelled. Isolated credential cases3/3 and progress2/2 passed; CLI1/2, with public attach failing a5000ms detached-worker handshake. This remains unresolved, not proven concurrency-only. Full normal release gates must pass. Narrow independent review found no further source defect; its release-script exact-main blocker was corrected before launch.
