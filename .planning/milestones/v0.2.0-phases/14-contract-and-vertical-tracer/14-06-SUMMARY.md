---
phase: 14-contract-and-vertical-tracer
plan: 06
subsystem: autonomous-work
tags: [task-start, task-report, live-tracer, codex, claude, gsd-quick, sandbox, not-proven, node-test]

requires:
  - phase: 14-02
    provides: "assertTaskStartable, contract drift with changed field names, taskApproveCommand"
  - phase: 14-04
    provides: "probeTaskAgentPair, nativeTaskPorts, the Codex and Claude environment name lists"
  - phase: 14-05
    provides: "startTask with GSD quick evidence, effect audit, blocked new-authority outcome, probeGsdQuickReadiness, readTaskBaseline"
provides:
  - "CLI `alpha-aos task start <contract.json> [--contract-digest <digest>] [--apply] [--json]`: a readiness preview without --apply; with --apply the only non-test startTask call site, bound to nativeTaskPorts()"
  - "src/format.ts formatTaskStartReadiness and the extended formatTaskRunReport (Consent, Decisions, GSD, Changed paths, Executor claim (not evidence), Reviewer, Out-of-scope suggestions, Stop reason, Next action)"
  - "src/core/task-effects.ts GSD_RUNTIME_STATE_PATHS: GSD quick's .gsd/dispatch-isolation-sentinel.json is GSD workflow state, not a workspace-write violation"
  - "test/task-tracer.integration.ts: explicitly invoked live accept test (NOT PROVEN on this host); test/helpers/task-fixture.ts liveTaskEnvironment and seededDefectContract"
affects: [14-verification, phase-16, phase-17, sealed-adapter]

actuals:
  tokens: 15000
  tasks: 1
  commits: 6
plan_head_before: fad4c0760ccb6d6761658f21e8fe20465d519b59

tech-stack:
  added: []
  patterns:
    - "A start verb split into a write-free readiness preview and an --apply branch that is the only non-test call site of the supervisor"
    - "A live proof that cannot be obtained is recorded NOT PROVEN with its run record, never skipped or relaxed"

key-files:
  created:
    - test/task-tracer.integration.ts
  modified:
    - src/cli.ts
    - src/format.ts
    - src/core/task-run.ts
    - src/core/task-effects.ts
    - test/task-cli.test.ts
    - test/task-effects.test.ts
    - test/helpers/task-fixture.ts
    - .planning/phases/14-contract-and-vertical-tracer/14-VALIDATION.md

key-decisions:
  - "User decision D at the 14-06 blocking-human checkpoint: the RUN-01 live proof is recorded NOT PROVEN on this host; the Codex sandbox arguments, exec policy, supervisor commit behaviour and the 14-05 GSD evidence contract stay unchanged"
  - "The .git write authority GSD quick needs inside Codex workspace-write is deferred to Phase 16/17 (with GSD-04 provenance) or a sealed/container adapter"
  - "Research assumption A3 is proven: codex exec drives the installed $gsd-quick and produces its quick PLAN, decision log, implementation and tests"
  - "Only the exact file .gsd/dispatch-isolation-sentinel.json is GSD runtime state; every other .gsd path remains a workspace-write violation"
  - "Task 3 (seeded-defect rejection and stale-review substitution) was not executed: its precondition, an accepted run from Task 2, is unmet; no live turn was spent on it"

patterns-established:
  - "Live-evidence tests carry a status header naming the host, the observed run id and the reason they currently fail"

requirements-completed: [AUTO-01, AUTO-03, CON-01, CON-03]

