---
phase: 14-contract-and-vertical-tracer
plan: 07
subsystem: autonomous-work
tags: [task-run, codex, permission-profile, git-authority, sandbox, approval, gap-closure, node-test]

requires:
  - phase: 14-04
    provides: "Codex controller adapter (codexControllerArgs, codexTaskEnvironment, runCodexController) with the fixed workspace-write vector"
  - phase: 14-05
    provides: "startTask pipeline through installed GSD quick, the effect audit and resolveInstalledGsdTools"
  - phase: 14-06
    provides: "task start, the live tracer file and the 14-06 root cause: workspace-write keeps .git read-only, so GSD quick cannot commit"
provides:
  - "src/core/task-git.ts: TASK_GIT_POINTER_MAX_BYTES, TaskGitDirectory, resolveTaskGitDirectory, grantedGitDirectory"
  - "ControllerDispatchRequest.gitDirectory; startTask dispatches grantedGitDirectory(contract, resolveTaskGitDirectory(projectRoot))"
  - "src/adapters/task-codex.ts: CODEX_TASK_PERMISSION_PROFILE (alpha-aos-task), codexGitAuthorityOverrides, writeCodexRunGitConfig; codexControllerArgs gitDirectory parameter; codexTaskEnvironment gitConfigGlobal option; the argv token --ignore-rules; the GIT_CONFIG_GLOBAL literal; the run file <scratchRoot>/codex/gitconfig"
  - "src/core/task-contract.ts: optional TaskApprovalRecord.gitDirectory, error code git-directory-changed, TaskGitAuthority, TaskContractPreview.gitAuthority"
  - "schemas/task-receipt.schema.json: optional task-approval property gitDirectory (string or null)"
  - "task preview line `Git authority (local-commit): ...` and JSON key gitAuthority"
  - "No-spend host canary: the approved git directory profile lets a sandboxed GSD commit land and keeps git control files read-only (no model turn)"
affects: [14-08, 16, 17]

actuals:
  tokens: 17800
  tasks: 3
  commits: 4
plan_head_before: c814fdab21d7767955fcd4087664282e1c160904

tech-stack:
  added: []
  patterns:
    - "Controller write authority is a named Codex permission profile built from one resolved, approval-bound git directory, never a bypass flag or an extra writable root"
    - "Every controller vector carries --ignore-rules, so ambient user/project execpolicy allow rules never run a controller command unsandboxed"
    - "The one run-scoped file a grant needs (the safe.directory gitconfig) lives in the run scratch root and reaches only the controller child as a single literal"
    - "Authority that consent covers is resolved identically by preview, approve and the start gate, and a drift refuses before any run record"

key-files:
  created:
    - src/core/task-git.ts
    - test/task-git.test.ts
  modified:
    - src/core/task-run.ts
    - src/adapters/task-codex.ts
    - src/core/task-contract.ts
    - schemas/task-receipt.schema.json
    - src/format.ts
    - src/cli.ts
    - test/task-agents.test.ts
    - test/task-contract.test.ts
    - test/task-cli.test.ts
    - test/task-tracer.integration.ts

key-decisions:
  - "Task 1 selected option id git-dir-profile (the user's genuine answer, relayed by the orchestrator): an alpha-aos-task permission profile granting only this project's git directory with config, hooks and info read-only, plus --ignore-rules on every controller vector, plus the run-scoped safe.directory GIT_CONFIG_GLOBAL. This supersedes 14-06 user decision D (defer)."
  - "Host evidence shown at the Task 1 checkpoint (codex-cli 0.158.0, elevated Windows sandbox, re-confirmed by version before presenting, so not re-measured): P1 workspace-write refuses git add (.git/index.lock Permission denied); P2 a root-only profile is still refused because Codex keeps .git read-only; P3 an explicit <repo>/.git write grant allows add and commit, including an external gitdir; P4 config/hooks/info read-only still commits while writes to them fail EPERM; P5 gsd-tools query commit needs a run-scoped GIT_CONFIG_GLOBAL safe.directory (dubious ownership otherwise); P6 sticky elevated DENY entries on previously used repositories fail closed; P7 prompt-input renders writable roots {TMPDIR, root, .git}, network restricted, and the profile beats danger-full-access; P8 default.rules allow rules run matching commands unsandboxed, so T-14-24 was false in practice; P9 codex exec forces approval never; P10 rules match tokens and --ignore-rules skips both rule layers; P11 Docker 29.7.2 and WSL2 are available."
  - "Orchestrator note: GSD's halt-propagation gate listed 14-07/14-08 as blocked_by [14-06] because 14-06-SUMMARY has status: halted; the user explicitly chose to override that gate for this gap-closure run because 14-07 Task 1 is the decision superseding 14-06 decision D. 14-06-SUMMARY.md was not edited."
  - "The run git config quotes its values (directory = \"<root>\", path = \"<global>\") so a path containing # or ; is not cut at a git-config comment character; paths with a double quote or a line break are refused"
  - "runCodexController names the canonical project root in safe.directory, because git compares it with the real path it discovers"
  - "A granted directory that cannot be expressed safely returns processCode git-authority-refused without launching Codex"
  - "An approval without gitDirectory compares as null: it still starts a project with no grantable git directory and is refused as git-directory-changed for a grantable one"

