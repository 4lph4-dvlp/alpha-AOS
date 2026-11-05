---
status: verifying
trigger: "정식 릴리즈로 배포해줘; continue"
---

# BOOT-04 release blockers

## Context and authority

## Release continuation checkpoint (2026-11-04)

- Source ce38cb5 completed its local mandatory full push gate (2162 total, 2148 passed, 0 failed, 14 explicit skips), then CI 41663274313 failed. All three panel preflights passed; remaining failures were hermetic BOOT runtime setup, canonical temporary paths, a POSIX locator fixture and a real cancellation marker publication/consumption race. No publication occurred.
- BOOT source/test remediation e0d9d8d was integrated as d98bdd8. Hermetic targeted/held-out checks passed 106/106 with no skips, and five controls failed when source guards were reverted. Independent source review is pending; this is not full-suite/native evidence.
- Root doctor/readiness fixtures passed 21/21. The proof ledger is truthfully pending-final-wave because measured bootstrap source changed; historical counts are retained and cannot accept the new source. Updated package-binding hashes describe actual changed schema/guide bytes, not test success.
- T30 checkpoint: runtime full/phase negative gates exist, but repository-owned subject consumers and descriptor wiring are both missing. The installed producer requires violation RED, clean GREEN and nonvacuous default GREEN. The assigned debugger owns new consumers/preparer and exact 30-04/05 descriptor edits; no production behavior change, paid turn, installed-GSD modification or lifecycle waiver is authorized.
- Cancellation debugger owns only command-job publication/consumption and focused tests in the isolated worktree. Preserve writer identity checks; coordinate verified marker cleanup under the same per-job writer, release before receipt wait/terminal update. Do not swallow generic ENOENT or infer cancellation from request delivery.

### Original authority

Ordinary conversational GSD debug, find-and-fix. User requested completing v0.6.0 and passing CI/official delivery; later scope is GitHub official release only, with npm/global rollout/paid native turns excluded. Existing P1–P4 approvals remain exact, never extended to missing native proof or undisplayed human judgments. Root alone owns lifecycle/STATE/ROADMAP/REQUIREMENTS and release refs. No hook bypass, source mixing, model substitution or restart of completed waves.

## Current Focus

reasoning_checkpoint:
  hypothesis: Missing guards admit unready execution, repeated durable intent and unverified native labels; record decisions precede writer acquisition and can overwrite concurrent state.
  confirming_evidence:
    - claim checks only missing-runtime/probe-error/unsupported, and claimed same-nonce explicitly returns dispatchAuthorized true.
    - update reads/transitions before applyFileTransaction takes the lock; link compares caller IDs only; ack accepts absent receipt.
  falsification_test: Fresh absent/partial claim or same-nonce retry already withholds dispatch, or label-only native link already refuses; a held writer prevents transition callback execution.
  fix_rationale: Require ready, never regrant ambiguous intent, reopen bound artifact/Git evidence, and move entire service/store decisions under a single held session.
  blind_spots: Native artifacts may not preserve enough exact request/claim data; such cases must remain explicitly blocked. Cross-OS/native proof and final full-suite evidence belong to root.
  candidate_causes:
    - code: missing guard branches and pre-lock compare
    - data: backward label-only references contain no correlation proof
    - environment: interleaving independent writer processes
  and_gate: Race requires code plus interleaving; native acceptance requires missing validation plus incomplete/untrusted labels. Every contributing condition is guarded.

hypothesis: Phase29's original BOOT-04 plan contracts are not enforced in the current handoff service. A fresh independent goal verifier found ready-before-dispatch, atomic intent ownership, ambiguous retry and native acceptance validation gaps.
bug_class: bohrbug plus concurrency (atomicity/order violation; no circular wait)
test: Add service absent/partial, lost-response, missing-native and held-session controls; run focused compiled tests against unchanged base.
expecting: Dispatch and unchecked acceptance controls fail, confirming code-level contract omissions independently of environment.
next_action: Root integrates e0d9d8da9723441e24f690d1138dfb74b041effa from fix/bootstrap-release-060, performs final measured full suite/CI and source-bound proof-ledger update, then obtains real-workflow verification. Repair worktree is clean; no full suite or fresh paid/native invocation was launched by repair agent.
candidate_causes: code — missing readiness/retry/proof guards and pre-lock reads; data — legacy unchecked labels lack exact request/artifact correlation; environment — process interleaving exposes stale intent.
and_gate: Race requires pre-lock code read plus competing process interleaving; deterministic readiness/retry/acceptance omissions reproduce without concurrency.

## Symptoms and evidence