coverage:
  - id: D1
    description: "task start without --apply is a write-free readiness preview (roles and versions or missing proof, GSD readiness, baseline, approval state, spend warning, start command); an empty PATH reports codex and claude as missing proof and exits 2"
    requirement: CON-01
    verification:
      - kind: integration
        ref: "test/task-cli.test.ts (task start readiness preview tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Only task start --apply with the task's own approved, unconsumed digest reaches startTask; missing, unapproved, consumed, foreign and drifted digests and an unsupported pair are refused with exit 2 before anything launches; ordinary commands create no run; startTask( appears only in src/cli.ts and src/core/task-run.ts and no skill mentions task start"
    requirement: AUTO-01
    verification:
      - kind: integration
        ref: "test/task-cli.test.ts (task start refusal, consumed/foreign digest, drift and source-scan tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Editing an approved contract's goal makes task start --apply exit 2 naming goal, the new digest and alpha-aos task approve"
    requirement: CON-03
    verification:
      - kind: integration
        ref: "test/task-cli.test.ts (drifted digest test)"
        status: pass
    human_judgment: false
  - id: D4
    description: "task report shows the D-13 table plus consent, decisions with rationale, GSD evidence, changed paths, the executor claim labelled not evidence and both reviewer session ids"
    requirement: CON-02
    verification:
      - kind: integration
        ref: "test/task-cli.test.ts (extended task report test)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real Codex GSD quick run and a fresh Claude review reach accepted through the CLI on one artifact digest (14-06-02)"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "test/task-tracer.integration.ts#a real Codex GSD quick run and a fresh Claude review accept a correct inventory-summary CLI"
        status: fail
    human_judgment: true
    rationale: "NOT PROVEN on this host: live invocation 1 (run munx7h9w-b9ec114f) ended blocked because Codex workspace-write keeps .git read-only, so GSD quick cannot commit. Deferred by user decision D."
  - id: D6
    description: "A real success-claiming defect is rejected by measurement and its real review is refused as stale on a changed artifact (14-06-03)"
    requirement: REV-01
    verification: []
    human_judgment: true
    rationale: "NOT PROVEN: Task 3 not executed because its precondition (an accepted Task 2 run) is unmet; tests not written; zero live turns spent."

duration: 115min
completed: 2026-09-30
status: halted
---

# Phase 14 Plan 06: Task Start and Live Vertical Tracer Summary

**`alpha-aos task start` now exists. Without `--apply` it is a write-free readiness preview. With `--apply` it is the only path to the supervisor, and it accepts only the task's own approved, unconsumed digest. `task report` shows the full evidence of a run. The live proof did not pass on this host: the one real Codex GSD quick run wrote a correct CLI but ended `blocked`, because Codex's `workspace-write` sandbox keeps `.git` read-only and GSD quick cannot commit. By user decision D, RUN-01's live proof (14-06-02) and the defect/stale proof (14-06-03) are recorded NOT PROVEN, and the `.git` write authority is deferred.**

## Performance

- **Duration:** about 1h 55m, including the 10m47s live invocation and the checkpoint.
- **Started:** 2026-09-30T09:33Z
- **Completed:** 2026-09-30T10:30Z (continuation)
- **Tasks:** 1 of 3 complete. Task 2 is blocked and NOT PROVEN. Task 3 was not executed.
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments
- **`task start` without `--apply`:** calls `assertTaskStartable`, `listTaskRuns`, `probeTaskAgentPair`, `probeGsdQuickReadiness` and `readTaskBaseline`, and prints the result through `formatTaskStartReadiness`. It writes nothing. It exits 2 when:
  - the pair is unsupported
  - GSD is not ready
  - the baseline is not clean
  - the approval is already consumed
- **`task start --apply`:** without a digest it refuses and names the current digest and the start command. With a digest it calls `startTask(... ports: nativeTaskPorts())`, which is the only non-test call site. Exit codes: 0 accepted, 1 not accepted, 2 refused.
- **Approve output:** now ends with the exact start command.
- **`formatTaskRunReport`:** now also shows Consent, Decisions, GSD evidence, Changed paths, `Executor claim (not evidence)`, the reviewer's requested and observed sessions, Out-of-scope suggestions, Stop reason and Next action.
- **Tests:** `test/task-cli.test.ts` has 19 tests, including the negative controls:
  - every readiness and `--apply` refusal runs with an empty PATH
  - consumed, foreign and drifted digests are refused
  - ordinary commands create no `tasks` directory
  - a source scan finds `startTask(` in exactly two files
  - no skill mentions `task start`