patterns-established:
  - "Pointer resolution for .git is read-only and bounded: lstat, a 4096-byte cap, no link following, linked worktrees and pointers into the root refused"

requirements-completed: [RUN-01, AUTO-02, CON-01, CON-03]

coverage:
  - id: D1
    description: "resolveTaskGitDirectory reports in-tree and external git directories as grantable and refuses missing, link, linked-worktree, pointer-inside-root, no-HEAD and 4097-byte pointers with distinct reasons"
    requirement: AUTO-02
    verification:
      - kind: unit
        ref: "test/task-git.test.ts#every not-grantable shape reports a distinct reason"
        status: pass
      - kind: unit
        ref: "test/task-git.test.ts#a linked worktree is not grantable and its reason names the shared common directory"
        status: pass
    human_judgment: false
  - id: D2
    description: "startTask dispatches the canonical git directory only for an approved local-commit contract with a grantable directory"
    requirement: AUTO-02
    verification:
      - kind: unit
        ref: "test/task-git.test.ts#startTask dispatches the canonical git directory of an approved local-commit contract"
        status: pass
      - kind: unit
        ref: "test/task-git.test.ts#the git directory is granted only for a grantable resolution under an approved local-commit effect"
        status: pass
    human_judgment: false
  - id: D3
    description: "The Codex controller vector always carries --ignore-rules, swaps workspace-write for the alpha-aos-task profile overrides when granted, and never carries the bypass flag, danger-full-access, --yolo or --add-dir; the child gets exactly one GIT_CONFIG_GLOBAL literal"
    requirement: AUTO-02
    verification:
      - kind: unit
        ref: "test/task-agents.test.ts#the codex controller argument vector is fixed and never bypasses the sandbox"
        status: pass
      - kind: unit
        ref: "test/task-agents.test.ts#runCodexController launches a granted git directory under the profile with a run-scoped GIT_CONFIG_GLOBAL"
        status: pass
    human_judgment: false
  - id: D4
    description: "On this host, without a model turn, the real codex sandbox under the adapter-built profile lets git commit and gsd-tools query commit land, refuses config/hooks/info writes with EPERM, and prompt-input lists only TMPDIR, the root and its .git as writable with network restricted"
    requirement: RUN-01
    verification:
      - kind: integration
        ref: "test/task-tracer.integration.ts#the approved git directory profile lets a sandboxed GSD commit land and keeps git control files read-only (no model turn)"
        status: pass
    human_judgment: false
  - id: D5
    description: "task preview names the granted git directory (or none with the reason) in text and JSON; approval binds it; a moved git directory or a pre-binding approval refuses the start as git-directory-changed before any run record"
    requirement: CON-03
    verification:
      - kind: unit
        ref: "test/task-contract.test.ts#a git directory moved after approval refuses the start as git-directory-changed before any run record exists"
        status: pass
      - kind: integration
        ref: "test/task-cli.test.ts#task preview names the git directory local-commit lets the controller write, in text and JSON"
        status: pass
    human_judgment: false

duration: 55min
completed: 2026-10-01
status: complete
---

# Phase 14 Plan 07: Controller Git Authority Summary

**An approved local-commit now launches Codex under an `alpha-aos-task` permission profile that names exactly the project's own git directory (config, hooks and info read-only) with `--ignore-rules` and a run-scoped safe.directory git config. The grant is shown in the preview and bound into the approval, and the real host sandbox runs GSD's commit without a model turn.**

## Performance

