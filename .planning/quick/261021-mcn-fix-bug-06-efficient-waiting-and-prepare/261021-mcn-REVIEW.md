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


# BUG-06 correction: independent code/security review

Date: 2026-10-27. Reviewer: independent GPT-6.1 Sol high lane.

**Disposition: no actionable defects confirmed; 0 open findings.** This is a bounded source review of the actual correction and merged integration, not release approval or independent goal verification.

## Scope and identity

Reviewed the working-tree correction in `src/core/process.ts`, `test/process.test.ts`, `src/core/task-gsd-lifecycle.ts`, and `test/task-gsd-lifecycle.test.ts`, plus the `src/core/task-run.ts` integration against main `29619abaa10b250d745c1c4df2896cadd682aa53`. Workspace HEAD was `03be82c0f2d6b9f2e25cbda64b12ebe1a104e123`; MERGE_HEAD and origin/main were both the stated main commit. Read only the final 30 lines of the prior GSD REVIEW.md as historical context; CR-01 was already resolved and was not reopened without evidence.

## Findings and reasoning

No Critical, Warning, or other actionable finding was confirmed in this scope.

- **Exact phase argv:** both custom-command branches at `src/core/task-gsd-lifecycle.ts:445` and `:459` now recognize only an argument equal to the requested phase. A script path containing `02` can no longer suppress the appended `02` phase and applicable `--auto`. The regression at `test/task-gsd-lifecycle.test.ts:582` covers stepCommand and commandMap, explicit and absent phase arguments, and discuss/plan/execute/verify. Its real child rejects missing/duplicate exact phase and incorrect auto behavior, writes the actual step artifact, and the parent checks exit status, next step, artifact paths/content, and recorded exact argv. Reverting either equality correction would fail the corresponding absent-phase case before artifact creation. Explicit-phase cases also exercise preservation without duplication. The test does not merely assert a mocked command construction.
- **Parseable onSpawn evidence:** the two tests at `test/process.test.ts:906` and `:930` opt into the existing 64 KiB parseable excerpt budget. They additionally assert uncapped stdout, stderr, and aggregate output before parsing the child JSON and checking argv. This fixes accidental default excerpt truncation without changing the production default or relaxing the assertions to accept incomplete output.
- **Exited Windows parent:** the helper at `src/core/process.ts:553` uses the actual spawned ChildProcess exitCode/signalCode to skip taskkill after that parent has exited. Cancellation, timeout, and output-cap paths all call it. POSIX group termination and live-Windows tree termination retain their prior paths. The held-pipe cancellation regression adds a Windows `already-gone` assertion while retaining the proven parent-exit/descendant-live barrier, unconfirmed-close assertion, sub-900 ms post-abort bound, clean-abort confirmed-close case, and descendant self-exit check. The corresponding deadline test retains its readiness barrier, unconfirmed close and sub-900 ms post-deadline bound. These bounds concern an exited direct parent holding inherited pipes through a surviving descendant; they do not establish a universal taskkill timing bound for live Windows trees. `already-gone` is termination-delivery metadata, not a claim that the descendant was killed.
- **Merged integration:** relative to the exact main commit, task-gsd-lifecycle differs only in the two equality expressions. The native default harness command generation, role-model resolution/injection, and multiphase orchestration remain main's code. Task-run's differences are the run-path exports and extraction of the existing strict run-record validation into validateTaskRunText; readRunRecord still reads the file and delegates to that same validation. Its approval/start checks and multiphase route remain main's implementation. The new validator retains schema, credential, record-kind, contract-id, filename/run-id and embedded-review validation.
- **Newer-main preservation checks:** no differences from main were present in the six task adapter files inspected. The catalog-lock diff is confined to the alpha-aos-task source/target hashes; package-lock differs only in root package version 0.4.4 to 0.4.5, preserving promoted dependencies. The root historical incident report is exactly main's bytes (`git diff --exit-code` returned 0).

## Reviewed SHA-256 identities

