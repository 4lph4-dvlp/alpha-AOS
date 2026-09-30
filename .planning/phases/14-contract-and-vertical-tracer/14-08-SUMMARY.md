---
phase: 14-contract-and-vertical-tracer
plan: 08
subsystem: autonomous-work
tags: [task-run, codex, claude, live-tracer, git-authority, guards, checkpoint-reached, not-proven, node-test]

requires:
  - phase: 14-07
    provides: "controller git authority, alpha-aos-task permission profile, git-dir-profile option"
provides:
  - "src/core/task-git.ts: TASK_GIT_CONTROL_MAX_FILES, snapshotGitControl, labels pointer:.git, git:config, git:hooks/<path>, git:info/<path>"
  - "src/core/task-gsd.ts: rev-list in GIT_READ_SUBCOMMANDS"
  - "src/core/task-run.ts: TaskRunRecord.gitDirectory, the approval-bound dispatch value, control-file guard (blocked, nextAction to inspect), history guard (detail 'history rewritten')"
  - "schemas/task-receipt.schema.json: optional task-run property gitDirectory"
  - "src/format.ts: report line `Git directory granted to the controller: ...`"
  - "test/task-tracer.integration.ts: live tracer accept (passed), defect and stale review tests (NOT PROVEN)"
  - ".planning/STATE.md: deferred items rows for T-14-50, T-14-51, T-14-54"

actuals:
  tasks: 3
  plan_head_before: 36bffae3c0be85055b8e9185a6fc576a0846ec56
---

# Plan 14-08 Summary: Live Execution Proof and Guards

## Task 1: Offline Guards and Deferred Items (Completed & Committed)

- Added git control snapshotting (`snapshotGitControl`) covering `.git` pointer/marker, `config`, and all files under `hooks/` and `info/` up to `TASK_GIT_CONTROL_MAX_FILES` (64).
- Added pre-dispatch and post-run control-file tamper detection in `startTask`. Any alteration terminates the run as `blocked` with reason `new-authority-required: local-commit`, logs `local-commit` effect violations for each changed label, and prevents any further git commands from running in that directory.
- Added history rewrite detection using read-only `git rev-list --count <baseCommit> --not HEAD`. If reachable commit count from base is not 0, blocks with `the base commit <hex> is no longer reachable from HEAD (history rewritten)`.
- Dispatches `approval.gitDirectory` bound during `assertTaskStartable` rather than recomputing it.
- Added `gitDirectory` property to `TaskRunRecord`, schema, and `formatTaskRunReport`.
- Added 3 deferred items to `.planning/STATE.md` (T-14-50, T-14-51, T-14-54).
- Verified with 172 tests across 9 suites in `dist/test/task-*.test.js`.
- Committed in `db90807`.

## Task 2: Live Tracer Accept (Completed & Recorded)

- **Test**: `a real Codex GSD quick run and a fresh Claude review accept a correct inventory-summary CLI`
- **Result**: Passed on Invocation 1 (`ok 1`, duration 925.8s, CLI duration 919.08s).
- **Run ID**: `muoc4fm2-00d54647`
- **Status**: `accepted`
- **Executor**: `codex-cli 0.158.0` (`~\AppData\Roaming\npm\node_modules\@openai\codex\bin\codex.js`), session `01a0f333-7867-7d21-8580-280de5ce53bd`, exit 0, processCode `ok`, terminal `completed`
- **Reviewer**: `2.1.285 (Claude Code)` (`~\.local\bin\claude.EXE`), session `d86bd6b6-b9cd-43ac-802a-e3b917de573a` (requested matching)
- **Contract Digest**: `9b99a6de59328f967fc4f4b595b82a9ef5b903121ff39445c4d322f30ff571fc`
- **Artifact Digest**: `a5b47fda589ec0fc1ff0cb521a98398e9807ed23a58d593400a42efb85bff748`
- **GSD Quick**: id `261001-2gr`, status `verified`, commit `347e3d20ab4aa0cb1d6c0bcc0d54585e3ad827d7` (`docs(quick-261001-2gr): Implement inventory-summary Node ESM CLI...`)
- **Granted Git Directory**: `C:\Users\alpha\AppData\Local\Temp\alpha-aos-task-fixture-XwlwqG\inventory-summary\.git`
- **Decisions**: 5 valid recorded decisions.
- **Verdict**:
  - `invalid-quantity`: pass (measured pass exit 2, review pass)
  - `valid-summary`: pass (measured pass exit 0, review pass)
- **Validation**: `14-VALIDATION.md` row `14-06-02` updated to `✅ green`.

## Task 3: Live Tracer Defect & Stale Review (CHECKPOINT REACHED)

### Invocation 1 Diagnostics

