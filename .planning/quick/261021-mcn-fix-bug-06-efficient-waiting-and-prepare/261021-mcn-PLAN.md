---
phase: quick-261021-mcn
plan: "01"
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/core/completion-wait.ts
  - src/core/task-wait.ts
  - src/core/command-jobs.ts
  - src/core/command-job-worker.ts
  - src/core/process.ts
  - test/process.test.ts
  - src/cli.ts
  - schemas/command-job.schema.json
  - test/completion-wait.test.ts
  - test/task-wait.test.ts
  - test/command-jobs.test.ts
  - test/command-job-worker.test.ts
  - test/command-job-paths.test.ts
  - test/command-job-fences.test.ts
  - test/command-job-runtime.test.ts
  - test/helpers/command-job-runtime.ts
  - test/verify-efficient-wait-integrity.test.ts
  - test/efficient-wait-cli.test.ts
  - scripts/verify-efficient-wait.mjs
  - test/verify-efficient-wait.test.ts
  - test/efficient-wait-guidance.test.ts
  - src/core/task-gsd.ts
  - skills/alpha-aos-task/SKILL.md
  - docs/codex-execution-policy.md
  - docs/efficient-wait.md
  - docs/research/efficient-wait/BUG-06.md
  - docs/research/efficient-wait/PR.md
  - docs/research/efficient-wait/RELEASE.md
  - package.json
  - package-lock.json
  - README.md
  - README.ko.md
  - CHANGELOG.md
must_haves:
  truths:
    - An operator waits for one exact approved task attempt or an explicitly selected supervisor without following a newer run, confusing retries, or granting acceptance.
    - Ordinary and quick builds/tests can start as real detached bounded local jobs, reconnect from another CLI process, and finish through one pending runtime observation.
    - Watch registration races, replaced records and dropped events converge through validated rereads and bounded runtime reconciliation, with listeners and timers disposed exactly once.
    - Observer timeout or abort leaves the job alive; a process deadline and explicit owned cancellation are distinct outcomes, and orphaned or mismatched ownership fails closed.
    - Completion, safety and integration verifier selections execute real regressions and emit only the exact success object after success.
    - Five-harness guidance, both READMEs, version 0.4.1 and local release evidence describe measured behavior while retaining the v0.4.0 computer-use scope and unrun platform limits.
  artifacts:
    - path: src/core/completion-wait.ts
      provides: Race-safe disposable observation with bounded reconciliation
    - path: src/core/task-wait.ts
      provides: Read-only exact task attempt and explicit supervisor adapters
    - path: src/core/command-jobs.ts
      provides: Durable bounded job start/status/wait/cancel API
    - path: src/core/command-job-worker.ts
      provides: One-job detached worker with fenced ownership and actual process close evidence
    - path: schemas/command-job.schema.json
      provides: Closed bounded durable job record contract
    - path: scripts/verify-efficient-wait.mjs
      provides: JSON stdin completion/safety/integration verifier
    - path: docs/efficient-wait.md
      provides: Ordinary, quick and autopilot guidance for all five harnesses
    - path: docs/research/efficient-wait/BUG-06.md
      provides: Current defect disposition backed by actual test and release evidence
  key_links:
    - from: src/cli.ts
      to: src/core/task-wait.ts
      via: task wait with exact run/digest/revision and explicit attempt/supervisor scope
    - from: src/cli.ts
      to: src/core/command-jobs.ts
      via: job start/status/wait/cancel and separate internal worker dispatch
    - from: src/core/command-job-worker.ts
      to: src/core/process.ts
      via: Existing shell-free environment-allowlisted bounded process runner and close settlement
    - from: src/core/task-wait.ts
      to: src/core/task-read.ts
      via: Resolve once, pin identity, validate canonical durable task records on every reread
    - from: src/core/task-wait.ts and src/core/command-jobs.ts
      to: src/core/completion-wait.ts
      via: Watch parent directories, register/recheck, serialize reconciliation and dispose
    - from: scripts/verify-efficient-wait.mjs
      to: scripts/run-tests.mjs
      via: Closed selected compiled regression lists, scrubbed environment, checked exit status
---

<objective>
Resolve BUG-06 by moving completion observation into a bounded local runtime, with durable exact task observation and ordinary command jobs, then prepare the verified local v0.4.1 release.

