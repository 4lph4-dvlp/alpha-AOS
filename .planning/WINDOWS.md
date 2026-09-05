---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-05T16:33:00.990Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | deviation | test/path-boundary.test.ts |  | 01-19 fixture 4 'a canonical-root refusal names the canonically resolved root' is green before the fix: a not-yet-existing allowed root cannot have an existing escaping descendant, so it is a second negative control rather than the RC-1 reproducer the plan predicted | open |  | 2026-09-05T16:33:00.301Z |  |
| 2 | 01 | unrun-verify | src/core/path-boundary.ts |  | 01-19 D4: the non-ENOENT unprovable-filesystem branch (existing but unreadable component or allowed root) has no automated coverage - needs a privileged EACCES/EPERM fixture | open |  | 2026-09-05T16:33:00.990Z |  |

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
  }
]
````