- **Live tracer harness:** `test/task-tracer.integration.ts` goes through the compiled CLI with a scratch `ALPHA_AOS_STATE_DIR` and a `liveTaskEnvironment` limited to declared names. It fails with `NOT PROVEN:` when the pair or GSD is missing and never skips. It is not part of `npm test`.
- **Research assumption A3 is proven:** `codex exec` drove the installed `$gsd-quick` and produced the quick PLAN, a valid 5-entry decision log, a correct implementation and passing tests.

## Task Commits

1. **Task 1: Start a task only by its own approved digest from the CLI, and show the full evidence report** (complete)
   - `240629a` test(14-06): add failing tests for task start, its refusals and the extended run report (RED)
   - `a57f08c` feat(14-06): start a task only by its own approved digest and show the full evidence report (GREEN)
2. **Task 2: Live tracer: a real Codex GSD quick run and a fresh Claude review accept a correct CLI** (BLOCKED, NOT PROVEN)
   - `efbbf86` test(14-06): add the explicitly invoked live vertical tracer and its live environment policy
   - `c93decf` test(14-06): add failing test for GSD quick's dispatch-isolation sentinel in the effect audit (RED, Rule 1)
   - `2d8a014` fix(14-06): treat GSD quick's dispatch-isolation sentinel as GSD workflow state in the effect audit (GREEN, Rule 1)
   - `d118a61` docs(14-06): record the live tracer as NOT PROVEN on this host and defer the .git write authority
3. **Task 3: Live tracer: a real success-claiming defect is rejected and its real review is refused on a changed artifact:** NOT EXECUTED. Its precondition is unmet, and no commit or live turn was spent.

## Files Created/Modified
- `src/cli.ts`: the `task start` preview/apply branch, the local `taskStartCommand`, HELP text, and the approve output ending with the start command
- `src/format.ts`: `formatTaskStartReadiness` and the extended run report sections
- `src/core/task-run.ts`: the `TaskStartReadiness` interface the readiness preview builds and formats
- `src/core/task-effects.ts`: `GSD_RUNTIME_STATE_PATHS` classification
- `test/task-cli.test.ts`: 19 tests
- `test/task-effects.test.ts`: regression test for the sentinel and for other `.gsd` paths
- `test/helpers/task-fixture.ts`: `liveTaskEnvironment` and `seededDefectContract` (the latter is ready for Task 3 and not yet used)
- `test/task-tracer.integration.ts`: the live accept test, plus a status header that records NOT PROVEN on this host
- `.planning/phases/14-contract-and-vertical-tracer/14-VALIDATION.md`: 14-06-01 green; 14-06-02 and 14-06-03 NOT PROVEN, with a "14-06 Live Tracer Evidence" section

## Live Invocations

The accept test was invoked 1 of 3 times. The defect/stale verify command was invoked 0 of 2 times.

### Invocation 1 (accept test, the only live run)
- **Command:** `npm run build && node scripts/run-tests.mjs --test-name-pattern="accept a correct" --files dist/test/task-tracer.integration.js`
- **Result:** `not ok 1`, `task start exited 1 with status blocked` (`1 !== 0`). Counts: `# pass 0`, `# fail 1`, `# skipped 0`. The test took 646 s and the invocation about 10m47s.
- **Run:**
  - run id `munx7h9w-b9ec114f`
  - contract `inventory-summary`, revision 1, digest `c979926b9c1fb06d09ac9f1097deb276b24c8aa066597a3708195be71c828a2b`
  - started 2026-09-30T09:46:18.548Z, finished 09:56:57.115Z, deadline 10:46:18.548Z
  - fixture base commit `a00416063c5cd3c1f1f386f7004421264cab030c`
- **Executor:**
  - codex `0.158.0` (`@openai/codex/bin/codex.js` in the npm global root)
  - session `01a0f1b5-34d5-7371-aae8-66c4f87502fb`
  - exitCode 0, processCode `ok`, terminal `completed`