| File | SHA-256 |
| --- | --- |
| src/core/process.ts | 1ec3e307a66cf9ea50dc10e5c56e99de326f31b6dab6d0d57c8f7a68b76ded5e |
| test/process.test.ts | 459acce9658c941193ff92eacf4b221708fe7377cbe68bc99cf8a19817cea5d1 |
| src/core/task-gsd-lifecycle.ts | c60d13929004fee463424257af91af5af77ab7b0211c87ff16ca93c9674084ad |
| test/task-gsd-lifecycle.test.ts | 13c1b14f875051723115d1fd1b8726a37614e48e340aad6985e957e47795deb8 |
| src/core/task-run.ts | 532b15fe3b75478f20fe70b887fbf7d53e127ef3b6a3576a479e97d70b0b2c01 |
| catalog/stack.lock.json | 38aa712ad6d274ee9bbc042d4eeed5b6057b05db51c310509eb1245c36beed99 |
| package-lock.json | 12f5d76b70d683a95c2f5a209d10c6f4a5b80dda556b47633f937e4855cfb63b |
| package.json | 0442a07cba01aeaec48d1c433c14eb455fb349d8b14c8de47fcd6974370a83aa |
| CRITICAL_BUG_REPORT_AUTOPILOT_ANTIGRAVITY_ROUTING_AND_SNAPSHOT_DEFECTS.md | 15073b7d80d99d0fbda30abd2268ac750ae0f6298f81aee8c5635655f292cedb |

## Verification limits

No tests, builds, full suite, release verifier, runtime reproduction, nested agents, GUI, network or global mutation were run by this reviewer. Regression strength above is source inspection, not a claim of execution success. The controller owns targeted checks and release evidence; those results were not assumed. This review does not independently demonstrate macOS/Linux behavior, deliberate PID-recycling races before Node observes process exit, universal tree-closure proof, or the final release/goal criteria. No product, planning or repository file was changed; only this external report was written.

# Independent startup correction review

Reviewed 2026-10-27 against HEAD 03be82c0f2d6b9f2e25cbda64b12ebe1a104e123. Scope: the new job bootstrap dispatch relocation, bounded artifact hashing, and their two new tests only. Static code/security review; no tests, builds, network access, agents, product edits, or planning edits performed.

## Finding: P1 - bootstrap regression fixture passes unsupported job start flag

Location: test/job-cli-bootstrap.test.ts:31 (environment setup at line 28).

The preview invokes `job start --state-root <stateRoot> ...`, but src/cli.ts:761 permits only `--cwd` and `--deadline-ms` as value flags. parseClosedFlags rejects this invocation with `Unknown option: --state-root`; therefore the expected successful preview at line 32 fails and neither worker alias assertion is reached. Job start uses userStateRoot(), which reads ALPHA_AOS_STATE_DIR rather than this flag.

Correct the fixture by supplying the isolated state root through ALPHA_AOS_STATE_DIR in its child environment and omitting --state-root from the job start argv. Retain the worker aliases' supported --state-root flags. This also binds the preview's no-state-write assertion to the actual selected state directory. Implementation corrections must use the existing authorized source workflow.

## Other static conclusions

- Verified the entire relocated job-worker/job dispatch block is text-identical after LF normalization to the index baseline: 12,920 characters, one old occurrence and one new occurrence. Removing the block from each CLI makes the remaining source identical. Existing dispatch validation, approval/default/worker protections are preserved.
- Dispatch now precedes packageRoot/loadCatalog/loadLock after computer-use/help/version returns; installer catalog parsing is no longer a prerequisite for job operations. This is intentional scope decoupling, with no additional product bypass found in this change.
- Artifact checking retains every manifest entry, at most eight active read/hash workers, and original manifest diagnostic order through indexed results. No memoization or skipped hash verification found. Missing and changed files remain rejected.
- Artifact fixture spans 34 entries and checks positive verification plus five ordered drift/missing diagnostics. Runtime success is unverified here.

## Reviewed SHA-256

| File | SHA-256 |
| --- | --- |
| src/cli.ts | C0EFA33DC11FA9B0AF306A12C5FCEE87ACFE724D53C8074355D8FDC6BB676E73 |
| scripts/build-artifact.mjs | 52F7B380C13B39BBC7012FB99F4043F62E8F55238F1BB5689903C6B5CD3F5109 |
| test/job-cli-bootstrap.test.ts | 689D4CC887F596E14C97635C3346956FCFF831D9EAF5DDB34C0829E9848CE7D3 |
| test/build-artifact-integrity.test.ts | AC666312795E16124BF84142C3B0F8CAE9A4F12B50E4695814418D67884BE51F |

