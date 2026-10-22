---
phase: quick-261021-mcn
reviewed: 2026-10-22T00:34:56Z
depth: deep
implementation_head: 02c02226a4eb28c480f2747faebc8a38d8dca114
latest_head: 7d65b41
diff_base: 54ecf5042a5cc969004716484f85c0b91b013505
files_in_delta: 43
files_reviewed: 36
files_reviewed_list:
  - CHANGELOG.md
  - README.ko.md
  - README.md
  - docs/codex-execution-policy.md
  - docs/efficient-wait.md
  - docs/research/efficient-wait/BUG-06.md
  - docs/research/efficient-wait/PR.md
  - docs/research/efficient-wait/RELEASE.md
  - package.json
  - schemas/command-job-cancel.schema.json
  - schemas/command-job-launch.schema.json
  - schemas/command-job.schema.json
  - scripts/efficient-wait-reporter.mjs
  - scripts/verify-efficient-wait.mjs
  - skills/alpha-aos-task/SKILL.md
  - src/cli.ts
  - src/core/command-job-worker.ts
  - src/core/command-jobs.ts
  - src/core/completion-wait.ts
  - src/core/process.ts
  - src/core/task-gsd.ts
  - src/core/task-run.ts
  - src/core/task-wait.ts
  - test/command-job-fences.test.ts
  - test/command-job-paths.test.ts
  - test/command-job-runtime.test.ts
  - test/command-job-worker.test.ts
  - test/command-jobs.test.ts
  - test/completion-wait.test.ts
  - test/efficient-wait-cli.test.ts
  - test/efficient-wait-guidance.test.ts
  - test/helpers/command-job-runtime.ts
  - test/process.test.ts
  - test/task-wait.test.ts
  - test/verify-efficient-wait-integrity.test.ts
  - test/verify-efficient-wait.test.ts
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
historical_findings:
  critical: 1
  resolved: 1
resolution_reviewed: 2026-10-22T00:46:55Z
resolution_basis: four-file uncommitted correction on 7d65b41
status: clean
---

# BUG-06 v0.4.1 final independent review

**Current disposition (2026-10-22T00:46:55Z):** CR-01 is closed in the reviewed correction. Zero unresolved blockers or warnings remain from this independent review. The controller may commit the correction and proceed to the required final release verification. This review does not claim that the pending full release gate passed.

**Initial disposition (historical RED, preserved):** One confirmed BLOCKER remained before correction. Release verification was held for its correction and affected regression checks. No source, test, GSD, dependency, or release artifact was modified by this reviewer.

## Narrative Findings (AI reviewer)

### CR-01 — BLOCKER: a working-directory alias bypasses the external-state containment rule

**File:** `C:/Users/alpha/gsd-workspaces/alpha-aos-041/alpha-AOS/src/core/command-jobs.ts:382-399`

**Related paths:** `src/core/command-jobs.ts:1658-1666`; `src/cli.ts:2585`.

**Issue:** `resolve()` normalizes spelling but does not resolve junctions or symbolic links. The preflight compares the state root with the configured CWD and discovers enclosing projects from that same configured spelling. The CWD `stat()` follows links, so a junction to a real project is accepted. A state root physically inside that project, addressed by its real path, is then lexically outside the junction path and passes every comparison. The later managed-state proofs also pass because the state root itself contains no link. The actual detached worker consequently writes `jobs/<id>/job.json`, private launch material and output inside the project, violating the explicit external-state boundary. An alias to a nested project directory can additionally hide the actual enclosing repository markers. This requires no filesystem race or malicious concurrent writer; an ordinary aliased working directory plus a state override is sufficient.

**Confirmed production reproduction:** Windows, Node v24.13.1, existing compiled production modules at the reviewed implementation. Create the following temporary layout:

```text
<temp>/bug06-final-cwd-alias-vE9z2m/
  project/.git/
  alias/ -> project/                 # Windows junction
```

Then invoke the real API, with no injected worker, observer or path seam:

```js
const handle = await startCommandJob({
  stateRoot: join(project, "private-job-state"),
  cwd: alias,
  executable: process.execPath,
  args: ["-e", "process.stdout.write(process.cwd())"],
  deadlineMs: 5000,
});
const result = await waitCommandJob({
  stateRoot: join(project, "private-job-state"),
  jobId: handle.jobId,
  timeoutMs: 10000,
});
```

Observed: job `job-f5c13e8ea3a84b65` started with `status: running`; the subsequent production observer returned `status: completed`, canonical job `status: completed`, `exitCode: 0`, `stateRevision: 2`, worker PID 23512 and child PID 16368. Its record was read from `project/private-job-state/jobs/job-f5c13e8ea3a84b65/job.json`. The result's CWD retained the alias spelling. This proves that launch, managed-state publication and process completion all crossed the promised boundary. The CLI preview calls the same lexical helper and has the same preflight gap.

**Fix:** Before creating state or spawning, compare canonical filesystem identities for both operands. Resolve the existing CWD to its physical location; canonicalize the state root through its deepest existing ancestor plus missing tail, using the existing shared path-boundary utility and failing closed on unprovable paths. Discover enclosing project/repository roots from that physical CWD as well as preserving required configured-root checks. Reject state inside the real CWD or any real enclosing project. An explicit refusal of aliased CWDs/ancestors is also safe if that is the supported policy. Apply the same preflight to CLI previews and programmatic start; retain the existing managed-state path proofs and later rechecks.

**Required regression acceptance:** Use an actual Windows directory junction and POSIX directory symlink, with the state override addressed through the real project path. Cover both a linked project root and an alias to a nested directory whose enclosing `.git` is visible only on the physical ancestry. Preview and apply must refuse before creating the state directory or a child marker. Include a nonexisting state-root tail, retain the existing nested-marker boundary regressions, and prove a normal plain CWD with truly external state can still launch and complete. No broad redesign is needed.

