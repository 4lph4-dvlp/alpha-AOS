---
phase: 14-contract-and-vertical-tracer
plan: 03
subsystem: autonomous-work
tags: [task-run, measurement, snapshot, verdict, reviewer, reproduction, decision-log, stale-artifact, node-test]

requires:
  - phase: 14-01
    provides: "startTask pipeline, TaskMeasurement/TaskVerdictRow/ReviewRequest types, task-receipt and task-review schemas, task-fixture helper"
  - phase: 14-02
    provides: "Load-time contract authority: entries inside allowed roots, no .git/.planning/.alpha-aos roots, canonical criterion order"
provides:
  - "src/core/task-check.ts: TASK_ARTIFACT_LIMITS, collectTaskArtifact, materializeTaskSnapshot, measureTaskCriterion, selectMeasurementSubstitutes, confirmReviewerReproduction, TaskDecision, TaskMeasurementSubstitute"
  - "src/core/task-verdict.ts: assessTaskReview, reduceTaskVerdict, taskNextAction, TaskPrecondition, TaskVerdict, TaskReviewAssessment"
  - "readTaskDecisionLog in task-run.ts; TaskMeasurement cause/measuredBy/substituteDecisionId; row review confirmed/confirmationDetail; run decisions/decisionLog; verdict.preconditions"
  - "Receipt schema: stale-artifact refusal, decision and precondition objects"
affects: [14-04, 14-05, 14-06]

actuals:
  tokens: 25700
  tasks: 2
  commits: 5
plan_head_before: 36e8375805eaa60fa03c28e559008e7bd2628085

tech-stack:
  added: []
  patterns:
    - "Measure and review an exclusive snapshot copy whose re-collected digest must equal the collected digest; re-hash project and snapshot after review"
    - "Pure verdict module (no fs, no process) fed by evidence values; the pipeline owns all I/O"
    - "Controller-written files are untrusted data: closed shape, bounds, credential check, one bad line invalidates the whole log"

key-files:
  created:
    - src/core/task-check.ts
    - src/core/task-verdict.ts
    - test/task-check.test.ts
    - test/task-verdict.test.ts
  modified:
    - src/core/task-run.ts
    - schemas/task-receipt.schema.json
    - test/task-run.test.ts

key-decisions:
  - "TASK_ARTIFACT_DIGEST_KIND now lives in task-check.ts and is re-exported from task-run.ts, so task-check never imports task-run at runtime (no circular import); the digest value is unchanged"
  - "The artifact manifest carries its normalized allowedRoots so materializeTaskSnapshot can re-collect the copy with the same roots"
  - "A link at or above an allowed root (not only inside it) is artifact-link; a Windows directory junction counts as a link"
  - "An advisory reviewer fail, a fail with no reproduction and an unconfirmed reproduction all reduce to unknown with the unconfirmed-fail next action; only a confirmed blocking reproduction rejects"
  - "With a stale-artifact refusal, measured-pass rows become unknown while measured-fail rows stay fail"
  - "decisionLog is null until the log is read (the executing record), so the key stays required without inventing a status"
  - "Verdict rows follow the sorted contract criterion ids, which changed the 14-01 task-run expectation to invalid-quantity first"

patterns-established:
  - "Interface-skeleton RED: a new module lands as typed signatures that throw, so the suite compiles and the named target test fails on behavior"

requirements-completed: [REV-01, CON-02, RUN-01]

coverage:
  - id: D1
    description: "Criteria are measured on an exact snapshot whose digest equals the collected artifact digest, and the reviewer gets that snapshot as reviewRoot"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "test/task-check.test.ts#the snapshot holds exactly the manifest files and re-collects to the same digest"
        status: pass
      - kind: integration
        ref: "test/task-run.test.ts#an approved contract with a correct implementation and a passing review is accepted"
        status: pass
    human_judgment: false
  - id: D2
    description: "Measurements that cannot run are unavailable with a named cause (entry-missing, timeout, output-capped, spawn-failed), and their rows are unknown with a fixed next action"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "test/task-check.test.ts#a program that outlives the measurement bound is unavailable with cause timeout"
        status: pass
      - kind: unit
        ref: "test/task-check.test.ts#a program printing more than 64 KiB is unavailable with cause output-capped"
        status: pass
      - kind: unit
        ref: "test/task-verdict.test.ts#an unavailable measurement is unknown even with a review pass and names its next action"
        status: pass
    human_judgment: false
  - id: D3
    description: "A reviewer fail overturns a measured pass only when alpha-AOS reproduces it with the contract entry; a fabricated observation is unknown"
    requirement: REV-01
    verification:
      - kind: integration
        ref: "test/task-verdict.test.ts#an overfit program with a reproduction it really exhibits is rejected with both records"
        status: pass
      - kind: integration
        ref: "test/task-verdict.test.ts#the same overfit run with a fabricated observation is unknown, not rejected"
        status: pass
    human_judgment: false
  - id: D4
    description: "Stale review bindings and artifact changes during review are refused and never accepted"
    requirement: REV-01
    verification:
      - kind: unit
        ref: "test/task-verdict.test.ts#a review bound to another request, contract, artifact or session is stale and refused"
        status: pass
      - kind: integration
        ref: "test/task-verdict.test.ts#a project file changed before the review returns is refused as stale-artifact"
        status: pass
    human_judgment: false
  - id: D5
    description: "The controller decision log is copied into the run record, or recorded absent/invalid with its line number; substitutes can only relocate the entry"
    requirement: CON-02
    verification:
      - kind: integration
        ref: "test/task-verdict.test.ts#a valid decision log is copied into the run record"
        status: pass
      - kind: integration
        ref: "test/task-verdict.test.ts#a decision that tries to carry an input or expectation is refused as invalid"
        status: pass
      - kind: integration
        ref: "test/task-verdict.test.ts#a valid measurement-substitute decision measures a missing-entry criterion through its entry"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-09-30
