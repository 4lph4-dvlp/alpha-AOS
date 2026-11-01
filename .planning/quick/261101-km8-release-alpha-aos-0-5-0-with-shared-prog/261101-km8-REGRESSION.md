# Release 0.5.0 regression investigation

## Findings

The full Windows pre-push batch had six cancellation-observation timeouts and one panel handoff timeout. A concurrent reproduction before changes had one cancellation timeout (69 passed, one failed). An isolated CLI run also saw a refused panel fetch, and an isolated named run saw the short handoff timeout. These observations do not establish a specific Windows or production runtime root cause.

Two fixture assumptions conflict with the behavior under test: an exact-binding refresh used a five-second total observer lifetime without explicit cleanup, while panel cleanup treated one finite cancellation-observation timeout as proof of failure without reconnecting to the exact job. Fixtures now use finite lifetimes sized for startup and assertions, explicitly cancel owned observers, and reconnect once only on `CANCEL_OBSERVATION_TIMEOUT`. A cancelled terminal record, confirmed delivery and actual dead child and worker processes remain mandatory. The ordinary Windows full suite isolates the three process-heavy progress files using the existing runner partition; explicit `--files` remains literal.

## Verification

- Build and artifact verification passed; no production implementation or cancellation timeout changed.
- Serial named cases: 8 passed, 0 failed (two CLI cases, all five hosts, and detached-history attach).
- Three-file concurrent named cases: 6 passed, 2 failed. Panel launch and detached-history attach returned `unresolved` after cancellation timeout and one finite reconnect. Those failures are preserved; unconfirmed closure was not accepted. The normal Windows suite isolates these files; explicit concurrent execution remains a limitation.
- Original and new outputs are retained under `.planning/tmp/release050-regression-*` and `.planning/tmp/release050-fix-*`. The instrumented attach case passed without producing failure-only diagnostics. Full release-gate verification remains for the normal pre-push hook.