- .planning/phases/29-gsd-initialization-and-request-continuity/29-VERIFICATION.md is freshly gaps_found, score7/13, with structured source/plan references and repair scopes. Prior report is archived by the verifier; no false phase completion.
- Ready-before-dispatch: src/core/task-bootstrap.ts only rejects missing-runtime/probe-error/unsupported, accepts absent/partial and returns conversational dispatchAuthorized true. 29-04-PLAN.md:80 requires readiness immediately before requested-task claim.
- Atomicity: task-bootstrap-store read/transition occurs before applyFileTransaction acquires its writer. CLI supplies no session. Need the entire decision/read/compare/intent/write under one held session and a real separate-process control; the existing purported competing-process test is sequential.
- Lost response: same-nonce conversational claimed retry grants dispatch again without exact native reconciliation. Preserve corrected G31-01 autopilot withholding; never grant duplicate execution authority from a durable claimed intent alone.
- Native acceptance: unchecked caller nativeReference can link; acknowledgement allows no receipt evidence and does not reopen/correlate exact native artifacts/request/root/commit. Must fail closed on missing/ambiguous/mismatched proof, without creating a second GSD lifecycle.

## Constraints

Use existing MutationSession/transaction/discovery/bounded path helpers and locked toolchain; no dependency/model/OS harness changes. Preserve all six style IDs, ordinary-GSD/nonactivation paths, immutable original request/style/digest, direct-command semantics, root/privacy bounds and historical proof tiers. Do not relabel fixtures as native. Do not fabricate new native receipts or run paid models. Required tests must exercise behavior at public/service/native-process boundaries, not static implementation text. Save verbose logs externally and report bounded evidence. Complete meaningful targeted regressions; root owns the final full suite/CI after integration.

Missing precise native artifact evidence is a named blocker, not a worker claim that can be accepted as execution. If the existing public packet lacks enough correlation data, propose a minimal closed backward-aware schema/producer extension grounded in the original plan and existing discovery interfaces; do not silently loosen the contract or mutate third-party GSD artifacts outside GSD ownership.

## Evidence

- 2026-11-03: Read original 29-04 plan and current source completely for the claim/store/link/ack paths. Plan requires fresh ready, a single serialized read/compare/intent session, and reopened exact artifact/request/root/commit validation. Current source admits absent/partial, regrants same-nonce authority, reads before lock, and accepts reference labels/hash alone.
- Knowledge-base recall: no worktree knowledge-base file or configured debugger skills found. No per-test coverage/failing spectrum available, so SBFL skipped. Existing claimed two-process test uses sequential service awaits, not processes.
- Native descriptor gap sent to root: propose closed exact path/hash/commit plus project/pending/content/claim binding; legacy labels must remain blocked. No synthetic native receipt or lifecycle mutation authorized.
- Original source reproduced four failures in .planning/tmp/boot04-remediation/.planning/tmp/boot04-red.log: absent/partial grant dispatch, same-nonce retry grants again, caller native label links. Four controls green after guard fixes.
- Root authorized the minimal descriptor extension. Evidence contains exact allocation PLAN path/hash/Git commit plus original request/root/project/pending/content/random durable claim-session binding. The artifact must contain the binding once, Git bytes must match disk, and post-baseline commit ancestry is checked. Missing legacy proof is explicitly blocked, never migrated by invention.
- First 7-file BOOT sweep: 44/44 pass, zero skips (.planning/tmp/boot04-remediation/.planning/tmp/boot04-targeted2.log). New callback test spawns a competing independent updater during a held transition; real public CLI test uses TCP readiness barrier and actual two-process contention. Additional 10-test boundary sweep passes 10/10 including caller-owned session, baseline freshness, Git byte mismatch, original request alteration and junction ancestor.
- Privacy integration correction: runGitRead returns path-aliased excerpts, unsuitable for raw paths/artifacts. Exact-root proof uses git --show-prefix; artifact correlation uses raw-stream fingerprint metadata via bounded runProcess, retaining only redacted diagnostic output.
- Guardrail revert/reconfirm: exact tracked-source/schema stash 1f64c9b7b593d4f4d018298724fb8566c80b6033 temporarily restored original implementation. All five runtime controls failed again, including independent-process stale cancellation inside transition (.planning/tmp/boot04-remediation/.planning/tmp/boot04-revert-red.log). New test interfaces naturally produced three compile-time cross-version diagnostics while reverted; TypeScript emitted original runtime code and runtime failures independently reproduce the mechanisms. Source reapplied via exact stash hash, no root source touched.
- Intermediate 11-file targeted/held-out gate passed 106/106 with zero skips. Root then supplied independent CI evidence showing mocked service runners still depended on ambient on-disk CODEX_HOME discovery. Owned BOOT service fixtures now seed and restore an isolated CODEX_HOME plus fixture query adapter; final rerun explicitly points ambient CODEX_HOME/CLAUDE_CONFIG_DIR at missing roots.
- Privacy correction from root review: 29-02 says the original request/facts remain private. Committed correlation now embeds only exact request SHA256 plus immutable content/project/pending/claim-session marker, never raw request bytes. A regression asserts the fixture PLAN contains the hash and excludes the original private request. Exact raw request remains available only through bounded private host handoff API/context; bootstrap never edits/commits GSD artifacts.

