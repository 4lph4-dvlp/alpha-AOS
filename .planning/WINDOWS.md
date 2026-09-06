---
schema_version: 1
open_count: 6
waived_count: 1
fixed_count: 0
total_count: 7
last_updated: 2026-09-06T18:20:44.402Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | test/path-boundary.test.ts |  | 01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted | waived | Prediction disclosure, not a product defect: 01-19 predicted fixture 4 'a canonical-root refusal names the canonically resolved root' would be the RC-1 reproducer, and it was green before the fix because a not-yet-existing allowed root cannot have an existing escaping descendant - it is a second negative control. 01-VERIFICATION.md rated this self-disclosure as what makes the rest of the 01-19 record trustworthy. The fixture still runs and is green: observed passing on all three legs of run 34046336104 (ubuntu, macos, windows), in both the npm test step and the routed Safety boundary suites step. Nothing to fix; waived on the written record rather than silently marked fixed. | 2026-09-05T16:33:00.301Z | 2026-09-06T17:03:04.345Z |
| 2 | 01 | unrun-verify | src/core/path-boundary.ts |  | 01-19 D4: the non-ENOENT unprovable-filesystem branch (existing but unreadable component or allowed root) has no automated coverage - needs a privileged EACCES/EPERM fixture | open |  | 2026-09-05T16:33:00.990Z |  |
| 3 | 01 | unrun-verify | test/process.test.ts |  | The runtime exact-match assertion 'the declared platform floor must match what the OS actually delivers' cannot run on this win32 host for the darwin branch; completeness of the darwin floor is proven only by the macos-latest CI leg owned by plan 01-23 | open |  | 2026-09-05T16:48:40.118Z |  |
| 4 | 01 | deviation | src/core/process.ts |  | commandProbeEnvironment passthrough set proven on Windows only; a harness whose version goes null on Linux/macOS means the allowlist needs widening (01-21 coverage D5) | open |  | 2026-09-05T17:37:19.376Z |  |
| 5 | 01 | unrun-verify | scripts/run-tests.mjs |  | No permanent suite test asserts the --files loud-failure paths (empty explicit set, named-but-unbuilt path); both were proven by command invocation in 01-24 but are not guarded on every leg | open |  | 2026-09-06T11:29:06.550Z |  |
| 6 | 01 | unrun-verify | src/core/path-boundary.ts |  | provePathBoundary:296-299 (the allowed-root canonicalization refusal inside the preflight) is unreachable through the public API for every filesystem state: lexical root selection at :260 means configuredRoot is always in ancestorChain(configured), and the component loop at :271-285 already issues the same realpath on every member, so it returns unknown-reparse or unprovable-filesystem before :296. Only a TOCTOU race between :285 and :296 reaches it. Derivation recorded in 01-25-PLAN.md and 01-25-SUMMARY.md; the branch is ordered-out defensive symmetry, not dead code, and its behavioral twin at recheckPathProof:352-355 IS covered | open |  | 2026-09-06T11:48:39.962Z |  |
| 7 | 01 | deviation | test/process.test.ts | 298 | An invalidated instrument shipped and produced a real verdict: the descendant-liveness judgment in 'a timed-out command leaves no descendant process behind' was a single bare process.kill(descendantPid, 0), which answers 'may I signal this pid' and succeeds against a zombie as well as a running process. The product's own close() contract at src/core/process.ts:690-699 already named that probe invalid - a signalled grandchild is not this process's waitpid target, 'which is why liveness must be judged by terminal evidence rather than by whether a pid can still be signalled'. Consequence: the ubuntu-latest red cell of CI run 34046336104 (actual: true, expected: false) was UNDECIDABLE between (a) an unreaped zombie and (b) a real SAFE-06 containment failure in which killTree fell back from the process-group signal to the direct child. Both produced byte-identical output. 01-27 replaced the instrument with the shared oracle in test/helpers/termination-oracle.ts (terminal evidence polled to CLOSE_TREE_DEADLINE_MS) and now asserts ProcessResult.treeTermination at the timeout site, with a POSIX 'direct' failing first on its own message. Recorded as a deviation rather than an unrun-verify because this is a diagnosed defect that shipped and decided a leg, not a verification that has not yet run. | open |  | 2026-09-06T18:20:44.402Z |  |

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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T16:33:00.990Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "test/process.test.ts",
    "line": null,
    "description": "The runtime exact-match assertion 'the declared platform floor must match what the OS actually delivers' cannot run on this win32 host for the darwin branch; completeness of the darwin floor is proven only by the macos-latest CI leg owned by plan 01-23",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T16:48:40.118Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "01",
    "file": "src/core/process.ts",
    "line": null,
    "description": "commandProbeEnvironment passthrough set proven on Windows only; a harness whose version goes null on Linux/macOS means the allowlist needs widening (01-21 coverage D5)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T17:37:19.376Z",
    "resolved_at": null
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
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-06T18:20:44.402Z",
    "resolved_at": null
  }
]
````