Result: 1 finding, blocking a clean regression gate. No additional product-code findings. This review does not establish startup latency, a CPU root cause, runtime test success, or acceptance of unrelated prior corrections/merged work. Controller-owned affected-file testing and final gates remain required.

## Narrow correction re-review (2026-10-27)

The initial P1 and RED status above are preserved as historical findings for the prior fixture hash. The corrected fixture statically resolves that P1: it computes the probe environment once, retains the entire policy and existing literal values, supplies literal ALPHA_AOS_STATE_DIR=stateRoot, and removes --state-root only from the job start preview. Both worker invocations and the malformed-worker check retain their supported explicit state-root flags. The preview now selects the directory checked by its no-write assertion and uses only accepted start flags.

The only test/task-wait.test.ts change adds JSON.stringify(result.checkpoint) as the diagnostic argument of the existing assert.equal(result.status, "accepted"). The expected status and equality oracle are unchanged. No product changes were included in this narrow follow-up; the CLI and artifact checker hashes remain identical to the initial review.

Current SHA-256:

| File | SHA-256 |
| --- | --- |
| test/job-cli-bootstrap.test.ts | 6EE45F4DB6A97859336EFBB9B8D56495F6D2302E087487A8F7B934FA57F09841 |
| test/task-wait.test.ts | 43BB05CB3A3E5928AA3DBEFC823CED95E76699C9D9615512364F3A3215634163 |
| src/cli.ts | C0EFA33DC11FA9B0AF306A12C5FCEE87ACFE724D53C8074355D8FDC6BB676E73 |
| scripts/build-artifact.mjs | 52F7B380C13B39BBC7012FB99F4043F62E8F55238F1BB5689903C6B5CD3F5109 |
| test/build-artifact-integrity.test.ts | AC666312795E16124BF84142C3B0F8CAE9A4F12B50E4695814418D67884BE51F |

Follow-up result: 0 open static findings, 0 product-code findings. No tests or builds run by this reviewer. Runtime acceptance remains pending the controller-owned actual build/selected-case results; this static resolution does not turn the earlier failing gate green or credit separately saved reproduction checkpoints as criterion passes.

Controller actual resolution evidence: fixture-build045 exit0; exact4selectedcases4pass0fail0skip33189.514ms (newcopiedCLIbootstrap,realproducer,completion,safety). Prior36case33pass2fail1skip retained; bootstrapP1 and observedproducerfailure now pass without alteredoracles/deadlines. Productandtestbyteidentities covered by the new source commit below; finalfullrelease stillpending.

# Independent runner concurrency-cap review

- Scope: static review of the uncommitted concurrency-cap diff in `scripts/run-tests.mjs` against HEAD `79400816adf87ea971ddb74bd95fa6885edfd6fa`.
- Reviewed source SHA256: `87D55C68EED9D95392113ABDB90575FB81331D5C6FB3FEEEB5E9F9A716642295`.
- Findings: **0 open findings**.

The change adds a default Node test file concurrency argument capped at four and available host parallelism. It does not change file enumeration, named-file validation, selected paths, assertion execution, forwarded flags, environment scrubbing, inherited stdio, exit handling, or the existing packed lifecycle ordering. Both explicit argument forms (`--test-concurrency VALUE` and `--test-concurrency=VALUE`) suppress the injected default, leaving Node to validate and honor the original arguments. The selected files are still appended unchanged to the child invocation; the cap limits simultaneous file execution rather than selecting fewer files.

The diff does not broaden mutation authority or declare any test result successful. Lower concurrency can change resource contention and timing, as intended, but this static review cannot establish that the previously failed cases or the full suite now pass. The controller must retain the actual failed full-run evidence and report subsequent runtime results separately.

Limits: no tests, builds, network calls, or product/GSD edits were performed for this review. Runtime proofs and targeted reruns belong to the controller and were not duplicated. This review covers only the source hash above and the added default cap, not unrelated runner behavior or other modified files.

Controller actual runner proof:8bodiesexecutedineachdefault/equal/separateflagmode; observedpeaks4/1/1, all exit0. Exact6previousfailedcases6pass0fail0skip23489.152ms. No productdeadline/oracle/skipchanges. Fullrelease retry requiresnewcommittedsource+freshgates.


## 2026-10-27 scoped strong-role Codex consumption review

