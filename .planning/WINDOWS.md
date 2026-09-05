---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-09-05T17:37:19.376Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | test/path-boundary.test.ts |  | 01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted | open |  | 2026-09-05T16:33:00.301Z |  |
| 2 | 01 | unrun-verify | src/core/path-boundary.ts |  | 01-19 D4: the non-ENOENT unprovable-filesystem branch (existing but unreadable component or allowed root) has no automated coverage - needs a privileged EACCES/EPERM fixture | open |  | 2026-09-05T16:33:00.990Z |  |
| 3 | 01 | unrun-verify | test/process.test.ts |  | The runtime exact-match assertion 'the declared platform floor must match what the OS actually delivers' cannot run on this win32 host for the darwin branch; completeness of the darwin floor is proven only by the macos-latest CI leg owned by plan 01-23 | open |  | 2026-09-05T16:48:40.118Z |  |
| 4 | 01 | deviation | src/core/process.ts |  | commandProbeEnvironment passthrough set proven on Windows only; a harness whose version goes null on Linux/macOS means the allowlist needs widening (01-21 coverage D5) | open |  | 2026-09-05T17:37:19.376Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "01",
    "file": "test/path-boundary.test.ts",
    "line": null,
    "description": "01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-05T16:33:00.301Z",
    "resolved_at": null
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
  }
]
````
