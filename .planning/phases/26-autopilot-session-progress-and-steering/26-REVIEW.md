---
phase: 26-autopilot-session-progress-and-steering
reviewed: 2026-10-31T17:40:19Z
depth: standard
head: 349bcb05f3931a19fea43751c188fdb33fe11719
diff_base: a8273f895cede8c225945cbdb1c7e71d5827611c
scope_resolution: degraded-phase-range
files_reviewed: 26
files_reviewed_list:
  - catalog/stack.lock.json
  - docs/task-runtime-controls.md
  - skills/alpha-aos-task/SKILL.md
  - src/cli.ts
  - src/core/controller-lease.ts
  - src/core/redaction.ts
  - src/core/task-gsd-lifecycle.ts
  - src/core/task-progress-launch.ts
  - src/core/task-progress-panel.ts
  - src/core/task-progress.ts
  - src/core/task-read.ts
  - src/core/task-run.ts
  - src/core/task-runtime.ts
  - src/core/task-session.ts
  - src/core/task-steering.ts
  - src/core/task-supervisor.ts
  - test/helpers/task-session-race-fixture.ts
  - test/task-cli.test.ts
  - test/task-connector.test.ts
  - test/task-gsd-lifecycle.test.ts
  - test/task-progress-integration.test.ts
  - test/task-progress-panel.test.ts
  - test/task-progress.test.ts
  - test/task-session.test.ts
  - test/task-skill.test.ts
  - test/task-steering.test.ts
findings:
  critical: 4
  warning: 0
  info: 0
  total: 4
status: issues_found
---

# Phase 26: Code Review Report

**Reviewed:** 2026-10-31T17:40:19Z  
**Depth:** standard, including immediate cross-file call chains  
**Files Reviewed:** 26  
**Status:** issues_found

## Summary

Four current correctness defects were independently reproduced: control receipts overwrite work status, late attach loses existing task evidence, ordinary private-path error messages suppress terminal projection, and proposals arriving after the last controller boundary remain unsettled after completion. Each requires a fix before shipping the session progress and steering feature.

The supplied native evaluation scope was degraded because task-commit rows were unavailable; this review uses its explicit reachable phase-range file list against the head and base above. Planning artifacts were context only. The stable catalog lock is a reviewed policy source, rather than an excluded generated dependency lock. No structural pre-pass or external-reviewer evidence was supplied.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Steering receipts replace work status and hide required input

**Classification:** BLOCKER  
**File:** `D:/dev/alpha-AOS/src/core/task-progress-panel.ts:14-15`  
**Related:** `D:/dev/alpha-AOS/src/core/task-read.ts:33-34`

**Issue:** `display()` updates the current task observation and the required-action banner for every event, including `steering-received`, `steering-delivered`, and `steering-deferred`. A user adjustment is not work progress. After an actual `needs-input` or failure event, submitting a proposal replaces the current observation with a receipt and hides the banner, even though no controller assessment or work transition occurred. The conversation packet already excludes steering events when deriving current work; the browser does not.

**Reproduction:** Execute the actual served `panel.js` with the existing test's minimal DOM fixture. Call `display()` with sequence 1, kind `gsd-step-end`, outcome `needs-input`, and reason `Need approval`; then sequence 2, kind `steering-received`, outcome `received`. Observed before: current contains the input request and `action.hidden === false`. Observed after: current contains `steering-received · received` and `action.hidden === true`.

**Fix:** Render steering facts in the timeline without updating the work overview, meaningful-work timestamp, or work action banner. Derive those fields from the latest validated work/lifecycle event or an explicit work-state projection. Preserve input/failure state until actual work evidence supersedes it. Add browser-script tests for received/delivered/deferred events following needs-input and failure, including snapshot replay.

### CR-02: Attaching to a detached task produces an empty history despite authoritative completion

**Classification:** BLOCKER  
**File:** `D:/dev/alpha-AOS/src/core/task-progress-launch.ts:59-68`  
**Related:** `D:/dev/alpha-AOS/src/core/task-session.ts:206-209`, `D:/dev/alpha-AOS/src/core/task-progress-panel.ts:101-106`

**Issue:** Normal detached runs have no session binding, so their published progress is intentionally discarded. A later exact `task attach` creates the session store, but hydrates evidence only for the dedicated-dispatch branch. It does not project an existing ordinary run's outcome, decisions, or recorded dispatches. The panel snapshot reads only that empty store. A completed detached task therefore opens as having no recorded activity, with no accepted/rejected/stopped result, although `exactRun()` has already loaded its authoritative run record. The same gap affects attaching partway through an ordinary run: preceding work is omitted without a gap indication.

**Reproduction:** In the existing isolated inventory fixture, approve the contract and complete `startTask()` without `onRunReady`; the reference controller and reviewer produce `run.status === "accepted"`. Call `launchTaskProgressPanel()` with that exact approved tuple. Launch succeeds, but `readTaskSessionEvents()` returns zero events. No future task publication can repair the terminal run's empty panel.

**Fix:** On attach, hydrate a bounded exact-run projection from existing authoritative dispatch/run/decision evidence for ordinary runs as well as dedicated jobs. Preserve original observation times and stable source IDs; reconcile concurrent publication idempotently and mark unavailable history explicitly. Never infer acceptance from a dispatch. Add late-attach tests for completed accepted/rejected/stopped runs and an in-flight ordinary run.

