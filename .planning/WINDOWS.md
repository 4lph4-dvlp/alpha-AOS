---
schema_version: 1
open_count: 5
waived_count: 1
fixed_count: 7
total_count: 13
last_updated: 2026-09-07T18:26:54.921Z
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
| 12 | 02 | unmet-truth | src/core/project-plan.ts |  | project plan does not yet name each selected pack's source version and hash, though catalog/stack.lock.json can now answer for all 19 pack skills (02-04) | open |  | 2026-09-07T16:08:58.094Z |  |
| 13 | 02 | unrun-verify | test/evidence.test.ts |  | MAX_SCAN_DEPTH bound test (02-05) flaked once under concurrent suite execution on Windows; passed on every rerun | open |  | 2026-09-07T17:32:45.429Z |  |

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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-07T16:08:58.094Z",
    "resolved_at": null
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "test/evidence.test.ts",
    "line": null,
    "description": "MAX_SCAN_DEPTH bound test (02-05) flaked once under concurrent suite execution on Windows; passed on every rerun",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-07T17:32:45.429Z",
    "resolved_at": null
  }
]
````
