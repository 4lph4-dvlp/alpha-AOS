---
phase: quick-261101-km8
reviewed: 2026-11-01T10:53:41Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/core/command-jobs.ts
  - test/command-jobs.test.ts
  - test/task-connector-effects.test.ts
  - test/task-connector.test.ts
  - test/task-coursepilot-report.test.ts
  - test/task-final-review.test.ts
  - test/task-gsd-lifecycle.test.ts
  - test/task-gsd-multi-phase.test.ts
  - test/task-review-adversarial.test.ts
  - .planning/tmp/release050-finish.ps1
findings:
  critical: 1
  warning: 0
  info: 0
  total: 1
status: issues_found
---

# Release 0.5.0: Scoped Code Review

**Scope:** Narrow diff `137b142..c2d45a727ab492be92f7a8d3594e6bae5189a6ed` and the root-owned release pipeline. This is a contextual review of that fix, not a review of all Phase 26 implementation. The explicitly requested temporary release script is included despite the normal planning-artifact exclusion.

## Summary

One release-script blocker must be fixed before starting the costly release gate. No additional defect was established in the production credential exemption or the test fixture canonicalization. The supplied test evidence does not establish release readiness.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: BLOCKER — Fast-forward command does not prove main equals the CI candidate

**File:** `D:/dev/alpha-AOS/.planning/tmp/release050-finish.ps1:49-54`

**Issue:** After switching to local `main`, `git merge --ff-only $releaseExpected` also succeeds with “Already up to date” when local `main` is a descendant of the candidate. The earlier ancestry check only proves `origin/main` is an ancestor of the candidate; it does not constrain local `main`. The script then tags the candidate but pushes local `main`. If that descendant has a green CI receipt accepted by the normal hook, the atomic push can publish different main/tag commits. Without that receipt, the hook prevents the push, but only after unnecessary work. The exact remote comparison occurs after publication and cannot prevent the mismatch. Current local refs do not demonstrate this condition; it is a missing pre-publication invariant in the script.

**Fix:** Immediately after the merge, check both the Git command exit status and the exact `HEAD` SHA before creating the tag or pushing. Fail closed without resetting or discarding local commits:

```powershell
Run-ReleaseCommand $releaseGit @('merge','--ff-only',$releaseExpected) 'fast-forward'
$releaseMergedHead = & $releaseGit rev-parse HEAD
if ($LASTEXITCODE -ne 0 -or $releaseMergedHead.Trim() -ne $releaseExpected) {
  throw 'Local main does not equal the exact CI candidate'
}
```

## Evidence and Limits

- `src/core/command-jobs.ts:769` exempts only exact uppercase `PWD`/`OLDPWD` names with platform-absolute values. Other names still enter the credential-value scan; flag, URL and structural checks still execute for every token. The new regression retains explicit rejection of `DB_PWD`, `PASSWORD`, relative `PWD`, lowercase `pwd`, credential flags and credential query parameters. A second credential variable containing the directory is still rejected.
- Fixture edits only resolve newly created temporary roots through `realpath`; no production canonicalization or authorization code changes. Existing attack inputs and negative assertions remain intact, including connector traversal and adversarial revision/session/schema cases. The separate root-retargeting test in `test/task-contract.test.ts:494` still constructs and retargets its junction/symlink explicitly.
- Supplied `release050-ci-fix-targeted.log`: 152 tests, 146 passed, 4 failed, 2 cancelled. Failures include revision observation and worker handshakes; cancelled progress cases exceeded their test deadlines. This batch was not green.
- Supplied isolated evidence: credentials/revision cases 3/3 passed; progress cases 2/2 passed; CLI cases 1/2 passed. `release050-ci-fix-isolated-cli.log` still shows public attach failing during registered-job dispatch with the existing 5000 ms worker-handshake error. Isolation did not resolve that failure. The narrow diff does not change handshake timing, worker spawning or observation. The evidence cannot distinguish an existing host/timing problem from a broader runtime defect, and does not prove a narrow-fix regression.
- Supplied final check/build/artifact logs report successful commands. No tests, full suites, release script, remote operations or global mutations were executed by this reviewer.
- The orchestrator specifies launch through `alpha-aos job start` with an explicit whole-process-tree deadline (7200000 or 10800000 ms). The script's `gh run watch` has no independent timeout; the finite-wait assessment depends on that outer deadline being enforced. Its exact CI run ID is persisted before watching. Direct unbounded PowerShell invocation is outside this reviewed launch boundary.

## Recommendation

Fix CR-01, retain the explicit outer job deadline, and require the normal full pre-push hook and exact-candidate three-OS CI to succeed. Preserve the unresolved isolated CLI failure in release evidence; do not describe it as proven concurrency-only or claim the release gate has passed. No broader Phase 26 changes are recommended from this narrow review.

_Reviewer: gsd-code-reviewer. No source files modified; no commit created._

## Orchestrator resolution

CR-01 addressed before execution: capture rev-parse HEAD after merge, require exit 0 and exact candidate equality, then allow tag/push. The outer owned command job must enforce a 10800000 ms whole-process-tree deadline. Full gates and the isolated handshake limitation remain as documented above.