## Review coverage and limits

- Scope came from the explicitly supplied base-to-HEAD range, not an inferred commit window. The latest controller-only GSD note at `7d65b41` does not change product bytes. Five planning artifacts, the dependency lock and the supplied historical incident report were context/exclusions rather than reviewed product source. The root package version change and dependency-lock diff were checked for scope.
- Read the changed production modules, schemas, verifier/reporter and CLI changes; traced their process, filesystem-boundary, task-run/journal/supervisor and redaction dependencies. Regression inspection focused on bodies and assertions relevant to the lifecycle, identity, aliases, actual child completion and verifier-evidence boundaries; this was not a second execution of the large regression suite.
- Rechecked the historical repair themes against current code: exact attempt coordinates, explicit supervisor retry chains, missing/dead/foreign owner refusal, write CAS and immutable claims, output limits, cancellation versus observer expiry, actual spawn acknowledgement, bounded unconfirmed close, argv routing, named genuine leaf events, selected-file identities and post-test manifest freshness. No additional actionable defect was confirmed in those focused paths. Historical findings were not copied forward as current defects.
- Kept omitted-ID/rotated-owner supervisor retry producer behavior explicitly unsupported as documented. Pending final evidence text is controller-owned follow-up, not an additional runtime finding. No measured token-saving, automatic model-wakeup, live macOS/Linux GUI or three-OS CI success is asserted.
- Ran only narrow temporary production reproductions and `git diff --check`; the latter passed. A separate harmless nonzero-exit job returned a running handle and later produced a failed record with exit 7; that did not establish a start-route defect and is not reported as one. No full suite, build, verifier selections, release gate, GUI or external-account action was repeated.
- The first harmless fixture was removed after terminal settlement. The junction fixture partially remains at `C:/Users/alpha/AppData/Local/Temp/bug06-final-cwd-alias-vE9z2m` after Windows `EBUSY` during post-completion cleanup. The controller was informed of the exact path and PIDs. Automatic approval review rejected the subsequent verified PowerShell cleanup action as `blocked by policy`, without a more specific reason; deletion was not retried through another mechanism. This cleanup limit does not affect the reproduced boundary defect.

_Reviewer: independent GPT-6.1 Sol high code/security lane. Correction and affected regression checks remain with the authorized implementation/controller lanes._

## CR-01 resolution review — 2026-10-22T00:46:55Z

**Disposition: RESOLVED.** Reviewed only the current uncommitted correction in `src/core/command-jobs.ts`, `src/cli.ts`, `test/command-job-paths.test.ts` and `test/efficient-wait-cli.test.ts`. The original finding and failing production evidence above remain historical evidence, not an open finding.

The new shared async preflight resolves both CWD and state-root operands through the existing `canonicalizeWithMissingTail` utility and rejects unprovable canonicalization. It preserves configured-spelling guards, adds physical CWD containment and physical enclosing-project discovery, and covers the configured and physical ancestor `.alpha-aos` cases. Programmatic start and CLI preview await it before state creation or spawning. Existing managed-state path proofs remain in place. No further correctness or security defect was confirmed in this bounded correction.

Re-ran the original production junction case through the freshly compiled `startCommandJob` export, without test seams. The real CWD junction pointed at a temporary project containing `.git`; the state root used that project's physical path. The call now threw `External state root must not be inside working directory / project`, naming the physical project for both operands. Assertions confirmed `stateCreated: false` and `childMarkerCreated: false`. The fresh resolution fixture `C:/Users/alpha/AppData/Local/Temp/bug06-resolution-cwd-hzgNFG` was removed after verifying its absolute temporary-root containment and unlinking its junction; no worker was launched. An earlier quoting error failed at JavaScript parse time before creating a fixture and was corrected; it was not counted as runtime evidence.

Inspected the controller's actual affected-check log, `C:/Users/alpha/AppData/Local/Temp/alpha-aos-041/final-cwd-regressions.log`: **57 passed, 0 failed, 0 cancelled, 0 skipped, 0 TODO**. It includes actual project-root, nested-directory and ancestor-junction refusal regressions plus CLI preview/apply refusal. The retained existing real CLI launch/separate-process reconnect test also passed and checks a zero-exit terminal record with expected child output, so genuine external-state support was preserved. The controller reports the preceding build passed. `git diff --check` passed during this re-review. No broad suite, additional build or release gate was repeated by the reviewer.

The four source/test SHA-256 identities reviewed before the controller's correction commit are:

| File | SHA-256 |
| --- | --- |
| `src/core/command-jobs.ts` | `19546d16e20bca28b93faaa60fa4b969e5440ddd94f91be7ba38dcff8fe83ccc` |
| `src/cli.ts` | `bd5c75e495eb299fa0385fe9ef0024873d93e54c75a044df7263a6fae962e11e` |
| `test/command-job-paths.test.ts` | `be13820e0cc6a92f11f983418190f15d1c0dc8039561a4eabfdc7d605e96baea` |
| `test/efficient-wait-cli.test.ts` | `072493329f830f028f732862c5ceb798ddcad3f6ae15f8b3ddf4fceb8b0062cc` |

Remaining limits: this is a Windows re-review of this specific correction; POSIX branches and the full release gate remain for their required controller/platform checks. It does not establish protection against arbitrary same-user filesystem renames after a successful preflight or a new OS sandbox. The historical retained fixture/cleanup-policy note above remains unchanged. No product or GSD mutation was made by the reviewer.