Reviewer: authorized GPT-6.1 Sol high dedicated controller; no nested/separate peer agent in this bounded stage. Base0a04c96. Reviewed exact Gemini diff and final manifest for the six allowed product files, including the doc-only policy-headroom correction. Final0open scoped findings. This scoped review does not replace independent whole-change/final goal verification.

Behavior/security: only waiting guidance strings/docs and six owned-task skill hashes changed. No process code, native ephemeral Codex adapter, model/effort configuration, runtime timers, observers, deadline, assertion, test or sandbox/root/approval change. Policy1951chars; existing update/drift tests still enforce production1–2000 bound and drift/user-byte preservation. Lock changed paths are only alpha-aos-task sourceSha256 and five targetSha256 values; exact final hashes audited externally. Model babysitters, unchanged status rereads and monitoring transcripts are explicitly prohibited; native handles/runtime timers and bounded evidence/handoff preserve GSD ownership. Transport yield is never completion; no zero-token/wakeup, hook-initiated model turn or billing/savings claim.

Runtime evidence: check0/build0; initial nine-file123/121pass/2fail/0skip retained, then after exact policy-only shortening affected policy7/7pass/0fail/0skip. Metadata refreshed through existing artifact writer. Required execute:post/verify:pre/strict status0. No mirrored-guide tests added and no whole-suite/release rerun. Logs/counts in consumption-test-runs.json and consumption-strong-review.json under external audit root.

Native actual jobjob-6c1e292bfaa2490b: start1/wait1/status0, observer25000ms, pending checkpoint after9real progress writes with0returned bytes;41writes total, early output events0, terminal JSON results1, CLI start0/wait0/real child0, completed after8155ms. Native command event and durable handle files retained. No extra Codex process/model. This short probe does not verify long transport or compare harness/token usage. Actual host transport required handle continuation during other subprocess waits; no zero-wakeup claim. Existing failed full release and pending package/Stage1/Stage3/finalGSD/integration remain unchanged. Do not mark this quick complete.

## 2026-10-27 matched short Codex waiting measurement

Latest user priority remains Codex-specific excessive consumption before packaging. Parent completed exactly one bounded pair of native Codex diagnostic executions after source f26efd6; no product or global configuration changes. Both were fresh gpt-6.1-sol/high sessions, same 12-second child emitting60progress records, same built job CLI, external disjoint CWD/state, genuine child exit0. Baseline explicitly reproduced three separate status queries; efficient route used one external runtime invocation containing exact job start+wait and zero status queries. This diagnostic exception is not ordinary execution guidance.

Deduplicated native token_usage_record response IDs: baseline6responses/5nativecommands/input125572/cached96512/uncached29060/output337/reasoning0; efficient2responses/1nativecommand/input38265/cached26112/uncached12153/output88/reasoning0. Both native models/configuration and all command exits were checked. Counts are actual recorded token usage, not guessed from tool-call counts. The single pair demonstrates that avoiding model-level status queries reduces calls/input for THIS short workload; no statistical general savings rate, subscription quota/billing conversion, cross-harness comparison, long host-transport behavior or universal zero-token claim is established. Prompt suffixes, cache reuse and scheduling are limitations. Do not infer that all historical33050982input tokens were wasted.

Audit: C:/Users/alpha/AppData/Local/Temp/alpha-aos-041/codex-wait-ab-20261027/comparison.json with exact session IDs, source JSONL/rollout hashes; per-case result.json, events.jsonl, native JSONL and all CLI stdout/stderr retained. Baseline native01a17a97-45cd-7e70-840f-20e6d2d53038; efficient native01a17a97-4594-7ec2-9ea3-c50c693e5057. Existing runtime pending-to-terminal proof and guidance commit f26efd6 retained. No whole-suite rerun needed or performed for this external measurement. Original D remains unintegrated0.4.4. Full release, packaging/provenance/Stage1, three criteria, independent goal verification and final integration remain INCOMPLETE; do not mark Verified/complete.

## 2026-10-27 Stage A fresh independent Codex waiting-path review

Latest approved order A actual Codex/GSD waiting/delegated work, B package/release, C evidence/GSD/local integration. Actual scoped reviewer /root/stage_a_wait_review, native01a17aad-5c6f-7a20-abe4-f53b29bd5aa0, fresh fork_turns none, gpt-6.1-sol/high, terminal FINAL_ANSWER: **No actionable findings** in f26efd6 waiting prompt, policy, taskskill or delivery wiring. Static read-only review only; no tests, edits, nested agents, old contexts, installed-global inspection or managed-autopilot execution.

