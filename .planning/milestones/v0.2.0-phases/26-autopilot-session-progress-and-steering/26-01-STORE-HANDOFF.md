# Phase 26-01 session-store continuation — incomplete

The scoped review `26-STORE-DECISION-REVIEW.md` supersedes the previous handoff's stronger native-open blocker. It accepts observed identity checks, with the explicit limitation that these are not an OS sandbox and cannot establish that no native I/O preceded a detected replacement. Task 1, its tracer gate, tasks 2 and 3, and the plan remain incomplete. Preserve prototype commit `4712a8b` and the initial missing historical RED evidence; the later genuine RED at `3463270` does not retroactively cure it.

## Implemented projection

The run-selected store uses lazy Node 24 SQLite with DELETE journal mode, a 500 ms busy timeout, bound statements, disabled extensions, a transactionally compared complete binding, indexed source uniqueness and sequence allocation, and bounded replay with explicit gaps. Detached dispatch checks the exact run path before loading SQLite. No execution fences are deleted or taken over. Pre/post observations check the database, parent identities and fixed sidecars; these cannot prove atomic native pathname isolation. Legacy data encountered in the selected directory is refused rather than deleted.

## Evidence

- `npm run build` and `npm run check` passed; the build was rerun after the final run-identity validation.
- Full Phase 26 session/panel fixture run: 16 passed, 0 failed, 1 skipped. Windows denied file-symlink creation (EPERM); static non-file sidecar refusal passed. Log: `.planning/tmp/phase26-store-tests.log`.
- The 251-event replay fixture took 18.635 seconds on this Windows run, versus the previously recorded 220.4 seconds. It appended 251 events and checked the 250-record gap. No predeclared acceptance budget was supplied; this is a comparison, not a performance acceptance claim.
- Actual child closure after an uncommitted transaction recovered without an event; after a separate committed transaction and child closure the same source retried at its existing sequence. Concurrent child publishers, duplicate/conflicting source, finite busy handling and subsequent reopen passed. The expanded crash and affected dispatch/panel checks passed 3/3 after the full run; log: `.planning/tmp/phase26-store-affected.log`.
- Follow-up focused checks passed 4/4: independent publishers with distinct and duplicate source IDs, foreign revision refusal, deterministic persistent parent junction and database replacement before native access, unsafe sidecar observed before transaction and after commit, non-file/corrupt database refusal, and a live regular rollback journal. The post-commit observer refused its result while the committed event remained, correctly showing that postchecks do not undo or prevent prior native I/O. The test-only child instruments its own Node filesystem bindings, not production interfaces. Log: `.planning/tmp/phase26-store-barriers.log`; fresh build and `npm run check` passed.
- On this Windows host, the directory, database and live journal were regular files/directories and `icacls` could read their ACLs. This test does not assert that inherited Windows ACLs are restrictive; POSIX mode assertions execute only on POSIX. File-symlink construction remained unavailable (EPERM); the directory-junction replacement fixture executed. No POSIX test-host result is claimed.
- Source SHA-256: `src/core/task-session.ts` = `90EC964D7EC2064D1828304F0B8BA9E67562B8651582990D64B9C2C13FE8F7F7`; `test/task-session.test.ts` = `F50C85C694BF23602F693C4D978B4D6019139E4A00298B63426F53DD76ACB146`; `test/helpers/task-session-race-fixture.ts` = `F5B54D72ADD8D84519F0078135BFF4F55D5466DCA1DCCDFB7D63129CEB838FE9`.

## Remaining before tracer acceptance

The corrected store still requires independent security review against the scoped threat contract, including the stated Windows ACL and same-user race limitations. Task 1's remaining tracer, UI and integration gates, tasks 2 and 3, and final regression remain outstanding. The earlier full session/panel run tested the compiled code before the final added dispatch run-ID validation, for which affected dispatch/panel checks passed separately.

No whole-plan SUMMARY, phase advancement, final security review, browser acceptance of this corrected backend, paid provider request, original-project operation, global setup, or full suite was performed.