status: complete
---

# Phase 14 Plan 03: Evidence Model and Verdict Reduction Summary

**Each criterion is measured on an exact artifact snapshot. Every non-measurable case is a named unknown with a fixed next action. A measured pass is overturned only when alpha-AOS reproduces the reviewer's finding with the contract entry. A stale review or a changed artifact is refused. The controller's decision log is recorded, and a decision can only relocate a measurement entry.**

## Performance

- **Duration:** about 25 min
- **Started:** 2026-09-30T04:36:35Z
- **Completed:** 2026-09-30T05:01:45Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- `collectTaskArtifact` builds a sorted path and hash manifest. It skips `.git`, `.planning`, `.alpha-aos` and `node_modules`. It is capped at 2000 files and 16 MiB. It refuses a link at or above an allowed root. `materializeTaskSnapshot` copies exactly the manifest into an exclusive directory, then proves the copy re-collects to the same digest.
- `measureTaskCriterion` runs `process.execPath` on the contract entry inside the snapshot. The call has a 30 s bound (overridable) and a 64 KiB output cap. It returns `cause` `entry-missing`, `timeout`, `output-capped` or `spawn-failed`, or `none` when the program ran. The detail is one bounded sentence that names the first mismatch, for example `stdout JSON differs at /totalQuantity: expected 10, got 11`.
- Measurement substitutes carry only `{decisionId, criterionId, entry}`. One is used only when the contract entry is absent, and only for a path inside the allowed roots. The contract's expectations still decide the outcome.
- `confirmReviewerReproduction` writes the reviewer's input text to a scratch file and runs the contract entry. It never runs anything the reviewer names. It confirms only when the exit code and stdout match what the reviewer observed.
- `task-verdict.ts` is pure (no fs, no process):
  - `assessTaskReview` returns `stale` on a requestId, contractId, contract digest, artifact digest or session mismatch. It returns `malformed` on a duplicate or unknown id or on text over its bound, and `missing` on a null report.
  - `reduceTaskVerdict` applies the REV-01 truth table and orders rows by sorted criterion id.
  - `taskNextAction` gives the fixed D-15 sentences.
- `startTask` pipeline, in order:
  1. Read the decision log.
  2. Select substitutes.
  3. Collect the artifact and snapshot it.
  4. Measure the snapshot.
  5. Review the snapshot.
  6. Assess the report.
  7. Confirm reproductions.
  8. Re-hash both the project and the snapshot.
  9. `reduceTaskVerdict` (one call site).

  The record now carries `decisions`, `decisionLog`, `verdict.preconditions` and `review.confirmed`/`confirmationDetail`.
- `readTaskDecisionLog` refuses links anywhere on the log path, logs over 256 KiB or 200 lines, non-UTF-8 text, and shape errors, including extra fields on `substitute`. It also refuses credential-shaped values and repeated ids. It names the first bad line and returns no entries.

## Task Commits

1. **Task 1: Measure every criterion on an exact artifact snapshot, with named unavailability and entry-only substitutes**
   - `f5da0c3` test(14-03): failing tests and task-check.ts signature skeleton (RED)
   - `65643b3` feat(14-03): snapshot measurement, causes, substitutes, schema (GREEN)
   - `d9a9f32` refactor(14-03): drop the RED-phase cast alias in the suite
2. **Task 2: Reduce per-criterion verdicts with confirmed reproductions, stale refusals, named unknowns and recorded decisions**
   - `606fe77` test(14-03): failing tests plus interface skeleton (types, schema keys with neutral values, throwing stubs) (RED)
   - `1440310` feat(14-03): task-verdict.ts, readTaskDecisionLog and pipeline rewire (GREEN)

## Files Created/Modified
- `src/core/task-check.ts`: artifact manifest, snapshot, measurement, substitute selection, reproduction confirmation
- `src/core/task-verdict.ts`: review assessment, verdict reduction, next-action sentences
- `src/core/task-run.ts`: inline walk and measurement removed (`runProcess(` count 0); decision log reader; pipeline rewired; new record fields
- `schemas/task-receipt.schema.json`: measurement `cause`/`measuredBy`/`substituteDecisionId`, review `confirmed`/`confirmationDetail`, `stale-artifact`, `preconditions`, `decisions` (max 200), `decisionLog`
- `test/task-check.test.ts`: 15 tests
- `test/task-verdict.test.ts`: 23 tests
- `test/task-run.test.ts`: row order expectation now canonical (sorted)