## Resolution

root_cause: Readiness/retry/native-acceptance omitted required guards, and service/store read/compare occurred before transaction writer ownership. Incomplete caller labels combined with missing proof validation; real process interleaving combined with pre-lock decisions to permit stale writes.
fix: One owned mutation session spans service policy/readiness/record decisions and store read/compare/intent writes; absent/partial do not claim; durable retry restores identity with dispatch false. Closed exact native descriptor validates allocation PLAN, private-original-request SHA256/root/project/pending/content/claim-session binding, baseline ancestry and exact regular Git blob fingerprint; link/ack/reentry reopen evidence. Missing legacy/native proof remains blocked. Hermetic fixture runtimes replace ambient discovery assumptions. No third-party GSD artifact writes or native model invocation.
oracle_type: specified (original 29-04 contract and explicit root packet evidence requirements)
verification:
  target_test: { result: pass, detail: "106/106 hermetic targeted/held-out gate, zero skips (.planning/tmp/boot04-remediation/.planning/tmp/boot04-hermetic-final.log); last private-context builder changes verified by 28/28 (.planning/tmp/boot04-remediation/.planning/tmp/boot04-last-private-context.log), zero skips" }
  mutation_check: { result: skipped, reason_if_skipped: "Stryker not configured or installed; no dependency changes authorized" }
  no_op_deletion: { result: pass, deletion_justified_by_rca: true, rationale: "Unsafe dispatch regrant/label-only acceptance removed; successful exact fixture-native linkage preserved and exercised" }
  adjacent_tests: { result: pass, suites_run: [task-gsd-readiness, task-intake-continuity, task-contract, task-gsd-lifecycle] }
  revert_and_reconfirm: { result: pass, bug_returned_on_revert: true, fixed_on_reapply: true }
  guardrail_verdict: accepted
files_changed: [src/core/task-bootstrap.ts, src/core/task-bootstrap-store.ts, src/core/task-bootstrap-session.ts, src/core/task-bootstrap-evidence.ts, schemas/task-bootstrap.schema.json, test/task-bootstrap-blockers.test.ts, test/task-bootstrap-resume.test.ts, test/task-bootstrap-cli.test.ts, test/task-bootstrap-acceptance.test.ts, test/task-bootstrap-handoff.test.ts, test/task-bootstrap-recovery.test.ts, test/helpers/task-bootstrap-evidence.ts]
limitations: Fresh live-native evidence and final full suite/CI/source-bound ledger are root-owned and unclaimed. Native workflows lacking a committed exact PLAN/binding remain explicitly blocked; bootstrap does not manufacture commits, receipts, migration evidence or lifecycle artifacts.
commit: e0d9d8da9723441e24f690d1138dfb74b041effa (fix/bootstrap-release-060, 12 files; isolated worktree clean)
recovery_backup: Exact source-only guardrail stash 1f64c9b7b593d4f4d018298724fb8566c80b6033 is retained; its changes were reapplied and committed. Do not apply again to integrated source.

## Follow-up: command-job cancellation publication/consumption race

Authorized isolated scope: command-jobs.ts, command-job-worker.ts and focused command-job/efficient-wait tests. Root supplied independent macOS CI cancellation ENOENT after publisher rename. Native execution here is credential-free Node fixture children only; no paid model or full suite.

Current Focus:
  bug_class: concurrency (atomicity/order violation)
  hypothesis: Worker removes the consumed cancel.request before the publisher finishes its post-rename inode checks because publication/consumption do not share the per-job writer.
  test: Hold public cancelCommandJob at write:after-rename while a real owned child aborts and worker proceeds to cleanup; original code removes marker before publisher identity assertions.
  expecting: Original ENOENT lstat cancel.request, while a shared writer forces cleanup to observe contention until publication finishes.
  next_action: Capture causal red test, then serialize fresh record read/publication and identity-fenced marker consumption; release writer before terminal updateJobRecord/wait.
  reasoning_checkpoint:
    hypothesis: Independent publisher/consumer mutate the same marker without one held job lock, causing valid owned consumption to violate publisher inode assertions.
    confirming_evidence: cancelCommandJob calls writeAtomicPrivateFile outside withJobWriteLock; worker unlinks verified marker outside that lock; post-rename assertions require target inode to remain present.
    falsification_test: Deterministic real-child barrier never removes marker during held publication, or same writer already spans both operations.
    fix_rationale: Preserve inode/ancestor guards while ordering publication before verified owned removal under existing per-job lock; no nested updateJobRecord lock.
    blind_spots: Native OS timing differs; deterministic fixture establishes ordering, while actual macOS final CI remains root-owned.
    candidate_causes: code — marker consumption outside publisher's critical section; environment — fast child termination on macOS narrows publication/cleanup interleaving; data — foreign replacement marker must remain untouched.
    and_gate: yes, competing worker cleanup plus unlocked publication are jointly required; shared lock addresses both sides and identity revalidation protects replacement data.
