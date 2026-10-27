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

## 2026-10-27 bounded Codex consumption priority

Continue this approved quick, without a new intake. User prioritizes unusually high Codex consumption before packaging/release. Fresh dedicated headless GPT-6.1 Sol high controller; no old transcript, nested agents, extra Codex model, remote actions, original D checkout mutation, global configuration or model changes. All product edits remain authenticated agy gemini-3.8-flash-high/high, source-only, restricted to waiting guidance and the owned-task-skill six hashes. Preserve every existing deadline, assertion and GSD gate.

Read external codex-consumption-baseline-20261027.json only: 175 unique responses (response_id deduplicated), 31 wait calls, 126 exec calls, 547482 retained tool-output characters; cumulative input33050982 including cached32456192; output178670 including reasoning125256; per-request input27833 to356832. All three historical review subagents used fork_turns none. This is one historical Codex thread, not matched cross-harness measurement, wasted-token attribution, billing or savings evidence.

Current source0a04c96, candidate0.4.5. Ordinary test group1807total/1796pass/0fail/11skip preceded packed lifecycle exceeding the enclosing npm-test child20-minute limit; whole release FAILED. No full-suite/release rerun or runner redesign in this stage. Packaging/provenance, Stage1 and Stage3 criteria, final GSD verification and integration remain pending. Earlier progress files and recalled memories are historical context, not current authority.

This stage: minimal guidance against unchanged status rereads, model babysitters and old-transcript monitoring; native handle/runtime finite wait, bounded external logs, deduplicated local display and honest transport handoff. Demonstrate one real built-CLI job start and exact-job wait once with multiple progress writes, pending-to-terminal/exit0 evidence, 25-second observer, external fixture/state. Short native evidence cannot establish long transport behavior or token reduction. Run affected existing checks only, strong-role review, local commit if passing, then append SUMMARY/REVIEW and ECC handoff. Parent decides remaining release work.

## 2026-10-27 latest approved Stage A / B / C order

User explicitly continues SAME approved quick --full --auto, no new intake: (A) real Codex/GSD waiting path and representative delegated/long work; (B) remaining package/release correction and verification; (C) evidence/GSD/local integration. This stage A controller starts from clean c8fe2c6, product f26efd6, built candidate 0.4.5. Ownership is existing quick records and external stage-a-* audit fixtures/logs only. All future product/source/test/script/schema/docs edits require authenticated agy gemini-3.8-flash-high/high; report concrete blockers instead of editing them here.

Stage A accepts one fresh independent read-only gpt-6.1-sol/high review, three actual existing verifier selections through exact durable jobs with one finite wait each and no status polling, and only if no native yield occurs one bounded >=90-second synthetic transport stress. Preserve actual exits, named-body counts, pending/terminal behavior, forced transport continuations and response-ID-deduplicated usage when available. Prior short matched pair and historical measurements are retained without rerun or generalized savings claims. No full suite/release, original D mutation/integration, GUI, remote action, global configuration/permission changes, dependency promotion, new daemon, model/effort changes or old transcripts. No task Verified/complete claim; final release and GSD gates remain pending. Routine local records/commit, same-model read-only delegation and ECC handoff are approved. Parent owns stage B after this terminal stage A result.

## Intake Evidence

These defaults were preapproved in the controlling task packet for GSD quick `--full --auto`; the sole GSD controller is `/root`. BUG-06 is the current external defect report. Its token arithmetic is a reported hypothesis, not measured acceptance evidence.