- **Executor claim (not evidence):**
  - status `needs-authority`, gsdQuickId `260930-q4s`
  - authorityRequest effect: `local-commit requiring write access to .git`
  - authorityRequest reason: "Git could not create .git/index.lock because this run has read-only access to .git."
  - summary: "Implemented the inventory summary CLI and tests; all 5 tests pass. GSD cannot finish because the sandbox denies writes to .git, blocking the required local commits. The quick plan and code are preserved; no completion summary or STATE.md row was recorded."
- **Outcome:**
  - status `blocked`
  - stopReason `new-authority-required: local-commit requiring write access to .git`
  - nextAction: "Revise the contract as revision 2 with the needed authority, preview it, and approve it; this run is not accepted."
- **GSD evidence:** `not-run`: quickId null, no plan/summary path, no STATE row, no commits, `missing: []`. The blocked path stops before verification.
- **Reviewer, verdict, artifact, measurement:** all null. A blocked run is neither measured nor reviewed, so no Claude session id or version was recorded.
- **Effects:**
  - implementation `bin/inventory-summary.mjs`, `test/inventory-summary.test.mjs`
  - planning `.planning/quick/260930-q4s-implement-dependency-free-node-esm-inven/260930-q4s-PLAN.md`
  - violation: workspace-write `.gsd/dispatch-isolation-sentinel.json` ("outside the approved roots"), fixed by 2d8a014
  - dependencyChanged false, no pack checkpoint
- **Decisions:** 5, decision log `valid`:
  - d1 gsd-default: standard quick mode without optional phases
  - d2 file-layout: `bin/inventory-summary.mjs` and `test/inventory-summary.test.mjs`
  - d3 implementation: line-oriented CSV with BigInt sum
  - d4 verification: node:test subprocess assertions
  - d5 implementation: a malformed header is invalid-quantity at line 1, and whitespace-only lines are skipped

### Root causes
1. **Fixed (Rule 1).** Installed GSD quick writes `.gsd/dispatch-isolation-sentinel.json` in the project root on every dispatch-isolation query. The effect audit classified it as a workspace-write violation. A real GSD run would therefore always be blocked on this file, even with commit access. The fix classifies exactly that path as GSD runtime state.
2. **Unresolved (security boundary).** Codex `workspace-write` keeps the project `.git` and the resolved gitdir read-only on every platform by design (Context7 `/openai/codex` docs). The Windows restricted-token backend documents no way to reopen a path for writing beneath a read-only carveout.
   - This was reproduced deterministically with `codex sandbox`, without model turns: `git add` fails with `.git/index.lock: Permission denied`.
   - `-c sandbox_workspace_write.writable_roots=['<repo>/.git']` is still denied, even though the same setting does apply to paths outside TEMP.
   - `--add-dir`/`writable_roots` therefore cannot fix it on Windows. Every available fix changes the controller security boundary (T-14-23..28, T-14-41) or the RUN-01 evidence design.

### Checkpoint and user decision
The executor stopped at a blocking-human decision with four options:
- **A:** an exec-policy allow rule for exact `git add`/`git commit` prefixes
- **B:** the supervisor commits on the controller's behalf (violates RUN-01/T-14-34)
- **C:** a commit-less bootstrap
- **D:** record NOT PROVEN and defer

**The user chose D.** Nothing in the sandbox arguments, exec policy, supervisor commit behaviour or 14-05 GSD evidence contract was changed, and no further live turn was spent.

## Decisions Made
See `key-decisions` in the frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The effect audit treated GSD quick's dispatch-isolation sentinel as a violation**
- **Found during:** Task 2, live invocation 1
- **Issue:** `.gsd/dispatch-isolation-sentinel.json` is written by installed gsd-tools on every dispatch-isolation query. It was classified as `workspace-write` outside the approved roots, which would block every real GSD quick run.
- **Fix:** `GSD_RUNTIME_STATE_PATHS` classifies exactly that file with `.planning` as gsd-quick state. Any other `.gsd` path is still a violation.
- **Files modified:** src/core/task-effects.ts, test/task-effects.test.ts
- **Verification:** the regression test in the task-effects suite, which was RED at c93decf and is GREEN at 2d8a014
- **Committed in:** c93decf, 2d8a014