Purpose: Operators can await authorized long work without model-driven sleep/status loops, preserving GSD authority, process safety and honest evidence.
Output: Runtime and CLI behavior, adversarial regressions, executable verifier, five-harness guidance, bilingual release updates, and local PR/release notes.
</objective>

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/quick/261021-mcn-fix-bug-06-efficient-waiting-and-prepare/261021-mcn-CONTEXT.md
@.planning/quick/261021-mcn-fix-bug-06-efficient-waiting-and-prepare/261021-mcn-RESEARCH.md
@src/core/task-read.ts
@src/core/task-run.ts
@src/core/task-journal.ts
@src/core/task-supervisor.ts
@src/core/controller-lease.ts
@src/core/process.ts
@src/core/path-boundary.ts
@src/core/redaction.ts
@test/helpers/task-fixture.ts
@scripts/run-tests.mjs
@scripts/release.mjs
</context>

<execution_contract>
This is an approved quick --full --auto, with one plan and three sequential ownership packets. Recommended routine defaults are preapproved. There is no ROADMAP phase requirement mapping or phase-state mutation. The sole controller owns GSD records, local commits, check orchestration and recovery; implementation workers never write .planning/ or commit. Preserve other agents' changes.

Security repair clarifications (after the independent Packet A interim review): reuse the existing process runner with opt-in output drain/spawn observation, retaining its default policy. CLI job start/cancel are dry-run previews unless explicit --apply is supplied, consistent with project governance; read-only wait/status reject --apply. This refines the prototype command spellings below without expanding authority. Programmatic start/cancel remain explicit calls. Correct terminal exit metadata must not become a green CLI result merely because observation completed. Unsupported legacy supervisor linkage remains explicitly unresolved rather than guessed.

Every source, test, script, schema and product-document edit, including review fixes, MUST be performed through agy with the explicit arguments --model gemini-3.8-flash-high --effort high. No substitute model, inherited model, self role, nested agents, global configuration changes or GUI actions. GPT-6.1 Sol high performs architecture, plan checking, independent code/security review and verification. Pass a compact packet with objective, exact owned files, constraints, references and expected diff/evidence; launch packets sequentially and reclaim ownership before changing the next packet. Workers return a concise diff summary and unresolved limits; the controller runs tests and creates commits. Recovery clarification: after the initial sequential tracer, independent correction packets may run with disjoint file ownership; the parent records ownership and reconciles terminal results before integration. Implementation packets now perform source-only edits or apply a completed strong-role repair patch; they must not launch builds/tests or model-managed polling. The controller executes affected checks after ownership is returned. This changes scheduling only and waives no review, verification, authority or release gate. On quota/usage failure preserve the boundary and recovery record; stop blind retries.

Bind external log root and the original checkout's pre-existing compiled CLI as controller-owned environment variables BUG06_LOG_ROOT and BUG06_ORIGINAL_CLI using the controlling task packet. Verify those bindings before use; no alternate checkout or rebuilt CLI may replace the original CLI capability-pack probe. Keep verbose logs outside the repository. Retain useful audit logs; delete disposable fixtures only after checking each exact resolved path and ownership. No push, tag, publish, project approve, project sync or relaxation of release checks.

Use native persistent completion handles when available, perform independent authorized work during an owned child run, or attach once to the local runtime. No repeated model sleep/status loop or redundant waiting agent. Host-generated tool yields remain outside this implementation's control. A job command is an explicitly authorized local process, never an authority bypass or another project lifecycle.
</execution_contract>

<hook_results>
The supplied plan-pre snapshot's activeHooks contributions were loaded in registry order: assumption-delta, then schema-gate; both configValues are null. The assumption-delta scan returned skipped=true, reason=phase_unresolved for this quick ID. This is a skipped probe, not a negative detection. The schema scan of context/research and planned files found no ORM schema patterns; no database push applies. Project agent_skills is empty and project skill discovery found no listed skill directories. Research already grounds Node v24 filesystem/process APIs through primary documentation; no new library, package installation or research substitution is needed. Graph context is disabled per research.
</hook_results>