Reviewer inspected exact requested f26 diff and bounded traces through src/cli.ts, src/adapters/task-codex.ts, src/core/task-gsd.ts, task-run.ts, codex-policy.ts, owned-skills.ts, install.ts, command-jobs.ts, task-wait.ts and completion-wait.ts, plus docs/codex-execution-policy.md, docs/efficient-wait.md, skills/alpha-aos-task/SKILL.md and catalog/stack.lock.json. Relevant paths unchanged f26->HEAD. Findings: task-run.ts:1551 dispatch uses buildGsdControllerPrompt (24KiB bound); task-codex.ts:204 fresh exec --ephemeral consumes stdin prompt under existing model/sandbox controls. Ordinary/quick policy reaches managed Codex AGENTS.md through sync/install; owned skill source and five rendered hashes match d81f339e75f083b79be3f13741faf128039de73d1efc4ac2bbdc8c0644908516. Policy1951 bytes within2000-char bound. Existing CLI wait APIs retain exact identities, finite budgets, validated terminal evidence and unsuccessful exits. Runtime reconciliation differs from prohibited model polling. New wording preserves GSD/approval/root/model/sandbox/GUI authority. No actual source wiring gap found; no claim of automatic delivery to originalD0.4.4 or an existing session.

## 2026-10-27 Stage B scoped independent review

Fresh authorized /root/stage_b_scoped_review, fork_turns none, exact gpt-6.1-sol/high, returned terminal FINAL_ANSWER with zero actionable findings. Read-only scope: changed src/cli.ts, src/core/task-contract.ts, new src/core/task-id.ts, scripts/release.mjs, test/job-cli-bootstrap.test.ts, new test/release-orchestration.test.ts, and project AGENTS.md owned Codex marker block. No child edits/tests/builds/commits/nested agents or historical transcript reads. Reviewer traced deferred startup imports and async helper callers, exact shared task-ID validator/re-export, cached ESM class identity, exhaustive required ordinary/packed grouping and failure propagation, real mini fixture assertions, and exact policy delivery preserving prior project instructions. This does not prove full release success.

Actual first affected execution then exposed three new fixture errors (14tests11pass3fail), despite review: nested mini test children inherited NODE_TEST_CONTEXT and therefore ran no bodies; malformed job delimiter expected MISSING_ARGUMENT while unchanged classifier actually returns COMMAND_FAILED. Authenticated Gemini applied the exact two-test correction only: delete internal marker in the controlled independent fixture subprocess environment, matching the actual verifier; assert existing COMMAND_FAILED plus missing-delimiter diagnostic. Same reviewer performed a narrow read-only re-review of exact repair patch, relevant source and failure tail, again zero actionable findings. Controller verified reverse patch applicability and actual rerun. First failures remain preserved under external stage-b-targeted; successful revised checks are separate stage-b-targeted-v2. No source deadline/oracle weakening and no failed counts hidden.

External stage-b-source-proof.json binds seven reviewed file hashes and verifies exact unchanged job/worker handler bytes, exact old AGENTS bytes outside newly appended owned block, exact trimmed policy1950chars (source1951 including LF), and145 regular compiled test files. All source/test/script/project-policy changes were applied by authenticated agy.exe --model gemini-3.8-flash-high --effort high, source-only. Initial exploratory invocation hit300s print timeout before any source edits; stream/server shutdown is recorded, its exit0 is not completion. Fresh compact exact-apply invocation6c7ad84b-81e9-40ef-a6f1-395e39fa3745 and fixture repair2e023ceb-3dee-4b6d-949f-35c552002e2f both returned real terminal success; full logs external. Full release and final goal verification remain pending.

Controller's independent real criteria: completion7/7 and safety17/17 actual named bodies with exact success stdout, zero early stdout events and terminal exit0; integration failed existing runner budget with ETIMEDOUT, exit1, named bodies unreported. Exact job IDs, durations, failed external fixture correction, native handle28684/two continuations, usage snapshot and audit paths in SUMMARY. No retry/widening/product edits; conditional synthetic stress omitted because actual criteria work yielded through native transport. Actual root15response usage snapshot and terminal reviewer6response usage are distinct useful workloads, not measured idle/quota savings. Existing shortpair was not rerun. This scoped review cannot establish final release/goal acceptance. Parent Stage B must investigate actual integration selection timing and remaining package/release failure with mandatory Gemini/high editor, preserving current deadlines and all final GSD gates. Task remains incomplete and originalD unintegrated.

