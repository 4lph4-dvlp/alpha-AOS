---
id: 260927-420
status: passed
verified: "2026-09-26T18:20:29.000Z"
source_commit: 75ebbd4e9678ebf7afa9af817a543c332d14de0f
---

# Root-cause repair verification

| Required outcome | Evidence | Result |
| --- | --- | --- |
| Falsifiable diagnosis precedes repair | Resolved debug record includes delayed native locator ETIMEDOUT/absence reproduction, CWD-lock experiment, negative orphan result, delayed-PID reproduction and actual failed-CI termination diagnostic. Reasoning checkpoint distinguishes direct observations and inference. | pass |
| Discovery no longer converts probe failure into absence | Windows filesystem search has no locator subprocess/deadline or cached result. Native where-independent regression invokes the discovered executable. Portable selection tests cover existing preferences and search scope. POSIX regression rejects timeout, abnormal status and signal termination; only actual absence returns null. | pass |
| Tree cleanup depends on observed termination | Missing PID asserts. Only nonce-oracle `termination.terminated` enables Windows handle-release backoff, capped at 10 retries with 50ms linear intervals (2.75 seconds of backoff). Live/unobserved termination has no allowance; existing liveness assertions remain. | pass |
| Safety semantics remain intact | Process/termination deadlines and suite concurrency unchanged; no new dependency or lock modification; required real MCP, real ECC and safety gates retained. Native startup and environment boundary suites pass. | pass |
| Local and three-platform final gates pass | Local final source: 952 tests, 942 pass, zero failures, ten platform skips, upstream MCP required. Type check, 132-input/258-output build manifest and 178-entry package audit pass. CI 36261526375 and 36261525872 both pass all three OSes, including upstream ECC and safety. | pass |

Inline plan review and implementation review passed. Baseline failure 36259697387 is retained and not presented as passing evidence. The precise discarded hosted locator error and historical handle owner remain unknown; these limits are explicit in the debug report and SUMMARY. Positive termination evidence is a separate prerequisite, never inferred from successful filesystem retry.

The debug session is resolved under `.planning/debug/resolved/windows-process-lifecycle.md`. Workflow closure changes GSD records only after the verified source revision. No main merge, release, history rewrite or native harness reinstallation is claimed.