<assumption_delta_decision>
Primary noun: durable execution identity, represented separately by an existing approved task attempt and by a command job. Decision: no-change for task/GSD identity; introduce process-only job identity without making autopilot contracts prerequisites for ordinary commands. Task attempt identity remains contract ID, digest, revision and exact run ID; explicit supervisor scope pins its own existing controller identity and can observe linked retries. This is a modeling rationale, not a fabricated detector verdict.
</assumption_delta_decision>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Ship exact task waiting and a real detached command-job path</name>
  <files>src/core/completion-wait.ts, src/core/task-wait.ts, src/core/command-jobs.ts, src/core/command-job-worker.ts, src/cli.ts, schemas/command-job.schema.json, test/completion-wait.test.ts, test/task-wait.test.ts, test/command-jobs.test.ts, test/efficient-wait-cli.test.ts</files>
  <behavior>
    - Start a harmless delayed command through the actual CLI, obtain its durable job ID before completion, exit the launcher, and reconnect from another process to its real final exit/output.
    - Read an exact task attempt's completion without switching to a later run; supervisor waiting is an explicit distinct scope and follows only validated linked attempts.
    - Already-completed and completion-during-attach paths resolve once; timeout/abort stops observation while an independent marker proves the child continues.
  </behavior>
  <action>
Ownership packet A: hand exactly these files to the required agy invocation. Start with failing end-to-end tests, then wire the actual CLI through the observer, adapters, durable storage and existing process runner. Complete the happy path before expanding failures. Deliver all production behavior below within this packet, with broader adversarial regression coverage added by Task 2.

Implement a dependency-free shared observer. Validated reread is authority; fs.watch is only a hint. Watch parent directories so atomic rename/replacement is visible, register then recheck to close the lost-wakeup window, serialize/coalesce rereads and settle once. Handle missing filenames, noisy/missing events, watcher errors and unavailable watchers through bounded runtime-owned reconciliation. Use a default 1-second reconciliation interval with closed bounded overrides and a finite observer deadline (default 5 minutes, positive maximum 24 hours); avoid busy-loop retries. Dispose watchers, timeout/reconciliation handles and AbortSignal listeners on every terminal/refusal/error/abort path. Support injected watch/clock/read seams for deterministic tests without exposing production trust bypasses.

Add read-only task wait CLI/API using task wait &lt;contract-id&gt; --run &lt;run-id&gt; --contract-digest &lt;digest&gt; --revision &lt;revision&gt; [--scope attempt|supervisor] [--timeout-ms &lt;ms&gt;] --json. Require exact identity arguments; attempt is the default. Resolve once through existing selection, then validate bounded closed canonical run/checkpoint/journal evidence for the pinned contract, digest, revision and run on every reread. Reject weak fallback selection or forged checkpoint identity. Pin attempt index and owner fence; do not translate checkpoint pending/running/needs-input directly to attempt completion. An attempt ending is not a whole supervisor ending, and a rejected attempt may be followed by a retry. Explicit supervisor scope uses its validated existing controller lease/checkpoint plus journal linkage, permits only linked retry transitions and returns its actual supervisory disposition. Terminal process/run evidence never creates GSD acceptance. Missing/mismatched owner, owner death, ambiguous attempt linkage, regressing sequence or unsupported stale records return unresolved/refused rather than invented success. Keep task start --apply foreground: its existing awaited supervisor and exact digest approval remain intact.

Add job start/status/wait/cancel routes for explicitly authorized ordinary and quick commands. Start syntax: job start --cwd &lt;existing-directory&gt; --deadline-ms &lt;positive-ms&gt; -- &lt;executable&gt; &lt;argv...&gt;; status/wait/cancel take an exact job ID, with wait --timeout-ms and all routes supporting --json. Parse argv after the delimiter as an array and launch with shell:false and hidden Windows children using the established direct-executable resolution rules; never join arguments into a shell command. Reject malformed IDs, unknown flags, unbounded durations and unauthorized paths. Default job deadline 20 minutes, positive maximum 24 hours. The worker runs one bounded command and exits; it is not a service manager. A wrapper may host an already-authorized foreground task command, but job start never grants its required task approval or manufactures a contract for ordinary work.

Persist a closed job identity/spec before launch, start a genuinely detached one-job worker with stdio independent of the launcher, and return only after a bounded ownership/start handshake. Handle spawn failure and launcher/worker crashes without a misleading successful handle. Use user-scoped private managed state outside the project, immutable random job ID, command/spec digest, schema revision and random owner fencing. Pass only nonsecret job selectors to worker argv; no environment values or credential-bearing arguments enter durable metadata/diagnostics. Use existing reviewed environment allowlists, path checks, redaction and bounded process runner. Keep launch payload private, bounded and transient; persist only necessary sanitized command metadata and digests. Bound combined retained stdout/stderr at 64 KiB with explicit truncation, sanitize before persistence and presentation, and drain child streams without unlimited memory or disk. Apply finite record/input limits before decoding/parsing; enforce the same closed schema and ownership checks in start, status, wait, worker and cancel.