- **Command**: `npm run build && node scripts/run-tests.mjs --test-name-pattern="rejected by measurement|refused as stale" --files dist/test/task-tracer.integration.js`
- **Result**: Failed (`not ok 1`, duration 399.78s).
- **Run ID**: `muocvg3p-28eb5efd`
- **Claim**: `null` (none)
- **Exit Code**: `1` (processCode: `non-zero-exit`, terminal: `failed`)
- **GSD Status**: `missing`
  - Missing evidence: `.planning/quick/261001-2ym-implement-dependency-free-inventory-summ/261001-2ym-SUMMARY.md`, `.planning/STATE.md row for 261001-2ym`, `a docs(quick-261001-2ym) commit after the base commit`
- **Measured Details**:
  - `valid-summary`: outcome `unavailable`, cause `entry-missing` ("The measurement entry bin/inventory-summary.mjs does not exist in the artifact.")
  - `invalid-quantity`: outcome `unavailable`, cause `entry-missing` ("The measurement entry bin/inventory-summary.mjs does not exist in the artifact.")
- **Review Issues**:
  - Reviewer: Claude Code session `21cea6b8-f17c-4489-9320-276847e6e85a`
  - Verdicts: `unknown` on both criteria due to missing entry
  - Evidence: "The snapshot has only two files: package.json ... and README.md ... There is no bin/ directory, so the contract entry bin/inventory-summary.mjs is missing."
  - Suggestions: "Create bin/inventory-summary.mjs. The artifact currently has no implementation at all, only package.json and README.md."
- **Diagnosis**: Codex controller initialized GSD quick and created the plan file, but exited prematurely with exit code 1 after 398s without writing code or completing GSD quick.

### Invocation 2 Diagnostics

- **Command**: `node scripts/run-tests.mjs --test-name-pattern="rejected by measurement|refused as stale" --files dist/test/task-tracer.integration.js`
- **Result**: Failed (`not ok 1`, duration 39.58s).
- **Run ID**: `muodkk0y-cee5a0b7`
- **Claim**: `null` (none)
- **Exit Code**: `1` (processCode: `non-zero-exit`, terminal: `failed`)
- **GSD Status**: `missing`
  - Missing evidence: `no new .planning/quick directory was created after the base commit`
- **Measured Details**:
  - `valid-summary`: outcome `unavailable`, cause `entry-missing` ("The measurement entry bin/inventory-summary.mjs does not exist in the artifact.")
  - `invalid-quantity`: outcome `unavailable`, cause `entry-missing` ("The measurement entry bin/inventory-summary.mjs does not exist in the artifact.")
- **Review Issues**:
  - Reviewer: Claude Code session `42e3622d-d925-4489-9f1e-62a73f9d963a`
  - Verdicts: `unknown` on both criteria
  - Evidence: "The snapshot contains only README.md ... and package.json ... There is no bin/ directory and no bin/inventory-summary.mjs..."
- **Test Errors**:
  - Test 1: `Error: NOT PROVEN: D-11 condition not exercised (run muodkk0y-cee5a0b7, claim none, exitCode 1, gsd missing)`
  - Test 2: `Error: NOT PROVEN: no real review report to substitute (claim status is none)`

## ## CHECKPOINT REACHED

Per Plan 14-08 Task 3 Action 3:
- Live invocations of the defect/stale verify command are strictly bounded to two in this plan's execution.
- Both invocations have been executed and recorded.
- Neither invocation exercised the D-11 condition (Codex controller claimed success on defective implementation) due to non-zero exit code 1 before code creation.
- Therefore, the plan stops with `## CHECKPOINT REACHED`:
  - Recorded: `NOT PROVEN: D-11` and `NOT PROVEN: stale-review substitution`.
  - `14-VALIDATION.md` row `14-06-03` and `14-08-03` set to `⛔ NOT PROVEN`.
  - Requirements RUN-01 (defect rejection path), REV-01 (stale rejection path), and live AUTO-02 are not claimed as proven for these cases.
  - The tests remain in place with strict assertions; neither assertions nor planted values were weakened or bypassed.

## Suite Verification & Check

- `npm test`: 1124 tests, 1114 pass, 0 fail, 10 pre-existing skips (duration ~870s).
- `npm run check`: exit 0, no TypeScript compilation or type errors.

## T-14-54 Ledger: Codex Trusted-Project Config Entries

Config file: `~/.codex/config.toml`

| Event | Fixture Count (`alpha-aos-task-fixture-`) | Header Count (`[projects.]`) | Fixture Delta | Status |
|-------|-------------------------------------------|------------------------------|---------------|--------|
| Baseline (before 14-08) | 1 | 13 | - | Baseline from 14-06 |
| After Task 2 Invocation 1 (Accept) | 2 | 14 | +1 | Within bound (<= 1) |
| After Task 3 Invocation 1 (Defect) | 3 | 15 | +1 | Within bound (<= 1) |
| After Task 3 Invocation 2 (Defect) | 4 | 16 | +1 | Within bound (<= 1) |

- **Summary of T-14-54 residual entries**:
  - Baseline count: 1
  - Final count after 14-08: 4
  - Total entries left behind by 14-08: +3 entries (1 accept + 2 defect).
  - All invocations remained strictly within the +1 bound per invocation (total delta 3 <= 5 bound).
  - In accordance with Plan 14-07 and Plan 14-08 policy, no user config entries were removed.