- **Duration:** about 55 min for this continuation (Task 1's decision checkpoint ran in an earlier agent)
- **Started:** 2026-09-30T15:05Z (continuation dispatch after c814fda)
- **Completed:** 2026-09-30T15:45Z
- **Tasks:** 3 (Task 1 decision, Task 2 tracer, Task 3 consent binding)
- **Files modified:** 12

## Accomplishments
- `resolveTaskGitDirectory` is a new read-only leaf module. It decides the single git directory a run may name. It returns `in-tree`, or `external` through a one-line `gitdir:` pointer outside the root. It refuses missing, link, linked-worktree, pointer-inside-root, no-HEAD and oversized pointers, and each refusal has its own reason.
- `startTask` passes `grantedGitDirectory(...)` into the dispatch request.
- Codex runs under the named profile when a directory is granted, and under the legacy `workspace-write` when none is. Both vectors carry `--ignore-rules`.
- The no-spend canary passed on this host on its first run.
- `task preview` text and `--json` name the git authority. `task approve` binds the canonical `gitDirectory`. `task start --apply` refuses `git-directory-changed` before any run record exists.

## Task Commits

1. **Task 1: Choose the controller git-authority model**: decision only, no commit. The user chose `git-dir-profile`.
2. **Task 2: Git authority end to end (tracer)**
   - `d3f75df` test(14-07): failing tests plus typed skeletons (RED)
   - `bd68ebd` feat(14-07): resolver, dispatch, profile launch and a passing canary (GREEN)
3. **Task 3: Consent-bound git directory**
   - `19c76f7` test(14-07): failing tests plus a typed skeleton (RED)
   - `689f18a` feat(14-07): approval binding, preview text and JSON, git-directory-changed (GREEN)

## Host Canary Results (Task 2, no model turn)

Command: `node scripts/run-tests.mjs --test-name-pattern="sandboxed GSD commit" --files dist/test/task-tracer.integration.js`. Result: pass 1, fail 0, skipped 0, 20.4 s. No output contained `NOT PROVEN:`.

| Step | Result |
|------|--------|
| sandboxed `git add README.md` | ok, exit 0 |
| sandboxed `git commit -m "canary: sandboxed commit"` | ok, exit 0; host `git log -1` = `canary: sandboxed commit` |
| sandboxed `gsd-tools query commit "docs(quick-000000-cnr): sandbox canary" --files README.md` | ok, exit 0, `committed: true`; host subject `docs(quick-000000-cnr): sandbox canary` (stderr carried only GSD's `defaults.json` precedence warning) |
| sandboxed writes to `.git/config`, `.git/hooks/pre-commit`, `.git/info/attributes` | all three `EPERM`; the config and info/attributes sha256 are unchanged, and hooks/pre-commit is still absent |
| `codex debug prompt-input` with the same overrides | exit 0, "Network access is restricted" |

The prompt-input output listed exactly three writable roots:
- `C:\Users\Public\Documents\ESTsoft\CreatorTemp` (this host's `TMPDIR`)
- `C:\Users\alpha\AppData\Local\Temp\alpha-aos-task-fixture-wPKVG7\inventory-summary` (the project root)
- `C:\Users\alpha\AppData\Local\Temp\alpha-aos-task-fixture-wPKVG7\inventory-summary\.git` (its git directory)

The tracer feedback gate re-ran the automated `<verify>` after the GREEN commit. It passed, so Task 3 went ahead.

## Files Created/Modified
- `src/core/task-git.ts`: resolves the git directory and decides the grant. It imports only node:fs/promises, node:path and path-boundary.
- `src/core/task-run.ts`: adds `ControllerDispatchRequest.gitDirectory` and computes the grant before the first run record.
- `src/adapters/task-codex.ts`: adds the profile constant, the overrides, the run git config and the literal environment. The launch now uses the profile when a directory is granted.
- `src/core/task-contract.ts`: preview `gitAuthority`, approval `gitDirectory`, and the `git-directory-changed` start gate.
- `schemas/task-receipt.schema.json`: the optional approval `gitDirectory`. It is not in `required`.
- `src/format.ts`, `src/cli.ts`: the preview line and the JSON key.
- `test/task-git.test.ts`: new suite with 11 tests.
- `test/task-agents.test.ts`: the vector test keeps its name and now expects `--ignore-rules`. Five tests are new.
- `test/task-contract.test.ts`, `test/task-cli.test.ts`: 5 and 2 new tests.
- `test/task-tracer.integration.ts`: the canary. The header now says this one test spends no model turn and records that decision D is superseded.

## Decisions Made
See `key-decisions` in the frontmatter above. The three decisions required by the plan and the orchestrator are:
- **Selected option id: `git-dir-profile`.** It supersedes 14-06 user decision D (defer).
- **Evidence P1-P11:** the full list is in `key-decisions`.
- **Orchestrator note:** GSD's halt-propagation gate listed 14-07/14-08 as `blocked_by: [14-06]` because 14-06-SUMMARY has `status: halted`. The user explicitly chose to override that gate for this gap-closure run, because 14-07 Task 1 is the decision that supersedes 14-06 decision D. 14-06-SUMMARY.md was not edited.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Run git config values are quoted**
- **Found during:** Task 2
- **Issue:** git config treats an unquoted `#` or `;` as the start of a comment. A project root containing either character would silently turn into a truncated safe.directory.
- **Fix:** `writeCodexRunGitConfig` writes `directory = "<root>"` and `path = "<global>"`. A double quote or line break in either path is refused before anything is written. The behavior test asserts the quoted form.
- **Files modified:** src/adapters/task-codex.ts, test/task-agents.test.ts
- **Commit:** bd68ebd

**2. [Rule 2 - Missing critical] An unsafe grant fails closed without a launch**
- **Found during:** Task 2
- **Issue:** `codexGitAuthorityOverrides` and `writeCodexRunGitConfig` throw on an unsafe path. Inside `runCodexController`, that throw would escape as an unstructured rejection.
- **Fix:** Building the vector and writing the config are wrapped. A failure returns `notLaunched("git-authority-refused", ...)` and Codex is never started.
- **Files modified:** src/adapters/task-codex.ts
- **Commit:** bd68ebd

**3. [Rule 2 - Missing critical] safe.directory names the canonical root**
- **Found during:** Task 2
- **Issue:** `request.projectRoot` is `resolve(contract.scope.projectRoot)`, which is not necessarily canonical. git compares safe.directory against the real path it discovers.
- **Fix:** `runCodexController` passes `canonicalizeWithMissingTail(request.projectRoot).canonical` to the run git config. The canary does the same.
- **Files modified:** src/adapters/task-codex.ts
- **Commit:** bd68ebd

**4. [Rule 2 - Missing critical] Extra `.git` link test and `--add-dir` in the forbidden-token list**
- **Found during:** Task 2
- **Issue:** The resolver's `link` layout had no test. The plan's prohibition names the extra writable-directory flag, but the vector tests did not check for it.
- **Fix:** Added a junction/symlink `.git` test, and added `--add-dir` to every vector's forbidden-token assertion.
- **Commit:** d3f75df

**Total deviations:** 4 auto-fixed (all Rule 2). **Impact:** no scope change. Every export, grep target and named test in the plan is present.

## TDD Gate Compliance
Both implementation tasks have a `test(14-07)` RED commit before their `feat(14-07)` GREEN commit. No refactor commit was needed. `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` for both RED runs, which were captured with `node --test --test-reporter=tap`:
- **Task 2 target:** "startTask dispatches the canonical git directory of an approved local-commit contract". All 11 of 11 tests failed. On the target: actual `null`, expected the canonical `.git`.
- **Task 3 target:** "a git directory moved after approval refuses the start as git-directory-changed before any run record exists". 7 of 45 failed, with "Missing expected rejection". The existing 38 stayed green.

## Verification
- Task 2 verify command (task-git, task-agents, task-run, task-effects, task-gsd, process): 104 of 104 pass.
- Task 3 verify command (the nine task suites): 166 of 166 pass.
- The canary: `# pass 1`, `# fail 0`, `# skipped 0`.
- `npm run check`: 0 `error TS` lines.
- Full `npm test`: 1118 tests, 1108 pass, 0 fail, 10 skipped. The skips existed before this plan.
- Acceptance greps:
  - `export async function resolveTaskGitDirectory`: one line.
  - `node:child_process` in task-git.ts: 0.
  - `CODEX_TASK_PERMISSION_PROFILE = "alpha-aos-task"`: one line.
  - `"--ignore-rules"` in task-codex.ts: 1.
  - `grantedGitDirectory(` in task-run.ts: 1.
  - `"git-directory-changed"` in task-contract.ts: 2.
  - `resolveTaskGitDirectory(` in task-contract.ts: 3.
  - `"gitDirectory"` in the schema: 1, and it is not in `required`.
  - `Git authority (local-commit)` in format.ts: 2.
- The deadlineAt arithmetic did not change. The 14-02 wall-time tests are still green in task-contract.

## Known Limitations
- The sandbox semantics are proven only for codex-cli 0.158.0 on the elevated Windows backend. A different version needs the canary re-run.
- A repository that already carries sticky DENY entries from earlier workspace-write sessions (P6, T-14-51) still blocks, and it fails closed. Plan 14-08 Task 1 records this as a STATE.md deferred item.
- `:tmpdir` write was kept for parity with legacy workspace-write (T-14-50, accepted). Plan 14-08 records it as a deferred item.
- The controller can rewrite refs and objects of the one granted repository. Plan 14-08 detects that; it is not prevented here.
- The permission profile's precedence over a user-config `sandbox_mode` rests on prompt-input rendering (P7). The enforced proof is the 14-08 live runs.

## Issues Encountered
None.

## User Setup Required
None. No external service configuration is required.

## Next Phase Readiness
Plan 14-08 is next. Its dispatch can switch from the recomputed grant to `approval.gitDirectory` and add the history and control-file integrity guards. The live accepted run, the seeded-defect rejection and the stale-review substitution then run under this profile.

## Self-Check: PASSED
- Files found: src/core/task-git.ts, test/task-git.test.ts, src/adapters/task-codex.ts, src/core/task-contract.ts, test/task-tracer.integration.ts.
- Commits found: d3f75df, bd68ebd, 19c76f7, 689f18a.
- `git rev-list --count c814fda..HEAD` = 4.