Canonicalize/validate managed roots and every record/ancestor; reject traversal, symlinks/reparse aliases and nonregular or oversized records, and recheck around reads, atomic replacement and writes. Never trust record-supplied paths, owner PID alone or a PID from another host. Worker ownership must be fenced and demonstrably current; stale/absent/tampered ownership returns orphaned/unresolved, and must not signal an arbitrary process. Cancel records an explicit owned request consumed by that worker and aborts only its owned child; settlement waits for actual close, distinguishes cancellation requested from delivered/confirmed and handles natural completion racing cancellation. Distinguish observation timeout/abort, child deadline, spawn error, nonzero exit, explicit cancellation and wrapper orphan. Observation is read-only and cannot cancel, accept, stop or mutate task/GSD state. Reuse existing safeguards instead of weakening sandbox, root, effect, approval, evidence or model enforcement.
  </action>
  <verify>
    <automated>npm run build; node scripts/run-tests.mjs --files dist/test/completion-wait.test.js dist/test/task-wait.test.js dist/test/command-jobs.test.js dist/test/efficient-wait-cli.test.js</automated>
  </verify>
  <done>Actual launcher exit/reconnect proves durable job lifetime; a task exact-run wait is reachable through the CLI; existing foreground task start and approval semantics remain valid; targeted tests pass and the controller commits the reviewed runtime slice.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Prove races, ownership and real verifier behavior</name>
  <files>test/completion-wait.test.ts, test/task-wait.test.ts, test/command-jobs.test.ts, test/efficient-wait-cli.test.ts, scripts/verify-efficient-wait.mjs, test/verify-efficient-wait.test.ts, test/efficient-wait-guidance.test.ts</files>
  <behavior>
    - Watch-loss and register/recheck races resolve from durable evidence and every settlement path disposes resources.
    - Forged identities/records and ownership loss refuse safely; observer cancellation never masquerades as process cancellation.
    - Verifier success requires execution of its selected real regressions; malformed input, false claimed evidence and failed/missing regressions produce nonzero exit without a success object.
  </behavior>
  <action>
Ownership packet B: use the required agy invocation for these tests and verifier. If a test exposes a runtime defect, reclaim the precise Packet A files and send a separate correction packet through the same approved model; retain one active writer and rerun affected targeted checks. The controller and independent GPT-6.1 Sol high reviewer must inspect behavior and adversarial coverage, not just implementation strings.

Add deterministic observer tests for terminal-before-attach, completion before/during registration/recheck, atomic rename, null/irrelevant filenames, event bursts, two simultaneous observers, dropped events, unavailable/errored watchers, missing parent/record, serialized reads, read failure, preabort/midabort, expiry and exactly-once listener/timer disposal. Inject events/barriers rather than fragile wall-clock sleeps; use finite test deadlines and owned cleanup.

Add task fixtures for exact run/digest/revision/attempt index, reserved versus actual run, moving latest alias, linked supervisor retries, attempt rejection followed by retry, running/needs-input nonterminal semantics, final supervisory disposition, wrong/stale owner and crash. Exercise actual CLI task wait on realistic existing fixture records; ensure observation writes no GSD/task acceptance, stop or lifecycle state.

Add generic-job actual CLI tests with separate launcher/waiter processes and scrubbed isolated state: detached start returns before completion, reconnect survives launcher exit, nonzero/spawn failure, output flood/truncation and redaction, argv metacharacters/spaces without shell interpretation, no ambient secret leakage, observer timeout/abort marker proves child alive, process deadline, explicit cancellation and natural-close race, worker crash/orphan, foreign/reused PID refusal and tampered ownership. Cover traversal/absolute IDs, malformed/oversized/schema-invalid records, wrong digest/revision, symlink file and ancestor substitutions, atomic replacement races and stale callbacks. Test supported cross-platform primitives; report a platform-only fixture limitation explicitly rather than crediting an unexecuted adversarial check.

