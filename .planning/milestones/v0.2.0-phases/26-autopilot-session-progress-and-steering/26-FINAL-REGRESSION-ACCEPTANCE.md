---
phase: 26-autopilot-session-progress-and-steering
reviewed: 2026-10-31T23:57:47Z
depth: scoped-regression-fix-verification
diff_base: 6bbcc0b
reviewed_head: 19451b94efc1fb545ad2428d9512d86ccc42b863
source_fix_commit: ecf5462c9a278f655c15b5995375ef25e19da482
diagnostic_commit: 19451b94efc1fb545ad2428d9512d86ccc42b863
files_reviewed: 4
files_reviewed_list:
  - src/core/task-session.ts
  - test/task-session.test.ts
  - test/task-effects.test.ts
  - .planning/phases/26-autopilot-session-progress-and-steering/26-FINAL-REGRESSION-FIX.md
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
focused_tests_passed: 4
status: accepted
---

# Phase 26: Final Regression Fix Acceptance

Accepted the scoped SQLite initialization fix and diagnostic-only assertion change at `19451b94efc1fb545ad2428d9512d86ccc42b863`. No introduced blocker was found in this four-file review. This accepts these changes; it does not mark the final regression suite or phase complete.

## Initialization Race

The final database pathname is now published only after a private sibling database has its complete schema and canonical binding committed and its SQLite connection closed. Exclusive hard-link publication makes a concurrent loser use the already published database. Every caller then passes through the existing schema and exact-binding validation; an existing empty/corrupt database is not silently initialized or accepted.

Reviewed temporary-file treatment: the database is created exclusively with mode `0600` inside a fresh temporary directory under the session parent. The final hard link retains the same file identity and permissions. Normal success and concurrent-loss paths unlink the temporary name and remove its directory. Initialization failure closes SQLite before cleanup. Existing static parent/database/sidecar checks and pre/post observed identity checks remain intact. This establishes neither restrictive Windows ACLs nor an OS sandbox against arbitrary same-user path substitution; those earlier calibrated limits remain unchanged.

## Independent Focused Evidence

- Current derived build matched its manifest: `node scripts/build-artifact.mjs check` passed, 306 inputs and 602 outputs. No rebuild was necessary for this review.
- Ran the four named regressions: **4 passed, 0 failed, 0 skipped**, exit 0, approximately 7.5 seconds. They cover twelve concurrent same-process creators, synchronized independent process starts, pre-existing empty database refusal, and the originally failing rejected/stopped hydration path.

```text
node scripts/run-tests.mjs --test-name-pattern='concurrent creators publish|independent processes can create|existing empty database|exact hydration preserves rejected' --files dist/test/task-session.test.js dist/test/task-progress.test.js
```

- Independently injected an exception immediately after the private initialization transaction created its tables, within an isolated process and temporary state root. The call rejected; no final database was published and no `.session-init-` directory remained. Restored the built-in method, created the same session with twelve concurrent callers, and verified no temporary directory remained and the final file had one link. A different logical-origin binding was refused. The temporary fixture was cleaned up. This tests ordinary cleanup, not crash-proof orphan reclamation or kernel-level race exclusion.
- The cross-process fixture synchronizes starts rather than every internal SQLite scheduling point. Source ordering supplies the key invariant: no competitor can observe the creator's empty final file because that file is never published empty.

## Dependency-Checkpoint Failure Remains a Final-Suite Gate

The `task-effects` change adds stop-reason/effect details to the existing assertion. Its condition, checkpoint checks, approval rules, and no-auto-approval checks are unchanged. Accept it as better failure evidence, not a causal fix for the unreproduced checkpoint failure. The fix report states that standalone and repeated focused runs passed without establishing the original cause; that limitation is accurate.

The original full result supplied by the orchestrator remains failed: 1,813 tests, 1,800 passed, 2 failed, 11 skipped, preserved in `.planning/tmp/phase26-final-full.log`. The root must rerun the final suite against this accepted source; any checkpoint recurrence requires investigation and cannot be waived by this acceptance. Later Windows isolated-suite execution must be reported separately if it did not run after the main-suite failure.

No source changes, additional agents, provider calls, global installation, original Oh-My-Circuit operations, full-suite run, benchmark, or broader phase review occurred here. The original review and previous scoped acceptance remain unchanged. The root owns the remaining final regression and lifecycle gates.
