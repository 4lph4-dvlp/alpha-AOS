# Branch consolidation and v0.6.1

Status: implementation in progress.

All original refs and stash are retained in .planning/tmp/branch-consolidation-before-061.bundle (verified). Histories of retired branches will be retained as main merge parents. The dirty bootstrap worktree remains detached at e0d9d8d with its three edits; bootstrap-uncommitted.patch preserves the alternative implementation. Main already contains the equivalent committed bootstrap fix and a newer cancellation implementation.

Selected release evidence and optional prohibition verifier/tests are retained. Existing CI/push policy and newer main runtime fixes are preserved. Dependency-only branches are obsolete proposals: their pins are not applied. All historical contents remain recoverable by commit hash and merge ancestry. Prior stable pins remain unchanged.

User explicitly waived release CI/tests; build and CLI startup are the release checks. Publication and branch deletion results pending.