Implement scripts/verify-efficient-wait.mjs with exactly one bounded JSON stdin object containing only check: completion|safety|integration. Reject extra fields, invalid JSON/types, oversize input and caller-claimed success. Resolve repository files relative to the script, verify fresh built artifacts using existing build-artifact checks, and invoke fixed selected compiled suites through scripts/run-tests.mjs with a finite deadline and bounded captured logs. completion selects observer/task completion cases; safety selects task identity and job adversarial cases; integration selects actual CLI and five-harness guidance cases. Forward test diagnostics only to stderr. Missing files, failed assertions, no executed tests, build drift, tool errors or timeouts fail nonzero and emit no success object. Stdout on success is exactly JSON.stringify({ok:true,check}) plus a newline. Do not accept caller-supplied test paths, commands, pass flags or fabricated evidence.

Add verifier self-regressions that exercise invalid input, all successful selections and a selected real regression failure/missing artifact in an isolated copied fixture, proving failure cannot be papered over by a claimed pass. Keep verifier self-tests outside the verifier's own selection lists to avoid recursion. Guidance tests initially describe required contracts and become green with Task 3; avoid brittle full-text snapshots. The mandatory runtime verifier integration gate is completed after that guidance exists.
  </action>
  <verify>
    <automated>npm run build; node scripts/run-tests.mjs --files dist/test/completion-wait.test.js dist/test/task-wait.test.js dist/test/command-jobs.test.js dist/test/efficient-wait-cli.test.js; '{"check":"completion"}' | node scripts/verify-efficient-wait.mjs; '{"check":"safety"}' | node scripts/verify-efficient-wait.mjs</automated>
  </verify>
  <done>Race and safety regressions execute and pass; verifier completion/safety return the exact success object only after real checks; integration/guidance and verifier self-tests are scheduled for Task 3 with no claim they already passed.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Publish accurate local guidance and prepare verified v0.4.1 evidence</name>
  <files>src/core/task-gsd.ts, skills/alpha-aos-task/SKILL.md, docs/codex-execution-policy.md, docs/efficient-wait.md, docs/research/efficient-wait/BUG-06.md, docs/research/efficient-wait/PR.md, docs/research/efficient-wait/RELEASE.md, package.json, package-lock.json, README.md, README.ko.md, CHANGELOG.md, test/efficient-wait-guidance.test.ts</files>
  <behavior>
    - Generated controller instructions and task skill recommend native persistent handles or exact local observation for ordinary/quick/autopilot work and preserve model/ownership/approval constraints.
    - All five harness rows distinguish proven runtime availability from unverified native delivery; task start's actual foreground semantics are explicit.
    - Package and lock root versions agree at 0.4.1; both READMEs describe computer-use 0.4.0 and efficient waiting 0.4.1 with truthful evidence limits.
  </behavior>
  <action>
Ownership packet C: use the required agy invocation for all product guidance, version, tests and evidence documents. Tighten test/efficient-wait-guidance.test.ts before implementing its production behavior. Update generated controller prompts in src/core/task-gsd.ts and docs/codex-execution-policy.md plus skills/alpha-aos-task/SKILL.md; correct the independent-background-supervisor claim to the actual foreground awaited task start behavior. Explain when the explicit detached local job wrapper provides independent lifetime. Preserve every existing authority, model-selection, GSD evidence, single-writer and GUI approval restriction.

Create docs/efficient-wait.md with runnable exact CLI examples, ID/digest/revision acquisition, separate attempt/supervisor scopes, status meanings, reconnect, output bounds, observer expiry versus process deadline versus explicit cancel, orphan recovery and fixture cleanup. Provide a five-row Claude Code/Codex/Antigravity/Pi Agent/Hermes Agent matrix covering ordinary conversational work, GSD quick and approved autopilot. Prefer a documented native completion handle only where its existence was actually grounded; otherwise recommend the shared local job/task route and state unsupported host delivery honestly. Delegated work requires prior delegation/model authorization, independent work or one native pending wait, and an owned concise result. Waiting does not grant extra process, GUI or project authority. State that the runtime removes model-driven waiting loops in its own path, but cannot promise to suppress host wakeups or establish token savings from sleep/wait counts.

