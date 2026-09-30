---
phase: 14-contract-and-vertical-tracer
plan: 05
subsystem: autonomous-work
tags: [task-run, gsd-quick, effect-audit, authority, dependency-checkpoint, wall-time, node-test]

requires:
  - phase: 14-03
    provides: "startTask pipeline with snapshot measurement, reduceTaskVerdict preconditions (left as an empty stub), readTaskDecisionLog"
  - phase: 14-04
    provides: "Codex controller adapter that sends request.prompt, so the GSD prompt reaches the native controller unchanged"
provides:
  - "src/core/task-gsd.ts: GSD_TASK_WORKFLOW, GSD_CONTROLLER_PROMPT_MAX_BYTES, resolveInstalledGsdTools, runGitRead, probeGsdQuickReadiness, readGsdQuickOutline, buildGsdControllerPrompt, snapshotPlanningState, verifyGsdEvidence, GsdEvidence"
  - "src/core/task-effects.ts: DEPENDENCY_LOCKFILES, DEPENDENCY_FIELDS, readTaskBaseline, readTaskChanges, auditTaskEffects, runPackCheckpoint, TaskChanges, TaskEffectAudit, TaskPackCheckpoint"
  - "startTask: gsd.configRoot option, TaskRunError dirty-baseline and gsd-not-ready, blocked (new-authority-required: <effect>) and stopped (wall-time-limit) outcomes, preconditions gsd-evidence and effect-audit"
  - "Run record keys baseCommit, deadlineAt, gsd and effects (schema and type)"
  - "Fixture: writeGsdStub, simulateGsdQuick, fixtureQuickId, gsdConfigRoot; the reference controller now leaves GSD quick evidence"
affects: [14-06]

actuals:
  tokens: 20500
  tasks: 2
  commits: 4
plan_head_before: 1a5ce625feb07b4b2e0255f5aaab7c0687bd35a6

tech-stack:
  added: []
  patterns:
    - "Supervisor reads GSD evidence and never writes it: git through a read-only subcommand allowlist, files through bounded reads"
    - "Refusals that do not depend on the run (dirty baseline, GSD not ready) happen before the first run record, so the approval survives the fix"
    - "Authority is audited on what changed after one recorded clean commit, not on what the controller claims"

key-files:
  created:
    - src/core/task-gsd.ts
    - src/core/task-effects.ts
    - test/task-gsd.test.ts
    - test/task-effects.test.ts
  modified:
    - src/core/task-run.ts
    - schemas/task-receipt.schema.json
    - test/helpers/task-fixture.ts
    - test/task-verdict.test.ts

key-decisions:
  - "The project root must be the top level of its git repository (readTaskBaseline reports not-git otherwise), so every git path and every allowed root share one base"
  - "stopReason stays exactly new-authority-required: <effect>; the offending paths live in effects.violations"
  - "A local-commit violation has an empty path, because it is not bound to a file"
  - "The run's own decision log is allowed but listed in no effects bucket; it is recorded through decisionLog"
  - "The wall-time limit is checked twice: after GSD verification and again right before the reviewer is launched"
  - "The installed quick outline and the readiness probe run before the approval is consumed; an unreadable quick.md is also gsd-not-ready"

patterns-established:
  - "A controller double does its work the way a real controller must: commit the implementation, then leave GSD quick's own evidence (simulateGsdQuick)"

requirements-completed: [RUN-01, AUTO-02, CON-02]