## 2026-10-27 development final verification preparation (recovery checkpoint)

Same authorized quick --full --auto; latest user priority is finishing development, with no further host investigation. Source implementation remains 4dfe32182082c6dddcf66c3c0f933313dc470210, candidate0.4.5; this checkpoint changes GSD records only. Prior strong review/re-review and targeted14/14,6/6,4/4, actual integration4/4 and execute:post/verify:pre/strict gates remain evidence; no compiler, targeted test or review repetition for record-only changes.

Actual prior release job-e905b4a5b2964087 FAILED: ordinary1810 total/1799pass/0fail/11skip,732731ms; packed10 total/9pass/1fail,479938ms. Windows UNKNOWN errno-4094 opening isolated installed zod/v4/locales/sk.js in fingerprintManifest (169-character path), not a test timeout. Release exit1 at2026-10-27T00:59:23.089Z, retained stage-b-release-20261027/release-exit.json and12-stdout/12-stderr/group-packed.json. Later host interruption at10:03:20 local included0x139 param3 KTIMER_LIST_CORRUPTION; driver/hardware and causality remain unproven. No confidential dump material retained here. Latest user supersedes historical diagnostic hold for necessary development verification; no OS changes or reboot authorized here.

PLAN Task3 still requires one embedded final full suite AND actual release dry-run success. One justified controlled full retry is authorized because prior gate failed and host/resource concerns are concrete. Use NEW D:/alpha-aos-verify-20261027/development-final-release-20261027 audit, D task-only TEMP/TMP, process-only core.longpaths=true and owned launch affinity255 (8of12 logical CPUs). C and D share the same physical SSD; this is headroom/path control, not proof of crash remediation. Existing runner4-file concurrency, every oracle and20min child/15min packed-test bound stay unchanged; four files do not bound total child processes or RAM. No speculative product correction, exclusions, skip/resume evidence or hidden retry.

External development-final driver asserts exact committed clean main HEAD, planning-only delta from4dfe, manifest freshness and unchanged source/test/scripts; release command exactly node --import <new observer> scripts/release.mjs --dry-run. Preserve group outputs/counts and artifacts/provenance before cleanup; actual terminal filename release-exit.json. One candidate durable job deadline3600000ms and ONE exact-job finite wait3605000ms; fs.watch only deduplicates group events. Local5s memory guard cancels ONLY this fenced job ONCE after three consecutive freemem samples below768MiB, records FAIL/incomplete, never restarts; finite observation clears timers/watchers on terminal. Guard cannot guarantee absence of a kernel crash.

Before launch save ECC handoff and commit these existing quick records; external postlaunch durable handle carries actual HEAD/job/state/CLI/driver/wait command, avoiding dirty checkout. No source/runtime/test edits while release runs. If launch/config fails stop with actual failure, no blind retry. StageC must inspect actual terminal release result then complete criteria/evidence/GSD and verified integration; original D:/dev/alpha-AOS stays unintegrated. Task and release remain INCOMPLETE, never inferred complete from a started handle. Existing denied bug06-final-cwd-alias-vE9z2m retained.


## 2026-10-27 Stage C scoped evidence-doc review

Controller strong-role review covers only six Gemini-applied evidence docs and the one-byte whitespace correction; runtime/source/tests/scripts/catalog unchanged from independently reviewed4dfe321 implementation. Exact reverse patch check, docs-only diff, old0.4.4 changelog and computer-use0.4.0 text preservation checked. Actual raw release group counts, complete disjoint file enumeration, tarball and bundle hashes, all17child exits/provenance/Stage1, three fresh actual criteria named leaves and new final package receipts corroborate current claims. No cost/quota/kernel fix, newGUI/3OSCI/Stage2/remote promotion claims. Historical failed gates, native auth blockage and short comparison limitations retained. Zero open controller-scoped findings; fresh independent goal verifier result is separately required next. First whitespace worker's config denial/instruction overrun and controller-owned termination retained in external stage-c-docs logs; it is not completion. Final source identities and package hashes are separately bound, not invented as bundle Git metadata.
