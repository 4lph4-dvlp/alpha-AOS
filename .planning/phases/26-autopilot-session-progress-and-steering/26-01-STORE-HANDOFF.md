# Phase 26-01 session-store continuation — incomplete

The approved SQLite correction has not been implemented. Task 1, the tracer gate, tasks 2 and 3, and the plan remain incomplete. Preserve prototype commit `4712a8b` and the prior handoff's missing historical RED evidence; this continuation does not retroactively cure it.

## Fresh RED evidence

Added `phase26 store uses one run location and refuses unknown legacy evidence` to `test/task-session.test.ts`. `npm run build` exited 0. The focused test exited 1 with one failure and no skipped cases: `taskSessionRoot` hashes the complete binding, so different revision/origin values for the same digest/run produce different paths. The assertion precedes the legacy check, so the latter has not yet executed and is not evidence of legacy refusal. No 251-event timing or full fixture pass was run.

## Blocking security design question

The approved decision requires safe database and journal identity before SQLite opens or recovers them, post-operation substitution checks, private native artifacts, and explicit failure if that boundary cannot be established. `DatabaseSync` accepts a pathname, not an already verified file descriptor; ordinary pathname prechecks and later identity checks cannot establish that a file or rollback journal was not substituted between the checks and native open/recovery. This continuation did not establish a platform-specific, race-resistant way to bind SQLite's native database and journal opens to verified files or prove that the containing directory cannot be changed by an attacker. Do not claim the boundary is proved from `lstat` checks alone, silently weaken it, or delete a journal/fence on PID evidence. Resolve with an independently reviewed supported filesystem/ACL or native-open design, or fail the observer capability explicitly if proof cannot be established.

## Resume

Keep work confined to the approved projection and preserve unrelated state. Implement the run-selected transactional binding and sequence/source identity only after resolving the filesystem boundary; use lazy `node:sqlite`, finite busy timeout, no await in write transactions, explicit close, and refuse unknown data. Replace prototype-only pending/fence fixtures with actual owned child crash and contention tests. Run focused new tests during edits, then the phase26 session/panel fixtures once and record the 251-event timing against 220.4 seconds. The initial RED case above should then pass, including its previously unreached legacy assertion. Remaining Task 1 security, UI and tracer verification and all later tasks remain outstanding. No paid host, global setup, original-project operation, or full suite was run.