Bump package.json and the package-lock.json root package version to 0.4.1 without installing dependencies or changing dependency resolution. Immediately pause further application edits while the controller invokes alpha-aos-control using the original pre-existing CLI bindings: node $env:BUG06_ORIGINAL_CLI project plan . --json and node $env:BUG06_ORIGINAL_CLI project status . --json. Capture JSON outside the repository and report matching capability evidence; do not approve or sync. Continue only after these read-only setup/manifest checks, or record the exact unavailable/failed probe without inventing success.

Update README.md and README.ko.md with both the retained v0.4.0 computer-use behavior and v0.4.1 efficient-wait usage; link the shared guide and preserve meaningful platform limitations. Add CHANGELOG.md 0.4.1 behavior and actual validation limits. Maintain docs/research/efficient-wait/BUG-06.md as the current local report: cite the external report's symptoms as reported, separate its unmeasured token arithmetic, and record actual commands, counts, exit codes, commit identity and unresolved platform limits. Prepare concise PR.md and RELEASE.md locally with problem/behavior, checks and limitations; do not open a remote PR or publish a release. macOS/Linux real GUI checks and three-OS CI stay explicitly unrun unless performed in this task; Windows-only CLI tests do not establish either.

The controller runs targeted checks below, then independent GPT-6.1 Sol high code/security review. Resolve accepted review defects solely through the required agy model and rerun only affected targeted tests. Close all high/critical security findings or stop with the actual blocker. Once final source/test/script/guidance/version changes are complete, create the controller's clean local implementation commit through GSD. Run node scripts/release.mjs --dry-run as the final release gate; its internal npm run test is the ONE final full suite, so do not separately run npm test or run the release gate speculatively before stabilization. Preserve normal clean-checkout and provenance protections. Capture the embedded full-suite count, tarball/provenance/smoke evidence and final exit outside the repository. A source correction after that gate invalidates it and requires a new final gate only after the justified correction; record why.

After successful gates, the required agy model may finalize evidence-only report/PR/release text from actual controller results. The controller owns SUMMARY, verification/recovery records, durable continuity handoff and local evidence commits; these records cite the checked implementation commit and any later evidence-only commit. Do not change tested runtime or tests while recording success. Retain audit logs and clean only explicitly reviewed disposable paths. If a gate is unavailable, times out or fails, record incomplete status and actual output rather than declaring BUG-06 or the release verified.
  </action>
  <verify>
    <automated>npm run check; npm run build; node scripts/run-tests.mjs --files dist/test/efficient-wait-guidance.test.js dist/test/verify-efficient-wait.test.js dist/test/task-gsd.test.js dist/test/task-gsd-prompt.test.js dist/test/task-autopilot-bugfixes.test.js; '{"check":"completion"}' | node scripts/verify-efficient-wait.mjs; '{"check":"safety"}' | node scripts/verify-efficient-wait.mjs; '{"check":"integration"}' | node scripts/verify-efficient-wait.mjs; node scripts/release.mjs --dry-run</automated>
    <human-check>Controller compares bilingual guidance, current BUG-06 disposition and local PR/release notes against captured results. This is the preauthorized end-of-task review, not an additional user approval request.</human-check>
  </verify>
  <done>All selected regressions and three verifier checks pass; one final embedded full suite and release dry-run pass on the final implementation commit; original-CLI capability probe is recorded; 0.4.1 docs retain computer-use scope and unrun platform limits; local PR/release evidence is reviewable and no remote action occurred.</done>
</task>

</tasks>

<threat_model>
Trust boundaries: CLI input to process launch; durable local records to observation/verdict; filesystem event hints to validated rereads; worker ownership to process signalling; subprocess output to durable diagnostics. Filesystem watchers confer no authority. ASVS level 1 control intent follows research; this is not certification.