coverage:
  - id: D1
    description: "The controller prompt binds the run to installed GSD quick (run id, contract digest, quick.md sha256), lists roots, effects and the decision-log path, and holds out every measured input and expected output"
    requirement: RUN-01
    verification:
      - kind: unit
        ref: "test/task-gsd.test.ts#the controller prompt binds the run to installed GSD quick and the approved authority"
        status: pass
      - kind: unit
        ref: "test/task-gsd.test.ts#the controller prompt holds out every measured input and expected output"
        status: pass
    human_judgment: false
  - id: D2
    description: "A dirty baseline and a project GSD quick cannot run in are refused before the approval is consumed; the host's installed gsd-tools reports the fixture ready and writes nothing"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "test/task-effects.test.ts#a dirty project is refused before the approval is consumed, and the same approval starts once it is committed"
        status: pass
      - kind: integration
        ref: "test/task-effects.test.ts#a project GSD reports without a roadmap is refused as gsd-not-ready and writes no run record"
        status: pass
      - kind: integration
        ref: "test/task-gsd.test.ts#the host's installed gsd-tools reports the seeded fixture ready and writes nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "A run is accepted only with GSD quick's own evidence; without it the gsd-evidence precondition is unmet, the run is unknown and .planning stays byte-identical"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "test/task-effects.test.ts#the reference run is accepted with verified GSD evidence and every changed path recorded"
        status: pass
      - kind: integration
        ref: "test/task-effects.test.ts#a correct implementation without GSD quick evidence is not accepted and .planning stays byte-identical"
        status: pass
    human_judgment: false
  - id: D4
    description: "A needs-authority claim, a write outside the roots or an unapproved dependency change ends the run blocked with no review"
    requirement: AUTO-02
    verification:
      - kind: integration
        ref: "test/task-effects.test.ts#a needs-authority claim ends the run blocked without a review"
        status: pass
      - kind: integration
        ref: "test/task-effects.test.ts#a write outside the approved roots ends the run blocked naming the path"
        status: pass
      - kind: integration
        ref: "test/task-effects.test.ts#a dependency change without dependency-change ends the run blocked"
        status: pass
    human_judgment: false
  - id: D5
    description: "An approved dependency change runs the read-only pack checkpoint and never writes .alpha-aos/plan.json; the wall-time limit stops a run before review"
    requirement: AUTO-02
    verification:
      - kind: integration
        ref: "test/task-effects.test.ts#an approved dependency change runs the read-only pack checkpoint and never approves a pack"
        status: pass
      - kind: integration
        ref: "test/task-effects.test.ts#a run whose approved wall time elapses before review is stopped without a review"
        status: pass
    human_judgment: false
  - id: D6
    description: "The live Codex controller can actually run the installed $gsd-quick inside codex exec (research assumption A3)"
    requirement: RUN-01
    verification: []
    human_judgment: true
    rationale: "Only the 14-06 live tracer can prove this; every test here uses a controller double"

duration: 28min
completed: 2026-09-30
status: complete
---

# Phase 14 Plan 05: GSD Quick Bridge and Effect Audit Summary

**The controller now does all project work through the installed `$gsd-quick`. alpha-AOS accepts a run only when GSD's own evidence exists: a new quick directory with its PLAN and SUMMARY, a STATE.md row, and a `docs(quick-<id>)` commit. alpha-AOS reads that evidence and never writes it. Every changed path after a recorded clean commit is checked against the approved authority. New authority blocks the run before review. An approved dependency change triggers the read-only pack checkpoint. The approved wall time stops the run before review.**

## Performance

- **Duration:** about 28 min
- **Started:** 2026-09-30T09:02:02Z
- **Completed:** 2026-09-30T09:30:38Z
- **Tasks:** 2
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments
- `buildGsdControllerPrompt` produces NFC plain text with these sections: identity, workflow (`$gsd-quick` and the quick.md sha256), task, authority, delegation (D-05), decisions (D-06), dependencies (D-07), substitutes (D-08), stop rule, final message and data rule.
  - It carries each criterion's id, title and description. It never carries the measured input or the expected JSON.
  - It is bounded to 24 KiB, and a longer prompt is refused, never truncated.
  - The dependency section changes with `dependency-change`. When the effect is allowed, the section tells the controller to run `alpha-aos project plan/status` and never approve or sync. When it is not allowed, the section forbids touching any manifest or lockfile.
- `probeGsdQuickReadiness` runs `gsd-tools query init.quick` under the Node runtime environment. It follows `@file:`. It is ready only when GSD reports both `planning_exists` and `roadmap_exists`.
- `verifyGsdEvidence` is strictly read-only. It ignores quick directories that already existed at the base commit (`git ls-tree`). It prefers the directory matching the claimed id and names every missing item.
- `runGitRead` allows only `rev-parse`, `status`, `diff`, `log`, `ls-tree` and `show`. Anything else, including a leading `-c`, is refused before a process starts.
- `startTask` now runs in this order:
  1. Run the consumed check and the pair assessment.
  2. Read a clean baseline (otherwise `dirty-baseline`).
  3. Probe GSD readiness and read the outline (otherwise `gsd-not-ready`).
  4. Write the executing record with `baseCommit` and `deadlineAt`.
  5. Snapshot `.planning`.
  6. Dispatch with the GSD prompt.
  7. Audit the changes and read the decision log.
  8. If needed, stop as blocked (`new-authority-required: <effect>`, a revision r+1 next action, no measurement and no review).
  9. Run the pack checkpoint when dependencies changed.
  10. Verify the GSD evidence.
  11. Check the wall time.
  12. Measure and check the wall time again.
  13. Review.
  14. Reduce with the `gsd-evidence` and `effect-audit` preconditions.
