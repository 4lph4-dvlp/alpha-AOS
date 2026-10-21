# Quick 261021-mcn — BUG-06 efficient waiting and v0.4.1

## Decisions

- Use durable exact task/run identity; never follow a changing latest-run alias while waiting.
- Use event-driven completion with race-safe register/recheck and bounded runtime reconciliation. Do not use periodic model sleep/status loops.
- Bound output and observer timeout/abort. Ending observation never fabricates task cancellation or changes GSD state; orphaned ownership fails closed.
- Support autopilot task observation and ordinary/quick build, test, and delegated-work waiting. Prefer native completion handles; provide a durable local job route where a native persistent handle is unavailable.
- Keep GSD the sole project lifecycle/state authority. Waiting grants no delegation, mutation, GUI, or additional process authority.
- Document Claude Code, Codex, Antigravity, Pi Agent, and Hermes Agent behavior honestly. Do not promise control over host wakeups or infer token savings from tool-call counts.
- Preserve v0.4.0 computer-use behavior and prepare v0.4.1 efficient-wait documentation. macOS/Linux real GUI verification and three-OS CI remain unrun unless actually executed.
- Source, tests, and product documentation implementation uses `agy --model gemini-3.8-flash-high --effort high`; GPT-6.1 Sol high owns research, architecture, planning, checking, independent review, and verification.
- Add `scripts/verify-efficient-wait.mjs`: JSON stdin selects `completion`, `safety`, or `integration`; stdout contains only `{ok:true,check}` after the selected checks actually succeed. Reject invalid input and false evidence.
- Require adversarial, race, and integration regressions, then one final full suite and release dry-run after implementation. Local commits are authorized; push, tag, and publish are outside this task.

## the agent's Discretion

- Select the smallest dependency-free runtime design, bounded observation defaults, API details, and meaningful fixtures that meet the decisions above.
- Correct existing guidance when its background-supervision claims exceed implemented behavior; do not invent a daemon solely to preserve a documentation claim.

## Deferred Ideas

- GUI permission changes; a general service/daemon platform; unmeasured token-cost guarantees; suppressing host-generated model wakeups; remote publication.

## Intake Evidence

These defaults were preapproved in the controlling task packet for GSD quick `--full --auto`; the sole GSD controller is `/root`. BUG-06 is the current external defect report. Its token arithmetic is a reported hypothesis, not measured acceptance evidence.