### Plan stops (not auto-fixed)
- **Task 2 stopped after 1 of its 3 bounded invocations**, at a blocking-human decision. The remaining cause is an architectural and security-boundary question (Rule 4), not a bug in an owning module. A second invocation could not succeed without changing that boundary.
- **Task 3 not executed:** its `<precondition>` (Task 2's live test passed) is unmet.

---

**Total deviations:** 1 auto-fixed (Rule 1), 1 Rule 4 checkpoint resolved by user decision D.
**Impact on plan:**
- The CLI surface and the negative controls (ROADMAP Phase 14 criterion 1 and the drift refusal) are complete.
- ROADMAP Phase 14 criteria 2-5 have no live evidence on this host.

## Requirements
- **Marked complete:** AUTO-01, AUTO-03, CON-01 and CON-03. Offline CLI tests prove them without any live run:
  - explicit start only
  - consumed and foreign digests refused
  - ordinary commands create no run
  - the readiness preview
  - drift names the changed fields
- **NOT marked complete, remaining unproven:**
  - **RUN-01:** no accepted real run
  - **REV-01:** no real review or measurement, and no stale substitution
  - **AUTO-02:** the live authority/consent path is only half-exercised. Invocation 1 did pause on new authority as designed, but the plan's proof of consent inside an accepted run is missing.
- ROADMAP Phase 14 cannot claim criteria 2-5 or the bootstrap pair on this host.

## Deferred Items
- **`.git` write authority for GSD quick under the Codex controller:** without it, a real GSD-governed run cannot record its required commits inside `workspace-write` on this host. Target: Phase 16/17 (together with GSD-04 hook-receipt provenance) or a sealed/container adapter. When it is resolved, re-run 14-06-02 and then 14-06-03 (Task 3 must first write the defect and stale tests) and update 14-VALIDATION.md.

## Issues Encountered
- Known limitation: the live accept test fails on this Windows host until the deferred item is resolved. Its header states this, and no assertion was relaxed.

## Verification
- `npm run check`: exit 0, no `error TS`.
- The eight task suites (task-cli, task-run, task-effects, task-gsd, task-agents, task-check, task-verdict, task-contract): 143 pass, 0 fail, 0 skipped, 67 s.
- Full suite (`node scripts/run-tests.mjs`): 1095 tests, 1084 pass, 1 fail, 10 skipped, 481 s.
  - The one failure was `preview.test.js` "a wrapper refuses without a verified build artifact and delegates with one". It reported `changed input: test/task-tracer.integration.ts`, because the tracer's status header was edited after the build the suite was running on. That is a stale build caused by this execution, not a defect.
  - After `npm run build`, the preview suite passed 11 of 11.
  - The known `tarball-fixture` and `lifecycle.test.ts` load flakes did not appear.
- Acceptance checks for Task 1:
  - `node dist/src/cli.js --help` contains `alpha-aos task start`
  - `nativeTaskPorts()` appears on one line in src/cli.ts
  - `startTask(` appears only in src/core/task-run.ts and src/cli.ts
  - `export function formatTaskStartReadiness` appears once
  - task-cli has 19 tests
- Task 2: `grep -n 'NOT PROVEN:' test/task-tracer.integration.ts` finds lines, and `skip(` appears 0 times. The live test itself is red (NOT PROVEN).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 14 verification must treat 14-06-02 and 14-06-03 as NOT PROVEN. RUN-01 and REV-01 remain open, together with the live half of AUTO-02.
- The deferred `.git` write-authority question blocks the live vertical tracer on this host. Everything else in the task pipeline is covered by offline suites.

---
*Phase: 14-contract-and-vertical-tracer*
*Completed: 2026-09-30 (halted at Task 2 by user decision D)*

## Self-Check: PASSED

All referenced files exist (test/task-tracer.integration.ts, src/cli.ts, src/format.ts, src/core/task-effects.ts, this SUMMARY). Commits 240629a, a57f08c, efbbf86, c93decf, 2d8a014 and d118a61 are present; `git rev-list --count fad4c07..HEAD` is 6 before the metadata commit. Self-check covers the record, not the live proof: 14-06-02 and 14-06-03 remain NOT PROVEN.