| Threat ID | STRIDE | Component | Severity | Disposition | Mitigation |
|---|---|---|---|---|---|
| T-261021-mcn-01 | Spoofing | Task/job identity and owner | high | mitigate | Exact immutable IDs, digest/revision/attempt linkage, closed bounded records, fenced owner; mismatch/orphan refusal and identity adversarial tests |
| T-261021-mcn-02 | Tampering | State filesystem | high | mitigate | Canonical private roots, ancestor and regular-file checks, symlink refusal, safe atomic updates and replacement-race regressions |
| T-261021-mcn-03 | Elevation | Generic command launch/cancel | high | mitigate | Explicit authorized argv, shell:false, reviewed env/root policy, no autopilot bypass; worker consumes cancel only for its own fenced child |
| T-261021-mcn-04 | Information disclosure | Logs, specs and metadata | high | mitigate | No credential argv/env persistence, bounded transient spec, sanitize before persistence, capped retained output, secret fixtures |
| T-261021-mcn-05 | Denial of service | Watchers/records/output | medium | mitigate | Finite deadlines, capped reads/output, serialized coalesced reconciliation, exactly-once disposal and flood/leak tests |
| T-261021-mcn-06 | Repudiation | Completion and release report | medium | mitigate | Actual close evidence, distinct observer/process outcomes, executable verifier and result/commit-linked local audit |
| T-261021-mcn-SC | Tampering | Package resolution | high | mitigate | No new package or installation; retain dependency graph, change only root release versions, existing release integrity/provenance gates |
</threat_model>

<source_audit>
| Source | Item | Task | Coverage |
|---|---|---|---|
| GOAL | BUG-06 efficient runtime waiting and local v0.4.1 preparation | 1-3 | COVERED |
| REQ | ROADMAP requirement IDs | N/A | Quick task has no phase linkage; no invented requirement IDs |
| CONTEXT | Exact task/run identity | 1,2 | COVERED |
| CONTEXT | Event-driven register/recheck plus bounded runtime reconciliation | 1,2 | COVERED |
| CONTEXT | Bounded output/observation, no lifecycle mutation, orphan refusal | 1,2 | COVERED |
| CONTEXT | Autopilot and ordinary/quick/delegated waiting, durable local jobs | 1-3 | COVERED |
| CONTEXT | GSD sole authority; no additional delegation/mutation/GUI authority | 1-3 | COVERED |
| CONTEXT | Honest five-harness guidance and no unsupported wakeup/token claims | 3 | COVERED |
| CONTEXT | Preserve computer-use 0.4.0 and explicit unrun mac/Linux GUI/3OS CI | 3 | COVERED |
| CONTEXT | Required agy implementation and GPT-6.1 high control/review division | 1-3 | COVERED |
| CONTEXT | JSON stdin verifier with completion/safety/integration and exact stdout | 2,3 | COVERED |
| CONTEXT | Adversarial/race/integration checks, one final suite/release preview, local only | 2,3 | COVERED |
| RESEARCH | Shared observer, task/run versus supervisor distinction, atomic replacement | 1,2 | COVERED |
| RESEARCH | Existing process runner, safe argv/env/redaction, real detach/reconnect/crash | 1,2 | COVERED |
| RESEARCH | Correct foreground/background mismatch and generated controller guidance | 3 | COVERED |
| RESEARCH | Meaningful verification and unsupported-evidence refusal | 2,3 | COVERED |
| CONTROLLER | Original-CLI capability probe after manifest change, both READMEs, report and local PR/release notes | 3 | COVERED |

Deferred ideas remain excluded: GUI permission changes, service/daemon platform, token-cost guarantees, host-wakeup suppression and remote publication. CONTEXT decisions have no D-NN identifiers, so coverage follows their original order and text without inventing IDs.
</source_audit>

<verification>
Run each automated command sequentially and inspect its exit code before continuing; PowerShell semicolon-separated notation above lists commands and does not authorize ignoring earlier failures. Targeted gates run through scripts/run-tests.mjs and existing build/check scripts. Verifier success output must be exactly the selected object; logs go to stderr or controller-owned external files. Retain real detached CLI/runtime and guidance evidence, not source-string-only assertions. The final release dry-run contains the single final full suite and runs after final implementation changes and review. Existing guards, sandbox, approvals and package provenance remain mandatory. No user checkpoint is required for preapproved local work.
</verification>

<success_criteria>
All must-have truths are demonstrated with behavioral tests and real CLI execution, three JSON verifier selections succeed, no high/critical security defect remains, package root versions are 0.4.1, bilingual docs and generated guidance match actual behavior, and the final local release preview passes. Current report and local PR/release notes identify evidence and unrun platform limits. Controller records actual local commits and recovery/continuity; remote push/tag/publish never occur.
</success_criteria>

<output>
The controller creates .planning/quick/261021-mcn-fix-bug-06-efficient-waiting-and-prepare/261021-mcn-SUMMARY.md and required verification/state records through GSD after reviewing actual results. Implementation agents never edit .planning/.
</output>