- `auditTaskEffects` sorts each changed path into `.planning/` (gsd-quick), this run's decision log, an allowed root, or a `workspace-write` violation. A commit without `local-commit` is a violation. A dependency change without `dependency-change` is also a violation: that means any changed lockfile, or a `package.json` whose dependency fields differ from the base commit. A parse failure counts as changed, and a `bin`-only edit does not.
- `runPackCheckpoint` calls only `planProjectCapabilities` and `reconcileProjectState` (with the host ledger). It returns the plan digest, the selected and applicable packs and the exact approve command.

## Task Commits

1. **Task 1: Drive the controller through installed GSD quick and verify GSD's evidence read-only**
   - `e6cf745` test(14-05): failing tests plus the task-gsd.ts interface skeleton and fixture GSD helpers (RED)
   - `684d4a2` feat(14-05): task-gsd.ts implementation (GREEN)
2. **Task 2: Audit every effect against the approved authority, block on new authority, checkpoint dependencies and enforce the wall-time limit**
   - `aa0e855` test(14-05): failing tests plus the task-effects.ts skeleton, record keys with neutral values, error codes and the gsd option (RED)
   - `9d72f04` feat(14-05): task-effects.ts and the rewired startTask pipeline (GREEN)

## Files Created/Modified
- `src/core/task-gsd.ts`: readiness probe, quick outline, controller prompt, planning snapshot, read-only evidence verification, git read allowlist
- `src/core/task-effects.ts`: clean baseline, changed paths, effect audit, dependency detection, read-only pack checkpoint
- `src/core/task-run.ts`: new pipeline order, blocked/stopped outcomes, the two preconditions, record keys `baseCommit`/`deadlineAt`/`gsd`/`effects`. The 14-01 `controllerPrompt` was removed.
- `schemas/task-receipt.schema.json`: the four new required run keys, plus `commit` and `violation` definitions
- `test/helpers/task-fixture.ts`: GSD stub config root and `simulateGsdQuick`. The reference controller now commits the implementation, leaves GSD quick evidence and returns its quick id. `startFixtureTask` passes `gsd.configRoot`.
- `test/task-gsd.test.ts`: 18 tests
- `test/task-effects.test.ts`: 14 tests
- `test/task-verdict.test.ts`: its controller double leaves GSD quick evidence, and the reference run asserts both preconditions

## Decisions Made
See `key-decisions` in the frontmatter. The most consequential is the top-level requirement. `git status --porcelain` reports paths relative to the repository root, while the allowed roots are relative to the project root. A project root that is only a subdirectory of its repository is therefore reported as `not-git` rather than audited against mismatched paths.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `startFixtureTask` passes `gsd` only from Task 2**
- **Found during:** Task 1
- **Issue:** The plan lists the `startFixtureTask` `gsd: { configRoot }` change under Task 1, but `StartTaskOptions.gsd` belongs to Task 2. Passing it earlier would not compile.
- **Fix:** Task 1 added the stub, `simulateGsdQuick` and the reference-controller change. Task 2's RED commit added the `gsd` option and the fixture pass-through together.
- **Commit:** e6cf745, aa0e855

**2. [Rule 1 - Bug] Updated two task-verdict expectations that the plan changes by design**
- **Found during:** Task 2
- **Issue:** The plan says the earlier suites pass unchanged, but two of them encoded the 14-03 stub:
  - The reference run asserted `preconditions: []`.
  - The `controllerDouble` in the task-verdict suite never left GSD evidence, so "a valid decision log is copied" could no longer be accepted.
- **Fix:** The reference run now asserts `gsd-evidence` and `effect-audit` both satisfied. The double now calls `simulateGsdQuick` and returns its quick id. No other expectation changed.
- **Commit:** 9d72f04

