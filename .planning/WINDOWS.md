---
schema_version: 1
open_count: 12
waived_count: 2
fixed_count: 15
total_count: 29
last_updated: 2026-09-10T15:03:57.777Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | test/path-boundary.test.ts |  | 01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted | waived | Prediction disclosure, not a product defect: 01-19 predicted fixture 4 'a canonical-root refusal names the canonically resolved root' would be the RC-1 reproducer, and it was green before the fix because a not-yet-existing allowed root cannot have an existing escaping descendant - it is a second negative control. 01-VERIFICATION.md rated this self-disclosure as what makes the rest of the 01-19 record trustworthy. The fixture still runs and is green: observed passing on all three legs of run 34046336104 (ubuntu, macos, windows), in both the npm test step and the routed Safety boundary suites step. Nothing to fix; waived on the written record rather than silently marked fixed. | 2026-09-05T16:33:00.301Z | 2026-09-06T17:03:04.345Z |
| 2 | 01 | unrun-verify | src/core/path-boundary.ts |  | 01-19 D4: the non-ENOENT unprovable-filesystem branch (existing but unreadable component or allowed root) has no automated coverage - needs a privileged EACCES/EPERM fixture | fixed |  | 2026-09-05T16:33:00.990Z | 2026-09-06T18:34:03.469Z |
| 3 | 01 | unrun-verify | test/process.test.ts |  | The runtime exact-match assertion 'the declared platform floor must match what the OS actually delivers' cannot run on this win32 host for the darwin branch; completeness of the darwin floor is proven only by the macos-latest CI leg owned by plan 01-23 | fixed |  | 2026-09-05T16:48:40.118Z | 2026-09-06T18:34:04.117Z |
| 4 | 01 | deviation | src/core/process.ts |  | commandProbeEnvironment passthrough set proven on Windows only; a harness whose version goes null on Linux/macOS means the allowlist needs widening (01-21 coverage D5) | fixed |  | 2026-09-05T17:37:19.376Z | 2026-09-06T18:34:04.766Z |
| 5 | 01 | unrun-verify | scripts/run-tests.mjs |  | No permanent suite test asserts the --files loud-failure paths (empty explicit set, named-but-unbuilt path); both were proven by command invocation in 01-24 but are not guarded on every leg | open |  | 2026-09-06T11:29:06.550Z |  |
| 6 | 01 | unrun-verify | src/core/path-boundary.ts |  | provePathBoundary:296-299 (the allowed-root canonicalization refusal inside the preflight) is unreachable through the public API for every filesystem state: lexical root selection at :260 means configuredRoot is always in ancestorChain(configured), and the component loop at :271-285 already issues the same realpath on every member, so it returns unknown-reparse or unprovable-filesystem before :296. Only a TOCTOU race between :285 and :296 reaches it. Derivation recorded in 01-25-PLAN.md and 01-25-SUMMARY.md; the branch is ordered-out defensive symmetry, not dead code, and its behavioral twin at recheckPathProof:352-355 IS covered | open |  | 2026-09-06T11:48:39.962Z |  |
| 7 | 01 | deviation | test/process.test.ts | 298 | An invalidated instrument shipped and produced a real verdict: the descendant-liveness judgment in 'a timed-out command leaves no descendant process behind' was a single bare process.kill(descendantPid, 0), which answers 'may I signal this pid' and succeeds against a zombie as well as a running process. The product's own close() contract at src/core/process.ts:690-699 already named that probe invalid - a signalled grandchild is not this process's waitpid target, 'which is why liveness must be judged by terminal evidence rather than by whether a pid can still be signalled'. Consequence: the ubuntu-latest red cell of CI run 34046336104 (actual: true, expected: false) was UNDECIDABLE between (a) an unreaped zombie and (b) a real SAFE-06 containment failure in which killTree fell back from the process-group signal to the direct child. Both produced byte-identical output. 01-27 replaced the instrument with the shared oracle in test/helpers/termination-oracle.ts (terminal evidence polled to CLOSE_TREE_DEADLINE_MS) and now asserts ProcessResult.treeTermination at the timeout site, with a POSIX 'direct' failing first on its own message. Recorded as a deviation rather than an unrun-verify because this is a diagnosed defect that shipped and decided a leg, not a verification that has not yet run. | fixed |  | 2026-09-06T18:20:44.402Z | 2026-09-06T18:34:02.828Z |
| 8 | 01 | deviation | test/path-boundary.test.ts | 267 | The unknown-reparse fixture's privilege gate can never open, and its recorded not-run reason misdiagnoses why. The gate at test/path-boundary.test.ts:267-276 runs 'fsutil reparsepoint query .' with cwd = fixture.allowed (an ordinary mkdtemp directory) and skips when exit != 0. An ordinary directory is not a reparse point, so fsutil returns Error 4390 and exit 1 on EVERY host regardless of privilege — measured on this Windows host. That is why windows-latest, a host privileged enough to create file symlinks, also recorded this fixture as not-run in run 34051628180. The reason string it writes, 'fsutil reparsepoint is unavailable or unprivileged on this host', is therefore a misdiagnosis that routed the item to a human as a privilege gate for two verification rounds. Two further facts fix the shape of the repair: (a) 'fsutil reparsepoint' exposes only 'query' and 'delete' — it cannot create a reparse point at all, so no privilege level makes this fixture runnable as written; (b) even past the gate the fixture body at :279-287 never creates an unclassified reparse point, it only expects applyFileTransaction to reject a write under <allowed>/reparse/, which can succeed for reasons unrelated to reparse tags. A genuine fixture must call DeviceIoControl(FSCTL_SET_REPARSE_POINT) with a non-Microsoft tag and gate on whether THAT creation failed. Free unclassified-tag candidates were ruled out: all 45 entries under %LOCALAPPDATA%\\Microsoft\\WindowsApps are read successfully by Node readlink, so the product classifies them as junction. Consequence: SC2's unclassified-reparse-point vector has never been measured on any host; the other five SC2 vectors are green. | open |  | 2026-09-07T04:32:08.607Z |  |
| 9 | 02 | stub | src/core/project-plan.ts |  | Tracer scope: evaluatePack implements only the anyDependencies operator, so 12 of the 15 declared packs (every all / any / anyFiles / manifestOptIn pack) contribute no evaluation at all and are absent from the plan value. Nothing false is claimed - they are not reported 'silent' - but a user cannot yet tell 'not evaluated' from 'did not qualify', which is the Pitfall 8 hazard DETC-03 exists to prevent. Closed by 02-02 (fact vocabulary + remaining operators) and 02-07 (near-miss / unimplemented statuses). | fixed |  | 2026-09-07T13:32:22.318Z | 2026-09-07T18:26:39.853Z |
| 10 | 02 | stub | src/core/evidence.ts |  | catalog/facts.yaml declares 31 facts across all six detector kinds, but collectProjectEvidence still implements only the dependency detector over package.json. A file / directory / manifestKey / fileAbsent / fileContent fact is now loadable, validated and referenceable by a pack predicate, yet cannot be observed, so the packs that depend on those kinds still contribute no evaluation. Closed by 02-06 (the remaining five detector kinds and the non-npm manifest readers). | fixed |  | 2026-09-07T14:02:30.976Z | 2026-09-07T18:26:54.921Z |
| 11 | 02 | stub | catalog/facts.yaml |  | The eight SECURITY_REVIEW risk facts (auth-change, user-input, secrets, payments, sensitive-data, command-execution, trust-boundary, public-api) are declared with deferredTo: GATE-01 and no detector parameters. They are change-risk semantics rather than repository-state facts and two of them would require credential-scanning a user's repository, so Phase 4 GATE-01 owns them. Declaring them keeps the near-miss line honest instead of silent; until 02-07 renders them as unimplemented, SECURITY_REVIEW can never select. | fixed |  | 2026-09-07T14:02:31.697Z | 2026-09-07T18:26:40.624Z |
| 12 | 02 | unmet-truth | src/core/project-plan.ts |  | project plan does not yet name each selected pack's source version and hash, though catalog/stack.lock.json can now answer for all 19 pack skills (02-04) | fixed |  | 2026-09-07T16:08:58.094Z | 2026-09-07T21:45:25.642Z |
| 13 | 02 | unrun-verify | test/evidence.test.ts |  | MAX_SCAN_DEPTH bound test (02-05) flaked once under concurrent suite execution on Windows; passed on every rerun | fixed |  | 2026-09-07T17:32:45.429Z | 2026-09-08T17:49:25.166Z |
| 14 | 02 | unmet-truth | src/core/project-plan.ts |  | D-13 classification is complete for a caller that still holds the reviewed plan value, and PARTIAL at the CLI. approveProjectPlan classifies drift from options.reviewedPlan, or from .alpha-aos/plan.json when that artifact IS the reviewed plan; a CLI approve that drifts before any artifact exists gets a refusal that names both digests and the runnable re-approval command but cannot name WHICH noun moved. This is a consequence of D-12 plus SAFE-01 (the preview persists nothing, so two CLI invocations share only a digest), not a patchable bug: closing it needs a decision - either a reviewed-plan record the preview is allowed to write, or scoping the must-have truth to callers that hold the plan. | waived | UAT 02 test 1 decided: narrow the must-have truth to callers holding the reviewed plan value. The preview stays non-persisting, so SAFE-01 and D-12 both stand. Reproduced at HEAD 8e757db: both branches refuse with exit 2 and a runnable re-approval command (executed, exit 0), and ROADMAP criterion 4 is satisfied either way; only the pre-first-approval window cannot name the moved noun. Not a patchable bug - a product decision. Future candidate with its own plan: expose ApproveProjectPlanOptions.reviewedPlan (src/core/project-plan.ts:1533) as a --reviewed-plan flag, which closes the diagnostic gap without touching SAFE-01 or D-12. | 2026-09-07T19:59:35.274Z | 2026-09-09T09:48:43.234Z |
| 15 | 02 | unrun-verify | src/core/project-plan.ts |  | DETC-06's meaning of 'previously installed' is implemented as 'has a receipt under .alpha-aos/receipts/', so a pack that was approved but never materialized has NO state in reconcileProjectState — neither CURRENT nor STALE. Phase 3 is what writes receipts, so this reading cannot be confirmed against any Phase 2 source artifact. Confirm it against Phase 3's receipt writer before treating the passing 02-10 tests as agreement. | open |  | 2026-09-07T20:55:07.812Z |  |
| 16 | 02 | unmet-truth | src/core/project-plan.ts |  | CR-01 BLOCKER: `project plan` never terminates on a git-tracked workspace containing sub-projects. describeSubProjects/planSubProject (project-plan.ts:1104-1126) recurse with the sub-project path, but resolveCanonicalRoot (evidence.ts:97-109) climbs back to the .git root with no explicit-root argument, so the recursive call re-scans the same root forever. Reproduced twice independently: identical root+sub/package.json fixture exits 0 in <1s without .git, exits 124 with 0 bytes after 30s with .git. project plan, project plan --project, project status and project approve all hang; no CLI workaround. Test suite never sees it because every sub-project fixture is a bare mkdtemp dir (test/project-plan.test.ts:678) and no path joins git-fixture.ts with a sub-manifest. | fixed |  | 2026-09-07T21:46:04.468Z | 2026-09-09T02:33:42.364Z |
| 17 | 02 | unmet-truth | src/core/evidence.ts |  | CR-02 BLOCKER: a directory symlink/junction erases the real directory and emits a FALSE negative reason. identityKeys claims path:<canonical target> on listing in ascending name order, so a junction aaa -> src takes src's identity and the real src is dropped as visited-identity. Reproduced: adding the junction flipped BROWNFIELD_INIT from selected to near-miss with the reason 'none of the declared directories exists under the canonical root: src, lib, app, pkg, internal' while src had just been detected in the same fixture. Repository-controlled input. Breaks ROADMAP criterion 1 (aliases) and criterion 2 (evidence honesty). | fixed |  | 2026-09-07T21:46:05.331Z | 2026-09-08T17:49:26.253Z |
| 18 | 02 | unmet-truth | src/core/evidence.ts |  | CR-03 BLOCKER: a refused or truncated scan is reported as a confident 'No pack qualified on the evidence found.' scanProjectTree populates bounds and excludedBoundaries but nothing outside evidence.ts reads them; text, --why and --json all omit the disclosure. Same silence for MAX_SCAN_ENTRIES=50000 and MAX_SCAN_DEPTH=12. The comment at evidence.ts:205-208 claims --why exposes this; verified false. Breaks ROADMAP criterion 2. | fixed |  | 2026-09-07T21:46:06.146Z | 2026-09-08T17:49:27.360Z |
| 19 | 02 | unmet-truth | src/core/project-plan.ts |  | CR-04 BLOCKER: .alpha-aos/plan.json bypasses validateManagedDocument (bare JSON.parse plus three field checks) while receipts, manifest, catalog and vocabulary all take the strict route. At project-plan.ts:1905 (approvedEvaluation?.satisfied ?? []).filter(...) guards only nullish, so a non-array crashes project status with exit 2 in DETC-06's own STALE branch. .gitignore excludes install-state.json, journal/, snapshots/ and evidence/ but NOT plan.json, so the file is committed and therefore attacker-supplied on clone; StaleReason.sentence is then rendered verbatim into a deletion offer. Breaks ROADMAP criteria 4 and 5. | fixed |  | 2026-09-07T21:46:07.003Z | 2026-09-09T02:33:43.377Z |
| 20 | 02 | unrun-verify | test/evidence.test.ts |  | an aliased FILE adds no second path: skipped on this host (file symlinks need privileges on Windows); the directory-alias case runs | open |  | 2026-09-08T08:25:02.428Z |  |
| 21 | 02 | deviation | test/project-plan.test.ts |  | one unreproduced failure of 'project plan terminates on a git root...' observed once (subProjects listed only packages/api); not reproduced in 4 full suite runs plus 744 targeted stress iterations; assertion now self-diagnosing via discoveryDiagnostics | fixed |  | 2026-09-08T08:25:09.121Z | 2026-09-08T17:49:28.406Z |
| 22 | 02 | unmet-truth | src/core/ignore-list.ts |  | Plan 02-12 must_have clause 'the escape is removed before the pattern reaches the matcher' is not implementable: ignore@7 and git check-ignore both require the backslash to survive. The observable truth (an escaped-# line ignores the #-named file) holds; the mechanism clause does not. | open |  | 2026-09-08T09:22:53.401Z |  |
| 23 | 02 | deviation | test/evidence.test.ts |  | Plan 02-12 edited a file outside its declared files_modified: the undecidable fixture moved from an over-long line to a file past IGNORE_PATTERN_COUNT_CAP, because 02-12 reclassified the over-long-line case as a note. | open |  | 2026-09-08T09:22:54.303Z |  |
| 24 | 02 | deviation | test/project-plan.test.ts |  | Flaky under full-suite load: 'project plan terminates on a git root holding a nested manifest and lists both members' failed once in a full npm test run and passed in isolation and on the immediate re-run. Pre-existing (02-11), not touched by 02-12. | fixed |  | 2026-09-08T09:22:55.245Z | 2026-09-08T17:49:29.691Z |
| 25 | 02 | unmet-truth | src/core/path-boundary.ts | 226 | provePathBoundary records component identity as `inode: Number(info.ino)`, and `recheckPathProof` compares those numbers for equality. A Windows file index is 64-bit and a JS number is a double, so an index above 2^53 is rounded: measured on this host a temp directory's index is 68398419340753788 and its double is 68398419340753790, one ulp being 16. Two DIFFERENT inodes within one ulp therefore compare EQUAL, so the TOCTOU recheck can miss a swap. Same root cause as ledger #13, which plan 02-13 fixed in src/core/evidence.ts identityKeys by reading lstat with { bigint: true }. Left open deliberately: path-boundary.ts is Phase 1 code outside plan 02-13's declared files, PathProof.inode is a typed `number \| null` in the public shape, and widening it to a string or bigint is an interface change that needs its own plan. | open |  | 2026-09-08T17:49:53.322Z |  |
| 26 | 02 | deviation | test/transaction-crash.test.ts |  | Flaky on Windows independent of plan 02-13: 'an in-process transaction serializes against a held session' fails with ENOTEMPTY on rmdir of the fixture target root — a teardown race against the SIGKILLed holder child, not an assertion failure. Observed in 2 of 3 consecutive isolated runs and once in a full npm test run. Plan 02-13 touched no transaction, writer-lock or fixture-teardown code (git diff 025505b..HEAD covers only evidence.ts, project-plan.ts, format.ts, types.ts and their two test files), so it is out of scope under the executor scope boundary. The plan-base commit 025505b was itself a timing fix in this same file. | open |  | 2026-09-08T17:49:54.330Z |  |
| 27 | 03 | deviation | test/project-pack-sync.test.ts |  | Tracer drives the writer at module level rather than through the built CLI: the CLI cannot be handed a test-owned package root or a verifiedSourceRoot, so a CLI-driven sync would require the network | open |  | 2026-09-10T10:57:37.232Z |  |
| 28 | 03 | unrun-verify | src/core/canary.ts |  | No paid canary has been run on this host: doctor --canary never actually spent a model turn, so the launch-and-verdict path is proven only with an injected launcher (03-06 coverage D7) | open |  | 2026-09-10T15:03:57.063Z |  |
| 29 | 03 | deviation | src/core/canary.ts |  | A declared canary argument pattern is reported UNCHECKED: McpObservation has no argument field, so CAPA-01's version-scoped-id claim is not structurally proven (03-06 decision 2) | open |  | 2026-09-10T15:03:57.777Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "test/path-boundary.test.ts",
    "line": null,
    "description": "01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted",
    "status": "waived",
    "reason": "Prediction disclosure, not a product defect: 01-19 predicted fixture 4 'a canonical-root refusal names the canonically resolved root' would be the RC-1 reproducer, and it was green before the fix because a not-yet-existing allowed root cannot have an existing escaping descendant - it is a second negative control. 01-VERIFICATION.md rated this self-disclosure as what makes the rest of the 01-19 record trustworthy. The fixture still runs and is green: observed passing on all three legs of run 34046336104 (ubuntu, macos, windows), in both the npm test step and the routed Safety boundary suites step. Nothing to fix; waived on the written record rather than silently marked fixed.",
    "recorded_at": "2026-09-05T16:33:00.301Z",
    "resolved_at": "2026-09-06T17:03:04.345Z"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/core/path-boundary.ts",
    "line": null,
    "description": "01-19 D4: the non-ENOENT unprovable-filesystem branch (existing but unreadable component or allowed root) has no automated coverage - needs a privileged EACCES/EPERM fixture",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-05T16:33:00.990Z",
    "resolved_at": "2026-09-06T18:34:03.469Z"
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "test/process.test.ts",
    "line": null,
    "description": "The runtime exact-match assertion 'the declared platform floor must match what the OS actually delivers' cannot run on this win32 host for the darwin branch; completeness of the darwin floor is proven only by the macos-latest CI leg owned by plan 01-23",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-05T16:48:40.118Z",
    "resolved_at": "2026-09-06T18:34:04.117Z"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "01",
    "file": "src/core/process.ts",
    "line": null,
    "description": "commandProbeEnvironment passthrough set proven on Windows only; a harness whose version goes null on Linux/macOS means the allowlist needs widening (01-21 coverage D5)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-05T17:37:19.376Z",
    "resolved_at": "2026-09-06T18:34:04.766Z"
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "scripts/run-tests.mjs",
    "line": null,
    "description": "No permanent suite test asserts the --files loud-failure paths (empty explicit set, named-but-unbuilt path); both were proven by command invocation in 01-24 but are not guarded on every leg",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T11:29:06.550Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "src/core/path-boundary.ts",
    "line": null,
    "description": "provePathBoundary:296-299 (the allowed-root canonicalization refusal inside the preflight) is unreachable through the public API for every filesystem state: lexical root selection at :260 means configuredRoot is always in ancestorChain(configured), and the component loop at :271-285 already issues the same realpath on every member, so it returns unknown-reparse or unprovable-filesystem before :296. Only a TOCTOU race between :285 and :296 reaches it. Derivation recorded in 01-25-PLAN.md and 01-25-SUMMARY.md; the branch is ordered-out defensive symmetry, not dead code, and its behavioral twin at recheckPathProof:352-355 IS covered",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T11:48:39.962Z",
    "resolved_at": null
  },
  {
    "id": 7,
    "kind": "deviation",
    "phase": "01",
    "file": "test/process.test.ts",
    "line": 298,
    "description": "An invalidated instrument shipped and produced a real verdict: the descendant-liveness judgment in 'a timed-out command leaves no descendant process behind' was a single bare process.kill(descendantPid, 0), which answers 'may I signal this pid' and succeeds against a zombie as well as a running process. The product's own close() contract at src/core/process.ts:690-699 already named that probe invalid - a signalled grandchild is not this process's waitpid target, 'which is why liveness must be judged by terminal evidence rather than by whether a pid can still be signalled'. Consequence: the ubuntu-latest red cell of CI run 34046336104 (actual: true, expected: false) was UNDECIDABLE between (a) an unreaped zombie and (b) a real SAFE-06 containment failure in which killTree fell back from the process-group signal to the direct child. Both produced byte-identical output. 01-27 replaced the instrument with the shared oracle in test/helpers/termination-oracle.ts (terminal evidence polled to CLOSE_TREE_DEADLINE_MS) and now asserts ProcessResult.treeTermination at the timeout site, with a POSIX 'direct' failing first on its own message. Recorded as a deviation rather than an unrun-verify because this is a diagnosed defect that shipped and decided a leg, not a verification that has not yet run.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-06T18:20:44.402Z",
    "resolved_at": "2026-09-06T18:34:02.828Z"
  },
  {
    "id": 8,
    "kind": "deviation",
    "phase": "01",
    "file": "test/path-boundary.test.ts",
    "line": 267,
    "description": "The unknown-reparse fixture's privilege gate can never open, and its recorded not-run reason misdiagnoses why. The gate at test/path-boundary.test.ts:267-276 runs 'fsutil reparsepoint query .' with cwd = fixture.allowed (an ordinary mkdtemp directory) and skips when exit != 0. An ordinary directory is not a reparse point, so fsutil returns Error 4390 and exit 1 on EVERY host regardless of privilege — measured on this Windows host. That is why windows-latest, a host privileged enough to create file symlinks, also recorded this fixture as not-run in run 34051628180. The reason string it writes, 'fsutil reparsepoint is unavailable or unprivileged on this host', is therefore a misdiagnosis that routed the item to a human as a privilege gate for two verification rounds. Two further facts fix the shape of the repair: (a) 'fsutil reparsepoint' exposes only 'query' and 'delete' — it cannot create a reparse point at all, so no privilege level makes this fixture runnable as written; (b) even past the gate the fixture body at :279-287 never creates an unclassified reparse point, it only expects applyFileTransaction to reject a write under <allowed>/reparse/, which can succeed for reasons unrelated to reparse tags. A genuine fixture must call DeviceIoControl(FSCTL_SET_REPARSE_POINT) with a non-Microsoft tag and gate on whether THAT creation failed. Free unclassified-tag candidates were ruled out: all 45 entries under %LOCALAPPDATA%\\Microsoft\\WindowsApps are read successfully by Node readlink, so the product classifies them as junction. Consequence: SC2's unclassified-reparse-point vector has never been measured on any host; the other five SC2 vectors are green.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-07T04:32:08.607Z",
    "resolved_at": null
  },
  {
    "id": 9,
    "kind": "stub",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "Tracer scope: evaluatePack implements only the anyDependencies operator, so 12 of the 15 declared packs (every all / any / anyFiles / manifestOptIn pack) contribute no evaluation at all and are absent from the plan value. Nothing false is claimed - they are not reported 'silent' - but a user cannot yet tell 'not evaluated' from 'did not qualify', which is the Pitfall 8 hazard DETC-03 exists to prevent. Closed by 02-02 (fact vocabulary + remaining operators) and 02-07 (near-miss / unimplemented statuses).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T13:32:22.318Z",
    "resolved_at": "2026-09-07T18:26:39.853Z"
  },
  {
    "id": 10,
    "kind": "stub",
    "phase": "02",
    "file": "src/core/evidence.ts",
    "line": null,
    "description": "catalog/facts.yaml declares 31 facts across all six detector kinds, but collectProjectEvidence still implements only the dependency detector over package.json. A file / directory / manifestKey / fileAbsent / fileContent fact is now loadable, validated and referenceable by a pack predicate, yet cannot be observed, so the packs that depend on those kinds still contribute no evaluation. Closed by 02-06 (the remaining five detector kinds and the non-npm manifest readers).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T14:02:30.976Z",
    "resolved_at": "2026-09-07T18:26:54.921Z"
  },
  {
    "id": 11,
    "kind": "stub",
    "phase": "02",
    "file": "catalog/facts.yaml",
    "line": null,
    "description": "The eight SECURITY_REVIEW risk facts (auth-change, user-input, secrets, payments, sensitive-data, command-execution, trust-boundary, public-api) are declared with deferredTo: GATE-01 and no detector parameters. They are change-risk semantics rather than repository-state facts and two of them would require credential-scanning a user's repository, so Phase 4 GATE-01 owns them. Declaring them keeps the near-miss line honest instead of silent; until 02-07 renders them as unimplemented, SECURITY_REVIEW can never select.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T14:02:31.697Z",
    "resolved_at": "2026-09-07T18:26:40.624Z"
  },
  {
    "id": 12,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "project plan does not yet name each selected pack's source version and hash, though catalog/stack.lock.json can now answer for all 19 pack skills (02-04)",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T16:08:58.094Z",
    "resolved_at": "2026-09-07T21:45:25.642Z"
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "test/evidence.test.ts",
    "line": null,
    "description": "MAX_SCAN_DEPTH bound test (02-05) flaked once under concurrent suite execution on Windows; passed on every rerun",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T17:32:45.429Z",
    "resolved_at": "2026-09-08T17:49:25.166Z"
  },
  {
    "id": 14,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "D-13 classification is complete for a caller that still holds the reviewed plan value, and PARTIAL at the CLI. approveProjectPlan classifies drift from options.reviewedPlan, or from .alpha-aos/plan.json when that artifact IS the reviewed plan; a CLI approve that drifts before any artifact exists gets a refusal that names both digests and the runnable re-approval command but cannot name WHICH noun moved. This is a consequence of D-12 plus SAFE-01 (the preview persists nothing, so two CLI invocations share only a digest), not a patchable bug: closing it needs a decision - either a reviewed-plan record the preview is allowed to write, or scoping the must-have truth to callers that hold the plan.",
    "status": "waived",
    "reason": "UAT 02 test 1 decided: narrow the must-have truth to callers holding the reviewed plan value. The preview stays non-persisting, so SAFE-01 and D-12 both stand. Reproduced at HEAD 8e757db: both branches refuse with exit 2 and a runnable re-approval command (executed, exit 0), and ROADMAP criterion 4 is satisfied either way; only the pre-first-approval window cannot name the moved noun. Not a patchable bug - a product decision. Future candidate with its own plan: expose ApproveProjectPlanOptions.reviewedPlan (src/core/project-plan.ts:1533) as a --reviewed-plan flag, which closes the diagnostic gap without touching SAFE-01 or D-12.",
    "recorded_at": "2026-09-07T19:59:35.274Z",
    "resolved_at": "2026-09-09T09:48:43.234Z"
  },
  {
    "id": 15,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "DETC-06's meaning of 'previously installed' is implemented as 'has a receipt under .alpha-aos/receipts/', so a pack that was approved but never materialized has NO state in reconcileProjectState — neither CURRENT nor STALE. Phase 3 is what writes receipts, so this reading cannot be confirmed against any Phase 2 source artifact. Confirm it against Phase 3's receipt writer before treating the passing 02-10 tests as agreement.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-07T20:55:07.812Z",
    "resolved_at": null
  },
  {
    "id": 16,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "CR-01 BLOCKER: `project plan` never terminates on a git-tracked workspace containing sub-projects. describeSubProjects/planSubProject (project-plan.ts:1104-1126) recurse with the sub-project path, but resolveCanonicalRoot (evidence.ts:97-109) climbs back to the .git root with no explicit-root argument, so the recursive call re-scans the same root forever. Reproduced twice independently: identical root+sub/package.json fixture exits 0 in <1s without .git, exits 124 with 0 bytes after 30s with .git. project plan, project plan --project, project status and project approve all hang; no CLI workaround. Test suite never sees it because every sub-project fixture is a bare mkdtemp dir (test/project-plan.test.ts:678) and no path joins git-fixture.ts with a sub-manifest.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T21:46:04.468Z",
    "resolved_at": "2026-09-09T02:33:42.364Z"
  },
  {
    "id": 17,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/evidence.ts",
    "line": null,
    "description": "CR-02 BLOCKER: a directory symlink/junction erases the real directory and emits a FALSE negative reason. identityKeys claims path:<canonical target> on listing in ascending name order, so a junction aaa -> src takes src's identity and the real src is dropped as visited-identity. Reproduced: adding the junction flipped BROWNFIELD_INIT from selected to near-miss with the reason 'none of the declared directories exists under the canonical root: src, lib, app, pkg, internal' while src had just been detected in the same fixture. Repository-controlled input. Breaks ROADMAP criterion 1 (aliases) and criterion 2 (evidence honesty).",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T21:46:05.331Z",
    "resolved_at": "2026-09-08T17:49:26.253Z"
  },
  {
    "id": 18,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/evidence.ts",
    "line": null,
    "description": "CR-03 BLOCKER: a refused or truncated scan is reported as a confident 'No pack qualified on the evidence found.' scanProjectTree populates bounds and excludedBoundaries but nothing outside evidence.ts reads them; text, --why and --json all omit the disclosure. Same silence for MAX_SCAN_ENTRIES=50000 and MAX_SCAN_DEPTH=12. The comment at evidence.ts:205-208 claims --why exposes this; verified false. Breaks ROADMAP criterion 2.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T21:46:06.146Z",
    "resolved_at": "2026-09-08T17:49:27.360Z"
  },
  {
    "id": 19,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/project-plan.ts",
    "line": null,
    "description": "CR-04 BLOCKER: .alpha-aos/plan.json bypasses validateManagedDocument (bare JSON.parse plus three field checks) while receipts, manifest, catalog and vocabulary all take the strict route. At project-plan.ts:1905 (approvedEvaluation?.satisfied ?? []).filter(...) guards only nullish, so a non-array crashes project status with exit 2 in DETC-06's own STALE branch. .gitignore excludes install-state.json, journal/, snapshots/ and evidence/ but NOT plan.json, so the file is committed and therefore attacker-supplied on clone; StaleReason.sentence is then rendered verbatim into a deletion offer. Breaks ROADMAP criteria 4 and 5.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-07T21:46:07.003Z",
    "resolved_at": "2026-09-09T02:33:43.377Z"
  },
  {
    "id": 20,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "test/evidence.test.ts",
    "line": null,
    "description": "an aliased FILE adds no second path: skipped on this host (file symlinks need privileges on Windows); the directory-alias case runs",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T08:25:02.428Z",
    "resolved_at": null
  },
  {
    "id": 21,
    "kind": "deviation",
    "phase": "02",
    "file": "test/project-plan.test.ts",
    "line": null,
    "description": "one unreproduced failure of 'project plan terminates on a git root...' observed once (subProjects listed only packages/api); not reproduced in 4 full suite runs plus 744 targeted stress iterations; assertion now self-diagnosing via discoveryDiagnostics",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-08T08:25:09.121Z",
    "resolved_at": "2026-09-08T17:49:28.406Z"
  },
  {
    "id": 22,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/ignore-list.ts",
    "line": null,
    "description": "Plan 02-12 must_have clause 'the escape is removed before the pattern reaches the matcher' is not implementable: ignore@7 and git check-ignore both require the backslash to survive. The observable truth (an escaped-# line ignores the #-named file) holds; the mechanism clause does not.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T09:22:53.401Z",
    "resolved_at": null
  },
  {
    "id": 23,
    "kind": "deviation",
    "phase": "02",
    "file": "test/evidence.test.ts",
    "line": null,
    "description": "Plan 02-12 edited a file outside its declared files_modified: the undecidable fixture moved from an over-long line to a file past IGNORE_PATTERN_COUNT_CAP, because 02-12 reclassified the over-long-line case as a note.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T09:22:54.303Z",
    "resolved_at": null
  },
  {
    "id": 24,
    "kind": "deviation",
    "phase": "02",
    "file": "test/project-plan.test.ts",
    "line": null,
    "description": "Flaky under full-suite load: 'project plan terminates on a git root holding a nested manifest and lists both members' failed once in a full npm test run and passed in isolation and on the immediate re-run. Pre-existing (02-11), not touched by 02-12.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-08T09:22:55.245Z",
    "resolved_at": "2026-09-08T17:49:29.691Z"
  },
  {
    "id": 25,
    "kind": "unmet-truth",
    "phase": "02",
    "file": "src/core/path-boundary.ts",
    "line": 226,
    "description": "provePathBoundary records component identity as `inode: Number(info.ino)`, and `recheckPathProof` compares those numbers for equality. A Windows file index is 64-bit and a JS number is a double, so an index above 2^53 is rounded: measured on this host a temp directory's index is 68398419340753788 and its double is 68398419340753790, one ulp being 16. Two DIFFERENT inodes within one ulp therefore compare EQUAL, so the TOCTOU recheck can miss a swap. Same root cause as ledger #13, which plan 02-13 fixed in src/core/evidence.ts identityKeys by reading lstat with { bigint: true }. Left open deliberately: path-boundary.ts is Phase 1 code outside plan 02-13's declared files, PathProof.inode is a typed `number | null` in the public shape, and widening it to a string or bigint is an interface change that needs its own plan.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T17:49:53.322Z",
    "resolved_at": null
  },
  {
    "id": 26,
    "kind": "deviation",
    "phase": "02",
    "file": "test/transaction-crash.test.ts",
    "line": null,
    "description": "Flaky on Windows independent of plan 02-13: 'an in-process transaction serializes against a held session' fails with ENOTEMPTY on rmdir of the fixture target root — a teardown race against the SIGKILLed holder child, not an assertion failure. Observed in 2 of 3 consecutive isolated runs and once in a full npm test run. Plan 02-13 touched no transaction, writer-lock or fixture-teardown code (git diff 025505b..HEAD covers only evidence.ts, project-plan.ts, format.ts, types.ts and their two test files), so it is out of scope under the executor scope boundary. The plan-base commit 025505b was itself a timing fix in this same file.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-08T17:49:54.330Z",
    "resolved_at": null
  },
  {
    "id": 27,
    "kind": "deviation",
    "phase": "03",
    "file": "test/project-pack-sync.test.ts",
    "line": null,
    "description": "Tracer drives the writer at module level rather than through the built CLI: the CLI cannot be handed a test-owned package root or a verifiedSourceRoot, so a CLI-driven sync would require the network",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-10T10:57:37.232Z",
    "resolved_at": null
  },
  {
    "id": 28,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "src/core/canary.ts",
    "line": null,
    "description": "No paid canary has been run on this host: doctor --canary never actually spent a model turn, so the launch-and-verdict path is proven only with an injected launcher (03-06 coverage D7)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-10T15:03:57.063Z",
    "resolved_at": null
  },
  {
    "id": 29,
    "kind": "deviation",
    "phase": "03",
    "file": "src/core/canary.ts",
    "line": null,
    "description": "A declared canary argument pattern is reported UNCHECKED: McpObservation has no argument field, so CAPA-01's version-scoped-id claim is not structurally proven (03-06 decision 2)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-10T15:03:57.777Z",
    "resolved_at": null
  }
]
````