### CR-03: Safe refusal of raw error text drops the entire terminal outcome

**Classification:** BLOCKER  
**File:** `D:/dev/alpha-AOS/src/core/task-progress.ts:28-30`  
**Related:** `D:/dev/alpha-AOS/src/core/task-session.ts:58-66`, `D:/dev/alpha-AOS/src/core/task-run.ts:545-553`

**Issue:** `projectRunOutcome()` copies `stopReason` directly into the event. Ordinary internal errors can contain private absolute paths or control characters. The store correctly refuses those fields, but the publisher catches the refusal and drops the whole outcome. As a result, an authenticated panel can stay connected indefinitely while missing the authoritative final run state and explanation. A failure in an audit or later post-dispatch stage can leave a completed dispatch as the latest visible work. This is a projection bug; the store's privacy validation must remain strict.

**Reproduction:** Create the session in `onRunReady` and use a fixture controller that throws `Error("ENOENT: cannot read C:\\private\\input.json")`. The actual run records status `unknown` and the internal-error stop reason. Observed session events are only dispatch-start/running and dispatch-end/failed; the run-outcome event is absent, with `AOS_PROGRESS_DELIVERY` emitted. No provider call is needed.

**Fix:** Minimize, redact, sanitize, and bound untrusted optional projection fields before append. If a reason cannot be safely represented, retain the authoritative outcome with a fixed explicit redaction/unavailable marker or null reason. Apply the same policy to recorded decision/model fields as appropriate, without admitting raw private paths or credentials. Test Windows/POSIX path errors, multiline errors, oversized values, and credential-like text; the terminal event must survive and sensitive text must remain absent.

### CR-04: Proposals received after the last controller sweep remain pending forever

**Classification:** BLOCKER  
**File:** `D:/dev/alpha-AOS/src/core/task-run.ts:1493-1499`  
**Related:** `D:/dev/alpha-AOS/src/core/task-steering.ts:102-115`, `D:/dev/alpha-AOS/src/core/task-run.ts:2293-2324`, `D:/dev/alpha-AOS/src/core/task-gsd-lifecycle.ts:802-804`

**Issue:** The no-safe-boundary sweep runs immediately after controller dispatch. The run then performs audits, measurement, and independent review while still `executing`. A proposal submitted during that later interval gets a received receipt because submission sees an executing run, but no controller boundary or terminal settlement follows. The accepted run permanently retains only received, leaving the user waiting for an assessment that cannot happen. Multi-phase execution has the same final-step/terminal window. Stop races can strand already delivered proposals too: `complete()` requires `checkOwner()`, which refuses pending stops, and the outer cleanup suppresses its error without recording deferral.

**Reproduction:** Wrap the existing `staticReviewerPort(passingReview)`: in its normal `review(request)`, submit an exact-bound proposal, then return the base reviewer result. The isolated quick fixture finishes `accepted`; `readTaskSteering()` returns only `["received"]`. A separate fixture writing a valid pending exact stop record during controller dispatch finishes `unknown` with `internal-error: Task stop pending or unknown` and retains only received/delivered facts, with no deferred disposition.

**Fix:** Add idempotent terminal/no-future-boundary settlement after the authoritative run becomes terminal, coordinated with concurrent submitters so every pending receipt either reaches an eligible existing controller or receives explicit system deferral. Settle interrupted delivered proposals conservatively without claiming assessment/application. This bookkeeping must require no new controller/model call and must retain stop and approval fences; do not weaken `checkOwner()` to permit execution after stop. Add held-reviewer, final-boundary, terminal-submit race, and stop-after-delivery tests.

## Review Evidence and Remaining Proof Limits

- Read the changed implementation and test slices plus immediate controller lease, approval, effect-audit, stop-record, runtime observation, and run-record dependencies. Loaded project instructions, skill bootstrap, phase context, threat model, UI contract, validation strategy, and the three bounded summaries. The reviewer skill query returned no extra configured skills; no project `.codex/skills` or `.agents/skills` directories were present.
- `node scripts/build-artifact.mjs check` passed: 306 inputs and 602 outputs. Reproductions used that verified current build, existing credential-free fixture helpers, real isolated task execution, actual panel launch/served script, and exact binding. Fixture observer jobs were cancelled and temporary fixtures cleaned up. The browser-script reproduction is deterministic DOM execution, not native visual acceptance.
- The existing fixtures exercise many meaningful boundaries, but do not assert the four reproduced scenarios. Recorded historical TDD gaps remain process gaps; this review does not manufacture prior RED evidence or treat passing later tests as proof of that history.
- No source fixes, provider calls, global installation, original Oh-My-Circuit operations, or full-suite run occurred in this review. The orchestrator owns accepted fixes, focused regressions, final `npm run check`, the final full suite, and real browser acceptance.
- Native delivery/UI remains unverified and disabled for all five hosts. Source and fixture evidence does not prove a native chat alert or passive model-free native UI route. Windows restrictive ACL guarantees and kernel-level exclusion of arbitrary same-user path swap-back remain outside the established proof; no new finding here reopens the calibrated SQLite design.

---

_Reviewer: independent gsd-code-reviewer_  
_Depth: standard_