## Decisions Made
See `key-decisions` in the frontmatter. The most consequential: an advisory, reproduction-less or unconfirmed reviewer fail reduces to `unknown`, never `rejected` or `accepted`. This follows the plan's D-14 interpretation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Avoided a runtime circular import for TASK_ARTIFACT_DIGEST_KIND**
- **Found during:** Task 1
- **Issue:** The plan says to keep the constant in task-run.ts and import it into task-check.ts. task-run.ts imports task-check.ts at runtime, so that would create a circular import, which the project's architecture notes forbid.
- **Fix:** The constant is defined in task-check.ts and re-exported from task-run.ts (`export { TASK_ARTIFACT_DIGEST_KIND } from "./task-check.js"`). The value and the digests are unchanged. task-check and task-verdict import only types from task-run.
- **Files modified:** src/core/task-check.ts, src/core/task-run.ts
- **Commit:** 65643b3

**2. [Rule 2 - Missing critical] Link check extended to the path above an allowed root, and test coverage for Windows**
- **Found during:** Task 1
- **Issue:** Checking only inside an allowed root would still follow a linked parent directory. Also, the file-symlink test skipped on this host (EPERM).
- **Fix:** Every segment from the project root down to the allowed root is checked with lstat. The test falls back to a directory junction, which Windows creates without privilege, so the link case really runs here. The decision-log reader applies the same check to every segment of its path.
- **Commit:** 65643b3, 1440310

**3. [Rule 1 - Bug] The review-report text bound was raised from 4000 to 4096**
- **Found during:** Task 2
- **Issue:** The 14-01 `validateReport` capped every report string at 4000 characters, so a reproduction at the plan's 4096 bound could never reach `assessTaskReview`.
- **Fix:** `REPORT_TEXT_LIMIT` is now 4096. The tighter per-field bounds (evidence 2000, summary 1000, suggestions 20 × 500) are enforced in `assessTaskReview` as `malformed`.
- **Commit:** 1440310

**4. [Rule 1 - Bug] Updated the 14-01 row-order expectation**
- **Found during:** Task 2
- **Issue:** The plan requires rows in canonical sorted-id order. The 14-01 test asserted contract-file order.
- **Fix:** The expectation is now `invalid-quantity`, then `valid-summary`.
- **Commit:** 1440310

---

**Total deviations:** 4 auto-fixed (1 blocking, 1 missing critical, 2 bugs)
**Impact on plan:** All are correctness or safety adjustments. There is no scope change, and no field of the 14-01 frozen types was renamed or removed.

## TDD Gate Compliance
Both tasks have a `test(14-03)` RED commit before their `feat(14-03)` GREEN commit. One `refactor(14-03)` commit follows Task 1.

`gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both RED runs:
- **Task 1 target:** "the off-by-one implementation fails valid-summary with a detail naming totalQuantity" (15 of 15 failing).
- **Task 2 target:** "an overfit program with a reproduction it really exhibits is rejected with both records" (23 of 23 failing).

Because task-check.ts and task-verdict.ts are new TypeScript modules, each RED commit carries an interface skeleton so the suite compiles and fails on behavior rather than on a load error. The skeleton is typed signatures that throw. For Task 2 it also includes the new record keys, wired with neutral values in type and schema, so the 14-01 suites stay green.

## Known Stubs
- `src/core/task-run.ts` passes `preconditions: []` to `reduceTaskVerdict`. This is intentional: 14-05 supplies the `gsd-evidence` and `effect-audit` preconditions through `TaskPrecondition`. The reducer already makes any unsatisfied precondition `unknown`.

## Issues Encountered
- The full suite ran green: `node scripts/run-tests.mjs` reported 1026 tests, 1016 pass, 0 fail, 10 skipped. The known `tarball-fixture` host-cache flake did not appear in this run.

## Verification
- `npm run build && node scripts/run-tests.mjs --files dist/test/task-verdict.test.js dist/test/task-check.test.js dist/test/task-run.test.js dist/test/task-cli.test.js`: 55 pass, 0 fail, 0 skipped.
- `npm run check`: exit 0, no `error TS`.
- Acceptance greps:
  - the task-check export count is 5
  - `measureTaskCriterion(` appears in task-run.ts
  - `runProcess(` appears in task-run.ts 0 times
  - `"stale-artifact"` appears once in the schema
  - the task-verdict export count is 3
  - node:fs, node:child_process and runProcess appear in task-verdict.ts 0 times
  - `reduceTaskVerdict(` has exactly one call site
  - `export async function readTaskDecisionLog` appears once

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 14-04 can implement ControllerPort/ReviewerPort unchanged. The reviewer now receives `reviewRoot` = snapshot, and its report's session id must equal `request.sessionId`.
- 14-05 supplies preconditions through `TaskPrecondition`, and 14-06's live tracer can require at least one recorded decision (`decisionLog.status === "valid"`, `decisions.length > 0`).

---
*Phase: 14-contract-and-vertical-tracer*
*Completed: 2026-09-30*