**3. [Rule 2 - Missing critical] Refuse a project root that is not the repository top level**
- **Found during:** Task 2
- **Issue:** Porcelain and diff paths are repository-relative, while the allowed roots are project-relative. In a subdirectory project, the audit would compare mismatched paths and could wave through a violation.
- **Fix:** `readTaskBaseline` checks `rev-parse --show-prefix` and returns `not-git` with a reason, and the run then fails as `dirty-baseline`.
- **Commit:** 9d72f04

**4. [Rule 2 - Missing critical] A second wall-time check right before review**
- **Found during:** Task 2
- **Issue:** Measurement alone can take up to 30 s per criterion after the first check.
- **Fix:** The deadline is re-checked immediately before the reviewer is launched.
- **Commit:** 9d72f04

---

**Total deviations:** 4 auto-fixed (1 blocking, 1 bug, 2 missing critical)
**Impact on plan:** No scope change. Every artifact, export and acceptance grep named in the plan is present.

## TDD Gate Compliance
Both tasks have a `test(14-05)` RED commit before their `feat(14-05)` GREEN commit. No refactor commit was needed.

`gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both RED runs, captured with `node --test --test-reporter=tap`:
- **Task 1 target:** "the controller prompt binds the run to installed GSD quick and the approved authority" (18 of 18 failing).
- **Task 2 target:** "a needs-authority claim ends the run blocked without a review" (14 of 14 failing; actual `unknown`, expected `blocked`).

Each RED commit carries a typed interface skeleton that throws, so the suite fails on behavior and not on a load error. In Task 2 the skeleton also includes the new record keys with neutral values, and the earlier suites stayed green on the RED commit (92 of 92).

## Known Limitations
- `git status` does not list gitignored paths. A write under an ignored path such as `node_modules/` is therefore not audited. Ignored files are also not part of the artifact.
- A previous run's decision log left untracked under `.alpha-aos/task-runs/` makes the next baseline dirty until it is committed or ignored.
- T-14-34 is accepted as planned: the controller could forge GSD artifacts. Hook-receipt provenance is GSD-04 in Phase 17.

## Issues Encountered
- Full suite (`node scripts/run-tests.mjs`): 1084 tests, 1071 pass, 1 fail, 12 skipped.
  - The failure was `lifecycle.test.ts` "MCP plan proofs are re-established after an external installer rewrites the config target", which hit an npm `timeout` under full-suite load. The same suite run alone passed 5 of 5.
  - This is an environmental flake in the npm-lifecycle family and is unrelated to the task modules.
  - The known `tarball-fixture` flake did not appear.

## Verification
- `npm run build && node scripts/run-tests.mjs --files` with the task-effects, task-gsd, task-run, task-verdict, task-check, task-cli, task-contract and task-agents suites: 132 pass, 0 fail, 0 skipped.
- The host-installed readiness test really ran here and passed. It used the Codex GSD Core under `~/.codex`, and `.planning` stayed byte-identical.
- `npm run check`: exit 0, no `error TS`.
- Acceptance greps:
  - `$gsd-quick` appears in task-gsd.ts
  - the task-gsd export count is 9
  - `"gsd-evidence"` and `"effect-audit"` appear in task-run.ts
  - `approveProjectPlan|applyProjectPackSync` appears in task-effects.ts 0 times
  - `"dirty-baseline"|"gsd-not-ready"` appears on 5 lines
  - the no-GSD test asserts `deepEqual(snapshotBefore, snapshotAfter)` and `verdict.overall !== "accepted"`
- Key links:
  - `verifyGsdEvidence(` appears in task-run.ts
  - `readGsdContext(` appears in task-gsd.ts
  - `planProjectCapabilities(` appears in task-effects.ts
- task-gsd.ts and task-effects.ts contain no file write, mkdir or git write.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 14-06's live tracer can require `run.gsd.status === "verified"` and an empty `effects.violations`. The Codex adapter already sends `request.prompt`, which is now the GSD prompt.
- The open question is research assumption A3: whether `codex exec` can run the installed `$gsd-quick` with the user's config. If it cannot, the run is reported `unknown` with the missing GSD items, never faked.

---
*Phase: 14-contract-and-vertical-tracer*
*Completed: 2026-09-30*

## Self-Check: PASSED

All four created files exist; commits e6cf745, 684d4a2, aa0e855 and 9d72f04 are present.
